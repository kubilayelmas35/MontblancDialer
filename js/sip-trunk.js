// ─────────────────────────────────────────────
// Harici SIP / WebRTC (JsSIP) — Telnyx yan seçenek
// Tarayıcı UDP/TCP 5060 konuşamaz; WSS gerekir.
// ─────────────────────────────────────────────

let _sipUa = null;
let _sipSocket = null;
let _sipConnecting = false;

function mbVoiceProvider() {
  const raw = String(window.__mbVoiceProvider || 'telnyx').trim().toLowerCase();
  return raw === 'sip' ? 'sip' : 'telnyx';
}

function mbIsSipVoice() {
  return mbVoiceProvider() === 'sip';
}

function mbSipCfg() {
  return {
    host: String(window.__mbSipHost || '').trim(),
    port: String(window.__mbSipPort || '5060').trim() || '5060',
    transport: String(window.__mbSipTransport || 'udp').trim().toLowerCase() || 'udp',
    wss: String(window.__mbSipWss || '').trim(),
    user: String(window.__mbSipExtUser || '').trim(),
    pass: String(window.__mbSipExtPass || '').trim(),
    register: window.__mbSipRegister === true || window.__mbSipRegister === '1' || window.__mbSipRegister === 1,
  };
}

function mbSipWssUrl(cfg) {
  const raw = String(cfg?.wss || '').trim();
  if (!raw) return '';
  if (/^wss?:\/\//i.test(raw)) return raw;
  if (/^https:\/\//i.test(raw)) return raw.replace(/^https/i, 'wss');
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http/i, 'ws');
  return `wss://${raw.replace(/^\/+/, '')}`;
}

function mbSipUriUser(user, host) {
  const u = String(user || '').trim();
  const h = String(host || '').trim();
  if (!u) return '';
  if (/^sip:/i.test(u)) return u;
  if (u.includes('@')) return `sip:${u}`;
  return h ? `sip:${u}@${h}` : `sip:${u}`;
}

function mbSipTarget(dest, host) {
  const digits = String(dest || '').replace(/[^\d+]/g, '');
  const clean = digits.startsWith('+') ? digits : digits.replace(/\D/g, '');
  if (!clean) return '';
  const h = String(host || '').trim();
  return h ? `sip:${clean}@${h}` : `sip:${clean}`;
}

function mbSipLib() {
  if (typeof JsSIP !== 'undefined') return JsSIP;
  return null;
}

function mbSipDisconnect() {
  _sipConnecting = false;
  try { _sipUa?.stop?.(); } catch (e) {}
  _sipUa = null;
  _sipSocket = null;
  if (mbIsSipVoice()) {
    telnyxReady = false;
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
  }
}

function mbWrapSipSession(session, direction, dest) {
  const call = {
    id: String(session?.id || ('sip-' + Date.now() + '-' + Math.random().toString(16).slice(2))),
    direction: direction === 'inbound' ? 'inbound' : 'outbound',
    state: 'new',
    remoteStream: null,
    options: { destinationNumber: String(dest || '').replace(/\D/g, '') },
    destinationNumber: String(dest || '').replace(/\D/g, ''),
    __mbSip: session,
    __mbProvider: 'sip',
    hangup() {
      try { session.terminate(); } catch (e) {}
      this.state = 'hangup';
    },
    hold() {
      try { session.hold(); } catch (e) {}
      this.state = 'held';
      this.held = true;
    },
    unhold() {
      try { session.unhold(); } catch (e) {}
      this.state = 'active';
      this.held = false;
    },
    muteAudio() {
      try { session.mute({ audio: true, video: false }); } catch (e) {}
    },
    unmuteAudio() {
      try { session.unmute({ audio: true, video: false }); } catch (e) {}
    },
    answer() {
      try {
        session.answer({
          mediaConstraints: { audio: true, video: false },
          pcConfig: mbSipPcConfig(),
        });
      } catch (e) {}
    },
  };

  const bump = (state, extra) => {
    call.state = state;
    if (extra && typeof extra === 'object') Object.assign(call, extra);
    if (typeof mbOnHopperCall === 'function') mbOnHopperCall(call);
  };

  session.on('peerconnection', (data) => {
    const pc = data?.peerconnection || session.connection;
    if (!pc || pc.__mbStreamHook) return;
    pc.__mbStreamHook = true;
    pc.addEventListener('track', (ev) => {
      const stream = ev.streams?.[0];
      if (stream) {
        call.remoteStream = stream;
        if (typeof _attachLiveAudio === 'function') _attachLiveAudio(call);
      }
    });
  });

  session.on('progress', () => bump('ringing'));
  session.on('accepted', () => bump('active'));
  session.on('confirmed', () => {
    bump('active');
    try {
      const pc = session.connection;
      const receivers = pc?.getReceivers?.() || [];
      const tracks = receivers.map((r) => r.track).filter((t) => t && t.kind === 'audio');
      if (tracks.length) {
        call.remoteStream = new MediaStream(tracks);
        if (typeof _attachLiveAudio === 'function') _attachLiveAudio(call);
      }
    } catch (e) {}
    if (typeof mbStartCallRecording === 'function') mbStartCallRecording(call);
  });
  session.on('hold', () => bump('held', { held: true }));
  session.on('unhold', () => bump('active', { held: false }));
  session.on('muted', () => {});
  session.on('ended', (e) => {
    call.sipCode = Number(e?.message?.status_code || e?.cause || 0) || 0;
    call.cause = String(e?.cause || '');
    bump('hangup');
  });
  session.on('failed', (e) => {
    call.sipCode = Number(e?.message?.status_code || 0) || 0;
    call.sip_reason = String(e?.cause || e?.message?.reason_phrase || '');
    call.cause = String(e?.cause || '');
    bump('hangup');
  });

  return call;
}

function mbSipPcConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };
}

function mbSipConnect(attempt) {
  const n = attempt || 0;
  const lib = mbSipLib();
  if (!lib) {
    if (n < 20) {
      setTimeout(() => mbSipConnect(n + 1), 400);
      return;
    }
    telnyxReady = false;
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    if (typeof toast === 'function') {
      toast(typeof t === 'function' ? t('line.sip.lib_missing') : 'SIP kütüphanesi yüklenmedi', 'err');
    }
    return;
  }

  const cfg = mbSipCfg();
  const wss = mbSipWssUrl(cfg);
  const uri = mbSipUriUser(cfg.user, cfg.host);
  if (!cfg.host || !cfg.user || !cfg.pass || !wss || !uri) {
    telnyxReady = false;
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    if (typeof toast === 'function') {
      toast(typeof t === 'function' ? t('line.sip.need_wss') : 'Harici SIP için sunucu, kullanıcı, şifre ve WSS gerekir', 'err');
    }
    return;
  }

  try {
    mbSipDisconnect();
    _sipConnecting = true;
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connecting');

    lib.debug?.enable?.('JsSIP:*');
    try { lib.debug?.disable?.('JsSIP:*'); } catch (e) {}

    const socket = new lib.WebSocketInterface(wss);
    _sipSocket = socket;
    const ua = new lib.UA({
      sockets: [socket],
      uri,
      password: cfg.pass,
      display_name: cfg.user,
      register: !!cfg.register,
      session_timers: false,
      connection_recovery_max_interval: 30,
      connection_recovery_min_interval: 2,
    });
    _sipUa = ua;

    const mine = () => _sipUa === ua;

    ua.on('connected', () => {
      if (!mine()) return;
      if (!cfg.register) {
        _sipConnecting = false;
        telnyxReady = true;
        if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected');
        if (typeof toast === 'function') {
          toast(typeof t === 'function' ? t('dial.health.push.line') : 'Hat bağlantısı hazır', 'ok');
        }
      }
    });

    ua.on('disconnected', () => {
      if (!mine()) return;
      _sipConnecting = false;
      telnyxReady = false;
      if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    });

    ua.on('registered', () => {
      if (!mine()) return;
      _sipConnecting = false;
      telnyxReady = true;
      if (typeof updateConnectionStatus === 'function') updateConnectionStatus('connected');
      if (typeof toast === 'function') {
        toast(typeof t === 'function' ? t('dial.health.push.line') : 'Hat bağlantısı hazır', 'ok');
      }
    });

    ua.on('unregistered', () => {
      if (!mine() || !cfg.register) return;
      telnyxReady = false;
      if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    });

    ua.on('registrationFailed', (e) => {
      if (!mine()) return;
      _sipConnecting = false;
      telnyxReady = false;
      if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
      if (typeof toast === 'function') {
        toast('❌ SIP kayıt hatası: ' + (e?.cause || e?.response?.reason_phrase || 'failed'), 'err');
      }
    });

    ua.on('newRTCSession', (data) => {
      if (!mine()) return;
      const session = data?.session;
      if (!session) return;
      if (data.originator === 'remote') {
        const from = String(session.remote_identity?.uri?.user || session.remote_identity?.display_name || '');
        const call = mbWrapSipSession(session, 'inbound', from);
        call.state = 'ringing';
        if (typeof mbOfferInboundCall === 'function') {
          void mbOfferInboundCall(call);
          return;
        }
        if (typeof mbOnHopperCall === 'function') mbOnHopperCall(call);
      }
    });

    ua.start();
  } catch (e) {
    _sipConnecting = false;
    telnyxReady = false;
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus('disconnected');
    if (typeof toast === 'function') toast('❌ SIP hatası: ' + (e?.message || e), 'err');
  }
}

function mbSipMakeCall(destination, callerNumber, contact, work) {
  if (!_sipUa || !telnyxReady) {
    _outboundDialPending = false;
    if (typeof toast === 'function') toast(typeof t === 'function' ? t('dial.no_line') : 'Hat bağlantısı yok', 'err');
    return;
  }
  if (typeof mbLineCallBlockedSync === 'function' && mbLineCallBlockedSync(callerNumber, destination)) {
    _outboundDialPending = false;
    if (typeof mbNoteIntlBlocked === 'function') mbNoteIntlBlocked(contact);
    if (typeof dialerStatus !== 'undefined' && dialerStatus === 'calling' && typeof setDialerStatus === 'function') {
      setDialerStatus('ready');
    }
    return;
  }
  if (typeof mbDialPhoneBad === 'function' && mbDialPhoneBad(destination)) {
    if (typeof mbDropUnusedNumber === 'function') mbDropUnusedNumber(contact, work !== 'auto');
    return;
  }

  const cfg = mbSipCfg();
  const target = mbSipTarget(destination, cfg.host);
  if (!target) {
    _outboundDialPending = false;
    if (typeof toast === 'function') toast('Arama numarası geçersiz', 'err');
    return;
  }

  try {
    window._mbOutboundManual = work !== 'auto';
    window._mbManualAttempt = work !== 'auto';
    if (work !== 'auto' && contact && !contact.queue_id && typeof mbPlaceInManualQueue === 'function') {
      void mbPlaceInManualQueue(contact);
    }

    const session = _sipUa.call(target, {
      mediaConstraints: { audio: true, video: false },
      pcConfig: mbSipPcConfig(),
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
    });
    const call = mbWrapSipSession(session, 'outbound', destination);
    call.state = 'ringing';
    call.__mbManual = work !== 'auto';
    if (typeof _rememberHopper === 'function') {
      _rememberHopper(call, contact || (typeof currentContact !== 'undefined' ? currentContact : null), destination, call.__mbManual);
    }
    window._mbOutboundManual = false;
    if (typeof _telnyxCall !== 'undefined' && !_telnyxCall) _telnyxCall = call;
    if (typeof callStart !== 'undefined' && !callStart) callStart = Date.now();
    _outboundDialPending = true;
    if (typeof mbOnHopperCall === 'function') mbOnHopperCall(call);
  } catch (e) {
    window._mbOutboundManual = false;
    _outboundDialPending = false;
    if (typeof toast === 'function') toast('Arama hatası: ' + (e?.message || e), 'err');
  }
}

function mbSipSend(type, data) {
  data = data || {};
  switch (type) {
    case 'MB_CONNECT':
      mbSipConnect();
      break;
    case 'MB_CALL':
      if (typeof mbNoteCallStart === 'function') mbNoteCallStart(data.callerNumber, data.work || 'manual');
      mbSipMakeCall(data.destination, data.callerNumber, data.contact, data.work || 'manual');
      break;
    case 'MB_HANGUP':
      if (typeof mbHangupLiveOrWave === 'function') mbHangupLiveOrWave();
      break;
    case 'MB_MUTE': {
      const live = typeof _liveCallId !== 'undefined' && _liveCallId
        ? (typeof _hopper !== 'undefined' ? _hopper.find((r) => r.id === _liveCallId) : null)
        : null;
      const call = live?.call || (typeof _telnyxCall !== 'undefined' ? _telnyxCall : null);
      if (!call) break;
      try {
        if (data.muted) call.muteAudio?.();
        else call.unmuteAudio?.();
      } catch (e) {}
      break;
    }
    case 'MB_HOLD': {
      const live = typeof _liveCallId !== 'undefined' && _liveCallId
        ? (typeof _hopper !== 'undefined' ? _hopper.find((r) => r.id === _liveCallId) : null)
        : null;
      const call = live?.call || (typeof _telnyxCall !== 'undefined' ? _telnyxCall : null);
      const want = !!data.hold;
      if (want && typeof mbStartHoldMusic === 'function') {
        void mbStartHoldMusic(call, live?.contact || (typeof currentContact !== 'undefined' ? currentContact : null));
      } else if (typeof mbStopHoldMusic === 'function') {
        mbStopHoldMusic(call);
      }
      if (call) {
        try { want ? call.hold?.() : call.unhold?.(); } catch (e) {}
      }
      if (live && !want) live.agentHold = false;
      if (typeof mbMarkLiveHold === 'function') mbMarkLiveHold(want);
      break;
    }
    case 'MB_DISCONNECT':
      mbSipDisconnect();
      break;
    default:
      break;
  }
}
