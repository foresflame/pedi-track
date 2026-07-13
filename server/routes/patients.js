const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();
router.use(requireAuth);

const WITH_DOCTOR = `
  SELECT p.*, u.name as doctor_name, u.email as doctor_email,
         t.name as tutor_name, t.email as tutor_email,
         (SELECT next_visit_date FROM consultations
          WHERE patient_id = p.id AND next_visit_date IS NOT NULL
          ORDER BY created_at DESC LIMIT 1) AS next_visit_date
  FROM patients p
  LEFT JOIN users u ON u.id = p.doctor_id
  LEFT JOIN users t ON t.id = p.tutor_id
`;

function parsePatient(p) {
  if (!p) return null;
  return {
    ...p,
    onboarding_data: p.onboarding_data ? JSON.parse(p.onboarding_data) : null
  };
}

// GET /api/patients
router.get('/', (req, res) => {
  let rows;
  if (['admin','super_admin','asesor'].includes(req.user.role)) {
    // Opcional: filtrar por doctor_id (admin viendo un pediatra específico)
    if (req.query.doctor_id) {
      rows = db.prepare(`${WITH_DOCTOR} WHERE p.doctor_id = ? ORDER BY p.name`).all(parseInt(req.query.doctor_id));
    } else {
      rows = db.prepare(`${WITH_DOCTOR} ORDER BY p.name`).all();
    }
  } else if (req.user.role === 'pediatra') {
    rows = db.prepare(`${WITH_DOCTOR} WHERE p.doctor_id = ? ORDER BY p.name`).all(req.user.id);
  } else {
    // tutor — retorna solo su paciente
    const p = db.prepare(`${WITH_DOCTOR} WHERE p.tutor_id = ?`).get(req.user.id);
    return res.json(p ? parsePatient(p) : null);
  }
  res.json(rows.map(parsePatient));
});

// GET /api/patients/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const p = db.prepare(`${WITH_DOCTOR} WHERE p.id = ?`).get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

  if (req.user.role === 'tutor' && p.tutor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (req.user.role === 'pediatra' && p.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const parsed = parsePatient(p);
  // Incluir antecedentes heredofamiliares
  parsed.family_history = db.prepare(
    'SELECT id, condition, relationship, notes FROM family_history WHERE patient_id = ? ORDER BY id'
  ).all(id);

  res.json(parsed);
});

// POST /api/patients — crear paciente (admin, pediatra)
router.post('/', requireRole('admin', 'pediatra'), (req, res) => {
  const {
    name, birth_date, sex, weight, height, onboarding_data, tutor_email, tutor_name,
    family_history,
    // Fase A: campos estructurados
    birth_state, birth_city, parents_education,
    gestational_age, gestational_type, delivery_type,
    birth_weight, birth_height, birth_head_circ,
    apgar_1, apgar_5, silverman_score,
    nicu_stay, nicu_days, breastfed, breastfed_months,
    torch_exposure, neonatal_screening, maternal_age, prenatal_visits,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre del paciente es requerido' });

  const doctor_id = req.user.role === 'pediatra' ? req.user.id : (req.body.doctor_id || null);

  let tutor_id = null;
  let generatedPassword = null;

  // Crear cuenta tutor si se proporciona email
  if (tutor_email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(tutor_email.trim().toLowerCase());
    if (existing) {
      tutor_id = existing.id;
    } else {
      const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      generatedPassword = Array.from(crypto.randomBytes(9), b => ALPHABET[b % ALPHABET.length]).join('');
      const tutorResult = db.prepare(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
      ).run(
        tutor_name || 'Tutor',
        tutor_email.trim().toLowerCase(),
        bcrypt.hashSync(generatedPassword, 10),
        'tutor'
      );
      tutor_id = tutorResult.lastInsertRowid;
    }
  }

  // Extraer birth_date y weight/height del onboarding_data si no vienen directos
  let finalBirthDate = birth_date;
  let finalWeight = parseFloat(weight) || 0;
  let finalHeight = parseFloat(height) || 0;
  let finalSex = sex;

  if (onboarding_data) {
    const od = typeof onboarding_data === 'string' ? JSON.parse(onboarding_data) : onboarding_data;
    if (!finalBirthDate && od['patient-birth-date']) finalBirthDate = od['patient-birth-date'];
    if (!finalBirthDate && od['Fecha de nacimiento']) finalBirthDate = od['Fecha de nacimiento'];
    if (!finalSex && od['Sexo']) finalSex = od['Sexo'];
  }

  const result = db.prepare(`
    INSERT INTO patients (
      name, birth_date, sex, weight, height, doctor_id, tutor_id, onboarding_data,
      birth_state, birth_city, parents_education,
      gestational_age, gestational_type, delivery_type,
      birth_weight, birth_height, birth_head_circ,
      apgar_1, apgar_5, silverman_score,
      nicu_stay, nicu_days, breastfed, breastfed_months,
      torch_exposure, neonatal_screening, maternal_age, prenatal_visits
    ) VALUES (
      ?,?,?,?,?,?,?,?,
      ?,?,?,
      ?,?,?,
      ?,?,?,
      ?,?,?,
      ?,?,?,?,
      ?,?,?,?
    )
  `).run(
    name.trim(),
    finalBirthDate || null,
    finalSex || null,
    finalWeight,
    finalHeight,
    doctor_id,
    tutor_id,
    onboarding_data ? JSON.stringify(onboarding_data) : null,
    birth_state || null, birth_city || null,
    parents_education ? JSON.stringify(parents_education) : null,
    gestational_age ? parseInt(gestational_age) : null,
    gestational_type || null, delivery_type || null,
    birth_weight ? parseFloat(birth_weight) : null,
    birth_height ? parseFloat(birth_height) : null,
    birth_head_circ ? parseFloat(birth_head_circ) : null,
    apgar_1 ? parseInt(apgar_1) : null,
    apgar_5 ? parseInt(apgar_5) : null,
    silverman_score ? parseInt(silverman_score) : null,
    nicu_stay ? 1 : 0, nicu_days ? parseInt(nicu_days) : null,
    breastfed ? 1 : 0, breastfed_months ? parseInt(breastfed_months) : null,
    torch_exposure ? JSON.stringify(torch_exposure) : null,
    neonatal_screening ? 1 : 0,
    maternal_age ? parseInt(maternal_age) : null,
    prenatal_visits ? parseInt(prenatal_visits) : null,
  );

  const patientId = result.lastInsertRowid;

  // Insertar antecedentes heredofamiliares si se proporcionaron
  if (Array.isArray(family_history) && family_history.length > 0) {
    const insertFH = db.prepare(
      'INSERT INTO family_history (patient_id, condition, relationship, notes) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        if (row.condition && row.relationship) {
          insertFH.run(patientId, row.condition, row.relationship, row.notes || null);
        }
      }
    });
    insertMany(family_history);
  }

  const created = parsePatient(db.prepare(`${WITH_DOCTOR} WHERE p.id = ?`).get(patientId));

  // Enviar correo de bienvenida si se creó una nueva cuenta de tutor
  if (generatedPassword && tutor_email) {
    sendWelcomeEmail({
      to:          tutor_email,
      tutorName:   tutor_name || 'Tutor',
      patientName: name.trim(),
      password:    generatedPassword
    }).catch(err => console.warn('⚠ Correo de bienvenida no enviado:', err.message));
  }

  res.status(201).json({
    patient: created,
    tutor: tutor_id ? {
      id: tutor_id,
      email: tutor_email,
      password: generatedPassword
    } : null
  });
});

// PUT /api/patients/:id — editar paciente
router.put('/:id', requireRole('admin', 'pediatra'), (req, res) => {
  const id = parseInt(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

  if (req.user.role === 'pediatra' && p.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes editar pacientes de otro doctor' });
  }

  const { name, birth_date, sex, weight, height, onboarding_data } = req.body;

  db.prepare(`
    UPDATE patients SET
      name            = COALESCE(?, name),
      birth_date      = COALESCE(?, birth_date),
      sex             = COALESCE(?, sex),
      weight          = COALESCE(?, weight),
      height          = COALESCE(?, height),
      onboarding_data = COALESCE(?, onboarding_data)
    WHERE id = ?
  `).run(
    name || null,
    birth_date || null,
    sex || null,
    weight !== undefined ? parseFloat(weight) : null,
    height !== undefined ? parseFloat(height) : null,
    onboarding_data ? JSON.stringify(onboarding_data) : null,
    id
  );

  res.json(parsePatient(db.prepare(`${WITH_DOCTOR} WHERE p.id = ?`).get(id)));
});

// PUT /api/patients/:id/assign — asignar doctor (admin)
router.put('/:id/assign', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const { doctor_id } = req.body;

  const p = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

  db.prepare('UPDATE patients SET doctor_id = ? WHERE id = ?').run(doctor_id || null, id);
  res.json(parsePatient(db.prepare(`${WITH_DOCTOR} WHERE p.id = ?`).get(id)));
});

// PUT /api/patients/:id/active — alternar estado activo (pediatra/admin)
router.put('/:id/active', requireRole('admin', 'pediatra'), (req, res) => {
  const id = parseInt(req.params.id);
  const { active } = req.body;
  const p = db.prepare('SELECT id, doctor_id FROM patients WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (req.user.role === 'pediatra' && p.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes modificar este paciente' });
  }
  db.prepare('UPDATE patients SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  res.json({ id, active: active ? 1 : 0 });
});

// DELETE /api/patients/:id — eliminar paciente (admin)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const p = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

  db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  res.json({ message: 'Paciente eliminado correctamente' });
});

module.exports = router;
