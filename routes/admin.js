const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const uuid = require('uuid');
const database = require('../database');
const authMiddleware = require('../middleware/auth');
const r2 = require('../r2-storage');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.indexOf(file.mimetype) !== -1) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.use(authMiddleware.isAuthenticated);

// CREATE USER — Instructors: students only | Admins: anyone
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

// LIST USERS — Instructors: students only | Admins: everyone
router.get('/users', authMiddleware.isInstructor, async function(req, res) {
  try {
    var query = 'SELECT id, username, role, full_name, email, phone, license_number, avatar_filename, total_hours, is_active, created_at FROM users WHERE 1=1';
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

// LIST INSTRUCTORS — any authenticated user
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

// UPDATE USER
router.put('/users/:id', authMiddleware.isInstructor, async function(req, res) {
  const id = req.params.id;
  const { fullName, email, phone, licenseNumber, isActive, password, role } = req.body;

  try {
    const userResult = await database.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Instructor can only edit students
    if (req.session.role === 'instructor' && user.role !== 'student') {
      return res.status(403).json({ error: 'Instructors can only edit students' });
    }

    // Admin cannot edit other admins
    if (req.session.role === 'admin' && user.role === 'admin' && user.id !== req.session.userId) {
      return res.status(403).json({ error: 'Cannot modify other admins' });
    }

    // Only admins can change roles
    if (role !== undefined && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }

    // Validate role if provided
    if (role !== undefined && role !== 'student' && role !== 'instructor') {
      return res.status(400).json({ error: 'Role must be student or instructor' });
    }

    var updates = [];
    var args = [];
    if (fullName !== undefined) { updates.push('full_name = ?'); args.push(fullName); }
    if (email !== undefined) { updates.push('email = ?'); args.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); args.push(phone); }
    if (licenseNumber !== undefined) { updates.push('license_number = ?'); args.push(licenseNumber); }
    if (isActive !== undefined) { updates.push('is_active = ?'); args.push(isActive ? 1 : 0); }
    if (role !== undefined) { updates.push('role = ?'); args.push(role); }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
      updates.push('password = ?');
      args.push(bcrypt.hashSync(password, 10));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

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

// DELETE (soft) — admin + instructor
router.delete('/users/:id', authMiddleware.isInstructor, async function(req, res) {
  try {
    const userResult = await database.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [req.params.id]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot deactivate admin' });
    if (req.session.role === 'instructor' && user.role !== 'student') {
      return res.status(403).json({ error: 'Instructors can only deactivate students' });
    }
    await database.db.execute({
      sql: 'UPDATE users SET is_active = 0 WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// HARD DELETE user — admin only
router.delete('/users/:id/hard', authMiddleware.isAdmin, async function(req, res) {
  const id = req.params.id;
  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    const userResult = await database.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete other admin accounts' });

    // Delete avatar from R2 if present
    if (user.avatar_filename) {
      try { await r2.deleteFile(user.avatar_filename); } catch (e) { /* ignore */ }
    }

    await database.db.execute({ sql: 'DELETE FROM flight_sessions WHERE student_id = ?', args: [id] });
    await database.db.execute({ sql: 'DELETE FROM active_sessions WHERE user_id = ?', args: [id] });
    await database.db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
    res.json({ success: true, message: 'User deleted permanently' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// UPLOAD AVATAR — admin only
router.post('/users/:id/avatar', authMiddleware.isAdmin, avatarUpload.single('avatar'), async function(req, res) {
  try {
    const id = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const userResult = await database.db.execute({
      sql: 'SELECT id, avatar_filename FROM users WHERE id = ?',
      args: [id]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.avatar_filename) {
      try { await r2.deleteFile(user.avatar_filename); } catch (e) { /* ignore */ }
    }

    const ext = path.extname(req.file.originalname) || '.jpg';
    const avatarKey = 'avatars/' + uuid.v4() + ext;
    await r2.uploadFile(avatarKey, req.file.buffer, req.file.mimetype);

    await database.db.execute({
      sql: 'UPDATE users SET avatar_filename = ? WHERE id = ?',
      args: [avatarKey, id]
    });

    res.json({ success: true, avatar_filename: avatarKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// REMOVE AVATAR — admin only
router.delete('/users/:id/avatar', authMiddleware.isAdmin, async function(req, res) {
  try {
    const id = req.params.id;
    const userResult = await database.db.execute({
      sql: 'SELECT avatar_filename FROM users WHERE id = ?',
      args: [id]
    });
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.avatar_filename) {
      try { await r2.deleteFile(user.avatar_filename); } catch (e) { /* ignore */ }
    }

    await database.db.execute({
      sql: 'UPDATE users SET avatar_filename = NULL WHERE id = ?',
      args: [id]
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// SERVE AVATAR — any authenticated user
router.get('/users/:id/avatar', authMiddleware.isAuthenticated, async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: 'SELECT avatar_filename FROM users WHERE id = ?',
      args: [req.params.id]
    });
    const row = result.rows[0];
    if (!row || !row.avatar_filename) return res.status(404).send('No avatar');

    const signedUrl = await r2.getSignedDownloadUrl(row.avatar_filename, 3600);
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ONLINE USERS — admin only
router.get('/online-users', authMiddleware.isAdmin, async function(req, res) {
  const users = await authMiddleware.getOnlineUsers();
  res.json({ users: users, count: users.length });
});

// STATS
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
