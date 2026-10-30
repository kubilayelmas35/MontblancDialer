// ─────────────────────────────────────────────
// UI — sidebar, navigasyon, tema, dil, toast, modaller
// ─────────────────────────────────────────────

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
try { window.escapeHtml = escapeHtml; } catch (_) {}

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
if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
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
function _mbPageFn(name) {
  try {
    const fn = globalThis[name];
    return typeof fn === 'function' ? fn : null;
  } catch (_) {
    return null;
  }
}

const _NAVIGATE_LOADERS = {
  dashboard: () => {
    _mbPageFn('loadDashboard')?.();
    _mbPageFn('loadJobMarketKpi')?.();
  },
  campaigns: () => { _mbPageFn('loadCampaigns')?.(); },
  queues: () => { _mbPageFn('loadQueuesPage')?.(); },
  agents: () => { _mbPageFn('loadAgents')?.(); },
  stats: () => { _mbPageFn('initStatsFilters')?.(); _mbPageFn('loadStats')?.(); },
  callhistory: () => { _mbPageFn('initCallHistoryFilters')?.(); _mbPageFn('loadCallHistory')?.(); },
  export: () => { _mbPageFn('loadExportTerminPage')?.(); },
  performance: () => { _mbPageFn('loadPerformancePage')?.(); },
  dialer: () => {
    _mbPageFn('initDialer')?.();
    _mbPageFn('refreshDialerHealthPanel')?.();
    setTimeout(() => _mbPageFn('mbFitAgentCampNames')?.(), 60);
  },
  field: () => {
    _mbPageFn('loadFieldPage')?.();
    _mbPageFn('loadNotificationCenter')?.();
  },
  fieldops: () => { _mbPageFn('loadFieldOpsPage')?.(); },
  jobmarket: () => {
    _mbPageFn('loadJobMarketPage')?.();
    if (_mbPageFn('refreshJobMarketMap')) {
      setTimeout(() => _mbPageFn('refreshJobMarketMap')?.(), 0);
      setTimeout(() => _mbPageFn('refreshJobMarketMap')?.(), 280);
    }
  },
  myhistory: () => { _mbPageFn('initMyHistoryFilters')?.(); _mbPageFn('loadMyHistory')?.(); },
  settings: () => {
    _mbPageFn('loadSavedSettings')?.();
    _mbPageFn('loadRolesPage')?.();
    _mbPageFn('loadIncomingCallsSettingsPage')?.();
    _mbPageFn('loadAppointmentResultsSettings')?.();
    _mbPageFn('loadQcScopeSettings')?.();
    setTimeout(() => _mbPageFn('initSettingsTabs')?.(window.__settingsTab || 'general'), 0);
    _mbPageFn('loadMesaiSettings')?.();
    _mbPageFn('loadCallHoursSettings')?.();
    _mbPageFn('loadGoalSettingsForm')?.();
    _mbPageFn('loadChatSettingsPage')?.();
    _mbPageFn('loadFieldSettingsPage')?.();
    _mbPageFn('loadSmsSettingsPage')?.();
    _mbPageFn('loadFeatureFlagsPage')?.();
    _mbPageFn('loadAuditEventsPage')?.();
    _mbPageFn('loadJobPermissionsSettings')?.();
  },
  wiedervorlage: () => { _mbPageFn('loadWvPage')?.(); },
  qc: () => {
    _mbPageFn('loadQcData')?.();
    _mbPageFn('loadJobMarketQcQueue')?.();
  },
  supervisor: () => { _mbPageFn('loadSupervisorPanel')?.(); },
  firms: () => { _mbPageFn('loadFirmsPage')?.(); },
  spend: () => { _mbPageFn('loadSpendPage')?.(); },
  firmdesk: () => { _mbPageFn('loadFirmDesk')?.(); },
  takvim: () => { _mbPageFn('loadTakvimPage')?.(); },
  leave: () => { _mbPageFn('loadLeavePage')?.(); },
  muhasebe: () => { _mbPageFn('loadMuhasebePage')?.(); },
  maasim: () => { _mbPageFn('loadMaasimPage')?.(); },
  performansim: () => { _mbPageFn('loadPerformansimPage')?.(); },
  competition: () => { _mbPageFn('loadCompetitionPage')?.(); },
  geocon: () => { _mbPageFn('loadGeoconPage')?.(); },
  tour: () => { _mbPageFn('tourRefresh')?.(); _mbPageFn('mbLoadAiStaff')?.(); },
};

function runPageEntry(page) {
  const run = _NAVIGATE_LOADERS[page];
  if (typeof run === 'function') {
    try { run(); } catch (e) { console.error(e); }
  }
  if (typeof syncGlobalMascotDock === 'function') setTimeout(() => syncGlobalMascotDock(), 0);
}

function navigate(page) {
document.getElementById('mb-camp-notif')?.remove();
const pg = document.getElementById(`page-${page}`);
if (!pg) {
  if (typeof toast === 'function') toast(typeof t === 'function' ? t('nav.missing_page') : 'Bu sayfa yok', 'warn');
  return;
}
if (typeof userHasPagePerm === 'function' && Array.isArray(ALL_PAGES) && ALL_PAGES.some((p) => p.key === page) && !userHasPagePerm(page)) {
  if (typeof toast === 'function') toast(typeof t === 'function' ? t('nav.no_perm') : 'Bu sayfa için yetkiniz yok', 'warn');
  return;
}
if (page !== 'supervisor' && typeof unloadSupervisorPanel === 'function') unloadSupervisorPanel();
if (page !== 'agents' && typeof agentsStopPoll === 'function') agentsStopPoll();
if (page !== 'dialer') {
  if (window._qcReviewApptId) selectedOutcome = null;
  window._qcReviewApptId = null;
  if (typeof _qcRestoreOutcomeChrome === 'function') _qcRestoreOutcomeChrome();
  if (typeof closeMicAudioDrawer === 'function') closeMicAudioDrawer();
  if (typeof closeManualDialDrawer === 'function') closeManualDialDrawer();
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
}
document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
pg.classList.add('active');
const btn = document.querySelector(`.sb-item[onclick="navigate('${page}')"]`)
  || (page === 'takvim' ? document.getElementById('nav-takvim-btn') : null);
if (btn) {
  btn.classList.add('active');
  btn.closest('.sb-group')?.classList.remove('is-collapsed');
}
if (window.innerWidth <= 1024) closeSidebar();
if (page !== 'dialer' && typeof stopInboundTestSimulationScheduler === 'function') stopInboundTestSimulationScheduler();
runPageEntry(page);
if (typeof mbClearToasts === 'function') mbClearToasts();
const notif = document.getElementById('notification-center');
if (notif) notif.style.display = 'none';
if (typeof toggleTeamChat === 'function') toggleTeamChat(false);
if (typeof mbSyncInboundStrip === 'function') mbSyncInboundStrip();
if (typeof mbRefreshOpenBadge === 'function') mbRefreshOpenBadge(false);
if (typeof mbClearNavSearch === 'function') mbClearNavSearch();
if (typeof mbPersonClose === 'function') mbPersonClose();
try {
  localStorage.setItem('mb_last_page', page);
  if (page === 'stats' && window._statsReport) localStorage.setItem('mb_last_report', window._statsReport);
  else localStorage.removeItem('mb_last_report');
} catch (e) {}
}

function initSettingsTabs(preferTab) {
  const page = document.getElementById('page-settings');
  if (!page) return;
  const cards = [...page.querySelectorAll('.settings-layout > .card')];
  const groups = {
    general: new Set(['settings-appearance-card']),
    mascot: new Set(['settings-mascot-card', 'mascot-default-card']),
    communication: new Set(['incoming-calls-settings-card', 'chat-settings-card']),
    notifications: new Set(['notif-settings-card']),
    operations: new Set(['settings-goals-card']),
    quality: new Set(['results-settings-card', 'qc-scope-card']),
    takvim: new Set(['default-takvim-firm-card']),
    mesai: new Set(['mesai-plan-card', 'mesai-settings-card', 'call-hours-card']),
    field: new Set(['field-settings-card']),
    lines: new Set(['line-firms-card']),
    system: new Set(['feature-flags-card', 'job-permissions-card', 'audit-log-card', 'roles-card', 'sb-settings']),
  };
  cards.forEach((card) => {
    if (!card.id) return;
    for (const [key, set] of Object.entries(groups)) {
      if (set.has(card.id)) {
        card.dataset.settingsGroup = key;
        break;
      }
    }
  });
  mbSyncSettingsTabs();
  const agent = String(currentUser?.role || '') === 'agent';
  const tab = agent ? 'notifications' : (preferTab || 'general');
  window.__settingsTab = '';
  setSettingsTab(tab);
  if (tab === 'notifications' && typeof opsEnsureNotifFirmForm === 'function') opsEnsureNotifFirmForm();
}

function mbSyncSettingsTabs() {
  const superOnly = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const agent = String(currentUser?.role || '') === 'agent';
  document.querySelectorAll('#settings-tabs .settings-tab-btn').forEach((btn) => {
    const tab = btn.dataset.tab;
    if (agent) {
      btn.style.display = tab === 'notifications' ? '' : 'none';
      return;
    }
    if (tab === 'takvim' && !(typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin())) {
      btn.style.display = 'none';
      return;
    }
    if (tab === 'lines') {
      const show = !agent && typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
      btn.style.display = show ? '' : 'none';
      return;
    }
    const ownerTab = tab === 'system';
    btn.style.display = !superOnly && ownerTab ? 'none' : '';
  });
  if (agent) {
    setSettingsTab('notifications');
    if (typeof opsEnsureNotifFirmForm === 'function') opsEnsureNotifFirmForm();
    return;
  }
  const active = document.querySelector('#settings-tabs .settings-tab-btn.active');
  if (active && active.style.display === 'none') setSettingsTab('general');
}

function setSettingsTab(tabId) {
  const page = document.getElementById('page-settings');
  if (!page) return;
  const cards = [...page.querySelectorAll('.settings-layout > .card')];
  cards.forEach((card) => {
    const group = card.dataset.settingsGroup || 'operations';
    const hide = group !== tabId;
    card.classList.toggle('settings-card-tab-hidden', hide);
  });
  if (tabId === 'takvim') {
    const card = document.getElementById('default-takvim-firm-card');
    if (card) {
      card.dataset.settingsGroup = 'takvim';
      card.classList.remove('settings-card-tab-hidden');
      card.style.display = '';
    }
  }
  const tabs = page.querySelectorAll('.settings-tab-btn');
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  if (tabId === 'lines' && typeof mbLoadLineFirms === 'function') mbLoadLineFirms();
}

window._apptResultsByFirm = window._apptResultsByFirm || {};
function _uiEsc(s) {
  return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s ?? '');
}

function mbResultLabel(key, storedLabel) {
  const k = typeof _normResultKey === 'function' ? _normResultKey(key) : String(key || '');
  const mapKey = {
    qc_bekleniyor: 'res.qc_bekleniyor',
    basarili: 'res.basarili',
    basarisiz: 'res.basarisiz',
    beklemede: 'res.beklemede',
    ulasilamadi: 'res.ulasilamadi',
    iptal: 'res.iptal',
  }[k];
  const raw = String(storedLabel || '').trim();
  if (!mapKey || typeof t !== 'function' || typeof MB_I18N === 'undefined') return raw || key || '';
  const tr = MB_I18N.tr[mapKey];
  const de = MB_I18N.de[mapKey];
  const legacy = k === 'qc_bekleniyor' && (raw === 'QC Bekleniyor' || raw === 'QC ausstehend' || raw === 'KK Bekleniyor');
  if (!raw || raw === tr || raw === de || raw === k || raw === key || legacy) return t(mapKey);
  return raw;
}

function defaultAppointmentResults() {
  return [
    { key: 'qc_bekleniyor', label: 'Kalite kontrol bekliyor', color: '#2563eb', contact_status: 'qc bekleniyor', auto_move_down: false },
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
        color_from: /^#[0-9A-Fa-f]{6}$/.test(String(r?.color_from || '').trim()) ? String(r.color_from).trim() : '',
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
  const canEdit = mbIsFirmAdmin();
  box.style.display = canEdit ? '' : 'none';
  if (!canEdit) return;
  if (selectorHost) {
    renderFirmSelector('results-firm-selector', loadAppointmentResultsSettings);
    selectorHost.style.display = isSuperAdmin() ? '' : 'none';
  }
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px 0;">Randevu sonuçlarını görmek için firma seçin.</div>`;
    const bosHost = document.getElementById('s-bos-color-row');
    if (bosHost) bosHost.innerHTML = '';
    return;
  }
  const rows = await loadFirmAppointmentResults(fid, true);
  renderAppointmentResultRows(rows);
  if (typeof mbReloadFirmTakvimDefaults === 'function') await mbReloadFirmTakvimDefaults(fid);
  renderBosSlotColor(window._firmDefaultTakvimByFirm?.[fid] || {});
}

function renderAppointmentResultRows(rows) {
  const wrap = document.getElementById('s-appt-results-rows');
  if (!wrap) return;
  const safe = rows?.length ? rows : [defaultAppointmentResults()[0]];
  const gripLabel = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Reihenfolge ändern' : 'Sırayı değiştir';
  wrap.innerHTML = safe.map((r, i) => `
    <div class="ar-row">
      <button type="button" class="ar-grip" draggable="true" aria-label="${gripLabel}" title="${gripLabel}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>
      </button>
      <div class="form-row">
        <label class="form-label">Sonuç tipi</label>
        <select class="form-input" id="ar-type-${i}" onchange="syncAppointmentResultLabel(${i})">
          <option value="qc_bekleniyor" ${r.key==='qc_bekleniyor'?'selected':''}>Kalite kontrol bekliyor</option>
          <option value="basarili" ${r.key==='basarili'?'selected':''}>Başarılı</option>
          <option value="basarisiz" ${r.key==='basarisiz'?'selected':''}>Başarısız</option>
          <option value="beklemede" ${r.key==='beklemede'?'selected':''}>Beklemede</option>
          <option value="ulasilamadi" ${r.key==='ulasilamadi'?'selected':''}>Ulaşılamadı</option>
          <option value="iptal" ${r.key==='iptal'?'selected':''}>İptal</option>
          <option value="__custom" ${!['qc_bekleniyor','basarili','basarisiz','beklemede','ulasilamadi','iptal'].includes(r.key)?'selected':''}>Özel ad</option>
        </select>
      </div>
      <div class="form-row"><label class="form-label">Görünen ad</label><input class="form-input" id="ar-label-${i}" value="${_uiEsc(r.label||'')}"></div>
      <div class="form-row ar-colors">
        <label class="form-label">${_uiEsc(typeof t === 'function' ? t('qc.color.pair') : 'Renk')}</label>
        <div class="ar-grad">
          <input class="form-input" id="ar-color-from-${i}" type="color" data-auto="${r.color_from ? '0' : '1'}" value="${_uiEsc(r.color_from ? _normalizeResultColor(r.color_from) : _resultAutoFrom(r.color))}" title="${_uiEsc(typeof t === 'function' ? t('qc.color.start') : 'Başlangıç')}">
          <input class="form-input" id="ar-color-${i}" type="color" value="${_uiEsc(_normalizeResultColor(r.color))}" title="${_uiEsc(typeof t === 'function' ? t('qc.color.end') : 'Bitiş')}">
          <span class="ar-grad-bar"></span>
        </div>
      </div>
      <label class="ar-move"><input type="checkbox" id="ar-move-${i}" ${r.auto_move_down?'checked':''}> Otomatik alta taşı</label>
      <button class="btn btn-ghost btn-sm" type="button" onclick="removeAppointmentResultRow(${i})">Sil</button>
    </div>
  `).join('');
  wrap.dataset.count = String(safe.length);
  wrap.querySelectorAll('.ar-row').forEach((row) => mbBindResultGradient(row));
  mbBindResultReorder(wrap);
}

function renderBosSlotColor(tk) {
  const host = document.getElementById('s-bos-color-row');
  if (!host) return;
  const say = typeof t === 'function' ? t : ((k) => k);
  const color = _normalizeResultColor(tk?.bos_color || '#3b82f6');
  const storedFrom = /^#[0-9A-Fa-f]{6}$/.test(String(tk?.bos_color_from || '').trim()) ? String(tk.bos_color_from).trim() : '';
  host.innerHTML = `<div class="ar-row ar-row-bos">
    <span class="ar-grip" aria-hidden="true"></span>
    <div class="form-row"><label class="form-label">Sonuç tipi</label><input class="form-input" value="${_uiEsc(say('qc.color.bos'))}" disabled></div>
    <div class="form-row"><label class="form-label">Görünen ad</label><input class="form-input" value="${_uiEsc(say('cal.filter.empty'))}" disabled></div>
    <div class="form-row ar-colors">
      <label class="form-label">${_uiEsc(say('qc.color.pair'))}</label>
      <div class="ar-grad">
        <input class="form-input" id="ar-color-from-bos" type="color" data-auto="${storedFrom ? '0' : '1'}" value="${_uiEsc(storedFrom || _resultAutoFrom(color))}" title="${_uiEsc(say('qc.color.start'))}">
        <input class="form-input" id="ar-color-bos" type="color" value="${_uiEsc(color)}" title="${_uiEsc(say('qc.color.end'))}">
        <span class="ar-grad-bar"></span>
      </div>
    </div>
    <span></span>
    <span></span>
  </div>`;
  const row = host.querySelector('.ar-row');
  if (row) mbBindResultGradient(row);
}

function readBosSlotColor() {
  const colorEl = document.getElementById('ar-color-bos');
  const fromEl = document.getElementById('ar-color-from-bos');
  if (!colorEl) return null;
  const color = _normalizeResultColor(colorEl.value || '#3b82f6');
  const out = { color };
  if (fromEl && fromEl.dataset.auto !== '1') out.color_from = _normalizeResultColor(fromEl.value);
  return out;
}

function _resultAutoFrom(color) {
  const end = _normalizeResultColor(color);
  if (typeof takvimGradientFromAccent === 'function') return takvimGradientFromAccent(end).from;
  return end;
}

function mbPaintResultGradient(row) {
  if (!row) return;
  const fromEl = row.querySelector('input[id^="ar-color-from-"]');
  const colorEl = [...row.querySelectorAll('input[type="color"]')].find((el) => /^ar-color-(?:\d+|bos)$/.test(el.id));
  const bar = row.querySelector('.ar-grad-bar');
  if (!colorEl || !bar) return;
  const end = _normalizeResultColor(colorEl.value);
  if (fromEl && fromEl.dataset.auto === '1') fromEl.value = _resultAutoFrom(end);
  const start = _normalizeResultColor(fromEl?.value || end);
  bar.style.background = `linear-gradient(135deg, ${start}, ${end})`;
}

function mbBindResultGradient(row) {
  const fromEl = row.querySelector('input[id^="ar-color-from-"]');
  const colorEl = [...row.querySelectorAll('input[type="color"]')].find((el) => /^ar-color-(?:\d+|bos)$/.test(el.id));
  colorEl?.addEventListener('input', () => {
    if (fromEl?.dataset.auto === '1') fromEl.value = _resultAutoFrom(colorEl.value);
    mbPaintResultGradient(row);
  });
  fromEl?.addEventListener('input', () => {
    fromEl.dataset.auto = '0';
    mbPaintResultGradient(row);
  });
  mbPaintResultGradient(row);
}

function mbBindResultReorder(wrap) {
  wrap.querySelectorAll('.ar-grip').forEach((grip) => {
    grip.addEventListener('dragstart', (ev) => {
      const row = grip.closest('.ar-row');
      wrap._dragRow = row;
      wrap._dragBefore = readAppointmentResultRows().map((item) => item.key).join('|');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', 'result');
      row.classList.add('is-dragging');
    });
    grip.addEventListener('dragend', async () => {
      const row = wrap._dragRow;
      row?.classList.remove('is-dragging');
      wrap._dragRow = null;
      const parsed = readAppointmentResultRows();
      if (parsed.map((item) => item.key).join('|') === wrap._dragBefore) return;
      renderAppointmentResultRows(parsed);
      await saveAppointmentResultsSettings();
    });
  });
  if (wrap.dataset.reorder === '1') return;
  wrap.dataset.reorder = '1';
  wrap.addEventListener('dragover', (ev) => {
    const dragRow = wrap._dragRow;
    if (!dragRow) return;
    ev.preventDefault();
    const row = ev.target.closest?.('.ar-row');
    if (!row || row === dragRow || !wrap.contains(row)) return;
    const mid = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    wrap.insertBefore(dragRow, ev.clientY > mid ? row.nextSibling : row);
  });
}

function syncAppointmentResultLabel(idx) {
  const t = document.getElementById(`ar-type-${idx}`)?.value || '';
  const l = document.getElementById(`ar-label-${idx}`);
  if (!l) return;
  const map = {
    qc_bekleniyor: 'Kalite kontrol bekliyor',
    basarili: 'Başarılı',
    basarisiz: 'Başarısız',
    beklemede: 'Beklemede',
    ulasilamadi: 'Ulaşılamadı',
    iptal: 'İptal',
  };
  if (t === '__custom') return;
  if (!String(l.value || '').trim()) l.value = map[t] || t;
}

function _uniqueResultKey(base, used) {
  let key = _normResultKey(base) || 'ozel';
  if (!used.has(key)) return key;
  let n = 2;
  while (used.has(`${key}_${n}`)) n += 1;
  return `${key}_${n}`;
}

function readAppointmentResultRows() {
  const wrap = document.getElementById('s-appt-results-rows');
  const domRows = [...(wrap?.querySelectorAll(':scope > .ar-row') || [])];
  const out = [];
  const used = new Set();
  domRows.forEach((row, i) => {
    const picked = row.querySelector('select')?.value || '';
    const label = String(row.querySelector('input[id^="ar-label-"]')?.value || '').trim();
    const colorEl = [...row.querySelectorAll('input[type="color"]')].find((el) => /^ar-color-(?:\d+|bos)$/.test(el.id));
    const fromEl = row.querySelector('input[id^="ar-color-from-"]');
    const color = _normalizeResultColor(colorEl?.value || '#64748b');
    const auto_move_down = !!row.querySelector('input[type="checkbox"]')?.checked;
    const base = picked === '__custom' ? (label || `ozel_${i + 1}`) : picked;
    const key = _uniqueResultKey(base, used);
    if (!key) return;
    used.add(key);
    const item = { key, label: label || key, color, contact_status: appointmentResultToContactStatus(key), auto_move_down };
    if (fromEl && fromEl.dataset.auto !== '1') item.color_from = _normalizeResultColor(fromEl.value);
    out.push(item);
  });
  return out;
}

function addAppointmentResultRow() {
  const cur = readAppointmentResultRows();
  const used = new Set(cur.map((row) => row.key));
  const key = _uniqueResultKey('yeni_sonuc', used);
  cur.push({ key, label: 'Yeni sonuç', color: '#7c3aed', contact_status: appointmentResultToContactStatus(key), auto_move_down: false });
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
    const prevTk = existing.default_takvim && typeof existing.default_takvim === 'object' ? existing.default_takvim : {};
    const bos = readBosSlotColor();
    const default_takvim = { ...prevTk, bos_color: bos?.color || prevTk.bos_color || '#3b82f6' };
    if (bos?.color_from) default_takvim.bos_color_from = bos.color_from;
    else delete default_takvim.bos_color_from;
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, appointment_results: parsed, default_takvim } }),
    });
    window._apptResultsByFirm[fid] = parsed;
    if (typeof mbRememberFirmTakvim === 'function') mbRememberFirmTakvim(fid, default_takvim);
    if (typeof renderTakvimSlots === 'function') renderTakvimSlots();
    if (typeof renderTakvimFailed === 'function') renderTakvimFailed();
    if (typeof loadMyMiniStats === 'function') loadMyMiniStats();
    if (typeof mbPaintTodayResults === 'function') mbPaintTodayResults();
    toast('Randevu sonuçları kaydedildi', 'ok');
  } catch (e) {
    toast('Kaydetme hatası: ' + e.message, 'err');
  }
}

// ── LANG ─────────────────────────────────────
function setLang(l) {
const langChanged = currentLang !== l;
currentLang = l;
document.querySelectorAll('.modal-overlay.open').forEach((m) => {
  if (m.id === 'm-system-dialog') return;
  m.classList.remove('open');
});
document.getElementById('lang-btn').textContent = l.toUpperCase();
document.documentElement.lang = l;
if (typeof applyDomI18n === 'function') applyDomI18n();
document.querySelectorAll(`[data-${l}]`).forEach(el => {
if (el.tagName==='INPUT'||el.tagName==='TEXTAREA') {
el.placeholder = el.getAttribute(`data-${l}`)||el.placeholder;
} else if (el.tagName==='OPTION') {
el.textContent = el.getAttribute(`data-${l}`)||el.textContent;
} else {
el.textContent = el.getAttribute(`data-${l}`)||el.getAttribute('data-tr');
}
});
document.querySelectorAll('[data-tr-title]').forEach((el) => {
  const v = el.getAttribute(l === 'de' ? 'data-de-title' : 'data-tr-title');
  if (v) el.setAttribute('title', v);
});
document.querySelectorAll('[data-tr-aria]').forEach((el) => {
  const v = el.getAttribute(l === 'de' ? 'data-de-aria' : 'data-tr-aria');
  if (v) el.setAttribute('aria-label', v);
});
try { localStorage.setItem('mb-lang', l); } catch (_) {}
try {
  const geoFrame = document.getElementById('geocon-frame');
  if (geoFrame && geoFrame.contentWindow) {
    geoFrame.contentWindow.postMessage({ type: 'mb-geocon-lang', lang: l === 'de' ? 'de' : 'tr' }, window.location.origin);
  }
} catch (_) {}
if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
if (typeof window._mbConnStatus === 'string' && typeof updateConnectionStatus === 'function') {
  updateConnectionStatus(window._mbConnStatus);
}
if (typeof renderHotkeyHints === 'function') renderHotkeyHints();
if (typeof mbPaintTopFirm === 'function') mbPaintTopFirm();
if (typeof ariaPaintName === 'function') ariaPaintName();
if (typeof refreshGlobalMascotInfoPanel === 'function') refreshGlobalMascotInfoPanel();
const testBtn = document.getElementById('test-mode-btn');
if (testBtn && typeof t === 'function') {
  testBtn.textContent = (typeof _testMode !== 'undefined' && _testMode) ? t('dial.test_btn_on') : t('dial.test_btn_off');
}
if (typeof _syncGoalTabChromeFromPerf === 'function') _syncGoalTabChromeFromPerf();
if (typeof _mbPaintMonthFaces === 'function') _mbPaintMonthFaces();
if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel();
if (document.getElementById('page-dashboard')?.classList.contains('active') && typeof mbAgentDay === 'function') void mbAgentDay();
const activePage = (document.querySelector('.page.active')?.id || '').replace(/^page-/, '');
const inCall = typeof dialerStatus !== 'undefined' && (dialerStatus === 'on_call' || dialerStatus === 'wrapping');
if (langChanged && !(typeof _mbPrefsApplying !== 'undefined' && _mbPrefsApplying) && currentUser && activePage && activePage !== 'settings' && !(activePage === 'dialer' && inCall) && typeof runPageEntry === 'function') {
  runPageEntry(activePage);
}
if (typeof dialerStatus !== 'undefined' && dialerStatus === 'break' && typeof refreshBreakCustEmpty === 'function') {
  refreshBreakCustEmpty();
}
if (typeof dialerStatus !== 'undefined' && dialerStatus === 'on_call' && typeof refreshHangupFinalizeButton === 'function') {
  refreshHangupFinalizeButton();
}
if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
if (typeof mbLogoRefresh === 'function') mbLogoRefresh();
if (typeof showCampScript === 'function' && typeof currentContact !== 'undefined' && currentContact) {
  showCampScript(currentContact);
}
const attemptBadge = document.getElementById('cust-attempt-badge');
if (attemptBadge && typeof currentContact !== 'undefined' && currentContact && typeof uqSay === 'function') {
  attemptBadge.textContent = uqSay('dial.attempt', '{n}. arama', { n: currentContact.attempt_count || 1 });
}
  const _ce = document.getElementById('cust-empty');
  if (_ce && _ce.style.display !== 'none' && typeof refreshCustEmptyCoachBubble === 'function') {
    refreshCustEmptyCoachBubble();
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
if (typeof mbGeoconOnTheme === 'function') mbGeoconOnTheme(t);
const icon = document.getElementById('theme-icon');
if (icon) icon.innerHTML = t==='light'
  ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3.5 12h2M18.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
localStorage.setItem('mb-theme', t);
mbApplyChartTheme();
if (typeof mbPaintLiveGradForm === 'function') mbPaintLiveGradForm();
if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbApplyChartTheme() {
  if (typeof Chart === 'undefined') return;
  const cs = getComputedStyle(document.documentElement);
  const text = cs.getPropertyValue('--text-2').trim() || '#d5dcec';
  const grid = cs.getPropertyValue('--border-2').trim() || 'rgba(255,255,255,0.18)';
  Chart.defaults.color = text;
  Chart.defaults.borderColor = grid;
}

function toggleTheme() {
setTheme(currentTheme==='light'?'dark':'light');
}

function setPalette(p) {
currentPalette = p;
document.documentElement.setAttribute('data-palette', p);
document.querySelectorAll('.palette-dot').forEach(d => d.classList.toggle('sel', d.dataset.p===p));
localStorage.setItem('mb-palette', p);
if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

let _systemDialogResolve = null;
let _systemDialogType = 'alert';

// Restore theme/palette
(()=>{
const t = localStorage.getItem('mb-theme');
const p = localStorage.getItem('mb-palette');
const savedLang = localStorage.getItem('mb-lang');
if (t) setTheme(t);
if (p) setPalette(p);
if (savedLang === 'de' || savedLang === 'tr') setLang(savedLang);
document.querySelectorAll('.palette-dot').forEach(d => d.classList.toggle('sel', d.dataset.p===(p||'blue')));
})();

// ── TOAST ────────────────────────────────────
function mbClearToasts() {
  const host = document.getElementById('toast');
  if (!host) return;
  [...host.children].forEach((item) => {
    clearTimeout(item._mbTimer);
    item.remove();
  });
}

function toast(msg, type='ok', durationMs) {
  const host = document.getElementById('toast');
  if (!host) return;
  const kind = type === 'err' || type === 'warn' ? type : 'ok';
  const mark = kind === 'ok' ? '✓ ' : kind === 'err' ? '✕ ' : '';
  const item = document.createElement('div');
  item.className = `toast-item ${kind}`;
  item.textContent = mark + String(msg || '');
  host.appendChild(item);
  while (host.children.length > 6) {
    const oldest = host.firstElementChild;
    clearTimeout(oldest._mbTimer);
    oldest.remove();
  }
  requestAnimationFrame(() => item.classList.add('show'));
  const d = Number(durationMs) > 0 ? Number(durationMs) : 3000;
  item._mbTimer = setTimeout(() => {
    item.classList.remove('show');
    item._mbTimer = setTimeout(() => item.remove(), 240);
  }, d);
}

// Alias used in some places
function showToast(msg, type, duration) {
toast(msg, type, duration);
}

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
if (id === 'm-upload-q' && typeof resetUploadQueueForm === 'function') resetUploadQueueForm();
el.style.removeProperty('display');
el.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'm-upload-q' && typeof mbGeoconSetMode === 'function') mbGeoconSetMode(false);
}

document.querySelectorAll('.modal-overlay').forEach(m=>{
m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const notif = document.getElementById('notification-center');
    if (notif && notif.style.display === 'block') {
      notif.style.display = 'none';
      e.preventDefault();
      return;
    }
    if (typeof toggleTeamChat === 'function') {
      const panel = document.getElementById('team-chat-panel');
      if (panel && panel.classList.contains('team-chat-panel--open')) {
        toggleTeamChat(false);
        e.preventDefault();
        return;
      }
    }
    const sysOpen = document.getElementById('m-system-dialog');
    const openModals = [...document.querySelectorAll('.modal-overlay.open')].filter((m) => m !== sysOpen);
    const top = openModals.pop();
    if (top) {
      e.preventDefault();
      top.classList.remove('open');
      if (top.id === 'm-field-settings' || top.id === 'jm-slots-modal' || top.id === 'jm-region-modal') top.remove();
      return;
    }
  }
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
async function saveSettings() {
if (!(typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin())) return;
const fid = (typeof _mbIntegFirmId !== 'undefined' && _mbIntegFirmId) || currentUser?.firm_id;
if (!fid || typeof mbSaveFirmIntegrations !== 'function') return;
const sipUser = document.getElementById('s-sip-user')?.value.trim()||'';
const sipPass = document.getElementById('s-sip-pass')?.value.trim()||'';
const apiKey  = document.getElementById('s-telnyx-key')?.value.trim()||'';
const connId  = document.getElementById('s-conn-id')?.value.trim()||'';
try {
  const prev = await mbLoadFirmIntegrations(fid);
  const saved = await mbSaveFirmIntegrations(fid, {
    telnyx_api_key: apiKey || prev.telnyx_api_key,
    sip_connection_id: connId || prev.sip_connection_id,
    sip_username: sipUser || prev.sip_username,
    sip_password: sipPass || prev.sip_password,
  });
  if (String(fid) === String(currentUser?.firm_id)) mbApplyFirmIntegrationsLocal(saved, true);
  else if (typeof mbFillIntegForms === 'function') mbFillIntegForms(saved);
  toast(t('ui.settings_sip_saved'),'ok');
} catch (e) {
  toast((typeof t === 'function' ? t('dial.log_err') : 'Kayıt hatası: ') + e.message, 'err');
}
}

async function loadSavedSettings() {
loadApiSettings();
if (typeof mbPrepareIntegFirmSelects === 'function') await mbPrepareIntegFirmSelects();
const fid = (typeof _mbIntegFirmId !== 'undefined' && _mbIntegFirmId) || currentUser?.firm_id;
if (fid && typeof mbLoadFirmIntegrations === 'function' && typeof mbFillIntegForms === 'function') {
  mbFillIntegForms(await mbLoadFirmIntegrations(fid));
}
if (typeof loadMascotSettingsForm === 'function') loadMascotSettingsForm();
}

// ── INIT ─────────────────────────────────────
document.getElementById('dash-date').textContent =
new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

// Takvim overlay'dan gelen mesajları dinle
window.addEventListener('message', (e) => {
if (!e.data?.type) return;
if (e.data.type === 'TAKVIM_BOOKED') {
closeTakvimPopup();
toast('🗓️ Randevu takvime kaydedildi ✓', 'ok');
if (currentContact && dialerStatus === 'on_call') {
selectedOutcome = 'appointment';
const map = {appointment:'.ob-appointment'};
document.querySelectorAll('.outcome-btn').forEach(b=>b.style.outline='none');
document.querySelector(map.appointment)?.style.setProperty('outline','2px solid currentColor');
}
}
});
