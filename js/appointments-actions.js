// Takvim slot işlemleri — appointments.js ile aynı kapsam
async function openTakvimSlotDetail(slot, appt) {
  const role = currentUser?.role || '';
  const isAdmin = mbIsFirmAdmin(role);
  const canAssignField = mbIsFirmAdmin(role);
  const canManageAppt = ['admin','super_admin','firm_admin','qc'].includes(currentUser?.role||'');
  const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
  const resultMap = {};
  (resultCfg || []).forEach(r => { resultMap[r.key] = r; });
  document.getElementById('takvim-detail-title').textContent = appt ? appt.nachname : 'Boş Slot';
  openModal('m-takvim-detail');
  const body = document.getElementById('takvim-detail-body');
  const footer = document.getElementById('takvim-detail-footer');
  if (!appt) {
    const lockInfo = slot.durum==='kilitli' && isAdmin ?
      `<div style="margin-top:8px;padding:6px 10px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.3);border-radius:5px;font-size:11px;"><b>Kilitleyen Agent:</b> ${slot.kilitli_agent_id||'?'}<br><b>Kilitlenme:</b> ${slot.kilitli_at?new Date(slot.kilitli_at).toLocaleString('tr-TR'):'—'}</div>` : '';
    body.innerHTML = `<div style="text-align:center;padding:20px;">
<div style="font-weight:800;font-size:14px;">${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)} – ${slot.bitis_saat?.slice(0,5)}</div>
<div style="color:var(--text-3);font-size:12px;margin-top:4px;">${slot.durum==='kilitli'?'Kilitli':'Boş'} slot</div>
${lockInfo}
</div>`;
    const bookLabel = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Termin eintragen' : 'Randevu ekle';
    footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
${isAdmin?`<button class="btn btn-ghost" style="color:var(--red);" onclick="deleteTakvimSlot('${slot.id}')">Sil</button>${slot.durum==='kilitli'?`<button class="btn btn-ghost" style="color:var(--yellow);" onclick="closeModal('m-takvim-detail');unlockSlot('${slot.id}')">Kilidi Kaldır</button>`:''}`:''}
<button class="btn btn-primary" onclick="closeModal('m-takvim-detail');lockAndBookSlot(takvimSlots.find(s=>s.id==='${slot.id}'))">${bookLabel}</button>`;
    return;
  }
  const statusCfg = resultMap[_normResultKey(appt.durum)] || {};
  const dc = statusCfg.color || 'var(--accent)';
  const statusLabel = statusCfg.label || (appt.durum || '').replace('_', ' ').toUpperCase();
  body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);">DURUM</div><div style="font-weight:800;font-size:14px;color:${dc};">${statusLabel}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">MÜŞTERİ</div><div style="font-weight:700;">${appt.nachname||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TELEFON</div><div style="font-weight:700;font-family:var(--mono);">${appt.telefonnummer||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">PLZ / ŞEHİR</div><div style="font-weight:700;">${appt.plz||'—'} ${appt.ortschaft||''}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ADRES</div><div style="font-weight:700;">${appt.strasse||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">EV TİPİ</div><div style="font-weight:700;">${appt.hausart||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">BAUJAHR / m²</div><div style="font-weight:700;">${appt.baujahr||'—'} / ${appt.qm||'—'}m²</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ISITMA</div><div style="font-weight:700;">${appt.heizung||'—'} (${appt.alter_der_heizung||'—'} yaş)</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TÜKETİM</div><div style="font-weight:700;">${appt.verbrauch_pro_jahr||'—'}</div></div>
</div>`;
  const canEditNote = canManageAppt || appt.agent_id === currentUser?.id;
  if (canEditNote || appt.agent_notu) {
    const noteWrap = document.createElement('div');
    noteWrap.style.cssText = 'margin-top:8px;';
    const noteLab = document.createElement('div');
    noteLab.style.cssText = 'font-size:10px;color:var(--text-3);font-weight:700;';
    noteLab.textContent = typeof t === 'function' ? t('cal.detail.note') : 'Not';
    noteWrap.appendChild(noteLab);
    if (canEditNote) {
      const note = document.createElement('textarea');
      note.id = 'takvim-detail-note';
      note.className = 'form-input';
      note.rows = 3;
      note.style.marginTop = '4px';
      note.value = appt.agent_notu || '';
      noteWrap.appendChild(note);
    } else {
      const noteText = document.createElement('div');
      noteText.style.cssText = 'margin-top:4px;font-size:12px;white-space:pre-wrap;';
      noteText.textContent = appt.agent_notu || '';
      noteWrap.appendChild(noteText);
    }
    body.appendChild(noteWrap);
  }
  footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail');openDialerForContact('${appt.contact_id||''}')">Dialer'a Git</button>
${canAssignField ? `<button class="btn btn-primary" onclick="openFieldAssignModal('${appt.id}','${appt.firm_id || currentUser.firm_id}')">Sahaya Ata</button>` : ''}
${canManageAppt ? `
<select class="form-input" id="appt-status-sel" style="width:auto;font-size:12px;padding:6px 10px;">
<option value="">Durum değiştir...</option>
${(resultCfg||[]).map(r=>`<option value="${r.key}">${r.label}</option>`).join('')}
</select>` : ''}
${canEditNote ? `<button class="btn btn-primary" onclick="takvimSaveSlotDetail('${appt.id}')">Kaydet</button>` : ''}`;
  if (canManageAppt) {
    _getCustomerCtx(appt.customer_id).then(ctx => {
      if (!ctx?.customers?.length) return;
      const el = document.createElement('div');
      el.className = 'form-row';
      el.style.cssText = 'margin-top:8px;';
      el.innerHTML = `<label class="form-label">Müşteri</label>
      <select class="form-input" id="appt-customer-sel" style="width:100%;font-size:12px;padding:6px 10px;">
        <option value="">Seçin...</option>
        ${ctx.customers.map(c => `<option value="${c.id}" ${String(appt.customer_id||'')===String(c.id)?'selected':''}>${(c.code?c.code+' · ':'')+c.name}</option>`).join('')}
      </select>`;
      body.appendChild(el);
    }).catch(()=>{});
  }
}

async function takvimSaveSlotDetail(apptId) {
  const statusEl = document.getElementById('appt-status-sel');
  const custEl = document.getElementById('appt-customer-sel');
  const noteEl = document.getElementById('takvim-detail-note');
  const status = statusEl ? statusEl.value : '';
  const body = {};
  if (status) body.durum = status;
  if (custEl) body.customer_id = custEl.value || null;
  if (noteEl) body.agent_notu = noteEl.value.trim() || null;
  if (!Object.keys(body).length) {
    toast(typeof t === 'function' ? t('cal.detail.need') : 'Kaydedilecek bir şey yok', 'err');
    return;
  }
  await takvimQcUpdate(apptId, status, custEl ? (custEl.value || null) : undefined, body.agent_notu, !!noteEl);
}

async function takvimQcUpdate(apptId, status, customerId, note, noteSet) {
  if (!status && customerId === undefined && !noteSet) { toast(typeof t === 'function' ? t('cal.detail.need') : 'Durum veya müşteri seçin','err'); return; }
  try {
    const body = {};
    if (status) body.durum = status;
    if (customerId !== undefined) body.customer_id = customerId || null;
    if (noteSet) body.agent_notu = note || null;
    await sb(`appointments?id=eq.${apptId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify(body)});
    if (status) {
      const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
      const cfg = (resultCfg || []).find(r => r.key === _normResultKey(status));
      if (cfg?.auto_move_down) {
        const slots = await sb(`takvim_slots?appointment_id=eq.${apptId}&select=id&limit=1`).catch(() => []);
        if (slots?.[0]?.id) await slotAltaTasi(slots[0].id);
      }
    }
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast(typeof t === 'function' ? t('cal.detail.saved') : 'Randevu güncellendi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function unlockSlot(slotId) {
  if (!(await mbConfirm('Slot kilidi kaldırılsın mı?', 'Slot Kilidi'))) return;
  try {
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})});
    await loadTakvimSlots();
    toast('Kilit kaldırıldı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function agentCancelAppt(slotId, apptId) {
  if (!(await mbConfirm('Randevununi iptal etmek istediğine emin misin?', 'Randevu İptali'))) return;
  try {
    await sb(`appointments?id=eq.${apptId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'iptal'})});
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',appointment_id:null})});
    await loadTakvimSlots();
    toast('Randevu iptal edildi','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function deleteTakvimSlot(slotId) {
  if (!(await mbConfirm('Slot silinecek?', 'Slot Sil'))) return;
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'DELETE',prefer:'return=minimal'}).catch(e=>toast('Hata: '+e.message,'err'));
  closeModal('m-takvim-detail');
  await loadTakvimSlots();
  toast('Slot silindi','ok');
}

async function lockAndBookSlot(slot) {
  if (!slot) return;
  try {
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'kilitli',kilitli_agent_id:currentUser.id,kilitli_at:new Date().toISOString()})});
  } catch(e) { toast('Slot kilitlenemiyor: '+e.message,'err'); return; }
  _bookingSlot = slot;
  // If we're in dialer context, show randevu section instead of popup
  // Agent, dialer sayfasındayken takvim overlay'inden slot seçti
  const inDialerCtx = typeof onAgentSlotSelected === 'function' && typeof dialerStatus !== 'undefined';
  if (inDialerCtx) {
    // Overlay'i kapat
    const _ov = document.getElementById('takvim-popup-overlay');
    if (_ov) _ov.classList.remove('open');
    // Randevu formunu göster (navigate gereksiz — onAgentSlotSelected UI'yı yönetiyor)
    onAgentSlotSelected(slot);
  } else {
    openTakvimBookForm(slot);
  }
}

async function openTakvimBookForm(slot) {
  const contact = currentContact||{};
  const campId = (typeof takvimCampId !== 'undefined' && takvimCampId) || (typeof selectedCampId !== 'undefined' ? selectedCampId : null) || contact.campaign_id;
  const preset = typeof mbCampDefaultCustomerId === 'function' ? mbCampDefaultCustomerId(campId) : null;
  const custCtx = await _getCustomerCtx(preset);
  document.getElementById('takvim-detail-title').textContent = `Randevu — ${slot.tarih} ${slot.baslangic_saat?.slice(0,5)}`;
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="background:var(--bg-3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:12px;font-weight:600;">${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)}–${slot.bitis_saat?.slice(0,5)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Ad Soyad *</label><input class="form-input" id="tf-name" value="${contact.first_name?contact.first_name+' '+(contact.last_name||''):''}"></div>
<div class="form-row"><label class="form-label">Telefon *</label><input class="form-input" id="tf-tel" value="${contact.phone||''}"></div>
<div class="form-row"><label class="form-label">Telefon 2</label><input class="form-input" id="tf-tel2" value="${contact.phone2||''}"></div>
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Adres *</label><input class="form-input" id="tf-str" value="${contact.address||''}"></div>
<div class="form-row"><label class="form-label">PLZ *</label><input class="form-input" id="tf-plz" value="${contact.plz||''}"></div>
<div class="form-row"><label class="form-label">Şehir</label><input class="form-input" id="tf-ort" value="${contact.city||''}"></div>
<div class="form-row"><label class="form-label">Ev Tipi *</label><select class="form-input" id="tf-hausart"><option value="">Seçin</option><option>Einfamilienhaus</option><option>Zweifamilienhaus</option><option>Reihenhaus</option><option>Doppelhaus</option><option>Mehrfamilienhaus</option></select></div>
<div class="form-row"><label class="form-label">Yapım Yılı *</label><input class="form-input" id="tf-bj" value="${contact.baujahr||''}"></div>
<div class="form-row"><label class="form-label">m² *</label><input class="form-input" id="tf-qm" value="${contact.qm||''}"></div>
<div class="form-row"><label class="form-label">Isıtma *</label><select class="form-input" id="tf-hz"><option value="">Seçin</option><option>Gas</option><option>Öl</option><option>Pellet</option><option>WP</option><option>Fernwärme</option></select></div>
<div class="form-row"><label class="form-label">Isıtma Yaşı *</label><input class="form-input" id="tf-ah" value="${contact.alter_der_heizung||''}"></div>
<div class="form-row"><label class="form-label">Tüketim/Yıl *</label><input class="form-input" id="tf-vj" value="${contact.verbrauch_pro_jahr||''}"></div>
<div class="form-row"><label class="form-label">Kişi *</label><input class="form-input" id="tf-pe" value="${contact.personen||''}"></div>
<div class="form-row"><label class="form-label">PV İlgisi</label><select class="form-input" id="tf-pv"><option value="false">Hayır</option><option value="true">Evet</option></select></div>
${_renderCustomerField(custCtx, 'tf-customer')}
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Not</label><textarea class="form-input" id="tf-note" rows="2" style="resize:vertical;">${contact.notes||''}</textarea></div>`;
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="cancelTakvimBook('${slot.id}')">İptal</button><button class="btn btn-primary" onclick="submitTakvimBook('${slot.id}')">Kaydet</button>`;
}

function terminNoteWithExtras(noteId) {
  const note = document.getElementById(noteId)?.value?.trim() || '';
  const known = new Set(['hausart','baujahr','qm','heizung','alter_der_heizung','verbrauch_pro_jahr','personen','interesse_an_pv']);
  const extra = [];
  document.querySelectorAll('#termin-fields-section [data-tf-key]').forEach((el) => {
    const key = el.getAttribute('data-tf-key');
    if (!key || known.has(key)) return;
    const val = document.getElementById('tf2-' + key)?.value?.trim() || '';
    if (!val) return;
    const label = el.querySelector('div')?.textContent?.replace('*', '').trim() || key;
    extra.push(`${label}: ${val}`);
  });
  return [note, ...extra].filter(Boolean).join('\n');
}

// Save termin directly from the inline termin-fields-section
function _markMissingTerminFields(keys) {
  document.querySelectorAll('#termin-fields-section [data-tf-key]').forEach((el) => {
    const key = el.getAttribute('data-tf-key');
    const bad = keys.includes(key);
    el.style.borderColor = bad ? 'var(--red)' : '';
  });
}

function _releaseBookedContact(contact) {
  const id = contact?.id ? String(contact.id) : '';
  if (id && typeof _hopperSkip !== 'undefined' && _hopperSkip && typeof _hopperSkip.set === 'function') {
    _hopperSkip.set(id, Date.now() + 10 * 60 * 1000);
  }
  if (id && typeof _hopper !== 'undefined' && Array.isArray(_hopper)) {
    _hopper = _hopper.filter((row) => {
      if (String(row?.contact?.id || '') !== id) return true;
      try { row.call?.hangup(); } catch (e) {}
      if (typeof _liveCallId !== 'undefined' && row.id === _liveCallId) _liveCallId = null;
      return false;
    });
    if (typeof _outboundDialPending !== 'undefined') {
      _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
    }
  }
  const otherStillUp = typeof _hopper !== 'undefined' && Array.isArray(_hopper) && _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'live' || r.phase === 'hold');
  if (otherStillUp) return;
  try {
    if (typeof sendToRTC === 'function' && (_telnyxCall || _outboundDialPending || _fakeCallActive)) sendToRTC('MB_HANGUP');
  } catch (e) {}
  if (typeof _telnyxCall !== 'undefined') _telnyxCall = null;
  if (typeof _fakeCallActive !== 'undefined') _fakeCallActive = false;
  if (typeof _outboundDialPending !== 'undefined') _outboundDialPending = false;
  if (typeof dialerStatus !== 'undefined' && (dialerStatus === 'on_call' || dialerStatus === 'calling')) {
    if (typeof handleCallEnd === 'function') handleCallEnd(Math.floor(typeof callSeconds === 'number' ? callSeconds : 0) || 0);
    else if (typeof setDialerStatus === 'function') setDialerStatus('wrapping');
  }
}

async function saveTerminFromSection() {
  const slot = _bookingSlot || window._selectedBookingSlot;
  const slotRequired = typeof mbAppointmentSlotRequired === 'function' && mbAppointmentSlotRequired();
  if (!slot && slotRequired) { toast('Önce takvimden bir slot seçin','err'); return; }
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const requiredKeys = [...document.querySelectorAll('#termin-fields-section [data-required="1"]')].map((el) => el.getAttribute('data-tf-key')).filter(Boolean);
  const must = requiredKeys.length ? requiredKeys : ['hausart','baujahr','qm','heizung','alter_der_heizung'];
  const missing = must.filter((k) => !g('tf2-' + k));
  let needCustomer = false;
  try {
    const custCtx = await _getCustomerCtx(null);
    const apptCampId = currentContact?.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : null);
    needCustomer = !!(custCtx?.mustSelect && typeof mbResolveApptCustomerId === 'function' && !mbResolveApptCustomerId('tf2-customer', apptCampId));
    const custEl = document.getElementById('tf2-customer');
    if (custEl) custEl.style.borderColor = needCustomer ? 'var(--red)' : '';
  } catch (e) {}
  _markMissingTerminFields(missing);
  if (missing.length || needCustomer) {
    toast('Randevu için zorunlu alanları doldurmalısınız', 'err', 4200);
    return;
  }
  if (!slot) {
    const packed = typeof terminNoteWithExtras === 'function' ? terminNoteWithExtras('tf2-note') : (document.getElementById('tf2-note')?.value || '');
    const out = document.getElementById('outcome-note');
    if (out) out.value = packed;
    if (currentContact) currentContact.notes = packed;
    if (typeof mbOutcomeCategory !== 'function' || mbOutcomeCategory(typeof mbFindOutcome === 'function' ? mbFindOutcome(selectedOutcome) : { key: selectedOutcome }) !== 'appointment') selectedOutcome = 'appointment';
    const ts = document.getElementById('termin-fields-section');
    if (ts) ts.style.display = 'none';
    if (typeof submitOutcome === 'function') await submitOutcome(false);
    if (typeof mbDeliverApptNotice === 'function') {
      mbDeliverApptNotice({
        campaignId: currentContact?.campaign_id || selectedCampId,
        phone: currentContact?.phone || '',
        name: `${currentContact?.first_name || ''} ${currentContact?.last_name || ''}`.trim(),
        firmId: currentUser?.firm_id,
        payload: {
          contact: {
            name: `${currentContact?.first_name || ''} ${currentContact?.last_name || ''}`.trim(),
            phone: currentContact?.phone || '',
            phone2: currentContact?.phone2 || '',
            address: currentContact?.address || '',
            plz: currentContact?.plz || '',
            city: currentContact?.city || '',
          },
          slot: null,
          notes: String(packed || '').slice(0, 2000),
          agent_name: currentUser?.name || '',
        },
      }).catch(() => {});
    }
    return;
  }
  const contact = currentContact || {};
  const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
  try {
    const data = {
      slot_id: slot.id, contact_id: isValidUUID(contact.id) ? contact.id : null,
      agent_id: currentUser.id, campaign_id: takvimCampId||selectedCampId, firm_id: currentUser.firm_id,
      nachname: `${contact.first_name||''} ${contact.last_name||''}`.trim() || contact.phone || '—',
      telefonnummer: contact.phone||'', telefon2: contact.phone2||'',
      strasse: contact.address||'', plz: contact.plz||'', ortschaft: contact.city||'',
      hausart: g('tf2-hausart'), baujahr: g('tf2-baujahr'), qm: g('tf2-qm'),
      heizung: g('tf2-heizung'), alter_der_heizung: g('tf2-alter_der_heizung'),
      verbrauch_pro_jahr: g('tf2-verbrauch_pro_jahr'), personen: g('tf2-personen'),
      ...(document.getElementById('tf2-interesse_an_pv') ? { interesse_an_pv: g('tf2-interesse_an_pv') === 'true' } : {}),
      agent_notu: terminNoteWithExtras('tf2-note'), durum: 'qc_bekleniyor',
      customer_id: mbResolveApptCustomerId('tf2-customer', takvimCampId||selectedCampId||contact.campaign_id),
      termin_tarih: `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00`
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    const ts = document.getElementById('termin-fields-section');
    if (ts) ts.style.display = 'none';
    const badge = document.getElementById('termin-slot-badge');
    if (badge) badge.textContent = 'Slot seçilmedi';
    if (typeof mbOutcomeCategory !== 'function' || mbOutcomeCategory(typeof mbFindOutcome === 'function' ? mbFindOutcome(selectedOutcome) : { key: selectedOutcome }) !== 'appointment') selectedOutcome = 'appointment';
    if (isValidUUID(contact.id) && typeof sb === 'function') {
      await sb(`contacts?id=eq.${contact.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'appointment', locked_by: null, locked_at: null, last_called_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    _releaseBookedContact(contact);
    toast('Randevu kaydedildi', 'ok', 1800);
    if (typeof mbDeliverApptNotice === 'function') {
      mbDeliverApptNotice({
        campaignId: data.campaign_id,
        phone: contact.phone || '',
        name: data.nachname,
        date: slot.tarih || '',
        time: saatNorm(slot.baslangic_saat),
        firmId: currentUser?.firm_id,
        payload: {
          appointment_id: aid || null,
          contact: { name: data.nachname, phone: contact.phone || '', phone2: contact.phone2 || '', address: contact.address || '', plz: contact.plz || '', city: contact.city || '' },
          slot: { date: slot.tarih || '', time: saatNorm(slot.baslangic_saat) },
          notes: String(data.agent_notu || '').slice(0, 2000),
          agent_name: currentUser?.name || '',
        },
      }).catch(() => {});
    }
    if (typeof submitOutcome === 'function') await submitOutcome(false);
    _bookingSlot = null;
    window._selectedBookingSlot = null;
    if (typeof switchContactTab === 'function') switchContactTab('info');
  } catch(e) {
    const msg = String(e?.message || e || '');
    if (/null value|not-null|23502/i.test(msg)) {
      toast('Randevu için zorunlu alanları doldurmalısınız', 'err', 4200);
      return;
    }
    toast('Hata: ' + msg, 'err');
    console.error(e);
  }
}

async function cancelTakvimBook(slotId) {
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})}).catch(()=>{});
  _bookingSlot = null;
  closeModal('m-takvim-detail');
}

async function submitTakvimBook(slotId) {
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf-customer', takvimCampId||selectedCampId||currentContact?.campaign_id)) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  if (!g('tf-name')||!g('tf-tel')||!g('tf-plz')||!g('tf-hausart')||!g('tf-bj')||!g('tf-qm')||!g('tf-hz')||!g('tf-ah')) {
    toast('Zorunlu alanları doldurun!','err'); return;
  }
  const slot = _bookingSlot || takvimSlots.find(s=>s.id===slotId);
  try {
    // Fix 22007: baslangic_saat may be 'HH:MM:SS' from DB — normalize to 'HH:MM'
    const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
    const data = {
      slot_id:slotId, contact_id:isValidUUID(currentContact?.id) ? currentContact.id : null,
      agent_id:currentUser.id, campaign_id:takvimCampId||selectedCampId, firm_id:currentUser.firm_id,
      nachname:g('tf-name'), telefonnummer:g('tf-tel'), telefon2:g('tf-tel2'),
      strasse:g('tf-str'), plz:g('tf-plz'), ortschaft:g('tf-ort'),
      hausart:g('tf-hausart'), baujahr:g('tf-bj'), qm:g('tf-qm'),
      heizung:g('tf-hz'), alter_der_heizung:g('tf-ah'), verbrauch_pro_jahr:g('tf-vj'),
      personen:g('tf-pe'), interesse_an_pv:g('tf-pv')==='true',
      agent_notu:g('tf-note'), durum:'qc_bekleniyor',
      customer_id: mbResolveApptCustomerId('tf-customer', takvimCampId||selectedCampId||currentContact?.campaign_id),
      termin_tarih: slot ? `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00` : new Date().toISOString()
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    _bookingSlot = null;
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Randevu kaydedildi ✓','ok');
    if (typeof mbDeliverApptNotice === 'function') {
      mbDeliverApptNotice({
        campaignId: data.campaign_id,
        phone: data.telefonnummer,
        name: data.nachname,
        date: slot?.tarih || '',
        time: slot ? saatNorm(slot.baslangic_saat) : '',
        firmId: currentUser?.firm_id,
        payload: {
          appointment_id: aid || null,
          contact: { name: data.nachname, phone: data.telefonnummer, phone2: data.telefon2 || '', address: data.strasse || '', plz: data.plz || '', city: data.ortschaft || '' },
          slot: slot ? { date: slot.tarih || '', time: saatNorm(slot.baslangic_saat) } : null,
          notes: String(data.agent_notu || '').slice(0, 2000),
          agent_name: currentUser?.name || '',
        },
      }).catch(() => {});
    }
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function openTakvimSettings() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  const c0 = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.find((c) => c.id === takvimCampId) : null;
  const c0Settings = _objOrEmpty(c0?.settings);
  let resolvedFirmId = c0?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  await ensureFirmTakvimDefaultsLoaded(resolvedFirmId);
  try {
    const rows = await sb(`campaigns?id=eq.${takvimCampId}&select=settings,firm_id`);
    const rowSettings = _objOrEmpty(rows?.[0]?.settings);
    const tk = _objOrEmpty(rowSettings?.takvim);
    resolvedFirmId = rows?.[0]?.firm_id || resolvedFirmId;
    const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((c) => c.id === takvimCampId) : -1;
    if (idx >= 0) {
      campaigns[idx] = { ...campaigns[idx], settings: { ...c0Settings, ...rowSettings, takvim: tk }, firm_id: rows?.[0]?.firm_id || campaigns[idx].firm_id };
    }
  } catch (_) {}
  const cfg = getCampaignTakvimSettings();
  const old = document.getElementById('m-takvim-settings');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-takvim-settings';
  m.className = 'modal-overlay open';
  const dayNames = {pzt:'Pazartesi',sal:'Salı',car:'Çarşamba',per:'Perşembe',cum:'Cuma',cmt:'Cumartesi',paz:'Pazar'};
  const slotOpts = [1, 2, 3, 4].map((n) =>
    `<option value="${n}"${cfg.slot_dur === n ? ' selected' : ''}>${n} saat</option>`
  ).join('');
  m.innerHTML = `<div class="modal" style="max-width:560px;">
<div class="modal-hdr">
<div class="modal-title">Takvim Ayarları</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px 10px;display:flex;flex-direction:column;gap:12px;">
<div style="display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:10px;">
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn active" data-tab="work" onclick="setTakvimSettingsTab('work')">Çalışma Düzeni</button>
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn" data-tab="slot" onclick="setTakvimSettingsTab('slot')">Slot Kuralları</button>
<button type="button" class="btn btn-ghost btn-sm ts-tab-btn" data-tab="confirm" onclick="setTakvimSettingsTab('confirm')">Onay</button>
</div>

<div id="ts-tab-work" class="ts-tab-pane" style="display:flex;flex-direction:column;gap:14px;">
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Çalışma Günleri</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;" id="ts-days">
${Object.entries(dayNames).map(([k, v]) => {
  const on = cfg.active_days.includes(k);
  const st = on ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '';
  return '<button type="button" class="btn btn-ghost btn-sm ts-day-btn' + (on ? ' active' : '') + '" data-d="' + k + '"'
    + ' style="' + st + '"'
    + ' onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'var(--accent)\':\'\';this.style.color=this.classList.contains(\'active\')?\'#fff\':\'\';this.style.borderColor=this.classList.contains(\'active\')?\'var(--accent)\':\'\';">'
    + v.slice(0, 3) + '</button>';
}).join('')}
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
<div class="form-row">
<label class="form-label">Başlangıç Saati</label>
<input type="time" class="form-input" id="ts-start" value="${cfg.start_hour}">
</div>
<div class="form-row">
<label class="form-label">Bitiş Saati</label>
<input type="time" class="form-input" id="ts-end" value="${cfg.end_hour}">
</div>
</div>
</div>

<div id="ts-tab-slot" class="ts-tab-pane" style="display:none;flex-direction:column;gap:14px;">
<div class="form-row">
<label class="form-label">Slot Süresi (saat)</label>
<select class="form-input" id="ts-slot-dur">${slotOpts}</select>
</div>
<div class="form-row">
<label class="form-label">Gün başına maks. slot</label>
<input type="number" class="form-input" id="ts-max-slots" value="${cfg.max_slots}" min="1" max="40" style="width:80px;">
</div>
</div>

<div id="ts-tab-confirm" class="ts-tab-pane" style="display:none;flex-direction:column;gap:14px;">
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
<input type="checkbox" id="ts-confirm-slot" ${cfg.confirm_new_slot !== false ? 'checked' : ''}> Yeni slot eklerken onay penceresi göster
</label>
<div style="font-size:10px;color:var(--text-3);">Kapalıysa hücreye tıklayınca doğrudan slot oluşturulur. Kullanıcı “Bir daha gösterme” seçtiyse tarayıcıda hızlı mod açılır.</div>
</div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">İptal</button>
<button class="btn btn-ghost" onclick="saveTakvimSettings(true)">Tümüne Uygula</button>
<button class="btn btn-primary" onclick="saveTakvimSettings(false)">Kaydet</button>
</div>
</div>`;
  document.body.appendChild(m);
  m.style.zIndex = '1205';
}

async function renderTakvimSettingsResultColorRows(firmId) {
  const root = document.getElementById('m-takvim-settings');
  const host = document.getElementById('ts-result-color-rows');
  if (!root || !host) return;
  const fid = firmId || getActiveFirmId() || currentUser?.firm_id;
  root.dataset.firmId = fid || '';
  if (!fid) {
    host.innerHTML = '<div style="font-size:12px;color:var(--text-3);">Firma seçimi bulunamadı.</div>';
    return;
  }
  const rows = await loadFirmAppointmentResults(fid, true).catch(() => defaultAppointmentResults());
  const safe = Array.isArray(rows) && rows.length ? rows : defaultAppointmentResults();
  host.innerHTML = safe.map((r, i) => {
    const color = /^#[0-9A-Fa-f]{6}$/.test(String(r.color || '').trim()) ? String(r.color).trim() : '#64748b';
    const label = String(r.label || r.key || '').trim();
    return `<div style="display:grid;grid-template-columns:1fr 88px;gap:10px;align-items:center;">
<div style="font-size:12px;font-weight:700;color:var(--text-2);">${label}</div>
<input type="color" class="form-input ts-result-color" data-key="${r.key}" value="${color}" style="width:84px;height:36px;padding:2px;">
</div>`;
  }).join('');
}

function setTakvimSettingsTab(tabId) {
  const root = document.getElementById('m-takvim-settings');
  if (!root) return;
  const panes = root.querySelectorAll('.ts-tab-pane');
  panes.forEach((pane) => {
    pane.style.display = pane.id === `ts-tab-${tabId}` ? 'flex' : 'none';
  });
  const tabs = root.querySelectorAll('.ts-tab-btn');
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.style.background = active ? 'var(--accent)' : '';
    btn.style.color = active ? '#fff' : '';
    btn.style.borderColor = active ? 'var(--accent)' : '';
  });
}

function _objOrEmpty(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v) || {}; } catch (_) { return {}; }
  }
  return {};
}

async function saveTakvimSettings(applyAll = false) {
  if (!takvimCampId) { toast('Kampanya seçili değil','err'); return; }
  const prevCfg = getCampaignTakvimSettings();
  const activeDays = [...document.querySelectorAll('.ts-day-btn.active')].map(b=>b.dataset.d);
  if (!activeDays.length) { toast('En az bir çalışma günü seçin', 'warn'); return; }
  const start    = document.getElementById('ts-start')?.value    || '08:00';
  const end      = document.getElementById('ts-end')?.value      || '20:00';
  const dur      = parseInt(document.getElementById('ts-slot-dur')?.value||'2');
  const maxSlots = parseInt(document.getElementById('ts-max-slots')?.value||'5');
  const bosColor = prevCfg.bos_color || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('ts-confirm-slot')?.checked;
  const takvimSettings = {
    active_days: activeDays,
    start_hour: start,
    end_hour: end,
    slot_dur: dur,
    max_slots: maxSlots,
    bos_color: bosColor,
    confirm_new_slot
  };
  try {
    const modal = document.getElementById('m-takvim-settings');
    const fid = modal?.dataset?.firmId || getActiveFirmId() || currentUser?.firm_id;

    if (applyAll) {
      if (!fid) { toast('Firma bilgisi eksik', 'err'); return; }
      const firmCamps = await sb(`campaigns?firm_id=eq.${fid}&select=id,settings`);
      for (const c of (firmCamps || [])) {
        const st = _objOrEmpty(c?.settings);
        await sb(`campaigns?id=eq.${c.id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ settings: { ...st, takvim: takvimSettings } })
        });
        const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((x) => x.id === c.id) : -1;
        if (idx >= 0) campaigns[idx].settings = { ..._objOrEmpty(campaigns[idx].settings), takvim: takvimSettings };
      }
    } else {
      const camps = await sb(`campaigns?id=eq.${takvimCampId}&select=settings`);
      const existingSettings = _objOrEmpty(camps?.[0]?.settings);
      await sb(`campaigns?id=eq.${takvimCampId}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...existingSettings, takvim: takvimSettings } })
      });
      const verifyRows = await sb(`campaigns?id=eq.${takvimCampId}&select=id,settings,firm_id&limit=1`);
      const savedSettings = _objOrEmpty(verifyRows?.[0]?.settings);
      const savedTakvim = _objOrEmpty(savedSettings.takvim);
      const idx = (typeof campaigns !== 'undefined' && campaigns) ? campaigns.findIndex((c) => c.id === takvimCampId) : -1;
      if (idx >= 0) {
        campaigns[idx].settings = {
          ..._objOrEmpty(campaigns[idx].settings),
          ...savedSettings,
          takvim: {
            ...takvimSettings,
            ...savedTakvim
          }
        };
        if (verifyRows?.[0]?.firm_id) campaigns[idx].firm_id = verifyRows[0].firm_id;
      }
    }
    document.getElementById('m-takvim-settings')?.remove();
    toast(applyAll ? 'Takvim ayarları tüm kampanyalara uygulandı ✓' : 'Takvim ayarları kaydedildi ✓', 'ok');
    if (takvimCampId) await loadTakvimSlots();
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

function openBulkSlotModal() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  openModal('m-bulk-slot');
}

async function saveBulkSlots() {
  const days = [...document.querySelectorAll('.bulk-day.active')].map(b=>parseInt(b.dataset.d));
  if (!days.length) { toast('En az 1 gün seçin','err'); return; }
  const count = parseInt(document.getElementById('bulk-count').value);
  const st = document.getElementById('bulk-start').value||'10:00';
  const [sh,sm] = st.split(':').map(Number);
  const hours = Array.from({length:count},(_,i)=>String(sh+i*2).padStart(2,'0')+':'+String(sm).padStart(2,'0'));
  const monday = takvimGetMonday(takvimDate);
  const slots = [];
  days.forEach(d=>{
    const dt = new Date(monday); dt.setDate(dt.getDate()+(d-1));
    const ds = takvimFmtD(dt);
    hours.forEach(h=>slots.push({campaign_id:takvimCampId,firm_id:currentUser.firm_id,tarih:ds,baslangic_saat:h,bitis_saat:takvimAddHours(h,takvimSlotDurHours()),durum:'bos',gun_kapali:false}));
  });
  try {
    await sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify(slots)});
    closeModal('m-bulk-slot');
    await loadTakvimSlots();
    toast(`${slots.length} slot eklendi ✓`,'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function takvimAdminRandevuEkle(slot) {
  if (!slot || slot.durum !== 'bos' || slot.gun_kapali) return;
  _bookingSlot = slot;
  openTakvimBookForm(slot);
}

async function takvimAdminKilitle(slot) {
  if (!slot || slot.durum !== 'bos' || slot.gun_kapali) return;
  if (!mbIsFirmAdmin()) return;
  try {
    await sb(`takvim_slots?id=eq.${slot.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        durum: 'kilitli',
        kilitli_agent_id: currentUser.id,
        kilitli_at: new Date().toISOString()
      })
    });
    await loadTakvimSlots();
    toast('Slot kilitlendi ✓', 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function openTakvimChangeCampaignModal(slot, appt) {
  if (!mbIsFirmAdmin()) return;
  document.getElementById('m-takvim-change-campaign')?.remove();
  const firmId = appt?.firm_id || slot?.firm_id || currentUser?.firm_id;
  if (!firmId) {
    toast('Firma bilgisi eksik', 'err');
    return;
  }
  let rows =
    typeof campaigns !== 'undefined' && Array.isArray(campaigns)
      ? campaigns.filter(
          (c) =>
            String(c.firm_id || '') === String(firmId) &&
            String(c.status || 'active').toLowerCase() === 'active'
        )
      : [];
  if (!rows.length) {
    rows = (await sb(`campaigns?firm_id=eq.${firmId}&status=eq.active&select=id,name&order=name.asc`).catch(() => [])) || [];
  }
  if (!rows.length) {
    toast('Aktif kampanya bulunamadı', 'warn');
    return;
  }
  const cur = String(appt?.campaign_id || slot?.campaign_id || takvimCampId || '');
  const m = document.createElement('div');
  m.id = 'm-takvim-change-campaign';
  m.className = 'modal-overlay open';
  m.innerHTML =
    '<div class="modal" style="max-width:420px;">' +
    '<div class="modal-hdr"><div class="modal-title">Kampanya değiştir</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-change-campaign\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">' +
    '<div class="form-row"><label class="form-label">Yeni kampanya</label>' +
    '<select class="form-input" id="tcc-sel">' +
    rows
      .map((c) => {
        const nm = String(c.name || '').replace(/[<>&"']/g, '');
        return `<option value="${c.id}" ${String(c.id) === cur ? 'selected' : ''}>${nm}</option>`;
      })
      .join('') +
    '</select></div>' +
    '<div style="font-size:11px;color:var(--text-3);">Randevu ve bu slot aynı kampanyaya bağlanır.</div></div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-change-campaign\')?.remove()">İptal</button>' +
    `<button type="button" class="btn btn-primary" onclick="takvimSaveChangeCampaign('${slot.id}','${appt.id}')">Kaydet</button>` +
    '</div></div>';
  document.body.appendChild(m);
}

async function takvimSaveChangeCampaign(slotId, apptId) {
  const sel = document.getElementById('tcc-sel');
  const newId = sel?.value;
  if (!newId) {
    toast('Kampanya seçin', 'warn');
    return;
  }
  try {
    await sb(`appointments?id=eq.${apptId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ campaign_id: newId })
    });
    await sb(`takvim_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ campaign_id: newId })
    });
    document.getElementById('m-takvim-change-campaign')?.remove();
    toast('Kampanya güncellendi ✓', 'ok');
    await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

function _takvimAddDays(dateObj, deltaDays) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + deltaDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Taşıma hedefi için ekrandaki haftadan bağımsız geniş aralıkta boş slotlar */
async function takvimFetchEmptySlotsForMove(campaignId, centerDate) {
  const c = centerDate instanceof Date ? new Date(centerDate) : new Date(centerDate);
  if (Number.isNaN(c.getTime())) c.setTime(Date.now());
  c.setHours(0, 0, 0, 0);
  const startD = takvimFmtD(_takvimAddDays(c, -42));
  const endD = takvimFmtD(_takvimAddDays(c, 84));
  const q = `takvim_slots?campaign_id=eq.${campaignId}&durum=eq.bos&gun_kapali=eq.false&tarih=gte.${startD}&tarih=lte.${endD}&order=tarih.asc,baslangic_saat.asc&select=id,tarih,baslangic_saat,bitis_saat,campaign_id,durum,gun_kapali,alta_tasindi,appointment_id`;
  const rows = await sb(q);
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(
    (s) =>
      s &&
      s.durum === 'bos' &&
      !s.gun_kapali &&
      !s.alta_tasindi &&
      (s.appointment_id == null || s.appointment_id === '')
  );
}

async function takvimExecuteMoveAppointment(fromSlotId, toSlotId, apptId) {
  const chk = await sb(`takvim_slots?id=eq.${toSlotId}&select=id,durum,appointment_id&limit=1`);
  const t = chk?.[0];
  if (!t || t.durum !== 'bos' || (t.appointment_id != null && String(t.appointment_id) !== '')) {
    toast('Hedef slot artık uygun değil; takvimi yenileyin.', 'warn');
    return false;
  }
  const srcRows = await sb(`takvim_slots?id=eq.${fromSlotId}&select=id,durum,appointment_id&limit=1`);
  const s0 = srcRows?.[0];
  if (!s0 || s0.durum !== 'dolu' || String(s0.appointment_id || '') !== String(apptId)) {
    toast('Kaynak slot güncellenmiş; takvimi yenileyin.', 'warn');
    return false;
  }
  const emptyPatch = {
    durum: 'bos',
    appointment_id: null,
    alta_tasindi: false,
    kilitli_agent_id: null,
    kilitli_at: null
  };
  const fillPatch = {
    durum: 'dolu',
    appointment_id: apptId,
    alta_tasindi: false,
    kilitli_agent_id: null,
    kilitli_at: null
  };
  try {
    await sb(`takvim_slots?id=eq.${fromSlotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(emptyPatch)
    });
    await sb(`takvim_slots?id=eq.${toSlotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(fillPatch)
    });
    return true;
  } catch (e) {
    try {
      await sb(`takvim_slots?id=eq.${fromSlotId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(fillPatch)
      });
    } catch (_) {}
    toast('Taşıma hatası: ' + e.message, 'err');
    return false;
  }
}

function takvimStartMovePickFromModal(fromSlotId, apptId, campaignId) {
  document.getElementById('m-takvim-move-appt')?.remove();
  window._takvimMovePick = { fromSlotId, apptId, campaignId: String(campaignId || '') };
  document.body.classList.add('takvim-move-pick');
  toast('Taşımak için aynı kampanyadaki boş slota tıklayın.', 'ok');
}

async function openTakvimMoveAppointmentModal(slot, appt) {
  if (!mbIsFirmAdmin()) return;
  document.getElementById('m-takvim-move-appt')?.remove();
  const camp = String(slot.campaign_id || takvimCampId || '');
  if (!camp) {
    toast('Kampanya bilgisi yok', 'warn');
    return;
  }
  const sid = slot.id;
  const aid = appt.id;
  const m = document.createElement('div');
  m.id = 'm-takvim-move-appt';
  m.className = 'modal-overlay open';
  m.innerHTML =
    '<div class="modal" style="max-width:440px;">' +
    '<div class="modal-hdr"><div class="modal-title">Randevuyu taşı</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-move-appt\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;" id="tma-body">' +
    '<div style="font-size:13px;color:var(--text-2);">Boş slotlar yükleniyor…</div></div>' +
    '<div class="modal-footer" id="tma-footer" style="display:none;">' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-move-appt\')?.remove()">İptal</button>' +
    `<button type="button" class="btn btn-primary" onclick="takvimSaveMoveAppointment('${sid}','${aid}')">Taşı</button>` +
    '</div></div>';
  document.body.appendChild(m);
  let center = takvimDate;
  if (slot.tarih && /^\d{4}-\d{2}-\d{2}$/.test(String(slot.tarih))) {
    const p = String(slot.tarih).split('-').map(Number);
    center = new Date(p[0], p[1] - 1, p[2]);
    center.setHours(0, 0, 0, 0);
  }
  let targets = [];
  try {
    targets = (await takvimFetchEmptySlotsForMove(camp, center)).filter((s) => s.id !== sid);
  } catch (e) {
    const body = document.getElementById('tma-body');
    if (body) body.innerHTML = `<div style="color:var(--red);font-size:13px;">Yüklenemedi: ${String(e.message || e)}</div>`;
    return;
  }
  const body = document.getElementById('tma-body');
  const footer = document.getElementById('tma-footer');
  if (!targets.length) {
    if (body) {
      body.innerHTML =
        '<div style="font-size:13px;color:var(--text-2);line-height:1.45;">Bu tarih aralığında uygun boş slot bulunamadı. İsterseniz takvimde bir boş slota tıklayarak taşıyın.</div>' +
        `<div style="margin-top:12px;"><button type="button" class="btn btn-primary" onclick="takvimStartMovePickFromModal('${sid}','${aid}','${camp}')">Takvimde seç</button></div>`;
    }
    if (footer) footer.style.display = 'none';
    return;
  }
  const byDate = new Map();
  targets.forEach((s) => {
    const k = s.tarih || '';
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(s);
  });
  let opts = '';
  for (const [d, arr] of byDate) {
    opts +=
      `<optgroup label="${d}">` +
      arr
        .map(
          (s) =>
            `<option value="${s.id}">${String(s.baslangic_saat || '').slice(0, 5)}–${String(s.bitis_saat || '').slice(0, 5)}</option>`
        )
        .join('') +
      '</optgroup>';
  }
  if (body) {
    body.innerHTML =
      '<div class="form-row"><label class="form-label">Hedef boş slot</label>' +
      '<select class="form-input" id="tma-sel">' +
      opts +
      '</select></div>' +
      '<div style="font-size:11px;color:var(--text-3);">Aynı kampanya; yakın tarihlerdeki boş slotlar (ekrandaki haftadan geniş). Mevcut slot boşalır.</div>' +
      `<div style="margin-top:10px;"><button type="button" class="btn btn-ghost" onclick="takvimStartMovePickFromModal('${sid}','${aid}','${camp}')">Takvimde tıkla</button></div>`;
  }
  if (footer) footer.style.display = '';
}

async function takvimSaveMoveAppointment(fromSlotId, apptId) {
  const toId = document.getElementById('tma-sel')?.value;
  if (!toId) {
    toast('Hedef slot seçin', 'warn');
    return;
  }
  if (!(await mbConfirm('Randevu seçilen boş slota taşınsın mı?', 'Randevuyu taşı'))) return;
  const ok = await takvimExecuteMoveAppointment(fromSlotId, toId, apptId);
  if (!ok) return;
  takvimClearMovePickMode();
  document.getElementById('m-takvim-move-appt')?.remove();
  await loadTakvimSlots();
  toast('Randevu taşındı ✓', 'ok');
}
