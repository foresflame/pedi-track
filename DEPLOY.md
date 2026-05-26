# Guía de Despliegue — PediTrack

Esta guía cubre dos plataformas: **Railway** (recomendado por su simplicidad)
y **fly.io** (más control, regiones más cercanas a México).

---

## 🚂 Railway (recomendado para empezar)

Railway despliega directamente desde GitHub. No necesitas CLI para el primer
despliegue.

### Prerequisitos

1. Tener el repo en GitHub: ✅ ya lo tienes (`foresflame/pedi-track`)
2. Crear cuenta en https://railway.app (puedes usar tu cuenta de GitHub)
3. Plan: el **Hobby** gratuito ($5 USD de crédito mensual) alcanza para esta app

### Paso 1 — Crear el proyecto

1. Entra a https://railway.app/new
2. Click en **Deploy from GitHub repo**
3. Autoriza Railway a leer tus repos (solo la primera vez)
4. Selecciona **`foresflame/pedi-track`**
5. Railway detecta el `Dockerfile` y empieza a construir

### Paso 2 — Crear el volumen para SQLite

> **Importante:** sin volumen, los datos se pierden en cada deploy.

1. En el dashboard de Railway, abre tu servicio
2. Tab **Settings** → sección **Volumes** → **+ New Volume**
3. Configura:
   - **Mount path:** `/data`
   - **Size:** 1 GB
4. Guarda

El Dockerfile ya crea `/data/db/` y el server usa `DB_PATH=/data/db/peditrack.sqlite`.

### Paso 3 — Configurar variables de entorno

Tab **Variables** → **+ New Variable**. Agrega estas:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Click **Generate** o usa una cadena aleatoria larga |
| `NODE_ENV` | `production` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | tu correo @gmail |
| `EMAIL_PASS` | App Password de Gmail (ver más abajo) |
| `EMAIL_FROM` | `PediTrack <tu-correo@gmail.com>` |

> **`PORT` y `DB_PATH` se quedan en sus defaults del Dockerfile** (Railway inyecta
> su propio `PORT` automáticamente).

#### Cómo crear una App Password de Gmail

1. Activa 2-Step Verification en https://myaccount.google.com/security
2. Ve a https://myaccount.google.com/apppasswords
3. Crea una contraseña para "Mail" / "PediTrack"
4. Copia los 16 caracteres y pégalos en `EMAIL_PASS`

### Paso 4 — Exponer el dominio público

Tab **Settings** → sección **Networking** → **Generate Domain**.

Railway te da una URL tipo `pedi-track-production.up.railway.app`.
Si tienes dominio propio, agrégalo en **Custom Domain**.

### Paso 5 — Esperar el deploy

Railway construye la imagen Docker y arranca el servicio. Toma ~3-5 minutos
la primera vez. Verás los logs en vivo en la tab **Deployments**.

Cuando el healthcheck (`/api/health`) pase, tu app está lista.

### Actualizaciones automáticas

Cada `git push` a `main` dispara un nuevo deploy automático. No tienes que
hacer nada más.

---

## 🛸 Alternativa: fly.io

### Prerequisitos

1. Instalar flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. Crear cuenta en https://fly.io y autenticarse:
   ```bash
   fly auth login
   ```

### Primer despliegue

```bash
cd pedi-track

# Crear la app (región "mia" = Miami, cerca de México)
fly launch --name pedi-track --region mia --no-deploy

# Crear el volumen persistente para SQLite (1 GB)
fly volumes create peditrack_data --size 1 --region mia

# Configurar secretos
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  EMAIL_HOST="smtp.gmail.com" \
  EMAIL_PORT="587" \
  EMAIL_USER="peditrack@gmail.com" \
  EMAIL_PASS="tu_app_password_gmail" \
  EMAIL_FROM="PediTrack <peditrack@gmail.com>"

# Desplegar
fly deploy

# Abrir en el navegador
fly open
```

### Comandos útiles de fly.io

```bash
fly logs                                          # Logs en tiempo real
fly ssh console                                   # SSH a la máquina
fly ssh console -C "sqlite3 /data/db/peditrack.sqlite '.tables'"  # Inspeccionar DB
fly status                                        # Estado de la máquina
fly secrets list                                  # Ver secretos (solo nombres)
fly scale memory 512                              # Escalar memoria a 512 MB
```

---

## Variables de entorno (referencia)

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | Modo de ejecución | `production` |
| `PORT` | Puerto interno (Railway lo inyecta) | `8080` |
| `DB_PATH` | Ruta del archivo SQLite | `/data/db/peditrack.sqlite` |
| `JWT_SECRET` | Secreto para firmar JWT (**requerido**) | — |
| `EMAIL_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `EMAIL_PORT` | Puerto SMTP | `587` |
| `EMAIL_USER` | Cuenta de correo | — |
| `EMAIL_PASS` | App Password de Gmail | — |
| `EMAIL_FROM` | Remitente formateado | — |

---

## Cuenta de prueba inicial

Cuando arranca por primera vez, el servidor crea estos usuarios en la DB:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@peditrack.com` | `Admin2024!` | super_admin |
| `doc@peditrack.com` | `Doc2024!` | pediatra |
| `tutor@peditrack.com` | `Tutor2024!` | tutor |

> **⚠️ Cámbialas inmediatamente después del primer login en producción.**

---

## Consideraciones de producción

- **SQLite + volumen persistente** funciona bien para cargas moderadas
  (decenas de pediatras, miles de pacientes). Para escalar horizontalmente
  considera migrar a PostgreSQL.
- **Backups:** descarga `/data/db/peditrack.sqlite` periódicamente.
  En Railway: `Settings → Volumes → Download`. En fly.io: `fly volumes snapshots`.
- **HTTPS** se provisiona automáticamente en ambas plataformas.
- **Healthcheck** en `/api/health` (ya configurado en `railway.toml`).
- **Logs:** Railway los muestra en el dashboard; fly.io con `fly logs`.
- **Costo aproximado en Railway:** ~$3-5 USD/mes con el plan Hobby para una
  app pequeña con volumen de 1 GB y tráfico moderado.
