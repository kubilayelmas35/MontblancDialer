// Üst çubuk kampanya bildirimi ve canlı görüşme / bekleme kartları.
// Personelin açık kampanyası tarayıcıda durur; uyarı o listeyi firmanın bildirimiyle karşılaştırır.

let _opsDirective = { ids: [], at: '', by: '' };
let _opsAlerts = {
  callMin: 4, goldAfter: 1, waitMin: 1,
  roles: ['agent'], effect: 'aurora', campRoles: ['agent'], campEffect: 'aurora', mesaiEffect: 'aurora',
  appt: true, campaign: true, wrongAfter: 2, dataMin: 1000,
  sounds: { volume: 70, due: true, soon: true, hour: true, slot: true, wrong: true, camp: true, data: true, shift_on: true, break: true, break_end: true, shift: true, call: true, wait: true, pick: true, drop: true, clear: true, move: true, results: {} },
};
let _opsNotifPrimed = false;
let _opsWrongSig = '';
let _opsCampNames = {};
let _opsDirectiveTimer = null;
let _opsWrongTimer = null;
let _opsCampStripTimer = null;
let _opsCampShownAt = '';
let _opsDataAt = 0;
let _opsBootAt = Date.now();
const _opsDataLow = new Set();
const _opsSeen = {};
const _opsDismiss = new Set();
const _opsBeeped = new Set();
const OPS_SEEN_MS = 90000;
const OPS_CALL_SEC = 240;
const OPS_GOLD_SEC = 300;
const OPS_WAIT_SEC = 60;

function opsEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function opsFirmId() {
  const id = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  return id ? String(id) : '';
}

function opsActiveIds() {
  const ids = (typeof _activeCampIds !== 'undefined' && Array.isArray(_activeCampIds)) ? _activeCampIds : [];
  return ids.map((id) => String(id || '')).filter(Boolean);
}

function opsCampName(id) {
  const key = String(id || '');
  if (_opsCampNames[key]) return _opsCampNames[key];
  const row = (typeof campaigns !== 'undefined' && Array.isArray(campaigns))
    ? campaigns.find((c) => String(c?.id) === key)
    : null;
  const name = String(row?.name || '').trim();
  return name && !/^[0-9a-f-]{8,}$/i.test(name) ? name : '';
}

function opsNamedCamps(ids) {
  return (ids || []).map(opsCampName).filter(Boolean);
}

async function opsEnsureCampNames(ids) {
  const missing = (ids || []).map(String).filter((id) => id && !opsCampName(id));
  if (!missing.length || typeof sb !== 'function') return;
  try {
    const rows = await sb(`campaigns?id=in.(${missing.join(',')})&select=id,name`) || [];
    rows.forEach((c) => {
      const name = String(c?.name || '').trim();
      if (c?.id && name) _opsCampNames[c.id] = name;
    });
  } catch (e) {}
}

function opsSay(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

const OPS_TONE_IDS = ['chime', 'bell', 'soft', 'glass', 'pop', 'alert', 'win', 'spark', 'fall', 'lose'];
const OPS_TONE_LABELS = { chime: 'Çan', bell: 'Zil', soft: 'Yumuşak', glass: 'Cam', pop: 'Kısa', alert: 'Uyarı', win: 'Kazanç', spark: 'Parıltı', fall: 'Düşüş', lose: 'Kayıp' };
const OPS_TONE_DEFAULT = {
  due: 'chime', soon: 'soft', hour: 'bell', slot: 'glass', wrong: 'pop', camp: 'chime', data: 'alert', shift_on: 'bell', break: 'soft', break_end: 'soft', shift: 'bell', call: 'bell', wait: 'soft',
  pick: 'alert', drop: 'soft', clear: 'lose', move: 'bell',
};
const OPS_MOOD_DEFAULT = {
  due: 'neutral', soon: 'neutral', hour: 'neutral', slot: 'good', wrong: 'bad', camp: 'neutral', data: 'bad', shift_on: 'neutral', break: 'neutral', break_end: 'neutral', shift: 'neutral', call: 'neutral', wait: 'neutral',
  pick: 'good', drop: 'neutral', clear: 'bad', move: 'neutral',
};
const OPS_TONE_NOTES = {
  chime: [[523, 0], [659, 0.13], [784, 0.26]],
  bell: [[880, 0], [1175, 0.04]],
  soft: [[440, 0], [554, 0.18]],
  glass: [[1047, 0], [1568, 0.1]],
  pop: [[392, 0], [523, 0.08]],
  alert: [[660, 0], [880, 0.12], [660, 0.24]],
  win: [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.32]],
  spark: [[784, 0], [988, 0.08], [1175, 0.16], [1568, 0.28]],
  fall: [[660, 0], [554, 0.14], [440, 0.28]],
  lose: [[392, 0], [330, 0.16], [262, 0.34]],
};

function opsSoundKey(kind) {
  if (kind === 'wv' || kind === 'due') return 'due';
  if (kind === 'gold' || kind === 'call') return 'call';
  return kind;
}

function opsMood(value, fallback) {
  return value === 'good' || value === 'bad' || value === 'neutral' ? value : (fallback || 'neutral');
}

function opsHex(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : (fallback || '#64748b');
}

function opsEntryColor(raw, moodFallback) {
  const mood = opsMood(moodFallback, 'neutral');
  const fromMood = mood === 'good' ? '#16a34a' : mood === 'bad' ? '#dc2626' : '#64748b';
  if (raw && typeof raw === 'object') return opsHex(raw.color, fromMood);
  return fromMood;
}

function opsTint(hex) {
  const n = parseInt(String(hex || '#64748b').slice(1), 16);
  const mix = (c) => Math.round(c * 0.18 + 255 * 0.82);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

const OPS_AGENT_SOUNDS = ['due', 'soon', 'hour', 'wrong', 'camp', 'shift_on', 'break', 'break_end', 'shift', 'clear', 'move'];

function opsIsAgentNotif() {
  return String(currentUser?.role || '') === 'agent';
}

function opsMineKey() {
  return `mb_ops_mine_${currentUser?.id || '0'}`;
}

function opsMinePrefs() {
  if (!opsIsAgentNotif()) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(opsMineKey()) || 'null');
    return raw && typeof raw === 'object' ? raw : null;
  } catch (e) {
    return null;
  }
}

function opsApplyMineEntry(base, mine) {
  if (!mine || typeof mine !== 'object') return base;
  return {
    on: mine.on !== false,
    tone: OPS_TONE_IDS.includes(mine.tone) ? mine.tone : base.tone,
    mood: base.mood,
    color: opsHex(mine.color, base.color),
  };
}

function opsHeardVolume() {
  const mine = opsMinePrefs();
  if (mine && mine.volume != null && mine.volume !== '') return opsClamp(mine.volume, 70, 0, 100);
  return _opsAlerts.sounds?.volume;
}

function opsPickedColor(key, fallback) {
  const el = document.querySelector(`[data-color-key="${key}"]`);
  return el?.value ? opsHex(el.value, fallback) : fallback;
}

function opsPaintAgentNotif(force) {
  const card = document.getElementById('notif-settings-card');
  if (!card) return;
  const agent = force === true || (force !== false && opsIsAgentNotif());
  card.classList.toggle('is-agent', agent);
}

function opsSaveMineNotif() {
  const card = document.getElementById('notif-settings-card');
  if (!card) return;
  const all = opsCollectSounds(card);
  const sounds = {};
  OPS_AGENT_SOUNDS.forEach((key) => { if (all[key]) sounds[key] = all[key]; });
  try {
    localStorage.setItem(opsMineKey(), JSON.stringify({ volume: all.volume, sounds, results: all.results || {} }));
  } catch (e) {}
  toast(opsSay('ops.panel.saved', 'Bildirim ayarları kaydedildi'), 'ok');
}

function opsSoundEntry(key) {
  const raw = _opsAlerts.sounds?.[key];
  const tone = OPS_TONE_DEFAULT[key] || 'chime';
  const mood = OPS_MOOD_DEFAULT[key] || 'neutral';
  const firm = raw && typeof raw === 'object'
    ? { on: raw.on !== false, tone: OPS_TONE_IDS.includes(raw.tone) ? raw.tone : tone, mood: opsMood(raw.mood, mood), color: opsEntryColor(raw, mood) }
    : { on: raw !== false, tone, mood, color: opsEntryColor(raw, mood) };
  return opsApplyMineEntry(firm, opsMinePrefs()?.sounds?.[key]);
}

function opsResultToneDefault(key) {
  const k = String(key || '');
  if (k === 'basarili') return 'win';
  if (k === 'basarisiz' || k === 'iptal') return 'lose';
  if (k === 'ulasilamadi') return 'alert';
  if (k === 'beklemede') return 'soft';
  if (k === 'qc_bekleniyor') return 'chime';
  return 'soft';
}

function opsResultMoodDefault(key) {
  const k = String(key || '');
  if (k === 'basarili') return 'good';
  if (k === 'basarisiz' || k === 'iptal' || k.includes('olumsuz')) return 'bad';
  return 'neutral';
}

function opsResultEntry(key) {
  const raw = _opsAlerts.sounds?.results?.[key];
  const tone = opsResultToneDefault(key);
  const mood = opsResultMoodDefault(key);
  const firm = raw && typeof raw === 'object'
    ? { on: raw.on !== false, tone: OPS_TONE_IDS.includes(raw.tone) ? raw.tone : tone, mood: opsMood(raw.mood, mood), color: opsEntryColor(raw, mood) }
    : { on: true, tone, mood, color: opsEntryColor(null, mood) };
  return opsApplyMineEntry(firm, opsMinePrefs()?.results?.[key]);
}

function opsSoundOn(kind) {
  return opsSoundEntry(opsSoundKey(kind)).on;
}

function opsPlayTone(tone, volume) {
  if (window.__opsMute) return;
  const notes = OPS_TONE_NOTES[tone] || OPS_TONE_NOTES.chime;
  const level = opsClamp(volume, 70, 0, 100);
  if (!level) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const peak = 0.02 + (level / 100) * 0.05;
    notes.forEach(([hz, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const start = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.46);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1400);
  } catch (e) {}
}

function opsCue(kind) {
  if (!opsSoundOn(kind)) return;
  opsPlayTone(opsSoundEntry(opsSoundKey(kind)).tone, opsHeardVolume());
}

function opsPreviewSound(kind) {
  const picked = document.querySelector(`[data-tone="${kind}"]`)?.value;
  const entry = String(kind).startsWith('result:') ? opsResultEntry(kind.slice(7)) : opsSoundEntry(opsSoundKey(kind));
  const tone = OPS_TONE_IDS.includes(picked) ? picked : entry.tone;
  const vol = Number(document.getElementById('ops-sound-vol')?.value);
  opsPlayTone(tone, Number.isFinite(vol) ? vol : opsHeardVolume());
}

const _opsHourSeen = new Set();
function opsPaintApptStrip(items) {
  const bar = document.getElementById('ops-appt-strip');
  if (!bar) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    bar.hidden = true;
    bar.textContent = '';
    return;
  }
  bar.textContent = rows.map(({ w, min }) => `${w?.nachname || '—'} · ${min} dk`).join('   ·   ');
  bar.hidden = false;
  let fresh = false;
  rows.forEach(({ w, min }) => {
    const bucket = min <= 30 ? '30' : '60';
    const key = `${w?.id}:${bucket}`;
    if (!w?.id || _opsHourSeen.has(key)) return;
    _opsHourSeen.add(key);
    fresh = true;
    opsRememberNotice('Aranacaklar', `${w?.nachname || '—'} · ${min} dk`, opsSoundEntry('hour').color, 'wv');
  });
  if (fresh) opsCue('hour');
}

function opsMismatch() {
  const required = (_opsDirective.ids || []).map(String).filter(Boolean);
  if (!required.length) return { missing: [], extra: [] };
  const active = new Set(opsActiveIds());
  const need = new Set(required);
  return {
    missing: required.filter((id) => !active.has(id)),
    extra: [...active].filter((id) => !need.has(id)),
  };
}

function opsPreviewWarn(required, active) {
  const prevD = _opsDirective;
  const prevA = (typeof _activeCampIds !== 'undefined') ? _activeCampIds.slice() : null;
  try {
    _opsDirective = { ids: (required || []).map(String), at: prevD.at, by: prevD.by };
    if (typeof _activeCampIds !== 'undefined') _activeCampIds = (active || []).slice();
    opsPaintCampWarn();
    return document.getElementById('ops-camp-warn')?.textContent || '';
  } finally {
    _opsDirective = prevD;
    if (prevA && typeof _activeCampIds !== 'undefined') _activeCampIds = prevA;
    opsPaintCampWarn();
  }
}

async function opsLoadDirective() {
  const fid = opsFirmId();
  if (!fid || typeof sb !== 'function' || !currentUser) return;
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const raw = rows?.[0]?.settings?.work_directive || {};
    const nextAt = raw.at || '';
    const prevAt = _opsDirective.at;
    _opsDirective = {
      ids: Array.isArray(raw.ids) ? raw.ids.map(String) : [],
      at: nextAt,
      by: raw.by || '',
    };
    opsReadAlerts(rows?.[0]?.settings?.ops_alerts);
    await opsEnsureCampNames(_opsDirective.ids);
    const age = Date.parse(nextAt);
    const fresh = !!(prevAt && nextAt && prevAt !== nextAt);
    const recent = !prevAt && Number.isFinite(age) && Date.now() - age >= 0 && Date.now() - age < 20000;
    if ((fresh || recent) && nextAt !== _opsCampShownAt && _opsAlerts.campaign && opsRoleSeesCamp() && opsSoundOn('camp')) {
      _opsCampShownAt = nextAt;
      const title = opsSay('ops.notice.campaign', 'Yeni kampanya bildirimi geldi');
      const names = opsNamedCamps(_opsDirective.ids).join(', ');
      const body = names ? `${title}. ${opsSay('ops.notice.camps', 'Çalışılacak kampanyalar')}: ${names}` : title;
      opsShowCampStrip(body);
      opsCue('camp');
      opsRememberNotice(title, body, opsSoundEntry('camp').color, 'camp');
    }
  } catch (e) {}
  opsPaintCampWarn();
  if (!_opsNotifPrimed && typeof loadNotificationCenter === 'function') {
    _opsNotifPrimed = true;
    loadNotificationCenter();
  }
}

function opsClamp(n, fallback, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function opsReadAlerts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const roles = (Array.isArray(src.warn_roles) ? src.warn_roles.map(String) : ['agent']).filter((role) => role !== 'field_agent');
  const effect = ['aurora', 'gradient', 'blink', 'solid'].includes(src.bar_effect) ? src.bar_effect : 'aurora';
  _opsAlerts = {
    callMin: opsClamp(src.call_min, 4, 1, 60),
    goldAfter: opsClamp(src.gold_after_min, 1, 0, 30),
    waitMin: opsClamp(src.wait_min, 1, 1, 30),
    roles,
    effect,
    campRoles: (Array.isArray(src.camp_roles) ? src.camp_roles.map(String) : roles.slice()).filter((role) => role !== 'field_agent'),
    campEffect: ['aurora', 'gradient', 'blink', 'solid'].includes(src.camp_effect) ? src.camp_effect : effect,
    mesaiEffect: ['aurora', 'gradient', 'blink', 'solid'].includes(src.mesai_effect) ? src.mesai_effect : 'aurora',
    appt: src.notify_appt !== false,
    campaign: src.notify_campaign !== false,
    wrongAfter: opsClamp(src.wrong_after_min, 2, 1, 30),
    dataMin: opsClamp(src.data_min, 1000, 1, 100000),
    sounds: opsReadSounds(src.sounds),
  };
}

function opsWrongAfterMin() {
  const input = document.getElementById('ops-set-wrong-after');
  if (input && String(input.value || '').trim() !== '') return opsClamp(input.value, 2, 1, 30);
  return opsClamp(_opsAlerts.wrongAfter, 2, 1, 30);
}

function opsWrongHoldUntil() {
  const at = Date.parse(_opsDirective.at || '');
  if (!Number.isFinite(at) || at <= 0) return 0;
  return at + opsWrongAfterMin() * 60000;
}

function opsScheduleWrongHold() {
  if (_opsWrongTimer) clearTimeout(_opsWrongTimer);
  _opsWrongTimer = null;
  const left = opsWrongHoldUntil() - Date.now();
  if (left <= 0) return;
  _opsWrongTimer = setTimeout(() => {
    _opsWrongTimer = null;
    opsPaintCampWarn();
  }, Math.min(left, 2147483647));
}

function opsReadSounds(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sounds = { volume: opsClamp(src.volume, 70, 0, 100) };
  Object.keys(OPS_TONE_DEFAULT).forEach((key) => {
    const item = src[key];
    const tone = OPS_TONE_DEFAULT[key];
    if (item && typeof item === 'object') {
      sounds[key] = { on: item.on !== false, tone: OPS_TONE_IDS.includes(item.tone) ? item.tone : tone, mood: opsMood(item.mood, OPS_MOOD_DEFAULT[key]), color: opsEntryColor(item, OPS_MOOD_DEFAULT[key]) };
    } else {
      sounds[key] = { on: item !== false, tone, mood: OPS_MOOD_DEFAULT[key] || 'neutral', color: opsEntryColor(null, OPS_MOOD_DEFAULT[key]) };
    }
  });
  sounds.results = {};
  const results = src.results && typeof src.results === 'object' ? src.results : {};
  Object.keys(results).forEach((key) => {
    const item = results[key];
    if (!item || typeof item !== 'object') return;
    sounds.results[key] = {
      on: item.on !== false,
      tone: OPS_TONE_IDS.includes(item.tone) ? item.tone : opsResultToneDefault(key),
      mood: opsMood(item.mood, opsResultMoodDefault(key)),
      color: opsEntryColor(item, opsResultMoodDefault(key)),
    };
  });
  return sounds;
}

function opsRoleIn(list) {
  const role = String(currentUser?.role || '');
  return !!role && (list || []).includes(role);
}

function opsRoleSeesWarn() {
  if (String(currentUser?.role || '') === 'field_agent') return false;
  return opsRoleIn(_opsAlerts.roles);
}

function opsRoleSeesCamp() {
  if (String(currentUser?.role || '') === 'field_agent') return false;
  return opsRoleIn(_opsAlerts.campRoles);
}

function opsRoleSeesData() {
  const role = String(currentUser?.role || '');
  return role === 'firm_admin' || role === 'admin' || role === 'super_admin';
}

function opsShowCampStrip(sentence) {
  const bar = document.getElementById('ops-camp-new');
  if (!bar || !sentence) return;
  bar.className = `ops-camp-warn is-new is-${_opsAlerts.campEffect || _opsAlerts.effect || 'aurora'}`;
  const text = document.createElement('span');
  text.className = 'ops-camp-warn-text';
  text.textContent = sentence;
  bar.replaceChildren(text);
  bar.hidden = false;
  if (_opsCampStripTimer) clearTimeout(_opsCampStripTimer);
  _opsCampStripTimer = setTimeout(() => {
    bar.hidden = true;
    bar.replaceChildren();
  }, 12000);
}

function opsNotifyPrefs() {
  return _opsAlerts;
}

function opsFitMarquee(el, text) {
  if (!el) return;
  const label = String(text ?? '');
  if (el.dataset.full === label && el.clientWidth > 0 && (el.classList.contains('is-slide') || el.scrollWidth <= el.clientWidth + 2)) return;
  el.dataset.full = label;
  el.classList.remove('is-slide');
  el.style.removeProperty('--slide');
  el.textContent = label;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || el.clientWidth <= 0 || el.scrollWidth <= el.clientWidth + 2) return;
  const inner = document.createElement('i');
  inner.textContent = label;
  inner.style.display = 'inline-block';
  inner.style.whiteSpace = 'nowrap';
  inner.style.fontStyle = 'normal';
  el.replaceChildren(inner);
  const dist = Math.max(0, inner.offsetWidth - el.clientWidth);
  if (dist < 2) {
    el.textContent = label;
    return;
  }
  el.style.setProperty('--slide', `-${dist}px`);
  inner.style.animationDuration = `${Math.min(14000, Math.max(4500, dist * 35))}ms`;
  el.classList.add('is-slide');
}

function opsWriteCampPill(btn, val, ids, fallbackCount) {
  if (ids.some((id) => !opsCampName(id)) && !btn._nameWait) {
    btn._nameWait = true;
    opsEnsureCampNames(ids).then(() => {
      btn._nameWait = false;
      opsPaintCampPill();
    });
  }
  const names = opsNamedCamps(ids);
  const label = names.length ? names.join(' · ') : (ids.length ? (fallbackCount ? String(ids.length) : '…') : '—');
  btn.title = label;
  opsFitMarquee(val, label);
}

function opsPaintCampPill() {
  const btn = document.getElementById('pill-camp-btn');
  const val = document.getElementById('pill-camp');
  if (!btn || !val) return;
  const role = String(currentUser?.role || '');
  if (role === 'field_agent') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.classList.remove('is-ok', 'is-wrong', 'is-agent');
  const admin = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  const required = (_opsDirective.ids || []).map(String).filter(Boolean);
  if (admin) {
    opsWriteCampPill(btn, val, required, false);
    return;
  }
  btn.classList.add('is-agent');
  const ids = opsActiveIds();
  const { missing, extra } = opsMismatch();
  const wrong = required.length && (missing.length || extra.length);
  const showIds = !required.length ? ids : (wrong && missing.length ? missing : required);
  opsWriteCampPill(btn, val, showIds, true);
  if (!required.length) return;
  if (!wrong) btn.classList.add('is-ok');
  else if (Date.now() >= opsWrongHoldUntil()) btn.classList.add('is-wrong');
}

function opsPaintCampWarn() {
  opsPaintCampPill();
  const bar = document.getElementById('ops-camp-warn');
  if (!bar) return;
  if (Date.now() < opsWrongHoldUntil()) {
    bar.hidden = true;
    bar.replaceChildren();
    _opsWrongSig = '';
    opsScheduleWrongHold();
    return;
  }
  const { missing, extra } = opsMismatch();
  const show = opsRoleSeesWarn() && (missing.length || extra.length);
  bar.className = `ops-camp-warn is-${_opsAlerts.effect || 'aurora'}`;
  if (!show) {
    bar.hidden = true;
    bar.replaceChildren();
    _opsWrongSig = '';
    return;
  }
  const pick = opsNamedCamps(missing);
  const close = opsNamedCamps(extra);
  const parts = [opsSay('ops.warn.wrong', 'Yanlış kampanyadasın.')];
  if (pick.length) parts.push(`${opsSay('ops.warn.pick', 'Seçmelisin:')} ${pick.join(', ')}.`);
  if (close.length) parts.push(`${opsSay('ops.warn.close', 'Kapatmalısın:')} ${close.join(', ')}.`);
  const sentence = parts.join(' ');
  if (sentence !== _opsWrongSig) {
    _opsWrongSig = sentence;
    opsCue('wrong');
    if (opsSoundOn('wrong')) opsRememberNotice('Yanlış kampanya', sentence, opsSoundEntry('wrong').color, 'camp');
  }
  const text = document.createElement('span');
  text.className = 'ops-camp-warn-text';
  text.textContent = sentence;
  bar.replaceChildren(text);
  bar.hidden = false;
}

function opsPanelSync(panel) {
  const n = panel.querySelectorAll('.ops-camp-pick input:checked').length;
  const el = panel.querySelector('.ops-camp-count');
  if (el) el.textContent = `${n} ${opsSay('ops.panel.selected', 'seçili')}`;
}

function opsSetPicked(panel, on, onlyVisible) {
  panel.querySelectorAll('.ops-camp-pick').forEach((row) => {
    if (onlyVisible && row.hidden) return;
    const box = row.querySelector('input');
    if (!box) return;
    box.checked = on;
    row.classList.toggle('is-on', on);
  });
  opsPanelSync(panel);
}

function opsCloseCampPanel() {
  document.getElementById('ops-camp-panel')?.remove();
}

async function opsOpenCampPanel() {
  const fid = opsFirmId();
  if (!fid) { toast(opsSay('ops.panel.needfirm', 'Önce firma seçin'), 'warn'); return; }
  let camps = [];
  try {
    camps = await sb(`campaigns?firm_id=eq.${fid}&status=in.(active,paused)&select=id,name,status&order=name.asc`) || [];
  } catch (e) {
    toast(opsSay('ops.panel.fail', 'Bildirim kaydedilemedi: ') + (e.message || ''), 'err');
    return;
  }
  camps.forEach((c) => { if (c?.id) _opsCampNames[c.id] = c.name || c.id; });
  const picked = new Set((_opsDirective.ids || []).map(String));
  const panel = document.createElement('div');
  panel.id = 'ops-camp-panel';
  panel.className = 'ops-camp-panel';

  const head = document.createElement('div');
  head.className = 'ops-camp-head';
  const headText = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'ops-camp-panel-title';
  title.textContent = opsSay('ops.panel.title', 'Çalışılacak kampanyalar');
  const sub = document.createElement('div');
  sub.className = 'ops-camp-sub';
  sub.textContent = opsSay('ops.panel.sub', 'İşaretle, Bildir ile personele gönder.');
  headText.append(title, sub);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ops-live-x';
  close.textContent = '×';
  close.onclick = () => opsCloseCampPanel();
  head.append(headText, close);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'form-input ops-camp-search';
  search.placeholder = opsSay('ops.panel.search', 'Kampanya ara');
  search.oninput = () => {
    const q = search.value.trim().toLocaleLowerCase('tr-TR');
    panel.querySelectorAll('.ops-camp-pick').forEach((row) => {
      row.hidden = !!q && !String(row.dataset.name || '').includes(q);
    });
  };

  const list = document.createElement('div');
  list.className = 'ops-camp-panel-list';
  if (!camps.length) {
    const empty = document.createElement('div');
    empty.className = 'ops-camp-empty';
    empty.textContent = opsSay('ops.panel.empty', 'Açık veya duraklatılmış kampanya yok');
    list.appendChild(empty);
  }
  camps.forEach((c) => {
    const on = picked.has(String(c.id));
    const row = document.createElement('label');
    row.className = `ops-camp-pick${on ? ' is-on' : ''}`;
    row.dataset.name = String(c.name || '').toLocaleLowerCase('tr-TR');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = c.id;
    box.checked = on;
    const mark = document.createElement('span');
    mark.className = 'ops-camp-mark';
    mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'ops-camp-name';
    name.textContent = c.name || '—';
    const state = document.createElement('span');
    const paused = c.status === 'paused';
    state.className = `ops-camp-state${paused ? ' is-paused' : ''}`;
    state.textContent = paused ? opsSay('cal.paused', 'duraklatıldı') : opsSay('ops.panel.active', 'Açık');
    box.addEventListener('change', () => {
      row.classList.toggle('is-on', box.checked);
      opsPanelSync(panel);
    });
    row.append(box, mark, name, state);
    list.appendChild(row);
  });

  const foot = document.createElement('div');
  foot.className = 'ops-camp-foot';
  const count = document.createElement('span');
  count.className = 'ops-camp-count';
  const tools = document.createElement('div');
  tools.className = 'ops-camp-tools';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'btn btn-ghost btn-sm';
  all.textContent = opsSay('ops.panel.all', 'Tümü');
  all.onclick = () => opsSetPicked(panel, true, true);
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'btn btn-ghost btn-sm';
  none.textContent = opsSay('ops.panel.none', 'Temizle');
  none.onclick = () => opsSetPicked(panel, false, false);
  const notify = document.createElement('button');
  notify.type = 'button';
  notify.className = 'btn btn-primary';
  notify.textContent = opsSay('ops.panel.notify', 'Bildir');
  notify.onclick = () => opsNotifyWorkCamps(panel);
  tools.append(all, none, notify);
  foot.append(count, tools);
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'btn btn-ghost btn-sm ops-camp-settings';
  jump.textContent = opsSay('ops.panel.settings', 'Bildirim ayarları');
  jump.onclick = () => {
    opsCloseCampPanel();
    window.__settingsTab = 'notifications';
    if (typeof navigate === 'function') navigate('settings');
  };

  panel.append(head, search, list, foot, jump);
  opsPanelSync(panel);
  document.body.appendChild(panel);
  requestAnimationFrame(() => {
    panel.querySelectorAll('.ops-camp-name').forEach((el) => opsFitMarquee(el, el.textContent || ''));
  });
  const anchor = document.getElementById('pill-camp-btn');
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth || 400;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }
  search.focus();
}

function opsPickEffect(effect, which) {
  const card = document.getElementById('notif-settings-card');
  const next = ['aurora', 'gradient', 'blink', 'solid'].includes(effect) ? effect : 'aurora';
  const kind = which === 'camp' ? 'camp' : which === 'mesai' ? 'mesai' : 'warn';
  if (card) {
    if (kind === 'camp') card.dataset.campEffect = next;
    else if (kind === 'mesai') card.dataset.mesaiEffect = next;
    else card.dataset.effect = next;
  }
  const root = kind === 'camp' ? '#ops-camp-effect-picks' : kind === 'mesai' ? '#ops-mesai-effect-picks' : '#ops-effect-picks';
  document.querySelectorAll(`${root} button`).forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.effect === next);
  });
  const preview = document.getElementById(kind === 'camp' ? 'ops-camp-preview' : kind === 'mesai' ? 'ops-mesai-preview' : 'ops-warn-preview');
  if (!preview) return;
  const flag = kind === 'camp' ? ' is-new' : kind === 'mesai' ? ' is-mesai' : '';
  preview.className = `ops-camp-warn${flag} is-${next} ops-warn-preview ops-firm-only`;
}

function opsNotifSub(id) {
  const card = document.getElementById('notif-settings-card');
  if (!card) return;
  const agent = card.classList.contains('is-agent');
  const buttons = [...card.querySelectorAll('.ops-subnav button')];
  const allowed = (btn) => !(agent && btn.classList.contains('ops-firm-only'));
  const picked = buttons.some((btn) => btn.dataset.sub === id && allowed(btn)) ? id : 'wv';
  card.dataset.sub = picked;
  card.querySelectorAll('.ops-subpane').forEach((pane) => {
    pane.hidden = pane.dataset.sub !== picked;
  });
  buttons.forEach((btn) => btn.classList.toggle('is-on', btn.dataset.sub === picked));
}

let _opsNotifFirmLoaded = '';

async function opsEnsureNotifFirmForm() {
  const fid = opsFirmId();
  if (fid && typeof sb === 'function' && _opsNotifFirmLoaded !== fid) {
    _opsNotifFirmLoaded = fid;
    try {
      const rows = await sb(`firms?id=eq.${fid}&select=settings`);
      opsReadAlerts(rows?.[0]?.settings?.ops_alerts);
    } catch (e) {
      _opsNotifFirmLoaded = '';
    }
  }
  opsFillNotifSettings();
}

function opsMountNotifFirm() {
  const host = document.getElementById('ops-notif-firm');
  if (!host) return;
  const show = typeof isSuperAdmin === 'function' && isSuperAdmin();
  if (!show) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const firms = (typeof _allFirms !== 'undefined' && Array.isArray(_allFirms)) ? _allFirms : [];
  if (!firms.length && typeof loadAllFirms === 'function') {
    host.hidden = true;
    loadAllFirms().then(() => opsMountNotifFirm());
    return;
  }
  host.hidden = false;
  const fid = opsFirmId();
  host.replaceChildren();
  const label = document.createElement('span');
  label.className = 'form-label';
  label.textContent = opsSay('ops.notif.firm', 'Firma');
  const sel = document.createElement('select');
  sel.id = 'ops-notif-firm-sel';
  sel.className = 'form-input';
  firms.forEach((firm) => {
    const opt = document.createElement('option');
    opt.value = firm.id;
    opt.textContent = firm.name || firm.slug || firm.id;
    if (String(firm.id) === String(fid)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (fid && ![...sel.options].some((opt) => opt.value === String(fid))) {
    const opt = document.createElement('option');
    opt.value = fid;
    opt.textContent = fid;
    opt.selected = true;
    sel.appendChild(opt);
  }
  const hint = document.createElement('small');
  hint.textContent = opsSay('ops.notif.firm_hint', 'Kayıt bu firmanın bildirimine yazılır.');
  host.append(label, sel, hint);
  sel.onchange = () => {
    const next = sel.value || '';
    if (!next) return;
    if (typeof setSuperAdminFirmSelection === 'function') setSuperAdminFirmSelection(next);
    else if (typeof _selectedFirmId !== 'undefined') _selectedFirmId = next;
    _opsNotifFirmLoaded = '';
    opsEnsureNotifFirmForm();
  };
}

function opsFillNotifSettings() {
  const card = document.getElementById('notif-settings-card');
  if (!card) return;
  card.querySelectorAll('[data-role]').forEach((box) => {
    box.checked = (_opsAlerts.roles || []).includes(box.dataset.role);
  });
  card.querySelectorAll('[data-camp-role]').forEach((box) => {
    box.checked = (_opsAlerts.campRoles || []).includes(box.dataset.campRole);
  });
  const call = document.getElementById('ops-set-call');
  const gold = document.getElementById('ops-set-gold');
  const wait = document.getElementById('ops-set-wait');
  if (call) call.value = String(_opsAlerts.callMin);
  if (gold) gold.value = String(_opsAlerts.goldAfter);
  if (wait) wait.value = String(_opsAlerts.waitMin);
  const wrongAfter = document.getElementById('ops-set-wrong-after');
  if (wrongAfter) wrongAfter.value = String(opsWrongAfterMin());
  const dataMin = document.getElementById('ops-set-data-min');
  if (dataMin) dataMin.value = String(opsClamp(_opsAlerts.dataMin, 1000, 1, 100000));
  const appt = document.getElementById('ops-notify-appt');
  const camp = document.getElementById('ops-notify-camp');
  if (appt) appt.checked = _opsAlerts.appt !== false;
  if (camp) camp.checked = _opsAlerts.campaign !== false;
  const vol = document.getElementById('ops-sound-vol');
  if (vol) vol.value = String(opsHeardVolume() ?? 70);
  card.querySelectorAll('[data-sound]').forEach((box) => {
    const entry = opsSoundEntry(box.dataset.sound);
    box.checked = entry.on;
    const row = box.closest('.ops-note-row');
    const sel = row?.querySelector(`[data-tone="${box.dataset.sound}"]`);
    if (sel) {
      const picked = OPS_TONE_IDS.includes(entry.tone) ? entry.tone : (OPS_TONE_DEFAULT[box.dataset.sound] || 'chime');
      sel.replaceChildren();
      OPS_TONE_IDS.forEach((id) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = OPS_TONE_LABELS[id] || id;
        sel.appendChild(opt);
      });
      sel.value = picked;
    }
    if (row) opsPaintColor(row, box.dataset.sound, entry.color);
  });
  opsPickEffect(_opsAlerts.effect || 'aurora');
  opsPickEffect(_opsAlerts.campEffect || _opsAlerts.effect || 'aurora', 'camp');
  opsPickEffect(_opsAlerts.mesaiEffect || 'aurora', 'mesai');
  opsSyncRoleChipVisibility();
  opsPaintAgentNotif();
  opsNotifSub(card.dataset.sub || 'wv');
  opsFillResultRows();
  opsMountNotifFirm();
}

function opsSyncRoleChipVisibility() {
  const role = String(currentUser?.role || '');
  const platform = role === 'super_admin' || role === 'admin';
  document.querySelectorAll('#notif-settings-card [data-role="admin"], #notif-settings-card [data-role="super_admin"], #notif-settings-card [data-camp-role="admin"], #notif-settings-card [data-camp-role="super_admin"]').forEach((box) => {
    const chip = box.closest('label');
    if (chip) chip.hidden = !platform;
  });
}

function opsPaintColor(row, key, color, which) {
  row.querySelectorAll('select[data-mood-key], select[data-mood-result]').forEach((el) => el.remove());
  let input = row.querySelector('input[type="color"]');
  if (!input) {
    input = document.createElement('input');
    input.type = 'color';
    input.className = 'ops-color';
    input.title = typeof t === 'function' ? t('ops.color') : 'Renk';
    const tone = row.querySelector('select[data-tone]');
    if (tone) row.insertBefore(input, tone);
    else row.appendChild(input);
  }
  input.dataset[which === 'result' ? 'colorResult' : 'colorKey'] = key;
  input.value = opsHex(color, '#64748b');
}

async function opsFillResultRows() {
  const host = document.getElementById('ops-qc-rows');
  if (!host) return;
  let rows = [];
  try {
    if (typeof loadFirmAppointmentResults === 'function') {
      rows = await loadFirmAppointmentResults(opsFirmId());
    }
  } catch (e) {}
  if (!rows?.length && typeof defaultAppointmentResults === 'function') rows = defaultAppointmentResults();
  host.replaceChildren();
  (rows || []).forEach((r) => {
    const key = typeof _normResultKey === 'function' ? _normResultKey(r.key) : String(r.key || '');
    if (!key) return;
    const entry = opsResultEntry(key);
    const label = document.createElement('label');
    label.className = 'ops-note-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.result = key;
    box.checked = entry.on;
    const text = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = r.label || key;
    const hint = document.createElement('small');
    hint.textContent = 'Bu sonuç girilince kart ve ses.';
    text.append(title, hint);
    const tone = document.createElement('select');
    tone.dataset.tone = `result:${key}`;
    OPS_TONE_IDS.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = OPS_TONE_LABELS[id] || id;
      tone.appendChild(opt);
    });
    tone.value = entry.tone;
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.textContent = 'Dinle';
    listen.onclick = () => opsPreviewSound(`result:${key}`);
    const sample = document.createElement('button');
    sample.type = 'button';
    sample.textContent = 'Örnek';
    sample.onclick = () => opsShowSample(`result:${key}`);
    label.append(box, text, tone, listen, sample);
    opsPaintColor(label, key, entry.color, 'result');
    host.appendChild(label);
  });
  opsPaintAgentNotif();
}

function opsCollectSounds(card) {
  const sounds = { volume: opsClamp(document.getElementById('ops-sound-vol')?.value, 70, 0, 100), results: {} };
  Object.keys(OPS_TONE_DEFAULT).forEach((key) => {
    const tone = card.querySelector(`[data-tone="${key}"]`)?.value;
    const color = card.querySelector(`[data-color-key="${key}"]`)?.value;
    sounds[key] = {
      on: !!card.querySelector(`[data-sound="${key}"]`)?.checked,
      tone: OPS_TONE_IDS.includes(tone) ? tone : OPS_TONE_DEFAULT[key],
      mood: OPS_MOOD_DEFAULT[key] || 'neutral',
      color: opsHex(color, opsEntryColor(null, OPS_MOOD_DEFAULT[key])),
    };
  });
  card.querySelectorAll('[data-result]').forEach((box) => {
    const key = box.dataset.result;
    const tone = card.querySelector(`[data-tone="result:${key}"]`)?.value;
    const color = card.querySelector(`[data-color-result="${key}"]`)?.value;
    sounds.results[key] = {
      on: !!box.checked,
      tone: OPS_TONE_IDS.includes(tone) ? tone : opsResultToneDefault(key),
      mood: opsResultMoodDefault(key),
      color: opsHex(color, opsEntryColor(null, opsResultMoodDefault(key))),
    };
  });
  return sounds;
}

let _opsSampleTimer = null;
let _opsSampleWrongTimer = null;
function opsMountStripSample(sentence, effect, mode) {
  document.getElementById('ops-sample-host')?.remove();
  if (_opsSampleTimer) clearTimeout(_opsSampleTimer);
  const host = document.createElement('div');
  host.id = 'ops-sample-host';
  host.className = 'ops-sample-host';
  const extra = mode === 'mesai' ? ' is-mesai' : mode ? ' is-new' : '';
  const bar = document.createElement('div');
  bar.className = `ops-camp-warn${extra} is-${effect || 'aurora'}`;
  const text = document.createElement('span');
  text.className = 'ops-camp-warn-text';
  text.textContent = sentence;
  bar.appendChild(text);
  host.appendChild(bar);
  document.body.appendChild(host);
  _opsSampleTimer = setTimeout(() => host.remove(), mode === 'mesai' ? 8000 : 4500);
}
function opsMesaiEffect() {
  const picked = document.getElementById('notif-settings-card')?.dataset.mesaiEffect || _opsAlerts.mesaiEffect || 'aurora';
  return ['aurora', 'gradient', 'blink', 'solid'].includes(picked) ? picked : 'aurora';
}
function opsMountMesaiStrip(sentence) {
  opsMountStripSample(sentence, opsMesaiEffect(), 'mesai');
}
let _opsMesaiFlash = null;
function opsFlashMesaiChip(text) {
  _opsMesaiFlash = { text: String(text || ''), until: Date.now() + 8000 };
  opsPaintMesaiBar();
}
function opsMountWrongSample(sentence) {
  const effect = document.getElementById('notif-settings-card')?.dataset.effect || _opsAlerts.effect || 'aurora';
  opsMountStripSample(sentence, effect, false);
}
function opsShowSample(kind) {
  opsPreviewSound(kind);
  document.getElementById('ops-sample-host')?.remove();
  if (_opsSampleTimer) clearTimeout(_opsSampleTimer);
  if (_opsSampleWrongTimer) { clearTimeout(_opsSampleWrongTimer); _opsSampleWrongTimer = null; }
  if (String(kind).startsWith('result:')) {
    const key = kind.slice(7);
    const entry = opsResultEntry(key);
    const picked = document.querySelector(`[data-color-result="${key}"]`)?.value;
    if (picked) entry.color = opsHex(picked, entry.color);
    const label = document.querySelector(`#ops-qc-rows [data-result="${key}"]`)?.closest('.ops-note-row')?.querySelector('b')?.textContent || opsResultLabel(key);
    opsFloorPush(kind, 'qc', opsFloorText('qc', {
      actor: currentUser?.name || 'Kubilay', who: 'Ziya', camp: '69', when: '20.10 saat 16:00', result: label,
    }), true, false, entry);
    return;
  }
  const floorDemo = {
    pick: { kind: 'pick', actor: 'Gökhan', camp: '69', when: '20.10 saat 16:00' },
    drop: { kind: 'drop', actor: 'Gökhan', camp: '69', when: '20.10 saat 16:00' },
    slot: { kind: 'book', actor: 'Gökhan', who: 'Ziya', camp: '69', when: '20.10 saat 16:00' },
    clear: { kind: 'clear', who: 'Ziya', camp: '69', when: '20.10 saat 16:00' },
    move: { kind: 'move', who: 'Ziya', camp: '69', from: '20.10 saat 16:00', to: '21.10 saat 10:00' },
  };
  if (floorDemo[kind]) {
    const demo = floorDemo[kind];
    const entry = opsSoundEntry(kind);
    const picked = document.querySelector(`[data-color-key="${kind}"]`)?.value;
    if (picked) entry.color = opsHex(picked, entry.color);
    opsFloorPush(kind, demo.kind === 'book' ? 'book' : demo.kind, opsFloorText(demo.kind, demo), true, false, entry);
    return;
  }
  if (kind === 'soon' || kind === 'slot' || kind === 'ok' || kind === 'bad') {
    const msg = {
      soon: 'Örnek Müşteri — 15 dk sonra aranacak',
      slot: 'Örnek: randevu kaydedildi',
      ok: 'Örnek: başarılı sonuç',
      bad: 'Örnek: olumsuz sonuç',
    }[kind];
    toast(msg, kind === 'bad' ? 'err' : 'ok', 4000);
    opsKeepSample(kind === 'soon' ? '15 dk kala' : 'Örnek', msg, opsPickedColor(kind, opsSoundEntry(kind).color), opsNoticeCat(kind));
    return;
  }
  if (kind === 'due') {
    const sample = {
      id: 'sample-due',
      nachname: 'Ziya Yılmaz',
      telefon: '+49 170 000000',
      telefon2: '+49 170 111111',
      strasse: 'Musterstraße 4',
      plz: '10115',
      ort: 'Berlin',
      campLabel: '69',
      agent_name: 'Gökhan',
      notiz: 'Akşam tekrar ara.',
      termin_zaman: new Date().toISOString(),
    };
    if (typeof showWvDuePopup === 'function') showWvDuePopup(sample, true);
    opsKeepSample(opsSay('wv.due.title', 'Arama vakti geldi'), typeof wvDueNotice === 'function' ? wvDueNotice(sample) : sample.nachname, opsPickedColor('due', opsSoundEntry('due').color), 'wv');
    return;
  }
  if (kind === 'camp') {
    const title = opsSay('ops.notice.campaign', 'Yeni kampanya bildirimi geldi');
    const body = `${title}. ${opsSay('ops.notice.camps', 'Çalışılacak kampanyalar')}: 85, 96`;
    const effect = document.getElementById('notif-settings-card')?.dataset.campEffect || _opsAlerts.campEffect || 'aurora';
    opsMountStripSample(body, effect, true);
    opsRememberNotice(title, body, opsPickedColor('camp', opsSoundEntry('camp').color), 'camp');
    _opsSampleWrongTimer = setTimeout(() => {
      _opsSampleWrongTimer = null;
      const sentence = 'Yanlış kampanyadasın. Seçmelisin: 85, 96. Kapatmalısın: Eski Kampanya.';
      opsMountWrongSample(sentence);
      opsRememberNotice('Yanlış kampanya', sentence, opsPickedColor('wrong', opsSoundEntry('wrong').color), 'camp');
    }, opsWrongAfterMin() * 60000);
    return;
  }
  if (kind === 'data') {
    const min = opsClamp(document.getElementById('ops-set-data-min')?.value, 1000, 1, 100000);
    const text = opsDataText('85', 640, min);
    toast(`${opsSay('ops.data.title', 'Veri azaldı')}. ${text}`, 'warn', 4000);
    opsRememberNotice(opsSay('ops.data.title', 'Veri azaldı'), text, opsPickedColor('data', opsSoundEntry('data').color), 'camp');
    return;
  }
  const mesaiSample = {
    shift_on: ['ops.mesai.started', 'Mesai başladı', '10:30'],
    break: ['ops.mesai.breakOn', 'Mola başladı', '11:30–11:45'],
    break_end: ['ops.mesai.breakOff', 'Mola bitti', '11:45'],
    shift: ['ops.mesai.ended', 'Mesai bitti', '18:30'],
  };
  if (mesaiSample[kind]) {
    const [key, fallback, body] = mesaiSample[kind];
    const title = opsSay(key, fallback);
    opsMountMesaiStrip(`${title}. ${body}`);
    opsFlashMesaiChip(title);
    toast(`${title}. ${body}`, kind === 'shift' ? 'warn' : 'ok', 5000);
    opsRememberNotice(title, body, opsPickedColor(kind, opsSoundEntry(kind).color), 'live');
    return;
  }
  if (kind === 'wrong') {
    const sentence = 'Yanlış kampanyadasın. Seçmelisin: Örnek Kampanya. Kapatmalısın: Eski Kampanya.';
    opsMountWrongSample(sentence);
    opsRememberNotice('Yanlış kampanya', sentence, opsPickedColor('wrong', opsSoundEntry('wrong').color), 'camp');
    return;
  }
  const host = document.createElement('div');
  host.id = 'ops-sample-host';
  const close = () => host.remove();
  if (kind === 'hour') {
    host.className = 'ops-sample-host';
    const bar = document.createElement('div');
    bar.className = 'ops-appt-strip';
    bar.textContent = 'Aranacaklar · Örnek Müşteri · 45 dk';
    host.appendChild(bar);
    opsKeepSample('Aranacaklar', bar.textContent, opsPickedColor('hour', opsSoundEntry('hour').color), 'wv');
  } else {
    host.className = 'ops-sample-host';
    const card = document.createElement('article');
    card.className = `ops-live-card ops-sample-card${kind === 'wait' ? ' is-wait' : ' is-gold'}`;
    const title = document.createElement('strong');
    title.textContent = kind === 'wait' ? opsSay('ops.live.wait', 'Uzun süredir çağrı bekliyor') : opsSay('ops.live.long', 'Uzun görüşme');
    const name = document.createElement('div');
    name.className = 'ops-live-name';
    name.textContent = 'Örnek Agent · 5:10';
    card.append(title, name);
    host.appendChild(card);
    opsKeepSample(title.textContent, name.textContent, opsSoundEntry(kind).color, 'live');
  }
  document.body.appendChild(host);
  _opsSampleTimer = setTimeout(close, 4500);
}

async function opsSaveNotifSettings() {
  if (opsIsAgentNotif()) { opsSaveMineNotif(); return; }
  const fid = opsFirmId();
  const card = document.getElementById('notif-settings-card');
  if (!fid || !card) { toast(opsSay('ops.panel.needfirm', 'Önce firma seçin'), 'warn'); return; }
  const ops_alerts = {
    call_min: opsClamp(document.getElementById('ops-set-call')?.value, 4, 1, 60),
    gold_after_min: opsClamp(document.getElementById('ops-set-gold')?.value, 1, 0, 30),
    wait_min: opsClamp(document.getElementById('ops-set-wait')?.value, 1, 1, 30),
    warn_roles: [...card.querySelectorAll('[data-role]:checked')].map((el) => el.dataset.role),
    bar_effect: card.dataset.effect || 'aurora',
    notify_appt: !!document.getElementById('ops-notify-appt')?.checked,
    notify_campaign: !!document.getElementById('ops-notify-camp')?.checked,
    wrong_after_min: opsClamp(document.getElementById('ops-set-wrong-after')?.value, 2, 1, 30),
    camp_roles: [...card.querySelectorAll('[data-camp-role]:checked')].map((el) => el.dataset.campRole),
    camp_effect: card.dataset.campEffect || card.dataset.effect || 'aurora',
    mesai_effect: card.dataset.mesaiEffect || 'aurora',
    data_min: opsClamp(document.getElementById('ops-set-data-min')?.value, 1000, 1, 100000),
    sounds: opsCollectSounds(card),
  };
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, ops_alerts } }),
    });
    opsReadAlerts(ops_alerts);
    opsPaintCampWarn();
    toast(opsSay('ops.panel.saved', 'Bildirim ayarları kaydedildi'), 'ok');
  } catch (e) {
    toast(opsSay('ops.panel.fail', 'Bildirim kaydedilemedi: ') + (e.message || ''), 'err');
  }
}

async function opsNotifyWorkCamps(panel) {
  const fid = opsFirmId();
  if (!fid) { toast(opsSay('ops.panel.needfirm', 'Önce firma seçin'), 'warn'); return; }
  const ids = [...panel.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value).filter(Boolean);
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const work_directive = {
      ids,
      at: new Date().toISOString(),
      by: currentUser?.name || '',
    };
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, work_directive } }),
    });
    _opsDirective = work_directive;
    opsPaintCampWarn();
    opsCloseCampPanel();
    toast(opsSay('ops.panel.sent', 'Personelle bildirildi'), 'ok');
  } catch (e) {
    toast(opsSay('ops.panel.fail', 'Bildirim kaydedilemedi: ') + (e.message || ''), 'err');
  }
}

function opsCampSummary() {
  const selected = (typeof selectedCampId !== 'undefined' && selectedCampId) ? String(selectedCampId) : '';
  const openIds = opsActiveIds();
  const directed = (_opsDirective.ids || []).map(String).filter(Boolean);
  const ids = selected ? [selected, ...openIds.filter((id) => id !== selected)] : (openIds.length ? openIds : directed);
  const id = ids[0] || '';
  const row = (typeof campaigns !== 'undefined' && Array.isArray(campaigns))
    ? campaigns.find((c) => String(c?.id) === id)
    : null;
  const nested = (typeof _agentCamps !== 'undefined' && Array.isArray(_agentCamps))
    ? _agentCamps.find((c) => String(c?.campaign_id || c?.id) === id)
    : null;
  const camp = row || nested?.campaigns || nested || null;
  const queues = Array.isArray(camp?.queues) ? camp.queues.length : null;
  return {
    id,
    name: opsCampName(id) || String(camp?.name || '').trim(),
    status: String(camp?.status || ''),
    queues,
    extra: Math.max(0, ids.length - 1),
    picked: !!selected,
  };
}

function opsPlaceCampSummary(pop) {
  const btn = document.getElementById('pill-camp-btn');
  if (!btn || !pop) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const width = 260;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function opsFillCampSummary(pop) {
  if (!pop) return;
  const info = opsCampSummary();
  pop.replaceChildren();
  const kicker = document.createElement('div');
  kicker.className = 'tb-camp-kicker';
  kicker.textContent = opsSay('tb.camp.title', 'Kampanya');
  const name = document.createElement('div');
  name.className = 'tb-camp-name';
  name.textContent = info.name || opsSay('tb.camp.none', 'Kampanya seçilmedi');
  pop.append(kicker, name);
  if (!info.name) return;
  const meta = document.createElement('div');
  meta.className = 'tb-camp-meta';
  const bits = [];
  if (info.status === 'active') bits.push(opsSay('tb.camp.active', 'Aktif'));
  else if (info.status === 'paused') bits.push(opsSay('tb.camp.paused', 'Durduruldu'));
  if (info.queues != null) bits.push(typeof tReplace === 'function' ? tReplace('tb.camp.queues', { n: info.queues }) : `${info.queues}`);
  meta.textContent = bits.join(' · ');
  if (meta.textContent) pop.appendChild(meta);
  const sub = document.createElement('div');
  sub.className = 'tb-camp-sub';
  sub.textContent = info.picked ? opsSay('tb.camp.selected', 'Aramada bu kampanya') : opsSay('tb.camp.open', 'Açık kampanya');
  if (info.extra) {
    const more = typeof tReplace === 'function' ? tReplace('tb.camp.more', { n: info.extra }) : `+${info.extra}`;
    sub.textContent = `${sub.textContent} · ${more}`;
  }
  pop.appendChild(sub);
}

function opsCloseCampSummary() {
  const pop = document.getElementById('tb-camp-pop');
  if (pop) pop.hidden = true;
}

function opsOpenCampSummary() {
  const pop = document.getElementById('tb-camp-pop');
  const btn = document.getElementById('pill-camp-btn');
  if (!pop || !btn || getComputedStyle(btn).display === 'none') return;
  if (typeof mbCloseTopbarPops === 'function') mbCloseTopbarPops('camp');
  opsFillCampSummary(pop);
  pop.hidden = false;
  opsPlaceCampSummary(pop);
  const info = opsCampSummary();
  if (info.id && !info.name) {
    void opsEnsureCampNames([info.id]).then(() => {
      if (!pop.hidden) opsFillCampSummary(pop);
    });
  }
}

function opsToggleCampSummary() {
  const pop = document.getElementById('tb-camp-pop');
  if (!pop) return;
  if (!pop.hidden) { opsCloseCampSummary(); return; }
  opsOpenCampSummary();
}

function opsShowCampSummary() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(window._tbCampHide);
  const pop = document.getElementById('tb-camp-pop');
  if (pop && !pop.hidden) return;
  opsOpenCampSummary();
}

function opsScheduleHideCampSummary() {
  clearTimeout(window._tbCampHide);
  window._tbCampHide = setTimeout(() => {
    const pop = document.getElementById('tb-camp-pop');
    const btn = document.getElementById('pill-camp-btn');
    if (!pop || pop.hidden) return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    opsCloseCampSummary();
  }, 180);
}

function opsCampPillClick(ev) {
  if (ev) ev.stopPropagation();
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const admin = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  if (!fine) {
    if (admin) {
      opsCloseCampSummary();
      if (document.getElementById('ops-camp-panel')) { opsCloseCampPanel(); return; }
      opsOpenCampPanel();
      return;
    }
    opsToggleCampSummary();
    return;
  }
  if (!admin) return;
  opsCloseCampSummary();
  if (document.getElementById('ops-camp-panel')) { opsCloseCampPanel(); return; }
  opsOpenCampPanel();
}

function opsSinceMs(row) {
  const id = String(row.agent_id || '');
  const status = row.status || '';
  if (status === 'on_call') {
    const iso = row.call_started_at || row.call_start || '';
    const ms = iso ? new Date(iso).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  const prev = _opsSeen[id];
  if (prev && prev.status === status) return prev.since;
  return Date.now();
}

function opsDismissLive(id, kind) {
  _opsDismiss.add(`${id}:${kind}`);
  opsPaintLive();
}

function opsClock(sec) {
  const safe = Math.max(0, Number(sec) || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function opsPaintLive(rows) {
  const host = document.getElementById('ops-live-alerts');
  if (!host) return;
  if (!Array.isArray(rows)) {
    host.replaceChildren();
    return;
  }
  const now = Date.now();
  const cards = [];
  const alive = new Set();
  rows.forEach((row) => {
    const id = String(row?.agent_id || '');
    if (!id) return;
    const seenAt = new Date(row.last_seen || row.updated_at || 0).getTime();
    if (!Number.isFinite(seenAt) || now - seenAt > OPS_SEEN_MS) return;
    alive.add(id);
    const status = row.status || '';
    const prev = _opsSeen[id];
    if (!prev || prev.status !== status) {
      ['call', 'wait', 'gold'].forEach((kind) => {
        _opsDismiss.delete(`${id}:${kind}`);
        _opsBeeped.delete(`${id}:${kind}`);
      });
    }
    const since = opsSinceMs(row);
    _opsSeen[id] = { status, since: prev && prev.status === status ? prev.since : since };
    if (status === 'on_call' && Number.isFinite(since)) _opsSeen[id].since = since;
    const age = Math.floor((now - _opsSeen[id].since) / 1000);
    let kind = '';
    const callSec = _opsAlerts.callMin * 60;
    const goldSec = (_opsAlerts.callMin + _opsAlerts.goldAfter) * 60;
    const waitSec = _opsAlerts.waitMin * 60;
    if (status === 'on_call' && age >= callSec) kind = age >= goldSec ? 'gold' : 'call';
    else if (status === 'calling' && age >= waitSec) kind = 'wait';
    if (!kind) return;
    const dismissKind = kind === 'gold' ? 'call' : kind;
    if (_opsDismiss.has(`${id}:${dismissKind}`)) return;
    cards.push({ id, kind, age, name: row.agent_name || '—', who: row.current_contact_name || '', camp: opsCampName(row.campaign_id) });
    const beepKey = `${id}:${kind}`;
    if (!_opsBeeped.has(beepKey) && !document.hidden) {
      _opsBeeped.add(beepKey);
      opsCue(kind === 'gold' ? 'gold' : kind);
      if (opsSoundOn(kind === 'wait' ? 'wait' : 'call')) {
        const liveTitle = kind === 'wait'
          ? opsSay('ops.live.wait', 'Uzun süredir çağrı bekliyor')
          : opsSay('ops.live.long', 'Uzun görüşme');
        const liveBody = [row.agent_name || '—', opsClock(age), row.current_contact_name || '', opsCampName(row.campaign_id)].filter(Boolean).join(' · ');
        opsRememberNotice(liveTitle, liveBody, opsSoundEntry(kind === 'wait' ? 'wait' : 'call').color, 'live');
      }
    }
  });
  Object.keys(_opsSeen).forEach((id) => {
    if (!alive.has(id)) {
      delete _opsSeen[id];
      ['call', 'wait', 'gold'].forEach((kind) => {
        _opsDismiss.delete(`${id}:${kind}`);
        _opsBeeped.delete(`${id}:${kind}`);
      });
    }
  });
  host.replaceChildren();
  cards.forEach((card) => {
    const el = document.createElement('article');
    el.className = `ops-live-card${card.kind === 'gold' ? ' is-gold' : ''}${card.kind === 'wait' ? ' is-wait' : ''}`;
    const head = document.createElement('div');
    head.className = 'ops-live-head';
    const title = document.createElement('strong');
    title.textContent = card.kind === 'wait'
      ? opsSay('ops.live.wait', 'Uzun süredir çağrı bekliyor')
      : opsSay('ops.live.long', 'Uzun görüşme');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ops-live-x';
    close.textContent = '×';
    close.onclick = () => opsDismissLive(card.id, card.kind === 'gold' ? 'call' : card.kind);
    head.append(title, close);
    const name = document.createElement('div');
    name.className = 'ops-live-name';
    name.textContent = `${card.name} · ${opsClock(card.age)}`;
    el.append(head, name);
    if (card.who || card.camp) {
      const sub = document.createElement('div');
      sub.className = 'ops-live-sub';
      sub.textContent = [card.who, card.camp].filter(Boolean).join(' · ');
      el.appendChild(sub);
    }
    host.appendChild(el);
  });
}

async function opsTickLive() {
  if (!currentUser || typeof mbIsFirmAdmin !== 'function' || !mbIsFirmAdmin() || typeof sb !== 'function') {
    opsPaintLive([]);
    return;
  }
  const ff = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
  try {
    const rows = await sb(`agent_sessions?select=agent_id,agent_name,status,campaign_id,current_contact_name,call_started_at,call_start,updated_at,last_seen${ff}`) || [];
    opsPaintLive(rows);
  } catch (e) {}
}

function opsDe() {
  return typeof currentLang !== 'undefined' && currentLang === 'de';
}

function opsJoin(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function opsPoss(name) {
  const n = String(name || '').trim() || (opsDe() ? 'Kunde' : 'Müşteri');
  if (opsDe()) return n;
  const last = n.slice(-1).toLocaleLowerCase('tr-TR');
  if ('aıou'.includes(last)) return `${n}'nın`;
  if ('eiöü'.includes(last)) return `${n}'nin`;
  return `${n}'ın`;
}

function opsFloorText(kind, bits) {
  const de = opsDe();
  const actor = String(bits.actor || '').trim();
  const who = String(bits.who || '').trim() || (de ? 'Kunde' : 'Müşteri');
  const when = String(bits.when || '').trim();
  const camp = String(bits.camp || '').trim();
  const result = String(bits.result || '').trim() || (de ? 'Ergebnis' : 'sonuç');
  const ofCamp = camp ? (de ? `in Kampagne ${camp}` : `${camp} kampanyasının`) : '';
  const inCamp = camp ? (de ? `in Kampagne ${camp}` : `${camp} kampanyasında`) : '';
  const atCamp = camp ? (de ? `in Kampagne ${camp}` : `${camp} kampanyasındaki`) : '';
  if (kind === 'pick') {
    return de
      ? opsJoin([actor || 'Jemand', 'hat', when, 'einen Slot', ofCamp, 'gewählt'])
      : opsJoin([`${actor || 'Bir kişi'},`, ofCamp, when, 'slotunu seçti']);
  }
  if (kind === 'drop') {
    return de
      ? opsJoin([actor || 'Jemand', 'hat die Slotwahl', when, ofCamp, 'aufgehoben'])
      : opsJoin([`${actor || 'Bir kişi'},`, ofCamp, when, 'slot seçimini iptal etti']);
  }
  if (kind === 'book') {
    return de
      ? opsJoin([actor || 'Jemand', 'hat für', who, when, inCamp, 'einen Termin gespeichert'])
      : opsJoin([`${actor || 'Bir kişi'},`, `${who} için`, inCamp, when, 'randevusunu kaydetti']);
  }
  if (kind === 'clear') {
    return de
      ? opsJoin(['Der Termin von', who, when, atCamp, 'wurde gelöscht'])
      : opsJoin([`${who} için`, atCamp, when, 'randevusu silindi']);
  }
  if (kind === 'move') {
    return de
      ? opsJoin(['Der Termin von', who, atCamp, 'wurde von', bits.from, 'auf', bits.to, 'gelegt'])
      : opsJoin([`${opsPoss(who)}`, atCamp, 'randevusu', bits.from, 'yerine', bits.to, 'alındı']);
  }
  if (actor) {
    return de
      ? opsJoin([actor, 'hat den Termin von', who, when, atCamp, 'auf', result, 'gesetzt'])
      : opsJoin([`${actor},`, `${opsPoss(who)}`, atCamp, when, 'randevusunu', result, 'olarak güncelledi']);
  }
  return de
    ? opsJoin(['Der Termin von', who, when, atCamp, 'wurde auf', result, 'gesetzt'])
    : opsJoin([`${opsPoss(who)}`, atCamp, when, 'randevusu', result, 'olarak güncellendi']);
}

function opsNoticeKey() {
  return `mb_ops_notice_${currentUser?.id || '0'}`;
}

function opsNoticeWhen(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function opsNoticeRows() {
  try {
    const rows = JSON.parse(localStorage.getItem(opsNoticeKey()) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

function opsNoticeHtml(row) {
  const color = opsHex(row?.color, '#64748b');
  const title = opsEsc(row?.title || 'Bildirim');
  const body = opsEsc(row?.text || '');
  const when = opsEsc(opsNoticeWhen(row?.at));
  return `<div style="padding:8px 10px;background:${opsTint(color)};border-radius:8px;border-left:4px solid ${color};color:#1f2937;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div style="font-size:12px;font-weight:700;">${title}</div>
<div style="font-size:10px;color:#64748b;white-space:nowrap;">${when}</div>
</div>
<div style="font-size:11px;margin-top:3px;">${body}</div>
</div>`;
}

function opsNoticeCat(soundKind, titleKind) {
  const kind = String(soundKind || '');
  const title = String(titleKind || '');
  if (kind.startsWith('result:') || title === 'qc') return 'qc';
  if (kind === 'pick' || kind === 'drop' || kind === 'clear' || kind === 'move') return 'cal';
  if (kind === 'slot' || title === 'book') return 'appt';
  if (kind === 'wrong' || kind === 'camp' || kind === 'data') return 'camp';
  if (kind === 'break' || kind === 'break_end' || kind === 'shift' || kind === 'shift_on') return 'live';
  if (kind === 'due' || kind === 'soon' || kind === 'hour') return 'wv';
  return 'live';
}

function opsRememberNotice(title, text, color, cat) {
  if (!currentUser?.id || !text) return;
  const rows = opsNoticeRows();
  const ids = typeof notifCatIds === 'function' ? notifCatIds() : [];
  rows.unshift({
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: title || 'Bildirim',
    text,
    color: opsHex(color, '#64748b'),
    at: new Date().toISOString(),
    cat: ids.includes(cat) ? cat : 'live',
  });
  try {
    localStorage.setItem(opsNoticeKey(), JSON.stringify(rows.slice(0, 40)));
  } catch (e) {}
  if (typeof loadNotificationCenter === 'function') loadNotificationCenter();
}

function opsKeepSample(title, text, color, cat) {
  opsRememberNotice(title, text, color, cat);
}

function opsMarkNoticesSeen() {
  if (!currentUser?.id) return;
  try { localStorage.setItem(`mb_ops_notice_seen_${currentUser.id}`, new Date().toISOString()); } catch (e) {}
}

function opsUnseenNoticeCount() {
  let seen = '';
  try { seen = localStorage.getItem(`mb_ops_notice_seen_${currentUser?.id || ''}`) || ''; } catch (e) {}
  const seenAt = seen ? new Date(seen).getTime() : 0;
  return opsNoticeRows().filter((row) => new Date(row.at || 0).getTime() > seenAt).length;
}

function opsFloorPush(soundKind, titleKind, text, force, quiet, entry, self) {
  if (!text) return;
  const cfg = entry || (String(soundKind).startsWith('result:') ? opsResultEntry(soundKind.slice(7)) : opsSoundEntry(soundKind));
  if (!force && cfg.on === false) return;
  if (!force && !self && !opsRoleSeesWarn()) return;
  const color = opsHex(cfg.color, '#64748b');
  const titleText = opsSay(`ops.floor.${titleKind}`, 'Bildirim');
  const cat = opsNoticeCat(soundKind, titleKind);
  if (force) opsKeepSample(titleText, text, color, cat);
  else opsRememberNotice(titleText, text, color, cat);
  const host = document.getElementById('ops-floor-feed');
  if (!host) return;
  const card = document.createElement('article');
  card.className = 'ops-live-card ops-floor-card';
  card.style.borderLeftColor = color;
  card.style.background = opsTint(color);
  card.style.color = '#1f2937';
  const head = document.createElement('div');
  head.className = 'ops-live-head';
  const title = document.createElement('strong');
  title.textContent = titleText;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ops-live-x';
  close.textContent = '×';
  close.onclick = () => card.remove();
  head.append(title, close);
  const body = document.createElement('p');
  body.textContent = text;
  card.append(head, body);
  host.appendChild(card);
  while (host.children.length > 4) host.firstElementChild?.remove();
  if (!force && !quiet && !document.hidden) opsPlayTone(cfg.tone, opsHeardVolume());
  setTimeout(() => card.remove(), 12000);
}

function opsBerlinDay(add) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return new Date(Date.UTC(y, m - 1, d + add)).toISOString().slice(0, 10);
}

function opsWhenFromIso(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}.${get('month')} saat ${get('hour')}:${get('minute')}`;
}

function opsWhenFromSlot(tarih, saat) {
  const bits = String(tarih || '').split('-');
  const hm = String(saat || '').slice(0, 5) || '00:00';
  if (bits.length < 3) return `saat ${hm}`;
  return `${bits[2]}.${bits[1]} saat ${hm}`;
}

function opsResultLabel(key) {
  const norm = String(key || '').toLowerCase();
  const deMap = { basarili: 'Erfolgreich', basarisiz: 'Nicht erfolgreich', beklemede: 'Wartend', ulasilamadi: 'Nicht erreicht', iptal: 'Storniert', qc_bekleniyor: 'QC ausstehend' };
  if (opsDe() && deMap[norm]) return deMap[norm];
  const list = window._apptResultsByFirm?.[opsFirmId()] || [];
  const hit = list.find((r) => String(r.key) === norm);
  if (hit?.label) return hit.label;
  const map = { basarili: 'Başarılı', basarisiz: 'Başarısız', beklemede: 'Beklemede', ulasilamadi: 'Ulaşılamadı', iptal: 'İptal', qc_bekleniyor: 'QC bekleniyor' };
  return map[norm] || String(key || '').trim() || (opsDe() ? 'Ergebnis' : 'sonuç');
}

function opsQcKind(key) {
  return typeof _normResultKey === 'function' ? _normResultKey(key) : String(key || '').toLowerCase();
}

const _opsAnnounced = new Set();
function opsAgentSeesFloor(ev, role, userId) {
  if (String(role || '') !== 'agent') return true;
  const kind = ev?.kind;
  if (kind === 'clear' || kind === 'move' || kind === 'qc') {
    return !!userId && String(ev.ownerId || '') === String(userId);
  }
  return false;
}

function opsAnnounceQc(appt, status) {
  const key = opsQcKind(status);
  if (!key || !appt?.id) return;
  if (!opsAgentSeesFloor({ kind: 'qc', ownerId: appt.agent_id }, currentUser?.role, currentUser?.id)) return;
  const entry = opsResultEntry(key);
  if (!entry.on) return;
  _opsAnnounced.add(`${appt.id}:${key}`);
  _opsAnnounced.add(`${appt.id}:${String(status || '')}`);
  const text = opsFloorText('qc', {
    actor: currentUser?.name || '',
    who: appt.nachname || '',
    camp: opsCampName(appt.campaign_id),
    when: opsWhenFromIso(appt.termin_tarih) || opsWhenFromSlot(appt.tarih, appt.saat || appt.baslangic_saat),
    result: opsResultLabel(key),
  });
  opsFloorPush(`result:${key}`, 'qc', text, false, false, entry, true);
}

const _opsNames = {};
async function opsNames(ids) {
  const missing = [...new Set((ids || []).map((id) => String(id || '')).filter(Boolean))].filter((id) => _opsNames[id] == null);
  if (!missing.length || typeof sb !== 'function') return;
  try {
    const rows = await sb(`users?id=in.(${missing.join(',')})&select=id,name`) || [];
    rows.forEach((u) => { if (u?.id) _opsNames[u.id] = String(u.name || '').trim(); });
  } catch (e) {}
  missing.forEach((id) => { if (_opsNames[id] == null) _opsNames[id] = ''; });
}

function opsPerson(id) {
  return _opsNames[String(id || '')] || '';
}

async function opsQcActor(contactId) {
  if (!contactId || typeof sb !== 'function') return '';
  try {
    const rows = await sb(`call_logs?contact_id=eq.${contactId}&qc_at=not.is.null&select=qc_by,qc_at&order=qc_at.desc&limit=1`) || [];
    const row = rows[0];
    const at = new Date(row?.qc_at || '').getTime();
    if (!row?.qc_by || !Number.isFinite(at) || Date.now() - at > 180000) return '';
    await opsNames([row.qc_by]);
    return opsPerson(row.qc_by);
  } catch (e) {
    return '';
  }
}

const _opsFloor = { slots: null, appts: null };
let _opsFloorBusy = false;
async function opsTickFloor() {
  if (_opsFloorBusy || !currentUser || typeof sb !== 'function' || !opsRoleSeesWarn()) return;
  const keys = ['pick', 'drop', 'clear', 'move', 'slot'];
  const savedResults = _opsAlerts.sounds?.results || {};
  const resultOn = !Object.keys(savedResults).length || Object.values(savedResults).some((row) => row?.on !== false);
  if (!keys.some((key) => opsSoundOn(key)) && !resultOn) return;
  const fid = opsFirmId();
  if (!fid) return;
  _opsFloorBusy = true;
  try {
    const from = opsBerlinDay(-1);
    const to = opsBerlinDay(14);
    const [slots, appts] = await Promise.all([
      sb(`takvim_slots?firm_id=eq.${fid}&gun_kapali=eq.false&tarih=gte.${from}&tarih=lte.${to}&select=id,durum,kilitli_agent_id,appointment_id,campaign_id,tarih,baslangic_saat&limit=800`).catch(() => null),
      sb(`appointments?firm_id=eq.${fid}&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&select=id,nachname,durum,agent_id,campaign_id,termin_tarih,slot_id,contact_id&limit=800`).catch(() => null),
    ]);
    if (!Array.isArray(slots) || !Array.isArray(appts)) return;
    const slotMap = {};
    slots.forEach((s) => { if (s?.id) slotMap[s.id] = s; });
    const apptMap = {};
    appts.forEach((a) => { if (a?.id) apptMap[a.id] = a; });
    if (!_opsFloor.slots) {
      _opsFloor.slots = slotMap;
      _opsFloor.appts = apptMap;
      return;
    }
    const prevS = _opsFloor.slots;
    const prevA = _opsFloor.appts;
    const campIds = [];
    const userIds = [];
    Object.values(slotMap).concat(Object.values(prevS)).forEach((s) => {
      campIds.push(s.campaign_id);
      userIds.push(s.kilitli_agent_id);
    });
    Object.values(apptMap).forEach((a) => {
      campIds.push(a.campaign_id);
      userIds.push(a.agent_id);
    });
    await opsEnsureCampNames(campIds);
    await opsNames(userIds);
    const events = [];
    Object.values(slotMap).forEach((s) => {
      const old = prevS[s.id];
      if (!old) return;
      const when = opsWhenFromSlot(s.tarih, s.baslangic_saat);
      const camp = opsCampName(s.campaign_id);
      if (old.durum === 'bos' && s.durum === 'kilitli') {
        events.push({ sound: 'pick', title: 'pick', kind: 'pick', actor: opsPerson(s.kilitli_agent_id), camp, when });
      } else if ((old.durum === 'kilitli' || old.durum === 'admin-kilitli') && s.durum === 'bos') {
        events.push({ sound: 'drop', title: 'drop', kind: 'drop', actor: opsPerson(old.kilitli_agent_id), camp, when });
      } else if (old.durum !== 'dolu' && s.durum === 'dolu') {
        const ap = apptMap[s.appointment_id] || Object.values(apptMap).find((a) => a.slot_id === s.id);
        const actorId = old.kilitli_agent_id || ap?.agent_id || '';
        events.push({
          sound: 'slot', title: 'book', kind: 'book', quiet: actorId && actorId === currentUser?.id,
          actor: opsPerson(actorId), who: ap?.nachname || '', camp: opsCampName(ap?.campaign_id || s.campaign_id),
          when: (ap && opsWhenFromIso(ap.termin_tarih)) || when,
        });
      } else if (old.durum === 'dolu' && s.durum === 'bos') {
        const ap = prevA[old.appointment_id];
        events.push({
          sound: 'clear', title: 'clear', kind: 'clear', ownerId: ap?.agent_id || '', who: ap?.nachname || '',
          camp: opsCampName(ap?.campaign_id || s.campaign_id), when,
        });
      }
    });
    const qcRows = [];
    Object.values(apptMap).forEach((a) => {
      const old = prevA[a.id];
      if (!old) return;
      if (String(old.termin_tarih || '') !== String(a.termin_tarih || '')) {
        events.push({
          sound: 'move', title: 'move', kind: 'move', ownerId: a.agent_id || '', who: a.nachname || '', camp: opsCampName(a.campaign_id),
          from: opsWhenFromIso(old.termin_tarih), to: opsWhenFromIso(a.termin_tarih),
        });
      }
      if (String(old.durum || '') !== String(a.durum || '')) qcRows.push(a);
    });
    for (const a of qcRows.slice(0, 6)) {
      const key = opsQcKind(a.durum);
      if (_opsAnnounced.has(`${a.id}:${key}`) || _opsAnnounced.has(`${a.id}:${a.durum}`)) continue;
      const entry = opsResultEntry(key);
      if (!entry.on) continue;
      _opsAnnounced.add(`${a.id}:${key}`);
      events.push({
        sound: `result:${key}`, title: 'qc', kind: 'qc', entry, ownerId: a.agent_id || '',
        actor: await opsQcActor(a.contact_id),
        who: a.nachname || '', camp: opsCampName(a.campaign_id), when: opsWhenFromIso(a.termin_tarih),
        result: opsResultLabel(a.durum),
      });
    }
    _opsFloor.slots = slotMap;
    _opsFloor.appts = apptMap;
    events.filter((ev) => opsAgentSeesFloor(ev, currentUser?.role, currentUser?.id)).slice(0, 6).forEach((ev) => {
      opsFloorPush(ev.sound, ev.title, opsFloorText(ev.kind, ev), false, !!ev.quiet, ev.entry);
    });
  } catch (e) {} finally {
    _opsFloorBusy = false;
  }
}

function opsDataText(name, n, min) {
  return `${name}: ${opsSay('ops.data.queue', 'kuyrukta')} ${n} ${opsSay('ops.data.rows', 'kayıt')}, ${opsSay('ops.data.limit', 'sınır')} ${min}.`;
}

async function opsTickData() {
  if (window.__opsHoldData) return;
  if (Date.now() - _opsBootAt < 20000) return;
  if (Date.now() - _opsDataAt < 60000) return;
  if (!opsRoleSeesData() || !opsSoundOn('data') || typeof sb !== 'function' || typeof mbHeadCountExact !== 'function') return;
  const fid = opsFirmId();
  if (!fid) return;
  _opsDataAt = Date.now();
  const min = opsClamp(_opsAlerts.dataMin, 1000, 1, 100000);
  try {
    const camps = await sb(`campaigns?firm_id=eq.${fid}&status=eq.active&select=id,name&limit=30`) || [];
    for (const camp of camps) {
      if (!camp?.id) continue;
      const n = await mbHeadCountExact(`contacts?campaign_id=eq.${camp.id}&status=in.(pending,no_answer,callback)&select=id`);
      if (n == null) continue;
      const id = String(camp.id);
      if (n < min) {
        if (_opsDataLow.has(id)) continue;
        _opsDataLow.add(id);
        const title = opsSay('ops.data.title', 'Veri azaldı');
        const text = opsDataText(String(camp.name || '').trim() || 'Kampanya', n, min);
        toast(`${title}. ${text}`, 'warn', 5000);
        opsCue('data');
        opsRememberNotice(title, text, opsSoundEntry('data').color, 'camp');
      } else {
        _opsDataLow.delete(id);
      }
    }
  } catch (e) {}
}

const OPS_GUN_LABEL = { pzt: 'Pazartesi', sal: 'Salı', car: 'Çarşamba', per: 'Perşembe', cum: 'Cuma', cmt: 'Cumartesi', paz: 'Pazar' };
const OPS_GUN_ORDER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
let _opsMesaiPlan = null;
let _opsMesaiPaintTimer = 0;
let _opsMesaiRotTimer = 0;
let _opsMesaiPopGun = '';
let _opsMesaiTz = 'Europe/Berlin';
let _opsMesaiAt = 0;
const _opsShiftTold = new Set();

function opsBerlinClock(zone) {
  const timeZone = zone === 'Europe/Istanbul' ? 'Europe/Istanbul' : 'Europe/Berlin';
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date()).forEach((part) => { parts[part.type] = part.value; });
  const gun = { Mon: 'pzt', Tue: 'sal', Wed: 'car', Thu: 'per', Fri: 'cum', Sat: 'cmt', Sun: 'paz' }[parts.weekday] || 'pzt';
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second) || 0;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  return { gun, hour, minute, second, mins: hour * 60 + minute, date, zone: timeZone };
}

function opsMesaiTzOf(raw) {
  return raw && raw.tz === 'Europe/Istanbul' ? 'Europe/Istanbul' : 'Europe/Berlin';
}

function opsHm(value, fallback) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

function opsHmMins(value) {
  const hm = opsHm(value, '');
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function opsNormalizeMesaiPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const plan = {};
  let any = false;
  OPS_GUN_ORDER.forEach((gun) => {
    const row = raw[gun];
    if (!row || typeof row !== 'object') return;
    any = true;
    const breaks = (Array.isArray(row.breaks) ? row.breaks : []).map((item) => ({
      start: opsHm(item?.start, ''),
      end: opsHm(item?.end, ''),
    })).filter((item) => item.start && item.end && opsHmMins(item.start) < opsHmMins(item.end));
    breaks.sort((a, b) => opsHmMins(a.start) - opsHmMins(b.start));
    plan[gun] = { off: !!row.off, start: opsHm(row.start, '08:00'), end: opsHm(row.end, '20:00'), breaks };
  });
  return any ? plan : null;
}

function opsMesaiFallbackDay(gun) {
  const fid = opsFirmId();
  const raw = fid && window._firmDefaultTakvimByFirm ? window._firmDefaultTakvimByFirm[fid] : {};
  const cfg = typeof mergeTakvimSettings === 'function'
    ? mergeTakvimSettings(raw)
    : { active_days: ['pzt', 'sal', 'car', 'per', 'cum'], start_hour: '08:00', end_hour: '20:00' };
  return {
    off: !cfg.active_days.includes(gun),
    start: String(cfg.start_hour || '08:00').slice(0, 5),
    end: String(cfg.end_hour || '20:00').slice(0, 5),
    breaks: [],
  };
}

function opsLeftText(mins) {
  const left = Math.max(0, Math.round(Number(mins) || 0));
  const hour = Math.floor(left / 60);
  const minute = left % 60;
  if (hour && minute) return `${hour}s ${minute}dk`;
  if (hour) return `${hour}s`;
  return `${minute}dk`;
}

function opsLeftClock(totalSeconds) {
  const left = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hour = Math.floor(left / 3600);
  const minute = Math.floor((left % 3600) / 60);
  const second = left % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${hour}:${pad(minute)}:${pad(second)}`;
}

function opsBreakMinsText(mins) {
  const n = Math.max(1, Math.round(Number(mins) || 0));
  return opsDe() ? `${n} Min` : `${n} dk`;
}

function opsBreakFace(cue) {
  const parts = String(cue?.when || '').split(/[–-]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const start = opsHmMins(parts[0]);
  const end = opsHmMins(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { text: `${parts[0]}–${parts[1]}`, mins: end - start };
}

function opsMesaiChipSlides(view, cue) {
  const say = (key, fb) => (typeof opsSay === 'function' ? opsSay(key, fb) : fb);
  const day = view?.day;
  const clock = view?.clock || { mins: 0, second: 0 };
  const none = say('ops.mesai.none', 'Mesai yok');
  if (!day || day.off || !day.start || !day.end) return [{ k: 'range', text: none }];
  const span = view.rolled && day.short ? `${day.short} ${day.start}–${day.end}` : `${day.start}–${day.end}`;
  if (cue?.stage === 'over') {
    return [{ k: 'range', text: span }, { k: 'left', text: say('ops.mesai.chipOver', 'Bitti') }];
  }
  const secNow = clock.mins * 60 + (Number(clock.second) || 0);
  let leftSec = null;
  if (view.rolled || cue?.stage === 'start') {
    const mins = view.rolled
      ? opsMinsUntilGun(clock, view.gun)
      : Math.max(0, (opsHmMins(day.start) || 0) - clock.mins);
    leftSec = Math.max(0, mins * 60 - (Number(clock.second) || 0));
  } else if (cue?.stage === 'live') {
    const end = opsHmMins(String(cue.when || '').split(/[–-]/)[1]);
    if (end != null) leftSec = end * 60 - secNow;
  } else if (cue?.stage === 'break') {
    const start = opsHmMins(cue.breakStart);
    if (start != null) leftSec = start * 60 - secNow;
  } else if (cue?.stage === 'end') {
    const end = opsHmMins(day.end);
    if (end != null) leftSec = end * 60 - secNow;
  }
  const slides = [{ k: 'range', text: span }];
  if (cue?.stage === 'live' || cue?.stage === 'break') {
    const face = opsBreakFace(cue);
    if (face) {
      slides.push({ k: 'break', text: face.text });
      slides.push({ k: 'len', text: opsBreakMinsText(face.mins) });
    }
  }
  if (leftSec != null) slides.push({ k: 'left', text: opsLeftClock(Math.max(0, leftSec)) });
  return slides;
}

function opsApplyMesaiSlide(prev) {
  const rot = document.getElementById('tb-mesai-rot');
  if (!rot) return;
  const kids = [...rot.children];
  if (!kids.length) return;
  let index = Number(rot.dataset.i) || 0;
  if (index >= kids.length) index = 0;
  rot.dataset.i = String(index);
  kids.forEach((el, n) => {
    el.classList.toggle('is-on', n === index);
    el.classList.toggle('is-out', prev != null && n === prev && n !== index);
    el.setAttribute('aria-hidden', n === index ? 'false' : 'true');
  });
}

function opsPaintMesaiSlides(slides) {
  const rot = document.getElementById('tb-mesai-rot');
  if (!rot) return;
  const list = Array.isArray(slides) && slides.length ? slides : [];
  const sig = list.map((item) => item.k).join(',');
  if (rot.dataset.sig !== sig) {
    const index = Math.min(Number(rot.dataset.i) || 0, Math.max(0, list.length - 1));
    rot.dataset.sig = sig;
    rot.dataset.i = String(index);
    rot.replaceChildren(...list.map((item) => {
      const el = document.createElement('span');
      el.dataset.k = item.k;
      if (item.k === 'range') el.id = 'tb-mesai-label';
      if (item.k === 'left') el.id = 'tb-mesai-left';
      el.textContent = item.text;
      return el;
    }));
    opsApplyMesaiSlide();
    return;
  }
  list.forEach((item) => {
    const el = rot.querySelector(`[data-k="${item.k}"]`);
    if (el && el.textContent !== item.text) el.textContent = item.text;
  });
}

function opsMesaiWindow() {
  const clock = opsBerlinClock(_opsMesaiTz);
  const row = _opsMesaiPlan?.[clock.gun] || opsMesaiFallbackDay(clock.gun);
  if (!row || row.off) return { off: true, breaks: [], label: OPS_GUN_LABEL[clock.gun], clock };
  return {
    off: false,
    start: row.start,
    end: row.end,
    breaks: Array.isArray(row.breaks) ? row.breaks : [],
    label: OPS_GUN_LABEL[clock.gun],
    clock,
  };
}

function opsMesaiPrev(now, start, breaks) {
  let prev = start;
  (breaks || []).forEach((item) => {
    const end = opsHmMins(item.end);
    if (end != null && end <= now && end > prev) prev = end;
  });
  return prev;
}

function opsBreakSoon() {
  const win = opsMesaiWindow();
  if (!win || win.off || win.clock?.mins == null) return null;
  const now = win.clock.mins;
  let best = null;
  (win.breaks || []).forEach((item) => {
    const a = opsHmMins(item.start);
    if (a == null) return;
    const left = a - now;
    if (left > 0 && left <= 2 && (!best || left < best.left)) best = { left, item };
  });
  return best;
}

function opsNoteBreakSoon() {
  const soon = opsBreakSoon();
  if (!soon || !soon.item) return;
  const day = opsMesaiWindow().clock?.date || '';
  const key = `brkSoon:${day}:${soon.item.start}`;
  if (_opsShiftTold.has(key)) return;
  _opsShiftTold.add(key);
  const span = soon.item.start && soon.item.end ? `${soon.item.start}–${soon.item.end}` : '';
  const title = opsSay('ops.mesai.breakSoon', 'Mola 2 dk');
  const sentence = span ? `${title} · ${span}` : title;
  opsFlashMesaiChip(sentence);
  if (typeof toast === 'function') toast(sentence, 'ok', 4000);
}

function opsMesaiPhase(win) {
  const none = opsSay('ops.mesai.none', 'Mesai yok');
  if (!win || win.off) return { range: none, short: none, detail: none, pct: 0, due: false };
  const now = win.clock.mins;
  const start = opsHmMins(win.start);
  const end = opsHmMins(win.end);
  const range = `${win.start}–${win.end}`;
  if (start == null || end == null) return { range, short: range, detail: range, pct: 0, due: false };
  const chip = (key, fallback, left) => `${opsSay(key, fallback)} ${opsLeftText(left)}`;
  const moment = (key, fallback, pct) => {
    const text = opsSay(key, fallback);
    return { range, short: text, detail: text, pct, due: true, hold: true };
  };
  if (now >= end) {
    if (now - end <= 1) return moment('ops.mesai.ended', 'Mesai bitti', 100);
    const over = opsSay('ops.mesai.chipOver', 'Bitti');
    return { range, short: over, detail: opsSay('ops.mesai.over', 'Mesai bitti'), pct: 100, due: false };
  }
  if (now < start) {
    const left = start - now;
    return {
      range,
      short: chip('ops.mesai.chipStart', 'Başlama', left),
      detail: `${opsSay('ops.mesai.toStart', 'başlamaya')} ${opsLeftText(left)}`,
      pct: start > 0 ? Math.max(0, Math.min(100, (now / start) * 100)) : 0,
      due: left <= 1,
    };
  }
  const breaks = win.breaks || [];
  const live = breaks.find((item) => {
    const a = opsHmMins(item.start);
    const z = opsHmMins(item.end);
    return a != null && z != null && now >= a && now < z;
  });
  if (live) {
    const a = opsHmMins(live.start);
    const z = opsHmMins(live.end);
    const pct = Math.max(0, Math.min(100, ((now - a) / Math.max(1, z - a)) * 100));
    if (now - a <= 1) return moment('ops.mesai.breakOn', 'Mola başladı', pct);
    return {
      range,
      short: chip('ops.mesai.chipIn', 'Molada', z - now),
      detail: `${opsSay('ops.mesai.inBreak', 'molada')} ${opsLeftText(z - now)}`,
      pct,
      due: false,
    };
  }
  const ended = breaks.find((item) => {
    const z = opsHmMins(item.end);
    return z != null && now >= z && now - z <= 1;
  });
  if (ended) return moment('ops.mesai.breakOff', 'Mola bitti', 8);
  if (now - start <= 1) {
    return moment('ops.mesai.started', 'Mesai başladı', 12);
  }
  const next = breaks.find((item) => {
    const a = opsHmMins(item.start);
    return a != null && a > now && a < end;
  });
  if (next) {
    const a = opsHmMins(next.start);
    const prev = opsMesaiPrev(now, start, breaks);
    return {
      range,
      short: chip('ops.mesai.chipBreak', 'Mola', a - now),
      detail: `${opsSay('ops.mesai.toBreak', 'molaya')} ${opsLeftText(a - now)}`,
      pct: Math.max(0, Math.min(100, ((now - prev) / Math.max(1, a - prev)) * 100)),
      due: a - now <= 1,
    };
  }
  const prev = opsMesaiPrev(now, start, breaks);
  const left = end - now;
  return {
    range,
    short: chip('ops.mesai.chipEnd', 'Bitiş', left),
    detail: `${opsSay('ops.mesai.toEnd', 'bitişe')} ${opsLeftText(left)}`,
    pct: Math.max(0, Math.min(100, ((now - prev) / Math.max(1, end - prev)) * 100)),
    due: left <= 1,
  };
}

function opsNextWorkGun(fromGun) {
  const idx = Math.max(0, OPS_GUN_ORDER.indexOf(fromGun));
  for (let step = 1; step <= 7; step += 1) {
    const gun = OPS_GUN_ORDER[(idx + step) % 7];
    if (!opsMesaiDay(gun).off) return gun;
  }
  return fromGun;
}

function opsMesaiFocus() {
  const clock = opsBerlinClock(_opsMesaiTz);
  const today = opsMesaiDay(clock.gun);
  const end = today.off ? null : opsHmMins(today.end);
  if (!today.off && end != null && clock.mins < end + 120) {
    return { gun: clock.gun, clock, rolled: false, day: today };
  }
  const gun = opsNextWorkGun(clock.gun);
  return { gun, clock, rolled: true, day: opsMesaiDay(gun) };
}

function opsMinsUntilGun(clock, gun) {
  const idxNow = OPS_GUN_ORDER.indexOf(clock.gun);
  const idx = OPS_GUN_ORDER.indexOf(gun);
  let days = (idx - idxNow + 7) % 7;
  if (days === 0) days = 7;
  const start = opsHmMins(opsMesaiDay(gun).start) || 0;
  return Math.max(0, (24 * 60 - clock.mins) + (days - 1) * 24 * 60 + start);
}

function opsMesaiCue(day, mins, kind) {
  const say = (key, fb) => opsSay(key, fb);
  const none = say('ops.mesai.none', 'Mesai yok');
  const start = opsHmMins(day?.start);
  const end = opsHmMins(day?.end);
  const breaks = day?.breaks || [];
  if (!day || day.off || start == null || end == null) {
    return { title: none, when: '', short: none, detail: none, stage: 'off', breakStart: '' };
  }
  if (kind === 'future') {
    const left = opsLeftText(mins);
    return {
      title: say('ops.mesai.nextShift', 'Sonraki mesai'),
      when: day.start,
      short: `${say('ops.mesai.chipNext', 'Sonraki')} ${left}`,
      detail: `${say('ops.mesai.nextShift', 'Sonraki mesai')} ${left}`,
      stage: 'start',
      breakStart: '',
    };
  }
  if (kind === 'look') {
    const span = `${day.start}–${day.end}`;
    return { title: span, when: '', short: span, detail: '', stage: '', breakStart: '' };
  }
  if (mins >= end) {
    return {
      title: say('ops.mesai.ended', 'Mesai bitti'),
      when: day.end,
      short: say('ops.mesai.chipOver', 'Bitti'),
      detail: say('ops.mesai.over', 'Mesai bitti'),
      stage: 'over',
      breakStart: '',
    };
  }
  if (mins < start) {
    const left = opsLeftText(start - mins);
    return {
      title: say('ops.mesai.startAt', 'Başlangıç'),
      when: day.start,
      short: `${say('ops.mesai.chipStart', 'Başlama')} ${left}`,
      detail: `${say('ops.mesai.toStart', 'başlamaya')} ${left}`,
      stage: 'start',
      breakStart: '',
    };
  }
  const live = breaks.find((item) => {
    const a = opsHmMins(item.start);
    const z = opsHmMins(item.end);
    return a != null && z != null && mins >= a && mins < z;
  });
  if (live) {
    const left = opsLeftText(opsHmMins(live.end) - mins);
    return {
      title: say('ops.mesai.chipIn', 'Molada'),
      when: `${live.start}–${live.end}`,
      short: `${say('ops.mesai.chipIn', 'Molada')} ${left}`,
      detail: `${say('ops.mesai.inBreak', 'molada')} ${left}`,
      stage: 'live',
      breakStart: live.start,
    };
  }
  const next = breaks.find((item) => {
    const a = opsHmMins(item.start);
    return a != null && a > mins && a < end;
  });
  if (next) {
    const left = opsLeftText(opsHmMins(next.start) - mins);
    return {
      title: say('ops.mesai.nextBreak', 'Sonraki mola'),
      when: `${next.start}–${next.end}`,
      short: `${say('ops.mesai.chipBreak', 'Mola')} ${left}`,
      detail: `${say('ops.mesai.toBreak', 'molaya')} ${left}`,
      stage: 'break',
      breakStart: next.start,
    };
  }
  const left = opsLeftText(end - mins);
  return {
    title: say('ops.mesai.endAt', 'Bitiş'),
    when: day.end,
    short: `${say('ops.mesai.chipEnd', 'Bitiş')} ${left}`,
    detail: `${say('ops.mesai.toEnd', 'bitişe')} ${left}`,
    stage: 'end',
    breakStart: '',
  };
}

function opsMesaiStateWord(cue) {
  const say = (key, fb) => (typeof opsSay === 'function' ? opsSay(key, fb) : fb);
  const stage = cue?.stage || '';
  if (stage === 'live') return say('ops.mesai.stateBreak', 'Molada');
  if (stage === 'over' || stage === 'off') return say('ops.mesai.stateOver', 'Bitti');
  if (stage === 'start') return say('ops.mesai.stateWait', 'Başlıyor');
  return say('ops.mesai.stateOn', 'Mesaide');
}

function opsPaintMesaiBar() {
  const btn = document.getElementById('tb-mesai-btn');
  const rot = document.getElementById('tb-mesai-rot');
  if (!btn || !rot) return;
  const view = opsMesaiFocus();
  const phase = opsMesaiPhase(opsMesaiWindow());
  const cue = view.rolled
    ? opsMesaiCue(view.day, opsMinsUntilGun(view.clock, view.gun), 'future')
    : opsMesaiCue(view.day, view.clock.mins, 'live');
  const flashed = _opsMesaiFlash && _opsMesaiFlash.until > Date.now();
  const word = opsMesaiStateWord(cue);
  const detail = flashed ? _opsMesaiFlash.text : (cue.detail || cue.title);
  const chip = opsMesaiChipSlides(view, cue);
  opsPaintMesaiSlides(chip);
  btn.title = detail && detail !== word ? `${word} · ${detail}` : word;
  btn.classList.toggle('is-due', flashed || (!view.rolled && !!phase.due));
  btn.classList.toggle('is-break-soon', !view.rolled && !!opsBreakSoon());
  const fill = document.getElementById('tb-mesai-fill');
  if (fill) fill.style.width = view.rolled ? '0%' : `${Math.round(phase.pct)}%`;
  const pop = document.getElementById('tb-mesai-pop');
  if (pop && !pop.hidden) opsFillMesaiPop(pop);
  if (typeof mbFitStatus === 'function') mbFitStatus();
}

function opsMesaiDay(gun) {
  const row = _opsMesaiPlan?.[gun] || opsMesaiFallbackDay(gun);
  const shorts = opsDe()
    ? { pzt: 'Mo', sal: 'Di', car: 'Mi', per: 'Do', cum: 'Fr', cmt: 'Sa', paz: 'So' }
    : { pzt: 'Pzt', sal: 'Sal', car: 'Çar', per: 'Per', cum: 'Cum', cmt: 'Cmt', paz: 'Paz' };
  return {
    gun,
    short: shorts[gun] || gun,
    label: OPS_GUN_LABEL[gun] || gun,
    off: !row || !!row.off,
    start: row?.start || '',
    end: row?.end || '',
    breaks: Array.isArray(row?.breaks) ? row.breaks : [],
  };
}

function opsMesaiTrack(day, mins, live) {
  const track = document.createElement('div');
  track.className = 'tb-mesai-track';
  const start = opsHmMins(day.start);
  const end = opsHmMins(day.end);
  if (day.off || start == null || end == null || end <= start) return track;
  const span = end - start;
  const now = live ? mins : null;
  const marks = (day.breaks || []).map((item) => ({
    a: opsHmMins(item.start),
    z: opsHmMins(item.end),
  })).filter((item) => item.a != null && item.z != null && item.z > item.a && item.z > start && item.a < end);
  const seg = (cls, a, z) => {
    const node = document.createElement('i');
    let name = cls;
    if (now != null) {
      if (now >= z) name += ' is-done';
      else if (now >= a) name += ' is-live';
    }
    node.className = name;
    node.style.left = `${((a - start) / span) * 100}%`;
    node.style.width = `${Math.max(cls === 'tb-mesai-gap' ? 1.5 : 0, ((z - a) / span) * 100)}%`;
    track.appendChild(node);
  };
  let cursor = start;
  marks.forEach((item) => {
    const a = Math.max(item.a, start);
    const z = Math.min(item.z, end);
    if (a > cursor) seg('tb-mesai-work', cursor, a);
    seg('tb-mesai-gap', a, z);
    cursor = Math.max(cursor, z);
  });
  if (end > cursor) seg('tb-mesai-work', cursor, end);
  if (now != null && now >= start) {
    const dot = document.createElement('b');
    dot.className = 'tb-mesai-now';
    const at = Math.min(now, end);
    dot.style.left = `${((at - start) / span) * 100}%`;
    track.appendChild(dot);
  }
  return track;
}

function opsMesaiStages(day, mins, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'tb-mesai-stages';
  const start = opsHmMins(day.start);
  const end = opsHmMins(day.end);
  if (day.off || start == null || end == null) return wrap;
  const cue = opsMesaiCue(day, kind === 'future' ? 0 : mins, kind === 'look' ? 'look' : kind);
  const stages = [{ id: 'start', label: opsSay('ops.mesai.startAt', 'Başlangıç'), time: day.start }];
  (day.breaks || []).forEach((item) => {
    stages.push({ id: item.start, label: opsSay('ops.break.title', 'Mola'), time: item.start });
  });
  stages.push({ id: 'end', label: opsSay('ops.mesai.endAt', 'Bitiş'), time: day.end });
  stages.forEach((stage) => {
    const el = document.createElement('div');
    el.className = 'tb-mesai-stage';
    if (kind === 'future' && stage.id === 'start') el.classList.add('is-next');
    if (kind === 'live' && mins != null) {
      if (stage.id === 'start') el.classList.add(mins >= start ? 'is-done' : 'is-next');
      else if (stage.id === 'end') {
        if (mins >= end) el.classList.add('is-done');
        else if (cue.stage === 'end') el.classList.add('is-next');
      } else {
        const item = (day.breaks || []).find((row) => row.start === stage.id);
        const a = opsHmMins(item?.start);
        const z = opsHmMins(item?.end);
        if (z != null && mins >= z) el.classList.add('is-done');
        else if (a != null && mins >= a) el.classList.add('is-live');
        else if (cue.breakStart === stage.id) el.classList.add('is-next');
      }
    }
    if (stage.id !== 'start' && stage.id !== 'end') el.classList.add('is-break');
    const name = document.createElement('span');
    name.textContent = stage.label;
    const time = document.createElement('b');
    time.textContent = stage.time || '';
    el.append(name, time);
    wrap.appendChild(el);
  });
  return wrap;
}

function opsMesaiPickDay(gun, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  _opsMesaiPopGun = gun;
  const pop = document.getElementById('tb-mesai-pop');
  if (pop) opsFillMesaiPop(pop);
}

function opsFillMesaiPop(pop) {
  const focus = opsMesaiFocus();
  const open = OPS_GUN_ORDER.filter((key) => !opsMesaiDay(key).off);
  let gun = OPS_GUN_ORDER.includes(_opsMesaiPopGun) ? _opsMesaiPopGun : focus.gun;
  if (!open.includes(gun)) gun = open.includes(focus.gun) ? focus.gun : (open[0] || gun);
  _opsMesaiPopGun = gun;
  const day = opsMesaiDay(gun);
  const isLive = !focus.rolled && gun === focus.clock.gun;
  const isFuture = focus.rolled && gun === focus.gun;
  const kind = isLive ? 'live' : (isFuture ? 'future' : 'look');
  const mins = isFuture ? opsMinsUntilGun(focus.clock, gun) : focus.clock.mins;
  const cue = opsMesaiCue(day, mins, kind);
  pop.replaceChildren();
  if (open.length) {
    const days = document.createElement('div');
    days.className = 'tb-mesai-days';
    open.forEach((key) => {
      const item = opsMesaiDay(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-mesai-day is-on';
      if (key === focus.clock.gun) btn.classList.add('is-today');
      if (key === gun) btn.classList.add('is-pick');
      btn.textContent = item.short;
      btn.onclick = (ev) => opsMesaiPickDay(key, ev);
      days.appendChild(btn);
    });
    pop.appendChild(days);
  }
  const head = document.createElement('div');
  head.className = 'tb-mesai-head';
  const name = document.createElement('b');
  name.textContent = day.label;
  const next = document.createElement('div');
  next.className = 'tb-mesai-next';
  if (kind === 'look') {
    const span = document.createElement('span');
    span.textContent = day.off ? opsSay('ops.mesai.none', 'Mesai yok') : `${day.start}–${day.end}`;
    next.appendChild(span);
  } else {
    const small = document.createElement('small');
    small.textContent = cue.title;
    const span = document.createElement('span');
    span.textContent = cue.when || cue.title;
    next.append(small, span);
  }
  head.append(name, next);
  pop.appendChild(head);
  pop.appendChild(opsMesaiTrack(day, isLive ? focus.clock.mins : null, isLive));
  pop.appendChild(opsMesaiStages(day, isLive ? focus.clock.mins : null, kind));
  const sub = document.createElement('div');
  sub.className = 'tb-mesai-sub';
  const zone = _opsMesaiTz === 'Europe/Istanbul' ? opsSay('mesai.tz.tr', 'Türkiye') : opsSay('mesai.tz.berlin', 'Berlin');
  if (kind === 'live' || kind === 'future') sub.textContent = `${cue.detail} · ${zone}`;
  else if (day.off) sub.textContent = opsSay('ops.mesai.none', 'Mesai yok');
  if (sub.textContent) pop.appendChild(sub);
  const kicker = document.createElement('div');
  kicker.className = 'tb-mesai-kicker';
  kicker.textContent = opsSay('ops.mesai.breaks', 'Molalar');
  pop.appendChild(kicker);
  const breaks = day.off ? [] : day.breaks;
  if (!breaks.length) {
    const empty = document.createElement('div');
    empty.className = 'tb-mesai-empty';
    empty.textContent = opsSay('ops.mesai.noBreak', 'Mola yok');
    pop.appendChild(empty);
    return;
  }
  breaks.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'tb-mesai-card';
    if (kind === 'live') {
      const a = opsHmMins(item.start);
      const z = opsHmMins(item.end);
      if (z != null && focus.clock.mins >= z) card.classList.add('is-done');
      else if (a != null && focus.clock.mins >= a) card.classList.add('is-live');
      else if (cue.breakStart === item.start) card.classList.add('is-next');
    }
    const badge = document.createElement('i');
    badge.textContent = String(index + 1);
    const label = document.createElement('span');
    label.textContent = opsSay('ops.break.title', 'Mola');
    const when = document.createElement('b');
    when.textContent = `${item.start}–${item.end}`;
    card.append(badge, label, when);
    pop.appendChild(card);
  });
}

function opsPlaceMesaiPop(pop) {
  const btn = document.getElementById('tb-mesai-btn');
  if (!btn || !pop) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const width = 380;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function opsOpenMesaiInfo() {
  const pop = document.getElementById('tb-mesai-pop');
  if (!pop) return;
  if (typeof mbCloseTopbarPops === 'function') mbCloseTopbarPops('mesai');
  if (pop.hidden) {
    opsFillMesaiPop(pop);
    pop.hidden = false;
  }
  opsPlaceMesaiPop(pop);
}

function opsCloseMesaiInfo() {
  const pop = document.getElementById('tb-mesai-pop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  _opsMesaiPopGun = '';
}

function opsToggleMesaiInfo(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const pop = document.getElementById('tb-mesai-pop');
  if (!pop) return;
  if (!pop.hidden) {
    opsCloseMesaiInfo();
    return;
  }
  opsOpenMesaiInfo();
}

function opsShowMesaiPop() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(window._tbMesaiHide);
  const pop = document.getElementById('tb-mesai-pop');
  if (pop && !pop.hidden) return;
  opsOpenMesaiInfo();
}

function opsScheduleHideMesai() {
  clearTimeout(window._tbMesaiHide);
  window._tbMesaiHide = setTimeout(() => {
    const pop = document.getElementById('tb-mesai-pop');
    const btn = document.getElementById('tb-mesai-btn');
    if (!pop || pop.hidden) return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    opsCloseMesaiInfo();
  }, 180);
}

function opsApplyMesaiPlan(raw) {
  _opsMesaiPlan = opsNormalizeMesaiPlan(raw);
  _opsMesaiTz = opsMesaiTzOf(raw);
  _opsMesaiAt = Date.now();
  opsPaintMesaiBar();
}

async function opsLoadMesai() {
  if (Date.now() - _opsMesaiAt < 60000) {
    opsPaintMesaiBar();
    return;
  }
  _opsMesaiAt = Date.now();
  const fid = opsFirmId();
  if (!fid || typeof sb !== 'function') {
    opsPaintMesaiBar();
    return;
  }
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const raw = rows?.[0]?.settings?.mesai_plan;
    _opsMesaiPlan = opsNormalizeMesaiPlan(raw);
    _opsMesaiTz = opsMesaiTzOf(raw);
  } catch (e) {
    _opsMesaiPlan = null;
  }
  if (typeof ensureFirmTakvimDefaultsLoaded === 'function') await ensureFirmTakvimDefaultsLoaded(fid);
  opsPaintMesaiBar();
}

function opsTickShift() {
  if (window.__opsHoldShift || !currentUser) return;
  const win = opsMesaiWindow();
  if (win.off || !win.start || !win.end) return;
  const now = win.clock.mins;
  const day = win.clock.date;
  const fire = (sound, key, title, body) => {
    if (_opsShiftTold.has(key)) return;
    _opsShiftTold.add(key);
    if (!opsSoundOn(sound)) return;
    const sentence = body ? `${title}. ${body}` : title;
    toast(sentence, sound === 'shift' ? 'warn' : 'ok', 5000);
    opsCue(sound);
    opsRememberNotice(title, body || title, opsSoundEntry(sound).color, 'live');
    opsMountMesaiStrip(sentence);
    opsFlashMesaiChip(title);
  };
  const start = opsHmMins(win.start);
  if (start != null && now - start >= 0 && now - start <= 2) {
    fire('shift_on', `on:${day}`, opsSay('ops.mesai.started', 'Mesai başladı'), win.start);
  }
  (win.breaks || []).forEach((item) => {
    const a = opsHmMins(item.start);
    const z = opsHmMins(item.end);
    const span = item.start && item.end ? `${item.start}–${item.end}` : '';
    if (a != null && now - a >= 0 && now - a <= 2) {
      fire('break', `brk:${day}:${item.start}`, opsSay('ops.mesai.breakOn', 'Mola başladı'), span);
    }
    if (z != null && now - z >= 0 && now - z <= 2) {
      fire('break_end', `brkEnd:${day}:${item.end}`, opsSay('ops.mesai.breakOff', 'Mola bitti'), span);
    }
  });
  const end = opsHmMins(win.end);
  if (end != null && now - end >= 0 && now - end <= 2) {
    fire('shift', `end:${day}`, opsSay('ops.mesai.ended', 'Mesai bitti'), win.end);
  }
  opsNoteBreakSoon();
}

function opsSpinMesaiChip() {
  const rot = document.getElementById('tb-mesai-rot');
  if (!rot || rot.children.length < 2) return;
  const prev = Number(rot.dataset.i) || 0;
  rot.dataset.i = String((prev + 1) % rot.children.length);
  opsApplyMesaiSlide(prev);
}

function opsBoot() {
  if (_opsDirectiveTimer) clearInterval(_opsDirectiveTimer);
  if (_opsMesaiPaintTimer) clearInterval(_opsMesaiPaintTimer);
  if (_opsMesaiRotTimer) clearInterval(_opsMesaiRotTimer);
  _opsMesaiRotTimer = setInterval(opsSpinMesaiChip, 5000);
  _opsMesaiPaintTimer = setInterval(() => {
    if (!currentUser) return;
    opsPaintMesaiBar();
  }, 1000);
  _opsDirectiveTimer = setInterval(() => {
    if (!currentUser) return;
    opsLoadDirective();
    opsTickLive();
    opsTickFloor();
    opsTickData();
    opsLoadMesai();
    opsTickShift();
  }, 15000);
  if (currentUser) {
    opsLoadDirective();
    opsTickLive();
    opsTickFloor();
    opsTickData();
    opsLoadMesai();
    opsPaintMesaiBar();
  }
}

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('tb-mesai-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#tb-mesai-btn, #tb-mesai-pop')) return;
  pop.hidden = true;
});

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('tb-camp-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#pill-camp-btn, #tb-camp-pop')) return;
  pop.hidden = true;
});

document.addEventListener('click', (ev) => {
  const panel = document.getElementById('ops-camp-panel');
  if (!panel) return;
  if (panel.contains(ev.target)) return;
  if (ev.target.closest && ev.target.closest('#pill-camp-btn')) return;
  opsCloseCampPanel();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', opsBoot);
else opsBoot();
