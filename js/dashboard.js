// ─────────────────────────────────────────────
// DASHBOARD — topbar stats, ana sayfa, istatistikler
// ─────────────────────────────────────────────

function _fmtPillMoney(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (abs >= 10000) return sign + (abs / 1000).toFixed(1).replace('.0', '') + 'k';
  if (abs >= 1000) return sign + Math.round(abs).toLocaleString('tr-TR');
  return sign + abs.toFixed(2);
}

async function updateTopbarStats() {
const t0 = Date.now();
const ffLive = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
try {
await fetch(`${SB_URL}/rest/v1/campaigns?limit=1`, { headers: mbAuthHeaders() });
document.getElementById('pill-ping').textContent = Date.now()-t0;
} catch(e) { document.getElementById('pill-ping').textContent = '!'; }
try {
const sessions = await sb(`agent_sessions?select=status${ffLive}`) || [];
const setPill = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = String(n); };
const countSt = (st) => sessions.filter(s => s.status === st).length;
setPill('pill-call', countSt('on_call'));
setPill('pill-ready', countSt('ready'));
setPill('pill-wrap', countSt('wrapping'));
setPill('pill-break', countSt('break'));
setPill('pill-off', countSt('offline'));
setPill('pill-total', sessions.length);
} catch(e){}
try {
const cs = await sb(`campaigns?select=id,status&status=eq.active${ffLive}`);
document.getElementById('pill-camp').textContent = cs.length;
document.getElementById('sb-badge-camp').textContent = cs.length;
} catch(e){}
try {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const gte = typeof mbInstantGte === 'function' ? mbInstantGte(today) : `${today}T00:00:00`;
const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
const logs  = await sb(`call_logs?select=id&outcome=eq.appointment&started_at=gte.${gte}&started_at=lte.${lte}${ffLive}`);
document.getElementById('pill-appt').textContent = logs.length;
} catch(e){}
try {
const fid = getActiveFirmId() || currentUser?.firm_id;
if (fid) {
  const [wallet, cur] = await Promise.all([
    (typeof getFirmWallet === 'function' ? getFirmWallet(fid) : Promise.resolve({ balance: 0 })),
    (typeof getFirmCurrency === 'function' ? getFirmCurrency(fid) : Promise.resolve('EUR')),
  ]);
  const balEl = document.getElementById('pill-bal');
  const bal = Number(wallet?.balance || 0);
  if (balEl) {
    balEl.textContent = _fmtPillMoney(bal);
    balEl.title = bal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const curEl = document.getElementById('pill-bal-cur');
  if (curEl) curEl.textContent = cur || 'EUR';
}
} catch(e){}
}

function _dashCanUseAgentFilter() {
  return mbIsFirmAdmin();
}

function _dashLogFilter() {
  const ff = getFirmFilter('&') || '';
  const role = currentUser?.role || '';
  const onlySelf = role === 'agent';
  let agentQ = '';
  if (onlySelf) {
    agentQ = `&agent_id=eq.${currentUser.id}`;
  } else if (_dashCanUseAgentFilter()) {
    const sel = document.getElementById('dash-agent-f');
    const aid = sel && !sel.disabled ? String(sel.value || '').trim() : '';
    if (aid) agentQ = `&agent_id=eq.${aid}`;
  }
  return { ff, agentQ, onlySelf, isAdmin: mbIsFirmAdmin(role) };
}

window._dashRange = window._dashRange || 'today';

function setDashRange(r) {
  window._dashRange = r;
  document.querySelectorAll('.dash-range-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.dashRange === r);
  });
  loadDashboard();
}

function _dashGetRange() {
  return window._dashRange || 'today';
}

function _dashDateBounds() {
  const range = _dashGetRange();
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
  if (range === 'today') return { from: today, to: today, range };
  if (range === 'week') {
    const from = typeof mbShiftDate === 'function' ? mbShiftDate(today, -6) : today;
    return { from, to: today, range };
  }
  if (range === 'month') {
    const from = `${String(today).slice(0, 8)}01`;
    return { from, to: today, range };
  }
  return { from: '2000-01-01', to: today, range };
}

function _eachDayInRange(fromStr, toStr) {
  const out = [];
  let cur = String(fromStr || '');
  let guard = 0;
  while (cur && cur <= String(toStr || '') && guard < 4000) {
    out.push(cur);
    cur = typeof mbShiftDate === 'function' ? mbShiftDate(cur, 1) : cur;
    if (typeof mbShiftDate !== 'function') break;
    guard++;
  }
  return out;
}

function _monthKeysLastN(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(mbLocale(), { month: 'short', year: '2-digit' });
    out.push({ key, label });
  }
  return out;
}

function _logDayKey(log) {
  if (typeof mbBerlinDay === 'function') return mbBerlinDay(log.started_at);
  return String(log.started_at || '').slice(0, 10);
}

function _logMonthKey(log) {
  const day = _logDayKey(log);
  return day.length >= 7 ? day.slice(0, 7) : '';
}

function _dashUpdateStatLabels(rangeKey) {
  const isTr = currentLang === 'tr';
  const calls = document.getElementById('stat-lbl-calls');
  const costM = document.getElementById('d-cost-m');
  if (calls) {
    if (isTr) {
      calls.textContent =
        rangeKey === 'today'
          ? 'Bugünkü Aramalar'
          : rangeKey === 'week'
            ? 'Bu haftaki Aramalar'
            : rangeKey === 'month'
              ? 'Bu ayki Aramalar'
              : 'Tüm zamanlar — Aramalar';
    } else {
      calls.textContent =
        rangeKey === 'today'
          ? 'Heutige Anrufe'
          : rangeKey === 'week'
            ? 'Anrufe (Woche)'
            : rangeKey === 'month'
              ? 'Anrufe (Monat)'
              : 'Anrufe (gesamt)';
    }
  }
  if (costM) {
    costM.textContent = isTr ? (rangeKey === 'today' ? 'bugün' : 'seçili aralık') : rangeKey === 'today' ? 'heute' : 'Zeitraum';
  }
}

function _dashUpdateCardTitles(rangeKey) {
  const isTr = currentLang === 'tr';
  const hourlyTitle = document.getElementById('dash-hourly-title');
  const hourlySub = document.getElementById('dash-hourly-sub');
  const outTitle = document.getElementById('dash-outcome-title');
  const outSub = document.getElementById('dash-outcome-sub');
  const trendTitle = document.getElementById('dash-trend-title');
  const trendSub = document.getElementById('dash-chart-sub');
  if (hourlyTitle && hourlySub) {
    if (rangeKey === 'today') {
      hourlyTitle.textContent = isTr ? 'Bugün — saatlik analiz' : 'Heute — Stundenanalyse';
      hourlySub.textContent = isTr ? 'Çağrı hacmi ve randevu (saat başı)' : 'Anrufvolumen und Termine pro Stunde';
    } else if (rangeKey === 'week') {
      hourlyTitle.textContent = isTr ? 'Bu hafta — günlük analiz' : 'Diese Woche — Tagesanalyse';
      hourlySub.textContent = isTr ? 'Günlük çağrı ve randevu' : 'Anrufe und Termine pro Tag';
    } else if (rangeKey === 'month') {
      hourlyTitle.textContent = isTr ? 'Bu ay — günlük analiz' : 'Dieser Monat — Tagesanalyse';
      hourlySub.textContent = isTr ? 'Günlük çağrı ve randevu' : 'Anrufe und Termine pro Tag';
    } else {
      hourlyTitle.textContent = isTr ? 'Son 24 ay — aylık analiz' : 'Letzte 24 Monate';
      hourlySub.textContent = isTr ? 'Aylık çağrı ve randevu' : 'Monatliche Anrufe und Termine';
    }
  }
  if (outTitle && outSub) {
    outTitle.textContent = isTr ? 'Randevu sonuçları' : 'Termin-Ergebnisse';
    outSub.textContent = isTr ? 'Randevu durumları (randevu tarihine göre)' : 'Terminstatus nach Terminzeit';
  }
  if (trendTitle && trendSub) {
    if (rangeKey === 'today') {
      trendTitle.textContent = isTr ? 'Bugün — kümülatif çağrı' : 'Heute — kumulativ';
      trendSub.textContent = isTr ? 'Gün içi birikimli çağrı sayısı' : 'Kumulative Anrufe';
    } else if (rangeKey === 'all') {
      trendTitle.textContent = isTr ? 'Son 24 ay — çağrı trendi' : 'Trend (24 Monate)';
      trendSub.textContent = isTr ? 'Aylık toplam çağrı' : 'Monatliche Anrufe';
    } else {
      trendTitle.textContent = isTr ? 'Çağrı trendi' : 'Anruf-Trend';
      trendSub.textContent = isTr ? 'Günlük toplam çağrı' : 'Anrufe pro Tag';
    }
  }
}

async function fetchDashAppointmentsInRange(from, to, ff, agentQ) {
  let q = `appointments?select=durum,termin_tarih,agent_id&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&limit=15000`;
  if (ff) q += ff;
  if (agentQ) q += agentQ;
  try {
    return (await sb(q)) || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function populateDashAgentSelect() {
  const wrap = document.getElementById('dash-agent-wrap');
  const sel = document.getElementById('dash-agent-f');
  if (!wrap || !sel) return;
  if (!_dashCanUseAgentFilter()) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const prev = sel.value;
  if (mbIsSuperAdmin() && !getActiveFirmId()) {
    sel.innerHTML = `<option value="">${t('ui.select_firm_first')}</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const fid = getActiveFirmId() || currentUser.firm_id;
  if (!fid) {
    sel.innerHTML = `<option value="">${t('ui.all_agents')}</option>`;
    return;
  }
  try {
    const users = await sb(`users?firm_id=eq.${fid}&select=id,name,role&order=name.asc`) || [];
    const trAll = t('ui.all_agents');
    sel.innerHTML = `<option value="">${trAll}</option>` + users.map(u => {
      const nm = String(u.name || u.id.slice(0, 8)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<option value="${u.id}">${nm}</option>`;
    }).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  } catch (e) {
    console.error(e);
  }
}

function _isTerminOutcome(o) {
  return o === 'appointment' || o === 'appointment_done';
}

function _dashCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function renderDashChart7d(logsByDay, labels, opts) {
  const canvas = document.getElementById('dash-chart-7d');
  if (!canvas || typeof Chart === 'undefined') return;
  const accent = _dashCssVar('--accent', '#2563eb');
  const border = _dashCssVar('--border', '#e2e8f0');
  if (window._dashChart7d) { window._dashChart7d.destroy(); window._dashChart7d = null; }
  window._dashChart7d = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: opts?.datasetLabel || t('dash.chart_calls'),
        data: logsByDay,
        borderColor: accent,
        backgroundColor: accent.length === 7 ? accent + '22' : 'rgba(37,99,235,0.12)',
        fill: opts?.fill !== false,
        tension: 0.35,
        pointRadius: labels.length <= 2 ? 5 : 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!opts?.showLegend } },
      scales: {
        x: {
          grid: { color: border },
          ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: opts?.maxTicksLimit || 14 }
        },
        y: { beginAtZero: true, grid: { color: border }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

/** Bugün — saatlik: çubuk = toplam çağrı, çizgi = termin */
function renderDashHourlyMixed(logs) {
  const canvas = document.getElementById('dash-chart-hourly');
  if (!canvas || typeof Chart === 'undefined') return;
  const hourly = Array(24).fill(0);
  const hourlyTermin = Array(24).fill(0);
  (logs || []).forEach(l => {
    if (!l.started_at) return;
    const h = typeof mbBerlinHour === 'function' ? mbBerlinHour(l.started_at) : new Date(l.started_at).getHours();
    if (h < 0 || h > 23) return;
    hourly[h]++;
    if (_isTerminOutcome(l.outcome)) hourlyTermin[h]++;
  });
  const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const accent = _dashCssVar('--accent', '#2563eb');
  const green = _dashCssVar('--green', '#16a34a');
  const border = _dashCssVar('--border', '#e2e8f0');
  if (window._dashChartHourly) { window._dashChartHourly.destroy(); window._dashChartHourly = null; }
  window._dashChartHourly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('dash.chart_calls'),
          data: hourly,
          backgroundColor: accent.length === 7 ? accent + '33' : 'rgba(37,99,235,0.2)',
          borderColor: accent,
          borderWidth: 1,
          order: 2,
          borderRadius: 4
        },
        {
          type: 'line',
          label: t('dash.chart_termin'),
          data: hourlyTermin,
          borderColor: green,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const tot = hourly[ctx.dataIndex] || 0;
              const te = hourlyTermin[ctx.dataIndex] || 0;
              if (!tot) return '';
              return tReplace('dash.chart_tooltip', { p: ((te / tot) * 100).toFixed(0) });
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: { stepSize: 1, font: { size: 11 } }
        }
      }
    }
  });
}

/** Hafta/ay/24 ay — günlük veya aylık çubuk + termin çizgisi */
function renderDashPeriodMixed(logs, rangeKey, from, to) {
  const canvas = document.getElementById('dash-chart-hourly');
  if (!canvas || typeof Chart === 'undefined') return;
  const accent = _dashCssVar('--accent', '#2563eb');
  const green = _dashCssVar('--green', '#16a34a');
  const border = _dashCssVar('--border', '#e2e8f0');
  let labels = [];
  let bar = [];
  let line = [];
  if (rangeKey === 'all') {
    const months = _monthKeysLastN(24);
    const keys = months.map(m => m.key);
    labels = months.map(m => m.label);
    bar = Array(keys.length).fill(0);
    line = Array(keys.length).fill(0);
    (logs || []).forEach(l => {
      const mk = _logMonthKey(l);
      const ix = keys.indexOf(mk);
      if (ix < 0) return;
      bar[ix]++;
      if (_isTerminOutcome(l.outcome)) line[ix]++;
    });
  } else {
    const days = _eachDayInRange(from, to);
    labels = days.map(d => {
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString(mbLocale(), { weekday: 'short', day: 'numeric' });
    });
    bar = days.map(d => (logs || []).filter(l => _logDayKey(l) === d).length);
    line = days.map(d => (logs || []).filter(l => _logDayKey(l) === d && _isTerminOutcome(l.outcome)).length);
  }
  if (window._dashChartHourly) { window._dashChartHourly.destroy(); window._dashChartHourly = null; }
  window._dashChartHourly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('dash.chart_calls'),
          data: bar,
          backgroundColor: accent.length === 7 ? accent + '33' : 'rgba(37,99,235,0.2)',
          borderColor: accent,
          borderWidth: 1,
          order: 2,
          borderRadius: 4
        },
        {
          type: 'line',
          label: t('dash.chart_termin_per_call'),
          data: line,
          borderColor: green,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const tot = bar[ctx.dataIndex] || 0;
              const te = line[ctx.dataIndex] || 0;
              if (!tot) return '';
              return tReplace('dash.chart_tooltip', { p: ((te / tot) * 100).toFixed(0) });
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: rangeKey === 'month' ? 45 : 0, autoSkip: true, maxTicksLimit: rangeKey === 'month' ? 16 : 14, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: { stepSize: 1, font: { size: 11 } }
        }
      }
    }
  });
}

/** Termin randevuları — durum dağılımı (doughnut) */
function renderDashTerminDonut(appts) {
  const canvas = document.getElementById('dash-chart-outcomes');
  if (!canvas || typeof Chart === 'undefined') return;
  const isTr = currentLang === 'tr';
  const cat = {
    basarili: { n: 0, tr: 'Başarılı', de: 'Erfolgreich' },
    basarisiz: { n: 0, tr: 'Başarısız', de: 'Nicht erfolgreich' },
    beklemede: { n: 0, tr: 'Beklemede', de: 'Wartend' },
    qc_bekleniyor: { n: 0, tr: 'QC bekleniyor', de: 'QC ausstehend' },
    iptal: { n: 0, tr: 'İptal', de: 'Storniert' },
    other: { n: 0, tr: 'Diğer', de: 'Sonstige' }
  };
  (appts || []).forEach(a => {
    const k = String(a.durum || '').toLowerCase();
    if (cat[k]) cat[k].n++;
    else cat.other.n++;
  });
  const order = ['basarili', 'basarisiz', 'beklemede', 'qc_bekleniyor', 'iptal', 'other'];
  const labels = [];
  const data = [];
  const colors = [];
  const green = _dashCssVar('--green', '#16a34a');
  const yellow = _dashCssVar('--yellow', '#d97706');
  const red = _dashCssVar('--red', '#dc2626');
  const accent = _dashCssVar('--accent', '#2563eb');
  const muted = _dashCssVar('--text-3', '#9ca3af');
  const colorMap = {
    basarili: green,
    basarisiz: red,
    beklemede: yellow,
    qc_bekleniyor: accent,
    iptal: _dashCssVar('--text-2', '#6b7280'),
    other: muted
  };
  order.forEach(k => {
    if (cat[k].n > 0) {
      labels.push(isTr ? cat[k].tr : cat[k].de);
      data.push(cat[k].n);
      colors.push(colorMap[k]);
    }
  });
  if (window._dashChartOutcomes) { window._dashChartOutcomes.destroy(); window._dashChartOutcomes = null; }
  if (!data.length) {
    labels.push(t('dash.donut_no_data'));
    data.push(1);
    colors.push('#e5e7eb');
  }
  const sliceBorder = _dashCssVar('--bg-2', '#ffffff');
  window._dashChartOutcomes = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: sliceBorder, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 4 } },
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            boxWidth: 10,
            font: { size: 10 },
            padding: 8,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              const lbl = ctx.label || '';
              return tReplace('dash.donut_tooltip_line', { lbl, v, s: t('dash.donut_appt_suffix') });
            }
          }
        }
      }
    }
  });
}

/** Üçüncü grafik: aralığa göre trend */
function renderDashTrendForRange(rangeKey, logs, from, to) {
  if (rangeKey === 'today') {
    const hourly = Array(24).fill(0);
    (logs || []).forEach(l => {
      if (!l.started_at) return;
      const h = typeof mbBerlinHour === 'function' ? mbBerlinHour(l.started_at) : new Date(l.started_at).getHours();
      if (h >= 0 && h <= 23) hourly[h]++;
    });
    const cum = [];
    let s = 0;
    for (let i = 0; i < 24; i++) {
      s += hourly[i];
      cum.push(s);
    }
    const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    renderDashChart7d(cum, labels, {
      datasetLabel: t('dash.cumulative_calls'),
      fill: true,
      maxTicksLimit: 12
    });
    return;
  }
  if (rangeKey === 'all') {
    const months = _monthKeysLastN(24);
    const keys = months.map(m => m.key);
    const counts = Array(keys.length).fill(0);
    (logs || []).forEach(l => {
      const mk = _logMonthKey(l);
      const ix = keys.indexOf(mk);
      if (ix >= 0) counts[ix]++;
    });
    renderDashChart7d(counts, months.map(m => m.label), { maxTicksLimit: 12 });
    return;
  }
  const days = _eachDayInRange(from, to);
  const counts = days.map(d => (logs || []).filter(l => _logDayKey(l) === d).length);
  const labels = days.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString(mbLocale(), { weekday: 'short', day: 'numeric' });
  });
  renderDashChart7d(counts, labels, { maxTicksLimit: rangeKey === 'month' ? 18 : 10 });
}

const MB_DASH_ROWS = ['eom', 'jobs', 'analytics', 'trend', 'live'];
let _dashDragKey = '';

function mbDashRowKey() {
  const id = (typeof currentUser !== 'undefined' && currentUser?.id) ? currentUser.id : 'local';
  return `mb_dash_rows_${id}`;
}

function mbApplyDashRowOrder() {
  const page = document.getElementById('page-dashboard');
  const anchor = document.getElementById('dash-range-tabs');
  if (!page || !anchor) return;
  let order = MB_DASH_ROWS.slice();
  try {
    const saved = JSON.parse(localStorage.getItem(mbDashRowKey()) || '[]');
    if (Array.isArray(saved)) {
      const known = saved.filter((key) => MB_DASH_ROWS.includes(key));
      order = known.concat(MB_DASH_ROWS.filter((key) => !known.includes(key)));
    }
  } catch (e) {}
  let after = anchor;
  order.forEach((key) => {
    const row = page.querySelector(`.dash-row[data-dash-row="${key}"]`);
    if (!row) return;
    after.after(row);
    after = row;
  });
}

function mbSaveDashRowOrder() {
  const keys = [...document.querySelectorAll('#page-dashboard .dash-row')]
    .map((row) => row.dataset.dashRow)
    .filter(Boolean);
  try { localStorage.setItem(mbDashRowKey(), JSON.stringify(keys)); } catch (e) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbResetDashRows() {
  try { localStorage.removeItem(mbDashRowKey()); } catch (e) {}
  mbApplyDashRowOrder();
  mbSyncDashRows();
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbSyncDashRows() {
  document.querySelectorAll('#page-dashboard .dash-row').forEach((row) => {
    const body = [...row.children].find((el) => !el.classList.contains('dash-row-handle'));
    const hidden = !!body && body.style.display === 'none';
    row.classList.toggle('is-off', hidden);
  });
}

function mbInitDashRows() {
  const page = document.getElementById('page-dashboard');
  if (!page || page.dataset.dashRowsReady === '1') return;
  page.dataset.dashRowsReady = '1';
  page.addEventListener('dragstart', (e) => {
    const handle = e.target.closest?.('.dash-row-handle');
    if (!handle || !page.contains(handle)) return;
    const row = handle.closest('.dash-row');
    if (!row) return;
    _dashDragKey = row.dataset.dashRow || '';
    row.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dashDragKey);
    }
  });
  page.addEventListener('dragend', () => {
    _dashDragKey = '';
    page.querySelectorAll('.dash-row').forEach((row) => row.classList.remove('is-dragging', 'is-drop'));
  });
  page.addEventListener('dragover', (e) => {
    if (!_dashDragKey) return;
    const row = e.target.closest?.('.dash-row');
    if (!row || row.classList.contains('is-off') || row.dataset.dashRow === _dashDragKey) return;
    e.preventDefault();
    page.querySelectorAll('.dash-row.is-drop').forEach((item) => {
      if (item !== row) item.classList.remove('is-drop');
    });
    row.classList.add('is-drop');
  });
  page.addEventListener('drop', (e) => {
    const row = e.target.closest?.('.dash-row');
    if (!row || !_dashDragKey || row.dataset.dashRow === _dashDragKey) return;
    e.preventDefault();
    const from = page.querySelector(`.dash-row[data-dash-row="${_dashDragKey}"]`);
    if (!from) return;
    const rect = row.getBoundingClientRect();
    if (e.clientY > rect.top + rect.height / 2) row.after(from);
    else row.before(from);
    row.classList.remove('is-drop');
    mbSaveDashRowOrder();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
  const watch = ['dash-eom-card', 'dash-job-market-kpi', 'dash-live-wrap'];
  const obs = new MutationObserver(() => mbSyncDashRows());
  watch.forEach((id) => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  });
}

async function loadDashboard() {
mbInitDashRows();
mbApplyDashRowOrder();
renderFirmSelector('dash-firm-selector', loadDashboard);
await populateDashAgentSelect();
const { ff, agentQ, onlySelf } = _dashLogFilter();
const costEl = document.getElementById('dash-stat-cost');
const liveWrap = document.getElementById('dash-live-wrap');
const subEl = document.getElementById('dash-chart-sub');
if (costEl) costEl.style.display = onlySelf ? 'none' : '';
const showLive = ['admin', 'super_admin', 'firm_admin', 'qc'].includes(currentUser?.role || '');
if (liveWrap) liveWrap.style.display = showLive ? '' : 'none';
document.querySelectorAll('.dash-range-btn').forEach(b => {
  b.classList.toggle('active', b.dataset.dashRange === _dashGetRange());
});
const { from, to, range: rangeKey } = _dashDateBounds();
_dashUpdateStatLabels(rangeKey);
_dashUpdateCardTitles(rangeKey);
if (onlySelf && subEl) {
  subEl.textContent = t('dash.sub_agent_calls');
}
const now = new Date();
const today = now.toISOString().split('T')[0];
document.getElementById('dash-date').textContent =
now.toLocaleDateString(mbLocale(), {weekday:'long',day:'numeric',month:'long',year:'numeric'});
const isTr = currentLang === 'tr';
const rangeSuffix =
  rangeKey === 'today'
    ? (isTr ? 'bugün' : 'heute')
    : rangeKey === 'week'
      ? (isTr ? 'bu hafta' : 'diese Woche')
      : rangeKey === 'month'
        ? (isTr ? 'bu ay' : 'diesen Monat')
        : (isTr ? 'seçili aralık' : 'Zeitraum');
try {
const logGte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
const logLte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
let qLogs = `call_logs?select=*&started_at=gte.${logGte}&started_at=lte.${logLte}`;
qLogs += ff;
qLogs += agentQ;
qLogs += '&limit=8000';
const logs  = await sb(qLogs) || [];
if (rangeKey === 'today') {
  renderDashHourlyMixed(logs);
} else {
  renderDashPeriodMixed(logs, rangeKey, from, to);
}
const apptRows = await fetchDashAppointmentsInRange(from, to, ff, agentQ);
renderDashTerminDonut(apptRows);
renderDashTrendForRange(rangeKey, logs, from, to);
const total = logs.length;
const appts = logs.filter(l=>_isTerminOutcome(l.outcome)).length;
const cbs   = logs.filter(l=>l.outcome==='callback').length;
const vms   = logs.filter(l=>l.amd_result==='machine').length;
const cost  = logs.reduce((s,l)=>s+(l.cost_usd||0),0);
const talk  = logs.reduce((s,l)=>s+(l.duration_sec||0),0);
document.getElementById('d-calls').textContent  = total;
document.getElementById('d-appt').textContent   = appts;
document.getElementById('d-cb').textContent     = cbs;
document.getElementById('d-vm').textContent     = vms;
document.getElementById('d-cost').textContent   = `$${cost.toFixed(2)}`;
const talkMin = Math.floor(talk/60);
document.getElementById('d-talk').textContent   = isTr ? `${talkMin}dk` : `${talkMin} Min`;
const callWord = isTr ? 'çağrı' : (total === 1 ? 'Anruf' : 'Anrufe');
document.getElementById('d-calls-m').textContent= `${total} ${callWord} ${rangeSuffix}`;
document.getElementById('d-appt-m').textContent = total > 0
  ? (isTr ? `%${((appts / total) * 100).toFixed(1)} dönüşüm` : `${((appts / total) * 100).toFixed(1)}% Quote`)
  : (isTr ? '%0 dönüşüm' : '0% Quote');
document.getElementById('d-avg').textContent    = isTr
  ? `ort. ${total > 0 ? Math.round(talk / total) : 0}sn/çağrı`
  : `Ø ${total > 0 ? Math.round(talk / total) : 0}s/Anruf`;
document.getElementById('pill-appt').textContent= appts;
} catch(e){
  console.error(e);
  renderDashHourlyMixed([]);
  renderDashTerminDonut([]);
  renderDashChart7d([0], ['—']);
  const errSub = document.getElementById('dash-chart-sub');
  if (errSub) errSub.textContent = (typeof t === 'function' ? t('ui.error_prefix') : 'Hata: ') + (e?.message || '');
}
if (showLive) try {
await renderDashLiveAgents();
} catch(e){ console.warn('live', e); }
if (typeof loadDashCompetitionCard === 'function') {
  try { await loadDashCompetitionCard(); } catch (e) { console.warn('comp', e); }
}
if (typeof loadJobMarketKpi === 'function') {
  try { await loadJobMarketKpi(); } catch (e) {}
}
if (typeof loadJobFinanceSummary === 'function') {
  try { await loadJobFinanceSummary(); } catch (e) {}
}
if (typeof mbSyncDashRows === 'function') mbSyncDashRows();
}

async function loadStats() {
renderFirmSelector('stats-firm-selector', loadStats);
const tbody = document.getElementById('stats-tbody');
if(tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(9) : `<tr><td colspan="9" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
try {
const ff = getFirmFilter('&');
const dateFilter = document.getElementById('stats-date-f')?.value || 'today';
const campFilter = document.getElementById('stats-camp-f')?.value || '';
const todayBiz = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
let dateFrom = todayBiz;
let dateTo = todayBiz;
if (dateFilter === 'week') {
dateFrom = typeof mbShiftDate === 'function' ? mbShiftDate(todayBiz, -6) : todayBiz;
} else if (dateFilter === 'month') {
dateFrom = `${String(todayBiz).slice(0, 8)}01`;
} else if (dateFilter === 'custom') {
dateFrom = document.getElementById('stats-date-from')?.value || dateFrom;
dateTo   = document.getElementById('stats-date-to')?.value   || dateTo;
}
const statsGte = typeof mbInstantGte === 'function' ? mbInstantGte(dateFrom) : `${dateFrom}T00:00:00`;
const statsLte = typeof mbInstantLte === 'function' ? mbInstantLte(dateTo) : `${dateTo}T23:59:59`;
let query = `call_logs?select=id,started_at,outcome,agent_id,campaign_id,duration_sec,users(id,name),campaigns(id,name)${ff}`;
query += `&started_at=gte.${statsGte}&started_at=lte.${statsLte}`;
if (campFilter) query += `&campaign_id=eq.${campFilter}`;
query += '&order=started_at.desc&limit=2000';
let logs = [];
try {
  logs = (await sb(query)) || [];
} catch (_) {
  const plain = `call_logs?select=id,started_at,outcome,agent_id,campaign_id,duration_sec${ff}&started_at=gte.${statsGte}&started_at=lte.${statsLte}${campFilter ? `&campaign_id=eq.${campFilter}` : ''}&order=started_at.desc&limit=2000`;
  logs = (await sb(plain)) || [];
}
const groups = {};
logs.forEach(l => {
const agentId = l.agent_id || 'unknown';
const campId  = l.campaign_id || 'unknown';
const key = `${agentId}__${campId}`;
if (!groups[key]) groups[key] = {
agent_id: agentId,
agent_name: l.users?.name || agentId.slice(0,8),
campaign_id: campId,
campaign_name: l.campaigns?.name || '—',
logs: []
};
groups[key].logs.push(l);
});
const rows = Object.values(groups);
if (!rows.length) {
tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(9, 'ui.no_data_range') : `<tr><td colspan="9" class="mb-empty-hint">${t('ui.no_data_range')}</td></tr>`;
return;
}
let totAll=0,apAll=0,ngAll=0,cbAll=0,naAll=0,secAll=0;
tbody.innerHTML = rows.map(r => {
const ls = r.logs, tot = ls.length;
const ap = ls.filter(l=>l.outcome==='appointment').length;
const ng = ls.filter(l=>l.outcome==='negative').length;
const cb = ls.filter(l=>l.outcome==='callback').length;
const na = ls.filter(l=>l.outcome==='no_answer').length;
const totalSec = ls.reduce((s,l)=>s+(l.duration_sec||l.duration_seconds||0),0);
const avgSec = tot ? Math.round(totalSec/tot) : 0;
const convPct = tot ? Math.round(ap/tot*100) : 0;
totAll+=tot; apAll+=ap; ngAll+=ng; cbAll+=cb; naAll+=na; secAll+=totalSec;
return `<tr>
<td style="font-weight:700;">${r.agent_name}</td>
<td style="font-size:11px;">${r.campaign_name}</td>
<td class="td-mono">${tot}</td>
<td><span class="badge badge-green" style="font-size:12px;font-weight:800;">${ap}</span></td>
<td><span class="badge badge-red">${ng}</span></td>
<td><span class="badge badge-yellow">${cb}</span></td>
<td><span class="badge badge-gray">${na}</span></td>
<td class="td-mono">${Math.floor(avgSec/60)}:${String(avgSec%60).padStart(2,'0')}</td>
<td><span style="font-weight:800;color:${convPct>=20?'var(--green)':convPct>=10?'var(--yellow)':'var(--red)'};">${convPct}%</span></td>
</tr>`;
}).join('') + `<tr style="background:var(--bg-3);font-weight:800;border-top:2px solid var(--border);">
<td colspan="2" style="font-size:12px;font-weight:800;">${typeof t === 'function' ? t('stats.total') : 'TOPLAM'}</td>
<td class="td-mono">${totAll}</td>
<td><span class="badge badge-green">${apAll}</span></td>
<td><span class="badge badge-red">${ngAll}</span></td>
<td><span class="badge badge-yellow">${cbAll}</span></td>
<td><span class="badge badge-gray">${naAll}</span></td>
<td class="td-mono">${Math.floor(secAll/totAll/60||0)}:${String(Math.round(secAll/totAll%60||0)).padStart(2,'0')}</td>
<td><span style="font-weight:800;color:var(--accent);">${totAll?Math.round(apAll/totAll*100):0}%</span></td>
</tr>`;
const campSel = document.getElementById('stats-camp-f');
if (campSel && campSel.options.length <= 1) {
const uniqueCamps = [...new Set(logs.map(l=>l.campaign_id).filter(Boolean))];
uniqueCamps.forEach(cid => {
const log = logs.find(l=>l.campaign_id===cid);
const opt = document.createElement('option');
opt.value = cid; opt.textContent = log?.campaigns?.name || cid.slice(0,8);
campSel.appendChild(opt);
});
}
} catch(e){ console.error(e); if(tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(9, t('ui.error_prefix') + (e?.message || t('ui.unknown_error'))) : `<tr><td colspan="9" class="mb-empty-hint" style="color:var(--red);">${escapeHtml(t('ui.error_prefix') + (e?.message || t('ui.unknown_error')))}</td></tr>`; }
}

async function loadCallHistory() {
const tbody = document.getElementById('ch-tbody');
if(tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(9) : `<tr><td colspan="9" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
try {
const ff = getFirmFilter('&');
const search = document.getElementById('ch-search')?.value?.toLowerCase()||'';
const outcome = document.getElementById('ch-outcome')?.value||'';
const agentFilter = document.getElementById('ch-agent-f')?.value||'';
const chToday = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const dateFrom = document.getElementById('ch-date-from')?.value||chToday;
const dateTo = document.getElementById('ch-date-to')?.value||chToday;
const chGte = typeof mbInstantGte === 'function' ? mbInstantGte(dateFrom) : `${dateFrom}T00:00:00`;
const chLte = typeof mbInstantLte === 'function' ? mbInstantLte(dateTo) : `${dateTo}T23:59:59`;
let query = `call_logs?select=id,started_at,outcome,agent_id,campaign_id,phone,duration_sec,contact_id,users(id,name),campaigns(name),contacts(first_name,last_name,phone)${ff}&order=started_at.desc&limit=500`;
query += `&started_at=gte.${chGte}`;
query += `&started_at=lte.${chLte}`;
if (outcome) query += outcome==='appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
if (agentFilter) query += `&agent_id=eq.${agentFilter}`;
let logs = [];
try {
  logs = (await sb(query)) || [];
} catch (_) {
  let plain = `call_logs?select=id,started_at,outcome,agent_id,campaign_id,phone,duration_sec,contact_id${ff}&order=started_at.desc&limit=500`;
  plain += `&started_at=gte.${chGte}&started_at=lte.${chLte}`;
  if (outcome) plain += outcome==='appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
  if (agentFilter) plain += `&agent_id=eq.${agentFilter}`;
  logs = (await sb(plain)) || [];
}
const contactNameById = {};
try {
  const missingIds = [...new Set((logs || [])
    .filter((l) => l?.contact_id && !(`${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim()))
    .map((l) => l.contact_id)
  )];
  for (let i = 0; i < missingIds.length; i += 100) {
    const chunk = missingIds.slice(i, i + 100);
    if (!chunk.length) continue;
    const rows = await sb(`contacts?select=id,first_name,last_name&id=in.(${chunk.join(',')})`).catch(() => []);
    (rows || []).forEach((r) => {
      const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      if (nm) contactNameById[r.id] = nm;
    });
  }
} catch (_) {}
const logDurSec = (l) => Math.max(0, Number(l?.duration_sec ?? l?.duration_seconds ?? 0) || 0);
const isFakeRec = (l) => {
  if (typeof _isFakeRecordingRow === 'function') return _isFakeRecordingRow(l);
  const noRec = !String(l?.recording_url || '').trim();
  if (!noRec) return false;
  const notesRaw = String(l?.notes || '');
  const explicitTest =
    l?.is_test === true ||
    l?.is_inbound_test === true ||
    notesRaw.includes('__test_sim__');
  if (explicitTest) return true;
  if (typeof _testMode !== 'undefined' && _testMode) {
    const dur = logDurSec(l);
    const hasTelnyx = String(l?.telnyx_call_id || '').trim();
    if (dur >= 1 && dur <= 900 && !hasTelnyx) return true;
  }
  return false;
};
const recHtmlFor = (l, scope) => {
  if (l.recording_url) {
    if (scope === 'ch') {
      return `<div style="display:flex;align-items:center;gap:4px;">
<audio id="ch-aud-${l.id}" src="${l.recording_url}" preload="none" style="display:none;"></audio>
<button onclick="toggleAudio('ch-aud-${l.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;color:var(--text-2);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;"><i class="ph ph-play"></i></button>
</div>`;
    }
    return `<button onclick="event.stopPropagation();toggleAudio('mh-aud-${l.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;">
<audio id="mh-aud-${l.id}" src="${l.recording_url}" preload="none" style="display:none;"></audio>
<i class="ph ph-play"></i></button>`;
  }
  if (isFakeRec(l) && typeof _fakeRecordingMarkup === 'function') {
    return _fakeRecordingMarkup(l, scope === 'ch' ? 'chhist' : 'myhist');
  }
  return '<span style="color:var(--text-3);font-size:11px;">—</span>';
};
const OM={
appointment:'<span class="badge badge-green">Randevu</span>',
negative:'<span class="badge badge-red">Olumsuz</span>',
callback:'<span class="badge badge-yellow">Geri Ara</span>',
voicemail:'<span class="badge badge-gray">Telesekreter</span>',
no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
dnc:'<span class="badge badge-red">🚫 DNC</span>',
};
let filtered = logs;
if (search) {
filtered = logs.filter(l => {
const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.toLowerCase();
const phone = l.phone||l.contacts?.phone||'';
const agent = l.users?.name?.toLowerCase()||'';
return name.includes(search) || phone.includes(search) || agent.includes(search);
});
}
// Populate agent filter dropdown from unique agents in results
const agentSel = document.getElementById('ch-agent-f');
if (agentSel && agentSel.options.length <= 1 && logs.length) {
  const uniqueAgents = [];
  const seen = new Set();
  logs.forEach(l => { if (l.agent_id && !seen.has(l.agent_id)) { seen.add(l.agent_id); uniqueAgents.push({id:l.agent_id, name:l.users?.name||l.agent_id.slice(0,8)}); }});
  uniqueAgents.sort((a,b)=>a.name.localeCompare(b.name));
  uniqueAgents.forEach(a => { const o=document.createElement('option'); o.value=a.id; o.textContent=a.name; agentSel.appendChild(o); });
}
if (!filtered.length) {
tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(9, 'ui.no_records') : `<tr><td colspan="9" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
return;
}
tbody.innerHTML = filtered.map(l=>{
const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const sec = logDurSec(l);
const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
const name =
  `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.trim() ||
  contactNameById[l.contact_id] ||
  (l.phone || l.contacts?.phone || '—');
const phone = l.phone || l.contacts?.phone || '—';
const agentName = l.users?.name || '—';
const campName = l.campaigns?.name || '—';
const recHtml = recHtmlFor(l, 'ch');
const detailBtn = l.contact_id ? `<button class="icon-btn" onclick="openContactDrawer('${l.contact_id}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
const cbHtml = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);margin-top:2px;"><i class="ph ph-calendar" style="vertical-align:-2px;"></i> ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:11px;cursor:pointer;" onclick="copyToClipboard('${phone}','Numara kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:12px;">${agentName}</td>
<td style="font-size:11px;">${campName}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${OM[l.outcome]||`<span class="badge badge-gray">${l.outcome||'—'}</span>`}${cbHtml}</td>
<td>${detailBtn}</td>
</tr>`;
}).join('');
} catch(e){ console.error(e); if(tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(8, t('ui.error_prefix') + (e?.message || t('ui.unknown_error'))) : `<tr><td colspan="8" class="mb-empty-hint" style="color:var(--red);">${escapeHtml(t('ui.error_prefix') + (e?.message || t('ui.unknown_error')))}</td></tr>`; }
}

async function loadMyHistory() {
if (!currentUser) return;
try {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const dateFrom = document.getElementById('mh-date-from')?.value || today;
const dateTo   = document.getElementById('mh-date-to')?.value   || today;
const mhGte = typeof mbInstantGte === 'function' ? mbInstantGte(dateFrom) : `${dateFrom}T00:00:00`;
const mhLte = typeof mbInstantLte === 'function' ? mbInstantLte(dateTo) : `${dateTo}T23:59:59`;
const search   = (document.getElementById('mh-search')?.value||'').toLowerCase();
const outcome  = document.getElementById('mh-outcome')?.value||'';
let query = `call_logs?select=*,contacts(first_name,last_name,phone),campaigns(name)&agent_id=eq.${currentUser.id}`;
query += `&started_at=gte.${mhGte}&started_at=lte.${mhLte}`;
if (outcome) query += outcome === 'appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
query += '&order=started_at.desc&limit=200';
const logs = await sb(query) || [];
const contactNameById = {};
try {
  const missingIds = [...new Set((logs || [])
    .filter((l) => l?.contact_id && !(`${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim()))
    .map((l) => l.contact_id)
  )];
  for (let i = 0; i < missingIds.length; i += 100) {
    const chunk = missingIds.slice(i, i + 100);
    if (!chunk.length) continue;
    const rows = await sb(`contacts?select=id,first_name,last_name&id=in.(${chunk.join(',')})`).catch(() => []);
    (rows || []).forEach((r) => {
      const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      if (nm) contactNameById[r.id] = nm;
    });
  }
} catch (_) {}
const logDurSec = (l) => Math.max(0, Number(l?.duration_sec ?? l?.duration_seconds ?? 0) || 0);
const isFakeRec = (l) => {
  if (typeof _isFakeRecordingRow === 'function') return _isFakeRecordingRow(l);
  const noRec = !String(l?.recording_url || '').trim();
  if (!noRec) return false;
  const notesRaw = String(l?.notes || '');
  const explicitTest =
    l?.is_test === true ||
    l?.is_inbound_test === true ||
    notesRaw.includes('__test_sim__');
  if (explicitTest) return true;
  if (typeof _testMode !== 'undefined' && _testMode) {
    const dur = logDurSec(l);
    const hasTelnyx = String(l?.telnyx_call_id || '').trim();
    if (dur >= 1 && dur <= 900 && !hasTelnyx) return true;
  }
  return false;
};
const recHtmlFor = (l) => {
  if (l.recording_url) {
    return `<button onclick="event.stopPropagation();toggleAudio('mh-aud-${l.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;">
<audio id="mh-aud-${l.id}" src="${l.recording_url}" preload="none" style="display:none;"></audio>
<i class="ph ph-play"></i></button>`;
  }
  if (isFakeRec(l) && typeof _fakeRecordingMarkup === 'function') return _fakeRecordingMarkup(l, 'myhist');
  return '<span style="color:var(--text-3);font-size:11px;">—</span>';
};
const OM={
  appointment:'<span class="badge badge-green">Randevu</span>',
  appointment_done:'<span class="badge badge-green">Randevu</span>',
  negative:'<span class="badge badge-red">Olumsuz</span>',
  callback:'<span class="badge badge-yellow">Geri Ara</span>',
  voicemail:'<span class="badge badge-gray">Telesekreter</span>',
  no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
  dnc:'<span class="badge badge-red">DNC</span>'
};
let filtered = logs;
if (search) {
  filtered = logs.filter(l => {
    const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.toLowerCase();
    const phone = (l.phone||l.contacts?.phone||'').toLowerCase();
    return name.includes(search) || phone.includes(search);
  });
}
const tbody = document.getElementById('my-tbody');
if (!filtered.length) {
  tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(8, 'ui.no_records') : `<tr><td colspan="8" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
  return;
}
tbody.innerHTML = filtered.map(l=>{
const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const name =
  `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.trim() ||
  contactNameById[l.contact_id] ||
  (l.phone || l.contacts?.phone || '—');
const phone = l.phone || l.contacts?.phone || '—';
const camp = l.campaigns?.name || '—';
const sec = logDurSec(l);
const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
const cbInfo = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);margin-top:2px;"><i class="ph ph-calendar" style="vertical-align:-2px;"></i> ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
const recHtml = recHtmlFor(l);
const detailBtn = l.contact_id ? `<button class="icon-btn" onclick="openContactDrawer('${l.contact_id}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:12px;cursor:pointer;" onclick="copyToClipboard('${phone}','Kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:11px;">${camp}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${OM[l.outcome]||`<span class="badge badge-gray">${l.outcome||'—'}</span>`}${cbInfo}</td>
<td>${detailBtn}</td>
</tr>`;
}).join('');
} catch(e){
  console.error(e);
  const tbody = document.getElementById('my-tbody');
  if (tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(8, (e?.message || 'Hata')) : `<tr><td colspan="8" class="mb-empty-hint">${e?.message || 'Hata'}</td></tr>`;
}
}

function initStatsFilters() {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const from = document.getElementById('stats-date-from');
const to   = document.getElementById('stats-date-to');
if (from) from.value = today;
if (to)   to.value   = today;
}

function initCallHistoryFilters() {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const from = document.getElementById('ch-date-from');
const to   = document.getElementById('ch-date-to');
if (from && !from.value) from.value = today;
if (to   && !to.value)   to.value   = today;
if (typeof updateCallHistoryExportVisibility === 'function') updateCallHistoryExportVisibility();
}

function initMyHistoryFilters() {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const from = document.getElementById('mh-date-from');
const to   = document.getElementById('mh-date-to');
if (from && !from.value) from.value = today;
if (to   && !to.value)   to.value   = today;
}

function toggleCustomDateRange() {
var val = document.getElementById("stats-date-f") ? document.getElementById("stats-date-f").value : "";
var wrap = document.getElementById("stats-custom-range");
if (wrap) wrap.style.display = val==="custom" ? "flex" : "none";
}

const _DASH_LIVE_STATUS = {
  on_call:  { tr: 'Aramada', de: 'Im Gespräch' },
  ready:    { tr: 'Hazır', de: 'Bereit' },
  wrapping: { tr: 'Sonuç', de: 'Nacharbeit' },
  break:    { tr: 'Mola', de: 'Pause' },
  offline:  { tr: 'Çevrimdışı', de: 'Offline' },
};
const _DASH_LIVE_ORDER = { on_call: 0, wrapping: 1, ready: 2, break: 3, offline: 4 };

function _dashLiveEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v ?? '') : String(v ?? '');
}

const LIVE_AGE_HOLD_SEC = 30;
const LIVE_AGE_TAU_SEC = 220;

function liveAgeFromSec(sec) {
  const held = Math.max(0, (Number(sec) || 0) - LIVE_AGE_HOLD_SEC);
  return Math.max(0, Math.min(1, 1 - Math.exp(-held / LIVE_AGE_TAU_SEC)));
}

function liveStateSinceIso(s) {
  if (!s) return '';
  if (typeof s === 'string') return s;
  const st = s.status;
  if (st === 'on_call') return s.call_started_at || s.call_start || s.updated_at || s.last_seen || '';
  if (st === 'break') return s.break_start || s.updated_at || s.last_seen || '';
  return s.updated_at || s.last_seen || '';
}

function liveStateAgeSec(s) {
  const iso = liveStateSinceIso(s);
  if (!iso) return 0;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

function liveAgeUnit(s) {
  return liveAgeFromSec(liveStateAgeSec(s));
}

function liveClock(iso, de) {
  if (!iso) return '—';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return de ? `${d} T ${h} Std` : `${d}g ${h}sa`;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function compareLiveAgents(a, b) {
  const ra = _DASH_LIVE_ORDER[a.status] ?? 9;
  const rb = _DASH_LIVE_ORDER[b.status] ?? 9;
  if (ra !== rb) return ra - rb;
  const byAge = liveStateAgeSec(b) - liveStateAgeSec(a);
  if (byAge) return byAge;
  return String(a.agent_name || '').localeCompare(String(b.agent_name || ''), 'tr');
}

function livePaintAge(el) {
  if (!el) return;
  const iso = el.dataset.since || '';
  const age = iso ? liveAgeFromSec(liveStateAgeSec(iso)) : 0;
  el.style.setProperty('--live-age', age.toFixed(3));
  el.classList.toggle('live-tone--deep', age >= 0.55);
  const clock = el.querySelector('[data-clock]');
  if (clock) clock.textContent = liveClock(iso, (typeof currentLang !== 'undefined' && currentLang === 'de'));
}

function _dashLiveTick() {
  document.querySelectorAll('#live-agents [data-since]').forEach(livePaintAge);
}

const _LIVE_DOT = {
  on_call: '#4CAF50',
  ready: '#FFB74D',
  wrapping: '#00BCD4',
  break: '#7E57C2',
  offline: '#9E9E9E',
};

function liveFloorStatuses() {
  return ['on_call', 'ready', 'wrapping', 'break', 'offline'];
}

function liveFloorFilter() {
  if (!window._liveFloorOn) {
    window._liveFloorOn = { on_call: true, ready: true, wrapping: true, break: true, offline: true };
  }
  return window._liveFloorOn;
}

function liveFloorLayout() {
  try {
    const v = localStorage.getItem('mb-live-layout');
    return (v === 'rows' || v === 'strip') ? 'rows' : 'grid';
  } catch (_) {
    return 'grid';
  }
}

function _syncLiveLayoutButtons() {
  const rows = liveFloorLayout() === 'rows';
  document.querySelectorAll('[data-live-layout]').forEach((btn) => {
    const mode = (btn.dataset.liveLayout === 'rows' || btn.dataset.liveLayout === 'strip') ? 'rows' : 'grid';
    btn.classList.toggle('is-on', rows ? mode === 'rows' : mode === 'grid');
  });
}

function _liveFlip(root, render) {
  if (!root) {
    render();
    return;
  }
  const prev = new Map();
  root.querySelectorAll('[data-live-id]').forEach((el) => {
    prev.set(el.dataset.liveId, el.getBoundingClientRect());
  });
  render();
  root.querySelectorAll('[data-live-id]').forEach((el) => {
    const before = prev.get(el.dataset.liveId);
    if (!before) {
      el.classList.add('live-card--enter');
      return;
    }
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      el.style.transition = 'transform .45s cubic-bezier(.33,1,.68,1)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => {
        el.style.transition = '';
        el.style.transform = '';
      }, { once: true });
    });
  });
  _syncLiveLayoutButtons();
}

function setLiveFloorLayout(mode) {
  const next = (mode === 'rows' || mode === 'strip') ? 'rows' : 'grid';
  try { localStorage.setItem('mb-live-layout', next); } catch (_) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
  _syncLiveLayoutButtons();
  if (typeof _paintDashLive === 'function') _paintDashLive();
  if (typeof _supRenderCards === 'function') _supRenderCards();
}

function toggleLiveFloorStatus(st) {
  const on = liveFloorFilter();
  if (st === '*') liveFloorStatuses().forEach((k) => { on[k] = true; });
  else if (Object.prototype.hasOwnProperty.call(on, st)) on[st] = !on[st];
  if (typeof _paintDashLive === 'function') _paintDashLive();
  if (typeof _supRenderCards === 'function') _supRenderCards();
  if (typeof _supUpdateSummary === 'function') _supUpdateSummary();
}

let _dashLiveCache = [];
let _dashLiveCamps = {};

async function renderDashLiveAgents() {
  const live = document.getElementById('live-agents');
  if (!live) return;
  const de = currentLang === 'de';
  const ff = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
  const [sessions, camps] = await Promise.all([
    sb(`agent_sessions?select=*&order=agent_name.asc${ff}`).catch(() => []),
    sb(`campaigns?select=id,name${ff}`).catch(() => []),
  ]);
  _dashLiveCamps = {};
  (Array.isArray(camps) ? camps : []).forEach((c) => { if (c?.id) _dashLiveCamps[c.id] = c.name || ''; });
  _dashLiveCache = (Array.isArray(sessions) ? sessions : []).slice().sort(compareLiveAgents);
  _paintDashLive();
}

function _paintDashLive() {
  const live = document.getElementById('live-agents');
  if (!live) return;
  const de = currentLang === 'de';
  const rows = _dashLiveCache;
  const count = (st) => rows.filter((s) => s.status === st).length;
  const sub = document.getElementById('dash-live-sub');
  if (sub) {
    const n = count('on_call');
    sub.textContent = de
      ? (n === 1 ? '1 aktives Gespräch' : `${n} aktive Gespräche`)
      : `${n} kişi görüşmede`;
  }
  if (!rows.length) {
    live.innerHTML = `<div class="mb-empty-hint" style="font-size:13px;">${t('ui.no_active_agents')}</div>`;
    return;
  }
  const filter = liveFloorFilter();
  const allLabel = de ? 'Alle' : 'Tümü';
  const chips = `<button type="button" class="live-filter live-filter--all" onclick="toggleLiveFloorStatus('*')">${allLabel}</button>`
    + liveFloorStatuses().map((st) => {
      const info = _DASH_LIVE_STATUS[st];
      const label = de ? info.de : info.tr;
      const off = filter[st] === false ? ' inactive' : '';
      const dot = typeof mbLiveDot === 'function' ? mbLiveDot(st) : _LIVE_DOT[st];
      return `<button type="button" class="live-filter${off}" data-live-status="${st}" style="--dot:${dot}" onclick="toggleLiveFloorStatus('${st}')"><span class="dot"></span><span class="label">${count(st)} ${label}</span></button>`;
    }).join('');
  const visible = rows.filter((s) => filter[s.status] !== false);
  const isAdmin = mbIsFirmAdmin();
  const asRows = liveFloorLayout() === 'rows';
  const people = visible.map((s) => {
    const st = _DASH_LIVE_STATUS[s.status] ? s.status : 'offline';
    const info = _DASH_LIVE_STATUS[st];
    const label = de ? info.de : info.tr;
    const name = _dashLiveEsc(s.agent_name || '—');
    const initial = _dashLiveEsc((s.agent_name || '?').trim().charAt(0).toUpperCase());
    const camp = _dashLiveEsc(_dashLiveCamps[s.campaign_id] || '—');
    const who = _dashLiveEsc(s.current_contact_name || '—');
    const phone = _dashLiveEsc(s.current_contact_phone || '—');
    const since = liveStateSinceIso(s);
    const age = liveAgeUnit(s);
    const deep = age >= 0.55 ? ' live-tone--deep' : '';
    const dur = liveClock(since, de);
    const aid = _dashLiveEsc(s.agent_id || '');
    const sinceAttr = _dashLiveEsc(since);
    const actions = (isAdmin && typeof mbLiveActionsHtml === 'function') ? mbLiveActionsHtml(s) : '';
    if (asRows) {
      return `<div class="live-line live-line--${st}${deep}" data-live-id="${aid}" data-since="${sinceAttr}" style="--live-age:${age.toFixed(3)}">
        <div class="live-line-who"><span class="live-av">${initial}</span><span class="live-name">${name}</span></div>
        <div class="live-status">${label}</div>
        <div class="live-dur" data-clock>${_dashLiveEsc(dur)}</div>
        <div class="live-line-clip">${who}</div>
        <div class="live-line-clip">${phone}</div>
        <div class="live-line-clip">${camp}</div>
        ${actions}
      </div>`;
    }
    const facts = `<div><dt>${de ? 'Kontakt' : 'Müşteri'}</dt><dd>${who}</dd></div>
         <div><dt>${de ? 'Nummer' : 'Numara'}</dt><dd>${phone}</dd></div>
         <div><dt>${de ? 'Kampagne' : 'Kampanya'}</dt><dd>${camp}</dd></div>`;
    return `<article class="live-card live-card--${st}${deep}" data-live-id="${aid}" data-since="${sinceAttr}" style="--live-age:${age.toFixed(3)}">
      <div class="live-card-top">
        <div class="live-av">${initial}</div>
        <div style="min-width:0;flex:1;"><div class="live-name">${name}</div><div class="live-status">${label}</div></div>
        <div class="live-dur" data-clock>${_dashLiveEsc(dur)}</div>
        ${actions}
      </div>
      <dl class="live-facts">${facts}</dl>
    </article>`;
  }).join('');
  const head = asRows ? `<div class="live-rows-head${isAdmin ? ' live-rows-head--act' : ''}">
      <span>${de ? 'Agent' : 'Temsilci'}</span>
      <span>${de ? 'Status' : 'Durum'}</span>
      <span>${de ? 'Dauer' : 'Süre'}</span>
      <span>${de ? 'Kontakt' : 'Müşteri'}</span>
      <span>${de ? 'Nummer' : 'Numara'}</span>
      <span>${de ? 'Kampagne' : 'Kampanya'}</span>
      ${isAdmin ? `<span>${de ? 'Aktion' : 'İşlem'}</span>` : ''}
    </div>` : '';
  const board = visible.length
    ? (asRows
      ? `<div class="live-rows${isAdmin ? ' live-rows--act' : ''}">${head}${people}</div>`
      : `<div class="live-grid">${people}</div>`)
    : `<div class="mb-empty-hint" style="font-size:13px;">${de ? 'Keine Agenten in dieser Auswahl.' : 'Bu seçimde temsilci yok.'}</div>`;
  _liveFlip(live, () => {
    live.innerHTML = `<div class="live-filters">${chips}</div>${board}`;
  });
  if (window._dashLiveTimer) clearInterval(window._dashLiveTimer);
  window._dashLiveTimer = setInterval(() => {
    if (!document.getElementById('page-dashboard')?.classList.contains('active')) return;
    _dashLiveTick();
  }, 1000);
}

async function remoteChangeAgentStatus(agentId, newStatus) {
try {
await sb(`agent_sessions?agent_id=eq.${agentId}`,{
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({status:newStatus, updated_at:new Date().toISOString()})
});
const _st = _DASH_LIVE_STATUS[newStatus];
const _lbl = _st ? (currentLang === 'de' ? _st.de : _st.tr) : newStatus;
toast(currentLang === 'de' ? `Status: ${_lbl}` : `Durum: ${_lbl}`, 'ok');
loadDashboard();
} catch(e) { toast('Hata: '+e.message,'err'); }
}

try {
  window.setLiveFloorLayout = setLiveFloorLayout;
  window.toggleLiveFloorStatus = toggleLiveFloorStatus;
  window._liveFlip = _liveFlip;
  window.liveFloorLayout = liveFloorLayout;
  window.liveFloorFilter = liveFloorFilter;
  window.compareLiveAgents = compareLiveAgents;
  window.liveStateSinceIso = liveStateSinceIso;
  window.liveStateAgeSec = liveStateAgeSec;
  window.liveAgeUnit = liveAgeUnit;
  window.liveClock = liveClock;
  window.livePaintAge = livePaintAge;
} catch (_) {}
