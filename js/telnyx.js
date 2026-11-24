// ─────────────────────────────────────────────
// TELNYX WEBRTC ENTEGRASYONu
// ─────────────────────────────────────────────

function mbResetCallMeta() {
  window._mbCallMeta = null;
  window._mbBillSec = null;
}

function mbNoteCallStart(caller, work) {
  window._mbBillSec = null;
  window._mbCallMeta = {
    dialAt: new Date().toISOString(),
    caller: String(caller || '').trim(),
    work: work || 'manual',
    answeredAt: '',
    hangupBy: '',
  };
  window._mbLocalRecUrl = '';
  window._mbLocalRecBlob = null;
  window._mbLocalRecCall = null;
}

function mbNoteCallAnswered(atMs) {
  const meta = window._mbCallMeta || {};
  if (!meta.answeredAt) {
    const ms = Number(atMs) || Date.now();
    meta.answeredAt = new Date(ms).toISOString();
  }
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
    control: String(ids.telnyxCallControlId || call?.telnyxCallControlId || call?.options?.telnyxCallControlId || '').trim(),
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
  if (String(call.state || '') === 'active') {
    mbStartCallRecording(call);
    if (typeof mbApplyCallNoise === 'function') void mbApplyCallNoise(call);
  }
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

function mbCallPeerConnection(call) {
  return call?.peer?.instance
    || call?.peerConnection
    || call?.pc
    || call?.__mbSip?.connection
    || call?.connection
    || null;
}

function mbCallLocalStream(call) {
  if (call?.localStream?.getAudioTracks?.().some((track) => track.readyState === 'live')) return call.localStream;
  const pc = mbCallPeerConnection(call);
  if (!pc?.getSenders) return null;
  const tracks = pc.getSenders().map((sender) => sender.track).filter((track) => track && track.kind === 'audio' && track.readyState === 'live');
  if (!tracks.length) return null;
  const stream = new MediaStream();
  tracks.forEach((track) => stream.addTrack(track));
  call.localStream = stream;
  return stream;
}

function mbCallRemoteStream(call) {
  if (call?.remoteStream?.getAudioTracks?.().some((track) => track.readyState === 'live')) return call.remoteStream;
  const audioEl = document.getElementById('_telnyx_audio');
  if (audioEl?.srcObject?.getAudioTracks?.().some((track) => track.readyState === 'live')) {
    call.remoteStream = audioEl.srcObject;
    return audioEl.srcObject;
  }
  const pc = mbCallPeerConnection(call);
  if (!pc?.getReceivers) return null;
  const tracks = pc.getReceivers().map((r) => r.track).filter((track) => track && track.kind === 'audio' && track.readyState === 'live');
  if (!tracks.length) return null;
  const stream = new MediaStream(tracks);
  call.remoteStream = stream;
  return stream;
}

function mbRecordingUsesTelnyx() {
  if (typeof mbIsSipVoice === 'function' && mbIsSipVoice()) return false;
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

function mbMixRecTrack(ctx, dest, track) {
  if (!ctx || !dest || !track) return;
  let probe = track;
  try {
    const cloned = typeof track.clone === 'function' ? track.clone() : null;
    if (cloned) probe = cloned;
  } catch (e) {}
  try { ctx.createMediaStreamSource(new MediaStream([probe])).connect(dest); } catch (e) {}
}

async function mbArmLocalRecording(call) {
  if (mbRecordingUsesTelnyx()) return;
  if (!call || call.__mbLocalRec || call.__mbSupervisor || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  if (typeof MediaRecorder === 'undefined') {
    call.__mbLocalMiss = 'nosound';
    return;
  }
  if (typeof mbCallIsDead === 'function' && mbCallIsDead(call)) return;
  const remote = typeof mbCallRemoteStream === 'function' ? mbCallRemoteStream(call) : (call.remoteStream || document.getElementById('_telnyx_audio')?.srcObject);
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!remote || !Ctx) {
    call.__mbLocalTries = (call.__mbLocalTries || 0) + 1;
    if (call.__mbLocalTries <= 12) {
      setTimeout(() => mbArmLocalRecording(call), 350);
      return;
    }
    call.__mbLocalMiss = 'nosound';
    return;
  }
  try {
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) {}
    }
    const dest = ctx.createMediaStreamDestination();
    remote.getAudioTracks?.().forEach((track) => mbMixRecTrack(ctx, dest, track));
    const local = mbCallLocalStream(call);
    if (local) {
      call.__mbLocalMicMixed = true;
      local.getAudioTracks?.().forEach((track) => mbMixRecTrack(ctx, dest, track));
    } else {
      call.__mbLocalMicTries = (call.__mbLocalMicTries || 0) + 1;
      if (call.__mbLocalMicTries <= 6) {
        setTimeout(() => {
          if ((typeof mbCallIsDead === 'function' && mbCallIsDead(call))) return;
          const late = mbCallLocalStream(call);
          if (!late || !call.__mbLocalCtx || call.__mbLocalMicMixed) return;
          call.__mbLocalMicMixed = true;
          late.getAudioTracks?.().forEach((track) => mbMixRecTrack(call.__mbLocalCtx, call.__mbLocalDest, track));
        }, 400);
      }
    }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mime = types.find((kind) => MediaRecorder.isTypeSupported(kind)) || '';
    const rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
    const chunks = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    window._mbLocalRecWait = new Promise((resolve) => { call.__mbLocalDone = resolve; });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (call.__mbLocalKeep && blob.size > 120) window._mbLocalRecBlob = blob;
      else if (call.__mbLocalKeep) call.__mbLocalMiss = 'short';
      try { ctx.close(); } catch (e) {}
      call.__mbLocalCtx = null;
      call.__mbLocalDest = null;
      if (typeof call.__mbLocalDone === 'function') call.__mbLocalDone(window._mbLocalRecBlob || null);
    };
    rec.onerror = () => { call.__mbLocalMiss = 'nosound'; };
    rec.start(1000);
    call.__mbLocalRec = rec;
    call.__mbLocalCtx = ctx;
    call.__mbLocalDest = dest;
    call.__mbLocalKeep = true;
    call.__mbLocalMiss = '';
    window._mbLocalRecCall = call;
    window._mbLocalRecBlob = null;
  } catch (e) {
    call.__mbLocalTries = (call.__mbLocalTries || 0) + 1;
    if (call.__mbLocalTries <= 8) {
      setTimeout(() => mbArmLocalRecording(call), 400);
      return;
    }
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
  const auth = (typeof mbAuthHeaders === 'function' ? mbAuthHeaders() : {}) || {};
  const token = String(auth.Authorization || '').replace(/^Bearer\s+/i, '') || SB_KEY;
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${SB_URL}/storage/v1/object/call-recordings/${path}`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': blob.type || 'audio/webm',
          'x-upsert': 'true',
        },
        body: blob,
      });
      if (!res.ok) throw new Error('storage');
      window._mbLocalRecBlob = null;
      window._mbRecWarned = 0;
      return `${SB_URL}/storage/v1/object/public/call-recordings/${path}`;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr || new Error('storage');
}

function mbCommitLocalRecording() {
  if (window._mbLocalRecUrl) return Promise.resolve(window._mbLocalRecUrl);
  if (window._mbRecCommit) return window._mbRecCommit;
  window._mbRecCommit = (async () => {
    let blob = window._mbLocalRecBlob || null;
    if (!blob) {
      blob = await Promise.race([
        mbFinishLocalRecording(window._mbLocalRecCall || null, true),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    }
    blob = blob || window._mbLocalRecBlob || null;
    if (!blob) return '';
    let url = '';
    try { url = await mbUploadLocalRecording(blob); } catch (e) { url = ''; }
    if (!url) return '';
    window._mbLocalRecUrl = url;
    const pending = window._mbPendingLogPromise;
    const id = window._mbPendingLogId || (pending ? await pending.catch(() => '') : '');
    if (id && typeof sb === 'function') {
      await sb(`call_logs?id=eq.${id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ recording_url: url }),
      }).catch(() => {});
    }
    return url;
  })().finally(() => { window._mbRecCommit = null; });
  return window._mbRecCommit;
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
  if (!call || call.__mbSupervisor || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  // Kendi sunucu (Supabase) kaydı — Telnyx/OnDialer/harici SIP
  if (typeof mbRecordingUsesTelnyx !== 'function' || !mbRecordingUsesTelnyx()) {
    mbArmLocalRecording(call);
    return;
  }
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
    if ((call.__mbRecTries || 0) >= 2) {
      // Telnyx kaydı açılmazsa kendi sunucuya düş
      mbArmLocalRecording(call);
      mbRecWarn('telnyx.rec_fail', 'Ses kaydı başlatılamadı');
    }
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
if (typeof mbIsSipVoice === 'function' && mbIsSipVoice()) {
  if (typeof mbSipSend === 'function') mbSipSend(type, data);
  return;
}
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
  if (want && typeof mbStartHoldMusic === 'function') void mbStartHoldMusic(call, live?.contact || (typeof currentContact !== 'undefined' ? currentContact : null));
  else if (typeof mbStopHoldMusic === 'function') mbStopHoldMusic(call);
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
toast(typeof t === 'function' ? t('dial.health.push.line') : 'Hat bağlantısı hazır', 'ok');
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
  return /UNALLOCATED|INVALID[_\s-]*NUMBER|NUMBER[_\s-]*CHANGED|NO[_\s-]*ROUTE[_\s-]*DESTINATION|DESTINATION[_\s-]*OUT[_\s-]*OF[_\s-]*ORDER|NOT[_\s-]*IN[_\s-]*SERVICE|UNASSIGNED|DOES[_\s-]*NOT[_\s-]*EXIST|ADDRESS[_\s-]*INCOMPLETE|NOT[_\s-]*FOUND/.test(text);
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
  if (sip === 486 || sip === 600 || q850 === 17) return true;
  return /USER[_\s-]*BUSY|(^|[^A-Z])BUSY([^A-Z]|$)/.test(mbCallFailText(call));
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
  return /SUBSCRIBER[_\s-]*ABSENT|TEMPORARY[_\s-]*FAILURE|NORMAL[_\s-]*TEMPORARY|NO[_\s-]*CIRCUIT|SWITCH[_\s-]*CONGEST|NETWORK[_\s-]*OUT[_\s-]*OF[_\s-]*ORDER|RESOURCE[_\s-]*UNAVAILABLE|(^|[^A-Z])UNAVAILABLE([^A-Z]|$)/.test(text);
}

function mbScreenMissOn() {
  return true;
}

function mbScreenThis(row) {
  if (!row || !mbScreenMissOn()) return false;
  const st = mbPoolEndStatus(row);
  // Meşgul / kapalı asla temsilciye düşmez. Telesekreter kısa konuşmada elenir.
  if (st === 'busy' || st === 'phone_off') return true;
  if (st === 'voicemail') return mbTalkSeconds(row) < 12;
  return false;
}

function mbClearAnswerScreen(row) {
  if (!row) return;
  if (row._mbScreenTimer) {
    clearTimeout(row._mbScreenTimer);
    row._mbScreenTimer = null;
  }
  row._mbScreenArm = false;
}

function mbCallStillUp(call) {
  if (!call) return false;
  if (call.sipEndedAt) return false;
  const st = String(call.state || '');
  if (st === 'hangup' || st === 'destroy' || st === 'done' || st === 'failed') return false;
  return true;
}

function mbRejectScreened(row, why) {
  mbClearAnswerScreen(row);
  if (why) {
    if (why === 'machine') {
      row.amd = 'machine';
      if (row.call) row.call.amd_result = 'machine';
    }
  }
  try { row.call?.hangup(); } catch (e) {}
}

function mbBridgeAnswered(row) {
  if (!row || !_hopper.includes(row)) return;
  mbClearAnswerScreen(row);
  const call = row.call;
  if (!mbCallStillUp(call)) return;
  if (mbScreenMissOn() && (call?.amd_result === 'machine' || mbBusyLine(call) || mbPhoneOff(call))) {
    mbRejectScreened(row, call?.amd_result === 'machine' ? 'machine' : '');
    return;
  }
  if (_agentBusy() && row.id !== _liveCallId) {
    row.phase = 'hold';
    row.answeredAt = row.answeredAt || call?.sipAnsweredAt || Date.now();
    if (typeof mbStartHoldMusic === 'function') void mbStartHoldMusic(call, row.contact);
    try { call.hold(); } catch (e) {}
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    if (typeof mbSyncPool === 'function') mbSyncPool();
    return;
  }
  row.answeredAt = row.answeredAt || call?.sipAnsweredAt || Date.now();
  if (!callStart) callStart = Date.now();
  mbConnectHopperRow(row);
}

function mbArmAnswerScreen(row) {
  if (!row || row._mbScreenArm || row.phase === 'live' || row.phase === 'hold') return;
  const call = row.call;
  if (!mbCallStillUp(call)) return;
  if (mbScreenMissOn() && (call?.amd_result === 'machine' || mbBusyLine(call) || mbPhoneOff(call))) {
    mbRejectScreened(row, call?.amd_result === 'machine' ? 'machine' : '');
    return;
  }
  row._mbScreenArm = true;
  row.phase = 'screen';
  if (typeof mbStopRingback === 'function') mbStopRingback();
  // Canlı görüşmede asla bekleme ekranına dönme (kartı silip "Bağlanıyor"a atıyordu)
  const agentLive = dialerStatus === 'on_call' || !!_liveCallId;
  if (!agentLive && typeof mbPaintOutboundWaitConnecting === 'function') {
    mbPaintOutboundWaitConnecting();
  }
  const waitMs = row.manual ? 800 : 1200;
  row._mbScreenTimer = setTimeout(() => {
    row._mbScreenTimer = null;
    if (!_hopper.includes(row)) return;
    if (mbScreenMissOn() && (row.call?.amd_result === 'machine' || mbBusyLine(row.call) || mbPhoneOff(row.call))) {
      mbRejectScreened(row, row.call?.amd_result === 'machine' ? 'machine' : '');
      return;
    }
    mbBridgeAnswered(row);
  }, waitMs);
}

function mbContinueAfterScreen() {
  _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen');
  if (mbHopperStillUp()) {
    // Canlı görüşmeyi bekleme ekranına çekme
    if (dialerStatus === 'calling' && !(_liveCallId || dialerStatus === 'on_call') && typeof showOutboundWait === 'function') {
      showOutboundWait();
    }
    return;
  }
  if (dialerStatus === 'on_call' || dialerStatus === 'wrapping') {
    if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
    return;
  }
  if (typeof mbRecoverDialerSurface === 'function') {
    mbRecoverDialerSurface(_autoDial ? 'calling' : 'ready');
  } else if (typeof setDialerStatus === 'function' && dialerStatus === 'calling') {
    setDialerStatus('calling');
  }
  if (typeof mbRefillHopper === 'function') mbRefillHopper();
  else mbSettleEmptyCalling();
  if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
}

function mbPoolEndStatus(row) {
  const call = row?.call;
  if (String(call?.amd_result || row?.amd || '') === 'machine') return 'voicemail';
  if (mbUnusedNumber(call)) return 'unused';
  if (row?.phase === 'hold') return 'stuck';
  if (mbBusyLine(call)) return 'busy';
  if (mbPhoneOff(call)) return 'phone_off';
  return 'no_answer';
}

function mbCloseMiss(row, status) {
  const st = status || mbPoolEndStatus(row) || 'no_answer';
  const contact = row?.contact || null;
  if (typeof mbWriteAttemptLog === 'function') mbWriteAttemptLog(contact, st, row);
  if (contact) mbReleaseUnanswered(contact, st);
  // Temsilciye düşmeyen kaçış: kart/sonuçsuz artığı bırakma
  if (contact?.id && currentContact?.id === contact.id && dialerStatus !== 'on_call' && dialerStatus !== 'wrapping') {
    if (typeof clearCustomerCard === 'function') {
      window._mbAllowClearWrap = true;
      currentContact = null;
      clearCustomerCard();
    }
  }
  if (typeof loadUnfinalizedCalls === 'function') void loadUnfinalizedCalls();
  return st;
}

function mbProviderSeconds(call, row) {
  const session = call && call.__mbSip;
  let start = Number(call && call.sipAnsweredAt) || 0;
  if (!start && session && session.start_time) {
    const t = new Date(session.start_time).getTime();
    if (t) start = t;
  }
  if (!start) start = Number(row && row.answeredAt) || 0;
  if (!start) return 0;
  let end = Number(call && call.sipEndedAt) || 0;
  if (!end && session && session.end_time) {
    const t = new Date(session.end_time).getTime();
    if (t) end = t;
  }
  if (!end) end = Date.now();
  if (end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

function mbTalkSeconds(row) {
  const billed = mbProviderSeconds(row?.call, row);
  if (billed > 0) return billed;
  const at = Number(row?.answeredAt) || 0;
  if (at) return Math.max(0, Math.floor((Date.now() - at) / 1000));
  const iso = window._mbCallMeta?.answeredAt;
  const t = iso ? Date.parse(iso) : 0;
  if (!t) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function mbFarEndMissed(row) {
  if (!row || row.phase === 'hold') return false;
  if (mbTalkSeconds(row) >= 3 && (row.phase === 'live' || row.id === _liveCallId)) return false;
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
  // Personel konuşurken / sonuç girerken boşalan yere yeni arama yok
  if (typeof dialerStatus !== 'undefined' && (dialerStatus === 'on_call' || dialerStatus === 'wrapping')) return;
  if (_liveCallId) return;
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
  return !!_liveCallId || _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen' || r.phase === 'live' || r.phase === 'hold');
}

function mbSettleEmptyCalling() {
  if (mbHopperStillUp() || _outboundDialPending) return;
  if (dialerStatus !== 'calling' && dialerStatus !== 'on_call') return;
  if (typeof mbRecoverDialerSurface === 'function') mbRecoverDialerSurface('ready');
  else {
    if (typeof hideOutboundWait === 'function') hideOutboundWait();
    if (typeof setDialerStatus === 'function') setDialerStatus('ready');
  }
  if (typeof updateSessionInDB === 'function') updateSessionInDB('ready');
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
  if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
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
    if (!byAgent && (mbFarEndMissed(row) || row?.phase === 'hold')) {
      const endStatus = mbPoolEndStatus(row);
      mbWriteAttemptLog(contact, endStatus, row);
      if (contact) mbReleaseUnanswered(contact, endStatus);
      mbFinishUnanswered(row);
      return;
    }
    if (byAgent) {
      mbCloseMiss(row);
      mbFinishUnanswered(row);
      return;
    }
    if (contact && mbUnusedNumber(row?.call)) mbReleaseUnanswered(contact, 'unused');
    if (typeof handleCallEnd === 'function') handleCallEnd(0);
    return;
  }
  const endStatus = mbPoolEndStatus(row);
  if (mbHopperStillUp()) {
    mbCloseMiss(row, endStatus);
    if (!_liveCallId && typeof mbRefillHopper === 'function') mbRefillHopper();
    return;
  }
  _outboundDialPending = false;
  _telnyxCall = null;
  mbCloseMiss(row, endStatus);
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
  // Canlı görüşme veya sonuç ekranı → ikinci açan müzikte bekler
  if (typeof dialerStatus !== 'undefined' && (dialerStatus === 'wrapping' || dialerStatus === 'on_call')) return true;
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
  _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen');
  if (row.contact) currentContact = row.contact;
  else if (window._mbLastContact) currentContact = window._mbLastContact;
  if (typeof hideOutboundWait === 'function') hideOutboundWait({ openingCard: true });
  if (currentContact && typeof showCustomerCard === 'function') {
    try { showCustomerCard(currentContact); } catch (e) {}
  }
  const data = document.getElementById('cust-data');
  if (currentContact && data && data.style.display === 'none' && typeof showCustomerCard === 'function') {
    try { showCustomerCard(currentContact); } catch (e) {}
  }
  _attachLiveAudio(row.call);
  if (row.answeredAt || row.call?.sipAnsweredAt) mbNoteCallAnswered(row.answeredAt || row.call?.sipAnsweredAt);
  if (typeof handleCallState === 'function') handleCallState('active', row.id);
  if (typeof startCallTimer === 'function') startCallTimer(row.answeredAt || row.call?.sipAnsweredAt);
  if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
  if (typeof mbPublishLiveLeg === 'function') mbPublishLiveLeg(row);
  if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
  if (typeof mbSyncPool === 'function') mbSyncPool();
}

function mbTakeHeldCall() {
  const held = _hopper
    .filter((r) => r.phase === 'hold')
    .sort((a, b) => (Number(a.answeredAt) || 0) - (Number(b.answeredAt) || 0));
  while (held.length) {
    const row = held.shift();
    if (!row) break;
    if (!mbCallStillUp(row.call) || mbBusyLine(row.call) || mbPhoneOff(row.call) || row.call?.amd_result === 'machine') {
      _hopper = _hopper.filter((r) => r !== row);
      if (typeof mbStopHoldMusic === 'function') mbStopHoldMusic(row.call);
      try { row.call?.hangup(); } catch (e) {}
      mbCloseMiss(row, mbPoolEndStatus(row));
      continue;
    }
    if (typeof mbStopHoldMusic === 'function') mbStopHoldMusic(row.call);
    try { row.call.unhold(); } catch (e) {}
    mbConnectHopperRow(row);
    if (typeof toast === 'function') toast(typeof t === 'function' ? t('dial.hopper.held_next') : 'Müzikte bekleyen kişi bağlandı', 'ok', 2200);
    return true;
  }
  return false;
}

function mbWriteAttemptLog(contact, outcome, row) {
  if (!row || row.logged || String(row.id || '').startsWith('sim-')) return;
  if (typeof sb !== 'function') return;
  row.logged = true;
  const meta = window._mbCallMeta || {};
  let phone = String(contact?.phone || '').trim();
  if (!phone && row?.dest) {
    const digits = String(row.dest).replace(/\D/g, '');
    if (digits.length >= 8) phone = `+${digits}`;
  }
  const campId = contact?.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : null) || null;
  let firmId = contact?.firm_id || (typeof currentUser !== 'undefined' ? currentUser?.firm_id : null) || null;
  if (!firmId && campId) {
    try {
      const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === campId);
      if (camp?.firm_id) firmId = camp.firm_id;
    } catch (e) {}
  }
  const talk = Math.max(0, Number(typeof mbTalkSeconds === 'function' ? mbTalkSeconds(row) : 0) || 0);
  const answeredIso = talk
    ? (meta.answeredAt || new Date(Date.now() - talk * 1000).toISOString())
    : (meta.answeredAt || null);
  const body = {
    campaign_id: campId,
    firm_id: firmId,
    agent_id: (typeof currentUser !== 'undefined' ? currentUser?.id : null) || null,
    phone: phone || null,
    outcome: outcome || 'no_answer',
    notes: '',
    duration_sec: talk,
    started_at: meta.dialAt || new Date(Date.now() - Math.max(talk, 0) * 1000).toISOString(),
    ended_at: new Date().toISOString(),
  };
  if (answeredIso) body.answered_at = answeredIso;
  if (contact?.id && typeof isValidUUID === 'function' && isValidUUID(contact.id)) body.contact_id = contact.id;
  const extra = typeof mbCallLogExtras === 'function' ? mbCallLogExtras() : {};
  if (!extra.work_type) extra.work_type = row.manual ? 'manual' : (meta.work || 'manual');
  const post = (payload) => sb('call_logs', { method: 'POST', prefer: 'return=representation', body: JSON.stringify(payload) });
  post({ ...body, ...extra, duration_sec: talk }).then((rows) => {
    const saved = Array.isArray(rows) ? rows[0] : rows;
    if (saved?.id && talk > 0 && typeof mbChargeCall === 'function') void mbChargeCall(saved);
  }).catch(() => post({ ...body, duration_sec: talk }).catch(() => {}));
}

function mbEnsureTalkLog(sec) {
  if (window._mbPendingLogId || window._mbPendingLogPromise || typeof sb !== 'function') return;
  const meta = window._mbCallMeta || {};
  const duration = Math.max(0, Number(sec) || 0);
  if (!meta.answeredAt && duration < 3 && !(Number(window._mbBillSec) > 0)) return;
  const contact = (typeof currentContact !== 'undefined' && currentContact) ? currentContact : null;
  const campId = contact?.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : null) || null;
  let firmId = contact?.firm_id || (typeof currentUser !== 'undefined' ? currentUser?.firm_id : null) || null;
  if (!firmId && campId) {
    try {
      const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === campId);
      if (camp?.firm_id) firmId = camp.firm_id;
    } catch (e) {}
  }
  const phone = String(contact?.phone || '').trim();
  const started = meta.dialAt || new Date(Date.now() - duration * 1000).toISOString();
  const body = {
    campaign_id: (campId && typeof isValidUUID === 'function' && isValidUUID(campId)) ? campId : null,
    firm_id: firmId,
    agent_id: (typeof currentUser !== 'undefined' ? currentUser?.id : null) || null,
    phone: phone || null,
    duration_sec: duration,
    started_at: started,
    ended_at: new Date().toISOString(),
    notes: '',
  };
  if (contact?.id && typeof isValidUUID === 'function' && isValidUUID(contact.id)) body.contact_id = contact.id;
  const extra = typeof mbCallLogExtras === 'function' ? mbCallLogExtras() : {};
  if (!extra.work_type) extra.work_type = meta.work || 'manual';
  const post = (payload) => sb('call_logs', { method: 'POST', prefer: 'return=representation', body: JSON.stringify(payload) });
  window._mbPendingLogPromise = post({ ...body, ...extra }).catch(() => post(body)).then((rows) => {
    const saved = Array.isArray(rows) ? rows[0] : rows;
    if (saved?.id) window._mbPendingLogId = saved.id;
    return saved?.id || '';
  }).catch(() => '');
}

function mbSkipContact(contact, ms) {
  if (!contact?.id) return;
  const until = Date.now() + Math.max(5000, Number(ms) || 60000);
  _hopperSkip.set(String(contact.id), until);
  const phone = String(contact.phone || contact._dialTarget || '').replace(/\D/g, '');
  if (phone.length >= 8) _hopperSkip.set('tel:' + phone.slice(-10), until);
}

function mbReleaseUnanswered(contact, status) {
  if (!contact?.id) return;
  const st = status || 'no_answer';
  mbSkipContact(contact, 3 * 60 * 1000);
  if (typeof isValidUUID === 'function' && isValidUUID(contact.id) && typeof sb === 'function') {
    const attempts = Math.max(0, Number(contact.attempt_count) || 0) + 1;
    contact.attempt_count = attempts;
    contact.status = st;
    contact.locked_by = null;
    sb(`contacts?id=eq.${contact.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: st,
        locked_by: null,
        locked_at: null,
        attempt_count: attempts,
        last_called_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
  if (typeof loadUnfinalizedCalls === 'function') void loadUnfinalizedCalls();
}

function mbPruneDeadHopperRows() {
  const dead = _hopper.filter((r) => {
    if (!r || r.phase === 'live' || r.phase === 'hold') return false;
    if (r.id === _liveCallId) return false;
    return typeof mbCallIsDead === 'function' ? mbCallIsDead(r.call) : !r.call;
  });
  if (!dead.length) return;
  dead.forEach((row) => {
    mbClearAnswerScreen(row);
    _hopper = _hopper.filter((r) => r !== row);
    if (row.contact) mbCloseMiss(row, mbPoolEndStatus(row));
  });
  _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen');
}

async function mbSweepOwnCalling(fallbackStatus) {
  const uid = String(currentUser?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(uid) || typeof sb !== 'function') return;
  mbPruneDeadHopperRows();
  // Yalnız gerçekten canlı / çalan / müzikte olanları koru
  const mine = new Set(
    _hopper
      .filter((r) => {
        if (!r?.contact?.id) return false;
        if (r.phase === 'live' || r.phase === 'hold' || r.phase === 'screen') return true;
        if (r.phase === 'dialing' || r.phase === 'ringing') {
          return !(typeof mbCallIsDead === 'function' && mbCallIsDead(r.call));
        }
        return false;
      })
      .map((r) => String(r.contact.id))
  );
  if (_liveCallId) {
    const live = _hopper.find((r) => r.id === _liveCallId);
    if (live?.contact?.id) mine.add(String(live.contact.id));
  }
  if (currentContact?.id && (dialerStatus === 'on_call' || dialerStatus === 'wrapping')) {
    mine.add(String(currentContact.id));
  }
  const rows = await sb(
    `contacts?status=eq.calling&locked_by=eq.${uid}&select=id,attempt_count,campaign_id&limit=80`
  ).catch(() => []);
  const st = fallbackStatus || 'no_answer';
  await Promise.all((rows || []).map(async (row) => {
    if (!row?.id || mine.has(String(row.id))) return;
    const attempts = Math.max(0, Number(row.attempt_count) || 0) + 1;
    _hopperSkip.set(String(row.id), Date.now() + 3 * 60 * 1000);
    await sb(`contacts?id=eq.${row.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: st,
        locked_by: null,
        locked_at: null,
        attempt_count: attempts,
        last_called_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }));
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
  if (typeof loadUnfinalizedCalls === 'function') void loadUnfinalizedCalls();
}

function mbCancelHopper(opts) {
  const refill = !(opts && opts.refill === false);
  const rows = _hopper.filter((r) => r.phase !== 'live');
  rows.forEach((r) => {
    mbClearAnswerScreen(r);
    if (r.contact && r.phase !== 'hold') mbCloseMiss(r, mbPoolEndStatus(r));
    else if (r.contact) mbCloseMiss(r, 'no_answer');
    _hopper = _hopper.filter((x) => x !== r);
    try { r.call.hangup(); } catch (e) {}
  });
  if (!_liveCallId) {
    _outboundDialPending = false;
    _telnyxCall = null;
    if (typeof hideOutboundWait === 'function') hideOutboundWait();
    // Kapat (refill=true): dalgayı bitir, hazırda kal + yeni arama.
    // Durdur (refill=false): sadece kapat; offline’a geçiş toggleReady’de.
    if (typeof dialerStatus !== 'undefined' && dialerStatus === 'calling') {
      if (typeof clearCustomerCard === 'function') clearCustomerCard();
      if (refill) {
        if (typeof setDialerStatus === 'function') setDialerStatus('ready');
        if (typeof mbRefillHopper === 'function') mbRefillHopper();
      }
    }
  }
  if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
  if (typeof mbRefreshCampLeftSoon === 'function') mbRefreshCampLeftSoon();
  if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
}

function mbHangupLiveOrWave() {
  mbNoteCallHangup('agent');
  if (_liveCallId) {
    const row = _hopper.find((r) => r.id === _liveCallId);
    const call = row?.call || _telnyxCall;
    try { call?.hangup(); } catch (e) {}
    // Ölü hat / lag: hangup event gelmezse UI on_call + boş kartta kalmasın
    if (!call || (typeof mbCallIsDead === 'function' && mbCallIsDead(call))) {
      setTimeout(() => {
        if (dialerStatus === 'on_call' && !mbHopperStillUp()) {
          if (typeof mbRecoverDialerSurface === 'function') {
            mbRecoverDialerSurface(_autoDial ? 'calling' : 'ready');
          }
          if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
        }
      }, 500);
    }
    return;
  }
  if (_hopper.length) {
    mbCancelHopper({ refill: !!_autoDial });
    return;
  }
  if (_telnyxCall) { try { _telnyxCall.hangup(); } catch (e) {} }
  if (typeof dialerStatus !== 'undefined' && (dialerStatus === 'calling' || dialerStatus === 'on_call') && !_liveCallId) {
    if (typeof mbRecoverDialerSurface === 'function') mbRecoverDialerSurface(_autoDial ? 'calling' : 'ready');
    else {
      if (typeof hideOutboundWait === 'function') hideOutboundWait();
      if (typeof clearCustomerCard === 'function') clearCustomerCard();
      if (typeof setDialerStatus === 'function') setDialerStatus('ready');
    }
    if (typeof mbSweepOwnCalling === 'function') void mbSweepOwnCalling('no_answer');
  }
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
    if (row.phase !== 'live' && row.phase !== 'hold' && row.phase !== 'screen') row.phase = 'ringing';
    _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen');
    // Otomatik havuzda erken sesi temsilciye verme — meşgul anonsu bağlanmadan duyuluyordu.
    if (row.manual && call.remoteStream) {
      _attachLiveAudio(call);
      if (typeof mbStopRingback === 'function') mbStopRingback();
    } else if (typeof mbStartRingback === 'function') mbStartRingback();
    if (!_agentBusy() && typeof handleCallState === 'function') handleCallState('ringing', row.id);
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'held' || state === 'hold') {
    if (row.id === _liveCallId && (row.agentHold || isOnHold)) {
      row.phase = 'live';
      _setHoldButton(true);
      _pauseLiveAudio(true);
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      return;
    }
    if (row.id !== _liveCallId) row.phase = 'hold';
    if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
    return;
  }
  if (state === 'active') {
    if (!call.sipAnsweredAt) call.sipAnsweredAt = Date.now();
    row.answeredAt = row.answeredAt || call.sipAnsweredAt;
    if (typeof mbStopRingback === 'function') mbStopRingback();
    mbCaptureTelnyxIds(call);
    if (typeof mbApplyCallNoise === 'function') void mbApplyCallNoise(call);
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
    if (row.phase === 'screen' || row._mbScreenArm) return;
    if (mbScreenMissOn() && (call.amd_result === 'machine' || mbBusyLine(call) || mbPhoneOff(call))) {
      mbRejectScreened(row, call.amd_result === 'machine' ? 'machine' : '');
      return;
    }
    // Temsilci zaten canlıdaysa ikinci hat: eleme UI'sına dokunma, müzikte bekle
    if (_agentBusy() && row.id !== _liveCallId) {
      row.phase = 'hold';
      if (typeof mbStartHoldMusic === 'function') void mbStartHoldMusic(call, row.contact);
      try { call.hold(); } catch (e) {}
      if (typeof mbRefreshHopperUi === 'function') mbRefreshHopperUi();
      if (typeof mbSyncPool === 'function') mbSyncPool();
      return;
    }
    mbArmAnswerScreen(row);
    return;
  }
  if (dead) {
    if (!call.sipEndedAt) call.sipEndedAt = Date.now();
    mbClearAnswerScreen(row);
    const wasScreening = row.phase === 'screen';
    const wasLive = !wasScreening && (row.id === _liveCallId || row.phase === 'live') && !mbFarEndMissed(row);
    const dest = row.dest || mbCallDigits(call);
    _hopper = _hopper.filter((r) => {
      if (r === row) return false;
      if (r.phase === 'live' || r.phase === 'hold') return true;
      if ((row.manual || window._mbManualAttempt) && (r.phase === 'dialing' || r.phase === 'ringing')) return false;
      return !(dest && mbSameDialDigits(r.dest || mbCallDigits(r.call) || r.contact?.phone, dest));
    });
    _outboundDialPending = _hopper.some((r) => r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'screen');
    if (wasScreening || (wasLive && mbScreenThis(row))) {
      _liveCallId = null;
      _telnyxCall = null;
      callStart = null;
      mbCloseMiss(row, mbPoolEndStatus(row));
      mbContinueAfterScreen();
    } else if (wasLive) {
      mbFinishLocalRecording(call, true);
      mbNoteRecordingMiss(call);
      _liveCallId = null;
      _telnyxCall = null;
      const dur = mbProviderSeconds(row.call, row);
      window._mbBillSec = dur;
      callStart = null;
      // Hold bağlama yalnız Sonuçlandır sonrası (mbTakeHeldCall)
      if (typeof handleCallEnd === 'function') handleCallEnd(dur);
    } else {
      const owned = row.id === _liveCallId || row.phase === 'live';
      if (row.id === _liveCallId) {
        _liveCallId = null;
        callStart = null;
      }
      if (_telnyxCall === row.call) _telnyxCall = null;
      if (owned && dialerStatus === 'on_call') {
        // Hangup'ta hold'u bağlama — sonuç girilmeden sonraki kişiye geçilmez
        mbFinishLocalRecording(call, true);
        const dur = mbProviderSeconds(row.call, row);
        window._mbBillSec = dur;
        if (typeof handleCallEnd === 'function') handleCallEnd(dur);
      } else {
        mbUnansweredEnded(row);
      }
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
// Otomatik havuzda erken _telnyxCall = meşgul/telesekreter anonsu sızıyordu.
// Ses yalnız mbConnectHopperRow (bridge) ile bağlanır; manuel önizlemede erken ses OK.
if (work !== 'auto' && !_telnyxCall) _telnyxCall = call;
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
toast(t('telnyx.line_connected'), 'ok');
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
const kick = typeof tPair === 'function' ? tPair('dial.mic_chip') : { tr: 'Mikrofon', de: 'Mikrofon' };
const hint = typeof tPair === 'function' ? tPair('dial.mic_chip_hint') : { tr: 'Ayarlar için tıkla', de: 'Tippen für Einstellungen' };
const de = typeof currentLang !== 'undefined' && currentLang === 'de';
el.classList.toggle('is-on', !!granted);
el.classList.toggle('is-off', !granted);
el.innerHTML = `<i class="ph ${icon}"></i><span class="dialer-mic-chip__text"><span class="dialer-mic-chip__kicker"></span><span class="dialer-mic-chip__hint"></span></span>`;
const kickerEl = el.querySelector('.dialer-mic-chip__kicker');
const hintEl = el.querySelector('.dialer-mic-chip__hint');
if (kickerEl) {
  kickerEl.setAttribute('data-tr', kick.tr);
  kickerEl.setAttribute('data-de', kick.de);
  kickerEl.textContent = de ? kick.de : kick.tr;
}
if (hintEl) {
  hintEl.setAttribute('data-tr', hint.tr);
  hintEl.setAttribute('data-de', hint.de);
  hintEl.textContent = de ? hint.de : hint.tr;
}
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
const de = typeof currentLang !== 'undefined' && currentLang === 'de';
el.innerHTML = `<span style="color:${s.color};font-size:11px;font-weight:600;display:flex;align-items:center;gap:3px;">${s.icon} <span class="dialer-conn-chip__txt"></span></span>`;
const txt = el.querySelector('.dialer-conn-chip__txt');
if (txt) {
  txt.setAttribute('data-tr', s.tr);
  txt.setAttribute('data-de', s.de);
  txt.textContent = de ? s.de : s.tr;
}
}

function handleCallState(state, callId) {
activeCallId = callId;
const label = document.getElementById('status-label');
const subLabels = {
dialing: { tr:'Aranıyor', de:'Wählt' },
ringing: { tr:'Çalıyor', de:'Klingelt' },
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
label.setAttribute('data-tr', subLabels[state].tr);
label.setAttribute('data-de', subLabels[state].de);
label.textContent = subLabels[state][currentLang] || subLabels[state].tr;
}
}

function handleAMD(result) {
amdResult = result;
if (result === 'machine' && mbScreenMissOn()) {
  const row = _liveCallId
    ? _hopper.find((r) => r.id === _liveCallId)
    : _hopper.find((r) => r.phase === 'screen' || r.phase === 'dialing' || r.phase === 'ringing' || r.phase === 'live' || r.phase === 'hold');
  if (row) {
    row.amd = 'machine';
    if (row.call) row.call.amd_result = 'machine';
  }
  // Eleme / kısa konuşmada telesekreteri temsilciye verme
  if (!row || row.phase === 'screen' || mbTalkSeconds(row) < 12) {
    toast('🤖 ' + t('telnyx.amd_voicemail'), 'ok');
    mbNoteCallHangup('system');
    if (row && row.phase === 'screen') {
      mbRejectScreened(row, 'machine');
      return;
    }
    try { (row?.call || _telnyxCall)?.hangup(); } catch (e) {}
    if (!_outboundAnswered) autoSaveVoicemail();
    return;
  }
}
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
if (window._mbBillSec != null && window._mbBillSec !== '') {
  callSeconds = Math.max(0, Math.floor(Number(window._mbBillSec) || 0));
} else {
  callSeconds = duration || callSeconds;
}
const timerEl = document.getElementById('dialer-timer');
if (timerEl && callSeconds >= 0) {
  const mm = String(Math.floor(callSeconds / 60)).padStart(2, '0');
  const ss = String(callSeconds % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
}
activeCallId = null;
if (wasAttempt) {
if (typeof hideOutboundWait === 'function') hideOutboundWait();
if (!currentContact && window._mbLastContact) currentContact = window._mbLastContact;
if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
setDialerStatus('wrapping');
updateSessionInDB('wrapping');
mbEnsureTalkLog(callSeconds);
if ((Number(callSeconds) > 0 || window._mbCallMeta?.answeredAt) && typeof mbCommitLocalRecording === 'function') {
  void mbCommitLocalRecording();
}
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
