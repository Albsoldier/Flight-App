const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// ============================================
// CREATE REQUEST — any authenticated user
// ============================================
router.post('/', async function(req, res) {
  try {
    const aircraftId = parseInt(req.body.aircraft_id);
    const startDate = req.body.start_date;
    const durationHours = parseFloat(req.body.duration_hours);
    const notes = (req.body.notes || '').trim() || null;

    if (!aircraftId || !startDate || !durationHours) {
      return res.status(400).json({ error: 'aircraft_id, start_date, and duration_hours are required' });
    }
    if (durationHours <= 0 || durationHours > 24) {
      return res.status(400).json({ error: 'Duration must be between 0 and 24 hours' });
    }

    const acResult = await database.db.execute({
      sql: 'SELECT id, tail_number, model, is_available FROM aircraft WHERE id = ?',
      args: [aircraftId]
    });
    const aircraft = acResult.rows[0];
    if (!aircraft) return res.status(404).json({ error: 'Aircraft not found' });
    if (aircraft.is_available !== 1) {
      return res.status(400).json({ error: 'This aircraft is not available for rent' });
    }

    const dup = await database.db.execute({
      sql: "SELECT id FROM rental_requests WHERE aircraft_id = ? AND requester_id = ? AND status = 'pending'",
      args: [aircraftId, req.session.userId]
    });
    if (dup.rows[0]) {
      return res.status(400).json({ error: 'You already have a pending request for this aircraft' });
    }

    const insertResult = await database.db.execute({
      sql: 'INSERT INTO rental_requests (aircraft_id, requester_id, start_date, duration_hours, notes) VALUES (?, ?, ?, ?, ?)',
      args: [aircraftId, req.session.userId, startDate, durationHours, notes]
    });

    const newId = Number(insertResult.lastInsertRowid);

    const io = req.app.get('io');
    if (io) {
      const requesterResult = await database.db.execute({
        sql: 'SELECT full_name FROM users WHERE id = ?',
        args: [req.session.userId]
      });
      const requesterName = requesterResult.rows[0] ? requesterResult.rows[0].full_name : 'Someone';
      io.emit('rental-event', {
        type: 'new-request',
        requestId: newId,
        requesterName: requesterName,
        aircraftTail: aircraft.tail_number,
        aircraftModel: aircraft.model,
        startDate: startDate,
        durationHours: durationHours
      });
    }

    res.json({ success: true, requestId: newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// LIST MY REQUESTS — any authenticated user
// ============================================
router.get('/my', async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: `SELECT r.*, a.tail_number, a.model, a.hourly_rate,
                   rv.full_name AS reviewer_name
            FROM rental_requests r
            JOIN aircraft a ON r.aircraft_id = a.id
            LEFT JOIN users rv ON r.reviewed_by = rv.id
            WHERE r.requester_id = ?
            ORDER BY r.created_at DESC`,
      args: [req.session.userId]
    });
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// LIST ALL REQUESTS — instructor + admin only
// ============================================
router.get('/all', authMiddleware.isInstructor, async function(req, res) {
  try {
    const result = await database.db.execute({
      sql: `SELECT r.id, r.aircraft_id, r.requester_id, r.start_date, r.duration_hours,
                   r.notes, r.status, r.reviewed_by, r.reviewed_at, r.review_notes, r.created_at,
                   a.tail_number, a.model, a.hourly_rate,
                   u.full_name AS requester_name, u.username AS requester_username, u.role AS requester_role,
                   rv.full_name AS reviewer_name
            FROM rental_requests r
            LEFT JOIN aircraft a ON r.aircraft_id = a.id
            LEFT JOIN users u ON r.requester_id = u.id
            LEFT JOIN users rv ON r.reviewed_by = rv.id`,
      args: []
    });

    const order = { pending: 1, approved: 2, denied: 3, cancelled: 4 };
    const sorted = result.rows.slice().sort(function(a, b) {
      var oa = order[a.status] || 99;
      var ob = order[b.status] || 99;
      if (oa !== ob) return oa - ob;
      var da = new Date(a.created_at).getTime();
      var db = new Date(b.created_at).getTime();
      return db - da;
    });

    res.json({ requests: sorted });
  } catch (err) {
    console.error('=== RENTALS /ALL ERROR ===');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// APPROVE / DENY — instructor + admin only
// ============================================
router.put('/:id', authMiddleware.isInstructor, async function(req, res) {
  try {
    const id = req.params.id;
    const status = req.body.status;
    const reviewNotes = (req.body.review_notes || '').trim() || null;

    if (status !== 'approved' && status !== 'denied') {
      return res.status(400).json({ error: 'Status must be approved or denied' });
    }

    const existing = await database.db.execute({
      sql: 'SELECT * FROM rental_requests WHERE id = ?',
      args: [id]
    });
    const request = existing.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been reviewed' });
    }

    await database.db.execute({
      sql: 'UPDATE rental_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ? WHERE id = ?',
      args: [status, req.session.userId, reviewNotes, id]
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('rental-event', {
        type: 'reviewed',
        requestId: parseInt(id),
        requesterId: request.requester_id,
        status: status,
        reviewNotes: reviewNotes
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// CANCEL MY OWN PENDING REQUEST — requester only
// ============================================
router.delete('/:id', async function(req, res) {
  try {
    const id = req.params.id;

    const existing = await database.db.execute({
      sql: 'SELECT * FROM rental_requests WHERE id = ?',
      args: [id]
    });
    const request = existing.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (request.requester_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only cancel your own requests' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    await database.db.execute({
      sql: 'DELETE FROM rental_requests WHERE id = ?',
      args: [id]
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
