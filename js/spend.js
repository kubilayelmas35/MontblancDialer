// Süper admin gider tablosu. Sol: yayınlanan Telnyx USD. Sağ: bakiyeden düşülen.
// Almanya yerel liste (sabit 0.01, mobil 0.029) + çağrı kontrolü 0.002.
// Kayıt 0.002, yalnız Telnyx kaydı ve dosya varsa. Müzik 0.

const SPEND_VOICE_USD = 0.002;
const SPEND_REC_USD = 0.002;
const SPEND_DEST_USD = [
  { prefix: '491', price: 0.029 },
  { prefix: '49', price: 0.01 },
];

let _spendRows = [];
let _spendFirms = [];

function spendSay(key, fb) {
  if (typeof t !== 'function') return fb;
  const val = t(key);
  return val && val !== key ? val : fb;
}

function spendNum(n) {
  const x = Math.round((Number(n) || 0) * 10000) / 10000;
  if (!x) return '0';
  return x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function spendPair(real, sale) {
  return `${spendNum(real)}/${spendNum(sale)}`;
}

function spendEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function spendRange() {
  const mode = document.getElementById('spend-range')?.value || 'today';
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  let from = today;
  if (mode === 'week') from = typeof mbShiftDate === 'function' ? mbShiftDate(today, -6) : today;
  if (mode === 'month') from = `${String(today).slice(0, 8)}01`;
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
  return { gte, lte };
}

function spendWhen(iso) {
  if (!iso) return '';
  const lang = typeof currentLang !== 'undefined' && currentLang === 'de' ? 'de-DE' : 'tr-TR';
  try {
    return new Date(iso).toLocaleString(lang, {
      timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return String(iso).slice(0, 16);
  }
}

function spendDur(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function spendFirm(id) {
  return _spendFirms.find((firm) => String(firm.id) === String(id)) || null;
}

function spendSaleRates(firm) {
  if (typeof mbBillPlan !== 'function') return [];
  return mbBillPlan(firm?.settings?.billing).rates || [];
}

function spendParts(row) {
  const sec = Math.max(0, Number(row?.duration_sec) || 0);
  const firm = spendFirm(row?.firm_id);
  const minutes = sec / 60;
  const dest = sec > 0 && typeof statsMatchRate === 'function' ? statsMatchRate(row.phone, SPEND_DEST_USD) : null;
  const saleRate = sec > 0 && typeof statsMatchRate === 'function' ? statsMatchRate(row.phone, spendSaleRates(firm)) : null;
  const callRealMin = sec > 0 ? (Number(dest?.price) || 0) + SPEND_VOICE_USD : 0;
  const callSaleMin = sec > 0 ? (Number(saleRate?.price) || 0) : 0;
  const callReal = minutes * callRealMin;
  let callSale = 0;
  if (row?.cost_usd != null && row.cost_usd !== '' && Number(row.cost_usd) > 0) callSale = Number(row.cost_usd);
  else if (typeof mbCallEuros === 'function') callSale = Number(mbCallEuros(row.phone, sec, spendSaleRates(firm))) || 0;
  const telnyxRec = firm?.settings?.recording_source === 'telnyx' && row?.recording_url && sec > 0;
  const recRealMin = telnyxRec ? SPEND_REC_USD : 0;
  const recReal = minutes * recRealMin;
  return {
    callRealMin,
    callSaleMin,
    callReal,
    callSale,
    recRealMin,
    recReal,
    real: callReal + recReal,
    sale: callSale,
  };
}

function spendCell(rateReal, rateSale, amtReal, amtSale) {
  return `<td class="spend-num"><span class="spend-rate">${spendEsc(spendPair(rateReal, rateSale))}</span><span class="spend-amt">${spendEsc(spendPair(amtReal, amtSale))}</span></td>`;
}

function spendFillFirms() {
  const sel = document.getElementById('spend-firm');
  if (!sel) return;
  const prev = sel.value;
  const all = spendSay('spend.all', 'Tüm firmalar');
  const opts = _spendFirms.map((firm) => `<option value="${spendEsc(firm.id)}">${spendEsc(firm.name || '')}</option>`).join('');
  sel.innerHTML = `<option value="">${spendEsc(all)}</option>${opts}`;
  if (prev && [...sel.options].some((opt) => opt.value === prev)) sel.value = prev;
}

function spendPaint() {
  const body = document.getElementById('spend-tbody');
  const cards = document.getElementById('spend-cards');
  if (!body) return;
  const rows = _spendRows || [];
  const bag = { callReal: 0, callSale: 0, recReal: 0, real: 0, sale: 0 };
  const html = rows.map((row) => {
    const firm = spendFirm(row.firm_id);
    const part = spendParts(row);
    bag.callReal += part.callReal;
    bag.callSale += part.callSale;
    bag.recReal += part.recReal;
    bag.real += part.real;
    bag.sale += part.sale;
    const total = spendPair(part.real, part.sale);
    return `<tr>
<td>${spendEsc(spendWhen(row.started_at))}</td>
<td>${spendEsc(firm?.name || '')}</td>
<td class="spend-num">${spendEsc(spendDur(row.duration_sec))}</td>
${spendCell(part.callRealMin, part.callSaleMin, part.callReal, part.callSale)}
${spendCell(part.recRealMin, 0, part.recReal, 0)}
${spendCell(0, 0, 0, 0)}
<td class="spend-num"><span class="spend-rate">${spendEsc(total)}</span></td>
</tr>`;
  }).join('');
  if (!rows.length) {
    body.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(7, 'spend.empty') : '<tr><td colspan="7"></td></tr>';
  } else {
    const cap = rows.capped ? `<tr><td colspan="7" class="mb-empty-hint">${spendEsc(spendSay('spend.capped', 'Liste dolu. Aralığı daraltın.'))}</td></tr>` : '';
    body.innerHTML = html + cap;
  }
  if (cards) {
    const card = (label, real, sale) => `<div class="spend-card"><small>${spendEsc(label)}</small><b>${spendEsc(spendPair(real, sale))}</b></div>`;
    cards.innerHTML = [
      card(spendSay('spend.card.call', 'Çağrı'), bag.callReal, bag.callSale),
      card(spendSay('spend.card.rec', 'Kayıt'), bag.recReal, 0),
      card(spendSay('spend.card.music', 'Müzik'), 0, 0),
      card(spendSay('spend.card.total', 'Toplam'), bag.real, bag.sale),
    ].join('');
  }
}

async function loadSpendPage() {
  const body = document.getElementById('spend-tbody');
  if (typeof mbIsSuperAdmin === 'function' && !mbIsSuperAdmin()) return;
  if (body) body.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(7) : '';
  const range = spendRange();
  const firmId = document.getElementById('spend-firm')?.value || '';
  const firmQ = firmId ? `&firm_id=eq.${firmId}` : '';
  try {
    const firms = await sb('firms?select=id,name,settings,currency&order=name.asc');
    _spendFirms = firms || [];
    spendFillFirms();
    const q = `call_logs?select=id,started_at,phone,duration_sec,cost_usd,firm_id,recording_url&started_at=gte.${range.gte}&started_at=lte.${range.lte}${firmQ}&order=started_at.desc`;
    const rows = await mbFetchAll(q);
    _spendRows = rows || [];
    spendPaint();
  } catch (e) {
    console.error(e);
    if (body) body.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(7, e?.message || '') : '';
  }
}
