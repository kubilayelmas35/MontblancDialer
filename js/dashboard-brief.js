// Özetin rol bazlı üst blokları: hedef, kampanya, sıra, sonuç, sıradaki iş.
function mbDashRole() {
  const role = currentUser?.role || '';
  if (role === 'super_admin') return 'super';
  if (role === 'admin' || role === 'firm_admin') return 'firm';
  if (role === 'qc') return 'qc';
  if (role === 'field_agent') return 'field';
  return 'agent';
}

function mbDashTr(tr, de) {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? de : tr;
}

function mbDashEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mbDashCard(title, body) {
  return `<div class="card" style="padding:14px 16px;margin:0;"><div class="card-title" style="margin-bottom:10px;">${title}</div>${body}</div>`;
}

async function mbDashCount(path) {
  try {
    const headers = typeof mbAuthHeaders === 'function' ? mbAuthHeaders({ Prefer: 'count=exact', Range: '0-0' }) : {};
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
    if (!res.ok) return null;
    try { await res.text(); } catch (e) {}
    const n = Number((res.headers.get('content-range') || '').split('/')[1]);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
}

function mbDashOutcomeKey(log) {
  if (log?.amd_result === 'machine' || log?.outcome === 'voicemail') return 'machine';
  if (log?.outcome === 'appointment' || log?.outcome === 'appointment_done') return 'appointment';
  if (log?.outcome === 'callback' || log?.outcome === 'callback_requested') return 'callback';
  if (log?.outcome === 'negative') return 'negative';
  if (log?.outcome === 'no_answer') return 'no_answer';
  return 'other';
}

function mbDashGoalNums() {
  const daily = parseInt(localStorage.getItem('mb_daily_goal') || '5', 10) || 5;
  const weekly = parseInt(localStorage.getItem('mb_weekly_goal') || '25', 10) || 25;
  const monthly = parseInt(localStorage.getItem('mb_monthly_goal') || '100', 10) || 100;
  return { daily, weekly, monthly };
}

function mbDashPrevBounds(from, to) {
  if (typeof mbShiftDate !== 'function') return null;
  const days = typeof _eachDayInRange === 'function' ? _eachDayInRange(from, to).length : 0;
  if (!days || days > 120) return null;
  const prevTo = mbShiftDate(from, -1);
  const prevFrom = mbShiftDate(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

function mbDashPaintDelta(id, now, prev, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prev == null) {
    el.textContent = '';
    el.className = 'stat-delta';
    return;
  }
  const diff = Math.round(now - prev);
  el.className = 'stat-delta ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat');
  const sign = diff > 0 ? '+' : '';
  el.textContent = `${sign}${diff}${unit || ''} ${mbDashTr('önceki döneme göre', 'zur Vorperiode')}`;
}

function mbDashScopeLine(role) {
  if (role === 'super') {
    const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
    if (!fid) return mbDashTr('Tüm firmalar', 'Alle Firmen');
    const firm = (typeof _allFirms !== 'undefined' ? _allFirms : []).find((f) => f.id === fid);
    return firm?.name || mbDashTr('Seçili firma', 'Gewählte Firma');
  }
  if (role === 'firm') return mbDashTr('Kendi firman', 'Eigene Firma');
  if (role === 'qc') return mbDashTr('Firmanın QC kuyruğu', 'QC-Warteschlange der Firma');
  if (role === 'field') return mbDashTr('Sana atanan saha görevleri', 'Dir zugewiesene Außentermine');
  return mbDashTr('Kendi aramaların', 'Eigene Anrufe');
}

function mbDashGoalHtml(label, value, target) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return `<div class="dash-goal-line"><span>${label}</span><span>${value} / ${target}</span></div><div class="dash-goal"><span style="width:${pct}%"></span></div>`;
}

function mbDashOutcomeHtml(logs) {
  const keys = [
    ['appointment', mbDashTr('Randevu', 'Termin')],
    ['negative', mbDashTr('Olumsuz', 'Negativ')],
    ['no_answer', mbDashTr('Cevap yok', 'Keine Antwort')],
    ['callback', mbDashTr('Geri ara', 'Rückruf')],
    ['machine', mbDashTr('Telesekreter', 'Mailbox')],
  ];
  const counts = {};
  (logs || []).forEach((log) => {
    const key = mbDashOutcomeKey(log);
    counts[key] = (counts[key] || 0) + 1;
  });
  const max = Math.max(1, ...keys.map((pair) => counts[pair[0]] || 0));
  return keys.map(([key, label]) => {
    const n = counts[key] || 0;
    const width = Math.round((n / max) * 100);
    return `<div class="dash-mini-row"><span>${label}</span><span class="dash-bar"><span style="width:${width}%"></span></span><b>${n}</b></div>`;
  }).join('');
}

function mbDashWhen(value) {
  const raw = String(value || '');
  if (!raw) return '—';
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) return raw.replace('T', ' ').slice(0, 16);
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(raw, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return raw.replace('T', ' ').slice(0, 16);
}

async function mbDashGoalsBlock(ff, agentQ, role) {
  const goals = mbDashGoalNums();
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const weekFrom = typeof mbShiftDate === 'function' ? mbShiftDate(today, -6) : today;
  const monthFrom = `${today.slice(0, 8)}01`;
  let people = 1;
  if (role === 'super' || role === 'firm') {
    const n = await mbDashCount(`users?select=id&role=eq.agent&is_active=eq.true${ff}`);
    people = Math.max(1, n || 1);
  }
  const countAppt = async (from, to) => {
    const gte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
    const lte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
    const n = await mbDashCount(`call_logs?select=id&outcome=in.(appointment,appointment_done)&started_at=gte.${gte}&started_at=lte.${lte}${ff}${agentQ}`);
    return n || 0;
  };
  const [dayN, weekN, monthN] = await Promise.all([
    countAppt(today, today),
    countAppt(weekFrom, today),
    countAppt(monthFrom, today),
  ]);
  const who = people > 1 ? ` · ${people} ${mbDashTr('temsilci', 'Agenten')}` : '';
  return mbDashCard(
    mbDashTr('Randevu hedefi', 'Terminziel') + who,
    mbDashGoalHtml(mbDashTr('Bugün', 'Heute'), dayN, goals.daily * people)
    + mbDashGoalHtml(mbDashTr('Bu hafta', 'Diese Woche'), weekN, goals.weekly * people)
    + mbDashGoalHtml(mbDashTr('Bu ay', 'Dieser Monat'), monthN, goals.monthly * people)
  );
}

async function mbDashCampaignBlock(logs, ff) {
  const camps = await sb(`campaigns?select=id,name,dial_speed,firm_id&status=eq.active${ff}&order=name.asc&limit=8`).catch(() => []) || [];
  if (!camps.length) {
    return mbDashCard(mbDashTr('Açık kampanyalar', 'Offene Kampagnen'), `<div class="dash-mini-row">${mbDashTr('Açık kampanya yok', 'Keine offene Kampagne')}</div>`);
  }
  const left = await Promise.all(camps.map((camp) => mbDashCount(
    `contacts?select=id&campaign_id=eq.${camp.id}&status=in.(pending,no_answer,callback)`
  )));
  const byCamp = {};
  (logs || []).forEach((log) => {
    const id = log.campaign_id;
    if (!id) return;
    if (!byCamp[id]) byCamp[id] = { total: 0, hit: 0 };
    byCamp[id].total += 1;
    const key = mbDashOutcomeKey(log);
    if (key !== 'no_answer' && key !== 'machine') byCamp[id].hit += 1;
  });
  const rows = camps.map((camp, i) => {
    const stat = byCamp[camp.id] || { total: 0, hit: 0 };
    const rate = stat.total ? Math.round((stat.hit / stat.total) * 100) : 0;
    const remain = left[i] == null ? '—' : left[i];
    return `<div class="dash-mini-row"><span>${mbDashEsc(camp.name || '—')}</span><b>${mbDashTr('kalan', 'offen')} ${remain} · ${mbDashTr('hız', 'Tempo')} ${camp.dial_speed || 1} · %${rate}</b></div>`;
  }).join('');
  return mbDashCard(mbDashTr('Açık kampanyalar', 'Offene Kampagnen'), rows);
}

async function mbDashRankBlock(logs, ff) {
  const users = await sb(`users?select=id,name,role&is_active=eq.true${ff}&limit=300`).catch(() => []) || [];
  const names = {};
  users.forEach((user) => { names[user.id] = user.name || user.id; });
  const bag = {};
  (logs || []).forEach((log) => {
    const id = log.agent_id;
    if (!id) return;
    if (!bag[id]) bag[id] = { calls: 0, appt: 0, talk: 0 };
    bag[id].calls += 1;
    if (log.outcome === 'appointment' || log.outcome === 'appointment_done') bag[id].appt += 1;
    bag[id].talk += Number(log.duration_sec) || 0;
  });
  const rows = Object.keys(bag).map((id) => ({ id, ...bag[id] }))
    .sort((a, b) => b.appt - a.appt || b.calls - a.calls)
    .slice(0, 8);
  if (!rows.length) {
    return mbDashCard(mbDashTr('Temsilci sırası', 'Agentenliste'), `<div class="dash-mini-row">${mbDashTr('Bu aralıkta arama yok', 'Keine Anrufe in diesem Zeitraum')}</div>`);
  }
  const body = rows.map((row) => {
    const rate = row.calls ? Math.round((row.appt / row.calls) * 100) : 0;
    const min = Math.floor(row.talk / 60);
    return `<div class="dash-mini-row"><span>${mbDashEsc(names[row.id] || row.id.slice(0, 8))}</span><b>${row.calls} ${mbDashTr('arama', 'Anrufe')} · ${row.appt} ${mbDashTr('randevu', 'Termine')} · ${min}dk · %${rate}</b></div>`;
  }).join('');
  return mbDashCard(mbDashTr('Temsilci sırası', 'Agentenliste'), body);
}

async function mbDashNextBlock(ff, agentQ) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const [callbacks, appts] = await Promise.all([
    sb(`wiedervorlage?select=id,nachname,telefon,termin_zaman&durum=eq.bekliyor&order=termin_zaman.asc&limit=5${ff}${agentQ}`).catch(() => []),
    sb(`appointments?select=id,nachname,telefonnummer,termin_tarih&termin_tarih=gte.${today}T00:00:00&order=termin_tarih.asc&limit=5${ff}${agentQ}`).catch(() => []),
  ]);
  const cbRows = (callbacks || []).map((row) => `<div class="dash-mini-row"><span>${mbDashEsc(row.nachname || row.telefon || '—')}</span><b>${mbDashWhen(row.termin_zaman)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Bekleyen geri arama yok', 'Keine Rückrufe')}</div>`;
  const apRows = (appts || []).map((row) => `<div class="dash-mini-row"><span>${mbDashEsc(row.nachname || row.telefonnummer || '—')}</span><b>${mbDashWhen(row.termin_tarih)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Yaklaşan randevu yok', 'Keine anstehenden Termine')}</div>`;
  return mbDashCard(mbDashTr('Sıradaki geri aramalar', 'Nächste Rückrufe'), cbRows)
    + mbDashCard(mbDashTr('Sıradaki randevular', 'Nächste Termine'), apRows);
}

async function mbDashPaceBlock(ff) {
  const since = new Date(Date.now() - 90000).toISOString();
  const [readyRows, camps, ringing] = await Promise.all([
    sb(`agent_sessions?select=agent_id,firm_id&status=eq.ready&last_seen=gte.${encodeURIComponent(since)}${ff}&limit=300`).catch(() => []),
    sb(`campaigns?select=id,dial_speed,firm_id&status=eq.active${ff}&limit=40`).catch(() => []),
    mbDashCount(`contacts?select=id&status=eq.calling&last_called_at=gte.${encodeURIComponent(since)}${ff}`),
  ]);
  const readyByFirm = {};
  (readyRows || []).forEach((row) => {
    const key = row.firm_id || '_';
    readyByFirm[key] = (readyByFirm[key] || 0) + 1;
  });
  const campsByFirm = {};
  (camps || []).forEach((camp) => {
    const key = camp.firm_id || '_';
    if (!campsByFirm[key]) campsByFirm[key] = [];
    campsByFirm[key].push(camp);
  });
  let target = 0;
  Object.keys(campsByFirm).forEach((key) => {
    const list = campsByFirm[key];
    const ready = readyByFirm[key] || 0;
    const speed = typeof mbSharedDialSpeed === 'function'
      ? list.reduce((sum, camp) => sum + mbSharedDialSpeed(camp.dial_speed, list.length), 0)
      : list.length;
    target += ready * speed;
  });
  const ready = (readyRows || []).length;
  const open = (camps || []).length;
  const ringText = ringing == null ? '—' : ringing;
  return mbDashCard(
    mbDashTr('Hat durumu', 'Leitung'),
    `<div class="dash-pace">
      <span>${mbDashTr('Hazır', 'Bereit')} ${ready}</span>
      <span>${mbDashTr('Açık kampanya', 'Offene Kampagnen')} ${open}</span>
      <span>${mbDashTr('Hedef hat', 'Zielleitungen')} ${target}</span>
      <span>${mbDashTr('Çalıyor', 'Klingelt')} ${ringText}</span>
    </div>`
  );
}

async function mbDashQcBlock(ff) {
  const [pending, rows] = await Promise.all([
    mbDashCount(`call_logs?select=id&outcome=eq.appointment${ff}`),
    sb(`call_logs?select=id,phone,started_at&outcome=eq.appointment&order=started_at.desc&limit=5${ff}`).catch(() => []),
  ]);
  const list = (rows || []).map((row) => `<div class="dash-mini-row"><span>${mbDashEsc(row.phone || '—')}</span><b>${mbDashWhen(row.started_at)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Bekleyen QC yok', 'Keine offene QC')}</div>`;
  return mbDashCard(
    `${mbDashTr('Bekleyen QC', 'Offene QC')} · ${pending == null ? '—' : pending}`,
    list
  );
}

async function mbDashFieldBlock(rangeKey, from, to) {
  const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : currentUser?.firm_id;
  let tasks = [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({ p_actor_user_id: currentUser.id, p_firm_id: fid || null }),
    });
    if (res.ok) tasks = (await res.json().catch(() => [])) || [];
  } catch (e) {}
  const count = (status) => tasks.filter((task) => task.status === status).length;
  const doneInRange = tasks.filter((task) => {
    if (task.status !== 'completed' || !task.completed_at) return false;
    const day = typeof mbBerlinDay === 'function' ? mbBerlinDay(task.completed_at) : String(task.completed_at).slice(0, 10);
    return day >= from && day <= to;
  }).length;
  const open = tasks.filter((task) => task.status === 'assigned' || task.status === 'in_progress').slice(0, 5);
  const ids = open.map((task) => task.appointment_id).filter(Boolean);
  const appts = ids.length
    ? await sb(`appointments?id=in.(${ids.join(',')})&select=id,nachname,ortschaft`).catch(() => [])
    : [];
  const names = {};
  (appts || []).forEach((row) => { names[row.id] = [row.nachname, row.ortschaft].filter(Boolean).join(' · '); });
  const list = open.map((task) => `<div class="dash-mini-row"><span>${mbDashEsc(names[task.appointment_id] || mbDashTr('Görev', 'Auftrag'))}</span><b>${task.status === 'in_progress' ? mbDashTr('Sahada', 'Vor Ort') : mbDashTr('Atandı', 'Zugewiesen')}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Açık saha görevi yok', 'Keine offenen Außentermine')}</div>`;
  const summary = `<div class="dash-pace" style="margin-bottom:10px;">
    <span>${mbDashTr('Atandı', 'Zugewiesen')} ${count('assigned')}</span>
    <span>${mbDashTr('Sahada', 'Vor Ort')} ${count('in_progress')}</span>
    <span>${mbDashTr('Bu aralıkta bitti', 'Im Zeitraum erledigt')} ${doneInRange}</span>
  </div>`;
  return mbDashCard(mbDashTr('Saha görevlerin', 'Deine Außentermine'), summary + list + (rangeKey ? '' : ''));
}

async function mbDashDeltas(logs, ff, agentQ, rangeKey, from, to) {
  const prev = rangeKey === 'all' ? null : mbDashPrevBounds(from, to);
  if (!prev) {
    ['d-calls-delta', 'd-appt-delta', 'd-cb-delta', 'd-vm-delta', 'd-talk-delta'].forEach((id) => mbDashPaintDelta(id, 0, null));
    return;
  }
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(prev.from) : `${prev.from}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(prev.to) : `${prev.to}T23:59:59`;
  let prevLogs = await sb(`call_logs?select=outcome,amd_result,duration_sec&started_at=gte.${gte}&started_at=lte.${lte}${ff}${agentQ}&limit=8000`).catch(() => []) || [];
  if (mbDashRole() === 'qc') {
    prevLogs = prevLogs.filter((log) => log.outcome === 'appointment' || log.outcome === 'appointment_done');
  }
  const sum = (list) => ({
    calls: list.length,
    appt: list.filter((log) => log.outcome === 'appointment' || log.outcome === 'appointment_done').length,
    cb: list.filter((log) => log.outcome === 'callback' || log.outcome === 'callback_requested').length,
    vm: list.filter((log) => log.amd_result === 'machine' || log.outcome === 'voicemail').length,
    talk: Math.floor(list.reduce((total, log) => total + (Number(log.duration_sec) || 0), 0) / 60),
  });
  const now = sum(logs || []);
  const before = sum(prevLogs);
  mbDashPaintDelta('d-calls-delta', now.calls, before.calls);
  mbDashPaintDelta('d-appt-delta', now.appt, before.appt);
  mbDashPaintDelta('d-cb-delta', now.cb, before.cb);
  mbDashPaintDelta('d-vm-delta', now.vm, before.vm);
  mbDashPaintDelta('d-talk-delta', now.talk, before.talk, mbDashTr(' dk', ' Min'));
}

async function loadDashBrief(ctx) {
  const host = document.getElementById('dash-brief');
  if (!host || !currentUser) return;
  const role = mbDashRole();
  const logs = ctx?.logs || [];
  const ff = ctx?.ff || '';
  const agentQ = ctx?.agentQ || '';
  const rangeKey = ctx?.rangeKey || 'today';
  const from = ctx?.from;
  const to = ctx?.to;
  if (role === 'qc') {
    const calls = document.getElementById('stat-lbl-calls');
    if (calls) calls.textContent = mbDashTr('QC kayıtları', 'QC-Einträge');
    const apptLbl = document.getElementById('d-appt')?.closest('.stat-card')?.querySelector('.stat-lbl');
    if (apptLbl) apptLbl.textContent = mbDashTr('Kapanan QC', 'Abgeschlossene QC');
  }
  host.innerHTML = `<div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div><div class="mb-empty-hint">${mbDashTr('Yükleniyor...', 'Laden...')}</div>`;
  const parts = [];
  if (role === 'field') {
    parts.push(await mbDashFieldBlock(rangeKey, from, to));
    host.innerHTML = `<div class="dash-brief"><div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div><div class="dash-brief-grid">${parts.join('')}</div></div>`;
    ['d-calls-delta', 'd-appt-delta', 'd-cb-delta', 'd-vm-delta', 'd-talk-delta'].forEach((id) => mbDashPaintDelta(id, 0, null));
    return;
  }
  if (role === 'super' || role === 'firm' || role === 'agent') {
    parts.push(await mbDashGoalsBlock(ff, agentQ, role));
  }
  if (role === 'super' || role === 'firm') {
    parts.push(await mbDashPaceBlock(ff));
    parts.push(await mbDashCampaignBlock(logs, ff));
    parts.push(await mbDashRankBlock(logs, ff));
  }
  if (role === 'qc') parts.push(await mbDashQcBlock(ff));
  parts.push(mbDashCard(role === 'qc' ? mbDashTr('QC sonuçları', 'QC-Ergebnisse') : mbDashTr('Arama sonuçları', 'Anrufergebnisse'), mbDashOutcomeHtml(logs)));
  if (role !== 'qc') parts.push(await mbDashNextBlock(ff, agentQ));
  host.innerHTML = `<div class="dash-brief"><div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div><div class="dash-brief-grid">${parts.join('')}</div></div>`;
  await mbDashDeltas(logs, ff, agentQ, rangeKey, from, to);
}
