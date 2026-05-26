const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();
router.use(requireAuth);

const SAFE_FIELDS = `
  id, name, email, role, created_at,
  specialty, license, phone, office_address, description, photo,
  social_facebook, social_instagram, social_whatsapp, social_website
`;
const PROFILE_FIELDS = [
  'specialty','license','phone','office_address','description','photo',
  'social_facebook','social_instagram','social_whatsapp','social_website'
];

// GET /api/users/me — perfil propio (todos los roles)
router.get('/me', (req, res) => {
  const row = db.prepare(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(row);
});

// PUT /api/users/me — editar perfil propio (pediatra/admin)
router.put('/me', requireRole('pediatra', 'admin'), (req, res) => {
  const id = req.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const { name, email, password } = req.body;
  const newName  = name  ? name.trim()  : user.name;
  const newEmail = email ? email.trim().toLowerCase() : user.email;
  const newPass  = password ? bcrypt.hashSync(password, 10) : user.password;

  if (newEmail !== user.email) {
    const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail, id);
    if (dup) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  // Construir SET dinámico con campos de perfil enviados
  const setParts = ['name = ?', 'email = ?', 'password = ?'];
  const values   = [newName, newEmail, newPass];
  for (const f of PROFILE_FIELDS) {
    if (req.body[f] !== undefined) {
      setParts.push(`${f} = ?`);
      values.push(req.body[f] || null);
    }
  }
  values.push(id);
  db.prepare(`UPDATE users SET ${setParts.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`).get(id);
  res.json(updated);
});

// GET /api/users/:id/public — perfil público del pediatra (visible para tutores)
router.get('/:id/public', (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare(`
    SELECT id, name, email, role, specialty, license, phone, office_address,
           description, photo, social_facebook, social_instagram, social_whatsapp, social_website
    FROM users WHERE id = ? AND role = 'pediatra'
  `).get(id);
  if (!row) return res.status(404).json({ error: 'Pediatra no encontrado' });
  res.json(row);
});

// GET /api/users — todos los usuarios (admin, asesor)
router.get('/', requireRole('admin', 'asesor'), (req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_FIELDS} FROM users ORDER BY role, name`).all();
  res.json(rows);
});

// GET /api/users/pediatras — solo pediatras (admin, asesor)
router.get('/pediatras', requireRole('admin', 'asesor'), (req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_FIELDS} FROM users WHERE role = 'pediatra' ORDER BY name`).all();
  res.json(rows);
});

// GET /api/users/:id — detalle de usuario (admin, asesor)
router.get('/:id(\\d+)', requireRole('admin', 'asesor'), (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(row);
});

// POST /api/users — crear usuario (solo super_admin para asesores/admins; admin puede crear pediatras)
router.post('/', requireRole('admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  const allowedRoles = req.user.role === 'super_admin'
    ? ['pediatra','admin','asesor','super_admin']
    : ['pediatra'];
  if (!allowedRoles.includes(role || 'pediatra')) {
    return res.status(403).json({ error: 'No tienes permiso para crear este tipo de usuario' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), role || 'pediatra');

  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: role || 'pediatra' });
});

// PUT /api/users/:id — editar usuario (admin para no-admins; super_admin para todos)
router.put('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Solo super_admin puede editar a otros admins/super_admins/asesores
  if (['admin','super_admin','asesor'].includes(user.role)
      && req.user.role !== 'super_admin'
      && id !== req.user.id) {
    return res.status(403).json({ error: 'Solo super_admin puede editar este tipo de usuario' });
  }

  const newName  = name  ? name.trim()  : user.name;
  const newEmail = email ? email.trim().toLowerCase() : user.email;
  const newPass  = password ? bcrypt.hashSync(password, 10) : user.password;

  if (newEmail !== user.email) {
    const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail, id);
    if (dup) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  db.prepare('UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?')
    .run(newName, newEmail, newPass, id);

  res.json({ id, name: newName, email: newEmail, role: user.role });
});

// PUT /api/users/:id/role — cambiar rol (solo super_admin)
router.put('/:id/role', requireRole('admin'), (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Solo super_admin puede cambiar roles' });
  const id = parseInt(req.params.id);
  const { role } = req.body;
  if (!['super_admin','admin','asesor','pediatra'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ id, role });
});

// DELETE /api/users/:id — eliminar usuario (super_admin)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Solo super_admin puede eliminar a otros admins/asesores
  if (['admin','super_admin','asesor'].includes(user.role) && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super_admin puede eliminar este tipo de usuario' });
  }

  // Desasignar pacientes del doctor eliminado
  db.prepare('UPDATE patients SET doctor_id = NULL WHERE doctor_id = ?').run(id);
  db.prepare('UPDATE patients SET tutor_id = NULL WHERE tutor_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  res.json({ message: 'Usuario eliminado correctamente' });
});

module.exports = router;
