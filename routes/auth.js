const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const { body, validationResult } = require('express-validator');

const { getDb }                      = require('../database/db');
const { sendOTPEmail }               = require('../utils/emailService');
const { checkPasswordStrength }      = require('../utils/passwordUtils');
const {
  registrationLimiter, loginLimiter,
  captchaLimiter, otpResendLimiter, otpVerifyLimiter,
} = require('../middleware/rateLimiter');

/* ═══════════════════════════════════════════════════════════
   Helper – generate a cryptographically secure 6-digit OTP
═══════════════════════════════════════════════════════════ */
function generateOTP() {
  /* crypto.randomInt is CSPRNG – safe against prediction */
  return crypto.randomInt(100000, 999999).toString();
}

/* ═══════════════════════════════════════════════════════════
   CAPTCHA – SVG math challenge (no external API needed)
═══════════════════════════════════════════════════════════ */
router.get('/captcha', captchaLimiter, (req, res) => {
  const ops      = ['+', '-', '*'];
  const op       = ops[Math.floor(Math.random() * ops.length)];
  const a        = Math.floor(Math.random() * 9) + 1;
  const b        = Math.floor(Math.random() * 9) + 1;
  const [hi, lo] = [Math.max(a, b), Math.min(a, b)];

  let answer, question;
  if (op === '+')      { answer = a + b;   question = `${a} + ${b}`; }
  else if (op === '-') { answer = hi - lo; question = `${hi} - ${lo}`; }
  else                 { answer = a * b;   question = `${a} × ${b}`; }

  req.session.captchaAnswer  = answer;
  req.session.captchaExpires = Date.now() + 10 * 60 * 1000;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buildCaptchaSVG(question));
});

function buildCaptchaSVG(question) {
  const W = 220, H = 64;
  const chars = question.split('');
  let texts = '', lines = '', dots = '';
  chars.forEach((ch, i) => {
    const x  = 18 + i * 24 + (Math.random() * 6 - 3);
    const y  = 38 + (Math.random() * 10 - 5);
    const r  = (Math.random() * 22 - 11).toFixed(1);
    const fs = 22 + Math.floor(Math.random() * 8);
    const colors = ['#1a1a2e','#16213e','#0f3460','#4a235a','#1b4332'];
    const fill   = colors[Math.floor(Math.random() * colors.length)];
    texts += `<text x="${x}" y="${y}" transform="rotate(${r},${x},${y})" font-size="${fs}" fill="${fill}" font-family="Arial" font-weight="bold">${ch}</text>`;
  });
  for (let i = 0; i < 6; i++) {
    lines += `<line x1="${rand(W)}" y1="${rand(H)}" x2="${rand(W)}" y2="${rand(H)}" stroke="#bbb" stroke-width="1" opacity="0.45"/>`;
  }
  for (let i = 0; i < 35; i++) {
    dots += `<circle cx="${rand(W)}" cy="${rand(H)}" r="1.2" fill="#aaa" opacity="0.45"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#eef0f8;border-radius:6px">${lines}${dots}${texts}</svg>`;
}
function rand(n) { return (Math.random() * n).toFixed(1); }

/* ═══════════════════════════════════════════════════════════
   Validation rules
═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/register
   Registers user, generates OTP, sends to email.
═══════════════════════════════════════════════════════════ */
router.post('/register', registrationLimiter, registerValidation, async (req, res) => {
  try {
    /* ── 1. express-validator ── */
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { username, email, password, captchaAnswer } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    /* ── 2. CAPTCHA verification ── */
    if (!req.session.captchaAnswer || Date.now() > req.session.captchaExpires) {
      delete req.session.captchaAnswer;
      return res.status(400).json({ success: false, message: 'CAPTCHA expired. Please refresh and try again.' });
    }
    if (parseInt(captchaAnswer, 10) !== req.session.captchaAnswer) {
      delete req.session.captchaAnswer;
      getDb().prepare('INSERT INTO suspicious_activities (type, description, ip_address) VALUES (?,?,?)')
        .run('CAPTCHA_FAIL', `Failed CAPTCHA for email: ${email}`, ip);
      return res.status(400).json({ success: false, message: 'Incorrect CAPTCHA answer. Please try again.' });
    }
    delete req.session.captchaAnswer;

    /* ── 3. Server-side password strength ── */
    const strengthResult = checkPasswordStrength(password);
    if (strengthResult.score < 2) {
      return res.status(400).json({
        success: false,
        message: 'Password is too weak.',
        suggestions: strengthResult.suggestions,
      });
    }

    const db = getDb();

    /* ── 4. Duplicate check ── */
    const dupUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (dupUser) return res.status(409).json({ success: false, message: 'Username already taken.' });

    const dupEmail = db.prepare('SELECT id, is_verified FROM users WHERE email = ?').get(email);
    if (dupEmail) {
      if (dupEmail.is_verified) {
        return res.status(409).json({ success: false, message: 'Email address already registered.' });
      }
      /* Unverified duplicate – re-send a fresh OTP to let them complete verification */
      const otp        = generateOTP();
      const otpHash    = await bcrypt.hash(otp, 10);
      const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      db.prepare('UPDATE users SET otp_hash=?, otp_expires=?, otp_attempts=0 WHERE id=?')
        .run(otpHash, otpExpires, dupEmail.id);
      try { await sendOTPEmail(email, username, otp); } catch (e) { console.error('Email error:', e.message); }
      return res.status(200).json({
        success: true,
        message: 'A new OTP has been sent to your email. Please verify to complete registration.',
        email,
        otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
      });
    }

    /* ── 5. Hash password ── */
    const passwordHash = await bcrypt.hash(password, 12);

    /* ── 6. Generate OTP (CSPRNG) ── */
    const otp        = generateOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    /* ── 7. Persist user (unverified) ── */
    const result = db.prepare(`
      INSERT INTO users
        (username, email, password_hash, otp_hash, otp_expires, otp_attempts, ip_address)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(username, email, passwordHash, otpHash, otpExpires, ip);

    /* ── 8. Store initial password history (reuse prevention) ── */
    db.prepare('INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)')
      .run(result.lastInsertRowid, passwordHash);

    /* ── 9. Send OTP email ── */
    try {
      await sendOTPEmail(email, username, otp);
    } catch (emailErr) {
      console.error('Email send error (non-fatal):', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful! A 6-digit OTP has been sent to your email.',
      email,
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/verify-otp
   Validates OTP entered by the user.
═══════════════════════════════════════════════════════════ */
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    /* XSS / injection sanitization */
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    const otp   = String(req.body.otp   || '').trim().replace(/\D/g, '').substring(0, 6);

    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    if (otp.length !== 6) return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' });

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) return res.status(400).json({ success: false, message: 'No account found for this email.' });
    if (user.is_verified) return res.json({ success: true, alreadyVerified: true, message: 'Account already verified. You can log in.' });

    if (!user.otp_hash || !user.otp_expires) {
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.', expired: true });
    }

    /* ── Check expiry ── */
    if (new Date(user.otp_expires) < new Date()) {
      db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.', expired: true });
    }

    /* ── Check attempt count (max 3 wrong) ── */
    if (user.otp_attempts >= 3) {
      db.prepare('UPDATE users SET otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);
      return res.status(400).json({ success: false, message: 'Too many wrong attempts. Please request a new OTP.', tooManyAttempts: true });
    }

    /* ── Compare OTP against hash ── */
    const match = await bcrypt.compare(otp, user.otp_hash);
    if (!match) {
      const newAttempts = user.otp_attempts + 1;
      db.prepare('UPDATE users SET otp_attempts=? WHERE id=?').run(newAttempts, user.id);

      /* Log suspicious repeated failures */
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
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${remaining} attempt(s) remaining.` });
    }

    /* ── ✅ OTP correct – activate account ── */
    db.prepare('UPDATE users SET is_verified=1, otp_hash=NULL, otp_expires=NULL, otp_attempts=0 WHERE id=?').run(user.id);

    return res.json({ success: true, message: 'Email verified successfully! Your account is now active.' });

  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/resend-otp
   Generates a fresh OTP and resends it (rate-limited).
═══════════════════════════════════════════════════════════ */
router.post('/resend-otp', otpResendLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase().substring(0, 254);
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const db   = getDb();
    const user = db.prepare('SELECT id, username, is_verified FROM users WHERE email = ?').get(email);

    if (!user) return res.status(400).json({ success: false, message: 'No account found for that email.' });
    if (user.is_verified) return res.json({ success: true, message: 'Account is already verified. Please log in.' });

    /* Generate new OTP */
    const otp        = generateOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET otp_hash=?, otp_expires=?, otp_attempts=0 WHERE id=?')
      .run(otpHash, otpExpires, user.id);

    try {
      await sendOTPEmail(email, user.username, otp);
    } catch (emailErr) {
      console.error('Resend OTP email error:', emailErr.message);
    }

    return res.json({
      success: true,
      message: 'A new OTP has been sent to your email.',
    });

  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/login
═══════════════════════════════════════════════════════════ */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const sanitizedEmail = String(email).trim().toLowerCase();
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(sanitizedEmail);

    const logAttempt = (success) =>
      db.prepare('INSERT INTO login_attempts (email, ip_address, success) VALUES (?,?,?)')
        .run(sanitizedEmail, ip, success ? 1 : 0);

    if (!user) { logAttempt(false); return res.status(401).json({ success: false, message: 'Invalid email or password.' }); }

    /* Account locked */
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const t = new Date(user.locked_until).toLocaleTimeString();
      return res.status(423).json({ success: false, message: `Account locked. Try again after ${t}.` });
    }

    /* Wrong password */
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

    /* OTP not yet verified */
    if (!user.is_verified) {
      logAttempt(false);
      return res.status(403).json({
        success: false,
        message: 'Please verify your email with the OTP before logging in.',
        needsOtp: true,
        email: sanitizedEmail,
      });
    }

    /* Inactive */
    if (!user.is_active) {
      logAttempt(false);
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact support.' });
    }

    /* ✅ Success */
    db.prepare("UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=datetime('now') WHERE id=?").run(user.id);
    logAttempt(true);

    return res.json({
      success: true,
      message: 'Login successful!',
      user: { id: user.id, username: user.username, email: user.email },
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/check-password  (live strength check)
═══════════════════════════════════════════════════════════ */
router.post('/check-password', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Password required.' });
  return res.json({ success: true, ...checkPasswordStrength(password) });
});

module.exports = router;
