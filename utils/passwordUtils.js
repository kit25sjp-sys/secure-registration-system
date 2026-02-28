/* ──────────────────────────────────────────────────────────────
   Password strength evaluator
   Returns: { score, strength, label, suggestions, checks }
──────────────────────────────────────────────────────────────── */

const COMMON_PASSWORDS = new Set([
  'password','password1','password123','12345678','123456789',
  'qwerty','qwerty123','abc123','letmein','monkey','1234567',
  'dragon','baseball','iloveyou','trustno1','sunshine','master',
  'welcome','shadow','superman','michael','football','login',
  'admin','princess','passw0rd','starwars','hello','charlie',
  'donald','password2','admin123','changeme','mustang','access',
]);

const SEQUENCES = ['qwerty','asdfgh','zxcvbn','qwertz','azerty','123456','234567','345678','456789'];

function checkPasswordStrength(password) {
  const suggestions = [];
  let score = 0;

  /* ── Length scoring ── */
  if (password.length >= 8)  { score += 1; } else { suggestions.push('Use at least 8 characters'); }
  if (password.length >= 12) { score += 1; } else { suggestions.push('Use 12+ characters for better security'); }
  if (password.length >= 16) { score += 1; }

  /* ── Character diversity ── */
  const hasLower   = /[a-z]/.test(password);
  const hasUpper   = /[A-Z]/.test(password);
  const hasNumber  = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(password);

  if (hasLower)   { score += 1; } else { suggestions.push('Add lowercase letters (a–z)'); }
  if (hasUpper)   { score += 1; } else { suggestions.push('Add uppercase letters (A–Z)'); }
  if (hasNumber)  { score += 1; } else { suggestions.push('Add numbers (0–9)'); }
  if (hasSpecial) { score += 2; } else { suggestions.push('Add special characters (!, @, #, $, ...)'); }

  /* ── Penalties ── */
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    score -= 3;
    suggestions.unshift('This is a commonly used password — choose something more unique');
  }

  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    suggestions.push('Avoid repeating characters (e.g., aaa, 111)');
  }

  for (const seq of SEQUENCES) {
    if (password.toLowerCase().includes(seq)) {
      score -= 1;
      suggestions.push('Avoid keyboard patterns (e.g., qwerty, 123456)');
      break;
    }
  }

  score = Math.max(0, score);

  let strength, label;
  if      (score <= 3) { strength = 'weak';        label = 'Weak';        }
  else if (score <= 5) { strength = 'medium';       label = 'Medium';      }
  else if (score <= 7) { strength = 'strong';       label = 'Strong';      }
  else                 { strength = 'very-strong';  label = 'Very Strong'; }

  return {
    score,
    strength,
    label,
    suggestions: suggestions.slice(0, 3),
    checks: {
      length:      password.length >= 8,
      longLength:  password.length >= 12,
      lowercase:   hasLower,
      uppercase:   hasUpper,
      numbers:     hasNumber,
      special:     hasSpecial,
    },
  };
}

/* ──────────────────────────────────────────────────────────────
   Password reuse check (checks last 5 hashed passwords)
──────────────────────────────────────────────────────────────── */
async function isPasswordInHistory(userId, newPassword, db) {
  const bcrypt  = require('bcryptjs');
  const history = db
    .prepare('SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(userId);

  for (const record of history) {
    if (await bcrypt.compare(newPassword, record.password_hash)) return true;
  }
  return false;
}

module.exports = { checkPasswordStrength, isPasswordInHistory };
