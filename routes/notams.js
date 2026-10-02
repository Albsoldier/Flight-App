const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// LIST ACTIVE NOTAMs — everyone
router.get('/', async function(req, res) {
  try {
    const result = await database.db.execute(
      "SELECT n.*, u.full_name AS author_name FROM notams n LEFT JOIN users u ON n.created_by = u.id WHERE n.is_active = 1 AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP) ORDER BY CASE n.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 WHEN 'caution' THEN 3 ELSE 4 END, n.created_at DESC"
    );
    res.json({ notams: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE — admin only
router.post('/', authMiddleware.isAdmin, async function(req, res) {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    const severity = req.body.severity || 'info';
    const expiresAt = req.body.expires_at || null;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body required' });
    }

    const result = await database.db.execute({
      sql: 'INSERT INTO notams (title, body, severity, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
      args: [title, body, severity, expiresAt, req.session.userId]
    });

    res.json({ success: true, notamId: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create NOTAM' });
  }
});

// UPDATE — admin only
router.put('/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    const updates = [];
    const args = [];

    if (req.body.title !== undefined) { updates.push('title = ?'); args.push(req.body.title); }
    if (req.body.body !== undefined) { updates.push('body = ?'); args.push(req.body.body); }
    if (req.body.severity !== undefined) { updates.push('severity = ?'); args.push(req.body.severity); }
    if (req.body.expires_at !== undefined) { updates.push('expires_at = ?'); args.push(req.body.expires_at); }
    if (req.body.is_active !== undefined) { updates.push('is_active = ?'); args.push(req.body.is_active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

    args.push(req.params.id);
    await database.db.execute({
      sql: 'UPDATE notams SET ' + updates.join(', ') + ' WHERE id = ?',
      args: args
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update NOTAM' });
  }
});

// DELETE — admin only
router.delete('/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM notams WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete NOTAM' });
  }
});

module.exports = router;
