const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { sendPrescriptionEmail } = require('../services/emailService');

const router = express.Router();
router.use(requireAuth);

// Fechas ISO → formato largo es-MX; strings antiguos ya formateados pasan intactos
function formatConsultDate(dateStr) {
  if (!dateStr) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function calculateAgeString(birthDateStr) {
  if (!birthDateStr) return 'Desconocida';
  const [y, m, d] = birthDateStr.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) months = 0;
  if (months < 12) return months === 1 ? '1 mes' : `${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return `${years} año${years !== 1 ? 's' : ''}${rem > 0 ? ` ${rem} mes${rem !== 1 ? 'es' : ''}` : ''}`;
}

// POST /api/email/prescription
router.post('/prescription', requireRole('admin', 'pediatra'), async (req, res) => {
  const { consultationId, recipientEmail } = req.body;
  if (!consultationId || !recipientEmail) {
    return res.status(400).json({ error: 'consultationId y recipientEmail son requeridos' });
  }

  const consult = db.prepare(`
    SELECT c.*, p.name as patient_name, p.birth_date, p.weight, p.height,
           u.name as doctor_name
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    JOIN users u ON u.id = c.doctor_id
    WHERE c.id = ?
  `).get(consultationId);

  if (!consult) return res.status(404).json({ error: 'Consulta no encontrada' });

  if (req.user.role === 'pediatra') {
    const patient = db.prepare('SELECT doctor_id FROM patients WHERE id = ?').get(consult.patient_id);
    if (!patient || patient.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
  }

  const medications = consult.medications ? JSON.parse(consult.medications) : [];
  if (medications.length === 0) {
    return res.status(400).json({ error: 'Esta consulta no tiene medicamentos para enviar' });
  }

  try {
    await sendPrescriptionEmail({
      to:          recipientEmail,
      patientName: consult.patient_name,
      doctorName:  consult.doctor_name,
      consultDate: formatConsultDate(consult.date),
      medications,
      patientAge:  calculateAgeString(consult.birth_date),
      weight:      consult.weight,
      height:      consult.height
    });
    res.json({ message: `Receta enviada a ${recipientEmail}` });
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el correo: ' + err.message });
  }
});

module.exports = router;
