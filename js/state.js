// ─────────────────────────────────────────────
// STATE — tüm global değişkenler
// ─────────────────────────────────────────────
let currentUser     = null;
let currentLang     = 'tr';
let currentTheme    = 'light';
let currentPalette  = 'blue';
let campaigns       = [];
let currentCampId   = null;
let uploadFile      = null;

let _ncDragData = null;
let _ncDragIdx  = null;
let _ncFields   = [];

let uploadParsedRows = [];
let uploadHeaders    = [];

// Telnyx / WebRTC
let telnyxReady  = false;
let micGranted   = false;
let activeCallId = null;
let amdResult    = null;
let _telnyxClient = null;
let _telnyxCall   = null;
let callStart     = null;

// Takvim
let takvimView = 'week';
let takvimDate = new Date();
let takvimCampId = null;
let takvimSlots = [];
let takvimAppts = [];
let takvimClosedDays = {};
let _bookingSlot = null;

// WV
let wvList = [];
let wvTab  = 'all';
let wvEditId = null;
let wvReminderTimer = null;

// QC
let qcList     = [];
let qcTab      = 'qc bekleniyor';
let qcDetailId = null;

// Firmalar
let firmEditId = null;
let userEditId = null;

// Audio
let _currentAudio    = null;
let _currentAudioBtn = null;

// Gamification
let _dailyGoal          = 5;
let _dailyAppointments  = 0;
let _confettiShown      = false;

// Google / TomTom
let _googleApiKey = '';
let _mapInstance  = null;

// Auto-dial / Pre-call
let _autoDial    = true;

// Super admin firma seçici
let _allFirms       = [];
let _selectedFirmId = null;
let _baseUser       = null;
let _impersonation  = null;

// Mesai saatleri
let _mesaiFirmId       = null;  // super admin'in mesai için seçtiği firma
let _mesaiFirmSettings = null;  // o firmanın settings JSONB'si (admin_can_edit_mesai vb.)

// Arama kısıtlamaları (isCallAllowed için — firmadan yüklenir)
let _callHours        = null;   // {weekday_start,weekday_end,sat_allowed,sat_start,sat_end,sun_allowed,holiday_check}
let _callHoursFirmId  = null;   // super admin'in call-hours için seçtiği firma

// Import
let _iaRows    = [];
let _iaHeaders = [];

// Places
let _placesDebounce  = null;
let _placesDropdown  = null;

// Precall
let _precallStream   = null;
let _precallAnalyser = null;
let _precallMeter    = null;
let _precallOk       = false;
let _precallDone     = false;

// Dialer state
let dialerStatus    = 'offline'; // offline|ready|on_call|wrapping|break
let currentContact  = null;
let currentCallLog  = null;
let callTimerInt    = null;
let callSeconds     = 0;
let selectedCampId  = null;
let isMuted         = false;
let isOnHold        = false;
let selectedOutcome = null;

// Toast timer
let toastT;

// Fake / test call
let _fakeCallTimer  = null;
let _fakeCallActive = false;
let _testMode       = false;

// Multi-campaign dialing
let _activeCampIds  = [];  // agent'ın aktif seçtiği kampanya ID'leri

// Field settings
let _fsFields = [];
let _fsCampId = null;

// Takvim context menu
let _ctxSlot = null;
let _ctxAppt = null;

// Drag
let _dragSlot    = null;
let _dragGhost   = null;
let _dragOrigCell = null;

// ACW
let _acwTimer = null;

// Ticker
let _tickerInterval = null;

// Hotkeys
let _hotkeysEnabled = true;

// Camp field config (legacy)
let campFieldConfig = null;
