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

function mbDashCard(title, body, extra, bodyId, key) {
  const id = bodyId ? ` id="${bodyId}"` : '';
  const safeKey = /^[a-z0-9-]{1,24}$/.test(String(key || '')) ? String(key) : '';
  const wide = !!(extra && String(extra).includes('dash-span'));
  const attr = `${safeKey ? ` data-dash-card="${safeKey}"` : ''}${wide ? ' data-dash-wide="1"' : ''}`;
  const handle = safeKey
    ? `<button type="button" class="dash-card-handle" draggable="true" title="${mbDashEsc(mbDashTr('Kutuyu taşı', 'Karte verschieben'))}" aria-label="${mbDashEsc(mbDashTr('Kutuyu taşı', 'Karte verschieben'))}"><i class="ph ph-dots-six-vertical" aria-hidden="true"></i></button>`
    : '';
  return `<div class="card dash-brief-card${extra ? ` ${extra}` : ''}"${attr}><div class="card-title">${handle}<span>${title}</span></div><div class="dash-brief-body"${id}>${body}</div></div>`;
}

function mbDashClip(value, max) {
  const text = String(value || '—');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  if (role === 'qc') return mbDashTr('Firmanın Kalite Kontrol kuyruğu', 'QC-Warteschlange der Firma');
  if (role === 'field') return mbDashTr('Sana atanan saha görevleri', 'Dir zugewiesene Außentermine');
  return mbDashTr('Kendi aramaların', 'Eigene Anrufe');
}

function mbDashRing(label, value, target, color) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return `<div class="dash-ring" style="--p:${pct};--c:${color}"><div class="dash-ring-face"><span><b>${pct}%</b><small>${value} / ${target}</small></span></div><em>${label}</em></div>`;
}

function mbDashOutcomeHtml(logs) {
  const keys = [
    ['appointment', mbDashTr('Randevu', 'Termin'), '#34d399'],
    ['negative', mbDashTr('Olumsuz', 'Negativ'), '#f87171'],
    ['no_answer', mbDashTr('Cevap yok', 'Keine Antwort'), '#94a3b8'],
    ['callback', mbDashTr('Geri ara', 'Rückruf'), '#38bdf8'],
    ['machine', mbDashTr('Telesekreter', 'Mailbox'), '#fbbf24'],
  ];
  const counts = {};
  (logs || []).forEach((log) => {
    const key = mbDashOutcomeKey(log);
    counts[key] = (counts[key] || 0) + 1;
  });
  const parts = keys.map(([key, label, color]) => ({ label, color, n: counts[key] || 0 }));
  const total = parts.reduce((sum, part) => sum + part.n, 0);
  let cursor = 0;
  const stops = total
    ? parts.filter((part) => part.n).map((part) => {
      const start = cursor;
      cursor += (part.n / total) * 100;
      return `${part.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(',')
    : '#e2e8f0 0% 100%';
  const legend = parts.map((part) => `<li><i style="background:${part.color}"></i><span>${part.label}</span><b>${part.n}</b></li>`).join('');
  return `<div class="dash-donut-wrap"><div class="dash-donut" style="background:conic-gradient(${stops})"><span>${total}</span></div><ul class="dash-legend">${legend}</ul></div>`;
}

function mbDashWhen(value) {
  if (!value) return '—';
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(value, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return '—';
}

async function mbDashGoalsData(ff, agentQ, role) {
  const goals = mbDashGoalNums();
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const weekFrom = typeof mbShiftDate === 'function' ? mbShiftDate(today, -6) : today;
  const monthFrom = `${today.slice(0, 8)}01`;
  const countAppt = (from, to) => {
    const gte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
    const lte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
    return mbDashCount(`call_logs?select=id&outcome=in.(appointment,appointment_done)&started_at=gte.${gte}&started_at=lte.${lte}${ff}${agentQ}`);
  };
  const [peopleN, dayN, weekN, monthN] = await Promise.all([
    (role === 'super' || role === 'firm') ? mbDashCount(`users?select=id&role=eq.agent&is_active=eq.true${ff}`) : Promise.resolve(1),
    countAppt(today, today),
    countAppt(weekFrom, today),
    countAppt(monthFrom, today),
  ]);
  return { goals, people: Math.max(1, peopleN || 1), dayN: dayN || 0, weekN: weekN || 0, monthN: monthN || 0 };
}

function mbDashGoalsHtml(data) {
  const people = data?.people || 1;
  const goals = data?.goals || mbDashGoalNums();
  const who = people > 1 ? ` · ${people} ${mbDashTr('temsilci', 'Agenten')}` : '';
  return mbDashCard(
    mbDashTr('Randevu hedefi', 'Terminziel') + who,
    `<div class="dash-rings">${[
      mbDashRing(mbDashTr('Bugün', 'Heute'), data?.dayN || 0, goals.daily * people, '#38bdf8'),
      mbDashRing(mbDashTr('Bu hafta', 'Diese Woche'), data?.weekN || 0, goals.weekly * people, '#fb923c'),
      mbDashRing(mbDashTr('Bu ay', 'Dieser Monat'), data?.monthN || 0, goals.monthly * people, '#34d399'),
    ].join('')}</div>`,
    '',
    '',
    'goals'
  );
}

function mbDashOpenCamp(id) {
  window._mbOpenCampId = id;
  if (typeof navigate === 'function') navigate('campaigns');
}

function mbDashOpenAgent(id) {
  window._mbPerfAgent = id;
  if (typeof navigate === 'function') navigate('performance');
}

function mbDashOpenPage(page) {
  if (typeof navigate === 'function') navigate(page);
}

async function mbDashRemainMap(ids) {
  const map = {};
  if (!ids.length) return { map, ok: true };
  const grouped = await sb(`contacts?select=campaign_id,id.count()&status=in.(pending,no_answer,callback)&campaign_id=in.(${ids.join(',')})`).catch(() => null);
  const usable = Array.isArray(grouped) && (grouped.length === 0 || grouped.every((row) => row && (row.count != null || row.id_count != null)));
  if (usable) {
    grouped.forEach((row) => { map[row.campaign_id] = Number(row.count ?? row.id_count) || 0; });
    ids.forEach((id) => { if (map[id] == null) map[id] = 0; });
    return { map, ok: true };
  }
  const slice = ids.slice(0, 8);
  const counts = await Promise.all(slice.map((id) => mbDashCount(
    `contacts?select=id&campaign_id=eq.${id}&status=in.(pending,no_answer,callback)`
  )));
  slice.forEach((id, i) => { map[id] = counts[i]; });
  return { map, ok: false };
}

async function mbDashOps(ff) {
  const since = new Date(Date.now() - 90000).toISOString();
  const [camps, readyRows, ringing, firms] = await Promise.all([
    sb(`campaigns?select=id,name,dial_speed,firm_id&status=eq.active${ff}&order=name.asc&limit=40`).catch(() => []),
    sb(`agent_sessions?select=agent_id,firm_id&status=eq.ready${ff}&limit=300`).catch(() => []),
    mbDashCount(`contacts?select=id&status=eq.calling&last_called_at=gte.${encodeURIComponent(since)}${ff}`),
    sb(`firms?select=id,name&limit=100`).catch(() => []),
  ]);
  const list = camps || [];
  const readyByFirm = {};
  (readyRows || []).forEach((row) => {
    const key = row.firm_id || '_';
    readyByFirm[key] = (readyByFirm[key] || 0) + 1;
  });
  const campsByFirm = {};
  list.forEach((camp) => {
    const key = camp.firm_id || '_';
    if (!campsByFirm[key]) campsByFirm[key] = [];
    campsByFirm[key].push(camp);
  });
  let target = 0;
  Object.keys(campsByFirm).forEach((key) => {
    const group = campsByFirm[key];
    const ready = readyByFirm[key] || 0;
    const speed = typeof mbSharedDialSpeed === 'function'
      ? group.reduce((sum, camp) => sum + mbSharedDialSpeed(camp.dial_speed, group.length), 0)
      : group.length;
    target += ready * speed;
  });
  const ids = list.map((camp) => camp.id).filter(Boolean);
  const shown = list.slice(0, 8);
  const firmName = {};
  (firms || []).forEach((firm) => { firmName[firm.id] = firm.name || ''; });
  return {
    camps: shown.map((camp) => ({ ...camp, left: null })),
    ids,
    ready: (readyRows || []).length,
    open: list.length,
    target,
    ringing: ringing == null ? 0 : ringing,
    pool: null,
    firmName,
    ff,
  };
}

async function mbDashOpsSlow(ops) {
  if (!ops?.ids?.length) return ops;
  const remain = await mbDashRemainMap(ops.ids);
  ops.camps.forEach((camp) => { camp.left = remain.map[camp.id] == null ? null : remain.map[camp.id]; });
  ops.pool = remain.ok
    ? ops.ids.reduce((sum, id) => sum + (remain.map[id] || 0), 0)
    : ((await mbDashCount(`contacts?select=id&status=in.(pending,no_answer,callback)&campaign_id=in.(${ops.ids.join(',')})`)) || 0);
  return ops;
}

function mbDashFillRemain(ops) {
  const camps = ops?.camps || [];
  const maxLeft = Math.max(1, ...camps.map((camp) => Number(camp.left) || 0));
  document.querySelectorAll('#dash-camp-body .dash-camp').forEach((row, index) => {
    const camp = camps[index];
    if (!camp) return;
    const num = row.querySelector('b');
    if (num) num.textContent = camp.left == null ? '—' : String(camp.left);
    const bar = row.querySelector('.dash-meter i');
    if (bar) bar.style.width = `${camp.left == null ? 0 : Math.round((Number(camp.left) || 0) / maxLeft * 100)}%`;
  });
}

function mbDashPaintPills(ops) {
  const host = document.getElementById('dash-live-pace');
  if (!host) return;
  const pill = (cls, label, value) => `<span class="dash-live-pill dash-live-pill--${cls}">${label}: <b>${value}</b></span>`;
  host.innerHTML = [
    pill('open', mbDashTr('Açık kampanya', 'Offene Kampagne'), ops.open),
    pill('ring', mbDashTr('Çalıyor', 'Klingelt'), ops.ringing),
    pill('target', mbDashTr('Hedef hat', 'Zielleitung'), ops.target),
    pill('wait', mbDashTr('Sıra bekliyor', 'Wartet'), ops.ready),
    pill('pool', mbDashTr('Havuzda bekleyen', 'Im Pool'), ops.pool),
  ].join('');
}

function mbDashAlertHtml(ops, goals, todayAppts) {
  const items = [];
  const empty = ops.camps.filter((camp) => camp.left === 0);
  empty.slice(0, 2).forEach((camp) => {
    const firm = ops.firmName[camp.firm_id] ? ` · ${ops.firmName[camp.firm_id]}` : '';
    items.push(`<button type="button" class="dash-alert" title="${mbDashEsc(camp.name || '')}" onclick="mbDashOpenCamp('${camp.id}')">${mbDashEsc(mbDashClip(camp.name, 42))}${mbDashEsc(firm)}: ${mbDashTr('aranacak kalmadı', 'keine Kontakte mehr')}</button>`);
  });
  if (empty.length > 2) {
    items.push(`<button type="button" class="dash-alert" onclick="mbDashOpenPage('campaigns')">${empty.length} ${mbDashTr('kampanyada aranacak kalmadı', 'Kampagnen ohne Kontakte')}</button>`);
  }
  if (ops.ready > 0 && ops.target === 0) {
    items.push(`<button type="button" class="dash-alert" onclick="mbDashOpenPage('campaigns')">${mbDashTr('Hazır temsilci var, hedef hat 0', 'Agenten bereit, Zielleitung 0')}</button>`);
  }
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 14 && goals.daily > 0 && todayAppts < goals.daily * 0.4) {
    items.push(`<div class="dash-alert">${mbDashTr('Gün hedefinin gerisinde', 'Tagesziel liegt zurück')} · ${todayAppts} / ${goals.daily}</div>`);
  }
  if (!items.length) return '';
  return `<div class="dash-alerts">${items.join('')}</div>`;
}

function mbDashSpeedSelect(id, speed) {
  const current = Math.min(10, Math.max(1, parseInt(speed, 10) || 1));
  const opts = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}"${n === current ? ' selected' : ''}>${n}</option>`;
  }).join('');
  return `<label class="dash-speed">${mbDashTr('hız', 'Tempo')}<select data-dash-speed="${id}" aria-label="${mbDashTr('Kampanya hızı', 'Kampagnentempo')}" onchange="mbDashSetSpeed('${id}', this.value)">${opts}</select></label>`;
}

async function mbDashSetSpeed(id, value) {
  const speed = Math.min(10, Math.max(1, parseInt(value, 10) || 1));
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return;
  try {
    await sb(`campaigns?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ dial_speed: speed }) });
    const camp = (window._dashBriefSnap?.ops?.camps || []).find((row) => row.id === id);
    if (camp) camp.dial_speed = speed;
    if (typeof campaigns !== 'undefined' && Array.isArray(campaigns)) {
      const row = campaigns.find((item) => item.id === id);
      if (row) row.dial_speed = speed;
    }
    if (typeof toast === 'function') toast(mbDashTr('Hız kaydedildi', 'Tempo gespeichert'), 'ok');
  } catch (e) {
    if (typeof toast === 'function') toast(e?.message || mbDashTr('Hız kaydedilemedi', 'Tempo nicht gespeichert'), 'err');
  }
}

function mbDashCampInner(logs, ops) {
  const camps = ops?.camps || [];
  if (!camps.length) return `<div class="dash-mini-row">${mbDashTr('Açık kampanya yok', 'Keine offene Kampagne')}</div>`;
  const showFirm = mbDashRole() === 'super' && !(typeof getActiveFirmId === 'function' && getActiveFirmId());
  const byCamp = {};
  (logs || []).forEach((log) => {
    const id = log.campaign_id;
    if (!id) return;
    if (!byCamp[id]) byCamp[id] = { total: 0, hit: 0 };
    byCamp[id].total += 1;
    const key = mbDashOutcomeKey(log);
    if (key !== 'no_answer' && key !== 'machine') byCamp[id].hit += 1;
  });
  const maxLeft = Math.max(1, ...camps.map((camp) => Number(camp.left) || 0));
  const colors = ['#38bdf8', '#fb923c', '#34d399', '#a78bfa', '#f87171', '#facc15', '#22d3ee', '#fb7185'];
  const rows = camps.map((camp, index) => {
    const stat = byCamp[camp.id] || { total: 0, hit: 0 };
    const rate = stat.total ? Math.round((stat.hit / stat.total) * 100) : 0;
    const remain = camp.left == null ? '—' : camp.left;
    const width = camp.left == null ? 0 : Math.round((Number(camp.left) || 0) / maxLeft * 100);
    const firm = showFirm && ops.firmName[camp.firm_id] ? ` · ${mbDashClip(ops.firmName[camp.firm_id], 18)}` : '';
    return `<div class="dash-camp"><button type="button" class="dash-camp-name" title="${mbDashEsc(camp.name || '')}" onclick="mbDashOpenCamp('${camp.id}')">${mbDashEsc(mbDashClip(camp.name, 32))}${mbDashEsc(firm)}</button><b>${remain}</b><span class="dash-meter"><i style="width:${width}%;background:${colors[index % colors.length]}"></i></span><span class="dash-camp-meta"><small>${mbDashTr('kalan', 'offen')} · %${rate}</small>${mbDashSpeedSelect(camp.id, camp.dial_speed)}</span></div>`;
  }).join('');
  const scroll = camps.length > 3 ? ' dash-camps-scroll' : '';
  return `<div class="dash-camps${scroll}">${rows}</div>`;
}

function mbFitCampScroll() {
  const box = document.querySelector('#dash-camp-body .dash-camps-scroll');
  if (!box) return;
  const rows = [...box.children].filter((el) => el.classList.contains('dash-camp'));
  if (rows.length <= 3) {
    box.style.maxHeight = '';
    return;
  }
  const gap = parseFloat(getComputedStyle(box).rowGap) || 10;
  const height = rows.slice(0, 3).reduce((sum, el) => sum + el.offsetHeight, 0) + gap * 2;
  box.style.maxHeight = `${Math.ceil(height)}px`;
}

async function mbDashRankInner(logs, ff, usersReady) {
  const users = usersReady || await sb(`users?select=id,name&is_active=eq.true${ff}&limit=300`).catch(() => []) || [];
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
    return `<div class="dash-mini-row">${mbDashTr('Bu aralıkta arama yok', 'Keine Anrufe in diesem Zeitraum')}</div>`;
  }
  const maxCalls = Math.max(1, ...rows.map((row) => row.calls));
  const body = rows.map((row) => {
    const rate = row.calls ? Math.round((row.appt / row.calls) * 100) : 0;
    const min = Math.floor(row.talk / 60);
    const width = Math.round((row.calls / maxCalls) * 100);
    return `<button type="button" class="dash-camp" onclick="mbDashOpenAgent('${row.id}')"><span class="dash-camp-name">${mbDashEsc(names[row.id] || row.id.slice(0, 8))}</span><b>${row.appt}</b><span class="dash-meter"><i style="width:${width}%;background:#34d399"></i></span><small>${row.calls} ${mbDashTr('arama', 'Anrufe')} · ${min}dk · %${rate}</small></button>`;
  }).join('');
  return `<div class="dash-camps">${body}</div>`;
}

async function mbDashNextBlock(ff, agentQ) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const [callbacks, appts] = await Promise.all([
    sb(`wiedervorlage?select=id,nachname,telefon,termin_zaman&durum=eq.bekliyor&order=termin_zaman.asc&limit=5${ff}${agentQ}`).catch(() => []),
    sb(`appointments?select=id,nachname,telefonnummer,termin_tarih&termin_tarih=gte.${today}T00:00:00&order=termin_tarih.asc&limit=5${ff}${agentQ}`).catch(() => []),
  ]);
  const cbRows = (callbacks || []).map((row) => `<div class="dash-mini-row is-link" onclick="mbDashOpenPage('wiedervorlage')"><span>${mbDashEsc(row.nachname || row.telefon || '—')}</span><b>${mbDashWhen(row.termin_zaman)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Bekleyen geri arama yok', 'Keine Rückrufe')}</div>`;
  const apRows = (appts || []).map((row) => `<div class="dash-mini-row is-link" onclick="mbDashOpenPage('takvim')"><span>${mbDashEsc(row.nachname || row.telefonnummer || '—')}</span><b>${mbDashWhen(row.termin_tarih)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Yaklaşan randevu yok', 'Keine anstehenden Termine')}</div>`;
  return mbDashCard(
    mbDashTr('Sıradaki iş', 'Als Nächstes'),
    `<div class="dash-next-split"><div><div class="dash-goal-line"><span>${mbDashTr('Geri aramalar', 'Rückrufe')}</span></div>${cbRows}</div><div><div class="dash-goal-line"><span>${mbDashTr('Randevular', 'Termine')}</span></div>${apRows}</div></div>`,
    'dash-span',
    '',
    'next'
  );
}

async function mbDashMyRank(ff) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(today) : `${today}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
  const rows = await sb(`call_logs?select=agent_id&outcome=in.(appointment,appointment_done)&started_at=gte.${gte}&started_at=lte.${lte}${ff}&limit=8000`).catch(() => []) || [];
  const bag = {};
  rows.forEach((row) => {
    if (!row.agent_id) return;
    bag[row.agent_id] = (bag[row.agent_id] || 0) + 1;
  });
  const mine = bag[currentUser?.id] || 0;
  if (!mine) {
    return mbDashCard(mbDashTr('Senin sıran', 'Dein Platz'), `<div class="dash-mini-row">${mbDashTr('Bugün henüz randevun yok', 'Heute noch kein Termin')}</div>`, '', '', 'mine');
  }
  const higher = Object.values(bag).filter((n) => n > mine).length;
  const place = higher + 1;
  return mbDashCard(mbDashTr('Senin sıran', 'Dein Platz'), `<div class="dash-mini-row"><span>${mbDashTr('Bugün randevuda', 'Heute bei Terminen')}</span><b>${place}. ${mbDashTr('sıradasın', 'Platz')}</b></div>`, '', '', 'mine');
}

async function mbDashQcBlock(ff) {
  const mine = currentUser?.id ? `&qc_by=eq.${currentUser.id}` : '';
  const [pending, waiting, closed] = await Promise.all([
    mbDashCount(`appointments?select=id&durum=eq.qc_bekleniyor${ff}`),
    sb(`appointments?select=id,nachname,telefonnummer,termin_tarih&durum=eq.qc_bekleniyor&order=termin_tarih.desc&limit=5${ff}`).catch(() => []),
    sb(`call_logs?select=id,phone,qc_at,qc_result&qc_at=not.is.null${mine}&order=qc_at.desc&limit=5${ff}`).catch(() => []),
  ]);
  const waitRows = (waiting || []).map((row) => `<div class="dash-mini-row is-link" onclick="mbDashOpenPage('qc')"><span>${mbDashEsc(row.nachname || row.telefonnummer || '—')}</span><b>${mbDashWhen(row.termin_tarih)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Bekleyen Kalite Kontrol yok', 'Keine offene QC')}</div>`;
  const doneRows = (closed || []).map((row) => `<div class="dash-mini-row is-link" onclick="mbDashOpenPage('qc')"><span>${mbDashEsc(row.phone || '—')}</span><b>${mbDashEsc(row.qc_result || '—')} · ${mbDashWhen(row.qc_at)}</b></div>`).join('')
    || `<div class="dash-mini-row">${mbDashTr('Henüz kapattığın Kalite Kontrol yok', 'Noch keine abgeschlossene QC')}</div>`;
  return mbDashCard(`${mbDashTr('Bekleyen Kalite Kontrol', 'Offene QC')} · ${pending == null ? '—' : pending}`, waitRows, '', '', 'qc-wait')
    + mbDashCard(mbDashTr('Senin kapattıkların', 'Von dir abgeschlossen'), doneRows, '', '', 'qc-done');
}

function mbDashLabel(valueId, text) {
  const card = document.getElementById(valueId)?.closest('.stat-card');
  const lbl = valueId === 'd-calls' ? document.getElementById('stat-lbl-calls') : card?.querySelector('.stat-lbl');
  if (lbl) lbl.textContent = text;
}

async function mbPaintFieldDash(from, to) {
  mbDashLabel('d-calls', t('dash.field.open'));
  mbDashLabel('d-appt', t('dash.field.done'));
  mbDashLabel('d-cb', t('dash.field.sales'));
  mbDashLabel('d-vm', t('dash.field.missing'));
  let tasks = [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({ p_actor_user_id: currentUser.id, p_firm_id: (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id || null }),
    });
    if (res.ok) tasks = (await res.json().catch(() => [])) || [];
  } catch (e) {}
  const inRange = (iso) => {
    const day = iso && typeof mbBerlinDay === 'function' ? mbBerlinDay(iso) : String(iso || '').slice(0, 10);
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };
  const open = tasks.filter((task) => task.status === 'assigned' || task.status === 'in_progress').length;
  const done = tasks.filter((task) => task.status === 'completed' && inRange(task.completed_at || task.updated_at)).length;
  const sales = tasks.filter((task) => (typeof fieldIsSale === 'function' ? fieldIsSale(task.result_key) : String(task.result_key || '') === 'satis') && inRange(task.completed_at || task.updated_at)).length;
  let missing = 0;
  try {
    const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || null;
    const fs = fid && typeof getFirmFieldSettings === 'function' ? await getFirmFieldSettings(fid) : null;
    const ids = tasks.map((task) => task.id).filter(Boolean);
    const files = ids.length ? ((await sb(`field_task_files?task_id=in.(${ids.join(',')})&select=task_id,file_name`).catch(() => [])) || []) : [];
    missing = tasks.filter((task) => typeof fieldTaskMissingDocs === 'function' && fieldTaskMissingDocs(task, files, fs?.document_requirements)).length;
  } catch (e) {}
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
  set('d-calls', open);
  set('d-appt', done);
  set('d-cb', sales);
  set('d-vm', missing);
  const callsMeta = document.getElementById('d-calls-m');
  if (callsMeta) callsMeta.textContent = t('dash.field.open');
  const apptMeta = document.getElementById('d-appt-m');
  if (apptMeta) apptMeta.textContent = t('dash.field.done');
  const cbCard = document.getElementById('d-cb')?.closest('.stat-card');
  const cbMeta = cbCard?.querySelector('.stat-meta');
  if (cbMeta) cbMeta.textContent = t('dash.field.sales');
  ['d-calls-delta', 'd-appt-delta', 'd-cb-delta', 'd-vm-delta', 'd-talk-delta'].forEach((id) => mbDashPaintDelta(id, 0, null));
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
  return mbDashCard(mbDashTr('Saha görevlerin', 'Deine Außentermine'), summary + list, '', '', 'field');
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

let _dashBriefGen = 0;

async function mbDashRunDeltas(snap, logs, rangeKey, from, to) {
  if (!snap || snap.deltas) return;
  snap.deltas = true;
  await mbDashDeltas(logs, snap.ff, snap.agentQ, rangeKey, from, to);
}

async function mbDashApplyLogs(ctx) {
  const logs = ctx?.logs || [];
  window._dashPendingLogs = logs;
  window._dashLogsReady = true;
  const snap = window._dashBriefSnap;
  if (!snap || snap.gen !== _dashBriefGen || snap.usedLogs) {
    if (snap && snap.gen === _dashBriefGen && snap.usedLogs) await mbDashRunDeltas(snap, logs, ctx?.rangeKey, ctx?.from, ctx?.to);
    return;
  }
  snap.usedLogs = true;
  const users = snap.usersP ? await snap.usersP : null;
  const out = document.getElementById('dash-out-body');
  if (out) out.innerHTML = mbDashOutcomeHtml(logs);
  const camp = document.getElementById('dash-camp-body');
  if (camp && snap.ops) {
    camp.innerHTML = mbDashCampInner(logs, snap.ops);
    requestAnimationFrame(() => mbFitCampScroll());
  }
  const rank = document.getElementById('dash-rank-body');
  if (rank) rank.innerHTML = await mbDashRankInner(logs, snap.ff, users);
  await mbDashRunDeltas(snap, logs, ctx?.rangeKey, ctx?.from, ctx?.to);
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
    if (calls) calls.textContent = mbDashTr('Kalite Kontrol kayıtları', 'QC-Einträge');
    const apptLbl = document.getElementById('d-appt')?.closest('.stat-card')?.querySelector('.stat-lbl');
    if (apptLbl) apptLbl.textContent = mbDashTr('Kapanan Kalite Kontrol', 'Abgeschlossene QC');
  }
  host.innerHTML = `<div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div><div class="mb-empty-hint">${mbDashTr('Yükleniyor...', 'Laden...')}</div>`;
  if (role === 'field') {
    const fieldHtml = await mbDashFieldBlock(rangeKey, from, to);
    host.innerHTML = `<div class="dash-brief"><div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div><div class="dash-brief-grid">${fieldHtml}</div></div>`;
    mbPackBrief(host);
    mbInitBriefDrag();
    ['d-calls-delta', 'd-appt-delta', 'd-cb-delta', 'd-vm-delta', 'd-talk-delta'].forEach((id) => mbDashPaintDelta(id, 0, null));
    return;
  }
  const gen = ++_dashBriefGen;
  const wantOps = role === 'super' || role === 'firm';
  const wantGoals = wantOps || role === 'agent';
  const opsP = ctx?.seed ? (ctx.seed.opsP || Promise.resolve(null)) : (wantOps ? mbDashOps(ff) : Promise.resolve(null));
  const goalsP = ctx?.seed ? (ctx.seed.goalsP || Promise.resolve(null)) : (wantGoals ? mbDashGoalsData(ff, agentQ, role) : Promise.resolve(null));
  const usersP = ctx?.seed?.usersP || (wantOps ? sb(`users?select=id,name&is_active=eq.true${ff}&limit=300`).catch(() => []) : Promise.resolve([]));
  const [ops, goals, nextHtml, myRank, qcHtml] = await Promise.all([
    opsP,
    goalsP,
    role === 'qc' ? Promise.resolve('') : mbDashNextBlock(ff, agentQ),
    role === 'agent' ? mbDashMyRank(ff) : Promise.resolve(''),
    role === 'qc' ? mbDashQcBlock(ff) : Promise.resolve(''),
  ]);
  if (gen !== _dashBriefGen) return;
  if (ops) mbDashPaintPills(ops);
  else {
    const pace = document.getElementById('dash-live-pace');
    if (pace) pace.innerHTML = '';
  }
  const parts = [];
  let alerts = '';
  if (goals) {
    const target = goals.goals.daily * goals.people;
    if (ops) alerts = mbDashAlertHtml(ops, { daily: target }, goals.dayN);
    else if (role === 'agent') {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      if (hour >= 14 && goals.goals.daily > 0 && goals.dayN < goals.goals.daily * 0.4) {
        alerts = `<div class="dash-alert">${mbDashTr('Gün hedefinin gerisinde', 'Tagesziel liegt zurück')} · ${goals.dayN} / ${goals.goals.daily}</div>`;
      }
    }
    parts.push(mbDashGoalsHtml(goals));
  }
  if (myRank) parts.push(myRank);
  const ready = window._dashLogsReady === true;
  const liveLogs = ready ? (window._dashPendingLogs || []) : logs;
  if (ops) {
    const campN = (ops.camps || []).length;
    const campTitle = campN > 3
      ? `${mbDashTr('Açık kampanyalar', 'Offene Kampagnen')} · ${campN}`
      : mbDashTr('Açık kampanyalar', 'Offene Kampagnen');
    parts.push(mbDashCard(campTitle, mbDashCampInner(liveLogs, ops), '', 'dash-camp-body', 'camps'));
    const rankInner = ready ? await mbDashRankInner(liveLogs, ff, await usersP) : `<div class="dash-mini-row">${mbDashTr('Yükleniyor...', 'Laden...')}</div>`;
    parts.push(mbDashCard(mbDashTr('Temsilci sırası', 'Agentenliste'), rankInner, '', 'dash-rank-body', 'rank'));
  }
  if (qcHtml) parts.push(qcHtml);
  parts.push(mbDashCard(role === 'qc' ? mbDashTr('Kalite Kontrol sonuçları', 'QC-Ergebnisse') : mbDashTr('Arama sonuçları', 'Anrufergebnisse'), mbDashOutcomeHtml(liveLogs), '', 'dash-out-body', 'out'));
  if (nextHtml) parts.push(nextHtml);
  if (gen !== _dashBriefGen) return;
  const snap = { gen, ops, ff, agentQ, usersP, usedLogs: ready, deltas: false };
  window._dashBriefSnap = snap;
  host.innerHTML = `<div class="dash-brief"><div class="dash-brief-scope">${mbDashEsc(mbDashScopeLine(role))}</div>${alerts}<div class="dash-brief-grid">${parts.join('')}</div></div>`;
  mbPackBrief(host);
  mbInitBriefDrag();
  requestAnimationFrame(() => mbFitCampScroll());
  if (ready) await mbDashRunDeltas(snap, liveLogs, rangeKey, from, to);
  if (ops?.ids?.length) {
    mbDashOpsSlow(ops).then(() => {
      if (gen !== _dashBriefGen) return;
      mbDashFillRemain(ops);
      mbDashPaintPills(ops);
      if (goals) {
        const box = document.querySelector('#dash-brief .dash-alerts');
        const html = mbDashAlertHtml(ops, { daily: goals.goals.daily * goals.people }, goals.dayN);
        if (box) box.outerHTML = html || '';
        else if (html) document.querySelector('#dash-brief .dash-brief-scope')?.insertAdjacentHTML('afterend', html);
      }
    }).catch(() => {});
  }
}

function mbBriefCardKey() {
  const id = (typeof currentUser !== 'undefined' && currentUser?.id) ? currentUser.id : 'local';
  return `mb_dash_cards_${id}`;
}

function mbBriefOrderOk(raw) {
  const okList = (list) => Array.isArray(list) && list.every((key) => /^[a-z0-9-]{1,24}$/.test(String(key || '')));
  return !!raw && typeof raw === 'object' && okList(raw.left) && okList(raw.right) && okList(raw.wide || []);
}

function mbReadBriefOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(mbBriefCardKey()) || 'null');
    return mbBriefOrderOk(raw) ? raw : null;
  } catch (e) {
    return null;
  }
}

function mbSaveBriefOrder() {
  const read = (sel) => [...document.querySelectorAll(sel)].map((el) => el.dataset.dashCard).filter((key) => /^[a-z0-9-]{1,24}$/.test(key || ''));
  const data = {
    left: read('.dash-brief-col[data-brief-col="left"] > .dash-brief-card'),
    right: read('.dash-brief-col[data-brief-col="right"] > .dash-brief-card'),
    wide: read('.dash-brief-wide > .dash-brief-card'),
  };
  try { localStorage.setItem(mbBriefCardKey(), JSON.stringify(data)); } catch (e) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbPackBrief(host) {
  const root = host || document.getElementById('dash-brief');
  const grid = root?.querySelector('.dash-brief-grid');
  if (!grid) return;
  const cards = [...root.querySelectorAll('.dash-brief-card')];
  const saved = mbReadBriefOrder();
  const left = document.createElement('div');
  left.className = 'dash-brief-col';
  left.dataset.briefCol = 'left';
  const right = document.createElement('div');
  right.className = 'dash-brief-col';
  right.dataset.briefCol = 'right';
  let wide = root.querySelector('.dash-brief-wide');
  if (!wide) wide = document.createElement('div');
  wide.className = 'dash-brief-wide';
  wide.replaceChildren();
  const byKey = new Map();
  cards.forEach((el) => { if (el.dataset.dashCard) byKey.set(el.dataset.dashCard, el); });
  const used = new Set();
  const put = (key, parent) => {
    const el = byKey.get(key);
    if (!el || used.has(key)) return;
    used.add(key);
    el.classList.toggle('dash-span', parent === wide);
    parent.appendChild(el);
  };
  if (saved) {
    (saved.left || []).forEach((key) => put(key, left));
    (saved.right || []).forEach((key) => put(key, right));
    (saved.wide || []).forEach((key) => put(key, wide));
  }
  const prefer = {
    goals: left, mine: left, rank: left, 'qc-wait': left, 'qc-done': left, field: left,
    camps: right, out: right, next: wide,
  };
  cards.forEach((el) => {
    const key = el.dataset.dashCard;
    if (!key || used.has(key)) return;
    const target = prefer[key] || (el.dataset.dashWide === '1' ? wide : (left.childElementCount <= right.childElementCount ? left : right));
    put(key, target);
  });
  grid.replaceChildren(left, right);
  if (wide.childElementCount) grid.after(wide);
  else wide.remove();
}

let _briefDrag = '';

function mbInitBriefDrag() {
  const page = document.getElementById('page-dashboard');
  if (!page || page.dataset.briefDrag === '1') return;
  page.dataset.briefDrag = '1';
  const clearMarks = () => {
    page.querySelectorAll('.dash-brief-card.is-drop, .dash-brief-col.is-drop, .dash-brief-wide.is-drop').forEach((el) => {
      el.classList.remove('is-drop', 'is-drop-before');
    });
  };
  page.addEventListener('dragstart', (e) => {
    const handle = e.target.closest?.('.dash-card-handle');
    if (!handle || !page.contains(handle)) return;
    const card = handle.closest('.dash-brief-card');
    if (!card) return;
    _briefDrag = card.dataset.dashCard || '';
    card.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _briefDrag);
    }
  });
  page.addEventListener('dragend', () => {
    _briefDrag = '';
    page.querySelectorAll('.dash-brief-card.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    clearMarks();
  });
  page.addEventListener('dragover', (e) => {
    if (!_briefDrag) return;
    const zone = e.target.closest?.('.dash-brief-col, .dash-brief-wide');
    if (!zone || !page.contains(zone)) return;
    e.preventDefault();
    clearMarks();
    const card = e.target.closest?.('.dash-brief-card');
    if (card && card.dataset.dashCard !== _briefDrag && zone.contains(card)) {
      const rect = card.getBoundingClientRect();
      card.classList.add('is-drop');
      card.classList.toggle('is-drop-before', e.clientY < rect.top + rect.height / 2);
    } else zone.classList.add('is-drop');
  });
  page.addEventListener('drop', (e) => {
    if (!_briefDrag) return;
    const from = page.querySelector(`.dash-brief-card[data-dash-card="${_briefDrag}"]`);
    const zone = e.target.closest?.('.dash-brief-col, .dash-brief-wide');
    if (!from || !zone || !page.contains(zone)) return;
    e.preventDefault();
    const card = e.target.closest?.('.dash-brief-card');
    from.classList.toggle('dash-span', zone.classList.contains('dash-brief-wide'));
    if (card && card !== from && zone.contains(card)) {
      const rect = card.getBoundingClientRect();
      if (e.clientY > rect.top + rect.height / 2) card.after(from);
      else card.before(from);
    } else zone.appendChild(from);
    clearMarks();
    from.classList.remove('is-dragging');
    _briefDrag = '';
    mbSaveBriefOrder();
  });
}

