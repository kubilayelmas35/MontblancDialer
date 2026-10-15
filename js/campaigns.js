// ─────────────────────────────────────────────
// CAMPAIGNS — kampanya yönetimi
// ─────────────────────────────────────────────

function campT(key, fb) {
  return typeof t === 'function' ? t(key) : fb;
}

async function attachCampaignPeople() {
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  let users = [];
  let sessions = [];
  try {
    [users, sessions] = await Promise.all([
      sb(`users?select=id,name${ff}&limit=500`),
      sb(`agent_sessions?select=agent_id,agent_name,campaign_id,status${ff}&limit=500`),
    ]);
  } catch (e) {
    users = [];
    sessions = [];
  }
  const nameById = {};
  (users || []).forEach((u) => { if (u?.id && u.name) nameById[u.id] = u.name; });
  (campaigns || []).forEach((c) => {
    const people = new Map();
    (c.agent_campaigns || []).forEach((ac) => {
      const id = ac.agent_id;
      if (!id) return;
      people.set(id, { agent_id: id, name: nameById[id] || '', assigned: true, live: false });
    });
    (sessions || []).forEach((s) => {
      if (s.campaign_id !== c.id) return;
      const id = s.agent_id;
      if (!id) return;
      const prev = people.get(id) || { agent_id: id, name: '', assigned: false, live: false };
      if (s.status && s.status !== 'offline') prev.live = true;
      if (!prev.name) {
        const sessionName = String(s.agent_name || '');
        prev.name = nameById[id] || (/^[0-9a-f-]{8}-/i.test(sessionName) ? '' : sessionName);
      }
      people.set(id, prev);
    });
    c._people = [...people.values()];
  });
}

function campPersonLabel(person) {
  const name = String(person?.name || '').trim();
  if (name && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name)) return name;
  return campT('camp.agent.unnamed', 'Temsilci');
}

async function loadCampaigns() {
if (typeof mbEnsureSession === 'function') {
  const ok = await mbEnsureSession();
  if (!ok) return;
}
renderFirmSelector('camp-firm-selector', loadCampaigns);
try {
const ff = getFirmFilter('&');
campaigns = await sb(`campaigns?select=*,queues(*),agent_campaigns(*)&order=created_at.desc${ff}`);
campaigns = campaigns || [];
await attachCampaignPeople();
renderCampGrid();
const detailOpen = document.getElementById('camp-detail')?.style.display === 'block';
if (detailOpen && currentCampId && campaigns.some((c) => c.id === currentCampId)) {
  openCampDetail(currentCampId, { keepTab: true, silent: true });
}
if (typeof updateTopbarStats === 'function') updateTopbarStats();
} catch(e){ toast(campT('camp.load.err','Kampanyalar yüklenemedi: ')+e.message,'err'); console.error(e); }
}

function renderCampGrid() {
const grid = document.getElementById('camp-grid');
if (!campaigns.length) {
grid.innerHTML = `<div style="color:var(--text-3);padding:32px;text-align:center;grid-column:1/-1;font-size:13px;">${campT('camp.empty','Henüz kampanya yok')}</div>`;
return;
}
const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
grid.innerHTML = campaigns.map(c=>{
const qs = c.queues||[];
const tot= qs.reduce((s,q)=>s+(q.total_contacts||0),0);
const dia= qs.reduce((s,q)=>s+(q.dialed_count||0),0);
const pct= tot>0?Math.round(dia/tot*100):0;
const ags= (c._people || c.agent_campaigns || []).length;
const sb2= c.status==='active'
?`<span class="badge badge-green">${esc(campT('camp.status.active','Aktif'))}</span>`
:c.status==='paused'
?`<span class="badge badge-yellow">${esc(campT('camp.status.paused','Duraklatıldı'))}</span>`
:`<span class="badge badge-gray">${esc(campT('camp.status.done','Tamamlandı'))}</span>`;
const didRaw = String(c.telnyx_did || '').trim();
const didBad = didRaw && typeof mbIsE164 === 'function' && !mbIsE164(didRaw);
const didText = !didRaw
  ? campT('camp.did.none','DID atanmadı')
  : (didBad ? `${didRaw} · ${campT('camp.did.invalid','DID geçersiz')}` : didRaw);
const descLine = String(c.description || '').trim();
const pauseLabel = c.status==='active'
  ? `<i class="ph ph-pause"></i> ${esc(campT('camp.pause','Duraklat'))}`
  : `<i class="ph ph-play"></i> ${esc(campT('camp.start','Başlat'))}`;
return `<div class="camp-card" onclick="openCampDetail('${c.id}')">
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
<div><div class="camp-name">${esc(c.name)}</div><div class="camp-did">${esc(didText)}</div>${descLine ? `<div class="queue-sub">${esc(descLine)}</div>` : ''}</div>
<div style="display:flex;gap:12px;flex-shrink:0;align-items:center;" onclick="event.stopPropagation()">
${sb2}
<button class="icon-btn" onclick="openCampFieldSettings('${c.id}')" title="${esc(campT('camp.field.title','Alan Ayarları'))}" aria-label="${esc(campT('camp.field.title','Alan Ayarları'))}"><i class="ph ph-gear" aria-hidden="true"></i></button>
<button class="icon-btn" onclick="deleteCampaign('${c.id}')" style="border-color:var(--red);color:var(--red);margin-left:4px;" title="${esc(campT('camp.delete','Sil'))}" aria-label="${esc(campT('camp.delete','Sil'))}"><i class="ph ph-trash" aria-hidden="true"></i></button>
</div>
</div>
<div class="camp-kpi">
<div class="camp-kpi-item"><div class="camp-kpi-val">${tot.toLocaleString()}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.total','Toplam'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--accent);">${dia.toLocaleString()}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.dialed','Aranan'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val">${qs.length}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.queues','Kuyruk'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--text-2);">${ags}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.agent','Temsilci'))}</div></div>
</div>
<div>
<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:4px;">
<span>${esc(campT('camp.kpi.progress','İlerleme'))}</span><span style="color:var(--accent);font-weight:700;font-family:var(--mono);">${pct}%</span>
</div>
<div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;"></div></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;">
<span style="font-size:12px;color:var(--text-3);">${esc(campT('camp.speed','Hız'))}: <strong style="color:var(--accent);font-family:var(--mono);">${esc(c.dial_speed)} ${esc(campT('camp.speed.unit','hat'))}</strong></span>
<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();toggleCampStatus('${c.id}','${c.status}')">
${pauseLabel}
</button>
</div>
</div>`;
}).join('');
}

function openCampDetail(id, opts) {
currentCampId = id;
const c = campaigns.find(x=>x.id===id);
if (!c) return;
document.getElementById('camp-detail').style.display = 'block';
document.getElementById('cd-name').textContent = c.name;
const didRaw = String(c.telnyx_did || '').trim();
const didBad = didRaw && typeof mbIsE164 === 'function' && !mbIsE164(didRaw);
document.getElementById('cd-did').textContent = !didRaw
  ? campT('camp.did.none','DID atanmadı')
  : (didBad ? `${didRaw} · ${campT('camp.did.invalid','DID geçersiz')}` : didRaw);
const nameInput = document.getElementById('cd-edit-name');
const descInput = document.getElementById('cd-edit-desc');
const didInput = document.getElementById('cd-edit-did');
if (nameInput) nameInput.value = c.name || '';
if (descInput) descInput.value = c.description || '';
if (didInput) didInput.value = didRaw;
const nameErr = document.getElementById('cd-edit-name-err');
const didErr = document.getElementById('cd-edit-did-err');
if (nameInput) nameInput.classList.remove('is-invalid');
if (nameErr) nameErr.hidden = true;
if (didInput) didInput.classList.toggle('is-invalid', !!didBad);
if (didErr) {
  didErr.hidden = !didBad;
  if (didBad) didErr.textContent = campT('camp.did.invalid','DID geçersiz');
}
document.getElementById('cd-speed').value = c.dial_speed;
document.getElementById('cd-speed-v').textContent = c.dial_speed;
renderCampQueues(c);
const people = c._people || [];
const escP = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
document.getElementById('cd-agents').innerHTML = people.length
? people.map(ac=>{
const label = campPersonLabel(ac);
const live = ac.live && !ac.assigned ? ` <span style="font-size:10px;color:var(--text-3);">(${escP(campT('camp.agent.live','şu an bu kampanyada'))})</span>` : '';
return `<div class="agent-tag">
<div class="av">${escP(label.charAt(0) || '?')}</div>
${escP(label)}${live}
<button class="rm" onclick="removeAgent('${ac.agent_id}','${id}')"><i class="ph ph-x" style="font-size:10px;"></i></button>
</div>`;
}).join('')
: `<span style="color:var(--text-3);font-size:12px;">${campT('camp.agent.none','Temsilci atanmadı')}</span>`;
if (!opts?.silent) document.getElementById('camp-detail').scrollIntoView({behavior:'smooth'});
if (!opts?.keepTab) switchCampTab('genel');
else {
  const activeTab = document.querySelector('.cd-tab.active')?.dataset.tab;
  if (activeTab && activeTab !== 'genel') switchCampTab(activeTab);
}
}

function closeCampDetail() {
document.getElementById('camp-detail').style.display='none'; currentCampId=null;
}

function fillCampDidList() {
  const list = document.getElementById('nc-did-list');
  if (!list) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const seen = new Set();
  const opts = [];
  (campaigns || []).forEach((c) => {
    const d = String(c.telnyx_did || '').replace(/[\s()-]/g, '');
    if (!d || seen.has(d)) return;
    if (typeof mbIsE164 === 'function' && !mbIsE164(d)) return;
    seen.add(d);
    opts.push(`<option value="${esc(d)}"></option>`);
  });
  list.innerHTML = opts.join('');
}

const NC_LABEL_DE = {
  'Telefon': 'Telefon',
  'Telefon 2': 'Telefon 2',
  'Ad / Soyad': 'Name',
  'PLZ': 'PLZ',
  'Şehir': 'Stadt',
  'Adres': 'Adresse',
  'Arama Sayısı': 'Anrufanzahl',
  'Notlar': 'Notizen',
};
const NC_LABEL_TR = {
  'PLZ': 'Posta kodu',
};

function ncLabelShown(label) {
  const raw = String(label || '');
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  if (!de) {
    if (NC_LABEL_TR[raw]) return NC_LABEL_TR[raw];
    return raw;
  }
  if (NC_LABEL_DE[raw]) return NC_LABEL_DE[raw];
  const m = raw.match(/^Özel Alan (\d+)$/);
  if (m) return `Eigenes Feld ${m[1]}`;
  return raw;
}

function ncLabelCanonical(shown) {
  const s = String(shown || '').trim();
  if (s === 'Posta kodu') return 'PLZ';
  const hit = Object.entries(NC_LABEL_DE).find(([, de]) => de === s);
  if (hit) return hit[0];
  const m = s.match(/^Eigenes Feld (\d+)$/);
  if (m) return `Özel Alan ${m[1]}`;
  return s;
}

function openNewCampModal() {
try {
const saved = localStorage.getItem('mb_field_template');
_ncFields = saved ? JSON.parse(saved) : NC_DEFAULT_FIELDS.map(f=>({...f}));
} catch(e) { _ncFields = NC_DEFAULT_FIELDS.map(f=>({...f})); }
renderNcFieldList();
updateCampPreview();
openModal('m-new-camp');
setTimeout(renderNcTemplateSelect, 50);
document.getElementById('nc-name').value = '';
document.getElementById('nc-name')?.classList.remove('is-invalid');
const ncNameErr = document.getElementById('nc-name-err');
if (ncNameErr) ncNameErr.hidden = true;
document.getElementById('nc-did').value = '';
document.getElementById('nc-desc').value = '';
document.getElementById('nc-speed').value = 1;
document.getElementById('nc-sv').textContent = '1';
fillCampDidList();
const ncFirmRow = document.getElementById('nc-firm-row');
const ncFirmSel = document.getElementById('nc-firm-id');
if (ncFirmRow && ncFirmSel) {
if (isSuperAdmin()) {
ncFirmRow.style.display = '';
ncFirmSel.innerHTML = '<option value="">Firma seçin...</option>' +
_allFirms.map(f=>`<option value="${f.id}" ${f.id===(_selectedFirmId||'')?'selected':''}>${f.name}</option>`).join('');
} else {
ncFirmRow.style.display = 'none';
}
}
}

function renderNcFieldList() {
const el = document.getElementById('nc-field-list');
if (!el) return;
el.innerHTML = _ncFields.map((f,i) => `
<div draggable="true" ondragstart="_ncDragIdx=${i}" ondragover="event.preventDefault()"
ondrop="ncDropField(${i})"
style="display:flex;align-items:center;gap:5px;padding:5px 7px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;cursor:grab;">
<span style="color:var(--text-3);font-size:14px;cursor:grab;user-select:none;">⠿</span>
<input type="checkbox" ${f.show?'checked':''} ${f.locked?'disabled':''}
onchange="_ncFields[${i}].show=this.checked;updateCampPreview()" title="Göster/Gizle">
<input class="form-input" value="${ncLabelShown(f.label)}" style="flex:1;font-size:12px;padding:3px 7px;"
oninput="_ncFields[${i}].label=ncLabelCanonical(this.value);updateCampPreview()" placeholder="Alan adı">
<select class="form-input" style="width:152px;flex-shrink:0;font-size:11px;padding:3px;"
onchange="_ncFields[${i}].type=this.value;updateCampPreview()">
<option value="text" ${f.type==='text'?'selected':''} data-tr="Metin" data-de="Text">Metin</option>
<option value="number" ${f.type==='number'?'selected':''} data-tr="Sayı" data-de="Zahl">Sayı</option>
<option value="date" ${f.type==='date'?'selected':''} data-tr="Tarih" data-de="Datum">Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''} data-tr="Evet/Hayır" data-de="Ja/Nein">Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''} data-tr="Açılır Menü" data-de="Auswahl">Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''} data-tr="Çoktan Seçmeli" data-de="Mehrfachauswahl">Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''} data-tr="Onay kutusu" data-de="Kontrollkästchen">Onay kutusu</option>
</select>
${f.locked
? '<i class="ph ph-lock-simple" style="font-size:13px;color:var(--text-3);"></i>'
: `<button onclick="ncRemoveField(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 2px;display:flex;align-items:center;"><i class="ph ph-x"></i></button>`
}
</div>`).join('');
if (typeof currentLang !== 'undefined' && currentLang === 'de') {
  el.querySelectorAll('[data-de]').forEach((opt) => { opt.textContent = opt.getAttribute('data-de'); });
}
}

function ncDropField(toIdx) {
if (_ncDragIdx===null || _ncDragIdx===toIdx) return;
const moved = _ncFields.splice(_ncDragIdx, 1)[0];
_ncFields.splice(toIdx, 0, moved);
_ncDragIdx = null;
renderNcFieldList();
updateCampPreview();
}

function ncAddField() {
_ncFields.push({
key: 'custom_' + Date.now(),
label: 'Özel Alan ' + (_ncFields.filter(f=>f.key.startsWith('custom')).length+1),
type: 'text', show: true, locked: false
});
renderNcFieldList();
updateCampPreview();
}

function ncRemoveField(i) {
if (_ncFields[i]?.locked) return;
_ncFields.splice(i, 1);
renderNcFieldList();
updateCampPreview();
}

function getFieldTemplates() {
try { return JSON.parse(localStorage.getItem('mb_field_templates')||'{}'); } catch(e) { return {}; }
}

function saveFieldTemplates(tpls) {
localStorage.setItem('mb_field_templates', JSON.stringify(tpls));
}

async function ncSaveTemplate() {
const name = await mbPrompt('Şablon adı:', 'Varsayılan', 'Şablon Kaydet');
if (!name) return;
const tpls = getFieldTemplates();
tpls[name] = _ncFields.map(f=>({...f}));
saveFieldTemplates(tpls);
toast(`"${name}" şablonu kaydedildi ✓`, 'ok');
renderNcTemplateSelect();
}

function renderNcTemplateSelect() {
const wrap = document.getElementById('nc-template-wrap');
if (!wrap) return;
const tpls = getFieldTemplates();
const names = Object.keys(tpls);
if (!names.length) { wrap.innerHTML = ''; return; }
wrap.innerHTML = `
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
<span style="font-size:11px;color:var(--text-3);font-weight:700;">Şablon:</span>
<select class="form-input" id="nc-template-sel" style="font-size:11px;padding:3px 8px;max-width:150px;">
<option value="">Seç...</option>
${names.map(n=>`<option value="${n}">${n}</option>`).join('')}
</select>
<button class="btn btn-ghost btn-sm" onclick="ncLoadTemplate()" style="font-size:11px;">Yükle</button>
<button class="btn btn-ghost btn-sm" onclick="ncDeleteTemplate()" style="font-size:11px;color:var(--red);">Sil</button>
</div>`;
}

function ncLoadTemplate() {
const sel = document.getElementById('nc-template-sel');
const name = sel?.value;
if (!name) return;
const tpls = getFieldTemplates();
if (!tpls[name]) return;
_ncFields = tpls[name].map(f=>({...f}));
renderNcFieldList();
updateCampPreview();
toast(`"${name}" şablonu yüklendi`, 'ok');
}

async function ncDeleteTemplate() {
const sel = document.getElementById('nc-template-sel');
const name = sel?.value;
if (!name || !(await mbConfirm(`"${name}" şablonu silinsin?`, 'Şablon Sil'))) return;
const tpls = getFieldTemplates();
delete tpls[name];
saveFieldTemplates(tpls);
renderNcTemplateSelect();
toast('Şablon silindi', 'ok');
}

function ncLoadDefault() {
_ncFields = NC_DEFAULT_FIELDS.map(f=>({...f}));
renderNcFieldList();
updateCampPreview();
}

function updateCampPreview() {
const el = document.getElementById('nc-preview');
if (!el) return;
const visible = _ncFields.filter(f => f.show);
if (!visible.length) {
el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Alan seçilmedi</div>';
return;
}
const dePrev = typeof currentLang !== 'undefined' && currentLang === 'de';
const sampleVal = (tp) => tp==='number'?'123':tp==='date'?'01.01.2024':tp==='boolean'?(dePrev?'Ja':'Evet'):(dePrev?'Beispieldaten':'Örnek veri');
el.innerHTML = `
<div style="font-size:13px;font-weight:800;padding:8px 10px;background:var(--accent);color:#fff;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
<i class="ph ph-phone"></i> +49 176 1234567
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
${visible.map(f=>`
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:5px;padding:5px 7px;">
<div style="font-size:9px;color:var(--text-3);font-weight:700;letter-spacing:.4px;">${typeof ncLabelShown==='function'?ncLabelShown(f.label):f.label}</div>
<div style="font-size:11px;font-weight:600;color:var(--text);margin-top:2px;">${sampleVal(f.type)}</div>
</div>`).join('')}
</div>`;
}

async function createCampaign() {
if (typeof mbEnsureSession === 'function') {
  const ok = await mbEnsureSession();
  if (!ok) return;
}
const name = document.getElementById('nc-name').value.trim();
const did  = document.getElementById('nc-did').value.trim();
const desc = document.getElementById('nc-desc').value.trim();
const spd  = parseInt(document.getElementById('nc-speed').value)||1;
const nameEl = document.getElementById('nc-name');
const nameErr = document.getElementById('nc-name-err');
if (!name) {
  if (nameEl) {
    nameEl.classList.add('is-invalid');
    nameEl.setAttribute('aria-invalid', 'true');
    nameEl.focus();
    nameEl.scrollIntoView({ block: 'nearest' });
  }
  if (nameErr) { nameErr.hidden = false; nameErr.textContent = campT('camp.name.required','Kampanya adı gerekli'); }
  toast(campT('camp.name.required','Kampanya adı gerekli'),'err');
  return;
}
if (nameEl) {
  nameEl.classList.remove('is-invalid');
  nameEl.removeAttribute('aria-invalid');
}
if (nameErr) nameErr.hidden = true;
const didNorm = did.replace(/[\s()-]/g, '');
if (did && (typeof mbIsE164 !== 'function' || !mbIsE164(did))) {
  toast(campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'), 'err');
  return;
}
const targetFirmId = (isSuperAdmin() ? document.getElementById('nc-firm-id')?.value : null) || getActiveFirmId() || currentUser?.firm_id;
if (!targetFirmId) { toast('Firma seçin veya yeniden giriş yapın','err'); return; }
if (didNorm) {
  const dup = (campaigns || []).some((c) => String(c.firm_id || '') === String(targetFirmId) && String(c.telnyx_did || '').replace(/[\s()-]/g, '') === didNorm);
  if (dup) { toast(campT('camp.did.dup','Bu numara başka kampanyada kayıtlı'), 'err'); return; }
}
const fieldConfig = {};
_ncFields.forEach(f => {
fieldConfig[f.key] = {show:f.show, label:f.label, type:f.type, locked:f.locked||false};
});
try {
const created = await sb('campaigns', {
method:'POST', prefer:'return=representation',
body: JSON.stringify({
name, telnyx_did:didNorm||null, description:desc||null,
dial_speed:spd, field_config:fieldConfig,
firm_id: targetFirmId, status:'active'
})
});
const row = Array.isArray(created) ? created[0] : created;
closeModal('m-new-camp');
toast('Kampanya oluşturuldu ✓','ok');
await loadCampaigns();
if (row?.id) openCampDetail(row.id);
} catch(e){ toast(e.message || campT('api.err.generic','İşlem tamamlanamadı. Tekrar deneyin.'),'err'); console.error(e); }
}

async function toggleCampStatus(id, status) {
const ns = status==='active'?'paused':'active';
try {
await sb(`campaigns?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({status:ns})});
loadCampaigns();
} catch(e){ toast('Hata','err'); }
}

async function deleteCampaign(id) {
if (!(await mbConfirm('Bu kampanyayı silmek istediğine emin misin?', 'Kampanya Sil'))) return;
try {
await sb(`campaigns?id=eq.${id}`,{method:'DELETE',prefer:'return=minimal'});
toast('Silindi','ok'); closeCampDetail(); loadCampaigns();
} catch(e){ toast('Hata','err'); }
}

async function saveSpeed(v) {
if (!currentCampId) return;
const speed = parseInt(v, 10);
if (!speed) return;
try {
await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',body:JSON.stringify({dial_speed:speed})});
const camp = campaigns.find((c) => c.id === currentCampId);
if (camp) camp.dial_speed = speed;
toast(campT('camp.speed.saved','Hız {v} olarak kaydedildi').replace('{v}', String(speed)),'ok');
} catch(e){ toast(e.message,'err'); }
}

function campEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function findQueue(queueId) {
  for (const camp of campaigns || []) {
    const queue = (camp.queues || []).find((q) => q.id === queueId);
    if (queue) return { camp, queue };
  }
  return null;
}

function queueMetaFor(camp, queueId) {
  const map = getCampSettings(camp).queue_meta || {};
  const meta = map[queueId] || {};
  return {
    priority: Math.max(0, Math.min(100, parseInt(meta.priority, 10) || 0)),
    maxAttempts: Math.max(0, Math.min(50, parseInt(meta.max_attempts, 10) || 0)),
    notes: String(meta.notes || '').slice(0, 500),
  };
}

function queueDialPrefs(campaignId, queueId) {
  const camp = (campaigns || []).find((c) => c.id === campaignId);
  if (!camp || !queueId) return { priority: 0, maxAttempts: 0 };
  const meta = queueMetaFor(camp, queueId);
  return { priority: meta.priority, maxAttempts: meta.maxAttempts };
}

const RECYCLE_STATUS_KEYS = ['no_answer', 'voicemail', 'negative', 'callback'];

function campRecyclePolicy(campaignId) {
  const camp = (campaigns || []).find((c) => c.id === campaignId);
  if (!camp) return null;
  const s = getCampSettings(camp);
  if (!s || !s.recycle_configured) return null;
  const statuses = (Array.isArray(s.recycle_statuses) ? s.recycle_statuses : [])
    .map((x) => String(x || ''))
    .filter((x) => RECYCLE_STATUS_KEYS.includes(x));
  const max = Math.max(1, Math.min(5, parseInt(s.recycle_max, 10) || 1));
  const delayMin = Math.max(0, Math.min(1440, parseInt(s.recycle_delay, 10) || 0));
  return { on: !!s.recycle && statuses.length > 0, statuses, max, delayMin };
}

function contactEligibleForRecycle(c, testRelax) {
  if (testRelax || !c) return true;
  const pol = campRecyclePolicy(c.campaign_id);
  if (!pol) return true;
  const st = String(c.status || '').toLowerCase();
  if (!st || st === 'pending' || st === 'calling') return true;
  const dueCb = st === 'callback' && c.callback_at && Date.parse(c.callback_at) <= Date.now();
  if (dueCb) return true;
  if (!pol.on || !pol.statuses.includes(st)) return false;
  if ((Number(c.attempt_count) || 0) >= pol.max) return false;
  if (pol.delayMin > 0 && c.last_called_at) {
    if (Date.parse(c.last_called_at) + pol.delayMin * 60000 > Date.now()) return false;
  }
  return true;
}

function renderCampQueues(c) {
  const host = document.getElementById('cd-queues');
  if (!host) return;
  const qs = c?.queues || [];
  const countEl = document.getElementById('cd-queue-count');
  if (countEl) countEl.textContent = ` · ${qs.length}`;
  if (!qs.length) {
    host.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">${campEsc(campT('camp.queue.none','Kuyruk yok'))}</div>`;
    return;
  }
  host.innerHTML = qs.map((q) => {
    const dialed = q.dialed_count || 0;
    const total = q.total_contacts || 0;
    const p = total > 0 ? Math.round(dialed / total * 100) : 0;
    const active = q.status === 'active';
    const meta = queueMetaFor(c, q.id);
    const bits = [];
    if (meta.priority > 0) bits.push(`${campT('camp.queue.priority','Öncelik')} ${meta.priority}`);
    if (meta.maxAttempts > 0) bits.push(`${campT('camp.queue.max','En fazla deneme')} ${meta.maxAttempts}`);
    if (meta.notes) bits.push(meta.notes);
    return `<div class="queue-row" data-queue-id="${campEsc(q.id)}">
<div style="flex:1;min-width:140px;">
<div class="queue-name">${campEsc(q.name)}</div>
${bits.length ? `<div class="queue-sub">${campEsc(bits.join(' · '))}</div>` : ''}
</div>
<div class="queue-cnt" style="white-space:nowrap;">${dialed}/${total} <span style="color:var(--accent);">(${p}%)</span></div>
<div style="width:70px;"><div class="prog-wrap"><div class="prog-fill" style="width:${p}%;"></div></div></div>
<span class="badge ${active ? 'badge-green' : 'badge-gray'}">${campEsc(active ? campT('camp.queue.active','Aktif') : campT('camp.queue.stopped','Durdu'))}</span>
<div class="queue-actions">
<button type="button" class="btn btn-primary btn-xs" onclick="openQueueOps('${q.id}')">${campEsc(campT('camp.queue.ops','İşlemler'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="startQueueRename('${q.id}')">${campEsc(campT('camp.queue.rename','Adı değiştir'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="toggleQueueStatus('${q.id}')">${campEsc(active ? campT('camp.queue.pause','Duraklat') : campT('camp.queue.resume','Sürdür'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="openRequeueModal('${q.id}')">${campEsc(campT('camp.queue.manage','Ayarlar'))}</button>
</div>
</div>`;
  }).join('');
}

function startQueueRename(queueId) {
  const found = findQueue(queueId);
  const host = document.querySelector(`[data-queue-id="${queueId}"] .queue-name`);
  if (!found || !host) return;
  host.innerHTML = `<div class="queue-name-edit">
<input class="form-input queue-rename-input" id="queue-rename-${queueId}" value="${campEsc(found.queue.name || '')}" maxlength="120">
<button type="button" class="btn btn-primary btn-xs" onclick="commitQueueRename('${queueId}')">${campEsc(campT('camp.notif.save','Kaydet'))}</button>
</div>`;
  const input = document.getElementById(`queue-rename-${queueId}`);
  input?.focus();
  input?.select();
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitQueueRename(queueId);
    if (e.key === 'Escape' && currentCampId) openCampDetail(currentCampId, { keepTab: true, silent: true });
  });
}

function queueNameTaken(camp, queueId, name) {
  const key = String(name || '').trim().toLocaleLowerCase('tr-TR');
  return (camp.queues || []).some((q) => q.id !== queueId && String(q.name || '').trim().toLocaleLowerCase('tr-TR') === key);
}

async function commitQueueRename(queueId) {
  const found = findQueue(queueId);
  const input = document.getElementById(`queue-rename-${queueId}`);
  const name = String(input?.value || '').trim();
  if (!found) return;
  if (!name) {
    toast(campT('camp.queue.name.required','Kuyruk adı gerekli'), 'err');
    input?.focus();
    return;
  }
  if (queueNameTaken(found.camp, queueId, name)) {
    toast(campT('camp.queue.name.dup','Bu kampanyada aynı kuyruk adı var'), 'err');
    return;
  }
  if (name === found.queue.name) {
    renderCampQueues(found.camp);
    return;
  }
  try {
    await sb(`queues?id=eq.${queueId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ name }) });
    found.queue.name = name;
    toast(campT('camp.queue.saved','Kuyruk ayarları kaydedildi'), 'ok');
    renderCampQueues(found.camp);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function toggleQueueStatus(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const next = found.queue.status === 'active' ? 'paused' : 'active';
  try {
    await sb(`queues?id=eq.${queueId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: next }) });
    found.queue.status = next;
    renderCampQueues(found.camp);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function saveCampIdentity() {
  const camp = campaigns.find((c) => c.id === currentCampId);
  if (!camp) return;
  const nameEl = document.getElementById('cd-edit-name');
  const nameErr = document.getElementById('cd-edit-name-err');
  const didEl = document.getElementById('cd-edit-did');
  const didErr = document.getElementById('cd-edit-did-err');
  const name = String(nameEl?.value || '').trim();
  const desc = String(document.getElementById('cd-edit-desc')?.value || '').trim();
  const didRaw = String(didEl?.value || '').trim();
  if (!name) {
    if (nameEl) { nameEl.classList.add('is-invalid'); nameEl.focus(); }
    if (nameErr) { nameErr.hidden = false; nameErr.textContent = campT('camp.name.required','Kampanya adı gerekli'); }
    toast(campT('camp.name.required','Kampanya adı gerekli'), 'err');
    return;
  }
  if (nameEl) nameEl.classList.remove('is-invalid');
  if (nameErr) nameErr.hidden = true;
  const prev = String(camp.telnyx_did || '').trim();
  const prevNorm = prev.replace(/[\s()-]/g, '');
  const nextNorm = didRaw.replace(/[\s()-]/g, '');
  if (nextNorm !== prevNorm) {
    if (nextNorm && (typeof mbIsE164 !== 'function' || !mbIsE164(nextNorm))) {
      if (didEl) didEl.classList.add('is-invalid');
      if (didErr) { didErr.hidden = false; didErr.textContent = campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'); }
      toast(campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'), 'err');
      return;
    }
    const dup = (campaigns || []).some((c) => c.id !== camp.id && String(c.firm_id || '') === String(camp.firm_id || '') && String(c.telnyx_did || '').replace(/[\s()-]/g, '') === nextNorm && nextNorm);
    if (dup) {
      toast(campT('camp.did.dup','Bu numara başka kampanyada kayıtlı'), 'err');
      return;
    }
  }
  const telnyx_did = nextNorm === prevNorm ? (prev || null) : (nextNorm || null);
  try {
    await sb(`campaigns?id=eq.${camp.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ name, description: desc || null, telnyx_did })
    });
    camp.name = name;
    camp.description = desc || null;
    camp.telnyx_did = telnyx_did;
    toast(campT('camp.identity.saved','Kampanya kaydedildi'), 'ok');
    await loadCampaigns();
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ── Alan ayarları ──────────────────────────────
function openCampFieldSettings(campId) {
const camp = campaigns.find(c => c.id === campId);
if (!camp) { toast('Kampanya bulunamadı','err'); return; }
_fsCampId = campId;
let fc = {};
try { fc = camp.field_config ? (typeof camp.field_config==='string'?JSON.parse(camp.field_config):camp.field_config) : {}; } catch(e) {}
const DEFAULT_FIELDS = [
{key:'phone',   defaultLabel:'Telefon',      type:'text',   show:true,  locked:true},
{key:'phone2',  defaultLabel:'Telefon 2',    type:'text',   show:true,  locked:false},
{key:'name',    defaultLabel:'Ad / Soyad',   type:'text',   show:true,  locked:false},
{key:'plz',     defaultLabel:'PLZ',          type:'text',   show:true,  locked:false},
{key:'city',    defaultLabel:'Şehir',        type:'text',   show:true,  locked:false},
{key:'address', defaultLabel:'Adres',        type:'text',   show:true,  locked:false},
{key:'attempt', defaultLabel:'Arama Sayısı', type:'number', show:true,  locked:false},
{key:'notes',   defaultLabel:'Notlar',       type:'text',   show:false, locked:false},
{key:'custom1', defaultLabel:'Özel Alan 1',  type:'text',   show:false, locked:false},
{key:'custom2', defaultLabel:'Özel Alan 2',  type:'text',   show:false, locked:false},
{key:'custom3', defaultLabel:'Özel Alan 3',  type:'number', show:false, locked:false},
];
_fsFields = DEFAULT_FIELDS.map(f => ({
...f,
show:  fc[f.key]?.show  !== undefined ? fc[f.key].show  : f.show,
label: fc[f.key]?.label || f.defaultLabel,
type:  fc[f.key]?.type  || f.type,
}));
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
<div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">✓ Göster/gizle · Ad ve tip değiştir</div>
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
return `<div style="padding:6px 8px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;">
<div style="display:flex;align-items:center;gap:6px;">
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
const el = document.getElementById('fs-preview');
if (!el) return;
const vis = _fsFields.filter(f=>f.show);
const sv = t=>t==='number'?'123':t==='date'?'01.01.2024':t==='boolean'?'Evet':'Örnek';
el.innerHTML = `
<div style="font-size:12px;font-weight:800;padding:7px 10px;background:var(--accent);color:#fff;border-radius:6px;margin-bottom:8px;">📞 +49 176 1234567</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
${vis.map(f=>`<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:5px;padding:5px 7px;">
<div style="font-size:9px;color:var(--text-3);font-weight:700;">${typeof ncLabelShown==='function'?ncLabelShown(f.label):f.label}</div>
<div style="font-size:11px;font-weight:600;margin-top:1px;">${sv(f.type)}</div>
</div>`).join('')}
</div>`;
}

async function saveCampFieldSettings(campId) {
const KEYS = ['name','phone','phone2','plz','city','address','attempt','notes','custom1','custom2','custom3'];
const fc = {};
_fsFields.forEach(f => {
fc[f.key || f.defaultKey] = {
show:  f.show,
label: f.label,
type:  f.type,
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
}

function loadCampTerminFormTab() {
const el = document.getElementById('cd-termin-form-fields');
if (!el) return;
const camp = campaigns.find(c=>c.id===currentCampId);
let tf = {};
try {
  const fromSettings = getCampSettings(camp).termin_form;
  const legacy = camp?.termin_form_config;
  tf = fromSettings && typeof fromSettings === 'object' ? fromSettings : (typeof legacy === 'string' ? JSON.parse(legacy) : (legacy || {}));
} catch(e) {}
const DEFAULT_TF = [
  {key:'hausart',label:'Ev Tipi',type:'select',opts:'Einfamilienhaus,Zweifamilienhaus,Reihenhaus,Doppelhaus,Mehrfamilienhaus',enabled:true,required:true},
  {key:'baujahr',label:'Yapım Yılı',type:'text',enabled:true,required:true},
  {key:'qm',label:'m²',type:'number',enabled:true,required:true},
  {key:'heizung',label:'Isıtma',type:'select',opts:'Gas,Öl,Pellet,WP,Fernwärme',enabled:true,required:true},
  {key:'alter_der_heizung',label:'Isıtma Yaşı',type:'text',enabled:true,required:true},
  {key:'verbrauch_pro_jahr',label:'Tüketim/Yıl',type:'text',enabled:true,required:false},
  {key:'personen',label:'Kişi Sayısı',type:'number',enabled:true,required:false},
  {key:'interesse_an_pv',label:'PV İlgisi',type:'boolean',enabled:false,required:false},
];
const fields = DEFAULT_TF.map(f=>({...f, enabled:tf[f.key]?.enabled??f.enabled, required:tf[f.key]?.required??f.required, label:tf[f.key]?.label||f.label, opts:tf[f.key]?.opts||f.opts||''}));
el.innerHTML = fields.map((f,i)=>`
<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-3);border-radius:6px;" data-key="${f.key}">
<input type="checkbox" id="tf-en-${i}" ${f.enabled?'checked':''} style="width:15px;height:15px;">
<input class="form-input" id="tf-lbl-${i}" value="${campEsc(f.label)}" style="flex:1;font-size:12px;padding:3px 7px;">
<select class="form-input" id="tf-type-${i}" style="width:110px;font-size:11px;padding:3px;">
<option value="text" ${f.type==='text'?'selected':''}>${campEsc(campT('camp.tf.text','Metin'))}</option>
<option value="number" ${f.type==='number'?'selected':''}>${campEsc(campT('camp.tf.number','Sayı'))}</option>
<option value="select" ${f.type==='select'?'selected':''}>${campEsc(campT('camp.tf.select','Açılır menü'))}</option>
<option value="boolean" ${f.type==='boolean'?'selected':''}>${campEsc(campT('camp.tf.bool','Evet/Hayır'))}</option>
</select>
<label style="font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;"><input type="checkbox" id="tf-req-${i}" ${f.required?'checked':''}>${campEsc(campT('camp.tf.required','Zorunlu'))}</label>
</div>
${['select'].includes(f.type)?`<div style="padding:3px 10px 6px;"><input class="form-input" id="tf-opts-${i}" style="font-size:10px;padding:2px 6px;width:100%;" value="${campEsc(f.opts||'')}"></div>`:''}
`).join('');
el.dataset.count = fields.length;
}

async function saveCampTerminFormSettings() {
const el = document.getElementById('cd-termin-form-fields');
if (!el) return;
const n = parseInt(el.dataset.count||'0');
const keys = ['hausart','baujahr','qm','heizung','alter_der_heizung','verbrauch_pro_jahr','personen','interesse_an_pv'];
const cfg = {};
for (let i=0;i<n;i++) {
  const key = keys[i];
  if (!key) continue;
  cfg[key] = {
    enabled: document.getElementById(`tf-en-${i}`)?.checked||false,
    label: document.getElementById(`tf-lbl-${i}`)?.value||key,
    type: document.getElementById(`tf-type-${i}`)?.value||'text',
    required: document.getElementById(`tf-req-${i}`)?.checked||false,
    opts: document.getElementById(`tf-opts-${i}`)?.value||''
  };
}
try {
  await saveCampSettingsPatch({ termin_form: cfg });
  toast(campT('camp.tf.saved','Randevu formu kaydedildi'), 'ok');
} catch(e) { toast(e.message,'err'); }
}

function loadCampFieldsTab() {
const container = document.getElementById('cd-field-settings-container');
if (!container) return;
const camp = campaigns.find(c=>c.id===currentCampId);
if (!camp) return;
_fsCampId = currentCampId;
let fc = {};
try { fc = camp.field_config ? (typeof camp.field_config==='string'?JSON.parse(camp.field_config):camp.field_config) : {}; } catch(e) {}
const DEFAULT_FIELDS = [
{key:'phone',defaultLabel:'Telefon',type:'text',show:true,locked:true},
{key:'phone2',defaultLabel:'Telefon 2',type:'text',show:true,locked:false},
{key:'name',defaultLabel:'Ad / Soyad',type:'text',show:true,locked:false},
{key:'plz',defaultLabel:'PLZ',type:'text',show:true,locked:false},
{key:'city',defaultLabel:'Şehir',type:'text',show:true,locked:false},
{key:'address',defaultLabel:'Adres',type:'text',show:true,locked:false},
{key:'attempt',defaultLabel:'Arama Sayısı',type:'number',show:true,locked:false},
{key:'notes',defaultLabel:'Notlar',type:'text',show:false,locked:false},
{key:'custom1',defaultLabel:'Özel Alan 1',type:'text',show:false,locked:false},
{key:'custom2',defaultLabel:'Özel Alan 2',type:'text',show:false,locked:false},
{key:'custom3',defaultLabel:'Özel Alan 3',type:'number',show:false,locked:false},
];
_fsFields = DEFAULT_FIELDS.map(f=>({...f,show:fc[f.key]?.show!==undefined?fc[f.key].show:f.show,label:fc[f.key]?.label||f.defaultLabel,type:fc[f.key]?.type||f.type}));
container.innerHTML = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
<div>
<div style="font-size:12px;font-weight:700;margin-bottom:8px;">${campEsc(campT('camp.fields.list','Alan listesi'))}</div>
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
return `<div style="padding:5px 7px;background:var(--bg-2);border:1px solid var(--border);border-radius:5px;">
<div style="display:flex;align-items:center;gap:5px;">
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
_fsFields.push({key:'custom_'+Date.now(),label:'Yeni Alan',type:'text',show:true,locked:false});
renderCdFsFieldList(); updateCdFsPreview();
}

function updateCdFsPreview() {
const el = document.getElementById('cd-fs-preview');
if (!el) return;
const vis = _fsFields.filter(f=>f.show);
const sv = t=>t==='number'?'123':t==='date'?'01.01.2024':t==='boolean'?'Evet':'Örnek';
el.innerHTML = `<div style="font-size:11px;font-weight:800;padding:5px 8px;background:var(--accent);color:#fff;border-radius:5px;margin-bottom:6px;"><i class="ph ph-phone"></i> +49 176 1234567</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
${vis.map(f=>`<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:4px;padding:4px 6px;">
<div style="font-size:8px;color:var(--text-3);">${typeof ncLabelShown==='function'?ncLabelShown(f.label):f.label}</div>
<div style="font-size:11px;font-weight:600;">${sv(f.type)}</div></div>`).join('')}
</div>`;
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
  const priority = Math.max(0, Math.min(100, parseInt(document.getElementById('rq-priority')?.value, 10) || 0));
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

function opsRangeQuery() {
  const from = document.getElementById('ops-from')?.value || '';
  const to = document.getElementById('ops-to')?.value || '';
  let q = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q += `&created_at=gte.${from}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q += `&created_at=lte.${to}T23:59:59`;
  return q;
}

function opsSliceCount(key) {
  const n = Number(document.querySelector(`#qops-body tr[data-ops="${key}"]`)?.dataset.n || 0);
  const pct = Number(document.getElementById(`ops-pct-${key}`)?.value || 0);
  return Math.min(n, Math.max(0, Math.round(n * pct / 100)));
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
  const range = opsRangeQuery();
  const nums = await Promise.all(QUEUE_OPS_ROWS.map((row) => mbHeadCount(`contacts?queue_id=eq.${queueId}&status=eq.${row.key}&select=id${range}`)));
  const total = nums.reduce((s, n) => s + n, 0);
  body.innerHTML = QUEUE_OPS_ROWS.map((row, i) => {
    const n = nums[i];
    const share = total > 0 ? Math.round(n / total * 1000) / 10 : 0;
    const sliced = row.requeue || row.pull;
    const take = n;
    return `<tr data-ops="${row.key}" data-n="${n}" class="${row.key === 'pending' ? 'is-queue' : ''}">
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

// ── Kuyruk Yönetim Modalı ─────────────────────
async function openRequeueModal(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const meta = queueMetaFor(found.camp, queueId);
  try {
    const statuses = ['pending', 'no_answer', 'voicemail', 'negative', 'callback', 'dnc'];
    const nums = await Promise.all(statuses.map((st) => mbHeadCount(`contacts?queue_id=eq.${queueId}&status=eq.${st}&select=id`)));
    const counts = {};
    statuses.forEach((st, i) => { counts[st] = nums[i]; });
    const labels = {
      pending: campT('camp.st.pending','Bekliyor'),
      no_answer: campT('camp.st.no_answer','Cevap yok'),
      negative: campT('camp.st.negative','Olumsuz'),
      callback: campT('camp.st.callback','Geri ara'),
      dnc: campT('camp.st.dnc','Kara liste'),
      voicemail: campT('camp.st.voicemail','Telesekreter'),
    };
    document.getElementById('m-requeue')?.remove();
    const modal = document.createElement('div');
    modal.id = 'm-requeue'; modal.className = 'modal-overlay open';
    modal.innerHTML = `
<div class="modal" style="max-width:520px;">
<div class="modal-hdr">
<div class="modal-title">${campEsc(campT('camp.queue.settings','Kuyruk ayarları'))}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
<label class="form-label" for="rq-name">${campEsc(campT('camp.queue.rename','Adı değiştir'))}</label>
<input class="form-input" id="rq-name" maxlength="120" value="${campEsc(found.queue.name || '')}">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div>
<label class="form-label" for="rq-status">${campEsc(campT('camp.queue.status','Durum'))}</label>
<select class="form-input" id="rq-status">
<option value="active" ${found.queue.status === 'active' ? 'selected' : ''}>${campEsc(campT('camp.queue.active','Aktif'))}</option>
<option value="paused" ${found.queue.status !== 'active' ? 'selected' : ''}>${campEsc(campT('camp.queue.stopped','Durdu'))}</option>
</select>
</div>
<div>
<label class="form-label" for="rq-priority">${campEsc(campT('camp.queue.priority','Öncelik'))}</label>
<input class="form-input" id="rq-priority" type="number" min="0" max="100" value="${meta.priority}">
</div>
</div>
<div style="font-size:11px;color:var(--text-3);">${campEsc(campT('camp.queue.priority.hint','Yüksek sayı önce aranır. 0 hepsi eşit.'))}</div>
<div>
<label class="form-label" for="rq-max">${campEsc(campT('camp.queue.max','En fazla deneme'))}</label>
<input class="form-input" id="rq-max" type="number" min="0" max="50" value="${meta.maxAttempts}">
<div style="font-size:11px;color:var(--text-3);margin-top:4px;">${campEsc(campT('camp.queue.max.hint','0 sınırsız. Dolunca numara atlanır.'))}</div>
</div>
<div>
<label class="form-label" for="rq-notes">${campEsc(campT('camp.queue.notes','Not'))}</label>
<textarea class="form-input" id="rq-notes" rows="2" maxlength="500">${campEsc(meta.notes)}</textarea>
</div>
<button type="button" class="btn btn-primary btn-sm" style="align-self:flex-start;" onclick="saveQueueSettings('${queueId}')">${campEsc(campT('camp.notif.save','Kaydet'))}</button>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
${statuses.map((k) => `
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
<span style="font-size:12px;color:var(--text-2);">${campEsc(labels[k])}</span>
<span style="font-size:18px;font-weight:800;font-family:var(--mono);">${counts[k]}</span>
</div>`).join('')}
</div>
<div style="font-size:12px;font-weight:700;color:var(--text-2);">${campEsc(campT('camp.queue.requeue','Tekrar kuyruğa al'))}</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${['no_answer','voicemail','negative','callback'].map((k) => `
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-${k}" style="width:15px;height:15px;">
<span style="font-size:12px;">${campEsc(labels[k])} <span style="color:var(--text-3);">(${counts[k]} ${campEsc(campT('camp.queue.people','kişi'))})</span></span>
</label>`).join('')}
</div>
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-reset-attempts" style="width:15px;height:15px;">
<span style="font-size:12px;">${campEsc(campT('camp.queue.reset_attempts','Deneme sayılarını sıfırla'))}</span>
</label>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${campEsc(campT('camp.queue.cancel','İptal'))}</button>
<button class="btn btn-primary" onclick="doRequeue('${queueId}')">${campEsc(campT('camp.queue.requeue.do','Kuyruğa al'))}</button>
</div>
</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) { toast(e.message, 'err'); }
}

async function doRequeue(queueId) {
  const statuses = ['no_answer','voicemail','negative','callback'].filter(s => document.getElementById('rq-'+s)?.checked);
  if (!statuses.length) { toast(campT('camp.queue.pick_status','En az bir durum seçin'),'warn'); return; }
  const resetAttempts = document.getElementById('rq-reset-attempts')?.checked;
  try {
    for (const status of statuses) {
      const patch = { status: 'pending', last_called_at: null };
      if (resetAttempts) patch.attempt_count = 0;
      await sb(`contacts?queue_id=eq.${queueId}&status=eq.${status}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify(patch)
      });
    }
    // Dialed count'u yeniden hesapla
    await syncQueueDialed(queueId);
    document.getElementById('m-requeue')?.remove();
    toast(`Kuyruğa alındı ✓ (${statuses.length} durum)`, 'ok');
    if (currentCampId) { loadCampaigns(); setTimeout(()=>openCampDetail(currentCampId), 400); }
  } catch(e) { toast('Hata: ' + e.message, 'err'); }
}
