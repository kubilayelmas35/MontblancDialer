// ─────────────────────────────────────────────
// Saha modülü — görevler, atama, sonuç ve belge
// ─────────────────────────────────────────────

let _fieldSettingsCache = {};
let _fieldTasks = [];

function invalidateFieldSettingsCache(fid) {
  if (fid) delete _fieldSettingsCache[fid];
  else _fieldSettingsCache = {};
}

function defaultFirmFieldSettings() {
  return {
    enabled: false,
    can_manage_agents: false,
    result_options: ['satis', 'teklif', 'ziyaret_tamamlandi', 'ulasilamadi'],
    document_requirements: ['kimlik', 'sozlesme'],
    form_schema: [],
    products: [],
    categories: [],
    pdf: { title: '', company: '', intro: '', terms: '', footer: '', vat: 19 }
  };
}

function defaultFieldPdf() {
  return { title: '', company: '', intro: '', terms: '', footer: '', vat: 19 };
}

function fieldNormalizeCategory(row, idx) {
  return {
    id: String(row?.id || `c_${idx + 1}`),
    name: String(row?.name || '').trim()
  };
}

function fieldNormalizeProduct(row, idx) {
  const raw = row?.stock;
  const stock = raw === '' || raw == null ? null : Math.max(0, Math.floor(Number(raw) || 0));
  return {
    id: String(row?.id || `p_${idx + 1}`),
    name: String(row?.name || '').trim(),
    unit: String(row?.unit || '').trim() || 'adet',
    price: Math.max(0, Number(row?.price) || 0),
    stock,
    image: String(row?.image || '').trim(),
    categoryId: String(row?.categoryId || '').trim(),
    sample: !!row?.sample
  };
}

async function getFirmFieldSettings(fid) {
  if (!fid) return defaultFirmFieldSettings();
  if (_fieldSettingsCache[fid]) return _fieldSettingsCache[fid];
  try {
    const r = await sb(`firms?id=eq.${fid}&select=settings`);
    const merged = { ...defaultFirmFieldSettings(), ...(r?.[0]?.settings?.fieldService || {}) };
    if (!Array.isArray(merged.result_options)) merged.result_options = defaultFirmFieldSettings().result_options;
    if (!Array.isArray(merged.document_requirements)) merged.document_requirements = [];
    if (!Array.isArray(merged.form_schema)) merged.form_schema = [];
    merged.categories = (Array.isArray(merged.categories) ? merged.categories : []).map((row, idx) => fieldNormalizeCategory(row, idx)).filter((row) => row.name);
    merged.products = (Array.isArray(merged.products) ? merged.products : []).map((row, idx) => fieldNormalizeProduct(row, idx)).filter((row) => row.name);
    merged.pdf = { ...defaultFieldPdf(), ...(merged.pdf && typeof merged.pdf === 'object' ? merged.pdf : {}) };
    const vat = Number(merged.pdf.vat);
    merged.pdf.vat = Number.isFinite(vat) ? Math.max(0, vat) : 19;
    _fieldSettingsCache[fid] = merged;
    return merged;
  } catch (e) {
    return defaultFirmFieldSettings();
  }
}

function _fEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function _fieldNormalizeSchemaRow(row) {
  return {
    key: String(row?.key || '').trim(),
    label: String(row?.label || '').trim(),
    type: ['text', 'long', 'number', 'select', 'checks', 'date', 'yesno', 'photo', 'sign'].includes(String(row?.type || 'text')) ? String(row?.type) : 'text',
    options: Array.isArray(row?.options) ? row.options : [],
    required: !!row?.required,
    placeholder: String(row?.placeholder || ''),
    min: row?.min ?? '',
    max: row?.max ?? '',
    show_when_result: String(row?.show_when_result || '').trim()
  };
}

const FIELD_RESULT_I18N = {
  satis: 'field.result.sale',
  sale: 'field.result.sale',
  teklif: 'field.result.offer',
  ziyaret_tamamlandi: 'field.result.visit',
  ok: 'field.result.visit',
  ulasilamadi: 'field.result.missed',
  pending: 'field.result.pending',
  cancelled_by_customer: 'field.result.cust_cancel',
  missing_doc: 'field.result.missing_doc'
};

const FIELD_DOC_I18N = {
  kimlik: 'field.doc.id',
  sozlesme: 'field.doc.contract',
  teklif: 'field.doc.offer'
};

function fieldResultLabel(raw) {
  const key = String(raw || '').trim();
  if (!key || key === '—') return '—';
  const i18nKey = FIELD_RESULT_I18N[key.toLowerCase()];
  if (i18nKey && typeof t === 'function') {
    const label = t(i18nKey);
    if (label && label !== i18nKey) return label;
  }
  return key.replaceAll('_', ' ');
}

function fieldIsSale(raw) {
  const key = String(raw || '').toLowerCase();
  return key === 'satis' || key === 'sale';
}

function fieldStatusLabel(status) {
  const map = {
    assigned: 'field.status.assigned',
    in_progress: 'field.status.progress',
    completed: 'field.status.done',
    cancelled: 'field.status.cancel'
  };
  const i18nKey = map[String(status || '').toLowerCase()];
  if (i18nKey && typeof t === 'function') return t(i18nKey);
  return status || '—';
}

function fieldDocLabel(raw) {
  const key = String(raw || '').trim();
  if (!key) return '';
  const i18nKey = FIELD_DOC_I18N[key.toLowerCase()];
  if (i18nKey && typeof t === 'function') {
    const label = t(i18nKey);
    if (label && label !== i18nKey) return label;
  }
  return key;
}

function fieldDocKeyOf(file) {
  const name = String(file?.file_name || '');
  const match = name.match(/^\[([^\]]+)\]\s+/);
  return match ? match[1] : '';
}

function fieldFileTitle(file) {
  const key = fieldDocKeyOf(file);
  const raw = String(file?.file_name || '');
  const name = key ? raw.replace(/^\[[^\]]+\]\s+/, '') : raw;
  if (key.startsWith('photo:')) return `${t('field.photo')} · ${name}`;
  if (key.startsWith('sign:')) return `${t('field.sign')} · ${name}`;
  return key ? `${fieldDocLabel(key)} · ${name}` : name;
}

function fieldTaskMissingDocs(task, files, requirements) {
  const list = (files || []).filter((file) => file.task_id === task.id);
  const req = (requirements || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!req.length) return false;
  const tagged = list.map(fieldDocKeyOf).filter(Boolean);
  if (!tagged.length) return list.length < req.length;
  return req.some((key) => !tagged.includes(key));
}

function fieldSlotOf(appointment) {
  const slot = appointment?.takvim_slots;
  return Array.isArray(slot) ? slot[0] : slot;
}

function fieldApptWhen(appointment) {
  if (typeof _etWall === 'function') return _etWall(appointment?.termin_tarih, fieldSlotOf(appointment));
  return { text: '' };
}

function fieldNextLocal(iso) {
  if (!iso || typeof mbStampParts !== 'function') return '';
  const parts = mbStampParts(iso);
  if (!parts?.year) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function fieldNextToIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const utcGuess = new Date(`${raw}:00Z`);
  if (Number.isNaN(utcGuess.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(utcGuess);
  const map = {};
  formatted.forEach((part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });
  const asBerlin = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
  return new Date(utcGuess.getTime() - (asBerlin - utcGuess.getTime())).toISOString();
}

function fieldPhotoKey(key) {
  return `photo:${String(key || '').trim()}`;
}

function fieldMarkKey(kind, key) {
  return `${kind === 'sign' ? 'sign' : 'photo'}:${String(key || '').trim()}`;
}

function fieldFileThumb(file, attr) {
  const href = _fEsc(file?.file_url);
  const title = _fEsc(fieldFileTitle(file));
  const name = String(file?.file_name || '');
  const key = fieldDocKeyOf(file);
  const image = key.startsWith('photo:') || key.startsWith('sign:') || /\.(png|jpe?g|webp|gif)$/i.test(name);
  const mark = attr ? ` ${attr}` : '';
  if (!image) return `<a class="btn btn-ghost btn-sm"${mark} target="_blank" rel="noopener" href="${href}">${title}</a>`;
  return `<a${mark} target="_blank" rel="noopener" href="${href}" title="${title}"><img src="${href}" alt="${title}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;display:block;border:1px solid var(--border);"></a>`;
}

function fieldQuestionMarkup(task, field, payload, docs) {
  const ff = _fieldNormalizeSchemaRow(field);
  if (!ff.key || !ff.label) return '';
  const value = payload?.[ff.key] || '';
  const hidden = ff.show_when_result && String(task.result_key || '') !== String(ff.show_when_result) ? 'display:none;' : '';
  const reqMark = ff.required ? ' *' : '';
  const reqAttr = ff.required ? 'required' : '';
  let inner = '';
  if (ff.type === 'long') {
    inner = `<textarea class="form-input" rows="3" id="field-extra-${task.id}-${_fEsc(ff.key)}" placeholder="${_fEsc(ff.placeholder)}">${_fEsc(value)}</textarea>`;
  } else if (ff.type === 'checks') {
    const picked = Array.isArray(value) ? value.map(String) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    inner = `<div id="field-extra-${task.id}-${_fEsc(ff.key)}" style="display:flex;flex-direction:column;gap:4px;">${(ff.options || []).map((opt) => `<label style="font-size:12px;display:flex;align-items:center;gap:6px;"><input type="checkbox" value="${_fEsc(opt)}" ${picked.includes(String(opt)) ? 'checked' : ''}> ${_fEsc(opt)}</label>`).join('')}</div>`;
  } else if (ff.type === 'number') {
    const minAttr = ff.min !== '' ? `min="${_fEsc(ff.min)}"` : '';
    const maxAttr = ff.max !== '' ? `max="${_fEsc(ff.max)}"` : '';
    inner = `<input type="number" ${reqAttr} ${minAttr} ${maxAttr} class="form-input" id="field-extra-${task.id}-${_fEsc(ff.key)}" value="${_fEsc(value)}">`;
  } else if (ff.type === 'date') {
    inner = `<input type="date" ${reqAttr} class="form-input" id="field-extra-${task.id}-${_fEsc(ff.key)}" value="${_fEsc(value)}">`;
  } else if (ff.type === 'yesno') {
    inner = `<select class="form-input" id="field-extra-${task.id}-${_fEsc(ff.key)}"><option value="">${_fEsc(t('field.pick'))}</option><option value="evet" ${value === 'evet' ? 'selected' : ''}>${_fEsc(t('field.yes'))}</option><option value="hayir" ${value === 'hayir' ? 'selected' : ''}>${_fEsc(t('field.no'))}</option></select>`;
  } else if (ff.type === 'select') {
    inner = `<select class="form-input" id="field-extra-${task.id}-${_fEsc(ff.key)}"><option value="">${_fEsc(t('field.pick'))}</option>${(ff.options || []).map((o) => `<option value="${_fEsc(o)}" ${String(value) === String(o) ? 'selected' : ''}>${_fEsc(o)}</option>`).join('')}</select>`;
  } else if (ff.type === 'photo') {
    const mine = (docs || []).filter((file) => fieldDocKeyOf(file) === fieldPhotoKey(ff.key));
    const thumbs = mine.map((file) => fieldFileThumb(file, `data-field-photo="${_fEsc(task.id)}:${_fEsc(ff.key)}"`)).join('');
    inner = `<label class="btn btn-ghost btn-sm" style="cursor:pointer;width:fit-content;">${_fEsc(t('field.photo_add'))}<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="uploadFieldTaskFile('${task.id}', this, '${_fEsc(ff.key)}', 'photo')"></label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${thumbs}</div>`;
  } else if (ff.type === 'sign') {
    const mine = (docs || []).filter((file) => fieldDocKeyOf(file) === fieldMarkKey('sign', ff.key));
    const thumbs = mine.map((file) => fieldFileThumb(file, `data-field-sign="${_fEsc(task.id)}:${_fEsc(ff.key)}"`)).join('');
    inner = `<canvas id="field-sign-${task.id}-${_fEsc(ff.key)}" width="640" height="160" style="width:100%;height:120px;background:var(--bg);border:1px solid var(--border);border-radius:8px;touch-action:none;" onpointerdown="fieldSignStart(event)" onpointermove="fieldSignMove(event)" onpointerup="fieldSignEnd(event)" onpointercancel="fieldSignEnd(event)"></canvas><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><button type="button" class="btn btn-ghost btn-sm" onclick="fieldSignClear('${task.id}','${_fEsc(ff.key)}')">${_fEsc(t('field.sign_clear'))}</button><button type="button" class="btn btn-primary btn-sm" onclick="fieldSignSave('${task.id}','${_fEsc(ff.key)}')">${_fEsc(t('field.sign_save'))}</button></div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${thumbs}</div>`;
  } else {
    inner = `<input ${reqAttr} class="form-input" id="field-extra-${task.id}-${_fEsc(ff.key)}" placeholder="${_fEsc(ff.placeholder)}" value="${_fEsc(value)}">`;
  }
  return `<div data-field-when-task="${task.id}" data-field-when="${_fEsc(ff.show_when_result)}" style="margin-top:8px;${hidden}"><div class="form-row"><label class="form-label">${_fEsc(ff.label)}${reqMark}</label>${inner}</div></div>`;
}

function fieldQuickStatus(taskId, status) {
  const sel = document.getElementById(`field-status-${taskId}`);
  if (sel) sel.value = status;
  saveFieldTaskUpdate(taskId);
}

function fieldSignPoint(canvas, event) {
  const src = event.touches ? event.touches[0] : event;
  const rect = canvas.getBoundingClientRect();
  return [
    (src.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1)),
    (src.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1))
  ];
}

function fieldSignStart(event) {
  const canvas = event.currentTarget;
  const ctx = canvas.getContext('2d');
  const [x, y] = fieldSignPoint(canvas, event);
  ctx.strokeStyle = getComputedStyle(document.body).color || '#111';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  canvas._ink = true;
  canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function fieldSignMove(event) {
  const canvas = event.currentTarget;
  if (!canvas?._ink) return;
  const ctx = canvas.getContext('2d');
  const [x, y] = fieldSignPoint(canvas, event);
  ctx.lineTo(x, y);
  ctx.stroke();
  event.preventDefault();
}

function fieldSignEnd(event) {
  if (event?.currentTarget) event.currentTarget._ink = false;
}

function fieldSignClear(taskId, key) {
  const canvas = document.getElementById(`field-sign-${taskId}-${key}`);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function fieldSignSave(taskId, key) {
  const canvas = document.getElementById(`field-sign-${taskId}-${key}`);
  if (!canvas) return;
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const ink = pixels.some((value) => value !== 0);
  if (!ink) {
    toast(t('field.sign_empty'), 'warn');
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], 'imza.png', { type: 'image/png' });
    uploadFieldTaskFile(taskId, { files: [file] }, key, 'sign');
  }, 'image/png');
}

const FIELD_HOUSE_KEYS = ['hausart', 'baujahr', 'qm', 'heizung', 'alter_der_heizung', 'verbrauch_pro_jahr', 'personen', 'interesse_an_pv'];

function fieldBriefValue(key, raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'boolean' || key === 'interesse_an_pv') {
    if (raw === true || raw === 'true' || raw === 'evet') return t('field.yes');
    if (raw === false || raw === 'false' || raw === 'hayir') return t('field.no');
  }
  if (typeof raw === 'object') return '';
  return String(raw);
}

function fieldBriefLabel(key) {
  const i18nKey = `field.house.${key}`;
  const label = typeof t === 'function' ? t(i18nKey) : key;
  return label && label !== i18nKey ? label : String(key || '').replaceAll('_', ' ');
}

function fieldBriefMarkup(ap) {
  if (!ap) return '';
  const rows = [];
  const push = (key, raw) => {
    const shown = fieldBriefValue(key, raw);
    if (!shown) return;
    rows.push(`<div><span style="color:var(--text-3);">${_fEsc(fieldBriefLabel(key))}:</span> ${_fEsc(shown)}</div>`);
  };
  FIELD_HOUSE_KEYS.forEach((key) => push(key, ap[key]));
  const ek = ap.form_ek && typeof ap.form_ek === 'object' ? ap.form_ek : {};
  Object.keys(ek).forEach((key) => {
    if (FIELD_HOUSE_KEYS.includes(key)) return;
    push(key, ek[key]);
  });
  if (ap.qc_notu) rows.push(`<div><span style="color:var(--text-3);">${_fEsc(t('field.qc_note'))}:</span> ${_fEsc(ap.qc_notu)}</div>`);
  if (!rows.length) return '';
  return `<div style="margin-top:8px;padding:8px;border-radius:6px;background:var(--bg-3);font-size:12px;display:flex;flex-direction:column;gap:3px;"><b>${_fEsc(t('field.brief'))}</b>${rows.join('')}</div>`;
}

function fieldSyncConditional(taskId) {
  const result = document.getElementById(`field-result-${taskId}`)?.value || '';
  document.querySelectorAll(`[data-field-when-task="${taskId}"]`).forEach((el) => {
    const when = el.getAttribute('data-field-when') || '';
    el.style.display = !when || when === result ? '' : 'none';
  });
}

async function fieldLoadAppointments(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return [];
  const idList = list.join(',');
  const rich = `appointments?id=in.(${idList})&select=id,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,agent_notu,qc_notu,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,form_ek,termin_tarih,campaigns(name),customers(name),takvim_slots!slot_id(tarih,baslangic_saat,bitis_saat)`;
  const rows = await sb(rich).catch(() => null);
  if (Array.isArray(rows)) return rows;
  return (await sb(`appointments?id=in.(${idList})&select=id,nachname,telefonnummer,strasse,plz,ortschaft,agent_notu,termin_tarih`).catch(() => [])) || [];
}

function renderFieldKpi(tasks, files, fs) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'completed').length;
  const sales = tasks.filter((t) => fieldIsSale(t.result_key)).length;
  let missing = 0;
  tasks.forEach((t) => {
    if (fieldTaskMissingDocs(t, files, fs.document_requirements)) missing++;
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
  set('field-kpi-total', total);
  set('field-kpi-done', done);
  set('field-kpi-sales', sales);
  set('field-kpi-missing-doc', missing);
}

let _fieldDay = 'route';

function fieldBerlinToday() {
  if (typeof mbBerlinDay === 'function') return mbBerlinDay(new Date().toISOString());
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function fieldTaskDay(appointment) {
  const slot = fieldSlotOf(appointment);
  return slot?.tarih || String(appointment?.termin_tarih || '').slice(0, 10);
}

function fieldTaskVisible(task, appointment) {
  if (_fieldDay === 'all') return true;
  if (_fieldDay === 'today') return fieldTaskDay(appointment) === fieldBerlinToday();
  if (_fieldDay === 'route') return fieldTaskDay(appointment) === (typeof fieldRouteActiveDay === 'function' ? fieldRouteActiveDay() : fieldBerlinToday());
  return task.status === 'assigned' || task.status === 'in_progress';
}

function fieldSetDay(day) {
  _fieldDay = day || 'open';
  loadFieldPage();
}

function fieldSyncDayButtons() {
  document.querySelectorAll('[data-field-day]').forEach((btn) => {
    const on = btn.getAttribute('data-field-day') === _fieldDay;
    btn.classList.toggle('btn-primary', on);
    btn.classList.toggle('btn-ghost', !on);
  });
}

async function loadFieldPage() {
  const listEl = document.getElementById('field-task-list');
  if (!listEl || !currentUser) return;
  const fid = getActiveFirmId() || currentUser.firm_id;
  if (!fid) {
    listEl.innerHTML = `<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">${_fEsc(t('field.empty.firm'))}</div>`;
    return;
  }
  _fieldTasks = [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({
        p_actor_user_id: currentUser.id,
        p_firm_id: fid || null
      })
    });
    if (res.ok) _fieldTasks = (await res.json().catch(() => [])) || [];
  } catch (e) {}
  const fs = await getFirmFieldSettings(fid);
  if (!fs.enabled && !mbIsSuperAdmin() && !_fieldTasks.length) {
    listEl.innerHTML = `<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">${_fEsc(t('field.empty.off'))}</div>`;
    return;
  }
  listEl.innerHTML = `<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">${_fEsc(t('field.loading'))}</div>`;
  if (!_fieldTasks.length) {
    listEl.innerHTML = `<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">${_fEsc(t('field.empty.none'))}</div>`;
    return;
  }

  const apptIds = [...new Set(_fieldTasks.map((x) => x.appointment_id).filter(Boolean))];
  const assigneeIds = [...new Set(_fieldTasks.map((x) => x.assigned_to).filter(Boolean))];
  const appts = await fieldLoadAppointments(apptIds);
  const users = assigneeIds.length
    ? (await sb(`users?id=in.(${assigneeIds.join(',')})&select=id,name`).catch(() => [])) || []
    : [];
  const files = (await sb(`field_task_files?firm_id=eq.${fid}&select=id,task_id,file_name,file_url,created_at&order=created_at.desc`).catch(() => [])) || [];
  const apptMap = {};
  appts.forEach((a) => (apptMap[a.id] = a));
  const userMap = {};
  users.forEach((u) => (userMap[u.id] = u.name || u.id));
  const fileMap = {};
  files.forEach((f) => {
    if (!fileMap[f.task_id]) fileMap[f.task_id] = [];
    fileMap[f.task_id].push(f);
  });
  renderFieldKpi(_fieldTasks, files, fs);
  fieldSyncDayButtons();
  if (typeof fieldRefreshRoute === 'function') fieldRefreshRoute(_fieldTasks, apptMap);
  const visible = _fieldTasks.filter((task) => fieldTaskVisible(task, apptMap[task.appointment_id] || {}));
  if (!visible.length) {
    listEl.innerHTML = `<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">${_fEsc(t('field.empty.filter'))}</div>`;
    return;
  }

  listEl.innerHTML = visible
    .map((task) => {
      const ap = apptMap[task.appointment_id] || {};
      const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
      const camp = ap.campaigns?.name || (Array.isArray(ap.campaigns) ? ap.campaigns[0]?.name : '');
      const biz = ap.customers?.name || (Array.isArray(ap.customers) ? ap.customers[0]?.name : '');
      const when = fieldApptWhen(ap).text;
      const docs = fileMap[task.id] || [];
      const payload = task.result_payload || {};
      const sample = payload.sample === true ? `<span class="badge badge-blue" style="margin-left:6px;">${_fEsc(t('fieldops.sample'))}</span>` : '';
      const docTypes = (fs.document_requirements || []).map((item) => String(item || '').trim()).filter(Boolean);
      const docSelect = docTypes.length
        ? `<select class="form-input" id="field-doctype-${task.id}" style="min-width:140px;font-size:12px;"><option value="">${_fEsc(t('field.doc_type'))}</option>${docTypes.map((key) => `<option value="${_fEsc(key)}">${_fEsc(fieldDocLabel(key))}</option>`).join('')}</select>`
        : '';
      return `<div class="card" id="field-card-${task.id}" style="padding:12px;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div>
<div style="font-size:14px;font-weight:800;">${_fEsc(ap.nachname || t('field.customer'))}${sample}</div>
<div style="font-size:11px;color:var(--text-3);">${_fEsc(ap.telefonnummer || '—')} · ${_fEsc(addr || t('field.no_address'))}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:4px;">${_fEsc(t('field.assignee'))}: ${_fEsc(userMap[task.assigned_to] || '—')} · ${_fEsc(t('field.status'))}: <b>${_fEsc(fieldStatusLabel(task.status))}</b></div>
${when ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_fEsc(t('field.appt'))}: ${_fEsc(when)}</div>` : ''}
${camp || biz ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${[_fEsc(biz ? `${t('field.biz')}: ${biz}` : ''), _fEsc(camp ? `${t('field.camp')}: ${camp}` : '')].filter(Boolean).join(' · ')}</div>` : ''}
</div>
<div style="display:flex;gap:6px;align-items:center;">
<a class="btn btn-ghost btn-sm" href="${ap.telefonnummer ? `tel:${_fEsc(ap.telefonnummer)}` : '#'}" ${ap.telefonnummer ? '' : 'style="pointer-events:none;opacity:.45;"'}>${_fEsc(t('field.call'))}</a>
<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(addr || '')}" ${addr ? '' : 'style="pointer-events:none;opacity:.45;"'}>${_fEsc(t('field.map'))}</a>
<button type="button" class="btn btn-primary btn-sm" onclick="fieldOpenQuote('${task.id}')">${_fEsc(t('field.quote.open'))}</button>
</div>
</div>
${payload.quote?.gross ? `<div style="margin-top:8px;font-size:12px;font-weight:800;">${_fEsc(t('field.quote.saved'))}: ${_fEsc(typeof fieldMoney === 'function' ? fieldMoney(payload.quote.gross) : payload.quote.gross)}</div>` : ''}
${fieldBriefMarkup(ap)}
${ap.agent_notu ? `<div style="margin-top:8px;padding:8px;border-radius:6px;background:var(--bg-3);font-size:12px;"><b>${_fEsc(t('field.call_note'))}:</b> ${_fEsc(ap.agent_notu)}</div>` : ''}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:8px;">
<div class="form-row"><label class="form-label">${_fEsc(t('field.status'))}</label>
<select class="form-input" id="field-status-${task.id}">
<option value="assigned" ${task.status === 'assigned' ? 'selected' : ''}>${_fEsc(t('field.status.assigned'))}</option>
<option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>${_fEsc(t('field.status.progress'))}</option>
<option value="completed" ${task.status === 'completed' ? 'selected' : ''}>${_fEsc(t('field.status.done'))}</option>
<option value="cancelled" ${task.status === 'cancelled' ? 'selected' : ''}>${_fEsc(t('field.status.cancel'))}</option>
</select></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.result'))}</label>
<select class="form-input" id="field-result-${task.id}" onchange="fieldSyncConditional('${task.id}')">
<option value="">${_fEsc(t('field.pick'))}</option>
${(fs.result_options || []).map((r) => `<option value="${_fEsc(r)}" ${task.result_key === r ? 'selected' : ''}>${_fEsc(fieldResultLabel(r))}</option>`).join('')}
</select></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.next'))} <span style="font-weight:500;color:var(--text-3);">${_fEsc(t('field.next_hint'))}</span></label>
<input type="datetime-local" class="form-input" id="field-next-${task.id}" value="${_fEsc(fieldNextLocal(task.next_action_at))}"></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(t('field.note'))}</label>
<textarea class="form-input" rows="2" id="field-note-${task.id}" placeholder="${_fEsc(t('field.note_ph'))}">${_fEsc(task.notes || '')}</textarea></div>
<div style="margin-top:10px;font-size:11px;font-weight:800;color:var(--text-3);">${_fEsc(t('field.questions'))}</div>
${(fs.form_schema || []).map((field) => fieldQuestionMarkup(task, field, payload, docs)).join('')}
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldQuickStatus('${task.id}','in_progress')">${_fEsc(t('field.action.go'))}</button>
<button type="button" class="btn btn-primary btn-sm" onclick="fieldQuickStatus('${task.id}','completed')">${_fEsc(t('field.action.done'))}</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldQuickStatus('${task.id}','cancelled')">${_fEsc(t('field.action.cancel'))}</button>
${docSelect}
<label class="btn btn-ghost btn-sm" style="cursor:pointer;">
${_fEsc(t('field.upload'))}
<input type="file" style="display:none;" onchange="uploadFieldTaskFile('${task.id}', this)">
</label>
<button class="btn btn-primary btn-sm" onclick="saveFieldTaskUpdate('${task.id}')">${_fEsc(t('field.save'))}</button>
</div>
${docs.filter((file) => { const key = fieldDocKeyOf(file); return !key.startsWith('photo:') && !key.startsWith('sign:'); }).length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${docs.filter((file) => { const key = fieldDocKeyOf(file); return !key.startsWith('photo:') && !key.startsWith('sign:'); })
        .slice(0, 6)
        .map((f) => fieldFileThumb(f))
        .join('')}</div>` : ''}
</div>`;
    })
    .join('');
}

async function saveFieldTaskUpdate(taskId) {
  const row = _fieldTasks.find((x) => x.id === taskId);
  if (!row) return;
  const fid = row.firm_id;
  const fs = await getFirmFieldSettings(fid);
  const status = document.getElementById(`field-status-${taskId}`)?.value || row.status;
  const resultKey = document.getElementById(`field-result-${taskId}`)?.value || null;
  const notes = document.getElementById(`field-note-${taskId}`)?.value || '';
  const payload = { ...(row.result_payload || {}) };
  for (const f of fs.form_schema || []) {
    const ff = _fieldNormalizeSchemaRow(f);
    if (!ff.key) continue;
    if (ff.show_when_result && String(resultKey || '') !== String(ff.show_when_result)) continue;
    if (ff.type === 'photo' || ff.type === 'sign') {
      const attr = ff.type === 'sign' ? 'data-field-sign' : 'data-field-photo';
      const has = document.querySelector(`[${attr}="${taskId}:${ff.key}"]`);
      if (ff.required && !has) {
        toast(tReplace(ff.type === 'sign' ? 'field.need_sign' : 'field.need_photo', { label: ff.label || ff.key }), 'warn');
        return;
      }
      continue;
    }
    if (ff.type === 'checks') {
      const picked = [...document.querySelectorAll(`#field-extra-${taskId}-${ff.key} input:checked`)].map((el) => el.value);
      if (ff.required && !picked.length) {
        toast(tReplace('field.need_checks', { label: ff.label || ff.key }), 'warn');
        return;
      }
      payload[ff.key] = picked;
      continue;
    }
    const val = document.getElementById(`field-extra-${taskId}-${ff.key}`)?.value || '';
    if (ff.required && !String(val).trim()) {
      toast(tReplace('field.required', { label: ff.label || ff.key }), 'warn');
      return;
    }
    if (ff.type === 'number' && String(val).trim()) {
      const num = Number(val);
      if (Number.isNaN(num)) {
        toast(tReplace('field.bad_number', { label: ff.label || ff.key }), 'warn');
        return;
      }
      if (ff.min !== '' && num < Number(ff.min)) {
        toast(tReplace('field.min', { label: ff.label || ff.key, min: ff.min }), 'warn');
        return;
      }
      if (ff.max !== '' && num > Number(ff.max)) {
        toast(tReplace('field.max', { label: ff.label || ff.key, max: ff.max }), 'warn');
        return;
      }
    }
    payload[ff.key] = val;
  }
  const body = {
    status,
    result_key: resultKey,
    notes,
    result_payload: payload,
    next_action_at: fieldNextToIso(document.getElementById(`field-next-${taskId}`)?.value || ''),
    completed_at: status === 'completed' ? new Date().toISOString() : null
  };
  try {
    await sb(`field_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(body)
    });
  } catch (e) {
    toast(t('field.save_fail'), 'err');
    return;
  }
  toast(t('field.saved'), 'ok');
  await loadFieldPage();
}

async function uploadFieldTaskFile(taskId, input, fieldKey, kind) {
  const file = input?.files?.[0];
  if (input && 'value' in input) input.value = '';
  if (!file) return;
  const task = _fieldTasks.find((x) => x.id === taskId);
  if (!task) return;
  const docType = String(document.getElementById(`field-doctype-${taskId}`)?.value || '').trim();
  const fs = await getFirmFieldSettings(task.firm_id);
  const needsType = (fs.document_requirements || []).some((item) => String(item || '').trim());
  const photoKey = String(fieldKey || '').trim();
  if (!photoKey && needsType && !docType) {
    toast(t('field.need_doc_type'), 'warn');
    return;
  }
  const storedName = photoKey ? `[${fieldMarkKey(kind, photoKey)}] ${file.name}` : (docType ? `[${docType}] ${file.name}` : file.name);
  const path = `${task.firm_id}/${taskId}/${Date.now()}_${String(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  let url = '';
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/field-docs/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    url = `${SB_URL}/storage/v1/object/public/field-docs/${path}`;
  } catch (e) {
    toast(t('field.upload_fail'), 'err');
    return;
  }
  try {
    await sb('field_task_files', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        task_id: taskId,
        firm_id: task.firm_id,
        uploaded_by: currentUser.id,
        file_url: url,
        file_name: storedName,
        mime_type: file.type || null,
        file_size: file.size
      })
    });
  } catch (e) {
    toast(t('field.file_fail'), 'err');
    return;
  }
  toast(t('field.uploaded'), 'ok');
  await loadFieldPage();
}

async function createFieldTaskFromAppointment(appointmentId, assignedTo) {
  const appts = await sb(`appointments?id=eq.${appointmentId}&select=id,firm_id,contact_id`).catch(() => []);
  const ap = appts?.[0];
  if (!ap?.id || !assignedTo) {
    toast(t('field.missing_info'), 'warn');
    return;
  }
  const fs = await getFirmFieldSettings(ap.firm_id);
  if (!fs.enabled) {
    toast(t('field.off'), 'warn');
    return;
  }
  const ex =
    (await sb(`field_tasks?appointment_id=eq.${appointmentId}&assigned_to=eq.${assignedTo}&select=id&limit=1`).catch(() => [])) ||
    [];
  if (ex.length) {
    toast(t('field.already'), 'warn');
    return true;
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_field_task_from_admin`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({
        p_actor_user_id: currentUser.id,
        p_appointment_id: ap.id,
        p_assigned_to: assignedTo
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const raw = String(err?.message || err?.hint || `HTTP ${res.status}`);
      if (raw.includes('already_assigned')) {
        toast(t('field.already_appt'), 'warn');
        return true;
      }
      if (raw.includes('actor_not_allowed')) {
        toast(t('field.need_admin'), 'err');
        return false;
      }
      throw new Error(raw);
    }
    toast(t('field.assign_ok'), 'ok');
    return true;
  } catch (e) {
    toast(tReplace('field.assign_fail', { msg: e?.message || t('field.unknown') }), 'err');
    return false;
  }
}

async function openFieldAssignModal(appointmentId, firmId) {
  const fs = await getFirmFieldSettings(firmId);
  if (!fs.enabled) {
    toast(t('field.off'), 'warn');
    return;
  }
  const users =
    (await sb(`users?firm_id=eq.${firmId}&role=eq.field_agent&is_active=eq.true&select=id,name&order=name.asc`).catch(() => [])) ||
    [];
  if (!users.length) {
    toast(t('field.no_agent'), 'warn');
    return;
  }
  const opts = users.map((u) => `<option value="${u.id}">${_fEsc(u.name)}</option>`).join('');
  document.getElementById('field-assign-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'field-assign-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:430px;">
<div class="modal-hdr"><div class="modal-title">${_fEsc(t('field.assign'))}</div><button class="modal-close" onclick="document.getElementById('field-assign-modal').remove()">✕</button></div>
<div style="padding:16px 20px;">
<div class="form-row"><label class="form-label">${_fEsc(t('field.agent'))}</label>
<select class="form-input" id="field-assign-user">${opts}</select></div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('field-assign-modal').remove()">${_fEsc(t('field.cancel'))}</button>
<button class="btn btn-primary" onclick="confirmFieldAssign('${appointmentId}')">${_fEsc(t('field.assign_btn'))}</button>
</div>
</div>`;
  ov.onclick = (e) => {
    if (e.target === ov) ov.remove();
  };
  document.body.appendChild(ov);
}

async function confirmFieldAssign(appointmentId) {
  const uid = document.getElementById('field-assign-user')?.value;
  if (!uid) return;
  const ok = await createFieldTaskFromAppointment(appointmentId, uid);
  if (!ok) return;
  document.getElementById('field-assign-modal')?.remove();
  if (document.getElementById('page-field')?.classList.contains('active')) {
    await loadFieldPage();
  }
}
