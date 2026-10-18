// Hesaba yazılan görünüm tercihleri. SIP ve API anahtarları burada yok.
let _mbPrefsApplying = false;
let _mbPrefsTimer = null;

function mbUiPrefsUserId() {
  return (typeof currentUser !== 'undefined' && currentUser?.id) ? String(currentUser.id) : '';
}

function mbCollectMascotPrefs() {
  const id = mbUiPrefsUserId();
  const suffix = id ? `_${id}` : '';
  const scoped = {};
  const legacy = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('mb_mascot_')) continue;
    const val = localStorage.getItem(key);
    if (val == null || val.length > 120) continue;
    if (suffix && key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      if (/^mb_mascot_[a-z0-9_]+$/.test(base)) scoped[base] = val;
    } else if (/^mb_mascot_[a-z0-9_]+$/.test(key)) {
      legacy[key] = val;
    }
  }
  return Object.assign(legacy, scoped);
}

function mbCollectUiPrefs() {
  const lang = localStorage.getItem('mb-lang');
  const theme = localStorage.getItem('mb-theme');
  const palette = localStorage.getItem('mb-palette');
  const live = localStorage.getItem('mb-live-layout');
  const camp = localStorage.getItem('mb-camp-view');
  let rows = null;
  try {
    const raw = typeof mbDashRowKey === 'function' ? localStorage.getItem(mbDashRowKey()) : null;
    rows = raw ? JSON.parse(raw) : null;
  } catch (e) {}
  const prefs = { mascot: mbCollectMascotPrefs() };
  if (lang === 'tr' || lang === 'de') prefs.lang = lang;
  if (theme === 'light' || theme === 'dark') prefs.theme = theme;
  if (['blue', 'gold', 'green', 'rose', 'violet'].includes(palette)) prefs.palette = palette;
  if (live === 'rows' || live === 'grid') prefs.live_layout = live;
  if (camp === 'rows' || camp === 'cards') prefs.camp_view = camp;
  prefs.script_open = localStorage.getItem('mb-script-open') !== '0';
  prefs.rules_open = localStorage.getItem('mb-rules-open') !== '0';
  if (typeof mbFieldTemplates === 'function') prefs.field_templates = mbFieldTemplates();
  const grads = mbReadLiveGrads();
  if (Object.keys(grads).length) prefs.live_grads = grads;
  if (Array.isArray(rows) && typeof MB_DASH_ROWS !== 'undefined') {
    prefs.dash_rows = rows.filter((key) => MB_DASH_ROWS.includes(key));
  } else if (typeof MB_DASH_ROWS !== 'undefined') {
    prefs.dash_rows = MB_DASH_ROWS.slice();
  }
  return prefs;
}

function mbQueueUiPrefSave() {
  if (_mbPrefsApplying || !mbUiPrefsUserId() || typeof sb !== 'function') return;
  clearTimeout(_mbPrefsTimer);
  _mbPrefsTimer = setTimeout(() => { mbFlushUiPrefs(); }, 400);
}

async function mbFlushUiPrefs() {
  const id = mbUiPrefsUserId();
  if (!id || typeof sb !== 'function' || _mbPrefsApplying) return;
  const prefs = mbCollectUiPrefs();
  try {
    await sb(`users?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ ui_prefs: prefs }),
    });
  } catch (e) {}
}

function mbApplyUiPrefs(remote) {
  if (!remote || typeof remote !== 'object') return;
  _mbPrefsApplying = true;
  try {
    if (remote.lang === 'tr' || remote.lang === 'de') {
      if (typeof setLang === 'function') setLang(remote.lang);
    }
    if (remote.theme === 'light' || remote.theme === 'dark') {
      if (typeof setTheme === 'function') setTheme(remote.theme);
    }
    if (['blue', 'gold', 'green', 'rose', 'violet'].includes(remote.palette)) {
      if (typeof setPalette === 'function') setPalette(remote.palette);
    }
    if (remote.live_layout === 'rows' || remote.live_layout === 'grid') {
      try { localStorage.setItem('mb-live-layout', remote.live_layout); } catch (e) {}
    }
    if (remote.camp_view === 'rows' || remote.camp_view === 'cards') {
      try { localStorage.setItem('mb-camp-view', remote.camp_view); } catch (e) {}
    }
    if (remote.script_open === true || remote.script_open === false) {
      try { localStorage.setItem('mb-script-open', remote.script_open ? '1' : '0'); } catch (e) {}
      if (typeof mbApplyScriptOpen === 'function') mbApplyScriptOpen(remote.script_open);
    }
    if (remote.rules_open === true || remote.rules_open === false) {
      try { localStorage.setItem('mb-rules-open', remote.rules_open ? '1' : '0'); } catch (e) {}
      if (typeof mbApplyRulesOpen === 'function') mbApplyRulesOpen(remote.rules_open);
    }
    if (typeof mbAdoptFieldTemplates === 'function') {
      mbAdoptFieldTemplates(remote.field_templates, !Object.prototype.hasOwnProperty.call(remote, 'field_templates'));
    }
    if (Array.isArray(remote.dash_rows) && typeof mbDashRowKey === 'function' && typeof MB_DASH_ROWS !== 'undefined') {
      const keys = remote.dash_rows.filter((key) => MB_DASH_ROWS.includes(key));
      try { localStorage.setItem(mbDashRowKey(), JSON.stringify(keys)); } catch (e) {}
      if (typeof mbApplyDashRowOrder === 'function') mbApplyDashRowOrder();
    }
    if (remote.live_grads && typeof remote.live_grads === 'object') {
      const grads = mbSanitizeLiveGrads(remote.live_grads);
      try {
        if (Object.keys(grads).length) localStorage.setItem('mb-live-grads', JSON.stringify(grads));
        else localStorage.removeItem('mb-live-grads');
      } catch (e) {}
      mbApplyLiveGrads(grads);
      mbPaintLiveGradForm();
    }
    if (remote.mascot && typeof remote.mascot === 'object' && typeof setMascotPref === 'function') {
      Object.entries(remote.mascot).forEach(([base, val]) => {
        if (!/^mb_mascot_[a-z0-9_]+$/.test(base)) return;
        if (typeof val !== 'string' || val.length > 120) return;
        setMascotPref(base, val);
      });
      if (typeof reloadMascotStateForUser === 'function') reloadMascotStateForUser();
      if (typeof loadMascotSettingsForm === 'function') loadMascotSettingsForm();
    }
  } finally {
    _mbPrefsApplying = false;
  }
}

async function mbLoadUiPrefs() {
  const id = mbUiPrefsUserId();
  if (!id || typeof sb !== 'function') return;
  let remote = null;
  try {
    const rows = await sb(`users?id=eq.${id}&select=ui_prefs&limit=1`);
    remote = rows?.[0]?.ui_prefs;
  } catch (e) {
    return;
  }
  if (!remote || typeof remote !== 'object' || !Object.keys(remote).length) {
    mbQueueUiPrefSave();
    return;
  }
  mbApplyUiPrefs(remote);
}

const MB_LIVE_GRAD_STATUS = ['on_call', 'ready', 'wrapping', 'break', 'offline'];
const MB_LIVE_GRAD_LIGHT = {
  on_call: ['#81c784', '#1b5e20'],
  ready: ['#ffb74d', '#e65100'],
  wrapping: ['#4dd0e1', '#006064'],
  break: ['#7e57c2', '#311b92'],
  offline: ['#bdbdbd', '#424242'],
};
const MB_LIVE_GRAD_DARK = {
  on_call: ['#2e7d32', '#0d3311'],
  ready: ['#e65100', '#7a2a00'],
  wrapping: ['#00838f', '#04363a'],
  break: ['#5e35b1', '#24124f'],
  offline: ['#546170', '#1c2430'],
};

function mbNormHex(value) {
  const s = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(s) ? s : '';
}

function mbSanitizeLiveGrads(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  MB_LIVE_GRAD_STATUS.forEach((st) => {
    const pair = raw[st];
    if (!Array.isArray(pair) || pair.length < 2) return;
    const a = mbNormHex(pair[0]);
    const b = mbNormHex(pair[1]);
    if (!a || !b) return;
    out[st] = [a, b];
  });
  return out;
}

function mbReadLiveGrads() {
  try {
    return mbSanitizeLiveGrads(JSON.parse(localStorage.getItem('mb-live-grads') || '{}'));
  } catch (e) {
    return {};
  }
}

function mbThemeGrad(st) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return (dark ? MB_LIVE_GRAD_DARK : MB_LIVE_GRAD_LIGHT)[st];
}

function mbEffectiveGrad(st) {
  return mbReadLiveGrads()[st] || mbThemeGrad(st);
}

function mbLiveDot(st) {
  return mbEffectiveGrad(st)[0];
}

function mbApplyLiveGrads(raw) {
  const grads = mbSanitizeLiveGrads(raw);
  const sel = (st) => [
    `html.mb-grad-custom .live-card--${st}`,
    `html.mb-grad-custom .live-line--${st}`,
    `html.mb-grad-custom .sup-card--${st}`,
    `html.mb-grad-custom[data-theme="dark"] .live-card--${st}`,
    `html.mb-grad-custom[data-theme="dark"] .live-line--${st}`,
    `html.mb-grad-custom[data-theme="dark"] .sup-card--${st}`,
  ].join(',');
  const css = MB_LIVE_GRAD_STATUS.filter((st) => grads[st]).map((st) => {
    const [a, b] = grads[st];
    return `${sel(st)}{--tone-a:${a};--tone-b:${b}}`;
  }).join('');
  document.documentElement.classList.toggle('mb-grad-custom', !!css);
  let el = document.getElementById('mb-live-grad');
  if (!css) {
    if (el) el.remove();
  } else {
    if (!el) {
      el = document.createElement('style');
      el.id = 'mb-live-grad';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }
  document.querySelectorAll('[data-live-status]').forEach((node) => {
    const color = mbLiveDot(node.dataset.liveStatus);
    if (color) node.style.setProperty('--dot', color);
  });
}

function mbPaintLiveGradPreview(row, pair) {
  const preview = row.querySelector('.live-grad-preview');
  if (!preview || !pair) return;
  preview.style.background = `linear-gradient(105deg, color-mix(in srgb, #fff 22%, transparent), transparent 58%), linear-gradient(90deg, ${pair[0]}, ${pair[1]})`;
}

function mbPaintLiveGradForm() {
  document.querySelectorAll('.live-grad-row').forEach((row) => {
    const st = row.dataset.status;
    if (!MB_LIVE_GRAD_STATUS.includes(st)) return;
    const pair = mbEffectiveGrad(st);
    row.querySelectorAll('input[type="color"]').forEach((input) => {
      input.value = pair[input.dataset.end === 'b' ? 1 : 0];
    });
    mbPaintLiveGradPreview(row, pair);
  });
}

function mbStoreLiveGrads(grads) {
  const clean = mbSanitizeLiveGrads(grads);
  MB_LIVE_GRAD_STATUS.forEach((st) => {
    const pair = clean[st];
    const theme = mbThemeGrad(st);
    if (pair && pair[0] === theme[0] && pair[1] === theme[1]) delete clean[st];
  });
  try {
    if (Object.keys(clean).length) localStorage.setItem('mb-live-grads', JSON.stringify(clean));
    else localStorage.removeItem('mb-live-grads');
  } catch (e) {}
  mbApplyLiveGrads(clean);
  if (!_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbSetLiveGrad(st, end, value) {
  if (!MB_LIVE_GRAD_STATUS.includes(st)) return;
  const hex = mbNormHex(value);
  if (!hex) return;
  const next = mbEffectiveGrad(st).slice();
  next[end === 'b' ? 1 : 0] = hex;
  const grads = mbReadLiveGrads();
  grads[st] = next;
  mbStoreLiveGrads(grads);
  const row = document.querySelector(`.live-grad-row[data-status="${st}"]`);
  if (row) mbPaintLiveGradPreview(row, mbEffectiveGrad(st));
}

function mbResetLiveGrads() {
  mbStoreLiveGrads({});
  mbPaintLiveGradForm();
}

mbApplyLiveGrads(mbReadLiveGrads());
mbPaintLiveGradForm();
