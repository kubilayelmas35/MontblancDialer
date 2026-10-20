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

function repHours(items) {
  const hours = Array.from({ length: 24 }, () => 0);
  items.forEach((iso) => {
    if (!iso) return;
    const h = statsBerlinHour(iso);
    if (h >= 0 && h <= 23) hours[h] += 1;
  });
  const max = Math.max(1, ...hours);
  const html = hours.map((n, i) => {
    if (!n) return '';
    const w = Math.round(n / max * 100);
    return `<div class="stats-hour"><span>${String(i).padStart(2, '0')}:00</span><span class="stats-hour-track"><span class="stats-hour-bar" style="width:${w}%"></span></span><span>${n}</span><span></span></div>`;
  }).join('');
  return `<div class="stats-hours">${html || `<div class="firm-none">${statsEsc(t('stats.none'))}</div>`}</div>`;
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
  if (range.agent) appts = appts.filter((a) => String(a.agent_id) === String(range.agent));
  return { logs, appts, capped: pulled.capped };
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
    const users = fresh.fid
      ? ((await sb(`users?select=id,name,role,firm_id&firm_id=eq.${fresh.fid}&order=name.asc&limit=400`).catch(() => [])) || [])
      : [];
    const sessions = fresh.fid
      ? ((await sb(`agent_sessions?select=agent_id,status,last_seen,break_code&firm_id=eq.${fresh.fid}&limit=400`).catch(() => [])) || [])
      : [];
    const userById = {};
    users.forEach((u) => { userById[u.id] = u; });
    const sessById = {};
    sessions.forEach((s) => { sessById[s.agent_id] = s; });
    host.innerHTML = repPaint(view, pack, fresh, userById, sessById);
    if (view === 'credit') host.innerHTML += await repCreditExtra(pack.logs, fresh);
  } catch (e) {
    host.innerHTML = `<div class="card"><div class="firm-none">${statsEsc(t('ui.error_prefix') + (e?.message || ''))}</div></div>`;
  }
}

function repPaint(view, pack, range, userById, sessById) {
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
  if (view === 'appt') return [
    repCard(t('rep.create'), repHours(appts.map((a) => a.kayit_tarihi))),
    repCard(t('rep.call'), repHours(logs.filter((l) => statsOutcomeKey(l.outcome) === 'appointment').map((l) => l.started_at))),
  ].join('');
  if (view === 'operator') return repOperator(logs, appts, userById, sessById);
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

function repOperator(logs, appts, userById, sessById) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const outcomes = repTable(
    [t('stats.col.result'), t('stats.col.count'), t('stats.col.time')],
    repByOutcome(logs).map((row) => `<tr><td>${statsEsc(repOutcomeLabel(row.key))}</td><td>${row.n}</td><td>${statsEsc(statsHms(row.sec))}</td></tr>`)
  );
  const durum = {};
  appts.forEach((a) => {
    const key = String(a.durum || '—');
    durum[key] = (durum[key] || 0) + 1;
  });
  const sales = repTable(
    [t('stats.col.result'), t('stats.col.count')],
    Object.keys(durum).sort((a, b) => durum[b] - durum[a]).map((key) => `<tr><td>${statsEsc(repDurumLabel(key))}</td><td>${durum[key]}</td></tr>`)
  );
  const absent = Object.values(userById).filter((u) => u.role === 'agent' || u.role === 'qc').filter((u) => {
    const seen = sessById[u.id]?.last_seen;
    const day = seen && typeof mbBerlinDay === 'function' ? mbBerlinDay(seen) : String(seen || '').slice(0, 10);
    return day !== today;
  });
  const absentRows = absent.map((u) => {
    const sess = sessById[u.id];
    return `<tr><td>${statsEsc(u.name || '')}</td><td>${statsEsc(repRole(u.role))}</td><td>${statsEsc(repStatusLabel(sess?.status))}</td><td>${statsEsc(repWhen(sess?.last_seen))}</td></tr>`;
  });
  const absentTable = absent.length
    ? repTable([t('rep.person'), t('stats.col.role'), t('rep.now'), t('rep.last')], absentRows)
    : `<div class="firm-none">${statsEsc(t('rep.absent_none'))}</div>`;
  return [
    `<div class="firm-none">${statsEsc(t('rep.pick'))}</div>`,
    repCard(t('stats.out_title'), outcomes),
    repCard(t('rep.sales'), sales),
    repCard(t('rep.absent'), absentTable),
  ].join('');
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
