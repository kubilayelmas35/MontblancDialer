// Kampanya alanları ve detay sekmeleri — campaigns.js ile aynı kapsam
function mbParseFieldConfig(camp) {
  let fc = camp?.field_config;
  if (!fc) return {};
  if (typeof fc === 'string') {
    try { fc = JSON.parse(fc); } catch (e) { return {}; }
  }
  return fc && typeof fc === 'object' ? fc : {};
}

function mbFieldShown(fc, key, fallback) {
  const spec = fc?.[key];
  if (spec == null) return !!fallback;
  if (typeof spec === 'boolean') return spec;
  if (typeof spec.show === 'boolean') return spec.show;
  return !!fallback;
}

function mbFieldLabel(fc, key, fallback) {
  const spec = fc?.[key];
  if (spec && typeof spec === 'object' && spec.label) return String(spec.label);
  return fallback;
}

function mbDefaultCampFields() {
  return [
    { key: 'phone', defaultLabel: 'Telefon', type: 'text', show: true, locked: true },
    { key: 'phone2', defaultLabel: 'Telefon 2', type: 'text', show: true, locked: false },
    { key: 'name', defaultLabel: 'Ad / Soyad', type: 'text', show: true, locked: false },
    { key: 'plz', defaultLabel: 'PLZ', type: 'text', show: true, locked: false },
    { key: 'city', defaultLabel: 'Şehir', type: 'text', show: true, locked: false },
    { key: 'address', defaultLabel: 'Adres', type: 'text', show: true, locked: false },
    { key: 'attempt', defaultLabel: 'Arama Sayısı', type: 'number', show: true, locked: false },
    { key: 'notes', defaultLabel: 'Notlar', type: 'text', show: false, locked: false },
    { key: 'custom1', defaultLabel: 'Özel Alan 1', type: 'text', show: false, locked: false },
    { key: 'custom2', defaultLabel: 'Özel Alan 2', type: 'text', show: false, locked: false },
    { key: 'custom3', defaultLabel: 'Özel Alan 3', type: 'number', show: false, locked: false },
  ];
}

function mbMergeCampFields(fc) {
  const defaults = mbDefaultCampFields();
  const known = new Set(defaults.map((f) => f.key));
  const fields = defaults.map((f) => ({
    ...f,
    show: fc?.[f.key]?.show !== undefined ? fc[f.key].show : (typeof fc?.[f.key] === 'boolean' ? fc[f.key] : f.show),
    label: fc?.[f.key]?.label || f.defaultLabel,
    type: fc?.[f.key]?.type || f.type,
    options: Array.isArray(fc?.[f.key]?.options) ? fc[f.key].options : [],
  }));
  Object.entries(fc || {}).forEach(([key, spec]) => {
    if (known.has(key) || !spec || typeof spec !== 'object') return;
    fields.push({
      key,
      defaultLabel: spec.label || key,
      label: spec.label || key,
      type: spec.type || 'text',
      show: spec.show !== false,
      locked: false,
      options: Array.isArray(spec.options) ? spec.options : [],
    });
  });
  const rank = (key, index) => {
    const saved = Number(fc?.[key]?.order);
    if (Number.isFinite(saved)) return saved;
    const at = ['name', 'phone', 'plz', 'city', 'address', 'phone2', 'notes', 'custom1', 'custom2', 'custom3'].indexOf(key);
    return at >= 0 ? at : 100 + index;
  };
  const cards = fields.filter((f) => f.key !== 'attempt');
  cards.forEach((f, i) => { f.order = rank(f.key, i); });
  cards.sort((a, b) => a.order - b.order);
  const attempt = fields.find((f) => f.key === 'attempt');
  const ordered = attempt ? cards.concat([attempt]) : cards;
  ordered.forEach((f, i) => { f.order = i; });
  return ordered;
}

function mbDialerLayoutFields(fc) {
  return mbMergeCampFields(fc).filter((f) => f.show && f.key !== 'attempt');
}

function mbContactFieldText(contact, key) {
  if (!contact || !key) return '';
  if (key === 'name') return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  if (key === 'phone') return contact.phone || '';
  if (key === 'phone2') return contact.phone2 || '';
  if (key === 'plz') return contact.plz || '';
  if (key === 'city') return contact.city || '';
  if (key === 'address') return contact.address || '';
  if (key === 'notes') return contact.notes || '';
  const extra = contact.extra && typeof contact.extra === 'object' ? contact.extra : {};
  return extra[key] == null ? '' : String(extra[key]);
}

function mbFieldSample(field) {
  const samples = {
    name: 'Stefanie und Robert Waldau',
    phone: '4984248850231',
    plz: '85111',
    city: 'Adelschlag',
    address: 'Unterer See 16',
    phone2: '—',
    notes: 'Not',
  };
  if (samples[field?.key]) return samples[field.key];
  if (field?.type === 'number') return '42';
  if (field?.type === 'date') return '01.01.2024';
  if (field?.type === 'boolean') return 'Evet';
  return 'Örnek';
}

function moveFsField(index, dir) {
  const next = index + dir;
  if (!_fsFields || next < 0 || next >= _fsFields.length) return;
  if (_fsFields[index]?.key === 'attempt' || _fsFields[next]?.key === 'attempt') return;
  const row = _fsFields.splice(index, 1)[0];
  _fsFields.splice(next, 0, row);
  _fsFields.forEach((f, i) => { f.order = i; });
  if (document.getElementById('fs-field-list')) { renderFsFieldList(); updateFsPreview(); }
  if (document.getElementById('cd-fs-field-list')) { renderCdFsFieldList(); updateCdFsPreview(); }
}

function mbPaintDialerPreview(el) {
  if (!el) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const labelOf = (f) => (typeof ncLabelShown === 'function' ? ncLabelShown(f.label || '') : (f.label || ''));
  const layout = (_fsFields || []).filter((f) => f.show && f.key !== 'attempt');
  const head = layout.slice(0, 2);
  const boxes = layout.slice(2);
  const title = head[0] ? mbFieldSample(head[0]) : '—';
  const sub = head[1] ? mbFieldSample(head[1]) : '';
  const letter = String(title || '?').trim().charAt(0).toUpperCase() || '?';
  const attemptOn = (_fsFields || []).some((f) => f.key === 'attempt' && f.show);
  el.innerHTML = `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:12px;">
<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
<div style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;">${esc(letter)}</div>
<div style="min-width:0;">
<div style="font-size:15px;font-weight:800;line-height:1.2;">${esc(title)}</div>
<div style="font-size:13px;color:var(--text-2);margin-top:2px;">${esc(sub)}</div>
<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
<span class="badge badge-gray">85</span>
${attemptOn ? '<span class="badge badge-yellow">1. arama</span>' : ''}
</div>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
${boxes.map((f) => `<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:7px 8px;">
<div style="font-size:9px;font-weight:700;color:var(--text-3);letter-spacing:.4px;text-transform:uppercase;">${esc(labelOf(f))}</div>
<div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(mbFieldSample(f))}</div>
</div>`).join('')}
</div>
</div>`;
}

// ── Alan ayarları ──────────────────────────────
function openCampFieldSettings(campId) {
const camp = campaigns.find(c => c.id === campId);
if (!camp) { toast('Kampanya bulunamadı','err'); return; }
_fsCampId = campId;
const fc = mbParseFieldConfig(camp);
_fsFields = mbMergeCampFields(fc);
document.getElementById('m-field-settings')?.remove();
const modal = document.createElement('div');
modal.id = 'm-field-settings';
modal.className = 'modal-overlay open';
modal.style.cssText = 'z-index:3000;';
modal.innerHTML = `
<div class="modal" style="max-width:820px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;">
<div class="modal-hdr" style="flex-shrink:0;">
<div class="modal-title">⚙️ Alan Ayarları — ${camp.name}</div>
<button class="modal-close" onclick="document.getElementById('m-field-settings').remove()">✕</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;min-height:0;">
<div style="padding:16px;overflow-y:auto;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">
<div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">${campEsc(campT('camp.fields.order','İlk iki alan üstte durur. Oklarla yer değiştir. Altındakiler kutu olur.'))}</div>
<div id="fs-field-list" style="display:flex;flex-direction:column;gap:5px;"></div>
</div>
<div style="padding:16px;overflow-y:auto;background:var(--bg-3);">
<div style="font-size:10px;font-weight:800;color:var(--text-3);text-align:center;margin-bottom:10px;letter-spacing:.5px;">AGENT ÇAĞRI EKRANI ÖNİZLEME</div>
<div id="fs-preview" style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px;"></div>
</div>
</div>
<div class="modal-footer" style="flex-shrink:0;">
<button class="btn btn-ghost" onclick="document.getElementById('m-field-settings').remove()">İptal</button>
<button class="btn btn-primary" onclick="saveCampFieldSettings('${campId}')"><i class="ph ph-floppy-disk"></i> Kaydet</button>
</div>
</div>`;
modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
document.body.appendChild(modal);
renderFsFieldList();
updateFsPreview();
}

function renderFsFieldList() {
const el = document.getElementById('fs-field-list');
if (!el) return;
el.innerHTML = _fsFields.map((f,i)=>{
const needsOpts = ['select','multiselect','checkbox'].includes(f.type);
const optHtml = needsOpts ? `
<div style="margin-top:4px;padding:4px 6px;background:var(--bg-3);border-radius:4px;">
<div style="font-size:9px;color:var(--text-3);margin-bottom:3px;">Seçenekler (virgülle ayır):</div>
<input class="form-input" style="font-size:10px;padding:2px 5px;width:100%;"
placeholder="Seçenek 1, Seçenek 2"
value="${(f.options||[]).join(', ')}"
oninput="_fsFields[${i}].options=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
</div>` : '';
const move = f.key === 'attempt' ? '' : `<span style="display:flex;flex-direction:column;flex-shrink:0;">
<button type="button" title="${campEsc(campT('camp.fields.up','Yukarı'))}" onclick="moveFsField(${i},-1)" style="border:0;background:transparent;color:var(--text-2);cursor:pointer;line-height:1;padding:0 2px;">↑</button>
<button type="button" title="${campEsc(campT('camp.fields.down','Aşağı'))}" onclick="moveFsField(${i},1)" style="border:0;background:transparent;color:var(--text-2);cursor:pointer;line-height:1;padding:0 2px;">↓</button>
</span>`;
return `<div style="padding:6px 8px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;">
<div style="display:flex;align-items:center;gap:6px;">
${move}
<input type="checkbox" ${f.show?'checked':''} ${f.locked?'disabled':''}
onchange="_fsFields[${i}].show=this.checked;updateFsPreview()">
<input class="form-input" value="${typeof ncLabelShown==='function'?ncLabelShown(f.label||''):(f.label||'')}" style="flex:1;font-size:12px;padding:3px 7px;min-width:0;"
oninput="_fsFields[${i}].label=ncLabelCanonical(this.value);updateFsPreview()" placeholder="Alan adı">
<select class="form-input" style="width:118px;flex-shrink:0;font-size:11px;padding:3px;"
onchange="_fsFields[${i}].type=this.value;renderFsFieldList();updateFsPreview()">
<option value="text" ${f.type==='text'?'selected':''} data-tr="Metin" data-de="Text">Metin</option>
<option value="number" ${f.type==='number'?'selected':''} data-tr="Sayı" data-de="Zahl">Sayı</option>
<option value="date" ${f.type==='date'?'selected':''} data-tr="Tarih" data-de="Datum">Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''} data-tr="Evet/Hayır" data-de="Ja/Nein">Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''} data-tr="Açılır Menü" data-de="Auswahl">Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''} data-tr="Çoktan Seçmeli" data-de="Mehrfachauswahl">Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''} data-tr="Onay kutusu" data-de="Kontrollkästchen">Onay kutusu</option>
</select>
${f.locked?`<span style="flex-shrink:0;white-space:nowrap;font-size:10px;color:var(--text-3);">${typeof currentLang!=='undefined'&&currentLang==='de'?'Gesperrt':'Kilitli'}</span>`:''}
</div>${optHtml}
</div>`;
}).join('');
if (typeof currentLang !== 'undefined' && currentLang === 'de') {
  el.querySelectorAll('[data-de]').forEach((opt) => { opt.textContent = opt.getAttribute('data-de'); });
}
}

function updateFsPreview() {
  mbPaintDialerPreview(document.getElementById('fs-preview'));
}

async function saveCampFieldSettings(campId) {
const fc = {};
_fsFields.forEach((f, i) => {
fc[f.key || f.defaultKey] = {
show:  f.show,
label: f.label,
type:  f.type,
options: Array.isArray(f.options) ? f.options : [],
order: i,
};
});
try {
await sb(`campaigns?id=eq.${campId}`, {
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({ field_config: fc })
});
document.getElementById('m-field-settings')?.remove();
toast(campT('camp.fields.saved','Alan ayarları kaydedildi'),'ok');
loadCampaigns();
} catch(e) { toast('Hata: '+e.message,'err'); }
}

// ── Kampanya Detay Sekmeleri ──────────────────
function switchCampTab(tab) {
document.querySelectorAll('.cd-tab').forEach(b => {
const isActive = b.dataset.tab === tab;
b.classList.toggle('active', isActive);
b.style.color = isActive ? 'var(--accent)' : 'var(--text-2)';
b.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
});
document.querySelectorAll('.cd-tab-panel').forEach(p => p.style.display = 'none');
const panel = document.getElementById('cd-tab-' + tab);
if (panel) panel.style.display = '';
if (tab === 'alanlar' && currentCampId) loadCampFieldsTab();
if (tab === 'qc' && currentCampId) loadCampQcTab();
if (tab === 'script' && currentCampId) loadCampScriptTab();
if (tab === 'arama' && currentCampId) loadCampAramaTab();
if (tab === 'bildirim' && currentCampId) loadCampBildirimTab();
if (tab === 'termin-form' && currentCampId) loadCampTerminFormTab();
if (tab === 'kurallar' && currentCampId) loadCampRulesTab();
}

const TERMIN_FORM_DEFAULTS = [
  {key:'hausart',label:'Ev Tipi',type:'select',opts:'Einfamilienhaus,Zweifamilienhaus,Reihenhaus,Doppelhaus,Mehrfamilienhaus',enabled:true,required:true,placeholder:'',min:'',max:''},
  {key:'baujahr',label:'Yapım Yılı',type:'text',opts:'',enabled:true,required:true,placeholder:'1998',min:'',max:''},
  {key:'qm',label:'m²',type:'number',opts:'',enabled:true,required:true,placeholder:'140',min:'',max:''},
  {key:'heizung',label:'Isıtma',type:'select',opts:'Gas,Öl,Pellet,WP,Fernwärme',enabled:true,required:true,placeholder:'',min:'',max:''},
  {key:'alter_der_heizung',label:'Isıtma Yaşı',type:'text',opts:'',enabled:true,required:true,placeholder:'15',min:'',max:''},
  {key:'verbrauch_pro_jahr',label:'Tüketim/Yıl',type:'text',opts:'',enabled:true,required:false,placeholder:'18000',min:'',max:''},
  {key:'personen',label:'Kişi Sayısı',type:'number',opts:'',enabled:true,required:false,placeholder:'4',min:'',max:''},
  {key:'interesse_an_pv',label:'PV İlgisi',type:'boolean',opts:'',enabled:false,required:false,placeholder:'',min:'',max:''},
];
let _terminFormDraft = [];

function terminFormListFromSaved(tf) {
  const saved = tf && typeof tf === 'object' ? tf : {};
  if (Array.isArray(saved.fields) && saved.fields.length) {
    return saved.fields.map((f) => ({
      key: String(f.key || ''),
      label: f.label || f.key || 'Soru',
      type: f.type || 'text',
      opts: f.opts || '',
      enabled: f.enabled !== false,
      required: !!f.required,
      placeholder: f.placeholder || '',
      min: f.min == null ? '' : String(f.min),
      max: f.max == null ? '' : String(f.max),
    })).filter((f) => f.key);
  }
  return TERMIN_FORM_DEFAULTS.map((f) => ({
    ...f,
    enabled: saved[f.key]?.enabled ?? f.enabled,
    required: saved[f.key]?.required ?? f.required,
    label: saved[f.key]?.label || f.label,
    type: saved[f.key]?.type || f.type,
    opts: saved[f.key]?.opts || f.opts || '',
    placeholder: saved[f.key]?.placeholder ?? f.placeholder ?? '',
    min: saved[f.key]?.min ?? f.min ?? '',
    max: saved[f.key]?.max ?? f.max ?? '',
  }));
}

function readTerminFormDraftFromDom() {
  return _terminFormDraft.map((f, i) => ({
    ...f,
    enabled: document.getElementById(`tf-en-${i}`)?.checked ?? f.enabled,
    label: document.getElementById(`tf-lbl-${i}`)?.value || f.label,
    type: document.getElementById(`tf-type-${i}`)?.value || f.type,
    required: document.getElementById(`tf-req-${i}`)?.checked ?? f.required,
    opts: document.getElementById(`tf-opts-${i}`)?.value ?? f.opts ?? '',
    placeholder: document.getElementById(`tf-ph-${i}`)?.value ?? f.placeholder ?? '',
    min: document.getElementById(`tf-min-${i}`)?.value ?? f.min ?? '',
    max: document.getElementById(`tf-max-${i}`)?.value ?? f.max ?? '',
  }));
}

function renderTerminFormDraft() {
  const el = document.getElementById('cd-termin-form-fields');
  if (!el) return;
  const last = _terminFormDraft.length - 1;
  el.innerHTML = _terminFormDraft.map((f, i) => `
<div style="padding:7px 10px;background:var(--bg-3);border-radius:6px;" data-key="${campEsc(f.key)}">
<div style="display:flex;align-items:center;gap:8px;">
<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;" ${i === 0 ? 'disabled' : ''} onclick="moveCampTerminField(${i},-1)" aria-label="Yukarı">↑</button>
<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;" ${i === last ? 'disabled' : ''} onclick="moveCampTerminField(${i},1)" aria-label="Aşağı">↓</button>
<input type="checkbox" id="tf-en-${i}" ${f.enabled ? 'checked' : ''} style="width:15px;height:15px;" title="Sor">
<input class="form-input" id="tf-lbl-${i}" value="${campEsc(f.label)}" style="flex:1;font-size:12px;padding:3px 7px;">
<select class="form-input" id="tf-type-${i}" style="width:110px;font-size:11px;padding:3px;" onchange="rememberTerminFormDraft();_terminFormDraft[${i}].type=this.value;renderTerminFormDraft()">
<option value="text" ${f.type === 'text' ? 'selected' : ''}>${campEsc(campT('camp.tf.text','Metin'))}</option>
<option value="number" ${f.type === 'number' ? 'selected' : ''}>${campEsc(campT('camp.tf.number','Sayı'))}</option>
<option value="select" ${f.type === 'select' ? 'selected' : ''}>${campEsc(campT('camp.tf.select','Açılır menü'))}</option>
<option value="boolean" ${f.type === 'boolean' ? 'selected' : ''}>${campEsc(campT('camp.tf.bool','Evet/Hayır'))}</option>
</select>
<label style="font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;"><input type="checkbox" id="tf-req-${i}" ${f.required ? 'checked' : ''}>${campEsc(campT('camp.tf.required','Zorunlu'))}</label>
${String(f.key).startsWith('custom_') ? `<button type="button" onclick="removeCampTerminField(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button>` : ''}
</div>
${f.type === 'boolean' ? '' : `<div style="padding:6px 0 0 68px;display:flex;flex-direction:column;gap:4px;">
<input class="form-input" id="tf-ph-${i}" value="${campEsc(f.placeholder || '')}" placeholder="${campEsc(campT('camp.tf.ph','Yer tutucu'))}" style="font-size:11px;padding:3px 7px;">
${f.type === 'number' ? `<div style="display:flex;gap:6px;">
<input class="form-input" id="tf-min-${i}" value="${campEsc(f.min ?? '')}" placeholder="${campEsc(campT('camp.tf.min','Alt'))}" inputmode="decimal" style="font-size:11px;padding:3px 7px;width:90px;">
<input class="form-input" id="tf-max-${i}" value="${campEsc(f.max ?? '')}" placeholder="${campEsc(campT('camp.tf.max','Üst'))}" inputmode="decimal" style="font-size:11px;padding:3px 7px;width:90px;">
</div>` : ''}
${f.type === 'select' ? `<input class="form-input" id="tf-opts-${i}" style="font-size:10px;padding:2px 6px;width:100%;" value="${campEsc(f.opts || '')}" placeholder="Seçenek 1, Seçenek 2">` : ''}
</div>`}
</div>`).join('');
}

function rememberTerminFormDraft() {
  _terminFormDraft = readTerminFormDraftFromDom();
}

function loadCampTerminFormTab() {
  const camp = campaigns.find((c) => c.id === currentCampId);
  let tf = {};
  try {
    const fromSettings = getCampSettings(camp).termin_form;
    const legacy = camp?.termin_form_config;
    tf = fromSettings && typeof fromSettings === 'object' ? fromSettings : (typeof legacy === 'string' ? JSON.parse(legacy) : (legacy || {}));
  } catch (e) {}
  _terminFormDraft = terminFormListFromSaved(tf);
  renderTerminFormDraft();
}

function moveCampTerminField(index, dir) {
  rememberTerminFormDraft();
  const next = index + dir;
  if (next < 0 || next >= _terminFormDraft.length) return;
  const [row] = _terminFormDraft.splice(index, 1);
  _terminFormDraft.splice(next, 0, row);
  renderTerminFormDraft();
}

function addCampTerminField() {
  rememberTerminFormDraft();
  _terminFormDraft.push({
    key: `custom_${Date.now()}`,
    label: 'Yeni soru',
    type: 'text',
    opts: '',
    enabled: true,
    required: false,
    placeholder: '',
    min: '',
    max: '',
  });
  renderTerminFormDraft();
}

function removeCampTerminField(index) {
  rememberTerminFormDraft();
  _terminFormDraft.splice(index, 1);
  renderTerminFormDraft();
}

async function saveCampTerminFormSettings() {
  rememberTerminFormDraft();
  const fields = _terminFormDraft.filter((f) => f.key && f.label);
  const cfg = { fields };
  fields.forEach((f) => {
    cfg[f.key] = {
      enabled: f.enabled !== false,
      label: f.label,
      type: f.type || 'text',
      required: !!f.required,
      opts: f.opts || '',
      placeholder: String(f.placeholder || '').trim(),
      min: String(f.min ?? '').trim(),
      max: String(f.max ?? '').trim(),
    };
  });
  try {
    await saveCampSettingsPatch({ termin_form: cfg });
    toast(campT('camp.tf.saved','Randevu formu kaydedildi'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function loadCampRulesTab() {
  const camp = campaigns.find((c) => c.id === currentCampId);
  const el = document.getElementById('cd-rules');
  if (el) el.value = String(getCampSettings(camp).rules || '');
}

async function saveCampRules() {
  const rules = String(document.getElementById('cd-rules')?.value || '').trim();
  try {
    await saveCampSettingsPatch({ rules });
    toast('Kurallar kaydedildi', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function openCampRules(campId) {
  const camp = (campaigns || []).find((c) => String(c.id) === String(campId));
  const rules = String((typeof getCampSettings === 'function' ? getCampSettings(camp) : camp?.settings)?.rules || '').trim();
  if (!rules) return;
  const title = document.getElementById('camp-rules-title');
  const body = document.getElementById('camp-rules-body');
  if (title) title.textContent = camp?.name ? `${camp.name} — Kurallar` : 'Kampanya kuralları';
  if (body) body.textContent = rules;
  if (typeof openModal === 'function') openModal('m-camp-rules');
}

function loadCampFieldsTab() {
const container = document.getElementById('cd-field-settings-container');
if (!container) return;
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
_fsCampId = currentCampId;
const fc = mbParseFieldConfig(camp);
_fsFields = mbMergeCampFields(fc);
container.innerHTML = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
<div>
<div style="font-size:12px;font-weight:700;margin-bottom:4px;">${campEsc(campT('camp.fields.list','Alan listesi'))}</div>
<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${campEsc(campT('camp.fields.order','İlk iki alan üstte durur. Oklarla yer değiştir. Altındakiler kutu olur.'))}</div>
<div id="cd-fs-field-list" style="display:flex;flex-direction:column;gap:4px;"></div>
<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="addFsField()">+ ${campEsc(campT('camp.fields.add','Özel alan ekle'))}</button>
<button class="btn btn-primary btn-sm" style="margin-top:8px;margin-left:4px;" onclick="saveCampFieldSettings('${currentCampId}')"><i class="ph ph-floppy-disk"></i> ${campEsc(campT('camp.fields.save','Kaydet'))}</button>
</div>
<div>
<div style="font-size:12px;font-weight:700;margin-bottom:8px;text-align:center;color:var(--text-3);">${campEsc(campT('camp.fields.preview','Önizleme'))}</div>
<div id="cd-fs-preview" style="background:var(--bg-3);border-radius:8px;padding:10px;"></div>
</div>
</div>`;
renderCdFsFieldList();
updateCdFsPreview();
}

function renderCdFsFieldList() {
const el = document.getElementById('cd-fs-field-list');
if (!el) return;
el.innerHTML = _fsFields.map((f,i)=>{
const needsOpts = ['select','multiselect','checkbox'].includes(f.type);
const optHtml = needsOpts ? `
<div style="margin-top:4px;padding:4px 6px;background:var(--bg-3);border-radius:4px;">
<div style="font-size:9px;color:var(--text-3);margin-bottom:3px;">Seçenekler (virgülle ayır):</div>
<input class="form-input" style="font-size:10px;padding:2px 5px;width:100%;"
placeholder="Seçenek 1,Seçenek 2,Seçenek 3"
value="${(f.options||[]).join(',')}"
oninput="_fsFields[${i}].options=this.value.split(',').map(s=>s.trim()).filter(Boolean)">
</div>` : '';
const move = f.key === 'attempt' ? '' : `<span style="display:flex;flex-direction:column;flex-shrink:0;">
<button type="button" title="${campEsc(campT('camp.fields.up','Yukarı'))}" onclick="moveFsField(${i},-1)" style="border:0;background:transparent;color:var(--text-2);cursor:pointer;line-height:1;padding:0 2px;">↑</button>
<button type="button" title="${campEsc(campT('camp.fields.down','Aşağı'))}" onclick="moveFsField(${i},1)" style="border:0;background:transparent;color:var(--text-2);cursor:pointer;line-height:1;padding:0 2px;">↓</button>
</span>`;
return `<div style="padding:5px 7px;background:var(--bg-2);border:1px solid var(--border);border-radius:5px;">
<div style="display:flex;align-items:center;gap:5px;">
${move}
<input type="checkbox" ${f.show?'checked':''} ${f.locked?'disabled':''}
onchange="_fsFields[${i}].show=this.checked;updateCdFsPreview()">
<input class="form-input" value="${typeof ncLabelShown==='function'?ncLabelShown(f.label||''):(f.label||'')}" style="flex:1;font-size:11px;padding:2px 6px;min-width:0;"
oninput="_fsFields[${i}].label=ncLabelCanonical(this.value);updateCdFsPreview()">
<select class="form-input" style="width:118px;flex-shrink:0;font-size:10px;padding:2px;"
onchange="_fsFields[${i}].type=this.value;renderCdFsFieldList();updateCdFsPreview()">
<option value="text" ${f.type==='text'?'selected':''} data-tr="Metin" data-de="Text">Metin</option>
<option value="number" ${f.type==='number'?'selected':''} data-tr="Sayı" data-de="Zahl">Sayı</option>
<option value="date" ${f.type==='date'?'selected':''} data-tr="Tarih" data-de="Datum">Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''} data-tr="Evet/Hayır" data-de="Ja/Nein">Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''} data-tr="Açılır Menü" data-de="Auswahl">Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''} data-tr="Çoktan Seçmeli" data-de="Mehrfachauswahl">Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''} data-tr="Onay kutusu" data-de="Kontrollkästchen">Onay kutusu</option>
</select>
${f.locked?`<span style="flex-shrink:0;white-space:nowrap;font-size:10px;color:var(--text-3);">${typeof currentLang!=='undefined'&&currentLang==='de'?'Gesperrt':'Kilitli'}</span>`:`<button onclick="_fsFields.splice(${i},1);renderCdFsFieldList();updateCdFsPreview()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;flex-shrink:0;">✕</button>`}
</div>${optHtml}
</div>`;
}).join('');
if (typeof currentLang !== 'undefined' && currentLang === 'de') {
  el.querySelectorAll('[data-de]').forEach((opt) => { opt.textContent = opt.getAttribute('data-de'); });
}
}

function addFsField() {
  const row = { key: 'custom_' + Date.now(), label: 'Yeni Alan', type: 'text', show: true, locked: false };
  const at = (_fsFields || []).findIndex((f) => f.key === 'attempt');
  if (at >= 0) _fsFields.splice(at, 0, row);
  else (_fsFields || []).push(row);
  if (document.getElementById('fs-field-list')) { renderFsFieldList(); updateFsPreview(); }
  if (document.getElementById('cd-fs-field-list')) { renderCdFsFieldList(); updateCdFsPreview(); }
}

function updateCdFsPreview() {
  mbPaintDialerPreview(document.getElementById('cd-fs-preview'));
}

function loadCampScriptTab() {
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
const settings = getCampSettings(camp);
const el = document.getElementById('cd-script');
const cb = document.getElementById('cd-script-enabled');
if (el) el.value = settings.script || '';
if (cb) cb.checked = settings.script_enabled || false;
}

async function saveCampScript() {
const script = document.getElementById('cd-script')?.value || '';
const enabled = document.getElementById('cd-script-enabled')?.checked || false;
await saveCampSettingsPatch({script, script_enabled: enabled});
toast(campT('camp.script.saved','Konuşma metni kaydedildi'), 'ok');
}

function renderRecycleControls(s) {
  const host = document.getElementById('cd-recycle-statuses');
  const maxEl = document.getElementById('cd-recycle-max');
  const selected = new Set(Array.isArray(s?.recycle_statuses)
    ? s.recycle_statuses
    : (s?.recycle ? ['no_answer'] : []));
  if (host) {
    host.innerHTML = RECYCLE_STATUS_KEYS.map((key) => `
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
<input type="checkbox" id="cd-recycle-st-${key}" ${selected.has(key) ? 'checked' : ''} style="width:16px;height:16px;">
<span>${campEsc(campT('camp.st.' + key, key))}</span>
</label>`).join('');
  }
  if (maxEl) {
    const current = Math.max(1, Math.min(5, parseInt(s?.recycle_max, 10) || 2));
    maxEl.innerHTML = [1, 2, 3, 4, 5].map((n) => {
      const label = campT('camp.arama.recycle.times', '{n} kez').replace('{n}', String(n));
      return `<option value="${n}" ${n === current ? 'selected' : ''}>${campEsc(label)}</option>`;
    }).join('');
  }
}

function loadCampAramaTab() {
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
const s = getCampSettings(camp);
setCheck('cd-auto-dial', s.auto_dial !== false);
setCheck('cd-agent-edit', s.agent_edit || false);
setCheck('cd-appointment-slot-required', s.appointment_slot_required || false);
setCheck('cd-recycle', s.recycle || false);
setCheck('cd-cooldown', s.cooldown || false);
setCheck('cd-precall-test', s.precall_test || false);
setVal('cd-recycle-delay', s.recycle_delay || 60);
setVal('cd-cooldown-min', s.cooldown_min || 30);
renderRecycleControls(s);
}

async function saveCampAramaSettings() {
const ticks = RECYCLE_STATUS_KEYS.filter((key) => getCheck('cd-recycle-st-' + key));
const master = getCheck('cd-recycle');
if (master && !ticks.length) {
  toast(campT('camp.arama.recycle.need','Yeniden arama açıkken en az bir sonuç seçin'), 'err');
  return;
}
const camp = campaigns.find((c) => c.id === currentCampId);
const prev = camp ? getCampSettings(camp) : {};
const configured = !!prev.recycle_configured || master;
const s = {
auto_dial: getCheck('cd-auto-dial'),
agent_edit: getCheck('cd-agent-edit'),
appointment_slot_required: getCheck('cd-appointment-slot-required'),
recycle: master,
recycle_delay: parseInt(getVal('cd-recycle-delay')||'60'),
recycle_max: Math.max(1, Math.min(5, parseInt(getVal('cd-recycle-max') || '2', 10) || 2)),
recycle_statuses: ticks,
cooldown: getCheck('cd-cooldown'),
cooldown_min: parseInt(getVal('cd-cooldown-min')||'30'),
precall_test: getCheck('cd-precall-test'),
};
if (configured) s.recycle_configured = true;
await saveCampSettingsPatch(s);
toast(campT('camp.arama.saved','Arama ayarları kaydedildi'), 'ok');
}

function loadCampQcTab() {
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
const s = getCampSettings(camp);
setCheck('cd-acw-enabled', s.acw_enabled || false);
setVal('cd-acw-seconds', s.acw_seconds || 60);
setVal('cd-acw-action', s.acw_action || 'warn');
renderAuxCodes(s.aux_codes || DEFAULT_AUX_CODES);
renderOutcomes(s.outcomes || DEFAULT_OUTCOMES);
}

function renderAuxCodes(codes) {
const el = document.getElementById('cd-aux-codes');
if (!el) return;
el.innerHTML = codes.map((code,i)=>`
<div style="display:flex;align-items:center;gap:6px;">
<input class="form-input" value="${code}" id="aux-code-${i}" style="flex:1;font-size:12px;padding:4px 8px;">
<button onclick="removeAuxCode(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button>
</div>`).join('');
}

function addAuxCode() {
const el = document.getElementById('cd-aux-codes');
if (!el) return;
const idx = el.children.length;
const div = document.createElement('div');
div.style.cssText='display:flex;align-items:center;gap:6px;';
div.innerHTML=`<input class="form-input" value="Yeni Kod" id="aux-code-${idx}" style="flex:1;font-size:12px;padding:4px 8px;"><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer;">✕</button>`;
el.appendChild(div);
}

function removeAuxCode(i) {
const el = document.getElementById(`aux-code-${i}`);
el?.parentElement?.remove();
}

const OUTCOME_I18N = {
  appointment: { tr: 'Randevu', de: 'Termin' },
  negative: { tr: 'Olumsuz', de: 'Negativ' },
  callback: { tr: 'Geri Ara', de: 'Rückruf' },
  no_answer: { tr: 'Cevap Yok', de: 'Keine Antwort' },
  dnc: { tr: 'Kara Liste', de: 'Sperrliste' },
  voicemail: { tr: 'Telesekreter', de: 'Anrufbeantworter' },
};

function outcomeDisplayLabel(o) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const pack = OUTCOME_I18N[o?.key];
  const raw = String(o?.label || '').trim();
  if (!pack) return raw;
  if (!raw || raw === o.key || raw === pack.tr || raw === pack.de) return de ? pack.de : pack.tr;
  return raw;
}

function renderOutcomes(outcomes) {
const el = document.getElementById('cd-outcomes');
if (!el) return;
const cats = ['appointment','negative','callback','neutral'];
const catLabels = {appointment:'Başarılı', negative:'Negatif', callback:'Geri Ara', neutral:'Nötr'};
const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
el.innerHTML = outcomes.map((o,i)=>`
<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg-2);border-radius:5px;">
<input type="checkbox" ${o.enabled?'checked':''} id="outcome-enabled-${i}">
<input class="form-input" value="${esc(outcomeDisplayLabel(o))}" id="outcome-label-${i}" style="flex:1;font-size:12px;padding:3px 7px;">
${o.key && ['appointment','negative','callback','no_answer','dnc','voicemail'].includes(o.key)
? ''
: `<select class="form-input" id="outcome-cat-${i}" style="font-size:11px;padding:2px 4px;width:110px;">
${cats.map(c=>`<option value="${c}" ${(o.category||'neutral')===c?'selected':''}>${catLabels[c]}</option>`).join('')}
</select>`
}
${o.key && ['appointment','negative','callback','no_answer','dnc','voicemail'].includes(o.key)
? ''
: `<button onclick="removeCustomOutcome(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button>`
}
</div>`).join('') +
`<button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="addCustomOutcome()">+ Sonuç Ekle</button>`;
}

function addCustomOutcome() {
const el = document.getElementById('cd-outcomes');
if (!el) return;
const idx = el.querySelectorAll('[id^="outcome-enabled-"]').length;
const div = document.createElement('div');
div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg-2);border-radius:5px;';
div.innerHTML = `
<input type="checkbox" checked id="outcome-enabled-${idx}">
<input class="form-input" value="Yeni Sonuç" id="outcome-label-${idx}" style="flex:1;font-size:12px;padding:3px 7px;">
<select class="form-input" id="outcome-cat-${idx}" style="font-size:11px;padding:2px 4px;width:110px;">
<option value="appointment">Başarılı</option>
<option value="negative">Negatif</option>
<option value="callback">Geri Ara</option>
<option value="neutral" selected>Nötr</option>
</select>
<button onclick="this.closest('div').remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button>`;
el.insertBefore(div, el.lastElementChild);
}

function removeCustomOutcome(i) {
document.getElementById('outcome-enabled-'+i)?.closest('div')?.remove();
}

async function saveCampQcSettings() {
const auxRaw = [...document.querySelectorAll('[id^="aux-code-"]')].map(el => String(el.value || '').trim());
if (!auxRaw.length || auxRaw.some((v) => !v)) {
  toast(campT('camp.aux.empty','Boş mola kodu kaydedilemez'), 'err');
  return;
}
const auxSeen = new Set();
for (const code of auxRaw) {
  const key = code.toLocaleLowerCase('tr-TR');
  if (auxSeen.has(key)) {
    toast(campT('camp.aux.dup','Aynı mola kodu iki kez yazılamaz'), 'err');
    return;
  }
  auxSeen.add(key);
}
const auxCodes = auxRaw;
const outcomeCodes = [...document.querySelectorAll('[id^="outcome-enabled-"]')].map((cb,i)=>({
key: DEFAULT_OUTCOMES[i]?.key || 'custom',
label: document.getElementById(`outcome-label-${i}`)?.value || '',
enabled: cb.checked,
color: DEFAULT_OUTCOMES[i]?.color || 'gray'
}));
const s = {
acw_enabled: getCheck('cd-acw-enabled'),
acw_seconds: parseInt(getVal('cd-acw-seconds')||'60'),
acw_action: getVal('cd-acw-action') || 'warn',
aux_codes: auxCodes,
outcomes: outcomeCodes,
};
await saveCampSettingsPatch(s);
toast(campT('camp.qc.saved','QC ayarları kaydedildi'), 'ok');
}

function loadCampBildirimTab() {
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
const s = getCampSettings(camp);
setCheck('cd-notif-whatsapp', s.notif_whatsapp || false);
setCheck('cd-notif-sms', s.notif_sms || false);
setCheck('cd-notif-email', s.notif_email || false);
setCheck('cd-notif-auto', s.notif_auto || false);
setCheck('cd-ticker-enabled', s.ticker_enabled || false);
setVal('cd-ticker-text', s.ticker_text || '');
setVal('cd-webhook-url', s.webhook_url || '');
}

async function saveCampNotifSettings() {
const s = {
notif_whatsapp: getCheck('cd-notif-whatsapp'),
notif_sms: getCheck('cd-notif-sms'),
notif_email: getCheck('cd-notif-email'),
notif_auto: getCheck('cd-notif-auto'),
};
await saveCampSettingsPatch(s);
toast(campT('camp.notif.saved','Bildirim ayarları kaydedildi'), 'ok');
}

async function saveCampWebhook() {
const url = getVal('cd-webhook-url');
await saveCampSettingsPatch({webhook_url: url});
toast(campT('camp.notif.hook.saved','Webhook kaydedildi'), 'ok');
}

async function saveBroadcastTicker() {
const text = getVal('cd-ticker-text');
const enabled = getCheck('cd-ticker-enabled');
await saveCampSettingsPatch({ticker_enabled: enabled, ticker_text: text});
await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',prefer:'return=minimal',
body:JSON.stringify({notif_ts:Date.now(), notif_message:text, active_for_agents:true})});
toast(campT('camp.notif.published','Kayan yazı yayınlandı'), 'ok');
}

async function activateCampaignForAgents() {
const msg = await mbPrompt('Agentlere gönderilecek mesaj (opsiyonel):','', 'Kampanya Mesajı');
await setActiveCampaign(currentCampId, msg||'');
}

function getCampSettings(camp) {
try {
const s = camp.settings;
if (!s) return {};
return typeof s === 'string' ? JSON.parse(s) : s;
} catch(e) { return {}; }
}

async function saveCampSettingsPatch(newSettings) {
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
const existing = getCampSettings(camp);
const merged = {...existing, ...newSettings};
await sb(`campaigns?id=eq.${currentCampId}`,{
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({settings: merged})
});
camp.settings = merged;
}

function setCheck(id, val) { const el=document.getElementById(id); if(el) el.checked=!!val; }
function getCheck(id) { return document.getElementById(id)?.checked||false; }
function setVal(id, val) { const el=document.getElementById(id); if(el) el.value=val; }
function getVal(id) { return document.getElementById(id)?.value||''; }

async function setActiveCampaign(campId,msg='') {
if(!campId)return;
await sb(`campaigns?id=eq.${campId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({active_for_agents:true,notif_ts:Date.now(),notif_message:msg})});
toast('Kampanya aktifleştirildi ✓','ok');
}

let _tickerInterval2 = null;
function startTickerPoll() {
if (_tickerInterval) clearInterval(_tickerInterval);
_tickerInterval = setInterval(checkBroadcastTicker, 30000);
checkBroadcastTicker();
}

async function checkBroadcastTicker() {
if (!selectedCampId) return;
try {
const camps = await sb(`campaigns?id=eq.${selectedCampId}&select=settings,notif_ts,notif_message,active_for_agents`);
const camp = camps?.[0];
if (!camp) return;
const s = getCampSettings(camp);
const ticker = document.getElementById('broadcast-ticker');
if (ticker) {
if (s.ticker_enabled && s.ticker_text) {
ticker.style.display = '';
document.getElementById('ticker-text').textContent = s.ticker_text;
} else {
ticker.style.display = 'none';
}
}
} catch(e) {}
}

async function mbHeadCountExact(path) {
  try {
    const scoped = typeof _mbScopedUserForRequest === 'function' ? _mbScopedUserForRequest(path, 'GET') : null;
    const headers = typeof mbAuthHeaders === 'function' ? mbAuthHeaders({ Prefer: 'count=exact', Range: '0-0' }) : {};
    if (scoped && typeof _mbRequestScopeHeaders === 'function') Object.assign(headers, _mbRequestScopeHeaders(scoped));
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'GET', headers });
    if (!r.ok) return null;
    try { await r.json(); } catch (_) {}
    const n = Number((r.headers.get('content-range') || '').split('/')[1]);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

async function reconcileQueueTotals(list) {
  const jobs = [];
  (list || []).forEach((camp) => {
    (camp.queues || []).forEach((queue) => {
      if (!queue?.id) return;
      jobs.push((async () => {
        const total = await mbHeadCountExact(`contacts?queue_id=eq.${queue.id}&select=id`);
        if (total == null || total === Number(queue.total_contacts || 0)) return;
        queue.total_contacts = total;
        (campaigns || []).forEach((c) => {
          (c.queues || []).forEach((q) => { if (q.id === queue.id) q.total_contacts = total; });
        });
        await sb(`queues?id=eq.${queue.id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify({ total_contacts: total }),
        }).catch(() => {});
      })());
    });
  });
  if (jobs.length) await Promise.all(jobs);
}

async function mbHeadCount(path) {
  try {
    const scoped = typeof _mbScopedUserForRequest === 'function' ? _mbScopedUserForRequest(path, 'GET') : null;
    const headers = typeof mbAuthHeaders === 'function' ? mbAuthHeaders({ Prefer: 'count=exact', Range: '0-0' }) : {};
    if (scoped && typeof _mbRequestScopeHeaders === 'function') Object.assign(headers, _mbRequestScopeHeaders(scoped));
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'GET', headers });
    if (r.ok) {
      try { await r.json(); } catch (_) {}
      const cr = r.headers.get('content-range') || '';
      if (cr.includes('/')) {
        const n = Number(cr.split('/')[1]);
        if (Number.isFinite(n)) return n;
      }
    }
  } catch (_) {}
  const rows = await sb(`${path}&limit=2000`);
  return Array.isArray(rows) ? rows.length : 0;
}

async function saveQueueSettings(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const name = String(document.getElementById('rq-name')?.value || '').trim();
  if (!name) {
    toast(campT('camp.queue.name.required','Kuyruk adı gerekli'), 'err');
    return;
  }
  if (queueNameTaken(found.camp, queueId, name)) {
    toast(campT('camp.queue.name.dup','Bu kampanyada aynı kuyruk adı var'), 'err');
    return;
  }
  const rawPri = Number.parseInt(document.getElementById('rq-priority')?.value, 10);
  const priority = Number.isFinite(rawPri) ? Math.max(-100, Math.min(100, rawPri)) : 0;
  const maxAttempts = Math.max(0, Math.min(50, parseInt(document.getElementById('rq-max')?.value, 10) || 0));
  const notes = String(document.getElementById('rq-notes')?.value || '').slice(0, 500);
  const status = document.getElementById('rq-status')?.value === 'paused' ? 'paused' : 'active';
  try {
    await sb(`queues?id=eq.${queueId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ name, status })
    });
    const prev = getCampSettings(found.camp).queue_meta || {};
    currentCampId = found.camp.id;
    await saveCampSettingsPatch({ queue_meta: { ...prev, [queueId]: { priority, max_attempts: maxAttempts, notes } } });
    found.queue.name = name;
    found.queue.status = status;
    document.getElementById('m-requeue')?.remove();
    toast(campT('camp.queue.saved','Kuyruk ayarları kaydedildi'), 'ok');
    renderCampQueues(found.camp);
  } catch (e) {
    toast(e.message, 'err');
  }
}

const QUEUE_OPS_ROWS = [
  { key: 'pending', requeue: false, pull: true, label: 'camp.ops.pending', fb: 'Kuyrukta' },
  { key: 'removed', requeue: true, pull: false, label: 'camp.ops.removed', fb: 'Kuyruktan çıkan' },
  { key: 'calling', requeue: false, pull: false, label: 'camp.ops.calling', fb: 'Aranıyor' },
  { key: 'no_answer', requeue: true, pull: false, label: 'camp.st.no_answer', fb: 'Cevap yok' },
  { key: 'voicemail', requeue: true, pull: false, label: 'camp.st.voicemail', fb: 'Telesekreter' },
  { key: 'negative', requeue: true, pull: false, label: 'camp.st.negative', fb: 'Olumsuz' },
  { key: 'callback', requeue: true, pull: false, label: 'camp.st.callback', fb: 'Geri ara' },
  { key: 'appointment', requeue: false, pull: false, label: 'camp.ops.appointment', fb: 'Randevu' },
  { key: 'dnc', requeue: false, pull: false, label: 'camp.st.dnc', fb: 'Kara liste' },
];

function opsDatesOk() {
  const from = document.getElementById('ops-from')?.value || '';
  const to = document.getElementById('ops-to')?.value || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from > to) {
    toast(campT('camp.ops.bad_range','Başlangıç, bitişten sonra olamaz'), 'warn');
    return false;
  }
  return true;
}

function opsRangeQuery() {
  const from = document.getElementById('ops-from')?.value || '';
  const to = document.getElementById('ops-to')?.value || '';
  let q = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q += `&created_at=gte.${from}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q += `&created_at=lte.${to}T23:59:59`;
  return q;
}

function opsSliceCount(key) {
  const modal = document.getElementById('m-queue-ops');
  const row = modal?.querySelector(`tr[data-ops="${key}"]`);
  const n = Number(row?.getAttribute('data-count') || 0);
  const slider = document.getElementById(`ops-pct-${key}`);
  const raw = slider ? slider.value : '100';
  const pct = raw === '' ? 100 : Number(raw);
  const safe = Number.isFinite(pct) ? pct : 100;
  return Math.min(n, Math.max(0, Math.round(n * safe / 100)));
}

function opsPaintTake(key) {
  const el = document.getElementById(`ops-take-${key}`);
  if (el) el.textContent = String(opsSliceCount(key));
}

function opsCsvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function opsContactsCsv(rows) {
  const headers = ['phone', 'first_name', 'last_name', 'status', 'attempt_count', 'plz', 'city'];
  const lines = [headers.join(';')];
  (rows || []).forEach((r) => lines.push(headers.map((h) => opsCsvCell(r[h])).join(';')));
  return lines.join('\n');
}

async function openQueueOps(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  document.getElementById('m-queue-ops')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-queue-ops';
  modal.className = 'modal-overlay open';
  modal.dataset.queueId = queueId;
  modal.innerHTML = `
<div class="modal" style="max-width:760px;max-height:88vh;overflow:auto;">
<div class="modal-hdr">
<div class="modal-title">${campEsc(campT('camp.ops.title','İşlemler'))} — ${campEsc(found.queue.name || '')}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;">
<div class="qops-filters">
<label class="form-label">${campEsc(campT('camp.ops.from','Başlangıç'))}<input class="form-input" id="ops-from" type="date"></label>
<label class="form-label">${campEsc(campT('camp.ops.to','Bitiş'))}<input class="form-input" id="ops-to" type="date"></label>
<button type="button" class="btn btn-ghost btn-sm" onclick="refreshQueueOps()">${campEsc(campT('camp.ops.apply','Göster'))}</button>
<button type="button" class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="downloadOpsContacts('${queueId}','all')"><i class="ph ph-download-simple"></i> ${campEsc(campT('camp.ops.all','Toplu indirme'))}</button>
</div>
<table class="qops">
<thead><tr>
<th>${campEsc(campT('camp.ops.name','Adı'))}</th>
<th>${campEsc(campT('camp.ops.count','Adet'))}</th>
<th>${campEsc(campT('camp.ops.share','Yüzde'))}</th>
<th>${campEsc(campT('camp.ops.slice','Pay'))}</th>
<th>${campEsc(campT('camp.ops.take','Alınacak'))}</th>
<th></th>
</tr></thead>
<tbody id="qops-body"><tr><td colspan="6" style="color:var(--text-3);">…</td></tr></tbody>
</table>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${campEsc(campT('camp.ops.close','Kapat'))}</button>
</div>
</div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  await refreshQueueOps();
}

async function refreshQueueOps() {
  const modal = document.getElementById('m-queue-ops');
  const body = document.getElementById('qops-body');
  const queueId = modal?.dataset.queueId;
  if (!body || !queueId) return;
  if (!opsDatesOk()) return;
  const range = opsRangeQuery();
  const nums = await Promise.all(QUEUE_OPS_ROWS.map((row) => mbHeadCount(`contacts?queue_id=eq.${queueId}&status=eq.${row.key}&select=id${range}`)));
  const total = nums.reduce((s, n) => s + n, 0);
  body.innerHTML = QUEUE_OPS_ROWS.map((row, i) => {
    const n = nums[i];
    const share = total > 0 ? Math.round(n / total * 1000) / 10 : 0;
    const sliced = row.requeue || row.pull;
    const take = n;
    return `<tr data-ops="${row.key}" data-count="${n}" class="${row.key === 'pending' ? 'is-queue' : ''}">
<td>${campEsc(campT(row.label, row.fb))}</td>
<td style="font-family:var(--mono);font-weight:800;">${n}</td>
<td>${share}%</td>
<td>${sliced ? `<input type="range" id="ops-pct-${row.key}" min="0" max="100" value="100" oninput="opsPaintTake('${row.key}')">` : ''}</td>
<td id="ops-take-${row.key}">${sliced ? take : ''}</td>
<td style="white-space:nowrap;">
${row.pull ? `<button type="button" class="btn btn-ghost btn-xs" ${n ? '' : 'disabled'} title="${campEsc(campT('camp.ops.pull','Kuyruktan çıkar'))}" onclick="pullOpsSlice('${queueId}','${row.key}')"><i class="ph ph-arrow-square-out"></i></button>` : ''}
${row.requeue ? `<button type="button" class="btn btn-primary btn-xs" ${n ? '' : 'disabled'} title="${campEsc(campT('camp.queue.requeue.do','Kuyruğa al'))}" onclick="requeueOpsSlice('${queueId}','${row.key}')"><i class="ph ph-arrow-clockwise"></i></button>` : ''}
<button type="button" class="btn btn-ghost btn-xs" ${n ? '' : 'disabled'} title="${campEsc(campT('camp.ops.download','İndir'))}" onclick="downloadOpsContacts('${queueId}','${row.key}')"><i class="ph ph-download-simple"></i></button>
</td>
</tr>`;
  }).join('');
}

async function requeueOpsSlice(queueId, status) {
  const row = QUEUE_OPS_ROWS.find((r) => r.key === status);
  if (!row?.requeue) return;
  if (!opsDatesOk()) return;
  const n = opsSliceCount(status);
  if (!n) {
    toast(campT('camp.ops.zero','Alınacak kişi yok'), 'warn');
    return;
  }
  const ok = await mbConfirm(campT('camp.ops.confirm','{n} kişi yeniden kuyruğa alınsın').replace('{n}', String(n)), campT('camp.ops.title','İşlemler'));
  if (!ok) return;
  try {
    const rows = await sb(`contacts?queue_id=eq.${queueId}&status=eq.${status}${opsRangeQuery()}&select=id&order=created_at.asc&limit=${n}`);
    const ids = (rows || []).map((r) => r.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 60) {
      const chunk = ids.slice(i, i + 60);
      await sb(`contacts?id=in.(${chunk.join(',')})`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ status: 'pending', last_called_at: null }),
      });
    }
    await syncQueueDialed(queueId);
    toast(campT('camp.ops.done','{n} kişi kuyruğa alındı').replace('{n}', String(ids.length)), 'ok');
    await refreshQueueOps();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function pullOpsSlice(queueId, status) {
  const row = QUEUE_OPS_ROWS.find((r) => r.key === status);
  if (!row?.pull) return;
  if (!opsDatesOk()) return;
  const n = opsSliceCount(status);
  if (!n) {
    toast(campT('camp.ops.zero','Alınacak kişi yok'), 'warn');
    return;
  }
  const ok = await mbConfirm(campT('camp.ops.pull.confirm','{n} kişi kuyruktan çıkarılsın').replace('{n}', String(n)), campT('camp.ops.title','İşlemler'));
  if (!ok) return;
  try {
    const rows = await sb(`contacts?queue_id=eq.${queueId}&status=eq.${status}${opsRangeQuery()}&select=id&order=created_at.asc&limit=${n}`);
    const ids = (rows || []).map((r) => r.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 60) {
      const chunk = ids.slice(i, i + 60);
      await sb(`contacts?id=in.(${chunk.join(',')})`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ status: 'removed' }),
      });
    }
    await syncQueueDialed(queueId);
    toast(campT('camp.ops.pull.done','{n} kişi kuyruktan çıkarıldı').replace('{n}', String(ids.length)), 'ok');
    await refreshQueueOps();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function syncQueueDialed(queueId) {
  const dialed = await mbHeadCount(`contacts?queue_id=eq.${queueId}&status=not.in.(pending,calling,removed)&select=id`);
  await sb(`queues?id=eq.${queueId}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({ dialed_count: dialed }),
  }).catch(() => {});
  const found = findQueue(queueId);
  if (found) {
    found.queue.dialed_count = dialed;
    renderCampQueues(found.camp);
  }
  return dialed;
}

async function downloadOpsContacts(queueId, status) {
  if (!opsDatesOk()) return;
  const st = status && status !== 'all' ? `&status=eq.${status}` : '';
  const cap = 2000;
  try {
    const rows = await sb(`contacts?queue_id=eq.${queueId}${st}${opsRangeQuery()}&select=phone,first_name,last_name,status,attempt_count,plz,city&order=created_at.asc&limit=${cap}`);
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      toast(campT('camp.ops.zero','Alınacak kişi yok'), 'warn');
      return;
    }
    const csv = opsContactsCsv(list);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kuyruk-${status || 'all'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    if (list.length >= cap) toast(campT('camp.ops.cap','İlk {n} kayıt indirildi').replace('{n}', String(cap)), 'warn');
  } catch (e) {
    toast(e.message, 'err');
  }
}
