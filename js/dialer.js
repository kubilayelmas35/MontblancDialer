// ─────────────────────────────────────────────
// DIALER — agent dialer, call management
// ─────────────────────────────────────────────

async function initDialer() {
  if (!currentUser) return;
  try {
    let myCamps = await sb(`agent_campaigns?select=*,campaigns(*,queues(*))&agent_id=eq.${currentUser.id}`) || [];
    if (!myCamps.length) {
      const allCamps = await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${currentUser.firm_id}&order=created_at.desc`) || [];
      myCamps = allCamps.map(c => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
    }
    const list = document.getElementById('agent-camp-list');
    if (!myCamps.length) {
      list.innerHTML=`<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">Kampanya atanmamış<br><small style="font-size:10px;">Admin sizi bir kampanyaya atamalı</small></div>`;
      return;
    }
    // Tüm kampanyaları varsayılan aktif yap (ilk yüklemede)
    if (!_activeCampIds.length) {
      _activeCampIds = myCamps.map(ac => ac.campaign_id);
    }
    list.innerHTML = myCamps.map(ac=>{
      const q = ac.campaigns?.queues;
      const tot = q ? q.reduce((s,qq)=>s+(qq.total_contacts||0),0).toLocaleString() : '—';
      const isActive = _activeCampIds.includes(ac.campaign_id);
      const cid = ac.campaign_id;
      return `<div class="agent-camp-item ${isActive?'active':''}" id="camp-item-${cid}" style="padding:8px 10px;">
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <div style="flex:1;min-width:0;">
    <div class="agent-camp-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ac.campaigns?.name||cid}</div>
    <div style="font-size:10px;color:var(--text-3);margin-top:1px;">${tot} kişi · ${ac.campaigns?.dial_speed||1} hat</div>
  </div>
  <!-- Toggle switch -->
  <label style="position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0;cursor:pointer;" title="${isActive?'Kapat':'Aktif Et'}">
    <input type="checkbox" ${isActive?'checked':''} onchange="toggleCampActive('${cid}',this.checked)"
      style="opacity:0;width:0;height:0;">
    <span style="position:absolute;inset:0;background:${isActive?'var(--accent)':'var(--border)'};border-radius:10px;transition:.25s;" id="camp-slider-${cid}">
      <span style="position:absolute;top:3px;left:${isActive?'19':'3'}px;width:14px;height:14px;background:#fff;border-radius:50%;transition:.25s;" id="camp-knob-${cid}"></span>
    </span>
  </label>
</div>
</div>`;
    }).join('');
    if (!selectedCampId && myCamps.length) selectCamp(myCamps[0].campaign_id, myCamps[0].campaigns?.name||'');
    if (!myCamps.length) {
      const notice = document.getElementById('camp-required-notice');
      if (notice) notice.style.display = 'flex';
    }
  } catch(e){ console.error('initDialer err:', e); }
  loadMyMiniStats();
  loadWvBadge();
  startTickerPoll();
  const goalBar = document.getElementById('daily-goal-bar');
  if (goalBar) goalBar.style.display = '';
  _dailyGoal = parseInt(localStorage.getItem('mb_daily_goal')||'5');
  renderHotkeyHints();
  const hints = document.getElementById('hotkey-hints');
  if (hints) hints.style.display = '';
}

// Kampanya aktif/pasif toggle
function toggleCampActive(campId, checked) {
  if (checked) {
    if (!_activeCampIds.includes(campId)) _activeCampIds.push(campId);
  } else {
    _activeCampIds = _activeCampIds.filter(id => id !== campId);
  }
  // Görsel güncelle
  const item   = document.getElementById(`camp-item-${campId}`);
  const slider = document.getElementById(`camp-slider-${campId}`);
  const knob   = document.getElementById(`camp-knob-${campId}`);
  if (item)   item.classList.toggle('active', checked);
  if (slider) slider.style.background = checked ? 'var(--accent)' : 'var(--border)';
  if (knob)   knob.style.left = checked ? '19px' : '3px';
  // selectedCampId'yi güncelle: aktif kampanya yoksa ilkini seç
  if (!_activeCampIds.includes(selectedCampId) && _activeCampIds.length) {
    selectedCampId = _activeCampIds[0];
  }
  const countStr = _activeCampIds.length === 0 ? 'Hiç kampanya aktif değil' :
    `${_activeCampIds.length} kampanya aktif`;
  toast(checked ? `✓ Aktif: ${countStr}` : `Pasif: ${countStr}`, checked ? 'ok' : 'warn', 2000);
}

function selectCamp(id, name) {
  selectedCampId = id;
  const lbl = document.getElementById('dialer-camp-label');
  if (lbl) lbl.textContent = name || id;
  // Store aux codes from campaign settings
  const camp = campaigns.find(c=>c.id===id);
  if (camp?.qc_settings) {
    try {
      const qs = typeof camp.qc_settings==='string' ? JSON.parse(camp.qc_settings) : camp.qc_settings;
      if (qs.aux_codes?.length) window._campAuxCodes = qs.aux_codes;
    } catch(e){}
  }
  // Re-render camp list to reflect active state
  document.querySelectorAll('.agent-camp-item').forEach(el => {
    el.classList.toggle('active', el.querySelector('[onclick]')?.getAttribute('onclick')?.includes(id)||false);
  });
  const fakeBtn = document.getElementById('fake-call-btn');
  if (fakeBtn) fakeBtn.style.display = '';
  const btn = document.getElementById('btn-ready');
  const notice = document.getElementById('camp-required-notice');
  if (btn) {
    btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; btn.title = '';
    const txt = document.getElementById('ready-text');
    if (txt) txt.setAttribute('data-tr', 'Hazır — Aramayı Başlat');
    applyLang();
  }
  if (notice) notice.style.display = 'none';
}

let _perfTab = 'today';
let _goalTab = 'daily';

function setPerfTab(tab) {
  _perfTab = tab;
  ['today','week','month'].forEach(t => {
    const b = document.getElementById(`perf-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--accent)' : 'transparent'; b.style.color = t===tab ? '#fff' : 'var(--text-2)'; }
  });
  loadMyMiniStats();
}

function setGoalTab(tab) {
  _goalTab = tab;
  ['daily','weekly','monthly'].forEach(t => {
    const b = document.getElementById(`goal-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--accent)' : 'transparent'; b.style.color = t===tab ? '#fff' : 'var(--text-2)'; }
  });
  const labels = {daily:'Günlük Hedef', weekly:'Haftalık Hedef', monthly:'Aylık Hedef'};
  const lbl = document.getElementById('goal-tab-label');
  if (lbl) lbl.textContent = labels[tab]||'Hedef';
  loadMyMiniStats();
}

async function loadMyMiniStats() {
  try {
    const now = new Date();
    let since;
    if (_perfTab === 'today') {
      since = now.toISOString().split('T')[0] + 'T00:00:00';
    } else if (_perfTab === 'week') {
      const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay()||7) + 1); mon.setHours(0,0,0,0);
      since = mon.toISOString();
    } else {
      since = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
    }
    const logs = await sb(`call_logs?select=outcome&agent_id=eq.${currentUser?.id}&started_at=gte.${since}`);
    const appts = (logs||[]).filter(l=>l.outcome==='appointment').length;
    const calls = (logs||[]).length;
    const neg = (logs||[]).filter(l=>l.outcome==='negative').length;
    const cb = (logs||[]).filter(l=>l.outcome==='callback').length;
    document.getElementById('my-appt').textContent = appts;
    document.getElementById('my-calls').textContent = calls;

    // Goal depends on tab
    let goalVal = _dailyGoal;
    if (_goalTab === 'weekly') goalVal = _dailyGoal * 5;
    else if (_goalTab === 'monthly') goalVal = _dailyGoal * 22;
    let goalAppts = appts;
    if (_goalTab === 'weekly') {
      const monSince = new Date(now); monSince.setDate(now.getDate()-(now.getDay()||7)+1); monSince.setHours(0,0,0,0);
      const wl = await sb(`call_logs?select=outcome&agent_id=eq.${currentUser?.id}&started_at=gte.${monSince.toISOString()}&outcome=eq.appointment`);
      goalAppts = (wl||[]).length;
    } else if (_goalTab === 'monthly') {
      const monSince = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
      const ml = await sb(`call_logs?select=outcome&agent_id=eq.${currentUser?.id}&started_at=gte.${monSince}&outcome=eq.appointment`);
      goalAppts = (ml||[]).length;
    }
    updateDailyProgress(goalAppts, goalVal);

    document.getElementById('my-stats-mini').innerHTML=`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--green);font-family:var(--mono);">${appts}</div>
<div style="font-size:10px;color:var(--text-3);">Termin</div>
</div>
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--accent);font-family:var(--mono);">${calls}</div>
<div style="font-size:10px;color:var(--text-3);">Çağrı</div>
</div>
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--red);font-family:var(--mono);">${neg}</div>
<div style="font-size:10px;color:var(--text-3);">Olumsuz</div>
</div>
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--yellow);font-family:var(--mono);">${cb}</div>
<div style="font-size:10px;color:var(--text-3);">Geri Ara</div>
</div>`;
    loadUpcomingWv();
  } catch(e){ console.error('stats err:',e); }
}

async function loadUpcomingWv() {
  const el = document.getElementById('upcoming-wv-list');
  if (!el) return;
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48*60*60*1000).toISOString();
    const list = await sb(`wiedervorlage?agent=eq.${currentUser?.name}&durum=eq.bekliyor&termin_zaman=lte.${soon}&order=termin_zaman.asc&limit=5`);
    if (!list?.length) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">Yaklaşan arama yok</div>'; return; }
    el.innerHTML = list.map(w => {
      const dt = new Date(w.termin_zaman);
      const timeStr = dt.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const isOverdue = dt < now;
      return `<div style="padding:5px 8px;background:var(--bg-3);border-radius:5px;border-left:3px solid ${isOverdue?'var(--red)':'var(--yellow)'};" onclick="navigate('wiedervorlage')">
<div style="font-weight:700;font-size:11px;color:${isOverdue?'var(--red)':'var(--text)'};">${w.nachname||w.telefon}</div>
<div style="font-size:10px;color:var(--text-3);">${timeStr}</div>
</div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">—</div>'; }
}

async function toggleReady() {
  if (dialerStatus==='offline' || dialerStatus==='break') {
    if (!selectedCampId) { toast(currentLang==='tr'?'Önce kampanya seçin':'Kampagne auswählen','err'); return; }
    if (!telnyxReady && !_testMode) { toast(currentLang==='tr'?'Telnyx bağlanıyor, bekleyin...':'Telnyx verbindet sich...','err'); return; }
    setDialerStatus('ready');
    try {
      await sb('agent_sessions',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({agent_id:currentUser.email,agent_name:currentUser.name,status:'ready',last_ready_at:new Date().toISOString()})
      });
    } catch(e){}
    setTimeout(()=>dialNext(), 500);
  } else if (dialerStatus==='ready') {
    setDialerStatus('offline');
    try {
      await sb(`agent_sessions?agent_id=eq.${currentUser.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({status:'offline'})});
    } catch(e){}
  }
}

function setDialerStatus(s) {
  dialerStatus = s;
  const dot    = document.getElementById('status-dot');
  const label  = document.getElementById('status-label');
  const rdyBtn = document.getElementById('btn-ready');
  const rdyTxt = document.getElementById('ready-text');
  const rdyIc  = document.getElementById('ready-icon');
  if (dot) { dot.className = `status-dot ${s}`; }
  const labels = {
    offline: {tr:'Çevrimdışı',de:'Offline'},
    ready:   {tr:'Hazır — Arama Bekleniyor',de:'Bereit — Warte auf Anruf'},
    on_call: {tr:'Aramada',de:'Im Gespräch'},
    wrapping:{tr:'Sonuç Giriliyor',de:'Nachbearbeitung'},
    break:   {tr:'Mola',de:'Pause'},
  };
  if (label) label.textContent = labels[s]?.[currentLang]||s;
  if (s==='offline'||s==='break') {
    if (rdyBtn) rdyBtn.className='btn-ready-big ready';
    if (rdyIc) rdyIc.textContent='▶';
    if (rdyTxt) rdyTxt.textContent=currentLang==='tr'?'Hazır — Aramayı Başlat':'Bereit schalten';
    document.getElementById('ready-section').style.display='';
    document.getElementById('outcome-section').style.display='none';
    document.getElementById('call-actions').style.display='none';
    document.getElementById('customer-card').style.display='';
  } else if (s==='ready') {
    if (rdyBtn) rdyBtn.className='btn-ready-big stop';
    if (rdyIc) rdyIc.textContent='⏹';
    if (rdyTxt) rdyTxt.textContent=currentLang==='tr'?'Durdur':'Stoppen';
    document.getElementById('ready-section').style.display='';
    document.getElementById('outcome-section').style.display='none';
    document.getElementById('call-actions').style.display='none';
    document.getElementById('customer-card').style.display='';
  } else if (s==='on_call') {
    document.getElementById('ready-section').style.display='none';
    document.getElementById('outcome-section').style.display='none';
    document.getElementById('call-actions').style.display='';
    document.getElementById('dialer-timer').style.display='';
    document.getElementById('customer-card').style.display='';
    startCallTimer();
  } else if (s==='wrapping') {
    if (typeof startAcwTimer === 'function') startAcwTimer();
    document.getElementById('ready-section').style.display='none';
    document.getElementById('call-actions').style.display='none';
    stopCallTimer();
    const hasSlot = _bookingSlot || window._selectedBookingSlot;
    if (hasSlot) {
      // Slot seçiliyse direkt termin modunu göster
      document.getElementById('outcome-section').style.display='none';
      document.getElementById('customer-card').style.display='';
    } else {
      document.getElementById('outcome-section').style.display='';
      document.getElementById('customer-card').style.display='none';
    }
  }
}

async function dialNext() {
  if (dialerStatus !== 'ready') return;
  if (!_testMode && !checkCallAllowed()) return;

  // Test modunda Telnyx gerekmez
  if (_testMode) {
    await startTestCall();
    return;
  }

  if (!telnyxReady) {
    toast(currentLang==='tr' ? 'Telnyx bağlantısı bekleniyor...' : 'Warte auf Telnyx-Verbindung...', 'err');
    return;
  }
  const contact = await getNextContact();
  if (!contact) {
    toast(currentLang==='tr' ? '✅ Kuyrukta numara kalmadı' : '✅ Keine Nummern mehr', 'ok');
    setDialerStatus('offline'); updateSessionInDB('offline');
    return;
  }
  currentContact = contact;
  showCustomerCard(contact);
  try {
    await sb(`contacts?id=eq.${contact.id}`, { method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ status:'calling', last_called_at: new Date().toISOString() })
    });
  } catch(e) {}
  const campaign = campaigns.find(c => c.id === selectedCampId);
  sendToRTC('MB_CALL', { destination: contact.phone, callerNumber: campaign?.telnyx_did || '' });
}

async function updateSessionInDB(status) {
  if (!currentUser) return;
  try {
    await upsertAgentSession({
      agent_id: currentUser.id, agent_name: currentUser.name,
      status, last_seen: new Date().toISOString()
    });
  } catch(e) {}
}

// ── Call timer ────────────────────────────────
function startCallTimer() {
  callSeconds = 0;
  callTimerInt = setInterval(()=>{
    callSeconds++;
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0');
    const s=String(callSeconds%60).padStart(2,'0');
    document.getElementById('dialer-timer').textContent=`${m}:${s}`;
  },1000);
}

function stopCallTimer() {
  clearInterval(callTimerInt);
  document.getElementById('dialer-timer').style.display='none';
}

// ── Call controls ─────────────────────────────
function toggleMute() {
  isMuted=!isMuted;
  document.getElementById('btn-mute')?.classList.toggle('active',isMuted);
  sendToRTC('MB_MUTE',{muted:isMuted});
  toast(isMuted?(currentLang==='tr'?'Mikrofon kapatıldı':'Mikrofon stumm'):(currentLang==='tr'?'Mikrofon açıldı':'Mikrofon aktiv'),'ok');
}

function toggleHold() {
  isOnHold=!isOnHold;
  document.getElementById('btn-hold')?.classList.toggle('active',isOnHold);
  sendToRTC('MB_HOLD',{hold:isOnHold});
  toast(isOnHold?(currentLang==='tr'?'Çağrı beklemeye alındı':'Anruf gehalten'):(currentLang==='tr'?'Çağrı devam ediyor':'Anruf fortgesetzt'),'ok');
}

function hangup() {
  if (_fakeCallActive || _testMode) { endFakeCall(); return; }
  sendToRTC('MB_HANGUP');
  if (!telnyxReady || !_telnyxCall) handleCallEnd(Math.floor(callSeconds));
}

function setOutcome(o) {
  selectedOutcome = o;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  const map = {appointment:'.ob-appointment',negative:'.ob-negative',callback:'.ob-callback',no_answer:'.ob-noanswer',voicemail:'.ob-voicemail'};
  if (map[o]) document.querySelector(map[o])?.classList.add('active');
  const cbRow = document.getElementById('callback-row');
  if (cbRow) cbRow.style.display = o==='callback' ? '' : 'none';
}

async function submitOutcome(goBreak) {
  if (!selectedOutcome) { toast(currentLang==='tr'?'Sonuç seçin':'Ergebnis auswählen','err'); return; }
  const note   = document.getElementById('outcome-note')?.value.trim()||'';
  const cbTime = document.getElementById('callback-dt')?.value||null;
  const isDnc  = document.getElementById('outcome-dnc')?.checked || false;
  try {
    if (currentContact) {
      const finalOutcome = isDnc ? 'dnc' : (selectedOutcome === 'appointment_done' ? 'appointment' : selectedOutcome);
      const statusMap = {appointment:'appointment',appointment_done:'appointment',negative:'negative',callback:'callback',no_answer:'no_answer',dnc:'dnc'};
      const contactPatch = {
        status: statusMap[finalOutcome],
        attempt_count: (currentContact.attempt_count||0)+1,
        last_called_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null
      };
      await sb(`contacts?id=eq.${currentContact.id}`,{method:'PATCH',prefer:'return=minimal',
        body:JSON.stringify(contactPatch)
      });
      if (isDnc) await addToDnc(currentContact.phone, currentContact.id);
      const logData = {
        contact_id: currentContact.id,
        campaign_id: selectedCampId,
        firm_id: currentUser.firm_id,
        agent_id: currentUser.id,
        phone: currentContact.phone,
        outcome: isDnc ? 'dnc' : selectedOutcome,
        notes: note,
        duration_sec: callSeconds,
        started_at: new Date(Date.now()-callSeconds*1000).toISOString(),
        ended_at: new Date().toISOString(),
      };
      // telnyx_call_id may not exist in all schemas
      if (activeCallId) { try { logData.telnyx_call_id = activeCallId; } catch(e) {} }
      await sb('call_logs',{method:'POST',prefer:'return=minimal',body:JSON.stringify(logData)});
      if (currentContact.queue_id) {
        sb(`queues?id=eq.${currentContact.queue_id}`,{method:'PATCH',prefer:'return=minimal',
          body:JSON.stringify({dialed_count:(currentContact.dialed_count||0)+1})
        }).catch(()=>{});
      }
    }
  } catch(e){ console.error(e); toast('Kayıt hatası: '+e.message,'err'); }
  // Termin dışı sonuç seçilirse kilitli slot serbest bırak
  const lockedSlotId = _bookingSlot?.id || window._selectedBookingSlot?.id;
  if (lockedSlotId && selectedOutcome !== 'appointment' && selectedOutcome !== 'appointment_done') {
    sb(`takvim_slots?id=eq.${lockedSlotId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})
    }).catch(()=>{});
    _bookingSlot = null; window._selectedBookingSlot = null;
  }
  // Termin → Takvim aç (sadece slot henüz seçilmemişse; appointment_done slot zaten kaydedildi)
  if (selectedOutcome==='appointment' && !isDnc) {
    openTakvimOverlay();
    if (currentContact) {
      setTimeout(() => {
        const wvPrefill = {
          phone: currentContact.phone, phone2: currentContact.phone2||'',
          first_name: currentContact.first_name||'', last_name: currentContact.last_name||'',
          plz: currentContact.plz||'', city: currentContact.city||'',
          address: currentContact.address||''
        };
        window._wvPrefill = wvPrefill;
      }, 500);
    }
  }
  // Callback → WV ekle
  if (selectedOutcome==='callback' && cbTime && currentContact) {
    try {
      await sb('wiedervorlage',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
        nachname: `${currentContact.first_name||''} ${currentContact.last_name||''}`.trim() || currentContact.phone,
        telefon: currentContact.phone, telefon2: currentContact.phone2||'',
        plz: currentContact.plz||'', ort: currentContact.city||'', strasse: currentContact.address||'',
        termin_zaman: new Date(cbTime).toISOString(),
        agent: currentUser.name||currentUser.email,
        durum: 'bekliyor',
        notiz: note
      })});
    } catch(e) {}
  }
  // ACW timer başlat
  setDialerStatus('wrapping');
  selectedOutcome = null;
  currentContact = null;
  clearCustomerCard();
  loadMyMiniStats();
  if (goBreak) {
    setDialerStatus('break');
    upsertAgentSession({agent_id:currentUser.id,status:'break',last_seen:new Date().toISOString()}).catch(()=>{});
    openBreakModal();
  } else {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id,status:'ready',last_seen:new Date().toISOString()}).catch(()=>{});
    if (_autoDial) {
      const callCheck = isCallAllowed(new Date().toISOString().split('T')[0], new Date().toTimeString().slice(0,8));
      if (!callCheck.allowed) {
        toast('⏸ Otomatik arama duraklatıldı: ' + callCheck.reason, 'warn', 6000);
        _autoDial = false;
        const tog = document.getElementById('auto-dial-toggle');
        if (tog) tog.checked = false;
      } else {
        setTimeout(()=>dialNext(), 1200);
      }
    }
  }
}

function handleAppointmentClick() {
  setOutcome('appointment');
  // Takvim overlay'ini aç — agent slot seçer
  openTakvimOverlay();
  toast('Takvimden uygun bir slot seçin', 'ok', 3500);
}

// Called from appointments.js when agent selects a slot
function onAgentSlotSelected(slot) {
  window._selectedBookingSlot = slot;
  _bookingSlot = slot;
  setOutcome('appointment');

  // Termin moduna geç: outcome section gizle, customer-card göster
  document.getElementById('outcome-section').style.display = 'none';
  document.getElementById('customer-card').style.display = '';

  // Müşteri kartını yeniden render et (termin bölümüyle birlikte)
  if (currentContact) showCustomerCard(currentContact);

  // termin-fields-section'ı göster ve slot başlığını güncelle
  const terminSection = document.getElementById('termin-fields-section');
  if (terminSection) {
    terminSection.style.display = '';
    const hdr = terminSection.querySelector('.termin-slot-hdr');
    if (hdr) hdr.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${slot.tarih} · ${(slot.baslangic_saat||'').slice(0,5)}–${(slot.bitis_saat||'').slice(0,5)}`;
    const badge = document.getElementById('termin-slot-badge');
    if (badge) badge.textContent = `${slot.tarih} ${(slot.baslangic_saat||'').slice(0,5)}`;
  }

  // Mevcut müşteri verisiyle form alanlarını önceden doldur
  if (currentContact) {
    const pre = {
      'tf2-hausart': currentContact.hausart,
      'tf2-baujahr': currentContact.baujahr,
      'tf2-qm':      currentContact.qm,
      'tf2-heizung': currentContact.heizung,
      'tf2-alter_der_heizung': currentContact.alter_der_heizung,
      'tf2-verbrauch_pro_jahr': currentContact.verbrauch_pro_jahr,
      'tf2-personen': currentContact.personen
    };
    Object.entries(pre).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    });
  }

  // Termin formunun en altına "İptal" butonu ekle (yoksa)
  if (!document.getElementById('termin-cancel-slot-btn') && terminSection) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'termin-cancel-slot-btn';
    cancelBtn.style.cssText = 'margin-top:6px;width:100%;padding:6px;background:transparent;color:var(--text-3);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;';
    cancelBtn.textContent = '↩ Slotu İptal Et — Sonuç Seçimine Dön';
    cancelBtn.onclick = cancelSlotAndShowOutcome;
    terminSection.appendChild(cancelBtn);
  }

  // Scroll to termin form
  setTimeout(() => {
    terminSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);

  toast('Slot seçildi — termin bilgilerini doldurun', 'ok', 3000);
}

// Slot iptal et ve outcome seçimine dön
function cancelSlotAndShowOutcome() {
  const slotId = (_bookingSlot || window._selectedBookingSlot)?.id;
  if (slotId) {
    sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({durum:'bos', kilitli_agent_id:null, kilitli_at:null})
    }).catch(()=>{});
  }
  _bookingSlot = null;
  window._selectedBookingSlot = null;
  selectedOutcome = null;
  // Outcome section'ı tekrar göster
  document.getElementById('customer-card').style.display = 'none';
  document.getElementById('outcome-section').style.display = '';
  const cancelBtn = document.getElementById('termin-cancel-slot-btn');
  if (cancelBtn) cancelBtn.remove();
  toast('Slot iptal edildi', 'warn', 2000);
}

async function updateTerminField(key, value) {
  if (!currentContact?.id) return;
  currentContact[key] = value;
  try {
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({[key]: value || null})
    });
  } catch(e) {}
}

function getTerminFieldValues() {
  if (!currentContact) return {};
  const keys = ['hausart','baujahr','qm','heizung','alter_der_heizung','verbrauch_pro_jahr','personen'];
  const vals = {};
  keys.forEach(k => {
    const el = document.getElementById('tf2-' + k);
    vals[k] = el ? el.value : (currentContact[k] || '');
  });
  return vals;
}

function validateTerminFields() {
  const required = ['hausart','baujahr','qm','heizung','alter_der_heizung'];
  const missing = [];
  required.forEach(k => {
    const el = document.getElementById('tf2-' + k);
    const val = el ? el.value.trim() : (currentContact?.[k] || '');
    if (!val) {
      missing.push(k);
      if (el) { el.style.borderColor = 'var(--red)'; el.style.boxShadow = '0 0 0 2px rgba(220,38,38,.2)'; }
    } else {
      if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    }
  });
  return missing;
}

// ── Break / Mola modal ────────────────────────
function openBreakModal() {
  const auxCodes = window._campAuxCodes || DEFAULT_AUX_CODES;
  const old = document.getElementById('m-break-select');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-break-select';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div style="background:var(--bg-2);border-radius:var(--radius);padding:20px;width:280px;box-shadow:0 16px 48px rgba(0,0,0,.3);">
<div style="font-size:14px;font-weight:800;margin-bottom:12px;">Mola Türü Seç</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${auxCodes.map(c=>`<button onclick="selectBreakCode('${c}');this.closest('#m-break-select').remove();"
style="padding:10px 14px;border:1px solid var(--border);background:var(--bg-3);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;text-align:left;color:var(--text);">${c}</button>`).join('')}
</div>
<button onclick="this.closest('#m-break-select').remove();"
style="margin-top:10px;width:100%;padding:8px;background:transparent;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-3);">Kapat</button>
</div>`;
  document.body.appendChild(m);
}

async function selectBreakCode(code) {
  toast(`☕ Mola: ${code}`, 'ok', 2000);
  upsertAgentSession({agent_id:currentUser.id,status:'break',break_code:code,last_seen:new Date().toISOString()}).catch(()=>{});
}

// ── Auto-dial ─────────────────────────────────
function toggleAutoDial() {
  _autoDial = !_autoDial;
  const cb = document.getElementById('auto-dial-toggle');
  const slider = document.getElementById('auto-dial-slider');
  const knob = document.getElementById('auto-dial-knob');
  if (cb) cb.checked = _autoDial;
  if (slider) slider.style.background = _autoDial ? 'var(--accent)' : 'var(--text-3)';
  if (knob) knob.style.transform = _autoDial ? 'translateX(18px)' : 'translateX(0)';
  toast(_autoDial ? '⚡ Otomatik arama açık' : '⏸ Otomatik arama kapalı', 'ok', 1500);
}

// ── Gamification ──────────────────────────────
function updateDailyProgress(apptCount, customGoal) {
  _dailyAppointments = apptCount;
  const el = document.getElementById('daily-progress-bar');
  const label = document.getElementById('daily-progress-label');
  if (!el) return;
  const goal = customGoal || _dailyGoal;
  const pct = Math.min(100, Math.round((apptCount/goal)*100));
  el.style.width = pct + '%';
  el.style.background = pct>=100 ? 'var(--green)' : pct>=60 ? 'var(--yellow)' : 'var(--accent)';
  if (label) label.textContent = `${apptCount}/${goal} Termin`;
  if (pct>=100 && !_confettiShown && _goalTab==='daily') { _confettiShown = true; launchConfetti(); }
}

function launchConfetti() {
  const colors = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  for (let i=0; i<80; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random()*colors.length)];
    const size = Math.random()*8+4;
    const left = Math.random()*100;
    const delay = Math.random()*2;
    const duration = Math.random()*2+2;
    piece.style.cssText = `position:absolute;top:-20px;left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random()>0.5?'50%':'2px'};animation:confetti-fall ${duration}s ${delay}s ease-in forwards;`;
    container.appendChild(piece);
  }
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `@keyframes confetti-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}`;
    document.head.appendChild(style);
  }
  setTimeout(() => container.remove(), 5000);
  toast('🎉 Günlük hedefe ulaştınız!', 'ok', 4000);
}

// ── Hotkeys ───────────────────────────────────
function renderHotkeyHints() {
  const el = document.getElementById('hotkey-hints');
  if (!el) return;
  el.innerHTML = `
<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--text-3);">
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Space</kbd> Mute</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Enter</kbd> Kapat/İleri</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">1-4</kbd> Sonuç</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">S</kbd> Kaydet</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Esc</kbd> Kapat</span>
</div>`;
}

document.addEventListener('keydown', e => {
  if (!_hotkeysEnabled) return;
  const tag = e.target.tagName.toLowerCase();
  if (tag==='input'||tag==='textarea'||tag==='select') return;
  if (e.altKey||e.ctrlKey||e.metaKey) return;
  const dialerPage = document.getElementById('page-dialer');
  if (!dialerPage?.classList.contains('active')) return;
  switch(e.code) {
    case 'Space': e.preventDefault(); if (dialerStatus==='on_call') toggleMute(); break;
    case 'Enter':
      e.preventDefault();
      if (dialerStatus==='on_call') hangup();
      else if (dialerStatus==='ready') getNextContact();
      break;
    case 'Digit1': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('appointment'); e.preventDefault(); } break;
    case 'Digit2': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('negative'); e.preventDefault(); } break;
    case 'Digit3': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('callback'); e.preventDefault(); } break;
    case 'Digit4': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('no_answer'); e.preventDefault(); } break;
    case 'KeyS': e.preventDefault(); if (dialerStatus==='wrapping') submitOutcome(); break;
    case 'Escape':
      document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
      document.querySelectorAll('[class*="modal-overlay"][style*="block"]').forEach(m=>m.style.display='none');
      break;
  }
});

// ── Clipboard ─────────────────────────────────
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  });
}

// ── Google Maps / API settings ────────────────
function initGoogleMaps(apiKey) {
  _googleApiKey = apiKey;
  localStorage.setItem('mb_google_key', apiKey);
}

function loadApiSettings() {
  const gk = localStorage.getItem('mb_google_key') || DEFAULT_GOOGLE_KEY;
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  const goal = localStorage.getItem('mb_daily_goal') || '5';
  _googleApiKey = gk;
  if (document.getElementById('s-google-key')) document.getElementById('s-google-key').value = gk;
  if (document.getElementById('s-tomtom-key')) document.getElementById('s-tomtom-key').value = tk;
  if (document.getElementById('s-daily-goal')) document.getElementById('s-daily-goal').value = goal;
  _dailyGoal = parseInt(goal);
}

function saveApiSettings() {
  const gk = document.getElementById('s-google-key')?.value?.trim();
  const tk = document.getElementById('s-tomtom-key')?.value?.trim();
  const goal = parseInt(document.getElementById('s-daily-goal')?.value||'5');
  if (gk) { _googleApiKey=gk; localStorage.setItem('mb_google_key',gk); }
  if (tk) localStorage.setItem('mb_tomtom_key',tk);
  if (goal>0) { _dailyGoal=goal; localStorage.setItem('mb_daily_goal',String(goal)); }
  toast('API ayarları kaydedildi ✓','ok');
}

// ── Call rules (Ruhezeit) ─────────────────────
function getGermanHolidays(year) {
  const holidays = new Set();
  [[1,1],[5,1],[10,3],[10,26],[11,1],[12,25],[12,26]].forEach(([m,d])=>{
    holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  });
  const a=year%19,b=Math.floor(year/100),cc=year%100;
  const d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d2-g+15)%30,i=Math.floor(cc/4),k=cc%4;
  const l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m2+114)/31),day=((h+l-7*m2+114)%31)+1;
  const easter = new Date(year,month-1,day);
  const addDays = (d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r.toISOString().split('T')[0];};
  holidays.add(addDays(easter,-2)); holidays.add(addDays(easter,0));
  holidays.add(addDays(easter,1));  holidays.add(addDays(easter,39));
  holidays.add(addDays(easter,49)); holidays.add(addDays(easter,50));
  return holidays;
}

function isGermanHoliday(dateStr) {
  return getGermanHolidays(parseInt(dateStr.split('-')[0])).has(dateStr);
}

function isCallAllowed(dateStr, timeStr) {
  const d = new Date(dateStr + 'T' + timeStr);
  const day = d.getDay(); const hour = d.getHours();
  if (day === 0) return {allowed:false, reason:'Pazar günü arama yapılamaz'};
  if (isGermanHoliday(dateStr)) return {allowed:false, reason:'Tatil günü arama yapılamaz'};
  if (hour < 9 || hour >= 20) return {allowed:false, reason:'Sessizlik saati (09:00-20:00 arası arama yapılabilir)'};
  if (day === 6 && (hour < 9 || hour >= 13)) return {allowed:false, reason:'Cumartesi 09:00-13:00 arası arama yapılabilir'};
  return {allowed:true};
}

function checkCallAllowed() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0,8);
  const check = isCallAllowed(dateStr, timeStr);
  if (!check.allowed) { toast('⚠️ ' + check.reason, 'err', 5000); return false; }
  return true;
}

// ── Test Modu ─────────────────────────────────
function toggleTestMode() {
  _testMode = !_testMode;
  const btn    = document.getElementById('test-mode-btn');
  const rdyBtn = document.getElementById('btn-ready');
  if (_testMode) {
    btn.style.cssText += ';background:rgba(234,179,8,.18)!important;color:var(--yellow)!important;border-color:var(--yellow)!important;';
    btn.textContent = '⚙ TEST AÇIK';
    // Hazır butonunu Telnyx'ten bağımsız hale getir
    if (rdyBtn) {
      rdyBtn.disabled = false;
      rdyBtn.style.opacity = '1';
      rdyBtn.style.cursor = 'pointer';
      rdyBtn.onclick = testToggleReady; // Telnyx kontrolsüz versiyon
    }
    toast('Test modu açık — gerçek arama yapılmaz, veriler DB\'ye kaydedilir', 'ok', 4000);
  } else {
    btn.style.cssText = btn.style.cssText.replace(/background[^;]+;|color[^;]+;|border-color[^;]+;/g, '');
    btn.textContent = 'TEST MODU';
    if (rdyBtn) {
      rdyBtn.onclick = toggleReady; // Normal versiyona geri dön
      if (!telnyxReady && !selectedCampId) {
        rdyBtn.disabled = true;
        rdyBtn.style.opacity = '0.45';
        rdyBtn.style.cursor = 'not-allowed';
      }
    }
    toast('Test modu kapatıldı', 'warn', 2000);
  }
}

// Test moduna özel hazır toggle — Telnyx kontrolü yok
async function testToggleReady() {
  if (!_activeCampIds.length && !selectedCampId) { toast('Önce en az bir kampanyayı aktif edin', 'err'); return; }
  if (dialerStatus === 'offline' || dialerStatus === 'break') {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id, status:'ready', last_seen:new Date().toISOString()}).catch(()=>{});
    setTimeout(() => dialNext(), 300);
  } else if (dialerStatus === 'ready') {
    setDialerStatus('offline');
    upsertAgentSession({agent_id:currentUser.id, status:'offline', last_seen:new Date().toISOString()}).catch(()=>{});
  }
}

// Test modunda gerçek contact ile simüle edilmiş çağrı başlat
async function startTestCall() {
  if (_fakeCallActive) return;
  const contact = await getNextContact();
  if (!contact) {
    toast('✅ Kuyrukta numara kalmadı', 'ok');
    setDialerStatus('offline'); updateSessionInDB('offline');
    return;
  }
  _fakeCallActive = true;
  currentContact = contact;
  showCustomerCard(contact);
  // Kontakt durumunu "calling" olarak güncelle
  try {
    await sb(`contacts?id=eq.${contact.id}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ status:'calling', last_called_at: new Date().toISOString() })
    });
  } catch(e) {}
  setDialerStatus('on_call');
  toast(`⚙ TEST: ${contact.first_name||''} ${contact.last_name||''} ${contact.phone}`, 'ok', 3000);
}

function endFakeCall() {
  _fakeCallActive = false;
  clearTimeout(_fakeCallTimer); _fakeCallTimer = null;
  handleCallEnd(Math.floor(callSeconds) || 15);
}

// ── Kalender / Takvim bağlantısı ─────────────
function openKalender(contact) {
  if (!contact) contact = currentContact;
  const params = new URLSearchParams({
    name:  [contact?.first_name||'', contact?.last_name||''].join(' ').trim() || '',
    phone: contact?.phone||'',
    plz:   contact?.plz||'',
    city:  contact?.city||'',
    address: contact?.address||'',
    hausart: contact?.hausart||'',
    baujahr: contact?.baujahr||'',
    qm:    contact?.qm||'',
    heizung: contact?.heizung||'',
    alter: contact?.alter_der_heizung||'',
    campId: selectedCampId||'',
  });
  const url = TAKVIM_URL + '?' + params.toString();
  window.open(url, '_blank', 'width=900,height=750,resizable=yes,scrollbars=yes');
}

function toggleTakvimPopup() {
  const popup = document.getElementById('takvim-popup-frame');
  if (!popup) return;
  const isVisible = popup.style.display !== 'none';
  popup.style.display = isVisible ? 'none' : '';
  if (!isVisible && currentContact) {
    openKalender(currentContact);
  }
}

// Tam ekran takvim overlay'ini aç (topbar butonu + handleAppointmentClick)
async function openTakvimOverlay() {
  const ov = document.getElementById('takvim-popup-overlay');
  if (!ov) { navigate('takvim'); return; }
  ov.classList.add('open');

  // Overlay içindeki grid ID'lerini ayarla
  window._takvimGridId      = 'takvim-grid-ov';
  window._takvimScrollId    = 'takvim-scroll-ov';
  window._takvimWeekLabelId = 'takvim-week-label-ov';

  const ovAdmin  = document.getElementById('takvim-overlay-admin');
  const ovCampLbl = document.getElementById('takvim-overlay-camp-label');
  const isAdmin  = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (ovAdmin) ovAdmin.style.display = isAdmin ? 'flex' : 'none';

  if (isAdmin) {
    // Admin: kampanya select'ini doldur
    const sel = document.getElementById('takvim-camp-select-ov');
    if (sel) {
      try {
        const camps = await sb(`campaigns?firm_id=eq.${getActiveFirmId()}&status=eq.active&order=name.asc`);
        sel.innerHTML = '<option value="">Kampanya seç...</option>' + (camps||[]).map(c=>`<option value="${c.id}" ${c.id===takvimCampId?'selected':''}>${c.name}</option>`).join('');
        if (!takvimCampId && camps?.length === 1) takvimCampId = camps[0].id;
      } catch(e) {}
    }
  } else {
    // Agent: kampanya ID'sini seç (dialer'dan ya da DB'den)
    if (!takvimCampId) {
      if (selectedCampId) {
        takvimCampId = selectedCampId;
      } else {
        // Agent'ın atanmış kampanyasını getir
        try {
          const ac = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id,campaigns(id,name)&limit=1`);
          if (ac?.length) takvimCampId = ac[0].campaign_id;
        } catch(e) {}
      }
    }
    // Kampanya adını göster
    if (takvimCampId) {
      const camp = campaigns.find(c=>c.id===takvimCampId);
      if (ovCampLbl) ovCampLbl.textContent = camp?.name || '';
    }
  }

  if (!takvimDate) takvimDate = new Date();
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function closeTakvimOverlay() {
  const ov = document.getElementById('takvim-popup-overlay');
  if (ov) ov.classList.remove('open');
  // Ana sayfaya geçince grid ID'leri resetle
  window._takvimGridId     = 'takvim-grid';
  window._takvimScrollId   = 'takvim-scroll';
  window._takvimWeekLabelId = 'takvim-week-label';
}

// ── Precall mic test ──────────────────────────
async function startPrecallTest() {
  const meter = document.getElementById('precall-meter-fill');
  const status = document.getElementById('precall-status');
  try {
    _precallStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    _precallAnalyser = ctx.createAnalyser();
    const src = ctx.createMediaStreamSource(_precallStream);
    src.connect(_precallAnalyser);
    _precallAnalyser.fftSize = 256;
    const buf = new Uint8Array(_precallAnalyser.frequencyBinCount);
    _precallOk = false;
    const check = () => {
      if (!_precallStream) return;
      _precallAnalyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s,v)=>s+v,0)/buf.length;
      if (meter) meter.style.width = Math.min(100,avg*3)+'%';
      if (avg > 10) _precallOk = true;
      requestAnimationFrame(check);
    };
    check();
    if (status) { status.textContent = '🎤 Konuşun — ses seviyesi gösteriliyor'; status.style.color='var(--green)'; }
  } catch(e) {
    if (status) { status.textContent = '❌ Mikrofon izni reddedildi'; status.style.color='var(--red)'; }
  }
}

function stopPrecallTest() {
  if (_precallStream) { _precallStream.getTracks().forEach(t=>t.stop()); _precallStream=null; }
  const status = document.getElementById('precall-status');
  if (status) {
    if (_precallOk) { status.textContent='✅ Mikrofon çalışıyor'; status.style.color='var(--green)'; }
    else { status.textContent='⚠️ Ses algılanmadı — kontrol edin'; status.style.color='var(--yellow)'; }
  }
}
