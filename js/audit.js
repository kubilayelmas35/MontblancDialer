async function logAuditEvent(eventType, entityType, entityId, payload) {
  try {
    if (!currentUser?.id) return;
    const firmId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id || null;
    await sb('audit_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: firmId,
        actor_id: currentUser.id,
        actor_role: currentUser.role || null,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId || null,
        payload: payload || {}
      })
    });
  } catch (e) {}
}

async function loadAuditEventsPage() {
  const card = document.getElementById('audit-log-card');
  const list = document.getElementById('audit-log-list');
  if (!card || !list) return;
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
  card.style.display = canView ? '' : 'none';
  if (!canView) return;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || '';
  const filter = String(document.getElementById('audit-log-filter')?.value || '').trim();
  let query = `audit_events?order=created_at.desc&limit=60`;
  if (currentUser?.role !== 'super_admin' && fid) query += `&firm_id=eq.${fid}`;
  if (filter) query += `&event_type=ilike.*${encodeURIComponent(filter)}*`;
  const rows = await sb(query).catch(() => []);
  if (!rows?.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px;">Kayıt bulunamadı</div>`;
    return;
  }
  list.innerHTML = rows.map((r) => `<div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-3);">
<div style="display:flex;justify-content:space-between;gap:8px;">
<div style="font-size:12px;font-weight:700;">${r.event_type}</div>
<div style="font-size:10px;color:var(--text-3);">${new Date(r.created_at).toLocaleString('tr-TR')}</div>
</div>
<div style="font-size:11px;color:var(--text-2);margin-top:3px;">${r.entity_type || '-'} · ${r.entity_id || '-'}</div>
</div>`).join('');
}
