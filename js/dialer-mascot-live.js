let _globalMascotResizeWired = false;
let _lastMascotCheerSec = -1;
let _mascotNotifMorphT = null;
let _mascotDragState = null;
let _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
let _bubbleAutoHideT = null;
let _wanderRaf = null;
let _wanderCur = { x: 0, y: 0 };
let _wanderTgt = { x: 0, y: 0 };
let _wanderPauseUntil = 0;
let _wanderSpeedMult = 1;
let _wanderHeading = NaN;
let _wanderHopJitter = 1;
let _wanderHolding = false;
let _dockRaf = null;
let _mimiActiveTab = 'profile';

function _fmtMimiLife(sec) {
  const s = Math.max(0, Math.floor(sec));
  const day = Math.floor(s / 86400);
  const hour = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (typeof tReplace === 'function') return tReplace('dial.mimi_age_fmt', { d: day, h: hour, m: min, s: rem });
  return `${day}g ${hour}s ${min}d ${rem}sn`;
}

function mbMascotMoodView(status, moodKey, flags) {
  const say = (key, fb) => (typeof t === 'function' ? t(key) : fb);
  const st = String(status || '');
  const mood = String(moodKey || '');
  const f = flags || {};
  const heat = Math.max(0, Math.min(1, Number(f.heat) || 0));
  let label = say('dial.mimi_mood_calm', 'Sakin');
  let note = say('dial.mimi_mood_note_default', 'Hazır.');
  let energy = '—';
  if (st === 'calling') {
    label = say('dial.mimi_mood_calling', 'Arıyor');
    note = say('dial.mimi_mood_note_calling', 'Hat aranıyor.');
  } else if (st === 'on_call') {
    label = say('dial.mimi_mood_oncall', 'Görüşmede');
    note = say('dial.mimi_mood_note_oncall', 'Görüşme sürüyor.');
    energy = `${Math.round(heat * 100)}%`;
  } else if (st === 'wrapping') {
    label = say('dial.mimi_mood_wrap', 'Sonuç yazılıyor');
    note = say('dial.mimi_mood_note_wrap', 'Sonuç kaydı açık.');
  } else if (mood === 'drink') {
    label = say('dial.mimi_mood_drink', 'Su molası');
    note = say('dial.mimi_mood_note_drink', 'Molada kısa bir su arası.');
  } else if (mood === 'stretch') {
    label = say('dial.mimi_mood_stretch', 'Esneme');
    note = say('dial.mimi_mood_note_stretch', 'Molada kısa bir esneme.');
  } else if (st === 'break') {
    label = say('dial.mimi_mood_pause', 'Molada');
    note = say('dial.mimi_mood_note_pause', 'Mola sürüyor.');
  } else if (f.celebrate || mood === 'celebrate') {
    label = say('dial.mimi_mood_celebrate', 'Kutlama');
    note = say('dial.mimi_mood_note_celebrate', 'Randevu kaydedildi.');
  } else if (f.sad) {
    label = say('dial.mimi_mood_sad', 'Üzgün');
    note = say('dial.mimi_mood_note_sad', 'Son arama olumsuz kapandı.');
  } else if (mood === 'angry') {
    label = say('dial.mimi_mood_angry', 'Gergin');
  } else if (mood === 'bored') {
    label = say('dial.mimi_mood_bored', 'Sıkıldı');
  } else if (mood === 'eat') {
    label = say('dial.mimi_mood_eat', 'Mutlu');
  } else if (f.idle) {
    label = say('dial.mimi_mood_idle', 'Beklemede');
    note = say('dial.mimi_mood_note_idle', 'Bir süredir hareket yok.');
  }
  return { label, note, energy };
}

function refreshGlobalMascotInfoPanel() {
  const nameEl = document.getElementById('global-mascot-info-name');
  const ageEl = document.getElementById('global-mascot-info-age');
  const callsEl = document.getElementById('global-mascot-info-calls');
  const variantEl = document.getElementById('global-mascot-info-variant');
  const noteEl = document.getElementById('global-mascot-info-note');
  const moodEl = document.getElementById('global-mascot-info-mood');
  const energyEl = document.getElementById('global-mascot-info-energy');
  const moodNoteEl = document.getElementById('global-mascot-info-mood-note');
  const tCallsEl = document.getElementById('global-mascot-info-today-calls');
  const tApptEl = document.getElementById('global-mascot-info-today-appts');
  const mApptEl = document.getElementById('global-mascot-info-month-appts');
  const statsNoteEl = document.getElementById('global-mascot-info-stats-note');
  const isDe = typeof currentLang !== 'undefined' && currentLang === 'de';
  const n = (getMascotPref('mb_mascot_name', '') || '').trim() || 'Mimi';
  const rawVariant = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  const appliedV = resolveMascotVariantKeyFromPref();
  const appliedLabel = appliedV.charAt(0).toUpperCase() + appliedV.slice(1);
  const totalCall = Math.max(0, _mascotCallAccumSec + (dialerStatus === 'on_call' ? (Number(callSeconds) || 0) : 0));
  const mimiAge = totalCall * getMascotAgeCoeff();
  if (nameEl) nameEl.textContent = n;
  if (ageEl) ageEl.textContent = _fmtMimiLife(mimiAge);
  if (callsEl) callsEl.textContent = _fmtMimiLife(totalCall);
  if (variantEl) {
    const opt = document.querySelector(`#s-mascot-variant option[value="${CSS.escape(appliedV)}"]`);
    const named = opt
      ? (isDe ? (opt.getAttribute('data-de') || opt.textContent) : (opt.getAttribute('data-tr') || opt.textContent))
      : appliedLabel;
    const label = String(named || appliedLabel).trim();
    variantEl.textContent =
      rawVariant === 'random'
        ? (typeof tReplace === 'function' ? tReplace('dial.mimi_variant_random', { label }) : (isDe ? `Zufall (${label})` : `Rastgele (${label})`))
        : label;
  }
  const muteBtn = document.getElementById('mimi-bubble-mute-btn');
  const muteLbl = document.getElementById('mimi-bubble-mute-label');
  if (muteLbl) {
    muteLbl.textContent = isMimiBubbleMuted()
      ? (typeof t === 'function' ? t('dial.mimi_mute_show') : 'Balonları aç')
      : (typeof t === 'function' ? t('dial.mimi_mute_hide') : 'Balon konuşmasını kapat');
  }
  if (muteBtn) muteBtn.setAttribute('aria-pressed', isMimiBubbleMuted() ? 'true' : 'false');
  const hideLbl = document.getElementById('mimi-hide-label');
  if (hideLbl) hideLbl.textContent = isDe ? `${n} ausblenden` : `${n} gizle`;
  const infoPanel = document.getElementById('global-mascot-info');
  if (infoPanel) infoPanel.setAttribute('aria-label', isDe ? `${n} Karte` : `${n} kartı`);
  if (noteEl) {
    noteEl.textContent =
      typeof tReplace === 'function'
        ? tReplace('dial.mimi_note_age', { coef: getMascotAgeCoeff().toFixed(1), name: n })
        : (isDe
          ? `${n} altert mit dem ${getMascotAgeCoeff().toFixed(1)}-fachen der Gesprächszeit.`
          : `${n}, çağrı süresinin ${getMascotAgeCoeff().toFixed(1)} katı kadar yaş alır.`);
  }
  const gm = document.getElementById('global-mascot');
  const moodKey = gm?.getAttribute('data-mood') || '';
  const heat = Number(gm?.style.getPropertyValue('--mascot-call-heat') || '0') || 0;
  const view = mbMascotMoodView(typeof dialerStatus !== 'undefined' ? dialerStatus : '', moodKey, {
    heat,
    sad: gm?.classList.contains('global-mascot--sad'),
    celebrate: gm?.classList.contains('global-mascot--celebrate'),
    idle: gm?.getAttribute('data-mascot-idle') === '1',
  });
  if (moodEl) moodEl.textContent = view.label;
  if (energyEl) energyEl.textContent = view.energy;
  if (moodNoteEl) moodNoteEl.textContent = view.note;
  const p = window._dialerPerfSnapshot || {};
  if (tCallsEl) tCallsEl.textContent = String(Number(p.todayCalls) || 0);
  if (tApptEl) tApptEl.textContent = String(Number(p.todayAppts) || 0);
  if (mApptEl) mApptEl.textContent = String(Number(p.monthlyAppts) || 0);
  if (statsNoteEl) {
    statsNoteEl.textContent = typeof t === 'function' ? t('dial.mimi_stats_note') : (isDe ? 'Statistiken werden aus dem Performance-Panel aktualisiert.' : 'İstatistikler performans panelinden güncellenir.');
  }
  if (typeof ariaPaintName === 'function') ariaPaintName();
}

function _resetGlobalMascotInfoPanelPosition() {
  const panel = document.getElementById('global-mascot-info');
  if (!panel) return;
  panel.style.position = '';
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.transform = '';
  panel.style.maxWidth = '';
}

/** Mimi kartı maskot viewport kenarındayken taşmasın — fixed konum + clamp */
function positionGlobalMascotInfoPanel() {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm || panel.style.display === 'none') return;
  const anchor =
    document.querySelector('#global-mascot .cust-empty-blob') || document.getElementById('cust-empty-mascot');
  if (!anchor) return;
  const pad = 10;
  const maxW = Math.min(420, Math.max(220, window.innerWidth - pad * 2));
  panel.style.position = 'fixed';
  panel.style.transform = 'none';
  panel.style.maxWidth = `${maxW}px`;
  panel.style.left = '-9999px';
  panel.style.top = '0';
  const ar = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  let left = ar.right + 12;
  let top = ar.top + ar.height / 2 - ph / 2;
  if (left + pw > window.innerWidth - pad) {
    left = ar.left - pw - 12;
  }
  if (left < pad) left = pad;
  if (left + pw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - pw);
  if (top + ph > window.innerHeight - pad) top = window.innerHeight - pad - ph;
  if (top < pad) top = pad;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function switchMimiTab(tab) {
  _mimiActiveTab = tab || 'profile';
  const map = [
    ['profile', 'mimi-pane-profile', 'mimi-tab-profile'],
    ['mood', 'mimi-pane-mood', 'mimi-tab-mood'],
    ['stats', 'mimi-pane-stats', 'mimi-tab-stats'],
  ];
  map.forEach(([k, paneId, tabId]) => {
    document.getElementById(paneId)?.style && (document.getElementById(paneId).style.display = k === _mimiActiveTab ? '' : 'none');
    document.getElementById(tabId)?.classList.toggle('active', k === _mimiActiveTab);
  });
  refreshGlobalMascotInfoPanel();
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    requestAnimationFrame(() => {
      positionGlobalMascotInfoPanel();
      requestAnimationFrame(() => positionGlobalMascotInfoPanel());
    });
  }
}

function toggleGlobalMascotInfoPanel(forceOpen) {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm) return;
  if (isMimiHidden()) return;
  const open = forceOpen === undefined ? panel.style.display === 'none' || !panel.style.display : !!forceOpen;
  if (!open) {
    _resetGlobalMascotInfoPanelPosition();
    panel.style.display = 'none';
    gm.classList.remove('global-mascot--panel-open');
    return;
  }
  panel.style.display = 'block';
  gm.classList.add('global-mascot--panel-open');
  switchMimiTab(_mimiActiveTab || 'profile');
  requestAnimationFrame(() => {
    positionGlobalMascotInfoPanel();
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  });
}

function mbMascotReturnHome() {
  setMascotPref('mb_mascot_custom_pos', '');
  const gm = document.getElementById('global-mascot');
  if (gm) {
    gm.classList.remove('global-mascot--custom');
    gm.style.left = '';
    gm.style.top = '';
  }
  _wanderCur = { x: 0, y: 0 };
  _wanderTgt = { x: 0, y: 0 };
  _wanderHeading = NaN;
  _wanderHolding = false;
  if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
}

function hideMimi() {
  setMascotPref('mb_mascot_hidden', '1');
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) bubble.style.display = 'none';
  toggleGlobalMascotInfoPanel(false);
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  if (typeof _clearCustEmptyNotifPeek === 'function') _clearCustEmptyNotifPeek();
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-chat', 'cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-chat', 'global-mascot--peek-notif');
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
  syncGlobalMascotDock();
}

function showMimi() {
  setMascotPref('mb_mascot_hidden', '0');
  syncGlobalMascotDock();
  if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
}

function _loadMascotCustomPos() {
  try {
    const raw = getMascotPref('mb_mascot_custom_pos', '');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function _wireGlobalMascotInteractions() {
  const gm = document.getElementById('global-mascot');
  const mascot = document.getElementById('cust-empty-mascot');
  if (!gm || !mascot || gm.dataset.interactiveReady === '1') return;
  gm.dataset.interactiveReady = '1';
  mascot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    _stopGlobalMascotWander();
    const r = gm.getBoundingClientRect();
    _mascotDragState = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      moved: false,
    };
    gm.classList.add('global-mascot--dragging');
    mascot.setPointerCapture(e.pointerId);
  });
  mascot.addEventListener('pointermove', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - _mascotDragState.sx;
    const dy = e.clientY - _mascotDragState.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mascotDragState.moved = true;
    const edge = 24;
    const x = Math.max(edge, Math.min(window.innerWidth - edge, _mascotDragState.left + dx));
    const y = Math.max(edge, Math.min(window.innerHeight - edge, _mascotDragState.top + dy));
    gm.style.left = `${x}px`;
    gm.style.top = `${y}px`;
    gm.classList.add('global-mascot--custom');
    placeGlobalMascotBubble();
  });
  mascot.addEventListener('pointerup', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const wasMove = _mascotDragState.moved;
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (wasMove) {
      const px = parseFloat(gm.style.left);
      const py = parseFloat(gm.style.top);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x: px, y: py }));
      }
      if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
      else _syncGlobalMascotWanderOnly();
    } else {
      if (isMimiHidden()) showMimi();
      else toggleGlobalMascotInfoPanel();
      _syncGlobalMascotWanderOnly();
    }
  });
  mascot.addEventListener('pointercancel', () => {
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
    else _syncGlobalMascotWanderOnly();
  });
}

function _stopGlobalMascotWander() {
  if (_wanderRaf) {
    cancelAnimationFrame(_wanderRaf);
    _wanderRaf = null;
  }
  const gm = document.getElementById('global-mascot');
  const ax = _wanderCur.x;
  const ay = _wanderCur.y;
  if (gm && (Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5)) {
    const left = (parseFloat(String(gm.style.left || '0')) || 0) + ax;
    const top = (parseFloat(String(gm.style.top || '0')) || 0) + ay;
    gm.style.left = `${left}px`;
    gm.style.top = `${top}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    try {
      setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x: left, y: top }));
    } catch (e) {}
  }
  _wanderCur = { x: 0, y: 0 };
  _wanderTgt = { x: 0, y: 0 };
  _wanderPauseUntil = 0;
  _wanderSpeedMult = 1;
  _wanderHeading = NaN;
  _wanderHopJitter = 1;
  _wanderHolding = false;
  if (gm) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  }
}

/** Kenar çubuğu veya üst çubuk ayağına kilitliyken gezinme menünün üstüne biner. Sürüklenen konum, gezme açıksa devam eder. */
function _mascotDockedInSidebar(gm) {
  return !!(gm && gm.classList.contains('global-mascot--topbar') && !gm.classList.contains('global-mascot--custom'));
}

function _mascotWanderAllowed(gm) {
  if (!gm || isMimiHidden() || !isMascotWanderEnabled()) return false;
  if (getMascotWanderPct() <= 0) return false;
  if (_mascotDockedInSidebar(gm)) return false;
  if (gm.classList.contains('global-mascot--peek-chat')) return false;
  if (gm.classList.contains('global-mascot--peek-notif')) return false;
  if (gm.classList.contains('global-mascot--notif-morph')) return false;
  return true;
}

/** Sürükleme bittiğinde veya ayar değişince: gezinmeyi yeniden başlat / durdur (konumu sıfırlamaz). */
function _syncGlobalMascotWanderOnly() {
  const gm = document.getElementById('global-mascot');
  if (!gm || isMimiHidden()) return;
  if (_mascotWanderAllowed(gm)) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
}

function _clampWander(x, y, b) {
  return {
    x: Math.min(b.maxX, Math.max(b.minX, x)),
    y: Math.min(b.maxY, Math.max(b.minY, y)),
  };
}

/** Bırakılan yerin (0,0) çevresinde kısa adım. Mesafe kaydırıcısı tasmayı belirler. */
function _pickWanderTarget(gm) {
  const b = _mascotWanderBoundsFromViewport(gm);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const cx = Number.isFinite(_wanderCur.x) ? _wanderCur.x : 0;
  const cy = Number.isFinite(_wanderCur.y) ? _wanderCur.y : 0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 8 || h < 8) {
    _wanderTgt.x = cx;
    _wanderTgt.y = cy;
    return;
  }
  const t = Math.max(0, Math.min(100, getMascotWanderPct())) / 100;
  const leash = Math.max(16, Math.min(w, h) * (0.06 + 0.38 * t));
  const home = Math.hypot(cx, cy);
  if (!Number.isFinite(_wanderHeading)) _wanderHeading = Math.random() * Math.PI * 2;
  if (home > leash * 0.86) {
    _wanderHeading = Math.atan2(-cy, -cx) + (Math.random() - 0.5) * 0.9;
  } else {
    const wide = Math.random() < 0.16;
    const mag = wide ? 0.55 + Math.random() * 1.15 : 0.18 + Math.random() * 0.85;
    _wanderHeading += mag * (Math.random() < 0.5 ? -1 : 1);
  }
  const hop = (18 + t * 56) + Math.random() * (14 + t * 48);
  const propose = (head) => {
    let nx = cx + Math.cos(head) * hop;
    let ny = cy + Math.sin(head) * hop;
    const nd = Math.hypot(nx, ny);
    if (nd > leash && nd > 0) {
      nx *= leash / nd;
      ny *= leash / nd;
    }
    return _clampWander(nx, ny, b);
  };
  let next = propose(_wanderHeading);
  if (Math.hypot(next.x - cx, next.y - cy) < 8) {
    _wanderHeading += (Math.PI / 2) * (Math.random() < 0.5 ? -1 : 1);
    next = propose(_wanderHeading);
  }
  if (Math.hypot(next.x - cx, next.y - cy) < 8) {
    _wanderHeading += Math.PI;
    next = propose(_wanderHeading);
  }
  _wanderTgt.x = next.x;
  _wanderTgt.y = next.y;
  _wanderHopJitter = 0.84 + Math.random() * 0.32;
}

function _wanderFrame() {
  const gm = document.getElementById('global-mascot');
  if (!gm) {
    _wanderRaf = null;
    return;
  }
  const pct = getMascotWanderPct();
  if (!isMascotWanderEnabled() || pct <= 0) {
    _stopGlobalMascotWander();
    return;
  }
  const dx = _wanderTgt.x - _wanderCur.x;
  const dy = _wanderTgt.y - _wanderCur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1.4) {
    if (!_wanderHolding) {
      _wanderHolding = true;
      _wanderPauseUntil = performance.now() + 280 + Math.random() * 900;
    }
    if (performance.now() < _wanderPauseUntil) {
      _wanderRaf = requestAnimationFrame(_wanderFrame);
      return;
    }
    _wanderHolding = false;
    _pickWanderTarget(gm);
  }
  const bounds = _mascotWanderBoundsFromViewport(gm);
  const speedT = Math.max(0, Math.min(100, getMascotWanderSpeedPct())) / 100;
  const px = (0.12 + speedT * 2.4) * _wanderHopJitter * _wanderSpeedMult;
  const stepDist = Math.hypot(_wanderTgt.x - _wanderCur.x, _wanderTgt.y - _wanderCur.y);
  if (stepDist > 0.001) {
    const move = Math.min(stepDist, px);
    _wanderCur.x += ((_wanderTgt.x - _wanderCur.x) / stepDist) * move;
    _wanderCur.y += ((_wanderTgt.y - _wanderCur.y) / stepDist) * move;
  }
  const clamped = _clampWander(_wanderCur.x, _wanderCur.y, bounds);
  _wanderCur.x = clamped.x;
  _wanderCur.y = clamped.y;
  if (!Number.isFinite(_wanderCur.x)) _wanderCur.x = 0;
  if (!Number.isFinite(_wanderCur.y)) _wanderCur.y = 0;
  gm.style.setProperty('--gm-wx', `${_wanderCur.x.toFixed(2)}px`);
  gm.style.setProperty('--gm-wy', `${_wanderCur.y.toFixed(2)}px`);
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    if (typeof positionGlobalMascotInfoPanel === 'function') positionGlobalMascotInfoPanel();
  }
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _startGlobalMascotWander() {
  if (_wanderRaf) return;
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const pct = getMascotWanderPct();
  if (!isMascotWanderEnabled() || pct <= 0) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  _wanderCur = { x: 0, y: 0 };
  _pickWanderTarget(gm);
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _topbarMascotRect() {
  const slot = document.getElementById('tb-mascot-anchor');
  const slotStyle = slot ? getComputedStyle(slot) : null;
  const r = slot && slotStyle && slotStyle.display !== 'none' && !slot.classList.contains('is-off')
    ? slot.getBoundingClientRect()
    : null;
  if (r && r.width > 8 && r.height > 8) return r;
  const logo = document.querySelector('.tb-logo');
  const bar = document.getElementById('topbar');
  const lr = logo ? logo.getBoundingClientRect() : null;
  const br = bar ? bar.getBoundingClientRect() : null;
  const size = 40;
  if (lr && lr.width > 1 && br && br.height > 1) {
    return {
      left: lr.right + 6,
      top: br.top + (br.height - size) / 2,
      width: size,
      height: size,
    };
  }
  return { left: 56, top: 7, width: size, height: size };
}

function _placeGlobalMascotAtRect(rect) {
  const gm = document.getElementById('global-mascot');
  if (!gm || !rect) return;
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rect.width < 0.5) {
    const slot = _topbarMascotRect();
    cx = slot.left + slot.width / 2;
    cy = slot.top + slot.height / 2;
  }
  gm.style.left = `${cx}px`;
  gm.style.top = `${cy}px`;
  gm.classList.add('global-mascot--placed');
}

function syncCustomerCardEmptyVisual() {
  const cc = document.getElementById('customer-card');
  const ce = document.getElementById('cust-empty');
  if (!cc || !ce) return;
  const showEmpty = ce.style.display !== 'none';
  cc.classList.toggle('customer-card--empty', showEmpty);
}

function _visibleMascotAnchor() {
  const sb = document.getElementById('sidebar');
  const side = document.getElementById('sb-mascot-anchor');
  const top = document.getElementById('tb-mascot-anchor');
  if (sb && side) {
    const r = sb.getBoundingClientRect();
    if (r.width > 40 && r.right > 24 && r.left < (window.innerWidth || 0) - 8) return side;
  }
  return top || side;
}

function syncGlobalMascotDock() {
  if (_dockRaf) cancelAnimationFrame(_dockRaf);
  _dockRaf = requestAnimationFrame(() => {
    _dockRaf = null;
    _syncGlobalMascotDockImpl();
  });
}

function _syncGlobalMascotDockImpl() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const anchor = _visibleMascotAnchor();
  const inSidebar = !!(anchor && anchor.id === 'sb-mascot-anchor' && !isMimiHidden());
  const narrowTop = (window.innerWidth || 0) <= 768 && !inSidebar;
  gm.classList.toggle('global-mascot--mobile-off', narrowTop);
  if (narrowTop) {
    gm.classList.remove('global-mascot--placed');
    return;
  }
  const slot = document.getElementById('tb-mascot-anchor');
  if (slot) slot.classList.toggle('is-off', inSidebar);
  gm.classList.toggle('global-mascot--sidebar', inSidebar);
  gm.classList.toggle('global-mascot--muted', isMimiHidden());
  _wireGlobalMascotInteractions();
  if (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif')) {
    gm.classList.add('global-mascot--placed');
    return;
  }
  if (isMimiHidden()) {
    _placeGlobalMascotAtRect(_topbarMascotRect());
    gm.classList.remove('global-mascot--dialer', 'global-mascot--custom');
    gm.classList.add('global-mascot--topbar');
    _stopGlobalMascotWander();
    return;
  }
  if (gm.classList.contains('global-mascot--notif-morph')) {
    const nb = document.getElementById('tb-notif-btn');
    const r = nb
      ? nb.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : { left: 80, top: 28, width: 36, height: 34 };
    _placeGlobalMascotAtRect(r);
    gm.classList.add('global-mascot--topbar');
    gm.classList.remove('global-mascot--dialer');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  const custom = _loadMascotCustomPos();
  const barBottom = document.getElementById('topbar')?.getBoundingClientRect().bottom || 54;
  const draggedDown = !!(custom && custom.y > barBottom + 12);
  if (draggedDown) {
    gm.style.left = `${custom.x}px`;
    gm.style.top = `${custom.y}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
    if (slot) slot.classList.add('is-off');
  } else if (inSidebar && anchor) {
    _placeGlobalMascotAtRect(anchor.getBoundingClientRect());
    gm.classList.remove('global-mascot--custom', 'global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else {
    _placeGlobalMascotAtRect(_topbarMascotRect());
    gm.classList.remove('global-mascot--custom', 'global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  }
  if (_mascotWanderAllowed(gm)) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
  if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  const info = document.getElementById('global-mascot-info');
  if (info && info.style.display !== 'none') {
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  }
}

function syncGlobalMascotMoodFromCustEmpty() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (!root || root.style.display === 'none') {
    gm.removeAttribute('data-mood');
    return;
  }
  if (root.classList.contains('cust-empty--break')) gm.setAttribute('data-mood', 'break');
  else if (root.classList.contains('cust-empty--mascot-angry')) gm.setAttribute('data-mood', 'angry');
  else if (root.classList.contains('cust-empty--mascot-bored')) gm.setAttribute('data-mood', 'bored');
  else if (root.classList.contains('cust-empty--mascot-eat')) gm.setAttribute('data-mood', 'eat');
  else if (root.classList.contains('cust-empty--mascot-drink')) gm.setAttribute('data-mood', 'drink');
  else if (root.classList.contains('cust-empty--mascot-yawn')) gm.setAttribute('data-mood', 'yawn');
  else if (root.classList.contains('cust-empty--mascot-stretch')) gm.setAttribute('data-mood', 'stretch');
  else if (root.classList.contains('cust-empty--mascot-celebrate')) gm.setAttribute('data-mood', 'celebrate');
  else gm.removeAttribute('data-mood');
}

function onCallTickForGlobalMascot() {
  if (typeof dialerStatus === 'undefined' || dialerStatus !== 'on_call') return;
  const sec = typeof callSeconds !== 'undefined' ? callSeconds : 0;
  const heat = Math.min(sec / 90, 1);
  document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', String(heat));
  refreshGlobalMascotInfoPanel();
  const milestones = [30, 70, 115, 175, 240, 330, 450];
  const hit = milestones.find((m) => m <= sec && m > _lastMascotCheerSec);
  if (!hit) return;
  if (isMimiHidden()) return;
  if (typeof mascotSpeechOn === 'function' && !mascotSpeechOn('cheer')) return;
  _lastMascotCheerSec = hit;
  const idx = Math.floor(Math.random() * 9);
  const msg = typeof t === 'function' ? t(`dial.cheer.${idx}`) : '';
  _showCustEmptyBubbleMsg(msg || '…', 'cheer');
}

function runGlobalMascotNotifMorph() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (_mascotNotifMorphT) clearTimeout(_mascotNotifMorphT);
  gm.classList.remove('global-mascot--notif-open');
  gm.classList.add('global-mascot--notif-morph');
  syncGlobalMascotDock();
  setTimeout(() => gm.classList.add('global-mascot--notif-open'), 420);
  _mascotNotifMorphT = setTimeout(() => {
    gm.classList.remove('global-mascot--notif-morph', 'global-mascot--notif-open');
    _mascotNotifMorphT = null;
    syncGlobalMascotDock();
  }, 2900);
}

function reloadMascotStateForUser() {
  _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
  _lastMascotCheerSec = -1;
  _mascotCosRandCache = {};
  _mascotVariantRandResolved = '';
  try {
    refreshGlobalMascotInfoPanel();
    applyMascotTheme();
    syncGlobalMascotDock();
  } catch (e) {}
}

try {
  window.syncGlobalMascotDock = syncGlobalMascotDock;
  window.runGlobalMascotNotifMorph = runGlobalMascotNotifMorph;
  window.reloadMascotStateForUser = reloadMascotStateForUser;
  if (!window._mbMascotResizeWired) {
    window._mbMascotResizeWired = true;
    window.addEventListener('resize', () => syncGlobalMascotDock());
    const bar = document.getElementById('topbar');
    if (bar && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => syncGlobalMascotDock()).observe(bar);
    }
  }
} catch (e) {}

let _custEmptyCoachTimer = null;
let _custEmptyChatPeekTimer = null;
let _custEmptyNotifPeekTimer = null;
let _custEmptyNotifPeekDelayT = null;
let _custEmptyLastNotifHint = 0;

function _clearCustEmptyCoachTimer() {
  if (_custEmptyCoachTimer) {
    clearInterval(_custEmptyCoachTimer);
    _custEmptyCoachTimer = null;
  }
}

let _bubblePlaceRaf = 0;

function placeGlobalMascotBubble() {
  const bubble = document.getElementById('cust-empty-bubble');
  const mascot = document.querySelector('#global-mascot .cust-empty-mascot');
  if (!bubble || !mascot || bubble.style.display === 'none') return;
  const pad = 8;
  const gap = 12;
  bubble.classList.add('cust-empty-bubble--docked');
  const mr = mascot.getBoundingClientRect();
  if (mr.width < 2 || mr.height < 2) return;
  const cx = mr.left + mr.width / 2;
  const cy = mr.top + mr.height / 2;
  const roomLeft = mr.left - pad - gap;
  const roomRight = window.innerWidth - pad - gap - mr.right;
  const roomUp = mr.top - pad - gap;
  const roomDown = window.innerHeight - pad - gap - mr.bottom;
  let toLeft = cx >= window.innerWidth / 2;
  let above = cy >= window.innerHeight / 2;
  if (toLeft && roomLeft < 120 && roomRight > roomLeft) toLeft = false;
  if (!toLeft && roomRight < 120 && roomLeft > roomRight) toLeft = true;
  if (above && roomUp < 44 && roomDown > roomUp) above = false;
  if (!above && roomDown < 44 && roomUp > roomDown) above = true;
  const roomX = Math.max(80, toLeft ? roomLeft : roomRight);
  const maxW = Math.min(260, roomX);
  bubble.style.setProperty('--bubble-max-w', `${Math.round(maxW)}px`);
  const bw = Math.min(bubble.offsetWidth || maxW, maxW);
  const bh = bubble.offsetHeight || 36;
  let left = toLeft ? mr.left - gap - bw : mr.right + gap;
  let top = above ? mr.top - gap - bh : mr.bottom + gap;
  if (left < pad) left = mr.right + gap;
  if (left + bw > window.innerWidth - pad) left = mr.left - gap - bw;
  if (top < pad) top = mr.bottom + gap;
  if (top + bh > window.innerHeight - pad) top = mr.top - gap - bh;
  left = Math.max(pad, Math.min(left, window.innerWidth - pad - bw));
  top = Math.max(pad, Math.min(top, window.innerHeight - pad - bh));
  const overlaps =
    left < mr.right - 1 &&
    left + bw > mr.left + 1 &&
    top < mr.bottom - 1 &&
    top + bh > mr.top + 1;
  if (overlaps) {
    left = toLeft ? Math.max(pad, mr.left - gap - bw) : Math.min(window.innerWidth - pad - bw, mr.right + gap);
    top = above ? Math.max(pad, mr.top - gap - bh) : Math.min(window.innerHeight - pad - bh, mr.bottom + gap);
    left = Math.max(pad, Math.min(left, window.innerWidth - pad - bw));
    top = Math.max(pad, Math.min(top, window.innerHeight - pad - bh));
  }
  bubble.style.setProperty('--bubble-left', `${Math.round(left)}px`);
  bubble.style.setProperty('--bubble-top', `${Math.round(top)}px`);
}

function _ensureBubblePlacer() {
  if (_bubblePlaceRaf) return;
  const tick = () => {
    const bubble = document.getElementById('cust-empty-bubble');
    if (!bubble || bubble.style.display === 'none') {
      _bubblePlaceRaf = 0;
      return;
    }
    placeGlobalMascotBubble();
    _bubblePlaceRaf = requestAnimationFrame(tick);
  };
  _bubblePlaceRaf = requestAnimationFrame(tick);
}

function _showCustEmptyBubbleMsg(msg, kind) {
  const bubble = document.getElementById('cust-empty-bubble');
  const gm = document.getElementById('global-mascot');
  if (!bubble || isMimiHidden() || isMimiBubbleMuted()) return;
  if (kind && typeof mascotSpeechOn === 'function' && !mascotSpeechOn(kind)) return;
  if (kind !== 'assist' && gm?.classList.contains('global-mascot--aria') && bubble.style.display !== 'none') return;
  if (_bubbleAutoHideT) {
    clearTimeout(_bubbleAutoHideT);
    _bubbleAutoHideT = null;
  }
  bubble.dataset.owner = kind || '';
  bubble.textContent = formatMascotSpokenLine(msg);
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
  placeGlobalMascotBubble();
  _ensureBubblePlacer();
  if (kind === 'greet' || kind === 'page') {
    _bubbleAutoHideT = setTimeout(() => {
      _bubbleAutoHideT = null;
      const b = document.getElementById('cust-empty-bubble');
      const g = document.getElementById('global-mascot');
      if (!b || g?.classList.contains('global-mascot--aria')) return;
      if (b.dataset.owner === 'greet' || b.dataset.owner === 'page') b.style.display = 'none';
    }, 6000);
  }
}

function _clearCustEmptyNotifPeek() {
  if (_custEmptyNotifPeekDelayT) {
    clearTimeout(_custEmptyNotifPeekDelayT);
    _custEmptyNotifPeekDelayT = null;
  }
  if (_custEmptyNotifPeekTimer) {
    clearTimeout(_custEmptyNotifPeekTimer);
    _custEmptyNotifPeekTimer = null;
  }
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-notif');
}

function hintCustEmptyNotifUnread(totalUnread) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  if (root?.classList.contains('cust-empty--peek-chat')) return;
  if (gm.classList.contains('global-mascot--peek-chat')) return;
  const n = Math.max(1, Number(totalUnread) || 1);
  if (Date.now() - _custEmptyLastNotifHint < 85000) return;
  _custEmptyLastNotifHint = Date.now();
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  if (typeof runGlobalMascotNotifMorph === 'function') runGlobalMascotNotifMorph();
  _showCustEmptyBubbleMsg(
    typeof tReplace === 'function' ? tReplace('dial.hint_notif', { n }) : `Bildirim (${n})`,
    'hint'
  );
  _custEmptyNotifPeekDelayT = setTimeout(() => {
    _custEmptyNotifPeekDelayT = null;
    root?.classList.add('cust-empty--peek-notif');
    gm.classList.add('global-mascot--peek-notif');
    syncGlobalMascotDock();
  }, 3000);
  _custEmptyNotifPeekTimer = setTimeout(() => {
    _custEmptyNotifPeekTimer = null;
    root?.classList.remove('cust-empty--peek-notif');
    gm.classList.remove('global-mascot--peek-notif');
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }, 14000);
}

function hintCustEmptyChatMessage(fromName) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  root?.classList.remove('cust-empty--peek-notif');
  gm.classList.remove('global-mascot--peek-notif');
  root?.classList.add('cust-empty--peek-chat');
  gm.classList.add('global-mascot--peek-chat');
  const isDe = typeof currentLang !== 'undefined' && currentLang === 'de';
  const who =
    fromName && String(fromName).trim()
      ? String(fromName).trim()
      : typeof t === 'function'
        ? t('dial.hint_chat_team')
        : isDe
          ? 'Team'
          : 'Ekip';
  _showCustEmptyBubbleMsg(
    typeof tReplace === 'function' ? tReplace('dial.hint_chat', { who }) : `Chat: ${who}`,
    'hint'
  );
  if (_custEmptyChatPeekTimer) clearTimeout(_custEmptyChatPeekTimer);
  _custEmptyChatPeekTimer = setTimeout(() => clearCustEmptyChatPeek(), 14000);
}

function clearCustEmptyChatPeek() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const hadPeek = !!(
    (root && root.classList.contains('cust-empty--peek-chat')) ||
    (gm && gm.classList.contains('global-mascot--peek-chat'))
  );
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  root?.classList.remove('cust-empty--peek-chat');
  gm?.classList.remove('global-mascot--peek-chat');
  if (hadPeek) {
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }
}

try {
  window.hintCustEmptyChatMessage = hintCustEmptyChatMessage;
  window.clearCustEmptyChatPeek = clearCustEmptyChatPeek;
  window.hintCustEmptyNotifUnread = hintCustEmptyNotifUnread;
} catch (e) {}

function _custEmptyCoachTargetVisible() {
  const root = document.getElementById('cust-empty');
  const dialer = document.getElementById('page-dialer')?.classList.contains('active');
  return !!(dialer && root && root.style.display !== 'none');
}

function refreshCustEmptyCoachBubble() {
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  if (typeof mascotSpeechOn === 'function' && !mascotSpeechOn('coach')) return;
  const bubble = document.getElementById('cust-empty-bubble');
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!bubble || !root || root.style.display === 'none' || root.classList.contains('cust-empty--ringing')) {
    if (bubble) bubble.style.display = 'none';
    return;
  }
  if (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif')) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  const p = window._dialerPerfSnapshot || {};
  const calls = Number(p.calls) || 0;
  const appts = Number(p.appts) || 0;
  const posCalls = Number(p.posCalls) || 0;
  const tdA = Number(p.todayAppts) || 0;
  const tdC = Number(p.todayCalls) || 0;
  const monA = Number(p.monthlyAppts) || 0;
  const scope = p.tab === 'week' ? 'week' : (p.tab === 'month' ? 'month' : 'today');
  const scopeKey = scope === 'week' ? 'dial.scope.week' : (scope === 'month' ? 'dial.scope.month' : 'dial.scope.today');
  const scopeStr = typeof t === 'function' ? t(scopeKey) : '';
  const goalBase = Math.max(1, Number(_dailyGoal) || 5);
  const goalFactor = scope === 'week' ? 5 : (scope === 'month' ? 22 : 1);
  const periodGoal = scope === 'week'
    ? (Number(window._weeklyGoal) || goalBase * 5)
    : (scope === 'month' ? (Number(window._monthlyGoal) || goalBase * 22) : goalBase);
  const apptRatio = appts / periodGoal;
  const hasStrongCallVolume = calls >= (12 * goalFactor);
  const roll = Math.random();
  let msg = '';
  if (roll < 0.28) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.today', { tdA, tdC }) : '';
  } else if (roll < 0.36 && monA > 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.month', { monA }) : '';
  } else if (apptRatio >= 1.1 && hasStrongCallVolume) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.tempo', { scope: scopeStr }) : '';
  } else if (calls >= (14 * goalFactor) && posCalls === 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.many_calls', { scope: scopeStr }) : '';
  } else if (calls >= (10 * goalFactor) && appts === 0) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.rhythm', { scope: scopeStr }) : '';
  } else if (apptRatio >= 0.9) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.strong90', { scope: scopeStr }) : '';
  } else if (apptRatio >= 0.6) {
    msg = typeof tReplace === 'function' ? tReplace('dial.coach.strong60', { scope: scopeStr }) : '';
  } else {
    const pi = Math.floor(Math.random() * 4);
    msg = typeof t === 'function' ? t(`dial.coach.pool.${pi}`) : '';
  }
  _showCustEmptyBubbleMsg(msg || '…', 'coach');
}

function startCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  if (typeof mascotSpeechOn === 'function' && !mascotSpeechOn('coach')) return;
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (root && (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif'))) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  if (!_custEmptyCoachTargetVisible()) return;
  refreshCustEmptyCoachBubble();
  _custEmptyCoachTimer = setInterval(() => refreshCustEmptyCoachBubble(), 52000);
}

function stopCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  if (document.getElementById('global-mascot')?.classList.contains('global-mascot--aria')) return;
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) {
    bubble.style.display = 'none';
    bubble.classList.remove('cust-empty-bubble--pop');
  }
}

let _readyEnteredAt = null;
/** Boş kartta (Hazır değilken) sıkılma/sinir süresi için başlangıç */
let _custEmptyIdleSince = null;
let _mascotMoodTimer = null;
let _mascotEatTimer = null;

/** İç --mx/--my titremesi kaldırıldı; gezinme yalnızca global _wanderFrame ile (diğer sekmelerle aynı). */
function _resetCustEmptyMascotInnerOffset() {
  const mascot = document.getElementById('cust-empty-mascot');
  if (!mascot) return;
  mascot.style.setProperty('--mx', '0px');
  mascot.style.setProperty('--my', '0px');
}

function _stopCustEmptyMascotTimers() {
  if (_mascotMoodTimer) {
    clearInterval(_mascotMoodTimer);
    _mascotMoodTimer = null;
  }
  if (_mascotEatTimer) {
    clearTimeout(_mascotEatTimer);
    _mascotEatTimer = null;
  }
  _resetCustEmptyMascotInnerOffset();
}

function refreshCustEmptyMascotState() {
  const root = document.getElementById('cust-empty');
  if (!root || root.style.display === 'none') {
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (root.classList.contains('cust-empty--ringing')) return;
  root.classList.remove('cust-empty--mascot-bored', 'cust-empty--mascot-angry', 'cust-empty--break');
  const st = typeof dialerStatus !== 'undefined' ? dialerStatus : '';
  if (st === 'break') {
    root.classList.add('cust-empty--break');
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (st !== 'ready' && st !== 'offline') return;
  if (st === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  const t0 = st === 'ready' && _readyEnteredAt ? _readyEnteredAt : _custEmptyIdleSince || Date.now();
  const waitSec = (Date.now() - t0) / 1000;
  if (waitSec > 120) root.classList.add('cust-empty--mascot-angry');
  else if (waitSec > 45) root.classList.add('cust-empty--mascot-bored');
  syncGlobalMascotMoodFromCustEmpty();
}

function scheduleMascotEatOnce() {
  if (_mascotEatTimer) clearTimeout(_mascotEatTimer);
  const delay = 22000 + Math.floor(Math.random() * 28000);
  _mascotEatTimer = setTimeout(() => {
    _mascotEatTimer = null;
    if (dialerStatus !== 'ready' && dialerStatus !== 'offline') {
      scheduleMascotEatOnce();
      return;
    }
    const root = document.getElementById('cust-empty');
    if (!root || root.classList.contains('cust-empty--ringing')) {
      scheduleMascotEatOnce();
      return;
    }
    root.classList.add('cust-empty--mascot-eat');
    syncGlobalMascotMoodFromCustEmpty();
    setTimeout(() => {
      root.classList.remove('cust-empty--mascot-eat');
      syncGlobalMascotMoodFromCustEmpty();
      scheduleMascotEatOnce();
    }, 2600);
  }, delay);
}

function startCustEmptyMascotLoops() {
  _stopCustEmptyMascotTimers();
  if (dialerStatus === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  refreshCustEmptyMascotState();
  if (dialerStatus !== 'ready' && dialerStatus !== 'break' && dialerStatus !== 'offline') return;
  _mascotMoodTimer = setInterval(refreshCustEmptyMascotState, 8000);
  if (dialerStatus === 'ready' || dialerStatus === 'offline') scheduleMascotEatOnce();
}

/** Aylık randevu / hedefe göre büyüme × kullanıcı boyutu (ayarlar 50–150%) */
function updateCustEmptyMascotScale() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const monthlyGoal = Math.max(1, Number(window._monthlyGoal) || (Number(_dailyGoal) || 5) * 22);
  const n = Number(window._dialerPerfSnapshot?.monthlyAppts ?? 0);
  const t = Math.min(Math.max(n / monthlyGoal, 0), 2.2);
  const perf = 1 + 0.28 * t;
  const userMul = getMascotUserScaleMul();
  const combined = perf * userMul;
  const v = String(Math.min(Math.max(combined, 0.45), 2));
  if (root) root.style.setProperty('--mascot-scale', v);
  if (gm) gm.style.setProperty('--mascot-scale', v);
}

async function loadUpcomingWv() {
  const el = document.getElementById('upcoming-wv-list');
  if (!el) return;
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48*60*60*1000).toISOString();
    const list = await sb(`wiedervorlage?agent_id=eq.${currentUser?.id}&durum=eq.bekliyor&termin_zaman=lte.${soon}&order=termin_zaman.asc&limit=5`);
    if (!list?.length) { el.innerHTML=`<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">${escapeHtml(typeof t === 'function' ? t('dial.wv_empty') : '')}</div>`; return; }
    el.innerHTML = list.map(w => {
      const dt = new Date(w.termin_zaman);
      const timeStr = typeof mbFormatWall === 'function'
        ? mbFormatWall(w.termin_zaman, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : dt.toLocaleString(typeof mbLocale === 'function' ? mbLocale() : 'tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit', timeZone: (typeof MB_BUSINESS_TZ === 'string' ? MB_BUSINESS_TZ : 'Europe/Berlin')});
      const isOverdue = dt < now;
      const who = escapeHtml(w.nachname || w.telefon || '—');
      return `<div style="padding:5px 8px;background:var(--bg-3);border-radius:5px;border-left:3px solid ${isOverdue?'var(--red)':'var(--yellow)'};cursor:pointer;" onclick="openUpcomingCallback('${w.id}')">
<div style="font-weight:700;font-size:11px;color:${isOverdue?'var(--red)':'var(--text)'};">${who}</div>
<div style="font-size:10px;color:var(--text-3);">${escapeHtml(timeStr)}</div>
</div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">—</div>'; }
}

let _unfinalizedCallsOpen = false;
/** TEST gelen arama simülasyonu: dış numara sıklığı için sayaç */
let _inboundSimTickCount = 0;
/** Dış gelen (TEST) fluid vurgusu — proceed’den önce iptal */
let _inboundExternalCueTimer = null;
/** Gelen (TEST) kaydırmalı yanıtlama kartı açık */
let _inboundTestRingOpen = false;
let _inboundRingAutoDeclineTimer = null;
/** Gelen test bağlamı (sahiplik, aktarım, proceed) */
let _inboundTestCtx = null;
let _inboundTestXferPoll = null;

async function _fetchFirmAgentsForInboundTest(fid) {
  const now = Date.now();
  if (window._firmAgentsInboundCache && window._firmAgentsInboundTs && now - window._firmAgentsInboundTs < 45000) {
    return window._firmAgentsInboundCache;
  }
  const rows =
    (await sb(
      `users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&is_active=eq.true&select=id,name&order=name.asc`
    ).catch(() => [])) || [];
  window._firmAgentsInboundCache = rows;
  window._firmAgentsInboundTs = now;
  return rows;
}

/** RLS çoğu zaman sadece kendi satırını döndürür; test senaryoları için isimler (aktarım metni) */
function _testInboundAugmentOthers(others) {
  const base = Array.isArray(others) ? [...others] : [];
  if (base.length >= 2) return base;
  const extra = [
    { id: null, name: 'Ziya' },
    { id: null, name: 'Mehmet' },
  ];
  for (const e of extra) {
    if (base.length >= 2) break;
    if (!base.some((b) => (b.name || '') === e.name)) base.push(e);
  }
  return base;
}

function _maybeConsumeTestTransferInbox() {
  if (!_testMode || dialerStatus !== 'ready') return;
  if (_inboundTestRingOpen || _fakeCallActive || dialerStatus === 'on_call') return;
  if (!currentUser?.id) return;
  const k = `mb_test_xfer_${currentUser.id}`;
  let raw;
  try {
    raw = localStorage.getItem(k);
  } catch (e) {
    return;
  }
  if (!raw) return;
  let p;
  try {
    p = JSON.parse(raw);
  } catch (e) {
    try {
      localStorage.removeItem(k);
    } catch (e2) {}
    return;
  }
  if (Date.now() - (p.ts || 0) > 120000) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
    return;
  }
  try {
    localStorage.removeItem(k);
  } catch (e) {}
  const phone = String(p.phone || '').trim();
  if (!phone) return;
  const displayName = String(p.displayName || phone).trim();
  const parts = displayName.split(/\s+/);
  const contact = {
    id: `in-${Date.now()}`,
    phone,
    first_name: parts[0] || (typeof t === 'function' ? t('dial.contact_inbound') : 'Gelen'),
    last_name: parts.slice(1).join(' ') || (typeof t === 'function' ? t('dial.contact_test') : 'Test'),
    firm_id: currentUser.firm_id,
    campaign_id: selectedCampId || campaigns?.[0]?.id || null,
    status: 'pending',
    attempt_count: 0,
    is_inbound_test: true,
    _testScenario: 'forwarded',
    _testFromAgentName: p.fromAgent || '—',
  };
  void beginInboundTestCall({
    phone,
    displayName,
    contact,
    routeDetail: '',
    isExternalInbound: false,
  });
}

try {
  window.switchMimiTab = switchMimiTab;
  window.hideMimi = hideMimi;
  window.showMimi = showMimi;
} catch (e) {}
