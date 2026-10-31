function mbFirmDeskSay(key, fb) {
  return typeof t === 'function' ? t(key) : fb;
}

function mbFirmDeskMoney(amount, cur) {
  return typeof formatMoney === 'function' ? formatMoney(amount, cur) : `${Number(amount || 0).toFixed(2)}`;
}

function mbRemindBill(plan, cur) {
  if (!plan || !mbIsFirmAdmin()) return;
  const due = mbNextBill(plan);
  if (due.days > 7) return;
  const key = `mb_bill_ping_${due.key}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (e) {
    return;
  }
  if (typeof opsRememberNotice !== 'function') return;
  const fee = mbFirmDeskMoney(plan.monthly_fee, cur || 'EUR');
  const date = `${String(due.d).padStart(2, '0')}.${String(due.m).padStart(2, '0')}.${due.y}`;
  const text = typeof tReplace === 'function'
    ? tReplace('firm.desk.remind', { fee, date, n: due.days })
    : `${fee} · ${date}`;
  opsRememberNotice(mbFirmDeskSay('firm.desk.fee', 'Aylık kullanım'), text, '#d97706', 'live');
}

async function loadFirmDesk() {
  const host = document.getElementById('firmdesk-body');
  const edit = document.getElementById('firmdesk-edit');
  if (!host) return;
  if (edit) edit.textContent = mbFirmDeskSay('firm.desk.edit', 'Ücreti düzenle');
  host.innerHTML = `<div class="firmdesk-note">${mbFirmDeskSay('tb.bal_loading', 'Hesaplanıyor…')}</div>`;
  const fid = (typeof getActiveFirmId === 'function' && getActiveFirmId()) || currentUser?.firm_id;
  if (!fid) {
    host.innerHTML = `<div class="firmdesk-note">${mbFirmDeskSay('tb.bal_none', 'Firma seçilmedi')}</div>`;
    return;
  }
  if (typeof mbKickBilling === 'function') mbKickBilling(fid);
  try { await window._mbBillKick?.[fid]; } catch (e) {}
  const rows = await sb(`firms?id=eq.${fid}&select=id,name,balance,reserved_balance,currency,settings`).catch(() => []);
  const firm = rows?.[0];
  if (!firm) {
    host.innerHTML = `<div class="firmdesk-note">${mbFirmDeskSay('firm.load_fail', 'Yüklenemedi')}</div>`;
    return;
  }
  window._firmDesk = firm;
  window._firmsPageData = window._firmsPageData || { firms: [], users: [] };
  const list = window._firmsPageData.firms || [];
  const at = list.findIndex((item) => item.id === firm.id);
  if (at >= 0) list[at] = firm;
  else list.push(firm);
  window._firmsPageData.firms = list;
  const ops = typeof mbHeadCount === 'function'
    ? await mbHeadCount(`users?firm_id=eq.${fid}&is_active=eq.true&select=id`).catch(() => 0)
    : 0;
  window._firmDeskOps = ops || 0;
  mbPaintFirmDesk();
}

function mbPaintFirmDesk() {
  const host = document.getElementById('firmdesk-body');
  const firm = window._firmDesk;
  if (!host || !firm) return;
  const cur = typeof normalizeCurrency === 'function' ? normalizeCurrency(firm.currency) : (firm.currency || 'EUR');
  const plan = typeof mbBillPlan === 'function' ? mbBillPlan(firm.settings?.billing) : firmBilling(firm);
  const due = typeof mbNextBill === 'function' ? mbNextBill(plan) : { d: plan.bill_day, m: 1, y: 2026, days: 0 };
  const when = `${String(due.d).padStart(2, '0')}.${String(due.m).padStart(2, '0')}.${due.y}`;
  const left = due.days === 0
    ? mbFirmDeskSay('firm.desk.today', 'Bugün kesilir')
    : (typeof tReplace === 'function' ? tReplace('firm.desk.days', { n: due.days }) : `${due.days}`);
  const sub = document.getElementById('firmdesk-sub');
  if (sub) sub.textContent = firm.name || '';
  const reserved = Number(firm.reserved_balance || 0);
  const available = Math.max(Number(firm.balance || 0) - reserved + plan.overdraft, 0);
  const cap = plan.agent_cap > 0 ? ` / ${plan.agent_cap}` : '';
  const rates = plan.rates || [];
  const rateRows = rates.length
    ? rates.map((rate) => `<tr><td>${escapeHtml(rate.prefix || '')}</td><td>${escapeHtml(rate.name || '')}</td><td>${escapeHtml((typeof getCurrencySymbol === 'function' ? getCurrencySymbol(cur) : '€') + Number(rate.price || 0).toFixed(3))}/dk</td></tr>`).join('')
    : `<tr><td colspan="3">${escapeHtml(mbFirmDeskSay('stats.cost_empty', 'Tarife yok'))}</td></tr>`;
  const hold = reserved > 0
    ? `<p class="firmdesk-note">${escapeHtml(mbFirmDeskSay('firm.desk.hold_hint', ''))} ${escapeHtml(mbFirmDeskSay('firm.desk.hold', ''))} ${escapeHtml(mbFirmDeskMoney(reserved, cur))} · ${escapeHtml(mbFirmDeskSay('firm.desk.spend', ''))} ${escapeHtml(mbFirmDeskMoney(available, cur))}</p>`
    : '';
  host.innerHTML = `
<div class="firmdesk-grid">
<div class="firmdesk-card"><small>${escapeHtml(mbFirmDeskSay('tb.bal', 'Bakiye'))}</small><b>${escapeHtml(mbFirmDeskMoney(firm.balance, cur))}</b></div>
<div class="firmdesk-card${due.days <= 7 ? ' is-due' : ''}"><small>${escapeHtml(mbFirmDeskSay('firm.desk.fee', 'Aylık kullanım'))}</small><b>${escapeHtml(mbFirmDeskMoney(plan.monthly_fee, cur))}</b><span>${escapeHtml(left)}</span></div>
<div class="firmdesk-card"><small>${escapeHtml(mbFirmDeskSay('firm.desk.next', 'Sonraki kesim'))}</small><b>${escapeHtml(when)}</b><span>${escapeHtml(mbFirmDeskSay('firm.desk.grace', 'Ödeme süresi'))} ${plan.grace_days}</span></div>
<div class="firmdesk-card"><small>${escapeHtml(mbFirmDeskSay('firm.desk.ops', 'Operatör'))}</small><b>${Number(window._firmDeskOps || 0)}${escapeHtml(cap)}</b><span>${escapeHtml(mbFirmDeskSay('firm.bill.overdraft', 'Eksi limit'))} ${escapeHtml(mbFirmDeskMoney(plan.overdraft, cur))}</span></div>
</div>
${hold}
<div class="firmdesk-card">
<small>${escapeHtml(mbFirmDeskSay('firm.desk.rates', 'Hat ücretleri'))}</small>
<table class="firmdesk-table"><thead><tr><th>Prefix</th><th>${escapeHtml(mbFirmDeskSay('firm.bill.dest', 'Hedef'))}</th><th>${escapeHtml(mbFirmDeskSay('firm.bill.rates', 'Ücret'))}</th></tr></thead><tbody>${rateRows}</tbody></table>
</div>
<p class="firmdesk-note">${escapeHtml(mbFirmDeskSay('tb.bal_note', ''))}</p>`;
  mbRemindBill(plan, cur);
}

function mbFirmDeskEdit() {
  const firm = window._firmDesk;
  if (!firm || typeof openFirmBilling !== 'function') return;
  openFirmBilling(firm.id);
}
