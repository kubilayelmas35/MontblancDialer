const MB_LOGO_DEFAULT = {
  blink: true,
  blinkMode: 'sync',
  blinkSec: 5,
  box: true,
  boxA: '',
  boxB: '',
  gap: 6,
  text: '',
  one: '#2563eb',
  eyeL: '',
  eyeR: '#2563eb',
  eyeLAurora: false,
  eyeRAurora: false,
  eyeLA: '#7dd3fc',
  eyeLB: '#818cf8',
  eyeRA: '#38bdf8',
  eyeRB: '#2563eb'
};

const MB_LOGO_BLINK = ['sync', 'alt', 'left', 'right'];

function mbLogoHex(value) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '';
}

function mbLogoNormalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let gap = Number(src.gap);
  if (!Number.isFinite(gap)) gap = MB_LOGO_DEFAULT.gap;
  gap = Math.max(0, Math.min(18, Math.round(gap)));
  let blinkSec = Number(src.blinkSec);
  if (!Number.isFinite(blinkSec)) blinkSec = MB_LOGO_DEFAULT.blinkSec;
  blinkSec = Math.max(2, Math.min(10, Math.round(blinkSec * 2) / 2));
  const blinkMode = MB_LOGO_BLINK.includes(src.blinkMode) ? src.blinkMode : MB_LOGO_DEFAULT.blinkMode;
  return {
    blink: src.blink !== false,
    blinkMode,
    blinkSec,
    box: src.box !== false,
    boxA: mbLogoHex(src.boxA),
    boxB: mbLogoHex(src.boxB),
    gap,
    text: mbLogoHex(src.text),
    one: mbLogoHex(src.one) || MB_LOGO_DEFAULT.one,
    eyeL: mbLogoHex(src.eyeL),
    eyeR: mbLogoHex(src.eyeR) || MB_LOGO_DEFAULT.eyeR,
    eyeLAurora: !!src.eyeLAurora,
    eyeRAurora: !!src.eyeRAurora,
    eyeLA: mbLogoHex(src.eyeLA) || MB_LOGO_DEFAULT.eyeLA,
    eyeLB: mbLogoHex(src.eyeLB) || MB_LOGO_DEFAULT.eyeLB,
    eyeRA: mbLogoHex(src.eyeRA) || MB_LOGO_DEFAULT.eyeRA,
    eyeRB: mbLogoHex(src.eyeRB) || MB_LOGO_DEFAULT.eyeRB
  };
}

function mbLogoApply(raw) {
  const cfg = mbLogoNormalize(raw);
  document.querySelectorAll('.tb-logo').forEach((root) => {
    root.classList.toggle('is-blink', cfg.blink);
    root.classList.toggle('is-blink-alt', cfg.blink && cfg.blinkMode === 'alt');
    root.classList.toggle('is-blink-left', cfg.blink && cfg.blinkMode === 'left');
    root.classList.toggle('is-blink-right', cfg.blink && cfg.blinkMode === 'right');
    root.classList.toggle('is-box', cfg.box);
    root.classList.toggle('is-box-tint', cfg.box && !!(cfg.boxA && cfg.boxB));
    root.classList.toggle('is-text', !!cfg.text);
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
    if (cfg.eyeL) root.style.setProperty('--logo-eye-l', cfg.eyeL);
    else root.style.removeProperty('--logo-eye-l');
    if (cfg.text) root.style.setProperty('--logo-text', cfg.text);
    else root.style.removeProperty('--logo-text');
    if (cfg.boxA && cfg.boxB) {
      root.style.setProperty('--logo-box-a', cfg.boxA);
      root.style.setProperty('--logo-box-b', cfg.boxB);
    } else {
      root.style.removeProperty('--logo-box-a');
      root.style.removeProperty('--logo-box-b');
    }
  });
  return cfg;
}

function mbLogoFromForm() {
  const gap = document.getElementById('logo-gap');
  const auto = document.getElementById('logo-eye-l-auto');
  const left = document.getElementById('logo-eye-l');
  const textAuto = document.getElementById('logo-text-auto');
  const boxCustom = document.getElementById('logo-box-custom');
  return mbLogoNormalize({
    blink: !!document.getElementById('logo-blink')?.checked,
    blinkMode: document.getElementById('logo-blink-mode')?.value,
    blinkSec: document.getElementById('logo-blink-sec')?.value,
    box: !!document.getElementById('logo-box')?.checked,
    boxA: boxCustom?.checked ? document.getElementById('logo-box-a')?.value : '',
    boxB: boxCustom?.checked ? document.getElementById('logo-box-b')?.value : '',
    gap: gap ? gap.value : MB_LOGO_DEFAULT.gap,
    text: textAuto?.checked ? '' : (document.getElementById('logo-text')?.value || ''),
    one: document.getElementById('logo-one')?.value,
    eyeL: auto?.checked ? '' : (left?.value || ''),
    eyeR: document.getElementById('logo-eye-r')?.value || MB_LOGO_DEFAULT.eyeR,
    eyeLAurora: !!document.getElementById('logo-eye-l-aurora')?.checked,
    eyeRAurora: !!document.getElementById('logo-eye-r-aurora')?.checked,
    eyeLA: document.getElementById('logo-eye-l-a')?.value,
    eyeLB: document.getElementById('logo-eye-l-b')?.value,
    eyeRA: document.getElementById('logo-eye-r-a')?.value,
    eyeRB: document.getElementById('logo-eye-r-b')?.value
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
  set('logo-box-custom', !!(cfg.boxA && cfg.boxB));
  set('logo-box-a', cfg.boxA || '#e8eef8');
  set('logo-box-b', cfg.boxB || '#2563eb');
  set('logo-gap', String(cfg.gap));
  set('logo-text-auto', !cfg.text);
  set('logo-text', cfg.text || '#0f172a');
  set('logo-one', cfg.one);
  set('logo-eye-l-auto', !cfg.eyeL);
  set('logo-eye-l', cfg.eyeL || '#0f172a');
  set('logo-eye-r', cfg.eyeR);
  set('logo-eye-l-aurora', cfg.eyeLAurora);
  set('logo-eye-r-aurora', cfg.eyeRAurora);
  set('logo-eye-l-a', cfg.eyeLA);
  set('logo-eye-l-b', cfg.eyeLB);
  set('logo-eye-r-a', cfg.eyeRA);
  set('logo-eye-r-b', cfg.eyeRB);
  mbLogoSyncLocks();
}

function mbLogoSyncLocks() {
  const lock = (boxId, inputIds) => {
    const on = !!document.getElementById(boxId)?.checked;
    inputIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !on;
    });
  };
  const left = document.getElementById('logo-eye-l');
  const auto = document.getElementById('logo-eye-l-auto');
  if (left && auto) left.disabled = !!auto.checked;
  const text = document.getElementById('logo-text');
  const textAuto = document.getElementById('logo-text-auto');
  if (text && textAuto) text.disabled = !!textAuto.checked;
  lock('logo-box-custom', ['logo-box-a', 'logo-box-b']);
  lock('logo-eye-l-aurora', ['logo-eye-l-a', 'logo-eye-l-b']);
  lock('logo-eye-r-aurora', ['logo-eye-r-a', 'logo-eye-r-b']);
  const mode = document.getElementById('logo-blink-mode');
  const pace = document.getElementById('logo-blink-sec');
  const blinking = !!document.getElementById('logo-blink')?.checked;
  if (mode) mode.disabled = !blinking;
  if (pace) pace.disabled = !blinking;
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
    'logo-blink', 'logo-blink-mode', 'logo-blink-sec', 'logo-box', 'logo-box-custom',
    'logo-box-a', 'logo-box-b', 'logo-gap', 'logo-text', 'logo-text-auto', 'logo-one',
    'logo-eye-l', 'logo-eye-l-auto', 'logo-eye-r', 'logo-eye-l-aurora', 'logo-eye-r-aurora',
    'logo-eye-l-a', 'logo-eye-l-b', 'logo-eye-r-a', 'logo-eye-r-b'
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
