// ─────────────────────────────────────────────
// UI — sidebar, navigasyon, tema, dil, toast, modaller
// ─────────────────────────────────────────────

// ── SIDEBAR ──────────────────────────────────
function toggleSidebar() {
const sb   = document.getElementById('sidebar');
const ov   = document.getElementById('sidebar-overlay');
const mob  = window.innerWidth <= 1024;
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
if (window.innerWidth > 1024) {
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
if (window.innerWidth <= 1024) closeSidebar();
if (page==='dashboard')  loadDashboard();
if (page==='campaigns')  loadCampaigns();
if (page==='agents')     loadAgents();
if (page==='stats')      { initStatsFilters(); loadStats(); }
if (page==='callhistory'){ initCallHistoryFilters(); loadCallHistory(); }
if (page==='export')       loadExportTerminPage();
if (page==='performance') loadPerformancePage();
if (page==='dialer')         initDialer();
if (page==='field')          loadFieldPage();
if (page==='fieldops')       loadFieldOpsPage();
if (page==='jobmarket') {
  loadJobMarketPage();
  if (typeof refreshJobMarketMap === 'function') {
    setTimeout(() => refreshJobMarketMap(), 0);
    setTimeout(() => refreshJobMarketMap(), 280);
  }
}
if (page==='myhistory')      { initMyHistoryFilters(); loadMyHistory(); }
if (page==='settings')       { loadSavedSettings(); loadRolesPage(); }
if (page==='settings')       { loadAppointmentResultsSettings(); }
if (page==='wiedervorlage')  loadWvPage();
if (page==='qc')             loadQcData();
if (page==='firms')          loadFirmsPage();
if (page==='settings')        { loadMesaiSettings(); loadCallHoursSettings(); loadChatSettingsPage(); loadFieldSettingsPage(); loadFeatureFlagsPage(); if (typeof loadAuditEventsPage==='function') loadAuditEventsPage(); }
if (page==='settings')        { if (typeof loadJobPermissionsSettings==='function') loadJobPermissionsSettings(); }
if (page==='field')          { if (typeof loadNotificationCenter === 'function') loadNotificationCenter(); }
if (page==='dialer')         { if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel(); }
if (page==='qc')             { if (typeof loadJobMarketQcQueue === 'function') loadJobMarketQcQueue(); }
if (page==='dashboard')      { if (typeof loadJobMarketKpi === 'function') loadJobMarketKpi(); }
if (page==='takvim')         loadTakvimPage();
if (page==='leave')          loadLeavePage();
if (page==='muhasebe')       loadMuhasebePage();
if (page==='maasim')         loadMaasimPage();
if (page==='performansim')   loadPerformansimPage();
if (page==='competition')     loadCompetitionPage();
}

window._apptResultsByFirm = window._apptResultsByFirm || {};
function _uiEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defaultAppointmentResults() {
  return [
    { key: 'qc_bekleniyor', label: 'QC Bekleniyor', color: '#2563eb', contact_status: 'qc bekleniyor', auto_move_down: false },
    { key: 'basarili', label: 'Başarılı', color: '#16a34a', contact_status: 'başarılı', auto_move_down: false },
    { key: 'basarisiz', label: 'Başarısız', color: '#dc2626', contact_status: 'başarısız', auto_move_down: true },
    { key: 'beklemede', label: 'Beklemede', color: '#f59e0b', contact_status: 'beklemede', auto_move_down: true },
    { key: 'ulasilamadi', label: 'Ulaşılamadı', color: '#64748b', contact_status: 'ulaşılamadı', auto_move_down: true },
    { key: 'iptal', label: 'İptal', color: '#b91c1c', contact_status: 'iptal', auto_move_down: true },
  ];
}

function _normResultKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function _normalizeResultColor(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '#64748b';
}

function appointmentResultToContactStatus(resultKey) {
  const k = _normResultKey(resultKey);
  const map = {
    qc_bekleniyor: 'qc bekleniyor',
    basarili: 'başarılı',
    basarisiz: 'başarısız',
    beklemede: 'beklemede',
    ulasilamadi: 'ulaşılamadı',
    iptal: 'iptal',
  };
  return map[k] || k.replaceAll('_', ' ');
}

function contactStatusToAppointmentResult(contactStatus) {
  const s = String(contactStatus || '').toLowerCase().trim();
  const map = {
    'qc bekleniyor': 'qc_bekleniyor',
    'başarılı': 'basarili',
    'başarısız': 'basarisiz',
    'beklemede': 'beklemede',
    'ulaşılamadı': 'ulasilamadi',
    'iptal': 'iptal',
  };
  return map[s] || _normResultKey(s.replaceAll(' ', '_'));
}

async function loadFirmAppointmentResults(fid, force = false) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return defaultAppointmentResults();
  if (!force && window._apptResultsByFirm[firmId]) return window._apptResultsByFirm[firmId];
  let settings = {};
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    settings = firms?.[0]?.settings || {};
  } catch (e) {}
  const raw = Array.isArray(settings?.appointment_results) ? settings.appointment_results : [];
  const norm = raw.length
    ? raw.map(r => ({
        key: _normResultKey(r?.key),
        label: String(r?.label || r?.key || '').trim(),
        color: String(r?.color || '').trim() || '#64748b',
        contact_status: String(r?.contact_status || appointmentResultToContactStatus(r?.key)).trim(),
        auto_move_down: !!r?.auto_move_down,
      })).filter(r => r.key && r.label)
    : defaultAppointmentResults();
  window._apptResultsByFirm[firmId] = norm;
  return norm;
}

async function loadAppointmentResultsSettings() {
  const box = document.getElementById('results-settings-card');
  const wrap = document.getElementById('s-appt-results-rows');
  const selectorHost = document.getElementById('results-firm-selector');
  if (!wrap || !box) return;
  const canEdit = ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
  box.style.display = canEdit ? '' : 'none';
  if (!canEdit) return;
  if (selectorHost) {
    renderFirmSelector('results-firm-selector', loadAppointmentResultsSettings);
    selectorHost.style.display = isSuperAdmin() ? '' : 'none';
  }
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px 0;">Termin sonuçlarını görmek için firma seçin.</div>`;
    return;
  }
  const rows = await loadFirmAppointmentResults(fid, true);
  renderAppointmentResultRows(rows);
}

function renderAppointmentResultRows(rows) {
  const wrap = document.getElementById('s-appt-results-rows');
  if (!wrap) return;
  const safe = rows?.length ? rows : [defaultAppointmentResults()[0]];
  wrap.innerHTML = safe.map((r, i) => `
    <div style="display:grid;grid-template-columns:180px 1fr 140px 170px auto;gap:8px;align-items:end;">
      <div class="form-row">
        <label class="form-label">Sonuç tipi</label>
        <select class="form-input" id="ar-type-${i}" onchange="syncAppointmentResultLabel(${i})">
          <option value="qc_bekleniyor" ${r.key==='qc_bekleniyor'?'selected':''}>QC Bekleniyor</option>
          <option value="basarili" ${r.key==='basarili'?'selected':''}>Başarılı</option>
          <option value="basarisiz" ${r.key==='basarisiz'?'selected':''}>Başarısız</option>
          <option value="beklemede" ${r.key==='beklemede'?'selected':''}>Beklemede</option>
          <option value="ulasilamadi" ${r.key==='ulasilamadi'?'selected':''}>Ulaşılamadı</option>
          <option value="iptal" ${r.key==='iptal'?'selected':''}>İptal</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Görünen ad</label><input class="form-input" id="ar-label-${i}" value="${_uiEsc(r.label||'')}"></div>
      <div class="form-row"><label class="form-label">Renk</label><input class="form-input" id="ar-color-${i}" type="color" value="${_uiEsc(_normalizeResultColor(r.color))}"></div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;padding-bottom:8px;"><input type="checkbox" id="ar-move-${i}" ${r.auto_move_down?'checked':''}> Otomatik alta taşı</label>
      <button class="btn btn-ghost btn-sm" type="button" onclick="removeAppointmentResultRow(${i})">Sil</button>
    </div>
  `).join('');
  wrap.dataset.count = String(safe.length);
}

function syncAppointmentResultLabel(idx) {
  const t = document.getElementById(`ar-type-${idx}`)?.value || '';
  const l = document.getElementById(`ar-label-${idx}`);
  if (!l) return;
  const map = {
    qc_bekleniyor: 'QC Bekleniyor',
    basarili: 'Başarılı',
    basarisiz: 'Başarısız',
    beklemede: 'Beklemede',
    ulasilamadi: 'Ulaşılamadı',
    iptal: 'İptal',
  };
  if (!String(l.value || '').trim()) l.value = map[t] || t;
}

function readAppointmentResultRows() {
  const wrap = document.getElementById('s-appt-results-rows');
  const count = Number(wrap?.dataset.count || 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const key = _normResultKey(document.getElementById(`ar-type-${i}`)?.value || '');
    const label = String(document.getElementById(`ar-label-${i}`)?.value || '').trim() || key;
    const color = _normalizeResultColor(document.getElementById(`ar-color-${i}`)?.value || '#64748b');
    const auto_move_down = !!document.getElementById(`ar-move-${i}`)?.checked;
    if (!key) continue;
    out.push({ key, label, color, contact_status: appointmentResultToContactStatus(key), auto_move_down });
  }
  return out;
}

function addAppointmentResultRow() {
  const cur = readAppointmentResultRows();
  cur.push({ key: 'beklemede', label: 'Beklemede', color: '#f59e0b', contact_status: 'beklemede', auto_move_down: true });
  renderAppointmentResultRows(cur);
}

function removeAppointmentResultRow(idx) {
  const cur = readAppointmentResultRows().filter((_, i) => i !== idx);
  renderAppointmentResultRows(cur);
}

async function saveAppointmentResultsSettings() {
  const box = document.getElementById('results-settings-card');
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!box || box.style.display === 'none') return;
  if (!fid) { toast('Önce firma seçin', 'warn'); return; }
  const parsed = readAppointmentResultRows();
  if (!parsed.length) { toast('En az bir sonuç girin', 'err'); return; }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, appointment_results: parsed } }),
    });
    window._apptResultsByFirm[fid] = parsed;
    toast('Termin sonuçları kaydedildi', 'ok');
  } catch (e) {
    toast('Kaydetme hatası: ' + e.message, 'err');
  }
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
if (typeof _dashGetRange === 'function' && typeof _dashUpdateStatLabels === 'function' && typeof _dashUpdateCardTitles === 'function' &&
    document.getElementById('page-dashboard')?.classList.contains('active')) {
  const rk = _dashGetRange();
  _dashUpdateStatLabels(rk);
  _dashUpdateCardTitles(rk);
  const subEl = document.getElementById('dash-chart-sub');
  if (subEl && currentUser?.role === 'agent') {
    subEl.textContent = currentLang === 'tr' ? 'Senin çağrıların (seçili aralık)' : 'Deine Anrufe (Zeitraum)';
  }
}
if (typeof dialerStatus !== 'undefined' && dialerStatus === 'break' && typeof refreshBreakCustEmpty === 'function') {
  refreshBreakCustEmpty();
}
if (typeof dialerStatus !== 'undefined' && dialerStatus === 'on_call' && typeof refreshHangupFinalizeButton === 'function') {
  refreshHangupFinalizeButton();
}
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

let _systemDialogResolve = null;
let _systemDialogType = 'alert';

function _openSystemDialog({ type = 'alert', title = 'Bildirim', message = '', defaultValue = '', okText = 'Tamam', cancelText = 'İptal' }) {
  return new Promise((resolve) => {
    const ov = document.getElementById('m-system-dialog');
    const titleEl = document.getElementById('sysdlg-title');
    const msgEl = document.getElementById('sysdlg-message');
    const inputWrap = document.getElementById('sysdlg-input-wrap');
    const input = document.getElementById('sysdlg-input');
    const ok = document.getElementById('sysdlg-ok');
    const cancel = document.getElementById('sysdlg-cancel');
    if (!ov || !titleEl || !msgEl || !inputWrap || !input || !ok || !cancel) {
      if (type === 'confirm') return resolve(false);
      if (type === 'prompt') return resolve(null);
      return resolve(true);
    }
    _systemDialogType = type;
    _systemDialogResolve = resolve;
    titleEl.textContent = title;
    msgEl.textContent = message || '';
    ok.textContent = okText || 'Tamam';
    cancel.textContent = cancelText || 'İptal';
    cancel.style.display = type === 'alert' ? 'none' : '';
    inputWrap.style.display = type === 'prompt' ? '' : 'none';
    input.value = defaultValue == null ? '' : String(defaultValue);
    openModal('m-system-dialog');
    setTimeout(() => {
      if (type === 'prompt') input.focus();
      else ok.focus();
    }, 0);
  });
}

function closeSystemDialog(ok) {
  const ov = document.getElementById('m-system-dialog');
  if (!ov || !_systemDialogResolve) return;
  const resolve = _systemDialogResolve;
  _systemDialogResolve = null;
  closeModal('m-system-dialog');
  const input = document.getElementById('sysdlg-input');
  if (_systemDialogType === 'confirm') resolve(!!ok);
  else if (_systemDialogType === 'prompt') resolve(ok ? (input?.value ?? '') : null);
  else resolve(true);
}

async function mbAlert(message, title = 'Bilgi') {
  await _openSystemDialog({ type: 'alert', title, message, okText: 'Tamam' });
}

async function mbConfirm(message, title = 'Onay') {
  return await _openSystemDialog({ type: 'confirm', title, message, okText: 'Evet', cancelText: 'Hayır' });
}

async function mbPrompt(message, defaultValue = '', title = 'Girdi') {
  return await _openSystemDialog({ type: 'prompt', title, message, defaultValue, okText: 'Kaydet', cancelText: 'İptal' });
}

// Safety: legacy code paths calling native dialogs get redirected to in-app.
window.alert = (msg) => { mbAlert(String(msg ?? '')); };
window.confirm = (msg) => { console.warn('Use mbConfirm instead of confirm:', msg); return false; };
window.prompt = (msg, def) => { console.warn('Use mbPrompt instead of prompt:', msg); return null; };

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

document.addEventListener('keydown', (e) => {
  const ov = document.getElementById('m-system-dialog');
  if (!ov || !ov.classList.contains('open')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSystemDialog(false);
  } else if (e.key === 'Enter') {
    const typePrompt = document.getElementById('sysdlg-input-wrap')?.style.display !== 'none';
    if (typePrompt || document.activeElement?.id === 'sysdlg-ok') {
      e.preventDefault();
      closeSystemDialog(true);
    }
  }
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
