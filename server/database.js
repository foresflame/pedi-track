const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'peditrack.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK(role IN ('admin','pediatra','tutor')),
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  birth_date      TEXT,
  sex             TEXT,
  weight          REAL    DEFAULT 0,
  height          REAL    DEFAULT 0,
  doctor_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tutor_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  onboarding_data TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consultations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date        TEXT    NOT NULL,
  type        TEXT    DEFAULT 'Control de niño sano',
  weight      REAL,
  height      REAL,
  head_circ   REAL,
  notes       TEXT,
  medications TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time   TEXT    NOT NULL,
  end_time     TEXT    NOT NULL,
  slot_minutes INTEGER DEFAULT 30,
  UNIQUE(doctor_id, day_of_week, start_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  time        TEXT    NOT NULL,
  status      TEXT    DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmada','cancelada','completada')),
  notes       TEXT,
  created_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(doctor_id, date, time)
);
`;

function seedDefaultUsers() {
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
  const seed = db.transaction(() => {
    insert.run('Administrador Principal', 'admin@peditrack.com', bcrypt.hashSync('Admin2024!', 10), 'admin');
    insert.run('Dr. Roberto Pediátrico', 'doc@peditrack.com', bcrypt.hashSync('Doc2024!', 10), 'pediatra');
    insert.run('Padre/Madre de Prueba', 'tutor@peditrack.com', bcrypt.hashSync('Tutor2024!', 10), 'tutor');
  });
  seed();
  console.log('✓ Usuarios de prueba creados (admin, pediatra, tutor)');
}

function initDB() {
  db.exec(SCHEMA);
  seedDefaultUsers();
  console.log('✓ Base de datos inicializada');
}

module.exports = { db, initDB };
