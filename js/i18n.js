// Central UI strings (extend gradually). currentLang: 'tr' | 'de'
const MB_I18N = {
  tr: {
    'login.feat.1': 'Otomatik arama & WebRTC',
    'login.feat.2': 'Gerçek zamanlı istatistikler',
    'login.feat.3': 'Takvim & randevu yönetimi',
    'login.feat.4': 'Çok kiracılı güvenli altyapı',
    'login.welcome': 'Hoş geldiniz',
    'login.subtitle': 'Hesabınıza giriş yapın',
    'login.email': 'E-posta',
    'login.password': 'Şifre',
    'login.btn': 'Giriş Yap',
    'login.signingIn': 'Giriş yapılıyor...',
    'login.err.required': 'E-posta ve şifre gerekli',
    'login.err.bad': 'E-posta veya şifre hatalı',
    'login.err.conn': 'Bağlantı hatası: ',
    'login.demo': 'Demo: admin@test.com / 1234 | agent@test.com / 1234',
    'login.ph.email': 'kullanici@firma.com',
    'login.ph.pass': '••••••••',
    'ui.loading': 'Yükleniyor…',
    'ui.no_records': 'Kayıt yok',
    'ui.no_data': 'Veri yok',
    'ui.no_data_range': 'Bu tarih aralığında veri yok',
    'ui.no_termin_month': 'Bu ay termin yok',
    'ui.no_termin_export': 'Dışa aktarılacak termin yok',
    'ui.no_termin': 'Termin yok',
    'ui.no_rows_export': 'Dışa aktarılacak satır yok',
    'ui.no_row_short': 'Kayıt yok',
    'ui.dash': '—',
    'ui.no_access_page': 'Bu sayfaya erişim yok',
    'ui.select_firm_first': 'Önce firma seçin',
    'ui.competition_no_data': 'Henüz veri yok',
    'ui.error_prefix': 'Hata: ',
    'ui.unknown_error': 'Bilinmeyen hata',
    'ui.load_failed': 'Yüklenemedi',
    'ui.no_active_agents': 'Aktif agent yok',
  },
  de: {
    'login.feat.1': 'Autowähl & WebRTC',
    'login.feat.2': 'Echtzeit-Statistiken',
    'login.feat.3': 'Kalender & Terminverwaltung',
    'login.feat.4': 'Mandantenfähige, sichere Infrastruktur',
    'login.welcome': 'Willkommen',
    'login.subtitle': 'Melden Sie sich an',
    'login.email': 'E-Mail',
    'login.password': 'Passwort',
    'login.btn': 'Anmelden',
    'login.signingIn': 'Wird angemeldet...',
    'login.err.required': 'E-Mail und Passwort erforderlich',
    'login.err.bad': 'E-Mail oder Passwort falsch',
    'login.err.conn': 'Verbindungsfehler: ',
    'login.demo': 'Demo: admin@test.com / 1234 | agent@test.com / 1234',
    'login.ph.email': 'benutzer@firma.com',
    'login.ph.pass': '••••••••',
    'ui.loading': 'Wird geladen…',
    'ui.no_records': 'Keine Einträge',
    'ui.no_data': 'Keine Daten',
    'ui.no_data_range': 'In diesem Zeitraum keine Daten',
    'ui.no_termin_month': 'Keine Termine in diesem Monat',
    'ui.no_termin_export': 'Keine Termine zum Export',
    'ui.no_termin': 'Keine Termine',
    'ui.no_rows_export': 'Keine Zeilen zum Export',
    'ui.no_row_short': 'Keine Einträge',
    'ui.dash': '—',
    'ui.no_access_page': 'Kein Zugriff auf diese Seite',
    'ui.select_firm_first': 'Zuerst Firma wählen',
    'ui.competition_no_data': 'Noch keine Daten',
    'ui.error_prefix': 'Fehler: ',
    'ui.unknown_error': 'Unbekannter Fehler',
    'ui.load_failed': 'Laden fehlgeschlagen',
    'ui.no_active_agents': 'Keine aktiven Agenten',
  },
};

function t(key) {
  const lang = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de' : 'tr';
  const row = MB_I18N[lang] || MB_I18N.tr;
  return (row && row[key] !== undefined) ? row[key] : (MB_I18N.tr[key] !== undefined ? MB_I18N.tr[key] : key);
}

/**
 * Fills [data-i18n] text and [data-i18n-placeholder] for inputs.
 */
function applyDomI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (!k) return;
    el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (!k || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    el.placeholder = t(k);
  });
}

/** One table row: empty / loading (uses .mb-empty-hint in css/styles.css) */
function mbTableMessageRow(colspan, className, text) {
  const safe = typeof escapeHtml === 'function' ? escapeHtml(String(text)) : String(text);
  return `<tr><td colspan="${String(colspan)}" class="${className}">${safe}</td></tr>`;
}

function mbEmptyRow(colspan, key) {
  const s = (typeof t === 'function' ? t(key) : null);
  return mbTableMessageRow(colspan, 'mb-empty-hint', s != null ? s : String(key));
}

function mbLoadingRow(colspan) {
  return mbEmptyRow(colspan, 'ui.loading');
}

function mbErrorRow(colspan, message) {
  const s = typeof escapeHtml === 'function' ? escapeHtml(String(message)) : String(message);
  return `<tr><td colspan="${String(colspan)}" class="mb-empty-hint" style="color:var(--red);">${s}</td></tr>`;
}

try {
  window.t = t;
  window.applyDomI18n = applyDomI18n;
  window.mbEmptyRow = mbEmptyRow;
  window.mbLoadingRow = mbLoadingRow;
  window.mbErrorRow = mbErrorRow;
} catch (_) {}
