// Admin mesai: herkes bir arada, kişiye tıklayınca gün / hafta / ay akışı.

const ATT_STAFF = new Set(['agent', 'qc', 'field_agent', 'ai']);
const ATT_WORK = new Set(['ready', 'calling', 'on_call', 'wrapping']);

const _att = {
  view: 'day',
  anchor: '',
  agentId: '',
  filter: 'all',
  seq: 0,
  users: [],
  logs: [],
  calls: [],
  sessions: {},
  camps: {},
};

function attSay(key, fb) {
  const s = typeof t === 'function' ? t(key) : '';
  return s && s !== key ? s : (fb || '');
}

function attEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function attDe() {
  return typeof currentLang !== 'undefined' && currentLang === 'de';
}

function attFirmId() {
  return (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || '';
}

function attMonday(day) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || typeof mbShiftDate !== 'function') return day;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dow = dt.getUTCDay() || 7;
  return mbShiftDate(day, 1 - dow);
}

function attDays(start, end) {
  const out = [];
  let d = start;
  let guard = 0;
  while (d && d <= end && guard < 40) {
    out.push(d);
    d = typeof mbShiftDate === 'function' ? mbShiftDate(d, 1) : '';
    guard += 1;
  }
  return out;
}

function attRange() {
  const anchor = _att.anchor || (typeof mbBusinessToday === 'function' ? mbBusinessToday() : '');
  if (_att.view === 'week') {
    const start = attMonday(anchor);
    const end = typeof mbShiftDate === 'function' ? mbShiftDate(start, 6) : start;
    return { start, end, days: attDays(start, end) };
  }
  if (_att.view === 'month') {
    const m = String(anchor || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return { start: anchor, end: anchor, days: anchor ? [anchor] : [] };
    const dim = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    const start = `${m[1]}-${m[2]}-01`;
    const end = `${m[1]}-${m[2]}-${String(dim).padStart(2, '0')}`;
    return { start, end, days: attDays(start, end) };
  }
  return { start: anchor, end: anchor, days: anchor ? [anchor] : [] };
}

function attAddMonth(day, delta) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return day;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + Number(delta || 0), 1));
  const dim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), dim);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${mo}-${String(d).padStart(2, '0')}`;
}

function attDayOf(iso) {
  if (!iso) return '';
  if (typeof mbBerlinDay === 'function') return mbBerlinDay(iso);
  return String(iso).slice(0, 10);
}

function attClock(iso) {
  if (!iso) return '—';
  if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { hour: '2-digit', minute: '2-digit' });
  return String(iso).slice(11, 16);
}

function attDayFace(day) {
  const iso = typeof mbWallToIso === 'function' ? mbWallToIso(`${day}T12:00`) : `${day}T12:00:00Z`;
  if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { weekday: 'short', day: '2-digit', month: '2-digit' });
  return day;
}

function attRangeFace(range) {
  if (_att.view === 'month') {
    const iso = typeof mbWallToIso === 'function' ? mbWallToIso(`${range.start}T12:00`) : `${range.start}T12:00:00Z`;
    if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { month: 'long', year: 'numeric' });
  }
  if (_att.view === 'week') return `${attDayFace(range.start)} – ${attDayFace(range.end)}`;
  return attDayFace(range.start);
}

function attHms(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  if (!n) return '—';
  const de = attDe();
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h) return de ? `${h} Std ${m} Min` : `${h} sa ${m} dk`;
  if (m) return de ? `${m} Min` : `${m} dk`;
  return de ? `${n} Sek` : `${n} sn`;
}

function attStatus(status) {
  const key = `agent.status.${status || 'offline'}`;
  const label = typeof t === 'function' ? t(key) : '';
  if (label && label !== key) return label;
  if (status === 'calling') return attDe() ? 'Wählt' : 'Arıyor';
  return status || '—';
}

function attOutcome(key) {
  try {
    if (typeof repOutcomeLabel === 'function') {
      const norm = typeof statsOutcomeKey === 'function' ? (statsOutcomeKey(key) || key) : key;
      return repOutcomeLabel(norm);
    }
  } catch (e) {}
  return key || '—';
}

function attOwnOnly() {
  return !(typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin());
}

function attLive(sess) {
  if (typeof mbLiveEffectiveStatus === 'function') return mbLiveEffectiveStatus(sess);
  if (!sess) return 'offline';
  const at = new Date(sess.last_seen || sess.updated_at || 0).getTime();
  if (!Number.isFinite(at) || Date.now() - at > 90000) return 'offline';
  const st = String(sess.status || '');
  if (st === 'calling') return 'ready';
  if (st === 'on_call' || st === 'ready' || st === 'wrapping' || st === 'break' || st === 'offline') return st;
  return 'offline';
}

function attSegStillLive(seg) {
  const startDay = attDayOf(seg?.started_at);
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  if (!startDay || startDay !== today || seg?.ended_at) return false;
  const live = attLive(_att.sessions[seg.agent_id]);
  const st = seg.status === 'calling' ? 'ready' : seg.status;
  return live === st;
}

function attSegEndMs(seg) {
  if (seg?.ended_at) {
    const t = new Date(seg.ended_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const startDay = attDayOf(seg?.started_at);
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  if (attSegStillLive(seg)) return Date.now();
  const sess = _att.sessions[seg?.agent_id] || null;
  const seen = new Date(sess?.last_seen || sess?.updated_at || 0).getTime();
  const start = new Date(seg?.started_at || 0).getTime();
  if (startDay && startDay === today && Number.isFinite(seen) && seen > start) return seen;
  if (startDay && startDay !== today && typeof mbInstantLte === 'function') {
    const end = new Date(mbInstantLte(startDay)).getTime();
    if (Number.isFinite(end)) return end;
  }
  if (Number.isFinite(seen) && seen > start) return seen;
  return Number.isFinite(start) ? start : Date.now();
}

function attClip(seg, day) {
  const start = new Date(seg?.started_at || '').getTime();
  if (!Number.isFinite(start) || typeof mbInstantGte !== 'function' || typeof mbInstantLte !== 'function') return null;
  const fromBound = new Date(mbInstantGte(day)).getTime();
  const toBound = new Date(mbInstantLte(day)).getTime();
  const end = attSegEndMs(seg);
  const from = Math.max(start, fromBound);
  const to = Math.min(end, toBound);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return { from, to, sec: Math.round((to - from) / 1000), startedHere: start >= fromBound && start <= toBound };
}

function attPersonDays(userId, range) {
  const logs = _att.logs.filter((row) => String(row.agent_id) === String(userId));
  const calls = _att.calls.filter((row) => String(row.agent_id) === String(userId));
  return (range.days || []).map((day) => {
    const segs = logs.map((row) => {
      const clip = attClip(row, day);
      if (!clip) return null;
      return { ...row, clip };
    }).filter(Boolean).sort((a, b) => a.clip.from - b.clip.from);
    const dayCalls = calls.filter((row) => attDayOf(row.started_at) === day)
      .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
    const work = segs.filter((row) => ATT_WORK.has(row.status));
    const breaks = segs.filter((row) => row.status === 'break');
    const present = segs.filter((row) => row.status && row.status !== 'offline');
    const left = segs.filter((row) => row.status === 'offline');
    const first = present[0];
    const last = present[present.length - 1];
    const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
    const open = !!(last && attSegStillLive(last) && attDayOf(last.started_at) === day && day === today);
    const leftAt = left.length ? left[left.length - 1].clip.from : 0;
    const outAt = open ? 0 : (leftAt && (!last || leftAt >= last.clip.from) ? leftAt : (last ? last.clip.to : 0));
    return {
      day,
      segs,
      calls: dayCalls,
      inAt: first ? first.clip.from : 0,
      outAt,
      open,
      workSec: work.reduce((sum, row) => sum + row.clip.sec, 0),
      breakSec: breaks.reduce((sum, row) => sum + row.clip.sec, 0),
      callSec: dayCalls.reduce((sum, row) => sum + (Number(row.duration_sec) || 0), 0),
    };
  }).filter((day) => day.segs.length || day.calls.length);
}

function attSummary(user, range) {
  const days = attPersonDays(user.id, range);
  const sess = _att.sessions[user.id] || null;
  const presentDays = days.filter((day) => day.inAt);
  const first = presentDays[0];
  const last = presentDays[presentDays.length - 1];
  return {
    user,
    sess,
    live: attLive(sess),
    days,
    came: presentDays.length,
    inAt: first?.inAt || 0,
    outAt: last?.open ? 0 : (last?.outAt || 0),
    open: !!last?.open,
    workSec: days.reduce((sum, day) => sum + day.workSec, 0),
    breakSec: days.reduce((sum, day) => sum + day.breakSec, 0),
    callN: days.reduce((sum, day) => sum + day.calls.length, 0),
    callSec: days.reduce((sum, day) => sum + day.callSec, 0),
  };
}

function attSyncChrome(range) {
  document.querySelectorAll('[data-att-view]').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.attView === _att.view);
  });
  document.querySelectorAll('[data-att-filter]').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.attFilter === (_att.filter || 'all'));
  });
  const label = document.getElementById('att-label');
  if (label) label.textContent = attRangeFace(range);
  const search = document.getElementById('att-search');
  if (search) search.hidden = attOwnOnly();
  const sub = document.getElementById('att-sub');
  if (sub) {
    if (!sub.dataset.attTr) {
      sub.dataset.attTr = sub.dataset.tr || 'Kim geldi, ne zaman girdi, ne zaman çıktı, arada ne yaptı.';
      sub.dataset.attDe = sub.dataset.de || 'Wer da war, wann gekommen, wann gegangen, was dazwischen.';
    }
    const tr = attOwnOnly() ? 'Kendi giriş, çıkış ve gün akışın.' : sub.dataset.attTr;
    const de = attOwnOnly() ? 'Dein Kommen, Gehen und der Tagesverlauf.' : sub.dataset.attDe;
    sub.dataset.tr = tr;
    sub.dataset.de = de;
    sub.textContent = attDe() ? de : tr;
  }
}

function attKpis(row) {
  const bits = [
    [attSay('att.in', 'Giriş'), row.inAt ? attClock(new Date(row.inAt).toISOString()) : '—'],
    [attSay('att.out', 'Çıkış'), row.open ? attSay('att.open', 'Açık') : (row.outAt ? attClock(new Date(row.outAt).toISOString()) : '—')],
    [attSay('att.work', 'Mesaide'), attHms(row.workSec)],
    [attSay('att.break', 'Mola'), attHms(row.breakSec)],
    [attSay('att.calls', 'Çağrı'), row.callN ? `${row.callN} · ${attHms(row.callSec)}` : '—'],
  ];
  return `<div class="att-kpis">${bits.map(([k, v]) => `<div class="att-kpi"><span>${attEsc(k)}</span><b>${attEsc(v)}</b></div>`).join('')}</div>`;
}

function attNow(sess) {
  const st = attLive(sess);
  if (!sess) return '—';
  const extra = st === 'break' && sess.break_code ? ` · ${sess.break_code}` : '';
  return `${attStatus(st)}${extra}`;
}

function attKeepRow(row) {
  const f = _att.filter || 'all';
  if (f === 'all') return true;
  if (f === 'came') return !!row.came;
  if (f === 'absent') return !row.came;
  if (f === 'calls') return row.callN > 0;
  if (f === 'on_call') return row.live === 'on_call';
  return row.live === f;
}

function attOverview(rows) {
  const q = String(document.getElementById('att-search')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const named = rows.filter((row) => !q || String(row.user.name || '').toLocaleLowerCase('tr-TR').includes(q));
  const list = named.filter(attKeepRow);
  const present = list.filter((row) => row.came).length;
  const head = `<div class="att-kpis">
<div class="att-kpi"><span>${attEsc(attSay('att.person', 'Personel'))}</span><b>${list.length}</b></div>
<div class="att-kpi"><span>${attEsc(attSay('att.present', 'Gelen'))}</span><b>${present}</b></div>
<div class="att-kpi"><span>${attEsc(attSay('att.absent', 'Girmedi'))}</span><b>${list.length - present}</b></div>
</div>`;
  if (!list.length) {
    const key = rows.length ? 'att.filtered' : 'att.none';
    const fb = rows.length ? 'Bu filtrede kimse yok.' : 'Personel yok.';
    return head + `<div class="card"><div class="firm-none">${attEsc(attSay(key, fb))}</div></div>`;
  }
  const body = list.map((row) => {
    const name = row.user.name || '—';
    const role = typeof mbRoleLabel === 'function' ? mbRoleLabel(row.user.role) : (row.user.role || '');
    return `<tr class="att-row" onclick="attOpen('${attEsc(row.user.id)}')">
<td><div class="att-name">${attEsc(name)}</div><div class="att-role">${attEsc(role)}</div></td>
<td><span class="att-pill" data-st="${attEsc(row.live || 'offline')}">${attEsc(attNow(row.sess))}</span></td>
<td>${row.came ? attEsc(attClock(new Date(row.inAt).toISOString())) : attEsc(attSay('att.absent', 'Girmedi'))}</td>
<td>${row.open ? attEsc(attSay('att.open', 'Açık')) : (row.outAt ? attEsc(attClock(new Date(row.outAt).toISOString())) : '—')}</td>
<td>${row.came || '—'}</td>
<td>${attEsc(attHms(row.workSec))}</td>
<td>${attEsc(attHms(row.breakSec))}</td>
<td>${row.callN ? `${row.callN} · ${attEsc(attHms(row.callSec))}` : '—'}</td>
</tr>`;
  }).join('');
  return `${head}<div class="card" style="padding:0;"><div class="tbl-wrap"><table class="att-table"><thead><tr>
<th>${attEsc(attSay('att.person', 'Personel'))}</th>
<th>${attEsc(attSay('att.now', 'Şimdi'))}</th>
<th>${attEsc(attSay('att.in', 'Giriş'))}</th>
<th>${attEsc(attSay('att.out', 'Çıkış'))}</th>
<th>${attEsc(attSay('att.days', 'Gün'))}</th>
<th>${attEsc(attSay('att.work', 'Mesaide'))}</th>
<th>${attEsc(attSay('att.break', 'Mola'))}</th>
<th>${attEsc(attSay('att.calls', 'Çağrı'))}</th>
</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function attCallLine(call) {
  const phone = call.phone || '';
  const outcome = attOutcome(call.outcome);
  const camp = _att.camps[call.campaign_id] || '';
  const meta = [outcome, attHms(call.duration_sec), camp].filter((bit) => bit && bit !== '—').join(' · ');
  return `<div class="att-call"><b>${attEsc(attClock(call.started_at))}</b><span>${attEsc(phone || '—')}</span><small>${attEsc(meta)}</small></div>`;
}

function attSegLine(seg) {
  const camp = _att.camps[seg.campaign_id] || '';
  const extra = [seg.status === 'break' ? seg.break_code : '', camp].filter(Boolean).join(' · ');
  const start = new Date(seg.clip.from).toISOString();
  const end = new Date(seg.clip.to).toISOString();
  return `<div class="att-seg" data-st="${attEsc(seg.status || '')}">
<b>${attEsc(attClock(start))} – ${attEsc(attClock(end))}</b>
<span class="att-pill" data-st="${attEsc(seg.status || '')}">${attEsc(attStatus(seg.status))}</span>
<small>${attEsc(attHms(seg.clip.sec))}${extra ? ` · ${attEsc(extra)}` : ''}</small>
</div>`;
}

function attSegOn(seg) {
  const f = _att.filter || 'all';
  if (f === 'all' || f === 'came') return true;
  if (f === 'absent' || f === 'calls') return false;
  if (f === 'on_call') return seg.status === 'on_call' || seg.status === 'calling';
  return seg.status === f;
}

function attCallOn() {
  const f = _att.filter || 'all';
  return f === 'all' || f === 'came' || f === 'calls' || f === 'on_call';
}

function attDetail(row) {
  const name = row.user.name || '—';
  const role = typeof mbRoleLabel === 'function' ? mbRoleLabel(row.user.role) : (row.user.role || '');
  const own = attOwnOnly();
  const blocks = row.days.map((day) => {
    const used = new Set();
    const lines = day.segs.filter(attSegOn).map((seg) => {
      const inside = attCallOn() ? day.calls.filter((call) => {
        const t = new Date(call.started_at).getTime();
        return t >= seg.clip.from && t <= seg.clip.to;
      }) : [];
      inside.forEach((call) => used.add(call));
      return attSegLine(seg) + inside.map(attCallLine).join('');
    }).join('');
    const rest = attCallOn() ? day.calls.filter((call) => !used.has(call)).map(attCallLine).join('') : '';
    if (!lines && !rest) return '';
    const span = day.open
      ? `${attClock(new Date(day.inAt).toISOString())} – ${attSay('att.open', 'Açık')}`
      : (day.inAt ? `${attClock(new Date(day.inAt).toISOString())} – ${day.outAt ? attClock(new Date(day.outAt).toISOString()) : '—'}` : attSay('att.calls', 'Çağrı'));
    return `<section class="att-day">
<button type="button" class="att-day-h" onclick="attJumpDay('${attEsc(day.day)}')"><b>${attEsc(attDayFace(day.day))}</b><span>${attEsc(span)}</span></button>
${lines}${rest}
</section>`;
  }).filter(Boolean).join('');
  const days = blocks || `<div class="firm-none">${attEsc(attSay(row.days.length ? 'att.filtered' : 'att.empty', row.days.length ? 'Bu filtrede kayıt yok.' : 'Bu aralıkta hareket yok.'))}</div>`;
  const back = own ? '' : `<button type="button" class="btn btn-ghost btn-sm" onclick="attBack()">${attEsc(attSay('att.back', 'Herkes'))}</button>`;
  return `<div class="att-detail-h">
${back}
<div><div class="att-name">${attEsc(name)}</div><div class="att-role">${attEsc(role)} · ${attEsc(attNow(row.sess))}</div></div>
</div>
${attKpis(row)}
<div class="card att-flow"><div class="att-flow-title">${attEsc(attSay('att.timeline', 'Gün akışı'))}</div>${days}</div>`;
}

function attPaint() {
  const host = document.getElementById('att-body');
  if (!host) return;
  const range = attRange();
  attSyncChrome(range);
  const rows = (_att.users || []).map((user) => attSummary(user, range)).sort((a, b) => {
    if (!!b.came !== !!a.came) return a.came ? -1 : 1;
    if (a.inAt && b.inAt && a.inAt !== b.inAt) return a.inAt - b.inAt;
    return String(a.user.name || '').localeCompare(String(b.user.name || ''), 'tr');
  });
  if (_att.agentId) {
    const row = rows.find((item) => String(item.user.id) === String(_att.agentId));
    host.innerHTML = row ? attDetail(row) : attOverview(rows);
    if (!row) _att.agentId = '';
    return;
  }
  host.innerHTML = attOverview(rows);
}

function attOpen(id) {
  if (attOwnOnly()) return;
  _att.agentId = String(id || '');
  const box = document.getElementById('att-search');
  if (box) box.value = '';
  attPaint();
}

function attBack() {
  if (attOwnOnly()) return;
  _att.agentId = '';
  attPaint();
}

function attSetFilter(key) {
  const ok = ['all', 'came', 'absent', 'on_call', 'ready', 'break', 'offline', 'calls'];
  _att.filter = ok.includes(key) ? key : 'all';
  attPaint();
}

function attJumpDay(day) {
  if (!day) return;
  _att.view = 'day';
  _att.anchor = day;
  loadAttendancePage();
}

function attSetView(view) {
  if (!['day', 'week', 'month'].includes(view)) return;
  _att.view = view;
  loadAttendancePage();
}

function attShift(delta) {
  const anchor = _att.anchor || (typeof mbBusinessToday === 'function' ? mbBusinessToday() : '');
  if (_att.view === 'month') _att.anchor = attAddMonth(anchor, delta);
  else if (_att.view === 'week') _att.anchor = typeof mbShiftDate === 'function' ? mbShiftDate(anchor, delta * 7) : anchor;
  else _att.anchor = typeof mbShiftDate === 'function' ? mbShiftDate(anchor, delta) : anchor;
  loadAttendancePage();
}

function attToday() {
  _att.anchor = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  loadAttendancePage();
}

async function attSessions(firmQ, who) {
  const rich = `agent_sessions?select=agent_id,status,last_seen,updated_at,login_at,break_code,campaign_id,call_started_at,current_contact_name${firmQ}${who}`;
  const plain = `agent_sessions?select=agent_id,status,last_seen,login_at,break_code,campaign_id${firmQ}${who}`;
  try {
    const rows = await sb(rich);
    if (Array.isArray(rows)) return rows;
  } catch (e) {}
  return (await sb(plain).catch(() => [])) || [];
}

async function attFetch(path) {
  if (typeof mbFetchAll === 'function') {
    const rows = await mbFetchAll(path).catch(() => null);
    if (Array.isArray(rows)) return rows;
  }
  return (await sb(path).catch(() => [])) || [];
}

async function loadAttendancePage() {
  const host = document.getElementById('att-body');
  if (!host) return;
  if (!_att.anchor) _att.anchor = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  if (typeof renderFirmSelector === 'function') renderFirmSelector('att-firm', loadAttendancePage);
  const fid = attFirmId();
  const range = attRange();
  attSyncChrome(range);
  if (!fid) {
    host.innerHTML = `<div class="card"><div class="firm-none">${attEsc(attSay('att.needfirm', 'Firma seçin.'))}</div></div>`;
    return;
  }
  const mine = attOwnOnly();
  const selfId = currentUser?.id || '';
  if (mine) _att.agentId = selfId;
  const seq = ++_att.seq;
  host.innerHTML = `<div class="card"><div class="firm-none">${attEsc(attSay('att.loading', 'Yükleniyor…'))}</div></div>`;
  const firmQ = `&firm_id=eq.${fid}`;
  const who = mine && selfId ? `&agent_id=eq.${selfId}` : '';
  const gte = encodeURIComponent(typeof mbInstantGte === 'function' ? mbInstantGte(range.start) : `${range.start}T00:00:00`);
  const lte = encodeURIComponent(typeof mbInstantLte === 'function' ? mbInstantLte(range.end) : `${range.end}T23:59:59`);
  try {
    const [users, inside, beforeEnd, stillOpen, calls, sessions, camps] = await Promise.all([
      mine ? Promise.resolve([]) : sb(`users?select=id,name,role,is_active&is_active=eq.true${firmQ}&order=name.asc`).catch(() => []),
      attFetch(`agent_status_log?select=id,agent_id,status,break_code,campaign_id,started_at,ended_at,duration_sec${firmQ}${who}&started_at=gte.${gte}&started_at=lte.${lte}&order=started_at.asc`),
      attFetch(`agent_status_log?select=id,agent_id,status,break_code,campaign_id,started_at,ended_at,duration_sec${firmQ}${who}&started_at=lt.${gte}&ended_at=gte.${gte}&order=started_at.asc`),
      attFetch(`agent_status_log?select=id,agent_id,status,break_code,campaign_id,started_at,ended_at,duration_sec${firmQ}${who}&started_at=lt.${gte}&ended_at=is.null&order=started_at.asc`),
      attFetch(`call_logs?select=id,agent_id,started_at,duration_sec,outcome,phone,campaign_id${firmQ}${who}&started_at=gte.${gte}&started_at=lte.${lte}&order=started_at.asc`),
      attSessions(firmQ, who),
      sb(`campaigns?select=id,name${firmQ}&order=name.asc`).catch(() => []),
    ]);
    if (seq !== _att.seq) return;
    const bag = new Map();
    [...(inside || []), ...(beforeEnd || []), ...(stillOpen || [])].forEach((row) => {
      if (row?.id) bag.set(row.id, row);
    });
    _att.logs = [...bag.values()];
    _att.calls = calls || [];
    _att.sessions = {};
    (sessions || []).forEach((row) => { if (row?.agent_id) _att.sessions[row.agent_id] = row; });
    _att.camps = {};
    (camps || []).forEach((row) => { if (row?.id) _att.camps[row.id] = row.name || ''; });
    const seen = new Set();
    _att.users = mine
      ? (selfId ? [{ id: selfId, name: currentUser?.name || '', role: currentUser?.role || 'agent' }] : [])
      : (users || []).filter((user) => {
        if (!user?.id || seen.has(user.id) || !ATT_STAFF.has(user.role)) return false;
        seen.add(user.id);
        return true;
      });
    if (mine) _att.agentId = selfId;
    else if (_att.agentId && !_att.users.some((user) => String(user.id) === String(_att.agentId))) _att.agentId = '';
    attPaint();
  } catch (e) {
    if (seq !== _att.seq) return;
    host.innerHTML = `<div class="card"><div class="firm-none">${attEsc(e?.message || '')}</div></div>`;
  }
}
