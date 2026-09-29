const { db } = require('../database');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    db.prepare(`
      UPDATE active_sessions
      SET last_activity = CURRENT_TIMESTAMP
      WHERE user_id = ? AND session_token = ?
    `).run(req.session.userId, req.session.id);
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

function isInstructor(req, res, next) {
  if (req.session && (req.session.role === 'instructor' || req.session.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ error: 'Instructor access required' });
}

function logSession(userId, sessionToken, ipAddress, userAgent) {
  db.prepare(`
    DELETE FROM active_sessions
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM active_sessions
      WHERE user_id = ?
      ORDER BY last_activity DESC
      LIMIT 5
    )
  `).run(userId, userId);

  db.prepare(`
    INSERT INTO active_sessions (user_id, session_token, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(userId, sessionToken, ipAddress, userAgent);
}

function removeSession(sessionToken) {
  db.prepare('DELETE FROM active_sessions WHERE session_token = ?').run(sessionToken);
}

function getOnlineUsers() {
  return db.prepare(`
    SELECT DISTINCT
      u.id, u.username, u.full_name, u.role,
      s.last_activity, s.ip_address
    FROM users u
    JOIN active_sessions s ON u.id = s.user_id
    WHERE s.last_activity > datetime('now', '-5 minutes')
    ORDER BY s.last_activity DESC
  `).all();
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isInstructor,
  logSession,
  removeSession,
  getOnlineUsers
};
