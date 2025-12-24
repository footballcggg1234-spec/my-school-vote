// server.js (รองรับ 3 เครื่อง + สร้างให้อัตโนมัติถ้าหายไป)
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

// ใช้ Database เดิมของคุณ
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://footballcggg1234_db_user:rungradit@cluster3.fs13hoe.mongodb.net/?appName=Cluster3';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- Schema ---
const candidateSchema = new mongoose.Schema({
    id: Number,
    name: String,
    votes: { type: Number, default: 0 }
});
const Candidate = mongoose.model('Candidate', candidateSchema);

const stationSchema = new mongoose.Schema({
    id: Number,
    isLocked: { type: Boolean, default: false } // เริ่มต้นเป็นไม่ล็อก
});
// ป้องกัน Error หาก Model ถูกสร้างซ้ำ
const Station = mongoose.models.Station || mongoose.model('Station', stationSchema);

// --- Init Data (ทำให้มี 3 เครื่องแน่นอน) ---
async function initDB() {
    // 1. สร้างผู้สมัคร
    const candidates = [
        { id: 1, name: 'พรรคพรรคภิญโญราช' },
        { id: 2, name: 'พรรคพรรคราชรุ่งโรจน์' },
        { id: 3, name: 'พรรคพรรคราชภิวัฒน์' },
        { id: 0, name: 'ไม่ประสงค์ลงคะแนน' }
    ];
    for (const c of candidates) {
        // ใช้ upsert: true (ถ้าไม่มีให้สร้างใหม่, ถ้ามีให้อัปเดต)
        await Candidate.updateOne({ id: c.id }, { name: c.name }, { upsert: true });
    }

    // 2. สร้างเครื่องโหวต 3 เครื่อง (Station 1, 2, 3)
    // ใช้ loop เพื่อเช็คทีละเครื่อง ถ้าเครื่องไหนหายไปให้สร้างใหม่
    for (let i = 1; i <= 3; i++) {
        const exist = await Station.findOne({ id: i });
        if (!exist) {
            await Station.create({ id: i, isLocked: false });
            console.log(`✅ Created Station ${i}`);
        }
    }
    console.log('✅ System Ready: 3 Stations Available');
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));

// --- Socket Logic ---
io.on('connection', async (socket) => {
    // ส่งข้อมูล Station ทั้งหมด (เรียงตาม id)
    const stations = await Station.find().sort({id: 1});
    const candidates = await Candidate.find();
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

    socket.emit('init_data', { stations, candidates, totalVotes });

    // Admin สั่งล็อก/ปลดล็อก
    socket.on('admin_unlock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: false });
        io.emit('station_update', { id, isLocked: false });
    });

    socket.on('admin_lock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: true });
        io.emit('station_update', { id, isLocked: true });
    });

    // รับคะแนนโหวต (แบบไม่ล็อกอัตโนมัติ ตามที่ขอ)
    socket.on('submit_vote', async (data) => {
        let candidateId = (typeof data === 'object') ? data.candidateId : data;
        
        if (candidateId !== undefined) {
            await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
            console.log(`✅ Vote counted: Candidate #${candidateId}`);
        }

        // อัปเดตคะแนนให้ทุกจอ
        const allCandidates = await Candidate.find();
        const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
        io.emit('data_update', { candidates: allCandidates, totalVotes: total });
    });

    // รีเซ็ตระบบ
    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: false });
        
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('init_data', { stations, candidates, totalVotes: 0 });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));