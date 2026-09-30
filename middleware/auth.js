const database = require('../database');

async function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      await database.db.execute({
        sql: `UPDATE active_sessions SET last_activity = CURRENT_TIMESTAMP WHERE user_id = ? AND session_token = ?`,
        args: [req.session.userId, req.session.id]
      });
    } catch (e) { /* ignore */ }
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

async function logSession(userId, sessionToken, ipAddress, userAgent) {
  try {
    await database.db.execute({
      sql: `DELETE FROM active_sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM active_sessions WHERE user_id = ? ORDER BY last_activity DESC LIMIT 5)`,
      args: [userId, userId]
    });
    await database.db.execute({
      sql: `INSERT INTO active_sessions (user_id, session_token, ip_address, user_agent) VALUES (?, ?, ?, ?)`,
      args: [userId, sessionToken, ipAddress, userAgent]
    });
  } catch (e) {
    console.error('logSession error:', e);
  }
}

async function removeSession(sessionToken) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM active_sessions WHERE session_token = ?',
      args: [sessionToken]
    });
  } catch (e) { /* ignore */ }
}

async function getOnlineUsers() {
  try {
    const result = await database.db.execute(
      `SELECT DISTINCT u.id, u.username, u.full_name, u.role, s.last_activity, s.ip_address FROM users u JOIN active_sessions s ON u.id = s.user_id WHERE s.last_activity > datetime('now', '-5 minutes') ORDER BY s.last_activity DESC`
    );
    return result.rows;
  } catch (e) {
    return [];
  }
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isInstructor,
  logSession,
  removeSession,
  getOnlineUsers
};
