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
  { key: 'queues', label: 'Kuyruklar', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'geocon', label: 'GeoCon', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'tour', label: 'Callin', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'callhistory', label: 'Çağrı geçmişi', roles: ['super_admin', 'admin', 'firm_admin', 'qc'] },
  { key: 'stats', label: 'İstatistikler', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'agents', label: 'Personeller', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'firms', label: 'Firmalar', roles: ['super_admin'] },
  { key: 'spend', label: 'Giderler', roles: ['super_admin'] },
  { key: 'firmdesk', label: 'Yönetim', roles: ['super_admin', 'admin', 'firm_admin'], inPerms: false },
  { key: 'settings', label: 'Ayarlar', roles: ['super_admin', 'admin', 'firm_admin', 'agent'] },
  { key: 'takvim', label: 'Takvim', roles: ['super_admin', 'admin', 'firm_admin', 'agent'] },
  { key: 'qc', label: 'Kalite kontrol', roles: ['super_admin', 'admin', 'firm_admin', 'qc'] },
  { key: 'wiedervorlage', label: 'Aranacaklar', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc'] },
  { key: 'dialer', label: 'Dialer', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc'] },
  { key: 'field', label: 'Saha görevlerim', roles: ['field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'myhistory', label: 'Geçmişim', roles: ['agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'leave', label: 'İzin & devam', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc', 'field_agent'] },
  { key: 'competition', label: 'Ayın elemanı', roles: ['super_admin', 'admin', 'firm_admin', 'agent', 'qc', 'field_agent'] },
  { key: 'muhasebe', label: 'Muhasebe', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'maasim', label: 'Maaşım', roles: ['agent', 'qc', 'field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'performansim', label: 'Performansım', roles: ['agent', 'qc', 'field_agent', 'super_admin', 'admin', 'firm_admin'] },
  { key: 'export', label: 'Dışa aktarım', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'performance', label: 'Personel performans', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'supervisor', label: 'Canlı ekran', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'jobmarket', label: 'İş platformu', roles: ['super_admin', 'admin', 'firm_admin'] },
  { key: 'fieldops', label: 'Saha operasyon', roles: ['super_admin', 'admin', 'firm_admin'] },
];

const MB_CHROME = [
  { id: 'tb-pills', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'tb-live-btn', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'sb-settings', roles: ['super_admin'] },
  { id: 'mesai-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'chat-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'field-settings-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'notif-settings-card', roles: ['admin', 'super_admin', 'firm_admin', 'agent'] },
  { id: 'feature-flags-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'job-permissions-card', roles: ['admin', 'super_admin', 'firm_admin'] },
  { id: 'logo-settings-card', roles: ['super_admin'] },
  { id: 'mascot-default-card', roles: ['super_admin'] },
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

const MB_PERM_REV = 6;
const MB_PERM_GRANTS = [
  { rev: 2, keys: ['supervisor', 'jobmarket', 'fieldops'] },
  { rev: 3, keys: ['geocon'] },
  { rev: 4, keys: ['tour'] },
  { rev: 5, keys: ['queues'] },
  { rev: 6, keys: ['spend'] },
];

function mbMergeStoredPerms(list, role, settings) {
  const saved = Array.isArray(list) ? [...list] : [];
  const storedRev = Number(settings?.role_permissions_rev || 0);
  if (storedRev >= MB_PERM_REV) return saved;
  const builtin = BUILTIN_ROLES.find((item) => item.key === role)?.perms || [];
  const extra = MB_PERM_GRANTS
    .filter((grant) => storedRev < grant.rev)
    .flatMap((grant) => grant.keys)
    .filter((key) => builtin.includes(key) && !saved.includes(key));
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

const MB_NAV_FOCUS = {
  agent: ['dialer', 'wiedervorlage', 'takvim', 'myhistory', 'performansim', 'dashboard', 'maasim', 'competition', 'leave'],
  qc: ['qc', 'callhistory', 'dialer', 'wiedervorlage', 'dashboard', 'performansim', 'maasim', 'competition', 'leave'],
  field_agent: ['field', 'dashboard', 'performansim', 'maasim', 'competition', 'leave'],
};

function mbNavItemKey(btn) {
  const action = String(btn?.getAttribute?.('onclick') || '');
  if (action.includes('openNavTakvim')) return 'takvim';
  const page = action.match(/navigate\('([a-z0-9_]+)'\)/);
  if (page) return page[1];
  const report = action.match(/openStatsReport\('([a-z0-9_]+)'\)/);
  return report ? report[1] : '';
}

function mbRememberNavHomes() {
  if (window._mbNavHomes) return;
  window._mbNavHomes = [];
  window._mbNavGroupHomes = [...document.querySelectorAll('#sidebar-scroll > .sb-group')];
  document.querySelectorAll('#sidebar .sb-sub').forEach((parent) => {
    [...parent.children].forEach((el, index) => {
      if (!el.classList?.contains('sb-item')) return;
      el.dataset.navKey = mbNavItemKey(el);
      window._mbNavHomes.push({ el, parent, index });
    });
  });
}

function mbNavAnchor(scroll) {
  return [...(scroll?.children || [])].find((el) => el.classList?.contains('sb-divider') || (el.classList?.contains('sb-section') && !el.classList.contains('sb-group'))) || null;
}

function mbApplyNavOrder(roleName) {
  mbRememberNavHomes();
  const scroll = document.getElementById('sidebar-scroll');
  const anchor = mbNavAnchor(scroll);
  (window._mbNavGroupHomes || []).forEach((group) => {
    if (!scroll || !group) return;
    if (anchor) scroll.insertBefore(group, anchor);
    else scroll.appendChild(group);
  });
  const byParent = new Map();
  window._mbNavHomes.forEach((row) => {
    if (!byParent.has(row.parent)) byParent.set(row.parent, []);
    byParent.get(row.parent).push(row);
  });
  byParent.forEach((rows, parent) => {
    rows.sort((a, b) => a.index - b.index);
    rows.forEach((row) => parent.appendChild(row.el));
  });
  const custom = typeof mbGetNavCustom === 'function' ? mbGetNavCustom() : null;
  if (custom) {
    mbPlaceNavCustom(custom);
    return;
  }
  const role = roleName || currentUser?.role || '';
  const focus = MB_NAV_FOCUS[role];
  const work = document.querySelector('[data-sb-group="work"] .sb-sub');
  if (!focus || !work) return;
  const buttons = [...document.querySelectorAll('#sidebar .sb-item')];
  const picked = focus.map((key) => buttons.find((el) => el.dataset.navKey === key && el.style.display !== 'none')).filter(Boolean);
  for (let i = picked.length - 1; i >= 0; i -= 1) work.insertBefore(picked[i], work.firstChild);
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
  mbApplyNavOrder(role);
  mbRestoreSbGroups();
  mbWireNavDrag();
  if (document.getElementById('sidebar')?.classList.contains('is-nav-edit')) mbPaintNavEdit(true);
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
  mbNavRefreshEmpty();
}

function mbNavRefreshEmpty() {
  const q = String(document.getElementById('sb-nav-search')?.value || '').trim();
  const searching = q.length > 0;
  const hits = [...document.querySelectorAll('#sidebar .sb-item')].filter((btn) => {
    return btn.style.display !== 'none' && !btn.classList.contains('is-nav-miss');
  }).length;
  const people = document.querySelectorAll('#sb-person-pop:not([hidden]) [data-person-id]').length;
  const waiting = typeof _personWait !== 'undefined' && _personWait;
  const empty = document.getElementById('sb-nav-empty');
  if (empty) empty.hidden = !(searching && hits === 0 && people === 0 && !waiting);
}

function mbNavQuery(raw) {
  mbFilterNav(raw);
  if (typeof mbPersonSearchInput === 'function') mbPersonSearchInput(raw);
}

function mbNavSearchKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const input = document.getElementById('sb-nav-search');
    const had = String(input?.value || '').trim();
    if (had) {
      if (input) input.value = '';
      mbFilterNav('');
      if (typeof mbPersonRecent === 'function') mbPersonRecent();
      else if (typeof mbPersonClose === 'function') mbPersonClose();
      return;
    }
    input?.blur();
    if (window.innerWidth <= 1024 && typeof closeSidebar === 'function') closeSidebar();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const rows = [...document.querySelectorAll('#sb-person-pop:not([hidden]) .sb-person-row')];
    if (!rows.length) return;
    e.preventDefault();
    let index = rows.findIndex((row) => row.classList.contains('is-on'));
    if (e.key === 'ArrowDown') index = index < 0 ? 0 : Math.min(rows.length - 1, index + 1);
    else index = index < 0 ? rows.length - 1 : Math.max(0, index - 1);
    rows.forEach((row, i) => row.classList.toggle('is-on', i === index));
    rows[index].scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key !== 'Enter') return;
  const picked = document.querySelector('#sb-person-pop:not([hidden]) .sb-person-row.is-on');
  const typed = String(document.getElementById('sb-nav-search')?.value || '').trim();
  if (!typed && !picked) return;
  e.preventDefault();
  if (picked && typeof mbOpenPerson === 'function') {
    mbOpenPerson(picked.getAttribute('data-person-id'));
    return;
  }
  if (!typed) return;
  const hit = [...document.querySelectorAll('#sidebar .sb-item')].find((btn) => {
    return btn.style.display !== 'none' && !btn.classList.contains('is-nav-miss');
  });
  if (hit) { hit.click(); return; }
  const person = document.querySelector('#sb-person-pop:not([hidden]) [data-person-id]');
  if (person && typeof mbOpenPerson === 'function') mbOpenPerson(person.getAttribute('data-person-id'));
}

function mbClearNavSearch() {
  const input = document.getElementById('sb-nav-search');
  if (input && input.value) input.value = '';
  if (document.getElementById('sidebar')?.classList.contains('is-nav-search')) mbFilterNav('');
  if (typeof mbPersonClose === 'function') mbPersonClose();
}

function mbFocusNavSearch() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  if (window.innerWidth <= 1024) {
    sb.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('show');
  } else if (sb.classList.contains('collapsed')) {
    sb.classList.remove('collapsed');
  }
  const input = document.getElementById('sb-nav-search');
  if (input) {
    input.focus();
    input.select();
  }
  if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
}

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (String(e.key || '').toLowerCase() !== 'k') return;
  const tag = String(e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
    if (e.target?.id !== 'sb-nav-search') return;
  }
  e.preventDefault();
  mbFocusNavSearch();
});

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

let _mbNavCustom = null;

function mbNavStoreKey() {
  const id = (typeof currentUser !== 'undefined' && currentUser?.id) ? String(currentUser.id) : '';
  return id ? `mb_nav_order_${id}` : '';
}

function mbNavOrderOk(order) {
  return !!(order && Array.isArray(order.groups) && order.items && typeof order.items === 'object');
}

function mbSetNavCustom(order) {
  _mbNavCustom = mbNavOrderOk(order) ? order : null;
  const key = mbNavStoreKey();
  if (!key) return;
  try {
    if (_mbNavCustom) localStorage.setItem(key, JSON.stringify(_mbNavCustom));
    else localStorage.removeItem(key);
  } catch (e) {}
}

function mbGetNavCustom() {
  if (_mbNavCustom) return _mbNavCustom;
  const key = mbNavStoreKey();
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (mbNavOrderOk(parsed)) _mbNavCustom = parsed;
  } catch (e) {}
  return _mbNavCustom;
}

function mbReadNavDom() {
  const groups = [...document.querySelectorAll('#sidebar-scroll > .sb-group')]
    .map((group) => group.getAttribute('data-sb-group'))
    .filter(Boolean);
  const items = {};
  document.querySelectorAll('#sidebar-scroll > .sb-group').forEach((group) => {
    const key = group.getAttribute('data-sb-group');
    if (!key) return;
    items[key] = [...group.querySelectorAll(':scope > .sb-sub > .sb-item')].map(mbNavItemKey).filter(Boolean);
  });
  return groups.length ? { groups, items } : null;
}

function mbPlaceNavCustom(order) {
  if (!mbNavOrderOk(order)) return;
  const scroll = document.getElementById('sidebar-scroll');
  if (!scroll) return;
  const byGroup = new Map([...scroll.querySelectorAll(':scope > .sb-group')].map((group) => [group.getAttribute('data-sb-group'), group]));
  const anchor = mbNavAnchor(scroll);
  const knownGroups = new Set(order.groups);
  order.groups.forEach((key) => {
    const group = byGroup.get(key);
    if (!group) return;
    if (anchor) scroll.insertBefore(group, anchor);
    else scroll.appendChild(group);
  });
  [...byGroup.values()].forEach((group) => {
    if (knownGroups.has(group.getAttribute('data-sb-group'))) return;
    if (anchor) scroll.insertBefore(group, anchor);
    else scroll.appendChild(group);
  });
  const buttons = [...document.querySelectorAll('#sidebar .sb-sub > .sb-item')];
  Object.entries(order.items).forEach(([groupKey, keys]) => {
    const sub = document.querySelector(`#sidebar [data-sb-group="${groupKey}"] > .sb-sub`);
    if (!sub || !Array.isArray(keys)) return;
    const known = new Set(keys);
    keys.forEach((key) => {
      const btn = buttons.find((el) => el.dataset.navKey === key);
      if (btn) sub.appendChild(btn);
    });
    [...sub.querySelectorAll(':scope > .sb-item')].forEach((btn) => {
      if (known.has(btn.dataset.navKey)) return;
      const home = (window._mbNavHomes || []).find((row) => row.el === btn);
      let after = null;
      if (home) {
        const mates = (window._mbNavHomes || []).filter((row) => row.parent === home.parent && row.index < home.index);
        for (let i = mates.length - 1; i >= 0; i -= 1) {
          const prev = mates[i].el;
          if (prev.parentElement === sub && known.has(prev.dataset.navKey)) { after = prev; break; }
        }
      }
      if (after) after.insertAdjacentElement('afterend', btn);
      else sub.appendChild(btn);
    });
  });
}

function mbSaveNavOrder() {
  const order = mbReadNavDom();
  if (!order) return;
  mbSetNavCustom(order);
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

async function mbResetNavOrder() {
  mbSetNavCustom(null);
  mbApplyNavOrder();
  const id = (typeof currentUser !== 'undefined' && currentUser?.id) ? String(currentUser.id) : '';
  if (!id || typeof sb !== 'function') return;
  try {
    const rows = await sb(`users?id=eq.${id}&select=ui_prefs&limit=1`);
    const existing = rows?.[0]?.ui_prefs && typeof rows[0].ui_prefs === 'object' ? rows[0].ui_prefs : {};
    const next = { ...existing };
    delete next.nav;
    await sb(`users?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ ui_prefs: next }),
    });
  } catch (e) {}
}

function mbPaintNavEdit(on) {
  const side = document.getElementById('sidebar');
  if (side) side.classList.toggle('is-nav-edit', !!on);
  document.querySelectorAll('#sidebar .sb-group').forEach((group) => {
    if (on) group.classList.remove('is-collapsed');
  });
  document.querySelectorAll('#sidebar .sb-group-btn').forEach((btn) => { btn.draggable = !!on; });
  document.querySelectorAll('#sidebar .sb-sub .sb-item').forEach((btn) => { btn.draggable = !!on; });
  if (!on) mbRestoreSbGroups();
  const label = document.getElementById('nav-edit-label');
  if (!label) return;
  const tr = on ? 'Düzenlemeyi bitir' : 'Menüyü düzenle';
  const de = on ? 'Fertig' : 'Menü anordnen';
  label.textContent = (typeof currentLang !== 'undefined' && currentLang === 'de') ? de : tr;
  label.setAttribute('data-tr', tr);
  label.setAttribute('data-de', de);
}

function mbToggleNavEdit() {
  const side = document.getElementById('sidebar');
  mbPaintNavEdit(!side?.classList.contains('is-nav-edit'));
}

function mbWireNavDrag() {
  const root = document.getElementById('sidebar-scroll');
  if (!root || root.dataset.navDrag) return;
  root.dataset.navDrag = '1';
  let dragEl = null;
  let moved = false;
  root.addEventListener('dragstart', (e) => {
    if (!document.getElementById('sidebar')?.classList.contains('is-nav-edit')) {
      e.preventDefault();
      return;
    }
    const item = e.target.closest?.('.sb-sub .sb-item');
    const group = e.target.closest?.('.sb-group-btn')?.closest('.sb-group');
    dragEl = item || group;
    moved = false;
    if (!dragEl) return;
    dragEl.classList.add('is-nav-dragging');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'nav'); } catch (err) {}
  });
  root.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const item = e.target.closest?.('.sb-item');
    const group = e.target.closest?.('.sb-group');
    if (dragEl.classList.contains('sb-group')) {
      if (!group || group === dragEl) return;
      const box = group.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      const next = after ? group.nextElementSibling : group;
      if (next !== dragEl) {
        group.parentElement.insertBefore(dragEl, next);
        moved = true;
      }
      return;
    }
    if (item && item !== dragEl && item.closest('.sb-sub') && item.parentElement) {
      const box = item.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      const next = after ? item.nextElementSibling : item;
      if (next !== dragEl) {
        item.parentElement.insertBefore(dragEl, next);
        moved = true;
      }
      return;
    }
    const sub = group?.querySelector(':scope > .sb-sub');
    if (sub && !sub.contains(dragEl)) {
      sub.appendChild(dragEl);
      moved = true;
    }
  });
  root.addEventListener('dragend', () => {
    dragEl?.classList.remove('is-nav-dragging');
    dragEl = null;
    if (moved && document.getElementById('sidebar')?.classList.contains('is-nav-edit')) mbSaveNavOrder();
    moved = false;
  });
  root.addEventListener('click', (e) => {
    if (!document.getElementById('sidebar')?.classList.contains('is-nav-edit')) return;
    const el = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!el?.closest('.sb-item, .sb-group-btn')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function toggleSbGroup(btn) {
  if (document.getElementById('sidebar')?.classList.contains('is-nav-edit')) return;
  const group = btn?.closest?.('.sb-group');
  if (!group) return;
  group.classList.toggle('is-collapsed');
  const key = group.getAttribute('data-sb-group') || '';
  const saved = mbSbGroupState();
  saved[key] = !group.classList.contains('is-collapsed');
  try { localStorage.setItem('mb_sb_groups', JSON.stringify(saved)); } catch (e) {}
}

try { window.toggleSbGroup = toggleSbGroup; } catch (e) {}
