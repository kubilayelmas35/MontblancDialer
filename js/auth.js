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
localStorage.setItem('mb_session', JSON.stringify(currentUser));
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
currentUser = null;
document.getElementById('page-login').style.display = 'flex';
document.getElementById('app').style.display = 'none';
}

function bootApp() {
if (!currentUser.initials) currentUser.initials = (currentUser.name||'?').charAt(0).toUpperCase();
document.getElementById('tb-av').textContent = currentUser.initials.charAt(0);
document.getElementById('tb-uname').textContent = currentUser.name;
const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser.role);
document.getElementById('nav-admin').style.display = isAdmin ? '' : 'none';
document.getElementById('nav-agent').style.display = isAdmin ? 'none' : '';
document.getElementById('tb-pills').style.display  = isAdmin ? '' : 'none';
document.getElementById('sb-settings').style.display = isAdmin ? '' : 'none';
document.getElementById('telnyx-settings').style.display = currentUser.role === 'super_admin' ? '' : 'none';
// API keys (Google, TomTom, daily goal) — super_admin only
const apiCard = document.querySelector('#page-settings .card:has(#s-google-key)') ||
  [...document.querySelectorAll('#page-settings .card')].find(c=>c.querySelector('#s-google-key'));
if (apiCard) apiCard.style.display = currentUser.role === 'super_admin' ? '' : 'none';
// Mesai settings — admin+ (not agents)
const mesaiCard = document.getElementById('mesai-settings-card');
if (mesaiCard) mesaiCard.style.display = isAdmin ? '' : 'none';
const roleMap = {
'super_admin':'Süper Admin','firm_admin':'Firma Admin',
'admin':'Admin','agent':'Agent','qc':'QC'
};
const roleEl = document.getElementById('tb-urole');
if (roleEl) roleEl.textContent = (roleMap[currentUser.role]||currentUser.role)
+ (currentUser.firm_name ? ` · ${currentUser.firm_name}` : '');
const firmsBtn = document.getElementById('nav-firms-btn');
if (firmsBtn) firmsBtn.style.display = currentUser.role === 'super_admin' ? '' : 'none';
const perfNav = document.getElementById('nav-performance-btn');
if (perfNav) perfNav.style.display = ['admin', 'firm_admin', 'super_admin'].includes(currentUser.role) ? '' : 'none';
if (currentUser.role === 'super_admin') { loadAllFirms(); }
loadFirmCallHours(); // arama kısıtlamalarını yükle
if (isAdmin) { navigate('dashboard'); }
else         { navigate('dialer'); }
if (isAdmin) {
updateTopbarStats();
setInterval(updateTopbarStats, 30000);
}
loadWvBadge();
if (typeof refreshUserPagePerms === 'function') refreshUserPagePerms().catch(() => {});
if (typeof initChat === 'function') initChat();
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

// API keylerini başta yükle
_googleApiKey = localStorage.getItem('mb_google_key') || DEFAULT_GOOGLE_KEY;

// Sayfa yenilenince session geri yükle
(function restoreSession() {
try {
const saved = localStorage.getItem('mb_session');
if (saved) {
currentUser = JSON.parse(saved);
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

