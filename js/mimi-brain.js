// ─────────────────────────────────────────────
// Mimi Brain — deep mascot personality system
// Sleep · Drink · Stretch · Celebrate · Page bubbles · Time personality
// ─────────────────────────────────────────────

(function () {
  'use strict';

  // ── Constants ───────────────────────────────
  const IDLE_YAWN_MS    = 3 * 60 * 1000;   // 3 min → yawn
  const IDLE_SLEEP_MS   = 8 * 60 * 1000;   // 8 min → deep sleep
  const DRINK_MIN_MS    = 35 * 1000;
  const DRINK_MAX_MS    = 80 * 1000;
  const STRETCH_MIN_MS  = 90 * 1000;
  const STRETCH_MAX_MS  = 210 * 1000;
  const WANDER_TICK_MS  = 16;

  // ── Time-of-day profiles ─────────────────────
  // Returns hour 0-23
  function _hour() { return new Date().getHours(); }

  function _timeProfile() {
    const h = _hour();
    if (h >= 6  && h < 9)  return 'earlyMorning';
    if (h >= 9  && h < 12) return 'morning';
    if (h >= 12 && h < 14) return 'lunch';
    if (h >= 14 && h < 18) return 'afternoon';
    if (h >= 18 && h < 22) return 'evening';
    return 'night';
  }

  // Speed multiplier based on time-of-day (applied on top of user wander speed)
  const _TIME_SPEED = {
    earlyMorning: 1.1,
    morning:      1.8,
    lunch:        0.6,
    afternoon:    1.3,
    evening:      0.5,
    night:        0.3,
  };

  function _getTimeSpeedMult() {
    return _TIME_SPEED[_timeProfile()] ?? 1.0;
  }

  // ── Page-specific bubble pools ───────────────
  const _PAGE_MSGS = {
    dialer: {
      tr: [
        'Hazır olunca arama başlar.',
        'Müşteri kartı görüşme sırasında burada görünür.',
        'Sonucu kaydetmeden sonraki aramaya geçme.',
        'Kısa ve net konuş. Notu görüşme bitince yaz.',
      ],
      de: [
        'Der Anruf startet, sobald du bereit bist.',
        'Die Kundenkarte erscheint während des Gesprächs.',
        'Ergebnis speichern, bevor der nächste Anruf startet.',
        'Kurz und klar sprechen. Notiz nach dem Gespräch.',
      ],
    },
    dashboard: {
      tr: [
        'Günün özeti bu ekranda.',
        'Randevu ve çağrı sayıları güncel.',
        'Dönem filtresi rakamları değiştirir.',
      ],
      de: [
        'Die Tagesübersicht steht hier.',
        'Termine und Anrufe sind aktuell.',
        'Der Zeitraumfilter ändert die Zahlen.',
      ],
    },
    qc: {
      tr: [
        'Kalite kontrolü bekleyen kayıtlar burada.',
        'Sonucu eksiksiz işaretle.',
        'Eksik notu olan kaydı geri çevir.',
      ],
      de: [
        'Offene Qualitätsprüfungen stehen hier.',
        'Ergebnis vollständig markieren.',
        'Eintrag mit fehlender Notiz zurückgeben.',
      ],
    },
    contacts: {
      tr: [
        'Kişi listesi bu ekranda.',
        'Yüklemeden önce telefon tekrarını kontrol et.',
        'Hatalı satır içeri alınmaz.',
      ],
      de: [
        'Die Kontaktliste steht hier.',
        'Vor dem Import Telefonnummern auf Dubletten prüfen.',
        'Fehlerhafte Zeilen werden nicht übernommen.',
      ],
    },
    campaigns: {
      tr: [
        'Kampanya durumu ve kuyruk burada.',
        'Yalnızca aktif kampanyalar aramaya girer.',
        'Kuyruk bitince yeni liste yükle.',
      ],
      de: [
        'Kampagnenstatus und Warteschlange stehen hier.',
        'Nur aktive Kampagnen gehen in die Wahl.',
        'Neue Liste laden, wenn die Warteschlange leer ist.',
      ],
    },
    settings: {
      tr: [
        'Değişiklikten sonra kaydet.',
        'Firma ayarı tüm ekibi etkiler.',
        'Kayıtlı sonuç adları dialer kutularına yansır.',
      ],
      de: [
        'Nach der Änderung speichern.',
        'Firmeneinstellungen gelten für das ganze Team.',
        'Gespeicherte Ergebnisnamen erscheinen im Dialer.',
      ],
    },
    performance: {
      tr: [
        'Personel sonuçları bu ekranda.',
        'Dönem filtresi sayıları değiştirir.',
        'Randevu ve çağrı ayrı kolonlarda.',
      ],
      de: [
        'Mitarbeiterergebnisse stehen hier.',
        'Der Zeitraumfilter ändert die Zahlen.',
        'Termine und Anrufe stehen in getrennten Spalten.',
      ],
    },
    supervisor: {
      tr: [
        'Canlı kat açık: kim konuşuyor, ne kadar sürdü, kiminle.',
        'Süreler her saniye ilerliyor.',
        'Mola ve sonuç satırları da bu ekranda.',
      ],
      de: [
        'Live-Floor: wer spricht, wie lange, mit wem.',
        'Die Dauer läuft jede Sekunde weiter.',
        'Pause und Nacharbeit siehst du hier auch.',
      ],
    },
    wiedervorlage: {
      tr: [
        'Geri arama listesi burada.',
        'Vadesi gelen kaydı önce ara.',
        'Tarih ve notu aramadan önce oku.',
      ],
      de: [
        'Die Rückrufliste steht hier.',
        'Fällige Einträge zuerst anrufen.',
        'Datum und Notiz vor dem Anruf lesen.',
      ],
    },
    takvim: {
      tr: [
        'Randevu takvimi bu ekranda.',
        'Dolu slota yeni kayıt eklenmez.',
        'Taşıma öncesi kampanyayı kontrol et.',
      ],
      de: [
        'Der Terminkalender steht hier.',
        'Belegte Slots nehmen keinen neuen Eintrag.',
        'Vor dem Verschieben die Kampagne prüfen.',
      ],
    },
    field: {
      tr: [
        'Saha ekibi yolda. Posta kodu ve şehir tabloda.',
        'İptal edilen görevler ayrı sayılır.',
        'Randevu tarihi ile saha sonucu yan yana.',
      ],
      de: [
        'Außendienst unterwegs. PLZ und Ort stehen in der Tabelle.',
        'Stornierte Aufgaben zählen extra.',
        'Terminzeit und Feldergebnis nebeneinander.',
      ],
    },
    fieldops: {
      tr: [
        'Saha takibi: kimde hangi randevu var.',
        'Posta kodu, şehir ve randevu tarihi burada.',
        'İptal edilenler de sayıya dahil.',
      ],
      de: [
        'Feldübersicht: welcher Termin bei wem liegt.',
        'PLZ, Ort und Terminzeit auf einen Blick.',
        'Stornos zählen mit.',
      ],
    },
    jobmarket: {
      tr: [
        'Açık işler bu listede.',
        'İlan durumu ve süre burada görünür.',
        'Başvurudan önce şartları oku.',
      ],
      de: [
        'Offene Aufträge stehen in dieser Liste.',
        'Status und Frist sind hier sichtbar.',
        'Bedingungen vor der Bewerbung lesen.',
      ],
    },
    leave: {
      tr: [
        'İzin talepleri bu ekranda.',
        'Onay bekleyen kaydı kontrol et.',
      ],
      de: [
        'Urlaubsanträge stehen hier.',
        'Offene Freigaben prüfen.',
      ],
    },
    muhasebe: {
      tr: [
        'Euro maaşın altında lira karşılığı da duruyor.',
        'Kur canlı geliyor. Yenile dersen tazelenir.',
        'Muhasebe şeffaf olunca herkes aynı sayıyı görür.',
      ],
      de: [
        'Unter dem Euro-Lohn steht auch der Lira-Gegenwert.',
        'Der Kurs kommt live. Aktualisieren holt ihn neu.',
        'Transparente Buchhaltung, gleiche Zahlen für alle.',
      ],
    },
    competition: {
      tr: [
        'Aylık sıralama bu ekranda.',
        'Sıra, dönem kapandığında güncellenir.',
      ],
      de: [
        'Die Monatsrangliste steht hier.',
        'Der Rang aktualisiert sich zum Periodenende.',
      ],
    },
  };

  const _DEFAULT_MSGS = {
    tr: [
      'İşlem için hazır.',
      'Menüden ilgili sayfaya geç.',
    ],
    de: [
      'Bereit für die nächste Aktion.',
      'Im Menü zur passenden Seite wechseln.',
    ],
  };

  // ── State ────────────────────────────────────
  let _currentPage   = '';
  let _lastActivity  = Date.now();
  let _isSleeping    = false;
  let _isYawning     = false;
  let _drinkTimer    = null;
  let _stretchTimer  = null;
  let _idleCheckInterval = null;
  let _timeSpeedInterval = null;
  let _wiredNavigate = false;

  // ── Helpers ──────────────────────────────────
  function _lang() { return typeof currentLang !== 'undefined' ? currentLang : 'tr'; }

  function _hidden() { return typeof isMimiHidden === 'function' && isMimiHidden(); }
  function _bubbleMuted() { return typeof isMimiBubbleMuted === 'function' && isMimiBubbleMuted(); }

  function _bubble(msg) {
    if (_hidden() || _bubbleMuted()) return;
    if (typeof _showCustEmptyBubbleMsg === 'function') _showCustEmptyBubbleMsg(msg);
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

  // Wander speed: apply time-of-day mult to base variable
  function _applyTimeWanderSpeed() {
    const mult = _getTimeSpeedMult();
    if (typeof _wanderSpeedMult !== 'undefined') {
      // Only nudge if not already overridden by another mood
      if (!_isSleeping) window._wanderSpeedMult = mult;
    }
  }

  // ── Activity tracking ────────────────────────
  function _resetActivity() {
    _lastActivity = Date.now();
    if (_isSleeping) _wakeUp();
    else if (_isYawning) _cancelYawn();
  }

  function _wireActivity() {
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => {
      window.addEventListener(ev, _resetActivity, { passive: true });
    });
  }

  // ── Sleep / Yawn system ──────────────────────
  function _yawn() {
    if (_hidden() || _isSleeping) return;
    _isYawning = true;
    _setMood('cust-empty--mascot-yawn', 'yawn');
    const tr = _lang() === 'tr';
    _bubble(tr ? 'Bir süredir işlem yok.' : 'Seit einer Weile keine Aktion.');
    if (typeof _wanderSpeedMult !== 'undefined') window._wanderSpeedMult = 0.4;
  }

  function _cancelYawn() {
    _isYawning = false;
    _clearMood();
    _applyTimeWanderSpeed();
  }

  function _goSleep() {
    if (_hidden()) return;
    _isSleeping = true;
    _isYawning  = false;
    _setMood('cust-empty--break', 'break');
    if (typeof _wanderSpeedMult !== 'undefined') window._wanderSpeedMult = 0.1;
    if (typeof _wanderPauseUntil !== 'undefined') window._wanderPauseUntil = performance.now() + 99999999;
    const tr = _lang() === 'tr';
    _bubble(tr ? 'Ekran beklemede.' : 'Ansicht wartet.');
  }

  function _wakeUp() {
    if (!_isSleeping) return;
    _isSleeping = false;
    _clearMood();
    if (typeof _wanderPauseUntil !== 'undefined') window._wanderPauseUntil = 0;
    _applyTimeWanderSpeed();
    // Stretch after waking
    setTimeout(() => _doStretch(true), 600);
  }

  function _checkIdle() {
    const idle = Date.now() - _lastActivity;
    if (_isSleeping) return;
    if (idle >= IDLE_SLEEP_MS) { _goSleep(); return; }
    if (idle >= IDLE_YAWN_MS && !_isYawning) { _yawn(); }
  }

  // ── Drink system ─────────────────────────────
  function _doDrink() {
    if (_hidden() || _isSleeping) { _scheduleDrink(); return; }
    const tr = _lang() === 'tr';
    _setMood('cust-empty--mascot-drink', 'drink');
    const msgs = tr
      ? ['Kısa ara. Sıradaki aramaya geçebilirsin.', 'Kayıtlar güncel kalsın.', 'Müşteri kartını kontrol et, sonra ara.']
      : ['Kurze Pause. Der nächste Anruf kann starten.', 'Einträge aktuell halten.', 'Kundenkarte prüfen, dann wählen.'];
    _bubble(_pick(msgs));
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

  // ── Stretch system ───────────────────────────
  function _doStretch(afterSleep = false) {
    if (_hidden() || _isSleeping) { if (!afterSleep) _scheduleStretch(); return; }
    _setMood('cust-empty--mascot-stretch', 'stretch');
    const tr = _lang() === 'tr';
    const msgs = afterSleep
      ? (tr
          ? ['Ekran tekrar aktif.', 'Aramaya devam edebilirsin.']
          : ['Ansicht ist wieder aktiv.', 'Du kannst weiterwählen.'])
      : (tr
          ? ['Kısa ara bitti.', 'Sıradaki kayıt hazır.']
          : ['Kurze Pause beendet.', 'Nächster Eintrag ist bereit.']);
    _bubble(_pick(msgs));
    if (typeof _wanderSpeedMult !== 'undefined') window._wanderSpeedMult = 2.2;
    setTimeout(() => {
      _clearMood();
      _applyTimeWanderSpeed();
      _scheduleStretch();
    }, 2200);
  }

  function _scheduleStretch() {
    clearTimeout(_stretchTimer);
    const delay = STRETCH_MIN_MS + Math.random() * (STRETCH_MAX_MS - STRETCH_MIN_MS);
    _stretchTimer = setTimeout(_doStretch, delay);
  }

  // ── Celebrate ────────────────────────────────
  function _mimiCelebrate() {
    if (_hidden()) return;
    _resetActivity();
    _setMood('cust-empty--mascot-celebrate', 'celebrate');
    if (typeof _wanderSpeedMult !== 'undefined') window._wanderSpeedMult = 3.0;
    if (typeof _wanderPauseUntil !== 'undefined') window._wanderPauseUntil = 0;
    const tr = _lang() === 'tr';
    const msgs = tr
      ? ['Randevu kaydedildi.', 'Termin oluşturuldu.', 'Randevu kaydı tamam.']
      : ['Termin gespeichert.', 'Termin angelegt.', 'Termineintrag abgeschlossen.'];
    _bubble(_pick(msgs));
    setTimeout(() => {
      _clearMood();
      _applyTimeWanderSpeed();
    }, 2500);
  }
  window._mimiCelebrate = _mimiCelebrate;

  // ── Page-aware bubbles ───────────────────────
  function _mimiOnNavigate(page) {
    _currentPage = page;
    _resetActivity();
    // 40% chance to show page bubble on nav
    if (page === 'settings' || Math.random() > 0.4 || _hidden() || _bubbleMuted()) return;
    const pool = _PAGE_MSGS[page];
    const lang = _lang();
    const msgs = pool ? (pool[lang] || pool.tr) : (_DEFAULT_MSGS[lang] || _DEFAULT_MSGS.tr);
    setTimeout(() => _bubble(_pick(msgs)), 1200);
  }
  window._mimiOnNavigate = _mimiOnNavigate;

  // ── Hook navigate() ──────────────────────────
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

  // ── Time-speed update (every 5 min) ──────────
  function _startTimeSpeedUpdater() {
    clearInterval(_timeSpeedInterval);
    _timeSpeedInterval = setInterval(_applyTimeWanderSpeed, 5 * 60 * 1000);
    _applyTimeWanderSpeed();
  }

  // ── Boot ─────────────────────────────────────
  function _boot() {
    _wireActivity();
    _hookNavigate();
    _startTimeSpeedUpdater();
    _scheduleDrink();
    _scheduleStretch();

    _idleCheckInterval = setInterval(_checkIdle, 15000);

    // Greet on first load
    if (!_hidden() && !_bubbleMuted()) {
      setTimeout(() => {
        const h = _hour();
        const tr = _lang() === 'tr';
        let greeting;
        if (h < 12)       greeting = tr ? 'Günaydın. Arama ekranı hazır.' : 'Guten Morgen. Der Dialer ist bereit.';
        else if (h < 18)  greeting = tr ? 'İyi günler. Kaldığın kayıttan devam edebilirsin.' : 'Guten Tag. Du kannst beim letzten Eintrag weitermachen.';
        else               greeting = tr ? 'İyi akşamlar. Gün sonu kayıtlarını kontrol et.' : 'Guten Abend. Tageseinträge prüfen.';
        _bubble(greeting);
      }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
})();
