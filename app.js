// Data Storage (Local)
let patients = JSON.parse(localStorage.getItem('peditrack_patients')) || [];

const babyHistory = [
    { date: '10 Mayo 2026', weight: 8.5, height: 71, notes: 'Desarrollo psicomotor excelente. Inició alimentación complementaria sin reacciones adversas. Continuar con lactancia.' },
    { date: '10 Abril 2026', weight: 7.8, height: 68, notes: 'Vacunas aplicadas. Todo en orden.' },
    { date: '10 Marzo 2026', weight: 6.9, height: 65, notes: 'Chequeo mensual normal.' },
    { date: '10 Febrero 2026', weight: 5.8, height: 61, notes: 'Buen agarre, subiendo de peso adecuadamente.' }
];

// App State
let currentView = 'role-selector'; // 'role-selector', 'doctor-dashboard', 'parent-profile', 'patient-onboarding'
let currentOnboardingStep = 1;

// Main Render Function
function renderApp() {
    const app = document.getElementById('app');
    
    let html = `
        <header>
            <div class="logo cursor-pointer" onclick="navigate('role-selector')">
                <i class="fa-solid fa-baby-carriage"></i> PediTrack
            </div>
            ${currentView !== 'role-selector' ? `<button class="btn btn-secondary" onclick="navigate('role-selector')">Cambiar Vista</button>` : ''}
        </header>
        <main class="container animate-fade-in" id="main-content">
    `;

    if (currentView === 'role-selector') {
        html += renderRoleSelector();
    } else if (currentView === 'doctor-dashboard') {
        html += renderDoctorDashboard();
    } else if (currentView === 'parent-profile') {
        html += renderParentProfile();
    } else if (currentView === 'patient-onboarding') {
        html += renderOnboarding();
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
function renderRoleSelector() {
    return `
        <div class="role-selector">
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Bienvenido a PediTrack</h1>
            <p style="color: var(--text-light); font-size: 1.2rem; max-width: 600px;">La plataforma integral para el seguimiento y control del desarrollo de los más pequeños. Selecciona tu perfil para comenzar.</p>
            
            <div class="role-cards">
                <div class="role-card" onclick="navigate('doctor-dashboard')">
                    <div class="role-icon">
                        <i class="fa-solid fa-stethoscope"></i>
                    </div>
                    <h2>Soy Pediatra</h2>
                    <p style="margin-top: 1rem; color: var(--text-light);">Gestiona a tus pacientes, registra consultas y visualiza curvas de crecimiento.</p>
                </div>
                
                <div class="role-card" onclick="navigate('parent-profile')">
                    <div class="role-icon">
                        <i class="fa-solid fa-children"></i>
                    </div>
                    <h2>Soy Padre / Madre</h2>
                    <p style="margin-top: 1rem; color: var(--text-light);">Revisa el perfil de tu bebé, su historial de consultas y sigue su crecimiento.</p>
                </div>
            </div>
        </div>
    `;
}

function renderDoctorDashboard() {
    let patientsHtml = patients.map(p => `
        <div class="patient-card" onclick="viewPatient(${p.id})">
            <div class="avatar">${p.name ? p.name.charAt(0).toUpperCase() : '?'}</div>
            <div class="patient-info">
                <h3>${p.name}</h3>
                <p><i class="fa-regular fa-clock"></i> ${p.age}</p>
                <div style="margin-top: 0.5rem; display: flex; gap: 1rem; font-size: 0.8rem; font-weight: 500;">
                    <span><i class="fa-solid fa-weight-scale" style="color: var(--secondary)"></i> ${p.weight} kg</span>
                    <span><i class="fa-solid fa-ruler-vertical" style="color: var(--secondary)"></i> ${p.height} cm</span>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="margin-left: auto; color: var(--text-light);"></i>
        </div>
    `).join('');

    if (patients.length === 0) {
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
                    <p style="color: var(--text-light);">${patients.length > 0 ? `Tienes ${patients.length} paciente(s) registrado(s).` : 'Bienvenido a tu panel de control.'}</p>
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

    let historyHtml = babyHistory.map(h => `
        <div class="timeline-item">
            <div class="timeline-date">${h.date}</div>
            <div class="timeline-content">
                <h4>Consulta de Seguimiento</h4>
                <p>${h.notes}</p>
                <div class="timeline-metrics">
                    <div class="metric"><i class="fa-solid fa-weight-scale"></i> ${h.weight} kg</div>
                    <div class="metric"><i class="fa-solid fa-ruler-vertical"></i> ${h.height} cm</div>
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="profile-view">
            <div class="profile-header">
                <div class="profile-avatar">${p.name ? p.name.charAt(0).toUpperCase() : '?'}</div>
                <div style="z-index: 2;">
                    <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">${p.name}</h1>
                    <p style="font-size: 1.2rem; opacity: 0.9;">${p.age} • Dr. Roberto Pediátrico</p>
                </div>
                ${currentView === 'doctor-dashboard' || true ? `
                <button class="btn btn-primary" style="margin-left: auto; background: var(--white); color: var(--primary); z-index: 2;" onclick="openModal('addConsultModal')">
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

            ${p.onboardingData ? `
            <div class="history-section" style="margin-top: 2rem;">
                <h2 style="margin-bottom: 1.5rem;">Expediente de Ingreso (Datos Completos)</h2>
                <div style="background: var(--bg-color); padding: 1.5rem; border-radius: 12px; font-family: monospace; white-space: pre-wrap; font-size: 0.95rem; border: 1px solid var(--border-color); color: var(--text-dark); line-height: 1.6;">
${Object.entries(p.onboardingData).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('\n')}
                </div>
            </div>
            ` : ''}
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
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Peso (kg)</label>
                        <input type="number" step="0.1" class="form-control" placeholder="Ej. 8.5">
                    </div>
                    <div class="form-group">
                        <label>Estatura (cm)</label>
                        <input type="number" step="0.1" class="form-control" placeholder="Ej. 71">
                    </div>
                </div>
                <div class="form-group">
                    <label>Notas Clínicas</label>
                    <textarea class="form-control" rows="4" placeholder="Observaciones, vacunas aplicadas, etc..."></textarea>
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="closeModal('addConsultModal'); alert('Consulta registrada con éxito')">Guardar Registro</button>
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
            <div class="form-group">
                <label>Fecha de nacimiento</label>
                <input type="date" class="form-control">
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

// Navigation
window.navigate = function(view) {
    currentView = view;
    renderApp();
    window.scrollTo(0,0);
}

window.viewPatient = function(id) {
    currentPatientId = id;
    navigate('parent-profile');
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
    saveCurrentStepData();
    
    const newName = window.newPatientName || "Bebé Nuevo";
    
    const newPatient = {
        id: patients.length + 1,
        name: newName,
        age: '0 meses',
        weight: window.newPatientData['Peso'] || 3.2,
        height: window.newPatientData['Talla'] || 50,
        lastVisit: 'Hoy',
        onboardingData: window.newPatientData
    };
    
    patients.unshift(newPatient);
    
    // Guardar en el almacenamiento local para persistencia
    localStorage.setItem('peditrack_patients', JSON.stringify(patients));
    
    console.log("¡Paciente creado! Datos del expediente:", newPatient);
    
    alert("¡Perfil de " + newName + " guardado con todos sus datos exitosamente!");
    
    currentOnboardingStep = 1;
    window.newPatientName = ""; 
    window.newPatientData = {}; 
    navigate('doctor-dashboard');
}

// Modals
window.openModal = function(id) {
    document.getElementById(id).classList.add('active');
}

window.closeModal = function(id) {
    document.getElementById(id).classList.remove('active');
}

// Initialize Chart.js
function initChart() {
    const ctx = document.getElementById('growthChart');
    if (!ctx) return;

    // Reverse history so oldest is first
    const dataHistory = [...babyHistory].reverse();
    const labels = dataHistory.map(h => h.date.split(' ')[1]); // get month roughly
    const weights = dataHistory.map(h => h.weight);

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
