// ══════════════════════════════════════════════════════════════
// login.js  –  Login page JavaScript
// ══════════════════════════════════════════════════════════════

function showAlert(msg, type = 'error') {
  const c     = document.getElementById('alertContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  c.innerHTML = `<div class="alert alert-${type}"><span>${icons[type]}</span><div>${msg}</div></div>`;
  c.classList.remove('hidden');
}
function hideAlert() {
  const c = document.getElementById('alertContainer');
  c.classList.add('hidden'); c.innerHTML = '';
}

const SVG_EYE_OPEN   = null; // unused – kept to avoid reference errors from old HTML
const SVG_EYE_CLOSED = null;

function _makeEyeSVG(crossed) {
  var base = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if (!crossed) {
    return '<svg ' + base + '><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  return '<svg ' + base + '><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

function togglePassword() {} // no-op – now wired via addEventListener

// Switch between logged-in accounts
async function switchAccount(sessionId) {
  try {
    const session = SessionManager.getSessions()[sessionId];
    if (!session) return;
    
    // Need to re-login this account on the backend
    // For now, just update the active session and reload
    SessionManager.setActiveSession(sessionId);
    
    showAlert(`Switched to <strong>${session.username}</strong>`, 'success');
    setTimeout(() => {
      const role = session.role || 'user';
      const targetUrl = role === 'admin' ? '/admin.html' : ((role === 'moderator' || role === 'editor') ? '/editor.html' : '/dashboard.html');
      window.location.replace(targetUrl);
    }, 1000);
  } catch (err) {
    console.error('Error switching account:', err);
    showAlert('Failed to switch account', 'error');
  }
}

function togglePassword() {} // no-op – now wired via addEventListener

document.addEventListener('DOMContentLoaded', () => {
  // Wire all password-toggle buttons
  document.querySelectorAll('.toggle-password').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var inputId = btn.getAttribute('data-target');
      var input   = document.getElementById(inputId);
      var eye     = document.getElementById(inputId + 'Eye');
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      if (eye) eye.innerHTML = _makeEyeSVG(show);
      btn.classList.toggle('active', show);
    });
  });

  const form      = document.getElementById('loginForm');
  const emailIn   = document.getElementById('emailInput');
  const passIn    = document.getElementById('passwordInput');
  const submitBtn = document.getElementById('submitBtn');

  // Show success banner when redirected from OTP verify or password-change
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    showAlert('✅ Email verified successfully! You can now log in.', 'success');
  }
  if (params.get('passwordChanged') === '1') {
    showAlert('🔒 Password changed successfully! Please sign in with your new password.', 'success');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = emailIn.value.trim();
    const password = passIn.value;

    // client-side guards
    let valid = true;
    if (!email) {
      document.getElementById('emailError').textContent = 'Email is required';
      emailIn.classList.add('error'); valid = false;
    } else {
      document.getElementById('emailError').textContent = '';
      emailIn.classList.remove('error');
    }
    if (!password) {
      document.getElementById('passwordError').textContent = 'Password is required';
      passIn.classList.add('error'); valid = false;
    } else {
      document.getElementById('passwordError').textContent = '';
      passIn.classList.remove('error');
    }


    if (!valid) return;

    /* submit */
    const btnText   = document.getElementById('submitBtnText');
    const btnLoader = document.getElementById('submitBtnLoader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();

      if (data.needsOtp) {
        /* Account exists but email not yet verified – send user to OTP page */
        window.location.href = `/otp-verify?email=${encodeURIComponent(data.email)}`;
        return;
      }

      if (data.success) {
        // Store session in SessionManager
        const sessionId = 'session_' + Date.now();
        SessionManager.addSession(sessionId, {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          role: data.user.role || 'user',
        });

        showAlert(`Welcome back, <strong>${data.user.username}</strong>!`, 'success');
        
        // Show redirect options
        const role = data.user.role || 'user';
        const targetUrl = role === 'admin' ? '/admin.html' : ((role === 'moderator' || role === 'editor') ? '/editor.html' : '/dashboard.html');
        
        setTimeout(() => {
          window.location.replace(targetUrl);
        }, 1500);
      } else {
        showAlert(data.message || 'Login failed. Please try again.', 'error');
        if (resp.status === 423) {
          submitBtn.disabled = true;
          showAlert(data.message, 'warning');
        }
      }
    } catch {
      showAlert('Network error. Please check your connection.', 'error');
    } finally {
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      if (submitBtn.disabled && !form.querySelector('[style]')) submitBtn.disabled = false;
    }
  });

  /* real-time clear errors */
  emailIn.addEventListener('input', () => { document.getElementById('emailError').textContent = ''; emailIn.classList.remove('error'); });
  passIn.addEventListener('input',  () => { document.getElementById('passwordError').textContent = ''; passIn.classList.remove('error'); });
});
