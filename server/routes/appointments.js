const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { ADMIN_ROLES } = require('../middleware/access');

const router = express.Router();
router.use(requireAuth);

// POST /api/appointments/cleanup-past — cancela en bloque las citas vencidas
// (fecha < hoy) que quedaron sin atender (pendientes o confirmadas): "no-shows".
// Pediatra: solo las suyas. Admin/super_admin: todas, o de un pediatra concreto
// si envía { doctor_id }. Asesor (solo lectura) no entra por requireRole.
router.post('/cleanup-past', requireRole('admin', 'pediatra'), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const NO_SHOW = "date < ? AND status IN ('pendiente','confirmada')";

  let result;
  if (req.user.role === 'pediatra') {
    result = db.prepare(`UPDATE appointments SET status='cancelada' WHERE doctor_id = ? AND ${NO_SHOW}`)
               .run(req.user.id, today);
  } else if (req.body && req.body.doctor_id) {
    result = db.prepare(`UPDATE appointments SET status='cancelada' WHERE doctor_id = ? AND ${NO_SHOW}`)
               .run(parseInt(req.body.doctor_id), today);
  } else {
    result = db.prepare(`UPDATE appointments SET status='cancelada' WHERE ${NO_SHOW}`).run(today);
  }

  res.json({ cancelled: result.changes });
});

// GET /api/appointments/availability/:doctorId
router.get('/availability/:doctorId', (req, res) => {
  const doctorId = parseInt(req.params.doctorId);
  const rows = db.prepare(
    'SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week, start_time'
  ).all(doctorId);
  res.json(rows);
});

// PUT /api/appointments/availability — doctor actualiza su disponibilidad semanal
router.put('/availability', requireRole('admin', 'pediatra'), (req, res) => {
  const doctorId = ADMIN_ROLES.includes(req.user.role) && req.body.doctor_id ? req.body.doctor_id : req.user.id;
  const { availability } = req.body;

  if (!Array.isArray(availability)) {
    return res.status(400).json({ error: 'availability debe ser un arreglo' });
  }

  const deleteExisting = db.prepare('DELETE FROM doctor_availability WHERE doctor_id = ?');
  const insertSlot = db.prepare(
    'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES (?, ?, ?, ?, ?)'
  );

  const saveAll = db.transaction(() => {
    deleteExisting.run(doctorId);
    for (const slot of availability) {
      if (slot.day_of_week !== undefined && slot.start_time && slot.end_time) {
        insertSlot.run(doctorId, slot.day_of_week, slot.start_time, slot.end_time, slot.slot_minutes || 30);
      }
    }
  });
  saveAll();

  res.json({ message: 'Disponibilidad actualizada' });
});

// GET /api/appointments/slots/:doctorId/:date — slots libres para una fecha
router.get('/slots/:doctorId/:date', (req, res) => {
  const doctorId = parseInt(req.params.doctorId);
  const date = req.params.date; // YYYY-MM-DD

  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();

  const blocks = db.prepare(
    'SELECT * FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ?'
  ).all(doctorId, dayOfWeek);

  if (blocks.length === 0) return res.json([]);

  const booked = new Set(
    db.prepare(
      "SELECT time FROM appointments WHERE doctor_id = ? AND date = ? AND status != 'cancelada'"
    ).all(doctorId, date).map(a => a.time)
  );

  const slots = [];
  for (const block of blocks) {
    let [h, min] = block.start_time.split(':').map(Number);
    const [endH, endMin] = block.end_time.split(':').map(Number);

    while (h * 60 + min < endH * 60 + endMin) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      slots.push({ time: timeStr, available: !booked.has(timeStr) });
      min += block.slot_minutes;
      if (min >= 60) { h += Math.floor(min / 60); min = min % 60; }
    }
  }

  res.json(slots);
});

// GET /api/appointments — lista de citas
router.get('/', (req, res) => {
  const { date } = req.query;

  const baseQuery = `
    SELECT a.*, p.name as patient_name, u.name as doctor_name
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    JOIN users u ON u.id = a.doctor_id
  `;

  let rows;
  if (ADMIN_ROLES.includes(req.user.role)) {
    rows = date
      ? db.prepare(`${baseQuery} WHERE a.date = ? ORDER BY a.time`).all(date)
      : db.prepare(`${baseQuery} ORDER BY a.date DESC, a.time`).all();
  } else if (req.user.role === 'pediatra') {
    rows = date
      ? db.prepare(`${baseQuery} WHERE a.doctor_id = ? AND a.date = ? ORDER BY a.time`).all(req.user.id, date)
      : db.prepare(`${baseQuery} WHERE a.doctor_id = ? ORDER BY a.date DESC, a.time`).all(req.user.id);
  } else {
    // tutor — ve solo sus propias citas
    const patient = db.prepare('SELECT id FROM patients WHERE tutor_id = ?').get(req.user.id);
    if (!patient) return res.json([]);
    rows = db.prepare(`${baseQuery} WHERE a.patient_id = ? ORDER BY a.date DESC, a.time`).all(patient.id);
  }

  res.json(rows);
});

// POST /api/appointments — reservar cita
router.post('/', requireRole('tutor', 'pediatra', 'admin'), (req, res) => {
  const { patient_id, doctor_id, date, time, notes, label } = req.body;
  if (!doctor_id || !date || !time) {
    return res.status(400).json({ error: 'doctor_id, fecha y hora son requeridos' });
  }

  // Tutor solo puede reservar para su propio paciente (y siempre necesita patient_id)
  if (req.user.role === 'tutor') {
    if (!patient_id) return res.status(400).json({ error: 'El tutor debe seleccionar un paciente' });
    const p = db.prepare('SELECT id FROM patients WHERE id = ? AND tutor_id = ?').get(patient_id, req.user.id);
    if (!p) return res.status(403).json({ error: 'No puedes agendar citas para este paciente' });

    // Un tutor no puede tener más de una cita activa (pendiente o confirmada)
    const existing = db.prepare(
      "SELECT id FROM appointments WHERE patient_id = ? AND status IN ('pendiente','confirmada')"
    ).get(patient_id);
    if (existing) return res.status(409).json({ error: 'Ya tienes una cita activa. Cancélala antes de agendar una nueva.' });
  }

  // Verificar que el slot esté disponible (ignora canceladas)
  const conflict = db.prepare(
    "SELECT id FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status != 'cancelada'"
  ).get(doctor_id, date, time);
  if (conflict) return res.status(409).json({ error: 'Ese horario ya está reservado' });

  // Limpiar registro cancelado en ese slot (evita error UNIQUE constraint)
  db.prepare(
    "DELETE FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status = 'cancelada'"
  ).run(doctor_id, date, time);

  const pid = patient_id ? parseInt(patient_id) : null;
  const result = db.prepare(
    'INSERT INTO appointments (patient_id, doctor_id, date, time, notes, label) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(pid, doctor_id, date, time, notes || null, label || null);

  const created = db.prepare(`
    SELECT a.*, p.name as patient_name, u.name as doctor_name
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    JOIN users u ON u.id = a.doctor_id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(created);
});

// PUT /api/appointments/:id/status — cambiar estado de la cita
router.put('/:id/status', requireRole('admin', 'pediatra'), (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const validStatuses = ['pendiente', 'confirmada', 'cancelada', 'completada'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${validStatuses.join(', ')}` });
  }

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });
  if (req.user.role === 'pediatra' && appt.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
  res.json({ id, status });
});

// DELETE /api/appointments/:id — cancelar cita
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });

  if (req.user.role === 'tutor') {
    const p = db.prepare('SELECT id FROM patients WHERE id = ? AND tutor_id = ?').get(appt.patient_id, req.user.id);
    if (!p) return res.status(403).json({ error: 'Acceso denegado' });
  } else if (req.user.role === 'pediatra' && appt.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  db.prepare("UPDATE appointments SET status = 'cancelada' WHERE id = ?").run(id);
  res.json({ message: 'Cita cancelada' });
});

module.exports = router;
