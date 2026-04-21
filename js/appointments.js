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
  if (!isAdmin) setInterval(checkActiveCampaignNotif, 30000);
  checkActiveCampaignNotif();
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
      b.style.background = x === v ? 'var(--accent)' : 'transparent';
      b.style.color = x === v ? '#fff' : 'var(--text-2)';
    }
    const bo = document.getElementById(`tvo-${x}`);
    if (bo) {
      bo.style.background = x === v ? 'var(--accent)' : 'transparent';
      bo.style.color = x === v ? '#fff' : 'var(--text-2)';
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

function renderTakvimGrid() {
  const grid = document.getElementById(window._takvimGridId || 'takvim-grid');
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
  const locale = currentLang==='de' ? 'de-DE' : 'tr-TR';
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
  let h = `<div class="takvim-week-grid-inner" data-takvim-hrs="${numHrs}" data-takvim-hdr="${headerRowPx}" style="display:grid;width:100%;min-height:0;box-sizing:border-box;grid-template-columns:52px repeat(${daysCount},minmax(0,1fr));grid-template-rows:${headerRowPx}px repeat(${numHrs},${rowH}px);">`;
  h += '<div style="background:var(--bg-3);border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:8px 4px;"></div>';
  for (let d=0; d<daysCount; d++) {
    const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
    const ds = takvimFmtD(dt);
    const isToday = dt.toDateString()===new Date().toDateString();
    const isClosed = takvimClosedDays[ds];
    const click = isAdmin ? `onclick="takvimHeaderClick('${ds}')"` : '';
    const wdShort = dt.toLocaleDateString(locale, { weekday: 'short' });
    h += `<div style="background:${isClosed?'rgba(220,38,38,.08)':isToday?'rgba(37,99,235,.06)':'var(--bg-3)'};border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:6px 4px;text-align:center;font-size:10px;font-weight:800;color:${isClosed?'var(--red)':isToday?'var(--accent)':'var(--text-2)'};cursor:${isAdmin?'pointer':'default'}" ${click}>${wdShort}<br><span style="font-size:13px;font-weight:900;">${dt.getDate()}</span></div>`;
  }
  for (let hr = shH; hr <= endH; hr++) {
    const hh = String(hr).padStart(2,'0');
    h += `<div style="min-height:0;background:var(--bg-2);border-bottom:1px solid var(--border);border-right:1px solid var(--border);font-size:9px;font-weight:700;color:var(--text-3);text-align:center;padding-top:4px;font-family:var(--mono);display:flex;align-items:flex-start;justify-content:center;">${hh}:00</div>`;
    for (let d=0; d<daysCount; d++) {
      const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
      const ds = takvimFmtD(dt);
      const isClosed = takvimClosedDays[ds];
      const dayKey = takvimDayKeyFromDate(dt);
      const colActive = activeSet.has(dayKey);
      const canClick = isAdmin && !isClosed && colActive;
      const click = canClick ? `onclick="takvimCellClick('${ds}','${hh}',event)"` : '';
      let bg = isClosed ? 'repeating-linear-gradient(-45deg,rgba(220,38,38,.06),rgba(220,38,38,.06) 4px,rgba(220,38,38,.1) 4px,rgba(220,38,38,.1) 8px)' : '';
      if (!colActive && !isClosed) bg = 'repeating-linear-gradient(-45deg,rgba(100,116,139,.06),rgba(100,116,139,.06) 4px,rgba(100,116,139,.1) 4px,rgba(100,116,139,.1) 8px)';
      h += `<div id="tc_${ds}_${hh}" style="min-height:0;height:100%;position:relative;border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:${bg};${canClick?'cursor:pointer;':''}" ${click}></div>`;
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
  const y=takvimDate.getFullYear(), m=takvimDate.getMonth(), locale=currentLang==='de'?'de-DE':'tr-TR';
  const tset = getCampaignTakvimSettings();
  const showWeekend = tset.active_days.includes('cmt') || tset.active_days.includes('paz');
  const dNames = showWeekend
    ? (currentLang==='de' ? ['Mo','Di','Mi','Do','Fr','Sa','So'] : ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'])
    : (currentLang==='de' ? ['Mo','Di','Mi','Do','Fr'] : ['Pzt','Sal','Çar','Per','Cum']);
  const cols = showWeekend ? 7 : 5;
  let h = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);">`;
  dNames.forEach(d => h += `<div style="background:var(--bg-3);padding:6px;text-align:center;font-size:10px;font-weight:800;color:var(--text-2);border-bottom:1px solid var(--border);">${d}</div>`);
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
      h += `<div id="mc_${ds}" style="min-height:80px;background:${other?'var(--bg)':'var(--bg-2)'};border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:4px;overflow:hidden;"><div style="font-size:11px;font-weight:800;color:${today?'var(--accent)':'var(--text-3)'};text-align:right;">${cur.getDate()}</div><div id="ms_${ds}" style="display:flex;flex-direction:column;gap:2px;overflow:hidden;"></div></div>`;
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
        const cell = document.getElementById(`tc_${dateStr}_${hour}`);
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
    const el = document.getElementById(`ms_${s.tarih}`);
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
<button type="button" class="btn-tak-dist" title="Mesafe: Dialer müşterisi → bu termin" onclick="event.stopPropagation();measureSlotDistance('${slotId}')"><i class="ph ph-map-pin" style="font-size:12px;"></i></button>
<button type="button" class="btn-tak-dist" title="Bu terminden diğer terminlere uzaklık" onclick="event.stopPropagation();toggleTakvimDistAll('${slotId}')"><i class="ph ph-path" style="font-size:12px;"></i></button>
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
  const pl = canShift ? 32 : dense ? 4 : 6;
  const pt = dense ? 4 : 6;
  const pb =
    slot.durum === 'dolu' && appt ? 24 : canShift ? 6 : dense ? 4 : 6;
  el.style.cssText = `border-radius:5px;padding:${pt}px ${pr}px ${pb}px ${pl}px;font-size:${fzBase}px;cursor:pointer;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.15);background:${vis.background};color:${vis.color};transition:.15s;text-align:left;`;
  el.onmouseover = () => { el.style.transform = 'scale(1.02)'; };
  el.onmouseout = () => { el.style.transform = ''; };
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
    el.innerHTML = `<div style="font-weight:700;">🔒 ${slot.baslangic_saat.slice(0,5)}</div>`;
    el.style.color = '#1e40af';
    el.onclick = (ev) => ev.stopPropagation();
  } else if (appt) {
    const show = isAdmin || appt.agent_id===currentUser?.id;
    let plzLine = '';
    if (_takvimMeasureFromPlz && appt?.plz) {
      const r = _takvimMeasureCache[`${_takvimMeasureFromPlz}_${appt.plz}`];
      if (r) plzLine = `<div style="font-size:8px;font-weight:700;color:#dbeafe;margin-top:2px;">📏 ${r.km} km · ${r.min} dk</div>`;
    }
    let distAllHtml = '';
    if (!plzLine && _takvimDistAllOriginId && _takvimDistAllOriginId !== slot.id && slot.durum === 'dolu') {
      const origin = takvimSlots.find((x) => x.id === _takvimDistAllOriginId);
      const oa = takvimAppts.find((a) => a.id === origin?.appointment_id);
      if (oa?.plz && appt?.plz) {
        const r = _takvimPlzRouteCache[`${oa.plz}_${appt.plz}`];
        if (r) distAllHtml = `<div style="font-size:7px;font-weight:700;color:#fce7f3;margin-top:1px;">↔ ${r.km} km · ${r.min} dk</div>`;
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
    toast('Slot oluşturuldu ✓', 'ok');
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
  document.getElementById('takvim-detail-title').textContent = 'Yeni Slot';
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
    toast('Slot oluşturuldu ✓','ok');
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
    footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
${isAdmin?`<button class="btn btn-ghost" style="color:var(--red);" onclick="deleteTakvimSlot('${slot.id}')">Sil</button>${slot.durum==='kilitli'?`<button class="btn btn-ghost" style="color:var(--yellow);" onclick="closeModal('m-takvim-detail');unlockSlot('${slot.id}')">Kilidi Kaldır</button>`:''}`:`<button class="btn btn-primary" onclick="closeModal('m-takvim-detail');lockAndBookSlot(takvimSlots.find(s=>s.id==='${slot.id}'))">Termin Al</button>`}`;
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
    toast('Termin güncellendi ✓', 'ok');
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
  if (!(await mbConfirm('Terminini iptal etmek istediğine emin misin?', 'Termin İptali'))) return;
  try {
    await sb(`appointments?id=eq.${apptId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'iptal'})});
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',appointment_id:null})});
    await loadTakvimSlots();
    toast('Termin iptal edildi','ok');
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
  // If we're in dialer context, show termin section instead of popup
  // Agent, dialer sayfasındayken takvim overlay'inden slot seçti
  const inDialerCtx = typeof onAgentSlotSelected === 'function' && typeof dialerStatus !== 'undefined';
  if (inDialerCtx) {
    // Overlay'i kapat
    const _ov = document.getElementById('takvim-popup-overlay');
    if (_ov) _ov.classList.remove('open');
    // Termin formunu göster (navigate gereksiz — onAgentSlotSelected UI'yı yönetiyor)
    onAgentSlotSelected(slot);
  } else {
    openTakvimBookForm(slot);
  }
}

async function openTakvimBookForm(slot) {
  const contact = currentContact||{};
  const custCtx = await _getCustomerCtx(null);
  document.getElementById('takvim-detail-title').textContent = `Termin — ${slot.tarih} ${slot.baslangic_saat?.slice(0,5)}`;
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="background:var(--bg-3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:12px;font-weight:600;">📅 ${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)}–${slot.bitis_saat?.slice(0,5)}</div>
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
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="cancelTakvimBook('${slot.id}')">İptal</button><button class="btn btn-primary" onclick="submitTakvimBook('${slot.id}')">✓ Kaydet</button>`;
}

// Save termin directly from the inline termin-fields-section
async function saveTerminFromSection() {
  const slot = _bookingSlot || window._selectedBookingSlot;
  if (!slot) { toast('Önce takvimden bir slot seçin','err'); return; }
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf2-customer')) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  if (!g('tf2-hausart')||!g('tf2-baujahr')||!g('tf2-qm')||!g('tf2-heizung')||!g('tf2-alter_der_heizung')) {
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
    toast('Termin kaydedildi ✓','ok');
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
    toast('Termin kaydedildi ✓','ok');
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
  const bosDisp = /^#[0-9A-Fa-f]{6}$/i.test(String(cfg.bos_color || '').trim()) ? String(cfg.bos_color).trim() : '#3b82f6';
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
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn" data-tab="view" onclick="setTakvimSettingsTab('view')">Görünüm / Onay</button>
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

<div id="ts-tab-view" class="ts-tab-pane" style="display:none;flex-direction:column;gap:14px;">
<div class="form-row">
<label class="form-label">Boş slot rengi</label>
<input type="color" class="form-input" id="ts-bos-color" value="${bosDisp}" style="width:72px;height:40px;padding:2px;">
</div>
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Termin Sonuç Renkleri (Takvim + QC)</div>
<div id="ts-result-color-rows" style="display:flex;flex-direction:column;gap:8px;"></div>
<div style="font-size:10px;color:var(--text-3);margin-top:4px;">Buradaki renkler “Termin Sonuçları (Takvim + QC)” ile aynıdır.</div>
</div>
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
  await renderTakvimSettingsResultColorRows(resolvedFirmId);
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
  const activeDays = [...document.querySelectorAll('.ts-day-btn.active')].map(b=>b.dataset.d);
  if (!activeDays.length) { toast('En az bir çalışma günü seçin', 'warn'); return; }
  const start    = document.getElementById('ts-start')?.value    || '08:00';
  const end      = document.getElementById('ts-end')?.value      || '20:00';
  const dur      = parseInt(document.getElementById('ts-slot-dur')?.value||'2');
  const maxSlots = parseInt(document.getElementById('ts-max-slots')?.value||'5');
  const bosColor = document.getElementById('ts-bos-color')?.value || '#3b82f6';
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
    const colorInputs = [...document.querySelectorAll('#m-takvim-settings .ts-result-color')];

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
    if (fid && colorInputs.length) {
      const firmRows = await loadFirmAppointmentResults(fid, true).catch(() => defaultAppointmentResults());
      const map = {};
      colorInputs.forEach((el) => {
        const key = String(el.dataset.key || '').trim();
        const val = String(el.value || '').trim();
        if (key && /^#[0-9A-Fa-f]{6}$/.test(val)) map[key] = val;
      });
      const patchedRows = (firmRows || []).map((r) => ({ ...r, color: map[r.key] || r.color }));
      const firms = await sb(`firms?id=eq.${fid}&select=settings`);
      const existingFirmSettings = _objOrEmpty(firms?.[0]?.settings);
      await sb(`firms?id=eq.${fid}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...existingFirmSettings, appointment_results: patchedRows } })
      });
      const reloaded = await loadFirmAppointmentResults(fid, true).catch(() => patchedRows);
      window._apptResultsByFirm[fid] = reloaded;
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

// ── Context menu ──────────────────────────────
function showSlotContextMenu(e, slot, appt) {
  e.preventDefault(); e.stopPropagation();
  _ctxSlot = slot; _ctxAppt = appt;
  const old = document.getElementById('slot-ctx-menu');
  if (old) old.remove();
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const isDolu = slot.durum === 'dolu' && appt;
  const items = [];
  if (window._takvimMovePick) {
    items.push({ icon: '', label: 'Taşımayı iptal', onClick: () => takvimClearMovePickMode(), yellow: true });
    items.push({ sep: true });
  }
  const isMySlot = slot.kilitli_agent_id === currentUser?.id;
  if (slot.durum === 'bos') {
    if (!isAdmin) items.push({ icon:'', label:'Termin Al', onClick: () => lockAndBookSlot(_ctxSlot) });
    if (isAdmin) items.push({ icon:'', label:'Detay', onClick: () => openTakvimSlotDetail(_ctxSlot, null) });
    if (isAdmin) items.push({ icon:'', label:'Randevu ekle', onClick: () => takvimAdminRandevuEkle(_ctxSlot) });
    if (isAdmin) items.push({ icon:'', label:'Kilitle', onClick: () => takvimAdminKilitle(_ctxSlot), yellow:true });
    if (isAdmin) items.push({ icon:'', label:'Sil', onClick: () => deleteTakvimSlot(_ctxSlot.id), danger:true });
  }
  if (slot.durum === 'kilitli') {
    // Admin can see who locked and unlock
    if (isAdmin) {
      const agentName = slot.kilitli_agent_id || 'Bilinmiyor';
      items.push({ icon:'', label:`Kilitleyen: ${agentName}`, onClick: null });
      items.push({ icon:'', label:'Kilidi Kaldır', onClick: () => unlockSlot(slot.id), yellow:true });
    }
    // Agent can cancel their own lock
    if (isMySlot) {
      items.push({ icon:'', label:'Termini İptal Et', onClick: () => unlockSlot(slot.id), danger:true });
    }
  }
  const canManageAppt = ['admin','super_admin','firm_admin','qc'].includes(currentUser?.role||'');
  if (isDolu) {
    items.push({ icon:'', label:'Detaya Git (Dialer)', onClick: () => openDialerForContact(_ctxAppt.contact_id) });
    items.push({ icon:'', label:'Slot Detayı', onClick: () => openTakvimSlotDetail(_ctxSlot, _ctxAppt) });
    if (isAdmin) items.push({ icon:'', label:'Sahaya Ata', onClick: () => openFieldAssignModal(_ctxAppt.id, _ctxAppt.firm_id) });
    if (isAdmin) {
      items.push({ icon:'', label:'Kampanya değiştir', onClick: () => openTakvimChangeCampaignModal(_ctxSlot, _ctxAppt) });
      items.push({ icon:'', label:'Randevuyu taşı', onClick: () => openTakvimMoveAppointmentModal(_ctxSlot, _ctxAppt) });
    }
    if (isAdmin || canManageAppt) {
      items.push({ sep: true });
      const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
      const rows = (fid && window._apptResultsByFirm?.[fid]) || (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const hex = (r.color || '#64748b').replace(/\s/g, '');
        items.push({
          icon: '',
          label: r.label || r.key,
          hexColor: hex,
          onClick: () => takvimQcUpdate(_ctxAppt.id, r.key)
        });
      });
    }
    if (isAdmin) {
      items.push({ sep: true });
      items.push({ icon:'', label:'Alta Taşı', onClick: () => slotAltaTasi(_ctxSlot.id), yellow:true });
      items.push({ icon:'', label:'Slotu Sil', onClick: () => deleteTakvimSlot(_ctxSlot.id), danger:true });
    }
    // Agent can cancel their own appointment if not yet confirmed
    if (!isAdmin && appt?.agent_id === currentUser?.id && appt?.durum === 'qc_bekleniyor') {
      items.push({ sep: true });
      items.push({ icon:'', label:'Termimi İptal Et', onClick: () => agentCancelAppt(slot.id, appt.id), danger:true });
    }
  }
  if (!items.length) return;
  const menu = document.createElement('div');
  menu.id = 'slot-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.2);padding:6px;min-width:180px;font-size:12px;';
  if (!document.getElementById('ctx-style')) {
    const s = document.createElement('style');
    s.id = 'ctx-style';
    s.textContent = '@keyframes ctxFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(s);
  }
  items.forEach(item => {
    if (item.sep) {
      const hr = document.createElement('div');
      hr.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
      menu.appendChild(hr); return;
    }
    const btn = document.createElement('button');
    const baseColor = item.hexColor
      ? item.hexColor
      : item.danger
        ? 'var(--red)'
        : item.green
          ? 'var(--green)'
          : item.yellow
            ? 'var(--yellow)'
            : 'var(--text)';
    btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:12px;color:${baseColor};text-align:left;transition:.12s;`;
    btn.innerHTML = `<span style="font-size:14px;">${item.icon}</span><span style="font-weight:600;">${item.label}</span>`;
    btn.onmouseover = () => btn.style.background = 'var(--bg-3)';
    btn.onmouseout  = () => btn.style.background = 'transparent';
    btn.onclick = (ev) => {
      ev.stopPropagation();
      menu.remove();
      if (typeof item.onClick === 'function') item.onClick();
    };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const mw=menu.offsetWidth, mh=menu.offsetHeight, vw=window.innerWidth, vh=window.innerHeight;
  let x=e.clientX+4, y=e.clientY+4;
  if (x+mw>vw-8) x=e.clientX-mw-4;
  if (y+mh>vh-8) y=e.clientY-mh-4;
  menu.style.left=x+'px'; menu.style.top=y+'px';
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
    document.addEventListener('contextmenu', () => menu.remove(), { once: true });
  }, 50);
}

async function slotAltaTasi(slotId) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({alta_tasindi: true, durum: 'dolu'})});
    await loadTakvimSlots();
    toast('Slot alta taşındı', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// ── Drag & Drop ───────────────────────────────
function initSlotDrag(el, slot, appt) {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const canDrag = isAdmin && (slot.durum === 'bos' || (slot.durum === 'dolu' && appt));
  if (!canDrag) return;
  el.draggable = true; el.style.cursor = 'grab';
  el.addEventListener('dragstart', e => {
    if (
      e.target.closest &&
      (e.target.closest('.tak-slot-move') ||
        e.target.closest('.tak-slot-dist') ||
        e.target.closest('.tak-slot-add-wrap'))
    ) {
      e.preventDefault();
      return;
    }
    _dragSlot = slot; _dragOrigCell = el.parentElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', slot.id);
    el.style.opacity = '0.4'; _dragGhost = el;
    document.querySelectorAll('[id^="tc_"]').forEach(cell => { cell.classList.add('drag-target'); });
  });
  el.addEventListener('dragend', () => {
    el.style.opacity = '1'; el.style.cursor = 'grab';
    document.querySelectorAll('.drag-target').forEach(c => { c.classList.remove('drag-target','drag-over'); c.style.background = ''; });
    _dragSlot = null; _dragGhost = null;
  });
}

function setupDropZones() {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (!isAdmin) return;
  document.querySelectorAll('[id^="tc_"]').forEach(cell => {
    cell.addEventListener('dragover', e => {
      if (!_dragSlot) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drag-over').forEach(c => { c.classList.remove('drag-over'); c.style.background = ''; });
      cell.classList.add('drag-over'); cell.style.background = 'rgba(37,99,235,.15)';
    });
    cell.addEventListener('dragleave', e => { cell.classList.remove('drag-over'); cell.style.background = ''; });
    cell.addEventListener('drop', async e => {
      e.preventDefault(); cell.classList.remove('drag-over'); cell.style.background = '';
      if (!_dragSlot) return;
      const parts = cell.id.replace('tc_','').split('_');
      const newDate = parts.slice(0,-1).join('_');
      const newHour = parts[parts.length-1];
      const newStart = `${newHour}:00`;
      const [sh,sm] = _dragSlot.baslangic_saat.split(':').map(Number);
      const [eh,em] = _dragSlot.bitis_saat.split(':').map(Number);
      const durMin = (eh*60+em)-(sh*60+sm);
      const newStartMin = parseInt(newHour)*60;
      const newEndMin = newStartMin + durMin;
      const newEnd = String(Math.floor(newEndMin/60)).padStart(2,'0')+':'+String(newEndMin%60).padStart(2,'0');
      if (newDate === _dragSlot.tarih && newStart === _dragSlot.baslangic_saat) return;
      try {
        await sb(`takvim_slots?id=eq.${_dragSlot.id}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({tarih: newDate, baslangic_saat: newStart, bitis_saat: newEnd})});
        await loadTakvimSlots();
        toast(`Slot taşındı: ${newDate} ${newStart}`, 'ok');
      } catch(e2) { toast('Taşıma hatası: '+e2.message, 'err'); }
    });
  });
}

function renderTakvimFailed() {
  const sec = document.getElementById(window._takvimFailedSecId || 'takvim-failed-section');
  const grid = document.getElementById(window._takvimFailedGridId || 'takvim-failed-grid');
  if (!sec || !grid) return;
  const failed = takvimSlots.filter((s) => s.alta_tasindi);
  const [rangeStart, rangeEnd] = takvimVisibleDateRange();
  const byDay = {};
  failed.forEach((s) => {
    const ds = s.tarih;
    if (ds < rangeStart || ds > rangeEnd) return;
    if (!byDay[ds]) byDay[ds] = [];
    byDay[ds].push(s);
  });
  const dayKeys = [];
  takvimEachDayInRange(rangeStart, rangeEnd, (ds) => dayKeys.push(ds));
  const hasAny = dayKeys.some((ds) => (byDay[ds] || []).length);
  sec.style.display = hasAny ? '' : 'none';
  if (!hasAny) {
    grid.innerHTML = '';
    return;
  }
  const locale = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  const n = dayKeys.length;
  let h = `<div style="display:grid;grid-template-columns:52px repeat(${n},minmax(0,1fr));width:100%;box-sizing:border-box;">`;
  h += '<div style="border-right:1px solid var(--border);"></div>';
  dayKeys.forEach((ds) => {
    const dt = new Date(ds + 'T12:00:00');
    const head = dt.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
    h += `<div style="font-size:9px;font-weight:800;color:var(--text-3);text-align:center;padding:0 4px 4px;border-right:1px solid var(--border);">${head}</div>`;
  });
  h += '<div style="border-right:1px solid var(--border);"></div>';
  dayKeys.forEach((ds) => {
    const items = byDay[ds] || [];
    h += `<div style="display:flex;flex-direction:column;gap:4px;min-width:0;border-right:1px solid var(--border);padding:0 6px;">`;
    items.forEach((s) => {
      const appt = takvimAppts.find((a) => a.id === s.appointment_id);
      const nm = appt ? appt.nachname : '—';
      const fv = getSlotGradientAndText(s, appt);
      h += `<div onclick="openTakvimSlotDetail(takvimSlots.find(x=>x.id==='${s.id}'),takvimAppts.find(a=>a.id==='${s.appointment_id}'))" style="font-size:9px;font-weight:700;padding:4px 6px;border-radius:4px;cursor:pointer;background:${fv.background};color:${fv.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⬆ ${nm}</div>`;
    });
    h += `</div>`;
  });
  h += '</div>';
  grid.innerHTML = h;
}

async function checkActiveCampaignNotif() {
  if (!currentUser?.firm_id) return;
  try {
    const camps = await sb(`campaigns?firm_id=eq.${currentUser.firm_id}&active_for_agents=eq.true&order=updated_at.desc&limit=1`).catch(()=>[]);
    if (!camps?.length) return;
    const camp = camps[0];
    const lastTs = parseInt(localStorage.getItem('mb_notif_ts')||'0');
    if (camp.notif_ts && camp.notif_ts > lastTs) {
      localStorage.setItem('mb_notif_ts', String(camp.notif_ts));
      showCampNotif(camp);
    }
    if (!takvimCampId && camp.id) takvimCampId = camp.id;
  } catch(e) {}
}

function showCampNotif(camp) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  ov.innerHTML = `<div style="background:var(--bg-2);border:2px solid var(--accent);border-radius:16px;padding:32px 40px;text-align:center;max-width:400px;width:90vw;">
<div style="font-size:40px;margin-bottom:12px;">📢</div>
<div style="font-size:18px;font-weight:900;color:var(--accent);margin-bottom:8px;">Aktif Kampanya</div>
<div style="font-size:16px;font-weight:700;padding:10px 16px;background:var(--bg-3);border-radius:8px;margin-bottom:20px;">${camp.name}</div>
${camp.notif_message?`<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">${camp.notif_message}</div>`:''}
<button onclick="this.closest('[style*=fixed]').remove();navigate('takvim');" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">📅 Takvime Git</button>
<button onclick="this.closest('[style*=fixed]').remove();" style="width:100%;padding:10px;background:transparent;color:var(--text-2);border:none;font-size:12px;cursor:pointer;margin-top:8px;">Kapat</button>
</div>`;
  document.body.appendChild(ov);
}

// ── TomTom mesafe / rota ──────────────────────
async function calcTomTomDistance(from, to) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !from || !to) return null;
  try {
    const enc = (s) => encodeURIComponent(s);
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${enc(from)}:${enc(to)}/json?key=${tk}&travelMode=car`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const meters = data?.routes?.[0]?.summary?.lengthInMeters;
    if (!meters) return null;
    return meters < 1000 ? `${meters}m` : `${(meters/1000).toFixed(1)}km`;
  } catch(e) { return null; }
}

async function geocodeTomTom(query) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !String(query || '').trim()) return null;
  try {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${tk}&countrySet=DE&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.position || null;
  } catch (_) { return null; }
}

async function routeTomTomCoords(p1, p2) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !p1?.lat || !p2?.lat) return null;
  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${p1.lat},${p1.lon}:${p2.lat},${p2.lon}/json?key=${tk}&travelMode=car`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const s = data?.routes?.[0]?.summary;
    if (!s) return null;
    return { d: s.lengthInMeters, t: s.travelTimeInSeconds };
  } catch (_) { return null; }
}

async function measureSlotDistance(slotId) {
  const slot = takvimSlots.find((s) => s.id === slotId);
  const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
  const el = document.getElementById(`dist-${slotId}`);
  if (!slot || !appt) {
    toast('Bu slotta randevu yok', 'warn');
    return;
  }
  if (!currentContact || (!currentContact.address && !currentContact.plz)) {
    toast('Dialer\'da açık müşteri veya adres/PLZ yok', 'warn');
    return;
  }
  if (el) el.textContent = '…';
  const fromAddr = [currentContact.address, currentContact.plz, currentContact.city, 'Germany'].filter(Boolean).join(', ');
  const toAddr = [appt.strasse, appt.plz, appt.ortschaft, 'Germany'].filter(Boolean).join(', ');
  const dist = await calcTomTomDistance(fromAddr, toAddr);
  if (el) el.textContent = dist ? `📍 ${dist}` : '—';
  if (!dist) toast('Mesafe alınamadı (TomTom anahtarı veya adres)', 'warn');
}

async function toggleTakvimDistAll(slotId) {
  if (_takvimDistAllOriginId === slotId) {
    _takvimDistAllOriginId = null;
    renderTakvimSlots();
    toast('Çoklu uzaklık kapatıldı', 'ok');
    return;
  }
  const slot = takvimSlots.find((s) => s.id === slotId);
  const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
  if (!appt?.plz) {
    toast('Kaynak randevuda PLZ yok', 'warn');
    return;
  }
  _takvimMeasureFromPlz = null;
  _takvimMeasureCache = {};
  _takvimDistAllOriginId = slotId;
  renderTakvimSlots();
  toast('Diğer terminlere uzaklık hesaplanıyor…', 'ok');
  const others = takvimSlots.filter((s) => s.id !== slotId && s.durum === 'dolu' && s.appointment_id);
  for (const s of others) {
    const da = takvimAppts.find((a) => a.id === s.appointment_id);
    if (!da?.plz) continue;
    const key = `${appt.plz}_${da.plz}`;
    if (_takvimPlzRouteCache[key]) continue;
    try {
      const g1 = await geocodeTomTom(`${appt.plz}, Germany`);
      const g2 = await geocodeTomTom(`${da.plz}, Germany`);
      if (!g1 || !g2) continue;
      const rt = await routeTomTomCoords(g1, g2);
      if (rt) _takvimPlzRouteCache[key] = { km: (rt.d / 1000).toFixed(1), min: Math.round(rt.t / 60) };
    } catch (_) {}
  }
  renderTakvimSlots();
}

async function nudgeTakvimSlot(slotId, deltaMin) {
  const slot = takvimSlots.find((s) => s.id === slotId);
  if (!slot || slot.gun_kapali) return;
  const role = currentUser?.role || '';
  if (!['admin', 'super_admin', 'firm_admin'].includes(role)) return;
  const sh = (slot.baslangic_saat || '09:00').slice(0, 5);
  const eh = (slot.bitis_saat || takvimAddHours(sh, takvimSlotDurHours())).slice(0, 5);
  const startMin = takvimTimeToMinutes(sh);
  const endMin = takvimTimeToMinutes(eh);
  const dur = endMin - startMin;
  if (dur <= 0) return;
  let ns = startMin + deltaMin;
  let ne = ns + dur;
  const tset = getCampaignTakvimSettings();
  const dayStart = tset.startH * 60;
  const dayEnd = tset.endH * 60 + 60;
  if (ns < dayStart) {
    toast('Gün başlangıcından önce taşınamaz', 'warn');
    return;
  }
  if (ne > dayEnd) {
    toast('Gün bitişinden sonra taşınamaz', 'warn');
    return;
  }
  const newStart = takvimMinutesToHHMM(ns);
  const newEnd = takvimMinutesToHHMM(ne);
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ baslangic_saat: newStart, bitis_saat: newEnd })
    });
    await loadTakvimSlots();
    toast(`Slot ${deltaMin > 0 ? '+' : ''}${deltaMin} dk kaydırıldı`, 'ok');
  } catch (e) {
    toast('Kaydırma hatası: ' + (e?.message || ''), 'err');
  }
}

function openTakvimPlzMeasureModal() {
  if (!takvimCampId) {
    toast('Önce kampanya seçin', 'err');
    return;
  }
  const old = document.getElementById('m-takvim-plz-measure');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-takvim-plz-measure';
  m.className = 'modal-overlay open';
  const cur = _takvimMeasureFromPlz || '';
  m.innerHTML =
    '<div class="modal" style="max-width:400px;">' +
    '<div class="modal-hdr"><div class="modal-title">Mesafe ölç (PLZ)</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-plz-measure\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">' +
    '<div class="form-row"><label class="form-label">Başlangıç PLZ</label>' +
    '<input type="text" class="form-input" id="takvim-plz-measure-inp" placeholder="örn. 80331" value="' +
    String(cur).replace(/"/g, '') +
    '"></div>' +
    '<div style="font-size:11px;color:var(--text-3);">Girilen PLZ\'den takvimdeki tüm terminlere (PLZ bilgisi olan) rota mesafesi yazılır.</div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn btn-ghost" onclick="clearTakvimPlzMeasure()">Temizle</button>' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-plz-measure\')?.remove()">Kapat</button>' +
    '<button type="button" class="btn btn-primary" onclick="runPlzMeasureFromModal()">Ölç</button>' +
    '</div></div>';
  document.body.appendChild(m);
}

async function runPlzMeasureFromModal() {
  const inp = document.getElementById('takvim-plz-measure-inp');
  const plz = String(inp?.value || '')
    .trim()
    .replace(/\s+/g, '');
  if (!plz) {
    toast('PLZ girin', 'warn');
    return;
  }
  document.getElementById('m-takvim-plz-measure')?.remove();
  _takvimDistAllOriginId = null;
  _takvimMeasureFromPlz = plz;
  _takvimMeasureCache = {};
  toast('Mesafeler hesaplanıyor…', 'ok');
  const targets = takvimSlots.filter((s) => s.durum === 'dolu' && s.appointment_id);
  for (const s of targets) {
    const da = takvimAppts.find((a) => a.id === s.appointment_id);
    if (!da?.plz) continue;
    const key = `${plz}_${da.plz}`;
    if (_takvimMeasureCache[key]) continue;
    try {
      const g1 = await geocodeTomTom(`${plz}, Germany`);
      const g2 = await geocodeTomTom(`${da.plz}, Germany`);
      if (!g1 || !g2) continue;
      const rt = await routeTomTomCoords(g1, g2);
      if (rt) _takvimMeasureCache[key] = { km: (rt.d / 1000).toFixed(1), min: Math.round(rt.t / 60) };
    } catch (_) {}
  }
  renderTakvimSlots();
  toast('Mesafe satırları güncellendi', 'ok');
}

function clearTakvimPlzMeasure() {
  _takvimMeasureFromPlz = null;
  _takvimMeasureCache = {};
  _takvimDistAllOriginId = null;
  document.getElementById('m-takvim-plz-measure')?.remove();
  renderTakvimSlots();
  toast('Mesafe ölçümü temizlendi', 'ok');
}

async function addAdjacentEmptySlot(slotId) {
  const role = currentUser?.role || '';
  if (!['admin', 'super_admin', 'firm_admin'].includes(role)) return;
  if (!takvimCampId) {
    toast('Kampanya yok', 'err');
    return;
  }
  const slot = takvimSlots.find((s) => s.id === slotId);
  if (!slot || slot.gun_kapali) return;
  const bs = (slot.baslangic_saat || '09:00').slice(0, 8);
  const beRaw = slot.bitis_saat || takvimAddHours(bs.slice(0, 5), takvimSlotDurHours());
  let durMin = takvimTimeToMinutes(beRaw) - takvimTimeToMinutes(bs);
  if (durMin <= 0) durMin = takvimSlotDurHours() * 60;
  const ns = takvimTimeToMinutes(bs);
  const ne = ns + durMin;
  const tset = getCampaignTakvimSettings();
  if (ne > tset.endH * 60 + 60) {
    toast('Bu gün için aynı saatte yeni slot sığmıyor', 'warn');
    return;
  }
  const newStart = takvimMinutesToHHMM(ns);
  const newEnd = takvimMinutesToHHMM(ne);
  try {
    await sb('takvim_slots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        campaign_id: takvimCampId,
        firm_id: currentUser.firm_id,
        tarih: slot.tarih,
        baslangic_saat: newStart,
        bitis_saat: newEnd,
        durum: 'bos',
        gun_kapali: false
      })
    });
    await loadTakvimSlots();
    toast('Aynı saatte boş slot eklendi', 'ok');
  } catch (e) {
    toast('Eklenemedi: ' + (e?.message || ''), 'err');
  }
}

// ── Import Appts ──────────────────────────────
function openImportApptModal() {
  const campSel = document.getElementById('ia-campaign');
  const agentSel = document.getElementById('ia-agent');
  if (campSel) {
    campSel.innerHTML = '<option value="">Kampanya seçin...</option>' +
      (campaigns||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  const ff = getFirmFilter('&');
  sb(`users?select=id,name,role${ff}&role=in.(agent,firm_admin)&is_active=eq.true&order=name.asc`)
    .then(users => {
      if (agentSel) agentSel.innerHTML = '<option value="">Agent seçin...</option>' +
        (users||[]).map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
    }).catch(()=>{});
  _iaRows=[]; _iaHeaders=[];
  document.getElementById('ia-file').value='';
  document.getElementById('ia-file-name').textContent='Dosya seçmek için tıkla';
  ['ia-mapping-section','ia-options-section','ia-preview-section','ia-progress-section'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  document.getElementById('ia-preview-btn').style.display='none';
  document.getElementById('ia-submit-btn').style.display='none';
  openModal('m-import-appt');
}

async function onImportFileChange(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('ia-file-name').textContent = file.name;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array', cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  if (!data.length) { toast('Dosya boş','err'); return; }
  _iaHeaders = data[0].map(h=>String(h).trim());
  _iaRows = data.slice(1).filter(row=>row.some(cell=>cell!==''));
  const grid = document.getElementById('ia-mapping-grid');
  grid.innerHTML = IA_FIELDS.map(f=>`
<div style="display:flex;align-items:center;gap:6px;">
<label style="font-size:11px;font-weight:700;min-width:110px;color:${f.required?'var(--text)':'var(--text-3)'};">${f.label}</label>
<select class="form-input" id="ia-map-${f.key}" style="flex:1;font-size:11px;padding:4px 6px;">
<option value="">— Seç —</option>
${_iaHeaders.map((h,i)=>`<option value="${i}" ${autoMatchImport(h,f.key)?'selected':''}>${h}</option>`).join('')}
</select>
</div>`).join('');
  document.getElementById('ia-mapping-section').style.display='';
  document.getElementById('ia-options-section').style.display='';
  document.getElementById('ia-preview-btn').style.display='';
  document.getElementById('ia-submit-btn').style.display='';
  toast(`${_iaRows.length} satır okundu ✓`, 'ok');
}

function autoMatchImport(header, fieldKey) {
  const h = header.toLowerCase();
  const matches = {
    nachname: ['name','ad','soyad','müşteri','nachname'],
    telefon:  ['tel','telefon','phone','handy'],
    telefon2: ['tel2','telefon2','phone2'],
    strasse:  ['adres','adresse','strasse','sokak'],
    plz:      ['plz','posta','postleitzahl'],
    ort:      ['şehir','stadt','ort','city'],
    termin_tarih: ['tarih','datum','termin','date'],
    termin_saat:  ['saat','uhrzeit','time'],
    notiz:    ['not','notiz','note'],
    durum:    ['durum','status','ergebnis'],
  };
  return (matches[fieldKey]||[]).some(kw=>h.includes(kw));
}

function getImportMapping() {
  const map = {};
  IA_FIELDS.forEach(f => {
    const sel = document.getElementById(`ia-map-${f.key}`);
    if (sel?.value !== '') map[f.key] = parseInt(sel.value);
  });
  return map;
}

// ── Mesai saatleri ────────────────────────────

async function loadMesaiSettings() {
  const card = document.getElementById('mesai-settings-card');
  if (!card) return;

  const role = currentUser?.role || '';
  const isSuperAdmin  = role === 'super_admin';
  const isAdminLevel  = ['admin','firm_admin'].includes(role);
  const canView = isSuperAdmin || isAdminLevel;

  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const firmRow    = document.getElementById('mesai-firm-row');
  const permRow    = document.getElementById('mesai-admin-perm-row');
  const saveBtn    = document.getElementById('mesai-save-btn');
  const noticeEl   = document.getElementById('mesai-readonly-notice');

  if (isSuperAdmin) {
    // Firma seçici göster
    if (firmRow) firmRow.style.display = '';
    if (permRow) permRow.style.display = 'flex';

    const firmSel = document.getElementById('mesai-firm-select');
    if (firmSel && !firmSel.options.length) {
      try {
        const firms = await sb('firms?is_active=eq.true&select=id,name&order=name');
        firmSel.innerHTML = (firms||[]).map(f =>
          `<option value="${f.id}">${f.name}</option>`
        ).join('');
      } catch(e) {}
    }
    if (firmSel?.value) _mesaiFirmId = firmSel.value;
    else if (firmSel?.options.length) _mesaiFirmId = firmSel.options[0].value;
    _mesaiFirmSettings = null; // firma değişti, cache temizle
  } else {
    if (firmRow) firmRow.style.display = 'none';
    if (permRow) permRow.style.display = 'none';
    _mesaiFirmId = currentUser?.firm_id;
  }

  await _renderMesaiGrid();
}

async function _renderMesaiGrid() {
  const grid    = document.getElementById('mesai-grid');
  const saveBtn = document.getElementById('mesai-save-btn');
  const noticeEl= document.getElementById('mesai-readonly-notice');
  const permChk = document.getElementById('mesai-admin-perm-chk');
  if (!grid) return;

  const role         = currentUser?.role || '';
  const isSuperAdmin = role === 'super_admin';
  const firmId       = _mesaiFirmId;

  if (!firmId) {
    grid.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px;">Firma seçin</div>';
    return;
  }

  // Firma settings'ini yükle (admin izin kontrolü için)
  if (!_mesaiFirmSettings) {
    try {
      const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
      _mesaiFirmSettings = firms?.[0]?.settings || {};
    } catch(e) { _mesaiFirmSettings = {}; }
  }

  const adminCanEdit = !!_mesaiFirmSettings?.admin_can_edit_mesai;
  const canEdit = isSuperAdmin || adminCanEdit;

  // Admin izin checkbox'ını güncelle
  if (permChk && isSuperAdmin) permChk.checked = adminCanEdit;

  // Readonly uyarısı
  if (noticeEl) noticeEl.style.display = (!isSuperAdmin && !canEdit) ? '' : 'none';
  if (saveBtn)  saveBtn.style.display  = canEdit ? '' : 'none';

  // Mesai satırlarını yükle
  let existing = {};
  try {
    const rows = await sb(`mesai_saatleri?firm_id=eq.${firmId}`);
    (rows||[]).forEach(r => { existing[r.gun] = r; });
  } catch(e) {}

  const dis = canEdit ? '' : 'disabled';
  grid.innerHTML = GUNLER.map(g => {
    const r = existing[g.key] || {};
    const aktif = !r.calismiyor;
    return `<div class="mesai-row" data-gun="${g.key}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-3);border-radius:6px;">
<input type="checkbox" class="mesai-aktif" ${aktif?'checked':''} ${dis} style="width:15px;height:15px;${dis?'cursor:not-allowed;opacity:.5;':''}">
<span style="font-size:12px;font-weight:600;min-width:90px;">${g.label}</span>
<input type="time" class="form-input mesai-bas" value="${r.mesai_baslangic||'09:00'}" ${dis} style="width:90px;font-size:12px;padding:4px 6px;${dis?'opacity:.5;':''}">
<span style="font-size:11px;color:var(--text-3);">—</span>
<input type="time" class="form-input mesai-bit" value="${r.mesai_bitis||'18:00'}" ${dis} style="width:90px;font-size:12px;padding:4px 6px;${dis?'opacity:.5;':''}">
</div>`;
  }).join('');
}

// Süper admin firma dropdown değiştirince
async function onMesaiFirmChange() {
  const firmSel = document.getElementById('mesai-firm-select');
  _mesaiFirmId       = firmSel?.value || null;
  _mesaiFirmSettings = null; // cache sıfırla
  await _renderMesaiGrid();
}

// Süper admin: adminin düzenleme iznini kaydet
async function saveAdminMesaiPermission() {
  if (currentUser?.role !== 'super_admin') return;
  const firmId = _mesaiFirmId;
  if (!firmId) { toast('Önce firma seçin', 'err'); return; }
  const perm = !!document.getElementById('mesai-admin-perm-chk')?.checked;
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,settings`);
    const firm  = firms?.[0];
    if (!firm) throw new Error('Firma bulunamadı');
    const newSettings = { ...(firm.settings||{}), admin_can_edit_mesai: perm };
    await sb(`firms?id=eq.${firmId}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ settings: newSettings })
    });
    _mesaiFirmSettings = newSettings;
    toast(perm ? 'Admin düzenleme yetkisi verildi ✓' : 'Admin yetkisi kaldırıldı ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

async function saveMesaiSaatleri() {
  const role = currentUser?.role || '';
  const isSuperAdmin = role === 'super_admin';

  // Yetki kontrolü
  if (!isSuperAdmin && !_mesaiFirmSettings?.admin_can_edit_mesai) {
    toast('Düzenleme yetkiniz yok', 'err'); return;
  }

  const rows = document.querySelectorAll('.mesai-row');
  if (!rows.length) { toast('Kayıt edilecek satır yok', 'err'); return; }

  const firmId = _mesaiFirmId;
  if (!firmId) { toast('Firma bilgisi bulunamadı', 'err'); return; }

  const records = [];
  rows.forEach(row => {
    const gun  = row.dataset.gun;
    const aktif = row.querySelector('.mesai-aktif')?.checked;
    const bas   = row.querySelector('.mesai-bas')?.value || '09:00';
    const bit   = row.querySelector('.mesai-bit')?.value || '18:00';
    records.push({ firm_id: firmId, gun, calismiyor: !aktif, mesai_baslangic: bas, mesai_bitis: bit });
  });

  try {
    for (const r of records) {
      await sbUpsert('mesai_saatleri', r, 'firm_id,gun');
    }
    toast('Çalışma saatleri kaydedildi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// ── Arama Kısıtlamaları (Call Hours) ──────────

async function loadCallHoursSettings() {
  const card = document.getElementById('call-hours-card');
  if (!card) return;
  const isSuperAdmin = currentUser?.role === 'super_admin';
  card.style.display = isSuperAdmin ? '' : 'none';
  if (!isSuperAdmin) return;

  const firmSel = document.getElementById('ch-firm-select');
  if (firmSel && !firmSel.options.length) {
    try {
      const firms = await sb('firms?is_active=eq.true&select=id,name&order=name');
      firmSel.innerHTML = (firms||[]).map(f =>
        `<option value="${f.id}">${f.name}</option>`
      ).join('');
    } catch(e) {}
  }
  if (!_callHoursFirmId && firmSel?.value) _callHoursFirmId = firmSel.value;

  await _renderCallHoursForm();
}

async function _renderCallHoursForm() {
  const firmId = _callHoursFirmId;
  if (!firmId) return;

  let ch = {};
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    ch = firms?.[0]?.settings?.call_hours || {};
  } catch(e) {}

  const g = id => document.getElementById(id);
  g('ch-wd-start')?.setAttribute('value', ch.weekday_start||'09:00');
  g('ch-wd-end')  ?.setAttribute('value', ch.weekday_end  ||'20:00');

  const satAllowed = ch.sat_allowed !== false;
  if (g('ch-sat-allowed')) g('ch-sat-allowed').checked = satAllowed;
  const satTimes = g('ch-sat-times');
  if (satTimes) satTimes.style.display = satAllowed ? 'flex' : 'none';
  g('ch-sat-start')?.setAttribute('value', ch.sat_start||'09:00');
  g('ch-sat-end')  ?.setAttribute('value', ch.sat_end  ||'13:00');

  if (g('ch-sun-allowed'))   g('ch-sun-allowed').checked   = !!ch.sun_allowed;
  if (g('ch-holiday-check')) g('ch-holiday-check').checked = ch.holiday_check !== false;

  // value attribute does not update live input, set .value directly too
  ['ch-wd-start','ch-wd-end','ch-sat-start','ch-sat-end'].forEach(id => {
    const el = g(id); if (el) el.value = el.getAttribute('value');
  });
}

async function onCallHoursFirmChange() {
  _callHoursFirmId = document.getElementById('ch-firm-select')?.value || null;
  await _renderCallHoursForm();
}

async function saveCallHoursSettings() {
  if (currentUser?.role !== 'super_admin') return;
  const firmId = _callHoursFirmId;
  if (!firmId) { toast('Önce firma seçin', 'err'); return; }

  const g = id => document.getElementById(id);
  const ch = {
    weekday_start  : g('ch-wd-start')?.value     || '09:00',
    weekday_end    : g('ch-wd-end')?.value        || '20:00',
    sat_allowed    : !!g('ch-sat-allowed')?.checked,
    sat_start      : g('ch-sat-start')?.value     || '09:00',
    sat_end        : g('ch-sat-end')?.value        || '13:00',
    sun_allowed    : !!g('ch-sun-allowed')?.checked,
    holiday_check  : !!g('ch-holiday-check')?.checked
  };

  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,settings`);
    const firm  = firms?.[0];
    if (!firm) throw new Error('Firma bulunamadı');
    const newSettings = { ...(firm.settings||{}), call_hours: ch };
    await sb(`firms?id=eq.${firmId}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ settings: newSettings })
    });
    // Aynı firma aktif firmaysa çalışan _callHours'u da güncelle
    if (firmId === currentUser?.firm_id || firmId === _selectedFirmId) {
      _callHours = ch;
    }
    toast('Arama kısıtlamaları kaydedildi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// Login sonrası kendi firmasının call_hours'unu yükle
async function loadFirmCallHours() {
  const firmId = currentUser?.firm_id;
  if (!firmId) return;
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    _callHours = firms?.[0]?.settings?.call_hours || null;
  } catch(e) { _callHours = null; }
}

async function loadDefaultTakvimFirmCard() {
  const card = document.getElementById('default-takvim-firm-card');
  const host = document.getElementById('default-takvim-firm-body');
  if (!card || !host) return;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    host.innerHTML = '<div style="font-size:12px;color:var(--text-3);">Varsayılan takvim için firma seçin.</div>';
    return;
  }
  await ensureFirmTakvimDefaultsLoaded(fid);
  let raw = {};
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    raw = rows?.[0]?.settings?.default_takvim && typeof rows[0].settings.default_takvim === 'object' ? rows[0].settings.default_takvim : {};
  } catch (_) {}
  const cfg = mergeTakvimSettings(raw);
  const bosDisp = /^#[0-9A-Fa-f]{6}$/i.test(String(cfg.bos_color || '').trim()) ? String(cfg.bos_color).trim() : '#3b82f6';
  const dayNames = { pzt: 'Pazartesi', sal: 'Salı', car: 'Çarşamba', per: 'Perşembe', cum: 'Cuma', cmt: 'Cumartesi', paz: 'Pazar' };
  const slotOpts = [1, 2, 3, 4]
    .map((n) => `<option value="${n}"${cfg.slot_dur === n ? ' selected' : ''}>${n} saat</option>`)
    .join('');
  host.innerHTML = `
<div style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Yeni kampanyalar ve takvim ayarı kaydı olmayan kampanyalar bu değerleri firma varsayılanından alır. İstersen tüm aktif kampanyalara da uygulayabilirsin.</div>
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Çalışma Günleri</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;" id="fdt-days">
${Object.entries(dayNames)
  .map(([k, v]) => {
    const on = cfg.active_days.includes(k);
    const st = on ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '';
    return (
      '<button type="button" class="btn btn-ghost btn-sm fdt-day-btn' +
      (on ? ' active' : '') +
      '" data-d="' +
      k +
      '" style="' +
      st +
      '" onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'var(--accent)\':\'\';this.style.color=this.classList.contains(\'active\')?\'#fff\':\'\';this.style.borderColor=this.classList.contains(\'active\')?\'var(--accent)\':\'\';">' +
      v.slice(0, 3) +
      '</button>'
    );
  })
  .join('')}
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
<div class="form-row"><label class="form-label">Başlangıç</label><input type="time" class="form-input" id="fdt-start" value="${cfg.start_hour}"></div>
<div class="form-row"><label class="form-label">Bitiş</label><input type="time" class="form-input" id="fdt-end" value="${cfg.end_hour}"></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Slot süresi</label><select class="form-input" id="fdt-slot-dur">${slotOpts}</select></div>
<div class="form-row"><label class="form-label">Gün başına maks. slot</label><input type="number" class="form-input" id="fdt-max-slots" value="${cfg.max_slots}" min="1" max="40" style="width:80px;"></div>
<div class="form-row"><label class="form-label">Boş slot rengi</label><input type="color" class="form-input" id="fdt-bos-color" value="${bosDisp}" style="width:72px;height:40px;padding:2px;"></div>
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:6px;">
<input type="checkbox" id="fdt-confirm-slot" ${cfg.confirm_new_slot !== false ? 'checked' : ''}> Yeni slot eklerken onay penceresi (varsayılan)
</label>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
<button type="button" class="btn btn-primary btn-sm" onclick="saveDefaultTakvimFirmSettings()">Varsayılanı kaydet</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="applyDefaultTakvimToFirmCampaigns()">Tüm aktif kampanyalara uygula</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="localStorage.removeItem('mb_takvim_skip_new_slot_confirm');toast('Hızlı slot tercihi sıfırlandı','ok')">Hızlı slot (bir daha gösterme) sıfırla</button>
</div>`;
}

async function saveDefaultTakvimFirmSettings() {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    toast('Önce firma seçin', 'warn');
    return;
  }
  const activeDays = [...document.querySelectorAll('.fdt-day-btn.active')].map((b) => b.dataset.d);
  const start = document.getElementById('fdt-start')?.value || '08:00';
  const end = document.getElementById('fdt-end')?.value || '20:00';
  const dur = parseInt(document.getElementById('fdt-slot-dur')?.value || '2', 10);
  const maxSlots = parseInt(document.getElementById('fdt-max-slots')?.value || '5', 10);
  const bos_color = document.getElementById('fdt-bos-color')?.value || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('fdt-confirm-slot')?.checked;
  const payload = { active_days: activeDays, start_hour: start, end_hour: end, slot_dur: dur, max_slots: maxSlots, bos_color, confirm_new_slot };
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, default_takvim: payload } })
    });
    window._firmDefaultTakvimByFirm[fid] = { ...payload };
    _takvimDefaultsFidLoaded = fid;
    toast('Firma varsayılan takvimi kaydedildi ✓', 'ok');
    if (typeof takvimCampId !== 'undefined' && takvimCampId) await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function applyDefaultTakvimToFirmCampaigns() {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    toast('Önce firma seçin', 'warn');
    return;
  }
  if (!(await mbConfirm('Bu firmadaki tüm aktif kampanyalara aşağıdaki formdaki takvim ayarları yazılsın mı?', 'Kampanyalar'))) return;
  const activeDays = [...document.querySelectorAll('.fdt-day-btn.active')].map((b) => b.dataset.d);
  if (!activeDays.length) {
    toast('En az bir çalışma günü seçin', 'warn');
    return;
  }
  const start = document.getElementById('fdt-start')?.value || '08:00';
  const end = document.getElementById('fdt-end')?.value || '20:00';
  const dur = parseInt(document.getElementById('fdt-slot-dur')?.value || '2', 10);
  const maxSlots = parseInt(document.getElementById('fdt-max-slots')?.value || '5', 10);
  const bos_color = document.getElementById('fdt-bos-color')?.value || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('fdt-confirm-slot')?.checked;
  const takvim = { active_days: activeDays, start_hour: start, end_hour: end, slot_dur: dur, max_slots: maxSlots, bos_color, confirm_new_slot };
  try {
    const camps = await sb(`campaigns?firm_id=eq.${fid}&status=eq.active&select=id,settings`);
    let n = 0;
    for (const c of camps || []) {
      const st = c.settings || {};
      await sb(`campaigns?id=eq.${c.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...st, takvim: { ...takvim } } })
      });
      n++;
      const idx = typeof campaigns !== 'undefined' && campaigns ? campaigns.findIndex((x) => x.id === c.id) : -1;
      if (idx >= 0) campaigns[idx].settings = { ...(campaigns[idx].settings || {}), takvim: { ...takvim } };
    }
    toast(`${n} kampanyaya takvim ayarları uygulandı ✓`, 'ok');
    if (typeof takvimCampId !== 'undefined' && takvimCampId) await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}
