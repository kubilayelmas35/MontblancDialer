// ─────────────────────────────────────────────
// CONFIG — sabitler ve API anahtarları
// ─────────────────────────────────────────────
const SB_URL = 'https://gsvvhzyhdhkbozjnlyrn.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdnZoenloZGhrYm96am5seXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjYwMTIsImV4cCI6MjA5MTM0MjAxMn0.PzpCpIO_aIg6JxiwRd7PuqGW9tn3qCKfyT31RpSF1go';
const SB_KEY = SB_ANON_KEY;

const DEFAULT_GOOGLE_KEY = '';
const DEFAULT_TOMTOM_KEY = '0Qr9jgM8qfMzocWF9rhOsI6oHjebH59Y';
const MB_BUSINESS_TZ = 'Europe/Berlin';

const TAKVIM_URL = 'https://www.montblanccs.com/kalender';

const SLOT_HOURS = 2;

const UQ_AUTO_MAP = {
'telefon':'phone','phone':'phone','tel':'phone','handy':'phone','mobil':'phone',
'telefon2':'phone2','phone2':'phone2','tel2':'phone2',
'vorwahl':'vorwahl','ländervorwahl':'cc','laendervorwahl':'cc','country code':'cc',
'ad':'first_name','vorname':'first_name','name':'first_name','firstname':'first_name',
'soyad':'last_name','nachname':'last_name','familienname':'last_name','lastname':'last_name',
'adres':'address','adresse':'address','strasse':'address','straße':'address',
'posta kodu':'plz','postleitzahl':'plz','plz':'plz',
'şehir':'city','stadt':'city','ort':'city',
'no':'house_no','nr':'house_no','hausnr':'house_no','hausnummer':'house_no','numara':'house_no',
'not':'notes','notiz':'notes','anmerkung':'notes',
};

const UQ_FIELD_KEYWORDS = {
  phone: ['telefon', 'phone', 'tel', 'handy', 'mobil', 'telefon 1', 'gsm', 'rufnummer'],
  phone2: ['telefon 2', 'telefon2', 'phone 2', 'phone2', 'tel2', 'handy 2', 'mobil 2'],
  cc: ['ländervorwahl', 'laendervorwahl', 'country code', 'ülke kodu', 'ulke kodu', 'dial code', 'landesvorwahl'],
  vorwahl: ['vorwahl', 'ortsvorwahl', 'area code', 'alan kodu', 'vorwahl nummer'],
  first_name: ['ad', 'vorname', 'firstname', 'first name', 'isim'],
  last_name: ['soyad', 'nachname', 'lastname', 'last name', 'familienname'],
  name: ['ad soyad', 'ad / soyad', 'vollname', 'full name', 'isim soyisim', 'name'],
  plz: ['plz', 'posta kodu', 'postleitzahl', 'zip', 'pk'],
  city: ['şehir', 'sehir', 'stadt', 'ort', 'ortschaft', 'city'],
  address: ['adres', 'adresse', 'strasse', 'straße', 'street', 'sokak'],
  house_no: ['no', 'nr', 'hausnr', 'hausnummer', 'numara', 'kapı no', 'kapi no'],
  notes: ['notiz', 'notes', 'notlar', 'note'],
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
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

function mbNormalizeDialPhone(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  s = s.replace(/[\s()\/.-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (/^[1-9]\d{7,14}$/.test(s)) s = `+${s}`;
  return s;
}

function mbComposeDialPhone(phone, cc, vorwahl) {
  const raw = String(phone == null ? '' : phone).trim();
  const ccRaw = String(cc == null ? '' : cc).trim();
  const areaRaw = String(vorwahl == null ? '' : vorwahl).trim();
  const direct = mbNormalizeDialPhone(phone);
  const explicitIntl = /^\+|^00/.test(raw.replace(/[\s()\/.-]/g, ''));
  if (!ccRaw && !areaRaw) return direct;
  if (explicitIntl && direct && typeof mbIsE164 === 'function' && mbIsE164(direct)) return direct;
  const digits = (value) => {
    let s = String(value == null ? '' : value).trim();
    if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
    s = s.replace(/[\s()\/.-]/g, '');
    if (s.startsWith('+')) s = s.slice(1);
    if (s.startsWith('00')) s = s.slice(2);
    return s.replace(/\D/g, '');
  };
  let country = digits(ccRaw);
  let area = digits(areaRaw);
  let local = digits(phone);
  if (country && area.startsWith(country) && area.length > country.length) area = area.slice(country.length);
  area = area.replace(/^0+/, '');
  if ((country || area) && local.startsWith('0')) local = local.replace(/^0+/, '');
  if (!country && area) country = '49';
  if (!local || (!country && !area)) return direct;
  if (country && !area && local.startsWith(country) && local.length >= country.length + 6) {
    return mbNormalizeDialPhone(`+${local}`);
  }
  if (area && local.startsWith(area) && local.length >= area.length + 7) {
    return mbNormalizeDialPhone(`+${country}${local}`);
  }
  return mbNormalizeDialPhone(`+${country}${area}${local}`);
}

function mbClassifyLeadRows(rows, opts) {
  const keepDup = !!(opts && opts.keepDuplicates);
  const seen = new Set();
  const accepted = [];
  const skipped = { empty: 0, invalid: 0, duplicate: 0 };
  (rows || []).forEach((row) => {
    const phone = mbNormalizeDialPhone(row?.phone);
    if (!phone) { skipped.empty += 1; return; }
    if (typeof mbIsE164 !== 'function' || !mbIsE164(phone)) { skipped.invalid += 1; return; }
    if (!keepDup && seen.has(phone)) { skipped.duplicate += 1; return; }
    if (!keepDup) seen.add(phone);
    accepted.push({ ...row, phone });
  });
  return { accepted, skipped };
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
{key:'durum',        label:'QC sonucu',        required:false},
{key:'kampanya',     label:'Kampanya',         required:false},
{key:'personel',     label:'Personel',         required:false},
{key:'musteri',      label:'Müşteri',          required:false},
{key:'hausart',      label:'Ev tipi',          required:false},
{key:'baujahr',      label:'Yapım yılı',       required:false},
{key:'qm',           label:'m²',               required:false},
{key:'heizung',      label:'Isıtma',           required:false},
{key:'alter_der_heizung', label:'Isıtma yaşı', required:false},
{key:'verbrauch_pro_jahr', label:'Tüketim/yıl', required:false},
{key:'personen',     label:'Kişi sayısı',      required:false},
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
{ key:'phone',      labelKey:'uq.field.phone', required:true },
{ key:'phone2',     labelKey:'uq.field.phone2' },
{ key:'cc',         labelKey:'uq.field.cc' },
{ key:'vorwahl',    labelKey:'uq.field.vorwahl' },
{ key:'name',       labelKey:'uq.field.name' },
{ key:'first_name', labelKey:'uq.field.first' },
{ key:'last_name',  labelKey:'uq.field.last' },
{ key:'plz',        labelKey:'uq.field.plz' },
{ key:'city',       labelKey:'uq.field.city' },
{ key:'address',    labelKey:'uq.field.address' },
{ key:'house_no',   labelKey:'uq.field.houseno' },
{ key:'notes',      labelKey:'uq.field.notes' },
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

function mbBusinessToday() {
  if (typeof mbBusinessNow === 'function') {
    const day = mbBusinessNow().dateStr;
    if (day) return day;
  }
  return new Date().toISOString().split('T')[0];
}

function mbShiftDate(day, deltaDays) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(day || '');
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(deltaDays || 0)));
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function mbInstantGte(day) {
  return mbWallToIso(`${day}T00:00`) || `${day}T00:00:00`;
}

function mbInstantLte(day) {
  const iso = mbWallToIso(`${day}T23:59`);
  if (!iso) return `${day}T23:59:59`;
  return new Date(new Date(iso).getTime() + 59999).toISOString();
}

function mbBerlinHour(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return 0;
  const p = mbZonedParts(dt, MB_BUSINESS_TZ);
  const h = Number(p.hour);
  return Number.isFinite(h) ? h : dt.getHours();
}

function mbIsoToWallInput(iso, timeZone) {
  if (!iso) return '';
  const p = mbZonedParts(new Date(iso), timeZone || MB_BUSINESS_TZ);
  if (!p.year) return '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function mbStampParts(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const p = mbZonedParts(value, MB_BUSINESS_TZ);
    return p.year ? p : null;
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const zoned = /[zZ]$|[+-]\d\d:?\d\d$/.test(raw);
  if (!zoned && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return { year: m[1], month: m[2], day: m[3], hour: m[4] || '', minute: m[5] || '' };
  }
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  const p = mbZonedParts(dt, MB_BUSINESS_TZ);
  return p.year ? p : null;
}

function mbFormatWall(iso, opts, kind) {
  const p = mbStampParts(iso);
  if (!p) return '—';
  const o = opts || {};
  const names = Object.keys(o);
  const has = (k) => Object.prototype.hasOwnProperty.call(o, k);
  let date = kind !== 'time';
  let time = kind !== 'date';
  if (!kind || kind === 'both') {
    if (names.length) {
      date = has('day') || has('month') || has('year') || has('weekday');
      time = has('hour') || has('minute') || has('second');
      if (!date && !time) { date = true; time = true; }
    }
  }
  const loc = typeof mbLocale === 'function' ? mbLocale() : 'tr-TR';
  const dayNum = String(p.day || '').padStart(2, '0');
  const monthNum = String(p.month || '').padStart(2, '0');
  let hourNum = String(p.hour || '').padStart(2, '0');
  if (hourNum === '24') hourNum = '00';
  const minuteNum = String(p.minute || '00').padStart(2, '0');
  const clock = p.hour === '' || p.hour == null ? '' : `${hourNum}:${minuteNum}`;
  if ((o.month === 'short' || o.month === 'long') && !has('day') && !has('weekday')) {
    const dt = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) || 1));
    return new Intl.DateTimeFormat(loc, { month: o.month, year: o.year || 'numeric', timeZone: 'UTC' }).format(dt);
  }
  const bits = [];
  if (date) {
    let stamp = `${dayNum}.${monthNum}.${p.year}`;
    if (o.weekday) {
      const dt = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
      const wd = new Intl.DateTimeFormat(loc, { weekday: o.weekday, timeZone: 'UTC' }).format(dt);
      stamp = `${wd} ${stamp}`;
    }
    bits.push(stamp);
  }
  if (time && clock) bits.push(clock);
  return bits.join(' ') || '—';
}

function mbEuroFaceText(el) {
  const v = String(el?.value || '');
  if (!v) return '';
  if (el.type === 'time') {
    const m = v.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : v.slice(0, 5);
  }
  if (el.type === 'date') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : v;
}

function mbEuroParseFace(el, text) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (el.type === 'time') {
    const m = s.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return null;
    return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
  }
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2})[:.](\d{2}))?$/);
  if (!m) return null;
  const day = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  if (el.type === 'date') return day;
  const hh = String(m[4] || '0').padStart(2, '0');
  const mm = m[5] || '00';
  return `${day}T${hh}:${mm}`;
}

function mbAttachEuroDate(el) {
  if (!el || el.dataset.mbEuro === '1') return;
  if (!['date', 'time', 'datetime-local'].includes(el.type)) return;
  const parent = el.parentNode;
  if (!parent) return;
  el.dataset.mbEuro = '1';
  const wrap = document.createElement('span');
  wrap.className = 'mb-euro-date';
  if (el.style.width) wrap.style.width = el.style.width;
  if (el.style.flex) wrap.style.flex = el.style.flex;
  if (el.style.minWidth) wrap.style.minWidth = el.style.minWidth;
  parent.insertBefore(wrap, el);
  wrap.appendChild(el);
  el.style.width = '100%';
  const face = document.createElement('input');
  face.type = 'text';
  face.className = 'mb-euro-date__face';
  face.autocomplete = 'off';
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  face.placeholder = el.type === 'time' ? 'ss:dd' : (el.type === 'date' ? (de ? 'tt.mm.jjjj' : 'gg.aa.yyyy') : (de ? 'tt.mm.jjjj ss:mm' : 'gg.aa.yyyy ss:dd'));
  face.value = mbEuroFaceText(el);
  el._mbEuroFace = face;
  wrap.appendChild(face);
  const commit = () => {
    const next = mbEuroParseFace(el, face.value);
    if (next == null) {
      face.value = mbEuroFaceText(el);
      return;
    }
    if (el.value !== next) {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc.set.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    face.value = mbEuroFaceText(el);
  };
  face.addEventListener('change', commit);
  face.addEventListener('blur', commit);
  face.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commit();
    }
  });
  el.addEventListener('change', () => {
    if (document.activeElement !== face) face.value = mbEuroFaceText(el);
  });
}

function mbScanEuroDates(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('input[type="date"],input[type="time"],input[type="datetime-local"]').forEach(mbAttachEuroDate);
}

function mbBootEuroDates() {
  if (window._mbEuroDates) return;
  window._mbEuroDates = true;
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (desc?.set && desc?.get) {
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(this); },
      set(v) {
        desc.set.call(this, v);
        if (this._mbEuroFace && document.activeElement !== this._mbEuroFace) {
          this._mbEuroFace.value = mbEuroFaceText(this);
        }
      },
    });
  }
  const paint = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches('input[type="date"],input[type="time"],input[type="datetime-local"]')) mbAttachEuroDate(node);
    else if (node.querySelectorAll) mbScanEuroDates(node);
  };
  mbScanEuroDates(document);
  if (!document.body) return;
  new MutationObserver((list) => {
    list.forEach((rec) => rec.addedNodes.forEach(paint));
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.body) mbBootEuroDates();
else document.addEventListener('DOMContentLoaded', mbBootEuroDates);

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
