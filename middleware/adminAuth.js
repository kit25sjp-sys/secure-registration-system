const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'admin-jwt-secret-change-in-production';

function adminAuthMiddleware(req, res, next) {
  // Check session-based auth first (new unified login system)
  if (req.session && req.session.userId) {
    if (req.session.role === 'admin') {
      req.admin = { id: req.session.userId, username: req.session.username, role: 'admin' };
      return next();
    }
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  // Fallback to JWT token auth (legacy support)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = { adminAuthMiddleware, JWT_SECRET };
