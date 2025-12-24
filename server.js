// server.js (ฉบับแก้ไข: รองรับ 3 เครื่อง + แก้บั๊กคะแนนไม่ขึ้น)
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

// เชื่อมต่อ MongoDB (ใช้ค่าจาก Render หรือ Localhost)
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
    isLocked: { type: Boolean, default: true }
});
// ป้องกัน Error หาก Model ถูกสร้างไปแล้ว
const Station = mongoose.models.Station || mongoose.model('Station', stationSchema);

// --- Init Data ---
async function initDB() {
    const candidates = [
        { id: 1, name: 'พรรคเรียนดี' },
        { id: 2, name: 'พรรคกิจกรรม' },
        { id: 3, name: 'พรรคสามัคคี' },
        { id: 0, name: 'ไม่ประสงค์ลงคะแนน' }
    ];

    for (const c of candidates) {
        const exist = await Candidate.findOne({ id: c.id });
        if (!exist) {
            await Candidate.create({ id: c.id, name: c.name, votes: 0 });
            console.log(`Created Candidate #${c.id}`);
        }
    }

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
    // 1. ส่งข้อมูลเริ่มต้นเมื่อมีคนเข้าเว็บ
    const stations = await Station.find().sort({id: 1});
    const candidates = await Candidate.find();
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

    socket.emit('init_data', { stations, candidates, totalVotes });

    // 2. Admin สั่งปลดล็อก/ล็อก
    socket.on('admin_unlock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: false });
        io.emit('station_update', { id, isLocked: false });
    });

    socket.on('admin_lock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: true });
        io.emit('station_update', { id, isLocked: true });
    });

    // 3. รับคะแนนโหวต (จุดสำคัญที่แก้!)
    socket.on('submit_vote', async (data) => {
        console.log("Vote received:", data); // ดู Log ว่ามีข้อมูลมาไหม

        // รองรับทั้งแบบส่งมาแค่ ID (เผื่อโค้ดเก่า) หรือส่งมาเป็น Object
        let candidateId, stationId;
        
        if (typeof data === 'object') {
            candidateId = data.candidateId;
            stationId = data.stationId;
        } else {
            candidateId = data; // กรณีส่งมาแค่ตัวเลข
        }

        // บันทึกคะแนน
        if (candidateId !== undefined) {
            await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
            console.log(`✅ Vote counted for candidate #${candidateId}`);
        }

        // ล็อกเครื่อง (ถ้ามี stationId)
        if (stationId) {
            await Station.updateOne({ id: stationId }, { isLocked: true });
            io.emit('station_update', { id: stationId, isLocked: true });
        }

        // อัปเดตคะแนนให้ทุกจอ
        const allCandidates = await Candidate.find();
        const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
        io.emit('data_update', { candidates: allCandidates, totalVotes: total });
    });

    // 4. รีเซ็ตระบบ
    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: true });
        
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('init_data', { stations, candidates, totalVotes: 0 });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));