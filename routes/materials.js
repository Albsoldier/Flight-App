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

router.get('/', async function(req, res) {
  try {
    const result = await database.db.execute(
      'SELECT sm.*, u.full_name AS uploader_name FROM study_materials sm LEFT JOIN users u ON sm.uploaded_by = u.id ORDER BY sm.created_at DESC'
    );
    res.json({ materials: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware.isInstructor, upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const title = req.body.title;
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Title required' });
  }

  try {
    const result = await database.db.execute({
      sql: 'INSERT INTO study_materials (title, description, file_name, file_path, file_size, mime_type, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [title, req.body.description || null, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype, req.body.category || 'General', req.session.userId]
    });
    res.json({ success: true, materialId: Number(result.lastInsertRowid) });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

router.get('/:id/download', async function(req, res) {
  try {
    const result = await database.db.execute({ sql: 'SELECT * FROM study_materials WHERE id = ?', args: [req.params.id] });
    const material = result.rows[0];
    if (!material) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, material.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
    res.download(filePath, material.file_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async function(req, res) {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const result = await database.db.execute({ sql: 'SELECT * FROM study_materials WHERE id = ?', args: [req.params.id] });
    const material = result.rows[0];
    if (!material) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(UPLOAD_DIR, material.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await database.db.execute({ sql: 'DELETE FROM study_materials WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
