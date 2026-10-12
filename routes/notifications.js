const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// Helper — used by other routes to create a notification
async function createNotification(db, userId, type, title, body, link) {
  try {
    const result = await db.execute({
      sql: 'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
      args: [userId, type, title, body || null, link || null]
    });
    return Number(result.lastInsertRowid);
  } catch (err) {
    console.error('createNotification error:', err);
    return null;
  }
}

// Helper — used by other routes to notify all users with a given role
async function createNotificationForRole(db, role, type, title, body, link) {
  try {
    const users = await db.execute({
      sql: 'SELECT id FROM users WHERE role = ? AND is_active = 1',
      args: [role]
    });
    for (const u of users.rows) {
      await createNotification(db, u.id, type, title, body, link);
    }
  } catch (err) {
    console.error('createNotificationForRole error:', err);
  }
}

// Helper — notify all staff (admin + instructor)
async function createNotificationForStaff(db, type, title, body, link) {
  try {
    const users = await db.execute({
      sql: "SELECT id FROM users WHERE role IN ('admin', 'instructor') AND is_active = 1",
      args: []
    });
    for (const u of users.rows) {
      await createNotification(db, u.id, type, title, body, link);
    }
  } catch (err) {
    console.error('createNotificationForStaff error:', err);
  }
}

// LIST MY NOTIFICATIONS (last 20)
router.get('/', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: `SELECT id, type, title, body, link, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20`,
      args: [req.session.userId]
    });

    const unreadResult = await database.db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0',
      args: [req.session.userId]
    });

    res.json({
      notifications: result.rows,
      unread: unreadResult.rows[0].c
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// UNREAD COUNT ONLY (for polling fallback)
router.get('/unread-count', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0',
      args: [req.session.userId]
    });
    res.json({ count: result.rows[0].c });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MARK ONE AS READ
router.post('/:id/read', async function(req, res) {
  try {
    await database.db.execute({
      sql: 'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.session.userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MARK ALL AS READ
router.post('/read-all', async function(req, res) {
  try {
    await database.db.execute({
      sql: 'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      args: [req.session.userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE ONE
router.delete('/:id', async function(req, res) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.session.userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CLEAR ALL
router.delete('/', async function(req, res) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM notifications WHERE user_id = ?',
      args: [req.session.userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.createNotificationForRole = createNotificationForRole;
module.exports.createNotificationForStaff = createNotificationForStaff;
