// ─────────────────────────────────────────────
// CONTACTS — kişi yönetimi ve kuyruk yükleme
// ─────────────────────────────────────────────

// ── Upload Queue ──────────────────────────────
let _uqTargetQueueId = '';

function openFreshQueueUpload() {
  _uqTargetQueueId = '';
  openModal('m-upload-q');
  paintUploadTarget();
}

function openQueueUpload(queueId) {
  const found = typeof findQueue === 'function' ? findQueue(queueId) : null;
  if (!found) {
    toast(uqSay('uq.missing', 'Kuyruk bulunamadı'), 'err');
    return;
  }
  if (found.camp?.id) currentCampId = found.camp.id;
  _uqTargetQueueId = queueId;
  openModal('m-upload-q');
  paintUploadTarget();
}

function paintUploadTarget() {
  const nameEl = document.getElementById('uq-name');
  const note = document.getElementById('uq-target-note');
  const found = _uqTargetQueueId && typeof findQueue === 'function' ? findQueue(_uqTargetQueueId) : null;
  if (found && nameEl) {
    nameEl.value = found.queue.name || '';
    nameEl.readOnly = true;
    if (note) {
      note.hidden = false;
      note.textContent = uqSay('uq.into.note', 'Yeni kuyruk açılmaz. Kişiler «{name}» kuyruğuna eklenir.', { name: found.queue.name || '' });
    }
    return;
  }
  if (nameEl) nameEl.readOnly = false;
  if (note) { note.hidden = true; note.textContent = ''; }
}

function resetUploadQueueForm() {
  uploadFile = null;
  uploadParsedRows = [];
  uploadHeaders = [];
  uploadHeaderLabels = [];
  _uqWorkbook = null;
  const file = document.getElementById('uq-file');
  if (file) file.value = '';
  const fname = document.getElementById('uq-fname');
  if (fname) fname.textContent = '.xlsx, .csv — maks. 50.000 satır';
  const section = document.getElementById('uq-mapping-section');
  if (section) section.style.display = 'none';
  const sheet = document.getElementById('uq-sheet-wrap');
  if (sheet) { sheet.style.display = 'none'; sheet.innerHTML = ''; }
  const progress = document.getElementById('uq-progress-section');
  if (progress) progress.style.display = 'none';
  const submit = document.getElementById('uq-submit-btn');
  if (submit) submit.disabled = false;
  const nameEl = document.getElementById('uq-name');
  if (nameEl) { nameEl.value = ''; nameEl.readOnly = false; }
  const note = document.getElementById('uq-target-note');
  if (note) { note.hidden = true; note.textContent = ''; }
  document.querySelectorAll('.uq-skip-status').forEach((box) => { box.checked = false; });
  const excelMode = document.querySelector('input[name="dedup-mode"][value="excel"]');
  if (excelMode) excelMode.checked = true;
}

function handleFileSelect(e) { if (e.target.files[0]) setFile(e.target.files[0]); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uq-area').classList.remove('drag');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
}

let _uqWorkbook = null;

function uqSay(key, fb, vars) {
  let text = typeof t === 'function' ? t(key) : fb;
  if (!text || text === key) text = fb;
  Object.entries(vars || {}).forEach(([k, v]) => { text = text.replaceAll(`{${k}}`, String(v)); });
  return text;
}

function uqApplyMatrix(headerCells, dataRows) {
  uploadHeaderLabels = headerCells.map((h) => String(h ?? '').replace(/^\uFEFF/, '').trim());
  uploadHeaders = uploadHeaderLabels.map((h) => mbCleanHeader(h));
  uploadParsedRows = dataRows
    .filter((r) => (r || []).some((c) => String(c ?? '').trim()))
    .map((r) => uploadHeaders.map((_, i) => String(r[i] ?? '').trim().replace(/^"|"$/g, '')));
  const countEl = document.getElementById('uq-row-count');
  if (countEl) countEl.textContent = uqSay('uq.map.rows', '{n} satır tespit edildi', { n: uploadParsedRows.length.toLocaleString() });
  const section = document.getElementById('uq-mapping-section');
  if (section) section.style.display = '';
  renderColumnMapping();
}

function uqUseSheet(name) {
  if (!_uqWorkbook || !name || !_uqWorkbook.Sheets[name]) return;
  const raw = XLSX.utils.sheet_to_json(_uqWorkbook.Sheets[name], { header: 1, defval: '' });
  if (!raw.length) { toast(uqSay('uq.err.generic', 'Yükleme başarısız. Dosyayı kontrol edip tekrar deneyin.'), 'err'); return; }
  uqApplyMatrix(raw[0], raw.slice(1));
}

async function setFile(f) {
  uploadFile = f;
  _uqWorkbook = null;
  document.getElementById('uq-fname').textContent = `✓ ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
  try {
    const isXlsx = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls');
    const sheetHost = document.getElementById('uq-sheet-wrap');
    if (isXlsx) {
      const buf = await f.arrayBuffer();
      _uqWorkbook = XLSX.read(buf, { type: 'array', cellText: true, cellDates: false });
      const names = _uqWorkbook.SheetNames || [];
      if (!names.length) { toast(uqSay('uq.err.generic', 'Yükleme başarısız. Dosyayı kontrol edip tekrar deneyin.'), 'err'); return; }
      if (sheetHost) {
        sheetHost.style.display = names.length > 1 ? '' : 'none';
        sheetHost.innerHTML = names.length > 1 ? `<label class="form-label" for="uq-sheet">${uqSay('uq.sheet', 'Sayfa')}</label>
<select class="form-input" id="uq-sheet" onchange="uqUseSheet(this.value)">${names.map((n) => `<option value="${typeof escapeHtml === 'function' ? escapeHtml(n) : n}">${typeof escapeHtml === 'function' ? escapeHtml(n) : n}</option>`).join('')}</select>` : '';
      }
      uqUseSheet(names[0]);
    } else {
      if (sheetHost) { sheetHost.style.display = 'none'; sheetHost.innerHTML = ''; }
      const text = await f.text();
      const sep = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
      const allRows = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map((line) => {
        const out = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { q = !q; continue; }
          if (ch === sep && !q) { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out;
      });
      uqApplyMatrix(allRows[0] || [], allRows.slice(1));
    }
  } catch (e) {
    console.error('Dosya parse hatası:', e);
    toast(uqSay('uq.err.generic', 'Yükleme başarısız. Dosyayı kontrol edip tekrar deneyin.'), 'err');
  }
}

function uqExtraUploadFields() {
  const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === currentCampId);
  const fc = typeof mbParseFieldConfig === 'function' ? mbParseFieldConfig(camp) : {};
  const builtin = new Set(['phone', 'phone2', 'name', 'first_name', 'last_name', 'plz', 'city', 'address', 'attempt']);
  const extra = [];
  Object.entries(fc).forEach(([key, spec]) => {
    if (!spec || typeof spec !== 'object' || builtin.has(key)) return;
    if (typeof mbFieldShown === 'function' && !mbFieldShown(fc, key, false)) return;
    if (!/^[A-Za-z0-9_-]+$/.test(key)) return;
    const label = typeof mbFieldLabel === 'function' ? mbFieldLabel(fc, key, key) : (spec.label || key);
    extra.push({ key, label, store: key === 'notes' ? 'notes' : 'extra' });
  });
  return extra;
}

function uqGuessHeader(label) {
  const fold = (value) => String(value || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşöçı]/gi, '');
  const want = fold(label);
  if (!want) return -1;
  return (uploadHeaders || []).findIndex((header, i) => {
    const got = fold((uploadHeaderLabels && uploadHeaderLabels[i]) || header);
    return got && (got === want || got.includes(want) || want.includes(got));
  });
}

function renderColumnMapping() {
  const grid = document.getElementById('uq-mapping-grid');
  if (!grid) return;
  const auto = typeof mbAutoMapHeaders === 'function' ? mbAutoMapHeaders(uploadHeaders) : {};
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const title = document.getElementById('uq-map-title');
  if (title) title.textContent = uqSay('uq.map.title', 'Sütun eşleştirme');
  const fields = [
    ...UQ_TARGET_FIELDS.map((field) => ({ ...field, label: uqSay(field.labelKey, field.key), store: 'column' })),
    ...uqExtraUploadFields(),
  ];
  grid.innerHTML = fields.map((field) => {
    const guessed = field.store === 'column' ? auto[field.key] : uqGuessHeader(field.label);
    const picked = guessed == null || guessed < 0 ? '' : String(guessed);
    const options = uploadHeaders.map((h, i) => {
      const label = (uploadHeaderLabels && uploadHeaderLabels[i]) || h;
      return `<option value="${i}" ${picked === String(i) ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    const placeholder = field.required
      ? uqSay('uq.map.required', '— Seç (Zorunlu) —')
      : uqSay('uq.map.skip', '— Kullanma —');
    return `<div>
<div class="form-label" style="margin-bottom:4px;">${esc(field.label)}</div>
<select class="form-input" id="uq-map-${field.key}" onchange="updateUploadPreview()">
<option value="">${esc(placeholder)}</option>
${options}
</select>
</div>`;
  }).join('');
  updateUploadPreview();
}

function updateUploadPreview() {
  const preview = document.getElementById('uq-preview');
  const rows = document.getElementById('uq-preview-rows');
  const sample = uploadParsedRows.slice(0, 3);
  if (!sample.length) return;
  preview.style.display = '';
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const labels = {};
  uqExtraUploadFields().forEach((field) => { labels[field.key] = field.label; });
  rows.innerHTML = sample.map((row) => {
    const mapped = mbRowFromMapping(row, getUploadMapping());
    const view = { ...mapped };
    delete view.extra;
    Object.entries(mapped.extra || {}).forEach(([key, value]) => { view[labels[key] || key] = value; });
    return `<div style="background:var(--bg-2);border-radius:4px;padding:5px 8px;margin-bottom:4px;font-size:10px;display:flex;gap:8px;flex-wrap:wrap;">
${Object.entries(view).filter(([,v]) => v && typeof v !== 'object').map(([k,v]) => `<span><b style="color:var(--accent)">${esc(k)}:</b> ${esc(v)}</span>`).join(' · ')}
</div>`;
  }).join('');
}

function getUploadMapping() {
  const map = {};
  const fields = [...UQ_TARGET_FIELDS, ...uqExtraUploadFields()];
  fields.forEach((f) => {
    const sel = document.getElementById(`uq-map-${f.key}`)?.value;
    if (sel === '' || sel == null) return;
    const idx = Number(sel);
    if (Number.isInteger(idx) && idx >= 0 && idx < uploadHeaders.length) map[f.key] = idx;
  });
  return map;
}

function mbRowFromMapping(row, mapping) {
  const get = (key) => {
    const idx = mapping[key];
    return (idx !== undefined && idx >= 0) ? String(row[idx] || '').trim().replace(/["\r]/g, '') : '';
  };
  let first = get('first_name');
  let last = get('last_name');
  const full = get('name');
  if (full && !first && !last && typeof mbSplitPersonName === 'function') {
    const split = mbSplitPersonName(full);
    first = split.first_name;
    last = split.last_name;
  }
  const norm = (v) => (typeof mbNormalizeDialPhone === 'function' ? mbNormalizeDialPhone(v) : v);
  const extra = {};
  uqExtraUploadFields().forEach((field) => {
    if (field.store !== 'extra') return;
    const value = get(field.key);
    if (value) extra[field.key] = value;
  });
  const rowOut = {
    phone: norm(get('phone')),
    phone2: norm(get('phone2')),
    first_name: first,
    last_name: last,
    city: get('city'),
    plz: get('plz'),
    address: get('address'),
  };
  const notes = get('notes');
  if (notes) rowOut.notes = notes;
  if (Object.keys(extra).length) rowOut.extra = extra;
  return rowOut;
}

function mbUploadFailText(err) {
  const raw = String(err?.message || err || '');
  const rls = /42501|row-level security|row level security/i.test(raw);
  const key = rls ? 'uq.err.rls' : 'uq.err.generic';
  if (typeof t === 'function') return t(key);
  return rls
    ? 'Kuyruk oluşturulamadı. Kampanyayı kontrol edip tekrar deneyin.'
    : 'Yükleme başarısız. Dosyayı kontrol edip tekrar deneyin.';
}

const UQ_OUTCOME_SKIP = [
  { key: 'appointment', label: 'camp.ops.appointment', fb: 'Randevu' },
  { key: 'no_answer', label: 'camp.st.no_answer', fb: 'Cevap yok' },
  { key: 'negative', label: 'camp.st.negative', fb: 'Olumsuz' },
  { key: 'callback', label: 'camp.st.callback', fb: 'Geri ara' },
  { key: 'voicemail', label: 'camp.st.voicemail', fb: 'Telesekreter' },
  { key: 'dnc', label: 'camp.st.dnc', fb: 'Kara liste' },
];

function getDedupMode() {
  const sel = document.querySelector('input[name="dedup-mode"]:checked');
  return sel?.value || 'excel';
}

function getUploadOutcomeSkip() {
  return [...document.querySelectorAll('.uq-skip-status:checked')].map((el) => el.value).filter((key) => UQ_OUTCOME_SKIP.some((row) => row.key === key));
}

function mbUploadReportLines(skipped, campCounts) {
  const lines = [];
  if (skipped.empty) lines.push(uqSay('uq.report.empty', '{n} boş numara olduğu için eklenmedi', { n: skipped.empty }));
  if (skipped.invalid) lines.push(uqSay('uq.report.invalid', '{n} geçersiz numara olduğu için eklenmedi', { n: skipped.invalid }));
  if (skipped.duplicate) lines.push(uqSay('uq.report.file', 'Dosyada {n} mükerrer kayıt bulundu, eklenmedi', { n: skipped.duplicate }));
  Object.entries(campCounts || {}).forEach(([name, n]) => {
    if (!n) return;
    lines.push(uqSay('uq.report.camp', '{name} kampanyasında {n} mükerrer kayıt bulundu, eklenmedi', { name, n }));
  });
  Object.entries(skipped.outcomes || {}).forEach(([key, n]) => {
    if (!n) return;
    const spec = UQ_OUTCOME_SKIP.find((row) => row.key === key);
    const label = uqSay(spec?.label || key, spec?.fb || key);
    lines.push(uqSay('uq.report.outcome', '{n} kişi {label} olarak sonuçlandırıldığı için eklenmedi', { n, label }));
  });
  return lines;
}

async function mbShowUploadReport(lines) {
  if (!lines.length) return;
  const title = uqSay('uq.report.title', 'Yükleme raporu');
  const text = lines.join('\n');
  if (typeof mbAlert === 'function') await mbAlert(text, title);
  else toast(text, 'ok', 6000);
}

async function uploadQueue() {
  const campId = (typeof _uqCampOverride !== 'undefined' && _uqCampOverride) || currentCampId;
  const targetId = String(_uqTargetQueueId || '');
  const geoQ = (typeof _uqGeoconQueue !== 'undefined' && _uqGeoconQueue && String(_uqGeoconQueue.id) === targetId) ? _uqGeoconQueue : null;
  const foundTarget = geoQ ? { queue: geoQ } : (targetId && typeof findQueue === 'function' ? findQueue(targetId) : null);
  if (targetId && !foundTarget) { toast(uqSay('uq.missing', 'Kuyruk bulunamadı'), 'err'); return; }
  const name = foundTarget ? String(foundTarget.queue.name || '').trim() : document.getElementById('uq-name').value.trim();
  if (!name)          { toast(campT('camp.queue.name.required', 'Kuyruk adı gerekli'), 'err'); return; }
  if (!uploadFile)    { toast(uqSay('uq.need.file', 'Dosya seçin'), 'err'); return; }
  if (!campId) { toast(uqSay('uq.need.camp', 'Önce kampanya seçin'), 'err'); return; }
  if (!(uploadParsedRows.length && uploadHeaders.length)) {
    toast(uqSay('uq.need.rows', 'Dosya okunamadı'), 'err');
    return;
  }
  const mapping = getUploadMapping();
  if (!mapping.phone && mapping.phone !== 0) { toast(uqSay('uq.need.phone', 'Telefon sütunu seçilmedi'), 'err'); return; }
  const parsed = uploadParsedRows.map((row) => ({
    queue_id: '__PH__',
    campaign_id: campId,
    ...mbRowFromMapping(row, mapping),
  }));
  const mode = getDedupMode();
  const classified = typeof mbClassifyLeadRows === 'function'
    ? mbClassifyLeadRows(parsed, { keepDuplicates: mode === 'none' })
    : { accepted: parsed.filter((c) => c.phone), skipped: { empty: 0, invalid: 0, duplicate: 0 } };
  const places = (mode === 'none' || typeof mbFindExistingPhonePlaces !== 'function')
    ? new Map()
    : await mbFindExistingPhonePlaces(classified.accepted.map((c) => c.phone), mode, campId);
  const outcomeKeys = getUploadOutcomeSkip();
  let outcomeHits = new Map();
  if (outcomeKeys.length) {
    try {
      const left = classified.accepted.filter((row) => !places.has(row.phone)).map((row) => row.phone);
      outcomeHits = await mbFindPhonesWithStatuses(left, outcomeKeys);
    } catch (e) {
      toast(e.message || uqSay('uq.err.generic', 'Yükleme başarısız'), 'err');
      return;
    }
  }
  const contacts = [];
  const campCounts = {};
  const outcomeCounts = {};
  const unknownCamp = uqSay('uq.report.camp.unknown', 'Kampanya');
  classified.accepted.forEach((row) => {
    const place = places.get(row.phone);
    if (place) {
      const campName = place.name || unknownCamp;
      campCounts[campName] = (campCounts[campName] || 0) + 1;
      return;
    }
    const st = outcomeHits.get(row.phone);
    if (st) { outcomeCounts[st] = (outcomeCounts[st] || 0) + 1; return; }
    contacts.push(row);
  });
  const skipped = { ...classified.skipped, outcomes: outcomeCounts };
  const reportLines = mbUploadReportLines(skipped, campCounts);
  if (!contacts.length) {
    await mbShowUploadReport(reportLines);
    if (!reportLines.length) toast(uqSay('uq.none', 'Geçerli numara yok'), 'err');
    return;
  }

  const submitBtn = document.getElementById('uq-submit-btn');
  const progressSection = document.getElementById('uq-progress-section');
  const progressFill = document.getElementById('uq-progress-fill');
  const progressPct = document.getElementById('uq-progress-pct');
  const progressLabel = document.getElementById('uq-progress-label');
  const progressDetail = document.getElementById('uq-progress-detail');
  submitBtn.disabled = true;
  progressSection.style.display = '';
  const setProgress = (pct, label, detail) => {
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    if (label) progressLabel.textContent = label;
    if (detail) progressDetail.textContent = detail;
  };
  try {
    const campRow = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === campId);
    const firmId = (typeof _uqCampFirm !== 'undefined' && _uqCampFirm) || campRow?.firm_id || currentUser?.firm_id || null;
    let queue = foundTarget ? foundTarget.queue : null;
    if (queue) {
      setProgress(5, uqSay('uq.adding', 'Kuyruğa ekleniyor...'), `${contacts.length.toLocaleString()} kişi hazırlanıyor`);
    } else {
      setProgress(5, 'Kuyruk oluşturuluyor...', `${contacts.length.toLocaleString()} kişi hazırlanıyor`);
      const queueBody = { campaign_id:campId, name, total_contacts:contacts.length };
      if (firmId) queueBody.firm_id = firmId;
      const queueRes = await sb('queues', {
        method:'POST', prefer: 'return=representation',
        body: JSON.stringify(queueBody)
      });
      queue = Array.isArray(queueRes) ? queueRes[0] : queueRes;
      if (!queue?.id) {
        const found = await sb(`queues?campaign_id=eq.${campId}&name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`);
        queue = Array.isArray(found) ? found[0] : found;
      }
      if (!queue?.id) throw new Error('Kuyruk oluşturulamadı — ID alınamadı');
    }
    const withQ = contacts.map(c => {
      const row = { ...c, queue_id: queue.id };
      if (firmId) row.firm_id = firmId;
      return row;
    });
    const batchSize = 500;
    const totalBatches = Math.ceil(withQ.length / batchSize);
    for (let i=0; i<withQ.length; i+=batchSize) {
      const batchNum = Math.floor(i/batchSize) + 1;
      const uploaded = Math.min(i+batchSize, withQ.length);
      const pct = Math.round(5 + (i/withQ.length)*90);
      setProgress(pct, `Yükleniyor... (${batchNum}/${totalBatches} batch)`, `${uploaded.toLocaleString()} / ${withQ.length.toLocaleString()} kişi`);
      await sb('contacts', { method:'POST', body: JSON.stringify(withQ.slice(i, i+batchSize)), prefer:'return=minimal' });
    }
    if (foundTarget) {
      const nextTotal = Number(foundTarget.queue.total_contacts || 0) + contacts.length;
      await sb(`queues?id=eq.${foundTarget.queue.id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ total_contacts: nextTotal }),
      });
      foundTarget.queue.total_contacts = nextTotal;
      foundTarget.queue._left = null;
      foundTarget.queue._sales = null;
    }
    const done = uqSay('uq.done', '{n} kişi yüklendi', { n: contacts.length.toLocaleString() });
    setProgress(100, done, reportLines.length ? reportLines.join(' · ') : done);
    await new Promise(r => setTimeout(r, 400));
    closeModal('m-upload-q');
    uploadFile = null; uploadParsedRows = []; uploadHeaders = []; uploadHeaderLabels = [];
    _uqWorkbook = null;
    document.getElementById('uq-fname').textContent = '.xlsx, .csv — maks. 50.000 satır';
    document.getElementById('uq-name').value = '';
    document.getElementById('uq-name').readOnly = false;
    _uqTargetQueueId = '';
    paintUploadTarget();
    document.getElementById('uq-mapping-section').style.display = 'none';
    progressSection.style.display = 'none';
    submitBtn.disabled = false;
    const campMem = (campaigns || []).find((c) => c.id === campId);
    if (campMem) {
      if (!foundTarget) {
        campMem.queues = [{ id: queue.id, name, total_contacts: contacts.length, dialed_count: 0, status: 'active', campaign_id: campId, firm_id: firmId }, ...(campMem.queues || [])];
      }
      if (typeof renderCampGrid === 'function') renderCampGrid();
      if (typeof renderCampQueues === 'function') renderCampQueues(campMem);
    }
    if (typeof loadCampaigns === 'function') await loadCampaigns();
    toast(done, 'ok', 3200);
    if (reportLines.length) {
      await mbShowUploadReport([uqSay('uq.report.added', '{n} kişi kuyruğa eklendi', { n: contacts.length.toLocaleString() }), ...reportLines]);
    }
  } catch(e) {
    console.error(e);
    const friendly = mbUploadFailText(e);
    setProgress(0, friendly, '');
    submitBtn.disabled = false;
    toast(friendly, 'err');
  }
}
