// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors()); // อนุญาตให้หน้าเว็บ (HTML) คุยกับ Server ได้
app.use(bodyParser.json());

// ----------------------------------------------------
// ⚠️ แก้ไขตรงนี้: เอา Link MongoDB ของคุณมาใส่ (Connection String)
// รูปแบบจะเป็น mongodb+srv://<user>:<password>@...
const MONGO_URI = "mongodb+srv://footballcggg1234_db_user:rungradit@cluster3.fs13hoe.mongodb.net/?appName=Cluster3";
// ----------------------------------------------------

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ DB Error:", err));

// --- สร้างโครงสร้างข้อมูล (Schema) ---
const CandidateSchema = new mongoose.Schema({
    id: String,
    name: String,
    votes: { type: Number, default: 0 }
});
const VoterSchema = new mongoose.Schema({
    studentId: String,
    votedAt: { type: Date, default: Date.now }
});

const Candidate = mongoose.model('Candidate', CandidateSchema);
const Voter = mongoose.model('Voter', VoterSchema);

// --- API: สำหรับหน้าโหวต ---
app.post('/api/vote', async (req, res) => {
    const { studentId, candidateId } = req.body;

    try {
        // 1. เช็คว่าโหวตซ้ำไหม
        const existingVoter = await Voter.findOne({ studentId });
        if (existingVoter) {
            return res.status(400).json({ message: "รหัสนี้ใช้สิทธิ์ไปแล้ว!" });
        }

        // 2. เช็คว่าระบบเปิดหรือยัง (มีผู้สมัครไหม)
        const candidate = await Candidate.findOne({ id: candidateId });
        if (!candidate) {
            return res.status(400).json({ message: "ไม่พบข้อมูลผู้สมัคร หรือระบบยังไม่ถูก Reset" });
        }

        // 3. บันทึกคนโหวต + บวกคะแนน (ทำพร้อมกัน)
        await Voter.create({ studentId });
        await Candidate.findOneAndUpdate({ id: candidateId }, { $inc: { votes: 1 } });

        res.json({ message: "โหวตสำเร็จ!" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- API: ดึงผลคะแนน (สำหรับ Admin) ---
app.get('/api/stats/admin', async (req, res) => {
    try {
        const candidates = await Candidate.find().sort({ votes: -1 });
        res.json(candidates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API: ดึงยอดรวม (สำหรับ Screen) ---
app.get('/api/stats/public', async (req, res) => {
    try {
        const candidates = await Candidate.find();
        const totalVotes = candidates.reduce((sum, item) => sum + item.votes, 0);
        res.json({ total_votes: totalVotes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API: รีเซ็ตระบบ (Setup) ---
app.post('/api/reset', async (req, res) => {
    try {
        // ลบข้อมูลเก่าทั้งหมด
        await Candidate.deleteMany({});
        await Voter.deleteMany({});

        // สร้างผู้สมัครใหม่ 2 คน
        await Candidate.create([
            { id: 'no1', name: 'เบอร์ 1 นายรักเรียน', votes: 0 },
            { id: 'no2', name: 'เบอร์ 2 นางสาวพัฒนา', votes: 0 }
        ]);

        res.json({ message: "Reset ระบบเรียบร้อย!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// เริ่ม Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});