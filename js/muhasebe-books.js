function _mLedgerRows() {
  return window._muhLedgerRows || [];
}

function _mLedgerInMonth(row, ym) {
  const start = String(row?.period_ym || '');
  if (!start) return false;
  if (row.recur) return start <= ym;
  return start === ym;
}

function _mLedgerMonth(rows, ym, rate, currency) {
  const out = { gider: 0, alacakIn: 0, alacakOpen: 0, borcOut: 0, borcOpen: 0, stopaj: 0 };
  (rows || []).forEach((r) => {
    if (!_mLedgerInMonth(r, ym)) return;
    const amt = _mConvertCurrency(Number(r.amount || 0), r.currency || currency, currency, rate);
    const paid = Math.min(amt, _mConvertCurrency(Number(r.paid_amount || 0), r.currency || currency, currency, rate));
    if (r.kind === 'gider') {
      out.gider += amt;
      if (r.stopaj) out.stopaj += amt * 0.2;
    } else if (r.kind === 'alacak') {
      if (r.recur) out.alacakIn += amt;
      else {
        out.alacakIn += paid;
        out.alacakOpen += Math.max(0, amt - paid);
      }
    } else if (r.kind === 'borc') {
      if (r.recur) out.borcOut += amt;
      else {
        out.borcOut += paid;
        out.borcOpen += Math.max(0, amt - paid);
      }
    }
  });
  return out;
}

async function loadPayrollLedger(fid) {
  if (!fid) {
    window._muhLedgerRows = [];
    return [];
  }
  try {
    const rows = await sb(`payroll_ledger?firm_id=eq.${fid}&select=*&order=created_at.desc`);
    window._muhLedgerRows = rows || [];
  } catch (e) {
    window._muhLedgerRows = [];
  }
  return window._muhLedgerRows;
}

function renderSalaryCategoryEditor(cats) {
  const box = document.getElementById('muh-cat-editor');
  if (!box) return;
  const list = Array.isArray(cats) ? cats : [];
  box.dataset.count = String(list.length);
  if (!list.length) {
    box.innerHTML = `<div style="color:var(--text-3);font-size:12px;padding:8px 0;">${_mEsc(t('muh.cat.empty'))}</div>`;
    return;
  }
  const tierRows = (cat, i, type) => {
    const prefix = type === 'bonus' ? 'b' : 's';
    const rows = type === 'bonus' ? (cat.bonus_tiers || []) : (cat.salary_tiers || []);
    const label = type === 'bonus' ? t('muh.cat.bonus') : t('muh.cat.salary');
    return `<div style="margin-top:8px;">
      <div class="form-label">${_mEsc(label)}</div>
      <div id="mcat-${i}-${prefix}-rows" data-count="${rows.length}" style="display:flex;flex-direction:column;gap:6px;">
        ${rows.map((r, j) => `<div style="display:grid;grid-template-columns:70px 70px 1fr ${type === 'bonus' ? '140px ' : ''}80px auto;gap:6px;align-items:end;">
          <input class="form-input" type="number" id="mcat-${i}-${prefix}-min-${j}" value="${Number(r.min || 0)}" placeholder="Min">
          <input class="form-input" type="number" id="mcat-${i}-${prefix}-max-${j}" value="${Number(r.max || 0)}" placeholder="Max">
          <input class="form-input" type="number" step="0.01" id="mcat-${i}-${prefix}-amt-${j}" value="${Number(r.amount || 0)}">
          ${type === 'bonus' ? `<select class="form-input" id="mcat-${i}-${prefix}-calc-${j}">
            <option value="fixed" ${(r.calc_type || 'fixed') === 'fixed' ? 'selected' : ''}>${_mEsc(t('muh.cat.fixed'))}</option>
            <option value="per_appointment" ${r.calc_type === 'per_appointment' ? 'selected' : ''}>${_mEsc(t('muh.cat.per'))}</option>
          </select>` : ''}
          <select class="form-input" id="mcat-${i}-${prefix}-cur-${j}">
            <option value="EUR" ${String(r.currency || 'EUR') === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="TRY" ${String(r.currency || '') === 'TRY' ? 'selected' : ''}>TRY</option>
          </select>
          <button class="btn btn-ghost btn-sm" type="button" onclick="removeCatTier(${i},'${type}',${j})">${_mEsc(t('muh.del'))}</button>
        </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" type="button" style="margin-top:6px;" onclick="addCatTier(${i},'${type}')">+ ${_mEsc(label)}</button>
      <div style="font-size:11px;color:var(--text-3);margin-top:4px;">${_mEsc(t('muh.cat.inherit'))}</div>
    </div>`;
  };
  box.innerHTML = list.map((c, i) => `<div class="card" style="padding:12px;margin-bottom:10px;">
    <input type="hidden" id="mcat-id-${i}" value="${_mEsc(c.id || '')}">
    <div style="display:grid;grid-template-columns:1.4fr repeat(3,minmax(90px,1fr)) auto;gap:8px;align-items:end;">
      <div class="form-row"><label class="form-label">${_mEsc(t('muh.cat.name'))}</label><input class="form-input" id="mcat-name-${i}" value="${_mEsc(c.name || '')}"></div>
      <div class="form-row"><label class="form-label">${_mEsc(t('muh.cat.base'))}</label><input class="form-input" type="number" step="0.01" id="mcat-base-${i}" value="${Number(c.base_salary_amount || 0)}"></div>
      <div class="form-row"><label class="form-label">${_mEsc(t('muh.sgk'))} %</label><input class="form-input" type="number" step="0.01" id="mcat-sgk-${i}" value="${Number(c.sgk_percent || 0)}"></div>
      <div class="form-row"><label class="form-label">${_mEsc(t('muh.office_rate'))}</label><input class="form-input" type="number" step="0.01" id="mcat-office-${i}" value="${Number(c.office_day_rate || 0)}"></div>
      <button class="btn btn-ghost btn-sm" type="button" onclick="removeSalaryCategory(${i})">${_mEsc(t('muh.del'))}</button>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px;"><input type="checkbox" id="mcat-fixed-${i}" ${c.fixed_staff ? 'checked' : ''}> ${_mEsc(t('muh.cat.fixed_staff'))}</label>
    ${tierRows(c, i, 'bonus')}
    ${tierRows(c, i, 'salary')}
  </div>`).join('');
}

function readCatTiers(i, type) {
  const prefix = type === 'bonus' ? 'b' : 's';
  const host = document.getElementById(`mcat-${i}-${prefix}-rows`);
  const n = Number(host?.dataset.count || 0);
  const rows = [];
  for (let j = 0; j < n; j++) {
    rows.push({
      min: Number(document.getElementById(`mcat-${i}-${prefix}-min-${j}`)?.value || 0),
      max: Number(document.getElementById(`mcat-${i}-${prefix}-max-${j}`)?.value || 0),
      amount: Number(document.getElementById(`mcat-${i}-${prefix}-amt-${j}`)?.value || 0),
      currency: (document.getElementById(`mcat-${i}-${prefix}-cur-${j}`)?.value || 'EUR').toUpperCase(),
      calc_type: type === 'bonus'
        ? (document.getElementById(`mcat-${i}-${prefix}-calc-${j}`)?.value === 'per_appointment' ? 'per_appointment' : 'fixed')
        : 'fixed',
    });
  }
  return _mNormTiers(rows);
}

function readSalaryCategories() {
  const box = document.getElementById('muh-cat-editor');
  const n = Number(box?.dataset.count || 0);
  const cats = [];
  for (let i = 0; i < n; i++) {
    let id = document.getElementById(`mcat-id-${i}`)?.value || '';
    if (!id) id = `cat_${Date.now().toString(36)}_${i}`;
    cats.push({
      id,
      name: document.getElementById(`mcat-name-${i}`)?.value?.trim() || '',
      base_salary_amount: Number(document.getElementById(`mcat-base-${i}`)?.value || 0),
      sgk_percent: Number(document.getElementById(`mcat-sgk-${i}`)?.value || 0),
      office_day_rate: Number(document.getElementById(`mcat-office-${i}`)?.value || 0),
      fixed_staff: !!document.getElementById(`mcat-fixed-${i}`)?.checked,
      bonus_tiers: readCatTiers(i, 'bonus'),
      salary_tiers: readCatTiers(i, 'salary'),
    });
  }
  return cats;
}

function addSalaryCategory() {
  const cats = readSalaryCategories();
  cats.push({
    id: `cat_${Date.now().toString(36)}`,
    name: '',
    base_salary_amount: Number(document.getElementById('pr-base')?.value || 0),
    sgk_percent: Number(document.getElementById('pr-sgk')?.value || 0),
    office_day_rate: Number(document.getElementById('pr-office')?.value || 0),
    fixed_staff: false,
    bonus_tiers: [],
    salary_tiers: [],
  });
  renderSalaryCategoryEditor(cats);
}

function removeSalaryCategory(idx) {
  renderSalaryCategoryEditor(readSalaryCategories().filter((_, i) => i !== idx));
}

function addCatTier(i, type) {
  const cats = readSalaryCategories();
  if (!cats[i]) return;
  const key = type === 'bonus' ? 'bonus_tiers' : 'salary_tiers';
  cats[i][key] = cats[i][key] || [];
  cats[i][key].push({ min: 0, max: 0, amount: 0, currency: 'EUR', calc_type: type === 'bonus' ? 'per_appointment' : 'fixed' });
  renderSalaryCategoryEditor(cats);
}

function removeCatTier(i, type, j) {
  const cats = readSalaryCategories();
  if (!cats[i]) return;
  const key = type === 'bonus' ? 'bonus_tiers' : 'salary_tiers';
  cats[i][key] = (cats[i][key] || []).filter((_, idx) => idx !== j);
  renderSalaryCategoryEditor(cats);
}

function _mBooksPack(rows, rules) {
  const cur = rules.currency || 'EUR';
  const rate = Number(rules.exchange_rate || 1) || 1;
  const ym = _mGetPeriod();
  const led = _mLedgerMonth(_mLedgerRows(), ym, rate, cur);
  const rev = (rows || []).reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
  const pay = (rows || []).reduce((s, r) => s + Number(r.netPayable || 0), 0);
  const sgk = (rows || []).reduce((s, r) => s + Number(r.sgkCost || 0), 0);
  const income = rev + led.alacakIn;
  const before = income - pay - led.gider - led.borcOut - sgk;
  const taxBase = Math.max(0, before);
  const tax = rules.government_supported ? 0 : taxBase * (Number(rules.tax_rate_percent || 0) / 100);
  const profit = before - tax;
  return { cur, rate, ym, led, rev, pay, sgk, income, taxBase, tax, profit };
}

function renderMuhBooks(rows, rules) {
  const p = _mBooksPack(rows, rules);
  const cur = _mEsc(p.cur);
  const ozet = document.getElementById('muh-ozet-cards');
  if (ozet) {
    ozet.innerHTML = `
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.income'))} (${cur})</div><div class="stat-val">${_mFmt(p.income)}</div><div class="stat-meta">${_mEsc(t('muh.appt_rev'))} ${_mFmt(p.rev)}</div></div>
      <div class="stat-card stat-red"><div class="stat-lbl">${_mEsc(t('muh.payroll_cost'))} (${cur})</div><div class="stat-val">${_mFmt(p.pay)}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.fixed_cost'))} (${cur})</div><div class="stat-val">${_mFmt(p.led.gider)}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.sgk'))} (${cur})</div><div class="stat-val">${_mFmt(p.sgk)}</div></div>
      <div class="stat-card stat-blue"><div class="stat-lbl">${_mEsc(t('muh.open_in'))} (${cur})</div><div class="stat-val">${_mFmt(p.led.alacakOpen)}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.open_out'))} (${cur})</div><div class="stat-val">${_mFmt(p.led.borcOpen)}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.tax'))} (${cur})</div><div class="stat-val">${_mFmt(p.tax)}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.profit'))} (${cur})</div><div class="stat-val" style="color:${p.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${_mFmt(p.profit)}</div></div>`;
  }
  const incomeBox = document.getElementById('muh-income-expense-summary');
  if (incomeBox) {
    incomeBox.innerHTML = `<div class="stats-grid">
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.appt_rev'))}</div><div class="stat-val">${_mFmt(p.rev)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.collected'))}</div><div class="stat-val">${_mFmt(p.led.alacakIn)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.open_in'))}</div><div class="stat-val">${_mFmt(p.led.alacakOpen)} ${cur}</div></div>
      <div class="stat-card stat-red"><div class="stat-lbl">${_mEsc(t('muh.payroll_cost'))}</div><div class="stat-val">${_mFmt(p.pay)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.fixed_cost'))}</div><div class="stat-val">${_mFmt(p.led.gider)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.debt_paid'))}</div><div class="stat-val">${_mFmt(p.led.borcOut)} ${cur}</div></div>
    </div>`;
  }
  const taxBox = document.getElementById('muh-tax-summary');
  if (taxBox) {
    const tl = p.cur === 'TRY' ? p.taxBase : p.taxBase * p.rate;
    taxBox.innerHTML = `<div class="stats-grid">
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.tax_base'))} (${cur})</div><div class="stat-val">${_mFmt(p.taxBase)}</div><div class="stat-meta">${_mFmt(tl)} TRY</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.tax'))}</div><div class="stat-val">${_mFmt(p.tax)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.stopaj'))}</div><div class="stat-val">${_mFmt(p.led.stopaj)} ${cur}</div><div class="stat-meta">%20</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.sgk'))}</div><div class="stat-val">${_mFmt(p.sgk)} ${cur}</div></div>
      <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.profit'))}</div><div class="stat-val">${_mFmt(p.profit)} ${cur}</div></div>
    </div>
    <div style="font-size:12px;color:var(--text-2);margin-top:10px;line-height:1.6;">${_mEsc(t('muh.tax_note'))}</div>`;
  }
  renderLedgerTables();
}

function _mLedgerTable(kind) {
  const ym = _mGetPeriod();
  const rows = _mLedgerRows().filter(r => r.kind === kind && _mLedgerInMonth(r, ym));
  if (!rows.length) return `<div style="color:var(--text-3);padding:8px 0;">${_mEsc(t('muh.ledger.empty'))}</div>`;
  return `<table><thead><tr>
    <th>${_mEsc(t('muh.ledger.title'))}</th><th>${_mEsc(t('muh.ledger.amount'))}</th><th>${_mEsc(t('muh.ledger.paid'))}</th><th></th>
  </tr></thead><tbody>${rows.map(r => `<tr>
    <td style="font-weight:700;">${_mEsc(r.title)}${r.recur ? ` <span style="font-size:10px;color:var(--text-3);">${_mEsc(t('muh.ledger.recur'))}</span>` : ''}${r.stopaj ? ` <span style="font-size:10px;color:var(--text-3);">${_mEsc(t('muh.stopaj'))}</span>` : ''}
      <div style="font-size:10px;color:var(--text-3);">${_mEsc(r.note || '')} ${_mEsc(r.due_date || r.period_ym || '')}</div></td>
    <td>${_mFmt(r.amount)} ${_mEsc(r.currency || 'EUR')}</td>
    <td>${_mFmt(r.paid_amount || 0)}</td>
    <td>
      <button class="btn btn-ghost btn-sm" type="button" onclick="ledgerSetPaid('${r.id}', ${Number(r.amount || 0)})">${_mEsc(t('muh.ledger.mark'))}</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="deleteLedgerItem('${r.id}')">${_mEsc(t('muh.del'))}</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function renderLedgerTables() {
  ['gider', 'alacak', 'borc'].forEach((k) => {
    const el = document.getElementById(`ml-${k}-period`);
    if (el && !el.value) el.value = _mGetPeriod();
  });
  const g = document.getElementById('muh-gider-table');
  const a = document.getElementById('muh-alacak-table');
  const b = document.getElementById('muh-borc-table');
  if (g) g.innerHTML = _mLedgerTable('gider');
  if (a) a.innerHTML = _mLedgerTable('alacak');
  if (b) b.innerHTML = _mLedgerTable('borc');
}

async function saveLedgerItem(kind) {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  if (!fid) return;
  const title = document.getElementById(`ml-${kind}-title`)?.value?.trim();
  const amount = Number(document.getElementById(`ml-${kind}-amount`)?.value || 0);
  if (!title || !(amount > 0)) {
    toast(t('muh.ledger.need'), 'err');
    return;
  }
  const body = {
    firm_id: fid,
    kind,
    title,
    amount,
    currency: (document.getElementById(`ml-${kind}-cur`)?.value || 'EUR').toUpperCase(),
    period_ym: document.getElementById(`ml-${kind}-period`)?.value || _mGetPeriod(),
    recur: !!document.getElementById(`ml-${kind}-recur`)?.checked,
    stopaj: !!document.getElementById(`ml-${kind}-stopaj`)?.checked,
    due_date: document.getElementById(`ml-${kind}-due`)?.value || null,
    note: document.getElementById(`ml-${kind}-note`)?.value?.trim() || null,
    paid: false,
    paid_amount: 0,
  };
  try {
    await sb('payroll_ledger', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
    toast(t('muh.ledger.saved'), 'ok');
    const titleEl = document.getElementById(`ml-${kind}-title`);
    if (titleEl) titleEl.value = '';
    await loadPayrollLedger(fid);
    await renderMuhasebePayrollTable(fid, _mGetPeriod(), window._payrollRulesCacheByFirm[fid] || defaultPayrollRules());
  } catch (e) {
    toast(t('muh.ledger.fail') + ' ' + e.message, 'err');
  }
}

async function ledgerSetPaid(id, amount) {
  if (!isMuhasebeAdmin()) return;
  const entered = await mbPrompt(t('muh.ledger.paid_prompt'), String(amount || 0), t('muh.ledger.mark'));
  if (entered === null) return;
  const paid = Number(entered);
  if (isNaN(paid) || paid < 0) return;
  try {
    await sb(`payroll_ledger?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ paid_amount: paid, paid: paid >= Number(amount || 0) && Number(amount || 0) > 0 }),
    });
    const fid = muhasebeFirmId();
    await loadPayrollLedger(fid);
    await renderMuhasebePayrollTable(fid, _mGetPeriod(), window._payrollRulesCacheByFirm[fid] || defaultPayrollRules());
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function deleteLedgerItem(id) {
  if (!isMuhasebeAdmin()) return;
  if (!(await mbConfirm(t('muh.ledger.del_ask'), t('muh.del')))) return;
  try {
    await sb(`payroll_ledger?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    const fid = muhasebeFirmId();
    await loadPayrollLedger(fid);
    await renderMuhasebePayrollTable(fid, _mGetPeriod(), window._payrollRulesCacheByFirm[fid] || defaultPayrollRules());
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function setPayrollOfficeDays(uid) {
  if (!isMuhasebeAdmin()) return;
  const row = (window._muhasebeRows || []).find(r => r.user_id === uid);
  const entered = await mbPrompt(t('muh.office_days'), String(row?.officeDays || 0), t('muh.office'));
  if (entered === null) return;
  const days = Number(entered);
  if (isNaN(days) || days < 0) return;
  const fid = muhasebeFirmId();
  const period = _mGetPeriod();
  const rules = window._payrollRulesCacheByFirm[fid] || defaultPayrollRules();
  const body = {
    firm_id: fid,
    user_id: uid,
    period_ym: period,
    currency: rules.currency || 'EUR',
    office_days: days,
    updated_at: new Date().toISOString(),
  };
  try {
    const ex = await sb(`payroll_monthly?firm_id=eq.${fid}&user_id=eq.${uid}&period_ym=eq.${period}&select=id`).catch(() => []);
    if (ex?.length) await sb(`payroll_monthly?id=eq.${ex[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ office_days: days, updated_at: body.updated_at }) });
    else await sb('payroll_monthly', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
    toast(t('muh.office_saved'), 'ok');
    loadMuhasebePage();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function printMuhasebeBordro() {
  const rows = window._muhasebeRows || [];
  if (!rows.length) {
    toast(t('ui.no_rows_export'), 'warn');
    return;
  }
  const ym = _mGetPeriod();
  const cur = rows[0].currency || 'EUR';
  const body = rows.map(r => `<tr>
    <td>${_mEsc(r.user_name)}</td><td>${_mEsc(r.categoryName || '')}</td><td>${r.success}</td>
    <td>${_mFmt(r.baseSalary)}</td><td>${_mFmt(r.bonus)}</td><td>${_mFmt(r.officePay || 0)}</td>
    <td>${_mFmt(r.sgkCost || 0)}</td><td>${_mFmt(r.netPayable)}</td><td>${_mFmt(r.paidAmount)}</td><td>${_mFmt(r.remaining)}</td>
  </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${_mEsc(t('muh.print'))} ${ym}</title>
    <style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:12px;text-align:left}</style>
    </head><body><h1>${_mEsc(t('muh.print'))} · ${ym} · ${cur}</h1><table><thead><tr>
    <th>${_mEsc(t('muh.person'))}</th><th>${_mEsc(t('muh.cat.col'))}</th><th>${_mEsc(t('muh.success'))}</th>
    <th>${_mEsc(t('muh.base'))}</th><th>${_mEsc(t('muh.bonus'))}</th><th>${_mEsc(t('muh.office'))}</th>
    <th>${_mEsc(t('muh.sgk'))}</th><th>${_mEsc(t('muh.net'))}</th><th>${_mEsc(t('muh.paid'))}</th><th>${_mEsc(t('muh.left'))}</th>
    </tr></thead><tbody>${body}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

async function renderMuhasebeYear(fid, rules) {
  const box = document.getElementById('muh-year-box');
  if (!box || !fid) return;
  const year = _mMonthBounds(_mGetPeriod()).year;
  const cur = rules.currency || 'EUR';
  const rate = Number(rules.exchange_rate || 1) || 1;
  let monthly = [];
  let appts = [];
  try {
    [monthly, appts] = await Promise.all([
      sb(`payroll_monthly?firm_id=eq.${fid}&period_ym=like.${year}-*&select=period_ym,net_payable,paid_amount`).catch(() => []),
      sb(`appointments?firm_id=eq.${fid}&durum=eq.basarili&termin_tarih=gte.${year}-01-01T00:00:00&termin_tarih=lte.${year}-12-31T23:59:59&select=termin_tarih,customer_id`).catch(() => []),
    ]);
  } catch (e) {}
  const rateMap = {};
  _mParseTiers(rules.customer_rates).forEach(r => { if (r?.customer_id) rateMap[r.customer_id] = r; });
  const byMonth = {};
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    byMonth[ym] = { rev: 0, pay: 0, gider: 0 };
  }
  (appts || []).forEach(a => {
    const ym = String(a.termin_tarih || '').slice(0, 7);
    if (!byMonth[ym]) return;
    const customerRate = a.customer_id ? rateMap[a.customer_id] : null;
    byMonth[ym].rev += customerRate
      ? _mConvertCurrency(Number(customerRate.amount || 0), customerRate.currency || cur, cur, rate)
      : Number(rules.revenue_per_success || 0);
  });
  (monthly || []).forEach(r => {
    if (byMonth[r.period_ym]) byMonth[r.period_ym].pay += Number(r.net_payable || 0);
  });
  Object.keys(byMonth).forEach(ym => {
    byMonth[ym].gider = _mLedgerMonth(_mLedgerRows(), ym, rate, cur).gider;
  });
  box.innerHTML = `<table><thead><tr><th>${_mEsc(t('muh.month'))}</th><th>${_mEsc(t('muh.appt_rev'))}</th><th>${_mEsc(t('muh.payroll_cost'))}</th><th>${_mEsc(t('muh.fixed_cost'))}</th></tr></thead><tbody>
    ${Object.keys(byMonth).map(ym => `<tr><td>${_mEsc(_mbMonthFaceText(ym))}</td><td>${_mFmt(byMonth[ym].rev)}</td><td>${_mFmt(byMonth[ym].pay)}</td><td>${_mFmt(byMonth[ym].gider)}</td></tr>`).join('')}
  </tbody></table>`;
}

async function muhFillPayCategorySelect(prefill, selectId = 'am-paycat') {
  const host = document.getElementById(`${selectId}-wrap`);
  if (!host || typeof loadFirmPayrollRules !== 'function') return;
  const fid = document.getElementById('am-firm')?.value || prefill?.firm_id || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id;
  const rules = await loadFirmPayrollRules(fid, true);
  const cats = _mEffectiveCategories(rules);
  const uid = prefill?.id || '';
  if (uid && typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin()) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cat = _mCatForMonth(prefill, ym, cats);
    host.innerHTML = `<div class="form-row"><label class="form-label">${_mEsc(t('muh.cat.pick'))}</label>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>${_mEsc(cat?.name || t('muh.cat.none'))}</strong>
        <button type="button" class="btn btn-ghost btn-sm" onclick="openPayCategoryMonths('${_mEsc(uid)}')">${_mEsc(t('muh.cat.months'))}</button>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:4px;">${_mEsc(t('muh.cat.month_hint'))}</div>
    </div>`;
    return;
  }
  const cur = prefill?.payroll_category_id || '';
  host.innerHTML = `<div class="form-row"><label class="form-label">${_mEsc(t('muh.cat.pick'))}</label>
    <select class="form-input" id="${selectId}">
      <option value="">${_mEsc(t('muh.cat.none'))}</option>
      ${cats.map(c => `<option value="${_mEsc(c.id)}" ${c.id === cur ? 'selected' : ''}>${_mEsc(c.name)}</option>`).join('')}
    </select>
    <div style="font-size:11px;color:var(--text-3);margin-top:4px;">${_mEsc(t('muh.cat.pick_hint'))}</div>
  </div>`;
}

function agentPayCatName(user) {
  const list = window._agentPayCatsByFirm?.[user?.firm_id];
  if (list && typeof _mCatForMonth === 'function') {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return _mCatForMonth(user, ym, list)?.name || '';
  }
  const map = window._agentPayCatByFirm?.[user?.firm_id] || {};
  return map[user?.payroll_category_id] || '';
}

function applyBuiltinSalaryCategories() {
  if (typeof mbBuiltinSalaryCategories !== 'function') return;
  const ask = typeof mbConfirm === 'function'
    ? mbConfirm(t('muh.cat.preset_ask'), t('muh.cat.preset'))
    : Promise.resolve(window.confirm(t('muh.cat.preset_ask')));
  Promise.resolve(ask).then((ok) => {
    if (!ok) return;
    renderSalaryCategoryEditor(mbBuiltinSalaryCategories());
  });
}

async function openPayCategoryMonths(userId) {
  if (!userId || (typeof mbIsFirmAdmin === 'function' && !mbIsFirmAdmin())) return;
  const rows = await sb(`users?id=eq.${userId}&select=id,name,firm_id,payroll_category_id,payroll_category_months`).catch(() => []);
  const user = rows?.[0];
  if (!user) return;
  const rules = await loadFirmPayrollRules(user.firm_id, true);
  const cats = _mEffectiveCategories(rules);
  if (!cats.length) {
    toast(t('muh.cat.empty'), 'err');
    return;
  }
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const months = _mKatMonths();
  document.getElementById('m-paykat')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-paykat';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '3200';
  modal.innerHTML = `<div class="modal" style="max-width:560px;">
    <div class="modal-hdr">
      <div class="modal-title">${_mEsc(tReplace('muh.cat.month_title', { name: user.name || '' }))}</div>
      <button class="modal-close" type="button" onclick="document.getElementById('m-paykat')?.remove()">✕</button>
    </div>
    <div style="padding:12px 16px 16px;">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${_mEsc(t('muh.cat.month_hint'))}</div>
      <div class="tbl-wrap" style="max-height:420px;overflow:auto;">
        <table>
          <thead><tr><th>${_mEsc(t('muh.month'))}</th>${cats.map((c) => `<th>${_mEsc(c.name)}</th>`).join('')}</tr></thead>
          <tbody id="paykat-body">${months.map((ym) => {
            const picked = _mCatForMonth(user, ym, cats);
            const cur = ym === nowKey ? ' style="background:var(--accent-soft);"' : '';
            return `<tr data-ym="${ym}"${cur}><td>${_mEsc(_mbMonthFaceText(ym))}</td>${cats.map((c) => `<td><input type="radio" name="paykat-${ym}" value="${_mEsc(c.id)}" ${picked && picked.id === c.id ? 'checked' : ''}></td>`).join('')}</tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" type="button" onclick="document.getElementById('m-paykat')?.remove()">${_mEsc(t('muh.adj.cancel'))}</button>
      <button class="btn btn-primary" type="button" onclick="savePayCategoryMonths('${_mEsc(user.id)}')">${_mEsc(t('muh.cat.months'))}</button>
    </div>
  </div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function savePayCategoryMonths(userId) {
  if (!userId || (typeof mbIsFirmAdmin === 'function' && !mbIsFirmAdmin())) return;
  const rows = await sb(`users?id=eq.${userId}&select=id,firm_id,payroll_category_months`).catch(() => []);
  const user = rows?.[0];
  if (!user) return;
  const rules = await loadFirmPayrollRules(user.firm_id, true);
  const cats = _mEffectiveCategories(rules);
  const def = _mNamedCat(cats, 'A');
  const map = _mParseMonthMap(user.payroll_category_months);
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let currentId = user.payroll_category_id || null;
  document.querySelectorAll('#paykat-body tr').forEach((tr) => {
    const ym = tr.getAttribute('data-ym');
    const checked = tr.querySelector('input:checked');
    if (!ym || !checked) return;
    const id = checked.value;
    if (!id || (def && id === def.id)) delete map[ym];
    else map[ym] = id;
    if (ym === nowKey) currentId = (!id || (def && id === def.id)) ? null : id;
  });
  try {
    await sb(`users?id=eq.${userId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ payroll_category_months: map, payroll_category_id: currentId }),
    });
    if (typeof agentRememberPayMonths === 'function') agentRememberPayMonths(userId, map, currentId);
    document.getElementById('m-paykat')?.remove();
    toast(t('muh.cat.saved'), 'ok');
    if (document.getElementById('page-muhasebe')?.classList.contains('active') && typeof loadMuhasebePage === 'function') loadMuhasebePage();
    else if (document.getElementById('page-maasim')?.classList.contains('active') && typeof loadMaasimPage === 'function') loadMaasimPage();
  } catch (e) {
    toast(e.message || t('muh.cat.saved'), 'err');
  }
}
