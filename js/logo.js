const MB_LOGO_DEFAULT = {
  blink: true,
  box: true,
  gap: 6,
  eyeL: '',
  eyeR: '#2563eb',
  eyeLAurora: false,
  eyeRAurora: false
};

function mbLogoHex(value) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '';
}

function mbLogoNormalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let gap = Number(src.gap);
  if (!Number.isFinite(gap)) gap = MB_LOGO_DEFAULT.gap;
  gap = Math.max(0, Math.min(18, Math.round(gap)));
  return {
    blink: src.blink !== false,
    box: src.box !== false,
    gap,
    eyeL: mbLogoHex(src.eyeL),
    eyeR: mbLogoHex(src.eyeR) || MB_LOGO_DEFAULT.eyeR,
    eyeLAurora: !!src.eyeLAurora,
    eyeRAurora: !!src.eyeRAurora
  };
}

function mbLogoApply(raw) {
  const cfg = mbLogoNormalize(raw);
  document.querySelectorAll('.tb-logo').forEach((root) => {
    root.classList.toggle('is-blink', cfg.blink);
    root.classList.toggle('is-box', cfg.box);
    root.classList.toggle('is-aurora-l', cfg.eyeLAurora);
    root.classList.toggle('is-aurora-r', cfg.eyeRAurora);
    root.style.setProperty('--logo-gap', cfg.gap + 'px');
    if (cfg.eyeL) root.style.setProperty('--logo-eye-l', cfg.eyeL);
    else root.style.removeProperty('--logo-eye-l');
    root.style.setProperty('--logo-eye-r', cfg.eyeR);
  });
  return cfg;
}

function mbLogoFromForm() {
  const gap = document.getElementById('logo-gap');
  const auto = document.getElementById('logo-eye-l-auto');
  const left = document.getElementById('logo-eye-l');
  return mbLogoNormalize({
    blink: !!document.getElementById('logo-blink')?.checked,
    box: !!document.getElementById('logo-box')?.checked,
    gap: gap ? gap.value : MB_LOGO_DEFAULT.gap,
    eyeL: auto?.checked ? '' : (left?.value || ''),
    eyeR: document.getElementById('logo-eye-r')?.value || MB_LOGO_DEFAULT.eyeR,
    eyeLAurora: !!document.getElementById('logo-eye-l-aurora')?.checked,
    eyeRAurora: !!document.getElementById('logo-eye-r-aurora')?.checked
  });
}

function mbLogoFillForm(raw) {
  const cfg = mbLogoNormalize(raw);
  const blink = document.getElementById('logo-blink');
  const box = document.getElementById('logo-box');
  const gap = document.getElementById('logo-gap');
  const left = document.getElementById('logo-eye-l');
  const auto = document.getElementById('logo-eye-l-auto');
  const right = document.getElementById('logo-eye-r');
  const al = document.getElementById('logo-eye-l-aurora');
  const ar = document.getElementById('logo-eye-r-aurora');
  if (blink) blink.checked = cfg.blink;
  if (box) box.checked = cfg.box;
  if (gap) gap.value = String(cfg.gap);
  if (left) left.value = cfg.eyeL || '#0f172a';
  if (auto) auto.checked = !cfg.eyeL;
  if (left) left.disabled = !cfg.eyeL;
  if (right) right.value = cfg.eyeR;
  if (al) al.checked = cfg.eyeLAurora;
  if (ar) ar.checked = cfg.eyeRAurora;
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
  const ids = ['logo-blink', 'logo-box', 'logo-gap', 'logo-eye-l', 'logo-eye-l-auto', 'logo-eye-r', 'logo-eye-l-aurora', 'logo-eye-r-aurora'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 'logo-eye-l-auto') {
        const left = document.getElementById('logo-eye-l');
        if (left) left.disabled = !!el.checked;
      }
      mbLogoApply(mbLogoFromForm());
    });
  });
}

mbLogoApply(mbLogoReadCache() || MB_LOGO_DEFAULT);
mbLogoFillForm(mbLogoReadCache() || MB_LOGO_DEFAULT);
mbLogoBind();
