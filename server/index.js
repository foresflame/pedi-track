require('dotenv').config();

// Sin JWT_SECRET los tokens serían infalsificables de verificar: abortar con
// un mensaje claro en lugar de fallar en el primer login.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('✗ JWT_SECRET no está definido (o es demasiado corto, mínimo 16 caracteres).');
  console.error('  Defínelo en .env o con: fly secrets set JWT_SECRET=<valor largo aleatorio>');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB } = require('./database');
const { UPLOADS_DIR } = require('./services/photoStorage');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // fly.io termina TLS; necesario para cookies secure y rate limit por IP
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' })); // las fotos llegan como data URL y se persisten a disco
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

// Health check (Railway / fly.io / load balancers)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// API routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/patients',      require('./routes/patients'));
app.use('/api/patients/:patientId/consultations', require('./routes/consultations'));
app.use('/api/patients/:patientId/vaccinations',     require('./routes/vaccinations'));
app.use('/api/patients/:patientId/neurodevelopment', require('./routes/neurodevelopment'));
app.use('/api/appointments',  require('./routes/appointments'));
app.use('/api/email',         require('./routes/email'));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

initDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏥 PediTrack server corriendo en http://localhost:${PORT}`);
  console.log(`   Credenciales de prueba:`);
  console.log(`   admin@peditrack.com / Admin2024!`);
  console.log(`   doc@peditrack.com   / Doc2024!`);
  console.log(`   tutor@peditrack.com / Tutor2024!\n`);
});
