const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // Cookie httpOnly (preferida, no accesible a JS) con fallback al header
  // Bearer para sesiones anteriores al cambio.
  const header = req.headers.authorization;
  const token = (req.cookies && req.cookies.peditrack_token)
    || (header && header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { requireAuth };
