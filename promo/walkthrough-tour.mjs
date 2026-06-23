/** Admin tur adımları — gerçek uygulama gezintisi (TR / DE) */
export const PROMO_SESSION = {
  id: 'fdc2eb8d-b7ff-44ba-9815-5c046dc4c1d7',
  firm_id: '9a9a8583-c36f-42ea-a596-61da8778498c',
  email: 'demo@montblanc.com',
  name: 'Montblanc Admin',
  role: 'admin',
  firm_name: 'Montblanc Call Center',
  initials: 'M',
};

export const COPY = {
  tr: {
    brand: 'Montblanc Dialer',
    tagline: 'Profesyonel çağrı merkezi platformu',
    login: { title: 'Giriş & çok kiracılı altyapı', sub: 'TR / DE dil desteği · güvenli oturum' },
    dashboard: { title: 'Canlı özet paneli', sub: 'Arama, termin, geri arama ve agent durumu' },
    campaigns: { title: 'Kampanya yönetimi', sub: 'Liste yükleme, DID, arama kuralları' },
    dialer: { title: 'WebRTC dialer', sub: 'Otomatik arama, sonuç kodları, Mimi AI koç' },
    agents: { title: 'Agent & ekip', sub: 'Roller, durum, performans takibi' },
    stats: { title: 'İstatistikler & grafikler', sub: 'Günlük / haftalık raporlar' },
    callhistory: { title: 'Çağrı geçmişi', sub: 'Kayıt, süre, sonuç filtreleri' },
    qc: { title: 'QC kalite paneli', sub: 'Termin doğrulama ve kalite kontrol' },
    takvim: { title: 'Takvim & randevular', sub: 'Termin planlama ve slot yönetimi' },
    wiedervorlage: { title: 'Wiedervorlage', sub: 'Geri arama listesi ve takip' },
    settings: { title: 'Ayarlar', sub: 'Telnyx SIP, mesai, sonuç kodları, bayraklar' },
    outro: { title: 'Canlıya hazır', sub: 'Telnyx SIP + DID ile gerçek trafik' },
  },
  de: {
    brand: 'Montblanc Dialer',
    tagline: 'Professionelle Call-Center-Plattform',
    login: { title: 'Login & Multi-Tenant', sub: 'TR / DE · sichere Sitzung' },
    dashboard: { title: 'Live-Dashboard', sub: 'Anrufe, Termine, Rückrufe & Agentenstatus' },
    campaigns: { title: 'Kampagnenverwaltung', sub: 'Listen-Import, DID, Wählregeln' },
    dialer: { title: 'WebRTC-Dialer', sub: 'Auto-Dial, Ergebniscodes, Mimi AI-Coach' },
    agents: { title: 'Agenten & Team', sub: 'Rollen, Status, Performance' },
    stats: { title: 'Statistiken & Charts', sub: 'Tages- und Wochenberichte' },
    callhistory: { title: 'Anrufliste', sub: 'Aufzeichnung, Dauer, Ergebnisfilter' },
    qc: { title: 'QC-Qualitätspanel', sub: 'Terminprüfung & Qualitätskontrolle' },
    takvim: { title: 'Kalender & Termine', sub: 'Terminplanung & Slot-Verwaltung' },
    wiedervorlage: { title: 'Wiedervorlage', sub: 'Rückrufliste & Nachverfolgung' },
    settings: { title: 'Einstellungen', sub: 'Telnyx SIP, Schichten, Ergebnisse, Flags' },
    outro: { title: 'Produktionsbereit', sub: 'Echter Traffic mit Telnyx SIP + DID' },
  },
};

/** @type {Array<{kind:'login'|'page'|'outro', page?:string, ms:number, scroll?:boolean, settingsTab?:string}>} */
export function buildTour(lang) {
  const c = COPY[lang];
  return [
    { kind: 'login', ms: 4500, ...c.login },
    { kind: 'page', page: 'dashboard', ms: 6500, scroll: true, ...c.dashboard },
    { kind: 'page', page: 'campaigns', ms: 5500, scroll: true, ...c.campaigns },
    { kind: 'page', page: 'dialer', ms: 9000, scroll: true, ...c.dialer },
    { kind: 'page', page: 'agents', ms: 5000, scroll: true, ...c.agents },
    { kind: 'page', page: 'stats', ms: 5500, scroll: true, ...c.stats },
    { kind: 'page', page: 'callhistory', ms: 4500, scroll: true, ...c.callhistory },
    { kind: 'page', page: 'qc', ms: 4500, scroll: true, ...c.qc },
    { kind: 'page', page: 'takvim', ms: 5500, scroll: true, ...c.takvim },
    { kind: 'page', page: 'wiedervorlage', ms: 4000, scroll: true, ...c.wiedervorlage },
    { kind: 'page', page: 'settings', ms: 4500, scroll: true, settingsTab: 'general', ...c.settings },
    { kind: 'outro', ms: 3500, ...c.outro },
  ];
}

export function tourDurationMs(lang) {
  return buildTour(lang).reduce((s, step) => s + step.ms, 0);
}
