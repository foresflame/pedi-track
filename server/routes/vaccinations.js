const express        = require('express');
const router         = express.Router({ mergeParams: true });
const { db }         = require('../database');
const { requireAuth} = require('../middleware/auth');

// ── NOM-031 / Cartilla Nacional de Vacunación México 2024 ──────────────────
const NOM_SCHEDULE = [
  // Recién nacido
  { vaccine: 'BCG',              dose: 'Única',    target_months: 0,   group: 'Recién Nacido' },
  { vaccine: 'Hepatitis B',      dose: '1a',       target_months: 0,   group: 'Recién Nacido' },
  // 2 meses
  { vaccine: 'Hepatitis B',      dose: '2a',       target_months: 2,   group: '2 meses' },
  { vaccine: 'Pentavalente',     dose: '1a',       target_months: 2,   group: '2 meses' },
  { vaccine: 'Rotavirus',        dose: '1a',       target_months: 2,   group: '2 meses' },
  { vaccine: 'Neumocócica 13v',  dose: '1a',       target_months: 2,   group: '2 meses' },
  // 4 meses
  { vaccine: 'Pentavalente',     dose: '2a',       target_months: 4,   group: '4 meses' },
  { vaccine: 'Rotavirus',        dose: '2a',       target_months: 4,   group: '4 meses' },
  { vaccine: 'Neumocócica 13v',  dose: '2a',       target_months: 4,   group: '4 meses' },
  // 6 meses
  { vaccine: 'Hepatitis B',      dose: '3a',       target_months: 6,   group: '6 meses' },
  { vaccine: 'Pentavalente',     dose: '3a',       target_months: 6,   group: '6 meses' },
  { vaccine: 'Influenza',        dose: '1a',       target_months: 6,   group: '6 meses' },
  // 7 meses
  { vaccine: 'Influenza',        dose: '2a',       target_months: 7,   group: '7 meses' },
  // 12 meses
  { vaccine: 'Neumocócica 13v',  dose: 'Refuerzo', target_months: 12,  group: '12 meses' },
  { vaccine: 'Triple Viral SRP', dose: '1a',       target_months: 12,  group: '12 meses' },
  { vaccine: 'Varicela',         dose: '1a',       target_months: 12,  group: '12 meses' },
  { vaccine: 'Influenza',        dose: 'Anual',    target_months: 12,  group: '12 meses' },
  // 18 meses
  { vaccine: 'Pentavalente',     dose: 'Refuerzo', target_months: 18,  group: '18 meses' },
  // 4 años (48 meses)
  { vaccine: 'DPT',              dose: 'Refuerzo', target_months: 48,  group: '4 años' },
  // 6 años (72 meses)
  { vaccine: 'Triple Viral SRP', dose: 'Refuerzo', target_months: 72,  group: '6 años' },
  { vaccine: 'Varicela',         dose: 'Refuerzo', target_months: 72,  group: '6 años' },
  // 11 años / niñas (132 meses)
  { vaccine: 'VPH',              dose: '1a',       target_months: 132, group: '11 años', sex_filter: 'F' },
  { vaccine: 'VPH',              dose: '2a',       target_months: 138, group: '11 años', sex_filter: 'F' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function addMonthsToDate(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function ensureSchedule(patientId) {
  const patient = db.prepare('SELECT birth_date, sex FROM patients WHERE id = ?').get(patientId);
  if (!patient?.birth_date) return;
  const existing = db.prepare('SELECT COUNT(*) as n FROM vaccinations WHERE patient_id = ?').get(patientId).n;
  if (existing > 0) return; // already seeded

  const insert = db.prepare(`
    INSERT OR IGNORE INTO vaccinations (patient_id, vaccine, dose, target_months, scheduled_date)
    VALUES (?, ?, ?, ?, ?)
  `);
  const isFemale = /^f/i.test(patient.sex || '');
  const tx = db.transaction(() => {
    for (const item of NOM_SCHEDULE) {
      if (item.sex_filter === 'F' && !isFemale) continue;
      insert.run(patientId, item.vaccine, item.dose, item.target_months,
                 addMonthsToDate(patient.birth_date, item.target_months));
    }
  });
  tx();
}

function computeStatus(v, today) {
  if (v.applied_at) return 'aplicada';
  if (!v.scheduled_date) return 'pendiente';
  const daysUntil = Math.round((new Date(v.scheduled_date) - new Date(today)) / 86_400_000);
  if (daysUntil < 0)  return 'vencida';
  if (daysUntil <= 30) return 'proxima';
  return 'pendiente';
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/patients/:patientId/vaccinations
router.get('/', requireAuth, (req, res) => {
  const { patientId } = req.params;
  ensureSchedule(patientId);

  const rows = db.prepare(`
    SELECT v.*, u.name AS applied_by_name
    FROM vaccinations v
    LEFT JOIN users u ON u.id = v.applied_by
    WHERE v.patient_id = ?
    ORDER BY v.target_months ASC, v.id ASC
  `).all(patientId);

  const today = new Date().toISOString().slice(0, 10);
  // Annotate with NOM group and computed status
  const scheduleMap = {};
  for (const item of NOM_SCHEDULE) {
    scheduleMap[`${item.vaccine}|${item.dose}`] = item.group;
  }

  const annotated = rows.map(v => ({
    ...v,
    group: scheduleMap[`${v.vaccine}|${v.dose}`] || `${v.target_months}m`,
    status: computeStatus(v, today),
  }));

  res.json(annotated);
});

// POST /api/patients/:patientId/vaccinations/:vaccId/apply
router.post('/:vaccId/apply', requireAuth, (req, res) => {
  if (req.user.role === 'tutor') return res.status(403).json({ error: 'Sin permisos' });
  const { vaccId, patientId } = req.params;
  const { applied_at, lot, notes } = req.body;

  const updated = db.prepare(`
    UPDATE vaccinations
    SET applied_at = ?, lot = ?, notes = ?, applied_by = ?
    WHERE id = ? AND patient_id = ?
  `).run(
    applied_at || new Date().toISOString().slice(0, 10),
    lot  || null,
    notes || null,
    req.user.id,
    vaccId,
    patientId
  );

  if (updated.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });

  const row = db.prepare('SELECT * FROM vaccinations WHERE id = ?').get(vaccId);
  const today = new Date().toISOString().slice(0, 10);
  res.json({ ...row, status: computeStatus(row, today) });
});

// PUT /api/patients/:patientId/vaccinations/:vaccId/unapply  (undo)
router.put('/:vaccId/unapply', requireAuth, (req, res) => {
  if (req.user.role === 'tutor') return res.status(403).json({ error: 'Sin permisos' });
  const { vaccId, patientId } = req.params;

  const updated = db.prepare(`
    UPDATE vaccinations
    SET applied_at = NULL, lot = NULL, notes = NULL, applied_by = NULL
    WHERE id = ? AND patient_id = ?
  `).run(vaccId, patientId);

  if (updated.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
