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

const FIELD_OPS_COLS = 9;

function _fieldOpsLangDe() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de');
}

function _fieldOpsStatusLabel(s) {
  const de = _fieldOpsLangDe();
  const map = {
    assigned: de ? 'Zugewiesen' : 'Atandı',
    in_progress: de ? 'Im Feld' : 'Sahada',
    completed: de ? 'Erledigt' : 'Tamamlandı',
    cancelled: de ? 'Storniert' : 'İptal'
  };
  return map[String(s || '').toLowerCase()] || (s || '—');
}

function _fieldOpsResultLabel(raw) {
  const key = String(raw || '').trim();
  if (!key || key === '—') return '—';
  const de = _fieldOpsLangDe();
  const map = {
    pending: de ? 'Offen' : 'Bekliyor',
    ok: de ? 'Erledigt' : 'Tamam',
    cancelled_by_customer: de ? 'Kunde storniert' : 'Müşteri iptal etti',
    sale: de ? 'Verkauf' : 'Satış',
    missing_doc: de ? 'Dokument fehlt' : 'Belge eksik',
  };
  return map[key] || key.replaceAll('_', ' ');
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
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(FIELD_OPS_COLS, 'ui.no_records') : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  const loc = typeof mbLocale === 'function' ? mbLocale() : 'tr-TR';
  const stamp = (iso) => {
    if (!iso) return '—';
    if (typeof mbFormatWall === 'function') return mbFormatWall(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  tbody.innerHTML = list.map(r => {
    const ap = r.appointment || {};
    const asg = r.assignee || {};
    const cust = _foEsc(ap.nachname || '—');
    const tel = _foEsc(ap.telefonnummer || '—');
    const plz = _foEsc(ap.plz || '—');
    const city = _foEsc(ap.ortschaft || '—');
    const saha = _foEsc(asg.name || asg.email || '—');
    const rs = _foEsc(_fieldOpsResultLabel(r.result_key || r.result_payload?.visit_result || '—'));
    return `<tr>
      <td style="font-size:11px;font-family:var(--mono);">${stamp(r.created_at)}</td>
      <td style="font-weight:600;">${cust}</td>
      <td style="font-family:var(--mono);">${tel}</td>
      <td style="font-family:var(--mono);">${plz}</td>
      <td>${city}</td>
      <td style="font-size:11px;font-family:var(--mono);">${stamp(ap.termin_tarih)}</td>
      <td>${saha}</td>
      <td>${_fieldOpsStatusBadge(r.status)}</td>
      <td>${rs}</td>
    </tr>`;
  }).join('');
}

async function loadFieldOpsPage() {
  const tbody = document.getElementById('fieldops-tbody');
  const role = currentUser?.role || '';
  const canView = ['admin', 'firm_admin', 'super_admin'].includes(role);
  if (!canView) {
    if (tbody) tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(FIELD_OPS_COLS, 'ui.no_access_page') : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint">${t('ui.no_access_page')}</td></tr>`;
    return;
  }
  const fw = document.getElementById('fieldops-firm-wrap');
  if (fw) {
    if (role === 'super_admin') renderFirmSelector('fieldops-firm-wrap', loadFieldOpsPage);
    else fw.innerHTML = '';
  }
  const fid = getActiveFirmId() || currentUser?.firm_id || null;
  if (role === 'super_admin' && !fid) {
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
    const msg = String(e?.message || t('ui.unknown_error') || '');
    const friendly = msg.includes('not_authenticated') ? 'Oturum doğrulanamadı. Çıkış yapıp yeniden girin.' : msg;
    if (tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(FIELD_OPS_COLS, t('ui.load_failed') + ': ' + friendly) : `<tr><td colspan="${FIELD_OPS_COLS}" class="mb-empty-hint" style="color:var(--red);">${_foEsc(t('ui.load_failed') + ': ' + friendly)}</td></tr>`;
    _fieldOpsRows = [];
    _fieldOpsRenderKpi([]);
  }
}
