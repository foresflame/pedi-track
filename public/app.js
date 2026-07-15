// === API Layer ===
const API = {
  baseUrl: '/api',
  getHeaders() {
    // La sesión viaja en una cookie httpOnly; el header Bearer queda solo como
    // compatibilidad con sesiones abiertas antes del cambio.
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
let patientVaccinations  = [];
let neuroAssessments     = [];
let todayAppointments = [];
let doctorAppointments = []; // todas las citas del médico (para badges en cards)
let currentPatientId  = null;
let currentView     = 'login';
let currentOnboardingStep = 1;
let patientSearchQuery = '';
let patientFilterMode  = 'all'; // 'all' | 'allergies' | 'overdue' | 'pending' | 'inactive'
let tutorAppointments = [];
let bookingYear  = new Date().getFullYear();
let bookingMonth = new Date().getMonth();
let bookingSelectedDate = null;
let bookingSlots = [];
// Doctor agenda calendar (availability-settings view)
let dcYear     = new Date().getFullYear();
let dcMonth    = new Date().getMonth();
let dcSelDate  = null;
let dcAllAppts = [];
let dcDaySlots = [];

function getRoleDefaultView(role) {
  if (['admin','super_admin','asesor'].includes(role)) return 'admin-home';
  if (role === 'pediatra') return 'doctor-home';
  if (role === 'tutor')    return 'parent-profile';
  return 'login';
}
function isAdminLike(role) { return ['admin','super_admin','asesor'].includes(role); }
function canEdit(role) { return ['admin','super_admin'].includes(role); }
function canManageUsers(role) { return role === 'super_admin'; }

// === Bootstrap & Data Loading ===
async function bootstrap() {
  // El token vive en una cookie httpOnly; aquí solo se necesita el usuario.
  // Si la cookie expiró, el primer request devolverá 401 y hará logout.
  const stored = sessionStorage.getItem('peditrack_user');
  if (!stored) { currentView = 'login'; renderApp(); return; }
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
        consultations       = (await API.get(`/patients/${p.id}/consultations`)) || [];
        patientVaccinations = (await API.get(`/patients/${p.id}/vaccinations`)) || [];
        neuroAssessments    = (await API.get(`/patients/${p.id}/neurodevelopment`)) || [];
        tutorAppointments   = (await API.get('/appointments')) || [];
      }
    } else {
      patients = (await API.get('/patients')) || [];
      if (isAdminLike(currentUser.role)) {
        pediatricians = (await API.get('/users/pediatras')) || [];
        doctorAppointments = (await API.get('/appointments')) || []; // para contar citas vencidas
      }
      if (currentUser.role === 'pediatra') {
        const today = new Date().toISOString().slice(0, 10);
        todayAppointments  = (await API.get(`/appointments?date=${today}`)) || [];
        doctorAppointments = (await API.get('/appointments')) || [];
      }
    }
  } catch (e) { console.error('refreshData:', e.message); }
}

// === Main Render ===
function renderApp() {
  const app = document.getElementById('app');

  // Roles con shell de aplicación (sidebar + topbar)
  const useShell = currentUser
    && (currentUser.role === 'pediatra' || isAdminLike(currentUser.role))
    && currentView !== 'login'
    && currentView !== 'onboarding-success';

  let viewHtml = '';
  if      (currentView === 'login')               viewHtml = renderLogin();
  else if (currentView === 'admin-home')          viewHtml = renderAdminHome();
  else if (currentView === 'admin-pediatras')     viewHtml = renderAdminPediatras();
  else if (currentView === 'admin-pediatra-detail') viewHtml = renderAdminPediatraDetail();
  else if (currentView === 'admin-users')         viewHtml = renderAdminUsers();
  else if (currentView === 'admin-dashboard')     viewHtml = renderAdminDashboard();
  else if (currentView === 'doctor-home')         viewHtml = renderDoctorHome();
  else if (currentView === 'doctor-dashboard')    viewHtml = renderDoctorDashboard();
  else if (currentView === 'parent-profile')      viewHtml = renderParentProfile();
  else if (currentView === 'patient-onboarding')  viewHtml = renderOnboarding();
  else if (currentView === 'onboarding-success')  viewHtml = renderOnboardingSuccess();
  else if (currentView === 'availability-settings') viewHtml = renderAvailabilitySettings();
  else if (currentView === 'booking-calendar')    viewHtml = renderBookingCalendar();
  else if (currentView === 'doctor-profile-edit') viewHtml = renderDoctorProfileEdit();
  else if (currentView === 'doctor-public')       viewHtml = renderDoctorPublic();

  let html;
  if (useShell) {
    html = `
      ${renderSidebar()}
      <div class="app-main">
        ${renderTopbar()}
        <main class="app-content animate-fade-in" id="main-content">
          ${viewHtml}
        </main>
      </div>
    ` + renderModals();
  } else {
    const headerAction = currentUser
      ? `<button class="btn btn-secondary" onclick="handleLogout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Salir</button>`
      : '';
    html = `
      <header>
        <div class="logo cursor-pointer" onclick="${currentUser ? "navigate(getRoleDefaultView(currentUser.role))" : "navigate('login')"}">
          <img src="/img/genali-icon.svg" alt="" style="height:34px;width:34px;"> Genali
        </div>
        ${headerAction}
      </header>
      <main class="container animate-fade-in" id="main-content">${viewHtml}</main>
    ` + renderModals();
  }
  app.innerHTML = html;

  if (currentView === 'parent-profile')       initChart();
  if (currentView === 'availability-settings') { loadAvailability(); loadDoctorCalendar(); }
  if (currentView === 'doctor-profile-edit')  loadOwnProfile();
  if (currentView === 'doctor-public')        loadDoctorPublic();
  if (currentView === 'admin-pediatra-detail') loadPediatraDetail();
  if (currentView === 'admin-users')          { if (!allUsers.length) loadAllUsers(); }
}

// === Views ===
function renderLogin() {
  return `
    <div style="max-width:400px;margin:4rem auto;background:white;padding:2.5rem;border-radius:15px;box-shadow:var(--card-shadow);">
      <div style="text-align:center;margin-bottom:2rem;">
        <img src="/img/genali-logo.svg" alt="Genali" style="width:210px;max-width:75%;display:block;margin:0 auto;">
        <p style="color:var(--text-light);margin-top:0.75rem;">Iniciar sesión en tu cuenta</p>
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

// === Admin: Inicio (estadísticas) ===
let allUsers = [];
function renderAdminHome() {
  const ro = !canEdit(currentUser.role); // asesor → solo lectura
  const totalPediatras = pediatricians.length;
  const totalPatients = patients.length;
  const activePatients = patients.filter(p => p.active !== 0).length;
  const inactivePatients = totalPatients - activePatients;
  const orphanPatients = patients.filter(p => !p.doctor_id).length;
  const withAllergies = patients.filter(p => {
    const a = (p.onboarding_data && p.onboarding_data['known-allergies'] || '').trim();
    return a && !/^(ninguna|ninguno|no|n\/a|na|sin alergias?)$/i.test(a);
  }).length;
  // Crecimiento: pacientes registrados últimos 30 días
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  const newPatients30d = patients.filter(p => (p.created_at || '').slice(0,10) >= cutoffStr).length;
  const tutorsCount = patients.filter(p => p.tutor_id).length;

  // Top pediatras por # de pacientes
  const topPediatras = pediatricians
    .map(d => ({ ...d, count: patients.filter(p => p.doctor_id === d.id && p.active !== 0).length }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 5);

  return `
    <div class="dashboard-v2">
      <div class="hero-banner">
        <div>
          <h1 style="font-size:1.75rem;margin-bottom:0.4rem;">Panel de ${({super_admin:'Super Admin',admin:'Administración',asesor:'Asesoría'})[currentUser.role]}</h1>
          <p style="color:var(--text-light);">Resumen general de la plataforma${ro ? ' (modo lectura)' : ''}</p>
        </div>
        <div class="hero-illustration"><i class="fa-solid fa-chart-line"></i></div>
      </div>

      ${renderCleanupBanner()}

      <div class="stats-row">
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa-solid fa-user-doctor"></i></div>
          <div style="flex:1;">
            <div class="stat-pill-value">${totalPediatras}</div>
            <div class="stat-pill-label">Pediatras</div>
            <div class="stat-pill-sub">En la plataforma</div>
            ${!ro ? `<button class="home-btn home-btn-primary" style="margin-top:0.5rem;" onclick="window.editingUserId=null;window.userModalContext='pediatra';openModal('userModal')"><i class="fa-solid fa-plus"></i> Añadir Pediatra</button>` : ''}
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#d1fae5;color:#059669;"><i class="fa-solid fa-children"></i></div>
          <div><div class="stat-pill-value">${activePatients}</div><div class="stat-pill-label">Pacientes activos</div><div class="stat-pill-sub">En seguimiento</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fef3c7;color:#d97706;"><i class="fa-solid fa-user-plus"></i></div>
          <div><div class="stat-pill-value">${newPatients30d}</div><div class="stat-pill-label">Nuevos (30 días)</div><div class="stat-pill-sub">Crecimiento reciente</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#ede9fe;color:#7c3aed;"><i class="fa-solid fa-users"></i></div>
          <div><div class="stat-pill-value">${tutorsCount}</div><div class="stat-pill-label">Tutores</div><div class="stat-pill-sub">Cuentas registradas</div></div>
        </div>
      </div>

      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#f1f5f9;color:#475569;"><i class="fa-solid fa-pause"></i></div>
          <div><div class="stat-pill-value">${inactivePatients}</div><div class="stat-pill-label">Pacientes inactivos</div><div class="stat-pill-sub">Sin seguimiento</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div><div class="stat-pill-value">${withAllergies}</div><div class="stat-pill-label">Con alergias</div><div class="stat-pill-sub">Requieren atención</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fef9c3;color:#a16207;"><i class="fa-solid fa-circle-question"></i></div>
          <div><div class="stat-pill-value">${orphanPatients}</div><div class="stat-pill-label">Sin pediatra</div><div class="stat-pill-sub">Por asignar</div></div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-toolbar">
          <h2 style="font-size:1.1rem;"><i class="fa-solid fa-trophy" style="color:#f59e0b;"></i> Top pediatras por pacientes activos</h2>
        </div>
        <div style="overflow-x:auto;">
          <table class="patients-table">
            <thead><tr>
              <th style="text-align:center;width:60px;">#</th>
              <th>Pediatra</th>
              <th>Correo</th>
              <th style="text-align:center;">Pacientes activos</th>
              <th style="text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>
              ${topPediatras.length ? topPediatras.map((d, i) => `
                <tr class="pt-row" onclick="viewPediatraDetail(${d.id})">
                  <td data-label="#" style="text-align:center;font-weight:700;color:${i === 0 ? '#f59e0b' : 'var(--text-light)'};">${i + 1}</td>
                  <td data-label="Pediatra" class="pt-cell-primary">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <div class="pt-avatar">${(d.name||'?').charAt(0).toUpperCase()}</div>
                      <div style="font-weight:600;">${d.name}</div>
                    </div>
                  </td>
                  <td data-label="Correo" style="color:var(--text-light);font-size:0.85rem;">${d.email}</td>
                  <td data-label="Pacientes activos" style="text-align:center;font-weight:600;color:var(--primary);">${d.count}</td>
                  <td data-label="Acciones" style="text-align:right;"><button class="pt-action" onclick="event.stopPropagation();viewPediatraDetail(${d.id})" title="Ver detalle"><i class="fa-solid fa-eye"></i></button></td>
                </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light);">Aún no hay pediatras registrados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// === Admin: Lista de Pediatras ===
function renderAdminPediatras() {
  const ro = !canEdit(currentUser.role);
  const q = (patientSearchQuery || '').toLowerCase();
  const filtered = q ? pediatricians.filter(d => d.name.toLowerCase().includes(q) || (d.email||'').toLowerCase().includes(q)) : pediatricians;
  return `
    <div class="dashboard-v2">
      <div class="hero-banner">
        <div>
          <h1 style="font-size:1.75rem;margin-bottom:0.4rem;">Pediatras</h1>
          <p style="color:var(--text-light);">Gestiona los pediatras de la plataforma${ro ? ' (modo lectura)' : ''}</p>
        </div>
        <div class="hero-illustration"><i class="fa-solid fa-user-doctor"></i></div>
      </div>

      <div class="table-card">
        <div class="table-toolbar">
          <h2 style="font-size:1.05rem;">${filtered.length} pediatra${filtered.length === 1 ? '' : 's'}</h2>
          ${!ro ? `<button class="topbar-primary" onclick="window.editingUserId=null;window.userModalContext='pediatra';openModal('userModal')"><i class="fa-solid fa-user-plus"></i> Añadir Pediatra</button>` : ''}
        </div>
        <div style="overflow-x:auto;">
          <table class="patients-table">
            <thead><tr>
              <th>Pediatra</th>
              <th>Correo</th>
              <th>Especialidad</th>
              <th style="text-align:center;">Pacientes</th>
              <th style="text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>
              ${filtered.length ? filtered.map(d => {
                const count = patients.filter(p => p.doctor_id === d.id).length;
                return `
                <tr class="pt-row" onclick="viewPediatraDetail(${d.id})">
                  <td data-label="Pediatra" class="pt-cell-primary">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <div class="pt-avatar">${(d.photo) ? `<img src="${d.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (d.name||'?').charAt(0).toUpperCase()}</div>
                      <div>
                        <div style="font-weight:600;">${d.name}</div>
                        <div style="font-size:0.75rem;color:var(--text-light);">${d.license ? 'Cédula ' + d.license : 'Sin cédula'}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Correo" style="color:var(--text-light);font-size:0.85rem;">${d.email}</td>
                  <td data-label="Especialidad" style="font-size:0.85rem;">${d.specialty || '<span style="color:var(--text-light);font-style:italic;">No especificada</span>'}</td>
                  <td data-label="Pacientes" style="text-align:center;font-weight:600;color:var(--primary);">${count}</td>
                  <td data-label="Acciones" style="text-align:right;">
                    <button class="pt-action" onclick="event.stopPropagation();viewPediatraDetail(${d.id})" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
                    ${!ro ? `
                      <button class="pt-action" onclick="event.stopPropagation();editUser(${d.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                      <button class="pt-action" onclick="event.stopPropagation();openResetPasswordForUser(${d.id}, '${d.name.replace(/'/g, "\\'")}', '${(d.email||'').replace(/'/g,"\\'")}')" title="Cambiar contraseña"><i class="fa-solid fa-key"></i></button>
                      <button class="pt-action" onclick="event.stopPropagation();deleteUser(${d.id})" title="Eliminar" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-light);"><i class="fa-solid fa-user-doctor" style="font-size:2.5rem;color:var(--primary-light);display:block;margin-bottom:0.75rem;"></i><strong>${q ? 'Sin resultados' : 'No hay pediatras'}</strong></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// === Admin: Detalle de un pediatra ===
let viewingPediatraId = null;
let viewingPediatraData = null;
async function loadPediatraDetail() {
  if (!viewingPediatraId) return;
  if (viewingPediatraData && viewingPediatraData.id === viewingPediatraId) return;
  try { viewingPediatraData = await API.get(`/users/${viewingPediatraId}`); renderApp(); } catch(e) { console.error(e.message); }
}
window.viewPediatraDetail = function(id) {
  viewingPediatraId = id;
  viewingPediatraData = null;
  navigate('admin-pediatra-detail');
};
function renderAdminPediatraDetail() {
  const d = viewingPediatraData;
  if (!d) return `<div class="dashboard-v2"><p style="text-align:center;padding:3rem;color:var(--text-light);">Cargando...</p></div>`;
  const ro = !canEdit(currentUser.role);
  const docPatients = patients.filter(p => p.doctor_id === d.id);
  const activeCount = docPatients.filter(p => p.active !== 0).length;
  return `
    <div class="dashboard-v2">
      <button class="btn btn-secondary" style="margin-bottom:1rem;" onclick="navigate('admin-pediatras')"><i class="fa-solid fa-arrow-left"></i> Volver a Pediatras</button>

      <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);border:1px solid #f1f5f9;margin-bottom:1.5rem;">
        <div class="pediatra-detail-header" style="background:linear-gradient(135deg,var(--primary),var(--secondary));padding:2rem;display:flex;align-items:center;gap:1.5rem;color:white;">
          <div class="pediatra-detail-avatar" style="width:100px;height:100px;border-radius:50%;background:white;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${d.photo ? `<img src="${d.photo}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fa-solid fa-user-doctor" style="font-size:3rem;color:var(--primary);"></i>`}
          </div>
          <div style="flex:1;min-width:0;">
            <h1 style="font-size:1.8rem;margin-bottom:0.3rem;word-break:break-word;">${d.name}</h1>
            <div style="font-size:1rem;opacity:0.95;">${d.specialty || 'Pediatría general'}</div>
            ${d.license ? `<div style="font-size:0.85rem;opacity:0.85;margin-top:0.2rem;">Cédula: ${d.license}</div>` : ''}
          </div>
          ${!ro ? `
            <div class="pediatra-detail-actions" style="display:flex;flex-direction:column;gap:0.5rem;">
              <button class="btn" style="background:white;color:var(--primary);" onclick="editUser(${d.id})"><i class="fa-solid fa-pen"></i> Editar</button>
              <button class="btn" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.5);" onclick="openResetPasswordForUser(${d.id}, '${d.name.replace(/'/g, "\\'")}', '${(d.email||'').replace(/'/g,"\\'")}')"><i class="fa-solid fa-key"></i> Cambiar clave</button>
            </div>
          ` : ''}
        </div>

        <div style="padding:1.5rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;">
          ${d.email ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-envelope"></i> Correo</div><div style="font-weight:500;font-size:0.88rem;word-break:break-all;">${d.email}</div></div>` : ''}
          ${d.phone ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-phone"></i> Teléfono</div><div style="font-weight:500;font-size:0.88rem;">${d.phone}</div></div>` : ''}
          ${d.office_address ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;grid-column:1/-1;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-location-dot"></i> Consultorio</div><div style="font-weight:500;font-size:0.88rem;">${d.office_address}</div></div>` : ''}
          ${d.description ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;grid-column:1/-1;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-circle-info"></i> Acerca de</div><div style="font-size:0.88rem;line-height:1.5;">${d.description}</div></div>` : ''}
        </div>
      </div>

      <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-pill"><div class="stat-pill-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa-solid fa-children"></i></div><div><div class="stat-pill-value">${docPatients.length}</div><div class="stat-pill-label">Total pacientes</div></div></div>
        <div class="stat-pill"><div class="stat-pill-icon" style="background:#d1fae5;color:#059669;"><i class="fa-solid fa-circle-check"></i></div><div><div class="stat-pill-value">${activeCount}</div><div class="stat-pill-label">Activos</div></div></div>
        <div class="stat-pill"><div class="stat-pill-icon" style="background:#f1f5f9;color:#475569;"><i class="fa-solid fa-pause"></i></div><div><div class="stat-pill-value">${docPatients.length - activeCount}</div><div class="stat-pill-label">Inactivos</div></div></div>
      </div>

      <div class="table-card">
        <div class="table-toolbar"><h2 style="font-size:1.05rem;"><i class="fa-solid fa-user-group"></i> Pacientes asignados</h2></div>
        <div style="overflow-x:auto;">
          <table class="patients-table">
            <thead><tr>
              <th>Paciente</th>
              <th>Edad</th>
              <th>Tutor / Correo</th>
              <th style="text-align:center;">Estado</th>
              <th style="text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>
              ${docPatients.length ? docPatients.map(p => {
                const age = calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']));
                const isActive = p.active !== 0;
                return `
                <tr class="pt-row ${isActive ? '' : 'is-inactive'}" onclick="viewPatient(${p.id})">
                  <td data-label="Paciente" class="pt-cell-primary">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <div class="pt-avatar">${p.name.charAt(0).toUpperCase()}</div>
                      <div><div style="font-weight:600;">${p.name}</div><div style="font-size:0.75rem;color:var(--text-light);">#${String(p.id).padStart(6,'0')}</div></div>
                    </div>
                  </td>
                  <td data-label="Edad" style="font-size:0.85rem;">${age}</td>
                  <td data-label="Tutor / Correo" style="font-size:0.82rem;">${p.tutor_name ? `<div><div style="font-weight:500;">${p.tutor_name}</div><div style="color:var(--text-light);font-size:0.78rem;">${p.tutor_email||'—'}</div></div>` : '<span style="color:var(--text-light);font-style:italic;">Sin tutor</span>'}</td>
                  <td data-label="Estado" style="text-align:center;"><span class="alert-pill" style="background:${isActive ? '#d1fae5' : '#f1f5f9'};color:${isActive ? '#065f46' : '#64748b'};">${isActive ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Acciones" style="text-align:right;">
                    <button class="pt-action" onclick="event.stopPropagation();viewPatient(${p.id})" title="Ver expediente"><i class="fa-solid fa-eye"></i></button>
                    ${!ro && p.tutor_id ? `<button class="pt-action" onclick="event.stopPropagation();openResetPasswordModal(${p.tutor_id}, '${(p.tutor_email||'').replace(/'/g,"\\'")}')" title="Cambiar clave del tutor"><i class="fa-solid fa-key"></i></button>` : ''}
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light);">Sin pacientes asignados.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// === Admin: Usuarios (super_admin) ===
async function loadAllUsers() {
  try { allUsers = await API.get('/users') || []; renderApp(); } catch(e) { console.error(e.message); }
}
function renderAdminUsers() {
  if (!canManageUsers(currentUser.role)) {
    return `<div class="dashboard-v2"><p style="text-align:center;padding:3rem;color:#ef4444;">Acceso denegado. Solo super_admin puede gestionar usuarios.</p></div>`;
  }
  const roleLabels = { super_admin:'Super Admin', admin:'Administrador', asesor:'Asesor', pediatra:'Pediatra', tutor:'Tutor' };
  const roleColors = {
    super_admin: { bg:'#fef3c7', color:'#92400e' },
    admin:       { bg:'#dbeafe', color:'#1e40af' },
    asesor:      { bg:'#e0e7ff', color:'#4338ca' },
    pediatra:    { bg:'#d1fae5', color:'#065f46' },
    tutor:       { bg:'#f1f5f9', color:'#475569' },
  };
  return `
    <div class="dashboard-v2">
      <div class="hero-banner">
        <div>
          <h1 style="font-size:1.75rem;margin-bottom:0.4rem;">Usuarios y Permisos</h1>
          <p style="color:var(--text-light);">Administra los usuarios que tienen acceso a la plataforma</p>
        </div>
        <div class="hero-illustration"><i class="fa-solid fa-users-gear"></i></div>
      </div>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem;font-size:0.85rem;line-height:1.6;">
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
          <div><span class="alert-pill" style="background:#fef3c7;color:#92400e;">Super Admin</span> acceso total, incluye gestión de usuarios</div>
          <div><span class="alert-pill" style="background:#dbeafe;color:#1e40af;">Administrador</span> edita pediatras y pacientes</div>
          <div><span class="alert-pill" style="background:#e0e7ff;color:#4338ca;">Asesor</span> solo lectura</div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-toolbar">
          <h2 style="font-size:1.05rem;">${allUsers.length} usuario${allUsers.length === 1 ? '' : 's'}</h2>
          <button class="topbar-primary" onclick="openAddUserModal()"><i class="fa-solid fa-user-plus"></i> Añadir Usuario</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="patients-table">
            <thead><tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Creado</th>
              <th style="text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>
              ${(() => {
                const adminUsers = allUsers.filter(u => ['super_admin','admin','asesor'].includes(u.role));
                if (!adminUsers.length) return `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light);">No hay administradores registrados.</td></tr>`;
                return adminUsers.map(u => {
                  const rc = roleColors[u.role] || roleColors.admin;
                  const isMe = u.id === currentUser.id;
                  return `
                  <tr class="pt-row">
                    <td data-label="Usuario" class="pt-cell-primary">
                      <div style="display:flex;align-items:center;gap:0.6rem;">
                        <div class="pt-avatar">${(u.name||'?').charAt(0).toUpperCase()}</div>
                        <div style="font-weight:600;">${u.name}${isMe ? ' <span style="font-size:0.7rem;color:var(--text-light);font-weight:400;">(tú)</span>' : ''}</div>
                      </div>
                    </td>
                    <td data-label="Correo" style="color:var(--text-light);font-size:0.85rem;">${u.email}</td>
                    <td data-label="Rol">
                      <select onchange="changeUserRole(${u.id}, this.value, '${u.role}')" ${isMe ? 'disabled' : ''} style="padding:0.25rem 0.5rem;border:1px solid #e2e8f0;border-radius:6px;font-size:0.78rem;background:${rc.bg};color:${rc.color};font-weight:600;">
                        <option value="super_admin" ${u.role==='super_admin'?'selected':''}>Super Admin</option>
                        <option value="admin"       ${u.role==='admin'?'selected':''}>Administrador</option>
                        <option value="asesor"      ${u.role==='asesor'?'selected':''}>Asesor</option>
                      </select>
                    </td>
                    <td data-label="Creado" style="font-size:0.82rem;color:var(--text-light);">${u.created_at ? new Date(u.created_at).toLocaleDateString('es-MX') : '—'}</td>
                    <td data-label="Acciones" style="text-align:right;">
                      <button class="pt-action" onclick="editUser(${u.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                      <button class="pt-action" onclick="openResetPasswordForUser(${u.id}, '${u.name.replace(/'/g, "\\'")}', '${(u.email||'').replace(/'/g,"\\'")}')" title="Cambiar contraseña"><i class="fa-solid fa-key"></i></button>
                      ${!isMe ? `<button class="pt-action" onclick="deleteUser(${u.id})" title="Eliminar" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </td>
                  </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

window.changeUserRole = async function(userId, newRole, oldRole) {
  if (newRole === oldRole) return;
  if (!confirm(`¿Cambiar rol a "${newRole}"?`)) {
    // Revertir el dropdown
    renderApp();
    return;
  }
  try {
    await API.put(`/users/${userId}/role`, { role: newRole });
    allUsers = (await API.get('/users')) || [];
    pediatricians = (await API.get('/users/pediatras')) || [];
    renderApp();
  } catch(e) { alert('Error: '+e.message); renderApp(); }
};

window.openAddUserModal = function() {
  window.editingUserId = null;
  window.userModalContext = 'admin'; // crear admin/asesor/super_admin
  openModal('userModal');
};

window.openResetPasswordForUser = function(userId, name, email) {
  // Reutilizamos el modal genérico de reset
  window.resetPasswordTutorId = userId;
  const inp = document.getElementById('resetPasswordInput');
  const cb = document.getElementById('resetPasswordCustom');
  if (cb) cb.checked = false;
  if (inp) { inp.value = generateRandomPassword(8); inp.readOnly = true; inp.style.background = '#f1f5f9'; }
  setResetPasswordEmail(email);
  // Cambiar título dinámicamente
  setTimeout(() => {
    const h2 = document.querySelector('#resetPasswordModal .modal-header h2');
    if (h2) h2.textContent = `Cambiar Contraseña de ${name}`;
  }, 10);
  openModal('resetPasswordModal');
};

// Muestra (u oculta) el correo del usuario dentro del modal de reset
function setResetPasswordEmail(email) {
  const box = document.getElementById('resetPasswordUserInfo');
  const el  = document.getElementById('resetPasswordEmail');
  if (!box || !el) return;
  if (email) { el.textContent = email; box.style.display = 'block'; }
  else { el.textContent = '—'; box.style.display = 'none'; }
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
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="navigate('patient-onboarding')"><i class="fa-solid fa-user-plus"></i> Nuevo Paciente</button>
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
          <button class="btn btn-primary" onclick="window.editingUserId=null;window.userModalContext='pediatra';openModal('userModal')"><i class="fa-solid fa-user-plus"></i> Añadir Pediatra</button>
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
        <h2>Pacientes por Pediatra</h2>
        <p style="color:var(--text-light);font-size:0.9rem;margin-bottom:1rem;">Cada pediatra con sus pacientes asignados. Click en un paciente para ver el expediente completo.</p>

        ${(() => {
          // Agrupar pacientes por doctor_id
          const groups = pediatricians.map(doc => ({
            doctor:   doc,
            patients: patients.filter(p => p.doctor_id === doc.id)
          }));
          const orphans = patients.filter(p => !p.doctor_id);
          if (orphans.length) groups.push({ doctor: null, patients: orphans });

          const renderPatientRow = (p) => {
            const age = calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']));
            const allergies = (p.onboarding_data && p.onboarding_data['known-allergies'] || '').trim();
            const hasAllergies = allergies && !/^(ninguna|ninguno|no|n\/a|na|sin alergias?)$/i.test(allergies);
            return `
              <tr style="border-bottom:1px solid var(--bg-color);">
                <td style="padding:0.9rem 0.5rem;font-weight:500;cursor:pointer;color:var(--primary);" onclick="viewPatient(${p.id})">
                  ${p.name}
                  ${hasAllergies ? `<span style="display:inline-block;margin-left:0.4rem;background:#fee2e2;color:#991b1b;font-size:0.65rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:10px;text-transform:uppercase;letter-spacing:0.05em;" title="${allergies.replace(/"/g,'&quot;')}"><i class="fa-solid fa-triangle-exclamation"></i> Alergias</span>` : ''}
                </td>
                <td style="padding:0.9rem 0.5rem;color:var(--text-light);font-size:0.85rem;">${age}</td>
                <td style="padding:0.9rem 0.5rem;font-size:0.85rem;">
                  ${p.tutor_name ? `<div style="font-weight:500;">${p.tutor_name}</div><div style="color:var(--text-light);font-size:0.78rem;">${p.tutor_email || '—'}</div>` : '<span style="color:var(--text-light);font-style:italic;">Sin tutor</span>'}
                </td>
                <td style="padding:0.9rem 0.5rem;text-align:right;">
                  <div style="display:inline-flex;gap:0.3rem;flex-wrap:wrap;justify-content:flex-end;">
                    ${p.tutor_id ? `<button class="btn" style="padding:0.3rem 0.55rem;font-size:0.72rem;background:#fef3c7;color:#92400e;box-shadow:none;border:1px solid #fbbf24;" onclick="openResetPasswordModal(${p.tutor_id}, '${(p.tutor_email||'').replace(/'/g,"\\'")}')" title="Resetear contraseña del tutor"><i class="fa-solid fa-key"></i> Clave</button>` : ''}
                    <button class="btn btn-secondary" style="padding:0.3rem 0.55rem;font-size:0.72rem;" onclick="openAssignPatientModal(${p.id})" title="Reasignar pediatra"><i class="fa-solid fa-user-doctor"></i></button>
                    <button class="btn" style="padding:0.3rem 0.55rem;font-size:0.72rem;background:transparent;color:#ef4444;box-shadow:none;" onclick="deletePatient(${p.id})" title="Eliminar paciente"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
          };

          return groups.map(g => `
            <div style="background:white;border-radius:15px;box-shadow:var(--card-shadow);margin-bottom:1.25rem;overflow:hidden;">
              <div style="background:${g.doctor ? 'linear-gradient(135deg,var(--primary),var(--secondary))' : 'linear-gradient(135deg,#94a3b8,#64748b)'};color:white;padding:0.85rem 1.25rem;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:1.05rem;font-weight:600;">
                    <i class="fa-solid ${g.doctor ? 'fa-user-doctor' : 'fa-triangle-exclamation'}"></i>
                    ${g.doctor ? g.doctor.name : 'Sin pediatra asignado'}
                  </div>
                  ${g.doctor ? `<div style="font-size:0.78rem;opacity:0.85;">${g.doctor.email}</div>` : ''}
                </div>
                <div style="font-size:0.85rem;background:rgba(255,255,255,0.2);padding:0.3rem 0.75rem;border-radius:20px;">${g.patients.length} paciente${g.patients.length === 1 ? '' : 's'}</div>
              </div>
              ${g.patients.length === 0 ? `
                <div style="padding:1.25rem;text-align:center;color:var(--text-light);font-size:0.85rem;font-style:italic;">Sin pacientes asignados.</div>
              ` : `
                <div style="overflow-x:auto;">
                  <table style="width:100%;text-align:left;border-collapse:collapse;">
                    <thead><tr style="border-bottom:2px solid var(--bg-color);color:var(--text-light);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.04em;">
                      <th style="padding:0.65rem 0.5rem;">Paciente</th>
                      <th style="padding:0.65rem 0.5rem;">Edad</th>
                      <th style="padding:0.65rem 0.5rem;">Tutor / Correo</th>
                      <th style="padding:0.65rem 0.5rem;text-align:right;">Acciones</th>
                    </tr></thead>
                    <tbody>
                      ${g.patients.map(renderPatientRow).join('')}
                    </tbody>
                  </table>
                </div>`}
            </div>`).join('');
        })()}
        ${patients.length === 0 ? '<div style="background:white;padding:2rem;border-radius:15px;text-align:center;color:var(--text-light);">No hay pacientes registrados.</div>' : ''}

        <p style="color:var(--text-light);font-size:0.78rem;margin-top:0.5rem;font-style:italic;">
          <i class="fa-solid fa-circle-info"></i> Las contraseñas se almacenan encriptadas y no pueden mostrarse. Usa el botón <strong>Clave</strong> para asignar una nueva al tutor.
        </p>
      </div>
    </div>
  `;
}

// === Sidebar + Topbar shell (pediatra/admin) ===
function renderSidebar() {
  const role = currentUser.role;
  // Cierra sidebar móvil al navegar
  window.closeMobileSidebar = function() {
    const sb = document.querySelector('.sidebar');
    const bd = document.querySelector('.sidebar-backdrop');
    if (sb) sb.classList.remove('is-open');
    if (bd) bd.classList.remove('is-visible');
  };
  window.toggleMobileSidebar = function() {
    const sb = document.querySelector('.sidebar');
    const bd = document.querySelector('.sidebar-backdrop');
    if (!sb) return;
    sb.classList.toggle('is-open');
    if (bd) bd.classList.toggle('is-visible');
  };
  let items;
  if (isAdminLike(role)) {
    items = [
      { id: 'admin-home',      icon: 'fa-house',      label: 'Inicio' },
      { id: 'admin-pediatras', icon: 'fa-user-doctor',label: 'Pediatras' },
    ];
    if (canManageUsers(role)) items.push({ id: 'admin-users', icon: 'fa-users-gear', label: 'Usuarios' });
  } else {
    items = [
      { id: 'doctor-home',          icon: 'fa-house',         label: 'Inicio' },
      { id: 'doctor-dashboard',     icon: 'fa-user-group',    label: 'Pacientes' },
      { id: 'availability-settings',icon: 'fa-calendar',      label: 'Calendario' },
      { id: 'doctor-profile-edit',  icon: 'fa-id-card',       label: 'Mi Perfil' },
    ];
  }
  const initials = (currentUser.name || '').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon"><img src="/img/genali-icon.svg" alt="Genali"></div>
        <div>
          <div class="sidebar-brand-title">Genali</div>
          <div class="sidebar-brand-subtitle">Historia clínica visual</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${items.map(it => `
          <a href="#" class="sidebar-link ${currentView === it.id ? 'is-active' : ''}" onclick="event.preventDefault();closeMobileSidebar();navigate('${it.id}')">
            <i class="fa-solid ${it.icon}"></i> <span>${it.label}</span>
          </a>`).join('')}
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">${initials || 'U'}</div>
          <div style="overflow:hidden;">
            <div class="sidebar-user-name">${currentUser.name}</div>
            <div class="sidebar-user-role">${({super_admin:'Super Admin',admin:'Administrador',asesor:'Asesor',pediatra:'Pediatra'})[role] || role}</div>
          </div>
        </div>
        <a href="#" class="sidebar-logout" onclick="event.preventDefault();handleLogout()">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Cerrar sesión
        </a>
      </div>
    </aside>`;
}

function renderTopbar() {
  const role = currentUser.role;
  const placeholder = isAdminLike(role)
    ? 'Buscar pediatra o paciente...'
    : 'Buscar paciente por nombre...';
  const canAddPatient = canEdit(role) || role === 'pediatra';
  return `
    <header class="topbar">
      <button class="topbar-hamburger" onclick="toggleMobileSidebar()" aria-label="Menú">
        <i class="fa-solid fa-bars"></i>
      </button>
      <div class="topbar-mobile-brand">
        <img src="/img/genali-icon.svg" alt="" style="height:26px;width:26px;">
        <strong>Genali</strong>
      </div>
      <div class="topbar-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="topbarSearch" placeholder="${placeholder}" oninput="topbarFilterPatients(this.value)">
      </div>
      <div class="topbar-actions">
        ${role === 'pediatra' ? `
          <button class="topbar-quick" onclick="navigate('availability-settings')"><i class="fa-regular fa-calendar"></i> <span class="hide-on-mobile">Agendar cita</span></button>
        ` : ''}
        ${canAddPatient ? `
          <button class="topbar-primary" onclick="navigate('patient-onboarding')"><i class="fa-solid fa-plus"></i> <span class="hide-on-mobile">Nuevo paciente</span></button>
        ` : ''}
      </div>
    </header>
    <div class="sidebar-backdrop" onclick="closeMobileSidebar()"></div>`;
}

window.togglePatientActive = async function(patientId, active) {
  try {
    await API.put(`/patients/${patientId}/active`, { active });
    const p = patients.find(x => x.id === patientId);
    if (p) p.active = active ? 1 : 0;
    renderApp();
  } catch(e) { alert('Error: ' + e.message); }
};

// Descartar el recordatorio de próxima visita de un paciente (bote de basura).
// Reaparece cuando se le registra una nueva consulta.
window.dismissNextVisit = async function(patientId, name) {
  try {
    await API.put(`/patients/${patientId}/dismiss-next-visit`, { dismissed: true });
    const p = patients.find(x => x.id === patientId);
    if (p) { p.next_visit_dismissed = 1; p.next_visit_date = null; }
    renderApp();
  } catch(e) { alert('Error: ' + e.message); }
};

window.topbarFilterPatients = function(q) {
  patientSearchQuery = q || '';
  // Re-render solo si estamos en un dashboard con lista
  if (['doctor-dashboard','admin-dashboard','admin-pediatras'].includes(currentView)) renderApp();
};

window.setPatientFilter = function(mode) {
  patientFilterMode = mode;
  renderApp();
};

function renderDoctorHome() {
  const today = new Date().toISOString().slice(0, 10);
  const firstName = (() => {
    const parts = (currentUser.name || '').split(' ').filter(p => p && !/^(dr\.?|dra\.?|md)$/i.test(p));
    return parts[0] || 'Doctor';
  })();
  const dateLabel = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Citas de hoy (excluye canceladas)
  const todayList = (todayAppointments || []).filter(a => a.status !== 'cancelada')
    .sort((a, b) => a.time.localeCompare(b.time));

  // Solicitudes pendientes (todas las pendientes futuras, no solo de hoy)
  const requests = (doctorAppointments || [])
    .filter(a => a.status === 'pendiente' && a.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const statusCfg = {
    pendiente:  { bg:'#fef3c7', color:'#92400e', label:'Pendiente' },
    confirmada: { bg:'#d1fae5', color:'#065f46', label:'Confirmada' },
    completada: { bg:'#dbeafe', color:'#1e3a8a', label:'Completada' },
  };

  // Lista de citas de hoy
  const todayHtml = todayList.length ? todayList.map(a => {
    const cfg = statusCfg[a.status] || statusCfg.pendiente;
    const initial = (a.patient_name || a.label || '?').charAt(0).toUpperCase();
    return `
      <div class="home-appt-row" ${a.patient_id ? `onclick="viewPatient(${a.patient_id})"` : ''}>
        <div class="home-appt-time">${a.time}</div>
        <div class="home-appt-avatar">${initial}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--text-dark);">${a.patient_name || `<em style="color:var(--text-light);">${a.label || 'Bloqueado'}</em>`}</div>
          ${a.notes ? `<div style="font-size:0.78rem;color:var(--text-light);margin-top:0.15rem;">${a.notes}</div>` : ''}
        </div>
        <span class="home-appt-badge" style="background:${cfg.bg};color:${cfg.color};">${cfg.label}</span>
        <div style="display:flex;gap:0.35rem;">
          ${a.status === 'pendiente' && a.patient_id  ? `<button class="home-btn home-btn-primary" onclick="event.stopPropagation();updateAppointmentStatus(${a.id},'confirmada')">Confirmar</button>` : ''}
          ${a.status === 'confirmada' ? `<button class="home-btn home-btn-success" onclick="event.stopPropagation();updateAppointmentStatus(${a.id},'completada')">Completar</button>` : ''}
          ${a.status !== 'completada' && a.status !== 'cancelada' ? `<button class="home-btn home-btn-danger" onclick="event.stopPropagation();updateAppointmentStatus(${a.id},'cancelada')" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      </div>`;
  }).join('') : `
    <div class="home-empty">
      <i class="fa-regular fa-calendar-check"></i>
      <div style="font-weight:600;margin-top:0.6rem;">Sin citas para hoy</div>
      <div style="font-size:0.85rem;color:var(--text-light);">Disfruta tu día. Las nuevas solicitudes aparecerán aquí.</div>
    </div>`;

  // Lista de solicitudes pendientes
  const requestsHtml = requests.length ? requests.map(a => {
    const dt = new Date(a.date + 'T12:00:00');
    const dateStr = dt.toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
    const isToday = a.date === today;
    const initial = (a.patient_name || '?').charAt(0).toUpperCase();
    return `
      <div class="home-appt-row" ${a.patient_id ? `onclick="viewPatient(${a.patient_id})"` : ''}>
        <div class="home-appt-time" style="background:#fef3c7;color:#92400e;">${a.time}</div>
        <div class="home-appt-avatar" style="background:#fde68a;color:#92400e;">${initial}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--text-dark);">${a.patient_name || 'Paciente'}</div>
          <div style="font-size:0.78rem;color:${isToday ? '#dc2626' : 'var(--text-light)'};margin-top:0.15rem;">
            <i class="fa-regular fa-calendar"></i> ${dateStr}${isToday ? ' · <strong>Hoy</strong>' : ''}
          </div>
          ${a.notes ? `<div style="font-size:0.78rem;color:var(--text-light);font-style:italic;margin-top:0.15rem;">"${a.notes}"</div>` : ''}
        </div>
        <div style="display:flex;gap:0.35rem;">
          <button class="home-btn home-btn-primary" onclick="event.stopPropagation();updateAppointmentStatus(${a.id},'confirmada')"><i class="fa-solid fa-check"></i> Aceptar</button>
          <button class="home-btn home-btn-danger" onclick="event.stopPropagation();updateAppointmentStatus(${a.id},'cancelada')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
  }).join('') : `
    <div class="home-empty">
      <i class="fa-regular fa-bell-slash"></i>
      <div style="font-weight:600;margin-top:0.6rem;">No hay solicitudes pendientes</div>
      <div style="font-size:0.85rem;color:var(--text-light);">Cuando un tutor solicite una cita, la verás aquí.</div>
    </div>`;

  // Stats rápidos
  const confirmedToday = todayList.filter(a => a.status === 'confirmada').length;
  const pendingToday   = todayList.filter(a => a.status === 'pendiente').length;
  const completedToday = todayList.filter(a => a.status === 'completada').length;

  return `
    <div class="dashboard-v2">
      <div class="hero-banner">
        <div>
          <h1 style="font-size:1.75rem;margin-bottom:0.4rem;">Hola, Dr. ${firstName} 👋</h1>
          <p style="color:var(--text-light);text-transform:capitalize;">${dateLabel}</p>
        </div>
        <div class="hero-illustration"><i class="fa-solid fa-calendar-day"></i></div>
      </div>

      ${renderCleanupBanner()}

      <div class="stats-row">
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa-solid fa-calendar-day"></i></div>
          <div><div class="stat-pill-value">${todayList.length}</div><div class="stat-pill-label">Citas de hoy</div><div class="stat-pill-sub">Total agendadas</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#d1fae5;color:#059669;"><i class="fa-solid fa-circle-check"></i></div>
          <div><div class="stat-pill-value">${confirmedToday}</div><div class="stat-pill-label">Confirmadas</div><div class="stat-pill-sub">Listas para atender</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fef3c7;color:#d97706;"><i class="fa-solid fa-bell"></i></div>
          <div><div class="stat-pill-value">${requests.length}</div><div class="stat-pill-label">Solicitudes</div><div class="stat-pill-sub">Por aceptar</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#ede9fe;color:#7c3aed;"><i class="fa-solid fa-flag-checkered"></i></div>
          <div><div class="stat-pill-value">${completedToday}</div><div class="stat-pill-label">Completadas hoy</div><div class="stat-pill-sub">Consultas finalizadas</div></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:1.25rem;">
        <div class="table-card">
          <div class="table-toolbar">
            <h2 style="font-size:1.1rem;display:flex;align-items:center;gap:0.5rem;"><i class="fa-regular fa-calendar-check" style="color:var(--primary);"></i> Citas de hoy</h2>
            <span style="color:var(--text-light);font-size:0.85rem;">${todayList.length} cita${todayList.length === 1 ? '' : 's'}</span>
          </div>
          <div class="home-appt-list">${todayHtml}</div>
        </div>

        <div class="table-card">
          <div class="table-toolbar">
            <h2 style="font-size:1.1rem;display:flex;align-items:center;gap:0.5rem;"><i class="fa-solid fa-bell" style="color:#d97706;"></i> Solicitudes de cita</h2>
            ${requests.length ? `<span class="alert-pill alert-pending">${requests.length}</span>` : ''}
          </div>
          <div class="home-appt-list">${requestsHtml}</div>
        </div>
      </div>
    </div>`;
}

function renderDoctorDashboard() {
  const q = patientSearchQuery.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  // Aplicar filtro por modo + búsqueda
  let visiblePatients = patients.slice();
  if (q) visiblePatients = visiblePatients.filter(p => p.name.toLowerCase().includes(q));
  if (patientFilterMode === 'allergies') {
    visiblePatients = visiblePatients.filter(p => {
      const a = (p.onboarding_data && p.onboarding_data['known-allergies'] || '').trim();
      return a && !/^(ninguna|ninguno|no|n\/a|na|sin alergias?)$/i.test(a);
    });
  } else if (patientFilterMode === 'overdue') {
    visiblePatients = visiblePatients.filter(p => p.next_visit_date && new Date(p.next_visit_date) < new Date(today));
  } else if (patientFilterMode === 'pending') {
    // se calcula abajo con pendingByPatient, pero ya podemos preparar
  } else if (patientFilterMode === 'inactive') {
    visiblePatients = visiblePatients.filter(p => p.active === 0);
  } else if (patientFilterMode === 'all') {
    // Sin filtro adicional
  }

  // Próximas visitas en los próximos 7 días o vencidas
  const upcomingPatients = patients.filter(p => {
    if (!p.next_visit_date) return false;
    const daysLeft = Math.round((new Date(p.next_visit_date) - new Date(today)) / 86_400_000);
    return daysLeft <= 7; // incluye vencidas (daysLeft < 0) y las del próximo semana
  }).sort((a, b) => a.next_visit_date.localeCompare(b.next_visit_date));

  const upcomingSection = upcomingPatients.length > 0 ? `
    <div style="background:white;padding:1.5rem;border-radius:15px;margin-bottom:2rem;box-shadow:var(--card-shadow);">
      <h2 style="margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
        <i class="fa-solid fa-bell" style="color:#f59e0b;font-size:1.1rem;"></i> Visitas Próximas
        <span style="font-size:0.8rem;color:var(--text-light);font-weight:400;margin-left:0.25rem;">(próximos 7 días)</span>
      </h2>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${upcomingPatients.map(p => {
          const daysLeft = Math.round((new Date(p.next_visit_date) - new Date(today)) / 86_400_000);
          const dateLabel = new Date(p.next_visit_date + 'T12:00:00').toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
          const isOverdue = daysLeft < 0;
          const bgColor = isOverdue ? '#fef2f2' : daysLeft === 0 ? '#fff7ed' : '#f0fdf4';
          const color   = isOverdue ? '#ef4444' : daysLeft === 0 ? '#f59e0b' : '#16a34a';
          const label   = isOverdue ? `Vencida hace ${Math.abs(daysLeft)} día(s)` : daysLeft === 0 ? 'Hoy' : `En ${daysLeft} día(s) — ${dateLabel}`;
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.9rem;background:${bgColor};border-radius:8px;flex-wrap:wrap;gap:0.5rem;cursor:pointer;" onclick="viewPatient(${p.id})">
            <div style="display:flex;align-items:center;gap:0.7rem;">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--primary);">${p.name.charAt(0).toUpperCase()}</div>
              <span style="font-weight:600;">${p.name}</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <span style="font-size:0.85rem;color:${color};font-weight:500;"><i class="fa-solid fa-calendar-check"></i> ${label}</span>
              <button class="nv-dismiss-btn" onclick="event.stopPropagation();dismissNextVisit(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Quitar recordatorio de ${p.name}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

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

  // Mapa: patient_id → próxima cita pendiente (solicitud sin confirmar)
  const pendingByPatient = {};
  doctorAppointments
    .filter(a => a.status === 'pendiente' && a.patient_id && a.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .forEach(a => { if (!pendingByPatient[a.patient_id]) pendingByPatient[a.patient_id] = a; });

  // Aplicar filtro 'pending' ahora que tenemos pendingByPatient
  if (patientFilterMode === 'pending') {
    visiblePatients = visiblePatients.filter(p => pendingByPatient[p.id]);
  }

  const patientsHtml = visiblePatients.length > 0
    ? visiblePatients.map(p => {
      const nvd = p.next_visit_date;
      let nvBadge = '';
      if (nvd) {
        const dLeft = Math.round((new Date(nvd) - new Date(today)) / 86_400_000);
        if (dLeft < 0)      nvBadge = `<span style="font-size:0.72rem;background:#fef2f2;color:#ef4444;border-radius:4px;padding:0.15rem 0.4rem;margin-left:0.3rem;"><i class="fa-solid fa-triangle-exclamation"></i> Visita vencida</span>`;
        else if (dLeft <= 7) nvBadge = `<span style="font-size:0.72rem;background:#fff7ed;color:#f59e0b;border-radius:4px;padding:0.15rem 0.4rem;margin-left:0.3rem;"><i class="fa-solid fa-bell"></i> Visita en ${dLeft}d</span>`;
      }
      // Badge de cita pendiente solicitada por el tutor
      const pending = pendingByPatient[p.id];
      let pendingBlock = '';
      if (pending) {
        const dt = new Date(pending.date + 'T12:00:00');
        const dateLabel = dt.toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
        pendingBlock = `
        <div style="margin-top:0.6rem;background:linear-gradient(135deg,#fef3c7,#fde68a);border-left:3px solid #f59e0b;border-radius:6px;padding:0.4rem 0.6rem;display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;">
          <i class="fa-solid fa-bell" style="color:#d97706;"></i>
          <div style="flex:1;line-height:1.3;">
            <div style="font-weight:700;color:#92400e;">Cita solicitada</div>
            <div style="color:#78350f;">${dateLabel} · <strong>${pending.time}</strong></div>
          </div>
        </div>`;
      }
      return `
      <div class="patient-card" onclick="viewPatient(${p.id})">
        <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="patient-info">
          <h3>${p.name}${nvBadge}</h3>
          <p><i class="fa-regular fa-clock"></i> ${calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']))}</p>
          <div style="margin-top:0.5rem;display:flex;gap:1rem;font-size:0.8rem;font-weight:500;">
            <span><i class="fa-solid fa-weight-scale" style="color:var(--secondary)"></i> ${p.weight} kg</span>
            <span><i class="fa-solid fa-ruler-vertical" style="color:var(--secondary)"></i> ${p.height} cm</span>
          </div>
          ${pendingBlock}
        </div>
        <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:var(--text-light);"></i>
      </div>`;
    }).join('')
    : `<div style="text-align:center;padding:3rem;background:white;border-radius:15px;grid-column:1/-1;">
        <i class="fa-solid fa-folder-open" style="font-size:3rem;color:var(--primary-light);margin-bottom:1rem;"></i>
        <h3>${q ? 'Sin resultados' : 'Aún no tienes pacientes'}</h3>
        <p style="color:var(--text-light);">${q ? 'Prueba otro término.' : 'Agrega tu primer paciente.'}</p>
      </div>`;

  // Estadísticas
  const totalPatients = patients.length;
  const withPending = Object.keys(pendingByPatient).length;
  const overdue = patients.filter(p => p.next_visit_date && new Date(p.next_visit_date) < new Date(today)).length;
  const consultsThisMonth = (() => {
    const first = new Date(); first.setDate(1); const cutoff = first.toISOString().slice(0,10);
    // No tenemos endpoint para consultas globales; usamos placeholder de citas confirmadas+completadas del mes
    return doctorAppointments.filter(a => a.date >= cutoff && (a.status === 'completada' || a.status === 'confirmada')).length;
  })();

  // Tabla de pacientes
  const tableRows = visiblePatients.length > 0
    ? visiblePatients.map(p => {
        const age = calculateAgeString(p.birth_date || (p.onboarding_data && p.onboarding_data['Fecha de nacimiento']));
        const allergies = (p.onboarding_data && p.onboarding_data['known-allergies'] || '').trim();
        const hasAllergies = allergies && !/^(ninguna|ninguno|no|n\/a|na|sin alergias?)$/i.test(allergies);
        const chronic   = (p.onboarding_data && p.onboarding_data['chronic-meds'] || '').trim();
        const hasChronic = chronic && !/^(ninguna|ninguno|no|n\/a|na)$/i.test(chronic);
        const pending = pendingByPatient[p.id];
        const nvLabel = (() => {
          if (!p.next_visit_date) return '—';
          const dLeft = Math.round((new Date(p.next_visit_date) - new Date(today)) / 86_400_000);
          const dt = new Date(p.next_visit_date + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
          if (dLeft < 0) return `<span style="color:#ef4444;">${dt}</span><br><span style="font-size:0.7rem;color:#ef4444;">Vencida</span>`;
          if (dLeft <= 7) return `<span>${dt}</span><br><span style="font-size:0.7rem;color:#f59e0b;">En ${dLeft}d</span>`;
          return `<span>${dt}</span>`;
        })();
        const sex = p.sex || (p.onboarding_data && p.onboarding_data['Sexo']) || '';
        const sexIcon = /^f/i.test(sex) ? `<i class="fa-solid fa-venus" style="color:#ec4899;"></i>` : /^m/i.test(sex) ? `<i class="fa-solid fa-mars" style="color:#3b82f6;"></i>` : '';
        const alerts = [];
        if (hasAllergies) alerts.push(`<span class="alert-pill alert-allergy" title="${allergies.replace(/"/g,'&quot;')}"><i class="fa-solid fa-triangle-exclamation"></i> Alergias</span>`);
        if (hasChronic)   alerts.push(`<span class="alert-pill alert-chronic" title="${chronic.replace(/"/g,'&quot;')}"><i class="fa-solid fa-pills"></i> Crónico</span>`);
        if (pending)      alerts.push(`<span class="alert-pill alert-pending" title="Cita solicitada"><i class="fa-solid fa-bell"></i> Cita solicitada</span>`);

        const isActive = p.active !== 0; // null o 1 = activo (compat. con pacientes viejos)
        return `
          <tr class="pt-row ${isActive ? '' : 'is-inactive'}" onclick="viewPatient(${p.id})">
            <td data-label="Paciente" class="pt-cell-primary">
              <div style="display:flex;align-items:center;gap:0.6rem;">
                <div class="pt-avatar">${p.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div style="font-weight:600;color:var(--text-dark);">${p.name}</div>
                  <div style="font-size:0.75rem;color:var(--text-light);">#${String(p.id).padStart(6,'0')}</div>
                </div>
              </div>
            </td>
            <td data-label="Edad / Sexo">
              <div style="font-weight:500;">${age}</div>
              <div style="font-size:0.78rem;color:var(--text-light);">${sexIcon} ${sex || '—'}</div>
            </td>
            <td data-label="Tutor / Contacto">
              <div style="font-size:0.82rem;">
                ${p.tutor_name ? `<div style="font-weight:500;">${p.tutor_name}</div>` : ''}
                ${p.tutor_email ? `<div style="color:var(--text-light);font-size:0.78rem;">${p.tutor_email}</div>` : '<span style="color:var(--text-light);font-style:italic;">Sin tutor</span>'}
              </div>
            </td>
            <td data-label="Alertas">${alerts.length ? `<div style="display:flex;flex-direction:column;gap:0.25rem;align-items:flex-start;">${alerts.join('')}</div>` : '<span style="color:var(--text-light);">—</span>'}</td>
            <td data-label="Peso" style="text-align:center;font-weight:600;color:var(--primary);">${p.weight ? p.weight + ' kg' : '—'}</td>
            <td data-label="Talla" style="text-align:center;font-weight:600;">${p.height ? p.height + ' cm' : '—'}</td>
            <td data-label="Próxima visita" style="font-size:0.82rem;line-height:1.3;">${nvLabel}</td>
            <td data-label="Seguimiento" style="text-align:center;">
              <label class="pt-toggle" onclick="event.stopPropagation();" title="${isActive ? 'Activo' : 'Inactivo'}">
                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="togglePatientActive(${p.id}, this.checked)">
                <span class="pt-toggle-slider"></span>
              </label>
              <div style="font-size:0.7rem;color:${isActive ? '#059669' : 'var(--text-light)'};font-weight:600;margin-top:0.2rem;">${isActive ? 'Activo' : 'Inactivo'}</div>
            </td>
            <td data-label="Acciones" style="text-align:right;">
              <button class="pt-action" onclick="event.stopPropagation();viewPatient(${p.id})" title="Ver expediente"><i class="fa-solid fa-eye"></i></button>
              ${p.tutor_id ? `<button class="pt-action" onclick="event.stopPropagation();openResetPasswordModal(${p.tutor_id}, '${(p.tutor_email||'').replace(/'/g,"\\'")}')" title="Clave del tutor"><i class="fa-solid fa-key"></i></button>` : ''}
            </td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:3rem;color:var(--text-light);">
        <i class="fa-solid fa-folder-open" style="font-size:2.5rem;color:var(--primary-light);display:block;margin-bottom:0.75rem;"></i>
        <strong>${q ? 'Sin resultados' : 'Aún no tienes pacientes'}</strong><br>
        <small>${q ? 'Prueba otro término.' : 'Agrega tu primer paciente con el botón "Nuevo paciente".'}</small>
      </td></tr>`;

  return `
    <div class="dashboard-v2">
      <div class="hero-banner">
        <div>
          <h1 style="font-size:1.75rem;margin-bottom:0.4rem;">Pacientes</h1>
          <p style="color:var(--text-light);">Gestiona y da seguimiento a tus pacientes</p>
        </div>
        <div class="hero-illustration"><i class="fa-solid fa-stethoscope"></i></div>
      </div>

      <div class="stats-row">
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#dbeafe;color:#2563eb;"><i class="fa-solid fa-users"></i></div>
          <div><div class="stat-pill-value">${totalPatients}</div><div class="stat-pill-label">Total pacientes</div><div class="stat-pill-sub">Registrados</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#d1fae5;color:#059669;"><i class="fa-solid fa-notes-medical"></i></div>
          <div><div class="stat-pill-value">${consultsThisMonth}</div><div class="stat-pill-label">Citas este mes</div><div class="stat-pill-sub">Confirmadas y completadas</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fef3c7;color:#d97706;"><i class="fa-solid fa-bell"></i></div>
          <div><div class="stat-pill-value">${withPending}</div><div class="stat-pill-label">Citas solicitadas</div><div class="stat-pill-sub">Por confirmar</div></div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-icon" style="background:#fee2e2;color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div><div class="stat-pill-value">${overdue}</div><div class="stat-pill-label">Visitas vencidas</div><div class="stat-pill-sub">Requieren atención</div></div>
        </div>
      </div>

      ${apptSection}
      ${upcomingSection}

      <div class="table-card">
        <div class="table-toolbar">
          <div class="filter-pills">
            <button class="pill ${patientFilterMode === 'all'       ? 'is-active' : ''}" onclick="setPatientFilter('all')">Todos</button>
            <button class="pill ${patientFilterMode === 'allergies' ? 'is-active' : ''}" onclick="setPatientFilter('allergies')">Con alergias</button>
            <button class="pill ${patientFilterMode === 'overdue'   ? 'is-active' : ''}" onclick="setPatientFilter('overdue')">Visita vencida</button>
            <button class="pill ${patientFilterMode === 'pending'   ? 'is-active' : ''}" onclick="setPatientFilter('pending')">Cita solicitada</button>
            <button class="pill ${patientFilterMode === 'inactive'  ? 'is-active' : ''}" onclick="setPatientFilter('inactive')">Inactivos</button>
          </div>
          <div style="color:var(--text-light);font-size:0.85rem;">${visiblePatients.length} de ${totalPatients} pacientes</div>
        </div>
        <div style="overflow-x:auto;">
          <table class="patients-table">
            <thead><tr>
              <th>Paciente</th>
              <th>Edad / Sexo</th>
              <th>Tutor / Contacto</th>
              <th>Alertas clínicas</th>
              <th style="text-align:center;">Peso</th>
              <th style="text-align:center;">Talla</th>
              <th>Próxima visita</th>
              <th style="text-align:center;">Seguimiento</th>
              <th style="text-align:right;">Acciones</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
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
          <div class="timeline-date">${formatConsultDate(h.date)}</div>
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
                ${meds.map(m => `<li style="margin-bottom:0.3rem;">${m.name} — ${m.dose}${m.freq ? `, cada ${m.freq}` : ''}${m.days ? `, <strong>por ${m.days}</strong>` : ''}${m.indication ? `<br><span style="font-size:0.82rem;color:#64748b;margin-left:0.5rem;">↳ ${m.indication}</span>` : ''}</li>`).join('')}
              </ul>
            </div>` : ''}
            <div class="timeline-metrics">
              <div class="metric"><i class="fa-solid fa-weight-scale"></i> ${h.weight} kg</div>
              <div class="metric"><i class="fa-solid fa-ruler-vertical"></i> ${h.height} cm</div>
              ${h.head_circ ? `<div class="metric"><i class="fa-solid fa-head-side-measles" style="color:var(--secondary)"></i> ${h.head_circ} cm</div>` : ''}
            </div>
            ${(() => {
              const vs = [];
              if (h.heart_rate)   vs.push({ icon:'fa-heart',           val:`${h.heart_rate} lpm`,  key:'heart_rate'   });
              if (h.resp_rate)    vs.push({ icon:'fa-lungs',            val:`${h.resp_rate} rpm`,   key:'resp_rate'    });
              if (h.temperature)  vs.push({ icon:'fa-thermometer-half', val:`${h.temperature} °C`,  key:'temperature'  });
              if (h.spo2)         vs.push({ icon:'fa-droplet',          val:`${h.spo2}%`,           key:'spo2'         });
              if (h.bp_systolic)  vs.push({ icon:'fa-gauge',            val:`${h.bp_systolic}${h.bp_diastolic?'/'+h.bp_diastolic:''} mmHg`, key:'bp_systolic' });
              if (vs.length === 0) return '';
              // Compute alert colours using same thresholds as backend
              const birthDate = currentPatient?.birth_date;
              const ageMonths = birthDate ? Math.floor((new Date() - new Date(birthDate)) / (30.44*86400000)) : null;
              function alertLevel(key, val) {
                if (ageMonths === null || val == null) return 'normal';
                if (key === 'heart_rate') {
                  const [lo,hi] = ageMonths<1?[100,180]:ageMonths<12?[100,160]:ageMonths<24?[90,150]:ageMonths<60?[80,140]:ageMonths<144?[70,120]:[60,100];
                  return val<lo||val>hi ? (val<lo*0.85||val>hi*1.15?'danger':'warning') : 'normal';
                }
                if (key === 'resp_rate') {
                  const [lo,hi] = ageMonths<2?[30,60]:ageMonths<12?[25,50]:ageMonths<60?[20,40]:[15,30];
                  return val<lo||val>hi ? (val<lo*0.8||val>hi*1.2?'danger':'warning') : 'normal';
                }
                if (key === 'temperature') return val<36.0||val>=38.5?'danger':val>=37.6?'warning':'normal';
                if (key === 'spo2') return val<90?'danger':val<95?'warning':'normal';
                if (key === 'bp_systolic') {
                  const [lo,hi] = ageMonths<12?[65,100]:ageMonths<36?[70,110]:ageMonths<60?[75,115]:ageMonths<120?[80,120]:[90,130];
                  return val<lo||val>hi ? (val>hi+10||val<lo-10?'danger':'warning') : 'normal';
                }
                return 'normal';
              }
              const chips = vs.map(v => {
                const lvl = alertLevel(v.key, parseFloat(v.val));
                const bg  = lvl==='danger'?'#fef2f2':lvl==='warning'?'#fffbeb':'#f8fafc';
                const col = lvl==='danger'?'#dc2626':lvl==='warning'?'#d97706':'#64748b';
                const ico = lvl==='danger'?'⚠ ':lvl==='warning'?'⚡ ':'';
                return `<span style="display:inline-flex;align-items:center;gap:0.3rem;background:${bg};color:${col};border:1px solid ${col}33;border-radius:99px;padding:0.2rem 0.6rem;font-size:0.75rem;font-weight:500;"><i class="fa-solid ${v.icon}"></i> ${ico}${v.val}</span>`;
              }).join('');
              return `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem;">${chips}</div>`;
            })()}
            ${h.next_visit_date ? (() => {
              const today = new Date().toISOString().slice(0, 10);
              const daysLeft = Math.round((new Date(h.next_visit_date) - new Date(today)) / 86_400_000);
              const dateLabel = new Date(h.next_visit_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
              const isOverdue = daysLeft < 0;
              const isSoon    = daysLeft >= 0 && daysLeft <= 7;
              const color  = isOverdue ? '#ef4444' : isSoon ? '#f59e0b' : '#64748b';
              const bgColor= isOverdue ? '#fef2f2' : isSoon ? '#fffbeb' : '#f8fafc';
              const icon   = isOverdue ? 'fa-triangle-exclamation' : 'fa-calendar-check';
              const label  = isOverdue ? `Venció hace ${Math.abs(daysLeft)} días` : daysLeft === 0 ? 'Próxima visita: hoy' : `Próxima visita: ${dateLabel}`;
              return `<div style="margin-top:0.6rem;padding:0.4rem 0.8rem;background:${bgColor};border-radius:6px;font-size:0.8rem;color:${color};display:inline-flex;align-items:center;gap:0.4rem;"><i class="fa-solid ${icon}"></i> ${label}</div>`;
            })() : ''}
          </div>
        </div>`;
      }).join('')
    : '<p style="color:var(--text-light);padding:1rem 0;">No hay consultas registradas aún.</p>';

  // Banner de alergias — visible para médico/admin
  const allergies = (p.onboarding_data && p.onboarding_data['known-allergies'] || '').trim();
  const hasAllergies = allergies && !/^(ninguna|ninguno|no|n\/a|na|sin alergias?)$/i.test(allergies);
  const allergyBanner = (hasAllergies && currentUser.role !== 'tutor') ? `
    <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:2px solid #ef4444;border-left:6px solid #dc2626;border-radius:10px;padding:0.85rem 1.1rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:0.9rem;box-shadow:0 2px 8px rgba(239,68,68,0.12);">
      <i class="fa-solid fa-triangle-exclamation" style="font-size:1.6rem;color:#dc2626;flex-shrink:0;"></i>
      <div style="flex:1;">
        <div style="font-weight:700;color:#991b1b;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.15rem;">⚠ Alergias conocidas</div>
        <div style="color:#7f1d1d;font-size:1rem;font-weight:600;">${allergies}</div>
      </div>
    </div>` : '';

  // Botón Volver — depende del rol y de cómo llegó al expediente
  let backView, backLabel;
  if (isAdminLike(currentUser.role)) {
    // El admin/asesor abre pacientes desde el detalle de un pediatra
    backView  = viewingPediatraId ? 'admin-pediatra-detail' : 'admin-home';
    backLabel = viewingPediatraId ? 'Volver al pediatra' : 'Volver';
  } else {
    backView  = 'doctor-dashboard';
    backLabel = 'Volver a Mis Pacientes';
  }
  const backBtn = currentUser.role !== 'tutor' ? `
    <button class="btn btn-secondary" style="margin-bottom:1rem;" onclick="navigate('${backView}')">
      <i class="fa-solid fa-arrow-left"></i> ${backLabel}
    </button>` : '';

  return `
    <div class="profile-view">
      ${backBtn}
      <div class="profile-header">
        <div class="profile-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div style="z-index:2;">
          <h1 style="font-size:2.5rem;margin-bottom:0.5rem;">${p.name}</h1>
          <p style="font-size:1.2rem;opacity:0.9;">
            ${calculateAgeString(birthDate)} •
            ${p.doctor_id && currentUser.role === 'tutor' ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();viewDoctorProfile(${p.doctor_id})" style="color:white;text-decoration:underline;cursor:pointer;">${doctorName}</a>` : doctorName}
          </p>
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
            <button class="btn" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.5);" onclick="openEditExpediente()" title="Editar expediente clínico"><i class="fa-solid fa-folder-open"></i> Expediente</button>
            ${p.tutor_id ? `<button class="btn" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.5);" onclick="openResetPasswordModal(${p.tutor_id}, '${(p.tutor_email||'').replace(/'/g,"\\'")}')" title="Cambiar clave del tutor"><i class="fa-solid fa-key"></i></button>` : ''}
          ` : ''}
        </div>
      </div>

      ${allergyBanner}

      <div class="profile-stats">
        <div class="stat-card"><div class="stat-label">Peso Actual</div><div class="stat-value">${p.weight||0} <span style="font-size:1.2rem;color:var(--text-dark)">kg</span></div><p style="color:var(--secondary);font-size:0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Actualizado</p></div>
        <div class="stat-card"><div class="stat-label">Estatura</div><div class="stat-value">${p.height||0} <span style="font-size:1.2rem;color:var(--text-dark)">cm</span></div><p style="color:var(--secondary);font-size:0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Actualizado</p></div>
        <div class="stat-card"><div class="stat-label">Consultas</div><div class="stat-value">${consultations.length} <span style="font-size:1.2rem;color:var(--text-dark)">total</span></div><p style="color:var(--text-light);font-size:0.9rem;">Registradas</p></div>
        ${(() => {
          const lastConsult = consultations.find(c => c.next_visit_date);
          if (!lastConsult) return '';
          const nvd = lastConsult.next_visit_date;
          const today = new Date().toISOString().slice(0, 10);
          const daysLeft = Math.round((new Date(nvd) - new Date(today)) / 86_400_000);
          const dateLabel = new Date(nvd + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
          const isOverdue = daysLeft < 0;
          const isSoon = daysLeft >= 0 && daysLeft <= 7;
          const color = isOverdue ? '#ef4444' : isSoon ? '#f59e0b' : 'var(--secondary)';
          const icon  = isOverdue ? 'fa-triangle-exclamation' : isSoon ? 'fa-bell' : 'fa-calendar-check';
          const label = isOverdue ? `Hace ${Math.abs(daysLeft)} días` : daysLeft === 0 ? 'Hoy' : `En ${daysLeft} días`;
          return `<div class="stat-card"><div class="stat-label">Próxima Visita</div><div class="stat-value" style="font-size:1.1rem;color:${color};">${dateLabel}</div><p style="color:${color};font-size:0.9rem;"><i class="fa-solid ${icon}"></i> ${label}</p></div>`;
        })()}
      </div>

      <div class="charts-section">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem;">
          <h2 style="margin:0;">Curvas de Crecimiento OMS 2006</h2>
          <div style="display:flex;gap:0.4rem;">
            <button id="chartTabPeso" class="btn" style="padding:0.35rem 1rem;font-size:0.85rem;background:var(--primary);color:white;" onclick="switchGrowthTab('peso')"><i class="fa-solid fa-weight-scale"></i> Peso</button>
            <button id="chartTabTalla" class="btn btn-secondary" style="padding:0.35rem 1rem;font-size:0.85rem;" onclick="switchGrowthTab('talla')"><i class="fa-solid fa-ruler-vertical"></i> Talla</button>
          </div>
        </div>
        <div id="growthChartWrap" style="position:relative;">
          <div class="chart-container"><canvas id="growthChart"></canvas></div>
          <div id="growthZscoreBox" style="display:none;position:absolute;top:0.5rem;right:0.5rem;background:white;border:1px solid #E2E8F0;border-radius:10px;padding:0.5rem 0.75rem;font-size:0.8rem;box-shadow:0 2px 8px rgba(0,0,0,0.08);min-width:140px;"></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.75rem;font-size:0.78rem;color:var(--text-light);">
          <span style="display:flex;align-items:center;gap:0.35rem;"><span style="width:28px;height:8px;background:rgba(74,222,128,0.35);border-radius:3px;display:inline-block;"></span> P3–P97</span>
          <span style="display:flex;align-items:center;gap:0.35rem;"><span style="width:28px;height:8px;background:rgba(34,197,94,0.45);border-radius:3px;display:inline-block;"></span> P15–P85</span>
          <span style="display:flex;align-items:center;gap:0.35rem;"><span style="width:28px;height:3px;background:#16a34a;border-radius:3px;display:inline-block;border-top:2px dashed #16a34a;"></span> P50 (mediana)</span>
          <span style="display:flex;align-items:center;gap:0.35rem;"><span style="width:10px;height:10px;background:#4A90E2;border-radius:50%;display:inline-block;"></span> Paciente</span>
        </div>
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

      ${renderVaccineSection()}

      ${renderNeuroSection()}

      ${(p.onboarding_data && Object.keys(p.onboarding_data).length > 0) || (p.family_history && p.family_history.length > 0) || p.delivery_type ? `
      <div class="history-section" style="margin-top:2rem;">
        <h2 style="margin-bottom:2rem;font-size:1.8rem;border-bottom:2px solid var(--primary-light);padding-bottom:0.5rem;">Expediente de Ingreso</h2>

        ${p.family_history && p.family_history.length > 0 ? `
        <details class="expediente-accordion">
          <summary class="expediente-summary">
            <div style="display:flex;align-items:center;gap:0.8rem;"><i class="fa-solid fa-dna" style="color:#8b5cf6;"></i> Antecedentes Heredofamiliares</div>
            <i class="fa-solid fa-chevron-down accordion-icon" style="color:var(--text-light);transition:transform 0.3s;"></i>
          </summary>
          <div class="expediente-accordion-content">
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${p.family_history.map(fh => `
              <div style="display:flex;align-items:center;gap:0.7rem;padding:0.5rem 0.8rem;background:#faf5ff;border-radius:8px;border-left:3px solid #8b5cf6;">
                <i class="fa-solid fa-circle-dot" style="color:#8b5cf6;font-size:0.8rem;"></i>
                <span style="font-weight:500;">${fh.condition}</span>
                <span style="color:var(--text-light);font-size:0.85rem;">— ${fh.relationship}</span>
                ${fh.notes ? `<span style="color:var(--text-light);font-size:0.8rem;font-style:italic;">${fh.notes}</span>` : ''}
              </div>`).join('')}
            </div>
          </div>
        </details>` : ''}

        ${p.onboarding_data && Object.keys(p.onboarding_data).length > 0 ? Object.entries(categorizeOnboardingData(p.onboarding_data)).map(([cat, items]) => {
          if (!items.length) return '';
          const catIcons = {'Ficha de Identificación':'fa-id-card','Contexto Familiar':'fa-house-chimney','Antecedentes Prenatales':'fa-person-pregnant','Datos Perinatales':'fa-baby','Antecedentes Personales':'fa-heart-pulse','Otros Registros':'fa-folder'};
          const icon = catIcons[cat] || 'fa-folder';
          return `
          <details class="expediente-accordion" ${cat === 'Ficha de Identificación' || cat === 'Datos Generales y Nacimiento' ? 'open' : ''}>
            <summary class="expediente-summary">
              <div style="display:flex;align-items:center;gap:0.8rem;"><i class="fa-solid ${icon}" style="color:var(--secondary);"></i> ${cat}</div>
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
        }).join('') : ''}
      </div>` : ''}
    </div>
  `;
}

// ── Vaccine Section ────────────────────────────────────────────────────────
function renderVaccineSection() {
  if (!patientVaccinations.length) {
    return `<div class="history-section" style="margin-top:2rem;">
      <h2 style="margin-bottom:1rem;">Esquema de Vacunación NOM-031</h2>
      <p style="color:var(--text-light);">Cargando esquema de vacunación…</p>
    </div>`;
  }

  // Group by NOM group
  const groups = {};
  for (const v of patientVaccinations) {
    if (!groups[v.group]) groups[v.group] = [];
    groups[v.group].push(v);
  }

  const statusCfg = {
    aplicada:  { label: 'Aplicada',  bg: '#dcfce7', color: '#16a34a', icon: 'fa-circle-check' },
    proxima:   { label: 'Próxima',   bg: '#fef9c3', color: '#ca8a04', icon: 'fa-bell'         },
    vencida:   { label: 'Vencida',   bg: '#fee2e2', color: '#dc2626', icon: 'fa-triangle-exclamation' },
    pendiente: { label: 'Pendiente', bg: '#f1f5f9', color: '#64748b', icon: 'fa-clock'        },
  };

  const vaccineIcons = {
    'BCG':              'fa-shield-virus',
    'Hepatitis B':      'fa-syringe',
    'Pentavalente':     'fa-shield-halved',
    'Rotavirus':        'fa-biohazard',
    'Neumocócica 13v':  'fa-lungs',
    'Influenza':        'fa-wind',
    'Triple Viral SRP': 'fa-viruses',
    'Varicela':         'fa-bacteria',
    'DPT':              'fa-shield',
    'VPH':              'fa-ribbon',
  };

  // Summary counts
  const applied  = patientVaccinations.filter(v => v.status === 'aplicada').length;
  const overdue  = patientVaccinations.filter(v => v.status === 'vencida').length;
  const upcoming = patientVaccinations.filter(v => v.status === 'proxima').length;
  const total    = patientVaccinations.length;
  const pct      = Math.round((applied / total) * 100);

  const groupsHtml = Object.entries(groups).map(([grp, items]) => {
    const allApplied = items.every(v => v.status === 'aplicada');
    const hasOverdue = items.some(v => v.status === 'vencida');
    const grpColor   = allApplied ? '#16a34a' : hasOverdue ? '#dc2626' : '#64748b';

    const cards = items.map(v => {
      const cfg   = statusCfg[v.status] || statusCfg.pendiente;
      const vIcon = vaccineIcons[v.vaccine] || 'fa-syringe';
      const schedLabel = v.scheduled_date
        ? new Date(v.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' })
        : '—';

      const applyBtn = currentUser.role !== 'tutor' && v.status !== 'aplicada'
        ? `<button class="btn" style="margin-top:0.6rem;padding:0.3rem 0.8rem;font-size:0.78rem;background:var(--primary);color:white;border-radius:6px;box-shadow:none;" onclick="openApplyVaccineModal(${v.id},'${v.vaccine}','${v.dose}')"><i class="fa-solid fa-syringe"></i> Aplicar</button>`
        : '';
      const unapplyBtn = currentUser.role !== 'tutor' && v.status === 'aplicada'
        ? `<button class="btn" style="margin-top:0.4rem;padding:0.2rem 0.6rem;font-size:0.72rem;background:transparent;color:#64748b;box-shadow:none;border:1px solid #e2e8f0;border-radius:5px;" onclick="unapplyVaccine(${v.id})" title="Deshacer aplicación"><i class="fa-solid fa-rotate-left"></i></button>`
        : '';

      const appliedInfo = v.applied_at ? `
        <div style="margin-top:0.4rem;font-size:0.75rem;color:#16a34a;">
          <i class="fa-solid fa-calendar-check"></i>
          ${new Date(v.applied_at + 'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})}
          ${v.lot ? `<span style="color:#64748b;"> · Lote: ${v.lot}</span>` : ''}
          ${v.applied_by_name ? `<span style="color:#64748b;"> · ${v.applied_by_name}</span>` : ''}
        </div>` : '';

      return `
      <div style="background:white;border-radius:12px;padding:0.9rem 1rem;box-shadow:0 1px 4px rgba(0,0,0,0.07);border-left:3px solid ${cfg.color};min-width:180px;flex:1 1 180px;max-width:240px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.4rem;margin-bottom:0.3rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <i class="fa-solid ${vIcon}" style="color:var(--primary);font-size:0.9rem;"></i>
            <span style="font-weight:600;font-size:0.85rem;">${v.vaccine}</span>
          </div>
          <span style="font-size:0.7rem;background:${cfg.bg};color:${cfg.color};padding:0.15rem 0.5rem;border-radius:20px;white-space:nowrap;"><i class="fa-solid ${cfg.icon}" style="font-size:0.65rem;"></i> ${cfg.label}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text-light);">Dosis: <strong style="color:var(--text-dark);">${v.dose}</strong></div>
        <div style="font-size:0.75rem;color:var(--text-light);margin-top:0.2rem;"><i class="fa-regular fa-calendar" style="margin-right:0.2rem;"></i>${schedLabel}</div>
        ${appliedInfo}
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">${applyBtn}${unapplyBtn}</div>
      </div>`;
    }).join('');

    return `
    <div style="margin-bottom:1.2rem;">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${grpColor};margin-bottom:0.5rem;display:flex;align-items:center;gap:0.4rem;">
        <i class="fa-solid fa-circle-dot" style="font-size:0.55rem;"></i> ${grp}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.6rem;">${cards}</div>
    </div>`;
  }).join('');

  return `
  <div class="history-section" style="margin-top:2rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.2rem;">
      <h2 style="margin:0;">Esquema de Vacunación NOM-031</h2>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;font-size:0.82rem;">
        <span style="background:#dcfce7;color:#16a34a;padding:0.25rem 0.7rem;border-radius:20px;font-weight:500;"><i class="fa-solid fa-circle-check"></i> ${applied} aplicadas</span>
        ${overdue  ? `<span style="background:#fee2e2;color:#dc2626;padding:0.25rem 0.7rem;border-radius:20px;font-weight:500;"><i class="fa-solid fa-triangle-exclamation"></i> ${overdue} vencidas</span>` : ''}
        ${upcoming ? `<span style="background:#fef9c3;color:#ca8a04;padding:0.25rem 0.7rem;border-radius:20px;font-weight:500;"><i class="fa-solid fa-bell"></i> ${upcoming} próximas</span>` : ''}
      </div>
    </div>
    <div style="background:white;border-radius:10px;padding:0.7rem 1rem;margin-bottom:1.2rem;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
        <span style="font-size:0.82rem;color:var(--text-light);">Progreso de vacunación</span>
        <span style="font-size:0.82rem;font-weight:600;color:var(--primary);">${applied}/${total} (${pct}%)</span>
      </div>
      <div style="background:#e2e8f0;border-radius:20px;height:8px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,var(--primary),var(--secondary));height:100%;width:${pct}%;border-radius:20px;transition:width 0.5s;"></div>
      </div>
    </div>
    ${groupsHtml}
  </div>`;
}

// Apply vaccine modal opener
window.openApplyVaccineModal = function(vaccId, vaccineName, dose) {
  window._applyVaccId = vaccId;
  document.getElementById('applyVaccTitle').textContent   = `${vaccineName} — ${dose}`;
  document.getElementById('applyVaccDate').value          = new Date().toISOString().slice(0,10);
  document.getElementById('applyVaccLot').value           = '';
  document.getElementById('applyVaccNotes').value         = '';
  document.getElementById('applyVaccError').style.display = 'none';
  openModal('applyVaccineModal');
};

window.confirmApplyVaccine = async function() {
  const id    = window._applyVaccId;
  const date  = document.getElementById('applyVaccDate').value;
  const lot   = document.getElementById('applyVaccLot').value.trim();
  const notes = document.getElementById('applyVaccNotes').value.trim();
  const errEl = document.getElementById('applyVaccError');
  if (!date) { errEl.textContent = 'La fecha es requerida'; errEl.style.display = 'block'; return; }
  try {
    const pid = currentPatientId || currentPatient?.id;
    await API.post(`/patients/${pid}/vaccinations/${id}/apply`, { applied_at: date, lot, notes });
    closeModal('applyVaccineModal');
    // Refresh vaccinations
    patientVaccinations = (await API.get(`/patients/${pid}/vaccinations`)) || [];
    renderApp();
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
};

window.unapplyVaccine = async function(id) {
  if (!confirm('¿Deshacer la aplicación de esta vacuna?')) return;
  try {
    const pid = currentPatientId || currentPatient?.id;
    await API.put(`/patients/${pid}/vaccinations/${id}/unapply`, {});
    patientVaccinations = (await API.get(`/patients/${pid}/vaccinations`)) || [];
    renderApp();
  } catch (e) { alert(e.message); }
};

// ── Neurodesarrollo Section ────────────────────────────────────────────────
const DOMAIN_LABELS = { PS:'Personal-Social', MF:'Motor Fino', LJ:'Lenguaje', MG:'Motor Grueso' };
const DOMAIN_ICONS  = { PS:'fa-users',        MF:'fa-hand',    LJ:'fa-comments', MG:'fa-person-running' };
const RISK_CFG = {
  bajo:     { label:'Bajo riesgo',    bg:'#dcfce7', color:'#16a34a', icon:'fa-circle-check'          },
  moderado: { label:'Riesgo moderado',bg:'#fef9c3', color:'#ca8a04', icon:'fa-triangle-exclamation'  },
  alto:     { label:'Riesgo alto',    bg:'#fee2e2', color:'#dc2626', icon:'fa-circle-exclamation'    },
};

function renderNeuroSection() {
  const canEdit = currentUser?.role !== 'tutor';
  const p = currentPatient;
  const birthDate = p?.birth_date;
  const ageMonths = birthDate
    ? Math.floor((new Date() - new Date(birthDate + 'T12:00:00')) / (30.44 * 86400000))
    : null;
  const showMchat = ageMonths !== null && ageMonths >= 16 && ageMonths <= 30;

  const historyHtml = neuroAssessments.length > 0
    ? neuroAssessments.map(a => {
        const cfg    = RISK_CFG[a.risk_level] || RISK_CFG.bajo;
        const alarms = Array.isArray(a.alarms) ? a.alarms : [];
        const typeLabel = a.type === 'denver' ? 'Denver II' : 'M-CHAT-R/F';
        const typeIcon  = a.type === 'denver' ? 'fa-clipboard-list' : 'fa-brain';
        const dateLabel = new Date(a.date + 'T12:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
        const scoreLabel = a.type === 'denver'
          ? `${a.score}% hitos cumplidos`
          : `${a.score} ${a.score === 1 ? 'ítem fallado' : 'ítems fallados'}`;
        return `
        <div style="background:white;border-radius:12px;padding:1rem 1.2rem;box-shadow:var(--card-shadow);border-left:4px solid ${cfg.color};margin-bottom:0.8rem;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <div style="background:${cfg.bg};border-radius:8px;padding:0.5rem;"><i class="fa-solid ${typeIcon}" style="color:${cfg.color};font-size:1.1rem;"></i></div>
              <div>
                <div style="font-weight:600;">${typeLabel}</div>
                <div style="font-size:0.82rem;color:var(--text-light);">${dateLabel} · ${ageMonths !== null ? a.age_months + ' meses' : ''}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
              <span style="font-size:0.78rem;background:${cfg.bg};color:${cfg.color};padding:0.2rem 0.7rem;border-radius:20px;font-weight:600;">
                <i class="fa-solid ${cfg.icon}" style="font-size:0.7rem;margin-right:0.3rem;"></i>${cfg.label}
              </span>
              <span style="font-size:0.78rem;color:var(--text-light);">${scoreLabel}</span>
              ${canEdit ? `<button class="btn" style="padding:0.2rem 0.5rem;font-size:0.75rem;background:transparent;color:#ef4444;box-shadow:none;" onclick="deleteNeuro(${a.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </div>
          ${alarms.length > 0 ? `
          <div style="margin-top:0.7rem;padding:0.5rem 0.8rem;background:#fef2f2;border-radius:8px;">
            <div style="font-size:0.78rem;font-weight:600;color:#dc2626;margin-bottom:0.3rem;"><i class="fa-solid fa-triangle-exclamation"></i> Señales de alarma:</div>
            <ul style="margin:0;padding-left:1.2rem;font-size:0.78rem;color:#7f1d1d;">
              ${alarms.map(al => `<li>${al}</li>`).join('')}
            </ul>
          </div>` : ''}
          ${a.notes ? `<p style="margin-top:0.5rem;font-size:0.82rem;color:var(--text-light);font-style:italic;">"${a.notes}"</p>` : ''}
        </div>`;
      }).join('')
    : `<p style="color:var(--text-light);font-size:0.9rem;">No hay evaluaciones registradas aún.</p>`;

  return `
  <div class="history-section" style="margin-top:2rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.2rem;">
      <h2 style="margin:0;">Evaluación de Neurodesarrollo</h2>
      ${canEdit && ageMonths !== null ? `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" style="padding:0.4rem 1rem;font-size:0.85rem;" onclick="openNeuroScreener('denver',${ageMonths})">
          <i class="fa-solid fa-clipboard-list"></i> Denver II
        </button>
        ${showMchat ? `<button class="btn" style="padding:0.4rem 1rem;font-size:0.85rem;background:#7c3aed;color:white;" onclick="openNeuroScreener('mchat',${ageMonths})">
          <i class="fa-solid fa-brain"></i> M-CHAT-R/F
        </button>` : ''}
      </div>` : ''}
    </div>
    ${historyHtml}
  </div>`;
}

// ── Neuro Screener State ───────────────────────────────────────────────────
let _neuroScreenerType   = null;
let _neuroScreenerAge    = 0;
let _neuroItems          = [];
let _neuroDomains        = {};
let _neuroResponses      = {};

window.openNeuroScreener = async function(type, ageMonths) {
  _neuroScreenerType = type;
  _neuroScreenerAge  = ageMonths;
  _neuroResponses    = {};
  try {
    const pid = currentPatientId || currentPatient?.id;
    const data = await API.get(`/patients/${pid}/neurodevelopment/items?type=${type}&ageMonths=${ageMonths}`);
    _neuroItems   = data.items   || [];
    _neuroDomains = data.domains || {};
  } catch (e) { alert(e.message); return; }

  renderNeuroScreenerModal();
  openModal('neuroScreenerModal');
};

function renderNeuroScreenerModal() {
  const type    = _neuroScreenerType;
  const items   = _neuroItems;
  const title   = type === 'denver' ? 'Denver II — Screener de Desarrollo' : 'M-CHAT-R/F — Detección de Autismo';
  const subtitle = type === 'denver'
    ? `${items.length} hitos para ${_neuroScreenerAge} meses de edad`
    : `20 preguntas · Niños de 16 a 30 meses`;

  let bodyHtml = '';
  if (type === 'denver') {
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.domain]) grouped[item.domain] = [];
      grouped[item.domain].push(item);
    }
    bodyHtml = Object.entries(grouped).map(([dom, domItems]) => `
      <div style="margin-bottom:1.2rem;">
        <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--primary);margin-bottom:0.5rem;display:flex;align-items:center;gap:0.4rem;">
          <i class="fa-solid ${DOMAIN_ICONS[dom]||'fa-circle'}"></i> ${DOMAIN_LABELS[dom]||dom}
        </div>
        ${domItems.map(item => `
        <div style="display:flex;align-items:flex-start;gap:0.8rem;padding:0.6rem 0;border-bottom:1px solid #f1f5f9;">
          <div style="flex:1;font-size:0.88rem;padding-top:0.1rem;">${item.text}
            <span style="font-size:0.73rem;color:var(--text-light);margin-left:0.4rem;">(P90 a los ${item.age90}m)</span>
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;font-size:0.82rem;">
              <input type="radio" name="neuro_${item.id}" value="si" onchange="_neuroResponses['${item.id}']='si'"> Sí
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:0.25rem;font-size:0.82rem;">
              <input type="radio" name="neuro_${item.id}" value="no" onchange="_neuroResponses['${item.id}']='no'"> No
            </label>
          </div>
        </div>`).join('')}
      </div>`).join('');
  } else {
    bodyHtml = items.map((item, idx) => `
      <div style="padding:0.75rem 0;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:0.88rem;font-weight:500;margin-bottom:0.4rem;">
          <span style="color:var(--text-light);margin-right:0.4rem;">${idx + 1}.</span>${item.text}
          ${item.critical ? `<span style="font-size:0.7rem;background:#fef9c3;color:#ca8a04;padding:0.1rem 0.4rem;border-radius:10px;margin-left:0.4rem;">Crítico</span>` : ''}
        </div>
        <div style="display:flex;gap:0.8rem;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.3rem;padding:0.3rem 0.8rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:0.85rem;transition:all 0.15s;" onclick="this.style.background='#dcfce7'">
            <input type="radio" name="mchat_${item.id}" value="si" onchange="_neuroResponses[${item.id}]='si'"> Sí
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:0.3rem;padding:0.3rem 0.8rem;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:0.85rem;transition:all 0.15s;" onclick="this.style.background='#fee2e2'">
            <input type="radio" name="mchat_${item.id}" value="no" onchange="_neuroResponses[${item.id}]='no'"> No
          </label>
        </div>
      </div>`).join('');
  }

  const modalEl = document.getElementById('neuroScreenerModal');
  if (modalEl) {
    modalEl.querySelector('#neuroModalTitle').textContent    = title;
    modalEl.querySelector('#neuroModalSubtitle').textContent = subtitle;
    modalEl.querySelector('#neuroModalBody').innerHTML       = bodyHtml;
    modalEl.querySelector('#neuroModalError').style.display  = 'none';
  }
}

window.confirmNeuroScreener = async function() {
  const total  = _neuroItems.length;
  const answered = Object.keys(_neuroResponses).length;
  const errEl  = document.getElementById('neuroModalError');
  if (answered < total * 0.8) {
    errEl.textContent = `Por favor responde al menos ${Math.ceil(total * 0.8)} de ${total} ítems.`;
    errEl.style.display = 'block';
    return;
  }

  const pid   = currentPatientId || currentPatient?.id;
  const notes = document.getElementById('neuroModalNotes').value.trim();
  try {
    await API.post(`/patients/${pid}/neurodevelopment`, {
      type:      _neuroScreenerType,
      age_months: _neuroScreenerAge,
      date:      new Date().toISOString().slice(0, 10),
      responses: _neuroResponses,
      notes,
    });
    closeModal('neuroScreenerModal');
    neuroAssessments = (await API.get(`/patients/${pid}/neurodevelopment`)) || [];
    renderApp();
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
};

window.deleteNeuro = async function(id) {
  if (!confirm('¿Eliminar esta evaluación?')) return;
  const pid = currentPatientId || currentPatient?.id;
  try {
    await API.del(`/patients/${pid}/neurodevelopment/${id}`);
    neuroAssessments = (await API.get(`/patients/${pid}/neurodevelopment`)) || [];
    renderApp();
  } catch (e) { alert(e.message); }
};

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
          <button class="btn btn-primary" style="width:100%;font-size:1.1rem;padding:1rem;" onclick="navigate(getRoleDefaultView(currentUser.role))">Ir a mi Panel</button>
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

// === Doctor Profile (own edit + admin edit + public view) ===
let myProfile = null;
let publicDoctor = null;

async function loadOwnProfile() {
  try {
    // Si admin/super_admin está editando un pediatra ajeno, cargar por ID
    if (window.editingProfileUserId) {
      myProfile = await API.get(`/users/${window.editingProfileUserId}`);
    } else {
      myProfile = await API.get('/users/me');
    }
    fillProfileForm();
  } catch(e) { console.error('loadOwnProfile:', e.message); }
}

function fillProfileForm() {
  if (!myProfile) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('dp-name', myProfile.name);
  set('dp-email', myProfile.email);
  set('dp-specialty', myProfile.specialty);
  set('dp-license', myProfile.license);
  set('dp-phone', myProfile.phone);
  set('dp-office', myProfile.office_address);
  set('dp-description', myProfile.description);
  set('dp-fb', myProfile.social_facebook);
  set('dp-ig', myProfile.social_instagram);
  set('dp-wa', myProfile.social_whatsapp);
  set('dp-web', myProfile.social_website);
  const preview = document.getElementById('dp-photo-preview');
  if (preview && myProfile.photo) preview.src = myProfile.photo;
}

function renderDoctorProfileEdit() {
  const isAdminEditing = !!window.editingProfileUserId && window.editingProfileUserId !== currentUser.id;
  const title    = isAdminEditing ? `Editar Pediatra: ${myProfile?.name || ''}` : 'Mi Perfil Profesional';
  const subtitle = isAdminEditing ? 'Edita los datos profesionales del pediatra.' : 'Esta información será visible para los tutores de tus pacientes.';
  const backView = isAdminEditing ? 'admin-pediatra-detail' : 'doctor-dashboard';
  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1 style="font-size:2rem;">${title}</h1>
          <p style="color:var(--text-light);">${subtitle}</p>
        </div>
        <button class="btn btn-secondary" onclick="navigate('${backView}')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:2rem;background:white;padding:2rem;border-radius:15px;box-shadow:var(--card-shadow);">
        <!-- Foto -->
        <div style="text-align:center;">
          <div style="width:200px;height:200px;border-radius:50%;background:var(--primary-light);margin:0 auto 1rem;overflow:hidden;border:4px solid var(--primary);display:flex;align-items:center;justify-content:center;">
            <img id="dp-photo-preview" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;color:var(--primary);font-size:5rem;"><i class="fa-solid fa-user-doctor"></i></div>
          </div>
          <label class="btn btn-secondary" style="cursor:pointer;width:100%;display:inline-block;">
            <i class="fa-solid fa-camera"></i> Cambiar foto
            <input type="file" accept="image/*" style="display:none;" onchange="onPhotoSelected(event)">
          </label>
          <button class="btn" style="margin-top:0.5rem;background:transparent;color:#ef4444;width:100%;box-shadow:none;font-size:0.85rem;" onclick="document.getElementById('dp-photo-preview').src='';myProfile.photo=null;document.getElementById('dp-photo-preview').onerror()">Quitar foto</button>
        </div>

        <!-- Campos -->
        <div>
          <h3 style="margin-bottom:1rem;color:var(--primary);">Información Profesional</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div class="form-group"><label>Nombre completo *</label><input id="dp-name" class="form-control" type="text" placeholder="Dr. Nombre Apellido"></div>
            <div class="form-group"><label>Correo electrónico *</label><input id="dp-email" class="form-control" type="email"></div>
            <div class="form-group"><label>Especialidad</label><input id="dp-specialty" class="form-control" type="text" placeholder="Ej. Pediatría general, Neonatología"></div>
            <div class="form-group"><label>Cédula profesional</label><input id="dp-license" class="form-control" type="text" placeholder="Ej. 12345678"></div>
            <div class="form-group"><label>Teléfono</label><input id="dp-phone" class="form-control" type="tel" placeholder="Ej. +52 999 123 4567"></div>
            <div class="form-group"><label>Dirección del consultorio</label><input id="dp-office" class="form-control" type="text" placeholder="Ej. Av. Reforma 123, Col. Centro"></div>
          </div>
          <div class="form-group"><label>Acerca de mí</label><textarea id="dp-description" class="form-control" rows="4" placeholder="Cuéntale a los tutores sobre tu experiencia, formación y enfoque..."></textarea></div>

          <h3 style="margin:1.5rem 0 1rem;color:var(--primary);">Redes Sociales</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div class="form-group"><label><i class="fa-brands fa-facebook" style="color:#1877f2;"></i> Facebook</label><input id="dp-fb" class="form-control" type="url" placeholder="https://facebook.com/tu-pagina"></div>
            <div class="form-group"><label><i class="fa-brands fa-instagram" style="color:#e1306c;"></i> Instagram</label><input id="dp-ig" class="form-control" type="url" placeholder="https://instagram.com/tu-usuario"></div>
            <div class="form-group"><label><i class="fa-brands fa-whatsapp" style="color:#25d366;"></i> WhatsApp (número)</label><input id="dp-wa" class="form-control" type="tel" placeholder="Ej. 5219991234567"></div>
            <div class="form-group"><label><i class="fa-solid fa-globe" style="color:var(--primary);"></i> Sitio web</label><input id="dp-web" class="form-control" type="url" placeholder="https://tu-sitio.com"></div>
          </div>

          <h3 style="margin:1.5rem 0 1rem;color:var(--primary);">Cambiar contraseña</h3>
          <div class="form-group" style="max-width:400px;">
            <input id="dp-password" class="form-control" type="password" placeholder="Dejar en blanco para no cambiar">
          </div>

          <button class="btn btn-primary" style="margin-top:1rem;" onclick="saveOwnProfile()"><i class="fa-solid fa-floppy-disk"></i> Guardar cambios</button>
        </div>
      </div>
    </div>`;
}

window.onPhotoSelected = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede exceder 5 MB'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    // Redimensionar a max 400px de ancho con canvas
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (myProfile) myProfile.photo = dataUrl;
      const preview = document.getElementById('dp-photo-preview');
      if (preview) { preview.src = dataUrl; preview.style.display = 'block'; preview.nextElementSibling.style.display = 'none'; }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

window.saveOwnProfile = async function() {
  const val = id => document.getElementById(id)?.value.trim() || '';
  const password = document.getElementById('dp-password')?.value;
  const body = {
    name:             val('dp-name'),
    email:            val('dp-email'),
    specialty:        val('dp-specialty'),
    license:          val('dp-license'),
    phone:            val('dp-phone'),
    office_address:   val('dp-office'),
    description:      val('dp-description'),
    photo:            myProfile?.photo || null,
    social_facebook:  val('dp-fb'),
    social_instagram: val('dp-ig'),
    social_whatsapp:  val('dp-wa'),
    social_website:   val('dp-web'),
  };
  if (password) body.password = password;
  if (!body.name || !body.email) { alert('Nombre y correo son obligatorios'); return; }
  try {
    const targetId  = window.editingProfileUserId;
    const isAdminEditing = !!targetId && targetId !== currentUser.id;
    const updated   = isAdminEditing
      ? await API.put(`/users/${targetId}`, body)
      : await API.put('/users/me', body);
    myProfile = updated;
    if (!isAdminEditing && currentUser) {
      currentUser.name = updated.name; currentUser.email = updated.email;
      sessionStorage.setItem('peditrack_user', JSON.stringify(currentUser));
    }
    alert('Perfil actualizado correctamente');
    if (isAdminEditing) {
      // Refrescar lista de pediatras y volver al detalle
      pediatricians = (await API.get('/users/pediatras')) || [];
      viewingPediatraData = null; // forzar recarga del detalle
      window.editingProfileUserId = null;
      navigate('admin-pediatra-detail');
      return;
    }
    navigate('doctor-dashboard');
  } catch(e) { alert('Error: ' + e.message); }
};

// === Public Doctor View (for tutors) ===
async function loadDoctorPublic() {
  const did = window.viewingDoctorId;
  if (!did) return;
  // Evita re-fetch si ya está cargado el mismo doctor (previene loop renderApp)
  if (publicDoctor && publicDoctor.id === did) return;
  try { publicDoctor = await API.get(`/users/${did}/public`); renderApp(); } catch(e) { console.error(e.message); }
}
window.viewDoctorProfile = function(doctorId) {
  window.viewingDoctorId = doctorId;
  publicDoctor = null;
  navigate('doctor-public');
};

function renderDoctorPublic() {
  const d = publicDoctor;
  if (!d) return `<div class="dashboard"><p style="text-align:center;padding:3rem;color:var(--text-light);">Cargando...</p></div>`;
  const backView = currentUser.role === 'tutor' ? 'parent-profile' : 'doctor-dashboard';
  const social = [
    d.social_facebook  ? `<a href="${d.social_facebook}"  target="_blank" rel="noopener" style="color:#1877f2;font-size:1.6rem;" title="Facebook"><i class="fa-brands fa-facebook"></i></a>` : '',
    d.social_instagram ? `<a href="${d.social_instagram}" target="_blank" rel="noopener" style="color:#e1306c;font-size:1.6rem;" title="Instagram"><i class="fa-brands fa-instagram"></i></a>` : '',
    d.social_whatsapp  ? `<a href="https://wa.me/${d.social_whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#25d366;font-size:1.6rem;" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : '',
    d.social_website   ? `<a href="${d.social_website}"   target="_blank" rel="noopener" style="color:var(--primary);font-size:1.6rem;" title="Sitio web"><i class="fa-solid fa-globe"></i></a>` : '',
  ].filter(Boolean).join('');
  return `
    <div class="dashboard">
      <button class="btn btn-secondary" style="margin-bottom:1rem;" onclick="navigate('${backView}')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      <div style="background:white;border-radius:15px;box-shadow:var(--card-shadow);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--primary),var(--secondary));padding:2rem;text-align:center;">
          <div style="width:160px;height:160px;border-radius:50%;background:white;margin:0 auto;overflow:hidden;border:4px solid white;display:flex;align-items:center;justify-content:center;">
            ${d.photo ? `<img src="${d.photo}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fa-solid fa-user-doctor" style="font-size:5rem;color:var(--primary);"></i>`}
          </div>
          <h1 style="color:white;margin-top:1rem;font-size:2rem;">${d.name}</h1>
          ${d.specialty ? `<p style="color:rgba(255,255,255,0.95);font-size:1.05rem;">${d.specialty}</p>` : ''}
          ${d.license ? `<p style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-top:0.25rem;">Cédula profesional: ${d.license}</p>` : ''}
        </div>
        <div style="padding:2rem;">
          ${d.description ? `<div style="margin-bottom:1.5rem;"><h3 style="color:var(--primary);margin-bottom:0.5rem;">Acerca de</h3><p style="line-height:1.6;color:var(--text-dark);">${d.description.replace(/\n/g,'<br>')}</p></div>` : ''}

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.5rem;">
            ${d.email          ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-envelope"></i> Correo</div><div style="font-weight:500;word-break:break-all;">${d.email}</div></div>` : ''}
            ${d.phone          ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-phone"></i> Teléfono</div><div style="font-weight:500;">${d.phone}</div></div>` : ''}
            ${d.office_address ? `<div style="background:var(--bg-color);padding:0.85rem 1rem;border-radius:10px;grid-column:1/-1;"><div style="font-size:0.72rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;"><i class="fa-solid fa-location-dot"></i> Consultorio</div><div style="font-weight:500;">${d.office_address}</div></div>` : ''}
          </div>

          ${social ? `<div style="text-align:center;border-top:1px solid var(--bg-color);padding-top:1rem;"><div style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.5rem;">Conecta conmigo</div><div style="display:flex;justify-content:center;gap:1.25rem;">${social}</div></div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderAvailabilitySettings() {
  return `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Horarios de Atención</h1>
          <p style="color:var(--text-light);">Activa los días, define tus franjas y gestiona tu agenda</p>
        </div>
        <button class="btn btn-secondary" onclick="navigate('doctor-dashboard')"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      </div>

      <div style="display:grid;grid-template-columns:minmax(0,640px) minmax(0,1fr);gap:1.5rem;align-items:start;">

        <!-- LEFT: horario semanal -->
        <div>
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
            <button class="btn btn-secondary" onclick="navigate('doctor-dashboard')" style="padding:0.65rem 1.4rem;">Cancelar</button>
            <button class="btn btn-primary" onclick="saveAvailability()" style="padding:0.65rem 1.6rem;gap:0.5rem;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar Horario
            </button>
          </div>
        </div>

        <!-- RIGHT: agenda calendario -->
        <div id="doctorAgendaWrap">
          <div style="background:white;border-radius:18px;padding:1.5rem;box-shadow:var(--card-shadow);">
            <!-- Calendar header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
              <div style="display:flex;align-items:center;gap:0.6rem;">
                <div style="width:32px;height:32px;border-radius:9px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;">
                  <i class="fa-regular fa-calendar" style="color:var(--primary);"></i>
                </div>
                <span style="font-weight:700;font-size:0.95rem;">Agenda del Mes</span>
              </div>
              <div style="display:flex;align-items:center;gap:0.4rem;">
                <button class="btn btn-secondary" style="padding:0.3rem 0.7rem;font-size:0.85rem;box-shadow:none;" onclick="dcNavMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
                <span id="dcMonthLabel" style="font-weight:600;font-size:0.9rem;min-width:110px;text-align:center;"></span>
                <button class="btn btn-secondary" style="padding:0.3rem 0.7rem;font-size:0.85rem;box-shadow:none;" onclick="dcNavMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
              </div>
            </div>
            <!-- Day-of-week headers -->
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;">
              ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d =>
                `<div style="text-align:center;font-size:0.7rem;font-weight:700;color:var(--text-light);padding:4px 0;">${d}</div>`
              ).join('')}
            </div>
            <!-- Calendar grid filled by JS -->
            <div id="dcGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;"></div>
            <!-- Legend -->
            <div style="display:flex;gap:0.9rem;margin-top:0.9rem;flex-wrap:wrap;font-size:0.72rem;color:var(--text-light);">
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--primary);margin-right:4px;vertical-align:middle;"></span>Con citas</span>
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#e2e8f0;margin-right:4px;vertical-align:middle;"></span>Día hábil</span>
              <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:2px solid var(--primary);margin-right:4px;vertical-align:middle;"></span>Hoy</span>
            </div>
          </div>

          <!-- Day detail panel -->
          <div id="dcDayPanel" style="display:none;background:white;border-radius:18px;padding:1.4rem 1.5rem;box-shadow:var(--card-shadow);margin-top:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
              <div>
                <div id="dcDayTitle" style="font-weight:700;font-size:1rem;color:var(--text-dark);"></div>
                <div id="dcDaySubtitle" style="font-size:0.8rem;color:var(--text-light);margin-top:2px;"></div>
              </div>
              <button class="btn btn-primary" style="padding:0.35rem 0.9rem;font-size:0.8rem;" onclick="openDcBookModal()">
                <i class="fa-solid fa-plus"></i> Nueva Cita
              </button>
            </div>
            <div id="dcDayAppts"></div>
          </div>
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

// ── Doctor Agenda Calendar ─────────────────────────────────────────────────

async function loadDoctorCalendar() {
  try {
    dcAllAppts = (await API.get('/appointments')) || [];
    dcRenderGrid();
  } catch (e) { console.error('dcLoad:', e.message); }
}

function dcRenderGrid() {
  const label = document.getElementById('dcMonthLabel');
  const grid  = document.getElementById('dcGrid');
  if (!label || !grid) return;

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  label.textContent = `${monthNames[dcMonth]} ${dcYear}`;

  // Build a set of dates with appointments this month
  const apptsByDate = {};
  for (const a of dcAllAppts) {
    if (!a.date.startsWith(`${dcYear}-${String(dcMonth+1).padStart(2,'0')}`)) continue;
    if (!apptsByDate[a.date]) apptsByDate[a.date] = [];
    apptsByDate[a.date].push(a);
  }

  const today     = new Date().toISOString().slice(0,10);
  const firstDay  = new Date(dcYear, dcMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(dcYear, dcMonth+1, 0).getDate();

  let html = '';
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${dcYear}-${String(dcMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const appts   = apptsByDate[dateStr] || [];
    const isToday = dateStr === today;
    const isSel   = dateStr === dcSelDate;
    const hasAppts = appts.length > 0;
    const isPast  = dateStr < today;

    const active = appts.filter(a => a.status !== 'cancelada').length;

    let bg     = 'transparent';
    let color  = isPast ? '#94a3b8' : 'var(--text-dark)';
    let border = 'none';
    let badge  = '';

    if (isSel)      { bg = 'var(--primary)'; color = 'white'; }
    else if (hasAppts && !isPast) { bg = 'var(--primary-light)'; }

    if (isToday && !isSel) border = `2px solid var(--primary)`;

    if (active > 0) badge = `<span style="display:block;font-size:0.6rem;font-weight:700;color:${isSel?'rgba(255,255,255,0.9)':'var(--primary)'};line-height:1;">${active} cita${active>1?'s':''}</span>`;

    html += `
      <div onclick="dcSelectDate('${dateStr}')"
           style="border-radius:8px;padding:5px 2px;text-align:center;cursor:pointer;
                  background:${bg};border:${border};
                  transition:background 0.15s;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;"
           title="${dateStr}">
        <span style="font-size:0.82rem;font-weight:${isToday?'700':'500'};color:${color};">${d}</span>
        ${badge}
      </div>`;
  }
  grid.innerHTML = html;
}

window.dcNavMonth = function(dir) {
  dcMonth += dir;
  if (dcMonth > 11) { dcMonth = 0;  dcYear++; }
  if (dcMonth < 0)  { dcMonth = 11; dcYear--; }
  dcSelDate = null;
  dcRenderGrid();
  const panel = document.getElementById('dcDayPanel');
  if (panel) panel.style.display = 'none';
};

window.dcSelectDate = async function(dateStr) {
  dcSelDate = dateStr;
  dcRenderGrid(); // re-render to show selection

  const panel    = document.getElementById('dcDayPanel');
  const titleEl  = document.getElementById('dcDayTitle');
  const subEl    = document.getElementById('dcDaySubtitle');
  const apptsEl  = document.getElementById('dcDayAppts');
  if (!panel) return;

  const dateObj  = new Date(dateStr + 'T12:00:00');
  const dayLabel = dateObj.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  titleEl.textContent = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  // Load available slots for this day
  apptsEl.innerHTML = `<p style="color:var(--text-light);font-size:0.85rem;text-align:center;padding:0.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>`;
  panel.style.display = 'block';

  try {
    const [slotsResp] = await Promise.all([
      API.get(`/appointments/slots/${currentUser.id}/${dateStr}`)
    ]);
    dcDaySlots = slotsResp || [];

    const dayAppts = dcAllAppts.filter(a => a.date === dateStr);
    const freeSlots = dcDaySlots.filter(s => s.available).length;
    subEl.textContent = `${dayAppts.length} cita(s) • ${freeSlots} turno(s) libre(s)`;

    if (dayAppts.length === 0 && dcDaySlots.length === 0) {
      apptsEl.innerHTML = `<p style="color:var(--text-light);font-size:0.85rem;padding:0.5rem 0;text-align:center;">No hay turnos configurados para este día.</p>`;
      return;
    }

    const statusCfg = {
      pendiente:  { bg:'#fef9c3', color:'#ca8a04', label:'Pendiente' },
      confirmada: { bg:'#dcfce7', color:'#16a34a', label:'Confirmada' },
      completada: { bg:'#e0f2fe', color:'#0284c7', label:'Completada' },
      cancelada:  { bg:'#fee2e2', color:'#dc2626', label:'Cancelada'  },
    };

    // Build time-ordered list of all slots, marking booked ones
    // Citas canceladas liberan el slot — no se incluyen en el mapa
    const bookedByTime = {};
    for (const a of dayAppts) {
      if (a.status !== 'cancelada') bookedByTime[a.time] = a;
    }

    const slotsHtml = dcDaySlots.map(s => {
      const appt = bookedByTime[s.time];
      if (appt) {
        const cfg = statusCfg[appt.status] || statusCfg.pendiente;
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.55rem 0.75rem;border-radius:8px;background:${cfg.bg};border-left:3px solid ${cfg.color};margin-bottom:0.4rem;gap:0.5rem;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="font-weight:700;font-size:0.82rem;color:var(--text-dark);min-width:42px;">${s.time}</span>
            <span style="font-size:0.85rem;">${appt.patient_name || `<span style="color:#64748b;font-style:italic;">${appt.label || 'Bloqueado'}</span>`}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <span style="font-size:0.72rem;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}33;border-radius:20px;padding:0.1rem 0.5rem;white-space:nowrap;">${cfg.label}</span>
            ${appt.status === 'pendiente' && appt.patient_id ? `<button class="btn" style="padding:0.15rem 0.5rem;font-size:0.72rem;background:var(--primary);color:white;border-radius:5px;box-shadow:none;" onclick="dcChangeStatus(${appt.id},'confirmada')">Confirmar</button>` : ''}
            ${appt.status !== 'cancelada' && appt.status !== 'completada' ? `<button class="btn" style="padding:0.15rem 0.5rem;font-size:0.72rem;background:white;color:#dc2626;border:1px solid #fca5a5;border-radius:5px;box-shadow:none;" onclick="dcChangeStatus(${appt.id},'cancelada')">Cancelar</button>` : ''}
            ${appt.status === 'confirmada' ? `<button class="btn" style="padding:0.15rem 0.5rem;font-size:0.72rem;background:#0284c7;color:white;border-radius:5px;box-shadow:none;" onclick="dcChangeStatus(${appt.id},'completada')">Completar</button>` : ''}
          </div>
        </div>`;
      } else {
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.75rem;border-radius:8px;border:1.5px dashed #e2e8f0;margin-bottom:0.4rem;">
          <span style="font-size:0.82rem;font-weight:600;color:#94a3b8;">${s.time} <span style="font-weight:400;font-size:0.75rem;">— libre</span></span>
          <button class="btn" style="padding:0.15rem 0.55rem;font-size:0.72rem;background:var(--primary);color:white;border-radius:5px;box-shadow:none;" onclick="openDcBookModal('${s.time}')"><i class="fa-solid fa-plus"></i> Agendar</button>
        </div>`;
      }
    }).join('');

    apptsEl.innerHTML = slotsHtml || `<p style="color:var(--text-light);font-size:0.85rem;">No hay turnos para este día.</p>`;
  } catch (e) {
    apptsEl.innerHTML = `<p style="color:#ef4444;font-size:0.85rem;">${e.message}</p>`;
  }
};

window.dcChangeStatus = async function(apptId, status) {
  try {
    await API.put(`/appointments/${apptId}/status`, { status });
    dcAllAppts = (await API.get('/appointments')) || [];
    dcRenderGrid();
    if (dcSelDate) dcSelectDate(dcSelDate);
  } catch (e) { alert(e.message); }
};

window.openDcBookModal = function(preselTime) {
  if (!dcSelDate) return;
  const dateObj  = new Date(dcSelDate + 'T12:00:00');
  const dayLabel = dateObj.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('dcBookDateLabel').textContent = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  // Populate time select with free slots
  const sel = document.getElementById('dcBookTime');
  const free = dcDaySlots.filter(s => s.available);
  sel.innerHTML = free.length
    ? free.map(s => `<option value="${s.time}" ${s.time===preselTime?'selected':''}>${s.time}</option>`).join('')
    : `<option value="">Sin turnos disponibles</option>`;
  sel.disabled = !free.length;

  // Populate patient select (optional)
  const patSel = document.getElementById('dcBookPatient');
  patSel.innerHTML = `<option value="">— Sin paciente (bloquear turno) —</option>`
    + patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  document.getElementById('dcBookNotes').value = '';
  document.getElementById('dcBookError').style.display = 'none';
  openModal('dcBookModal');
};

window.confirmDcBook = async function() {
  const time      = document.getElementById('dcBookTime').value;
  const patientId = document.getElementById('dcBookPatient').value;
  const notes     = document.getElementById('dcBookNotes').value.trim();
  const errEl     = document.getElementById('dcBookError');
  if (!time) { errEl.textContent = 'Selecciona un turno'; errEl.style.display = 'block'; return; }
  try {
    await API.post('/appointments', {
      patient_id: patientId ? parseInt(patientId) : null,
      doctor_id:  currentUser.id,
      date:       dcSelDate,
      time,
      notes:      notes || null,
      label:      !patientId ? (notes || 'Bloqueado') : null
    });
    closeModal('dcBookModal');
    dcAllAppts = (await API.get('/appointments')) || [];
    dcRenderGrid();
    dcSelectDate(dcSelDate);
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
};

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

// === Edit Expediente (pediatra/admin) ===
const EXPEDIENTE_FIELDS = [
  'new-patient-name','patient-birth-date','Sexo','patient-curp','patient-birth-state','patient-birth-city',
  'mom-name','dad-name','mom-education','dad-education','mom-occupation','dad-occupation',
  'siblings-count','housing-type','pets','smokers-home',
  'maternal-age','gesta-num','prenatal-ctrl','prenatal-visits','tobacco-preg','alcohol-preg','torch','obstetric-comp',
  'delivery-type','gestational-weeks','birth-weight-kg','birth-height-cm','birth-head-cm',
  'apgar-1','apgar-5','nicu-stay','nicu-days','phototherapy','neonatal-screening',
  'breastfed','breastfed-months','feeding-type',
  'known-allergies','surgery-detail','hosp-detail','chronic-meds'
];

window.openEditExpediente = function() {
  if (!currentPatient) return;
  const data = currentPatient.onboarding_data || {};
  for (const f of EXPEDIENTE_FIELDS) {
    const el = document.getElementById('ee-' + f);
    if (el) el.value = data[f] || '';
  }
  openModal('editExpedienteModal');
};

window.saveExpediente = async function() {
  if (!currentPatient) return;
  const newData = { ...(currentPatient.onboarding_data || {}) };
  for (const f of EXPEDIENTE_FIELDS) {
    const el = document.getElementById('ee-' + f);
    if (!el) continue;
    const v = (el.value || '').trim();
    if (v) newData[f] = v;
    else delete newData[f]; // Permitir vaciar campos
  }
  try {
    const body = { onboarding_data: newData };
    // Sincronizar fecha de nacimiento al campo del paciente si cambió
    if (newData['patient-birth-date']) body.birth_date = newData['patient-birth-date'];
    if (newData['Sexo'])               body.sex        = newData['Sexo'];

    const updated = await API.put(`/patients/${currentPatient.id}`, body);
    currentPatient = { ...currentPatient, ...updated, onboarding_data: newData };
    // Refrescar lista de pacientes para que aparezca actualizado en dashboards
    if (currentUser.role !== 'tutor') patients = (await API.get('/patients')) || [];
    closeModal('editExpedienteModal');
    renderApp();
    alert('Expediente actualizado correctamente');
  } catch (e) { alert('Error: ' + e.message); }
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
      <div class="modal-content" style="max-width:680px;">
        <div class="modal-header"><h2>Registrar Consulta</h2><button class="close-btn" onclick="closeModal('addConsultModal')"><i class="fa-solid fa-xmark"></i></button></div>

        <!-- Antropometría -->
        <p style="font-weight:600;color:var(--primary);margin-bottom:0.75rem;font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;"><i class="fa-solid fa-weight-scale"></i> Antropometría</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
          <div class="form-group" style="margin-bottom:0;"><label>Peso (kg) *</label><input type="number" id="consultWeight" step="0.01" class="form-control" placeholder="Ej. 8.5"></div>
          <div class="form-group" style="margin-bottom:0;"><label>Estatura (cm) *</label><input type="number" id="consultHeight" step="0.1" class="form-control" placeholder="Ej. 71"></div>
          <div class="form-group" style="margin-bottom:0;"><label>P. Cefálico (cm)</label><input type="number" id="consultHead" step="0.1" class="form-control" placeholder="Ej. 45"></div>
        </div>

        <!-- Signos Vitales -->
        <p style="font-weight:600;color:#7c3aed;margin-bottom:0.75rem;font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;"><i class="fa-solid fa-heart-pulse"></i> Signos Vitales <span style="font-weight:400;font-size:0.8rem;color:var(--text-light);">(opcional)</span></p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:0.75rem;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">FC <span style="color:var(--text-light)">(lpm)</span></label>
            <input type="number" id="consultFC" class="form-control" min="30" max="300" placeholder="Ej. 120">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">FR <span style="color:var(--text-light)">(rpm)</span></label>
            <input type="number" id="consultFR" class="form-control" min="5" max="100" placeholder="Ej. 35">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">Temperatura <span style="color:var(--text-light)">(°C)</span></label>
            <input type="number" id="consultTemp" class="form-control" step="0.1" min="30" max="43" placeholder="Ej. 37.0">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">SpO₂ <span style="color:var(--text-light)">(%)</span></label>
            <input type="number" id="consultSpO2" class="form-control" min="50" max="100" placeholder="Ej. 98">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">TA Sistólica <span style="color:var(--text-light)">(mmHg)</span></label>
            <input type="number" id="consultTAS" class="form-control" min="40" max="200" placeholder="Ej. 90">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.82rem;">TA Diastólica <span style="color:var(--text-light)">(mmHg)</span></label>
            <input type="number" id="consultTAD" class="form-control" min="20" max="130" placeholder="Ej. 60">
          </div>
        </div>

        <!-- Tipo + Medicación -->
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
        <div class="form-group"><label>Notas Clínicas</label><textarea id="consultNotes" class="form-control" rows="3" placeholder="Observaciones, vacunas, etc..."></textarea></div>
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

    <!-- Limpiar citas vencidas -->
    <div class="modal-overlay" id="cleanupApptsModal" onclick="if(event.target===this)closeModal('cleanupApptsModal')">
      <div class="modal-content" style="max-width:420px;text-align:center;">
        <i class="fa-solid fa-broom" style="font-size:3rem;color:#f59e0b;margin-bottom:1rem;"></i>
        <h2 style="margin-bottom:0.75rem;">¿Limpiar citas vencidas?</h2>
        <p style="color:var(--text-light);margin-bottom:0.5rem;">
          Se cancelarán <strong>${typeof countPastNoShows === 'function' ? countPastNoShows() : ''}</strong> cita(s)
          cuya fecha ya pasó y siguen sin atender (pendientes o confirmadas).
        </p>
        <p style="color:var(--text-light);font-size:0.82rem;margin-bottom:1.5rem;">
          Quedarán marcadas como <em>canceladas</em> (no se borran; el registro se conserva).
        </p>
        <div style="display:flex;gap:1rem;">
          <button class="btn" style="flex:1;background:#f1f5f9;color:var(--text-dark);" onclick="closeModal('cleanupApptsModal')">Cancelar</button>
          <button class="btn" id="cleanupConfirmBtn" style="flex:1;background:#f59e0b;color:white;" onclick="confirmCleanupAppts()"><i class="fa-solid fa-broom"></i> Sí, cancelarlas</button>
        </div>
      </div>
    </div>

    <!-- User Modal -->
    <div class="modal-overlay" id="userModal" onclick="if(event.target===this)closeModal('userModal')">
      <div class="modal-content">
        <div class="modal-header"><h2 id="userModalTitle">Añadir Pediatra</h2><button class="close-btn" onclick="closeModal('userModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="form-group"><label>Nombre Completo</label><input type="text" id="userModalName" class="form-control" placeholder="Ej. Dra. Ana Gómez"></div>
        <div class="form-group"><label>Correo Electrónico</label><input type="email" id="userModalEmail" class="form-control" placeholder="ej. dra.ana@peditrack.com"></div>
        <div class="form-group" id="userModalRoleGroup" style="display:none;"><label>Rol</label>
          <select id="userModalRole" class="form-control">
            <option value="pediatra">Pediatra</option>
            <option value="admin">Administrador</option>
            <option value="asesor">Asesor</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Contraseña <small style="color:var(--text-light);font-weight:400;">(autogenerada — puedes editarla)</small></label>
          <div style="display:flex;gap:0.5rem;">
            <input type="text" id="userModalPassword" class="form-control" placeholder="Contraseña" style="font-family:monospace;">
            <button class="btn btn-secondary" type="button" style="padding:0.5rem 0.85rem;" onclick="document.getElementById('userModalPassword').value=generateRandomPassword(8)" title="Generar otra"><i class="fa-solid fa-arrows-rotate"></i></button>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="saveUser()"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
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
      <div class="modal-content" style="max-width:440px;">
        <div class="modal-header"><h2>Cambiar Contraseña del Tutor</h2><button class="close-btn" onclick="closeModal('resetPasswordModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <div id="resetPasswordUserInfo" style="display:none;background:var(--primary-light);border-radius:8px;padding:0.65rem 0.85rem;margin-bottom:1rem;">
          <div style="font-size:0.7rem;color:var(--primary);text-transform:uppercase;letter-spacing:0.04em;font-weight:700;margin-bottom:0.15rem;"><i class="fa-solid fa-envelope"></i> Correo del usuario</div>
          <div id="resetPasswordEmail" style="font-weight:600;font-size:0.9rem;color:var(--text-dark);word-break:break-all;">—</div>
        </div>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:1rem;">Se generó una contraseña aleatoria de 8 caracteres. Compártela con el tutor.</p>
        <div class="form-group">
          <label>Nueva Contraseña</label>
          <div style="display:flex;gap:0.5rem;align-items:stretch;">
            <input type="text" id="resetPasswordInput" class="form-control" style="font-family:monospace;font-size:1.15rem;letter-spacing:0.05em;font-weight:600;text-align:center;background:#f1f5f9;" readonly>
            <button class="btn btn-secondary" style="padding:0.5rem 0.85rem;flex-shrink:0;" onclick="regenerateResetPassword()" title="Generar otra"><i class="fa-solid fa-arrows-rotate"></i></button>
            <button class="btn btn-secondary" style="padding:0.5rem 0.85rem;flex-shrink:0;" onclick="copyResetPassword()" title="Copiar"><i class="fa-solid fa-copy"></i></button>
          </div>
          <label style="display:flex;align-items:center;gap:0.4rem;margin-top:0.75rem;font-size:0.85rem;cursor:pointer;font-weight:400;">
            <input type="checkbox" id="resetPasswordCustom" onchange="toggleCustomPassword()"> Escribir contraseña manualmente
          </label>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;" onclick="confirmResetPassword()"><i class="fa-solid fa-key"></i> Actualizar Contraseña</button>
      </div>
    </div>

    <!-- Neuro Screener Modal -->
    <div class="modal-overlay" id="neuroScreenerModal" onclick="if(event.target===this)closeModal('neuroScreenerModal')">
      <div class="modal-content" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header" style="flex-shrink:0;">
          <div>
            <h2 id="neuroModalTitle" style="margin:0;font-size:1.2rem;"><i class="fa-solid fa-brain" style="color:var(--primary);margin-right:0.5rem;"></i>Evaluación</h2>
            <p id="neuroModalSubtitle" style="margin:0.2rem 0 0;font-size:0.82rem;color:var(--text-light);"></p>
          </div>
          <button class="close-btn" onclick="closeModal('neuroScreenerModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="neuroModalError" style="display:none;background:#fee2e2;color:#dc2626;padding:0.6rem 0.9rem;border-radius:8px;margin:0.5rem 1.5rem;font-size:0.85rem;flex-shrink:0;"></div>
        <div id="neuroModalBody" style="overflow-y:auto;flex:1;padding:0 1.5rem;"></div>
        <div style="flex-shrink:0;padding:1rem 1.5rem;border-top:1px solid #f1f5f9;">
          <div class="form-group" style="margin-bottom:0.75rem;">
            <label style="font-size:0.85rem;">Notas clínicas (opcional)</label>
            <input type="text" id="neuroModalNotes" class="form-control" style="font-size:0.9rem;" placeholder="Observaciones sobre la evaluación…">
          </div>
          <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="closeModal('neuroScreenerModal')">Cancelar</button>
            <button class="btn btn-primary" onclick="confirmNeuroScreener()">
              <i class="fa-solid fa-check"></i> Guardar evaluación
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Doctor Book Appointment Modal -->
    <div class="modal-overlay" id="dcBookModal" onclick="if(event.target===this)closeModal('dcBookModal')">
      <div class="modal-content" style="max-width:440px;">
        <div class="modal-header">
          <h2><i class="fa-regular fa-calendar-plus" style="color:var(--primary);margin-right:0.5rem;"></i>Nueva Cita</h2>
          <button class="close-btn" onclick="closeModal('dcBookModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:1rem;" id="dcBookDateLabel"></p>
        <div id="dcBookError" style="display:none;background:#fee2e2;color:#dc2626;padding:0.6rem 0.9rem;border-radius:8px;margin-bottom:0.8rem;font-size:0.85rem;"></div>
        <div class="form-group">
          <label>Turno *</label>
          <select id="dcBookTime" class="form-control"></select>
        </div>
        <div class="form-group">
          <label>Paciente <small style="color:#94a3b8;font-weight:400;">(opcional)</small></label>
          <select id="dcBookPatient" class="form-control"></select>
        </div>
        <div class="form-group">
          <label>Notas / Motivo</label>
          <input type="text" id="dcBookNotes" class="form-control" placeholder="Motivo de la consulta o del bloqueo (opcional)">
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;">
          <button class="btn btn-secondary" onclick="closeModal('dcBookModal')">Cancelar</button>
          <button class="btn btn-primary" onclick="confirmDcBook()"><i class="fa-solid fa-check"></i> Confirmar</button>
        </div>
      </div>
    </div>

    <!-- Apply Vaccine Modal -->
    <div class="modal-overlay" id="applyVaccineModal" onclick="if(event.target===this)closeModal('applyVaccineModal')">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h2><i class="fa-solid fa-syringe" style="color:var(--primary);margin-right:0.5rem;"></i>Aplicar Vacuna</h2>
          <button class="close-btn" onclick="closeModal('applyVaccineModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <p style="color:var(--primary);font-weight:600;margin-bottom:1rem;" id="applyVaccTitle"></p>
        <div id="applyVaccError" style="display:none;background:#fee2e2;color:#dc2626;padding:0.6rem 0.9rem;border-radius:8px;margin-bottom:0.8rem;font-size:0.85rem;"></div>
        <div class="form-group">
          <label>Fecha de Aplicación *</label>
          <input type="date" id="applyVaccDate" class="form-control">
        </div>
        <div class="form-group">
          <label>Número de Lote</label>
          <input type="text" id="applyVaccLot" class="form-control" placeholder="Ej. A12345B">
        </div>
        <div class="form-group">
          <label>Notas</label>
          <input type="text" id="applyVaccNotes" class="form-control" placeholder="Observaciones opcionales">
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;">
          <button class="btn btn-secondary" onclick="closeModal('applyVaccineModal')">Cancelar</button>
          <button class="btn btn-primary" onclick="confirmApplyVaccine()">
            <i class="fa-solid fa-check"></i> Confirmar
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Expediente Modal -->
    <div class="modal-overlay" id="editExpedienteModal" onclick="if(event.target===this)closeModal('editExpedienteModal')">
      <div class="modal-content" style="max-width:900px;max-height:90vh;overflow-y:auto;">
        <div class="modal-header"><h2><i class="fa-solid fa-folder-open"></i> Editar Expediente</h2><button class="close-btn" onclick="closeModal('editExpedienteModal')"><i class="fa-solid fa-xmark"></i></button></div>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:1rem;">Actualiza los datos del expediente clínico. Los campos en blanco se mantendrán sin cambios.</p>

        <div id="editExpedienteForm">
          <!-- Ficha de Identificación -->
          <details class="expediente-accordion" open>
            <summary class="expediente-summary"><div><i class="fa-solid fa-id-card" style="color:var(--secondary);"></i> Ficha de Identificación</div><i class="fa-solid fa-chevron-down accordion-icon"></i></summary>
            <div class="expediente-accordion-content">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Nombre completo</label><input type="text" id="ee-new-patient-name" class="form-control"></div>
                <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="ee-patient-birth-date" class="form-control"></div>
                <div class="form-group"><label>Sexo</label>
                  <select id="ee-Sexo" class="form-control"><option value="">—</option><option>Masculino</option><option>Femenino</option></select>
                </div>
                <div class="form-group"><label>CURP</label><input type="text" id="ee-patient-curp" class="form-control" maxlength="18" style="text-transform:uppercase;"></div>
                <div class="form-group"><label>Estado de nacimiento</label><input type="text" id="ee-patient-birth-state" class="form-control"></div>
                <div class="form-group"><label>Ciudad de nacimiento</label><input type="text" id="ee-patient-birth-city" class="form-control"></div>
                <div class="form-group"><label>Nombre de la madre</label><input type="text" id="ee-mom-name" class="form-control"></div>
                <div class="form-group"><label>Nombre del padre</label><input type="text" id="ee-dad-name" class="form-control"></div>
              </div>
            </div>
          </details>

          <!-- Antecedentes Patológicos (DESTACADO con alergias) -->
          <details class="expediente-accordion" open>
            <summary class="expediente-summary" style="background:linear-gradient(135deg,#fef2f2,#fee2e2);">
              <div><i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;"></i> <strong>Antecedentes Patológicos & Alergias</strong></div>
              <i class="fa-solid fa-chevron-down accordion-icon"></i>
            </summary>
            <div class="expediente-accordion-content">
              <div class="form-group"><label style="color:#dc2626;font-weight:600;">⚠ Alergias conocidas</label><input type="text" id="ee-known-allergies" class="form-control" placeholder="Ej. Polen, penicilina, látex... o 'Ninguna'" style="border:2px solid #fca5a5;"></div>
              <div class="form-group"><label>Cirugías o procedimientos previos</label><textarea id="ee-surgery-detail" class="form-control" rows="2" placeholder="Describir cirugías previas, o 'Ninguna'"></textarea></div>
              <div class="form-group"><label>Hospitalizaciones previas</label><textarea id="ee-hosp-detail" class="form-control" rows="2" placeholder="Motivo y duración, o 'Ninguna'"></textarea></div>
              <div class="form-group"><label>Medicamentos crónicos actuales</label><input type="text" id="ee-chronic-meds" class="form-control" placeholder="Ej. Fenobarbital, salbutamol... o 'Ninguno'"></div>
            </div>
          </details>

          <!-- Contexto Familiar -->
          <details class="expediente-accordion">
            <summary class="expediente-summary"><div><i class="fa-solid fa-house-chimney" style="color:var(--secondary);"></i> Contexto Familiar</div><i class="fa-solid fa-chevron-down accordion-icon"></i></summary>
            <div class="expediente-accordion-content">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Escolaridad madre</label><input type="text" id="ee-mom-education" class="form-control"></div>
                <div class="form-group"><label>Escolaridad padre</label><input type="text" id="ee-dad-education" class="form-control"></div>
                <div class="form-group"><label>Ocupación madre</label><input type="text" id="ee-mom-occupation" class="form-control"></div>
                <div class="form-group"><label>Ocupación padre</label><input type="text" id="ee-dad-occupation" class="form-control"></div>
                <div class="form-group"><label>Hermanos mayores</label><input type="number" id="ee-siblings-count" class="form-control" min="0"></div>
                <div class="form-group"><label>Tipo de vivienda</label><input type="text" id="ee-housing-type" class="form-control"></div>
                <div class="form-group"><label>Mascotas</label><input type="text" id="ee-pets" class="form-control"></div>
                <div class="form-group"><label>Fumadores en hogar</label><input type="text" id="ee-smokers-home" class="form-control"></div>
              </div>
            </div>
          </details>

          <!-- Antecedentes Prenatales -->
          <details class="expediente-accordion">
            <summary class="expediente-summary"><div><i class="fa-solid fa-person-pregnant" style="color:var(--secondary);"></i> Antecedentes Prenatales</div><i class="fa-solid fa-chevron-down accordion-icon"></i></summary>
            <div class="expediente-accordion-content">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Edad materna al embarazo</label><input type="number" id="ee-maternal-age" class="form-control"></div>
                <div class="form-group"><label>Número de gestación</label><input type="number" id="ee-gesta-num" class="form-control"></div>
                <div class="form-group"><label>Control prenatal</label><input type="text" id="ee-prenatal-ctrl" class="form-control"></div>
                <div class="form-group"><label>Consultas prenatales</label><input type="number" id="ee-prenatal-visits" class="form-control"></div>
                <div class="form-group"><label>Tabaquismo en embarazo</label><input type="text" id="ee-tobacco-preg" class="form-control"></div>
                <div class="form-group"><label>Alcohol en embarazo</label><input type="text" id="ee-alcohol-preg" class="form-control"></div>
              </div>
              <div class="form-group"><label>Infecciones TORCH</label><input type="text" id="ee-torch" class="form-control"></div>
              <div class="form-group"><label>Complicaciones obstétricas</label><textarea id="ee-obstetric-comp" class="form-control" rows="2"></textarea></div>
            </div>
          </details>

          <!-- Datos Perinatales -->
          <details class="expediente-accordion">
            <summary class="expediente-summary"><div><i class="fa-solid fa-baby" style="color:var(--secondary);"></i> Datos Perinatales</div><i class="fa-solid fa-chevron-down accordion-icon"></i></summary>
            <div class="expediente-accordion-content">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Tipo de parto</label>
                  <select id="ee-delivery-type" class="form-control"><option value="">—</option><option>Vaginal</option><option>Cesárea</option><option>Instrumentado</option></select>
                </div>
                <div class="form-group"><label>Semanas de gestación</label><input type="number" id="ee-gestational-weeks" class="form-control" min="22" max="44"></div>
                <div class="form-group"><label>Peso al nacer (kg)</label><input type="number" id="ee-birth-weight-kg" class="form-control" step="0.01"></div>
                <div class="form-group"><label>Talla al nacer (cm)</label><input type="number" id="ee-birth-height-cm" class="form-control" step="0.1"></div>
                <div class="form-group"><label>PC al nacer (cm)</label><input type="number" id="ee-birth-head-cm" class="form-control" step="0.1"></div>
                <div class="form-group"><label>Apgar 1 min</label><input type="number" id="ee-apgar-1" class="form-control" min="0" max="10"></div>
                <div class="form-group"><label>Apgar 5 min</label><input type="number" id="ee-apgar-5" class="form-control" min="0" max="10"></div>
                <div class="form-group"><label>UCI neonatal</label><input type="text" id="ee-nicu-stay" class="form-control"></div>
                <div class="form-group"><label>Días en UCI</label><input type="number" id="ee-nicu-days" class="form-control"></div>
                <div class="form-group"><label>Fototerapia</label><input type="text" id="ee-phototherapy" class="form-control"></div>
                <div class="form-group" style="grid-column:span 2;"><label>Tamiz neonatal</label><input type="text" id="ee-neonatal-screening" class="form-control"></div>
              </div>
            </div>
          </details>

          <!-- Alimentación -->
          <details class="expediente-accordion">
            <summary class="expediente-summary"><div><i class="fa-solid fa-utensils" style="color:var(--secondary);"></i> Alimentación</div><i class="fa-solid fa-chevron-down accordion-icon"></i></summary>
            <div class="expediente-accordion-content">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                <div class="form-group"><label>Lactancia materna</label>
                  <select id="ee-breastfed" class="form-control"><option value="">—</option><option>Sí</option><option>No</option></select>
                </div>
                <div class="form-group"><label>Meses de lactancia</label><input type="number" id="ee-breastfed-months" class="form-control" min="0" max="36"></div>
                <div class="form-group"><label>Tipo de alimentación</label>
                  <select id="ee-feeding-type" class="form-control">
                    <option value="">—</option><option>Leche materna exclusiva</option><option>Fórmula exclusiva</option>
                    <option>Lactancia mixta</option><option>Ablactación iniciada</option>
                    <option>Alimentación complementaria</option><option>Dieta familiar</option>
                  </select>
                </div>
              </div>
            </div>
          </details>
        </div>

        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--bg-color);">
          <button class="btn btn-secondary" onclick="closeModal('editExpedienteModal')">Cancelar</button>
          <button class="btn btn-primary" onclick="saveExpediente()"><i class="fa-solid fa-floppy-disk"></i> Guardar Cambios</button>
        </div>
      </div>
    </div>
  `;
}

// === Onboarding ===
// Helpers para step 3 (antecedentes heredofamiliares)
if (!window.familyHistoryData) window.familyHistoryData = [];

window.toggleFHCondition = function(condition, checkbox) {
  if (checkbox.checked) {
    if (!window.familyHistoryData.find(r => r.condition === condition)) {
      window.familyHistoryData.push({ condition, relationship: '', notes: '' });
    }
  } else {
    window.familyHistoryData = window.familyHistoryData.filter(r => r.condition !== condition);
  }
  renderFHRelatives(condition);
};

window.updateFHRelationship = function(condition, select) {
  const row = window.familyHistoryData.find(r => r.condition === condition);
  if (row) row.relationship = Array.from(select.selectedOptions).map(o => o.value).join(', ');
};

function renderFHRelatives(condition) {
  const container = document.getElementById('fh-rel-' + condition.replace(/\s/g,'_'));
  if (!container) return;
  const row = window.familyHistoryData.find(r => r.condition === condition);
  if (!row) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = `
    <div style="margin-top:0.5rem;">
      <label style="font-size:0.85rem;color:var(--text-light);margin-bottom:0.3rem;display:block;">Familiar(es) afectado(s) — mantén Ctrl para seleccionar varios</label>
      <select multiple class="form-control" style="height:90px;font-size:0.9rem;" onchange="updateFHRelationship('${condition}', this)">
        ${['Padre','Madre','Abuelo paterno','Abuela paterna','Abuelo materno','Abuela materna','Hermano/a','Tío/a','Primo/a','Otro'].map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
    </div>`;
}

function renderOnboarding() {
  const totalSteps = 7;
  const stepTitles = [
    'Ficha de Identificación',
    'Contexto Familiar',
    'Antecedentes Heredofamiliares',
    'Antecedentes Prenatales',
    'Datos Perinatales',
    'Antecedentes Personales',
    'Acceso del Tutor'
  ];
  const stepIcons = ['fa-id-card','fa-house-chimney','fa-dna','fa-person-pregnant','fa-baby','fa-heart-pulse','fa-key'];
  let content = '';

  if (currentOnboardingStep === 1) {
    // ── Ficha de Identificación ──────────────────────────────────
    content = `
      <p style="color:var(--text-light);margin-bottom:1.5rem;font-size:0.95rem;">Campos con <span style="color:#ef4444;">*</span> son obligatorios.</p>
      <div class="form-group">
        <label>Nombre completo del paciente <span style="color:#ef4444;">*</span></label>
        <input type="text" id="new-patient-name" class="form-control" placeholder="Ej. Juan Carlos Pérez Gómez" required>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Fecha de nacimiento <span style="color:#ef4444;">*</span></label>
          <input type="date" id="patient-birth-date" name="patient-birth-date" class="form-control" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Sexo <span style="color:#ef4444;">*</span></label>
          <select name="Sexo" class="form-control" required>
            <option value="">Selecciona...</option>
            <option>Masculino</option>
            <option>Femenino</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Estado de nacimiento</label>
          <input type="text" id="patient-birth-state" class="form-control" placeholder="Ej. Jalisco">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Municipio/Ciudad</label>
          <input type="text" id="patient-birth-city" class="form-control" placeholder="Ej. Guadalajara">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Nombre de la mamá</label>
          <input type="text" id="mom-name" class="form-control" placeholder="Ej. María Gómez">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Nombre del papá</label>
          <input type="text" id="dad-name" class="form-control" placeholder="Ej. Carlos Pérez">
        </div>
      </div>
      <div class="form-group">
        <label>CURP (opcional)</label>
        <input type="text" id="patient-curp" class="form-control" placeholder="18 caracteres" maxlength="18" style="text-transform:uppercase;">
      </div>`;

  } else if (currentOnboardingStep === 2) {
    // ── Contexto Familiar ─────────────────────────────────────────
    content = `
      <h4 style="color:var(--primary);margin-bottom:1rem;">Escolaridad y Ocupación</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Escolaridad de la mamá</label>
          <select id="mom-education" class="form-control">
            <option value="">Selecciona...</option>
            <option>Sin estudios</option><option>Primaria</option><option>Secundaria</option>
            <option>Preparatoria</option><option>Técnico/Vocacional</option>
            <option>Licenciatura</option><option>Posgrado</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Escolaridad del papá</label>
          <select id="dad-education" class="form-control">
            <option value="">Selecciona...</option>
            <option>Sin estudios</option><option>Primaria</option><option>Secundaria</option>
            <option>Preparatoria</option><option>Técnico/Vocacional</option>
            <option>Licenciatura</option><option>Posgrado</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Ocupación de la mamá</label>
          <input type="text" id="mom-occupation" class="form-control" placeholder="Ej. Enfermera">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Ocupación del papá</label>
          <input type="text" id="dad-occupation" class="form-control" placeholder="Ej. Ingeniero">
        </div>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:1.5rem 0;">
      <h4 style="color:var(--primary);margin-bottom:1rem;">Composición del Hogar</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Número de hermanos</label>
          <input type="number" id="siblings-count" class="form-control" min="0" placeholder="0">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Tipo de vivienda</label>
          <select id="housing-type" class="form-control">
            <option value="">Selecciona...</option>
            <option>Propia</option><option>Rentada</option>
            <option>Prestada/Familiar</option><option>Otro</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>¿Hay mascotas en casa?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="pets" value="Sí"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="pets" value="No"> No</label>
        </div>
      </div>
      <div class="form-group">
        <label>¿Alguien fuma en el hogar?</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="smokers-home" value="Sí"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="smokers-home" value="No"> No</label>
        </div>
      </div>`;

  } else if (currentOnboardingStep === 3) {
    // ── Antecedentes Heredofamiliares ─────────────────────────────
    const conditions = [
      'Diabetes mellitus','Hipertensión arterial','Cardiopatía coronaria',
      'Asma / Atopia','Obesidad / Sobrepeso','Cáncer',
      'Autismo / TEA','Síndrome de Down / Cromosómico',
      'Epilepsia / Convulsiones','Enfermedad renal crónica',
      'Artritis / Enf. autoinmune','Salud mental (depresión, esquizofrenia)',
    ];
    const currentChecked = new Set(window.familyHistoryData.map(r => r.condition));
    content = `
      <p style="color:var(--text-light);font-size:0.9rem;margin-bottom:1.5rem;">Marca las condiciones presentes en la familia y selecciona quién las padece. Este paso es opcional.</p>
      <div style="display:flex;flex-direction:column;gap:0.8rem;">
        ${conditions.map(c => {
          const safeId = c.replace(/[\s/()]/g,'_');
          const isChecked = currentChecked.has(c);
          return `
          <div style="background:#f8fafc;border-radius:10px;padding:0.9rem 1.1rem;border:1px solid ${isChecked ? 'var(--primary)' : '#e2e8f0'};">
            <label style="display:flex;align-items:center;gap:0.7rem;cursor:pointer;font-weight:500;">
              <input type="checkbox" value="${c}" ${isChecked ? 'checked' : ''} onchange="toggleFHCondition('${c}', this)" style="width:16px;height:16px;accent-color:var(--primary);">
              ${c}
            </label>
            <div id="fh-rel-${safeId}" style="display:${isChecked ? 'block' : 'none'};"></div>
          </div>`;
        }).join('')}
      </div>`;

  } else if (currentOnboardingStep === 4) {
    // ── Antecedentes Prenatales ────────────────────────────────────
    content = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Número de gestación</label>
          <select id="gesta-num" class="form-control">
            <option value="">Selecciona...</option>
            <option value="1">Primero (primogénito)</option>
            <option value="2">Segundo</option>
            <option value="3">Tercero</option>
            <option value="4+">Cuarto o más</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Edad de la mamá al embarazo</label>
          <input type="number" id="maternal-age" class="form-control" min="14" max="55" placeholder="Años">
        </div>
      </div>
      <div class="form-group">
        <label>Control prenatal</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;flex-wrap:wrap;align-items:center;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prenatal-ctrl" value="Sí" onchange="document.getElementById('prenatal-visits-grp').style.display='flex'"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prenatal-ctrl" value="No" onchange="document.getElementById('prenatal-visits-grp').style.display='none'"> No</label>
          <div id="prenatal-visits-grp" style="display:none;align-items:center;gap:0.5rem;">
            <label style="font-weight:400;white-space:nowrap;">Número de consultas:</label>
            <input type="number" id="prenatal-visits" class="form-control" min="1" max="20" placeholder="Ej. 8" style="width:90px;">
          </div>
        </div>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:1.5rem 0;">
      <h4 style="color:var(--primary);margin-bottom:1rem;">Exposiciones durante el Embarazo</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Tabaquismo</label>
          <div style="display:flex;gap:1.5rem;margin-top:0.5rem;">
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="tobacco-preg" value="Sí"> Sí</label>
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="tobacco-preg" value="No"> No</label>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Consumo de alcohol</label>
          <div style="display:flex;gap:1.5rem;margin-top:0.5rem;">
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="alcohol-preg" value="Sí"> Sí</label>
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="alcohol-preg" value="No"> No</label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Infecciones TORCH (marca si hubo)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.6rem;">
          ${['Toxoplasma','Rubeola','Citomegalovirus (CMV)','Herpes','Sífilis','VIH / SIDA','Hepatitis B','Otra infección'].map(t =>
            `<label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;padding:0.4rem;border-radius:6px;background:#f8fafc;">
              <input type="checkbox" name="torch" value="${t}" style="accent-color:var(--primary);"> ${t}
            </label>`
          ).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Complicaciones obstétricas</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.6rem;">
          ${['Ninguna','Preeclampsia','Diabetes gestacional','Placenta previa','RPM (ruptura prematura)','Amenaza de aborto','Otra'].map(c =>
            `<label style="display:flex;align-items:center;gap:0.5rem;font-weight:400;cursor:pointer;padding:0.4rem;border-radius:6px;background:#f8fafc;">
              <input type="checkbox" name="obstetric-comp" value="${c}" style="accent-color:var(--primary);"> ${c}
            </label>`
          ).join('')}
        </div>
      </div>`;

  } else if (currentOnboardingStep === 5) {
    // ── Datos Perinatales ─────────────────────────────────────────
    content = `
      <div class="form-group">
        <label>Tipo de parto <span style="color:#ef4444;">*</span></label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;flex-wrap:wrap;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="delivery-type" value="Vaginal" required> Vaginal</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="delivery-type" value="Cesárea"> Cesárea</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="delivery-type" value="Instrumentado"> Instrumentado (fórceps/vacuum)</label>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Semanas de gestación <span style="color:#ef4444;">*</span></label>
          <input type="number" id="gestational-weeks" class="form-control" min="22" max="44" placeholder="Ej. 39" required>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Peso al nacer (kg)</label>
          <input type="number" id="birth-weight-kg" step="0.01" class="form-control" placeholder="Ej. 3.25">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Talla al nacer (cm)</label>
          <input type="number" id="birth-height-cm" step="0.1" class="form-control" placeholder="Ej. 50">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>PC al nacer (cm)</label>
          <input type="number" id="birth-head-cm" step="0.1" class="form-control" placeholder="Ej. 34">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Apgar 1 min</label>
          <input type="number" id="apgar-1" class="form-control" min="0" max="10" placeholder="0–10">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Apgar 5 min</label>
          <input type="number" id="apgar-5" class="form-control" min="0" max="10" placeholder="0–10">
        </div>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:1.5rem 0;">
      <h4 style="color:var(--primary);margin-bottom:1rem;">Estancia Neonatal</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label>UCI / UCIN neonatal</label>
          <div style="display:flex;gap:1.5rem;margin-top:0.5rem;align-items:center;">
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="nicu-stay" value="Sí" onchange="document.getElementById('nicu-days-grp').style.display='flex'"> Sí</label>
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="nicu-stay" value="No" onchange="document.getElementById('nicu-days-grp').style.display='none'"> No</label>
            <div id="nicu-days-grp" style="display:none;align-items:center;gap:0.5rem;">
              <input type="number" id="nicu-days" class="form-control" min="1" placeholder="Días" style="width:90px;">
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Fototerapia (ictericia)</label>
          <div style="display:flex;gap:1.5rem;margin-top:0.5rem;">
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="phototherapy" value="Sí"> Sí</label>
            <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="phototherapy" value="No"> No</label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Tamiz neonatal realizado</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="neonatal-screening" value="Sí"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="neonatal-screening" value="No"> No</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="neonatal-screening" value="No sé"> No sé</label>
        </div>
      </div>`;

  } else if (currentOnboardingStep === 6) {
    // ── Antecedentes Personales ────────────────────────────────────
    content = `
      <h4 style="color:var(--primary);margin-bottom:1rem;">Alimentación</h4>
      <div class="form-group">
        <label>Lactancia materna</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="breastfed" value="Sí" onchange="document.getElementById('bf-months-grp').style.display='flex'"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="breastfed" value="No" onchange="document.getElementById('bf-months-grp').style.display='none'"> No</label>
          <div id="bf-months-grp" style="display:none;align-items:center;gap:0.5rem;">
            <label style="font-weight:400;white-space:nowrap;">Meses de lactancia:</label>
            <input type="number" id="breastfed-months" class="form-control" min="0" max="36" placeholder="meses" style="width:90px;">
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>Tipo de alimentación actual</label>
        <select id="feeding-type" class="form-control">
          <option value="">Selecciona...</option>
          <option>Leche materna exclusiva</option>
          <option>Fórmula exclusiva</option>
          <option>Lactancia mixta</option>
          <option>Ablactación iniciada</option>
          <option>Alimentación complementaria</option>
          <option>Dieta familiar</option>
        </select>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:1.5rem 0;">
      <h4 style="color:var(--primary);margin-bottom:1rem;">Antecedentes Patológicos</h4>
      <div class="form-group">
        <label>Alergias conocidas</label>
        <input type="text" id="known-allergies" class="form-control" placeholder="Ej. Polen, penicilina, látex... o 'Ninguna'">
      </div>
      <div class="form-group">
        <label>Cirugías o procedimientos previos</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prev-surgery" value="Sí" onchange="document.getElementById('surgery-detail').style.display='block'"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prev-surgery" value="No" onchange="document.getElementById('surgery-detail').style.display='none'"> No</label>
        </div>
        <textarea id="surgery-detail" class="form-control" rows="2" placeholder="Describir..." style="display:none;margin-top:0.5rem;"></textarea>
      </div>
      <div class="form-group">
        <label>Hospitalizaciones previas</label>
        <div style="display:flex;gap:2rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap;">
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prev-hosp" value="Sí" onchange="document.getElementById('hosp-detail').style.display='block'"> Sí</label>
          <label style="font-weight:400;cursor:pointer;display:flex;align-items:center;gap:0.5rem;"><input type="radio" name="prev-hosp" value="No" onchange="document.getElementById('hosp-detail').style.display='none'"> No</label>
        </div>
        <textarea id="hosp-detail" class="form-control" rows="2" placeholder="Motivo y duración..." style="display:none;margin-top:0.5rem;"></textarea>
      </div>
      <div class="form-group">
        <label>Medicamentos crónicos actuales</label>
        <input type="text" id="chronic-meds" class="form-control" placeholder="Ej. Fenobarbital, salbutamol... o 'Ninguno'">
      </div>`;

  } else if (currentOnboardingStep === 7) {
    // ── Acceso Tutor ──────────────────────────────────────────────
    content = `
      <div style="background:var(--primary-light);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
        <p style="color:var(--primary);font-weight:600;margin-bottom:0.5rem;"><i class="fa-solid fa-circle-info"></i> ¿Cómo funciona el acceso del tutor?</p>
        <p style="color:var(--text-dark);font-size:0.9rem;margin:0;">Si proporcionas un correo se crea una cuenta para el tutor (padre/madre) con una contraseña temporal. Podrá ver el expediente, el historial de consultas y solicitar citas.</p>
      </div>
      <div class="form-group">
        <label>Correo electrónico del tutor</label>
        <input type="email" id="tutorEmail" class="form-control" placeholder="ej. madre@correo.com">
        <p style="color:var(--text-light);font-size:0.85rem;margin-top:0.4rem;">Deja vacío si no deseas crear acceso de tutor ahora.</p>
      </div>`;
  }

  // Renderizar relaciones de family history después de next tick
  setTimeout(() => {
    window.familyHistoryData.forEach(r => {
      const safeId = r.condition.replace(/[\s/()]/g,'_');
      const container = document.getElementById('fh-rel-' + safeId);
      if (container && container.innerHTML === '') renderFHRelatives(r.condition);
    });
  }, 0);

  return `
    <div class="onboarding-view animate-fade-in">
      <div class="onboarding-header">
        <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:0.5rem;">
          <div style="width:42px;height:42px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid ${stepIcons[currentOnboardingStep-1]}" style="color:white;font-size:1.1rem;"></i>
          </div>
          <h1 style="font-size:1.8rem;margin:0;">${stepTitles[currentOnboardingStep-1]}</h1>
        </div>
        <p style="color:var(--text-light);font-size:0.95rem;margin-bottom:1.5rem;">Paso ${currentOnboardingStep} de ${totalSteps}</p>
        <div class="progress-bar-container"><div class="progress-bar" style="width:${(currentOnboardingStep/totalSteps)*100}%"></div></div>
        <div style="display:flex;gap:0.3rem;margin-top:0.6rem;">
          ${Array.from({length:totalSteps},(_,i)=>`<div style="flex:1;height:4px;border-radius:2px;background:${i<currentOnboardingStep?'var(--primary)':'#e2e8f0'};transition:background 0.3s;"></div>`).join('')}
        </div>
      </div>
      <div class="onboarding-content">${content}</div>
      <div class="onboarding-footer">
        <button class="btn btn-secondary" onclick="prevOnboardingStep()" ${currentOnboardingStep===1?'disabled style="opacity:0.5;cursor:not-allowed;"':''}>
          <i class="fa-solid fa-arrow-left"></i> Anterior
        </button>
        ${currentOnboardingStep < totalSteps
          ? `<button class="btn btn-primary" onclick="nextOnboardingStep()">Siguiente <i class="fa-solid fa-arrow-right"></i></button>`
          : `<button class="btn btn-primary" style="background-color:var(--secondary);color:var(--text-dark);" onclick="finishOnboarding()"><i class="fa-solid fa-check"></i> Guardar Expediente</button>`}
      </div>
    </div>
  `;
}

// === Helpers ===
// Fecha de consulta: ISO (YYYY-MM-DD) → "13 de julio de 2026".
// Consultas antiguas ya guardadas como texto formateado pasan intactas.
function formatConsultDate(dateStr) {
  if (!dateStr) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

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
    // v3 (Fase A)
    'new-patient-name':'Nombre','patient-birth-date':'Fecha de nacimiento','patient-birth-state':'Estado de nacimiento',
    'patient-birth-city':'Ciudad/Municipio','mom-name':'Nombre de la madre','dad-name':'Nombre del padre','patient-curp':'CURP',
    'mom-education':'Escolaridad mamá','dad-education':'Escolaridad papá','mom-occupation':'Ocupación mamá','dad-occupation':'Ocupación papá',
    'siblings-count':'Hermanos mayores','housing-type':'Tipo de vivienda','pets':'Mascotas en casa','smokers-home':'Fumadores en hogar',
    'maternal-age':'Edad materna (años)','gesta-num':'Número de gestación','prenatal-ctrl':'Control prenatal','prenatal-visits':'Consultas prenatales',
    'tobacco-preg':'Tabaquismo durante embarazo','alcohol-preg':'Alcohol durante embarazo','torch':'Infecciones TORCH','obstetric-comp':'Complicaciones obstétricas',
    'delivery-type':'Tipo de parto','gestational-weeks':'Semanas de gestación','birth-weight-kg':'Peso al nacer (kg)',
    'birth-height-cm':'Talla al nacer (cm)','birth-head-cm':'PC al nacer (cm)',
    'apgar-1':'Apgar 1 min','apgar-5':'Apgar 5 min','nicu-stay':'UCI neonatal','nicu-days':'Días en UCI','phototherapy':'Fototerapia',
    'neonatal-screening':'Tamiz neonatal','breastfed':'Lactancia materna','breastfed-months':'Meses de lactancia',
    'feeding-type':'Tipo de alimentación','known-allergies':'Alergias conocidas','prev-surgery':'Cirugías previas',
    'surgery-detail':'Detalle cirugías','prev-hosp':'Hospitalizaciones','hosp-detail':'Detalle hospitalizaciones','chronic-meds':'Medicamentos crónicos',
    // Legado (v2)
    'Fecha de nacimiento':'Fecha de nacimiento','Sexo':'Sexo','tipoParto':'Tipo de parto','apgarScore':'Apgar',
    'Peso':'Peso al nacer (kg)','Talla':'Talla al nacer (cm)','PC':'PC al nacer (cm)',
  };
  if (known[key]) return known[key];
  return key.replace(/^Ej\.\s*/i,'').replace(/[-_]/g,' ').replace(/[:?¿]/g,'').trim().replace(/^\w/,c=>c.toUpperCase());
}

function categorizeOnboardingData(data) {
  // Categorías v3 (Fase A)
  const cats = {
    'Ficha de Identificación':[],
    'Contexto Familiar':[],
    'Antecedentes Prenatales':[],
    'Datos Perinatales':[],
    'Antecedentes Personales':[],
    'Otros Registros':[]
  };
  const map = {
    'new-patient-name':1,'patient-birth-date':1,'Sexo':1,'patient-birth-state':1,'patient-birth-city':1,'mom-name':1,'dad-name':1,'patient-curp':1,
    'mom-education':2,'dad-education':2,'mom-occupation':2,'dad-occupation':2,'siblings-count':2,'housing-type':2,'pets':2,'smokers-home':2,
    'maternal-age':3,'gesta-num':3,'prenatal-ctrl':3,'prenatal-visits':3,'tobacco-preg':3,'alcohol-preg':3,'torch':3,'obstetric-comp':3,
    'delivery-type':4,'gestational-weeks':4,'birth-weight-kg':4,'birth-height-cm':4,'birth-head-cm':4,'apgar-1':4,'apgar-5':4,'nicu-stay':4,'nicu-days':4,'phototherapy':4,'neonatal-screening':4,
    'breastfed':5,'breastfed-months':5,'feeding-type':5,'known-allergies':5,'prev-surgery':5,'surgery-detail':5,'prev-hosp':5,'hosp-detail':5,'chronic-meds':5,
    // Legado (expedientes anteriores)
    'Fecha de nacimiento':1,'tipoParto':4,'apgarScore':4,'Peso':4,'Talla':4,'PC':4,
  };
  const titles = ['Otros Registros','Ficha de Identificación','Contexto Familiar','Antecedentes Prenatales','Datos Perinatales','Antecedentes Personales'];
  Object.entries(data).forEach(([k, v]) => {
    if (!v || (typeof v === 'string' && v.trim() === '') || k === 'tutorEmail') return;
    const catIdx = map[k] || 0;
    const catName = titles[catIdx];
    if (cats[catName]) cats[catName].push({ key: k, value: v });
  });
  return cats;
}

// ── WHO 2006 Growth Reference Data ────────────────────────────────────────────
// Formato: [P3, P15, P50, P85, P97] a cada edad (meses)
const WHO_AGES_W = [0,1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,24,30,36,42,48,54,60];
const WHO_W = {
  F: [[2.4,2.8,3.2,3.7,4.2],[3.0,3.4,4.0,4.6,5.2],[3.8,4.3,5.1,5.8,6.5],[4.5,5.1,5.8,6.6,7.4],[5.0,5.6,6.4,7.3,8.2],[5.4,6.1,6.9,7.8,8.8],[5.7,6.4,7.3,8.3,9.4],[6.0,6.7,7.6,8.7,9.8],[6.3,7.0,7.9,9.0,10.2],[6.6,7.4,8.4,9.6,10.8],[6.9,7.7,8.7,9.9,11.2],[7.2,8.1,9.2,10.5,11.9],[7.5,8.4,9.6,10.9,12.4],[8.0,9.0,10.3,11.8,13.4],[8.4,9.5,10.9,12.5,14.3],[8.8,10.0,11.4,13.1,15.0],[9.3,10.5,12.0,13.8,15.8],[10.1,11.4,13.0,14.9,17.1],[10.8,12.1,13.9,15.9,18.4],[11.4,12.8,14.7,16.9,19.6],[12.0,13.5,15.5,17.9,20.8],[12.6,14.2,16.3,18.8,21.9],[13.2,14.9,17.2,19.8,23.2]],
  M: [[2.5,2.9,3.3,3.9,4.4],[3.4,3.9,4.5,5.1,5.7],[4.3,5.0,5.6,6.4,7.1],[5.0,5.7,6.4,7.2,8.0],[5.6,6.3,7.0,7.9,8.8],[6.0,6.7,7.5,8.4,9.3],[6.4,7.1,7.9,8.9,9.9],[6.7,7.4,8.3,9.3,10.3],[7.0,7.7,8.6,9.7,10.8],[7.1,8.0,9.0,10.2,11.4],[7.5,8.4,9.4,10.6,11.8],[7.8,8.7,9.8,11.0,12.3],[8.1,9.1,10.2,11.5,12.9],[8.9,9.9,11.2,12.6,14.1],[9.4,10.5,11.8,13.3,14.9],[9.8,11.0,12.4,14.0,15.7],[10.2,11.4,12.9,14.6,16.4],[10.9,12.2,13.8,15.6,17.5],[11.6,13.0,14.7,16.6,18.8],[12.1,13.6,15.5,17.5,19.9],[12.7,14.2,16.2,18.3,20.9],[13.3,14.9,16.9,19.2,22.0],[13.9,15.5,17.7,20.1,23.1]]
};
const WHO_AGES_H = [0,1,2,3,4,5,6,7,8,9,10,11,12,15,18,21,24,30,36,42,48,54,60];
const WHO_H = {
  F: [[45.6,47.2,49.1,50.9,52.9],[50.2,52.0,53.7,55.6,57.4],[53.2,55.1,57.1,59.0,61.0],[56.0,57.7,59.8,61.9,63.9],[58.0,59.9,62.1,64.3,66.4],[59.9,61.8,64.0,66.2,68.5],[61.5,63.5,65.7,68.0,70.3],[62.9,65.0,67.3,69.7,72.0],[64.3,66.5,68.7,71.1,73.6],[65.3,67.4,70.1,72.6,75.0],[66.5,68.7,71.5,74.0,76.7],[67.7,69.9,72.8,75.5,78.2],[68.9,71.2,74.0,76.8,79.7],[72.0,74.3,77.5,80.7,84.0],[74.9,77.3,80.7,84.2,87.7],[77.5,80.1,83.7,87.3,91.1],[79.3,81.7,85.5,89.4,93.1],[83.6,86.2,90.2,94.1,98.4],[88.7,91.4,95.1,98.7,102.7],[93.0,95.8,99.7,103.7,107.8],[96.4,99.4,103.3,107.2,111.3],[100.0,103.1,107.2,111.4,115.7],[103.7,106.9,111.2,115.5,119.9]],
  M: [[46.1,47.8,49.9,51.8,53.7],[50.8,52.8,54.7,56.6,58.5],[54.4,56.4,58.4,60.4,62.4],[57.3,59.4,61.4,63.5,65.5],[59.7,61.8,63.9,65.9,68.0],[61.7,63.8,65.9,68.0,70.1],[63.3,65.5,67.6,69.8,71.9],[64.8,67.0,69.2,71.4,73.7],[66.2,68.4,70.7,73.0,75.4],[68.0,70.1,72.3,74.5,76.8],[69.2,71.4,73.7,76.0,78.3],[70.4,72.7,75.0,77.4,79.8],[71.7,73.9,76.1,78.3,80.5],[75.0,77.3,79.7,82.3,84.9],[77.5,79.9,82.3,84.8,87.5],[79.6,82.0,84.7,87.5,90.5],[82.5,85.1,88.0,90.9,93.9],[87.4,90.1,93.0,96.1,99.2],[89.7,92.4,95.5,98.7,101.9],[94.4,97.2,100.4,103.7,107.0],[97.6,100.6,103.9,107.1,110.4],[101.0,104.1,107.6,111.1,114.6],[103.1,106.3,110.0,113.6,117.3]]
};

// Interpola linealmente en la tabla WHO para una edad dada en meses
function whoInterp(table, ageMonths) {
  const ages = table === WHO_W.F || table === WHO_W.M ? WHO_AGES_W : WHO_AGES_H;
  if (ageMonths <= ages[0]) return table[0];
  if (ageMonths >= ages[ages.length-1]) return table[table.length-1];
  let i = ages.findIndex(a => a > ageMonths) - 1;
  const t = (ageMonths - ages[i]) / (ages[i+1] - ages[i]);
  return table[i].map((v,j) => +(v + t*(table[i+1][j]-v)).toFixed(2));
}

// Estima percentil dada una medición y los [P3,P15,P50,P85,P97] interpolados
function estimatePercentile(val, pts) {
  const [p3,p15,p50,p85,p97] = pts;
  if (val <= p3)  return `↓P3 (muy bajo)`;
  if (val >= p97) return `↑P97 (muy alto)`;
  const segs = [[p3,p15,3,15],[p15,p50,15,50],[p50,p85,50,85],[p85,p97,85,97]];
  for (const [lo,hi,plo,phi] of segs) {
    if (val >= lo && val <= hi) {
      const p = Math.round(plo + (val-lo)/(hi-lo)*(phi-plo));
      return `P${p}`;
    }
  }
  return '–';
}

// Z-score simplificado (basado en interpolación entre percentiles WHO)
function estimateZscore(val, pts) {
  const [p3,p15,p50,p85,p97] = pts;
  // Mapeo aproximado: P3≈-2, P15≈-1, P50=0, P85≈+1, P97≈+2
  const zMap = [[p3,-2],[p15,-1],[p50,0],[p85,1],[p97,2]];
  for (let i=0; i<zMap.length-1; i++) {
    const [v0,z0]=zMap[i], [v1,z1]=zMap[i+1];
    if (val >= v0 && val <= v1) return +((z0 + (val-v0)/(v1-v0)*(z1-z0)).toFixed(2));
  }
  if (val < p3) return +((-2 - (p3-val)/(p15-p3)).toFixed(2));
  return +((2 + (val-p97)/(p97-p85)).toFixed(2));
}

let _growthChartInst = null;
let _growthChartTab  = 'peso'; // 'peso' | 'talla'

window.switchGrowthTab = function(tab) {
  _growthChartTab = tab;
  document.getElementById('chartTabPeso')?.setAttribute('style','padding:0.35rem 1rem;font-size:0.85rem;background:'+(tab==='peso'?'var(--primary);color:white':'var(--primary-light);color:var(--primary)')+';');
  document.getElementById('chartTabTalla')?.setAttribute('style','padding:0.35rem 1rem;font-size:0.85rem;background:'+(tab==='talla'?'var(--primary);color:white':'var(--primary-light);color:var(--primary)')+';');
  if (_growthChartInst) { _growthChartInst.destroy(); _growthChartInst = null; }
  initChart();
};

function initChart() {
  const canvas = document.getElementById('growthChart');
  if (!canvas || !currentPatient) return;
  if (_growthChartInst) { _growthChartInst.destroy(); _growthChartInst = null; }

  const p        = currentPatient;
  const sex      = p.sex === 'Femenino' ? 'F' : 'M';
  const isWeight = _growthChartTab === 'peso';
  const refTable = isWeight ? WHO_W[sex] : WHO_H[sex];
  const unit     = isWeight ? 'kg' : 'cm';
  const label    = isWeight ? 'Peso (kg)' : 'Talla (cm)';

  // ── Datos del paciente ─────────────────────────────────────────────
  const birthDate = p.birth_date;
  const dataPoints = []; // { age, val }

  if (birthDate) {
    const birth = new Date(birthDate + 'T12:00:00');
    const history = [...consultations].reverse();
    history.forEach(h => {
      const val = isWeight ? parseFloat(h.weight) : parseFloat(h.height);
      if (!val || !h.date) return;
      // Intentar parsear fecha — puede ser '21 de mayo de 2026' o 'YYYY-MM-DD'
      let consulDate = new Date(h.date + 'T12:00:00');
      if (isNaN(consulDate.getTime())) {
        // formato 'D de Mes de YYYY'
        const months = {enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
        const m = h.date.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/i);
        if (m) consulDate = new Date(parseInt(m[3]), months[m[2].toLowerCase()], parseInt(m[1]));
      }
      if (isNaN(consulDate.getTime())) return;
      const ageM = (consulDate - birth) / (30.4375 * 86400000);
      if (ageM >= 0 && ageM <= 72) dataPoints.push({ age: ageM, val, date: h.date });
    });
  }

  // ── Generar curvas de referencia OMS ─────────────────────────────
  const ageRange = Array.from({length: 61}, (_,i) => i); // 0-60 meses
  const makeRef = idx => ageRange.map(a => whoInterp(refTable, a)[idx]);
  const [r3,r15,r50,r85,r97] = [0,1,2,3,4].map(i => makeRef(i));

  // ── Z-scores para la leyenda ──────────────────────────────────────
  const zsBox = document.getElementById('growthZscoreBox');
  if (zsBox && dataPoints.length > 0 && birthDate) {
    const last = dataPoints[dataPoints.length - 1];
    const pts  = whoInterp(refTable, last.age);
    const pct  = estimatePercentile(last.val, pts);
    const zsc  = estimateZscore(last.val, pts);
    const zColor = Math.abs(zsc) > 2 ? '#dc2626' : Math.abs(zsc) > 1 ? '#d97706' : '#16a34a';
    zsBox.style.display = 'block';
    zsBox.innerHTML = `<div style="font-weight:600;margin-bottom:0.3rem;color:var(--text-dark);">Última medición</div>
      <div>${label}: <strong>${last.val} ${unit}</strong></div>
      <div>Percentil: <strong style="color:${zColor};">${pct}</strong></div>
      <div>Z-score: <strong style="color:${zColor};">${zsc > 0 ? '+' : ''}${zsc}</strong></div>`;
  } else if (zsBox) { zsBox.style.display = 'none'; }

  // ── Chart.js ──────────────────────────────────────────────────────
  const patientData = dataPoints.map(d => ({ x: +d.age.toFixed(2), y: d.val }));

  _growthChartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels: ageRange,
      datasets: [
        // P3–P97 outer band (fill between)
        { label:'P97', data:r97, borderColor:'rgba(74,222,128,0.3)', borderWidth:1, pointRadius:0, fill:false, tension:0.4 },
        { label:'P85', data:r85, borderColor:'rgba(34,197,94,0.0)',  borderWidth:0, pointRadius:0, fill:'-1', backgroundColor:'rgba(74,222,128,0.15)', tension:0.4 },
        { label:'P15', data:r15, borderColor:'rgba(34,197,94,0.0)',  borderWidth:0, pointRadius:0, fill:'+1', backgroundColor:'rgba(34,197,94,0.25)', tension:0.4 },
        { label:'P50', data:r50, borderColor:'#16a34a',              borderWidth:1.5, pointRadius:0, fill:false, borderDash:[5,3], tension:0.4 },
        { label:'P3',  data:r3,  borderColor:'rgba(74,222,128,0.3)', borderWidth:1, pointRadius:0, fill:'-3', backgroundColor:'rgba(74,222,128,0.15)', tension:0.4 },
        // Datos del paciente
        {
          label, data: patientData, borderColor:'#4A90E2', backgroundColor:'#fff',
          borderWidth:2.5, pointBackgroundColor:'#4A90E2', pointBorderColor:'#fff',
          pointBorderWidth:2, pointRadius:5, fill:false, tension:0.4,
          parsing: false
        }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{
          filter: item => item.datasetIndex === 5,
          callbacks:{
            title: items => {
              const dp = dataPoints[items[0].dataIndex];
              if (!dp) return '';
              const m = Math.floor(dp.age), d = Math.round((dp.age-m)*30.4);
              return `${m}m${d>0?` ${d}d`:''} — ${dp.date}`;
            },
            label: item => {
              const dp = dataPoints[item.dataIndex];
              if (!dp || !birthDate) return `${item.parsed.y} ${unit}`;
              const pts = whoInterp(refTable, dp.age);
              return [`${label}: ${item.parsed.y} ${unit}`, `Percentil: ${estimatePercentile(dp.val,pts)}`, `Z-score: ${(() => { const z=estimateZscore(dp.val,pts); return (z>0?'+':'')+z; })()}`];
            }
          }
        }
      },
      scales:{
        x:{ type:'linear', title:{ display:true, text:'Edad (meses)', color:'#94a3b8', font:{size:11} }, min:0, max:60, grid:{ color:'#F1F5F9' }, ticks:{ color:'#94a3b8', stepSize:6 } },
        y:{ title:{ display:true, text:unit, color:'#94a3b8', font:{size:11} }, grid:{ color:'#F1F5F9' }, ticks:{ color:'#94a3b8' } }
      }
    }
  });
}

// === Navigation ===
window.navigate = function(view) {
  if (!currentUser && view !== 'login') { currentView = 'login'; }
  else if (currentUser && view === 'login') { currentView = getRoleDefaultView(currentUser.role); }
  else if (currentUser && currentUser.role === 'tutor' && !['parent-profile','booking-calendar','doctor-public'].includes(view)) { currentView = 'parent-profile'; }
  else { currentView = view; }
  renderApp();
  window.scrollTo(0, 0);
};

window.viewPatient = async function(id) {
  currentPatientId    = id;
  currentPatient      = patients.find(p => p.id === id) || null;
  consultations       = [];
  patientVaccinations = [];
  neuroAssessments    = [];
  currentView         = 'parent-profile';
  renderApp();
  try {
    const [consults, vaccines, neuro] = await Promise.all([
      API.get(`/patients/${id}/consultations`),
      API.get(`/patients/${id}/vaccinations`),
      API.get(`/patients/${id}/neurodevelopment`),
    ]);
    consultations       = consults || [];
    patientVaccinations = vaccines || [];
    neuroAssessments    = neuro    || [];
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
    // El token queda en una cookie httpOnly puesta por el server (inaccesible a JS)
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
  // Limpia la cookie httpOnly en el server (fire-and-forget: el estado local
  // se limpia igual aunque el request falle)
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  currentUser = null; patients = []; pediatricians = []; currentPatient = null;
  consultations = []; todayAppointments = []; doctorAppointments = []; currentPatientId = null;
  sessionStorage.clear(); currentView = 'login'; renderApp();
};

// === Modal helpers ===
window.openModal = function(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'addConsultModal') {
    const ml = document.getElementById('medicationsList');
    if (ml && ml.children.length === 0) window.addMedicationField();
  }
  if (id === 'userModal' && window.editingUserId) {
    // Editar: ocultar selector de rol (se cambia desde la tabla)
    const rg = document.getElementById('userModalRoleGroup');
    if (rg) rg.style.display = 'none';
  }
  if (id === 'userModal' && !window.editingUserId) {
    // Autogenerar contraseña al abrir para crear nuevo usuario
    const pw = document.getElementById('userModalPassword');
    if (pw) pw.value = generateRandomPassword(8);
    // Configurar selector de rol según el contexto
    const roleGroup  = document.getElementById('userModalRoleGroup');
    const roleSelect = document.getElementById('userModalRole');
    const title      = document.getElementById('userModalTitle');
    const ctx = window.userModalContext || 'pediatra';
    if (ctx === 'admin' && canManageUsers(currentUser?.role || '')) {
      // Crear administrador (super_admin/admin/asesor)
      if (roleGroup) roleGroup.style.display = '';
      if (roleSelect) {
        roleSelect.innerHTML = `
          <option value="admin">Administrador</option>
          <option value="asesor">Asesor</option>
          <option value="super_admin">Super Admin</option>`;
      }
      if (title) title.innerText = 'Añadir Administrador';
    } else {
      // Crear pediatra (oculta selector — rol fijo)
      if (roleGroup) roleGroup.style.display = 'none';
      if (roleSelect) roleSelect.value = 'pediatra';
      if (title) title.innerText = 'Añadir Pediatra';
    }
  }
};

window.closeModal = function(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'resetPasswordModal') {
    const h2 = document.querySelector('#resetPasswordModal .modal-header h2');
    if (h2) h2.textContent = 'Cambiar Contraseña del Tutor';
    setResetPasswordEmail(null);
  }
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
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:0.5rem;">
      <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-dose" placeholder="Dosis (Ej. 5ml)" value="${med?.dose||''}"></div>
      <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-freq" placeholder="Frecuencia (Ej. 8h)" value="${med?.freq||''}"></div>
      <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-days" placeholder="Duración (Ej. 5 días)" value="${med?.days||''}"></div>
    </div>
    <div class="form-group" style="margin-bottom:0;"><input type="text" class="form-control med-indication" placeholder="Indicación adicional (opcional)" value="${med?.indication||''}"></div>`;
  list.appendChild(div);
};

// === Consult handlers ===
window.editingConsultId    = null;
window.editingConsultIndex = null;
window.indexToDelete       = null;

// Muestra un toast con alertas de signos vitales anormales
function showVitalAlertToast(alerts) {
  const existing = document.getElementById('vitalAlertToast');
  if (existing) existing.remove();
  const levelColor = alerts.some(a => a.level === 'danger') ? '#ef4444' : '#f59e0b';
  const rows = alerts.map(a => `
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,0.15);">
      <i class="fa-solid ${a.level==='danger'?'fa-circle-exclamation':'fa-triangle-exclamation'}" style="font-size:0.85rem;min-width:14px;"></i>
      <span><strong>${a.sign}:</strong> ${a.value} ${a.unit} — ${a.msg} <span style="opacity:0.75;font-size:0.8rem;">(normal: ${a.normal})</span></span>
    </div>`).join('');
  const toast = document.createElement('div');
  toast.id = 'vitalAlertToast';
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
      <i class="fa-solid fa-heart-pulse" style="font-size:1.1rem;"></i>
      <strong>Alerta de Signos Vitales</strong>
      <button onclick="document.getElementById('vitalAlertToast').remove()" style="margin-left:auto;background:transparent;border:none;color:white;cursor:pointer;font-size:1rem;line-height:1;">✕</button>
    </div>
    ${rows}`;
  Object.assign(toast.style, {
    position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:'9999',
    background: levelColor, color:'white', padding:'1rem 1.25rem',
    borderRadius:'12px', boxShadow:'0 8px 24px rgba(0,0,0,0.25)',
    maxWidth:'420px', fontSize:'0.85rem', lineHeight:'1.4',
    animation:'slideInRight 0.3s ease'
  });
  document.body.appendChild(toast);
  setTimeout(() => toast?.remove(), 8000);
}

window.saveConsult = async function() {
  const weight = document.getElementById('consultWeight').value;
  const height = document.getElementById('consultHeight').value;
  if (!weight || !height) { alert('Ingresa al menos peso y estatura.'); return; }
  const head   = document.getElementById('consultHead')?.value;
  const type   = document.getElementById('consultType')?.value || 'Control de niño sano';
  const reqMed = document.getElementById('consultMedicationReq')?.value || 'No';
  const notes  = document.getElementById('consultNotes').value;
  // Signos vitales
  const fc   = document.getElementById('consultFC')?.value;
  const fr   = document.getElementById('consultFR')?.value;
  const temp = document.getElementById('consultTemp')?.value;
  const spo2 = document.getElementById('consultSpO2')?.value;
  const tas  = document.getElementById('consultTAS')?.value;
  const tad  = document.getElementById('consultTAD')?.value;
  let meds = [];
  if (reqMed === 'Sí') {
    document.querySelectorAll('.medication-item').forEach(item => {
      const name       = item.querySelector('.med-name')?.value;
      const dose       = item.querySelector('.med-dose')?.value;
      const freq       = item.querySelector('.med-freq')?.value;
      const days       = item.querySelector('.med-days')?.value;
      const indication = item.querySelector('.med-indication')?.value;
      if (name) meds.push({ name, dose, freq, days: days || undefined, indication: indication || undefined });
    });
  }
  const payload = {
    type, weight: parseFloat(weight), height: parseFloat(height),
    head_circ: head ? parseFloat(head) : null, notes: notes||'', medications: meds,
    heart_rate:   fc   ? parseInt(fc)     : null,
    resp_rate:    fr   ? parseInt(fr)     : null,
    temperature:  temp ? parseFloat(temp) : null,
    spo2:         spo2 ? parseFloat(spo2) : null,
    bp_systolic:  tas  ? parseInt(tas)    : null,
    bp_diastolic: tad  ? parseInt(tad)    : null,
  };
  try {
    let resp;
    if (window.editingConsultId !== null) {
      resp = await API.put(`/patients/${currentPatientId}/consultations/${window.editingConsultId}`, payload);
    } else {
      resp = await API.post(`/patients/${currentPatientId}/consultations`, payload);
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
    // Mostrar alertas de signos vitales si las hay
    if (resp?.vital_alerts?.length > 0) {
      setTimeout(() => showVitalAlertToast(resp.vital_alerts), 300);
    }
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
  // Signos vitales
  const fcEl = document.getElementById('consultFC'); if(fcEl) fcEl.value = h.heart_rate||'';
  const frEl = document.getElementById('consultFR'); if(frEl) frEl.value = h.resp_rate||'';
  const tEl  = document.getElementById('consultTemp'); if(tEl) tEl.value = h.temperature||'';
  const sEl  = document.getElementById('consultSpO2'); if(sEl) sEl.value = h.spo2||'';
  const tsEl = document.getElementById('consultTAS'); if(tsEl) tsEl.value = h.bp_systolic||'';
  const tdEl = document.getElementById('consultTAD'); if(tdEl) tdEl.value = h.bp_diastolic||'';
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
      <div><strong>Paciente:</strong> ${p.name}</div><div><strong>Fecha:</strong> ${formatConsultDate(h.date)}</div>
      <div><strong>Edad:</strong> ${ageStr}</div><div><strong>Peso:</strong> ${h.weight} kg | <strong>Talla:</strong> ${h.height} cm</div>
    </div>
    <div class="rx">Rx</div>
    <ul class="med-list">${meds.map(m=>`<li><div class="med-name">${m.name}</div><div class="med-details">${m.dose ? `<strong>Dosis:</strong> ${m.dose}` : ''}${m.freq ? ` &nbsp;|&nbsp; <strong>Frecuencia:</strong> ${m.freq}` : ''}${m.days ? ` &nbsp;|&nbsp; <strong>Duración:</strong> ${m.days}` : ''}</div>${m.indication ? `<div class="med-details" style="margin-top:4px;font-style:italic;">${m.indication}</div>` : ''}</li>`).join('')}</ul>
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
  const roleEl = document.getElementById('userModalRole');
  const role = roleEl ? roleEl.value : 'pediatra';
  if (!name || !email) { alert('Nombre y correo son requeridos.'); return; }
  if (!window.editingUserId && !password) { alert('La contraseña es requerida.'); return; }
  try {
    if (window.editingUserId !== null) {
      const body = { name, email }; if (password) body.password = password;
      await API.put(`/users/${window.editingUserId}`, body);
    } else {
      const generated = password;
      await API.post('/users', { name, email, password, role });
      if (generated) alert(`Usuario creado.\n\nCorreo: ${email}\nContraseña: ${generated}\n\nCompártela antes de cerrar este mensaje.`);
    }
    pediatricians = (await API.get('/users/pediatras')) || [];
    if (canManageUsers(currentUser.role)) allUsers = (await API.get('/users')) || [];
    closeModal('userModal'); renderApp();
  } catch (e) { alert('Error: ' + e.message); }
};

window.editUser = function(id) {
  // Buscar primero en pediatras, luego en lista completa de usuarios
  const u = pediatricians.find(u => u.id === id) || allUsers.find(u => u.id === id);
  if (!u) return;

  // Para pediatras navegamos al editor completo (con foto, especialidad, etc.)
  if (u.role === 'pediatra' && isAdminLike(currentUser.role)) {
    window.editingProfileUserId = id;
    myProfile = null; // forzar recarga
    navigate('doctor-profile-edit');
    return;
  }

  // Para admin/asesor/super_admin usamos el modal pequeño
  window.editingUserId = id;
  window.userModalContext = u.role === 'pediatra' ? 'pediatra' : 'admin';
  const t = document.getElementById('userModalTitle');
  if (t) t.innerText = u.role === 'pediatra' ? 'Editar Pediatra' : 'Editar Usuario';
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

window.generateRandomPassword = function(length = 8) {
  // Excluye caracteres confundibles (0/O, 1/l/I) y símbolos para evitar problemas de tipeo
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < length; i++) s += chars[arr[i] % chars.length];
  return s;
};

window.openResetPasswordModal = function(tutorId, email) {
  window.resetPasswordTutorId = tutorId;
  const inp = document.getElementById('resetPasswordInput');
  const cb  = document.getElementById('resetPasswordCustom');
  if (cb) cb.checked = false;
  if (inp) {
    inp.value = generateRandomPassword(8);
    inp.readOnly = true;
    inp.style.background = '#f1f5f9';
  }
  setResetPasswordEmail(email);
  openModal('resetPasswordModal');
};

window.regenerateResetPassword = function() {
  const inp = document.getElementById('resetPasswordInput');
  if (inp && !inp.readOnly) {
    document.getElementById('resetPasswordCustom').checked = false;
    toggleCustomPassword();
  }
  if (inp) inp.value = generateRandomPassword(8);
};

window.copyResetPassword = async function() {
  const inp = document.getElementById('resetPasswordInput');
  if (!inp || !inp.value) return;
  try {
    await navigator.clipboard.writeText(inp.value);
    const btn = event.currentTarget;
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => { btn.innerHTML = old; }, 1200);
  } catch(e) {
    inp.select();
    document.execCommand('copy');
  }
};

window.toggleCustomPassword = function() {
  const cb  = document.getElementById('resetPasswordCustom');
  const inp = document.getElementById('resetPasswordInput');
  if (!cb || !inp) return;
  if (cb.checked) {
    inp.readOnly = false;
    inp.style.background = 'white';
    inp.value = '';
    inp.focus();
  } else {
    inp.readOnly = true;
    inp.style.background = '#f1f5f9';
    inp.value = generateRandomPassword(8);
  }
};

window.confirmResetPassword = async function() {
  const newPass = document.getElementById('resetPasswordInput').value;
  if (!newPass || newPass.length < 6) { alert('Mínimo 6 caracteres.'); return; }
  try {
    await API.post(`/auth/reset-password/${window.resetPasswordTutorId}`, { newPassword: newPass });
    alert(`Contraseña actualizada correctamente.\n\nNueva contraseña: ${newPass}\n\nCompártela con el tutor antes de cerrar este mensaje.`);
    closeModal('resetPasswordModal');
  } catch (e) { alert('Error: '+e.message); }
};

// === Appointment status ===
window.updateAppointmentStatus = async function(id, status) {
  try {
    await API.put(`/appointments/${id}/status`, { status });
    const today = new Date().toISOString().slice(0, 10);
    todayAppointments  = (await API.get(`/appointments?date=${today}`)) || [];
    doctorAppointments = (await API.get('/appointments')) || [];
    renderApp();
  } catch (e) { alert('Error: '+e.message); }
};

// === Limpieza de citas vencidas (no-shows) ===
// Cuenta citas cuya fecha ya pasó y siguen pendientes/confirmadas.
function countPastNoShows() {
  const today = new Date().toISOString().slice(0, 10);
  return (doctorAppointments || []).filter(a =>
    a.date < today && (a.status === 'pendiente' || a.status === 'confirmada')
  ).length;
}

// Banner reutilizable con botón; se muestra solo si hay citas vencidas y el
// usuario puede editar (pediatra o admin/super_admin, no asesor).
function renderCleanupBanner() {
  if (currentUser.role === 'asesor') return '';
  const n = countPastNoShows();
  if (n === 0) return '';
  return `
    <div class="cleanup-banner">
      <div class="cleanup-banner-text">
        <i class="fa-solid fa-calendar-xmark"></i>
        <div>
          <strong>${n} cita${n === 1 ? '' : 's'} vencida${n === 1 ? '' : 's'} sin atender</strong>
          <div style="font-size:0.82rem;opacity:0.85;">Quedaron pendientes o confirmadas y su fecha ya pasó.</div>
        </div>
      </div>
      <button class="btn" onclick="openModal('cleanupApptsModal')">
        <i class="fa-solid fa-broom"></i> Limpiar citas vencidas
      </button>
    </div>`;
}

window.confirmCleanupAppts = async function() {
  const btn = document.getElementById('cleanupConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Limpiando...'; }
  try {
    const res = await API.post('/appointments/cleanup-past', {});
    closeModal('cleanupApptsModal');
    doctorAppointments = (await API.get('/appointments')) || [];
    if (currentUser.role === 'pediatra') {
      const today = new Date().toISOString().slice(0, 10);
      todayAppointments = (await API.get(`/appointments?date=${today}`)) || [];
    }
    renderApp();
    alert(`Listo. Se cancelaron ${res.cancelled} cita${res.cancelled === 1 ? '' : 's'} vencida${res.cancelled === 1 ? '' : 's'}.`);
  } catch (e) {
    alert('Error: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-broom"></i> Sí, cancelarlas'; }
  }
};

// === Onboarding handlers ===
function validateCurrentStep() {
  const container = document.querySelector('.onboarding-content');
  if (!container) return true;
  // Solo valida campos marcados con required="true" o required attribute
  const elements = container.querySelectorAll('input[required], select[required], textarea[required]');
  let isValid = true, firstInvalid = null;
  const radioGroups = {};
  elements.forEach(el => {
    if (el.closest('[style*="display: none"]') || el.closest('[style*="display:none"]')) return;
    el.style.borderColor = '';
    if (el.type === 'radio') {
      // Cuando encontramos un radio con required, tomamos TODOS los radios
      // del mismo grupo (name), no solo los que tienen required
      if (!radioGroups[el.name]) {
        radioGroups[el.name] = Array.from(
          container.querySelectorAll(`input[type="radio"][name="${el.name}"]`)
        );
      }
    } else if (!el.value || el.value.trim() === '') {
      isValid = false; el.style.borderColor = '#ef4444';
      if (!firstInvalid) firstInvalid = el;
    }
  });
  Object.values(radioGroups).forEach(g => {
    if (!g.some(r => r.checked)) {
      isValid = false; g.forEach(r => { const l = r.closest('label'); if (l) l.style.color = '#ef4444'; });
      if (!firstInvalid) firstInvalid = g[0];
    }
  });
  if (!isValid) { alert('Por favor completa los campos obligatorios (marcados con *).'); if (firstInvalid?.focus) firstInvalid.focus(); }
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
  if (currentOnboardingStep < 7) { currentOnboardingStep++; renderApp(); window.scrollTo(0, 0); }
};

window.prevOnboardingStep = function() {
  if (currentOnboardingStep > 1) { saveCurrentStepData(); currentOnboardingStep--; renderApp(); window.scrollTo(0,0); }
};

window.finishOnboarding = async function() {
  if (!validateCurrentStep()) return;
  saveCurrentStepData();
  const d        = window.newPatientData || {};
  const newName  = window.newPatientName || d['new-patient-name'] || 'Paciente';
  const momName  = d['mom-name'] || 'No especificado';
  const dadName  = d['dad-name'] || 'No especificado';
  const tutorEmail = d['tutorEmail'];
  const tutorName  = momName !== 'No especificado' ? momName : (dadName !== 'No especificado' ? dadName : 'Tutor');

  // Colectar TORCH (checkboxes)
  const torchChecked = Array.from(document.querySelectorAll('input[name="torch"]:checked')).map(e => e.value);

  try {
    const result = await API.post('/patients', {
      name:            newName,
      onboarding_data: d,
      tutor_email:     tutorEmail || undefined,
      tutor_name:      tutorName,
      family_history:  window.familyHistoryData || [],
      // Fase A: campos estructurados
      birth_state:     d['patient-birth-state'] || undefined,
      birth_city:      d['patient-birth-city']  || undefined,
      parents_education: (d['mom-education'] || d['dad-education']) ? { mother: d['mom-education'], father: d['dad-education'] } : undefined,
      maternal_age:    d['maternal-age'] || undefined,
      prenatal_visits: d['prenatal-visits'] || undefined,
      gestational_age: d['gestational-weeks'] || undefined,
      delivery_type:   d['delivery-type'] || undefined,
      birth_weight:    d['birth-weight-kg'] || undefined,
      birth_height:    d['birth-height-cm'] || undefined,
      birth_head_circ: d['birth-head-cm']   || undefined,
      apgar_1:         d['apgar-1'] || undefined,
      apgar_5:         d['apgar-5'] || undefined,
      nicu_stay:       d['nicu-stay'] === 'Sí' ? 1 : 0,
      nicu_days:       d['nicu-days'] || undefined,
      breastfed:       d['breastfed'] === 'Sí' ? 1 : 0,
      breastfed_months: d['breastfed-months'] || undefined,
      torch_exposure:  torchChecked.length ? torchChecked : undefined,
      neonatal_screening: d['neonatal-screening'] === 'Sí' ? 1 : 0,
    });
    patients = (await API.get('/patients')) || [];
    window.successData = { patientName: newName, tutorEmail, password: result.tutor?.password || '', momName, dadName };
    currentOnboardingStep = 1;
    window.newPatientName = '';
    window.newPatientData = {};
    window.familyHistoryData = [];
    currentView = 'onboarding-success';
    renderApp(); window.scrollTo(0, 0);
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
