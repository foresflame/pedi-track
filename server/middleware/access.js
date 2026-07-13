// Reglas de acceso a un paciente, centralizadas para reusar en todas las rutas
// que cuelgan de un paciente (consultas, vacunas, neurodesarrollo, etc.).

const ADMIN_ROLES = ['admin', 'super_admin', 'asesor'];

// Lectura: los roles admin-like ven todo; el pediatra ve a sus pacientes;
// el tutor ve solo a su hijo.
function canAccessPatient(user, patient) {
  if (!user || !patient) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  if (user.role === 'pediatra') return patient.doctor_id === user.id;
  if (user.role === 'tutor')    return patient.tutor_id === user.id;
  return false;
}

// Escritura clínica: super_admin/admin y el pediatra dueño del paciente.
// El asesor es de solo lectura y el tutor nunca escribe.
function canEditPatient(user, patient) {
  if (!user || !patient) return false;
  if (['admin', 'super_admin'].includes(user.role)) return true;
  if (user.role === 'pediatra') return patient.doctor_id === user.id;
  return false;
}

module.exports = { canAccessPatient, canEditPatient, ADMIN_ROLES };
