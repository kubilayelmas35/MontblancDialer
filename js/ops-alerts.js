// Üst çubuk kampanya bildirimi ve canlı görüşme / bekleme kartları.
// Personelin açık kampanyası tarayıcıda durur; uyarı o listeyi firmanın bildirimiyle karşılaştırır.

let _opsDirective = { ids: [], at: '', by: '' };
let _opsAlerts = {
  callMin: 4, goldAfter: 1, waitMin: 1,
  roles: ['agent', 'field_agent'], effect: 'aurora', appt: true, campaign: true,
  sounds: { volume: 70, due: true, soon: true, hour: true, slot: true, wrong: true, call: true, wait: true, ok: true, bad: true },
};
let _opsNotifPrimed = false;
let _opsWrongSig = '';
let _opsCampNames = {};
let _opsDirectiveTimer = null;
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

const OPS_TONE_IDS = ['chime', 'bell', 'soft', 'glass', 'pop'];
const OPS_TONE_DEFAULT = { due: 'chime', soon: 'soft', hour: 'bell', slot: 'glass', wrong: 'pop', call: 'bell', wait: 'soft', ok: 'chime', bad: 'pop' };
const OPS_TONE_NOTES = {
  chime: [[523, 0], [659, 0.13], [784, 0.26]],
  bell: [[880, 0], [1175, 0.04]],
  soft: [[440, 0], [554, 0.18]],
  glass: [[1047, 0], [1568, 0.1]],
  pop: [[392, 0], [523, 0.08]],
};

function opsSoundKey(kind) {
  if (kind === 'wv' || kind === 'due') return 'due';
  if (kind === 'gold' || kind === 'call') return 'call';
  return kind;
}

function opsSoundEntry(key) {
  const raw = _opsAlerts.sounds?.[key];
  const tone = OPS_TONE_DEFAULT[key] || 'chime';
  if (raw && typeof raw === 'object') {
    return { on: raw.on !== false, tone: OPS_TONE_IDS.includes(raw.tone) ? raw.tone : tone };
  }
  return { on: raw !== false, tone };
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
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 900);
  } catch (e) {}
}

function opsCue(kind) {
  if (!opsSoundOn(kind)) return;
  opsPlayTone(opsSoundEntry(opsSoundKey(kind)).tone, _opsAlerts.sounds?.volume);
}

function opsPreviewSound(kind) {
  const picked = document.querySelector(`[data-tone="${kind}"]`)?.value;
  const tone = OPS_TONE_IDS.includes(picked) ? picked : opsSoundEntry(opsSoundKey(kind)).tone;
  const vol = Number(document.getElementById('ops-sound-vol')?.value);
  opsPlayTone(tone, Number.isFinite(vol) ? vol : _opsAlerts.sounds?.volume);
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
    if (prevAt && nextAt && prevAt !== nextAt && _opsAlerts.campaign && opsRoleSeesWarn()) {
      toast(opsSay('ops.notice.campaign', 'Yeni kampanya bildirimi geldi'), 'ok', 5000);
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
  const roles = Array.isArray(src.warn_roles) ? src.warn_roles.map(String) : ['agent', 'field_agent'];
  const effect = ['aurora', 'gradient', 'blink', 'solid'].includes(src.bar_effect) ? src.bar_effect : 'aurora';
  _opsAlerts = {
    callMin: opsClamp(src.call_min, 4, 1, 60),
    goldAfter: opsClamp(src.gold_after_min, 1, 0, 30),
    waitMin: opsClamp(src.wait_min, 1, 1, 30),
    roles,
    effect,
    appt: src.notify_appt !== false,
    campaign: src.notify_campaign !== false,
    sounds: opsReadSounds(src.sounds),
  };
}

function opsReadSounds(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sounds = { volume: opsClamp(src.volume, 70, 0, 100) };
  Object.keys(OPS_TONE_DEFAULT).forEach((key) => {
    const item = src[key];
    const tone = OPS_TONE_DEFAULT[key];
    if (item && typeof item === 'object') {
      sounds[key] = { on: item.on !== false, tone: OPS_TONE_IDS.includes(item.tone) ? item.tone : tone };
    } else {
      sounds[key] = { on: item !== false, tone };
    }
  });
  return sounds;
}

function opsRoleSeesWarn() {
  const role = String(currentUser?.role || '');
  return !!role && (_opsAlerts.roles || []).includes(role);
}

function opsNotifyPrefs() {
  return _opsAlerts;
}

function opsPaintCampWarn() {
  const bar = document.getElementById('ops-camp-warn');
  if (!bar) return;
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

function opsPickEffect(effect) {
  const card = document.getElementById('notif-settings-card');
  const next = ['aurora', 'gradient', 'blink', 'solid'].includes(effect) ? effect : 'aurora';
  if (card) card.dataset.effect = next;
  document.querySelectorAll('#ops-effect-picks button').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.effect === next);
  });
  const preview = document.getElementById('ops-warn-preview');
  if (preview) preview.className = `ops-camp-warn is-${next} ops-warn-preview`;
}

function opsFillNotifSettings() {
  const card = document.getElementById('notif-settings-card');
  if (!card) return;
  card.querySelectorAll('[data-role]').forEach((box) => {
    box.checked = (_opsAlerts.roles || []).includes(box.dataset.role);
  });
  const call = document.getElementById('ops-set-call');
  const gold = document.getElementById('ops-set-gold');
  const wait = document.getElementById('ops-set-wait');
  if (call) call.value = String(_opsAlerts.callMin);
  if (gold) gold.value = String(_opsAlerts.goldAfter);
  if (wait) wait.value = String(_opsAlerts.waitMin);
  const appt = document.getElementById('ops-notify-appt');
  const camp = document.getElementById('ops-notify-camp');
  if (appt) appt.checked = _opsAlerts.appt !== false;
  if (camp) camp.checked = _opsAlerts.campaign !== false;
  const vol = document.getElementById('ops-sound-vol');
  if (vol) vol.value = String(_opsAlerts.sounds?.volume ?? 70);
  card.querySelectorAll('[data-sound]').forEach((box) => {
    const entry = opsSoundEntry(box.dataset.sound);
    box.checked = entry.on;
    const sel = card.querySelector(`[data-tone="${box.dataset.sound}"]`);
    if (sel) sel.value = entry.tone;
  });
  opsPickEffect(_opsAlerts.effect || 'aurora');
}

function opsCollectSounds(card) {
  const sounds = { volume: opsClamp(document.getElementById('ops-sound-vol')?.value, 70, 0, 100) };
  Object.keys(OPS_TONE_DEFAULT).forEach((key) => {
    const tone = card.querySelector(`[data-tone="${key}"]`)?.value;
    sounds[key] = {
      on: !!card.querySelector(`[data-sound="${key}"]`)?.checked,
      tone: OPS_TONE_IDS.includes(tone) ? tone : OPS_TONE_DEFAULT[key],
    };
  });
  return sounds;
}

let _opsSampleTimer = null;
function opsShowSample(kind) {
  opsPreviewSound(kind);
  document.getElementById('ops-sample-host')?.remove();
  if (_opsSampleTimer) clearTimeout(_opsSampleTimer);
  if (kind === 'soon' || kind === 'slot' || kind === 'ok' || kind === 'bad') {
    const msg = {
      soon: 'Örnek Müşteri — 15 dk sonra aranacak',
      slot: 'Örnek: randevu kaydedildi',
      ok: 'Örnek: başarılı sonuç',
      bad: 'Örnek: olumsuz sonuç',
    }[kind];
    toast(msg, kind === 'bad' ? 'err' : 'ok', 4000);
    return;
  }
  const host = document.createElement('div');
  host.id = 'ops-sample-host';
  const close = () => host.remove();
  if (kind === 'due') {
    host.className = 'ops-sample-host is-modal';
    const card = document.createElement('div');
    card.className = 'wv-due-card';
    const title = document.createElement('h3');
    title.textContent = opsSay('wv.due.title', 'Arama vakti geldi');
    const who = document.createElement('p');
    who.textContent = 'Örnek Müşteri';
    const phone = document.createElement('p');
    phone.textContent = 'Telefon: +49 170 000';
    const place = document.createElement('p');
    place.textContent = 'Yer: 10115 Berlin';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = opsSay('wv.due.snooze', 'Tamam');
    btn.onclick = close;
    card.append(title, who, phone, place, btn);
    host.appendChild(card);
    host.addEventListener('click', (ev) => { if (ev.target === host) close(); });
  } else if (kind === 'hour') {
    host.className = 'ops-sample-host';
    const bar = document.createElement('div');
    bar.className = 'ops-appt-strip';
    bar.textContent = 'Aranacaklar · Örnek Müşteri · 45 dk';
    host.appendChild(bar);
  } else if (kind === 'wrong') {
    host.className = 'ops-sample-host';
    const bar = document.createElement('div');
    bar.className = `ops-camp-warn is-${document.getElementById('notif-settings-card')?.dataset.effect || _opsAlerts.effect || 'aurora'}`;
    const text = document.createElement('span');
    text.className = 'ops-camp-warn-text';
    text.textContent = 'Yanlış kampanyadasın. Seçmelisin: Örnek Kampanya. Kapatmalısın: Eski Kampanya.';
    bar.appendChild(text);
    host.appendChild(bar);
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
  }
  document.body.appendChild(host);
  _opsSampleTimer = setTimeout(close, 4500);
}

async function opsSaveNotifSettings() {
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

function opsCampPillClick(ev) {
  if (ev) ev.stopPropagation();
  if (typeof mbIsFirmAdmin !== 'function' || !mbIsFirmAdmin()) return;
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

function opsBoot() {
  if (_opsDirectiveTimer) clearInterval(_opsDirectiveTimer);
  _opsDirectiveTimer = setInterval(() => {
    if (!currentUser) return;
    opsLoadDirective();
    opsTickLive();
  }, 15000);
  if (currentUser) {
    opsLoadDirective();
    opsTickLive();
  }
}

document.addEventListener('click', (ev) => {
  const panel = document.getElementById('ops-camp-panel');
  if (!panel) return;
  if (panel.contains(ev.target)) return;
  if (ev.target.closest && ev.target.closest('#pill-camp-btn')) return;
  opsCloseCampPanel();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', opsBoot);
else opsBoot();
