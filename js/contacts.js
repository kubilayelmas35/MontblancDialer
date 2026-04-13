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
async function getNextContact() {
  // Aktif kampanya listesini kullan (yoksa selectedCampId ile fallback)
  const ids = (typeof _activeCampIds !== 'undefined' && _activeCampIds.length)
    ? _activeCampIds
    : (selectedCampId ? [selectedCampId] : []);
  if (!ids.length) return null;
  try {
    const campFilter = ids.length === 1
      ? `campaign_id=eq.${ids[0]}`
      : `campaign_id=in.(${ids.join(',')})`;
    const contacts = await sb(
      `contacts?${campFilter}` +
      `&status=in.(pending,no_answer)` +
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
  document.getElementById('cust-empty').style.display='none';
  document.getElementById('cust-data').style.display='';
  showPrevCallInfo(c);
  showCampScript(c);
  const camp = campaigns.find(x=>x.id===c.campaign_id);
  let fc = {};
  try { fc = camp?.field_config ? JSON.parse(camp.field_config) : {}; } catch(e) {}
  const show = (key, def=true) => fc[key] !== undefined ? fc[key] : def;
  const name = show('name') ? `${c.first_name||''} ${c.last_name||''}`.trim()||c.phone : c.phone;
  document.getElementById('cust-av').textContent    = (c.first_name||c.phone||'?').charAt(0).toUpperCase();
  document.getElementById('cust-name').textContent  = name;
  document.getElementById('cust-phone').textContent = c.phone;
  document.getElementById('cust-attempt-badge').style.display = show('attempt') ? '' : 'none';
  document.getElementById('cust-attempt-badge').textContent = `${c.attempt_count||1}. arama`;
  document.getElementById('cust-camp-badge').textContent  = camp?.name||'—';
  document.getElementById('cust-queue-badge').textContent = c.queue_name||'—';
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
  document.getElementById('cust-fields').innerHTML = visibleFields.map(f=>`
<div class="cust-field" style="position:relative;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
<div class="cust-field-lbl" style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${f.l}</div>
<div style="display:flex;align-items:center;gap:6px;">
<div class="cust-field-val${f.mono?' mono':''}" id="cval-${f.key}"
style="flex:1;font-size:14px;font-weight:600;cursor:pointer;min-height:20px;"
onclick="copyToClipboard('${(f.v||'').replace(/'/g,"\\'")}','${f.l} kopyalandı')"
title="Kopyala (tıkla) — düzenlemek için kalem ikonuna bas">${f.v||'—'}</div>
<button onclick="startFieldEdit('${f.key}','${f.l}',this)"
style="flex-shrink:0;background:transparent;border:none;cursor:pointer;color:var(--text-3);padding:2px;border-radius:4px;opacity:.6;transition:.15s;"
title="Düzenle"
onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
onmouseout="this.style.opacity='.6';this.style.color='var(--text-3)'">
<i class="ph ph-pencil-simple" style="font-size:14px;"></i>
</button>
</div>
</div>`).join('');
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
<div id="tf-note-row" style="margin-top:8px;">
<label style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;">Not</label>
<textarea id="tf2-note" class="form-input" rows="2" style="font-size:12px;resize:vertical;margin-top:3px;" placeholder="Agent notu..."></textarea>
</div>
<button onclick="saveTerminFromSection()" style="margin-top:8px;width:100%;padding:8px;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--accent)));color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;">
Termini Kaydet
</button>`;
  const nameEl = document.getElementById('cust-name');
  if (nameEl) { nameEl.style.cursor='pointer'; nameEl.title='Kopyala'; nameEl.onclick=()=>copyToClipboard(nameEl.textContent,'İsim kopyalandı'); }
  const phoneEl = document.getElementById('cust-phone');
  if (phoneEl) { phoneEl.style.cursor='pointer'; phoneEl.title='Kopyala'; phoneEl.onclick=()=>copyToClipboard(phoneEl.textContent,'Telefon kopyalandı'); }
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
}

function switchContactTab(tab) {
  ['info','map','history'].forEach(t => {
    const btn   = document.getElementById('ctab-'+t);
    const panel = document.getElementById('ctab-'+t+'-panel');
    if (btn) { btn.style.background=t===tab?'var(--accent)':'transparent'; btn.style.color=t===tab?'#fff':'var(--text-2)'; }
    if (panel) panel.style.display=t===tab?'':'none';
  });
  if (tab==='map' && currentContact) showContactMap(currentContact.address, currentContact.plz, currentContact.city);
  if (tab==='history' && currentContact) loadContactHistory(currentContact.id);
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
</div>
<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--bg-3);">${l.outcome||'—'}</span>
</div>`).join('');
  } catch(e) { el.innerHTML='Hata'; }
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
    const logs = await sb(`call_logs?contact_id=eq.${contact.id}&order=started_at.desc&limit=1&select=outcome,notes,started_at`);
    if (!logs?.length) { el.style.display = 'none'; return; }
    const prev = logs[0];
    const dt = new Date(prev.started_at).toLocaleString('tr-TR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const outcomeMap = {appointment:'📅 Termin',negative:'❌ Olumsuz',callback:'🔄 Geri Ara',no_answer:'📵 Cevap Yok',dnc:'🚫 Kara Liste'};
    body.innerHTML = `
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
<span style="font-weight:700;">${outcomeMap[prev.outcome]||prev.outcome}</span>
<span style="color:var(--text-3);">${dt}</span>
<span style="color:var(--text-3);">(${contact.attempt_count}. arama)</span>
</div>
${prev.notes ? `<div style="margin-top:4px;color:var(--text-2);">"${prev.notes}"</div>` : ''}`;
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

function showContactMap(address, plz, city) {
  const container = document.getElementById('contact-map-container');
  if (!container) return;
  const key = _googleApiKey || localStorage.getItem('mb_google_key') || '';
  if (!key) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px;">Google Maps API anahtarı gerekli<br><small>Ayarlar → Google API Key</small></div>';
    return;
  }
  const query = encodeURIComponent(`${address||''} ${plz||''} ${city||''} Germany`);
  const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${query}&maptype=satellite&zoom=17`;
  container.innerHTML = `<iframe width="100%" height="100%" frameborder="0" style="border:none;display:block;min-height:360px;" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${src}"></iframe>`;
}
