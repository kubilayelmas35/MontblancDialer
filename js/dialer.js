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
    list.innerHTML = myCamps.map(ac=>`
<div class="agent-camp-item ${selectedCampId===ac.campaign_id?'active':''}" onclick="selectCamp('${ac.campaign_id}','${ac.campaigns?.name||''}')">
<div class="agent-camp-name">${ac.campaigns?.name||ac.campaign_id}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;">
<span class="agent-camp-count">${ac.campaigns?.dial_speed||1} hat</span>
<span class="agent-camp-count" style="color:var(--accent);">${(()=>{const q=ac.campaigns?.queues;return q?q.reduce((s,qq)=>s+(qq.total_contacts||0),0).toLocaleString()+' kişi':'—'})()}</span>
</div>
</div>`).join('');
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

function selectCamp(id, name) {
  selectedCampId = id;
  document.getElementById('dialer-camp-label').textContent = name || id;
  document.querySelectorAll('.agent-camp-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick').includes(id));
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

async function loadMyMiniStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logs = await sb(`call_logs?select=*&agent_id=eq.${currentUser?.id}&started_at=gte.${today}T00:00:00`);
    const appts = logs.filter(l=>l.outcome==='appointment').length;
    document.getElementById('my-appt').textContent = appts;
    document.getElementById('my-calls').textContent = logs.length;
    document.getElementById('my-stats-mini').innerHTML=`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:10px;">
<div style="font-size:20px;font-weight:800;color:var(--green);font-family:var(--mono);">${appts}</div>
<div style="font-size:10px;color:var(--text-3);">Termin</div>
</div>
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:10px;">
<div style="font-size:20px;font-weight:800;color:var(--accent);font-family:var(--mono);">${logs.length}</div>
<div style="font-size:10px;color:var(--text-3);">Çağrı</div>
</div>`;
    updateDailyProgress(appts);
  } catch(e){}
}

async function toggleReady() {
  if (dialerStatus==='offline' || dialerStatus==='break') {
    if (!selectedCampId) { toast(currentLang==='tr'?'Önce kampanya seçin':'Kampagne auswählen','err'); return; }
    if (!telnyxReady) { toast(currentLang==='tr'?'Telnyx bağlanıyor, bekleyin...':'Telnyx verbindet sich...','err'); return; }
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
  if (dot) dot.className = `status-dot ${s}`;
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
    document.getElementById('outcome-section').style.display='';
    document.getElementById('call-actions').style.display='none';
    document.getElementById('customer-card').style.display='none';
    stopCallTimer();
  }
}

async function dialNext() {
  if (dialerStatus !== 'ready') return;
  if (!checkCallAllowed()) return;
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
      body: JSON.stringify({ status:'calling', assigned_agent:currentUser?.email, last_called_at:new Date().toISOString() })
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
  if (_fakeCallActive) { endFakeCall(); return; }
  sendToRTC('MB_HANGUP');
  if (!telnyxReady || !_telnyxCall) handleCallEnd(Math.floor(callSeconds));
}

function setOutcome(o) {
  selectedOutcome = o;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  const map = {appointment:'.ob-appointment',negative:'.ob-negative',callback:'.ob-callback',no_answer:'.ob-no_answer',voicemail:'.ob-voicemail'};
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
      const finalOutcome = isDnc ? 'dnc' : selectedOutcome;
      const statusMap = {appointment:'appointment',negative:'negative',callback:'callback',no_answer:'no_answer',dnc:'dnc'};
      await sb(`contacts?id=eq.${currentContact.id}`,{method:'PATCH',prefer:'return=minimal',
        body:JSON.stringify({
          status: statusMap[finalOutcome],
          attempt_count: (currentContact.attempt_count||0)+1,
          last_called_at: new Date().toISOString(),
          locked_by: null, locked_at: null,
          callback_at: cbTime||null
        })
      });
      if (isDnc) await addToDnc(currentContact.phone, currentContact.id);
      await sb('call_logs',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
        contact_id: currentContact.id,
        campaign_id: selectedCampId,
        firm_id: currentUser.firm_id,
        agent_id: currentUser.id,
        telnyx_call_id: activeCallId,
        phone: currentContact.phone,
        outcome: isDnc ? 'dnc' : selectedOutcome,
        notes: note,
        duration_sec: callSeconds,
        started_at: new Date(Date.now()-callSeconds*1000).toISOString(),
        ended_at: new Date().toISOString(),
      })});
      if (currentContact.queue_id) {
        sb(`queues?id=eq.${currentContact.queue_id}`,{method:'PATCH',prefer:'return=minimal',
          body:JSON.stringify({dialed_count:(currentContact.dialed_count||0)+1})
        }).catch(()=>{});
      }
    }
  } catch(e){ console.error(e); toast('Kayıt hatası: '+e.message,'err'); }
  // Termin → Takvim aç
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
    upsertAgentSession({agent_id:currentUser.id,status:'break'});
  } else {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id,status:'ready',last_seen:new Date().toISOString()});
    if (_autoDial) setTimeout(()=>dialNext(), 1200);
  }
}

function handleAppointmentClick() {
  const missing = validateTerminFields();
  if (missing.length > 0) {
    switchContactTab('info');
    const terminSection = document.getElementById('termin-fields-section');
    if (terminSection) {
      terminSection.scrollIntoView({behavior:'smooth', block:'center'});
      terminSection.style.boxShadow = '0 0 0 3px rgba(220,38,38,.4)';
      setTimeout(() => terminSection.style.boxShadow = '', 2000);
    }
    const names = {hausart:'Ev Tipi', baujahr:'Yapım Yılı', qm:'m²', heizung:'Isıtma', alter_der_heizung:'Isıtma Yaşı'};
    toast('⚠️ Zorunlu alanlar eksik: ' + missing.map(k=>names[k]||k).join(', '), 'err', 4000);
    return;
  }
  setOutcome('appointment');
  navigate('takvim');
  toast('📅 Takvimden uygun slot seç', 'ok', 3000);
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
function updateDailyProgress(apptCount) {
  _dailyAppointments = apptCount;
  const el = document.getElementById('daily-progress-bar');
  const label = document.getElementById('daily-progress-label');
  if (!el) return;
  const pct = Math.min(100, Math.round((apptCount/_dailyGoal)*100));
  el.style.width = pct + '%';
  el.style.background = pct>=100 ? 'var(--green)' : pct>=60 ? 'var(--yellow)' : 'var(--accent)';
  if (label) label.textContent = `${apptCount}/${_dailyGoal} Termin`;
  if (pct>=100 && !_confettiShown) { _confettiShown = true; launchConfetti(); }
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

// ── Fake call (test mode) ─────────────────────
function startFakeCall() {
  if (_fakeCallActive) return;
  _fakeCallActive = true;
  setDialerStatus('on_call');
  // Fake contact ile dialer göster
  if (!currentContact) {
    currentContact = {
      id: 'fake-' + Date.now(), phone: '+49 176 0000000',
      first_name: 'Test', last_name: 'Müşteri',
      plz:'12345', city:'Berlin', address:'Teststraße 1',
      attempt_count:1, campaign_id: selectedCampId
    };
    showCustomerCard(currentContact);
  }
  _fakeCallTimer = setTimeout(() => {
    if (_fakeCallActive) endFakeCall();
  }, 30000);
  toast('🔧 Test modu — gerçek arama yok', 'ok', 3000);
}

function endFakeCall() {
  _fakeCallActive = false;
  clearTimeout(_fakeCallTimer); _fakeCallTimer = null;
  handleCallEnd(Math.floor(callSeconds) || 30);
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

function openTakvimOverlay() {
  if (!selectedCampId) return;
  const camp = campaigns.find(c => c.id === selectedCampId);
  if (!camp) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:8000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML = `
<div style="background:var(--bg-2);border-radius:var(--radius);padding:24px;max-width:360px;width:90%;text-align:center;">
<div style="font-size:24px;margin-bottom:12px;">📅</div>
<div style="font-size:15px;font-weight:800;margin-bottom:8px;">Termin Alındı!</div>
<div style="font-size:16px;font-weight:700;padding:10px 16px;background:var(--bg-3);border-radius:8px;margin-bottom:20px;">${camp.name}</div>
${camp.notif_message?`<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">${camp.notif_message}</div>`:''}
<button onclick="this.closest('[style*=fixed]').remove();navigate('takvim');"
style="width:100%;padding:12px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">📅 Takvime Git</button>
<button onclick="this.closest('[style*=fixed]').remove();" style="width:100%;padding:10px;background:transparent;color:var(--text-2);border:none;font-size:12px;cursor:pointer;margin-top:8px;">Kapat</button>
</div>`;
  document.body.appendChild(ov);
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
