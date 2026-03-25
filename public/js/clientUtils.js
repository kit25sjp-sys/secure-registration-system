// clientUtils.js - Shared JavaScript Utilities for Frontend
// Centralized alert, SVG, validation, and UI helpers used across all pages

// ALERT / NOTIFICATION SYSTEM

/**
 * Show alert message to user
 * @param {string} msg - Alert message (supports HTML)
 * @param {string} type - 'success' | 'error' | 'danger' | 'warning' | 'info'
 */
function showAlert(msg, type = 'error') {
  const container = document.getElementById('alertContainer');
  if (!container) return;

  // Normalize type: 'error' -> 'danger', 'danger' -> 'danger'
  let alertType = type;
  if (type === 'error') alertType = 'danger';

  const icons = { 
    danger: '❌',
    success: '✅', 
    warning: '⚠️', 
    info: 'ℹ️' 
  };

  container.innerHTML = `
    <div class="alert alert-${alertType}">
      <span>${icons[alertType] || 'ℹ️'}</span>
      <div>${msg}</div>
    </div>
  `;
  container.classList.remove('hidden');
  
  // Smooth scroll into view
  try {
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    // Fallback for older browsers
    container.scrollIntoView();
  }
}

/**
 * Hide alert message
 */
function hideAlert() {
  const container = document.getElementById('alertContainer');
  if (!container) return;
  container.classList.add('hidden');
  container.innerHTML = '';
}

// SVG ICONS

/**
 * Generate eye icon SVG for password visibility toggle
 * @param {boolean} crossed - Should eye be crossed out (closed)?
 * @returns {string} - SVG HTML string
 */
function makeEyeSVG(crossed = false) {
  const base = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  
  if (!crossed) {
    // Open eye
    return `<svg ${base}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  
  // Closed eye with slash
  return `<svg ${base}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

// EMAIL / TEXT UTILITIES

/**
 * Mask email address for display (privacy)
 * Shows first 1-2 chars of username, rest masked
 * @param {string} email - Email to mask
 * @returns {string} - Masked email (e.g., "ab***@example.com")
 */
function maskEmail(email) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  
  const visible = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  const masked = '*'.repeat(Math.max(user.length - 2, 2));
  
  return `${visible}${masked}@${domain}`;
}

/**
 * Debounce function - delay execution until stops being called
 * @param {function} fn - Function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {function} - Debounced function
 */
function debounce(fn, ms = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// OTP / DIGIT INPUT HANDLING

/**
 * Get OTP value from multiple digit inputs
 * @returns {string} - Full OTP code (e.g., "123456")
 */
function getOtpValue() {
  const inputs = document.querySelectorAll('.otp-digit');
  return Array.from(inputs).map(inp => inp.value).join('');
}

/**
 * Setup OTP digit input handlers (arrow keys, backspace, paste, auto-focus)
 * Call this once on page load for OTP pages
 * @param {function} onComplete - Optional callback when all 6 digits filled
 */
function setupOtpInputs(onComplete = null) {
  const inputs = Array.from(document.querySelectorAll('.otp-digit'));
  
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', (e) => {
      // Backspace: clear current or previous
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
        return;
      }
      
      // Arrow navigation
      if (e.key === 'ArrowLeft' && idx > 0) {
        inputs[idx - 1].focus();
        return;
      }
      if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
        return;
      }
      
      // Only allow digits
      if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
        e.preventDefault();
      }
    });

    // Auto-advance on digit input
    inp.addEventListener('input', () => {
      const digit = inp.value.replace(/\D/g, '').slice(-1);
      inp.value = digit;
      inp.classList.toggle('filled', !!digit);
      
      if (digit && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
      
      // Auto-submit when all digits filled
      const fullOtp = getOtpValue();
      if (fullOtp.length === inputs.length) {
        if (onComplete) {
          setTimeout(() => onComplete(), 150);
        }
      }
    });

    // Paste support: paste full OTP into any box
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, inputs.length);
      
      pasted.split('').forEach((digit, i) => {
        if (inputs[idx + i]) {
          inputs[idx + i].value = digit;
          inputs[idx + i].classList.add('filled');
        }
      });
      
      const nextIdx = Math.min(idx + pasted.length, inputs.length - 1);
      inputs[nextIdx].focus();
      
      // Auto-submit if complete
      if (getOtpValue().length === inputs.length) {
        if (onComplete) {
          setTimeout(() => onComplete(), 150);
        }
      }
    });
  });
}

// PASSWORD VISIBILITY TOGGLE

/**
 * Setup password visibility toggle buttons
 * Call this once on page load for forms with password fields
 * Expects HTML structure:
 * <button class="toggle-password" data-target="passwordInputId">...</button>
 */
function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const inputId = btn.getAttribute('data-target');
      const input = document.getElementById(inputId);
      const eyeId = inputId + 'Eye';
      const eye = document.getElementById(eyeId);
      
      if (!input) return;
      
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      // Update eye icon
      if (eye) {
        eye.innerHTML = makeEyeSVG(isPassword);
      }
      
      btn.classList.toggle('active', isPassword);
    });
  });
}

// FORM / API HELPERS

/**
 * Make API call with proper error handling
 * @param {string} url - API endpoint
 * @param {object} options - Fetch options
 * @returns {object} - Parsed JSON response
 */
async function apiCall(url, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    
    if (!response.ok && !data.success) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (err) {
    console.error('API call error:', err);
    throw err;
  }
}

/**
 * Enable button loading state
 * @param {string} buttonId - Button element ID
 */
function setButtonLoading(buttonId, isLoading = true) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  
  btn.disabled = isLoading;
  const text = btn.querySelector('[id$="Text"]');
  const loader = btn.querySelector('[id$="Loader"]');
  
  if (text && loader) {
    text.classList.toggle('hidden', isLoading);
    loader.classList.toggle('hidden', !isLoading);
  }
}
