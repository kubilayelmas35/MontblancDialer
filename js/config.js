// ─────────────────────────────────────────────
// CONFIG — sabitler ve API anahtarları
// ─────────────────────────────────────────────
const SB_URL = 'https://gsvvhzyhdhkbozjnlyrn.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdnZoenloZGhrYm96am5seXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjYwMTIsImV4cCI6MjA5MTM0MjAxMn0.PzpCpIO_aIg6JxiwRd7PuqGW9tn3qCKfyT31RpSF1go';
const SB_KEY = SB_ANON_KEY;

const DEFAULT_GOOGLE_KEY = '';
const DEFAULT_TOMTOM_KEY = '';
const MB_BUSINESS_TZ = 'Europe/Berlin';

const TAKVIM_URL = 'https://www.montblanccs.com/kalender';

const SLOT_HOURS = 2;

const UQ_AUTO_MAP = {
'telefon':'phone','phone':'phone','tel':'phone','handy':'phone','mobil':'phone',
'telefon2':'phone2','phone2':'phone2','tel2':'phone2',
'ad':'first_name','vorname':'first_name','name':'first_name','firstname':'first_name',
'soyad':'last_name','nachname':'last_name','familienname':'last_name','lastname':'last_name',
'adres':'address','adresse':'address','strasse':'address','straße':'address',
'posta kodu':'plz','postleitzahl':'plz','plz':'plz',
'şehir':'city','stadt':'city','ort':'city',
'not':'notes','notiz':'notes','anmerkung':'notes',
};

const UQ_FIELD_KEYWORDS = {
  phone: ['telefon', 'phone', 'tel', 'handy', 'mobil', 'telefon 1', 'gsm'],
  phone2: ['telefon 2', 'telefon2', 'phone 2', 'phone2', 'tel2', 'handy 2', 'mobil 2'],
  first_name: ['ad', 'vorname', 'firstname', 'first name', 'isim'],
  last_name: ['soyad', 'nachname', 'lastname', 'last name', 'familienname'],
  name: ['ad soyad', 'ad / soyad', 'vollname', 'full name', 'isim soyisim', 'name'],
  plz: ['plz', 'posta kodu', 'postleitzahl', 'zip', 'pk'],
  city: ['şehir', 'sehir', 'stadt', 'ort', 'ortschaft', 'city'],
  address: ['adres', 'adresse', 'strasse', 'straße', 'street', 'sokak'],
};

function mbCleanHeader(h) {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/["'\r*]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mbAutoMapHeaders(headers) {
  const cleaned = (headers || []).map(mbCleanHeader);
  const dict = UQ_FIELD_KEYWORDS || {};
  const exact = [];
  const loose = [];
  Object.keys(dict).forEach((key) => {
    (dict[key] || []).forEach((kw) => {
      const n = mbCleanHeader(kw);
      if (!n) return;
      cleaned.forEach((h, i) => {
        if (!h) return;
        if (h === n) exact.push({ key, i, score: n.length });
        else if (n.length >= 5 && h.includes(n)) loose.push({ key, i, score: n.length });
      });
    });
  });
  exact.sort((a, b) => b.score - a.score);
  loose.sort((a, b) => b.score - a.score);
  const used = new Set();
  const out = {};
  [...exact, ...loose].forEach((c) => {
    if (out[c.key] != null || used.has(c.i)) return;
    out[c.key] = c.i;
    used.add(c.i);
  });
  return out;
}

function mbSplitPersonName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

const DEFAULT_AUX_CODES = ['Yemek Molası','Çay Molası','Lavabo','Toplantı','Teknik Sorun'];

const DEFAULT_OUTCOMES = [
{key:'appointment', label:'Randevu',        enabled:true,  color:'green'},
{key:'negative',    label:'Olumsuz',       enabled:true,  color:'red'},
{key:'callback',    label:'Geri Ara',      enabled:true,  color:'blue'},
{key:'no_answer',   label:'Cevap Yok',     enabled:true,  color:'gray'},
{key:'dnc',         label:'Kara Liste',    enabled:true,  color:'red'},
{key:'voicemail',   label:'Telesekreter',  enabled:true,  color:'gray'},
];

const IA_FIELDS = [
{key:'nachname',     label:'Ad Soyad *',      required:true},
{key:'telefon',      label:'Telefon *',        required:true},
{key:'telefon2',     label:'Telefon 2',        required:false},
{key:'strasse',      label:'Adres/Sokak',      required:false},
{key:'plz',          label:'PLZ',              required:false},
{key:'ort',          label:'Şehir',            required:false},
{key:'termin_tarih', label:'Randevu Tarihi *',  required:true},
{key:'termin_saat',  label:'Randevu Saati',     required:false},
{key:'notiz',        label:'Not',              required:false},
{key:'durum',        label:'Durum',            required:false},
];

const NC_DEFAULT_FIELDS = [
{key:'phone',   label:'Telefon',      type:'text',   show:true,  locked:true},
{key:'phone2',  label:'Telefon 2',    type:'text',   show:true,  locked:false},
{key:'name',    label:'Ad / Soyad',   type:'text',   show:true,  locked:false},
{key:'plz',     label:'PLZ',          type:'text',   show:true,  locked:false},
{key:'city',    label:'Şehir',        type:'text',   show:true,  locked:false},
{key:'address', label:'Adres',        type:'text',   show:true,  locked:false},
{key:'attempt', label:'Arama Sayısı', type:'number', show:true,  locked:false},
{key:'notes',   label:'Notlar',       type:'text',   show:false, locked:false},
];

const UQ_TARGET_FIELDS = [
{ key:'phone',      label:'📞 Telefon *', required:true },
{ key:'phone2',     label:'📞 Telefon 2' },
{ key:'name',       label:'👤 Ad / Soyad' },
{ key:'first_name', label:'👤 Ad' },
{ key:'last_name',  label:'👤 Soyad' },
{ key:'plz',        label:'📮 PLZ' },
{ key:'city',       label:'🏙 Şehir' },
{ key:'address',    label:'🏠 Adres' },
];

const GUNLER = [
{key:'pzt', label:'Pazartesi'},
{key:'sal', label:'Salı'},
{key:'car', label:'Çarşamba'},
{key:'per', label:'Perşembe'},
{key:'cum', label:'Cuma'},
{key:'cmt', label:'Cumartesi'},
{key:'paz', label:'Pazar'},
];

const TOMTOM_KEY = () => localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;

function mbZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || MB_BUSINESS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = {};
  fmt.formatToParts(date).forEach((p) => {
    if (p.type !== 'literal') parts[p.type] = p.value;
  });
  return parts;
}

function mbWallToIso(value, timeZone) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  let utc = Date.UTC(y, mo - 1, d, h, mi);
  const gotParts = mbZonedParts(new Date(utc), timeZone || MB_BUSINESS_TZ);
  const got = Date.UTC(Number(gotParts.year), Number(gotParts.month) - 1, Number(gotParts.day), Number(gotParts.hour), Number(gotParts.minute));
  if (Number.isFinite(got)) utc -= got - Date.UTC(y, mo - 1, d, h, mi);
  const out = new Date(utc);
  return Number.isFinite(out.getTime()) ? out.toISOString() : null;
}

function mbIsoToWallInput(iso, timeZone) {
  if (!iso) return '';
  const p = mbZonedParts(new Date(iso), timeZone || MB_BUSINESS_TZ);
  if (!p.year) return '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function mbFormatWall(iso, opts) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return '—';
  return new Intl.DateTimeFormat(typeof mbLocale === 'function' ? mbLocale() : 'tr-TR', {
    timeZone: MB_BUSINESS_TZ,
    ...(opts || {}),
  }).format(dt);
}

function mbBusinessNow() {
  const p = mbZonedParts(new Date(), MB_BUSINESS_TZ);
  return {
    dateStr: `${p.year}-${p.month}-${p.day}`,
    timeStr: `${p.hour}:${p.minute}:00`,
  };
}

function mbBerlinDay(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return String(iso).slice(0, 10);
  const p = mbZonedParts(dt, MB_BUSINESS_TZ);
  if (!p.year) return '';
  return `${p.year}-${p.month}-${p.day}`;
}

function mbIsE164(value) {
  const s = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s);
}

function isValidUUID(id) {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
