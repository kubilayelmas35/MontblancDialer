// ─────────────────────────────────────────────
// İZİN & GEÇ KALMA — talepler, kurallar, özetler
// ─────────────────────────────────────────────

function _leaveEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLeaveAdmin() {
  return mbIsFirmAdmin();
}

function _leaveFirmId() {
  return getActiveFirmId() || currentUser?.firm_id || null;
}

function defaultHrSettings() {
  return {
    annual_leave_days_default: 14,
    count_sunday: false,
    count_saturday: true,
    saturday_bridge: true,
    half_day_enabled: true,
    prorata: true,
    prorata_mode: 'day_fraction',
    deduct_currency: 'EUR',
    unpaid_full_amount: 40,
    unpaid_half_amount: 20,
    late_threshold: 3,
    late_to_saturday: true,
    sick_uses_balance: false,
    leave_affects_salary: true,
    leave_percent_per_day: 0,
    late_affects_salary: false,
    late_penalty_per_occurrence: 0,
  };
}

function mergeHr(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const hasNew = src.deduct_currency != null
    || src.saturday_bridge != null
    || src.count_sunday != null
    || src.unpaid_full_amount != null;
  const hasOld = src.annual_leave_days_default != null
    || src.leave_affects_salary != null
    || src.late_penalty_per_occurrence != null
    || src.leave_percent_per_day != null;
  if (!hasNew && hasOld) {
    return {
      ...defaultHrSettings(),
      ...src,
      count_sunday: true,
      count_saturday: true,
      saturday_bridge: false,
      half_day_enabled: true,
      prorata: false,
      prorata_mode: 'day_fraction',
      deduct_currency: 'NONE',
      unpaid_full_amount: 0,
      unpaid_half_amount: 0,
      late_threshold: 0,
      late_to_saturday: false,
      sick_uses_balance: false,
    };
  }
  return { ...defaultHrSettings(), ...src };
}

function leaveAddIso(iso, n) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (p.length < 3 || !p[0]) return '';
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function leaveDow(iso) {
  const p = String(iso || '').slice(0, 10).split('-').map(Number);
  if (p.length < 3 || !p[0]) return 0;
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

function leaveEachDay(from, to) {
  const out = [];
  if (!from || !to || to < from) return out;
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = leaveAddIso(cur, 1);
    guard += 1;
  }
  return out;
}

function leaveDayCounts(iso, rules) {
  const dow = leaveDow(iso);
  if (dow === 0) return !!rules.count_sunday;
  if (dow === 6) return rules.count_saturday !== false;
  return true;
}

function leaveRoundDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const whole = Math.floor(n + 1e-9);
  const tenth = Math.floor((n - whole) * 10 + 1e-9);
  if (tenth <= 2) return whole;
  if (tenth <= 7) return whole + 0.5;
  return whole + 1;
}

function leaveYearEntitlement(hireIso, year, annual, rules) {
  const base = Number(annual) || 0;
  if (!rules?.prorata || !hireIso) return base;
  const y = Number(String(hireIso).slice(0, 4));
  const m = Number(String(hireIso).slice(5, 7)) - 1;
  const day = Number(String(hireIso).slice(8, 10));
  if (!y || m < 0) return base;
  if (y < year) return base;
  if (y > year) return 0;
  if (rules.prorata_mode === 'full_month') {
    return leaveRoundDays(base * (12 - m) / 12);
  }
  const monthly = base / 12;
  const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const frac = day <= 1 ? 1 : ((last - day + 1) / 30);
  return leaveRoundDays((frac + (11 - m)) * monthly);
}

function leaveRequiredSaturdays(selected, existingSet, rules) {
  if (!rules?.saturday_bridge || rules.count_saturday === false) return [];
  const set = new Set([...(existingSet || []), ...selected]);
  const candidates = new Set();
  selected.forEach((iso) => {
    const dow = leaveDow(iso);
    if (dow === 0) return;
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    candidates.add(leaveAddIso(iso, mondayOffset + 5));
  });
  const extra = [];
  candidates.forEach((sat) => {
    if (!sat || set.has(sat) || leaveDow(sat) !== 6) return;
    const fri = leaveAddIso(sat, -1);
    const nextMon = leaveAddIso(sat, 2);
    const monday = leaveAddIso(sat, -5);
    const weekdays = [0, 1, 2, 3, 4].map((i) => leaveAddIso(monday, i));
    const bridge = set.has(fri) && set.has(nextMon);
    const fullWeek = weekdays.every((k) => set.has(k));
    if (bridge || fullWeek) extra.push(sat);
  });
  extra.sort();
  return extra;
}

function leaveMoney(days, unit, rules) {
  if (!rules || rules.deduct_currency === 'NONE') return 0;
  const full = Number(rules.unpaid_full_amount) || 0;
  const half = Number(rules.unpaid_half_amount) || 0;
  if (unit === 0.5) return days * half;
  return days * full;
}

function leaveKindLabel(k) {
  const m = { annual: 'Yıllık', sick: 'Hastalık', unpaid: 'Ücretsiz', other: 'Diğer' };
  return m[k] || k || '—';
}

function leaveStatusLabel(s) {
  const m = { pending: 'Bekliyor', approved: 'Onaylı', rejected: 'Red' };
  return m[s] || s;
}

function calendarDaysInclusive(fromStr, toStr) {
  const a = new Date(fromStr + 'T12:00:00');
  const b = new Date(toStr + 'T12:00:00');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function currentYear() {
  return new Date().getFullYear();
}

function yearBoundsQuery(y) {
  return { gte: `${y}-01-01`, lte: `${y}-12-31` };
}

async function _userMapByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return {};
  try {
    const rows = await sb(`users?id=in.(${uniq.join(',')})&select=id,name,email`).catch(() => []);
    const m = {};
    for (const u of rows || []) m[u.id] = u;
    return m;
  } catch (e) {
    return {};
  }
}

async function getHrSettings(fid) {
  const rows = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  const hr = rows?.[0]?.settings?.hr;
  return mergeHr(hr);
}

async function loadLeavePage() {
  const fid = _leaveFirmId();
  const noFirmEl = document.getElementById('leave-no-firm');
  const mainEl = document.getElementById('leave-main');
  const sub = document.getElementById('leave-sub');
  renderFirmSelector('leave-firm-selector', loadLeavePage);

  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  if (!_leaveCal) {
    const p = String(today).split('-').map(Number);
    _leaveCal = { y: p[0], m: p[1] };
  }
  leaveRefreshPick();
  const ld = document.getElementById('late-date');
  if (ld && !ld.value) ld.value = today;

  if (isSuperAdmin() && !fid) {
    if (noFirmEl) noFirmEl.style.display = '';
    if (mainEl) mainEl.style.display = 'none';
    if (sub) sub.textContent = t('leave.sub.pick');
    return;
  }
  if (noFirmEl) noFirmEl.style.display = 'none';
  if (mainEl) {
    mainEl.style.display = 'flex';
    mainEl.style.flexDirection = 'column';
  }
  if (sub) sub.textContent = isLeaveAdmin() ? t('leave.sub.admin') : t('leave.sub.agent');

  const adm = document.getElementById('leave-admin-settings');
  const admLate = document.getElementById('leave-admin-late');
  const admEnt = document.getElementById('leave-admin-ent');
  const admPending = document.getElementById('leave-admin-pending');
  const admAll = document.getElementById('leave-admin-all');
  if (adm) adm.style.display = isLeaveAdmin() ? '' : 'none';
  if (admLate) admLate.style.display = isLeaveAdmin() ? '' : 'none';
  if (admEnt) admEnt.style.display = isLeaveAdmin() ? '' : 'none';
  if (admPending) admPending.style.display = isLeaveAdmin() ? '' : 'none';
  if (admAll) admAll.style.display = isLeaveAdmin() ? '' : 'none';

  await fillHrSettingsForm(fid);
  await refreshLeaveStats(fid);
  await loadMyLeaveRequests();
  await loadAdminLeaveTables(fid);
  await loadLateAdminTable(fid);
  await loadEntitlementsTable(fid);
  await fillLateUserSelect(fid);
}

function _leaveSetChk(id, on) {
  const el = document.getElementById(id);
  if (el) el.checked = !!on;
}

function _leaveSetVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v == null ? '' : String(v);
}

async function fillHrSettingsForm(fid) {
  if (!isLeaveAdmin() || !fid) return;
  const h = await getHrSettings(fid);
  _leaveSetVal('hr-annual-days', h.annual_leave_days_default);
  _leaveSetChk('hr-count-sunday', h.count_sunday);
  _leaveSetChk('hr-count-saturday', h.count_saturday);
  _leaveSetChk('hr-saturday-bridge', h.saturday_bridge);
  _leaveSetChk('hr-half-day', h.half_day_enabled);
  _leaveSetChk('hr-prorata', h.prorata);
  _leaveSetVal('hr-prorata-mode', h.prorata_mode || 'day_fraction');
  _leaveSetVal('hr-deduct-currency', h.deduct_currency || 'NONE');
  _leaveSetVal('hr-unpaid-full', h.unpaid_full_amount);
  _leaveSetVal('hr-unpaid-half', h.unpaid_half_amount);
  _leaveSetVal('hr-late-threshold', h.late_threshold);
  _leaveSetChk('hr-late-saturday', h.late_to_saturday);
  _leaveSetChk('hr-sick-balance', h.sick_uses_balance);
  const dur = document.getElementById('lr-duration');
  if (dur) dur.style.display = h.half_day_enabled ? '' : 'none';
}

function _leaveReadHrForm() {
  const currency = document.getElementById('hr-deduct-currency')?.value || 'NONE';
  const full = Number(document.getElementById('hr-unpaid-full')?.value) || 0;
  const half = Number(document.getElementById('hr-unpaid-half')?.value) || 0;
  const lateN = Number(document.getElementById('hr-late-threshold')?.value);
  return mergeHr({
    annual_leave_days_default: Number(document.getElementById('hr-annual-days')?.value) || 0,
    count_sunday: !!document.getElementById('hr-count-sunday')?.checked,
    count_saturday: !!document.getElementById('hr-count-saturday')?.checked,
    saturday_bridge: !!document.getElementById('hr-saturday-bridge')?.checked,
    half_day_enabled: !!document.getElementById('hr-half-day')?.checked,
    prorata: !!document.getElementById('hr-prorata')?.checked,
    prorata_mode: document.getElementById('hr-prorata-mode')?.value || 'day_fraction',
    deduct_currency: currency,
    unpaid_full_amount: full,
    unpaid_half_amount: half,
    late_threshold: Number.isFinite(lateN) ? lateN : 0,
    late_to_saturday: !!document.getElementById('hr-late-saturday')?.checked,
    sick_uses_balance: !!document.getElementById('hr-sick-balance')?.checked,
    leave_affects_salary: currency !== 'NONE' && (full > 0 || half > 0),
    leave_percent_per_day: 0,
    late_affects_salary: currency !== 'NONE' && !!document.getElementById('hr-late-saturday')?.checked,
    late_penalty_per_occurrence: full,
  });
}

async function saveHrSettings() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = { ...(firms?.[0]?.settings || {}) };
    settings.hr = _leaveReadHrForm();
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    toast('İK kuralları kaydedildi', 'ok');
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

let _leaveSnap = null;
let _leavePick = new Set();
let _leaveCal = null;
let _leaveMarks = { paid: new Set(), unpaid: new Set(), other: new Set(), late: new Set() };
let _leaveMyTab = 'pending';
let _leaveFor = null;
let _leaveMyRows = [];

function leaveDe() {
  return typeof currentLang !== 'undefined' && currentLang === 'de';
}

const LEAVE_MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const LEAVE_MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function leaveFmtDay(iso) {
  const p = String(iso || '').slice(0, 10).split('-');
  if (p.length < 3) return iso || '';
  return `${p[2]}.${p[1]}`;
}

function leaveActiveContext() {
  if (_leaveFor && _leaveFor.uid && _leaveFor.uid !== currentUser?.id) return _leaveFor;
  return _leaveSnap;
}

function leaveUsesBalance(kind, rules) {
  if (kind === 'unpaid') return false;
  if (kind === 'sick') return !!rules.sick_uses_balance;
  return true;
}

function leaveActiveRows(rows) {
  return (rows || []).filter((r) => r.status === 'pending' || r.status === 'approved');
}

function leaveDatesOfRow(row) {
  return leaveEachDay(String(row.date_from || '').slice(0, 10), String(row.date_to || '').slice(0, 10));
}

function leaveLateSaturdayDays(lates, rules) {
  if (!rules.late_to_saturday || !(Number(rules.late_threshold) > 0)) return 0;
  const byMonth = {};
  (lates || []).forEach((row) => {
    const key = String(row.day_date || '').slice(0, 7);
    if (!key) return;
    byMonth[key] = (byMonth[key] || 0) + 1;
  });
  const step = Number(rules.late_threshold);
  return Object.values(byMonth).reduce((sum, n) => sum + Math.floor(n / step), 0);
}

function leavePlanDays(selected, kind, duration, rules, remaining, existingSet) {
  const picked = [...new Set(selected || [])].filter(Boolean).sort();
  const span = picked.filter((iso) => leaveDayCounts(iso, rules) && !(existingSet && existingSet.has(iso)));
  const forced = leaveRequiredSaturdays(span, existingSet, rules);
  const days = span.concat(forced.filter((d) => !span.includes(d))).sort();
  const unit = duration === 'half' && rules.half_day_enabled ? 0.5 : 1;
  const forcedSet = new Set(forced);
  let adding = 0;
  days.forEach((iso) => {
    adding += forcedSet.has(iso) ? 1 : unit;
  });
  const uses = leaveUsesBalance(kind, rules);
  let paidLeft = uses ? Math.max(0, Number(remaining) || 0) : 0;
  let paidUnits = 0;
  let unpaidUnits = 0;
  let unpaidMoney = 0;
  const fullAmt = Number(rules.unpaid_full_amount) || 0;
  const halfAmt = Number(rules.unpaid_half_amount) || 0;
  const charge = uses || kind === 'unpaid';
  const dayUnits = [];
  days.forEach((iso) => {
    const u = forcedSet.has(iso) ? 1 : unit;
    if (uses && paidLeft + 0.001 >= u) {
      paidLeft -= u;
      paidUnits += u;
      dayUnits.push({ iso, unit: u, bucket: 'paid' });
      return;
    }
    unpaidUnits += u;
    if (charge && rules?.deduct_currency !== 'NONE' && u >= 0.999) unpaidMoney += fullAmt;
    else if (charge && rules?.deduct_currency !== 'NONE' && u >= 0.499) unpaidMoney += halfAmt;
    dayUnits.push({ iso, unit: u, bucket: uses ? 'unpaid' : 'plain' });
  });
  return { days, forced, unit, adding, paidUnits, unpaidUnits, unpaidMoney, uses, dayUnits };
}

function leavePlan(from, to, kind, duration, rules, remaining, existingSet) {
  return leavePlanDays(leaveEachDay(from, to), kind, duration, rules, remaining, existingSet);
}

function leaveMoneyLabel(amount, rules) {
  if (!rules || rules.deduct_currency === 'NONE') return '';
  const n = Math.round(Number(amount) * 100) / 100;
  if (!n) return '';
  const cur = rules.deduct_currency === 'TRY' ? 'TL' : rules.deduct_currency;
  return `${n} ${cur}`;
}

async function refreshLeaveStats(fid) {
  const uid = currentUser?.id;
  const y = currentYear();
  const b = yearBoundsQuery(y);
  if (!fid || !uid) return;

  let extraDays = 0;
  let lateCount = 0;
  let lateMins = 0;
  let rows = [];
  let lates = [];
  let hireIso = '';

  try {
    rows = (await sb(
      `leave_requests?user_id=eq.${uid}&date_from=lte.${b.lte}&date_to=gte.${b.gte}&select=days_used,date_from,date_to,kind,status`
    ).catch(() => [])) || [];
    const ent = await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}&select=extra_days_granted`).catch(() => []);
    extraDays = Number(ent?.[0]?.extra_days_granted) || 0;
    lates = (await sb(
      `late_arrivals?user_id=eq.${uid}&day_date=gte.${b.gte}&day_date=lte.${b.lte}&select=minutes_late,day_date`
    ).catch(() => [])) || [];
    for (const L of lates) {
      lateCount += 1;
      lateMins += Number(L.minutes_late) || 0;
    }
    const me = await sb(`users?id=eq.${uid}&select=created_at`).catch(() => []);
    hireIso = String(me?.[0]?.created_at || '').slice(0, 10);
  } catch (e) {
    console.warn('leave stats', e);
  }

  const hr = await getHrSettings(fid);
  const active = leaveActiveRows(rows);
  let paidUsed = 0;
  let unpaidUsed = 0;
  const existing = new Set();
  active.forEach((r) => {
    const n = Number(r.days_used) || 0;
    if (r.kind === 'unpaid' || (r.kind === 'sick' && !hr.sick_uses_balance)) unpaidUsed += r.kind === 'unpaid' ? n : 0;
    else paidUsed += n;
    if (r.kind !== 'unpaid') leaveDatesOfRow(r).forEach((d) => existing.add(d));
  });
  const earnedBase = leaveYearEntitlement(hireIso, y, hr.annual_leave_days_default, hr);
  const earned = earnedBase + extraDays;
  const lateDays = leaveLateSaturdayDays(lates, hr);
  const balanceAfterLeave = Math.max(0, earned - paidUsed);
  const latePaid = Math.min(lateDays, balanceAfterLeave);
  const lateUnpaid = Math.max(0, lateDays - latePaid);
  const remaining = Math.max(0, earned - paidUsed - lateDays);
  const unpaidMoney = leaveMoney(unpaidUsed, 1, hr) + leaveMoney(lateUnpaid, 1, hr);

  _leaveSnap = { hr, remaining, existing, earned, paidUsed, unpaidUsed, lateDays, ownRows: rows };

  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  const num = (v) => String(Math.round(Number(v) * 100) / 100);
  setTxt('leave-stat-used', num(paidUsed));
  setTxt('leave-stat-extra', num(earned));
  setTxt('leave-stat-remaining', num(remaining));
  setTxt('leave-stat-late-n', String(lateCount));
  setTxt('leave-stat-late-m', String(lateMins));

  const hint = document.getElementById('leave-salary-hint');
  if (hint) {
    const de = typeof currentLang !== 'undefined' && currentLang === 'de';
    const money = leaveMoneyLabel(unpaidMoney, hr);
    const bits = [];
    bits.push(de
      ? `Anspruch ${num(earned)} · bezahlt ${num(paidUsed)} · unbezahlt ${num(unpaidUsed)}`
      : `Hak ${num(earned)} · ücretli kullanılan ${num(paidUsed)} · ücretsiz ${num(unpaidUsed)}`);
    if (hr.saturday_bridge) bits.push(de ? 'Samstag nach Freitag ist Pflicht, wenn zwei Wochenenden verbunden werden.' : 'İki tatil birleşince Cuma’dan sonraki Cumartesi zorunlu.');
    if (!hr.count_sunday) bits.push(de ? 'Sonntag zählt nicht.' : 'Pazar sayılmaz.');
    if (hr.late_to_saturday && Number(hr.late_threshold) > 0) {
      bits.push(de
        ? `${hr.late_threshold} Verspätungen im Monat = 1 Samstag (${num(lateDays)} Tag).`
        : `Ayda ${hr.late_threshold} geç kalma = 1 Cumartesi (${num(lateDays)} gün).`);
    }
    if (Number(hr.leave_percent_per_day) > 0) {
      bits.push(de
        ? `Alter Satz: ${hr.leave_percent_per_day}% pro Tag.`
        : `Eski oran: günde %${hr.leave_percent_per_day}.`);
    }
    if (hr.deduct_currency === 'NONE') bits.push(de ? 'Kein Lohnabzug.' : 'Maaş kesintisi yok.');
    else bits.push(de
      ? `Unbezahlter Tag ${hr.unpaid_full_amount} ${hr.deduct_currency}, halber Tag ${hr.unpaid_half_amount}.`
      : `Ücretsiz tam gün ${hr.unpaid_full_amount} ${hr.deduct_currency === 'TRY' ? 'TL' : hr.deduct_currency}, yarım gün ${hr.unpaid_half_amount}.`);
    if (money) bits.push(de ? `Geschätzter Abzug: ${money}.` : `Tahmini kesinti: ${money}.`);
    hint.textContent = bits.join(' ');
  }
  await leaveLoadMarks(fid);
  leaveRefreshPick();
}

function leaveSetMode(mode) {
  const delay = mode === 'gecikme';
  const dur = document.getElementById('lr-duration-wrap');
  const kind = document.getElementById('lr-kind')?.closest('.form-row');
  const mins = document.getElementById('lr-delay-wrap');
  const daysRow = document.getElementById('lr-days')?.closest('.form-row');
  if (dur) dur.style.display = delay ? 'none' : '';
  if (kind) kind.style.display = delay ? 'none' : '';
  if (mins) mins.style.display = delay ? '' : 'none';
  if (daysRow) daysRow.style.display = delay ? 'none' : '';
  if (delay && _leavePick.size > 1) {
    const one = [..._leavePick].sort().slice(-1);
    _leavePick = new Set(one);
  }
  leaveRefreshPick();
}

function leaveCalShift(delta) {
  if (!_leaveCal) {
    const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
    const p = today.split('-').map(Number);
    _leaveCal = { y: p[0], m: p[1] };
  }
  let m = _leaveCal.m + delta;
  let y = _leaveCal.y;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  _leaveCal = { y, m };
  const fid = _leaveFirmId();
  if (fid) leaveLoadMarks(fid).then(() => leaveRenderCalendar());
  else leaveRenderCalendar();
}

function leaveCalToday() {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const p = String(today).split('-').map(Number);
  _leaveCal = { y: p[0], m: p[1] };
  const fid = _leaveFirmId();
  if (fid) leaveLoadMarks(fid).then(() => leaveRenderCalendar());
  else leaveRenderCalendar();
}

function leaveToggleDay(iso) {
  const rules = leaveActiveContext()?.hr || _leaveSnap?.hr || defaultHrSettings();
  if (!rules.count_sunday && leaveDow(iso) === 0) return;
  const existing = leaveActiveContext()?.existing;
  if (existing && existing.has(iso)) {
    toast(leaveDe() ? 'Dieser Tag ist schon erfasst.' : 'Bu gün zaten kayıtlı', 'warn');
    return;
  }
  const mode = document.getElementById('lr-mode')?.value || 'izin';
  if (mode === 'gecikme') {
    _leavePick = new Set([iso]);
  } else if (_leavePick.has(iso)) {
    _leavePick.delete(iso);
  } else {
    _leavePick.add(iso);
  }
  leaveRefreshPick();
}

async function leaveLoadMarks(fid) {
  if (!_leaveCal || !fid) return;
  const from = `${_leaveCal.y}-${String(_leaveCal.m).padStart(2, '0')}-01`;
  const to = leaveAddIso(leaveAddIso(from, 32).slice(0, 7) + '-01', -1);
  const paid = new Set();
  const unpaid = new Set();
  const other = new Set();
  const late = new Set();
  try {
    const rows = await sb('rpc/leave_calendar_marks', {
      method: 'POST',
      body: JSON.stringify({ p_firm: fid, p_from: from, p_to: to }),
    });
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const day = String(row.day || '').slice(0, 10);
      if (!day) return;
      if (row.mark === 'own_unpaid') unpaid.add(day);
      else if (row.mark === 'own_paid') paid.add(day);
      else if (row.mark === 'other') other.add(day);
      else if (row.mark === 'own_late' || row.mark === 'late') late.add(day);
    });
  } catch (e) {
    (_leaveSnap?.ownRows || []).forEach((row) => {
      if (row.status !== 'pending' && row.status !== 'approved') return;
      leaveDatesOfRow(row).forEach((day) => {
        if (row.kind === 'unpaid') unpaid.add(day);
        else paid.add(day);
      });
    });
  }
  _leaveMarks = { paid, unpaid, other, late };
}

function leaveRenderCalendar() {
  const grid = document.getElementById('leave-cal-grid');
  const label = document.getElementById('leave-cal-label');
  const week = document.getElementById('leave-cal-week');
  if (!grid) return;
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  if (!_leaveCal) {
    const p = String(today).split('-').map(Number);
    _leaveCal = { y: p[0], m: p[1] };
  }
  const de = leaveDe();
  const names = de ? LEAVE_MONTHS_DE : LEAVE_MONTHS_TR;
  if (label) label.textContent = `${names[_leaveCal.m - 1]} ${_leaveCal.y}`;
  if (week) {
    const heads = de ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    week.innerHTML = heads.map((x) => `<div class="leave-cal-w">${x}</div>`).join('');
  }
  const rules = leaveActiveContext()?.hr || _leaveSnap?.hr || defaultHrSettings();
  const ctx = leaveActiveContext();
  const kind = document.getElementById('lr-kind')?.value || 'annual';
  const duration = document.getElementById('lr-duration')?.value || 'full';
  const mode = document.getElementById('lr-mode')?.value || 'izin';
  const plan = leavePlanDays(mode === 'gecikme' ? [] : [..._leavePick], kind, duration, rules, ctx?.remaining ?? 0, ctx?.existing || new Set());
  const forced = new Set(plan.forced);
  const first = `${_leaveCal.y}-${String(_leaveCal.m).padStart(2, '0')}-01`;
  const dow = leaveDow(first);
  const lead = dow === 0 ? 6 : dow - 1;
  const start = leaveAddIso(first, -lead);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const iso = leaveAddIso(start, i);
    const inMonth = Number(iso.slice(5, 7)) === _leaveCal.m;
    const cls = ['leave-day'];
    if (!inMonth) cls.push('out');
    if (iso === today) cls.push('today');
    if (_leaveMarks.unpaid.has(iso)) cls.push('unpaid');
    else if (_leaveMarks.paid.has(iso)) cls.push('paid');
    else if (_leaveMarks.late.has(iso)) cls.push('late');
    else if (_leaveMarks.other.has(iso)) cls.push('team');
    if (_leavePick.has(iso)) cls.push('picked');
    else if (forced.has(iso)) cls.push('forced');
    if (!rules.count_sunday && leaveDow(iso) === 0) cls.push('off');
    cells.push(`<button type="button" class="${cls.join(' ')}" onclick="leaveToggleDay('${iso}')">${Number(iso.slice(8, 10))}</button>`);
  }
  grid.innerHTML = cells.join('');
  const chips = document.getElementById('leave-pick-chips');
  if (chips) {
    const picked = [..._leavePick].sort().map((iso) => `<span class="leave-chip">${leaveFmtDay(iso)}</span>`);
    const extra = plan.forced.map((iso) => `<span class="leave-chip forced">${leaveFmtDay(iso)}</span>`);
    chips.innerHTML = picked.concat(extra).join('');
  }
  return plan;
}

function leaveRefreshPick() {
  const rules = leaveActiveContext()?.hr || _leaveSnap?.hr || defaultHrSettings();
  const durWrap = document.getElementById('lr-duration-wrap');
  const mode = document.getElementById('lr-mode')?.value || 'izin';
  if (durWrap && mode !== 'gecikme') durWrap.style.display = rules.half_day_enabled ? '' : 'none';
  const forWrap = document.getElementById('lr-for-wrap');
  if (forWrap) forWrap.style.display = isLeaveAdmin() ? '' : 'none';
  const modeSel = document.getElementById('lr-mode');
  if (modeSel) {
    const lateOpt = modeSel.querySelector('option[value="gecikme"]');
    if (lateOpt) lateOpt.hidden = !isLeaveAdmin();
    if (!isLeaveAdmin() && modeSel.value === 'gecikme') modeSel.value = 'izin';
  }
  const plan = leaveRenderCalendar();
  const daysEl = document.getElementById('lr-days');
  const preview = document.getElementById('lr-preview');
  if (!plan || !daysEl || !preview) return;
  const de = leaveDe();
  if (mode === 'gecikme') {
    const day = [..._leavePick][0];
    preview.textContent = day
      ? (de ? `Verspätung am ${leaveFmtDay(day)}` : `Geç kalma: ${leaveFmtDay(day)}`)
      : (de ? 'Tag im Kalender wählen.' : 'Takvimden gün seç.');
    return;
  }
  daysEl.value = String(Math.round(plan.adding * 100) / 100);
  if (!plan.days.length) {
    preview.textContent = _leavePick.size
      ? (de ? 'Keine zählenden Tage.' : 'Seçilen günler sayılmıyor.')
      : (de ? 'Tage im Kalender antippen.' : 'Takvimden günlere bas.');
    return;
  }
  const parts = [];
  if (plan.forced.length) {
    parts.push(de ? `Samstag ergänzt: ${plan.forced.map(leaveFmtDay).join(', ')}` : `Cumartesi eklendi: ${plan.forced.map(leaveFmtDay).join(', ')}`);
  }
  const kind = document.getElementById('lr-kind')?.value || 'annual';
  if (!plan.uses && kind !== 'unpaid') {
    parts.push(de ? `${plan.adding} Tage, Anspruch bleibt` : `${plan.adding} gün, yıllık haktan düşmez`);
  } else if (plan.uses && plan.unpaidUnits > 0.001 && plan.paidUnits > 0.001) {
    parts.push(de ? `${plan.paidUnits} bezahlt + ${plan.unpaidUnits} unbezahlt` : `${plan.paidUnits} gün ücretli, ${plan.unpaidUnits} gün ücretsiz`);
  } else if (!plan.uses || plan.paidUnits <= 0.001) {
    parts.push(de ? `${plan.unpaidUnits} unbezahlt` : `${plan.unpaidUnits} gün ücretsiz`);
  } else {
    parts.push(de ? `${plan.paidUnits} bezahlt` : `${plan.paidUnits} gün ücretli`);
  }
  const money = leaveMoneyLabel(plan.unpaidMoney, rules);
  if (money) parts.push(de ? `Abzug ${money}` : `kesinti ${money}`);
  preview.textContent = parts.join(' · ');
}

function onLeaveDatesChange() {
  leaveRefreshPick();
}

async function leaveForChanged() {
  const fid = _leaveFirmId();
  const uid = document.getElementById('lr-for')?.value || '';
  if (!fid || !uid || uid === currentUser?.id) {
    _leaveFor = null;
    leaveRefreshPick();
    return;
  }
  const y = currentYear();
  const b = yearBoundsQuery(y);
  const hr = _leaveSnap?.hr || await getHrSettings(fid);
  let rows = [];
  let extra = 0;
  let hireIso = '';
  try {
    rows = (await sb(`leave_requests?user_id=eq.${uid}&date_from=lte.${b.lte}&date_to=gte.${b.gte}&select=days_used,date_from,date_to,kind,status`).catch(() => [])) || [];
    const ent = await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}&select=extra_days_granted`).catch(() => []);
    extra = Number(ent?.[0]?.extra_days_granted) || 0;
    const me = await sb(`users?id=eq.${uid}&select=created_at`).catch(() => []);
    hireIso = String(me?.[0]?.created_at || '').slice(0, 10);
  } catch (e) {
    console.warn('leave target', e);
  }
  const active = leaveActiveRows(rows);
  let paidUsed = 0;
  const existing = new Set();
  active.forEach((r) => {
    const n = Number(r.days_used) || 0;
    if (!(r.kind === 'unpaid' || (r.kind === 'sick' && !hr.sick_uses_balance))) paidUsed += n;
    if (r.kind !== 'unpaid') leaveDatesOfRow(r).forEach((d) => existing.add(d));
  });
  const earned = leaveYearEntitlement(hireIso, y, hr.annual_leave_days_default, hr) + extra;
  _leaveFor = { uid, hr, remaining: Math.max(0, earned - paidUsed), existing };
  leaveRefreshPick();
}

async function submitLeaveRequest() {
  const fid = _leaveFirmId();
  if (!fid) {
    toast('Firma bulunamadı', 'err');
    return;
  }
  const mode = document.getElementById('lr-mode')?.value || 'izin';
  const kind = document.getElementById('lr-kind')?.value || 'annual';
  const duration = document.getElementById('lr-duration')?.value || 'full';
  const reason = document.getElementById('lr-reason')?.value?.trim() || '';
  const target = (isLeaveAdmin() && document.getElementById('lr-for')?.value) || currentUser.id;
  if (mode === 'gecikme') {
    if (!isLeaveAdmin()) {
      toast('Geç kalmayı yönetici kaydeder', 'err');
      return;
    }
    const day = [..._leavePick][0];
    const mins = Number(document.getElementById('lr-mins')?.value);
    if (!day || !target) {
      toast('Gün ve kişi seçin', 'err');
      return;
    }
    if (!Number.isFinite(mins) || mins < 1) {
      toast('Dakika geçersiz', 'err');
      return;
    }
    try {
      await sb('late_arrivals', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          firm_id: fid,
          user_id: target,
          day_date: day,
          minutes_late: mins,
          note: reason || null,
          recorded_by: currentUser.id,
        }),
      });
      toast('Geç kalma kaydedildi', 'ok');
      _leavePick = new Set();
      document.getElementById('lr-reason').value = '';
      await loadLateAdminTable(fid);
      await refreshLeaveStats(fid);
    } catch (e) {
      toast('Hata: ' + e.message, 'err');
    }
    return;
  }
  if (!_leavePick.size) {
    toast('Takvimden gün seçin', 'err');
    return;
  }
  const hr = leaveActiveContext()?.hr || _leaveSnap?.hr || await getHrSettings(fid);
  const ctx = leaveActiveContext();
  const plan = leavePlanDays([..._leavePick], kind, duration, hr, ctx?.remaining ?? 0, ctx?.existing || new Set());
  if (!plan.adding) {
    toast('Seçilen günler sayılmıyor', 'err');
    return;
  }
  const groups = [];
  (plan.dayUnits || []).forEach((d) => {
    const last = groups[groups.length - 1];
    const storeKind = d.bucket === 'unpaid' ? 'unpaid' : kind;
    if (last && last.kind === storeKind && leaveAddIso(last.to, 1) === d.iso) {
      last.to = d.iso;
      last.units += d.unit;
    } else {
      groups.push({ from: d.iso, to: d.iso, units: d.unit, kind: storeKind });
    }
  });
  if (!groups.length) {
    toast('Gün sayısı geçersiz', 'err');
    return;
  }
  const noteBits = [reason];
  if (plan.forced.length) noteBits.push(`Cumartesi zorunlu: ${plan.forced.join(', ')}`);
  try {
    for (const group of groups) {
      const tag = groups.length > 1 ? (group.kind === 'unpaid' ? 'Ücretsiz kısım' : 'Ücretli kısım') : '';
      const note = [noteBits.filter(Boolean).join(' | '), tag].filter(Boolean).join(' | ');
      await sb('leave_requests', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          firm_id: fid,
          user_id: target,
          date_from: group.from,
          date_to: group.to,
          days_used: Math.round(group.units * 100) / 100,
          kind: group.kind,
          reason: note || null,
          status: 'pending',
        }),
      });
    }
    _leavePick = new Set();
    const de = typeof currentLang !== 'undefined' && currentLang === 'de';
    const split = groups.some((g) => g.kind === 'unpaid') && groups.some((g) => g.kind !== 'unpaid');
    toast(split
      ? (de ? 'Antrag geteilt: bezahlt und unbezahlt.' : 'Talep bölündü: ücretli ve ücretsiz.')
      : (de ? 'Antrag gesendet.' : 'İzin talebi gönderildi'), 'ok');
    document.getElementById('lr-reason').value = '';
    await loadMyLeaveRequests();
    await loadAdminLeaveTables(fid);
    await refreshLeaveStats(fid);
  } catch (e) {
    const raw = String(e?.message || '');
    const friendly = raw.includes('leave_requests_dates')
      ? 'Bitiş tarihi başlangıçtan önce olamaz'
      : (raw.includes('not_authenticated') ? 'Oturum süresi doldu. Yeniden giriş yapın.' : raw);
    toast(friendly, 'err');
  }
}

async function loadMyLeaveRequests() {
  const box = document.getElementById('leave-my-table');
  if (!box || !currentUser?.id) return;
  try {
    _leaveMyRows = (await sb(
      `leave_requests?user_id=eq.${currentUser.id}&order=created_at.desc&limit=80&select=*`
    ).catch(() => null)) || [];
    ['pending', 'approved', 'rejected'].forEach((key) => {
      const btn = document.getElementById(`leave-tab-${key}`);
      if (btn) btn.classList.toggle('btn-primary', _leaveMyTab === key);
    });
    const rows = _leaveMyRows.filter((r) => r.status === _leaveMyTab);
    if (!rows.length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bu sekmede kayıt yok</div>';
      return;
    }
    box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Tür</th><th>Durum</th><th>Not</th><th></th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_from, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_from)}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_to, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveKindLabel(r.kind))}</td>
<td>${_leaveEsc(leaveStatusLabel(r.status))}</td>
<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${_leaveEsc(r.admin_comment || r.reason || '—')}</td>
<td>${r.status === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="leaveCancelRequest('${r.id}')">Sil</button>` : ''}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px;">${ _leaveEsc(e.message) }</div>`;
  }
}

async function loadAdminLeaveTables(fid) {
  if (!isLeaveAdmin() || !fid) return;
  const pend = document.getElementById('leave-pending-table');
  const all = document.getElementById('leave-all-table');
  try {
    const pendingRows =
      (await sb(
        `leave_requests?firm_id=eq.${fid}&status=eq.pending&order=created_at.asc&limit=100&select=*`
      ).catch(() => [])) || [];
    const pendU = await _userMapByIds(pendingRows.map((r) => r.user_id));
    if (pend) {
      if (!pendingRows.length) {
        pend.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bekleyen talep yok</div>';
      } else {
        pend.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Agent</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Tür</th><th>Açıklama</th><th></th>
</tr></thead>
<tbody>
${pendingRows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(pendU[r.user_id]?.name || pendU[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_from, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_from)}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_to, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveKindLabel(r.kind))}</td>
<td style="max-width:120px;">${_leaveEsc(r.reason || '—')}</td>
<td style="white-space:nowrap;">
<button type="button" class="btn btn-primary btn-sm" onclick="approveLeaveRequest('${r.id}')">Onayla</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="rejectLeaveRequest('${r.id}')">Red</button>
</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }

    const allRows =
      (await sb(`leave_requests?firm_id=eq.${fid}&order=created_at.desc&limit=80&select=*`).catch(() => [])) || [];
    const allU = await _userMapByIds(allRows.map((r) => r.user_id));
    if (all) {
      if (!allRows.length) {
        all.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Kayıt yok</div>';
      } else {
        all.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Agent</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Durum</th><th>Tarih</th>
</tr></thead>
<tbody>
${allRows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(allU[r.user_id]?.name || allU[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_from, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_from)}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.date_to, { day: '2-digit', month: '2-digit', year: 'numeric' }) : r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveStatusLabel(r.status))}</td>
<td>${_leaveEsc(typeof mbFormatWall === 'function' ? mbFormatWall(r.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }
  } catch (e) {
    if (pend) pend.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}

async function approveLeaveRequest(id) {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  try {
    await sb(`leave_requests?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'approved',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        admin_comment: null,
      }),
    });
    toast('Talep onaylandı', 'ok');
    await loadAdminLeaveTables(fid);
    await loadMyLeaveRequests();
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function rejectLeaveRequest(id) {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const c = await mbPrompt('Red notu (isteğe bağlı):', '', 'Talebi Reddet');
  if (c === null) return;
  try {
    await sb(`leave_requests?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'rejected',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        admin_comment: c || null,
      }),
    });
    toast('Talep reddedildi', 'ok');
    await loadAdminLeaveTables(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

function leaveSetMyTab(tab) {
  _leaveMyTab = tab || 'pending';
  loadMyLeaveRequests();
}

async function leaveCancelRequest(id) {
  const ok = await mbConfirm('Bekleyen kayıt silinsin mi?', 'Kaydı sil');
  if (!ok) return;
  const fid = _leaveFirmId();
  try {
    await sb(`leave_requests?id=eq.${id}&status=eq.pending`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
    toast('Kayıt silindi', 'ok');
    await loadMyLeaveRequests();
    if (fid) {
      await loadAdminLeaveTables(fid);
      await refreshLeaveStats(fid);
    }
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function fillLateUserSelect(fid) {
  const sel = document.getElementById('late-user');
  const ent = document.getElementById('ent-user');
  const who = document.getElementById('lr-for');
  if (!isLeaveAdmin() || !fid) return;
  try {
    const users = await sb(`users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin,admin)&select=id,name,email&order=name.asc`).catch(() => []);
    const opts = (users || []).map((u) => `<option value="${u.id}">${_leaveEsc(u.name || u.email)}</option>`).join('');
    if (sel) sel.innerHTML = `<option value="">Agent seç…</option>` + opts;
    if (ent) ent.innerHTML = `<option value="">Kullanıcı seç…</option>` + opts;
    if (who) who.innerHTML = `<option value="">Kendim</option>` + opts;
  } catch (e) {
    if (sel) sel.innerHTML = '<option value="">Yüklenemedi</option>';
  }
}

async function submitLateArrival() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const uid = document.getElementById('late-user')?.value;
  const day = document.getElementById('late-date')?.value;
  const mins = Number(document.getElementById('late-mins')?.value);
  const note = document.getElementById('late-note')?.value?.trim() || '';
  if (!uid || !day) {
    toast('Agent ve tarih seçin', 'err');
    return;
  }
  if (mins == null || mins < 0) {
    toast('Dakika geçersiz', 'err');
    return;
  }
  try {
    await sb('late_arrivals', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: fid,
        user_id: uid,
        day_date: day,
        minutes_late: mins,
        note: note || null,
        recorded_by: currentUser.id,
      }),
    });
    toast('Geç kalma kaydedildi', 'ok');
    document.getElementById('late-note').value = '';
    await loadLateAdminTable(fid);
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function loadLateAdminTable(fid) {
  const box = document.getElementById('leave-late-table');
  if (!box || !isLeaveAdmin() || !fid) return;
  const y = currentYear();
  const b = yearBoundsQuery(y);
  try {
    const rows =
      (await sb(
        `late_arrivals?firm_id=eq.${fid}&day_date=gte.${b.gte}&day_date=lte.${b.lte}&order=day_date.desc&limit=100&select=*`
      ).catch(() => [])) || [];
    const umap = await _userMapByIds(rows.map((r) => r.user_id));
    if (!rows.length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bu yıl kayıt yok</div>';
      return;
    }
    box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Tarih</th><th>Agent</th><th>Dakika</th><th>Not</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(r.day_date)}</td>
<td>${_leaveEsc(umap[r.user_id]?.name || umap[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(r.minutes_late)}</td>
<td>${_leaveEsc(r.note || '—')}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}

async function saveExtraLeaveDays() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const uid = document.getElementById('ent-user')?.value;
  const y = Number(document.getElementById('ent-year')?.value) || currentYear();
  const extra = Number(document.getElementById('ent-days')?.value);
  if (!uid) {
    toast('Kullanıcı seçin', 'err');
    return;
  }
  if (extra == null || extra < 0) {
    toast('Ek gün geçersiz', 'err');
    return;
  }
  try {
    const existing = await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}&select=user_id`).catch(() => []);
    if (existing?.length) {
      await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ extra_days_granted: extra }),
      });
    } else {
      await sb('user_leave_entitlements', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({ user_id: uid, year: y, extra_days_granted: extra }),
      });
    }
    toast('Ek izin günü kaydedildi', 'ok');
    await loadEntitlementsTable(fid);
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function loadEntitlementsTable(fid) {
  const box = document.getElementById('leave-ent-table');
  if (!isLeaveAdmin() || !fid) return;

  try {
    const users = await sb(`users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&select=id,name,email&order=name.asc`).catch(() => []);
    const ey = document.getElementById('ent-year');
    if (ey && !ey.value) ey.value = String(currentYear());

    if (box) {
      const y = currentYear();
      const ids = (users || []).map((u) => u.id);
      let rows = [];
      if (ids.length) {
        rows = (await sb(`user_leave_entitlements?year=eq.${y}&user_id=in.(${ids.join(',')})&select=*`).catch(() => [])) || [];
      }
      const firmUserIds = new Set((users || []).map((u) => u.id));
      const filtered = rows.filter((r) => firmUserIds.has(r.user_id));
      const nameById = Object.fromEntries((users || []).map((u) => [u.id, u.name || u.email]));
      if (!filtered.length) {
        box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bu yıl ek gün tanımı yok</div>';
      } else {
        box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);"><th>Kullanıcı</th><th>Yıl</th><th>Ek gün</th></tr></thead>
<tbody>
${filtered
  .map(
    (r) => `<tr><td>${_leaveEsc(nameById[r.user_id] || r.user_id)}</td><td>${r.year}</td><td>${_leaveEsc(r.extra_days_granted)}</td></tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }
  } catch (e) {
    if (box) box.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}
