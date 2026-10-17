// Cagri kontrolleri
// ── Call timer ────────────────────────────────
function _dialerVoiceProgressFromSeconds(sec) {
  const t = Math.min(1, Number(sec || 0) / 150);
  return Math.round(t * 1000) / 1000;
}

function updateDialerVoiceVisuals(seconds) {
  const page = document.getElementById('page-dialer');
  if (!page) return;
  const p = _dialerVoiceProgressFromSeconds(seconds);
  page.style.setProperty('--voice-progress', String(p));
}

function resetDialerVoiceVisuals() {
  if (typeof stopDialerVoiceRings === 'function') stopDialerVoiceRings();
  const page = document.getElementById('page-dialer');
  if (!page) return;
  page.style.removeProperty('--voice-progress');
}

function startCallTimer() {
  clearInterval(callTimerInt);
  const startedAt = Date.now();
  callSeconds = 0;
  _lastMascotCheerSec = -1;
  refreshStatusElapsed();
  updateDialerVoiceVisuals(0);
  if (typeof startDialerVoiceRings === 'function') startDialerVoiceRings();
  const paint = () => {
    callSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0');
    const s=String(callSeconds%60).padStart(2,'0');
    const el = document.getElementById('dialer-timer');
    if (el) el.textContent=`${m}:${s}`;
    refreshStatusElapsed();
    updateDialerVoiceVisuals(callSeconds);
    if (typeof onCallTickForGlobalMascot === 'function') onCallTickForGlobalMascot();
  };
  paint();
  callTimerInt = setInterval(paint, 250);
}

function stopCallTimer() {
  const lastDur = Number(callSeconds) || 0;
  clearInterval(callTimerInt);
  _lastMascotCheerSec = -1;
  document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', '0');
  if (lastDur > 0) {
    _mascotCallAccumSec += lastDur;
    setMascotPref('mb_mascot_call_accum_sec', String(_mascotCallAccumSec));
    if (lastDur < 60 && !isMimiHidden()) {
      _showCustEmptyBubbleMsg(
        typeof t === 'function' ? t('dial.short_call') : '…'
      );
    }
  }
  refreshGlobalMascotInfoPanel();
  const tblk = document.getElementById('dialer-timer-block');
  if (tblk) tblk.style.display='none';
  resetDialerVoiceVisuals();
  refreshStatusElapsed();
}

// ── Call controls ─────────────────────────────
function toggleMute() {
  const pre = document.getElementById('call-actions')?.classList.contains('call-actions--pre-call');
  const lineUp = !!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending;
  if (pre && !lineUp && dialerStatus !== 'on_call') {
    if (typeof toggleMicAudioDrawer === 'function') toggleMicAudioDrawer();
    return;
  }
  isMuted=!isMuted;
  if (isMuted) _micThresholdForcedMute = false;
  sendToRTC('MB_MUTE',{muted:isMuted});
  paintCallActionButtons();
  toast(isMuted ? (typeof t === 'function' ? t('dial.mic_off') : '') : (typeof t === 'function' ? t('dial.mic_on') : ''), 'ok');
}

function toggleHold() {
  const row = (typeof _hopper !== 'undefined' && _liveCallId)
    ? _hopper.find((r) => r.id === _liveCallId && r.call)
    : null;
  const call = row?.call || _telnyxCall || null;
  const onLive = dialerStatus === 'on_call' && !!call && typeof call.hold === 'function';
  if (!onLive) {
    toast(typeof t === 'function' ? t('dial.hold_need_call') : 'Önce arama başlatın', 'warn');
    return;
  }
  const next = !isOnHold;
  try {
    if (next) call.hold();
    else {
      if (row) row.agentHold = false;
      isOnHold = false;
      call.unhold();
    }
  } catch (e) {
    toast(typeof t === 'function' ? t('dial.hold_fail') : 'Bekletme uygulanamadı', 'err');
    return;
  }
  const sim = String(call.id || '').startsWith('sim-');
  if (sim && typeof mbOnHopperCall === 'function') mbOnHopperCall(call);
  else if (typeof mbMarkLiveHold === 'function') mbMarkLiveHold(next);
  toast(isOnHold ? (typeof t === 'function' ? t('dial.hold_on') : '') : (typeof t === 'function' ? t('dial.hold_off') : ''), 'ok');
}

function hangup() {
  if (_hopper.length && typeof mbHangupLiveOrWave === 'function') {
    mbHangupLiveOrWave();
    return;
  }
  if (_fakeCallActive || (_testMode && (dialerStatus === 'on_call' || dialerStatus === 'calling'))) { endFakeCall(); return; }
  if (_telnyxCall || _outboundDialPending) {
    sendToRTC('MB_HANGUP');
    if (!_telnyxCall) handleCallEnd(Math.floor(callSeconds) || 0);
    return;
  }
  if (dialerStatus === 'on_call' || dialerStatus === 'calling') handleCallEnd(Math.floor(callSeconds) || 0);
}

async function refreshDialerCampaignCacheIfEmpty() {
  if (!currentUser) return;
  if (Array.isArray(campaigns) && campaigns.length > 0) return;
  const role = currentUser?.role || '';
  const adminLike = ['admin', 'firm_admin', 'super_admin', 'qc'].includes(role);
  const firmScopeId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id;
  if (adminLike && mbIsSuperAdmin(role) && !firmScopeId) return;
  let myCamps = [];
  if (adminLike && firmScopeId) {
    const allCamps = (await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${firmScopeId}&order=created_at.desc`)) || [];
    myCamps = allCamps.map((c) => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
  } else {
    myCamps = (await sb(`agent_campaigns?select=*,campaigns(*,queues(*))&agent_id=eq.${currentUser.id}`)) || [];
  }
  campaigns = (myCamps || []).map((ac) => ac.campaigns).filter(Boolean);
}

function redialCurrentContact() {
  if (_callLineIsLive()) return;
  if (!currentContact?.phone) {
    toast(typeof t === 'function' ? t('dial.no_contact') : 'Önce müşteri / numara yok', 'err');
    return;
  }
  if (!_testMode && !telnyxReady) {
    toast(typeof t === 'function' ? t('dial.no_line') : 'Hat bağlantısı yok', 'err');
    return;
  }
  const campId = currentContact.campaign_id || selectedCampId;
  const campaign = campaigns.find((c) => c.id === campId);
  if (campId) selectCamp(campId, campaign?.name || '', { skipActivate: true });
  if (_testMode) {
    _fakeCallActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    toast(typeof t === 'function' ? t('dial.test_redial') : 'TEST: Tekrar aranıyor', 'ok', 2200);
    return;
  }
  _outboundAnswered = false;
  _outboundDialPending = true;
  _voicemailAutoLogged = false;
  showOutboundWait();
  setDialerStatus('calling');
  sendToRTC('MB_CALL', { destination: currentContact.phone, callerNumber: campaign?.telnyx_did || '' });
  if (typeof switchContactTab === 'function') switchContactTab('info');
}

function callSecondaryPhone() {
  const p2 = String(currentContact?.phone2 || '').trim();
  if (!p2) {
    toast(typeof t === 'function' ? t('dial.no_phone2') : '2. telefon numarası yok', 'warn');
    return;
  }
  if (!_testMode && !telnyxReady) {
    toast(typeof t === 'function' ? t('dial.no_line') : 'Hat bağlantısı yok', 'err');
    return;
  }
  const campId = currentContact?.campaign_id || selectedCampId;
  const campaign = campaigns.find((c) => c.id === campId);
  if (campId) selectCamp(campId, campaign?.name || '', { skipActivate: true });
  if (_testMode) {
    _fakeCallActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    toast(typeof t === 'function' ? t('dial.test_phone2') : 'TEST: 2. numara aranıyor', 'ok', 2200);
    return;
  }
  _outboundAnswered = false;
  _outboundDialPending = true;
  _voicemailAutoLogged = false;
  showOutboundWait();
  setDialerStatus('calling');
  sendToRTC('MB_CALL', { destination: p2, callerNumber: campaign?.telnyx_did || '' });
  if (typeof switchContactTab === 'function') switchContactTab('info');
}

function _manualDialNormalizeDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function _manualDialVariants(raw) {
  const t = String(raw || '').trim();
  const d = _manualDialNormalizeDigits(t);
  const set = new Set();
  if (t) set.add(t);
  if (d) {
    set.add(d);
    if (d.length > 10) set.add(d.slice(-10));
    if (d.startsWith('0')) set.add(d.replace(/^0+/, ''));
    if (d.length === 10 && !d.startsWith('0')) set.add(`0${d}`);
  }
  return [...set].filter(Boolean).slice(0, 12);
}

async function _manualDialFetchRows(variants, campIds) {
  const merged = new Map();
  for (const v of variants) {
    const enc = encodeURIComponent(v);
    const path = `contacts?campaign_id=in.(${campIds.join(',')})&or=(phone.eq.${enc},phone2.eq.${enc})&select=*,queues(name,status)&limit=25`;
    try {
      const rows = await sb(path);
      (rows || []).forEach((r) => merged.set(r.id, r));
    } catch (e) {}
  }
  if (!merged.size && variants.length) {
    const d = _manualDialNormalizeDigits(variants[0]);
    const core = d.slice(-9);
    if (core.length >= 6) {
      const pat = encodeURIComponent(`*${core}*`);
      const path2 = `contacts?campaign_id=in.(${campIds.join(',')})&or=(phone.like.${pat},phone2.like.${pat})&select=*,queues(name,status)&limit=25`;
      try {
        const rows2 = await sb(path2);
        (rows2 || []).forEach((r) => merged.set(r.id, r));
      } catch (e) {}
    }
  }
  return [...merged.values()];
}

function closeManualDialDrawer() {
  const el = document.getElementById('manual-dial-drawer');
  if (el) el.style.display = 'none';
  document.getElementById('manual-dial-toggle')?.classList.remove('is-open');
}

function toggleManualDialDrawer() {
  if (_hasLiveCallInProgress()) {
    toast(typeof t === 'function' ? t('dial.manual_dial_blocked') : 'Aktif çağrı varken numara ile aramaya geçilemez', 'err', 2200);
    return;
  }
  const el = document.getElementById('manual-dial-drawer');
  const chip = document.getElementById('manual-dial-toggle');
  if (!el) return;
  const isOpen = el.style.display !== 'none' && el.style.display !== '';
  if (isOpen) {
    closeManualDialDrawer();
    return;
  }
  closeMicAudioDrawer();
  el.style.display = 'block';
  chip?.classList.add('is-open');
  setTimeout(() => document.getElementById('manual-dial-input')?.focus(), 40);
}

function _micDrawerWireControlsOnce() {
  if (window._micDrawerControlsWired) return;
  window._micDrawerControlsWired = true;
  const gainEl = document.getElementById('mic-drawer-gain');
  const thrEl = document.getElementById('mic-drawer-threshold');
  gainEl?.addEventListener('input', () => {
    localStorage.setItem('mb_mic_drawer_gain', gainEl.value);
    const g = parseFloat(gainEl.value);
    if (_micDrawerInputGain) _micDrawerInputGain.gain.value = Number.isFinite(g) ? g : 1;
    _applyMicSensitivityToLiveCall();
    if (_micGateAnalyser) _runMicThresholdGateTick();
  });
  thrEl?.addEventListener('input', () => {
    localStorage.setItem('mb_mic_drawer_thresh', thrEl.value);
    const t = document.getElementById('mic-drawer-in-threshold');
    if (t) t.style.left = `${thrEl.value}%`;
    if (_micGateAnalyser) _runMicThresholdGateTick();
  });
}

function _micDrawerLoadPrefs() {
  const g = localStorage.getItem('mb_mic_drawer_gain');
  const t = localStorage.getItem('mb_mic_drawer_thresh');
  const ge = document.getElementById('mic-drawer-gain');
  const te = document.getElementById('mic-drawer-threshold');
  if (ge && g) ge.value = g;
  if (te && t) te.value = t;
  if (_micDrawerInputGain && ge) _micDrawerInputGain.gain.value = parseFloat(ge.value) || 1;
  const trEl = document.getElementById('mic-drawer-in-threshold');
  if (trEl && te) trEl.style.left = `${te.value}%`;
  _applyMicSensitivityToLiveCall();
}

function _getMicThresholdValue() {
  const te = document.getElementById('mic-drawer-threshold');
  const raw = te?.value ?? localStorage.getItem('mb_mic_drawer_thresh') ?? '18';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 18;
}

function _getMicGainValue() {
  const ge = document.getElementById('mic-drawer-gain');
  const raw = ge?.value ?? localStorage.getItem('mb_mic_drawer_gain') ?? '1';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.min(4, Math.max(0, n)) : 1;
}

function _computeMicLevelPctFromAvg(avg, gain) {
  const gainForMeter = Math.min(2.2, Math.max(0.75, Number.isFinite(gain) ? gain : 1));
  return Math.min(100, (avg * 0.62 * gainForMeter) + (avg > 4 ? 6 : 0));
}

function _applyMicSensitivityToLiveCall() {
  const gain = _getMicGainValue();
  const hardMute = Number.isFinite(gain) && gain <= 0.05;
  if (hardMute && !_micForcedMute) {
    _micForcedMute = true;
    _micGateOpenUntilMs = 0;
    sendToRTC('MB_MUTE', { muted: true });
    if (dialerStatus === 'on_call') {
      toast(typeof t === 'function' ? t('dial.mic_gain_zero') : 'Hassasiyet 0', 'warn', 2200);
    }
    return;
  }
  if (!hardMute && _micForcedMute) {
    _micForcedMute = false;
    if (!isMuted) {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
}

function _stopMicThresholdGate() {
  if (_micGateRaf) {
    cancelAnimationFrame(_micGateRaf);
    _micGateRaf = null;
  }
  if (_micGateStream) {
    try { _micGateStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    _micGateStream = null;
  }
  try { _micGateCtx?.close(); } catch (e) {}
  _micGateCtx = null;
  _micGateAnalyser = null;
  _micGateLevelPct = 0;
  _micGateOpenUntilMs = 0;
  if (_micThresholdForcedMute) {
    _micThresholdForcedMute = false;
    if (!_micForcedMute && !isMuted && dialerStatus === 'on_call') {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
}

function _runMicThresholdGateTick() {
  if (!_micGateAnalyser || dialerStatus !== 'on_call') {
    _stopMicThresholdGate();
    return;
  }
  const threshold = _getMicThresholdValue();
  const gain = _getMicGainValue();
  const buf = new Uint8Array(_micGateAnalyser.frequencyBinCount);
  _micGateAnalyser.getByteFrequencyData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const avg = sum / buf.length;
  const levelPct = _computeMicLevelPctFromAvg(avg, gain);
  _micGateLevelPct = levelPct;
  const openMargin = threshold <= 5 ? 1 : (threshold <= 20 ? 2 : 4);
  const closeMargin = threshold <= 5 ? 0.5 : (threshold <= 20 ? 1 : 2);
  const openThreshold = Math.min(100, threshold + openMargin);
  const closeThreshold = Math.min(100, threshold + closeMargin);
  const now = Date.now();
  if (levelPct >= openThreshold) _micGateOpenUntilMs = now + 700;
  const gateOpen = levelPct >= closeThreshold || now < _micGateOpenUntilMs;
  const canAutoMute = !_micForcedMute && !isMuted;

  if (!canAutoMute && _micThresholdForcedMute) {
    _micThresholdForcedMute = false;
  }

  if (!gateOpen && canAutoMute && !_micThresholdForcedMute) {
    _micThresholdForcedMute = true;
    sendToRTC('MB_MUTE', { muted: true });
  } else if (gateOpen && _micThresholdForcedMute) {
    _micThresholdForcedMute = false;
    if (!_micForcedMute && !isMuted) {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
  _micGateRaf = requestAnimationFrame(_runMicThresholdGateTick);
}

async function _startMicThresholdGate() {
  _stopMicThresholdGate();
  if (dialerStatus !== 'on_call') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _micGateStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _micGateCtx = new Ctx();
    const src = _micGateCtx.createMediaStreamSource(_micGateStream);
    _micGateAnalyser = _micGateCtx.createAnalyser();
    _micGateAnalyser.fftSize = 512;
    _micGateAnalyser.smoothingTimeConstant = 0.72;
    src.connect(_micGateAnalyser);
    _runMicThresholdGateTick();
  } catch (e) {
    _stopMicThresholdGate();
  }
}

function saveMicDrawerPrefs() {
  const ge = document.getElementById('mic-drawer-gain');
  const te = document.getElementById('mic-drawer-threshold');
  if (ge) localStorage.setItem('mb_mic_drawer_gain', ge.value);
  if (te) localStorage.setItem('mb_mic_drawer_thresh', te.value);
  if (_micDrawerInputGain && ge) {
    const g = parseFloat(ge.value);
    _micDrawerInputGain.gain.value = Number.isFinite(g) ? g : 1;
  }
  const trEl = document.getElementById('mic-drawer-in-threshold');
  if (trEl && te) trEl.style.left = `${te.value}%`;
  _applyMicSensitivityToLiveCall();
  toast(typeof t === 'function' ? t('dial.mic_saved') : 'Mikrofon ayarları kaydedildi', 'ok', 1800);
}

function _micDrawerStopAudioCore() {
  _micDrawerMonitoring = false;
  if (_micDrawerRaf) {
    cancelAnimationFrame(_micDrawerRaf);
    _micDrawerRaf = null;
  }
  if (_micDrawerStream) {
    try { _micDrawerStream.getTracks().forEach((x) => x.stop()); } catch (e) {}
    _micDrawerStream = null;
  }
  try { _micDrawerInputCtx?.close(); } catch (e) {}
  try { _micDrawerRemoteCtx?.close(); } catch (e) {}
  _micDrawerInputCtx = null;
  _micDrawerRemoteCtx = null;
  _micDrawerInputGain = null;
  _micDrawerInAn = null;
  _micDrawerOutAn = null;
}

function _micDrawerTick() {
  if (!_micDrawerMonitoring) return;
  const inMeter = document.getElementById('mic-drawer-in-meter');
  const outMeter = document.getElementById('mic-drawer-out-meter');
  const thrVal = parseFloat(document.getElementById('mic-drawer-threshold')?.value || '18');
  if (_micDrawerInAn) {
    const buf = new Uint8Array(_micDrawerInAn.frequencyBinCount);
    _micDrawerInAn.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const avg = sum / buf.length;
    const gain = parseFloat(document.getElementById('mic-drawer-gain')?.value || '1');
    const v = _computeMicLevelPctFromAvg(avg, gain);
    const gainForMeter = Math.min(2.2, Math.max(0.75, Number.isFinite(gain) ? gain : 1));
    const effectiveThreshold = Math.max(6, thrVal * (gainForMeter < 1 ? 0.82 : 1));
    if (inMeter) {
      inMeter.style.width = `${v}%`;
      inMeter.style.opacity = v >= effectiveThreshold ? '1' : '0.55';
    }
  } else if (inMeter) inMeter.style.width = '0%';
  if (_micDrawerOutAn) {
    const buf2 = new Uint8Array(_micDrawerOutAn.frequencyBinCount);
    _micDrawerOutAn.getByteFrequencyData(buf2);
    let s2 = 0;
    for (let i = 0; i < buf2.length; i++) s2 += buf2[i];
    const v2 = Math.min(100, (s2 / buf2.length) * 0.55);
    if (outMeter) outMeter.style.width = `${v2}%`;
  } else if (outMeter) outMeter.style.width = '0%';
  _micDrawerRaf = requestAnimationFrame(_micDrawerTick);
}

async function startMicDrawerMonitor() {
  if (_micDrawerMonitoring) return;
  _micDrawerStopAudioCore();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _micDrawerStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _micDrawerInputCtx = new Ctx();
    const src = _micDrawerInputCtx.createMediaStreamSource(_micDrawerStream);
    _micDrawerInputGain = _micDrawerInputCtx.createGain();
    _micDrawerInputGain.gain.value = parseFloat(document.getElementById('mic-drawer-gain')?.value || '1');
    _micDrawerInAn = _micDrawerInputCtx.createAnalyser();
    _micDrawerInAn.fftSize = 512;
    src.connect(_micDrawerInputGain).connect(_micDrawerInAn);
    if (window._telnyxRemoteStream) {
      try {
        _micDrawerRemoteCtx = new Ctx();
        const rsrc = _micDrawerRemoteCtx.createMediaStreamSource(window._telnyxRemoteStream);
        _micDrawerOutAn = _micDrawerRemoteCtx.createAnalyser();
        _micDrawerOutAn.fftSize = 512;
        rsrc.connect(_micDrawerOutAn);
      } catch (e) {
        _micDrawerOutAn = null;
      }
    }
    _micDrawerMonitoring = true;
    const btn = document.getElementById('mic-drawer-monitor-btn');
    const sp = btn?.querySelector('span');
    if (sp) {
      const p = typeof tPair === 'function' ? tPair('dial.mic_monitor_stop') : { tr: 'Dinlemeyi durdur', de: 'Überwachung stoppen' };
      sp.textContent = typeof currentLang !== 'undefined' && currentLang === 'de' ? p.de : p.tr;
      sp.setAttribute('data-tr', p.tr);
      sp.setAttribute('data-de', p.de);
    }
    micGranted = true;
    if (typeof updateMicStatus === 'function') updateMicStatus(true);
    _micDrawerTick();
  } catch (e) {
    toast(
      (typeof t === 'function' ? t('dial.mic_open_err') : 'Mikrofon açılamadı: ') + e.message,
      'err'
    );
    _micDrawerStopAudioCore();
  }
}

function stopMicDrawerMonitor() {
  _micDrawerStopAudioCore();
  const btn = document.getElementById('mic-drawer-monitor-btn');
  const sp = btn?.querySelector('span');
  if (sp) {
    const p = typeof tPair === 'function' ? tPair('dial.mic_monitor_start') : { tr: 'Dinlemeyi başlat', de: 'Überwachung starten' };
    sp.textContent = typeof currentLang !== 'undefined' && currentLang === 'de' ? p.de : p.tr;
    sp.setAttribute('data-tr', p.tr);
    sp.setAttribute('data-de', p.de);
  }
}

function toggleMicDrawerMonitor() {
  if (_micDrawerMonitoring) stopMicDrawerMonitor();
  else void startMicDrawerMonitor();
}

function playMicDrawerBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.connect(g).connect(ctx.destination);
    o.start();
    setTimeout(() => {
      try { o.stop(); } catch (e) {}
      ctx.close();
    }, 280);
  } catch (e) {
    toast('Beep: ' + (e.message || 'err'), 'err');
  }
}

function closeMicAudioDrawer() {
  const el = document.getElementById('mic-audio-drawer');
  if (el) el.style.display = 'none';
  stopMicDrawerMonitor();
}

function toggleMicAudioDrawer() {
  const el = document.getElementById('mic-audio-drawer');
  if (!el) return;
  const isOpen = el.style.display !== 'none' && el.style.display !== '';
  if (isOpen) {
    closeMicAudioDrawer();
    return;
  }
  closeManualDialDrawer();
  _micDrawerWireControlsOnce();
  _micDrawerLoadPrefs();
  el.style.display = 'block';
}

async function runManualDialSearch() {
  if (_hasLiveCallInProgress()) {
    toast(typeof t === 'function' ? t('dial.close_active_first') : 'Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  const input = document.getElementById('manual-dial-input');
  const out = document.getElementById('manual-dial-results');
  if (!input || !out || !currentUser) return;
  const raw = input.value.trim();
  if (!raw) {
    toast(typeof t === 'function' ? t('dial.enter_number') : 'Numara girin', 'warn');
    return;
  }
  out.innerHTML = `<div style="color:var(--text-3);padding:8px;">${typeof t === 'function' ? escapeHtml(t('dial.manual_searching')) : '…'}</div>`;
  await refreshDialerCampaignCacheIfEmpty();
  const campIds = (campaigns || []).map((c) => c.id).filter(Boolean);
  if (!campIds.length) {
    out.innerHTML = `<div style="color:var(--red);padding:8px;">${escapeHtml(typeof t === 'function' ? t('dial.manual_no_camps') : '')}</div>`;
    return;
  }
  const variants = _manualDialVariants(raw);
  try {
    const rows = await _manualDialFetchRows(variants, campIds);
    window._manualDialLastResults = rows;
    if (!rows.length) {
      const adhoc = _buildAdhocDialContact(raw);
      const saved = await _persistAdhocDialContact(adhoc);
      window._manualDialLastResults = [saved];
      out.innerHTML = `<button type="button" class="manual-dial-pick" data-idx="0" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;border:1px solid var(--accent);border-radius:8px;background:var(--accent-soft);cursor:pointer;font-size:12px;">
<div style="font-weight:800;">${String(saved.phone || raw).replace(/</g, '&lt;')}</div>
        <div style="color:var(--text-2);margin-top:2px;">${escapeHtml(typeof t === 'function' ? t('dial.manual_adhoc_hint') : '')}</div>
</button>`;
      out.querySelectorAll('.manual-dial-pick').forEach((btn) => {
        btn.onclick = () => pickManualDialContact(0);
      });
      return;
    }
    out.innerHTML = rows.map((r, i) => {
      const camp = campaigns.find((x) => x.id === r.campaign_id);
      const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—';
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return `<button type="button" class="manual-dial-pick" data-idx="${i}" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-3);cursor:pointer;font-size:12px;">
<div style="font-weight:800;">${esc(r.phone)}</div>
<div style="color:var(--text-2);margin-top:2px;">${esc(nm)} · ${esc(camp?.name || '—')}</div>
</button>`;
    }).join('');
    out.querySelectorAll('.manual-dial-pick').forEach((btn) => {
      btn.onclick = () => pickManualDialContact(Number(btn.getAttribute('data-idx')));
    });
  } catch (e) {
    out.innerHTML = `<div style="color:var(--red);padding:8px;">${escapeHtml(e?.message || 'Error')}</div>`;
  }
}

function pickManualDialContact(idx) {
  if (_hasLiveCallInProgress()) {
    toast(typeof t === 'function' ? t('dial.close_active_first') : 'Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  const row = window._manualDialLastResults?.[idx];
  if (!row) return;
  const camp = campaigns.find((x) => x.id === row.campaign_id);
  if (row.campaign_id) selectCamp(row.campaign_id, camp?.name || '', { skipActivate: true });
  currentContact = row;
  closeManualDialDrawer();
  const dialerPageOpen = !!document.getElementById('page-dialer')?.classList.contains('active');
  if (!dialerPageOpen && typeof navigate === 'function') navigate('dialer');
  showCustomerCard(row);
  syncDialerBottomChrome();
  forceDialerPreCallBar();
  setTimeout(() => { syncDialerBottomChrome(); forceDialerPreCallBar(); }, 220);
  setTimeout(() => { syncDialerBottomChrome(); forceDialerPreCallBar(); }, 650);
  if (typeof switchContactTab === 'function') switchContactTab('info');
  toast(typeof t === 'function' ? t('dial.manual_loaded') : 'Kişi yüklendi', 'ok', 3200);
}

function _buildAdhocDialContact(phoneRaw) {
  const phone = String(phoneRaw || '').trim();
  const campId = selectedCampId || campaigns?.[0]?.id || null;
  return {
    id: `adhoc-${Date.now()}`,
    firm_id: currentUser?.firm_id || null,
    campaign_id: campId,
    first_name: typeof t === 'function' ? t('dial.adhoc_first') : 'Yeni',
    last_name: typeof t === 'function' ? t('dial.adhoc_last') : 'Çağrı',
    phone,
    phone2: '',
    city: '',
    plz: '',
    address: '',
    notes: '',
    attempt_count: 0,
    status: 'pending',
    is_adhoc: true,
  };
}

async function _persistAdhocDialContact(contact) {
  if (!contact?.phone || !contact?.campaign_id || !currentUser?.firm_id) return contact;
  try {
    const rows = await sb('contacts', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        firm_id: currentUser.firm_id,
        campaign_id: contact.campaign_id,
        first_name: contact.first_name || 'Yeni',
        last_name: contact.last_name || 'Çağrı',
        phone: contact.phone,
        status: 'pending',
      }),
    });
    return rows?.[0] || contact;
  } catch (e) {
    return contact;
  }
}

function setOutcome(o) {
  selectedOutcome = o;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  const map = {appointment:'.ob-appointment',negative:'.ob-negative',callback:'.ob-callback',no_answer:'.ob-noanswer',voicemail:'.ob-voicemail'};
  if (map[o]) document.querySelector(map[o])?.classList.add('active');
  const cbRow = document.getElementById('callback-time-row') || document.getElementById('callback-row');
  if (cbRow) cbRow.style.display = o==='callback' ? '' : 'none';
  // Geri ara seçildiğinde varsayılan zaman: yarın aynı saat
  if (o === 'callback') {
    const dtInput = document.getElementById('callback-dt');
    if (dtInput && !dtInput.value) {
      const def = new Date(Date.now() + 24*60*60*1000);
      dtInput.value = typeof mbIsoToWallInput === 'function' ? mbIsoToWallInput(def.toISOString()) : def.toISOString().slice(0,16);
    }
  }
  const gm = document.getElementById('global-mascot');
  if (gm) gm.classList.remove('global-mascot--sad', 'global-mascot--celebrate');
  if (o === 'appointment' || o === 'appointment_done') {
    if (gm && !isMimiHidden()) gm.classList.add('global-mascot--celebrate');
    if (typeof _mimiCelebrate === 'function') _mimiCelebrate();
    const okI = Math.floor(Math.random() * 3);
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(typeof t === 'function' ? t(`dial.outcome.app.${okI}`) : '');
      setTimeout(() => gm?.classList.remove('global-mascot--celebrate'), 2300);
    }
  } else if (o === 'negative') {
    if (gm && !isMimiHidden()) gm.classList.add('global-mascot--sad');
    const ni = Math.floor(Math.random() * 3);
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(typeof t === 'function' ? t(`dial.outcome.neg.${ni}`) : '');
      setTimeout(() => gm?.classList.remove('global-mascot--sad'), 3600);
    }
  } else if (o === 'callback') {
    const ci = Math.floor(Math.random() * 3);
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(typeof t === 'function' ? t(`dial.outcome.cb.${ci}`) : '');
    }
  }
}

/** Aranacaklar (WV) listesindeki bekleyen kayıtları olumsuz sonuçla eşleştir — listeden düşer. */
async function _markMatchingWiedervorlageOlumsuz(contact) {
  if (!contact || !currentUser?.firm_id || !currentUser?.id) return;
  const fid = currentUser.firm_id;
  const aid = currentUser.id;
  const phone = String(contact.phone || '').trim();
  const cid = isValidUUID(contact.id) ? contact.id : null;
  let rows = [];
  if (cid) {
    rows = await sb(`wiedervorlage?firm_id=eq.${fid}&agent_id=eq.${aid}&contact_id=eq.${cid}&durum=eq.bekliyor&select=id`).catch(() => []);
  }
  if ((!rows || !rows.length) && phone) {
    const enc = encodeURIComponent(phone);
    rows = await sb(`wiedervorlage?firm_id=eq.${fid}&agent_id=eq.${aid}&telefon=eq.${enc}&durum=eq.bekliyor&select=id`).catch(() => []);
  }
  if (!rows?.length) return;
  await Promise.all(
    rows.map((r) =>
      sb(`wiedervorlage?id=eq.${r.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ durum: 'olumsuz' }),
      })
    )
  );
  if (typeof refreshWvList === 'function') void refreshWvList();
  if (typeof loadWvBadge === 'function') loadWvBadge();
}

async function submitOutcome(goBreak) {
  const lineUp = !!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending;
  if (dialerStatus === 'on_call' && lineUp) {
    toast(typeof t === 'function' ? t('dial.outcome_hangup_first') : 'Önce çağrıyı kapatın', 'warn', 2400);
    return;
  }
  if (!selectedOutcome) { toast(typeof t === 'function' ? t('dial.pick_outcome') : 'Sonuç seçin', 'err'); return; }
  const note   = document.getElementById('outcome-note')?.value.trim()||'';
  const cbTime = document.getElementById('callback-dt')?.value||null;
  const isDnc  = document.getElementById('outcome-dnc')?.checked || false;
  const lockedSlotEarly = _bookingSlot?.id || window._selectedBookingSlot?.id;
  const inboundTestContact =
    !!currentContact &&
    (_testMode &&
      (currentContact.is_inbound_test ||
        String(currentContact.id || '').startsWith('in-') ||
        currentContact._synthetic_test_outbound));
  if (!isDnc && selectedCampId && typeof getCampSettings === 'function') {
    const camp = campaigns.find((c) => c.id === selectedCampId);
    const cs = camp ? getCampSettings(camp) : {};
    if (cs.appointment_slot_required && !inboundTestContact) {
      const oc = String(selectedOutcome || '').toLowerCase();
      if ((oc === 'appointment' || oc === 'appointment_done') && !lockedSlotEarly) {
        toast(typeof t === 'function' ? t('dial.slot_required') : 'Slot gerekli', 'warn', 4200);
        return;
      }
    }
  }
  let outcomeSaved = !currentContact;
  try {
    if (currentContact) {
      // appointment_done → call_logs'da 'appointment' olarak sakla (QC uyumu için)
      const finalOutcome = isDnc ? 'dnc' : (selectedOutcome === 'appointment_done' ? 'appointment' : selectedOutcome);
      const statusMap = {appointment:'appointment',appointment_done:'appointment',negative:'negative',callback:'callback',no_answer:'no_answer',voicemail:'voicemail',dnc:'dnc'};
      const cbAt = (finalOutcome === 'callback' && cbTime)
        ? (typeof mbWallToIso === 'function' ? mbWallToIso(cbTime) : new Date(cbTime).toISOString())
        : null;
      const contactPatch = {
        status: statusMap[finalOutcome] || finalOutcome,
        attempt_count: (currentContact.attempt_count||0)+1,
        last_called_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
      };
      if (cbAt) contactPatch.callback_at = cbAt; // geri ara zamanı
      // Fake/test ID'lerinde UUID hatası önle
      const contactId = isValidUUID(currentContact.id) ? currentContact.id : null;
      if (contactId) {
        await sb(`contacts?id=eq.${contactId}`,{method:'PATCH',prefer:'return=minimal',
          body:JSON.stringify(contactPatch)
        });
      }
      if (isDnc) await addToDnc(currentContact.phone, contactId);
      const skipAutoLog = _voicemailAutoLogged && finalOutcome === 'voicemail';
      _voicemailAutoLogged = false;
      const logNotes = _testMode
        ? [note, '__test_sim__'].filter((x) => String(x || '').trim()).join('\n').trim() || '__test_sim__'
        : note;
      const logData = {
        campaign_id: selectedCampId,
        firm_id: currentUser.firm_id,
        agent_id: currentUser.id,
        phone: currentContact.phone,
        outcome: finalOutcome,   // normalleştirilmiş (appointment_done → appointment)
        notes: logNotes,
        duration_sec: callSeconds,
        started_at: new Date(Date.now()-callSeconds*1000).toISOString(),
        ended_at: new Date().toISOString(),
      };
      if (contactId) logData.contact_id = contactId;
      if (cbAt) logData.callback_at = cbAt;
      if (activeCallId) { try { logData.telnyx_call_id = activeCallId; } catch(e) {} }
      if (!skipAutoLog) {
      await sb('call_logs',{method:'POST',prefer:'return=minimal',body:JSON.stringify(logData)});
      }
      if (contactId && currentContact.queue_id) {
        // dialed_count'u contacts tablosundan dinamik hesapla
        sb(`contacts?queue_id=eq.${currentContact.queue_id}&status=not.in.(pending,calling,removed)&select=id`)
          .then(rows => sb(`queues?id=eq.${currentContact.queue_id}`,{method:'PATCH',prefer:'return=minimal',
            body:JSON.stringify({dialed_count:(rows||[]).length})
          })).catch(()=>{});
      }
    }
    outcomeSaved = true;
  } catch(e){ console.error(e); toast((typeof t === 'function' ? t('dial.log_err') : 'Kayıt hatası: ') + e.message,'err'); }
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
      const phone = String(currentContact.phone || '').replace(/[\s()-]/g, '');
      const phone2 = String(currentContact.phone2 || '').replace(/[\s()-]/g, '');
      const badPhone = typeof mbIsE164 === 'function' && !mbIsE164(phone);
      const badPhone2 = phone2 && typeof mbIsE164 === 'function' && !mbIsE164(phone2);
      if (badPhone || badPhone2) {
        toast(typeof t === 'function' ? t('wv.err_e164') : 'Telefon + ile başlamalı', 'err');
      } else {
      await sb('wiedervorlage',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
        nachname: `${currentContact.first_name||''} ${currentContact.last_name||''}`.trim() || currentContact.phone,
        telefon: phone, telefon2: phone2,
        plz: currentContact.plz||'', ort: currentContact.city||'', strasse: currentContact.address||'',
        termin_zaman: (typeof mbWallToIso === 'function' ? mbWallToIso(cbTime) : new Date(cbTime).toISOString()),
        agent_id: currentUser.id,
        agent_name: currentUser.name,
        firm_id: currentUser.firm_id,
        contact_id: isValidUUID(currentContact.id) ? currentContact.id : null,
        durum: 'bekliyor',
        notiz: note
      })});
      }
    } catch(e) {}
  }
  if (selectedOutcome === 'negative' && currentContact) {
    try {
      await _markMatchingWiedervorlageOlumsuz(currentContact);
    } catch (e) {}
  }
  setDialerStatus('wrapping');
  selectedOutcome = null;
  currentContact = null;
  clearCustomerCard();
  loadMyMiniStats();
  if (goBreak) {
    setDialerStatus('break');
    upsertAgentSession({agent_id:currentUser.id,status:'break',last_seen:new Date().toISOString()}).catch(()=>{});
    openBreakModal();
  } else if (typeof mbTakeHeldCall === 'function' && mbTakeHeldCall()) {
    upsertAgentSession({agent_id:currentUser.id,status:'on_call',last_seen:new Date().toISOString()}).catch(()=>{});
  } else {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id,status:'ready',last_seen:new Date().toISOString()}).catch(()=>{});
    if (_autoDial) {
      if (!getAutoDialCampaignIds().length) {
        _autoDial = false;
        refreshAutoDialUi();
        toast(typeof t === 'function' ? t('dial.autodial_off_camps') : 'Bu kampanyalarda otomatik arama pasif', 'warn', 2400);
      } else if (!_testMode) {
        const clock = dialerBusinessClock();
        const callCheck = isCallAllowed(clock.dateStr, clock.timeStr);
        if (!callCheck.allowed) {
          toast((typeof t === 'function' ? t('dial.autodial_paused') : '⏸ ') + callCheck.reason, 'warn', 6000);
          _autoDial = false;
          const tog = document.getElementById('auto-dial-toggle');
          if (tog) tog.checked = false;
          refreshAutoDialUi();
        } else {
          if (typeof showOutboundWait === 'function') showOutboundWait();
          setTimeout(() => dialNext(), 1200);
        }
      } else {
        if (typeof showOutboundWait === 'function') showOutboundWait();
        setTimeout(() => dialNext(), 1200);
      }
    }
  }
  if (outcomeSaved) {
    toast(typeof t === 'function' ? t('dial.outcome_saved') : 'Sonuç kaydedildi', 'ok', 2200);
  }
}

function handleAppointmentClick() {
  setOutcome('appointment');
  // Takvim overlay'ini aç — agent slot seçer
  openTakvimOverlay();
  toast(typeof t === 'function' ? t('dial.cal_pick_slot') : 'Takvimden uygun bir slot seçin', 'ok', 3500);
}

// Called from appointments.js when agent selects a slot
function onAgentSlotSelected(slot) {
  window._selectedBookingSlot = slot;
  _bookingSlot = slot;
  setOutcome('appointment');

  // Randevu moduna geç: müşteri kartı + bilgi sekmesi
  document.getElementById('customer-card').style.display = '';
  if (currentContact) showCustomerCard(currentContact);
  if (typeof switchContactTab === 'function') switchContactTab('info');

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

  toast(typeof t === 'function' ? t('dial.slot_picked') : 'Slot seçildi', 'ok', 3000);
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
  document.getElementById('customer-card').style.display = '';
  if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
  if (typeof switchContactTab === 'function') switchContactTab('outcome');
  const cancelBtn = document.getElementById('termin-cancel-slot-btn');
  if (cancelBtn) cancelBtn.remove();
  toast(typeof t === 'function' ? t('dial.slot_cancelled') : 'Slot iptal edildi', 'warn', 2000);
}

async function updateTerminField(key, value) {
  if (!currentContact?.id) return;
  const known = ['hausart','baujahr','qm','heizung','alter_der_heizung','verbrauch_pro_jahr','personen','interesse_an_pv'];
  if (!known.includes(key)) return;
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
