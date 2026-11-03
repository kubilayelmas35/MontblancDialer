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
  prefs.sb_aurora = mbReadSbAuroraPrefs();
  prefs.dial_aurora = mbReadDialAuroraPrefs();
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
    if (remote.sb_aurora && typeof remote.sb_aurora === 'object') {
      mbAdoptSbAuroraPrefs(remote.sb_aurora);
    }
    if (remote.dial_aurora && typeof remote.dial_aurora === 'object') {
      mbAdoptDialAuroraPrefs(remote.dial_aurora);
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

/* Modern = ok yok, sağ ray. Klasik = kalın + oklar.
   Varsayılan = 14.27: soft rgba beyaz (özel solid renk yok). a/b boş = CSS fallback. */
const MB_SB_SCROLL_DEF = {
  a: '',
  b: '',
  soft: 'rgba(255, 255, 255, 0.18)',
  softHover: 'rgba(255, 255, 255, 0.28)',
  grad: false,
  style: 'ince',
  track: false,
  flush: true,
  width: 5,
};
/* 14.28+ stok açık / silik denemeleri — bir kez 14.27 soft’a çek */
const MB_SB_SCROLL_STOCK = ['#c8c8d8', '#94a3b8', '#5c6578', '#3f4654', '#334155', '#64748b'];

function mbSbScrollStyle() {
  const s = localStorage.getItem('mb-sb-scroll-style');
  if (s === 'eski') return 'eski';
  if (s === 'yeni') return 'ince';
  return 'ince';
}

function mbSbScrollWidth() {
  const n = parseInt(localStorage.getItem('mb-sb-scroll-width') || '', 10);
  if (!Number.isFinite(n)) return MB_SB_SCROLL_DEF.width;
  return Math.max(3, Math.min(12, n));
}

function mbSbScrollColorA() {
  return mbNormHex(localStorage.getItem('mb-sb-scroll-a')) || '';
}
function mbSbScrollColorB() {
  return mbNormHex(localStorage.getItem('mb-sb-scroll-b')) || '';
}
function mbSbScrollThumbBg(a, b, grad) {
  if (grad && a && b) return `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
  if (a) return a;
  return MB_SB_SCROLL_DEF.soft;
}

function mbReadSbScrollPrefs() {
  try {
    return {
      on: true,
      style: mbSbScrollStyle(),
      a: mbSbScrollColorA(),
      b: mbSbScrollColorB(),
      grad: localStorage.getItem('mb-sb-scroll-grad') === '1',
      track: localStorage.getItem('mb-sb-scroll-track') === '1',
      flush: localStorage.getItem('mb-sb-scroll-flush') !== '0',
      width: mbSbScrollWidth(),
    };
  } catch (_) {
    return {
      on: true,
      style: MB_SB_SCROLL_DEF.style,
      a: '',
      b: '',
      grad: false,
      track: false,
      flush: true,
      width: MB_SB_SCROLL_DEF.width,
    };
  }
}

function mbAdoptSbScrollPrefs(raw) {
  if (!raw || typeof raw !== 'object') {
    mbResetSbScroll(true);
    return;
  }
  if (raw.on === false) {
    mbResetSbScroll(true);
    return;
  }
  const a = mbNormHex(raw.a) || '';
  const b = mbNormHex(raw.b) || '';
  const grad = !!raw.grad && !!a && !!b;
  let style = raw.style === 'eski' ? 'eski' : 'ince';
  if (raw.style === 'yeni') style = 'ince';
  const track = !!raw.track;
  const flush = raw.flush !== false;
  const width = Math.max(3, Math.min(12, parseInt(raw.width, 10) || MB_SB_SCROLL_DEF.width));
  try {
    localStorage.setItem('mb-sb-scroll-style', style);
    if (a) localStorage.setItem('mb-sb-scroll-a', a);
    else localStorage.removeItem('mb-sb-scroll-a');
    if (b) localStorage.setItem('mb-sb-scroll-b', b);
    else localStorage.removeItem('mb-sb-scroll-b');
    localStorage.setItem('mb-sb-scroll-grad', grad ? '1' : '0');
    localStorage.setItem('mb-sb-scroll-track', track ? '1' : '0');
    localStorage.setItem('mb-sb-scroll-flush', flush ? '1' : '0');
    localStorage.setItem('mb-sb-scroll-width', String(width));
    localStorage.setItem('mb-sb-scroll-on', '1');
  } catch (_) {}
  mbApplySbScrollPrefs();
  mbPaintSbScrollForm();
}

function mbSbScrollCssClassic(a, b, grad) {
  const thumb = grad ? `linear-gradient(180deg, ${a} 0%, ${b} 100%)` : a;
  const fill = encodeURIComponent(a);
  return `
#sidebar.mb-sb-scroll-classic #sidebar-scroll{scrollbar-width:auto;scrollbar-color:${a} rgba(255,255,255,0.08);}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar{width:12px;height:12px;display:block!important;}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.08);}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-thumb{background:${thumb};border-radius:6px;border:2px solid transparent;background-clip:padding-box;min-height:32px;}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-button,
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-button:single-button{display:block!important;width:12px!important;height:14px!important;background-color:rgba(255,255,255,0.1)!important;background-repeat:no-repeat!important;background-position:center!important;background-size:7px 7px!important;}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-button:single-button:vertical:decrement{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='${fill}' d='M4 1L7 6H1z'/%3E%3C/svg%3E");}
#sidebar.mb-sb-scroll-classic #sidebar-scroll::-webkit-scrollbar-button:single-button:vertical:increment{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='${fill}' d='M1 2h6L4 7z'/%3E%3C/svg%3E");}
`;
}

let _mbSbRailBound = false;
let _mbSbRailDrag = null;

function mbSyncSbScrollRail() {
  const sidebar = document.getElementById('sidebar');
  const sc = document.getElementById('sidebar-scroll');
  const rail = document.getElementById('sb-scroll-rail');
  const thumb = document.getElementById('sb-scroll-thumb');
  if (!sidebar || !sc || !rail || !thumb) return;
  if (sidebar.classList.contains('mb-sb-scroll-classic')) {
    rail.classList.remove('is-on');
    return;
  }
  const sh = sc.scrollHeight;
  const ch = sc.clientHeight;
  if (sh <= ch + 2) {
    rail.classList.remove('is-on');
    return;
  }
  const sbRect = sidebar.getBoundingClientRect();
  const scRect = sc.getBoundingClientRect();
  /* Üst: 1px — 0 yapışık, 4 fazla kaçmıştı */
  const edgeTop = 1;
  const edgeBottom = 1;
  const top = Math.max(0, Math.round(scRect.top - sbRect.top)) + edgeTop;
  const height = Math.max(0, Math.round(scRect.height) - edgeTop - edgeBottom);
  rail.style.top = `${top}px`;
  rail.style.height = `${height}px`;
  rail.style.right = '0px';
  rail.classList.add('is-on');
  const ratio = ch / sh;
  const thumbH = Math.max(28, Math.round(height * ratio));
  const maxTop = Math.max(0, height - thumbH);
  const maxScroll = Math.max(1, sh - ch);
  const thumbTop = Math.round((sc.scrollTop / maxScroll) * maxTop);
  thumb.style.height = `${thumbH}px`;
  thumb.style.top = `${thumbTop}px`;
  thumb.classList.toggle('is-mid', thumbTop > 0 && thumbTop < maxTop);
  thumb.classList.toggle('is-end', maxTop > 0 && thumbTop >= maxTop);
  if (thumbTop <= 0) thumb.classList.remove('is-mid', 'is-end');
}

function mbBindSbScrollRail() {
  if (_mbSbRailBound) return;
  const sc = document.getElementById('sidebar-scroll');
  const rail = document.getElementById('sb-scroll-rail');
  const thumb = document.getElementById('sb-scroll-thumb');
  if (!sc || !rail || !thumb) return;
  _mbSbRailBound = true;
  const sync = () => mbSyncSbScrollRail();
  sc.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  if (typeof ResizeObserver !== 'undefined') {
    try {
      const ro = new ResizeObserver(sync);
      ro.observe(sc);
      const sidebar = document.getElementById('sidebar');
      if (sidebar) ro.observe(sidebar);
    } catch (_) {}
  }
  if (typeof MutationObserver !== 'undefined') {
    try {
      new MutationObserver(sync).observe(sc, { childList: true, subtree: true, attributes: true });
    } catch (_) {}
  }
  // Menü geç yüklenince ray gelsin
  setTimeout(sync, 100);
  setTimeout(sync, 500);
  setTimeout(sync, 1500);
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const sh = sc.scrollHeight;
    const ch = sc.clientHeight;
    const maxScroll = Math.max(1, sh - ch);
    const railH = rail.clientHeight;
    const thumbH = thumb.offsetHeight;
    const maxTop = Math.max(1, railH - thumbH);
    _mbSbRailDrag = {
      startY: e.clientY,
      startTop: thumb.offsetTop,
      maxScroll,
      maxTop,
    };
    thumb.setPointerCapture(e.pointerId);
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!_mbSbRailDrag) return;
    const dy = e.clientY - _mbSbRailDrag.startY;
    const nextTop = Math.min(_mbSbRailDrag.maxTop, Math.max(0, _mbSbRailDrag.startTop + dy));
    sc.scrollTop = (nextTop / _mbSbRailDrag.maxTop) * _mbSbRailDrag.maxScroll;
  });
  const endDrag = () => { _mbSbRailDrag = null; };
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  rail.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const rect = rail.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const thumbH = thumb.offsetHeight;
    const maxTop = Math.max(1, rail.clientHeight - thumbH);
    const nextTop = Math.min(maxTop, Math.max(0, y - thumbH / 2));
    const maxScroll = Math.max(1, sc.scrollHeight - sc.clientHeight);
    sc.scrollTop = (nextTop / maxTop) * maxScroll;
  });
}

function mbApplySbScrollPrefs() {
  const prev = document.getElementById('sb-scroll-preview');
  const bWrap = document.getElementById('sb-scroll-b-wrap');
  const btnInce = document.getElementById('sb-scroll-style-yeni') || document.getElementById('sb-scroll-style-ince');
  const btnEski = document.getElementById('sb-scroll-style-eski');
  const sidebar = document.getElementById('sidebar');
  try {
    /* v14.49: menü komple 14.27 — native 5px, özel ray kapalı, stok renk yok */
    if (localStorage.getItem('mb-sb-scroll-mig-soft') !== '14.49') {
      localStorage.setItem('mb-sb-scroll-style', 'ince');
      localStorage.removeItem('mb-sb-scroll-a');
      localStorage.removeItem('mb-sb-scroll-b');
      localStorage.setItem('mb-sb-scroll-grad', '0');
      localStorage.setItem('mb-sb-scroll-track', '0');
      localStorage.setItem('mb-sb-scroll-flush', '1');
      localStorage.setItem('mb-sb-scroll-width', '5');
      localStorage.setItem('mb-sb-scroll-mig-soft', '14.49');
      localStorage.setItem('mb-sb-scroll-mig', '14.40');
    }
  } catch (_) {}
  const st = 'ince';
  if (btnInce) {
    btnInce.classList.toggle('is-on', true);
    btnInce.classList.remove('btn-primary');
    btnInce.setAttribute('aria-pressed', 'true');
  }
  if (btnEski) {
    btnEski.classList.toggle('is-on', false);
    btnEski.classList.remove('btn-primary');
    btnEski.setAttribute('aria-pressed', 'false');
  }
  const a = mbSbScrollColorA();
  const b = mbSbScrollColorB();
  const grad = localStorage.getItem('mb-sb-scroll-grad') === '1' && !!a && !!b;
  const thumbBg = mbSbScrollThumbBg(a, b, grad);
  const root = document.documentElement;
  root.classList.remove('mb-sb-scroll-custom');
  root.classList.toggle('mb-sb-scroll-grad', grad);
  if (a) root.style.setProperty('--mb-sb-scroll-a', a);
  else root.style.removeProperty('--mb-sb-scroll-a');
  if (b) root.style.setProperty('--mb-sb-scroll-b', b);
  else root.style.removeProperty('--mb-sb-scroll-b');
  if (sidebar) {
    sidebar.classList.remove('mb-sb-overlay-scroll', 'mb-sb-scroll-classic', 'mb-sb-scroll-track', 'mb-sb-scroll-flush');
  }
  const styleEl = document.getElementById('mb-sb-scroll-css');
  if (styleEl) styleEl.remove();
  const rail = document.getElementById('sb-scroll-rail');
  if (rail) rail.classList.remove('is-on');
  if (prev) prev.style.background = a ? thumbBg : 'var(--border-2)';
  if (bWrap) bWrap.style.opacity = grad ? '1' : '0.45';
  document.querySelectorAll('.sb-scroll-style-btn').forEach((btn) => {
    btn.style.setProperty('--sb-scroll-swatch', a || 'var(--border-2)');
  });
  void st;
}

function mbPaintSbScrollForm() {
  const a = mbSbScrollColorA();
  const b = mbSbScrollColorB();
  const grad = localStorage.getItem('mb-sb-scroll-grad') === '1' && !!a && !!b;
  const track = localStorage.getItem('mb-sb-scroll-track') === '1';
  const flush = localStorage.getItem('mb-sb-scroll-flush') !== '0';
  const width = mbSbScrollWidth();
  const elA = document.getElementById('sb-scroll-a');
  const elB = document.getElementById('sb-scroll-b');
  const elG = document.getElementById('sb-scroll-grad');
  const elT = document.getElementById('sb-scroll-track');
  const elF = document.getElementById('sb-scroll-flush');
  const elW = document.getElementById('sb-scroll-width');
  const elWl = document.getElementById('sb-scroll-width-lbl');
  /* Color input 6 haneli ister — soft varsayılan için yaklaşık örnek */
  if (elA) elA.value = a || '#9aa3b2';
  if (elB) elB.value = b || '#6b7280';
  if (elG) elG.checked = grad;
  if (elT) elT.checked = track;
  if (elF) elF.checked = flush;
  if (elW) elW.value = String(width);
  if (elWl) elWl.textContent = `${width}px`;
  mbApplySbScrollPrefs();
}

function mbSetSbScrollStyle(style) {
  const st = style === 'eski' ? 'eski' : 'ince';
  try {
    localStorage.setItem('mb-sb-scroll-style', st);
    localStorage.setItem('mb-sb-scroll-on', '1');
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

function mbSetSbScrollOpt(which, value) {
  try {
    if (!localStorage.getItem('mb-sb-scroll-style') || localStorage.getItem('mb-sb-scroll-style') === 'yeni') {
      localStorage.setItem('mb-sb-scroll-style', 'ince');
    }
    localStorage.setItem('mb-sb-scroll-on', '1');
    if (which === 'track') localStorage.setItem('mb-sb-scroll-track', value ? '1' : '0');
    else if (which === 'flush') localStorage.setItem('mb-sb-scroll-flush', value ? '1' : '0');
    else if (which === 'width') {
      const w = Math.max(3, Math.min(12, parseInt(value, 10) || MB_SB_SCROLL_DEF.width));
      localStorage.setItem('mb-sb-scroll-width', String(w));
      const elWl = document.getElementById('sb-scroll-width-lbl');
      if (elWl) elWl.textContent = `${w}px`;
    }
  } catch (_) {}
  mbApplySbScrollPrefs();
  if (!_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbResetSbScroll(skipSave) {
  try {
    localStorage.setItem('mb-sb-scroll-on', '1');
    localStorage.setItem('mb-sb-scroll-style', 'ince');
    localStorage.removeItem('mb-sb-scroll-a');
    localStorage.removeItem('mb-sb-scroll-b');
    localStorage.setItem('mb-sb-scroll-grad', '0');
    localStorage.setItem('mb-sb-scroll-track', '0');
    localStorage.setItem('mb-sb-scroll-flush', '1');
    localStorage.setItem('mb-sb-scroll-width', String(MB_SB_SCROLL_DEF.width));
  } catch (_) {}
  mbPaintSbScrollForm();
  if (!skipSave && !_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

try {
  window.mbSetSbScrollColor = mbSetSbScrollColor;
  window.mbSetSbScrollGrad = mbSetSbScrollGrad;
  window.mbSetSbScrollStyle = mbSetSbScrollStyle;
  window.mbSetSbScrollOpt = mbSetSbScrollOpt;
  window.mbResetSbScroll = mbResetSbScroll;
  window.mbPaintSbScrollForm = mbPaintSbScrollForm;
} catch (_) {}

mbPaintSbScrollForm();

/* ── Menü aurora / gradient ── */
const MB_SB_AURORA_DEF = {
  on: true,
  fx: 'flow',
  base: '#0f172a',
  c1: '#052a3a',
  c2: '#584466',
  c3: '#0e2452',
  c4: '#083a34',
  c5: '#48261c',
  c6: '#62303e',
};
const MB_SB_AURORA_KEYS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const MB_SB_AURORA_FX = ['flow', 'slow', 'fast', 'still'];

function mbReadSbAuroraPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem('mb-sb-aurora') || 'null');
    return mbSanitizeSbAurora(raw);
  } catch (_) {
    return Object.assign({}, MB_SB_AURORA_DEF);
  }
}

function mbSanitizeSbAurora(raw) {
  const out = Object.assign({}, MB_SB_AURORA_DEF);
  if (!raw || typeof raw !== 'object') return out;
  out.on = raw.on !== false;
  out.fx = MB_SB_AURORA_FX.includes(raw.fx) ? raw.fx : 'flow';
  out.base = mbNormHex(raw.base) || MB_SB_AURORA_DEF.base;
  MB_SB_AURORA_KEYS.forEach((k) => {
    out[k] = mbNormHex(raw[k]) || MB_SB_AURORA_DEF[k];
  });
  return out;
}

function mbStoreSbAuroraPrefs(prefs, skipSave) {
  const clean = mbSanitizeSbAurora(prefs);
  try {
    localStorage.setItem('mb-sb-aurora', JSON.stringify(clean));
  } catch (_) {}
  mbApplySbAuroraPrefs(clean);
  mbPaintSbAuroraForm(clean);
  if (!skipSave && !_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbAdoptSbAuroraPrefs(raw) {
  mbStoreSbAuroraPrefs(raw, true);
}

function mbApplySbAuroraPrefs(prefs) {
  const p = prefs || mbReadSbAuroraPrefs();
  const root = document.documentElement;
  const sidebar = document.getElementById('sidebar');
  root.style.setProperty('--sidebar-aurora-base', p.base);
  root.style.setProperty('--sb-aur-1', p.c1);
  root.style.setProperty('--sb-aur-2', p.c2);
  root.style.setProperty('--sb-aur-3', p.c3);
  root.style.setProperty('--sb-aur-4', p.c4);
  root.style.setProperty('--sb-aur-5', p.c5);
  root.style.setProperty('--sb-aur-6', p.c6);
  if (sidebar) {
    sidebar.classList.toggle('is-sb-aur-off', !p.on);
    MB_SB_AURORA_FX.forEach((fx) => {
      if (fx === 'flow') return;
      sidebar.classList.toggle('is-sb-aur-' + fx, p.on && p.fx === fx);
    });
  }
  const prev = document.getElementById('sb-aurora-preview');
  if (prev) {
    prev.style.background = `linear-gradient(120deg, ${p.base} 0%, ${p.c1} 22%, ${p.c2} 44%, ${p.c3} 66%, ${p.c4} 100%)`;
  }
}

function mbPaintSbAuroraForm(prefs) {
  const p = prefs || mbReadSbAuroraPrefs();
  const on = document.getElementById('sb-aurora-on');
  const fx = document.getElementById('sb-aurora-fx');
  const base = document.getElementById('sb-aurora-base');
  if (on) on.checked = !!p.on;
  if (fx) fx.value = p.fx;
  if (base) base.value = p.base;
  MB_SB_AURORA_KEYS.forEach((k) => {
    const el = document.getElementById('sb-aurora-' + k);
    if (el) el.value = p[k];
  });
  mbApplySbAuroraPrefs(p);
}

function mbSetSbAuroraField(field, value) {
  const next = mbReadSbAuroraPrefs();
  if (field === 'on') next.on = !!value;
  else if (field === 'fx') next.fx = MB_SB_AURORA_FX.includes(value) ? value : 'flow';
  else if (field === 'base') {
    const hex = mbNormHex(value);
    if (!hex) return;
    next.base = hex;
  } else if (MB_SB_AURORA_KEYS.includes(field)) {
    const hex = mbNormHex(value);
    if (!hex) return;
    next[field] = hex;
  } else return;
  mbStoreSbAuroraPrefs(next);
}

function mbResetSbAurora(skipSave) {
  mbStoreSbAuroraPrefs(MB_SB_AURORA_DEF, skipSave);
}

/* ── Dialer aurora / gradient ── */
const MB_DIAL_AURORA_DEF = {
  on: true,
  fx: 'flow',
  s1: '#fce7f3',
  s2: '#bae6fd',
  s3: '#ddd6fe',
  a1: '#f472b6',
  a2: '#a78bfa',
  a3: '#38bdf8',
  a4: '#4ade80',
  a5: '#fbbf24',
  a6: '#818cf8',
  a7: '#2dd4bf',
  a8: '#ec4899',
  a9: '#22d3ee',
};
const MB_DIAL_STAGE_KEYS = ['s1', 's2', 's3'];
const MB_DIAL_AUR_KEYS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'];
const MB_DIAL_AURORA_FX = ['flow', 'slow', 'fast', 'still'];

function mbReadDialAuroraPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem('mb-dial-aurora') || 'null');
    return mbSanitizeDialAurora(raw);
  } catch (_) {
    return Object.assign({}, MB_DIAL_AURORA_DEF);
  }
}

function mbSanitizeDialAurora(raw) {
  const out = Object.assign({}, MB_DIAL_AURORA_DEF);
  if (!raw || typeof raw !== 'object') return out;
  out.on = raw.on !== false;
  out.fx = MB_DIAL_AURORA_FX.includes(raw.fx) ? raw.fx : 'flow';
  MB_DIAL_STAGE_KEYS.forEach((k) => {
    out[k] = mbNormHex(raw[k]) || MB_DIAL_AURORA_DEF[k];
  });
  MB_DIAL_AUR_KEYS.forEach((k) => {
    out[k] = mbNormHex(raw[k]) || MB_DIAL_AURORA_DEF[k];
  });
  return out;
}

function mbStoreDialAuroraPrefs(prefs, skipSave) {
  const clean = mbSanitizeDialAurora(prefs);
  try {
    localStorage.setItem('mb-dial-aurora', JSON.stringify(clean));
  } catch (_) {}
  mbApplyDialAuroraPrefs(clean);
  mbPaintDialAuroraForm(clean);
  if (!skipSave && !_mbPrefsApplying && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbAdoptDialAuroraPrefs(raw) {
  mbStoreDialAuroraPrefs(raw, true);
}

function mbApplyDialAuroraPrefs(prefs) {
  const p = prefs || mbReadDialAuroraPrefs();
  const root = document.documentElement;
  root.style.setProperty('--dial-stage-1', p.s1);
  root.style.setProperty('--dial-stage-2', p.s2);
  root.style.setProperty('--dial-stage-3', p.s3);
  root.style.setProperty('--dial-aur-1', p.a1);
  root.style.setProperty('--dial-aur-2', p.a2);
  root.style.setProperty('--dial-aur-3', p.a3);
  root.style.setProperty('--dial-aur-4', p.a4);
  root.style.setProperty('--dial-aur-5', p.a5);
  root.style.setProperty('--dial-aur-6', p.a6);
  root.style.setProperty('--dial-aur-7', p.a7);
  root.style.setProperty('--dial-aur-8', p.a8);
  root.style.setProperty('--dial-aur-9', p.a9);
  const html = document.documentElement;
  html.classList.toggle('is-dial-aur-off', !p.on);
  MB_DIAL_AURORA_FX.forEach((fx) => {
    if (fx === 'flow') return;
    html.classList.toggle('is-dial-aur-' + fx, p.on && p.fx === fx);
  });
  const prev = document.getElementById('dial-aurora-preview');
  if (prev) {
    prev.style.background = `linear-gradient(120deg, ${p.s1}, ${p.a1}, ${p.a2}, ${p.a3}, ${p.s3})`;
  }
}

function mbPaintDialAuroraForm(prefs) {
  const p = prefs || mbReadDialAuroraPrefs();
  const on = document.getElementById('dial-aurora-on');
  const fx = document.getElementById('dial-aurora-fx');
  if (on) on.checked = !!p.on;
  if (fx) fx.value = p.fx;
  MB_DIAL_STAGE_KEYS.forEach((k) => {
    const el = document.getElementById('dial-aurora-' + k);
    if (el) el.value = p[k];
  });
  MB_DIAL_AUR_KEYS.forEach((k) => {
    const el = document.getElementById('dial-aurora-' + k);
    if (el) el.value = p[k];
  });
  mbApplyDialAuroraPrefs(p);
}

function mbSetDialAuroraField(field, value) {
  const next = mbReadDialAuroraPrefs();
  if (field === 'on') next.on = !!value;
  else if (field === 'fx') next.fx = MB_DIAL_AURORA_FX.includes(value) ? value : 'flow';
  else if (MB_DIAL_STAGE_KEYS.includes(field) || MB_DIAL_AUR_KEYS.includes(field)) {
    const hex = mbNormHex(value);
    if (!hex) return;
    next[field] = hex;
  } else return;
  mbStoreDialAuroraPrefs(next);
}

function mbResetDialAurora(skipSave) {
  mbStoreDialAuroraPrefs(MB_DIAL_AURORA_DEF, skipSave);
}

try {
  window.mbSetSbAuroraField = mbSetSbAuroraField;
  window.mbResetSbAurora = mbResetSbAurora;
  window.mbPaintSbAuroraForm = mbPaintSbAuroraForm;
  window.mbSetDialAuroraField = mbSetDialAuroraField;
  window.mbResetDialAurora = mbResetDialAurora;
  window.mbPaintDialAuroraForm = mbPaintDialAuroraForm;
  window.mbApplyDialAuroraPrefs = mbApplyDialAuroraPrefs;
} catch (_) {}

mbPaintSbAuroraForm();
mbPaintDialAuroraForm();
