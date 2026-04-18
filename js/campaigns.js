// ─────────────────────────────────────────────
// CAMPAIGNS — kampanya yönetimi
// ─────────────────────────────────────────────

async function loadCampaigns() {
renderFirmSelector('camp-firm-selector', loadCampaigns);
try {
const ff = getFirmFilter('&');
campaigns = await sb(`campaigns?select=*,queues(*),agent_campaigns(*)&order=created_at.desc${ff}`);
campaigns = campaigns || [];
renderCampGrid();
} catch(e){ toast('Kampanyalar yüklenemedi: '+e.message,'err'); console.error(e); }
}

function renderCampGrid() {
const grid = document.getElementById('camp-grid');
if (!campaigns.length) {
grid.innerHTML = `<div style="color:var(--text-3);padding:32px;text-align:center;grid-column:1/-1;font-size:13px;">Henüz kampanya yok</div>`;
return;
}
grid.innerHTML = campaigns.map(c=>{
const qs = c.queues||[];
const tot= qs.reduce((s,q)=>s+(q.total_contacts||0),0);
const dia= qs.reduce((s,q)=>s+(q.dialed_count||0),0);
const pct= tot>0?Math.round(dia/tot*100):0;
const ags= c.agent_campaigns?.length||0;
const sb2= c.status==='active'
?'<span class="badge badge-green">Aktif</span>'
:c.status==='paused'
?'<span class="badge badge-yellow">Duraklatıldı</span>'
:'<span class="badge badge-gray">Tamamlandı</span>';
return `<div class="camp-card" onclick="openCampDetail('${c.id}')">
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
<div><div class="camp-name">${c.name}</div><div class="camp-did">${c.telnyx_did||'DID atanmadı'}</div></div>
<div style="display:flex;gap:4px;flex-shrink:0;" onclick="event.stopPropagation()">
${sb2}
<button class="icon-btn" onclick="openCampFieldSettings('${c.id}')" title="Alan Ayarları"><i class="ph ph-gear"></i></button>
<button class="icon-btn" onclick="deleteCampaign('${c.id}')" style="border-color:var(--red);color:var(--red);" title="Sil"><i class="ph ph-trash"></i></button>
</div>
</div>
<div class="camp-kpi">
<div class="camp-kpi-item"><div class="camp-kpi-val">${tot.toLocaleString()}</div><div class="camp-kpi-lbl">Toplam</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--accent);">${dia.toLocaleString()}</div><div class="camp-kpi-lbl">Aranan</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--text-2);">${ags}</div><div class="camp-kpi-lbl">Agent</div></div>
</div>
<div>
<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:4px;">
<span>İlerleme</span><span style="color:var(--accent);font-weight:700;font-family:var(--mono);">${pct}%</span>
</div>
<div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;"></div></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;">
<span style="font-size:12px;color:var(--text-3);">Hız: <strong style="color:var(--accent);font-family:var(--mono);">${c.dial_speed} hat</strong></span>
<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();toggleCampStatus('${c.id}','${c.status}')">
${c.status==='active'?'<i class="ph ph-pause"></i> Duraklat':'<i class="ph ph-play"></i> Başlat'}
</button>
</div>
</div>`;
}).join('');
}

function openCampDetail(id) {
currentCampId = id;
const c = campaigns.find(x=>x.id===id);
if (!c) return;
document.getElementById('camp-detail').style.display = 'block';
document.getElementById('cd-name').textContent = c.name;
document.getElementById('cd-did').textContent  = c.telnyx_did||'DID atanmadı';
document.getElementById('cd-speed').value = c.dial_speed;
document.getElementById('cd-speed-v').textContent = c.dial_speed;
const qs = c.queues||[];
document.getElementById('cd-queues').innerHTML = qs.length
? qs.map(q=>{
const dialed = q.dialed_count||0;
const total  = q.total_contacts||0;
const p = total>0 ? Math.round(dialed/total*100) : 0;
return `<div class="queue-row" style="gap:8px;">
<div class="queue-name" style="flex:1;">${q.name}</div>
<div class="queue-cnt" style="font-size:11px;color:var(--text-3);white-space:nowrap;">${dialed}/${total} <span style="color:var(--accent);">(${p}%)</span></div>
<div style="width:70px;"><div class="prog-wrap"><div class="prog-fill" style="width:${p}%;"></div></div></div>
<span class="badge ${q.status==='active'?'badge-green':'badge-gray'}">${q.status==='active'?'Aktif':'Durdu'}</span>
<button class="icon-btn" onclick="openRequeueModal('${q.id}','${q.name}')" title="Kuyruğu Yönet"><i class="ph ph-sliders"></i> Yönet</button>
</div>`;}).join('')
: `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">Kuyruk yok — yükle!</div>`;
const acs = c.agent_campaigns||[];
document.getElementById('cd-agents').innerHTML = acs.length
? acs.map(ac=>`<div class="agent-tag">
<div class="av">${(ac.agent_name||'?').charAt(0)}</div>
${ac.agent_name||ac.agent_id}
<button class="rm" onclick="removeAgent('${ac.agent_id}','${id}')"><i class="ph ph-x" style="font-size:10px;"></i></button>
</div>`).join('')
: `<span style="color:var(--text-3);font-size:12px;">Agent atanmadı</span>`;
document.getElementById('camp-detail').scrollIntoView({behavior:'smooth'});
switchCampTab('genel');
}

function closeCampDetail() {
document.getElementById('camp-detail').style.display='none'; currentCampId=null;
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
document.getElementById('nc-did').value = '';
document.getElementById('nc-desc').value = '';
document.getElementById('nc-speed').value = 1;
document.getElementById('nc-sv').textContent = '1';
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
<input class="form-input" value="${f.label}" style="flex:1;font-size:12px;padding:3px 7px;"
oninput="_ncFields[${i}].label=this.value;updateCampPreview()" placeholder="Alan adı">
<select class="form-input" style="width:85px;font-size:11px;padding:3px;"
onchange="_ncFields[${i}].type=this.value;updateCampPreview()">
<option value="text" ${f.type==='text'?'selected':''}>Metin</option>
<option value="number" ${f.type==='number'?'selected':''}>Sayı</option>
<option value="date" ${f.type==='date'?'selected':''}>Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''}>Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''}>Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''}>Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''}>Checkbox</option>
</select>
${f.locked
? '<i class="ph ph-lock-simple" style="font-size:13px;color:var(--text-3);"></i>'
: `<button onclick="ncRemoveField(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 2px;display:flex;align-items:center;"><i class="ph ph-x"></i></button>`
}
</div>`).join('');
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
const sampleVal = t => t==='number'?'123':t==='date'?'01.01.2024':t==='boolean'?'Evet':'Örnek veri';
el.innerHTML = `
<div style="font-size:13px;font-weight:800;padding:8px 10px;background:var(--accent);color:#fff;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
<i class="ph ph-phone"></i> +49 176 1234567
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
${visible.map(f=>`
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:5px;padding:5px 7px;">
<div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.4px;">${f.label}</div>
<div style="font-size:11px;font-weight:600;color:var(--text);margin-top:2px;">${sampleVal(f.type)}</div>
</div>`).join('')}
</div>`;
}

async function createCampaign() {
const name = document.getElementById('nc-name').value.trim();
const did  = document.getElementById('nc-did').value.trim();
const desc = document.getElementById('nc-desc').value.trim();
const spd  = parseInt(document.getElementById('nc-speed').value)||1;
if (!name) { toast('Kampanya adı gerekli','err'); return; }
const targetFirmId = (isSuperAdmin() ? document.getElementById('nc-firm-id')?.value : null) || getActiveFirmId() || currentUser?.firm_id;
if (!targetFirmId) { toast('Firma seçin veya yeniden giriş yapın','err'); return; }
const fieldConfig = {};
_ncFields.forEach(f => {
fieldConfig[f.key] = {show:f.show, label:f.label, type:f.type, locked:f.locked||false};
});
try {
await sb('campaigns', {
method:'POST', prefer:'return=representation',
body: JSON.stringify({
name, telnyx_did:did||null, description:desc||null,
dial_speed:spd, field_config:fieldConfig,
firm_id: targetFirmId, status:'active'
})
});
closeModal('m-new-camp');
toast('Kampanya oluşturuldu ✓','ok');
loadCampaigns();
} catch(e){ toast('Hata: '+e.message,'err'); console.error(e); }
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
try {
await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',body:JSON.stringify({dial_speed:parseInt(v)})});
toast(`Hız ${v} olarak kaydedildi`,'ok');
} catch(e){}
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
<input class="form-input" value="${f.label||''}" style="flex:1;font-size:12px;padding:3px 7px;"
oninput="_fsFields[${i}].label=this.value;updateFsPreview()" placeholder="Alan adı">
<select class="form-input" style="width:80px;font-size:11px;padding:3px;"
onchange="_fsFields[${i}].type=this.value;renderFsFieldList();updateFsPreview()">
<option value="text" ${f.type==='text'?'selected':''}>Metin</option>
<option value="number" ${f.type==='number'?'selected':''}>Sayı</option>
<option value="date" ${f.type==='date'?'selected':''}>Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''}>Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''}>Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''}>Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''}>Checkbox</option>
</select>
${f.locked?'<span style="font-size:10px;color:var(--text-3);">Kilitli</span>':''}
</div>${optHtml}
</div>`;
}).join('');
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
<div style="font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;">${f.label}</div>
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
toast('Alan ayarları kaydedildi ✓','ok');
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
try { tf = camp?.termin_form_config ? (typeof camp.termin_form_config==='string'?JSON.parse(camp.termin_form_config):camp.termin_form_config) : {}; } catch(e) {}
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
<input class="form-input" id="tf-lbl-${i}" value="${f.label}" style="flex:1;font-size:12px;padding:3px 7px;">
<select class="form-input" id="tf-type-${i}" style="width:80px;font-size:11px;padding:3px;">
<option value="text" ${f.type==='text'?'selected':''}>Metin</option>
<option value="number" ${f.type==='number'?'selected':''}>Sayı</option>
<option value="select" ${f.type==='select'?'selected':''}>Açılır Menü</option>
<option value="boolean" ${f.type==='boolean'?'selected':''}>Evet/Hayır</option>
</select>
<label style="font-size:11px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="tf-req-${i}" ${f.required?'checked':''}>Zorunlu</label>
</div>
${['select'].includes(f.type)?`<div style="padding:3px 10px 6px;"><input class="form-input" id="tf-opts-${i}" style="font-size:10px;padding:2px 6px;width:100%;" placeholder="Seçenekler (virgülle)" value="${f.opts||''}"></div>`:''}
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
  await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({termin_form_config:cfg})});
  toast('Termin form ayarları kaydedildi ✓','ok');
  loadCampaigns();
} catch(e) { toast('Hata: '+e.message,'err'); }
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
<div style="font-size:12px;font-weight:700;margin-bottom:8px;">Alan Listesi</div>
<div id="cd-fs-field-list" style="display:flex;flex-direction:column;gap:4px;"></div>
<button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="addFsField()">+ Özel Alan Ekle</button>
<button class="btn btn-primary btn-sm" style="margin-top:8px;margin-left:4px;" onclick="saveCampFieldSettings('${currentCampId}')"><i class="ph ph-floppy-disk"></i> Kaydet</button>
</div>
<div>
<div style="font-size:12px;font-weight:700;margin-bottom:8px;text-align:center;color:var(--text-3);">ÖNIZLEME</div>
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
<input class="form-input" value="${f.label||''}" style="flex:1;font-size:11px;padding:2px 6px;"
oninput="_fsFields[${i}].label=this.value;updateCdFsPreview()">
<select class="form-input" style="width:80px;font-size:10px;padding:2px;"
onchange="_fsFields[${i}].type=this.value;renderCdFsFieldList();updateCdFsPreview()">
<option value="text" ${f.type==='text'?'selected':''}>Metin</option>
<option value="number" ${f.type==='number'?'selected':''}>Sayı</option>
<option value="date" ${f.type==='date'?'selected':''}>Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''}>Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''}>Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''}>Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''}>Checkbox</option>
</select>
${f.locked?'<span style="font-size:9px;color:var(--text-3);">Kilitli</span>':`<button onclick="_fsFields.splice(${i},1);renderCdFsFieldList();updateCdFsPreview()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;">✕</button>`}
</div>${optHtml}
</div>`;
}).join('');
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
<div style="font-size:8px;color:var(--text-3);text-transform:uppercase;">${f.label}</div>
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
toast('Script kaydedildi ✓', 'ok');
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
}

async function saveCampAramaSettings() {
const s = {
auto_dial: getCheck('cd-auto-dial'),
agent_edit: getCheck('cd-agent-edit'),
appointment_slot_required: getCheck('cd-appointment-slot-required'),
recycle: getCheck('cd-recycle'),
recycle_delay: parseInt(getVal('cd-recycle-delay')||'60'),
cooldown: getCheck('cd-cooldown'),
cooldown_min: parseInt(getVal('cd-cooldown-min')||'30'),
precall_test: getCheck('cd-precall-test'),
};
await saveCampSettingsPatch(s);
toast('Arama ayarları kaydedildi ✓', 'ok');
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

function renderOutcomes(outcomes) {
const el = document.getElementById('cd-outcomes');
if (!el) return;
const cats = ['appointment','negative','callback','neutral'];
const catLabels = {appointment:'Başarılı', negative:'Negatif', callback:'Geri Ara', neutral:'Nötr'};
el.innerHTML = outcomes.map((o,i)=>`
<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg-2);border-radius:5px;">
<input type="checkbox" ${o.enabled?'checked':''} id="outcome-enabled-${i}">
<input class="form-input" value="${o.label}" id="outcome-label-${i}" style="flex:1;font-size:12px;padding:3px 7px;">
${o.key && ['appointment','negative','callback','no_answer','dnc','voicemail'].includes(o.key)
? `<span style="font-size:10px;color:var(--text-3);min-width:60px;">${o.key}</span>`
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
const auxCodes = [...document.querySelectorAll('[id^="aux-code-"]')].map(el=>el.value).filter(Boolean);
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
toast('QC ayarları kaydedildi ✓', 'ok');
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
toast('Bildirim ayarları kaydedildi ✓', 'ok');
}

async function saveCampWebhook() {
const url = getVal('cd-webhook-url');
await saveCampSettingsPatch({webhook_url: url});
toast('Webhook kaydedildi ✓', 'ok');
}

async function saveBroadcastTicker() {
const text = getVal('cd-ticker-text');
const enabled = getCheck('cd-ticker-enabled');
await saveCampSettingsPatch({ticker_enabled: enabled, ticker_text: text});
await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',prefer:'return=minimal',
body:JSON.stringify({notif_ts:Date.now(), notif_message:text, active_for_agents:true})});
toast('Kayan yazı yayınlandı ✓', 'ok');
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

// ── Kuyruk Yönetim Modalı ─────────────────────
async function openRequeueModal(queueId, queueName) {
  try {
    const [pending, no_answer, negative, callback_c, dnc] = await Promise.all([
      sb(`contacts?queue_id=eq.${queueId}&status=eq.pending&select=id`),
      sb(`contacts?queue_id=eq.${queueId}&status=eq.no_answer&select=id`),
      sb(`contacts?queue_id=eq.${queueId}&status=eq.negative&select=id`),
      sb(`contacts?queue_id=eq.${queueId}&status=eq.callback&select=id`),
      sb(`contacts?queue_id=eq.${queueId}&status=eq.dnc&select=id`),
    ]);
    const counts = {
      pending: (pending||[]).length,
      no_answer: (no_answer||[]).length,
      negative: (negative||[]).length,
      callback: (callback_c||[]).length,
      dnc: (dnc||[]).length,
    };
    document.getElementById('m-requeue')?.remove();
    const modal = document.createElement('div');
    modal.id = 'm-requeue'; modal.className = 'modal-overlay open';
    modal.innerHTML = `
<div class="modal" style="max-width:460px;">
<div class="modal-hdr">
<div class="modal-title"><i class="ph ph-arrows-clockwise"></i> Kuyruk Yönet — ${queueName}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
${Object.entries({pending:'Bekliyor',no_answer:'Cevap Yok',negative:'Olumsuz',callback:'Geri Ara',dnc:'Kara Liste'}).map(([k,l])=>`
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
<span style="font-size:12px;color:var(--text-2);">${l}</span>
<span style="font-size:18px;font-weight:800;font-family:var(--mono);">${counts[k]}</span>
</div>`).join('')}
</div>
<div style="font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:8px;">Tekrar Kuyruğa Al:</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${['no_answer','negative','callback'].map(k=>`
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-${k}" style="width:15px;height:15px;">
<span style="font-size:12px;">${{no_answer:'Cevap Yok',negative:'Olumsuz',callback:'Geri Ara'}[k]} <span style="color:var(--text-3);">(${counts[k]} kişi)</span></span>
</label>`).join('')}
</div>
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;margin-top:8px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-reset-attempts" style="width:15px;height:15px;">
<span style="font-size:12px;">Deneme sayılarını sıfırla</span>
</label>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">İptal</button>
<button class="btn btn-primary" onclick="doRequeue('${queueId}')">
<i class="ph ph-arrows-clockwise"></i> Kuyruğa Al
</button>
</div>
</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) { toast('Kuyruk yüklenemedi: ' + e.message, 'err'); }
}

async function doRequeue(queueId) {
  const statuses = ['no_answer','negative','callback'].filter(s => document.getElementById('rq-'+s)?.checked);
  if (!statuses.length) { toast('En az bir durum seçin','warn'); return; }
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
    const notPending = await sb(`contacts?queue_id=eq.${queueId}&status=neq.pending&select=id`);
    const dialedCount = (notPending||[]).length;
    await sb(`queues?id=eq.${queueId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ dialed_count: dialedCount })
    }).catch(()=>{});
    document.getElementById('m-requeue')?.remove();
    toast(`Kuyruğa alındı ✓ (${statuses.length} durum)`, 'ok');
    if (currentCampId) { loadCampaigns(); setTimeout(()=>openCampDetail(currentCampId), 400); }
  } catch(e) { toast('Hata: ' + e.message, 'err'); }
}
