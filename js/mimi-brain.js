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

  // Drink label depends on time
  function _drinkForTime() {
    const h = _hour();
    if (h < 10) return { tr: '☕', de: '☕' };
    if (h < 14) return { tr: '🧋', de: '🧋' };
    if (h < 18) return { tr: '🧃', de: '🧃' };
    return { tr: '🫖', de: '🫖' };
  }

  // ── Page-specific bubble pools ───────────────
  const _PAGE_MSGS = {
    dialer: {
      tr: [
        'Hazır mısın? Bir termin seni bekliyor!',
        'Bugün harika bir gün — başlayalım!',
        'Her çağrı yeni bir şans.',
        'Ritmin çok güzel, böyle devam!',
        'Telefonun sıcak, müşteri yakın 🔥',
      ],
      de: [
        'Bereit? Ein Termin wartet auf dich!',
        'Heute wird ein guter Tag — los geht\'s!',
        'Jeder Anruf ist eine neue Chance.',
        'Schöner Rhythmus, weiter so!',
        'Das Telefon ist warm, der Kunde nah 🔥',
      ],
    },
    dashboard: {
      tr: [
        'Harika sayılar! Çok iyi iş çıkarmışsın.',
        'Grafikler seni gülümsettirsin 📈',
        'Takım ruhunu hissediyorum!',
        'Bugünkü rakamlar müthiş gözüküyor.',
      ],
      de: [
        'Tolle Zahlen — sehr gute Arbeit!',
        'Lass die Grafiken dich zum Lächeln bringen 📈',
        'Ich spüre den Teamgeist!',
        'Die heutigen Zahlen sehen fantastisch aus.',
      ],
    },
    qc: {
      tr: [
        'Kalite kontrolü — en önemli adım!',
        'Her detay önemli, dikkatli ol 🔍',
        'Mükemmellik burada başlıyor.',
        'Harika bir kalite gözün var!',
      ],
      de: [
        'Qualitätskontrolle — der wichtigste Schritt!',
        'Jedes Detail zählt, sei aufmerksam 🔍',
        'Hier beginnt die Perfektion.',
        'Du hast ein tolles Qualitätsauge!',
      ],
    },
    contacts: {
      tr: [
        'Her müşteri özel, her liste değerli.',
        'Hangi müşteriyi seçeceğiz bugün?',
        'İyi bir liste iyi bir gün demek!',
      ],
      de: [
        'Jeder Kunde ist besonders, jede Liste wertvoll.',
        'Welchen Kunden wählen wir heute?',
        'Eine gute Liste bedeutet einen guten Tag!',
      ],
    },
    campaigns: {
      tr: [
        'Kampanyalar hedefe uçuyor 🚀',
        'Her kampanya yeni bir fırsat!',
        'Hangi kampanyayı patlatıyoruz?',
      ],
      de: [
        'Kampagnen fliegen zum Ziel 🚀',
        'Jede Kampagne ist eine neue Chance!',
        'Welche Kampagne rocken wir?',
      ],
    },
    settings: {
      tr: [
        'Ayarlar tamam mı? Her şey yerli yerinde.',
        'Güzel bir sistem kurmak için buradayız!',
        'Bir ayar değişikliği bazen her şeyi değiştirir.',
      ],
      de: [
        'Einstellungen okay? Alles an seinem Platz.',
        'Wir sind hier, um ein gutes System aufzubauen!',
        'Eine Einstellung kann manchmal alles ändern.',
      ],
    },
    performance: {
      tr: [
        'Performansın gökyüzünde! 🌟',
        'Her sayı bir başarı hikayesi.',
        'Veriler asla yalan söylemez!',
      ],
      de: [
        'Deine Performance ist durch die Decke! 🌟',
        'Jede Zahl ist eine Erfolgsgeschichte.',
        'Daten lügen nie!',
      ],
    },
    supervisor: {
      tr: [
        'Takımı izliyorum, güçlüler bugün!',
        'Her ajan için buradayım.',
        'Süpervizör gözüyle her şey görünür.',
      ],
      de: [
        'Ich beobachte das Team — sie sind heute stark!',
        'Ich bin für jeden Agenten da.',
        'Mit Supervisor-Augen sieht man alles.',
      ],
    },
    wiedervorlage: {
      tr: [
        'Geri aramalar bekliyor — hazır mısın?',
        'Sıcak leadler burada saklı 🔥',
        'Bir geri arama bir termin olabilir!',
      ],
      de: [
        'Rückrufe warten — bist du bereit?',
        'Heiße Leads sind hier versteckt 🔥',
        'Ein Rückruf kann ein Termin werden!',
      ],
    },
    takvim: {
      tr: [
        'Takvim dolu — harika iş!',
        'Her slot bir kazanç 📅',
        'Randevular düzenli, aklım rahat.',
      ],
      de: [
        'Kalender voll — tolle Arbeit!',
        'Jeder Slot ist ein Gewinn 📅',
        'Termine ordentlich, mein Kopf ist frei.',
      ],
    },
    field: {
      tr: [
        'Saha ekibi — en cesur ajanlar!',
        'Dışarıda güçlü bir ekip var.',
        'Saha operasyonları tam hızda!',
      ],
      de: [
        'Außendienst — die mutigsten Agenten!',
        'Da draußen ist ein starkes Team.',
        'Außendienstoperationen auf Hochtouren!',
      ],
    },
    jobmarket: {
      tr: [
        'İş piyasası canlı — fırsatlar kaçmasın!',
        'Her ilan bir kapı açıyor.',
        'Harita dolu, iş bol 🗺️',
      ],
      de: [
        'Jobmarkt lebendig — keine Chancen verpassen!',
        'Jede Anzeige öffnet eine Tür.',
        'Karte voll, viele Jobs 🗺️',
      ],
    },
    leave: {
      tr: [
        'Dinlenme de çalışmak kadar önemli ☀️',
        'İzin talebini en iyi şekilde yönetelim.',
      ],
      de: [
        'Erholung ist genauso wichtig wie Arbeit ☀️',
        'Lass uns deinen Urlaubsantrag bestmöglich verwalten.',
      ],
    },
    muhasebe: {
      tr: [
        'Muhasebe şeffaf olunca her şey güzel.',
        'Sayılar doğruysa kafam rahat 🧮',
      ],
      de: [
        'Buchhaltung transparent — alles gut.',
        'Zahlen stimmen — Kopf ist frei 🧮',
      ],
    },
    competition: {
      tr: [
        'Rekabet ruhu! Kim kazanacak?',
        'Sıralama güncelliyor — takip et! 🏆',
      ],
      de: [
        'Wettbewerbsgeist! Wer gewinnt?',
        'Rangliste aktualisiert — bleib dran! 🏆',
      ],
    },
  };

  const _DEFAULT_MSGS = {
    tr: [
      'Buradayım, her zaman!',
      'Seninle çalışmak harika 😊',
      'Birlikte her şeyi başarırız.',
    ],
    de: [
      'Ich bin hier, immer!',
      'Es macht Spaß, mit dir zu arbeiten 😊',
      'Zusammen schaffen wir alles.',
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
    _bubble(tr ? 'Haaaa... biraz yoruldum 🥱' : 'Haaaa... ein bisschen müde 🥱');
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
    _bubble(tr ? 'Zzz... biraz şekerleme yapıyorum 😴' : 'Zzz... ich schlafe kurz 😴');
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
    const drink = _drinkForTime();
    const tr = _lang() === 'tr';
    _setMood('cust-empty--mascot-drink', 'drink');
    const msgs = tr
      ? [`${drink.tr} İçtim, teşekkürler!`, `${drink.tr} Hayat böyle güzel.`, `${drink.tr} Bir yudum — enerji geldi!`]
      : [`${drink.de} Getrunken, danke!`, `${drink.de} So schön ist das Leben.`, `${drink.de} Ein Schluck — Energie da!`];
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
          ? ['Günaydın! Gerilme zamanı 🙆', 'Uyandım! Hazırım!', 'Yeniden enerji dolu 💪']
          : ['Guten Morgen! Zeit zu strecken 🙆', 'Aufgewacht! Bereit!', 'Wieder voller Energie 💪'])
      : (tr
          ? ['Gerilme zamanı! 🙆‍♀️', 'Biraz esneyelim...', 'Kaslarımı çalıştırıyorum 💪']
          : ['Zeit zu strecken! 🙆‍♀️', 'Etwas dehnen...', 'Ich aktiviere meine Muskeln 💪']);
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
      ? ['TERMİN! 🎉 Mükemmelsin!', '🥳 Yaptık! Harika bir kapanış!', '🎊 Süpersin — termin tamam!', '✨ Bu benim favorim — termin geldi!']
      : ['TERMIN! 🎉 Du bist großartig!', '🥳 Geschafft! Tolles Abschluss!', '🎊 Spitze — Termin bestätigt!', '✨ Das ist mein Liebling — Termin da!'];
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
    if (Math.random() > 0.4 || _hidden() || _bubbleMuted()) return;
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
        if (h < 12)       greeting = tr ? 'Günaydın! Bugün harika bir gün olacak ☀️' : 'Guten Morgen! Heute wird ein toller Tag ☀️';
        else if (h < 18)  greeting = tr ? 'İyi öğleden sonralar! Tam gaz devam 🚀' : 'Guten Nachmittag! Weiter so 🚀';
        else               greeting = tr ? 'İyi akşamlar! Son rötuşları yapıyoruz 🌙' : 'Guten Abend! Letzte Feinarbeiten 🌙';
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
