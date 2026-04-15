let _jobPosts = [];
let _jobPostWorkers = [];
let _jobPostSubs = [];
let _jobPostSlots = [];
let _jobFirmStats = {};
let _jobListTab = 'active';
let _jobPreset = '';
let _jobPermissionsCache = {};
let _jobPermissionsFirmId = null;
let _jobMap = null;
let _jobPolygonPoints = [];
let _jobPolygonLayer = null;
let _jobVertexMarkers = [];

function _jmEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function _jmCanManage() {
  return ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
}

function defaultJobPermissions() {
  return {
    can_publish_job: true,
    can_join_job: true,
    can_submit_job: true,
    can_qc_job: true,
    can_manage_wallet: true
  };
}

const JOB_PERMISSION_DEFS = [
  { key: 'can_publish_job', label: 'İlan yayınlayabilir' },
  { key: 'can_join_job', label: 'İlana katılabilir' },
  { key: 'can_submit_job', label: 'Teslim girebilir' },
  { key: 'can_qc_job', label: 'QC onayı verebilir' },
  { key: 'can_manage_wallet', label: 'Cüzdan hareketlerini yönetebilir' }
];

const JM_APPT_CAT_LABELS = {
  heat_pump: 'Isı pompası',
  solar: 'Solar / PV',
  gas_boiler: 'Kombi / doğalgaz',
  ac: 'Klima',
  energy_audit: 'Enerji danışmanlığı',
  other: 'Diğer',
  general: 'Genel randevu'
};

function _jmAppointmentCategoryKeyFromRequirements(req) {
  const m = String(req || '').match(/^JM_APPOINTMENT_CATEGORY:([a-z0-9_]+)\s*\n?/i);
  return m ? m[1].toLowerCase() : null;
}

function _jmAppointmentCategoryLabelFromRequirements(req) {
  const k = _jmAppointmentCategoryKeyFromRequirements(req);
  if (!k) return '';
  return JM_APPT_CAT_LABELS[k] || k.replace(/_/g, ' ');
}

function syncJobMarketFilterUi() {
  document.querySelectorAll('#page-jobmarket .jm-tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === _jobListTab));
  document.querySelectorAll('#page-jobmarket .jm-preset').forEach((b) => b.classList.toggle('is-active', (b.dataset.preset || '') === _jobPreset));
}

async function applyJobFormDefaultsFromFirm() {
  const ownerFirmId = currentUser?.role === 'super_admin'
    ? (document.getElementById('jm-owner-firm')?.value || currentUser?.firm_id)
    : (getActiveFirmId() || currentUser?.firm_id);
  if (!ownerFirmId) return;
  const rows = await sb(`firms?id=eq.${ownerFirmId}&select=settings`).catch(() => []);
  const s = rows?.[0]?.settings || {};
  const cur = String(s.currency || s.payroll_currency || s.payroll?.currency || s.fx?.default_currency || '').trim().toUpperCase();
  const sel = document.getElementById('jm-currency');
  if (sel && cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

let _jmCalYear = new Date().getFullYear();
let _jmCalMonth = new Date().getMonth();
let _jmCalSelectedYmd = '';
let _jmCalView = 'week';
let _jmCalDate = new Date();
let _jmCalShowSat = false;
let _jmCalShowSun = false;
let _jmCalSlotHours = 2;
let _jmCalSelections = [];

const JM_WD_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const JM_MONTH_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function syncJmSlotSummary() {
  const el = document.getElementById('jm-slot-summary');
  if (!el) return;
  const date = String(document.getElementById('jm-slot-date')?.value || '').trim();
  const t0 = String(document.getElementById('jm-slot-start')?.value || '').trim();
  const t1 = String(document.getElementById('jm-slot-end')?.value || '').trim();
  if (!date || !t0 || !t1) {
    el.textContent = 'Henüz seçilmedi — Takvimden slot oluştur’a tıklayın.';
    return;
  }
  const [y, m, d] = date.split('-').map(Number);
  const label = `${d}.${m}.${y} · ${t0.slice(0, 5)}–${t1.slice(0, 5)}`;
  el.innerHTML = `<span style="color:var(--text-2);font-weight:600;">${label}</span>`;
}

function openJobMarketSlotCalendarModal() {
  if (String(document.getElementById('jm-type')?.value || '') !== 'appointment') {
    toast('Önce ilan türü Randevu olmalı', 'warn');
    return;
  }
  const hid = document.getElementById('jm-slot-date');
  const cur = String(hid?.value || '').trim();
  if (cur) {
    const p = cur.split('-');
    if (p.length === 3) {
      _jmCalYear = Number(p[0]);
      _jmCalMonth = Number(p[1]) - 1;
      _jmCalSelectedYmd = cur;
    }
  } else {
    const n = new Date();
    _jmCalYear = n.getFullYear();
    _jmCalMonth = n.getMonth();
    _jmCalSelectedYmd = '';
  }
  _jmCalDate = new Date(_jmCalYear, _jmCalMonth, 1);
  _jmCalSlotHours = 2;
  _jmCalSelections = [];
  document.getElementById('jm-cal-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'jm-cal-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:980px;width:95vw;">
<div class="modal-hdr"><div class="modal-title">İş İlanı Takvimi</div><button type="button" class="modal-close" onclick="document.getElementById('jm-cal-modal').remove()">&times;</button></div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--bg-3);">
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalSetView('day')">Gün</button>
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalSetView('week')">Hafta</button>
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalSetView('month')">Ay</button>
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalMove(-1)">◀</button>
  <span id="jm-cal-range" style="font-size:12px;font-weight:700;min-width:160px;text-align:center;">—</span>
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalMove(1)">▶</button>
  <button type="button" class="btn btn-ghost btn-sm" onclick="jmCalToday()">Bugün</button>
  <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2);margin-left:8px;"><input type="checkbox" id="jm-cal-show-sat" ${_jmCalShowSat ? 'checked' : ''} onchange="jmCalToggleWeekend()">Cmt</label>
  <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2);"><input type="checkbox" id="jm-cal-show-sun" ${_jmCalShowSun ? 'checked' : ''} onchange="jmCalToggleWeekend()">Paz</label>
</div>
<div id="jm-cal-modal-body" style="padding:12px 16px;max-height:62vh;overflow:auto;"></div>
<div class="modal-footer" style="flex-wrap:wrap;gap:8px;align-items:end;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;min-width:260px;">
<div><label class="form-label" style="font-size:11px;">Başlangıç saati</label><input type="time" class="form-input" id="jm-cal-t0" value="${String(document.getElementById('jm-slot-start')?.value || '10:00').slice(0, 5)}"></div>
<div><label class="form-label" style="font-size:11px;">Bitiş saati</label><input type="time" class="form-input" id="jm-cal-t1" value="${String(document.getElementById('jm-slot-end')?.value || '11:00').slice(0, 5)}"></div>
</div>
<div style="min-width:140px;">
<label class="form-label" style="font-size:11px;">Slot adedi</label>
<input type="number" class="form-input" id="jm-cal-count" min="1" max="48" value="${Math.max(1, Number(document.getElementById('jm-quantity')?.value || 1))}" readonly>
</div>
<div style="min-width:120px;">
<label class="form-label" style="font-size:11px;">Slot süresi</label>
<select class="form-input" id="jm-cal-slot-hours" onchange="jmCalOnSlotHoursChange()">
  <option value="1">1 saat</option>
  <option value="2" selected>2 saat</option>
  <option value="3">3 saat</option>
  <option value="4">4 saat</option>
</select>
</div>
<button type="button" class="btn btn-primary" onclick="jmCalApply()">Slotu Uygula</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  const t0 = String(document.getElementById('jm-slot-start')?.value || '10:00').slice(0, 5);
  const t1 = String(document.getElementById('jm-slot-end')?.value || '12:00').slice(0, 5);
  const h0 = Number(t0.split(':')[0] || 10);
  const h1 = Number(t1.split(':')[0] || 12);
  const guess = Math.max(1, Math.min(4, (h1 - h0) || 2));
  _jmCalSlotHours = guess;
  const selDur = document.getElementById('jm-cal-slot-hours');
  if (selDur) selDur.value = String(_jmCalSlotHours);
  jmCalSetView('week');
}

function jmFmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function jmGetMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay() || 7;
  if (day !== 1) dt.setDate(dt.getDate() - (day - 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function jmCalSetView(view) {
  _jmCalView = view;
  document.querySelectorAll('#jm-cal-modal .btn.btn-ghost.btn-sm').forEach((b) => {
    if (['Gün', 'Hafta', 'Ay'].includes(String(b.textContent || '').trim())) {
      const active = (view === 'day' && b.textContent.includes('Gün')) || (view === 'week' && b.textContent.includes('Hafta')) || (view === 'month' && b.textContent.includes('Ay'));
      b.style.background = active ? 'var(--accent)' : '';
      b.style.color = active ? '#fff' : '';
      b.style.borderColor = active ? 'var(--accent)' : '';
    }
  });
  renderJobMarketCalendarGrid();
}

function jmCalMove(delta) {
  if (_jmCalView === 'day') _jmCalDate.setDate(_jmCalDate.getDate() + delta);
  else if (_jmCalView === 'week') _jmCalDate.setDate(_jmCalDate.getDate() + (delta * 7));
  else _jmCalDate.setMonth(_jmCalDate.getMonth() + delta);
  _jmCalYear = _jmCalDate.getFullYear();
  _jmCalMonth = _jmCalDate.getMonth();
  renderJobMarketCalendarGrid();
}

function jmCalToday() {
  _jmCalDate = new Date();
  _jmCalYear = _jmCalDate.getFullYear();
  _jmCalMonth = _jmCalDate.getMonth();
  renderJobMarketCalendarGrid();
}

function jmCalToggleWeekend() {
  _jmCalShowSat = !!document.getElementById('jm-cal-show-sat')?.checked;
  _jmCalShowSun = !!document.getElementById('jm-cal-show-sun')?.checked;
  renderJobMarketCalendarGrid();
}

function jmSelectionKey(ymd, hh) {
  return `${ymd}@${hh}`;
}

function jmCalOnSlotHoursChange() {
  _jmCalSlotHours = Math.max(1, Number(document.getElementById('jm-cal-slot-hours')?.value || 2));
  if (_jmCalSelections.length) jmCalRecomputeFromSelections();
}

function jmCalRecomputeFromSelections() {
  const t0El = document.getElementById('jm-cal-t0');
  const t1El = document.getElementById('jm-cal-t1');
  const cEl = document.getElementById('jm-cal-count');
  if (!_jmCalSelections.length) {
    if (cEl) cEl.value = '1';
    return;
  }
  const sorted = [..._jmCalSelections].sort((a, b) => (a.ymd + a.hh).localeCompare(b.ymd + b.hh));
  const first = sorted[0];
  const h = Number(first.hh.split(':')[0] || 10);
  const endHour = Math.min(23, h + _jmCalSlotHours);
  if (t0El) t0El.value = first.hh.slice(0, 5);
  if (t1El) t1El.value = `${String(endHour).padStart(2, '0')}:00`;
  if (cEl) cEl.value = String(sorted.length);
}

function renderJobMarketCalendarGrid() {
  const body = document.getElementById('jm-cal-modal-body');
  const rangeEl = document.getElementById('jm-cal-range');
  if (!body) return;
  const today = new Date();
  if (_jmCalView === 'month') {
    const first = new Date(_jmCalYear, _jmCalMonth, 1);
    const startPad = (first.getDay() + 6) % 7;
    const dim = new Date(_jmCalYear, _jmCalMonth + 1, 0).getDate();
    const todayYmd = jmFmtDate(today);
    if (rangeEl) rangeEl.textContent = `${JM_MONTH_TR[_jmCalMonth]} ${_jmCalYear}`;
    let cells = '';
    for (let i = 0; i < startPad; i++) cells += '<div style="padding:6px;"></div>';
    for (let d = 1; d <= dim; d++) {
      const ymd = `${_jmCalYear}-${String(_jmCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSel = _jmCalSelectedYmd === ymd;
      const isToday = todayYmd === ymd;
      const st = [
        'cursor:pointer;text-align:center;padding:8px 4px;border-radius:8px;font-size:12px;font-weight:700;',
        isSel ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-3);color:var(--text-1);',
        isToday && !isSel ? 'outline:2px solid var(--accent);' : ''
      ].join('');
      cells += `<div class="jm-cal-day" data-ymd="${ymd}" style="${st}" onclick="jmCalPickDay('${ymd}')">${d}</div>`;
    }
    body.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px;font-size:10px;color:var(--text-3);text-align:center;">${JM_WD_TR.map((w) => `<div>${w}</div>`).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${cells}</div>
<div class="jm-hint" style="margin-top:8px;">Ay görünümünde gün seçin. Hafta/Gün görünümünde saat satırından seçim yapabilirsiniz.</div>`;
    return;
  }
  const startDt = _jmCalView === 'day' ? new Date(_jmCalDate) : jmGetMonday(_jmCalDate);
  const dayOffsets = _jmCalView === 'day'
    ? [((_jmCalDate.getDay() + 6) % 7)]
    : [0, 1, 2, 3, 4, ...(_jmCalShowSat ? [5] : []), ...(_jmCalShowSun ? [6] : [])];
  const daysCount = dayOffsets.length;
  const endDt = new Date(startDt);
  endDt.setDate(endDt.getDate() + (dayOffsets[dayOffsets.length - 1] || 0));
  if (rangeEl) {
    rangeEl.textContent = _jmCalView === 'day'
      ? startDt.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'short' })
      : `${startDt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} – ${endDt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}`;
  }
  let html = `<div style="display:grid;grid-template-columns:52px repeat(${daysCount},1fr);">`;
  html += '<div style="background:var(--bg-3);border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:8px 4px;"></div>';
  for (let d = 0; d < daysCount; d++) {
    const dt = new Date(startDt);
    dt.setDate(dt.getDate() + dayOffsets[d]);
    const ds = jmFmtDate(dt);
    const isToday = ds === jmFmtDate(today);
    html += `<div style="background:${isToday ? 'rgba(37,99,235,.08)' : 'var(--bg-3)'};border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:6px 4px;text-align:center;font-size:10px;font-weight:800;color:${isToday ? 'var(--accent)' : 'var(--text-2)'};">
${JM_WD_TR[(dt.getDay() + 6) % 7]}<br><span style="font-size:13px;font-weight:900;">${dt.getDate()}</span></div>`;
  }
  for (let hr = 8; hr <= 20; hr++) {
    const hh = String(hr).padStart(2, '0');
    html += `<div style="height:42px;background:var(--bg-2);border-bottom:1px solid var(--border);border-right:1px solid var(--border);font-size:9px;font-weight:700;color:var(--text-3);text-align:center;padding-top:4px;font-family:var(--mono);">${hh}:00</div>`;
    for (let d = 0; d < daysCount; d++) {
      const dt = new Date(startDt);
      dt.setDate(dt.getDate() + dayOffsets[d]);
      const ymd = jmFmtDate(dt);
      const isSel = _jmCalSelections.some((s) => jmSelectionKey(s.ymd, s.hh) === jmSelectionKey(ymd, `${hh}:00`));
      html += `<div onclick="jmCalPickCell('${ymd}','${hh}:00')" style="height:42px;position:relative;border-bottom:1px solid var(--border);border-right:1px solid var(--border);cursor:pointer;background:${isSel ? 'rgba(37,99,235,.28)' : ''};"></div>`;
    }
  }
  html += '</div>';
  const preview = _jmCalSelections.length
    ? _jmCalSelections
      .slice()
      .sort((a, b) => (a.ymd + a.hh).localeCompare(b.ymd + b.hh))
      .map((s, i) => `${i + 1}) ${s.ymd} ${s.hh.slice(0, 5)}–${String(Math.min(23, Number(s.hh.slice(0, 2)) + _jmCalSlotHours)).padStart(2, '0')}:00`)
      .join(' · ')
    : 'Henüz seçim yok';
  body.innerHTML = `${html}<div class="jm-hint" style="margin-top:8px;">Kampanya takvimi gibi görünüm: saat satırına tıklayarak birden çok slot seçebilirsiniz.</div><div class="jm-hint" style="margin-top:6px;"><b>Seçilen slotlar:</b> ${preview}</div>`;
}

function jmCalPickDay(ymd) {
  _jmCalSelectedYmd = ymd;
  _jmCalDate = new Date(ymd);
  _jmCalYear = _jmCalDate.getFullYear();
  _jmCalMonth = _jmCalDate.getMonth();
  renderJobMarketCalendarGrid();
}

function jmCalPickCell(ymd, startTime) {
  _jmCalSelectedYmd = ymd;
  const hh = startTime.slice(0, 5);
  const key = jmSelectionKey(ymd, hh);
  const idx = _jmCalSelections.findIndex((s) => jmSelectionKey(s.ymd, s.hh) === key);
  if (idx >= 0) _jmCalSelections.splice(idx, 1);
  else _jmCalSelections.push({ ymd, hh });
  jmCalRecomputeFromSelections();
  renderJobMarketCalendarGrid();
}

function jmCalApply() {
  if (!_jmCalSelections.length) {
    toast('Takvimden en az bir slot seçin', 'warn');
    return;
  }
  const t0 = String(document.getElementById('jm-cal-t0')?.value || '').trim();
  const t1 = String(document.getElementById('jm-cal-t1')?.value || '').trim();
  const cnt = Math.max(1, Number(document.getElementById('jm-cal-count')?.value || _jmCalSelections.length || 1));
  if (!t0 || !t1) {
    toast('Başlangıç ve bitiş saati gerekli', 'warn');
    return;
  }
  const sorted = [..._jmCalSelections].sort((a, b) => (a.ymd + a.hh).localeCompare(b.ymd + b.hh));
  const hid = document.getElementById('jm-slot-date');
  const hs = document.getElementById('jm-slot-start');
  const he = document.getElementById('jm-slot-end');
  const q = document.getElementById('jm-quantity');
  if (hid) hid.value = sorted[0].ymd;
  if (hs) hs.value = t0.length === 5 ? `${t0}:00` : t0;
  if (he) he.value = t1.length === 5 ? `${t1}:00` : t1;
  if (q) q.value = String(cnt);
  syncJmSlotSummary();
  updateJobPricePreview();
  refreshJobSlotPreview();
  document.getElementById('jm-cal-modal')?.remove();
  toast(`Takvim seçildi; ${cnt} slot için forma işlendi`, 'ok');
}

function refreshJobMarketMap() {
  const mapEl = document.getElementById('jm-map');
  const pg = document.getElementById('page-jobmarket');
  if (!mapEl || typeof L === 'undefined') return;
  if (!pg?.classList.contains('active')) return;
  mapEl.style.minHeight = '220px';
  mapEl.style.width = '100%';
  mapEl.style.background = 'var(--bg-3)';
  if (!_jobMap) ensureJobMarketMap();
  const fix = () => {
    try {
      _jobMap?.invalidateSize({ animate: false });
    } catch (_) {}
  };
  requestAnimationFrame(fix);
  setTimeout(fix, 80);
  setTimeout(fix, 400);
}

async function runJobMarketAutoWithdrawals() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/job_market_run_auto_withdrawals`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    const txt = await res.text();
    if (!res.ok) return;
    const rows = txt ? JSON.parse(txt) : [];
    const row = rows?.[0];
    const w = Number(row?.withdrawn ?? 0);
    if (w > 0) toast(`${w} randevu ilanı otomatik geri çekildi (CRM randevusu yok)`, 'ok', 4500);
  } catch (_) {}
}

function refreshJobSlotPreview() {
  const wrap = document.getElementById('jm-slot-preview');
  if (!wrap) return;
  const jobType = String(document.getElementById('jm-type')?.value || '');
  if (jobType !== 'appointment') {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const date = String(document.getElementById('jm-slot-date')?.value || '').trim();
  const t0 = String(document.getElementById('jm-slot-start')?.value || '').trim();
  const t1 = String(document.getElementById('jm-slot-end')?.value || '').trim();
  const qty = Math.max(1, Number(document.getElementById('jm-quantity')?.value || 1));
  if (!date || !t0 || !t1) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  const t0p = t0.slice(0, 5);
  const t1p = t1.slice(0, 5);
  const start = new Date(`${date}T${t0p}:00`);
  const end = new Date(`${date}T${t1p}:00`);
  let durMs = end.getTime() - start.getTime();
  if (!Number.isFinite(start.getTime()) || durMs <= 0) durMs = 60 * 60 * 1000;
  const lines = [];
  let cur = start.getTime();
  for (let i = 0; i < Math.min(qty, 24); i++) {
    const a = new Date(cur);
    const b = new Date(cur + durMs);
    lines.push(`${i + 1}. ${a.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} – ${b.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
    cur += durMs;
  }
  if (qty > 24) lines.push(`… ve ${qty - 24} slot daha (önizleme)`);
  wrap.style.display = '';
  wrap.innerHTML = `<div style="font-weight:700;margin-bottom:6px;font-size:11px;color:var(--text-2);">Oluşacak slot önizlemesi</div>${lines.map((l) => `<div style="padding:2px 0;">${_jmEsc(l)}</div>`).join('')}`;
}

function openJobSlotsModal(jobPostId) {
  document.getElementById('jm-slots-modal')?.remove();
  const post = (_jobPosts || []).find((p) => p.id === jobPostId);
  const slots = (_jobPostSlots || []).filter((s) => s.job_post_id === jobPostId).sort((a, b) => new Date(a.slot_start_at) - new Date(b.slot_start_at));
  const title = post?.title || 'Müsait slotlar';
  const rows = slots.length
    ? slots.map((s) => {
      const st = s.status || 'open';
      const a = new Date(s.slot_start_at).toLocaleString('tr-TR');
      const b = new Date(s.slot_end_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return `<tr><td style="padding:6px 8px;font-size:12px;">${_jmEsc(a)}</td><td style="padding:6px 8px;font-size:12px;">${_jmEsc(b)}</td><td style="padding:6px 8px;font-size:12px;">${_jmEsc(st)}</td></tr>`;
    }).join('')
    : '<tr><td colspan="3" style="padding:12px;font-size:12px;color:var(--text-3);">Bu ilan için slot yok veya henüz yüklenmedi.</td></tr>';
  const ov = document.createElement('div');
  ov.id = 'jm-slots-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:560px;">
<div class="modal-hdr"><div class="modal-title">${_jmEsc(title)}</div><button type="button" class="modal-close" onclick="document.getElementById('jm-slots-modal').remove()">&times;</button></div>
<div style="padding:12px 16px;max-height:62vh;overflow:auto;">
<div class="jm-hint" style="margin-bottom:10px;">Randevu ilanlarında ilan sahibinin açtığı müsait zamanlar. Gerçek randevu ataşmanız kendi süreçinize (teslim / CRM) bağlıdır.</div>
<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="text-align:left;border-bottom:1px solid var(--border);">
<th style="padding:6px 8px;">Başlangıç</th><th style="padding:6px 8px;">Bitiş (saat)</th><th style="padding:6px 8px;">Durum</th>
</tr></thead><tbody>${rows}</tbody></table>
</div>
<div class="modal-footer">
<button type="button" class="btn btn-ghost" onclick="document.getElementById('jm-slots-modal').remove()">Kapat</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

async function getJobPermissions(fid) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return defaultJobPermissions();
  if (_jobPermissionsCache[firmId]) return _jobPermissionsCache[firmId];
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const perms = { ...defaultJobPermissions(), ...(rows?.[0]?.settings?.job_permissions || {}) };
  _jobPermissionsCache[firmId] = perms;
  return perms;
}

async function loadJobPermissionsSettings() {
  const card = document.getElementById('job-permissions-card');
  const list = document.getElementById('job-permissions-list');
  if (!card || !list) return;
  list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:6px 2px;">Yükleniyor...</div>`;
  const role = currentUser?.role || '';
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(role);
  card.style.display = canView ? '' : 'none';
  if (!canView) return;
  const row = document.getElementById('job-permissions-firm-row');
  const sel = document.getElementById('job-permissions-firm-select');
  if (role === 'super_admin') {
    if (row) row.style.display = '';
    if (sel && !sel.options.length) {
      const firms = await sb('firms?select=id,name&order=name.asc').catch(() => []);
      sel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${_jmEsc(f.name || f.id)}</option>`).join('');
      if (!sel.value) {
        const preferred = _selectedFirmId || currentUser?.firm_id || '';
        if (preferred && [...sel.options].some((o) => o.value === preferred)) sel.value = preferred;
      }
    }
    _jobPermissionsFirmId = sel?.value || currentUser?.firm_id || null;
  } else {
    if (row) row.style.display = 'none';
    _jobPermissionsFirmId = currentUser?.firm_id || null;
  }
  if (!_jobPermissionsFirmId) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:6px 2px;">Firma bulunamadı. Lütfen önce firma seçin.</div>`;
    return;
  }
  const perms = await getJobPermissions(_jobPermissionsFirmId);
  list.innerHTML = JOB_PERMISSION_DEFS.map((d) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border-radius:8px;font-size:12px;cursor:pointer;">
<input type="checkbox" data-jp-key="${d.key}" ${perms[d.key] !== false ? 'checked' : ''} style="width:15px;height:15px;">
<span>${d.label}</span>
</label>`).join('');
}

async function onJobPermissionsFirmChange() {
  _jobPermissionsFirmId = document.getElementById('job-permissions-firm-select')?.value || null;
  await loadJobPermissionsSettings();
}

async function saveJobPermissionsSettings() {
  const fid = _jobPermissionsFirmId || currentUser?.firm_id;
  if (!fid) return;
  const perms = { ...defaultJobPermissions() };
  document.querySelectorAll('[data-jp-key]').forEach((el) => {
    perms[el.getAttribute('data-jp-key')] = !!el.checked;
  });
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const old = rows?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...old, job_permissions: perms } })
    });
    _jobPermissionsCache[fid] = perms;
    toast('İş platformu izinleri kaydedildi', 'ok');
    if (typeof logAuditEvent === 'function') await logAuditEvent('job_permissions_updated', 'firm', fid, { perms });
  } catch (e) {
    toast('İzinler kaydedilemedi', 'err');
  }
}

async function loadJobMarketPage() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  if (!_jmCanManage()) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Bu sayfa için yetkiniz yok</div>`;
    return;
  }
  if (typeof isFeatureEnabledForCurrentFirm === 'function') {
    const enabled = await isFeatureEnabledForCurrentFirm('job_market_enabled');
    if (!enabled) {
      list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Bu firma için iş platformu kapalı</div>`;
      return;
    }
  }
  await bindJobOwnerFirmSelector();
  await applyJobFormDefaultsFromFirm();
  renderFirmSelector('job-market-firm-selector', loadJobMarketPage);
  ensureJobMarketMap();
  onJobTypeChange();
  refreshJobSlotPreview();
  await applyJobPermissionUi();
  await refreshWalletInfo();
  await loadJobPosts();
  setTimeout(refreshJobMarketMap, 60);
  setTimeout(refreshJobMarketMap, 400);
}

async function applyJobPermissionUi() {
  const perms = await getJobPermissions();
  const publishBtn = document.querySelector('#page-jobmarket button[onclick="createJobPost()"]');
  if (publishBtn) publishBtn.disabled = !perms.can_publish_job;
}

async function bindJobOwnerFirmSelector() {
  const row = document.getElementById('jm-owner-firm-row');
  const sel = document.getElementById('jm-owner-firm');
  if (!row || !sel) return;
  const isSuper = currentUser?.role === 'super_admin';
  row.style.display = isSuper ? '' : 'none';
  if (!isSuper) return;
  if (sel.options.length) return;
  const firms = await sb('firms?is_active=eq.true&select=id,name&order=name.asc').catch(() => []);
  sel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${_jmEsc(f.name || f.id)}</option>`).join('');
  if (!sel.value && currentUser?.firm_id) sel.value = currentUser.firm_id;
  sel.onchange = () => {
    refreshWalletInfo(sel.value);
    applyJobFormDefaultsFromFirm();
  };
}

async function loadJobPosts() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Önce firma seçin</div>`;
    return;
  }
  list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Yükleniyor...</div>`;
  try {
    await runJobMarketAutoWithdrawals();
    const posts = await sb(`job_posts?order=created_at.desc&limit=220`);
    if (!posts) throw new Error('İlan listesi alınamadı');
    const workers = await sb(`job_post_workers?select=id,job_post_id,worker_firm_id,status`).catch(() => []);
    const subs = await sb(`job_submissions?select=id,job_post_id,worker_firm_id,status,created_at,appointment_id&order=created_at.desc&limit=400`).catch(() => []);
    const slots = await sb(`job_post_slots?select=id,job_post_id,status,slot_start_at,slot_end_at&order=slot_start_at.asc&limit=2000`).catch(() => []);
    _jobPosts = posts || [];
    _jobPostWorkers = workers || [];
    _jobPostSubs = subs || [];
    _jobPostSlots = slots || [];
    _jobFirmStats = buildJobFirmStats(_jobPostSubs);
    renderJobPostList();
    if (typeof loadJobMarketKpi === 'function') loadJobMarketKpi();
  } catch (e) {
    list.innerHTML = `<div style="font-size:12px;color:var(--red);padding:10px;">Liste yüklenemedi: ${_jmEsc(e.message || e)}</div>`;
  }
}

function buildJobFirmStats(subs) {
  const st = {};
  (subs || []).forEach((s) => {
    const fid = s.worker_firm_id;
    if (!fid) return;
    if (!st[fid]) st[fid] = { approved: 0, rejected: 0, total: 0 };
    st[fid].total++;
    if (s.status === 'approved') st[fid].approved++;
    if (s.status === 'rejected') st[fid].rejected++;
  });
  return st;
}

function calcJobMatchScore(post, viewerFirmId) {
  const scoreBase = 50;
  const byCountry = post.country ? 10 : 0;
  const byCity = post.city ? 10 : 0;
  const stats = _jobFirmStats[viewerFirmId] || { approved: 0, rejected: 0, total: 0 };
  const quality = stats.total ? Math.round((stats.approved / stats.total) * 30) : 10;
  return Math.max(0, Math.min(100, scoreBase + byCountry + byCity + quality - (stats.rejected * 2)));
}

function renderJobPostList() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  const q = String(document.getElementById('jm-search')?.value || '').trim().toLowerCase();
  const fid = getActiveFirmId() || currentUser?.firm_id;
   let items = (_jobPosts || []).filter((p) => {
    if (!p?.id) return false;
    if (!q) return true;
    const cat = _jmAppointmentCategoryLabelFromRequirements(p.requirements);
    return `${p.title || ''} ${p.city || ''} ${p.country || ''} ${cat}`.toLowerCase().includes(q);
  });
  if (_jobListTab === 'active') items = items.filter((p) => ['published', 'in_progress'].includes(p.status));
  if (_jobListTab === 'pending_qc') items = items.filter((p) => p.status === 'pending_qc');
  if (_jobListTab === 'completed') items = items.filter((p) => p.status === 'completed');
  if (_jobListTab === 'cancelled') items = items.filter((p) => p.status === 'cancelled');
  if (_jobListTab === 'rejected') {
    const rejectedJobIds = new Set(_jobPostSubs.filter((s) => s.status === 'rejected').map((s) => s.job_post_id));
    items = items.filter((p) => rejectedJobIds.has(p.id));
  }
  if (_jobPreset === 'today') {
    const d = new Date().toISOString().slice(0, 10);
    items = items.filter((p) => String(p.created_at || '').startsWith(d));
  } else if (_jobPreset === 'this_week') {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    items = items.filter((p) => (new Date(p.created_at || 0)).getTime() >= start.getTime());
  } else if (_jobPreset === 'high_budget') {
    items = items.filter((p) => Number(p.budget || 0) >= 500);
  }
  if (!items.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Bu görünüm için ilan yok</div>`;
    syncJobMarketFilterUi();
    return;
  }
  list.innerHTML = items.map((p) => {
    const workers = _jobPostWorkers.filter((w) => w.job_post_id === p.id && ['working', 'submitted'].includes(w.status));
    const workingCnt = workers.length;
    const isOwner = p.requester_firm_id === fid;
    const myWorker = _jobPostWorkers.find((w) => w.job_post_id === p.id && w.worker_firm_id === fid);
    const mySubs = _jobPostSubs.filter((s) => s.job_post_id === p.id && s.worker_firm_id === fid);
    const slots = _jobPostSlots.filter((s) => s.job_post_id === p.id);
    const score = calcJobMatchScore(p, fid);
    const apptCat = p.job_type === 'appointment' ? _jmAppointmentCategoryLabelFromRequirements(p.requirements) : '';
    const deadline = p.deadline_at ? new Date(p.deadline_at).toLocaleString('tr-TR') : '—';
    const rdMs = p.retraction_deadline_at ? new Date(p.retraction_deadline_at).getTime() : 0;
    const deadlinePassed = !p.retraction_deadline_at || !!(rdMs && Date.now() >= rdMs);
    const hasApproved = _jobPostSubs.some((s) => s.job_post_id === p.id && s.status === 'approved');
    const hasApptLinkBlock = p.job_type === 'appointment' && p.status !== 'pending_qc' && _jobPostSubs.some((s) => s.job_post_id === p.id && s.appointment_id && ['submitted', 'qc_pending', 'approved'].includes(s.status));
    const autoPath = p.status === 'pending_qc' || (p.job_type === 'appointment' && !hasApptLinkBlock);
    const canManagePost = isOwner || currentUser?.role === 'super_admin';
    const canWithdrawUi = canManagePost && ['published', 'in_progress', 'pending_qc'].includes(p.status) && !hasApproved && (autoPath || deadlinePassed) && !hasApptLinkBlock;
    let retractHint = '';
    if (p.status === 'pending_qc') retractHint = ' · QC bekliyor — otomatik geri çekme kuralına uygun';
    else if (p.job_type === 'appointment' && !hasApptLinkBlock) retractHint = ' · Randevu bağlı teslim yok — tarih beklemeden geri çekilebilir';
    else if (p.retraction_deadline_at && !deadlinePassed) retractHint = ' · Geri çekme için tarih bekleniyor';
    else retractHint = ' · Geri çekilebilir';
    const timeline = _jobPostSubs
      .filter((s) => s.job_post_id === p.id)
      .slice(0, 3)
      .map((s) => `${new Date(s.created_at).toLocaleDateString('tr-TR')} ${s.status}`)
      .join(' · ');
    return `<div class="card" style="padding:10px;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
<div>
<div style="font-size:13px;font-weight:800;">${_jmEsc(p.title || 'İş ilanı')}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_jmEsc(p.job_type || 'custom')}${apptCat ? ` · <span style="color:var(--text-2);font-weight:600;">${_jmEsc(apptCat)}</span>` : ''} · ${_jmEsc(p.city || 'Bölge serbest')} · Son: ${deadline}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">İşlem başı: <b>${Number(p.unit_price || p.budget || 0).toFixed(2)} ${_jmEsc(p.currency || 'TRY')}</b> · Adet: <b>${Number(p.quantity || slots.length || 1)}</b> · Toplam: <b>${Number(p.budget || 0).toFixed(2)}</b> · Çalışan: <b>${workingCnt}</b> · Eşleşme: <b>${score}</b>/100</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">Geri çekme: <b>${p.retraction_deadline_at ? new Date(p.retraction_deadline_at).toLocaleString('tr-TR') : 'otomatik kural'}</b>${retractHint}</div>
</div>
<div><span class="badge badge-blue">${_jmEsc(p.status || 'published')}</span></div>
</div>
${p.description ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;">${_jmEsc(p.description)}</div>` : ''}
${slots.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;">Slotlar: ${slots.slice(0,4).map((s) => `${new Date(s.slot_start_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}-${new Date(s.slot_end_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`).join(' | ')}${slots.length>4?' ...':''}</div>` : ''}
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px;">
${slots.length && p.job_type === 'appointment' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openJobSlotsModal('${p.id}')">Takvimi aç (${slots.length})</button>` : ''}
${!isOwner ? `<button type="button" class="btn btn-ghost btn-sm" onclick="joinJobPost('${p.id}')">${myWorker ? 'Çalışıyorum' : 'Buna çalışacağım'}</button>` : `<span style="font-size:11px;color:var(--text-3);">İlan sahibi sizsiniz</span>`}
${canWithdrawUi ? `<button type="button" class="btn btn-ghost btn-sm" style="border-color:var(--red);color:var(--red);" onclick="withdrawJobPost('${p.id}')">İlanı geri çek</button>` : ''}
${!isOwner ? `<button type="button" class="btn btn-primary btn-sm" onclick="openJobSubmissionModal('${p.id}')">Teslim gir</button>` : ''}
${mySubs.length ? `<span style="font-size:11px;color:var(--text-3);">${mySubs.length} teslim kaydı</span>` : ''}
</div>
${timeline ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;">Timeline: ${_jmEsc(timeline)}</div>` : ''}
</div>`;
  }).join('');
  syncJobMarketFilterUi();
}

async function createJobPost() {
  const perms = await getJobPermissions();
  if (!perms.can_publish_job) { toast('İlan yayınlama yetkiniz yok', 'err'); return; }
  const ownerFirmId = currentUser?.role === 'super_admin'
    ? (document.getElementById('jm-owner-firm')?.value || currentUser?.firm_id)
    : (getActiveFirmId() || currentUser?.firm_id);
  const title = String(document.getElementById('jm-title')?.value || '').trim();
  const description = String(document.getElementById('jm-description')?.value || '').trim();
  const jobType = String(document.getElementById('jm-type')?.value || 'custom').trim();
  const unitPrice = Number(document.getElementById('jm-unit-price')?.value || 0);
  const quantity = Number(document.getElementById('jm-quantity')?.value || 1);
  const budget = Math.round(unitPrice * quantity * 100) / 100;
  const qcMode = String(document.getElementById('jm-qc-mode')?.value || 'required').trim();
  const currency = String(document.getElementById('jm-currency')?.value || 'EUR').trim().toUpperCase();
  const apptCat = String(document.getElementById('jm-appt-category')?.value || '').trim();
  const country = String(document.getElementById('jm-country')?.value || '').trim();
  const city = String(document.getElementById('jm-city')?.value || '').trim();
  const radiusKm = Number(document.getElementById('jm-radius')?.value || 0);
  const retractRaw = String(document.getElementById('jm-retract-by')?.value || '').trim();
  const deadline = document.getElementById('jm-deadline')?.value || null;
  const slotDate = String(document.getElementById('jm-slot-date')?.value || '').trim();
  const slotStart = String(document.getElementById('jm-slot-start')?.value || '').trim();
  const slotEnd = String(document.getElementById('jm-slot-end')?.value || '').trim();
  const polygonTxt = String(document.getElementById('jm-polygon')?.value || '').trim();
  let polygon = null;
  if (!title || unitPrice <= 0 || quantity <= 0) {
    toast('Başlık, işlem başı ücret ve adet zorunlu', 'warn');
    return;
  }
  if (jobType === 'appointment' && (!slotDate || !slotStart || !slotEnd)) {
    toast('Randevu için önce Takvimden slot oluştur ile gün ve saat seçin', 'warn');
    return;
  }
  if (!retractRaw) {
    toast('Geri çekme tarih/saat alanı zorunlu', 'warn');
    return;
  }
  const retractDt = new Date(retractRaw);
  if (!Number.isFinite(retractDt.getTime())) {
    toast('Geri çekme tarihi geçersiz', 'warn');
    return;
  }
  const retractionDeadlineAt = retractDt.toISOString();
  if (polygonTxt) {
    try { polygon = JSON.parse(polygonTxt); } catch (e) { toast('Polygon JSON geçersiz', 'warn'); return; }
  }
  let requirementsPayload = description;
  if (jobType === 'appointment' && apptCat) {
    requirementsPayload = `JM_APPOINTMENT_CATEGORY:${apptCat}\n${description}`;
  }
  const wallet = await getFirmWallet(ownerFirmId);
  if (budget > wallet.available) {
    toast('Toplam ücret kullanılabilir bakiyeyi aşıyor', 'err');
    return;
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_job_post`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_title: title,
        p_description: description,
        p_job_type: jobType,
        p_budget: budget,
        p_unit_price: unitPrice,
        p_quantity: quantity,
        p_currency: currency,
        p_requester_firm_id: ownerFirmId,
        p_country: country || null,
        p_city: city || null,
        p_postal_code: null,
        p_radius_km: radiusKm || null,
        p_polygon_geojson: polygon,
        p_requirements: requirementsPayload || null,
        p_deadline_at: deadline ? new Date(deadline).toISOString() : null,
        p_qc_mode: qcMode,
        p_slot_date: slotDate || null,
        p_slot_start: slotStart || null,
        p_slot_end: slotEnd || null,
        p_retraction_deadline_at: retractionDeadlineAt
      })
    });
    if (!res.ok) throw new Error(await res.text());
    if (typeof logAuditEvent === 'function') await logAuditEvent('job_post_created', 'job_post', title, { budget, unit_price: unitPrice, quantity, currency, qc_mode: qcMode, owner_firm_id: ownerFirmId });
    toast('İlan yayınlandı', 'ok');
    await refreshWalletInfo();
    await loadJobPosts();
  } catch (e) {
    toast('İlan açılamadı: ' + (e.message || ''), 'err');
  }
}

async function withdrawJobPost(jobPostId) {
  if (!jobPostId) return;
  if (!confirm('İlanı geri çekmek rezerv tutarını iade eder ve ilanı iptal eder. Onaylıyor musunuz?')) return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/withdraw_job_post`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_job_post_id: jobPostId })
    });
    const txt = await res.text();
    let rows;
    try {
      rows = txt ? JSON.parse(txt) : [];
    } catch (_) {
      rows = [];
    }
    if (!res.ok) throw new Error(txt || res.statusText);
    const row = rows?.[0];
    if (!row?.ok) {
      const msg = String(row?.message || '');
      const friendly = {
        not_authenticated: 'Oturum gerekli',
        not_allowed: 'Yetkiniz yok',
        job_not_found: 'İlan bulunamadı',
        job_not_withdrawable: 'Bu ilan geri çekilemez',
        retraction_not_yet_allowed: 'Geri çekme zamanı henüz gelmedi',
        job_has_approved_submission: 'Onaylı teslim var; geri çekilemez',
        appointment_already_linked: 'Randevuya bağlı teslim var; geri çekilemez'
      };
      toast(friendly[msg] || msg || 'Geri çekilemedi', 'warn');
      return;
    }
    toast('İlan geri çekildi', 'ok');
    await refreshWalletInfo();
    await loadJobPosts();
  } catch (e) {
    toast('Geri çekme başarısız: ' + (e.message || ''), 'err');
  }
}

function onJobTypeChange() {
  const t = String(document.getElementById('jm-type')?.value || 'custom');
  const slotWrap = document.getElementById('jm-slot-wrap');
  const apptWrap = document.getElementById('jm-appt-wrap');
  const calSec = document.getElementById('jm-calendar-section');
  if (calSec) calSec.style.display = t === 'appointment' ? '' : 'none';
  if (slotWrap) slotWrap.style.display = t === 'appointment' ? '' : 'none';
  if (apptWrap) apptWrap.style.display = t === 'appointment' ? 'flex' : 'none';
  updateJobPricePreview();
  if (t === 'appointment') syncJmSlotSummary();
  refreshJobSlotPreview();
  ensureJobMarketMap();
  refreshJobMarketMap();
}

function updateJobPricePreview() {
  const unitPrice = Number(document.getElementById('jm-unit-price')?.value || 0);
  const qty = Number(document.getElementById('jm-quantity')?.value || 1);
  const total = Math.max(0, unitPrice * qty);
  const el = document.getElementById('jm-price-preview');
  if (el) el.textContent = `Toplam ücret: ${total.toFixed(2)}`;
}

function ensureJobMarketMap() {
  const mapEl = document.getElementById('jm-map');
  if (!mapEl || typeof L === 'undefined') return;
  if (!_jobMap) {
    _jobMap = L.map(mapEl, { scrollWheelZoom: true }).setView([51.1657, 10.4515], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(_jobMap);
    _jobMap.on('click', (ev) => {
      _jobPolygonPoints.push([Number(ev.latlng.lng), Number(ev.latlng.lat)]);
      drawJobPolygon();
    });
    if (typeof ResizeObserver !== 'undefined' && !mapEl._jmResizeObs) {
      mapEl._jmResizeObs = new ResizeObserver(() => {
        try {
          _jobMap?.invalidateSize({ animate: false });
        } catch (_) {}
      });
      mapEl._jmResizeObs.observe(mapEl);
    }
  }
  const fix = () => {
    try {
      _jobMap?.invalidateSize({ animate: false });
    } catch (_) {}
  };
  requestAnimationFrame(() => {
    fix();
    setTimeout(fix, 120);
    setTimeout(fix, 450);
  });
}

function drawJobPolygon() {
  if (!_jobMap) return;
  if (_jobPolygonLayer) _jobMap.removeLayer(_jobPolygonLayer);
  _jobVertexMarkers.forEach((m) => _jobMap.removeLayer(m));
  _jobVertexMarkers = [];
  const latLngs = _jobPolygonPoints.map((p) => [p[1], p[0]]);
  if (latLngs.length >= 2) {
    const closed = _jobPolygonPoints.length >= 3 && _jobPolygonPoints[0][0] === _jobPolygonPoints[_jobPolygonPoints.length - 1][0] && _jobPolygonPoints[0][1] === _jobPolygonPoints[_jobPolygonPoints.length - 1][1];
    _jobPolygonLayer = (closed ? L.polygon(latLngs, { color: '#2563eb', fillOpacity: 0.1 }) : L.polyline(latLngs, { color: '#2563eb' })).addTo(_jobMap);
  }
  _jobPolygonPoints.forEach((p, i) => {
    const isLastDuplicate = i === _jobPolygonPoints.length - 1 && _jobPolygonPoints.length >= 2 && p[0] === _jobPolygonPoints[0][0] && p[1] === _jobPolygonPoints[0][1];
    if (isLastDuplicate) return;
    const marker = L.circleMarker([p[1], p[0]], { radius: 5, color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.8, draggable: true });
    marker.addTo(_jobMap);
    marker.on('mousedown', () => {
      if (!_jobMap?.dragging) return;
      _jobMap.dragging.disable();
    });
    marker.on('mouseup', () => _jobMap?.dragging?.enable());
    marker.on('mousemove', (ev) => {
      if (!(ev.originalEvent?.buttons & 1)) return;
      const latlng = ev.latlng || marker.getLatLng();
      _jobPolygonPoints[i] = [Number(latlng.lng), Number(latlng.lat)];
      if (_jobPolygonPoints.length >= 2 && _jobPolygonPoints[0][0] === _jobPolygonPoints[_jobPolygonPoints.length - 1][0] && _jobPolygonPoints[0][1] === _jobPolygonPoints[_jobPolygonPoints.length - 1][1]) {
        _jobPolygonPoints[_jobPolygonPoints.length - 1] = [..._jobPolygonPoints[0]];
      }
      drawJobPolygon();
    });
    _jobVertexMarkers.push(marker);
  });
  const polyEl = document.getElementById('jm-polygon');
  if (polyEl) {
    polyEl.value = JSON.stringify({
      type: 'Polygon',
      coordinates: [_jobPolygonPoints.length >= 3 ? [..._jobPolygonPoints, _jobPolygonPoints[0]] : _jobPolygonPoints]
    });
  }
}

function closeJobPolygon() {
  if (_jobPolygonPoints.length >= 3 && !(_jobPolygonPoints[0][0] === _jobPolygonPoints[_jobPolygonPoints.length - 1][0] && _jobPolygonPoints[0][1] === _jobPolygonPoints[_jobPolygonPoints.length - 1][1])) {
    _jobPolygonPoints = [..._jobPolygonPoints, [..._jobPolygonPoints[0]]];
    drawJobPolygon();
  }
}

function undoJobPolygonPoint() {
  if (!_jobPolygonPoints.length) return;
  const closed = _jobPolygonPoints.length >= 2 && _jobPolygonPoints[0][0] === _jobPolygonPoints[_jobPolygonPoints.length - 1][0] && _jobPolygonPoints[0][1] === _jobPolygonPoints[_jobPolygonPoints.length - 1][1];
  if (closed) _jobPolygonPoints.pop();
  _jobPolygonPoints.pop();
  drawJobPolygon();
}

function clearJobPolygon() {
  _jobPolygonPoints = [];
  if (_jobMap && _jobPolygonLayer) {
    _jobMap.removeLayer(_jobPolygonLayer);
    _jobPolygonLayer = null;
  }
  _jobVertexMarkers.forEach((m) => _jobMap?.removeLayer(m));
  _jobVertexMarkers = [];
  const polyEl = document.getElementById('jm-polygon');
  if (polyEl) polyEl.value = '';
}

async function joinJobPost(jobPostId) {
  const perms = await getJobPermissions();
  if (!perms.can_join_job) { toast('Bu işe katılma yetkiniz yok', 'err'); return; }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/join_job_post`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_job_post_id: jobPostId })
    });
    if (!res.ok) throw new Error(await res.text());
    toast('İşe çalışma kaydınız alındı', 'ok');
    await loadJobPosts();
  } catch (e) {
    toast('Katılım başarısız: ' + (e.message || ''), 'err');
  }
}

function openJobSubmissionModal(jobPostId) {
  document.getElementById('jm-submit-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'jm-submit-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:520px;">
<div class="modal-hdr"><div class="modal-title">Teslim Gir</div><button class="modal-close" onclick="document.getElementById('jm-submit-modal').remove()">✕</button></div>
<div style="padding:14px 20px;display:flex;flex-direction:column;gap:8px;">
<select class="form-input" id="jm-submit-type">
<option value="appointment">Randevu</option>
<option value="lead">Lead</option>
<option value="field_task">Saha işi</option>
<option value="call_capacity">Çağrı kapasitesi</option>
<option value="custom">Diğer</option>
</select>
<input class="form-input" id="jm-submit-appointment" placeholder="Appointment ID (opsiyonel)">
<input class="form-input" id="jm-submit-fieldtask" placeholder="Field Task ID (opsiyonel)">
<textarea class="form-input" id="jm-submit-payload" rows="4" placeholder='Payload JSON (örn: {\"note\":\"ilk randevu\"})'></textarea>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('jm-submit-modal').remove()">Vazgeç</button>
<button class="btn btn-primary" onclick="submitJobSubmission('${jobPostId}')">Teslim Gönder</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

async function submitJobSubmission(jobPostId) {
  const perms = await getJobPermissions();
  if (!perms.can_submit_job) { toast('Teslim girme yetkiniz yok', 'err'); return; }
  const type = String(document.getElementById('jm-submit-type')?.value || 'custom').trim();
  const appointmentId = String(document.getElementById('jm-submit-appointment')?.value || '').trim() || null;
  const fieldTaskId = String(document.getElementById('jm-submit-fieldtask')?.value || '').trim() || null;
  const payloadText = String(document.getElementById('jm-submit-payload')?.value || '').trim();
  let payload = {};
  if (payloadText) {
    try { payload = JSON.parse(payloadText); } catch (e) { toast('Payload JSON geçersiz', 'warn'); return; }
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/submit_job_submission`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_job_post_id: jobPostId,
        p_submission_type: type,
        p_payload: payload,
        p_appointment_id: appointmentId,
        p_field_task_id: fieldTaskId,
        p_idempotency_key: `${currentUser?.id || 'u'}-${jobPostId}-${Date.now()}`
      })
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('jm-submit-modal')?.remove();
    toast('Teslim başarıyla gönderildi', 'ok');
    await loadJobPosts();
    if (typeof loadJobMarketQcQueue === 'function') loadJobMarketQcQueue();
  } catch (e) {
    toast('Teslim gönderilemedi: ' + (e.message || ''), 'err');
  }
}

function setJobListTab(tab) {
  _jobListTab = tab;
  syncJobMarketFilterUi();
  renderJobPostList();
}

function setJobPreset(preset) {
  _jobPreset = preset || '';
  syncJobMarketFilterUi();
  renderJobPostList();
}

async function loadJobMarketKpi() {
  const wrap = document.getElementById('dash-job-market-kpi');
  if (!wrap) return;
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
  wrap.style.display = canView ? '' : 'none';
  if (!canView) return;
  const jobs = await sb(`job_posts?select=id,status,created_at,first_submission_at,retraction_deadline_at&order=created_at.desc&limit=400`).catch(() => []);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  set('kpi-job-published', (jobs || []).filter((x) => ['published', 'in_progress'].includes(x.status)).length);
  set('kpi-job-qc', (jobs || []).filter((x) => x.status === 'pending_qc').length);
  set('kpi-job-done', (jobs || []).filter((x) => x.status === 'completed').length);
  const subs = await sb(`job_submissions?select=status,created_at,reviewed_at,job_post_id&order=created_at.desc&limit=800`).catch(() => []);
  const rejected = (subs || []).filter((s) => s.status === 'rejected').length;
  const reviewed = (subs || []).filter((s) => ['approved', 'rejected'].includes(s.status)).length;
  const rejectRate = reviewed ? ((rejected / reviewed) * 100).toFixed(1) : '0.0';
  const closeCandidates = (jobs || []).filter((j) => j.status === 'completed' && j.created_at && j.first_submission_at);
  let avgClose = 0;
  if (closeCandidates.length) {
    avgClose = Math.round(closeCandidates.reduce((acc, j) => acc + ((new Date(j.first_submission_at).getTime() - new Date(j.created_at).getTime()) / 60000), 0) / closeCandidates.length);
  }
  if (!document.getElementById('kpi-job-advanced')) {
    const el = document.createElement('div');
    el.id = 'kpi-job-advanced';
    el.style.cssText = 'margin-top:6px;font-size:11px;color:var(--text-3);';
    wrap.appendChild(el);
  }
  const adv = document.getElementById('kpi-job-advanced');
  if (adv) adv.textContent = `Reject oranı: %${rejectRate} | Ortalama kapanış: ${avgClose} dk`;
  const nowMs = Date.now();
  const retractable = (jobs || []).filter((j) => {
    if (!['published', 'in_progress', 'pending_qc'].includes(j.status)) return false;
    if (j.status === 'pending_qc') return true;
    if (j.job_type === 'appointment' && j.retraction_deadline_at && new Date(j.retraction_deadline_at).getTime() <= nowMs) return true;
    if (j.retraction_deadline_at && new Date(j.retraction_deadline_at).getTime() <= nowMs) return true;
    return false;
  }).length;
  const seriesElId = 'kpi-job-retract-hint';
  if (!document.getElementById(seriesElId)) {
    const t = document.createElement('div');
    t.id = seriesElId;
    t.style.cssText = 'margin-top:6px;font-size:11px;color:var(--text-3);';
    wrap.appendChild(t);
  }
  const tEl = document.getElementById(seriesElId);
  if (tEl) tEl.textContent = `Geri çekmeye uygun (tahmini): ${retractable} · Otomatik kural + tarih`;
}

function exportJobPolygon() {
  const text = document.getElementById('jm-polygon')?.value || '';
  if (!text.trim()) { toast('Polygon yok', 'warn'); return; }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `job-polygon-${Date.now()}.geojson`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJobPolygon(fileInput) {
  const file = fileInput?.files?.[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const geo = JSON.parse(String(fr.result || '{}'));
      const coords = geo?.coordinates?.[0] || [];
      _jobPolygonPoints = coords.map((p) => [Number(p[0]), Number(p[1])]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      drawJobPolygon();
      toast('Polygon içe aktarıldı', 'ok');
    } catch (e) {
      toast('GeoJSON geçersiz', 'err');
    }
  };
  fr.readAsText(file);
  fileInput.value = '';
}
