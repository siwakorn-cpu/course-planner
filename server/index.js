// ============================================================
// Backend API — เก็บข้อมูลทั้งหมดของแอป (AppData) ไว้ที่ฐานข้อมูลกลาง
// เก็บเป็น JSONB ก้อนเดียวต่อ 1 workspace (ตรงกับโครงข้อมูลของแอป)
// ใช้กับ PostgreSQL (เช่น Aiven for PostgreSQL)
// ============================================================
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ ต้องตั้งค่า environment variable: DATABASE_URL (connection string ของ Aiven/PostgreSQL)');
  process.exit(1);
}

// Aiven บังคับใช้ SSL — ค่าเริ่มต้นเปิด SSL แบบไม่ตรวจใบรับรอง (ตั้ง PGSSL=disable เพื่อปิดตอน dev)
const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
});

const WORKSPACE = process.env.WORKSPACE_ID || 'default';
const API_TOKEN = process.env.API_TOKEN || ''; // ถ้าตั้งค่า จะต้องส่ง header: Authorization: Bearer <token>

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✅ ตาราง app_state พร้อมใช้งาน');
}

const app = express();
app.use(cors()); // อนุญาตให้ frontend คนละโดเมนเรียกได้
app.use(express.json({ limit: '20mb' }));

function auth(req, res, next) {
  if (!API_TOKEN) return next();
  if ((req.get('authorization') || '') === `Bearer ${API_TOKEN}`) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ดึงข้อมูลทั้งหมด (คืน data: null ถ้ายังไม่มี)
app.get('/api/data', auth, async (_req, res) => {
  try {
    const r = await pool.query('SELECT data, updated_at FROM app_state WHERE id = $1', [WORKSPACE]);
    if (r.rowCount === 0) return res.json({ data: null });
    res.json({ data: r.rows[0].data, updatedAt: r.rows[0].updated_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'อ่านฐานข้อมูลไม่สำเร็จ' });
  }
});

// บันทึกข้อมูลทั้งหมด (upsert)
app.put('/api/data', auth, async (req, res) => {
  try {
    const data = req.body && req.body.data !== undefined ? req.body.data : req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    await pool.query(
      `INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [WORKSPACE, data],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'บันทึกฐานข้อมูลไม่สำเร็จ' });
  }
});

const port = process.env.PORT || 3001;
init()
  .then(() => app.listen(port, () => console.log(`🚀 API ทำงานที่พอร์ต ${port} · workspace=${WORKSPACE}`)))
  .catch((e) => {
    console.error('❌ เริ่มต้นเซิร์ฟเวอร์ไม่สำเร็จ:', e);
    process.exit(1);
  });
