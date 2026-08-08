/* =====================================================
   TaskFlow — app.js
   All frontend logic: API calls, rendering, events
   ===================================================== */

const API = 'https://google-auth-login-2-master.onrender.com/api';

// ─── STATE ──────────────────────────────────────────────────────
const state = {
  activeTab: 'todo',
  tasks: {},          // grouped by status
  stats: {},
  searchQuery: '',
};

const SVG_TODO = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`;
const SVG_DOING = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const SVG_COMPLETED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
const SVG_WONTDO = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;
const SVG_EXPIRED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const SVG_DELETED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

const TAB_META = {
  todo:      { icon: SVG_TODO, label: 'Will Do',      subtitle: 'Tasks you plan to do in the future' },
  doing:     { icon: SVG_DOING, label: 'Doing',         subtitle: 'Tasks you are currently working on' },
  completed: { icon: SVG_COMPLETED, label: 'Completed',     subtitle: 'Tasks you have finished' },
  wontdo:    { icon: SVG_WONTDO, label: 'Will Not Do',   subtitle: 'Tasks you decided to skip' },
  expired:   { icon: SVG_EXPIRED, label: 'Expired',       subtitle: 'Tasks that passed their deadline undone' },
  deleted:   { icon: SVG_DELETED, label: 'Deleted',       subtitle: 'Moved to trash — soft deleted' },
};

const PRIORITY_LABEL = { 
  high: '<span style="color:#f87171;">●</span> High', 
  medium: '<span style="color:#fbbf24;">●</span> Medium', 
  low: '<span style="color:#34d399;">●</span> Low' 
};

// ─── INIT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadCurrentUser();
  loadAll();
  bindEvents();
  setInterval(loadAll, 60000);
});

// ─── THEME ───────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('taskflow-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('taskflow-theme', next);
}

// ─── API HELPERS ─────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
  if (res.status === 401) {
    window.location.replace('login.html');
    throw new Error('Not authenticated');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── LOAD DATA ───────────────────────────────────────────────────
async function loadAll() {
  try {
    const [tasksRes, statsRes] = await Promise.all([
      apiFetch('/tasks'),
      apiFetch('/stats'),
    ]);
    state.tasks = tasksRes.data;
    state.stats = statsRes.data;
    updateCounts();
    updateStats();
  } catch (err) {
    if (err.message !== 'Not authenticated') {
      showToast('Cannot reach server: ' + err.message, 'error');
    }
    return;
  }
  try {
    renderCurrentTab();
  } catch (err) {
    console.error('Render error:', err);
  }
}

// ─── USER / AUTH ─────────────────────────────────────────────────
async function loadCurrentUser() {
  try {
    const res = await fetch(API + '/auth/me', { credentials: 'include' });
    if (!res.ok) { window.location.replace('login.html'); return; }
    const data = await res.json();
    const name = data.user.displayName || data.user.username;
    const avatarEl = document.getElementById('user-avatar');
    const nameEl   = document.getElementById('user-name');
    if (avatarEl) {
      if (data.user.profilePicture) {
        avatarEl.textContent = '';
        avatarEl.style.backgroundImage = `url(${data.user.profilePicture})`;
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = name.charAt(0).toUpperCase();
      }
    }
    if (nameEl)   nameEl.textContent   = name;
  } catch (_) {
    window.location.replace('login.html');
  }
}

async function logout() {
  document.getElementById('logout-modal-overlay').classList.remove('hidden');
}

// Attach listeners to logout modal buttons
document.getElementById('logout-cancel').addEventListener('click', () => {
  document.getElementById('logout-modal-overlay').classList.add('hidden');
});

document.getElementById('logout-confirm').addEventListener('click', async () => {
  try {
    await fetch(API + '/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {}
  window.location.replace('login.html');
});

function showDeleteAccountModal() {
  document.getElementById('delete-account-modal-overlay').classList.remove('hidden');
}

document.getElementById('delete-account-cancel').addEventListener('click', () => {
  document.getElementById('delete-account-modal-overlay').classList.add('hidden');
});

document.getElementById('delete-account-confirm').addEventListener('click', async () => {
  try {
    const btn = document.getElementById('delete-account-confirm');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    
    await fetch(API + '/auth/delete', { method: 'POST', credentials: 'include' });
    window.location.replace('login.html');
  } catch (_) {
    showToast('Failed to delete account', 'error');
  }
});

// ─── COUNTS / STATS ──────────────────────────────────────────────
function updateCounts() {
  Object.keys(TAB_META).forEach(status => {
    const el = document.getElementById('count-' + status);
    if (el) el.textContent = (state.tasks[status] || []).length;
  });
}

function updateStats() {
  const s = state.stats;
  document.getElementById('stat-total').textContent   = s.total || 0;
  document.getElementById('stat-active').textContent  = (s.todo || 0) + (s.doing || 0);
  document.getElementById('stat-done').textContent    = s.completed || 0;
  document.getElementById('stat-expired').textContent = s.expired || 0;

  const total = (s.total || 0);
  const done  = (s.completed || 0);
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('ring-label').textContent = pct + '%';
  const circ = 251.2;
  const offset = circ - (circ * pct) / 100;
  document.getElementById('ring-fill').style.strokeDashoffset = offset;
}

// ─── RENDER TASKS ─────────────────────────────────────────────────
function renderCurrentTab() {
  const tab = state.activeTab;
  const meta = TAB_META[tab];
  document.getElementById('list-title').innerHTML    = `<span style="display:inline-flex;align-items:center;gap:8px;">${meta.icon} ${meta.label}</span>`;
  document.getElementById('list-subtitle').textContent = meta.subtitle;

  let tasks = (state.tasks[tab] || []);

  // Sort tasks by deadline (earliest first)
  tasks.sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // apply search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }

  const grid  = document.getElementById('task-grid');
  const empty = document.getElementById('empty-state');

  // Hide loading spinner safely (it gets removed after first render)
  const loading = document.getElementById('loading-state');
  if (loading) loading.style.display = 'none';

  if (tasks.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('empty-icon').innerHTML       = meta.icon;
    document.getElementById('empty-title').textContent    = 'No ' + meta.label + ' tasks';
    document.getElementById('empty-subtitle').textContent = state.searchQuery
      ? 'No results for "' + state.searchQuery + '"'
      : 'Nothing here yet';
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = tasks.map(buildTaskCard).join('');
  // attach card-level events after render
  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCardAction);
  });
}

function buildTaskCard(task) {
  const deadline    = task.deadline ? new Date(task.deadline) : null;
  const created     = new Date(task.createdAt);
  const isExpired   = deadline && deadline < new Date() && task.status !== 'completed';
  const deadlineStr = deadline ? formatDateTime(deadline) : null;
  const movedAt     = task.movedAt ? new Date(task.movedAt) : null;

  const priorityClass = 'priority-' + (task.priority || 'medium');
  const priorityLabel = PRIORITY_LABEL[task.priority] || '🟡 Medium';

  // Build action buttons based on current status
  const actions = buildActionButtons(task);

  const isExpiredStatus = task.status === 'expired';

  return `
    <div class="task-card" data-id="${task._id}" data-priority="${task.priority || 'medium'}">
      <div class="task-top">
        <span class="task-title">${escHtml(task.title)}</span>
        <span class="task-card-badges">
          ${isExpiredStatus ? '<span class="expired-warning-badge" title="This task has expired!"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></span>' : ''}
          <span class="task-priority-badge ${priorityClass}">${priorityLabel}</span>
        </span>
      </div>
      ${task.description ? `<p class="task-desc">${escHtml(task.description)}</p>` : ''}
      <div class="task-meta">
        <span class="meta-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${formatDate(created)}</span>
        ${deadlineStr ? `<span class="meta-chip ${isExpired ? 'expired-chip' : 'deadline-chip'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> By: ${deadlineStr}</span>` : ''}
        ${movedAt ? `<span class="meta-chip moved-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg> ${formatDate(movedAt)}</span>` : ''}
        ${task.originalStatus ? `<span class="meta-chip">Was: ${task.originalStatus}</span>` : ''}
      </div>
      <div class="task-actions">${actions}</div>
    </div>
  `;
}

function buildActionButtons(task) {
  const s = task.status;
  const id = task._id;
  let btns = '';

  const svgDetail = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
  const svgEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
  const withStyle = (svg) => svg.replace('<svg', '<svg style="margin-right:4px;vertical-align:middle;"');

  btns += `<button class="action-btn detail" data-action="detail" data-id="${id}">${svgDetail} Detail</button>`;
  btns += `<button class="action-btn edit"   data-action="edit"   data-id="${id}">${svgEdit} Edit</button>`;

  if (s !== 'doing')     btns += `<button class="action-btn doing"  data-action="status" data-id="${id}" data-val="doing">${withStyle(SVG_DOING)} Doing</button>`;
  if (s !== 'todo')      btns += `<button class="action-btn todo"   data-action="status" data-id="${id}" data-val="todo">${withStyle(SVG_TODO)} Will Do</button>`;
  if (s !== 'completed') btns += `<button class="action-btn done"   data-action="status" data-id="${id}" data-val="completed">${withStyle(SVG_COMPLETED)} Done</button>`;
  if (s !== 'wontdo')    btns += `<button class="action-btn wontdo" data-action="status" data-id="${id}" data-val="wontdo">${withStyle(SVG_WONTDO)} Won't Do</button>`;
  if (s !== 'deleted')   btns += `<button class="action-btn delete" data-action="status" data-id="${id}" data-val="deleted">${withStyle(SVG_DELETED)} Delete</button>`;

  return btns;
}

// ─── CARD ACTIONS ─────────────────────────────────────────────────
async function handleCardAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.action;
  const id     = btn.dataset.id;
  const val    = btn.dataset.val;

  if (action === 'status') {
    if (val === 'deleted' || val === 'wontdo') {
      const label = val === 'deleted' ? 'Delete (move to Trash)' : 'Mark as Will Not Do';
      const confirmed = await showConfirm('Move Task', `${label}?`, val === 'deleted' ? '🗑️' : '🚫');
      if (!confirmed) return;
    }
    await changeStatus(id, val);
  } else if (action === 'detail') {
    openDetailModal(id);
  } else if (action === 'edit') {
    openEditModal(id);
  }
}

async function changeStatus(id, newStatus) {
  try {
    const res = await apiFetch(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(res.message, 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── DETAIL MODAL ─────────────────────────────────────────────────
function openDetailModal(id) {
  // find task across all tabs
  let task = null;
  Object.values(state.tasks).forEach(arr => {
    const found = arr.find(t => t._id === id);
    if (found) task = found;
  });
  if (!task) return;

  const meta     = TAB_META[task.status] || {};
  const deadline = task.deadline ? new Date(task.deadline) : null;
  const created  = new Date(task.createdAt);
  const updated  = new Date(task.updatedAt);
  const movedAt  = task.movedAt ? new Date(task.movedAt) : null;

  document.getElementById('modal-title').innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;">${meta.icon} ${escHtml(task.title)}</span>`;

  document.getElementById('modal-body').innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value">${meta.icon} ${meta.label}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Priority</span>
      <span class="detail-value">${PRIORITY_LABEL[task.priority] || '🟡 Medium'}</span>
    </div>
    ${task.description ? `
    <div class="detail-row">
      <span class="detail-label">Description</span>
      <span class="detail-value">${escHtml(task.description)}</span>
    </div>` : ''}
    <div class="detail-row">
      <span class="detail-label">Created</span>
      <span class="detail-value mono">${formatDateTime(created)}</span>
    </div>
    ${deadline ? `
    <div class="detail-row">
      <span class="detail-label">Deadline</span>
      <span class="detail-value mono">${formatDateTime(deadline)}</span>
    </div>` : ''}
    ${movedAt ? `
    <div class="detail-row">
      <span class="detail-label">Last Moved</span>
      <span class="detail-value mono">${formatDateTime(movedAt)}</span>
    </div>` : ''}
    ${task.originalStatus ? `
    <div class="detail-row">
      <span class="detail-label">Previous Status</span>
      <span class="detail-value">${task.originalStatus}</span>
    </div>` : ''}
    <div class="detail-row">
      <span class="detail-label">MongoDB ID</span>
      <span class="detail-value mono">${task._id}</span>
    </div>
  `;

  // Footer action buttons
  document.getElementById('modal-footer').innerHTML = buildActionButtons(task);
  document.getElementById('modal-footer').querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      await handleCardAction(e);
      closeModal();
    });
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ─── EDIT MODAL ────────────────────────────────────────────────────
function findTask(id) {
  let found = null;
  Object.values(state.tasks).forEach(arr => {
    const t = arr.find(t => t._id === id);
    if (t) found = t;
  });
  return found;
}

function openEditModal(id) {
  const task = findTask(id);
  if (!task) return;

  document.getElementById('edit-task-id').value  = task._id;
  document.getElementById('edit-title').value     = task.title || '';
  document.getElementById('edit-desc').value      = task.description || '';
  document.getElementById('edit-priority').value  = task.priority || 'medium';

  // Format deadline for datetime-local input (needs YYYY-MM-DDTHH:MM)
  if (task.deadline) {
    const d = new Date(task.deadline);
    const pad = n => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    document.getElementById('edit-deadline').value = local;
  } else {
    document.getElementById('edit-deadline').value = '';
  }

  document.getElementById('edit-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('edit-title').focus(), 100);
}

function closeEditModal() {
  document.getElementById('edit-overlay').classList.add('hidden');
}

async function submitEdit() {
  const id       = document.getElementById('edit-task-id').value;
  const title    = document.getElementById('edit-title').value.trim();
  const desc     = document.getElementById('edit-desc').value.trim();
  const deadline = document.getElementById('edit-deadline').value;
  const priority = document.getElementById('edit-priority').value;

  if (!title) {
    showToast('Title cannot be empty', 'warning');
    document.getElementById('edit-title').focus();
    return;
  }

  const saveBtn = document.getElementById('edit-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    await apiFetch(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        description: desc,
        deadline: deadline || null,
        deadlineText: deadline || '',
        priority,
      }),
    });
    showToast('✅ Task updated successfully', 'success');
    closeEditModal();
    await loadAll();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '💾 Save Changes';
  }
}

// ─── CONFIRM DIALOG ────────────────────────────────────────────────
function showConfirm(title, msg, icon = '⚠️') {
  return new Promise(resolve => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent   = msg;
    document.getElementById('confirm-icon').textContent  = icon;
    document.getElementById('confirm-overlay').classList.remove('hidden');

    const okBtn     = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    function cleanup(val) {
      document.getElementById('confirm-overlay').classList.add('hidden');
      okBtn.replaceWith(okBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      resolve(val);
    }

    document.getElementById('confirm-ok').addEventListener('click',     () => cleanup(true),  { once: true });
    document.getElementById('confirm-cancel').addEventListener('click',  () => cleanup(false), { once: true });
  });
}

// ─── SUBMIT TASK ───────────────────────────────────────────────────
async function submitTask() {
  const title      = document.getElementById('task-title').value.trim();
  const desc       = document.getElementById('task-desc').value.trim();
  const deadlineRaw = document.getElementById('task-deadline').value;
  const priority   = document.getElementById('task-priority').value;
  const status     = document.getElementById('task-status-init').value;

  if (!title) {
    showToast('Please enter a task title', 'warning');
    document.getElementById('task-title').focus();
    return;
  }

  const btn = document.getElementById('submit-task');
  btn.disabled = true;
  btn.textContent = 'Adding…';

  try {
    const body = {
      title,
      description: desc,
      deadline: deadlineRaw || null,
      deadlineText: deadlineRaw || '',
      priority,
      status,
    };

    const res = await apiFetch('/tasks', { method: 'POST', body: JSON.stringify(body) });
    showToast('✅ ' + res.message, 'success');
    clearForm();
    await loadAll();
    // Switch to the tab where it was added
    switchTab(res.data.status);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">＋</span> Add Task';
  }
}

function clearForm() {
  document.getElementById('task-title').value       = '';
  document.getElementById('task-desc').value        = '';
  document.getElementById('task-deadline').value    = '';
  document.getElementById('task-priority').value    = 'medium';
  document.getElementById('task-status-init').value = 'todo';
}

// ─── TAB SWITCHING ─────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  // Highlight sidebar nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Highlight matching stat card
  document.querySelectorAll('.stat-clickable').forEach(card => {
    card.classList.toggle('active-stat', card.dataset.tab === tab);
  });
  renderCurrentTab();
}

// ─── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icon = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ─── HELPERS ───────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12: true
  });
}

// ─── SIDEBAR TOGGLE (mobile) ───────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const hamburger = document.getElementById('hamburger-btn');
  const isOpen   = sidebar.classList.contains('open');
  isOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('active');
  document.getElementById('hamburger-btn').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
  document.getElementById('hamburger-btn').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── EVENT BINDINGS ────────────────────────────────────────────────
function bindEvents() {
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // User Dropdown toggle
  const userMenu = document.getElementById('user-menu-container');
  const userDropdown = document.getElementById('user-dropdown');
  if (userMenu && userDropdown) {
    userMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      userDropdown.classList.remove('show');
    });
  }

  // Logout and Delete Account
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('delete-account-btn').addEventListener('click', showDeleteAccountModal);

  // Sidebar nav
  document.getElementById('sidebar-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Stat cards → navigate to their tab
  document.getElementById('stats-grid').addEventListener('click', e => {
    const card = e.target.closest('.stat-clickable');
    if (card && card.dataset.tab) {
      switchTab(card.dataset.tab);
      // On mobile, close sidebar after navigating
      if (window.innerWidth <= 1024) closeSidebar();
    }
  });

  // Submit task
  document.getElementById('submit-task').addEventListener('click', submitTask);

  // Enter key submits
  document.getElementById('task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitTask();
  });

  // Clear form
  document.getElementById('clear-form').addEventListener('click', clearForm);

  // Refresh
  document.getElementById('refresh-btn').addEventListener('click', () => {
    showToast('Refreshing…', 'info');
    loadAll();
  });

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    renderCurrentTab();
  });

  // Collapse form
  document.getElementById('collapse-btn').addEventListener('click', () => {
    const body = document.getElementById('form-body');
    const btn  = document.getElementById('collapse-btn');
    body.classList.toggle('hidden');
    btn.classList.toggle('collapsed');
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Edit modal
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-save-btn').addEventListener('click', submitEdit);
  document.getElementById('edit-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-overlay')) closeEditModal();
  });
  // Save on Enter inside title field
  document.getElementById('edit-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitEdit();
  });

  // Confirm overlay backdrop
  document.getElementById('confirm-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('confirm-overlay')) {
      document.getElementById('confirm-overlay').classList.add('hidden');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeEditModal();
      document.getElementById('confirm-overlay').classList.add('hidden');
      closeSidebar();
    }
  });

  // ── Hamburger / mobile sidebar ──
  document.getElementById('hamburger-btn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
  
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', closeSidebar);
  }

  // Close sidebar when a nav tab is clicked on mobile
  document.getElementById('sidebar-nav').addEventListener('click', e => {
    if (window.innerWidth <= 1024) closeSidebar();
  });
}

// Add SVG gradient for progress ring
document.addEventListener('DOMContentLoaded', () => {
  const svg = document.querySelector('.progress-ring');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML = `
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#7c6ff7"/>
        <stop offset="100%" style="stop-color:#5eead4"/>
      </linearGradient>`;
    svg.prepend(defs);
  }
});
