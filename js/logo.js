const MB_LOGO_DEFAULT = {
  blink: true,
  blinkMode: 'sync',
  blinkSec: 5,
  box: true,
  boxFx: 'flow',
  boxA: '',
  boxB: '',
  boxADark: '',
  boxBDark: '',
  gap: 6,
  word: '',
  word2: '',
  word2Lang: '',
  swapSec: 6,
  text: '',
  textDark: '',
  one: '#2563eb',
  oneDark: '',
  eyeL: '',
  eyeLDark: '',
  eyeR: '#2563eb',
  eyeRDark: '',
  eyeLAurora: false,
  eyeRAurora: false,
  eyeLA: '#7dd3fc',
  eyeLB: '#818cf8',
  eyeRA: '#38bdf8',
  eyeRB: '#2563eb',
  eyeLADark: '',
  eyeLBDark: '',
  eyeRADark: '',
  eyeRBDark: ''
};

const MB_LOGO_BLINK = ['sync', 'alt', 'left', 'right'];
const MB_LOGO_BOX_FX = ['flow', 'slow', 'fast', 'breath', 'drift', 'still'];
let mbLogoLive = null;

function mbLogoHex(value) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '';
}

function mbLogoPlain(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function mbLogoLang() {
  if (typeof currentLang === 'string' && (currentLang === 'de' || currentLang === 'tr')) return currentLang;
  return document.documentElement.lang === 'de' ? 'de' : 'tr';
}

function mbLogoNormalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let gap = Number(src.gap);
  if (!Number.isFinite(gap)) gap = MB_LOGO_DEFAULT.gap;
  gap = Math.max(0, Math.min(18, Math.round(gap)));
  let blinkSec = Number(src.blinkSec);
  if (!Number.isFinite(blinkSec)) blinkSec = MB_LOGO_DEFAULT.blinkSec;
  blinkSec = Math.max(2, Math.min(10, Math.round(blinkSec * 2) / 2));
  let swapSec = Number(src.swapSec);
  if (!Number.isFinite(swapSec)) swapSec = MB_LOGO_DEFAULT.swapSec;
  swapSec = Math.max(3, Math.min(12, Math.round(swapSec)));
  const blinkMode = MB_LOGO_BLINK.includes(src.blinkMode) ? src.blinkMode : MB_LOGO_DEFAULT.blinkMode;
  const boxFx = MB_LOGO_BOX_FX.includes(src.boxFx) ? src.boxFx : MB_LOGO_DEFAULT.boxFx;
  const word2Lang = src.word2Lang === 'tr' || src.word2Lang === 'de' ? src.word2Lang : '';
  return {
    blink: src.blink !== false,
    blinkMode,
    blinkSec,
    box: src.box !== false,
    boxFx,
    boxA: mbLogoHex(src.boxA),
    boxB: mbLogoHex(src.boxB),
    boxADark: mbLogoHex(src.boxADark),
    boxBDark: mbLogoHex(src.boxBDark),
    gap,
    word: mbLogoPlain(src.word),
    word2: mbLogoPlain(src.word2),
    word2Lang,
    swapSec,
    text: mbLogoHex(src.text),
    textDark: mbLogoHex(src.textDark),
    one: mbLogoHex(src.one) || MB_LOGO_DEFAULT.one,
    oneDark: mbLogoHex(src.oneDark),
    eyeL: mbLogoHex(src.eyeL),
    eyeLDark: mbLogoHex(src.eyeLDark),
    eyeR: mbLogoHex(src.eyeR) || MB_LOGO_DEFAULT.eyeR,
    eyeRDark: mbLogoHex(src.eyeRDark),
    eyeLAurora: !!src.eyeLAurora,
    eyeRAurora: !!src.eyeRAurora,
    eyeLA: mbLogoHex(src.eyeLA) || MB_LOGO_DEFAULT.eyeLA,
    eyeLB: mbLogoHex(src.eyeLB) || MB_LOGO_DEFAULT.eyeLB,
    eyeRA: mbLogoHex(src.eyeRA) || MB_LOGO_DEFAULT.eyeRA,
    eyeRB: mbLogoHex(src.eyeRB) || MB_LOGO_DEFAULT.eyeRB,
    eyeLADark: mbLogoHex(src.eyeLADark),
    eyeLBDark: mbLogoHex(src.eyeLBDark),
    eyeRADark: mbLogoHex(src.eyeRADark),
    eyeRBDark: mbLogoHex(src.eyeRBDark)
  };
}

function mbLogoSwapOn(cfg) {
  if (!cfg.word2) return false;
  if (!cfg.word2Lang) return true;
  return cfg.word2Lang === mbLogoLang();
}

function mbLogoPaintWords(cfg) {
  const word = cfg.word || 'callin';
  const swap = mbLogoSwapOn(cfg);
  document.querySelectorAll('.tb-logo-word').forEach((el) => { el.textContent = word; });
  document.querySelectorAll('.tb-logo-word2').forEach((el) => { el.textContent = cfg.word2; });
  document.querySelectorAll('.tb-logo-faces').forEach((el) => {
    el.classList.toggle('is-swap', swap);
    if (swap) el.style.setProperty('--logo-swap', (cfg.swapSec * 2) + 's');
    else el.style.removeProperty('--logo-swap');
  });
  document.querySelectorAll('.tb-logo-face.is-note').forEach((el) => {
    el.setAttribute('aria-hidden', swap ? 'false' : 'true');
  });
}

function mbLogoVar(root, name, value) {
  if (value) root.style.setProperty(name, value);
  else root.style.removeProperty(name);
}

function mbLogoLockBlink() {
  document.querySelectorAll('.tb-logo').forEach((root) => {
    const blinks = [];
    root.querySelectorAll('.tb-logo-eye').forEach((el) => {
      el.getAnimations().forEach((anim) => {
        if (anim.animationName === 'mbLogoBlink' || anim.animationName === 'mbLogoBlinkAlt') blinks.push(anim);
      });
    });
    if (blinks.length < 2 || blinks[0].startTime == null) return;
    const start = blinks[0].startTime;
    blinks.forEach((anim) => { anim.startTime = start; });
  });
}

function mbLogoApply(raw) {
  const cfg = mbLogoNormalize(raw);
  mbLogoLive = cfg;
  mbLogoPaintWords(cfg);
  document.querySelectorAll('.tb-logo').forEach((root) => {
    root.classList.toggle('is-blink', cfg.blink);
    root.classList.toggle('is-blink-alt', cfg.blink && cfg.blinkMode === 'alt');
    root.classList.toggle('is-blink-left', cfg.blink && cfg.blinkMode === 'left');
    root.classList.toggle('is-blink-right', cfg.blink && cfg.blinkMode === 'right');
    root.classList.toggle('is-box', cfg.box);
    MB_LOGO_BOX_FX.forEach((fx) => {
      root.classList.toggle('is-box-fx-' + fx, cfg.box && cfg.boxFx === fx);
    });
    root.classList.toggle('is-box-tint', cfg.box && !!(cfg.boxA && cfg.boxB));
    root.classList.toggle('is-box-tint-dark', cfg.box && !!(cfg.boxADark && cfg.boxBDark));
    root.classList.toggle('is-text', !!cfg.text);
    root.classList.toggle('is-text-dark', !!cfg.textDark);
    root.classList.toggle('is-one-dark', !!cfg.oneDark);
    root.classList.toggle('is-aurora-l', cfg.eyeLAurora);
    root.classList.toggle('is-aurora-r', cfg.eyeRAurora);
    root.style.setProperty('--logo-gap', cfg.gap + 'px');
    root.style.setProperty('--logo-blink', cfg.blinkSec + 's');
    root.style.setProperty('--logo-one', cfg.one);
    root.style.setProperty('--logo-eye-r', cfg.eyeR);
    root.style.setProperty('--logo-al-a', cfg.eyeLA);
    root.style.setProperty('--logo-al-b', cfg.eyeLB);
    root.style.setProperty('--logo-ar-a', cfg.eyeRA);
    root.style.setProperty('--logo-ar-b', cfg.eyeRB);
    mbLogoVar(root, '--logo-eye-l', cfg.eyeL);
    mbLogoVar(root, '--logo-text', cfg.text);
    mbLogoVar(root, '--logo-text-dark', cfg.textDark);
    mbLogoVar(root, '--logo-one-dark', cfg.oneDark);
    mbLogoVar(root, '--logo-eye-l-dark', cfg.eyeLDark);
    mbLogoVar(root, '--logo-eye-r-dark', cfg.eyeRDark);
    mbLogoVar(root, '--logo-al-a-dark', cfg.eyeLADark);
    mbLogoVar(root, '--logo-al-b-dark', cfg.eyeLBDark);
    mbLogoVar(root, '--logo-ar-a-dark', cfg.eyeRADark);
    mbLogoVar(root, '--logo-ar-b-dark', cfg.eyeRBDark);
    if (cfg.boxA && cfg.boxB) {
      root.style.setProperty('--logo-box-a', cfg.boxA);
      root.style.setProperty('--logo-box-b', cfg.boxB);
    } else {
      root.style.removeProperty('--logo-box-a');
      root.style.removeProperty('--logo-box-b');
    }
    if (cfg.boxADark && cfg.boxBDark) {
      root.style.setProperty('--logo-box-a-dark', cfg.boxADark);
      root.style.setProperty('--logo-box-b-dark', cfg.boxBDark);
    } else {
      root.style.removeProperty('--logo-box-a-dark');
      root.style.removeProperty('--logo-box-b-dark');
    }
  });
  requestAnimationFrame(mbLogoLockBlink);
  return cfg;
}

function mbLogoRefresh() {
  if (mbLogoLive) mbLogoApply(mbLogoLive);
}

function mbLogoFromForm() {
  const gap = document.getElementById('logo-gap');
  const auto = document.getElementById('logo-eye-l-auto');
  const left = document.getElementById('logo-eye-l');
  const textAuto = document.getElementById('logo-text-auto');
  const boxCustom = document.getElementById('logo-box-custom');
  const textDarkAuto = document.getElementById('logo-text-dark-auto');
  const oneDarkAuto = document.getElementById('logo-one-dark-auto');
  const eyeLDarkAuto = document.getElementById('logo-eye-l-dark-auto');
  const eyeRDarkAuto = document.getElementById('logo-eye-r-dark-auto');
  const boxDark = document.getElementById('logo-box-dark');
  const eyeLSame = document.getElementById('logo-eye-l-dark-same');
  const eyeRSame = document.getElementById('logo-eye-r-dark-same');
  return mbLogoNormalize({
    blink: !!document.getElementById('logo-blink')?.checked,
    blinkMode: document.getElementById('logo-blink-mode')?.value,
    blinkSec: document.getElementById('logo-blink-sec')?.value,
    box: !!document.getElementById('logo-box')?.checked,
    boxFx: document.getElementById('logo-box-fx')?.value,
    boxA: boxCustom?.checked ? document.getElementById('logo-box-a')?.value : '',
    boxB: boxCustom?.checked ? document.getElementById('logo-box-b')?.value : '',
    boxADark: boxDark?.checked ? document.getElementById('logo-box-a-dark')?.value : '',
    boxBDark: boxDark?.checked ? document.getElementById('logo-box-b-dark')?.value : '',
    gap: gap ? gap.value : MB_LOGO_DEFAULT.gap,
    word: document.getElementById('logo-word')?.value,
    word2: document.getElementById('logo-word2')?.value,
    word2Lang: document.getElementById('logo-word2-lang')?.value,
    swapSec: document.getElementById('logo-swap-sec')?.value,
    text: textAuto?.checked ? '' : (document.getElementById('logo-text')?.value || ''),
    textDark: textDarkAuto?.checked ? '' : (document.getElementById('logo-text-dark')?.value || ''),
    one: document.getElementById('logo-one')?.value,
    oneDark: oneDarkAuto?.checked ? '' : (document.getElementById('logo-one-dark')?.value || ''),
    eyeL: auto?.checked ? '' : (left?.value || ''),
    eyeLDark: eyeLDarkAuto?.checked ? '' : (document.getElementById('logo-eye-l-dark')?.value || ''),
    eyeR: document.getElementById('logo-eye-r')?.value || MB_LOGO_DEFAULT.eyeR,
    eyeRDark: eyeRDarkAuto?.checked ? '' : (document.getElementById('logo-eye-r-dark')?.value || ''),
    eyeLAurora: !!document.getElementById('logo-eye-l-aurora')?.checked,
    eyeRAurora: !!document.getElementById('logo-eye-r-aurora')?.checked,
    eyeLA: document.getElementById('logo-eye-l-a')?.value,
    eyeLB: document.getElementById('logo-eye-l-b')?.value,
    eyeRA: document.getElementById('logo-eye-r-a')?.value,
    eyeRB: document.getElementById('logo-eye-r-b')?.value,
    eyeLADark: eyeLSame?.checked ? '' : (document.getElementById('logo-eye-l-a-dark')?.value || ''),
    eyeLBDark: eyeLSame?.checked ? '' : (document.getElementById('logo-eye-l-b-dark')?.value || ''),
    eyeRADark: eyeRSame?.checked ? '' : (document.getElementById('logo-eye-r-a-dark')?.value || ''),
    eyeRBDark: eyeRSame?.checked ? '' : (document.getElementById('logo-eye-r-b-dark')?.value || '')
  });
}

function mbLogoFillForm(raw) {
  const cfg = mbLogoNormalize(raw);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
    return el;
  };
  set('logo-blink', cfg.blink);
  set('logo-blink-mode', cfg.blinkMode);
  set('logo-blink-sec', String(cfg.blinkSec));
  set('logo-box', cfg.box);
  set('logo-box-fx', cfg.boxFx);
  set('logo-box-custom', !!(cfg.boxA && cfg.boxB));
  set('logo-box-a', cfg.boxA || '#e8eef8');
  set('logo-box-b', cfg.boxB || '#2563eb');
  set('logo-box-dark', !!(cfg.boxADark && cfg.boxBDark));
  set('logo-box-a-dark', cfg.boxADark || '#121826');
  set('logo-box-b-dark', cfg.boxBDark || '#2563eb');
  set('logo-gap', String(cfg.gap));
  set('logo-word', cfg.word);
  set('logo-word2', cfg.word2);
  set('logo-word2-lang', cfg.word2Lang);
  set('logo-swap-sec', String(cfg.swapSec));
  set('logo-text-auto', !cfg.text);
  set('logo-text', cfg.text || '#0f172a');
  set('logo-text-dark-auto', !cfg.textDark);
  set('logo-text-dark', cfg.textDark || '#f8fafc');
  set('logo-one', cfg.one);
  set('logo-one-dark-auto', !cfg.oneDark);
  set('logo-one-dark', cfg.oneDark || cfg.one);
  set('logo-eye-l-auto', !cfg.eyeL);
  set('logo-eye-l', cfg.eyeL || '#0f172a');
  set('logo-eye-l-dark-auto', !cfg.eyeLDark);
  set('logo-eye-l-dark', cfg.eyeLDark || '#f8fafc');
  set('logo-eye-r', cfg.eyeR);
  set('logo-eye-r-dark-auto', !cfg.eyeRDark);
  set('logo-eye-r-dark', cfg.eyeRDark || cfg.eyeR);
  set('logo-eye-l-aurora', cfg.eyeLAurora);
  set('logo-eye-r-aurora', cfg.eyeRAurora);
  set('logo-eye-l-a', cfg.eyeLA);
  set('logo-eye-l-b', cfg.eyeLB);
  set('logo-eye-r-a', cfg.eyeRA);
  set('logo-eye-r-b', cfg.eyeRB);
  set('logo-eye-l-dark-same', !(cfg.eyeLADark && cfg.eyeLBDark));
  set('logo-eye-l-a-dark', cfg.eyeLADark || cfg.eyeLA);
  set('logo-eye-l-b-dark', cfg.eyeLBDark || cfg.eyeLB);
  set('logo-eye-r-dark-same', !(cfg.eyeRADark && cfg.eyeRBDark));
  set('logo-eye-r-a-dark', cfg.eyeRADark || cfg.eyeRA);
  set('logo-eye-r-b-dark', cfg.eyeRBDark || cfg.eyeRB);
  mbLogoSyncLocks();
}

function mbLogoSyncLocks() {
  const lock = (boxId, inputIds, whenOn) => {
    const on = !!document.getElementById(boxId)?.checked;
    inputIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = whenOn ? !on : on;
    });
  };
  const left = document.getElementById('logo-eye-l');
  const auto = document.getElementById('logo-eye-l-auto');
  if (left && auto) left.disabled = !!auto.checked;
  const text = document.getElementById('logo-text');
  const textAuto = document.getElementById('logo-text-auto');
  if (text && textAuto) text.disabled = !!textAuto.checked;
  lock('logo-box-custom', ['logo-box-a', 'logo-box-b'], true);
  lock('logo-eye-l-aurora', ['logo-eye-l-a', 'logo-eye-l-b'], true);
  lock('logo-eye-r-aurora', ['logo-eye-r-a', 'logo-eye-r-b'], true);
  lock('logo-text-dark-auto', ['logo-text-dark'], false);
  lock('logo-one-dark-auto', ['logo-one-dark'], false);
  lock('logo-eye-l-dark-auto', ['logo-eye-l-dark'], false);
  lock('logo-eye-r-dark-auto', ['logo-eye-r-dark'], false);
  lock('logo-box-dark', ['logo-box-a-dark', 'logo-box-b-dark'], true);
  lock('logo-eye-l-dark-same', ['logo-eye-l-a-dark', 'logo-eye-l-b-dark'], false);
  lock('logo-eye-r-dark-same', ['logo-eye-r-a-dark', 'logo-eye-r-b-dark'], false);
  const mode = document.getElementById('logo-blink-mode');
  const pace = document.getElementById('logo-blink-sec');
  const blinking = !!document.getElementById('logo-blink')?.checked;
  if (mode) mode.disabled = !blinking;
  if (pace) pace.disabled = !blinking;
  const boxFx = document.getElementById('logo-box-fx');
  if (boxFx) boxFx.disabled = !document.getElementById('logo-box')?.checked;
  const second = !!mbLogoPlain(document.getElementById('logo-word2')?.value);
  const lang = document.getElementById('logo-word2-lang');
  const hold = document.getElementById('logo-swap-sec');
  if (lang) lang.disabled = !second;
  if (hold) hold.disabled = !second;
}

function mbLogoReadCache() {
  try {
    const raw = localStorage.getItem('mb_logo');
    return raw ? mbLogoNormalize(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

async function mbLogoBootRemote() {
  if (typeof sb !== 'function' || typeof currentUser === 'undefined' || !currentUser) return;
  let logo = null;
  try {
    const fid = currentUser.firm_id;
    const path = fid
      ? `firms?id=eq.${fid}&select=settings`
      : 'firms?select=settings&limit=1';
    const rows = await sb(path);
    logo = rows?.[0]?.settings?.logo || null;
  } catch (e) {
    return;
  }
  if (!logo) return;
  const cfg = mbLogoNormalize(logo);
  try { localStorage.setItem('mb_logo', JSON.stringify(cfg)); } catch (e) {}
  const card = document.getElementById('logo-settings-card');
  if (card && card.contains(document.activeElement)) return;
  mbLogoFillForm(cfg);
  mbLogoApply(cfg);
}

async function mbSaveLogoSettings() {
  const cfg = mbLogoFromForm();
  mbLogoApply(cfg);
  try { localStorage.setItem('mb_logo', JSON.stringify(cfg)); } catch (e) {}
  if (typeof sb !== 'function') return;
  try {
    const firms = await sb('firms?select=id,settings');
    for (const firm of firms || []) {
      if (!firm?.id) continue;
      const prev = firm.settings && typeof firm.settings === 'object' ? firm.settings : {};
      await sb(`firms?id=eq.${firm.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...prev, logo: cfg } })
      });
    }
    if (typeof toast === 'function') toast('Logo kaydedildi', 'success');
  } catch (e) {
    if (typeof toast === 'function') toast('Logo bu oturumda duruyor, kayıt yazılamadı', 'warn');
  }
}

function mbLogoBind() {
  const ids = [
    'logo-blink', 'logo-blink-mode', 'logo-blink-sec', 'logo-box', 'logo-box-fx', 'logo-box-custom',
    'logo-box-a', 'logo-box-b', 'logo-gap', 'logo-word', 'logo-word2', 'logo-word2-lang', 'logo-swap-sec',
    'logo-text', 'logo-text-auto', 'logo-one',
    'logo-eye-l', 'logo-eye-l-auto', 'logo-eye-r', 'logo-eye-l-aurora', 'logo-eye-r-aurora',
    'logo-eye-l-a', 'logo-eye-l-b', 'logo-eye-r-a', 'logo-eye-r-b',
    'logo-text-dark', 'logo-text-dark-auto', 'logo-one-dark', 'logo-one-dark-auto',
    'logo-eye-l-dark', 'logo-eye-l-dark-auto', 'logo-eye-r-dark', 'logo-eye-r-dark-auto',
    'logo-box-dark', 'logo-box-a-dark', 'logo-box-b-dark',
    'logo-eye-l-dark-same', 'logo-eye-l-a-dark', 'logo-eye-l-b-dark',
    'logo-eye-r-dark-same', 'logo-eye-r-a-dark', 'logo-eye-r-b-dark'
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const run = () => {
      mbLogoSyncLocks();
      mbLogoApply(mbLogoFromForm());
    };
    el.addEventListener('input', run);
    el.addEventListener('change', run);
  });
}

mbLogoApply(mbLogoReadCache() || MB_LOGO_DEFAULT);
mbLogoFillForm(mbLogoReadCache() || MB_LOGO_DEFAULT);
mbLogoBind();
