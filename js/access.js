// Sayfa, rol ve menü görünürlüğü. Yeni bir ekran yalnızca buraya eklenir.
const MB_ROLES = [
  { key: 'super_admin', label: 'Süper Admin', color: 'var(--red)' },
  { key: 'admin', label: 'Admin', color: 'var(--accent)' },
  { key: 'firm_admin', label: 'Firma Admin', color: 'var(--accent)' },
  { key: 'agent', label: 'Agent', color: 'var(--green)' },
  { key: 'qc', label: 'QC', color: 'var(--yellow)' },
  { key: 'field_agent', label: 'Saha Elemanı', color: 'var(--accent-2)' },
];

const MB_PAGES = [
  { key: 'dashboard', label: 'Özet', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc', 'field_agent'] },
  { key: 'campaigns', label: 'Kampanyalar', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'callhistory', label: 'Çağrı Geçmişi', roles: ['super_admin', 'admin', 'firm_admin', 'qc'] },
  { key: 'stats', label: 'İstatistikler', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'agents', label: 'Personeller', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'firms', label: 'Firmalar', roles: ['super_admin'] },
  { key: 'firmdesk', label: 'Yönetim', roles: ['super_admin', 'admin', 'firm_admin'], inPerms: false },
  { key: 'settings', label: 'Ayarlar', roles: ['super_admin', 'admin', 'firm_admin', 'agent'] },
  { key: 'takvim', label: 'Takvim', roles: ['super_admin', 'admin', 'firm_admin', 'agent'] },
  { key: 'qc', label: 'Kalite Kontrol', roles: ['super_admin', 'admin', 'firm_admin', 'qc'] },
  { key: 'wiedervorlage', label: 'Aranacaklar', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc'] },
  { key: 'dialer', label: 'Dialer', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc'] },
  { key: 'field', label: 'Saha görevlerim', roles: ['field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'myhistory', label: 'Geçmişim', roles: ['agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'leave', label: 'İzin & Devam', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc', 'field_agent'] },
  { key: 'competition', label: 'Ayın elemanı', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc', 'field_agent'] },
  { key: 'muhasebe', label: 'Muhasebe', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'maasim', label: 'Maaşım', roles: ['agent', 'qc', 'field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'performansim', label: 'Performansım', roles: ['agent', 'qc', 'field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'export', label: 'Dışa aktarım', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'performance', label: 'Personel performans', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'supervisor', label: 'Canlı Ekran', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'jobmarket', label: 'İş Platformu', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'fieldops', label: 'Saha Operasyon', roles: ['super_admin', 'admin', 'firm_admin'] },
];

const MB_CHROME = [
  { id: 'tb-pills', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'tb-live-btn', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'sb-settings', roles: ['super_admin'] },
  { id: 'telnyx-settings', roles: ['super_admin'] },
  { id: 'mesai-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'chat-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'field-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'notif-settings-card', roles: ['admin', 'super_admin', 'firm_admin', 'agent'] },
  { id: 'feature-flags-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'job-permissions-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { selector: '#page-settings .card:has(#s-google-key)', roles: ['super_admin'] },
];

const MB_NAV_FLAGS = [
  { id: 'nav-field-btn', flag: 'field_module_enabled' },
  { id: 'nav-jobs-btn', roles: ['admin', 'firm_admin', 'super_admin'], flag: 'job_market_enabled' },
  { id: 'tb-notif-btn', flag: 'notification_center_enabled' },
];

const MB_STAFF_ROLES = ['agent', 'qc', 'field_agent'];

const BUILTIN_ROLES = MB_ROLES.map((role) => ({
  key: role.key,
  label: role.label,
  color: role.color,
  builtin: true,
  perms: MB_PAGES.filter((page) => page.inPerms !== false && page.roles.includes(role.key)).map((page) => page.key),
}));

const ALL_PAGES = MB_PAGES.filter((page) => page.inPerms !== false).map((page) => ({ key: page.key, label: page.label }));

function mbRoleLabel(role) {
  return MB_ROLES.find((item) => item.key === role)?.label || role || '';
}

function mbKnownRoles() {
  return MB_ROLES.map((role) => role.key);
}

function mbHomePage(role) {
  if (mbIsFirmAdmin(role)) return 'dashboard';
  if (role === 'qc') return 'qc';
  if (role === 'field_agent') return 'field';
  return 'dialer';
}

function mbIsSuperAdmin(role) {
  const r = arguments.length ? role : currentUser?.role;
  return r === 'super_admin';
}

function mbIsFirmAdmin(role) {
  const r = arguments.length ? role : currentUser?.role;
  return ['admin', 'firm_admin', 'super_admin'].includes(r || '');
}

const MB_PERM_REV = 2;
const MB_PERMS_SINCE_REV2 = ['supervisor', 'jobmarket', 'fieldops'];

function mbMergeStoredPerms(list, role, settings) {
  const saved = Array.isArray(list) ? [...list] : [];
  if (Number(settings?.role_permissions_rev || 0) >= MB_PERM_REV) return saved;
  const extra = (BUILTIN_ROLES.find((item) => item.key === role)?.perms || [])
    .filter((key) => MB_PERMS_SINCE_REV2.includes(key) && !saved.includes(key));
  return [...saved, ...extra];
}

function mbFlagAllows(flagKey) {
  if (!flagKey) return true;
  if (typeof _featureFlagsCache === 'undefined') return true;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  const flags = fid ? _featureFlagsCache[fid] : null;
  if (!flags) return true;
  return flags[flagKey] !== false;
}

function mbPageVisible(page, role) {
  if (!page || !page.roles.includes(role)) return false;
  if (page.inPerms === false) return true;
  if (['myhistory', 'field', 'maasim', 'performansim'].includes(page.key)) return true;
  if (typeof userHasPagePerm === 'function') return userHasPagePerm(page.key);
  return true;
}

function openNavTakvim() {
  if ((currentUser?.role || '') === 'agent' && typeof openTakvimOverlay === 'function') {
    openTakvimOverlay();
    return;
  }
  navigate('takvim');
}

function mbApplyNavAccess() {
  const role = currentUser?.role || '';

  document.querySelectorAll('.sb-item').forEach((btn) => {
    const action = String(btn.getAttribute('onclick') || '');
    if (action.includes('doLogout')) return;
    const match = action.match(/navigate\('([a-z0-9_]+)'\)/);
    const report = action.match(/openStatsReport\('([a-z0-9_]+)'\)/);
    const pageKey = report ? 'stats' : (match ? match[1] : (action.includes('openNavTakvim') ? 'takvim' : ''));
    if (!pageKey) return;
    const page = MB_PAGES.find((item) => item.key === pageKey);
    if (!page) return;
    const show = mbPageVisible(page, role);
    btn.style.display = show ? '' : 'none';
  });

  MB_CHROME.forEach((item) => {
    const el = item.id ? document.getElementById(item.id) : document.querySelector(item.selector);
    if (!el) return;
    el.style.display = item.roles.includes(role) ? '' : 'none';
  });

  MB_NAV_FLAGS.forEach((rule) => {
    const el = document.getElementById(rule.id);
    if (!el || el.style.display === 'none') return;
    if (rule.roles && !rule.roles.includes(role)) return;
    if (!mbFlagAllows(rule.flag)) el.style.display = 'none';
  });

  const dialerBtn = document.getElementById('nav-dialer-btn');
  if (dialerBtn && dialerBtn.style.display !== 'none') {
    const dialerFlag = mbIsFirmAdmin(role) ? 'admin_dialer_enabled' : (role === 'qc' ? 'qc_dialer_enabled' : '');
    if (dialerFlag && !mbFlagAllows(dialerFlag)) dialerBtn.style.display = 'none';
  }

  const allowTakvim = mbPageVisible(MB_PAGES.find((page) => page.key === 'takvim'), role);
  const topTakvim = document.getElementById('takvim-topbar-btn');
  if (topTakvim) topTakvim.style.display = allowTakvim ? '' : 'none';
  if (typeof mbSyncSettingsTabs === 'function') mbSyncSettingsTabs();
  if (typeof syncDidVisibility === 'function') syncDidVisibility();
  mbRestoreSbGroups();
}

function mbSbGroupState() {
  try {
    const raw = JSON.parse(localStorage.getItem('mb_sb_groups') || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function mbRestoreSbGroups() {
  const saved = mbSbGroupState();
  document.querySelectorAll('.sb-group').forEach((group) => {
    const key = group.getAttribute('data-sb-group') || '';
    const items = [...group.querySelectorAll('.sb-sub > .sb-item')];
    const visible = items.filter((el) => el.style.display !== 'none');
    group.classList.toggle('is-empty', visible.length === 0);
    const hasActive = visible.some((el) => el.classList.contains('active'));
    const stored = saved[key];
    const open = hasActive || stored === true || (stored !== false && key === 'work');
    group.classList.toggle('is-collapsed', !open);
  });
}

function mbNavItemLabel(btn) {
  const span = btn.querySelector('span[data-tr]') || btn.querySelector('span:not(.sb-item-icon):not(.sb-badge)');
  const tr = span?.getAttribute('data-tr') || '';
  const de = span?.getAttribute('data-de') || '';
  const text = span?.textContent || '';
  return `${tr} ${de} ${text}`.toLocaleLowerCase('tr');
}

function mbFilterNav(raw) {
  const q = String(raw || '').trim().toLocaleLowerCase('tr');
  const sidebar = document.getElementById('sidebar');
  const searching = q.length > 0;
  sidebar?.classList.toggle('is-nav-search', searching);
  const items = [...document.querySelectorAll('#sidebar .sb-item')];
  let hits = 0;
  items.forEach((btn) => {
    const allowed = btn.style.display !== 'none';
    const label = mbNavItemLabel(btn);
    const match = !searching || (allowed && label.includes(q));
    btn.classList.toggle('is-nav-miss', searching && !match);
    if (match && allowed) hits += 1;
  });
  document.querySelectorAll('#sidebar .sb-group, #sidebar .sb-section').forEach((box) => {
    if (box.classList.contains('sb-footer')) return;
    const kids = [...box.querySelectorAll(':scope > .sb-sub > .sb-item, :scope > .sb-item')];
    if (!kids.length) return;
    const any = kids.some((btn) => btn.style.display !== 'none' && !btn.classList.contains('is-nav-miss'));
    box.classList.toggle('is-nav-miss', searching && !any);
  });
  const empty = document.getElementById('sb-nav-empty');
  if (empty) empty.hidden = !(searching && hits === 0);
}

function mbNavSearchKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const input = document.getElementById('sb-nav-search');
    if (input) input.value = '';
    mbFilterNav('');
    return;
  }
  if (e.key !== 'Enter') return;
  if (!String(document.getElementById('sb-nav-search')?.value || '').trim()) return;
  e.preventDefault();
  const hit = [...document.querySelectorAll('#sidebar .sb-item')].find((btn) => {
    return btn.style.display !== 'none' && !btn.classList.contains('is-nav-miss');
  });
  if (hit) hit.click();
}

function mbClearNavSearch() {
  const input = document.getElementById('sb-nav-search');
  if (input && input.value) input.value = '';
  if (document.getElementById('sidebar')?.classList.contains('is-nav-search')) mbFilterNav('');
}

function mbBootPage() {
  const home = typeof mbHomePage === 'function' ? mbHomePage(currentUser?.role) : 'dashboard';
  let saved = '';
  try { saved = localStorage.getItem('mb_last_page') || ''; } catch (e) { return home; }
  if (!saved || !document.getElementById(`page-${saved}`)) return home;
  const role = currentUser?.role || '';
  if (typeof MB_PAGES !== 'undefined' && typeof mbPageVisible === 'function') {
    const page = MB_PAGES.find((item) => item.key === saved);
    if (page && !mbPageVisible(page, role)) return home;
  }
  if (saved === 'stats') {
    try { window._statsReport = localStorage.getItem('mb_last_report') || window._statsReport || 'overview'; } catch (e) {}
  }
  return saved;
}

function toggleSbGroup(btn) {
  const group = btn?.closest?.('.sb-group');
  if (!group) return;
  group.classList.toggle('is-collapsed');
  const key = group.getAttribute('data-sb-group') || '';
  const saved = mbSbGroupState();
  saved[key] = !group.classList.contains('is-collapsed');
  try { localStorage.setItem('mb_sb_groups', JSON.stringify(saved)); } catch (e) {}
}

try { window.toggleSbGroup = toggleSbGroup; } catch (e) {}
