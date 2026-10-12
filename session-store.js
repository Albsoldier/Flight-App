const session = require('express-session');
const database = require('./database');

class TursoStore extends session.Store {
  constructor(options) {
    super(options || {});
    this.initTable();
  }

  async initTable() {
    try {
      await database.db.execute(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      await database.db.execute({
        sql: 'DELETE FROM sessions WHERE expires_at < ?',
        args: [Date.now()]
      });
      console.log('✅ TursoStore ready');
    } catch (err) {
      console.error('❌ TursoStore initTable failed:', err);
    }
  }

  get(sid, callback) {
    database.db.execute({
      sql: 'SELECT data, expires_at FROM sessions WHERE sid = ?',
      args: [sid]
    }).then(result => {
      const row = result.rows[0];
      if (!row) return callback(null, null);
      if (row.expires_at < Date.now()) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }
      try {
        callback(null, JSON.parse(row.data));
      } catch (e) {
        callback(e);
      }
    }).catch(err => callback(err));
  }

  set(sid, sessionData, callback) {
    const expires = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + 8 * 60 * 60 * 1000;

    const data = JSON.stringify(sessionData);

    database.db.execute({
      sql: `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
      args: [sid, data, expires]
    }).then(() => {
      if (callback) callback(null);
    }).catch(err => {
      console.error('TursoStore: set failed:', err);
      if (callback) callback(err);
    });
  }

  destroy(sid, callback) {
    database.db.execute({
      sql: 'DELETE FROM sessions WHERE sid = ?',
      args: [sid]
    }).then(() => {
      if (callback) callback(null);
    }).catch(err => {
      console.error('TursoStore: destroy failed:', err);
      if (callback) callback(err);
    });
  }

  touch(sid, sessionData, callback) {
    const expires = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + 8 * 60 * 60 * 1000;

    database.db.execute({
      sql: 'UPDATE sessions SET expires_at = ? WHERE sid = ?',
      args: [expires, sid]
    }).then(() => {
      if (callback) callback(null);
    }).catch(err => {
      if (callback) callback(err);
    });
  }
}

module.exports = TursoStore;
