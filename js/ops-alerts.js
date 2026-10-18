// Üst çubuk kampanya bildirimi ve canlı görüşme / bekleme kartları.
// Personelin açık kampanyası tarayıcıda durur; uyarı o listeyi firmanın bildirimiyle karşılaştırır.

let _opsDirective = { ids: [], at: '', by: '' };
let _opsAlerts = { callMin: 4, goldAfter: 1, waitMin: 1, roles: ['agent', 'field_agent'], effect: 'aurora', appt: true, campaign: true };
let _opsNotifPrimed = false;
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
  return row?.name || key.slice(0, 8);
}

function opsSay(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function opsBeep(kind) {
  if (window.__opsMute) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const times = kind === 'wait' || kind === 'wv' ? 3 : 1;
    const hz = kind === 'gold' ? 880 : kind === 'wait' ? 660 : kind === 'wv' ? 740 : 520;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      osc.type = kind === 'wait' ? 'square' : 'sine';
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.2;
      osc.start(start);
      osc.stop(start + 0.12);
    }
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1400);
  } catch (e) {}
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
  };
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
    return;
  }
  const parts = [opsSay('ops.warn.wrong', 'Yanlış kampanyadasın.')];
  if (missing.length) parts.push(`${opsSay('ops.warn.pick', 'Seçmelisin:')} ${missing.map(opsCampName).join(', ')}.`);
  if (extra.length) parts.push(`${opsSay('ops.warn.close', 'Kapatmalısın:')} ${extra.map(opsCampName).join(', ')}.`);
  const text = document.createElement('span');
  text.className = 'ops-camp-warn-text';
  text.textContent = parts.join(' ');
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
  opsPickEffect(_opsAlerts.effect || 'aurora');
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
      opsBeep(kind === 'gold' ? 'gold' : kind);
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
