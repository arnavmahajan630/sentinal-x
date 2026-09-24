const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    next();
  } catch (e) {
    res.status(401).json({ error: 'unauthorized' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

module.exports = { authenticate, requireRole };
