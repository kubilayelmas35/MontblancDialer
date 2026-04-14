// ─────────────────────────────────────────────
// CONFIG — sabitler ve API anahtarları
// ─────────────────────────────────────────────
const SB_URL = 'https://gsvvhzyhdhkbozjnlyrn.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdnZoenloZGhrYm96am5seXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjYwMTIsImV4cCI6MjA5MTM0MjAxMn0.PzpCpIO_aIg6JxiwRd7PuqGW9tn3qCKfyT31RpSF1go';
const SB_KEY = SB_ANON_KEY;

const DEFAULT_GOOGLE_KEY = 'AIzaSyDzUsnQG-sKIO6wseQEbfrOOHRvwSyGUoM';
const DEFAULT_TOMTOM_KEY = 'Ny6ghuTMCaMGRnD3v6vhe67rG7XvqZTX';

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

const DEFAULT_AUX_CODES = ['Yemek Molası','Çay Molası','Lavabo','Toplantı','Teknik Sorun'];

const DEFAULT_OUTCOMES = [
{key:'appointment', label:'Termin',        enabled:true,  color:'green'},
{key:'negative',    label:'Olumsuz',       enabled:true,  color:'red'},
{key:'callback',    label:'Geri Ara',      enabled:true,  color:'blue'},
{key:'no_answer',   label:'Cevap Yok',     enabled:true,  color:'gray'},
{key:'dnc',         label:'Kara Liste',    enabled:true,  color:'red'},
{key:'voicemail',   label:'Telesekreter',  enabled:false, color:'gray'},
];

const IA_FIELDS = [
{key:'nachname',     label:'Ad Soyad *',      required:true},
{key:'telefon',      label:'Telefon *',        required:true},
{key:'telefon2',     label:'Telefon 2',        required:false},
{key:'strasse',      label:'Adres/Sokak',      required:false},
{key:'plz',          label:'PLZ',              required:false},
{key:'ort',          label:'Şehir',            required:false},
{key:'termin_tarih', label:'Termin Tarihi *',  required:true},
{key:'termin_saat',  label:'Termin Saati',     required:false},
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
{ key:'last_name',  label:'👤 Soyad' },
{ key:'first_name', label:'👤 Ad' },
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

function isValidUUID(id) {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
