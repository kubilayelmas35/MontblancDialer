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
    'ui.all_agents': 'Tüm agentler',
    'ui.all_campaigns': 'Tüm kampanyalar',
    'ui.all_customers': 'Tüm müşteriler',
    'ui.date_select': 'Tarih seçin',
    'ui.excel_lib_missing': 'Excel kütüphanesi yok',
    'ui.excel_downloaded': 'Excel indirildi',
    'ui.csv_downloaded': 'CSV indirildi',
    'ui.no_selection': 'Seçim yok',
    'ui.no_permission': 'Yetki yok',
    'ui.yes': 'Evet',
    'ui.no': 'Hayır',
    'ui.settings_sip_saved': '✓ Kaydedildi, bağlanıyor…',
    'export.select_firm': 'Önce firma seçin',
    'export.et_no_customers': 'Kısayol için müşteri yok.',
    'export.et_shortcut_caption': 'Bu hafta · başarılı · müşteri',
    'export.date_range': 'Tarih aralığı seçin',
    'wv.marked_negative': 'Olumsuz olarak işaretlendi — listeden çıktı',
    'wv.err_firm_phone': 'Firma veya telefon eksik',
    'wv.no_contact_hint': 'Bu telefonla kayıtlı müşteri yok — WV bilgisiyle kart açıldı; aramayı manuel başlatın',
    'telnyx.mic_ok': 'Mikrofon izni alındı',
    'telnyx.mic_denied': 'Mikrofon izni reddedildi! Tarayıcı ayarlarından izin verin.',
    'telnyx.line_connected': 'Hat bağlantısı kuruldu',
    'telnyx.mic_on': 'Mikrofon aktif',
    'telnyx.mic_off': 'Mikrofon izni yok',
    'telnyx.amd_voicemail': 'Telesekreter — otomatik kapatıldı',
    'dash.sub_agent_calls': 'Senin çağrıların (seçili aralık)',
    'dash.chart_calls': 'Çağrı',
    'dash.chart_termin': 'Termin',
    'dash.chart_termin_per_call': 'Termin (çağrı)',
    'dash.chart_tooltip': 'Başarı: {p} (termin/çağrı)',
    'dash.cumulative_calls': 'Kümülatif çağrı',
    'dash.donut_no_data': 'Veri yok',
    'dash.donut_appt_suffix': ' randevu',
    'dash.donut_tooltip_line': '{lbl}: {v}{s}',
    'perf.chart_ok': 'Başarılı',
    'perf.chart_total': 'Toplam termin',
    'perf.chart_rate': 'Başarı %',
    'perf.chart_ap_bar': 'Termin sayısı',
    'comp.note_auto_count': 'Başarılı terminler (sonuç: Termin) otomatik sayılır.',
    'comp.not_in_list': 'Bu ay listesinde yoksun',
    'comp.champ_sub_count': 'başarılı termin',
    'comp.leader': 'Lider',
    'comp.termin_count': 'termin',
    'comp.month_progress': "Ayın {p}%'i · {d} gün kaldı",
    'comp.podium_termin': '{n} termin',
    'comp.self_line_show': 'Sen: {r}. sıra · {c} termin',
    'comp.self_line_hide': 'Senin sıran: {r}.',
    'comp.banner_base': '<strong>Sen:</strong> {r}. sıra',
    'comp.banner_count': ' · {c} termin',
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
    'ui.all_agents': 'Alle Agenten',
    'ui.all_campaigns': 'Alle Kampagnen',
    'ui.all_customers': 'Alle Kunden',
    'ui.date_select': 'Daten wählen',
    'ui.excel_lib_missing': 'Excel-Bibliothek fehlt',
    'ui.excel_downloaded': 'Excel gespeichert',
    'ui.csv_downloaded': 'CSV gespeichert',
    'ui.no_selection': 'Keine Auswahl',
    'ui.no_permission': 'Keine Berechtigung',
    'ui.yes': 'Ja',
    'ui.no': 'Nein',
    'ui.settings_sip_saved': '✓ Gespeichert, verbinde…',
    'export.select_firm': 'Bitte Firma wählen',
    'export.et_no_customers': 'Keine Kunden für Schnellwahl.',
    'export.et_shortcut_caption': 'Diese Woche · erfolgreich · Kunde',
    'export.date_range': 'Datumsbereich wählen',
    'wv.marked_negative': 'Als negativ markiert',
    'wv.err_firm_phone': 'Fehlende Firma oder Telefon',
    'wv.no_contact_hint': 'Kein Kontakt — WV-Daten geladen',
    'telnyx.mic_ok': 'Mikrofon erlaubt',
    'telnyx.mic_denied': 'Mikrofon verweigert! Bitte in den Browser-Einstellungen erlauben.',
    'telnyx.line_connected': 'Verbindung hergestellt',
    'telnyx.mic_on': 'Mikrofon aktiv',
    'telnyx.mic_off': 'Kein Mikrofon-Zugriff',
    'telnyx.amd_voicemail': 'Anrufbeantworter erkannt',
    'dash.sub_agent_calls': 'Deine Anrufe (Zeitraum)',
    'dash.chart_calls': 'Anrufe',
    'dash.chart_termin': 'Termin',
    'dash.chart_termin_per_call': 'Termin (Anruf)',
    'dash.chart_tooltip': 'Quote: {p}',
    'dash.cumulative_calls': 'Kumulativ',
    'dash.donut_no_data': 'Keine Daten',
    'dash.donut_appt_suffix': '',
    'dash.donut_tooltip_line': '{lbl}: {v}{s}',
    'perf.chart_ok': 'Erfolgreich',
    'perf.chart_total': 'Gesamt',
    'perf.chart_rate': 'Quote %',
    'perf.chart_ap_bar': 'Termine',
    'comp.note_auto_count': 'Erfolgreiche Termine (Outcome) werden automatisch gezählt.',
    'comp.not_in_list': 'Nicht in der Liste',
    'comp.champ_sub_count': 'Termine',
    'comp.leader': 'Führend',
    'comp.termin_count': 'Termine',
    'comp.month_progress': 'Monat {p}% · {d} Tage',
    'comp.podium_termin': '{n} Termine',
    'comp.self_line_show': 'Du: {r}. · {c} Termine',
    'comp.self_line_hide': 'Dein Rang: {r}.',
    'comp.banner_base': '<strong>Du:</strong> Rang {r}',
    'comp.banner_count': ' · {c} Termine',
  },
};

function t(key) {
  const lang = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de' : 'tr';
  const row = MB_I18N[lang] || MB_I18N.tr;
  return (row && row[key] !== undefined) ? row[key] : (MB_I18N.tr[key] !== undefined ? MB_I18N.tr[key] : key);
}

/**
 * BCP-47 locale for the active UI language.
 */
function mbLocale() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'tr-TR';
}

/** "foo {a} bar {b}" with values; unknown placeholders left as-is. */
function tReplace(template, vars) {
  let s = t(template);
  (vars && typeof vars === 'object' ? Object.entries(vars) : []).forEach(([k, v]) => {
    s = s.split(`{${k}}`).join(String(v));
  });
  return s;
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
  window.tReplace = tReplace;
  window.mbLocale = mbLocale;
  window.applyDomI18n = applyDomI18n;
  window.mbEmptyRow = mbEmptyRow;
  window.mbLoadingRow = mbLoadingRow;
  window.mbErrorRow = mbErrorRow;
} catch (_) {}
