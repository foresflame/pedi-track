# PediTrack v3 — Plan de Desarrollo
**Basado en:** "Evaluación Integral y Prácticas Clínicas Óptimas en Pediatría"  
**Infraestructura objetivo:** Local (SQLite) → fly.io (SQLite + Volumes)

---

## Resumen Ejecutivo

PediTrack pasa de ser una app de registro básico a una plataforma clínica completa alineada con las normas OMS, NOM-031, NOM-043 y las guías de la AAP. Los cambios se organizan en 7 fases independientes que pueden implementarse de forma incremental sin romper lo existente.

---

## Estado Actual vs. Estado Objetivo

| Módulo | Hoy | Objetivo v3 |
|--------|-----|-------------|
| Historia clínica | Onboarding genérico 7 pasos | 4 dominios clínicos estructurados |
| Curvas de crecimiento | Chart.js básico (solo peso) | OMS 2006 / CDC 2000 / Fenton con percentiles reales |
| Consultas | Peso, talla, PC, medicamentos | + FC, FR, TA, SpO2, temperatura + alertas por edad |
| Neurodesarrollo | No existe | Denver II + EDI + M-CHAT-R/F |
| Vacunación | No existe | Calendario NOM-031 con alertas automáticas |
| Nutrición | No existe | Registro de lactancia + ablactación |
| Citas | Calendario básico | + Sugerencia automática por frecuencia normativa |
| Despliegue | Local únicamente | fly.io con volumen persistente para SQLite |

---

## FASE A — Historia Clínica Estructurada
**Prioridad:** Alta | **Esfuerzo:** Medio | **Rompe lo existente:** No (se agregan columnas)

### Motivación clínica
El documento establece que el primer encuentro pediátrico debe cubrir 4 dominios críticos:
1. Ficha de identificación + contexto biosociodemográfico
2. Antecedentes heredofamiliares (mapa de susceptibilidad genética)
3. Antecedentes prenatales y perinatales (programación epigenética)
4. Antecedentes personales no patológicos y patológicos

### Cambios en base de datos

```sql
-- Agregar a tabla patients (columnas nuevas, no rompe datos existentes)
ALTER TABLE patients ADD COLUMN birth_state        TEXT;
ALTER TABLE patients ADD COLUMN birth_city         TEXT;
ALTER TABLE patients ADD COLUMN parents_education  TEXT;  -- JSON {"mother":"licenciatura","father":"preparatoria"}
ALTER TABLE patients ADD COLUMN gestational_age    INTEGER; -- semanas
ALTER TABLE patients ADD COLUMN gestational_type   TEXT;    -- 'termino'|'pretermino'|'posttermino'
ALTER TABLE patients ADD COLUMN delivery_type      TEXT;    -- 'vaginal'|'cesarea'|'instrumentado'
ALTER TABLE patients ADD COLUMN birth_weight       REAL;
ALTER TABLE patients ADD COLUMN birth_height       REAL;
ALTER TABLE patients ADD COLUMN birth_head_circ    REAL;
ALTER TABLE patients ADD COLUMN apgar_1            INTEGER;
ALTER TABLE patients ADD COLUMN apgar_5            INTEGER;
ALTER TABLE patients ADD COLUMN silverman_score    INTEGER;
ALTER TABLE patients ADD COLUMN nicu_stay          BOOLEAN DEFAULT 0;
ALTER TABLE patients ADD COLUMN nicu_days          INTEGER;
ALTER TABLE patients ADD COLUMN breastfed          BOOLEAN;
ALTER TABLE patients ADD COLUMN breastfed_months   INTEGER;
ALTER TABLE patients ADD COLUMN torch_exposure     TEXT;   -- JSON array de infecciones TORCH
ALTER TABLE patients ADD COLUMN neonatal_screening BOOLEAN; -- tamiz metabólico realizado

-- Nueva tabla: antecedentes heredofamiliares
CREATE TABLE IF NOT EXISTS family_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition    TEXT NOT NULL,     -- 'diabetes'|'hipertension'|'asma'|'autismo'|'sindrome_down'|etc.
  relationship TEXT NOT NULL,     -- 'padre'|'madre'|'abuelo_materno'|'abuelo_paterno'|'hermano'|etc.
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
```

### Cambios en frontend (onboarding)
- **Paso 1:** Ficha de identificación (nombre, sexo, fecha de nacimiento, CURP, procedencia)
- **Paso 2:** Contexto familiar (escolaridad/ocupación padres, número de hermanos, tipo de vivienda)
- **Paso 3:** Antecedentes heredofamiliares (checklist: diabetes, HTA, asma/atopia, autismo, cromosomopatías, cáncer, cardiopatías congénitas, enfermedades metabólicas)
- **Paso 4:** Antecedentes prenatales (número de gesta, edad materna, control prenatal, exposición a teratógenos/tabaco/alcohol, infecciones TORCH)
- **Paso 5:** Datos perinatales (tipo de parto, EG, peso/talla/PC al nacer, Apgar 1 y 5 min, Silverman, UCI neonatal, fototerapia, tamiz neonatal)
- **Paso 6:** Antecedentes personales (lactancia materna, duración, tipo de fórmula si aplica, hitos psicomotores tempranos, alergias conocidas, cirugías previas)
- **Paso 7:** Revisión y confirmación

### Archivos a modificar
- `server/database.js` — ALTER TABLE + nueva tabla family_history
- `server/routes/patients.js` — incluir family_history en GET/:id
- `public/app.js` — rediseñar renderOnboarding() con los 7 nuevos pasos

---

## FASE B — Curvas de Crecimiento OMS/CDC Reales
**Prioridad:** Alta | **Esfuerzo:** Medio | **Rompe lo existente:** No

### Motivación clínica
- OMS 2006: carácter **prescriptivo** (cómo *debe* crecer el niño), para 0–5 años
- CDC 2000: para 5+ años (IMC/edad, talla/edad)
- Fenton / Intergrowth-21st: para prematuros (<37 semanas)
- Alerta automática de **falla de medro** al cruzar 2 líneas de percentil hacia abajo
- Alerta de **riesgo de obesidad** al cruzar 2 líneas de percentil hacia arriba en peso sin correlato en talla

### Cambios en base de datos

```sql
-- Agregar a consultations
ALTER TABLE consultations ADD COLUMN bmi            REAL;  -- calculado: peso/(talla/100)²
ALTER TABLE consultations ADD COLUMN weight_zscore  REAL;  -- Z-score OMS peso/edad
ALTER TABLE consultations ADD COLUMN height_zscore  REAL;  -- Z-score OMS talla/edad
ALTER TABLE consultations ADD COLUMN bmi_zscore     REAL;  -- Z-score OMS IMC/edad
ALTER TABLE consultations ADD COLUMN head_zscore    REAL;  -- Z-score OMS PC/edad
ALTER TABLE consultations ADD COLUMN growth_alert   TEXT;  -- NULL | 'falla_medro' | 'riesgo_obesidad' | 'talla_baja'
```

### Cambios en frontend
- Reemplazar el chart único por 4 gráficas con tabs: Peso/Edad, Talla/Edad, PC/Edad, IMC/Edad
- Embeber tablas de percentiles OMS (P3, P15, P50, P85, P97) como constantes JS
- Calcular y renderizar Z-scores en cada punto de la curva
- Tarjeta de alerta si hay cruce de 2 percentiles entre consultas consecutivas
- Selector de curva de referencia: OMS / CDC / Fenton

### Datos estáticos a incluir
Tablas de valores LMS (Lambda-Mu-Sigma) de OMS 2006 para:
- Niños y niñas 0–60 meses: peso/edad, talla/edad, PC/edad, IMC/edad
- Niños y niñas 5–19 años (CDC): talla/edad, IMC/edad

### Archivos a modificar
- `server/routes/consultations.js` — calcular BMI y Z-scores al guardar
- `public/app.js` — reemplazar initChart() + renderProfile charts
- `public/styles.css` — estilos para las 4 gráficas y alertas de crecimiento

---

## FASE C — Signos Vitales con Rangos Normales por Edad
**Prioridad:** Alta | **Esfuerzo:** Bajo | **Rompe lo existente:** No

### Motivación clínica
Los rangos normales de FC, FR y TA varían significativamente por grupo etario pediátrico. Una taquicardia en un neonato puede ser compensatoria; en un escolar es patológica. La app debe ayudar al médico a identificar valores fuera de rango al momento de registrarlos.

### Rangos de referencia a implementar (del documento)

| Grupo etario | FC (lpm) | FR (rpm) | TAS (mmHg) | SpO2 (%) |
|---|---|---|---|---|
| RN Pretérmino | 120–160 | 40–60 | 39–59 | 95–100 |
| RN Término | 120–160 | 30–50 | 50–75 | 95–100 |
| Lactante 1–12m | 100–130 | 20–40 | 80–100 | 96–100 |
| Preescolar 1–3a | 90–110 | 15–25 | 80–100 | 96–100 |
| Preescolar 3–5a | 80–110 | 15–20 | 85–110 | 97–100 |
| Escolar >5a | 70–100 | 12–20 | 90–120 | 97–100 |

### Cambios en base de datos

```sql
-- Agregar a consultations
ALTER TABLE consultations ADD COLUMN heart_rate    INTEGER; -- FC (lpm)
ALTER TABLE consultations ADD COLUMN resp_rate     INTEGER; -- FR (rpm)
ALTER TABLE consultations ADD COLUMN systolic_bp   INTEGER; -- TA sistólica (mmHg)
ALTER TABLE consultations ADD COLUMN diastolic_bp  INTEGER; -- TA diastólica (mmHg)
ALTER TABLE consultations ADD COLUMN temperature   REAL;    -- Temperatura (°C)
ALTER TABLE consultations ADD COLUMN spo2          REAL;    -- Saturación O2 (%)
ALTER TABLE consultations ADD COLUMN vital_alerts  TEXT;    -- JSON array de alertas
```

### Cambios en frontend
- Agregar campos al modal de registro de consulta
- Validación en tiempo real: campos en rojo si valor fuera de rango para la edad del paciente
- Tooltip con rango normal al lado de cada campo
- En el historial: badge de alerta si algún signo vital estuvo fuera de rango en esa consulta

### Archivos a modificar
- `server/routes/consultations.js` — calcular vital_alerts al guardar
- `public/app.js` — modal addConsult + renderTimeline con alertas

---

## FASE D — Módulo de Neurodesarrollo
**Prioridad:** Media | **Esfuerzo:** Alto | **Rompe lo existente:** No

### Motivación clínica
- **Denver II:** Tamizaje desde nacimiento hasta 6 años, 4 dominios. Aplica en consultas de 9, 18 y 30 meses (mínimo recomendado por AAP/CDC).
- **EDI:** Sistema de semáforo (verde/amarillo/rojo) en 5 ejes. Validado por CeNSIA México.
- **M-CHAT-R/F:** 20 preguntas. Aplica a los 18 y 24 meses. Tamizaje de TEA.

### Cambios en base de datos

```sql
CREATE TABLE IF NOT EXISTS neuro_screens (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id       INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id  INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  screen_type      TEXT NOT NULL, -- 'denver2' | 'edi' | 'mchat'
  patient_age_months INTEGER NOT NULL,
  responses        TEXT,          -- JSON: {"item_id": "pass"|"fail"|"no_opp"|"refusal"}
  score            REAL,          -- puntaje total si aplica (M-CHAT)
  result           TEXT,          -- 'normal' | 'rezago' | 'riesgo' | 'positivo'
  result_color     TEXT,          -- 'green' | 'yellow' | 'red'
  domain_results   TEXT,          -- JSON: {personal_social, motor_fino, lenguaje, motor_grueso}
  recommendations  TEXT,          -- texto generado con recomendaciones según resultado
  applied_by       INTEGER REFERENCES users(id),
  created_at       TEXT DEFAULT (datetime('now'))
);
```

### Estructura del Denver II (4 dominios, ítems por edad)
```javascript
// Ejemplo de estructura de datos (embebida en frontend)
const DENVER2_ITEMS = [
  // Personal-Social
  { id: 'ps_01', domain: 'personal_social', label: 'Sonrisa social', age_range: [1, 3] },
  { id: 'ps_02', domain: 'personal_social', label: 'Reconoce a la madre', age_range: [1, 4] },
  // ... 125 ítems total
  // Motor Fino
  { id: 'mf_01', domain: 'motor_fino', label: 'Sigue objeto a la línea media', age_range: [1, 3] },
  // Lenguaje
  // Motor Grueso
];
```

### Estructura EDI (5 ejes)
- **Eje 1:** Factores de riesgo biológico (prematurez <34s, peso <1500g, UCIN)
- **Eje 2:** Señales de alarma (regresión de habilidades, asimetría motora) → 1 positivo = rojo automático
- **Eje 3:** Áreas del desarrollo (motor fino, grueso, lenguaje, social, cognición)
- **Eje 4:** Señales de alerta (déficit leve, ambiente no estimulante)
- **Eje 5:** Exploración neurológica (tono, reflejos, PC, movimientos)

### Estructura M-CHAT-R/F (20 preguntas binarias)
Preguntas sobre: seguimiento de la mirada, imitación, respuesta al nombre, señalamiento con el dedo, contacto visual, juego simbólico, interés en otros niños, etc.

### Cambios en frontend
- Botón "Evaluación del Desarrollo" en perfil del paciente (visible para pediatra/admin)
- Selector de tipo de evaluación con sugerencia automática por edad
- Wizards paso a paso para cada herramienta
- Resultado en semáforo con recomendaciones automáticas
- Historial de evaluaciones por paciente con timeline

### Archivos a crear/modificar
- `server/routes/neuro.js` — GET/POST/GET-history
- `server/index.js` — montar ruta /api/patients/:id/neuro
- `public/app.js` — renderNeuroScreen(), renderDenverWizard(), renderEDIWizard(), renderMChatWizard()

---

## FASE E — Módulo de Vacunación
**Prioridad:** Alta | **Esfuerzo:** Medio | **Rompe lo existente:** No

### Motivación clínica
El documento establece que el esquema de vacunación debe revisarse en **cada** consulta. El médico debe tener visibilidad inmediata de: vacunas aplicadas, pendientes y en atraso.

### Esquema NOM-031 a implementar

| Edad | Vacuna | Dosis |
|------|--------|-------|
| Nacimiento | BCG | Única |
| Nacimiento | Hepatitis B | 1ª |
| 2 meses | Hexavalente (DPT+Polio+Hib+HepB) | 1ª |
| 2 meses | PCV (Antineumocócica) | 1ª |
| 2 meses | Rotavirus | 1ª |
| 4 meses | Hexavalente | 2ª |
| 4 meses | PCV | 2ª |
| 4 meses | Rotavirus | 2ª |
| 6 meses | Hexavalente | 3ª |
| 6 meses | Influenza | 1ª (anual desde 6m) |
| 12 meses | PCV | Refuerzo |
| 12 meses | SRP (Triple viral) | 1ª |
| 18 meses | SRP | 2ª / Refuerzo |
| 4 años | DPT | Refuerzo |
| Anual desde 6m | Influenza | Dosis anual |

### Cambios en base de datos

```sql
CREATE TABLE IF NOT EXISTS vaccinations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine_code   TEXT NOT NULL,  -- 'BCG'|'HepB'|'Hexavalente'|'PCV'|'Rotavirus'|'SRP'|'Influenza'|'DPT'
  vaccine_name   TEXT NOT NULL,  -- nombre completo
  dose_number    INTEGER NOT NULL DEFAULT 1,
  scheduled_date TEXT,           -- fecha programada según fecha de nacimiento
  applied_date   TEXT,           -- NULL = pendiente
  applied_by     INTEGER REFERENCES users(id),
  lot_number     TEXT,
  site           TEXT,           -- 'deltoides_der'|'muslo_der'|'oral', etc.
  reaction       TEXT,           -- reacciones post-vacunales registradas
  notes          TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(patient_id, vaccine_code, dose_number)
);
```

### Cambios en frontend
- Sección "Esquema de Vacunación" en perfil del paciente
- Línea de tiempo visual: vacunas aplicadas (verde), próximas (amarillo), en atraso (rojo)
- Al crear un paciente, generar automáticamente el calendario completo con fechas programadas
- Modal para registrar aplicación (fecha, lote, sitio, reacciones)
- Widget en dashboard del doctor: pacientes con vacunas en atraso

### Archivos a crear/modificar
- `server/routes/vaccinations.js` — GET/POST/PUT
- `server/index.js` — montar ruta
- `public/app.js` — renderVaccinationTimeline(), auto-generate schedule al crear paciente

---

## FASE F — Frecuencia Normativa de Consultas (Sugerencia Automática)
**Prioridad:** Muy Alta | **Esfuerzo:** Bajo | **Rompe lo existente:** No

### Motivación clínica
La NOM-008 y NOM-031 dictan frecuencias mínimas de consulta por grupo etario. Actualmente el médico agenda citas manualmente sin guía normativa.

### Tabla de frecuencias (del documento)

| Grupo etario | Rango | Frecuencia mínima |
|---|---|---|
| Recién nacido | 0–28 días | Días 7 y 28 (mínimo 2 consultas) |
| Lactante | 1–12 meses | Mensual (12 consultas/año) |
| Preescolar temprano | 1–3 años | Trimestral (4 consultas/año) |
| Preescolar tardío | 3–5 años | Semestral (2 consultas/año) |
| Escolar/Adolescente | 5–19 años | Anual (1 consulta/año) |

### Cambios en backend

```javascript
// server/utils/visitFrequency.js
function getNextVisitRecommendation(birthDate) {
  const ageMonths = getAgeInMonths(birthDate);
  if (ageMonths < 1)   return { days: 7,   label: 'Control a los 7 días (RN)' };
  if (ageMonths < 12)  return { days: 30,  label: 'Control mensual (lactante)' };
  if (ageMonths < 36)  return { days: 90,  label: 'Control trimestral (preescolar temprano)' };
  if (ageMonths < 60)  return { days: 180, label: 'Control semestral (preescolar tardío)' };
  return               { days: 365, label: 'Control anual (escolar/adolescente)' };
}
```

### Cambios en frontend
- Al guardar una consulta: popup "¿Deseas agendar el próximo control? Recomendado: [fecha sugerida]"
- Botón de un clic para crear la cita con fecha pre-llenada
- En el perfil del paciente: "Próxima visita recomendada: [fecha]" con semáforo (verde=en tiempo, amarillo=próxima semana, rojo=en atraso)

### Archivos a modificar
- `server/utils/visitFrequency.js` — nueva utilidad
- `server/routes/consultations.js` — incluir recomendación en respuesta del POST
- `public/app.js` — modal de sugerencia post-consulta + indicador en perfil

---

## FASE G — Preparación para fly.io
**Prioridad:** Media | **Esfuerzo:** Bajo | **Rompe lo existente:** No

### Arquitectura de despliegue

```
fly.io Machine (shared-cpu-1x, 256MB RAM)
├── Node.js 22 (Express)
├── better-sqlite3 → /app/server/db/peditrack.sqlite
│
Fly Volume (1GB persistente)
└── /app/server/db/  ← montado aquí
```

### Archivos a crear

**`Dockerfile`**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p server/db
EXPOSE 3000
CMD ["node", "server/index.js"]
```

**`.dockerignore`**
```
node_modules/
.env
server/db/*.sqlite
server/db/*.sqlite-shm
server/db/*.sqlite-wal
.git/
```

**`fly.toml`**
```toml
app = "pedi-track"
primary_region = "mia"

[build]

[env]
  PORT = "3000"
  NODE_ENV = "production"

[mounts]
  source = "peditrack_data"
  destination = "/app/server/db"

[[services]]
  internal_port = 3000
  protocol = "tcp"
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  [[services.ports]]
    port = 80
    handlers = ["http"]
  [[services.http_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "5s"
    path = "/api/health"
```

### Cambios en backend
- Agregar endpoint `GET /api/health` que retorne `{ status: 'ok', db: 'connected' }`
- Asegurar que `initDB()` no falle si el directorio ya existe con datos (migrations seguras)
- Usar `process.env.DB_PATH || './server/db/peditrack.sqlite'` para la ruta del archivo

### Comandos de despliegue
```bash
fly launch --name pedi-track --region mia
fly volumes create peditrack_data --size 1 --region mia
fly secrets set JWT_SECRET=<valor> EMAIL_USER=<valor> EMAIL_PASS=<valor>
fly deploy
```

---

## Orden de implementación definitivo

```
FASE F  →  FASE A  →  FASE C  →  FASE B  →  FASE E  →  FASE G  →  FASE D
(2 días)   (3 días)   (1 día)   (3 días)   (2 días)   (1 día)   (5 días)
```

**Total estimado:** ~17 días de desarrollo

### Criterios de "fase completada"
Cada fase se considera lista cuando:
1. Migración de DB ejecutada sin errores
2. Rutas backend responden correctamente
3. Frontend renderiza y guarda datos
4. Cambios commiteados a GitHub

---

## Notas técnicas importantes

### Migraciones de DB (SQLite)
Las columnas nuevas se agregan con `ALTER TABLE ... ADD COLUMN` usando valores DEFAULT seguros. Los datos existentes no se pierden. La función `initDB()` en `database.js` se convierte en un runner de migraciones secuenciales.

### Compatibilidad con datos existentes
- El `onboarding_data` JSON blob actual se mantiene. Los nuevos campos son adicionales.
- Las consultas existentes tendrán `NULL` en los nuevos campos de signos vitales — no se muestran si son NULL.
- Los pacientes creados antes de la Fase E obtendrán su calendario de vacunas generado retroactivamente al abrir su perfil.

### Estrategia de no-regresión
- Cada fase tiene su propio branch de Git: `feature/fase-A`, `feature/fase-B`, etc.
- PR a `main` solo cuando la fase esté completa y probada manualmente.
