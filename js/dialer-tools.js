// Mola, harita, gelen arama ve test
// ── Break / Mola modal ────────────────────────
const AUX_LABEL_KEY = {
  'Yemek Molası': 'dial.break.meal',
  'Çay Molası': 'dial.break.tea',
  'Lavabo': 'dial.break.wc',
  'Toplantı': 'dial.break.meet',
  'Teknik Sorun': 'dial.break.tech',
};

function auxDisplay(code) {
  const raw = String(code || '');
  const key = AUX_LABEL_KEY[raw];
  if (!key || typeof t !== 'function') return raw;
  const label = t(key);
  return label && label !== key ? label : raw;
}

function openBreakModal() {
  const auxCodes = window._campAuxCodes || DEFAULT_AUX_CODES;
  const old = document.getElementById('m-break-select');
  if (old) old.remove();
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const m = document.createElement('div');
  m.id = 'm-break-select';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div style="background:var(--bg-2);border-radius:var(--radius);padding:20px;width:280px;box-shadow:0 16px 48px rgba(0,0,0,.3);">
<div style="font-size:14px;font-weight:800;margin-bottom:12px;">${esc(typeof t === 'function' ? t('dial.break.title') : 'Mola türü seç')}</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${auxCodes.map((c) => {
  const raw = String(c).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<button onclick="selectBreakCode('${raw}');this.closest('#m-break-select').remove();"
style="padding:10px 14px;border:1px solid var(--border);background:var(--bg-3);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;text-align:left;color:var(--text);">${esc(auxDisplay(c))}</button>`;
}).join('')}
</div>
<button onclick="this.closest('#m-break-select').remove();"
style="margin-top:10px;width:100%;padding:8px;background:transparent;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-3);">${esc(typeof t === 'function' ? t('dial.break.close') : 'Kapat')}</button>
</div>`;
  document.body.appendChild(m);
}

async function selectBreakCode(code) {
  _breakCode = code;
  refreshBreakCustEmpty();
  toast(`☕ ${auxDisplay(code)}`, 'ok', 2000);
  upsertAgentSession({agent_id:currentUser.id,status:'break',break_code:code,last_seen:new Date().toISOString()}).catch(()=>{});
}

// ── Auto-dial ─────────────────────────────────
function toggleAutoDial() {
  const allowedCount = getAutoDialCampaignIds().length;
  if (!allowedCount) {
    _autoDial = false;
    refreshAutoDialUi();
    toast(typeof t === 'function' ? t('dial.autodial_no_perm_camps') : 'Aktif kampanyalarda otomatik arama izni yok', 'warn', 2200);
    return;
  }
  _autoDial = !_autoDial;
  toast(_autoDial ? '⚡ Otomatik arama açık' : '⏸ Otomatik arama kapalı', 'ok', 1500);
  refreshAutoDialUi();
}

// ── Gamification ──────────────────────────────
function updateDailyProgress(apptCount, customGoal) {
  _dailyAppointments = apptCount;
  const el = document.getElementById('daily-progress-bar');
  const label = document.getElementById('daily-progress-label');
  if (!el) return;
  const goal = customGoal || _dailyGoal;
  const pct = Math.min(100, Math.round((apptCount/goal)*100));
  el.style.width = pct + '%';
  el.style.background = pct>=100 ? 'var(--green)' : pct>=60 ? 'var(--yellow)' : 'var(--accent)';
  const apptWord = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Termin' : 'Randevu';
  if (label) label.textContent = `${apptCount}/${goal} ${apptWord}`;
  const foldCount = document.getElementById('goal-fold-count');
  if (foldCount) foldCount.textContent = `${apptCount}/${goal} ${apptWord}`;
  if (pct>=100 && !_confettiShown && _goalTab==='daily') { _confettiShown = true; launchConfetti(); }
}

function launchConfetti() {
  const colors = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  for (let i=0; i<80; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random()*colors.length)];
    const size = Math.random()*8+4;
    const left = Math.random()*100;
    const delay = Math.random()*2;
    const duration = Math.random()*2+2;
    piece.style.cssText = `position:absolute;top:-20px;left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random()>0.5?'50%':'2px'};animation:confetti-fall ${duration}s ${delay}s ease-in forwards;`;
    container.appendChild(piece);
  }
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `@keyframes confetti-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}`;
    document.head.appendChild(style);
  }
  setTimeout(() => container.remove(), 5000);
  toast(typeof t === 'function' ? t('dial.daily_goal') : '🎉 Günlük hedefe ulaştınız!', 'ok', 4000);
}

// ── Hotkeys ───────────────────────────────────
function toggleDialerFold(which) {
  const id = which === 'camps' ? 'agent-camps-panel' : which === 'goal' ? 'daily-goal-bar' : 'dialer-page-hdr';
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.classList.contains('is-collapsed');
  el.classList.toggle('is-collapsed', !open);
  const btn = el.querySelector('.dialer-fold-toggle');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderHotkeyHints() {
  const el = document.getElementById('hotkey-hints');
  if (!el) return;
  el.innerHTML = `
<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--text-3);">
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Space</kbd> ${t('dial.hk.mute')}</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Enter</kbd> ${t('dial.hk.next')}</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">1-4</kbd> ${t('dial.hk.result')}</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">S</kbd> ${t('dial.hk.save')}</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Esc</kbd> ${t('dial.hk.close')}</span>
</div>`;
}

document.addEventListener('keydown', e => {
  if (!_hotkeysEnabled) return;
  const tag = e.target.tagName.toLowerCase();
  if (tag==='input'||tag==='textarea'||tag==='select') return;
  if (e.altKey||e.ctrlKey||e.metaKey) return;
  const dialerPage = document.getElementById('page-dialer');
  if (!dialerPage?.classList.contains('active')) return;
  switch(e.code) {
    case 'Space': e.preventDefault(); if (dialerStatus==='on_call') toggleMute(); break;
    case 'Enter':
      e.preventDefault();
      if (dialerStatus==='on_call') hangup();
      else if (dialerStatus==='ready') getNextContact();
      break;
    case 'Digit1': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('appointment'); e.preventDefault(); } break;
    case 'Digit2': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('negative'); e.preventDefault(); } break;
    case 'Digit3': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('callback'); e.preventDefault(); } break;
    case 'Digit4': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('no_answer'); e.preventDefault(); } break;
    case 'Digit5': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('voicemail'); e.preventDefault(); } break;
    case 'KeyS': e.preventDefault(); if (dialerStatus==='wrapping') submitOutcome(); break;
    case 'Escape':
      if (typeof toggleNotificationCenter === 'function') {
        const notif = document.getElementById('notification-center');
        if (notif && notif.style.display === 'block') {
          toggleNotificationCenter(false);
          e.preventDefault();
          break;
        }
      }
      document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
      document.querySelectorAll('[class*="modal-overlay"][style*="block"]').forEach(m=>m.style.display='none');
      break;
  }
});

// ── Clipboard ─────────────────────────────────
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  });
}

// ── Google Maps / API settings ────────────────
function initGoogleMaps(apiKey) {
  _googleApiKey = apiKey;
  localStorage.setItem('mb_google_key', apiKey);
}

function loadApiSettings() {
  const gk = localStorage.getItem('mb_google_key') || DEFAULT_GOOGLE_KEY;
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  const goal = localStorage.getItem('mb_daily_goal') || '5';
  const wGoal = localStorage.getItem('mb_weekly_goal') || '25';
  const mGoal = localStorage.getItem('mb_monthly_goal') || '100';
  _googleApiKey = gk;
  if (document.getElementById('s-google-key')) document.getElementById('s-google-key').value = gk;
  if (document.getElementById('s-tomtom-key')) document.getElementById('s-tomtom-key').value = tk;
  if (document.getElementById('s-daily-goal')) document.getElementById('s-daily-goal').value = goal;
  if (document.getElementById('s-weekly-goal')) document.getElementById('s-weekly-goal').value = wGoal;
  if (document.getElementById('s-monthly-goal')) document.getElementById('s-monthly-goal').value = mGoal;
  _dailyGoal = parseInt(goal);
  window._weeklyGoal = parseInt(wGoal, 10) || 25;
  window._monthlyGoal = parseInt(mGoal, 10) || 100;
  updateCustEmptyMascotScale();
}

let _mbIntegFirmId = null;

function mbIntegEmpty() {
  return {
    google_key: '',
    tomtom_key: '',
    telnyx_api_key: '',
    sip_connection_id: '',
    sip_username: '',
    sip_password: '',
  };
}

function mbNormalizeFirmIntegrations(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const out = mbIntegEmpty();
  Object.keys(out).forEach((key) => { out[key] = String(d[key] || '').trim(); });
  return out;
}

async function mbLoadFirmIntegrations(firmId) {
  if (!firmId || typeof sb !== 'function') return mbIntegEmpty();
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  return mbNormalizeFirmIntegrations(rows?.[0]?.settings?.integrations);
}

async function mbSaveFirmIntegrations(firmId, patch) {
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`);
  const existing = rows?.[0]?.settings || {};
  const integrations = mbNormalizeFirmIntegrations({ ...(existing.integrations || {}), ...(patch || {}) });
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, integrations } }),
  });
  return integrations;
}

function mbApplyFirmIntegrationsLocal(cfg, connect) {
  const line = mbNormalizeFirmIntegrations(cfg);
  if (line.google_key) {
    _googleApiKey = line.google_key;
    try { localStorage.setItem('mb_google_key', line.google_key); } catch (e) {}
  }
  if (line.tomtom_key) {
    try { localStorage.setItem('mb_tomtom_key', line.tomtom_key); } catch (e) {}
  }
  if (line.telnyx_api_key) {
    try { localStorage.setItem('mb-telnyx-key', line.telnyx_api_key); } catch (e) {}
  }
  if (line.sip_connection_id) {
    try { localStorage.setItem('mb-conn-id', line.sip_connection_id); } catch (e) {}
  }
  if (line.sip_username) {
    try { localStorage.setItem('mb-sip-user', line.sip_username); } catch (e) {}
  }
  if (line.sip_password) window.__mbSipPass = line.sip_password;
  try { localStorage.removeItem('mb-sip-pass'); } catch (e) {}
  if (connect && line.sip_username && line.sip_password && typeof sendToRTC === 'function') {
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting');
    if (typeof sendToRTC === 'function') sendToRTC('MB_DISCONNECT');
    setTimeout(() => sendToRTC('MB_CONNECT', { sipUser: line.sip_username, sipPass: line.sip_password }), 600);
  }
  return line;
}

async function mbBootFirmIntegrations() {
  const fid = currentUser?.firm_id;
  if (!fid) return mbIntegEmpty();
  let cfg = await mbLoadFirmIntegrations(fid);
  const blank = !Object.values(cfg).some(Boolean);
  const ownAccount = !(typeof _impersonation !== 'undefined' && _impersonation);
  if (blank && ownAccount && typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()) {
    const seed = mbNormalizeFirmIntegrations({
      google_key: localStorage.getItem('mb_google_key') || '',
      tomtom_key: localStorage.getItem('mb_tomtom_key') || '',
      telnyx_api_key: localStorage.getItem('mb-telnyx-key') || '',
      sip_connection_id: localStorage.getItem('mb-conn-id') || '',
      sip_username: localStorage.getItem('mb-sip-user') || '',
      sip_password: window.__mbSipPass || localStorage.getItem('mb-sip-pass') || '',
    });
    if (Object.values(seed).some(Boolean)) cfg = await mbSaveFirmIntegrations(fid, seed);
  }
  return mbApplyFirmIntegrationsLocal(cfg, true);
}

async function mbPrepareIntegFirmSelects() {
  if (!(typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin())) return;
  let firms = (typeof _allFirms !== 'undefined' && _allFirms?.length) ? _allFirms : [];
  if (!firms.length && typeof sb === 'function') {
    firms = await sb('firms?select=id,name&order=name.asc').catch(() => []) || [];
  }
  const html = firms.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name || '')}</option>`).join('');
  const preferred = _mbIntegFirmId || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  ['integ-api-firm', 'integ-line-firm'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    if (preferred && [...el.options].some((opt) => opt.value === String(preferred))) el.value = String(preferred);
  });
  _mbIntegFirmId = document.getElementById('integ-api-firm')?.value || preferred || currentUser?.firm_id || null;
}

function mbFillIntegForms(cfg) {
  const line = mbNormalizeFirmIntegrations(cfg);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  set('s-google-key', line.google_key);
  set('s-tomtom-key', line.tomtom_key || (typeof DEFAULT_TOMTOM_KEY !== 'undefined' ? DEFAULT_TOMTOM_KEY : ''));
  set('s-telnyx-key', line.telnyx_api_key);
  set('s-conn-id', line.sip_connection_id);
  set('s-sip-user', line.sip_username);
  set('s-sip-pass', line.sip_password);
  const fid = (typeof _mbIntegFirmId !== 'undefined' && _mbIntegFirmId) || currentUser?.firm_id;
  if (fid && typeof mbFillFxForm === 'function') mbFillFxForm(fid);
}

async function mbFillFxForm(fid) {
  const sel = document.getElementById('s-fx-provider');
  if (!sel || !fid || typeof loadFirmPayrollRules !== 'function') return;
  const rules = await loadFirmPayrollRules(fid, true);
  sel.value = rules.fx_api_provider || 'frankfurter';
  const url = document.getElementById('s-fx-url');
  const key = document.getElementById('s-fx-key');
  if (url) url.value = rules.fx_api_url || '';
  if (key) key.value = rules.fx_api_key || '';
  if (typeof onFxProviderChange === 'function') onFxProviderChange();
}

async function saveFirmFxApi(fid) {
  const sel = document.getElementById('s-fx-provider');
  if (!sel || !fid) return;
  const provider = sel.value || 'frankfurter';
  const url = document.getElementById('s-fx-url')?.value?.trim() || '';
  const key = document.getElementById('s-fx-key')?.value?.trim() || '';
  const firms = await sb(`firms?id=eq.${fid}&select=settings`);
  const settings = { ...(firms?.[0]?.settings || {}) };
  settings.payroll = { ...(settings.payroll || {}), fx_api_provider: provider, fx_api_url: url, fx_api_key: key };
  await sb(`firms?id=eq.${fid}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ settings }) });
  const exists = await sb(`payroll_rules?firm_id=eq.${fid}&select=id`).catch(() => []);
  if (exists?.length) {
    await sb(`payroll_rules?firm_id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ fx_api_provider: provider, fx_api_url: url, fx_api_key: key, updated_at: new Date().toISOString() }),
    });
  }
  if (window._payrollRulesCacheByFirm) delete window._payrollRulesCacheByFirm[fid];
}

async function mbIntegFirmChanged(from) {
  const id = from === 'line' ? 'integ-line-firm' : 'integ-api-firm';
  _mbIntegFirmId = document.getElementById(id)?.value || null;
  const other = document.getElementById(from === 'line' ? 'integ-api-firm' : 'integ-line-firm');
  if (other && _mbIntegFirmId) other.value = _mbIntegFirmId;
  mbFillIntegForms(await mbLoadFirmIntegrations(_mbIntegFirmId));
}

function readGoalInputs() {
  const clamp = (v, fallback, max) => {
    const n = parseInt(v, 10);
    if (!n || n < 1) return fallback;
    return Math.min(max, n);
  };
  return {
    daily: clamp(document.getElementById('s-daily-goal')?.value, 5, 50),
    weekly: clamp(document.getElementById('s-weekly-goal')?.value, 25, 400),
    monthly: clamp(document.getElementById('s-monthly-goal')?.value, 100, 1600),
  };
}

function applyGoalNumbers(daily, weekly, monthly) {
  const nums = {
    daily: Math.min(50, Math.max(1, parseInt(daily, 10) || 5)),
    weekly: Math.min(400, Math.max(1, parseInt(weekly, 10) || 25)),
    monthly: Math.min(1600, Math.max(1, parseInt(monthly, 10) || 100)),
  };
  _dailyGoal = nums.daily;
  window._weeklyGoal = nums.weekly;
  window._monthlyGoal = nums.monthly;
  localStorage.setItem('mb_daily_goal', String(nums.daily));
  localStorage.setItem('mb_weekly_goal', String(nums.weekly));
  localStorage.setItem('mb_monthly_goal', String(nums.monthly));
  if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  return nums;
}

async function loadFirmAppointmentGoals() {
  const fid = currentUser?.firm_id;
  if (!fid || typeof sb !== 'function') return;
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const g = rows?.[0]?.settings?.goals;
    if (!g || g.daily == null) return;
    applyGoalNumbers(g.daily, g.weekly, g.monthly);
  } catch (_) {}
}

let _goalFirmId = null;

async function loadGoalSettingsForm() {
  const row = document.getElementById('goal-firm-row');
  const sel = document.getElementById('goal-firm-select');
  if (!row && !document.getElementById('s-daily-goal')) return;
  const superAdmin = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  if (row) row.style.display = superAdmin ? '' : 'none';
  let fid = currentUser?.firm_id || '';
  if (superAdmin && sel) {
    if (!sel.options.length) {
      const firms = await sb('firms?select=id,name&order=name.asc').catch(() => []);
      sel.innerHTML = (firms || []).map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name || '')}</option>`).join('');
    }
    if (!_goalFirmId) _goalFirmId = sel.value || fid;
    if (_goalFirmId) sel.value = _goalFirmId;
    fid = sel.value || fid;
  }
  _goalFirmId = fid;
  let g = {};
  if (fid) {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
    g = rows?.[0]?.settings?.goals || {};
  }
  const daily = document.getElementById('s-daily-goal');
  const weekly = document.getElementById('s-weekly-goal');
  const monthly = document.getElementById('s-monthly-goal');
  if (daily) daily.value = g.daily || localStorage.getItem('mb_daily_goal') || '5';
  if (weekly) weekly.value = g.weekly || localStorage.getItem('mb_weekly_goal') || '25';
  if (monthly) monthly.value = g.monthly || localStorage.getItem('mb_monthly_goal') || '100';
}

async function onGoalFirmChange() {
  _goalFirmId = document.getElementById('goal-firm-select')?.value || null;
  await loadGoalSettingsForm();
}

async function saveGoalSettings() {
  const superAdmin = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const fid = (superAdmin ? document.getElementById('goal-firm-select')?.value : currentUser?.firm_id) || '';
  if (!fid) { toast(t('goal.need'), 'err'); return; }
  const nums = readGoalInputs();
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = rows?.[0]?.settings && typeof rows[0].settings === 'object' ? rows[0].settings : {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...settings, goals: nums } }),
    });
    if (String(fid) === String(currentUser?.firm_id || '')) applyGoalNumbers(nums.daily, nums.weekly, nums.monthly);
    toast(t('goal.saved'), 'ok');
  } catch (e) {
    toast(t('goal.fail'), 'err');
  }
}

async function saveApiSettings() {
  const gk = document.getElementById('s-google-key')?.value?.trim() || '';
  const tk = document.getElementById('s-tomtom-key')?.value?.trim() || '';
  if (typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()) {
    const fid = _mbIntegFirmId || currentUser?.firm_id;
    if (fid) {
      const prev = await mbLoadFirmIntegrations(fid);
      const saved = await mbSaveFirmIntegrations(fid, {
        google_key: gk || prev.google_key,
        tomtom_key: tk || prev.tomtom_key,
      });
      if (String(fid) === String(currentUser?.firm_id)) mbApplyFirmIntegrationsLocal(saved, false);
      if (typeof saveFirmFxApi === 'function') await saveFirmFxApi(fid);
    }
  }
  toast(typeof t === 'function' ? t('dial.api_saved') : 'API ayarları kaydedildi ✓','ok');
}

// ── Call rules (Ruhezeit) ─────────────────────
function getGermanHolidays(year) {
  const holidays = new Set();
  [[1,1],[5,1],[10,3],[10,26],[11,1],[12,25],[12,26]].forEach(([m,d])=>{
    holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  });
  const a=year%19,b=Math.floor(year/100),cc=year%100;
  const d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d2-g+15)%30,i=Math.floor(cc/4),k=cc%4;
  const l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m2+114)/31),day=((h+l-7*m2+114)%31)+1;
  const easter = new Date(year,month-1,day);
  const addDays = (d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r.toISOString().split('T')[0];};
  holidays.add(addDays(easter,-2)); holidays.add(addDays(easter,0));
  holidays.add(addDays(easter,1));  holidays.add(addDays(easter,39));
  holidays.add(addDays(easter,49)); holidays.add(addDays(easter,50));
  return holidays;
}

function isGermanHoliday(dateStr) {
  return getGermanHolidays(parseInt(dateStr.split('-')[0])).has(dateStr);
}

function isCallAllowed(dateStr, timeStr) {
  const d   = new Date(dateStr + 'T' + timeStr);
  const day = d.getDay();
  const toMin = t => { const [hh,mm] = (t||'00:00').split(':').map(Number); return hh*60+mm; };
  const nowMin = toMin(timeStr.slice(0,5));

  // Firma ayarlarına bak, yoksa Almanya yasal saatleri varsayılan
  const ch = _callHours || {};
  const wdStart      = ch.weekday_start   || '09:00';
  const wdEnd        = ch.weekday_end     || '20:00';
  const satAllowed   = ch.sat_allowed     !== false;
  const satStart     = ch.sat_start       || '09:00';
  const satEnd       = ch.sat_end         || '13:00';
  const sunAllowed   = !!ch.sun_allowed;
  const holidayCheck = ch.holiday_check   !== false;

  if (day === 0 && !sunAllowed)
    return {allowed:false, reason:'Pazar günü arama yapılamaz'};
  if (holidayCheck && isGermanHoliday(dateStr))
    return {allowed:false, reason:'Tatil günü arama yapılamaz'};
  if (day === 6) {
    if (!satAllowed)
      return {allowed:false, reason:'Cumartesi arama yapılamaz'};
    if (nowMin < toMin(satStart) || nowMin >= toMin(satEnd))
      return {allowed:false, reason:`Cumartesi ${satStart}–${satEnd} arası arama yapılabilir`};
  } else if (day !== 0) {
    if (nowMin < toMin(wdStart) || nowMin >= toMin(wdEnd))
      return {allowed:false, reason:`Sessizlik saati (${wdStart}–${wdEnd} arası arama yapılabilir)`};
  }
  return {allowed:true};
}

function checkCallAllowed() {
  const clock = typeof dialerBusinessClock === 'function' ? dialerBusinessClock() : { dateStr: new Date().toISOString().split('T')[0], timeStr: new Date().toTimeString().slice(0, 8) };
  const dateStr = clock.dateStr;
  const timeStr = clock.timeStr;
  const check = isCallAllowed(dateStr, timeStr);
  if (!check.allowed) { toast(typeof tReplace === 'function' ? tReplace('dial.call_not_allowed', { reason: check.reason }) : ('⚠️ ' + check.reason), 'err', 5000); return false; }
  return true;
}

// ── Gelen arama (firma ayarı + test simülasyonu) ─────────────────
function _normalizeFirmDialerSettings(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    incoming_super_enabled: !!d.incoming_super_enabled,
    incoming_enabled: !!d.incoming_enabled,
    incoming_external: !!d.incoming_external,
    incoming_show_routing_admin: d.incoming_show_routing_admin !== false,
    mascot_age_coeff: Number.isFinite(Number(d.mascot_age_coeff)) ? Math.max(1, Math.min(30, Number(d.mascot_age_coeff))) : 10,
  };
}

async function loadFirmDialerSettingsCache() {
  if (!currentUser?.firm_id) {
    window._firmDialerSettings = _normalizeFirmDialerSettings({});
    return window._firmDialerSettings;
  }
  try {
    const rows = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const d = rows?.[0]?.settings?.dialer || {};
    window._firmDialerSettings = _normalizeFirmDialerSettings(d);
  } catch (e) {
    window._firmDialerSettings = _normalizeFirmDialerSettings({});
  }
  refreshGlobalMascotInfoPanel();
  return window._firmDialerSettings;
}

function stopInboundTestSimulationScheduler() {
  if (_inboundSimTimer) {
    clearTimeout(_inboundSimTimer);
    _inboundSimTimer = null;
  }
}

function restartInboundTestSimulationScheduler() {
  stopInboundTestSimulationScheduler();
  const page = document.getElementById('page-dialer');
  if (!page?.classList.contains('active')) return;
  /** Kullanıcı akışı: test modunda otomatik "yeni gelen çağrı" simülasyonu çalışmasın. */
  if (_testMode) return;
  const tick = () => {
    const gap = _testMode
      ? 12000 + Math.floor(Math.random() * 10000)
      : 26000 + Math.floor(Math.random() * 24000);
    _inboundSimTimer = setTimeout(async () => {
      await tickInboundTestSimulation();
      tick();
    }, gap);
  };
  tick();
}

function _canShowInboundRoutingDetail() {
  const s = window._firmDialerSettings || {};
  if (!s.incoming_show_routing_admin) return false;
  const role = currentUser?.role || '';
  return ['firm_admin', 'admin', 'super_admin'].includes(role);
}

function mbInboundCaller(call) {
  const o = call?.options || {};
  return String(o.remoteCallerNumber || o.callerNumber || o.caller_id_number || call?.remoteCallerNumber || call?.callerNumber || '').trim();
}

function mbInboundVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return [];
  const out = new Set([String(raw || '').trim(), digits, `+${digits}`]);
  if (digits.startsWith('49') && digits.length > 4) out.add(`0${digits.slice(2)}`);
  if (digits.startsWith('0') && digits.length > 4) {
    out.add(`49${digits.slice(1)}`);
    out.add(`+49${digits.slice(1)}`);
  }
  return [...out].filter(Boolean).slice(0, 6);
}

async function mbFindInboundContact(fid, phone) {
  const vars = mbInboundVariants(phone);
  if (!fid || !vars.length) return null;
  for (const value of vars) {
    const enc = encodeURIComponent(value);
    const byPhone = await sb(`contacts?firm_id=eq.${fid}&phone=eq.${enc}&select=*&limit=1`).catch(() => []);
    if (byPhone?.[0]) return byPhone[0];
    const byAlt = await sb(`contacts?firm_id=eq.${fid}&phone2=eq.${enc}&select=*&limit=1`).catch(() => []);
    if (byAlt?.[0]) return byAlt[0];
  }
  return null;
}

async function mbInboundOwnerOf(fid, contact, phone) {
  const parts = [];
  if (contact?.id && typeof isValidUUID === 'function' && isValidUUID(contact.id)) parts.push(`contact_id.eq.${contact.id}`);
  mbInboundVariants(contact?.phone || phone).forEach((value) => parts.push(`phone.eq.${encodeURIComponent(value)}`));
  if (!parts.length) return null;
  let rows = await sb(`call_logs?firm_id=eq.${fid}&or=(${parts.join(',')})&order=started_at.desc&limit=15&select=agent_id,outcome,users(name)`).catch(() => null);
  if (rows == null) {
    rows = await sb(`call_logs?firm_id=eq.${fid}&or=(${parts.join(',')})&order=started_at.desc&limit=15&select=agent_id,outcome`).catch(() => []) || [];
  }
  const list = rows || [];
  const scored = list.find((row) => row.agent_id && row.outcome && row.outcome !== 'no_answer') || list.find((row) => row.agent_id);
  if (!scored?.agent_id) return null;
  let name = scored.users?.name || '';
  if (!name) {
    const user = await sb(`users?id=eq.${scored.agent_id}&select=name&limit=1`).catch(() => []);
    name = user?.[0]?.name || '';
  }
  return { id: scored.agent_id, name: name || '—' };
}

async function mbResolveInbound(phone) {
  const fid = currentUser?.firm_id;
  if (!fid || !phone) return null;
  await loadFirmDialerSettingsCache();
  const settings = window._firmDialerSettings || {};
  const found = await mbFindInboundContact(fid, phone);
  const external = !found;
  if (external && !settings.incoming_external) return null;
  const owner = found ? await mbInboundOwnerOf(fid, found, phone) : null;
  const since = new Date(Date.now() - 90000).toISOString();
  const ready = await sb(`agent_sessions?firm_id=eq.${fid}&status=eq.ready&last_seen=gte.${encodeURIComponent(since)}&select=agent_id,agent_name,last_seen&order=last_seen.asc&limit=200`).catch(() => []) || [];
  const ownerReady = !!(owner && ready.some((row) => row.agent_id === owner.id));
  let targetId = null;
  let suggest = false;
  if (ownerReady) targetId = owner.id;
  else if (ready.length) {
    targetId = ready[0].agent_id;
    suggest = !!(owner && owner.id !== targetId);
  }
  const displayName = found ? `${found.first_name || ''} ${found.last_name || ''}`.trim() || phone : phone;
  const contact = found || {
    id: `in-${Date.now()}`,
    phone,
    first_name: typeof t === 'function' ? t('dial.contact_inbound') : 'Gelen',
    last_name: '',
    firm_id: fid,
    campaign_id: typeof selectedCampId !== 'undefined' ? selectedCampId : null,
    status: 'pending',
    attempt_count: 0,
  };
  let detail = '';
  if (ownerReady && owner) {
    detail = typeof tReplace === 'function' ? tReplace('dial.inbound_route_last', { name: owner.name ? ` (${owner.name})` : '' }) : '';
  } else if (suggest && owner) {
    detail = typeof tReplace === 'function' ? tReplace('dial.inbound_owner_suggest', { name: owner.name || '—' }) : '';
  } else if (ready[0]) {
    detail = typeof tReplace === 'function' ? tReplace('dial.inbound_route_next', { name: ready[0].agent_name || '—' }) : '';
  }
  return { contact, owner, ownerReady, targetId, suggest, external, displayName, detail, phone };
}

async function mbOfferInboundCall(call) {
  const id = String(call?.id || '');
  window._mbInboundSeen = window._mbInboundSeen || new Set();
  if (id && window._mbInboundSeen.has(id)) return;
  if (id) window._mbInboundSeen.add(id);
  if (dialerStatus !== 'ready' || _liveCallId || _inboundTestRingOpen || _fakeCallActive) return;
  if (typeof window.isIncomingDialerEnabled === 'function' && !window.isIncomingDialerEnabled()) return;
  const phone = mbInboundCaller(call);
  const route = await mbResolveInbound(phone);
  if (!route || route.targetId !== currentUser?.id) return;
  if (dialerStatus !== 'ready' || _inboundTestRingOpen) return;
  const contact = route.contact;
  contact._telnyxCall = call;
  contact._inboundMine = !!(route.owner && route.owner.id === currentUser.id && !route.suggest);
  if (route.suggest && route.owner) {
    contact._testScenario = 'owner_other';
    contact._testOwner = route.owner;
    contact._testOwnerOnline = false;
    contact._inboundSuggest = true;
  }
  await beginInboundTestCall({
    phone: contact.phone || phone,
    displayName: route.displayName,
    contact,
    routeDetail: route.detail,
    isExternalInbound: route.external,
  });
}

async function tickInboundTestSimulation() {
  if (!_testMode) return;
  await loadFirmDialerSettingsCache();
  /** Test modunda gelen simülasyonu firma «Gelen aramalar» kapalı olsa da çalışır (demo). */
  if (dialerStatus !== 'ready') return;
  if (_fakeCallActive || dialerStatus === 'on_call' || _inboundTestRingOpen) return;
  if (!currentUser?.firm_id) return;
  const fid = currentUser.firm_id;

  let sessions = await sb(`agent_sessions?firm_id=eq.${fid}&status=eq.ready&select=agent_id,agent_name,last_seen&order=last_seen.asc`).catch(() => []);
  if ((!sessions?.length || !sessions.some((x) => x.agent_id === currentUser.id)) && dialerStatus === 'ready') {
    sessions = [
      {
        agent_id: currentUser.id,
        agent_name: currentUser.name || '',
        last_seen: new Date().toISOString(),
      },
    ];
  }
  if (!sessions?.length) return;
  const readyIds = new Set(sessions.map((x) => x.agent_id));
  if (!readyIds.has(currentUser.id)) return;

  const autoIds = typeof getAutoDialCampaignIds === 'function' ? getAutoDialCampaignIds() : [];
  const sc = typeof selectedCampId !== 'undefined' && selectedCampId ? selectedCampId : null;
  const campIdsForPool = autoIds.length ? autoIds : sc ? [sc] : [];
  // Kampanyada aranacak gerçek kayıt varsa gelen test simülasyonunu sustur.
  if (campIdsForPool.length) {
    const inf =
      campIdsForPool.length === 1
        ? `campaign_id=eq.${campIdsForPool[0]}`
        : `campaign_id=in.(${campIdsForPool.join(',')})`;
    const nowIso = new Date().toISOString();
    const outboundPool =
      (await sb(
        `contacts?firm_id=eq.${fid}&${inf}` +
        `&status=in.(pending,no_answer,callback)` +
        `&or=(callback_at.is.null,callback_at.lte.${nowIso})` +
        `&select=id&limit=1`
      ).catch(() => [])) || [];
    if (outboundPool.length) return;
  }
  let contacts = [];
  if (campIdsForPool.length) {
    const inf =
      campIdsForPool.length === 1
        ? `campaign_id=eq.${campIdsForPool[0]}`
        : `campaign_id=in.(${campIdsForPool.join(',')})`;
    contacts =
      (await sb(
        `contacts?firm_id=eq.${fid}&${inf}&status=eq.pending&select=id,phone,first_name,last_name,campaign_id&limit=80`
      ).catch(() => [])) || [];
  }
  if (!contacts.length) {
    contacts =
      (await sb(`contacts?firm_id=eq.${fid}&select=id,phone,first_name,last_name,campaign_id&limit=120`).catch(() => [])) ||
      [];
  }
  let phone = '';
  let pickedContact = null;
  _inboundSimTickCount += 1;
  /**
   * Test modunda dış / kayıtlı / aktarım senaryoları deterministik döner (şansa bırakılmaz).
   * 0–1–2: dış numara (standart, aktarım bildirimi, sahiplik); 3–4–5: kampanyadan kayıtlı kontak.
   */
  const phase = (_inboundSimTickCount - 1) % 6;
  let useExternal = phase <= 2;
  let scenarioKind = 'standard';
  if (phase === 1 || phase === 4) scenarioKind = 'forwarded';
  else if (phase === 2 || phase === 5) scenarioKind = 'owner_other';

  if (useExternal) {
    phone = `49${15 + Math.floor(Math.random() * 74)}${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  } else if (contacts?.length) {
    pickedContact = contacts[Math.floor(Math.random() * contacts.length)];
    phone = pickedContact.phone;
  } else {
    useExternal = true;
    phone = `49${15 + Math.floor(Math.random() * 74)}${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  }

  let preferredId = null;
  try {
    const logs = await sb(`call_logs?phone=eq.${encodeURIComponent(phone)}&firm_id=eq.${fid}&order=started_at.desc&limit=1&select=agent_id`).catch(() => []);
    preferredId = logs?.[0]?.agent_id || null;
  } catch (e) {}

  let targetId = null;
  let routeDetail = '';
  const prefName = sessions.find((x) => x.agent_id === preferredId)?.agent_name || '';
  if (_testMode) {
    /** Prod’da sıradaki temsilciye gider; testte aksi halde çoğu zaman başka temsilciye gider ve bu ekranda hiçbir şey olmaz */
    targetId = currentUser.id;
    routeDetail = typeof t === 'function' ? t('dial.inbound_sim_session') : '';
  } else if (preferredId && readyIds.has(preferredId)) {
    targetId = preferredId;
    routeDetail =
      typeof tReplace === 'function'
        ? tReplace('dial.inbound_route_last', { name: prefName ? ` (${prefName})` : '' })
        : '';
  } else {
    targetId = sessions[0].agent_id;
    const tname = sessions[0].agent_name || '';
    if (preferredId && !readyIds.has(preferredId)) {
      routeDetail =
        typeof tReplace === 'function' ? tReplace('dial.inbound_route_busy', { name: tname || '—' }) : '';
    } else {
      routeDetail =
        typeof tReplace === 'function' ? tReplace('dial.inbound_route_next', { name: tname || '—' }) : '';
    }
  }

  if (targetId !== currentUser.id) {
    if (_canShowInboundRoutingDetail()) {
      toast(
        `📥 ${typeof t === 'function' ? t('dial.inbound_other_agent') : ''} — ${routeDetail}`,
        'warn',
        4200
      );
    }
    return;
  }

  let contact = pickedContact;
  if (!contact && phone) {
    try {
      const rows = await sb(`contacts?phone=eq.${encodeURIComponent(phone)}&firm_id=eq.${fid}&select=*&limit=1`).catch(() => []);
      contact = rows?.[0] || null;
    } catch (e) {}
  }
  if (!contact) {
    const campId = selectedCampId || campaigns?.[0]?.id || null;
    contact = {
      id: `in-${Date.now()}`,
      phone,
      first_name: typeof t === 'function' ? t('dial.contact_inbound') : 'Gelen',
      last_name: typeof t === 'function' ? t('dial.contact_test') : 'Test',
      firm_id: fid,
      campaign_id: campId,
      status: 'pending',
      attempt_count: 0,
      is_inbound_test: true,
    };
  }

  const displayName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || phone;
  contact._inboundRouteDetail = routeDetail;

  const agents = await _fetchFirmAgentsForInboundTest(fid);
  let others = (agents || []).filter((a) => a.id !== currentUser.id);
  others = _testInboundAugmentOthers(others);

  let scenario = 'standard';
  let fromAgentName = '';
  let testOwner = null;
  let testOwnerOnline = false;

  if (scenarioKind === 'forwarded') {
    scenario = 'forwarded';
    const from = others[Math.floor(Math.random() * others.length)];
    fromAgentName = from.name || '—';
  } else if (scenarioKind === 'owner_other') {
    scenario = 'owner_other';
    const pool = others.filter((o) => o.id);
    const o = (pool.length ? pool : others)[Math.floor(Math.random() * (pool.length || others.length))];
    if (o?.id) {
      testOwner = { id: o.id, name: o.name || '—' };
      testOwnerOnline = readyIds.has(o.id);
    } else {
      testOwner = { id: null, name: o?.name || 'Ziya' };
      testOwnerOnline = false;
    }
  }

  contact._testScenario = scenario;
  contact._testFromAgentName = scenario === 'forwarded' ? fromAgentName : '';
  contact._testOwner = scenario === 'owner_other' ? testOwner : null;
  contact._testOwnerOnline = scenario === 'owner_other' ? testOwnerOnline : false;

  await beginInboundTestCall({ phone, displayName, contact, routeDetail, isExternalInbound: useExternal });
}

function _closeInboundTestRingUI(opts = {}) {
  _inboundTestRingOpen = false;
  _inboundTestCtx = null;
  if (_inboundRingAutoDeclineTimer) {
    clearTimeout(_inboundRingAutoDeclineTimer);
    _inboundRingAutoDeclineTimer = null;
  }
  const root = document.getElementById('cust-empty');
  const panel = document.getElementById('cust-empty-incoming-panel');
  const def = document.getElementById('cust-empty-default');
  if (root) root.classList.remove('cust-empty--ringing');
  if (panel) {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
  }
  if (def) def.style.display = '';
  const addWrap = document.getElementById('cust-empty-inbound-add-wrap');
  if (addWrap) addWrap.style.display = 'none';
  const fw = document.getElementById('cust-empty-incoming-forward');
  const ow = document.getElementById('cust-empty-incoming-owner');
  if (fw) {
    fw.style.display = 'none';
    fw.textContent = '';
  }
  if (ow) {
    ow.style.display = 'none';
    ow.textContent = '';
  }
  const ownBtn = document.getElementById('dialer-incoming-btn-owner');
  if (ownBtn) ownBtn.style.display = 'none';
  const addTg = document.getElementById('dialer-incoming-btn-addtoggle');
  if (addTg) addTg.style.display = 'none';
  const xWrap = document.getElementById('cust-empty-incoming-xfer-wrap');
  if (xWrap) xWrap.style.display = 'none';
  const knob = document.getElementById('dialer-incoming-knob');
  if (knob) {
    knob.style.transform = '';
    knob.onpointerdown = null;
    knob.onpointermove = null;
    knob.onpointerup = null;
    knob.onpointercancel = null;
  }
  if (
    !opts.skipMascotRestart &&
    (dialerStatus === 'ready' || dialerStatus === 'break')
  ) {
    startCustEmptyMascotLoops();
  }
}

function _wireInboundTestSwipeOnce({ accept, decline }) {
  const knob = document.getElementById('dialer-incoming-knob');
  if (!knob) return;
  const maxX = 92;
  const TH = 46;
  let startX = 0;
  let cur = 0;
  let dragging = false;
  const onDown = (e) => {
    dragging = true;
    startX = e.clientX;
    cur = 0;
    try {
      knob.setPointerCapture(e.pointerId);
    } catch (err) {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    cur = Math.max(-maxX, Math.min(maxX, dx));
    knob.style.transform = `translateX(${cur}px)`;
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      knob.releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (cur >= TH) accept();
    else if (cur <= -TH) decline();
    knob.style.transform = '';
  };
  knob.onpointerdown = onDown;
  knob.onpointermove = onMove;
  knob.onpointerup = onUp;
  knob.onpointercancel = onUp;
}

function openInboundTestRingUI(ctx) {
  const { phone, displayName, routeDetail, isExternalInbound, proceed, contact } = ctx;
  _closeInboundTestRingUI({ skipMascotRestart: true });
  _stopCustEmptyMascotTimers();
  _inboundTestRingOpen = true;
  _inboundTestCtx = ctx;
  const scenario = contact?._testScenario || 'standard';
  const fromNm = contact?._testFromAgentName || '';
  const owner = contact?._testOwner || null;
  const ownerOn = !!contact?._testOwnerOnline;

  const root = document.getElementById('cust-empty');
  const def = document.getElementById('cust-empty-default');
  const panel = document.getElementById('cust-empty-incoming-panel');
  if (def) def.style.display = 'none';
  if (root) root.classList.add('cust-empty--ringing');
  if (panel) {
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.toggle('cust-empty-incoming-panel--external', !!isExternalInbound);
  }

  if (typeof applyLang === 'function') applyLang();

  const nm = document.getElementById('dialer-incoming-name');
  const ph = document.getElementById('dialer-incoming-phone');
  const bd = document.getElementById('dialer-incoming-badge');
  const sub = document.getElementById('dialer-incoming-sub');
  const lblL = document.getElementById('dialer-incoming-label-left');
  const lblR = document.getElementById('dialer-incoming-label-right');
  const fw = document.getElementById('cust-empty-incoming-forward');
  const ow = document.getElementById('cust-empty-incoming-owner');
  const ownBtn = document.getElementById('dialer-incoming-btn-owner');
  const addTg = document.getElementById('dialer-incoming-btn-addtoggle');

  if (nm) nm.textContent = displayName || '—';
  if (ph) ph.textContent = phone || '—';
  if (bd) {
    bd.textContent = contact?._labInternal
      ? (typeof t === 'function' ? t('dial.lab.internal_badge') : 'İç arama')
      : (isExternalInbound
        ? (typeof t === 'function' ? t('dial.inbound_badge_ext') : 'Extern')
        : (typeof t === 'function' ? t('dial.inbound_badge_int') : 'Intern'));
  }

  if (fw) {
    fw.style.display = scenario === 'forwarded' ? 'block' : 'none';
    if (scenario === 'forwarded') {
      const fwdKey = contact?._labInternal ? 'dial.lab.internal_fwd' : 'dial.inbound_fwd';
      fw.textContent =
        typeof tReplace === 'function'
          ? tReplace(fwdKey, { from: fromNm || (typeof t === 'function' ? t('dial.inbound_fwd_fallback') : 'Agent') })
          : '';
    }
  }
  if (ow) {
    ow.style.display = 'none';
    ow.textContent = '';
  }
  if (ownBtn) ownBtn.style.display = 'none';
  if (scenario === 'owner_other' && owner?.name) {
    if (owner.id && owner.id !== currentUser.id) {
      if (ow) {
        ow.style.display = 'block';
        ow.textContent = ownerOn
          ? (typeof tReplace === 'function' ? tReplace('dial.inbound_owner_ready', { name: owner.name }) : '')
          : (typeof tReplace === 'function' ? tReplace('dial.inbound_owner_suggest', { name: owner.name }) : '');
      }
      if (ownBtn) {
        ownBtn.style.display = ownerOn ? 'inline-flex' : 'none';
        ownBtn.textContent =
          typeof tReplace === 'function' ? tReplace('dial.inbound_xfer_btn', { name: owner.name }) : '';
      }
    } else if (!owner.id) {
      if (ow) {
        ow.style.display = 'block';
        ow.textContent =
          typeof tReplace === 'function' ? tReplace('dial.inbound_owner_na', { name: owner.name }) : '';
      }
      if (ownBtn) ownBtn.style.display = 'none';
    }
  }

  if (sub) {
    if (contact?._labInternal && scenario !== 'forwarded') {
      sub.textContent = typeof t === 'function' ? t('dial.lab.internal_sub') : '';
    } else if (contact?._inboundMine) {
      sub.textContent = typeof t === 'function' ? t('dial.inbound_owner_mine') : '';
    } else if (scenario === 'forwarded') {
      sub.textContent = typeof t === 'function' ? t('dial.inbound_sub_fwd') : '';
    } else if (scenario === 'owner_other') {
      sub.textContent = typeof t === 'function' ? t('dial.inbound_sub_owner') : '';
    } else if (isExternalInbound && typeof _testMode !== 'undefined' && _testMode) {
      sub.textContent = typeof t === 'function' ? t('dial.inbound_sub_ext_test') : '';
    } else {
      sub.textContent = typeof t === 'function' ? t('dial.inbound_sub_default') : '';
    }
  }
  if (lblL) {
    lblL.textContent =
      scenario === 'forwarded'
        ? (typeof t === 'function' ? t('dial.inbound_close') : 'Kapat')
        : (typeof t === 'function' ? t('dial.inbound_decline') : 'Reddet');
  }
  if (lblR) lblR.textContent = typeof t === 'function' ? t('dial.inbound_accept') : 'Yanıtla';

  const decBtn = document.getElementById('dialer-incoming-btn-decline');
  if (decBtn) {
    decBtn.textContent =
      scenario === 'forwarded'
        ? (typeof t === 'function' ? t('dial.inbound_close') : 'Kapat')
        : (typeof t === 'function' ? t('dial.inbound_decline') : 'Reddet');
  }

  const linkIn = document.getElementById('inbound-link-phone');
  if (linkIn) linkIn.value = '';

  const unreg =
    !contact?.id ||
    String(contact.id).startsWith('in-') ||
    String(contact.id).startsWith('adhoc-') ||
    contact?.is_inbound_test === true;
  if (addTg) addTg.style.display = contact?._labInternal ? 'none' : (unreg ? 'inline-flex' : 'none');

  const xWrap = document.getElementById('cust-empty-incoming-xfer-wrap');
  const xferSel = document.getElementById('dialer-incoming-xfer-agent');
  if (xWrap && xferSel && isExternalInbound && typeof _testMode !== 'undefined' && _testMode && currentUser?.firm_id) {
    xWrap.style.display = '';
    const pickPh = typeof t === 'function' ? escapeHtml(t('dial.inbound_pick_agent')) : '';
    xferSel.innerHTML = `<option value="">${pickPh}</option>`;
    void _fetchFirmAgentsForInboundTest(currentUser.firm_id).then((agents) => {
      const list = (agents || []).filter((a) => a.id && a.id !== currentUser.id);
      xferSel.innerHTML =
        `<option value="">${pickPh}</option>` +
        list
          .map((a) => {
            const nm = String(a.name || a.id || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return `<option value="${a.id}">${nm}</option>`;
          })
          .join('');
    });
  } else if (xWrap) {
    xWrap.style.display = 'none';
  }

  try {
    navigator.vibrate?.(70);
  } catch (e) {}

  const accept = () => {
    const done = _inboundTestCtx?.onAccept;
    _closeInboundTestRingUI();
    if (typeof done === 'function') done();
    void proceed();
  };
  const decline = () => {
    try { ctx.call?.hangup?.(); } catch (e) {}
    try { contact?._telnyxCall?.hangup?.(); } catch (e) {}
    _closeInboundTestRingUI();
    toast(
      (typeof t === 'function' ? t('dial.inbound_declined') : '') + (routeDetail ? ' — ' + routeDetail : ''),
      'warn',
      3600
    );
    restartInboundTestSimulationScheduler();
  };

  const accBtn = document.getElementById('dialer-incoming-btn-accept');
  if (accBtn) accBtn.onclick = () => accept();
  if (decBtn) decBtn.onclick = () => decline();

  _inboundRingAutoDeclineTimer = setTimeout(() => {
    _inboundRingAutoDeclineTimer = null;
    if (_inboundTestRingOpen) decline();
  }, 32000);

  _wireInboundTestSwipeOnce({ accept, decline });
}

function inboundTestToggleAddPanel() {
  const w = document.getElementById('cust-empty-inbound-add-wrap');
  if (!w) return;
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
}

async function inboundTestLinkToContact() {
  const ctx = _inboundTestCtx;
  if (!ctx?.contact || !currentUser?.firm_id) return;
  const incoming = String(ctx.phone || '').trim();
  const targetPhone = document.getElementById('inbound-link-phone')?.value?.trim();
  if (!targetPhone) {
    toast(typeof t === 'function' ? t('dial.inbound_link_phone') : 'Telefon girin', 'warn');
    return;
  }
  if (!incoming) return;
  const fid = currentUser.firm_id;
  let rows =
    (await sb(`contacts?firm_id=eq.${fid}&phone=eq.${encodeURIComponent(targetPhone)}&select=*&limit=1`).catch(() => [])) ||
    [];
  if (!rows.length) {
    rows =
      (await sb(`contacts?firm_id=eq.${fid}&phone2=eq.${encodeURIComponent(targetPhone)}&select=*&limit=1`).catch(() => [])) ||
      [];
  }
  if (!rows?.length) {
    toast(typeof t === 'function' ? t('dial.inbound_no_contact') : 'Bulunamadı', 'err');
    return;
  }
  const row = rows[0];
  const patch = {};
  const p2 = String(row.phone2 || '').trim();
  const p1 = String(row.phone || '').trim();
  if (incoming === p1 || incoming === p2) {
    toast(typeof t === 'function' ? t('dial.inbound_dup') : 'Zaten kayıtta', 'warn');
    return;
  }
  if (!p2) {
    patch.phone2 = incoming;
  } else {
    const note = String(row.notes || '').trim();
    const line = typeof tReplace === 'function' ? tReplace('dial.inbound_note3', { num: incoming }) : `\n3. numara: ${incoming}`;
    patch.notes = note ? note + line : line.trim();
  }
  try {
    await sb(`contacts?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
    toast(typeof t === 'function' ? t('dial.inbound_linked') : 'Kaydedildi', 'ok');
    Object.assign(row, patch);
    ctx.contact = row;
    _closeInboundTestRingUI();
    currentContact = row;
    if (row.campaign_id) {
      const camp = campaigns.find((c) => c.id === row.campaign_id);
      selectCamp(row.campaign_id, camp?.name || '', { skipActivate: true });
    }
    showCustomerCard(row);
    _fakeCallActive = true;
    _inboundSimActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    updateSessionInDB('on_call').catch(() => {});
    if (typeof switchContactTab === 'function') switchContactTab('info');
  } catch (e) {
    toast((typeof t === 'function' ? t('dial.inbound_err') : 'Hata: ') + (e.message || ''), 'err');
  }
}

function inboundTestTransferToSelectedAgent() {
  const ctx = _inboundTestCtx;
  if (!ctx) return;
  const sel = document.getElementById('dialer-incoming-xfer-agent');
  const targetId = sel?.value;
  if (!targetId) {
    toast(typeof t === 'function' ? t('dial.inbound_pick_agent_warn') : 'Agent seçin', 'warn');
    return;
  }
  const payload = {
    phone: ctx.phone,
    displayName: ctx.displayName,
    fromAgent: currentUser?.name || '',
    ts: Date.now(),
  };
  try {
    localStorage.setItem(`mb_test_xfer_${targetId}`, JSON.stringify(payload));
  } catch (e) {}
  const nm = sel?.options?.[sel.selectedIndex]?.text || '';
  toast(
    typeof tReplace === 'function' ? tReplace('dial.inbound_xfer_toast', { name: nm }) : `TEST: ${nm}`,
    'ok',
    5200
  );
  _closeInboundTestRingUI();
  restartInboundTestSimulationScheduler();
}

function inboundTestTransferToOwner() {
  const ctx = _inboundTestCtx;
  const owner = ctx?.contact?._testOwner;
  if (!owner?.id) return;
  if (owner.id === 'lab-owner') {
    const from = currentUser?.name || (typeof t === 'function' ? t('dial.lab.agent') : 'Temsilci');
    _closeInboundTestRingUI();
    toast(typeof t === 'function' ? t('dial.lab.transfer_next') : 'Karşı tarafın kartı açılıyor', 'ok', 2200);
    setTimeout(() => mbRunInboundLab('forwarded', from), 280);
    return;
  }
  const payload = {
    phone: ctx.phone,
    displayName: ctx.displayName,
    fromAgent: currentUser.name,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(`mb_test_xfer_${owner.id}`, JSON.stringify(payload));
  } catch (e) {}
  toast(
    typeof tReplace === 'function' ? tReplace('dial.inbound_xfer_owner', { name: owner.name }) : `TEST: ${owner.name}`,
    'ok',
    5200
  );
  _closeInboundTestRingUI();
  restartInboundTestSimulationScheduler();
}

async function beginInboundTestCall({ phone, displayName, contact, routeDetail, isExternalInbound, onAccept }) {
  if (_fakeCallActive || dialerStatus === 'on_call' || _inboundTestRingOpen) return;

  const proceed = async () => {
    const campId = contact.campaign_id || selectedCampId || campaigns?.[0]?.id;
    if (campId) {
      const camp = campaigns.find((c) => c.id === campId);
      selectCamp(campId, camp?.name || '', { skipActivate: true });
    }
    currentContact = contact;
    showCustomerCard(contact);
    const live = contact?._telnyxCall;
    const realLine = !!(live && typeof live.answer === 'function');
    if (realLine) {
      try { live.answer(); } catch (e) {}
    } else {
      _fakeCallActive = true;
      _inboundSimActive = true;
      window.__voiceOrbSimRemote = true;
      setDialerStatus('on_call');
      updateSessionInDB('on_call').catch(() => {});
    }

    const ban = document.getElementById('dialer-inbound-banner');
    const liveRoute = !!(contact?._telnyxCall || contact?._inboundSuggest || contact?._inboundMine);
    if (ban && liveRoute) {
      ban.style.display = '';
      ban.classList.toggle('dialer-inbound-banner--external', !!isExternalInbound);
      ban.textContent = routeDetail || `${displayName} · ${phone}`;
      toast(ban.textContent, 'ok', 4600);
      if (typeof switchContactTab === 'function') switchContactTab('info');
      return;
    }
    if (ban) {
      ban.style.display = '';
      if (isExternalInbound) {
        ban.classList.add('dialer-inbound-banner--external');
        ban.textContent =
          typeof tReplace === 'function'
            ? tReplace('dial.inbound_banner_ext', {
                phone,
                extra: routeDetail ? ` — ${routeDetail}` : '',
              })
            : '';
      } else {
        ban.classList.remove('dialer-inbound-banner--external');
        ban.textContent =
          typeof tReplace === 'function'
            ? tReplace('dial.inbound_banner_in', {
                name: displayName,
                phone,
                extra: routeDetail ? ` — ${routeDetail}` : '',
              })
            : '';
      }
    }
    const extra = _canShowInboundRoutingDetail() ? ` — ${routeDetail}` : '';
    if (isExternalInbound) {
      toast(
        `${typeof t === 'function' ? t('dial.inbound_toast_ext') : ''}${phone}${extra}`,
        'ok',
        5600
      );
    } else {
      toast(
        `${typeof t === 'function' ? t('dial.inbound_toast_in') : ''}: ${displayName} · ${phone}${extra}`,
        'ok',
        5200
      );
    }
    if (typeof switchContactTab === 'function') switchContactTab('info');
  };

  const ring = () =>
    openInboundTestRingUI({ phone, displayName, routeDetail, isExternalInbound, proceed, contact, onAccept, call: contact?._telnyxCall || null });

  if (isExternalInbound && !_isCustDataVisible()) {
    stopCustEmptyCoach();
    if (_inboundExternalCueTimer) {
      clearTimeout(_inboundExternalCueTimer);
      _inboundExternalCueTimer = null;
    }
    const custData = document.getElementById('cust-data');
    const cue = document.getElementById('cust-empty-inbound-cue');
    const bubble = document.getElementById('cust-empty-bubble');
    if (bubble) bubble.style.display = 'none';
    if (custData) custData.style.display = 'none';
    const custEmpty = document.getElementById('cust-empty');
    if (custEmpty) {
      custEmpty.style.display = '';
      custEmpty.classList.add('cust-empty--inbound-external');
    }
    if (cue) {
      cue.style.display = '';
      if (typeof applyLang === 'function') applyLang();
    }
    _inboundExternalCueTimer = setTimeout(() => {
      _inboundExternalCueTimer = null;
      _hideInboundExternalFluidCue();
      ring();
    }, 900);
    return;
  }

  ring();
}

async function loadIncomingCallsSettingsPage() {
  const card = document.getElementById('incoming-calls-settings-card');
  if (!card) return;
  const role = currentUser?.role || '';
  const can = ['firm_admin', 'admin', 'super_admin'].includes(role);
  if (!can || !currentUser?.firm_id) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  await loadFirmDialerSettingsCache();
  const s = window._firmDialerSettings || {};
  const locked = !s.incoming_super_enabled;
  const hint = document.getElementById('inc-set-locked-hint');
  const en = document.getElementById('inc-set-enabled');
  const ex = document.getElementById('inc-set-external');
  const ri = document.getElementById('inc-set-routing-info');
  if (hint) hint.style.display = locked ? '' : 'none';
  [en, ex, ri].forEach((el) => {
    if (!el) return;
    el.disabled = locked;
    el.style.opacity = locked ? '0.5' : '';
  });
  if (en) en.checked = !!s.incoming_enabled;
  if (ex) ex.checked = !!s.incoming_external;
  if (ri) ri.checked = s.incoming_show_routing_admin !== false;
}

async function saveIncomingCallsSettings() {
  if (!currentUser?.firm_id) return;
  const role = currentUser?.role || '';
  if (!['firm_admin', 'admin', 'super_admin'].includes(role)) {
    toast(typeof t === 'function' ? t('ui.no_permission') : 'Yetki yok', 'err');
    return;
  }
  try {
    const rows = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const oldSettings = rows?.[0]?.settings || {};
    const oldDialer = oldSettings.dialer || {};
    const locked = !oldDialer.incoming_super_enabled;
    if (locked) {
      toast(typeof t === 'function' ? t('dial.superadmin_incoming_locked') : 'Süper admin bu özelliği henüz açmadı', 'warn');
      return;
    }
    const dialer = {
      ...oldDialer,
      incoming_enabled: !!document.getElementById('inc-set-enabled')?.checked,
      incoming_external: !!document.getElementById('inc-set-external')?.checked,
      incoming_show_routing_admin: !!document.getElementById('inc-set-routing-info')?.checked,
    };
    await sb(`firms?id=eq.${currentUser.firm_id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...oldSettings, dialer } }),
    });
    await loadFirmDialerSettingsCache();
    toast(typeof t === 'function' ? t('dial.incoming_saved') : 'Gelen arama ayarları kaydedildi ✓', 'ok');
    restartInboundTestSimulationScheduler();
  } catch (e) {
    toast((typeof t === 'function' ? t('dial.log_err') : 'Kayıt hatası: ') + e.message, 'err');
  }
}

window.isIncomingDialerEnabled = function () {
  const s = window._firmDialerSettings || {};
  return !!(s.incoming_super_enabled && s.incoming_enabled);
};

function mbPaintInboundLab() {
  const el = document.getElementById('dialer-test-lab');
  if (!el) return;
  el.hidden = !_testMode;
  if (!_testMode) el.classList.remove('is-compact');
}

function mbCompactInboundLab(kind) {
  const el = document.getElementById('dialer-test-lab');
  if (!el) return;
  el.classList.add('is-compact');
  el.querySelectorAll('[data-lab]').forEach((btn) => btn.classList.toggle('is-on', btn.getAttribute('data-lab') === kind));
  const now = document.getElementById('dialer-test-lab-now');
  const on = el.querySelector(`[data-lab="${kind}"]`);
  if (now) now.textContent = on ? on.textContent.trim() : '';
}

function mbExpandInboundLab() {
  document.getElementById('dialer-test-lab')?.classList.remove('is-compact');
}

function mbLabContact(phone) {
  return {
    id: `in-${Date.now()}`,
    phone,
    first_name: typeof t === 'function' ? t('dial.lab.customer') : 'Örnek müşteri',
    last_name: '',
    firm_id: currentUser?.firm_id || null,
    campaign_id: typeof selectedCampId !== 'undefined' ? selectedCampId : null,
    status: 'pending',
    attempt_count: 0,
    is_inbound_test: true,
  };
}

function mbRunInboundLab(kind, fromName) {
  if (!_testMode) return;
  if (_fakeCallActive || dialerStatus === 'on_call' || dialerStatus === 'calling') {
    toast(typeof t === 'function' ? t('dial.lab.busy_now') : 'Önce açık sahte çağrıyı kapat', 'warn', 2600);
    return;
  }
  if (_inboundTestRingOpen) _closeInboundTestRingUI();
  mbCompactInboundLab(kind);
  document.getElementById('customer-card')?.classList.add('customer-card--empty');
  const custData = document.getElementById('cust-data');
  const custEmpty = document.getElementById('cust-empty');
  if (custData) custData.style.display = 'none';
  if (custEmpty) custEmpty.style.display = '';
  const phone = kind === 'external' ? '+490000000099' : '+490000000001';
  const contact = mbLabContact(phone);
  const ownerName = typeof t === 'function' ? t('dial.lab.owner') : 'Örnek sahip';
  const displayName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || phone;
  if (kind === 'mine') {
    contact._inboundMine = true;
    void beginInboundTestCall({
      phone,
      displayName,
      contact,
      routeDetail: typeof t === 'function' ? t('dial.inbound_owner_mine') : '',
      isExternalInbound: false,
    });
    return;
  }
  if (kind === 'busy' || kind === 'transfer') {
    contact._testScenario = 'owner_other';
    contact._testOwner = { id: 'lab-owner', name: ownerName };
    contact._testOwnerOnline = kind === 'transfer';
    contact._inboundSuggest = kind === 'busy';
    void beginInboundTestCall({
      phone,
      displayName,
      contact,
      routeDetail: typeof tReplace === 'function' ? tReplace('dial.inbound_owner_suggest', { name: ownerName }) : '',
      isExternalInbound: false,
    });
    return;
  }
  if (kind === 'forwarded') {
    contact._testScenario = 'forwarded';
    contact._testFromAgentName = fromName || (typeof t === 'function' ? t('dial.lab.agent') : 'Örnek temsilci');
    void beginInboundTestCall({
      phone,
      displayName,
      contact,
      routeDetail: '',
      isExternalInbound: false,
    });
    return;
  }
  if (kind === 'external') {
    contact.first_name = typeof t === 'function' ? t('dial.contact_inbound') : 'Gelen';
    contact.last_name = typeof t === 'function' ? t('dial.contact_test') : 'Test';
    void beginInboundTestCall({
      phone,
      displayName: phone,
      contact,
      routeDetail: '',
      isExternalInbound: true,
    });
    return;
  }
  if (kind === 'internal' || kind === 'internal-xfer') {
    const agent = typeof t === 'function' ? t('dial.lab.agent') : 'Örnek temsilci';
    contact._labInternal = true;
    contact.first_name = agent;
    contact.phone = '101';
    if (kind === 'internal-xfer') {
      contact._testScenario = 'forwarded';
      contact._testFromAgentName = agent;
    }
    void beginInboundTestCall({
      phone: '101',
      displayName: agent,
      contact,
      routeDetail: '',
      isExternalInbound: false,
    });
  }
}

// ── Test Modu ─────────────────────────────────
function toggleTestMode() {
  _testMode = !_testMode;
  const btn    = document.getElementById('test-mode-btn');
  const rdyBtn = document.getElementById('btn-ready');
  const flag   = document.getElementById('tb-test-flag');
  if (flag) flag.hidden = !_testMode;
  if (_testMode) {
    btn.style.cssText += ';background:rgba(234,179,8,.18)!important;color:var(--yellow)!important;border-color:var(--yellow)!important;';
    btn.textContent = typeof t === 'function' ? t('dial.test_btn_on') : '⚙ TEST AÇIK';
    // Hazır butonunu Telnyx'ten bağımsız hale getir
    if (rdyBtn) {
      const canStart = !!selectedCampId && getAutoDialCampaignIds().length > 0;
      rdyBtn.disabled = !canStart;
      rdyBtn.style.opacity = '1';
      rdyBtn.style.cursor = canStart ? 'pointer' : 'not-allowed';
      rdyBtn.onclick = testToggleReady; // Telnyx kontrolsüz versiyon
    }
    toast(typeof t === 'function' ? t('dial.test_mode_on') : 'Test modu açık', 'ok', 4000);
    document.getElementById('dialer-test-lab')?.classList.remove('is-compact');
  } else {
    btn.style.cssText = btn.style.cssText.replace(/background[^;]+;|color[^;]+;|border-color[^;]+;/g, '');
    btn.textContent = typeof t === 'function' ? t('dial.test_btn_off') : 'TEST MODU';
    if (rdyBtn) {
      rdyBtn.onclick = toggleReady; // Normal versiyona geri dön
      if (!telnyxReady && !selectedCampId) {
        rdyBtn.disabled = true;
        rdyBtn.style.opacity = '0.45';
        rdyBtn.style.cursor = 'not-allowed';
      }
    }
    toast(typeof t === 'function' ? t('dial.test_mode_off') : 'Test modu kapatıldı', 'warn', 2000);
    if (_inboundTestRingOpen) _closeInboundTestRingUI();
  }
  mbPaintInboundLab();
  if (_inboundTestXferPoll) {
    clearInterval(_inboundTestXferPoll);
    _inboundTestXferPoll = null;
  }
  if (_testMode) {
    _maybeConsumeTestTransferInbox();
    _inboundTestXferPoll = setInterval(() => _maybeConsumeTestTransferInbox(), 2000);
  }
  restartInboundTestSimulationScheduler();
  if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel();
}

// Test moduna özel hazır toggle — Telnyx kontrolü yok
async function testToggleReady() {
  // Test modunda bile en az bir izinli/aktif kampanya olmadan arama başlamasın.
  const allowed = getAutoDialCampaignIds();
  if (!selectedCampId) { toast(typeof t === 'function' ? t('dial.pick_camp_first') : 'Önce kampanya seçin', 'err'); return; }
  if (!allowed.length) { toast(typeof t === 'function' ? t('dial.activate_camps') : 'Önce en az bir kampanyayı aktif edin', 'err'); return; }
  if (dialerStatus === 'offline' || dialerStatus === 'break') {
    setDialerStatus('ready');
    upsertAgentSession({
      agent_id: currentUser.id,
      agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status: 'ready',
      last_seen: new Date().toISOString(),
    }).catch(() => {});
    restartInboundTestSimulationScheduler();
    setTimeout(() => dialNext(), 300);
  } else if (dialerStatus === 'ready') {
    setDialerStatus('offline');
    stopInboundTestSimulationScheduler();
    upsertAgentSession({
      agent_id: currentUser.id,
      agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status: 'offline',
      last_seen: new Date().toISOString(),
    }).catch(() => {});
  }
}

async function startTestCall() {
  await mbSyncPool();
}

function endFakeCall() {
  _closeInboundTestRingUI();
  _hideInboundExternalFluidCue();
  _fakeCallActive = false;
  _inboundSimActive = false;
  window.__voiceOrbSimRemote = false;
  clearTimeout(_fakeCallTimer); _fakeCallTimer = null;
  const ban = document.getElementById('dialer-inbound-banner');
  if (ban) {
    ban.style.display = 'none';
    ban.textContent = '';
    ban.classList.remove('dialer-inbound-banner--external');
  }
  handleCallEnd(Math.floor(callSeconds) || 15);
}

// ── Kalender / Takvim bağlantısı ─────────────
function openKalender(contact) {
  if (!contact) contact = currentContact;
  const params = new URLSearchParams({
    name:  [contact?.first_name||'', contact?.last_name||''].join(' ').trim() || '',
    phone: contact?.phone||'',
    plz:   contact?.plz||'',
    city:  contact?.city||'',
    address: contact?.address||'',
    hausart: contact?.hausart||'',
    baujahr: contact?.baujahr||'',
    qm:    contact?.qm||'',
    heizung: contact?.heizung||'',
    alter: contact?.alter_der_heizung||'',
    campId: selectedCampId||'',
  });
  const url = TAKVIM_URL + '?' + params.toString();
  window.open(url, '_blank', 'width=900,height=750,resizable=yes,scrollbars=yes');
}

function toggleTakvimPopup() {
  const popup = document.getElementById('takvim-popup-frame');
  if (!popup) return;
  const isVisible = popup.style.display !== 'none';
  popup.style.display = isVisible ? 'none' : '';
  if (!isVisible && currentContact) {
    openKalender(currentContact);
  }
}

// Tam ekran takvim overlay'ini aç (topbar butonu + handleAppointmentClick)
async function _loadTakvimOverlayCamps() {
  const sel = document.getElementById('takvim-camp-select-ov');
  if (!sel) return;
  try {
    const fid = getActiveFirmId();
    const camps = typeof takvimCampChoices === 'function' ? await takvimCampChoices(fid) : ((await sb(fid ? `campaigns?firm_id=eq.${fid}&status=in.(active,paused)&select=id,name,status,settings,firm_id&order=name.asc` : `campaigns?status=in.(active,paused)&select=id,name,status,settings,firm_id&order=name.asc`)) || []);
    if (typeof takvimFillCampSelect === 'function') takvimFillCampSelect(sel, camps, takvimCampId);
    else sel.innerHTML = '<option value="">Kampanya seç...</option>' + camps.map(c=>`<option value="${c.id}" ${c.id===takvimCampId?'selected':''}>${c.name}</option>`).join('');
    if (sel.value) takvimCampId = sel.value;
    else if (!camps.some((c) => c.id === takvimCampId)) takvimCampId = null;
    if (takvimCampId) loadTakvimSlots();
  } catch(e) {}
}

async function openTakvimOverlay() {
  if (typeof takvimArmDialerPlz === 'function') takvimArmDialerPlz();
  if (typeof userHasPagePerm === 'function' && !userHasPagePerm('takvim')) {
    if (typeof toast === 'function') toast(typeof t === 'function' ? t('nav.no_perm') : 'Bu sayfa için yetkiniz yok', 'warn');
    return;
  }
  const ov = document.getElementById('takvim-popup-overlay');
  if (!ov) { navigate('takvim'); return; }
  ov.classList.add('open');

  // Overlay içindeki grid ID'lerini ayarla (ana sayfa takvimi ile aynı renderTakvimGrid / slot mantığı)
  window._takvimGridId      = 'takvim-grid-ov';
  window._takvimScrollId    = 'takvim-scroll-ov';
  window._takvimWeekLabelId = 'takvim-week-label-ov';
  window._takvimFailedSecId = 'takvim-failed-section-ov';
  window._takvimFailedGridId = 'takvim-failed-grid-ov';

  const ovAdmin  = document.getElementById('takvim-overlay-admin');
  const ovCampLbl = document.getElementById('takvim-overlay-camp-label');
  const isAdmin  = mbIsFirmAdmin();
  if (ovAdmin) ovAdmin.style.display = isAdmin ? 'flex' : 'none';

  const preferredCamp =
    (currentContact && currentContact.campaign_id) ||
    (typeof selectedCampId !== 'undefined' && selectedCampId ? selectedCampId : null) ||
    null;

  if (isAdmin) {
    // Super admin: firma seçici göster, firma değişince kampanyaları yenile
    if (mbIsSuperAdmin()) {
      renderFirmSelector('takvim-overlay-firm-selector', () => _loadTakvimOverlayCamps());
    }
    await _loadTakvimOverlayCamps();
    const selOv = document.getElementById('takvim-camp-select-ov');
    if (preferredCamp && selOv && [...selOv.options].some((o) => o.value === String(preferredCamp))) {
      takvimCampId = preferredCamp;
      selOv.value = preferredCamp;
      await loadTakvimSlots();
    }
  } else {
    // Agent: atanmış kampanyaları yükle ve select göster
    try {
      const firmId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id;
      const agentCamps = typeof takvimAgentCamps === 'function'
        ? await takvimAgentCamps(firmId)
        : ((firmId ? (await sb(`campaigns?select=id,name,status,settings,firm_id&status=eq.active&firm_id=eq.${firmId}&order=name.asc`)) || [] : []).filter((c) => typeof mbUserSeesCampaign !== 'function' || mbUserSeesCampaign(c, currentUser.id)));
      const prefOk = preferredCamp && agentCamps.some((c) => c.id === preferredCamp);
      if (prefOk) takvimCampId = preferredCamp;
      else if (!takvimCampId && agentCamps.length) takvimCampId = agentCamps[0].id;
      // Show a simple select for agents too if they have multiple campaigns
      if (agentCamps.length > 1) {
        const agentCampWrap = document.getElementById('takvim-overlay-camp-label');
        if (agentCampWrap) {
          agentCampWrap.innerHTML = `<select class="form-input" id="takvim-camp-select-agent-ov" style="font-size:12px;padding:5px 10px;max-width:200px;" onchange="onTakvimCampChange(this.value)">
          ${agentCamps.map(c=>`<option value="${c.id}" ${c.id===takvimCampId?'selected':''}>${c.name}</option>`).join('')}
          </select>`;
        }
      } else if (agentCamps.length === 1) {
        if (ovCampLbl) ovCampLbl.textContent = agentCamps[0].name;
        takvimCampId = agentCamps[0].id;
      }
    } catch(e) {
      if (preferredCamp) takvimCampId = preferredCamp;
      else if (selectedCampId) takvimCampId = selectedCampId;
    }
  }

  const mainSel = document.getElementById('takvim-camp-select');
  if (mainSel && takvimCampId && [...mainSel.options].some((o) => o.value === String(takvimCampId))) {
    mainSel.value = takvimCampId;
  }

  if (typeof syncTakvimViewButtonStyles === 'function') syncTakvimViewButtonStyles();

  if (!takvimDate) takvimDate = typeof takvimBerlinDate === 'function' ? takvimBerlinDate() : new Date();
  // Re-render after layout is ready so clientHeight is correct for row height calc
  requestAnimationFrame(() => {
    renderTakvimGrid();
    if (takvimCampId) loadTakvimSlots();
  });
}

function closeTakvimOverlay() {
  if (typeof takvimHideTip === 'function') takvimHideTip();
  const ov = document.getElementById('takvim-popup-overlay');
  if (ov) ov.classList.remove('open');
  if (typeof takvimClearMovePickMode === 'function') takvimClearMovePickMode();
  // Ana sayfaya geçince grid ID'leri resetle
  window._takvimGridId     = 'takvim-grid';
  window._takvimScrollId   = 'takvim-scroll';
  window._takvimWeekLabelId = 'takvim-week-label';
  delete window._takvimFailedSecId;
  delete window._takvimFailedGridId;
  const pg = document.getElementById('page-takvim');
  if (pg && pg.classList.contains('active') && typeof loadTakvimSlots === 'function') loadTakvimSlots();
  if (typeof mbOfferTerminWithoutSlot === 'function') mbOfferTerminWithoutSlot();
}

// ── Precall mic test ──────────────────────────
async function startPrecallTest() {
  const meter = document.getElementById('precall-meter-fill');
  const status = document.getElementById('precall-status');
  try {
    _precallStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    _precallAnalyser = ctx.createAnalyser();
    const src = ctx.createMediaStreamSource(_precallStream);
    src.connect(_precallAnalyser);
    _precallAnalyser.fftSize = 256;
    const buf = new Uint8Array(_precallAnalyser.frequencyBinCount);
    _precallOk = false;
    const check = () => {
      if (!_precallStream) return;
      _precallAnalyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s,v)=>s+v,0)/buf.length;
      if (meter) meter.style.width = Math.min(100,avg*3)+'%';
      if (avg > 10) _precallOk = true;
      requestAnimationFrame(check);
    };
    check();
    if (status) { status.textContent = 'Konuşun — ses seviyesi gösteriliyor'; status.style.color='var(--green)'; }
  } catch(e) {
    if (status) { status.textContent = '❌ Mikrofon izni reddedildi'; status.style.color='var(--red)'; }
  }
}

function stopPrecallTest() {
  if (_precallStream) { _precallStream.getTracks().forEach(t=>t.stop()); _precallStream=null; }
  const status = document.getElementById('precall-status');
  if (status) {
    if (_precallOk) { status.textContent='✅ Mikrofon çalışıyor'; status.style.color='var(--green)'; }
    else { status.textContent='Ses algılanmadı — kontrol edin'; status.style.color='var(--yellow)'; }
  }
}

