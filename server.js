const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());

// เชื่อมต่อ MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://footballcggg1234_db_user:rungradit@cluster3.fs13hoe.mongodb.net/?appName=Cluster3';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- Schemas ---
const candidateSchema = new mongoose.Schema({
    id: Number,
    name: String,
    votes: { type: Number, default: 0 }
});
const Candidate = mongoose.model('Candidate', candidateSchema);

const stationSchema = new mongoose.Schema({
    id: Number,
    isLocked: { type: Boolean, default: false }
});
const Station = mongoose.models.Station || mongoose.model('Station', stationSchema);

// --- Init Data (แก้ใหม่: ลบเบอร์ 3 ทิ้ง) ---
async function initDB() {
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

    // 🔥 เพิ่มคำสั่งลบ Station 3 ออกจากฐานข้อมูล (ถ้ามีค้างอยู่)
    await Station.deleteOne({ id: 3 });
    console.log('🗑️ Removed Station 3');

    // สร้างแค่ 1 กับ 2 ถ้ายังไม่มี
    const count = await Station.countDocuments();
    if (count === 0) {
        await Station.create([
            { id: 1, isLocked: false },
            { id: 2, isLocked: false }
        ]);
        console.log('✅ Created Station 1 & 2');
    }
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));

// --- Socket Logic ---
io.on('connection', async (socket) => {
    // ส่งข้อมูล Station ที่เหลือ (1, 2) ไปหน้าเว็บ
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

    socket.on('submit_vote', async (data) => {
        let candidateId = (typeof data === 'object') ? data.candidateId : data;
        if (candidateId !== undefined) {
            await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
        }
        const allCandidates = await Candidate.find();
        const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
        io.emit('data_update', { candidates: allCandidates, totalVotes: total });
    });

    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: false });
        // บังคับส่งข้อมูลใหม่ เพื่อลบ Station 3 ที่อาจค้างในหน้าจอ
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('init_data', { stations, candidates, totalVotes: 0 });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));