// Maskot — dialer.js ile aynı global kapsam
// ── Maskot tema (isim, ana renk, gradient) — localStorage ─────────
const MASCOT_VARIANT_OFFSETS = {
  aurora: [0, 24, 50, 78],
  sunset: [0, 14, 28, 42],
  ocean: [0, -12, -26, 16],
  forest: [0, 12, 26, 40],
  candy: [0, 16, 32, 48],
  midnight: [0, -10, 14, 28],
  ember: [0, 12, 24, 40],
  gold: [0, 10, 18, 28],
  rose: [0, 12, 24, 36],
  sky: [0, -10, -22, 12],
  lavender: [0, 14, 28, 42],
  mint: [0, 12, 24, 36],
  sand: [0, 8, 16, 24],
  ink: [0, 0, 0, 0],
  snow: [0, 0, 0, 0],
  custom: [0, 0, 0, 0],
};
const MASCOT_VARIANT_ANCHOR = {
  sunset: 16,
  ocean: 204,
  forest: 128,
  candy: 326,
  midnight: 236,
  ember: 8,
  gold: 44,
  rose: 346,
  sky: 200,
  lavender: 274,
  mint: 158,
  sand: 38,
};
const MASCOT_GLOSS_TONE = { s: [88, 82, 78, 74], l: [94, 72, 58, 48] };
const MASCOT_VARIANT_TONE = {
  gold: { s: [62, 74, 82, 78], l: [86, 64, 48, 38] },
  sand: { s: [22, 26, 30, 34], l: [96, 86, 74, 62] },
  midnight: { s: [42, 48, 52, 46], l: [28, 18, 12, 8] },
};
const MASCOT_VARIANT_STOPS = {
  ink: ['#2c2c32', '#16161a', '#0a0a0c', '#000000'],
  snow: ['#ffffff', '#f6f6f8', '#e8e8ee', '#d8d8e2'],
};
const MASCOT_CUSTOM_GRAD_DEFAULT = ['#f5d0fe', '#c084fc', '#7c3aed', '#4c1d95'];
let _mascotVariantRandResolved = '';

function resolveMascotVariantKeyFromPref() {
  const raw = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) _mascotVariantRandResolved = _mascotRandomVariantKey();
  return _mascotVariantRandResolved;
}

function resolveMascotVariantKeyFromFormValue(val) {
  const raw = String(val || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) _mascotVariantRandResolved = _mascotRandomVariantKey();
  return _mascotVariantRandResolved;
}

function _mascotRandomVariantKey() {
  const keys = Object.keys(MASCOT_VARIANT_OFFSETS).filter((k) => k !== 'custom');
  return keys[Math.floor(Math.random() * keys.length)] || 'aurora';
}

function _mascotNormalizeHex(hex, fallback) {
  const s = String(hex || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

function getMascotCustomStops() {
  return MASCOT_CUSTOM_GRAD_DEFAULT.map((fb, i) =>
    _mascotNormalizeHex(getMascotPref(`mb_mascot_grad_${i}`, fb), fb)
  );
}

function _mascotCustomStopsFromForm() {
  return MASCOT_CUSTOM_GRAD_DEFAULT.map((fb, i) => {
    const el = document.getElementById(`s-mascot-grad-${i}`);
    return _mascotNormalizeHex(el?.value, fb);
  });
}

function _mascotBodyStops(variantKey, baseHue, customStops) {
  if (variantKey === 'custom') {
    const src = customStops && customStops.length === 4 ? customStops : getMascotCustomStops();
    return src.map((c, i) => _mascotNormalizeHex(c, MASCOT_CUSTOM_GRAD_DEFAULT[i]));
  }
  if (MASCOT_VARIANT_STOPS[variantKey]) return MASCOT_VARIANT_STOPS[variantKey].slice();
  const anchor = MASCOT_VARIANT_ANCHOR[variantKey];
  const hue = anchor == null ? baseHue : anchor;
  const offs = MASCOT_VARIANT_OFFSETS[variantKey] || MASCOT_VARIANT_OFFSETS.aurora;
  const tone = MASCOT_VARIANT_TONE[variantKey] || MASCOT_GLOSS_TONE;
  return offs.map((o, i) => _mascotHslToHex(_mascotWrapHue(hue + o), tone.s[i], tone.l[i]));
}

function _paintMascotCustomGradPreview() {
  const bar = document.getElementById('s-mascot-grad-preview');
  if (!bar) return;
  const stops = _mascotCustomStopsFromForm();
  bar.style.background = `linear-gradient(90deg, ${stops[0]} 0%, ${stops[1]} 34%, ${stops[2]} 66%, ${stops[3]} 100%)`;
}

function _syncMascotCustomGradPanel() {
  const v = document.getElementById('s-mascot-variant');
  const box = document.getElementById('s-mascot-custom-grad');
  if (!box || !v) return;
  box.style.display = v.value === 'custom' ? '' : 'none';
  if (v.value === 'custom') _paintMascotCustomGradPreview();
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
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
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
  eye: ['none', 'sparkle', 'anime', 'sleepy', 'wink', 'shy', 'big', 'star', 'glow', 'retro', 'softsquare'],
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
  const anchor = MASCOT_VARIANT_ANCHOR[variantKey];
  const hue = anchor == null ? baseHue : anchor;
  const offs = MASCOT_VARIANT_OFFSETS[variantKey] || MASCOT_VARIANT_OFFSETS.aurora;
  const d = offs.map((o) => _mascotWrapHue(hue + o));
  d.forEach((v, i) => el.style.setProperty(`--m-d${i}`, String(v)));
  const stops = _mascotBodyStops(variantKey, baseHue, opts.stops);
  stops.forEach((c, i) => el.style.setProperty(`--m-c${i}`, c));
  const bored = [18, 8, -4, -16];
  bored.forEach((o, i) => el.style.setProperty(`--m-b${i}`, String(_mascotWrapHue(hue + o))));
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
  const stops = getMascotCustomStops();
  const cust = document.getElementById('cust-empty');
  const prev = document.getElementById('settings-mascot-preview-wrap');
  const gm = document.getElementById('global-mascot');
  if (cust) _applyMascotVarsToEl(cust, h, variant, { breakHue, angryHue, stops });
  if (prev) _applyMascotVarsToEl(prev, h, variant, { breakHue, angryHue, stops });
  if (gm) _applyMascotVarsToEl(gm, h, variant, { breakHue, angryHue, stops });
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
  const stops = _mascotCustomStopsFromForm();
  if (cust) _applyMascotVarsToEl(cust, h, vKey, { breakHue, angryHue, stops });
  if (prev) _applyMascotVarsToEl(prev, h, vKey, { breakHue, angryHue, stops });
  if (gm) _applyMascotVarsToEl(gm, h, vKey, { breakHue, angryHue, stops });
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
  getMascotCustomStops().forEach((hexStop, i) => {
    const gel = document.getElementById(`s-mascot-grad-${i}`);
    if (gel) gel.value = hexStop;
  });
  _syncMascotCustomGradPanel();
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
    _syncMascotCustomGradPanel();
    onLive();
  });
  for (let gi = 0; gi < 4; gi += 1) {
    const gel = document.getElementById(`s-mascot-grad-${gi}`);
    gel?.addEventListener('input', () => {
      _paintMascotCustomGradPreview();
      onLive();
    });
  }
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
  _mascotCustomStopsFromForm().forEach((hexStop, i) => {
    setMascotPref(`mb_mascot_grad_${i}`, hexStop);
  });
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
  window.toggleMimiBubbleMute = toggleMimiBubbleMute;
} catch (e) {}
