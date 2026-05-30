require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // permite fotos base64 hasta ~10 MB
app.use(express.static(path.join(__dirname, '..', 'public')));

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
