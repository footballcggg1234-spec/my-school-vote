const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors'); // แนะนำให้เพิ่มกันเหนียว

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // อนุญาตให้เชื่อมต่อจากทุกที่
});

app.use(cors());

// --- จุดสำคัญที่แก้: ใช้ค่าจาก Render (process.env) หรือใช้ของเครื่องถ้าไม่มี ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://footballcggg1234_db_user:rungradit@cluster3.fs13hoe.mongodb.net/?appName=Cluster3';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ... (ส่วน Schema และ Logic อื่นๆ เหมือนเดิม ไม่ต้องแก้) ...

const candidateSchema = new mongoose.Schema({
    id: Number,
    name: String,
    votes: { type: Number, default: 0 }
});
const Candidate = mongoose.model('Candidate', candidateSchema);

const systemStateSchema = new mongoose.Schema({
    isLocked: { type: Boolean, default: true }
});
const SystemState = mongoose.model('SystemState', systemStateSchema);

async function initDB() {
    // ... (เหมือนเดิม) ...
    const candidates = [
        { id: 1, name: 'พรรคเรียนดี' },
        { id: 2, name: 'พรรคกิจกรรม' },
        { id: 3, name: 'พรรคสามัคคี' },
        { id: 0, name: 'ไม่ประสงค์ลงคะแนน' }
    ];
    for (const c of candidates) {
        const exist = await Candidate.findOne({ id: c.id });
        if (!exist) await Candidate.create({ id: c.id, name: c.name, votes: 0 });
    }
    if (await Station.countDocuments() === 0) {
        await Station.create([{ id: 1 }, { id: 2 }, { id: 3 }]);
    }
    const state = await SystemState.findOne();
    if (!state) await SystemState.create({ isLocked: true });
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));

const Station = mongoose.model('Station', new mongoose.Schema({ id: Number, isLocked: { type: Boolean, default: true } }));

io.on('connection', async (socket) => {
    const stations = await Station.find().sort({id: 1});
    const candidates = await Candidate.find();
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

    socket.emit('init_data', { stations, candidates, totalVotes });

    socket.on('admin_unlock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: false });
        io.emit('station_update', { id, isLocked: false });
    });

    socket.on('admin_lock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: true });
        io.emit('station_update', { id, isLocked: true });
    });

    socket.on('submit_vote', async ({ candidateId, stationId }) => {
        const st = await Station.findOne({ id: stationId });
        if (!st || st.isLocked) return;

        await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
        await Station.updateOne({ id: stationId }, { isLocked: true });

        const all = await Candidate.find();
        const total = all.reduce((sum, c) => sum + c.votes, 0);
        
        io.emit('station_update', { id: stationId, isLocked: true });
        io.emit('data_update', { candidates: all, totalVotes: total });
    });

    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: true });
        io.emit('reset_all');
    });
});

// --- แก้ Port เป็น process.env.PORT ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));