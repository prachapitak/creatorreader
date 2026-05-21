const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3333;

// Storage paths — self-contained within this app
const PROMPTS_DIR = path.join(__dirname, 'public', 'prompts');
const ASSETS_DIR = path.join(__dirname, 'public', 'assets');

// Ensure directories exist
[PROMPTS_DIR, ASSETS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeName(str) {
  return str.replace(/[^a-zA-Z0-9_\-ก-ๆเแโใไ่้๊๋็์ํ๎๏฿]/g, '_');
}

// ─── Multer: .md upload ───────────────────────────────────────────────────────
const mdStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROMPTS_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const mdUpload = multer({
  storage: mdStorage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.md')) cb(null, true);
    else cb(new Error('Only .md files allowed'));
  }
});

// ─── Multer: image upload ─────────────────────────────────────────────────────
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { pack, scene } = req.params;
    const dir = path.join(ASSETS_DIR, pack, scene, 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${safeName(base)}_${Date.now()}${ext}`);
  }
});
const imageUpload = multer({ storage: imageStorage });

// ─── Multer: video upload ─────────────────────────────────────────────────────
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { pack, scene } = req.params;
    const dir = path.join(ASSETS_DIR, pack, scene, 'videos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${safeName(base)}_${Date.now()}${ext}`);
  }
});
const videoUpload = multer({ storage: videoStorage });

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET /api/files — list .md files newest first
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(PROMPTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const stat = fs.statSync(path.join(PROMPTS_DIR, f));
        return { name: f, mtime: stat.mtime.getTime() };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .map(f => f.name);
    res.json({ files });
  } catch (e) {
    res.json({ files: [] });
  }
});

// GET /api/file/:filename — get .md content
app.get('/api/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Invalid filename' });
  const filePath = path.join(PROMPTS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ content });
});

// POST /api/file/:filename — save edited .md content
app.post('/api/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.md')) return res.status(400).json({ error: 'Invalid filename' });
  const filePath = path.join(PROMPTS_DIR, filename);
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'No content provided' });
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ ok: true });
});

// POST /api/upload-md — upload new .md file
app.post('/api/upload-md', mdUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ ok: true, filename: req.file.filename });
});

// GET /api/assets/:pack — list all assets
app.get('/api/assets/:pack', (req, res) => {
  const packDir = path.join(ASSETS_DIR, req.params.pack);
  const result = {};
  if (!fs.existsSync(packDir)) return res.json(result);

  try {
    const scenes = fs.readdirSync(packDir).filter(s => /^scene\d+$/.test(s));
    scenes.forEach(scene => {
      result[scene] = { images: [], videos: [] };
      const imgDir = path.join(packDir, scene, 'images');
      const vidDir = path.join(packDir, scene, 'videos');
      if (fs.existsSync(imgDir)) result[scene].images = fs.readdirSync(imgDir).filter(f => !f.startsWith('.'));
      if (fs.existsSync(vidDir)) result[scene].videos = fs.readdirSync(vidDir).filter(f => !f.startsWith('.'));
    });
  } catch (e) {
    console.error('Error reading assets:', e.message);
  }
  res.json(result);
});

// POST /api/assets/:pack/:scene/images — upload images
app.post('/api/assets/:pack/:scene/images', imageUpload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  res.json({ ok: true, files: req.files.map(f => f.filename) });
});

// POST /api/assets/:pack/:scene/videos — upload videos
app.post('/api/assets/:pack/:scene/videos', videoUpload.array('videos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });
  res.json({ ok: true, files: req.files.map(f => f.filename) });
});

// GET /api/assets/:pack/:scene/images/:filename — serve image
app.get('/api/assets/:pack/:scene/images/:filename', (req, res) => {
  const filePath = path.join(ASSETS_DIR, req.params.pack, req.params.scene, 'images', path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// GET /api/assets/:pack/:scene/videos/:filename — serve video
app.get('/api/assets/:pack/:scene/videos/:filename', (req, res) => {
  const filePath = path.join(ASSETS_DIR, req.params.pack, req.params.scene, 'videos', path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// DELETE /api/assets/:pack/:scene/images/:filename
app.delete('/api/assets/:pack/:scene/images/:filename', (req, res) => {
  const filePath = path.join(ASSETS_DIR, req.params.pack, req.params.scene, 'images', path.basename(req.params.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// DELETE /api/assets/:pack/:scene/videos/:filename
app.delete('/api/assets/:pack/:scene/videos/:filename', (req, res) => {
  const filePath = path.join(ASSETS_DIR, req.params.pack, req.params.scene, 'videos', path.basename(req.params.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`TikTok Content Manager running at http://localhost:${PORT}`);
  console.log(`Prompts: ${PROMPTS_DIR}`);
  console.log(`Assets:  ${ASSETS_DIR}`);
});
