// Per-call Telnyx instructions. No network. The model may only use the returned keys.

export type AiKind = 'sales' | 'qc';

export type AiChoice = { key: string; label: string };

export type AiField = { label: string; value: string };

export type AiBriefInput = {
  kind: AiKind;
  lang: 'de' | 'tr';
  company: string;
  rate: number;
  prompt: string;
  greetingText: string;
  note: string;
  forbidPrice: boolean;
  forbidContract: boolean;
  forbidOther: boolean;
  transfer: string;
  voice: string;
  allowed: AiChoice[];
  fields: AiField[];
  when: string;
};

export type AiBrief = {
  ok: true;
  instructions: string;
  greeting: string;
  voice: string;
  allowedKeys: string[];
} | {
  ok: false;
  error: 'gate' | 'results';
};

const COLS: { key: string; tr: string; de: string }[] = [
  { key: 'nachname', tr: 'Ad', de: 'Name' },
  { key: 'telefonnummer', tr: 'Telefon', de: 'Telefon' },
  { key: 'telefon2', tr: 'Telefon 2', de: 'Telefon 2' },
  { key: 'strasse', tr: 'Adres', de: 'Adresse' },
  { key: 'plz', tr: 'Posta kodu', de: 'PLZ' },
  { key: 'ortschaft', tr: 'Şehir', de: 'Ort' },
  { key: 'hausart', tr: 'Ev tipi', de: 'Hausart' },
  { key: 'baujahr', tr: 'Yapım yılı', de: 'Baujahr' },
  { key: 'qm', tr: 'Metrekare', de: 'Quadratmeter' },
  { key: 'heizung', tr: 'Isıtma', de: 'Heizung' },
  { key: 'alter_der_heizung', tr: 'Isıtma yaşı', de: 'Alter der Heizung' },
  { key: 'verbrauch_pro_jahr', tr: 'Yıllık tüketim', de: 'Verbrauch pro Jahr' },
  { key: 'personen', tr: 'Kişi sayısı', de: 'Personen' },
  { key: 'interesse_an_pv', tr: 'PV ilgisi', de: 'Interesse an PV' },
];

export function normKey(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

export function normDid(value: unknown) {
  const s = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}

export function clip(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

export function berlinDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function berlinClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

export function voiceFor(lang: 'de' | 'tr', voice: string) {
  if (lang === 'tr') return voice === 'male' ? 'Azure.tr-TR-AhmetNeural' : 'Azure.tr-TR-EmelNeural';
  return voice === 'male' ? 'AWS.Polly.Hans' : 'AWS.Polly.Vicki';
}

export function allowedChoices(kind: AiKind, staffKeys: string[], firmChoices: AiChoice[]) {
  const firm = firmChoices.map((row) => ({ key: normKey(row.key), label: clip(row.label, 80) || normKey(row.key) })).filter((row) => row.key);
  const wanted = new Set((staffKeys || []).map(normKey).filter(Boolean));
  let rows = firm.filter((row) => wanted.has(row.key));
  if (kind === 'sales') rows = rows.filter((row) => row.key !== 'basarili');
  if (kind === 'qc') rows = rows.filter((row) => row.key !== 'qc_bekleniyor');
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

export function resultAllowed(kind: AiKind, key: string, allowedKeys: string[]) {
  const norm = normKey(key);
  if (!norm) return false;
  if (kind === 'sales' && norm === 'basarili') return false;
  if (kind === 'qc' && norm === 'qc_bekleniyor') return false;
  return allowedKeys.map(normKey).includes(norm);
}

const TOKEN_COL: Record<string, string> = {
  ad: 'nachname', isim: 'nachname', name: 'nachname',
  telefon: 'telefonnummer', phone: 'telefonnummer',
  telefon2: 'telefon2',
  adres: 'strasse', address: 'strasse', strasse: 'strasse',
  plz: 'plz',
  sehir: 'ortschaft', city: 'ortschaft', ort: 'ortschaft', ortschaft: 'ortschaft',
  hausart: 'hausart', baujahr: 'baujahr', qm: 'qm', heizung: 'heizung',
  alter_der_heizung: 'alter_der_heizung', verbrauch_pro_jahr: 'verbrauch_pro_jahr',
  personen: 'personen', interesse_an_pv: 'interesse_an_pv',
};

export function fillAiText(text: string, appt: Record<string, unknown>, extra: Record<string, unknown>, when = '') {
  const day = String(when || '').slice(0, 10);
  const clock = String(when || '').length >= 16 ? String(when).slice(11, 16) : '';
  return String(text || '').replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}|\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_all, doubled, single) => {
    const key = normKey(doubled || single);
    if (!key || key.startsWith('callin_')) return '';
    if (key === 'tarih' || key === 'date') return day;
    if (key === 'saat' || key === 'time') return clock;
    const col = TOKEN_COL[key];
    const fromCol = col ? clip(appt?.[col], 180) : '';
    if (fromCol) return fromCol;
    const direct = !col && appt && typeof appt[key] !== 'object' ? clip(appt[key], 180) : '';
    if (direct) return direct;
    const ek = extra && typeof extra[key] !== 'object' ? clip(extra[key], 180) : '';
    return ek;
  });
}

export function fieldLines(lang: 'de' | 'tr', appt: Record<string, unknown>, extra: Record<string, unknown>) {
  const lines: AiField[] = [];
  COLS.forEach((col) => {
    const value = clip(appt[col.key], 180);
    if (!value) return;
    lines.push({ label: lang === 'de' ? col.de : col.tr, value });
  });
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (!key || key.startsWith('callin_') || COLS.some((col) => col.key === key)) return;
    if (value && typeof value === 'object') return;
    const text = clip(value, 180);
    if (!text) return;
    lines.push({ label: key, value: text });
  });
  return lines.slice(0, 24);
}

export function buildAiBrief(input: AiBriefInput): AiBrief {
  const company = clip(input.company, 80);
  const rate = Number(input.rate);
  if (!company || !(rate > 0)) return { ok: false, error: 'gate' };
  const lang = input.lang === 'tr' ? 'tr' : 'de';
  const kind: AiKind = input.kind === 'sales' ? 'sales' : 'qc';
  const choices = allowedChoices(kind, input.allowed.map((row) => row.key), input.allowed);
  if (!choices.length) return { ok: false, error: 'results' };
  const de = lang === 'de';
  const bans = [
    input.forbidPrice !== false ? (de ? 'Nenne keinen Preis.' : 'Fiyat söyleme.') : '',
    input.forbidContract !== false ? (de ? 'Sprich keinen Vertrag an.' : 'Sözleşme konuşma.') : '',
    input.forbidOther !== false ? (de ? 'Nenne keinen anderen Firmennamen.' : 'Başka şirket adı verme.') : '',
  ].filter(Boolean);
  const resultLines = choices.map((row) => `- ${row.key}: ${row.label}`).join('\n');
  const known = (input.fields || []).filter((row) => clip(row.value, 180)).map((row) => `- ${clip(row.label, 80)}: ${clip(row.value, 180)}`).join('\n');
  const note = clip(input.note, 800);
  const prompt = clip(input.prompt, 2000);
  const when = clip(input.when, 40);
  const transfer = normDid(input.transfer);
  const job = kind === 'qc'
    ? (de
      ? 'Du rufst einen bestehenden Termin erneut an. Bestätige die Angaben. Du öffnest keinen neuen Termin und verkaufst nicht.'
      : 'Var olan randevuyu yeniden ararsın. Bilgileri doğrula. Yeni randevu açma, satış konuşması yapma.')
    : (de
      ? 'Du sprichst für einen Termin. Ergebnis basarili ist verboten. Ein Termin legt den Datensatz in die Qualitätskontrolle.'
      : 'Randevu için konuşursun. Başarılı yazmak yasak. Randevu, kaydı kalite kontrole bırakır.');
  const tools = de
    ? 'Werkzeuge: takvim_bak für freie Zeiten, sonuc_yaz nur mit einem erlaubten Schlüssel, insana_aktar nur wenn ein Mensch übernehmen soll. Biete keine Uhrzeit an, die takvim_bak nicht geliefert hat. Wenn keine Zeit frei ist, versprich keine neue Zeit.'
    : 'Araçlar: takvim_bak boş saatleri verir, sonuc_yaz yalnız izinli anahtarla sonuç yazar, insana_aktar insan devralacaksa kullanılır. takvim_bak döndürmediği saati önerme. Boş saat yoksa yeni saat vaat etme.';
  const handoff = transfer
    ? (de ? 'Wenn du nicht weiterkommst, rufe insana_aktar.' : 'İlerleyemezsen insana_aktar çağır.')
    : (de ? 'Es gibt keine Weiterleitungsnummer. Wähle nur ein erlaubtes Ergebnis, das Warten oder Rückruf bedeutet, falls vorhanden.' : 'Aktarma numarası yok. Varsa yalnız bekleme veya geri arama anlamına gelen izinli sonucu seç.');
  const instructions = [
    de ? `Du telefonierst für ${company}. Sprich Deutsch.` : `${company} adına telefon edersin. Türkçe konuş.`,
    job,
    bans.join(' '),
    prompt ? (de ? `Auftrag: ${prompt}` : `Görev: ${prompt}`) : '',
    note ? (de
      ? `Einmaliger Hinweis, nicht wörtlich vorlesen: ${note}\nWenn der Hinweis die Uhrzeit verschiebt, rufe takvim_bak mit date und after auf die eingetragene Zeit. Biete nur die nächste freie Zeit danach an.`
      : `Tek seferlik not, aynen okuma: ${note}\nNot saati kaydırıyorsa takvim_bak çağır, date ve after olarak kayıtlı günü ve saati ver. Yalnız ondan sonraki ilk boş saati öner.`) : '',
    when ? (de ? `Eingetragene Zeit: ${when}` : `Kayıtlı saat: ${when}`) : '',
    known ? (de ? `Bekannte Angaben:\n${known}` : `Bilinen bilgiler:\n${known}`) : '',
    de ? `Erlaubte Ergebnisschlüssel, keine anderen:\n${resultLines}` : `İzinli sonuç anahtarları, başkası yok:\n${resultLines}`,
    tools,
    handoff,
  ].filter(Boolean).join('\n\n');
  const greeting = clip(input.greetingText, 400) || (de ? `Guten Tag, hier ist ${company}.` : `Merhaba, ben ${company}.`);
  return {
    ok: true,
    instructions,
    greeting,
    voice: voiceFor(lang, input.voice),
    allowedKeys: choices.map((row) => row.key),
  };
}
