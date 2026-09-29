const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

router.post('/sessions/start', function(req, res) {
  const studentId = req.body.studentId;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  if (req.session.role === 'student' && parseInt(studentId) !== req.session.userId) {
    return res.status(403).json({ error: 'You can only start your own flights' });
  }

  const student = database.db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student' AND is_active = 1").get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const active = database.db.prepare("SELECT * FROM flight_sessions WHERE student_id = ? AND status = 'active'").get(studentId);
  if (active) return res.status(400).json({ error: 'Student already has active session', sessionId: active.id });

  const instructorId = req.session.role === 'instructor' ? req.session.userId : null;

  const result = database.db.prepare(
    "INSERT INTO flight_sessions (student_id, instructor_id, aircraft, start_time, flight_type, notes, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'active')"
  ).run(studentId, instructorId, req.body.aircraft || null, req.body.flightType || null, req.body.notes || null);

  res.json({
    success: true,
    sessionId: result.lastInsertRowid,
    startTime: new Date().toISOString()
  });
});

router.post('/sessions/:id/stop', function(req, res) {
  const id = req.params.id;
  const session = database.db.prepare(
    "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.id = ? AND fs.status = 'active'"
  ).get(id);

  if (!session) return res.status(404).json({ error: 'Active session not found' });

  if (req.session.role === 'student' && session.student_id !== req.session.userId) {
    return res.status(403).json({ error: 'You can only stop your own flights' });
  }

  const start = new Date(session.start_time);
  const end = new Date();
  const duration = Math.round(((end - start) / 3600000) * 100) / 100;

  database.db.prepare(
    "UPDATE flight_sessions SET end_time = CURRENT_TIMESTAMP, duration_hours = ?, status = 'completed' WHERE id = ?"
  ).run(duration, id);

  database.db.prepare('UPDATE users SET total_hours = total_hours + ? WHERE id = ?').run(duration, session.student_id);

  res.json({ success: true, duration: duration, studentName: session.student_name });
});

router.get('/sessions/active/:studentId', function(req, res) {
  const studentId = req.params.studentId;

  if (req.session.role === 'student' && parseInt(studentId) !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const session = database.db.prepare(
    "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.student_id = ? AND fs.status = 'active'"
  ).get(studentId);

  if (!session) return res.json({ active: false, session: null });

  const start = new Date(session.start_time);
  const now = new Date();
  const elapsedSeconds = Math.floor((now - start) / 1000);

  session.elapsedHours = Math.round((elapsedSeconds / 3600) * 100) / 100;
  session.elapsedSeconds = elapsedSeconds;

  res.json({ active: true, session: session });
});

router.get('/sessions/student/:studentId', function(req, res) {
  const studentId = req.params.studentId;

  if (req.session.role === 'student' && req.session.userId !== parseInt(studentId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const sessions = database.db.prepare(
    "SELECT fs.*, i.full_name AS instructor_name FROM flight_sessions fs LEFT JOIN users i ON fs.instructor_id = i.id WHERE fs.student_id = ? ORDER BY fs.created_at DESC"
  ).all(studentId);

  res.json({ sessions: sessions, total: sessions.length });
});

module.exports = router;
