// ─────────────────────────────────────────────
// Feature flags (firms.settings.features)
// ─────────────────────────────────────────────

let _featureFlagsFirmId = null;
let _featureFlagsCache = {};

const FEATURE_FLAG_DEFS = [
  { key: 'dialer_enabled', label: 'Dialer aktif' },
  { key: 'qc_dialer_enabled', label: 'QC dialer aktif' },
  { key: 'admin_dialer_enabled', label: 'Admin dialer aktif' },
  { key: 'field_module_enabled', label: 'Saha modülü aktif' },
  { key: 'chat_enabled', label: 'Chat aktif' },
  { key: 'notification_center_enabled', label: 'Bildirim merkezi aktif' },
  { key: 'job_market_enabled', label: 'İş platformu aktif' }
];

function defaultFeatureFlags() {
  return {
    dialer_enabled: true,
    qc_dialer_enabled: true,
    admin_dialer_enabled: true,
    field_module_enabled: true,
    chat_enabled: true,
    notification_center_enabled: true,
    job_market_enabled: true
  };
}

async function getFirmFeatureFlags(fid, forceRefresh) {
  if (!fid) return defaultFeatureFlags();
  if (!forceRefresh && _featureFlagsCache[fid]) return _featureFlagsCache[fid];
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const merged = { ...defaultFeatureFlags(), ...(rows?.[0]?.settings?.features || {}) };
    _featureFlagsCache[fid] = merged;
    return merged;
  } catch (e) {
    return defaultFeatureFlags();
  }
}

async function isFeatureEnabledForCurrentFirm(key) {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) return true;
  const f = await getFirmFeatureFlags(fid);
  return f[key] !== false;
}

async function loadFeatureFlagsPage() {
  const card = document.getElementById('feature-flags-card');
  const list = document.getElementById('feature-flags-list');
  if (!card || !list) return;
  const role = currentUser?.role || '';
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(role);
  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const row = document.getElementById('feature-flags-firm-row');
  const sel = document.getElementById('feature-flags-firm-select');
  if (role === 'super_admin') {
    if (row) row.style.display = '';
    if (sel && !sel.options.length) {
      const firms = await sb('firms?is_active=eq.true&select=id,name&order=name').catch(() => []);
      sel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${f.name || f.id}</option>`).join('');
    }
    _featureFlagsFirmId = sel?.value || (sel?.options?.[0]?.value || null);
  } else {
    if (row) row.style.display = 'none';
    _featureFlagsFirmId = currentUser?.firm_id || null;
  }
  const flags = await getFirmFeatureFlags(_featureFlagsFirmId, true);
  list.innerHTML = FEATURE_FLAG_DEFS.map((f) => {
    const on = flags[f.key] !== false;
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border-radius:8px;font-size:12px;cursor:pointer;">
<input type="checkbox" data-ff-key="${f.key}" ${on ? 'checked' : ''} style="width:15px;height:15px;">
<span>${f.label}</span>
</label>`;
  }).join('');
}

async function onFeatureFlagsFirmChange() {
  _featureFlagsFirmId = document.getElementById('feature-flags-firm-select')?.value || null;
  await loadFeatureFlagsPage();
}

async function saveFeatureFlags() {
  const fid = _featureFlagsFirmId;
  if (!fid) return;
  const flags = { ...defaultFeatureFlags() };
  document.querySelectorAll('[data-ff-key]').forEach((el) => {
    flags[el.getAttribute('data-ff-key')] = !!el.checked;
  });
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    const old = rows?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...old, features: flags } })
    });
    _featureFlagsCache[fid] = flags;
    if (typeof logAuditEvent === 'function') await logAuditEvent('feature_flags_updated', 'firm', fid, { flags });
    toast('Özellikler kaydedildi', 'ok');
    if (typeof applyFeatureFlagsOnBoot === 'function') await applyFeatureFlagsOnBoot();
  } catch (e) {
    toast('Özellikler kaydedilemedi', 'err');
  }
}

async function applyFeatureFlagsOnBoot() {
  const role = currentUser?.role || '';
  const adminLike = ['admin', 'firm_admin', 'super_admin'].includes(role);
  const qc = role === 'qc';
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  const flags = await getFirmFeatureFlags(fid);
  const adminDialerNav = document.getElementById('nav-admin-dialer-btn');
  if (adminDialerNav && adminLike) adminDialerNav.style.display = flags.admin_dialer_enabled !== false ? '' : 'none';
  const agentDialerNav = document.getElementById('nav-dialer-btn');
  if (agentDialerNav && qc) agentDialerNav.style.display = flags.qc_dialer_enabled !== false ? '' : 'none';
  const fieldNav = document.getElementById('nav-field-btn');
  if (fieldNav && currentUser?.role === 'field_agent') fieldNav.style.display = flags.field_module_enabled !== false ? '' : 'none';
  const notifBtn = document.getElementById('tb-notif-btn');
  if (notifBtn) notifBtn.style.display = flags.notification_center_enabled !== false ? '' : 'none';
  const jobsNav = document.getElementById('nav-jobs-btn');
  if (jobsNav && adminLike) jobsNav.style.display = flags.job_market_enabled !== false ? '' : 'none';
}

window.isFeatureEnabledForCurrentFirm = isFeatureEnabledForCurrentFirm;
