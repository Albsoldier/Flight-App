const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.get('/status', async function(req, res) {
  try {
    const initialized = (await database.isSystemInitialized()) || (await database.adminExists());
    const hasAdmin = await database.adminExists();
    res.json({
      initialized: initialized,
      hasAdmin: hasAdmin,
      needsSetup: !initialized && !hasAdmin
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/setup', async function(req, res) {
  try {
    if ((await database.isSystemInitialized()) || (await database.adminExists())) {
      return res.status(403).json({ error: 'System already initialized' });
    }
    const username = req.body.username;
    const password = req.body.password;
    const fullName = req.body.fullName;
    const email = req.body.email;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Username, password, and fullName required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const adminId = await database.createFirstAdmin(username, password, fullName, email);
    await database.markSystemInitialized();
    res.json({ success: true, message: 'Admin created', adminId: adminId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

router.post('/login', async function(req, res) {
  try {
    const username = req.body.username;
    const password = req.body.password;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const result = await database.db.execute({
      sql: 'SELECT * FROM users WHERE username = ? AND is_active = 1',
      args: [username]
    });
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.fullName = user.full_name;
    await authMiddleware.logSession(user.id, req.session.id, req.ip, req.get('user-agent'));
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async function(req, res) {
  if (req.session) await authMiddleware.removeSession(req.session.id);
  req.session.destroy(function(err) {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

router.get('/me', async function(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const result = await database.db.execute({
      sql: 'SELECT id, username, role, full_name, email, phone, license_number, total_hours, created_at FROM users WHERE id = ?',
      args: [req.session.userId]
    });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
