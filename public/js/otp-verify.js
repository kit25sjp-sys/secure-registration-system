// ─── otp-verify.js ───────────────────────────────────────────────
// Handles the 6-digit OTP verification page
// ─────────────────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────────────
let email = '';
let countdownInterval = null;
let resendCooldownInterval = null;
let secondsLeft = 300;           // 5 minutes
const RESEND_COOLDOWN_SEC = 60;  // 1-min cool-off after each resend

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Read email from URL
  const params = new URLSearchParams(window.location.search);
  email = params.get('email') || '';

  if (!email) {
    showAlert('danger', 'No email address provided. Please register again.');
    document.getElementById('verifyBtn').disabled = true;
    return;
  }

  // Display masked email
  document.getElementById('displayEmail').textContent = maskEmail(email);

  // Wire form
  document.getElementById('otpForm').addEventListener('submit', submitOTP);

  // Wire digit inputs
  wireDigitInputs();

  // Start countdown
  startCountdown();

  // Focus first box
  document.querySelectorAll('.otp-digit')[0].focus();
});

// ── Helpers ──────────────────────────────────────────────────────
function maskEmail(e) {
  const [user, domain] = e.split('@');
  if (!domain) return e;
  const visible = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

function getOtpValue() {
  return [...document.querySelectorAll('.otp-digit')]
    .map(i => i.value.trim())
    .join('');
}

function clearDigits() {
  document.querySelectorAll('.otp-digit').forEach(i => {
    i.value = '';
    i.classList.remove('filled', 'error');
  });
  document.querySelectorAll('.otp-digit')[0].focus();
}

function setDigitsError(flag) {
  document.querySelectorAll('.otp-digit').forEach(i => {
    i.classList.toggle('error', flag);
  });
}

// ── Digit-box wiring ─────────────────────────────────────────────
function wireDigitInputs() {
  const inputs = [...document.querySelectorAll('.otp-digit')];

  inputs.forEach((inp, idx) => {
    // Only allow digits
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (inp.value) {
          inp.value = '';
          inp.classList.remove('filled');
        } else if (idx > 0) {
          inputs[idx - 1].value = '';
          inputs[idx - 1].classList.remove('filled');
          inputs[idx - 1].focus();
        }
        clearError();
        return;
      }
      if (e.key === 'ArrowLeft' && idx > 0) { inputs[idx - 1].focus(); return; }
      if (e.key === 'ArrowRight' && idx < 5) { inputs[idx + 1].focus(); return; }
      if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
        e.preventDefault();
      }
    });

    inp.addEventListener('input', () => {
      const digit = inp.value.replace(/\D/g, '').slice(-1);
      inp.value = digit;
      inp.classList.toggle('filled', !!digit);
      clearError();
      if (digit && idx < 5) inputs[idx + 1].focus();
      // Auto-submit when all 6 filled
      if (getOtpValue().length === 6) {
        setTimeout(() => document.getElementById('otpForm').requestSubmit(), 120);
      }
    });

    // Paste support: handle on first box or wherever the user pastes
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, 6);
      pasted.split('').forEach((ch, i) => {
        if (inputs[idx + i]) {
          inputs[idx + i].value = ch;
          inputs[idx + i].classList.add('filled');
        }
      });
      const next = Math.min(idx + pasted.length, 5);
      inputs[next].focus();
      if (getOtpValue().length === 6) {
        setTimeout(() => document.getElementById('otpForm').requestSubmit(), 120);
      }
    });
  });
}

// ── Countdown ────────────────────────────────────────────────────
function startCountdown() {
  updateTimerUI(secondsLeft);
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    secondsLeft--;
    updateTimerUI(secondsLeft);
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      handleExpiry();
    }
  }, 1000);
}

function updateTimerUI(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const label = `${m}:${String(s).padStart(2, '0')}`;
  document.getElementById('timerLabel').textContent = label;
  document.getElementById('timerDisplay').textContent = label;

  // SVG ring (0 = full, 150.8 = empty; total 300s)
  const dashoffset = ((300 - secs) / 300) * 150.8;
  const ring = document.getElementById('timerRing');
  if (ring) ring.style.strokeDashoffset = dashoffset;

  // Colour shift
  const timerWrap = document.querySelector('.otp-timer-ring');
  if (timerWrap) {
    timerWrap.classList.toggle('timer-warning', secs <= 60 && secs > 0);
    timerWrap.classList.toggle('timer-expired', secs <= 0);
  }
}

function handleExpiry() {
  showAlert('warning', '⏰ Your OTP has expired. Please request a new one.');
  document.getElementById('verifyBtn').disabled = true;
  document.getElementById('timerText').textContent = 'Code expired';
  setDigitsError(true);
  enableResendBtn();
}

// ── Submit OTP ───────────────────────────────────────────────────
async function submitOTP(e) {
  e.preventDefault();

  const otp = getOtpValue();
  if (otp.length !== 6) {
    document.getElementById('otpError').textContent = 'Please enter all 6 digits.';
    setDigitsError(true);
    return;
  }

  clearError();
  setLoading(true);

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showAlert('success', '✅ Email verified successfully! Redirecting to login…');
      document.getElementById('verifyBtn').disabled = true;
      setTimeout(() => {
        window.location.href = '/login?verified=1';
      }, 1500);
      return;
    }

    // ── Error handling ──────────────────────────────────────────
    if (data.expired) {
      handleExpiry();
    } else if (data.tooManyAttempts) {
      showAlert('danger', '🚫 Too many incorrect attempts. Please request a new OTP.');
      document.getElementById('verifyBtn').disabled = true;
      clearInterval(countdownInterval);
      updateTimerUI(0);
      setDigitsError(true);
      enableResendBtn();
    } else {
      const remaining = data.attemptsRemaining != null
        ? ` (${data.attemptsRemaining} attempt${data.attemptsRemaining !== 1 ? 's' : ''} remaining)`
        : '';
      showAlert('danger', `❌ ${data.error || 'Invalid OTP.'}${remaining}`);
      setDigitsError(true);
      // Shake animation
      document.getElementById('otpInputs').classList.add('shake');
      setTimeout(() => document.getElementById('otpInputs').classList.remove('shake'), 600);
      clearDigits();
    }
  } catch (err) {
    console.error(err);
    showAlert('danger', 'Network error. Please try again.');
  } finally {
    setLoading(false);
  }
}

// ── Resend OTP ───────────────────────────────────────────────────
async function resendOTP() {
  const btn = document.getElementById('resendBtn');
  btn.disabled = true;

  clearAlert();
  showAlert('info', '📨 Sending a new OTP…');

  try {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (res.status === 429) {
      document.getElementById('resendLimit').classList.remove('hidden');
      document.getElementById('resendCooldown').classList.add('hidden');
      showAlert('warning', '⏳ Too many resend attempts. Please wait 15 minutes.');
      return;
    }

    if (res.ok && data.success) {
      // Reset everything
      secondsLeft = 300;
      clearInterval(countdownInterval);
      clearDigits();
      setDigitsError(false);
      document.getElementById('verifyBtn').disabled = false;
      startCountdown();
      showAlert('success', '✅ New OTP sent! Check your email.');

      // Cooldown before next resend
      startResendCooldown();
    } else {
      showAlert('danger', data.error || 'Could not resend OTP. Please try again.');
      btn.disabled = false;
    }
  } catch (err) {
    console.error(err);
    showAlert('danger', 'Network error. Please try again.');
    btn.disabled = false;
  }
}

function enableResendBtn() {
  const btn = document.getElementById('resendBtn');
  btn.disabled = false;
}

function startResendCooldown() {
  let secs = RESEND_COOLDOWN_SEC;
  const cooldownEl = document.getElementById('resendCooldown');
  const timerEl = document.getElementById('resendTimer');
  const btn = document.getElementById('resendBtn');

  btn.disabled = true;
  cooldownEl.classList.remove('hidden');
  timerEl.textContent = secs;

  clearInterval(resendCooldownInterval);
  resendCooldownInterval = setInterval(() => {
    secs--;
    timerEl.textContent = secs;
    if (secs <= 0) {
      clearInterval(resendCooldownInterval);
      cooldownEl.classList.add('hidden');
      btn.disabled = false;
    }
  }, 1000);
}

// ── UI helpers ────────────────────────────────────────────────────
function showAlert(type, msg) {
  const el = document.getElementById('alertContainer');
  el.className = `alert-container alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAlert() {
  const el = document.getElementById('alertContainer');
  el.className = 'alert-container hidden';
  el.textContent = '';
}

function clearError() {
  document.getElementById('otpError').textContent = '';
  setDigitsError(false);
}

function setLoading(flag) {
  document.getElementById('verifyBtnText').classList.toggle('hidden', flag);
  document.getElementById('verifyBtnLoader').classList.toggle('hidden', !flag);
  document.getElementById('verifyBtn').disabled = flag;
}
