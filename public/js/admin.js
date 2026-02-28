/* ════════════════════════════════════════════════════════════
   admin.js  –  Admin panel JavaScript
   Features: JWT login, stats dashboard, user management,
             login attempts log, suspicious activities monitor.
════════════════════════════════════════════════════════════ */

let adminToken    = localStorage.getItem('adminToken')    || '';
let adminUsername = localStorage.getItem('adminUsername') || '';

/* ────────────────────────────────────────────────────────
   Bootstrap
──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (adminToken) { showDashboard(); }
  else            { showLoginForm(); }

  // Header buttons
  document.getElementById('btnLogout') .addEventListener('click', logout);
  document.getElementById('btnRefresh').addEventListener('click', refreshAll);

  // Tab buttons
  document.getElementById('tab-users')     .addEventListener('click', () => switchTab('users'));
  document.getElementById('tab-attempts')  .addEventListener('click', () => switchTab('attempts'));
  document.getElementById('tab-suspicious').addEventListener('click', () => switchTab('suspicious'));
});

/* ────────────────────────────────────────────────────────
   Show / hide panels
──────────────────────────────────────────────────────── */
function showLoginForm() {
  document.getElementById('loginPanel').classList.remove('hidden');
  document.getElementById('dashboardPanel').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginPanel').classList.add('hidden');
  document.getElementById('dashboardPanel').classList.remove('hidden');
  document.getElementById('adminUserBadge').textContent = '👤 ' + adminUsername;
  loadStats();
  loadUsers();
  loadLoginAttempts();
  loadSuspicious();
}

/* ────────────────────────────────────────────────────────
   Admin login
──────────────────────────────────────────────────────── */
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errEl    = document.getElementById('adminLoginError');
  const btn      = document.getElementById('adminLoginBtn');

  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    const resp = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();
    if (data.success) {
      adminToken    = data.token;
      adminUsername = data.username;
      localStorage.setItem('adminToken',    adminToken);
      localStorage.setItem('adminUsername', adminUsername);
      showDashboard();
    } else {
      errEl.textContent = data.message || 'Invalid credentials.';
    }
  } catch {
    errEl.textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});

/* ────────────────────────────────────────────────────────
   Logout
──────────────────────────────────────────────────────── */
function logout() {
  adminToken = ''; adminUsername = '';
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUsername');
  showLoginForm();
}

/* ────────────────────────────────────────────────────────
   Auth helper  (with full error handling)
──────────────────────────────────────────────────────── */
async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Authorization': 'Bearer ' + adminToken,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) { logout(); return null; }
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { success: false, message: `Server error (${res.status})` }; }
  } catch (netErr) {
    console.error('Network error:', netErr);
    return { success: false, message: 'Network error. Is the server running?' };
  }
}

/* ────────────────────────────────────────────────────────
   Custom confirm dialog (replaces browser confirm())
──────────────────────────────────────────────────────── */
function adminConfirm(message) {
  return new Promise(resolve => {
    // Remove any existing dialog
    document.getElementById('adminConfirmModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'adminConfirmModal';
    modal.style.cssText = [
      'position:fixed','inset:0','background:rgba(0,0,0,.45)',
      'display:flex','align-items:center','justify-content:center','z-index:9999',
    ].join(';');
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:28px 32px;max-width:380px;
                  width:90%;box-shadow:0 8px 40px rgba(0,0,0,.22);text-align:center">
        <div style="font-size:2.2rem;margin-bottom:12px">⚠️</div>
        <p style="font-size:.97rem;color:#1a1a2e;margin-bottom:22px;line-height:1.5">${message}</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="confirmYes"
            style="padding:9px 24px;background:#e74c3c;color:#fff;border:none;
                   border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600">
            Delete
          </button>
          <button id="confirmNo"
            style="padding:9px 24px;background:#f0f2f5;color:#333;border:none;
                   border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600">
            Cancel
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const cleanup = (val) => { modal.remove(); resolve(val); };
    modal.querySelector('#confirmYes').addEventListener('click', () => cleanup(true));
    modal.querySelector('#confirmNo').addEventListener('click',  () => cleanup(false));
    modal.addEventListener('click', e => { if (e.target === modal) cleanup(false); });
  });
}

/* ────────────────────────────────────────────────────────
   Tabs
──────────────────────────────────────────────────────── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
  document.getElementById('panel-' + tabId).classList.add('active');
}

/* ────────────────────────────────────────────────────────
   Stats
──────────────────────────────────────────────────────── */
async function loadStats() {
  const data = await apiFetch('/api/admin/stats');
  if (!data || !data.success) return;
  const s = data.stats;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statTotal',       s.totalUsers);
  set('statVerified',    s.verifiedUsers);
  set('statUnverified',  s.unverifiedUsers);
  set('statLocked',      s.lockedUsers);
  set('statToday',       s.todayRegistrations);
  set('statAttempts',    s.totalLoginAttempts);
  set('statFailed',      s.failedLogins);
  set('statSuspicious',  s.suspiciousActivities);
}

/* ────────────────────────────────────────────────────────
   Users table
──────────────────────────────────────────────────────── */
let allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="10"><div class="loading-spinner"></div></td></tr>';

  const data = await apiFetch('/api/admin/users');
  if (!data || !data.success) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Failed to load users.</td></tr>'; return; }

  allUsers = data.users;
  renderUsersTable(allUsers);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">👤</div><p>No users found</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr id="user-row-${u.id}">
      <td><strong>#${u.id}</strong></td>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${u.is_verified ? '<span class="badge badge-success">✓ Verified</span>' : '<span class="badge badge-warning">⏳ Pending</span>'}</td>
      <td>${u.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
      <td class="text-muted">${fmtDate(u.created_at)}</td>
      <td class="text-muted">${u.last_login ? fmtDate(u.last_login) : '—'}</td>
      <td class="text-muted">${u.ip_address || '—'}</td>
      <td class="hash-cell">
        ${u.password_hash
          ? `<span class="hash-preview" title="${esc(u.password_hash)}">${esc(u.password_hash.substring(0, 20))}&#8230;</span>
             <button class="btn btn-sm btn-secondary hash-view-btn" data-action="viewhash" data-id="${u.id}" title="View full hash">&#128065;</button>`
          : '—'}
      </td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm ${u.is_active ? 'btn-warning' : 'btn-success'}"
                  data-action="toggle" data-id="${u.id}"
                  title="${u.is_active ? 'Deactivate' : 'Activate'}">
            ${u.is_active ? '&#128274;' : '&#128275;'}
          </button>
          <button class="btn btn-sm btn-danger"
                  data-action="delete" data-id="${u.id}"
                  title="Delete">&#128465;</button>
        </div>
      </td>
    </tr>`).join('');
}

/* Search */
document.getElementById('userSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderUsersTable(q ? allUsers.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : allUsers);
});

/* Event delegation – handles toggle + delete for all rows (CSP-safe, works on dynamic rows) */
document.getElementById('usersTableBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id     = parseInt(btn.getAttribute('data-id'), 10);
  if (action === 'toggle')   toggleUser(id);
  if (action === 'delete')   deleteUser(id);
  if (action === 'viewhash') {
    const user = allUsers.find(u => u.id === id);
    if (user && user.password_hash) showHashModal(user.username, user.password_hash);
  }
});

/* Toggle active */
async function toggleUser(id) {
  const data = await apiFetch(`/api/admin/users/${id}/toggle`, { method: 'PATCH' });
  if (data && data.success) {
    await loadUsers();
    await loadStats();
  } else {
    showAdminToast(data ? data.message : 'Request failed.', 'error');
  }
}

/* Delete */
async function deleteUser(id) {
  const confirmed = await adminConfirm('Permanently delete this user?\nThis action cannot be undone.');
  if (!confirmed) return;

  const row = document.getElementById(`user-row-${id}`);
  if (row) row.style.opacity = '0.4';

  const data = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if (data && data.success) {
    await loadUsers();
    await loadStats();
    showAdminToast('User deleted successfully.', 'success');
  } else {
    if (row) row.style.opacity = '';
    showAdminToast(data ? data.message : 'Delete failed. Please try again.', 'error');
  }
}

/* Toast notification for admin actions */
function showAdminToast(msg, type = 'info') {
  document.getElementById('adminToast')?.remove();
  const colors = { success: '#27ae60', error: '#e74c3c', info: '#3498db', warning: '#f39c12' };
  const icons  = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast  = document.createElement('div');
  toast.id = 'adminToast';
  toast.style.cssText = [
    'position:fixed','bottom:24px','right:24px','z-index:9998',
    `background:${colors[type] || colors.info}`,
    'color:#fff','padding:12px 20px','border-radius:8px',
    'font-size:.9rem','font-weight:600','box-shadow:0 4px 16px rgba(0,0,0,.25)',
    'display:flex','align-items:center','gap:8px',
    'animation:fadeInUp .25s ease',
  ].join(';');
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast?.remove(), 3500);
}

/* ────────────────────────────────────────────────────────
   Hash viewer modal
──────────────────────────────────────────────────────── */
function showHashModal(username, hash) {
  document.getElementById('adminHashModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'adminHashModal';
  modal.style.cssText = [
    'position:fixed','inset:0','background:rgba(0,0,0,.5)',
    'display:flex','align-items:center','justify-content:center','z-index:9999',
  ].join(';');
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:540px;
                width:93%;box-shadow:0 8px 40px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:1rem;color:#1a1a2e">&#128273; Password Hash — ${esc(username)}</h3>
        <button id="hashModalClose"
          style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#999;line-height:1">&#215;</button>
      </div>
      <div style="background:#f4f3ff;border:1px solid #ddd9ff;border-radius:8px;
                  padding:14px 16px;font-family:'Courier New',monospace;font-size:.78rem;
                  color:#3a3080;word-break:break-all;line-height:1.65">
        ${esc(hash)}
      </div>
      <div style="margin-top:12px;font-size:.8rem;color:#777;line-height:1.6">
        <strong>Algorithm:</strong> bcrypt &nbsp;&middot;&nbsp;
        <strong>Cost factor:</strong> ${hash.split('$')[2] || '?'} &nbsp;&middot;&nbsp;
        <strong>Length:</strong> ${hash.length} chars
      </div>
      <button id="hashModalCopy"
        style="margin-top:16px;width:100%;padding:10px;
               background:linear-gradient(135deg,#6c63ff,#764ba2);
               color:#fff;border:none;border-radius:8px;cursor:pointer;
               font-size:.9rem;font-weight:700">
        &#128203; Copy Full Hash
      </button>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#hashModalClose').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#hashModalCopy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(hash);
    showAdminToast('Hash copied to clipboard!', 'success');
    modal.remove();
  });
}

/* ────────────────────────────────────────────────────────
   Login attempts table
──────────────────────────────────────────────────────── */
async function loadLoginAttempts() {
  const tbody = document.getElementById('attemptsTableBody');
  tbody.innerHTML = '<tr><td colspan="4"><div class="loading-spinner"></div></td></tr>';

  const data = await apiFetch('/api/admin/login-attempts');
  if (!data || !data.success) { tbody.innerHTML = '<tr><td colspan="4">Failed to load.</td></tr>'; return; }

  if (!data.attempts.length) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📋</div><p>No login attempts yet</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = data.attempts.map(a => `
    <tr>
      <td>${esc(a.email || '—')}</td>
      <td class="text-muted">${esc(a.ip_address || '—')}</td>
      <td>${a.success ? '<span class="badge badge-success">✓ Success</span>' : '<span class="badge badge-danger">✗ Failed</span>'}</td>
      <td class="text-muted">${fmtDate(a.attempted_at)}</td>
    </tr>`).join('');
}

/* ────────────────────────────────────────────────────────
   Suspicious activities table
──────────────────────────────────────────────────────── */
async function loadSuspicious() {
  const tbody = document.getElementById('suspiciousTableBody');
  tbody.innerHTML = '<tr><td colspan="5"><div class="loading-spinner"></div></td></tr>';

  const data = await apiFetch('/api/admin/suspicious');
  if (!data || !data.success) { tbody.innerHTML = '<tr><td colspan="5">Failed to load.</td></tr>'; return; }

  if (!data.activities.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🛡️</div><p>No suspicious activities detected</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = data.activities.map(a => `
    <tr>
      <td><span class="badge badge-danger">${esc(a.type)}</span></td>
      <td>${esc(a.description || '—')}</td>
      <td class="text-muted">${esc(a.ip_address || '—')}</td>
      <td class="text-muted">${a.user_id || '—'}</td>
      <td class="text-muted">${fmtDate(a.detected_at)}</td>
    </tr>`).join('');
}

/* ────────────────────────────────────────────────────────
   Refresh all
──────────────────────────────────────────────────────── */
function refreshAll() {
  loadStats(); loadUsers(); loadLoginAttempts(); loadSuspicious();
}

/* ────────────────────────────────────────────────────────
   Utilities
──────────────────────────────────────────────────────── */
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString();
  } catch { return iso; }
}
