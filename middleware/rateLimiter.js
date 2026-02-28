const rateLimit = require('express-rate-limit');

/* ── Registration: max 5 attempts per 15 min per IP ── */
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP. Please try again in 15 minutes.',
  },
});

/* ── Login: max 10 attempts per 15 min per IP ── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  },
});

/* ── CAPTCHA endpoint: max 30 requests per 5 min ── */
const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many CAPTCHA requests.' },
});

/* ── OTP resend: max 3 resend requests per 15 min per IP ── */
const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many OTP resend requests. Please wait 15 minutes before trying again.',
  },
});

/* ── OTP verify: max 10 attempts per 15 min per IP ── */
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many OTP verification attempts. Please wait 15 minutes.',
  },
});

module.exports = { registrationLimiter, loginLimiter, captchaLimiter, otpResendLimiter, otpVerifyLimiter };
