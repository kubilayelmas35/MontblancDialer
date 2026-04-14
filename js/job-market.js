let _jobPosts = [];
let _jobPostWorkers = [];
let _jobPostSubs = [];
let _jobPostSlots = [];
let _jobFirmStats = {};
let _jobListTab = 'active';
let _jobPreset = '';
let _jobPermissionsCache = {};
let _jobMap = null;
let _jobPolygonPoints = [];
let _jobPolygonLayer = null;

function _jmEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function _jmCanManage() {
  return ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
}

function defaultJobPermissions() {
  return {
    can_publish_job: true,
    can_join_job: true,
    can_submit_job: true,
    can_qc_job: true,
    can_manage_wallet: true
  };
}

async function getJobPermissions(fid) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return defaultJobPermissions();
  if (_jobPermissionsCache[firmId]) return _jobPermissionsCache[firmId];
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const perms = { ...defaultJobPermissions(), ...(rows?.[0]?.settings?.job_permissions || {}) };
  _jobPermissionsCache[firmId] = perms;
  return perms;
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
  await bindJobOwnerFirmSelector();
  renderFirmSelector('job-market-firm-selector', loadJobMarketPage);
  initJobPolygonMap();
  onJobTypeChange();
  await applyJobPermissionUi();
  await refreshWalletInfo();
  await loadJobPosts();
}

async function applyJobPermissionUi() {
  const perms = await getJobPermissions();
  const publishBtn = document.querySelector('#page-jobmarket button[onclick="createJobPost()"]');
  if (publishBtn) publishBtn.disabled = !perms.can_publish_job;
}

async function bindJobOwnerFirmSelector() {
  const row = document.getElementById('jm-owner-firm-row');
  const sel = document.getElementById('jm-owner-firm');
  if (!row || !sel) return;
  const isSuper = currentUser?.role === 'super_admin';
  row.style.display = isSuper ? '' : 'none';
  if (!isSuper) return;
  if (sel.options.length) return;
  const firms = await sb('firms?is_active=eq.true&select=id,name&order=name.asc').catch(() => []);
  sel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${_jmEsc(f.name || f.id)}</option>`).join('');
  if (!sel.value && currentUser?.firm_id) sel.value = currentUser.firm_id;
  sel.onchange = () => refreshWalletInfo(sel.value);
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
  const slots = await sb(`job_post_slots?select=id,job_post_id,status,slot_start_at,slot_end_at&order=slot_start_at.asc&limit=1200`).catch(() => []);
  _jobPosts = posts || [];
  _jobPostWorkers = workers || [];
  _jobPostSubs = subs || [];
  _jobPostSlots = slots || [];
  _jobFirmStats = buildJobFirmStats(_jobPostSubs);
  renderJobPostList();
  if (typeof loadJobMarketKpi === 'function') loadJobMarketKpi();
}

function buildJobFirmStats(subs) {
  const st = {};
  (subs || []).forEach((s) => {
    const fid = s.worker_firm_id;
    if (!fid) return;
    if (!st[fid]) st[fid] = { approved: 0, rejected: 0, total: 0 };
    st[fid].total++;
    if (s.status === 'approved') st[fid].approved++;
    if (s.status === 'rejected') st[fid].rejected++;
  });
  return st;
}

function calcJobMatchScore(post, viewerFirmId) {
  const scoreBase = 50;
  const byCountry = post.country ? 10 : 0;
  const byCity = post.city ? 10 : 0;
  const stats = _jobFirmStats[viewerFirmId] || { approved: 0, rejected: 0, total: 0 };
  const quality = stats.total ? Math.round((stats.approved / stats.total) * 30) : 10;
  return Math.max(0, Math.min(100, scoreBase + byCountry + byCity + quality - (stats.rejected * 2)));
}

function calcSlaState(post) {
  const created = post.created_at ? new Date(post.created_at).getTime() : Date.now();
  const now = Date.now();
  const firstActionMin = Number(post.sla_first_action_min || 120);
  const completeMin = Number(post.sla_complete_min || 1440);
  const joined = post.first_worker_joined_at ? new Date(post.first_worker_joined_at).getTime() : null;
  const submitted = post.first_submission_at ? new Date(post.first_submission_at).getTime() : null;
  const firstActionBreach = !joined && ((now - created) / 60000 > firstActionMin);
  const completeBreach = !submitted && ((now - created) / 60000 > completeMin);
  return { firstActionBreach, completeBreach };
}

function renderJobPostList() {
  const list = document.getElementById('job-market-list');
  if (!list) return;
  const q = String(document.getElementById('jm-search')?.value || '').trim().toLowerCase();
  const fid = getActiveFirmId() || currentUser?.firm_id;
  let items = (_jobPosts || []).filter((p) => {
    if (!p?.id) return false;
    if (!q) return true;
    return `${p.title || ''} ${p.city || ''} ${p.country || ''}`.toLowerCase().includes(q);
  });
  if (_jobListTab === 'active') items = items.filter((p) => ['published', 'in_progress'].includes(p.status));
  if (_jobListTab === 'pending_qc') items = items.filter((p) => p.status === 'pending_qc');
  if (_jobListTab === 'completed') items = items.filter((p) => p.status === 'completed');
  if (_jobListTab === 'rejected') {
    const rejectedJobIds = new Set(_jobPostSubs.filter((s) => s.status === 'rejected').map((s) => s.job_post_id));
    items = items.filter((p) => rejectedJobIds.has(p.id));
  }
  if (_jobPreset === 'today') {
    const d = new Date().toISOString().slice(0, 10);
    items = items.filter((p) => String(p.created_at || '').startsWith(d));
  } else if (_jobPreset === 'this_week') {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    items = items.filter((p) => (new Date(p.created_at || 0)).getTime() >= start.getTime());
  } else if (_jobPreset === 'high_budget') {
    items = items.filter((p) => Number(p.budget || 0) >= 500);
  }
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
    const slots = _jobPostSlots.filter((s) => s.job_post_id === p.id);
    const score = calcJobMatchScore(p, fid);
    const sla = calcSlaState(p);
    const deadline = p.deadline_at ? new Date(p.deadline_at).toLocaleString('tr-TR') : '—';
    const timeline = _jobPostSubs
      .filter((s) => s.job_post_id === p.id)
      .slice(0, 3)
      .map((s) => `${new Date(s.created_at).toLocaleDateString('tr-TR')} ${s.status}`)
      .join(' · ');
    return `<div class="card" style="padding:10px;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
<div>
<div style="font-size:13px;font-weight:800;">${_jmEsc(p.title || 'İş ilanı')}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_jmEsc(p.job_type || 'custom')} · ${_jmEsc(p.city || 'Bölge serbest')} · Son: ${deadline}</div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">İşlem başı: <b>${Number(p.unit_price || p.budget || 0).toFixed(2)} ${_jmEsc(p.currency || 'TRY')}</b> · Adet: <b>${Number(p.quantity || slots.length || 1)}</b> · Toplam: <b>${Number(p.budget || 0).toFixed(2)}</b> · Çalışan: <b>${workingCnt}</b></div>
<div style="font-size:11px;color:var(--text-3);margin-top:2px;">Eşleşme skoru: <b>${score}</b>/100 ${sla.firstActionBreach || sla.completeBreach ? `· <span style="color:var(--red);font-weight:700;">SLA ihlali</span>` : ''}</div>
</div>
<div><span class="badge badge-blue">${_jmEsc(p.status || 'published')}</span></div>
</div>
${p.description ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;">${_jmEsc(p.description)}</div>` : ''}
${slots.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;">Slotlar: ${slots.slice(0,4).map((s) => `${new Date(s.slot_start_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}-${new Date(s.slot_end_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`).join(' | ')}${slots.length>4?' ...':''}</div>` : ''}
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px;">
${!isOwner ? `<button class="btn btn-ghost btn-sm" onclick="joinJobPost('${p.id}')">${myWorker ? 'Çalışıyorum' : 'Buna çalışacağım'}</button>` : `<span style="font-size:11px;color:var(--text-3);">İlan sahibi sizsiniz</span>`}
${!isOwner ? `<button class="btn btn-primary btn-sm" onclick="openJobSubmissionModal('${p.id}')">Teslim gir</button>` : ''}
${mySubs.length ? `<span style="font-size:11px;color:var(--text-3);">${mySubs.length} teslim kaydı</span>` : ''}
</div>
${timeline ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;">Timeline: ${_jmEsc(timeline)}</div>` : ''}
</div>`;
  }).join('');
}

async function createJobPost() {
  const perms = await getJobPermissions();
  if (!perms.can_publish_job) { toast('İlan yayınlama yetkiniz yok', 'err'); return; }
  const ownerFirmId = currentUser?.role === 'super_admin'
    ? (document.getElementById('jm-owner-firm')?.value || currentUser?.firm_id)
    : (getActiveFirmId() || currentUser?.firm_id);
  const title = String(document.getElementById('jm-title')?.value || '').trim();
  const description = String(document.getElementById('jm-description')?.value || '').trim();
  const jobType = String(document.getElementById('jm-type')?.value || 'custom').trim();
  const unitPrice = Number(document.getElementById('jm-unit-price')?.value || 0);
  const quantity = Number(document.getElementById('jm-quantity')?.value || 1);
  const budget = Math.round(unitPrice * quantity * 100) / 100;
  const qcMode = String(document.getElementById('jm-qc-mode')?.value || 'required').trim();
  const currency = String(document.getElementById('jm-currency')?.value || 'TRY').trim().toUpperCase();
  const country = String(document.getElementById('jm-country')?.value || '').trim();
  const city = String(document.getElementById('jm-city')?.value || '').trim();
  const radiusKm = Number(document.getElementById('jm-radius')?.value || 0);
  const slaFirst = Number(document.getElementById('jm-sla-first')?.value || 120);
  const slaComplete = Number(document.getElementById('jm-sla-complete')?.value || 1440);
  const deadline = document.getElementById('jm-deadline')?.value || null;
  const slotDate = String(document.getElementById('jm-slot-date')?.value || '').trim();
  const slotStart = String(document.getElementById('jm-slot-start')?.value || '').trim();
  const slotEnd = String(document.getElementById('jm-slot-end')?.value || '').trim();
  const polygonTxt = String(document.getElementById('jm-polygon')?.value || '').trim();
  let polygon = null;
  if (!title || unitPrice <= 0 || quantity <= 0) {
    toast('Başlık, işlem başı ücret ve adet zorunlu', 'warn');
    return;
  }
  if (jobType === 'appointment' && (!slotDate || !slotStart || !slotEnd)) {
    toast('Randevu için gün ve saat aralığı zorunlu', 'warn');
    return;
  }
  if (polygonTxt) {
    try { polygon = JSON.parse(polygonTxt); } catch (e) { toast('Polygon JSON geçersiz', 'warn'); return; }
  }
  const wallet = await getFirmWallet(ownerFirmId);
  if (budget > wallet.available) {
    toast('Toplam ücret kullanılabilir bakiyeyi aşıyor', 'err');
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
        p_unit_price: unitPrice,
        p_quantity: quantity,
        p_currency: currency,
        p_requester_firm_id: ownerFirmId,
        p_country: country || null,
        p_city: city || null,
        p_postal_code: null,
        p_radius_km: radiusKm || null,
        p_polygon_geojson: polygon,
        p_requirements: description || null,
        p_deadline_at: deadline ? new Date(deadline).toISOString() : null,
        p_qc_mode: qcMode,
        p_slot_date: slotDate || null,
        p_slot_start: slotStart || null,
        p_slot_end: slotEnd || null,
        p_sla_first_action_min: slaFirst,
        p_sla_complete_min: slaComplete
      })
    });
    if (!res.ok) throw new Error(await res.text());
    if (typeof logAuditEvent === 'function') await logAuditEvent('job_post_created', 'job_post', title, { budget, unit_price: unitPrice, quantity, currency, qc_mode: qcMode, owner_firm_id: ownerFirmId });
    toast('İlan yayınlandı', 'ok');
    await refreshWalletInfo();
    await loadJobPosts();
  } catch (e) {
    toast('İlan açılamadı: ' + (e.message || ''), 'err');
  }
}

function onJobTypeChange() {
  const t = String(document.getElementById('jm-type')?.value || 'custom');
  const slotWrap = document.getElementById('jm-slot-wrap');
  if (slotWrap) slotWrap.style.display = t === 'appointment' ? '' : 'none';
  updateJobPricePreview();
}

function updateJobPricePreview() {
  const unitPrice = Number(document.getElementById('jm-unit-price')?.value || 0);
  const qty = Number(document.getElementById('jm-quantity')?.value || 1);
  const total = Math.max(0, unitPrice * qty);
  const el = document.getElementById('jm-price-preview');
  if (el) el.textContent = `Toplam ücret: ${total.toFixed(2)}`;
}

function initJobPolygonMap() {
  const mapEl = document.getElementById('jm-map');
  if (!mapEl || typeof L === 'undefined' || _jobMap) return;
  _jobMap = L.map(mapEl).setView([41.0082, 28.9784], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(_jobMap);
  _jobMap.on('click', (ev) => {
    _jobPolygonPoints.push([ev.latlng.lng, ev.latlng.lat]);
    drawJobPolygon();
  });
}

function drawJobPolygon() {
  if (!_jobMap) return;
  if (_jobPolygonLayer) _jobMap.removeLayer(_jobPolygonLayer);
  const latLngs = _jobPolygonPoints.map((p) => [p[1], p[0]]);
  if (latLngs.length >= 2) {
    _jobPolygonLayer = L.polyline(latLngs, { color: '#2563eb' }).addTo(_jobMap);
  }
  const polyEl = document.getElementById('jm-polygon');
  if (polyEl) {
    polyEl.value = JSON.stringify({
      type: 'Polygon',
      coordinates: [_jobPolygonPoints.length >= 3 ? [..._jobPolygonPoints, _jobPolygonPoints[0]] : _jobPolygonPoints]
    });
  }
}

function closeJobPolygon() {
  if (_jobPolygonPoints.length >= 3) {
    _jobPolygonPoints = [..._jobPolygonPoints, _jobPolygonPoints[0]];
    drawJobPolygon();
  }
}

function clearJobPolygon() {
  _jobPolygonPoints = [];
  if (_jobMap && _jobPolygonLayer) {
    _jobMap.removeLayer(_jobPolygonLayer);
    _jobPolygonLayer = null;
  }
  const polyEl = document.getElementById('jm-polygon');
  if (polyEl) polyEl.value = '';
}

async function joinJobPost(jobPostId) {
  const perms = await getJobPermissions();
  if (!perms.can_join_job) { toast('Bu işe katılma yetkiniz yok', 'err'); return; }
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
  const perms = await getJobPermissions();
  if (!perms.can_submit_job) { toast('Teslim girme yetkiniz yok', 'err'); return; }
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
        p_field_task_id: fieldTaskId,
        p_idempotency_key: `${currentUser?.id || 'u'}-${jobPostId}-${Date.now()}`
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

function setJobListTab(tab) {
  _jobListTab = tab;
  document.querySelectorAll('.jm-tab-btn').forEach((b) => b.classList.toggle('btn-primary', b.dataset.tab === tab));
  renderJobPostList();
}

function setJobPreset(preset) {
  _jobPreset = preset || '';
  renderJobPostList();
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
