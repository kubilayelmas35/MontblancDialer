// Maskot — dialer.js ile aynı global kapsam
// ── Maskot tema (isim, ana renk, gradient) — localStorage ─────────
const MASCOT_VARIANT_OFFSETS = {
  aurora: [0, 24, 50, 78],
  sunset: [0, 14, -22, -38],
  ocean: [-10, 8, 28, 48],
  forest: [28, 72, 98, 118],
  candy: [0, 38, 58, 82],
  midnight: [-18, -6, 14, 46],
  ember: [6, -14, -32, 52],
};
let _mascotVariantRandResolved = '';

function resolveMascotVariantKeyFromPref() {
  const raw = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) {
    const keys = Object.keys(MASCOT_VARIANT_OFFSETS);
    _mascotVariantRandResolved = keys[Math.floor(Math.random() * keys.length)];
  }
  return _mascotVariantRandResolved;
}

function resolveMascotVariantKeyFromFormValue(val) {
  const raw = String(val || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) {
    const keys = Object.keys(MASCOT_VARIANT_OFFSETS);
    _mascotVariantRandResolved = keys[Math.floor(Math.random() * keys.length)];
  }
  return _mascotVariantRandResolved;
}

const MASCOT_SHAPES = new Set([
  'blob',
  'circle',
  'squircle',
  'square',
  'pill',
  'hex',
  'diamond',
  'star',
  'heart',
  'droplet',
  'ring',
  /* dinamik / canlı */
  'pulse',
  'wave',
  'ripple',
  'morph',
  /* ek statik */
  'cloud',
  'egg',
  'pebble',
  'clover',
  'leaf',
  'moon',
  'sun',
  'bolt',
  'gem',
  'shield',
  'flower',
  'ticket',
  'bow',
]);

function mascotShapeFromString(val) {
  const s = String(val || 'blob').toLowerCase();
  return MASCOT_SHAPES.has(s) ? s : 'blob';
}

function _mascotHexToRgb(hex) {
  const s = String(hex || '')
    .replace('#', '')
    .trim();
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (s.length !== 6) return { r: 168, g: 85, b: 247 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function _mascotRgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function _mascotHexToHue(hex) {
  const { r, g, b } = _mascotHexToRgb(hex);
  return Math.round(_mascotRgbToHsl(r, g, b).h);
}

function _mascotWrapHue(x) {
  let n = Math.round(x) % 360;
  if (n < 0) n += 360;
  return n;
}

/** Ayar formu / rastgele görünüş için HSL → #rrggbb */
function _mascotHslToHex(h, s, l) {
  let hh = ((Number(h) % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, Number(s))) / 100;
  const ll = Math.max(0, Math.min(100, Number(l))) / 100;
  hh /= 360;
  let r;
  let g;
  let b;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function _mascotPickRandomSelectValue(selectId) {
  const el = document.getElementById(selectId);
  if (!el?.options?.length) return '';
  const vals = Array.from(el.options)
    .map((o) => String(o.value || ''))
    .filter((v) => v && v !== 'random');
  if (!vals.length) return '';
  return vals[Math.floor(Math.random() * vals.length)];
}

/** Ayarlardaki tüm renk + kozmetik seçeneklerini rastgele doldurur (gezinme ayarlarına dokunmaz). */
function randomizeMascotAppearance() {
  const mainHue = Math.floor(Math.random() * 360);
  const hex = _mascotHslToHex(mainHue, 58 + Math.floor(Math.random() * 32), 44 + Math.floor(Math.random() * 20));
  const breakHue = _mascotWrapHue(mainHue + 35 + Math.floor(Math.random() * 90));
  const breakHex = _mascotHslToHex(breakHue, 52 + Math.floor(Math.random() * 36), 48 + Math.floor(Math.random() * 16));
  const angryHue = _mascotWrapHue(mainHue - 40 + Math.floor(Math.random() * 80));
  const angryHex = _mascotHslToHex(angryHue, 62 + Math.floor(Math.random() * 30), 44 + Math.floor(Math.random() * 18));

  _mascotVariantRandResolved = '';
  const variant =
    Math.random() < 0.34 ? 'random' : _mascotPickRandomSelectValue('s-mascot-variant') || 'aurora';
  const shapeRaw = _mascotPickRandomSelectValue('s-mascot-shape') || 'blob';
  const shape = mascotShapeFromString(shapeRaw);

  setMascotPref('mb_mascot_color', hex);
  setMascotPref('mb_mascot_break_color', breakHex);
  setMascotPref('mb_mascot_angry_color', angryHex);
  setMascotPref('mb_mascot_variant', variant);
  setMascotPref('mb_mascot_shape', shape);
  setMascotPref('mb_mascot_cos_eye', _mascotPickRandomSelectValue('s-mascot-cos-eye') || 'none');
  setMascotPref('mb_mascot_cos_brow', _mascotPickRandomSelectValue('s-mascot-cos-brow') || 'none');
  setMascotPref('mb_mascot_cos_stache', _mascotPickRandomSelectValue('s-mascot-cos-stache') || 'none');
  setMascotPref('mb_mascot_cos_mouth', _mascotPickRandomSelectValue('s-mascot-cos-mouth') || 'none');
  setMascotPref('mb_mascot_cos_nose', _mascotPickRandomSelectValue('s-mascot-cos-nose') || 'none');
  setMascotPref('mb_mascot_cos_hat', _mascotPickRandomSelectValue('s-mascot-cos-hat') || 'none');
  setMascotPref('mb_mascot_cos_outfit', _mascotPickRandomSelectValue('s-mascot-cos-outfit') || 'none');
  setMascotPref('mb_mascot_cos_earring', _mascotPickRandomSelectValue('s-mascot-cos-earring') || 'none');
  setMascotPref('mb_mascot_cos_makeup', _mascotPickRandomSelectValue('s-mascot-cos-makeup') || 'none');
  setMascotPref('mb_mascot_cos_hair', _mascotPickRandomSelectValue('s-mascot-cos-hair') || 'none');
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const hx = _mascotHslToHex(
      Math.floor(Math.random() * 360),
      38 + Math.floor(Math.random() * 48),
      32 + Math.floor(Math.random() * 38),
    );
    setMascotPref(`mb_mascot_cos_${part}_color`, hx);
  }

  try {
    loadMascotSettingsForm();
  } catch (e) {}
  applyMascotTheme();
  if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
}

function _mascotUserScope() {
  return String(currentUser?.id || 'anon');
}

function _mascotLsKey(base) {
  return `${base}_${_mascotUserScope()}`;
}

function getMascotPref(base, fallback = '') {
  const key = _mascotLsKey(base);
  const scoped = localStorage.getItem(key);
  if (scoped !== null && scoped !== undefined && scoped !== '') return scoped;
  const legacy = localStorage.getItem(base);
  if (legacy !== null && legacy !== undefined && legacy !== '') {
    localStorage.setItem(key, legacy);
    return legacy;
  }
  return fallback;
}

function setMascotPref(base, value) {
  localStorage.setItem(_mascotLsKey(base), String(value ?? ''));
}

function getMascotAgeCoeff() {
  const fromFirm = Number(window._firmDialerSettings?.mascot_age_coeff || 10);
  if (Number.isFinite(fromFirm) && fromFirm > 0) return fromFirm;
  return 10;
}

function getMascotWanderPct() {
  const n = Number(getMascotPref('mb_mascot_wander_pct', '35'));
  if (!Number.isFinite(n)) return 35;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Varsayılan kapalı. Açıkken mesafe ve hız kaydırıcıları geçerli olur. */
function isMascotWanderEnabled() {
  return getMascotPref('mb_mascot_wander_on', '0') === '1';
}

function _syncMascotWanderControls() {
  const on = document.getElementById('s-mascot-wander-on');
  const box = document.getElementById('s-mascot-wander-sliders');
  if (!box) return;
  const enabled = !!(on && on.checked);
  box.style.opacity = enabled ? '' : '0.45';
  box.querySelectorAll('input').forEach((el) => {
    el.disabled = !enabled;
  });
}

/** Ayarlardan maskot boyutu: 50–150 → 0.5–1.5 (performans büyümesi ile çarpılır) */
function getMascotUserScalePct() {
  const n = Number(getMascotPref('mb_mascot_user_scale', '100'));
  if (!Number.isFinite(n)) return 100;
  return Math.max(50, Math.min(150, Math.round(n)));
}

function getMascotUserScaleMul() {
  return getMascotUserScalePct() / 100;
}

const MASCOT_COS_KEYS = ['eye', 'brow', 'stache', 'mouth', 'nose', 'hat', 'outfit', 'earring', 'makeup', 'hair'];

const MASCOT_COS_COLOR_PARTS = ['eye', 'brow', 'stache', 'mouth', 'nose', 'hat', 'outfit', 'earring', 'makeup', 'hair'];

const MASCOT_CCOL_PLACEHOLDER = '#64748b';

/** Eski kayıtlı değerler → yeni bıyık / ağız anahtarları */
const MASCOT_COS_LEGACY = {
  stache: {
    shadow: 'silk',
    pencil: 'gentle',
    chevron: 'twirl',
    horseshoe: 'crescent',
    handlebar: 'dapper',
    walrus: 'velvet',
    toothbrush: 'painter',
    zapata: 'film',
  },
  mouth: {
    smile: 'beam',
    grin: 'laugh',
    smirk: 'playful',
    flat: 'cool',
    ooh: 'tiny',
    tongue: 'playful',
    line: 'cool',
    kiss: 'smitten',
  },
};

/** Rastgele seçenek: sayfa yükünde bir kez çözülür (yenilemede yeniden). */
const MASCOT_COS_RANDOM_POOLS = {
  eye: ['none', 'sparkle', 'anime', 'sleepy', 'wink', 'shy', 'big', 'star', 'glow', 'retro'],
  brow: ['none', 'thin', 'soft', 'arch', 'thick', 'wispy', 'bold', 'angry', 'straight', 'curved'],
  stache: ['none', 'silk', 'gentle', 'twirl', 'dapper', 'velvet', 'painter', 'crescent', 'film', 'sombrero'],
  mouth: ['none', 'beam', 'soft', 'laugh', 'smitten', 'playful', 'tiny', 'pout', 'cool', 'dreamy'],
  nose: ['none', 'dot', 'oval', 'button', 'tiny', 'upturned', 'pierced'],
  hat: ['none', 'cap', 'beanie', 'tophat', 'crown', 'headband', 'cat', 'party', 'wizard'],
  outfit: ['none', 'bowtie', 'necktie', 'scarf', 'badge', 'collar', 'pearls', 'ribbon', 'vest'],
  earring: ['none', 'stud', 'hoop', 'pearl', 'drop', 'crystal', 'heart'],
  makeup: ['none', 'blush', 'glow', 'freckles', 'liner', 'sparkle', 'cute'],
  hair: ['none', 'bob', 'short', 'long', 'braid', 'bun', 'pony', 'pixie', 'waves', 'slick', 'mohawk', 'afro', 'spikes', 'curly', 'side'],
};

let _mascotCosRandCache = {};

function getMascotCosmeticPref(part) {
  let v = String(getMascotPref(`mb_mascot_cos_${part}`, '') || 'none')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  v = v || 'none';
  const leg = MASCOT_COS_LEGACY[part]?.[v];
  return leg || v;
}

function _rollMascotCosmeticFromPool(part) {
  const pool = MASCOT_COS_RANDOM_POOLS[part];
  if (!pool || !pool.length) return 'none';
  return pool[Math.floor(Math.random() * pool.length)];
}

/** DOM / tema için: random → havuzdan rastgele (oturum içi önbellek). */
function getMascotCosmeticApplied(part) {
  const raw = getMascotCosmeticPref(part);
  if (raw !== 'random') return raw;
  if (!_mascotCosRandCache[part]) {
    _mascotCosRandCache[part] = _rollMascotCosmeticFromPool(part);
  }
  return _mascotCosRandCache[part];
}

function applyMascotCosmetics() {
  const attrs = {};
  for (const k of MASCOT_COS_KEYS) {
    attrs[`data-mascot-${k}`] = getMascotCosmeticApplied(k);
  }
  document.querySelectorAll('.mascot-theme-root').forEach((root) => {
    for (const [attr, val] of Object.entries(attrs)) {
      root.setAttribute(attr, val);
    }
  });
}

function getMascotCosmeticColorPref(part) {
  const v = String(getMascotPref(`mb_mascot_cos_${part}_color`, '') || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
}

function applyMascotCosmeticColors() {
  document.querySelectorAll('.mascot-theme-root').forEach((root) => {
    for (const p of MASCOT_COS_COLOR_PARTS) {
      const hex = getMascotCosmeticColorPref(p);
      if (hex) root.style.setProperty(`--cos-${p}-color`, hex);
      else root.style.removeProperty(`--cos-${p}-color`);
    }
  });
}

function _syncMascotCosColorInputsFromPrefs() {
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const el = document.getElementById(`s-mascot-ccol-${part}`);
    if (!el) continue;
    const raw = getMascotCosmeticColorPref(part);
    el.value = raw || MASCOT_CCOL_PLACEHOLDER;
    el.dataset.cosInherit = raw ? '' : '1';
  }
}

/** 0 = neredeyse duruyor, 100 = hızlı */
function getMascotWanderSpeedPct() {
  const n = Number(getMascotPref('mb_mascot_wander_speed', '22'));
  if (!Number.isFinite(n)) return 22;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getMascotShape() {
  return mascotShapeFromString(getMascotPref('mb_mascot_shape', 'blob'));
}

function applyMascotShape() {
  const s = getMascotShape();
  document.querySelectorAll('.mascot-theme-root').forEach((el) => {
    el.setAttribute('data-mascot-shape', s);
  });
}

function _mascotAnchorCenterPx(gm) {
  const x = parseFloat(String(gm.style.left || '0').replace('px', '')) || 0;
  const y = parseFloat(String(gm.style.top || '0').replace('px', '')) || 0;
  return { x, y };
}

/** Bırakılan noktadan viewport kenarına kadar (kenar payı ile) tam ofset aralığı. */
function _mascotWanderBoundsFromViewport(gm) {
  const t = 1;
  const edge = 12;
  const animPad = 18;
  const bubbleBelow = 58;
  let halfW = 40;
  let halfH = 44;
  try {
    const blob = gm.querySelector('.cust-empty-blob');
    const el = blob || gm.querySelector('.cust-empty-mascot');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 8) halfW = (r.width / 2) * 1.12 + animPad * 0.35;
      if (r.height > 8) halfH = (r.height / 2) * 1.12 + animPad * 0.35 + bubbleBelow * 0.45;
    }
  } catch (e) {}
  halfW += animPad;
  halfH += animPad + bubbleBelow * 0.55;
  const { x: Px, y: Py } = _mascotAnchorCenterPx(gm);
  const vw = Number(window.innerWidth) || 800;
  const vh = Number(window.innerHeight) || 600;
  /* Tüm sekmelerde aynı: gezinme alanı viewport (dialer paneline sıkıştırma yok). */
  const dl = 0;
  const dt = 0;
  const dr = vw;
  const db = vh;
  const minCx = dl + edge + halfW;
  const maxCx = dr - edge - halfW;
  const minCy = dt + edge + halfH;
  const maxCy = db - edge - halfH;
  if (!Number.isFinite(Px) || !Number.isFinite(Py) || maxCx <= minCx + 4 || maxCy <= minCy + 4) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const fullMinX = minCx - Px;
  const fullMaxX = maxCx - Px;
  const fullMinY = minCy - Py;
  const fullMaxY = maxCy - Py;
  return {
    minX: t * fullMinX,
    maxX: t * fullMaxX,
    minY: t * fullMinY,
    maxY: t * fullMaxY,
  };
}

function isMimiHidden() {
  return getMascotPref('mb_mascot_hidden', '0') === '1';
}

function isMimiBubbleMuted() {
  return getMascotPref('mb_mascot_bubble_mute', '0') === '1';
}

function toggleMimiBubbleMute() {
  const next = isMimiBubbleMuted() ? '0' : '1';
  setMascotPref('mb_mascot_bubble_mute', next);
  if (next === '1') {
    stopCustEmptyCoach();
    const bubble = document.getElementById('cust-empty-bubble');
    if (bubble) {
      bubble.style.display = 'none';
      bubble.classList.remove('cust-empty-bubble--pop');
    }
  } else if (!isMimiHidden()) {
    startCustEmptyCoach();
  }
  refreshGlobalMascotInfoPanel();
}

function _applyMascotVarsToEl(el, baseHue, variantKey, opts = {}) {
  if (!el || !el.style) return;
  const offs = MASCOT_VARIANT_OFFSETS[variantKey] || MASCOT_VARIANT_OFFSETS.aurora;
  const d = offs.map((o) => _mascotWrapHue(baseHue + o));
  d.forEach((v, i) => el.style.setProperty(`--m-d${i}`, String(v)));
  const bored = [18, 8, -4, -16];
  bored.forEach((o, i) => el.style.setProperty(`--m-b${i}`, String(_mascotWrapHue(baseHue + o))));
  const angryHue = Number(opts.angryHue);
  const breakHue = Number(opts.breakHue);
  const angryAnc = Number.isFinite(angryHue) ? _mascotWrapHue(angryHue) : _mascotWrapHue(baseHue * 0.26 + 11 * 0.74);
  const angryOff = [16, 5, -7, -18];
  angryOff.forEach((o, i) => el.style.setProperty(`--m-a${i}`, String(_mascotWrapHue(angryAnc + o))));
  const breakAnc = Number.isFinite(breakHue) ? _mascotWrapHue(breakHue) : _mascotWrapHue(baseHue * 0.2 + 216 * 0.8);
  const brkOff = [12, 2, -8, -18];
  brkOff.forEach((o, i) => el.style.setProperty(`--m-k${i}`, String(_mascotWrapHue(breakAnc + o))));
}

function formatMascotSpokenLine(msg) {
  return msg;
}

function applyMascotTheme() {
  const hex = getMascotPref('mb_mascot_color', '#a855f7') || '#a855f7';
  const variant = resolveMascotVariantKeyFromPref();
  const breakHex = getMascotPref('mb_mascot_break_color', '#4f8cff') || '#4f8cff';
  const angryHex = getMascotPref('mb_mascot_angry_color', '#ff5b55') || '#ff5b55';
  const h = _mascotHexToHue(hex);
  const breakHue = _mascotHexToHue(breakHex);
  const angryHue = _mascotHexToHue(angryHex);
  const cust = document.getElementById('cust-empty');
  const prev = document.getElementById('settings-mascot-preview-wrap');
  const gm = document.getElementById('global-mascot');
  if (cust) _applyMascotVarsToEl(cust, h, variant, { breakHue, angryHue });
  if (prev) _applyMascotVarsToEl(prev, h, variant, { breakHue, angryHue });
  if (gm) _applyMascotVarsToEl(gm, h, variant, { breakHue, angryHue });
  if (prev) prev.style.setProperty('--mascot-user-scale', String(getMascotUserScaleMul()));
  applyMascotShape();
  applyMascotCosmetics();
  applyMascotCosmeticColors();
  if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  updateMascotNameLabel();
}

function applyMascotThemeLiveFromForm() {
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const sh = document.getElementById('s-mascot-shape');
  if (!c || !v) {
    applyMascotTheme();
    return;
  }
  const h = _mascotHexToHue(c.value);
  const breakHue = _mascotHexToHue(bk?.value || '#4f8cff');
  const angryHue = _mascotHexToHue(ag?.value || '#ff5b55');
  const cust = document.getElementById('cust-empty');
  const prev = document.getElementById('settings-mascot-preview-wrap');
  const gm = document.getElementById('global-mascot');
  const vKey = resolveMascotVariantKeyFromFormValue(v.value);
  if (cust) _applyMascotVarsToEl(cust, h, vKey, { breakHue, angryHue });
  if (prev) _applyMascotVarsToEl(prev, h, vKey, { breakHue, angryHue });
  if (gm) _applyMascotVarsToEl(gm, h, vKey, { breakHue, angryHue });
  const sc = document.getElementById('s-mascot-user-scale');
  const mul = sc ? Math.max(0.5, Math.min(1.5, Number(sc.value) / 100 || 1)) : getMascotUserScaleMul();
  if (prev) prev.style.setProperty('--mascot-user-scale', String(mul));
  if (sh) {
    const sVal = mascotShapeFromString(sh.value);
    document.querySelectorAll('.mascot-theme-root').forEach((el) => el.setAttribute('data-mascot-shape', sVal));
  }
  if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  applyMascotCosmetics();
  applyMascotCosmeticColors();
}

function updateMascotNameLabel() {
  const tag = document.getElementById('cust-empty-mascot-tag');
  if (!tag) return;
  tag.textContent = '';
  tag.style.display = 'none';
  refreshGlobalMascotInfoPanel();
}

let _mascotSettingsFormWired = false;

function loadMascotSettingsForm() {
  const n = document.getElementById('s-mascot-name');
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const won = document.getElementById('s-mascot-wander-on');
  const wd = document.getElementById('s-mascot-wander');
  const ws = document.getElementById('s-mascot-wander-speed');
  const sc = document.getElementById('s-mascot-user-scale');
  const sh = document.getElementById('s-mascot-shape');
  const cosEye = document.getElementById('s-mascot-cos-eye');
  const cosBrow = document.getElementById('s-mascot-cos-brow');
  const cosStache = document.getElementById('s-mascot-cos-stache');
  const cosMouth = document.getElementById('s-mascot-cos-mouth');
  const cosNose = document.getElementById('s-mascot-cos-nose');
  const cosHat = document.getElementById('s-mascot-cos-hat');
  const cosOutfit = document.getElementById('s-mascot-cos-outfit');
  const cosEarring = document.getElementById('s-mascot-cos-earring');
  const cosMakeup = document.getElementById('s-mascot-cos-makeup');
  const cosHair = document.getElementById('s-mascot-cos-hair');
  const coef = document.getElementById('s-mascot-age-coef');
  const coefHint = document.getElementById('s-mascot-age-coef-hint');
  if (!n || !c || !v) return;
  n.value = getMascotPref('mb_mascot_name', '');
  c.value = getMascotPref('mb_mascot_color', '#a855f7');
  v.value = getMascotPref('mb_mascot_variant', 'aurora');
  if (bk) bk.value = getMascotPref('mb_mascot_break_color', '#4f8cff');
  if (ag) ag.value = getMascotPref('mb_mascot_angry_color', '#ff5b55');
  if (won) won.checked = isMascotWanderEnabled();
  if (wd) wd.value = String(getMascotWanderPct());
  if (ws) ws.value = String(getMascotWanderSpeedPct());
  _syncMascotWanderControls();
  if (sc) sc.value = String(getMascotUserScalePct());
  if (sh) sh.value = getMascotShape();
  if (cosEye) cosEye.value = getMascotCosmeticPref('eye');
  if (cosBrow) cosBrow.value = getMascotCosmeticPref('brow');
  if (cosStache) cosStache.value = getMascotCosmeticPref('stache');
  if (cosMouth) cosMouth.value = getMascotCosmeticPref('mouth');
  if (cosNose) cosNose.value = getMascotCosmeticPref('nose');
  if (cosHat) cosHat.value = getMascotCosmeticPref('hat');
  if (cosOutfit) cosOutfit.value = getMascotCosmeticPref('outfit');
  if (cosEarring) cosEarring.value = getMascotCosmeticPref('earring');
  if (cosMakeup) cosMakeup.value = getMascotCosmeticPref('makeup');
  if (cosHair) cosHair.value = getMascotCosmeticPref('hair');
  _syncMascotCosColorInputsFromPrefs();
  const role = currentUser?.role || '';
  const adminLike = ['firm_admin', 'admin', 'super_admin'].includes(role);
  if (coef) {
    coef.value = String(getMascotAgeCoeff());
    coef.disabled = !adminLike;
    coef.style.opacity = adminLike ? '' : '0.65';
  }
  if (coefHint) {
    coefHint.textContent = adminLike
      ? 'Firma geneli katsayıdır.'
      : 'Bu katsayıyı sadece admin değiştirebilir.';
  }
  if (currentUser?.firm_id) {
    loadFirmDialerSettingsCache().then(() => {
      if (coef) coef.value = String(getMascotAgeCoeff());
      refreshGlobalMascotInfoPanel();
    }).catch(() => {});
  }
  applyMascotTheme();
  if (_mascotSettingsFormWired) return;
  _mascotSettingsFormWired = true;
  const onLive = () => {
    applyMascotThemeLiveFromForm();
    const tag = document.getElementById('cust-empty-mascot-tag');
    if (tag) {
      tag.textContent = '';
      tag.style.display = 'none';
    }
    refreshGlobalMascotInfoPanel();
  };
  c.addEventListener('input', onLive);
  v.addEventListener('change', () => {
    if (v.value === 'random') _mascotVariantRandResolved = '';
    onLive();
  });
  n.addEventListener('input', onLive);
  bk?.addEventListener('input', onLive);
  ag?.addEventListener('input', onLive);
  won?.addEventListener('change', () => {
    setMascotPref('mb_mascot_wander_on', won.checked ? '1' : '0');
    _syncMascotWanderControls();
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  wd?.addEventListener('input', () => {
    setMascotPref('mb_mascot_wander_pct', wd.value);
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  sc?.addEventListener('input', () => {
    setMascotPref('mb_mascot_user_scale', sc.value);
    const prevWrap = document.getElementById('settings-mascot-preview-wrap');
    if (prevWrap) prevWrap.style.setProperty('--mascot-user-scale', String(getMascotUserScaleMul()));
    if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  ws?.addEventListener('input', () => {
    setMascotPref('mb_mascot_wander_speed', ws.value);
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  sh?.addEventListener('change', () => {
    setMascotPref('mb_mascot_shape', sh.value);
    applyMascotShape();
    onLive();
  });
  const onCos = (part, el) => {
    if (!el) return;
    el.addEventListener('change', () => {
      setMascotPref(`mb_mascot_cos_${part}`, el.value || 'none');
      delete _mascotCosRandCache[part];
      applyMascotCosmetics();
    });
  };
  onCos('eye', cosEye);
  onCos('brow', cosBrow);
  onCos('stache', cosStache);
  onCos('mouth', cosMouth);
  onCos('nose', cosNose);
  onCos('hat', cosHat);
  onCos('outfit', cosOutfit);
  onCos('earring', cosEarring);
  onCos('makeup', cosMakeup);
  onCos('hair', cosHair);
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const cel = document.getElementById(`s-mascot-ccol-${part}`);
    if (!cel) continue;
    cel.addEventListener('input', () => {
      delete cel.dataset.cosInherit;
      setMascotPref(`mb_mascot_cos_${part}_color`, cel.value || '');
      applyMascotCosmeticColors();
    });
    cel.addEventListener('dblclick', (e) => {
      e.preventDefault();
      setMascotPref(`mb_mascot_cos_${part}_color`, '');
      _syncMascotCosColorInputsFromPrefs();
      applyMascotCosmeticColors();
    });
  }
}

function saveMascotSettings() {
  const n = document.getElementById('s-mascot-name');
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const won = document.getElementById('s-mascot-wander-on');
  const wd = document.getElementById('s-mascot-wander');
  const ws = document.getElementById('s-mascot-wander-speed');
  const sc = document.getElementById('s-mascot-user-scale');
  const sh = document.getElementById('s-mascot-shape');
  const cosEye = document.getElementById('s-mascot-cos-eye');
  const cosBrow = document.getElementById('s-mascot-cos-brow');
  const cosStache = document.getElementById('s-mascot-cos-stache');
  const cosMouth = document.getElementById('s-mascot-cos-mouth');
  const cosNose = document.getElementById('s-mascot-cos-nose');
  const cosHat = document.getElementById('s-mascot-cos-hat');
  const cosOutfit = document.getElementById('s-mascot-cos-outfit');
  const cosEarring = document.getElementById('s-mascot-cos-earring');
  const cosMakeup = document.getElementById('s-mascot-cos-makeup');
  const cosHair = document.getElementById('s-mascot-cos-hair');
  const coef = document.getElementById('s-mascot-age-coef');
  if (!n || !c || !v) return;
  const name = String(n.value || '')
    .trim()
    .slice(0, 28);
  let hex = String(c.value || '#a855f7').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) hex = '#a855f7';
  const vRaw = String(v.value || 'aurora').toLowerCase();
  const variant = vRaw === 'random' || MASCOT_VARIANT_OFFSETS[vRaw] ? vRaw : 'aurora';
  setMascotPref('mb_mascot_name', name);
  setMascotPref('mb_mascot_color', hex);
  setMascotPref('mb_mascot_variant', variant);
  if (variant === 'random') _mascotVariantRandResolved = '';
  if (bk) setMascotPref('mb_mascot_break_color', bk.value || '#4f8cff');
  if (ag) setMascotPref('mb_mascot_angry_color', ag.value || '#ff5b55');
  if (won) setMascotPref('mb_mascot_wander_on', won.checked ? '1' : '0');
  if (wd) setMascotPref('mb_mascot_wander_pct', wd.value || '35');
  if (ws) setMascotPref('mb_mascot_wander_speed', ws.value || '22');
  if (sc) setMascotPref('mb_mascot_user_scale', sc.value || '100');
  if (sh) setMascotPref('mb_mascot_shape', mascotShapeFromString(sh.value));
  if (cosEye) setMascotPref('mb_mascot_cos_eye', cosEye.value || 'none');
  if (cosBrow) setMascotPref('mb_mascot_cos_brow', cosBrow.value || 'none');
  if (cosStache) setMascotPref('mb_mascot_cos_stache', cosStache.value || 'none');
  if (cosMouth) setMascotPref('mb_mascot_cos_mouth', cosMouth.value || 'none');
  if (cosNose) setMascotPref('mb_mascot_cos_nose', cosNose.value || 'none');
  if (cosHat) setMascotPref('mb_mascot_cos_hat', cosHat.value || 'none');
  if (cosOutfit) setMascotPref('mb_mascot_cos_outfit', cosOutfit.value || 'none');
  if (cosEarring) setMascotPref('mb_mascot_cos_earring', cosEarring.value || 'none');
  if (cosMakeup) setMascotPref('mb_mascot_cos_makeup', cosMakeup.value || 'none');
  if (cosHair) setMascotPref('mb_mascot_cos_hair', cosHair.value || 'none');
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const cel = document.getElementById(`s-mascot-ccol-${part}`);
    if (!cel) continue;
    if (cel.dataset.cosInherit === '1') setMascotPref(`mb_mascot_cos_${part}_color`, '');
    else setMascotPref(`mb_mascot_cos_${part}_color`, cel.value || '');
  }
  applyMascotTheme();
  const role = currentUser?.role || '';
  const adminLike = ['firm_admin', 'admin', 'super_admin'].includes(role);
  const desiredCoef = Number(coef?.value || getMascotAgeCoeff());
  if (adminLike && currentUser?.firm_id && Number.isFinite(desiredCoef) && desiredCoef > 0) {
    sb(`firms?id=eq.${currentUser.firm_id}&select=settings`)
      .then((rows) => {
        const oldSettings = rows?.[0]?.settings || {};
        const oldDialer = oldSettings?.dialer || {};
        const dialer = { ...oldDialer, mascot_age_coeff: Math.max(1, Math.min(30, desiredCoef)) };
        return sb(`firms?id=eq.${currentUser.firm_id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ settings: { ...oldSettings, dialer } }),
        });
      })
      .then(() => loadFirmDialerSettingsCache())
      .then(() => refreshGlobalMascotInfoPanel())
      .catch(() => {});
  }
  toast(typeof t === 'function' ? t('dial.mascot_saved') : '✓ Maskot kaydedildi', 'ok');
  if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
}

try {
  window.saveMascotSettings = saveMascotSettings;
  window.loadMascotSettingsForm = loadMascotSettingsForm;
  window.applyMascotTheme = applyMascotTheme;
  window.applyMascotShape = applyMascotShape;
  window.applyMascotCosmetics = applyMascotCosmetics;
  window.applyMascotCosmeticColors = applyMascotCosmeticColors;
  window.randomizeMascotAppearance = randomizeMascotAppearance;
  window.switchMimiTab = switchMimiTab;
  window.hideMimi = hideMimi;
  window.showMimi = showMimi;
  window.toggleMimiBubbleMute = toggleMimiBubbleMute;
} catch (e) {}

let _globalMascotResizeWired = false;
let _lastMascotCheerSec = -1;
let _mascotNotifMorphT = null;
let _mascotDragState = null;
let _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
let _wanderRaf = null;
let _wanderCur = { x: 0, y: 0 };
let _wanderTgt = { x: 0, y: 0 };
let _wanderPauseUntil = 0;
let _wanderSpeedMult = 1;
let _dockRaf = null;
let _mimiActiveTab = 'profile';

function _fmtMimiLife(sec) {
  const s = Math.max(0, Math.floor(sec));
  const day = Math.floor(s / 86400);
  const hour = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (typeof tReplace === 'function') return tReplace('dial.mimi_age_fmt', { d: day, h: hour, m: min, s: rem });
  return `${day}g ${hour}s ${min}d ${rem}sn`;
}

function refreshGlobalMascotInfoPanel() {
  const nameEl = document.getElementById('global-mascot-info-name');
  const ageEl = document.getElementById('global-mascot-info-age');
  const callsEl = document.getElementById('global-mascot-info-calls');
  const variantEl = document.getElementById('global-mascot-info-variant');
  const noteEl = document.getElementById('global-mascot-info-note');
  const moodEl = document.getElementById('global-mascot-info-mood');
  const energyEl = document.getElementById('global-mascot-info-energy');
  const moodNoteEl = document.getElementById('global-mascot-info-mood-note');
  const tCallsEl = document.getElementById('global-mascot-info-today-calls');
  const tApptEl = document.getElementById('global-mascot-info-today-appts');
  const mApptEl = document.getElementById('global-mascot-info-month-appts');
  const statsNoteEl = document.getElementById('global-mascot-info-stats-note');
  const isDe = typeof currentLang !== 'undefined' && currentLang === 'de';
  const n = (getMascotPref('mb_mascot_name', '') || '').trim() || 'Mimi';
  const rawVariant = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  const appliedV = resolveMascotVariantKeyFromPref();
  const appliedLabel = appliedV.charAt(0).toUpperCase() + appliedV.slice(1);
  const totalCall = Math.max(0, _mascotCallAccumSec + (dialerStatus === 'on_call' ? (Number(callSeconds) || 0) : 0));
  const mimiAge = totalCall * getMascotAgeCoeff();
  if (nameEl) nameEl.textContent = n;
  if (ageEl) ageEl.textContent = _fmtMimiLife(mimiAge);
  if (callsEl) callsEl.textContent = _fmtMimiLife(totalCall);
  if (variantEl) {
    variantEl.textContent =
      rawVariant === 'random'
        ? (typeof tReplace === 'function' ? tReplace('dial.mimi_variant_random', { label: appliedLabel }) : (isDe ? `Zufall (${appliedLabel})` : `Rastgele (${appliedLabel})`))
        : appliedLabel;
  }
  const muteBtn = document.getElementById('mimi-bubble-mute-btn');
  const muteLbl = document.getElementById('mimi-bubble-mute-label');
  if (muteLbl) {
    muteLbl.textContent = isMimiBubbleMuted()
      ? (typeof t === 'function' ? t('dial.mimi_mute_show') : 'Balonları aç')
      : (typeof t === 'function' ? t('dial.mimi_mute_hide') : 'Balon konuşmasını kapat');
  }
  if (muteBtn) muteBtn.setAttribute('aria-pressed', isMimiBubbleMuted() ? 'true' : 'false');
  if (noteEl) {
    noteEl.textContent =
      typeof tReplace === 'function'
        ? tReplace('dial.mimi_note_age', { coef: getMascotAgeCoeff().toFixed(1) })
        : (isDe
          ? `Mimi altert mit dem ${getMascotAgeCoeff().toFixed(1)}-fachen deiner Gesprächszeit. Je ruhiger du bleibst, desto stärker wird sie.`
          : `Çağrı süresinin ${getMascotAgeCoeff().toFixed(1)} katı kadar Mimi yaş alıyor. Ne kadar sakin kalırsan o kadar büyüyor.`);
  }
  const gm = document.getElementById('global-mascot');
  const moodKey = gm?.getAttribute('data-mood') || '';
  const sad = gm?.classList.contains('global-mascot--sad');
  const cel = gm?.classList.contains('global-mascot--celebrate');
  const moodLabel = cel
    ? (typeof t === 'function' ? t('dial.mimi_mood_celebrate') : 'Kutlama')
    : sad
      ? (typeof t === 'function' ? t('dial.mimi_mood_sad') : 'Üzgün')
      : moodKey === 'break'
        ? (typeof t === 'function' ? t('dial.mimi_mood_break') : 'Uykulu')
        : moodKey === 'angry'
          ? (typeof t === 'function' ? t('dial.mimi_mood_angry') : 'Gergin')
          : moodKey === 'bored'
            ? (typeof t === 'function' ? t('dial.mimi_mood_bored') : 'Sıkıldı')
            : moodKey === 'eat'
              ? (typeof t === 'function' ? t('dial.mimi_mood_eat') : 'Mutlu')
              : (typeof t === 'function' ? t('dial.mimi_mood_calm') : 'Sakin');
  if (moodEl) moodEl.textContent = moodLabel;
  const heat = Number(document.getElementById('global-mascot')?.style.getPropertyValue('--mascot-call-heat') || '0') || 0;
  if (energyEl) energyEl.textContent = `${Math.round(heat * 100)}%`;
  if (moodNoteEl) {
    moodNoteEl.textContent = sad
      ? (typeof t === 'function' ? t('dial.mimi_mood_note_sad') : (isDe ? 'Kurz durchatmen… der nächste wird besser.' : 'Bir sonraki arama için minik bir nefes… Hazırsın.'))
      : cel
        ? (typeof t === 'function' ? t('dial.mimi_mood_note_celebrate') : (isDe ? 'Mit dieser Energie läuft’s!' : 'Bu enerjiyle çok iyi gidiyoruz!'))
        : (typeof t === 'function' ? t('dial.mimi_mood_note_default') : (isDe ? 'Ruhig und fokussiert.' : 'Sakin ve odaklı — en iyi hâlim.'));
  }
  const p = window._dialerPerfSnapshot || {};
  if (tCallsEl) tCallsEl.textContent = String(Number(p.todayCalls) || 0);
  if (tApptEl) tApptEl.textContent = String(Number(p.todayAppts) || 0);
  if (mApptEl) mApptEl.textContent = String(Number(p.monthlyAppts) || 0);
  if (statsNoteEl) {
    statsNoteEl.textContent = typeof t === 'function' ? t('dial.mimi_stats_note') : (isDe ? 'Statistiken werden aus dem Performance-Panel aktualisiert.' : 'İstatistikler performans panelinden güncellenir.');
  }
}

function _resetGlobalMascotInfoPanelPosition() {
  const panel = document.getElementById('global-mascot-info');
  if (!panel) return;
  panel.style.position = '';
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.transform = '';
  panel.style.maxWidth = '';
}

/** Mimi kartı maskot viewport kenarındayken taşmasın — fixed konum + clamp */
function positionGlobalMascotInfoPanel() {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm || panel.style.display === 'none') return;
  const anchor =
    document.querySelector('#global-mascot .cust-empty-blob') || document.getElementById('cust-empty-mascot');
  if (!anchor) return;
  const pad = 10;
  const maxW = Math.min(420, Math.max(220, window.innerWidth - pad * 2));
  panel.style.position = 'fixed';
  panel.style.transform = 'none';
  panel.style.maxWidth = `${maxW}px`;
  panel.style.left = '-9999px';
  panel.style.top = '0';
  const ar = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  let left = ar.right + 12;
  let top = ar.top + ar.height / 2 - ph / 2;
  if (left + pw > window.innerWidth - pad) {
    left = ar.left - pw - 12;
  }
  if (left < pad) left = pad;
  if (left + pw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - pw);
  if (top + ph > window.innerHeight - pad) top = window.innerHeight - pad - ph;
  if (top < pad) top = pad;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function switchMimiTab(tab) {
  _mimiActiveTab = tab || 'profile';
  const map = [
    ['profile', 'mimi-pane-profile', 'mimi-tab-profile'],
    ['mood', 'mimi-pane-mood', 'mimi-tab-mood'],
    ['stats', 'mimi-pane-stats', 'mimi-tab-stats'],
  ];
  map.forEach(([k, paneId, tabId]) => {
    document.getElementById(paneId)?.style && (document.getElementById(paneId).style.display = k === _mimiActiveTab ? '' : 'none');
    document.getElementById(tabId)?.classList.toggle('active', k === _mimiActiveTab);
  });
  refreshGlobalMascotInfoPanel();
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    requestAnimationFrame(() => {
      positionGlobalMascotInfoPanel();
      requestAnimationFrame(() => positionGlobalMascotInfoPanel());
    });
  }
}

function toggleGlobalMascotInfoPanel(forceOpen) {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm) return;
  if (isMimiHidden()) return;
  const open = forceOpen === undefined ? panel.style.display === 'none' || !panel.style.display : !!forceOpen;
  if (!open) {
    _resetGlobalMascotInfoPanelPosition();
    panel.style.display = 'none';
    gm.classList.remove('global-mascot--panel-open');
    return;
  }
  panel.style.display = 'block';
  gm.classList.add('global-mascot--panel-open');
  switchMimiTab(_mimiActiveTab || 'profile');
  requestAnimationFrame(() => {
    positionGlobalMascotInfoPanel();
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  });
}

function hideMimi() {
  setMascotPref('mb_mascot_hidden', '1');
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) bubble.style.display = 'none';
  toggleGlobalMascotInfoPanel(false);
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  if (typeof _clearCustEmptyNotifPeek === 'function') _clearCustEmptyNotifPeek();
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-chat', 'cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-chat', 'global-mascot--peek-notif');
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
  syncGlobalMascotDock();
}

function showMimi() {
  setMascotPref('mb_mascot_hidden', '0');
  syncGlobalMascotDock();
  if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
}

function _loadMascotCustomPos() {
  try {
    const raw = getMascotPref('mb_mascot_custom_pos', '');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function _wireGlobalMascotInteractions() {
  const gm = document.getElementById('global-mascot');
  const mascot = document.getElementById('cust-empty-mascot');
  if (!gm || !mascot || gm.dataset.interactiveReady === '1') return;
  gm.dataset.interactiveReady = '1';
  mascot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    _stopGlobalMascotWander();
    const r = gm.getBoundingClientRect();
    _mascotDragState = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      moved: false,
    };
    gm.classList.add('global-mascot--dragging');
    mascot.setPointerCapture(e.pointerId);
  });
  mascot.addEventListener('pointermove', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - _mascotDragState.sx;
    const dy = e.clientY - _mascotDragState.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mascotDragState.moved = true;
    const edge = 24;
    const x = Math.max(edge, Math.min(window.innerWidth - edge, _mascotDragState.left + dx));
    const y = Math.max(edge, Math.min(window.innerHeight - edge, _mascotDragState.top + dy));
    gm.style.left = `${x}px`;
    gm.style.top = `${y}px`;
    gm.classList.add('global-mascot--custom');
    setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x, y }));
  });
  mascot.addEventListener('pointerup', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const wasMove = _mascotDragState.moved;
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (wasMove) {
      if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
      else _syncGlobalMascotWanderOnly();
    } else {
      const bubble = document.getElementById('cust-empty-bubble');
      if (bubble && bubble.style.display !== 'none') {
        bubble.style.display = 'none';
        _syncGlobalMascotWanderOnly();
        return;
      }
      if (isMimiHidden()) showMimi();
      else toggleGlobalMascotInfoPanel();
      _syncGlobalMascotWanderOnly();
    }
  });
  mascot.addEventListener('pointercancel', () => {
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
    else _syncGlobalMascotWanderOnly();
  });
}

function _stopGlobalMascotWander() {
  if (_wanderRaf) {
    cancelAnimationFrame(_wanderRaf);
    _wanderRaf = null;
  }
  const gm = document.getElementById('global-mascot');
  const ax = _wanderCur.x;
  const ay = _wanderCur.y;
  if (gm && (Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5)) {
    const left = (parseFloat(String(gm.style.left || '0')) || 0) + ax;
    const top = (parseFloat(String(gm.style.top || '0')) || 0) + ay;
    gm.style.left = `${left}px`;
    gm.style.top = `${top}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    try {
      setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x: left, y: top }));
    } catch (e) {}
  }
  _wanderCur = { x: 0, y: 0 };
  _wanderTgt = { x: 0, y: 0 };
  _wanderPauseUntil = 0;
  _wanderSpeedMult = 1;
  if (gm) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  }
}

/** Kenar çubuğu veya üst çubuk ayağına kilitliyken gezinme menünün üstüne biner. Sürüklenen konum, gezme açıksa devam eder. */
function _mascotDockedInSidebar(gm) {
  return !!(gm && gm.classList.contains('global-mascot--topbar') && !gm.classList.contains('global-mascot--custom'));
}

function _mascotWanderAllowed(gm) {
  if (!gm || isMimiHidden() || !isMascotWanderEnabled()) return false;
  if (getMascotWanderPct() <= 0) return false;
  if (_mascotDockedInSidebar(gm)) return false;
  if (gm.classList.contains('global-mascot--peek-chat')) return false;
  if (gm.classList.contains('global-mascot--peek-notif')) return false;
  if (gm.classList.contains('global-mascot--notif-morph')) return false;
  return true;
}

/** Sürükleme bittiğinde veya ayar değişince: gezinmeyi yeniden başlat / durdur (konumu sıfırlamaz). */
function _syncGlobalMascotWanderOnly() {
  const gm = document.getElementById('global-mascot');
  if (!gm || isMimiHidden()) return;
  if (_mascotWanderAllowed(gm)) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
}

function _pickWanderTarget(gm) {
  const b = _mascotWanderBoundsFromViewport(gm);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) {
    _wanderTgt.x = Number.isFinite(_wanderCur.x) ? _wanderCur.x : 0;
    _wanderTgt.y = Number.isFinite(_wanderCur.y) ? _wanderCur.y : 0;
    return;
  }
  if (w < 1e-4 && h < 1e-4) {
    _wanderTgt.x = b.minX;
    _wanderTgt.y = b.minY;
    return;
  }
  const wanderPct = getMascotWanderPct();
  /** Düşük gezinmede hedef yarıçapı küçülür; hareket alanı büyük olsa bile “sürekli köşelere” gitmez. */
  const wf = Math.pow(Math.max(0, wanderPct) / 100, 1.22);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const halfWx = w / 2;
  const halfHy = h / 2;
  _wanderTgt.x = midX + (Math.random() * 2 - 1) * halfWx * wf;
  _wanderTgt.y = midY + (Math.random() * 2 - 1) * halfHy * wf;
  // Hedefe vardıktan sonra rastgele bekle (0.8–5 sn) ve rastgele hızla git
  _wanderPauseUntil = performance.now() + 800 + Math.random() * 4200;
  _wanderSpeedMult = 0.35 + Math.random() * 1.65;
}

function _wanderFrame() {
  const gm = document.getElementById('global-mascot');
  if (!gm) {
    _wanderRaf = null;
    return;
  }
  const pct = getMascotWanderPct();
  if (!isMascotWanderEnabled() || pct <= 0) {
    _stopGlobalMascotWander();
    return;
  }
  const dx = _wanderTgt.x - _wanderCur.x;
  const dy = _wanderTgt.y - _wanderCur.y;
  if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) {
    if (performance.now() < _wanderPauseUntil) {
      _wanderRaf = requestAnimationFrame(_wanderFrame);
      return;
    }
    _pickWanderTarget(gm);
  }
  // Ara sıra rastgele yön değiştir (%0.3 şans / frame)
  if (Math.random() < 0.003) _pickWanderTarget(gm);
  const bounds = _mascotWanderBoundsFromViewport(gm);
  const speedPct = getMascotWanderSpeedPct();
  const speedT = Math.max(0, speedPct) / 100;
  const speedK = 0.006 + speedT * 0.14;
  const wanderT = Math.max(0, Math.min(100, pct)) / 100;
  const step = speedK * (0.12 + wanderT * 0.88) * 0.09 * Math.pow(wanderT, 1.35) * _wanderSpeedMult;
  _wanderCur.x += dx * step;
  _wanderCur.y += dy * step;
  _wanderCur.x = Math.min(bounds.maxX, Math.max(bounds.minX, _wanderCur.x));
  _wanderCur.y = Math.min(bounds.maxY, Math.max(bounds.minY, _wanderCur.y));
  if (!Number.isFinite(_wanderCur.x)) _wanderCur.x = 0;
  if (!Number.isFinite(_wanderCur.y)) _wanderCur.y = 0;
  gm.style.setProperty('--gm-wx', `${_wanderCur.x.toFixed(2)}px`);
  gm.style.setProperty('--gm-wy', `${_wanderCur.y.toFixed(2)}px`);
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble && bubble.style.display === 'block') {
    const pad = 10;
    let shift = 0;
    const br = bubble.getBoundingClientRect();
    if (br.left < pad) shift += pad - br.left;
    if (br.right > window.innerWidth - pad) shift -= br.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  }
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    if (typeof positionGlobalMascotInfoPanel === 'function') positionGlobalMascotInfoPanel();
  }
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _startGlobalMascotWander() {
  if (_wanderRaf) return;
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const pct = getMascotWanderPct();
  if (!isMascotWanderEnabled() || pct <= 0) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  _wanderCur = { x: 0, y: 0 };
  _pickWanderTarget(gm);
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _placeGlobalMascotAtRect(rect) {
  const gm = document.getElementById('global-mascot');
  if (!gm || !rect) return;
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rect.width < 0.5) {
    const ax = document.getElementById('sb-mascot-anchor') || document.getElementById('tb-mascot-anchor');
    const r2 = ax ? ax.getBoundingClientRect() : null;
    if (r2 && Number.isFinite(r2.left) && r2.width >= 0.5) {
      cx = r2.left + r2.width / 2;
      cy = r2.top + r2.height / 2;
    } else {
      cx = Math.max(40, (Number(window.innerWidth) || 800) * 0.5);
      cy = 36;
    }
  }
  gm.style.left = `${cx}px`;
  gm.style.top = `${cy}px`;
  gm.classList.add('global-mascot--placed');
}

function syncCustomerCardEmptyVisual() {
  const cc = document.getElementById('customer-card');
  const ce = document.getElementById('cust-empty');
  if (!cc || !ce) return;
  const showEmpty = ce.style.display !== 'none';
  cc.classList.toggle('customer-card--empty', showEmpty);
}

function _visibleMascotAnchor() {
  const sb = document.getElementById('sidebar');
  const side = document.getElementById('sb-mascot-anchor');
  const top = document.getElementById('tb-mascot-anchor');
  if (sb && side) {
    const r = sb.getBoundingClientRect();
    if (r.width > 40 && r.right > 24 && r.left < (window.innerWidth || 0) - 8) return side;
  }
  return top || side;
}

function syncGlobalMascotDock() {
  if (_dockRaf) cancelAnimationFrame(_dockRaf);
  _dockRaf = requestAnimationFrame(() => {
    _dockRaf = null;
    _syncGlobalMascotDockImpl();
  });
}

function _syncGlobalMascotDockImpl() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const anchor = _visibleMascotAnchor();
  gm.classList.toggle('global-mascot--sidebar', !!(anchor && anchor.id === 'sb-mascot-anchor'));
  gm.classList.toggle('global-mascot--muted', isMimiHidden());
  _wireGlobalMascotInteractions();
  if (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif')) {
    gm.classList.add('global-mascot--placed');
    return;
  }
  if (isMimiHidden()) {
    const logo = document.querySelector('.tb-logo');
    const fallback = { left: 80, top: 28, width: 36, height: 34 };
    const lr = logo
      ? logo.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : fallback;
    _placeGlobalMascotAtRect({ left: lr.left + lr.width + 22, top: lr.top + 16, width: 18, height: 18 });
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
    _stopGlobalMascotWander();
    return;
  }
  if (gm.classList.contains('global-mascot--notif-morph')) {
    const nb = document.getElementById('tb-notif-btn');
    const r = nb
      ? nb.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : { left: 80, top: 28, width: 36, height: 34 };
    _placeGlobalMascotAtRect(r);
    gm.classList.add('global-mascot--topbar');
    gm.classList.remove('global-mascot--dialer');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  const custom = _loadMascotCustomPos();
  if (custom) {
    gm.style.left = `${custom.x}px`;
    gm.style.top = `${custom.y}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    _placeGlobalMascotAtRect(rect);
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else {
    const vw = Number(window.innerWidth) || 800;
    _placeGlobalMascotAtRect({ left: vw * 0.5 - 18, top: 52, width: 36, height: 34 });
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar', 'global-mascot--placed');
  }
  if (_mascotWanderAllowed(gm)) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
  if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  const info = document.getElementById('global-mascot-info');
  if (info && info.style.display !== 'none') {
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  }
}

function syncGlobalMascotMoodFromCustEmpty() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (!root || root.style.display === 'none') {
    gm.removeAttribute('data-mood');
    return;
  }
  if (root.classList.contains('cust-empty--break')) gm.setAttribute('data-mood', 'break');
  else if (root.classList.contains('cust-empty--mascot-angry')) gm.setAttribute('data-mood', 'angry');
  else if (root.classList.contains('cust-empty--mascot-bored')) gm.setAttribute('data-mood', 'bored');
  else if (root.classList.contains('cust-empty--mascot-eat')) gm.setAttribute('data-mood', 'eat');
  else if (root.classList.contains('cust-empty--mascot-drink')) gm.setAttribute('data-mood', 'drink');
  else if (root.classList.contains('cust-empty--mascot-yawn')) gm.setAttribute('data-mood', 'yawn');
  else if (root.classList.contains('cust-empty--mascot-stretch')) gm.setAttribute('data-mood', 'stretch');
  else if (root.classList.contains('cust-empty--mascot-celebrate')) gm.setAttribute('data-mood', 'celebrate');
  else gm.removeAttribute('data-mood');
}

function onCallTickForGlobalMascot() {
  if (typeof dialerStatus === 'undefined' || dialerStatus !== 'on_call') return;
  const sec = typeof callSeconds !== 'undefined' ? callSeconds : 0;
  const heat = Math.min(sec / 90, 1);
  document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', String(heat));
  refreshGlobalMascotInfoPanel();
  const milestones = [30, 70, 115, 175, 240, 330, 450];
  const hit = milestones.find((m) => m <= sec && m > _lastMascotCheerSec);
  if (!hit) return;
  if (isMimiHidden()) return;
  _lastMascotCheerSec = hit;
  const idx = Math.floor(Math.random() * 9);
  const msg = typeof t === 'function' ? t(`dial.cheer.${idx}`) : '';
  _showCustEmptyBubbleMsg(msg || '…');
}

function runGlobalMascotNotifMorph() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (_mascotNotifMorphT) clearTimeout(_mascotNotifMorphT);
  gm.classList.remove('global-mascot--notif-open');
  gm.classList.add('global-mascot--notif-morph');
  syncGlobalMascotDock();
  setTimeout(() => gm.classList.add('global-mascot--notif-open'), 420);
  _mascotNotifMorphT = setTimeout(() => {
    gm.classList.remove('global-mascot--notif-morph', 'global-mascot--notif-open');
    _mascotNotifMorphT = null;
    syncGlobalMascotDock();
  }, 2900);
}

function reloadMascotStateForUser() {
  _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
  _lastMascotCheerSec = -1;
  _mascotCosRandCache = {};
  _mascotVariantRandResolved = '';
  try {
    refreshGlobalMascotInfoPanel();
    applyMascotTheme();
    syncGlobalMascotDock();
  } catch (e) {}
}

try {
  window.syncGlobalMascotDock = syncGlobalMascotDock;
  window.runGlobalMascotNotifMorph = runGlobalMascotNotifMorph;
  window.reloadMascotStateForUser = reloadMascotStateForUser;
} catch (e) {}

let _custEmptyCoachTimer = null;
let _custEmptyChatPeekTimer = null;
let _custEmptyNotifPeekTimer = null;
let _custEmptyNotifPeekDelayT = null;
let _custEmptyLastNotifHint = 0;

function _clearCustEmptyCoachTimer() {
  if (_custEmptyCoachTimer) {
    clearInterval(_custEmptyCoachTimer);
    _custEmptyCoachTimer = null;
  }
}

function _showCustEmptyBubbleMsg(msg) {
  const bubble = document.getElementById('cust-empty-bubble');
  if (!bubble || isMimiHidden() || isMimiBubbleMuted()) return;
  bubble.textContent = formatMascotSpokenLine(msg);
  bubble.style.setProperty('--bubble-shift-x', '0px');
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
  const clampBubble = () => {
    const r = bubble.getBoundingClientRect();
    const pad = 10;
    let shift = 0;
    if (r.left < pad) shift += pad - r.left;
    if (r.right > window.innerWidth - pad) shift -= r.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(clampBubble);
  });
}

function _clearCustEmptyNotifPeek() {
  if (_custEmptyNotifPeekDelayT) {
    clearTimeout(_custEmptyNotifPeekDelayT);
    _custEmptyNotifPeekDelayT = null;
  }
  if (_custEmptyNotifPeekTimer) {
    clearTimeout(_custEmptyNotifPeekTimer);
    _custEmptyNotifPeekTimer = null;
  }
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-notif');
}

function hintCustEmptyNotifUnread(totalUnread) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  if (root?.classList.contains('cust-empty--peek-chat')) return;
  if (gm.classList.contains('global-mascot--peek-chat')) return;
  const n = Math.max(1, Number(totalUnread) || 1);
  if (Date.now() - _custEmptyLastNotifHint < 85000) return;
  _custEmptyLastNotifHint = Date.now();
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  if (typeof runGlobalMascotNotifMorph === 'function') runGlobalMascotNotifMorph();
  _showCustEmptyBubbleMsg(
    typeof tReplace === 'function' ? tReplace('dial.hint_notif', { n }) : `Bildirim (${n})`
  );
  _custEmptyNotifPeekDelayT = setTimeout(() => {
    _custEmptyNotifPeekDelayT = null;
    root?.classList.add('cust-empty--peek-notif');
    gm.classList.add('global-mascot--peek-notif');
    syncGlobalMascotDock();
  }, 3000);
  _custEmptyNotifPeekTimer = setTimeout(() => {
    _custEmptyNotifPeekTimer = null;
    root?.classList.remove('cust-empty--peek-notif');
    gm.classList.remove('global-mascot--peek-notif');
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }, 14000);
}

function hintCustEmptyChatMessage(fromName) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  root?.classList.remove('cust-empty--peek-notif');
  gm.classList.remove('global-mascot--peek-notif');
  root?.classList.add('cust-empty--peek-chat');
  gm.classList.add('global-mascot--peek-chat');
  const isDe = typeof currentLang !== 'undefined' && currentLang === 'de';
  const who =
    fromName && String(fromName).trim()
      ? String(fromName).trim()
      : typeof t === 'function'
        ? t('dial.hint_chat_team')
        : isDe
          ? 'Team'
          : 'Ekip';
  _showCustEmptyBubbleMsg(
    typeof tReplace === 'function' ? tReplace('dial.hint_chat', { who }) : `Chat: ${who}`
  );
  if (_custEmptyChatPeekTimer) clearTimeout(_custEmptyChatPeekTimer);
  _custEmptyChatPeekTimer = setTimeout(() => clearCustEmptyChatPeek(), 14000);
}

function clearCustEmptyChatPeek() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const hadPeek = !!(
    (root && root.classList.contains('cust-empty--peek-chat')) ||
    (gm && gm.classList.contains('global-mascot--peek-chat'))
  );
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  root?.classList.remove('cust-empty--peek-chat');
  gm?.classList.remove('global-mascot--peek-chat');
  if (hadPeek) {
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }
}

try {
  window.hintCustEmptyChatMessage = hintCustEmptyChatMessage;
  window.clearCustEmptyChatPeek = clearCustEmptyChatPeek;
  window.hintCustEmptyNotifUnread = hintCustEmptyNotifUnread;
} catch (e) {}

function _custEmptyCoachTargetVisible() {
  const root = document.getElementById('cust-empty');
  const dialer = document.getElementById('page-dialer')?.classList.contains('active');
  return !!(dialer && root && root.style.display !== 'none');
}

function refreshCustEmptyCoachBubble() {
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  const bubble = document.getElementById('cust-empty-bubble');
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!bubble || !root || root.style.display === 'none' || root.classList.contains('cust-empty--ringing')) {
    if (bubble) bubble.style.display = 'none';
    return;
  }
  if (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif')) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  const p = window._dialerPerfSnapshot || {};
  const calls = Number(p.calls) || 0;
  const appts = Number(p.appts) || 0;
  const posCalls = Number(p.posCalls) || 0;
  const tdA = Number(p.todayAppts) || 0;
  const tdC = Number(p.todayCalls) || 0;
  const monA = Number(p.monthlyAppts) || 0;
  const scope = p.tab === 'week' ? 'week' : (p.tab === 'month' ? 'month' : 'today');
  const scopeKey = scope === 'week' ? 'dial.scope.week' : (scope === 'month' ? 'dial.scope.month' : 'dial.scope.today');
  const scopeStr = typeof t === 'function' ? t(scopeKey) : '';
  const goalBase = Math.max(1, Number(_dailyGoal) || 5);
  const goalFactor = scope === 'week' ? 5 : (scope === 'month' ? 22 : 1);
  const periodGoal = goalBase * goalFactor;
  const apptRatio = appts / periodGoal;
  const hasStrongCallVolume = calls >= (12 * goalFactor);
  const roll = Math.random();
  let msg = '';
  if (roll < 0.28) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.today', { tdA, tdC }) : '';
  } else if (roll < 0.36 && monA > 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.month', { monA }) : '';
  } else if (apptRatio >= 1.1 && hasStrongCallVolume) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.tempo', { scope: scopeStr }) : '';
  } else if (calls >= (14 * goalFactor) && posCalls === 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.many_calls', { scope: scopeStr }) : '';
  } else if (calls >= (10 * goalFactor) && appts === 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.rhythm', { scope: scopeStr }) : '';
  } else if (apptRatio >= 0.9) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.strong90', { scope: scopeStr }) : '';
  } else if (apptRatio >= 0.6) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.strong60', { scope: scopeStr }) : '';
  } else {
    const pi = Math.floor(Math.random() * 4);
    msg = typeof t === 'function' ? t(`dial.coach.pool.${pi}`) : '';
  }
  _showCustEmptyBubbleMsg(msg || '…');
}

function startCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (root && (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif'))) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  if (!_custEmptyCoachTargetVisible()) return;
  refreshCustEmptyCoachBubble();
  _custEmptyCoachTimer = setInterval(() => refreshCustEmptyCoachBubble(), 52000);
}

function stopCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) {
    bubble.style.display = 'none';
    bubble.classList.remove('cust-empty-bubble--pop');
  }
}

let _readyEnteredAt = null;
/** Boş kartta (Hazır değilken) sıkılma/sinir süresi için başlangıç */
let _custEmptyIdleSince = null;
let _mascotMoodTimer = null;
let _mascotEatTimer = null;

/** İç --mx/--my titremesi kaldırıldı; gezinme yalnızca global _wanderFrame ile (diğer sekmelerle aynı). */
function _resetCustEmptyMascotInnerOffset() {
  const mascot = document.getElementById('cust-empty-mascot');
  if (!mascot) return;
  mascot.style.setProperty('--mx', '0px');
  mascot.style.setProperty('--my', '0px');
}

function _stopCustEmptyMascotTimers() {
  if (_mascotMoodTimer) {
    clearInterval(_mascotMoodTimer);
    _mascotMoodTimer = null;
  }
  if (_mascotEatTimer) {
    clearTimeout(_mascotEatTimer);
    _mascotEatTimer = null;
  }
  _resetCustEmptyMascotInnerOffset();
}

function refreshCustEmptyMascotState() {
  const root = document.getElementById('cust-empty');
  if (!root || root.style.display === 'none') {
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (root.classList.contains('cust-empty--ringing')) return;
  root.classList.remove('cust-empty--mascot-bored', 'cust-empty--mascot-angry', 'cust-empty--break');
  const st = typeof dialerStatus !== 'undefined' ? dialerStatus : '';
  if (st === 'break') {
    root.classList.add('cust-empty--break');
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (st !== 'ready' && st !== 'offline') return;
  if (st === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  const t0 = st === 'ready' && _readyEnteredAt ? _readyEnteredAt : _custEmptyIdleSince || Date.now();
  const waitSec = (Date.now() - t0) / 1000;
  if (waitSec > 120) root.classList.add('cust-empty--mascot-angry');
  else if (waitSec > 45) root.classList.add('cust-empty--mascot-bored');
  syncGlobalMascotMoodFromCustEmpty();
}

function scheduleMascotEatOnce() {
  if (_mascotEatTimer) clearTimeout(_mascotEatTimer);
  const delay = 22000 + Math.floor(Math.random() * 28000);
  _mascotEatTimer = setTimeout(() => {
    _mascotEatTimer = null;
    if (dialerStatus !== 'ready' && dialerStatus !== 'offline') {
      scheduleMascotEatOnce();
      return;
    }
    const root = document.getElementById('cust-empty');
    if (!root || root.classList.contains('cust-empty--ringing')) {
      scheduleMascotEatOnce();
      return;
    }
    root.classList.add('cust-empty--mascot-eat');
    syncGlobalMascotMoodFromCustEmpty();
    setTimeout(() => {
      root.classList.remove('cust-empty--mascot-eat');
      syncGlobalMascotMoodFromCustEmpty();
      scheduleMascotEatOnce();
    }, 2600);
  }, delay);
}

function startCustEmptyMascotLoops() {
  _stopCustEmptyMascotTimers();
  if (dialerStatus === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  refreshCustEmptyMascotState();
  if (dialerStatus !== 'ready' && dialerStatus !== 'break' && dialerStatus !== 'offline') return;
  _mascotMoodTimer = setInterval(refreshCustEmptyMascotState, 8000);
  if (dialerStatus === 'ready' || dialerStatus === 'offline') scheduleMascotEatOnce();
}

/** Aylık randevu / hedefe göre büyüme × kullanıcı boyutu (ayarlar 50–150%) */
function updateCustEmptyMascotScale() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const monthlyGoal = Math.max(1, Number(_dailyGoal) || 5) * 22;
  const n = Number(window._dialerPerfSnapshot?.monthlyAppts ?? 0);
  const t = Math.min(Math.max(n / monthlyGoal, 0), 2.2);
  const perf = 1 + 0.28 * t;
  const userMul = getMascotUserScaleMul();
  const combined = perf * userMul;
  const v = String(Math.min(Math.max(combined, 0.45), 2));
  if (root) root.style.setProperty('--mascot-scale', v);
  if (gm) gm.style.setProperty('--mascot-scale', v);
}

async function loadUpcomingWv() {
  const el = document.getElementById('upcoming-wv-list');
  if (!el) return;
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48*60*60*1000).toISOString();
    const list = await sb(`wiedervorlage?agent_id=eq.${currentUser?.id}&durum=eq.bekliyor&termin_zaman=lte.${soon}&order=termin_zaman.asc&limit=5`);
    if (!list?.length) { el.innerHTML=`<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">${escapeHtml(typeof t === 'function' ? t('dial.wv_empty') : '')}</div>`; return; }
    el.innerHTML = list.map(w => {
      const dt = new Date(w.termin_zaman);
      const timeStr = typeof mbFormatWall === 'function'
        ? mbFormatWall(w.termin_zaman, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : dt.toLocaleString(typeof mbLocale === 'function' ? mbLocale() : 'tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit', timeZone: (typeof MB_BUSINESS_TZ === 'string' ? MB_BUSINESS_TZ : 'Europe/Berlin')});
      const isOverdue = dt < now;
      return `<div style="padding:5px 8px;background:var(--bg-3);border-radius:5px;border-left:3px solid ${isOverdue?'var(--red)':'var(--yellow)'};" onclick="navigate('wiedervorlage')">
<div style="font-weight:700;font-size:11px;color:${isOverdue?'var(--red)':'var(--text)'};">${w.nachname||w.telefon}</div>
<div style="font-size:10px;color:var(--text-3);">${timeStr}</div>
</div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">—</div>'; }
}

let _unfinalizedCallsOpen = false;
/** TEST gelen arama simülasyonu: dış numara sıklığı için sayaç */
let _inboundSimTickCount = 0;
/** Dış gelen (TEST) fluid vurgusu — proceed’den önce iptal */
let _inboundExternalCueTimer = null;
/** Gelen (TEST) kaydırmalı yanıtlama kartı açık */
let _inboundTestRingOpen = false;
let _inboundRingAutoDeclineTimer = null;
/** Gelen test bağlamı (sahiplik, aktarım, proceed) */
let _inboundTestCtx = null;
let _inboundTestXferPoll = null;

async function _fetchFirmAgentsForInboundTest(fid) {
  const now = Date.now();
  if (window._firmAgentsInboundCache && window._firmAgentsInboundTs && now - window._firmAgentsInboundTs < 45000) {
    return window._firmAgentsInboundCache;
  }
  const rows =
    (await sb(
      `users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&is_active=eq.true&select=id,name&order=name.asc`
    ).catch(() => [])) || [];
  window._firmAgentsInboundCache = rows;
  window._firmAgentsInboundTs = now;
  return rows;
}

/** RLS çoğu zaman sadece kendi satırını döndürür; test senaryoları için isimler (aktarım metni) */
function _testInboundAugmentOthers(others) {
  const base = Array.isArray(others) ? [...others] : [];
  if (base.length >= 2) return base;
  const extra = [
    { id: null, name: 'Ziya' },
    { id: null, name: 'Mehmet' },
  ];
  for (const e of extra) {
    if (base.length >= 2) break;
    if (!base.some((b) => (b.name || '') === e.name)) base.push(e);
  }
  return base;
}

function _maybeConsumeTestTransferInbox() {
  if (!_testMode || dialerStatus !== 'ready') return;
  if (_inboundTestRingOpen || _fakeCallActive || dialerStatus === 'on_call') return;
  if (!currentUser?.id) return;
  const k = `mb_test_xfer_${currentUser.id}`;
  let raw;
  try {
    raw = localStorage.getItem(k);
  } catch (e) {
    return;
  }
  if (!raw) return;
  let p;
  try {
    p = JSON.parse(raw);
  } catch (e) {
    try {
      localStorage.removeItem(k);
    } catch (e2) {}
    return;
  }
  if (Date.now() - (p.ts || 0) > 120000) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
    return;
  }
  try {
    localStorage.removeItem(k);
  } catch (e) {}
  const phone = String(p.phone || '').trim();
  if (!phone) return;
  const displayName = String(p.displayName || phone).trim();
  const parts = displayName.split(/\s+/);
  const contact = {
    id: `in-${Date.now()}`,
    phone,
    first_name: parts[0] || (typeof t === 'function' ? t('dial.contact_inbound') : 'Gelen'),
    last_name: parts.slice(1).join(' ') || (typeof t === 'function' ? t('dial.contact_test') : 'Test'),
    firm_id: currentUser.firm_id,
    campaign_id: selectedCampId || campaigns?.[0]?.id || null,
    status: 'pending',
    attempt_count: 0,
    is_inbound_test: true,
    _testScenario: 'forwarded',
    _testFromAgentName: p.fromAgent || '—',
  };
  void beginInboundTestCall({
    phone,
    displayName,
    contact,
    routeDetail: '',
    isExternalInbound: false,
  });
}

