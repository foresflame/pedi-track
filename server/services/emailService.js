const nodemailer = require('nodemailer');
const { buildPrescriptionHtml } = require('./prescriptionTemplate');

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendPrescriptionEmail({ to, patientName, doctorName, consultDate, medications, patientAge, weight, height }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Configuración de correo no disponible. Completa EMAIL_USER y EMAIL_PASS en .env');
  }

  const html = buildPrescriptionHtml({ patientName, doctorName, consultDate, medications, patientAge, weight, height });

  return createTransporter().sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: `Receta Médica — ${patientName} — ${consultDate}`,
    html
  });
}

async function sendWelcomeEmail({ to, tutorName, patientName, password }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠ Correo de bienvenida no enviado: configura EMAIL_USER y EMAIL_PASS en .env');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Bienvenido a PediTrack</title></head>
    <body style="font-family: Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #4A90E2;">🏥 PediTrack</h1>
        <p style="color: #64748b;">Plataforma de Control Pediátrico</p>
      </div>
      <p>Hola <strong>${tutorName}</strong>,</p>
      <p>El expediente digital de <strong>${patientName}</strong> ya está disponible en PediTrack. Aquí están tus credenciales de acceso:</p>
      <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border-left: 4px solid #4A90E2;">
        <p style="margin: 0;"><strong>Usuario (correo):</strong> ${to}</p>
        <p style="margin: 0.5rem 0 0;"><strong>Contraseña temporal:</strong> <code style="background: white; padding: 2px 8px; border-radius: 4px; font-size: 1.1rem;">${password}</code></p>
      </div>
      <p style="color: #64748b; font-size: 0.9rem;">Por seguridad, te recomendamos cambiar tu contraseña al iniciar sesión por primera vez.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0;">
      <p style="color: #94a3b8; font-size: 0.8rem; text-align: center;">PediTrack — Sistema de Gestión Pediátrica Integral</p>
    </body>
    </html>
  `;

  return createTransporter().sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: `Bienvenido a PediTrack — Expediente de ${patientName}`,
    html
  });
}

async function sendPasswordResetEmail({ to, name, password }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠ Correo de recuperación no enviado: configura EMAIL_USER y EMAIL_PASS en .env');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Recuperación de contraseña</title></head>
    <body style="font-family: Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #4A90E2;">🏥 PediTrack</h1>
        <p style="color: #64748b;">Recuperación de acceso</p>
      </div>
      <p>Hola <strong>${name}</strong>,</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa la siguiente contraseña temporal para ingresar:</p>
      <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; border-left: 4px solid #4A90E2; text-align: center;">
        <p style="margin: 0; font-size: 0.9rem; color: #64748b;">Tu nueva contraseña temporal:</p>
        <p style="margin: 0.75rem 0 0; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.1em; color: #1e293b; font-family: monospace;">${password}</p>
      </div>
      <p style="color: #64748b; font-size: 0.9rem;">Te recomendamos cambiarla desde tu perfil una vez que hayas iniciado sesión.</p>
      <p style="color: #64748b; font-size: 0.9rem;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0;">
      <p style="color: #94a3b8; font-size: 0.8rem; text-align: center;">PediTrack — Sistema de Gestión Pediátrica Integral</p>
    </body>
    </html>
  `;

  return createTransporter().sendMail({
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: 'PediTrack — Tu nueva contraseña temporal',
    html
  });
}

module.exports = { sendPrescriptionEmail, sendWelcomeEmail, sendPasswordResetEmail };
