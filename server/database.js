const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'peditrack.sqlite');
// Ensure parent directory exists (important when DB_PATH points to a mounted volume)
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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
  type        TEXT    DEFAULT 'Control de niÃ±o sano',
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
    insert.run('Dr. Roberto PediÃ¡trico', 'doc@peditrack.com', bcrypt.hashSync('Doc2024!', 10), 'pediatra');
    insert.run('Padre/Madre de Prueba', 'tutor@peditrack.com', bcrypt.hashSync('Tutor2024!', 10), 'tutor');
  });
  seed();
  console.log('âœ“ Usuarios de prueba creados (admin, pediatra, tutor)');
}

function runMigrations() {
  // Fase F: prÃ³xima visita sugerida en consultas
  try { db.prepare('ALTER TABLE consultations ADD COLUMN next_visit_date TEXT').run(); } catch (e) {}

  // Fase A: historia clÃ­nica estructurada en patients
  const phaseACols = [
    'ALTER TABLE patients ADD COLUMN birth_state       TEXT',
    'ALTER TABLE patients ADD COLUMN birth_city        TEXT',
    'ALTER TABLE patients ADD COLUMN parents_education TEXT',
    'ALTER TABLE patients ADD COLUMN gestational_age   INTEGER',
    'ALTER TABLE patients ADD COLUMN gestational_type  TEXT',
    'ALTER TABLE patients ADD COLUMN delivery_type     TEXT',
    'ALTER TABLE patients ADD COLUMN birth_weight      REAL',
    'ALTER TABLE patients ADD COLUMN birth_height      REAL',
    'ALTER TABLE patients ADD COLUMN birth_head_circ   REAL',
    'ALTER TABLE patients ADD COLUMN apgar_1           INTEGER',
    'ALTER TABLE patients ADD COLUMN apgar_5           INTEGER',
    'ALTER TABLE patients ADD COLUMN silverman_score   INTEGER',
    'ALTER TABLE patients ADD COLUMN nicu_stay         INTEGER DEFAULT 0',
    'ALTER TABLE patients ADD COLUMN nicu_days         INTEGER',
    'ALTER TABLE patients ADD COLUMN breastfed         INTEGER',
    'ALTER TABLE patients ADD COLUMN breastfed_months  INTEGER',
    'ALTER TABLE patients ADD COLUMN torch_exposure    TEXT',
    'ALTER TABLE patients ADD COLUMN neonatal_screening INTEGER',
    'ALTER TABLE patients ADD COLUMN maternal_age      INTEGER',
    'ALTER TABLE patients ADD COLUMN prenatal_visits   INTEGER',
  ];
  for (const sql of phaseACols) {
    try { db.prepare(sql).run(); } catch (e) {}
  }

  // Fase A: tabla de antecedentes heredofamiliares
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      condition    TEXT NOT NULL,
      relationship TEXT NOT NULL,
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // Fase C: signos vitales en consultas
  const faseCCols = [
    'ALTER TABLE consultations ADD COLUMN heart_rate   INTEGER',
    'ALTER TABLE consultations ADD COLUMN resp_rate    INTEGER',
    'ALTER TABLE consultations ADD COLUMN temperature  REAL',
    'ALTER TABLE consultations ADD COLUMN spo2         REAL',
    'ALTER TABLE consultations ADD COLUMN bp_systolic  INTEGER',
    'ALTER TABLE consultations ADD COLUMN bp_diastolic INTEGER',
  ];
  for (const sql of faseCCols) {
    try { db.prepare(sql).run(); } catch (e) {}
  }

  // Fase D: módulo de neurodesarrollo
  db.exec(`
    CREATE TABLE IF NOT EXISTS neurodevelopment_assessments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      type         TEXT NOT NULL CHECK(type IN ('denver','mchat')),
      age_months   INTEGER,
      date         TEXT NOT NULL,
      responses    TEXT,
      score        REAL,
      risk_level   TEXT CHECK(risk_level IN ('bajo','moderado','alto')),
      alarms       TEXT,
      notes        TEXT,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // Fase E: módulo de vacunación NOM-031
  db.exec(`
    CREATE TABLE IF NOT EXISTS vaccinations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      vaccine        TEXT NOT NULL,
      dose           TEXT NOT NULL,
      target_months  INTEGER NOT NULL,
      scheduled_date TEXT,
      applied_at     TEXT,
      lot            TEXT,
      notes          TEXT,
      applied_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('âœ” Migraciones ejecutadas');
}

function initDB() {
  db.exec(SCHEMA);
  runMigrations();
  seedDefaultUsers();
  console.log('âœ“ Base de datos inicializada');
}

module.exports = { db, initDB };
