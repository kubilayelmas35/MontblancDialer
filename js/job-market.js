let _jobPosts = [];
let _jobPostWorkers = [];
let _jobPostSubs = [];

function _jmEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function _jmCanManage() {
  return ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
}

async function loadJobMarketPage() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  if (!_jmCanManage()) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Bu sayfa için yetkiniz yok</div>`;
    return;
  }
  if (typeof isFeatureEnabledForCurrentFirm === 'function') {
    const enabled = await isFeatureEnabledForCurrentFirm('job_market_enabled');
    if (!enabled) {
      list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Bu firma için iş platformu kapalı</div>`;
      return;
    }
  }
  renderFirmSelector('job-market-firm-selector', loadJobMarketPage);
  await refreshWalletInfo();
  await loadJobPosts();
}

async function loadJobPosts() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Önce firma seçin</div>`;
    return;
  }
  list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Yükleniyor...</div>`;
  const posts = await sb(`job_posts?status=in.(published,in_progress,pending_qc)&order=created_at.desc&limit=120`).catch(() => []);
  const workers = await sb(`job_post_workers?select=id,job_post_id,worker_firm_id,status`).catch(() => []);
  const subs = await sb(`job_submissions?select=id,job_post_id,worker_firm_id,status,created_at&order=created_at.desc&limit=250`).catch(() => []);
  _jobPosts = posts || [];
  _jobPostWorkers = workers || [];
  _jobPostSubs = subs || [];
  renderJobPostList();
  if (typeof loadJobMarketKpi === 'function') loadJobMarketKpi();
}

function renderJobPostList() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  const q = String(document.getElementById('jm-search')?.value || '').trim().toLowerCase();
  const fid = getActiveFirmId() || currentUser?.firm_id;
  const items = (_jobPosts || []).filter((p) => {
    if (!p?.id) return false;
    if (!q) return true;
    return `${p.title || ''} ${p.city || ''} ${p.country || ''}`.toLowerCase().includes(q);
  });
  if (!items.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:10px;">Açık ilan bulunamadı</div>`;
    return;
  }
  list.innerHTML = items.map((p) => {
    const workers = _jobPostWorkers.filter((w) => w.job_post_id === p.id && ['working', 'submitted'].includes(w.status));
    const workingCnt = workers.length;
    const isOwner = p.requester_firm_id === fid;
    const myWorker = _jobPostWorkers.find((w) => w.job_post_id === p.id && w.worker_firm_id === fid);
    const mySubs = _jobPostSubs.filter((s) => s.job_post_id === p.id && s.worker_firm_id === fid);
    const deadline = p.deadline_at ? new Date(p.deadline_at).toLocaleString('tr-TR') : '—';
    return `<div class="card" style="padding:10px;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
<div>
<div style="font-size:13px;font-weight:800;">${_jmEsc(p.title || 'İş ilanı')}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_jmEsc(p.job_type || 'custom')} · ${_jmEsc(p.city || 'Bölge serbest')} · Son: ${deadline}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">Bütçe: <b>${Number(p.budget || 0).toFixed(2)} ${_jmEsc(p.currency || 'TRY')}</b> · Çalışan: <b>${workingCnt}</b></div>
</div>
<div><span class="badge badge-blue">${_jmEsc(p.status || 'published')}</span></div>
</div>
${p.description ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;">${_jmEsc(p.description)}</div>` : ''}
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px;">
${!isOwner ? `<button class="btn btn-ghost btn-sm" onclick="joinJobPost('${p.id}')">${myWorker ? 'Çalışıyorum' : 'Buna çalışacağım'}</button>` : `<span style="font-size:11px;color:var(--text-3);">İlan sahibi sizsiniz</span>`}
${!isOwner ? `<button class="btn btn-primary btn-sm" onclick="openJobSubmissionModal('${p.id}')">Teslim gir</button>` : ''}
${mySubs.length ? `<span style="font-size:11px;color:var(--text-3);">${mySubs.length} teslim kaydı</span>` : ''}
</div>
</div>`;
  }).join('');
}

async function createJobPost() {
  const title = String(document.getElementById('jm-title')?.value || '').trim();
  const description = String(document.getElementById('jm-description')?.value || '').trim();
  const jobType = String(document.getElementById('jm-type')?.value || 'custom').trim();
  const budget = Number(document.getElementById('jm-budget')?.value || 0);
  const qcMode = String(document.getElementById('jm-qc-mode')?.value || 'required').trim();
  const currency = String(document.getElementById('jm-currency')?.value || 'TRY').trim().toUpperCase();
  const country = String(document.getElementById('jm-country')?.value || '').trim();
  const city = String(document.getElementById('jm-city')?.value || '').trim();
  const radiusKm = Number(document.getElementById('jm-radius')?.value || 0);
  const deadline = document.getElementById('jm-deadline')?.value || null;
  const polygonTxt = String(document.getElementById('jm-polygon')?.value || '').trim();
  let polygon = null;
  if (!title || budget <= 0) {
    toast('Başlık ve geçerli bütçe zorunlu', 'warn');
    return;
  }
  if (polygonTxt) {
    try { polygon = JSON.parse(polygonTxt); } catch (e) { toast('Polygon JSON geçersiz', 'warn'); return; }
  }
  const wallet = await getFirmWallet();
  if (budget > wallet.available) {
    toast('Bütçe kullanılabilir bakiyeyi aşıyor', 'err');
    return;
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_job_post`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_title: title,
        p_description: description,
        p_job_type: jobType,
        p_budget: budget,
        p_currency: currency,
        p_country: country || null,
        p_city: city || null,
        p_postal_code: null,
        p_radius_km: radiusKm || null,
        p_polygon_geojson: polygon,
        p_requirements: description || null,
        p_deadline_at: deadline ? new Date(deadline).toISOString() : null,
        p_qc_mode: qcMode
      })
    });
    if (!res.ok) throw new Error(await res.text());
    if (typeof logAuditEvent === 'function') await logAuditEvent('job_post_created', 'job_post', title, { budget, currency, qc_mode: qcMode });
    toast('İlan yayınlandı', 'ok');
    await refreshWalletInfo();
    await loadJobPosts();
  } catch (e) {
    toast('İlan açılamadı: ' + (e.message || ''), 'err');
  }
}

async function joinJobPost(jobPostId) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/join_job_post`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_job_post_id: jobPostId })
    });
    if (!res.ok) throw new Error(await res.text());
    toast('İşe çalışma kaydınız alındı', 'ok');
    await loadJobPosts();
  } catch (e) {
    toast('Katılım başarısız: ' + (e.message || ''), 'err');
  }
}

function openJobSubmissionModal(jobPostId) {
  document.getElementById('jm-submit-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'jm-submit-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:520px;">
<div class="modal-hdr"><div class="modal-title">Teslim Gir</div><button class="modal-close" onclick="document.getElementById('jm-submit-modal').remove()">✕</button></div>
<div style="padding:14px 20px;display:flex;flex-direction:column;gap:8px;">
<select class="form-input" id="jm-submit-type">
<option value="appointment">Randevu</option>
<option value="lead">Lead</option>
<option value="field_task">Saha işi</option>
<option value="call_capacity">Çağrı kapasitesi</option>
<option value="custom">Diğer</option>
</select>
<input class="form-input" id="jm-submit-appointment" placeholder="Appointment ID (opsiyonel)">
<input class="form-input" id="jm-submit-fieldtask" placeholder="Field Task ID (opsiyonel)">
<textarea class="form-input" id="jm-submit-payload" rows="4" placeholder='Payload JSON (örn: {\"note\":\"ilk randevu\"})'></textarea>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('jm-submit-modal').remove()">Vazgeç</button>
<button class="btn btn-primary" onclick="submitJobSubmission('${jobPostId}')">Teslim Gönder</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

async function submitJobSubmission(jobPostId) {
  const type = String(document.getElementById('jm-submit-type')?.value || 'custom').trim();
  const appointmentId = String(document.getElementById('jm-submit-appointment')?.value || '').trim() || null;
  const fieldTaskId = String(document.getElementById('jm-submit-fieldtask')?.value || '').trim() || null;
  const payloadText = String(document.getElementById('jm-submit-payload')?.value || '').trim();
  let payload = {};
  if (payloadText) {
    try { payload = JSON.parse(payloadText); } catch (e) { toast('Payload JSON geçersiz', 'warn'); return; }
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/submit_job_submission`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_job_post_id: jobPostId,
        p_submission_type: type,
        p_payload: payload,
        p_appointment_id: appointmentId,
        p_field_task_id: fieldTaskId
      })
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('jm-submit-modal')?.remove();
    toast('Teslim başarıyla gönderildi', 'ok');
    await loadJobPosts();
    if (typeof loadJobMarketQcQueue === 'function') loadJobMarketQcQueue();
  } catch (e) {
    toast('Teslim gönderilemedi: ' + (e.message || ''), 'err');
  }
}

async function loadJobMarketKpi() {
  const wrap = document.getElementById('dash-job-market-kpi');
  if (!wrap) return;
  const canView = ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
  wrap.style.display = canView ? '' : 'none';
  if (!canView) return;
  const jobs = await sb(`job_posts?select=id,status&order=created_at.desc&limit=400`).catch(() => []);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  set('kpi-job-published', (jobs || []).filter((x) => ['published', 'in_progress'].includes(x.status)).length);
  set('kpi-job-qc', (jobs || []).filter((x) => x.status === 'pending_qc').length);
  set('kpi-job-done', (jobs || []).filter((x) => x.status === 'completed').length);
}
