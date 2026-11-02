// Callin masaüstü: özet KPI, alarm, YZ/insan kıyas, hata panosu, canlı köprü.

const _callinDesk = {
  firmId: '',
  stats: null,
  compare: null,
  loading: false,
  timer: 0,
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
  callinDeskPaint();
}

function callinDeskDayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

async function callinDeskLoadStats() {
  const firmId = callinDeskFirmId();
  if (!firmId || typeof sb !== 'function') {
    _callinDesk.stats = null;
    _callinDesk.compare = null;
    return;
  }
  _callinDesk.firmId = firmId;
  _callinDesk.loading = true;
  const { gte, lt } = callinDeskDayRange();
  const aiQ = `call_logs?firm_id=eq.${firmId}&started_at=gte.${gte}&started_at=lt.${lt}&or=(work_type.eq.ai_sales,work_type.eq.ai_qc,ai_staff_id.not.is.null)&select=id,outcome,duration_sec,work_type,ai_staff_id&limit=800`;
  const huQ = `call_logs?firm_id=eq.${firmId}&started_at=gte.${gte}&started_at=lt.${lt}&ai_staff_id=is.null&work_type=not.in.(ai_sales,ai_qc)&select=id,outcome,duration_sec&limit=800`;
  const [aiRows, huRows] = await Promise.all([
    sb(aiQ).catch(() => []),
    sb(huQ).catch(() => []),
  ]);
  const tally = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    let dialed = list.length;
    let appt = 0;
    let miss = 0;
    let neg = 0;
    let talk = 0;
    list.forEach((row) => {
      const out = String(row.outcome || '').toLowerCase();
      const sec = Number(row.duration_sec) || 0;
      if (sec > 0) talk += 1;
      if (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)) appt += 1;
      else if (['no_answer', 'ulasilamadi', 'voicemail'].includes(out)) miss += 1;
      else if (['negative', 'basarisiz', 'dnc'].includes(out)) neg += 1;
    });
    return { dialed, appt, miss, neg, talk };
  };
  _callinDesk.stats = tally(aiRows);
  _callinDesk.compare = { ai: tally(aiRows), human: tally(huRows) };
  _callinDesk.loading = false;
}

function callinDeskLiveCounts() {
  const staff = (typeof _aiDesk !== 'undefined' && _aiDesk?.staff) || window._aiStaffByFirm?.[callinDeskFirmId()] || [];
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
    });
  }
  const staff = (typeof _aiDesk !== 'undefined' && _aiDesk?.staff) || [];
  if (!staff.length && ready) {
    alerts.push({
      tone: 'info',
      text: callinDeskSay('callin.desk.alert.nostaff', 'Henüz YZ personel yok. Personel kur’dan ekle.'),
      action: 'staff',
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
    });
  }
  if (errs.some((row) => row.code === 'gate')) {
    alerts.push({
      tone: 'err',
      text: callinDeskSay('callin.desk.alert.gate', 'Kapı kontrolü: şirket adı / fiyat / sonuç ayarı eksik.'),
      action: 'staff',
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

function callinDeskPaint() {
  const root = document.getElementById('callin-desk');
  if (!root) return;
  const live = callinDeskLiveCounts();
  const stats = _callinDesk.stats || { dialed: 0, appt: 0, miss: 0, neg: 0, talk: 0 };
  const cmp = _callinDesk.compare || { ai: stats, human: { dialed: 0, appt: 0, miss: 0, neg: 0, talk: 0 } };
  const alerts = callinDeskAlerts();
  const errs = callinDeskErrors().slice(0, 8);
  const mark = typeof mbAiMarkHtml === 'function' ? mbAiMarkHtml('is-blink') : '';
  root.hidden = false;
  root.innerHTML = `
  <div class="callin-desk-top">
    <div class="callin-kpi">
      <div class="callin-kpi-card is-run"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.run', 'Çalışan YZ'))}</span><b>${live.running}<small>/${live.staff}</small></b></div>
      <div class="callin-kpi-card is-line"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.open', 'Açık hat'))}</span><b>${live.open}</b></div>
      <div class="callin-kpi-card"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.dial', 'Bugün aranan'))}</span><b>${stats.dialed}</b></div>
      <div class="callin-kpi-card is-ok"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.appt', 'Randevu'))}</span><b>${stats.appt}</b></div>
      <div class="callin-kpi-card is-miss"><span class="callin-kpi-lab">${callinDeskEsc(callinDeskSay('callin.desk.kpi.miss', 'Cevapsız'))}</span><b>${stats.miss}</b></div>
    </div>
    <div class="callin-desk-actions">
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskGoLive()">${mark} ${callinDeskEsc(callinDeskSay('callin.desk.live', 'Canlıya git'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskRefresh()">${callinDeskEsc(callinDeskSay('callin.desk.refresh', 'Yenile'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="callinTab('run'); callinDeskAskNow()">${callinDeskEsc(callinDeskSay('callin.desk.now', 'Şimdi bir kişi ara'))}</button>
    </div>
  </div>
  ${alerts.length ? `<div class="callin-alerts">${alerts.map((row) => `<button type="button" class="callin-alert is-${row.tone}" onclick="callinTab('${row.action}')">${callinDeskEsc(row.text)}</button>`).join('')}</div>` : ''}
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
          <button type="button" class="btn btn-ghost btn-sm" onclick="callinDeskRetry('${callinDeskEsc(row.id)}')">${callinDeskEsc(callinDeskSay('callin.desk.err.retry', 'Tekrar dene'))}</button>
        </div>`;
      }).join('')}</div>` : `<p class="callin-panel-empty">${callinDeskEsc(callinDeskSay('callin.desk.err.empty', 'Son 30 dk’da hata yok.'))}</p>`}
    </section>
  </div>`;
}

async function callinDeskRefresh() {
  await callinDeskLoadStats();
  if (typeof mbCacheAiStaff === 'function') await mbCacheAiStaff(callinDeskFirmId());
  callinDeskPaint();
}

function callinDeskStart() {
  if (_callinDesk.timer) return;
  void callinDeskRefresh();
  _callinDesk.timer = setInterval(() => {
    if (!document.getElementById('page-tour')?.classList.contains('active')) return;
    void callinDeskRefresh();
  }, 45000);
}

function callinDeskGoLive() {
  try { sessionStorage.setItem('mb_live_focus_ai', '1'); } catch (e) {}
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
  if (typeof toast === 'function') toast(callinDeskSay('callin.desk.err.retry_hint', 'YZ arama’dan personeli çalıştır veya Şimdi ara ile tekrar dene.'), 'warn');
}

function callinDeskAskNow() {
  if (typeof mbAskRunCallNow === 'function') {
    void mbAskRunCallNow();
    return;
  }
  if (typeof toast === 'function') toast(callinDeskSay('callin.desk.now.wait', 'YZ arama yükleniyor…'), 'warn');
}

try {
  window.callinDeskPushError = callinDeskPushError;
  window.callinDeskRefresh = callinDeskRefresh;
  window.callinDeskStart = callinDeskStart;
  window.callinDeskGoLive = callinDeskGoLive;
  window.callinDeskClearErrors = callinDeskClearErrors;
  window.callinDeskRetry = callinDeskRetry;
  window.callinDeskAskNow = callinDeskAskNow;
  window.callinDeskPaint = callinDeskPaint;
} catch (_) {}
