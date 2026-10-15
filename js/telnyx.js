// ─────────────────────────────────────────────
// TELNYX WEBRTC ENTEGRASYONu
// ─────────────────────────────────────────────

function sendToRTC(type, data={}) {
switch(type) {
case 'MB_CONNECT':
_connectTelnyx(data.sipUser, data.sipPass);
break;
case 'MB_CALL':
_makeCall(data.destination, data.callerNumber, data.contact);
break;
case 'MB_HANGUP':
mbHangupLiveOrWave();
break;
case 'MB_MUTE':
if (_telnyxCall) { try { data.muted ? _telnyxCall.muteAudio() : _telnyxCall.unmuteAudio(); } catch(e) {} }
break;
case 'MB_HOLD':
if (_telnyxCall) { try { data.hold ? _telnyxCall.hold() : _telnyxCall.unhold(); } catch(e) {} }
break;
case 'MB_DISCONNECT':
if (_telnyxClient) { try { _telnyxClient.disconnect(); } catch(e) {} _telnyxClient = null; }
break;
}
}

function mbTelnyxConstructor() {
  if (typeof TelnyxRTC === 'function') return TelnyxRTC;
  if (typeof TelnyxWebRTC !== 'undefined' && typeof TelnyxWebRTC.TelnyxRTC === 'function') return TelnyxWebRTC.TelnyxRTC;
  return null;
}

function _connectTelnyx(sipUser, sipPass, attempt) {
  const n = attempt || 0;
  const Ctor = mbTelnyxConstructor();
  if (!Ctor) {
    if (n < 20) {
      setTimeout(() => _connectTelnyx(sipUser, sipPass, n + 1), 500);
      return;
    }
    telnyxReady = false;
    updateConnectionStatus('disconnected');
    toast(typeof t === 'function' ? t('telnyx.lib_missing') : 'Hat kütüphanesi yüklenmedi. Sayfayı yenileyin.', 'err');
    return;
  }
try {
if (_telnyxClient) _telnyxClient.disconnect();
const client = new Ctor({ login: sipUser, password: sipPass });
_telnyxClient = client;
const mine = () => _telnyxClient === client;
client.on('telnyx.ready', () => {
if (!mine()) return;
telnyxReady = true;
updateConnectionStatus('connected');
toast('✅ Hat bağlantısı hazır', 'ok');
});
client.on('telnyx.error', (err) => {
if (!mine()) return;
toast('❌ Hat bağlantı hatası: ' + (err?.message||'bağlantı hatası'), 'err');
});
client.on('telnyx.socket.close', () => {
if (!mine()) return;
telnyxReady = false;
updateConnectionStatus('disconnected');
});
client.on('telnyx.notification', (n) => {
if (!mine()) return;
const call = n.call;
if (n.type === 'callUpdate') {
const state = call?.state;
const isInbound = call?.direction === 'inbound';
if (state === 'ringing' && isInbound) {
  if (typeof window.isIncomingDialerEnabled === 'function' && !window.isIncomingDialerEnabled()) {
    try { call.hangup(); } catch (e) {}
    if (typeof toast === 'function') toast('Gelen arama bu firma için kapalı', 'warn', 3200);
    return;
  }
  if (typeof call.answer === 'function') {
    try { call.answer(); } catch (e) {}
  }
}
mbOnHopperCall(call);
}
});
updateConnectionStatus('connecting');
client.connect();
} catch(e) {
toast('❌ Hat hatası: ' + e.message, 'err');
}
}

function _hopperRowFor(call) {
  if (!call) return null;
  const id = call.id || call.callId || '';
  return _hopper.find((r) => r.call === call || (id && r.id === id)) || null;
}

function _rememberHopper(call, contact) {
  const id = call.id || ('leg-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const row = { id, call, contact: contact || currentContact || null, phase: 'dialing', answeredAt: 0 };
  _hopper.push(row);
  return row;
}

function _agentBusy() {
  return !!_liveCallId && _hopper.some((r) => r.id === _liveCallId && r.phase === 'live');
}

function _attachLiveAudio(call) {
  let audio = document.getElementById('_telnyx_audio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = '_telnyx_audio';
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  try { if (call?.remoteStream) { audio.srcObject = call.remoteStream; audio.play(); } } catch (e) {}
  window._telnyxRemoteStream = call?.remoteStream || null;
}

function mbConnectHopperRow(row) {
  if (!row) return;
  _liveCallId = row.id;
  _telnyxCall = row.call;
  row.phase = 'live';
  _outboundAnswered = true;
  _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
  if (row.contact) currentContact = row.contact;
  _attachLiveAudio(row.call);
  if (typeof handleCallState === 'function') handleCallState('active', row.id);
  if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
  if (typeof mbSyncPool === 'function') mbSyncPool();
}

function mbTakeHeldCall() {
  const held = _hopper.filter((r) => r.phase === 'hold').sort((a, b) => a.answeredAt - b.answeredAt);
  if (!held.length) return false;
  const row = held[0];
  try { row.call.unhold(); } catch (e) {}
  mbConnectHopperRow(row);
  if (typeof toast === 'function') toast(typeof t === 'function' ? t('dial.hopper.held_next') : 'Müzikte bekleyen kişi bağlandı', 'ok', 2200);
  return true;
}

function mbReleaseUnanswered(contact, status) {
  if (!contact?.id) return;
  const st = status || 'no_answer';
  if (st === 'no_answer') _hopperSkip.set(String(contact.id), Date.now() + 60000);
  if (typeof isValidUUID === 'function' && isValidUUID(contact.id) && typeof sb === 'function') {
    sb(`contacts?id=eq.${contact.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: st, last_called_at: new Date().toISOString() }),
    }).catch(() => {});
  }
}

function mbCancelHopper() {
  const rows = _hopper.filter((r) => r.phase !== 'live');
  rows.forEach((r) => {
    if (r.contact && r.phase !== 'hold') mbReleaseUnanswered(r.contact, 'pending');
    _hopper = _hopper.filter((x) => x !== r);
    try { r.call.hangup(); } catch (e) {}
  });
  if (!_liveCallId) {
    _outboundDialPending = false;
    _telnyxCall = null;
    if (dialerStatus === 'calling' && typeof setDialerStatus === 'function') {
      setDialerStatus('ready');
      if (typeof clearCustomerCard === 'function') clearCustomerCard();
    }
  }
  if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
}

function mbHangupLiveOrWave() {
  if (_liveCallId) {
    const row = _hopper.find((r) => r.id === _liveCallId);
    try { (row?.call || _telnyxCall)?.hangup(); } catch (e) {}
    return;
  }
  if (_hopper.length) {
    mbCancelHopper();
    return;
  }
  if (_telnyxCall) { try { _telnyxCall.hangup(); } catch (e) {} }
}

function mbOnHopperCall(call) {
  if (!call) return;
  const state = String(call.state || '');
  const dead = state === 'hangup' || state === 'destroy' || state === 'done' || state === 'purge';
  let row = _hopperRowFor(call);
  if (!row) {
    if (dead || state === 'held' || state === 'hold') return;
    if (call.direction === 'inbound' && state !== 'active') return;
    row = _rememberHopper(call, currentContact);
  }
  if (call.id && row.id !== call.id && row.id === _liveCallId) _liveCallId = call.id;
  if (call.id) row.id = call.id;
  if (call.amd_result === 'machine' && row.phase !== 'live') {
    try { call.hangup(); } catch (e) {}
    return;
  }
  if (state === 'ringing' || state === 'trying' || state === 'requesting' || state === 'early' || state === 'answering') {
    if (row.phase !== 'live' && row.phase !== 'hold') row.phase = 'ringing';
    _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
    if (!_agentBusy() && typeof handleCallState === 'function') handleCallState('ringing', row.id);
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'held' || state === 'hold') {
    row.phase = 'hold';
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'active') {
    if (row.phase === 'hold') return;
    if (_agentBusy() && row.id !== _liveCallId) {
      row.phase = 'hold';
      row.answeredAt = row.answeredAt || Date.now();
      try { call.hold(); } catch (e) {}
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      if (typeof mbSyncPool === 'function') mbSyncPool();
      return;
    }
    row.answeredAt = row.answeredAt || Date.now();
    if (!callStart) callStart = Date.now();
    mbConnectHopperRow(row);
    return;
  }
  if (dead) {
    const wasLive = row.id === _liveCallId || row.phase === 'live';
    const contact = row.contact;
    const phase = row.phase;
    _hopper = _hopper.filter((r) => r !== row);
    _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
    if (wasLive) {
      _liveCallId = null;
      _telnyxCall = null;
      const dur = callStart ? Math.round((Date.now() - callStart) / 1000) : 0;
      callStart = null;
      if (typeof handleCallEnd === 'function') handleCallEnd(dur);
    } else if (contact && phase !== 'hold') {
      if (_telnyxCall === row.call) _telnyxCall = null;
      mbReleaseUnanswered(contact, 'no_answer');
      if (!_liveCallId && typeof mbRefillHopper === 'function') mbRefillHopper();
    }
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
  }
}

function _makeCall(destination, callerNumber, contact) {
if (!_telnyxClient || !telnyxReady) {
_outboundDialPending = false;
toast('Hat bağlantısı yok', 'err'); return;
}
try {
const call = _telnyxClient.newCall({
destinationNumber: destination,
callerNumber: callerNumber,
audio: true, video: false,
detectAnsweringMachine: true,
});
_rememberHopper(call, contact || currentContact);
if (!_telnyxCall) _telnyxCall = call;
if (!callStart) callStart = Date.now();
_outboundDialPending = true;
} catch(e) { _outboundDialPending = false; toast('Arama hatası: ' + e.message, 'err'); }
}

function mbSimOutbound(contact, answerInMs) {
  const call = {
    id: 'sim-' + String(contact?.id || 'x') + '-' + Math.random().toString(16).slice(2),
    state: 'ringing',
    remoteStream: null,
    held: false,
    hold() { this.held = true; this.state = 'held'; },
    unhold() { this.held = false; this.state = 'active'; },
    hangup() { this.state = 'hangup'; mbOnHopperCall(this); },
  };
  _rememberHopper(call, contact);
  _outboundDialPending = true;
  const waitMs = (typeof window !== 'undefined' && window.__mbPoolAnswerMs) || answerInMs || 1200;
  setTimeout(() => {
    if (!_hopper.find((r) => r.call === call)) return;
    if (dialerStatus !== 'calling' && dialerStatus !== 'on_call' && dialerStatus !== 'wrapping') return;
    call.state = 'active';
    mbOnHopperCall(call);
  }, Math.max(200, waitMs));
  return call;
}

function initRTCListener() {
window.addEventListener('message', (e) => {
const d = e.data;
if (!d || !d.type || !d.type.startsWith('MB_')) return;
switch(d.type) {
case 'MB_MIC_OK':
micGranted = true;
updateMicStatus(true);
toast('🎤 ' + t('telnyx.mic_ok'), 'ok');
break;
case 'MB_MIC_ERROR':
micGranted = false;
updateMicStatus(false);
toast('🔇 ' + t('telnyx.mic_denied'), 'err');
break;
case 'MB_READY':
telnyxReady = true;
updateConnectionStatus('connected');
toast('✅ ' + t('telnyx.line_connected'), 'ok');
break;
case 'MB_DISCONNECTED':
telnyxReady = false;
updateConnectionStatus('disconnected');
break;
case 'MB_CALL_STATE':
handleCallState(d.state, d.callId);
break;
case 'MB_CALL_END':
handleCallEnd(d.duration);
break;
case 'MB_AMD':
handleAMD(d.result);
break;
case 'MB_ERROR':
toast('❌ ' + (d.message||'RTC Hatası'), 'err');
break;
}
});
}

function updateMicStatus(granted) {
const el = document.getElementById('mic-status');
if (!el) return;
el.innerHTML = granted
  ? '<i class="ph ph-microphone" style="vertical-align:-3px;font-size:17px;color:var(--green);"></i>'
  : '<i class="ph ph-microphone-slash" style="vertical-align:-3px;font-size:17px;color:var(--red);"></i>';
el.title = granted
? t('telnyx.mic_on')
: t('telnyx.mic_off');
}

function updateConnectionStatus(status) {
window._mbConnStatus = status;
const el = document.getElementById('rtc-status');
if (!el) return;
const map = {
connecting:   { icon:'<i class="ph ph-arrows-clockwise"></i>', color:'var(--yellow)', tr:'Bağlanıyor...', de:'Verbinde...' },
connected:    { icon:'<i class="ph ph-circle-wavy-check"></i>',  color:'var(--green)',  tr:'Bağlandı',      de:'Verbunden'   },
disconnected: { icon:'<i class="ph ph-x-circle"></i>',    color:'var(--red)',    tr:'Bağlantı yok',  de:'Getrennt'    },
};
const s = map[status]||map.disconnected;
el.innerHTML = `<span style="color:${s.color};font-size:11px;font-weight:600;display:flex;align-items:center;gap:3px;">${s.icon} ${s[currentLang]||s.tr}</span>`;
}

function handleCallState(state, callId) {
activeCallId = callId;
const label = document.getElementById('status-label');
const subLabels = {
dialing: { tr:'📞 Aranıyor...', de:'Wählt...' },
ringing: { tr:'🔔 Çalıyor...', de:'Klingelt...' },
active:  { tr:'Aramada', de:'Im Gespräch' },
};
if (state === 'active') {
_outboundAnswered = true;
if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
if (dialerStatus !== 'on_call') {
setDialerStatus('on_call');
const nm = [currentContact?.first_name, currentContact?.last_name].filter(Boolean).join(' ') || null;
updateSessionInDB('on_call', {
  current_contact_name: nm,
  current_contact_phone: currentContact?.phone || null,
  call_started_at: new Date().toISOString(),
});
}
} else if (subLabels[state] && label) {
label.textContent = subLabels[state][currentLang] || subLabels[state].tr;
}
}

function handleAMD(result) {
amdResult = result;
if (result === 'machine' && !_outboundAnswered) {
toast('🤖 ' + t('telnyx.amd_voicemail'), 'ok');
sendToRTC('MB_HANGUP');
autoSaveVoicemail();
}
}

async function autoSaveVoicemail() {
if (!currentContact) return;
try {
await sb('call_logs', { method:'POST', prefer:'return=minimal', body:JSON.stringify({
contact_id:   currentContact.id,
campaign_id:  selectedCampId,
queue_id:     currentContact.queue_id||'00000000-0000-0000-0000-000000000000',
agent_id:     currentUser?.email,
phone_dialed: currentContact.phone,
outcome:      'voicemail', amd_result:'machine',
duration_seconds:0, talk_seconds:0,
started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
})});
await sb(`contacts?id=eq.${currentContact.id}`, { method:'PATCH', prefer:'return=minimal',
body:JSON.stringify({ status:'voicemail', last_called_at:new Date().toISOString() })
});
} catch(e) { console.error(e); }
_voicemailAutoLogged = true;
if (dialerStatus === 'on_call' || dialerStatus === 'calling') {
setDialerStatus('wrapping');
updateSessionInDB('wrapping');
}
}

function handleCallEnd(duration) {
_outboundWaitGen++;
_outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
const wasAttempt = dialerStatus === 'on_call' || (dialerStatus === 'calling' && !_hopper.length);
callSeconds  = duration || callSeconds;
activeCallId = null;
if (wasAttempt) {
if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
setDialerStatus('wrapping');
updateSessionInDB('wrapping');
}
_outboundAnswered = false;
if (amdResult === 'machine') amdResult = null;
}

async function handleTelnyxWebhook(data) {
if (data.event_type === 'call.recording.saved') {
const callControlId = data.payload?.call_control_id;
const recordingUrl  = data.payload?.recording_urls?.mp3 || data.payload?.recording_url;
if (callControlId && recordingUrl) {
await sb(`call_logs?telnyx_call_id=eq.${callControlId}`, {
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({recording_url: recordingUrl})
}).catch(console.error);
}
}
}

async function saveRecordingUrl(telnyxCallId, recordingUrl) {
await sb(`call_logs?telnyx_call_id=eq.${telnyxCallId}`, {
method: 'PATCH', prefer: 'return=minimal',
body: JSON.stringify({recording_url: recordingUrl})
});
}

// Sayfa yüklenince mikrofon izni iste
window.addEventListener('load', () => {
navigator.mediaDevices?.getUserMedia({audio:true,video:false})
.then(() => { micGranted=true; if(typeof updateMicStatus==='function') updateMicStatus(true); })
.catch(() => { micGranted=false; if(typeof updateMicStatus==='function') updateMicStatus(false); });
});
