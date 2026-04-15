// ─────────────────────────────────────────────
// AUTH — giriş, çıkış, oturum yönetimi
// ─────────────────────────────────────────────
async function doLogin() {
const email  = document.getElementById('login-email').value.trim().toLowerCase();
const pass   = document.getElementById('login-pass').value;
const errEl  = document.getElementById('login-err');
const btn    = document.getElementById('login-submit');
if (!email || !pass) {
errEl.textContent = 'E-posta ve şifre gerekli';
errEl.style.display = 'block';
return;
}
btn.disabled = true;
btn.textContent = 'Giriş yapılıyor...';
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
errEl.textContent = currentLang==='tr' ? 'E-posta veya şifre hatalı' : 'E-Mail oder Passwort falsch';
errEl.style.display = 'block';
btn.disabled = false;
btn.textContent = 'Giriş Yap';
return;
}
const u = data[0];
currentUser = {
id:        u.user_id,
firm_id:   u.firm_id,
email:     email,
name:      u.name,
role:      u.role,
firm_name: u.firm_name,
initials:  u.name.charAt(0).toUpperCase()
};
_baseUser = { ...currentUser };
_impersonation = null;
localStorage.setItem('mb_session', JSON.stringify(currentUser));
localStorage.setItem('mb_base_session', JSON.stringify(_baseUser));
localStorage.removeItem('mb_impersonation');
sbUpsert('agent_sessions', {
agent_id: currentUser.id,
agent_name: currentUser.name,
firm_id: currentUser.firm_id, status: 'offline',
last_seen: new Date().toISOString()
}, 'agent_id');
document.getElementById('page-login').style.display = 'none';
document.getElementById('app').style.display = 'flex';
bootApp();
} catch(e) {
errEl.textContent = 'Bağlantı hatası: ' + e.message;
errEl.style.display = 'block';
btn.disabled = false;
btn.textContent = 'Giriş Yap';
}
}

function toggleLoginPass() {
  const inp = document.getElementById('login-pass');
  const eye = document.getElementById('login-eye');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    if (eye) eye.innerHTML = '<i class="ph ph-eye-slash"></i>';
  } else {
    inp.type = 'password';
    if (eye) eye.innerHTML = '<i class="ph ph-eye"></i>';
  }
}

async function doLogout() {
if (currentUser?.id) {
await sbUpsert('agent_sessions', {
agent_id: currentUser.id, status: 'offline',
last_seen: new Date().toISOString()
}, 'agent_id').catch(()=>{});
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

function bootApp() {
if (!currentUser.initials) currentUser.initials = (currentUser.name||'?').charAt(0).toUpperCase();
document.getElementById('tb-av').textContent = currentUser.initials.charAt(0);
document.getElementById('tb-uname').textContent = currentUser.name;
const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser.role);
const isBackoffice = isAdmin || currentUser.role === 'qc';
document.getElementById('nav-admin').style.display = isBackoffice ? '' : 'none';
document.getElementById('nav-agent').style.display = isBackoffice ? 'none' : '';
document.getElementById('tb-pills').style.display  = isAdmin ? '' : 'none';
document.getElementById('sb-settings').style.display = isAdmin ? '' : 'none';
document.getElementById('telnyx-settings').style.display = currentUser.role === 'super_admin' ? '' : 'none';
const fieldNav = document.getElementById('nav-field-btn');
const dialerNav = document.getElementById('nav-dialer-btn');
const adminDialerNav = document.getElementById('nav-admin-dialer-btn');
const fieldOpsNav = document.getElementById('nav-fieldops-btn');
const jobsNav = document.getElementById('nav-jobs-btn');
const myHistoryNav = document.getElementById('nav-myhistory-btn');
const wvNav = document.getElementById('nav-wv-btn');
const takvimOverlayNav = document.getElementById('nav-takvim-overlay-btn');
if (fieldNav) fieldNav.style.display = currentUser.role === 'field_agent' ? '' : 'none';
if (dialerNav) dialerNav.style.display = currentUser.role === 'field_agent' ? 'none' : '';
if (adminDialerNav) adminDialerNav.style.display = ['admin','firm_admin','super_admin','qc'].includes(currentUser.role) ? '' : 'none';
if (fieldOpsNav) fieldOpsNav.style.display = ['admin','firm_admin','super_admin'].includes(currentUser.role) ? '' : 'none';
if (jobsNav) jobsNav.style.display = ['admin','firm_admin','super_admin'].includes(currentUser.role) ? '' : 'none';
if (myHistoryNav) myHistoryNav.style.display = currentUser.role === 'field_agent' ? 'none' : '';
if (wvNav) wvNav.style.display = currentUser.role === 'field_agent' ? 'none' : '';
if (takvimOverlayNav) takvimOverlayNav.style.display = currentUser.role === 'field_agent' ? 'none' : '';
// API keys (Google, TomTom, daily goal) — super_admin only
const apiCard = document.querySelector('#page-settings .card:has(#s-google-key)') ||
  [...document.querySelectorAll('#page-settings .card')].find(c=>c.querySelector('#s-google-key'));
if (apiCard) apiCard.style.display = currentUser.role === 'super_admin' ? '' : 'none';
// Mesai settings — admin+ (not agents)
const mesaiCard = document.getElementById('mesai-settings-card');
if (mesaiCard) mesaiCard.style.display = isAdmin ? '' : 'none';
const chatSetCard = document.getElementById('chat-settings-card');
if (chatSetCard) chatSetCard.style.display = isAdmin ? '' : 'none';
const fieldSetCard = document.getElementById('field-settings-card');
if (fieldSetCard) fieldSetCard.style.display = isAdmin ? '' : 'none';
const featCard = document.getElementById('feature-flags-card');
if (featCard) featCard.style.display = isAdmin ? '' : 'none';
const jobPermCard = document.getElementById('job-permissions-card');
if (jobPermCard) jobPermCard.style.display = isAdmin ? '' : 'none';
const roleMap = {
'super_admin':'Süper Admin','firm_admin':'Firma Admin',
'admin':'Admin','agent':'Agent','qc':'QC','field_agent':'Saha Elemanı'
};
const roleEl = document.getElementById('tb-urole');
if (roleEl) {
  const suffix = currentUser.firm_name ? ` · ${currentUser.firm_name}` : '';
  const imp = _impersonation ? ' · Temsil Modu' : '';
  roleEl.textContent = (roleMap[currentUser.role]||currentUser.role) + suffix + imp;
}
const firmsBtn = document.getElementById('nav-firms-btn');
if (firmsBtn) firmsBtn.style.display = currentUser.role === 'super_admin' ? '' : 'none';
const perfNav = document.getElementById('nav-performance-btn');
if (perfNav) perfNav.style.display = ['admin', 'firm_admin', 'super_admin'].includes(currentUser.role) ? '' : 'none';
if (currentUser.role === 'super_admin') { loadAllFirms(); }
loadFirmCallHours(); // arama kısıtlamalarını yükle
if (isAdmin) { navigate('dashboard'); }
else if (currentUser.role === 'qc') { navigate('qc'); }
else if (currentUser.role === 'field_agent') { navigate('field'); }
else         { navigate('dialer'); }
if (isAdmin) {
updateTopbarStats();
setInterval(updateTopbarStats, 30000);
}
loadWvBadge();
if (typeof refreshUserPagePerms === 'function') refreshUserPagePerms().catch(() => {});
if (typeof applyFeatureFlagsOnBoot === 'function') applyFeatureFlagsOnBoot().catch(() => {});
if (typeof initChat === 'function') initChat();
if (typeof initNotificationCenter === 'function') initNotificationCenter();
initRTCListener();
const sipUser = localStorage.getItem('mb-sip-user')||'';
const sipPass = localStorage.getItem('mb-sip-pass')||'';
if (sipUser && sipPass) {
updateConnectionStatus('connecting');
setTimeout(()=>{ sendToRTC('MB_CONNECT',{sipUser,sipPass}); }, 1200);
} else {
updateConnectionStatus('disconnected');
}
}

// ── Süper Admin Global Firma Seçici ──────────────────
function isSuperAdmin() { return currentUser?.role === 'super_admin'; }

function getActiveFirmId() {
return isSuperAdmin() ? _selectedFirmId : currentUser?.firm_id;
}

/** Süper admin firma seçimini kod tarafında günceller (ör. sohbetten atlama) */
function setSuperAdminFirmSelection(firmId) {
  if (currentUser?.role !== 'super_admin' || !firmId) return;
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

function renderFirmSelector(containerId, callbackFn) {
const el = document.getElementById(containerId);
if (!el) return;
if (!isSuperAdmin()) { el.innerHTML = ''; return; }
const buildSelect = () => {
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
_selectedFirmId = this.value || null;
if (typeof callbackFn === 'function') callbackFn();
};
}
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
  return (_baseUser?.role || currentUser?.role) === 'super_admin';
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
    initials: (u.name || 'T').charAt(0).toUpperCase()
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

// Sayfa yenilenince session geri yükle
(function restoreSession() {
try {
const saved = localStorage.getItem('mb_session');
if (saved) {
currentUser = JSON.parse(saved);
const baseSaved = localStorage.getItem('mb_base_session');
_baseUser = baseSaved ? JSON.parse(baseSaved) : { ...currentUser };
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
} catch(e) { localStorage.removeItem('mb_session'); }
})();

