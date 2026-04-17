async function getFirmWallet(fid) {
  const firmId = fid || getActiveFirmId() || currentUser?.firm_id;
  if (!firmId) return { balance: 0, reserved_balance: 0, available: 0 };
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,balance,reserved_balance`);
    const f = firms?.[0] || {};
    const balance = Number(f.balance || 0);
    const reserved = Number(f.reserved_balance || 0);
    return { balance, reserved_balance: reserved, available: Math.max(balance - reserved, 0) };
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
  const ownerFirmId = currentUser?.role === 'super_admin'
    ? (document.getElementById('jm-owner-firm')?.value || currentUser?.firm_id)
    : (getActiveFirmId() || currentUser?.firm_id);
  const w = await getFirmWallet(ownerFirmId);
  const cur = await getFirmCurrency(ownerFirmId);
  el.textContent = `Bakiye: ${formatMoney(w.balance, cur)} | Rezerve: ${formatMoney(w.reserved_balance, cur)} | Kullanılabilir: ${formatMoney(w.available, cur)}`;
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
  if (el) el.textContent = `Finans · Charge: ${formatMoney(charge, cur)} | Reward: ${formatMoney(reward, cur)} | Reserve: ${formatMoney(reserve, cur)}`;
}
