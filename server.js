// server.js (รองรับ 3 พรรค)
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// เชื่อมต่อ MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/school_vote')
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
    isLocked: { type: Boolean, default: true }
});
const Station = mongoose.model('Station', stationSchema);

// --- Init Data (แก้ใหม่: เช็กทีละตัวเลยว่ามีครบไหม) ---
async function initDB() {
    // รายชื่อพรรคที่ต้องการ
    const candidates = [
        { id: 1, name: 'พรรคเรียนดี' },
        { id: 2, name: 'พรรคกิจกรรม' },
        { id: 3, name: 'พรรคสามัคคี' }, // <--- เพิ่มพรรคที่ 3 ตรงนี้
        { id: 0, name: 'ไม่ประสงค์ลงคะแนน' }
    ];

    for (const c of candidates) {
        const exist = await Candidate.findOne({ id: c.id });
        if (!exist) {
            await Candidate.create({ id: c.id, name: c.name, votes: 0 });
            console.log(`Created Candidate #${c.id}`);
        }
    }

    // สร้างเครื่องโหวต 3 เครื่อง
    if (await Station.countDocuments() === 0) {
        await Station.create([
            { id: 1, isLocked: true },
            { id: 2, isLocked: true },
            { id: 3, isLocked: true }
        ]);
        console.log('✅ Created 3 Stations');
    }
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));

// --- Socket Logic ---
io.on('connection', async (socket) => {
    // ส่งข้อมูลเริ่มต้น
    const stations = await Station.find().sort({id: 1});
    const candidates = await Candidate.find();
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

    socket.emit('init_data', { stations, candidates, totalVotes });

    // Admin Action
    socket.on('admin_unlock_station', async (stationId) => {
        await Station.updateOne({ id: stationId }, { isLocked: false });
        io.emit('station_update', { id: stationId, isLocked: false });
    });

    socket.on('admin_lock_station', async (stationId) => {
        await Station.updateOne({ id: stationId }, { isLocked: true });
        io.emit('station_update', { id: stationId, isLocked: true });
    });

    // Vote Action
    socket.on('submit_vote', async ({ candidateId, stationId }) => {
        const st = await Station.findOne({ id: stationId });
        if (!st || st.isLocked) return;

        await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
        await Station.updateOne({ id: stationId }, { isLocked: true });

        const allCandidates = await Candidate.find();
        const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
        
        io.emit('station_update', { id: stationId, isLocked: true });
        io.emit('data_update', { candidates: allCandidates, totalVotes: total });
    });

    // Reset
    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: true });
        // ส่งค่ารีเซ็ตกลับไป
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('reset_all');
        // บังคับอัปเดตข้อมูลทันทีหลังรีเซ็ต
        io.emit('init_data', { stations, candidates, totalVotes: 0 });
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));