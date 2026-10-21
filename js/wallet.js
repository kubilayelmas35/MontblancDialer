async function getFirmWallet(fid) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return { balance: 0, reserved_balance: 0, available: 0 };
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,balance,reserved_balance,settings`);
    const f = firms?.[0] || {};
    const balance = Number(f.balance || 0);
    const reserved = Number(f.reserved_balance || 0);
    const overdraft = Math.max(0, Number(f.settings?.billing?.overdraft) || 0);
    const warnAmount = Number(f.settings?.billing?.warn_amount) || 0;
    const spendable = balance - reserved + overdraft;
    return {
      balance,
      reserved_balance: reserved,
      overdraft,
      warn_amount: warnAmount,
      available: Math.max(spendable, 0),
    };
  } catch (e) {
    return { balance: 0, reserved_balance: 0, available: 0 };
  }
}

function normalizeCurrency(cur) {
  const c = String(cur || '').trim().toUpperCase();
  return ['EUR', 'USD', 'TRY'].includes(c) ? c : 'EUR';
}

function getCurrencySymbol(cur) {
  const c = normalizeCurrency(cur);
  return ({ EUR: '€', USD: '$', TRY: '₺' })[c] || c;
}

function formatMoney(amount, cur) {
  const c = normalizeCurrency(cur);
  const sym = getCurrencySymbol(c);
  return `${sym}${Number(amount || 0).toFixed(2)}`;
}

async function getFirmCurrency(fid) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return 'EUR';
  try {
    const rows = await sb(`firms?id=eq.${firmId}&select=currency,settings`);
    const f = rows?.[0] || {};
    return normalizeCurrency(f.currency || f.settings?.currency || f.settings?.payroll?.currency || 'EUR');
  } catch (_) {
    return 'EUR';
  }
}

async function refreshWalletInfo() {
  const el = document.getElementById('jm-wallet-info');
  if (!el) return;
  const ownerFirmId = mbIsSuperAdmin()
    ? (document.getElementById('jm-owner-firm')?.value || currentUser?.firm_id)
    : (getActiveFirmId() || currentUser?.firm_id);
  const w = await getFirmWallet(ownerFirmId);
  const cur = await getFirmCurrency(ownerFirmId);
  const extra = w.overdraft > 0 ? ` | Eksi limit: ${formatMoney(w.overdraft, cur)}` : '';
  el.textContent = `Bakiye: ${formatMoney(w.balance, cur)} | Rezerve: ${formatMoney(w.reserved_balance, cur)} | Kullanılabilir: ${formatMoney(w.available, cur)}${extra}`;
}

async function loadJobFinanceSummary() {
  const wrap = document.getElementById('dash-job-market-kpi');
  if (!wrap) return;
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) return;
  const rows = await sb(`wallet_ledger?firm_id=eq.${fid}&select=entry_type,amount,created_at&order=created_at.desc&limit=500`).catch(() => []);
  const cur = await getFirmCurrency(fid);
  let charge = 0;
  let reward = 0;
  let reserve = 0;
  (rows || []).forEach((r) => {
    const amt = Number(r.amount || 0);
    if (r.entry_type === 'charge') charge += amt;
    if (r.entry_type === 'reward') reward += amt;
    if (r.entry_type === 'reserve') reserve += amt;
  });
  if (!document.getElementById('kpi-job-finance')) {
    const host = document.createElement('div');
    host.id = 'kpi-job-finance';
    host.style.cssText = 'margin-top:8px;font-size:11px;color:var(--text-3);';
    wrap.appendChild(host);
  }
  const el = document.getElementById('kpi-job-finance');
  if (el) el.textContent = `${t('fin.prefix')} · ${t('fin.charge')}: ${formatMoney(charge, cur)} | ${t('fin.reward')}: ${formatMoney(reward, cur)} | ${t('fin.reserve')}: ${formatMoney(reserve, cur)}`;
}

const MB_DEFAULT_RATES = [
  { prefix: '49', name: 'Almanya sabit', price: 0.025 },
  { prefix: '491', name: 'Almanya mobil', price: 0.055 },
];

function mbBillZone() {
  return 'Europe/Istanbul';
}

function mbBillToday(zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone || mbBillZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return { y: Number(pick('year')), m: Number(pick('month')), d: Number(pick('day')), iso: `${pick('year')}-${pick('month')}-${pick('day')}` };
}

function mbBillPlan(billing) {
  const src = billing && typeof billing === 'object' ? billing : {};
  const rates = Array.isArray(src.rates) ? src.rates.filter((row) => String(row?.prefix || '').replace(/\D/g, '')) : [];
  const day = Math.min(28, Math.max(1, parseInt(src.bill_day, 10) || 1));
  const feeRaw = src.monthly_fee;
  const monthly = feeRaw == null || feeRaw === '' ? 100 : Math.max(0, Number(feeRaw) || 0);
  return {
    overdraft: Math.max(0, Number(src.overdraft) || 0),
    warn_amount: Number(src.warn_amount) || 0,
    agent_cap: Math.max(0, parseInt(src.agent_cap, 10) || 0),
    monthly_fee: monthly,
    bill_day: day,
    grace_days: Math.max(0, parseInt(src.grace_days, 10) || 3),
    rates: rates.length ? rates : (src.rates_set ? [] : MB_DEFAULT_RATES.slice()),
    rates_set: !!src.rates_set || rates.length > 0,
    fee_months: Array.isArray(src.fee_months) ? src.fee_months.map((item) => String(item)) : [],
  };
}

function mbNextBill(plan, today) {
  const now = today || mbBillToday();
  let y = now.y;
  let m = now.m;
  if (now.d > plan.bill_day) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  const due = { y, m, d: plan.bill_day };
  const from = Date.UTC(now.y, now.m - 1, now.d);
  const to = Date.UTC(due.y, due.m - 1, due.d);
  return { ...due, days: Math.round((to - from) / 86400000), key: `${due.y}-${String(due.m).padStart(2, '0')}` };
}

function mbCallEuros(phone, seconds, rates) {
  const sec = Math.max(0, Number(seconds) || 0);
  if (!sec) return 0;
  const rate = typeof statsMatchRate === 'function' ? statsMatchRate(phone, rates) : null;
  if (!rate) return null;
  return Math.round(((sec / 60) * (Number(rate.price) || 0)) * 100) / 100;
}

async function mbLoadBillFirm(firmId) {
  const rows = await sb(`firms?id=eq.${firmId}&select=id,name,balance,reserved_balance,currency,settings`);
  const firm = rows?.[0];
  if (!firm) return null;
  const settings = firm.settings && typeof firm.settings === 'object' ? firm.settings : {};
  const billing = settings.billing && typeof settings.billing === 'object' ? settings.billing : {};
  const plan = mbBillPlan(billing);
  if (!billing.rates_set && !(Array.isArray(billing.rates) && billing.rates.length)) {
    const nextBilling = {
      ...billing,
      rates: MB_DEFAULT_RATES.slice(),
      rates_set: true,
      monthly_fee: plan.monthly_fee,
      bill_day: plan.bill_day,
      grace_days: plan.grace_days,
    };
    const next = { ...settings, billing: nextBilling };
    await sb(`firms?id=eq.${firmId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: next }),
    });
    firm.settings = next;
  }
  window._tbBalPlan = firm.settings?.billing || {};
  return firm;
}

async function mbDebitFirm(firmId, amount) {
  const take = Math.round(Number(amount) * 100) / 100;
  if (!(take > 0)) return null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await sb(`firms?id=eq.${firmId}&select=balance`);
    const cur = Number(rows?.[0]?.balance || 0);
    const next = Math.round((cur - take) * 100) / 100;
    const updated = await sb(`firms?id=eq.${firmId}&balance=eq.${cur}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({ balance: next }),
    });
    if (Array.isArray(updated) && updated.length) return next;
  }
  const rows = await sb(`firms?id=eq.${firmId}&select=balance`);
  const cur = Number(rows?.[0]?.balance || 0);
  const next = Math.round((cur - take) * 100) / 100;
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ balance: next }),
  });
  return next;
}

async function mbChargeSavedCall(row, rates) {
  if (!row?.id) return 0;
  if (row.cost_usd != null && Number(row.cost_usd) > 0) return 0;
  const euros = mbCallEuros(row.phone, row.duration_sec, rates);
  if (euros == null) return 0;
  const marked = await sb(`call_logs?id=eq.${row.id}&or=(cost_usd.is.null,cost_usd.eq.0)`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: JSON.stringify({ cost_usd: euros }),
  });
  if (!Array.isArray(marked) || !marked.length) return 0;
  return euros;
}

async function mbSettleUnbilled(firmId) {
  const firm = await mbLoadBillFirm(firmId);
  if (!firm) return { n: 0, eur: 0 };
  const plan = mbBillPlan(firm.settings?.billing);
  if (!plan.rates.length) return { n: 0, eur: 0 };
  const rows = await sb(`call_logs?select=id,phone,duration_sec,cost_usd,firm_id&firm_id=eq.${firmId}&duration_sec=gt.0&or=(cost_usd.is.null,cost_usd.eq.0)&limit=500`).catch(() => []);
  let eur = 0;
  let n = 0;
  const list = rows || [];
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const row = list[cursor];
      cursor += 1;
      const got = await mbChargeSavedCall(row, plan.rates);
      if (got > 0) {
        eur += got;
        n += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  eur = Math.round(eur * 100) / 100;
  if (eur > 0) await mbDebitFirm(firmId, eur);
  await mbChargeMonthlyFee(firmId);
  return { n, eur };
}

async function mbChargeMonthlyFee(firmId) {
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`);
  const settings = rows?.[0]?.settings && typeof rows[0].settings === 'object' ? rows[0].settings : {};
  const billing = settings.billing && typeof settings.billing === 'object' ? settings.billing : {};
  const plan = mbBillPlan(billing);
  if (!(plan.monthly_fee > 0)) return 0;
  const due = mbNextBill(plan);
  if (due.days !== 0) return 0;
  if (plan.fee_months.includes(due.key)) return 0;
  const feeMonths = plan.fee_months.concat(due.key).slice(-24);
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...settings, billing: { ...billing, fee_months: feeMonths, monthly_fee: plan.monthly_fee, bill_day: plan.bill_day, grace_days: plan.grace_days, rates_set: true } } }),
  });
  await mbDebitFirm(firmId, plan.monthly_fee);
  return plan.monthly_fee;
}

function mbKickBilling(firmId) {
  if (!firmId || !mbIsFirmAdmin()) return;
  window._mbBillKick = window._mbBillKick || {};
  if (window._mbBillKick[firmId]) return;
  window._mbBillKick[firmId] = mbSettleUnbilled(firmId).then(async (settled) => {
    const wallet = await getFirmWallet(firmId);
    window._tbBalWallet = wallet;
    if (typeof mbPaintBalChip === 'function') mbPaintBalChip(Number(wallet.balance || 0), window._tbBalCur || 'EUR');
    const pop = document.getElementById('tb-bal-pop');
    if (pop && !pop.hidden && typeof mbFillBalPop === 'function') mbFillBalPop(pop);
    if (typeof mbPaintFirmDesk === 'function' && document.getElementById('page-firmdesk')?.classList.contains('active')) {
      mbPaintFirmDesk();
    }
    return settled;
  }).catch(() => null);
}

async function mbChargeCall(row) {
  const firmId = row?.firm_id || currentUser?.firm_id;
  if (!row?.id || !firmId) return 0;
  const firm = await mbLoadBillFirm(firmId);
  const plan = mbBillPlan(firm?.settings?.billing);
  const euros = await mbChargeSavedCall(row, plan.rates);
  if (euros > 0) {
    await mbDebitFirm(firmId, euros);
    if (String(window._tbBalFid || '') === String(firmId)) {
      const wallet = await getFirmWallet(firmId);
      window._tbBalWallet = wallet;
      if (typeof mbPaintBalChip === 'function') mbPaintBalChip(Number(wallet.balance || 0), window._tbBalCur || 'EUR');
    }
  }
  return euros;
}
