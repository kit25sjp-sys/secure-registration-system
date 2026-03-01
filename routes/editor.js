const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');

/* ═══════════════════════════════════════════════════════════
   Session-based role guard  (editor OR admin)
═══════════════════════════════════════════════════════════ */
function requireEditor(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  try {
    const db   = getDb();
    const user = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or inactive.' });
    }
    if (user.role !== 'editor' && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Editor role required.' });
    }
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error('Editor auth error:', err);
    return res.status(500).json({ success: false, message: 'Authentication check failed.' });
  }
}

/* ═══════════════════════════════════════════════════════════
   GET /api/editor/stats
═══════════════════════════════════════════════════════════ */
router.get('/stats', requireEditor, (req, res) => {
  try {
    const db = getDb();
    const q  = (sql) => db.prepare(sql).get();
    return res.json({
      success: true,
      stats: {
        totalUsers:         q('SELECT COUNT(*) c FROM users').c,
        verifiedUsers:      q('SELECT COUNT(*) c FROM users WHERE is_verified=1').c,
        activeUsers:        q('SELECT COUNT(*) c FROM users WHERE is_active=1').c,
        todayRegistrations: q("SELECT COUNT(*) c FROM users WHERE date(created_at)=date('now')").c,
      },
    });
  } catch (err) {
    console.error('Editor stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve stats.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/editor/users  –  read-only, no password hashes
═══════════════════════════════════════════════════════════ */
router.get('/users', requireEditor, (req, res) => {
  try {
    const db    = getDb();
    const users = db.prepare(`
      SELECT id, username, email, role, is_verified, is_active, created_at, last_login
      FROM users ORDER BY created_at DESC
    `).all();
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Editor users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
});

module.exports = router;
