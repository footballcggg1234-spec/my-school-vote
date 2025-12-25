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

// เพิ่ม Schema สำหรับเก็บประวัติการโหวต (Log)
const voteLogSchema = new mongoose.Schema({
    order: Number,          // ลำดับที่ (คนที่ 1, 2, 3...)
    candidateId: Number,    // เลือกเบอร์ไหน
    candidateName: String,  // ชื่อพรรค (จะได้ไม่ต้องไปหาทีหลัง)
    timestamp: { type: Date, default: Date.now }
});
const VoteLog = mongoose.model('VoteLog', voteLogSchema);

// --- Init Data ---
async function initDB() {
    const candidates = [
        { id: 1, name: 'พรรคภิญโญราช' },
        { id: 2, name: 'พรรคราชรุ่งโรจน์' },
        { id: 3, name: 'พรรคราชภิวัฒน์' },
        { id: 0, name: 'ไม่ประสงค์ลงคะแนน' }
    ];

    for (const c of candidates) {
        await Candidate.updateOne({ id: c.id }, { name: c.name }, { upsert: true });
    }

    for (let i = 1; i <= 3; i++) {
        const exist = await Station.findOne({ id: i });
        if (!exist) await Station.create({ id: i, isLocked: false });
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
    
    // ส่งประวัติการโหวตล่าสุด 50 คน ไปให้หน้าเว็บด้วย
    const recentLogs = await VoteLog.find().sort({ timestamp: -1 }).limit(50);

    socket.emit('init_data', { stations, candidates, totalVotes, recentLogs });

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
            // 1. บวกคะแนน
            await Candidate.updateOne({ id: candidateId }, { $inc: { votes: 1 } });
            
            // 2. บันทึก Log ว่าเป็น "คนที่เท่าไหร่"
            const currentTotal = await VoteLog.countDocuments();
            const voterOrder = currentTotal + 1;
            
            const candidateInfo = await Candidate.findOne({ id: candidateId });
            const logEntry = await VoteLog.create({
                order: voterOrder,
                candidateId: candidateId,
                candidateName: candidateInfo ? candidateInfo.name : 'Unknown'
            });

            console.log(`✅ Vote #${voterOrder}: Selected #${candidateId}`);

            // 3. ส่งข้อมูลใหม่ไปให้ทุกหน้าจอทันที
            const allCandidates = await Candidate.find();
            const total = allCandidates.reduce((sum, c) => sum + c.votes, 0);
            
            io.emit('data_update', { 
                candidates: allCandidates, 
                totalVotes: total,
                newLog: logEntry // ส่งข้อมูลคนล่าสุดไปด้วย
            });
        }
    });

    socket.on('admin_reset', async () => {
        await Candidate.updateMany({}, { votes: 0 });
        await Station.updateMany({}, { isLocked: false });
        await VoteLog.deleteMany({}); // ลบประวัติด้วย
        
        const stations = await Station.find().sort({id: 1});
        const candidates = await Candidate.find();
        io.emit('init_data', { stations, candidates, totalVotes: 0, recentLogs: [] });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));