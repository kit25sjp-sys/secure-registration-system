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
    showAlert('No email address provided. Please register again.', 'danger');
    document.getElementById('verifyBtn').disabled = true;
    return;
  }

  // Display masked email
  document.getElementById('displayEmail').textContent = maskEmail(email);

  // Wire form
  document.getElementById('otpForm').addEventListener('submit', submitOTP);

  // Wire resend button
  document.getElementById('resendBtn').addEventListener('click', resendOTP);

  // Wire digit inputs
  wireDigitInputs();

  // Start countdown
  startCountdown();

  // Focus first box
  document.querySelectorAll('.otp-digit')[0].focus();
});

// ── Demo OTP display (no-op: OTPs are now delivered by Gmail SMTP) ────────
function showDemoOtp(_otp) { 
  // intentionally empty 
}

// ── Helpers ──────────────────────────────────────────────────────
// maskEmail & getOtpValue are imported from clientUtils.js

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
  // Reset timer state
  secondsLeft = 300;
  
  // Clear any existing intervals
  clearInterval(countdownInterval);
  
  // Initial display update
  updateTimerUI(secondsLeft);
  console.log('Countdown started - initial value:', secondsLeft);

  // Start countdown interval
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
  // Calculate minutes and seconds
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const label = `${m}:${String(s).padStart(2, '0')}`;
  
  // Update text display
  const timerLabel = document.getElementById('timerLabel');
  const timerDisplay = document.getElementById('timerDisplay');
  
  if (timerLabel) timerLabel.textContent = label;
  if (timerDisplay) timerDisplay.textContent = label;

  // Update SVG ring (0 = full circle, 150.8 = empty; total 300s)
  const ring = document.getElementById('timerRing');
  if (ring) {
    const dashoffset = ((300 - secs) / 300) * 150.8;
    ring.style.strokeDashoffset = dashoffset;
  }

  // Update color classes based on time remaining
  const timerWrap = document.querySelector('.otp-timer-ring');
  if (timerWrap) {
    timerWrap.classList.remove('timer-warning', 'timer-expired');
    if (secs <= 0) {
      timerWrap.classList.add('timer-expired');
    } else if (secs <= 60) {
      timerWrap.classList.add('timer-warning');
    }
  }
}

function handleExpiry() {
  showAlert('⏰ Your OTP has expired. Please request a new one.', 'warning');
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

  if (!email) {
    showAlert('Email is missing. Please go back and register again.', 'danger');
    return;
  }

  clearError();
  setLoading(true);

  try {
    console.log('🔐 Submitting OTP for email:', email, 'OTP length:', otp.length);
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    
    console.log('📨 Response status:', res.status, res.statusText);
    
    let data;
    try {
      const text = await res.text();
      console.log('📦 Raw response:', text);
      data = JSON.parse(text);
      console.log('📦 Parsed data:', data);
    } catch (parseErr) {
      console.error('❌ JSON parse error:', parseErr);
      showAlert('Server returned invalid response. Please try again.', 'danger');
      setLoading(false);
      return;
    }

    if (res.ok && data.success) {
      showAlert('✅ OTP verified! Redirecting…', 'success');
      document.getElementById('verifyBtn').disabled = true;
      
      console.log('✅ [Response] OTP verification successful');
      console.log('📦 [Response] Full data:', JSON.stringify(data));
      
      // Redirect based on user role
      setTimeout(() => {
        let redirectUrl = '/dashboard';
        
        // Check user role from response and redirect accordingly
        if (data.user && data.user.role) {
          const role = data.user.role.toLowerCase();
          console.log('👤 [Redirect] User role:', role);
          
          if (role === 'admin') {
            redirectUrl = '/admin';
          } else if (role === 'moderator' || role === 'editor' || role === 'manager') {
            redirectUrl = '/editor';
          }
        }
        
        console.log('🔄 [Redirect] Going to:', redirectUrl);
        console.log('🍪 [Redirect] Cookies should be set, now navigating...');
        window.location.replace(redirectUrl);
      }, 1200);
      return;
    } else if (res.ok && data.alreadyVerified) {
      showAlert('✅ Account already verified. Redirecting to login...', 'success');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1000);
      return;
    }

    // ── Error handling ──────────────────────────────────────────
    console.warn('⚠️ OTP verification failed:', data);
    if (data.expired) {
      handleExpiry();
    } else if (data.tooManyAttempts) {
      showAlert('🚫 Too many incorrect attempts. Please request a new OTP.', 'danger');
      document.getElementById('verifyBtn').disabled = true;
      clearInterval(countdownInterval);
      updateTimerUI(0);
      setDigitsError(true);
      enableResendBtn();
    } else {
      const remaining = data.attemptsRemaining != null
        ? ` (${data.attemptsRemaining} attempt${data.attemptsRemaining !== 1 ? 's' : ''} remaining)`
        : '';
      showAlert(`❌ ${data.message || 'Invalid OTP.'}${remaining}`, 'danger');
      setDigitsError(true);
      // Shake animation
      document.getElementById('otpInputs').classList.add('shake');
      setTimeout(() => document.getElementById('otpInputs').classList.remove('shake'), 600);
      clearDigits();
    }
  } catch (err) {
    console.error('🔥 Catch error:', err);
    showAlert(`Network error: ${err.message || 'Please try again.'}`, 'danger');
  } finally {
    setLoading(false);
  }
}

// ── Resend OTP ───────────────────────────────────────────────────
async function resendOTP() {
  const btn = document.getElementById('resendBtn');
  btn.disabled = true;

  clearAlert();
  showAlert('📨 Sending a new OTP…', 'info');

  try {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (res.status === 429) {
      document.getElementById('resendLimit').classList.remove('hidden');
      document.getElementById('resendCooldown').classList.add('hidden');
      showAlert('⏳ Too many resend attempts. Please wait 15 minutes.', 'warning');
      return;
    }

    if (res.ok && data.success) {
      // Reset everything
      secondsLeft = 300;
      clearInterval(countdownInterval);
      clearInterval(resendCooldownInterval);
      clearDigits();
      setDigitsError(false);
      document.getElementById('verifyBtn').disabled = false;
      
      // Clear hidden states
      document.getElementById('resendCooldown').classList.add('hidden');
      document.getElementById('resendLimit').classList.add('hidden');
      
      // Start fresh countdown
      startCountdown();
      showAlert('✅ New OTP sent to your email!', 'success');

      // Cooldown before next resend
      startResendCooldown();
    } else {
      showAlert(data.message || 'Could not resend OTP. Please try again.', 'danger');
      btn.disabled = false;
    }
  } catch (err) {
    console.error(err);
    showAlert('Network error. Please try again.', 'danger');
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
// showAlert is now provided by clientUtils.js

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
