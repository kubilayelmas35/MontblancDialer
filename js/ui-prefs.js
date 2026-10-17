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
    if (Array.isArray(remote.dash_rows) && typeof mbDashRowKey === 'function' && typeof MB_DASH_ROWS !== 'undefined') {
      const keys = remote.dash_rows.filter((key) => MB_DASH_ROWS.includes(key));
      try { localStorage.setItem(mbDashRowKey(), JSON.stringify(keys)); } catch (e) {}
      if (typeof mbApplyDashRowOrder === 'function') mbApplyDashRowOrder();
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
