/* ════════════════════════════════════════════════════════════
   login.js  –  Login page JavaScript
════════════════════════════════════════════════════════════ */

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

function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const eye   = document.getElementById(inputId + 'Eye');
  if (input.type === 'password') { input.type = 'text';     if (eye) eye.textContent = '🙈'; }
  else                           { input.type = 'password'; if (eye) eye.textContent = '👁️'; }
}

document.addEventListener('DOMContentLoaded', () => {
  const form      = document.getElementById('loginForm');
  const emailIn   = document.getElementById('emailInput');
  const passIn    = document.getElementById('passwordInput');
  const submitBtn = document.getElementById('submitBtn');

  /* Show success banner when redirected from OTP verify page */
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    showAlert('✅ Email verified successfully! You can now log in.', 'success');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = emailIn.value.trim();
    const password = passIn.value;

    /* client-side guards */
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
        showAlert(`Welcome back, <strong>${data.user.username}</strong>! Login successful.`, 'success');
        /* In a real app you would redirect or set a session cookie here */
        setTimeout(() => {
          form.innerHTML = `
            <div style="text-align:center;padding:24px 0">
              <div style="font-size:3.5rem;margin-bottom:16px">👋</div>
              <h2 style="color:#27ae60;margin-bottom:10px">Welcome, ${data.user.username}!</h2>
              <p style="color:#555">You are now logged in.</p>
            </div>`;
        }, 1200);
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
