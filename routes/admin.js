const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const { getDb }              = require('../database/db');
const { adminAuthMiddleware, JWT_SECRET } = require('../middleware/adminAuth');

/* ═══════════════════════════════════════════════════════════
   POST /api/admin/login
═══════════════════════════════════════════════════════════ */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password are required.' });

    const db    = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match)  return res.status(401).json({ success: false, message: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    return res.json({ success: true, token, username: admin.username });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/admin/stats
═══════════════════════════════════════════════════════════ */
router.get('/stats', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDb();
    const q  = (sql) => db.prepare(sql).get();

    return res.json({
      success: true,
      stats: {
        totalUsers:          q('SELECT COUNT(*) c FROM users').c,
        verifiedUsers:       q('SELECT COUNT(*) c FROM users WHERE is_verified=1').c,
        unverifiedUsers:     q('SELECT COUNT(*) c FROM users WHERE is_verified=0').c,
        activeUsers:         q('SELECT COUNT(*) c FROM users WHERE is_active=1').c,
        lockedUsers:         q("SELECT COUNT(*) c FROM users WHERE locked_until > datetime('now')").c,
        todayRegistrations:  q("SELECT COUNT(*) c FROM users WHERE date(created_at)=date('now')").c,
        totalLoginAttempts:  q('SELECT COUNT(*) c FROM login_attempts').c,
        failedLogins:        q('SELECT COUNT(*) c FROM login_attempts WHERE success=0').c,
        suspiciousActivities: q('SELECT COUNT(*) c FROM suspicious_activities').c,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve stats.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/admin/users
═══════════════════════════════════════════════════════════ */
router.get('/users', adminAuthMiddleware, (req, res) => {
  try {
    const db    = getDb();
    const users = db.prepare(`
      SELECT id, username, email, password_hash, role, is_verified, is_active, created_at,
             last_login, ip_address, failed_attempts, locked_until
      FROM users ORDER BY created_at DESC
    `).all();
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/admin/users/:id/toggle  – activate / deactivate
═══════════════════════════════════════════════════════════ */
router.patch('/users/:id/toggle', adminAuthMiddleware, (req, res) => {
  try {
    const db   = getDb();
    const user = db.prepare('SELECT id, is_active FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const newStatus = user.is_active ? 0 : 1;
    db.prepare('UPDATE users SET is_active=? WHERE id=?').run(newStatus, user.id);
    return res.json({ success: true, is_active: newStatus, message: `User ${newStatus ? 'activated' : 'deactivated'}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/admin/users/:id/role  – change user role
═══════════════════════════════════════════════════════════ */
router.patch('/users/:id/role', adminAuthMiddleware, (req, res) => {
  try {
    const allowed = ['user', 'moderator', 'admin'];
    let role = String(req.body?.role || '').trim().toLowerCase();
    /* Backward compatibility: map legacy editor role to moderator */
    if (role === 'editor') role = 'moderator';
    if (role === 'manager') role = 'moderator';
    if (!allowed.includes(role))
      return res.status(400).json({ success: false, message: 'Invalid role. Must be: user, moderator, admin.' });

    const db   = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
    return res.json({ success: true, role, message: `Role updated to “${role}” for ${user.username}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update role.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   DELETE /api/admin/users/:id
═══════════════════════════════════════════════════════════ */
router.delete('/users/:id', adminAuthMiddleware, (req, res) => {
  try {
    const db   = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    db.prepare('DELETE FROM users WHERE id=?').run(user.id);
    return res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/admin/login-attempts
═══════════════════════════════════════════════════════════ */
router.get('/login-attempts', adminAuthMiddleware, (req, res) => {
  try {
    const db       = getDb();
    const attempts = db.prepare('SELECT * FROM login_attempts ORDER BY attempted_at DESC LIMIT 100').all();
    return res.json({ success: true, attempts });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve login attempts.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/admin/suspicious
═══════════════════════════════════════════════════════════ */
router.get('/suspicious', adminAuthMiddleware, (req, res) => {
  try {
    const db         = getDb();
    const activities = db.prepare('SELECT * FROM suspicious_activities ORDER BY detected_at DESC LIMIT 100').all();
    return res.json({ success: true, activities });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve suspicious activities.' });
  }
});

module.exports = router;
