const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Initialize schema (runs once on startup)
async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'instructor', 'student')),
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      license_number TEXT,
      total_hours REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS flight_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      instructor_id INTEGER,
      aircraft TEXT,
      start_time DATETIME,
      end_time DATETIME,
      duration_hours REAL DEFAULT 0,
      flight_type TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      pilot_role TEXT DEFAULT 'student',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (instructor_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS study_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database schema ready (Turso)');
}

initSchema().catch(function(err) {
  console.error('❌ Schema init failed:', err);
});

// ---------- HELPERS (all async) ----------
async function adminExists() {
  const result = await db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  return result.rows[0].count > 0;
}

async function isSystemInitialized() {
  const result = await db.execute("SELECT value FROM system_settings WHERE key = 'initialized'");
  return result.rows.length > 0 && result.rows[0].value === 'true';
}

async function markSystemInitialized() {
  await db.execute({
    sql: "INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('initialized', 'true', CURRENT_TIMESTAMP)",
    args: []
  });
}

async function createFirstAdmin(username, password, fullName, email) {
  const hashed = bcrypt.hashSync(password, 10);
  const result = await db.execute({
    sql: "INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, 'admin', ?, ?)",
    args: [username, hashed, fullName, email || null]
  });
  return Number(result.lastInsertRowid);
}

module.exports = {
  db,
  adminExists,
  isSystemInitialized,
  markSystemInitialized,
  createFirstAdmin
};
