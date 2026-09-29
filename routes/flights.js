const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// START FLIGHT
router.post('/sessions/start', function(req, res) {
  var studentId = req.body.studentId;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  if (req.session.role === 'student' && parseInt(studentId) !== req.session.userId) {
    return res.status(403).json({ error: 'You can only start your own flights' });
  }

  var student = database.db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student' AND is_active = 1").get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  var active = database.db.prepare("SELECT * FROM flight_sessions WHERE student_id = ? AND status = 'active'").get(studentId);
  if (active) {
    return res.status(400).json({
      error: 'Student already has active session',
      sessionId: active.id
    });
  }

  var instructorId = req.session.role === 'instructor' ? req.session.userId : null;

  var result = database.db.prepare(
    "INSERT INTO flight_sessions (student_id, instructor_id, aircraft, start_time, flight_type, notes, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'active')"
  ).run(studentId, instructorId, req.body.aircraft || null, req.body.flightType || null, req.body.notes || null);

  res.json({
    success: true,
    sessionId: result.lastInsertRowid,
    startTime: new Date().toISOString()
  });
});

// STOP FLIGHT
router.post('/sessions/:id/stop', function(req, res) {
  var id = req.params.id;
  var session = database.db.prepare(
    "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.id = ? AND fs.status = 'active'"
  ).get(id);

  if (!session) return res.status(404).json({ error: 'Active session not found' });

  if (req.session.role === 'student' && session.student_id !== req.session.userId) {
    return res.status(403).json({ error: 'You can only stop your own flights' });
  }

  var start = new Date(session.start_time);
  var end = new Date();
  var duration = Math.round(((end - start) / 3600000) * 100) / 100;

  database.db.prepare(
    "UPDATE flight_sessions SET end_time = CURRENT_TIMESTAMP, duration_hours = ?, status = 'completed' WHERE id = ?"
  ).run(duration, id);

  database.db.prepare('UPDATE users SET total_hours = total_hours + ? WHERE id = ?').run(duration, session.student_id);

  res.json({ success: true, duration: duration, studentName: session.student_name });
});

// LIST ALL ACTIVE SESSIONS — admin/instructor
// IMPORTANT: this MUST come before /sessions/active/:studentId
router.get('/sessions/active/all', authMiddleware.isInstructor, function(req, res) {
  var query = "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.status = 'active'";
  var params = [];

  if (req.session.role === 'instructor') {
    query += ' AND u.created_by = ?';
    params.push(req.session.userId);
  }

  query += ' ORDER BY fs.start_time DESC';

  var stmt = database.db.prepare(query);
  var sessions = params.length > 0 ? stmt.all.apply(stmt, params) : stmt.all();

  // Attach elapsed time to each
  var now = new Date();
  for (var i = 0; i < sessions.length; i++) {
    var start = new Date(sessions[i].start_time);
    sessions[i].elapsedSeconds = Math.floor((now - start) / 1000);
  }

  res.json({ sessions: sessions });
});

// ACTIVE SESSION FOR A STUDENT
router.get('/sessions/active/:studentId', function(req, res) {
  var studentId = req.params.studentId;

  if (req.session.role === 'student' && parseInt(studentId) !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  var session = database.db.prepare(
    "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.student_id = ? AND fs.status = 'active'"
  ).get(studentId);

  if (!session) return res.json({ active: false, session: null });

  var start = new Date(session.start_time);
  var now = new Date();
  var elapsedSeconds = Math.floor((now - start) / 1000);

  session.elapsedHours = Math.round((elapsedSeconds / 3600) * 100) / 100;
  session.elapsedSeconds = elapsedSeconds;

  res.json({ active: true, session: session });
});

// ALL ACTIVE SESSIONS — instructor/admin (legacy path, kept for compatibility)
router.get('/sessions/active', authMiddleware.isInstructor, function(req, res) {
  var query = "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.status = 'active'";
  var params = [];

  if (req.session.role === 'instructor') {
    query += ' AND u.created_by = ?';
    params.push(req.session.userId);
  }

  query += ' ORDER BY fs.start_time DESC';

  var stmt = database.db.prepare(query);
  var sessions = params.length > 0 ? stmt.all.apply(stmt, params) : stmt.all();

  var now = new Date();
  for (var i = 0; i < sessions.length; i++) {
    var start = new Date(sessions[i].start_time);
    sessions[i].elapsedSeconds = Math.floor((now - start) / 1000);
  }

  res.json({ sessions: sessions });
});

// STUDENT FLIGHT HISTORY
router.get('/sessions/student/:studentId', function(req, res) {
  var studentId = req.params.studentId;

  if (req.session.role === 'student' && req.session.userId !== parseInt(studentId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  var sessions = database.db.prepare(
    "SELECT fs.*, i.full_name AS instructor_name FROM flight_sessions fs LEFT JOIN users i ON fs.instructor_id = i.id WHERE fs.student_id = ? ORDER BY fs.created_at DESC"
  ).all(studentId);

  res.json({ sessions: sessions, total: sessions.length });
});

module.exports = router;
