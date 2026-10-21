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
    host.innerHTML = repPaint(view, pack, fresh, userById, sessById);
    if (view === 'credit') host.innerHTML += await repCreditExtra(pack.logs, fresh);
    repMountHourCharts();
  } catch (e) {
    host.innerHTML = `<div class="card"><div class="firm-none">${statsEsc(t('ui.error_prefix') + (e?.message || ''))}</div></div>`;
  }
}

function repPaint(view, pack, range, userById, sessById) {
  window._repHourPending = [];
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
  if (view === 'perf' || view === 'group' || view === 'rank') return repPeople(view, logs, appts, userById);
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
  if (view === 'group') {
    const groups = {};
    list.forEach((row) => {
      const key = row.role || '—';
      if (!groups[key]) groups[key] = { role: key, calls: 0, answered: 0, sec: 0, appt: 0, ok: 0 };
      groups[key].calls += row.calls;
      groups[key].answered += row.answered;
      groups[key].sec += row.sec;
      groups[key].appt += row.appt;
      groups[key].ok += row.ok;
    });
    const rows = Object.values(groups).sort((a, b) => b.calls - a.calls).map((g) => `<tr><td>${statsEsc(repRole(g.role))}</td><td>${g.calls}</td><td>${g.answered}</td><td>${statsEsc(statsHms(g.sec))}</td><td>${g.appt}</td><td>${g.ok}</td></tr>`);
    return repCard(t('stats.role_title'), repTable([t('stats.col.role'), t('stats.col.count'), t('rep.answered'), t('rep.talk'), t('stats.appt_short'), t('rep.ok')], rows), t('rep.gap'));
  }
  if (view === 'rank') {
    const rows = list.slice().sort((a, b) => (b.ok - a.ok) || (b.appt - a.appt) || a.name.localeCompare(b.name, 'tr')).map((row, i) => `<tr><td>${i + 1}</td><td>${statsEsc(row.name)}</td><td>${statsEsc(repRole(row.role))}</td><td>${row.ok}</td><td>${row.appt}</td></tr>`);
    return repCard(t('rep.rank'), repTable([t('rep.rank'), t('rep.person'), t('stats.col.role'), t('rep.ok'), t('stats.appt_short')], rows));
  }
  const rows = list.slice().sort((a, b) => b.calls - a.calls).map((row) => `<tr><td>${statsEsc(row.name)}</td><td>${statsEsc(repRole(row.role))}</td><td>${row.calls}</td><td>${row.answered}</td><td>${statsEsc(statsHms(row.sec))}</td><td>${row.appt}</td><td>${row.ok}</td></tr>`);
  return repCard(t('rep.talk'), repTable([t('rep.person'), t('stats.col.role'), t('stats.col.count'), t('rep.answered'), t('rep.talk'), t('stats.appt_short'), t('rep.ok')], rows), t('rep.gap'));
}

async function repCreditExtra(logs, range) {
  let costRows = `<tr><td colspan="4">${statsEsc(t('stats.cost_empty'))}</td></tr>`;
  if (range.fid) {
    const firms = await sb(`firms?id=eq.${range.fid}&select=settings,currency`).catch(() => []);
    const firm = firms?.[0] || {};
    const rates = firm.settings?.billing?.rates;
    const cur = typeof normalizeCurrency === 'function' ? normalizeCurrency(firm.currency) : (firm.currency || 'EUR');
    if (Array.isArray(rates) && rates.length) {
      const bag = {};
      logs.forEach((l) => {
        const rate = statsMatchRate(l.phone, rates);
        if (!rate) return;
        const id = `${rate.prefix}|${rate.name || ''}`;
        if (!bag[id]) bag[id] = { name: rate.name || rate.prefix, prefix: rate.prefix, price: Number(rate.price) || 0, sec: 0 };
        bag[id].sec += Number(l.duration_sec) || 0;
      });
      const lines = Object.values(bag);
      if (lines.length) {
        costRows = lines.map((line) => {
          const money = (line.sec / 60) * line.price;
          const shown = typeof formatMoney === 'function' ? formatMoney(money, cur) : money.toFixed(2);
          return `<tr><td>${statsEsc(line.prefix)}</td><td>${statsEsc(line.name)}</td><td>${statsEsc(statsHms(line.sec))}</td><td>${statsEsc(shown)}</td></tr>`;
        }).join('');
      }
    }
  }
  let ledgerRows = `<tr><td colspan="2">${statsEsc(t('stats.none'))}</td></tr>`;
  if (range.fid) {
    const ledger = await sb(`wallet_ledger?firm_id=eq.${range.fid}&created_at=gte.${range.gte}&created_at=lte.${range.lte}&select=entry_type,amount,currency&order=created_at.desc&limit=200`).catch(() => []);
    const bag = {};
    (ledger || []).forEach((row) => {
      const key = row.entry_type || 'adjustment';
      if (!bag[key]) bag[key] = { key, amount: 0, currency: row.currency };
      bag[key].amount += Number(row.amount) || 0;
    });
    const lines = Object.values(bag);
    if (lines.length) {
      ledgerRows = lines.map((line) => {
        const label = typeof firmLedgerLabel === 'function' ? firmLedgerLabel({ kind: 'ledger', entry_type: line.key }) : line.key;
        const shown = typeof formatMoney === 'function' ? formatMoney(line.amount, line.currency) : String(line.amount);
        return `<tr><td>${statsEsc(label)}</td><td>${statsEsc(shown)}</td></tr>`;
      }).join('');
    }
  }
  return [
    repCard(t('stats.cost_title'), repTable([t('stats.col.prefix'), t('stats.col.dest'), t('stats.col.time'), t('stats.col.cost')], [costRows]), t('stats.cost_hint')),
    repCard(t('rep.credit_real'), repTable([t('stats.col.result'), t('stats.col.cost')], [ledgerRows]), t('rep.credit_real_hint')),
  ].join('');
}
