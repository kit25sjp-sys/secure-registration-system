// Combined Password Reset Workflow
// Handles: Email → OTP → New Password in one seamless flow

let resetEmail = '';

document.addEventListener('DOMContentLoaded', () => {
  // Step 1: Email submission
  document.getElementById('emailForm').addEventListener('submit', handleEmailSubmit);
  
  // Step 2: OTP submission
  document.getElementById('otpForm').addEventListener('submit', handleOtpSubmit);
  document.getElementById('resendBtn').addEventListener('click', handleResendOtp);
  
  // Step 3: Password reset
  document.getElementById('passwordForm').addEventListener('submit', handlePasswordSubmit);
  
  // Password visibility toggles
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', togglePasswordVisibility);
  });
  
  // Real-time password strength check
  document.getElementById('newPassword').addEventListener('input', checkPasswordStrength);
  
  // OTP input handling
  setupOtpInputs();
});

// ═══════════════════════════════════════════════════════════
// STEP 1: Email Input Handler
// ═══════════════════════════════════════════════════════════
async function handleEmailSubmit(e) {
  e.preventDefault();
  
  resetEmail = document.getElementById('emailInput').value.trim().toLowerCase();
  const btn = document.getElementById('emailBtn');
  const btnText = document.getElementById('emailBtnText');
  const btnLoader = document.getElementById('emailBtnLoader');
  
  if (!resetEmail) {
    showAlert('alertContainer', 'danger', '❌ Please enter your email address.');
    return;
  }
  
  // Show loading
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btn.disabled = true;
  
  try {
    console.log('📧 Requesting password reset for:', resetEmail);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      console.log('✅ Reset code sent');
      showAlert('alertContainer', 'success', '✅ Check your email for the reset code!');
      
      // Move to Step 2
      transitionToStep(2);
      document.getElementById('displayEmail').textContent = maskEmail(resetEmail);
      
      // Clear OTP inputs
      clearOtpInputs();
      document.querySelector('.otp-digit').focus();
    } else {
      showAlert('alertContainer', 'danger', data.message || 'Failed to send reset code.');
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      btn.disabled = false;
    }
  } catch (err) {
    console.error('Error:', err);
    showAlert('alertContainer', 'danger', 'Network error. Please try again.');
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 2: OTP Verification Handler
// ═══════════════════════════════════════════════════════════
async function handleOtpSubmit(e) {
  e.preventDefault();
  
  const otp = getOtpValue();
  if (otp.length !== 6) {
    showAlert('otpAlertContainer', 'danger', '❌ Please enter all 6 digits.');
    return;
  }
  
  const btn = document.getElementById('otpBtn');
  const btnText = document.getElementById('otpBtnText');
  const btnLoader = document.getElementById('otpBtnLoader');
  
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btn.disabled = true;
  
  try {
    console.log('🔐 Verifying OTP');
    const res = await fetch('/api/auth/verify-reset-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail, otp })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      console.log('✅ OTP verified');
      showAlert('otpAlertContainer', 'success', '✅ Email verified! Now set your new password.');
      
      // Move to Step 3
      setTimeout(() => transitionToStep(3), 500);
    } else {
      showAlert('otpAlertContainer', 'danger', data.message || 'Invalid code.');
      clearOtpInputs();
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      btn.disabled = false;
    }
  } catch (err) {
    console.error('Error:', err);
    showAlert('otpAlertContainer', 'danger', 'Verification failed.');
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 2: Resend OTP
// ═══════════════════════════════════════════════════════════
async function handleResendOtp(e) {
  e.preventDefault();
  
  const btn = document.getElementById('resendBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Sending...';
  
  try {
    const res = await fetch('/api/auth/resend-reset-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      showAlert('otpAlertContainer', 'success', '✅ New code sent to your email!');
      clearOtpInputs();
      
      // Cooldown timer
      let countdown = 60;
      btn.textContent = `Resend in ${countdown}s`;
      const timer = setInterval(() => {
        countdown--;
        btn.textContent = countdown > 0 ? `Resend in ${countdown}s` : originalText;
        if (countdown <= 0) {
          clearInterval(timer);
          btn.disabled = false;
        }
      }, 1000);
    } else {
      showAlert('otpAlertContainer', 'danger', data.message || 'Failed to resend code.');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (err) {
    showAlert('otpAlertContainer', 'danger', 'Failed to resend code.');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 3: Password Reset Handler
// ═══════════════════════════════════════════════════════════
async function handlePasswordSubmit(e) {
  e.preventDefault();
  
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  // Validation
  if (newPassword !== confirmPassword) {
    showAlert('resetAlertContainer', 'danger', '❌ Passwords do not match.');
    return;
  }
  
  if (newPassword.length < 8) {
    showAlert('resetAlertContainer', 'danger', '❌ Password must be at least 8 characters.');
    return;
  }
  
  const btn = document.getElementById('resetBtn');
  const btnText = document.getElementById('resetBtnText');
  const btnLoader = document.getElementById('resetBtnLoader');
  
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btn.disabled = true;
  
  try {
    console.log('🔐 Resetting password');
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: resetEmail, 
        newPassword, 
        confirmPassword 
      })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      console.log('✅ Password reset successful');
      document.getElementById('step3').classList.add('hidden');
      document.getElementById('successStep').classList.remove('hidden');
      document.getElementById('step3-indicator').classList.remove('active');
      document.getElementById('step3-indicator').classList.add('completed');
    } else {
      showAlert('resetAlertContainer', 'danger', data.message || 'Failed to reset password.');
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      btn.disabled = false;
    }
  } catch (err) {
    console.error('Error:', err);
    showAlert('resetAlertContainer', 'danger', 'Failed to reset password.');
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════

function transitionToStep(stepNum) {
  // Hide all steps
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.add('hidden');
  document.getElementById('step3').classList.add('hidden');
  
  // Update indicators
  for (let i = 1; i <= 3; i++) {
    const indicator = document.getElementById(`step${i}-indicator`);
    if (i < stepNum) {
      indicator.classList.remove('active');
      indicator.classList.add('completed');
    } else if (i === stepNum) {
      indicator.classList.remove('completed');
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active', 'completed');
    }
  }
  
  // Show current step
  document.getElementById(`step${stepNum}`).classList.remove('hidden');
}

// maskEmail & getOtpValue imported from clientUtils.js (to avoid duplication)

function clearOtpInputs() {
  document.querySelectorAll('.otp-digit').forEach(inp => {
    inp.value = '';
  });
}

function setupOtpInputs() {
  const inputs = [...document.querySelectorAll('.otp-digit')];
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (inp.value) {
          inp.value = '';
        } else if (idx > 0) {
          inputs[idx - 1].value = '';
          inputs[idx - 1].focus();
        }
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
      if (digit && idx < 5) inputs[idx + 1].focus();
      if (getOtpValue().length === 6) {
        setTimeout(() => handleOtpSubmit(new Event('submit')), 100);
      }
    });
    
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text').replace(/\D/g, '').slice(0, 6);
      pasted.split('').forEach((ch, i) => {
        if (inputs[idx + i]) inputs[idx + i].value = ch;
      });
      const next = Math.min(idx + pasted.length, 5);
      inputs[next].focus();
      if (getOtpValue().length === 6) {
        setTimeout(() => handleOtpSubmit(new Event('submit')), 100);
      }
    });
  });
}

function togglePasswordVisibility(e) {
  e.preventDefault();
  const targetId = e.target.dataset.target;
  const input = document.getElementById(targetId);
  input.type = input.type === 'password' ? 'text' : 'password';
  e.target.textContent = input.type === 'password' ? '👁️' : '👁️‍🗨️';
}

function checkPasswordStrength(e) {
  const password = e.target.value;
  const strengthDiv = document.getElementById('passwordStrength');
  
  if (!password) {
    strengthDiv.textContent = '';
    return;
  }
  
  let score = 0;
  const checks = [];
  
  if (password.length >= 8) { score++; checks.push('✅ At least 8 characters'); }
  else { checks.push('❌ At least 8 characters'); }
  
  if (/[a-z]/.test(password)) { score++; checks.push('✅ Lowercase letters'); }
  else { checks.push('❌ Lowercase letters'); }
  
  if (/[A-Z]/.test(password)) { score++; checks.push('✅ Uppercase letters'); }
  else { checks.push('❌ Uppercase letters'); }
  
  if (/[0-9]/.test(password)) { score++; checks.push('✅ Numbers'); }
  else { checks.push('❌ Numbers'); }
  
  if (/[!@#$%^&*]/.test(password)) { score++; checks.push('✅ Special characters'); }
  else { checks.push('❌ Special characters'); }
  
  let label = '🟡 Weak';
  if (score >= 4) label = '🟢 Strong';
  else if (score >= 3) label = '🟡 Medium';
  
  strengthDiv.innerHTML = `<strong>${label}</strong><br>${checks.join('<br>')}`;
}

function showAlert(containerId, type, msg) {
  const el = document.getElementById(containerId);
  el.className = `alert-container alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
