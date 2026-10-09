const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'instructor', 'student')),
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      license_number TEXT,
      total_hours REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      is_active INTEGER DEFAULT 1,
      discord_id TEXT UNIQUE,
      discord_username TEXT,
      discord_avatar TEXT,
      gtaw_id TEXT UNIQUE,
      gtaw_username TEXT,
      gtaw_character TEXT,
      auth_provider TEXT DEFAULT 'local',
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS aircraft (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tail_number TEXT UNIQUE NOT NULL,
      model TEXT NOT NULL,
      description TEXT,
      hourly_rate REAL DEFAULT 1500,
      photo_filename TEXT,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      severity TEXT DEFAULT 'info' CHECK(severity IN ('info', 'caution', 'warning', 'critical')),
      expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // User certificates (many-to-many)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      certificate_code TEXT NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      issued_by INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (issued_by) REFERENCES users(id),
      UNIQUE(user_id, certificate_code)
    )
  `);

  // Aircraft rental requests
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rental_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aircraft_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      start_date DATETIME NOT NULL,
      duration_hours REAL NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'cancelled')),
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      review_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (aircraft_id) REFERENCES aircraft(id),
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);

  // Safe migrations
  try { await db.execute("ALTER TABLE users ADD COLUMN discord_id TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN discord_username TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN discord_avatar TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN gtaw_id TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN gtaw_username TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN gtaw_character TEXT"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'"); } catch(e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN avatar_filename TEXT"); } catch(e) {}

  console.log('✅ Database schema ready (Turso)');
}

initSchema().catch(function(err) {
  console.error('❌ Schema init failed:', err);
});

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
    sql: "INSERT INTO users (username, password, role, full_name, email, auth_provider) VALUES (?, ?, 'admin', ?, ?, 'local')",
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
