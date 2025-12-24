// server.js (โหมด Kiosk: โหวตต่อเนื่อง ไม่ล็อก)
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

// ใช้ MongoDB Atlas หรือ Localhost
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
    isLocked: { type: Boolean, default: false } // Default เป็นไม่ล็อก
});
const Station = mongoose.models.Station || mongoose.model('Station', stationSchema);

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
    if (await Station.countDocuments() === 0) {
        // สร้าง 3 เครื่อง โดยสถานะเริ่มต้นคือ Unlock (false)
        await Station.create([
            { id: 1, isLocked: false },
            { id: 2, isLocked: false },
            { id: 3, isLocked: false }
        ]);
    }
}
initDB();

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', async (socket) => {
    const stations = await Station.find().sort({id: 1});
    const candidates = await Candidate.find();
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);

    socket.emit('init_data', { stations, candidates, totalVotes });

    // Admin สั่งล็อก/ปลดล็อก (ยังเก็บไว้เผื่อครูอยากปิดพักเบรก)
    socket.on('admin_unlock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: false });
        io.emit('station_update', { id, isLocked: false });
    });

    socket.on('admin_lock_station', async (id) => {
        await Station.updateOne({ id }, { isLocked: true });
        io.emit('station_update', { id, isLocked: true });
    });

    // --- รับคะแนนโหวต (แก้ตรงนี้: ตัดระบบล็อกทิ้ง) ---
    socket.on('submit_vote', async (data) => {
        let candidateId = (typeof data === 'object') ? data.candidateId : data;
        
        if (candidateId !== undefined) {
            await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
            console.log(`✅ Vote counted: #${candidateId}`);
        }

        // ❌ เอาบรรทัดที่สั่งล็อกเครื่องออก (Comment ไว้)
        // if (data.stationId) {
        //     await Station.updateOne({ id: data.stationId }, { isLocked: true });
        //     io.emit('station_update', { id: data.stationId, isLocked: true });
        // }

        const allCandidates = await Candidate.find();
        const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
        io.emit('data_update', { candidates: allCandidates, totalVotes: total });
    });

    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: false }); // รีเซ็ตเป็นเปิด
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('init_data', { stations, candidates, totalVotes: 0 });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));