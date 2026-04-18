// ─────────────────────────────────────────────
// Personel performans — admin & süper admin
// Termin (appointments) + arama (call_logs), Chart.js
// ─────────────────────────────────────────────

function canUsePerformancePage() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

/** Chart.js canvas CSS değişkenlerini okuyamaz; siyah çubuk önlemek için gerçek renk. */
function perfThemeAccentHex() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
  } catch (e) {}
  return '#2563eb';
}

function perfHexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
  if (!m) return `rgba(37,99,235,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

let _perfRawAppts = [];
let _perfRawCalls = [];
let _perfFiltAppts = [];
let _perfFiltCalls = [];
let _perfCharts = {};
let _perfChartPeriod = 'daily';
let _perfCompType = 'termin';
let _perfTmSort = 'total';

function _perfDurKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'qc_bekleniyor';
  if (typeof contactStatusToAppointmentResult === 'function') {
    return _normResultKey(contactStatusToAppointmentResult(s));
  }
  return _normResultKey(s);
}

function perfApptBucket(durumRaw) {
  const k = _perfDurKey(durumRaw);
  if (k === 'basarili') return 'ok';
  if (k === 'beklemede') return 'pend';
  if (k === 'qc_bekleniyor') return 'qc';
  if (k === 'basarisiz' || k === 'iptal' || k === 'ulasilamadi') return 'fail';
  return 'other';
}

function perfApptLabel(row) {
  const fid = getActiveFirmId() || currentUser?.firm_id;
  const defs = (fid && window._apptResultsByFirm?.[fid]) || defaultAppointmentResults();
  const k = _perfDurKey(row.durum);
  const d = defs.find((x) => x.key === k);
  return d?.label || k;
}

function _perfCallDur(l) {
  return Number(l.duration_sec ?? l.duration_seconds ?? 0) || 0;
}

function _perfIsApptOutcome(o) {
  return o === 'appointment' || o === 'appointment_done';
}

function perfDestroyCharts() {
  Object.keys(_perfCharts).forEach((k) => {
    try {
      _perfCharts[k].destroy();
    } catch (e) {}
    delete _perfCharts[k];
  });
}

function perfFmtDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function perfSetQuickRange(key, ev) {
  const today = new Date();
  let s;
  let e;
  if (key === 'today') {
    s = new Date(today);
    e = new Date(today);
  } else if (key === 'week') {
    const dow = today.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    s = new Date(today);
    s.setDate(today.getDate() + diff);
    e = new Date(s);
    e.setDate(s.getDate() + 6);
  } else if (key === 'month') {
    s = new Date(today.getFullYear(), today.getMonth(), 1);
    e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (key === 'lastweek') {
    const lw = new Date(today);
    lw.setDate(today.getDate() - 7);
    const dow = lw.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    s = new Date(lw);
    s.setDate(lw.getDate() + diff);
    e = new Date(s);
    e.setDate(s.getDate() + 6);
  } else if (key === 'lastmonth') {
    s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    e = new Date(today.getFullYear(), today.getMonth(), 0);
  } else {
    s = new Date(2020, 0, 1);
    e = new Date(today.getFullYear() + 1, 11, 31);
  }
  const fs = document.getElementById('perf-date-from');
  const fe = document.getElementById('perf-date-to');
  if (fs) fs.value = perfFmtDateInput(s);
  if (fe) fe.value = perfFmtDateInput(e);
  document.querySelectorAll('.perf-range-btn').forEach((b) => b.classList.remove('active'));
  const rb = ev?.currentTarget || ev?.target?.closest?.('.perf-range-btn') || document.querySelector(`.perf-range-btn[data-perf-range="${key}"]`);
  rb?.classList?.add('active');
  perfReload();
}

function perfApplyClientFilters() {
  const agentId = document.getElementById('perf-agent')?.value || '';
  const campId = document.getElementById('perf-campaign')?.value || '';
  const st = document.getElementById('perf-status')?.value || '';
  const apptF = (a) => {
    if (agentId && String(a.agent_id) !== agentId) return false;
    if (campId && String(a.campaign_id) !== campId) return false;
    if (st) {
      const b = perfApptBucket(a.durum);
      if (b !== st) return false;
    }
    return true;
  };
  const callF = (c) => {
    if (agentId && String(c.agent_id) !== agentId) return false;
    if (campId && String(c.campaign_id) !== campId) return false;
    return true;
  };
  _perfFiltAppts = _perfRawAppts.filter(apptF);
  _perfFiltCalls = _perfRawCalls.filter(callF);
}

function perfAgentName(id, fallback) {
  if (!id) return fallback || '—';
  const row = _perfRawAppts.find((a) => String(a.agent_id) === String(id));
  if (row?.users?.name) return row.users.name;
  const c = _perfRawCalls.find((x) => String(x.agent_id) === String(id));
  if (c?.users?.name) return c.users.name;
  return fallback || String(id).slice(0, 8);
}

function perfAggregateAppts(appts) {
  const by = {};
  appts.forEach((a) => {
    const id = a.agent_id || '_none';
    if (!by[id]) {
      by[id] = { agent_id: id, name: perfAgentName(id, a.users?.name), ok: 0, pend: 0, qc: 0, fail: 0, other: 0, total: 0 };
    }
    by[id].total++;
    const b = perfApptBucket(a.durum);
    if (b === 'ok') by[id].ok++;
    else if (b === 'pend') by[id].pend++;
    else if (b === 'qc') by[id].qc++;
    else if (b === 'fail') by[id].fail++;
    else by[id].other++;
  });
  return by;
}

function perfAggregateCalls(calls) {
  const by = {};
  calls.forEach((c) => {
    const id = c.agent_id || '_none';
    if (!by[id]) {
      by[id] = { agent_id: id, name: perfAgentName(id, c.users?.name), calls: 0, appt: 0, neg: 0, cb: 0, na: 0, vm: 0, dur: 0 };
    }
    by[id].calls++;
    const o = c.outcome;
    if (_perfIsApptOutcome(o)) by[id].appt++;
    else if (o === 'negative') by[id].neg++;
    else if (o === 'callback') by[id].cb++;
    else if (o === 'no_answer') by[id].na++;
    else if (o === 'voicemail') by[id].vm++;
    by[id].dur += _perfCallDur(c);
  });
  return by;
}

function perfMergedRows() {
  const a = perfAggregateAppts(_perfFiltAppts);
  const c = perfAggregateCalls(_perfFiltCalls);
  const ids = new Set([...Object.keys(a), ...Object.keys(c)]);
  const rows = [];
  ids.forEach((id) => {
    const ta = a[id] || { agent_id: id, name: perfAgentName(id), ok: 0, pend: 0, qc: 0, fail: 0, other: 0, total: 0 };
    const tc = c[id] || { agent_id: id, name: ta.name, calls: 0, appt: 0, neg: 0, cb: 0, na: 0, vm: 0, dur: 0 };
    const name = ta.name || tc.name;
    const rate = ta.total > 0 ? Math.round((ta.ok / ta.total) * 100) : 0;
    const conv = tc.calls > 0 ? Math.round((tc.appt / tc.calls) * 100) : 0;
    const avgSec = tc.calls > 0 ? Math.round(tc.dur / tc.calls) : 0;
    const eff = tc.calls > 0 ? Math.round((ta.ok / tc.calls) * 100) : 0;
    rows.push({ ...ta, ...tc, name, rate, conv, avgSec, eff });
  });
  return rows;
}

function perfUpdateHeaderSummary() {
  const all = _perfRawAppts;
  const total = all.length;
  const ok = all.filter((a) => perfApptBucket(a.durum) === 'ok').length;
  const rate = total > 0 ? Math.round((ok / total) * 100) : 0;
  const agents = new Set(all.map((a) => a.agent_id).filter(Boolean));
  const avg = agents.size > 0 ? Math.round(total / agents.size) : 0;
  const days = new Set(all.map((a) => String(a.termin_tarih || '').slice(0, 10)).filter(Boolean));
  const el = (id, v) => {
    const n = document.getElementById(id);
    if (n) n.textContent = v;
  };
  el('perf-sum-total', String(total));
  el('perf-sum-rate', `${rate}%`);
  el('perf-sum-avg', String(avg));
  el('perf-sum-days', String(days.size));
  const ac = new Set([..._perfRawAppts.map((a) => a.agent_id), ..._perfRawCalls.map((c) => c.agent_id)].filter(Boolean));
  el('perf-sum-agents', String(ac.size));
  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  el('perf-sum-date', new Date().toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }));
}

function perfUpdateCards() {
  const d = _perfFiltAppts;
  const total = d.length;
  const ok = d.filter((a) => perfApptBucket(a.durum) === 'ok').length;
  const pend = d.filter((a) => perfApptBucket(a.durum) === 'pend').length;
  const qc = d.filter((a) => perfApptBucket(a.durum) === 'qc').length;
  const fail = d.filter((a) => perfApptBucket(a.durum) === 'fail').length;
  const set = (id, v) => {
    const n = document.getElementById(id);
    if (n) n.textContent = v;
  };
  set('perf-card-total', String(total));
  set('perf-card-ok', String(ok));
  set('perf-card-pend', String(pend));
  set('perf-card-qc', String(qc));
  set('perf-card-fail', String(fail));
  set('perf-card-okpct', `${total > 0 ? Math.round((ok / total) * 100) : 0}%`);
  const calls = _perfFiltCalls;
  const ctot = calls.length;
  const cap = calls.filter((x) => _perfIsApptOutcome(x.outcome)).length;
  const cavg = ctot > 0 ? Math.round(calls.reduce((s, x) => s + _perfCallDur(x), 0) / ctot) : 0;
  const mm = Math.floor(cavg / 60);
  const ss = String(cavg % 60).padStart(2, '0');
  set('perf-call-total', String(ctot));
  set('perf-call-appt', String(cap));
  set('perf-call-conv', `${ctot > 0 ? Math.round((cap / ctot) * 100) : 0}%`);
  set('perf-call-avg', `${mm}:${ss}`);
}

function perfGroupTrend(appts) {
  const labels = [];
  const success = [];
  const tot = [];
  const sorted = [...appts].sort((a, b) => String(a.termin_tarih).localeCompare(String(b.termin_tarih)));
  const map = new Map();
  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  sorted.forEach((a) => {
    const raw = a.termin_tarih;
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    let key;
    if (_perfChartPeriod === 'daily') {
      key = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
    } else if (_perfChartPeriod === 'weekly') {
      const onejan = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d - onejan) / 86400000);
      key = `W${Math.ceil((days + onejan.getDay() + 1) / 7)} ${d.getFullYear()}`;
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!map.has(key)) map.set(key, { t: 0, s: 0 });
    const e = map.get(key);
    e.t++;
    if (perfApptBucket(a.durum) === 'ok') e.s++;
  });
  map.forEach((v, k) => {
    labels.push(k);
    tot.push(v.t);
    success.push(v.s);
  });
  return { labels, success, tot };
}

function perfEnsureChart(key, canvasId, factory) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (_perfCharts[key]) {
    try {
      _perfCharts[key].destroy();
    } catch (e) {}
    delete _perfCharts[key];
  }
  const ctx = canvas.getContext('2d');
  _perfCharts[key] = factory(ctx);
  return _perfCharts[key];
}

function perfUpdateCharts() {
  const tr = currentLang === 'tr';
  const L = {
    ok: tr ? 'Başarılı' : 'Erfolgreich',
    tot: tr ? 'Toplam termin' : 'Gesamt',
    rate: tr ? 'Başarı %' : 'Quote %',
    apBar: tr ? 'Termin sayısı' : 'Termine',
  };
  const trend = perfGroupTrend(_perfFiltAppts);
  const ChartCtor = window.Chart;
  if (!ChartCtor) return;
  const accentHex = perfThemeAccentHex();
  perfEnsureChart('trend', 'perf-chart-trend', (ctx) => new ChartCtor(ctx, {
    type: 'line',
    data: {
      labels: trend.labels,
      datasets: [
        { label: L.ok, data: trend.success, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.08)', tension: 0.3, fill: true },
        { label: L.tot, data: trend.tot, borderColor: accentHex, backgroundColor: perfHexToRgba(accentHex, 0.06), tension: 0.3, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } },
    },
  }));

  const d = _perfFiltAppts;
  const ok = d.filter((a) => perfApptBucket(a.durum) === 'ok').length;
  const pend = d.filter((a) => perfApptBucket(a.durum) === 'pend').length;
  const qc = d.filter((a) => perfApptBucket(a.durum) === 'qc').length;
  const fail = d.filter((a) => perfApptBucket(a.durum) === 'fail').length;
  const other = Math.max(0, d.length - ok - pend - qc - fail);
  perfEnsureChart('status', 'perf-chart-status', (ctx) => new ChartCtor(ctx, {
    type: 'doughnut',
    data: {
      labels: [L.ok, tr ? 'Beklemede' : 'Ausstehend', 'QC', tr ? 'Başarısız/İptal' : 'Fehlgeschlagen', tr ? 'Diğer' : 'Andere'],
      datasets: [{ data: [ok, pend, qc, fail, other], backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#94a3b8'], borderWidth: 2, borderColor: '#fff' }],
    },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } },
  }));

  const rows = perfMergedRows().filter((r) => r.agent_id && r.agent_id !== '_none').sort((a, b) => b.rate - a.rate).slice(0, 12);
  perfEnsureChart('ratebar', 'perf-chart-rate', (ctx) => new ChartCtor(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ label: L.rate, data: rows.map((r) => r.rate), backgroundColor: rows.map((r) => (r.rate >= 70 ? '#10b981' : r.rate >= 40 ? '#f59e0b' : '#ef4444')), borderWidth: 0, borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false } },
    },
  }));

  const rows2 = perfMergedRows().filter((r) => r.agent_id && r.agent_id !== '_none').slice(0, 15);
  const data = rows2.map((r) => {
    if (_perfCompType === 'success') return r.rate;
    if (_perfCompType === 'efficiency') return r.eff;
    return r.total;
  });
  const barColors = rows2.map(() => perfHexToRgba(accentHex, 0.75));
  perfEnsureChart('agents', 'perf-chart-agents', (ctx) => new ChartCtor(ctx, {
    type: 'bar',
    data: {
      labels: rows2.map((r) => r.name),
      datasets: [{ label: L.apBar, data, backgroundColor: barColors, borderWidth: 0, borderRadius: 6, maxBarThickness: 48 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } } },
      plugins: { legend: { display: false } },
    },
  }));
}

function perfRenderMainTable(sortKey) {
  const tbody = document.getElementById('perf-tbody-main');
  if (!tbody) return;
  let rows = perfMergedRows().filter((r) => r.agent_id && r.agent_id !== '_none');
  if (sortKey === 'total') rows.sort((a, b) => b.total - a.total);
  else if (sortKey === 'ok') rows.sort((a, b) => b.ok - a.ok);
  else if (sortKey === 'rate') rows.sort((a, b) => b.rate - a.rate);
  else if (sortKey === 'calls') rows.sort((a, b) => b.calls - a.calls);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--text-3);">${currentLang === 'de' ? 'Keine Daten' : 'Veri yok'}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r) => `
<tr>
<td style="font-weight:700;">${_uiEsc(r.name)}</td>
<td class="td-mono">${r.total}</td>
<td><span class="badge badge-green">${r.ok}</span></td>
<td><span class="badge badge-yellow">${r.pend}</span></td>
<td><span class="badge" style="background:var(--accent-soft);color:var(--accent);">${r.qc}</span></td>
<td><span class="badge badge-red">${r.fail}</span></td>
<td style="font-weight:800;">${r.rate}%</td>
<td class="td-mono">${r.calls}</td>
<td><span class="badge badge-green">${r.appt}</span></td>
<td style="font-weight:700;">${r.conv}%</td>
<td class="td-mono">${Math.floor(r.avgSec / 60)}:${String(r.avgSec % 60).padStart(2, '0')}</td>
<td><button type="button" class="btn btn-ghost btn-sm" onclick="perfOpenAgentModal('${String(r.agent_id).replace(/'/g, '')}')"><i class="ph ph-list-magnifying-glass"></i></button></td>
</tr>`).join('');
}

function perfRenderThisMonth() {
  const tbody = document.getElementById('perf-tbody-month');
  if (!tbody) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const tm = _perfRawAppts.filter((a) => {
    const d = new Date(a.termin_tarih);
    return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
  });
  if (!tm.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-3);">${currentLang === 'de' ? 'Keine Termine diesen Monat' : 'Bu ay termin yok'}</td></tr>`;
    return;
  }
    const agg = perfAggregateAppts(tm);
    let list = Object.values(agg).filter((r) => r.agent_id && r.agent_id !== '_none');
  if (_perfTmSort === 'total') list.sort((a, b) => b.total - a.total);
  else if (_perfTmSort === 'ok') list.sort((a, b) => b.ok - a.ok);
  else list.sort((a, b) => (b.total ? b.ok / b.total : 0) - (a.total ? a.ok / a.total : 0));
  tbody.innerHTML = list.map((r) => {
    const rate = r.total > 0 ? Math.round((r.ok / r.total) * 100) : 0;
    return `<tr>
<td style="font-weight:700;">${_uiEsc(r.name)}</td>
<td class="td-mono">${r.total}</td>
<td><span class="badge badge-green">${r.ok}</span></td>
<td><span class="badge badge-yellow">${r.pend}</span></td>
<td><span class="badge" style="background:var(--accent-soft);color:var(--accent);">${r.qc}</span></td>
<td><span class="badge badge-red">${r.fail}</span></td>
<td style="font-weight:800;">${rate}%</td>
<td><button type="button" class="btn btn-ghost btn-sm" onclick="perfOpenAgentModal('${String(r.agent_id).replace(/'/g, '')}')"><i class="ph ph-list-magnifying-glass"></i></button></td>
</tr>`;
  }).join('');
}

function perfRenderRecent() {
  const ta = document.getElementById('perf-tbody-appts');
  const tc = document.getElementById('perf-tbody-calls');
  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  if (ta) {
    const ap = [..._perfFiltAppts].sort((a, b) => String(b.termin_tarih).localeCompare(String(a.termin_tarih))).slice(0, 40);
    ta.innerHTML = ap.length ? ap.map((a) => {
      const d = new Date(a.termin_tarih);
      const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const st = perfApptBucket(a.durum);
      const cls = st === 'ok' ? 'badge-green' : st === 'pend' ? 'badge-yellow' : st === 'qc' ? '' : 'badge-red';
      const agent = _uiEsc(a.users?.name || perfAgentName(a.agent_id));
      return `<tr><td class="td-mono" style="font-size:11px;">${ds}</td><td>${agent}</td><td>${_uiEsc(a.nachname || '—')}</td><td>${_uiEsc(a.campaigns?.name || '—')}</td><td><span class="badge ${cls}" style="${st === 'qc' ? 'background:var(--accent-soft);color:var(--accent);' : ''}">${_uiEsc(perfApptLabel(a))}</span></td></tr>`;
    }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;">—</td></tr>`;
  }
  if (tc) {
    const cl = [..._perfFiltCalls].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 40);
    const om = { appointment: 'Termin', appointment_done: 'Termin', negative: 'Olumsuz', callback: 'Geri Ara', voicemail: 'VM', no_answer: 'Yok', dnc: 'DNC' };
    tc.innerHTML = cl.length ? cl.map((c) => {
      const d = new Date(c.started_at);
      const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const dur = _perfCallDur(c);
      const dm = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
      const agent = _uiEsc(c.users?.name || perfAgentName(c.agent_id));
      const ol = om[c.outcome] || c.outcome || '—';
      return `<tr><td class="td-mono" style="font-size:11px;">${ds}</td><td>${agent}</td><td class="td-mono" style="font-size:11px;">${_uiEsc(c.phone || '—')}</td><td>${_uiEsc(c.campaigns?.name || '—')}</td><td><span class="badge badge-gray">${_uiEsc(ol)}</span></td><td class="td-mono">${dm}</td></tr>`;
    }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;">—</td></tr>`;
  }
}

function perfOpenAgentModal(agentId) {
  const modal = document.getElementById('perf-modal');
  const title = document.getElementById('perf-modal-title');
  const sub = document.getElementById('perf-modal-sub');
  const tb = document.getElementById('perf-modal-tbody');
  if (!modal || !tb) return;
  const name = perfAgentName(agentId);
  const ap = _perfFiltAppts.filter((a) => String(a.agent_id) === String(agentId));
  const cl = _perfFiltCalls.filter((c) => String(c.agent_id) === String(agentId));
  const ok = ap.filter((a) => perfApptBucket(a.durum) === 'ok').length;
  const ctot = cl.length;
  const cap = cl.filter((x) => _perfIsApptOutcome(x.outcome)).length;
  if (title) title.textContent = name;
  if (sub) {
    sub.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;font-size:12px;">
<div><div style="font-size:10px;color:var(--text-3);">Termin</div><div style="font-weight:800;">${ap.length}</div></div>
<div><div style="font-size:10px;color:var(--text-3);">Başarılı</div><div style="font-weight:800;color:var(--green);">${ok}</div></div>
<div><div style="font-size:10px;color:var(--text-3);">Arama</div><div style="font-weight:800;">${ctot}</div></div>
<div><div style="font-size:10px;color:var(--text-3);">Arama→Termin</div><div style="font-weight:800;">${ctot ? Math.round((cap / ctot) * 100) : 0}%</div></div>
</div>`;
  }
  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  const sorted = [...ap].sort((a, b) => String(b.termin_tarih).localeCompare(String(a.termin_tarih)));
  tb.innerHTML = sorted.length ? sorted.map((a) => {
    const d = new Date(a.termin_tarih);
    const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<tr>
<td class="td-mono" style="font-size:11px;">${ds}</td>
<td>${_uiEsc(a.nachname || '—')}</td>
<td class="td-mono">${_uiEsc(a.telefonnummer || '—')}</td>
<td>${_uiEsc([a.plz, a.ortschaft].filter(Boolean).join(' ') || '—')}</td>
<td>${_uiEsc(a.customers ? `${a.customers.code || ''} ${a.customers.name || ''}`.trim() : '—')}</td>
<td><span class="badge badge-gray">${_uiEsc(perfApptLabel(a))}</span></td>
<td style="font-size:11px;max-width:180px;">${_uiEsc(a.agent_notu || '—')}</td>
</tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-3);">—</td></tr>`;
  modal.style.display = 'flex';
}

function perfCloseModal() {
  const modal = document.getElementById('perf-modal');
  if (modal) modal.style.display = 'none';
}

function perfExportCsv() {
  const rows = perfMergedRows().filter((r) => r.agent_id && r.agent_id !== '_none');
  if (!rows.length) {
    toast(currentLang === 'de' ? 'Keine Daten' : 'Veri yok', 'warn');
    return;
  }
  const sep = ';';
  const h = ['Agent', 'Termin', 'Basarili', 'Beklemede', 'QC', 'Basarisiz', 'Oran%', 'Arama', 'AramaTermin', 'Donusum%', 'OrtSureSn'];
  const lines = [h.join(sep)];
  rows.forEach((r) => {
    lines.push([r.name, r.total, r.ok, r.pend, r.qc, r.fail, r.rate, r.calls, r.appt, r.conv, r.avgSec].join(sep));
  });
  const bom = '\ufeff';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `performans_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV', 'ok');
}

function perfWireEventsOnce() {
  if (window._perfWired) return;
  window._perfWired = true;
  document.getElementById('perf-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'perf-modal') perfCloseModal();
  });
}

function perfPopulateFilters() {
  const ag = document.getElementById('perf-agent');
  const cm = document.getElementById('perf-campaign');
  if (ag) {
    const cur = ag.value;
    const ids = [...new Set([..._perfRawAppts.map((a) => a.agent_id), ..._perfRawCalls.map((c) => c.agent_id)].filter(Boolean))];
    ag.innerHTML = `<option value="">${currentLang === 'de' ? 'Alle Agenten' : 'Tüm agentler'}</option>`;
    ids.sort((a, b) => perfAgentName(a).localeCompare(perfAgentName(b), 'tr'));
    ids.forEach((id) => {
      ag.innerHTML += `<option value="${id}">${_uiEsc(perfAgentName(id))}</option>`;
    });
    if (cur && ids.some((id) => String(id) === String(cur))) ag.value = cur;
  }
  if (cm) {
    const cur = cm.value;
    const ids = [...new Set([..._perfRawAppts.map((a) => a.campaign_id), ..._perfRawCalls.map((c) => c.campaign_id)].filter(Boolean))];
    cm.innerHTML = `<option value="">${currentLang === 'de' ? 'Alle Kampagnen' : 'Tüm kampanyalar'}</option>`;
    ids.forEach((id) => {
      const row = _perfRawAppts.find((a) => String(a.campaign_id) === String(id));
      const c2 = _perfRawCalls.find((c) => String(c.campaign_id) === String(id));
      const nm = row?.campaigns?.name || c2?.campaigns?.name || String(id).slice(0, 8);
      cm.innerHTML += `<option value="${id}">${_uiEsc(nm)}</option>`;
    });
    if (cur && ids.some((id) => String(id) === String(cur))) cm.value = cur;
  }
}

async function _perfFetchAppointments(from, to) {
  const ff = getFirmFilter('&');
  if (isSuperAdmin() && !getActiveFirmId()) return [];
  const cols = 'id,termin_tarih,durum,nachname,telefonnummer,plz,ortschaft,agent_id,campaign_id,customer_id,agent_notu,firm_id';
  let q = `appointments?select=${cols},users(name),campaigns(name),customers(name,code)${ff}&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&order=termin_tarih.asc&limit=15000`;
  try {
    return (await sb(q)) || [];
  } catch (e) {
    q = `appointments?select=${cols}${ff}&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&order=termin_tarih.asc&limit=15000`;
    const rows = (await sb(q).catch(() => [])) || [];
    if (!rows.length) return [];
    const aIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
    const cIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))];
    const uIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const uMap = {};
    const campMap = {};
    const custMap = {};
    if (aIds.length) {
      const uu = await sb(`users?id=in.(${aIds.join(',')})&select=id,name`).catch(() => []);
      (uu || []).forEach((u) => { uMap[u.id] = u; });
    }
    if (cIds.length) {
      const cc = await sb(`campaigns?id=in.(${cIds.join(',')})&select=id,name`).catch(() => []);
      (cc || []).forEach((c) => { campMap[c.id] = c; });
    }
    if (uIds.length) {
      const kk = await sb(`customers?id=in.(${uIds.join(',')})&select=id,name,code`).catch(() => []);
      (kk || []).forEach((k) => { custMap[k.id] = k; });
    }
    return rows.map((r) => ({
      ...r,
      users: r.agent_id && uMap[r.agent_id] ? { name: uMap[r.agent_id].name } : null,
      campaigns: r.campaign_id && campMap[r.campaign_id] ? { name: campMap[r.campaign_id].name } : null,
      customers: r.customer_id && custMap[r.customer_id] ? custMap[r.customer_id] : null,
    }));
  }
}

async function _perfFetchCalls(from, to) {
  const ff = getFirmFilter('&');
  if (isSuperAdmin() && !getActiveFirmId()) return [];
  const base = `call_logs?select=id,started_at,agent_id,campaign_id,outcome,phone,duration_sec,duration_seconds,users(name),campaigns(name)${ff}&started_at=gte.${from}T00:00:00&started_at=lte.${to}T23:59:59&order=started_at.desc&limit=15000`;
  try {
    return (await sb(base)) || [];
  } catch (e) {
    const simple = `call_logs?select=id,started_at,agent_id,campaign_id,outcome,phone,duration_sec,duration_seconds${ff}&started_at=gte.${from}T00:00:00&started_at=lte.${to}T23:59:59&order=started_at.desc&limit=15000`;
    const rows = (await sb(simple).catch(() => [])) || [];
    if (!rows.length) return [];
    const aIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
    const cIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))];
    const uMap = {};
    const campMap = {};
    if (aIds.length) {
      const uu = await sb(`users?id=in.(${aIds.join(',')})&select=id,name`).catch(() => []);
      (uu || []).forEach((u) => { uMap[u.id] = u; });
    }
    if (cIds.length) {
      const cc = await sb(`campaigns?id=in.(${cIds.join(',')})&select=id,name`).catch(() => []);
      (cc || []).forEach((c) => { campMap[c.id] = c; });
    }
    return rows.map((r) => ({
      ...r,
      users: r.agent_id && uMap[r.agent_id] ? { name: uMap[r.agent_id].name } : null,
      campaigns: r.campaign_id && campMap[r.campaign_id] ? { name: campMap[r.campaign_id].name } : null,
    }));
  }
}

async function perfReload() {
  const from = document.getElementById('perf-date-from')?.value;
  const to = document.getElementById('perf-date-to')?.value;
  if (!from || !to) {
    toast(currentLang === 'de' ? 'Daten wählen' : 'Tarih seçin', 'warn');
    return;
  }
  const ld = document.getElementById('perf-loading');
  if (ld) ld.style.display = 'flex';
  perfDestroyCharts();
  try {
    const fid = getActiveFirmId() || currentUser?.firm_id;
    if (fid) await loadFirmAppointmentResults(fid, true);
    const [ap, cl] = await Promise.all([_perfFetchAppointments(from, to), _perfFetchCalls(from, to)]);
    _perfRawAppts = ap;
    _perfRawCalls = cl;
    perfPopulateFilters();
    perfApplyClientFilters();
    perfUpdateHeaderSummary();
    perfUpdateCards();
    perfUpdateCharts();
       perfRenderMainTable('total');
    perfRenderThisMonth();
    perfRenderRecent();
    if (typeof applyLang === 'function') applyLang();
  } catch (e) {
    console.error(e);
    toast(String(e.message || e), 'err');
  } finally {
    if (ld) ld.style.display = 'none';
  }
}

function perfOnFilterChange() {
  perfApplyClientFilters();
  perfUpdateCards();
  perfUpdateCharts();
  perfRenderMainTable('total');
  perfRenderRecent();
}

function perfSetChartPeriod(p, ev) {
  _perfChartPeriod = p;
  document.querySelectorAll('.perf-cperiod-btn').forEach((b) => b.classList.remove('active'));
  (ev?.currentTarget || ev?.target?.closest?.('.perf-cperiod-btn'))?.classList?.add('active');
  perfUpdateCharts();
}

function perfSetCompType(t, ev) {
  _perfCompType = t;
  document.querySelectorAll('.perf-cmp-btn').forEach((b) => b.classList.remove('active'));
  (ev?.currentTarget || ev?.target?.closest?.('.perf-cmp-btn'))?.classList?.add('active');
  perfUpdateCharts();
}

function perfMonthSort(k) {
  _perfTmSort = k;
  perfRenderThisMonth();
}

async function loadPerformancePage() {
  if (!canUsePerformancePage()) {
    toast(currentLang === 'de' ? 'Keine Berechtigung' : 'Yetki yok', 'warn');
    navigate('dashboard');
    return;
  }
  perfWireEventsOnce();
  if (typeof renderFirmSelector === 'function') {
    renderFirmSelector('perf-firm-wrap', loadPerformancePage);
  }
  const fs = document.getElementById('perf-date-from');
  const fe = document.getElementById('perf-date-to');
  if (fs && fe && !fs.value) {
    perfSetQuickRange('week', { target: document.querySelector('.perf-range-btn[data-perf-range="week"]') });
  } else {
    await perfReload();
  }
}

