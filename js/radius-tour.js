const TOUR_CRITICAL = 500;
const TOUR_PREP = 3000;
const TOUR_WATCH_MS = 300000;
const TOUR_GUN = { Mon: 'pzt', Tue: 'sal', Wed: 'car', Thu: 'per', Fri: 'cum', Sat: 'cmt', Sun: 'paz' };

let _tourPlan = null;
let _tourBusy = false;
let _tourWatchSig = '';

function tourSay(key, fb, vars) {
  const raw = typeof t === 'function' ? t(key) : fb;
  let text = !raw || raw === key ? fb : raw;
  if (vars) Object.entries(vars).forEach(([k, v]) => { text = text.split('{' + k + '}').join(String(v)); });
  return text;
}

function tourEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function tourFirmId() {
  const active = typeof getActiveFirmId === 'function' ? (getActiveFirmId() || '') : '';
  if (active) return active;
  if (typeof _impersonation !== 'undefined' && _impersonation?.firm_id) return _impersonation.firm_id;
  if (typeof currentUser !== 'undefined' && currentUser?.firm_id && currentUser.role !== 'super_admin') return currentUser.firm_id;
  return '';
}

function tourClock() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    gun: TOUR_GUN[get('weekday')] || 'pzt',
    mins: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function tourAddDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function tourWeekend(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function tourNextBusiness(ymd) {
  let day = tourAddDays(ymd, 1);
  while (tourWeekend(day)) day = tourAddDays(day, 1);
  return day;
}

function tourBerlinMins(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function tourHm(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function tourYmd(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function tourPlz(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return '';
  return digits.padStart(5, '0').slice(-5);
}

function tourNo(name) {
  const match = String(name || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 99999;
}

function tourShift(plan, clock) {
  if (!plan) return { label: 'noplan' };
  const row = plan[clock.gun];
  if (!row || row.off) return { label: 'off' };
  const start = tourHm(row.start);
  const end = tourHm(row.end);
  if (start == null || end == null || clock.mins < start || clock.mins >= end) return { label: 'out' };
  for (const item of row.breaks || []) {
    const a = tourHm(item.start);
    const z = tourHm(item.end);
    if (a == null || z == null || clock.mins < a || clock.mins >= z) continue;
    return { label: z - clock.mins <= 5 ? 'breaksoon' : 'break', breakEnd: item.end };
  }
  return { label: 'in' };
}

function tourAnchor(appts, slots) {
  if (!appts.length) return '';
  const slotMins = slots.map((s) => tourHm(s.time)).filter((n) => n != null);
  if (!slotMins.length) return appts[0].plz;
  let best = appts[0];
  let bestGap = Infinity;
  appts.forEach((appt) => {
    if (appt.mins == null) return;
    const gap = Math.min(...slotMins.map((s) => Math.abs(s - appt.mins)));
    if (gap < bestGap) {
      bestGap = gap;
      best = appt;
    }
  });
  return best.plz;
}

async function tourCount(path) {
  if (typeof mbHeadCount === 'function') return mbHeadCount(path);
  const rows = await sb(`${path}&limit=1`);
  return Array.isArray(rows) ? rows.length : 0;
}

async function tourBuild() {
  const firmId = tourFirmId();
  const clock = tourClock();
  if (!firmId || typeof sb !== 'function') {
    return { firmId: '', clock, shift: { label: 'noplan' }, day: '', rows: [], pick: { kind: 'none' } };
  }
  const start = tourNextBusiness(clock.ymd);
  const end = tourAddDays(start, 14);
  const fromTop = tourAddDays(clock.ymd, -180);
  const [firmRows, camps, slots, appts, sessions, history] = await Promise.all([
    sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []),
    sb(`campaigns?firm_id=eq.${firmId}&select=id,name&order=name.asc&limit=200`).catch(() => []),
    sb(`takvim_slots?firm_id=eq.${firmId}&tarih=gte.${start}&tarih=lte.${end}&gun_kapali=eq.false&select=id,campaign_id,tarih,baslangic_saat,durum,appointment_id&limit=4000`).catch(() => []),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${start}T00:00:00&termin_tarih=lte.${end}T23:59:59&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz,termin_tarih&limit=4000`).catch(() => []),
    sb(`agent_sessions?firm_id=eq.${firmId}&select=campaign_id,status&limit=400`).catch(() => []),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${fromTop}T00:00:00&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz&limit=4000`).catch(() => []),
  ]);
  const mesai = typeof opsNormalizeMesaiPlan === 'function' ? opsNormalizeMesaiPlan(firmRows?.[0]?.settings?.mesai_plan) : null;
  const shift = tourShift(mesai, clock);
  const slotRows = Array.isArray(slots) ? slots : [];
  const days = [...new Set(slotRows.filter((s) => s.durum === 'bos' && !s.appointment_id).map((s) => tourYmd(s.tarih)).filter((d) => d && !tourWeekend(d)))].sort();
  const day = days[0] || start;
  const names = new Map((Array.isArray(camps) ? camps : []).map((c) => [c.id, c.name || '']));
  const byCamp = new Map();
  const ensure = (id) => {
    if (!id || !names.has(id)) return null;
    if (!byCamp.has(id)) byCamp.set(id, { id, name: names.get(id), bos: 0, slots: [], appts: [], plzs: new Set(), pending: 0, revertIds: [], anchor: '', top: '' });
    return byCamp.get(id);
  };
  slotRows.forEach((slot) => {
    if (tourYmd(slot.tarih) !== day || slot.durum !== 'bos' || slot.appointment_id) return;
    const row = ensure(slot.campaign_id);
    if (!row) return;
    row.bos += 1;
    row.slots.push({ time: slot.baslangic_saat || '' });
  });
  (Array.isArray(appts) ? appts : []).forEach((appt) => {
    if (tourYmd(appt.termin_tarih) !== day) return;
    const row = ensure(appt.campaign_id);
    if (!row) return;
    const plz = tourPlz(appt.plz);
    const mins = tourBerlinMins(appt.termin_tarih);
    if (plz) row.plzs.add(plz);
    row.appts.push({ plz, mins });
  });
  const topCount = new Map();
  (Array.isArray(history) ? history : []).forEach((appt) => {
    const plz = tourPlz(appt.plz);
    if (!appt.campaign_id || !plz) return;
    const key = `${appt.campaign_id}|${plz}`;
    topCount.set(key, (topCount.get(key) || 0) + 1);
  });
  topCount.forEach((count, key) => {
    const [id, plz] = key.split('|');
    const row = byCamp.get(id);
    if (!row || count <= (row.topCount || 0)) return;
    row.top = plz;
    row.topCount = count;
  });
  const live = new Map();
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    if (!session.campaign_id || !['ready', 'on_call', 'wrapping'].includes(session.status)) return;
    live.set(session.campaign_id, (live.get(session.campaign_id) || 0) + 1);
  });
  let activeId = '';
  let activeN = 0;
  live.forEach((n, id) => { if (n > activeN) { activeN = n; activeId = id; } });
  const rows = [...byCamp.values()].filter((row) => row.bos > 0 || row.appts.length > 0);
  await Promise.all(rows.map(async (row) => {
    row.pending = await tourCount(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=eq.pending&select=id`).catch(() => 0);
    row.anchor = tourAnchor(row.appts.filter((a) => a.plz), row.slots) || row.top || '';
    if (row.pending >= TOUR_CRITICAL || !row.plzs.size) return;
    const got = await sb(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=in.(no_answer,voicemail)&or=(attempt_count.lt.2,attempt_count.is.null)&select=id,plz&limit=1000`).catch(() => []);
    row.revertIds = (Array.isArray(got) ? got : []).filter((c) => row.plzs.has(tourPlz(c.plz))).map((c) => c.id).filter(Boolean);
  }));
  rows.sort((a, b) => b.bos - a.bos || tourNo(a.name) - tourNo(b.name) || a.name.localeCompare(b.name));
  const candidates = rows.filter((row) => row.pending > 0 && row.bos > 0);
  const leader = candidates[0] || null;
  const active = rows.find((row) => row.id === activeId);
  let pick = { kind: 'none', id: '' };
  if (leader && active && active.pending > 0 && active.bos > 0 && active.bos >= leader.bos) pick = { kind: 'stay', id: active.id };
  else if (leader) pick = { kind: 'switch', id: leader.id };
  return { firmId, clock, shift, day, rows, pick, activeId };
}

function tourLevel(row) {
  if (row.pending < TOUR_CRITICAL) return 'critical';
  if (row.pending < TOUR_PREP) return 'prep';
  return 'enough';
}

function tourRender(plan) {
  const panel = document.getElementById('tour-panel');
  if (!panel) return;
  const locked = plan?.shift?.label === 'break';
  const shiftKey = plan?.shift?.label || 'noplan';
  const head = `
<p class="tour-note">${tourEsc(tourSay('tour.note', 'Yazma kapalı. Revert ve paket sen basınca olur.'))}</p>
<label class="tour-note" style="display:flex;gap:8px;align-items:center;">
  <input type="checkbox" id="tour-watch" ${localStorage.getItem('mb-radius-tour-watch') === '1' ? 'checked' : ''} onchange="tourWatch(this.checked)">
  ${tourEsc(tourSay('tour.watch', 'İzle, yazma'))}
</label>`;
  if (!plan?.firmId) {
    panel.innerHTML = head + `<p class="tour-note">${tourEsc(tourSay('tour.needfirm', 'Firma seç'))}</p>`;
    return;
  }
  const pickRow = plan.rows.find((row) => row.id === plan.pick.id);
  const pickLine = plan.pick.kind === 'none'
    ? tourSay(plan.rows.length ? 'tour.nodata' : 'tour.none', plan.rows.length ? 'Kuyrukta veri yok' : 'Boş slotu olan kampanya yok')
    : `${tourSay(plan.pick.kind === 'stay' ? 'tour.stay' : 'tour.switch', plan.pick.kind)} · ${pickRow?.name || ''}`;
  const cards = plan.rows.length ? plan.rows.map((row) => {
    const level = tourLevel(row);
    const tag = tourSay('tour.' + level, level);
    const cls = level === 'critical' ? 'is-bad' : level === 'prep' ? 'is-mid' : 'is-ok';
    const revert = row.revertIds.length && !locked
      ? `<button type="button" class="btn btn-ghost btn-sm" onclick="tourRevert('${row.id}')">${tourEsc(tourSay('tour.revert', '{n} kişiyi kuyruğa al', { n: row.revertIds.length }))}</button>`
      : '';
    const pack = row.anchor && row.bos > 0 && level !== 'enough' && !locked
      ? `<button type="button" class="btn btn-primary btn-sm" onclick="tourPackage('${row.id}')">${tourEsc(tourSay('tour.package', 'Paketi aç'))}</button>`
      : '';
    return `<div class="tour-row">
      <b>${tourEsc(row.name)}</b><span class="tour-tag ${cls}">${tourEsc(tag)}</span>
      <div class="tour-meta">${row.pending} ${tourEsc(tourSay('tour.pending', 'bekliyor'))} · ${row.bos} ${tourEsc(tourSay('tour.slots', 'boş'))}${row.anchor ? ' · ' + tourEsc(tourSay('tour.anchor', 'referans')) + ' ' + tourEsc(row.anchor) : ''}</div>
      <div class="tour-actions">${revert}${pack}</div>
    </div>`;
  }).join('') : '';
  const list = cards
    ? `<div class="tour-list">${cards}</div>`
    : `<p class="tour-note">${tourEsc(tourSay('tour.none', 'Boş slotu olan kampanya yok'))}</p>`;
  panel.innerHTML = `${head}
<p class="tour-meta">${tourEsc(tourSay('tour.day', 'Hedef gün'))}: <b>${tourEsc(plan.day)}</b> · ${tourEsc(tourSay('tour.' + shiftKey, shiftKey))}${plan.shift.breakEnd ? ' ' + tourEsc(plan.shift.breakEnd) : ''}</p>
<p class="tour-meta">${tourEsc(tourSay('tour.pick', 'Çalışılacak'))}: ${tourEsc(pickLine)}</p>
${locked ? `<p class="tour-note">${tourEsc(tourSay('tour.blocked', 'Molada işlem yok'))}</p>` : ''}
${list}`;
}

async function tourRefresh() {
  if (_tourBusy) return;
  const panel = document.getElementById('tour-panel');
  if (panel) panel.innerHTML = `<p class="tour-note">${tourEsc(tourSay('tour.loading', 'Kayıtlar okunuyor'))}</p>`;
  _tourBusy = true;
  try {
    _tourPlan = await tourBuild();
    tourRender(_tourPlan);
    const sig = _tourPlan.rows.filter((row) => tourLevel(row) === 'critical').map((row) => row.id).join(',');
    if (_tourWatchSig && sig !== _tourWatchSig && typeof toast === 'function') toast(tourSay('tour.critical', 'kritik'), 'warn');
    _tourWatchSig = sig;
  } catch (e) {
    if (typeof toast === 'function') toast(tourSay('tour.err', 'Tur okunamadı'), 'err');
    if (_tourPlan) tourRender(_tourPlan);
  } finally {
    _tourBusy = false;
  }
}

function tourWatch(on) {
  localStorage.setItem('mb-radius-tour-watch', on ? '1' : '0');
  clearInterval(window._tourTimer);
  if (!on) return;
  window._tourTimer = setInterval(() => {
    const page = document.getElementById('page-tour');
    if (!page?.classList.contains('active') || document.hidden) return;
    void tourRefresh();
  }, TOUR_WATCH_MS);
}

async function tourRevert(campaignId) {
  const plan = _tourPlan;
  const row = plan?.rows?.find((item) => item.id === campaignId);
  if (!row || plan.shift?.label === 'break') {
    if (typeof toast === 'function') toast(tourSay('tour.blocked', 'Molada işlem yok'), 'warn');
    return;
  }
  const n = row.revertIds.length;
  if (!n) {
    if (typeof toast === 'function') toast(tourSay('tour.revert0', 'Uygun kişi kalmadı'), 'warn');
    return;
  }
  const ok = typeof mbConfirm === 'function' ? await mbConfirm(tourSay('tour.confirm', '{n} kişi tekrar aransın? Yarınki randevu kodları.', { n }), row.name) : false;
  if (!ok) return;
  let moved = 0;
  for (let i = 0; i < row.revertIds.length; i += 60) {
    const chunk = row.revertIds.slice(i, i + 60);
    const live = await sb(`contacts?id=in.(${chunk.join(',')})&status=in.(no_answer,voicemail)&select=id`).catch(() => []);
    const ids = (Array.isArray(live) ? live : []).map((c) => c.id).filter(Boolean);
    if (!ids.length) continue;
    await sb(`contacts?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'pending', last_called_at: null }),
    });
    moved += ids.length;
  }
  if (typeof logAuditEvent === 'function') {
    void logAuditEvent('radius_tour_revert', 'campaign', campaignId, { moved, day: plan.day, anchor: row.anchor });
  }
  if (typeof toast === 'function') toast(moved ? tourSay('tour.reverted', '{n} kişi kuyruğa alındı', { n: moved }) : tourSay('tour.revert0', 'Uygun kişi kalmadı'), moved ? 'ok' : 'warn');
  await tourRefresh();
}

function tourPackage(campaignId) {
  const plan = _tourPlan;
  const row = plan?.rows?.find((item) => item.id === campaignId);
  if (!row || plan.shift?.label === 'break') {
    if (typeof toast === 'function') toast(tourSay('tour.blocked', 'Molada işlem yok'), 'warn');
    return;
  }
  if (!row.anchor) {
    if (typeof toast === 'function') toast(tourSay('tour.noanchor', 'Bu kampanyada referans kod yok'), 'warn');
    return;
  }
  if (typeof navigate === 'function') navigate('geocon');
  const frame = document.getElementById('geocon-frame');
  if (!frame) return;
  const send = () => {
    try {
      frame.contentWindow.postMessage({
        type: 'mb-geocon-tour',
        campaignId: row.id,
        campaignName: row.name,
        anchorPlz: row.anchor,
      }, window.location.origin);
    } catch (_) {}
  };
  const kick = () => setTimeout(send, 500);
  if (frame.dataset.loaded === '1' && frame.src && frame.src.indexOf('geocon.html') !== -1) kick();
  else {
    frame.addEventListener('load', kick, { once: true });
    if (typeof loadGeoconPage === 'function') loadGeoconPage();
  }
  if (typeof toast === 'function') toast(tourSay('tour.sent', 'Paket haritada açıldı. İşaretleyip aktar.'), 'ok');
}

if (localStorage.getItem('mb-radius-tour-watch') === '1') tourWatch(true);
