async function loadJobMarketQcQueue() {
  const list = document.getElementById('qc-job-market-queue');
  if (!list) return;
  const canQc = ['qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
  if (!canQc) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px;">QC yetkisi yok</div>`;
    return;
  }
  const fid = getActiveFirmId() || currentUser?.firm_id;
  const rows = await sb(`job_submissions?status=eq.qc_pending&select=id,job_post_id,worker_firm_id,worker_user_id,submission_type,payload,created_at,job_posts(id,title,requester_firm_id,budget,currency)&order=created_at.asc&limit=120`).catch(() => []);
  const filtered = (rows || []).filter((r) => !fid || r?.job_posts?.requester_firm_id === fid || currentUser?.role === 'super_admin');
  if (!filtered.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px;">QC bekleyen iş teslimi yok</div>`;
    return;
  }
  list.innerHTML = filtered.map((r) => `<div style="padding:10px;background:var(--bg-3);border-radius:8px;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div>
<div style="font-size:12px;font-weight:800;">${r.job_posts?.title || 'İş ilanı'}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">Teslim tipi: ${r.submission_type || 'custom'} · ${new Date(r.created_at).toLocaleString('tr-TR')}</div>
<div style="font-size:11px;color:var(--text-2);margin-top:4px;">${(r.payload && Object.keys(r.payload).length) ? _jmEsc(JSON.stringify(r.payload).slice(0, 180)) : 'Payload yok'}</div>
</div>
<div style="display:flex;gap:6px;align-items:center;">
<button class="btn btn-ghost btn-sm" onclick="qcReviewJobSubmission('${r.id}', false)">Reddet</button>
<button class="btn btn-primary btn-sm" onclick="qcReviewJobSubmission('${r.id}', true)">Onayla</button>
</div>
</div>
</div>`).join('');
}

async function qcReviewJobSubmission(submissionId, approve) {
  const note = (window.prompt(approve ? 'QC onay notu (opsiyonel)' : 'Ret notu', '') || '').trim();
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/approve_job_submission`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_submission_id: submissionId, p_approve: !!approve, p_qc_note: note || null })
    });
    if (!res.ok) throw new Error(await res.text());
    toast(approve ? 'Teslim onaylandı' : 'Teslim reddedildi', 'ok');
    if (typeof logAuditEvent === 'function') await logAuditEvent(approve ? 'job_submission_approved' : 'job_submission_rejected', 'job_submission', submissionId, { note });
    await loadJobMarketQcQueue();
    if (typeof loadJobPosts === 'function') await loadJobPosts();
    if (typeof refreshWalletInfo === 'function') await refreshWalletInfo();
  } catch (e) {
    toast('QC işlemi başarısız: ' + (e.message || ''), 'err');
  }
}
