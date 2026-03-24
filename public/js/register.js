// ══════════════════════════════════════════════════════════════
// register.js  –  Registration page JavaScript
// Handles: real-time validation, password strength meter,
//          CAPTCHA, and form submission.
// ══════════════════════════════════════════════════════════════

/* ────────────────────────────────────────────────────────
   Password strength (mirrors server-side logic)
──────────────────────────────────────────────────────── */
const COMMON_PASSWORDS = new Set([
  'password','password1','password123','12345678','123456789',
  'qwerty','qwerty123','abc123','letmein','monkey','1234567',
  'dragon','baseball','iloveyou','trustno1','sunshine','master',
  'welcome','shadow','superman','admin','princess','passw0rd',
]);
const SEQUENCES = ['qwerty','asdfgh','zxcvbn','123456','234567','345678','456789'];

function checkStrength(password) {
  let score = 0;
  const checks = { length: false, longLength: false, lowercase: false, uppercase: false, numbers: false, special: false };

  if (password.length >= 8)  { score += 1; checks.length     = true; }
  if (password.length >= 12) { score += 1; checks.longLength  = true; }
  if (password.length >= 16) { score += 1; }

  if (/[a-z]/.test(password))                           { score += 1; checks.lowercase = true; }
  if (/[A-Z]/.test(password))                           { score += 1; checks.uppercase = true; }
  if (/\d/.test(password))                              { score += 1; checks.numbers   = true; }
  if (/[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(password)) { score += 2; checks.special = true; }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) score -= 3;
  if (/(.)\1{2,}/.test(password))                  score -= 1;
  for (const s of SEQUENCES) { if (password.toLowerCase().includes(s)) { score -= 1; break; } }

  score = Math.max(0, score);

  let strength, label;
  if      (score <= 3) { strength = 'weak';        label = 'Weak';        }
  else if (score <= 5) { strength = 'medium';       label = 'Medium';      }
  else if (score <= 7) { strength = 'strong';       label = 'Strong';      }
  else                 { strength = 'very-strong';  label = 'Very Strong'; }

  return { score, strength, label, checks };
}

/* ────────────────────────────────────────────────────────
   Strength meter UI
──────────────────────────────────────────────────────── */
function updateStrengthUI(password) {
  const meterBox  = document.getElementById('strengthMeterContainer');
  const reqBox    = document.getElementById('requirementsList');
  const label     = document.getElementById('strengthLabel');
  const segs      = [1,2,3,4].map(n => document.getElementById('seg' + n));

  if (!password) {
    meterBox.classList.remove('visible');
    reqBox.classList.remove('visible');
    segs.forEach(s => { s.className = 'strength-segment'; });
    return null;
  }

  meterBox.classList.add('visible');
  reqBox.classList.add('visible');

  const r = checkStrength(password);

  /* segments */
  segs.forEach(s => { s.className = 'strength-segment'; });
  const map = { 'weak': 1, 'medium': 2, 'strong': 3, 'very-strong': 4 };
  const cls = 'active-' + r.strength;
  for (let i = 0; i < map[r.strength]; i++) segs[i].classList.add(cls);

  /* label */
  label.textContent = r.label;
  label.className = 'strength-label ' + r.strength;

  /* checklist */
  const REQ_MAP = {
    'req-length':    r.checks.length,
    'req-uppercase': r.checks.uppercase,
    'req-lowercase': r.checks.lowercase,
    'req-number':    r.checks.numbers,
    'req-special':   r.checks.special,
  };
  Object.entries(REQ_MAP).forEach(([id, met]) => {
    const el   = document.getElementById(id);
    const icon = el && el.querySelector('.req-icon');
    if (!el) return;
    el.classList.toggle('met', met);
    if (icon) icon.textContent = met ? '✓' : '○';
  });

  return r;
}

/* ────────────────────────────────────────────────────────
   Show / hide password
──────────────────────────────────────────────────────── */
function _makeEyeSVG(crossed) {
  const base = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if (!crossed) {
    return '<svg ' + base + '><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  return '<svg ' + base + '><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

function _wireToggleButtons() {
  document.querySelectorAll('.toggle-password').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var inputId = btn.getAttribute('data-target');
      var input   = document.getElementById(inputId);
      var eye     = document.getElementById(inputId + 'Eye');
      if (!input) return;
      var show = input.type === 'password';
      input.type    = show ? 'text' : 'password';
      if (eye) eye.innerHTML = _makeEyeSVG(show);
      btn.classList.toggle('active', show);
    });
  });
}

/* ────────────────────────────────────────────────────────
   Alert helpers
──────────────────────────────────────────────────────── */
function showAlert(msg, type = 'error') {
  const c = document.getElementById('alertContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  c.innerHTML = `<div class="alert alert-${type}"><span>${icons[type] || 'ℹ️'}</span><div>${msg}</div></div>`;
  c.classList.remove('hidden');
  c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideAlert() {
  const c = document.getElementById('alertContainer');
  c.classList.add('hidden'); c.innerHTML = '';
}

/* ────────────────────────────────────────────────────────
   Field validation helpers
──────────────────────────────────────────────────────── */
function setError(field, msg) {
  const el    = document.getElementById(field + 'Input');
  const errEl = document.getElementById(field + 'Error');
  if (el)    { el.classList.add('error'); el.classList.remove('success'); }
  if (errEl) errEl.textContent = msg;
}
function setSuccess(field) {
  const el    = document.getElementById(field + 'Input');
  const errEl = document.getElementById(field + 'Error');
  if (el)    { el.classList.remove('error'); el.classList.add('success'); }
  if (errEl) errEl.textContent = '';
}
function clearError(field) {
  const el    = document.getElementById(field + 'Input');
  const errEl = document.getElementById(field + 'Error');
  if (el)    { el.classList.remove('error', 'success'); }
  if (errEl) errEl.textContent = '';
}

/* ────────────────────────────────────────────────────────
   DOMContentLoaded
──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  _wireToggleButtons();

  const usernameInput        = document.getElementById('usernameInput');
  const emailInput           = document.getElementById('emailInput');
  const passwordInput        = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const form                 = document.getElementById('registrationForm');
  const submitBtn            = document.getElementById('submitBtn');

  /* ── username ── */
  usernameInput.addEventListener('input', () => {
    const v = usernameInput.value.trim();
    const statusEl = document.getElementById('usernameStatus');
    if (!v) { clearError('username'); statusEl.textContent = ''; return; }
    if (v.length < 3)              { setError('username', 'Minimum 3 characters');                   statusEl.textContent = ''; }
    else if (v.length > 30)        { setError('username', 'Maximum 30 characters');                  statusEl.textContent = ''; }
    else if (!/^[a-zA-Z0-9_]+$/.test(v)) { setError('username', 'Letters, numbers, underscores only'); statusEl.textContent = ''; }
    else                           { setSuccess('username'); statusEl.textContent = '✓'; }
  });

  /* ── email ── */
  emailInput.addEventListener('input', () => {
    const v = emailInput.value.trim();
    const statusEl = document.getElementById('emailStatus');
    if (!v) { clearError('email'); statusEl.textContent = ''; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError('email', 'Enter a valid email address'); statusEl.textContent = ''; }
    else                                         { setSuccess('email'); statusEl.textContent = '✓'; }
  });

  /* ── password ── */
  passwordInput.addEventListener('input', () => {
    const v = passwordInput.value;
    updateStrengthUI(v);
    document.getElementById('passwordError').textContent = '';
    passwordInput.classList.remove('error');
    /* also re-check confirm */
    if (confirmPasswordInput.value) {
      const match = v === confirmPasswordInput.value;
      const statusEl = document.getElementById('confirmStatus');
      if (match) { setSuccess('confirmPassword'); statusEl.textContent = '✓'; }
      else        { setError('confirmPassword', 'Passwords do not match'); statusEl.textContent = ''; }
    }
  });

  /* ── confirm password ── */
  confirmPasswordInput.addEventListener('input', () => {
    const v = confirmPasswordInput.value;
    const statusEl = document.getElementById('confirmStatus');
    if (!v) { clearError('confirmPassword'); statusEl.textContent = ''; return; }
    if (v === passwordInput.value) { setSuccess('confirmPassword'); statusEl.textContent = '✓'; }
    else                           { setError('confirmPassword', 'Passwords do not match'); statusEl.textContent = ''; }
  });

  /* ════════════════════════════════════════════════════════
     Form submit
  ════════════════════════════════════════════════════════ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username        = usernameInput.value.trim();
    const email           = emailInput.value.trim();
    const password        = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let valid = true;

    /* validate username */
    if (!username) { setError('username', 'Username is required'); valid = false; }
    else if (username.length < 3) { setError('username', 'Minimum 3 characters'); valid = false; }
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('username', 'Invalid username format'); valid = false; }

    /* validate email */
    if (!email) { setError('email', 'Email address is required'); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('email', 'Invalid email address'); valid = false; }

    /* validate password */
    if (!password) { setError('password', 'Password is required'); valid = false; }
    else {
      const r = checkStrength(password);
      if (r.score < 2) { setError('password', 'Password is too weak'); valid = false; }
    }

    /* validate confirm */
    if (!confirmPassword) { setError('confirmPassword', 'Please confirm your password'); valid = false; }
    else if (password !== confirmPassword) { setError('confirmPassword', 'Passwords do not match'); valid = false; }

    if (!valid) return;

    const recaptchaError = document.getElementById('recaptchaError');
    if (recaptchaError) recaptchaError.textContent = '';
    const recaptchaToken = (window.grecaptcha && typeof window.grecaptcha.getResponse === 'function')
      ? window.grecaptcha.getResponse()
      : '';
    if (!recaptchaToken) {
      if (recaptchaError) recaptchaError.textContent = 'Please complete CAPTCHA.';
      return;
    }

    /* ── Disable submit and show loader ── */
    const btnText   = document.getElementById('submitBtnText');
    const btnLoader = document.getElementById('submitBtnLoader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;

    submitFormWithToken(recaptchaToken);
  });

  async function submitFormWithToken(recaptchaToken) {
    const username        = document.getElementById('usernameInput').value.trim();
    const email           = document.getElementById('emailInput').value.trim();
    const password        = document.getElementById('passwordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    const btnText         = document.getElementById('submitBtnText');
    const btnLoader       = document.getElementById('submitBtnLoader');
    const submitBtn       = document.getElementById('submitBtn');

    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, confirmPassword, recaptchaToken }),
      });
      const data = await resp.json();

      if (data.success) {
        window.location.href = `/otp-verify?email=${encodeURIComponent(data.email)}`;
        return;
      } else {
        showAlert(data.message || 'Registration failed. Please try again.', 'error');
      }
    } catch {
      showAlert('Network error. Please check your connection and try again.', 'error');
    } finally {
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      submitBtn.disabled = false;
      if (window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
        window.grecaptcha.reset();
      }
    }
  }
});
