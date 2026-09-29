const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const database = require('../database');
const authMiddleware = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'materials');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function(req, file, cb) {
    cb(null, uuid.v4() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(authMiddleware.isAuthenticated);

router.get('/', function(req, res) {
  const materials = database.db.prepare(
    'SELECT sm.*, u.full_name AS uploader_name FROM study_materials sm LEFT JOIN users u ON sm.uploaded_by = u.id ORDER BY sm.created_at DESC'
  ).all();
  res.json({ materials: materials });
});

router.post('/', authMiddleware.isInstructor, upload.single('file'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const title = req.body.title;
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Title required' });
  }

  try {
    const result = database.db.prepare(
      'INSERT INTO study_materials (title, description, file_name, file_path, file_size, mime_type, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(title, req.body.description || null, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype, req.body.category || 'General', req.session.userId);
    res.json({ success: true, materialId: result.lastInsertRowid });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

router.get('/:id/download', function(req, res) {
  const material = database.db.prepare('SELECT * FROM study_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOAD_DIR, material.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  res.download(filePath, material.file_name);
});

router.delete('/:id', function(req, res) {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const material = database.db.prepare('SELECT * FROM study_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(UPLOAD_DIR, material.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  database.db.prepare('DELETE FROM study_materials WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
