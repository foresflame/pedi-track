const express        = require('express');
const router         = express.Router({ mergeParams: true });
const { db }         = require('../database');
const { requireAuth} = require('../middleware/auth');
const { canAccessPatient, canEditPatient } = require('../middleware/access');

// Carga el paciente y valida existencia; helper local para las rutas de abajo.
function loadPatient(patientId) {
  return db.prepare('SELECT id, doctor_id, tutor_id FROM patients WHERE id = ?').get(patientId);
}

// ── Denver II: key milestones per age checkpoint ───────────────────────────
// Each item: { id, domain, text, age90 }  (age90 = latest month P90 passes)
const DENVER_ITEMS = [
  // PERSONAL-SOCIAL
  { id:'ps01', domain:'PS', text:'Mira la cara del examinador',             age90: 1  },
  { id:'ps02', domain:'PS', text:'Sonrisa social espontánea',               age90: 2  },
  { id:'ps03', domain:'PS', text:'Vocaliza a la persona que le habla',      age90: 4  },
  { id:'ps04', domain:'PS', text:'Juega con las manos / las mira',          age90: 6  },
  { id:'ps05', domain:'PS', text:'Come solo galletitas',                    age90: 9  },
  { id:'ps06', domain:'PS', text:'Imita actividades del adulto',            age90: 12 },
  { id:'ps07', domain:'PS', text:'Bebe solo de taza con poco derrame',      age90: 15 },
  { id:'ps08', domain:'PS', text:'Ayuda en tareas domésticas sencillas',    age90: 18 },
  { id:'ps09', domain:'PS', text:'Se quita la ropa',                        age90: 24 },
  { id:'ps10', domain:'PS', text:'Se lava las manos sin ayuda',             age90: 36 },
  { id:'ps11', domain:'PS', text:'Se viste con supervisión mínima',         age90: 48 },
  { id:'ps12', domain:'PS', text:'Se viste y desviste completamente solo',  age90: 60 },

  // MOTOR FINO-ADAPTATIVO
  { id:'mf01', domain:'MF', text:'Sigue con la vista 90°',                  age90: 1  },
  { id:'mf02', domain:'MF', text:'Sigue con la vista 180°',                 age90: 2  },
  { id:'mf03', domain:'MF', text:'Alcanza un objeto',                       age90: 4  },
  { id:'mf04', domain:'MF', text:'Traslada objeto de una mano a otra',      age90: 6  },
  { id:'mf05', domain:'MF', text:'Pinza fina (índice-pulgar)',               age90: 9  },
  { id:'mf06', domain:'MF', text:'Garabatea espontáneamente',               age90: 12 },
  { id:'mf07', domain:'MF', text:'Torre de 2 cubos',                        age90: 15 },
  { id:'mf08', domain:'MF', text:'Torre de 4 cubos',                        age90: 18 },
  { id:'mf09', domain:'MF', text:'Torre de 6 cubos',                        age90: 24 },
  { id:'mf10', domain:'MF', text:'Copia un círculo',                        age90: 36 },
  { id:'mf11', domain:'MF', text:'Copia una cruz (+)',                      age90: 48 },
  { id:'mf12', domain:'MF', text:'Copia un cuadrado',                       age90: 60 },

  // LENGUAJE
  { id:'lj01', domain:'LJ', text:'Vocaliza sin llanto (ah, eh)',             age90: 1  },
  { id:'lj02', domain:'LJ', text:'Arrullos (ooh, aah)',                      age90: 2  },
  { id:'lj03', domain:'LJ', text:'Balbucea (ba, da, ma)',                    age90: 4  },
  { id:'lj04', domain:'LJ', text:'Vocaliza consonantes (ba, da, ka)',        age90: 6  },
  { id:'lj05', domain:'LJ', text:'Dice "mamá/papá" (sin discriminar)',       age90: 9  },
  { id:'lj06', domain:'LJ', text:'2 palabras específicas (sin mama/papa)',   age90: 12 },
  { id:'lj07', domain:'LJ', text:'3 palabras',                              age90: 15 },
  { id:'lj08', domain:'LJ', text:'6 palabras',                              age90: 18 },
  { id:'lj09', domain:'LJ', text:'Combina 2 palabras',                      age90: 24 },
  { id:'lj10', domain:'LJ', text:'Frases de 3 palabras',                    age90: 36 },
  { id:'lj11', domain:'LJ', text:'Hace preguntas ¿por qué?, ¿qué es?',      age90: 48 },
  { id:'lj12', domain:'LJ', text:'Cuenta una historia con detalles',        age90: 60 },

  // MOTOR GRUESO
  { id:'mg01', domain:'MG', text:'Levanta cabeza en prono',                 age90: 1  },
  { id:'mg02', domain:'MG', text:'Cabeza estable sentado',                  age90: 2  },
  { id:'mg03', domain:'MG', text:'Sostén cefálico completo',                age90: 4  },
  { id:'mg04', domain:'MG', text:'Se sienta con apoyo',                     age90: 6  },
  { id:'mg05', domain:'MG', text:'Se sienta solo estable',                  age90: 9  },
  { id:'mg06', domain:'MG', text:'Camina con apoyo de ambas manos',         age90: 12 },
  { id:'mg07', domain:'MG', text:'Camina solo',                             age90: 15 },
  { id:'mg08', domain:'MG', text:'Sube escaleras con ayuda',                age90: 18 },
  { id:'mg09', domain:'MG', text:'Corre bien',                              age90: 24 },
  { id:'mg10', domain:'MG', text:'Salta con los dos pies juntos',           age90: 36 },
  { id:'mg11', domain:'MG', text:'Salta en un pie 2 veces',                 age90: 48 },
  { id:'mg12', domain:'MG', text:'Salta hacia adelante 2 metros',           age90: 60 },
];

// ── M-CHAT-R/F — 20 preguntas ──────────────────────────────────────────────
// pass = expected answer for a typically developing child
// critical = true → contributes to critical-item risk even if total < threshold
const MCHAT_ITEMS = [
  { id: 1, text:'Si usted señala algo al otro lado del cuarto, ¿su hijo/a lo mira?',
    pass:'si', critical:true },
  { id: 2, text:'¿Alguna vez se ha preguntado si su hijo/a pudiera ser sordo/a?',
    pass:'no', critical:false },
  { id: 3, text:'¿Juega su hijo/a a fingir o hacer teatro? (fingir que habla por teléfono, que cuida a una muñeca, etc.)',
    pass:'si', critical:false },
  { id: 4, text:'¿Le gusta a su hijo/a subirse a las cosas? (muebles, juegos de parque, escaleras)',
    pass:'si', critical:false },
  { id: 5, text:'¿Hace su hijo/a movimientos inusuales con los dedos cerca de sus ojos? (p. ej. aletear los dedos)',
    pass:'no', critical:true },
  { id: 6, text:'¿Señala su hijo/a con el dedo índice para pedir algo o indicar que quiere algo?',
    pass:'si', critical:true },
  { id: 7, text:'¿Señala su hijo/a con el dedo índice para indicar interés en algo? (no solo para pedir)',
    pass:'si', critical:true },
  { id: 8, text:'¿Juega su hijo/a apropiadamente con juguetes pequeños (carros, bloques) sin chucarlos o tirarlos?',
    pass:'si', critical:false },
  { id: 9, text:'¿Alguna vez su hijo/a le ha traído objetos para mostrárselos?',
    pass:'si', critical:true },
  { id:10, text:'¿Lo/la mira su hijo/a a los ojos por más de 1 o 2 segundos?',
    pass:'si', critical:true },
  { id:11, text:'¿Alguna vez su hijo/a ha parecido sensible a los ruidos (p. ej. taparse los oídos)?',
    pass:'no', critical:false },
  { id:12, text:'¿Sonríe su hijo/a en respuesta a su cara o su sonrisa?',
    pass:'si', critical:true },
  { id:13, text:'¿Imita su hijo/a? (imitar gestos, expresiones faciales, sonidos)',
    pass:'si', critical:true },
  { id:14, text:'¿Responde su hijo/a cuando lo/la llama por su nombre?',
    pass:'si', critical:true },
  { id:15, text:'Si usted pone un juguete al otro lado del cuarto, ¿camina su hijo/a para tomarlo?',
    pass:'si', critical:false },
  { id:16, text:'¿Camina su hijo/a ya?',
    pass:'si', critical:false },
  { id:17, text:'¿Mira su hijo/a cosas que usted está mirando?',
    pass:'si', critical:true },
  { id:18, text:'¿Hace su hijo/a movimientos inusuales con sus manos cerca de la cara?',
    pass:'no', critical:true },
  { id:19, text:'¿Intenta su hijo/a atraer su atención hacia su propia actividad?',
    pass:'si', critical:true },
  { id:20, text:'¿Alguna vez se ha preguntado si su hijo/a tiene autismo?',
    pass:'no', critical:false },
];

// ── Scoring helpers ───────────────────────────────────────────────────────

function scoreDenver(responses, ageMonths) {
  // Gather items appropriate for this age (age90 <= ageMonths + some tolerance)
  const relevant = DENVER_ITEMS.filter(item => item.age90 <= ageMonths + 2);
  const alarms = [];

  for (const item of relevant) {
    const resp = responses[item.id];
    if (resp === 'no' || resp === 'no_opp') {
      // "alarm" = fails item that 90% pass at age ≤ child's age
      if (item.age90 <= ageMonths) alarms.push(item);
    }
  }

  const failCount = relevant.filter(i => responses[i.id] === 'no').length;
  const totalRelevant = relevant.length;
  const pctFail = totalRelevant > 0 ? failCount / totalRelevant : 0;

  let risk = 'bajo';
  if (alarms.length >= 2 || pctFail >= 0.25) risk = 'moderado';
  if (alarms.length >= 4 || pctFail >= 0.4)  risk = 'alto';

  return {
    score: Math.round((1 - pctFail) * 100),
    risk_level: risk,
    alarms: alarms.map(a => `${a.domain}: ${a.text}`),
  };
}

function scoreMchat(responses) {
  let fails = 0;
  let criticalFails = 0;

  for (const item of MCHAT_ITEMS) {
    const resp = responses[item.id];
    if (resp && resp !== item.pass) {
      fails++;
      if (item.critical) criticalFails++;
    }
  }

  let risk = 'bajo';
  if (fails >= 3 || criticalFails >= 2) risk = 'moderado';
  if (fails >= 8)                       risk = 'alto';

  return {
    score: fails,          // lower = better
    risk_level: risk,
    alarms: MCHAT_ITEMS
      .filter(i => responses[i.id] && responses[i.id] !== i.pass)
      .map(i => `Ítem ${i.id}: ${i.text.slice(0, 60)}…`),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/patients/:patientId/neurodevelopment/items?type=denver&ageMonths=12
router.get('/items', requireAuth, (req, res) => {
  const type      = req.query.type || 'denver';
  const ageMonths = parseInt(req.query.ageMonths) || 0;

  if (type === 'denver') {
    const items = DENVER_ITEMS.filter(i => i.age90 <= ageMonths + 3);
    return res.json({ items, domains: { PS: 'Personal-Social', MF: 'Motor Fino', LJ: 'Lenguaje', MG: 'Motor Grueso' } });
  }
  if (type === 'mchat') {
    return res.json({ items: MCHAT_ITEMS });
  }
  res.status(400).json({ error: 'tipo no válido' });
});

// GET /api/patients/:patientId/neurodevelopment
router.get('/', requireAuth, (req, res) => {
  const { patientId } = req.params;
  const patient = loadPatient(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canAccessPatient(req.user, patient)) return res.status(403).json({ error: 'Acceso denegado' });
  const rows = db.prepare(`
    SELECT n.*, u.name as created_by_name
    FROM neurodevelopment_assessments n
    LEFT JOIN users u ON u.id = n.created_by
    WHERE n.patient_id = ?
    ORDER BY n.date DESC
  `).all(patientId);

  res.json(rows.map(r => ({
    ...r,
    responses: r.responses ? JSON.parse(r.responses) : {},
    alarms:    r.alarms    ? JSON.parse(r.alarms)    : [],
  })));
});

// POST /api/patients/:patientId/neurodevelopment
router.post('/', requireAuth, (req, res) => {
  const { patientId } = req.params;
  const patient = loadPatient(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canEditPatient(req.user, patient)) return res.status(403).json({ error: 'Sin permisos' });
  const { type, age_months, date, responses, notes } = req.body;

  if (!type || !date || !responses) return res.status(400).json({ error: 'type, date y responses son requeridos' });

  const ageMonths = age_months || 0;
  let scored;
  if (type === 'denver') scored = scoreDenver(responses, ageMonths);
  else if (type === 'mchat') scored = scoreMchat(responses);
  else return res.status(400).json({ error: 'tipo no válido (denver|mchat)' });

  const row = db.prepare(`
    INSERT INTO neurodevelopment_assessments
      (patient_id, type, age_months, date, responses, score, risk_level, alarms, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId, type, ageMonths, date,
    JSON.stringify(responses),
    scored.score,
    scored.risk_level,
    JSON.stringify(scored.alarms),
    notes || null,
    req.user.id
  );

  const created = db.prepare('SELECT * FROM neurodevelopment_assessments WHERE id = ?').get(row.lastInsertRowid);
  res.status(201).json({
    ...created,
    responses: JSON.parse(created.responses),
    alarms:    JSON.parse(created.alarms),
  });
});

// DELETE /api/patients/:patientId/neurodevelopment/:aid
router.delete('/:aid', requireAuth, (req, res) => {
  const { aid, patientId } = req.params;
  const patient = loadPatient(patientId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canEditPatient(req.user, patient)) return res.status(403).json({ error: 'Sin permisos' });
  db.prepare('DELETE FROM neurodevelopment_assessments WHERE id = ? AND patient_id = ?').run(aid, patientId);
  res.json({ ok: true });
});

module.exports = router;
