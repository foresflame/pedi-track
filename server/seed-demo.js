/**
 * seed-demo.js — Datos ficticios para pruebas.
 *
 * Crea pediatras, tutores, pacientes, consultas (con antropometría que sigue
 * curvas de crecimiento aproximadas para que se vean las gráficas) y algunas
 * citas próximas.
 *
 * Es IDEMPOTENTE: todo lo demo se marca con email @demo.pt (usuarios) y con
 * "_demo":true dentro de onboarding_data (pacientes). Al re-ejecutarlo, primero
 * borra lo demo anterior y lo vuelve a crear desde cero. NO toca datos reales.
 *
 * Uso:
 *   node server/seed-demo.js            → crea/recrea los datos demo
 *   node server/seed-demo.js --clean    → solo borra los datos demo
 */

const bcrypt = require('bcryptjs');
const { db, initDB } = require('./database');

initDB(); // asegura esquema + migraciones

const DEMO_EMAIL_TAG = '@demo.pt';
const DEMO_PASSWORD  = 'Demo2024!';
const HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);

// ── Utilidades ────────────────────────────────────────────────────────────
const rnd   = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.floor(rnd(min, max + 1));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const iso   = d => d.toISOString().slice(0, 10);

function addMonths(date, m) { const d = new Date(date); d.setMonth(d.getMonth() + m); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }

// Medianas OMS aproximadas (niño). Se usan como base y se les aplica un
// desfase por percentil para que cada niño tenga su propia curva.
const MED_W = { 0:3.3, 1:4.5, 2:5.6, 3:6.4, 4:7.0, 6:7.9, 9:8.9, 12:9.6, 18:10.9, 24:12.2, 36:14.3, 48:16.3, 60:18.3, 72:20.5, 84:22.9, 96:25.6 };
const MED_H = { 0:50, 1:54.7, 2:58.4, 3:61.4, 4:63.9, 6:67.6, 9:72, 12:75.7, 18:82.3, 24:87.8, 36:96.1, 48:103.3, 60:110, 72:116, 84:121.7, 96:127.3 };

function interp(table, ageM) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (ageM <= keys[0]) return table[keys[0]];
  if (ageM >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  let lo = keys[0];
  for (const k of keys) { if (k <= ageM) lo = k; }
  const hi = keys[keys.indexOf(lo) + 1];
  const t = (ageM - lo) / (hi - lo);
  return table[lo] + (table[hi] - table[lo]) * t;
}

function suggestNextVisit(ageM, fromDate) {
  let days;
  if      (ageM < 2)  days = 30;
  else if (ageM < 6)  days = 30;
  else if (ageM < 12) days = 60;
  else if (ageM < 24) days = 90;
  else if (ageM < 60) days = 180;
  else                days = 365;
  return iso(addDays(fromDate, days));
}

function vitalsForAge(ageM) {
  let fc, fr;
  if      (ageM < 1)  { fc = rndInt(110, 160); fr = rndInt(35, 55); }
  else if (ageM < 12) { fc = rndInt(100, 150); fr = rndInt(28, 45); }
  else if (ageM < 24) { fc = rndInt(95, 140);  fr = rndInt(22, 38); }
  else if (ageM < 60) { fc = rndInt(85, 125);  fr = rndInt(20, 32); }
  else                { fc = rndInt(70, 115);  fr = rndInt(16, 26); }
  return {
    heart_rate: fc,
    resp_rate: fr,
    temperature: +(rnd(36.2, 37.3)).toFixed(1),
    spo2: rndInt(96, 100),
    bp_systolic: rndInt(85, 110),
    bp_diastolic: rndInt(55, 72),
  };
}

// ── Catálogos de datos ficticios ───────────────────────────────────────────
const PEDIATRAS = [
  { name: 'Dra. Ana María Gómez Salazar',   email: 'ana.gomez'    + DEMO_EMAIL_TAG, specialty: 'Pediatría general',           license: 'PED-48213', phone: '999-123-4501', office_address: 'Av. Colón 245, Mérida, Yuc.',   description: 'Pediatra con 12 años de experiencia en control del niño sano y lactancia.' },
  { name: 'Dr. Luis Fernando Ramírez Ortega', email: 'luis.ramirez' + DEMO_EMAIL_TAG, specialty: 'Neonatología',               license: 'PED-51922', phone: '999-123-4502', office_address: 'Calle 60 #310, Centro, Mérida.',  description: 'Especialista en recién nacidos y prematuros.' },
  { name: 'Dra. Sofía Herrera Mendoza',     email: 'sofia.herrera' + DEMO_EMAIL_TAG, specialty: 'Neumología pediátrica',       license: 'PED-46107', phone: '999-123-4503', office_address: 'Prol. Montejo 118, Mérida.',      description: 'Atención de asma y enfermedades respiratorias en la infancia.' },
  { name: 'Dr. Jorge Alberto Núñez Castillo', email: 'jorge.nunez' + DEMO_EMAIL_TAG, specialty: 'Pediatría general',           license: 'PED-53340', phone: '999-123-4504', office_address: 'Av. García Lavín 500, Mérida.',   description: 'Seguimiento integral del desarrollo infantil.' },
  { name: 'Dra. Valentina Torres Ríos',     email: 'val.torres'   + DEMO_EMAIL_TAG, specialty: 'Endocrinología pediátrica',   license: 'PED-49988', phone: '999-123-4505', office_address: 'Calle 21 #90, Col. México, Mérida.', description: 'Crecimiento, diabetes y tiroides en niños y adolescentes.' },
];

const NOMBRES = ['Santiago','Mateo','Sebastián','Leonardo','Emiliano','Diego','Iker','Bruno','Thiago','Matías',
                 'Daniela','Valeria','Camila','Regina','Ximena','Fernanda','Isabella','Renata','Emilia','Victoria'];
const APELLIDOS = ['García','Martínez','López','Hernández','González','Pérez','Sánchez','Ramírez','Torres','Flores',
                   'Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Jiménez','Vázquez','Castillo','Ortega'];
const NOMBRES_MADRE = ['María','Guadalupe','Lucía','Gabriela','Paola','Adriana','Mariana','Karla','Verónica','Diana'];
const ALERGIAS = ['Ninguna','Ninguna','Ninguna','Ninguna','Penicilina','Huevo','Nueces','Ácaros del polvo','Lactosa','Mariscos'];
const CRONICOS = ['Ninguno','Ninguno','Ninguno','Ninguno','Ninguno','Salbutamol PRN (asma)','Levotiroxina','Loratadina estacional'];
const ESTADOS  = ['Yucatán','Campeche','Quintana Roo','Tabasco','Chiapas'];
const CIUDADES = ['Mérida','Campeche','Cancún','Villahermosa','Tuxtla'];
const VISITAS  = [0, 1, 2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60, 72, 84]; // meses de control del niño sano

// ── Limpieza de datos demo previos ──────────────────────────────────────────
function cleanDemo() {
  const demoUsers = db.prepare(`SELECT id FROM users WHERE email LIKE ?`).all('%' + DEMO_EMAIL_TAG);
  const ids = demoUsers.map(u => u.id);
  // Pacientes demo (marca en onboarding_data o vinculados a usuarios demo)
  const demoPatients = db.prepare(
    `SELECT id FROM patients WHERE onboarding_data LIKE '%"_demo":true%'
     OR doctor_id IN (${ids.length ? ids.join(',') : 'NULL'})
     OR tutor_id  IN (${ids.length ? ids.join(',') : 'NULL'})`
  ).all();

  const del = db.transaction(() => {
    for (const p of demoPatients) {
      db.prepare('DELETE FROM patients WHERE id = ?').run(p.id); // cascada: consultas, vacunas, neuro, citas
    }
    db.prepare(`DELETE FROM users WHERE email LIKE ?`).run('%' + DEMO_EMAIL_TAG);
  });
  del();
  return { users: demoUsers.length, patients: demoPatients.length };
}

// ── Inserción ────────────────────────────────────────────────────────────────
function seed() {
  const insUser = db.prepare(
    `INSERT INTO users (name, email, password, role, specialty, license, phone, office_address, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insTutor = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'tutor')`);
  const insPatient = db.prepare(`
    INSERT INTO patients (name, birth_date, sex, weight, height, doctor_id, tutor_id, onboarding_data,
                          birth_weight, birth_height, gestational_age, delivery_type, breastfed, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  const insConsult = db.prepare(`
    INSERT INTO consultations (patient_id, doctor_id, date, type, weight, height, head_circ, notes,
                               next_visit_date, heart_rate, resp_rate, temperature, spo2, bp_systolic, bp_diastolic,
                               created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insAppt = db.prepare(
    `INSERT INTO appointments (patient_id, doctor_id, date, time, status, notes) VALUES (?, ?, ?, ?, ?, ?)`);

  const today = new Date();
  const summary = { pediatras: 0, tutores: 0, pacientes: 0, consultas: 0, citas: 0, citasVencidas: 0 };
  let usedNames = new Set();

  const run = db.transaction(() => {
    PEDIATRAS.forEach((ped, pi) => {
      const docId = insUser.run(ped.name, ped.email, HASH, 'pediatra',
        ped.specialty, ped.license, ped.phone, ped.office_address, ped.description).lastInsertRowid;
      summary.pediatras++;

      const numPatients = rndInt(4, 6);
      for (let k = 0; k < numPatients; k++) {
        // Nombre único
        let first, last, full;
        do { first = pick(NOMBRES); last = pick(APELLIDOS); full = `${first} ${last} ${pick(APELLIDOS)}`; }
        while (usedNames.has(full));
        usedNames.add(full);

        const isF = ['Daniela','Valeria','Camila','Regina','Ximena','Fernanda','Isabella','Renata','Emilia','Victoria'].includes(first);
        const sex = isF ? 'Femenino' : 'Masculino';

        // Edad entre 1 mes y 8 años
        const ageMonthsNow = rndInt(1, 96);
        const birth = addMonths(today, -ageMonthsNow);
        const birthISO = iso(birth);

        // Desfase de percentil por niño (-1.5σ a +1.5σ aprox como % de la mediana)
        const wOffset = rnd(-0.14, 0.14);
        const hOffset = rnd(-0.06, 0.06);

        const allergies = pick(ALERGIAS);
        const chronic   = pick(CRONICOS);
        const idx = pick([0,1,2,3,4]);

        const onboarding = {
          _demo: true,
          'Fecha de nacimiento': birthISO,
          'Sexo': sex,
          'known-allergies': allergies,
          'chronic-meds': chronic,
          'blood-type': pick(['O+','O+','A+','B+','A-','AB+']),
          'Estado de nacimiento': ESTADOS[idx],
          'Ciudad/Municipio': CIUDADES[idx],
          'Nombre de la madre': `${pick(NOMBRES_MADRE)} ${last}`,
          'Nombre del padre': `${pick(['Jorge','Luis','Carlos','Roberto','Miguel','Andrés'])} ${last}`,
        };

        // Datos al nacer
        const birthW = +rnd(2.6, 3.9).toFixed(2);
        const birthH = +rnd(47, 52).toFixed(0);
        const gest   = rndInt(37, 41);
        const delivery = pick(['Parto natural','Cesárea']);

        // Tutor
        const tutorName = `${pick(NOMBRES_MADRE)} ${last} ${pick(APELLIDOS)}`;
        const tutorEmail = `tutor.${first.toLowerCase()}.${docId}${k}${DEMO_EMAIL_TAG}`;
        const tutorId = insTutor.run(tutorName, tutorEmail, HASH).lastInsertRowid;
        summary.tutores++;

        // Peso/talla actuales (última consulta)
        const wNow = +(interp(MED_W, ageMonthsNow) * (1 + wOffset)).toFixed(1);
        const hNow = +(interp(MED_H, ageMonthsNow) * (1 + hOffset)).toFixed(1);

        const patientId = insPatient.run(
          full, birthISO, sex, wNow, hNow, docId, tutorId, JSON.stringify(onboarding),
          birthW, birthH, gest, delivery, gest >= 37 ? 1 : 0
        ).lastInsertRowid;
        summary.pacientes++;

        // Consultas históricas en los meses de control aplicables a su edad
        const applicable = VISITAS.filter(m => m <= ageMonthsNow);
        // asegurar al menos 2 consultas
        if (applicable.length < 2) applicable.push(ageMonthsNow);
        applicable.forEach((m, ci) => {
          const cDate = addMonths(birth, m);
          if (cDate > today) return;
          const w = +(interp(MED_W, m) * (1 + wOffset + rnd(-0.02, 0.02))).toFixed(1);
          const h = +(interp(MED_H, m) * (1 + hOffset + rnd(-0.01, 0.01))).toFixed(1);
          const head = m <= 36 ? +(rnd(34, 50)).toFixed(1) : null;
          const v = vitalsForAge(m);
          const isLast = ci === applicable.length - 1;
          const enfermo = Math.random() < 0.15;
          insConsult.run(
            patientId, docId, iso(cDate),
            enfermo ? 'Enfermedad' : 'Control de niño sano',
            w, h, head,
            enfermo ? pick(['Cuadro respiratorio leve, se indica manejo sintomático.','Otitis media, tratamiento antibiótico.','Gastroenteritis, hidratación oral.'])
                    : 'Desarrollo adecuado para la edad. Continúa esquema de vacunación.',
            isLast ? suggestNextVisit(ageMonthsNow, cDate) : suggestNextVisit(m, cDate),
            v.heart_rate, v.resp_rate, v.temperature, v.spo2, v.bp_systolic, v.bp_diastolic,
            iso(cDate) + ' 12:00:00' // created_at real → la última consulta define la próxima visita
          );
          summary.consultas++;
        });

        // Cita próxima para ~1 de cada 3 pacientes
        if (Math.random() < 0.33) {
          const apptDate = iso(addDays(today, rndInt(1, 20)));
          insAppt.run(patientId, docId, apptDate, pick(['09:00','09:30','10:00','11:00','12:00','16:00','16:30']),
            pick(['pendiente','confirmada']), 'Cita de control');
          summary.citas++;
        }

        // Cita VENCIDA sin atender (no-show) para ~1 de cada 3 pacientes:
        // fecha pasada pero aún pendiente/confirmada. Sirve para probar la
        // limpieza de citas vencidas.
        if (Math.random() < 0.35) {
          const pastDate = iso(addDays(today, -rndInt(3, 45)));
          try {
            insAppt.run(patientId, docId, pastDate, pick(['08:30','09:00','10:30','11:30','17:00']),
              pick(['pendiente','confirmada']), 'No asistió');
            summary.citasVencidas = (summary.citasVencidas || 0) + 1;
          } catch (e) { /* colisión de slot único, se ignora */ }
        }
      }
    });
  });
  run();
  return summary;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const cleanOnly = process.argv.includes('--clean');
console.log('\n🧹 Limpiando datos demo previos...');
const cleaned = cleanDemo();
console.log(`   Borrados: ${cleaned.patients} paciente(s) y ${cleaned.users} usuario(s) demo.`);

if (cleanOnly) {
  console.log('✔ Solo limpieza (--clean). Listo.\n');
  process.exit(0);
}

console.log('🌱 Generando datos ficticios...');
const s = seed();
console.log('\n✔ Datos demo creados:');
console.log(`   • ${s.pediatras} pediatras`);
console.log(`   • ${s.pacientes} pacientes`);
console.log(`   • ${s.tutores} tutores`);
console.log(`   • ${s.consultas} consultas`);
console.log(`   • ${s.citas} citas próximas`);
console.log(`   • ${s.citasVencidas} citas vencidas sin atender (para probar la limpieza)`);
console.log('\n🔑 Acceso (todos con la misma contraseña):');
console.log(`   Contraseña: ${DEMO_PASSWORD}`);
PEDIATRAS.forEach(p => console.log(`   • ${p.email}`));
console.log('\n   (Los tutores usan emails tutor.<nombre>...@demo.pt con la misma contraseña.)\n');

// Forzar checkpoint del WAL para que los cambios queden en el archivo principal.
// En Google Drive el WAL entre procesos no siempre se sincroniza, y sin esto el
// proceso del server no ve los usuarios recién creados (login demo daría 401).
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}

process.exit(0);
