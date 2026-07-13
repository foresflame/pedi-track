// Almacena fotos de perfil como archivos en disco (en el volumen persistente
// en producción) en lugar de base64 dentro de SQLite.

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'peditrack.sqlite');
// Junto a la DB para que en fly.io quede dentro del volumen /data
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(path.dirname(DB_PATH), 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Si `photo` es un data URL, lo persiste como archivo y retorna la ruta pública
 * (`/uploads/...`). Cualquier otro valor (ruta ya guardada, null) pasa intacto.
 */
function persistPhoto(userId, photo) {
  if (!photo || typeof photo !== 'string' || !photo.startsWith('data:')) return photo;

  const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Formato de imagen no soportado (usa JPEG, PNG o WebP)');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('La imagen no puede exceder 2 MB');

  // Nombre con timestamp para invalidar caché del navegador al actualizar
  const filename = `user-${userId}-${Date.now()}.${EXT_BY_MIME[match[1]]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  // Borrar fotos anteriores del mismo usuario
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    if (f.startsWith(`user-${userId}-`) && f !== filename) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch (e) {}
    }
  }

  return `/uploads/${filename}`;
}

module.exports = { UPLOADS_DIR, persistPhoto };
