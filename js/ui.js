// ─────────────────────────────────────────────
// UI — sidebar, navigasyon, tema, dil, toast, modaller
// ─────────────────────────────────────────────

// ── SIDEBAR ──────────────────────────────────
function toggleSidebar() {
const sb   = document.getElementById('sidebar');
const ov   = document.getElementById('sidebar-overlay');
const mob  = window.innerWidth <= 768;
if (mob) {
const open = sb.classList.contains('open');
if (open) { sb.classList.remove('open'); ov.classList.remove('show'); }
else       { sb.classList.add('open');   ov.classList.add('show'); }
} else {
sb.classList.toggle('collapsed');
}
}

function closeSidebar() {
document.getElementById('sidebar').classList.remove('open');
document.getElementById('sidebar-overlay').classList.remove('show');
}

window.addEventListener('resize', () => {
if (window.innerWidth > 768) {
document.getElementById('sidebar-overlay').classList.remove('show');
document.getElementById('sidebar').classList.remove('open');
}
});

// ── NAVIGATION ───────────────────────────────
function navigate(page) {
document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
const pg = document.getElementById(`page-${page}`);
if (pg) pg.classList.add('active');
const btn = document.querySelector(`.sb-item[onclick="navigate('${page}')"]`);
if (btn) btn.classList.add('active');
if (window.innerWidth <= 768) closeSidebar();
if (page==='dashboard')  loadDashboard();
if (page==='campaigns')  loadCampaigns();
if (page==='agents')     loadAgents();
if (page==='stats')      { initStatsFilters(); loadStats(); }
if (page==='callhistory'){ initCallHistoryFilters(); loadCallHistory(); }
if (page==='dialer')         initDialer();
if (page==='myhistory')      loadMyHistory();
if (page==='settings')       loadSavedSettings();
if (page==='wiedervorlage')  loadWvPage();
if (page==='qc')             loadQcData();
if (page==='firms')          loadFirmsPage();
if (page==='settings')        { loadMesaiSettings(); }
if (page==='takvim')         loadTakvimPage();
}

// ── LANG ─────────────────────────────────────
function setLang(l) {
currentLang = l;
document.getElementById('lang-btn').textContent = l.toUpperCase();
document.documentElement.lang = l;
document.querySelectorAll(`[data-${l}]`).forEach(el => {
if (el.tagName==='INPUT'||el.tagName==='TEXTAREA') {
el.placeholder = el.getAttribute(`data-${l}`)||el.placeholder;
} else if (el.tagName==='OPTION') {
el.textContent = el.getAttribute(`data-${l}`)||el.textContent;
} else {
el.textContent = el.getAttribute(`data-${l}`)||el.getAttribute('data-tr');
}
});
}

function cycleLang() {
setLang(currentLang==='tr'?'de':'tr');
}

function applyLang() {
setLang(currentLang);
}

// ── THEME & PALETTE ──────────────────────────
function setTheme(t) {
currentTheme = t;
document.documentElement.setAttribute('data-theme', t);
const icon = document.getElementById('theme-icon');
if (icon) icon.innerHTML = t==='light'
  ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
localStorage.setItem('mb-theme', t);
}

function toggleTheme() {
setTheme(currentTheme==='light'?'dark':'light');
}

function setPalette(p) {
currentPalette = p;
document.documentElement.setAttribute('data-palette', p);
document.querySelectorAll('.palette-dot').forEach(d => d.classList.toggle('sel', d.dataset.p===p));
localStorage.setItem('mb-palette', p);
}

// Restore theme/palette
(()=>{
const t = localStorage.getItem('mb-theme');
const p = localStorage.getItem('mb-palette');
if (t) setTheme(t);
if (p) setPalette(p);
document.querySelectorAll('.palette-dot').forEach(d => d.classList.toggle('sel', d.dataset.p===(p||'blue')));
})();

// ── TOAST ────────────────────────────────────
function toast(msg, type='ok') {
const el=document.getElementById('toast');
el.textContent=(type==='ok'?'✓ ':'✕ ')+msg;
el.className=`show ${type}`;
clearTimeout(toastT);
toastT=setTimeout(()=>el.classList.remove('show'),3000);
}

// Alias used in some places
function showToast(msg, type, duration) {
toast(msg, type);
}

// ── MODALS ───────────────────────────────────
function openModal(id) {
const el = document.getElementById(id);
if (!el) { console.warn('openModal: element not found:', id); return; }
el.style.removeProperty('display');
el.classList.add('open');
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(m=>{
m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); });
});

// ── SETTINGS — SIP bilgilerini kaydet ve bağlan ──
function saveSettings() {
const sipUser = document.getElementById('s-sip-user')?.value.trim()||'';
const sipPass = document.getElementById('s-sip-pass')?.value.trim()||'';
const apiKey  = document.getElementById('s-telnyx-key')?.value.trim()||'';
const connId  = document.getElementById('s-conn-id')?.value.trim()||'';
localStorage.setItem('mb-sip-user',   sipUser);
localStorage.setItem('mb-sip-pass',   sipPass);
localStorage.setItem('mb-telnyx-key', apiKey);
localStorage.setItem('mb-conn-id',    connId);
toast(currentLang==='tr'?'✓ Kaydedildi, bağlanıyor...':'✓ Gespeichert, verbinde...','ok');
updateConnectionStatus('connecting');
sendToRTC('MB_DISCONNECT');
setTimeout(()=>{ sendToRTC('MB_CONNECT',{sipUser,sipPass}); }, 600);
}

function loadSavedSettings() {
loadApiSettings();
const fields = {'s-sip-user':'mb-sip-user','s-sip-pass':'mb-sip-pass','s-telnyx-key':'mb-telnyx-key','s-conn-id':'mb-conn-id'};
Object.entries(fields).forEach(([elId,key])=>{
const el=document.getElementById(elId), val=localStorage.getItem(key);
if(el&&val) el.value=val;
});
}

// ── INIT ─────────────────────────────────────
document.getElementById('dash-date').textContent =
new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

// Takvim overlay'dan gelen mesajları dinle
window.addEventListener('message', (e) => {
if (!e.data?.type) return;
if (e.data.type === 'TAKVIM_BOOKED') {
closeTakvimPopup();
toast('🗓️ Termin takvime kaydedildi ✓', 'ok');
if (currentContact && dialerStatus === 'on_call') {
selectedOutcome = 'appointment';
const map = {appointment:'.ob-appointment'};
document.querySelectorAll('.outcome-btn').forEach(b=>b.style.outline='none');
document.querySelector(map.appointment)?.style.setProperty('outline','2px solid currentColor');
}
}
});
