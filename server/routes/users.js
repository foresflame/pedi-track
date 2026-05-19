const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();
router.use(requireAuth);

const SAFE_FIELDS = 'id, name, email, role, created_at';

// GET /api/users — todos los usuarios (admin)
router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_FIELDS} FROM users ORDER BY role, name`).all();
  res.json(rows);
});

// GET /api/users/pediatras — solo pediatras
router.get('/pediatras', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`SELECT ${SAFE_FIELDS} FROM users WHERE role = 'pediatra' ORDER BY name`).all();
  res.json(rows);
});

// POST /api/users — crear pediatra (admin)
router.post('/', requireRole('admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (!['pediatra', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Usa pediatra o admin.' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), role || 'pediatra');

  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: role || 'pediatra' });
});

// PUT /api/users/:id — editar usuario (admin)
router.put('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (user.role === 'admin' && id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes editar a otro administrador' });
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

// DELETE /api/users/:id — eliminar usuario (admin)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Desasignar pacientes del doctor eliminado
  db.prepare('UPDATE patients SET doctor_id = NULL WHERE doctor_id = ?').run(id);
  db.prepare('UPDATE patients SET tutor_id = NULL WHERE tutor_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  res.json({ message: 'Usuario eliminado correctamente' });
});

module.exports = router;
