const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const https     = require('https');
const { body, validationResult } = require('express-validator');

const { getDb }                      = require('../database/db');
const { checkPasswordStrength }      = require('../utils/passwordUtils');
const { sendOTPEmail }               = require('../utils/emailService');
const {
  registrationLimiter, loginLimiter,
  otpResendLimiter, otpVerifyLimiter,
} = require('../middleware/rateLimiter');

// ═══════════════════════════════════════════════════════════
// Helper – generate a cryptographically secure 6-digit OTP
// ═══════════════════════════════════════════════════════════
function generateOTP() {
  // crypto.randomInt is CSPRNG – safe against prediction
  return crypto.randomInt(100000, 999999).toString();
}

// Helper – verify Google reCAPTCHA token
async function verifyRecaptcha(token) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6Lc8zpQsAAAAAB6bhl9oSoIlKmGPdadWjpoHlRgQ';
  if (!secretKey) {
    return { success: false, message: 'reCAPTCHA is not configured on the server.' };
  }
  if (!token) {
    return { success: false, message: 'reCAPTCHA token is missing' };
  }
  
  return new Promise((resolve) => {
    const postData = `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`;

    const options = {
      hostname: 'www.google.com',
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, message: 'CAPTCHA failed. Try again.' });
          }
        } catch (err) {
          resolve({ success: false, message: 'CAPTCHA verification failed. Please try again.' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('reCAPTCHA verification error:', err.message);
      resolve({ success: false, message: 'CAPTCHA verification failed. Please try again.' });
    });

    req.write(postData);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// Validation rules
// ═══════════════════════════════════════════════════════════
const registerValidation = [
  body('username')
    .trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username: letters, numbers and underscores only'),
  body('email')
    .trim().isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
];

// ═══════════════════════════════════════════════════════════
// POST /api/auth/register
// Registers user, generates OTP, sends to email.
// ═══════════════════════════════════════════════════════════
router.post('/register', registrationLimiter, registerValidation, async (req, res) => {
  try {
    // ── 1. express-validator ––
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { username, email, password } = req.body;
    const recaptchaToken = req.body.recaptchaToken || req.body['g-recaptcha-response'];
    const ip = req.ip || req.connection.remoteAddress;

    // ── 2. reCAPTCHA verification ––
    const recaptchaResult = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaResult.success) {
      return res.status(400).json({ success: false, message: recaptchaResult.message });
    }

    // ── 3. Server-side password strength ––
    const strengthResult = checkPasswordStrength(password);
    if (strengthResult.score < 2) {
      return res.status(400).json({
        success: false,
        message: 'Password is too weak.',
        suggestions: strengthResult.suggestions,
      });
    }

    const db = getDb();

    // ── 4. Duplicate check ––
    const dupUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (dupUser) return res.status(409).json({ success: false, message: 'Username already taken.' });

    const dupEmail = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(email);
    if (dupEmail) {
      if (dupEmail.is_verified) {
        return res.status(409).json({ success: false, message: 'Email address already registered.' });
      }
      // Unverified duplicate – re-send a fresh OTP to let them complete verification
      const otp        = generateOTP();
      const otpHash    = await bcrypt.hash(otp, 10);
      const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET otp_hash=?, otp_expires=?, otp_attempts=0 WHERE id=?')
        .run(otpHash, otpExpires, dupEmail.id);

      // Send fresh OTP email
      const existingUser = db.prepare('SELECT username FROM users WHERE id=?').get(dupEmail.id);
      try {
        await sendOTPEmail(email, existingUser.username, otp);
        console.log(`📧  OTP re-sent to ${email}`);
      } catch (emailErr) {
        console.error('Failed to send OTP email:', emailErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'A fresh OTP has been sent to your email address.',
        email,
      });
    }

    // ── 5. Hash password ––
    const passwordHash = await bcrypt.hash(password, 12);

    // ── 6. Generate OTP (CSPRNG) ––
    const otp        = generateOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // ── 7. Persist user (unverified) ––
    const result = db.prepare(`
      INSERT INTO users
        (username, email, password_hash, otp_hash, otp_expires, otp_attempts, ip_address)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(username, email, passwordHash, otpHash, otpExpires, ip);

    // ── 8. Store initial password history (reuse prevention) ––
    db.prepare('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)')
      .run(result.lastInsertRowid, passwordHash);

    // ── 9. Send OTP email ––
    try {
      await sendOTPEmail(email, username, otp);
      console.log(`📧  OTP sent to ${email}`);
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr.message);
      // Registration succeeded even if email fails – user can resend
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful! A 6-digit OTP has been sent to your email address.',
      email,
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/verify-otp
// Validates OTP entered by the user.
// ═══════════════════════════════════════════════════════════
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    // XSS / injection sanitization
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    const otp   = String(req.body.otp   || '').trim().replace(/\D/g, '').substring(0, 6);

    console.log('🔐 [OTP] Verify request:', { email, otpLen: otp.length });

    if (!email) {
      console.log('❌ [OTP] No email provided');
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    if (otp.length !== 6) {
      console.log('❌ [OTP] Invalid OTP length:', otp.length);
      return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' });
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      console.log('❌ [OTP] No user found for email:', email);
      return res.status(400).json({ success: false, message: 'No account found for this email.' });
    }
    
    console.log('✅ [OTP] User found:', { id: user.id, username: user.username });

    // If account is verified and there is no active OTP challenge, this is likely a stale verify attempt.
    if (user.is_verified && (!user.otp_hash || !user.otp_expires)) {
      console.log('⚠️  [OTP] Account already verified, no active challenge');
      return res.json({ success: true, alreadyVerified: true, message: 'Account already verified. You can log in.' });
    }

    if (!user.otp_hash || !user.otp_expires) {
      console.log('❌ [OTP] No active OTP challenge for user');
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.', expired: true });
    }

    // ── Check expiry ––
    if (new Date(user.otp_expires) < new Date()) {
      console.log('❌ [OTP] OTP expired for user:', user.id);
      db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.', expired: true });
    }

    // ── Check attempt count (max 3 wrong) ––
    if (user.otp_attempts >= 3) {
      console.log('❌ [OTP] Max attempts reached for user:', user.id);
      db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);
      return res.status(400).json({ success: false, message: 'Too many wrong attempts. Please request a new OTP.', tooManyAttempts: true });
    }

    // ── Compare OTP against hash ––
    console.log('🔍 [OTP] Comparing OTP hash for user:', user.id);
    
    // DEVELOPMENT MODE: Allow '000000' as bypass OTP when DEV_MODE is enabled
    const isDevelopment = process.env.DEV_MODE === 'true' && otp === '000000';
    const match = isDevelopment || (await bcrypt.compare(otp, user.otp_hash));
    
    if (isDevelopment) {
      console.log('✅ [DEV MODE] Development bypass OTP accepted');
    }
    
    if (!match) {
      console.log('❌ [OTP] OTP mismatch for user:', user.id, 'attempt:', user.otp_attempts + 1);
      const newAttempts = user.otp_attempts + 1;
      db.prepare('UPDATE users SET otp_attempts=? WHERE id=?').run(newAttempts, user.id);

      // Log suspicious repeated failures
      if (newAttempts >= 2) {
        const ip = req.ip || req.connection.remoteAddress;
        db.prepare('INSERT INTO suspicious_activities (type,description,ip_address,user_id) VALUES (?,?,?,?)')
          .run('OTP_FAIL', `${newAttempts} failed OTP attempts for ${email}`, ip, user.id);
      }

      const remaining = 3 - newAttempts;
      if (remaining <= 0) {
        db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);
        return res.status(400).json({ success: false, message: 'Too many wrong attempts. Please request a new OTP.', tooManyAttempts: true });
      }
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${remaining} attempt(s) remaining.`, attemptsRemaining: remaining });
    }

    // ── ✅ OTP correct – verify and log in ––
    console.log('✅ [OTP] OTP correct! Verifying user:', user.id);
    db.prepare('UPDATE users SET is_verified=1, otp_hash=NULL, otp_expires=NULL, otp_attempts=0, failed_attempts=0, locked_until=NULL, last_login=datetime(\'now\') WHERE id=?').run(user.id);

    // Log successful login
    const ip = req.ip || req.connection.remoteAddress;
    db.prepare('INSERT INTO login_attempts (email, ip_address, success) VALUES (?,?,?)')
      .run(email, ip, 1);

    // Create session - user is now logged in
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.email    = user.email;
    req.session.role     = user.role || 'user';

    console.log('💾 [OTP] Session data set for user:', user.id, '| Role:', req.session.role);
    
    // Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('❌ [OTP] Session save error:', err);
        return res.status(500).json({ success: false, message: 'Session save failed.' });
      }
      
      console.log('✅ [OTP] Session saved successfully');
      console.log('📊 Session details:', { 
        userId: req.session.userId, 
        role: req.session.role, 
        sessionID: req.sessionID 
      });
      
      return res.json({ 
        success: true, 
        message: 'OTP verified! You are now logged in.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role || 'user',
        }
      });
    });

  } catch (err) {
    console.error('🔥 [OTP] Verify OTP error:', err);
    return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/resend-otp
// Generates a fresh OTP and resends it (rate-limited).
// ═══════════════════════════════════════════════════════════
router.post('/resend-otp', otpResendLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const db   = getDb();
    const user = db.prepare('SELECT id, username, is_verified, is_active FROM users WHERE email = ?').get(email);

    if (!user) return res.status(400).json({ success: false, message: 'No account found for that email.' });
    if (!user.is_active) return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact support.' });

    // Generate new OTP
    const otp        = generateOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET otp_hash=?, otp_expires=?, otp_attempts=0 WHERE id=?')
      .run(otpHash, otpExpires, user.id);

    // Send new OTP email
    try {
      await sendOTPEmail(email, user.username, otp);
      console.log(`📧  OTP re-sent to ${email}`);
    } catch (emailErr) {
      console.error('Failed to resend OTP email:', emailErr.message);
    }

    return res.json({
      success: true,
      message: 'A new OTP has been sent to your email address.',
    });

  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const sanitizedInput = String(email).trim().toLowerCase();
    const db   = getDb();
    
    // Try to find user by email OR username
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(sanitizedInput);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(sanitizedInput);
    }

    const logAttempt = (success) =>
      db.prepare('INSERT INTO login_attempts (email, ip_address, success) VALUES (?,?,?)')
        .run(user ? user.email : sanitizedInput, ip, success ? 1 : 0);

    if (!user) { logAttempt(false); return res.status(401).json({ success: false, message: 'Invalid email or password.' }); }

    // Account locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const t = new Date(user.locked_until).toLocaleTimeString();
      return res.status(423).json({ success: false, message: `Account locked. Try again after ${t}.` });
    }

    // Wrong password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const attempts = user.failed_attempts + 1;
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?').run(attempts, lockUntil, user.id);
        db.prepare('INSERT INTO suspicious_activities (type,description,ip_address,user_id) VALUES (?,?,?,?)')
          .run('ACCOUNT_LOCKED', `Locked after ${attempts} failed attempts`, ip, user.id);
        logAttempt(false);
        return res.status(423).json({ success: false, message: 'Account locked for 15 minutes after too many failed attempts.' });
      }
      db.prepare('UPDATE users SET failed_attempts=? WHERE id=?').run(attempts, user.id);
      logAttempt(false);
      return res.status(401).json({ success: false, message: `Invalid email or password. ${5 - attempts} attempt(s) remaining.` });
    }

    // Inactive
    if (!user.is_active) {
      logAttempt(false);
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact support.' });
    }

    // Password is correct: always require OTP before session login
    const otp        = generateOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, otp_hash=?, otp_expires=?, otp_attempts=0 WHERE id=?')
      .run(otpHash, otpExpires, user.id);

    try {
      await sendOTPEmail(user.email, user.username, otp);
      console.log(`📧  Login OTP sent to ${user.email}`);
    } catch (emailErr) {
      console.error('Failed to send login OTP email:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      needsOtp: true,
      message: 'OTP sent to your email. Please verify to complete login.',
      email: user.email,
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/auth/me  –  fetch fresh user data (incl. role) from DB
// ═══════════════════════════════════════════════════════════
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  try {
    const db   = getDb();
    const user = db.prepare('SELECT id, username, email, role, is_active, phone_number, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, message: 'Account not found.' });
    }
    if (!user.is_active) {
      req.session.destroy(() => {});
      return res.status(403).json({ success: false, message: 'Account has been deactivated.' });
    }
    // Keep session role in sync with DB
    req.session.role = user.role || 'user';
    return res.json({
      success: true,
      user: {
        id:           user.id,
        username:     user.username,
        email:        user.email,
        role:         user.role || 'user',
        phone_number: user.phone_number || null,
        created_at:   user.created_at,
      },
    });
  } catch (err) {
    console.error('/me error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load user.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: 'Logout failed.' });
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/change-password
// Requires an active session (logged-in user only).
// 1. Verify old password
// 2. Check password reuse against full history (current + past)
// 3. Hash & update current password
// 4. Append new hash to password_history
// ═══════════════════════════════════════════════════════════
router.post('/change-password', async (req, res) => {
  try {
    // ── 1. Session guard ––
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: 'You must be logged in to change your password.' });
    }

    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All three password fields are required.' });
    }

    // ── 2. New password must match confirm ––
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation do not match.' });
    }

    // ── 3. Enforce minimum strength on the new password ––
    const strengthResult = checkPasswordStrength(newPassword);
    if (strengthResult.score < 2) {
      return res.status(400).json({
        success:     false,
        message:     'New password is too weak.',
        suggestions: strengthResult.suggestions,
      });
    }

    const db   = getDb();
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    // ── 4. Verify the old / current password ––
    const oldMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!oldMatch) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect.' });
    }

    // ── 5. Password-reuse check against full history ––
    const historyRows = db.prepare(
      'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC'
    ).all(user.id);

    for (const row of historyRows) {
      const reused = await bcrypt.compare(newPassword, row.password_hash);
      if (reused) {
        return res.status(400).json({
          success: false,
          message: 'You cannot reuse your old password. Please choose a completely new password.',
        });
      }
    }

    // ── 6. Hash and persist the new password ––
    const newHash = await bcrypt.hash(newPassword, 12);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    db.prepare('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)').run(user.id, newHash);

    // Optionally keep only the last 5 history entries to avoid unbounded growth
    const histCount = db.prepare('SELECT COUNT(*) AS cnt FROM password_history WHERE user_id = ?').get(user.id);
    if (histCount && histCount.cnt > 5) {
      const oldest = db.prepare(
        'SELECT id FROM password_history WHERE user_id = ? ORDER BY created_at ASC LIMIT ?'
      ).all(user.id, histCount.cnt - 5);
      for (const old of oldest) {
        db.prepare('DELETE FROM password_history WHERE id = ?').run(old.id);
      }
    }

    // ── 7. Destroy session – user must log in again with new password ––
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      return res.json({ success: true, message: 'Password changed successfully! Please log in with your new password.' });
    });

  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, message: 'Password change failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/check-password  (live strength check)
// ═══════════════════════════════════════════════════════════
router.post('/check-password', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required.' });
  return res.json({ success: true, ...checkPasswordStrength(password) });
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/forgot-password
// Sends password reset OTP to user's email
// ═══════════════════════════════════════════════════════════
router.post('/forgot-password', registrationLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    
    console.log('🔐 [Forgot Password] Request for:', email);
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);

    if (!user) {
      // Don't reveal if email exists (security best practice)
      console.log('⚠️  [Forgot Password] Email not found:', email);
      return res.json({ success: true, message: 'If an account exists, you will receive a password reset code.' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP in database
    db.prepare('UPDATE users SET reset_otp_hash=?, reset_otp_expires=?, reset_attempts=0 WHERE id=?')
      .run(otpHash, expiresAt, user.id);

    // Send OTP email
    console.log('📧 [Forgot Password] Sending OTP to:', email);
    await sendOTPEmail(email, user.username, otp);

    console.log('✅ [Forgot Password] OTP sent to:', email);
    return res.json({ 
      success: true, 
      message: 'Password reset code sent to your email. Check your inbox and spam folder.' 
    });
  } catch (err) {
    console.error('🔥 [Forgot Password] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send reset code.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/verify-reset-otp
// Verifies the password reset OTP
// ═══════════════════════════════════════════════════════════
router.post('/verify-reset-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    const otp = String(req.body.otp || '').trim().replace(/\D/g, '').substring(0, 6);

    console.log('🔐 [Verify Reset OTP] Request for:', email);

    if (!email || otp.length !== 6) {
      return res.status(400).json({ success: false, message: 'Invalid request.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(400).json({ success: false, message: 'No account found.' });
    }

    if (!user.reset_otp_hash || !user.reset_otp_expires) {
      return res.status(400).json({ success: false, message: 'No reset request found. Request a new code.' });
    }

    // Check expiry
    if (new Date(user.reset_otp_expires) < new Date()) {
      console.log('❌ [Verify Reset OTP] Expired for user:', user.id);
      db.prepare('UPDATE users SET reset_otp_hash=NULL, reset_otp_expires=NULL, reset_attempts=0 WHERE id=?')
        .run(user.id);
      return res.status(400).json({ success: false, message: 'Code has expired. Request a new one.', expired: true });
    }

    // Check attempts
    if (user.reset_attempts >= 3) {
      console.log('❌ [Verify Reset OTP] Too many attempts for user:', user.id);
      db.prepare('UPDATE users SET reset_otp_hash=NULL, reset_otp_expires=NULL, reset_attempts=0 WHERE id=?')
        .run(user.id);
      return res.status(400).json({ success: false, message: 'Too many attempts. Request a new code.', tooManyAttempts: true });
    }

    // Verify OTP
    console.log('🔍 [Verify Reset OTP] Comparing OTP for user:', user.id);
    const match = await bcrypt.compare(otp, user.reset_otp_hash);

    if (!match) {
      console.log('❌ [Verify Reset OTP] Mismatch for user:', user.id);
      const newAttempts = user.reset_attempts + 1;
      db.prepare('UPDATE users SET reset_attempts=? WHERE id=?').run(newAttempts, user.id);
      
      const remaining = 3 - newAttempts;
      return res.status(400).json({ 
        success: false, 
        message: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` 
      });
    }

    console.log('✅ [Verify Reset OTP] Verified for user:', user.id);
    
    // OTP is valid - clear it and prepare for password reset
    db.prepare('UPDATE users SET reset_otp_hash=NULL, reset_otp_expires=NULL, reset_attempts=0 WHERE id=?')
      .run(user.id);

    return res.json({ 
      success: true, 
      message: 'OTP verified! You can now reset your password.' 
    });
  } catch (err) {
    console.error('🔥 [Verify Reset OTP] Error:', err);
    return res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/resend-reset-otp
// Resends password reset OTP (rate-limited)
// ═══════════════════════════════════════════════════════════
router.post('/resend-reset-otp', otpResendLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    
    console.log('📧 [Resend Reset OTP] Request for:', email);

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.json({ success: true, message: 'If an account exists, you will receive a new code.' });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET reset_otp_hash=?, reset_otp_expires=?, reset_attempts=0 WHERE id=?')
      .run(otpHash, expiresAt, user.id);

    // Send new OTP
    console.log('📧 [Resend Reset OTP] Sending to:', email);
    await sendOTPEmail(email, user.username, otp);

    console.log('✅ [Resend Reset OTP] Sent to:', email);
    return res.json({ success: true, message: 'New code sent to your email.' });
  } catch (err) {
    console.error('🔥 [Resend Reset OTP] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to resend code.' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/reset-password
// Actually resets the user's password after OTP verification
// ═══════════════════════════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    const newPassword = String(req.body.newPassword || '').substring(0, 72);
    const confirmPassword = String(req.body.confirmPassword || '').substring(0, 72);

    console.log('🔐 [Reset Password] Request for:', email);

    // Validation
    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Account not found.' });
    }

    // Hash new password
    console.log('🔒 [Reset Password] Hashing new password');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset OTP
    db.prepare('UPDATE users SET password_hash=?, reset_otp_hash=NULL, reset_otp_expires=NULL, reset_attempts=0 WHERE id=?')
      .run(passwordHash, user.id);

    // Log the password change
    db.prepare('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)')
      .run(user.id, passwordHash);

    console.log('✅ [Reset Password] Password reset for user:', user.id);
    return res.json({ 
      success: true, 
      message: 'Password reset successfully! You can now login with your new password.' 
    });
  } catch (err) {
    console.error('🔥 [Reset Password] Error:', err);
    return res.status(500).json({ success: false, message: 'Password reset failed.' });
  }
});

// ═══════════════════════════════════════════════════════════
// DEV ONLY: GET /api/auth/dev-otp - Get OTP for development/testing
// Requires DEV_MODE enabled in .env  
// NEVER expose this in production!
// ═══════════════════════════════════════════════════════════
router.get('/dev-otp', (req, res) => {
  if (process.env.DEV_MODE !== 'true') {
    return res.status(403).json({ 
      success: false, 
      message: 'Development mode is not enabled.' 
    });
  }

  try {
    const email = req.query.email || '';
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required. Usage: /api/auth/dev-otp?email=user@example.com' 
      });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, username, otp_hash, otp_expires FROM users WHERE email = ?')
      .get(email.toLowerCase());

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    if (!user.otp_hash) {
      return res.status(400).json({ 
        success: false, 
        message: 'No active OTP for this user. Please register first.' 
      });
    }

    console.log(`🔧 [DEV] OTP requested for ${email}`);
    
    return res.json({ 
      success: true, 
      message: '⚠️ DEVELOPMENT MODE - Use OTP "000000" to bypass verification, or check browser console for actual OTP',
      devInfo: {
        email,
        username: user.username,
        instruction: 'Enter "000000" as the 6-digit code (requires DEV_MODE=true)',
        otpStatus: new Date(user.otp_expires) > new Date() ? 'ACTIVE' : 'EXPIRED'
      }
    });
  } catch (err) {
    console.error('🔥 [DEV-OTP] Error:', err);
    return res.status(500).json({ success: false, message: 'Error retrieving OTP info.' });
  }
});

// ═══════════════════════════════════════════════════════════
// DEBUG: Session debug endpoint
// ═══════════════════════════════════════════════════════════
router.get('/debug/session', (req, res) => {
  console.log('🔍 [DEBUG] Session check:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    username: req.session?.username,
    email: req.session?.email,
    role: req.session?.role,
    sessionId: req.sessionID,
    cookie: req.headers.cookie
  });
  
  res.json({
    success: true,
    session: {
      hasSession: !!req.session,
      userId: req.session?.userId || null,
      username: req.session?.username || null,
      email: req.session?.email || null,
      role: req.session?.role || null,
      sessionId: req.sessionID,
    },
    debug: {
      cookiePresent: !!req.headers.cookie,
      message: req.session?.userId ? 'Session is active' : 'No active session'
    }
  });
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/auth/username  –  Update username
// ═══════════════════════════════════════════════════════════
router.patch('/username', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  try {
    const newUsername = String(req.body.username || '').trim().substring(0, 100);

    // Validation
    if (!newUsername) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    if (newUsername.length < 3 || newUsername.length > 30) {
      return res.status(400).json({ success: false, message: 'Username must be 3-30 characters long.' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, and underscores.' });
    }

    const db = getDb();
    
    // Check if username is already taken
    const userExists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(newUsername, req.session.userId);
    if (userExists) {
      return res.status(409).json({ success: false, message: 'Username already taken. Please choose another.' });
    }

    // Update username
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, req.session.userId);
    
    // Update session
    req.session.username = newUsername;

    console.log(`✅ [Update Username] User ${req.session.userId} changed username to: ${newUsername}`);
    return res.json({ success: true, message: 'Username updated successfully.', username: newUsername });
  } catch (err) {
    console.error('🔥 [Update Username] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update username.' });
  }
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/auth/phone  –  Update phone number
// ═══════════════════════════════════════════════════════════
router.patch('/phone', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  try {
    let newPhone = req.body.phone ? String(req.body.phone).trim().substring(0, 20) : null;

    // Validation - phone is optional, but if provided should be at least 10 digits
    if (newPhone && newPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be at least 10 digits.' });
    }

    const db = getDb();

    // Update phone number
    db.prepare('UPDATE users SET phone_number = ? WHERE id = ?').run(newPhone, req.session.userId);

    console.log(`✅ [Update Phone] User ${req.session.userId} updated phone number`);
    return res.json({ success: true, message: 'Phone number updated successfully.', phone: newPhone || 'Not provided' });
  } catch (err) {
    console.error('🔥 [Update Phone] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update phone number.' });
  }
});

module.exports = router;
