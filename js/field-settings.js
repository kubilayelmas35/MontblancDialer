// ─────────────────────────────────────────────
// Saha ayarları — firms.settings.fieldService
// ─────────────────────────────────────────────

let _fieldSettingsFirmId = null;

function defaultFieldSettings() {
  return {
    enabled: false,
    can_manage_agents: false,
    result_options: ['satis', 'teklif', 'ziyaret_tamamlandi', 'ulasilamadi'],
    document_requirements: ['kimlik', 'sozlesme'],
    form_schema: []
  };
}

function parseLineSchema(text) {
  const rows = String(text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  rows.forEach((r) => {
    const [key, label] = r.split('|').map((x) => String(x || '').trim());
    if (!key || !label) return;
    out.push({ key, label });
  });
  return out;
}

function schemaToText(schema) {
  return (schema || []).map((x) => `${x.key}|${x.label}`).join('\n');
}

async function loadFieldSettingsPage() {
  const card = document.getElementById('field-settings-card');
  if (!card) return;
  const role = currentUser?.role || '';
  const isSuper = role === 'super_admin';
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(role);
  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const firmRow = document.getElementById('field-settings-firm-row');
  const firmSel = document.getElementById('field-settings-firm-select');
  if (isSuper) {
    if (firmRow) firmRow.style.display = '';
    if (firmSel && !firmSel.options.length) {
      const firms = await sb('firms?is_active=eq.true&select=id,name&order=name').catch(() => []);
      firmSel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${f.name || f.id}</option>`).join('');
    }
    if (firmSel?.value) _fieldSettingsFirmId = firmSel.value;
    else if (firmSel?.options.length) _fieldSettingsFirmId = firmSel.options[0].value;
  } else {
    if (firmRow) firmRow.style.display = 'none';
    _fieldSettingsFirmId = currentUser?.firm_id || null;
  }
  await renderFieldSettingsForm();
}

async function onFieldSettingsFirmChange() {
  _fieldSettingsFirmId = document.getElementById('field-settings-firm-select')?.value || null;
  await renderFieldSettingsForm();
}

async function renderFieldSettingsForm() {
  const fid = _fieldSettingsFirmId;
  if (!fid) return;
  let settings = defaultFieldSettings();
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    settings = { ...defaultFieldSettings(), ...(firms?.[0]?.settings?.fieldService || {}) };
  } catch (e) {}

  const enabledEl = document.getElementById('field-set-enabled');
  const manageEl = document.getElementById('field-set-manage-agents');
  const resultsEl = document.getElementById('field-set-results');
  const docsEl = document.getElementById('field-set-doc-types');
  const schemaEl = document.getElementById('field-set-form-schema');
  if (enabledEl) enabledEl.checked = !!settings.enabled;
  if (manageEl) manageEl.checked = !!settings.can_manage_agents;
  if (resultsEl) resultsEl.value = (settings.result_options || []).join(', ');
  if (docsEl) docsEl.value = (settings.document_requirements || []).join(', ');
  if (schemaEl) schemaEl.value = schemaToText(settings.form_schema || []);
}

async function saveFieldSettings() {
  const fid = _fieldSettingsFirmId;
  if (!fid) {
    toast('Firma bulunamadı', 'warn');
    return;
  }
  const enabled = !!document.getElementById('field-set-enabled')?.checked;
  const canManage = !!document.getElementById('field-set-manage-agents')?.checked;
  const results = String(document.getElementById('field-set-results')?.value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const docs = String(document.getElementById('field-set-doc-types')?.value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const schema = parseLineSchema(document.getElementById('field-set-form-schema')?.value || '');

  const fieldService = {
    ...defaultFieldSettings(),
    enabled,
    can_manage_agents: canManage,
    result_options: results.length ? results : defaultFieldSettings().result_options,
    document_requirements: docs,
    form_schema: schema
  };

  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, fieldService } })
    });
    if (typeof invalidateFieldSettingsCache === 'function') invalidateFieldSettingsCache(fid);
    toast('Saha ayarları kaydedildi', 'ok');
  } catch (e) {
    toast('Saha ayarları kaydedilemedi', 'err');
  }
}
