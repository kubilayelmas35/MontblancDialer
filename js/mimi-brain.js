// ─────────────────────────────────────────────
// Mimi Brain — greeting, break, celebrate, page facts
// ─────────────────────────────────────────────

(function () {
  'use strict';

  const IDLE_YAWN_MS    = 3 * 60 * 1000;
  const DRINK_MIN_MS    = 35 * 1000;
  const DRINK_MAX_MS    = 80 * 1000;
  const STRETCH_MIN_MS  = 90 * 1000;
  const STRETCH_MAX_MS  = 210 * 1000;

  function _hour() {
    const tz = typeof getMascotClockTz === 'function' ? getMascotClockTz() : 'Europe/Berlin';
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    return Number.isFinite(h) ? h : new Date().getHours();
  }

  function _lang() { return typeof currentLang !== 'undefined' ? currentLang : 'tr'; }

  let _currentPage   = '';
  let _lastActivity  = Date.now();
  let _drinkTimer    = null;
  let _stretchTimer  = null;
  let _idleCheckInterval = null;
  let _wiredNavigate = false;

  function _hidden() { return typeof isMimiHidden === 'function' && isMimiHidden(); }
  function _speak(kind) { return typeof mascotSpeechOn !== 'function' || mascotSpeechOn(kind); }

  function _bubble(msg, kind) {
    if (!msg || _hidden() || !_speak(kind)) return;
    if (typeof _showCustEmptyBubbleMsg === 'function') _showCustEmptyBubbleMsg(msg, kind);
  }

  function _pick(pool) { return pool[Math.floor(Math.random() * pool.length)]; }

  function _setCustEmptyClass(cls) {
    const root = document.getElementById('cust-empty');
    if (!root) return;
    root.classList.remove(
      'cust-empty--break',
      'cust-empty--mascot-angry',
      'cust-empty--mascot-bored',
      'cust-empty--mascot-eat',
      'cust-empty--mascot-drink',
      'cust-empty--mascot-yawn',
      'cust-empty--mascot-stretch',
      'cust-empty--mascot-celebrate',
    );
    if (cls) root.classList.add(cls);
    if (typeof syncGlobalMascotMoodFromCustEmpty === 'function') syncGlobalMascotMoodFromCustEmpty();
  }

  function _setGlobalMood(mood) {
    const gm = document.getElementById('global-mascot');
    if (!gm) return;
    gm.setAttribute('data-mood', mood || '');
  }

  function _setMood(custEmptyCls, globalMood) {
    _setCustEmptyClass(custEmptyCls);
    _setGlobalMood(globalMood || '');
  }

  function _clearMood() {
    _setCustEmptyClass(null);
    _setGlobalMood('');
  }

  function _status() {
    return typeof dialerStatus !== 'undefined' ? dialerStatus : '';
  }

  function _onLine() {
    const st = _status();
    return st === 'calling' || st === 'on_call' || st === 'wrapping';
  }

  function _onBreak() {
    return _status() === 'break';
  }

  function _setIdle(on) {
    document.querySelectorAll('.mascot-theme-root, #cust-empty').forEach((el) => {
      if (on) el.setAttribute('data-mascot-idle', '1');
      else el.removeAttribute('data-mascot-idle');
    });
  }

  function _quietForCall() {
    const gm = document.getElementById('global-mascot');
    const mood = gm?.getAttribute('data-mood') || '';
    const celebrating = mood === 'celebrate' || gm?.classList.contains('global-mascot--celebrate');
    if (!celebrating) _clearMood();
    _setIdle(false);
    if (typeof _wanderSpeedMult !== 'undefined' && !celebrating) _wanderSpeedMult = 1;
    if (gm?.classList.contains('global-mascot--aria')) return;
    const bubble = document.getElementById('cust-empty-bubble');
    if (bubble && !celebrating) bubble.style.display = 'none';
  }
  window.mbMascotQuietForCall = _quietForCall;

  function _resetActivity() {
    _lastActivity = Date.now();
    _setIdle(false);
  }

  function _wireActivity() {
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => {
      window.addEventListener(ev, _resetActivity, { passive: true });
    });
  }

  function _checkIdle() {
    if (_hidden() || _onLine()) {
      _setIdle(false);
      return;
    }
    _setIdle(Date.now() - _lastActivity >= IDLE_YAWN_MS);
  }

  function _doDrink() {
    if (_hidden() || _onLine() || !_onBreak()) { _scheduleDrink(); return; }
    const tr = _lang() === 'tr';
    _setMood('cust-empty--mascot-drink', 'drink');
    const msgs = tr
      ? ['Mola. Kısa bir su arası.', 'Mola sürüyor. Dönünce sıradaki kayıt hazır.']
      : ['Pause. Kurzer Schluck.', 'Pause läuft. Der nächste Eintrag wartet.'];
    _bubble(_pick(msgs), 'break');
    setTimeout(() => {
      _clearMood();
      _scheduleDrink();
    }, 2800);
  }

  function _scheduleDrink() {
    clearTimeout(_drinkTimer);
    const delay = DRINK_MIN_MS + Math.random() * (DRINK_MAX_MS - DRINK_MIN_MS);
    _drinkTimer = setTimeout(_doDrink, delay);
  }

  function _doStretch() {
    if (_hidden() || _onLine() || !_onBreak()) { _scheduleStretch(); return; }
    _setMood('cust-empty--mascot-stretch', 'stretch');
    const tr = _lang() === 'tr';
    const msgs = tr
      ? ['Mola. Kısa bir esneme.', 'Mola bitince aramaya dönersin.']
      : ['Pause. Kurzes Strecken.', 'Nach der Pause geht der Anruf weiter.'];
    _bubble(_pick(msgs), 'break');
    if (typeof _wanderSpeedMult !== 'undefined') _wanderSpeedMult = 2.2;
    setTimeout(() => {
      _clearMood();
      if (typeof _wanderSpeedMult !== 'undefined') _wanderSpeedMult = 1;
      _scheduleStretch();
    }, 2200);
  }

  function _scheduleStretch() {
    clearTimeout(_stretchTimer);
    const delay = STRETCH_MIN_MS + Math.random() * (STRETCH_MAX_MS - STRETCH_MIN_MS);
    _stretchTimer = setTimeout(_doStretch, delay);
  }

  function _mimiCelebrate() {
    if (_hidden()) return;
    _resetActivity();
    _setMood('cust-empty--mascot-celebrate', 'celebrate');
    if (typeof _wanderSpeedMult !== 'undefined') _wanderSpeedMult = 3.0;
    if (typeof _wanderPauseUntil !== 'undefined') _wanderPauseUntil = 0;
    const tr = _lang() === 'tr';
    const msgs = tr
      ? ['Randevu kaydedildi.', 'Termin oluşturuldu.', 'Randevu kaydı tamam.']
      : ['Termin gespeichert.', 'Termin angelegt.', 'Termineintrag abgeschlossen.'];
    _bubble(_pick(msgs), 'appt');
    setTimeout(() => {
      _clearMood();
      if (typeof _wanderSpeedMult !== 'undefined') _wanderSpeedMult = 1;
    }, 2500);
  }
  window._mimiCelebrate = _mimiCelebrate;

  function _countRows(sel) {
    return [...document.querySelectorAll(sel)].filter((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length === 1 && cells[0].colSpan > 1) return false;
      return true;
    }).length;
  }

  function _pageFact(page) {
    const tr = _lang() === 'tr';
    const snap = window._dialerPerfSnapshot || {};
    const tdC = Number(snap.todayCalls) || Number(document.getElementById('my-calls')?.textContent) || 0;
    const tdA = Number(snap.todayAppts) || Number(document.getElementById('my-appt')?.textContent) || 0;
    if (page === 'dashboard' || page === 'performance' || page === 'stats') {
      if (!tdC && !tdA) return '';
      return tr ? `Bugün ${tdC} çağrı, ${tdA} randevu.` : `Heute ${tdC} Anrufe, ${tdA} Termine.`;
    }
    if (page === 'dialer') {
      const st = _status();
      if (st === 'ready') return tr ? 'Hazırsın. Sıradaki arama bekleniyor.' : 'Bereit. Der nächste Anruf steht an.';
      if (st === 'break') return tr ? 'Moladasın.' : 'Pause läuft.';
      return '';
    }
    if (page === 'wiedervorlage') {
      const overdue = Number(document.getElementById('wv-overdue-count')?.textContent) || 0;
      const rows = _countRows('#wv-tbody tr');
      if (overdue > 0) return tr ? `${overdue} geri aramanın vakti geçmiş.` : `${overdue} Rückrufe sind überfällig.`;
      if (rows > 0) return tr ? `Listede ${rows} geri arama var.` : `${rows} Rückrufe in der Liste.`;
      return '';
    }
    if (page === 'takvim') {
      const slots = [...document.querySelectorAll('#page-takvim .takvim-slot-el')];
      if (!slots.length) return '';
      const empty = slots.filter((el) => /^\s*(Boş|Leer)\b/.test(el.textContent || '')).length;
      const full = Math.max(0, slots.length - empty);
      return tr ? `Bu görünümde ${empty} boş, ${full} dolu yer.` : `In dieser Ansicht ${empty} frei, ${full} belegt.`;
    }
    if (page === 'campaigns') {
      const n = document.querySelectorAll('#camp-grid > *').length;
      if (!n) return '';
      return tr ? `${n} kampanya listeleniyor.` : `${n} Kampagnen in der Liste.`;
    }
    if (page === 'qc') {
      const n = _countRows('#qc-tbody tr');
      if (!n) return '';
      return tr ? `Kalite kontrolünde ${n} kayıt var.` : `${n} Einträge in der Qualitätsprüfung.`;
    }
    if (page === 'history' || page === 'my') {
      const n = _countRows('#my-tbody tr');
      if (!n) return '';
      return tr ? `Geçmişte ${n} satır var.` : `${n} Zeilen im Verlauf.`;
    }
    return '';
  }

  function _mimiOnNavigate(page) {
    _currentPage = page;
    _resetActivity();
    if (page === 'settings' || _onLine() || _hidden() || !_speak('page')) return;
    const line = _pageFact(page);
    if (!line) return;
    setTimeout(() => _bubble(line, 'page'), 1200);
  }
  window._mimiOnNavigate = _mimiOnNavigate;

  function _hookNavigate() {
    if (_wiredNavigate) return;
    _wiredNavigate = true;
    const orig = window.navigate;
    if (typeof orig !== 'function') return;
    window.navigate = function (page, ...rest) {
      _mimiOnNavigate(page);
      return orig.call(this, page, ...rest);
    };
  }

  function _boot() {
    _wireActivity();
    _hookNavigate();
    _scheduleDrink();
    _scheduleStretch();
    _idleCheckInterval = setInterval(_checkIdle, 15000);
    if (_hidden() || _onLine() || !_speak('greet')) return;
    setTimeout(() => {
      const h = _hour();
      const tr = _lang() === 'tr';
      let greeting;
      if (h < 12) greeting = tr ? 'Günaydın. Arama ekranı hazır.' : 'Guten Morgen. Der Dialer ist bereit.';
      else if (h < 18) greeting = tr ? 'İyi günler. Kaldığın kayıttan devam edebilirsin.' : 'Guten Tag. Du kannst beim letzten Eintrag weitermachen.';
      else greeting = tr ? 'İyi akşamlar. Gün sonu kayıtlarını kontrol et.' : 'Guten Abend. Tageseinträge prüfen.';
      _bubble(greeting, 'greet');
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
})();
