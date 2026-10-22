let _uqCampOverride = '';
let _uqCampFirm = '';
let _uqGeoconQueue = null;
let _geoCamps = [];
let _geoQueues = [];

function geoSay(key, fb) {
  const text = typeof t === 'function' ? t(key) : fb;
  return !text || text === key ? fb : text;
}

function geoDialerLang() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de' : 'tr';
}

function loadGeoconPage() {
  const frame = document.getElementById('geocon-frame');
  if (!frame) return;
  const lang = geoDialerLang();
  if (frame.dataset.loaded === '1') {
    try { frame.contentWindow.postMessage({ type: 'mb-geocon-lang', lang }, window.location.origin); } catch (_) {}
    void mbGeoconPushState(frame.contentWindow);
    return;
  }
  const v = window.MB_APP_VERSION || '';
  frame.src = `geocon/geocon.html?v=${encodeURIComponent(v)}&lang=${lang}`;
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
  if (!data) return;
  if (data.type === 'mb-geocon-transfer') {
    mbOpenGeoconTransfer(data);
    return;
  }
  if (data.action === 'GEO_GET_UPCOMING_PLZ') void mbGeoconUpcoming(event.source);
  if (data.action === 'GEO_GET_TOP_PLZ') void mbGeoconTop(event.source);
  if (data.action === 'GEO_GET_STATE') void mbGeoconPushState(event.source);
  if (data.action === 'GEO_SAVE_SCORE') void mbGeoconSaveScore(data.plz, data.score);
  if (data.action === 'GEO_SAVE_FLAGS') void mbGeoconSaveFlags(data);
  if (data.action === 'GEO_IMPORT_SCORES') void mbGeoconImportScores(data.items);
  if (data.action === 'GEO_IMPORT_FLAGS') void mbGeoconImportFlags(data.items);
});

function geoActiveFirmId() {
  if (typeof getActiveFirmId === 'function') return getActiveFirmId() || '';
  return (typeof currentUser !== 'undefined' && currentUser?.firm_id) || '';
}

function geoPlzCode(plz) {
  const digits = String(plz || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return '';
  return digits.padStart(5, '0').slice(-5);
}

function mbGeoconOnFirm() {
  const frame = document.getElementById('geocon-frame');
  if (!frame || frame.dataset.loaded !== '1') return;
  void mbGeoconPushState(frame.contentWindow);
}

async function mbGeoconPushState(target) {
  if (!target || target === window || typeof sb !== 'function') return;
  const firmId = geoActiveFirmId();
  let scores = [];
  let flags = [];
  try {
    const rows = await sb('geocon_plz_analysis?select=plz,score&limit=10000');
    if (Array.isArray(rows)) scores = rows;
  } catch (_) {}
  if (firmId) {
    try {
      const rows = await sb(`geocon_plz_flags?select=plz,used,recommended,used_at&firm_id=eq.${firmId}&limit=10000`);
      if (Array.isArray(rows)) flags = rows;
    } catch (_) {}
  }
  try {
    target.postMessage({ type: 'GEO_STATE', firmId, scores, flags }, window.location.origin);
  } catch (_) {}
}

async function mbGeoconSaveScore(plz, score) {
  const code = geoPlzCode(plz);
  const n = Number(score);
  if (!code || !Number.isFinite(n) || typeof sb !== 'function') return;
  await sb('geocon_plz_analysis', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    headers: { 'on-conflict': 'plz' },
    body: JSON.stringify({ plz: code, score: Math.round(n * 10) / 10, updated_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function mbGeoconSaveFlags(data) {
  const firmId = geoActiveFirmId();
  const code = geoPlzCode(data?.plz);
  if (!firmId || !code || typeof sb !== 'function') return;
  await sb('geocon_plz_flags', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    headers: { 'on-conflict': 'firm_id,plz' },
    body: JSON.stringify({
      firm_id: firmId,
      plz: code,
      used: !!data.used,
      recommended: !!data.recommended,
      used_at: data.used ? (data.usedAt || new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

async function mbGeoconImportScores(items) {
  for (const row of items || []) await mbGeoconSaveScore(row.plz, row.score);
}

async function mbGeoconImportFlags(items) {
  for (const row of items || []) {
    await mbGeoconSaveFlags({ plz: row.plz, used: row.used, recommended: row.recommended, usedAt: row.usedAt });
  }
}

function geoBerlinDay(offsetDays) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(Date.now() + (Number(offsetDays) || 0) * 86400000));
}

async function mbGeoconUpcoming(target) {
  if (!target || target === window || typeof sb !== 'function') return;
  const day = geoBerlinDay(1);
  let query = `appointments?select=plz,ortschaft,durum&termin_tarih=gte.${day}T00:00:00&termin_tarih=lte.${day}T23:59:59&durum=not.in.(iptal,basarisiz)&limit=2000`;
  const role = currentUser?.role || '';
  if (role !== 'super_admin') {
    const firmId = currentUser?.firm_id || '';
    if (!firmId) {
      try { target.postMessage({ type: 'GEO_UPCOMING_PLZ', items: [], detail: [], dayLabel: day }, window.location.origin); } catch (_) {}
      return;
    }
    query += `&firm_id=eq.${firmId}`;
  }
  let rows = [];
  try {
    const got = await sb(query);
    rows = Array.isArray(got) ? got : [];
  } catch (_) { rows = []; }
  const grouped = new Map();
  rows.forEach((row) => {
    const plz = String(row.plz || '').replace(/\D/g, '');
    if (plz.length < 4) return;
    const code = plz.padStart(5, '0').slice(-5);
    const cur = grouped.get(code) || { plz: code, count: 0, city: row.ortschaft || '' };
    cur.count += 1;
    if (!cur.city && row.ortschaft) cur.city = row.ortschaft;
    grouped.set(code, cur);
  });
  const items = [...grouped.values()].sort((a, b) => b.count - a.count || a.plz.localeCompare(b.plz));
  try {
    target.postMessage({ type: 'GEO_UPCOMING_PLZ', items, detail: items, dayLabel: day }, window.location.origin);
  } catch (_) {}
}

async function mbGeoconTop(target) {
  if (!target || target === window || typeof sb !== 'function') return;
  const from = geoBerlinDay(-180);
  let query = `appointments?select=plz,ortschaft&termin_tarih=gte.${from}T00:00:00&durum=not.in.(iptal,basarisiz)&limit=4000`;
  const role = currentUser?.role || '';
  if (role !== 'super_admin') {
    const firmId = currentUser?.firm_id || '';
    if (!firmId) {
      try { target.postMessage({ type: 'GEO_TOP_PLZ', items: [] }, window.location.origin); } catch (_) {}
      return;
    }
    query += `&firm_id=eq.${firmId}`;
  }
  let rows = [];
  try {
    const got = await sb(query);
    rows = Array.isArray(got) ? got : [];
  } catch (_) { rows = []; }
  const grouped = new Map();
  rows.forEach((row) => {
    const plz = String(row.plz || '').replace(/\D/g, '');
    if (plz.length < 4) return;
    const code = plz.padStart(5, '0').slice(-5);
    const cur = grouped.get(code) || { plz: code, count: 0, city: row.ortschaft || '' };
    cur.count += 1;
    if (!cur.city && row.ortschaft) cur.city = row.ortschaft;
    grouped.set(code, cur);
  });
  const items = [...grouped.values()].sort((a, b) => b.count - a.count || a.plz.localeCompare(b.plz)).slice(0, 20);
  try { target.postMessage({ type: 'GEO_TOP_PLZ', items }, window.location.origin); } catch (_) {}
}
