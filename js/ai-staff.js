// YZ personel — Callin sayfasının ikinci sekmesi. Tek kalite araması onay kutusundan çıkar.

let _aiDesk = null;
let _aiFirmId = '';

function mbAiSay(key, fallback) {
  const msg = typeof t === 'function' ? t(key) : fallback;
  return !msg || msg === key ? fallback : msg;
}

function mbAiEsc(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
}

function mbFirmAi(settings) {
  const ai = settings?.ai && typeof settings.ai === 'object' ? settings.ai : {};
  const rate = Number(ai.rate);
  return {
    spoken_name: String(ai.spoken_name || '').trim().slice(0, 80),
    lang: ai.lang === 'tr' ? 'tr' : 'de',
    voice: ai.voice === 'female' || ai.voice === 'male' ? ai.voice : '',
    rate: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 1000) / 1000 : 0,
    transfer: typeof mbNormDid === 'function' ? (mbNormDid(ai.transfer) || '') : '',
    forbid_price: ai.forbid_price !== false,
    forbid_contract: ai.forbid_contract !== false,
    forbid_other: ai.forbid_other !== false,
  };
}

function mbAiFirmReady(settings) {
  const ai = mbFirmAi(settings);
  return !!(ai.spoken_name && ai.rate > 0);
}

function mbAiRateInput(raw) {
  const text = String(raw || '').trim().replace(',', '.');
  if (!text) return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0 || n > 99) return null;
  return Math.round(n * 1000) / 1000;
}

function mbAiUuid(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || ''));
}

function mbAiCampIds(row) {
  const many = Array.isArray(row?.campaign_ids) ? row.campaign_ids : [];
  const ids = many.map((id) => String(id || '')).filter(mbAiUuid);
  if (ids.length) return [...new Set(ids)].slice(0, 24);
  return mbAiUuid(row?.campaign_id) ? [String(row.campaign_id)] : [];
}

function mbAiClock(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '';
}

function mbAiKeys(list) {
  return (Array.isArray(list) ? list : []).map((key) => String(key || '').slice(0, 40)).filter(Boolean).slice(0, 24);
}

function mbAiStaffNorm(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!id) return null;
  const retry = Number(row.retry_min);
  const parallel = Number(row.parallel);
  const campaignIds = mbAiCampIds(row);
  const when = (Array.isArray(row.call_when) ? row.call_when : []).map(String).filter((key) => ['today', 'tomorrow', 'past'].includes(key));
  return {
    id,
    name: String(row.name || '').trim().slice(0, 40),
    kind: row.kind === 'qc' ? 'qc' : 'sales',
    campaign_ids: campaignIds,
    campaign_id: campaignIds.length === 1 ? campaignIds[0] : '',
    parallel: parallel >= 1 && parallel <= 5 ? parallel : 1,
    auto: row.auto === true,
    retry_min: [15, 30, 60, 120, 240].includes(retry) ? retry : 30,
    greeting: String(row.greeting || '').trim().slice(0, 400),
    prompt: String(row.prompt || '').trim().slice(0, 2000),
    results: mbAiKeys(row.results),
    call_statuses: mbAiKeys(row.call_statuses),
    call_when: when.length ? when : ['today'],
    call_from: mbAiClock(row.call_from),
    call_until: mbAiClock(row.call_until),
  };
}

function mbAiStaffList(settings) {
  const raw = Array.isArray(settings?.ai_staff) ? settings.ai_staff : [];
  return raw.map(mbAiStaffNorm).filter(Boolean).slice(0, 8);
}

function mbAiQcStaffFor(firmId, campaignId) {
  const list = window._aiStaffByFirm?.[firmId] || [];
  const camp = String(campaignId || '');
  return list.find((row) => {
    if (row.kind !== 'qc') return false;
    const ids = mbAiCampIds(row);
    return !ids.length || ids.includes(camp);
  }) || null;
}

async function mbCacheAiStaff(firmId) {
  window._aiStaffByFirm = window._aiStaffByFirm || {};
  if (!firmId || typeof sb !== 'function') return [];
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const list = mbAiStaffList(rows?.[0]?.settings);
  window._aiStaffByFirm[firmId] = list;
  return list;
}

function callinTab(name) {
  const staff = name === 'staff';
  document.querySelectorAll('.callin-tab').forEach((btn) => {
    const on = btn.dataset.callin === (staff ? 'staff' : 'auto');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const auto = document.getElementById('callin-pane-auto');
  const pane = document.getElementById('callin-pane-staff');
  if (auto) auto.hidden = staff;
  if (pane) pane.hidden = !staff;
  if (staff) void mbLoadAiStaff();
}

function mbAiActiveFirmId() {
  if (_aiFirmId) return _aiFirmId;
  const active = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
  return active || currentUser?.firm_id || '';
}

async function mbLoadAiStaff() {
  const root = document.getElementById('ai-staff-root');
  const pane = document.getElementById('callin-pane-staff');
  if (!root || !pane || pane.hidden || typeof sb !== 'function') return;
  const gen = (_aiDesk?.gen || 0) + 1;
  _aiDesk = { gen, firms: [], camps: [], results: [], settings: {}, staff: [] };
  const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  let firms = [];
  if (superView) firms = await sb('firms?select=id,name,settings&order=name.asc').catch(() => []) || [];
  else {
    const mine = String(currentUser?.firm_id || '');
    if (mine) firms = await sb(`firms?id=eq.${mine}&select=id,name,settings`).catch(() => []) || [];
  }
  if (!_aiDesk || _aiDesk.gen !== gen) return;
  _aiDesk.firms = firms;
  const picked = firms.some((row) => String(row.id) === String(mbAiActiveFirmId())) ? mbAiActiveFirmId() : (firms[0]?.id || '');
  _aiFirmId = String(picked || '');
  await mbAiLoadFirm(gen);
}

async function mbAiLoadFirm(gen) {
  if (!_aiDesk || _aiDesk.gen !== gen) return;
  const firm = _aiDesk.firms.find((row) => String(row.id) === String(_aiFirmId));
  _aiDesk.settings = firm?.settings || {};
  _aiDesk.staff = mbAiStaffList(_aiDesk.settings);
  _aiDesk.camps = _aiFirmId && typeof sb === 'function'
    ? await sb(`campaigns?firm_id=eq.${_aiFirmId}&select=id,name,settings&order=name.asc`).catch(() => []) || []
    : [];
  if (!_aiDesk || _aiDesk.gen !== gen) return;
  _aiDesk.results = typeof loadFirmAppointmentResults === 'function'
    ? await loadFirmAppointmentResults(_aiFirmId)
    : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  if (!_aiDesk || _aiDesk.gen !== gen) return;
  window._aiStaffByFirm = window._aiStaffByFirm || {};
  if (_aiFirmId) window._aiStaffByFirm[_aiFirmId] = _aiDesk.staff.map((row) => ({ ...row }));
  mbPaintAiStaff();
}

function mbAiReadDesk() {
  if (!_aiDesk) return;
  const transferRaw = String(document.getElementById('ai-transfer')?.value || '').trim();
  const prev = mbFirmAi(_aiDesk.settings);
  _aiDesk.settings = {
    ..._aiDesk.settings,
    ai: {
      ...(_aiDesk.settings.ai || {}),
      spoken_name: String(document.getElementById('ai-spoken')?.value || '').trim().slice(0, 80),
      lang: document.getElementById('ai-lang')?.value === 'tr' ? 'tr' : 'de',
      voice: ['female', 'male'].includes(document.getElementById('ai-voice')?.value) ? document.getElementById('ai-voice').value : '',
      rate: prev.rate,
      draft: true,
      transfer: transferRaw ? (typeof mbNormDid === 'function' ? mbNormDid(transferRaw) : '') : '',
      transfer_raw: transferRaw,
      forbid_price: !!document.getElementById('ai-price')?.checked,
      forbid_contract: !!document.getElementById('ai-contract')?.checked,
      forbid_other: !!document.getElementById('ai-other')?.checked,
    },
  };
  _aiDesk.staff = _aiDesk.staff.map((row) => {
    const checked = (attr) => [...document.querySelectorAll(`[${attr}="${row.id}"]`)].filter((el) => el.checked).map((el) => el.value);
    return mbAiStaffNorm({
      ...row,
      name: document.getElementById(`ai-name-${row.id}`)?.value,
      campaign_ids: checked('data-ai-camp'),
      parallel: document.getElementById(`ai-parallel-${row.id}`)?.value,
      auto: !!document.getElementById(`ai-auto-${row.id}`)?.checked,
      retry_min: document.getElementById(`ai-retry-${row.id}`)?.value,
      greeting: document.getElementById(`ai-greet-${row.id}`)?.value,
      prompt: document.getElementById(`ai-prompt-${row.id}`)?.value,
      results: checked('data-ai-result'),
      call_statuses: checked('data-ai-call'),
      call_when: checked('data-ai-when'),
      call_from: document.getElementById(`ai-from-${row.id}`)?.value,
      call_until: document.getElementById(`ai-until-${row.id}`)?.value,
    });
  }).filter(Boolean);
}

function mbAiAddStaff(kind) {
  mbAiReadDesk();
  if (!_aiDesk || _aiDesk.staff.length >= 8) return;
  const results = kind === 'qc'
    ? (_aiDesk.results || []).map((row) => row.key).filter((key) => key && key !== 'qc_bekleniyor')
    : (typeof DEFAULT_OUTCOMES !== 'undefined' ? DEFAULT_OUTCOMES.map((row) => row.key) : []);
  _aiDesk.staff.push(mbAiStaffNorm({
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: kind === 'qc' ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu'),
    results,
    call_statuses: kind === 'qc' ? ['qc_bekleniyor'] : [],
    call_when: ['today'],
    retry_min: 30,
    parallel: 1,
  }));
  mbPaintAiStaff();
}

function mbAiDropStaff(id) {
  mbAiReadDesk();
  if (!_aiDesk) return;
  _aiDesk.staff = _aiDesk.staff.filter((row) => row.id !== id);
  mbPaintAiStaff();
}

function mbAiFirmPicked(id) {
  mbAiReadDesk();
  _aiFirmId = String(id || '');
  const gen = _aiDesk?.gen || 1;
  void mbAiLoadFirm(gen);
}

function mbAiStaffCampChanged() {
  mbAiReadDesk();
  mbPaintAiStaff();
}

function mbPaintAiStaff() {
  const root = document.getElementById('ai-staff-root');
  if (!root || !_aiDesk) return;
  const ai = _aiDesk.settings?.ai?.draft ? _aiDesk.settings.ai : mbFirmAi(_aiDesk.settings);
  const firms = _aiDesk.firms || [];
  const firmPick = firms.length > 1
    ? `<div class="form-row"><label class="form-label" for="ai-firm">${mbAiEsc(mbAiSay('ai.staff.firm', 'Firma'))}</label><select class="form-input" id="ai-firm" onchange="mbAiFirmPicked(this.value)">${firms.map((row) => `<option value="${mbAiEsc(row.id)}"${String(row.id) === String(_aiFirmId) ? ' selected' : ''}>${mbAiEsc(row.name || '')}</option>`).join('')}</select></div>`
    : '';
  const opt = (value, current, label) => `<option value="${mbAiEsc(value)}"${String(value) === String(current) ? ' selected' : ''}>${mbAiEsc(label)}</option>`;
  const ready = mbAiFirmReady({ ai: { spoken_name: ai.spoken_name, rate: ai.rate } });
  const voice = `<div class="ai-staff-card">
    <div class="form-label">${mbAiEsc(mbAiSay('line.ai', 'Agent'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${mbAiEsc(mbAiSay('line.ai.hint', ''))}</div>
    <div style="font-size:12px;font-weight:700;">${mbAiEsc(ready ? mbAiSay('line.ai.ready', '') : mbAiSay('line.ai.idle', ''))}</div>
    ${firmPick}
    <div class="form-row"><label class="form-label" for="ai-spoken">${mbAiEsc(mbAiSay('line.ai.name', 'Söylenecek şirket adı'))}</label><input class="form-input" id="ai-spoken" maxlength="80" value="${mbAiEsc(ai.spoken_name || '')}" placeholder="${mbAiEsc(mbAiSay('line.ai.name_ph', ''))}"></div>
    <div class="form-row"><label class="form-label" for="ai-lang">${mbAiEsc(mbAiSay('line.ai.lang', 'Dil'))}</label><select class="form-input" id="ai-lang">${opt('de', ai.lang, mbAiSay('line.ai.lang.de', 'Almanca'))}${opt('tr', ai.lang, mbAiSay('line.ai.lang.tr', 'Türkçe'))}</select></div>
    <div class="form-row"><label class="form-label" for="ai-voice">${mbAiEsc(mbAiSay('line.ai.voice', 'Ses'))}</label><select class="form-input" id="ai-voice">${opt('', ai.voice || '', mbAiSay('line.ai.voice.default', 'Varsayılan'))}${opt('female', ai.voice || '', mbAiSay('line.ai.voice.female', 'Kadın'))}${opt('male', ai.voice || '', mbAiSay('line.ai.voice.male', 'Erkek'))}</select></div>
    ${ai.rate > 0 ? '' : `<div style="font-size:12px;font-weight:700;">${mbAiEsc(mbAiSay('ai.staff.price_wait', 'Arama için süper admin dakika fiyatını hat bağlantısından yazar.'))}</div>`}
    <div class="form-row"><label class="form-label" for="ai-transfer">${mbAiEsc(mbAiSay('line.ai.transfer', 'İnsana aktar'))}</label><input class="form-input" id="ai-transfer" maxlength="20" placeholder="+49301234567" value="${mbAiEsc(ai.transfer || ai.transfer_raw || '')}"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" id="ai-price" ${ai.forbid_price !== false ? 'checked' : ''}> ${mbAiEsc(mbAiSay('line.ai.forbid_price', 'Fiyat söylemesin'))}</label>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" id="ai-contract" ${ai.forbid_contract !== false ? 'checked' : ''}> ${mbAiEsc(mbAiSay('line.ai.forbid_contract', 'Sözleşme konuşmasın'))}</label>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" id="ai-other" ${ai.forbid_other !== false ? 'checked' : ''}> ${mbAiEsc(mbAiSay('line.ai.forbid_other', 'Başka şirket adı vermesin'))}</label>
  </div>`;
  const cards = _aiDesk.staff.map((row) => mbAiStaffCard(row)).join('');
  const empty = _aiDesk.staff.length ? '' : `<div style="font-size:12px;color:var(--text-3);">${mbAiEsc(mbAiSay('ai.staff.empty', ''))}</div>`;
  root.innerHTML = `<div class="ai-staff-grid">
    <div style="font-size:12px;color:var(--text-3);line-height:1.45;">${mbAiEsc(mbAiSay('ai.staff.intro', ''))}</div>
    ${voice}
    ${empty}
    ${cards}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('sales')">${mbAiEsc(mbAiSay('ai.staff.add_sales', 'Randevu personeli'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('qc')">${mbAiEsc(mbAiSay('ai.staff.add_qc', 'Kalite personeli'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="mbSaveAiStaff()">${mbAiEsc(mbAiSay('ai.staff.save', 'Kaydet'))}</button>
    </div>
  </div>`;
}

function mbAiTokenName(key) {
  const map = { name: 'ad', phone: 'telefon', phone2: 'telefon2', address: 'adres', city: 'sehir', plz: 'plz' };
  const raw = map[key] || String(key || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return /^[a-z][a-z0-9_]*$/.test(raw) ? `{${raw}}` : '';
}

function mbAiTokensFor(row) {
  const picked = new Set(mbAiCampIds(row));
  const camps = (_aiDesk?.camps || []).filter((camp) => !picked.size || picked.has(camp.id));
  const tokens = new Map();
  const add = (token, label) => { if (token && label && !tokens.has(token)) tokens.set(token, label); };
  add('{tarih}', mbAiSay('ai.staff.tok.date', 'Tarih'));
  add('{saat}', mbAiSay('ai.staff.tok.time', 'Saat'));
  add('{ad}', mbAiSay('ai.staff.tok.name', 'Ad'));
  const use = camps.length ? camps : [{ field_config: {}, settings: {} }];
  use.forEach((camp) => {
    const fc = typeof mbParseFieldConfig === 'function' ? mbParseFieldConfig(camp) : {};
    if (typeof mbMergeCampFields === 'function') {
      mbMergeCampFields(fc).forEach((field) => {
        if (!field.show || field.key === 'attempt' || field.key === 'notes') return;
        add(mbAiTokenName(field.key), field.label || field.defaultLabel || field.key);
      });
    }
    if (typeof dialerTerminFields === 'function') {
      try {
        dialerTerminFields(camp).forEach((field) => {
          if (!field?.key) return;
          add(mbAiTokenName(field.key), field.l || field.key);
        });
      } catch (e) {}
    }
  });
  return [...tokens.entries()].slice(0, 24);
}

let _aiTokenFocus = '';

function mbAiTokenFocus(id) {
  _aiTokenFocus = String(id || '');
}

function mbAiInsertToken(staffId, token) {
  const prefer = _aiTokenFocus.endsWith(`-${staffId}`) ? _aiTokenFocus : `ai-prompt-${staffId}`;
  const el = document.getElementById(prefer) || document.getElementById(`ai-prompt-${staffId}`);
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  el.value = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
  const at = start + token.length;
  el.focus();
  if (typeof el.setSelectionRange === 'function') el.setSelectionRange(at, at);
  mbAiTokenFocus(el.id);
}

function mbAiStaffCard(row) {
  const camps = _aiDesk?.camps || [];
  const pickedCamps = new Set(mbAiCampIds(row));
  const campBoxes = camps.map((camp) => `<label class="ai-check"><input type="checkbox" data-ai-camp="${mbAiEsc(row.id)}" value="${mbAiEsc(camp.id)}"${pickedCamps.has(camp.id) ? ' checked' : ''} onchange="mbAiStaffCampChanged()"> ${mbAiEsc(camp.name || '')}</label>`).join('');
  const kindLabel = row.kind === 'qc' ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu');
  const choices = row.kind === 'qc' ? mbAiQcChoices() : mbAiSalesChoicesMany(pickedCamps);
  const picked = new Set(row.results || []);
  const checks = choices.map((item) => `<label class="ai-check"><input type="checkbox" data-ai-result="${mbAiEsc(row.id)}" value="${mbAiEsc(item.key)}"${picked.has(item.key) ? ' checked' : ''}> ${mbAiEsc(item.label)}</label>`).join('');
  const tokens = mbAiTokensFor(row).map(([token, label]) => `<button type="button" class="ai-token" onclick="mbAiInsertToken('${mbAiEsc(row.id)}','${mbAiEsc(token)}')">${mbAiEsc(label)} ${mbAiEsc(token)}</button>`).join('');
  const salesBits = row.kind === 'sales'
    ? `<div class="form-row"><label class="form-label" for="ai-parallel-${mbAiEsc(row.id)}">${mbAiEsc(mbAiSay('ai.staff.parallel', 'Aynı anda kaç kişi'))}</label><select class="form-input" id="ai-parallel-${mbAiEsc(row.id)}">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${row.parallel === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`
    : mbAiQcAuto(row, choices);
  return `<div class="ai-staff-card">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><b>${mbAiEsc(kindLabel)}</b><button type="button" class="btn btn-ghost btn-sm" onclick="mbAiDropStaff('${mbAiEsc(row.id)}')">${mbAiEsc(mbAiSay('ai.staff.remove', 'Kaldır'))}</button></div>
    <div class="form-row"><label class="form-label" for="ai-name-${mbAiEsc(row.id)}">${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}</label><input class="form-input" id="ai-name-${mbAiEsc(row.id)}" maxlength="40" value="${mbAiEsc(row.name)}"></div>
    <div class="form-label">${mbAiEsc(mbAiSay('ai.staff.camps', 'Kampanyalar'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${mbAiEsc(mbAiSay('ai.staff.camps_hint', 'Birden fazlasını işaretleyebilirsiniz. Hiçbiri işaretli değilse firmanın kampanyaları.'))}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 14px;">${campBoxes || mbAiEsc(mbAiSay('ai.staff.camp.all', 'Firmanın kampanyaları'))}</div>
    ${salesBits}
    <div class="form-label">${mbAiEsc(mbAiSay('ai.staff.tokens', 'Kişi kartından ekle'))}</div>
    <div class="ai-token-row">${tokens}</div>
    <div class="form-row"><label class="form-label" for="ai-greet-${mbAiEsc(row.id)}">${mbAiEsc(mbAiSay('ai.staff.greeting', 'İlk cümle'))}</label><textarea class="form-input" id="ai-greet-${mbAiEsc(row.id)}" rows="2" maxlength="400" placeholder="${mbAiEsc(mbAiSay('ai.staff.greeting_ph', ''))}" onfocus="mbAiTokenFocus(this.id)">${mbAiEsc(row.greeting || '')}</textarea></div>
    <div class="form-row"><label class="form-label" for="ai-prompt-${mbAiEsc(row.id)}">${mbAiEsc(mbAiSay('ai.staff.prompt', 'Talimat'))}</label><textarea class="form-input" id="ai-prompt-${mbAiEsc(row.id)}" rows="6" maxlength="2000" placeholder="${mbAiEsc(mbAiSay('ai.staff.prompt_ph', ''))}" onfocus="mbAiTokenFocus(this.id)">${mbAiEsc(row.prompt)}</textarea></div>
    <div class="form-label">${mbAiEsc(mbAiSay('ai.staff.results', 'Yazabileceği sonuçlar'))}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 14px;">${checks}</div>
  </div>`;
}

function mbAiQcAuto(row, choices) {
  const statuses = new Set(row.call_statuses || []);
  const when = new Set(row.call_when || []);
  const statusBoxes = choices.map((item) => `<label class="ai-check"><input type="checkbox" data-ai-call="${mbAiEsc(row.id)}" value="${mbAiEsc(item.key)}"${statuses.has(item.key) ? ' checked' : ''}> ${mbAiEsc(item.label)}</label>`).join('');
  const day = (key, label) => `<label class="ai-check"><input type="checkbox" data-ai-when="${mbAiEsc(row.id)}" value="${key}"${when.has(key) ? ' checked' : ''}> ${mbAiEsc(label)}</label>`;
  return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" id="ai-auto-${mbAiEsc(row.id)}" ${row.auto ? 'checked' : ''}> ${mbAiEsc(mbAiSay('ai.staff.auto', 'Otomatik arasın'))}</label>
    <div style="font-size:11px;color:var(--text-3);">${mbAiEsc(mbAiSay('ai.staff.auto_hint', 'Otomatik arama bu sonucu ve bu günü bekleyen randevuları seçer.'))}</div>
    <div class="form-label">${mbAiEsc(mbAiSay('ai.staff.call_status', 'Hangi sonuçtakileri arasın'))}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 14px;">${statusBoxes}</div>
    <div class="form-label">${mbAiEsc(mbAiSay('ai.staff.call_when', 'Hangi randevuları arasın'))}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 14px;">${day('today', mbAiSay('ai.staff.when.today', 'Bugün'))}${day('tomorrow', mbAiSay('ai.staff.when.tomorrow', 'Yarın'))}${day('past', mbAiSay('ai.staff.when.past', 'Geçmişte kalan'))}</div>
    <div class="form-row"><label class="form-label">${mbAiEsc(mbAiSay('ai.staff.call_hours', 'Hangi saatler arasında'))}</label><div style="display:flex;gap:8px;"><input class="form-input" type="time" id="ai-from-${mbAiEsc(row.id)}" value="${mbAiEsc(row.call_from || '')}"><input class="form-input" type="time" id="ai-until-${mbAiEsc(row.id)}" value="${mbAiEsc(row.call_until || '')}"></div></div>
    <div class="form-row"><label class="form-label" for="ai-retry-${mbAiEsc(row.id)}">${mbAiEsc(mbAiSay('ai.staff.retry', 'Ulaşamazsa kaç dakikada bir'))}</label><select class="form-input" id="ai-retry-${mbAiEsc(row.id)}">${[15, 30, 60, 120, 240].map((n) => `<option value="${n}"${row.retry_min === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
}

function mbAiSalesChoicesMany(ids) {
  const camps = (_aiDesk?.camps || []).filter((camp) => !ids.size || ids.has(camp.id));
  const source = camps.length ? camps : [null];
  const seen = new Map();
  source.forEach((camp) => {
    mbAiSalesChoices(camp?.id || '').forEach((item) => {
      if (item.key && !seen.has(item.key)) seen.set(item.key, item.label);
    });
  });
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

function mbAiSalesChoices(campaignId) {
  const camp = (_aiDesk?.camps || []).find((row) => row.id === campaignId);
  if (typeof mbCampOutcomeRows === 'function') {
    return mbCampOutcomeRows(camp || { settings: {} }).filter((row) => row.enabled).map((row) => ({ key: row.key, label: row.label }));
  }
  return [];
}

function mbAiQcChoices() {
  const list = _aiDesk?.results || [];
  return list.map((row) => ({
    key: row.key,
    label: typeof mbResultLabel === 'function' ? mbResultLabel(row.key, row.label) : (row.label || row.key),
  })).filter((row) => row.key);
}

async function mbSaveAiStaff() {
  if (!_aiDesk || !_aiFirmId || typeof sb !== 'function') return;
  if (typeof mbCanSetHoldMusic === 'function' && !mbCanSetHoldMusic(_aiFirmId)) return;
  mbAiReadDesk();
  const draft = _aiDesk.settings.ai || {};
  const transferRaw = String(draft.transfer_raw || draft.transfer || '').trim();
  const transfer = transferRaw && typeof mbNormDid === 'function' ? mbNormDid(transferRaw) : '';
  if (transferRaw && !transfer) {
    if (typeof toast === 'function') toast(mbAiSay('line.ai.transfer_bad', 'Aktarma + ile başlamalı, örnek +49301234567'), 'err');
    return;
  }
  const ai = {
    spoken_name: String(draft.spoken_name || '').trim().slice(0, 80),
    lang: draft.lang === 'tr' ? 'tr' : 'de',
    voice: draft.voice === 'female' || draft.voice === 'male' ? draft.voice : '',
    rate: Number(draft.rate) > 0 ? Number(draft.rate) : 0,
    transfer,
    forbid_price: draft.forbid_price !== false,
    forbid_contract: draft.forbid_contract !== false,
    forbid_other: draft.forbid_other !== false,
  };
  try {
    const rows = await sb(`firms?id=eq.${_aiFirmId}&select=settings`);
    const settings = { ...(rows?.[0]?.settings || {}) };
    const prevAi = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
    settings.ai = {
      ...prevAi,
      ...ai,
      rate: Number(prevAi.rate) > 0 ? Number(prevAi.rate) : 0,
    };
    delete settings.ai.transfer_raw;
    delete settings.ai.rate_bad;
    delete settings.ai.draft;
    settings.ai_staff = _aiDesk.staff.map((row) => mbAiStaffNorm(row)).filter(Boolean);
    await sb(`firms?id=eq.${_aiFirmId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    const hit = _aiDesk.firms.find((row) => String(row.id) === String(_aiFirmId));
    if (hit) hit.settings = settings;
    _aiDesk.settings = settings;
    _aiDesk.staff = mbAiStaffList(settings);
    window._aiStaffByFirm = window._aiStaffByFirm || {};
    window._aiStaffByFirm[_aiFirmId] = _aiDesk.staff.map((row) => ({ ...row }));
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.saved', 'YZ personel kaydedildi'), 'ok');
    mbPaintAiStaff();
  } catch (e) {
    if (typeof toast === 'function') toast((typeof t === 'function' ? t('dial.log_err') : '') + (e?.message || ''), 'err');
  }
}

function qcCallinButton(row) {
  const staff = mbAiQcStaffFor(row?.firm_id, row?.campaign_id);
  if (!staff || !row?.id) return '';
  const name = typeof ariaName === 'function' ? ariaName() : 'Callin';
  const label = mbAiSay('qc.callin', '{name} arasın').replace('{name}', name);
  return `<button type="button" class="btn btn-ghost btn-sm" onclick="qcAskCallin('${mbAiEsc(row.id)}')">${mbAiEsc(label)}</button>`;
}

function qcAskCallin(apptId) {
  const row = (typeof qcList !== 'undefined' ? qcList : []).find((item) => item.id === apptId);
  const staff = row ? mbAiQcStaffFor(row.firm_id, row.campaign_id) : null;
  if (!row || !staff) {
    if (typeof toast === 'function') toast(mbAiSay('qc.callin.none', 'Bu firma için kalite personeli yok'), 'warn');
    return;
  }
  document.getElementById('ai-callin-pop')?.remove();
  const name = typeof ariaName === 'function' ? ariaName() : 'Callin';
  const results = (staff.results || []).map((key) => {
    const label = typeof mbResultLabel === 'function' ? mbResultLabel(key, key) : key;
    return label;
  }).filter(Boolean);
  const pop = document.createElement('div');
  pop.id = 'ai-callin-pop';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card" role="dialog" aria-modal="true">
    <div style="font-weight:800;">${mbAiEsc(mbAiSay('qc.callin.ask', 'Aramadan önce bir şey söylemek ister misiniz?').replace('{name}', name))}</div>
    <div style="font-size:12px;color:var(--text-3);line-height:1.45;">${mbAiEsc(mbAiSay('qc.callin.hint', ''))}</div>
    <textarea id="ai-callin-note" class="form-input" rows="4" maxlength="800">${mbAiEsc(staff.prompt || '')}</textarea>
    ${results.length ? `<div style="font-size:11px;color:var(--text-3);">${mbAiEsc(results.join(' · '))}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="qcCloseCallin()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="qcConfirmCallin('${mbAiEsc(row.id)}','${mbAiEsc(staff.id)}',true)">${mbAiEsc(mbAiSay('qc.callin.direct', 'Direkt kalite kontrol yap'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="qcConfirmCallin('${mbAiEsc(row.id)}','${mbAiEsc(staff.id)}',false)">${mbAiEsc(mbAiSay('qc.callin.note', 'Bu notla ara'))}</button>
    </div>
  </div>`;
  pop.addEventListener('click', (event) => { if (event.target === pop) qcCloseCallin(); });
  document.body.appendChild(pop);
}

function qcCloseCallin() {
  document.getElementById('ai-callin-pop')?.remove();
}

async function mbTelnyxAi(action, payload) {
  if (typeof SB_URL !== 'string' || !SB_URL) return { ok: false, error: 'fail' };
  const headers = typeof mbAuthHeaders === 'function' ? mbAuthHeaders() : { 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${SB_URL}/functions/v1/telnyx-ai`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...(payload || {}) }),
    });
    return await res.json().catch(() => ({ ok: false, error: 'fail' }));
  } catch (e) {
    return { ok: false, error: 'fail' };
  }
}

async function qcConfirmCallin(apptId, staffId, direct) {
  const pop = document.getElementById('ai-callin-pop');
  pop?.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
  const note = direct ? '' : String(document.getElementById('ai-callin-note')?.value || '').trim().slice(0, 800);
  const res = await mbTelnyxAi('place', { appointment_id: apptId, staff_id: staffId, note });
  if (!res?.ok) {
    pop?.querySelectorAll('button').forEach((btn) => { btn.disabled = false; });
    const key = { gate: 'qc.callin.gate', results: 'qc.callin.gate', phone: 'qc.callin.phone', busy: 'qc.callin.busy' }[res?.error] || 'qc.callin.fail';
    if (typeof toast === 'function') toast(mbAiSay(key, 'Arama çıkmadı.'), 'err');
    return;
  }
  qcCloseCallin();
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.started', 'Arama çıktı. Karşı taraf açınca konuşma başlar.'), 'ok');
}
