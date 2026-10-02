const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const uuid = require('uuid');
const database = require('../database');
const authMiddleware = require('../middleware/auth');
const r2 = require('../r2-storage');

// Use memory storage — we'll push to R2 instead of local disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(authMiddleware.isAuthenticated);

// LIST
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

// UPLOAD
router.post('/', authMiddleware.isInstructor, upload.single('file'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const title = req.body.title;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    const fileKey = 'materials/' + uuid.v4() + path.extname(req.file.originalname);

    await r2.uploadFile(fileKey, req.file.buffer, req.file.mimetype);

    const result = await database.db.execute({
      sql: 'INSERT INTO study_materials (title, description, file_name, file_path, file_size, mime_type, category, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        title,
        req.body.description || null,
        req.file.originalname,
        fileKey,            // store the R2 key as file_path
        req.file.size,
        req.file.mimetype,
        req.body.category || 'General',
        req.session.userId
      ]
    });

    res.json({ success: true, materialId: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload' });
  }
});

// DOWNLOAD — generates a signed URL and redirects
router.get('/:id/download', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT * FROM study_materials WHERE id = ?',
      args: [req.params.id]
    });
    const material = result.rows[0];
    if (!material) return res.status(404).json({ error: 'Not found' });

    const signedUrl = await r2.getSignedDownloadUrl(material.file_path, 300);
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// DELETE
router.delete('/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT * FROM study_materials WHERE id = ?',
      args: [req.params.id]
    });
    const material = result.rows[0];
    if (!material) return res.status(404).json({ error: 'Not found' });

    try { await r2.deleteFile(material.file_path); } catch (e) { /* ignore */ }

    await database.db.execute({
      sql: 'DELETE FROM study_materials WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
