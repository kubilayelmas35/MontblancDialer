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

async function refreshWalletInfo() {
  const el = document.getElementById('jm-wallet-info');
  if (!el) return;
  const w = await getFirmWallet();
  el.textContent = `Bakiye: ${w.balance.toFixed(2)} | Rezerve: ${w.reserved_balance.toFixed(2)} | Kullanılabilir: ${w.available.toFixed(2)}`;
}
