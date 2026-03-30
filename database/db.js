// database/db.js
// Uses sql.js (pure WebAssembly SQLite – zero native compilation)
// with a better-sqlite3–compatible synchronous wrapper so all
// existing route code works unchanged.
const initSqlJs = require('sql.js');
const fs     = require('fs');
const bcrypt = require('bcryptjs');
const path   = require('path');

const DB_PATH = path.join(__dirname, 'registration.db');

let _sqlJs = null;  // sql.js constructor (set once on init)
let _db    = null;  // sql.js Database instance

// ────────────────────────────────────────────────────────
// Persist the in-memory database to disk after every write
// ────────────────────────────────────────────────────────
function _save() {
  if (_db) fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

// ────────────────────────────────────────────────────────
// PreparedStatement  –  mimics better-sqlite3 Statement
// Supports: .run(...args)  .get(...args)  .all(...args)
// ────────────────────────────────────────────────────────
class Stmt {
  constructor(sql) { this._sql = sql; }

  // Normalise variadic or single-array args -> plain array
  _p(args) {
    if (args.length === 0)                           return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  // DML (INSERT / UPDATE / DELETE)
  run(...args) {
    _db.run(this._sql, this._p(args));
    const lastInsertRowid = _db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
    const changes         = _db.exec('SELECT changes()')[0]?.values[0][0]           ?? 0;
    _save();
    return { lastInsertRowid, changes };
  }

  // SELECT – first row or undefined
  get(...args) {
    const stmt = _db.prepare(this._sql);
    stmt.bind(this._p(args));
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  // SELECT – all rows as array
  all(...args) {
    const rows = [];
    const stmt = _db.prepare(this._sql);
    stmt.bind(this._p(args));
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
}

// ────────────────────────────────────────────────────────
// dbProxy  –  mimics better-sqlite3 Database object
// Routes call getDb() and receive this proxy.
// ────────────────────────────────────────────────────────
const dbProxy = {
  prepare: (sql)    => new Stmt(sql),
  exec:    (sql)    => { _db.exec(sql); _save(); },
  pragma:  (clause) => { try { _db.run(`PRAGMA ${clause}`); } catch {} },
};

// ────────────────────────────────────────────────────────
// Public: getDb()  – synchronous, used throughout routes
// ────────────────────────────────────────────────────────
function getDb() {
  if (!_db) throw new Error('Database not initialised. Did you await initDatabase()?');
  return dbProxy;
}

// ────────────────────────────────────────────────────────
// Public: initDatabase()  – MUST be awaited before app.listen
// ────────────────────────────────────────────────────────
async function initDatabase() {
  if (_db) return; // already initialised

  // 1. Instantiate sql.js WASM engine
  _sqlJs = await initSqlJs();

  // 2. Load existing file or start fresh
  if (fs.existsSync(DB_PATH)) {
    _db = new _sqlJs.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new _sqlJs.Database();
  }

  // 3. Enable foreign keys
  _db.run('PRAGMA foreign_keys = ON');

  // 4. Create schema (multi-statement DDL)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      username            TEXT    UNIQUE NOT NULL,
      email               TEXT    UNIQUE NOT NULL,
      password_hash       TEXT    NOT NULL,
      is_verified         INTEGER DEFAULT 0,
      is_active           INTEGER DEFAULT 1,
      verification_token  TEXT,
      verification_expires TEXT,
      otp_hash            TEXT,
      otp_expires         TEXT,
      otp_attempts        INTEGER DEFAULT 0,
      reset_otp_hash      TEXT,
      reset_otp_expires   TEXT,
      reset_attempts      INTEGER DEFAULT 0,
      created_at          TEXT    DEFAULT (datetime('now')),
      last_login          TEXT,
      ip_address          TEXT,
      failed_attempts     INTEGER DEFAULT 0,
      locked_until        TEXT,
      role                TEXT    DEFAULT 'user',
      is_master_admin     INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS password_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT,
      ip_address   TEXT,
      success      INTEGER DEFAULT 0,
      attempted_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suspicious_activities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      description TEXT,
      ip_address  TEXT,
      user_id     INTEGER,
      detected_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 5. Migrate existing databases – add OTP columns if missing
  const pragma = _db.exec("PRAGMA table_info(users)");
  if (pragma.length > 0) {
    const colNames = pragma[0].values.map(r => r[1]);
    if (!colNames.includes('otp_hash'))     { _db.run('ALTER TABLE users ADD COLUMN otp_hash TEXT'); }
    if (!colNames.includes('otp_expires'))  { _db.run('ALTER TABLE users ADD COLUMN otp_expires TEXT'); }
    if (!colNames.includes('otp_attempts')) { _db.run('ALTER TABLE users ADD COLUMN otp_attempts INTEGER DEFAULT 0'); }
    if (!colNames.includes('role'))         { _db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); }
    if (!colNames.includes('is_master_admin')) { _db.run('ALTER TABLE users ADD COLUMN is_master_admin INTEGER DEFAULT 0'); }
    if (!colNames.includes('phone_number')) { _db.run('ALTER TABLE users ADD COLUMN phone_number TEXT'); }
  }

  // 6. Seed default master admin account (non-deletable, non-modifiable)
  const masterAdminExists = dbProxy.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!masterAdminExists) {
    const hash = bcrypt.hashSync('Admin12345@', 12);
    dbProxy.prepare(
      'INSERT INTO users (username, email, password_hash, role, is_verified, is_active, is_master_admin) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('admin', 'admin@gmail.com', hash, 'admin', 1, 1, 1);
    console.log('✅  Master Admin created  →  admin@gmail.com / Admin12345@');
  }

  // 7. Keep backward compatibility: also seed old admins table if needed for legacy logins
  const legacyAdminExists = dbProxy.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!legacyAdminExists && _db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'").length > 0) {
    const hash = bcrypt.hashSync('Admin@123456', 12);
    dbProxy.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log('✅  Legacy admin table seeded (backward compatibility)');
  }

  // 8. Flush to disk
  _save();
  console.log('✅  Database ready (sql.js / WebAssembly SQLite)');
}

module.exports = { getDb, initDatabase };

