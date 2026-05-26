// super_admin satisface cualquier rol que requiera 'admin'
function requireRole(...roles) {
  const expanded = new Set(roles);
  if (roles.includes('admin')) expanded.add('super_admin');
  return (req, res, next) => {
    if (!req.user || !expanded.has(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
}

module.exports = { requireRole };
