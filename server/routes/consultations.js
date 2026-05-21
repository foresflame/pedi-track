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
 * EvalÃºa signos vitales segÃºn la edad del paciente y retorna alertas.
 * @param {number} ageMonths  â€” edad en meses
 * @param {object} v          â€” { heart_rate, resp_rate, temperature, spo2, bp_systolic, bp_diastolic }
 * @returns {object}  { alerts: [{sign, value, level, msg}] }
 */
function getVitalAlerts(ageMonths, v) {
  const alerts = [];

  // â”€â”€ FC (Frecuencia CardÃ­aca) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.heart_rate != null) {
    let [lo, hi] = ageMonths < 1 ? [100,180] : ageMonths < 12 ? [100,160] :
                   ageMonths < 24 ? [90,150] : ageMonths < 60 ? [80,140] :
                   ageMonths < 144 ? [70,120] : [60,100];
    if (v.heart_rate < lo || v.heart_rate > hi) {
      alerts.push({ sign:'FC', value: v.heart_rate, unit:'lpm',
        level: v.heart_rate < lo * 0.85 || v.heart_rate > hi * 1.15 ? 'danger' : 'warning',
        msg: v.heart_rate < lo ? 'Bradicardia' : 'Taquicardia',
        normal: `${lo}â€“${hi} lpm` });
    }
  }

  // â”€â”€ FR (Frecuencia Respiratoria) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.resp_rate != null) {
    let [lo, hi] = ageMonths < 2 ? [30,60] : ageMonths < 12 ? [25,50] :
                   ageMonths < 60 ? [20,40] : [15,30];
    if (v.resp_rate < lo || v.resp_rate > hi) {
      alerts.push({ sign:'FR', value: v.resp_rate, unit:'rpm',
        level: v.resp_rate < lo * 0.8 || v.resp_rate > hi * 1.2 ? 'danger' : 'warning',
        msg: v.resp_rate < lo ? 'Bradipnea' : 'Taquipnea',
        normal: `${lo}â€“${hi} rpm` });
    }
  }

  // â”€â”€ Temperatura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.temperature != null) {
    if (v.temperature < 36.0) {
      alerts.push({ sign:'Temp', value: v.temperature, unit:'Â°C', level:'danger', msg:'Hipotermia', normal:'36.0â€“37.5 Â°C' });
    } else if (v.temperature >= 38.5) {
      alerts.push({ sign:'Temp', value: v.temperature, unit:'Â°C', level:'danger', msg:'Fiebre alta', normal:'36.0â€“37.5 Â°C' });
    } else if (v.temperature >= 37.6) {
      alerts.push({ sign:'Temp', value: v.temperature, unit:'Â°C', level:'warning', msg:'FebrÃ­cula', normal:'36.0â€“37.5 Â°C' });
    }
  }

  // â”€â”€ SpO2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.spo2 != null) {
    if (v.spo2 < 90) {
      alerts.push({ sign:'SpOâ‚‚', value: v.spo2, unit:'%', level:'danger', msg:'Hipoxemia severa', normal:'â‰¥95 %' });
    } else if (v.spo2 < 95) {
      alerts.push({ sign:'SpOâ‚‚', value: v.spo2, unit:'%', level:'warning', msg:'Hipoxemia leve', normal:'â‰¥95 %' });
    }
  }

  // â”€â”€ TA SistÃ³lica â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (v.bp_systolic != null) {
    let [lo, hi] = ageMonths < 12 ? [65,100] : ageMonths < 36 ? [70,110] :
                   ageMonths < 60 ? [75,115] : ageMonths < 120 ? [80,120] : [90,130];
    if (v.bp_systolic < lo || v.bp_systolic > hi) {
      alerts.push({ sign:'TAS', value: v.bp_systolic, unit:'mmHg',
        level: v.bp_systolic > hi + 10 || v.bp_systolic < lo - 10 ? 'danger' : 'warning',
        msg: v.bp_systolic < lo ? 'HipotensiÃ³n' : 'HipertensiÃ³n',
        normal: `${lo}â€“${hi} mmHg` });
    }
  }

  return alerts;
}

/**
 * Calcula la fecha sugerida de prÃ³xima visita segÃºn la edad del paciente.
 * Frecuencia basada en lineamientos AAP / NOM-031.
 * @param {string} birthDateStr  â€” 'YYYY-MM-DD'
 * @param {string} [consultDateStr] â€” 'YYYY-MM-DD' (default: hoy)
 * @returns {string|null} 'YYYY-MM-DD'
 */
function suggestNextVisit(birthDateStr, consultDateStr) {
  if (!birthDateStr) return null;
  const birth   = new Date(birthDateStr);
  const consult = consultDateStr ? new Date(consultDateStr) : new Date();
  if (isNaN(birth.getTime())) return null;

  const ageInDays = Math.floor((consult - birth) / 86_400_000);

  let daysToAdd;
  if      (ageInDays <  61)  daysToAdd = 14;   // < 2 meses  â†’ 2 semanas
  else if (ageInDays < 184)  daysToAdd = 30;   // 2-6 meses  â†’ 1 mes
  else if (ageInDays < 366)  daysToAdd = 60;   // 6-12 meses â†’ 2 meses
  else if (ageInDays < 731)  daysToAdd = 90;   // 1-2 aÃ±os   â†’ 3 meses
  else if (ageInDays < 1826) daysToAdd = 180;  // 2-5 aÃ±os   â†’ 6 meses
  else                       daysToAdd = 365;  // 5+ aÃ±os    â†’ 12 meses

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

  const { date, type, weight, height, head_circ, notes, medications,
          heart_rate, resp_rate, temperature, spo2, bp_systolic, bp_diastolic } = req.body;
  if (!weight || !height) return res.status(400).json({ error: 'Peso y estatura son requeridos' });

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateStr  = date || new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const nextVisit = suggestNextVisit(patient.birth_date, todayIso);

  // Calcular alertas de signos vitales
  const ageMonths = patient.birth_date
    ? Math.floor((new Date() - new Date(patient.birth_date)) / (30.44 * 86_400_000))
    : null;
  const vitalsPayload = { heart_rate: heart_rate ? parseInt(heart_rate) : null,
    resp_rate: resp_rate ? parseInt(resp_rate) : null,
    temperature: temperature ? parseFloat(temperature) : null,
    spo2: spo2 ? parseFloat(spo2) : null,
    bp_systolic: bp_systolic ? parseInt(bp_systolic) : null,
    bp_diastolic: bp_diastolic ? parseInt(bp_diastolic) : null };
  const vitalAlerts = ageMonths != null ? getVitalAlerts(ageMonths, vitalsPayload) : [];

  const result = db.prepare(`
    INSERT INTO consultations
      (patient_id, doctor_id, date, type, weight, height, head_circ, notes, medications, next_visit_date,
       heart_rate, resp_rate, temperature, spo2, bp_systolic, bp_diastolic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId, req.user.id, dateStr,
    type || 'Control de niÃ±o sano',
    parseFloat(weight), parseFloat(height),
    head_circ ? parseFloat(head_circ) : null,
    notes || '',
    medications ? JSON.stringify(medications) : null,
    nextVisit,
    vitalsPayload.heart_rate, vitalsPayload.resp_rate, vitalsPayload.temperature,
    vitalsPayload.spo2, vitalsPayload.bp_systolic, vitalsPayload.bp_diastolic
  );

  // Actualizar peso y talla del paciente con la consulta mÃ¡s reciente
  db.prepare('UPDATE patients SET weight = ?, height = ? WHERE id = ?')
    .run(parseFloat(weight), parseFloat(height), patientId);

  const created = parseConsult(db.prepare('SELECT * FROM consultations WHERE id = ?').get(result.lastInsertRowid));
  res.status(201).json({ ...created, vital_alerts: vitalAlerts });
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

  const { type, weight, height, head_circ, notes, medications,
          heart_rate, resp_rate, temperature, spo2, bp_systolic, bp_diastolic } = req.body;

  db.prepare(`
    UPDATE consultations SET
      type         = COALESCE(?, type),
      weight       = COALESCE(?, weight),
      height       = COALESCE(?, height),
      head_circ    = COALESCE(?, head_circ),
      notes        = COALESCE(?, notes),
      medications  = COALESCE(?, medications),
      heart_rate   = COALESCE(?, heart_rate),
      resp_rate    = COALESCE(?, resp_rate),
      temperature  = COALESCE(?, temperature),
      spo2         = COALESCE(?, spo2),
      bp_systolic  = COALESCE(?, bp_systolic),
      bp_diastolic = COALESCE(?, bp_diastolic)
    WHERE id = ?
  `).run(
    type || null,
    weight !== undefined ? parseFloat(weight) : null,
    height !== undefined ? parseFloat(height) : null,
    head_circ !== undefined ? parseFloat(head_circ) : null,
    notes !== undefined ? notes : null,
    medications !== undefined ? JSON.stringify(medications) : null,
    heart_rate !== undefined ? (heart_rate ? parseInt(heart_rate) : null) : null,
    resp_rate !== undefined ? (resp_rate ? parseInt(resp_rate) : null) : null,
    temperature !== undefined ? (temperature ? parseFloat(temperature) : null) : null,
    spo2 !== undefined ? (spo2 ? parseFloat(spo2) : null) : null,
    bp_systolic !== undefined ? (bp_systolic ? parseInt(bp_systolic) : null) : null,
    bp_diastolic !== undefined ? (bp_diastolic ? parseInt(bp_diastolic) : null) : null,
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
