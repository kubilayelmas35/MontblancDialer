// ─────────────────────────────────────────────
// FIELD OPS (Admin/SuperAdmin) overview page
// ─────────────────────────────────────────────

let _fieldOpsRows = [];
let _fieldOpsFiles = [];
let _fieldOpsAgents = [];
let _fieldOpsSettings = null;

function _foEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FIELD_OPS_COLS = 10;

function _fieldOpsStatusLabel(s) {
  if (typeof fieldStatusLabel === 'function') return fieldStatusLabel(s);
  return s || '—';
}

function _fieldOpsResultLabel(raw) {
  if (typeof fieldResultLabel === 'function') return fieldResultLabel(raw);
  const key = String(raw || '').trim();
  return key && key !== '—' ? key.replaceAll('_', ' ') : '—';
}

function _fieldOpsStatusBadge(s) {
  const key = String(s || '').toLowerCase();
  const cls = {
    assigned: 'badge-blue',
    in_progress: 'badge-yellow',
    completed: 'badge-green',
    cancelled: 'badge'
  }[key] || 'badge';
  return `<span class="badge ${cls}">${_foEsc(_fieldOpsStatusLabel(key))}</span>`;
}

function _fieldOpsSetKpi(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val ?? 0);
}

function _fieldOpsRenderKpi(rows) {
  const total = rows.length;
  const assigned = rows.filter(r => r.status === 'assigned').length;
  const progress = rows.filter(r => r.status === 'in_progress').length;
  const done = rows.filter(r => r.status === 'completed').length;
  const cancelled = rows.filter(r => r.status === 'cancelled').length;
  _fieldOpsSetKpi('fieldops-kpi-total', total);
  _fieldOpsSetKpi('fieldops-kpi-assigned', assigned);
  _fieldOpsSetKpi('fieldops-kpi-progress', progress);
  _fieldOpsSetKpi('fieldops-kpi-done', done);
  _fieldOpsSetKpi('fieldops-kpi-cancelled', cancelled);
}

function fieldOpsApplyFilters() {
  const tbody = document.getElementById('fieldops-tbody');
  if (!tbody) return;
  _fieldOpsRenderKpi(_fieldOpsRows);
  const statusF = String(document.getElementById('fieldops-status-filter')?.value || '').trim();
  const q = String(document.getElementById('fieldops-search')?.value || '').toLowerCase().trim();
  let list = [..._fieldOpsRows];
  if (statusF) list = list.filter(r => String(r.status || '') === statusF);
  if (q) {
    list = list.filter(r => {
      const ap = r.appointment || {};
      const assignee = r.assignee || {};
      const camp = ap.campaigns?.name || '';
      const biz = ap.customers?.name || '';
      return [
        ap.nachname, ap.telefonnummer, ap.plz, ap.ortschaft, ap.strasse, ap.agent_notu,
        camp, biz, assignee.name, assignee.email, r.status, r.notes, r.result_key,
        _fieldOpsResultLabel(r.result_key)
      ].some(v => String(v || '').toLowerCase().includes(q));
    });
  }
  if (!list.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(FIELD_OPS_COLS, 'ui.no_records') : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  const stamp = (iso) => {
    if (!iso) return '—';
    if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(typeof mbLocale === 'function' ? mbLocale() : 'tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  tbody.innerHTML = list.map(r => {
    const ap = r.appointment || {};
    const asg = r.assignee || {};
    const when = typeof fieldApptWhen === 'function' ? fieldApptWhen(ap).text : stamp(ap.termin_tarih);
    const sample = r.result_payload?.sample === true ? ` <span class="badge badge-blue">${_foEsc(t('fieldops.sample'))}</span>` : '';
    return `<tr class="fieldops-row" onclick="fieldOpsOpen('${_foEsc(r.id)}')">
      <td style="font-size:11px;font-family:var(--mono);">${stamp(r.created_at)}</td>
      <td style="font-weight:600;">${_foEsc(ap.nachname || '—')}${sample}</td>
      <td style="font-family:var(--mono);">${_foEsc(ap.telefonnummer || '—')}</td>
      <td style="font-family:var(--mono);">${_foEsc(ap.plz || '—')}</td>
      <td>${_foEsc(ap.ortschaft || '—')}</td>
      <td style="font-size:11px;font-family:var(--mono);">${_foEsc(when || '—')}</td>
      <td>${_foEsc(asg.name || asg.email || '—')}</td>
      <td>${_fieldOpsStatusBadge(r.status)}</td>
      <td>${_foEsc(_fieldOpsResultLabel(r.result_key || r.result_payload?.visit_result || '—'))}${fieldOpsWorkBits(r)}</td>
      <td><button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation();fieldOpsOpen('${_foEsc(r.id)}')">${_foEsc(t('fieldops.open'))}</button></td>
    </tr>`;
  }).join('');
}

function fieldOpsWorkBits(row) {
  const quote = row?.result_payload?.quote;
  const files = _fieldOpsFiles.filter((file) => file.task_id === row.id);
  const bits = [];
  if (quote?.gross) bits.push(`${t('field.quote.badge')} ${typeof fieldMoney === 'function' ? fieldMoney(quote.gross) : quote.gross}`);
  if (files.length) bits.push(`${files.length} ${t('field.quote.docs')}`);
  if (!bits.length) return '';
  return `<div style="font-size:10px;color:var(--text-3);margin-top:2px;">${_foEsc(bits.join(' · '))}</div>`;
}

function fieldOpsQuoteBlock(row) {
  const quote = row?.result_payload?.quote;
  if (!quote?.lines?.length && !quote?.gross) return '';
  const lines = (quote.lines || []).map((line) => `<div class="dash-mini-row"><span>${_foEsc(line.qty)} × ${_foEsc(line.name)}</span><b>${_foEsc(typeof fieldMoney === 'function' ? fieldMoney(line.total) : line.total)}</b></div>`).join('');
  const pdf = _fieldOpsFiles.find((file) => file.task_id === row.id && String(file.file_name || '').includes('[teklif]'));
  return `<div style="margin-top:4px;font-weight:700;">${_foEsc(t('field.quote.title'))}</div>
<div style="font-size:11px;color:var(--text-3);">${_foEsc(quote.no || '')} · ${_foEsc(quote.customer_name || '')}</div>
${lines}
<div class="dash-mini-row"><span>${_foEsc(t('field.quote.gross'))}</span><b>${_foEsc(typeof fieldMoney === 'function' ? fieldMoney(quote.gross) : quote.gross)}</b></div>
${quote.signed ? `<div style="font-size:11px;">${_foEsc(t('field.quote.signed'))}</div>` : `<div style="font-size:11px;color:var(--text-3);">${_foEsc(t('field.quote.unsigned'))}</div>`}
${pdf ? `<a class="btn btn-ghost btn-sm" style="width:fit-content;" target="_blank" rel="noopener" href="${_foEsc(pdf.file_url)}">${_foEsc(t('field.quote.pdf'))}</a>` : ''}`;
}

function fieldOpsOpen(taskId) {
  const row = _fieldOpsRows.find((item) => item.id === taskId);
  if (!row) return;
  const ap = row.appointment || {};
  const asg = row.assignee || {};
  const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
  const camp = ap.campaigns?.name || (Array.isArray(ap.campaigns) ? ap.campaigns[0]?.name : '') || '—';
  const biz = ap.customers?.name || (Array.isArray(ap.customers) ? ap.customers[0]?.name : '') || '—';
  const when = typeof fieldApptWhen === 'function' ? (fieldApptWhen(ap).text || '—') : '—';
  const next = row.next_action_at && typeof mbFormatWall === 'function'
    ? mbFormatWall(row.next_action_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const schema = _fieldOpsSettings?.form_schema || [];
  const payload = row.result_payload || {};
  const formRows = schema.map((item) => {
    const field = typeof _fieldNormalizeSchemaRow === 'function' ? _fieldNormalizeSchemaRow(item) : item;
    if (!field?.key) return '';
    if (field.type === 'photo' || field.type === 'sign') {
      const mark = `${field.type === 'sign' ? 'sign' : 'photo'}:${field.key}`;
      const shots = _fieldOpsFiles.filter((file) => file.task_id === row.id && (typeof fieldDocKeyOf === 'function' ? fieldDocKeyOf(file) : '') === mark);
      if (!shots.length) return '';
      return `<div class="dash-mini-row"><span>${_foEsc(field.label || field.key)}</span><b style="display:flex;gap:6px;flex-wrap:wrap;">${shots.map((file) => (typeof fieldFileThumb === 'function' ? fieldFileThumb(file) : '')).join('')}</b></div>`;
    }
    const value = payload[field.key];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
    const shown = Array.isArray(value)
      ? value.join(', ')
      : field.type === 'yesno' ? (value === 'evet' ? t('field.yes') : value === 'hayir' ? t('field.no') : value) : value;
    return `<div class="dash-mini-row"><span>${_foEsc(field.label || field.key)}</span><b>${_foEsc(shown)}</b></div>`;
  }).filter(Boolean);
  Object.keys(payload).forEach((key) => {
    if (key === 'sample' || key === 'visit_result') return;
    if (schema.some((item) => String(item?.key || '') === key)) return;
    const value = payload[key];
    if (value == null || value === '' || typeof value === 'object') return;
    formRows.push(`<div class="dash-mini-row"><span>${_foEsc(key)}</span><b>${_foEsc(value)}</b></div>`);
  });
  const docs = _fieldOpsFiles.filter((file) => file.task_id === row.id);
  const docHtml = docs.length
    ? docs.map((file) => (typeof fieldFileThumb === 'function' ? fieldFileThumb(file) : `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${_foEsc(file.file_url)}">${_foEsc(file.file_name)}</a>`)).join('')
    : `<span style="color:var(--text-3);font-size:12px;">${_foEsc(t('fieldops.no_docs'))}</span>`;
  const agentOpts = _fieldOpsAgents.map((user) => `<option value="${_foEsc(user.id)}" ${user.id === row.assigned_to ? 'selected' : ''}>${_foEsc(user.name || user.email || user.id)}</option>`).join('');
  document.getElementById('fieldops-detail')?.remove();
  const ov = document.createElement('div');
  ov.id = 'fieldops-detail';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:560px;">
<div class="modal-hdr"><div class="modal-title">${_foEsc(t('fieldops.detail'))}</div><button class="modal-close" onclick="document.getElementById('fieldops-detail').remove()">✕</button></div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
<div style="font-size:16px;font-weight:800;">${_foEsc(ap.nachname || '—')} ${_fieldOpsStatusBadge(row.status)}</div>
<div style="color:var(--text-3);">${_foEsc(ap.telefonnummer || '—')}</div>
<div><b>${_foEsc(t('fieldops.address'))}:</b> ${_foEsc(addr || '—')}</div>
<div><b>${_foEsc(t('field.appt'))}:</b> ${_foEsc(when)}</div>
<div><b>${_foEsc(t('field.biz'))}:</b> ${_foEsc(biz)} · <b>${_foEsc(t('field.camp'))}:</b> ${_foEsc(camp)}</div>
<div><b>${_foEsc(t('field.agent'))}:</b> ${_foEsc(asg.name || asg.email || '—')}</div>
<div><b>${_foEsc(t('field.result'))}:</b> ${_foEsc(_fieldOpsResultLabel(row.result_key || '—'))}</div>
<div><b>${_foEsc(t('field.next'))}:</b> ${_foEsc(next || '—')}</div>
${typeof fieldBriefMarkup === 'function' ? fieldBriefMarkup(ap) : ''}
${ap.agent_notu ? `<div style="padding:8px;border-radius:6px;background:var(--bg-3);"><b>${_foEsc(t('field.call_note'))}:</b> ${_foEsc(ap.agent_notu)}</div>` : ''}
${row.notes ? `<div style="padding:8px;border-radius:6px;background:var(--bg-3);"><b>${_foEsc(t('field.note'))}:</b> ${_foEsc(row.notes)}</div>` : ''}
${fieldOpsQuoteBlock(row)}
<div style="margin-top:4px;font-weight:700;">${_foEsc(t('fieldops.form'))}</div>
${formRows.length ? formRows.join('') : `<div style="color:var(--text-3);">${_foEsc(t('fieldops.no_form'))}</div>`}
<div style="margin-top:4px;font-weight:700;">${_foEsc(t('fieldops.docs'))}</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;">${docHtml}</div>
${agentOpts ? `<div class="form-row" style="margin-top:8px;"><label class="form-label">${_foEsc(t('fieldops.reassign'))}</label><select class="form-input" id="fieldops-reassign">${agentOpts}</select></div>` : ''}
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('fieldops-detail').remove()">${_foEsc(t('fieldops.close'))}</button>
<button class="btn btn-ghost" onclick="fieldOpsEditQuote('${_foEsc(row.id)}')">${_foEsc(t('field.cat.edit_pdf'))}</button>
${agentOpts ? `<button class="btn btn-primary" onclick="fieldOpsReassign('${_foEsc(row.id)}')">${_foEsc(t('field.assign_btn'))}</button>` : ''}
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

function fieldOpsEditQuote(taskId) {
  const row = _fieldOpsRows.find((item) => item.id === taskId);
  if (!row || typeof fieldOpenQuote !== 'function') return;
  const task = { ...row };
  _fieldTasks = (_fieldTasks || []).filter((item) => item.id !== row.id).concat([task]);
  window._fieldApptMap = { ...(window._fieldApptMap || {}), [row.appointment_id]: row.appointment || {} };
  fieldOpenQuote(row.id);
}

async function fieldOpsReassign(taskId) {
  const uid = document.getElementById('fieldops-reassign')?.value;
  const row = _fieldOpsRows.find((item) => item.id === taskId);
  if (!uid || !row) return;
  if (uid === row.assigned_to) {
    toast(t('field.already'), 'warn');
    return;
  }
  try {
    await sb(`field_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ assigned_to: uid })
    });
    toast(t('fieldops.reassigned'), 'ok');
    document.getElementById('fieldops-detail')?.remove();
    await loadFieldOpsPage();
  } catch (e) {
    toast(t('field.save_fail'), 'err');
  }
}

async function loadFieldOpsPage() {
  const tbody = document.getElementById('fieldops-tbody');
  const role = currentUser?.role || '';
  const canView = mbIsFirmAdmin(role);
  if (!canView) {
    if (tbody) tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(FIELD_OPS_COLS, 'ui.no_access_page') : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.no_access_page')}</td></tr>`;
    return;
  }
  const fw = document.getElementById('fieldops-firm-wrap');
  if (fw) {
    if (mbIsSuperAdmin(role)) renderFirmSelector('fieldops-firm-wrap', loadFieldOpsPage);
    else fw.innerHTML = '';
  }
  if (typeof loadFieldOpsCatalog === 'function') loadFieldOpsCatalog();
  const fid = getActiveFirmId() || currentUser?.firm_id || null;
  if (mbIsSuperAdmin(role) && !fid) {
    if (tbody) tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(FIELD_OPS_COLS, 'ui.select_firm_first') : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.select_firm_first')}</td></tr>`;
    _fieldOpsRows = [];
    _fieldOpsRenderKpi([]);
    return;
  }
  if (tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(FIELD_OPS_COLS) : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  try {
    const headers = mbAuthHeaders();
    const callRpc = async (payload) => {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    };
    let rpc = await callRpc({ p_actor_user_id: currentUser.id, p_firm_id: fid });
    if (!rpc.ok && fid == null) {
      rpc = await callRpc({ p_actor_user_id: currentUser.id });
    }
    if (!rpc.ok && String(rpc.body?.message || '').includes('not_authenticated')) {
      try {
        const saved = JSON.parse(localStorage.getItem('mb_session') || '{}');
        if (saved?.session_token && currentUser) currentUser.session_token = saved.session_token;
      } catch (_) {}
      rpc = await callRpc({ p_actor_user_id: currentUser.id, p_firm_id: fid });
    }
    if (!rpc.ok) {
      const msg = rpc.body?.message || rpc.body?.hint || `HTTP ${rpc.status}`;
      throw new Error(msg);
    }
    const tasks = Array.isArray(rpc.body) ? rpc.body : [];
    const apptIds = [...new Set(tasks.map(t => t.appointment_id).filter(Boolean))];
    const userIds = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))];
    const taskIds = tasks.map((task) => task.id).filter(Boolean);
    const [appts, users, files, agents, settings] = await Promise.all([
      typeof fieldLoadAppointments === 'function' ? fieldLoadAppointments(apptIds) : [],
      userIds.length ? ((await sb(`users?id=in.(${userIds.join(',')})&select=id,name,email`).catch(() => [])) || []) : [],
      taskIds.length && fid ? ((await sb(`field_task_files?firm_id=eq.${fid}&task_id=in.(${taskIds.join(',')})&select=id,task_id,file_name,file_url&order=created_at.desc`).catch(() => [])) || []) : [],
      fid ? ((await sb(`users?firm_id=eq.${fid}&role=eq.field_agent&is_active=eq.true&select=id,name,email&order=name.asc`).catch(() => [])) || []) : [],
      fid && typeof getFirmFieldSettings === 'function' ? getFirmFieldSettings(fid) : null
    ]);
    _fieldOpsFiles = files || [];
    _fieldOpsAgents = agents || [];
    _fieldOpsSettings = settings;
    const apMap = {};
    appts.forEach(a => { apMap[a.id] = a; });
    const uMap = {};
    users.forEach(u => { uMap[u.id] = u; });
    _fieldOpsRows = tasks.map(t => ({ ...t, appointment: apMap[t.appointment_id] || null, assignee: uMap[t.assigned_to] || null }));
    fieldOpsApplyFilters();
  } catch (e) {
    const msg = String(e?.message || t('ui.unknown_error') || '');
    const friendly = msg.includes('not_authenticated') ? 'Oturum doğrulanamadı. Çıkış yapıp yeniden girin.' : msg;
    if (tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(FIELD_OPS_COLS, t('ui.load_failed') + ': ' + friendly) : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint" style="color:var(--red);">${_foEsc(t('ui.load_failed') + ': ' + friendly)}</td></tr>`;
    _fieldOpsRows = [];
    _fieldOpsRenderKpi([]);
  }
}
