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
    options: Array.isArray(row?.options) ? row.options : []
  };
}

async function loadFieldPage() {
  const listEl = document.getElementById('field-task-list');
  if (!listEl || !currentUser) return;
  const fid = getActiveFirmId() || currentUser.firm_id;
  if (!fid) {
    listEl.innerHTML = '<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">Firma bulunamadı</div>';
    return;
  }
  const fs = await getFirmFieldSettings(fid);
  if (!fs.enabled && currentUser.role !== 'super_admin') {
    listEl.innerHTML = '<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">Bu firma için saha modülü aktif değil</div>';
    return;
  }
  listEl.innerHTML = '<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">Yükleniyor...</div>';

  let q = `field_tasks?firm_id=eq.${fid}&order=created_at.desc&limit=120`;
  if (currentUser.role === 'field_agent') q += `&assigned_to=eq.${currentUser.id}`;
  _fieldTasks = (await sb(q).catch(() => [])) || [];
  if (!_fieldTasks.length) {
    listEl.innerHTML = '<div class="card" style="padding:20px;color:var(--text-3);font-size:12px;text-align:center;">Atanmış saha görevi yok</div>';
    return;
  }

  const apptIds = [...new Set(_fieldTasks.map((x) => x.appointment_id).filter(Boolean))];
  const assigneeIds = [...new Set(_fieldTasks.map((x) => x.assigned_to).filter(Boolean))];
  const appts = apptIds.length
    ? (await sb(`appointments?id=in.(${apptIds.join(',')})&select=id,nachname,telefonnummer,strasse,plz,ortschaft,agent_notu`).catch(() => [])) || []
    : [];
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

  listEl.innerHTML = _fieldTasks
    .map((t) => {
      const ap = apptMap[t.appointment_id] || {};
      const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
      const statusLabel = {
        assigned: 'Atandı',
        in_progress: 'Sahada',
        completed: 'Tamamlandı',
        cancelled: 'İptal'
      }[t.status] || t.status;
      const docs = fileMap[t.id] || [];
      const payload = t.result_payload || {};
      return `<div class="card" style="padding:12px;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div>
<div style="font-size:14px;font-weight:800;">${_fEsc(ap.nachname || 'Müşteri')}</div>
<div style="font-size:11px;color:var(--text-3);">${_fEsc(ap.telefonnummer || '—')} · ${_fEsc(addr || 'Adres yok')}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:4px;">Görevli: ${_fEsc(userMap[t.assigned_to] || '—')} · Durum: <b>${_fEsc(statusLabel)}</b></div>
</div>
<div style="display:flex;gap:6px;align-items:center;">
<a class="btn btn-ghost btn-sm" href="${ap.telefonnummer ? `tel:${_fEsc(ap.telefonnummer)}` : '#'}" ${ap.telefonnummer ? '' : 'style="pointer-events:none;opacity:.45;"'}>Ara</a>
<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(addr || '')}" ${addr ? '' : 'style="pointer-events:none;opacity:.45;"'}>Harita</a>
</div>
</div>
${ap.agent_notu ? `<div style="margin-top:8px;padding:8px;border-radius:6px;background:var(--bg-3);font-size:12px;"><b>Çağrı notu:</b> ${_fEsc(ap.agent_notu)}</div>` : ''}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:8px;">
<div class="form-row"><label class="form-label">Durum</label>
<select class="form-input" id="field-status-${t.id}">
<option value="assigned" ${t.status === 'assigned' ? 'selected' : ''}>Atandı</option>
<option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>Sahada</option>
<option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Tamamlandı</option>
<option value="cancelled" ${t.status === 'cancelled' ? 'selected' : ''}>İptal</option>
</select></div>
<div class="form-row"><label class="form-label">Sonuç</label>
<select class="form-input" id="field-result-${t.id}">
<option value="">Seçin</option>
${(fs.result_options || []).map((r) => `<option value="${_fEsc(r)}" ${t.result_key === r ? 'selected' : ''}>${_fEsc(r)}</option>`).join('')}
</select></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Saha notu</label>
<textarea class="form-input" rows="2" id="field-note-${t.id}" placeholder="Saha ziyareti notları...">${_fEsc(t.notes || '')}</textarea></div>
${(fs.form_schema || [])
  .map((f) => {
    const ff = _fieldNormalizeSchemaRow(f);
    const v = payload?.[ff.key] || '';
    if (!ff.key || !ff.label) return '';
    if (ff.type === 'number') {
      return `<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(ff.label)}</label><input type="number" class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`;
    }
    if (ff.type === 'date') {
      return `<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(ff.label)}</label><input type="date" class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`;
    }
    if (ff.type === 'select') {
      return `<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(ff.label)}</label><select class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}"><option value="">Seçin</option>${(ff.options || []).map((o) => `<option value="${_fEsc(o)}" ${String(v) === String(o) ? 'selected' : ''}>${_fEsc(o)}</option>`).join('')}</select></div>`;
    }
    return `<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(ff.label)}</label><input class="form-input" id="field-extra-${t.id}-${_fEsc(ff.key)}" value="${_fEsc(v)}"></div>`;
  })
  .join('')}
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
<label class="btn btn-ghost btn-sm" style="cursor:pointer;">
Belge Yükle
<input type="file" style="display:none;" onchange="uploadFieldTaskFile('${t.id}', this)">
</label>
<button class="btn btn-primary btn-sm" onclick="saveFieldTaskUpdate('${t.id}')">Kaydet</button>
</div>
${docs.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${docs
        .slice(0, 6)
        .map((f) => `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${_fEsc(f.file_url)}">${_fEsc(f.file_name)}</a>`)
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
  (fs.form_schema || []).forEach((f) => {
    payload[f.key] = document.getElementById(`field-extra-${taskId}-${f.key}`)?.value || '';
  });
  const body = {
    status,
    result_key: resultKey,
    notes,
    result_payload: payload,
    completed_at: status === 'completed' ? new Date().toISOString() : null
  };
  await sb(`field_tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify(body)
  }).catch(() => toast('Saha görevi güncellenemedi', 'err'));
  toast('Saha görevi kaydedildi', 'ok');
  await loadFieldPage();
}

async function uploadFieldTaskFile(taskId, input) {
  const file = input?.files?.[0];
  input.value = '';
  if (!file) return;
  const task = _fieldTasks.find((x) => x.id === taskId);
  if (!task) return;
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
    toast('Belge yüklenemedi', 'err');
    return;
  }
  await sb('field_task_files', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      task_id: taskId,
      firm_id: task.firm_id,
      uploaded_by: currentUser.id,
      file_url: url,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size
    })
  }).catch(() => toast('Belge kaydedilemedi', 'err'));
  toast('Belge yüklendi', 'ok');
  await loadFieldPage();
}

async function createFieldTaskFromAppointment(appointmentId, assignedTo) {
  const appts = await sb(`appointments?id=eq.${appointmentId}&select=id,firm_id,contact_id`).catch(() => []);
  const ap = appts?.[0];
  if (!ap?.id || !assignedTo) {
    toast('Atama bilgisi eksik', 'warn');
    return;
  }
  const fs = await getFirmFieldSettings(ap.firm_id);
  if (!fs.enabled) {
    toast('Bu firma için saha modülü aktif değil', 'warn');
    return;
  }
  const ex =
    (await sb(`field_tasks?appointment_id=eq.${appointmentId}&assigned_to=eq.${assignedTo}&select=id&limit=1`).catch(() => [])) ||
    [];
  if (ex.length) {
    toast('Bu kullanıcıya zaten atanmış', 'warn');
    return;
  }
  await sb('field_tasks', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      firm_id: ap.firm_id,
      appointment_id: ap.id,
      contact_id: ap.contact_id || null,
      assigned_to: assignedTo,
      assigned_by: currentUser.id,
      status: 'assigned'
    })
  }).catch(() => toast('Sahaya atama yapılamadı', 'err'));
  toast('Saha görevi atandı', 'ok');
}

async function openFieldAssignModal(appointmentId, firmId) {
  const fs = await getFirmFieldSettings(firmId);
  if (!fs.enabled) {
    toast('Saha modülü aktif değil', 'warn');
    return;
  }
  const users =
    (await sb(`users?firm_id=eq.${firmId}&role=eq.field_agent&is_active=eq.true&select=id,name&order=name.asc`).catch(() => [])) ||
    [];
  if (!users.length) {
    toast('Aktif saha elemanı yok', 'warn');
    return;
  }
  const opts = users.map((u) => `<option value="${u.id}">${_fEsc(u.name)}</option>`).join('');
  document.getElementById('field-assign-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'field-assign-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:430px;">
<div class="modal-hdr"><div class="modal-title">Sahaya Ata</div><button class="modal-close" onclick="document.getElementById('field-assign-modal').remove()">✕</button></div>
<div style="padding:16px 20px;">
<div class="form-row"><label class="form-label">Saha elemanı</label>
<select class="form-input" id="field-assign-user">${opts}</select></div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('field-assign-modal').remove()">İptal</button>
<button class="btn btn-primary" onclick="confirmFieldAssign('${appointmentId}')">Ata</button>
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
  await createFieldTaskFromAppointment(appointmentId, uid);
  document.getElementById('field-assign-modal')?.remove();
}
