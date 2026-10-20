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
    form_schema: [],
    products: [],
    pdf: { title: '', company: '', intro: '', terms: '', footer: '', vat: 19 }
  };
}

function _normalizeFieldSchemaRow(row) {
  const out = {
    key: String(row?.key || '').trim(),
    label: String(row?.label || '').trim(),
    type: ['text', 'long', 'number', 'select', 'checks', 'date', 'yesno', 'photo', 'sign'].includes(String(row?.type || 'text')) ? String(row?.type) : 'text',
    options: Array.isArray(row?.options) ? row.options.map((x) => String(x || '').trim()).filter(Boolean) : [],
    required: !!row?.required,
    placeholder: String(row?.placeholder || ''),
    min: row?.min ?? '',
    max: row?.max ?? '',
    show_when_result: String(row?.show_when_result || '').trim()
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
<input class="form-input" data-field-result-index="${idx}" value="${_fieldSetEsc(v)}" placeholder="${_fieldSetEsc(t('field.set.ph_result'))}" style="flex:1;">
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldResultOptionRow(${idx})">${_fieldSetEsc(t('field.set.remove'))}</button>
</div>`
        )
        .join('')
    : `<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">${_fieldSetEsc(t('field.set.no_results'))}</div>`;
}

function renderFieldDocRows() {
  const el = document.getElementById('field-set-doc-types-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.document_requirements || [];
  el.innerHTML = rows.length
    ? rows
        .map(
          (v, idx) => `<div style="display:flex;gap:6px;align-items:center;">
<input class="form-input" data-field-doc-index="${idx}" value="${_fieldSetEsc(v)}" placeholder="${_fieldSetEsc(t('field.set.ph_doc'))}" style="flex:1;">
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldDocTypeRow(${idx})">${_fieldSetEsc(t('field.set.remove'))}</button>
</div>`
        )
        .join('')
    : `<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">${_fieldSetEsc(t('field.set.no_docs'))}</div>`;
}

function fieldSchemaKey(label, index, used) {
  const map = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c', ß: 'ss', ä: 'a' };
  let base = String(label || '').toLowerCase().replace(/[ğüşıöçßä]/g, (ch) => map[ch] || ch);
  base = base.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
  if (!base) base = `soru_${index + 1}`;
  let key = base;
  let n = 2;
  const taken = new Set(used || []);
  while (taken.has(key)) key = `${base}_${n++}`;
  return key;
}

function renderFieldSchemaRows() {
  const el = document.getElementById('field-set-form-schema-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.form_schema || [];
  const results = (_fieldSettingsDraft.result_options || []).map((item) => String(item || '').trim()).filter(Boolean);
  el.innerHTML = rows.length
    ? rows
        .map((r, idx) => {
          const rr = _normalizeFieldSchemaRow(r);
          const choice = rr.type === 'select' || rr.type === 'checks';
          const numbered = rr.type === 'number';
          const written = rr.type === 'text' || rr.type === 'long';
          const whenOpts = [`<option value="">${_fieldSetEsc(t('field.set.when_any'))}</option>`]
            .concat(results.map((key) => `<option value="${_fieldSetEsc(key)}" ${rr.show_when_result === key ? 'selected' : ''}>${_fieldSetEsc(typeof fieldResultLabel === 'function' ? fieldResultLabel(key) : key)}</option>`))
            .join('');
          return `<div style="padding:8px;background:var(--bg-3);border-radius:8px;display:flex;flex-direction:column;gap:6px;">
<div style="display:flex;gap:6px;align-items:center;">
<button type="button" class="btn btn-ghost btn-sm" onclick="moveFieldSchemaRow(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>↑</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="moveFieldSchemaRow(${idx}, 1)" ${idx === rows.length - 1 ? 'disabled' : ''}>↓</button>
<input type="hidden" data-field-schema-key-index="${idx}" value="${_fieldSetEsc(rr.key)}">
<input class="form-input" data-field-schema-label-index="${idx}" value="${_fieldSetEsc(rr.label)}" placeholder="${_fieldSetEsc(t('field.set.ph_label'))}" style="flex:1;">
<select class="form-input" data-field-schema-type-index="${idx}" style="width:140px;" onchange="onFieldSchemaTypeChange(${idx}, this.value)">
<option value="text" ${rr.type === 'text' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.text'))}</option>
<option value="long" ${rr.type === 'long' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.long'))}</option>
<option value="number" ${rr.type === 'number' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.number'))}</option>
<option value="date" ${rr.type === 'date' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.date'))}</option>
<option value="select" ${rr.type === 'select' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.select'))}</option>
<option value="checks" ${rr.type === 'checks' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.checks'))}</option>
<option value="yesno" ${rr.type === 'yesno' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.yesno'))}</option>
<option value="photo" ${rr.type === 'photo' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.photo'))}</option>
<option value="sign" ${rr.type === 'sign' ? 'selected' : ''}>${_fieldSetEsc(t('field.set.type.sign'))}</option>
</select>
<label style="font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;"><input type="checkbox" data-field-schema-required-index="${idx}" ${rr.required ? 'checked' : ''}> ${_fieldSetEsc(t('field.set.required'))}</label>
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldSchemaRow(${idx})">${_fieldSetEsc(t('field.set.remove'))}</button>
</div>
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
<select class="form-input" data-field-schema-show-result-index="${idx}" style="min-width:180px;font-size:12px;">${whenOpts}</select>
${written ? `<input class="form-input" data-field-schema-ph-index="${idx}" value="${_fieldSetEsc(rr.placeholder)}" placeholder="${_fieldSetEsc(t('field.set.ph_holder'))}" style="flex:1;min-width:140px;">` : ''}
${numbered ? `<input class="form-input" data-field-schema-min-index="${idx}" value="${_fieldSetEsc(rr.min)}" placeholder="${_fieldSetEsc(t('field.set.ph_min'))}" style="width:110px;"><input class="form-input" data-field-schema-max-index="${idx}" value="${_fieldSetEsc(rr.max)}" placeholder="${_fieldSetEsc(t('field.set.ph_max'))}" style="width:110px;">` : ''}
</div>
${choice ? `<input class="form-input" data-field-schema-options-index="${idx}" value="${_fieldSetEsc(rr.options.join(', '))}" placeholder="${_fieldSetEsc(t('field.set.ph_options'))}">` : ''}
</div>`
        })
        .join('')
    : `<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">${_fieldSetEsc(t('field.set.no_fields'))}</div>`;
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

function rememberFieldSchemaDraft() {
  const keys = [...document.querySelectorAll('[data-field-schema-key-index]')];
  if (!keys.length) return;
  _fieldSettingsDraft.form_schema = keys.map((input, i) => ({
    key: String(input.value || '').trim(),
    label: document.querySelector(`[data-field-schema-label-index="${i}"]`)?.value || '',
    type: document.querySelector(`[data-field-schema-type-index="${i}"]`)?.value || 'text',
    options: String(document.querySelector(`[data-field-schema-options-index="${i}"]`)?.value || '').split(',').map((item) => item.trim()).filter(Boolean),
    required: !!document.querySelector(`[data-field-schema-required-index="${i}"]`)?.checked,
    placeholder: document.querySelector(`[data-field-schema-ph-index="${i}"]`)?.value || '',
    min: document.querySelector(`[data-field-schema-min-index="${i}"]`)?.value || '',
    max: document.querySelector(`[data-field-schema-max-index="${i}"]`)?.value || '',
    show_when_result: document.querySelector(`[data-field-schema-show-result-index="${i}"]`)?.value || ''
  }));
}

function renderFieldProductRows() {
  const el = document.getElementById('field-set-products-list');
  if (!el) return;
  const rows = _fieldSettingsDraft.products || [];
  el.innerHTML = rows.length
    ? rows.map((row, idx) => `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
<input type="hidden" data-field-product-id="${idx}" value="${_fieldSetEsc(row.id || '')}">
<input class="form-input" data-field-product-name="${idx}" value="${_fieldSetEsc(row.name || '')}" placeholder="${_fieldSetEsc(t('field.set.ph_product'))}" style="flex:1;min-width:160px;">
<input class="form-input" data-field-product-unit="${idx}" value="${_fieldSetEsc(row.unit || '')}" placeholder="${_fieldSetEsc(t('field.set.ph_unit'))}" style="width:110px;">
<input class="form-input" data-field-product-price="${idx}" type="number" min="0" step="0.01" value="${_fieldSetEsc(row.price ?? '')}" placeholder="${_fieldSetEsc(t('field.set.ph_price'))}" style="width:120px;">
<button type="button" class="btn btn-ghost btn-sm" onclick="removeFieldProductRow(${idx})">${_fieldSetEsc(t('field.set.remove'))}</button>
</div>`).join('')
    : `<div style="color:var(--text-3);font-size:11px;padding:8px;background:var(--bg-3);border-radius:6px;">${_fieldSetEsc(t('field.set.no_products'))}</div>`;
}

function rememberFieldProducts() {
  const names = [...document.querySelectorAll('[data-field-product-name]')];
  if (!names.length) return;
  _fieldSettingsDraft.products = names.map((input) => {
    const idx = input.getAttribute('data-field-product-name');
    return {
      id: document.querySelector(`[data-field-product-id="${idx}"]`)?.value || `p_${idx}`,
      name: input.value || '',
      unit: document.querySelector(`[data-field-product-unit="${idx}"]`)?.value || '',
      price: document.querySelector(`[data-field-product-price="${idx}"]`)?.value || ''
    };
  });
}

function readFieldProducts() {
  rememberFieldProducts();
  return (_fieldSettingsDraft.products || []).map((row, idx) => ({
    id: String(row.id || '').trim() || `p_${idx + 1}`,
    name: String(row.name || '').trim(),
    unit: String(row.unit || '').trim() || 'adet',
    price: Math.max(0, Number(row.price) || 0)
  })).filter((row) => row.name);
}

function addFieldProductRow() {
  rememberFieldProducts();
  if (!_fieldSettingsDraft.products) _fieldSettingsDraft.products = [];
  _fieldSettingsDraft.products.push({ id: `p_${Date.now()}`, name: '', unit: 'adet', price: '' });
  renderFieldProductRows();
}

function removeFieldProductRow(index) {
  rememberFieldProducts();
  _fieldSettingsDraft.products.splice(index, 1);
  renderFieldProductRows();
}

function addFieldSchemaRow() {
  rememberFieldSchemaDraft();
  if (!_fieldSettingsDraft.form_schema) _fieldSettingsDraft.form_schema = [];
  const used = (_fieldSettingsDraft.form_schema || []).map((row) => String(row?.key || ''));
  _fieldSettingsDraft.form_schema.push({ key: fieldSchemaKey(t('field.set.new_q'), _fieldSettingsDraft.form_schema.length, used), label: '', type: 'text', options: [], required: false, placeholder: '', min: '', max: '', show_when_result: '' });
  renderFieldSchemaRows();
}

function removeFieldSchemaRow(index) {
  rememberFieldSchemaDraft();
  _fieldSettingsDraft.form_schema.splice(index, 1);
  renderFieldSchemaRows();
}

function moveFieldSchemaRow(index, delta) {
  rememberFieldSchemaDraft();
  const arr = _fieldSettingsDraft.form_schema || [];
  const n = index + delta;
  if (n < 0 || n >= arr.length) return;
  const cur = arr[index];
  arr[index] = arr[n];
  arr[n] = cur;
  renderFieldSchemaRows();
}

function onFieldSchemaTypeChange(index, type) {
  rememberFieldSchemaDraft();
  if (!_fieldSettingsDraft.form_schema?.[index]) return;
  _fieldSettingsDraft.form_schema[index].type = type;
  if (type !== 'select' && type !== 'checks') _fieldSettingsDraft.form_schema[index].options = [];
  renderFieldSchemaRows();
}

async function loadFieldSettingsPage() {
  const card = document.getElementById('field-settings-card');
  if (!card) return;
  const role = currentUser?.role || '';
  const isSuper = mbIsSuperAdmin(role);
  const canView = mbIsFirmAdmin(role);
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
    form_schema: [...(settings.form_schema || [])].map(_normalizeFieldSchemaRow),
    products: [...(settings.products || [])]
  };

  const enabledEl = document.getElementById('field-set-enabled');
  const manageEl = document.getElementById('field-set-manage-agents');
  if (enabledEl) enabledEl.checked = !!settings.enabled;
  if (manageEl) manageEl.checked = !!settings.can_manage_agents;
  renderFieldResultsRows();
  renderFieldDocRows();
  renderFieldProductRows();
  renderFieldSchemaRows();
}

async function saveFieldSettings() {
  const fid = _fieldSettingsFirmId;
  if (!fid) {
    toast(t('field.set.no_firm'), 'warn');
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
    const label = String(labels[i]?.value || '').trim();
    if (!label) continue;
    let key = String(keys[i].value || '').trim();
    if (!key) key = fieldSchemaKey(label, i, schema.map((row) => row.key));
    const type = String(document.querySelector(`[data-field-schema-type-index="${i}"]`)?.value || 'text');
    const optsText = String(document.querySelector(`[data-field-schema-options-index="${i}"]`)?.value || '');
    const options = optsText
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const required = !!document.querySelector(`[data-field-schema-required-index="${i}"]`)?.checked;
    const min = String(document.querySelector(`[data-field-schema-min-index="${i}"]`)?.value || '').trim();
    const max = String(document.querySelector(`[data-field-schema-max-index="${i}"]`)?.value || '').trim();
    const showWhenResult = String(document.querySelector(`[data-field-schema-show-result-index="${i}"]`)?.value || '').trim();
    const placeholder = String(document.querySelector(`[data-field-schema-ph-index="${i}"]`)?.value || '').trim();
    if ((type === 'select' || type === 'checks') && !options.length) {
      toast(t('field.set.need_option'), 'warn');
      return;
    }
    schema.push({ key, label, type, options, required, placeholder, min, max, show_when_result: showWhenResult });
  }

  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const prevService = existing.fieldService || {};
    const fieldService = {
      ...defaultFieldSettings(),
      ...prevService,
      enabled,
      can_manage_agents: canManage,
      result_options: results.length ? results : defaultFieldSettings().result_options,
      document_requirements: docs,
      form_schema: schema,
      products: Array.isArray(prevService.products) ? prevService.products : [],
      pdf: { ...(typeof defaultFieldPdf === 'function' ? defaultFieldPdf() : {}), ...(prevService.pdf || {}) }
    };
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, fieldService } })
    });
    if (typeof logAuditEvent === 'function') await logAuditEvent('field_settings_updated', 'firm', fid, { fieldService });
    if (typeof invalidateFieldSettingsCache === 'function') invalidateFieldSettingsCache(fid);
    toast(t('field.set.saved'), 'ok');
  } catch (e) {
    toast(t('field.set.save_fail'), 'err');
  }
}
