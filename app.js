// Data Storage (Local)
let patients = JSON.parse(localStorage.getItem('peditrack_patients')) || [];



// App State
let currentUser = JSON.parse(localStorage.getItem('peditrack_user')) || null;
let users = JSON.parse(localStorage.getItem('peditrack_users')) || [
    { id: 1, email: 'admin@peditrack.com', password: '123', role: 'admin', name: 'Administrador Principal' },
    { id: 2, email: 'doc@peditrack.com', password: '123', role: 'pediatra', name: 'Dr. Roberto Pediátrico' },
    { id: 3, email: 'tutor@peditrack.com', password: '123', role: 'tutor', name: 'Padre/Madre de Prueba' }
];

// Migración para asignar un pediatra por defecto a pacientes existentes
let patientsModified = false;
patients.forEach(p => {
    if (!p.doctorId) {
        p.doctorId = 2; // ID de Dr. Roberto Pediátrico por defecto
        patientsModified = true;
    }
});
if (patientsModified) {
    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
}

function getRoleDefaultView(role) {
    if (role === 'admin') return 'admin-dashboard';
    if (role === 'pediatra') return 'doctor-dashboard';
    if (role === 'tutor') return 'parent-profile';
    return 'login';
}

let currentView = currentUser ? getRoleDefaultView(currentUser.role) : 'login';
let currentOnboardingStep = 1;

// Main Render Function
function renderApp() {
    const app = document.getElementById('app');
    
    let headerAction = '';
    if (currentUser) {
        headerAction = `<button class="btn btn-secondary" onclick="handleLogout()" style="display: flex; align-items: center; gap: 0.5rem;"><i class="fa-solid fa-arrow-right-from-bracket"></i> Salir</button>`;
    }

    let html = `
        <header>
            <div class="logo cursor-pointer" onclick="${currentUser ? "navigate(getRoleDefaultView(currentUser.role))" : "navigate('login')"}">
                <i class="fa-solid fa-baby-carriage"></i> PediTrack
            </div>
            ${headerAction}
        </header>
        <main class="container animate-fade-in" id="main-content">
    `;

    if (currentView === 'login') {
        html += renderLogin();
    } else if (currentView === 'admin-dashboard') {
        html += renderAdminDashboard();
    } else if (currentView === 'doctor-dashboard') {
        html += renderDoctorDashboard();
    } else if (currentView === 'parent-profile') {
        html += renderParentProfile();
    } else if (currentView === 'patient-onboarding') {
        html += renderOnboarding();
    } else if (currentView === 'onboarding-success') {
        html += renderOnboardingSuccess();
    }

    html += `</main>`;
    
    // Add Modals
    html += renderModals();

    app.innerHTML = html;

    // After Render logic
    if (currentView === 'parent-profile') {
        initChart();
    }
}

// Views
function renderLogin() {
    return `
        <div class="login-view" style="max-width: 400px; margin: 4rem auto; background: white; padding: 2.5rem; border-radius: 15px; box-shadow: var(--shadow-md);">
            <div style="text-align: center; margin-bottom: 2rem;">
                <i class="fa-solid fa-baby-carriage" style="font-size: 3.5rem; color: var(--primary);"></i>
                <h1 style="margin-top: 1rem; font-size: 2rem; color: var(--text-dark);">PediTrack</h1>
                <p style="color: var(--text-light); margin-top: 0.5rem;">Iniciar sesión en tu cuenta</p>
            </div>
            
            <div class="form-group">
                <label>Correo Electrónico</label>
                <input type="email" id="loginEmail" class="form-control" placeholder="ej. doc@peditrack.com" value="doc@peditrack.com">
            </div>
            <div class="form-group">
                <label>Contraseña</label>
                <input type="password" id="loginPass" class="form-control" placeholder="••••••••" value="123">
            </div>
            
            <button class="btn btn-primary" style="width: 100%; margin-top: 1rem; padding: 0.8rem; font-size: 1.1rem;" onclick="handleLogin()">Entrar</button>
            
            <div style="margin-top: 2rem; font-size: 0.85rem; color: var(--text-light); text-align: left; background: var(--primary-light); padding: 1rem; border-radius: 8px;">
                <strong style="color: var(--primary); display: block; margin-bottom: 0.5rem;">Usuarios de prueba (Clave: 123):</strong>
                <ul style="margin: 0; padding-left: 1.2rem; line-height: 1.6;">
                    <li><strong>admin</strong>@peditrack.com</li>
                    <li><strong>doc</strong>@peditrack.com</li>
                    <li><strong>tutor</strong>@peditrack.com</li>
                </ul>
            </div>
        </div>
    `;
}

function renderAdminDashboard() {
    const pediatricians = users.filter(u => u.role === 'pediatra');
    const tutors = users.filter(u => u.role === 'tutor');

    return `
        <div class="dashboard">
            <div class="dashboard-header">
                <div>
                    <h1 style="font-size: 2rem;">Panel de Administrador</h1>
                    <p style="color: var(--text-light);">Bienvenido, ${currentUser ? currentUser.name : 'Admin'}</p>
                </div>
            </div>
            
            <div class="profile-stats">
                <div class="stat-card">
                    <div class="stat-label">Total Pacientes</div>
                    <div class="stat-value">${patients.length}</div>
                    <p style="color: var(--secondary); font-size: 0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Sistema activo</p>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Pediatras</div>
                    <div class="stat-value">${pediatricians.length}</div>
                    <p style="color: var(--secondary); font-size: 0.9rem;">En la plataforma</p>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Tutores</div>
                    <div class="stat-value">${tutors.length}</div>
                    <p style="color: var(--secondary); font-size: 0.9rem;">Registrados</p>
                </div>
            </div>
            
            <div class="history-section" style="margin-top: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Gestión de Pediatras</h2>
                    <button class="btn btn-primary" onclick="window.editingUserId = null; openModal('userModal')">
                        <i class="fa-solid fa-user-plus"></i> Añadir Pediatra
                    </button>
                </div>
                <div style="background: white; padding: 1.5rem; border-radius: 15px; margin-top: 1rem; box-shadow: var(--shadow-sm); overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--background); color: var(--text-light);">
                                <th style="padding: 1rem 0;">Nombre</th>
                                <th style="padding: 1rem 0;">Email</th>
                                <th style="padding: 1rem 0; text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pediatricians.map(u => `
                            <tr style="border-bottom: 1px solid var(--background);">
                                <td style="padding: 1rem 0; font-weight: 500;">${u.name}</td>
                                <td style="padding: 1rem 0; color: var(--text-light);">${u.email}</td>
                                <td style="padding: 1rem 0; text-align: right;">
                                    <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: transparent; color: var(--primary); box-shadow: none;" onclick="editUser(${u.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                                    <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: transparent; color: #ef4444; box-shadow: none;" onclick="deleteUser(${u.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                                </td>
                            </tr>
                            `).join('')}
                            ${pediatricians.length === 0 ? '<tr><td colspan="3" style="padding: 1rem 0; text-align: center; color: var(--text-light);">No hay pediatras registrados.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="history-section" style="margin-top: 2rem;">
                <h2>Asignación de Pacientes</h2>
                <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 1rem;">Administra qué pediatra atiende a cada paciente.</p>
                <div style="background: white; padding: 1.5rem; border-radius: 15px; box-shadow: var(--shadow-sm); overflow-x: auto;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--background); color: var(--text-light);">
                                <th style="padding: 1rem 0;">Paciente</th>
                                <th style="padding: 1rem 0;">Edad</th>
                                <th style="padding: 1rem 0;">Pediatra Asignado</th>
                                <th style="padding: 1rem 0; text-align: right;">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${patients.map(p => {
                                const doc = users.find(u => u.id === p.doctorId);
                                const docName = doc ? doc.name : '<span style="color: #ef4444;">Sin asignar</span>';
                                return `
                            <tr style="border-bottom: 1px solid var(--background);">
                                <td style="padding: 1rem 0; font-weight: 500;">${p.name}</td>
                                <td style="padding: 1rem 0; color: var(--text-light);">${calculateAgeString(p.onboardingData ? p.onboardingData['Fecha de nacimiento'] : null, p.age)}</td>
                                <td style="padding: 1rem 0;">${docName}</td>
                                <td style="padding: 1rem 0; text-align: right;">
                                    <button class="btn btn-secondary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;" onclick="openAssignPatientModal(${p.id})">
                                        <i class="fa-solid fa-user-doctor"></i> Cambiar
                                    </button>
                                </td>
                            </tr>
                            `}).join('')}
                            ${patients.length === 0 ? '<tr><td colspan="4" style="padding: 1rem 0; text-align: center; color: var(--text-light);">No hay pacientes registrados.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function calculateAgeString(birthDateStr, fallbackAge) {
    if (!birthDateStr) return fallbackAge || '0 meses';
    
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    
    if (isNaN(birthDate.getTime())) return fallbackAge || '0 meses';

    // Para evitar zonas horarias restando un día, añadimos la hora a mediodía local
    const bYear = parseInt(birthDateStr.split('-')[0]);
    const bMonth = parseInt(birthDateStr.split('-')[1]) - 1;
    const bDay = parseInt(birthDateStr.split('-')[2]);
    const localBirthDate = new Date(bYear, bMonth, bDay);

    let months = (today.getFullYear() - localBirthDate.getFullYear()) * 12;
    months -= localBirthDate.getMonth();
    months += today.getMonth();
    
    if (today.getDate() < localBirthDate.getDate()) {
        months--;
    }

    if (months < 0) months = 0;

    if (months === 0) {
        const diffTime = Math.abs(today - localBirthDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays === 1 ? '1 día' : `${diffDays} días`;
    } else if (months < 12) {
        return months === 1 ? '1 mes' : `${months} meses`;
    } else {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        let result = years === 1 ? '1 año' : `${years} años`;
        if (remainingMonths > 0) {
            result += ` ${remainingMonths === 1 ? '1 mes' : remainingMonths + ' meses'}`;
        }
        return result;
    }
}

function renderDoctorDashboard() {
    const myPatients = currentUser.role === 'admin' ? patients : patients.filter(p => p.doctorId === currentUser.id);
    let patientsHtml = myPatients.map(p => `
        <div class="patient-card" onclick="viewPatient(${p.id})">
            <div class="avatar">${p.name ? p.name.charAt(0).toUpperCase() : '?'}</div>
            <div class="patient-info">
                <h3>${p.name}</h3>
                <p><i class="fa-regular fa-clock"></i> ${calculateAgeString(p.onboardingData ? p.onboardingData['Fecha de nacimiento'] : null, p.age)}</p>
                <div style="margin-top: 0.5rem; display: flex; gap: 1rem; font-size: 0.8rem; font-weight: 500;">
                    <span><i class="fa-solid fa-weight-scale" style="color: var(--secondary)"></i> ${p.weight} kg</span>
                    <span><i class="fa-solid fa-ruler-vertical" style="color: var(--secondary)"></i> ${p.height} cm</span>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="margin-left: auto; color: var(--text-light);"></i>
        </div>
    `).join('');

    if (myPatients.length === 0) {
        patientsHtml = `
            <div style="text-align: center; padding: 3rem; background: white; border-radius: 15px; grid-column: 1 / -1; margin-top: 2rem;">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; color: var(--primary-light); margin-bottom: 1rem;"></i>
                <h3 style="margin-bottom: 0.5rem;">Aún no tienes pacientes</h3>
                <p style="color: var(--text-light);">Empieza agregando tu primer paciente usando el botón superior.</p>
            </div>
        `;
    }

    return `
        <div class="dashboard">
            <div class="dashboard-header">
                <div>
                    <h1 style="font-size: 2rem;">Mis Pacientes</h1>
                    <p style="color: var(--text-light);">${myPatients.length > 0 ? `Tienes ${myPatients.length} paciente(s) registrado(s).` : 'Bienvenido a tu panel de control.'}</p>
                </div>
                <button class="btn btn-primary" onclick="navigate('patient-onboarding')">
                    <i class="fa-solid fa-plus"></i> Nuevo Paciente
                </button>
            </div>
            
            <div class="patients-grid">
                ${patientsHtml}
            </div>
        </div>
    `;
}

function renderParentProfile() {
    const p = patients.find(pat => pat.id === currentPatientId) || patients[0];
    
    if (!p) {
        return `<div class="container" style="text-align: center; margin-top: 4rem;">
                    <h2>No hay pacientes registrados</h2>
                    <button class="btn btn-primary" style="margin-top: 1rem;" onclick="navigate('patient-onboarding')">Crear paciente</button>
                </div>`;
    }

    const consults = p.consultations || [];
    let historyHtml = consults.length > 0 ? consults.map((h, idx) => {
        let medsToRender = [];
        if (h.medication) medsToRender.push(h.medication);
        if (h.medications && h.medications.length > 0) medsToRender = medsToRender.concat(h.medications);
        
        return `
        <div class="timeline-item">
            <div class="timeline-date">${h.date}</div>
            <div class="timeline-content">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h4>${h.type || 'Consulta de Seguimiento'}</h4>
                    <div style="display: flex; gap: 0.5rem;">
                        ${(currentUser && currentUser.role !== 'tutor') ? `
                        <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: transparent; color: var(--primary); box-shadow: none;" onclick="editConsult(${idx})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: transparent; color: #ef4444; box-shadow: none;" onclick="deleteConsult(${idx})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        ` : ''}
                    </div>
                </div>
                ${h.notes ? `<p>${h.notes}</p>` : ''}
                
                ${medsToRender.length > 0 ? `
                <div style="background: var(--primary-light); padding: 0.8rem; border-radius: 6px; margin: 0.8rem 0; font-size: 0.9rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <strong><i class="fa-solid fa-pills" style="color: var(--primary);"></i> Receta:</strong>
                        <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: var(--primary); color: white; border-radius: 4px; box-shadow: none;" onclick="printPrescription(${idx})" title="Imprimir Receta"><i class="fa-solid fa-print"></i> Imprimir</button>
                    </div>
                    <ul style="margin: 0 0 0 1.5rem; padding: 0;">
                        ${medsToRender.map(m => `<li style="margin-bottom: 0.2rem;">${m.name} - ${m.dose} (${m.freq})</li>`).join('')}
                    </ul>
                </div>
                ` : ''}

                <div class="timeline-metrics">
                    <div class="metric"><i class="fa-solid fa-weight-scale"></i> ${h.weight} kg</div>
                    <div class="metric"><i class="fa-solid fa-ruler-vertical"></i> ${h.height} cm</div>
                    ${h.head ? `<div class="metric"><i class="fa-solid fa-head-side-measles" style="color: var(--secondary)"></i> ${h.head} cm</div>` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('') : '<p style="color: var(--text-light); padding: 1rem 0;">No hay consultas registradas aún.</p>';

    return `
        <div class="profile-view">
            <div class="profile-header">
                <div class="profile-avatar">${p.name ? p.name.charAt(0).toUpperCase() : '?'}</div>
                <div style="z-index: 2;">
                    <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">${p.name}</h1>
                    <p style="font-size: 1.2rem; opacity: 0.9;">${calculateAgeString(p.onboardingData ? p.onboardingData['Fecha de nacimiento'] : null, p.age)} • Dr. Roberto Pediátrico</p>
                </div>
                ${(currentUser && currentUser.role !== 'tutor') ? `
                <button class="btn btn-primary" style="margin-left: auto; background: var(--white); color: var(--primary); z-index: 2;" onclick="window.editingConsultIndex = null; openModal('addConsultModal')">
                    <i class="fa-solid fa-notes-medical"></i> Registrar Consulta
                </button>` : ''}
            </div>
            
            <div class="profile-stats">
                <div class="stat-card">
                    <div class="stat-label">Peso Actual</div>
                    <div class="stat-value">${p.weight} <span style="font-size: 1.2rem; color: var(--text-dark)">kg</span></div>
                    <p style="color: var(--secondary); font-size: 0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Calculando...</p>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Estatura</div>
                    <div class="stat-value">${p.height} <span style="font-size: 1.2rem; color: var(--text-dark)">cm</span></div>
                    <p style="color: var(--secondary); font-size: 0.9rem;"><i class="fa-solid fa-arrow-trend-up"></i> Calculando...</p>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Percentil Estimado</div>
                    <div class="stat-value">50<span style="font-size: 1.2rem; color: var(--text-dark)">th</span></div>
                    <p style="color: var(--text-light); font-size: 0.9rem;">Desarrollo Óptimo</p>
                </div>
            </div>
            
            <div class="charts-section">
                <h2>Curva de Crecimiento (Peso)</h2>
                <div class="chart-container">
                    <canvas id="growthChart"></canvas>
                </div>
            </div>
            
            <div class="history-section">
                <h2 style="margin-bottom: 1.5rem;">Historial de Consultas</h2>
                <div class="timeline">
                    ${historyHtml}
                </div>
            </div>

            ${p.onboardingData && Object.keys(p.onboardingData).length > 0 ? `
            <div class="history-section" style="margin-top: 2rem;">
                <h2 style="margin-bottom: 2rem; font-size: 1.8rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 0.5rem;">Expediente de Ingreso</h2>
                ${Object.entries(categorizeOnboardingData(p.onboardingData)).map(([catName, items]) => {
                    if (items.length === 0) return '';
                    return `
                    <details class="expediente-accordion" ${catName === "Datos Generales y Nacimiento" ? "open" : ""}>
                        <summary class="expediente-summary">
                            <div style="display: flex; align-items: center; gap: 0.8rem;">
                                <i class="fa-solid fa-folder folder-icon" style="color: var(--secondary);"></i> ${catName}
                            </div>
                            <i class="fa-solid fa-chevron-down accordion-icon" style="color: var(--text-light); transition: transform 0.3s ease;"></i>
                        </summary>
                        <div class="expediente-accordion-content">
                            <div class="expediente-grid">
                                ${items.map(item => `
                                <div class="expediente-item">
                                    <span class="expediente-label"><i class="fa-solid fa-check" style="color: var(--secondary); margin-right: 0.4rem; font-size: 0.8rem;"></i>${formatLabel(item.key)}</span>
                                    <span class="expediente-value">${item.value}</span>
                                </div>
                                `).join('')}
                            </div>
                        </div>
                    </details>
                    `;
                }).join('')}
            </div>
            ` : ''}
        </div>
    `;
}

function renderOnboardingSuccess() {
    const data = window.successData || {};
    const patientName = data.patientName || 'Paciente';
    const momName = data.momName || 'No especificado';
    const dadName = data.dadName || 'No especificado';
    const email = data.tutorEmail || '';
    const password = data.password || '';

    const loginUrl = window.location.href.split('#')[0].split('?')[0]; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(loginUrl)}`;

    return `
        <div class="onboarding-success-view animate-fade-in" style="max-width: 900px; margin: 2rem auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-lg);">
            <div style="background: var(--primary); padding: 3rem 2rem; text-align: center; color: white;">
                <div style="width: 80px; height: 80px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 2.5rem;">
                    <i class="fa-solid fa-check"></i>
                </div>
                <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem; color: white;">¡Perfil Creado Exitosamente!</h1>
                <p style="font-size: 1.2rem; opacity: 0.9;">El expediente de <strong>${patientName}</strong> ya está listo.</p>
            </div>
            
            <div style="padding: 3rem; display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center;">
                <div>
                    <h2 style="color: var(--text-dark); margin-bottom: 1.5rem; font-size: 1.5rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 0.5rem;">Credenciales de Acceso</h2>
                    <p style="color: var(--text-light); margin-bottom: 1.5rem; line-height: 1.6;">Comparte estos datos con los tutores para que puedan acceder al expediente digital de su bebé desde su propio dispositivo.</p>
                    
                    <div style="background: var(--background); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
                        <div style="margin-bottom: 1rem;">
                            <label style="font-size: 0.85rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 0.3rem;">Tutores:</label>
                            <div style="font-weight: 500; font-size: 1.1rem; color: var(--text-dark);">${momName} ${dadName !== 'No especificado' ? '& ' + dadName : ''}</div>
                        </div>
                        ${email ? `
                        <div style="margin-bottom: 1rem;">
                            <label style="font-size: 0.85rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 0.3rem;">Correo (Usuario):</label>
                            <div style="font-weight: 600; font-size: 1.1rem; color: var(--primary);">${email}</div>
                        </div>
                        <div>
                            <label style="font-size: 0.85rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 0.3rem;">Contraseña Temporal:</label>
                            <div style="font-weight: 600; font-size: 1.3rem; letter-spacing: 2px; color: var(--text-dark); background: white; padding: 0.5rem; border-radius: 6px; display: inline-block; border: 1px dashed var(--text-light);">${password}</div>
                        </div>
                        ` : `<p style="color: var(--text-light); font-style: italic;">No se generó cuenta de tutor (correo no proporcionado).</p>`}
                    </div>
                    
                    <button class="btn btn-primary" style="width: 100%; font-size: 1.1rem; padding: 1rem;" onclick="navigate('doctor-dashboard')">
                        Ir a mi Panel de Control
                    </button>
                </div>
                
                <div style="text-align: center; border-left: 1px solid var(--background); padding-left: 3rem;">
                    <h3 style="margin-bottom: 1rem; color: var(--text-dark);">Acceso Rápido</h3>
                    <p style="color: var(--text-light); font-size: 0.95rem; margin-bottom: 2rem;">Escanea este código QR con la cámara del celular para ir directo a la pantalla de inicio de sesión.</p>
                    
                    <div style="background: white; padding: 1rem; border-radius: 12px; box-shadow: var(--shadow-md); display: inline-block;">
                        <img src="${qrUrl}" alt="QR Login" style="width: 200px; height: 200px; display: block;">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderModals() {
    return `
        <!-- Add Patient Modal -->
        <div class="modal-overlay" id="addPatientModal" onclick="if(event.target === this) closeModal('addPatientModal')">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Nuevo Paciente</h2>
                    <button class="close-btn" onclick="closeModal('addPatientModal')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="form-group">
                    <label>Nombre del Bebé</label>
                    <input type="text" class="form-control" placeholder="Ej. Ana García">
                </div>
                <div class="form-group">
                    <label>Fecha de Nacimiento</label>
                    <input type="date" class="form-control">
                </div>
                <div class="form-group">
                    <label>Nombre del Padre/Madre</label>
                    <input type="text" class="form-control" placeholder="Ej. Carlos García">
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="closeModal('addPatientModal'); alert('Paciente agregado con éxito')">Guardar Paciente</button>
            </div>
        </div>

        <!-- Add Consult Modal -->
        <div class="modal-overlay" id="addConsultModal" onclick="if(event.target === this) closeModal('addConsultModal')">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Registrar Consulta</h2>
                    <button class="close-btn" onclick="closeModal('addConsultModal')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Peso (kg)</label>
                        <input type="number" id="consultWeight" step="0.1" class="form-control" placeholder="Ej. 8.5">
                    </div>
                    <div class="form-group">
                        <label>Estatura (cm)</label>
                        <input type="number" id="consultHeight" step="0.1" class="form-control" placeholder="Ej. 71">
                    </div>
                    <div class="form-group">
                        <label>P. Cefálico</label>
                        <input type="number" id="consultHead" step="0.1" class="form-control" placeholder="Ej. 45">
                    </div>
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
                    <select id="consultMedicationReq" class="form-control" onchange="document.getElementById('medicationDetails').style.display = this.value === 'Sí' ? 'block' : 'none'">
                        <option value="No">No</option>
                        <option value="Sí">Sí</option>
                    </select>
                </div>
                
                <div id="medicationDetails" style="display: none; background: var(--primary-light); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <div id="medicationsList">
                        <!-- Generado dinámicamente -->
                    </div>
                    <button class="btn" style="background: transparent; color: var(--primary); border: 1px dashed var(--primary); width: 100%; margin-top: 1rem; padding: 0.5rem;" onclick="addMedicationField()">
                        <i class="fa-solid fa-plus"></i> Añadir otro medicamento
                    </button>
                </div>

                <div class="form-group">
                    <label>Notas Clínicas</label>
                    <textarea id="consultNotes" class="form-control" rows="4" placeholder="Observaciones, vacunas aplicadas, etc..."></textarea>
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="saveConsult()">Guardar Registro</button>
            </div>
        </div>

        <!-- Confirm Delete Modal -->
        <div class="modal-overlay" id="deleteConfirmModal" onclick="if(event.target === this) closeModal('deleteConfirmModal')">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <h2 style="margin-bottom: 1rem;">¿Eliminar Consulta?</h2>
                <p style="color: var(--text-light); margin-bottom: 1.5rem;">Esta acción no se puede deshacer. Se perderán todos los datos de esta visita.</p>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn" style="flex: 1; background: #f1f5f9; color: var(--text-dark);" onclick="closeModal('deleteConfirmModal')">Cancelar</button>
                    <button class="btn" style="flex: 1; background: #ef4444; color: white;" onclick="confirmDeleteConsult()">Eliminar</button>
                </div>
            </div>
        </div>

        <!-- User Modal -->
        <div class="modal-overlay" id="userModal" onclick="if(event.target === this) closeModal('userModal')">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="userModalTitle">Añadir Pediatra</h2>
                    <button class="close-btn" onclick="closeModal('userModal')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="form-group">
                    <label>Nombre Completo</label>
                    <input type="text" id="userModalName" class="form-control" placeholder="Ej. Dra. Ana Gómez">
                </div>
                <div class="form-group">
                    <label>Correo Electrónico</label>
                    <input type="email" id="userModalEmail" class="form-control" placeholder="ej. dra.ana@peditrack.com">
                </div>
                <div class="form-group">
                    <label>Contraseña</label>
                    <input type="text" id="userModalPassword" class="form-control" placeholder="Contraseña">
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="saveUser()">Guardar Pediatra</button>
            </div>
        </div>

        <!-- Confirm Delete User Modal -->
        <div class="modal-overlay" id="deleteUserModal" onclick="if(event.target === this) closeModal('deleteUserModal')">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <i class="fa-solid fa-user-xmark" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                <h2 style="margin-bottom: 1rem;">¿Eliminar Pediatra?</h2>
                <p style="color: var(--text-light); margin-bottom: 1.5rem;">Esta acción no se puede deshacer. Los pacientes de este pediatra quedarán sin asignar.</p>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn" style="flex: 1; background: #f1f5f9; color: var(--text-dark);" onclick="closeModal('deleteUserModal')">Cancelar</button>
                    <button class="btn" style="flex: 1; background: #ef4444; color: white;" onclick="confirmDeleteUser()">Eliminar</button>
                </div>
            </div>
        </div>

        <!-- Assign Patient Modal -->
        <div class="modal-overlay" id="assignPatientModal" onclick="if(event.target === this) closeModal('assignPatientModal')">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Asignar Pediatra</h2>
                    <button class="close-btn" onclick="closeModal('assignPatientModal')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <p style="color: var(--text-light); margin-bottom: 1rem;">Selecciona el pediatra que atenderá a este paciente.</p>
                <div class="form-group">
                    <label>Pediatra</label>
                    <select id="assignPatientSelect" class="form-control">
                        <option value="">Sin asignar</option>
                        ${users.filter(u => u.role === 'pediatra').map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="savePatientAssignment()">Guardar Asignación</button>
            </div>
        </div>
    `;
}

function renderOnboarding() {
    const totalSteps = 7;
    const stepTitles = [
        "Datos Generales y Nacimiento",
        "Antecedentes Familiares",
        "Primeros Estudios y Vacunas",
        "Alimentación",
        "Digestión (Pañales)",
        "Sueño y Seguridad",
        "Desarrollo y Sentidos"
    ];

    let content = '';
    
    if (currentOnboardingStep === 1) {
        content = `
            <div class="form-group">
                <label>Nombre completo del bebé</label>
                <input type="text" id="new-patient-name" class="form-control" placeholder="Ej. Juan Pérez">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Fecha de nacimiento</label>
                    <input type="date" class="form-control">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Sexo</label>
                    <select name="Sexo" class="form-control">
                        <option value="">Selecciona...</option>
                        <option value="Masculino">Masculino</option>
                        <option value="Femenino">Femenino</option>
                    </select>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Nombre de la mamá</label>
                    <input type="text" class="form-control" placeholder="Ej. María Gómez">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label>Nombre del papá</label>
                    <input type="text" class="form-control" placeholder="Ej. Carlos Pérez">
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 2rem 0;">
            <h3 style="margin-bottom: 1.5rem; color: var(--primary); font-size: 1.2rem;">Información del Embarazo y Nacimiento</h3>
            <div class="form-group">
                <label>¿De cuántas semanas exactas de gestación nació?</label>
                <input type="number" class="form-control" placeholder="Ej. 39">
            </div>
            <div class="form-group">
                <label>¿Hubo alguna complicación durante tu embarazo?</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Ninguna" onchange="handleComplicationsChange(this)"> Ninguna</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Infecciones" onchange="handleComplicationsChange(this)"> Infecciones</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Presión alta" onchange="handleComplicationsChange(this)"> Presión alta</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Diabetes" onchange="handleComplicationsChange(this)"> Diabetes</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Otra" onchange="handleComplicationsChange(this)"> Otra</label>
                </div>
                <input type="text" id="otra-complicacion" class="form-control animate-fade-in" placeholder="Especificar otra complicación..." style="display: none; margin-top: 0.5rem;">
            </div>
            <div class="form-group">
                <label>¿Tomaste algún medicamento mientras estabas embarazada?</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Ninguno" onchange="handleMedicationsChange(this)"> Ninguno</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Ácido Fólico" onchange="handleMedicationsChange(this)"> Ácido Fólico</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Hierro" onchange="handleMedicationsChange(this)"> Hierro</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Vitaminas prenatales" onchange="handleMedicationsChange(this)"> Vitaminas prenatales</label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;"><input type="checkbox" value="Otros" onchange="handleMedicationsChange(this)"> Otros</label>
                </div>
                <input type="text" id="otros-medicamentos" class="form-control animate-fade-in" placeholder="Especificar otros medicamentos..." style="display: none; margin-top: 0.5rem;">
            </div>
            <div class="form-group">
                <label>¿El nacimiento fue por parto natural o por cesárea?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="tipoParto" value="Natural" onchange="document.getElementById('motivo-cesarea').style.display = 'none'"> Natural
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="tipoParto" value="Cesárea" onchange="document.getElementById('motivo-cesarea').style.display = 'block'"> Cesárea
                    </label>
                </div>
                <input type="text" id="motivo-cesarea" class="form-control animate-fade-in" placeholder="¿Cuál fue el motivo de la cesárea?" style="display: none; margin-top: 0.5rem;">
            </div>
            <div class="form-group">
                <label>¿El bebé lloró y respiró inmediatamente al nacer?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="lloroNacer" value="Sí" onchange="document.getElementById('motivo-no-lloro').style.display = 'none'"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="lloroNacer" value="No" onchange="document.getElementById('motivo-no-lloro').style.display = 'block'"> No
                    </label>
                </div>
                <input type="text" id="motivo-no-lloro" class="form-control animate-fade-in" placeholder="¿Por qué no lloró/respiró inmediatamente?" style="display: none; margin-top: 0.5rem; margin-bottom: 1rem;">
                
                <label style="margin-top: 1rem; display: block; font-size: 0.95rem; color: var(--text-light);">Calificación Apgar:</label>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                    <input type="radio" name="apgarScore" id="apgar1" value="1" class="apgar-radio"><label for="apgar1" class="apgar-label">1</label>
                    <input type="radio" name="apgarScore" id="apgar2" value="2" class="apgar-radio"><label for="apgar2" class="apgar-label">2</label>
                    <input type="radio" name="apgarScore" id="apgar3" value="3" class="apgar-radio"><label for="apgar3" class="apgar-label">3</label>
                    <input type="radio" name="apgarScore" id="apgar4" value="4" class="apgar-radio"><label for="apgar4" class="apgar-label">4</label>
                    <input type="radio" name="apgarScore" id="apgar5" value="5" class="apgar-radio"><label for="apgar5" class="apgar-label">5</label>
                    <input type="radio" name="apgarScore" id="apgar6" value="6" class="apgar-radio"><label for="apgar6" class="apgar-label">6</label>
                    <input type="radio" name="apgarScore" id="apgar7" value="7" class="apgar-radio"><label for="apgar7" class="apgar-label">7</label>
                    <input type="radio" name="apgarScore" id="apgar8" value="8" class="apgar-radio"><label for="apgar8" class="apgar-label">8</label>
                    <input type="radio" name="apgarScore" id="apgar9" value="9" class="apgar-radio"><label for="apgar9" class="apgar-label">9</label>
                </div>
            </div>
            <div class="form-group">
                <label>¿Cuál fue su peso (kg), su talla (cm) y su perímetro cefálico (cm) al nacer?</label>
                <div style="display: flex; gap: 1rem;">
                    <input type="number" step="0.1" class="form-control" placeholder="Peso">
                    <input type="number" step="0.1" class="form-control" placeholder="Talla">
                    <input type="number" step="0.1" class="form-control" placeholder="PC">
                </div>
            </div>
            <div class="form-group">
                <label>¿Se fue a casa contigo o requirió quedarse internado?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="fueACasa" value="Sí" onchange="document.getElementById('motivo-internado').style.display = 'none'"> Sí (a casa)
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="fueACasa" value="No" onchange="document.getElementById('motivo-internado').style.display = 'block'"> No (internado)
                    </label>
                </div>
                <input type="text" id="motivo-internado" class="form-control animate-fade-in" placeholder="¿Por qué tuvo que quedarse internado?" style="display: none; margin-top: 0.5rem;">
            </div>
            <div class="form-group">
                <label>¿Se puso amarillo (ictericia) durante sus primeros días de vida?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="ictericia" value="Sí"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="ictericia" value="No"> No
                    </label>
                </div>
            </div>
        `;
    } else if (currentOnboardingStep === 2) {
        content = `
            <div class="form-group">
                <label>¿Hay enfermedades importantes en los padres, abuelos o hermanos (asma, alergias severas, enfermedades del corazón, diabetes, alteraciones genéticas)?</label>
                <textarea class="form-control" rows="3" placeholder="Detallar familiares y enfermedades..."></textarea>
            </div>
            <div class="form-group">
                <label>¿Cuál es la estatura de mamá y papá (cm)?</label>
                <div style="display: flex; gap: 1rem;">
                    <input type="number" class="form-control" placeholder="Estatura Mamá">
                    <input type="number" class="form-control" placeholder="Estatura Papá">
                </div>
            </div>
        `;
    } else if (currentOnboardingStep === 3) {
        const tamices = [
            { id: 'metabolico', label: 'Tamiz Metabólico (Prueba del talón)' },
            { id: 'auditivo', label: 'Tamiz Auditivo Neonatal' },
            { id: 'cardiaco', label: 'Tamiz Cardiaco Neonatal' },
            { id: 'visual', label: 'Tamiz Visual' },
            { id: 'ortopedico', label: 'Tamiz Ortopédico' }
        ];

        const tamicesHtml = tamices.map(t => `
            <div class="form-group">
                <label>${t.label}</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="tamiz_${t.id}" value="Sí" onchange="document.getElementById('resultado-${t.id}').style.display = 'block'"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="tamiz_${t.id}" value="No" onchange="document.getElementById('resultado-${t.id}').style.display = 'none'"> No
                    </label>
                </div>
                <div id="resultado-${t.id}" style="display: none; margin-top: 0.5rem;" class="animate-fade-in">
                    <label style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 0.3rem; display: block;">Resultado:</label>
                    <select class="form-control">
                        <option value="">Selecciona una opción...</option>
                        <option value="Normal">Normal</option>
                        <option value="Anormal">Anormal</option>
                        <option value="No concluyente">No concluyente</option>
                    </select>
                </div>
            </div>
        `).join('');

        content = `
            <h3 style="margin-bottom: 1.5rem; color: var(--primary); font-size: 1.2rem;">Tamices (Estudios Iniciales)</h3>
            
            ${tamicesHtml}

            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 2rem 0;">
            <h3 style="margin-bottom: 1.5rem; color: var(--primary); font-size: 1.2rem;">Vacunas al Nacer</h3>

            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; margin-bottom: 0.5rem;">
                    <input type="checkbox" onchange="document.getElementById('fecha-bcg').style.display = this.checked ? 'block' : 'none'"> BCG (Tuberculosis)
                </label>
                <div id="fecha-bcg" style="display: none;" class="animate-fade-in">
                    <label style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 0.3rem; display: block;">Fecha de aplicación:</label>
                    <input type="date" class="form-control" style="max-width: 250px;">
                </div>
            </div>

            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; margin-bottom: 0.5rem;">
                    <input type="checkbox" onchange="document.getElementById('fecha-hepb').style.display = this.checked ? 'block' : 'none'"> Hepatitis B (1ra dosis)
                </label>
                <div id="fecha-hepb" style="display: none;" class="animate-fade-in">
                    <label style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 0.3rem; display: block;">Fecha de aplicación:</label>
                    <input type="date" class="form-control" style="max-width: 250px;">
                </div>
            </div>
        `;
    } else if (currentOnboardingStep === 4) {
        content = `
            <div class="form-group">
                <label>¿Qué está comiendo actualmente el bebé?</label>
                <select class="form-control" onchange="handleAlimentacionChange(this.value)">
                    <option value="">Selecciona una opción...</option>
                    <option value="materna">Leche materna exclusiva</option>
                    <option value="formula">Fórmula exclusiva</option>
                    <option value="mixta">Lactancia mixta</option>
                </select>
            </div>
            
            <div id="seccion-materna" style="display: none;" class="animate-fade-in">
                <h4 style="color: var(--primary); margin-bottom: 1rem; margin-top: 1.5rem; border-bottom: 1px solid var(--primary-light); padding-bottom: 0.5rem;">Detalles de Leche Materna</h4>
                <div class="form-group">
                    <label>¿Cada cuánto pide pecho?</label>
                    <input type="text" class="form-control" placeholder="Ej. A libre demanda, cada 2 horas...">
                </div>
                <div class="form-group">
                    <label>¿Cuánto tiempo dura comiendo (en promedio)?</label>
                    <input type="text" class="form-control" placeholder="Ej. 15 minutos por pecho...">
                </div>
                <div class="form-group">
                    <label>¿Tienes dolor al amamantar?</label>
                    <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="radio" name="dolorPecho" value="Sí"> Sí</label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"><input type="radio" name="dolorPecho" value="No"> No</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Comentarios adicionales</label>
                    <textarea class="form-control" rows="2" placeholder="Ej. Problemas de agarre, uso de pezoneras..."></textarea>
                </div>
            </div>

            <div id="seccion-formula" style="display: none;" class="animate-fade-in">
                <h4 style="color: var(--secondary); margin-bottom: 1rem; margin-top: 1.5rem; border-bottom: 1px solid var(--primary-light); padding-bottom: 0.5rem;">Detalles de Fórmula</h4>
                <div class="form-group">
                    <label>¿Qué marca de fórmula toma?</label>
                    <input type="text" class="form-control" placeholder="Ej. NAN 1, Similac...">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>¿Cuántas onzas toma?</label>
                        <input type="number" step="0.5" class="form-control" placeholder="Ej. 3">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>¿Cada cuántas horas?</label>
                        <input type="number" step="0.5" class="form-control" placeholder="Ej. 3">
                    </div>
                </div>
            </div>
        `;
    } else if (currentOnboardingStep === 5) {
        content = `
            <div class="form-group">
                <label>¿Regurgita o devuelve mucha leche después de comer?</label>
                <input type="text" class="form-control" placeholder="Sí / No, frecuencia...">
            </div>
            <div class="form-group">
                <label>¿Cuántos pañales de pipí moja en 24 horas?</label>
                <input type="number" class="form-control" placeholder="Ej. 6">
            </div>
            <div class="form-group">
                <label>¿Cuántas veces hace popó al día y de qué color y consistencia es?</label>
                <input type="text" class="form-control" placeholder="Ej. 3 veces, amarillo mostaza, aguada...">
            </div>
            <div class="form-group">
                <label>¿Sufre de cólicos o tiene episodios de llanto inconsolable?</label>
                <textarea class="form-control" rows="2" placeholder="Ej. Sí, por las tardes llora mucho..."></textarea>
            </div>
        `;
    } else if (currentOnboardingStep === 6) {
        content = `
            <div class="form-group">
                <label>¿En dónde está durmiendo el bebé?</label>
                <select class="form-control" onchange="document.getElementById('otro-lugar-dormir').style.display = this.value === 'Otros' ? 'block' : 'none'">
                    <option value="">Selecciona una opción...</option>
                    <option value="Cuna">Cuna</option>
                    <option value="Moisés">Moisés</option>
                    <option value="Cama compartida">Cama compartida (Colecho)</option>
                    <option value="Otros">Otros</option>
                </select>
                <input type="text" id="otro-lugar-dormir" class="form-control animate-fade-in" placeholder="Especifica en dónde..." style="display: none; margin-top: 0.5rem;">
            </div>
            <div class="form-group">
                <label>¿En qué posición lo acuestas para dormir?</label>
                <select class="form-control">
                    <option>Boca arriba</option>
                    <option>De lado</option>
                    <option>Boca abajo</option>
                </select>
            </div>
            <div class="form-group">
                <label>¿Hay cobijas sueltas, almohadas o peluches en su cuna?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="objetosCuna" value="Sí"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="objetosCuna" value="No"> No
                    </label>
                </div>
            </div>
            <div class="form-group">
                <label>¿Cuántas horas seguidas logra dormir de día y de noche?</label>
                <input type="text" class="form-control" placeholder="Ej. 2h de día, 4h de noche...">
            </div>
            <div class="form-group">
                <label>¿Alguien fuma dentro de la casa o cerca del bebé?</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="fumaCasa" value="Sí"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="fumaCasa" value="No"> No
                    </label>
                </div>
            </div>
        `;
    } else if (currentOnboardingStep === 7) {
        const devQuestions = [
            { id: 'fijaMirada', text: '¿Fija la mirada en tu cara cuando te acercas a hablarle?' },
            { id: 'sustoRuidos', text: '¿Se sobresalta o asusta con los ruidos fuertes?' },
            { id: 'calmaVoz', text: '¿Se calma al escuchar la voz de mamá o papá?' },
            { id: 'levantaCabeza', text: 'Cuando lo pones boca abajo (despierto), ¿intenta mover o levantar la cabeza?' }
        ];

        const devHtml = devQuestions.map(q => `
            <div class="form-group">
                <label>${q.text}</label>
                <div style="display: flex; gap: 2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="${q.id}" value="Sí"> Sí
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer;">
                        <input type="radio" name="${q.id}" value="No"> No
                    </label>
                </div>
            </div>
        `).join('');

        content = `
            ${devHtml}
            <div class="form-group">
                <label>¿Cómo es su llanto y qué métodos les funcionan mejor para calmarlo?</label>
                <textarea class="form-control" rows="2" placeholder="Ej. Llanto fuerte, se calma al mecerlo..."></textarea>
            </div>
            <div class="form-group">
                <label>¿Cómo se sienten ustedes emocionalmente con esta nueva etapa?</label>
                <textarea class="form-control" rows="2" placeholder="Ej. Muy cansados pero felices..."></textarea>
            </div>
            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 2rem 0;">
            <h3 style="margin-bottom: 1.5rem; color: var(--primary); font-size: 1.2rem;">Crear Acceso para el Tutor</h3>
            <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 1rem;">Al finalizar se generará automáticamente una contraseña para que el tutor pueda acceder a la plataforma.</p>
            <div class="form-group">
                <label>Correo Electrónico del Tutor</label>
                <input type="email" id="tutorEmail" class="form-control" placeholder="ej. tutor@correo.com">
            </div>
        `;
    }

    let progressPercentage = ((currentOnboardingStep) / totalSteps) * 100;

    return `
        <div class="onboarding-view animate-fade-in">
            <div class="onboarding-header">
                <h1 style="font-size: 2rem; margin-bottom: 0.5rem;">Crear Perfil del Bebé</h1>
                <p style="color: var(--text-light); font-size: 1.1rem; margin-bottom: 2rem;">Paso ${currentOnboardingStep} de ${totalSteps}: <strong style="color: var(--primary);">${stepTitles[currentOnboardingStep - 1]}</strong></p>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${progressPercentage}%"></div>
                </div>
            </div>
            
            <div class="onboarding-content">
                ${content}
            </div>
            
            <div class="onboarding-footer">
                <button class="btn btn-secondary" onclick="prevOnboardingStep()" ${currentOnboardingStep === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    <i class="fa-solid fa-arrow-left"></i> Anterior
                </button>
                
                ${currentOnboardingStep < totalSteps ? 
                    '<button class="btn btn-primary" onclick="nextOnboardingStep()">Siguiente <i class="fa-solid fa-arrow-right"></i></button>' : 
                    '<button class="btn btn-primary" style="background-color: var(--secondary); color: var(--text-dark);" onclick="finishOnboarding()">Finalizar y Guardar <i class="fa-solid fa-check"></i></button>'
                }
            </div>
        </div>
    `;
}

function formatLabel(key) {
    const knownKeys = {
        'new-patient-name': 'Nombre del Bebé',
        'Ej. María Gómez': 'Nombre de la Madre',
        'Ej. Carlos Pérez': 'Nombre del Padre',
        'Ej. 39': 'Semanas de Gestación',
        'Campo': 'Datos Adicionales',
        'tipoParto': 'Tipo de Parto',
        'lloroNacer': 'Lloró al nacer',
        'apgarScore': 'Apgar',
        'Peso': 'Peso al nacer (kg)',
        'Talla': 'Talla al nacer (cm)',
        'PC': 'Perímetro Cefálico (cm)',
        'fueACasa': 'Se fue a casa',
        'ictericia': 'Presentó Ictericia',
        'Detallar familiares y enfermedades...': 'Antecedentes Familiares',
        'Estatura Mamá': 'Estatura Mamá (cm)',
        'Estatura Papá': 'Estatura Papá (cm)',
        'tamiz_metabolico': 'Tamiz Metabólico',
        'tamiz_auditivo': 'Tamiz Auditivo',
        'tamiz_cardiaco': 'Tamiz Cardiaco',
        'tamiz_visual': 'Tamiz Visual',
        'tamiz_ortopedico': 'Tamiz Ortopédico',
        'Fecha de aplicación': 'Fecha de aplicación',
        'Resultado': 'Resultado del Tamiz',
        '¿Qué está comiendo actualmente el bebé?': 'Alimentación Actual',
        'Ej. A libre demanda, cada 2 horas...': 'Frecuencia de alimentación',
        'Ej. 15 minutos por pecho...': 'Duración promedio',
        'dolorPecho': 'Dolor al amamantar',
        'Ej. Problemas de agarre, uso de pezoneras...': 'Comentarios Lactancia',
        'Sí / No, frecuencia...': 'Regurgita',
        'Ej. 6': 'Pañales de pipí (24h)',
        'Ej. 3 veces, amarillo mostaza, aguada...': 'Evacuaciones (popó)',
        'Ej. Sí, por las tardes llora mucho...': 'Cólicos o llanto',
        '¿En dónde está durmiendo el bebé?': 'Lugar para dormir',
        '¿En qué posición lo acuestas para dormir?': 'Posición al dormir',
        'objetosCuna': 'Objetos en la cuna',
        'Ej. 2h de día, 4h de noche...': 'Horas de sueño',
        'fumaCasa': 'Fuman en casa',
        'fijaMirada': 'Fija la mirada',
        'sustoRuidos': 'Se asusta con ruidos',
        'calmaVoz': 'Se calma con voz',
        'levantaCabeza': 'Levanta la cabeza',
        'Ej. Llanto fuerte, se calma al mecerlo...': 'Llanto y métodos',
        'Ej. Muy cansados pero felices...': 'Estado emocional padres',
        'Ej. NAN 1, Similac...': 'Fórmula',
        'Ej. 3': 'Onzas o frecuencia',
        'Ninguna': 'Complicaciones embarazo',
        'Ninguno': 'Medicamentos embarazo'
    };

    if (knownKeys[key]) return knownKeys[key];

    let formatted = key.replace(/^Ej\.\s*/i, '').replace(/[:?¿]/g, '').trim();
    formatted = formatted.replace(/([A-Z])/g, ' $1');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function categorizeOnboardingData(data) {
    const categories = {
        "Datos Generales y Nacimiento": [],
        "Antecedentes Familiares": [],
        "Primeros Estudios y Vacunas": [],
        "Alimentación": [],
        "Digestión (Pañales)": [],
        "Sueño y Seguridad": [],
        "Desarrollo y Sentidos": [],
        "Otros Registros": []
    };

    const stepMapping = {
        'new-patient-name': 1, 'Ej. María Gómez': 1, 'Ej. Carlos Pérez': 1, 'Ej. 39': 1,
        'tipoParto': 1, 'lloroNacer': 1, 'apgarScore': 1, 'Peso': 1, 'Talla': 1, 'PC': 1, 'fueACasa': 1, 'ictericia': 1,
        'Ninguna': 1, 'Ninguno': 1, 'Fecha de nacimiento': 1, 'Campo': 1,
        'Detallar familiares y enfermedades...': 2, 'Estatura Mamá': 2, 'Estatura Papá': 2,
        'tamiz_metabolico': 3, 'tamiz_auditivo': 3, 'tamiz_cardiaco': 3, 'tamiz_visual': 3, 'tamiz_ortopedico': 3, 'Fecha de aplicación': 3, 'Resultado': 3,
        '¿Qué está comiendo actualmente el bebé?': 4, 'Ej. A libre demanda, cada 2 horas...': 4, 'Ej. 15 minutos por pecho...': 4,
        'dolorPecho': 4, 'Ej. Problemas de agarre, uso de pezoneras...': 4, 'Ej. NAN 1, Similac...': 4, 'Ej. 3': 4,
        'Sí / No, frecuencia...': 5, 'Ej. 6': 5, 'Ej. 3 veces, amarillo mostaza, aguada...': 5, 'Ej. Sí, por las tardes llora mucho...': 5,
        '¿En dónde está durmiendo el bebé?': 6, '¿En qué posición lo acuestas para dormir?': 6, 'objetosCuna': 6, 'Ej. 2h de día, 4h de noche...': 6, 'fumaCasa': 6,
        'fijaMirada': 7, 'sustoRuidos': 7, 'calmaVoz': 7, 'levantaCabeza': 7, 'Ej. Llanto fuerte, se calma al mecerlo...': 7, 'Ej. Muy cansados pero felices...': 7
    };

    const stepTitles = [
        "Otros Registros",
        "Datos Generales y Nacimiento",
        "Antecedentes Familiares",
        "Primeros Estudios y Vacunas",
        "Alimentación",
        "Digestión (Pañales)",
        "Sueño y Seguridad",
        "Desarrollo y Sentidos"
    ];

    Object.entries(data).forEach(([k, v]) => {
        if (!v || v.trim() === '') return;
        const stepNum = stepMapping[k] || 0;
        const catName = stepTitles[stepNum];
        categories[catName].push({ key: k, value: v });
    });

    return categories;
}

// Navigation
window.handleLogin = function() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const user = users.find(u => u.email === email && u.password === pass);

    if (user) {
        currentUser = user;
        localStorage.setItem('peditrack_user', JSON.stringify(user));
        navigate(getRoleDefaultView(user.role));
    } else {
        alert('Credenciales incorrectas. Verifica tu correo y contraseña.');
    }
}

window.handleLogout = function() {
    currentUser = null;
    localStorage.removeItem('peditrack_user');
    navigate('login');
}

window.navigate = function(view) {
    if (!currentUser && view !== 'login') {
        currentView = 'login';
    } else if (currentUser && view === 'login') {
        currentView = getRoleDefaultView(currentUser.role);
    } else if (currentUser && currentUser.role === 'tutor' && view !== 'parent-profile') {
        alert("Acceso denegado: Solo puedes ver el perfil de tu bebé.");
        currentView = 'parent-profile';
    } else {
        currentView = view;
    }
    renderApp();
    window.scrollTo(0,0);
}

window.viewPatient = function(id) {
    currentPatientId = id;
    navigate('parent-profile');
}

function validateCurrentStep() {
    const container = document.querySelector('.onboarding-content');
    if (!container) return true;

    const elements = container.querySelectorAll('input, select, textarea');
    let isValid = true;
    let firstInvalid = null;
    const radioGroups = {};
    const checkboxGroups = {};

    elements.forEach(el => {
        // Ignorar si está oculto explícitamente
        if (el.closest('[style*="display: none"]')) return;
        
        // Limpiar estilos previos
        el.style.borderColor = '';
        const label = el.closest('label');
        if (label) label.style.color = '';

        if (el.type === 'radio') {
            if (!radioGroups[el.name]) radioGroups[el.name] = [];
            radioGroups[el.name].push(el);
        } else if (el.type === 'checkbox') {
            // Validar grupos de checkboxes en cuadrículas (como Complicaciones o Medicamentos)
            const parentGroup = el.closest('div[style*="grid-template-columns: 1fr 1fr"]');
            if (parentGroup) {
                const key = 'cbGroup_' + parentGroup.offsetTop;
                if (!checkboxGroups[key]) checkboxGroups[key] = [];
                checkboxGroups[key].push(el);
            }
        } else {
            if (!el.value || el.value.trim() === "") {
                isValid = false;
                el.style.borderColor = '#ef4444'; // rojo
                if (!firstInvalid) firstInvalid = el;
            }
        }
    });

    Object.values(radioGroups).forEach(group => {
        if (!group.some(r => r.checked)) {
            isValid = false;
            group.forEach(r => {
                const label = r.closest('label');
                if (label) label.style.color = '#ef4444';
            });
            if (!firstInvalid) firstInvalid = group[0];
        }
    });

    Object.values(checkboxGroups).forEach(group => {
        if (!group.some(c => c.checked)) {
            isValid = false;
            group.forEach(c => {
                const label = c.closest('label');
                if (label) label.style.color = '#ef4444';
            });
            if (!firstInvalid) firstInvalid = group[0];
        }
    });

    if (!isValid) {
        alert("Por favor, responde todas las preguntas visibles antes de continuar.");
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
            firstInvalid.focus();
        }
    }

    return isValid;
}

function saveCurrentStepData() {
    if (!window.newPatientData) window.newPatientData = {};
    const inputs = document.querySelectorAll('.onboarding-content input, .onboarding-content select, .onboarding-content textarea');
    
    inputs.forEach(input => {
        let key = input.name || input.id || input.placeholder || (input.previousElementSibling ? input.previousElementSibling.innerText : 'Campo');
        if (input.type === 'checkbox' || input.type === 'radio') {
            if (input.checked) {
                if (window.newPatientData[key] && window.newPatientData[key] !== input.value && !window.newPatientData[key].includes(input.value)) {
                    window.newPatientData[key] += ", " + input.value;
                } else {
                    window.newPatientData[key] = input.value;
                }
            }
        } else {
            if (input.value && input.value.trim() !== "") {
                window.newPatientData[key] = input.value;
            }
        }
    });
}

window.nextOnboardingStep = function() {
    if (!validateCurrentStep()) return;

    saveCurrentStepData();

    if (currentOnboardingStep === 1) {
        const nameInput = document.getElementById('new-patient-name');
        if (nameInput && nameInput.value) {
            window.newPatientName = nameInput.value;
        }
    }
    if (currentOnboardingStep < 7) {
        currentOnboardingStep++;
        renderApp();
        window.scrollTo(0,0);
    }
}

window.prevOnboardingStep = function() {
    if (currentOnboardingStep > 1) {
        saveCurrentStepData();
        currentOnboardingStep--;
        renderApp();
        window.scrollTo(0,0);
    }
}

window.finishOnboarding = function() {
    if (!validateCurrentStep()) return;

    saveCurrentStepData();
    
    const newName = window.newPatientName || "Bebé Nuevo";
    
    const newPatient = {
        id: patients.length + 1,
        name: newName,
        age: '0 meses',
        weight: window.newPatientData['Peso'] || 3.2,
        height: window.newPatientData['Talla'] || 50,
        lastVisit: 'Hoy',
        doctorId: currentUser ? currentUser.id : null,
        onboardingData: window.newPatientData,
        consultations: []
    };
    
    patients.unshift(newPatient);
    
    // Guardar en el almacenamiento local para persistencia
    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    
    console.log("¡Paciente creado! Datos del expediente:", newPatient);
    
    const tutorEmail = window.newPatientData['tutorEmail'];
    let generatedPassword = '';
    const momName = window.newPatientData['Ej. María Gómez'] || 'No especificado';
    const dadName = window.newPatientData['Ej. Carlos Pérez'] || 'No especificado';

    if (tutorEmail) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        for (let i = 0; i < 8; i++) {
            generatedPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const newTutor = {
            id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
            email: tutorEmail,
            password: generatedPassword,
            role: 'tutor',
            name: 'Tutor de ' + newName
        };
        users.push(newTutor);
        localStorage.setItem('peditrack_users', JSON.stringify(users));
    }
    
    window.successData = {
        patientName: newName,
        tutorEmail: tutorEmail,
        password: generatedPassword,
        momName: momName,
        dadName: dadName
    };
    
    currentOnboardingStep = 1;
    window.newPatientName = ""; 
    window.newPatientData = {}; 
    currentView = 'onboarding-success';
    renderApp();
    window.scrollTo(0,0);
}

// Modals
window.editingConsultIndex = null;

window.openModal = function(id) {
    document.getElementById(id).classList.add('active');
}

window.addMedicationField = function(med = null) {
    const list = document.getElementById('medicationsList');
    if (!list) return;
    const index = list.children.length;
    const div = document.createElement('div');
    div.className = 'medication-item';
    div.style.position = 'relative';
    div.innerHTML = `
        ${index > 0 ? '<hr style="border:0; border-top: 1px dashed #cbd5e1; margin: 1rem 0;">' : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label style="font-size: 0.9rem; margin-bottom: 0;">Medicamento ${index + 1}</label>
            ${index > 0 ? `<button class="btn" style="padding: 0; color: #ef4444; background: transparent; box-shadow: none;" onclick="this.closest('.medication-item').remove()" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
        <div class="form-group" style="margin-bottom: 0.5rem;">
            <input type="text" class="form-control med-name" placeholder="Nombre (Ej. Paracetamol)" value="${med && med.name ? med.name : ''}">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.5rem;">
            <div class="form-group" style="margin-bottom: 0;">
                <input type="text" class="form-control med-dose" placeholder="Dosis (Ej. 5ml)" value="${med && med.dose ? med.dose : ''}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <input type="text" class="form-control med-freq" placeholder="Frecuencia (Ej. 8h)" value="${med && med.freq ? med.freq : ''}">
            </div>
        </div>
    `;
    list.appendChild(div);
}

window.closeModal = function(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'addConsultModal') {
        window.editingConsultIndex = null;
        ['consultWeight', 'consultHeight', 'consultHead', 'consultNotes'].forEach(inputId => {
            if(document.getElementById(inputId)) document.getElementById(inputId).value = "";
        });
        if(document.getElementById('consultType')) document.getElementById('consultType').value = "Control de niño sano";
        if(document.getElementById('consultMedicationReq')) {
            document.getElementById('consultMedicationReq').value = "No";
            document.getElementById('medicationDetails').style.display = 'none';
        }
        if(document.getElementById('medicationsList')) {
            document.getElementById('medicationsList').innerHTML = '';
            window.addMedicationField();
        }
    } else if (id === 'userModal') {
        window.editingUserId = null;
        document.getElementById('userModalTitle').innerText = "Añadir Pediatra";
        document.getElementById('userModalName').value = "";
        document.getElementById('userModalEmail').value = "";
        document.getElementById('userModalPassword').value = "";
    }
}

// Initialize Chart.js
function initChart() {
    const ctx = document.getElementById('growthChart');
    if (!ctx) return;

    const p = patients.find(pat => pat.id === currentPatientId) || patients[0];
    if (!p) return;

    let labels = [];
    let weights = [];

    // Punto 1: Datos de nacimiento / registro
    if (p.onboardingData) {
        const birthDate = p.onboardingData['Fecha de nacimiento'] || 'Nacimiento';
        const birthWeight = parseFloat(p.onboardingData['Peso']) || parseFloat(p.weight) || 0;
        
        if (birthWeight > 0) {
            labels.push(birthDate);
            weights.push(birthWeight);
        }
    } else if (p.weight) {
        labels.push('Nacimiento');
        weights.push(parseFloat(p.weight));
    }

    // Puntos a sumar: Consultas
    if (p.consultations && p.consultations.length > 0) {
        const dataHistory = [...p.consultations].reverse();
        labels = labels.concat(dataHistory.map(h => h.date));
        weights = weights.concat(dataHistory.map(h => parseFloat(h.weight)));
    }

    if (weights.length === 0) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Peso (kg)',
                data: weights,
                borderColor: '#4A90E2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#4A90E2',
                pointBorderWidth: 2,
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { borderDash: [5, 5], color: '#E2E8F0' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

window.saveConsult = function() {
    const p = patients.find(pat => pat.id === currentPatientId);
    if (!p) return;
    
    const weight = document.getElementById('consultWeight').value;
    const height = document.getElementById('consultHeight').value;
    const head = document.getElementById('consultHead') ? document.getElementById('consultHead').value : '';
    const type = document.getElementById('consultType') ? document.getElementById('consultType').value : 'Control de niño sano';
    const reqMed = document.getElementById('consultMedicationReq') ? document.getElementById('consultMedicationReq').value : 'No';
    const notes = document.getElementById('consultNotes').value;
    
    if (!weight || !height) {
        alert("Por favor ingrese al menos el peso y la estatura.");
        return;
    }

    if (!p.consultations) p.consultations = [];

    const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    let medicationsArray = [];
    if (reqMed === 'Sí') {
        const medItems = document.querySelectorAll('.medication-item');
        medItems.forEach(item => {
            const name = item.querySelector('.med-name').value;
            const dose = item.querySelector('.med-dose').value;
            const freq = item.querySelector('.med-freq').value;
            if (name) {
                medicationsArray.push({ name, dose, freq });
            }
        });
    }

    const newConsultData = {
        date: window.editingConsultIndex !== null ? p.consultations[window.editingConsultIndex].date : dateStr,
        weight: parseFloat(weight),
        height: parseFloat(height),
        head: head ? parseFloat(head) : null,
        type: type,
        medications: medicationsArray.length > 0 ? medicationsArray : null,
        notes: notes || ""
    };

    if (window.editingConsultIndex !== null) {
        p.consultations[window.editingConsultIndex] = newConsultData;
        window.editingConsultIndex = null;
    } else {
        p.consultations.unshift(newConsultData);
    }

    // Actualizar datos del paciente basados en la última consulta
    if (p.consultations.length > 0) {
        p.weight = p.consultations[0].weight;
        p.height = p.consultations[0].height;
        p.lastVisit = p.consultations[0].date;
    }

    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    
    closeModal('addConsultModal');
    renderApp();
}

window.editConsult = function(index) {
    const p = patients.find(pat => pat.id === currentPatientId);
    if (!p || !p.consultations || !p.consultations[index]) return;

    const h = p.consultations[index];
    window.editingConsultIndex = index;

    document.getElementById('consultWeight').value = h.weight || "";
    document.getElementById('consultHeight').value = h.height || "";
    
    if(document.getElementById('consultHead')) document.getElementById('consultHead').value = h.head || "";
    if(document.getElementById('consultType')) document.getElementById('consultType').value = h.type || "Control de niño sano";
    
    let medsToEdit = [];
    if (h.medication) medsToEdit.push(h.medication);
    if (h.medications && h.medications.length > 0) medsToEdit = medsToEdit.concat(h.medications);

    if (document.getElementById('consultMedicationReq')) {
        document.getElementById('consultMedicationReq').value = medsToEdit.length > 0 ? "Sí" : "No";
        document.getElementById('medicationDetails').style.display = medsToEdit.length > 0 ? "block" : "none";
    }

    if (document.getElementById('medicationsList')) {
        document.getElementById('medicationsList').innerHTML = '';
        if (medsToEdit.length > 0) {
            medsToEdit.forEach(m => window.addMedicationField(m));
        } else {
            window.addMedicationField();
        }
    }

    document.getElementById('consultNotes').value = h.notes || "";

    openModal('addConsultModal');
}

window.indexToDelete = null;

window.deleteConsult = function(index) {
    window.indexToDelete = index;
    openModal('deleteConfirmModal');
}

window.confirmDeleteConsult = function() {
    if (window.indexToDelete === null) return;
    const index = window.indexToDelete;

    const p = patients.find(pat => pat.id === currentPatientId);
    if (!p || !p.consultations) return;

    p.consultations.splice(index, 1);

    if (p.consultations.length > 0) {
        p.weight = p.consultations[0].weight;
        p.height = p.consultations[0].height;
        p.lastVisit = p.consultations[0].date;
    } else {
        p.weight = p.onboardingData && p.onboardingData['Peso'] ? parseFloat(p.onboardingData['Peso']) : 0;
        p.height = p.onboardingData && p.onboardingData['Talla'] ? parseFloat(p.onboardingData['Talla']) : 0;
        p.lastVisit = "Sin visitas";
    }

    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    closeModal('deleteConfirmModal');
    window.indexToDelete = null;
    renderApp();
}

// Initial Render
document.addEventListener('DOMContentLoaded', renderApp);

window.handleComplicationsChange = function(checkbox) {
    const container = checkbox.closest('.form-group');
    const ninguna = container.querySelector('input[value="Ninguna"]');
    const otras = container.querySelectorAll('input[type="checkbox"]:not([value="Ninguna"])');
    const inputOtra = document.getElementById('otra-complicacion');
    
    if (checkbox.value === 'Ninguna' && checkbox.checked) {
        // Desmarcar todas las demás
        otras.forEach(cb => cb.checked = false);
        if(inputOtra) inputOtra.style.display = 'none';
    } else if (checkbox.checked) {
        // Si se marca cualquier otra, desmarcar 'Ninguna'
        if(ninguna) ninguna.checked = false;
        
        if (checkbox.value === 'Otra') {
            if(inputOtra) inputOtra.style.display = 'block';
        }
    } else {
        if (checkbox.value === 'Otra') {
            if(inputOtra) inputOtra.style.display = 'none';
        }
    }
}

window.handleMedicationsChange = function(checkbox) {
    const container = checkbox.closest('.form-group');
    const ninguno = container.querySelector('input[value="Ninguno"]');
    const otras = container.querySelectorAll('input[type="checkbox"]:not([value="Ninguno"])');
    const inputOtros = document.getElementById('otros-medicamentos');
    
    if (checkbox.value === 'Ninguno' && checkbox.checked) {
        otras.forEach(cb => cb.checked = false);
        if(inputOtros) inputOtros.style.display = 'none';
    } else if (checkbox.checked) {
        if(ninguno) ninguno.checked = false;
        
        if (checkbox.value === 'Otros') {
            if(inputOtros) inputOtros.style.display = 'block';
        }
    } else {
        if (checkbox.value === 'Otros') {
            if(inputOtros) inputOtros.style.display = 'none';
        }
    }
}

window.handleAlimentacionChange = function(value) {
    const secMaterna = document.getElementById('seccion-materna');
    const secFormula = document.getElementById('seccion-formula');
    
    if (!secMaterna || !secFormula) return;
    
    if (value === 'materna') {
        secMaterna.style.display = 'block';
        secFormula.style.display = 'none';
    } else if (value === 'formula') {
        secMaterna.style.display = 'none';
        secFormula.style.display = 'block';
    } else if (value === 'mixta') {
        secMaterna.style.display = 'block';
        secFormula.style.display = 'block';
    } else {
        secMaterna.style.display = 'none';
        secFormula.style.display = 'none';
    }
}

window.printPrescription = function(index) {
    const p = patients.find(pat => pat.id === currentPatientId);
    if (!p || !p.consultations || !p.consultations[index]) return;
    
    const h = p.consultations[index];
    
    let medsToRender = [];
    if (h.medication) medsToRender.push(h.medication);
    if (h.medications && h.medications.length > 0) medsToRender = medsToRender.concat(h.medications);

    if (medsToRender.length === 0) {
        alert("No hay medicamentos para imprimir.");
        return;
    }

    const ageStr = calculateAgeString(p.onboardingData ? p.onboardingData['Fecha de nacimiento'] : null, p.age);

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Receta Médica - ${p.name}</title>
        <style>
            body { font-family: 'Outfit', sans-serif, Arial; padding: 40px; color: #1e293b; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #4A90E2; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #4A90E2; font-size: 28px; letter-spacing: 1px; }
            .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
            .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 40px; font-size: 14px; }
            .patient-info div { background: #f8fafc; padding: 12px 15px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .rx { font-size: 40px; color: #4A90E2; margin-bottom: 20px; font-weight: bold; font-family: serif; font-style: italic; }
            .med-list { list-style: none; padding: 0; margin-left: 20px; }
            .med-list li { margin-bottom: 25px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 15px; }
            .med-name { font-weight: bold; font-size: 18px; margin-bottom: 8px; color: #0f172a; }
            .med-details { font-size: 15px; color: #475569; }
            .footer { margin-top: 80px; text-align: center; font-size: 14px; }
            .signature { margin-top: 60px; border-top: 1px solid #94a3b8; width: 250px; margin-left: auto; margin-right: auto; padding-top: 10px; color: #475569; }
            @media print {
                body { padding: 0; }
                .patient-info div { border: 1px solid #000; background: transparent; }
                .header { border-bottom: 2px solid #000; }
                .rx { color: #000; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Dr. Roberto Pediátrico</h1>
            <p>Especialista en Pediatría Integral</p>
            <p>Cédula Prof. 1234567 | Tel. 555-0123</p>
        </div>
        
        <div class="patient-info">
            <div><strong>Paciente:</strong> ${p.name}</div>
            <div><strong>Fecha:</strong> ${h.date}</div>
            <div><strong>Edad:</strong> ${ageStr}</div>
            <div><strong>Peso:</strong> ${h.weight} kg | <strong>Estatura:</strong> ${h.height} cm</div>
        </div>

        <div class="rx">Rx</div>

        <ul class="med-list">
            ${medsToRender.map(m => `
            <li>
                <div class="med-name">${m.name}</div>
                <div class="med-details"><strong>Dosis:</strong> ${m.dose} &nbsp;|&nbsp; <strong>Frecuencia:</strong> ${m.freq}</div>
            </li>
            `).join('')}
        </ul>

        <div class="footer">
            <div class="signature">Firma del Médico</div>
            <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Favor de surtir la receta tal como se indica.</p>
        </div>
        
        <script>
            window.onload = function() { 
                setTimeout(function() {
                    window.print();
                }, 500);
            }
        </script>
    </body>
    </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    setTimeout(() => {
        document.body.removeChild(iframe);
    }, 10000);
}

// --- User Management Logic ---
window.editingUserId = null;

window.saveUser = function() {
    const name = document.getElementById('userModalName').value;
    const email = document.getElementById('userModalEmail').value;
    const password = document.getElementById('userModalPassword').value;

    if (!name || !email || !password) {
        alert("Por favor completa todos los campos.");
        return;
    }

    if (window.editingUserId !== null) {
        const userIndex = users.findIndex(u => u.id === window.editingUserId);
        if (userIndex > -1) {
            users[userIndex].name = name;
            users[userIndex].email = email;
            users[userIndex].password = password;
        }
    } else {
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        users.push({ id: newId, email, password, role: 'pediatra', name });
    }

    localStorage.setItem('peditrack_users', JSON.stringify(users));
    closeModal('userModal');
    renderApp();
}

window.editUser = function(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    
    window.editingUserId = id;
    document.getElementById('userModalTitle').innerText = "Editar Pediatra";
    document.getElementById('userModalName').value = user.name;
    document.getElementById('userModalEmail').value = user.email;
    document.getElementById('userModalPassword').value = user.password;
    
    openModal('userModal');
}

window.deleteUser = function(id) {
    window.editingUserId = id;
    openModal('deleteUserModal');
}

window.confirmDeleteUser = function() {
    if (window.editingUserId === null) return;
    
    // Remove user
    users = users.filter(u => u.id !== window.editingUserId);
    localStorage.setItem('peditrack_users', JSON.stringify(users));
    
    // Unassign patients
    patients.forEach(p => {
        if (p.doctorId === window.editingUserId) {
            p.doctorId = null;
        }
    });
    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    
    closeModal('deleteUserModal');
    renderApp();
}

// --- Patient Assignment Logic ---
window.assigningPatientId = null;

window.openAssignPatientModal = function(patientId) {
    window.assigningPatientId = patientId;
    const p = patients.find(pat => pat.id === patientId);
    if (p) {
        document.getElementById('assignPatientSelect').value = p.doctorId || "";
    }
    openModal('assignPatientModal');
}

window.savePatientAssignment = function() {
    if (window.assigningPatientId === null) return;
    const newDocId = document.getElementById('assignPatientSelect').value;
    
    const p = patients.find(pat => pat.id === window.assigningPatientId);
    if (p) {
        p.doctorId = newDocId ? parseInt(newDocId) : null;
        localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    }
    
    closeModal('assignPatientModal');
    renderApp();
}
