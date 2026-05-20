// === API Layer ===
const API = {
  baseUrl: '/api',
  getHeaders() {
    const token = sessionStorage.getItem('peditrack_token');
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  },
  async request(method, path, body) {
    const opts = { method, headers: this.getHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(this.baseUrl + path, opts);
    if (r.status === 401) { window.handleLogout && handleLogout(); return null; }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error inesperado');
    return data;
  },
  async get(path)        { return this.request('GET', path); },
  async post(path, body) { return this.request('POST', path, body); },
  async put(path, body)  { return this.request('PUT', path, body); },
  async del(path)        { return this.request('DELETE', path); }
};

// === App State ===
let currentUser     = null;
let patients        = [];
let pediatricians   = [];
let currentPatient  = null;
let consultations   = [];
let todayAppointments = [];
let currentPatientId  = null;
let currentView     = 'login';
let currentOnboardingStep = 1;
let patientSearchQuery = '';
let tutorAppointments = [];
let bookingYear  = new Date().getFullYear();
let bookingMonth = new Date().getMonth();
let bookingSelectedDate = null;
let bookingSlots = [];

function getRoleDefaultView(role) {
  if (role === 'admin')    return 'admin-dashboard';
  if (role === 'pediatra') return 'doctor-dashboard';
  if (role === 'tutor')    return 'parent-profile';
  return 'login';
}

// === Bootstrap & Data Loading ===
async function bootstrap() {
  const token  = sessionStorage.getItem('peditrack_token');
  const stored = sessionStorage.getItem('peditrack_user');
  if (!token || !stored) { currentView = 'login'; renderApp(); return; }
  try { currentUser = JSON.parse(stored); } catch { currentUser = null; }
  if (!currentUser) { sessionStorage.clear(); currentView = 'login'; renderApp(); return; }
  currentView = getRoleDefaultView(currentUser.role);
  await refreshData();
  renderApp();
}

async function refreshData() {
  if (!currentUser) return;
  try {
    if (currentUser.role === 'tutor') {
      const p = await API.get('/patients');
      if (p) {
        currentPatient  = p;
        patients        = [p];
        currentPatientId = p.id;
        consultations   = (await API.get(`/patients/${p.id}/consultations`)) || [];
        tutorAppointments = (await API.get('/appointments')) || [];
      }
    } else {
      patients = (await API.get('/patients')) || [];
      if (currentUser.role === 'admin') {
        pediatricians = (await API.get('/users/pediatras')) || [];
      }
      if (currentUser.role === 'pediatra') {
        const today = new Date().toISOString().slice(0, 10);
        todayAppointments = (await API.get(`/appointments?date=${today}`)) || [];
      }
    }
  } catch (e) { console.error('refreshData:', e.message); }
}

// === Main Render ===
function renderApp() {
  const app = document.getElementById('app');
  const headerAction = currentUser
    ? `<button class="btn btn-secondary" onclick="handleLogout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Salir</button>`
    : '';

  let html = `
    <header>
      <div class="logo cursor-pointer" onclick="${currentUser ? "navigate(getRoleDefaultView(currentUser.role))" : "navigate('login')"}">
        <i class="fa-solid fa-baby-carriage"></i> PediTrack
      </div>
      ${headerAction}
    </header>
    <main class="container animate-fade-in" id="main-content">
  `;

  if      (currentView === 'login')               html += renderLogin();
  else if (currentView === 'admin-dashboard')     html += renderAdminDashboard();
  else if (currentView === 'doctor-dashboard')    html += renderDoctorDashboard();
  else if (currentView === 'parent-profile')      html += renderParentProfile();
  else if (currentView === 'patient-onboarding')  html += renderOnboarding();
  else if (currentView === 'onboarding-success')  html += renderOnboardingSuccess();
  else if (currentView === 'availability-settings') html += renderAvailabilitySettings();
  else if (currentView === 'booking-calendar')    html += renderBookingCalendar();

  html += `</main>` + renderModals();
  app.innerHTML = html;

  if (currentView === 'parent-profile')       initChart();
  if (currentView === 'availability-settings') loadAvailability();
}

// === Views ===
function renderLogin() {
  return `
    <div style="max-width:400px;margin:4rem auto;background:white;padding:2.5rem;border-radius:15px;box-shadow:var(--card-shadow);">
      <div style="text-align:center;margin-bottom:2rem;">
        <i class="fa-solid fa-baby-carriage" style="font-size:3.5rem;color:var(--primary);"></i>
        <h1 style="margin-top:1rem;font-size:2rem;">PediTrack</h1>
        <p style="color:var(--text-light);margin-top:0.5rem;">Iniciar sesión en tu cuenta</p>
      </div>
      <div id="loginError" style="display:none;background:#fee2e2;color:#dc2626;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:0.9rem;"></div>
      <div class="form-group">
        <label>Correo Electrónico</label>
        <input type="email" id="loginEmail" class="form-control" placeholder="ej. doc@peditrack.com" value="doc@peditrack.com">
      </div>
      <div class="form-group">
        <label>Contraseña</label>
        <input type="password" id="loginPass" class="form-control" placeholder="••••••••" value="Doc2024!" onkeydown="if(event.key==='Enter') handleLogin()">
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem;padding:0.8rem;font-size:1.1rem;" onclick="handleLogin()">Entrar</button>
      <div style="text-align:center;margin-top:1rem;">
        <a href="#" style="font-size:0.85rem;color:var(--primary);text-decoration:none;" onclick="openModal('forgotPasswordModal');return false;">
          ¿Olvidaste tu contraseña?
        </a>
      </div>
      <div style="margin-top:1.5rem;font-size:0.85rem;color:var(--text-light);background:var(--primary-light);padding:1rem;border-radius:8px;">
        <strong style="color:var(--primary);display:block;margin-bottom:0.5rem;">Usuarios de prueba:</strong>
        <ul style="margin:0;padding-left:1.2rem;line-height:1.8;">
          <li>admin@peditrack.com / Admin2024!</li>
          <li>doc@peditrack.com / Doc2024!</li>
          <li>tutor@peditrack.com / Tutor2024!</li>
        </ul>
      </div>
    </div>
  `;
}

function renderAdminDashboard() {
  const tutorCount = patients.filter(p => p.tutor_id).length;
  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1 style="font-size:2rem;">Panel de Administrador</h1>
          <p style="color:var(--text-light);">Bienvenido, ${currentUser.name}</p>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-card"><div class="stat-label">Total Pacientes</div><div class="stat-value">${patients.length}</div><p style="color:var(--secondary);font-size:0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Sistema activo</p></div>
        <div class="stat-card"><div class="stat-label">Total Pediatras</div><div class="stat-value">${pediatricians.length}</div><p style="color:var(--secondary);font-size:0.9rem;">En la plataforma</p></div>
        <div class="stat-card"><div class="stat-label">Tutores con Cuenta</div><div class="stat-value">${tutorCount}</div><p style="color:var(--secondary);font-size:0.9rem;">Registrados</p></div>
      </div>

      <div class="history-section" style="margin-top:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2>Gestión de Pediatras</h2>
          <button class="btn btn-primary" onclick="window.editingUserId=null;openModal('userModal')"><i class="fa-solid fa-user-plus"></i> Añadir Pediatra</button>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:15px;margin-top:1rem;box-shadow:var(--card-shadow);overflow-x:auto;">
          <table style="width:100%;text-align:left;border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid var(--bg-color);color:var(--text-light);">
              <th style="padding:1rem 0;">Nombre</th><th style="padding:1rem 0;">Email</th><th style="padding:1rem 0;text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>
              ${pediatricians.map(u => `
              <tr style="border-bottom:1px solid var(--bg-color);">
                <td style="padding:1rem 0;font-weight:500;">${u.name}</td>
                <td style="padding:1rem 0;color:var(--text-light);">${u.email}</td>
                <td style="padding:1rem 0;text-align:right;">
                  <button class="btn" style="padding:0.3rem 0.6rem;font-size:0.8rem;background:transparent;color:var(--primary);box-shadow:none;" onclick="editUser(${u.id})"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn" style="padding:0.3rem 0.6rem;font-size:0.8rem;background:transparent;color:#ef4444;box-shadow:none;" onclick="deleteUser(${u.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
              ${pediatricians.length === 0 ? '<tr><td colspan="3" style="padding:1rem 0;text-align:center;color:var(--text-light);">No hay pediatras registrados.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="history-section" style="margin-top:2rem;">
        <h2>Asignación de Pacientes</h2>
        <p style="color:var(--text-light);font-size:0.9rem;margin-bottom:1rem;">Administra qué pediatra atiende a cada paciente.</p>
        <div style="background:white;padding:1.5rem;border-radius:15px;box-shadow:var(--card-shadow);overflow-x:auto;">
          <table style="width:100%;text-align:left;border-collapse:collapse;">
            <thead><tr style="border-bottom:2px solid var(--bg-color);color:var(--text-light);">
              <th style="padding:1rem 0;">Paciente</th><th style="padding:1rem 0;">Edad</th><th style="padding:1rem 0;">Pediatra Asignado</th><th style="padding:1rem 0;text-align:right;">Acción</th>
            </tr></thead>
            <tbody>
              ${patients.map(p => `
              <tr style="border-bottom:1px solid var(--bg-color);">
                <td style="padding:1rem 0;font-weight:500;">${p.name}</td>
                <td style="padding:1rem 0;color:var(--text-light);">${calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']))}</td>
                <td style="padding:1rem 0;">${p.doctor_name || '<span style="color:#ef4444;">Sin asignar</span>'}</td>
                <td style="padding:1rem 0;text-align:right;display:flex;gap:0.4rem;justify-content:flex-end;">
                  <button class="btn btn-secondary" style="padding:0.3rem 0.8rem;font-size:0.8rem;" onclick="openAssignPatientModal(${p.id})"><i class="fa-solid fa-user-doctor"></i> Asignar</button>
                  <button class="btn" style="padding:0.3rem 0.6rem;font-size:0.8rem;background:transparent;color:#ef4444;box-shadow:none;" onclick="deletePatient(${p.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>`).join('')}
              ${patients.length === 0 ? '<tr><td colspan="4" style="padding:1rem 0;text-align:center;color:var(--text-light);">No hay pacientes registrados.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderDoctorDashboard() {
  const q = patientSearchQuery.toLowerCase();
  const visiblePatients = q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients;

  const visibleAppts = todayAppointments.filter(a => a.status !== 'cancelada');
  const apptSection = visibleAppts.length > 0 ? `
    <div style="background:white;padding:1.5rem;border-radius:15px;margin-bottom:2rem;box-shadow:var(--card-shadow);">
      <h2 style="margin-bottom:1rem;">Citas de Hoy
        <span style="font-size:0.85rem;color:var(--text-light);font-weight:400;margin-left:0.5rem;">${new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</span>
      </h2>
      ${visibleAppts.map(a => `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.8rem 0;border-bottom:1px solid var(--bg-color);flex-wrap:wrap;">
          <div style="font-size:1.1rem;font-weight:700;color:var(--primary);min-width:55px;">${a.time}</div>
          <div style="flex:1;min-width:120px;">
            <div style="font-weight:600;">${a.patient_name || 'Paciente'}</div>
            ${a.notes ? `<div style="font-size:0.85rem;color:var(--text-light);">${a.notes}</div>` : ''}
          </div>
          <span class="appt-badge appt-${a.status}">${a.status}</span>
          ${a.status === 'pendiente'  ? `<button class="btn" style="padding:0.3rem 0.7rem;font-size:0.8rem;background:var(--secondary);color:white;box-shadow:none;" onclick="updateAppointmentStatus(${a.id},'confirmada')">Confirmar</button>` : ''}
          ${a.status === 'confirmada' ? `<button class="btn" style="padding:0.3rem 0.7rem;font-size:0.8rem;background:var(--primary);color:white;box-shadow:none;" onclick="updateAppointmentStatus(${a.id},'completada')">Completar</button>` : ''}
        </div>
      `).join('')}
    </div>` : '';

  const patientsHtml = visiblePatients.length > 0
    ? visiblePatients.map(p => `
      <div class="patient-card" onclick="viewPatient(${p.id})">
        <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="patient-info">
          <h3>${p.name}</h3>
          <p><i class="fa-regular fa-clock"></i> ${calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']))}</p>
          <div style="margin-top:0.5rem;display:flex;gap:1rem;font-size:0.8rem;font-weight:500;">
            <span><i class="fa-solid fa-weight-scale" style="color:var(--secondary)"></i> ${p.weight} kg</span>
            <span><i class="fa-solid fa-ruler-vertical" style="color:var(--secondary)"></i> ${p.height} cm</span>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:var(--text-light);"></i>
      </div>`).join('')
    : `<div style="text-align:center;padding:3rem;background:white;border-radius:15px;grid-column:1/-1;">
        <i class="fa-solid fa-folder-open" style="font-size:3rem;color:var(--primary-light);margin-bottom:1rem;"></i>
        <h3>${q ? 'Sin resultados' : 'Aún no tienes pacientes'}</h3>
        <p style="color:var(--text-light);">${q ? 'Prueba otro término.' : 'Agrega tu primer paciente.'}</p>
      </div>`;

  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1 style="font-size:2rem;">Mis Pacientes</h1>
          <p style="color:var(--text-light);">${patients.length > 0 ? `${patients.length} paciente(s) registrado(s).` : 'Bienvenido a tu panel.'}</p>
        </div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-secondary" onclick="navigate('availability-settings')"><i class="fa-regular fa-calendar"></i> Disponibilidad</button>
          <button class="btn btn-primary" onclick="navigate('patient-onboarding')"><i class="fa-solid fa-plus"></i> Nuevo Paciente</button>
        </div>
      </div>
      ${apptSection}
      <div style="margin-bottom:1.5rem;">
        <input type="text" class="form-control" placeholder="🔍 Buscar paciente por nombre..." value="${patientSearchQuery}" oninput="filterPatients(this.value)" style="max-width:400px;">
      </div>
      <div class="patients-grid">${patientsHtml}</div>
    </div>
  `;
}

function renderParentProfile() {
  const p = currentPatient;
  if (!p) {
    return `<div style="text-align:center;margin-top:4rem;">
      <h2>No hay paciente seleccionado</h2>
      <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigate(getRoleDefaultView(currentUser.role))">Volver</button>
    </div>`;
  }

  const birthDate  = p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']);
  const doctorName = p.doctor_name || 'Sin médico asignado';
  const hasActiveTutorAppt = tutorAppointments.some(a => a.status === 'pendiente' || a.status === 'confirmada');

  const historyHtml = consultations.length > 0
    ? consultations.map((h, idx) => {
        let meds = [];
        if (h.medication) meds.push(h.medication);
        if (h.medications && h.medications.length > 0) meds = meds.concat(h.medications);
        return `
        <div class="timeline-item">
          <div class="timeline-date">${h.date}</div>
          <div class="timeline-content">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <h4>${h.type || 'Consulta de Seguimiento'}</h4>
              <div style="display:flex;gap:0.4rem;">
                ${currentUser.role !== 'tutor' ? `
                <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:transparent;color:var(--primary);box-shadow:none;" onclick="editConsult(${idx})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:transparent;color:#ef4444;box-shadow:none;" onclick="deleteConsult(${idx})"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
              </div>
            </div>
            ${h.notes ? `<p style="margin:0.5rem 0;">${h.notes}</p>` : ''}
            ${meds.length > 0 ? `
            <div style="background:var(--primary-light);padding:0.8rem;border-radius:6px;margin:0.8rem 0;font-size:0.9rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <strong><i class="fa-solid fa-pills" style="color:var(--primary);"></i> Receta:</strong>
                <div style="display:flex;gap:0.4rem;">
                  <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:var(--primary);color:white;border-radius:4px;box-shadow:none;" onclick="printPrescription(${idx})"><i class="fa-solid fa-print"></i> Imprimir</button>
                  ${currentUser.role !== 'tutor' ? `<button class="btn" style="padding:0.2rem 0.5rem;font-size:0.8rem;background:white;color:var(--primary);border:1px solid var(--primary);border-radius:4px;box-shadow:none;" onclick="emailPrescription(${idx})" title="Enviar por correo"><i class="fa-regular fa-envelope"></i></button>` : ''}
                </div>
              </div>
              <ul style="margin:0 0 0 1.5rem;padding:0;">
                ${meds.map(m => `<li style="margin-bottom:0.2rem;">${m.name} — ${m.dose} (${m.freq})</li>`).join('')}
              </ul>
            </div>` : ''}
            <div class="timeline-metrics">
              <div class="metric"><i class="fa-solid fa-weight-scale"></i> ${h.weight} kg</div>
              <div class="metric"><i class="fa-solid fa-ruler-vertical"></i> ${h.height} cm</div>
              ${h.head_circ ? `<div class="metric"><i class="fa-solid fa-head-side-measles" style="color:var(--secondary)"></i> ${h.head_circ} cm</div>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')
    : '<p style="color:var(--text-light);padding:1rem 0;">No hay consultas registradas aún.</p>';

  return `
    <div class="profile-view">
      <div class="profile-header">
        <div class="profile-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div style="z-index:2;">
          <h1 style="font-size:2.5rem;margin-bottom:0.5rem;">${p.name}</h1>
          <p style="font-size:1.2rem;opacity:0.9;">${calculateAgeString(birthDate)} • ${doctorName}</p>
        </div>
        <div style="margin-left:auto;display:flex;gap:0.8rem;flex-wrap:wrap;z-index:2;">
          ${currentUser.role === 'tutor' && p.doctor_id ? `
            <button class="btn btn-primary" style="background:var(--white);color:var(--primary);" onclick="navigate('booking-calendar')">
              <i class="fa-regular fa-calendar-plus"></i> Pedir Cita
            </button>` : ''}
          ${currentUser.role !== 'tutor' ? `
            <button class="btn btn-primary" style="background:var(--white);color:var(--primary);" onclick="window.editingConsultId=null;window.editingConsultIndex=null;openModal('addConsultModal')">
              <i class="fa-solid fa-notes-medical"></i> Registrar Consulta
            </button>
            ${p.tutor_id ? `<button class="btn" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.5);" onclick="openResetPasswordModal(${p.tutor_id})" title="Cambiar clave del tutor"><i class="fa-solid fa-key"></i></button>` : ''}
          ` : ''}
        </div>
      </div>

      <div class="profile-stats">
        <div class="stat-card"><div class="stat-label">Peso Actual</div><div class="stat-value">${p.weight||0} <span style="font-size:1.2rem;color:var(--text-dark)">kg</span></div><p style="color:var(--secondary);font-size:0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Actualizado</p></div>
        <div class="stat-card"><div class="stat-label">Estatura</div><div class="stat-value">${p.height||0} <span style="font-size:1.2rem;color:var(--text-dark)">cm</span></div><p style="color:var(--secondary);font-size:0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Actualizado</p></div>
        <div class="stat-card"><div class="stat-label">Consultas</div><div class="stat-value">${consultations.length} <span style="font-size:1.2rem;color:var(--text-dark)">total</span></div><p style="color:var(--text-light);font-size:0.9rem;">Registradas</p></div>
      </div>

      <div class="charts-section">
        <h2>Curva de Crecimiento (Peso)</h2>
        <div class="chart-container"><canvas id="growthChart"></canvas></div>
      </div>

      ${currentUser.role === 'tutor' ? `
      <div class="history-section" style="margin-top:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:0.5rem;">
          <h2 style="margin:0;">Mis Citas</h2>
          ${!p.doctor_id ? '' : hasActiveTutorAppt
            ? `<span style="font-size:0.85rem;color:var(--text-light);background:#f1f5f9;padding:0.4rem 0.9rem;border-radius:20px;"><i class="fa-solid fa-lock" style="margin-right:0.4rem;"></i>Ya tienes una cita activa</span>`
            : `<button class="btn btn-primary" onclick="navigate('booking-calendar')"><i class="fa-regular fa-calendar-plus"></i> Nueva Cita</button>`}
        </div>
        ${tutorAppointments.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:0.8rem;">
            ${tutorAppointments.map(a => {
              const dateObj = new Date(a.date + 'T12:00:00');
              const day   = a.date.slice(8,10);
              const month = dateObj.toLocaleDateString('es-ES',{month:'short'}).replace('.','').toUpperCase();
              const isPast = a.date < new Date().toISOString().slice(0,10);
              return `
              <div style="background:white;border-radius:12px;padding:1rem 1.2rem;box-shadow:var(--card-shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;${isPast&&a.status==='pendiente'?'opacity:0.7;':''}">
                <div style="display:flex;align-items:center;gap:1rem;">
                  <div style="background:var(--primary-light);border-radius:10px;padding:0.5rem 0.8rem;text-align:center;min-width:52px;">
                    <div style="font-size:1.3rem;font-weight:700;color:var(--primary);">${day}</div>
                    <div style="font-size:0.7rem;color:var(--text-light);">${month}</div>
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:1rem;">${a.time} hs</div>
                    <div style="font-size:0.85rem;color:var(--text-light);">${a.doctor_name}</div>
                    ${a.notes ? `<div style="font-size:0.8rem;color:var(--text-light);margin-top:0.2rem;font-style:italic;">"${a.notes}"</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.6rem;">
                  <span class="appt-badge appt-${a.status}">${{pendiente:'Pendiente',confirmada:'Confirmada',completada:'Completada',cancelada:'Cancelada'}[a.status]||a.status}</span>
                  ${a.status==='pendiente' ? `<button class="btn" style="padding:0.25rem 0.7rem;font-size:0.8rem;background:transparent;color:#ef4444;box-shadow:none;border:1px solid #ef4444;border-radius:6px;" onclick="cancelMyAppointment(${a.id})"><i class="fa-solid fa-xmark"></i> Cancelar</button>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        ` : `<p style="color:var(--text-light);padding:0.5rem 0;">Aún no tienes citas agendadas. <a href="#" style="color:var(--primary);" onclick="navigate('booking-calendar');return false;">Pedir una cita</a>.</p>`}
      </div>` : ''}

      <div class="history-section">
        <h2 style="margin-bottom:1.5rem;">Historial de Consultas</h2>
        <div class="timeline">${historyHtml}</div>
      </div>

      ${p.onboarding_data && Object.keys(p.onboarding_data).length > 0 ? `
      <div class="history-section" style="margin-top:2rem;">
        <h2 style="margin-bottom:2rem;font-size:1.8rem;border-bottom:2px solid var(--primary-light);padding-bottom:0.5rem;">Expediente de Ingreso</h2>
        ${Object.entries(categorizeOnboardingData(p.onboarding_data)).map(([cat, items]) => {
          if (!items.length) return '';
          return `
          <details class="expediente-accordion" ${cat === 'Datos Generales y Nacimiento' ? 'open' : ''}>
            <summary class="expediente-summary">
              <div style="display:flex;align-items:center;gap:0.8rem;"><i class="fa-solid fa-folder folder-icon" style="color:var(--secondary);"></i> ${cat}</div>
              <i class="fa-solid fa-chevron-down accordion-icon" style="color:var(--text-light);transition:transform 0.3s;"></i>
            </summary>
            <div class="expediente-accordion-content">
              <div class="expediente-grid">
                ${items.map(it => `
                <div class="expediente-item">
                  <span class="expediente-label"><i class="fa-solid fa-check" style="color:var(--secondary);margin-right:0.4rem;font-size:0.8rem;"></i>${formatLabel(it.key)}</span>
                  <span class="expediente-value">${it.value}</span>
                </div>`).join('')}
              </div>
            </div>
          </details>`;
        }).join('')}
      </div>` : ''}
    </div>
  `;
}

function renderOnboardingSuccess() {
  const data = window.successData || {};
  const patientName = data.patientName || 'Paciente';
  const momName     = data.momName    || 'No especificado';
  const dadName     = data.dadName    || 'No especificado';
  const email       = data.tutorEmail || '';
  const password    = data.password   || '';
  const loginUrl    = window.location.href.split('#')[0].split('?')[0];
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(loginUrl)}`;

  return `
    <div style="max-width:900px;margin:2rem auto;background:white;border-radius:20px;overflow:hidden;box-shadow:var(--card-shadow);">
      <div style="background:var(--primary);padding:3rem 2rem;text-align:center;color:white;">
        <div style="width:80px;height:80px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:2.5rem;"><i class="fa-solid fa-check"></i></div>
        <h1 style="font-size:2.5rem;margin-bottom:0.5rem;color:white;">¡Perfil Creado Exitosamente!</h1>
        <p style="font-size:1.2rem;opacity:0.9;">El expediente de <strong>${patientName}</strong> ya está listo.</p>
      </div>
      <div style="padding:3rem;display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center;">
        <div>
          <h2 style="margin-bottom:1.5rem;font-size:1.5rem;border-bottom:2px solid var(--primary-light);padding-bottom:0.5rem;">Credenciales de Acceso</h2>
          <div style="background:var(--bg-color);padding:1.5rem;border-radius:12px;margin-bottom:2rem;">
            <div style="margin-bottom:1rem;">
              <label style="font-size:0.85rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:0.3rem;">Tutores:</label>
              <div style="font-weight:500;font-size:1.1rem;">${momName}${dadName !== 'No especificado' ? ' & ' + dadName : ''}</div>
            </div>
            ${email ? `
            <div style="margin-bottom:1rem;">
              <label style="font-size:0.85rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:0.3rem;">Correo (Usuario):</label>
              <div style="font-weight:600;font-size:1.1rem;color:var(--primary);">${email}</div>
            </div>
            ${password ? `<div>
              <label style="font-size:0.85rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:0.3rem;">Contraseña Temporal:</label>
              <div style="font-weight:600;font-size:1.3rem;letter-spacing:2px;background:white;padding:0.5rem;border-radius:6px;display:inline-block;border:1px dashed var(--text-light);">${password}</div>
            </div>` : ''}` : `<p style="color:var(--text-light);font-style:italic;">No se generó cuenta de tutor.</p>`}
          </div>
          <button class="btn btn-primary" style="width:100%;font-size:1.1rem;padding:1rem;" onclick="navigate('doctor-dashboard')">Ir a mi Panel</button>
        </div>
        <div style="text-align:center;border-left:1px solid var(--bg-color);padding-left:3rem;">
          <h3 style="margin-bottom:1rem;">Acceso Rápido</h3>
          <p style="color:var(--text-light);font-size:0.95rem;margin-bottom:2rem;">Escanea el QR para ir directo al login.</p>
          <div style="background:white;padding:1rem;border-radius:12px;box-shadow:var(--card-shadow);display:inline-block;">
            <img src="${qrUrl}" alt="QR Login" style="width:200px;height:200px;display:block;">
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAvailabilitySettings() {
  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Horarios de Atención</h1>
          <p style="color:var(--text-light);">Activa los días y define tus franjas horarias</p>
        </div>
        <button class="btn btn-secondary" onclick="navigate('doctor-dashboard')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      </div>

      <div style="max-width:680px;">
        <div style="background:white;border-radius:18px;padding:1.75rem 2rem;box-shadow:var(--card-shadow);">
          <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:1.5rem;padding-bottom:1.25rem;border-bottom:2px solid var(--bg-color);">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;">
              <i class="fa-regular fa-calendar-check" style="color:var(--primary);font-size:1.1rem;"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">Configuración semanal</div>
              <div style="font-size:0.8rem;color:var(--text-light);">Activa un día con el toggle para configurar su horario</div>
            </div>
          </div>
          <div id="availabilityGrid"><p style="color:var(--text-light);text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p></div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.25rem;">
          <button class="btn btn-secondary" onclick="navigate('doctor-dashboard')" style="padding:0.65rem 1.4rem;">
            Cancelar
          </button>
          <button class="btn btn-primary" onclick="saveAvailability()" style="padding:0.65rem 1.6rem;gap:0.5rem;">
            <i class="fa-solid fa-floppy-disk"></i> Guardar Horario
          </button>
        </div>
      </div>
    </div>
  `;
}

async function loadAvailability() {
  const grid = document.getElementById('availabilityGrid');
  if (!grid) return;
  try {
    const data = await API.get(`/appointments/availability/${currentUser.id}`);
    const byDow = {};
    (data || []).forEach(b => { byDow[b.day_of_week] = b; });
    const days = [
      {dow:1,label:'Lunes',abbr:'LUN'},
      {dow:2,label:'Martes',abbr:'MAR'},
      {dow:3,label:'Miércoles',abbr:'MIÉ'},
      {dow:4,label:'Jueves',abbr:'JUE'},
      {dow:5,label:'Viernes',abbr:'VIE'},
      {dow:6,label:'Sábado',abbr:'SÁB'}
    ];
    grid.innerHTML = `<div class="avail-grid">${days.map(d => {
      const b = byDow[d.dow];
      const active = !!b;
      const slots = b ? Math.floor((toMinutes(b.end_time) - toMinutes(b.start_time)) / b.slot_minutes) : 0;
      return `
        <div class="avail-day-card ${active ? 'active' : ''}" id="avCard_${d.dow}">
          <div class="avail-day-header">
            <div class="avail-day-left">
              <div class="avail-day-badge">${d.abbr}</div>
              <span class="avail-day-name">${d.label}</span>
              <span class="avail-slots-preview" id="avPreview_${d.dow}">${b ? `${b.start_time}–${b.end_time} · ${slots} turnos` : ''}</span>
            </div>
            <label class="toggle-switch" title="${active ? 'Desactivar' : 'Activar'} ${d.label}">
              <input type="checkbox" ${active ? 'checked' : ''} onchange="toggleAvailDay(${d.dow})" id="avCheck_${d.dow}">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="availability-times" id="avTimes_${d.dow}" style="display:${active ? 'grid' : 'none'};">
            <div class="avail-field">
              <div class="avail-field-label"><i class="fa-regular fa-clock"></i> Inicio</div>
              <input type="time" class="form-control" id="avStart_${d.dow}" value="${b ? b.start_time : '09:00'}" oninput="updateSlotPreview(${d.dow})">
            </div>
            <div class="avail-field">
              <div class="avail-field-label"><i class="fa-solid fa-flag-checkered"></i> Fin</div>
              <input type="time" class="form-control" id="avEnd_${d.dow}" value="${b ? b.end_time : '17:00'}" oninput="updateSlotPreview(${d.dow})">
            </div>
            <div class="avail-field">
              <div class="avail-field-label"><i class="fa-regular fa-hourglass-half"></i> Intervalo</div>
              <select class="form-control" id="avSlot_${d.dow}" onchange="updateSlotPreview(${d.dow})">
                <option value="15" ${b&&b.slot_minutes==15?'selected':''}>15 min</option>
                <option value="20" ${b&&b.slot_minutes==20?'selected':''}>20 min</option>
                <option value="30" ${!b||b.slot_minutes==30?'selected':''}>30 min</option>
                <option value="45" ${b&&b.slot_minutes==45?'selected':''}>45 min</option>
                <option value="60" ${b&&b.slot_minutes==60?'selected':''}>60 min</option>
              </select>
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;
  } catch (e) {
    grid.innerHTML = `<p style="color:#ef4444;">Error cargando disponibilidad: ${e.message}</p>`;
  }
}

function toMinutes(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }

window.updateSlotPreview = function(dow) {
  const start = document.getElementById(`avStart_${dow}`)?.value;
  const end   = document.getElementById(`avEnd_${dow}`)?.value;
  const slot  = parseInt(document.getElementById(`avSlot_${dow}`)?.value || '30');
  const prev  = document.getElementById(`avPreview_${dow}`);
  if (!prev || !start || !end) return;
  const count = Math.max(0, Math.floor((toMinutes(end) - toMinutes(start)) / slot));
  prev.textContent = `${start}–${end} · ${count} turnos`;
};

window.toggleAvailDay = function(dow) {
  const check = document.getElementById(`avCheck_${dow}`);
  const times = document.getElementById(`avTimes_${dow}`);
  const card  = document.getElementById(`avCard_${dow}`);
  if (!check || !times || !card) return;
  const on = check.checked;
  times.style.display = on ? 'grid' : 'none';
  card.classList.toggle('active', on);
  if (on) updateSlotPreview(dow);
};

window.saveAvailability = async function() {
  const dows = [1,2,3,4,5,6];
  const availability = [];
  dows.forEach(dow => {
    const check = document.getElementById(`avCheck_${dow}`);
    if (check && check.checked) {
      availability.push({
        day_of_week:  dow,
        start_time:   document.getElementById(`avStart_${dow}`)?.value || '09:00',
        end_time:     document.getElementById(`avEnd_${dow}`)?.value   || '17:00',
        slot_minutes: parseInt(document.getElementById(`avSlot_${dow}`)?.value || '30')
      });
    }
  });
  try {
    await API.put('/appointments/availability', { availability });
    alert('Disponibilidad guardada correctamente.');
    navigate('doctor-dashboard');
  } catch (e) { alert('Error: ' + e.message); }
};

function renderBookingCalendar() {
  const doctorId = currentPatient && currentPatient.doctor_id;
  if (!doctorId) {
    return `<div class="dashboard"><div class="dashboard-header"><div><h1>Solicitar Cita</h1><p style="color:var(--text-light);">Tu bebé no tiene médico asignado.</p></div><button class="btn btn-secondary" onclick="navigate('parent-profile')"><i class="fa-solid fa-arrow-left"></i> Volver</button></div></div>`;
  }
  const activeAppt = tutorAppointments.find(a => a.status === 'pendiente' || a.status === 'confirmada');
  if (activeAppt) {
    return `<div class="dashboard"><div class="dashboard-header" style="flex-wrap:wrap;gap:1rem;">
      <div>
        <h1>Solicitar Cita</h1>
        <p style="color:var(--text-light);">Ya tienes una cita <strong>${activeAppt.status}</strong> el <strong>${activeAppt.date}</strong> a las <strong>${activeAppt.time}</strong> hs. Para agendar una nueva, primero cancela la cita activa desde tu perfil.</p>
      </div>
      <button class="btn btn-secondary" onclick="navigate('parent-profile')"><i class="fa-solid fa-arrow-left"></i> Volver al perfil</button>
    </div></div>`;
  }

  const firstDay   = new Date(bookingYear, bookingMonth, 1).getDay();
  const daysInMon  = new Date(bookingYear, bookingMonth + 1, 0).getDate();
  const startOff   = (firstDay + 6) % 7;
  const today      = new Date().toISOString().slice(0, 10);
  const monthName  = new Date(bookingYear, bookingMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  let cells = Array(startOff).fill(`<div class="calendar-day empty"></div>`).join('');
  for (let d = 1; d <= daysInMon; d++) {
    const ds  = `${bookingYear}-${String(bookingMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ds < today ? 'past' : ds === bookingSelectedDate ? 'selected' : '';
    cells += `<div class="calendar-day ${cls}" ${ds >= today ? `onclick="selectBookingDate('${ds}')"` : ''}>${d}</div>`;
  }

  const slotArea = bookingSelectedDate
    ? (bookingSlots.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1rem;">
            ${bookingSlots.map(s => `
              <button class="btn ${s.available?'btn-secondary':''}"
                style="padding:0.4rem 0.8rem;font-size:0.9rem;${!s.available?'opacity:0.4;cursor:not-allowed;background:#e2e8f0;color:var(--text-light);box-shadow:none;':''}"
                ${s.available ? `onclick="confirmBookingSlot('${bookingSelectedDate}','${s.time}')"` : 'disabled'}>
                ${s.time}
              </button>`).join('')}
          </div>`
        : `<p style="color:var(--text-light);margin-top:1rem;">No hay horarios disponibles para este día.</p>`)
    : `<p style="color:var(--text-light);margin-top:1rem;">Selecciona un día del calendario.</p>`;

  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Solicitar Cita</h1>
          <p style="color:var(--text-light);">Con ${currentPatient.doctor_name || 'tu médico'}</p>
        </div>
        <button class="btn btn-secondary" onclick="navigate('parent-profile')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      </div>
      <div class="booking-layout">
        <div style="background:white;border-radius:var(--border-radius);padding:1.5rem;box-shadow:var(--card-shadow);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <button class="btn btn-secondary" style="padding:0.3rem 0.8rem;" onclick="changeBookingMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
            <strong style="text-transform:capitalize;">${monthName}</strong>
            <button class="btn btn-secondary" style="padding:0.3rem 0.8rem;" onclick="changeBookingMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="calendar-grid-header">${['L','M','M','J','V','S','D'].map(d=>`<div style="font-size:0.8rem;color:var(--text-light);font-weight:600;padding:0.3rem;text-align:center;">${d}</div>`).join('')}</div>
          <div class="calendar-grid">${cells}</div>
        </div>
        <div style="background:white;border-radius:var(--border-radius);padding:1.5rem;box-shadow:var(--card-shadow);">
          <h3 style="margin-bottom:0.5rem;">${bookingSelectedDate ? `Horarios — ${bookingSelectedDate}` : 'Horarios disponibles'}</h3>
          <div id="bookingSlots">${slotArea}</div>
        </div>
      </div>
    </div>
  `;
}

window.changeBookingMonth = function(delta) {
  bookingMonth += delta;
  if (bookingMonth < 0)  { bookingMonth = 11; bookingYear--; }
  if (bookingMonth > 11) { bookingMonth = 0;  bookingYear++; }
  bookingSelectedDate = null; bookingSlots = [];
  renderApp();
};

window.selectBookingDate = async function(dateStr) {
  bookingSelectedDate = dateStr; bookingSlots = [];
  renderApp();
  try {
    const data = await API.get(`/appointments/slots/${currentPatient.doctor_id}/${dateStr}`);
    bookingSlots = data || [];
    const el = document.getElementById('bookingSlots');
    if (!el) return;
    el.innerHTML = bookingSlots.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1rem;">
          ${bookingSlots.map(s => `
            <button class="btn ${s.available?'btn-secondary':''}"
              style="padding:0.4rem 0.8rem;font-size:0.9rem;${!s.available?'opacity:0.4;cursor:not-allowed;background:#e2e8f0;color:var(--text-light);box-shadow:none;':''}"
              ${s.available ? `onclick="confirmBookingSlot('${dateStr}','${s.time}')"` : 'disabled'}>
              ${s.time}
            </button>`).join('')}
        </div>`
      : `<p style="color:var(--text-light);margin-top:1rem;">No hay horarios para este día.</p>`;
  } catch (e) {
    const el = document.getElementById('bookingSlots');
    if (el) el.innerHTML = `<p style="color:#ef4444;">${e.message}</p>`;
  }
};

window.confirmBookingSlot = function(date, time) {
  const notes = prompt(`Reservar el ${date} a las ${time}.\nNotas adicionales (opcional):`) ;
  if (notes === null) return;
  bookAppointmentSlot(date, time, notes);
};

window.bookAppointmentSlot = async function(date, time, notes) {
  try {
    await API.post('/appointments', { patient_id: currentPatient.id, doctor_id: currentPatient.doctor_id, date, time, notes: notes||'' });
    tutorAppointments = (await API.get('/appointments')) || [];
    alert(`¡Cita solicitada! ${date} a las ${time}. El médico confirmará tu cita pronto.`);
    navigate('parent-profile');
  } catch (e) { alert('Error al agendar: ' + e.message); }
};

window.cancelMyAppointment = async function(id) {
  if (!confirm('¿Deseas cancelar esta cita?')) return;
  try {
    await API.del(`/appointments/${id}`);
    tutorAppointments = (await API.get('/appointments')) || [];
    renderApp();
  } catch (e) { alert('Error al cancelar: ' + e.message); }
};

// === Modals HTML ===
function renderModals() {
  return `
    <!-- Forgot Password Modal -->
    <div class="modal-overlay" id="forgotPasswordModal" onclick="if(event.target===this)closeModal('forgotPasswordModal')">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h2><i class="fa-solid fa-key" style="color:var(--primary);margin-right:0.5rem;"></i>Recuperar Contraseña</h2>
          <button class="close-btn" onclick="closeModal('forgotPasswordModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="forgotMsg" style="display:none;background:#d1fae5;color:#065f46;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:0.9rem;"></div>
        <p style="color:var(--text-light);font-size:0.9rem;margin-bottom:1.25rem;">Ingresa tu correo y te enviaremos una contraseña temporal para acceder.</p>
        <div class="form-group">
          <label>Correo Electrónico</label>
          <input type="email" id="forgotEmail" class="form-control" placeholder="tu@correo.com" onkeydown="if(event.key==='Enter')sendForgotPassword()">
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem;">
          <button class="btn btn-secondary" onclick="closeModal('forgotPasswordModal')">Cancelar</button>
          <button class="btn btn-primary" onclick="sendForgotPassword()" id="forgotBtn">
            <i class="fa-solid fa-paper-plane"></i> Enviar
          </button>
        </div>
      </div>
    </div>

    <!-- Add Consult Modal -->
    <div class="modal-overlay" id="addConsultModal" onclick="if(event.target===this)closeModal('addConsultModal')">
      <div class="modal-content">
        <div class="modal-header"><h2>Registrar Consulta</h2><button class="close-btn" onclick="closeModal('addConsultModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
          <div class="form-group"><label>Peso (kg)</label><input type="number" id="consultWeight" step="0.1" class="form-control" placeholder="Ej. 8.5"></div>
          <div class="form-group"><label>Estatura (cm)</label><input type="number" id="consultHeight" step="0.1" class="form-control" placeholder="Ej. 71"></div>
          <div class="form-group"><label>P. Cefálico</label><input type="number" id="consultHead" step="0.1" class="form-control" placeholder="Ej. 45"></div>
        </div>
        <div class="form-group">
          <label>Tipo de consulta</label>
          <select id="consultType" class="form-control">
            <option value="Control de niño sano">Control de niño sano</option>
            <option value="Enfermedad">Enfermedad</option>
          </select>
        </div>
        <div class="form-group">
          <label>¿Requiere medicación?</label>
          <select id="consultMedicationReq" class="form-control" onchange="document.getElementById('medicationDetails').style.display=this.value==='Sí'?'block':'none'">
            <option value="No">No</option><option value="Sí">Sí</option>
          </select>
        </div>
        <div id="medicationDetails" style="display:none;background:var(--primary-light);padding:1rem;border-radius:8px;margin-bottom:1.5rem;">
          <div id="medicationsList"></div>
          <button class="btn" style="background:transparent;color:var(--primary);border:1px dashed var(--primary);width:100%;margin-top:1rem;padding:0.5rem;" onclick="addMedicationField()"><i class="fa-solid fa-plus"></i> Añadir medicamento</button>
        </div>
        <div class="form-group"><label>Notas Clínicas</label><textarea id="consultNotes" class="form-control" rows="4" placeholder="Observaciones, vacunas, etc..."></textarea></div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="saveConsult()">Guardar Registro</button>
      </div>
    </div>

    <!-- Delete Consult Confirm -->
    <div class="modal-overlay" id="deleteConfirmModal" onclick="if(event.target===this)closeModal('deleteConfirmModal')">
      <div class="modal-content" style="max-width:400px;text-align:center;">
        <i class="fa-solid fa-circle-exclamation" style="font-size:3rem;color:#ef4444;margin-bottom:1rem;"></i>
        <h2 style="margin-bottom:1rem;">¿Eliminar Consulta?</h2>
        <p style="color:var(--text-light);margin-bottom:1.5rem;">Esta acción no se puede deshacer.</p>
        <div style="display:flex;gap:1rem;">
          <button class="btn" style="flex:1;background:#f1f5f9;color:var(--text-dark);" onclick="closeModal('deleteConfirmModal')">Cancelar</button>
          <button class="btn" style="flex:1;background:#ef4444;color:white;" onclick="confirmDeleteConsult()">Eliminar</button>
        </div>
      </div>
    </div>

    <!-- User Modal -->
    <div class="modal-overlay" id="userModal" onclick="if(event.target===this)closeModal('userModal')">
      <div class="modal-content">
        <div class="modal-header"><h2 id="userModalTitle">Añadir Pediatra</h2><button class="close-btn" onclick="closeModal('userModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="form-group"><label>Nombre Completo</label><input type="text" id="userModalName" class="form-control" placeholder="Ej. Dra. Ana Gómez"></div>
        <div class="form-group"><label>Correo Electrónico</label><input type="email" id="userModalEmail" class="form-control" placeholder="ej. dra.ana@peditrack.com"></div>
        <div class="form-group"><label>Contraseña</label><input type="text" id="userModalPassword" class="form-control" placeholder="Contraseña"></div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="saveUser()">Guardar Pediatra</button>
      </div>
    </div>

    <!-- Delete User Confirm -->
    <div class="modal-overlay" id="deleteUserModal" onclick="if(event.target===this)closeModal('deleteUserModal')">
      <div class="modal-content" style="max-width:400px;text-align:center;">
        <i class="fa-solid fa-user-xmark" style="font-size:3rem;color:#ef4444;margin-bottom:1rem;"></i>
        <h2 style="margin-bottom:1rem;">¿Eliminar Pediatra?</h2>
        <p style="color:var(--text-light);margin-bottom:1.5rem;">Los pacientes quedarán sin asignar.</p>
        <div style="display:flex;gap:1rem;">
          <button class="btn" style="flex:1;background:#f1f5f9;color:var(--text-dark);" onclick="closeModal('deleteUserModal')">Cancelar</button>
          <button class="btn" style="flex:1;background:#ef4444;color:white;" onclick="confirmDeleteUser()">Eliminar</button>
        </div>
      </div>
    </div>

    <!-- Assign Patient Modal -->
    <div class="modal-overlay" id="assignPatientModal" onclick="if(event.target===this)closeModal('assignPatientModal')">
      <div class="modal-content">
        <div class="modal-header"><h2>Asignar Pediatra</h2><button class="close-btn" onclick="closeModal('assignPatientModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <p style="color:var(--text-light);margin-bottom:1rem;">Selecciona el pediatra para este paciente.</p>
        <div class="form-group">
          <label>Pediatra</label>
          <select id="assignPatientSelect" class="form-control">
            <option value="">Sin asignar</option>
            ${pediatricians.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="savePatientAssignment()">Guardar Asignación</button>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div class="modal-overlay" id="resetPasswordModal" onclick="if(event.target===this)closeModal('resetPasswordModal')">
      <div class="modal-content" style="max-width:400px;">
        <div class="modal-header"><h2>Cambiar Contraseña del Tutor</h2><button class="close-btn" onclick="closeModal('resetPasswordModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="form-group"><label>Nueva Contraseña</label><input type="text" id="resetPasswordInput" class="form-control" placeholder="Mín. 6 caracteres"></div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="confirmResetPassword()">Actualizar Contraseña</button>
      </div>
    </div>
  `;
}

// === Onboarding ===
function renderOnboarding() {
  const totalSteps = 7;
  const stepTitles = ['Datos Generales y Nacimiento','Antecedentes Familiares','Primeros Estudios y Vacunas','Alimentación','Digestión (Pañales)','Sueño y Seguridad','Desarrollo y Sentidos'];
  let content = '';

  if (currentOnboardingStep === 1) {
    content = `
      <div class="form-group"><label>Nombre completo del bebé</label><input type="text" id="new-patient-name" class="form-control" placeholder="Ej. Juan Pérez"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;"><label>Fecha de nacimiento</label><input type="date" class="form-control"></div>
        <div class="form-group" style="margin-bottom:0;"><label>Sexo</label><select name="Sexo" class="form-control"><option value="">Selecciona...</option><option>Masculino</option><option>Femenino</option></select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;"><label>Nombre de la mamá</label><input type="text" class="form-control" placeholder="Ej. María Gómez"></div>
        <div class="form-group" style="margin-bottom:0;"><label>Nombre del papá</label><input type="text" class="form-control" placeholder="Ej. Carlos Pérez"></div>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:2rem 0;">
      <h3 style="margin-bottom:1.5rem;color:var(--primary);">Información del Embarazo y Nacimiento</h3>
      <div class="form-group"><label>¿De cuántas semanas nació?</label><input type="number" class="form-control" placeholder="Ej. 39"></div>
      <div class="form-group">
        <label>¿Hubo complicaciones durante el embarazo?</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.5rem;margin-bottom:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Ninguna" onchange="handleComplicationsChange(this)"> Ninguna</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Infecciones" onchange="handleComplicationsChange(this)"> Infecciones</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Presión alta" onchange="handleComplicationsChange(this)"> Presión alta</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Diabetes" onchange="handleComplicationsChange(this)"> Diabetes</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Otra" onchange="handleComplicationsChange(this)"> Otra</label>
        </div>
        <input type="text" id="otra-complicacion" class="form-control" placeholder="Especificar..." style="display:none;margin-top:0.5rem;">
      </div>
      <div class="form-group">
        <label>¿Tomaste medicamentos durante el embarazo?</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.5rem;margin-bottom:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Ninguno" onchange="handleMedicationsChange(this)"> Ninguno</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Ácido Fólico" onchange="handleMedicationsChange(this)"> Ácido Fólico</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Hierro" onchange="handleMedicationsChange(this)"> Hierro</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Vitaminas prenatales" onchange="handleMedicationsChange(this)"> Vitaminas prenatales</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="checkbox" value="Otros" onchange="handleMedicationsChange(this)"> Otros</label>
        </div>
        <input type="text" id="otros-medicamentos" class="form-control" placeholder="Especificar..." style="display:none;margin-top:0.5rem;">
      </div>
      <div class="form-group">
        <label>¿Parto natural o cesárea?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="tipoParto" value="Natural" onchange="document.getElementById('motivo-cesarea').style.display='none'"> Natural</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="tipoParto" value="Cesárea" onchange="document.getElementById('motivo-cesarea').style.display='block'"> Cesárea</label>
        </div>
        <input type="text" id="motivo-cesarea" class="form-control" placeholder="¿Motivo de la cesárea?" style="display:none;margin-top:0.5rem;">
      </div>
      <div class="form-group">
        <label>¿El bebé lloró y respiró inmediatamente?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="lloroNacer" value="Sí" onchange="document.getElementById('motivo-no-lloro').style.display='none'"> Sí</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="lloroNacer" value="No" onchange="document.getElementById('motivo-no-lloro').style.display='block'"> No</label>
        </div>
        <input type="text" id="motivo-no-lloro" class="form-control" placeholder="¿Por qué no?" style="display:none;margin-top:0.5rem;margin-bottom:1rem;">
        <label style="margin-top:1rem;display:block;font-size:0.95rem;color:var(--text-light);">Calificación Apgar:</label>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<input type="radio" name="apgarScore" id="apgar${n}" value="${n}" class="apgar-radio"><label for="apgar${n}" class="apgar-label">${n}</label>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Peso (kg), Talla (cm) y PC (cm) al nacer</label>
        <div style="display:flex;gap:1rem;">
          <input type="number" step="0.1" class="form-control" placeholder="Peso">
          <input type="number" step="0.1" class="form-control" placeholder="Talla">
          <input type="number" step="0.1" class="form-control" placeholder="PC">
        </div>
      </div>
      <div class="form-group">
        <label>¿Se fue a casa o quedó internado?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="fueACasa" value="Sí" onchange="document.getElementById('motivo-internado').style.display='none'"> A casa</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="fueACasa" value="No" onchange="document.getElementById('motivo-internado').style.display='block'"> Internado</label>
        </div>
        <input type="text" id="motivo-internado" class="form-control" placeholder="¿Motivo?" style="display:none;margin-top:0.5rem;">
      </div>
      <div class="form-group">
        <label>¿Presentó ictericia?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="ictericia" value="Sí"> Sí</label>
          <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="ictericia" value="No"> No</label>
        </div>
      </div>`;
  } else if (currentOnboardingStep === 2) {
    content = `
      <div class="form-group"><label>¿Enfermedades importantes en la familia?</label><textarea class="form-control" rows="3" placeholder="Detallar familiares y enfermedades..."></textarea></div>
      <div class="form-group"><label>Estatura de mamá y papá (cm)</label><div style="display:flex;gap:1rem;"><input type="number" class="form-control" placeholder="Estatura Mamá"><input type="number" class="form-control" placeholder="Estatura Papá"></div></div>`;
  } else if (currentOnboardingStep === 3) {
    const tamices = [{id:'metabolico',label:'Tamiz Metabólico'},{id:'auditivo',label:'Tamiz Auditivo'},{id:'cardiaco',label:'Tamiz Cardiaco'},{id:'visual',label:'Tamiz Visual'},{id:'ortopedico',label:'Tamiz Ortopédico'}];
    content = `
      <h3 style="margin-bottom:1.5rem;color:var(--primary);">Tamices Neonatales</h3>
      ${tamices.map(t => `
        <div class="form-group">
          <label>${t.label}</label>
          <div style="display:flex;gap:2rem;margin-top:0.5rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="tamiz_${t.id}" value="Sí" onchange="document.getElementById('resultado-${t.id}').style.display='block'"> Sí</label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="tamiz_${t.id}" value="No" onchange="document.getElementById('resultado-${t.id}').style.display='none'"> No</label>
          </div>
          <div id="resultado-${t.id}" style="display:none;margin-top:0.5rem;">
            <select class="form-control"><option value="">Resultado...</option><option>Normal</option><option>Anormal</option><option>No concluyente</option></select>
          </div>
        </div>`).join('')}
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:2rem 0;">
      <h3 style="margin-bottom:1.5rem;color:var(--primary);">Vacunas al Nacer</h3>
      <div class="form-group"><label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-weight:500;"><input type="checkbox" onchange="document.getElementById('fecha-bcg').style.display=this.checked?'block':'none'"> BCG (Tuberculosis)</label><div id="fecha-bcg" style="display:none;margin-top:0.5rem;"><input type="date" class="form-control" style="max-width:250px;"></div></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-weight:500;"><input type="checkbox" onchange="document.getElementById('fecha-hepb').style.display=this.checked?'block':'none'"> Hepatitis B (1ra dosis)</label><div id="fecha-hepb" style="display:none;margin-top:0.5rem;"><input type="date" class="form-control" style="max-width:250px;"></div></div>`;
  } else if (currentOnboardingStep === 4) {
    content = `
      <div class="form-group"><label>¿Qué está comiendo el bebé?</label><select class="form-control" onchange="handleAlimentacionChange(this.value)"><option value="">Selecciona...</option><option value="materna">Leche materna exclusiva</option><option value="formula">Fórmula exclusiva</option><option value="mixta">Lactancia mixta</option></select></div>
      <div id="seccion-materna" style="display:none;">
        <h4 style="color:var(--primary);margin-bottom:1rem;margin-top:1.5rem;border-bottom:1px solid var(--primary-light);padding-bottom:0.5rem;">Detalles Leche Materna</h4>
        <div class="form-group"><label>¿Cada cuánto pide pecho?</label><input type="text" class="form-control" placeholder="Ej. A libre demanda, cada 2 horas..."></div>
        <div class="form-group"><label>¿Cuánto dura comiendo?</label><input type="text" class="form-control" placeholder="Ej. 15 minutos por pecho..."></div>
        <div class="form-group"><label>¿Tienes dolor al amamantar?</label><div style="display:flex;gap:2rem;margin-top:0.5rem;"><label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="dolorPecho" value="Sí"> Sí</label><label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;"><input type="radio" name="dolorPecho" value="No"> No</label></div></div>
        <div class="form-group"><label>Comentarios</label><textarea class="form-control" rows="2" placeholder="Ej. Problemas de agarre, uso de pezoneras..."></textarea></div>
      </div>
      <div id="seccion-formula" style="display:none;">
        <h4 style="color:var(--secondary);margin-bottom:1rem;margin-top:1.5rem;border-bottom:1px solid var(--primary-light);padding-bottom:0.5rem;">Detalles Fórmula</h4>
        <div class="form-group"><label>¿Qué marca de fórmula?</label><input type="text" class="form-control" placeholder="Ej. NAN 1, Similac..."></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;"><div class="form-group" style="margin-bottom:0;"><label>¿Cuántas onzas?</label><input type="number" step="0.5" class="form-control" placeholder="Ej. 3"></div><div class="form-group" style="margin-bottom:0;"><label>¿Cada cuántas horas?</label><input type="number" step="0.5" class="form-control" placeholder="Ej. 3"></div></div>
      </div>`;
  } else if (currentOnboardingStep === 5) {
    content = `
      <div class="form-group"><label>¿Regurgita mucha leche?</label><input type="text" class="form-control" placeholder="Sí / No, frecuencia..."></div>
      <div class="form-group"><label>¿Cuántos pañales de pipí en 24h?</label><input type="number" class="form-control" placeholder="Ej. 6"></div>
      <div class="form-group"><label>¿Cuántas veces hace popó y cómo es?</label><input type="text" class="form-control" placeholder="Ej. 3 veces, amarillo mostaza, aguada..."></div>
      <div class="form-group"><label>¿Sufre de cólicos?</label><textarea class="form-control" rows="2" placeholder="Ej. Sí, por las tardes llora mucho..."></textarea></div>`;
  } else if (currentOnboardingStep === 6) {
    content = `
      <div class="form-group"><label>¿Dónde duerme el bebé?</label><select class="form-control" onchange="document.getElementById('otro-lugar-dormir').style.display=this.value==='Otros'?'block':'none'"><option value="">Selecciona...</option><option>Cuna</option><option>Moisés</option><option>Cama compartida</option><option value="Otros">Otros</option></select><input type="text" id="otro-lugar-dormir" class="form-control" placeholder="Especifica..." style="display:none;margin-top:0.5rem;"></div>
      <div class="form-group"><label>¿En qué posición lo acuestas?</label><select class="form-control"><option>Boca arriba</option><option>De lado</option><option>Boca abajo</option></select></div>
      <div class="form-group"><label>¿Hay cobijas o peluches en la cuna?</label><div style="display:flex;gap:2rem;margin-top:0.5rem;"><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="objetosCuna" value="Sí"> Sí</label><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="objetosCuna" value="No"> No</label></div></div>
      <div class="form-group"><label>¿Cuántas horas duerme seguidas?</label><input type="text" class="form-control" placeholder="Ej. 2h de día, 4h de noche..."></div>
      <div class="form-group"><label>¿Alguien fuma cerca del bebé?</label><div style="display:flex;gap:2rem;margin-top:0.5rem;"><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="fumaCasa" value="Sí"> Sí</label><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="fumaCasa" value="No"> No</label></div></div>`;
  } else if (currentOnboardingStep === 7) {
    const devQ = [{id:'fijaMirada',text:'¿Fija la mirada cuando te acercas?'},{id:'sustoRuidos',text:'¿Se sobresalta con ruidos fuertes?'},{id:'calmaVoz',text:'¿Se calma al escuchar tu voz?'},{id:'levantaCabeza',text:'Boca abajo, ¿intenta levantar la cabeza?'}];
    content = `
      ${devQ.map(q => `<div class="form-group"><label>${q.text}</label><div style="display:flex;gap:2rem;margin-top:0.5rem;"><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="${q.id}" value="Sí"> Sí</label><label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;"><input type="radio" name="${q.id}" value="No"> No</label></div></div>`).join('')}
      <div class="form-group"><label>¿Cómo es el llanto y cómo lo calman?</label><textarea class="form-control" rows="2" placeholder="Ej. Llanto fuerte, se calma al mecerlo..."></textarea></div>
      <div class="form-group"><label>¿Cómo se sienten emocionalmente?</label><textarea class="form-control" rows="2" placeholder="Ej. Muy cansados pero felices..."></textarea></div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:2rem 0;">
      <h3 style="margin-bottom:1.5rem;color:var(--primary);">Acceso para el Tutor</h3>
      <p style="color:var(--text-light);font-size:0.9rem;margin-bottom:1rem;">Se generará una contraseña automática si proporcionas un correo.</p>
      <div class="form-group"><label>Correo del Tutor</label><input type="email" id="tutorEmail" class="form-control" placeholder="ej. tutor@correo.com"></div>`;
  }

  return `
    <div class="onboarding-view animate-fade-in">
      <div class="onboarding-header">
        <h1 style="font-size:2rem;margin-bottom:0.5rem;">Crear Perfil del Bebé</h1>
        <p style="color:var(--text-light);font-size:1.1rem;margin-bottom:2rem;">Paso ${currentOnboardingStep} de ${totalSteps}: <strong style="color:var(--primary);">${stepTitles[currentOnboardingStep-1]}</strong></p>
        <div class="progress-bar-container"><div class="progress-bar" style="width:${(currentOnboardingStep/totalSteps)*100}%"></div></div>
      </div>
      <div class="onboarding-content">${content}</div>
      <div class="onboarding-footer">
        <button class="btn btn-secondary" onclick="prevOnboardingStep()" ${currentOnboardingStep===1?'disabled style="opacity:0.5;cursor:not-allowed;"':''}>
          <i class="fa-solid fa-arrow-left"></i> Anterior
        </button>
        ${currentOnboardingStep < totalSteps
          ? `<button class="btn btn-primary" onclick="nextOnboardingStep()">Siguiente <i class="fa-solid fa-arrow-right"></i></button>`
          : `<button class="btn btn-primary" style="background-color:var(--secondary);color:var(--text-dark);" onclick="finishOnboarding()">Finalizar y Guardar <i class="fa-solid fa-check"></i></button>`}
      </div>
    </div>
  `;
}

// === Helpers ===
function calculateAgeString(birthDateStr) {
  if (!birthDateStr) return 'Edad desconocida';
  const [y, m, d] = birthDateStr.split('-').map(Number);
  if (!y) return 'Edad desconocida';
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  if (isNaN(birth.getTime())) return 'Edad desconocida';

  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) months = 0;

  if (months === 0) {
    const days = Math.floor((today - birth) / 86400000);
    return days <= 1 ? '1 día' : `${days} días`;
  }
  if (months < 12) return months === 1 ? '1 mes' : `${months} meses`;
  const years = Math.floor(months / 12);
  const rem   = months % 12;
  return `${years} año${years !== 1 ? 's' : ''}${rem > 0 ? ` ${rem} mes${rem !== 1 ? 'es' : ''}` : ''}`;
}

function formatLabel(key) {
  const known = {
    'new-patient-name':'Nombre del Bebé','Ej. María Gómez':'Nombre de la Madre','Ej. Carlos Pérez':'Nombre del Padre',
    'Ej. 39':'Semanas de Gestación','tipoParto':'Tipo de Parto','lloroNacer':'Lloró al nacer','apgarScore':'Apgar',
    'Peso':'Peso al nacer (kg)','Talla':'Talla al nacer (cm)','PC':'Perímetro Cefálico (cm)',
    'fueACasa':'Se fue a casa','ictericia':'Presentó Ictericia','Detallar familiares y enfermedades...':'Antecedentes Familiares',
    'Estatura Mamá':'Estatura Mamá (cm)','Estatura Papá':'Estatura Papá (cm)',
    'tamiz_metabolico':'Tamiz Metabólico','tamiz_auditivo':'Tamiz Auditivo','tamiz_cardiaco':'Tamiz Cardiaco',
    'tamiz_visual':'Tamiz Visual','tamiz_ortopedico':'Tamiz Ortopédico',
    'dolorPecho':'Dolor al amamantar','Sí / No, frecuencia...':'Regurgita','Ej. 6':'Pañales (24h)',
    'Ej. 3 veces, amarillo mostaza, aguada...':'Evacuaciones','Ej. Sí, por las tardes llora mucho...':'Cólicos',
    '¿En dónde está durmiendo el bebé?':'Lugar para dormir','¿En qué posición lo acuestas para dormir?':'Posición al dormir',
    'objetosCuna':'Objetos en cuna','Ej. 2h de día, 4h de noche...':'Horas de sueño','fumaCasa':'Fuman en casa',
    'fijaMirada':'Fija la mirada','sustoRuidos':'Se asusta con ruidos','calmaVoz':'Se calma con voz','levantaCabeza':'Levanta cabeza',
    'Ej. Llanto fuerte, se calma al mecerlo...':'Llanto y métodos','Ej. Muy cansados pero felices...':'Estado emocional',
    'Ej. NAN 1, Similac...':'Fórmula','Ninguna':'Complicaciones embarazo','Ninguno':'Medicamentos embarazo'
  };
  if (known[key]) return known[key];
  return key.replace(/^Ej\.\s*/i,'').replace(/[:?¿]/g,'').trim().replace(/([A-Z])/g,' $1').replace(/^\w/,c=>c.toUpperCase());
}

function categorizeOnboardingData(data) {
  const cats = {'Datos Generales y Nacimiento':[],'Antecedentes Familiares':[],'Primeros Estudios y Vacunas':[],'Alimentación':[],'Digestión (Pañales)':[],'Sueño y Seguridad':[],'Desarrollo y Sentidos':[],'Otros Registros':[]};
  const map = {
    'new-patient-name':1,'Ej. María Gómez':1,'Ej. Carlos Pérez':1,'Ej. 39':1,'tipoParto':1,'lloroNacer':1,'apgarScore':1,'Peso':1,'Talla':1,'PC':1,'fueACasa':1,'ictericia':1,'Ninguna':1,'Ninguno':1,'Fecha de nacimiento':1,
    'Detallar familiares y enfermedades...':2,'Estatura Mamá':2,'Estatura Papá':2,
    'tamiz_metabolico':3,'tamiz_auditivo':3,'tamiz_cardiaco':3,'tamiz_visual':3,'tamiz_ortopedico':3,
    '¿Qué está comiendo actualmente el bebé?':4,'Ej. A libre demanda, cada 2 horas...':4,'Ej. 15 minutos por pecho...':4,'dolorPecho':4,'Ej. Problemas de agarre, uso de pezoneras...':4,'Ej. NAN 1, Similac...':4,
    'Sí / No, frecuencia...':5,'Ej. 6':5,'Ej. 3 veces, amarillo mostaza, aguada...':5,'Ej. Sí, por las tardes llora mucho...':5,
    '¿En dónde está durmiendo el bebé?':6,'¿En qué posición lo acuestas para dormir?':6,'objetosCuna':6,'Ej. 2h de día, 4h de noche...':6,'fumaCasa':6,
    'fijaMirada':7,'sustoRuidos':7,'calmaVoz':7,'levantaCabeza':7,'Ej. Llanto fuerte, se calma al mecerlo...':7,'Ej. Muy cansados pero felices...':7
  };
  const titles = ['Otros Registros','Datos Generales y Nacimiento','Antecedentes Familiares','Primeros Estudios y Vacunas','Alimentación','Digestión (Pañales)','Sueño y Seguridad','Desarrollo y Sentidos'];
  Object.entries(data).forEach(([k,v]) => {
    if (!v || (typeof v === 'string' && v.trim() === '')) return;
    cats[titles[map[k]||0]].push({key:k, value:v});
  });
  return cats;
}

function initChart() {
  const ctx = document.getElementById('growthChart');
  if (!ctx || !currentPatient) return;
  const p  = currentPatient;
  const od = p.onboarding_data;
  let labels = [], weights = [];
  const bw = od ? (parseFloat(od['Peso'])||0) : 0;
  const bd = p.birth_date || (od && od['Fecha de nacimiento']);
  if (bw > 0) { labels.push(bd || 'Nacimiento'); weights.push(bw); }
  else if (p.weight > 0 && consultations.length === 0) { labels.push('Registro'); weights.push(parseFloat(p.weight)); }
  const history = [...consultations].reverse();
  labels  = labels.concat(history.map(h => h.date));
  weights = weights.concat(history.map(h => parseFloat(h.weight)));
  if (!weights.length) return;
  new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label:'Peso (kg)', data:weights, borderColor:'#4A90E2', backgroundColor:'rgba(74,144,226,0.1)', borderWidth:3, pointBackgroundColor:'#fff', pointBorderColor:'#4A90E2', pointBorderWidth:2, pointRadius:5, fill:true, tension:0.4 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:false,grid:{borderDash:[5,5],color:'#E2E8F0'}}, x:{grid:{display:false}} } }
  });
}

// === Navigation ===
window.navigate = function(view) {
  if (!currentUser && view !== 'login') { currentView = 'login'; }
  else if (currentUser && view === 'login') { currentView = getRoleDefaultView(currentUser.role); }
  else if (currentUser && currentUser.role === 'tutor' && !['parent-profile','booking-calendar'].includes(view)) { currentView = 'parent-profile'; }
  else { currentView = view; }
  renderApp();
  window.scrollTo(0, 0);
};

window.viewPatient = async function(id) {
  currentPatientId = id;
  currentPatient   = patients.find(p => p.id === id) || null;
  consultations    = [];
  currentView      = 'parent-profile';
  renderApp();
  try {
    consultations = (await API.get(`/patients/${id}/consultations`)) || [];
    renderApp();
  } catch (e) { console.error('viewPatient:', e.message); }
};

window.filterPatients = function(query) {
  patientSearchQuery = query;
  const q = query.toLowerCase();
  const list = q ? patients.filter(p => p.name.toLowerCase().includes(q)) : patients;
  const grid = document.querySelector('.patients-grid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div style="text-align:center;padding:3rem;background:white;border-radius:15px;grid-column:1/-1;"><i class="fa-solid fa-folder-open" style="font-size:3rem;color:var(--primary-light);margin-bottom:1rem;"></i><h3>${q?'Sin resultados':'Sin pacientes'}</h3></div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="patient-card" onclick="viewPatient(${p.id})">
      <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
      <div class="patient-info">
        <h3>${p.name}</h3>
        <p><i class="fa-regular fa-clock"></i> ${calculateAgeString(p.birth_date||(p.onboarding_data&&p.onboarding_data['Fecha de nacimiento']))}</p>
        <div style="margin-top:0.5rem;display:flex;gap:1rem;font-size:0.8rem;font-weight:500;">
          <span><i class="fa-solid fa-weight-scale" style="color:var(--secondary)"></i> ${p.weight} kg</span>
          <span><i class="fa-solid fa-ruler-vertical" style="color:var(--secondary)"></i> ${p.height} cm</span>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:var(--text-light);"></i>
    </div>`).join('');
};

// === Auth handlers ===
window.sendForgotPassword = async function() {
  const email = document.getElementById('forgotEmail')?.value?.trim();
  if (!email) { alert('Ingresa tu correo electrónico.'); return; }

  const btn = document.getElementById('forgotBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...'; }

  try {
    await API.post('/auth/forgot-password', { email });
    const msg = document.getElementById('forgotMsg');
    if (msg) {
      msg.style.display = 'block';
      msg.innerHTML = '<i class="fa-solid fa-circle-check"></i> Si ese correo está registrado, recibirás tu contraseña temporal en unos segundos.';
    }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-check"></i> Enviado'; }
    setTimeout(() => closeModal('forgotPasswordModal'), 3500);
  } catch (e) {
    alert('Error: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar'; }
  }
};

window.handleLogin = async function() {
  const email = document.getElementById('loginEmail').value;
  const pass  = document.getElementById('loginPass').value;
  const errDiv = document.getElementById('loginError');
  try {
    const data = await API.post('/auth/login', { email, password: pass });
    if (!data) return;
    sessionStorage.setItem('peditrack_token', data.token);
    sessionStorage.setItem('peditrack_user', JSON.stringify(data.user));
    currentUser = data.user;
    currentView = getRoleDefaultView(currentUser.role);
    await refreshData();
    renderApp();
  } catch (e) {
    if (errDiv) { errDiv.style.display='block'; errDiv.textContent = e.message || 'Credenciales incorrectas'; }
  }
};

window.handleLogout = function() {
  currentUser = null; patients = []; pediatricians = []; currentPatient = null;
  consultations = []; todayAppointments = []; currentPatientId = null;
  sessionStorage.clear(); currentView = 'login'; renderApp();
};

// === Modal helpers ===
window.openModal = function(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'addConsultModal') {
    const ml = document.getElementById('medicationsList');
    if (ml && ml.children.length === 0) window.addMedicationField();
  }
};

window.closeModal = function(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'addConsultModal') {
    window.editingConsultId = null; window.editingConsultIndex = null;
    ['consultWeight','consultHeight','consultHead','consultNotes'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
    const ct = document.getElementById('consultType'); if(ct) ct.value='Control de niño sano';
    const mr = document.getElementById('consultMedicationReq'); if(mr) mr.value='No';
    const md = document.getElementById('medicationDetails'); if(md) md.style.display='none';
    const ml = document.getElementById('medicationsList'); if(ml) { ml.innerHTML=''; window.addMedicationField(); }
  } else if (id === 'userModal') {
    window.editingUserId = null;
    const t = document.getElementById('userModalTitle'); if(t) t.innerText='Añadir Pediatra';
    ['userModalName','userModalEmail','userModalPassword'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
  }
};

window.addMedicationField = function(med = null) {
  const list = document.getElementById('medicationsList');
  if (!list) return;
  const idx = list.children.length;
  const div = document.createElement('div');
  div.className = 'medication-item';
  div.innerHTML = `
    ${idx > 0 ? '<hr style="border:0;border-top:1px dashed #cbd5e1;margin:1rem 0;">' : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
      <label style="font-size:0.9rem;margin-bottom:0;">Medicamento ${idx+1}</label>
      ${idx > 0 ? `<button class="btn" style="padding:0;color:#ef4444;background:transparent;box-shadow:none;" onclick="this.closest('.medication-item').remove()"><i class="fa-solid fa-trash"></i></button>` : ''}
    </div>
    <div class="form-group" style="margin-bottom:0.5rem;"><input type="text" class="form-control med-name" placeholder="Nombre (Ej. Paracetamol)" value="${med?.name||''}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-dose" placeholder="Dosis (Ej. 5ml)" value="${med?.dose||''}"></div>
      <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-freq" placeholder="Frecuencia (Ej. 8h)" value="${med?.freq||''}"></div>
    </div>`;
  list.appendChild(div);
};

// === Consult handlers ===
window.editingConsultId    = null;
window.editingConsultIndex = null;
window.indexToDelete       = null;

window.saveConsult = async function() {
  const weight = document.getElementById('consultWeight').value;
  const height = document.getElementById('consultHeight').value;
  if (!weight || !height) { alert('Ingresa al menos peso y estatura.'); return; }
  const head   = document.getElementById('consultHead')?.value;
  const type   = document.getElementById('consultType')?.value || 'Control de niño sano';
  const reqMed = document.getElementById('consultMedicationReq')?.value || 'No';
  const notes  = document.getElementById('consultNotes').value;
  let meds = [];
  if (reqMed === 'Sí') {
    document.querySelectorAll('.medication-item').forEach(item => {
      const name = item.querySelector('.med-name')?.value;
      const dose = item.querySelector('.med-dose')?.value;
      const freq = item.querySelector('.med-freq')?.value;
      if (name) meds.push({ name, dose, freq });
    });
  }
  const payload = { type, weight: parseFloat(weight), height: parseFloat(height), head_circ: head ? parseFloat(head) : null, notes: notes||'', medications: meds };
  try {
    if (window.editingConsultId !== null) {
      await API.put(`/patients/${currentPatientId}/consultations/${window.editingConsultId}`, payload);
    } else {
      await API.post(`/patients/${currentPatientId}/consultations`, payload);
    }
    consultations = (await API.get(`/patients/${currentPatientId}/consultations`)) || [];
    if (consultations.length > 0 && currentPatient) {
      currentPatient.weight = consultations[0].weight;
      currentPatient.height = consultations[0].height;
      const pi = patients.findIndex(p => p.id === currentPatientId);
      if (pi > -1) { patients[pi].weight = consultations[0].weight; patients[pi].height = consultations[0].height; }
    }
    closeModal('addConsultModal');
    renderApp();
  } catch (e) { alert('Error: ' + e.message); }
};

window.editConsult = function(idx) {
  const h = consultations[idx]; if (!h) return;
  window.editingConsultId = h.id; window.editingConsultIndex = idx;
  document.getElementById('consultWeight').value = h.weight||'';
  document.getElementById('consultHeight').value = h.height||'';
  const hd = document.getElementById('consultHead'); if(hd) hd.value = h.head_circ||'';
  const ct = document.getElementById('consultType'); if(ct) ct.value = h.type||'Control de niño sano';
  let meds = [];
  if (h.medication) meds.push(h.medication);
  if (h.medications?.length) meds = meds.concat(h.medications);
  const mr = document.getElementById('consultMedicationReq');
  const md = document.getElementById('medicationDetails');
  if (mr) mr.value = meds.length > 0 ? 'Sí' : 'No';
  if (md) md.style.display = meds.length > 0 ? 'block' : 'none';
  const ml = document.getElementById('medicationsList');
  if (ml) { ml.innerHTML=''; meds.length > 0 ? meds.forEach(m => window.addMedicationField(m)) : window.addMedicationField(); }
  document.getElementById('consultNotes').value = h.notes||'';
  openModal('addConsultModal');
};

window.deleteConsult = function(idx) { window.indexToDelete = idx; openModal('deleteConfirmModal'); };

window.confirmDeleteConsult = async function() {
  if (window.indexToDelete === null) return;
  const h = consultations[window.indexToDelete]; if (!h) return;
  try {
    await API.del(`/patients/${currentPatientId}/consultations/${h.id}`);
    consultations = (await API.get(`/patients/${currentPatientId}/consultations`)) || [];
    if (currentPatient) {
      currentPatient.weight = consultations.length > 0 ? consultations[0].weight : (currentPatient.onboarding_data?.['Peso'] ? parseFloat(currentPatient.onboarding_data['Peso']) : 0);
      currentPatient.height = consultations.length > 0 ? consultations[0].height : (currentPatient.onboarding_data?.['Talla'] ? parseFloat(currentPatient.onboarding_data['Talla']) : 0);
    }
    closeModal('deleteConfirmModal'); window.indexToDelete = null; renderApp();
  } catch (e) { alert('Error: '+e.message); closeModal('deleteConfirmModal'); }
};

// === Prescription handlers ===
window.printPrescription = function(idx) {
  const p = currentPatient; const h = consultations[idx];
  if (!p || !h) return;
  let meds = [];
  if (h.medication) meds.push(h.medication);
  if (h.medications?.length) meds = meds.concat(h.medications);
  if (!meds.length) { alert('No hay medicamentos para imprimir.'); return; }
  const birthDate  = p.birth_date || (p.onboarding_data?.['Fecha de nacimiento']);
  const ageStr     = calculateAgeString(birthDate);
  const doctorName = p.doctor_name || (currentUser.role === 'pediatra' ? currentUser.name : 'Médico Tratante');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Receta - ${p.name}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto;}.header{text-align:center;border-bottom:2px solid #4A90E2;padding-bottom:20px;margin-bottom:30px;}.header h1{color:#4A90E2;font-size:28px;margin:0;}.patient-info{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:40px;font-size:14px;}.patient-info div{background:#f8fafc;padding:12px 15px;border-radius:6px;border:1px solid #e2e8f0;}.rx{font-size:40px;color:#4A90E2;font-weight:bold;font-style:italic;font-family:serif;margin-bottom:20px;}.med-list{list-style:none;padding:0;margin-left:20px;}.med-list li{margin-bottom:25px;border-bottom:1px dashed #cbd5e1;padding-bottom:15px;}.med-name{font-weight:bold;font-size:18px;margin-bottom:8px;}.med-details{font-size:15px;color:#475569;}.footer{margin-top:80px;text-align:center;}.signature{margin:60px auto 0;border-top:1px solid #94a3b8;width:250px;padding-top:10px;color:#475569;text-align:center;}</style>
  </head><body>
    <div class="header"><h1>${doctorName}</h1><p style="color:#64748b;font-size:14px;margin:5px 0 0;">Especialista en Pediatría</p></div>
    <div class="patient-info">
      <div><strong>Paciente:</strong> ${p.name}</div><div><strong>Fecha:</strong> ${h.date}</div>
      <div><strong>Edad:</strong> ${ageStr}</div><div><strong>Peso:</strong> ${h.weight} kg | <strong>Talla:</strong> ${h.height} cm</div>
    </div>
    <div class="rx">Rx</div>
    <ul class="med-list">${meds.map(m=>`<li><div class="med-name">${m.name}</div><div class="med-details"><strong>Dosis:</strong> ${m.dose} &nbsp;|&nbsp; <strong>Frecuencia:</strong> ${m.freq}</div></li>`).join('')}</ul>
    <div class="footer"><div class="signature">Firma del Médico</div></div>
    <script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script>
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
  setTimeout(() => document.body.removeChild(iframe), 10000);
};

window.emailPrescription = async function(idx) {
  const h = consultations[idx]; if (!h) return;
  const def = currentPatient?.tutor_email || '';
  const email = prompt('Correo al que enviar la receta:', def);
  if (!email) return;
  try {
    await API.post('/email/prescription', { consultationId: h.id, recipientEmail: email });
    alert(`Receta enviada a ${email}`);
  } catch (e) { alert('Error enviando receta: ' + e.message); }
};

// === User handlers (admin) ===
window.editingUserId = null;

window.saveUser = async function() {
  const name = document.getElementById('userModalName').value;
  const email = document.getElementById('userModalEmail').value;
  const password = document.getElementById('userModalPassword').value;
  if (!name || !email) { alert('Nombre y correo son requeridos.'); return; }
  if (!window.editingUserId && !password) { alert('La contraseña es requerida.'); return; }
  try {
    if (window.editingUserId !== null) {
      const body = { name, email }; if (password) body.password = password;
      await API.put(`/users/${window.editingUserId}`, body);
    } else {
      await API.post('/users', { name, email, password, role: 'pediatra' });
    }
    pediatricians = (await API.get('/users/pediatras')) || [];
    closeModal('userModal'); renderApp();
  } catch (e) { alert('Error: ' + e.message); }
};

window.editUser = function(id) {
  const u = pediatricians.find(u => u.id === id); if (!u) return;
  window.editingUserId = id;
  const t = document.getElementById('userModalTitle'); if(t) t.innerText = 'Editar Pediatra';
  document.getElementById('userModalName').value  = u.name;
  document.getElementById('userModalEmail').value = u.email;
  document.getElementById('userModalPassword').value = '';
  openModal('userModal');
};

window.deleteUser = function(id) { window.editingUserId = id; openModal('deleteUserModal'); };

window.confirmDeleteUser = async function() {
  if (window.editingUserId === null) return;
  try {
    await API.del(`/users/${window.editingUserId}`);
    pediatricians = (await API.get('/users/pediatras')) || [];
    patients      = (await API.get('/patients'))        || [];
    closeModal('deleteUserModal'); renderApp();
  } catch (e) { alert('Error: '+e.message); closeModal('deleteUserModal'); }
};

// === Patient handlers ===
window.assigningPatientId = null;

window.openAssignPatientModal = function(patientId) {
  window.assigningPatientId = patientId;
  const p = patients.find(pat => pat.id === patientId);
  if (p) { const sel = document.getElementById('assignPatientSelect'); if(sel) sel.value = p.doctor_id||''; }
  openModal('assignPatientModal');
};

window.savePatientAssignment = async function() {
  if (window.assigningPatientId === null) return;
  const docId = document.getElementById('assignPatientSelect').value;
  try {
    await API.put(`/patients/${window.assigningPatientId}/assign`, { doctor_id: docId ? parseInt(docId) : null });
    patients = (await API.get('/patients')) || [];
    closeModal('assignPatientModal'); renderApp();
  } catch (e) { alert('Error: '+e.message); }
};

window.deletePatient = async function(id) {
  if (!confirm('¿Eliminar este paciente? Esta acción no se puede deshacer.')) return;
  try {
    await API.del(`/patients/${id}`);
    patients = (await API.get('/patients')) || [];
    renderApp();
  } catch (e) { alert('Error: '+e.message); }
};

// === Password reset ===
window.resetPasswordTutorId = null;

window.openResetPasswordModal = function(tutorId) {
  window.resetPasswordTutorId = tutorId;
  const inp = document.getElementById('resetPasswordInput'); if(inp) inp.value='';
  openModal('resetPasswordModal');
};

window.confirmResetPassword = async function() {
  const newPass = document.getElementById('resetPasswordInput').value;
  if (!newPass || newPass.length < 6) { alert('Mínimo 6 caracteres.'); return; }
  try {
    await API.post(`/auth/reset-password/${window.resetPasswordTutorId}`, { newPassword: newPass });
    alert('Contraseña actualizada correctamente.');
    closeModal('resetPasswordModal');
  } catch (e) { alert('Error: '+e.message); }
};

// === Appointment status ===
window.updateAppointmentStatus = async function(id, status) {
  try {
    await API.put(`/appointments/${id}/status`, { status });
    const today = new Date().toISOString().slice(0, 10);
    todayAppointments = (await API.get(`/appointments?date=${today}`)) || [];
    renderApp();
  } catch (e) { alert('Error: '+e.message); }
};

// === Onboarding handlers ===
function validateCurrentStep() {
  const container = document.querySelector('.onboarding-content');
  if (!container) return true;
  const elements = container.querySelectorAll('input, select, textarea');
  let isValid = true, firstInvalid = null;
  const radioGroups = {}, checkboxGroups = {};
  elements.forEach(el => {
    if (el.closest('[style*="display: none"]') || el.closest('[style*="display:none"]')) return;
    el.style.borderColor = '';
    const lbl = el.closest('label'); if(lbl) lbl.style.color='';
    if (el.type === 'radio') {
      if (!radioGroups[el.name]) radioGroups[el.name] = [];
      radioGroups[el.name].push(el);
    } else if (el.type === 'checkbox') {
      const pg = el.closest('div[style*="grid-template-columns: 1fr 1fr"]') || el.closest('div[style*="grid-template-columns:1fr 1fr"]');
      if (pg) { const k = 'cbg_'+pg.offsetTop; if(!checkboxGroups[k]) checkboxGroups[k]=[]; checkboxGroups[k].push(el); }
    } else if (!el.value || el.value.trim() === '') {
      isValid = false; el.style.borderColor='#ef4444';
      if (!firstInvalid) firstInvalid = el;
    }
  });
  Object.values(radioGroups).forEach(g => {
    if (!g.some(r => r.checked)) {
      isValid = false; g.forEach(r => { const l=r.closest('label'); if(l) l.style.color='#ef4444'; });
      if (!firstInvalid) firstInvalid = g[0];
    }
  });
  Object.values(checkboxGroups).forEach(g => {
    if (!g.some(c => c.checked)) {
      isValid = false; g.forEach(c => { const l=c.closest('label'); if(l) l.style.color='#ef4444'; });
      if (!firstInvalid) firstInvalid = g[0];
    }
  });
  if (!isValid) { alert('Por favor responde todas las preguntas visibles.'); if(firstInvalid?.focus) firstInvalid.focus(); }
  return isValid;
}

function saveCurrentStepData() {
  if (!window.newPatientData) window.newPatientData = {};
  document.querySelectorAll('.onboarding-content input, .onboarding-content select, .onboarding-content textarea').forEach(input => {
    let key = input.name || input.id || input.placeholder || 'Campo';
    if (input.type === 'checkbox' || input.type === 'radio') {
      if (input.checked) {
        if (window.newPatientData[key] && window.newPatientData[key] !== input.value && !window.newPatientData[key].includes(input.value)) {
          window.newPatientData[key] += ', ' + input.value;
        } else { window.newPatientData[key] = input.value; }
      }
    } else if (input.value && input.value.trim() !== '') { window.newPatientData[key] = input.value; }
  });
}

window.nextOnboardingStep = function() {
  if (!validateCurrentStep()) return;
  saveCurrentStepData();
  if (currentOnboardingStep === 1) {
    const n = document.getElementById('new-patient-name');
    if (n && n.value) window.newPatientName = n.value;
  }
  if (currentOnboardingStep < 7) { currentOnboardingStep++; renderApp(); window.scrollTo(0,0); }
};

window.prevOnboardingStep = function() {
  if (currentOnboardingStep > 1) { saveCurrentStepData(); currentOnboardingStep--; renderApp(); window.scrollTo(0,0); }
};

window.finishOnboarding = async function() {
  if (!validateCurrentStep()) return;
  saveCurrentStepData();
  const newName    = window.newPatientName || 'Bebé Nuevo';
  const tutorEmail = window.newPatientData['tutorEmail'];
  const momName    = window.newPatientData['Ej. María Gómez'] || 'No especificado';
  const dadName    = window.newPatientData['Ej. Carlos Pérez'] || 'No especificado';
  const tutorName  = momName !== 'No especificado' ? momName : (dadName !== 'No especificado' ? dadName : 'Tutor');
  try {
    const result = await API.post('/patients', {
      name: newName,
      onboarding_data: window.newPatientData,
      tutor_email: tutorEmail || undefined,
      tutor_name:  tutorName
    });
    patients = (await API.get('/patients')) || [];
    window.successData = {
      patientName: newName,
      tutorEmail,
      password: result.tutor?.password || '',
      momName, dadName
    };
    currentOnboardingStep = 1;
    window.newPatientName = '';
    window.newPatientData = {};
    currentView = 'onboarding-success';
    renderApp(); window.scrollTo(0,0);
  } catch (e) { alert('Error creando paciente: ' + e.message); }
};

// === Onboarding UI helpers ===
window.handleComplicationsChange = function(checkbox) {
  const container = checkbox.closest('.form-group');
  const ninguna   = container.querySelector('input[value="Ninguna"]');
  const otras     = container.querySelectorAll('input[type="checkbox"]:not([value="Ninguna"])');
  const inputOtra = document.getElementById('otra-complicacion');
  if (checkbox.value === 'Ninguna' && checkbox.checked) {
    otras.forEach(cb => cb.checked = false);
    if (inputOtra) inputOtra.style.display = 'none';
  } else if (checkbox.checked) {
    if (ninguna) ninguna.checked = false;
    if (checkbox.value === 'Otra' && inputOtra) inputOtra.style.display = 'block';
  } else {
    if (checkbox.value === 'Otra' && inputOtra) inputOtra.style.display = 'none';
  }
};

window.handleMedicationsChange = function(checkbox) {
  const container = checkbox.closest('.form-group');
  const ninguno   = container.querySelector('input[value="Ninguno"]');
  const otras     = container.querySelectorAll('input[type="checkbox"]:not([value="Ninguno"])');
  const inputOtros = document.getElementById('otros-medicamentos');
  if (checkbox.value === 'Ninguno' && checkbox.checked) {
    otras.forEach(cb => cb.checked = false);
    if (inputOtros) inputOtros.style.display = 'none';
  } else if (checkbox.checked) {
    if (ninguno) ninguno.checked = false;
    if (checkbox.value === 'Otros' && inputOtros) inputOtros.style.display = 'block';
  } else {
    if (checkbox.value === 'Otros' && inputOtros) inputOtros.style.display = 'none';
  }
};

window.handleAlimentacionChange = function(value) {
  const secM = document.getElementById('seccion-materna');
  const secF = document.getElementById('seccion-formula');
  if (!secM || !secF) return;
  secM.style.display = (value === 'materna' || value === 'mixta') ? 'block' : 'none';
  secF.style.display = (value === 'formula' || value === 'mixta') ? 'block' : 'none';
};

// === Boot ===
document.addEventListener('DOMContentLoaded', bootstrap);
