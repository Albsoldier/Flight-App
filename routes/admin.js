const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

router.post('/users', authMiddleware.isInstructor, function(req, res) {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.role;
  const fullName = req.body.fullName;
  const email = req.body.email;
  const phone = req.body.phone;
  const licenseNumber = req.body.licenseNumber;

  if (!username || !password || !role || !fullName) {
    return res.status(400).json({ error: 'username, password, role, fullName required' });
  }
  if (role !== 'instructor' && role !== 'student') {
    return res.status(400).json({ error: 'role must be instructor or student' });
  }
  if (req.session.role === 'instructor' && role !== 'student') {
    return res.status(403).json({ error: 'Instructors can only create students' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashed = bcrypt.hashSync(password, 10);
    const result = database.db.prepare(
      'INSERT INTO users (username, password, role, full_name, email, phone, license_number, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hashed, role, fullName, email || null, phone || null, licenseNumber || null, req.session.userId);
    res.json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.indexOf('UNIQUE') !== -1) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/users', authMiddleware.isInstructor, function(req, res) {
  var query = 'SELECT id, username, role, full_name, email, phone, license_number, total_hours, is_active, created_at FROM users WHERE 1=1';
  var params = [];

  if (req.session.role === 'instructor') {
    query += " AND role = 'student'";
  }
  query += ' ORDER BY created_at DESC';

  var stmt = database.db.prepare(query);
  var users = params.length > 0 ? stmt.all.apply(stmt, params) : stmt.all();
  res.json({ users: users });
});

// LIST ALL INSTRUCTORS — available to any authenticated user (for the flight form dropdown)
router.get('/instructors', authMiddleware.isAuthenticated, function(req, res) {
  var instructors = database.db.prepare(
    "SELECT id, username, full_name FROM users WHERE role = 'instructor' AND is_active = 1 ORDER BY full_name ASC"
  ).all();
  res.json({ instructors: instructors });
});

router.put('/users/:id', authMiddleware.isInstructor, function(req, res) {
  const id = req.params.id;
  const user = database.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.session.role === 'instructor' && user.role !== 'student') {
    return res.status(403).json({ error: 'Instructors can only edit students' });
  }

  var updates = [];
  var params = [];
  if (req.body.fullName !== undefined) { updates.push('full_name = ?'); params.push(req.body.fullName); }
  if (req.body.email !== undefined) { updates.push('email = ?'); params.push(req.body.email); }
  if (req.body.phone !== undefined) { updates.push('phone = ?'); params.push(req.body.phone); }
  if (req.body.isActive !== undefined) { updates.push('is_active = ?'); params.push(req.body.isActive ? 1 : 0); }
  if (req.body.password) {
    updates.push('password = ?');
    params.push(bcrypt.hashSync(req.body.password, 10));
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

  params.push(id);
  var stmt = database.db.prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?');
  stmt.run.apply(stmt, params);
  res.json({ success: true });
});

router.delete('/users/:id', authMiddleware.isInstructor, function(req, res) {
  const user = database.db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot deactivate admin' });
  if (req.session.role === 'instructor' && user.role !== 'student') {
    return res.status(403).json({ error: 'Instructors can only deactivate students' });
  }
  database.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// HARD DELETE user — admin only
router.delete('/users/:id/hard', authMiddleware.isAdmin, function(req, res) {
  const id = req.params.id;

  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const user = database.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') {
    return res.status(403).json({ error: 'Cannot delete other admin accounts' });
  }

  try {
    database.db.prepare('DELETE FROM flight_sessions WHERE student_id = ?').run(id);
    database.db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(id);
    database.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true, message: 'User deleted permanently' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/online-users', authMiddleware.isAdmin, function(req, res) {
  const users = authMiddleware.getOnlineUsers();
  res.json({ users: users, count: users.length });
});

router.get('/stats', authMiddleware.isInstructor, function(req, res) {
  if (req.session.role === 'admin') {
    res.json({
      students: database.db.prepare("SELECT COUNT(*) c FROM users WHERE role='student' AND is_active=1").get().c,
      instructors: database.db.prepare("SELECT COUNT(*) c FROM users WHERE role='instructor' AND is_active=1").get().c,
      totalFlightHours: database.db.prepare("SELECT COALESCE(SUM(duration_hours),0) t FROM flight_sessions WHERE status='completed'").get().t,
      activeFlightSessions: database.db.prepare("SELECT COUNT(*) c FROM flight_sessions WHERE status='active'").get().c,
      studyMaterials: database.db.prepare("SELECT COUNT(*) c FROM study_materials").get().c
    });
  } else {
    res.json({
      students: database.db.prepare("SELECT COUNT(*) c FROM users WHERE role='student' AND is_active=1 AND created_by=?").get(req.session.userId).c,
      instructors: 0,
      totalFlightHours: 0,
      activeFlightSessions: 0,
      studyMaterials: database.db.prepare("SELECT COUNT(*) c FROM study_materials").get().c
    });
  }
});

module.exports = router;
