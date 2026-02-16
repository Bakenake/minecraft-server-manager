// ─── CraftOS License Admin Dashboard ─────────────────────────
// Single-page admin panel for managing license keys

const API_BASE = window.location.origin;
let token = localStorage.getItem('craftos_admin_token') || null;
let currentPage = 'dashboard';
let licensePage = 1;
let logsPage = 1;
let createdKeys = [];

// ─── API Helper ─────────────────────────────────────────────

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
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
  const colors = {
    success: 'bg-emerald-600 border-emerald-500',
    error: 'bg-red-600 border-red-500',
    info: 'bg-brand-600 border-brand-500',
  };
  const el = document.createElement('div');
  el.className = `toast px-4 py-3 rounded-lg border text-white text-sm font-medium shadow-lg ${colors[type] || colors.info}`;
  el.textContent = message;
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
}

// ─── Navigation ─────────────────────────────────────────────

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${page}`)?.classList.remove('hidden');

  // Update nav highlighting
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-gray-800', 'text-white');
    if (btn.dataset.nav === page) {
      btn.classList.add('bg-gray-800', 'text-white');
    }
  });

  // Load data for the page
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'licenses': loadLicenses(); break;
    case 'activations': loadActivations(); break;
    case 'logs': loadLogs(); break;
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
    { label: 'Total Licenses', value: data.licenses.total, icon: 'key', color: 'brand' },
    { label: 'Active Licenses', value: data.licenses.active, icon: 'check-circle', color: 'emerald' },
    { label: 'Premium', value: data.licenses.premium, icon: 'star', color: 'amber' },
    { label: 'Revoked', value: data.licenses.revoked, icon: 'x-circle', color: 'red' },
    { label: 'Active Devices', value: data.activations.active, icon: 'device-mobile', color: 'cyan' },
    { label: 'Validations Today', value: data.validations.today, icon: 'refresh', color: 'violet' },
    { label: 'Failed Today', value: data.validations.failedToday, icon: 'exclamation', color: 'orange' },
    { label: 'Expired', value: data.licenses.expired, icon: 'clock', color: 'gray' },
  ];

  const colorMap = {
    brand: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/30 text-indigo-400',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30 text-amber-400',
    red: 'from-red-500/20 to-red-600/5 border-red-500/30 text-red-400',
    cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30 text-cyan-400',
    violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30 text-violet-400',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30 text-orange-400',
    gray: 'from-gray-500/20 to-gray-600/5 border-gray-500/30 text-gray-400',
  };

  document.getElementById('stats-cards').innerHTML = cards.map(c => `
    <div class="stat-card bg-gradient-to-br ${colorMap[c.color]} border rounded-xl p-4">
      <p class="text-xs font-medium text-gray-400 mb-1">${c.label}</p>
      <p class="text-2xl font-bold ${colorMap[c.color].split(' ').pop()}">${c.value.toLocaleString()}</p>
    </div>
  `).join('');
}

function renderValidationBreakdown(validations) {
  const results = validations.byResult || [];
  if (results.length === 0) {
    document.getElementById('validation-breakdown').innerHTML = '<p class="text-gray-500 text-sm">No validation data yet</p>';
    return;
  }

  const resultColors = {
    valid: 'bg-emerald-500',
    not_found: 'bg-red-500',
    revoked: 'bg-orange-500',
    suspended: 'bg-yellow-500',
    expired: 'bg-gray-500',
    hardware_mismatch: 'bg-purple-500',
    max_activations: 'bg-pink-500',
  };

  const total = results.reduce((sum, r) => sum + r.count, 0);

  document.getElementById('validation-breakdown').innerHTML = `
    <div class="flex rounded-full overflow-hidden h-3 mb-4 bg-gray-800">
      ${results.map(r => `<div class="${resultColors[r.result] || 'bg-gray-600'}" style="width: ${(r.count/total*100).toFixed(1)}%" title="${r.result}: ${r.count}"></div>`).join('')}
    </div>
    <div class="grid grid-cols-2 gap-2">
      ${results.map(r => `
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full ${resultColors[r.result] || 'bg-gray-600'}"></div>
          <span class="text-xs text-gray-400">${r.result.replace(/_/g, ' ')}</span>
          <span class="text-xs font-mono text-gray-300 ml-auto">${r.count}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecentActivations(activations) {
  if (activations.length === 0) {
    document.getElementById('recent-activations').innerHTML = '<p class="text-gray-500 text-sm">No activations yet</p>';
    return;
  }

  document.getElementById('recent-activations').innerHTML = activations.map(a => `
    <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50">
      <div>
        <p class="text-xs font-mono text-brand-400">${a.license_key}</p>
        <p class="text-xs text-gray-500">${a.email || 'No email'} · ${a.hostname || 'Unknown'}</p>
      </div>
      <span class="text-xs text-gray-500">${timeAgo(a.activated_at)}</span>
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
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">No licenses found</td></tr>`;
    document.getElementById('licenses-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = licenses.map(lic => `
    <tr class="table-row cursor-pointer" onclick="openLicenseDetail('${lic.id}')">
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-brand-400">${lic.license_key}</span>
          <button onclick="event.stopPropagation(); copyText('${lic.license_key}')" class="text-gray-500 hover:text-gray-300">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
          </button>
        </div>
      </td>
      <td class="px-4 py-3">${tierBadge(lic.tier)}</td>
      <td class="px-4 py-3"><span class="text-xs text-gray-400">${lic.plan || '-'}</span></td>
      <td class="px-4 py-3">${statusBadge(lic.status)}</td>
      <td class="px-4 py-3"><span class="text-xs text-gray-400">${lic.email || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-300">${lic.activeActivations || 0}/${lic.max_activations}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500">${lic.expires_at ? formatDate(lic.expires_at) : 'Never'}</span></td>
      <td class="px-4 py-3">
        <div class="flex gap-1" onclick="event.stopPropagation()">
          ${lic.status === 'active' ? `<button onclick="revokeLicense('${lic.id}')" class="text-xs text-red-400 hover:text-red-300 p-1" title="Revoke">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          </button>` : ''}
          ${lic.status === 'revoked' ? `<button onclick="reactivateLicense('${lic.id}')" class="text-xs text-emerald-400 hover:text-emerald-300 p-1" title="Reactivate">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>` : ''}
          <button onclick="deleteLicense('${lic.id}')" class="text-xs text-gray-500 hover:text-red-400 p-1" title="Delete">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Pagination
  const pag = document.getElementById('licenses-pagination');
  pag.innerHTML = `
    <span class="text-xs text-gray-500">${pagination.total} total · Page ${pagination.page} of ${pagination.pages}</span>
    <div class="flex gap-2">
      <button onclick="licensePage = ${pagination.page - 1}; loadLicenses()" ${pagination.page <= 1 ? 'disabled' : ''} class="btn btn-secondary text-xs disabled:opacity-30">Previous</button>
      <button onclick="licensePage = ${pagination.page + 1}; loadLicenses()" ${pagination.page >= pagination.pages ? 'disabled' : ''} class="btn btn-secondary text-xs disabled:opacity-30">Next</button>
    </div>
  `;
}

// ─── License Detail Modal ───────────────────────────────────

async function openLicenseDetail(id) {
  try {
    const data = await api(`/admin/licenses/${id}`);
    const lic = data.license;

    document.getElementById('license-modal-content').innerHTML = `
      <div class="space-y-6">
        <!-- Key & Status -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="font-mono text-lg text-brand-400">${lic.license_key}</span>
            <button onclick="copyText('${lic.license_key}')" class="text-gray-500 hover:text-gray-300">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            </button>
          </div>
          <div class="flex gap-2">${tierBadge(lic.tier)} ${statusBadge(lic.status)}</div>
        </div>

        <!-- Info Grid -->
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><span class="text-gray-500">Plan:</span> <span class="text-gray-200 ml-2">${lic.plan || 'N/A'}</span></div>
          <div><span class="text-gray-500">Email:</span> <span class="text-gray-200 ml-2">${lic.email || 'None'}</span></div>
          <div><span class="text-gray-500">Max Activations:</span> <span class="text-gray-200 ml-2">${lic.max_activations}</span></div>
          <div><span class="text-gray-500">Expires:</span> <span class="text-gray-200 ml-2">${lic.expires_at ? formatDate(lic.expires_at) : 'Never'}</span></div>
          <div><span class="text-gray-500">Created:</span> <span class="text-gray-200 ml-2">${formatDate(lic.created_at)}</span></div>
          <div><span class="text-gray-500">Updated:</span> <span class="text-gray-200 ml-2">${formatDate(lic.updated_at)}</span></div>
          ${lic.notes ? `<div class="col-span-2"><span class="text-gray-500">Notes:</span> <span class="text-gray-200 ml-2">${escapeHtml(lic.notes)}</span></div>` : ''}
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-2 border-t border-gray-800">
          ${lic.status === 'active' ? `<button onclick="revokeLicense('${lic.id}'); closeLicenseModal()" class="btn btn-danger text-xs">Revoke</button>` : ''}
          ${lic.status === 'revoked' ? `<button onclick="reactivateLicense('${lic.id}'); closeLicenseModal()" class="btn btn-success text-xs">Reactivate</button>` : ''}
          <button onclick="deleteLicense('${lic.id}'); closeLicenseModal()" class="btn btn-danger text-xs">Delete</button>
        </div>

        <!-- Activations -->
        <div>
          <h4 class="text-sm font-semibold text-gray-300 mb-3">Activations (${data.activations.length})</h4>
          ${data.activations.length === 0 ? '<p class="text-gray-500 text-xs">No activations</p>' : `
          <div class="space-y-2">
            ${data.activations.map(a => `
              <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/50 text-xs">
                <div>
                  <span class="text-gray-300 font-medium">${a.hostname || 'Unknown'}</span>
                  <span class="text-gray-500 ml-2">${a.platform || ''} · ${a.app_version || ''}</span>
                  <span class="text-gray-600 ml-2">${a.ip_address || ''}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-gray-500">${timeAgo(a.last_seen_at)}</span>
                  ${a.is_active ? `<span class="badge bg-emerald-500/20 text-emerald-400">Active</span>` : `<span class="badge bg-gray-500/20 text-gray-400">Inactive</span>`}
                  ${a.is_active ? `<button onclick="deactivateActivation('${a.id}')" class="text-red-400 hover:text-red-300" title="Force deactivate">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>`}
        </div>

        <!-- Recent Validation Logs -->
        <div>
          <h4 class="text-sm font-semibold text-gray-300 mb-3">Recent Validations (${data.recentLogs.length})</h4>
          ${data.recentLogs.length === 0 ? '<p class="text-gray-500 text-xs">No validation logs</p>' : `
          <div class="max-h-48 overflow-y-auto space-y-1">
            ${data.recentLogs.map(log => `
              <div class="flex items-center justify-between px-3 py-1.5 rounded text-xs ${log.result === 'valid' ? 'text-gray-400' : 'text-red-400 bg-red-500/5'}">
                <span>${formatDate(log.validated_at)}</span>
                <span class="font-mono">${log.hardware_id?.substring(0, 12) || ''}...</span>
                <span>${log.ip_address || ''}</span>
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
    // Refresh the modal if open
    const modal = document.getElementById('license-modal');
    if (!modal.classList.contains('hidden')) {
      // Re-open with same license
      const keyEl = modal.querySelector('.font-mono.text-lg');
      if (keyEl) {
        // Just close and refresh the list
        closeLicenseModal();
        loadLicenses();
      }
    }
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
    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
      <span class="font-mono text-sm text-brand-400">${k.licenseKey}</span>
      <div class="flex items-center gap-2">
        ${k.expiresAt ? `<span class="text-xs text-gray-500">Exp: ${formatDate(k.expiresAt)}</span>` : ''}
        <button onclick="copyText('${k.licenseKey}')" class="text-gray-500 hover:text-white transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
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
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">No activations found</td></tr>`;
    return;
  }

  tbody.innerHTML = activations.map(a => `
    <tr class="table-row">
      <td class="px-4 py-3"><span class="font-mono text-xs text-brand-400">${a.license_key}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-400">${a.email || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-300">${a.hostname || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500">${a.platform || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500">${a.app_version || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500 font-mono">${a.ip_address || '-'}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500">${timeAgo(a.last_seen_at)}</span></td>
      <td class="px-4 py-3">${a.is_active ? '<span class="badge bg-emerald-500/20 text-emerald-400">Active</span>' : '<span class="badge bg-gray-500/20 text-gray-400">Inactive</span>'}</td>
      <td class="px-4 py-3">
        ${a.is_active ? `<button onclick="deactivateActivation('${a.id}'); setTimeout(loadActivations, 500)" class="text-xs text-red-400 hover:text-red-300 p-1" title="Deactivate">
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
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No logs found</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr class="table-row ${log.result !== 'valid' ? 'bg-red-500/5' : ''}">
      <td class="px-4 py-3"><span class="text-xs text-gray-400">${formatDate(log.validated_at)}</span></td>
      <td class="px-4 py-3"><span class="font-mono text-xs text-brand-400">${log.license_key}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500 font-mono">${(log.hardware_id || '').substring(0, 16)}${(log.hardware_id || '').length > 16 ? '...' : ''}</span></td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500 font-mono">${log.ip_address || '-'}</span></td>
      <td class="px-4 py-3">${resultBadge(log.result)}</td>
      <td class="px-4 py-3"><span class="text-xs text-gray-500">${log.message || '-'}</span></td>
    </tr>
  `).join('');

  // Simple pagination
  const pag = document.getElementById('logs-pagination');
  pag.innerHTML = `
    <span class="text-xs text-gray-500">${logs.length} entries shown</span>
    <div class="flex gap-2">
      <button onclick="logsPage = ${logsPage - 1}; loadLogs()" ${logsPage <= 1 ? 'disabled' : ''} class="btn btn-secondary text-xs disabled:opacity-30">Previous</button>
      <button onclick="logsPage = ${logsPage + 1}; loadLogs()" ${logs.length < 50 ? 'disabled' : ''} class="btn btn-secondary text-xs disabled:opacity-30">Next</button>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    active: 'bg-emerald-500/20 text-emerald-400',
    revoked: 'bg-red-500/20 text-red-400',
    expired: 'bg-gray-500/20 text-gray-400',
    suspended: 'bg-yellow-500/20 text-yellow-400',
  };
  return `<span class="badge ${map[status] || 'bg-gray-500/20 text-gray-400'}">${status}</span>`;
}

function tierBadge(tier) {
  const map = {
    premium: 'bg-amber-500/20 text-amber-400',
    free: 'bg-gray-500/20 text-gray-400',
  };
  return `<span class="badge ${map[tier] || 'bg-gray-500/20 text-gray-400'}">${tier}</span>`;
}

function resultBadge(result) {
  const map = {
    valid: 'bg-emerald-500/20 text-emerald-400',
    not_found: 'bg-red-500/20 text-red-400',
    revoked: 'bg-orange-500/20 text-orange-400',
    suspended: 'bg-yellow-500/20 text-yellow-400',
    expired: 'bg-gray-500/20 text-gray-400',
    hardware_mismatch: 'bg-purple-500/20 text-purple-400',
    max_activations: 'bg-pink-500/20 text-pink-400',
  };
  return `<span class="badge ${map[result] || 'bg-gray-500/20 text-gray-400'}">${(result || '').replace(/_/g, ' ')}</span>`;
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
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  } catch { return dateStr; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function copyText(text, msg = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => toast(msg, 'info')).catch(() => {
    // Fallback for non-HTTPS
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
  // Verify token is still valid
  api('/admin/stats').then(() => showApp()).catch(() => {
    token = null;
    localStorage.removeItem('craftos_admin_token');
  });
}
