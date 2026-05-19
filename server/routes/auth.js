const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, email: user.email }
  });
});

// POST /api/auth/change-password — cambia su propia contraseña
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'Contraseña actualizada correctamente' });
});

// POST /api/auth/reset-password/:userId — admin o pediatra resetea contraseña de otro usuario
router.post('/reset-password/:userId', requireAuth, requireRole('admin', 'pediatra'), (req, res) => {
  const targetId = parseInt(req.params.userId);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Pediatra solo puede resetear contraseñas de tutores de sus pacientes
  if (req.user.role === 'pediatra') {
    if (target.role !== 'tutor') {
      return res.status(403).json({ error: 'Solo puedes cambiar contraseñas de tutores' });
    }
    const linked = db.prepare(
      'SELECT id FROM patients WHERE tutor_id = ? AND doctor_id = ?'
    ).get(targetId, req.user.id);
    if (!linked) {
      return res.status(403).json({ error: 'Este tutor no pertenece a tus pacientes' });
    }
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), targetId);
  res.json({ message: 'Contraseña reseteada correctamente' });
});

module.exports = router;
