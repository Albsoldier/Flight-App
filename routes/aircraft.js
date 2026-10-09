const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const uuid = require('uuid');
const database = require('../database');
const authMiddleware = require('../middleware/auth');
const r2 = require('../r2-storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.indexOf(file.mimetype) !== -1) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.use(authMiddleware.isAuthenticated);

// LIST ALL
router.get('/', async function(req, res) {
  try {
    const result = await database.db.execute(
      'SELECT * FROM aircraft ORDER BY is_available DESC, tail_number ASC'
    );
    res.json({ aircraft: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE
router.get('/:id', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT * FROM aircraft WHERE id = ?',
      args: [req.params.id]
    });
    if (!result.rows[0]) return res.status(404).json({ error: 'Aircraft not found' });
    res.json({ aircraft: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// SERVE PHOTO — redirects to signed R2 URL
router.get('/:id/photo', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT photo_filename FROM aircraft WHERE id = ?',
      args: [req.params.id]
    });
    const row = result.rows[0];
    if (!row || !row.photo_filename) return res.status(404).send('No photo');

    const signedUrl = await r2.getSignedDownloadUrl(row.photo_filename, 3600);
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// CREATE
router.post('/', authMiddleware.isAdmin, upload.single('photo'), async function(req, res) {
  try {
    const tailNumber = (req.body.tail_number || '').trim().toUpperCase();
    const model = (req.body.model || '').trim();
    const description = req.body.description || null;
    const hourlyRate = parseFloat(req.body.hourly_rate) || 1500;
    const isAvailable = req.body.is_available === 'false' ? 0 : 1;

    if (!tailNumber || !model) {
      return res.status(400).json({ error: 'Tail number and model are required' });
    }

    let photoKey = null;
    if (req.file) {
      photoKey = 'aircraft/' + uuid.v4() + path.extname(req.file.originalname);
      await r2.uploadFile(photoKey, req.file.buffer, req.file.mimetype);
    }

    const result = await database.db.execute({
      sql: 'INSERT INTO aircraft (tail_number, model, description, hourly_rate, photo_filename, is_available, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [tailNumber, model, description, hourlyRate, photoKey, isAvailable, req.session.userId]
    });

    res.json({ success: true, aircraftId: Number(result.lastInsertRowid) });
  } catch (err) {
    if (err.message && err.message.indexOf('UNIQUE') !== -1) {
      return res.status(400).json({ error: 'Tail number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create aircraft' });
  }
});

// UPDATE
router.put('/:id', authMiddleware.isAdmin, upload.single('photo'), async function(req, res) {
  try {
    const id = req.params.id;
    const existing = await database.db.execute({
      sql: 'SELECT * FROM aircraft WHERE id = ?',
      args: [id]
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Aircraft not found' });

    const updates = [];
    const args = [];

    if (req.body.tail_number !== undefined) { updates.push('tail_number = ?'); args.push(req.body.tail_number.trim().toUpperCase()); }
    if (req.body.model !== undefined) { updates.push('model = ?'); args.push(req.body.model.trim()); }
    if (req.body.description !== undefined) { updates.push('description = ?'); args.push(req.body.description); }
    if (req.body.hourly_rate !== undefined) { updates.push('hourly_rate = ?'); args.push(parseFloat(req.body.hourly_rate) || 1500); }
    if (req.body.is_available !== undefined) { updates.push('is_available = ?'); args.push(req.body.is_available === 'false' ? 0 : 1); }

    if (req.file) {
      // Delete old photo from R2
      if (existing.rows[0].photo_filename) {
        try { await r2.deleteFile(existing.rows[0].photo_filename); } catch (e) { /* ignore */ }
      }
      const photoKey = 'aircraft/' + uuid.v4() + path.extname(req.file.originalname);
      await r2.uploadFile(photoKey, req.file.buffer, req.file.mimetype);
      updates.push('photo_filename = ?');
      args.push(photoKey);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

    args.push(id);
    await database.db.execute({
      sql: 'UPDATE aircraft SET ' + updates.join(', ') + ' WHERE id = ?',
      args: args
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update aircraft' });
  }
});

// DELETE
router.delete('/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT * FROM aircraft WHERE id = ?',
      args: [req.params.id]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Aircraft not found' });

    if (row.photo_filename) {
      try { await r2.deleteFile(row.photo_filename); } catch (e) { /* ignore */ }
    }

    await database.db.execute({ sql: 'DELETE FROM aircraft WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete aircraft' });
  }
});

module.exports = router;
