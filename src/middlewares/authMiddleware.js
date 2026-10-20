const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gym_jwt_secret_super_seguro_2026';

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado. Acceso denegado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.usuario = decoded;
    next();
  });
}

module.exports = {
  autenticarToken,
};
