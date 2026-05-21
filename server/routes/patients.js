const express = require('express');
const bcrypt = require('bcryptjs');
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
  if (req.user.role === 'admin') {
    rows = db.prepare(`${WITH_DOCTOR} ORDER BY p.name`).all();
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

  res.json(parsePatient(p));
});

// POST /api/patients — crear paciente (admin, pediatra)
router.post('/', requireRole('admin', 'pediatra'), (req, res) => {
  const { name, birth_date, sex, weight, height, onboarding_data, tutor_email, tutor_name } = req.body;
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
      generatedPassword = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 100);
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
    if (!finalBirthDate && od['Fecha de nacimiento']) finalBirthDate = od['Fecha de nacimiento'];
    if (!finalWeight && od['Peso']) finalWeight = parseFloat(od['Peso']) || 0;
    if (!finalHeight && od['Talla']) finalHeight = parseFloat(od['Talla']) || 0;
    if (!finalSex && od['Sexo']) finalSex = od['Sexo'];
  }

  const result = db.prepare(`
    INSERT INTO patients (name, birth_date, sex, weight, height, doctor_id, tutor_id, onboarding_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    finalBirthDate || null,
    finalSex || null,
    finalWeight,
    finalHeight,
    doctor_id,
    tutor_id,
    onboarding_data ? JSON.stringify(onboarding_data) : null
  );

  const created = parsePatient(db.prepare(`${WITH_DOCTOR} WHERE p.id = ?`).get(result.lastInsertRowid));

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

// DELETE /api/patients/:id — eliminar paciente (admin)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const p = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

  db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  res.json({ message: 'Paciente eliminado correctamente' });
});

module.exports = router;
