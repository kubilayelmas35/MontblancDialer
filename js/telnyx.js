// ─────────────────────────────────────────────
// TELNYX WEBRTC ENTEGRASYONu
// ─────────────────────────────────────────────

function sendToRTC(type, data={}) {
switch(type) {
case 'MB_CONNECT':
_connectTelnyx(data.sipUser, data.sipPass);
break;
case 'MB_CALL':
_makeCall(data.destination, data.callerNumber);
break;
case 'MB_HANGUP':
if (_telnyxCall) { try { _telnyxCall.hangup(); } catch(e) {} }
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

function _connectTelnyx(sipUser, sipPass) {
if (typeof TelnyxRTC === 'undefined') {
setTimeout(() => _connectTelnyx(sipUser, sipPass), 500);
return;
}
try {
if (_telnyxClient) _telnyxClient.disconnect();
_telnyxClient = new TelnyxRTC({ login: sipUser, password: sipPass });
_telnyxClient.on('telnyx.ready', () => {
telnyxReady = true;
updateConnectionStatus('connected');
toast('✅ Telnyx bağlandı', 'ok');
});
_telnyxClient.on('telnyx.error', (err) => {
toast('❌ Telnyx: ' + (err?.message||'bağlantı hatası'), 'err');
});
_telnyxClient.on('telnyx.socket.close', () => {
telnyxReady = false;
updateConnectionStatus('disconnected');
});
_telnyxClient.on('telnyx.notification', (n) => {
const call = n.call;
if (n.type === 'callUpdate') {
const state = call?.state;
if (state === 'active') {
_telnyxCall = call;
let audio = document.getElementById('_telnyx_audio');
if (!audio) {
audio = document.createElement('audio');
audio.id = '_telnyx_audio';
audio.autoplay = true;
document.body.appendChild(audio);
}
try { audio.srcObject = call.remoteStream; audio.play(); } catch(e) {}
handleCallState('active', call.id);
}
if (state === 'ringing') { _telnyxCall = call; handleCallState('ringing', call.id); }
if (state === 'done' || state === 'destroy' || state === 'hangup') {
const dur = callStart ? Math.round((Date.now()-callStart)/1000) : 0;
_telnyxCall = null; callStart = null;
handleCallEnd(dur);
}
if (call?.amd_result) handleAMD(call.amd_result);
}
});
_telnyxClient.connect();
updateConnectionStatus('connecting');
} catch(e) {
toast('❌ Telnyx hata: ' + e.message, 'err');
}
}

function _makeCall(destination, callerNumber) {
if (!_telnyxClient || !telnyxReady) {
toast('Telnyx bağlı değil', 'err'); return;
}
try {
_telnyxCall = _telnyxClient.newCall({
destinationNumber: destination,
callerNumber: callerNumber,
audio: true, video: false,
detectAnsweringMachine: true,
});
callStart = Date.now();
} catch(e) { toast('Arama hatası: ' + e.message, 'err'); }
}

function initRTCListener() {
window.addEventListener('message', (e) => {
const d = e.data;
if (!d || !d.type || !d.type.startsWith('MB_')) return;
switch(d.type) {
case 'MB_MIC_OK':
micGranted = true;
updateMicStatus(true);
toast('🎤 ' + (currentLang==='tr' ? 'Mikrofon izni alındı' : 'Mikrofon erlaubt'), 'ok');
break;
case 'MB_MIC_ERROR':
micGranted = false;
updateMicStatus(false);
toast('🔇 ' + (currentLang==='tr' ? 'Mikrofon izni reddedildi! Tarayıcı ayarlarından izin verin.' : 'Mikrofon verweigert!'), 'err');
break;
case 'MB_READY':
telnyxReady = true;
updateConnectionStatus('connected');
toast('✅ Telnyx ' + (currentLang==='tr' ? 'bağlandı' : 'verbunden'), 'ok');
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
? (currentLang==='tr' ? 'Mikrofon aktif' : 'Mikrofon aktiv')
: (currentLang==='tr' ? 'Mikrofon izni yok' : 'Kein Mikrofon-Zugriff');
}

function updateConnectionStatus(status) {
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
if (state === 'active' && dialerStatus !== 'on_call') {
setDialerStatus('on_call');
updateSessionInDB('on_call');
} else if (subLabels[state] && label) {
label.textContent = subLabels[state][currentLang] || subLabels[state].tr;
}
}

function handleAMD(result) {
amdResult = result;
if (result === 'machine') {
toast('🤖 ' + (currentLang==='tr' ? 'Telesekreter — otomatik kapatıldı' : 'Anrufbeantworter erkannt'), 'ok');
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
currentContact = null;
clearCustomerCard();
if (dialerStatus === 'on_call' || dialerStatus === 'ready') {
setDialerStatus('ready');
updateSessionInDB('ready');
setTimeout(() => dialNext(), 1500);
}
}

function handleCallEnd(duration) {
if (amdResult === 'machine') return;
callSeconds  = duration || callSeconds;
activeCallId = null;
if (dialerStatus === 'on_call') {
setDialerStatus('wrapping');
updateSessionInDB('wrapping');
}
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
