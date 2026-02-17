// ─── CraftOS License Admin Dashboard ─────────────────────────
// Polished admin panel with license management & app update distribution

const API_BASE = window.location.origin;
let token = localStorage.getItem('craftos_admin_token') || null;
let currentPage = 'dashboard';
let licensePage = 1;
let logsPage = 1;
let createdKeys = [];

// ─── API Helper ─────────────────────────────────────────────

async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data;
}

// ─── Toast Notifications ────────────────────────────────────

function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const configs = {
    success: { bg: 'bg-emerald-600/90 border-emerald-500/50', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />' },
    error: { bg: 'bg-red-600/90 border-red-500/50', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />' },
    info: { bg: 'bg-brand-600/90 border-brand-500/50', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />' },
  };
  const cfg = configs[type] || configs.info;
  const el = document.createElement('div');
  el.className = `toast flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-lg text-white text-sm font-medium shadow-2xl ${cfg.bg}`;
  el.innerHTML = `
    <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">${cfg.icon}</svg>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Auth ───────────────────────────────────────────────────

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  try {
    const data = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(r => r.json());

    if (data.token) {
      token = data.token;
      localStorage.setItem('craftos_admin_token', token);
      showApp();
    } else {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.remove('hidden');
    }
  } catch {
    errorEl.textContent = 'Connection failed';
    errorEl.classList.remove('hidden');
  }
});

function logout() {
  token = null;
  localStorage.removeItem('craftos_admin_token');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  navigate('dashboard');
  startClock();
}

// ─── Clock ──────────────────────────────────────────────────

function startClock() {
  const tick = () => {
    const el = document.getElementById('current-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

// ─── Navigation ─────────────────────────────────────────────

const pageMeta = {
  dashboard: { title: 'Dashboard', subtitle: 'License system overview' },
  licenses: { title: 'License Keys', subtitle: 'Manage all license keys' },
  create: { title: 'Create License Keys', subtitle: 'Generate new license keys for customers' },
  activations: { title: 'Activations', subtitle: 'Active hardware bindings' },
  logs: { title: 'Validation Logs', subtitle: 'Every phone-home validation attempt' },
  updates: { title: 'App Updates', subtitle: 'Distribute new versions to desktop clients' },
};

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.remove('hidden');

  // Update header
  const meta = pageMeta[page] || {};
  document.getElementById('page-title').textContent = meta.title || page;
  document.getElementById('page-subtitle').textContent = meta.subtitle || '';

  // Update nav highlighting
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.nav === page) btn.classList.add('active');
  });

  // Load data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'licenses': loadLicenses(); break;
    case 'activations': loadActivations(); break;
    case 'logs': loadLogs(); break;
    case 'updates': loadUpdates(); break;
  }
}

// ─── Dashboard ──────────────────────────────────────────────

async function loadDashboard() {
  try {
    const data = await api('/admin/stats');
    renderStats(data);
    renderValidationBreakdown(data.validations);
    renderRecentActivations(data.recentActivations || []);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStats(data) {
  const cards = [
    { label: 'Total Licenses', value: data.licenses.total, color: 'brand', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />` },
    { label: 'Active Licenses', value: data.licenses.active, color: 'emerald', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />` },
    { label: 'Premium', value: data.licenses.premium, color: 'amber', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />` },
    { label: 'Revoked', value: data.licenses.revoked, color: 'red', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />` },
    { label: 'Active Devices', value: data.activations.active, color: 'cyan', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />` },
    { label: 'Validations Today', value: data.validations.today, color: 'violet', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />` },
    { label: 'Failed Today', value: data.validations.failedToday, color: 'orange', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />` },
    { label: 'Expired', value: data.licenses.expired, color: 'gray', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />` },
  ];

  const colorMap = {
    brand:   { card: 'from-indigo-500/10 to-transparent border-indigo-500/20', text: 'text-indigo-400', icon: 'text-indigo-400/60' },
    emerald: { card: 'from-emerald-500/10 to-transparent border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400/60' },
    amber:   { card: 'from-amber-500/10 to-transparent border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400/60' },
    red:     { card: 'from-red-500/10 to-transparent border-red-500/20', text: 'text-red-400', icon: 'text-red-400/60' },
    cyan:    { card: 'from-cyan-500/10 to-transparent border-cyan-500/20', text: 'text-cyan-400', icon: 'text-cyan-400/60' },
    violet:  { card: 'from-violet-500/10 to-transparent border-violet-500/20', text: 'text-violet-400', icon: 'text-violet-400/60' },
    orange:  { card: 'from-orange-500/10 to-transparent border-orange-500/20', text: 'text-orange-400', icon: 'text-orange-400/60' },
    gray:    { card: 'from-gray-500/10 to-transparent border-gray-500/20', text: 'text-gray-400', icon: 'text-gray-400/60' },
  };

  document.getElementById('stats-cards').innerHTML = cards.map((c, i) => {
    const cm = colorMap[c.color];
    return `
      <div class="stat-card bg-gradient-to-br ${cm.card} border rounded-2xl p-5 fade-in" style="animation-delay: ${i * 0.05}s">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">${c.label}</p>
          <svg class="w-5 h-5 ${cm.icon}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${c.icon}</svg>
        </div>
        <p class="text-3xl font-extrabold ${cm.text} tracking-tight">${c.value.toLocaleString()}</p>
      </div>
    `;
  }).join('');
}

function renderValidationBreakdown(validations) {
  const results = validations.byResult || [];
  if (results.length === 0) {
    document.getElementById('validation-breakdown').innerHTML = '<p class="text-gray-600 text-sm py-8 text-center">No validation data yet</p>';
    return;
  }

  const resultInfo = {
    valid: { color: 'bg-emerald-500', text: 'text-emerald-400' },
    not_found: { color: 'bg-red-500', text: 'text-red-400' },
    revoked: { color: 'bg-orange-500', text: 'text-orange-400' },
    suspended: { color: 'bg-yellow-500', text: 'text-yellow-400' },
    expired: { color: 'bg-gray-500', text: 'text-gray-400' },
    hardware_mismatch: { color: 'bg-purple-500', text: 'text-purple-400' },
    max_activations: { color: 'bg-pink-500', text: 'text-pink-400' },
    invalid: { color: 'bg-red-500', text: 'text-red-400' },
  };

  const total = results.reduce((sum, r) => sum + r.count, 0);

  document.getElementById('validation-breakdown').innerHTML = `
    <div class="flex rounded-full overflow-hidden h-2.5 mb-5 bg-surface-4">
      ${results.map(r => `<div class="${(resultInfo[r.result] || resultInfo.invalid).color}" style="width: ${(r.count/total*100).toFixed(1)}%" title="${r.result}: ${r.count}"></div>`).join('')}
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${results.map(r => {
        const info = resultInfo[r.result] || resultInfo.invalid;
        const pct = ((r.count/total)*100).toFixed(1);
        return `
          <div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-3/50">
            <div class="w-2 h-2 rounded-full ${info.color} shrink-0"></div>
            <span class="text-xs text-gray-400 flex-1">${r.result.replace(/_/g, ' ')}</span>
            <span class="text-xs font-bold ${info.text}">${r.count}</span>
            <span class="text-[10px] text-gray-600">${pct}%</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRecentActivations(activations) {
  if (activations.length === 0) {
    document.getElementById('recent-activations').innerHTML = '<p class="text-gray-600 text-sm py-8 text-center">No activations yet</p>';
    return;
  }

  document.getElementById('recent-activations').innerHTML = activations.map(a => `
    <div class="flex items-center justify-between py-2.5 px-4 rounded-xl bg-surface-3/50 hover:bg-surface-3 transition-colors">
      <div class="min-w-0">
        <p class="text-xs font-mono text-brand-400 truncate">${a.license_key}</p>
        <p class="text-[11px] text-gray-600 mt-0.5">${a.email || 'No email'} &middot; ${a.hostname || 'Unknown'}</p>
      </div>
      <span class="text-[11px] text-gray-600 shrink-0 ml-3">${timeAgo(a.activated_at)}</span>
    </div>
  `).join('');
}

// ─── Licenses ───────────────────────────────────────────────

let loadLicensesTimer;
function debouncedLoadLicenses() {
  clearTimeout(loadLicensesTimer);
  loadLicensesTimer = setTimeout(loadLicenses, 300);
}

async function loadLicenses() {
  try {
    const search = document.getElementById('license-search').value;
    const status = document.getElementById('license-filter-status').value;
    const tier = document.getElementById('license-filter-tier').value;
    const params = new URLSearchParams({ page: licensePage, limit: 25 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);

    const data = await api(`/admin/licenses?${params}`);
    renderLicensesTable(data.licenses, data.pagination);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderLicensesTable(licenses, pagination) {
  const tbody = document.getElementById('licenses-table');

  if (licenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-5 py-12 text-center text-gray-600">No licenses found</td></tr>`;
    document.getElementById('licenses-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = licenses.map(lic => `
    <tr class="table-row cursor-pointer border-b border-white/[0.04]" onclick="openLicenseDetail('${lic.id}')">
      <td class="px-5 py-3.5">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-brand-400">${lic.license_key}</span>
          <button onclick="event.stopPropagation(); copyText('${lic.license_key}')" class="text-gray-600 hover:text-gray-300 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      </td>
      <td class="px-5 py-3.5">${tierBadge(lic.tier)}</td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${lic.plan || '-'}</span></td>
      <td class="px-5 py-3.5">${statusBadge(lic.status)}</td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${lic.email || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-400 font-medium">${lic.activeActivations || 0}<span class="text-gray-600">/${lic.max_activations}</span></span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-600">${lic.expires_at ? formatDate(lic.expires_at) : '<span class="text-emerald-500/60">Never</span>'}</span></td>
      <td class="px-5 py-3.5">
        <div class="flex gap-1" onclick="event.stopPropagation()">
          ${lic.status === 'active' ? `<button onclick="revokeLicense('${lic.id}')" class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Revoke">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          </button>` : ''}
          ${lic.status === 'revoked' ? `<button onclick="reactivateLicense('${lic.id}')" class="p-1.5 rounded-lg text-gray-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Reactivate">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>` : ''}
          <button onclick="deleteLicense('${lic.id}')" class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  const pag = document.getElementById('licenses-pagination');
  pag.innerHTML = `
    <span class="text-xs text-gray-600">${pagination.total} total &middot; Page ${pagination.page} of ${pagination.pages}</span>
    <div class="flex gap-2">
      <button onclick="licensePage = ${pagination.page - 1}; loadLicenses()" ${pagination.page <= 1 ? 'disabled' : ''} class="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
      <button onclick="licensePage = ${pagination.page + 1}; loadLicenses()" ${pagination.page >= pagination.pages ? 'disabled' : ''} class="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
    </div>
  `;
}

// ─── License Detail Modal ───────────────────────────────────

async function openLicenseDetail(id) {
  try {
    const data = await api(`/admin/licenses/${id}`);
    const lic = data.license;

    document.getElementById('license-modal-content').innerHTML = `
      <div class="space-y-7">
        <!-- Key & Status -->
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-3">
            <span class="font-mono text-lg text-brand-400 font-bold">${lic.license_key}</span>
            <button onclick="copyText('${lic.license_key}')" class="text-gray-600 hover:text-gray-300 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
          </div>
          <div class="flex gap-2">${tierBadge(lic.tier)} ${statusBadge(lic.status)}</div>
        </div>

        <!-- Info Grid -->
        <div class="grid grid-cols-2 gap-4 text-sm">
          ${[
            ['Plan', lic.plan || 'N/A'],
            ['Email', lic.email || 'None'],
            ['Max Activations', lic.max_activations],
            ['Expires', lic.expires_at ? formatDate(lic.expires_at) : 'Never'],
            ['Created', formatDate(lic.created_at)],
            ['Updated', formatDate(lic.updated_at)],
          ].map(([label, value]) => `
            <div class="bg-surface-3/50 rounded-xl px-4 py-3">
              <span class="text-[11px] text-gray-600 uppercase tracking-wider font-semibold">${label}</span>
              <p class="text-gray-200 text-sm mt-0.5">${value}</p>
            </div>
          `).join('')}
          ${lic.notes ? `<div class="col-span-2 bg-surface-3/50 rounded-xl px-4 py-3">
            <span class="text-[11px] text-gray-600 uppercase tracking-wider font-semibold">Notes</span>
            <p class="text-gray-200 text-sm mt-0.5">${escapeHtml(lic.notes)}</p>
          </div>` : ''}
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-2">
          ${lic.status === 'active' ? `<button onclick="revokeLicense('${lic.id}'); closeLicenseModal()" class="btn btn-danger text-xs py-2">Revoke</button>` : ''}
          ${lic.status === 'revoked' ? `<button onclick="reactivateLicense('${lic.id}'); closeLicenseModal()" class="btn btn-success text-xs py-2">Reactivate</button>` : ''}
          <button onclick="deleteLicense('${lic.id}'); closeLicenseModal()" class="btn btn-danger text-xs py-2">Delete</button>
        </div>

        <!-- Activations -->
        <div>
          <h4 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
            Activations
            <span class="text-[11px] font-semibold text-gray-500 bg-surface-3 px-2 py-0.5 rounded-lg">${data.activations.length}</span>
          </h4>
          ${data.activations.length === 0 ? '<p class="text-gray-600 text-xs py-3">No activations</p>' : `
          <div class="space-y-2">
            ${data.activations.map(a => `
              <div class="px-4 py-3 rounded-xl bg-surface-3/50 text-xs space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="text-gray-200 font-semibold">${a.hostname || 'Unknown'}</span>
                    <span class="text-gray-600">${a.platform || ''} &middot; ${a.app_version || ''}</span>
                    <span class="text-gray-700 font-mono">${a.ip_address || ''}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-gray-600">${timeAgo(a.last_seen_at)}</span>
                    ${a.is_active ? `<span class="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Active</span>` : `<span class="badge bg-gray-500/15 text-gray-500 border border-gray-500/20">Inactive</span>`}
                    ${a.is_active ? `<button onclick="deactivateActivation('${a.id}')" class="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Deactivate">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>` : ''}
                  </div>
                </div>
                ${(a.username || a.os_version || a.cpu_model || a.mac_addresses) ? `
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 border-t border-white/[0.04] pt-2">
                  ${a.username ? `<div><span class="text-gray-700">User:</span> ${a.username}</div>` : ''}
                  ${a.os_version ? `<div><span class="text-gray-700">OS:</span> ${a.os_version}</div>` : ''}
                  ${a.os_release ? `<div><span class="text-gray-700">Release:</span> ${a.os_release}</div>` : ''}
                  ${a.arch ? `<div><span class="text-gray-700">Arch:</span> ${a.arch}</div>` : ''}
                  ${a.cpu_model ? `<div><span class="text-gray-700">CPU:</span> ${a.cpu_model}</div>` : ''}
                  ${a.cpu_cores ? `<div><span class="text-gray-700">Cores:</span> ${a.cpu_cores}</div>` : ''}
                  ${a.total_memory_gb ? `<div><span class="text-gray-700">RAM:</span> ${a.total_memory_gb} GB</div>` : ''}
                  ${a.mac_addresses ? `<div class="col-span-2"><span class="text-gray-700">MAC:</span> <span class="font-mono">${a.mac_addresses}</span></div>` : ''}
                </div>` : ''}
              </div>
            `).join('')}
          </div>`}
        </div>

        <!-- Recent Validation Logs -->
        <div>
          <h4 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
            Recent Validations
            <span class="text-[11px] font-semibold text-gray-500 bg-surface-3 px-2 py-0.5 rounded-lg">${data.recentLogs.length}</span>
          </h4>
          ${data.recentLogs.length === 0 ? '<p class="text-gray-600 text-xs py-3">No validation logs</p>' : `
          <div class="max-h-52 overflow-y-auto space-y-1 rounded-xl">
            ${data.recentLogs.map(log => `
              <div class="flex items-center justify-between px-4 py-2 rounded-lg text-xs ${log.result === 'valid' ? 'text-gray-500' : 'text-red-400 bg-red-500/5'}">
                <span>${formatDate(log.validated_at)}</span>
                <span class="font-mono">${log.hardware_id?.substring(0, 12) || ''}...</span>
                <span class="font-mono">${log.ip_address || ''}</span>
                ${resultBadge(log.result)}
              </div>
            `).join('')}
          </div>`}
        </div>
      </div>
    `;

    document.getElementById('license-modal').classList.remove('hidden');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeLicenseModal() {
  document.getElementById('license-modal').classList.add('hidden');
}

// ─── License Actions ────────────────────────────────────────

async function revokeLicense(id) {
  if (!confirm('Revoke this license? All activations will be deactivated.')) return;
  try {
    await api(`/admin/licenses/${id}/revoke`, { method: 'POST' });
    toast('License revoked');
    loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
}

async function reactivateLicense(id) {
  try {
    await api(`/admin/licenses/${id}/reactivate`, { method: 'POST' });
    toast('License reactivated');
    loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteLicense(id) {
  if (!confirm('Permanently delete this license? This cannot be undone.')) return;
  try {
    await api(`/admin/licenses/${id}`, { method: 'DELETE' });
    toast('License deleted');
    loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
}

async function deactivateActivation(id) {
  try {
    await api(`/admin/activations/${id}`, { method: 'DELETE' });
    toast('Activation deactivated');
    closeLicenseModal();
    loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── Create Keys ────────────────────────────────────────────

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    tier: document.getElementById('create-tier').value,
    plan: document.getElementById('create-plan').value,
    email: document.getElementById('create-email').value || undefined,
    maxActivations: parseInt(document.getElementById('create-max-activations').value) || 3,
    count: parseInt(document.getElementById('create-count').value) || 1,
    notes: document.getElementById('create-notes').value || undefined,
  };

  const expDays = document.getElementById('create-expires-days').value;
  const expMins = document.getElementById('create-expires-minutes').value;
  if (expDays) body.expiresInDays = parseInt(expDays);
  if (expMins) body.expiresInMinutes = parseInt(expMins);

  try {
    const data = await api('/admin/licenses', { method: 'POST', body: JSON.stringify(body) });
    createdKeys = data.licenses;
    toast(`Created ${data.licenses.length} key(s)!`);
    renderCreatedKeys(data.licenses);
  } catch (err) {
    toast(err.message, 'error');
  }
});

function renderCreatedKeys(keys) {
  const output = document.getElementById('created-keys-output');
  const list = document.getElementById('created-keys-list');
  output.classList.remove('hidden');

  list.innerHTML = keys.map(k => `
    <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-3/50 hover:bg-surface-3 transition-colors">
      <span class="font-mono text-sm text-brand-400 font-medium">${k.licenseKey}</span>
      <div class="flex items-center gap-3">
        ${k.expiresAt ? `<span class="text-[11px] text-gray-600">Exp: ${formatDate(k.expiresAt)}</span>` : ''}
        <button onclick="copyText('${k.licenseKey}')" class="text-gray-600 hover:text-white transition-colors p-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function copyAllKeys() {
  const text = createdKeys.map(k => k.licenseKey).join('\n');
  copyText(text, 'All keys copied!');
}

// ─── Activations ────────────────────────────────────────────

async function loadActivations() {
  try {
    const active = document.getElementById('activations-filter').value;
    const params = active ? `?active=${active}` : '';
    const data = await api(`/admin/activations${params}`);
    renderActivationsTable(data.activations);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderActivationsTable(activations) {
  const tbody = document.getElementById('activations-table');

  if (activations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="px-5 py-12 text-center text-gray-600">No activations found</td></tr>`;
    return;
  }

  tbody.innerHTML = activations.map(a => `
    <tr class="table-row border-b border-white/[0.04]">
      <td class="px-5 py-3.5"><span class="font-mono text-xs text-brand-400">${a.license_key}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${a.email || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-300">${a.hostname || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${a.username || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${a.platform || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-500">${a.app_version || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-600 font-mono">${a.ip_address || '-'}</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-600 font-mono" title="${a.hardware_id || ''}">${(a.hardware_id || '-').substring(0, 12)}...</span></td>
      <td class="px-5 py-3.5"><span class="text-xs text-gray-600">${timeAgo(a.last_seen_at)}</span></td>
      <td class="px-5 py-3.5">${a.is_active ? '<span class="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Active</span>' : '<span class="badge bg-gray-500/15 text-gray-500 border border-gray-500/20">Inactive</span>'}</td>
      <td class="px-5 py-3.5">
        ${a.is_active ? `<button onclick="deactivateActivation('${a.id}'); setTimeout(loadActivations, 500)" class="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Deactivate">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>` : ''}
      </td>
    </tr>
  `).join('');
}

// ─── Validation Logs ────────────────────────────────────────

let loadLogsTimer;
function debouncedLoadLogs() {
  clearTimeout(loadLogsTimer);
  loadLogsTimer = setTimeout(loadLogs, 300);
}

async function loadLogs() {
  try {
    const result = document.getElementById('logs-filter-result').value;
    const licenseKey = document.getElementById('logs-filter-key').value;
    const params = new URLSearchParams({ page: logsPage, limit: 50 });
    if (result) params.set('result', result);
    if (licenseKey) params.set('licenseKey', licenseKey);

    const data = await api(`/admin/logs?${params}`);
    renderLogsTable(data.logs);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-table');

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-12 text-center text-gray-600">No logs found</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr class="table-row border-b border-white/[0.04] ${log.result !== 'valid' ? 'bg-red-500/[0.03]' : ''}">
      <td class="px-5 py-3"><span class="text-xs text-gray-500">${formatDate(log.validated_at)}</span></td>
      <td class="px-5 py-3"><span class="font-mono text-xs text-brand-400">${log.license_key}</span></td>
      <td class="px-5 py-3"><span class="text-xs text-gray-600 font-mono">${(log.hardware_id || '').substring(0, 16)}${(log.hardware_id || '').length > 16 ? '...' : ''}</span></td>
      <td class="px-5 py-3"><span class="text-xs text-gray-600 font-mono">${log.ip_address || '-'}</span></td>
      <td class="px-5 py-3">${resultBadge(log.result)}</td>
      <td class="px-5 py-3"><span class="text-xs text-gray-600">${log.message || '-'}</span></td>
    </tr>
  `).join('');

  const pag = document.getElementById('logs-pagination');
  pag.innerHTML = `
    <span class="text-xs text-gray-600">${logs.length} entries shown</span>
    <div class="flex gap-2">
      <button onclick="logsPage = ${logsPage - 1}; loadLogs()" ${logsPage <= 1 ? 'disabled' : ''} class="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
      <button onclick="logsPage = ${logsPage + 1}; loadLogs()" ${logs.length < 50 ? 'disabled' : ''} class="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
    </div>
  `;
}

// ─── App Updates ────────────────────────────────────────────

async function loadUpdates() {
  // Set the auto-update URL display
  const urlDisplay = document.getElementById('update-url-display');
  if (urlDisplay) {
    urlDisplay.textContent = `${API_BASE}/updates/latest.yml`;
  }

  try {
    const data = await api('/admin/updates');
    renderUpdateFiles(data.files || []);
  } catch (err) {
    toast(err.message, 'error');
    renderUpdateFiles([]);
  }
}

function renderUpdateFiles(files) {
  const container = document.getElementById('updates-file-list');

  if (files.length === 0) {
    container.innerHTML = `
      <div class="px-6 py-12 text-center">
        <svg class="w-10 h-10 mx-auto text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
        <p class="text-gray-600 text-sm">No update files uploaded yet</p>
        <p class="text-gray-700 text-xs mt-1">Upload latest.yml and the installer above</p>
      </div>
    `;
    return;
  }

  container.innerHTML = files.map(f => {
    const isYml = f.filename.endsWith('.yml') || f.filename.endsWith('.yaml');
    const isExe = f.filename.endsWith('.exe') || f.filename.endsWith('.dmg') || f.filename.endsWith('.AppImage');
    const iconColor = isYml ? 'text-amber-400' : isExe ? 'text-brand-400' : 'text-gray-500';
    const icon = isYml
      ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />`
      : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />`;

    return `
      <div class="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
        <div class="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5 ${iconColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${icon}</svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-200 truncate">${escapeHtml(f.filename)}</p>
          <p class="text-[11px] text-gray-600 mt-0.5">${formatFileSize(f.size)} &middot; Modified ${formatDate(f.modified)}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="${API_BASE}${f.url}" target="_blank" class="p-2 rounded-lg text-gray-600 hover:text-brand-400 hover:bg-brand-500/10 transition-all" title="Download">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          </a>
          <button onclick="copyText('${API_BASE}${f.url}')" class="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all" title="Copy URL">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          </button>
          <button onclick="deleteUpdateFile('${escapeHtml(f.filename)}')" class="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function deleteUpdateFile(filename) {
  if (!confirm(`Delete ${filename}? Desktop clients won't be able to download this file anymore.`)) return;
  try {
    await api(`/admin/updates/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    toast(`Deleted ${filename}`);
    loadUpdates();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── File Upload (Drag & Drop + Click) ─────────────────────

function handleFileSelect(event) {
  const files = event.target.files;
  if (files.length > 0) uploadFiles(files);
}

// Drag & drop setup
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFiles(files);
  });
});

async function uploadFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const progressEl = document.getElementById('upload-progress');
  const barEl = document.getElementById('upload-bar');
  const pctEl = document.getElementById('upload-percent');
  progressEl.classList.remove('hidden');

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/admin/updates/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        barEl.style.width = `${pct}%`;
        pctEl.textContent = `${pct}%`;
      }
    });

    xhr.onload = () => {
      progressEl.classList.add('hidden');
      barEl.style.width = '0%';
      pctEl.textContent = '0%';

      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        toast(`Uploaded ${data.files?.length || 0} file(s)!`);
        loadUpdates();
      } else {
        const data = JSON.parse(xhr.responseText || '{}');
        toast(data.error || 'Upload failed', 'error');
      }
    };

    xhr.onerror = () => {
      progressEl.classList.add('hidden');
      toast('Upload failed — network error', 'error');
    };

    xhr.send(formData);
  } catch (err) {
    progressEl.classList.add('hidden');
    toast(err.message, 'error');
  }

  // Reset file input
  document.getElementById('file-input').value = '';
}

// ─── Helpers ────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    active: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    revoked: 'bg-red-500/15 text-red-400 border border-red-500/20',
    expired: 'bg-gray-500/15 text-gray-500 border border-gray-500/20',
    suspended: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  };
  return `<span class="badge ${map[status] || 'bg-gray-500/15 text-gray-500 border border-gray-500/20'}">${status}</span>`;
}

function tierBadge(tier) {
  const map = {
    premium: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    free: 'bg-gray-500/15 text-gray-500 border border-gray-500/20',
  };
  return `<span class="badge ${map[tier] || 'bg-gray-500/15 text-gray-500 border border-gray-500/20'}">${tier}</span>`;
}

function resultBadge(result) {
  const map = {
    valid: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    not_found: 'bg-red-500/15 text-red-400 border border-red-500/20',
    revoked: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
    suspended: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
    expired: 'bg-gray-500/15 text-gray-500 border border-gray-500/20',
    hardware_mismatch: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
    max_activations: 'bg-pink-500/15 text-pink-400 border border-pink-500/20',
    invalid: 'bg-red-500/15 text-red-400 border border-red-500/20',
  };
  return `<span class="badge ${map[result] || 'bg-gray-500/15 text-gray-500 border border-gray-500/20'}">${(result || '').replace(/_/g, ' ')}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return formatDate(dateStr);
  } catch { return dateStr; }
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function copyText(text, msg = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => toast(msg, 'info')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast(msg, 'info');
  });
}

// ─── Keyboard Shortcuts ─────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLicenseModal();
});

// ─── Init ───────────────────────────────────────────────────

if (token) {
  api('/admin/stats').then(() => showApp()).catch(() => {
    token = null;
    localStorage.removeItem('craftos_admin_token');
  });
}
