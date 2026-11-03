// Hesaba yazılan görünüm tercihleri. SIP ve API anahtarları burada yok.
let _mbPrefsApplying = false;
let _mbPrefsTimer = null;

function mbUiPrefsUserId() {
  return (typeof currentUser !== 'undefined' && currentUser?.id) ? String(currentUser.id) : '';
}

function mbMascotPrefValueOk(base, val) {
  if (typeof val !== 'string' || !/^mb_mascot_[a-z0-9_]+$/.test(String(base || ''))) return false;
  const cap = base === 'mb_mascot_grad_book' ? 8000 : 120;
  return val.length <= cap;
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
    if (val == null) continue;
    if (suffix && key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      if (mbMascotPrefValueOk(base, val)) scoped[base] = val;
    } else if (mbMascotPrefValueOk(key, val)) {
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
  if (typeof MB_PALETTE_KEYS !== 'undefined' ? MB_PALETTE_KEYS.includes(palette) : ['blue', 'gold', 'green', 'rose', 'violet'].includes(palette)) {
    prefs.palette = palette;
    if (palette === 'custom') {
      const hex = localStorage.getItem('mb-palette-hex');
      if (hex) prefs.palette_hex = hex;
    }
  }
  if (live === 'rows' || live === 'grid') prefs.live_layout = live;
  if (camp === 'rows' || camp === 'cards') prefs.camp_view = camp;
  prefs.script_open = localStorage.getItem('mb-script-open') !== '0';
  prefs.rules_open = localStorage.getItem('mb-rules-open') !== '0';
  if (typeof mbFieldTemplates === 'function') prefs.field_templates = mbFieldTemplates();
  const grads = mbReadLiveGrads();
  if (Object.keys(grads).length) prefs.live_grads = grads;
  prefs.sb_scroll = mbReadSbScrollPrefs();
  const ex = typeof mbExportLayoutsForPrefs === 'function' ? mbExportLayoutsForPrefs() : null;
  if (ex) {
    prefs.export_layouts = ex.layouts;
    prefs.export_layout_active = ex.active;
  }
  if (Array.isArray(rows) && typeof MB_DASH_ROWS !== 'undefined') {
    prefs.dash_rows = rows.filter((key) => MB_DASH_ROWS.includes(key));
  } else if (typeof MB_DASH_ROWS !== 'undefined') {
    prefs.dash_rows = MB_DASH_ROWS.slice();
  }
  if (typeof mbReadBriefOrder === 'function') {
    const cards = mbReadBriefOrder();
    if (cards) prefs.dash_cards = { left: cards.left, right: cards.right, wide: cards.wide || [] };
  }
  if (typeof tourAccountPrefs === 'function') prefs.tour = tourAccountPrefs();
  if (typeof mbGetNavCustom === 'function') {
    const nav = mbGetNavCustom();
    if (nav) prefs.nav = nav;
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
    if (remote.palette === 'custom' && remote.palette_hex && typeof setPalette === 'function') {
      setPalette('custom', remote.palette_hex);
    } else if (remote.palette && typeof setPalette === 'function') {
      const ok = typeof MB_PALETTE_KEYS !== 'undefined'
        ? MB_PALETTE_KEYS.includes(remote.palette)
        : ['blue', 'gold', 'green', 'rose', 'violet'].includes(remote.palette);
      if (ok && remote.palette !== 'custom') setPalette(remote.palette);
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
    if (remote.dash_cards && typeof mbBriefOrderOk === 'function' && mbBriefOrderOk(remote.dash_cards) && typeof mbBriefCardKey === 'function') {
      try { localStorage.setItem(mbBriefCardKey(), JSON.stringify(remote.dash_cards)); } catch (e) {}
      if (typeof mbPackBrief === 'function') mbPackBrief(document.getElementById('dash-brief'));
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
    if (remote.sb_scroll && typeof remote.sb_scroll === 'object') {
      mbAdoptSbScrollPrefs(remote.sb_scroll);
    }
    if (typeof mbAdoptExportLayouts === 'function') {
      mbAdoptExportLayouts(remote.export_layouts, remote.export_layout_active);
    }
    if (remote.tour && typeof remote.tour === 'object' && typeof tourAdoptPrefs === 'function') tourAdoptPrefs(remote.tour);
    if (remote.nav && typeof mbSetNavCustom === 'function' && typeof mbNavOrderOk === 'function' && mbNavOrderOk(remote.nav)) {
      mbSetNavCustom(remote.nav);
      if (typeof mbApplyNavOrder === 'function') mbApplyNavOrder();
      if (typeof mbRestoreSbGroups === 'function' && !document.getElementById('sidebar')?.classList.contains('is-nav-edit')) mbRestoreSbGroups();
    }
    if (remote.mascot && typeof remote.mascot === 'object' && typeof setMascotPref === 'function') {
      Object.entries(remote.mascot).forEach(([base, val]) => {
        if (!mbMascotPrefValueOk(base, val)) return;
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

/* İnce = sağa yapışık ince çubuk (ok yok) — renk her zaman uygulanır. Klasik = eski kalın + oklar. */
const MB_SB_SCROLL_DEF = { a: '#c4c4d4', b: '#64748b', grad: false, style: 'ince' };

function mbSbScrollStyle() {
  const s = localStorage.getItem('mb-sb-scroll-style');
  if (s === 'eski') return 'eski';
  if (s === 'yeni') return 'ince'; /* eski kayıt uyumu */
  return 'ince';
}

function mbReadSbScrollPrefs() {
  try {
    return {
      on: true,
      style: mbSbScrollStyle(),
      a: mbNormHex(localStorage.getItem('mb-sb-scroll-a')) || MB_SB_SCROLL_DEF.a,
      b: mbNormHex(localStorage.getItem('mb-sb-scroll-b')) || MB_SB_SCROLL_DEF.b,
      grad: localStorage.getItem('mb-sb-scroll-grad') === '1',
    };
  } catch (_) {
    return {
      on: true,
      style: MB_SB_SCROLL_DEF.style,
      a: MB_SB_SCROLL_DEF.a,
      b: MB_SB_SCROLL_DEF.b,
      grad: false,
    };
  }
}

function mbAdoptSbScrollPrefs(raw) {
  if (!raw || typeof raw !== 'object') {
    mbResetSbScroll(true);
    return;
  }
  /* Eski "on:false = varsayılan" → ince + varsayılan renk (görünüm aynı, renk ayarlanabilir) */
  if (raw.on === false) {
    mbResetSbScroll(true);
    return;
  }
  const a = mbNormHex(raw.a) || MB_SB_SCROLL_DEF.a;
  const b = mbNormHex(raw.b) || MB_SB_SCROLL_DEF.b;
  const grad = !!raw.grad;
  let style = raw.style === 'eski' ? 'eski' : 'ince';
  if (raw.style === 'yeni') style = 'ince';
  try {
    localStorage.setItem('mb-sb-scroll-style', style);
    localStorage.setItem('mb-sb-scroll-a', a);
    localStorage.setItem('mb-sb-scroll-b', b);
    localStorage.setItem('mb-sb-scroll-grad', grad ? '1' : '0');
    localStorage.setItem('mb-sb-scroll-on', '1');
  } catch (_) {}
  mbApplySbScrollPrefs();
  mbPaintSbScrollForm();
}

function mbSbScrollArrowUrls(a) {
  const fill = encodeURIComponent(a);
  return {
    up: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='${fill}' d='M4 1L7 6H1z'/%3E%3C/svg%3E")`,
    down: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='${fill}' d='M1 2h6L4 7z'/%3E%3C/svg%3E")`,
  };
}

function mbApplySbScrollPrefs() {
  const prev = document.getElementById('sb-scroll-preview');
  const bWrap = document.getElementById('sb-scroll-b-wrap');
  const btnInce = document.getElementById('sb-scroll-style-yeni') || document.getElementById('sb-scroll-style-ince');
  const btnEski = document.getElementById('sb-scroll-style-eski');
  const st = mbSbScrollStyle();
  if (btnInce) {
    btnInce.classList.toggle('is-on', st === 'ince');
    btnInce.classList.remove('btn-primary');
    btnInce.setAttribute('aria-pressed', st === 'ince' ? 'true' : 'false');
  }
  if (btnEski) {
    btnEski.classList.toggle('is-on', st === 'eski');
    btnEski.classList.remove('btn-primary');
    btnEski.setAttribute('aria-pressed', st === 'eski' ? 'true' : 'false');
  }
  const a = mbNormHex(localStorage.getItem('mb-sb-scroll-a')) || MB_SB_SCROLL_DEF.a;
  const b = mbNormHex(localStorage.getItem('mb-sb-scroll-b')) || MB_SB_SCROLL_DEF.b;
  const grad = localStorage.getItem('mb-sb-scroll-grad') === '1';
  const thumb = grad ? `linear-gradient(180deg, ${a} 0%, ${b} 100%)` : a;
  const track = st === 'eski' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)';
  const root = document.documentElement;
  /* Eski enjekte stil kalıntısını kaldır — CSS styles.css'te */
  const styleEl = document.getElementById('mb-sb-scroll-css');
  if (styleEl) styleEl.remove();
  root.classList.toggle('mb-sb-scroll-classic', st === 'eski');
  root.classList.add('mb-sb-scroll-custom');
  root.classList.toggle('mb-sb-scroll-grad', grad);
  root.style.setProperty('--mb-sb-scroll-a', a);
  root.style.setProperty('--mb-sb-scroll-b', b);
  root.style.setProperty('--mb-sb-scroll-thumb', thumb);
  root.style.setProperty('--mb-sb-scroll-track', track);
  if (st === 'eski') {
    const arrows = mbSbScrollArrowUrls(a);
    root.style.setProperty('--mb-sb-scroll-arrow-up', arrows.up);
    root.style.setProperty('--mb-sb-scroll-arrow-down', arrows.down);
  } else {
    root.style.removeProperty('--mb-sb-scroll-arrow-up');
    root.style.removeProperty('--mb-sb-scroll-arrow-down');
  }
  if (prev) prev.style.background = thumb;
  if (bWrap) bWrap.style.opacity = grad ? '1' : '0.45';
  document.querySelectorAll('.sb-scroll-style-btn').forEach((btn) => {
    btn.style.setProperty('--sb-scroll-swatch', a);
  });
}

function mbPaintSbScrollForm() {
  const a = mbNormHex(localStorage.getItem('mb-sb-scroll-a')) || MB_SB_SCROLL_DEF.a;
  const b = mbNormHex(localStorage.getItem('mb-sb-scroll-b')) || MB_SB_SCROLL_DEF.b;
  const grad = localStorage.getItem('mb-sb-scroll-grad') === '1';
  const elA = document.getElementById('sb-scroll-a');
  const elB = document.getElementById('sb-scroll-b');
  const elG = document.getElementById('sb-scroll-grad');
  if (elA) elA.value = a;
  if (elB) elB.value = b;
  if (elG) elG.checked = grad;
  mbApplySbScrollPrefs();
}

function mbSetSbScrollStyle(style) {
  const st = style === 'eski' ? 'eski' : 'ince';
  try {
    localStorage.setItem('mb-sb-scroll-style', st);
    localStorage.setItem('mb-sb-scroll-on', '1');
    if (!mbNormHex(localStorage.getItem('mb-sb-scroll-a'))) localStorage.setItem('mb-sb-scroll-a', MB_SB_SCROLL_DEF.a);
    if (!mbNormHex(localStorage.getItem('mb-sb-scroll-b'))) localStorage.setItem('mb-sb-scroll-b', MB_SB_SCROLL_DEF.b);
  } catch (_) {}
  mbPaintSbScrollForm();
  if (!_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbSetSbScrollColor(which, value) {
  const hex = mbNormHex(value);
  if (!hex) return;
  const key = which === 'b' ? 'mb-sb-scroll-b' : 'mb-sb-scroll-a';
  try {
    /* Renk değişince ince stilde kal — eski ok'lu stile geçirme */
    if (!localStorage.getItem('mb-sb-scroll-style') || localStorage.getItem('mb-sb-scroll-style') === 'yeni') {
      localStorage.setItem('mb-sb-scroll-style', 'ince');
    }
    localStorage.setItem('mb-sb-scroll-on', '1');
    localStorage.setItem(key, hex);
  } catch (_) {}
  mbApplySbScrollPrefs();
  if (!_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbSetSbScrollGrad(on) {
  try {
    if (!localStorage.getItem('mb-sb-scroll-style') || localStorage.getItem('mb-sb-scroll-style') === 'yeni') {
      localStorage.setItem('mb-sb-scroll-style', 'ince');
    }
    localStorage.setItem('mb-sb-scroll-on', '1');
    localStorage.setItem('mb-sb-scroll-grad', on ? '1' : '0');
  } catch (_) {}
  mbPaintSbScrollForm();
  if (!_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbResetSbScroll(skipSave) {
  /* Varsayılan = ince görünüm + varsayılan renk (renk seçici çalışmaya devam eder) */
  try {
    localStorage.setItem('mb-sb-scroll-on', '1');
    localStorage.setItem('mb-sb-scroll-style', 'ince');
    localStorage.setItem('mb-sb-scroll-a', MB_SB_SCROLL_DEF.a);
    localStorage.setItem('mb-sb-scroll-b', MB_SB_SCROLL_DEF.b);
    localStorage.setItem('mb-sb-scroll-grad', '0');
  } catch (_) {}
  const elG = document.getElementById('sb-scroll-grad');
  if (elG) elG.checked = false;
  mbPaintSbScrollForm();
  if (!skipSave && !_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

try {
  window.mbSetSbScrollColor = mbSetSbScrollColor;
  window.mbSetSbScrollGrad = mbSetSbScrollGrad;
  window.mbSetSbScrollStyle = mbSetSbScrollStyle;
  window.mbResetSbScroll = mbResetSbScroll;
  window.mbPaintSbScrollForm = mbPaintSbScrollForm;
} catch (_) {}

mbPaintSbScrollForm();
