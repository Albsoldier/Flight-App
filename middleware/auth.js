const database = require('../database');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function isInstructor(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.role === 'admin' || req.session.role === 'instructor') {
    return next();
  }
  return res.status(403).json({ error: 'Instructor or admin only' });
}

function isAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin only' });
}

async function logSession(userId, sessionId, ip, userAgent) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM active_sessions WHERE session_token = ?',
      args: [sessionId]
    });
    await database.db.execute({
      sql: 'INSERT INTO active_sessions (user_id, session_token, ip_address, user_agent) VALUES (?, ?, ?, ?)',
      args: [userId, sessionId, ip || null, userAgent || null]
    });
  } catch (err) {
    console.error('logSession error:', err);
  }
}

async function removeSession(sessionId) {
  try {
    await database.db.execute({
      sql: 'DELETE FROM active_sessions WHERE session_token = ?',
      args: [sessionId]
    });
  } catch (err) {
    console.error('removeSession error:', err);
  }
}

async function getOnlineUsers() {
  try {
    await database.db.execute({
      sql: "DELETE FROM active_sessions WHERE last_activity < datetime('now', '-8 hours')",
      args: []
    });

    const result = await database.db.execute({
      sql: `SELECT DISTINCT u.id, u.username, u.full_name, u.role
            FROM active_sessions a
            JOIN users u ON a.user_id = u.id
            WHERE u.is_active = 1
            ORDER BY u.full_name ASC`,
      args: []
    });

    return result.rows;
  } catch (err) {
    console.error('getOnlineUsers error:', err);
    return [];
  }
}

module.exports = {
  isAuthenticated: isAuthenticated,
  isInstructor: isInstructor,
  isAdmin: isAdmin,
  logSession: logSession,
  removeSession: removeSession,
  getOnlineUsers: getOnlineUsers
};
