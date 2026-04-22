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

try {
  window.t = t;
  window.applyDomI18n = applyDomI18n;
} catch (_) {}
