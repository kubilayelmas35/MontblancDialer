// ─────────────────────────────────────────────
// APPOINTMENTS — takvim ve randevu yönetimi
// ─────────────────────────────────────────────

// ── Takvim yardımcı fonksiyonlar ─────────────
function takvimFmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function takvimBerlinDate() {
  const day = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const m = String(day).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function takvimIsBerlinToday(dt) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : takvimFmtD(new Date());
  return takvimFmtD(dt) === today;
}

function takvimGetMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay() || 7;
  if (day !== 1) dt.setDate(dt.getDate() - (day-1));
  dt.setHours(0,0,0,0);
  return dt;
}

function takvimAddHours(timeStr, hours) {
  const [h,m] = timeStr.split(':').map(Number);
  const total = h*60 + m + hours*60;
  return String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
}

const TAKVIM_DAY_KEYS = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];

function takvimDayKeyFromDate(dt) {
  return TAKVIM_DAY_KEYS[(dt.getDay() + 6) % 7];
}

function takvimWeekdayName(dt, style) {
  const civil = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const loc = typeof mbLocale === 'function' ? mbLocale() : 'tr-TR';
  return new Intl.DateTimeFormat(loc, { weekday: style || 'short', timeZone: 'UTC' }).format(civil);
}

function takvimCivilStamp(dt) {
  const iso = `${takvimFmtD(dt)}T12:00:00`;
  if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return takvimFmtD(dt);
}

function _parseTakvimHour(timeStr, fallback) {
  const t = String(timeStr || '').trim();
  if (!t) return fallback;
  const h = parseInt(t.split(':')[0], 10);
  return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : fallback;
}

function mergeTakvimSettings(raw) {
  const tk = raw && typeof raw === 'object' ? raw : {};
  let active = Array.isArray(tk.active_days) ? tk.active_days.map((d) => String(d).toLowerCase()) : [];
  active = active.filter((d) => TAKVIM_DAY_KEYS.includes(d));
  if (!active.length) active = ['pzt', 'sal', 'car', 'per', 'cum'];
  let startH = _parseTakvimHour(tk.start_hour, 8);
  let endH = _parseTakvimHour(tk.end_hour, 20);
  if (endH < startH) endH = startH;
  const slot_dur = Math.min(4, Math.max(1, parseInt(tk.slot_dur, 10) || 2));
  const max_slots = Math.min(40, Math.max(1, parseInt(tk.max_slots, 10) || 5));
  const bos_color = String(tk.bos_color || '').trim() || '#3b82f6';
  const confirm_new_slot = tk.confirm_new_slot !== false;
  return {
    active_days: active,
    start_hour: `${String(startH).padStart(2, '0')}:00`,
    end_hour: `${String(endH).padStart(2, '0')}:00`,
    startH,
    endH,
    slot_dur,
    max_slots,
    bos_color,
    confirm_new_slot
  };
}

window._firmDefaultTakvimByFirm = window._firmDefaultTakvimByFirm || {};
let _takvimDefaultsFidLoaded = null;

async function ensureFirmTakvimDefaultsLoaded(fid) {
  if (!fid) {
    _takvimDefaultsFidLoaded = null;
    return;
  }
  if (_takvimDefaultsFidLoaded === fid && window._firmDefaultTakvimByFirm[fid] !== undefined) return;
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const s = rows?.[0]?.settings || {};
    const dt = s.default_takvim && typeof s.default_takvim === 'object' ? s.default_takvim : {};
    window._firmDefaultTakvimByFirm[fid] = { ...dt };
    _takvimDefaultsFidLoaded = fid;
  } catch (_) {
    window._firmDefaultTakvimByFirm[fid] = {};
    _takvimDefaultsFidLoaded = fid;
  }
}

function getCampaignTakvimSettings() {
  const c = typeof campaigns !== 'undefined' && Array.isArray(campaigns) ? campaigns.find((x) => x.id === takvimCampId) : null;
  const fid = c?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  const firmTk = fid && window._firmDefaultTakvimByFirm[fid] ? window._firmDefaultTakvimByFirm[fid] : {};
  const campTk = c?.settings?.takvim && typeof c.settings.takvim === 'object' ? c.settings.takvim : {};
  return mergeTakvimSettings({ ...firmTk, ...campTk });
}

function _takvimHexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function _takvimAdjustHex(hex, amt) {
  const rgb = _takvimHexToRgb(hex);
  if (!rgb) return '#1e40af';
  const out = rgb.map((v) => {
    const n = Math.round(v + (amt < 0 ? v * amt * 2.2 : (255 - v) * amt * 2.2));
    return Math.min(255, Math.max(0, n));
  });
  return `#${out.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function takvimGradientFromAccent(hex) {
  const raw = String(hex || '').trim();
  const base = /^#?[a-f\d]{6}$/i.test(raw) ? (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase() : '#3b82f6';
  const dark = _takvimAdjustHex(base, -0.38);
  // Koyu uç solda: isim/metin solda beyaz kalır
  return { gradient: `linear-gradient(135deg,${dark},${base})`, from: dark, to: base };
}

function takvimResolveFirmId(slot, appt) {
  const fromAppt = appt?.firm_id;
  const fromSlot = slot?.firm_id;
  const fromCamp =
    (typeof campaigns !== 'undefined' && Array.isArray(campaigns)
      ? campaigns.find((c) => c.id === takvimCampId)?.firm_id
      : null);
  return fromAppt || fromSlot || fromCamp || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || null;
}

function getSlotGradientAndText(slot, appt) {
  if (slot.durum === 'kilitli') {
    return { background: '#dbeafe', color: '#1e40af' };
  }
  if (slot.durum === 'bos') {
    const tk = getCampaignTakvimSettings();
    const { gradient } = takvimGradientFromAccent(tk.bos_color);
    return { background: gradient, color: '#ffffff' };
  }
  const fid = takvimResolveFirmId(slot, appt);
  const rows = (fid && window._apptResultsByFirm?.[fid]) || (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  const key = appt ? _normResultKey(appt.durum) : '';
  const cfg = Array.isArray(rows) ? rows.find((r) => _normResultKey(r.key) === key) : null;
  if (cfg?.color) {
    const { gradient } = takvimGradientFromAccent(cfg.color);
    return { background: gradient, color: '#ffffff' };
  }
  const d = (appt?.durum || '').toLowerCase();
  if (d === 'basarili') return { background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' };
  if (d.includes('basarisiz') || d.includes('iptal')) return { background: 'linear-gradient(135deg,#991b1b,#b91c1c)', color: '#fff' };
  if (d === 'beklemede') return { background: 'linear-gradient(135deg,#c2410c,#f97316)', color: '#fff' };
  if (d === 'ulasilamadi') return { background: 'linear-gradient(135deg,#a16207,#ca8a04)', color: '#fff' };
  return { background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff' };
}

function takvimSlotDurHours() {
  const d = getCampaignTakvimSettings().slot_dur;
  if (Number.isFinite(d) && d > 0) return d;
  return typeof SLOT_HOURS !== 'undefined' ? SLOT_HOURS : 2;
}

let _takvimDistAllOriginId = null;
const _takvimPlzRouteCache = {};
/** Üst araç çubuğundan girilen PLZ → tüm terminlere uzaklık */
let _takvimMeasureFromPlz = null;
let _takvimMeasureCache = {};

function takvimTimeToMinutes(t) {
  const p = String(t || '0:0').split(':');
  const h = parseInt(p[0], 10) || 0;
  const m = parseInt(p[1], 10) || 0;
  return h * 60 + m;
}

function takvimMinutesToHHMM(total) {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function takvimVisibleDateRange() {
  if (takvimView === 'day') {
    const d = takvimFmtD(takvimDate);
    return [d, d];
  }
  if (takvimView === 'week') {
    const mon = takvimGetMonday(takvimDate);
    const tset = getCampaignTakvimSettings();
    const needSat = tset.active_days.includes('cmt');
    const needSun = tset.active_days.includes('paz');
    const extra = needSun ? 6 : needSat ? 5 : 4;
    const last = new Date(mon);
    last.setDate(last.getDate() + extra);
    return [takvimFmtD(mon), takvimFmtD(last)];
  }
  const y = takvimDate.getFullYear();
  const m = takvimDate.getMonth();
  const startD = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const endD = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`;
  return [startD, endD];
}

function takvimEachDayInRange(startD, endD, fn) {
  const cur = new Date(startD + 'T12:00:00');
  const end = new Date(endD + 'T12:00:00');
  while (cur <= end) {
    fn(takvimFmtD(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

async function _loadPayrollRulesFromFirmSettings(fid) {
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    return rows?.[0]?.settings?.payroll || null;
  } catch (e) {
    return null;
  }
}

async function _getCustomerCtx(selectedId) {
  const fid = getActiveFirmId?.() || currentUser?.firm_id;
  const role = currentUser?.role || '';
  const elevated = ['admin', 'super_admin', 'firm_admin', 'qc'].includes(role);
  let rules = null;
  if (typeof loadFirmPayrollRules === 'function') rules = await loadFirmPayrollRules(fid).catch(() => null);
  if (!rules) rules = await _loadPayrollRulesFromFirmSettings(fid);
  rules = rules || {};
  let customers = [];
  if (typeof loadFirmCustomers === 'function') customers = await loadFirmCustomers(fid, true).catch(() => []);
  if (!customers.length) {
    customers = await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => []);
  }
  const agentCanSelect = !!rules.appointment_customer_select_by_agent;
  const canSelect = elevated || agentCanSelect;
  return { fid, customers: customers || [], canSelect, mustSelect: canSelect && (customers || []).length > 0, selectedId: selectedId || '' };
}

function _renderCustomerField(ctx, selectId) {
  const opts = (ctx.customers || []).map(c =>
    `<option value="${c.id}" ${String(ctx.selectedId || '') === String(c.id) ? 'selected' : ''}>${(c.code ? c.code + ' · ' : '') + c.name}</option>`
  ).join('');
  if (!ctx.customers?.length) {
    return '';
  }
  if (!ctx.canSelect) {
    return `<div class="form-row" style="grid-column:1/-1;">
      <label class="form-label">Müşteri</label>
      <div style="font-size:11px;color:var(--text-3);padding:8px 10px;background:var(--bg-3);border:1px solid var(--border);border-radius:6px;">
        Bu alanda müşteri seçimi sadece QC/Admin tarafından yapılır.
      </div>
    </div>`;
  }
  return `<div class="form-row" style="grid-column:1/-1;">
    <label class="form-label">Müşteri *</label>
    <select class="form-input" id="${selectId}"><option value="">Seçin...</option>${opts}</select>
  </div>`;
}

function _selectedCustomerId(selectId) {
  return String(document.getElementById(selectId)?.value || '').trim() || null;
}

function mbResolveApptCustomerId(selectId, campaignId) {
  const picked = _selectedCustomerId(selectId);
  if (picked) return picked;
  const id = campaignId
    || (typeof currentContact !== 'undefined' ? currentContact?.campaign_id : null)
    || (typeof selectedCampId !== 'undefined' ? selectedCampId : null)
    || (typeof takvimCampId !== 'undefined' ? takvimCampId : null);
  return typeof mbCampDefaultCustomerId === 'function' ? mbCampDefaultCustomerId(id) : null;
}

function _validateCustomerSelection(ctx, selectId, campaignId) {
  if (!ctx.mustSelect) return true;
  if (mbResolveApptCustomerId(selectId, campaignId)) return true;
  toast('Müşteri seçin', 'err');
  return false;
}

async function _createAppointmentWithCustomerFallback(data) {
  try {
    return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(data)});
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('customer_id') || msg.includes('form_ek')) {
      const clone = { ...data };
      if (msg.includes('customer_id')) {
        delete clone.customer_id;
        toast('Not: customer_id migration bekliyor, müşteri bilgisi geçici kaydedilemedi.', 'warn');
      }
      if (msg.includes('form_ek')) delete clone.form_ek;
      return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(clone)});
    }
    throw e;
  }
}

async function renderInlineTerminCustomerField(selectedId) {
  const wrap = document.getElementById('tf2-customer-wrap');
  if (!wrap) return;
  const campId = (typeof currentContact !== 'undefined' && currentContact?.campaign_id) || (typeof selectedCampId !== 'undefined' ? selectedCampId : null);
  const preset = selectedId || (typeof mbCampDefaultCustomerId === 'function' ? mbCampDefaultCustomerId(campId) : null);
  const ctx = await _getCustomerCtx(preset || null);
  wrap.innerHTML = _renderCustomerField(ctx, 'tf2-customer');
}

function takvimClearMovePickMode() {
  window._takvimMovePick = null;
  document.body.classList.remove('takvim-move-pick');
}

function takvimMergeCamps(rows) {
  if (typeof campaigns === 'undefined' || !Array.isArray(campaigns)) return;
  (rows || []).forEach((row) => {
    if (!row?.id) return;
    const i = campaigns.findIndex((c) => c.id === row.id);
    if (i >= 0) campaigns[i] = { ...campaigns[i], ...row };
    else campaigns.push(row);
  });
}

async function takvimCampChoices(fid) {
  const q = fid
    ? `campaigns?firm_id=eq.${fid}&status=in.(active,paused)&select=id,name,status,settings,firm_id&order=name.asc`
    : `campaigns?status=in.(active,paused)&select=id,name,status,settings,firm_id&order=name.asc`;
  const rows = (await sb(q).catch(() => [])) || [];
  takvimMergeCamps(rows);
  return rows;
}

async function takvimAgentCamps(firmId) {
  if (!firmId) return [];
  const rows = (await sb(`campaigns?select=id,name,status,settings,firm_id&status=eq.active&firm_id=eq.${firmId}&order=name.asc`).catch(() => [])) || [];
  takvimMergeCamps(rows);
  const uid = currentUser?.id;
  return rows.filter((c) => typeof mbUserSeesCampaign !== 'function' || mbUserSeesCampaign(c, uid));
}

function takvimCampLabel(c) {
  const name = String(c?.name || '');
  if (c?.status === 'paused') {
    const tag = typeof t === 'function' ? t('cal.paused') : 'duraklatıldı';
    return `${name} (${tag})`;
  }
  return name;
}

function takvimFillCampSelect(sel, camps, selectedId) {
  if (!sel) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
  const list = Array.isArray(camps) ? camps : [];
  sel.innerHTML = `<option value="">Kampanya seç...</option>${list.map((c) => `<option value="${esc(c.id)}">${esc(takvimCampLabel(c))}</option>`).join('')}`;
  if (selectedId && [...sel.options].some((o) => o.value === String(selectedId))) sel.value = selectedId;
  else if (list.length === 1) sel.value = list[0].id;
}

/** Süper admin takvim sayfasında firma değişince kampanya listesini yenile (tarih sıfırlanmaz) */
async function takvimPageFirmChanged() {
  const isAdmin = mbIsFirmAdmin();
  if (!isAdmin) return;
  const fid = getActiveFirmId();
  const camps = await takvimCampChoices(fid);
  const sel = document.getElementById('takvim-camp-select');
  const prev = takvimCampId;
  takvimFillCampSelect(sel, camps, prev);
  if (sel && prev && [...sel.options].some((o) => o.value === String(prev))) takvimCampId = prev;
  else if (camps.length === 1) takvimCampId = camps[0].id;
  else takvimCampId = sel?.value || null;
  takvimSlots = [];
  takvimAppts = [];
  renderTakvimGrid();
  if (takvimCampId) await loadTakvimSlots();
}

async function loadTakvimPage() {
  if (typeof takvimArmDialerPlz === 'function') takvimArmDialerPlz();
  takvimClearMovePickMode();
  const isAdmin = mbIsFirmAdmin();
  const ovOpen = document.getElementById('takvim-popup-overlay')?.classList.contains('open');
  if (!ovOpen) {
    delete window._takvimFailedSecId;
    delete window._takvimFailedGridId;
  }
  const tools = document.getElementById('takvim-admin-tools');
  const campWrap = document.getElementById('takvim-camp-select-wrap');
  const pageCampLbl = document.getElementById('takvim-camp-label');
  const firmHost = document.getElementById('takvim-page-firm-selector');
  if (tools) tools.style.display = isAdmin ? 'flex' : 'none';
  if (campWrap) campWrap.style.display = isAdmin ? '' : 'none';
  if (pageCampLbl) pageCampLbl.style.display = isAdmin ? 'none' : '';
  if (firmHost) {
    if (mbIsSuperAdmin() && typeof renderFirmSelector === 'function') {
      firmHost.style.display = '';
      renderFirmSelector('takvim-page-firm-selector', takvimPageFirmChanged);
    } else {
      firmHost.style.display = 'none';
      firmHost.innerHTML = '';
    }
  }
  if (isAdmin) {
    const fid = getActiveFirmId();
    const camps = await takvimCampChoices(fid);
    const sel = document.getElementById('takvim-camp-select');
    takvimFillCampSelect(sel, camps, takvimCampId);
    if (sel?.value) takvimCampId = sel.value;
    else if (!camps.some((c) => c.id === takvimCampId)) takvimCampId = null;
  } else {
    const firmId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
    const agentCamps = await takvimAgentCamps(firmId);
    const lbl = document.getElementById('takvim-camp-label');
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
    if (!takvimCampId || !agentCamps.some((c) => c.id === takvimCampId)) {
      takvimCampId = agentCamps[0]?.id || null;
    }
    if (lbl) {
      lbl.style.display = '';
      if (agentCamps.length > 1) {
        lbl.innerHTML = `<select class="form-input" id="takvim-camp-select-agent" style="font-size:12px;padding:5px 10px;max-width:220px;" onchange="onTakvimCampChange(this.value)">${agentCamps.map((c) => `<option value="${esc(c.id)}"${c.id === takvimCampId ? ' selected' : ''}>${esc(c.name || '')}</option>`).join('')}</select>`;
      } else {
        lbl.textContent = agentCamps[0]?.name || 'Kampanya seçin';
      }
    }
  }
  takvimDate = takvimBerlinDate();
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
  if (!isAdmin) {
    if (!window._campNotifTimer) window._campNotifTimer = setInterval(checkActiveCampaignNotif, 30000);
    checkActiveCampaignNotif();
  }
}

function onTakvimCampChange(campId) {
  takvimClearMovePickMode();
  takvimCampId = campId;
  // Hem ana sayfa select'ini hem overlay select'ini güncelle
  ['takvim-camp-select','takvim-camp-select-ov','takvim-camp-select-agent','takvim-camp-select-agent-ov'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && [...sel.options].some((o) => o.value === String(campId))) sel.value = campId;
  });
  const lbl = document.getElementById('takvim-camp-label');
  const selRef = document.getElementById('takvim-camp-select') || document.getElementById('takvim-camp-select-ov');
  if (lbl && selRef && !document.getElementById('takvim-camp-select-agent')) lbl.textContent = selRef.options[selRef.selectedIndex]?.text||campId;
  if (campId) loadTakvimSlots();
}

/** Ana sayfa + popup overlay Gün/Hafta/Ay butonlarını mevcut takvimView ile eşitler */
function syncTakvimViewButtonStyles() {
  const v = takvimView || 'week';
  ['day', 'week', 'month'].forEach((x) => {
    const b = document.getElementById(`tv-${x}-btn`);
    if (b) {
      b.style.background = x === v ? 'var(--text)' : 'transparent';
      b.style.color = x === v ? 'var(--bg-2)' : 'var(--text-2)';
    }
    const bo = document.getElementById(`tvo-${x}`);
    if (bo) {
      bo.style.background = x === v ? 'var(--text)' : 'transparent';
      bo.style.color = x === v ? 'var(--bg-2)' : 'var(--text-2)';
    }
  });
}

function setTakvimView(v) {
  takvimClearMovePickMode();
  takvimView = v;
  syncTakvimViewButtonStyles();
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimPrev() {
  takvimClearMovePickMode();
  if (takvimView==='day') takvimDate.setDate(takvimDate.getDate()-1);
  else if (takvimView==='week') takvimDate.setDate(takvimDate.getDate()-7);
  else takvimDate.setMonth(takvimDate.getMonth()-1);
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimNext() {
  takvimClearMovePickMode();
  if (takvimView==='day') takvimDate.setDate(takvimDate.getDate()+1);
  else if (takvimView==='week') takvimDate.setDate(takvimDate.getDate()+7);
  else takvimDate.setMonth(takvimDate.getMonth()+1);
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimGoToday() {
  takvimClearMovePickMode();
  takvimDate = takvimBerlinDate();
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

async function loadTakvimSlots() {
  if (!takvimCampId) return;
  let startD, endD;
  if (takvimView==='day') {
    startD = endD = takvimFmtD(takvimDate);
  } else if (takvimView==='week') {
    const mon = takvimGetMonday(takvimDate);
    const tset = getCampaignTakvimSettings();
    const needSat = tset.active_days.includes('cmt');
    const needSun = tset.active_days.includes('paz');
    const extra = needSun ? 6 : needSat ? 5 : 4;
    const last = new Date(mon);
    last.setDate(last.getDate() + extra);
    startD = takvimFmtD(mon);
    endD = takvimFmtD(last);
  } else {
    const y = takvimDate.getFullYear(), m = takvimDate.getMonth();
    startD = `${y}-${String(m+1).padStart(2,'0')}-01`;
    endD = `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`;
  }
  try {
    const campRow = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.find((x) => x.id === takvimCampId) : null;
    const firmId = campRow?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
    await ensureFirmTakvimDefaultsLoaded(firmId);
    if (firmId) await loadFirmAppointmentResults(firmId, false).catch(() => {});
    const slots = await sb(`takvim_slots?campaign_id=eq.${takvimCampId}&tarih=gte.${startD}&tarih=lte.${endD}&order=tarih.asc,baslangic_saat.asc`);
    takvimSlots = slots||[];
    const ids = takvimSlots.filter(s=>s.appointment_id).map(s=>s.appointment_id);
    takvimAppts = ids.length ? await sb(`appointments?id=in.(${ids.join(',')})`) || [] : [];
    await takvimLoadCustomerNames(takvimAppts);
    const agentIds = [...new Set(takvimAppts.map((a) => a.agent_id).filter(Boolean))];
    window._takvimAgentNameById = window._takvimAgentNameById || {};
    if (agentIds.length) {
      try {
        const urows = await sb(`users?id=in.(${agentIds.join(',')})&select=id,name`);
        (urows || []).forEach((u) => {
          if (u?.id) window._takvimAgentNameById[u.id] = u.name;
        });
      } catch (_) {}
    }
    takvimClosedDays = {};
    takvimSlots.filter(s=>s.gun_kapali).forEach(s=>{ takvimClosedDays[s.tarih]=true; });
    renderTakvimGrid();
    renderTakvimFailed();
    requestAnimationFrame(() => {
      takvimApplyWeekRowHeights();
      requestAnimationFrame(takvimApplyWeekRowHeights);
    });
    if (typeof takvimContinuePlzMeasure === 'function') takvimContinuePlzMeasure();
  } catch(e) { toast('Takvim hatası: '+e.message,'err'); }
}

function takvimApplyWeekRowHeights() {
  if (takvimView === 'month') return;
  ['takvim-grid', 'takvim-grid-ov'].forEach((gid) => {
    const grid = document.getElementById(gid);
    const inner = grid?.querySelector('.takvim-week-grid-inner');
    if (!inner) return;
    const numHrs = parseInt(inner.dataset.takvimHrs || '0', 10);
    if (!numHrs) return;
    const header = parseInt(inner.dataset.takvimHdr || '40', 10);
    inner.style.height = '100%';
    inner.style.minHeight = '0';
    inner.style.gridTemplateRows = `${header}px repeat(${numHrs}, minmax(0, 1fr))`;
  });
}

function _ensureTakvimWeekResizeListener() {
  if (window._takvimWeekResizeBound) return;
  window._takvimWeekResizeBound = true;
  window.addEventListener('resize', () => {
    if (takvimView === 'month') return;
    const pg = document.getElementById('page-takvim');
    const ov = document.getElementById('takvim-popup-overlay');
    if (!pg?.classList.contains('active') && !ov?.classList.contains('open')) return;
    clearTimeout(window._takvimWeekResizeTimer);
    window._takvimWeekResizeTimer = setTimeout(takvimApplyWeekRowHeights, 120);
  });
}

function takvimGridEl() {
  return document.getElementById(window._takvimGridId || 'takvim-grid');
}

function takvimGridToken() {
  return String(window._takvimGridId || 'takvim-grid').replace(/[^a-z0-9_-]/gi, '');
}

/** Saat hücresi yalnızca açık olan ızgarada aranır. İki takvim aynı id'yi taşıyınca getElementById ilkini (gizli sayfa) döndürür. */
function takvimHourCell(dateStr, hour) {
  const grid = takvimGridEl();
  if (!grid || !dateStr) return null;
  const hh = String(hour == null ? '' : hour).padStart(2, '0');
  return grid.querySelector(`[data-tk-date="${dateStr}"][data-tk-hour="${hh}"]`);
}

function takvimMonthSlotHost(dateStr) {
  const grid = takvimGridEl();
  if (!grid || !dateStr) return null;
  return grid.querySelector(`[data-tk-month-slots="${dateStr}"]`);
}

function takvimHourCells() {
  const grid = takvimGridEl();
  return grid ? grid.querySelectorAll('[data-tk-hour]') : [];
}

function takvimSlotIsPainted(tarih, bas) {
  if (takvimView === 'month') return !!takvimMonthSlotHost(tarih);
  const hour = String(bas || '09:00').split(':')[0];
  return !!takvimHourCell(tarih, hour);
}

/** Kayıt görünür aralığın dışındaysa o güne kaydır; hafta sonu kapalıysa gün görünümüne geç. */
async function takvimShowCreatedSlot(tarih, bas) {
  if (takvimSlotIsPainted(tarih, bas)) return true;
  const d = new Date(`${tarih}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  takvimDate = d;
  takvimDate.setHours(0, 0, 0, 0);
  const tset = getCampaignTakvimSettings();
  const hour = parseInt(String(bas || '09:00').split(':')[0], 10);
  const hourOk = Number.isFinite(hour) && hour >= tset.startH && hour <= tset.endH;
  const dayOk = tset.active_days.includes(takvimDayKeyFromDate(d));
  if (hourOk && !dayOk && takvimView !== 'day') {
    takvimView = 'day';
    syncTakvimViewButtonStyles();
  }
  await loadTakvimSlots();
  return takvimSlotIsPainted(tarih, bas);
}

function renderTakvimGrid() {
  const grid = takvimGridEl();
  if (!grid) return;
  if (takvimView==='month') { renderTakvimMonthGrid(grid); return; }
  const isDay = takvimView==='day';
  const tset = getCampaignTakvimSettings();
  const activeSet = new Set(tset.active_days);
  const startDt = isDay ? new Date(takvimDate) : takvimGetMonday(takvimDate);
  if (isDay) startDt.setHours(0, 0, 0, 0);
  const needSat = activeSet.has('cmt');
  const needSun = activeSet.has('paz');
  const daysCount = isDay ? 1 : needSun ? 7 : needSat ? 6 : 5;
  const endDt = new Date(startDt);
  endDt.setDate(endDt.getDate() + (daysCount - 1));
  const lbl = document.getElementById(window._takvimWeekLabelId||'takvim-week-label');
  if (lbl) {
    if (isDay) lbl.textContent = `${takvimWeekdayName(startDt, 'long')} ${takvimCivilStamp(startDt)}`;
    else lbl.textContent = `${takvimCivilStamp(startDt)} – ${takvimCivilStamp(endDt)}`;
  }
  const shH = tset.startH;
  const endH = tset.endH;
  const numHrs = Math.max(1, endH - shH + 1);
  const isAdmin = mbIsFirmAdmin();
  const headerRowPx = 40;
  let h = `<div class="takvim-week-grid-inner" data-takvim-hrs="${numHrs}" data-takvim-hdr="${headerRowPx}" style="display:grid;width:100%;height:100%;min-height:0;box-sizing:border-box;grid-template-columns:56px repeat(${daysCount},minmax(0,1fr));grid-template-rows:${headerRowPx}px repeat(${numHrs},minmax(0,1fr));">`;
  h += '<div class="tk-gutter tk-gutter--corner"></div>';
  for (let d=0; d<daysCount; d++) {
    const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
    const ds = takvimFmtD(dt);
    const isToday = takvimIsBerlinToday(dt);
    const isClosed = takvimClosedDays[ds];
    const click = isAdmin ? `onclick="takvimHeaderClick('${ds}')"` : '';
    const wdShort = takvimWeekdayName(dt, 'short');
    const cls = `tk-head${isToday ? ' tk-head--today' : ''}${isClosed ? ' tk-head--closed' : ''}${isAdmin ? ' tk-head--click' : ''}`;
    h += `<div class="${cls}" ${click}><span class="tk-head-wd">${wdShort}</span><span class="tk-head-d">${dt.getDate()}</span></div>`;
  }
  for (let hr = shH; hr <= endH; hr++) {
    const hh = String(hr).padStart(2,'0');
    h += `<div class="tk-hour">${hh}:00</div>`;
    for (let d=0; d<daysCount; d++) {
      const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
      const ds = takvimFmtD(dt);
      const isClosed = takvimClosedDays[ds];
      const isToday = takvimIsBerlinToday(dt);
      const dayKey = takvimDayKeyFromDate(dt);
      const colActive = activeSet.has(dayKey);
      const canClick = isAdmin && !isClosed && colActive;
      const click = canClick ? `onclick="takvimCellClick('${ds}','${hh}',event)"` : '';
      const cls = `tk-cell${isClosed ? ' tk-cell--closed' : ''}${!colActive && !isClosed ? ' tk-cell--off' : ''}${isToday ? ' tk-cell--today' : ''}${canClick ? ' tk-cell--click' : ''}`;
      h += `<div id="tc_${takvimGridToken()}_${ds}_${hh}" data-tk-date="${ds}" data-tk-hour="${hh}" class="${cls}" ${click}></div>`;
    }
  }
  h += '</div>'; grid.innerHTML = h;
  renderTakvimSlots();
  renderTakvimFilterBar();
  _ensureTakvimWeekResizeListener();
  requestAnimationFrame(() => {
    takvimApplyWeekRowHeights();
    requestAnimationFrame(takvimApplyWeekRowHeights);
  });
}

function renderTakvimMonthGrid(grid) {
  const y=takvimDate.getFullYear(), m=takvimDate.getMonth(), locale=typeof mbLocale === 'function' ? mbLocale() : (currentLang==='de'?'de-DE':'tr-TR');
  const tset = getCampaignTakvimSettings();
  const showWeekend = tset.active_days.includes('cmt') || tset.active_days.includes('paz');
  const dNamesStr = typeof t === 'function' ? t(showWeekend ? 'cal.dow_short_full' : 'cal.dow_short_week') : '';
  const dNames = dNamesStr ? dNamesStr.split(',') : (showWeekend
    ? (currentLang==='de' ? ['Mo','Di','Mi','Do','Fr','Sa','So'] : ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'])
    : (currentLang==='de' ? ['Mo','Di','Mi','Do','Fr'] : ['Pzt','Sal','Çar','Per','Cum']));
  const cols = showWeekend ? 7 : 5;
  let h = `<div class="tk-month-grid" style="display:grid;grid-template-columns:repeat(${cols},1fr);">`;
  dNames.forEach(d => h += `<div class="tk-month-head">${d}</div>`);
  const first = new Date(y, m, 1);
  let cur = takvimGetMonday(first);
  const last = new Date(y, m + 1, 0);
  let end = new Date(last);
  const edLast = end.getDay() || 7;
  end.setDate(end.getDate() + (7 - edLast));
  while (cur <= end) {
    const wd = cur.getDay();
    if (showWeekend || (wd !== 0 && wd !== 6)) {
      const ds = takvimFmtD(cur);
      const other = cur.getMonth() !== m;
      const today = takvimIsBerlinToday(cur);
      h += `<div id="mc_${takvimGridToken()}_${ds}" data-tk-month="${ds}" class="tk-month${other ? ' tk-month--other' : ''}${today ? ' tk-month--today' : ''}"><div class="tk-month-d">${cur.getDate()}</div><div data-tk-month-slots="${ds}" class="tk-month-slots"></div></div>`;
    }
    cur.setDate(cur.getDate() + 1);
  }
  h += '</div>'; grid.innerHTML = h;
  renderTakvimSlots();
  renderTakvimFilterBar();
}

function renderTakvimSlots() {
  if (takvimView === 'month') {
    renderTakvimSlotsMonth();
    return;
  }
  const isAdmin = mbIsFirmAdmin();
  const visible = takvimSlots.filter((s) => takvimSlotListed(s) && takvimSlotPasses(s, takvimApptOf(s)));
  const byDate = {};
  visible.forEach((s) => {
    const d = s.tarih;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });
  Object.keys(byDate).forEach((dateStr) => {
    const daySlots = byDate[dateStr].slice().sort((a, b) => takvimTimeToMinutes(a.baslangic_saat) - takvimTimeToMinutes(b.baslangic_saat));
    const ranges = daySlots.map((sl) => {
      const shRaw = sl.baslangic_saat || '09:00';
      const ehRaw = sl.bitis_saat || takvimAddHours(shRaw.slice(0, 5), takvimSlotDurHours());
      return { sl, s: takvimTimeToMinutes(shRaw), e: takvimTimeToMinutes(ehRaw) };
    });
    const n = ranges.length;
    const parent = ranges.map((_, i) => i);
    function find(i) {
      return parent[i] === i ? i : (parent[i] = find(parent[i]));
    }
    function union(i, j) {
      parent[find(i)] = find(j);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (ranges[i].s < ranges[j].e && ranges[j].s < ranges[i].e) union(i, j);
      }
    }
    const groupMap = {};
    ranges.forEach((r, i) => {
      const root = find(i);
      if (!groupMap[root]) groupMap[root] = [];
      groupMap[root].push(r);
    });
    Object.values(groupMap).forEach((group) => {
      const count = group.length;
      const colEnd = new Array(count).fill(0);
      group.sort((a, b) => a.s - b.s);
      let maxCol = 0;
      group.forEach((r) => {
        let col = 0;
        for (let c = 0; c < count; c++) {
          if (colEnd[c] <= r.s) {
            col = c;
            break;
          }
        }
        colEnd[col] = r.e;
        r.col = col;
        if (col > maxCol) maxCol = col;
      });
      const numCols = maxCol + 1;
      group.forEach((r) => {
        let colspan = 1;
        for (let c = r.col + 1; c < numCols; c++) {
          const blocked = group.some((other) => other.col === c && other.s < r.e && other.e > r.s);
          if (!blocked) colspan++;
          else break;
        }
        const sl = r.sl;
        const appt = takvimAppts.find((a) => a.id === sl.appointment_id);
        const hour = String(sl.baslangic_saat || '09:00').split(':')[0].padStart(2, '0');
        const cell = takvimHourCell(dateStr, hour);
        if (!cell) return;
        const el = makeTakvimSlotEl(sl, appt, isAdmin, numCols);
        const [sh, sm] = sl.baslangic_saat.split(':').map(Number);
        const ehStr = sl.bitis_saat || takvimAddHours(`${String(sh).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}`, takvimSlotDurHours());
        const [eh, em] = ehStr.split(':').map(Number);
        const durHours = eh + em / 60 - (sh + (sm || 0) / 60);
        const topPct = ((sm || 0) / 60) * 100;
        const hPct = durHours * 100;
        const hExtra = Math.max(0, durHours - 1);
        el.style.cssText += `;position:absolute;top:calc(${topPct}%);height:calc(${hPct}% + ${hExtra}px);left:calc(${(100 / numCols) * r.col}% + 2px);width:calc(${(100 / numCols) * colspan}% - 4px);z-index:10;box-sizing:border-box;`;
        cell.appendChild(el);
      });
    });
  });
  setTimeout(setupDropZones, 50);
}

function renderTakvimSlotsMonth() {
  const isAdmin = mbIsFirmAdmin();
  takvimSlots.filter((s) => takvimSlotListed(s) && takvimSlotPasses(s, takvimApptOf(s))).forEach(s=>{
    const el = takvimMonthSlotHost(s.tarih);
    if (!el) return;
    const appt = takvimAppts.find(a=>a.id===s.appointment_id);
    const div = document.createElement('div');
    const vis = getSlotGradientAndText(s, appt);
    div.style.cssText = `font-size:9px;padding:2px 4px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-weight:700;background:${vis.background};color:${vis.color};`;
    if (appt) {
      const show = isAdmin || appt.agent_id === currentUser?.id;
      const nm = show ? _takvimApptCardName(appt) : '***';
      const badge = takvimPlzBadge(appt);
      div.textContent = `${s.baslangic_saat.slice(0, 5)} ${nm}`;
      if (badge) {
        div.style.position = 'relative';
        div.insertAdjacentHTML('afterbegin', badge);
      }
    } else {
      div.textContent = `${s.baslangic_saat.slice(0, 5)} Boş`;
    }
    div.onclick = () => openTakvimSlotDetail(s, appt);
    div.oncontextmenu = (e) => { e.preventDefault(); takvimHideTip(); showSlotContextMenu(e, s, appt); };
    if (appt && (isAdmin || appt.agent_id === currentUser?.id)) {
      div.addEventListener('mouseenter', () => {
        clearTimeout(window._takvimTipTimer);
        window._takvimTipTimer = setTimeout(() => takvimShowTip(div, appt), 280);
      });
      div.addEventListener('mouseleave', () => takvimHideTip());
    }
    el.appendChild(div);
  });
}

function takvimSlotMoveMarkup(slotId, reserveBottom = false) {
  const bottomPx = reserveBottom ? 30 : 2;
  return `<div class="tak-slot-move" onmousedown="event.stopPropagation()" style="position:absolute;left:2px;bottom:${bottomPx}px;width:28px;z-index:22;display:flex;flex-direction:column;gap:2px;align-items:stretch;justify-content:flex-end;box-sizing:border-box;">
<button type="button" class="btn-tak-shift" title="-30 dk" onclick="event.stopPropagation();nudgeTakvimSlot('${slotId}',-30)">▲</button>
<button type="button" class="btn-tak-shift" title="+30 dk" onclick="event.stopPropagation();nudgeTakvimSlot('${slotId}',30)">▼</button>
</div>`;
}

function takvimSlotQuickAddMarkup(slotId) {
  return `<button type="button" class="btn-tak-slot-add" title="Aynı başlangıç saatinde yeni boş slot ekle" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();addAdjacentEmptySlot('${slotId}')"><i class="ph ph-plus" style="font-size:13px;font-weight:800;"></i></button>`;
}

function _takvimApptCardName(appt) {
  const v = String(appt?.vorname || '').trim();
  const n = String(appt?.nachname || '').trim();
  if (v && n) return `${v} ${n}`;
  return n || v || '—';
}

function _takvimApptCardAddr(appt) {
  const parts = [String(appt?.strasse || '').trim(), String(appt?.ortschaft || '').trim()].filter(Boolean);
  const tail = parts.length ? parts.join(', ') : '—';
  return `${appt?.plz || '—'} – ${tail}`;
}

function takvimSlotCustomerMarkup(appt) {
  const name = String(window._takvimCustomerNameById?.[appt?.customer_id] || '').trim();
  if (!name) return '';
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  return `<div class="tak-slot-cust" title="${esc(name)}">${esc(name)}</div>`;
}

function takvimSlotCallMarkup(appt) {
  const id = String(appt?.contact_id || '').trim();
  if (!id || (typeof isValidUUID === 'function' && !isValidUUID(id))) return '';
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  return `<div class="tak-slot-dist" onmousedown="event.stopPropagation()" style="position:absolute;bottom:2px;right:2px;z-index:22;">
<button type="button" class="btn-tak-dist" title="Ara" onclick="event.stopPropagation();openDialerForContact('${esc(id)}')"><i class="ph ph-phone" style="font-size:12px;"></i></button>
</div>`;
}

function makeTakvimSlotEl(slot, appt, isAdmin, colCount) {
  const el = document.createElement('div');
  el.classList.add('takvim-slot-el');
  const dense = colCount && colCount > 2;
  if (dense) el.classList.add('takvim-slot-many');
  el.dataset.slotId = slot.id;
  const vis = getSlotGradientAndText(slot, appt);
  const fzBase = dense ? 10 : 12;
  const fzSm = dense ? 9 : 11;
  const canShift = isAdmin && slot.durum !== 'kilitli' && !slot.gun_kapali;
  const canQuickAdd = canShift;
  const pr = 30;
  const pl = dense ? 4 : 6;
  const pt = dense ? 4 : 6;
  const custChip = slot.durum === 'dolu' && appt && (isAdmin || appt.agent_id === currentUser?.id) ? takvimSlotCustomerMarkup(appt) : '';
  const callBtn = slot.durum === 'dolu' && appt && (isAdmin || appt.agent_id === currentUser?.id) ? takvimSlotCallMarkup(appt) : '';
  const pb =
    custChip ? 18 : canShift ? 6 : dense ? 4 : 6;
  el.style.cssText = `border-radius:4px;padding:${pt}px ${pr}px ${pb}px ${pl}px;font-size:${fzBase}px;cursor:pointer;overflow:hidden;box-shadow:none;background:${vis.background};color:${vis.color};text-align:left;`;
  if (slot.durum==='bos') {
    el.innerHTML = `${canShift ? takvimSlotMoveMarkup(slot.id, false) : ''}<div style="font-weight:700;opacity:.95;font-size:${fzSm}px;text-align:left;">Boş ${slot.baslangic_saat.slice(0,5)}</div>${canQuickAdd ? `<div class="tak-slot-add-wrap" onmousedown="event.stopPropagation()">${takvimSlotQuickAddMarkup(slot.id)}</div>` : ''}`;
    el.onclick = async (ev) => {
      ev.stopPropagation();
      const pick = window._takvimMovePick;
      if (
        pick &&
        String(slot.campaign_id || '') === String(pick.campaignId || '') &&
        slot.id !== pick.fromSlotId &&
        slot.durum === 'bos' &&
        !slot.gun_kapali &&
        !slot.alta_tasindi
      ) {
        if (!(await mbConfirm('Randevuyu bu slota taşımak istiyor musunuz?', 'Randevuyu taşı'))) return;
        const ok = await takvimExecuteMoveAppointment(pick.fromSlotId, slot.id, pick.apptId);
        if (!ok) return;
        takvimClearMovePickMode();
        await loadTakvimSlots();
        toast('Randevu taşındı ✓', 'ok');
        return;
      }
      if (isAdmin) openTakvimSlotDetail(slot, null);
      else lockAndBookSlot(slot);
    };
  } else if (slot.durum==='kilitli') {
    el.innerHTML = `<div style="font-weight:650;">Kilitli ${slot.baslangic_saat.slice(0,5)}</div>`;
    el.style.color = '#1e40af';
    el.onclick = (ev) => ev.stopPropagation();
  } else if (appt) {
    const show = isAdmin || appt.agent_id===currentUser?.id;
    const plzLine = takvimPlzBadge(appt);
    let distAllHtml = '';
    if (!plzLine && _takvimDistAllOriginId && _takvimDistAllOriginId !== slot.id && slot.durum === 'dolu') {
      const origin = takvimSlots.find((x) => x.id === _takvimDistAllOriginId);
      const oa = takvimAppts.find((a) => a.id === origin?.appointment_id);
      if (oa?.plz && appt?.plz) {
        const r = _takvimPlzRouteCache[`${oa.plz}_${appt.plz}`];
        if (r) distAllHtml = `<div class="tk-slot-meta">${r.km} km · ${r.min} dk</div>`;
      }
    }
    const tEnd = (slot.bitis_saat || takvimAddHours(slot.baslangic_saat.slice(0, 5), takvimSlotDurHours())).slice(0, 5);
    const timeLn = `${slot.baslangic_saat.slice(0, 5)}–${tEnd}`;
    const nm = show ? _takvimApptCardName(appt) : '***';
    const adr = show ? _takvimApptCardAddr(appt) : '***';
    const agRaw =
      show
        ? String(appt.agent_name || '').trim() ||
          String(window._takvimAgentNameById?.[appt.agent_id] || '').trim() ||
          ''
        : '';
    const ag = show ? agRaw || '—' : '—';
    const fzName = dense ? 10 : 13;
    const fzLine = dense ? 8 : 11;
    const fzMono = dense ? 8 : 10;
    const fzAg = dense ? 8 : 10;
    const nmWrap = dense ? 'tak-slot-card-name tak-slot-card-name--dense' : 'tak-slot-card-name';
    const addrWrap = dense ? 'tak-slot-card-addr tak-slot-card-addr--dense' : 'tak-slot-card-addr';
    el.innerHTML = `${plzLine}${canShift ? takvimSlotMoveMarkup(slot.id, true) : ''}<div class="takvim-slot-card" style="display:flex;flex-direction:column;gap:2px;line-height:1.2;max-width:100%;align-items:flex-start;text-align:left;">
<div class="${nmWrap}" style="font-weight:800;font-size:${fzName}px;">${nm}</div>
<div class="${addrWrap}" style="font-size:${fzLine}px;font-weight:600;opacity:.93;">${adr}</div>
<div style="font-size:${fzMono}px;opacity:.9;font-family:var(--mono);white-space:nowrap;">${timeLn}</div>
<div style="font-size:${fzAg}px;opacity:.84;word-break:break-word;">Agent: ${ag}</div></div>${distAllHtml}${custChip}${callBtn}${canQuickAdd ? `<div class="tak-slot-add-wrap" onmousedown="event.stopPropagation()">${takvimSlotQuickAddMarkup(slot.id)}</div>` : ''}`;
    el.onclick = (ev) => {
      ev.stopPropagation();
      openTakvimSlotDetail(slot, appt);
    };
  } else {
    el.innerHTML = `${canShift ? takvimSlotMoveMarkup(slot.id, false) : ''}<div style="font-size:${fzSm}px;font-weight:700;text-align:left;">${slot.baslangic_saat.slice(0,5)}</div>${canQuickAdd ? `<div class="tak-slot-add-wrap" onmousedown="event.stopPropagation()">${takvimSlotQuickAddMarkup(slot.id)}</div>` : ''}`;
    el.onclick = (ev) => {
      ev.stopPropagation();
      openTakvimSlotDetail(slot, null);
    };
  }
  el.oncontextmenu = (e) => { e.preventDefault(); if (typeof takvimHideTip === 'function') takvimHideTip(); showSlotContextMenu(e, slot, appt); };
  if (slot.durum === 'dolu' && appt && (isAdmin || appt.agent_id === currentUser?.id)) {
    el.addEventListener('mouseenter', () => {
      clearTimeout(window._takvimTipTimer);
      window._takvimTipTimer = setTimeout(() => takvimShowTip(el, appt), 280);
    });
    el.addEventListener('mouseleave', () => takvimHideTip());
  }
  if (slot.durum === 'bos' || (slot.durum === 'dolu' && appt)) initSlotDrag(el, slot, appt);
  return el;
}

let _takvimStatusOn = new Set();
let _takvimStatusSeen = new Set();
let _takvimCustomerOn = new Set();
let _takvimCustomerSeen = new Set();
let _takvimFiltersReady = false;
let _takvimSearch = '';
let _takvimChipTimer = 0;

function takvimSlotListed(slot) {
  return !!(slot && !slot.gun_kapali && !slot.alta_tasindi);
}

function takvimApptOf(slot) {
  if (!slot?.appointment_id) return null;
  return (takvimAppts || []).find((a) => a.id === slot.appointment_id) || null;
}

function takvimSlotStatusKey(slot, appt) {
  if (slot?.durum === 'bos') return 'bos';
  if (slot?.durum === 'kilitli') return 'kilitli';
  if (appt) return (typeof _normResultKey === 'function' ? _normResultKey(appt.durum) : String(appt.durum || '')) || 'dolu';
  return 'dolu';
}

function takvimSlotCustomerKey(appt) {
  return String(appt?.customer_id || '') || '__none__';
}

function takvimResultRows() {
  const camp = typeof campaigns !== 'undefined' && Array.isArray(campaigns) ? campaigns.find((c) => c.id === takvimCampId) : null;
  const fid = camp?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  const rows = (fid && window._apptResultsByFirm?.[fid]) || (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  return Array.isArray(rows) ? rows : [];
}

function takvimStatusMeta(key) {
  const say = typeof t === 'function' ? t : (k) => k;
  if (key === 'bos') return { label: say('cal.filter.empty'), color: getCampaignTakvimSettings().bos_color || '#3b82f6' };
  if (key === 'kilitli') return { label: say('cal.filter.locked'), color: '#1d4ed8' };
  const cfg = takvimResultRows().find((r) => (typeof _normResultKey === 'function' ? _normResultKey(r.key) : r.key) === key);
  if (cfg) {
    const label = typeof mbResultLabel === 'function' ? mbResultLabel(cfg.key, cfg.label) : (cfg.label || key);
    return { label, color: cfg.color || '#64748b' };
  }
  return { label: key, color: '#64748b' };
}

function takvimCustomerChipLabel(key) {
  if (key === '__none__') return typeof t === 'function' ? t('cal.filter.nocust') : 'Müşterisiz';
  return window._takvimCustomerNameById?.[key] || 'Müşteri';
}

async function takvimLoadCustomerNames(appts) {
  window._takvimCustomerNameById = window._takvimCustomerNameById || {};
  const ids = [...new Set((appts || []).map((a) => a.customer_id).filter(Boolean))].filter((id) => !window._takvimCustomerNameById[id]);
  if (!ids.length) return;
  const rows = await sb(`customers?id=in.(${ids.join(',')})&select=id,name,code`).catch(() => []);
  (rows || []).forEach((c) => {
    if (!c?.id) return;
    const name = String(c.name || '').trim();
    window._takvimCustomerNameById[c.id] = c.code ? `${c.code} · ${name}` : (name || 'Müşteri');
  });
}

function takvimOrderedStatusKeys(statusCount) {
  const keys = [];
  ['bos', 'kilitli'].forEach((k) => { if (statusCount[k]) keys.push(k); });
  takvimResultRows().forEach((r) => {
    const k = typeof _normResultKey === 'function' ? _normResultKey(r.key) : String(r.key || '');
    if (k && statusCount[k] && !keys.includes(k)) keys.push(k);
  });
  Object.keys(statusCount).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  return keys;
}

function takvimSyncFilters(statusKeys, customerKeys) {
  if (!_takvimFiltersReady && (statusKeys.length || customerKeys.length)) _takvimFiltersReady = true;
  statusKeys.forEach((k) => {
    if (!_takvimStatusSeen.has(k)) {
      _takvimStatusSeen.add(k);
      _takvimStatusOn.add(k);
    }
  });
  customerKeys.forEach((k) => {
    if (!_takvimCustomerSeen.has(k)) {
      _takvimCustomerSeen.add(k);
      _takvimCustomerOn.add(k);
    }
  });
}

function takvimSlotPasses(slot, appt) {
  const sk = takvimSlotStatusKey(slot, appt);
  if (_takvimStatusSeen.has(sk) && !_takvimStatusOn.has(sk)) return false;
  if (appt) {
    const ck = takvimSlotCustomerKey(appt);
    if (_takvimCustomerSeen.has(ck) && !_takvimCustomerOn.has(ck)) return false;
  } else if (_takvimCustomerSeen.size > 1 && _takvimCustomerOn.size === 1) {
    return false;
  }
  const q = String(_takvimSearch || '').trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  if (!appt) return false;
  const show = mbIsFirmAdmin() || appt.agent_id === currentUser?.id;
  if (!show) return false;
  const blob = [appt.nachname, appt.vorname, appt.telefonnummer, appt.telefon2, appt.plz, appt.ortschaft, appt.strasse]
    .join(' ')
    .toLocaleLowerCase('tr-TR');
  if (blob.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3) {
    const phones = `${appt.telefonnummer || ''}${appt.telefon2 || ''}`.replace(/\D/g, '');
    if (phones.includes(digits)) return true;
  }
  return false;
}

function takvimFilterCatalog() {
  const statusCount = {};
  const customerCount = {};
  takvimListedSlots().forEach((slot) => {
    const appt = takvimApptOf(slot);
    const sk = takvimSlotStatusKey(slot, appt);
    statusCount[sk] = (statusCount[sk] || 0) + 1;
    if (appt) {
      const ck = takvimSlotCustomerKey(appt);
      customerCount[ck] = (customerCount[ck] || 0) + 1;
    }
  });
  return { statusCount, customerCount };
}

function takvimListedSlots() {
  return (takvimSlots || []).filter(takvimSlotListed);
}

function takvimRepaintSlots() {
  takvimHideTip();
  const grid = takvimGridEl();
  if (grid) {
    grid.querySelectorAll('.takvim-slot-el').forEach((el) => el.remove());
    grid.querySelectorAll('[data-tk-month-slots]').forEach((el) => { el.innerHTML = ''; });
    renderTakvimSlots();
  }
  renderTakvimFilterBar();
}

function takvimFilterShowAll() {
  clearTimeout(_takvimChipTimer);
  _takvimStatusSeen.forEach((k) => _takvimStatusOn.add(k));
  _takvimCustomerSeen.forEach((k) => _takvimCustomerOn.add(k));
  takvimRepaintSlots();
}

function takvimChipAct(kind, key, mode) {
  clearTimeout(_takvimChipTimer);
  const set = kind === 'status' ? _takvimStatusOn : _takvimCustomerOn;
  if (mode === 'dbl') {
    set.clear();
    set.add(key);
    takvimRepaintSlots();
    return;
  }
  _takvimChipTimer = setTimeout(() => {
    if (set.has(key)) set.delete(key);
    else set.add(key);
    takvimRepaintSlots();
  }, 220);
}

function takvimPaintChipRow(host, kind, keys, counts) {
  if (!host) return;
  host.replaceChildren();
  if (!keys.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const say = typeof t === 'function' ? t : (k) => k;
  if (kind === 'status') {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'takvim-chip takvim-chip-all';
    all.textContent = say('cal.filter.all');
    all.addEventListener('click', () => takvimFilterShowAll());
    host.appendChild(all);
  }
  const onSet = kind === 'status' ? _takvimStatusOn : _takvimCustomerOn;
  keys.forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'takvim-chip' + (onSet.has(key) ? '' : ' is-off');
    btn.title = say('cal.filter.hint');
    if (kind === 'status') {
      const meta = takvimStatusMeta(key);
      const dot = document.createElement('span');
      dot.className = 'takvim-chip-dot';
      dot.style.background = meta.color;
      const label = document.createElement('span');
      label.textContent = `${meta.label} (${counts[key] || 0})`;
      btn.append(dot, label);
    } else {
      btn.textContent = `${takvimCustomerChipLabel(key)} (${counts[key] || 0})`;
    }
    btn.addEventListener('click', () => takvimChipAct(kind, key, 'click'));
    btn.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      takvimChipAct(kind, key, 'dbl');
    });
    host.appendChild(btn);
  });
}

function takvimPlzBadge(appt) {
  if (!_takvimMeasureFromPlz || !appt?.plz) return '';
  const digits = String(appt.plz).replace(/\D/g, '');
  const dest = digits.length === 4 ? `0${digits}` : digits.slice(0, 5);
  const row = _takvimMeasureCache[`${_takvimMeasureFromPlz}_${dest}`] || _takvimMeasureCache[`${_takvimMeasureFromPlz}_${appt.plz}`];
  if (!row) return '';
  const min = Number(row.min) || 0;
  const tone = min <= 30 ? 'is-ok' : min <= 45 ? 'is-warn' : 'is-bad';
  return `<div class="tk-plz-badge ${tone}">${row.km} km · ${row.min} dk</div>`;
}

function renderTakvimFilterBar() {
  const { statusCount, customerCount } = takvimFilterCatalog();
  const statusKeys = takvimOrderedStatusKeys(statusCount);
  const customerKeys = Object.keys(customerCount).sort((a, b) => takvimCustomerChipLabel(a).localeCompare(takvimCustomerChipLabel(b), 'tr'));
  takvimSyncFilters(statusKeys, customerKeys);
  takvimPaintChipRow(document.getElementById('takvim-status-chips'), 'status', statusKeys, statusCount);
  takvimPaintChipRow(document.getElementById('takvim-status-chips-ov'), 'status', statusKeys, statusCount);
  takvimPaintChipRow(document.getElementById('takvim-customer-chips'), 'customer', customerKeys, customerCount);
  takvimPaintChipRow(document.getElementById('takvim-customer-chips-ov'), 'customer', customerKeys, customerCount);
}

function takvimSetSearch(value) {
  _takvimSearch = String(value || '');
  ['takvim-search', 'takvim-search-ov'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && el.value !== _takvimSearch) el.value = _takvimSearch;
  });
  clearTimeout(window._takvimSearchTimer);
  window._takvimSearchTimer = setTimeout(takvimRepaintSlots, 80);
}

function takvimHideTip() {
  clearTimeout(window._takvimTipTimer);
  document.getElementById('takvim-tip')?.remove();
}

function takvimTipRow(label, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const row = document.createElement('div');
  row.className = 'takvim-tip-row';
  const k = document.createElement('span');
  k.textContent = label;
  const v = document.createElement('div');
  v.textContent = text;
  row.append(k, v);
  return row;
}

function takvimShowTip(anchor, appt) {
  if (!anchor || !appt) return;
  if (!(mbIsFirmAdmin() || appt.agent_id === currentUser?.id)) return;
  takvimHideTip();
  const say = typeof t === 'function' ? t : (k) => k;
  const tip = document.createElement('div');
  tip.id = 'takvim-tip';
  tip.className = 'takvim-tip';
  const title = document.createElement('b');
  title.textContent = _takvimApptCardName(appt);
  tip.appendChild(title);
  const phone = [appt.telefonnummer, appt.telefon2].map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
  [takvimTipRow(say('cal.tip.phone'), phone), takvimTipRow(say('cal.tip.address'), _takvimApptCardAddr(appt))].forEach((row) => {
    if (row) tip.appendChild(row);
  });
  const note = String(appt.agent_notu || '').trim();
  if (note) {
    const block = document.createElement('div');
    block.className = 'takvim-tip-note';
    block.textContent = note;
    tip.appendChild(block);
  }
  document.body.appendChild(tip);
  const rect = anchor.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;
  if (left + tip.offsetWidth > window.innerWidth - 8) left = window.innerWidth - tip.offsetWidth - 8;
  if (top + tip.offsetHeight > window.innerHeight - 8) top = rect.top - tip.offsetHeight - 8;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function _ensureTakvimTipScroll() {
  if (window._takvimTipScrollBound) return;
  window._takvimTipScrollBound = true;
  document.addEventListener('scroll', () => takvimHideTip(), true);
}
_ensureTakvimTipScroll();

function takvimCellClickNeedsConfirm() {
  if (localStorage.getItem('mb_takvim_skip_new_slot_confirm') === '1') return false;
  return getCampaignTakvimSettings().confirm_new_slot !== false;
}

async function createTakvimSlotDirect(tarih, bas, bit) {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return false; }
  if (!currentUser?.firm_id) { toast('Firma bilgisi eksik','err'); return false; }
  try {
    await sb('takvim_slots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        campaign_id: takvimCampId,
        firm_id: currentUser.firm_id,
        tarih,
        baslangic_saat: bas,
        bitis_saat: bit,
        durum: 'bos',
        gun_kapali: false
      })
    });
    await loadTakvimSlots();
    const seen = await takvimShowCreatedSlot(tarih, bas);
    toast(seen ? t('cal.slot.created') : t('cal.slot.hidden'), seen ? 'ok' : 'warn');
    return true;
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
    return false;
  }
}

/** Taşıma / tek adım akışları için yeni slot id döndürür (ara reload yok) */
async function createTakvimSlotAndReturnId(tarih, bas, bit) {
  if (!takvimCampId) {
    toast('Önce kampanya seçin', 'err');
    return null;
  }
  if (!currentUser?.firm_id) {
    toast('Firma bilgisi eksik', 'err');
    return null;
  }
  try {
    const rows = await sb('takvim_slots', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        campaign_id: takvimCampId,
        firm_id: currentUser.firm_id,
        tarih,
        baslangic_saat: bas,
        bitis_saat: bit,
        durum: 'bos',
        gun_kapali: false
      })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.id || null;
  } catch (e) {
    toast('Slot oluşturulamadı: ' + e.message, 'err');
    return null;
  }
}

async function takvimCellClickMovePick(ds, hh) {
  const pick = window._takvimMovePick;
  if (!pick || String(pick.campaignId || '') !== String(takvimCampId || '')) return;
  if (!mbIsFirmAdmin()) return;
  if (takvimClosedDays[ds]) {
    toast('Bu gün kapalı', 'warn');
    return;
  }
  const start = `${String(hh).padStart(2, '0')}:00`;
  const end = takvimAddHours(start, takvimSlotDurHours());
  if (
    !(await mbConfirm(
      `${ds} · ${start}–${String(end).slice(0, 5)} için yeni boş slot oluşturulup randevu buraya taşınsın mı?`,
      'Randevuyu taşı'
    ))
  )
    return;
  const newId = await createTakvimSlotAndReturnId(ds, start, end);
  if (!newId) return;
  const ok = await takvimExecuteMoveAppointment(pick.fromSlotId, newId, pick.apptId);
  if (!ok) {
    await loadTakvimSlots();
    return;
  }
  takvimClearMovePickMode();
  await loadTakvimSlots();
  toast('Slot oluşturuldu ve randevu taşındı ✓', 'ok');
}

function takvimCellClick(ds, hh, e) {
  if (e?.target?.closest?.('.takvim-slot-el')) return;
  const pick = window._takvimMovePick;
  if (pick && String(pick.campaignId || '') === String(takvimCampId || '')) {
    void takvimCellClickMovePick(ds, hh);
    return;
  }
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  const start = `${hh}:00`;
  const end = takvimAddHours(start, takvimSlotDurHours());
  if (!takvimCellClickNeedsConfirm()) {
    void createTakvimSlotDirect(ds, start, end);
    return;
  }
  openTakvimNewSlotModal(ds, start, end);
}

async function takvimHeaderClick(ds) {
  const isClosed = takvimClosedDays[ds];
  if (!(await mbConfirm(isClosed ? 'Günü açmak istiyor musunuz?' : 'Günü kapatmak istiyor musunuz?', 'Gün Durumu'))) return;
  if (isClosed) {
    takvimClosedDays[ds] = false;
    sb(`takvim_slots?campaign_id=eq.${takvimCampId}&tarih=eq.${ds}&gun_kapali=eq.true`,{method:'DELETE',prefer:'return=minimal'}).then(()=>loadTakvimSlots());
  } else {
    takvimClosedDays[ds] = true;
    sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify({campaign_id:takvimCampId,firm_id:currentUser.firm_id,tarih:ds,baslangic_saat:'00:00',bitis_saat:'00:00',durum:'bos',gun_kapali:true})}).then(()=>loadTakvimSlots());
  }
}

function openTakvimNewSlotModal(ds, start, end) {
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-title').textContent = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Neuer Slot' : 'Yeni slot';
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="display:flex;flex-direction:column;gap:10px;">
<div class="form-row"><label class="form-label">Tarih</label><input type="date" class="form-input" id="ns-date" value="${ds}"></div>
<div class="form-row"><label class="form-label">Başlangıç</label><input type="time" class="form-input" id="ns-start" value="${start}"></div>
<div class="form-row"><label class="form-label">Bitiş</label><input type="time" class="form-input" id="ns-end" value="${end}"></div>
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:4px;">
<input type="checkbox" id="ns-skip-confirm"> Bir daha gösterme (hızlı slot)
</label>
</div>`;
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">İptal</button><button class="btn btn-primary" onclick="saveTakvimSlot('${ds}')">Slot Oluştur</button>`;
}

async function saveTakvimSlot(od) {
  if (document.getElementById('ns-skip-confirm')?.checked) {
    localStorage.setItem('mb_takvim_skip_new_slot_confirm', '1');
  }
  const tarih = document.getElementById('ns-date')?.value||od;
  const bas = document.getElementById('ns-start')?.value||'10:00';
  const bit = document.getElementById('ns-end')?.value||'12:00';
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  if (!currentUser?.firm_id) { toast('Firma bilgisi eksik','err'); return; }
  try {
    await sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
      campaign_id:takvimCampId, firm_id:currentUser.firm_id,
      tarih, baslangic_saat:bas, bitis_saat:bit, durum:'bos', gun_kapali:false
    })});
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    const seen = await takvimShowCreatedSlot(tarih, bas);
    toast(seen ? t('cal.slot.created') : t('cal.slot.hidden'), seen ? 'ok' : 'warn');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}
