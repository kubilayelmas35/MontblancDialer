// ─────────────────────────────────────────────
// CONTACTS — kişi yönetimi ve kuyruk yükleme
// ─────────────────────────────────────────────

// ── Upload Queue ──────────────────────────────
function handleFileSelect(e) { if (e.target.files[0]) setFile(e.target.files[0]); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uq-area').classList.remove('drag');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
}

async function setFile(f) {
  uploadFile = f;
  document.getElementById('uq-fname').textContent = `✓ ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
  try {
    const isXlsx = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls');
    if (isXlsx) {
      const buf = await f.arrayBuffer();
      const wb  = XLSX.read(buf, { type:'array', cellText:true, cellDates:false });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
      if (!raw.length) { toast('Excel boş!','err'); return; }
      uploadHeaders    = raw[0].map(h => String(h).trim().toLowerCase().replace(/["\r]/g,'').replace(/\s+/g,'_'));
      uploadParsedRows = raw.slice(1).filter(r => r.some(c => String(c).trim())).map(r => r.map(c => String(c).trim()));
    } else {
      const text = await f.text();
      const sep  = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
      const allRows = text.trim().split('\n').map(r => r.split(sep));
      uploadHeaders    = allRows[0].map(h => h.trim().toLowerCase().replace(/["\r]/g,''));
      uploadParsedRows = allRows.slice(1).filter(r => r.some(c => c.trim())).map(r => r.map(c => c.trim().replace(/["\r]/g,'')));
    }
    document.getElementById('uq-row-count').textContent = uploadParsedRows.length.toLocaleString();
    document.getElementById('uq-mapping-section').style.display = '';
    renderColumnMapping();
  } catch(e) {
    console.error('Dosya parse hatası:', e);
    toast('Dosya okunamadı: ' + e.message, 'err');
  }
}

function renderColumnMapping() {
  const grid = document.getElementById('uq-mapping-grid');
  grid.innerHTML = UQ_TARGET_FIELDS.map(field => {
    const autoKeywords = UQ_AUTO_MAP[field.key] || [];
    let autoMatch = '';
    for (const kw of autoKeywords) {
      const found = uploadHeaders.find(h => h === kw || h.includes(kw));
      if (found) { autoMatch = found; break; }
    }
    const options = uploadHeaders.map(h =>
      `<option value="${h}" ${h === autoMatch ? 'selected' : ''}>${h}</option>`
    ).join('');
    return `<div>
<div class="form-label" style="margin-bottom:4px;">${field.label}</div>
<select class="form-input" id="uq-map-${field.key}" onchange="updateUploadPreview()">
<option value="${field.required ? '— Seç (Zorunlu) —' : '— Kullanma —'}"></option>
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
  rows.innerHTML = sample.map((row) => {
    const mapped = {};
    UQ_TARGET_FIELDS.forEach(f => {
      const sel = document.getElementById(`uq-map-${f.key}`)?.value;
      if (sel) {
        const idx = uploadHeaders.indexOf(sel);
        if (idx >= 0) mapped[f.key] = (row[idx]||'').trim().replace(/["\r]/g,'');
      }
    });
    return `<div style="background:var(--bg-2);border-radius:4px;padding:5px 8px;margin-bottom:4px;font-size:10px;display:flex;gap:8px;flex-wrap:wrap;">
${Object.entries(mapped).filter(([,v])=>v).map(([k,v])=>`<span><b style="color:var(--accent)">${k}:</b> ${v}</span>`).join(' · ')}
</div>`;
  }).join('');
}

function getUploadMapping() {
  const map = {};
  UQ_TARGET_FIELDS.forEach(f => {
    const sel = document.getElementById(`uq-map-${f.key}`)?.value;
    if (sel) map[f.key] = uploadHeaders.indexOf(sel);
  });
  return map;
}

function getDedupMode() {
  const sel = document.querySelector('input[name="dedup-mode"]:checked');
  return sel?.value || 'excel';
}

async function uploadQueue() {
  const name = document.getElementById('uq-name').value.trim();
  if (!name)          { toast('Kuyruk adı gerekli','err'); return; }
  if (!uploadFile)    { toast('Dosya seçin','err'); return; }
  if (!currentCampId) { toast('Önce kampanya seçin','err'); return; }
  let contacts;
  if (uploadParsedRows.length && uploadHeaders.length) {
    const mapping = getUploadMapping();
    if (!mapping.phone && mapping.phone !== 0) { toast('Telefon sütunu seçilmedi!','err'); return; }
    contacts = uploadParsedRows.map(row => {
      const get = (key) => {
        const idx = mapping[key];
        return (idx !== undefined && idx >= 0) ? (row[idx]||'').trim().replace(/["\r]/g,'') : '';
      };
      return {
        queue_id:'__PH__', campaign_id:currentCampId,
        phone: get('phone'), phone2: get('phone2'),
        first_name: get('first_name'), last_name: get('last_name'),
        city: get('city'), plz: get('plz'), address: get('address'),
      };
    }).filter(c => c.phone);
  } else {
    const text = await uploadFile.text();
    const rows = text.trim().split('\n').map(r=>r.split(/[,;]/));
    const hdrs = rows[0].map(h=>h.trim().toLowerCase().replace(/["\r]/g,''));
    contacts = rows.slice(1).filter(r=>r.some(c=>c.trim())).map(row=>{
      const o={};
      hdrs.forEach((h,i)=>{ o[h]=(row[i]||'').trim().replace(/["\r]/g,''); });
      return {
        queue_id:'__PH__', campaign_id:currentCampId,
        phone:o.phone||o.telefon||o.tel||o[hdrs[0]]||'',
        phone2:o.phone2||o.telefon2||'',
        first_name:o.first_name||o.vorname||o.ad||'',
        last_name:o.last_name||o.nachname||o.soyad||'',
        city:o.city||o.ort||'', plz:o.plz||o.zip||'',
        address:o.address||o.strasse||'',
      };
    }).filter(c=>c.phone);
  }
  if (!contacts.length) { toast('Geçerli numara bulunamadı!','err'); return; }

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
    const queueRes = await sb('queues', {
      method:'POST', prefer: 'return=representation',
      body: JSON.stringify({ campaign_id:currentCampId, name, total_contacts:contacts.length })
    });
    let queue = Array.isArray(queueRes) ? queueRes[0] : queueRes;
    if (!queue?.id) {
      const found = await sb(`queues?campaign_id=eq.${currentCampId}&name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`);
      queue = Array.isArray(found) ? found[0] : found;
    }
    if (!queue?.id) throw new Error('Kuyruk oluşturulamadı — ID alınamadı');
    const withQ = contacts.map(c=>({...c, queue_id:queue.id}));
    const batchSize = 500;
    const totalBatches = Math.ceil(withQ.length / batchSize);
    for (let i=0; i<withQ.length; i+=batchSize) {
      const batchNum = Math.floor(i/batchSize) + 1;
      const uploaded = Math.min(i+batchSize, withQ.length);
      const pct = Math.round(5 + (i/withQ.length)*90);
      setProgress(pct, `Yükleniyor... (${batchNum}/${totalBatches} batch)`, `${uploaded.toLocaleString()} / ${withQ.length.toLocaleString()} kişi`);
      await sb('contacts', { method:'POST', body: JSON.stringify(withQ.slice(i, i+batchSize)), prefer:'return=minimal' });
    }
    setProgress(100, '✅ Tamamlandı!', `${contacts.length.toLocaleString()} kişi başarıyla yüklendi`);
    await new Promise(r => setTimeout(r, 800));
    closeModal('m-upload-q');
    uploadFile = null; uploadParsedRows = []; uploadHeaders = [];
    document.getElementById('uq-fname').textContent = '.xlsx, .csv — maks. 50.000 satır';
    document.getElementById('uq-name').value = '';
    document.getElementById('uq-mapping-section').style.display = 'none';
    progressSection.style.display = 'none';
    submitBtn.disabled = false;
    toast(`✅ ${contacts.length.toLocaleString()} kişi yüklendi`, 'ok');
    loadCampaigns();
    setTimeout(()=>openCampDetail(currentCampId), 400);
  } catch(e) {
    setProgress(0, '❌ Hata!', e.message);
    submitBtn.disabled = false;
    toast('Yükleme hatası: ' + e.message, 'err');
  }
}

// ── Contact manipulation ──────────────────────
async function getNextContact(campaignIds = null) {
  // Aktif kampanya listesini kullan (yoksa selectedCampId ile fallback)
  const ids = Array.isArray(campaignIds)
    ? campaignIds
    : (typeof _activeCampIds !== 'undefined' && _activeCampIds.length)
      ? _activeCampIds
      : [];
  if (!ids.length) return null;
  try {
    const campFilter = ids.length === 1
      ? `campaign_id=eq.${ids[0]}`
      : `campaign_id=in.(${ids.join(',')})`;
    const nowIso = new Date().toISOString();

    // Önce bekleyen / cevap yok / vakti gelen geri aramalar
    const contacts = await sb(
      `contacts?${campFilter}` +
      `&status=in.(pending,no_answer,callback)` +
      `&or=(callback_at.is.null,callback_at.lte.${nowIso})` +
      `&order=last_called_at.asc.nullsfirst` +
      `&limit=1&select=*,queues(name,status)`
    );
    if (!contacts?.length) return null;
    const c = contacts[0];
    if (c.queues?.status !== 'active') return null;
    return c;
  } catch(e) { console.error(e); return null; }
}

function showCustomerCard(c) {
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
  document.getElementById('cust-empty').style.display='none';
  document.getElementById('cust-data').style.display='';
  showPrevCallInfo(c);
  showCampScript(c);
  const camp = campaigns.find(x=>x.id===c.campaign_id);
  let fc = {};
  try { fc = camp?.field_config ? JSON.parse(camp.field_config) : {}; } catch(e) {}
  const show = (key, def=true) => fc[key] !== undefined ? fc[key] : def;
  const name = show('name') ? `${c.first_name||''} ${c.last_name||''}`.trim()||c.phone : c.phone;
  const avEl = document.getElementById('cust-av');
  const avLetter = (c.first_name||c.phone||'?').charAt(0).toUpperCase();
  const avInner = avEl?.querySelector('.cust-av-inner');
  if (avInner) avInner.textContent = avLetter;
  else if (avEl) avEl.textContent = avLetter;
  document.getElementById('cust-name').textContent  = name;
  document.getElementById('cust-phone').textContent = c.phone;
  document.getElementById('cust-attempt-badge').style.display = show('attempt') ? '' : 'none';
  document.getElementById('cust-attempt-badge').textContent = `${c.attempt_count||1}. arama`;
  document.getElementById('cust-camp-badge').textContent  = camp?.name||'—';
  document.getElementById('cust-queue-badge').textContent = c.queues?.name||c.queue_name||'—';
  const allFields = [
    { key:'plz',     l:'PLZ',                                      v:c.plz,    mono:true },
    { key:'city',    l:currentLang==='tr'?'Şehir':'Stadt',          v:c.city },
    { key:'address', l:currentLang==='tr'?'Adres':'Adresse',        v:c.address },
    { key:'phone2',  l:currentLang==='tr'?'2. Telefon':'2. Tel',    v:c.phone2 },
    { key:'notes',   l:currentLang==='tr'?'Not':'Notiz',            v:c.notes },
  ];
  const terminFields = [
    { key:'hausart',             l:'Ev Tipi',      v:c.hausart,             type:'select', opts:['','Einfamilienhaus','Zweifamilienhaus','Reihenhaus','Doppelhaus','Mehrfamilienhaus'], required:true },
    { key:'baujahr',             l:'Yapım Yılı',   v:c.baujahr,             required:true },
    { key:'qm',                  l:'m²',           v:c.qm,                  required:true },
    { key:'heizung',             l:'Isıtma',       v:c.heizung,             type:'select', opts:['','Gas','Öl','Pellet','WP','Fernwärme'], required:true },
    { key:'alter_der_heizung',   l:'Isıtma Yaşı', v:c.alter_der_heizung,   required:true },
    { key:'verbrauch_pro_jahr',  l:'Tüketim/Yıl', v:c.verbrauch_pro_jahr },
    { key:'personen',            l:'Kişi Sayısı', v:c.personen },
  ];
  const visibleFields = allFields.filter(f => show(f.key));
  document.getElementById('cust-fields').innerHTML = visibleFields.map(f=>{
    const canCallSecondary = f.key === 'phone2' && String(f.v || '').trim().length > 0;
    const quickCallBtn = canCallSecondary
      ? `<button type="button" onclick="callSecondaryPhone()"
style="flex-shrink:0;background:var(--accent-soft);border:1px solid var(--accent);cursor:pointer;color:var(--accent);padding:4px 7px;border-radius:6px;transition:.15s;font-size:11px;font-weight:700;"
title="2. numarayı ara"
onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
onmouseout="this.style.background='var(--accent-soft)';this.style.color='var(--accent)'">
<i class="ph ph-phone-call" style="font-size:12px;vertical-align:-1px;"></i>
</button>`
      : '';
    return `
<div class="cust-field" style="position:relative;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
<div class="cust-field-lbl" style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${f.l}</div>
<div style="display:flex;align-items:center;gap:6px;">
<div class="cust-field-val${f.mono?' mono':''}" id="cval-${f.key}"
style="flex:1;font-size:14px;font-weight:600;cursor:pointer;min-height:20px;"
onclick="copyToClipboard('${(f.v||'').replace(/'/g,"\\'")}','${f.l} kopyalandı')"
title="Kopyala (tıkla) — düzenlemek için kalem ikonuna bas">${f.v||'—'}</div>
${quickCallBtn}
<button onclick="startFieldEdit('${f.key}','${f.l}',this)"
style="flex-shrink:0;background:transparent;border:none;cursor:pointer;color:var(--text-3);padding:2px;border-radius:4px;opacity:.6;transition:.15s;"
title="Düzenle"
onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
onmouseout="this.style.opacity='.6';this.style.color='var(--text-3)'">
<i class="ph ph-pencil-simple" style="font-size:14px;"></i>
</button>
</div>
</div>`;
  }).join('');
  const terminContainer = document.getElementById('termin-fields-section') || (() => {
    const el = document.createElement('div');
    el.id = 'termin-fields-section';
    el.style.cssText = 'margin-top:12px;padding-top:12px;border-top:2px dashed var(--accent);display:none;';
    document.getElementById('cust-fields')?.after(el);
    return el;
  })();
  // Default hidden — only show when slot selected
  if (!window._selectedBookingSlot) terminContainer.style.display = 'none';
  terminContainer.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<div style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:5px;" class="termin-slot-hdr">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Termin Bilgileri
</div>
<span id="termin-slot-badge" style="font-size:9px;color:var(--text-3);background:var(--bg-3);border:1px solid var(--border);border-radius:4px;padding:2px 6px;">Slot seçilmedi</span>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
${terminFields.map(f => `
<div style="background:var(--bg-3);border:1px solid ${f.required?'rgba(37,99,235,.3)':'var(--border)'};border-radius:8px;padding:7px 10px;">
<div style="font-size:10px;font-weight:700;color:${f.required?'var(--accent-text)':'var(--text-3)'};text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">
${f.l}${f.required?'<span style="color:var(--red);margin-left:2px;">*</span>':''}
</div>
${f.type==='select'
? `<select id="tf2-${f.key}" class="form-input" style="font-size:12px;padding:2px 6px;height:26px;" onchange="updateTerminField('${f.key}',this.value)">
${f.opts.map(o=>`<option value="${o}" ${o===f.v?'selected':''}>${o||'Seçin...'}</option>`).join('')}
</select>`
: `<input id="tf2-${f.key}" class="form-input" style="font-size:12px;padding:2px 6px;height:26px;"
value="${f.v||''}" placeholder="${f.l}..."
oninput="updateTerminField('${f.key}',this.value)">`
}
</div>`).join('')}
</div>
<div id="tf2-customer-wrap" style="margin-top:8px;"></div>
<div id="tf-note-row" style="margin-top:8px;">
<label style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;">Not</label>
<textarea id="tf2-note" class="form-input" rows="2" style="font-size:12px;resize:vertical;margin-top:3px;" placeholder="Agent notu..."></textarea>
</div>
<button onclick="saveTerminFromSection()" style="margin-top:8px;width:100%;padding:8px;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--accent)));color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;">
Termini Kaydet
</button>`;
  if (typeof renderInlineTerminCustomerField === 'function') {
    renderInlineTerminCustomerField();
  }
  const nameEl = document.getElementById('cust-name');
  if (nameEl) {
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    nameEl.innerHTML = `<span>${_escHtml(name || '—')}</span><button onclick="startCustomerNameEdit(this)" style="margin-left:6px;background:transparent;border:none;cursor:pointer;color:var(--text-3);vertical-align:middle;" title="İsim düzenle"><i class="ph ph-pencil-simple"></i></button>`;
    nameEl.style.cursor = 'default';
    nameEl.title = fullName ? '' : 'İsim yok';
    nameEl.onclick = null;
  }
  const phoneEl = document.getElementById('cust-phone');
  if (phoneEl) { phoneEl.style.cursor='pointer'; phoneEl.title='Kopyala'; phoneEl.onclick=()=>copyToClipboard(phoneEl.textContent,'Telefon kopyalandı'); }
  if (typeof dialerStatus === 'undefined' || dialerStatus !== 'wrapping') {
    if (typeof switchContactTab === 'function') switchContactTab('info');
  }
  if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
}

function markContactDirty() {
  const saveBtn = document.getElementById('cust-save-btn');
  if (saveBtn) saveBtn.style.display = '';
}

async function saveContactEdits() {
  if (!currentContact?.id) return;
  const updates = {};
  const fieldMap = {plz:'plz',city:'city',address:'address',phone2:'phone2',notes:'notes'};
  Object.entries(fieldMap).forEach(([key]) => {
    const el = document.getElementById('cedit-'+key);
    if (el) updates[key] = el.value.trim();
  });
  try {
    await sb(`contacts?id=eq.${currentContact.id}`,{
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify(updates)
    });
    Object.assign(currentContact, updates);
    const saveBtn = document.getElementById('cust-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    toast('Müşteri bilgileri güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function clearCustomerCard() {
  document.getElementById('cust-empty').style.display='';
  document.getElementById('cust-data').style.display='none';
  if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
  if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
}

function switchContactTab(tab) {
  ['info','map','history','file','outcome'].forEach(t => {
    const btn   = document.getElementById('ctab-'+t);
    const panel = document.getElementById('ctab-'+t+'-panel');
    if (btn) { btn.style.background=t===tab?'var(--accent)':'transparent'; btn.style.color=t===tab?'#fff':'var(--text-2)'; }
    if (panel) panel.style.display=t===tab?'':'none';
  });
  if (tab==='map' && currentContact) showContactMap(currentContact.address, currentContact.plz, currentContact.city);
  if (tab==='history' && currentContact) loadContactHistory(currentContact.id);
  if (tab==='file' && currentContact) updateContactFileHint();
}

function _escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function startCustomerNameEdit(btnEl) {
  if (!currentContact?.id) return;
  const nameEl = document.getElementById('cust-name');
  if (!nameEl) return;
  const curFirst = currentContact.first_name || '';
  const curLast = currentContact.last_name || '';
  nameEl.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
    <input id="cust-edit-first" class="form-input" style="max-width:140px;height:28px;padding:4px 8px;font-size:12px;" value="${_escHtml(curFirst)}" placeholder="Ad">
    <input id="cust-edit-last" class="form-input" style="max-width:160px;height:28px;padding:4px 8px;font-size:12px;" value="${_escHtml(curLast)}" placeholder="Soyad">
    <button onclick="saveCustomerNameEdit()" style="background:transparent;border:none;color:var(--green);cursor:pointer;" title="Kaydet"><i class="ph ph-check"></i></button>
    <button onclick="showCustomerCard(currentContact)" style="background:transparent;border:none;color:var(--text-3);cursor:pointer;" title="İptal"><i class="ph ph-x"></i></button>
  </div>`;
}

async function saveCustomerNameEdit() {
  if (!currentContact?.id) return;
  const first = document.getElementById('cust-edit-first')?.value?.trim() || '';
  const last = document.getElementById('cust-edit-last')?.value?.trim() || '';
  try {
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ first_name: first, last_name: last })
    });
    currentContact.first_name = first;
    currentContact.last_name = last;
    showCustomerCard(currentContact);
    toast('İsim güncellendi', 'ok');
  } catch (e) {
    toast('İsim güncellenemedi: ' + e.message, 'err');
  }
}

async function _getLatestAppointmentForContact(contactId) {
  if (!contactId) return null;
  try {
    const rows = await sb(`appointments?contact_id=eq.${contactId}&select=*&order=created_at.desc&limit=1`);
    return rows?.[0] || null;
  } catch (e) {
    return null;
  }
}

async function updateContactFileHint() {
  const hint = document.getElementById('contact-file-hint');
  if (!hint || !currentContact?.id) return;
  const appt = await _getLatestAppointmentForContact(currentContact.id);
  if (!appt) {
    hint.textContent = 'Henüz randevu bulunamadı. Müşteri ve çağrı bilgileri indirilecek.';
    return;
  }
  hint.textContent = `Son randevu: ${new Date(appt.created_at || Date.now()).toLocaleString('tr-TR')} · Durum: ${appt.durum || '—'}`;
}

async function _buildContactExportRows() {
  if (!currentContact) return [];
  const appt = await _getLatestAppointmentForContact(currentContact.id);
  return [{
    ad_soyad: `${currentContact.first_name || ''} ${currentContact.last_name || ''}`.trim() || '—',
    telefon: currentContact.phone || '—',
    plz: currentContact.plz || '—',
    sehir: currentContact.city || '—',
    adres: currentContact.address || '—',
    kampanya: campaigns.find((x) => x.id === currentContact.campaign_id)?.name || currentContact.campaign_id || '—',
    randevu_durum: appt?.durum || '—',
    randevu_tarih: appt?.tarih || '—',
    randevu_saat: appt?.saat || '—',
    not: appt?.notiz || currentContact.notes || '—'
  }];
}

async function downloadContactAppointmentExcel() {
  const rows = await _buildContactExportRows();
  if (!rows.length || typeof XLSX === 'undefined') {
    toast('Excel için veri/kütüphane bulunamadı', 'err');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Randevu');
  const slug = (rows[0].ad_soyad || 'musteri').replace(/[^\w]+/g, '_');
  XLSX.writeFile(wb, `randevu_${slug}.xlsx`);
}

async function downloadContactAppointmentPdf() {
  const rows = await _buildContactExportRows();
  if (!rows.length || !window.jspdf?.jsPDF) {
    toast('PDF kütüphanesi bulunamadı', 'err');
    return;
  }
  const r = rows[0];
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14);
  doc.text('Randevu Bilgileri', 14, 16);
  doc.setFontSize(10);
  let y = 28;
  Object.entries(r).forEach(([k, v]) => {
    doc.text(`${k}: ${String(v || '—')}`, 14, y);
    y += 8;
  });
  const slug = (r.ad_soyad || 'musteri').replace(/[^\w]+/g, '_');
  doc.save(`randevu_${slug}.pdf`);
}

async function loadContactHistory(contactId) {
  if (!contactId) return;
  const el = document.getElementById('contact-history-list');
  if (!el) return;
  try {
    const logs = await sb(`call_logs?contact_id=eq.${contactId}&select=*&order=started_at.desc&limit=10`);
    if (!logs?.length) { el.innerHTML='<div style="color:var(--text-3);padding:12px;text-align:center;">Önceki arama yok</div>'; return; }
    el.innerHTML = logs.map(l=>`
<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
<div>
<div style="font-weight:700;font-size:11px;">${new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
${l.notes?`<div style="font-size:11px;color:var(--text-3);">${l.notes}</div>`:''}
${_isFakeRecordingRow(l) ? _fakeRecordingMarkup(l, 'history') : ''}
</div>
<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--bg-3);">${l.outcome||'—'}</span>
</div>`).join('');
  } catch(e) { el.innerHTML='Hata'; }
}

function _isFakeRecordingRow(log) {
  return !!(_testMode && !String(log?.recording_url || '').trim() && Number(log?.duration_sec || 0) >= 8);
}

function _formatMMSS(totalSec) {
  const n = Math.max(0, Number(totalSec) || 0);
  const mm = Math.floor(n / 60);
  const ss = Math.floor(n % 60);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

let _simRecTimer = null;
let _simRecState = { key: '', sec: 0, dur: 0 };

function _stopSimRec() {
  if (_simRecTimer) clearInterval(_simRecTimer);
  _simRecTimer = null;
  _simRecState = { key: '', sec: 0, dur: 0 };
  const all = document.querySelectorAll('.sim-rec-wrap');
  all.forEach((wrap) => {
    const btn = wrap.querySelector('.sim-rec-btn');
    const fill = wrap.querySelector('.sim-rec-fill');
    const time = wrap.querySelector('.sim-rec-time');
    const dur = Number(wrap.getAttribute('data-dur') || 0);
    if (btn) btn.textContent = '▶';
    if (fill) fill.style.width = '0%';
    if (time) time.textContent = `00:00 / ${_formatMMSS(dur)}`;
  });
}

function toggleFakeRecording(key, durSec) {
  const wrap = document.querySelector(`.sim-rec-wrap[data-key="${String(key).replace(/"/g, '\\"')}"]`);
  if (!wrap) return;
  const btn = wrap.querySelector('.sim-rec-btn');
  const fill = wrap.querySelector('.sim-rec-fill');
  const time = wrap.querySelector('.sim-rec-time');
  const dur = Math.max(1, Number(durSec) || 1);
  if (_simRecState.key === key && _simRecTimer) {
    _stopSimRec();
    return;
  }
  _stopSimRec();
  _simRecState = { key, sec: 0, dur };
  if (btn) btn.textContent = '⏸';
  _simRecTimer = setInterval(() => {
    _simRecState.sec += 1;
    const pct = Math.min(100, (_simRecState.sec / dur) * 100);
    if (fill) fill.style.width = `${pct}%`;
    if (time) time.textContent = `${_formatMMSS(_simRecState.sec)} / ${_formatMMSS(dur)}`;
    if (_simRecState.sec >= dur) _stopSimRec();
  }, 1000);
}

function _fakeRecordingMarkup(log, scopeKey) {
  const dur = Math.max(8, Number(log?.duration_sec || 0));
  const key = `${scopeKey}-${log?.id || log?.started_at || Math.random().toString(16).slice(2)}`;
  return `<div class="sim-rec-wrap" data-key="${_escHtml(key)}" data-dur="${dur}" style="margin-top:6px;">
<div style="display:flex;align-items:center;gap:6px;">
  <button type="button" class="sim-rec-btn" onclick="toggleFakeRecording('${key}',${dur})"
    style="border:1px solid var(--border);background:var(--bg-3);border-radius:6px;padding:2px 8px;cursor:pointer;">▶</button>
  <span class="sim-rec-time" style="font-size:11px;color:var(--text-2);font-family:var(--mono);">00:00 / ${_formatMMSS(dur)}</span>
  <span style="font-size:10px;color:var(--yellow);font-weight:700;">TEST KAYIT</span>
</div>
<div style="height:4px;background:var(--bg-3);border-radius:999px;overflow:hidden;margin-top:4px;">
  <div class="sim-rec-fill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent),var(--accent-2,var(--accent)));"></div>
</div>
</div>`;
}

function toggleAudio(logId) {
  const aud = document.getElementById('aud-'+logId) || document.getElementById('ch-aud-'+logId);
  const btn = document.querySelector(`button[onclick*="toggleAudio('${logId}')"]`);
  if (!aud) return;
  if (_currentAudio && _currentAudio !== aud) {
    _currentAudio.pause(); _currentAudio.currentTime = 0;
    if (_currentAudioBtn) _currentAudioBtn.textContent = '▶';
  }
  if (aud.paused) {
    aud.play();
    if (btn) btn.textContent = '⏸';
    _currentAudio = aud; _currentAudioBtn = btn;
    aud.ontimeupdate = () => {
      const pct = aud.duration ? (aud.currentTime/aud.duration*100).toFixed(0) : 0;
      if (btn) btn.title = `${pct}%`;
    };
    aud.onended = () => { if (btn) btn.textContent = '▶'; _currentAudio = null; };
  } else {
    aud.pause(); if (btn) btn.textContent = '▶'; _currentAudio = null;
  }
}

async function addToDnc(phone, contactId) {
  if (!phone) return;
  try {
    await sb(`contacts?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({status: 'dnc', locked_by: null})
    });
    await sb('call_logs', {method:'POST', prefer:'return=minimal',
      body: JSON.stringify({
        contact_id: contactId, agent_id: currentUser.id,
        campaign_id: selectedCampId, firm_id: currentUser.firm_id,
        phone, outcome: 'dnc',
        started_at: new Date().toISOString(), ended_at: new Date().toISOString()
      })
    });
    toast('🚫 Numara kara listeye eklendi', 'ok');
  } catch(e) { console.error('DNC error:', e); }
}

async function deduplicateContacts(contacts, mode, campaignId) {
  const phones = contacts.map(c => c.phone).filter(Boolean);
  if (!phones.length) return contacts;
  let existingPhones = new Set();
  const excelDups = new Set();
  const seen = new Set();
  phones.forEach(p => { if (seen.has(p)) excelDups.add(p); seen.add(p); });
  existingPhones = new Set([...excelDups]);
  if (mode === 'campaign' || mode === 'system') {
    const firmFilter = mode === 'system' ? '' : `&campaign_id=eq.${campaignId}`;
    const chunkSize = 100;
    for (let i = 0; i < phones.length; i += chunkSize) {
      const chunk = phones.slice(i, i+chunkSize);
      const query = `contacts?phone=in.(${chunk.map(p=>`"${p}"`).join(',')})&select=phone${firmFilter}`;
      try {
        const existing = await sb(query) || [];
        existing.forEach(e => existingPhones.add(e.phone));
      } catch(e) {}
    }
  }
  const filtered = contacts.filter(c => !existingPhones.has(c.phone));
  const dupCount = contacts.length - filtered.length;
  return { filtered, dupCount, existingPhones };
}

// ── Inline field edit ─────────────────────────
function startFieldEdit(fieldKey, fieldLabel, btnEl) {
  const valEl = document.getElementById('cval-' + fieldKey);
  if (!valEl) return;
  const parent = valEl.parentElement;
  const currentVal = valEl.textContent === '—' ? '' : valEl.textContent;
  const input = document.createElement('input');
  input.className = 'form-input';
  input.value = currentVal;
  input.style.cssText = 'flex:1;font-size:13px;padding:3px 8px;height:28px;';
  input.placeholder = fieldLabel + '...';
  valEl.style.display = 'none';
  parent.insertBefore(input, valEl);
  input.focus(); input.select();
  btnEl.innerHTML = '<i class="ph ph-check" style="font-size:14px;"></i>';
  btnEl.title = 'Kaydet'; btnEl.style.color = 'var(--green)'; btnEl.style.opacity = '1';
  btnEl.onclick = () => saveFieldEdit(fieldKey, fieldLabel, input, valEl, btnEl);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveFieldEdit(fieldKey, fieldLabel, input, valEl, btnEl);
    if (e.key === 'Escape') cancelFieldEdit(fieldKey, input, valEl, btnEl);
  };
}

async function saveFieldEdit(fieldKey, fieldLabel, inputEl, valEl, btnEl) {
  const newVal = inputEl.value.trim();
  if (!currentContact?.id) { cancelFieldEdit(fieldKey, inputEl, valEl, btnEl); return; }
  try {
    const updateData = {};
    if (fieldKey === 'plz') updateData.plz = newVal;
    else if (fieldKey === 'city') updateData.city = newVal;
    else if (fieldKey === 'address') updateData.address = newVal;
    else if (fieldKey === 'phone2') updateData.phone2 = newVal;
    else if (fieldKey === 'notes') updateData.notes = newVal;
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify(updateData)
    });
    currentContact[fieldKey] = newVal;
    valEl.textContent = newVal || '—';
    inputEl.remove(); valEl.style.display = '';
    btnEl.innerHTML = '<i class="ph ph-pencil-simple" style="font-size:14px;"></i>';
    btnEl.title = 'Düzenle'; btnEl.style.color = 'var(--text-3)'; btnEl.style.opacity = '.6';
    btnEl.onclick = () => startFieldEdit(fieldKey, fieldLabel, btnEl);
    toast(`${fieldLabel} güncellendi ✓`, 'ok', 1500);
  } catch(e) {
    toast('Güncelleme hatası: ' + e.message, 'err');
    cancelFieldEdit(fieldKey, inputEl, valEl, btnEl);
  }
}

function cancelFieldEdit(fieldKey, inputEl, valEl, btnEl) {
  inputEl.remove(); valEl.style.display = '';
  btnEl.innerHTML = '<i class="ph ph-pencil-simple" style="font-size:14px;"></i>';
  btnEl.title = 'Düzenle'; btnEl.style.color = 'var(--text-3)'; btnEl.style.opacity = '.6';
  btnEl.onclick = () => startFieldEdit(fieldKey, '', btnEl);
}

async function showPrevCallInfo(contact) {
  const el = document.getElementById('prev-call-info');
  const body = document.getElementById('prev-call-body');
  if (!el || !body) return;
  if (!contact || (contact.attempt_count || 0) < 1) { el.style.display = 'none'; return; }
  try {
    const logs = await sb(`call_logs?contact_id=eq.${contact.id}&order=started_at.desc&limit=10&select=id,outcome,notes,started_at,duration_sec,recording_url,agent_id,users(name)`);
    if (!logs?.length) { el.style.display = 'none'; return; }
    const prev = logs[0];
    const recLog = logs.find((l) => String(l?.recording_url || '').trim());
    const dt = new Date(prev.started_at).toLocaleString('tr-TR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const outcomeMap = {appointment:'Termin',negative:'Olumsuz',callback:'Geri Ara',no_answer:'Cevap Yok',dnc:'Kara Liste'};
    const rawAgent = prev?.users?.name || '';
    const own = !!currentUser?.id && prev?.agent_id === currentUser.id;
    const agentLabel = own
      ? `Sen${rawAgent ? ` · ${rawAgent}` : ''}`
      : (rawAgent || '—');
    body.innerHTML = `
<div class="prev-call-row">
  <div class="prev-call-main">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span style="font-weight:700;">${outcomeMap[prev.outcome]||prev.outcome}</span>
      <span style="color:var(--text-3);">${dt}</span>
      <span style="color:var(--text-3);">(${contact.attempt_count}. arama)</span>
      <span class="prev-call-agent"><i class="ph ph-user-circle"></i> ${agentLabel}</span>
    </div>
    ${prev.notes ? `<div style="margin-top:4px;color:var(--text-2);">"${prev.notes}"</div>` : ''}
  </div>
  ${recLog?.recording_url ? `
  <div class="prev-call-audio-wrap">
    <span class="prev-call-audio-lbl">Ses kaydı</span>
    <audio controls src="${recLog.recording_url}" preload="none" class="prev-call-audio"></audio>
  </div>` : (_isFakeRecordingRow(prev) ? `
  <div class="prev-call-audio-wrap">
    <span class="prev-call-audio-lbl">Test kaydı</span>
    ${_fakeRecordingMarkup(prev, 'prev')}
  </div>` : '')}
</div>`;
    el.style.display = '';
  } catch(e) { el.style.display = 'none'; }
}

function showCampScript(contact) {
  const camp = campaigns.find(c => c.id === (contact?.campaign_id || selectedCampId));
  const settings = getCampSettings(camp||{});
  const el = document.getElementById('camp-script-box');
  if (!el) return;
  if (settings.script_enabled && settings.script) {
    el.style.display = '';
    el.innerHTML = `<div style="font-size:11px;font-weight:800;color:var(--accent);margin-bottom:6px;">📝 Script</div>
<div style="font-size:12px;color:var(--text);white-space:pre-wrap;max-height:120px;overflow-y:auto;">${settings.script}</div>`;
  } else {
    el.style.display = 'none';
  }
}

function showCampScript2(contact) { showCampScript(contact); }

// ── Contact Drawer ─────────────────────────────
let _cdrContactId = null;
let _cdrContact   = null;
let _cdrTab = 'info';
let _cdrLogs = [];

async function openContactDrawer(contactId) {
  if (!contactId) return;
  _cdrContactId = contactId;
  _cdrTab = 'info';
  // Show drawer immediately with loading state
  const overlay = document.getElementById('contact-drawer-overlay');
  const drawer  = document.getElementById('contact-drawer');
  if (!overlay || !drawer) return;
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.getElementById('cdr-av').textContent = '…';
  document.getElementById('cdr-name').textContent = 'Yükleniyor…';
  document.getElementById('cdr-phone').textContent = '';
  document.getElementById('cdr-fields-grid').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  document.getElementById('cdr-history-list').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  document.getElementById('cdr-recordings-list').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  // Reset tabs
  setCdrTab('info');
  try {
    const [contacts, logs] = await Promise.all([
      sb(`contacts?id=eq.${contactId}&select=*,queues(name,status),campaigns:campaign_id(name)`),
      sb(`call_logs?contact_id=eq.${contactId}&select=*,users(name),campaigns:campaign_id(name)&order=started_at.desc&limit=50`)
    ]);
    const c = Array.isArray(contacts) ? contacts[0] : contacts;
    _cdrLogs = Array.isArray(logs) ? logs : [];
    _cdrContact = c || null;
    if (!c) { toast('Kişi bulunamadı','warn'); closeContactDrawer(); return; }
    const fullName = `${c.first_name||''} ${c.last_name||''}`.trim() || c.phone || '?';
    document.getElementById('cdr-av').textContent = (fullName.charAt(0)||'?').toUpperCase();
    document.getElementById('cdr-name').textContent = fullName;
    document.getElementById('cdr-phone').textContent = c.phone || '—';
    // Info tab
    const statusMap = {pending:'Bekliyor',no_answer:'Cevap Yok',callback:'Geri Ara',negative:'Olumsuz',appointment:'Termin',dnc:'Kara Liste',done:'Tamamlandı'};
    const fields = [
      {l:'Telefon',    v:c.phone,      mono:true, copy:true},
      {l:'2. Tel',     v:c.phone2,     mono:true, copy:true},
      {l:'Ad Soyad',   v:fullName},
      {l:'PLZ',        v:c.plz,        mono:true},
      {l:'Şehir',      v:c.city},
      {l:'Adres',      v:c.address},
      {l:'Kampanya',   v:c.campaigns?.name || c.campaign_id?.slice(0,8)},
      {l:'Kuyruk',     v:c.queues?.name},
      {l:'Durum',      v:statusMap[c.status]||c.status},
      {l:'Deneme',     v:c.attempt_count ? `${c.attempt_count}. arama` : '—'},
      {l:'Geri Ara',   v:c.callback_at ? new Date(c.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : null},
      {l:'Not',        v:c.notes},
    ].filter(f => f.v);
    document.getElementById('cdr-fields-grid').innerHTML = fields.map(f => `
<div class="cdr-field">
  <div class="cdr-field-label">${f.l}</div>
  <div class="cdr-field-val${f.mono?' mono':''}"
    ${f.copy?`style="cursor:pointer;" onclick="copyToClipboard('${(f.v||'').replace(/'/g,"\\'")}','${f.l} kopyalandı')" title="Kopyala"`:''}
  >${f.v}</div>
</div>`).join('');
    // History tab
    _renderCdrHistory();
    // Recordings tab
    _renderCdrRecordings();
    // Show call button for agents and qc users
    const footer = document.getElementById('cdr-footer');
    if (footer) {
      const canCall = ['agent','qc'].includes(currentUser?.role);
      footer.style.display = canCall ? '' : 'none';
      const btn = document.getElementById('cdr-call-btn');
      if (btn) btn.setAttribute('data-phone', c.phone||'');
    }
  } catch(e) {
    toast('Drawer yüklenemedi: ' + e.message, 'err');
    closeContactDrawer();
  }
}

async function openDialerForContact(contactId) {
  if (!contactId) return;
  try {
    const rows = await sb(`contacts?id=eq.${contactId}&select=*`);
    const c = rows?.[0];
    if (!c) { toast('Kişi bulunamadı', 'warn'); return; }
    currentContact = c;
    navigate('dialer');
    setTimeout(() => {
      if (typeof showCustomerCard === 'function') showCustomerCard(c);
    }, 120);
  } catch (e) {
    toast('Dialer açılırken hata: ' + e.message, 'err');
  }
}

function _renderCdrHistory() {
  const el = document.getElementById('cdr-history-list');
  if (!el) return;
  if (!_cdrLogs.length) {
    el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Arama geçmişi yok</div>';
    return;
  }
  const OM = {appointment:'Termin',appointment_done:'Termin',negative:'Olumsuz',callback:'Geri Ara',no_answer:'Cevap Yok',voicemail:'Telesekreter',dnc:'Kara Liste'};
  const colorMap = {appointment:'var(--green)',appointment_done:'var(--green)',negative:'var(--red)',callback:'var(--yellow)',no_answer:'var(--text-3)',dnc:'var(--red)',voicemail:'var(--text-3)'};
  el.innerHTML = _cdrLogs.map(l => {
    const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    const dur = l.duration_sec ? `${Math.floor(l.duration_sec/60)}:${String(l.duration_sec%60).padStart(2,'0')}` : '—';
    const oc = OM[l.outcome] || l.outcome || '—';
    const oc_color = colorMap[l.outcome] || 'var(--text-3)';
    const camp = l.campaigns?.name || '—';
    const agent = l.users?.name || '—';
    return `<div class="cdr-log-row">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
  <div style="font-size:11px;font-family:var(--mono);color:var(--text-2);">${dt}</div>
  <span style="font-size:11px;font-weight:700;color:${oc_color};background:${oc_color}18;padding:2px 8px;border-radius:10px;">${oc}</span>
</div>
<div style="display:flex;gap:12px;font-size:11px;color:var(--text-3);">
  <span><i class="ph ph-user" style="vertical-align:-2px;"></i> ${agent}</span>
  <span><i class="ph ph-megaphone-simple" style="vertical-align:-2px;"></i> ${camp}</span>
  <span><i class="ph ph-clock" style="vertical-align:-2px;"></i> ${dur}</span>
</div>
${l.notes ? `<div style="margin-top:4px;font-size:11px;color:var(--text-2);font-style:italic;">"${l.notes}"</div>` : ''}
${l.recording_url ? `<div style="margin-top:6px;"><audio controls src="${l.recording_url}" style="width:100%;height:28px;" preload="none"></audio></div>` : (_isFakeRecordingRow(l) ? _fakeRecordingMarkup(l, 'cdrhist') : '')}
</div>`;
  }).join('');
}

function _renderCdrRecordings() {
  const el = document.getElementById('cdr-recordings-list');
  if (!el) return;
  const recs = _cdrLogs.filter(l => l.recording_url || _isFakeRecordingRow(l));
  if (!recs.length) {
    el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Ses kaydı yok</div>';
    return;
  }
  el.innerHTML = recs.map(l => {
    const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    const dur = l.duration_sec ? `${Math.floor(l.duration_sec/60)}:${String(l.duration_sec%60).padStart(2,'0')}` : '—';
    return `<div class="cdr-log-row">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
  <span style="font-size:11px;color:var(--text-2);font-family:var(--mono);">${dt}</span>
  <span style="font-size:11px;color:var(--text-3);">${dur}</span>
</div>
${l.recording_url
  ? `<audio controls src="${l.recording_url}" style="width:100%;height:32px;" preload="none"></audio>`
  : _fakeRecordingMarkup(l, 'cdrrec')}
</div>`;
  }).join('');
}

function setCdrTab(tab) {
  _cdrTab = tab;
  ['info','history','recordings'].forEach(t => {
    const btn   = document.getElementById('cdr-tab-' + t);
    const panel = document.getElementById('cdr-panel-' + t);
    if (btn)   btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
}

function closeContactDrawer() {
  document.getElementById('contact-drawer-overlay')?.classList.remove('open');
  document.getElementById('contact-drawer')?.classList.remove('open');
  _cdrContactId = null;
}

function drawerCallContact() {
  const c = _cdrContact;
  if (!c?.phone) { toast('Telefon numarası yok', 'warn'); return; }
  closeContactDrawer();
  // Set as current contact and open dialer
  currentContact = c;
  navigate('dialer');
  // Small delay to let dialer UI render
  setTimeout(() => {
    // Show customer card with the contact's info
    if (typeof showCustomerCard === 'function') showCustomerCard(c);
    // Transition to ready/calling state
    if (typeof setDialerStatus === 'function') setDialerStatus('calling');
    // Start the actual call
    if (typeof makeCall === 'function') makeCall(c.phone);
  }, 150);
}

let _contactMap = null;
let _contactMapMarker = null;
let _contactMapMeasureMode = false;
let _contactMapMeasurePath = [];
let _contactMapMeasurePolyline = null;
let _contactMapMeasurePolygon = null;
let _contactMapMeasureInfo = null;
let _contactMapMeasureClickListener = null;
let _contactMapMeasureType = 'distance';

function _fmtMeters(m) {
  const n = Number(m || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(2)} km`;
  return `${Math.round(n)} m`;
}

function _fmtAreaM2(m2) {
  const n = Math.max(0, Number(m2) || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)} km²`;
  if (n >= 10000) return `${Math.round(n).toLocaleString('tr-TR')} m²`;
  return `${n.toFixed(1)} m²`;
}

function _haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat() - a.lat());
  const dLng = toRad(b.lng() - a.lng());
  const la1 = toRad(a.lat());
  const la2 = toRad(b.lat());
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function _measureTotalMeters(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (window.google?.maps?.geometry?.spherical?.computeDistanceBetween) {
      total += google.maps.geometry.spherical.computeDistanceBetween(a, b);
    } else {
      total += _haversineMeters(a, b);
    }
  }
  return total;
}

function _measureAreaM2(path) {
  if (!Array.isArray(path) || path.length < 3) return 0;
  if (window.google?.maps?.geometry?.spherical?.computeArea) {
    return google.maps.geometry.spherical.computeArea(path);
  }
  return 0;
}

function _contactMapResetMeasure() {
  _contactMapMeasurePath = [];
  if (_contactMapMeasurePolyline) {
    _contactMapMeasurePolyline.setMap(null);
    _contactMapMeasurePolyline = null;
  }
  if (_contactMapMeasurePolygon) {
    _contactMapMeasurePolygon.setMap(null);
    _contactMapMeasurePolygon = null;
  }
  if (_contactMapMeasureInfo) {
    _contactMapMeasureInfo.close();
    _contactMapMeasureInfo = null;
  }
}

function _contactMapRenderMeasure() {
  if (!_contactMap) return;
  if (_contactMapMeasureType === 'area') {
    if (_contactMapMeasurePolyline) {
      _contactMapMeasurePolyline.setMap(null);
      _contactMapMeasurePolyline = null;
    }
    if (!_contactMapMeasurePolygon) {
      _contactMapMeasurePolygon = new google.maps.Polygon({
        map: _contactMap,
        paths: [],
        strokeColor: '#f59e0b',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        clickable: false,
      });
    }
    _contactMapMeasurePolygon.setPath(_contactMapMeasurePath);
    if (_contactMapMeasurePath.length < 3) return;
    const area = _measureAreaM2(_contactMapMeasurePath);
    const last = _contactMapMeasurePath[_contactMapMeasurePath.length - 1];
    if (!_contactMapMeasureInfo) _contactMapMeasureInfo = new google.maps.InfoWindow();
    _contactMapMeasureInfo.setContent(`<div style="font-size:12px;font-weight:700;">Alan: ${_fmtAreaM2(area)}</div>`);
    _contactMapMeasureInfo.setPosition(last);
    _contactMapMeasureInfo.open({ map: _contactMap });
    return;
  }
  if (_contactMapMeasurePolygon) {
    _contactMapMeasurePolygon.setMap(null);
    _contactMapMeasurePolygon = null;
  }
  if (!_contactMapMeasurePolyline) {
    _contactMapMeasurePolyline = new google.maps.Polyline({
      map: _contactMap,
      path: [],
      strokeColor: '#ef4444',
      strokeOpacity: 0.95,
      strokeWeight: 3,
      clickable: false,
    });
  }
  _contactMapMeasurePolyline.setPath(_contactMapMeasurePath);
  if (_contactMapMeasurePath.length < 2) return;
  const total = _measureTotalMeters(_contactMapMeasurePath);
  const last = _contactMapMeasurePath[_contactMapMeasurePath.length - 1];
  if (!_contactMapMeasureInfo) _contactMapMeasureInfo = new google.maps.InfoWindow();
  _contactMapMeasureInfo.setContent(`<div style="font-size:12px;font-weight:700;">Mesafe: ${_fmtMeters(total)}</div>`);
  _contactMapMeasureInfo.setPosition(last);
  _contactMapMeasureInfo.open({ map: _contactMap });
}

function _setContactMapMeasureMode(on) {
  _contactMapMeasureMode = !!on;
  if (!_contactMap) return;
  if (_contactMapMeasureClickListener) {
    google.maps.event.removeListener(_contactMapMeasureClickListener);
    _contactMapMeasureClickListener = null;
  }
  if (_contactMapMeasureMode) {
    _contactMapMeasureClickListener = _contactMap.addListener('click', (ev) => {
      _contactMapMeasurePath.push(ev.latLng);
      _contactMapRenderMeasure();
    });
  }
}

function _setContactMapMeasureType(type) {
  _contactMapMeasureType = type === 'area' ? 'area' : 'distance';
  _contactMapResetMeasure();
}

function _ensureContactMapScript(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__contactMapScriptPromise) return window.__contactMapScriptPromise;
  window.__contactMapScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps yüklenemedi'));
    document.head.appendChild(s);
  });
  return window.__contactMapScriptPromise;
}

function _buildContactMapToolbar(container) {
  const existing = document.getElementById('contact-map-toolbar');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.id = 'contact-map-toolbar';
  bar.style.cssText = 'position:absolute;bottom:12px;left:10px;z-index:8;display:flex;gap:6px;flex-wrap:wrap;';
  const btnStyle = 'background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;color:var(--text);';
  bar.innerHTML = `
    <button id="cm-btn-dist" type="button" style="${btnStyle}">Mesafe</button>
    <button id="cm-btn-area" type="button" style="${btnStyle}">Alan (m²)</button>
    <button id="cm-btn-clear" type="button" style="${btnStyle}">Temizle</button>
    <button id="cm-btn-2d" type="button" style="${btnStyle};display:none;">3D'den çık</button>
  `;
  container.appendChild(bar);
  const btnDist = document.getElementById('cm-btn-dist');
  const btnArea = document.getElementById('cm-btn-area');
  const btnClear = document.getElementById('cm-btn-clear');
  const btn2d = document.getElementById('cm-btn-2d');
  const exit3d = () => {
    if (!_contactMap) return;
    _contactMap.setTilt(0);
    _contactMap.setHeading(0);
    if (btn2d) btn2d.style.display = 'none';
  };
  const refreshMeasureUi = () => {
    if (btnDist) {
      btnDist.style.background = _contactMapMeasureMode && _contactMapMeasureType === 'distance' ? 'var(--accent-soft)' : 'var(--bg-2)';
      btnDist.style.borderColor = _contactMapMeasureMode && _contactMapMeasureType === 'distance' ? 'var(--accent)' : 'var(--border)';
    }
    if (btnArea) {
      btnArea.style.background = _contactMapMeasureMode && _contactMapMeasureType === 'area' ? 'var(--accent-soft)' : 'var(--bg-2)';
      btnArea.style.borderColor = _contactMapMeasureMode && _contactMapMeasureType === 'area' ? 'var(--accent)' : 'var(--border)';
    }
  };
  if (btnDist) {
    btnDist.onclick = () => {
      exit3d();
      _setContactMapMeasureType('distance');
      _setContactMapMeasureMode(!_contactMapMeasureMode);
      refreshMeasureUi();
    };
  }
  if (btnArea) {
    btnArea.onclick = () => {
      exit3d();
      _setContactMapMeasureType('area');
      _setContactMapMeasureMode(!_contactMapMeasureMode);
      refreshMeasureUi();
    };
  }
  if (btnClear) btnClear.onclick = () => _contactMapResetMeasure();
  if (btn2d) {
    btn2d.onclick = () => {
      if (!_contactMap) return;
      _contactMap.setTilt(0);
      _contactMap.setHeading(0);
      btn2d.style.display = 'none';
    };
  }
  refreshMeasureUi();
}

async function showContactMap(address, plz, city) {
  const container = document.getElementById('contact-map-container');
  if (!container) return;
  const key = _googleApiKey || localStorage.getItem('mb_google_key') || '';
  if (!key) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px;">Google Maps API anahtarı gerekli<br><small>Ayarlar → Google API Key</small></div>';
    return;
  }
  try {
    await _ensureContactMapScript(key);
  } catch (e) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px;">${e.message}</div>`;
    return;
  }
  container.innerHTML = '<div id="contact-map-canvas" style="width:100%;height:100%;min-height:460px;"></div>';
  _buildContactMapToolbar(container);
  const mapEl = document.getElementById('contact-map-canvas');
  if (!mapEl) return;
  const mapOpts = {
    center: { lat: 52.52, lng: 13.405 },
    zoom: 17,
    mapTypeId: 'satellite',
    streetViewControl: true, // Pegman
    fullscreenControl: true,
    rotateControl: true,
    gestureHandling: 'greedy', // Ctrl zorunlu olmasın
    tilt: 67.5,
    heading: 35,
    headingInteractionEnabled: true,
    tiltInteractionEnabled: true,
  };
  _contactMap = new google.maps.Map(mapEl, mapOpts);
  _contactMap.setOptions({ minZoom: 3, maxZoom: 22 });
  const btn2d = document.getElementById('cm-btn-2d');
  if (btn2d) btn2d.style.display = '';
  _setContactMapMeasureMode(false);
  _contactMapResetMeasure();
  const q = `${address || ''} ${plz || ''} ${city || ''} Germany`.trim();
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: q }, (results, status) => {
    if (status === 'OK' && results?.[0]?.geometry?.location) {
      const loc = results[0].geometry.location;
      _contactMap.setCenter(loc);
      _contactMap.setZoom(20);
      if (_contactMapMarker) _contactMapMarker.setMap(null);
      _contactMapMarker = new google.maps.Marker({ map: _contactMap, position: loc, title: q || 'Konum' });
    }
  });
}
