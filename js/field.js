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
    form_schema: []
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
    type: ['text', 'number', 'select', 'date'].includes(String(row?.type || 'text')) ? String(row?.type) : 'text',
    options: Array.isArray(row?.options) ? row.options : [],
    required: !!row?.required,
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
  sozlesme: 'field.doc.contract'
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
  const rich = `appointments?id=in.(${idList})&select=id,nachname,telefonnummer,strasse,plz,ortschaft,agent_notu,termin_tarih,campaigns(name),customers(name),takvim_slots!slot_id(tarih,baslangic_saat,bitis_saat)`;
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

  listEl.innerHTML = _fieldTasks
    .map((t) => {
      const ap = apptMap[t.appointment_id] || {};
      const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
      const camp = ap.campaigns?.name || (Array.isArray(ap.campaigns) ? ap.campaigns[0]?.name : '');
      const biz = ap.customers?.name || (Array.isArray(ap.customers) ? ap.customers[0]?.name : '');
      const when = fieldApptWhen(ap).text;
      const docs = fileMap[t.id] || [];
      const payload = t.result_payload || {};
      const sample = payload.sample === true ? `<span class="badge badge-blue" style="margin-left:6px;">${_fEsc(t('fieldops.sample'))}</span>` : '';
      const docTypes = (fs.document_requirements || []).map((item) => String(item || '').trim()).filter(Boolean);
      const docSelect = docTypes.length
        ? `<select class="form-input" id="field-doctype-${t.id}" style="min-width:140px;font-size:12px;"><option value="">${_fEsc(t('field.doc_type'))}</option>${docTypes.map((key) => `<option value="${_fEsc(key)}">${_fEsc(fieldDocLabel(key))}</option>`).join('')}</select>`
        : '';
      return `<div class="card" style="padding:12px;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div>
<div style="font-size:14px;font-weight:800;">${_fEsc(ap.nachname || t('field.customer'))}${sample}</div>
<div style="font-size:11px;color:var(--text-3);">${_fEsc(ap.telefonnummer || '—')} · ${_fEsc(addr || t('field.no_address'))}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:4px;">${_fEsc(t('field.assignee'))}: ${_fEsc(userMap[t.assigned_to] || '—')} · ${_fEsc(t('field.status'))}: <b>${_fEsc(fieldStatusLabel(t.status))}</b></div>
${when ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_fEsc(t('field.appt'))}: ${_fEsc(when)}</div>` : ''}
${camp || biz ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${[_fEsc(biz ? `${t('field.biz')}: ${biz}` : ''), _fEsc(camp ? `${t('field.camp')}: ${camp}` : '')].filter(Boolean).join(' · ')}</div>` : ''}
</div>
<div style="display:flex;gap:6px;align-items:center;">
<a class="btn btn-ghost btn-sm" href="${ap.telefonnummer ? `tel:${_fEsc(ap.telefonnummer)}` : '#'}" ${ap.telefonnummer ? '' : 'style="pointer-events:none;opacity:.45;"'}>${_fEsc(t('field.call'))}</a>
<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(addr || '')}" ${addr ? '' : 'style="pointer-events:none;opacity:.45;"'}>${_fEsc(t('field.map'))}</a>
</div>
</div>
${ap.agent_notu ? `<div style="margin-top:8px;padding:8px;border-radius:6px;background:var(--bg-3);font-size:12px;"><b>${_fEsc(t('field.call_note'))}:</b> ${_fEsc(ap.agent_notu)}</div>` : ''}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:8px;">
<div class="form-row"><label class="form-label">${_fEsc(t('field.status'))}</label>
<select class="form-input" id="field-status-${t.id}">
<option value="assigned" ${t.status === 'assigned' ? 'selected' : ''}>${_fEsc(t('field.status.assigned'))}</option>
<option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>${_fEsc(t('field.status.progress'))}</option>
<option value="completed" ${t.status === 'completed' ? 'selected' : ''}>${_fEsc(t('field.status.done'))}</option>
<option value="cancelled" ${t.status === 'cancelled' ? 'selected' : ''}>${_fEsc(t('field.status.cancel'))}</option>
</select></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.result'))}</label>
<select class="form-input" id="field-result-${t.id}" onchange="fieldSyncConditional('${t.id}')">
<option value="">${_fEsc(t('field.pick'))}</option>
${(fs.result_options || []).map((r) => `<option value="${_fEsc(r)}" ${t.result_key === r ? 'selected' : ''}>${_fEsc(fieldResultLabel(r))}</option>`).join('')}
</select></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.next'))} <span style="font-weight:500;color:var(--text-3);">${_fEsc(t('field.next_hint'))}</span></label>
<input type="datetime-local" class="form-input" id="field-next-${t.id}" value="${_fEsc(fieldNextLocal(t.next_action_at))}"></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(t('field.note'))}</label>
<textarea class="form-input" rows="2" id="field-note-${t.id}" placeholder="${_fEsc(t('field.note_ph'))}">${_fEsc(t.notes || '')}</textarea></div>
${(fs.form_schema || [])
  .map((f) => {
    const ff = _fieldNormalizeSchemaRow(f);
    const v = payload?.[ff.key] || '';
    if (!ff.key || !ff.label) return '';
    const reqAttr = ff.required ? 'required' : '';
    const minAttr = ff.min !== '' ? `min="${_fEsc(ff.min)}"` : '';
    const maxAttr = ff.max !== '' ? `max="${_fEsc(ff.max)}"` : '';
    const reqMark = ff.required ? ' *' : '';
    const hidden = ff.show_when_result && String(t.result_key || '') !== String(ff.show_when_result) ? 'display:none;' : '';
    const wrap = (inner) => `<div data-field-when-task="${t.id}" data-field-when="${_fEsc(ff.show_when_result)}" style="margin-top:8px;${hidden}">${inner}</div>`;
    if (ff.type === 'number') {
      return wrap(`<div class="form-row"><label class="form-label">${_fEsc(ff.label)}${reqMark}</label><input type="number" ${reqAttr} ${minAttr} ${maxAttr} class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`);
    }
    if (ff.type === 'date') {
      return wrap(`<div class="form-row"><label class="form-label">${_fEsc(ff.label)}${reqMark}</label><input type="date" ${reqAttr} class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`);
    }
    if (ff.type === 'select') {
      return wrap(`<div class="form-row"><label class="form-label">${_fEsc(ff.label)}${reqMark}</label><select ${reqAttr} class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}"><option value="">${_fEsc(t('field.pick'))}</option>${(ff.options || []).map((o) => `<option value="${_fEsc(o)}" ${String(v) === String(o) ? 'selected' : ''}>${_fEsc(o)}</option>`).join('')}</select></div>`);
    }
    return wrap(`<div class="form-row"><label class="form-label">${_fEsc(ff.label)}${reqMark}</label><input ${reqAttr} class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`);
  })
  .join('')}
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
${docSelect}
<label class="btn btn-ghost btn-sm" style="cursor:pointer;">
${_fEsc(t('field.upload'))}
<input type="file" style="display:none;" onchange="uploadFieldTaskFile('${t.id}', this)">
</label>
<button class="btn btn-primary btn-sm" onclick="saveFieldTaskUpdate('${t.id}')">${_fEsc(t('field.save'))}</button>
</div>
${docs.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${docs
        .slice(0, 6)
        .map((f) => `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${_fEsc(f.file_url)}">${_fEsc(fieldFileTitle(f))}</a>`)
        .join('')}</div>` : ''}
</div>`;
    })
    .join('');
}

async function saveFieldTaskUpdate(taskId) {
  const t = _fieldTasks.find((x) => x.id === taskId);
  if (!t) return;
  const fid = t.firm_id;
  const fs = await getFirmFieldSettings(fid);
  const status = document.getElementById(`field-status-${taskId}`)?.value || t.status;
  const resultKey = document.getElementById(`field-result-${taskId}`)?.value || null;
  const notes = document.getElementById(`field-note-${taskId}`)?.value || '';
  const payload = { ...(t.result_payload || {}) };
  for (const f of fs.form_schema || []) {
    const ff = _fieldNormalizeSchemaRow(f);
    if (!ff.key) continue;
    if (ff.show_when_result && String(resultKey || '') !== String(ff.show_when_result)) continue;
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

async function uploadFieldTaskFile(taskId, input) {
  const file = input?.files?.[0];
  input.value = '';
  if (!file) return;
  const task = _fieldTasks.find((x) => x.id === taskId);
  if (!task) return;
  const docType = String(document.getElementById(`field-doctype-${taskId}`)?.value || '').trim();
  const fs = await getFirmFieldSettings(task.firm_id);
  const needsType = (fs.document_requirements || []).some((item) => String(item || '').trim());
  if (needsType && !docType) {
    toast(t('field.need_doc_type'), 'warn');
    return;
  }
  const storedName = docType ? `[${docType}] ${file.name}` : file.name;
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
