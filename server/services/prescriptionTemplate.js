function buildPrescriptionHtml({ patientName, doctorName, consultDate, medications, patientAge, weight, height }) {
  const medsHtml = medications.map(m => `
    <li style="margin-bottom: 25px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 15px;">
      <div style="font-weight: bold; font-size: 18px; margin-bottom: 8px; color: #0f172a;">${m.name}</div>
      <div style="font-size: 15px; color: #475569;"><strong>Dosis:</strong> ${m.dose} &nbsp;|&nbsp; <strong>Frecuencia:</strong> ${m.freq}</div>
    </li>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Receta Médica - ${patientName}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #4A90E2; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { margin: 0; color: #4A90E2; font-size: 28px; letter-spacing: 1px; }
    .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
    .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 40px; font-size: 14px; }
    .patient-info div { background: #f8fafc; padding: 12px 15px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .rx { font-size: 40px; color: #4A90E2; margin-bottom: 20px; font-weight: bold; font-family: serif; font-style: italic; }
    ul { list-style: none; padding: 0; margin-left: 20px; }
    .footer { margin-top: 80px; text-align: center; font-size: 14px; }
    .signature { margin-top: 60px; border-top: 1px solid #94a3b8; width: 250px; margin: 60px auto 0; padding-top: 10px; color: #475569; text-align: center; }
    .note { margin-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${doctorName}</h1>
    <p>Especialista en Pediatría Integral</p>
    <p>PediTrack — Sistema de Gestión Pediátrica</p>
  </div>

  <div class="patient-info">
    <div><strong>Paciente:</strong> ${patientName}</div>
    <div><strong>Fecha:</strong> ${consultDate}</div>
    <div><strong>Edad:</strong> ${patientAge}</div>
    <div><strong>Peso:</strong> ${weight} kg &nbsp;|&nbsp; <strong>Estatura:</strong> ${height} cm</div>
  </div>

  <div class="rx">Rx</div>
  <ul>${medsHtml}</ul>

  <div class="footer">
    <div class="signature">Firma del Médico<br><small>${doctorName}</small></div>
    <p class="note">Favor de surtir la receta tal como se indica.</p>
  </div>
</body>
</html>`;
}

module.exports = { buildPrescriptionHtml };
