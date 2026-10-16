// ─────────────────────────────────────────────
// APPOINTMENTS — takvim ve randevu yönetimi
// ─────────────────────────────────────────────

// ── Takvim yardımcı fonksiyonlar ─────────────
function takvimFmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
const _takvimMeasureCache = {};

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

function _validateCustomerSelection(ctx, selectId) {
  if (!ctx.mustSelect) return true;
  if (!_selectedCustomerId(selectId)) {
    toast('Müşteri seçin', 'err');
    return false;
  }
  return true;
}

async function _createAppointmentWithCustomerFallback(data) {
  try {
    return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(data)});
  } catch (e) {
    if (String(e.message || '').includes('customer_id')) {
      const clone = { ...data };
      delete clone.customer_id;
      toast('Not: customer_id migration bekliyor, müşteri bilgisi geçici kaydedilemedi.', 'warn');
      return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(clone)});
    }
    throw e;
  }
}

async function renderInlineTerminCustomerField(selectedId) {
  const wrap = document.getElementById('tf2-customer-wrap');
  if (!wrap) return;
  const ctx = await _getCustomerCtx(selectedId || null);
  wrap.innerHTML = _renderCustomerField(ctx, 'tf2-customer');
}

function takvimClearMovePickMode() {
  window._takvimMovePick = null;
  document.body.classList.remove('takvim-move-pick');
}

/** Süper admin takvim sayfasında firma değişince kampanya listesini yenile (tarih sıfırlanmaz) */
async function takvimPageFirmChanged() {
  const isAdmin = ['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '');
  if (!isAdmin) return;
  const fid = getActiveFirmId();
  const camps =
    (await sb(
      fid
        ? `campaigns?firm_id=eq.${fid}&status=eq.active&select=id,name&order=name.asc`
        : `campaigns?status=eq.active&select=id,name&order=name.asc`
    ).catch(() => [])) || [];
  const sel = document.getElementById('takvim-camp-select');
  const prev = takvimCampId;
  if (sel) {
    const esc =
      typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => String(s ?? '');
    sel.innerHTML =
      '<option value="">Kampanya seç...</option>' +
      camps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (prev && [...sel.options].some((o) => o.value === String(prev))) {
      takvimCampId = prev;
      sel.value = prev;
    } else if (camps.length === 1) {
      takvimCampId = camps[0].id;
      sel.value = takvimCampId;
    } else {
      takvimCampId = sel.value || null;
    }
  }
  takvimSlots = [];
  takvimAppts = [];
  renderTakvimGrid();
  if (takvimCampId) await loadTakvimSlots();
}

async function loadTakvimPage() {
  takvimClearMovePickMode();
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
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
    if (currentUser?.role === 'super_admin' && typeof renderFirmSelector === 'function') {
      firmHost.style.display = '';
      renderFirmSelector('takvim-page-firm-selector', takvimPageFirmChanged);
    } else {
      firmHost.style.display = 'none';
      firmHost.innerHTML = '';
    }
  }
  if (isAdmin) {
    const fid = getActiveFirmId();
    const camps = await sb(fid ? `campaigns?firm_id=eq.${fid}&status=eq.active&select=*&order=name.asc` : `campaigns?status=eq.active&select=*&order=name.asc`).catch(()=>[]);
    if (typeof campaigns !== 'undefined' && Array.isArray(campaigns) && camps?.length) {
      camps.forEach((row) => {
        if (!row?.id) return;
        const i = campaigns.findIndex((c) => c.id === row.id);
        if (i >= 0) campaigns[i] = { ...campaigns[i], ...row };
        else campaigns.push(row);
      });
    }
    const sel = document.getElementById('takvim-camp-select');
    if (sel) {
      sel.innerHTML = '<option value="">Kampanya seç...</option>' + (camps||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      if (takvimCampId) sel.value = takvimCampId;
      else if (camps?.length===1) { takvimCampId = camps[0].id; sel.value = takvimCampId; }
    }
  } else {
    const myAc = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id,campaigns(id,name)&limit=1`).catch(()=>[]);
    if (myAc?.length) {
      takvimCampId = myAc[0].campaign_id;
      const lbl = document.getElementById('takvim-camp-label');
      if (lbl) {
        lbl.textContent = myAc[0].campaigns?.name || '';
        lbl.style.display = '';
      }
    }
  }
  takvimDate = new Date(); takvimDate.setHours(0,0,0,0);
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
  ['takvim-camp-select','takvim-camp-select-ov'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.value = campId;
  });
  const lbl = document.getElementById('takvim-camp-label');
  const selRef = document.getElementById('takvim-camp-select') || document.getElementById('takvim-camp-select-ov');
  if (lbl && selRef) lbl.textContent = selRef.options[selRef.selectedIndex]?.text||campId;
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
  takvimDate = new Date(); takvimDate.setHours(0,0,0,0);
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
  } catch(e) { toast('Takvim hatası: '+e.message,'err'); }
}

/** Hafta/gün görünümünde kaydırmasız sığdırmak için scroll alanı yüksekliği (px) */
function takvimWeekScrollAvailablePx() {
  const sid = window._takvimScrollId || 'takvim-scroll';
  const sc = document.getElementById(sid);
  if (!sc) return Math.max(280, Math.floor(window.innerHeight * 0.48));
  const h = sc.getBoundingClientRect().height || sc.clientHeight;
  if (h >= 72) return Math.floor(h);
  const p = sc.parentElement;
  if (p && p.children.length) {
    const ph = p.getBoundingClientRect().height || p.clientHeight;
    let other = 0;
    for (const c of p.children) {
      if (c !== sc) other += c.getBoundingClientRect().height || c.offsetHeight || 0;
    }
    const guess = Math.floor(ph - other);
    if (guess >= 72) return guess;
  }
  return Math.max(260, Math.floor(window.innerHeight * 0.42));
}

function takvimApplyWeekRowHeights() {
  if (takvimView === 'month') return;
  const gid = window._takvimGridId || 'takvim-grid';
  const grid = document.getElementById(gid);
  const inner = grid?.querySelector('.takvim-week-grid-inner');
  if (!inner) return;
  const numHrs = parseInt(inner.dataset.takvimHrs || '0', 10);
  if (!numHrs) return;
  const header = parseInt(inner.dataset.takvimHdr || '40', 10);
  const avail = takvimWeekScrollAvailablePx();
  const rowH = Math.max(22, Math.floor((avail - header) / numHrs));
  inner.style.gridTemplateRows = `${header}px repeat(${numHrs}, ${rowH}px)`;
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
  const locale = typeof mbLocale === 'function' ? mbLocale() : (currentLang==='de' ? 'de-DE' : 'tr-TR');
  const endDt = new Date(startDt);
  endDt.setDate(endDt.getDate() + (daysCount - 1));
  const lbl = document.getElementById(window._takvimWeekLabelId||'takvim-week-label');
  if (lbl) {
    if (isDay) lbl.textContent = startDt.toLocaleDateString(locale,{weekday:'long',day:'2-digit',month:'short'});
    else lbl.textContent = `${startDt.toLocaleDateString(locale,{day:'2-digit',month:'short'})} – ${endDt.toLocaleDateString(locale,{day:'2-digit',month:'short',year:'numeric'})}`;
  }
  const shH = tset.startH;
  const endH = tset.endH;
  const numHrs = Math.max(1, endH - shH + 1);
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const headerRowPx = 40;
  const availPx = takvimWeekScrollAvailablePx();
  const rowH = Math.max(22, Math.floor((availPx - headerRowPx) / numHrs));
  let h = `<div class="takvim-week-grid-inner" data-takvim-hrs="${numHrs}" data-takvim-hdr="${headerRowPx}" style="display:grid;width:100%;min-height:0;box-sizing:border-box;grid-template-columns:56px repeat(${daysCount},minmax(0,1fr));grid-template-rows:${headerRowPx}px repeat(${numHrs},${rowH}px);">`;
  h += '<div class="tk-gutter tk-gutter--corner"></div>';
  for (let d=0; d<daysCount; d++) {
    const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
    const ds = takvimFmtD(dt);
    const isToday = dt.toDateString()===new Date().toDateString();
    const isClosed = takvimClosedDays[ds];
    const click = isAdmin ? `onclick="takvimHeaderClick('${ds}')"` : '';
    const wdShort = dt.toLocaleDateString(locale, { weekday: 'short' });
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
      const isToday = dt.toDateString()===new Date().toDateString();
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
      const today = cur.toDateString() === new Date().toDateString();
      h += `<div id="mc_${takvimGridToken()}_${ds}" data-tk-month="${ds}" class="tk-month${other ? ' tk-month--other' : ''}${today ? ' tk-month--today' : ''}"><div class="tk-month-d">${cur.getDate()}</div><div data-tk-month-slots="${ds}" class="tk-month-slots"></div></div>`;
    }
    cur.setDate(cur.getDate() + 1);
  }
  h += '</div>'; grid.innerHTML = h;
  renderTakvimSlots();
}

function renderTakvimSlots() {
  if (takvimView === 'month') {
    renderTakvimSlotsMonth();
    return;
  }
  const isAdmin = ['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '');
  const visible = takvimSlots.filter((s) => !s.gun_kapali && !s.alta_tasindi);
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
  const isAdmin = ['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '');
  takvimSlots.filter(s=>!s.gun_kapali&&!s.alta_tasindi).forEach(s=>{
    const el = takvimMonthSlotHost(s.tarih);
    if (!el) return;
    const appt = takvimAppts.find(a=>a.id===s.appointment_id);
    const div = document.createElement('div');
    const vis = getSlotGradientAndText(s, appt);
    div.style.cssText = `font-size:9px;padding:2px 4px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-weight:700;background:${vis.background};color:${vis.color};`;
    if (appt) {
      const show = isAdmin || appt.agent_id === currentUser?.id;
      const nm = show ? _takvimApptCardName(appt) : '***';
      div.textContent = `${s.baslangic_saat.slice(0, 5)} ${nm}`;
    } else {
      div.textContent = `${s.baslangic_saat.slice(0, 5)} Boş`;
    }
    div.onclick = () => openTakvimSlotDetail(s, appt);
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

function takvimSlotDistButtons(slotId) {
  return `<div class="tak-slot-dist" onmousedown="event.stopPropagation()" style="position:absolute;bottom:2px;right:2px;z-index:22;display:flex;gap:4px;align-items:center;">
<button type="button" class="btn-tak-dist" title="Mesafe: Dialer müşterisi → bu randevu" onclick="event.stopPropagation();measureSlotDistance('${slotId}')"><i class="ph ph-map-pin" style="font-size:12px;"></i></button>
<button type="button" class="btn-tak-dist" title="Bu randevudan diğer randevulara uzaklık" onclick="event.stopPropagation();toggleTakvimDistAll('${slotId}')"><i class="ph ph-path" style="font-size:12px;"></i></button>
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
  const pb =
    slot.durum === 'dolu' && appt ? 24 : canShift ? 6 : dense ? 4 : 6;
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
    let plzLine = '';
    if (_takvimMeasureFromPlz && appt?.plz) {
      const r = _takvimMeasureCache[`${_takvimMeasureFromPlz}_${appt.plz}`];
      if (r) plzLine = `<div class="tk-slot-meta">${r.km} km · ${r.min} dk</div>`;
    }
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
    el.innerHTML = `${canShift ? takvimSlotMoveMarkup(slot.id, true) : ''}<div class="takvim-slot-card" style="display:flex;flex-direction:column;gap:2px;line-height:1.2;max-width:100%;align-items:flex-start;text-align:left;">
<div class="${nmWrap}" style="font-weight:800;font-size:${fzName}px;">${nm}</div>
<div class="${addrWrap}" style="font-size:${fzLine}px;font-weight:600;opacity:.93;">${adr}</div>
<div style="font-size:${fzMono}px;opacity:.9;font-family:var(--mono);white-space:nowrap;">${timeLn}</div>
<div style="font-size:${fzAg}px;opacity:.84;word-break:break-word;">Agent: ${ag}</div></div>${plzLine}${distAllHtml}<div id="dist-${slot.id}" style="font-size:${dense ? 7 : 9}px;opacity:.88;margin-top:0;"></div>${canQuickAdd ? `<div class="tak-slot-add-wrap" onmousedown="event.stopPropagation()">${takvimSlotQuickAddMarkup(slot.id)}</div>` : ''}${takvimSlotDistButtons(slot.id)}`;
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
  el.oncontextmenu = (e) => { e.preventDefault(); showSlotContextMenu(e, slot, appt); };
  if (slot.durum === 'bos' || (slot.durum === 'dolu' && appt)) initSlotDrag(el, slot, appt);
  return el;
}

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
  if (!['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '')) return;
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

async function openTakvimSlotDetail(slot, appt) {
  const role = currentUser?.role || '';
  const isAdmin = ['admin','super_admin','firm_admin'].includes(role);
  const canAssignField = ['admin','super_admin','firm_admin'].includes(role);
  const canManageAppt = ['admin','super_admin','firm_admin','qc'].includes(currentUser?.role||'');
  const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
  const resultMap = {};
  (resultCfg || []).forEach(r => { resultMap[r.key] = r; });
  document.getElementById('takvim-detail-title').textContent = appt ? appt.nachname : 'Boş Slot';
  openModal('m-takvim-detail');
  const body = document.getElementById('takvim-detail-body');
  const footer = document.getElementById('takvim-detail-footer');
  if (!appt) {
    const lockInfo = slot.durum==='kilitli' && isAdmin ?
      `<div style="margin-top:8px;padding:6px 10px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.3);border-radius:5px;font-size:11px;"><b>Kilitleyen Agent:</b> ${slot.kilitli_agent_id||'?'}<br><b>Kilitlenme:</b> ${slot.kilitli_at?new Date(slot.kilitli_at).toLocaleString('tr-TR'):'—'}</div>` : '';
    body.innerHTML = `<div style="text-align:center;padding:20px;">
<div style="font-weight:800;font-size:14px;">${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)} – ${slot.bitis_saat?.slice(0,5)}</div>
<div style="color:var(--text-3);font-size:12px;margin-top:4px;">${slot.durum==='kilitli'?'Kilitli':'Boş'} slot</div>
${lockInfo}
</div>`;
    const bookLabel = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Termin eintragen' : 'Randevu ekle';
    footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
${isAdmin?`<button class="btn btn-ghost" style="color:var(--red);" onclick="deleteTakvimSlot('${slot.id}')">Sil</button>${slot.durum==='kilitli'?`<button class="btn btn-ghost" style="color:var(--yellow);" onclick="closeModal('m-takvim-detail');unlockSlot('${slot.id}')">Kilidi Kaldır</button>`:''}`:''}
<button class="btn btn-primary" onclick="closeModal('m-takvim-detail');lockAndBookSlot(takvimSlots.find(s=>s.id==='${slot.id}'))">${bookLabel}</button>`;
    return;
  }
  const statusCfg = resultMap[_normResultKey(appt.durum)] || {};
  const dc = statusCfg.color || 'var(--accent)';
  const statusLabel = statusCfg.label || (appt.durum || '').replace('_', ' ').toUpperCase();
  body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);">DURUM</div><div style="font-weight:800;font-size:14px;color:${dc};">${statusLabel}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">MÜŞTERİ</div><div style="font-weight:700;">${appt.nachname||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TELEFON</div><div style="font-weight:700;font-family:var(--mono);">${appt.telefonnummer||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">PLZ / ŞEHİR</div><div style="font-weight:700;">${appt.plz||'—'} ${appt.ortschaft||''}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ADRES</div><div style="font-weight:700;">${appt.strasse||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">EV TİPİ</div><div style="font-weight:700;">${appt.hausart||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">BAUJAHR / m²</div><div style="font-weight:700;">${appt.baujahr||'—'} / ${appt.qm||'—'}m²</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ISITMA</div><div style="font-weight:700;">${appt.heizung||'—'} (${appt.alter_der_heizung||'—'} yaş)</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TÜKETİM</div><div style="font-weight:700;">${appt.verbrauch_pro_jahr||'—'}</div></div>
${appt.agent_notu?`<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);">AGENT NOTU</div><div>${appt.agent_notu}</div></div>`:''}
</div>`;
  footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail');openDialerForContact('${appt.contact_id||''}')">Dialer'a Git</button>
${canAssignField ? `<button class="btn btn-primary" onclick="openFieldAssignModal('${appt.id}','${appt.firm_id || currentUser.firm_id}')">Sahaya Ata</button>` : ''}
${canManageAppt ? `
<select class="form-input" id="appt-status-sel" style="width:auto;font-size:12px;padding:6px 10px;">
<option value="">Durum değiştir...</option>
${(resultCfg||[]).map(r=>`<option value="${r.key}">${r.label}</option>`).join('')}
</select>
<button class="btn btn-primary" onclick="takvimQcUpdate('${appt.id}',document.getElementById('appt-status-sel').value,document.getElementById('appt-customer-sel')?.value)">Kaydet</button>` : ''}`;
  if (canManageAppt) {
    _getCustomerCtx(appt.customer_id).then(ctx => {
      if (!ctx?.customers?.length) return;
      const el = document.createElement('div');
      el.className = 'form-row';
      el.style.cssText = 'margin-top:8px;';
      el.innerHTML = `<label class="form-label">Müşteri</label>
      <select class="form-input" id="appt-customer-sel" style="width:100%;font-size:12px;padding:6px 10px;">
        <option value="">Seçin...</option>
        ${ctx.customers.map(c => `<option value="${c.id}" ${String(appt.customer_id||'')===String(c.id)?'selected':''}>${(c.code?c.code+' · ':'')+c.name}</option>`).join('')}
      </select>`;
      body.appendChild(el);
    }).catch(()=>{});
  }
}

async function takvimQcUpdate(apptId, status, customerId) {
  if (!status && !customerId) { toast('Durum veya müşteri seçin','err'); return; }
  try {
    const body = {};
    if (status) body.durum = status;
    if (customerId !== undefined) body.customer_id = customerId || null;
    await sb(`appointments?id=eq.${apptId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify(body)});
    if (status) {
      const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
      const cfg = (resultCfg || []).find(r => r.key === _normResultKey(status));
      if (cfg?.auto_move_down) {
        const slots = await sb(`takvim_slots?appointment_id=eq.${apptId}&select=id&limit=1`).catch(() => []);
        if (slots?.[0]?.id) await slotAltaTasi(slots[0].id);
      }
    }
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Randevu güncellendi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function unlockSlot(slotId) {
  if (!(await mbConfirm('Slot kilidi kaldırılsın mı?', 'Slot Kilidi'))) return;
  try {
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})});
    await loadTakvimSlots();
    toast('Kilit kaldırıldı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function agentCancelAppt(slotId, apptId) {
  if (!(await mbConfirm('Randevununi iptal etmek istediğine emin misin?', 'Randevu İptali'))) return;
  try {
    await sb(`appointments?id=eq.${apptId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'iptal'})});
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',appointment_id:null})});
    await loadTakvimSlots();
    toast('Randevu iptal edildi','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function deleteTakvimSlot(slotId) {
  if (!(await mbConfirm('Slot silinecek?', 'Slot Sil'))) return;
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'DELETE',prefer:'return=minimal'}).catch(e=>toast('Hata: '+e.message,'err'));
  closeModal('m-takvim-detail');
  await loadTakvimSlots();
  toast('Slot silindi','ok');
}

async function lockAndBookSlot(slot) {
  if (!slot) return;
  try {
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'kilitli',kilitli_agent_id:currentUser.id,kilitli_at:new Date().toISOString()})});
  } catch(e) { toast('Slot kilitlenemiyor: '+e.message,'err'); return; }
  _bookingSlot = slot;
  // If we're in dialer context, show randevu section instead of popup
  // Agent, dialer sayfasındayken takvim overlay'inden slot seçti
  const inDialerCtx = typeof onAgentSlotSelected === 'function' && typeof dialerStatus !== 'undefined';
  if (inDialerCtx) {
    // Overlay'i kapat
    const _ov = document.getElementById('takvim-popup-overlay');
    if (_ov) _ov.classList.remove('open');
    // Randevu formunu göster (navigate gereksiz — onAgentSlotSelected UI'yı yönetiyor)
    onAgentSlotSelected(slot);
  } else {
    openTakvimBookForm(slot);
  }
}

async function openTakvimBookForm(slot) {
  const contact = currentContact||{};
  const custCtx = await _getCustomerCtx(null);
  document.getElementById('takvim-detail-title').textContent = `Randevu — ${slot.tarih} ${slot.baslangic_saat?.slice(0,5)}`;
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="background:var(--bg-3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:12px;font-weight:600;">${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)}–${slot.bitis_saat?.slice(0,5)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Ad Soyad *</label><input class="form-input" id="tf-name" value="${contact.first_name?contact.first_name+' '+(contact.last_name||''):''}"></div>
<div class="form-row"><label class="form-label">Telefon *</label><input class="form-input" id="tf-tel" value="${contact.phone||''}"></div>
<div class="form-row"><label class="form-label">Telefon 2</label><input class="form-input" id="tf-tel2" value="${contact.phone2||''}"></div>
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Adres *</label><input class="form-input" id="tf-str" value="${contact.address||''}"></div>
<div class="form-row"><label class="form-label">PLZ *</label><input class="form-input" id="tf-plz" value="${contact.plz||''}"></div>
<div class="form-row"><label class="form-label">Şehir</label><input class="form-input" id="tf-ort" value="${contact.city||''}"></div>
<div class="form-row"><label class="form-label">Ev Tipi *</label><select class="form-input" id="tf-hausart"><option value="">Seçin</option><option>Einfamilienhaus</option><option>Zweifamilienhaus</option><option>Reihenhaus</option><option>Doppelhaus</option><option>Mehrfamilienhaus</option></select></div>
<div class="form-row"><label class="form-label">Yapım Yılı *</label><input class="form-input" id="tf-bj" value="${contact.baujahr||''}"></div>
<div class="form-row"><label class="form-label">m² *</label><input class="form-input" id="tf-qm" value="${contact.qm||''}"></div>
<div class="form-row"><label class="form-label">Isıtma *</label><select class="form-input" id="tf-hz"><option value="">Seçin</option><option>Gas</option><option>Öl</option><option>Pellet</option><option>WP</option><option>Fernwärme</option></select></div>
<div class="form-row"><label class="form-label">Isıtma Yaşı *</label><input class="form-input" id="tf-ah" value="${contact.alter_der_heizung||''}"></div>
<div class="form-row"><label class="form-label">Tüketim/Yıl *</label><input class="form-input" id="tf-vj" value="${contact.verbrauch_pro_jahr||''}"></div>
<div class="form-row"><label class="form-label">Kişi *</label><input class="form-input" id="tf-pe" value="${contact.personen||''}"></div>
<div class="form-row"><label class="form-label">PV İlgisi</label><select class="form-input" id="tf-pv"><option value="false">Hayır</option><option value="true">Evet</option></select></div>
${_renderCustomerField(custCtx, 'tf-customer')}
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Not</label><textarea class="form-input" id="tf-note" rows="2" style="resize:vertical;">${contact.notes||''}</textarea></div>`;
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="cancelTakvimBook('${slot.id}')">İptal</button><button class="btn btn-primary" onclick="submitTakvimBook('${slot.id}')">Kaydet</button>`;
}

// Save termin directly from the inline termin-fields-section
async function saveTerminFromSection() {
  const slot = _bookingSlot || window._selectedBookingSlot;
  if (!slot) { toast('Önce takvimden bir slot seçin','err'); return; }
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf2-customer')) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const requiredKeys = [...document.querySelectorAll('#termin-fields-section [data-required="1"]')].map((el) => el.getAttribute('data-tf-key')).filter(Boolean);
  const must = requiredKeys.length ? requiredKeys : ['hausart','baujahr','qm','heizung','alter_der_heizung'];
  if (must.some((k) => !g('tf2-' + k))) {
    toast('Zorunlu alanları doldurun (*)','err'); return;
  }
  const contact = currentContact || {};
  const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
  try {
    const data = {
      slot_id: slot.id, contact_id: isValidUUID(contact.id) ? contact.id : null,
      agent_id: currentUser.id, campaign_id: takvimCampId||selectedCampId, firm_id: currentUser.firm_id,
      nachname: `${contact.first_name||''} ${contact.last_name||''}`.trim() || contact.phone || '—',
      telefonnummer: contact.phone||'', telefon2: contact.phone2||'',
      strasse: contact.address||'', plz: contact.plz||'', ortschaft: contact.city||'',
      hausart: g('tf2-hausart'), baujahr: g('tf2-baujahr'), qm: g('tf2-qm'),
      heizung: g('tf2-heizung'), alter_der_heizung: g('tf2-alter_der_heizung'),
      verbrauch_pro_jahr: g('tf2-verbrauch_pro_jahr'), personen: g('tf2-personen'),
      ...(document.getElementById('tf2-interesse_an_pv') ? { interesse_an_pv: g('tf2-interesse_an_pv') === 'true' } : {}),
      agent_notu: g('tf2-note'), durum: 'qc_bekleniyor',
      customer_id: _selectedCustomerId('tf2-customer'),
      termin_tarih: `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00`
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    _bookingSlot = null; window._selectedBookingSlot = null;
    // Hide the termin section
    const ts = document.getElementById('termin-fields-section');
    if (ts) ts.style.display = 'none';
    const badge = document.getElementById('termin-slot-badge');
    if (badge) { badge.textContent = 'Slot seçilmedi'; }
    toast('Randevu kaydedildi ✓','ok');
    // Finalize outcome — override to prevent re-opening overlay
    if (typeof submitOutcome === 'function' && selectedOutcome === 'appointment') {
      selectedOutcome = 'appointment_done'; // prevent overlay re-open in submitOutcome
      submitOutcome(false);
    }
  } catch(e) { toast('Hata: '+e.message,'err'); console.error(e); }
}

async function cancelTakvimBook(slotId) {
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})}).catch(()=>{});
  _bookingSlot = null;
  closeModal('m-takvim-detail');
}

async function submitTakvimBook(slotId) {
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf-customer')) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  if (!g('tf-name')||!g('tf-tel')||!g('tf-plz')||!g('tf-hausart')||!g('tf-bj')||!g('tf-qm')||!g('tf-hz')||!g('tf-ah')) {
    toast('Zorunlu alanları doldurun!','err'); return;
  }
  const slot = _bookingSlot || takvimSlots.find(s=>s.id===slotId);
  try {
    // Fix 22007: baslangic_saat may be 'HH:MM:SS' from DB — normalize to 'HH:MM'
    const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
    const data = {
      slot_id:slotId, contact_id:isValidUUID(currentContact?.id) ? currentContact.id : null,
      agent_id:currentUser.id, campaign_id:takvimCampId||selectedCampId, firm_id:currentUser.firm_id,
      nachname:g('tf-name'), telefonnummer:g('tf-tel'), telefon2:g('tf-tel2'),
      strasse:g('tf-str'), plz:g('tf-plz'), ortschaft:g('tf-ort'),
      hausart:g('tf-hausart'), baujahr:g('tf-bj'), qm:g('tf-qm'),
      heizung:g('tf-hz'), alter_der_heizung:g('tf-ah'), verbrauch_pro_jahr:g('tf-vj'),
      personen:g('tf-pe'), interesse_an_pv:g('tf-pv')==='true',
      agent_notu:g('tf-note'), durum:'qc_bekleniyor',
      customer_id:_selectedCustomerId('tf-customer'),
      termin_tarih: slot ? `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00` : new Date().toISOString()
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    _bookingSlot = null;
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Randevu kaydedildi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function openTakvimSettings() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  const c0 = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.find((c) => c.id === takvimCampId) : null;
  const c0Settings = _objOrEmpty(c0?.settings);
  let resolvedFirmId = c0?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  await ensureFirmTakvimDefaultsLoaded(resolvedFirmId);
  try {
    const rows = await sb(`campaigns?id=eq.${takvimCampId}&select=settings,firm_id`);
    const rowSettings = _objOrEmpty(rows?.[0]?.settings);
    const tk = _objOrEmpty(rowSettings?.takvim);
    resolvedFirmId = rows?.[0]?.firm_id || resolvedFirmId;
    const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((c) => c.id === takvimCampId) : -1;
    if (idx >= 0) {
      campaigns[idx] = { ...campaigns[idx], settings: { ...c0Settings, ...rowSettings, takvim: tk }, firm_id: rows?.[0]?.firm_id || campaigns[idx].firm_id };
    }
  } catch (_) {}
  const cfg = getCampaignTakvimSettings();
  const old = document.getElementById('m-takvim-settings');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-takvim-settings';
  m.className = 'modal-overlay open';
  const dayNames = {pzt:'Pazartesi',sal:'Salı',car:'Çarşamba',per:'Perşembe',cum:'Cuma',cmt:'Cumartesi',paz:'Pazar'};
  const slotOpts = [1, 2, 3, 4].map((n) =>
    `<option value="${n}"${cfg.slot_dur === n ? ' selected' : ''}>${n} saat</option>`
  ).join('');
  m.innerHTML = `<div class="modal" style="max-width:560px;">
<div class="modal-hdr">
<div class="modal-title">Takvim Ayarları</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px 10px;display:flex;flex-direction:column;gap:12px;">
<div style="display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:10px;">
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn active" data-tab="work" onclick="setTakvimSettingsTab('work')">Çalışma Düzeni</button>
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn" data-tab="slot" onclick="setTakvimSettingsTab('slot')">Slot Kuralları</button>
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn" data-tab="confirm" onclick="setTakvimSettingsTab('confirm')">Onay</button>
</div>

<div id="ts-tab-work" class="ts-tab-pane" style="display:flex;flex-direction:column;gap:14px;">
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Çalışma Günleri</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;" id="ts-days">
${Object.entries(dayNames).map(([k, v]) => {
  const on = cfg.active_days.includes(k);
  const st = on ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '';
  return '<button type="button" class="btn btn-ghost btn-sm ts-day-btn' + (on ? ' active' : '') + '" data-d="' + k + '"'
    + ' style="' + st + '"'
    + ' onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'var(--accent)\':\'\';this.style.color=this.classList.contains(\'active\')?\'#fff\':\'\';this.style.borderColor=this.classList.contains(\'active\')?\'var(--accent)\':\'\';">'
    + v.slice(0, 3) + '</button>';
}).join('')}
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
<div class="form-row">
<label class="form-label">Başlangıç Saati</label>
<input type="time" class="form-input" id="ts-start" value="${cfg.start_hour}">
</div>
<div class="form-row">
<label class="form-label">Bitiş Saati</label>
<input type="time" class="form-input" id="ts-end" value="${cfg.end_hour}">
</div>
</div>
</div>

<div id="ts-tab-slot" class="ts-tab-pane" style="display:none;flex-direction:column;gap:14px;">
<div class="form-row">
<label class="form-label">Slot Süresi (saat)</label>
<select class="form-input" id="ts-slot-dur">${slotOpts}</select>
</div>
<div class="form-row">
<label class="form-label">Gün başına maks. slot</label>
<input type="number" class="form-input" id="ts-max-slots" value="${cfg.max_slots}" min="1" max="40" style="width:80px;">
</div>
</div>

<div id="ts-tab-confirm" class="ts-tab-pane" style="display:none;flex-direction:column;gap:14px;">
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
<input type="checkbox" id="ts-confirm-slot" ${cfg.confirm_new_slot !== false ? 'checked' : ''}> Yeni slot eklerken onay penceresi göster
</label>
<div style="font-size:10px;color:var(--text-3);">Kapalıysa hücreye tıklayınca doğrudan slot oluşturulur. Kullanıcı “Bir daha gösterme” seçtiyse tarayıcıda hızlı mod açılır.</div>
</div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">İptal</button>
<button class="btn btn-ghost" onclick="saveTakvimSettings(true)">Tümüne Uygula</button>
<button class="btn btn-primary" onclick="saveTakvimSettings(false)">Kaydet</button>
</div>
</div>`;
  document.body.appendChild(m);
  m.style.zIndex = '1205';
}

async function renderTakvimSettingsResultColorRows(firmId) {
  const root = document.getElementById('m-takvim-settings');
  const host = document.getElementById('ts-result-color-rows');
  if (!root || !host) return;
  const fid = firmId || getActiveFirmId() || currentUser?.firm_id;
  root.dataset.firmId = fid || '';
  if (!fid) {
    host.innerHTML = '<div style="font-size:12px;color:var(--text-3);">Firma seçimi bulunamadı.</div>';
    return;
  }
  const rows = await loadFirmAppointmentResults(fid, true).catch(() => defaultAppointmentResults());
  const safe = Array.isArray(rows) && rows.length ? rows : defaultAppointmentResults();
  host.innerHTML = safe.map((r, i) => {
    const color = /^#[0-9A-Fa-f]{6}$/.test(String(r.color || '').trim()) ? String(r.color).trim() : '#64748b';
    const label = String(r.label || r.key || '').trim();
    return `<div style="display:grid;grid-template-columns:1fr 88px;gap:10px;align-items:center;">
<div style="font-size:12px;font-weight:700;color:var(--text-2);">${label}</div>
<input type="color" class="form-input ts-result-color" data-key="${r.key}" value="${color}" style="width:84px;height:36px;padding:2px;">
</div>`;
  }).join('');
}

function setTakvimSettingsTab(tabId) {
  const root = document.getElementById('m-takvim-settings');
  if (!root) return;
  const panes = root.querySelectorAll('.ts-tab-pane');
  panes.forEach((pane) => {
    pane.style.display = pane.id === `ts-tab-${tabId}` ? 'flex' : 'none';
  });
  const tabs = root.querySelectorAll('.ts-tab-btn');
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.style.background = active ? 'var(--accent)' : '';
    btn.style.color = active ? '#fff' : '';
    btn.style.borderColor = active ? 'var(--accent)' : '';
  });
}

function _objOrEmpty(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v) || {}; } catch (_) { return {}; }
  }
  return {};
}

async function saveTakvimSettings(applyAll = false) {
  if (!takvimCampId) { toast('Kampanya seçili değil','err'); return; }
  const prevCfg = getCampaignTakvimSettings();
  const activeDays = [...document.querySelectorAll('.ts-day-btn.active')].map(b=>b.dataset.d);
  if (!activeDays.length) { toast('En az bir çalışma günü seçin', 'warn'); return; }
  const start    = document.getElementById('ts-start')?.value    || '08:00';
  const end      = document.getElementById('ts-end')?.value      || '20:00';
  const dur      = parseInt(document.getElementById('ts-slot-dur')?.value||'2');
  const maxSlots = parseInt(document.getElementById('ts-max-slots')?.value||'5');
  const bosColor = prevCfg.bos_color || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('ts-confirm-slot')?.checked;
  const takvimSettings = {
    active_days: activeDays,
    start_hour: start,
    end_hour: end,
    slot_dur: dur,
    max_slots: maxSlots,
    bos_color: bosColor,
    confirm_new_slot
  };
  try {
    const modal = document.getElementById('m-takvim-settings');
    const fid = modal?.dataset?.firmId || getActiveFirmId() || currentUser?.firm_id;

    if (applyAll) {
      if (!fid) { toast('Firma bilgisi eksik', 'err'); return; }
      const firmCamps = await sb(`campaigns?firm_id=eq.${fid}&select=id,settings`);
      for (const c of (firmCamps || [])) {
        const st = _objOrEmpty(c?.settings);
        await sb(`campaigns?id=eq.${c.id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ settings: { ...st, takvim: takvimSettings } })
        });
        const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((x) => x.id === c.id) : -1;
        if (idx >= 0) campaigns[idx].settings = { ..._objOrEmpty(campaigns[idx].settings), takvim: takvimSettings };
      }
    } else {
      const camps = await sb(`campaigns?id=eq.${takvimCampId}&select=settings`);
      const existingSettings = _objOrEmpty(camps?.[0]?.settings);
      await sb(`campaigns?id=eq.${takvimCampId}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...existingSettings, takvim: takvimSettings } })
      });
      const verifyRows = await sb(`campaigns?id=eq.${takvimCampId}&select=id,settings,firm_id&limit=1`);
      const savedSettings = _objOrEmpty(verifyRows?.[0]?.settings);
      const savedTakvim = _objOrEmpty(savedSettings.takvim);
      const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((c) => c.id === takvimCampId) : -1;
      if (idx >= 0) {
        campaigns[idx].settings = {
          ..._objOrEmpty(campaigns[idx].settings),
          ...savedSettings,
          takvim: {
            ...takvimSettings,
            ...savedTakvim
          }
        };
        if (verifyRows?.[0]?.firm_id) campaigns[idx].firm_id = verifyRows[0].firm_id;
      }
    }
    document.getElementById('m-takvim-settings')?.remove();
    toast(applyAll ? 'Takvim ayarları tüm kampanyalara uygulandı ✓' : 'Takvim ayarları kaydedildi ✓', 'ok');
    if (takvimCampId) await loadTakvimSlots();
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

function openBulkSlotModal() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  openModal('m-bulk-slot');
}

async function saveBulkSlots() {
  const days = [...document.querySelectorAll('.bulk-day.active')].map(b=>parseInt(b.dataset.d));
  if (!days.length) { toast('En az 1 gün seçin','err'); return; }
  const count = parseInt(document.getElementById('bulk-count').value);
  const st = document.getElementById('bulk-start').value||'10:00';
  const [sh,sm] = st.split(':').map(Number);
  const hours = Array.from({length:count},(_,i)=>String(sh+i*2).padStart(2,'0')+':'+String(sm).padStart(2,'0'));
  const monday = takvimGetMonday(takvimDate);
  const slots = [];
  days.forEach(d=>{
    const dt = new Date(monday); dt.setDate(dt.getDate()+(d-1));
    const ds = takvimFmtD(dt);
    hours.forEach(h=>slots.push({campaign_id:takvimCampId,firm_id:currentUser.firm_id,tarih:ds,baslangic_saat:h,bitis_saat:takvimAddHours(h,takvimSlotDurHours()),durum:'bos',gun_kapali:false}));
  });
  try {
    await sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify(slots)});
    closeModal('m-bulk-slot');
    await loadTakvimSlots();
    toast(`${slots.length} slot eklendi ✓`,'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function takvimAdminRandevuEkle(slot) {
  if (!slot || slot.durum !== 'bos' || slot.gun_kapali) return;
  _bookingSlot = slot;
  openTakvimBookForm(slot);
}

async function takvimAdminKilitle(slot) {
  if (!slot || slot.durum !== 'bos' || slot.gun_kapali) return;
  if (!['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '')) return;
  try {
    await sb(`takvim_slots?id=eq.${slot.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        durum: 'kilitli',
        kilitli_agent_id: currentUser.id,
        kilitli_at: new Date().toISOString()
      })
    });
    await loadTakvimSlots();
    toast('Slot kilitlendi ✓', 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function openTakvimChangeCampaignModal(slot, appt) {
  if (!['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '')) return;
  document.getElementById('m-takvim-change-campaign')?.remove();
  const firmId = appt?.firm_id || slot?.firm_id || currentUser?.firm_id;
  if (!firmId) {
    toast('Firma bilgisi eksik', 'err');
    return;
  }
  let rows =
    typeof campaigns !== 'undefined' && Array.isArray(campaigns)
      ? campaigns.filter(
          (c) =>
            String(c.firm_id || '') === String(firmId) &&
            String(c.status || 'active').toLowerCase() === 'active'
        )
      : [];
  if (!rows.length) {
    rows = (await sb(`campaigns?firm_id=eq.${firmId}&status=eq.active&select=id,name&order=name.asc`).catch(() => [])) || [];
  }
  if (!rows.length) {
    toast('Aktif kampanya bulunamadı', 'warn');
    return;
  }
  const cur = String(appt?.campaign_id || slot?.campaign_id || takvimCampId || '');
  const m = document.createElement('div');
  m.id = 'm-takvim-change-campaign';
  m.className = 'modal-overlay open';
  m.innerHTML =
    '<div class="modal" style="max-width:420px;">' +
    '<div class="modal-hdr"><div class="modal-title">Kampanya değiştir</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-change-campaign\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">' +
    '<div class="form-row"><label class="form-label">Yeni kampanya</label>' +
    '<select class="form-input" id="tcc-sel">' +
    rows
      .map((c) => {
        const nm = String(c.name || '').replace(/[<>&"']/g, '');
        return `<option value="${c.id}" ${String(c.id) === cur ? 'selected' : ''}>${nm}</option>`;
      })
      .join('') +
    '</select></div>' +
    '<div style="font-size:11px;color:var(--text-3);">Randevu ve bu slot aynı kampanyaya bağlanır.</div></div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-change-campaign\')?.remove()">İptal</button>' +
    `<button type="button" class="btn btn-primary" onclick="takvimSaveChangeCampaign('${slot.id}','${appt.id}')">Kaydet</button>` +
    '</div></div>';
  document.body.appendChild(m);
}

async function takvimSaveChangeCampaign(slotId, apptId) {
  const sel = document.getElementById('tcc-sel');
  const newId = sel?.value;
  if (!newId) {
    toast('Kampanya seçin', 'warn');
    return;
  }
  try {
    await sb(`appointments?id=eq.${apptId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ campaign_id: newId })
    });
    await sb(`takvim_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ campaign_id: newId })
    });
    document.getElementById('m-takvim-change-campaign')?.remove();
    toast('Kampanya güncellendi ✓', 'ok');
    await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

function _takvimAddDays(dateObj, deltaDays) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + deltaDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Taşıma hedefi için ekrandaki haftadan bağımsız geniş aralıkta boş slotlar */
async function takvimFetchEmptySlotsForMove(campaignId, centerDate) {
  const c = centerDate instanceof Date ? new Date(centerDate) : new Date(centerDate);
  if (Number.isNaN(c.getTime())) c.setTime(Date.now());
  c.setHours(0, 0, 0, 0);
  const startD = takvimFmtD(_takvimAddDays(c, -42));
  const endD = takvimFmtD(_takvimAddDays(c, 84));
  const q = `takvim_slots?campaign_id=eq.${campaignId}&durum=eq.bos&gun_kapali=eq.false&tarih=gte.${startD}&tarih=lte.${endD}&order=tarih.asc,baslangic_saat.asc&select=id,tarih,baslangic_saat,bitis_saat,campaign_id,durum,gun_kapali,alta_tasindi,appointment_id`;
  const rows = await sb(q);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(
    (s) =>
      s &&
      s.durum === 'bos' &&
      !s.gun_kapali &&
      !s.alta_tasindi &&
      (s.appointment_id == null || s.appointment_id === '')
  );
}

async function takvimExecuteMoveAppointment(fromSlotId, toSlotId, apptId) {
  const chk = await sb(`takvim_slots?id=eq.${toSlotId}&select=id,durum,appointment_id&limit=1`);
  const t = chk?.[0];
  if (!t || t.durum !== 'bos' || (t.appointment_id != null && String(t.appointment_id) !== '')) {
    toast('Hedef slot artık uygun değil; takvimi yenileyin.', 'warn');
    return false;
  }
  const srcRows = await sb(`takvim_slots?id=eq.${fromSlotId}&select=id,durum,appointment_id&limit=1`);
  const s0 = srcRows?.[0];
  if (!s0 || s0.durum !== 'dolu' || String(s0.appointment_id || '') !== String(apptId)) {
    toast('Kaynak slot güncellenmiş; takvimi yenileyin.', 'warn');
    return false;
  }
  const emptyPatch = {
    durum: 'bos',
    appointment_id: null,
    alta_tasindi: false,
    kilitli_agent_id: null,
    kilitli_at: null
  };
  const fillPatch = {
    durum: 'dolu',
    appointment_id: apptId,
    alta_tasindi: false,
    kilitli_agent_id: null,
    kilitli_at: null
  };
  try {
    await sb(`takvim_slots?id=eq.${fromSlotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(emptyPatch)
    });
    await sb(`takvim_slots?id=eq.${toSlotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(fillPatch)
    });
    return true;
  } catch (e) {
    try {
      await sb(`takvim_slots?id=eq.${fromSlotId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(fillPatch)
      });
    } catch (_) {}
    toast('Taşıma hatası: ' + e.message, 'err');
    return false;
  }
}

function takvimStartMovePickFromModal(fromSlotId, apptId, campaignId) {
  document.getElementById('m-takvim-move-appt')?.remove();
  window._takvimMovePick = { fromSlotId, apptId, campaignId: String(campaignId || '') };
  document.body.classList.add('takvim-move-pick');
  toast('Taşımak için aynı kampanyadaki boş slota tıklayın.', 'ok');
}

async function openTakvimMoveAppointmentModal(slot, appt) {
  if (!['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '')) return;
  document.getElementById('m-takvim-move-appt')?.remove();
  const camp = String(slot.campaign_id || takvimCampId || '');
  if (!camp) {
    toast('Kampanya bilgisi yok', 'warn');
    return;
  }
  const sid = slot.id;
  const aid = appt.id;
  const m = document.createElement('div');
  m.id = 'm-takvim-move-appt';
  m.className = 'modal-overlay open';
  m.innerHTML =
    '<div class="modal" style="max-width:440px;">' +
    '<div class="modal-hdr"><div class="modal-title">Randevuyu taşı</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-move-appt\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;" id="tma-body">' +
    '<div style="font-size:13px;color:var(--text-2);">Boş slotlar yükleniyor…</div></div>' +
    '<div class="modal-footer" id="tma-footer" style="display:none;">' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-move-appt\')?.remove()">İptal</button>' +
    `<button type="button" class="btn btn-primary" onclick="takvimSaveMoveAppointment('${sid}','${aid}')">Taşı</button>` +
    '</div></div>';
  document.body.appendChild(m);
  let center = takvimDate;
  if (slot.tarih && /^\d{4}-\d{2}-\d{2}$/.test(String(slot.tarih))) {
    const p = String(slot.tarih).split('-').map(Number);
    center = new Date(p[0], p[1] - 1, p[2]);
    center.setHours(0, 0, 0, 0);
  }
  let targets = [];
  try {
    targets = (await takvimFetchEmptySlotsForMove(camp, center)).filter((s) => s.id !== sid);
  } catch (e) {
    const body = document.getElementById('tma-body');
    if (body) body.innerHTML = `<div style="color:var(--red);font-size:13px;">Yüklenemedi: ${String(e.message || e)}</div>`;
    return;
  }
  const body = document.getElementById('tma-body');
  const footer = document.getElementById('tma-footer');
  if (!targets.length) {
    if (body) {
      body.innerHTML =
        '<div style="font-size:13px;color:var(--text-2);line-height:1.45;">Bu tarih aralığında uygun boş slot bulunamadı. İsterseniz takvimde bir boş slota tıklayarak taşıyın.</div>' +
        `<div style="margin-top:12px;"><button type="button" class="btn btn-primary" onclick="takvimStartMovePickFromModal('${sid}','${aid}','${camp}')">Takvimde seç</button></div>`;
    }
    if (footer) footer.style.display = 'none';
    return;
  }
  const byDate = new Map();
  targets.forEach((s) => {
    const k = s.tarih || '';
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(s);
  });
  let opts = '';
  for (const [d, arr] of byDate) {
    opts +=
      `<optgroup label="${d}">` +
      arr
        .map(
          (s) =>
            `<option value="${s.id}">${String(s.baslangic_saat || '').slice(0, 5)}–${String(s.bitis_saat || '').slice(0, 5)}</option>`
        )
        .join('') +
      '</optgroup>';
  }
  if (body) {
    body.innerHTML =
      '<div class="form-row"><label class="form-label">Hedef boş slot</label>' +
      '<select class="form-input" id="tma-sel">' +
      opts +
      '</select></div>' +
      '<div style="font-size:11px;color:var(--text-3);">Aynı kampanya; yakın tarihlerdeki boş slotlar (ekrandaki haftadan geniş). Mevcut slot boşalır.</div>' +
      `<div style="margin-top:10px;"><button type="button" class="btn btn-ghost" onclick="takvimStartMovePickFromModal('${sid}','${aid}','${camp}')">Takvimde tıkla</button></div>`;
  }
  if (footer) footer.style.display = '';
}

async function takvimSaveMoveAppointment(fromSlotId, apptId) {
  const toId = document.getElementById('tma-sel')?.value;
  if (!toId) {
    toast('Hedef slot seçin', 'warn');
    return;
  }
  if (!(await mbConfirm('Randevu seçilen boş slota taşınsın mı?', 'Randevuyu taşı'))) return;
  const ok = await takvimExecuteMoveAppointment(fromSlotId, toId, apptId);
  if (!ok) return;
  takvimClearMovePickMode();
  document.getElementById('m-takvim-move-appt')?.remove();
  await loadTakvimSlots();
  toast('Randevu taşındı ✓', 'ok');
}

