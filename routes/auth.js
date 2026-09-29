const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.get('/status', (req, res) => {
  const initialized = database.isSystemInitialized() || database.adminExists();
  res.json({
    initialized: initialized,
    hasAdmin: database.adminExists(),
    needsSetup: !initialized && !database.adminExists()
  });
});

router.post('/setup', (req, res) => {
  if (database.isSystemInitialized() || database.adminExists()) {
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
  try {
    const adminId = database.createFirstAdmin(username, password, fullName, email);
    database.markSystemInitialized();
    res.json({ success: true, message: 'Admin created', adminId: adminId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

router.post('/login', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = database.db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.fullName = user.full_name;
  authMiddleware.logSession(user.id, req.session.id, req.ip, req.get('user-agent'));
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
});

router.post('/logout', (req, res) => {
  if (req.session) authMiddleware.removeSession(req.session.id);
  req.session.destroy(function(err) {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = database.db.prepare(
    'SELECT id, username, role, full_name, email, phone, license_number, total_hours, created_at FROM users WHERE id = ?'
  ).get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: user });
});

module.exports = router;
