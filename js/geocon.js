let _uqCampOverride = '';
let _uqCampFirm = '';
let _uqGeoconQueue = null;
let _geoCamps = [];
let _geoQueues = [];

function geoSay(key, fb) {
  const text = typeof t === 'function' ? t(key) : fb;
  return !text || text === key ? fb : text;
}

function loadGeoconPage() {
  const frame = document.getElementById('geocon-frame');
  if (!frame || frame.dataset.loaded === '1') return;
  const v = window.MB_APP_VERSION || '';
  frame.src = `geocon/geocon.html?v=${encodeURIComponent(v)}`;
  frame.dataset.loaded = '1';
}

function mbGeoconSetMode(on) {
  const modal = document.getElementById('m-upload-q');
  if (modal) modal.classList.toggle('is-geocon', !!on);
  const box = document.getElementById('uq-geocon-target');
  if (box) box.hidden = !on;
  const title = document.getElementById('uq-modal-title');
  const submit = document.getElementById('uq-submit-btn');
  if (!on) {
    _uqCampOverride = '';
    _uqCampFirm = '';
    _uqGeoconQueue = null;
    _uqTargetQueueId = '';
    if (title) title.textContent = title.getAttribute('data-tr') || 'Kuyruk Yükle';
    if (submit) submit.textContent = submit.getAttribute('data-tr') || 'Yükle';
    return;
  }
  if (title) title.textContent = geoSay('geo.title', 'Kuyruğa aktar');
  if (submit) submit.textContent = geoSay('geo.title', 'Kuyruğa aktar');
}

function mbOpenGeoconTransfer(msg) {
  const rows = Array.isArray(msg?.rows) ? msg.rows.filter((row) => row && typeof row === 'object') : [];
  if (!rows.length) {
    toast(geoSay('geo.empty', 'Aktarılacak kişi yok'), 'warn');
    return;
  }
  const keys = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  const matrix = rows.map((row) => keys.map((key) => (row[key] == null ? '' : String(row[key]))));
  if (typeof resetUploadQueueForm === 'function') resetUploadQueueForm();
  _uqTargetQueueId = '';
  _uqGeoconQueue = null;
  _uqCampOverride = '';
  _uqCampFirm = '';
  uploadFile = { name: 'GeoCon', size: 1 };
  if (typeof uqApplyMatrix === 'function') uqApplyMatrix(keys, matrix);
  const nameEl = document.getElementById('uq-name');
  if (nameEl) {
    nameEl.readOnly = false;
    nameEl.value = String(msg.label || '').slice(0, 80);
  }
  mbGeoconSetMode(true);
  if (typeof openModal === 'function') openModal('m-upload-q');
  void mbGeoconLoadCamps();
}

async function mbGeoconLoadCamps() {
  const sel = document.getElementById('uq-camp');
  if (!sel || typeof sb !== 'function') return;
  sel.innerHTML = `<option value="">${geoSay('geo.need.camp', 'Kampanya seç')}</option>`;
  let query = 'campaigns?select=id,name,firm_id&order=name.asc';
  const role = currentUser?.role || '';
  if (role !== 'super_admin') {
    const firmId = currentUser?.firm_id || '';
    if (!firmId) return;
    query += `&firm_id=eq.${firmId}`;
  }
  try {
    const rows = await sb(query);
    _geoCamps = Array.isArray(rows) ? rows : [];
  } catch (e) {
    _geoCamps = [];
    toast(e.message || geoSay('uq.err.generic', 'Yükleme başarısız'), 'err');
  }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  sel.innerHTML = `<option value="">${esc(geoSay('geo.need.camp', 'Kampanya seç'))}</option>` + _geoCamps.map((camp) => (
    `<option value="${esc(camp.id)}" data-firm="${esc(camp.firm_id || '')}">${esc(camp.name || '')}</option>`
  )).join('');
}

async function mbGeoconPickCamp() {
  const sel = document.getElementById('uq-camp');
  const opt = sel?.selectedOptions?.[0];
  _uqCampOverride = sel?.value || '';
  _uqCampFirm = opt?.dataset?.firm || '';
  _uqTargetQueueId = '';
  _uqGeoconQueue = null;
  const nameEl = document.getElementById('uq-name');
  if (nameEl) nameEl.readOnly = false;
  await mbGeoconLoadQueues(_uqCampOverride);
  if (typeof renderColumnMapping === 'function') renderColumnMapping();
}

async function mbGeoconLoadQueues(campId) {
  const sel = document.getElementById('uq-queue');
  if (!sel) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const fresh = geoSay('geo.queue.new', 'Yeni kuyruk');
  if (!campId || typeof sb !== 'function') {
    _geoQueues = [];
    sel.innerHTML = `<option value="">${esc(fresh)}</option>`;
    return;
  }
  try {
    const rows = await sb(`queues?campaign_id=eq.${campId}&select=id,name,total_contacts,campaign_id&order=name.asc`);
    _geoQueues = Array.isArray(rows) ? rows : [];
  } catch (e) {
    _geoQueues = [];
  }
  sel.innerHTML = `<option value="">${esc(fresh)}</option>` + _geoQueues.map((queue) => (
    `<option value="${esc(queue.id)}" data-name="${esc(queue.name || '')}" data-total="${Number(queue.total_contacts || 0)}">${esc(queue.name || '')}</option>`
  )).join('');
}

function mbGeoconPickQueue() {
  const sel = document.getElementById('uq-queue');
  const nameEl = document.getElementById('uq-name');
  const id = sel?.value || '';
  if (!id) {
    _uqTargetQueueId = '';
    _uqGeoconQueue = null;
    if (nameEl) nameEl.readOnly = false;
    return;
  }
  const opt = sel.selectedOptions[0];
  const queueName = opt?.dataset?.name || opt?.textContent || '';
  _uqTargetQueueId = id;
  _uqGeoconQueue = {
    id,
    name: queueName,
    total_contacts: Number(opt?.dataset?.total || 0),
    campaign_id: _uqCampOverride,
  };
  if (nameEl) {
    nameEl.value = queueName;
    nameEl.readOnly = true;
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'mb-geocon-transfer') return;
  mbOpenGeoconTransfer(data);
});
