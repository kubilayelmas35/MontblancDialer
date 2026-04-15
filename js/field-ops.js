// ─────────────────────────────────────────────
// FIELD OPS (Admin/SuperAdmin) overview page
// ─────────────────────────────────────────────

let _fieldOpsRows = [];

function _foEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fieldOpsStatusLabel(s) {
  const map = {
    assigned: 'Atandı',
    in_progress: 'Sahada',
    completed: 'Tamamlandı',
    cancelled: 'İptal'
  };
  return map[String(s || '').toLowerCase()] || (s || '—');
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
  _fieldOpsSetKpi('fieldops-kpi-total', total);
  _fieldOpsSetKpi('fieldops-kpi-assigned', assigned);
  _fieldOpsSetKpi('fieldops-kpi-progress', progress);
  _fieldOpsSetKpi('fieldops-kpi-done', done);
}

function fieldOpsApplyFilters() {
  const tbody = document.getElementById('fieldops-tbody');
  if (!tbody) return;
  const statusF = String(document.getElementById('fieldops-status-filter')?.value || '').trim();
  const q = String(document.getElementById('fieldops-search')?.value || '').toLowerCase().trim();
  let list = [..._fieldOpsRows];
  if (statusF) list = list.filter(r => String(r.status || '') === statusF);
  if (q) {
    list = list.filter(r => {
      const ap = r.appointment || {};
      const assignee = r.assignee || {};
      return [
        ap.nachname, ap.telefonnummer, ap.plz, ap.ortschaft,
        assignee.name, assignee.email, r.status, r.result_key
      ].some(v => String(v || '').toLowerCase().includes(q));
    });
  }
  _fieldOpsRenderKpi(list);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Kayıt yok</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => {
    const ap = r.appointment || {};
    const asg = r.assignee || {};
    const dt = r.created_at ? new Date(r.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const cust = _foEsc(ap.nachname || '—');
    const tel = _foEsc(ap.telefonnummer || '—');
    const saha = _foEsc(asg.name || asg.email || '—');
    const st = _foEsc(_fieldOpsStatusLabel(r.status));
    const rs = _foEsc(r.result_key || (r.result_payload?.visit_result || '—'));
    return `<tr>
      <td style="font-size:11px;font-family:var(--mono);">${dt}</td>
      <td style="font-weight:600;">${cust}</td>
      <td style="font-family:var(--mono);">${tel}</td>
      <td>${saha}</td>
      <td>${st}</td>
      <td>${rs}</td>
    </tr>`;
  }).join('');
}

async function loadFieldOpsPage() {
  const tbody = document.getElementById('fieldops-tbody');
  const role = currentUser?.role || '';
  const canView = ['admin', 'firm_admin', 'super_admin'].includes(role);
  if (!canView) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Bu sayfaya erişim yok</td></tr>';
    return;
  }
  const fw = document.getElementById('fieldops-firm-wrap');
  if (fw) {
    if (role === 'super_admin') renderFirmSelector('fieldops-firm-wrap', loadFieldOpsPage);
    else fw.innerHTML = '';
  }
  const fid = getActiveFirmId() || currentUser?.firm_id || null;
  if (role === 'super_admin' && !fid) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Önce firma seçin</td></tr>';
    _fieldOpsRows = [];
    _fieldOpsRenderKpi([]);
    return;
  }
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Yükleniyor...</td></tr>';
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_actor_user_id: currentUser.id,
        p_firm_id: fid
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tasks = (await res.json().catch(() => [])) || [];
    const apptIds = [...new Set(tasks.map(t => t.appointment_id).filter(Boolean))];
    const userIds = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))];
    const appts = apptIds.length
      ? ((await sb(`appointments?id=in.(${apptIds.join(',')})&select=id,nachname,telefonnummer,plz,ortschaft,durum,termin_tarih`).catch(() => [])) || [])
      : [];
    const users = userIds.length
      ? ((await sb(`users?id=in.(${userIds.join(',')})&select=id,name,email`).catch(() => [])) || [])
      : [];
    const apMap = {};
    appts.forEach(a => { apMap[a.id] = a; });
    const uMap = {};
    users.forEach(u => { uMap[u.id] = u; });
    _fieldOpsRows = tasks.map(t => ({ ...t, appointment: apMap[t.appointment_id] || null, assignee: uMap[t.assigned_to] || null }));
    fieldOpsApplyFilters();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red);padding:24px;">Yüklenemedi: ${_foEsc(e.message)}</td></tr>`;
    _fieldOpsRows = [];
    _fieldOpsRenderKpi([]);
  }
}
