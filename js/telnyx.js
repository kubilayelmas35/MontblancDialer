// ─────────────────────────────────────────────
// TELNYX WEBRTC ENTEGRASYONu
// ─────────────────────────────────────────────

function mbResetCallMeta() {
  window._mbCallMeta = null;
}

function mbNoteCallStart(caller, work) {
  window._mbCallMeta = {
    dialAt: new Date().toISOString(),
    caller: String(caller || '').trim(),
    work: work || 'manual',
    answeredAt: '',
    hangupBy: '',
  };
}

function mbNoteCallAnswered() {
  const meta = window._mbCallMeta || {};
  if (!meta.answeredAt) meta.answeredAt = new Date().toISOString();
  window._mbCallMeta = meta;
}

function mbNoteCallHangup(who) {
  const meta = window._mbCallMeta || {};
  if (!meta.hangupBy && who) meta.hangupBy = who;
  window._mbCallMeta = meta;
}

function mbCallLogExtras() {
  const meta = window._mbCallMeta || {};
  const extra = {};
  if (meta.dialAt) extra.dial_at = meta.dialAt;
  if (meta.answeredAt) extra.answered_at = meta.answeredAt;
  if (meta.caller) extra.caller_number = meta.caller;
  if (meta.work) extra.work_type = meta.work;
  if (meta.hangupBy) extra.hangup_by = meta.hangupBy;
  if (meta.telnyxCallId) extra.telnyx_call_id = meta.telnyxCallId;
  return extra;
}

function mbTelnyxIds(call) {
  let ids = {};
  try { ids = call?.telnyxIDs || {}; } catch (e) { ids = {}; }
  return {
    control: String(ids.telnyxCallControlId || call?.telnyxCallControlId || '').trim(),
    leg: String(ids.telnyxLegId || '').trim(),
    session: String(ids.telnyxSessionId || '').trim(),
  };
}

function mbCaptureTelnyxIds(call) {
  if (!call || call.__mbIdHook || typeof call.handleMessage !== 'function') return;
  call.__mbIdHook = true;
  const orig = call.handleMessage;
  call.handleMessage = function (msg) {
    try {
      const p = msg?.params || {};
      const opt = this.options || (this.options = {});
      if (p.telnyx_call_control_id) opt.telnyxCallControlId = p.telnyx_call_control_id;
      if (p.telnyx_session_id) opt.telnyxSessionId = p.telnyx_session_id;
      if (p.telnyx_leg_id) opt.telnyxLegId = p.telnyx_leg_id;
    } catch (e) {}
    const result = orig.apply(this, arguments);
    try {
      if (String(this.state || '') === 'active') mbStartCallRecording(this);
    } catch (e) {}
    return result;
  };
}

function mbWatchRecordingId(call) {
  if (!call || call.__mbRecWatch) return;
  call.__mbRecWatch = true;
  let n = 0;
  const tick = () => {
    if (!call || call.__mbRecOn || n++ > 24) return;
    const st = String(call.state || '');
    if (['hangup', 'destroy', 'done', 'purge', 'bye'].includes(st)) return;
    if (st === 'active') {
      mbStartCallRecording(call);
      if (!mbTelnyxIds(call).control && !call.__mbLookup) void mbLookupRecordingId(call);
    }
    if (!call.__mbRecOn) setTimeout(tick, 500);
  };
  setTimeout(tick, 400);
}

async function mbLookupRecordingId(call) {
  if (!call || call.__mbLookup || call.__mbRecOn) return;
  const phone = mbCallDigits(call) || String(currentContact?.phone || '').replace(/\D/g, '');
  if (phone.length < 6) return;
  call.__mbLookup = true;
  const body = await mbTelnyxRecord('lookup', { phone });
  const control = String(body?.call_control_id || '').trim();
  if (!control) return;
  const opt = call.options || (call.options = {});
  opt.telnyxCallControlId = control;
  if (body.call_session_id) opt.telnyxSessionId = body.call_session_id;
  if (body.call_leg_id) opt.telnyxLegId = body.call_leg_id;
  if (String(call.state || '') === 'active') mbStartCallRecording(call);
}

function mbRememberTelnyxIds(call) {
  const ids = mbTelnyxIds(call);
  if (!ids.control && !ids.leg && !ids.session) return ids;
  const meta = window._mbCallMeta || {};
  if (ids.control) meta.telnyxCallId = ids.control;
  if (ids.leg) meta.telnyxLegId = ids.leg;
  if (ids.session) meta.telnyxSessionId = ids.session;
  window._mbCallMeta = meta;
  if (ids.control) activeCallId = ids.control;
  return ids;
}

function mbRecWarn(key, fallback) {
  const stamp = Date.now();
  if (window._mbRecWarned && stamp - window._mbRecWarned < 4000) return;
  window._mbRecWarned = stamp;
  const msg = typeof t === 'function' ? t(key) : fallback;
  if (typeof toast === 'function') toast(!msg || msg === key ? fallback : msg, 'warn');
}

function mbCallLocalStream(call) {
  if (call?.localStream?.getAudioTracks?.().some((track) => track.readyState === 'live')) return call.localStream;
  const pc = call?.peer?.instance || call?.peerConnection || call?.pc;
  if (!pc?.getSenders) return null;
  const tracks = pc.getSenders().map((sender) => sender.track).filter((track) => track && track.kind === 'audio' && track.readyState === 'live');
  if (!tracks.length) return null;
  const stream = new MediaStream();
  tracks.forEach((track) => stream.addTrack(track));
  return stream;
}

function mbRecordingUsesTelnyx() {
  return window._mbRecordingSource === 'telnyx';
}

async function mbLoadRecordingSource(firmId) {
  const id = firmId || (typeof currentUser !== 'undefined' ? currentUser?.firm_id : '');
  if (!id || typeof sb !== 'function') {
    window._mbRecordingSource = 'supabase';
    return 'supabase';
  }
  const rows = await sb(`firms?id=eq.${id}&select=settings`).catch(() => []);
  const source = rows?.[0]?.settings?.recording_source === 'telnyx' ? 'telnyx' : 'supabase';
  window._mbRecordingSource = source;
  return source;
}

async function mbPullTelnyxRecording(logId, info) {
  if (!logId) return;
  const phone = String(info?.phone || '').replace(/\D/g, '');
  const since = info?.since || new Date().toISOString();
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, i === 0 ? 8000 : 6000));
    const body = await mbTelnyxRecord('recent', { phone, since });
    const url = String(body?.url || '');
    if (!/^https:\/\//i.test(url) || typeof sb !== 'function') continue;
    await sb(`call_logs?id=eq.${logId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ recording_url: url }),
    }).catch(() => {});
    window._mbRecWarned = 0;
    return;
  }
  mbRecWarn('telnyx.rec_noid', 'Ses kaydı alınamadı');
}

function mbArmLocalRecording(call) {
  if (mbRecordingUsesTelnyx()) return;
  if (!call || call.__mbLocalRec || call.__mbSupervisor || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  if (typeof MediaRecorder === 'undefined') {
    call.__mbLocalMiss = 'nosound';
    return;
  }
  if (typeof mbCallIsDead === 'function' && mbCallIsDead(call)) return;
  const remote = call.remoteStream || document.getElementById('_telnyx_audio')?.srcObject;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!remote || !Ctx) {
    if (!call.__mbLocalRetry) {
      call.__mbLocalRetry = true;
      setTimeout(() => mbArmLocalRecording(call), 400);
      return;
    }
    call.__mbLocalMiss = 'nosound';
    return;
  }
  try {
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(remote).connect(dest);
    const local = mbCallLocalStream(call);
    if (local) {
      try { ctx.createMediaStreamSource(local).connect(dest); } catch (e) {}
    }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mime = types.find((kind) => MediaRecorder.isTypeSupported(kind)) || '';
    const rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    window._mbLocalRecWait = new Promise((resolve) => { call.__mbLocalDone = resolve; });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (call.__mbLocalKeep && blob.size > 400) window._mbLocalRecBlob = blob;
      else if (call.__mbLocalKeep) call.__mbLocalMiss = 'short';
      try { ctx.close(); } catch (e) {}
      if (typeof call.__mbLocalDone === 'function') call.__mbLocalDone(window._mbLocalRecBlob || null);
    };
    rec.start(1000);
    call.__mbLocalRec = rec;
    call.__mbLocalKeep = true;
    call.__mbLocalMiss = '';
    window._mbLocalRecCall = call;
    window._mbLocalRecBlob = null;
  } catch (e) {
    call.__mbLocalMiss = 'nosound';
  }
}

function mbFinishLocalRecording(call, keep) {
  const target = call || window._mbLocalRecCall;
  if (!target) return Promise.resolve(window._mbLocalRecBlob || null);
  target.__mbLocalKeep = !!keep;
  const rec = target.__mbLocalRec;
  if (rec && rec.state !== 'inactive') {
    try { rec.requestData(); } catch (e) {}
    try { rec.stop(); } catch (e) {}
  }
  if (window._mbLocalRecBlob) return Promise.resolve(window._mbLocalRecBlob);
  if (rec) return window._mbLocalRecWait || Promise.resolve(null);
  return Promise.resolve(null);
}

async function mbUploadLocalRecording(blob) {
  if (!blob || typeof SB_URL !== 'string' || typeof SB_KEY !== 'string') return '';
  const firm = String(currentUser?.firm_id || 'shared').replace(/[^\w-]/g, '') || 'shared';
  const ext = /mp4|aac/i.test(blob.type) ? 'm4a' : 'webm';
  const path = `${firm}/${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/call-recordings/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': blob.type || 'audio/webm',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) throw new Error('storage');
  window._mbLocalRecBlob = null;
  window._mbRecWarned = 0;
  return `${SB_URL}/storage/v1/object/public/call-recordings/${path}`;
}

async function mbTelnyxRecord(action, payload) {
  if (typeof SB_URL !== 'string' || !SB_URL) return {};
  const headers = typeof mbAuthHeaders === 'function' ? mbAuthHeaders() : { 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${SB_URL}/functions/v1/telnyx-record`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    return await res.json().catch(() => ({}));
  } catch (e) {
    return {};
  }
}

function mbStartCallRecording(call) {
  if (typeof mbRecordingUsesTelnyx === 'function') return;
  if (!call || call.__mbSupervisor || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  const ids = mbRememberTelnyxIds(call);
  if (call.__mbRecOn || call.__mbRecPending || !ids.control || (call.__mbRecTries || 0) >= 2) return;
  call.__mbRecTries = (call.__mbRecTries || 0) + 1;
  call.__mbRecPending = true;
  void mbTelnyxRecord('start', { call_control_id: ids.control }).then((body) => {
    call.__mbRecPending = false;
    if (body && body.ok) {
      call.__mbRecOn = true;
      return;
    }
    if ((call.__mbRecTries || 0) >= 2) mbRecWarn('telnyx.rec_fail', 'Ses kaydı başlatılamadı');
  });
}

function mbNoteRecordingMiss(call) {
  if (mbRecordingUsesTelnyx()) return;
  if (!(window._mbCallMeta && window._mbCallMeta.answeredAt)) return;
  if (!call || call.__mbRecOn || call.__mbLocalRec || window._mbLocalRecBlob || call.__mbSupervisor || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  if ((call.__mbRecTries || 0) > 0 && mbTelnyxIds(call).control) return;
  mbRecWarn('telnyx.rec_noid', 'Ses kaydı alınamadı');
}

async function mbPullRecording(logId, ids) {
  if (!logId || !ids) return;
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, i === 0 ? 4000 : 5000));
    const body = await mbTelnyxRecord('fetch', {
      call_control_id: ids.control || '',
      session_id: ids.session || '',
      leg_id: ids.leg || '',
    });
    if (body?.error === 'auth' || body?.error === 'nokey') return;
    const url = String(body?.url || '').trim();
    if (!/^https:\/\//i.test(url) || typeof sb !== 'function') continue;
    await sb(`call_logs?id=eq.${logId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ recording_url: url }),
    }).catch(() => {});
    return;
  }
}

function sendToRTC(type, data={}) {
switch(type) {
case 'MB_CONNECT':
_connectTelnyx(data.sipUser, data.sipPass);
break;
case 'MB_CALL':
mbNoteCallStart(data.callerNumber, data.work || 'manual');
_makeCall(data.destination, data.callerNumber, data.contact, data.work || 'manual');
break;
case 'MB_HANGUP':
mbHangupLiveOrWave();
break;
case 'MB_MUTE':
if (_telnyxCall) { try { data.muted ? _telnyxCall.muteAudio() : _telnyxCall.unmuteAudio(); } catch(e) {} }
break;
case 'MB_HOLD': {
  const live = _liveCallId ? _hopper.find((r) => r.id === _liveCallId) : null;
  const call = live?.call || _telnyxCall;
  const want = !!data.hold;
  if (call && typeof call.hold === 'function') {
    try { want ? call.hold() : call.unhold(); } catch (e) {}
  }
  if (live && !want) live.agentHold = false;
  if (typeof mbMarkLiveHold === 'function') mbMarkLiveHold(want);
  break;
}
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
if (typeof applySavedMicToTelnyx === 'function') applySavedMicToTelnyx();
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
if (n.type === 'callUpdate' && call) {
const state = call?.state;
const isInbound = call?.direction === 'inbound';
if (state === 'ringing' && isInbound) {
  const supFor = typeof mbSupervisorHeader === 'function' ? mbSupervisorHeader(call) : '';
  const expect = window._mbCoachExpect && Date.now() < window._mbCoachExpect.until;
  const forMe = supFor && String(supFor) === String(currentUser?.id || '');
  if (supFor && !forMe) {
    try { call.hangup(); } catch (e) {}
    return;
  }
  if ((forMe || expect) && typeof call.answer === 'function') {
    call.__mbSupervisor = true;
    call.__mbSupervisorRole = window._mbCoachExpect?.role || 'monitor';
    window._mbCoachExpect = null;
    try { call.answer(); } catch (e) {}
    return;
  }
  if (_liveCallId || dialerStatus === 'on_call' || dialerStatus === 'wrapping') return;
  if (typeof window.isIncomingDialerEnabled === 'function' && !window.isIncomingDialerEnabled()) {
    try { call.hangup(); } catch (e) {}
    if (typeof toast === 'function') toast('Gelen arama bu firma için kapalı', 'warn', 3200);
    return;
  }
  if (typeof mbOfferInboundCall === 'function') {
    void mbOfferInboundCall(call);
    return;
  }
}
}
if (call) mbOnHopperCall(call);
});
updateConnectionStatus('connecting');
client.connect();
} catch(e) {
toast('❌ Hat hatası: ' + e.message, 'err');
}
}

function mbCallDigits(call) {
  const raw = call?.options?.destinationNumber
    || call?.options?.destination
    || call?.destinationNumber
    || call?.destination
    || '';
  return String(raw).replace(/\D/g, '');
}

function mbUnusedNumber(call) {
  if (!call) return false;
  const sip = Number(call.sipCode || call.sip_code || 0);
  const q850 = Number(call.causeCode || call.cause_code || 0);
  if ([404, 410, 484, 604].includes(sip)) return true;
  if ([1, 3, 22, 27, 28].includes(q850)) return true;
  const text = [
    call.cause,
    call.sipReason,
    call.sip_reason,
    call.sipHangupCause,
    call.hangupCause,
    call.hangup_cause,
  ].map((v) => String(v || '')).join(' ').toUpperCase();
  return /UNALLOCATED|INVALID[_\s-]*NUMBER|NUMBER[_\s-]*CHANGED|NO[_\s-]*ROUTE[_\s-]*DESTINATION|DESTINATION[_\s-]*OUT[_\s-]*OF[_\s-]*ORDER|NOT[_\s-]*IN[_\s-]*SERVICE|UNASSIGNED|DOES[_\s-]*NOT[_\s-]*EXIST|ADDRESS[_\s-]*INCOMPLETE/.test(text);
}

function mbDialPhoneBad(dest) {
  const n = typeof mbNormalizeDialPhone === 'function' ? mbNormalizeDialPhone(dest) : String(dest || '').trim();
  return !(typeof mbIsE164 === 'function' && mbIsE164(n));
}

function mbDropUnusedNumber(contact, manual) {
  const who = contact || (typeof currentContact !== 'undefined' ? currentContact : null);
  if (who) mbReleaseUnanswered(who, 'unused');
  _outboundDialPending = false;
  if (manual && typeof toast === 'function') {
    toast(typeof t === 'function' ? t('dial.unused_number') : 'Bu numara kullanım dışı', 'warn', 2800);
  }
  if (!mbHopperStillUp()) {
    if (typeof hideOutboundWait === 'function') hideOutboundWait();
    if (typeof dialerStatus !== 'undefined' && dialerStatus === 'calling' && typeof setDialerStatus === 'function') setDialerStatus('ready');
  }
}

function mbCallFailText(call) {
  return [
    call?.cause,
    call?.sipReason,
    call?.sip_reason,
    call?.sipHangupCause,
    call?.hangupCause,
    call?.hangup_cause,
  ].map((v) => String(v || '')).join(' ').toUpperCase();
}

function mbBusyLine(call) {
  if (!call) return false;
  const sip = Number(call.sipCode || call.sip_code || 0);
  const q850 = Number(call.causeCode || call.cause_code || 0);
  if (sip === 486 || q850 === 17) return true;
  return /USER[_\s-]*BUSY/.test(mbCallFailText(call));
}

function mbPhoneOff(call) {
  if (!call) return false;
  const text = mbCallFailText(call);
  if (/NO[_\s-]*ANSWER|NO[_\s-]*USER[_\s-]*RESPONSE|RECOVERY[_\s-]*ON[_\s-]*TIMER|USER[_\s-]*BUSY|CALL[_\s-]*REJECT/.test(text)) return false;
  const sip = Number(call.sipCode || call.sip_code || 0);
  const q850 = Number(call.causeCode || call.cause_code || 0);
  if (q850 === 19 || q850 === 18 || q850 === 17 || q850 === 21 || q850 === 102) return false;
  if (sip === 480 || sip === 503) return true;
  if ([20, 34, 38, 41, 42, 47].includes(q850)) return true;
  return /SUBSCRIBER[_\s-]*ABSENT|TEMPORARY[_\s-]*FAILURE|NORMAL[_\s-]*TEMPORARY|NO[_\s-]*CIRCUIT|SWITCH[_\s-]*CONGEST|NETWORK[_\s-]*OUT[_\s-]*OF[_\s-]*ORDER|RESOURCE[_\s-]*UNAVAILABLE/.test(text);
}

function mbPoolEndStatus(row) {
  if (mbUnusedNumber(row?.call)) return 'unused';
  if (row?.phase === 'hold') return 'stuck';
  if (mbBusyLine(row?.call)) return 'busy';
  if (mbPhoneOff(row?.call)) return 'phone_off';
  return 'no_answer';
}

function mbFarEndMissed(row) {
  if (!row || row.phase === 'hold') return false;
  const call = row.call;
  const sip = Number(call?.sipCode || call?.sip_code || 0);
  const q850 = Number(call?.causeCode || call?.cause_code || 0);
  const text = mbCallFailText(call);
  const rejected = [408, 480, 486, 487, 503, 603].includes(sip)
    || [17, 18, 19, 20, 21, 34, 38, 41, 42, 47, 102].includes(q850)
    || /USER[_\s-]*BUSY|CALL[_\s-]*REJECT|NO[_\s-]*ANSWER|NO[_\s-]*USER[_\s-]*RESPONSE|RECOVERY[_\s-]*ON[_\s-]*TIMER|DECLINE|SUBSCRIBER[_\s-]*ABSENT|TEMPORARY[_\s-]*FAILURE|NO[_\s-]*CIRCUIT|SWITCH[_\s-]*CONGEST|NETWORK[_\s-]*OUT[_\s-]*OF[_\s-]*ORDER/.test(text);
  if (row.phase === 'live' || row.id === _liveCallId) return rejected;
  return true;
}

function mbAgentCancelledRing(row) {
  const byAgent = window._mbCallMeta && window._mbCallMeta.hangupBy === 'agent';
  return !!byAgent && row?.phase !== 'live' && row?.phase !== 'hold';
}

function mbFinishUnanswered(row) {
  if (mbHopperStillUp()) return;
  if (row?.manual) {
    if (typeof hideOutboundWait === 'function') hideOutboundWait();
    if (typeof clearCustomerCard === 'function') clearCustomerCard();
    if (typeof setDialerStatus === 'function') setDialerStatus('offline');
    if (typeof updateSessionInDB === 'function') updateSessionInDB('offline');
    return;
  }
  if (typeof mbRefillHopper === 'function') mbRefillHopper();
  else mbSettleEmptyCalling();
}

function mbCallIsDead(call) {
  const st = String(call?.state || '').toLowerCase();
  if (['hangup', 'destroy', 'done', 'purge', 'bye', 'disconnected'].includes(st)) return true;
  if (st === 'active') return false;
  const cause = String(call?.cause || call?.sipReason || call?.sip_reason || '').toUpperCase();
  if (/BUSY|REJECT|DECLINE|CANCEL|NO_ANSWER|NORMAL_CLEAR/.test(cause)) return true;
  const code = Number(call?.sipCode || call?.sip_code || call?.causeCode || 0);
  return [404, 408, 480, 486, 487, 603].includes(code);
}

function mbSameDialDigits(a, b) {
  const x = String(a || '').replace(/\D/g, '');
  const y = String(b || '').replace(/\D/g, '');
  if (!x || !y) return false;
  const n = Math.min(8, x.length, y.length);
  return n >= 6 && x.slice(-n) === y.slice(-n);
}

function mbHopperStillUp() {
  return !!_liveCallId || _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'live' || r.phase === 'hold');
}

function mbSettleEmptyCalling() {
  if (mbHopperStillUp() || _outboundDialPending || dialerStatus !== 'calling') return;
  if (typeof hideOutboundWait === 'function') hideOutboundWait();
  if (typeof setDialerStatus === 'function') setDialerStatus('ready');
  if (typeof updateSessionInDB === 'function') updateSessionInDB('ready');
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
}

function mbUnansweredEnded(row) {
  const contact = row?.contact || null;
  const manualLeft = _hopper.some((r) => r.manual && (r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'live' || r.phase === 'hold'));
  const manual = !!row?.manual || (!manualLeft && !!window._mbManualAttempt);
  if (manual) {
    window._mbManualAttempt = false;
    _hopper = _hopper.filter((r) => r.phase === 'live' || r.phase === 'hold');
    _outboundDialPending = false;
    _telnyxCall = null;
    const byAgent = mbAgentCancelledRing(row);
    if (!byAgent && typeof mbPlayBusy === 'function') mbPlayBusy();
    else if (typeof mbStopRingback === 'function') mbStopRingback();
    if (!byAgent && contact && (mbFarEndMissed(row) || row?.phase === 'hold')) {
      mbReleaseUnanswered(contact, mbPoolEndStatus(row));
      mbFinishUnanswered(row);
      return;
    }
    if (contact && mbUnusedNumber(row?.call)) mbReleaseUnanswered(contact, 'unused');
    if (typeof handleCallEnd === 'function') handleCallEnd(0);
    return;
  }
  if (mbAgentCancelledRing(row)) return;
  const endStatus = mbPoolEndStatus(row);
  if (mbHopperStillUp()) {
    if (contact) mbReleaseUnanswered(contact, endStatus);
    if (!_liveCallId && typeof mbRefillHopper === 'function') mbRefillHopper();
    return;
  }
  _outboundDialPending = false;
  _telnyxCall = null;
  if (contact) mbReleaseUnanswered(contact, endStatus);
  if (_poolSyncing) mbSettleEmptyCalling();
  else if (typeof mbRefillHopper === 'function') mbRefillHopper();
  else mbSettleEmptyCalling();
}

function _hopperRowFor(call) {
  if (!call) return null;
  const id = call.id || call.callId || '';
  const hit = _hopper.find((r) => r.call === call || (id && r.id === id));
  if (hit) return hit;
  const dest = mbCallDigits(call);
  if (dest) {
    const same = _hopper.find((r) => (r.phase === 'dialing' || r.phase === 'ringing') && mbSameDialDigits(r.dest || mbCallDigits(r.call) || r.contact?.phone, dest));
    if (same) {
      if (same.call !== call && (!same.call?.id || String(same.id).startsWith('leg-') || same.call.id === call.id)) same.call = call;
      if (call.id) same.id = call.id;
      return same;
    }
  }
  if (call.direction !== 'inbound') {
    const orphans = _hopper.filter((r) => (r.phase === 'dialing' || r.phase === 'ringing') && String(r.id).startsWith('leg-'));
    if (orphans.length === 1) {
      orphans[0].call = call;
      if (call.id) orphans[0].id = call.id;
      if (dest) orphans[0].dest = dest;
      return orphans[0];
    }
  }
  return null;
}

function _rememberHopper(call, contact, dest, manual) {
  const existing = call && _hopper.find((r) => r.call === call);
  if (existing) {
    if (manual) existing.manual = true;
    if (contact && !existing.contact) existing.contact = contact;
    const digits = String(dest || '').replace(/\D/g, '');
    if (digits) existing.dest = digits;
    return existing;
  }
  const id = call.id || ('leg-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const row = {
    id,
    call,
    contact: contact || currentContact || null,
    phase: 'dialing',
    answeredAt: 0,
    dest: String(dest || mbCallDigits(call) || contact?.phone || '').replace(/\D/g, ''),
    manual: !!manual,
  };
  _hopper.push(row);
  mbCaptureTelnyxIds(call);
  if (call && !call.__mbEndHook) {
    call.__mbEndHook = true;
    const poke = () => { try { mbOnHopperCall(call); } catch (e) {} };
    if (typeof call.on === 'function') {
      ['hangup', 'destroy', 'bye'].forEach((ev) => { try { call.on(ev, poke); } catch (e) {} });
    }
  }
  return row;
}

function mbSweepDeadHopper() {
  if (dialerStatus !== 'calling' && dialerStatus !== 'on_call') return;
  const doomed = _hopper.filter((r) => (r.phase === 'dialing' || r.phase === 'ringing') && mbCallIsDead(r.call));
  if (!doomed.length) return;
  const sample = doomed[doomed.length - 1];
  _hopper = _hopper.filter((r) => !doomed.includes(r));
  _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
  if (sample.id === _liveCallId || sample.phase === 'live') {
    _liveCallId = null;
    _telnyxCall = null;
    if (typeof handleCallEnd === 'function') handleCallEnd(0);
  } else {
    mbUnansweredEnded(sample);
  }
  if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
}

function _agentBusy() {
  if (typeof dialerStatus !== 'undefined' && dialerStatus === 'wrapping') return true;
  if (typeof isOnHold !== 'undefined' && isOnHold && _liveCallId) return true;
  return !!_liveCallId && _hopper.some((r) => r.id === _liveCallId && (r.phase === 'live' || r.agentHold));
}

function _setHoldButton(on) {
  const hold = document.getElementById('btn-hold');
  if (hold) hold.classList.toggle('active', !!on);
}

function _pauseLiveAudio(paused) {
  const audio = document.getElementById('_telnyx_audio');
  if (!audio) return;
  try {
    if (paused) audio.pause();
    else if (audio.srcObject) audio.play();
  } catch (e) {}
}

function mbMarkLiveHold(on) {
  isOnHold = !!on;
  const row = _liveCallId ? _hopper.find((r) => r.id === _liveCallId) : null;
  if (row) {
    row.agentHold = !!on;
    if (on) row.phase = 'live';
  }
  _setHoldButton(on);
  _pauseLiveAudio(on);
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
  if (String(call?.state || '') === 'active') mbArmLocalRecording(call);
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
  if (typeof mbPublishLiveLeg === 'function') mbPublishLiveLeg(row);
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
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
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
  mbNoteCallHangup('agent');
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
  if (call.__mbSupervisor || (typeof mbSupervisorHeader === 'function' && mbSupervisorHeader(call))) {
    const dead = state === 'hangup' || state === 'destroy' || state === 'done' || state === 'purge';
    if (state === 'active') {
      window._mbCoachCall = call;
      _attachLiveAudio(call);
      const role = call.__mbSupervisorRole;
      const de = typeof currentLang !== 'undefined' && currentLang === 'de';
      const label = role === 'whisper' ? (de ? 'Flüstern' : 'Fısıltı') : role === 'barge' ? (de ? 'Beigetreten' : 'Katıldın') : (de ? 'Zuhören' : 'Dinliyorsun');
      if (typeof toast === 'function') toast(label, 'ok', 2200);
    }
    if (dead && window._mbCoachCall === call) window._mbCoachCall = null;
    return;
  }
  const dead = mbCallIsDead(call);
  let row = _hopperRowFor(call);
  if (!row) {
    if (dead) {
      const dest = mbCallDigits(call);
      let doomed = _hopper.filter((r) => {
        if (r.phase === 'live' || r.phase === 'hold') return false;
        if (dest && mbSameDialDigits(r.dest || mbCallDigits(r.call) || r.contact?.phone, dest)) return true;
        return mbCallIsDead(r.call);
      });
      if (!doomed.length && call.direction !== 'inbound') {
        const pending = _hopper.filter((r) => r.phase === 'dialing' || r.phase === 'ringing');
        const manual = pending.filter((r) => r.manual);
        doomed = manual.length ? manual : (pending.length === 1 ? pending : []);
      }
      if (!doomed.length) return;
      const sample = doomed[doomed.length - 1];
      _hopper = _hopper.filter((r) => !doomed.includes(r));
      _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
      mbUnansweredEnded(sample);
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      return;
    }
    if (state === 'held' || state === 'hold') return;
    if (call.direction === 'inbound' && state !== 'active') return;
    const pendingManual = _hopper.filter((r) => r.manual && (r.phase === 'dialing' || r.phase === 'ringing'));
    if (pendingManual.length === 1) {
      row = pendingManual[0];
      row.call = call;
      if (call.id) row.id = call.id;
    } else {
      row = _rememberHopper(call, currentContact, mbCallDigits(call), !!(call.__mbManual || window._mbOutboundManual));
    }
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
    if (call.remoteStream) {
      _attachLiveAudio(call);
      if (typeof mbStopRingback === 'function') mbStopRingback();
    } else if (typeof mbStartRingback === 'function') mbStartRingback();
    if (!_agentBusy() && typeof handleCallState === 'function') handleCallState('ringing', row.id);
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'held' || state === 'hold') {
    if (row.id === _liveCallId) {
      row.agentHold = true;
      row.phase = 'live';
      isOnHold = true;
      _setHoldButton(true);
      _pauseLiveAudio(true);
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      return;
    }
    row.phase = 'hold';
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'active') {
    if (typeof mbStopRingback === 'function') mbStopRingback();
    mbCaptureTelnyxIds(call);
    mbWatchRecordingId(call);
    mbStartCallRecording(call);
    if (row.id === _liveCallId && row.phase === 'live') {
      if (row.agentHold || isOnHold) return;
      _setHoldButton(false);
      _pauseLiveAudio(false);
      _attachLiveAudio(row.call);
      return;
    }
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
    const wasLive = (row.id === _liveCallId || row.phase === 'live') && !mbFarEndMissed(row);
    const dest = row.dest || mbCallDigits(call);
    _hopper = _hopper.filter((r) => {
      if (r === row) return false;
      if (r.phase === 'live' || r.phase === 'hold') return true;
      if ((row.manual || window._mbManualAttempt) && (r.phase === 'dialing' || r.phase === 'ringing')) return false;
      return !(dest && mbSameDialDigits(r.dest || mbCallDigits(r.call) || r.contact?.phone, dest));
    });
    _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
    if (wasLive) {
      mbFinishLocalRecording(call, true);
      mbNoteRecordingMiss(call);
      _liveCallId = null;
      _telnyxCall = null;
      const dur = callStart ? Math.round((Date.now() - callStart) / 1000) : 0;
      callStart = null;
      if (typeof handleCallEnd === 'function') handleCallEnd(dur);
    } else {
      const owned = row.id === _liveCallId || row.phase === 'live';
      if (row.id === _liveCallId) {
        _liveCallId = null;
        callStart = null;
      }
      if (_telnyxCall === row.call) _telnyxCall = null;
      if (owned && dialerStatus === 'on_call' && !_liveCallId && !(typeof mbTakeHeldCall === 'function' && mbTakeHeldCall())) {
        if (!mbHopperStillUp()) {
          if (typeof clearCustomerCard === 'function') clearCustomerCard();
          if (typeof hideOutboundWait === 'function') hideOutboundWait();
          if (typeof setDialerStatus === 'function') setDialerStatus('calling');
        }
      }
      mbUnansweredEnded(row);
    }
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
  }
}

function _makeCall(destination, callerNumber, contact, work) {
if (!_telnyxClient || !telnyxReady) {
_outboundDialPending = false;
toast('Hat bağlantısı yok', 'err'); return;
}
if (typeof mbLineCallBlockedSync === 'function' && mbLineCallBlockedSync(callerNumber, destination)) {
  _outboundDialPending = false;
  if (typeof mbNoteIntlBlocked === 'function') mbNoteIntlBlocked(contact);
  if (typeof dialerStatus !== 'undefined' && dialerStatus === 'calling' && typeof setDialerStatus === 'function') setDialerStatus('ready');
  return;
}
if (mbDialPhoneBad(destination)) {
  mbDropUnusedNumber(contact, work !== 'auto');
  return;
}
try {
window._mbOutboundManual = work !== 'auto';
window._mbManualAttempt = work !== 'auto';
if (work !== 'auto' && contact && !contact.queue_id && typeof mbPlaceInManualQueue === 'function') {
  void mbPlaceInManualQueue(contact);
}
const call = _telnyxClient.newCall({
destinationNumber: destination,
callerNumber: callerNumber,
audio: true, video: false,
detectAnsweringMachine: true,
});
call.__mbManual = work !== 'auto';
_rememberHopper(call, contact || currentContact, destination, call.__mbManual);
window._mbOutboundManual = false;
if (!_telnyxCall) _telnyxCall = call;
if (!callStart) callStart = Date.now();
_outboundDialPending = true;
} catch(e) { window._mbOutboundManual = false; _outboundDialPending = false; toast('Arama hatası: ' + e.message, 'err'); }
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
    const row = _hopper.find((r) => r.call === call);
    if (!row) return;
    if (dialerStatus === 'wrapping') {
      call.state = 'held';
      call.held = true;
      row.phase = 'hold';
      row.answeredAt = row.answeredAt || Date.now();
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      return;
    }
    if (dialerStatus !== 'calling' && dialerStatus !== 'on_call') return;
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
const icon = granted ? 'ph-microphone' : 'ph-microphone-slash';
const kicker = typeof t === 'function' ? t('dial.mic_chip') : 'Mikrofon';
const hint = typeof t === 'function' ? t('dial.mic_chip_hint') : 'Ayarlar için tıkla';
el.classList.toggle('is-on', !!granted);
el.classList.toggle('is-off', !granted);
el.innerHTML = `<i class="ph ${icon}"></i><span class="dialer-mic-chip__text"><span class="dialer-mic-chip__kicker">${kicker}</span><span class="dialer-mic-chip__hint">${hint}</span></span>`;
el.title = granted ? t('telnyx.mic_on') : t('telnyx.mic_off');
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
dialing: { tr:'Aranıyor...', de:'Wählt...' },
ringing: { tr:'Çalıyor...', de:'Klingelt...' },
active:  { tr:'Aramada', de:'Im Gespräch' },
};
if (state === 'active') {
_outboundAnswered = true;
mbNoteCallAnswered();
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
if (typeof switchContactTab === 'function') switchContactTab('info');
} else if (subLabels[state] && label) {
label.textContent = subLabels[state][currentLang] || subLabels[state].tr;
}
}

function handleAMD(result) {
amdResult = result;
if (result === 'machine' && !_outboundAnswered) {
toast('🤖 ' + t('telnyx.amd_voicemail'), 'ok');
mbNoteCallHangup('system');
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
mbNoteCallHangup('customer');
if (typeof mbMarkLiveHold === 'function') mbMarkLiveHold(false);
_outboundWaitGen++;
const liveLeft = _hopper.some((r) => r.phase === 'live' || r.phase === 'hold');
if ((dialerStatus === 'calling' || dialerStatus === 'on_call') && !liveLeft) {
  _hopper = _hopper.filter((r) => r.phase === 'live' || r.phase === 'hold');
}
_outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing');
const wasAttempt = dialerStatus === 'on_call' || (dialerStatus === 'calling' && !liveLeft);
callSeconds  = duration || callSeconds;
activeCallId = null;
if (wasAttempt) {
if (typeof hideOutboundWait === 'function') hideOutboundWait();
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
