const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');
const { 
  requireRole, 
  getUsers, 
  ROLES 
} = require('../utils/accessControl');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/editor/stats  –  Dashboard stats (moderator view-only)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/stats', requireRole(ROLES.MODERATOR), (req, res) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/editor/users  –  List users (read-only, no password hashes)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/users', requireRole(ROLES.MODERATOR), (req, res) => {
  try {
    const result = getUsers(ROLES.MODERATOR);
    if (!result.success) {
      return res.status(403).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('Editor users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
});

module.exports = router;
