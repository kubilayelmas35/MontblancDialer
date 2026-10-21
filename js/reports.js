function openStatsReport(view) {
  window._statsReport = view || 'overview';
  const onPage = document.getElementById('page-stats')?.classList.contains('active');
  if (!onPage) navigate('stats');
  else if (typeof loadStats === 'function') loadStats();
  document.querySelectorAll('.sb-item').forEach((btn) => btn.classList.remove('active'));
  const hit = document.querySelector(`.sb-item[data-rep="${window._statsReport}"]`);
  if (hit) {
    hit.classList.add('active');
    hit.closest('.sb-group')?.classList.remove('is-collapsed');
  }
}

function mbSyncStatsChrome() {
  const view = window._statsReport || 'overview';
  const overview = document.getElementById('stats-overview');
  const extra = document.getElementById('stats-extra');
  if (overview) overview.style.display = view === 'overview' ? '' : 'none';
  if (extra) extra.style.display = view === 'overview' ? 'none' : 'flex';
  const exp = document.getElementById('stats-export-btns');
  if (exp) exp.style.display = view === 'overview' ? '' : 'none';
  const result = document.getElementById('stats-result-f');
  if (result) result.style.display = view === 'result' ? '' : 'none';
}

function repCard(title, body, hint) {
  return `<div class="card"><div class="card-title">${statsEsc(title)}</div>${hint ? `<div class="firm-none" style="margin-bottom:8px;">${statsEsc(hint)}</div>` : ''}${body}</div>`;
}

function repTable(heads, rows) {
  const th = heads.map((h) => `<th>${statsEsc(h)}</th>`).join('');
  const body = rows.length ? rows.join('') : `<tr><td colspan="${heads.length}">${statsEsc(t('stats.none'))}</td></tr>`;
  return `<div class="tbl-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const REP_BAR_COLORS = ['#7dd3fc', '#fdba74', '#fb923c', '#4ade80', '#60a5fa', '#f97316', '#38bdf8', '#f87171', '#a78bfa', '#facc15', '#34d399', '#f472b6'];
let _repHourCharts = [];
let _repHourSeq = 0;

function repHourCounts(items) {
  const hours = Array.from({ length: 24 }, () => 0);
  (items || []).forEach((iso) => {
    if (!iso) return;
    const h = statsBerlinHour(iso);
    if (h >= 0 && h <= 23) hours[h] += 1;
  });
  return hours;
}

function repHourTable(hours) {
  const rows = [];
  hours.forEach((n, i) => {
    if (!n) return;
    rows.push(`<tr><td>${rows.length + 1}</td><td>${String(i).padStart(2, '0')}:00</td><td>${n}</td></tr>`);
  });
  return repTable(['#', t('rep.hour'), t('rep.qty')], rows);
}

function repHours(items, tone) {
  const hours = repHourCounts(items);
  if (!hours.some((n) => n > 0)) return `<div class="firm-none">${statsEsc(t('stats.none'))}</div>`;
  if (typeof Chart === 'undefined') {
    const max = Math.max(1, ...hours);
    const html = hours.map((n, i) => {
      if (!n) return '';
      const w = Math.round(n / max * 100);
      return `<div class="stats-hour"><span>${String(i).padStart(2, '0')}:00</span><span class="stats-hour-track"><span class="stats-hour-bar" style="width:${w}%"></span></span><span>${n}</span><span></span></div>`;
    }).join('');
    return `<div class="stats-hours">${html}</div>${repHourTable(hours)}`;
  }
  const id = `rep-hour-${++_repHourSeq}`;
  window._repHourPending = window._repHourPending || [];
  window._repHourPending.push({ id, hours, tone: tone || 'cool' });
  return `<div class="rep-hour-canvas"><canvas id="${id}"></canvas></div>${repHourTable(hours)}`;
}

function repMountHourCharts() {
  _repHourCharts.forEach((chart) => { try { chart.destroy(); } catch (_) {} });
  _repHourCharts = [];
  const pending = window._repHourPending || [];
  window._repHourPending = [];
  if (typeof Chart === 'undefined') return;
  const text = typeof _dashCssVar === 'function' ? _dashCssVar('--text-2', '#64748b') : '#64748b';
  const grid = typeof _dashCssVar === 'function' ? _dashCssVar('--border', '#e2e8f0') : '#e2e8f0';
  pending.forEach((spec) => {
    const canvas = document.getElementById(spec.id);
    if (!canvas) return;
    const labels = [];
    const data = [];
    const colors = [];
    spec.hours.forEach((n, i) => {
      if (!n) return;
      labels.push(`${String(i).padStart(2, '0')}:00`);
      data.push(n);
      colors.push(REP_BAR_COLORS[(spec.tone === 'warm' ? i + 1 : i) % REP_BAR_COLORS.length]);
    });
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('rep.freq'),
          data,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 46,
          hoverBackgroundColor: colors.map((c) => c),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            displayColors: false,
            callbacks: {
              label(ctx) { return `${ctx.parsed.y}`; },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text, font: { size: 11 } } },
          y: {
            beginAtZero: true,
            title: { display: true, text: t('rep.freq'), color: text, font: { size: 11 } },
            grid: { color: grid },
            ticks: { color: text, precision: 0, font: { size: 11 } },
          },
        },
      },
    });
    _repHourCharts.push(chart);
  });
}

function repOutcomeLabel(key) {
  if (typeof chOutcomeText === 'function') return chOutcomeText(key, window._statsLabelMap);
  return key || '—';
}

function repDurumLabel(key) {
  const known = ['qc_bekleniyor', 'basarili', 'basarisiz', 'beklemede', 'ulasilamadi', 'iptal'];
  const k = String(key || '').trim();
  if (k === 'onaylandi' || k === 'onay') return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Bestätigt' : 'Onaylandı';
  if (known.includes(k)) return t(`res.${k}`);
  return k || '—';
}

function repStatusLabel(status) {
  const key = `agent.status.${status || 'offline'}`;
  const label = t(key);
  return label === key ? (status || '—') : label;
}

function repWhen(iso) {
  if (!iso) return '—';
  if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return String(iso).slice(0, 16);
}

function repRole(role) {
  return typeof firmRoleLabel === 'function' ? firmRoleLabel(role) : (role || '—');
}

async function repLoadBundle(range) {
  const pulled = await statsPullLogs(range.ff, range.gte, range.lte, range.camp, range.agent);
  const logs = pulled.rows || [];
  const labelMap = typeof statsOutcomeLabels === 'function' ? await statsOutcomeLabels(logs.map((l) => l.campaign_id)) : {};
  window._statsLabelMap = labelMap;
  let appts = [];
  try {
    appts = (await sb(`appointments?select=id,kayit_tarihi,durum,agent_id,firm_id${range.ff}&kayit_tarihi=gte.${range.gte}&kayit_tarihi=lte.${range.lte}&limit=8000`)) || [];
  } catch (e) {
    appts = [];
  }
  const allAppts = appts;
  if (range.agent) appts = appts.filter((a) => String(a.agent_id) === String(range.agent));
  return { logs, appts, allAppts, capped: pulled.capped };
}

function repByOutcome(logs) {
  const bag = {};
  logs.forEach((l) => {
    const key = statsOutcomeKey(l.outcome) || 'other';
    if (!bag[key]) bag[key] = { n: 0, sec: 0 };
    bag[key].n += 1;
    bag[key].sec += Number(l.duration_sec) || 0;
  });
  return Object.keys(bag).sort((a, b) => bag[b].n - bag[a].n).map((key) => ({ key, ...bag[key] }));
}

async function loadStatsReport() {
  const host = document.getElementById('stats-extra');
  if (!host) return;
  const view = window._statsReport || 'overview';
  mbSyncStatsChrome();
  if (typeof renderFirmSelector === 'function') renderFirmSelector('stats-firm-selector', loadStats);
  host.innerHTML = `<div class="card"><div class="firm-none">${statsEsc(t('ui.loading'))}</div></div>`;
  try {
    const range = statsCurrentRange();
    if (typeof statsFillFilters === 'function') await statsFillFilters(range.fid);
    const fresh = statsCurrentRange();
    const pack = await repLoadBundle(fresh);
    const firmQ = fresh.fid ? `&firm_id=eq.${fresh.fid}` : '';
    const users = (await sb(`users?select=id,name,role,firm_id${firmQ}&order=name.asc&limit=400`).catch(() => [])) || [];
    let sessions = await sb(`agent_sessions?select=agent_id,status,last_seen,break_code,break_start,campaign_id,login_at${firmQ}&order=last_seen.desc.nullslast&limit=400`).catch(() => null);
    if (!sessions) sessions = (await sb(`agent_sessions?select=agent_id,status,last_seen,break_start,campaign_id,login_at${firmQ}&order=last_seen.desc.nullslast&limit=400`).catch(() => [])) || [];
    if (!sessions) sessions = (await sb(`agent_sessions?select=agent_id,status,last_seen,campaign_id${firmQ}&order=last_seen.desc.nullslast&limit=400`).catch(() => [])) || [];
    const userById = {};
    users.forEach((u) => { userById[u.id] = u; });
    const sessById = {};
    sessions.forEach((s) => { sessById[s.agent_id] = s; });
    if (view === 'operator') await repLoadOperatorExtra(pack, fresh);
    if (view === 'perf' || view === 'group') {
      const logQ = fresh.fid ? `&firm_id=eq.${fresh.fid}` : '';
      pack.statusLogs = (await sb(`agent_status_log?select=agent_id,status,started_at,ended_at,duration_sec${logQ}&started_at=gte.${fresh.gte}&started_at=lte.${fresh.lte}&order=started_at.desc&limit=2000`).catch(() => [])) || [];
    }
    host.innerHTML = repPaint(view, pack, fresh, userById, sessById);
    if (view === 'credit') host.innerHTML += await repCreditExtra(pack.logs, fresh);
    repMountHourCharts();
    repMountCreditChart();
    repMountGroupChart();
  } catch (e) {
    host.innerHTML = `<div class="card"><div class="firm-none">${statsEsc(t('ui.error_prefix') + (e?.message || ''))}</div></div>`;
  }
}

function repPaint(view, pack, range, userById, sessById) {
  window._repHourPending = [];
  window._repGroupSpec = null;
  const logs = pack.logs || [];
  const appts = pack.appts || [];
  if (view === 'calls') return repCard(t('stats.out_title'), repTable(
    [t('stats.col.result'), t('stats.col.count'), t('stats.col.time'), '%'],
    repByOutcome(logs).map((row) => {
      const share = logs.length ? Math.round(row.n / logs.length * 100) : 0;
      return `<tr><td>${statsEsc(repOutcomeLabel(row.key))}</td><td>${row.n}</td><td>${statsEsc(statsHms(row.sec))}</td><td>${share}%</td></tr>`;
    })
  ));
  if (view === 'result') return repResult(logs);
  if (view === 'appt') return `<div class="rep-appt-grid">${[
    repCard(t('rep.create'), repHours(appts.map((a) => a.kayit_tarihi), 'cool'), t('rep.create_hint')),
    repCard(t('rep.call'), repHours(logs.filter((l) => statsOutcomeKey(l.outcome) === 'appointment').map((l) => l.started_at), 'warm'), t('rep.call_hint')),
  ].join('')}</div>`;
  if (view === 'operator') return repOperator(logs, pack.allAppts || appts, userById, sessById, pack);
  if (view === 'perf') return repPerf(logs, appts, userById, sessById, pack, range);
  if (view === 'group') return repGroup(logs, appts, userById, sessById, pack, range);
  if (view === 'rank') return repPeople(view, logs, appts, userById);
  return '';
}

function repResult(logs) {
  const sel = document.getElementById('stats-result-f');
  const keys = repByOutcome(logs).map((row) => row.key);
  const current = sel?.value || '';
  if (sel) {
    const keep = keys.includes(current) ? current : (keys[0] || '');
    sel.innerHTML = keys.map((key) => `<option value="${statsEsc(key)}">${statsEsc(repOutcomeLabel(key))}</option>`).join('');
    if (keep) sel.value = keep;
  }
  const key = sel?.value || keys[0] || '';
  const rows = logs.filter((l) => statsOutcomeKey(l.outcome) === key);
  return repCard(repOutcomeLabel(key), repHours(rows.map((l) => l.started_at)));
}

const REP_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#64748b'];

function repDay(iso) {
  if (!iso) return '';
  if (typeof mbBerlinDay === 'function') return mbBerlinDay(iso);
  return String(iso).slice(0, 10);
}

function repDonut(parts, center) {
  const total = parts.reduce((sum, part) => sum + part.n, 0);
  if (!total) {
    return `<div class="rep-donut" style="background:var(--bg-3)"><div class="rep-donut-hole">—</div></div>`;
  }
  let acc = 0;
  const stops = parts.map((part, i) => {
    const start = acc / total * 100;
    acc += part.n;
    return `${REP_COLORS[i % REP_COLORS.length]} ${start}% ${acc / total * 100}%`;
  }).join(',');
  const legend = parts.map((part, i) => `<div class="rep-legend-row"><i style="background:${REP_COLORS[i % REP_COLORS.length]}"></i><span>${statsEsc(part.label)}</span><b>${statsEsc(part.text)}</b></div>`).join('');
  return `<div class="rep-donut-wrap"><div class="rep-donut" style="background:conic-gradient(${stops})"><div class="rep-donut-hole">${statsEsc(center)}</div></div><div class="rep-legend">${legend}</div></div>`;
}

function repLoggedToday(sess, today) {
  if (!sess) return false;
  if (sess.login_at && repDay(sess.login_at) === today) return true;
  if (sess.status && sess.status !== 'offline' && repDay(sess.last_seen) === today) return true;
  return false;
}

async function repLoadOperatorExtra(pack, range) {
  pack.statusLogs = [];
  pack.campMap = {};
  pack.todayLogs = pack.logs || [];
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const firmQ = range.fid ? `&firm_id=eq.${range.fid}` : '';
  const camps = await sb(`campaigns?select=id,name${firmQ}&limit=300`).catch(() => []);
  (camps || []).forEach((camp) => { pack.campMap[camp.id] = camp.name || ''; });
  pack.statusLogs = (await sb(`agent_status_log?select=agent_id,status,break_code,campaign_id,started_at,ended_at,duration_sec${firmQ}&started_at=gte.${range.gte}&started_at=lte.${range.lte}&order=started_at.desc&limit=200`).catch(() => [])) || [];
  pack.qcResults = await repLoadQcResults(range);
  const sameDay = range.dateFrom === today && range.dateTo === today && !range.agent && !range.camp;
  if (!sameDay && today) {
    const gte = typeof mbInstantGte === 'function' ? mbInstantGte(today) : `${today}T00:00:00`;
    const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
    const pulled = await statsPullLogs(range.ff, gte, lte, '', '');
    pack.todayLogs = pulled.rows || [];
  } else if (range.agent || range.camp) {
    const pulled = await statsPullLogs(range.ff, range.gte, range.lte, '', '');
    pack.todayLogs = range.dateFrom === today ? (pulled.rows || []) : pack.todayLogs;
  }
}

function repOperator(logs, appts, userById, sessById, pack) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const agentId = document.getElementById('stats-agent-f')?.value || '';
  const user = userById[agentId] || null;
  const sess = agentId ? sessById[agentId] : null;
  const outcomes = repByOutcome(logs);
  const countParts = outcomes.map((row) => ({ n: row.n, label: repOutcomeLabel(row.key), text: String(row.n) }));
  const timeParts = outcomes.filter((row) => row.sec > 0).map((row) => ({ n: row.sec, label: repOutcomeLabel(row.key), text: statsHms(row.sec) }));
  const totalSec = outcomes.reduce((sum, row) => sum + row.sec, 0);
  const loginAt = sess?.login_at || '';
  const lastAct = (pack.statusLogs || []).find((row) => !agentId || String(row.agent_id) === String(agentId))?.started_at || sess?.last_seen || '';
  const card = `<div class="card rep-person">
<div class="rep-person-name">${statsEsc(user?.name || t('rep.pick_person'))}</div>
<div class="firm-none">${statsEsc(user ? repRole(user.role) : t('rep.pick'))}</div>
<div class="rep-person-meta"><span>${statsEsc(t('rep.login'))}</span><b>${statsEsc(loginAt ? repWhen(loginAt) : '—')}</b></div>
<div class="rep-person-meta"><span>${statsEsc(t('rep.last_act'))}</span><b>${statsEsc(lastAct ? repWhen(lastAct) : '—')}</b></div>
<div class="rep-person-meta"><span>${statsEsc(t('rep.now'))}</span><b>${statsEsc(sess ? repStatusLabel(sess.status) : '—')}${sess?.status === 'break' && sess.break_code ? ` · ${statsEsc(sess.break_code)}` : ''}</b></div>
</div>`;
  const rings = `<div class="rep-op-grid">${card}
${repCard(t('rep.count_ring'), repDonut(countParts, String(logs.length)))}
${repCard(t('rep.time_ring'), repDonut(timeParts, statsHms(totalSec)))}
</div>`;
  const staff = Object.values(userById).filter((u) => u.role === 'agent' || u.role === 'qc');
  const absent = staff.filter((u) => !repLoggedToday(sessById[u.id], today));
  const absentTable = absent.length
    ? repTable([t('rep.person'), t('rep.last')], absent.map((u) => {
      const row = sessById[u.id];
      return `<tr><td>${statsEsc(u.name || '')}</td><td>${statsEsc(repWhen(row?.login_at || row?.last_seen))}</td></tr>`;
    }))
    : `<div class="firm-none">${statsEsc(t('rep.absent_none'))}</div>`;
  const history = repStatusTable(agentId, userById, sessById, pack);
  const sales = repSalesTable(appts, userById, pack.qcResults);
  const breaks = repBreakTable(pack.statusLogs || [], userById, sessById);
  const breakLive = Object.values(sessById).some((row) => row.status === 'break') || (pack.statusLogs || []).some((row) => row.status === 'break');
  const queues = repQueueTable(pack.todayLogs || [], pack.campMap || {});
  return [
    rings,
    repCard(t('rep.absent'), absentTable),
    repCard(t('rep.status_log'), history, (pack.statusLogs || []).length ? '' : t('rep.status_empty')),
    repCard(t('rep.sales_rank'), sales),
    repCard(t('rep.breaks'), breaks, breakLive ? '' : t('rep.breaks_empty')),
    repCard(t('rep.queue_today'), queues),
  ].join('');
}

function repStatusTable(agentId, userById, sessById, pack) {
  const campMap = pack.campMap || {};
  const rows = (pack.statusLogs || []).filter((row) => !agentId || String(row.agent_id) === String(agentId));
  const live = agentId ? [sessById[agentId]].filter(Boolean) : Object.values(sessById).filter((row) => row.status && row.status !== 'offline').slice(0, 40);
  const liveRows = live.map((row) => `<tr><td>${statsEsc(userById[row.agent_id]?.name || '—')}</td><td>${statsEsc(campMap[row.campaign_id] || '—')}</td><td>${statsEsc(t('rep.now_row'))} · ${statsEsc(repStatusLabel(row.status))}</td><td>${statsEsc(row.break_code || '—')}</td><td>—</td><td>${statsEsc(repWhen(row.last_seen))}</td></tr>`);
  const histRows = rows.map((row) => {
    const open = !row.ended_at;
    const sec = open ? Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000)) : (Number(row.duration_sec) || 0);
    return `<tr><td>${statsEsc(userById[row.agent_id]?.name || '—')}</td><td>${statsEsc(campMap[row.campaign_id] || '—')}</td><td>${statsEsc(repStatusLabel(row.status))}</td><td>${statsEsc(row.break_code || '—')}</td><td>${statsEsc(statsHms(sec))}${open ? ' ·' : ''}</td><td>${statsEsc(repWhen(row.started_at))}</td></tr>`;
  });
  return repTable([t('rep.person'), t('rep.queue'), t('rep.status_col'), t('rep.break_col'), t('stats.col.time'), t('rep.last_act')], liveRows.concat(histRows));
}

function repDurumKey(value) {
  if (typeof _normResultKey === 'function') return _normResultKey(value) || '—';
  const key = String(value || '').trim();
  return key || '—';
}

async function repLoadQcResults(range) {
  const pushInto = (columns, seen, key, label) => {
    const norm = repDurumKey(key);
    if (!norm || norm === '—' || seen.has(norm)) return;
    seen.add(norm);
    columns.push({ key: norm, label: String(label || '').trim() || repDurumLabel(norm) });
  };
  if (range.fid && typeof loadFirmAppointmentResults === 'function') {
    const rows = await loadFirmAppointmentResults(range.fid).catch(() => []);
    return rows || [];
  }
  const firms = (await sb('firms?select=id,settings&limit=200').catch(() => [])) || [];
  const columns = [];
  const seen = new Set();
  firms.forEach((firm) => {
    const raw = firm?.settings?.appointment_results;
    const list = Array.isArray(raw) && raw.length
      ? raw
      : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
    list.forEach((row) => pushInto(columns, seen, row?.key, row?.label));
  });
  if (!columns.length && typeof defaultAppointmentResults === 'function') return defaultAppointmentResults();
  return columns;
}

function repSalesTable(appts, userById, defs) {
  const columns = [];
  const seen = new Set();
  (defs || []).forEach((def) => {
    const key = repDurumKey(def?.key);
    if (!key || key === '—' || seen.has(key)) return;
    seen.add(key);
    columns.push({ key, label: String(def?.label || '').trim() || repDurumLabel(key) });
  });
  (appts || []).forEach((row) => {
    const key = repDurumKey(row.durum);
    if (seen.has(key)) return;
    seen.add(key);
    columns.push({ key, label: repDurumLabel(key) });
  });
  const bag = {};
  (appts || []).forEach((row) => {
    const id = row.agent_id || '—';
    if (!bag[id]) bag[id] = { name: userById[id]?.name || '—', counts: {}, total: 0 };
    const key = repDurumKey(row.durum);
    bag[id].counts[key] = (bag[id].counts[key] || 0) + 1;
    bag[id].total += 1;
  });
  const list = Object.values(bag).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr'));
  const sum = { counts: {}, total: 0 };
  list.forEach((row) => {
    sum.total += row.total;
    columns.forEach((col) => { sum.counts[col.key] = (sum.counts[col.key] || 0) + (row.counts[col.key] || 0); });
  });
  const heads = [t('rep.person')].concat(columns.map((col) => col.label), [t('rep.total')]);
  const cells = (row) => `<tr><td>${statsEsc(row.name || t('rep.total'))}</td>${columns.map((col) => `<td>${row.counts[col.key] || 0}</td>`).join('')}<td>${row.total}</td></tr>`;
  const body = list.map(cells);
  if (list.length) body.push(cells({ ...sum, name: t('rep.total') }));
  return repTable(heads, body);
}

function repBreakTable(statusLogs, userById, sessById) {
  const openLogged = new Set((statusLogs || []).filter((row) => row.status === 'break' && !row.ended_at).map((row) => String(row.agent_id)));
  const sessionBreaks = Object.values(sessById || {}).filter((row) => row.status === 'break' && !openLogged.has(String(row.agent_id)));
  const codes = [...new Set([...(typeof DEFAULT_AUX_CODES !== 'undefined' ? DEFAULT_AUX_CODES : []), ...(statusLogs || []).filter((row) => row.status === 'break').map((row) => row.break_code || '—'), ...sessionBreaks.map((row) => row.break_code || '—')])];
  const bag = {};
  const add = (id, code, sec) => {
    if (!bag[id]) bag[id] = { name: userById[id]?.name || '—', sec: {} };
    bag[id].sec[code] = (bag[id].sec[code] || 0) + sec;
  };
  (statusLogs || []).filter((row) => row.status === 'break').forEach((row) => {
    const sec = row.ended_at ? (Number(row.duration_sec) || 0) : Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000));
    add(row.agent_id || '—', row.break_code || '—', sec);
  });
  sessionBreaks.forEach((row) => {
    const sec = row.break_start ? Math.max(0, Math.round((Date.now() - new Date(row.break_start).getTime()) / 1000)) : 0;
    add(row.agent_id || '—', row.break_code || '—', sec);
  });
  const list = Object.values(bag).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  if (!list.length) {
    return repTable([t('rep.person')].concat(codes, [t('rep.total')]), []);
  }
  const totals = {};
  const rows = list.map((row) => {
    let sum = 0;
    const tds = codes.map((code) => {
      const sec = row.sec[code] || 0;
      sum += sec;
      totals[code] = (totals[code] || 0) + sec;
      return `<td>${statsEsc(statsHms(sec))}</td>`;
    }).join('');
    totals._sum = (totals._sum || 0) + sum;
    return `<tr><td>${statsEsc(row.name)}</td>${tds}<td>${statsEsc(statsHms(sum))}</td></tr>`;
  });
  rows.push(`<tr><td>${statsEsc(t('rep.total'))}</td>${codes.map((code) => `<td>${statsEsc(statsHms(totals[code] || 0))}</td>`).join('')}<td>${statsEsc(statsHms(totals._sum || 0))}</td></tr>`);
  return repTable([t('rep.person')].concat(codes, [t('rep.total')]), rows);
}

function repQueueTable(logs, campMap) {
  const bag = {};
  (logs || []).forEach((log) => {
    const id = log.campaign_id || '—';
    if (!bag[id]) bag[id] = { name: log.campaigns?.name || campMap[id] || '—', ok: 0, miss: 0, drop: 0 };
    const key = statsOutcomeKey(log.outcome);
    const sec = Number(log.duration_sec) || 0;
    if (key === 'no_answer' || key === 'voicemail') bag[id].miss += 1;
    else if (sec > 0) bag[id].ok += 1;
    else bag[id].drop += 1;
  });
  const list = Object.values(bag).sort((a, b) => (b.ok + b.miss + b.drop) - (a.ok + a.miss + a.drop));
  return repTable(
    [t('rep.queue'), t('rep.answered'), t('rep.unreached'), t('rep.dropped')],
    list.map((row) => `<tr><td>${statsEsc(row.name)}</td><td>${row.ok}</td><td>${row.miss}</td><td>${row.drop}</td></tr>`)
  );
}

function repIsOnline(sess) {
  if (!sess || !sess.status || sess.status === 'offline') return false;
  const seen = sess.last_seen ? new Date(sess.last_seen).getTime() : 0;
  return seen > 0 && (Date.now() - seen) < 90000;
}

function repLogSpan(row, sess) {
  if (!row?.started_at) return 0;
  if (row.ended_at) return Math.max(0, Number(row.duration_sec) || 0);
  if (!sess || String(sess.status) !== String(row.status) || !repIsOnline(sess)) return Math.max(0, Number(row.duration_sec) || 0);
  const sec = Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000));
  return Math.min(sec, 8 * 3600);
}

function repPersonRows(logs, appts, userById, sessById, pack, range) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const liveNow = !range || (range.dateFrom <= today && range.dateTo >= today);
  const bag = {};
  const rowOf = (id) => {
    const key = id || '—';
    if (!bag[key]) {
      const user = userById[key] || {};
      bag[key] = { id: key, name: user.name || '—', role: user.role || '', calls: 0, sale: 0, ok: 0, talk: 0, wait: 0, brk: 0 };
    }
    return bag[key];
  };
  Object.values(userById).forEach((user) => {
    if (['agent', 'qc', 'admin', 'firm_admin'].includes(user.role)) rowOf(user.id);
  });
  (logs || []).forEach((log) => {
    const row = rowOf(log.agent_id);
    if (!row.name || row.name === '—') row.name = log.users?.name || row.name;
    if (!row.role) row.role = log.users?.role || '';
    row.calls += 1;
    row.talk += Number(log.duration_sec) || 0;
  });
  (appts || []).forEach((appt) => {
    const row = rowOf(appt.agent_id);
    row.sale += 1;
    if (['basarili', 'onaylandi', 'onay'].includes(String(appt.durum || ''))) row.ok += 1;
  });
  (pack.statusLogs || []).forEach((row) => {
    const person = rowOf(row.agent_id);
    const sec = repLogSpan(row, sessById[row.agent_id]);
    if (row.status === 'break') person.brk += sec;
    else if (row.status === 'ready' || row.status === 'wrapping') person.wait += sec;
  });
  if (liveNow) {
    Object.values(sessById || {}).forEach((sess) => {
      if (sess.status !== 'break' || !sess.break_start || !repIsOnline(sess)) return;
      const logged = (pack.statusLogs || []).some((row) => String(row.agent_id) === String(sess.agent_id) && row.status === 'break' && !row.ended_at);
      if (logged) return;
      const person = bag[sess.agent_id];
      if (!person) return;
      const sec = Math.max(0, Math.round((Date.now() - new Date(sess.break_start).getTime()) / 1000));
      if (sec > 8 * 3600) return;
      person.brk += sec;
    });
  }
  return Object.values(bag);
}

function repPerf(logs, appts, userById, sessById, pack, range) {
  const list = repPersonRows(logs, appts, userById, sessById, pack, range).filter((row) => row.name && row.name !== '—').sort((a, b) => {
    const ao = repIsOnline(sessById[a.id]) ? 1 : 0;
    const bo = repIsOnline(sessById[b.id]) ? 1 : 0;
    return (bo - ao) || (b.calls - a.calls) || a.name.localeCompare(b.name, 'tr');
  });
  const mode = window._perfPresence || 'all';
  const rows = list.map((row) => {
    const on = repIsOnline(sessById[row.id]);
    const total = row.talk + row.wait + row.brk;
    return `<tr class="${on ? 'rep-perf-on' : 'rep-perf-off'}" data-on="${on ? '1' : '0'}" data-calls="${row.calls}" data-sale="${row.sale}" data-ok="${row.ok}" data-talk="${row.talk}" data-wait="${row.wait}" data-brk="${row.brk}" ${mode === 'on' && !on ? 'hidden' : ''} ${mode === 'off' && on ? 'hidden' : ''}>
<td><span class="rep-pill ${on ? 'on' : 'off'}">${statsEsc(on ? t('rep.perf_on') : t('rep.perf_off'))}</span> ${statsEsc(row.name)}</td>
<td>${statsEsc(repRole(row.role))}</td>
<td>${row.calls}</td>
<td>${row.sale}</td>
<td>${row.ok}</td>
<td>${statsEsc(statsHms(row.talk))}</td>
<td>${statsEsc(statsHms(row.wait))}</td>
<td>${statsEsc(statsHms(row.brk))}</td>
<td>${statsEsc(statsHms(total))}</td>
</tr>`;
  });
  const addUp = (rows) => rows.reduce((acc, row) => {
    acc.calls += row.calls; acc.sale += row.sale; acc.ok += row.ok; acc.talk += row.talk; acc.wait += row.wait; acc.brk += row.brk;
    return acc;
  }, { calls: 0, sale: 0, ok: 0, talk: 0, wait: 0, brk: 0 });
  const shown = list.filter((row) => {
    const on = repIsOnline(sessById[row.id]);
    if (mode === 'on') return on;
    if (mode === 'off') return !on;
    return true;
  });
  const sum = addUp(shown);
  const allSum = addUp(list);
  rows.push(`<tr class="rep-credit-total" id="rep-perf-total"><td>${statsEsc(t('rep.total'))}</td><td></td><td>${sum.calls}</td><td>${sum.sale}</td><td>${sum.ok}</td><td>${statsEsc(statsHms(sum.talk))}</td><td>${statsEsc(statsHms(sum.wait))}</td><td>${statsEsc(statsHms(sum.brk))}</td><td>${statsEsc(statsHms(sum.talk + sum.wait + sum.brk))}</td></tr>`);
  const online = list.filter((row) => repIsOnline(sessById[row.id])).length;
  const kpis = `<div class="rep-credit-kpis">
<div class="rep-kpi is-c"><span>${statsEsc(t('rep.perf_on'))}</span><b>${online}</b><small>${list.length}</small></div>
<div class="rep-kpi is-b"><span>${statsEsc(t('rep.calls_n'))}</span><b>${allSum.calls}</b></div>
<div class="rep-kpi is-a"><span>${statsEsc(t('rep.sale_n'))}</span><b>${allSum.sale}</b><small>${statsEsc(t('rep.sale_ok_n'))} ${allSum.ok}</small></div>
<div class="rep-kpi is-d"><span>${statsEsc(t('rep.oncall'))}</span><b>${statsEsc(statsHms(allSum.talk))}</b></div>
</div>`;
  const switcher = `<div class="rep-perf-switch">
<button type="button" class="${mode === 'all' ? 'is-on' : ''}" data-perf="all" onclick="repPerfFilter('all')">${statsEsc(t('rep.perf_all'))}</button>
<button type="button" class="${mode === 'on' ? 'is-on' : ''}" data-perf="on" onclick="repPerfFilter('on')">${statsEsc(t('rep.perf_on'))}</button>
<button type="button" class="${mode === 'off' ? 'is-on' : ''}" data-perf="off" onclick="repPerfFilter('off')">${statsEsc(t('rep.perf_off'))}</button>
</div>`;
  const table = repTable(
    [t('rep.person'), t('stats.col.role'), t('rep.calls_n'), t('rep.sale_n'), t('rep.sale_ok_n'), t('rep.oncall'), t('rep.wait'), t('rep.break_col'), t('rep.total_time')],
    rows
  );
  return `${kpis}${repCard(t('rep.talk'), `${switcher}${table}`, t('rep.perf_hint'))}`;
}

function repPerfFilter(mode) {
  window._perfPresence = mode === 'on' || mode === 'off' ? mode : 'all';
  document.querySelectorAll('#stats-extra .rep-perf-switch button').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.perf === window._perfPresence);
  });
  const sum = { calls: 0, sale: 0, ok: 0, talk: 0, wait: 0, brk: 0 };
  document.querySelectorAll('#stats-extra tr[data-on]').forEach((tr) => {
    const on = tr.dataset.on === '1';
    const hide = window._perfPresence === 'on' ? !on : window._perfPresence === 'off' ? on : false;
    tr.hidden = hide;
    if (hide) return;
    sum.calls += Number(tr.dataset.calls) || 0;
    sum.sale += Number(tr.dataset.sale) || 0;
    sum.ok += Number(tr.dataset.ok) || 0;
    sum.talk += Number(tr.dataset.talk) || 0;
    sum.wait += Number(tr.dataset.wait) || 0;
    sum.brk += Number(tr.dataset.brk) || 0;
  });
  const total = document.getElementById('rep-perf-total');
  if (!total) return;
  const cells = total.cells;
  if (!cells || cells.length < 9) return;
  cells[2].textContent = String(sum.calls);
  cells[3].textContent = String(sum.sale);
  cells[4].textContent = String(sum.ok);
  cells[5].textContent = statsHms(sum.talk);
  cells[6].textContent = statsHms(sum.wait);
  cells[7].textContent = statsHms(sum.brk);
  cells[8].textContent = statsHms(sum.talk + sum.wait + sum.brk);
}

function repGroup(logs, appts, userById, sessById, pack, range) {
  const people = repPersonRows(logs, appts, userById, sessById, pack, range);
  const groups = {};
  people.forEach((row) => {
    const key = row.role || '';
    if (!groups[key]) groups[key] = { role: key, people: 0, online: 0, calls: 0, sale: 0, ok: 0, talk: 0, wait: 0, brk: 0 };
    const group = groups[key];
    if (row.name && row.name !== '—') {
      group.people += 1;
      if (repIsOnline(sessById[row.id])) group.online += 1;
    }
    group.calls += row.calls;
    group.sale += row.sale;
    group.ok += row.ok;
    group.talk += row.talk;
    group.wait += row.wait;
    group.brk += row.brk;
  });
  const list = Object.values(groups).filter((row) => row.people || row.calls || row.sale).sort((a, b) => b.calls - a.calls || a.role.localeCompare(b.role, 'tr'));
  const sum = list.reduce((acc, row) => {
    acc.people += row.people; acc.online += row.online; acc.calls += row.calls; acc.sale += row.sale; acc.ok += row.ok;
    acc.talk += row.talk; acc.wait += row.wait; acc.brk += row.brk;
    return acc;
  }, { people: 0, online: 0, calls: 0, sale: 0, ok: 0, talk: 0, wait: 0, brk: 0 });
  window._repGroupSpec = list.length ? {
    labels: list.map((row) => (row.role ? repRole(row.role) : t('rep.unassigned'))),
    data: list.map((row) => row.calls),
    talk: list.map((row) => row.talk),
    sale: list.map((row) => row.sale),
  } : null;
  const rows = list.map((row) => {
    const share = sum.calls ? Math.round(row.calls / sum.calls * 100) : 0;
    const total = row.talk + row.wait + row.brk;
    return `<tr>
<td><div class="rep-group-name">${statsEsc(row.role ? repRole(row.role) : t('rep.unassigned'))}</div>${repCreditShare(share)}</td>
<td>${row.online} / ${row.people}</td>
<td>${row.calls}</td>
<td>${statsEsc(statsHms(row.talk))}</td>
<td>${statsEsc(statsHms(row.wait))}</td>
<td>${statsEsc(statsHms(row.brk))}</td>
<td>${statsEsc(statsHms(total))}</td>
<td>${row.sale}</td>
<td>${row.ok}</td>
</tr>`;
  });
  rows.push(`<tr class="rep-credit-total"><td>${statsEsc(t('rep.total'))}</td><td>${sum.online} / ${sum.people}</td><td>${sum.calls}</td><td>${statsEsc(statsHms(sum.talk))}</td><td>${statsEsc(statsHms(sum.wait))}</td><td>${statsEsc(statsHms(sum.brk))}</td><td>${statsEsc(statsHms(sum.talk + sum.wait + sum.brk))}</td><td>${sum.sale}</td><td>${sum.ok}</td></tr>`);
  const kpis = `<div class="rep-credit-kpis">
<div class="rep-kpi is-c"><span>${statsEsc(t('rep.user_group'))}</span><b>${list.length}</b><small>${sum.online} / ${sum.people}</small></div>
<div class="rep-kpi is-b"><span>${statsEsc(t('rep.calls_n'))}</span><b>${sum.calls}</b></div>
<div class="rep-kpi is-a"><span>${statsEsc(t('rep.sale_n'))}</span><b>${sum.sale}</b><small>${statsEsc(t('rep.sale_ok_n'))} ${sum.ok}</small></div>
<div class="rep-kpi is-d"><span>${statsEsc(t('rep.oncall'))}</span><b>${statsEsc(statsHms(sum.talk))}</b></div>
</div>`;
  const chart = `<div class="rep-group-canvas"><canvas id="rep-group-chart"></canvas></div>`;
  const table = repTable(
    [t('rep.user_group'), t('rep.people_n'), t('rep.calls_n'), t('rep.oncall'), t('rep.wait'), t('rep.break_col'), t('rep.total_time'), t('rep.sale_n'), t('rep.sale_ok_n')],
    rows
  );
  return `${kpis}${repCard(t('rep.group_chart'), chart)}${repCard(t('stats.role_title'), table, t('rep.perf_hint'))}`;
}

function repPeople(view, logs, appts, userById) {
  const bag = {};
  function rowOf(id) {
    const key = id || '—';
    if (!bag[key]) {
      const u = userById[key] || {};
      const sample = logs.find((l) => String(l.agent_id) === String(key));
      bag[key] = {
        name: id ? (u.name || sample?.users?.name || '—') : '—',
        role: u.role || sample?.users?.role || '',
        calls: 0,
        answered: 0,
        sec: 0,
        appt: 0,
        ok: 0,
      };
    }
    return bag[key];
  }
  logs.forEach((l) => {
    const row = rowOf(l.agent_id);
    row.calls += 1;
    const sec = Number(l.duration_sec) || 0;
    row.sec += sec;
    if (sec > 0) row.answered += 1;
  });
  appts.forEach((a) => {
    const row = rowOf(a.agent_id);
    row.appt += 1;
    if (['basarili', 'onaylandi', 'onay'].includes(String(a.durum || ''))) row.ok += 1;
  });
  const list = Object.values(bag);
  if (view === 'rank') {
    const rows = list.slice().sort((a, b) => (b.ok - a.ok) || (b.appt - a.appt) || a.name.localeCompare(b.name, 'tr')).map((row, i) => `<tr><td>${i + 1}</td><td>${statsEsc(row.name)}</td><td>${statsEsc(repRole(row.role))}</td><td>${row.ok}</td><td>${row.appt}</td></tr>`);
    return repCard(t('rep.rank'), repTable([t('rep.rank'), t('rep.person'), t('stats.col.role'), t('rep.ok'), t('stats.appt_short')], rows));
  }
  const rows = list.slice().sort((a, b) => b.calls - a.calls).map((row) => `<tr><td>${statsEsc(row.name)}</td><td>${statsEsc(repRole(row.role))}</td><td>${row.calls}</td><td>${row.answered}</td><td>${statsEsc(statsHms(row.sec))}</td><td>${row.appt}</td><td>${row.ok}</td></tr>`);
  return repCard(t('rep.talk'), repTable([t('rep.person'), t('stats.col.role'), t('stats.col.count'), t('rep.answered'), t('rep.talk'), t('stats.appt_short'), t('rep.ok')], rows), t('rep.gap'));
}

function repMoney(amount, cur) {
  if (typeof formatMoney === 'function') return formatMoney(amount, cur || 'EUR');
  return `${Number(amount || 0).toFixed(2)} ${cur || 'EUR'}`;
}

function repCreditShare(pct) {
  const width = Math.max(0, Math.min(100, Math.round(pct)));
  return `<div class="rep-share" title="${width}%"><span style="width:${width}%"></span></div>`;
}

async function repCreditExtra(logs, range) {
  const firmQ = range.fid ? `id=eq.${range.fid}&` : '';
  const firms = (await sb(`firms?${firmQ}select=id,name,settings,currency&limit=200`).catch(() => [])) || [];
  const byFirm = {};
  firms.forEach((firm) => { byFirm[firm.id] = firm; });
  const queues = {};
  const prefixes = {};
  let calls = 0;
  let sec = 0;
  let money = 0;
  let currency = 'EUR';
  const currencies = new Set();
  (logs || []).forEach((log) => {
    const talk = Number(log.duration_sec) || 0;
    calls += 1;
    sec += talk;
    const firm = byFirm[log.firm_id] || {};
    const cur = typeof normalizeCurrency === 'function' ? normalizeCurrency(firm.currency) : (firm.currency || 'EUR');
    currency = cur;
    const rate = typeof statsMatchRate === 'function' ? statsMatchRate(log.phone, firm.settings?.billing?.rates || []) : null;
    const cost = rate ? (talk / 60) * (Number(rate.price) || 0) : 0;
    if (rate) currencies.add(cur);
    money += cost;
    const qid = log.campaign_id || '—';
    if (!queues[qid]) queues[qid] = { name: log.campaigns?.name || '—', calls: 0, sec: 0, money: 0, cur };
    queues[qid].calls += 1;
    queues[qid].sec += talk;
    queues[qid].money += cost;
    if (rate) {
      const pid = `${rate.prefix}|${rate.name || ''}|${rate.price}|${cur}`;
      if (!prefixes[pid]) prefixes[pid] = { prefix: rate.prefix || '—', name: rate.name || rate.prefix || '—', price: Number(rate.price) || 0, calls: 0, sec: 0, money: 0, cur };
      prefixes[pid].calls += 1;
      prefixes[pid].sec += talk;
      prefixes[pid].money += cost;
    }
  });
  const queueList = Object.values(queues).sort((a, b) => b.sec - a.sec || b.calls - a.calls);
  const prefixList = Object.values(prefixes).sort((a, b) => b.money - a.money || b.sec - a.sec);
  const top = queueList[0];
  const maxSec = Math.max(1, ...queueList.map((row) => row.sec));
  const kpis = `<div class="rep-credit-kpis">
<div class="rep-kpi is-a"><span>${statsEsc(t('rep.credit_sum'))}</span><b>${statsEsc(prefixList.length ? repMoney(money, currency) : '—')}</b><small>${statsEsc(t('stats.cost_title'))}</small></div>
<div class="rep-kpi is-b"><span>${statsEsc(t('rep.credit_talk_kpi'))}</span><b>${statsEsc(statsHms(sec))}</b><small>${sec} ${statsEsc(t('rep.credit_sec'))}</small></div>
<div class="rep-kpi is-c"><span>${statsEsc(t('rep.credit_calls'))}</span><b>${calls}</b></div>
<div class="rep-kpi is-d"><span>${statsEsc(t('rep.credit_topq'))}</span><b>${statsEsc(top?.name || '—')}</b><small>${top ? statsEsc(statsHms(top.sec)) : ''}</small></div>
</div>`;
  const chartRows = queueList.slice(0, 12);
  const clipName = (name) => {
    const text = String(name || '—');
    return text.length > 28 ? `${text.slice(0, 26)}…` : text;
  };
  window._repCreditSpec = chartRows.length ? {
    labels: chartRows.map((row) => clipName(row.name)),
    full: chartRows.map((row) => row.name || '—'),
    data: chartRows.map((row) => row.sec),
  } : null;
  const chart = chartRows.length
    ? `<div class="rep-hour-canvas rep-credit-canvas"><canvas id="rep-credit-chart"></canvas></div>`
    : `<div class="firm-none">${statsEsc(t('stats.none'))}</div>`;
  const queueRows = queueList.map((row) => `<tr><td class="rep-clip" title="${statsEsc(row.name)}">${statsEsc(row.name)}</td><td>${row.calls}</td><td>${statsEsc(statsHms(row.sec))}</td><td>${row.sec}</td><td>${repCreditShare(row.sec / maxSec * 100)}${statsEsc(prefixList.length ? repMoney(row.money, row.cur) : '—')}</td></tr>`);
  if (queueList.length) {
    queueRows.push(`<tr class="rep-credit-total"><td>${statsEsc(t('rep.total'))}</td><td>${calls}</td><td>${statsEsc(statsHms(sec))}</td><td>${sec}</td><td>${statsEsc(prefixList.length ? repMoney(money, currency) : '—')}</td></tr>`);
  }
  const prefixRows = prefixList.map((row) => {
    const rate = `${repMoney(row.price, row.cur)}/dk`;
    return `<tr><td>${statsEsc(row.prefix)}</td><td>${statsEsc(row.name)}</td><td>${statsEsc(rate)}</td><td>${row.calls}</td><td>${statsEsc(statsHms(row.sec))}</td><td>${row.sec}</td><td>${statsEsc(repMoney(row.money, row.cur))}</td></tr>`;
  });
  const prefixBody = prefixRows.length
    ? repTable([t('stats.col.prefix'), t('stats.col.dest'), t('rep.credit_rate'), t('rep.credit_calls'), t('stats.col.time'), t('rep.credit_sec'), t('stats.col.cost')], prefixRows)
    : `<div class="firm-none">${statsEsc(t('stats.cost_empty'))}</div>`;
  let ledgerRows = [];
  const ledgerQ = range.fid ? `&firm_id=eq.${range.fid}` : '';
  const ledger = (await sb(`wallet_ledger?select=entry_type,amount,currency${ledgerQ}&created_at=gte.${range.gte}&created_at=lte.${range.lte}&order=created_at.desc&limit=200`).catch(() => [])) || [];
  const ledgerBag = {};
  ledger.forEach((row) => {
    const key = `${row.entry_type || 'adjustment'}|${row.currency || ''}`;
    if (!ledgerBag[key]) ledgerBag[key] = { key: row.entry_type || 'adjustment', amount: 0, currency: row.currency };
    ledgerBag[key].amount += Number(row.amount) || 0;
  });
  ledgerRows = Object.values(ledgerBag).map((line) => {
    const label = typeof firmLedgerLabel === 'function' ? firmLedgerLabel({ kind: 'ledger', entry_type: line.key }) : line.key;
    return `<tr><td>${statsEsc(label)}</td><td>${statsEsc(repMoney(line.amount, line.currency))}</td></tr>`;
  });
  return [
    kpis,
    repCard(t('rep.credit_by_queue'), `${chart}${repTable([t('rep.queue'), t('rep.credit_calls'), t('stats.col.time'), t('rep.credit_sec'), t('stats.col.cost')], queueRows)}`),
    repCard(t('stats.cost_title'), prefixBody, t('stats.cost_hint')),
    repCard(t('rep.credit_real'), repTable([t('stats.col.result'), t('stats.col.cost')], ledgerRows), t('rep.credit_real_hint')),
  ].join('');
}

function repMountGroupChart() {
  if (window._repGroupChart) {
    try { window._repGroupChart.destroy(); } catch (_) {}
    window._repGroupChart = null;
  }
  const spec = window._repGroupSpec;
  window._repGroupSpec = null;
  const canvas = document.getElementById('rep-group-chart');
  if (!spec || !canvas || typeof Chart === 'undefined') return;
  const text = typeof _dashCssVar === 'function' ? _dashCssVar('--text-2', '#64748b') : '#64748b';
  const grid = typeof _dashCssVar === 'function' ? _dashCssVar('--border', '#e2e8f0') : '#e2e8f0';
  const colors = spec.labels.map((_, i) => REP_BAR_COLORS[i % REP_BAR_COLORS.length]);
  window._repGroupChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: spec.labels,
      datasets: [{
        label: t('rep.calls_n'),
        data: spec.data,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          displayColors: false,
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              return `${ctx.parsed.x || 0} · ${statsHms(spec.talk?.[i] || 0)} · ${t('rep.sale_n')} ${spec.sale?.[i] || 0}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: t('rep.calls_n'), color: text, font: { size: 11 } },
          grid: { color: grid },
          ticks: { color: text, precision: 0 },
        },
        y: { grid: { display: false }, ticks: { color: text, font: { size: 12 } } },
      },
    },
  });
}

function repMountCreditChart() {
  if (window._repCreditChart) {
    try { window._repCreditChart.destroy(); } catch (_) {}
    window._repCreditChart = null;
  }
  const spec = window._repCreditSpec;
  window._repCreditSpec = null;
  const canvas = document.getElementById('rep-credit-chart');
  if (!spec || !canvas || typeof Chart === 'undefined') return;
  const text = typeof _dashCssVar === 'function' ? _dashCssVar('--text-2', '#64748b') : '#64748b';
  const grid = typeof _dashCssVar === 'function' ? _dashCssVar('--border', '#e2e8f0') : '#e2e8f0';
  const colors = spec.labels.map((_, i) => REP_BAR_COLORS[i % REP_BAR_COLORS.length]);
  window._repCreditChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: spec.labels,
      datasets: [{
        label: t('rep.credit_sec'),
        data: spec.data,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          displayColors: false,
          callbacks: {
            title(items) { return spec.full?.[items?.[0]?.dataIndex] || items?.[0]?.label || ''; },
            label(ctx) { return statsHms(ctx.parsed.x || 0); },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: t('rep.credit_sec'), color: text, font: { size: 11 } },
          grid: { color: grid },
          ticks: { color: text, precision: 0 },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: text,
            font: { size: 11 },
            callback(value) { return this.getLabelForValue(value); },
          },
        },
      },
    },
  });
}
