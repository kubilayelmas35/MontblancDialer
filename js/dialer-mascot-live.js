let _globalMascotResizeWired = false;
let _lastMascotCheerSec = -1;
let _mascotNotifMorphT = null;
let _mascotDragState = null;
let _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
let _wanderRaf = null;
let _wanderCur = { x: 0, y: 0 };
let _wanderTgt = { x: 0, y: 0 };
let _wanderPauseUntil = 0;
let _wanderSpeedMult = 1;
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
    variantEl.textContent =
      rawVariant === 'random'
        ? (typeof tReplace === 'function' ? tReplace('dial.mimi_variant_random', { label: appliedLabel }) : (isDe ? `Zufall (${appliedLabel})` : `Rastgele (${appliedLabel})`))
        : appliedLabel;
  }
  const muteBtn = document.getElementById('mimi-bubble-mute-btn');
  const muteLbl = document.getElementById('mimi-bubble-mute-label');
  if (muteLbl) {
    muteLbl.textContent = isMimiBubbleMuted()
      ? (typeof t === 'function' ? t('dial.mimi_mute_show') : 'Balonları aç')
      : (typeof t === 'function' ? t('dial.mimi_mute_hide') : 'Balon konuşmasını kapat');
  }
  if (muteBtn) muteBtn.setAttribute('aria-pressed', isMimiBubbleMuted() ? 'true' : 'false');
  if (noteEl) {
    noteEl.textContent =
      typeof tReplace === 'function'
        ? tReplace('dial.mimi_note_age', { coef: getMascotAgeCoeff().toFixed(1) })
        : (isDe
          ? `Mimi altert mit dem ${getMascotAgeCoeff().toFixed(1)}-fachen deiner Gesprächszeit. Je ruhiger du bleibst, desto stärker wird sie.`
          : `Çağrı süresinin ${getMascotAgeCoeff().toFixed(1)} katı kadar Mimi yaş alıyor. Ne kadar sakin kalırsan o kadar büyüyor.`);
  }
  const gm = document.getElementById('global-mascot');
  const moodKey = gm?.getAttribute('data-mood') || '';
  const sad = gm?.classList.contains('global-mascot--sad');
  const cel = gm?.classList.contains('global-mascot--celebrate');
  const moodLabel = cel
    ? (typeof t === 'function' ? t('dial.mimi_mood_celebrate') : 'Kutlama')
    : sad
      ? (typeof t === 'function' ? t('dial.mimi_mood_sad') : 'Üzgün')
      : moodKey === 'break'
        ? (typeof t === 'function' ? t('dial.mimi_mood_break') : 'Uykulu')
        : moodKey === 'angry'
          ? (typeof t === 'function' ? t('dial.mimi_mood_angry') : 'Gergin')
          : moodKey === 'bored'
            ? (typeof t === 'function' ? t('dial.mimi_mood_bored') : 'Sıkıldı')
            : moodKey === 'eat'
              ? (typeof t === 'function' ? t('dial.mimi_mood_eat') : 'Mutlu')
              : (typeof t === 'function' ? t('dial.mimi_mood_calm') : 'Sakin');
  if (moodEl) moodEl.textContent = moodLabel;
  const heat = Number(document.getElementById('global-mascot')?.style.getPropertyValue('--mascot-call-heat') || '0') || 0;
  if (energyEl) energyEl.textContent = `${Math.round(heat * 100)}%`;
  if (moodNoteEl) {
    moodNoteEl.textContent = sad
      ? (typeof t === 'function' ? t('dial.mimi_mood_note_sad') : (isDe ? 'Kurz durchatmen… der nächste wird besser.' : 'Bir sonraki arama için minik bir nefes… Hazırsın.'))
      : cel
        ? (typeof t === 'function' ? t('dial.mimi_mood_note_celebrate') : (isDe ? 'Mit dieser Energie läuft’s!' : 'Bu enerjiyle çok iyi gidiyoruz!'))
        : (typeof t === 'function' ? t('dial.mimi_mood_note_default') : (isDe ? 'Ruhig und fokussiert.' : 'Sakin ve odaklı — en iyi hâlim.'));
  }
  const p = window._dialerPerfSnapshot || {};
  if (tCallsEl) tCallsEl.textContent = String(Number(p.todayCalls) || 0);
  if (tApptEl) tApptEl.textContent = String(Number(p.todayAppts) || 0);
  if (mApptEl) mApptEl.textContent = String(Number(p.monthlyAppts) || 0);
  if (statsNoteEl) {
    statsNoteEl.textContent = typeof t === 'function' ? t('dial.mimi_stats_note') : (isDe ? 'Statistiken werden aus dem Performance-Panel aktualisiert.' : 'İstatistikler performans panelinden güncellenir.');
  }
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
    setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x, y }));
  });
  mascot.addEventListener('pointerup', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const wasMove = _mascotDragState.moved;
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (wasMove) {
      if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
      else _syncGlobalMascotWanderOnly();
    } else {
      const bubble = document.getElementById('cust-empty-bubble');
      if (bubble && bubble.style.display !== 'none') {
        bubble.style.display = 'none';
        _syncGlobalMascotWanderOnly();
        return;
      }
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

function _pickWanderTarget(gm) {
  const b = _mascotWanderBoundsFromViewport(gm);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) {
    _wanderTgt.x = Number.isFinite(_wanderCur.x) ? _wanderCur.x : 0;
    _wanderTgt.y = Number.isFinite(_wanderCur.y) ? _wanderCur.y : 0;
    return;
  }
  if (w < 1e-4 && h < 1e-4) {
    _wanderTgt.x = b.minX;
    _wanderTgt.y = b.minY;
    return;
  }
  const wanderPct = getMascotWanderPct();
  /** Düşük gezinmede hedef yarıçapı küçülür; hareket alanı büyük olsa bile “sürekli köşelere” gitmez. */
  const wf = Math.pow(Math.max(0, wanderPct) / 100, 1.22);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const halfWx = w / 2;
  const halfHy = h / 2;
  _wanderTgt.x = midX + (Math.random() * 2 - 1) * halfWx * wf;
  _wanderTgt.y = midY + (Math.random() * 2 - 1) * halfHy * wf;
  // Hedefe vardıktan sonra rastgele bekle (0.8–5 sn) ve rastgele hızla git
  _wanderPauseUntil = performance.now() + 800 + Math.random() * 4200;
  _wanderSpeedMult = 0.35 + Math.random() * 1.65;
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
  if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) {
    if (performance.now() < _wanderPauseUntil) {
      _wanderRaf = requestAnimationFrame(_wanderFrame);
      return;
    }
    _pickWanderTarget(gm);
  }
  // Ara sıra rastgele yön değiştir (%0.3 şans / frame)
  if (Math.random() < 0.003) _pickWanderTarget(gm);
  const bounds = _mascotWanderBoundsFromViewport(gm);
  const speedPct = getMascotWanderSpeedPct();
  const speedT = Math.max(0, speedPct) / 100;
  const speedK = 0.006 + speedT * 0.14;
  const wanderT = Math.max(0, Math.min(100, pct)) / 100;
  const step = speedK * (0.12 + wanderT * 0.88) * 0.09 * Math.pow(wanderT, 1.35) * _wanderSpeedMult;
  _wanderCur.x += dx * step;
  _wanderCur.y += dy * step;
  _wanderCur.x = Math.min(bounds.maxX, Math.max(bounds.minX, _wanderCur.x));
  _wanderCur.y = Math.min(bounds.maxY, Math.max(bounds.minY, _wanderCur.y));
  if (!Number.isFinite(_wanderCur.x)) _wanderCur.x = 0;
  if (!Number.isFinite(_wanderCur.y)) _wanderCur.y = 0;
  gm.style.setProperty('--gm-wx', `${_wanderCur.x.toFixed(2)}px`);
  gm.style.setProperty('--gm-wy', `${_wanderCur.y.toFixed(2)}px`);
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble && bubble.style.display === 'block') {
    const pad = 10;
    let shift = 0;
    const br = bubble.getBoundingClientRect();
    if (br.left < pad) shift += pad - br.left;
    if (br.right > window.innerWidth - pad) shift -= br.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  }
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

function _placeGlobalMascotAtRect(rect) {
  const gm = document.getElementById('global-mascot');
  if (!gm || !rect) return;
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rect.width < 0.5) {
    const ax = document.getElementById('sb-mascot-anchor') || document.getElementById('tb-mascot-anchor');
    const r2 = ax ? ax.getBoundingClientRect() : null;
    if (r2 && Number.isFinite(r2.left) && r2.width >= 0.5) {
      cx = r2.left + r2.width / 2;
      cy = r2.top + r2.height / 2;
    } else {
      cx = Math.max(40, (Number(window.innerWidth) || 800) * 0.5);
      cy = 36;
    }
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
  gm.classList.toggle('global-mascot--sidebar', !!(anchor && anchor.id === 'sb-mascot-anchor'));
  gm.classList.toggle('global-mascot--muted', isMimiHidden());
  _wireGlobalMascotInteractions();
  if (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif')) {
    gm.classList.add('global-mascot--placed');
    return;
  }
  if (isMimiHidden()) {
    const logo = document.querySelector('.tb-logo');
    const fallback = { left: 80, top: 28, width: 36, height: 34 };
    const lr = logo
      ? logo.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : fallback;
    _placeGlobalMascotAtRect({ left: lr.left + lr.width + 22, top: lr.top + 16, width: 18, height: 18 });
    gm.classList.remove('global-mascot--dialer');
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
  if (custom) {
    gm.style.left = `${custom.x}px`;
    gm.style.top = `${custom.y}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    _placeGlobalMascotAtRect(rect);
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else {
    const vw = Number(window.innerWidth) || 800;
    _placeGlobalMascotAtRect({ left: vw * 0.5 - 18, top: 52, width: 36, height: 34 });
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar', 'global-mascot--placed');
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
  _lastMascotCheerSec = hit;
  const idx = Math.floor(Math.random() * 9);
  const msg = typeof t === 'function' ? t(`dial.cheer.${idx}`) : '';
  _showCustEmptyBubbleMsg(msg || '…');
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

function _showCustEmptyBubbleMsg(msg) {
  const bubble = document.getElementById('cust-empty-bubble');
  if (!bubble || isMimiHidden() || isMimiBubbleMuted()) return;
  bubble.textContent = formatMascotSpokenLine(msg);
  bubble.style.setProperty('--bubble-shift-x', '0px');
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
  const clampBubble = () => {
    const r = bubble.getBoundingClientRect();
    const pad = 10;
    let shift = 0;
    if (r.left < pad) shift += pad - r.left;
    if (r.right > window.innerWidth - pad) shift -= r.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(clampBubble);
  });
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
    typeof tReplace === 'function' ? tReplace('dial.hint_notif', { n }) : `Bildirim (${n})`
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
    typeof tReplace === 'function' ? tReplace('dial.hint_chat', { who }) : `Chat: ${who}`
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
  const periodGoal = goalBase * goalFactor;
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
  _showCustEmptyBubbleMsg(msg || '…');
}

function startCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  if (isMimiHidden() || isMimiBubbleMuted()) return;
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
  const monthlyGoal = Math.max(1, Number(_dailyGoal) || 5) * 22;
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
      return `<div style="padding:5px 8px;background:var(--bg-3);border-radius:5px;border-left:3px solid ${isOverdue?'var(--red)':'var(--yellow)'};" onclick="navigate('wiedervorlage')">
<div style="font-weight:700;font-size:11px;color:${isOverdue?'var(--red)':'var(--text)'};">${w.nachname||w.telefon}</div>
<div style="font-size:10px;color:var(--text-3);">${timeStr}</div>
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
