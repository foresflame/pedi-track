const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function parseConsult(c) {
  if (!c) return null;
  return { ...c, medications: c.medications ? JSON.parse(c.medications) : [] };
}

/**
 * Calcula la fecha sugerida de próxima visita según la edad del paciente.
 * Frecuencia basada en lineamientos AAP / NOM-031.
 * @param {string} birthDateStr  — 'YYYY-MM-DD'
 * @param {string} [consultDateStr] — 'YYYY-MM-DD' (default: hoy)
 * @returns {string|null} 'YYYY-MM-DD'
 */
function suggestNextVisit(birthDateStr, consultDateStr) {
  if (!birthDateStr) return null;
  const birth   = new Date(birthDateStr);
  const consult = consultDateStr ? new Date(consultDateStr) : new Date();
  if (isNaN(birth.getTime())) return null;

  const ageInDays = Math.floor((consult - birth) / 86_400_000);

  let daysToAdd;
  if      (ageInDays <  61)  daysToAdd = 14;   // < 2 meses  → 2 semanas
  else if (ageInDays < 184)  daysToAdd = 30;   // 2-6 meses  → 1 mes
  else if (ageInDays < 366)  daysToAdd = 60;   // 6-12 meses → 2 meses
  else if (ageInDays < 731)  daysToAdd = 90;   // 1-2 años   → 3 meses
  else if (ageInDays < 1826) daysToAdd = 180;  // 2-5 años   → 6 meses
  else                       daysToAdd = 365;  // 5+ años    → 12 meses

  const next = new Date(consult);
  next.setDate(next.getDate() + daysToAdd);
  return next.toISOString().slice(0, 10);
}

function canAccessPatient(user, patient) {
  if (user.role === 'admin') return true;
  if (user.role === 'pediatra') return patient.doctor_id === user.id;
  if (user.role === 'tutor') return patient.tutor_id === user.id;
  return false;
}

// GET /api/patients/:patientId/consultations
router.get('/', (req, res) => {
  const patientId = parseInt(req.params.patientId);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canAccessPatient(req.user, patient)) return res.status(403).json({ error: 'Acceso denegado' });

  const rows = db.prepare('SELECT * FROM consultations WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
  res.json(rows.map(parseConsult));
});

// POST /api/patients/:patientId/consultations
router.post('/', requireRole('admin', 'pediatra'), (req, res) => {
  const patientId = parseInt(req.params.patientId);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });

  if (req.user.role === 'pediatra' && patient.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes registrar consultas de pacientes de otro doctor' });
  }

  const { date, type, weight, height, head_circ, notes, medications } = req.body;
  if (!weight || !height) return res.status(400).json({ error: 'Peso y estatura son requeridos' });

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateStr  = date || new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const nextVisit = suggestNextVisit(patient.birth_date, todayIso);

  const result = db.prepare(`
    INSERT INTO consultations (patient_id, doctor_id, date, type, weight, height, head_circ, notes, medications, next_visit_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId,
    req.user.id,
    dateStr,
    type || 'Control de niño sano',
    parseFloat(weight),
    parseFloat(height),
    head_circ ? parseFloat(head_circ) : null,
    notes || '',
    medications ? JSON.stringify(medications) : null,
    nextVisit
  );

  // Actualizar peso y talla del paciente con la consulta más reciente
  db.prepare('UPDATE patients SET weight = ?, height = ? WHERE id = ?')
    .run(parseFloat(weight), parseFloat(height), patientId);

  const created = parseConsult(db.prepare('SELECT * FROM consultations WHERE id = ?').get(result.lastInsertRowid));
  res.status(201).json(created);
});

// PUT /api/patients/:patientId/consultations/:id
router.put('/:id', requireRole('admin', 'pediatra'), (req, res) => {
  const patientId = parseInt(req.params.patientId);
  const id = parseInt(req.params.id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });

  if (req.user.role === 'pediatra' && patient.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const consult = db.prepare('SELECT * FROM consultations WHERE id = ? AND patient_id = ?').get(id, patientId);
  if (!consult) return res.status(404).json({ error: 'Consulta no encontrada' });

  const { type, weight, height, head_circ, notes, medications } = req.body;

  db.prepare(`
    UPDATE consultations SET
      type        = COALESCE(?, type),
      weight      = COALESCE(?, weight),
      height      = COALESCE(?, height),
      head_circ   = COALESCE(?, head_circ),
      notes       = COALESCE(?, notes),
      medications = COALESCE(?, medications)
    WHERE id = ?
  `).run(
    type || null,
    weight !== undefined ? parseFloat(weight) : null,
    height !== undefined ? parseFloat(height) : null,
    head_circ !== undefined ? parseFloat(head_circ) : null,
    notes !== undefined ? notes : null,
    medications !== undefined ? JSON.stringify(medications) : null,
    id
  );

  // Re-sync patient weight/height from most recent consultation
  const latest = db.prepare(
    'SELECT weight, height FROM consultations WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(patientId);
  if (latest) {
    db.prepare('UPDATE patients SET weight = ?, height = ? WHERE id = ?')
      .run(latest.weight, latest.height, patientId);
  }

  res.json(parseConsult(db.prepare('SELECT * FROM consultations WHERE id = ?').get(id)));
});

// DELETE /api/patients/:patientId/consultations/:id
router.delete('/:id', requireRole('admin', 'pediatra'), (req, res) => {
  const patientId = parseInt(req.params.patientId);
  const id = parseInt(req.params.id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });

  if (req.user.role === 'pediatra' && patient.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const consult = db.prepare('SELECT id FROM consultations WHERE id = ? AND patient_id = ?').get(id, patientId);
  if (!consult) return res.status(404).json({ error: 'Consulta no encontrada' });

  db.prepare('DELETE FROM consultations WHERE id = ?').run(id);

  // Re-sync patient weight/height
  const latest = db.prepare(
    'SELECT weight, height FROM consultations WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(patientId);
  if (latest) {
    db.prepare('UPDATE patients SET weight = ?, height = ? WHERE id = ?')
      .run(latest.weight, latest.height, patientId);
  }

  res.json({ message: 'Consulta eliminada correctamente' });
});

module.exports = router;
