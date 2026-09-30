const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

router.post('/users', authMiddleware.isInstructor, async function(req, res) {
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
    const result = await database.db.execute({
      sql: 'INSERT INTO users (username, password, role, full_name, email, phone, license_number, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [username, hashed, role, fullName, email || null, phone || null, licenseNumber || null, req.session.userId]
    });
    res.json({ success: true, userId: Number(result.lastInsertRowid) });
  } catch (err) {
    if (err.message && err.message.indexOf('UNIQUE') !== -1) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/users', authMiddleware.isInstructor, async function(req, res) {
  try {
    var query = 'SELECT id, username, role, full_name, email, phone, license_number, total_hours, is_active, created_at FROM users WHERE 1=1';
    var args = [];

    if (req.session.role === 'instructor') {
      query += " AND role = 'student'";
    }
    query += ' ORDER BY created_at DESC';

    const result = await database.db.execute({ sql: query, args: args });
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/instructors', authMiddleware.isAuthenticated, async function(req, res) {
  try {
    const result = await database.db.execute(
      "SELECT id, username, full_name FROM users WHERE role = 'instructor' AND is_active = 1 ORDER BY full_name ASC"
    );
    res.json({ instructors: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', authMiddleware.isInstructor, async function(req, res) {
  const id = req.params.id;
  try {
    const userResult = await database.db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.session.role === 'instructor' && user.role !== 'student') {
      return res.status(403).json({ error: 'Instructors can only edit students' });
    }

    var updates = [];
    var args = [];
    if (req.body.fullName !== undefined) { updates.push('full_name = ?'); args.push(req.body.fullName); }
    if (req.body.email !== undefined) { updates.push('email = ?'); args.push(req.body.email); }
    if (req.body.phone !== undefined) { updates.push('phone = ?'); args.push(req.body.phone); }
    if (req.body.isActive !== undefined) { updates.push('is_active = ?'); args.push(req.body.isActive ? 1 : 0); }
    if (req.body.password) {
      updates.push('password = ?');
      args.push(bcrypt.hashSync(req.body.password, 10));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

    args.push(id);
    await database.db.execute({
      sql: 'UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?',
      args: args
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', authMiddleware.isInstructor, async function(req, res) {
  try {
    const userResult = await database.db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.params.id] });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot deactivate admin' });
    if (req.session.role === 'instructor' && user.role !== 'student') {
      return res.status(403).json({ error: 'Instructors can only deactivate students' });
    }
    await database.db.execute({ sql: 'UPDATE users SET is_active = 0 WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id/hard', authMiddleware.isAdmin, async function(req, res) {
  const id = req.params.id;
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    const userResult = await database.db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete other admin accounts' });

    await database.db.execute({ sql: 'DELETE FROM flight_sessions WHERE student_id = ?', args: [id] });
    await database.db.execute({ sql: 'DELETE FROM active_sessions WHERE user_id = ?', args: [id] });
    await database.db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
    res.json({ success: true, message: 'User deleted permanently' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/online-users', authMiddleware.isAdmin, async function(req, res) {
  const users = await authMiddleware.getOnlineUsers();
  res.json({ users: users, count: users.length });
});

router.get('/stats', authMiddleware.isInstructor, async function(req, res) {
  try {
    if (req.session.role === 'admin') {
      const students = await database.db.execute("SELECT COUNT(*) c FROM users WHERE role='student' AND is_active=1");
      const instructors = await database.db.execute("SELECT COUNT(*) c FROM users WHERE role='instructor' AND is_active=1");
      const hours = await database.db.execute("SELECT COALESCE(SUM(duration_hours),0) t FROM flight_sessions WHERE status='completed'");
      const active = await database.db.execute("SELECT COUNT(*) c FROM flight_sessions WHERE status='active'");
      const materials = await database.db.execute("SELECT COUNT(*) c FROM study_materials");
      res.json({
        students: students.rows[0].c,
        instructors: instructors.rows[0].c,
        totalFlightHours: hours.rows[0].t,
        activeFlightSessions: active.rows[0].c,
        studyMaterials: materials.rows[0].c
      });
    } else {
      const students = await database.db.execute({
        sql: "SELECT COUNT(*) c FROM users WHERE role='student' AND is_active=1 AND created_by=?",
        args: [req.session.userId]
      });
      const materials = await database.db.execute("SELECT COUNT(*) c FROM study_materials");
      res.json({
        students: students.rows[0].c,
        instructors: 0,
        totalFlightHours: 0,
        activeFlightSessions: 0,
        studyMaterials: materials.rows[0].c
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
