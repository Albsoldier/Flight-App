const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

router.post('/sessions/start', async function(req, res) {
  try {
    var studentId = req.body.studentId;
    var selfLog = req.body.selfLog === true;
    var instructorId = req.body.instructorId ? parseInt(req.body.instructorId) : null;

    if (!studentId && !selfLog) {
      return res.status(400).json({ error: 'studentId required' });
    }

    var targetUserId;
    var pilotRole;

    if (selfLog) {
      if (req.session.role !== 'admin' && req.session.role !== 'instructor') {
        return res.status(403).json({ error: 'Only admin or instructor can self-log' });
      }
      targetUserId = req.session.userId;
      pilotRole = req.session.role;
      instructorId = null;
    } else {
      targetUserId = parseInt(studentId);
      if (req.session.role === 'student' && targetUserId !== req.session.userId) {
        return res.status(403).json({ error: 'You can only start your own flights' });
      }
      const studentResult = await database.db.execute({
        sql: "SELECT * FROM users WHERE id = ? AND role = 'student' AND is_active = 1",
        args: [targetUserId]
      });
      if (!studentResult.rows[0]) return res.status(404).json({ error: 'Student not found' });
      pilotRole = 'student';

      if (instructorId) {
        const instResult = await database.db.execute({
          sql: "SELECT * FROM users WHERE id = ? AND role = 'instructor' AND is_active = 1",
          args: [instructorId]
        });
        if (!instResult.rows[0]) return res.status(400).json({ error: 'Selected instructor not found' });
      } else if (req.session.role === 'instructor') {
        instructorId = req.session.userId;
      }
    }

    const activeResult = await database.db.execute({
      sql: "SELECT * FROM flight_sessions WHERE student_id = ? AND status = 'active'",
      args: [targetUserId]
    });
    if (activeResult.rows[0]) {
      return res.status(400).json({
        error: 'Pilot already has active session',
        sessionId: activeResult.rows[0].id
      });
    }

    const insertResult = await database.db.execute({
      sql: "INSERT INTO flight_sessions (student_id, instructor_id, aircraft, start_time, flight_type, notes, status, pilot_role) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'active', ?)",
      args: [targetUserId, instructorId, req.body.aircraft || null, req.body.flightType || null, req.body.notes || null, pilotRole]
    });

    const io = req.app.get('io');
    if (io) {
      const pilotResult = await database.db.execute({ sql: 'SELECT full_name FROM users WHERE id = ?', args: [targetUserId] });
      io.emit('flight-event', {
        type: 'start',
        pilotName: pilotResult.rows[0] ? pilotResult.rows[0].full_name : 'Pilot',
        sessionId: Number(insertResult.lastInsertRowid)
      });
    }

    res.json({
      success: true,
      sessionId: Number(insertResult.lastInsertRowid),
      startTime: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/sessions/:id/stop', async function(req, res) {
  try {
    var id = req.params.id;
    const sessionResult = await database.db.execute({
      sql: "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.id = ? AND fs.status = 'active'",
      args: [id]
    });
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    if (req.session.role === 'student' && session.student_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only stop your own flights' });
    }

    const start = new Date(session.start_time);
    const end = new Date();
    const duration = Math.round(((end - start) / 3600000) * 100) / 100;

    const notes = req.body.notes !== undefined ? req.body.notes : null;

    await database.db.execute({
      sql: "UPDATE flight_sessions SET end_time = CURRENT_TIMESTAMP, duration_hours = ?, status = 'completed', notes = COALESCE(?, notes) WHERE id = ?",
      args: [duration, notes, id]
    });

    await database.db.execute({
      sql: 'UPDATE users SET total_hours = total_hours + ? WHERE id = ?',
      args: [duration, session.student_id]
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('flight-event', {
        type: 'stop',
        pilotName: session.student_name,
        duration: duration,
        sessionId: parseInt(id)
      });
    }

    res.json({ success: true, duration: duration, studentName: session.student_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/sessions/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    var id = req.params.id;
    const sessionResult = await database.db.execute({ sql: 'SELECT * FROM flight_sessions WHERE id = ?', args: [id] });
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    var updates = [];
    var args = [];
    if (req.body.aircraft !== undefined) { updates.push('aircraft = ?'); args.push(req.body.aircraft); }
    if (req.body.flight_type !== undefined) { updates.push('flight_type = ?'); args.push(req.body.flight_type); }
    if (req.body.notes !== undefined) { updates.push('notes = ?'); args.push(req.body.notes); }
    if (req.body.duration_hours !== undefined) {
      var newDuration = parseFloat(req.body.duration_hours);
      var diff = newDuration - (session.duration_hours || 0);
      updates.push('duration_hours = ?');
      args.push(newDuration);
      await database.db.execute({
        sql: 'UPDATE users SET total_hours = total_hours + ? WHERE id = ?',
        args: [diff, session.student_id]
      });
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates' });

    args.push(id);
    await database.db.execute({
      sql: 'UPDATE flight_sessions SET ' + updates.join(', ') + ' WHERE id = ?',
      args: args
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/sessions/:id', authMiddleware.isAdmin, async function(req, res) {
  try {
    var id = req.params.id;
    const sessionResult = await database.db.execute({ sql: 'SELECT * FROM flight_sessions WHERE id = ?', args: [id] });
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.duration_hours) {
      await database.db.execute({
        sql: 'UPDATE users SET total_hours = total_hours - ? WHERE id = ?',
        args: [session.duration_hours, session.student_id]
      });
    }

    await database.db.execute({ sql: 'DELETE FROM flight_sessions WHERE id = ?', args: [id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions/active/all', authMiddleware.isInstructor, async function(req, res) {
  try {
    var query = "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.status = 'active'";
    var args = [];
    if (req.session.role === 'instructor') {
      query += ' AND (u.created_by = ? OR fs.student_id = ?)';
      args.push(req.session.userId, req.session.userId);
    }
    query += ' ORDER BY fs.start_time DESC';

    const result = await database.db.execute({ sql: query, args: args });
    var sessions = result.rows;
    var now = new Date();
    for (var i = 0; i < sessions.length; i++) {
      var start = new Date(sessions[i].start_time);
      sessions[i].elapsedSeconds = Math.floor((now - start) / 1000);
    }
    res.json({ sessions: sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions/active/:studentId', async function(req, res) {
  try {
    var studentId = req.params.studentId;
    if (req.session.role === 'student' && parseInt(studentId) !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await database.db.execute({
      sql: "SELECT fs.*, u.full_name AS student_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id WHERE fs.student_id = ? AND fs.status = 'active'",
      args: [studentId]
    });
    const session = result.rows[0];
    if (!session) return res.json({ active: false, session: null });

    var start = new Date(session.start_time);
    var now = new Date();
    var elapsedSeconds = Math.floor((now - start) / 1000);
    session.elapsedHours = Math.round((elapsedSeconds / 3600) * 100) / 100;
    session.elapsedSeconds = elapsedSeconds;

    res.json({ active: true, session: session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions/my', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: "SELECT fs.*, i.full_name AS instructor_name FROM flight_sessions fs LEFT JOIN users i ON fs.instructor_id = i.id WHERE fs.student_id = ? AND fs.status = 'completed' ORDER BY fs.start_time DESC",
      args: [req.session.userId]
    });
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions/all', authMiddleware.isAdmin, async function(req, res) {
  try {
    const result = await database.db.execute(
      "SELECT fs.*, u.full_name AS pilot_name, u.role AS pilot_role_actual, u.username AS pilot_username, i.full_name AS instructor_name FROM flight_sessions fs JOIN users u ON fs.student_id = u.id LEFT JOIN users i ON fs.instructor_id = i.id WHERE fs.status = 'completed' ORDER BY fs.start_time DESC"
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sessions/student/:studentId', async function(req, res) {
  try {
    var studentId = req.params.studentId;
    if (req.session.role === 'student' && req.session.userId !== parseInt(studentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await database.db.execute({
      sql: "SELECT fs.*, i.full_name AS instructor_name FROM flight_sessions fs LEFT JOIN users i ON fs.instructor_id = i.id WHERE fs.student_id = ? ORDER BY fs.created_at DESC",
      args: [studentId]
    });
    res.json({ sessions: result.rows, total: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
