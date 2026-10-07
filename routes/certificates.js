const express = require('express');
const router = express.Router();
const database = require('../database');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware.isAuthenticated);

// ============================================
// CERTIFICATE CATALOG — the master list
// ============================================
const CERTIFICATE_CATALOG = [
  { code: 'PPL-A',   name: 'Pilot — Airplane',            short: 'PPL-A' },
  { code: 'PPL-H',   name: 'Pilot — Helicopter',          short: 'PPL-H' },
  { code: 'PPL-S',   name: 'Pilot — Seaplane',            short: 'PPL-S' },
  { code: 'CPL-A',   name: 'Commercial — Airplane',       short: 'CPL-A' },
  { code: 'CPL-H',   name: 'Commercial — Helicopter',     short: 'CPL-H' },
  { code: 'CFI-A',   name: 'Certified Flight Instructor — Airplane',   short: 'CFI-A' },
  { code: 'CFI-H',   name: 'Certified Flight Instructor — Helicopter', short: 'CFI-H' },
  { code: 'CFI-S',   name: 'Certified Flight Instructor — Seaplane',   short: 'CFI-S' },
  { code: 'IR',      name: 'Instrument Rating',           short: 'IR' },
  { code: 'MEL',     name: 'Multi-Engine Land',           short: 'MEL' },
  { code: 'MES',     name: 'Multi-Engine Sea',            short: 'MES' },
  { code: 'ATP',     name: 'Airline Transport Pilot',     short: 'ATP' }
];

// GET /api/certificates/catalog — full list of available certificate types
router.get('/catalog', function(req, res) {
  res.json({ certificates: CERTIFICATE_CATALOG });
});

// GET /api/certificates/user/:userId — list certificates held by a user
router.get('/user/:userId', async function(req, res) {
  try {
    const userId = req.params.userId;

    // Students can only view their own
    if (req.session.role === 'student' && req.session.userId !== parseInt(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await database.db.execute({
      sql: `SELECT uc.id, uc.certificate_code, uc.issued_at,
                   u.full_name AS issuer_name
            FROM user_certificates uc
            LEFT JOIN users u ON uc.issued_by = u.id
            WHERE uc.user_id = ?
            ORDER BY uc.issued_at DESC`,
      args: [userId]
    });

    // Enrich with names from catalog
    const certs = result.rows.map(function(row) {
      const cat = CERTIFICATE_CATALOG.find(function(c) { return c.code === row.certificate_code; });
      return {
        id: row.id,
        code: row.certificate_code,
        name: cat ? cat.name : row.certificate_code,
        short: cat ? cat.short : row.certificate_code,
        issued_at: row.issued_at,
        issuer_name: row.issuer_name
      };
    });

    res.json({ certificates: certs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/certificates/user/:userId — issue a certificate (admin only)
router.post('/user/:userId', authMiddleware.isAdmin, async function(req, res) {
  const userId = req.params.userId;
  const code = (req.body.code || '').trim().toUpperCase();

  if (!code) return res.status(400).json({ error: 'Certificate code required' });

  // Validate against catalog
  const catalogEntry = CERTIFICATE_CATALOG.find(function(c) { return c.code === code; });
  if (!catalogEntry) {
    return res.status(400).json({ error: 'Unknown certificate: ' + code });
  }

  try {
    // Verify user exists
    const userResult = await database.db.execute({
      sql: 'SELECT id, role FROM users WHERE id = ? AND is_active = 1',
      args: [userId]
    });
    if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found' });

    // Prevent duplicates
    const existing = await database.db.execute({
      sql: 'SELECT id FROM user_certificates WHERE user_id = ? AND certificate_code = ?',
      args: [userId, code]
    });
    if (existing.rows[0]) {
      return res.status(400).json({ error: 'User already has this certificate' });
    }

    const result = await database.db.execute({
      sql: 'INSERT INTO user_certificates (user_id, certificate_code, issued_by) VALUES (?, ?, ?)',
      args: [userId, code, req.session.userId]
    });

    res.json({ success: true, certificateId: Number(result.lastInsertRowid), code: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/certificates/user/:userId/:code — revoke a certificate (admin only)
router.delete('/user/:userId/:code', authMiddleware.isAdmin, async function(req, res) {
  const userId = req.params.userId;
  const code = req.params.code.toUpperCase();

  try {
    const result = await database.db.execute({
      sql: 'DELETE FROM user_certificates WHERE user_id = ? AND certificate_code = ?',
      args: [userId, code]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Certificate not found for this user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
