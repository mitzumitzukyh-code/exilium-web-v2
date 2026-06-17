/* ══════════════════════════════════════════════════════════
   EXILIUM ADMIN PANEL — JavaScript (v4.0)
   Built from scratch — Vanilla JS, no frameworks
   ══════════════════════════════════════════════════════════ */

// ── Config ───────────────────────────────────────────────
const API_URL = 'https://exilium-blizzard.mitzumitzukyhs.workers.dev';

// ── State ────────────────────────────────────────────────
let state = {
  players: [],
  currentTab: 'players',
};

// ── Rank Colors ──────────────────────────────────────────
// FIX 7: Nombres de rango deben coincidir con el backend (xp-engine.js LEVELS_TABLE)
const RANK_COLORS = {
  'EXILIADO': '#9a8878',
  'INICIADO': '#9a8878',
  'PENITENTE': '#7a9abb',
  'SOMBRA': '#8888cc',
  'APÓSTATA': '#cc6644',
  'ROMPEJURAMENTOS': '#dd4444',
  'HEREJE': '#ee2222',
  'PROFETA': '#ff8800',
  'EXARCA': '#d4a017',
};

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════

function getToken() {
  return sessionStorage.getItem('admin_token');
}

function setToken(token) {
  sessionStorage.setItem('admin_token', token);
}

function clearToken() {
  sessionStorage.removeItem('admin_token');
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = getToken();
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(API_URL + endpoint, options);

  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error('Sesión expirada');
  }

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('text/plain')) {
    const text = await res.text();
    if (!res.ok) throw new Error(text || 'Error del servidor');
    return text;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Error del servidor');
  return data;
}

// ── DOM Helpers ──────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }

function toast(message, type = 'info') {
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast ' + type;
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), 3500);
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return 'Hace ' + mins + ' min';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'Hace ' + hours + 'h';
  const days = Math.floor(hours / 24);
  return 'Hace ' + days + 'd';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeForJsString(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Modal Helpers ────────────────────────────────────────
function openModal(title, htmlContent) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = htmlContent;
  $('modal-overlay').classList.add('active');
}

function closeModal() {
  $('modal-overlay').classList.remove('active');
}

// ══════════════════════════════════════════════════════════
//  AUTH / LOGIN
// ══════════════════════════════════════════════════════════

function showLogin() {
  $('login-view').style.display = '';
  $('dashboard-view').classList.remove('active');
}

function showDashboard() {
  $('login-view').style.display = 'none';
  $('dashboard-view').classList.add('active');
  loadPlayersData();
}

async function handleLogin() {
  const password = $('login-password').value.trim();
  const errorEl = $('login-error');
  const btn = $('login-btn');

  if (!password) {
    errorEl.textContent = 'Ingresa la contraseña.';
    errorEl.classList.add('visible');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  errorEl.classList.remove('visible');

  try {
    const res = await fetch(API_URL + '/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (res.ok && data.token) {
      setToken(data.token);
      showDashboard();
    } else {
      errorEl.textContent = data?.error || 'Error de autenticación.';
      errorEl.classList.add('visible');
    }
  } catch (err) {
    errorEl.textContent = 'Error de conexión con el servidor.';
    errorEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function logout() {
  clearToken();
  state.players = [];
  showLogin();
  toast('Sesión cerrada', 'info');
}

async function checkSession() {
  const token = getToken();
  if (!token) { showLogin(); return; }

  try {
    const data = await apiCall('/admin/players');
    state.players = Array.isArray(data) ? data : (data?.players || []);
    showDashboard();
  } catch {
    showLogin();
  }
}

// ══════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════════════════════

function switchTab(tabName) {
  state.currentTab = tabName;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#sidebar-nav button').forEach(el => el.classList.remove('active'));

  const tabEl = $('tab-' + tabName);
  if (tabEl) tabEl.classList.add('active');

  const navBtn = document.querySelector('#sidebar-nav button[data-tab="' + tabName + '"]');
  if (navBtn) navBtn.classList.add('active');

  // Close sidebar on mobile
  $('sidebar')?.classList.remove('open');

  // Load tab data
  switch (tabName) {
    case 'players': loadPlayersData(); break;
    case 'sync': renderSyncTab(); break;
    case 'xp': renderXpTab(); break;
    case 'marriages': renderMarriagesTab(); break;
    case 'announcement': loadAnnouncement(); break;
    case 'export': break;
    case 'season': renderSeasonTab(); break;
    case 'battlepass': loadBattlePassTab(); break;
    case 'officers': loadOfficers(); break;
    case 'hall-of-fame': loadHallOfFame(); break;
    case 'analytics': loadAnalytics(); break;
    case 'n8n': loadN8nConfig(); break;
    case 'errors': loadErrors(); break;
    case 'boost-orders': loadBoostOrders(); break;
    case 'boost-boosters': loadBoostBoosters(); break;
    case 'boost-clients': loadBoostClients(); break;
    case 'rbg-strategies': loadRbgTab(); break;
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 1: JUGADORES
// ══════════════════════════════════════════════════════════

async function loadPlayersData() {
  try {
    const data = await apiCall('/admin/players');
    let players = Array.isArray(data) ? data : (data?.players || []);
    
    // Filtrar duplicados por ID (Problema 4: Vendettita duplicado)
    const seenIds = new Set();
    players = players.filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    
    state.players = players;
    renderPlayersTable();
  } catch (err) {
    toast('Error cargando jugadores: ' + err.message, 'error');
  }
}

function getFilteredPlayers() {
  const search = ($('player-search')?.value || '').toLowerCase();
  const filter = $('player-filter')?.value || 'all';

  return state.players.filter(p => {
    if (filter === 'active' && p.banned) return false;
    if (filter === 'banned' && !p.banned) return false;
    if (search) {
      const haystack = [p.name, p.realm, p.realm_display, p.class, p.spec].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function getSyncBadge(p) {
  const status = p.sync?.sync_status || p.sync_status || 'unknown';
  switch (status) {
    case 'ok':         return '<span class="badge badge-ok">🟢 OK</span>';
    case 'new':        return '<span class="badge badge-new">🔵 Nuevo</span>';
    case 'error':      return '<span class="badge badge-error">🔴 Error</span>';
    case 'not_found':  return '<span class="badge badge-warn">⚠️ No encontrado</span>';
    case 'private':    return '<span class="badge badge-muted">🔒 Privado</span>';
    case 'api_bug_ss': return '<span class="badge badge-warn">⚠️ Bug API SS</span>';
    case 'timeout':    return '<span class="badge badge-error">🔴 Timeout</span>';
    default:           return '<span class="badge badge-muted">—</span>';
  }
}

function getStatusBadge(p) {
  let html = '';
  if (p.banned) html += '<span class="badge badge-ban">BANEADO</span> ';
  if (p.marriage?.partner_name) html += '💍 ' + escapeHtml(p.marriage.partner_name);
  if (!p.banned && !p.marriage?.partner_name) html += '<span style="color:var(--text-muted);">—</span>';
  return html;
}

function renderPlayersTable() {
  const filtered = getFilteredPlayers();
  const tbody = $('players-tbody');
  $('players-count').textContent = 'Mostrando ' + filtered.length + ' / ' + state.players.length + ' jugadores';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state"><div class="empty-icon">🔍</div><p>No se encontraron jugadores</p></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((p, i) => {
    const bp = p.battlepass || {};
    const rankColor = RANK_COLORS[bp.rank_name] || 'var(--text-muted)';
    const avatar = p.media?.avatar || 'assets/logo.png';
    const rowClass = p.banned ? ' class="banned"' : '';

    return '<tr' + rowClass + '>' +
      '<td>' + (i + 1) + '</td>' +
      '<td><img class="player-avatar" src="' + escapeHtml(avatar) + '" alt="" onerror="this.src=\'assets/logo.png\'"></td>' +
      '<td><span class="player-name">' + escapeHtml(p.name) + '</span><br><span class="player-realm">' + escapeHtml(p.realm_display || p.realm) + '</span></td>' +
      '<td>' + escapeHtml(p.class || '—') + '</td>' +
      '<td>' + (p.ilvl || '—') + '</td>' +
      '<td class="player-xp">' + (bp.total_xp ?? 0) + '</td>' +
      '<td>' + (bp.level ?? 0) + '</td>' +
      '<td style="color:' + rankColor + ';font-weight:600;">' + escapeHtml(bp.rank_name || 'EXILIADO') + '</td>' +
      '<td>' + getSyncBadge(p) + '</td>' +
      '<td>' + getStatusBadge(p) + '</td>' +
      '<td class="player-actions">' +
        '<button class="btn btn-sm" onclick="refreshPlayer(\'' + escapeForJsString(p.id) + '\')">🔄</button>' +
        '<button class="btn btn-sm" onclick="openEditModal(\'' + escapeForJsString(p.id) + '\')">✏️</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deletePlayer(\'' + escapeForJsString(p.id) + '\', \'' + escapeHtml(p.name) + '\')">🗑️</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function refreshPlayer(id) {
  try {
    toast('Sincronizando jugador...', 'info');
    await apiCall('/admin/players/' + id + '/refresh', 'POST');
    toast('Jugador sincronizado', 'success');
    await loadPlayersData();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function openEditModal(id) {
  const p = state.players.find(x => x.id === id);
  if (!p) return;

  const html = '<div class="form-group">' +
    '<label for="edit-notes">Notas internas</label>' +
    '<textarea class="input" id="edit-notes">' + escapeHtml(p.notes || '') + '</textarea>' +
  '</div>' +
  '<div class="form-group">' +
    '<label><input type="checkbox" id="edit-banned" ' + (p.banned ? 'checked' : '') + '> ¿Baneado?</label>' +
  '</div>' +
  '<div class="form-actions">' +
    '<button class="btn" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="savePlayerEdit(\'' + id + '\')">Guardar</button>' +
  '</div>';

  openModal('Editar: ' + p.name, html);
}

async function savePlayerEdit(id) {
  const notes = $('edit-notes')?.value || '';
  const banned = $('edit-banned')?.checked || false;

  try {
    await apiCall('/admin/players/' + id, 'PATCH', { notes, banned });
    toast('Jugador actualizado', 'success');
    closeModal();
    await loadPlayersData();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function deletePlayer(id, name) {
  if (!confirm(
    '⚠️ ¿Eliminar la inscripción de ' + name + '?\n\n' +
    '• Se borrarán TODOS los datos de este personaje (ratings, XP, nivel).\n' +
    '• El jugador podrá volver a inscribirse con otro personaje.\n' +
    '• Esta acción NO se puede deshacer.\n\n' +
    '¿Continuar?'
  )) return;
  try {
    await apiCall('/admin/players/' + id, 'DELETE');
    toast('Inscripción de ' + name + ' anulada correctamente', 'success');
    await loadPlayersData();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function openInscribirModal() {
  const html = '<div class="form-group">' +
    '<label for="ins-name">Nombre del personaje</label>' +
    '<input class="input" type="text" id="ins-name" placeholder="Ej: Vendettita">' +
  '</div>' +
  '<div class="form-group">' +
    '<label for="ins-realm">Reino</label>' +
    '<input class="input" type="text" id="ins-realm" placeholder="Ej: quel-thalas, ragnaros">' +
  '</div>' +
  '<div class="form-group">' +
    '<label for="ins-region">Región</label>' +
    '<input class="input" type="text" id="ins-region" value="us" placeholder="us">' +
  '</div>' +
  '<div class="form-actions">' +
    '<button class="btn" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="submitInscribir()">Inscribir</button>' +
  '</div>';

  openModal('Inscribir jugador', html);
}

async function submitInscribir() {
  const name = $('ins-name')?.value.trim();
  const realm = $('ins-realm')?.value.trim();
  const region = $('ins-region')?.value.trim() || 'us';

  if (!name || !realm) {
    toast('Nombre y reino son obligatorios', 'error');
    return;
  }

  try {
    await apiCall('/admin/players', 'POST', { name, realm, region });
    toast('Jugador inscrito exitosamente', 'success');
    closeModal();
    await loadPlayersData();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 2: SINCRONIZACIÓN
// ══════════════════════════════════════════════════════════

function renderSyncTab() {
  // Find most recent sync timestamp
  let lastSync = null;
  let okCount = 0;
  let errorCount = 0;

  state.players.forEach(p => {
    const syncTime = p.sync?.last_update || p.sync?.last_success;
    if (syncTime) {
      const t = new Date(syncTime).getTime();
      if (!lastSync || t > lastSync) lastSync = t;
    }
    const status = p.sync?.sync_status || p.sync_status || '';
    if (status === 'ok') okCount++;
    else if (status !== 'new' && status !== '') errorCount++;
  });

  // Last run display
  const lastRunEl = $('sync-last-run');
  if (lastSync) {
    const minsSince = Math.floor((Date.now() - lastSync) / 60000);
    let dotClass = 'green';
    if (minsSince > 120) dotClass = 'red';
    else if (minsSince > 30) dotClass = 'yellow';

    lastRunEl.innerHTML = '<span class="sync-status-indicator"><span class="sync-dot ' + dotClass + '"></span>' + timeAgo(new Date(lastSync).toISOString()) + '</span>';
  } else {
    lastRunEl.textContent = '—';
  }

  $('sync-ok-count').textContent = okCount;
  $('sync-error-count').textContent = errorCount;

  // Problem players
  const problems = state.players.filter(p => {
    const s = p.sync?.sync_status || p.sync_status || '';
    return s !== 'ok' && s !== 'new' && s !== '';
  });

  const container = $('sync-problems');
  if (problems.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><p>Todos los jugadores están sincronizados correctamente</p></div>';
    return;
  }

  container.innerHTML = problems.map(p => {
    const status = p.sync?.sync_status || p.sync_status || '';
    const lastError = p.sync?.last_error || '—';
    return '<div class="problem-row">' +
      '<span class="name">' + escapeHtml(p.name) + '</span>' +
      getSyncBadge(p) +
      '<span class="error-msg">' + escapeHtml(lastError) + '</span>' +
      '<button class="btn btn-sm" onclick="refreshPlayer(\'' + escapeForJsString(p.id) + '\')">🔄 Reintentar</button>' +
    '</div>';
  }).join('');
}

async function massSync() {
  const btn = $('mass-sync-btn');
  const loading = $('sync-loading');
  const result = $('sync-result');

  btn.disabled = true;
  show(loading);
  result.innerHTML = '';

  const players = state.players.filter(p => !p.banned);
  let synced = 0;
  let errors = 0;
  const errorList = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    result.innerHTML = '<div style="padding:12px;border:1px solid var(--primary);border-radius:6px;color:var(--text);">Sincronizando ' + (i + 1) + '/' + players.length + ': <strong>' + escapeHtml(p.name) + '</strong>...</div>';

    try {
      await apiCall('/admin/players/' + p.id + '/refresh', 'POST');
      synced++;
    } catch (err) {
      errors++;
      errorList.push(p.name + ': ' + err.message);
    }

    // Small delay between players to avoid rate limiting
    if (i < players.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  let html = '<div style="padding:12px;border:1px solid var(--success);border-radius:6px;background:var(--success-bg);color:var(--success);">Sincronización completada: ' + synced + '/' + players.length + ' jugadores OK';
  if (errors > 0) {
    html += ', ' + errors + ' errores';
  }
  html += '</div>';

  if (errorList.length > 0) {
    html += '<div style="padding:8px 12px;margin-top:8px;border:1px solid var(--danger);border-radius:6px;font-size:0.85em;color:var(--danger);">' +
      errorList.map(e => escapeHtml(e)).join('<br>') +
    '</div>';
  }

  result.innerHTML = html;
  toast('Sync completado: ' + synced + ' OK, ' + errors + ' errores', synced > 0 ? 'success' : 'error');
  await loadPlayersData();
  renderSyncTab();

  // Reconstruir Guild Top 20 automáticamente
  result.innerHTML += '<div style="padding:12px;margin-top:8px;border:1px solid var(--primary);border-radius:6px;color:var(--text);">⏳ Reconstruyendo Guild Top 20...</div>';
  try {
    await rebuildGuildRanking(result);
    result.innerHTML += '<div style="padding:12px;margin-top:8px;border:1px solid var(--success);border-radius:6px;background:var(--success-bg);color:var(--success);">✅ Guild Top 20 actualizado correctamente</div>';
    toast('Guild Top 20 actualizado', 'success');
  } catch (err) {
    result.innerHTML += '<div style="padding:12px;margin-top:8px;border:1px solid var(--danger);border-radius:6px;color:var(--danger);">❌ Error reconstruyendo ranking: ' + escapeHtml(err.message) + '</div>';
    toast('Error reconstruyendo ranking', 'error');
  }

  btn.disabled = false;
  hide(loading);
}

async function rebuildGuildRanking(statusEl) {
  // Eliminar partial existente para garantizar un rebuild limpio sin duplicados
  try { await apiCall('/admin/guild-ranking/partial', 'DELETE'); } catch (_) {}

  let status = 'starting';
  let offset = 0;
  let maxIter = 100;

  while (status !== 'complete' && maxIter-- > 0) {
    const res = await apiCall('/admin/guild-ranking/build?offset=' + offset, 'POST');
    status = res.status;
    offset = res.next_offset || 0;

    if (res.error) throw new Error(res.error);
    if (status === 'complete') break;

    if (statusEl) {
      const last = statusEl.querySelector('.ranking-progress');
      const msg = '⏳ Ranking: fase ' + status + (res.processed_so_far ? ' (' + res.processed_so_far + '/' + (res.total_eligible || '?') + ')' : '') + '...';
      if (last) last.textContent = msg;
      else statusEl.innerHTML += '<div class="ranking-progress" style="padding:8px 12px;margin-top:4px;font-size:0.85em;color:var(--text-muted);">' + msg + '</div>';
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 3: AJUSTE DE XP
// ══════════════════════════════════════════════════════════

function renderXpTab() {
  const select = $('xp-player-select');
  const currentVal = select.value;
  select.innerHTML = '<option value="">— Seleccionar —</option>';

  const activePlayers = state.players.filter(p => !p.banned);
  activePlayers.sort((a, b) => a.name.localeCompare(b.name));

  activePlayers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + ' — ' + (p.realm_display || p.realm);
    select.appendChild(opt);
  });

  if (currentVal) {
    select.value = currentVal;
    renderXpPlayerInfo(currentVal);
  }
}

function renderXpPlayerInfo(playerId) {
  const container = $('xp-player-info');
  if (!playerId) { hide(container); return; }

  const p = state.players.find(x => x.id === playerId);
  if (!p) { hide(container); return; }

  show(container);

  const bp = p.battlepass || {};
  const xpb = bp.xp_breakdown || {};
  const pvp = p.pvp || {};
  const sm = pvp.season_max || {};

  // Breakdown
  const breakdownEl = $('xp-breakdown');
  const brackets = [
    { label: 'Shuffle', key: 'from_rs' },
    { label: '2v2', key: 'from_r2' },
    { label: '3v3', key: 'from_r3' },
    { label: 'RBG', key: 'from_rbg' },
    { label: 'Blitz', key: 'from_bgs' },
    { label: 'Bonus', key: 'manual_bonus' },
  ];

  breakdownEl.innerHTML = brackets.map(b =>
    '<div class="xp-item"><div class="xp-item-val">' + (xpb[b.key] ?? 0) + '</div><div class="xp-item-label">' + b.label + '</div></div>'
  ).join('');

  // Summary
  const summaryEl = $('xp-summary');
  summaryEl.innerHTML =
    '<div class="stat-card"><div class="stat-val" style="color:var(--warning);">' + (bp.total_xp ?? 0) + '</div><div class="stat-label">XP Total</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + (bp.level ?? 0) + '</div><div class="stat-label">Nivel</div></div>' +
    '<div class="stat-card"><div class="stat-val" style="color:' + (RANK_COLORS[bp.rank_name] || 'var(--text)') + ';">' + escapeHtml(bp.rank_name || 'EXILIADO') + '</div><div class="stat-label">Rango</div></div>';
}

async function applyXpAdjust() {
  const playerId = $('xp-player-select').value;
  const amount = parseInt($('xp-amount').value, 10);
  const reason = $('xp-reason').value.trim();

  if (!playerId) { toast('Selecciona un jugador', 'error'); return; }
  if (isNaN(amount) || amount === 0) { toast('Ingresa una cantidad válida', 'error'); return; }
  if (!reason) { toast('La razón es obligatoria', 'error'); return; }

  try {
    await apiCall('/admin/players/' + playerId + '/xp', 'POST', { amount, reason });
    toast('XP ajustado: ' + (amount > 0 ? '+' : '') + amount, 'success');
    $('xp-amount').value = '';
    $('xp-reason').value = '';
    await loadPlayersData();
    renderXpPlayerInfo(playerId);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function grantTitle(title) {
  const playerId = $('xp-player-select').value;
  if (!playerId) { toast('Selecciona un jugador primero', 'error'); return; }

  const label = title === 'legend' ? 'LEYENDA' : 'GLADIATOR';
  if (!confirm('¿Estás seguro? Otorgar ' + label + ' sumará +3,500 XP.')) return;

  try {
    await apiCall('/admin/players/' + playerId + '/title', 'POST', { title });
    toast('Título ' + label + ' otorgado', 'success');
    await loadPlayersData();
    renderXpPlayerInfo(playerId);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 4: BODAS
// ══════════════════════════════════════════════════════════

function renderMarriagesTab() {
  // Populate dropdowns
  const activePlayers = state.players.filter(p => !p.banned && !p.marriage?.married_to);
  activePlayers.sort((a, b) => a.name.localeCompare(b.name));

  ['marry-p1', 'marry-p2'].forEach(id => {
    const sel = $(id);
    const curr = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar —</option>';
    activePlayers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' (' + (p.realm_display || p.realm) + ')';
      sel.appendChild(opt);
    });
    if (curr) sel.value = curr;
  });

  // Render marriages
  const married = [];
  const seen = new Set();

  state.players.forEach(p => {
    if (p.marriage?.married_to && !seen.has(p.id)) {
      seen.add(p.id);
      seen.add(p.marriage.married_to);
      const partner = state.players.find(x => x.id === p.marriage.married_to);
      married.push({
        p1: p,
        p2: partner,
        date: p.marriage?.married_since || '—',
      });
    }
  });

  const container = $('marriages-list');
  if (married.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💍</div><p>No hay matrimonios activos</p></div>';
    return;
  }

  container.innerHTML = married.map(m =>
    '<div class="marriage-card">' +
      '<span class="names">' + escapeHtml(m.p1.name) + '</span>' +
      '<span class="heart">❤️</span>' +
      '<span class="names">' + escapeHtml(m.p2?.name || '???') + '</span>' +
      '<span class="date">Desde: ' + escapeHtml(m.date) + '</span>' +
      '<button class="btn btn-sm btn-danger" onclick="divorcePlayer(\'' + escapeForJsString(m.p1.id) + '\', \'' + escapeHtml(m.p1.name) + '\', \'' + escapeHtml(m.p2?.name || '') + '\')">Divorciar</button>' +
    '</div>'
  ).join('');
}

async function marryPlayers() {
  const p1 = $('marry-p1').value;
  const p2 = $('marry-p2').value;

  if (!p1 || !p2) { toast('Selecciona ambos jugadores', 'error'); return; }
  if (p1 === p2) { toast('No pueden ser el mismo jugador', 'error'); return; }

  try {
    await apiCall('/admin/players/marry', 'POST', { player1_id: p1, player2_id: p2 });
    toast('¡Matrimonio realizado! 💒', 'success');
    await loadPlayersData();
    renderMarriagesTab();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function divorcePlayer(id, name1, name2) {
  if (!confirm('¿Divorciar a ' + name1 + ' y ' + name2 + '?')) return;

  try {
    await apiCall('/admin/players/divorce/' + id, 'POST');
    toast('Divorcio completado', 'success');
    await loadPlayersData();
    renderMarriagesTab();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 5: ANUNCIO
// ══════════════════════════════════════════════════════════

async function loadAnnouncement() {
  try {
    const data = await apiCall('/admin/announcement');
    renderAnnouncementCurrent(data);
  } catch {
    renderAnnouncementCurrent(null);
  }
}

function renderAnnouncementCurrent(data) {
  const container = $('announce-current');
  const delBtn = $('delete-announce-btn');

  if (!data || !data.message) {
    container.className = 'announce-current empty';
    container.textContent = 'No hay anuncio activo';
    hide(delBtn);
    return;
  }

  container.className = 'announce-current';
  container.innerHTML =
    '<span class="announce-type-badge type-' + (data.type || 'info') + '">' + (data.type || 'info').toUpperCase() + '</span>' +
    '<span>' + escapeHtml(data.message) + '</span>';
  show(delBtn);
}

async function publishAnnouncement() {
  const message = $('announce-message').value.trim();
  const type = $('announce-type').value;

  if (!message) { toast('El mensaje es obligatorio', 'error'); return; }

  try {
    await apiCall('/admin/announcement', 'POST', { message, type });
    toast('Anuncio publicado', 'success');
    $('announce-message').value = '';
    updateAnnouncePreview();
    await loadAnnouncement();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteAnnouncement() {
  if (!confirm('¿Eliminar el anuncio actual?')) return;
  try {
    await apiCall('/admin/announcement', 'DELETE');
    toast('Anuncio eliminado', 'success');
    await loadAnnouncement();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function updateAnnouncePreview() {
  const message = $('announce-message').value;
  const type = $('announce-type').value;
  const banner = $('announce-preview-banner');
  const counter = $('announce-chars');

  counter.textContent = message.length;
  banner.textContent = message || '(escribe un mensaje arriba)';
  banner.className = 'announce-preview-banner preview-' + type;
}

// ══════════════════════════════════════════════════════════
//  TAB 6: EXPORTAR ADDON
// ══════════════════════════════════════════════════════════

async function generateExport() {
  const btn = $('generate-export-btn');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const text = await apiCall('/admin/export-addon');
    const output = $('export-output');
    show(output);
    $('export-textarea').value = text;

    // Count players in the EXIMPORT:v1| format (separated by |, first part is header)
    const parts = text.split('|');
    const playerCount = parts.length > 1 ? parts.length - 1 : 0;
    $('export-meta').innerHTML =
      '<span>📅 ' + new Date().toLocaleString('es') + '</span>' +
      '<span>👥 ' + playerCount + ' jugadores</span>';

    toast('Export generado', 'success');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📦 Generar Export';
  }
}

async function copyExport() {
  const text = $('export-textarea').value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('¡Copiado al portapapeles!', 'success');
  } catch {
    toast('Error al copiar — usa Ctrl+C manualmente', 'error');
    $('export-textarea').select();
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 7: TEMPORADA
// ══════════════════════════════════════════════════════════

function renderSeasonTab() {
  const activeCount = state.players.filter(p => !p.banned).length;
  $('season-player-count').textContent = activeCount;
  validateSeasonClose();
}

function validateSeasonClose() {
  const understood = $('season-understand')?.checked || false;
  const text = ($('season-confirm-text')?.value || '').trim();
  const btn = $('close-season-btn');
  btn.disabled = !(understood && text === 'CONFIRMAR');
}

async function closeSeason() {
  if (!confirm('ÚLTIMA ADVERTENCIA: ¿Cerrar la temporada? Esto es IRREVERSIBLE.')) return;

  try {
    await apiCall('/admin/season/close', 'POST', { confirm: 'CONFIRMAR' });
    toast('Temporada cerrada', 'success');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 8: ERRORES
// ══════════════════════════════════════════════════════════

async function loadErrors() {
  try {
    const data = await apiCall('/admin/errors');
    const errors = Array.isArray(data) ? data : (data?.errors || []);
    renderErrors(errors);
  } catch (err) {
    toast('Error cargando logs: ' + err.message, 'error');
  }
}

function renderErrors(errors) {
  const container = $('errors-list');

  if (!errors || errors.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div><p>No hay errores registrados</p></div>';
    return;
  }

  // Sort descending by timestamp
  errors.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  container.innerHTML = errors.map(e =>
    '<div class="error-row">' +
      '<span class="time">' + (e.timestamp ? new Date(e.timestamp).toLocaleString('es') : '—') + '</span>' +
      '<span class="module">' + escapeHtml(e.module || '—') + '</span>' +
      '<span class="message">' + escapeHtml(e.message || e.error || '—') + '</span>' +
      '<span class="details">' + escapeHtml(e.details || e.stack || '') + '</span>' +
    '</div>'
  ).join('');
}

async function clearErrors() {
  if (!confirm('¿Borrar todos los errores?')) return;
  try {
    await apiCall('/admin/errors', 'DELETE');
    toast('Log de errores limpiado', 'success');
    renderErrors([]);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 9: PASE DE BATALLA
// ══════════════════════════════════════════════════════════

// Default rewards from the PB images
const DEFAULT_REWARDS = [
  { level: 0,  label: 'Paquete Inicial', desc: '30 frascos de honor, 1 gema stat, 10 consumibles, Rango Exiliado', image: 'PB1.png' },
  { level: 1,  label: 'Nivel 1', desc: '1k gold + x2 boda rango 3', image: 'PB1.png' },
  { level: 2,  label: 'Nivel 2', desc: '1k gold + x2 boda rango 3', image: 'PB1.png' },
  { level: 3,  label: 'Nivel 3', desc: '1k gold + x2 boda rango 3', image: 'PB1.png' },
  { level: 4,  label: 'Nivel 4', desc: '1k gold + x2 boda rango 3', image: 'PB1.png' },
  { level: 5,  label: 'Nivel 5', desc: '1 Heliotropo infundido', image: 'PB1.png' },
  { level: 6,  label: 'Nivel 6', desc: '1 gema stat', image: 'PB2.png' },
  { level: 7,  label: 'Nivel 7', desc: '1 gema stat', image: 'PB2.png' },
  { level: 8,  label: 'Nivel 8', desc: '2k gold + x2 boda rango 3', image: 'PB2.png' },
  { level: 9,  label: 'Nivel 9', desc: '2k gold + x2 boda rango 3', image: 'PB2.png' },
  { level: 10, label: 'Nivel 10', desc: '1 sangrita c. + Rango PENITENTE', image: 'PB2.png' },
  { level: 11, label: 'Nivel 11', desc: '2k gold', image: 'PB2.png' },
  { level: 12, label: 'Nivel 12', desc: '2k gold', image: 'PB3.png' },
  { level: 13, label: 'Nivel 13', desc: '2k gold + x2 boda rango 3', image: 'PB3.png' },
  { level: 14, label: 'Nivel 14', desc: '1 gema stat', image: 'PB3.png' },
  { level: 15, label: 'Nivel 15', desc: 'Rango SOMBRA', image: 'PB3.png' },
  { level: 16, label: 'Nivel 16', desc: '2k gold', image: 'PB3.png' },
  { level: 17, label: 'Nivel 17', desc: '2k gold', image: 'PB3.png' },
  { level: 18, label: 'Nivel 18', desc: '3k gold + x2 boda rango 3', image: 'PB4.png' },
  { level: 19, label: 'Nivel 19', desc: '1 gema stat', image: 'PB4.png' },
  { level: 20, label: 'Nivel 20', desc: '1 Juguete + Rango APÓSTATA', image: 'PB4.png' },
  { level: 21, label: 'Nivel 21', desc: '3k gold', image: 'PB4.png' },
  { level: 22, label: 'Nivel 22', desc: '2 gemas stat', image: 'PB4.png' },
  { level: 23, label: 'Nivel 23', desc: '1 Juguete', image: 'PB4.png' },
  { level: 24, label: 'Nivel 24', desc: '4k gold + x2 boda rango 3', image: 'PB5.png' },
  { level: 25, label: 'Nivel 25', desc: '1 Juguete + Banco hermandad + Rango ROMPEJURAMENTOS', image: 'PB5.png' },
  { level: 26, label: 'Nivel 26', desc: '2 Heliotropos infundidos', image: 'PB5.png' },
  { level: 27, label: 'Nivel 27', desc: '2 Heliotropos infundidos', image: 'PB5.png' },
  { level: 28, label: 'Nivel 28', desc: '4k gold + x2 boda rango 3', image: 'PB5.png' },
  { level: 29, label: 'Nivel 29', desc: '2 gemas stat', image: 'PB5.png' },
  { level: 30, label: 'Nivel 30', desc: '2 juguetes + Rango HEREJE', image: 'PB3.2.png' },
  { level: 31, label: 'Nivel 31', desc: '4k gold', image: 'PB3.2.png' },
  { level: 32, label: 'Nivel 32', desc: '3 Heliotropos infundidos', image: 'PB3.2.png' },
  { level: 33, label: 'Nivel 33', desc: '5k gold + x2 boda rango 3', image: 'PB3.2.png' },
  { level: 34, label: 'Nivel 34', desc: '3 Heliotropos infundidos', image: 'PB3.2.png' },
  { level: 35, label: 'Nivel 35', desc: '5k gold + Rango PROFETA', image: 'PB6.png' },
  { level: 36, label: 'Nivel 36', desc: '3 Heliotropos infundidos', image: 'PB6.png' },
  { level: 37, label: 'Nivel 37', desc: '5k gold', image: 'PB6.png' },
  { level: 38, label: 'Nivel 38', desc: '5k gold', image: 'PB6.png' },
  { level: 39, label: 'Nivel 39', desc: '3 Heliotropos infundidos', image: 'PB6.png' },
  { level: 40, label: 'Nivel 40 — EXARCA', desc: '8 Heliotropos infundidos, Reconocimiento en guild, Sugerir temática season, Sonido panel de voz, Rango EXARCA', image: 'PB7.png' },
];

let bpConfig = { rewards: [], season_name: '', xp_multiplier: 1.0, max_bonus: 10000, rewards_visible: true };

async function loadBattlePassTab() {
  try {
    const data = await apiCall('/admin/battlepass-config');
    if (data.rewards && data.rewards.length > 0) {
      bpConfig = data;
    } else {
      bpConfig.rewards = JSON.parse(JSON.stringify(DEFAULT_REWARDS));
    }
  } catch {
    bpConfig.rewards = JSON.parse(JSON.stringify(DEFAULT_REWARDS));
  }

  // Apply config to UI
  $('bp-season-name').value = bpConfig.season_name || '';
  $('bp-xp-multiplier').value = bpConfig.xp_multiplier ?? 1.0;
  $('bp-max-bonus').value = bpConfig.max_bonus ?? 10000;
  $('bp-rewards-visible').checked = bpConfig.rewards_visible !== false;

  renderBpStats();
  renderBpRewardsTable();
  renderBpPlayerProgress();
  loadHealerBonus();
}

function renderBpStats() {
  $('bp-total-rewards').textContent = bpConfig.rewards.length;

  const activePlayers = state.players.filter(p => !p.banned);
  let maxedCount = 0;
  let totalLevel = 0;

  activePlayers.forEach(p => {
    const bp = p.battlepass || {};
    const lvl = bp.level ?? 0;
    totalLevel += lvl;
    if (lvl >= 40) maxedCount++;
  });

  $('bp-players-maxed').textContent = maxedCount;
  $('bp-avg-level').textContent = activePlayers.length > 0
    ? (totalLevel / activePlayers.length).toFixed(1)
    : '0';
}

function renderBpRewardsTable() {
  const tbody = $('bp-rewards-tbody');
  if (!bpConfig.rewards.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay recompensas configuradas</p></td></tr>';
    return;
  }

  const sorted = [...bpConfig.rewards].sort((a, b) => a.level - b.level);
  tbody.innerHTML = sorted.map((r, i) =>
    '<tr>' +
      '<td><strong>' + r.level + '</strong></td>' +
      '<td>' + escapeHtml(r.label) + '</td>' +
      '<td style="max-width:300px;font-size:.85em;color:var(--text-muted);">' + escapeHtml(r.desc) + '</td>' +
      '<td>' + (r.image ? '<img src="assets/rewards/' + escapeHtml(r.image) + '" style="height:40px;border-radius:4px;" onerror="this.style.display=\'none\'">' : '—') + '</td>' +
      '<td class="player-actions">' +
        '<button class="btn btn-sm" onclick="editBpReward(' + r.level + ')">✏️</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteBpReward(' + r.level + ')">🗑️</button>' +
      '</td>' +
    '</tr>'
  ).join('');
}

function renderBpPlayerProgress() {
  const container = $('bp-player-progress');
  const activePlayers = state.players.filter(p => !p.banned);

  if (!activePlayers.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay jugadores activos</p></div>';
    return;
  }

  const sorted = [...activePlayers].sort((a, b) => (b.battlepass?.total_xp || 0) - (a.battlepass?.total_xp || 0));

  container.innerHTML = sorted.slice(0, 20).map(p => {
    const bp = p.battlepass || {};
    const lvl = bp.level ?? 0;
    const xp = bp.total_xp ?? 0;
    const rankName = bp.rank_name || 'EXILIADO';
    const rankColor = RANK_COLORS[rankName] || 'var(--text-muted)';
    const pct = Math.min((lvl / 40) * 100, 100);

    return '<div class="problem-row" style="display:grid;grid-template-columns:140px 60px 80px 1fr 80px;align-items:center;gap:8px;">' +
      '<span class="name">' + escapeHtml(p.name) + '</span>' +
      '<span style="font-weight:700;">Nv.' + lvl + '</span>' +
      '<span style="color:' + rankColor + ';font-weight:600;font-size:.85em;">' + escapeHtml(rankName) + '</span>' +
      '<div style="height:8px;background:var(--bg-color);border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + rankColor + ';border-radius:4px;"></div></div>' +
      '<span style="font-size:.85em;color:var(--text-muted);">' + xp.toLocaleString() + ' XP</span>' +
    '</div>';
  }).join('');
}

function openBpRewardModal(existing) {
  const isEdit = !!existing;
  const title = isEdit ? 'Editar recompensa — Nivel ' + existing.level : 'Agregar recompensa';

  const imageOptions = ['PB1.png', 'PB2.png', 'PB3.png', 'PB3.2.png', 'PB4.png', 'PB5.png', 'PB6.png', 'PB7.png']
    .map(img => '<option value="' + img + '"' + (existing?.image === img ? ' selected' : '') + '>' + img + '</option>')
    .join('');

  const html =
    '<div class="form-group">' +
      '<label for="bp-reward-level">Nivel requerido</label>' +
      '<input class="input" type="number" id="bp-reward-level" min="0" max="40" value="' + (existing?.level ?? '') + '"' + (isEdit ? ' readonly' : '') + '>' +
    '</div>' +
    '<div class="form-group">' +
      '<label for="bp-reward-label">Nombre de la recompensa</label>' +
      '<input class="input" type="text" id="bp-reward-label" value="' + escapeHtml(existing?.label || '') + '" placeholder="Ej: Nivel 10 — Rango Penitente">' +
    '</div>' +
    '<div class="form-group">' +
      '<label for="bp-reward-desc">Descripción</label>' +
      '<textarea class="input" id="bp-reward-desc" rows="3" placeholder="Ej: 2k gold + 1 gema stat">' + escapeHtml(existing?.desc || '') + '</textarea>' +
    '</div>' +
    '<div class="form-group">' +
      '<label for="bp-reward-image">Imagen</label>' +
      '<select class="input" id="bp-reward-image">' +
        '<option value="">— Sin imagen —</option>' +
        imageOptions +
      '</select>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button class="btn" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="saveBpReward(' + (isEdit ? existing.level : -1) + ')">' + (isEdit ? 'Guardar' : 'Agregar') + '</button>' +
    '</div>';

  openModal(title, html);
}

function saveBpReward(editLevel) {
  const level = parseInt($('bp-reward-level').value, 10);
  const label = $('bp-reward-label').value.trim();
  const desc = $('bp-reward-desc').value.trim();
  const image = $('bp-reward-image').value;

  if (isNaN(level) || level < 0 || level > 40) {
    toast('Nivel debe estar entre 0 y 40', 'error');
    return;
  }
  if (!label) {
    toast('El nombre es obligatorio', 'error');
    return;
  }

  if (editLevel >= 0) {
    const idx = bpConfig.rewards.findIndex(r => r.level === editLevel);
    if (idx >= 0) {
      bpConfig.rewards[idx] = { level, label, desc, image };
    }
  } else {
    if (bpConfig.rewards.some(r => r.level === level)) {
      toast('Ya existe una recompensa para el nivel ' + level, 'error');
      return;
    }
    bpConfig.rewards.push({ level, label, desc, image });
  }

  closeModal();
  renderBpRewardsTable();
  renderBpStats();
  toast('Recompensa ' + (editLevel >= 0 ? 'actualizada' : 'agregada') + ' (recuerda guardar)', 'info');
}

function editBpReward(level) {
  const reward = bpConfig.rewards.find(r => r.level === level);
  if (reward) openBpRewardModal(reward);
}

function deleteBpReward(level) {
  if (!confirm('¿Eliminar la recompensa del nivel ' + level + '?')) return;
  bpConfig.rewards = bpConfig.rewards.filter(r => r.level !== level);
  renderBpRewardsTable();
  renderBpStats();
  toast('Recompensa eliminada (recuerda guardar)', 'info');
}

async function saveBattlePassConfig() {
  bpConfig.season_name = $('bp-season-name').value.trim();
  bpConfig.xp_multiplier = parseFloat($('bp-xp-multiplier').value) || 1.0;
  bpConfig.max_bonus = parseInt($('bp-max-bonus').value, 10) || 10000;
  bpConfig.rewards_visible = $('bp-rewards-visible').checked;

  try {
    await apiCall('/admin/battlepass-config', 'PUT', bpConfig);
    toast('Configuración del Pase de Batalla guardada', 'success');
  } catch (err) {
    toast('Error guardando: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  OFFICERS
// ══════════════════════════════════════════════════════════

let officersData = [];
let editingOfficerId = null;
let lookupCharName = '';
let lookupCharRealm = '';
let lookupVerified = false;

async function loadOfficers() {
  try {
    officersData = await apiCall('/admin/officers');
    if (!Array.isArray(officersData)) officersData = [];
    renderOfficersList();
  } catch (err) {
    $('officers-list').innerHTML = '<div class="empty-state"><p>Error cargando oficiales: ' + err.message + '</p></div>';
  }
}

function renderOfficersList() {
  const container = $('officers-list');
  if (!officersData.length) {
    container.innerHTML = '<div class="empty-state"><p>No hay oficiales configurados.</p></div>';
    return;
  }

  const sorted = [...officersData].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  let html = '<table style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">#</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">Jugador</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">Clase</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">Titulo</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">Lore</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--text-dim);">Acciones</th></tr></thead><tbody>';

  sorted.forEach(function(o, i) {
    var pd = o.player_data;
    var name = pd ? pd.name : o.player_id;
    var cls = pd ? (pd.class || '') : '';
    var lorePreview = o.lore ? (o.lore.length > 60 ? o.lore.substring(0, 60) + '...' : o.lore) : '<em style="color:var(--text-dim);">Sin lore</em>';
    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:8px;">' + (i + 1) + '</td>';
    html += '<td style="padding:8px;font-weight:600;">' + name + '</td>';
    html += '<td style="padding:8px;">' + cls + '</td>';
    html += '<td style="padding:8px;">' + (o.title || 'Oficial') + '</td>';
    html += '<td style="padding:8px;font-size:0.85em;">' + lorePreview + '</td>';
    html += '<td style="padding:8px;white-space:nowrap;">';
    html += '<button class="btn btn-sm" onclick="editOfficer(\'' + escapeForJsString(o.player_id) + '\')">✏️</button> ';
    html += '<button class="btn btn-sm btn-danger" onclick="removeOfficer(\'' + escapeForJsString(o.player_id) + '\')">🗑️</button>';
    html += '</td></tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function showOfficerForm(officer) {
  editingOfficerId = officer ? officer.player_id : null;
  lookupVerified = !!officer;
  var formCard = $('officer-form-card');
  formCard.style.display = 'block';

  var lookupGroup = $('officer-lookup-group');
  var resultDiv = $('officer-lookup-result');

  if (officer) {
    // Editing: hide lookup, show character info
    var pd = officer.player_data;
    var charLabel = pd ? (pd.name + ' - ' + (pd.class || '') + ' (' + (pd.realm_display || pd.realm) + ')') : officer.player_id;
    lookupGroup.style.display = 'block';
    $('officer-char-name').value = pd ? pd.name : '';
    $('officer-char-realm').value = pd ? (pd.realm_display || pd.realm) : '';
    $('officer-char-name').disabled = true;
    $('officer-char-realm').disabled = true;
    $('officer-lookup-btn').style.display = 'none';
    resultDiv.innerHTML = '<div style="padding:8px;background:var(--bg-tertiary);border-radius:6px;color:var(--text);">✅ ' + charLabel + '</div>';
    lookupCharName = pd ? pd.name : '';
    lookupCharRealm = pd ? (pd.realm_display || pd.realm) : '';
  } else {
    // Adding: show lookup inputs
    $('officer-char-name').value = '';
    $('officer-char-realm').value = "Quel'Thalas";
    $('officer-char-name').disabled = false;
    $('officer-char-realm').disabled = false;
    $('officer-lookup-btn').style.display = '';
    resultDiv.innerHTML = '';
    lookupCharName = '';
    lookupCharRealm = '';
    lookupVerified = false;
  }

  $('officer-title-input').value = officer ? (officer.title || '') : 'Oficial';
  $('officer-lore-input').value = officer ? (officer.lore || '') : '';
  $('officer-order-input').value = officer ? (officer.order ?? 0) : officersData.length;

  formCard.scrollIntoView({ behavior: 'smooth' });
}

function hideOfficerForm() {
  $('officer-form-card').style.display = 'none';
  editingOfficerId = null;
  lookupVerified = false;
  lookupCharName = '';
  lookupCharRealm = '';
  $('officer-lookup-result').innerHTML = '';
}

async function lookupOfficerChar() {
  var name = $('officer-char-name').value.trim();
  var realm = $('officer-char-realm').value.trim();
  var resultDiv = $('officer-lookup-result');

  if (!name || !realm) {
    toast('Ingresa nombre y realm del personaje', 'error');
    return;
  }

  resultDiv.innerHTML = '<div style="padding:8px;color:var(--text-dim);">🔄 Buscando en Blizzard API...</div>';

  try {
    var data = await apiCall('/admin/officers/lookup/' + encodeURIComponent(name) + '/' + encodeURIComponent(realm));
    if (data.error) {
      resultDiv.innerHTML = '<div style="padding:8px;color:#e74c3c;">❌ ' + data.error + '</div>';
      lookupVerified = false;
      return;
    }

    lookupCharName = name;
    lookupCharRealm = realm;
    lookupVerified = true;

    var avatarHtml = data.media && data.media.avatar ? '<img src="' + data.media.avatar + '" style="width:40px;height:40px;border-radius:50%;margin-right:10px;">' : '';
    resultDiv.innerHTML = '<div style="padding:10px;background:var(--bg-tertiary);border-radius:6px;display:flex;align-items:center;">'
      + avatarHtml
      + '<div><strong style="color:var(--accent);">' + (data.name || name) + '</strong> - '
      + (data.class || '?') + ' (' + (data.spec || '?') + ')<br>'
      + '<small style="color:var(--text-dim);">Lvl ' + (data.level || '?') + ' · iLvl ' + (data.ilvl || '?') + ' · ' + (data.race || '') + ' · ' + (data.faction || '') + '</small>'
      + '</div></div>';
  } catch (err) {
    resultDiv.innerHTML = '<div style="padding:8px;color:#e74c3c;">❌ Error: ' + err.message + '</div>';
    lookupVerified = false;
  }
}

async function saveOfficer() {
  var title = $('officer-title-input').value.trim();
  var lore = $('officer-lore-input').value.trim();
  var order = parseInt($('officer-order-input').value, 10) || 0;

  try {
    if (editingOfficerId) {
      await apiCall('/admin/officers/' + encodeURIComponent(editingOfficerId), 'PUT', { title: title, lore: lore, order: order });
      toast('Oficial actualizado', 'success');
    } else {
      if (!lookupVerified || !lookupCharName || !lookupCharRealm) {
        toast('Primero busca y verifica el personaje con el boton 🔍', 'error');
        return;
      }
      await apiCall('/admin/officers', 'POST', { character_name: lookupCharName, realm: lookupCharRealm, title: title, lore: lore, order: order });
      toast('Oficial agregado', 'success');
    }
    hideOfficerForm();
    await loadOfficers();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

window.editOfficer = function(playerId) {
  var officer = officersData.find(function(o) { return o.player_id === playerId; });
  if (officer) showOfficerForm(officer);
};

window.removeOfficer = async function(playerId) {
  if (!confirm('Quitar a este oficial?')) return;
  try {
    await apiCall('/admin/officers/' + encodeURIComponent(playerId), 'DELETE');
    toast('Oficial removido', 'success');
    await loadOfficers();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

// ══════════════════════════════════════════════════════════
//  HALL OF FAME (Salón de la Fama)
// ══════════════════════════════════════════════════════════

let hofData = { entries: [], video_url: '' };
let hofEditingIndex = -1;

const HOF_CATEGORIES = {
  weekly: { label: 'Jugador de la Semana', icon: '⚔️' },
  monthly: { label: 'Jugador del Mes', icon: '🏆' },
  gold: { label: 'Recompensa de Oro', icon: '💰' },
};

// Detecta si una URL es de YouTube y extrae el ID del video
function parseYouTubeId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Convierte cualquier URL a una URL embebible
function getEmbedUrl(url) {
  if (!url) return null;
  var ytId = parseYouTubeId(url);
  if (ytId) return 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&mute=1&loop=1&playlist=' + ytId;
  // Google Drive: extraer el file ID
  var gd = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) return 'https://drive.google.com/file/d/' + gd[1] + '/preview';
  // Streamable
  var st = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
  if (st) return 'https://streamable.com/e/' + st[1];
  return null;
}

// Detecta el tipo de video: 'youtube', 'embed' (drive/streamable), o 'direct'
function getVideoType(url) {
  if (!url) return 'direct';
  if (parseYouTubeId(url)) return 'youtube';
  if (getEmbedUrl(url)) return 'embed';
  return 'direct';
}

async function hofUploadVideo() {
  const fileInput = $('hof-video-file');
  const file = fileInput.files[0];
  if (!file) {
    toast('Selecciona un archivo de video primero', 'error');
    return;
  }

  const MAX_MB = 500;
  if (file.size > MAX_MB * 1024 * 1024) {
    toast('El archivo supera los ' + MAX_MB + 'MB', 'error');
    return;
  }

  const progressEl = $('hof-upload-progress');
  const barEl = $('hof-upload-bar');
  const statusEl = $('hof-upload-status');
  const btn = $('hof-upload-video-btn');

  progressEl.style.display = 'block';
  btn.disabled = true;
  barEl.style.width = '0%';

  const token = getToken();
  const filename = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = file.name.split('.').pop().toLowerCase();
  const extTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska' };
  const contentType = (file.type && file.type.startsWith('video/')) ? file.type : (extTypes[ext] || 'video/mp4');

  const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB por chunk
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Si el archivo es pequeño (<= 90MB) usa upload directo
  if (file.size <= 90 * 1024 * 1024) {
    statusEl.textContent = 'Subiendo... 0%';
    return new Promise(function(resolve) {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          barEl.style.width = pct + '%';
          statusEl.textContent = 'Subiendo... ' + pct + '%';
        }
      });
      xhr.addEventListener('load', function() {
        btn.disabled = false;
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.url) {
              $('hof-main-video').value = data.url;
              statusEl.textContent = '✅ Subido correctamente';
              barEl.style.width = '100%';
              toast('Video subido. Recuerda guardar los cambios.', 'success');
            }
          } catch (e) {
            statusEl.textContent = '❌ Error procesando respuesta';
            toast('Error procesando respuesta del servidor', 'error');
          }
        } else {
          var errMsg = '';
          try { errMsg = JSON.parse(xhr.responseText).error || ''; } catch(_) {}
          statusEl.textContent = '❌ Error ' + xhr.status + (errMsg ? ': ' + errMsg : '');
          toast('Error HTTP ' + xhr.status + (errMsg ? ': ' + errMsg : ''), 'error');
        }
        resolve();
      });
      xhr.addEventListener('error', function() {
        btn.disabled = false;
        statusEl.textContent = '❌ Error de red';
        toast('Error de red al subir. Verifica tu conexión.', 'error');
        resolve();
      });
      xhr.timeout = 180000;
      xhr.addEventListener('timeout', function() {
        btn.disabled = false;
        statusEl.textContent = '❌ Tiempo de espera agotado';
        toast('Subida muy lenta. Intenta con un archivo más pequeño.', 'error');
        resolve();
      });
      xhr.open('POST', API_URL + '/admin/upload-media');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('X-Filename', filename);
      xhr.send(file);
    });
  }

  // Archivos grandes: multipart upload en chunks de 25MB
  statusEl.textContent = 'Iniciando subida en ' + totalChunks + ' partes...';
  let uploadId, key;

  try {
    // 1. Init multipart
    const initRes = await fetch(API_URL + '/admin/upload-media/init', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': contentType,
        'X-Filename': filename,
      },
    });
    if (!initRes.ok) throw new Error('Init falló: HTTP ' + initRes.status);
    const initData = await initRes.json();
    uploadId = initData.uploadId;
    key = initData.key;

    // 2. Subir cada chunk
    const parts = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const partNum = i + 1;

      const pct = Math.round((i / totalChunks) * 100);
      barEl.style.width = pct + '%';
      statusEl.textContent = 'Subiendo parte ' + partNum + ' de ' + totalChunks + ' (' + pct + '%)';

      const partRes = await fetch(API_URL + '/admin/upload-media/part', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/octet-stream',
          'X-Upload-Id': uploadId,
          'X-Upload-Key': key,
          'X-Part-Number': String(partNum),
        },
        body: chunk,
      });
      if (!partRes.ok) {
        const errData = await partRes.json().catch(() => ({}));
        throw new Error('Parte ' + partNum + ' falló: HTTP ' + partRes.status + (errData.error ? ' - ' + errData.error : ''));
      }
      const partData = await partRes.json();
      parts.push({ partNumber: partData.partNumber, etag: partData.etag });
    }

    // 3. Complete multipart
    barEl.style.width = '95%';
    statusEl.textContent = 'Finalizando...';
    const completeRes = await fetch(API_URL + '/admin/upload-media/complete', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uploadId, key, parts }),
    });
    if (!completeRes.ok) throw new Error('Complete falló: HTTP ' + completeRes.status);
    const completeData = await completeRes.json();

    $('hof-main-video').value = completeData.url;
    barEl.style.width = '100%';
    statusEl.textContent = '✅ Subido correctamente (' + totalChunks + ' partes)';
    toast('Video subido correctamente. Recuerda guardar los cambios.', 'success');

  } catch (err) {
    // Abortar si tenemos uploadId
    if (uploadId && key) {
      fetch(API_URL + '/admin/upload-media/abort', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key }),
      }).catch(() => {});
    }
    statusEl.textContent = '❌ ' + err.message;
    toast('Error al subir: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function hofUploadEntryVideo() {
  const fileInput = $('hof-entry-video-file');
  const file = fileInput.files[0];
  if (!file) { toast('Selecciona un archivo de video primero', 'error'); return; }

  const MAX_MB = 500;
  if (file.size > MAX_MB * 1024 * 1024) { toast('El archivo supera los ' + MAX_MB + 'MB', 'error'); return; }

  const progressEl = $('hof-entry-upload-progress');
  const barEl = $('hof-entry-upload-bar');
  const statusEl = $('hof-entry-upload-status');
  const btn = $('hof-entry-upload-btn');

  progressEl.style.display = 'block';
  btn.disabled = true;
  barEl.style.width = '0%';

  const token = getToken();
  const filename = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = file.name.split('.').pop().toLowerCase();
  const extTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska' };
  const contentType = (file.type && file.type.startsWith('video/')) ? file.type : (extTypes[ext] || 'video/mp4');
  const CHUNK_SIZE = 25 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  if (file.size <= 90 * 1024 * 1024) {
    statusEl.textContent = 'Subiendo... 0%';
    return new Promise(function(resolve) {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          barEl.style.width = pct + '%';
          statusEl.textContent = 'Subiendo... ' + pct + '%';
        }
      });
      xhr.addEventListener('load', function() {
        btn.disabled = false;
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.url) {
              $('hof-entry-video-url').value = data.url;
              statusEl.textContent = '✅ Subido correctamente';
              barEl.style.width = '100%';
              toast('Video del jugador subido.', 'success');
            }
          } catch (e) {
            statusEl.textContent = '❌ Error procesando respuesta';
            toast('Error procesando respuesta', 'error');
          }
        } else {
          var errMsg = '';
          try { errMsg = JSON.parse(xhr.responseText).error || ''; } catch(_) {}
          statusEl.textContent = '❌ Error ' + xhr.status + (errMsg ? ': ' + errMsg : '');
          toast('Error HTTP ' + xhr.status + (errMsg ? ': ' + errMsg : ''), 'error');
        }
        resolve();
      });
      xhr.addEventListener('error', function() {
        btn.disabled = false;
        statusEl.textContent = '❌ Error de red';
        toast('Error de red al subir.', 'error');
        resolve();
      });
      xhr.timeout = 180000;
      xhr.addEventListener('timeout', function() {
        btn.disabled = false;
        statusEl.textContent = '❌ Tiempo de espera agotado';
        resolve();
      });
      xhr.open('POST', API_URL + '/admin/upload-media');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('X-Filename', filename);
      xhr.send(file);
    });
  }

  // Multipart para archivos grandes
  statusEl.textContent = 'Iniciando subida en ' + totalChunks + ' partes...';
  let uploadId, key;
  try {
    const initRes = await fetch(API_URL + '/admin/upload-media/init', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': contentType, 'X-Filename': filename },
    });
    if (!initRes.ok) throw new Error('Init falló: HTTP ' + initRes.status);
    const initData = await initRes.json();
    uploadId = initData.uploadId; key = initData.key;

    const parts = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
      const pct = Math.round((i / totalChunks) * 100);
      barEl.style.width = pct + '%';
      statusEl.textContent = 'Subiendo parte ' + (i + 1) + ' de ' + totalChunks + ' (' + pct + '%)';
      const partRes = await fetch(API_URL + '/admin/upload-media/part', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/octet-stream', 'X-Upload-Id': uploadId, 'X-Upload-Key': key, 'X-Part-Number': String(i + 1) },
        body: chunk,
      });
      if (!partRes.ok) { const d = await partRes.json().catch(() => ({})); throw new Error('Parte ' + (i+1) + ' falló: ' + partRes.status + (d.error ? ' - ' + d.error : '')); }
      const partData = await partRes.json();
      parts.push({ partNumber: partData.partNumber, etag: partData.etag });
    }

    barEl.style.width = '95%';
    statusEl.textContent = 'Finalizando...';
    const completeRes = await fetch(API_URL + '/admin/upload-media/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, key, parts }),
    });
    if (!completeRes.ok) throw new Error('Complete falló: HTTP ' + completeRes.status);
    const completeData = await completeRes.json();

    $('hof-entry-video-url').value = completeData.url;
    barEl.style.width = '100%';
    statusEl.textContent = '✅ Subido correctamente (' + totalChunks + ' partes)';
    toast('Video del jugador subido.', 'success');
  } catch (err) {
    if (uploadId && key) {
      fetch(API_URL + '/admin/upload-media/abort', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key }),
      }).catch(() => {});
    }
    statusEl.textContent = '❌ ' + err.message;
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function hofPreviewVideo() {
  var url = $('hof-main-video').value.trim();
  var previewContainer = $('hof-video-preview');
  var inner = $('hof-video-preview-inner');

  if (!url) {
    previewContainer.style.display = 'none';
    toast('Ingresa una URL de video', 'error');
    return;
  }

  previewContainer.style.display = 'block';
  var embedUrl = getEmbedUrl(url);

  if (embedUrl) {
    inner.innerHTML = '<iframe src="' + embedUrl + '" style="width:100%;height:100%;border:0;" allow="autoplay;encrypted-media" allowfullscreen></iframe>';
  } else {
    inner.innerHTML = '<video src="' + escapeHtml(url) + '" style="width:100%;height:100%;object-fit:cover;" autoplay muted loop playsinline></video>';
  }

  toast('Vista previa cargada', 'success');
}

async function loadHallOfFame() {
  try {
    const data = await apiCall('/admin/hall-of-fame');
    hofData = data && Array.isArray(data.entries) ? data : { entries: [] };
    if (!hofData.video_url) hofData.video_url = '';
    $('hof-main-video').value = hofData.video_url || '';
    renderHofEntries();
  } catch (err) {
    $('hof-entries-list').innerHTML = '<div class="empty-state"><p>Error cargando: ' + err.message + '</p></div>';
  }
}

function renderHofEntries() {
  const container = $('hof-entries-list');
  if (!hofData.entries.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏛️</div><p>No hay jugadores destacados. Agrega el primero.</p></div>';
    return;
  }

  let html = '<div style="display:flex;flex-direction:column;gap:12px;">';

  hofData.entries.forEach(function(entry, i) {
    var cat = HOF_CATEGORIES[entry.category] || { label: entry.category, icon: '🏛️' };
    var dateStr = entry.featured_at ? new Date(entry.featured_at).toLocaleDateString('es') : '—';
    var isFeatured = i === 0;
    var avatarSrc = entry.player_avatar || 'assets/logo.png';
    var hasVideo = !!(entry.entry_video_url);
    var videoThumb = '';
    if (hasVideo) {
      var ytId = entry.entry_video_url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytId) {
        videoThumb = '<img src="https://img.youtube.com/vi/' + ytId[1] + '/mqdefault.jpg" style="width:80px;height:45px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;" alt="video">';
      } else {
        videoThumb = '<div style="width:80px;height:45px;background:var(--bg-color);border-radius:4px;border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.7em;color:var(--accent);">▶ MP4</div>';
      }
    }

    html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid ' + (isFeatured ? 'var(--accent)' : 'var(--border)') + ';">';

    // Número y avatar
    html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:40px;">';
    html += '<span style="font-size:.75em;color:var(--text-dim);">#' + (i + 1) + '</span>';
    html += '<img src="' + escapeHtml(avatarSrc) + '" style="width:36px;height:36px;border-radius:50%;border:2px solid ' + (isFeatured ? 'var(--accent)' : 'var(--border)') + ';" onerror="this.src=\'assets/logo.png\'">';
    html += '</div>';

    // Video miniatura
    if (hasVideo) {
      html += '<div style="flex-shrink:0;">' + videoThumb + '</div>';
    }

    // Info del jugador
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
    html += '<strong style="color:var(--text-main);">' + escapeHtml(entry.player_name || '—') + '</strong>';
    if (isFeatured) html += '<span style="background:var(--accent);color:var(--bg-color);font-size:.65em;padding:1px 6px;border-radius:3px;font-weight:700;">★ DESTACADO</span>';
    html += '<span style="font-size:.8em;color:var(--text-muted);">' + cat.icon + ' ' + cat.label + '</span>';
    html += '</div>';

    if (entry.achievement) {
      html += '<div style="font-size:.8em;color:var(--accent);margin-top:2px;">🏅 ' + escapeHtml(entry.achievement) + (entry.rating ? ' · <strong>' + entry.rating + '</strong> rating' : '') + '</div>';
    } else if (entry.rating) {
      html += '<div style="font-size:.8em;color:var(--accent);margin-top:2px;">⚔️ Rating: <strong>' + entry.rating + '</strong></div>';
    }

    if (entry.reason) {
      html += '<div style="font-size:.82em;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">' + escapeHtml(entry.reason) + '</div>';
    }
    html += '<div style="font-size:.75em;color:var(--text-dim);margin-top:2px;">📅 ' + dateStr + ' · ' + escapeHtml(entry.player_class || '') + (entry.player_realm ? ' · ' + escapeHtml(entry.player_realm) : '') + '</div>';
    html += '</div>';

    // Acciones
    html += '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">';
    html += '<div style="display:flex;gap:4px;">';
    if (i > 0) html += '<button class="btn btn-sm" title="Subir" onclick="hofMoveUp(' + i + ')">⬆️</button>';
    if (i < hofData.entries.length - 1) html += '<button class="btn btn-sm" title="Bajar" onclick="hofMoveDown(' + i + ')">⬇️</button>';
    html += '</div>';
    html += '<button class="btn btn-sm" onclick="hofEdit(' + i + ')">✏️ Editar</button>';
    html += '<button class="btn btn-sm btn-danger" onclick="hofRemove(' + i + ')">🗑️ Quitar</button>';
    html += '</div>';

    html += '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

function showHofForm(entry, editIndex) {
  hofEditingIndex = editIndex !== undefined ? editIndex : -1;
  var formCard = $('hof-form-card');
  formCard.style.display = 'block';

  $('hof-form-title').textContent = hofEditingIndex >= 0 ? 'Editar jugador destacado' : 'Agregar jugador destacado';
  $('hof-form-save-btn').textContent = hofEditingIndex >= 0 ? '💾 Guardar' : '💾 Agregar';

  var select = $('hof-player-select');
  select.innerHTML = '<option value="">— Seleccionar jugador —</option>';
  var activePlayers = state.players.filter(function(p) { return !p.banned; });
  activePlayers.sort(function(a, b) { return a.name.localeCompare(b.name); });
  activePlayers.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name + ' — ' + (p.realm_display || p.realm) + ' (' + (p.class || '?') + ')';
    select.appendChild(opt);
  });

  if (entry) {
    select.value = entry.player_id || '';
    $('hof-category').value = entry.category || 'weekly';
    $('hof-reason').value = entry.reason || '';
    $('hof-achievement').value = entry.achievement || '';
    $('hof-rating').value = entry.rating || '';
    $('hof-entry-video-url').value = entry.entry_video_url || '';
  } else {
    select.value = '';
    $('hof-category').value = 'weekly';
    $('hof-reason').value = '';
    $('hof-achievement').value = '';
    $('hof-rating').value = '';
    $('hof-entry-video-url').value = '';
  }
  $('hof-entry-video-file').value = '';
  $('hof-entry-upload-progress').style.display = 'none';

  formCard.scrollIntoView({ behavior: 'smooth' });
}

function hideHofForm() {
  $('hof-form-card').style.display = 'none';
  hofEditingIndex = -1;
}

function hofFormSave() {
  var playerId = $('hof-player-select').value;
  var category = $('hof-category').value;
  var reason = $('hof-reason').value.trim();

  if (!playerId) {
    toast('Selecciona un jugador', 'error');
    return;
  }

  var player = state.players.find(function(p) { return p.id === playerId; });
  var playerName = player ? player.name : playerId;
  var playerAvatar = player && player.media ? player.media.avatar : '';
  var playerClass = player ? player.class : '';
  var playerRealm = player ? (player.realm_display || player.realm) : '';

  var achievement = $('hof-achievement').value.trim();
  var rating = parseInt($('hof-rating').value, 10) || 0;
  var entryVideoUrl = $('hof-entry-video-url').value.trim();

  var entry = {
    player_id: playerId,
    player_name: playerName,
    player_avatar: playerAvatar,
    player_class: playerClass,
    player_realm: playerRealm,
    category: category,
    reason: reason,
    achievement: achievement,
    rating: rating || undefined,
    entry_video_url: entryVideoUrl || undefined,
    featured_at: new Date().toISOString(),
  };

  if (hofEditingIndex >= 0) {
    entry.featured_at = hofData.entries[hofEditingIndex].featured_at || entry.featured_at;
    hofData.entries[hofEditingIndex] = entry;
  } else {
    hofData.entries.unshift(entry);
  }

  hideHofForm();
  renderHofEntries();
  toast('Jugador ' + (hofEditingIndex >= 0 ? 'actualizado' : 'agregado') + ' (recuerda guardar)', 'info');
}

async function saveHallOfFame() {
  hofData.video_url = $('hof-main-video').value.trim();
  try {
    await apiCall('/admin/hall-of-fame', 'PUT', hofData);
    toast('Salón de la Fama guardado', 'success');
  } catch (err) {
    toast('Error guardando: ' + err.message, 'error');
  }
}

window.hofEdit = function(index) {
  var entry = hofData.entries[index];
  if (entry) showHofForm(entry, index);
};

window.hofRemove = function(index) {
  var entry = hofData.entries[index];
  if (!confirm('¿Quitar a ' + (entry.player_name || '?') + ' del Salón de la Fama?')) return;
  hofData.entries.splice(index, 1);
  renderHofEntries();
  toast('Jugador removido (recuerda guardar)', 'info');
};

window.hofMoveUp = function(index) {
  if (index <= 0) return;
  var temp = hofData.entries[index];
  hofData.entries[index] = hofData.entries[index - 1];
  hofData.entries[index - 1] = temp;
  renderHofEntries();
};

window.hofMoveDown = function(index) {
  if (index >= hofData.entries.length - 1) return;
  var temp = hofData.entries[index];
  hofData.entries[index] = hofData.entries[index + 1];
  hofData.entries[index + 1] = temp;
  renderHofEntries();
};

// ══════════════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════════════

async function loadAnalytics() {
  try {
    const data = await apiCall('/admin/analytics');
    renderAnalytics(data);
  } catch (err) {
    toast('Error cargando analíticas: ' + err.message, 'error');
  }
}

function renderAnalytics(data) {
  const total = data?.total || 0;
  const daily = data?.daily || {};
  const today = new Date().toISOString().slice(0, 10);

  // Calcular stats
  const todayViews = daily[today] || 0;

  // Últimos 7 días
  let weekViews = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    weekViews += daily[key] || 0;
  }

  const avg7d = weekViews > 0 ? (weekViews / 7).toFixed(1) : '0';

  $('analytics-total').textContent = total.toLocaleString();
  $('analytics-today').textContent = todayViews.toLocaleString();
  $('analytics-week').textContent = weekViews.toLocaleString();
  $('analytics-avg').textContent = avg7d;

  // Chart: últimos 14 días
  const chartEl = $('analytics-chart');
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, views: daily[key] || 0 });
  }

  const maxViews = Math.max(...days.map(d => d.views), 1);

  chartEl.innerHTML = days.map(d => {
    const pct = Math.max((d.views / maxViews) * 100, 2);
    const isToday = d.date === today;
    const label = d.date.slice(5); // MM-DD
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
      '<span style="font-size:.75em;color:var(--text-muted);">' + d.views + '</span>' +
      '<div style="width:100%;height:' + pct.toFixed(0) + '%;min-height:3px;background:' + (isToday ? 'var(--primary)' : 'var(--accent)') + ';border-radius:3px 3px 0 0;transition:height .3s;"></div>' +
      '<span style="font-size:.65em;color:var(--text-dim);writing-mode:vertical-lr;transform:rotate(180deg);height:40px;">' + label + '</span>' +
    '</div>';
  }).join('');

  // Table
  const tableEl = $('analytics-table');
  const recentDays = days.slice().reverse().slice(0, 7);
  tableEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:.85em;">' +
    '<thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid var(--border);color:var(--text-dim);">Fecha</th>' +
    '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--border);color:var(--text-dim);">Visitas</th></tr></thead>' +
    '<tbody>' + recentDays.map(d =>
      '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:6px;">' + d.date + (d.date === today ? ' <span style="color:var(--primary);font-weight:600;">(hoy)</span>' : '') + '</td>' +
        '<td style="padding:6px;text-align:right;font-weight:600;">' + d.views + '</td>' +
      '</tr>'
    ).join('') + '</tbody></table>';
}

// ══════════════════════════════════════════════════════════
//  HEALER BONUS
// ══════════════════════════════════════════════════════════

async function loadHealerBonus() {
  try {
    const data = await apiCall('/admin/healer-bonus');
    $('healer-bonus-enabled').checked = !!data.enabled;
    $('healer-bonus-multiplier').value = String(data.multiplier || 2);
    renderHealerBonusStatus(data);
  } catch (_) {}
}

function renderHealerBonusStatus(config) {
  const el = $('healer-bonus-status');
  if (!config || !config.enabled) {
    el.innerHTML = '<span style="color:var(--text-muted);">Bonus healer desactivado — los healers reciben XP normal.</span>';
  } else {
    // Contar healers activos
    const healerSpecs = ['Holy', 'Discipline', 'Restoration', 'Mistweaver', 'Preservation'];
    const healers = state.players.filter(p => !p.banned && healerSpecs.includes(p.spec));
    el.innerHTML = '<span style="color:var(--success);font-weight:600;">Activo: x' + config.multiplier + ' XP RBG para healers</span>' +
      '<br><span style="color:var(--text-muted);font-size:.85em;">' + healers.length + ' healer(s) inscritos se benefician: ' +
      (healers.length > 0 ? healers.map(h => h.name).join(', ') : 'ninguno') + '</span>';
  }
}

async function saveHealerBonus() {
  const enabled = $('healer-bonus-enabled').checked;
  const multiplier = parseInt($('healer-bonus-multiplier').value, 10) || 2;

  try {
    const result = await apiCall('/admin/healer-bonus', 'PUT', { enabled, multiplier });
    toast('Healer bonus ' + (enabled ? 'activado x' + multiplier : 'desactivado'), 'success');
    renderHealerBonusStatus(result.config || { enabled, multiplier });
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  // Login
  $('login-btn').addEventListener('click', handleLogin);
  $('login-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleLogin();
  });

  // Logout
  $('logout-btn').addEventListener('click', logout);

  // Mobile hamburger
  $('hamburger-btn')?.addEventListener('click', function() {
    $('sidebar').classList.toggle('open');
  });

  // Sidebar navigation
  $('sidebar-nav').addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Modal close
  $('modal-close').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  // Tab: Players
  $('refresh-players-btn').addEventListener('click', loadPlayersData);
  $('inscribir-btn').addEventListener('click', openInscribirModal);
  $('player-search').addEventListener('input', renderPlayersTable);
  $('player-filter').addEventListener('change', renderPlayersTable);

  // Tab: Sync
  $('mass-sync-btn').addEventListener('click', massSync);

  // Tab: XP
  $('xp-player-select').addEventListener('change', function() {
    renderXpPlayerInfo(this.value);
  });
  $('apply-xp-btn').addEventListener('click', applyXpAdjust);
  $('title-legend-btn').addEventListener('click', function() { grantTitle('legend'); });
  $('title-gladiator-btn').addEventListener('click', function() { grantTitle('gladiator'); });

  // Tab: Marriages
  $('marry-btn').addEventListener('click', marryPlayers);

  // Tab: Announcement
  $('publish-announce-btn').addEventListener('click', publishAnnouncement);
  $('delete-announce-btn').addEventListener('click', deleteAnnouncement);
  $('announce-message').addEventListener('input', updateAnnouncePreview);
  $('announce-type').addEventListener('change', updateAnnouncePreview);

  // Tab: Export
  $('generate-export-btn').addEventListener('click', generateExport);
  $('copy-export-btn').addEventListener('click', copyExport);

  // Tab: Season
  $('season-understand')?.addEventListener('change', validateSeasonClose);
  $('season-confirm-text')?.addEventListener('input', validateSeasonClose);
  $('close-season-btn').addEventListener('click', closeSeason);

  // Tab: Battle Pass
  $('bp-add-reward-btn').addEventListener('click', function() { openBpRewardModal(null); });
  $('bp-save-btn').addEventListener('click', saveBattlePassConfig);

  // Tab: Officers
  $('add-officer-btn').addEventListener('click', function() { showOfficerForm(null); });
  $('officer-lookup-btn').addEventListener('click', lookupOfficerChar);
  $('officer-save-btn').addEventListener('click', saveOfficer);
  $('officer-cancel-btn').addEventListener('click', hideOfficerForm);

  // Tab: Hall of Fame
  $('hof-add-btn').addEventListener('click', function() { showHofForm(null); });
  $('hof-save-btn').addEventListener('click', saveHallOfFame);
  $('hof-form-save-btn').addEventListener('click', hofFormSave);
  $('hof-form-cancel-btn').addEventListener('click', hideHofForm);
  $('hof-preview-video-btn').addEventListener('click', hofPreviewVideo);
  $('hof-upload-video-btn').addEventListener('click', hofUploadVideo);
  $('hof-entry-upload-btn').addEventListener('click', hofUploadEntryVideo);

  // Tab: Analytics
  $('refresh-analytics-btn').addEventListener('click', loadAnalytics);

  // Tab: Battle Pass - Healer Bonus
  $('save-healer-bonus-btn').addEventListener('click', saveHealerBonus);

  // Tab: N8N
  $('n8n-save-btn').addEventListener('click', saveN8nConfig);
  $('n8n-test-btn').addEventListener('click', testN8nWebhook);

  // Tab: Errors
  $('clear-errors-btn').addEventListener('click', clearErrors);

  // Tab: Boost Orders
  $('refresh-boost-orders-btn').addEventListener('click', loadBoostOrders);
  $('boost-banner-show-btn').addEventListener('click', () => setBoostBannerVisible(true));
  $('boost-banner-hide-btn').addEventListener('click', () => setBoostBannerVisible(false));

  // Tab: Boost Boosters
  $('refresh-boosters-btn').addEventListener('click', loadBoostBoosters);

  // Tab: Boost Clients
  $('refresh-boost-clients-btn').addEventListener('click', loadBoostClients);

  // Check existing session
  checkSession();
});

// ══════════════════════════════════════════════════════════
//  N8N / DISCORD
// ══════════════════════════════════════════════════════════

const N8N_WORKFLOW_JSON = JSON.stringify({
  "name": "Exilium Rating Milestones → Discord",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "exilium-milestone",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300],
      "webhookId": "exilium-milestone"
    },
    {
      "parameters": {
        "mode": "manual",
        "assignments": {
          "assignments": [
            { "id": "a1", "name": "player_name", "value": "={{ $json.body.player_name }}", "type": "string" },
            { "id": "a2", "name": "player_class", "value": "={{ $json.body.player_class }}", "type": "string" },
            { "id": "a3", "name": "player_realm", "value": "={{ $json.body.player_realm }}", "type": "string" },
            { "id": "a4", "name": "bracket", "value": "={{ $json.body.bracket }}", "type": "string" },
            { "id": "a5", "name": "rating", "value": "={{ $json.body.rating }}", "type": "number" },
            { "id": "a6", "name": "milestone", "value": "={{ $json.body.milestone }}", "type": "number" },
            { "id": "a7", "name": "message", "value": "=⚔️ **{{ $json.body.player_name }}** ({{ $json.body.player_class }} — {{ $json.body.player_realm }}) alcanzó **{{ $json.body.milestone }}** en **{{ $json.body.bracket }}**! Rating actual: **{{ $json.body.rating }}**", "type": "string" }
          ]
        },
        "options": {}
      },
      "id": "set-message",
      "name": "Prepare Message",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [460, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "PEGA_AQUI_TU_DISCORD_WEBHOOK",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={ \"content\": \"{{ $json.message }}\", \"username\": \"Exilium Bot\" }",
        "options": {}
      },
      "id": "discord-node",
      "name": "Send to Discord",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={ \"ok\": true }"
      },
      "id": "respond-node",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [900, 300]
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Prepare Message", "type": "main", "index": 0 }]] },
    "Prepare Message": { "main": [[{ "node": "Send to Discord", "type": "main", "index": 0 }]] },
    "Send to Discord": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": { "executionOrder": "v1" }
}, null, 2);

async function loadN8nConfig() {
  try {
    const data = await apiCall('/admin/n8n-config');
    $('n8n-webhook-url').value = data.webhook_url || '';
    $('n8n-discord-url').value = data.discord_webhook_url || '';
  } catch (_) {}
  $('n8n-workflow-json').value = N8N_WORKFLOW_JSON;
}

async function saveN8nConfig() {
  const webhookUrl = $('n8n-webhook-url').value.trim();
  const discordUrl = $('n8n-discord-url').value.trim();
  const statusEl = $('n8n-status');
  try {
    await apiCall('/admin/n8n-config', 'PUT', { webhook_url: webhookUrl, discord_webhook_url: discordUrl });
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = '✅ Configuración guardada correctamente';
    toast('N8N configurado', 'success');
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ Error: ' + err.message;
    toast('Error guardando: ' + err.message, 'error');
  }
}

async function testN8nWebhook() {
  const statusEl = $('n8n-status');
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.textContent = '⏳ Enviando prueba al webhook...';
  try {
    const data = await apiCall('/admin/n8n-test', 'POST');
    if (data.ok) {
      statusEl.style.color = 'var(--success)';
      statusEl.textContent = '✅ Webhook respondió OK (status ' + data.status + ') — revisa tu canal de Discord';
      toast('Webhook enviado correctamente', 'success');
    } else {
      statusEl.style.color = 'var(--warning)';
      statusEl.textContent = '⚠️ Webhook respondió con status ' + data.status + ' — revisa la URL';
      toast('El webhook respondió con error ' + data.status, 'error');
    }
  } catch (err) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ ' + (err.message || 'Error al probar el webhook');
    toast('Error: ' + err.message, 'error');
  }
}

window.copyN8nWorkflow = function() {
  const ta = $('n8n-workflow-json');
  ta.select();
  document.execCommand('copy');
  toast('JSON del workflow copiado al portapapeles', 'success');
};

// ══════════════════════════════════════════════════════════
//  BOOSTING ECOSYSTEM — PEDIDOS CARRY
// ══════════════════════════════════════════════════════════

let _boostOrders = [];

const ORDER_STATUS_LABELS = {
  pending:     { label: '⏳ Pendiente',   color: '#eab308' },
  claimed:     { label: '🔒 Reclamado',   color: '#3b82f6' },
  in_progress: { label: '▶️ En progreso', color: '#8b5cf6' },
  completed:   { label: '✅ Completado',  color: '#22c55e' },
  cancelled:   { label: '❌ Cancelado',   color: '#ef4444' },
};

async function loadBoostBannerStatus() {
  try {
    const data = await apiCall('/admin/boost-banner');
    const badge = $('boost-banner-status-badge');
    if (data.visible) {
      badge.textContent = 'VISIBLE';
      badge.style.background = 'rgba(34,197,94,.15)';
      badge.style.color = '#22c55e';
      badge.style.border = '1px solid rgba(34,197,94,.3)';
    } else {
      badge.textContent = 'OCULTO';
      badge.style.background = 'rgba(239,68,68,.15)';
      badge.style.color = '#ef4444';
      badge.style.border = '1px solid rgba(239,68,68,.3)';
    }
  } catch (_) {}
}

async function setBoostBannerVisible(visible) {
  try {
    await apiCall('/admin/boost-banner', 'PUT', { visible });
    toast(visible ? '✅ Banner de boosting activado' : '🔴 Banner de boosting ocultado', visible ? 'success' : 'info');
    loadBoostBannerStatus();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function loadBoostOrders() {
  const tbody = $('boost-orders-tbody');
  tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>Cargando...</p></td></tr>';
  loadBoostBannerStatus();
  try {
    const data = await apiCall('/admin/boost/orders');
    _boostOrders = Array.isArray(data) ? data : (data.orders || []);
    renderBoostOrders(_boostOrders);
    // Stats
    $('bos-total').textContent     = _boostOrders.length;
    $('bos-pending').textContent   = _boostOrders.filter(o => o.status === 'pending').length;
    $('bos-active').textContent    = _boostOrders.filter(o => o.status === 'claimed' || o.status === 'in_progress').length;
    $('bos-completed').textContent = _boostOrders.filter(o => o.status === 'completed').length;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state"><p>Error: ${escapeHtml(err.message)}</p></td></tr>`;
  }
}

function filterBoostOrders(status) {
  const filtered = status === 'all' ? _boostOrders : _boostOrders.filter(o => o.status === status);
  renderBoostOrders(filtered);
}

function renderBoostOrders(orders) {
  const tbody = $('boost-orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>No hay pedidos.</p></td></tr>';
    return;
  }
  tbody.innerHTML = orders.map((o, i) => {
    const st = ORDER_STATUS_LABELS[o.status] || { label: o.status, color: '#7a7a8e' };
    const mode = o.delivery_mode === 'piloted' ? '🎮 Piloted' : '🧍 Selfplay';
    const pay  = o.payment_method === 'usd' ? `$${o.price_usd}` : `${o.price_gold} oro`;
    return `<tr>
      <td style="color:var(--text-muted);font-size:.78rem;">${i + 1}</td>
      <td><strong style="font-size:.85rem;">${escapeHtml(o.service_name)}</strong></td>
      <td style="font-size:.82rem;">${escapeHtml(o.client_username || '—')}</td>
      <td style="font-size:.82rem;">${escapeHtml(o.char_name)}${o.char_realm ? `<br><span style="color:var(--text-muted);font-size:.72rem;">${escapeHtml(o.char_realm)}</span>` : ''}</td>
      <td style="font-size:.78rem;">${mode}</td>
      <td style="font-size:.82rem;">${pay}</td>
      <td><span style="color:${st.color};font-size:.8rem;font-weight:700;">${st.label}</span></td>
      <td style="font-size:.82rem;">${escapeHtml(o.booster_username || '—')}</td>
      <td style="font-size:.75rem;color:var(--text-muted);">${timeAgo(o.created_at)}</td>
      <td>
        <button class="btn" style="font-size:.72rem;padding:.25rem .55rem;" onclick="openBoostOrderDetail('${escapeForJsString(o.id)}')">👁️ Ver</button>
      </td>
    </tr>`;
  }).join('');
}

window.openBoostOrderDetail = function(orderId) {
  const o = _boostOrders.find(x => x.id === orderId);
  if (!o) return;
  const st = ORDER_STATUS_LABELS[o.status] || { label: o.status, color: '#7a7a8e' };
  const notes = (o.progress_notes || []).map(n =>
    `<li style="margin-bottom:6px;font-size:.82rem;color:var(--text-muted);">[${n.at ? new Date(n.at).toLocaleString('es') : '—'}] ${escapeHtml(n.text)}</li>`
  ).join('') || '<li style="color:var(--text-muted);">Sin notas</li>';

  openModal('📋 Pedido: ' + o.service_name, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Estado</label>
        <div style="color:${st.color};font-weight:700;">${st.label}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Pedido</label>
        <div style="font-size:.75rem;font-family:monospace;">${escapeHtml(o.id)}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Cliente</label>
        <div>${escapeHtml(o.client_username || '—')}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Booster</label>
        <div>${escapeHtml(o.booster_username || '—')}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Personaje</label>
        <div>${escapeHtml(o.char_name)} — ${escapeHtml(o.char_realm || '?')}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Modo</label>
        <div>${o.delivery_mode === 'piloted' ? '🎮 Piloted' : '🧍 Selfplay'}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Pago</label>
        <div>${o.payment_method === 'usd' ? '$' + o.price_usd + ' USD' : o.price_gold + ' oro'}</div></div>
      <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Rating objetivo</label>
        <div>${escapeHtml(o.target_rating || '—')}</div></div>
    </div>
    ${o.notes ? `<div style="margin-bottom:12px;"><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Notas del cliente</label><div style="background:var(--bg-secondary);border-radius:6px;padding:8px;font-size:.82rem;margin-top:4px;">${escapeHtml(o.notes)}</div></div>` : ''}
    <div><label style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;">Notas de progreso</label>
      <ul style="list-style:none;padding:0;margin-top:6px;">${notes}</ul>
    </div>
    <div style="display:flex;gap:6px;margin-top:16px;flex-wrap:wrap;">
      <span style="font-size:.75rem;color:var(--text-muted);">Creado: ${o.created_at ? new Date(o.created_at).toLocaleString('es') : '—'}</span>
      ${o.completed_at ? `<span style="font-size:.75rem;color:var(--text-muted);">Completado: ${new Date(o.completed_at).toLocaleString('es')}</span>` : ''}
    </div>
  `);
};

// ══════════════════════════════════════════════════════════
//  BOOSTING ECOSYSTEM — BOOSTERS
// ══════════════════════════════════════════════════════════

const BOOSTER_TIER_COLORS = {
  bronze: '#cd7f32', silver: '#9ca3af', gold: '#d4a017', elite: '#8b5cf6',
};

async function loadBoostBoosters() {
  $('boost-applications-list').innerHTML = '<div class="empty-state"><p>Cargando...</p></div>';
  $('boost-boosters-tbody').innerHTML = '<tr><td colspan="8" class="empty-state"><p>Cargando...</p></td></tr>';
  try {
    const [appsData, boostersData] = await Promise.all([
      apiCall('/admin/boost/applications'),
      apiCall('/admin/boost/boosters'),
    ]);
    renderBoostApplications(Array.isArray(appsData) ? appsData : (appsData.applications || []));
    renderBoostBoosters(Array.isArray(boostersData) ? boostersData : (boostersData.boosters || []));
  } catch (err) {
    $('boost-applications-list').innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderBoostApplications(apps) {
  $('pending-apps-count').textContent = apps.length;
  if (!apps.length) {
    $('boost-applications-list').innerHTML = '<div class="empty-state"><p>No hay aplicaciones pendientes.</p></div>';
    return;
  }
  $('boost-applications-list').innerHTML = apps.map(a => `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <strong style="color:var(--text-bright);">${escapeHtml(a.username || a.battletag || '?')}</strong>
          <span style="font-size:.72rem;color:var(--text-muted);">${escapeHtml(a.battletag || '')}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:.78rem;color:var(--text-muted);">
          <span>⚔️ Rating 2v2: <strong style="color:var(--text-main);">${a.rating_2v2 || '—'}</strong></span>
          <span>⚔️ Rating 3v3: <strong style="color:var(--text-main);">${a.rating_3v3 || '—'}</strong></span>
          <span>🏆 Logro máximo: <strong style="color:var(--text-main);">${escapeHtml(a.highest_achievement || '—')}</strong></span>
        </div>
        ${a.experience ? `<div style="margin-top:6px;font-size:.78rem;color:var(--text-muted);">Experiencia: ${escapeHtml(a.experience.slice(0, 150))}...</div>` : ''}
        <div style="margin-top:4px;font-size:.72rem;color:var(--text-muted);">Aplicó: ${timeAgo(a.applied_at)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn btn-success" style="font-size:.75rem;padding:.3rem .7rem;" onclick="approveBoosterApp('${escapeForJsString(a.user_id || a.id)}', '${escapeForJsString(a.username || '')}')">✅ Aprobar</button>
        <button class="btn btn-danger"  style="font-size:.75rem;padding:.3rem .7rem;" onclick="rejectBoosterApp('${escapeForJsString(a.user_id || a.id)}', '${escapeForJsString(a.username || '')}')">❌ Rechazar</button>
      </div>
    </div>
  `).join('');
}

function renderBoostBoosters(boosters) {
  const tbody = $('boost-boosters-tbody');
  if (!boosters.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No hay boosters aprobados todavía.</p></td></tr>';
    return;
  }
  tbody.innerHTML = boosters.map(b => {
    const tierColor = BOOSTER_TIER_COLORS[b.tier] || '#7a7a8e';
    return `<tr>
      <td><strong style="font-size:.85rem;">${escapeHtml(b.username)}</strong></td>
      <td style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(b.battletag || '—')}</td>
      <td style="font-size:.82rem;">2v2: ${b.rating_2v2 || '—'} / 3v3: ${b.rating_3v3 || '—'}</td>
      <td><span style="color:${tierColor};font-weight:700;text-transform:uppercase;font-size:.78rem;">${b.tier || 'bronze'}</span></td>
      <td style="font-size:.82rem;">${b.carries_completed || 0}</td>
      <td style="font-size:.82rem;">$${(b.earnings_usd || 0).toFixed(2)}</td>
      <td style="font-size:.75rem;color:var(--text-muted);">${timeAgo(b.approved_at || b.created_at)}</td>
      <td>
        <button class="btn" style="font-size:.72rem;padding:.25rem .55rem;" onclick="openBoosterDetail('${escapeForJsString(b.user_id || b.id)}')">👁️ Ver</button>
      </td>
    </tr>`;
  }).join('');
}

window.approveBoosterApp = async function(userId, username) {
  if (!confirm(`¿Aprobar a ${username} como booster?`)) return;
  try {
    await apiCall(`/admin/boost/applications/${userId}/approve`, 'POST');
    toast(`✅ ${username} aprobado como booster`, 'success');
    loadBoostBoosters();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.rejectBoosterApp = async function(userId, username) {
  if (!confirm(`¿Rechazar la aplicación de ${username}?`)) return;
  try {
    await apiCall(`/admin/boost/applications/${userId}/reject`, 'POST');
    toast(`Aplicación de ${username} rechazada`, 'info');
    loadBoostBoosters();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.openBoosterDetail = function(userId) {
  toast('Detalle de booster — próximamente', 'info');
};

// ══════════════════════════════════════════════════════════
//  BOOSTING ECOSYSTEM — CLIENTES PORTAL
// ══════════════════════════════════════════════════════════

async function loadBoostClients() {
  const tbody = $('boost-clients-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Cargando...</p></td></tr>';
  try {
    // Derive client list from orders (group by client_id/username)
    const data = await apiCall('/admin/boost/orders');
    const orders = Array.isArray(data) ? data : (data.orders || []);

    // Build client map
    const clientMap = {};
    for (const o of orders) {
      const key = o.client_id || o.client_username;
      if (!key) continue;
      if (!clientMap[key]) {
        clientMap[key] = {
          username: o.client_username || key,
          orders: 0,
          spent_usd: 0,
          last_order: o.created_at,
        };
      }
      clientMap[key].orders++;
      if (o.payment_method === 'usd' && o.price_usd) {
        clientMap[key].spent_usd += parseFloat(o.price_usd) || 0;
      }
      if (o.created_at > clientMap[key].last_order) {
        clientMap[key].last_order = o.created_at;
      }
    }

    const clients = Object.values(clientMap).sort((a, b) => b.orders - a.orders);

    if (!clients.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay clientes registrados con pedidos.</p></td></tr>';
      return;
    }

    tbody.innerHTML = clients.map(c => `<tr>
      <td><strong style="font-size:.85rem;">${escapeHtml(c.username)}</strong></td>
      <td style="font-size:.8rem;color:var(--text-muted);">—</td>
      <td style="font-size:.82rem;">${c.orders}</td>
      <td style="font-size:.82rem;">$${c.spent_usd.toFixed(2)}</td>
      <td style="font-size:.75rem;color:var(--text-muted);">—</td>
      <td style="font-size:.75rem;color:var(--text-muted);">${timeAgo(c.last_order)}</td>
    </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><p>Error: ${escapeHtml(err.message)}</p></td></tr>`;
  }
}

/* ════════════════════════════════════════════════
   RBG STRATEGY HUB
   ════════════════════════════════════════════════ */

const RBG_MAP_DEFS = [
  { id: 'warsong_gulch',     name: 'Warsong Gulch' },
  { id: 'arathi_basin',      name: 'Arathi Basin' },
  { id: 'eye_of_the_storm',  name: 'Eye of the Storm' },
  { id: 'alterac_valley',    name: 'Alterac Valley' },
  { id: 'isle_of_conquest',  name: 'Isle of Conquest' },
  { id: 'battle_for_gilneas',name: 'Battle for Gilneas' },
  { id: 'twin_peaks',        name: 'Twin Peaks' },
  { id: 'temple_of_kotmogu', name: 'Temple of Kotmogu' },
  { id: 'deepwind_gorge',    name: 'Deepwind Gorge' },
  { id: 'silvershard_mines', name: 'Silvershard Mines' },
];

const ROLES = ['FC', 'Healer', 'Ofensa', 'Defensa', 'Roamer'];
const WOW_CLASSES = [
  'Death Knight','Demon Hunter','Druid','Evoker','Hunter',
  'Mage','Monk','Paladin','Priest','Rogue','Shaman','Warlock','Warrior'
];

let _rbgStrategies = [];
let _rbgGuildPlayers = [];

async function loadRbgTab() {
  // Load strategies from API
  try {
    _rbgStrategies = await apiCall('/admin/rbg-strategies') || [];
  } catch (_) { _rbgStrategies = []; }

  // Load guild players for dropdown
  try {
    const data = await apiCall('/admin/players');
    _rbgGuildPlayers = Array.isArray(data) ? data : (data.players || []);
  } catch (_) { _rbgGuildPlayers = []; }

  loadRbgMapEditor();
}

function loadRbgMapEditor() {
  const mapId = $('rbg-map-select')?.value;
  if (!mapId) return;

  const strat = _rbgStrategies.find(s => s.map === mapId) || { map: mapId, notes: '', status: 'empty', composition: [] };

  // Set notes
  const notesEl = $('rbg-notes-input');
  if (notesEl) notesEl.value = strat.notes || '';

  // Set status
  const statusEl = $('rbg-status-select');
  if (statusEl) statusEl.value = strat.status || 'empty';

  // Render comp editor
  renderRbgCompEditor(strat.composition || []);
}

function renderRbgCompEditor(comp) {
  const container = $('rbg-comp-editor');
  if (!container) return;

  const playerOptions = _rbgGuildPlayers
    .map(p => `<option value="${escapeHtml(p.name || p.id)}">${escapeHtml(p.name || p.id)}</option>`)
    .join('');

  let html = '';
  for (let i = 0; i < 10; i++) {
    const slot = comp[i] || {};
    const classOpts = WOW_CLASSES.map(c =>
      `<option value="${c}"${slot.class === c ? ' selected' : ''}>${c}</option>`
    ).join('');
    const roleOpts = ROLES.map(r =>
      `<option value="${r}"${slot.role === r ? ' selected' : ''}>${r}</option>`
    ).join('');

    html += `
      <div style="display:flex;align-items:center;gap:.6rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.6rem .8rem;">
        <span style="min-width:22px;height:22px;border-radius:50%;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700;color:var(--accent);">${i + 1}</span>
        <input class="input" list="rbg-players-list" id="rbg-slot-player-${i}"
          style="flex:1;min-width:0;font-size:.8rem;padding:.3rem .5rem;"
          placeholder="Jugador..." value="${escapeHtml(slot.player || '')}">
        <select class="input" id="rbg-slot-class-${i}" style="font-size:.75rem;padding:.3rem .4rem;width:120px;">
          <option value="">Clase...</option>
          ${classOpts}
        </select>
        <select class="input" id="rbg-slot-role-${i}" style="font-size:.75rem;padding:.3rem .4rem;width:90px;">
          <option value="">Rol...</option>
          ${roleOpts}
        </select>
      </div>`;
  }

  html += `<datalist id="rbg-players-list">${playerOptions}</datalist>`;
  container.innerHTML = html;
}

async function saveRbgStrategy() {
  const mapId = $('rbg-map-select')?.value;
  const notes = $('rbg-notes-input')?.value || '';
  const status = $('rbg-status-select')?.value || 'empty';
  const saveStatus = $('rbg-save-status');

  // Build composition array
  const composition = [];
  for (let i = 0; i < 10; i++) {
    const player = $(`rbg-slot-player-${i}`)?.value?.trim() || '';
    const cls    = $(`rbg-slot-class-${i}`)?.value || '';
    const role   = $(`rbg-slot-role-${i}`)?.value || '';
    composition.push({ player, class: cls, role });
  }

  // Upsert into strategies array
  const idx = _rbgStrategies.findIndex(s => s.map === mapId);
  const entry = { map: mapId, notes, status, composition, updated_at: new Date().toISOString() };
  if (idx >= 0) {
    _rbgStrategies[idx] = entry;
  } else {
    _rbgStrategies.push(entry);
  }

  try {
    if (saveStatus) saveStatus.textContent = 'Guardando...';
    $('rbg-save-btn').disabled = true;
    await apiCall('/admin/rbg-strategies', 'PUT', _rbgStrategies);
    toast('✅ Estrategia guardada correctamente', 'success');
    if (saveStatus) saveStatus.textContent = `✓ Guardado ${new Date().toLocaleTimeString('es-MX')}`;
  } catch (err) {
    toast('❌ Error al guardar: ' + err.message, 'error');
    if (saveStatus) saveStatus.textContent = '❌ Error al guardar';
  } finally {
    $('rbg-save-btn').disabled = false;
  }
}
