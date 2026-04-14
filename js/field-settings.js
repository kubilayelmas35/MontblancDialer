// ─────────────────────────────────────────────
// Saha ayarları — firms.settings.fieldService
// ─────────────────────────────────────────────

let _fieldSettingsFirmId = null;
let _fieldSettingsDraft = defaultFieldSettings();

function defaultFieldSettings() {
  return {
    enabled: false,
    can_manage_agents: false,
    result_options: ['satis', 'teklif', 'ziyaret_tamamlandi', 'ulasilamadi'],
    document_requirements: ['kimlik', 'sozlesme'],
    form_schema: []
  };
}

function _normalizeFieldSchemaRow(row) {
  const out = {
    key: String(row?.key || '').trim(),
    label: String(row?.label || '').trim(),
    type: ['text', 'number', 'select', 'date'].includes(String(row?.type || 'text')) ? String(row?.type) : 'text',
    options: Array.isArray(row?.options) ? row.options.map((x) => String(x || '').trim()).filter(Boolean) : []
  };
  return out;
}

function _fieldSetEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function renderFieldResultsRows() {
  const el = document.getElementById('field-set-results-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.result_options || [];
  el.innerHTML = rows.length
    ? rows
        .map(
          (v, idx) => `<div style="display:flex;gap:6px;align-items:center;">
<input class="form-input" data-field-result-index="${idx}" value="${_fieldSetEsc(v)}" placeholder="Örn: satış" style="flex:1;">
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldResultOptionRow(${idx})">Sil</button>
</div>`
        )
        .join('')
    : '<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">Henüz sonuç seçeneği yok</div>';
}

function renderFieldDocRows() {
  const el = document.getElementById('field-set-doc-types-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.document_requirements || [];
  el.innerHTML = rows.length
    ? rows
        .map(
          (v, idx) => `<div style="display:flex;gap:6px;align-items:center;">
<input class="form-input" data-field-doc-index="${idx}" value="${_fieldSetEsc(v)}" placeholder="Örn: sözleşme" style="flex:1;">
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldDocTypeRow(${idx})">Sil</button>
</div>`
        )
        .join('')
    : '<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">Belge tipi ekleyin</div>';
}

function renderFieldSchemaRows() {
  const el = document.getElementById('field-set-form-schema-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.form_schema || [];
  el.innerHTML = rows.length
    ? rows
        .map((r, idx) => {
          const rr = _normalizeFieldSchemaRow(r);
          return `<div style="padding:8px;background:var(--bg-3);border-radius:8px;display:grid;grid-template-columns:1fr 1fr 120px auto;gap:6px;align-items:center;">
<input class="form-input" data-field-schema-key-index="${idx}" value="${_fieldSetEsc(rr.key)}" placeholder="Anahtar (örn: roof_type)">
<input class="form-input" data-field-schema-label-index="${idx}" value="${_fieldSetEsc(rr.label)}" placeholder="Etiket (örn: Çatı tipi)">
<select class="form-input" data-field-schema-type-index="${idx}" onchange="onFieldSchemaTypeChange(${idx}, this.value)">
<option value="text" ${rr.type === 'text' ? 'selected' : ''}>Metin</option>
<option value="number" ${rr.type === 'number' ? 'selected' : ''}>Sayı</option>
<option value="date" ${rr.type === 'date' ? 'selected' : ''}>Tarih</option>
<option value="select" ${rr.type === 'select' ? 'selected' : ''}>Seçim</option>
</select>
<div style="display:flex;gap:4px;justify-content:flex-end;">
<button type="button" class="btn btn-ghost btn-sm" onclick="moveFieldSchemaRow(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>↑</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="moveFieldSchemaRow(${idx}, 1)" ${idx === rows.length - 1 ? 'disabled' : ''}>↓</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldSchemaRow(${idx})">Sil</button>
</div>
${rr.type === 'select' ? `<div style="grid-column:1/-1;display:flex;gap:6px;align-items:center;">
<input class="form-input" data-field-schema-options-index="${idx}" value="${_fieldSetEsc(rr.options.join(', '))}" placeholder="Seçenekler (virgülle): örn. düşük, orta, yüksek">
</div>` : ''}
</div>`
        })
        .join('')
    : '<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">Ek alan yok</div>';
}

function addFieldResultOptionRow() {
  if (!_fieldSettingsDraft.result_options) _fieldSettingsDraft.result_options = [];
  _fieldSettingsDraft.result_options.push('');
  renderFieldResultsRows();
}

function removeFieldResultOptionRow(index) {
  _fieldSettingsDraft.result_options.splice(index, 1);
  renderFieldResultsRows();
}

function addFieldDocTypeRow() {
  if (!_fieldSettingsDraft.document_requirements) _fieldSettingsDraft.document_requirements = [];
  _fieldSettingsDraft.document_requirements.push('');
  renderFieldDocRows();
}

function removeFieldDocTypeRow(index) {
  _fieldSettingsDraft.document_requirements.splice(index, 1);
  renderFieldDocRows();
}

function addFieldSchemaRow() {
  if (!_fieldSettingsDraft.form_schema) _fieldSettingsDraft.form_schema = [];
  _fieldSettingsDraft.form_schema.push({ key: '', label: '', type: 'text', options: [] });
  renderFieldSchemaRows();
}

function removeFieldSchemaRow(index) {
  _fieldSettingsDraft.form_schema.splice(index, 1);
  renderFieldSchemaRows();
}

function moveFieldSchemaRow(index, delta) {
  const arr = _fieldSettingsDraft.form_schema || [];
  const n = index + delta;
  if (n < 0 || n >= arr.length) return;
  const cur = arr[index];
  arr[index] = arr[n];
  arr[n] = cur;
  renderFieldSchemaRows();
}

function onFieldSchemaTypeChange(index, type) {
  if (!_fieldSettingsDraft.form_schema?.[index]) return;
  _fieldSettingsDraft.form_schema[index].type = type;
  if (type !== 'select') _fieldSettingsDraft.form_schema[index].options = [];
  renderFieldSchemaRows();
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
  _fieldSettingsDraft = {
    ...defaultFieldSettings(),
    ...settings,
    result_options: [...(settings.result_options || [])],
    document_requirements: [...(settings.document_requirements || [])],
    form_schema: [...(settings.form_schema || [])].map(_normalizeFieldSchemaRow)
  };

  const enabledEl = document.getElementById('field-set-enabled');
  const manageEl = document.getElementById('field-set-manage-agents');
  if (enabledEl) enabledEl.checked = !!settings.enabled;
  if (manageEl) manageEl.checked = !!settings.can_manage_agents;
  renderFieldResultsRows();
  renderFieldDocRows();
  renderFieldSchemaRows();
}

async function saveFieldSettings() {
  const fid = _fieldSettingsFirmId;
  if (!fid) {
    toast('Firma bulunamadı', 'warn');
    return;
  }
  const enabled = !!document.getElementById('field-set-enabled')?.checked;
  const canManage = !!document.getElementById('field-set-manage-agents')?.checked;
  const results = [...document.querySelectorAll('[data-field-result-index]')]
    .map((i) => String(i.value || '').trim())
    .filter(Boolean);
  const docs = [...document.querySelectorAll('[data-field-doc-index]')]
    .map((i) => String(i.value || '').trim())
    .filter(Boolean);
  const keys = [...document.querySelectorAll('[data-field-schema-key-index]')];
  const labels = [...document.querySelectorAll('[data-field-schema-label-index]')];
  const schema = [];
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i].value || '').trim();
    const label = String(labels[i]?.value || '').trim();
    if (!key && !label) continue;
    if (!key || !label) {
      toast('Ek alanlarda anahtar ve etiket birlikte doldurulmalı', 'warn');
      return;
    }
    const type = String(document.querySelector(`[data-field-schema-type-index="${i}"]`)?.value || 'text');
    const optsText = String(document.querySelector(`[data-field-schema-options-index="${i}"]`)?.value || '');
    const options = optsText
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (type === 'select' && !options.length) {
      toast('Seçim tipinde en az 1 seçenek girilmeli', 'warn');
      return;
    }
    schema.push({ key, label, type, options });
  }

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
