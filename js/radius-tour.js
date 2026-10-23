const TOUR_GUN = { Mon: 'pzt', Tue: 'sal', Wed: 'car', Thu: 'per', Fri: 'cum', Sat: 'cmt', Sun: 'paz' };
const TOUR_DEFAULTS = {
  aktif: true,
  loopSaniye: 300,
  hedefManuel: false,
  hedefTarih: '',
  secili: '',
  auto: true,
  autoSwitch: true,
  kampanyaOto: true,
  bekleyen: false,
  bekleyenEsik: 3,
  olay: true,
  onay: true,
  veriEsik: 500,
  hazirEsik: 3000,
  terminHedef: true,
  terminGunluk: 20,
  terminOgle: 8,
  terminOgleSaat: '13:00',
  terminIkindi: 15,
  terminIkindiSaat: '15:30',
  yolUyari: true,
  yolDk: 30,
  bosSlotAtla: true,
  ayniPrefix: true,
  selfHeal: true,
  selfHealDeneme: 2,
  zamanlayici: false,
  zamanAktif: '09:55',
  zamanPasif: '18:35',
};

let _tourPlan = null;
let _tourBusy = false;
let _tourWatchSig = '';
let _tourSettings = { ...TOUR_DEFAULTS };
let _tourTab = 'genel';

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

function tourPref() {
  return { ...TOUR_DEFAULTS, ...(_tourSettings || {}) };
}

function tourEffectivePasif() {
  const pref = tourPref();
  if (pref.zamanlayici) {
    const clock = tourClock();
    const on = tourHm(pref.zamanAktif);
    const off = tourHm(pref.zamanPasif);
    if (on != null && off != null) {
      if (on < off) return clock.mins < on || clock.mins >= off;
      return clock.mins >= off && clock.mins < on;
    }
  }
  return !pref.aktif;
}

async function tourLoadSettings() {
  _tourSettings = { ...TOUR_DEFAULTS };
  const firmId = tourFirmId();
  if (!firmId || typeof sb !== 'function') {
    tourPaintSettings();
    return _tourSettings;
  }
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const saved = firms?.[0]?.settings?.tour;
  if (saved && typeof saved === 'object') _tourSettings = { ...TOUR_DEFAULTS, ...saved };
  tourPaintSettings();
  return _tourSettings;
}

async function tourSave(patch) {
  _tourSettings = { ...tourPref(), ...patch };
  tourPaintSettings();
  const firmId = tourFirmId();
  if (!firmId || typeof sb !== 'function') return _tourSettings;
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, tour: { ..._tourSettings } } }),
  });
  return _tourSettings;
}

function tourSetChecked(id, on) {
  const el = document.getElementById(id);
  if (el) el.checked = !!on;
}

function tourPaintSettings() {
  const pref = tourPref();
  const off = document.getElementById('tour-mode-off');
  const on = document.getElementById('tour-mode-on');
  if (off) off.classList.toggle('is-on', tourEffectivePasif());
  if (on) on.classList.toggle('is-on', !tourEffectivePasif());
  const loop = document.getElementById('tour-loop');
  if (loop) loop.value = String(pref.loopSaniye);
  const wait = document.getElementById('tour-wait-n');
  if (wait) wait.value = String(pref.bekleyenEsik);
  const esik = document.getElementById('tour-esik');
  if (esik) esik.value = String(pref.veriEsik);
  const hazir = document.getElementById('tour-hazir');
  if (hazir) hazir.value = String(pref.hazirEsik);
  const yol = document.getElementById('tour-yol-dk');
  if (yol) yol.value = String(pref.yolDk);
  const gunluk = document.getElementById('tour-gunluk');
  if (gunluk) gunluk.value = String(pref.terminGunluk);
  const ogle = document.getElementById('tour-ogle');
  if (ogle) ogle.value = String(pref.terminOgle);
  const ogleSaat = document.getElementById('tour-ogle-saat');
  if (ogleSaat) ogleSaat.value = pref.terminOgleSaat;
  const ikindi = document.getElementById('tour-ikindi');
  if (ikindi) ikindi.value = String(pref.terminIkindi);
  const ikindiSaat = document.getElementById('tour-ikindi-saat');
  if (ikindiSaat) ikindiSaat.value = pref.terminIkindiSaat;
  const heal = document.getElementById('tour-heal-n');
  if (heal) heal.value = String(pref.selfHealDeneme);
  const onAt = document.getElementById('tour-on-at');
  if (onAt) onAt.value = pref.zamanAktif;
  const offAt = document.getElementById('tour-off-at');
  if (offAt) offAt.value = pref.zamanPasif;
  tourSetChecked('tour-auto', pref.auto);
  tourSetChecked('tour-switch', pref.autoSwitch);
  tourSetChecked('tour-oto', pref.kampanyaOto);
  tourSetChecked('tour-wait', pref.bekleyen);
  tourSetChecked('tour-event', pref.olay);
  tourSetChecked('tour-approve', pref.onay);
  tourSetChecked('tour-hedef', pref.terminHedef);
  tourSetChecked('tour-yol', pref.yolUyari);
  tourSetChecked('tour-skip', pref.bosSlotAtla);
  tourSetChecked('tour-prefix', pref.ayniPrefix);
  tourSetChecked('tour-heal', pref.selfHeal);
  tourSetChecked('tour-clock', pref.zamanlayici);
  const day = document.getElementById('tour-day-label');
  if (day) day.textContent = (pref.hedefManuel && pref.hedefTarih) || _tourPlan?.day || '—';
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
  const pref = tourPref();
  const nextDay = tourNextBusiness(clock.ymd);
  let start = nextDay;
  let end = tourAddDays(start, 14);
  if (pref.hedefManuel && /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih)) {
    if (pref.hedefTarih < start) start = pref.hedefTarih;
    if (pref.hedefTarih > end) end = pref.hedefTarih;
  }
  const fromTop = tourAddDays(clock.ymd, -180);
  const load = () => Promise.all([
    sb(`firms?id=eq.${firmId}&select=settings`),
    sb(`campaigns?firm_id=eq.${firmId}&select=id,name&order=name.asc&limit=200`),
    sb(`takvim_slots?firm_id=eq.${firmId}&tarih=gte.${start}&tarih=lte.${end}&gun_kapali=eq.false&select=id,campaign_id,tarih,baslangic_saat,durum,appointment_id&limit=4000`),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${start}T00:00:00&termin_tarih=lte.${end}T23:59:59&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz,termin_tarih&limit=4000`),
    sb(`agent_sessions?firm_id=eq.${firmId}&select=campaign_id,status&limit=400`),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${fromTop}T00:00:00&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz&limit=4000`),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${clock.ymd}T00:00:00&termin_tarih=lte.${clock.ymd}T23:59:59&durum=not.in.(iptal,basarisiz)&select=id&limit=500`),
  ]);
  let firmRows; let camps; let slots; let appts; let sessions; let history; let todayRows;
  const tries = pref.selfHeal ? Math.max(1, Math.min(5, Number(pref.selfHealDeneme) || 1)) : 1;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      [firmRows, camps, slots, appts, sessions, history, todayRows] = await load();
      break;
    } catch (err) {
      if (attempt + 1 >= tries) throw err;
    }
  }
  const mesai = typeof opsNormalizeMesaiPlan === 'function' ? opsNormalizeMesaiPlan(firmRows?.[0]?.settings?.mesai_plan) : null;
  const shift = tourShift(mesai, clock);
  const slotRows = Array.isArray(slots) ? slots : [];
  const days = [...new Set(slotRows.filter((s) => s.durum === 'bos' && !s.appointment_id).map((s) => tourYmd(s.tarih)).filter((d) => d && !tourWeekend(d)))].sort();
  let day = pref.bosSlotAtla ? (days[0] || nextDay) : nextDay;
  if (pref.hedefManuel && /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih)) day = pref.hedefTarih;
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
  let bekleyen = 0;
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    if (session.status === 'ready') bekleyen += 1;
  });
  live.forEach((n, id) => { if (n > activeN) { activeN = n; activeId = id; } });
  const rows = [...byCamp.values()].filter((row) => row.bos > 0 || row.appts.length > 0);
  await Promise.all(rows.map(async (row) => {
    row.pending = await tourCount(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=eq.pending&select=id`).catch(() => 0);
    row.anchor = tourAnchor(row.appts.filter((a) => a.plz), row.slots) || row.top || '';
    if (row.pending >= pref.veriEsik || !row.plzs.size || !pref.auto) return;
    const got = await sb(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=in.(no_answer,voicemail)&or=(attempt_count.lt.2,attempt_count.is.null)&select=id,plz&limit=1000`).catch(() => []);
    row.revertIds = (Array.isArray(got) ? got : []).filter((c) => row.plzs.has(tourPlz(c.plz))).map((c) => c.id).filter(Boolean);
  }));
  rows.sort((a, b) => b.bos - a.bos || tourNo(a.name) - tourNo(b.name) || a.name.localeCompare(b.name));
  const candidates = rows.filter((row) => row.pending > 0 && row.bos > 0);
  const leader = candidates[0] || null;
  const active = rows.find((row) => row.id === activeId);
  let pick = { kind: 'none', id: '' };
  if (!pref.kampanyaOto) pick = { kind: 'manual', id: pref.secili || activeId || '' };
  else if (leader && active && active.pending > 0 && active.bos > 0 && active.bos >= leader.bos) pick = { kind: 'stay', id: active.id };
  else if (leader && pref.autoSwitch) pick = { kind: 'switch', id: leader.id };
  else if (active && active.pending > 0) pick = { kind: 'stay', id: active.id };
  if (pref.bekleyen && pref.autoSwitch && pref.kampanyaOto && leader && bekleyen >= Number(pref.bekleyenEsik || 3)) {
    pick = { kind: 'switch', id: leader.id };
  }
  const today = Array.isArray(todayRows) ? todayRows.length : 0;
  return { firmId, clock, shift, day, rows, pick, activeId, bekleyen, today, manual: !!pref.hedefManuel };
}

function tourLevel(row) {
  const pref = tourPref();
  if (row.pending < pref.veriEsik) return 'critical';
  if (row.pending < pref.hazirEsik) return 'prep';
  return 'enough';
}

function tourRender(plan) {
  const panel = document.getElementById('tour-panel');
  if (!panel) return;
  const locked = plan?.shift?.label === 'break';
  const shiftKey = plan?.shift?.label || 'noplan';
  const pref = tourPref();
  const hedef = pref.terminHedef && plan
    ? tourSay('tour.today', 'Bugün {n}/{g}', { n: plan.today || 0, g: pref.terminGunluk })
    : '';
  const head = `
<p class="tour-note">${tourEsc(tourSay('tour.note', 'Yazma kapalı. Revert ve paket sen basınca olur.'))}${hedef ? ' · ' + tourEsc(hedef) : ''}</p>
${tourEffectivePasif() ? `<p class="tour-note">${tourEsc(tourSay('tour.pasif', 'Pasif. Otomatik tur yok. Veri ekle ve revert elle durur.'))}</p>` : ''}`;
  if (!plan?.firmId) {
    panel.innerHTML = head + `<p class="tour-note">${tourEsc(tourSay('tour.needfirm', 'Firma seç'))}</p>`;
    return;
  }
  const pickRow = plan.rows.find((row) => row.id === plan.pick.id);
  const pickName = pickRow?.name || '';
  const pickLine = plan.pick.kind === 'none'
    ? tourSay(plan.rows.length ? 'tour.nodata' : 'tour.none', plan.rows.length ? 'Kuyrukta veri yok' : 'Boş slotu olan kampanya yok')
    : plan.pick.kind === 'manual'
      ? `${tourSay('tour.manual', 'Seçilen kampanya')} · ${pickName}`
      : `${tourSay(plan.pick.kind === 'stay' ? 'tour.stay' : 'tour.switch', plan.pick.kind)} · ${pickName}`;
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
    await tourLoadSettings();
    _tourPlan = await tourBuild();
    tourRender(_tourPlan);
    tourFillSelects();
    tourArm();
    const sig = (_tourPlan.rows || []).filter((row) => tourLevel(row) === 'critical').map((row) => row.id).join(',');
    if (_tourWatchSig && sig !== _tourWatchSig && typeof toast === 'function') toast(tourSay('tour.critical', 'kritik'), 'warn');
    _tourWatchSig = sig;
  } catch (e) {
    if (typeof toast === 'function') toast(tourSay('tour.err', 'Tur okunamadı'), 'err');
    if (_tourPlan) tourRender(_tourPlan);
  } finally {
    _tourBusy = false;
  }
}

function tourArm() {
  clearInterval(window._tourTimer);
  const pref = tourPref();
  if (tourEffectivePasif() || !pref.olay) return;
  const wait = Math.min(1800, Math.max(60, Number(pref.loopSaniye) || 300)) * 1000;
  window._tourTimer = setInterval(() => {
    const page = document.getElementById('page-tour');
    if (!page?.classList.contains('active') || document.hidden) return;
    void tourRefresh();
  }, wait);
}

function tourTab(name) {
  _tourTab = name || 'genel';
  document.querySelectorAll('.tour-tab').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.tab === _tourTab));
  document.querySelectorAll('.tour-pane').forEach((pane) => pane.classList.toggle('is-on', pane.dataset.pane === _tourTab));
}

async function tourSetMode(aktif) {
  await tourSave({ aktif: !!aktif });
  tourArm();
}

async function tourFlag(key, el) {
  await tourSave({ [key]: !!el.checked });
  if (key === 'olay' || key === 'zamanlayici') tourArm();
  else await tourRefresh();
}

async function tourNum(key, el, min, max) {
  let n = Number(el.value);
  if (!Number.isFinite(n)) n = TOUR_DEFAULTS[key];
  n = Math.max(min, Math.min(max, Math.round(n)));
  el.value = String(n);
  await tourSave({ [key]: n });
  await tourRefresh();
}

async function tourTime(key, el) {
  const value = String(el.value || TOUR_DEFAULTS[key] || '');
  await tourSave({ [key]: value });
  if (key === 'zamanAktif' || key === 'zamanPasif') tourArm();
}

function tourPickLoop(el) {
  tourSave({ loopSaniye: Number(el.value) || 300 }).then(() => tourArm());
}

function tourPickWait(el) {
  tourSave({ bekleyenEsik: Number(el.value) || 3 }).then(() => tourRefresh());
}

function tourPickYol(el) {
  const n = Number(el.value);
  tourSave({ yolDk: [20, 30, 40, 50, 60].includes(n) ? n : 30 }).then(() => tourRefresh());
}

async function tourNudgeDay(delta) {
  const pref = tourPref();
  const base = (pref.hedefManuel && pref.hedefTarih) || _tourPlan?.day || tourNextBusiness(tourClock().ymd);
  let day = tourAddDays(base, delta < 0 ? -1 : 1);
  while (tourWeekend(day)) day = tourAddDays(day, delta < 0 ? -1 : 1);
  await tourSave({ hedefManuel: true, hedefTarih: day });
  await tourRefresh();
}

async function tourDayAuto() {
  await tourSave({ hedefManuel: false, hedefTarih: '' });
  await tourRefresh();
}

function tourFillSelects() {
  const rows = _tourPlan?.rows || [];
  ['tour-camp-pick', 'tour-camp-data'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = id === 'tour-camp-pick' ? (tourPref().secili || sel.value) : sel.value;
    sel.innerHTML = '<option value="">—</option>' + rows.map((row) => `<option value="${tourEsc(row.id)}">${tourEsc(row.name)}</option>`).join('');
    if (cur && [...sel.options].some((opt) => opt.value === cur)) sel.value = cur;
  });
  const label = document.getElementById('tour-day-label');
  if (label && _tourPlan?.day) label.textContent = _tourPlan.day + (_tourPlan.manual ? '' : '');
}

async function tourKeepCamp() {
  const id = document.getElementById('tour-camp-pick')?.value || '';
  if (!id) return;
  await tourSave({ secili: id, kampanyaOto: false });
  await tourRefresh();
}

function tourAddData() {
  const id = document.getElementById('tour-camp-data')?.value || '';
  if (!id) return;
  tourPackage(id);
}

function tourPrepDay() {
  const n = (_tourPlan?.rows || []).filter((row) => row.pending < tourPref().hazirEsik).length;
  if (typeof toast === 'function') toast(tourSay('tour.prepok', '{n} kampanya güne hazır eşiğinin altında', { n }), n ? 'warn' : 'ok');
  void tourRefresh();
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
  if (tourPref().onay) {
    const ok = typeof mbConfirm === 'function' ? await mbConfirm(tourSay('tour.confirm', '{n} kişi tekrar aransın? Yarınki randevu kodları.', { n }), row.name) : false;
    if (!ok) return;
  }
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
        allowOtherPrefix: !tourPref().ayniPrefix,
        pairMaxMin: tourPref().yolUyari ? tourPref().yolDk : 0,
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

