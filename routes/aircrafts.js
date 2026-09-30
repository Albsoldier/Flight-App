const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const database = require('../database');
const authMiddleware = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'aircraft');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function(req, file, cb) { cb(null, uuid.v4() + path.extname(file.originalname)); }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.indexOf(file.mimetype) !== -1) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.use(authMiddleware.isAuthenticated);

// LIST ALL AIRCRAFT — everyone
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

// GET SINGLE — everyone
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

// SERVE PHOTO — everyone
router.get('/:id/photo', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT photo_filename FROM aircraft WHERE id = ?',
      args: [req.params.id]
    });
    const row = result.rows[0];
    if (!row || !row.photo_filename) return res.status(404).send('No photo');
    const filePath = path.join(UPLOAD_DIR, row.photo_filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// CREATE — admin only
router.post('/', authMiddleware.isAdmin, upload.single('photo'), async function(req, res) {
  try {
    const tailNumber = (req.body.tail_number || '').trim().toUpperCase();
    const model = (req.body.model || '').trim();
    const description = req.body.description || null;
    const hourlyRate = parseFloat(req.body.hourly_rate) || 1500;
    const isAvailable = req.body.is_available === 'false' ? 0 : 1;

    if (!tailNumber || !model) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Tail number and model are required' });
    }

    const photoFilename = req.file ? req.file.filename : null;

    const result = await database.db.execute({
      sql: 'INSERT INTO aircraft (tail_number, model, description, hourly_rate, photo_filename, is_available, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [tailNumber, model, description, hourlyRate, photoFilename, isAvailable, req.session.userId]
    });

    res.json({ success: true, aircraftId: Number(result.lastInsertRowid) });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.message && err.message.indexOf('UNIQUE') !== -1) {
      return res.status(400).json({ error: 'Tail number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create aircraft' });
  }
});

// UPDATE — admin only
router.put('/:id', authMiddleware.isAdmin, upload.single('photo'), async function(req, res) {
  try {
    const id = req.params.id;
    const existing = await database.db.execute({
      sql: 'SELECT * FROM aircraft WHERE id = ?',
      args: [id]
    });
    if (!existing.rows[0]) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    const updates = [];
    const args = [];

    if (req.body.tail_number !== undefined) {
      updates.push('tail_number = ?');
      args.push(req.body.tail_number.trim().toUpperCase());
    }
    if (req.body.model !== undefined) {
      updates.push('model = ?');
      args.push(req.body.model.trim());
    }
    if (req.body.description !== undefined) {
      updates.push('description = ?');
      args.push(req.body.description);
    }
    if (req.body.hourly_rate !== undefined) {
      updates.push('hourly_rate = ?');
      args.push(parseFloat(req.body.hourly_rate) || 1500);
    }
    if (req.body.is_available !== undefined) {
      updates.push('is_available = ?');
      args.push(req.body.is_available === 'false' ? 0 : 1);
    }
    if (req.file) {
      // Delete old photo
      if (existing.rows[0].photo_filename) {
        const oldPath = path.join(UPLOAD_DIR, existing.rows[0].photo_filename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updates.push('photo_filename = ?');
      args.push(req.file.filename);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

    args.push(id);
    await database.db.execute({
      sql: 'UPDATE aircraft SET ' + updates.join(', ') + ' WHERE id = ?',
      args: args
    });
    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Failed to update aircraft' });
  }
});

// DELETE — admin only
router.delete('/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT * FROM aircraft WHERE id = ?',
      args: [req.params.id]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Aircraft not found' });

    if (row.photo_filename) {
      const photoPath = path.join(UPLOAD_DIR, row.photo_filename);
      if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
    }

    await database.db.execute({ sql: 'DELETE FROM aircraft WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete aircraft' });
  }
});

module.exports = router;
