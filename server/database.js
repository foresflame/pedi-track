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

function runMigrations() {
  // Fase F: próxima visita sugerida en consultas
  try { db.prepare('ALTER TABLE consultations ADD COLUMN next_visit_date TEXT').run(); } catch (e) {}

  // Fase A: historia clínica estructurada en patients
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

  // Calendario: patient_id nullable + columna label en appointments
  const apptCols = db.prepare('PRAGMA table_info(appointments)').all();
  const patCol   = apptCols.find(c => c.name === 'patient_id');
  if (patCol && patCol.notnull === 1) {
    // Recrear tabla sin NOT NULL en patient_id y con columna label
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE appointments_v2 (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id  INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date        TEXT    NOT NULL,
        time        TEXT    NOT NULL,
        status      TEXT    DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmada','cancelada','completada')),
        notes       TEXT,
        label       TEXT,
        created_at  TEXT    DEFAULT (datetime('now')),
        UNIQUE(doctor_id, date, time)
      );
      INSERT INTO appointments_v2 (id, patient_id, doctor_id, date, time, status, notes, created_at)
        SELECT id, patient_id, doctor_id, date, time, status, notes, created_at FROM appointments;
      DROP TABLE appointments;
      ALTER TABLE appointments_v2 RENAME TO appointments;
    `);
    db.pragma('foreign_keys = ON');
  }
  // Por si la tabla ya existe sin NOT NULL pero sin la columna label
  try { db.prepare('ALTER TABLE appointments ADD COLUMN label TEXT').run(); } catch(e) {}

  // Estado activo/inactivo del paciente
  try { db.prepare('ALTER TABLE patients ADD COLUMN active INTEGER DEFAULT 1').run(); } catch(e) {}

  // Recordatorio de próxima visita descartado (el pediatra lo quita del tablero)
  try { db.prepare('ALTER TABLE patients ADD COLUMN next_visit_dismissed INTEGER DEFAULT 0').run(); } catch(e) {}

  // Niveles de admin: super_admin, admin, asesor (además de pediatra y tutor)
  // SQLite no permite ALTER de un CHECK constraint — recreamos la tabla
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  const hasNewRoles = (() => {
    try {
      // Probamos insertar y deshacer
      db.exec('SAVEPOINT role_check; INSERT INTO users (name,email,password,role) VALUES (\'__t\',\'__t@__.com\',\'x\',\'asesor\'); ROLLBACK TO role_check; RELEASE role_check;');
      return true;
    } catch(e) {
      try { db.exec('ROLLBACK TO role_check; RELEASE role_check;'); } catch(_) {}
      return false;
    }
  })();
  if (!hasNewRoles && userCols.length > 0) {
    db.pragma('foreign_keys = OFF');
    const colNames = userCols.map(c => c.name).join(', ');
    db.exec(`
      CREATE TABLE users_v2 (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        email      TEXT    NOT NULL UNIQUE,
        password   TEXT    NOT NULL,
        role       TEXT    NOT NULL CHECK(role IN ('super_admin','admin','asesor','pediatra','tutor')),
        created_at TEXT    DEFAULT (datetime('now')),
        specialty       TEXT,
        license         TEXT,
        phone           TEXT,
        office_address  TEXT,
        description     TEXT,
        photo           TEXT,
        social_facebook  TEXT,
        social_instagram TEXT,
        social_whatsapp  TEXT,
        social_website   TEXT
      );
      INSERT INTO users_v2 (${colNames}) SELECT ${colNames} FROM users;
      DROP TABLE users;
      ALTER TABLE users_v2 RENAME TO users;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Promover admin@peditrack.com a super_admin si aún no lo es
  try {
    db.prepare("UPDATE users SET role = 'super_admin' WHERE email = 'admin@peditrack.com' AND role = 'admin'").run();
  } catch(e) {}

  // Limpieza de nombres con UTF-8 corrupto en datos antiguos (mojibake → UTF-8 correcto)
  try {
    const mojibakeFixes = [
      ['Ã±', 'ñ'], ['Ã³', 'ó'], ['Ã©', 'é'], ['Ã¡', 'á'], ['Ã­', 'í'], ['Ãº', 'ú'],
      ['Ã‘', 'Ñ'], ['Ã“', 'Ó'], ['Ã‰', 'É'],
    ];
    const usersToFix = db.prepare("SELECT id, name FROM users WHERE name LIKE '%Ã%'").all();
    for (const u of usersToFix) {
      let newName = u.name;
      for (const [bad, good] of mojibakeFixes) newName = newName.split(bad).join(good);
      if (newName !== u.name) {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(newName, u.id);
      }
    }
    if (usersToFix.length) console.log(`✓ Corrupción UTF-8 limpiada en ${usersToFix.length} usuario(s)`);
  } catch(e) {}

  // Perfil extendido del pediatra
  const userProfileCols = [
    'ALTER TABLE users ADD COLUMN specialty       TEXT',
    'ALTER TABLE users ADD COLUMN license         TEXT',
    'ALTER TABLE users ADD COLUMN phone           TEXT',
    'ALTER TABLE users ADD COLUMN office_address  TEXT',
    'ALTER TABLE users ADD COLUMN description     TEXT',
    'ALTER TABLE users ADD COLUMN photo           TEXT',
    'ALTER TABLE users ADD COLUMN social_facebook  TEXT',
    'ALTER TABLE users ADD COLUMN social_instagram TEXT',
    'ALTER TABLE users ADD COLUMN social_whatsapp  TEXT',
    'ALTER TABLE users ADD COLUMN social_website   TEXT',
  ];
  for (const sql of userProfileCols) {
    try { db.prepare(sql).run(); } catch (e) {}
  }

  // Fotos guardadas como base64 en la DB → archivos en disco (ruta /uploads/...)
  try {
    const { persistPhoto } = require('./services/photoStorage');
    const withInlinePhoto = db.prepare("SELECT id FROM users WHERE photo LIKE 'data:%'").all();
    for (const u of withInlinePhoto) {
      const photo = db.prepare('SELECT photo FROM users WHERE id = ?').get(u.id).photo;
      try {
        db.prepare('UPDATE users SET photo = ? WHERE id = ?').run(persistPhoto(u.id, photo), u.id);
      } catch (e) {
        console.warn(`⚠ No se pudo migrar la foto del usuario ${u.id}: ${e.message}`);
      }
    }
    if (withInlinePhoto.length) console.log(`✓ ${withInlinePhoto.length} foto(s) migradas de base64 a disco`);
  } catch(e) {}

  console.log('✔ Migraciones ejecutadas');
}

function initDB() {
  db.exec(SCHEMA);
  runMigrations();
  seedDefaultUsers();
  console.log('✓ Base de datos inicializada');
}

module.exports = { db, initDB };
