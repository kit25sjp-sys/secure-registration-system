// ══════════════════════════════════════════════════════════════
// change-password.js  –  Change-Password page JavaScript
// Handles:
//   • Session guard (redirect to /login if unauthenticated)
//   • Password-toggle eye buttons
//   • Live password-strength meter & requirements checklist
//   • Form submission → POST /api/auth/change-password
//   • Displays "cannot reuse old password" and other API errors
// ══════════════════════════════════════════════════════════════

/* ── Alert helpers ──────────────────────────────────────── */
function showAlert(msg, type = 'error') {
  const c     = document.getElementById('alertContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  c.innerHTML = `<div class="alert alert-${type}"><span>${icons[type] || 'ℹ️'}</span><div>${msg}</div></div>`;
  c.classList.remove('hidden');
  c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideAlert() {
  const c = document.getElementById('alertContainer');
  c.classList.add('hidden');
  c.innerHTML = '';
}

/* ── Eye-icon SVG builder ───────────────────────────────── */
function makeEyeSVG(crossed) {
  const base = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if (!crossed) {
    return `<svg ${base}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  return `<svg ${base}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

/* ── Strength-meter helpers ─────────────────────────────── */
const STRENGTH_COLORS = ['', '#e74c3c', '#f39c12', '#3498db', '#27ae60'];
const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

function updateStrengthUI(score, checks) {
  const segs   = [1, 2, 3, 4].map(n => document.getElementById(`seg${n}`));
  const label  = document.getElementById('strengthLabel');
  const color  = STRENGTH_COLORS[score] || '#ddd';

  segs.forEach((s, i) => {
    s.style.background = i < score ? color : '#e0e0e0';
  });
  label.textContent  = score > 0 ? STRENGTH_LABELS[score] : 'Password strength';
  label.style.color  = color;

  // Requirements ticks
  const map = {
    'req-length' : checks?.length,
    'req-upper'  : checks?.uppercase,
    'req-lower'  : checks?.lowercase,
    'req-number' : checks?.number,
    'req-special': checks?.special,
  };
  Object.entries(map).forEach(([id, ok]) => {
    const el   = document.getElementById(id);
    if (!el) return;
    const icon = el.querySelector('.req-icon');
    el.classList.toggle('req-pass', !!ok);
    el.classList.toggle('req-fail', !ok);
    if (icon) icon.textContent = ok ? '✔' : '○';
  });
}

/* ── Debounce ───────────────────────────────────────────── */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ══════════════════════════════════════════════════════════════
// Main init
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  /* ── 1. Auth guard – must be logged in ─────────────── */
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await resp.json();
    if (!data.success) { window.location.replace('/login'); return; }
  } catch {
    window.location.replace('/login');
    return;
  }

  /* ── 2. Password-toggle eye buttons ────────────────── */
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById(btn.getAttribute('data-target'));
      const eye   = document.getElementById(btn.getAttribute('data-target') + 'Eye');
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      if (eye) eye.innerHTML = makeEyeSVG(isPassword);
      btn.classList.toggle('active', isPassword);
    });
  });

  // ── 3. Live strength meter for new password ─────────
  const newPassInput = document.getElementById('newPasswordInput');
  const checkStrength = debounce(async (val) => {
    if (!val) { updateStrengthUI(0, {}); return; }
    try {
      const r = await fetch('/api/auth/check-password', {
        method:  'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: val }),
      });
      const d = await r.json();
      if (d.success) updateStrengthUI(d.score, d.checks);
    } catch (err) {
      console.error('Strength check error:', err);
    }
  }, 300);

  newPassInput.addEventListener('input', () => {
    checkStrength(newPassInput.value);
    document.getElementById('newPasswordError').textContent = '';
    newPassInput.classList.remove('error');
  });

  // ── 4. Clear errors on typing ──────────────────
  document.getElementById('oldPasswordInput').addEventListener('input', () => {
    document.getElementById('oldPasswordError').textContent = '';
    document.getElementById('oldPasswordInput').classList.remove('error');
    hideAlert();
  });
  document.getElementById('confirmPasswordInput').addEventListener('input', () => {
    document.getElementById('confirmPasswordError').textContent = '';
    document.getElementById('confirmPasswordInput').classList.remove('error');
  });

  /* ── 5. Logout button ───────────────────────────────── */
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } finally {
        window.location.replace('/login');
      }
    });
  }

  /* ── 6. Form submission ─────────────────────────────── */
  const form      = document.getElementById('changePasswordForm');
  const submitBtn = document.getElementById('submitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const oldPassword     = document.getElementById('oldPasswordInput').value;
    const newPassword     = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    // ── Client-side validation ––
    let valid = true;

    if (!oldPassword) {
      document.getElementById('oldPasswordError').textContent = 'Please enter your current password.';
      document.getElementById('oldPasswordInput').classList.add('error');
      valid = false;
    }

    if (!newPassword) {
      document.getElementById('newPasswordError').textContent = 'Please enter a new password.';
      document.getElementById('newPasswordInput').classList.add('error');
      valid = false;
    } else if (newPassword.length < 8) {
      document.getElementById('newPasswordError').textContent = 'New password must be at least 8 characters.';
      document.getElementById('newPasswordInput').classList.add('error');
      valid = false;
    }

    if (!confirmPassword) {
      document.getElementById('confirmPasswordError').textContent = 'Please confirm your new password.';
      document.getElementById('confirmPasswordInput').classList.add('error');
      valid = false;
    } else if (newPassword && newPassword !== confirmPassword) {
      document.getElementById('confirmPasswordError').textContent = 'Passwords do not match.';
      document.getElementById('confirmPasswordInput').classList.add('error');
      valid = false;
    }

    if (!valid) return;

    // ── Submit to API ––
    const btnText   = document.getElementById('submitBtnText');
    const btnLoader = document.getElementById('submitBtnLoader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
      const resp = await fetch('/api/auth/change-password', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      });
      const data = await resp.json();

      if (data.success) {
        showAlert(
          `<strong>Password changed successfully!</strong><br>
           You will be redirected to the login page to sign in with your new password.`,
          'success'
        );
        // Clear the form fields so the password is gone from the DOM
        form.reset();
        updateStrengthUI(0, {});
        submitBtn.disabled = true;
        setTimeout(() => window.location.replace('/login?passwordChanged=1'), 2500);
      } else {
        // Check for the password-reuse rejection specifically
        if (data.message && data.message.toLowerCase().includes('cannot reuse')) {
          showAlert(
            `<strong>&#128683; Password Reuse Detected</strong><br>${data.message}`,
            'warning'
          );
        } else if (data.message && data.message.toLowerCase().includes('old password is incorrect')) {
          document.getElementById('oldPasswordError').textContent = 'Incorrect current password.';
          document.getElementById('oldPasswordInput').classList.add('error');
          showAlert('The current password you entered is incorrect.', 'error');
        } else {
          showAlert(data.message || 'Password change failed. Please try again.', 'error');
        }
      }
    } catch {
      showAlert('Network error. Please check your connection and try again.', 'error');
    } finally {
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      submitBtn.disabled = false;
    }
  });
});
