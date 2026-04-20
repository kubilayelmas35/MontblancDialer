// ─────────────────────────────────────────────
// MUHASEBE — maaş, prim, kesinti, müşteri
// ─────────────────────────────────────────────

window._muhasebeRows = [];
window._payrollRulesCacheByFirm = window._payrollRulesCacheByFirm || {};
window._customersCacheByFirm = window._customersCacheByFirm || {};

function isMuhasebeAdmin() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

function canViewMuhasebe() {
  return isMuhasebeAdmin();
}

function _mPayrollUiMode() {
  return window._muhPayrollUi === 'maasim' ? 'maasim' : 'admin';
}

function _mPayrollSummaryBox() {
  const id = _mPayrollUiMode() === 'maasim' ? 'maasim-summary-cards' : 'muhasebe-summary-cards';
  return document.getElementById(id);
}

function _mPayrollTableWrap() {
  const id = _mPayrollUiMode() === 'maasim' ? 'maasim-table-wrap' : 'muhasebe-table-wrap';
  return document.getElementById(id);
}

function canViewMaasimPage() {
  const role = currentUser?.role || '';
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin'].includes(role)) return false;
  // Bu sayfalar rol bazlı çalışmalı; eksik permission kaydı ekranı boş bırakmamalı.
  return true;
}

function canViewPerformansimPage() {
  const role = currentUser?.role || '';
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin'].includes(role)) return false;
  // Bu sayfalar rol bazlı çalışmalı; eksik permission kaydı ekranı boş bırakmamalı.
  return true;
}

function muhasebeFirmId() {
  return getActiveFirmId() || currentUser?.firm_id || null;
}

function defaultPayrollRules() {
  return {
    currency: 'EUR',
    base_salary_mode: 'net',
    base_salary_amount: 0,
    tax_rate_percent: 0,
    revenue_per_success: 0,
    government_supported: false,
    exchange_rate: 1,
    fx_api_provider: 'exchangerate_host',
    fx_api_url: '',
    fx_api_key: '',
    late_penalty_enabled: false,
    late_penalty_amount: 0,
    leave_overflow_penalty_enabled: false,
    leave_overflow_penalty_amount: 0,
    appointment_customer_select_by_agent: false,
    bonus_tiers: [],
    salary_tiers: [],
    customer_rates: [],
  };
}

function _mEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _mMonthBounds(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return _mMonthBounds(cur);
  }
  const s = `${y}-${String(m).padStart(2, '0')}-01`;
  const e = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
  return { start: s, end: e, year: y };
}

function _mParseTiers(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function _mNormTiers(arr) {
  return (arr || []).map(t => ({
    min: Number(t.min || 0),
    max: Number(t.max || 999999),
    amount: Number(t.amount || 0),
    currency: (t.currency || 'EUR').toUpperCase(),
    calc_type: t.calc_type === 'per_appointment' ? 'per_appointment' : 'fixed',
  })).filter(t => t.max >= t.min && t.amount >= 0);
}

function _mFmt(n) {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _mGetPeriod() {
  const ids = ['muhasebe-period', 'maasim-period', 'performansim-period'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.value) return el.value;
  }
  const now = new Date();
  const v = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = v;
  });
  return v;
}

function _mSyncPayrollPeriodInputs(changedEl) {
  const v = changedEl?.value;
  if (!v) return;
  ['muhasebe-period', 'maasim-period', 'performansim-period'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el !== changedEl) el.value = v;
  });
}

async function loadFirmPayrollRules(fid, force = false) {
  if (!fid) return defaultPayrollRules();
  if (!force && window._payrollRulesCacheByFirm[fid]) return window._payrollRulesCacheByFirm[fid];
  let rules = null;
  let firmPayroll = null;
  try {
    const rows = await sb(`payroll_rules?firm_id=eq.${fid}&select=*`);
    if (rows?.length) rules = rows[0];
  } catch (e) {}
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    firmPayroll = firms?.[0]?.settings?.payroll || null;
  } catch (e) {}
  if (!rules) rules = firmPayroll;
  const merged = { ...defaultPayrollRules(), ...(firmPayroll || {}), ...(rules || {}) };
  merged.bonus_tiers = _mParseTiers(merged.bonus_tiers);
  merged.salary_tiers = _mParseTiers(merged.salary_tiers);
  merged.customer_rates = _mParseTiers(merged.customer_rates);
  window._payrollRulesCacheByFirm[fid] = merged;
  return merged;
}

async function loadFirmCustomers(fid, force = false) {
  if (!fid) return [];
  if (!force && window._customersCacheByFirm[fid]) return window._customersCacheByFirm[fid];
  try {
    const rows = await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`);
    window._customersCacheByFirm[fid] = rows || [];
    return rows || [];
  } catch (e) {
    window._customersCacheByFirm[fid] = [];
    return [];
  }
}

async function canAgentSelectCustomer(fid) {
  const r = await loadFirmPayrollRules(fid);
  return !!r.appointment_customer_select_by_agent;
}

function _mBonusFor(successCount, tiers, ruleCurrency, targetCurrency, rate) {
  let bonus = 0;
  (tiers || []).forEach(t => {
    const min = Number(t.min || 0);
    const max = Number(t.max || 999999);
    if (successCount >= min && successCount <= max) {
      const amount = Number(t.amount || 0);
      const calcType = t.calc_type === 'per_appointment' ? 'per_appointment' : 'fixed';
      const ccy = (t.currency || ruleCurrency || 'EUR').toUpperCase();
      let oneUnit = amount;
      if (ccy !== targetCurrency) oneUnit = _mConvertCurrency(amount, ccy, targetCurrency, rate);
      if (calcType === 'per_appointment') {
        const countInTier = Math.max(0, Math.min(successCount, max) - min + 1);
        bonus = oneUnit * countInTier;
      } else {
        bonus = oneUnit;
      }
    }
  });
  return bonus;
}

function _mConvertCurrency(v, from, to, rate) {
  const n = Number(v || 0);
  const a = (from || '').toUpperCase();
  const b = (to || '').toUpperCase();
  if (a === b) return n;
  if (a === 'EUR' && b === 'TRY') return n * (rate || 1);
  if (a === 'TRY' && b === 'EUR') return n / (rate || 1);
  return n;
}

async function loadMuhasebePage() {
  renderFirmSelector('muhasebe-firm-selector', loadMuhasebePage);
  const fid = muhasebeFirmId();
  const noAccess = document.getElementById('muhasebe-no-access');
  const main = document.getElementById('muhasebe-main');
  const sub = document.getElementById('muhasebe-sub');
  if (!canViewMuhasebe()) {
    if (noAccess) noAccess.style.display = '';
    if (main) main.style.display = 'none';
    return;
  }
  if (isSuperAdmin() && !fid) {
    if (noAccess) {
      noAccess.style.display = '';
      noAccess.textContent = 'Muhasebe için firma seçin.';
    }
    if (main) main.style.display = 'none';
    return;
  }
  if (noAccess) noAccess.style.display = 'none';
  if (main) main.style.display = 'flex';
  if (sub) {
    sub.textContent = 'Maaş, prim, kesinti, müşteri ve bordro yönetimi';
  }

  const period = _mGetPeriod();
  const rules = await loadFirmPayrollRules(fid);
  const liveRate = await _getMonthFxRate(fid, period, Number(rules.exchange_rate || 1), rules);
  rules.exchange_rate = liveRate;
  setMuhasebeTab(window._muhasebeTab || 'ozet');
  renderPayrollRulesForm(rules);
  document.getElementById('muhasebe-rules-card').style.display = isMuhasebeAdmin() ? '' : 'none';
  document.getElementById('muhasebe-customers-card').style.display = isMuhasebeAdmin() ? '' : 'none';
  if (isMuhasebeAdmin()) await renderMuhasebeCustomers();
  if (isMuhasebeAdmin()) renderCustomerRateTable(rules);
  await renderMuhasebePayrollTable(fid, period, rules);
}

async function testFxRateNow() {
  const fid = muhasebeFirmId();
  if (!fid) return;
  const ym = _mGetPeriod();
  const rules = {
    ...defaultPayrollRules(),
    exchange_rate: Number(document.getElementById('pr-rate')?.value || 1),
    fx_api_provider: document.getElementById('pr-fx-provider')?.value || 'exchangerate_host',
    fx_api_url: document.getElementById('pr-fx-url')?.value?.trim() || '',
    fx_api_key: document.getElementById('pr-fx-key')?.value?.trim() || '',
  };
  const rate = await _getMonthFxRate(fid, ym, Number(rules.exchange_rate || 1), rules);
  const rateInput = document.getElementById('pr-rate');
  if (rateInput) rateInput.value = String(Number(rate || 1));
  toast(`Kur güncellendi: 1 EUR = ${_mFmt(rate)} TRY`, 'ok');
  updatePayrollPreview();
}

function setMuhasebeTab(tab) {
  window._muhasebeTab = tab || 'ozet';
  const panes = ['ozet', 'gelir', 'personel', 'vergi', 'musteri'];
  panes.forEach(p => {
    const pane = document.getElementById(`muh-pane-${p}`);
    if (pane) pane.style.display = p === window._muhasebeTab ? '' : 'none';
  });
  const personelBtn = document.querySelector('.muh-tab-btn[data-muh-tab="personel"]');
  if (personelBtn) personelBtn.textContent = 'Personel Maaş';
  document.querySelectorAll('.muh-tab-btn').forEach(btn => {
    btn.style.display = '';
    const active = btn.dataset.muhTab === window._muhasebeTab;
    btn.classList.toggle('active', active);
    btn.style.background = active ? 'var(--accent)' : '';
    btn.style.color = active ? '#fff' : '';
  });
  const ex = document.getElementById('muh-personel-export-btns');
  const ct = document.getElementById('muh-personel-card-title');
  const cs = document.getElementById('muh-personel-card-sub');
  if (ex) ex.style.display = '';
  if (ct) ct.textContent = 'Aylık personel muhasebesi';
  if (cs) cs.textContent = 'Baz maaş, prim, kesintiler, manuel ekleme/kesme, ödenen/kalan';
}

async function loadMaasimPage() {
  renderFirmSelector('maasim-firm-selector', loadMaasimPage);
  const fid = muhasebeFirmId();
  const noAccess = document.getElementById('maasim-no-access');
  const main = document.getElementById('maasim-main');
  const sub = document.getElementById('maasim-sub');
  if (!canViewMaasimPage()) {
    if (noAccess) noAccess.style.display = '';
    if (main) main.style.display = 'none';
    return;
  }
  if (isSuperAdmin() && !fid) {
    if (noAccess) {
      noAccess.style.display = '';
      noAccess.textContent = 'Firma seçin.';
    }
    if (main) main.style.display = 'none';
    return;
  }
  if (noAccess) noAccess.style.display = 'none';
  if (main) main.style.display = 'flex';
  if (sub) sub.textContent = 'Bordro özeti, prim ve baz maaş kademeleri';
  const period = _mGetPeriod();
  const rules = await loadFirmPayrollRules(fid);
  const liveRate = await _getMonthFxRate(fid, period, Number(rules.exchange_rate || 1), rules);
  rules.exchange_rate = liveRate;
  await renderMuhasebePayrollTable(fid, period, rules, { ui: 'maasim' });
}

async function loadPerformansimPage() {
  try {
    renderFirmSelector('performansim-firm-selector', loadPerformansimPage);
    const fid = muhasebeFirmId();
    const noAccess = document.getElementById('performansim-no-access');
    const main = document.getElementById('performansim-main');
    const sub = document.getElementById('performansim-sub');
    if (!canViewPerformansimPage()) {
      if (noAccess) noAccess.style.display = '';
      if (main) main.style.display = 'none';
      return;
    }
    if (isSuperAdmin() && !fid) {
      if (noAccess) {
        noAccess.style.display = '';
        noAccess.textContent = 'Firma seçin.';
      }
      if (main) main.style.display = 'none';
      return;
    }
    if (noAccess) noAccess.style.display = 'none';
    if (main) main.style.display = 'flex';
    if (sub) sub.textContent = 'Seçili ay termin ve çağrı özeti';
    const period = _mGetPeriod();
    const rules = await loadFirmPayrollRules(fid);
    const liveRate = await _getMonthFxRate(fid, period, Number(rules.exchange_rate || 1), rules);
    rules.exchange_rate = liveRate;
    if (typeof loadAgentSelfPerformanceDash === 'function') {
      await loadAgentSelfPerformanceDash(fid, period, rules);
    }
  } catch (e) {
    const host = document.getElementById('muh-agent-perf-wrap');
    if (host) {
      host.style.display = '';
      host.innerHTML = `<div class="card" style="padding:14px;color:var(--red);font-size:13px;">Performans verisi yüklenemedi: ${_uiEsc(e?.message || 'bilinmeyen hata')}</div>`;
    }
    if (typeof toast === 'function') toast('Performansım yüklenemedi: ' + (e?.message || ''), 'err');
  }
}

function renderPayrollRulesForm(r) {
  const bonusTiers = _mNormTiers(Array.isArray(r.bonus_tiers) ? r.bonus_tiers : []);
  const salaryTiers = _mNormTiers(Array.isArray(r.salary_tiers) ? r.salary_tiers : []);
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el != null) el.value = val;
  };
  set('pr-currency', r.currency || 'EUR');
  set('pr-rate', Number(r.exchange_rate || 1));
  set('pr-fx-provider', r.fx_api_provider || 'exchangerate_host');
  set('pr-fx-url', r.fx_api_url || '');
  set('pr-fx-key', r.fx_api_key || '');
  set('pr-mode', r.base_salary_mode || 'net');
  set('pr-base', Number(r.base_salary_amount || 0));
  set('pr-tax', Number(r.tax_rate_percent || 0));
  set('pr-rev-success', Number(r.revenue_per_success || 0));
  set('pr-late', Number(r.late_penalty_amount || 0));
  set('pr-leave-over-amt', Number(r.leave_overflow_penalty_amount || 0));
  const setChk = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!v;
  };
  setChk('pr-gov', r.government_supported);
  setChk('pr-late-on', r.late_penalty_enabled);
  setChk('pr-leave-over', r.leave_overflow_penalty_enabled);
  setChk('pr-agent-customer', r.appointment_customer_select_by_agent);
  renderPayrollTierRows('bonus', bonusTiers);
  renderPayrollTierRows('salary', salaryTiers);
  renderCustomerRateTable(r);
  onFxProviderChange();
  updatePayrollPreview();
}

function onFxProviderChange() {
  const p = document.getElementById('pr-fx-provider')?.value || 'exchangerate_host';
  const urlRow = document.getElementById('pr-fx-url-row');
  const keyRow = document.getElementById('pr-fx-key-row');
  const isCustom = p === 'custom';
  if (urlRow) urlRow.style.display = isCustom ? '' : 'none';
  if (keyRow) keyRow.style.display = isCustom ? '' : 'none';
}

function renderPayrollTierRows(type, rows) {
  const wrap = document.getElementById(type === 'bonus' ? 'pr-bonus-tiers-wrap' : 'pr-salary-tiers-wrap');
  if (!wrap) return;
  const safe = rows?.length ? rows : [{ min: 0, max: 0, amount: 0, currency: 'EUR', calc_type: 'fixed' }];
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">
    ${safe.map((r, i) => `<div style="display:grid;grid-template-columns:90px 90px 1fr ${type==='bonus'?'170px ':''}90px auto;gap:6px;align-items:end;">
      <div><label class="form-label">Min</label><input class="form-input" type="number" id="pr-${type}-min-${i}" value="${Number(r.min||0)}" oninput="updatePayrollPreview()"></div>
      <div><label class="form-label">Max</label><input class="form-input" type="number" id="pr-${type}-max-${i}" value="${Number(r.max||0)}" oninput="updatePayrollPreview()"></div>
      <div><label class="form-label">${type==='bonus'?'Kademe Primi':'Net Maaş'}</label><input class="form-input" type="number" step="0.01" id="pr-${type}-amount-${i}" value="${Number(r.amount||0)}" oninput="updatePayrollPreview()"></div>
      ${type==='bonus' ? `<div><label class="form-label">Prim tipi</label>
        <select class="form-input" id="pr-${type}-calc-${i}" onchange="updatePayrollPreview()">
          <option value="fixed" ${(r.calc_type||'fixed')==='fixed'?'selected':''}>Sabit</option>
          <option value="per_appointment" ${(r.calc_type||'fixed')==='per_appointment'?'selected':''}>Termin Başı</option>
        </select>
      </div>` : ''}
      <div><label class="form-label">Para</label>
        <select class="form-input" id="pr-${type}-currency-${i}" onchange="updatePayrollPreview()">
          <option value="EUR" ${String(r.currency||'EUR').toUpperCase()==='EUR'?'selected':''}>EUR</option>
          <option value="TRY" ${String(r.currency||'').toUpperCase()==='TRY'?'selected':''}>TRY</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" onclick="removePayrollTierRow('${type}',${i})">Sil</button>
    </div>`).join('')}
  </div>`;
  wrap.dataset.count = String(safe.length);
}

function addPayrollTierRow(type) {
  const wrap = document.getElementById(type === 'bonus' ? 'pr-bonus-tiers-wrap' : 'pr-salary-tiers-wrap');
  if (!wrap) return;
  const cur = readPayrollTierRows(type);
  cur.push({ min: 0, max: 0, amount: 0, currency: 'EUR', calc_type: 'fixed' });
  renderPayrollTierRows(type, cur);
  updatePayrollPreview();
}

function removePayrollTierRow(type, idx) {
  const cur = readPayrollTierRows(type).filter((_, i) => i !== idx);
  renderPayrollTierRows(type, cur.length ? cur : [{ min: 0, max: 0, amount: 0, currency: 'EUR', calc_type: 'fixed' }]);
  updatePayrollPreview();
}

function readPayrollTierRows(type) {
  const wrap = document.getElementById(type === 'bonus' ? 'pr-bonus-tiers-wrap' : 'pr-salary-tiers-wrap');
  const count = Number(wrap?.dataset.count || 0);
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      min: Number(document.getElementById(`pr-${type}-min-${i}`)?.value || 0),
      max: Number(document.getElementById(`pr-${type}-max-${i}`)?.value || 0),
      amount: Number(document.getElementById(`pr-${type}-amount-${i}`)?.value || 0),
      currency: (document.getElementById(`pr-${type}-currency-${i}`)?.value || 'EUR').toUpperCase(),
      calc_type: type === 'bonus'
        ? (document.getElementById(`pr-${type}-calc-${i}`)?.value === 'per_appointment' ? 'per_appointment' : 'fixed')
        : 'fixed',
    });
  }
  return _mNormTiers(rows);
}

function updatePayrollPreview() {
  const out = document.getElementById('pr-preview-result');
  if (!out) return;
  const success = Number(document.getElementById('pr-preview-success')?.value || 0);
  const base = Number(document.getElementById('pr-base')?.value || 0);
  const taxRate = Number(document.getElementById('pr-tax')?.value || 0);
  const gov = !!document.getElementById('pr-gov')?.checked;
  const currency = (document.getElementById('pr-currency')?.value || 'EUR').toUpperCase();
  const rate = Number(document.getElementById('pr-rate')?.value || 1) || 1;
  const bonusTiers = readPayrollTierRows('bonus');
  const salaryTiers = readPayrollTierRows('salary');
  const salary = _mSalaryForSuccess(base, success, salaryTiers, currency, currency, rate);
  const bonus = _mBonusFor(success, bonusTiers, currency, currency, rate);
  const revenuePerSuccess = Number(document.getElementById('pr-rev-success')?.value || 0);
  const net = salary + bonus;
  const revenue = success * revenuePerSuccess;
  const matrah = Math.max(0, revenue - net);
  const companyTax = gov ? 0 : matrah * (taxRate / 100);
  out.innerHTML = `Başarılı: <b>${success}</b> · Baz(Net): <b>${_mFmt(salary)} ${currency}</b> · Prim: <b>${_mFmt(bonus)} ${currency}</b> · Personel Hakedişi: <b>${_mFmt(net)} ${currency}</b> · Şirket Geliri: <b>${_mFmt(revenue)} ${currency}</b> · Şirket Vergisi: <b>${_mFmt(companyTax)} ${currency}</b><div style="margin-top:4px;font-size:11px;color:var(--text-3);">Prim tipi: Sabit = kademeye girince tek tutar, Termin Başı = aralıktaki her termin için tutar.</div>`;
}

async function savePayrollRules() {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  if (!fid) return;
  const rules = {
    firm_id: fid,
    currency: document.getElementById('pr-currency')?.value || 'EUR',
    exchange_rate: Number(document.getElementById('pr-rate')?.value) || 1,
    fx_api_provider: document.getElementById('pr-fx-provider')?.value || 'exchangerate_host',
    fx_api_url: document.getElementById('pr-fx-url')?.value?.trim() || '',
    fx_api_key: document.getElementById('pr-fx-key')?.value?.trim() || '',
    base_salary_mode: document.getElementById('pr-mode')?.value || 'net',
    base_salary_amount: Number(document.getElementById('pr-base')?.value) || 0,
    tax_rate_percent: Number(document.getElementById('pr-tax')?.value) || 0,
    revenue_per_success: Number(document.getElementById('pr-rev-success')?.value) || 0,
    government_supported: !!document.getElementById('pr-gov')?.checked,
    late_penalty_enabled: !!document.getElementById('pr-late-on')?.checked,
    late_penalty_amount: Number(document.getElementById('pr-late')?.value) || 0,
    leave_overflow_penalty_enabled: !!document.getElementById('pr-leave-over')?.checked,
    leave_overflow_penalty_amount: Number(document.getElementById('pr-leave-over-amt')?.value) || 0,
    appointment_customer_select_by_agent: !!document.getElementById('pr-agent-customer')?.checked,
    bonus_tiers: readPayrollTierRows('bonus'),
    salary_tiers: readPayrollTierRows('salary'),
    customer_rates: readCustomerRateRows(),
    updated_at: new Date().toISOString(),
  };
  const rulesForTable = { ...rules };
  delete rulesForTable.customer_rates;
  try {
    const exists = await sb(`payroll_rules?firm_id=eq.${fid}&select=id`).catch(() => []);
    if (exists?.length) {
      await sb(`payroll_rules?firm_id=eq.${fid}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(rulesForTable) });
    } else {
      await sb('payroll_rules', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(rulesForTable) });
    }
  } catch (e) {
    console.warn('payroll_rules table fallback:', e.message);
  }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = { ...(firms?.[0]?.settings || {}) };
    settings.payroll = { ...defaultPayrollRules(), ...rules };
    await sb(`firms?id=eq.${fid}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ settings }) });
  } catch (e) {
    toast('Kural kaydetme hatası: ' + e.message, 'err');
    return;
  }
  window._payrollRulesCacheByFirm[fid] = { ...defaultPayrollRules(), ...rules };
  toast('Muhasebe ayarları kaydedildi', 'ok');
  updatePayrollPreview();
}

function readCustomerRateRows() {
  const wrap = document.getElementById('muh-customer-rate-table');
  const count = Number(wrap?.dataset.count || 0);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const customer_id = document.getElementById(`mcr-customer-${i}`)?.value || '';
    const amount = Number(document.getElementById(`mcr-amount-${i}`)?.value || 0);
    const currency = (document.getElementById(`mcr-currency-${i}`)?.value || 'EUR').toUpperCase();
    if (!customer_id || amount < 0) continue;
    rows.push({ customer_id, amount, currency });
  }
  return rows;
}

function renderCustomerRateTable(rules) {
  const box = document.getElementById('muh-customer-rate-table');
  if (!box) return;
  const fid = muhasebeFirmId();
  const customers = (window._customersCacheByFirm[fid] || []).filter(c => c?.id);
  if (!customers.length) {
    box.innerHTML = `<div style="padding:10px;color:var(--text-3);">Önce müşteri ekleyin.</div>`;
    box.dataset.count = '0';
    return;
  }
  const existing = Array.isArray(rules?.customer_rates) ? rules.customer_rates : [];
  const rows = existing.length ? existing : [{ customer_id: customers[0].id, amount: Number(rules?.revenue_per_success || 0), currency: (rules?.currency || 'EUR').toUpperCase() }];
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
    ${rows.map((r, i) => `
      <div style="display:grid;grid-template-columns:1fr 150px 90px auto;gap:8px;align-items:end;">
        <div class="form-row">
          <label class="form-label">Müşteri</label>
          <select class="form-input" id="mcr-customer-${i}">
            ${customers.map(c => `<option value="${c.id}" ${c.id === r.customer_id ? 'selected' : ''}>${_mEsc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label class="form-label">Onaylı Termin Geliri</label><input class="form-input" id="mcr-amount-${i}" type="number" step="0.01" value="${Number(r.amount || 0)}"></div>
        <div class="form-row"><label class="form-label">Para</label><select class="form-input" id="mcr-currency-${i}"><option value="EUR" ${String(r.currency || 'EUR').toUpperCase() === 'EUR' ? 'selected' : ''}>EUR</option><option value="TRY" ${String(r.currency || '').toUpperCase() === 'TRY' ? 'selected' : ''}>TRY</option></select></div>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeCustomerRateRow(${i})">Sil</button>
      </div>
    `).join('')}
    <div style="font-size:11px;color:var(--text-3);">Müşteriye özel satır yoksa genel "Başarılı termin gelir tutarı" kullanılır.</div>
    <div><button class="btn btn-ghost btn-sm" type="button" onclick="addCustomerRateRow()">+ Tarife ekle</button></div>
  </div>`;
  box.dataset.count = String(rows.length);
}

function addCustomerRateRow() {
  const fid = muhasebeFirmId();
  const customers = (window._customersCacheByFirm[fid] || []).filter(c => c?.id);
  if (!customers.length) return;
  const cur = readCustomerRateRows();
  cur.push({ customer_id: customers[0].id, amount: 0, currency: 'EUR' });
  renderCustomerRateTable({ customer_rates: cur, revenue_per_success: Number(document.getElementById('pr-rev-success')?.value || 0), currency: document.getElementById('pr-currency')?.value || 'EUR' });
}

function removeCustomerRateRow(idx) {
  const cur = readCustomerRateRows().filter((_, i) => i !== idx);
  renderCustomerRateTable({ customer_rates: cur, revenue_per_success: Number(document.getElementById('pr-rev-success')?.value || 0), currency: document.getElementById('pr-currency')?.value || 'EUR' });
}

function _mSalaryForSuccess(baseSalary, successCount, salaryTiers, ruleCurrency, targetCurrency, rate) {
  let salary = Number(baseSalary || 0);
  (salaryTiers || []).forEach(t => {
    const min = Number(t.min || 0);
    const max = Number(t.max || 999999);
    if (successCount >= min && successCount <= max) {
      const ccy = (t.currency || ruleCurrency || 'EUR').toUpperCase();
      let amt = Number(t.amount || 0);
      if (ccy !== targetCurrency) amt = _mConvertCurrency(amt, ccy, targetCurrency, rate);
      salary = amt;
    }
  });
  return salary;
}

async function _fetchEurTryRateAt(dateStr) {
  return await _fetchFxRateByRules(dateStr, defaultPayrollRules());
}

async function _fetchFxRateByRules(dateStr, rules) {
  const provider = rules?.fx_api_provider || 'exchangerate_host';
  try {
    if (provider === 'frankfurter') {
      const res = await fetch(`https://api.frankfurter.app/${dateStr}?from=EUR&to=TRY`);
      if (!res.ok) return null;
      const json = await res.json();
      return Number(json?.rates?.TRY || 0) || null;
    }
    if (provider === 'custom') {
      const tpl = rules?.fx_api_url || '';
      if (!tpl) return null;
      let url = tpl.replaceAll('{date}', dateStr).replaceAll('{base}', 'EUR').replaceAll('{quote}', 'TRY');
      const key = rules?.fx_api_key || '';
      if (key) {
        const joiner = url.includes('?') ? '&' : '?';
        url += `${joiner}apikey=${encodeURIComponent(key)}`;
      }
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return Number(json?.rates?.TRY || json?.data?.TRY || json?.TRY || 0) || null;
    }
    const res = await fetch(`https://api.exchangerate.host/${dateStr}?base=EUR&symbols=TRY`);
    if (!res.ok) return null;
    const json = await res.json();
    return Number(json?.rates?.TRY || 0) || null;
  } catch (e) {
    return null;
  }
}

async function _getMonthFxRate(fid, ym, fallbackRate, rules) {
  const b = _mMonthBounds(ym);
  const rateDate = b.end;
  try {
    const ex = await sb(`payroll_fx_rates?firm_id=eq.${fid}&rate_date=eq.${rateDate}&base_currency=eq.EUR&quote_currency=eq.TRY&select=rate&limit=1`);
    if (ex?.length && Number(ex[0].rate) > 0) return Number(ex[0].rate);
  } catch (e) {}
  const apiRate = await _fetchFxRateByRules(rateDate, rules || {});
  const rate = apiRate || Number(fallbackRate || 1) || 1;
  try {
    await sb('payroll_fx_rates', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: fid,
        period_ym: ym,
        rate_date: rateDate,
        base_currency: 'EUR',
        quote_currency: 'TRY',
        rate,
        source: apiRate ? 'exchangerate.host' : 'manual_fallback',
      }),
    });
  } catch (e) {}
  return rate;
}

async function renderMuhasebeCustomers() {
  const fid = muhasebeFirmId();
  const box = document.getElementById('muhasebe-customers-table');
  if (!box || !fid) return;
  try {
    const list = await sb(`customers?firm_id=eq.${fid}&select=id,name,code,is_active,notes&order=name.asc`);
    const rows = list || [];
    window._customersCacheByFirm[fid] = rows.filter(r => r.is_active);
    if (!rows.length) {
      box.innerHTML = `<div style="color:var(--text-3);padding:10px;">Müşteri yok</div>`;
      return;
    }
    box.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
      <th>Müşteri</th><th>Kod</th><th>Durum</th><th>Not</th><th>İşlem</th>
    </tr></thead><tbody>${
      rows.map(r => `<tr>
        <td>${_mEsc(r.name)}</td>
        <td>${_mEsc(r.code || '—')}</td>
        <td>${r.is_active ? '<span class="muh-badge ok">Aktif</span>' : '<span class="muh-badge warn">Pasif</span>'}</td>
        <td>${_mEsc(r.notes || '—')}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="toggleMuhasebeCustomer('${r.id}',${!r.is_active})">${r.is_active ? 'Pasif' : 'Aktif'}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteMuhasebeCustomer('${r.id}')">Sil</button>
        </td>
      </tr>`).join('')
    }</tbody></table></div>`;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red);padding:10px;">Hata: ${_mEsc(e.message)}</div>`;
  }
}

async function createMuhasebeCustomer() {
  const fid = muhasebeFirmId();
  if (!fid || !isMuhasebeAdmin()) return;
  const name = document.getElementById('mc-name')?.value?.trim();
  const code = document.getElementById('mc-code')?.value?.trim() || null;
  const notes = document.getElementById('mc-note')?.value?.trim() || null;
  if (!name) {
    toast('Müşteri adı zorunlu', 'err');
    return;
  }
  try {
    await sb('customers', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ firm_id: fid, name, code, notes, is_active: true, created_by: currentUser?.id || null }),
    });
    document.getElementById('mc-name').value = '';
    document.getElementById('mc-code').value = '';
    document.getElementById('mc-note').value = '';
    await renderMuhasebeCustomers();
    toast('Müşteri eklendi', 'ok');
  } catch (e) {
    toast('Müşteri eklenemedi: ' + e.message, 'err');
  }
}

async function toggleMuhasebeCustomer(id, toActive) {
  if (!isMuhasebeAdmin()) return;
  try {
    await sb(`customers?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ is_active: !!toActive }) });
    await renderMuhasebeCustomers();
  } catch (e) {
    toast('Güncellenemedi: ' + e.message, 'err');
  }
}

async function deleteMuhasebeCustomer(id) {
  if (!isMuhasebeAdmin()) return;
  if (!(await mbConfirm('Müşteri silinsin mi?', 'Müşteri Sil'))) return;
  try {
    await sb(`customers?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await renderMuhasebeCustomers();
  } catch (e) {
    toast('Silinemedi: ' + e.message, 'err');
  }
}

async function _mFetchUsers(fid) {
  try {
    const rows = await sb(`users?firm_id=eq.${fid}&is_active=eq.true&select=id,name,role&order=name.asc`);
    return rows || [];
  } catch (e) {
    return [];
  }
}

async function _mFetchMonthlyData(fid, ym, year, monthBounds) {
  const [ovr, adj, monthly, appts, leaveReqs, ents, lates, firmRows] = await Promise.all([
    sb(`payroll_employee_overrides?firm_id=eq.${fid}&select=*`).catch(() => []),
    sb(`payroll_adjustments?firm_id=eq.${fid}&period_ym=eq.${ym}&select=*`).catch(() => []),
    sb(`payroll_monthly?firm_id=eq.${fid}&period_ym=eq.${ym}&select=*`).catch(() => []),
    sb(`appointments?firm_id=eq.${fid}&termin_tarih=gte.${monthBounds.start}T00:00:00&termin_tarih=lte.${monthBounds.end}T23:59:59&select=id,agent_id,durum,customer_id`).catch(() => []),
    sb(`leave_requests?firm_id=eq.${fid}&status=eq.approved&date_from=lte.${monthBounds.end}&date_to=gte.${monthBounds.start}&select=user_id,days_used,kind`).catch(() => []),
    sb(`user_leave_entitlements?year=eq.${year}&select=user_id,extra_days_granted`).catch(() => []),
    sb(`late_arrivals?firm_id=eq.${fid}&day_date=gte.${monthBounds.start}&day_date=lte.${monthBounds.end}&select=user_id,minutes_late`).catch(() => []),
    sb(`firms?id=eq.${fid}&select=settings`).catch(() => []),
  ]);
  const hr = mergeHr?.(firmRows?.[0]?.settings?.hr) || defaultHrSettings();
  return { ovr: ovr || [], adj: adj || [], monthly: monthly || [], appts: appts || [], leaveReqs: leaveReqs || [], ents: ents || [], lates: lates || [], hr };
}

function _mBuildStatsByUser(appts, leaveReqs, ents, lates) {
  const s = {};
  const ensure = uid => {
    if (!s[uid]) s[uid] = { success: 0, fail: 0, pending: 0, qc: 0, cancel: 0, leaveDays: 0, lateCount: 0, entitlementExtra: 0 };
    return s[uid];
  };
  (appts || []).forEach(a => {
    if (!a.agent_id) return;
    const st = ensure(a.agent_id);
    const d = String(a.durum || '').toLowerCase();
    if (d === 'basarili') st.success += 1;
    else if (d === 'basarisiz') st.fail += 1;
    else if (d === 'beklemede') st.pending += 1;
    else if (d === 'qc_bekleniyor') st.qc += 1;
    else if (d === 'iptal') st.cancel += 1;
  });
  (leaveReqs || []).forEach(r => {
    if (!r.user_id) return;
    const st = ensure(r.user_id);
    st.leaveDays += Number(r.days_used || 0);
  });
  (ents || []).forEach(e => {
    if (!e.user_id) return;
    const st = ensure(e.user_id);
    st.entitlementExtra += Number(e.extra_days_granted || 0);
  });
  (lates || []).forEach(l => {
    if (!l.user_id) return;
    const st = ensure(l.user_id);
    st.lateCount += 1;
  });
  return s;
}

function _mCollectAdjustments(adj, uid, rules) {
  let add = 0;
  let ded = 0;
  (adj || []).filter(a => a.user_id === uid).forEach(a => {
    const cv = _mConvertCurrency(a.amount, a.currency || rules.currency, rules.currency, Number(rules.exchange_rate || 1));
    if (a.adjustment_type === 'add') add += cv;
    else ded += cv;
  });
  return { add, ded };
}

async function renderMuhasebePayrollTable(fid, ym, rules, opts = {}) {
  window._muhPayrollUi = opts.ui || 'admin';
  const users = await _mFetchUsers(fid);
  const b = _mMonthBounds(ym);
  const monthRate = await _getMonthFxRate(fid, ym, Number(rules.exchange_rate || 1), rules);
  const data = await _mFetchMonthlyData(fid, ym, b.year, b);
  const statsByUser = _mBuildStatsByUser(data.appts, data.leaveReqs, data.ents, data.lates);
  const overMap = {};
  const monthlyMap = {};
  (data.ovr || []).forEach(o => { overMap[o.user_id] = o; });
  (data.monthly || []).forEach(m => { monthlyMap[m.user_id] = m; });

  const rows = users.map(u => {
    const st = statsByUser[u.id] || { success: 0, fail: 0, pending: 0, qc: 0, cancel: 0, leaveDays: 0, lateCount: 0, entitlementExtra: 0 };
    const ov = overMap[u.id] || {};
    const noTermin = !!ov.no_termin;
    const mode = ov.base_salary_mode || rules.base_salary_mode;
    const rawBaseSalary = Number(ov.base_salary_amount ?? rules.base_salary_amount ?? 0);
    const taxRate = Number(ov.tax_rate_percent ?? rules.tax_rate_percent ?? 0);
    const tiers = _mNormTiers(Array.isArray(ov.bonus_tiers) ? ov.bonus_tiers : rules.bonus_tiers);
    const salaryTiers = _mNormTiers(Array.isArray(ov.salary_tiers) ? ov.salary_tiers : rules.salary_tiers);
    const success = noTermin ? 0 : st.success;
    const baseSalary = _mSalaryForSuccess(rawBaseSalary, success, salaryTiers, rules.currency, rules.currency, monthRate);
    const bonus = _mBonusFor(success, tiers, rules.currency, rules.currency, monthRate);
    const latePenalty = rules.late_penalty_enabled ? st.lateCount * Number(rules.late_penalty_amount || 0) : 0;
    const annualAllowance = (Number(data.hr?.annual_leave_days_default || 14)) + Number(st.entitlementExtra || 0);
    const leaveOverflow = Math.max(0, Number(st.leaveDays || 0) - annualAllowance);
    const leavePenalty = rules.leave_overflow_penalty_enabled ? leaveOverflow * Number(rules.leave_overflow_penalty_amount || 0) : 0;
    const adj = _mCollectAdjustments(data.adj, u.id, { ...rules, exchange_rate: monthRate });
    const preTax = baseSalary + bonus + adj.add - adj.ded - latePenalty - leavePenalty;
    const taxAmount = 0;
    const netPayable = preTax;
    const paidAmount = Number(monthlyMap[u.id]?.paid_amount || 0);
    const remaining = netPayable - paidAmount;
    return {
      user_id: u.id,
      user_name: u.name || u.id.slice(0, 8),
      role: u.role,
      ym,
      mode,
      noTermin,
      success,
      fail: st.fail,
      pending: st.pending,
      qc: st.qc,
      cancel: st.cancel,
      leaveDays: st.leaveDays,
      leaveOverflow,
      lateCount: st.lateCount,
      baseSalary,
      bonus,
      manualAdd: adj.add,
      manualDeduct: adj.ded,
      latePenalty,
      leavePenalty,
      taxRate,
      taxAmount,
      netPayable,
      paidAmount,
      remaining,
      currency: rules.currency,
      fxRate: monthRate,
      totalRevenue: 0,
    };
  });

  const rateRows = _mParseTiers(rules.customer_rates);
  const rateMap = {};
  rateRows.forEach(r => { if (r?.customer_id) rateMap[r.customer_id] = r; });
  const byUser = {};
  rows.forEach(r => { byUser[r.user_id] = r; });
  (data.appts || []).forEach(a => {
    const uid = a.agent_id;
    if (!uid || !byUser[uid]) return;
    const d = String(a.durum || '').toLowerCase();
    if (d !== 'basarili' && d !== 'başarılı') return;
    const customerRate = a.customer_id ? rateMap[a.customer_id] : null;
    const rv = customerRate
      ? _mConvertCurrency(Number(customerRate.amount || 0), customerRate.currency || rules.currency, rules.currency, monthRate)
      : Number(rules.revenue_per_success || 0);
    byUser[uid].totalRevenue += Number(rv || 0);
  });

  let filtered = rows;
  if (window._muhPayrollUi === 'maasim') filtered = rows.filter(r => r.user_id === currentUser.id);
  else if (currentUser?.role === 'agent') filtered = rows.filter(r => r.user_id === currentUser.id);
  window._muhasebeRows = filtered;
  const showCompanyFinance = isMuhasebeAdmin();
  const summaryBox = _mPayrollSummaryBox();
  if (showCompanyFinance) renderMuhasebeSummaryCards(filtered, rules);
  else if (summaryBox) summaryBox.innerHTML = '';
  renderMuhasebeRowsTable(filtered, rules);
  if (showCompanyFinance) renderMuhasebeFinancePanels(filtered, rules);
  else {
    const incomeBox = document.getElementById('muh-income-expense-summary');
    const taxBox = document.getElementById('muh-tax-summary');
    if (incomeBox) incomeBox.innerHTML = '';
    if (taxBox) taxBox.innerHTML = '';
  }
  const payrollRowForSelf = rows.find(r => r.user_id === currentUser.id) || null;
  const uidSelf = currentUser.id;
  const ovSelf = overMap[uidSelf] || {};
  const bonusTiersSelf = Array.isArray(ovSelf.bonus_tiers) ? ovSelf.bonus_tiers : rules.bonus_tiers;
  const salaryTiersSelf = Array.isArray(ovSelf.salary_tiers) ? ovSelf.salary_tiers : rules.salary_tiers;
  if (['agent', 'qc'].includes(currentUser?.role || '')) {
    if (typeof loadAgentSalaryDash === 'function') {
      loadAgentSalaryDash(fid, ym, rules, payrollRowForSelf, bonusTiersSelf, salaryTiersSelf);
    }
    if (typeof loadAgentSelfPerformanceDash === 'function') {
      loadAgentSelfPerformanceDash(fid, ym, rules);
    }
  }
}

function renderMuhasebeSummaryCards(rows, rules) {
  const box = _mPayrollSummaryBox();
  if (!box) return;
  const sum = rows.reduce((a, r) => {
    a.base += r.baseSalary; a.bonus += r.bonus; a.pen += r.latePenalty + r.leavePenalty + r.manualDeduct;
    a.tax += r.taxAmount; a.pay += r.netPayable; a.paid += r.paidAmount; a.rem += r.remaining;
    a.success += r.success || 0;
    a.rev += Number(r.totalRevenue || 0);
    return a;
  }, { base: 0, bonus: 0, pen: 0, tax: 0, pay: 0, paid: 0, rem: 0, success: 0, rev: 0 });
  const totalRevenue = sum.rev;
  const taxBase = Math.max(0, totalRevenue - sum.pay);
  const companyTax = rules.government_supported ? 0 : taxBase * (Number(rules.tax_rate_percent || 0) / 100);
  const netProfit = totalRevenue - sum.pay - companyTax;
  const cur = _mEsc(rules.currency || 'EUR');
  box.innerHTML = `
    <div class="stat-card"><div class="stat-lbl">Gelir (${cur})</div><div class="stat-val">${_mFmt(totalRevenue)}</div><div class="stat-meta">${sum.success} başarılı termin</div></div>
    <div class="stat-card"><div class="stat-lbl">Baz Maaş (${cur})</div><div class="stat-val">${_mFmt(sum.base)}</div></div>
    <div class="stat-card stat-green"><div class="stat-lbl">Prim (${cur})</div><div class="stat-val">${_mFmt(sum.bonus)}</div></div>
    <div class="stat-card stat-red"><div class="stat-lbl">Toplam Kesinti (${cur})</div><div class="stat-val">${_mFmt(sum.pen)}</div></div>
    <div class="stat-card"><div class="stat-lbl">Şirket Vergisi (${cur})</div><div class="stat-val">${_mFmt(companyTax)}</div><div class="stat-meta">Matrah: ${_mFmt(taxBase)} ${cur}</div></div>
    <div class="stat-card stat-blue"><div class="stat-lbl">Hakediş (${cur})</div><div class="stat-val">${_mFmt(sum.pay)}</div></div>
    <div class="stat-card stat-purple"><div class="stat-lbl">Kalan (${cur})</div><div class="stat-val">${_mFmt(sum.rem)}</div><div class="stat-meta">Ödenen: ${_mFmt(sum.paid)} ${cur}</div></div>
    <div class="stat-card"><div class="stat-lbl">Net Kar (${cur})</div><div class="stat-val" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${_mFmt(netProfit)}</div></div>
  `;
}

function renderMuhasebeFinancePanels(rows, rules) {
  const cur = _mEsc(rules.currency || 'EUR');
  const totals = rows.reduce((a, r) => {
    a.rev += Number(r.totalRevenue || 0);
    a.pay += Number(r.netPayable || 0);
    a.paid += Number(r.paidAmount || 0);
    return a;
  }, { rev: 0, pay: 0, paid: 0 });
  const taxBase = Math.max(0, totals.rev - totals.pay);
  const tax = rules.government_supported ? 0 : taxBase * (Number(rules.tax_rate_percent || 0) / 100);
  const incomeBox = document.getElementById('muh-income-expense-summary');
  const taxBox = document.getElementById('muh-tax-summary');
  if (incomeBox) {
    incomeBox.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px;">
      <div class="stat-card"><div class="stat-lbl">Toplam Gelir (${cur})</div><div class="stat-val">${_mFmt(totals.rev)}</div></div>
      <div class="stat-card"><div class="stat-lbl">Toplam Hakediş (${cur})</div><div class="stat-val">${_mFmt(totals.pay)}</div></div>
      <div class="stat-card"><div class="stat-lbl">Ödenen (${cur})</div><div class="stat-val">${_mFmt(totals.paid)}</div></div>
    </div>`;
  }
  if (taxBox) {
    taxBox.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:10px;">
      <div class="stat-card"><div class="stat-lbl">Vergi Matrahı (${cur})</div><div class="stat-val">${_mFmt(taxBase)}</div></div>
      <div class="stat-card"><div class="stat-lbl">Şirket Vergisi (${cur})</div><div class="stat-val">${_mFmt(tax)}</div></div>
      <div class="stat-card"><div class="stat-lbl">Vergi Sonrası Kar (${cur})</div><div class="stat-val">${_mFmt(totals.rev - totals.pay - tax)}</div></div>
    </div>`;
  }
}

function renderMuhasebeRowsTable(rows, rules) {
  const wrap = _mPayrollTableWrap();
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = `<div style="padding:20px;color:var(--text-3);">Bu dönemde kayıt yok.</div>`;
    return;
  }
  const admin = isMuhasebeAdmin();
  const cur = _mEsc(rules.currency || 'EUR');
  wrap.innerHTML = `<table><thead><tr>
    <th>Personel</th><th>Başarılı</th><th>Baz</th><th>Prim</th><th>Geç/Kalma</th><th>İzin Aşımı</th>
    <th>Manuel</th><th>Vergi</th><th>Hakediş</th><th>Ödenen</th><th>Kalan</th>${admin ? '<th>İşlem</th>' : ''}
  </tr></thead><tbody>${
    rows.map(r => {
      const manualNet = r.manualAdd - r.manualDeduct;
      const manualClass = manualNet >= 0 ? 'ok' : 'err';
      return `<tr>
        <td style="font-weight:700;">${_mEsc(r.user_name)}<div style="font-size:10px;color:var(--text-3);margin-top:2px;">${_mEsc(r.role)}${r.noTermin ? ' · sabit personel' : ''}</div></td>
        <td>${r.success}</td>
        <td>${_mFmt(r.baseSalary)} ${cur}</td>
        <td>${_mFmt(r.bonus)} ${cur}</td>
        <td>${_mFmt(r.latePenalty)} ${cur}<div style="font-size:10px;color:var(--text-3);">${r.lateCount} kez</div></td>
        <td>${_mFmt(r.leavePenalty)} ${cur}<div style="font-size:10px;color:var(--text-3);">${_mFmt(r.leaveOverflow)} gün</div></td>
        <td><span class="muh-badge ${manualClass}">${manualNet >= 0 ? '+' : ''}${_mFmt(manualNet)} ${cur}</span></td>
        <td><span style="font-size:11px;color:var(--text-3);">Şirket matrahında</span></td>
        <td style="font-weight:800;">${_mFmt(r.netPayable)} ${cur}</td>
        <td>${_mFmt(r.paidAmount)} ${cur}</td>
        <td style="font-weight:800;color:${r.remaining > 0 ? 'var(--red)' : 'var(--green)'};">${_mFmt(r.remaining)} ${cur}</td>
        ${admin ? `<td>
          <button class="btn btn-ghost btn-sm" onclick="openPayrollOverride('${r.user_id}')">Özel Ayar</button>
          <button class="btn btn-ghost btn-sm" onclick="addPayrollAdjustment('${r.user_id}')">Ekle/Kes</button>
          <button class="btn btn-ghost btn-sm" onclick="savePayrollPayment('${r.user_id}')">Ödeme</button>
        </td>` : ''}
      </tr>`;
    }).join('')
  }</tbody></table>`;
}

async function openPayrollOverride(uid) {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  const rows = await sb(`payroll_employee_overrides?firm_id=eq.${fid}&user_id=eq.${uid}&select=*`).catch(() => []);
  const cur = rows?.[0] || {};
  const noTermin = await mbConfirm('Bu personel termin yapmıyor olarak işaretlensin mi?', 'Personel Tipi');
  const base = await mbPrompt('Baz maaş özel ayarı (boş bırak = varsayılan)', cur.base_salary_amount ?? '', 'Kişiye Özel Ayar');
  if (base === null) return;
  const tax = await mbPrompt('Vergi % özel ayarı (boş bırak = varsayılan)', cur.tax_rate_percent ?? '', 'Kişiye Özel Ayar');
  if (tax === null) return;
  const mode = await mbPrompt('Maaş modu (net / gross_minimum)', cur.base_salary_mode || '', 'Kişiye Özel Ayar');
  if (mode === null) return;
  const notes = await mbPrompt('Not', cur.notes || '', 'Kişiye Özel Ayar');
  if (notes === null) return;
  const body = {
    firm_id: fid,
    user_id: uid,
    no_termin: !!noTermin,
    base_salary_amount: base === '' ? null : Number(base),
    tax_rate_percent: tax === '' ? null : Number(tax),
    base_salary_mode: mode === '' ? null : mode,
    notes: notes || null,
    is_active: true,
  };
  try {
    if (rows?.length) await sb(`payroll_employee_overrides?id=eq.${rows[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(body) });
    else await sb('payroll_employee_overrides', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
    toast('Kişiye özel ayar kaydedildi', 'ok');
    loadMuhasebePage();
  } catch (e) {
    toast('Kişiye özel ayar hatası: ' + e.message, 'err');
  }
}

async function addPayrollAdjustment(uid) {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  const type = await mbPrompt('İşlem tipi: add veya deduct', 'add', 'Ekle/Kes');
  if (!['add', 'deduct'].includes(String(type || '').trim())) return;
  const amountStr = await mbPrompt('Tutar', '0', 'Ekle/Kes');
  if (amountStr === null) return;
  const amount = Number(amountStr);
  if (!amount || amount <= 0) return;
  const currencyIn = await mbPrompt('Para birimi (EUR/TRY)', 'EUR', 'Ekle/Kes');
  if (currencyIn === null) return;
  const currency = (currencyIn || 'EUR').toUpperCase();
  const reasonIn = await mbPrompt('Açıklama', '', 'Ekle/Kes');
  if (reasonIn === null) return;
  const reason = reasonIn || null;
  try {
    await sb('payroll_adjustments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ firm_id: fid, user_id: uid, period_ym: _mGetPeriod(), adjustment_type: type, amount, currency, reason, created_by: currentUser?.id || null }),
    });
    toast('İşlem kaydedildi', 'ok');
    loadMuhasebePage();
  } catch (e) {
    toast('İşlem hatası: ' + e.message, 'err');
  }
}

async function savePayrollPayment(uid) {
  if (!isMuhasebeAdmin()) return;
  const row = (window._muhasebeRows || []).find(r => r.user_id === uid);
  if (!row) return;
  const amountIn = await mbPrompt(`Ödenen tutar (${row.currency})`, String(row.paidAmount || 0), 'Ödeme');
  if (amountIn === null) return;
  const amount = Number(amountIn);
  if (isNaN(amount) || amount < 0) return;
  const fid = muhasebeFirmId();
  const period = _mGetPeriod();
  const body = {
    firm_id: fid,
    user_id: uid,
    period_ym: period,
    currency: row.currency,
    base_salary: row.baseSalary,
    bonus_amount: row.bonus,
    leave_penalty: row.leavePenalty,
    late_penalty: row.latePenalty,
    manual_additions: row.manualAdd,
    manual_deductions: row.manualDeduct,
    tax_amount: row.taxAmount,
    net_payable: row.netPayable,
    paid_amount: amount,
    updated_at: new Date().toISOString(),
  };
  try {
    const ex = await sb(`payroll_monthly?firm_id=eq.${fid}&user_id=eq.${uid}&period_ym=eq.${period}&select=id`).catch(() => []);
    if (ex?.length) await sb(`payroll_monthly?id=eq.${ex[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(body) });
    else await sb('payroll_monthly', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
    toast('Ödeme kaydedildi', 'ok');
    loadMuhasebePage();
  } catch (e) {
    toast('Ödeme hatası: ' + e.message, 'err');
  }
}

function exportMuhasebeCsv() {
  const rows = window._muhasebeRows || [];
  if (!rows.length) {
    toast('Dışa aktarılacak satır yok', 'warn');
    return;
  }
  const h = ['Dönem', 'Personel', 'Rol', 'Başarılı', 'Baz', 'Prim', 'GeçKalmaKes', 'IzinKes', 'ManuelEkle', 'ManuelKes', 'Vergi', 'Hakediş', 'Ödenen', 'Kalan', 'ParaBirimi'];
  const esc = v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [h.map(esc).join(',')];
  rows.forEach(r => {
    lines.push([
      r.ym, r.user_name, r.role, r.success, r.baseSalary, r.bonus, r.latePenalty, r.leavePenalty, r.manualAdd, r.manualDeduct,
      r.taxAmount, r.netPayable, r.paidAmount, r.remaining, r.currency,
    ].map(esc).join(','));
  });
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `muhasebe_${_mGetPeriod()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportMuhasebeXlsx() {
  const rows = window._muhasebeRows || [];
  if (!rows.length) {
    toast('Dışa aktarılacak satır yok', 'warn');
    return;
  }
  if (typeof XLSX === 'undefined') {
    toast('XLSX kütüphanesi bulunamadı', 'err');
    return;
  }
  const head = ['Dönem', 'Personel', 'Rol', 'Başarılı', 'Baz', 'Prim', 'GeçKalmaKes', 'IzinKes', 'ManuelEkle', 'ManuelKes', 'Vergi', 'Hakediş', 'Ödenen', 'Kalan', 'ParaBirimi'];
  const aoa = [head];
  rows.forEach(r => aoa.push([r.ym, r.user_name, r.role, r.success, r.baseSalary, r.bonus, r.latePenalty, r.leavePenalty, r.manualAdd, r.manualDeduct, r.taxAmount, r.netPayable, r.paidAmount, r.remaining, r.currency]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Muhasebe');
  XLSX.writeFile(wb, `muhasebe_${_mGetPeriod()}.xlsx`);
}
