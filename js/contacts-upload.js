// ─────────────────────────────────────────────
// CONTACTS — kişi yönetimi ve kuyruk yükleme
// ─────────────────────────────────────────────

// ── Upload Queue ──────────────────────────────
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
  document.querySelectorAll('.uq-skip-status').forEach((box) => { box.checked = false; });
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

function renderColumnMapping() {
  const grid = document.getElementById('uq-mapping-grid');
  if (!grid) return;
  const auto = typeof mbAutoMapHeaders === 'function' ? mbAutoMapHeaders(uploadHeaders) : {};
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const title = document.getElementById('uq-map-title');
  if (title) title.textContent = uqSay('uq.map.title', 'Sütun eşleştirme');
  grid.innerHTML = UQ_TARGET_FIELDS.map((field) => {
    const picked = auto[field.key];
    const options = uploadHeaders.map((h, i) => {
      const label = (uploadHeaderLabels && uploadHeaderLabels[i]) || h;
      return `<option value="${i}" ${picked === i ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    const placeholder = field.required
      ? uqSay('uq.map.required', '— Seç (Zorunlu) —')
      : uqSay('uq.map.skip', '— Kullanma —');
    const fieldLabel = uqSay(field.labelKey, field.key);
    return `<div>
<div class="form-label" style="margin-bottom:4px;">${esc(fieldLabel)}</div>
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
  rows.innerHTML = sample.map((row) => {
    const mapped = mbRowFromMapping(row, getUploadMapping());
    return `<div style="background:var(--bg-2);border-radius:4px;padding:5px 8px;margin-bottom:4px;font-size:10px;display:flex;gap:8px;flex-wrap:wrap;">
${Object.entries(mapped).filter(([,v])=>v).map(([k,v])=>`<span><b style="color:var(--accent)">${esc(k)}:</b> ${esc(v)}</span>`).join(' · ')}
</div>`;
  }).join('');
}

function getUploadMapping() {
  const map = {};
  UQ_TARGET_FIELDS.forEach((f) => {
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
  return {
    phone: norm(get('phone')),
    phone2: norm(get('phone2')),
    first_name: first,
    last_name: last,
    city: get('city'),
    plz: get('plz'),
    address: get('address'),
  };
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

function mbUploadSkipText(skipped) {
  const bits = [];
  if (skipped.empty) bits.push(`${skipped.empty} ${uqSay('uq.skip.empty', 'boş numara')}`);
  if (skipped.invalid) bits.push(`${skipped.invalid} ${uqSay('uq.skip.invalid', 'geçersiz numara')}`);
  if (skipped.duplicate) bits.push(`${skipped.duplicate} ${uqSay('uq.skip.dup', 'dosyada mükerrer')}`);
  if (skipped.existing) bits.push(`${skipped.existing} ${uqSay('uq.skip.existing', 'zaten kayıtlı')}`);
  Object.entries(skipped.outcomes || {}).forEach(([key, n]) => {
    if (!n) return;
    const spec = UQ_OUTCOME_SKIP.find((row) => row.key === key);
    bits.push(`${n} ${uqSay(spec?.label || key, spec?.fb || key)}`);
  });
  return bits.join(', ');
}

async function uploadQueue() {
  const name = document.getElementById('uq-name').value.trim();
  if (!name)          { toast(campT('camp.queue.name.required', 'Kuyruk adı gerekli'), 'err'); return; }
  if (!uploadFile)    { toast(uqSay('uq.need.file', 'Dosya seçin'), 'err'); return; }
  if (!currentCampId) { toast(uqSay('uq.need.camp', 'Önce kampanya seçin'), 'err'); return; }
  if (!(uploadParsedRows.length && uploadHeaders.length)) {
    toast(uqSay('uq.need.rows', 'Dosya okunamadı'), 'err');
    return;
  }
  const mapping = getUploadMapping();
  if (!mapping.phone && mapping.phone !== 0) { toast(uqSay('uq.need.phone', 'Telefon sütunu seçilmedi'), 'err'); return; }
  const parsed = uploadParsedRows.map((row) => ({
    queue_id: '__PH__',
    campaign_id: currentCampId,
    ...mbRowFromMapping(row, mapping),
  }));
  const classified = typeof mbClassifyLeadRows === 'function'
    ? mbClassifyLeadRows(parsed)
    : { accepted: parsed.filter((c) => c.phone), skipped: { empty: 0, invalid: 0, duplicate: 0 } };
  const mode = getDedupMode();
  const existing = await mbFindExistingPhones(classified.accepted.map((c) => c.phone), mode, currentCampId);
  const outcomeKeys = getUploadOutcomeSkip();
  let outcomeHits = new Map();
  if (outcomeKeys.length) {
    try {
      const left = classified.accepted.filter((row) => !existing.has(row.phone)).map((row) => row.phone);
      outcomeHits = await mbFindPhonesWithStatuses(left, outcomeKeys);
    } catch (e) {
      toast(e.message || uqSay('uq.err.generic', 'Yükleme başarısız'), 'err');
      return;
    }
  }
  const contacts = [];
  let existingCount = 0;
  const outcomeCounts = {};
  classified.accepted.forEach((row) => {
    if (existing.has(row.phone)) { existingCount += 1; return; }
    const st = outcomeHits.get(row.phone);
    if (st) { outcomeCounts[st] = (outcomeCounts[st] || 0) + 1; return; }
    contacts.push(row);
  });
  const skipped = { ...classified.skipped, existing: existingCount, outcomes: outcomeCounts };
  const why = mbUploadSkipText(skipped);
  if (!contacts.length) {
    toast(uqSay('uq.none', 'Geçerli numara yok. Atlanan: {why}', { why: why || '—' }), 'err');
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
    setProgress(5, 'Kuyruk oluşturuluyor...', `${contacts.length.toLocaleString()} kişi hazırlanıyor`);
    const campRow = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === currentCampId);
    const firmId = campRow?.firm_id || currentUser?.firm_id || null;
    const queueBody = { campaign_id:currentCampId, name, total_contacts:contacts.length };
    if (firmId) queueBody.firm_id = firmId;
    const queueRes = await sb('queues', {
      method:'POST', prefer: 'return=representation',
      body: JSON.stringify(queueBody)
    });
    let queue = Array.isArray(queueRes) ? queueRes[0] : queueRes;
    if (!queue?.id) {
      const found = await sb(`queues?campaign_id=eq.${currentCampId}&name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`);
      queue = Array.isArray(found) ? found[0] : found;
    }
    if (!queue?.id) throw new Error('Kuyruk oluşturulamadı — ID alınamadı');
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
    const done = uqSay('uq.done', '{n} kişi yüklendi', { n: contacts.length.toLocaleString() });
    const summary = why ? uqSay('uq.summary', '{done}. Atlanan: {why}', { done, why }) : done;
    setProgress(100, done, summary);
    await new Promise(r => setTimeout(r, 500));
    closeModal('m-upload-q');
    uploadFile = null; uploadParsedRows = []; uploadHeaders = []; uploadHeaderLabels = [];
    _uqWorkbook = null;
    document.getElementById('uq-fname').textContent = '.xlsx, .csv — maks. 50.000 satır';
    document.getElementById('uq-name').value = '';
    document.getElementById('uq-mapping-section').style.display = 'none';
    progressSection.style.display = 'none';
    submitBtn.disabled = false;
    toast(summary, 'ok', 4200);
    const campMem = (campaigns || []).find((c) => c.id === currentCampId);
    if (campMem) {
      campMem.queues = [{ id: queue.id, name, total_contacts: contacts.length, dialed_count: 0, status: 'active', campaign_id: currentCampId, firm_id: firmId }, ...(campMem.queues || [])];
      if (typeof renderCampGrid === 'function') renderCampGrid();
      if (typeof renderCampQueues === 'function') renderCampQueues(campMem);
    }
    if (typeof loadCampaigns === 'function') await loadCampaigns();
  } catch(e) {
    console.error(e);
    const friendly = mbUploadFailText(e);
    setProgress(0, friendly, '');
    submitBtn.disabled = false;
    toast(friendly, 'err');
  }
}
