const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'flight_school.db');
const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Safe migration: add pilot_role column if missing
try {
  db.exec("ALTER TABLE flight_sessions ADD COLUMN pilot_role TEXT DEFAULT 'student'");
} catch (e) { /* already exists */ }

db.exec(`
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
  );

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
  );

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
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function adminExists() {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  return row.count > 0;
}

function isSystemInitialized() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'initialized'").get();
  return row && row.value === 'true';
}

function markSystemInitialized() {
  db.prepare(`
    INSERT OR REPLACE INTO system_settings (key, value, updated_at)
    VALUES ('initialized', 'true', CURRENT_TIMESTAMP)
  `).run();
}

function createFirstAdmin(username, password, fullName, email) {
  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password, role, full_name, email)
    VALUES (?, ?, 'admin', ?, ?)
  `).run(username, hashed, fullName, email || null);
  return result.lastInsertRowid;
}

console.log('Database initialized');

module.exports = {
  db,
  adminExists,
  isSystemInitialized,
  markSystemInitialized,
  createFirstAdmin
};
