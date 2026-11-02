// Callin masaüstü: KPI, maliyet, sonuç chip’leri, sıra sağlığı, brif, hata/yeniden dene.

const _callinDesk = {
  firmId: '',
  stats: null,
  compare: null,
  cost: null,
  week: null,
  byStaff: {},
  byCamp: [],
  loading: false,
  timer: 0,
  retryTimer: 0,
  eveningTimer: 0,
};

function callinDeskSay(key, fallback) {
  const msg = typeof t === 'function' ? t(key) : fallback;
  return !msg || msg === key ? fallback : msg;
}

function callinDeskEsc(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
}

function callinDeskFirmId() {
  if (typeof _aiFirmId === 'string' && _aiFirmId) return _aiFirmId;
  if (typeof mbAiActiveFirmId === 'function') return mbAiActiveFirmId() || '';
  return (typeof getActiveFirmId === 'function' && getActiveFirmId()) || currentUser?.firm_id || '';
}

function callinDeskErrors() {
  window._aiDeskErrors = Array.isArray(window._aiDeskErrors) ? window._aiDeskErrors : [];
  return window._aiDeskErrors;
}

function callinDeskRetries() {
  window._aiDeskRetries = Array.isArray(window._aiDeskRetries) ? window._aiDeskRetries : [];
  return window._aiDeskRetries;
}

function callinDeskOutChipsOn() {
  try { return localStorage.getItem('mb_callin_out_chips') === '1'; } catch (e) { return false; }
}

function callinDeskToggleOutChips() {
  const on = !callinDeskOutChipsOn();
  try { localStorage.setItem('mb_callin_out_chips', on ? '1' : '0'); } catch (e) {}
  callinDeskPaint();
}

function callinDeskPushError(err) {
  if (!err) return;
  const list = callinDeskErrors();
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    staffId: err.staffId || '',
    staffName: err.staffName || '',
    who: err.who || err.phone || '',
    phone: err.phone || '',
    code: err.code || err.error || 'fail',
    detail: String(err.detail || '').slice(0, 220),
    contactId: err.contactId || '',
    apptId: err.apptId || '',
  };
  list.unshift(row);
  window._aiDeskErrors = list.slice(0, 24);
  callinDeskBeep('err');
  if (err.staffId && typeof mbAiSetStopWhy === 'function') {
    mbAiSetStopWhy(err.staffId, 'error', row.code);
  }
  callinDeskPaint();
}

function callinDeskSoundOn() {
  try { return localStorage.getItem('mb_callin_sound') === '1'; } catch (e) { return false; }
}

function callinDeskToggleSound() {
  const on = !callinDeskSoundOn();
  try { localStorage.setItem('mb_callin_sound', on ? '1' : '0'); } catch (e) {}
  callinDeskPaint();
  if (on) callinDeskBeep('ok');
}

function callinDeskEveningOn() {
  try { return localStorage.getItem('mb_callin_evening') === '1'; } catch (e) { return false; }
}

function callinDeskToggleEvening() {
  const on = !callinDeskEveningOn();
  try { localStorage.setItem('mb_callin_evening', on ? '1' : '0'); } catch (e) {}
  callinDeskPaint();
  if (typeof toast === 'function') {
    toast(on
      ? callinDeskSay('callin.desk.evening.on', '18:00 gece raporu açık (onaylı).')
      : callinDeskSay('callin.desk.evening.off', 'Gece raporu kapalı.'), 'ok');
  }
}

function callinDeskBeep(kind) {
  if (!callinDeskSoundOn()) return;
  if (typeof opsPlayTone === 'function') {
    opsPlayTone(kind === 'err' ? 'alert' : kind === 'stop' ? 'bell' : kind === 'warn' ? 'soft' : 'chime', 55);
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'err' ? 520 : 740;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 400);
  } catch (e) {}
}

function callinDeskDayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

function callinDeskTally(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let dialed = list.length;
  let appt = 0;
  let miss = 0;
  let neg = 0;
  let talk = 0;
  let cb = 0;
  let vm = 0;
  let secs = 0;
  let costUsd = 0;
  list.forEach((row) => {
    const out = String(row.outcome || '').toLowerCase();
    const sec = Number(row.duration_sec) || 0;
    if (sec > 0) talk += 1;
    secs += sec;
    if (row.cost_usd != null && row.cost_usd !== '') costUsd += Number(row.cost_usd) || 0;
    if (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)) appt += 1;
    else if (out === 'voicemail') vm += 1;
    else if (['callback', 'geri_arama', 'wiedervorlage'].includes(out)) cb += 1;
    else if (['no_answer', 'ulasilamadi'].includes(out)) miss += 1;
    else if (['negative', 'basarisiz', 'dnc'].includes(out)) neg += 1;
  });
  return { dialed, appt, miss, neg, talk, cb, vm, secs, costUsd };
}

function callinDeskRate(settings) {
  const ai = settings?.ai || (typeof mbFirmAi === 'function' ? mbFirmAi(settings) : {}) || {};
  const rate = Number(ai.rate);
  return rate > 0 ? rate : 0;
}

function callinDeskWeekRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

function callinDeskDayCap(settings) {
  const n = Number(settings?.ai?.day_min_cap);
  return n > 0 ? n : 0;
}

function callinDeskQuota(settings, secs) {
  const cap = callinDeskDayCap(settings);
  const used = (Number(secs) || 0) / 60;
  if (!cap) return { cap: 0, used, pct: 0, warn: false, blocked: false };
  const pct = used / cap;
  return { cap, used, pct, warn: pct >= 0.8, blocked: pct >= 1 };
}

async function callinDeskLoadStats() {
  const firmId = callinDeskFirmId();
  if (!firmId || typeof sb !== 'function') {
    _callinDesk.stats = null;
    _callinDesk.compare = null;
    _callinDesk.cost = null;
    _callinDesk.week = null;
    _callinDesk.byStaff = {};
    _callinDesk.byCamp = [];
    return;
  }
  _callinDesk.firmId = firmId;
  _callinDesk.loading = true;
  const { gte, lt } = callinDeskDayRange();
  const week = callinDeskWeekRange();
  const aiQ = `call_logs?firm_id=eq.${firmId}&started_at=gte.${gte}&started_at=lt.${lt}&or=(work_type.eq.ai_sales,work_type.eq.ai_qc,ai_staff_id.not.is.null)&select=id,outcome,duration_sec,cost_usd,work_type,ai_staff_id,campaign_id&limit=800`;
  const huQ = `call_logs?firm_id=eq.${firmId}&started_at=gte.${gte}&started_at=lt.${lt}&ai_staff_id=is.null&work_type=not.in.(ai_sales,ai_qc)&select=id,outcome,duration_sec,cost_usd&limit=800`;
  const weekQ = `call_logs?firm_id=eq.${firmId}&started_at=gte.${week.gte}&started_at=lt.${week.lt}&or=(work_type.eq.ai_sales,work_type.eq.ai_qc,ai_staff_id.not.is.null)&select=id,outcome,duration_sec,cost_usd,ai_staff_id&limit=2000`;
  const [aiRows, huRows, weekRows, firmRows, camps] = await Promise.all([
    sb(aiQ).catch(() => []),
    sb(huQ).catch(() => []),
    sb(weekQ).catch(() => []),
    sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []),
    sb(`campaigns?firm_id=eq.${firmId}&select=id,name&order=name.asc`).catch(() => []),
  ]);
  const settings = firmRows?.[0]?.settings || window._aiFirmSettings?.[firmId] || {};
  window._aiFirmSettings = window._aiFirmSettings || {};
  window._aiFirmSettings[firmId] = settings;
  const campNames = {};
  (Array.isArray(camps) ? camps : []).forEach((c) => { if (c?.id) campNames[c.id] = c.name || c.id; });
  const ai = callinDeskTally(aiRows);
  const human = callinDeskTally(huRows);
  const weekTally = callinDeskTally(weekRows);
  const rate = callinDeskRate(settings);
  const mins = ai.secs / 60;
  const estimate = rate > 0 ? mins * rate : 0;
  const byStaff = {};
  const byCampMap = {};
  (Array.isArray(aiRows) ? aiRows : []).forEach((row) => {
    const sid = String(row.ai_staff_id || '');
    const cid = String(row.campaign_id || '') || '_';
    if (!byCampMap[cid]) byCampMap[cid] = { id: cid, name: campNames[cid] || (cid === '_' ? '—' : cid), dialed: 0, appt: 0 };
    byCampMap[cid].dialed += 1;
    const out = String(row.outcome || '').toLowerCase();
    if (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)) byCampMap[cid].appt += 1;
    if (!sid) return;
    if (!byStaff[sid]) byStaff[sid] = { dialed: 0, appt: 0, miss: 0, secs: 0, camps: {} };
    byStaff[sid].dialed += 1;
    byStaff[sid].secs += Number(row.duration_sec) || 0;
    if (!byStaff[sid].camps[cid]) byStaff[sid].camps[cid] = { dialed: 0, appt: 0 };
    byStaff[sid].camps[cid].dialed += 1;
    if (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)) {
      byStaff[sid].appt += 1;
      byStaff[sid].camps[cid].appt += 1;
    } else if (['no_answer', 'ulasilamadi', 'voicemail'].includes(out)) byStaff[sid].miss += 1;
  });
  const staffNames = {};
  const bag = window._aiStaffByFirm?.[firmId] || (typeof _aiDesk !== 'undefined' ? _aiDesk?.staff : null) || [];
  (bag || []).forEach((row) => { if (row?.id) staffNames[row.id] = row.name || row.id; });
  _callinDesk.byCamp = Object.values(byCampMap).sort((a, b) => b.dialed - a.dialed).slice(0, 8);
  let bestId = '';
  let bestAppt = -1;
  Object.keys(byStaff).forEach((sid) => {
    if (byStaff[sid].appt > bestAppt) {
      bestAppt = byStaff[sid].appt;
      bestId = sid;
    }
  });
  const weekByStaff = {};
  (Array.isArray(weekRows) ? weekRows : []).forEach((row) => {
    const sid = String(row.ai_staff_id || '');
    if (!sid) return;
    if (!weekByStaff[sid]) weekByStaff[sid] = { dialed: 0, appt: 0, secs: 0 };
    weekByStaff[sid].dialed += 1;
    weekByStaff[sid].secs += Number(row.duration_sec) || 0;
    const out = String(row.outcome || '').toLowerCase();
    if (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)) weekByStaff[sid].appt += 1;
  });
  let weekBest = '';
  let weekBestAppt = -1;
  Object.keys(weekByStaff).forEach((sid) => {
    if (weekByStaff[sid].appt > weekBestAppt) {
      weekBestAppt = weekByStaff[sid].appt;
      weekBest = sid;
    }
  });
  const weekMins = weekTally.secs / 60;
  const weekEst = rate > 0 ? weekMins * rate : weekTally.costUsd;
  _callinDesk.stats = ai;
  _callinDesk.compare = { ai, human };
  _callinDesk.byStaff = byStaff;
  window._callinStaffToday = byStaff;
  _callinDesk.week = {
    ...weekTally,
    mins: weekMins,
    estimate: weekEst,
    bestId: weekBest,
    bestName: staffNames[weekBest] || weekBest || '',
    bestAppt: weekBestAppt > 0 ? weekBestAppt : 0,
    monday: new Date().getDay() === 1,
  };
  const quota = callinDeskQuota(settings, ai.secs);
  const qKey = `${firmId}:${new Date().toISOString().slice(0, 10)}:${quota.blocked ? 'block' : quota.warn ? 'warn' : 'ok'}`;
  if ((quota.blocked || quota.warn) && window._callinQuotaBeep !== qKey) {
    window._callinQuotaBeep = qKey;
    callinDeskBeep(quota.blocked ? 'err' : 'warn');
  } else if (!quota.blocked && !quota.warn) {
    window._callinQuotaBeep = qKey;
  }
  _callinDesk.cost = {
    firmId,
    rate,
    secs: ai.secs,
    mins,
    estimate,
    billed: ai.costUsd,
    n: ai.dialed,
    currency: (typeof window._tbBalCur === 'string' && window._tbBalCur) || 'EUR',
    fresh: true,
    quota,
  };
  window._callinAiCostToday = _callinDesk.cost;
  _callinDesk.loading = false;
}

function callinDeskHeatHtml() {
  const rows = _callinDesk.byCamp || [];
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.dialed), 1);
  return `<section class="callin-panel callin-heat">
    <header class="callin-panel-hd">
      <div class="callin-panel-title">${callinDeskEsc(callinDeskSay('callin.desk.heat.title', 'Kampanya ısı haritası'))}</div>
      <span class="callin-panel-sub">${callinDeskEsc(callinDeskSay('callin.desk.heat.sub', 'Bugün YZ'))}</span>
    </header>
    <div class="callin-heat-list">${rows.map((row) => {
      const pct = Math.round((row.dialed / max) * 100);
      return `<div class="callin-heat-row">
        <div class="callin-heat-lab">${callinDeskEsc(row.name)}</div>
        <div class="callin-heat-bar"><span style="width:${pct}%"></span></div>
        <div class="callin-heat-num">${row.dialed}<small>/${row.appt}</small></div>
      </div>`;
    }).join('')}</div>
  </section>`;
}

function callinDeskAbHtml() {
  const bag = callinDeskStaffBag();
  const sales = (bag || []).filter((row) => row.kind !== 'qc');
  if (sales.length < 2) return '';
  const byStaff = _callinDesk.byStaff || {};
  const pairs = [];
  const seen = new Set();
  sales.forEach((a, i) => {
    sales.slice(i + 1).forEach((b) => {
      const aCamps = new Set((typeof mbAiCampIds === 'function' ? mbAiCampIds(a) : a.campaign_ids) || []);
      const bCamps = new Set((typeof mbAiCampIds === 'function' ? mbAiCampIds(b) : b.campaign_ids) || []);
      let share = '';
      if (!aCamps.size && !bCamps.size) share = '*';
      else {
        for (const id of aCamps) {
          if (!bCamps.size || bCamps.has(id)) { share = id; break; }
        }
        if (!share && !aCamps.size) share = [...bCamps][0] || '';
      }
      if (!share) return;
      const key = [a.id, b.id].sort().join(':');
      if (seen.has(key)) return;
      seen.add(key);
      const sa = byStaff[a.id] || { dialed: 0, appt: 0 };
      const sb = byStaff[b.id] || { dialed: 0, appt: 0 };
      const ra = sa.dialed ? Math.round((sa.appt / sa.dialed) * 100) : 0;
      const rb = sb.dialed ? Math.round((sb.appt / sb.dialed) * 100) : 0;
      pairs.push({ a, b, sa, sb, ra, rb });
    });
  });
  if (!pairs.length) return '';
  return `<section class="callin-panel callin-ab">
    <header class="callin-panel-hd">
      <div class="callin-panel-title">${callinDeskEsc(callinDeskSay('callin.desk.ab.title', 'Personel A/B'))}</div>
      <span class="callin-panel-sub">${callinDeskEsc(callinDeskSay('callin.desk.ab.sub', 'Aynı kampanya · bugün'))}</span>
    </header>
    <div class="callin-ab-list">${pairs.slice(0, 4).map((p) => `<div class="callin-ab-row">
      <div class="callin-ab-col"><b>${callinDeskEsc(p.a.name || 'A')}</b><span>${p.sa.appt}/${p.sa.dialed} · %${p.ra}</span></div>
      <div class="callin-ab-vs">vs</div>
      <div class="callin-ab-col"><b>${callinDeskEsc(p.b.name || 'B')}</b><span>${p.sb.appt}/${p.sb.dialed} · %${p.rb}</span></div>
    </div>`).join('')}</div>
  </section>`;
}

function callinDeskStaffBag() {
  const firmId = callinDeskFirmId();
  const desk = (typeof _aiDesk !== 'undefined' && Array.isArray(_aiDesk?.staff)) ? _aiDesk.staff : null;
  const cached = Array.isArray(window._aiStaffByFirm?.[firmId]) ? window._aiStaffByFirm[firmId] : null;
  if (desk?.length) return desk;
  if (cached?.length) return cached;
  return desk || cached || [];
}

function callinDeskStaffLoading() {
  return !!(typeof _aiDesk !== 'undefined' && _aiDesk?.loading);
}

function callinDeskLiveCounts() {
  const staff = callinDeskStaffBag();
  let running = 0;
  let open = 0;
  staff.forEach((row) => {
    if (row.running) running += 1;
    if (typeof mbAiRunLiveRows === 'function') {
      open += mbAiRunLiveRows(row.id).filter((item) => !item.doneAt).length;
    }
  });
  return { staff: staff.length, running, open };
}

function callinDeskMoney(n, cur) {
  if (typeof formatMoney === 'function') return formatMoney(n, cur || 'EUR');
  return Number(n || 0).toFixed(2);
}

function callinDeskAlerts() {
  const alerts = [];
  const firmId = callinDeskFirmId();
  const settings = window._aiFirmSettings?.[firmId] || (typeof _aiDesk !== 'undefined' ? _aiDesk?.settings : null) || {};
  const ready = typeof mbAiFirmReady === 'function' ? mbAiFirmReady(settings) : false;
  if (!ready) {
    alerts.push({
      tone: 'warn',
      text: callinDeskSay('callin.desk.alert.ready', 'Şirket adı veya dakika fiyatı eksik. YZ arama çıkmaz.'),
      action: 'staff',
      fix: 'gate',
    });
  }
  const staff = callinDeskStaffBag();
  if (!staff.length && ready && !callinDeskStaffLoading()) {
    alerts.push({
      tone: 'info',
      text: callinDeskSay('callin.desk.alert.nostaff', 'Henüz YZ personel yok. Personel kur’dan ekle.'),
      action: 'staff',
      fix: 'staff',
    });
  }
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  staff.filter((row) => row.running).forEach((row) => {
    const from = String(row.call_from || '').slice(0, 5);
    const until = String(row.call_until || '').slice(0, 5);
    if (from && until && (hhmm < from || hhmm > until)) {
      alerts.push({
        tone: 'warn',
        text: callinDeskSay('callin.desk.alert.hours', '{name} çalışma saati dışında ({from}–{until}).')
          .replace('{name}', row.name || 'YZ')
          .replace('{from}', from)
          .replace('{until}', until),
        action: 'run',
      });
    }
  });
  const errs = callinDeskErrors().filter((row) => Date.now() - row.at < 30 * 60 * 1000);
  if (errs.some((row) => row.code === 'nokey_el')) {
    alerts.push({
      tone: 'err',
      text: callinDeskSay('callin.desk.alert.eleven', 'ElevenLabs anahtarı yok veya geçersiz.'),
      action: 'staff',
      fix: 'eleven',
    });
  }
  if (errs.some((row) => row.code === 'gate')) {
    alerts.push({
      tone: 'err',
      text: callinDeskSay('callin.desk.alert.gate', 'Kapı kontrolü: şirket adı / fiyat / sonuç ayarı eksik.'),
      action: 'staff',
      fix: 'gate',
    });
  }
  staff.filter((row) => row.running).forEach((row) => {
    const max = Math.max(1, Number(row.parallel) || 1);
    const open = typeof mbAiRunLiveRows === 'function'
      ? mbAiRunLiveRows(row.id).filter((item) => !item.doneAt).length
      : 0;
    if (open >= max) {
      alerts.push({
        tone: 'info',
        text: callinDeskSay('callin.desk.alert.full', '{name}: {n} hat dolu.')
          .replace('{name}', row.name || 'YZ')
          .replace('{n}', String(max)),
        action: 'run',
      });
    }
  });
  const quota = _callinDesk.cost?.quota || callinDeskQuota(settings, _callinDesk.stats?.secs || 0);
  if (quota.blocked) {
    alerts.push({
      tone: 'err',
      text: callinDeskSay('callin.desk.alert.quota', 'Günlük YZ dakika kotası doldu ({used}/{cap}).')
        .replace('{used}', quota.used.toFixed(1))
        .replace('{cap}', String(quota.cap)),
      action: 'run',
      fix: 'quota',
    });
  } else if (quota.warn) {
    alerts.push({
      tone: 'warn',
      text: callinDeskSay('callin.desk.alert.quota_warn', 'YZ kotası %{pct} — {used}/{cap} dk.')
        .replace('{pct}', String(Math.round(quota.pct * 100)))
        .replace('{used}', quota.used.toFixed(1))
        .replace('{cap}', String(quota.cap)),
      action: 'run',
      fix: 'quota',
    });
  }
  return alerts.slice(0, 6);
}

function callinDeskBar(ai, human, key) {
  const a = Number(ai?.[key]) || 0;
  const h = Number(human?.[key]) || 0;
  const max = Math.max(a, h, 1);
  return `<div class="callin-cmp-row">
    <span class="callin-cmp-lab">${callinDeskEsc(callinDeskSay(`callin.desk.cmp.${key}`, key))}</span>
    <div class="callin-cmp-bars">
      <div class="callin-cmp-bar is-ai" style="width:${Math.round((a / max) * 100)}%" title="YZ ${a}"></div>
      <div class="callin-cmp-bar is-hu" style="width:${Math.round((h / max) * 100)}%" title="İnsan ${h}"></div>
    </div>
    <span class="callin-cmp-num">${a}<small>/</small>${h}</span>
  </div>`;
}

function callinDeskOutChipsHtml(stats) {
  if (!callinDeskOutChipsOn()) return '';
  const chips = [
    { key: 'appt', n: stats.appt || 0, cls: 'is-ok' },
    { key: 'neg', n: stats.neg || 0, cls: 'is-neg' },
    { key: 'miss', n: stats.miss || 0, cls: 'is-miss' },
    { key: 'cb', n: stats.cb || 0, cls: 'is-cb' },
    { key: 'vm', n: stats.vm || 0, cls: 'is-vm' },
  ];
  return `<div class="callin-out-chips">${chips.map((chip) => `<span class="callin-out-chip ${chip.cls}"><b>${chip.n}</b>${callinDeskEsc(callinDeskSay(`callin.desk.out.${chip.key}`, chip.key))}</span>`).join('')}</div>`;
}

function callinDeskBriefText() {
  const live = callinDeskLiveCounts();
  const stats = _callinDesk.stats || {};
  const errs = callinDeskErrors().filter((row) => Date.now() - row.at < 30 * 60 * 1000);
  const cost = _callinDesk.cost;
  const a = callinDeskSay('callin.desk.brief.a', '{run} YZ çalışıyor, bugün {appt} randevu · {dial} arama.')
    .replace('{run}', String(live.running))
    .replace('{appt}', String(stats.appt || 0))
    .replace('{dial}', String(stats.dialed || 0));
  let b = errs.length
    ? callinDeskSay('callin.desk.brief.b.err', '{n} hata son 30 dk’da ({why}).')
      .replace('{n}', String(errs.length))
      .replace('{why}', errs[0].code || 'fail')
    : callinDeskSay('callin.desk.brief.b.ok', 'Son 30 dk’da hata yok.');
  if (cost && (cost.estimate > 0 || cost.billed > 0)) {
    b += ' ' + callinDeskSay('callin.desk.brief.cost', 'YZ tahmini {m}.')
      .replace('{m}', callinDeskMoney(cost.estimate || cost.billed, cost.currency));
  }
  return { a, b };
}

function callinDeskBriefHtml() {
  const firmId = callinDeskFirmId();
  const day = new Date().toISOString().slice(0, 10);
  let skip = false;
  try { skip = sessionStorage.getItem(`mb_callin_brief_${firmId}_${day}`) === '1'; } catch (e) {}
  if (skip) return '';
  const { a, b } = callinDeskBriefText();
  return `<div class="callin-brief" id="callin-brief">
    <div class="callin-brief-body">
      <div class="callin-brief-kicker">${callinDeskEsc(callinDeskSay('callin.desk.brief.title', 'Bugün'))}</div>
      <p>${callinDeskEsc(a)}</p>
      <p>${callinDeskEsc(b)}</p>
    </div>
    <div class="callin-brief-act">
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskBriefCopy()">${callinDeskEsc(callinDeskSay('callin.desk.brief.copy', 'Kopyala'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskBriefShare()">${callinDeskEsc(callinDeskSay('callin.desk.brief.share', 'Ekibe'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskBriefDismiss()">${callinDeskEsc(callinDeskSay('callin.desk.brief.dismiss', 'Tamam'))}</button>
    </div>
  </div>`;
}

function callinDeskBriefDismiss() {
  const firmId = callinDeskFirmId();
  const day = new Date().toISOString().slice(0, 10);
  try { sessionStorage.setItem(`mb_callin_brief_${firmId}_${day}`, '1'); } catch (e) {}
  document.getElementById('callin-brief')?.remove();
}

function callinDeskBriefPlain() {
  const { a, b } = callinDeskBriefText();
  return `${a}\n${b}`;
}

async function callinDeskBriefCopy() {
  const text = callinDeskBriefPlain();
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (typeof toast === 'function') toast(callinDeskSay('callin.desk.brief.copied', 'Brif kopyalandı.'), 'ok');
  } catch (e) {
    if (typeof toast === 'function') toast(callinDeskSay('callin.desk.brief.copy_fail', 'Kopyalanamadı.'), 'err');
  }
}

function callinDeskBriefShare() {
  const text = callinDeskBriefPlain();
  if (typeof toggleTeamChat === 'function') toggleTeamChat(true);
  const inp = document.getElementById('team-chat-input');
  if (inp) {
    inp.value = text;
    inp.focus();
  }
  if (typeof toast === 'function') {
    toast(callinDeskSay('callin.desk.brief.shared', 'Sohbete yapıştırıldı. Gönder’e bas.'), 'ok');
  }
}

function callinDeskWeekHtml() {
  const week = _callinDesk.week;
  if (!week || !(week.dialed > 0 || week.monday)) return '';
  const cost = callinDeskMoney(week.estimate || 0, _callinDesk.cost?.currency);
  const best = week.bestName
    ? callinDeskSay('callin.desk.week.best', 'En iyi: {name} ({n} randevu)')
      .replace('{name}', week.bestName)
      .replace('{n}', String(week.bestAppt || 0))
    : callinDeskSay('callin.desk.week.nobest', 'Henüz öne çıkan personel yok.');
  const title = week.monday
    ? callinDeskSay('callin.desk.week.monday', 'Haftalık YZ özeti')
    : callinDeskSay('callin.desk.week.title', 'Son 7 gün YZ');
  return `<section class="callin-week${week.monday ? ' is-monday' : ''}">
    <div class="callin-week-title">${callinDeskEsc(title)}</div>
    <div class="callin-week-bits">
      <span><b>${week.appt || 0}</b> ${callinDeskEsc(callinDeskSay('callin.desk.kpi.appt', 'Randevu'))}</span>
      <span><b>${week.dialed || 0}</b> ${callinDeskEsc(callinDeskSay('callin.desk.kpi.dial', 'Bugün aranan'))}</span>
      <span><b>${callinDeskEsc(cost)}</b> ${callinDeskEsc(callinDeskSay('callin.desk.kpi.cost', 'YZ maliyet'))}</span>
    </div>
    <div class="callin-week-best">${callinDeskEsc(best)}</div>
  </section>`;
}

function callinDeskFixAlert(kind) {
  if (kind === 'staff' || kind === 'gate' || kind === 'eleven' || kind === 'ready' || kind === 'nostaff') {
    callinTab('staff');
    setTimeout(() => {
      if (kind === 'eleven' || kind === 'nokey_el') {
        const eng = [...document.querySelectorAll('[id^="ai-engine-"]')].find((el) => el.value === 'super')
          || document.querySelector('[id^="ai-engine-"]');
        const card = eng?.closest('.ai-card');
        card?.classList.add('is-flash');
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const btn = card?.querySelector('button[onclick*="mbAiElevenSetup"]');
        btn?.classList.add('is-flash');
        setTimeout(() => { card?.classList.remove('is-flash'); btn?.classList.remove('is-flash'); }, 3500);
        return;
      }
      const spoken = document.getElementById('ai-spoken');
      const card = spoken?.closest('.ai-card');
      card?.classList.add('is-flash');
      spoken?.focus();
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card?.classList.remove('is-flash'), 3500);
    }, 450);
    return;
  }
  callinTab(kind === 'quota' ? 'run' : (kind || 'run'));
}

function callinDeskPaint() {
  const root = document.getElementById('callin-desk');
  if (!root) return;
  const live = callinDeskLiveCounts();
  const stats = _callinDesk.stats || { dialed: 0, appt: 0, miss: 0, neg: 0, talk: 0, cb: 0, vm: 0 };
  const cmp = _callinDesk.compare || { ai: stats, human: { dialed: 0, appt: 0, miss: 0, neg: 0, talk: 0 } };
  const cost = _callinDesk.cost;
  const alerts = callinDeskAlerts();
  const errs = callinDeskErrors().slice(0, 8);
  const retries = callinDeskRetries().filter((row) => row.at > Date.now()).slice(0, 6);
  const mark = typeof mbAiMarkHtml === 'function' ? mbAiMarkHtml('is-blink') : '';
  const chipsOn = callinDeskOutChipsOn();
  const costLabel = cost
    ? callinDeskMoney(cost.estimate || cost.billed || 0, cost.currency)
    : '—';
  const costSub = cost && cost.mins > 0
    ? `${cost.mins.toFixed(1)} ${callinDeskSay('callin.desk.kpi.min', 'dk')}`
    : '';
  root.hidden = false;
  root.innerHTML = `
  ${callinDeskBriefHtml()}
  ${callinDeskWeekHtml()}
  <div class="callin-desk-top">
    <div class="callin-kpi">
      <div class="callin-kpi-card is-run"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.run', 'Çalışan YZ'))}</span><b>${live.running}<small>/${live.staff}</small></b></div>
      <div class="callin-kpi-card is-line"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.open', 'Açık hat'))}</span><b>${live.open}</b></div>
      <div class="callin-kpi-card"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.dial', 'Bugün aranan'))}</span><b>${stats.dialed}</b></div>
      <div class="callin-kpi-card is-ok"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.appt', 'Randevu'))}</span><b>${stats.appt}</b></div>
      <div class="callin-kpi-card is-cost" title="${callinDeskEsc(callinDeskSay('callin.desk.kpi.cost_tip', 'Dakika × YZ fiyatı (tahmini)'))}"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.cost', 'YZ maliyet'))}</span><b>${callinDeskEsc(costLabel)}${costSub ? `<small>${callinDeskEsc(costSub)}</small>` : ''}</b></div>
    </div>
    <div class="callin-desk-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskGoLive()">${mark} ${callinDeskEsc(callinDeskSay('callin.desk.live', 'Canlıya git'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskToggleOutChips()">${callinDeskEsc(chipsOn ? callinDeskSay('callin.desk.out.hide', 'Sonuçları gizle') : callinDeskSay('callin.desk.out.show', 'Sonuç dağılımı'))}</button>
      <button type="button" class="btn btn-ghost btn-sm${callinDeskSoundOn() ? ' is-on' : ''}" onclick="callinDeskToggleSound()">${callinDeskEsc(callinDeskSoundOn() ? callinDeskSay('callin.desk.sound.on', 'Ses açık') : callinDeskSay('callin.desk.sound.off', 'Ses kapalı'))}</button>
      <button type="button" class="btn btn-ghost btn-sm${callinDeskEveningOn() ? ' is-on' : ''}" onclick="callinDeskToggleEvening()">${callinDeskEsc(callinDeskEveningOn() ? callinDeskSay('callin.desk.evening.btn_on', '18:00 rapor açık') : callinDeskSay('callin.desk.evening.btn_off', '18:00 rapor'))}</button>
      ${live.running ? `<button type="button" class="btn btn-ghost btn-sm is-danger" onclick="callinDeskStopAll()">${callinDeskEsc(callinDeskSay('callin.desk.stop_all', 'Hepsini durdur'))}</button>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskRefresh()">${callinDeskEsc(callinDeskSay('callin.desk.refresh', 'Yenile'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="callinTab('run'); callinDeskAskNow()">${callinDeskEsc(callinDeskSay('callin.desk.now', 'Şimdi bir kişi ara'))}</button>
    </div>
  </div>
  ${callinDeskOutChipsHtml(stats)}
  ${alerts.length ? `<div class="callin-alerts">${alerts.map((row) => {
    const fix = row.fix || (row.text?.includes?.('Eleven') ? 'eleven' : (row.action === 'staff' ? 'gate' : row.action));
    const click = row.action === 'staff' || fix === 'eleven' || fix === 'gate' || fix === 'quota'
      ? `callinDeskFixAlert('${callinDeskEsc(fix)}')`
      : `callinTab('${row.action}')`;
    return `<button type="button" class="callin-alert is-${row.tone}" onclick="${click}">${callinDeskEsc(row.text)}</button>`;
  }).join('')}</div>` : ''}
  <div class="callin-desk-grid">
    <section class="callin-panel">
      <header class="callin-panel-hd">
        <div class="callin-panel-title">${callinDeskEsc(callinDeskSay('callin.desk.cmp.title', 'Bugün: YZ vs insan'))}</div>
        <span class="callin-panel-sub">${callinDeskEsc(callinDeskSay('callin.desk.cmp.sub', 'Yeşil YZ · Gri insan'))}</span>
      </header>
      <div class="callin-cmp">
        ${callinDeskBar(cmp.ai, cmp.human, 'dialed')}
        ${callinDeskBar(cmp.ai, cmp.human, 'appt')}
        ${callinDeskBar(cmp.ai, cmp.human, 'miss')}
        ${callinDeskBar(cmp.ai, cmp.human, 'talk')}
      </div>
    </section>
    <section class="callin-panel">
      <header class="callin-panel-hd">
        <div class="callin-panel-title">${callinDeskEsc(callinDeskSay('callin.desk.err.title', 'Son hatalar'))}</div>
        ${errs.length ? `<button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskClearErrors()">${callinDeskEsc(callinDeskSay('callin.desk.err.clear', 'Temizle'))}</button>` : ''}
      </header>
      ${errs.length ? `<div class="callin-err-list">${errs.map((row) => {
        const label = ({
          gate: callinDeskSay('qc.callin.gate', 'Kapı / fiyat'),
          phone: callinDeskSay('qc.callin.phone', 'Numara'),
          busy: callinDeskSay('qc.callin.busy', 'Meşgul'),
          nokey_el: callinDeskSay('qc.callin.nokey_el', 'ElevenLabs anahtarı'),
          fail: callinDeskSay('qc.callin.fail', 'Arama çıkmadı'),
        })[row.code] || row.code;
        return `<div class="callin-err-row">
          <div class="callin-err-main"><b>${callinDeskEsc(row.staffName || 'YZ')}</b> · ${callinDeskEsc(row.who || '—')}<div class="callin-err-why">${callinDeskEsc(label)}${row.detail ? ` · ${callinDeskEsc(row.detail)}` : ''}</div></div>
          <div class="callin-err-act">
            <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskRetry('${callinDeskEsc(row.id)}')">${callinDeskEsc(callinDeskSay('callin.desk.err.retry', 'Tekrar dene'))}</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskRetryLater('${callinDeskEsc(row.id)}',30)">${callinDeskEsc(callinDeskSay('callin.desk.err.later', '30 dk sonra'))}</button>
          </div>
        </div>`;
      }).join('')}</div>` : `<p class="callin-panel-empty">${callinDeskEsc(callinDeskSay('callin.desk.err.empty', 'Son 30 dk’da hata yok.'))}</p>`}
      ${retries.length ? `<div class="callin-retry-list">${retries.map((row) => {
        const left = Math.max(1, Math.round((row.at - Date.now()) / 60000));
        return `<div class="callin-retry-row">${callinDeskEsc(callinDeskSay('callin.desk.err.scheduled', '{who} · {n} dk sonra').replace('{who}', row.who || '—').replace('{n}', String(left)))}
          <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskCancelRetry('${callinDeskEsc(row.id)}')">${callinDeskEsc(callinDeskSay('callin.desk.err.cancel', 'İptal'))}</button></div>`;
      }).join('')}</div>` : ''}
    </section>
    ${callinDeskHeatHtml()}
    ${callinDeskAbHtml()}
  </div>`;
  if (typeof mbAiStaffScoreHtml === 'function') {
    Object.keys(_callinDesk.byStaff || {}).forEach((id) => {
      const el = document.getElementById(`ai-run-score-${id}`);
      if (!el) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = mbAiStaffScoreHtml(id);
      if (wrap.firstElementChild) el.replaceWith(wrap.firstElementChild);
    });
  }
}

function callinQueueHealthPaint(plan) {
  const box = document.getElementById('callin-queue-health');
  if (!box) return;
  const pref = typeof tourPref === 'function' ? tourPref() : {};
  const esik = Math.max(1, Number(pref.veriEsik) || 500);
  const pick = plan?.pick || null;
  const rows = Array.isArray(plan?.rows) ? plan.rows : (pick ? [pick] : []);
  const pending = rows.reduce((sum, row) => sum + (Number(row.pending) || 0), 0);
  const focusPending = Number(pick?.pending) || pending;
  const focusName = pick?.name || callinDeskSay('callin.queue.all', 'Tüm kampanyalar');
  const gunluk = (typeof _ariaGunluk !== 'undefined' && _ariaGunluk) || null;
  const today = typeof tourClock === 'function' ? tourClock().ymd : new Date().toISOString().slice(0, 10);
  const lines = gunluk && gunluk.day === today && Array.isArray(gunluk.lines) ? gunluk.lines : [];
  const filled = lines.reduce((sum, line) => sum + (Number(line.added) || 0) + (Number(line.moved) || 0), 0);
  const lastFill = [...lines].reverse().find((line) => (Number(line.added) || 0) + (Number(line.moved) || 0) > 0);
  let underText = '';
  if (focusPending < esik) {
    underText = callinDeskSay('callin.queue.under', 'Eşiğin altında · {n} kişi lazım')
      .replace('{n}', String(esik - focusPending));
  } else {
    const surplus = focusPending - esik;
    const dialed = Number(_callinDesk.stats?.dialed) || 0;
    const hours = Math.max(0.25, (Date.now() - new Date().setHours(0, 0, 0, 0)) / 3600000);
    const perHour = dialed / hours;
    if (surplus > 0 && perHour > 0.2) {
      const mins = Math.round((surplus / perHour) * 60);
      underText = callinDeskSay('callin.queue.until', 'Eşiğe ~{n} dk (tahmini)').replace('{n}', String(Math.max(1, mins)));
    } else {
      underText = callinDeskSay('callin.queue.ok', 'Eşik üstü · {n} fazla').replace('{n}', String(surplus));
    }
  }
  const lastTxt = lastFill?.at
    ? callinDeskSay('callin.queue.last', 'Son doldurma {t}').replace('{t}', lastFill.at)
    : callinDeskSay('callin.queue.nolast', 'Bugün doldurma yok');
  const pct = Math.max(0, Math.min(100, Math.round((focusPending / esik) * 100)));
  const tone = focusPending < esik ? 'is-bad' : focusPending < esik * 1.2 ? 'is-mid' : 'is-ok';
  const fillBtn = focusPending < esik
    ? `<button type="button" class="btn btn-primary btn-sm" onclick="callinQueueFillNow()">${callinDeskEsc(callinDeskSay('callin.queue.fill', 'Şimdi uygula'))}</button>`
    : '';
  box.hidden = false;
  box.innerHTML = `<div class="callin-qh ${tone}">
    <div class="callin-qh-main">
      <div class="callin-qh-hd">
        <div class="callin-qh-title">${callinDeskEsc(callinDeskSay('callin.queue.title', 'Sıra sağlığı'))}</div>
        ${fillBtn}
      </div>
      <div class="callin-qh-bits">
        <span><b>${callinDeskEsc(focusName)}</b></span>
        <span>${callinDeskEsc(callinDeskSay('callin.queue.pending', '{n} bekliyor').replace('{n}', String(focusPending)))}</span>
        <span>${callinDeskEsc(callinDeskSay('callin.queue.esik', 'eşik {n}').replace('{n}', String(esik)))}</span>
        <span>${callinDeskEsc(callinDeskSay('callin.queue.filled', 'bugün +{n}').replace('{n}', String(filled)))}</span>
      </div>
      <div class="callin-qh-sub">${callinDeskEsc(underText)} · ${callinDeskEsc(lastTxt)}</div>
      <div class="tour-fill callin-qh-fill"><span style="width:${pct}%"></span></div>
    </div>
  </div>`;
}

function callinQueueFillNow() {
  if (typeof tourRunNow === 'function') void tourRunNow();
  else if (typeof toast === 'function') toast(callinDeskSay('callin.queue.fill_wait', 'Sıra motoru yükleniyor…'), 'warn');
}

async function callinDeskRefresh() {
  await callinDeskLoadStats();
  if (typeof mbCacheAiStaff === 'function') await mbCacheAiStaff(callinDeskFirmId());
  callinDeskPaint();
  if (typeof _tourPlan !== 'undefined' && _tourPlan) callinQueueHealthPaint(_tourPlan);
}

function callinDeskTickRetries() {
  const list = callinDeskRetries();
  const due = list.filter((row) => row.at <= Date.now());
  if (!due.length) return;
  window._aiDeskRetries = list.filter((row) => row.at > Date.now());
  due.forEach((row) => {
    if (typeof toast === 'function') {
      toast(callinDeskSay('callin.desk.err.firing', 'Zamanlanan tekrar: {who}').replace('{who}', row.who || '—'), 'ok');
    }
    callinTab('run');
    if (row.contactId && typeof mbAskRunCallNow === 'function') {
      void mbAskRunCallNow(row.staffId || '', row.contactId);
    } else if (typeof mbAskRunCallNow === 'function') {
      void mbAskRunCallNow(row.staffId || '');
    }
  });
  callinDeskPaint();
}

function callinDeskEveningTick() {
  if (!callinDeskEveningOn()) return;
  const now = new Date();
  if (now.getHours() < 18) return;
  const day = now.toISOString().slice(0, 10);
  const firmId = callinDeskFirmId() || 'x';
  const key = `mb_callin_evening_${firmId}_${day}`;
  try { if (localStorage.getItem(key) === '1') return; } catch (e) { return; }
  try { localStorage.setItem(key, '1'); } catch (e) {}
  const { a, b } = callinDeskBriefText();
  const title = callinDeskSay('callin.desk.evening.title', '18:00 gece raporu');
  callinDeskBeep('ok');
  if (typeof toast === 'function') toast(`${title}: ${a} ${b}`, 'ok');
  document.getElementById('callin-evening-pop')?.remove();
  const pop = document.createElement('div');
  pop.id = 'callin-evening-pop';
  pop.className = 'callin-evening-pop';
  pop.innerHTML = `<div class="callin-evening-card" role="dialog" aria-modal="true">
    <div class="callin-brief-kicker">${callinDeskEsc(title)}</div>
    <p>${callinDeskEsc(a)}</p>
    <p>${callinDeskEsc(b)}</p>
    <div class="callin-brief-act">
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskBriefCopy()">${callinDeskEsc(callinDeskSay('callin.desk.brief.copy', 'Kopyala'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskBriefShare()">${callinDeskEsc(callinDeskSay('callin.desk.brief.share', 'Ekibe'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('callin-evening-pop')?.remove()">${callinDeskEsc(callinDeskSay('callin.desk.brief.dismiss', 'Tamam'))}</button>
    </div>
  </div>`;
  pop.addEventListener('click', (ev) => { if (ev.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

function callinDeskStart() {
  if (!_callinDesk.timer) {
    void callinDeskRefresh();
    _callinDesk.timer = setInterval(() => {
      if (!document.getElementById('page-tour')?.classList.contains('active')) return;
      void callinDeskRefresh();
    }, 45000);
  }
  if (!_callinDesk.retryTimer) {
    _callinDesk.retryTimer = setInterval(() => {
      callinDeskTickRetries();
    }, 20000);
  }
  if (!_callinDesk.eveningTimer) {
    callinDeskEveningTick();
    _callinDesk.eveningTimer = setInterval(() => { callinDeskEveningTick(); }, 60000);
  }
}

function callinDeskGoLive() {
  try { sessionStorage.setItem('mb_live_focus_ai', '1'); } catch (e) {}
  if (typeof toggleLiveFloorAiOnly === 'function') {
    try {
      if (!window._liveFloorAiOnly) toggleLiveFloorAiOnly(true);
    } catch (e) {}
  } else {
    window._liveFloorAiOnly = true;
  }
  if (typeof navigate === 'function') navigate('supervisor');
}

function callinDeskClearErrors() {
  window._aiDeskErrors = [];
  callinDeskPaint();
}

function callinDeskRetry(id) {
  const row = callinDeskErrors().find((item) => String(item.id) === String(id));
  if (!row) return;
  callinTab('run');
  if (row.contactId && typeof mbAskRunCallNow === 'function') {
    void mbAskRunCallNow(row.staffId || '', row.contactId);
    return;
  }
  if (typeof mbAskRunCallNow === 'function') {
    void mbAskRunCallNow(row.staffId || '');
    return;
  }
  if (typeof toast === 'function') toast(callinDeskSay('callin.desk.err.retry_hint', 'YZ arama’dan personeli çalıştır veya Şimdi ara ile tekrar dene.'), 'warn');
}

function callinDeskRetryLater(id, mins) {
  const row = callinDeskErrors().find((item) => String(item.id) === String(id));
  if (!row) return;
  const wait = Math.max(1, Number(mins) || 30);
  const list = callinDeskRetries();
  list.push({
    id: `r${Date.now()}`,
    errId: row.id,
    at: Date.now() + wait * 60000,
    staffId: row.staffId,
    contactId: row.contactId,
    who: row.who || row.phone || '',
  });
  window._aiDeskRetries = list.slice(-20);
  if (typeof toast === 'function') {
    toast(callinDeskSay('callin.desk.err.later_ok', '{n} dk sonra tekrar denenecek.').replace('{n}', String(wait)), 'ok');
  }
  callinDeskPaint();
}

function callinDeskCancelRetry(id) {
  window._aiDeskRetries = callinDeskRetries().filter((row) => String(row.id) !== String(id));
  callinDeskPaint();
}

function callinDeskAskNow() {
  if (typeof mbAskRunCallNow === 'function') {
    void mbAskRunCallNow();
    return;
  }
  if (typeof toast === 'function') toast(callinDeskSay('callin.desk.now.wait', 'YZ arama yükleniyor…'), 'warn');
}

async function callinDeskStopAll() {
  if (typeof mbAiStopAll !== 'function') {
    if (typeof toast === 'function') toast(callinDeskSay('callin.desk.stop_wait', 'YZ arama yükleniyor…'), 'warn');
    callinTab('run');
    return;
  }
  const ok = typeof mbConfirm === 'function'
    ? await mbConfirm(callinDeskSay('callin.desk.stop_ask', 'Çalışan tüm YZ personeli dursun mu?'), callinDeskSay('callin.desk.stop_all', 'Hepsini durdur'))
    : window.confirm(callinDeskSay('callin.desk.stop_ask', 'Çalışan tüm YZ personeli dursun mu?'));
  if (!ok) return;
  await mbAiStopAll();
  callinDeskPaint();
}

try {
  window.callinDeskPushError = callinDeskPushError;
  window.callinDeskRefresh = callinDeskRefresh;
  window.callinDeskStart = callinDeskStart;
  window.callinDeskGoLive = callinDeskGoLive;
  window.callinDeskClearErrors = callinDeskClearErrors;
  window.callinDeskRetry = callinDeskRetry;
  window.callinDeskRetryLater = callinDeskRetryLater;
  window.callinDeskCancelRetry = callinDeskCancelRetry;
  window.callinDeskAskNow = callinDeskAskNow;
  window.callinDeskPaint = callinDeskPaint;
  window.callinDeskToggleOutChips = callinDeskToggleOutChips;
  window.callinDeskBriefDismiss = callinDeskBriefDismiss;
  window.callinDeskBriefCopy = callinDeskBriefCopy;
  window.callinDeskBriefShare = callinDeskBriefShare;
  window.callinDeskFixAlert = callinDeskFixAlert;
  window.callinDeskStopAll = callinDeskStopAll;
  window.callinDeskToggleSound = callinDeskToggleSound;
  window.callinDeskToggleEvening = callinDeskToggleEvening;
  window.callinDeskBeep = callinDeskBeep;
  window.callinQueueHealthPaint = callinQueueHealthPaint;
  window.callinQueueFillNow = callinQueueFillNow;
  window.callinDeskQuota = callinDeskQuota;
} catch (_) {}
