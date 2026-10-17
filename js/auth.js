// ─────────────────────────────────────────────
// AUTH — giriş, çıkış, oturum yönetimi
// ─────────────────────────────────────────────
async function doLogin() {
const email  = document.getElementById('login-email').value.trim().toLowerCase();
const pass   = document.getElementById('login-pass').value;
const errEl  = document.getElementById('login-err');
const btn    = document.getElementById('login-submit');
if (!email || !pass) {
errEl.textContent = (typeof t === 'function' ? t('login.err.required') : 'E-posta ve şifre gerekli');
errEl.style.display = 'block';
return;
}
btn.disabled = true;
const _lbl = document.getElementById('login-btn-label');
if (_lbl) _lbl.textContent = (typeof t === 'function' ? t('login.signingIn') : 'Giriş yapılıyor...');
else btn.textContent = (typeof t === 'function' ? t('login.signingIn') : 'Giriş yapılıyor...');
errEl.style.display = 'none';
try {
const res = await fetch(`${SB_URL}/rest/v1/rpc/verify_password`, {
method: 'POST',
headers: {
'apikey': SB_KEY,
'Authorization': `Bearer ${SB_KEY}`,
'Content-Type': 'application/json'
},
body: JSON.stringify({ p_email: email, p_password: pass })
});
const data = await res.json();
if (!data || !data.length) {
errEl.textContent = (typeof t === 'function' ? t('login.err.bad') : (currentLang==='tr' ? 'E-posta veya şifre hatalı' : 'E-Mail oder Passwort falsch'));
errEl.style.display = 'block';
btn.disabled = false;
if (_lbl) _lbl.textContent = (typeof t === 'function' ? t('login.btn') : 'Giriş Yap');
else btn.textContent = 'Giriş Yap';
return;
}
const u = data[0];
if (!u.session_token) {
errEl.textContent = (typeof t === 'function' ? t('login.err.conn') : 'Bağlantı hatası: ') + 'session';
errEl.style.display = 'block';
btn.disabled = false;
if (_lbl) _lbl.textContent = (typeof t === 'function' ? t('login.btn') : 'Giriş Yap');
else btn.textContent = 'Giriş Yap';
return;
}
currentUser = {
id:        u.user_id,
firm_id:   u.firm_id,
email:     email,
name:      u.name,
role:      u.role,
firm_name: u.firm_name,
initials:  u.name.charAt(0).toUpperCase(),
session_token: u.session_token
};
_baseUser = { ...currentUser };
_impersonation = null;
localStorage.setItem('mb_session', JSON.stringify(currentUser));
localStorage.setItem('mb_base_session', JSON.stringify(_baseUser));
localStorage.removeItem('mb_impersonation');
_syncOwnAgentPresence('offline');
document.getElementById('page-login').style.display = 'none';
document.getElementById('app').style.display = 'flex';
bootApp();
} catch(e) {
errEl.textContent = (typeof t === 'function' ? t('login.err.conn') : 'Bağlantı hatası: ') + e.message;
errEl.style.display = 'block';
btn.disabled = false;
if (_lbl) _lbl.textContent = (typeof t === 'function' ? t('login.btn') : 'Giriş Yap');
else btn.textContent = 'Giriş Yap';
}
}

function toggleLoginPass() {
  const inp = document.getElementById('login-pass');
  const eye = document.getElementById('login-eye');
  if (!inp) return;
  const eyeOpen = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
  if (inp.type === 'password') {
    inp.type = 'text';
    if (eye) eye.innerHTML = eyeOff;
  } else {
    inp.type = 'password';
    if (eye) eye.innerHTML = eyeOpen;
  }
}

async function doLogout() {
try {
await fetch(`${SB_URL}/rest/v1/rpc/end_app_session`, {
method: 'POST',
headers: mbAuthHeaders(),
body: '{}'
});
} catch (_) {}
if (currentUser?.id) {
await _syncOwnAgentPresence('offline');
}
localStorage.removeItem('mb_session');
localStorage.removeItem('mb_base_session');
localStorage.removeItem('mb_impersonation');
currentUser = null;
_baseUser = null;
_impersonation = null;
document.getElementById('page-login').style.display = 'flex';
document.getElementById('app').style.display = 'none';
}

let _mbWhoamiAt = 0;

function mbDropDeadSession() {
  _mbWhoamiAt = 0;
  localStorage.removeItem('mb_session');
  localStorage.removeItem('mb_base_session');
  localStorage.removeItem('mb_impersonation');
  currentUser = null;
  _baseUser = null;
  _impersonation = null;
  const app = document.getElementById('app');
  const login = document.getElementById('page-login');
  if (app) app.style.display = 'none';
  if (login) login.style.display = 'flex';
  const errEl = document.getElementById('login-err');
  if (errEl) {
    errEl.textContent = (typeof t === 'function' ? t('login.err.session') : 'Oturum sona erdi. Tekrar giriş yapın.');
    errEl.style.display = 'block';
  }
}

function mbApplyWhoami(me) {
  if (!me?.user_id || !currentUser) return;
  if (_impersonation && String(me.user_id) !== String(currentUser.id)) return;
  const firmChanged = String(me.firm_id || '') !== String(currentUser.firm_id || '');
  currentUser.firm_id = me.firm_id || currentUser.firm_id;
  currentUser.role = me.role || currentUser.role;
  currentUser.name = me.name || currentUser.name;
  currentUser.email = me.email || currentUser.email;
  currentUser.firm_name = me.firm_name || currentUser.firm_name;
  if (_baseUser && String(_baseUser.id) === String(currentUser.id)) {
    _baseUser.firm_id = currentUser.firm_id;
    _baseUser.role = currentUser.role;
    _baseUser.name = currentUser.name;
    _baseUser.firm_name = currentUser.firm_name;
    _baseUser.session_token = currentUser.session_token || _baseUser.session_token;
    localStorage.setItem('mb_base_session', JSON.stringify(_baseUser));
  }
  localStorage.setItem('mb_session', JSON.stringify(currentUser));
  if (firmChanged) {
    const roleEl = document.getElementById('tb-urole');
    if (roleEl && currentUser.firm_name) {
      const suffix = ` · ${currentUser.firm_name}`;
      if (!String(roleEl.textContent || '').includes(currentUser.firm_name)) {
        roleEl.textContent = String(roleEl.textContent || currentUser.role || '').replace(/\s·\s.*$/, '') + suffix;
      }
    }
  }
}

async function mbWhoami() {
  try {
    const rows = await sb('rpc/mb_whoami', { method: 'POST', body: '{}' });
    if (Array.isArray(rows)) return rows[0] || null;
    return rows || null;
  } catch (_) {
    return { _error: true };
  }
}

async function mbEnsureSession(opts = {}) {
  if (!currentUser?.id) return false;
  if (!opts.force && Date.now() - _mbWhoamiAt < 15000 && currentUser.firm_id) return true;
  let me = await mbWhoami();
  if (me?._error) return true;
  if (!me?.user_id) {
    const baseTok = _baseUser?.session_token;
    const curTok = currentUser.session_token;
    const sameUser = _baseUser && String(_baseUser.id) === String(currentUser.id);
    if (sameUser && baseTok && baseTok !== curTok) {
      currentUser.session_token = baseTok;
      me = await mbWhoami();
      if (me?._error) return true;
    }
  }
  if (!me?.user_id) {
    mbDropDeadSession();
    return false;
  }
  mbApplyWhoami(me);
  _mbWhoamiAt = Date.now();
  return true;
}

async function bootApp() {
if (!(await mbEnsureSession({ force: true }))) return;
if (!currentUser) return;
if (!currentUser.initials) currentUser.initials = (currentUser.name||'?').charAt(0).toUpperCase();
document.getElementById('tb-av').textContent = currentUser.initials.charAt(0);
document.getElementById('tb-uname').textContent = currentUser.name;
const isAdmin = mbIsFirmAdmin();
if (typeof mbApplyNavAccess === 'function') mbApplyNavAccess();
const roleEl = document.getElementById('tb-urole');
if (roleEl) {
  const suffix = currentUser.firm_name ? ` · ${currentUser.firm_name}` : '';
  const imp = _impersonation ? ' · Temsil Modu' : '';
  const roleName = typeof mbRoleLabel === 'function' ? mbRoleLabel(currentUser.role) : currentUser.role;
  roleEl.textContent = roleName + suffix + imp;
}
if (mbIsSuperAdmin()) { loadAllFirms(); }
loadFirmCallHours(); // arama kısıtlamalarını yükle
if (typeof loadFirmDialerSettingsCache === 'function') void loadFirmDialerSettingsCache();
if (typeof loadIncomingCallsSettingsPage === 'function') void loadIncomingCallsSettingsPage();
if (typeof applyFeatureFlagsOnBoot === 'function') applyFeatureFlagsOnBoot().catch(() => {});
if (isAdmin) {
updateTopbarStats();
setInterval(updateTopbarStats, 30000);
}
loadWvBadge();
if (typeof refreshUserPagePerms === 'function') refreshUserPagePerms().catch(() => {});
if (typeof mbLoadUiPrefs === 'function') await mbLoadUiPrefs();
navigate(typeof mbHomePage === 'function' ? mbHomePage(currentUser.role) : 'dialer');
if (typeof initChat === 'function') initChat();
if (typeof initNotificationCenter === 'function') initNotificationCenter();
initRTCListener();
localStorage.removeItem('mb-sip-pass');
const sipUser = localStorage.getItem('mb-sip-user')||'';
const sipPass = window.__mbSipPass || '';
if (sipUser && sipPass) {
updateConnectionStatus('connecting');
setTimeout(()=>{ sendToRTC('MB_CONNECT',{sipUser,sipPass}); }, 1200);
} else {
updateConnectionStatus('disconnected');
}
if (typeof reloadMascotStateForUser === 'function') reloadMascotStateForUser();
}

// ── Süper Admin Global Firma Seçici ──────────────────
function isSuperAdmin() { return mbIsSuperAdmin(); }

async function _syncOwnAgentPresence(status) {
  if (!currentUser?.id) return;
  const dial = ['agent', 'qc'].includes(currentUser.role || '');
  if (!dial) {
    await sb(`agent_sessions?agent_id=eq.${currentUser.id}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    }).catch(() => {});
    return;
  }
  if (typeof upsertAgentSession === 'function') {
    await upsertAgentSession({
      agent_id: currentUser.id,
      agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status: status || 'offline',
      last_seen: new Date().toISOString(),
    });
  }
}

function getActiveFirmId() {
return isSuperAdmin() ? _selectedFirmId : currentUser?.firm_id;
}

/** Süper admin firma seçimini kod tarafında günceller (ör. sohbetten atlama) */
function setSuperAdminFirmSelection(firmId) {
  if (!mbIsSuperAdmin() || !firmId) return;
  _selectedFirmId = firmId;
  document.querySelectorAll('select[id$="-sel"]').forEach((sel) => {
    const opt = [...sel.options].find((o) => o.value === firmId);
    if (opt) sel.value = firmId;
  });
}

function getFirmFilter(prefix='') {
const fid = getActiveFirmId();
return fid ? `${prefix}firm_id=eq.${fid}` : '';
}

async function loadAllFirms() {
if (!isSuperAdmin()) return;
try {
_allFirms = await sb('firms?select=id,name,slug&order=name.asc') || [];
} catch(e) { _allFirms = []; }
}

let _firmSelectorLock = 0;
function renderFirmSelector(containerId, callbackFn) {
const el = document.getElementById(containerId);
if (!el) return;
if (!isSuperAdmin()) { el.innerHTML = ''; return; }
const buildSelect = () => {
_firmSelectorLock++;
try {
el.innerHTML = `
<div style="display:flex;align-items:center;gap:6px;">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-3);flex-shrink:0;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
<select class="form-input" id="${containerId}-sel" style="font-size:12px;padding:4px 10px;min-width:160px;">
<option value="">Tüm Firmalar</option>
${_allFirms.map(f=>`<option value="${f.id}" ${f.id===(_selectedFirmId||'')?'selected':''}>${f.name}</option>`).join('')}
</select>
</div>`;
const sel = document.getElementById(containerId+'-sel');
if (sel) {
sel.onchange = function() {
if (_firmSelectorLock) return;
const next = this.value || null;
if (next === (_selectedFirmId || null)) return;
_selectedFirmId = next;
if (typeof callbackFn === 'function') callbackFn();
};
}
} finally { _firmSelectorLock--; }
};
if (!_allFirms.length) {
sb('firms?select=id,name,slug&order=name.asc').then(firms => {
_allFirms = firms || [];
buildSelect();
}).catch(() => buildSelect());
} else {
buildSelect();
}
}

function canUseImpersonation() {
  return mbIsSuperAdmin(_baseUser?.role || currentUser?.role);
}

function handleTopbarUserClick() {
  if (canUseImpersonation()) {
    openImpersonationModal();
    return;
  }
  navigate('settings');
}

function _escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function openImpersonationModal() {
  if (!canUseImpersonation()) return navigate('settings');
  document.getElementById('m-impersonation')?.remove();
  const firms = (_allFirms && _allFirms.length) ? _allFirms : (await sb('firms?select=id,name&order=name.asc').catch(() => []));
  _allFirms = firms || [];
  const activeFirmId = _impersonation?.firm_id || _selectedFirmId || currentUser?.firm_id || _baseUser?.firm_id || '';
  const ov = document.createElement('div');
  ov.id = 'm-impersonation';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:560px;">
<div class="modal-hdr">
  <div class="modal-title">Süper Admin Test Temsili</div>
  <button class="modal-close" onclick="closeImpersonationModal()">✕</button>
</div>
<div style="padding:14px 20px;display:flex;flex-direction:column;gap:10px;">
  <div class="jm-hint" style="margin:0;">Bir firma ve kullanıcı seçip o kullanıcıymış gibi işlem yapabilirsiniz.</div>
  <div class="form-row">
    <label class="form-label">Firma</label>
    <select id="imp-firm" class="form-input" onchange="onImpersonationFirmChange()">
      ${_allFirms.map((f) => `<option value="${_escHtml(f.id)}" ${String(f.id)===String(activeFirmId)?'selected':''}>${_escHtml(f.name || f.id)}</option>`).join('')}
    </select>
  </div>
  <div class="form-row">
    <label class="form-label">Kullanıcı</label>
    <select id="imp-user" class="form-input"><option value="">Yükleniyor...</option></select>
  </div>
  <div id="imp-info" style="font-size:12px;color:var(--text-3);"></div>
</div>
<div class="modal-footer">
  <button class="btn btn-ghost" onclick="navigate('settings'); closeImpersonationModal();">Ayarlar</button>
  <button class="btn btn-ghost" onclick="stopImpersonation()" ${_impersonation ? '' : 'disabled'}>Temsili Durdur</button>
  <button class="btn btn-primary" onclick="applyImpersonation()">Temsili Başlat</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) closeImpersonationModal(); };
  document.body.appendChild(ov);
  await onImpersonationFirmChange();
}

function closeImpersonationModal() {
  document.getElementById('m-impersonation')?.remove();
}

async function onImpersonationFirmChange() {
  const firmId = document.getElementById('imp-firm')?.value || '';
  const userSel = document.getElementById('imp-user');
  const info = document.getElementById('imp-info');
  if (!userSel || !firmId) return;
  userSel.innerHTML = '<option value="">Yükleniyor...</option>';
  const users = await sb(`users?firm_id=eq.${firmId}&is_active=eq.true&select=id,name,email,role,firm_id&order=name.asc`).catch(() => []);
  userSel.innerHTML = (users || []).map((u) => {
    const selected = _impersonation?.user_id === u.id ? 'selected' : '';
    return `<option value="${_escHtml(u.id)}" ${selected}>${_escHtml(u.name)} · ${_escHtml(u.role)} · ${_escHtml(u.email || '')}</option>`;
  }).join('') || '<option value="">Aktif kullanıcı yok</option>';
  if (info) info.textContent = _impersonation ? `Aktif: ${_impersonation.name} (${_impersonation.role})` : 'Aktif temsil yok (kendi hesabınızdasınız).';
}

function persistImpersonationState() {
  localStorage.setItem('mb_session', JSON.stringify(currentUser));
  if (_baseUser) localStorage.setItem('mb_base_session', JSON.stringify(_baseUser));
  if (_impersonation) localStorage.setItem('mb_impersonation', JSON.stringify(_impersonation));
  else localStorage.removeItem('mb_impersonation');
}

async function applyImpersonation() {
  if (!canUseImpersonation()) return;
  const firmId = document.getElementById('imp-firm')?.value || '';
  const userId = document.getElementById('imp-user')?.value || '';
  if (!firmId || !userId) { toast('Firma ve kullanıcı seçin', 'warn'); return; }
  const users = await sb(`users?id=eq.${userId}&select=id,name,email,role,firm_id&limit=1`).catch(() => []);
  const u = users?.[0];
  if (!u) { toast('Kullanıcı bulunamadı', 'err'); return; }
  const firmName = (_allFirms.find((f) => String(f.id) === String(u.firm_id))?.name) || '';
  _impersonation = {
    user_id: u.id,
    firm_id: u.firm_id,
    name: u.name,
    role: u.role,
    email: u.email || '',
    firm_name: firmName
  };
  _selectedFirmId = u.firm_id || _selectedFirmId;
  currentUser = {
    id: u.id,
    firm_id: u.firm_id,
    email: u.email || '',
    name: u.name || 'Temsil',
    role: u.role || 'agent',
    firm_name: firmName,
    initials: (u.name || 'T').charAt(0).toUpperCase(),
    session_token: _baseUser?.session_token || ''
  };
  persistImpersonationState();
  closeImpersonationModal();
  bootApp();
  toast(`Temsil aktif: ${u.name}`, 'ok');
}

function stopImpersonation() {
  if (!_impersonation || !_baseUser) return;
  currentUser = { ..._baseUser };
  _impersonation = null;
  persistImpersonationState();
  closeImpersonationModal();
  bootApp();
  toast('Temsil modu kapatıldı', 'ok');
}

// API keylerini başta yükle
_googleApiKey = localStorage.getItem('mb_google_key') || DEFAULT_GOOGLE_KEY;

function _isValidSessionUserShape(u) {
  if (!u || typeof u !== 'object') return false;
  const roles = typeof mbKnownRoles === 'function' ? mbKnownRoles() : [];
  if (!u.id || !isValidUUID?.(u.id)) return false;
  if (!u.email || typeof u.email !== 'string') return false;
  if (!u.name || typeof u.name !== 'string') return false;
  if (!u.role || !roles.includes(u.role)) return false;
  if (u.firm_id && !isValidUUID?.(u.firm_id)) return false;
  return true;
}

function _hasSessionToken(u) {
  return typeof u?.session_token === 'string' && u.session_token.length >= 32;
}

function _clearSessionStorageSafe() {
  localStorage.removeItem('mb_session');
  localStorage.removeItem('mb_base_session');
  localStorage.removeItem('mb_impersonation');
}

// Sayfa yenilenince session geri yükle
(function restoreSession() {
try {
const saved = localStorage.getItem('mb_session');
if (saved) {
currentUser = JSON.parse(saved);
if (!_isValidSessionUserShape(currentUser)) {
_clearSessionStorageSafe();
currentUser = null;
return;
}
const baseSaved = localStorage.getItem('mb_base_session');
_baseUser = baseSaved ? JSON.parse(baseSaved) : { ...currentUser };
if (!_isValidSessionUserShape(_baseUser)) _baseUser = { ...currentUser };
if (!_hasSessionToken(_baseUser) && _hasSessionToken(currentUser)) _baseUser.session_token = currentUser.session_token;
if (!_hasSessionToken(currentUser) && _hasSessionToken(_baseUser)) currentUser.session_token = _baseUser.session_token;
if (String(_baseUser?.id || '') === String(currentUser?.id || '') && _hasSessionToken(currentUser)) {
  _baseUser.session_token = currentUser.session_token;
}
if (!_hasSessionToken(currentUser)) {
_clearSessionStorageSafe();
currentUser = null;
_baseUser = null;
return;
}
const impSaved = localStorage.getItem('mb_impersonation');
_impersonation = impSaved ? JSON.parse(impSaved) : null;
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => {
document.getElementById('page-login').style.display = 'none';
document.getElementById('app').style.display = 'flex';
bootApp();
});
} else {
document.getElementById('page-login').style.display = 'none';
document.getElementById('app').style.display = 'flex';
bootApp();
}
}
} catch(e) { _clearSessionStorageSafe(); }
})();

