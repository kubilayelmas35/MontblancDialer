// ─────────────────────────────────────────────
// MUHASEBE — maaş, prim, kesinti, müşteri
// ─────────────────────────────────────────────

window._muhasebeRows = [];
window._payrollRulesCacheByFirm = window._payrollRulesCacheByFirm || {};
window._customersCacheByFirm = window._customersCacheByFirm || {};

function isMuhasebeAdmin() {
  return mbIsFirmAdmin();
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
  const role = String(currentUser?.role || '').trim().toLowerCase();
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin', 'field_agent'].includes(role)) return false;
  // Bu sayfalar rol bazlı çalışmalı; eksik permission kaydı ekranı boş bırakmamalı.
  return true;
}

function canViewPerformansimPage() {
  const role = String(currentUser?.role || '').trim().toLowerCase();
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin', 'field_agent'].includes(role)) return false;
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
    fx_api_provider: 'frankfurter',
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
    salary_categories: [],
    sgk_percent: 0,
    office_day_rate: 0,
  };
}

function _mNormCategories(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((c, i) => ({
    id: String(c?.id || `cat_${i}`),
    name: String(c?.name || '').trim(),
    base_salary_amount: Number(c?.base_salary_amount || 0),
    sgk_percent: Number(c?.sgk_percent || 0),
    office_day_rate: Number(c?.office_day_rate || 0),
    fixed_staff: !!c?.fixed_staff,
    bonus_tiers: _mNormTiers(c?.bonus_tiers),
    salary_tiers: _mNormTiers(c?.salary_tiers),
    no_salary: !!c?.no_salary,
  }));
}

function mbBuiltinSalaryCategories() {
  const per = (min, max, amount) => ({ min, max, amount, currency: 'EUR', calc_type: 'per_appointment' });
  const band = (min, max, amount) => ({ min, max, amount, currency: 'EUR', calc_type: 'fixed' });
  const bonusA = [per(21, 25, 46), per(26, 30, 48), per(31, 35, 53), per(36, 40, 61), per(41, 45, 70), per(46, 999999, 80)];
  return _mNormCategories([
    { id: 'kat_a', name: 'A', base_salary_amount: 1200, bonus_tiers: bonusA, salary_tiers: [] },
    {
      id: 'kat_b',
      name: 'B',
      base_salary_amount: 0,
      bonus_tiers: bonusA,
      salary_tiers: [band(1, 9, 500), band(10, 14, 650), band(15, 19, 1000), band(20, 999999, 1200)],
    },
    { id: 'kat_c', name: 'C', base_salary_amount: 1200, bonus_tiers: [per(21, 999999, 40)], salary_tiers: [] },
    { id: 'kat_fixed', name: 'Sabit maaş', base_salary_amount: 0, fixed_staff: true, bonus_tiers: [], salary_tiers: [] },
    { id: 'kat_none', name: 'Maaş almaz', base_salary_amount: 0, no_salary: true, fixed_staff: true, bonus_tiers: [], salary_tiers: [] },
  ]);
}

function _mCatNameKey(name) {
  return String(name || '').trim().toLocaleUpperCase('tr-TR');
}

function _mEffectiveCategories(rules) {
  const cats = _mNormCategories(rules?.salary_categories);
  const names = new Set(cats.map((c) => _mCatNameKey(c.name)));
  const extra = mbBuiltinSalaryCategories().filter((c) => !names.has(_mCatNameKey(c.name)));
  return cats.concat(extra);
}

function _mPickTiers(personal, catOwn, firmOwn, cat) {
  if (cat?.no_salary) return [];
  if (Array.isArray(personal) && personal.length) return _mNormTiers(personal);
  if (cat?.fixed_staff) return _mNormTiers(catOwn || []);
  if (catOwn?.length) return _mNormTiers(catOwn);
  return _mNormTiers(firmOwn);
}

function _mParseMonthMap(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) {
    return {};
  }
}

function _mNamedCat(cats, name) {
  const want = String(name || '').trim().toUpperCase();
  return (cats || []).find((c) => String(c.name || '').trim().toUpperCase() === want) || null;
}

function _mCatForMonth(user, ym, cats) {
  const list = cats || [];
  const namedA = _mNamedCat(list, 'A');
  const map = _mParseMonthMap(user?.payroll_category_months);
  if (String(ym || '') < '2026-08') return namedA;
  if (Object.keys(map).length) {
    const id = map[ym];
    if (!id) return namedA;
    return list.find((c) => c.id === id) || namedA;
  }
  if (user?.payroll_category_id) return list.find((c) => c.id === user.payroll_category_id) || null;
  return namedA;
}

function _mKatMonths() {
  const endY = new Date().getFullYear() + 1;
  const out = [];
  let y = 2026;
  let m = 8;
  while (y < endY || (y === endY && m <= 12)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
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

function _mbMonthFaceText(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const loc = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'tr-TR';
  const label = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
  return label.charAt(0).toLocaleUpperCase(loc) + label.slice(1);
}

function _mbPaintMonthFaces() {
  ['muhasebe-period', 'maasim-period', 'performansim-period'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    let wrap = el.parentElement;
    if (!wrap || !wrap.classList.contains('mb-month-wrap')) {
      wrap = document.createElement('span');
      wrap.className = 'mb-month-wrap';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
    }
    let face = wrap.querySelector(':scope > .mb-month-face');
    if (!face) {
      face = document.createElement('span');
      face.className = 'mb-month-face';
      face.setAttribute('aria-hidden', 'true');
      wrap.appendChild(face);
    }
    face.textContent = _mbMonthFaceText(el.value);
  });
}

function _mGetPeriod() {
  const ids = ['muhasebe-period', 'maasim-period', 'performansim-period'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el?.value) {
      _mbPaintMonthFaces();
      return el.value;
    }
  }
  const now = new Date();
  const v = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = v;
  });
  _mbPaintMonthFaces();
  return v;
}

function _mSyncPayrollPeriodInputs(changedEl) {
  const v = changedEl?.value;
  if (!v) return;
  ['muhasebe-period', 'maasim-period', 'performansim-period'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el !== changedEl) el.value = v;
  });
  _mbPaintMonthFaces();
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
  merged.salary_categories = _mNormCategories(_mParseTiers(merged.salary_categories));
  merged.sgk_percent = Number(merged.sgk_percent || 0);
  merged.office_day_rate = Number(merged.office_day_rate || 0);
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
  const n = Number(successCount || 0);
  let perSum = 0;
  let fixedAmt = 0;
  let fixedHit = false;
  (tiers || []).forEach(t => {
    const min = Number(t.min || 0);
    const max = Number(t.max || 999999);
    const ccy = (t.currency || ruleCurrency || 'EUR').toUpperCase();
    let oneUnit = Number(t.amount || 0);
    if (ccy !== targetCurrency) oneUnit = _mConvertCurrency(oneUnit, ccy, targetCurrency, rate);
    if (t.calc_type === 'per_appointment') {
      if (n < min) return;
      const countInTier = Math.max(0, Math.min(n, max) - min + 1);
      perSum += oneUnit * countInTier;
      return;
    }
    if (n >= min && n <= max) {
      fixedHit = true;
      fixedAmt = oneUnit;
    }
  });
  return perSum + (fixedHit ? fixedAmt : 0);
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
  const periodInput = document.getElementById('muhasebe-period');
  if (periodInput) periodInput.lang = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de' : 'tr';
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
  if (typeof loadPayrollLedger === 'function') await loadPayrollLedger(fid);
  await renderMuhasebePayrollTable(fid, period, rules);
  if (typeof renderMuhasebeYear === 'function' && isMuhasebeAdmin()) renderMuhasebeYear(fid, rules);
}

async function testFxRateNow() {
  const fid = muhasebeFirmId();
  if (!fid) return;
  const ym = _mGetPeriod();
  const cached = window._payrollRulesCacheByFirm[fid] || defaultPayrollRules();
  const rules = {
    ...cached,
    exchange_rate: Number(document.getElementById('pr-rate')?.value || cached.exchange_rate || 1),
  };
  const rate = await _getMonthFxRate(fid, ym, Number(rules.exchange_rate || 1), rules);
  const rateInput = document.getElementById('pr-rate');
  if (rateInput) rateInput.value = String(Number(rate || 1));
  toast(`Kur güncellendi: 1 EUR = ${_mFmt(rate)} TRY`, 'ok');
  updatePayrollPreview();
}

function setMuhasebeTab(tab) {
  window._muhasebeTab = tab || 'ozet';
  const panes = ['ozet', 'gelir', 'personel', 'vergi', 'kategori', 'sabit', 'alacak', 'musteri', 'ayar'];
  panes.forEach(p => {
    const pane = document.getElementById(`muh-pane-${p}`);
    if (pane) pane.style.display = p === window._muhasebeTab ? '' : 'none';
  });
  document.querySelectorAll('.muh-tab-btn').forEach(btn => {
    btn.style.display = '';
    btn.classList.toggle('active', btn.dataset.muhTab === window._muhasebeTab);
    btn.style.background = '';
    btn.style.color = '';
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
  if (sub) {
    const line = typeof t === 'function' ? t('pay.my_sub') : 'Bordro özeti, prim ve baz maaş kademeleri';
    sub.textContent = line;
    sub.dataset.base = line;
  }
  const period = _mGetPeriod();
  const table = document.getElementById('maasim-table-wrap');
  if (table) table.innerHTML = `<div class="mb-empty-hint">${typeof t === 'function' ? t('ui.loading') : 'Yükleniyor…'}</div>`;
  try {
    const rules = await loadFirmPayrollRules(fid);
    await renderMuhasebePayrollTable(fid, period, rules, { ui: 'maasim' });
  } catch (e) {
    if (table) table.innerHTML = `<div class="mb-empty-hint" style="color:var(--red);">${_mEsc((typeof t === 'function' ? t('ui.load_failed') : 'Yüklenemedi') + ': ' + (e?.message || ''))}</div>`;
    if (typeof toast === 'function') toast((typeof t === 'function' ? t('ui.load_failed') : 'Yüklenemedi') + ': ' + (e?.message || ''), 'err');
  }
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
    if (sub) sub.textContent = 'Seçili ay randevu ve çağrı özeti';
    const period = _mGetPeriod();
    const rules = await loadFirmPayrollRules(fid);
    const liveRate = await _getMonthFxRate(fid, period, Number(rules.exchange_rate || 1), rules);
    rules.exchange_rate = liveRate;
    if (sub && Number(liveRate) > 1) {
      const base = sub.dataset.base || sub.textContent;
      sub.textContent = `${base} · 1 EUR = ${_mFmt(liveRate)} TRY`;
    }
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
  set('pr-sgk', Number(r.sgk_percent || 0));
  set('pr-office', Number(r.office_day_rate || 0));
  setChk('pr-gov', r.government_supported);
  setChk('pr-late-on', r.late_penalty_enabled);
  setChk('pr-leave-over', r.leave_overflow_penalty_enabled);
  setChk('pr-agent-customer', r.appointment_customer_select_by_agent);
  renderPayrollTierRows('bonus', bonusTiers);
  renderPayrollTierRows('salary', salaryTiers);
  renderCustomerRateTable(r);
  if (typeof renderSalaryCategoryEditor === 'function') {
    renderSalaryCategoryEditor(_mEffectiveCategories(r));
  }
  onFxProviderChange();
  updatePayrollPreview();
}

function onFxProviderChange() {
  const p = document.getElementById('s-fx-provider')?.value || document.getElementById('pr-fx-provider')?.value || 'frankfurter';
  const isCustom = p === 'custom';
  ['s-fx-url-row', 's-fx-key-row', 'pr-fx-url-row', 'pr-fx-key-row'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isCustom ? '' : 'none';
  });
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
          <option value="per_appointment" ${(r.calc_type||'fixed')==='per_appointment'?'selected':''}>Randevu Başı</option>
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
  out.innerHTML = `Başarılı: <b>${success}</b> · Baz(Net): <b>${_mFmt(salary)} ${currency}</b> · Prim: <b>${_mFmt(bonus)} ${currency}</b> · Personel Hakedişi: <b>${_mFmt(net)} ${currency}</b> · Şirket Geliri: <b>${_mFmt(revenue)} ${currency}</b> · Şirket Vergisi: <b>${_mFmt(companyTax)} ${currency}</b><div style="margin-top:4px;font-size:11px;color:var(--text-3);">Prim tipi: Sabit = kademeye girince tek tutar. Randevu başı = her kademedeki randevu kendi tutarıyla toplanır.</div>`;
}

async function savePayrollRules() {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  if (!fid) return;
  const prevFx = window._payrollRulesCacheByFirm[fid] || defaultPayrollRules();
  const rules = {
    firm_id: fid,
    currency: document.getElementById('pr-currency')?.value || 'EUR',
    exchange_rate: Number(document.getElementById('pr-rate')?.value) || 1,
    fx_api_provider: prevFx.fx_api_provider || 'frankfurter',
    fx_api_url: prevFx.fx_api_url || '',
    fx_api_key: prevFx.fx_api_key || '',
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
    sgk_percent: Number(document.getElementById('pr-sgk')?.value) || 0,
    office_day_rate: Number(document.getElementById('pr-office')?.value) || 0,
    bonus_tiers: readPayrollTierRows('bonus'),
    salary_tiers: readPayrollTierRows('salary'),
    customer_rates: readCustomerRateRows(),
    salary_categories: (typeof readSalaryCategories === 'function' && document.getElementById('muh-cat-editor')?.dataset.count != null)
      ? readSalaryCategories().filter(c => c.name)
      : (window._payrollRulesCacheByFirm[fid]?.salary_categories || []),
    updated_at: new Date().toISOString(),
  };
  const rulesForTable = { ...rules };
  delete rulesForTable.customer_rates;
  delete rulesForTable.salary_categories;
  delete rulesForTable.sgk_percent;
  delete rulesForTable.office_day_rate;
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
        <div class="form-row"><label class="form-label">Onaylı Randevu Geliri</label><input class="form-input" id="mcr-amount-${i}" type="number" step="0.01" value="${Number(r.amount || 0)}"></div>
        <div class="form-row"><label class="form-label">Para</label><select class="form-input" id="mcr-currency-${i}"><option value="EUR" ${String(r.currency || 'EUR').toUpperCase() === 'EUR' ? 'selected' : ''}>EUR</option><option value="TRY" ${String(r.currency || '').toUpperCase() === 'TRY' ? 'selected' : ''}>TRY</option></select></div>
        <button class="btn btn-ghost btn-sm" type="button" onclick="removeCustomerRateRow(${i})">Sil</button>
      </div>
    `).join('')}
    <div style="font-size:11px;color:var(--text-3);">Müşteriye özel satır yoksa genel "Başarılı randevu gelir tutarı" kullanılır.</div>
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

function _mFxQuoteDate(ym) {
  const end = _mMonthBounds(ym).end;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return today < end ? today : end;
}

function _muhPaintFxBanner(rate, source, dateStr) {
  const n = Number(rate || 0);
  window._muhFxLive = { rate: n, source: source || '', date: dateStr || '' };
  const de = (typeof currentLang !== 'undefined' && currentLang === 'de');
  const rateEl = document.getElementById('muh-fx-rate');
  const metaEl = document.getElementById('muh-fx-meta');
  if (rateEl) rateEl.textContent = n > 0 ? `1 € = ${_mFmt(n)} ₺` : '1 € = — ₺';
  const raw = source || '';
  const src = raw === 'live' ? (de ? 'Live-Kurs' : 'canlı kur') : (raw || (de ? 'manuell' : 'manuel'));
  const tip = `${src} · ${dateStr || '—'}`;
  if (metaEl) metaEl.textContent = tip;
  const banner = document.getElementById('muh-fx-banner');
  if (banner) banner.title = tip;
  const refresh = banner?.querySelector('.muh-fx-refresh');
  if (refresh) refresh.title = de ? 'Kurs aktualisieren' : 'Kuru yenile';
}

function _mViewCur(rules) {
  const base = String(rules?.currency || 'EUR').toUpperCase();
  if (window._muhPayrollUi === 'maasim' || !window._muhViewTry) return base;
  return base === 'TRY' ? 'EUR' : 'TRY';
}

function _mViewAmt(amount, rules) {
  const base = String(rules?.currency || 'EUR').toUpperCase();
  const to = _mViewCur(rules);
  if (to === base) return Number(amount || 0);
  return _mConvertCurrency(amount, base, to, Number(rules?.exchange_rate || 1));
}

function _mCurFace(cur) {
  return String(cur || 'EUR').toUpperCase() === 'TRY' ? 'TL' : String(cur || 'EUR').toUpperCase();
}

function _mPaintCurToggle() {
  const on = !!window._muhViewTry;
  document.querySelectorAll('#muh-cur-toggle .muh-cur-btn').forEach((btn) => {
    btn.classList.toggle('is-on', (btn.dataset.cur === 'TRY') === on);
  });
}

function setMuhViewCurrency(cur) {
  window._muhViewTry = String(cur || '').toUpperCase() === 'TRY';
  _mPaintCurToggle();
  const fid = typeof muhasebeFirmId === 'function' ? muhasebeFirmId() : '';
  const rules = window._payrollRulesCacheByFirm?.[fid];
  const rows = window._muhasebeRows || [];
  if (!rules) return;
  renderMuhasebeSummaryCards(rows, rules);
  renderMuhasebeRowsTable(rows, rules);
}

function _mAltAmount(amount, cur, rate) {
  const c = String(cur || 'EUR').toUpperCase();
  const r = Number(rate || 0);
  if (!(r > 1)) return '';
  if (c === 'EUR') return `<div class="muh-fx-alt">${_mFmt(_mConvertCurrency(amount, 'EUR', 'TRY', r))} TRY</div>`;
  if (c === 'TRY') return `<div class="muh-fx-alt">${_mFmt(_mConvertCurrency(amount, 'TRY', 'EUR', r))} EUR</div>`;
  return '';
}

async function _fetchEurTryRateAt(dateStr) {
  const got = await _fetchFxRateByRules(dateStr, defaultPayrollRules());
  return got?.rate || null;
}

async function _readFxJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const json = await res.json();
  const n = Number(json?.rates?.TRY || json?.data?.TRY || json?.TRY || 0);
  return n > 0 ? n : null;
}

async function _fetchFxRateByRules(dateStr, rules) {
  const provider = rules?.fx_api_provider || 'frankfurter';
  const openEr = async () => {
    const n = await _readFxJson('https://open.er-api.com/v6/latest/EUR');
    return n ? { rate: n, source: 'live' } : null;
  };
  const host = async () => {
    const n = await _readFxJson(`https://api.exchangerate.host/${dateStr}?base=EUR&symbols=TRY`);
    return n ? { rate: n, source: 'exchangerate.host' } : null;
  };
  const custom = async () => {
    const tpl = rules?.fx_api_url || '';
    if (!tpl) return null;
    let url = tpl.replaceAll('{date}', dateStr).replaceAll('{base}', 'EUR').replaceAll('{quote}', 'TRY');
    const key = rules?.fx_api_key || '';
    if (key) url += `${url.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(key)}`;
    const n = await _readFxJson(url);
    return n ? { rate: n, source: 'özel API' } : null;
  };
  const chain = [];
  if (provider === 'custom') chain.push(custom);
  if (provider === 'exchangerate_host') chain.push(host);
  chain.push(openEr);
  if (provider !== 'exchangerate_host') chain.push(host);
  for (const step of chain) {
    try {
      const got = await step();
      if (got?.rate) return got;
    } catch (_) {}
  }
  return null;
}

async function _getMonthFxRate(fid, ym, fallbackRate, rules) {
  const quoteDate = _mFxQuoteDate(ym);
  let cached = null;
  try {
    const ex = await sb(`payroll_fx_rates?firm_id=eq.${fid}&rate_date=eq.${quoteDate}&base_currency=eq.EUR&quote_currency=eq.TRY&select=rate,source&limit=1`);
    if (ex?.length && Number(ex[0].rate) > 0) cached = ex[0];
  } catch (_) {}
  const fetched = await _fetchFxRateByRules(quoteDate, rules || {});
  const rate = Number(fetched?.rate || cached?.rate || fallbackRate || 1) || 1;
  const source = fetched?.source || cached?.source || 'manuel';
  _muhPaintFxBanner(rate, source, quoteDate);
  if (fetched?.rate) {
    const body = {
      firm_id: fid,
      period_ym: ym,
      rate_date: quoteDate,
      base_currency: 'EUR',
      quote_currency: 'TRY',
      rate: fetched.rate,
      source: fetched.source,
    };
    try {
      const patched = await sb(`payroll_fx_rates?firm_id=eq.${fid}&rate_date=eq.${quoteDate}&base_currency=eq.EUR&quote_currency=eq.TRY`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: JSON.stringify({ rate: fetched.rate, source: fetched.source, period_ym: ym }),
      });
      if (!patched?.length) {
        await sb('payroll_fx_rates', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
      }
    } catch (_) {
      try {
        await sb('payroll_fx_rates', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(body) });
      } catch (__) {}
    }
  }
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
    const rows = await sb(`users?firm_id=eq.${fid}&is_active=eq.true&select=id,name,role,payroll_category_id,payroll_category_months&order=name.asc`);
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
    (typeof mbFetchAll === 'function' ? mbFetchAll : sb)(`appointments?firm_id=eq.${fid}&termin_tarih=gte.${monthBounds.start}T00:00:00&termin_tarih=lte.${monthBounds.end}T23:59:59&select=id,agent_id,durum,customer_id`).catch(() => []),
    sb(`leave_requests?firm_id=eq.${fid}&status=eq.approved&date_from=lte.${monthBounds.end}&date_to=gte.${monthBounds.start}&select=user_id,days_used,kind,date_from,date_to`).catch(() => []),
    sb(`user_leave_entitlements?year=eq.${year}&select=user_id,extra_days_granted`).catch(() => []),
    sb(`late_arrivals?firm_id=eq.${fid}&day_date=gte.${monthBounds.start}&day_date=lte.${monthBounds.end}&select=user_id,minutes_late`).catch(() => []),
    sb(`firms?id=eq.${fid}&select=settings`).catch(() => []),
  ]);
  const hr = mergeHr?.(firmRows?.[0]?.settings?.hr) || defaultHrSettings();
  return { ovr: ovr || [], adj: adj || [], monthly: monthly || [], appts: appts || [], leaveReqs: leaveReqs || [], ents: ents || [], lates: lates || [], hr };
}

function _mLeaveDaysInMonth(row, monthStart, monthEnd) {
  const from = String(row?.date_from || '').slice(0, 10);
  const to = String(row?.date_to || '').slice(0, 10);
  const used = Number(row?.days_used || 0);
  if (!(used > 0)) return 0;
  if (!from || !to) return used;
  if (from >= monthStart && to <= monthEnd) return used;
  const all = typeof leaveEachDay === 'function' ? leaveEachDay(from, to) : [];
  if (!all.length) return used;
  const inside = all.filter((day) => day >= monthStart && day <= monthEnd).length;
  return used * (inside / all.length);
}

function _mBuildStatsByUser(appts, leaveReqs, ents, lates, monthStart, monthEnd) {
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
    st.leaveDays += _mLeaveDaysInMonth(r, monthStart, monthEnd);
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
  let users = await _mFetchUsers(fid);
  const selfRole = String(currentUser?.role || '');
  const selfView = window._muhPayrollUi === 'maasim' || ['agent', 'qc', 'field_agent'].includes(selfRole);
  if (selfView && currentUser?.id && !users.some((u) => u.id === currentUser.id)) {
    users = [...users, { id: currentUser.id, name: currentUser.name || '—', role: selfRole }];
  }
  const b = _mMonthBounds(ym);
  const monthRate = await _getMonthFxRate(fid, ym, Number(rules.exchange_rate || 1), rules);
  const data = await _mFetchMonthlyData(fid, ym, b.year, b);
  const statsByUser = _mBuildStatsByUser(data.appts, data.leaveReqs, data.ents, data.lates, b.start, b.end);
  const overMap = {};
  const monthlyMap = {};
  (data.ovr || []).forEach(o => { overMap[o.user_id] = o; });
  (data.monthly || []).forEach(m => { monthlyMap[m.user_id] = m; });

  const rows = users.map(u => {
    const st = statsByUser[u.id] || { success: 0, fail: 0, pending: 0, qc: 0, cancel: 0, leaveDays: 0, lateCount: 0, entitlementExtra: 0 };
    const ov = overMap[u.id] || {};
    const cat = _mCatForMonth(u, ym, _mEffectiveCategories(rules));
    const noPay = !!cat?.no_salary;
    const noTermin = noPay || !!ov.no_termin || !!cat?.fixed_staff;
    const mode = ov.base_salary_mode || rules.base_salary_mode;
    const rawBaseSalary = noPay
      ? 0
      : ((ov.base_salary_amount != null && ov.base_salary_amount !== '')
        ? Number(ov.base_salary_amount)
        : Number(cat ? cat.base_salary_amount : (rules.base_salary_amount || 0)));
    const taxRate = Number(ov.tax_rate_percent ?? rules.tax_rate_percent ?? 0);
    const tiers = _mPickTiers(ov.bonus_tiers, cat?.bonus_tiers, rules.bonus_tiers, cat);
    const salaryTiers = _mPickTiers(ov.salary_tiers, cat?.salary_tiers, rules.salary_tiers, cat);
    const success = st.success;
    const payCount = noTermin ? 0 : success;
    const baseSalary = _mSalaryForSuccess(rawBaseSalary, payCount, salaryTiers, rules.currency, rules.currency, monthRate);
    const bonus = _mBonusFor(payCount, tiers, rules.currency, rules.currency, monthRate);
    const officeDays = Number(monthlyMap[u.id]?.office_days || 0);
    const officeRate = (cat && Number(cat.office_day_rate) > 0) ? Number(cat.office_day_rate) : Number(rules.office_day_rate || 0);
    const officePay = noPay ? 0 : Math.max(0, officeDays) * officeRate;
    const sgkPct = (cat && Number(cat.sgk_percent) > 0) ? Number(cat.sgk_percent) : Number(rules.sgk_percent || 0);
    const sgkCost = noPay ? 0 : (baseSalary + bonus + officePay) * sgkPct / 100;
    const latePenalty = noPay ? 0 : (rules.late_penalty_enabled ? st.lateCount * Number(rules.late_penalty_amount || 0) : 0);
    const annualAllowance = (Number(data.hr?.annual_leave_days_default || 14)) + Number(st.entitlementExtra || 0);
    const leaveOverflow = Math.max(0, Number(st.leaveDays || 0) - annualAllowance);
    const leavePenalty = noPay ? 0 : (rules.leave_overflow_penalty_enabled ? leaveOverflow * Number(rules.leave_overflow_penalty_amount || 0) : 0);
    const adj = _mCollectAdjustments(data.adj, u.id, { ...rules, exchange_rate: monthRate });
    const preTax = baseSalary + bonus + officePay + adj.add - adj.ded - latePenalty - leavePenalty;
    const taxAmount = 0;
    const netPayable = preTax;
    const paidAmount = Number(monthlyMap[u.id]?.paid_amount || 0);
    const remaining = netPayable - paidAmount;
    return {
      user_id: u.id,
      user_name: u.name || u.id.slice(0, 8),
      role: u.role,
      categoryId: cat?.id || '',
      categoryName: cat?.name || '',
      officeDays,
      officePay,
      sgkCost,
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
  if (showCompanyFinance && typeof renderMuhBooks === 'function') renderMuhBooks(filtered, rules);
  else {
    const incomeBox = document.getElementById('muh-income-expense-summary');
    const taxBox = document.getElementById('muh-tax-summary');
    if (incomeBox) incomeBox.innerHTML = '';
    if (taxBox) taxBox.innerHTML = '';
  }
  const payrollRowForSelf = rows.find(r => r.user_id === currentUser.id) || null;
  const uidSelf = currentUser.id;
  const ovSelf = overMap[uidSelf] || {};
  const selfUser = users.find(u => u.id === uidSelf) || { id: uidSelf };
  const selfCat = _mCatForMonth(selfUser, ym, _mEffectiveCategories(rules));
  const bonusTiersSelf = _mPickTiers(ovSelf.bonus_tiers, selfCat?.bonus_tiers, rules.bonus_tiers, selfCat);
  const salaryTiersSelf = _mPickTiers(ovSelf.salary_tiers, selfCat?.salary_tiers, rules.salary_tiers, selfCat);
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
    a.base += r.baseSalary; a.bonus += r.bonus; a.office += Number(r.officePay || 0); a.sgk += Number(r.sgkCost || 0);
    a.pen += r.latePenalty + r.leavePenalty + r.manualDeduct;
    a.tax += r.taxAmount; a.pay += r.netPayable; a.paid += r.paidAmount; a.rem += r.remaining;
    a.success += r.success || 0;
    a.rev += Number(r.totalRevenue || 0);
    return a;
  }, { base: 0, bonus: 0, office: 0, sgk: 0, pen: 0, tax: 0, pay: 0, paid: 0, rem: 0, success: 0, rev: 0 });
  const totalRevenue = sum.rev;
  const pack = window._muhPayrollUi !== 'maasim' && typeof _mBooksPack === 'function' ? _mBooksPack(rows, rules) : null;
  const taxBase = pack ? pack.taxBase : Math.max(0, totalRevenue - sum.pay);
  const companyTax = pack ? pack.tax : (rules.government_supported ? 0 : taxBase * (Number(rules.tax_rate_percent || 0) / 100));
  const netProfit = pack ? pack.profit : (totalRevenue - sum.pay - companyTax - sum.sgk);
  const cur = _mEsc(_mCurFace(_mViewCur(rules)));
  const v = (n) => _mFmt(_mViewAmt(n, rules));
  _mPaintCurToggle();
  box.innerHTML = `
    <div class="stat-card"><div class="stat-lbl">Gelir (${cur})</div><div class="stat-val">${v(totalRevenue)}</div><div class="stat-meta">${sum.success} başarılı randevu</div></div>
    <div class="stat-card"><div class="stat-lbl">Baz Maaş (${cur})</div><div class="stat-val">${v(sum.base)}</div></div>
    <div class="stat-card stat-green"><div class="stat-lbl">Prim (${cur})</div><div class="stat-val">${v(sum.bonus)}</div></div>
    <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.office'))} (${cur})</div><div class="stat-val">${v(sum.office)}</div></div>
    <div class="stat-card"><div class="stat-lbl">${_mEsc(t('muh.sgk'))} (${cur})</div><div class="stat-val">${v(sum.sgk)}</div></div>
    <div class="stat-card stat-red"><div class="stat-lbl">Toplam Kesinti (${cur})</div><div class="stat-val">${v(sum.pen)}</div></div>
    <div class="stat-card"><div class="stat-lbl">Şirket Vergisi (${cur})</div><div class="stat-val">${v(companyTax)}</div><div class="stat-meta">Matrah: ${v(taxBase)} ${cur}</div></div>
    <div class="stat-card stat-blue"><div class="stat-lbl">Hakediş (${cur})</div><div class="stat-val">${v(sum.pay)}</div></div>
    <div class="stat-card stat-purple"><div class="stat-lbl">Kalan (${cur})</div><div class="stat-val">${v(sum.rem)}</div><div class="stat-meta">Ödenen: ${v(sum.paid)} ${cur}</div></div>
    <div class="stat-card"><div class="stat-lbl">Net Kar (${cur})</div><div class="stat-val" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${v(netProfit)}</div>${pack ? `<div class="stat-meta">${_mEsc(t('muh.profit_same'))}</div>` : ''}</div>
  `;
}

function renderMuhasebeFinancePanels(rows, rules) {
  const cur = _mEsc(rules.currency || 'EUR');
  const pack = typeof _mBooksPack === 'function' ? _mBooksPack(rows, rules) : null;
  const totals = rows.reduce((a, r) => {
    a.rev += Number(r.totalRevenue || 0);
    a.pay += Number(r.netPayable || 0);
    a.paid += Number(r.paidAmount || 0);
    return a;
  }, { rev: 0, pay: 0, paid: 0 });
  const taxBase = pack ? pack.taxBase : Math.max(0, totals.rev - totals.pay);
  const tax = pack ? pack.tax : (rules.government_supported ? 0 : taxBase * (Number(rules.tax_rate_percent || 0) / 100));
  const profit = pack ? pack.profit : (totals.rev - totals.pay - tax);
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
      <div class="stat-card"><div class="stat-lbl">Vergi Sonrası Kar (${cur})</div><div class="stat-val">${_mFmt(profit)}</div></div>
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
  const cur = _mEsc(_mCurFace(_mViewCur(rules)));
  const money = (n) => _mFmt(_mViewAmt(n, rules));
  const roleOf = (role) => (typeof firmRoleLabel === 'function' ? firmRoleLabel(role) : (role || ''));
  const meta = (text) => (text ? `<span class="muh-meta"> · ${_mEsc(text)}</span>` : '');
  wrap.innerHTML = `<div class="muh-pay-note">${_mEsc(t('muh.pay_note'))} ${cur}</div><table class="muh-pay-table"><thead><tr>
    <th>Personel</th><th>${_mEsc(t('muh.cat.col'))}</th><th>Başarılı</th><th>Baz</th><th>Prim</th><th>${_mEsc(t('muh.office'))}</th><th>${_mEsc(t('muh.sgk'))}</th><th>Geç</th><th>İzin</th>
    <th>Manuel</th><th>Hakediş</th><th>Ödenen</th><th>Kalan</th>${admin ? '<th></th>' : ''}
  </tr></thead><tbody>${
    rows.map(r => {
      const manualNet = r.manualAdd - r.manualDeduct;
      const manualClass = manualNet > 0 ? 'ok' : (manualNet < 0 ? 'err' : '');
      const officeMeta = Number(r.officeDays) ? `${_mFmt(r.officeDays)} gün` : '';
      const lateMeta = Number(r.lateCount) ? `${r.lateCount} kez` : '';
      const leaveMeta = Number(r.leaveOverflow) ? `${_mFmt(r.leaveOverflow)} gün` : '';
      return `<tr>
        <td><span class="muh-pay-person"><strong>${_mEsc(r.user_name)}</strong><span class="muh-meta">${_mEsc(roleOf(r.role))}</span></span></td>
        <td>${_mEsc(r.categoryName || '—')}</td>
        <td class="num">${r.success}</td>
        <td class="num">${money(r.baseSalary)}</td>
        <td class="num">${money(r.bonus)}</td>
        <td class="num">${money(r.officePay || 0)}${meta(officeMeta)}</td>
        <td class="num">${money(r.sgkCost || 0)}</td>
        <td class="num">${money(r.latePenalty)}${meta(lateMeta)}</td>
        <td class="num">${money(r.leavePenalty)}${meta(leaveMeta)}</td>
        <td class="num">${manualClass ? `<span class="muh-badge ${manualClass}">${manualNet > 0 ? '+' : ''}${money(manualNet)}</span>` : money(0)}</td>
        <td class="num" style="font-weight:800;">${money(r.netPayable)}</td>
        <td class="num">${money(r.paidAmount)}</td>
        <td class="num" style="font-weight:800;color:${r.remaining > 0 ? 'var(--red)' : 'var(--green)'};">${money(r.remaining)}</td>
        ${admin ? `<td><div class="muh-row-acts">
          <button class="btn btn-ghost btn-sm" onclick="openPayCategoryMonths('${r.user_id}')">${_mEsc(t('muh.cat.col'))}</button>
          <button class="btn btn-ghost btn-sm" onclick="setPayrollOfficeDays('${r.user_id}')">${_mEsc(t('muh.office_days'))}</button>
          <button class="btn btn-ghost btn-sm" onclick="openPayrollOverride('${r.user_id}')">Özel</button>
          <button class="btn btn-ghost btn-sm" onclick="addPayrollAdjustment('${r.user_id}')">${_mEsc(t('muh.adj.btn'))}</button>
          <button class="btn btn-ghost btn-sm" onclick="savePayrollPayment('${r.user_id}')">Ödeme</button>
        </div></td>` : ''}
      </tr>`;
    }).join('')
  }</tbody><tfoot><tr class="muh-total">${_mPayrollTotalCells(rows, rules, admin)}</tr></tfoot></table>`;
}

function _mPayrollTotalCells(rows, rules, admin) {
  const sum = rows.reduce((a, r) => {
    a.success += Number(r.success || 0);
    a.base += Number(r.baseSalary || 0);
    a.bonus += Number(r.bonus || 0);
    a.office += Number(r.officePay || 0);
    a.sgk += Number(r.sgkCost || 0);
    a.late += Number(r.latePenalty || 0);
    a.leave += Number(r.leavePenalty || 0);
    a.manual += Number(r.manualAdd || 0) - Number(r.manualDeduct || 0);
    a.pay += Number(r.netPayable || 0);
    a.paid += Number(r.paidAmount || 0);
    a.rem += Number(r.remaining || 0);
    return a;
  }, { success: 0, base: 0, bonus: 0, office: 0, sgk: 0, late: 0, leave: 0, manual: 0, pay: 0, paid: 0, rem: 0 });
  const money = n => _mFmt(_mViewAmt(n, rules));
  return `<td>${_mEsc(t('muh.total'))}</td><td></td><td class="num">${sum.success}</td><td class="num">${money(sum.base)}</td><td class="num">${money(sum.bonus)}</td><td class="num">${money(sum.office)}</td><td class="num">${money(sum.sgk)}</td><td class="num">${money(sum.late)}</td><td class="num">${money(sum.leave)}</td><td class="num">${sum.manual > 0 ? '+' : ''}${money(sum.manual)}</td><td class="num">${money(sum.pay)}</td><td class="num">${money(sum.paid)}</td><td class="num">${money(sum.rem)}</td>${admin ? '<td></td>' : ''}`;
}

async function openPayrollOverride(uid) {
  if (!isMuhasebeAdmin()) return;
  const fid = muhasebeFirmId();
  const rows = await sb(`payroll_employee_overrides?firm_id=eq.${fid}&user_id=eq.${uid}&select=*`).catch(() => []);
  const cur = rows?.[0] || {};
  const noTermin = await mbConfirm('Bu personel randevu yapmıyor olarak işaretlensin mi?', 'Personel Tipi');
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

function addPayrollAdjustment(uid) {
  if (!isMuhasebeAdmin()) return;
  const row = (window._muhasebeRows || []).find(r => r.user_id === uid);
  document.getElementById('m-muh-adj')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-muh-adj';
  modal.className = 'modal-overlay open';
  modal.dataset.type = 'add';
  modal.innerHTML = `<div class="modal" style="max-width:420px;">
    <div class="modal-hdr">
      <div class="modal-title">${_mEsc(t('muh.adj.title'))}</div>
      <button class="modal-close" type="button" onclick="document.getElementById('m-muh-adj')?.remove()">✕</button>
    </div>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-size:13px;font-weight:700;">${_mEsc(row?.user_name || '')}</div>
      <div class="muh-adj-types">
        <button type="button" class="muh-adj-type is-on" data-adj="add" onclick="muhAdjPick('add', this)">${_mEsc(t('muh.adj.add'))}</button>
        <button type="button" class="muh-adj-type" data-adj="deduct" onclick="muhAdjPick('deduct', this)">${_mEsc(t('muh.adj.deduct'))}</button>
      </div>
      <div class="form-grid">
        <div class="form-row"><label class="form-label">${_mEsc(t('muh.adj.amount'))}</label><input class="form-input" id="muh-adj-amount" type="number" min="0" step="0.01" value="0"></div>
        <div class="form-row"><label class="form-label">${_mEsc(t('muh.cur'))}</label>
          <select class="form-input" id="muh-adj-cur"><option value="EUR">EUR</option><option value="TRY">TRY</option></select>
        </div>
      </div>
      <div class="form-row"><label class="form-label">${_mEsc(t('muh.adj.note'))}</label><input class="form-input" id="muh-adj-note"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" type="button" onclick="document.getElementById('m-muh-adj')?.remove()">${_mEsc(t('muh.adj.cancel'))}</button>
      <button class="btn btn-primary" type="button" onclick="savePayrollAdjustment('${uid}')">${_mEsc(t('muh.adj.save'))}</button>
    </div>
  </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  document.getElementById('muh-adj-amount')?.focus();
}

function muhAdjPick(type, btn) {
  const modal = document.getElementById('m-muh-adj');
  if (!modal) return;
  modal.dataset.type = type === 'deduct' ? 'deduct' : 'add';
  modal.querySelectorAll('.muh-adj-type').forEach(b => b.classList.toggle('is-on', b === btn));
}

async function savePayrollAdjustment(uid) {
  if (!isMuhasebeAdmin()) return;
  const modal = document.getElementById('m-muh-adj');
  const type = modal?.dataset.type === 'deduct' ? 'deduct' : 'add';
  const amount = Number(document.getElementById('muh-adj-amount')?.value || 0);
  if (!amount || amount <= 0) {
    toast(t('muh.ledger.need'), 'err');
    return;
  }
  const currency = (document.getElementById('muh-adj-cur')?.value || 'EUR').toUpperCase();
  const reason = document.getElementById('muh-adj-note')?.value?.trim() || null;
  const fid = muhasebeFirmId();
  try {
    await sb('payroll_adjustments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ firm_id: fid, user_id: uid, period_ym: _mGetPeriod(), adjustment_type: type, amount, currency, reason, created_by: currentUser?.id || null }),
    });
    modal?.remove();
    toast(t('muh.adj.saved'), 'ok');
    loadMuhasebePage();
  } catch (e) {
    toast(t('muh.ledger.fail') + ' ' + e.message, 'err');
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
