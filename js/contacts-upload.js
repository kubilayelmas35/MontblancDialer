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
  const countEl = document.getElementById('uq-row-count');
  if (countEl) countEl.textContent = '';
  document.querySelectorAll('.uq-skip-status').forEach((box) => { box.checked = false; });
  const excelMode = document.querySelector('input[name="dedup-mode"][value="excel"]');
  if (excelMode) excelMode.checked = true;
  mbAddrClear();
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

function uqNameFromFile(filename) {
  const base = String(filename || '').split(/[/\\]/).pop() || '';
  return base.replace(/\.[^.]+$/, '').trim().slice(0, 120);
}

async function setFile(f) {
  mbAddrClear();
  uploadFile = f;
  _uqWorkbook = null;
  document.getElementById('uq-fname').textContent = `✓ ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
  const nameEl = document.getElementById('uq-name');
  if (nameEl && !nameEl.readOnly && !String(nameEl.value || '').trim()) {
    const stem = uqNameFromFile(f.name);
    if (stem) nameEl.value = stem;
  }
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
  const builtin = new Set(['phone', 'phone2', 'name', 'first_name', 'last_name', 'plz', 'city', 'address', 'attempt', 'house_no', 'notes']);
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
    ...UQ_TARGET_FIELDS.filter((field) => field.key !== 'cc' && field.key !== 'vorwahl' && uqUploadFieldOn(field.key)).map((field) => ({ ...field, label: uqSay(field.labelKey, field.key), store: 'column' })),
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
<select class="form-input" id="uq-map-${field.key}" onchange="mbAddrClear();updateUploadPreview()">
<option value="">${esc(placeholder)}</option>
${options}
</select>
</div>`;
  }).join('');
  uqRenderDialExtra();
  updateUploadPreview();
}

function uqUploadFieldOn(key) {
  if (key !== 'house_no') return true;
  const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === currentCampId);
  const fc = typeof mbParseFieldConfig === 'function' ? mbParseFieldConfig(camp) : {};
  return typeof mbFieldShown === 'function' && mbFieldShown(fc, 'house_no', false);
}

function uqDialExtrasOpen() {
  const el = document.getElementById('uq-dial-extra');
  return !!el && el.style.display !== 'none';
}

function uqToggleDialExtra() {
  const host = document.getElementById('uq-dial-extra');
  if (!host) return;
  const open = host.style.display === 'none';
  host.style.display = open ? 'grid' : 'none';
  document.getElementById('uq-dial-toggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  updateUploadPreview();
}

function uqRenderDialExtra() {
  const preview = document.getElementById('uq-preview');
  if (!preview) return;
  let btn = document.getElementById('uq-dial-toggle');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'uq-dial-toggle';
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.marginTop = '10px';
    btn.setAttribute('aria-expanded', 'false');
    btn.onclick = () => uqToggleDialExtra();
    preview.insertAdjacentElement('afterend', btn);
  }
  btn.textContent = uqSay('uq.dial.toggle', 'Numara düzenleme');
  let host = document.getElementById('uq-dial-extra');
  if (!host) {
    host = document.createElement('div');
    host.id = 'uq-dial-extra';
    btn.insertAdjacentElement('afterend', host);
  }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const auto = typeof mbAutoMapHeaders === 'function' ? mbAutoMapHeaders(uploadHeaders) : {};
  host.style.cssText = 'display:none;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;';
  host.innerHTML = ['cc', 'vorwahl'].map((key) => {
    const field = (UQ_TARGET_FIELDS || []).find((row) => row.key === key);
    const label = uqSay(field?.labelKey || key, key);
    const guessed = auto[key];
    const picked = guessed == null || guessed < 0 ? '' : String(guessed);
    const options = (uploadHeaders || []).map((h, i) => {
      const name = (uploadHeaderLabels && uploadHeaderLabels[i]) || h;
      return `<option value="${i}" ${picked === String(i) ? 'selected' : ''}>${esc(name)}</option>`;
    }).join('');
    const ph = key === 'cc' ? uqSay('uq.dial.cc.ph', '90') : uqSay('uq.dial.area.ph', '212');
    return `<div>
<div class="form-label" style="margin-bottom:4px;">${esc(label)}</div>
<input class="form-input" id="uq-fixed-${key}" inputmode="numeric" autocomplete="off" placeholder="${esc(ph)}" oninput="mbAddrClear();updateUploadPreview()" style="margin-bottom:6px;">
<select class="form-input" id="uq-map-${key}" onchange="mbAddrClear();updateUploadPreview()">
<option value="">${esc(uqSay('uq.map.skip', '— Kullanma —'))}</option>
${options}
</select>
</div>`;
  }).join('') + `<div style="grid-column:1 / -1;font-size:11px;color:var(--text-3);line-height:1.4;">${esc(uqSay('uq.dial.hint', ''))}</div>`;
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
    if ((key === 'cc' || key === 'vorwahl') && !uqDialExtrasOpen()) return '';
    const idx = mapping[key];
    const fromCol = (idx !== undefined && idx >= 0) ? String(row[idx] || '').trim().replace(/["\r]/g, '') : '';
    if (key !== 'cc' && key !== 'vorwahl') return fromCol;
    const fixed = String(document.getElementById(`uq-fixed-${key}`)?.value || '').trim();
    return fromCol || fixed;
  };
  let first = get('first_name');
  let last = get('last_name');
  const full = get('name');
  if (full && !first && !last && typeof mbSplitPersonName === 'function') {
    const split = mbSplitPersonName(full);
    first = split.first_name;
    last = split.last_name;
  }
  const join = (key) => (typeof mbComposeDialPhone === 'function'
    ? mbComposeDialPhone(get(key), get('cc'), key === 'phone' ? get('vorwahl') : '')
    : get(key));
  const extra = {};
  uqExtraUploadFields().forEach((field) => {
    if (field.store !== 'extra') return;
    const value = get(field.key);
    if (value) extra[field.key] = value;
  });
  const rowOut = {
    phone: join('phone'),
    phone2: join('phone2'),
    first_name: first,
    last_name: last,
    city: get('city'),
    plz: get('plz'),
    address: get('address'),
  };
  const notes = get('notes');
  if (notes) rowOut.notes = notes;
  const house = get('house_no');
  if (house) rowOut.house_no = house;
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
  if (skipped.addrMerged) lines.push(uqSay('uq.addr.merged', '{n} aynı adres birleştirildi, numara nota yazıldı', { n: skipped.addrMerged }));
  if (skipped.addrSkipped) lines.push(uqSay('uq.addr.skipped', '{n} aynı adres atlandı', { n: skipped.addrSkipped }));
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

let _uqAddrGroups = null;

function mbAddrFold(value) {
  return String(value || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

function mbAddrHouse(raw) {
  let s = mbAddrFold(raw).replace(/[.,:;]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:no|nr|numara|hausnr|hnr)\s+/, '');
  s = s.replace(/(\d)\s*([/-])\s*(\d)/g, '$1$2$3');
  if (!/^\d+[a-z]?(?:[/-]\d+[a-z]?)?$/.test(s)) return '';
  return s;
}

function mbAddrKey(address, plz, houseNo) {
  const code = String(plz || '').replace(/\D/g, '');
  if (code.length < 4 || code.length > 6) return '';
  let street = mbAddrFold(address).replace(/[.,:;]+/g, ' ').replace(/\s+/g, ' ').trim();
  street = street.replace(/(\d)\s*([/-])\s*(\d)/g, '$1$2$3');
  street = street.replace(/str\b/g, 'strasse');
  let no = mbAddrHouse(houseNo);
  if (no) {
    const tail = no.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
    street = street.replace(new RegExp(`(?:\\s+(?:no|nr|numara|hausnr|hnr))?\\s+${tail}$`), '').trim();
  } else {
    const hit = street.match(/^(.*?)(?:\s+(?:no|nr|numara|hausnr|hnr))?\s+(\d+[a-z]?(?:[/-]\d+[a-z]?)?)$/);
    if (!hit) return '';
    street = hit[1].trim();
    no = hit[2];
  }
  street = street.replace(/\s+(?:no|nr|numara|hausnr|hnr)$/, '').replace(/\s+/g, ' ').trim();
  if (!street || !no) return '';
  return `${code}|${street}|${no}`;
}

function mbAddrClear() {
  _uqAddrGroups = null;
  const box = document.getElementById('uq-addr-box');
  if (box) {
    box.hidden = true;
    box.innerHTML = '';
    delete box.dataset.open;
    delete box.dataset.count;
  }
  const submit = document.getElementById('uq-submit-btn');
  if (submit) submit.textContent = uqSay('uq.upload', 'Yükle');
}

function mbAddrWho(row) {
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
  return [name, row?.phone || ''].filter(Boolean).join(' · ') || '—';
}

function mbAddrFace(row) {
  const no = String(row?.house_no || '').trim();
  const addr = String(row?.address || '').trim();
  const folded = mbAddrFold(addr);
  const token = mbAddrFold(no);
  const shown = no && token && !folded.endsWith(token) ? `${addr} ${no}` : addr;
  return [shown, row?.plz || ''].filter(Boolean).join(' · ') || '—';
}

function mbAddrNote(existing, phones, ownPhone, ownPhone2) {
  const have = new Set([ownPhone, ownPhone2].map((p) => (typeof mbNormalizeDialPhone === 'function' ? mbNormalizeDialPhone(p) : String(p || ''))).filter(Boolean));
  const text = String(existing || '');
  const add = [];
  (phones || []).forEach((p) => {
    const n = typeof mbNormalizeDialPhone === 'function' ? mbNormalizeDialPhone(p) : String(p || '');
    if (!n || have.has(n) || text.includes(n)) return;
    have.add(n);
    add.push(n);
  });
  if (!add.length) return text;
  const line = `${uqSay('uq.addr.note', 'Aynı adres')} · ${add.join(' · ')}`;
  return text ? `${text}\n${line}` : line;
}

function mbAddrExport(row) {
  const out = { ...row };
  delete out._addrKey;
  const no = String(out.house_no || '').trim();
  delete out.house_no;
  if (no) {
    const addr = String(out.address || '').trim();
    const token = mbAddrFold(no);
    if (token && !mbAddrFold(addr).endsWith(token)) out.address = addr ? `${addr} ${no}` : no;
  }
  return out;
}

async function mbAddrLive(plzs, firmId) {
  const codes = [...new Set((plzs || []).map((p) => String(p || '').replace(/\D/g, '')).filter((p) => p.length >= 4 && p.length <= 6))];
  const rows = [];
  const firm = /^[0-9a-f-]{36}$/i.test(String(firmId || '')) ? `&firm_id=eq.${firmId}` : '';
  if (!firm) return rows;
  for (let i = 0; i < codes.length; i += 25) {
    const list = codes.slice(i, i + 25).map((code) => `"${code}"`).join(',');
    let offset = 0;
    for (;;) {
      const part = await sb(`contacts?select=id,phone,phone2,first_name,last_name,address,plz,notes&plz=in.(${list})${firm}&limit=1000&offset=${offset}`) || [];
      rows.push(...part);
      if (part.length < 1000 || rows.length >= 8000) return rows;
      offset += 1000;
    }
  }
  return rows;
}

async function mbAddrCollect(contacts, firmId) {
  const byKey = new Map();
  (contacts || []).forEach((row, index) => {
    const key = mbAddrKey(row.address, row.plz, row.house_no);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, file: [], live: [] });
    byKey.get(key).file.push(index);
  });
  if (!byKey.size) return [];
  const plzs = (contacts || []).map((row) => row.plz);
  let live = [];
  try { live = await mbAddrLive(plzs, firmId); } catch (e) { live = []; }
  live.forEach((row) => {
    const key = mbAddrKey(row.address, row.plz);
    if (!key || !byKey.has(key)) return;
    const group = byKey.get(key);
    if (group.live.some((item) => item.id === row.id)) return;
    group.live.push(row);
  });
  return [...byKey.values()].filter((group) => group.file.length > 1 || group.live.length);
}

function mbAddrPickAll(choice) {
  document.querySelectorAll('#uq-addr-box input[type="radio"]').forEach((el) => { el.checked = el.value === choice; });
}

function mbAddrPaint(groups, contacts) {
  const box = document.getElementById('uq-addr-box');
  if (!box) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const cards = groups.map((group, index) => {
    const sample = contacts[group.file[0]] || {};
    const live = group.live.slice(0, 3).map((row) => esc(mbAddrWho(row))).join('<br>');
    const file = group.file.slice(0, 4).map((idx) => esc(mbAddrWho(contacts[idx]))).join('<br>');
    const choice = (value, label, on) => `<label><input type="radio" name="uq-addr-${index}" value="${value}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
    return `<div class="uq-addr-card"><strong>${esc(mbAddrFace(sample))}</strong>${live ? `<p>${esc(uqSay('uq.addr.live', 'Sistemde'))}: ${live}</p>` : ''}<p>${esc(uqSay('uq.addr.file', 'Dosyada'))}: ${file}</p><div class="uq-addr-choices">${choice('add', uqSay('uq.addr.add', 'Ekle'), false)}${choice('skip', uqSay('uq.addr.skip', 'Atla'), false)}${choice('merge', uqSay('uq.addr.merge', 'Birleştir'), true)}</div></div>`;
  }).join('');
  box.innerHTML = `<div style="font-size:12px;font-weight:700;color:var(--text);">${esc(uqSay('uq.addr.title', 'Aynı adres'))}</div><div class="uq-addr-hint">${esc(uqSay('uq.addr.hint', 'Posta kodu, sokak ve kapı numarası birebir aynı olanlar. 5 ile 5/2 ayrı kayıttır.'))}</div><div class="uq-addr-bulk"><button type="button" class="btn btn-ghost btn-xs" onclick="mbAddrPickAll('merge')">${esc(uqSay('uq.addr.all.merge', 'Hepsini birleştir'))}</button><button type="button" class="btn btn-ghost btn-xs" onclick="mbAddrPickAll('add')">${esc(uqSay('uq.addr.all.add', 'Hepsini ekle'))}</button><button type="button" class="btn btn-ghost btn-xs" onclick="mbAddrPickAll('skip')">${esc(uqSay('uq.addr.all.skip', 'Hepsini atla'))}</button></div><div class="uq-addr-list">${cards}</div>`;
  box.hidden = false;
  box.dataset.open = '1';
  box.dataset.count = String(contacts.length);
  _uqAddrGroups = groups;
  box.scrollIntoView({ block: 'nearest' });
}

function mbAddrTake(contacts, groups) {
  const drop = new Set();
  const patches = [];
  let merged = 0;
  let skipped = 0;
  (groups || []).forEach((group, index) => {
    const choice = document.querySelector(`input[name="uq-addr-${index}"]:checked`)?.value || 'merge';
    const incoming = group.file.map((idx) => contacts[idx]).filter(Boolean);
    const phones = incoming.flatMap((row) => [row.phone, row.phone2].filter(Boolean));
    if (choice === 'add') return;
    if (choice === 'skip') {
      group.file.forEach((idx) => drop.add(idx));
      skipped += group.file.length;
      return;
    }
    if (group.live.length) {
      group.file.forEach((idx) => drop.add(idx));
      merged += group.file.length;
      const host = group.live[0];
      const notes = mbAddrNote(host.notes, phones, host.phone, host.phone2);
      if (host.id && notes !== String(host.notes || '')) patches.push({ id: host.id, notes });
      return;
    }
    const keep = group.file[0];
    group.file.slice(1).forEach((idx) => drop.add(idx));
    merged += Math.max(0, group.file.length - 1);
    const host = contacts[keep];
    if (!host) return;
    const others = incoming.slice(1).flatMap((row) => [row.phone, row.phone2].filter(Boolean));
    host.notes = mbAddrNote(host.notes, others, host.phone, host.phone2);
  });
  return { contacts: contacts.filter((_, idx) => !drop.has(idx)), patches, merged, skipped };
}

async function mbAddrPatch(patches) {
  for (const patch of patches || []) {
    if (!/^[0-9a-f-]{36}$/i.test(String(patch.id || ''))) continue;
    await sb(`contacts?id=eq.${patch.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ notes: patch.notes }),
    });
  }
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
  let contacts = [];
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
  const campRow = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === campId);
  const firmId = (typeof _uqCampFirm !== 'undefined' && _uqCampFirm) || campRow?.firm_id || currentUser?.firm_id || null;
  const addrBox = document.getElementById('uq-addr-box');
  const reviewing = !!(addrBox && addrBox.dataset.open === '1' && _uqAddrGroups && Number(addrBox.dataset.count) === contacts.length);
  let patches = [];
  if (reviewing) {
    const taken = mbAddrTake(contacts, _uqAddrGroups);
    contacts = taken.contacts;
    patches = taken.patches;
    skipped.addrMerged = taken.merged;
    skipped.addrSkipped = taken.skipped;
    mbAddrClear();
  } else if (contacts.length) {
    const submitEarly = document.getElementById('uq-submit-btn');
    const progressEarly = document.getElementById('uq-progress-section');
    if (submitEarly) submitEarly.disabled = true;
    if (progressEarly) progressEarly.style.display = '';
    const labelEarly = document.getElementById('uq-progress-label');
    if (labelEarly) labelEarly.textContent = uqSay('uq.addr.checking', 'Adresler kontrol ediliyor...');
    try {
      const groups = await mbAddrCollect(contacts, firmId);
      if (groups.length) {
        mbAddrPaint(groups, contacts);
        if (submitEarly) {
          submitEarly.disabled = false;
          submitEarly.textContent = uqSay('uq.addr.go', 'Seç ve yükle');
        }
        if (progressEarly) progressEarly.style.display = 'none';
        return;
      }
    } catch (e) {
      if (submitEarly) submitEarly.disabled = false;
      if (progressEarly) progressEarly.style.display = 'none';
      toast(e.message || uqSay('uq.err.generic', 'Yükleme başarısız'), 'err');
      return;
    }
    if (submitEarly) submitEarly.disabled = false;
    if (progressEarly) progressEarly.style.display = 'none';
  }
  const reportLines = mbUploadReportLines(skipped, campCounts);
  if (!contacts.length) {
    if (patches.length) {
      try { await mbAddrPatch(patches); } catch (e) {
        toast(e.message || uqSay('uq.err.generic', 'Yükleme başarısız'), 'err');
        return;
      }
    }
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
    let queue = foundTarget ? foundTarget.queue : null;
    let reusedQueue = false;
    if (queue) {
      setProgress(5, uqSay('uq.adding', 'Kuyruğa ekleniyor...'), `${contacts.length.toLocaleString()} kişi hazırlanıyor`);
    } else {
      setProgress(5, 'Kuyruk oluşturuluyor...', `${contacts.length.toLocaleString()} kişi hazırlanıyor`);
      if (typeof mbIsManualQueue === 'function' && mbIsManualQueue({ name })) {
        const camp = (campaigns || []).find((c) => c.id === campId);
        queue = (camp?.queues || []).find((q) => mbIsManualQueue(q)) || null;
        if (!queue?.id && typeof mbEnsureManualQueue === 'function') queue = await mbEnsureManualQueue(campId);
        if (queue?.id) reusedQueue = true;
      }
      const queueBody = queue?.id ? null : { campaign_id:campId, name, total_contacts:contacts.length };
      if (queueBody) {
      if (firmId) queueBody.firm_id = firmId;
      const queueRes = await sb('queues', {
        method:'POST', prefer: 'return=representation',
        body: JSON.stringify(queueBody)
      });
      queue = Array.isArray(queueRes) ? queueRes[0] : queueRes;
      }
      if (!queue?.id) {
        const found = await sb(`queues?campaign_id=eq.${campId}&name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`);
        queue = Array.isArray(found) ? found[0] : found;
      }
      if (!queue?.id) throw new Error('Kuyruk oluşturulamadı — ID alınamadı');
    }
    const withQ = contacts.map(c => {
      const row = mbAddrExport({ ...c, queue_id: queue.id });
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
    if (foundTarget || reusedQueue) {
      const base = foundTarget ? foundTarget.queue : queue;
      const nextTotal = Number(base.total_contacts || 0) + contacts.length;
      await sb(`queues?id=eq.${base.id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ total_contacts: nextTotal }),
      });
      base.total_contacts = nextTotal;
      base._left = null;
      base._sales = null;
    }
    if (patches.length) await mbAddrPatch(patches);
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
      if (!foundTarget && !(campMem.queues || []).some((q) => q.id === queue.id)) {
        campMem.queues = [{ id: queue.id, name, total_contacts: contacts.length, dialed_count: 0, status: 'active', campaign_id: campId, firm_id: firmId, created_at: new Date().toISOString() }, ...(campMem.queues || [])];
      }
      if (typeof renderCampGrid === 'function') renderCampGrid();
      if (typeof renderCampQueues === 'function') renderCampQueues(campMem);
    }
    if (typeof loadCampaigns === 'function') await loadCampaigns();
    if (document.getElementById('page-queues')?.classList.contains('active') && typeof paintQueuesPage === 'function') {
      paintQueuesPage();
      if (typeof fillQueuesPageCounts === 'function') void fillQueuesPageCounts();
    }
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
