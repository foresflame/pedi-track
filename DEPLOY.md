# Guía de Despliegue — PediTrack en fly.io

## Prerequisitos

1. Instalar flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. Crear cuenta en https://fly.io y autenticarse:
   ```bash
   fly auth login
   ```

## Primer despliegue

### 1. Crear la app (solo la primera vez)

```bash
cd pedi-track

# Crear la app (elige la región "mia" para México)
fly launch --name pedi-track --region mia --no-deploy

# Si la app ya existe en fly.toml, solo registrar:
fly apps create pedi-track
```

### 2. Crear el volumen persistente para SQLite

```bash
# Volumen de 1 GB en la misma región que la app
fly volumes create peditrack_data --size 1 --region mia
```

> ⚠️ El volumen debe existir antes del primer deploy. El archivo `fly.toml`
> lo monta en `/data`; la app crea `/data/db/peditrack.sqlite` automáticamente.

### 3. Configurar secretos (variables de entorno sensibles)

```bash
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  EMAIL_HOST="smtp.gmail.com" \
  EMAIL_PORT="587" \
  EMAIL_USER="peditrack@gmail.com" \
  EMAIL_PASS="tu_app_password_gmail" \
  EMAIL_FROM="PediTrack <peditrack@gmail.com>"
```

> Para Gmail necesitas una **App Password** (2FA activado):
> Google Account → Security → 2-Step Verification → App passwords

### 4. Desplegar

```bash
fly deploy
```

El deploy construye la imagen Docker, la sube a fly.io y arranca la máquina.
El primer arranque ejecuta las migraciones y crea los usuarios de prueba.

### 5. Abrir la app

```bash
fly open
```

---

## Actualizaciones posteriores

```bash
# Simplemente:
fly deploy
```

fly.io hace rolling deploy — la app no tiene downtime durante actualizaciones.

---

## Variables de entorno disponibles

| Variable     | Descripción                         | Default en Docker        |
|--------------|-------------------------------------|--------------------------|
| `NODE_ENV`   | Modo de ejecución                   | `production`             |
| `PORT`       | Puerto interno del servidor         | `8080`                   |
| `DB_PATH`    | Ruta al archivo SQLite              | `/data/db/peditrack.sqlite` |
| `JWT_SECRET` | Secreto para firmar JWT (requerido) | —                        |
| `EMAIL_HOST` | Servidor SMTP                       | `smtp.gmail.com`         |
| `EMAIL_PORT` | Puerto SMTP                         | `587`                    |
| `EMAIL_USER` | Cuenta de correo                    | —                        |
| `EMAIL_PASS` | Contraseña / App Password           | —                        |
| `EMAIL_FROM` | Nombre y dirección del remitente    | —                        |

---

## Comandos útiles

```bash
# Ver logs en tiempo real
fly logs

# Conectarse por SSH a la máquina
fly ssh console

# Inspeccionar la base de datos
fly ssh console -C "sqlite3 /data/db/peditrack.sqlite '.tables'"

# Ver estado de la máquina
fly status

# Ver secretos configurados (solo nombres, no valores)
fly secrets list

# Escalar memoria si hace falta
fly scale memory 512
```

---

## Consideraciones de producción

- **SQLite en fly.io funciona bien** para cargas moderadas gracias al volumen persistente.
  Para escalar a múltiples regiones simultáneas considera migrar a Postgres con `fly postgres`.
- **Backups**: programa backups del volumen con `fly volumes snapshots`.
- **HTTPS**: fly.io provisiona TLS automáticamente — `force_https = true` en `fly.toml`.
- **Auto-stop**: la máquina se apaga cuando no hay tráfico y arranca al primer request
  (cold start ~2s). Configura `min_machines_running = 1` si necesitas respuesta inmediata.
