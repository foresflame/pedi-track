# PediTrack — Guía para Claude

> Este archivo da contexto a Claude cuando se trabaja en este repo desde cualquier dispositivo.
> **Léelo primero antes de empezar a editar.**

## Qué es

Plataforma de gestión pediátrica integral (consultorio). SPA frontend +
Node/Express + SQLite. Despliegue en fly.io.

- **Producción:** https://pedi-track.fly.dev
- **Repo:** https://github.com/foresflame/pedi-track

## Roles de usuario

- **super_admin** — todo (default: `admin@peditrack.com` / `Admin2024!`)
- **admin** — modifica pediatras y pacientes, no gestiona usuarios
- **asesor** — solo lectura
- **pediatra** — su propio panel con sus pacientes (`doc@peditrack.com` / `Doc2024!`)
- **tutor** — ve solo a su hijo (`tutor@peditrack.com` / `Tutor2024!`)

## Stack

- **Backend:** Node 20, Express 4, better-sqlite3, bcryptjs, jsonwebtoken, nodemailer
- **Frontend:** Vanilla JS (no React/Vue), Chart.js para curvas, vanilla CSS con custom properties
- **DB:** SQLite con migraciones runtime en `server/database.js`
- **Deploy:** Dockerfile multi-stage → fly.io con volumen persistente en `/data`

## Estructura

```
server/
  index.js           — Express app, health endpoint
  database.js        — Init, SCHEMA, migraciones runtime, seed usuarios
  middleware/
    auth.js          — JWT verify
    roles.js         — requireRole (super_admin satisface 'admin')
  routes/
    auth.js          — login, reset-password
    users.js         — CRUD usuarios + /me + perfil profesional pediatra
    patients.js      — CRUD pacientes, expediente, asignación, active
    consultations.js — historial + signos vitales + próxima visita sugerida
    appointments.js  — disponibilidad, slots, citas, estado, bloqueos
    vaccinations.js  — esquema NOM-031, aplicación
    neurodevelopment.js — Denver II + M-CHAT-R/F
    email.js         — envío de recetas vía Gmail

public/
  index.html         — solo el shell, todo el HTML lo genera app.js
  app.js             — TODA la lógica SPA (4000+ líneas, single file)
  styles.css         — variables, layout shell, tablas, modales, responsive
```

## Convenciones

### Frontend (`public/app.js`)

- **Sin frameworks.** Vanilla JS con render functions que retornan strings de HTML.
- **Re-render completo** con `renderApp()`. Estado global en variables top-level.
- **Vistas registradas** en el switch dentro de `renderApp()`. Cada vista tiene `renderXyz()`.
- **Shell de aplicación** (`sidebar + topbar + content`) solo para `pediatra` y roles admin-like.
  El tutor mantiene la vista clásica con header.
- **Eventos:** `onclick="funcion()"` inline. Las funciones se registran como `window.funcion = ...`.
- **API:** objeto `API` en la parte superior con `get/post/put/del` que prefija `/api`.

### Backend

- **Sincronico.** better-sqlite3 es sync, sin async/await en queries.
- **Migraciones:** en `runMigrations()` con `try { ALTER TABLE ... } catch(e){}` o
  `db.exec('CREATE TABLE IF NOT EXISTS ...')`. Las migraciones son **idempotentes**.
- **Roles:** `requireRole('admin', 'pediatra')` — el middleware expande `admin` para incluir
  `super_admin` automáticamente.
- **Errores:** `res.status(400|403|404|409).json({ error: '...' })`.
- **JSON columns:** `onboarding_data`, `medications`, `responses`, `alarms` se almacenan como
  string JSON en SQLite. Parseo en el route handler antes de devolver.

### Estilo de mensajes

- Idioma: **español**, formato MX. Excepciones: nombres técnicos en inglés (commit messages, comments).
- Commits: imperativo, en español, con prefijo conventional (feat:/fix:/chore:/refactor:).
- Co-autoría en commits cuando ayudo:
  ```
  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  ```

## Comandos comunes

```bash
# Setup inicial (compu nueva)
git clone https://github.com/foresflame/pedi-track.git
cd pedi-track
npm install
npm start                    # arranca en http://localhost:3000

# Trabajo diario
git pull origin main         # antes de empezar
git add . && git commit -m "feat: ..." && git push origin main

# Deploy a producción (requiere fly CLI autenticado)
fly deploy

# Verificar producción
curl https://pedi-track.fly.dev/api/health
```

## Estado de las migraciones (Fases completadas)

| Fase | Qué |
|------|-----|
| 1 | Backend scaffolding + autenticación JWT |
| 2 | Rutas CRUD + migración frontend a API |
| A | Onboarding estructurado en 4 dominios clínicos |
| B | Curvas de crecimiento OMS/CDC/Fenton con percentiles y Z-scores |
| C | Signos vitales en consultas con alertas por edad |
| D | Neurodesarrollo: Denver II + M-CHAT-R/F |
| E | Vacunación NOM-031 (México) |
| F | Sugerencia automática de próxima visita |
| G | Despliegue en fly.io con volumen persistente |

## Cosas no obvias

- **UTF-8 hot:** algunos archivos del server tuvieron mojibake. Si ves `Ã¡` en lugar de `á`,
  el archivo se guardó con codificación mal. VS Code: asegurar `files.encoding: utf8`.
- **Auto-stop en fly.io:** la máquina se duerme sin tráfico. Primer request del día toma 3-5s.
- **`patient.active`** controla si el paciente sigue en seguimiento. Default `1` (activo).
  Los inactivos se ven con opacity reducida en la tabla.
- **Bloqueos de horario** sin paciente: appointments con `patient_id IS NULL` y `label`.
  Usado por el médico para almuerzo, descansos, etc.
- **El admin seed (`admin@peditrack.com`)** se promueve automáticamente a `super_admin`
  en cada arranque. No cambiar manualmente.
- **Mojibake limpieza automática:** una migración en cada arranque limpia nombres de usuario
  que contengan `Ã` (artefacto de doble-encoding).

## Workflow desde múltiples dispositivos

El usuario trabaja desde diferentes computadoras. Para mantener continuidad:

1. **Al inicio de cualquier sesión nueva:** `git pull origin main` (o si yo estoy en un sandbox
   nuevo, clono fresco).
2. **Al final de cualquier sesión:** `git add . && git commit && git push`.
3. **Para verificar cambios:** el usuario los ve en https://pedi-track.fly.dev *cuando* alguien
   corra `fly deploy` (no es automático; lo hace el usuario manualmente cuando quiere ver
   cambios en producción).

## Cosas a mejorar (backlog informal)

- Rebrand (PediTrack se siente simple — se mencionó cambiar nombre/identidad visual).
- Versión móvil aún tiene casos border (ya se hizo pase básico de responsive).
- Migración a PostgreSQL eventualmente (descartada por ahora — usuario no quiere refactor async).
- Auto-deploy con GitHub Actions cuando el usuario decida pagar fly.io para producción real.
