const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();

// Protección contra fuerza bruta / abuso
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // solo cuentan los intentos fallidos
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.' },
});

const TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000; // igual que expiresIn del JWT

function setAuthCookie(req, res, token) {
  res.cookie('peditrack_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure, // true detrás del proxy TLS de fly.io, false en localhost
    maxAge: TOKEN_MAX_AGE_MS,
  });
}

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
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

  setAuthCookie(req, res, token);
  res.json({
    // token también en el body por compatibilidad con clientes que aún lo guardan
    token,
    user: { id: user.id, name: user.name, role: user.role, email: user.email }
  });
});

// POST /api/auth/logout — limpia la cookie de sesión
router.post('/logout', (req, res) => {
  res.clearCookie('peditrack_token', { httpOnly: true, sameSite: 'lax' });
  res.json({ message: 'Sesión cerrada' });
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

// POST /api/auth/forgot-password — genera contraseña temporal y la envía por correo
router.post('/forgot-password', forgotLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'El correo es requerido' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());

  // Siempre responder igual para no revelar si el email existe
  if (!user) {
    return res.json({ message: 'Si ese correo existe en el sistema, recibirás las instrucciones.' });
  }

  // 9 caracteres alfanuméricos de CSPRNG (sin ambiguos O/0/I/l)
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const tempPassword = Array.from(crypto.randomBytes(9), b => ALPHABET[b % ALPHABET.length]).join('');

  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(tempPassword, 10), user.id);

  sendPasswordResetEmail({ to: user.email, name: user.name, password: tempPassword })
    .catch(err => console.warn('⚠ Correo de recuperación no enviado:', err.message));

  res.json({ message: 'Si ese correo existe en el sistema, recibirás las instrucciones.' });
});

module.exports = router;
