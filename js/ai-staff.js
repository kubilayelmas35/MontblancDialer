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
    engine: ai.engine === 'super' ? 'super' : 'std',
    llm: MB_AI_LLMS.some((row) => row.id === ai.llm) ? ai.llm : MB_AI_LLMS[0].id,
  };
}

const MB_AI_LLMS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tag: 'rec' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', tag: 'eco' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tag: 'smart' },
  { id: 'gpt-4o', label: 'GPT-4o', tag: 'strong' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', tag: 'best' },
];

function mbAiLlmTag(tag) {
  return {
    rec: mbAiSay('ai.llm.rec', 'dengeli ve hızlı, önerilen · yaklaşık 0,003 $/dk'),
    eco: mbAiSay('ai.llm.eco', 'en ekonomik, basit konuşmalar için · yaklaşık 0,001 $/dk'),
    smart: mbAiSay('ai.llm.smart', 'daha iyi anlar, orta fiyat · yaklaşık 0,01 $/dk'),
    strong: mbAiSay('ai.llm.strong', 'güçlü, pahalı · yaklaşık 0,02 $/dk'),
    best: mbAiSay('ai.llm.best', 'en yüksek kalite, en pahalı · yaklaşık 0,03 $/dk'),
  }[tag] || '';
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
      engine: document.getElementById('ai-engine')?.value === 'super' ? 'super' : 'std',
      llm: MB_AI_LLMS.some((row) => row.id === document.getElementById('ai-llm')?.value) ? document.getElementById('ai-llm').value : MB_AI_LLMS[0].id,
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

function mbAiPill(attr, id, value, label, on, onchange) {
  return `<label class="ai-pill"><input type="checkbox" ${attr}="${mbAiEsc(id)}" value="${mbAiEsc(value)}"${on ? ' checked' : ''}${onchange ? ` onchange="${onchange}"` : ''}><span>${mbAiEsc(label)}</span></label>`;
}

function mbAiSwitch(id, on, label, onchange) {
  return `<label class="ai-switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}${onchange ? ` onchange="${onchange}"` : ''}><i></i><span>${mbAiEsc(label)}</span></label>`;
}

function mbAiField(forId, label, control, wide) {
  return `<div class="ai-field${wide ? ' is-wide' : ''}"><label for="${forId}">${mbAiEsc(label)}</label>${control}</div>`;
}

function mbPaintAiStaff() {
  const root = document.getElementById('ai-staff-root');
  if (!root || !_aiDesk) return;
  const ai = _aiDesk.settings?.ai?.draft ? _aiDesk.settings.ai : mbFirmAi(_aiDesk.settings);
  const firms = _aiDesk.firms || [];
  const firmPick = firms.length > 1
    ? mbAiField('ai-firm', mbAiSay('ai.staff.firm', 'Firma'), `<select class="form-input" id="ai-firm" onchange="mbAiFirmPicked(this.value)">${firms.map((row) => `<option value="${mbAiEsc(row.id)}"${String(row.id) === String(_aiFirmId) ? ' selected' : ''}>${mbAiEsc(row.name || '')}</option>`).join('')}</select>`, true)
    : '';
  const opt = (value, current, label) => `<option value="${mbAiEsc(value)}"${String(value) === String(current) ? ' selected' : ''}>${mbAiEsc(label)}</option>`;
  const ready = mbAiFirmReady({ ai: { spoken_name: ai.spoken_name, rate: ai.rate } });
  const state = ready
    ? `<span class="ai-state is-ok"><i class="ph ph-check-circle"></i> ${mbAiEsc(mbAiSay('ai.staff.state.ok', 'Hazır'))}</span>`
    : `<span class="ai-state is-wait"><i class="ph ph-warning-circle"></i> ${mbAiEsc(mbAiSay('ai.staff.state.wait', 'Eksik var'))}</span>`;
  const missing = ready ? '' : (!ai.spoken_name ? mbAiSay('line.ai.idle', '') : mbAiSay('ai.staff.price_wait', 'Arama için süper admin dakika fiyatını hat bağlantısından yazar.'));
  const voice = `<section class="ai-card">
    <header class="ai-card-hd"><div class="ai-card-title"><i class="ph ph-robot"></i> ${mbAiEsc(mbAiSay('line.ai', 'Agent'))}</div>${state}</header>
    <p class="ai-note">${mbAiEsc(mbAiSay('line.ai.hint', ''))}</p>
    ${missing ? `<p class="ai-note ai-note-warn">${mbAiEsc(missing)}</p>` : ''}
    <div class="ai-grid">
      ${firmPick}
      ${mbAiField('ai-spoken', mbAiSay('line.ai.name', 'Söylenecek şirket adı'), `<input class="form-input" id="ai-spoken" maxlength="80" value="${mbAiEsc(ai.spoken_name || '')}" placeholder="${mbAiEsc(mbAiSay('line.ai.name_ph', ''))}">`)}
      ${mbAiField('ai-transfer', mbAiSay('line.ai.transfer', 'İnsana aktar'), `<input class="form-input" id="ai-transfer" maxlength="20" placeholder="+49301234567" value="${mbAiEsc(ai.transfer || ai.transfer_raw || '')}">`)}
      ${mbAiField('ai-lang', mbAiSay('line.ai.lang', 'Dil'), `<select class="form-input" id="ai-lang">${opt('de', ai.lang, mbAiSay('line.ai.lang.de', 'Almanca'))}${opt('tr', ai.lang, mbAiSay('line.ai.lang.tr', 'Türkçe'))}</select>`)}
      ${mbAiField('ai-voice', mbAiSay('line.ai.voice', 'Ses'), `<select class="form-input" id="ai-voice">${opt('', ai.voice || '', mbAiSay('line.ai.voice.default', 'Varsayılan'))}${opt('female', ai.voice || '', mbAiSay('line.ai.voice.female', 'Kadın'))}${opt('male', ai.voice || '', mbAiSay('line.ai.voice.male', 'Erkek'))}</select>`)}
      ${mbAiField('ai-engine', mbAiSay('ai.engine', 'Motor'), `<select class="form-input" id="ai-engine" onchange="mbAiEngineChanged()">${opt('std', ai.engine || 'std', mbAiSay('ai.engine.std', 'Standart'))}${opt('super', ai.engine || 'std', mbAiSay('ai.engine.super', 'Süper'))}</select><div class="ai-note" id="ai-engine-hint"></div>`, true)}
      <div id="ai-llm-wrap" style="grid-column:1/-1;display:${ai.engine === 'super' ? 'block' : 'none'};">
        ${mbAiField('ai-llm', mbAiSay('ai.llm', 'Yapay zeka modeli'), `<select class="form-input" id="ai-llm" onchange="mbAiEngineChanged()">${MB_AI_LLMS.map((row) => opt(row.id, ai.llm || MB_AI_LLMS[0].id, row.label)).join('')}</select><div class="ai-note" id="ai-llm-hint"></div>`, true)}
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiElevenSetup(this)"><i class="ph ph-plugs-connected"></i> ${mbAiEsc(mbAiSay('ai.eleven.test', 'ElevenLabs bağlantısını dene'))}</button>
      </div>
    </div>
    <div class="ai-switches">
      ${mbAiSwitch('ai-price', ai.forbid_price !== false, mbAiSay('line.ai.forbid_price', 'Fiyat söylemesin'))}
      ${mbAiSwitch('ai-contract', ai.forbid_contract !== false, mbAiSay('line.ai.forbid_contract', 'Sözleşme konuşmasın'))}
      ${mbAiSwitch('ai-other', ai.forbid_other !== false, mbAiSay('line.ai.forbid_other', 'Başka şirket adı vermesin'))}
    </div>
  </section>`;
  const cards = _aiDesk.staff.map((row) => mbAiStaffCard(row)).join('');
  const empty = _aiDesk.staff.length ? '' : `<p class="ai-note">${mbAiEsc(mbAiSay('ai.staff.empty', ''))}</p>`;
  root.innerHTML = `<div class="ai-staff-grid">
    <p class="ai-note">${mbAiEsc(mbAiSay('ai.staff.intro', ''))}</p>
    ${voice}
    ${empty}
    ${cards}
    <div class="ai-bar">
      <div class="ai-bar-add">
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('sales')"><i class="ph ph-plus"></i> ${mbAiEsc(mbAiSay('ai.staff.add_sales', 'Randevu personeli'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('qc')"><i class="ph ph-plus"></i> ${mbAiEsc(mbAiSay('ai.staff.add_qc', 'Kalite personeli'))}</button>
      </div>
      <button type="button" class="btn btn-primary" onclick="mbSaveAiStaff()"><i class="ph ph-floppy-disk"></i> ${mbAiEsc(mbAiSay('ai.staff.save', 'Kaydet'))}</button>
    </div>
  </div>`;
  mbAiEngineChanged();
}

function mbAiEngineChanged() {
  const sup = document.getElementById('ai-engine')?.value === 'super';
  const wrap = document.getElementById('ai-llm-wrap');
  if (wrap) wrap.style.display = sup ? 'block' : 'none';
  const hint = document.getElementById('ai-engine-hint');
  if (hint) {
    hint.textContent = sup
      ? mbAiSay('ai.engine.super.desc', 'Süper: ElevenLabs Agents. Daha doğal ses, daha akıllı konuşma, model seçilebilir. Dakika maliyeti daha yüksek. Telnyx yalnız hat olarak kullanılır. ElevenLabs anahtarı gerekir.')
      : mbAiSay('ai.engine.std.desc', 'Standart: Telnyx yapay zekası. Ek kurulum yok, dakika maliyeti düşük, ses kalitesi orta.');
  }
  const llm = MB_AI_LLMS.find((row) => row.id === document.getElementById('ai-llm')?.value) || MB_AI_LLMS[0];
  const llmHint = document.getElementById('ai-llm-hint');
  if (llmHint) llmHint.textContent = mbAiLlmTag(llm.tag);
}

async function mbAiElevenSetup(btn) {
  if (!_aiFirmId) return;
  if (btn) btn.disabled = true;
  const res = await mbTelnyxAi('eleven_setup', { firm_id: _aiFirmId });
  if (btn) btn.disabled = false;
  if (res?.ok) {
    if (typeof toast === 'function') toast(mbAiSay('ai.eleven.ok', 'ElevenLabs hazır.') + (res.phone ? '' : ' ' + mbAiSay('ai.eleven.nophone', '(Hat numarası yok, arama için gerekli.)')), 'ok');
    return;
  }
  const why = String(res?.detail || res?.error || '').slice(0, 260);
  const text = res?.error === 'nokey_el'
    ? mbAiSay('ai.eleven.nokey', 'ElevenLabs API anahtarı yok. Hat bağlantısında anahtarı kaydedin.')
    : mbAiSay('ai.eleven.fail', 'ElevenLabs kurulamadı.') + (why ? ` (${why})` : '');
  if (typeof toast === 'function') toast(text, 'err');
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
  const id = mbAiEsc(row.id);
  const camps = _aiDesk?.camps || [];
  const pickedCamps = new Set(mbAiCampIds(row));
  const campPills = camps.map((camp) => mbAiPill('data-ai-camp', row.id, camp.id, camp.name || '', pickedCamps.has(camp.id), 'mbAiStaffCampChanged()')).join('');
  const qc = row.kind === 'qc';
  const kindLabel = qc ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu');
  const choices = qc ? mbAiQcChoices() : mbAiSalesChoicesMany(pickedCamps);
  const picked = new Set(row.results || []);
  const resultPills = choices.map((item) => mbAiPill('data-ai-result', row.id, item.key, item.label, picked.has(item.key))).join('');
  const tokens = mbAiTokensFor(row).map(([token, label]) => `<button type="button" class="ai-token" title="${mbAiEsc(token)}" onclick="mbAiInsertToken('${id}','${mbAiEsc(token)}')"><b>${mbAiEsc(label)}</b><code>${mbAiEsc(token)}</code></button>`).join('');
  const tail = qc
    ? mbAiQcAuto(row, choices)
    : `<div class="ai-sec"><div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.parallel', 'Aynı anda kaç kişi'))}</div><select class="form-input ai-narrow" id="ai-parallel-${id}">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${row.parallel === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
  return `<section class="ai-card">
    <header class="ai-card-hd">
      <span class="ai-badge ${qc ? 'is-qc' : 'is-sales'}"><i class="ph ${qc ? 'ph-seal-check' : 'ph-calendar-check'}"></i> ${mbAiEsc(kindLabel)}</span>
      <input class="ai-name" id="ai-name-${id}" maxlength="40" value="${mbAiEsc(row.name)}" placeholder="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}">
      <button type="button" class="ai-del" title="${mbAiEsc(mbAiSay('ai.staff.remove', 'Kaldır'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.remove', 'Kaldır'))}" onclick="mbAiDropStaff('${id}')"><i class="ph ph-trash"></i></button>
    </header>
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.camps', 'Kampanyalar'))}</div>
      <div class="ai-pills">${campPills || `<span class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.camp.all', 'Firmanın kampanyaları'))}</span>`}</div>
      <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.camps_hint', ''))}</div>
    </div>
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.sec.talk', 'Konuşma'))}</div>
      <div class="ai-tokens-lab">${mbAiEsc(mbAiSay('ai.staff.tokens', 'Kişi kartından ekle'))}</div>
      <div class="ai-token-row">${tokens}</div>
      ${mbAiField(`ai-greet-${row.id}`, mbAiSay('ai.staff.greeting', 'İlk cümle'), `<textarea class="form-input" id="ai-greet-${id}" rows="2" maxlength="400" placeholder="${mbAiEsc(mbAiSay('ai.staff.greeting_ph', ''))}" onfocus="mbAiTokenFocus(this.id)">${mbAiEsc(row.greeting || '')}</textarea><div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.greeting_hint', ''))}</div>`, true)}
      ${mbAiField(`ai-prompt-${row.id}`, mbAiSay('ai.staff.prompt', 'Talimat'), `<textarea class="form-input" id="ai-prompt-${id}" rows="7" maxlength="2000" placeholder="${mbAiEsc(mbAiSay('ai.staff.prompt_ph', ''))}" onfocus="mbAiTokenFocus(this.id)">${mbAiEsc(row.prompt)}</textarea><div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.prompt_hint', ''))}</div>`, true)}
    </div>
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.results', 'Yazabileceği sonuçlar'))}</div>
      <div class="ai-pills">${resultPills}</div>
    </div>
    ${tail}
  </section>`;
}

function mbAiQcAuto(row, choices) {
  const id = mbAiEsc(row.id);
  const statuses = new Set(row.call_statuses || []);
  const when = new Set(row.call_when || []);
  const statusPills = choices.map((item) => mbAiPill('data-ai-call', row.id, item.key, item.label, statuses.has(item.key))).join('');
  const day = (key, label) => mbAiPill('data-ai-when', row.id, key, label, when.has(key));
  const retry = [15, 30, 60, 120, 240].map((n) => `<option value="${n}"${row.retry_min === n ? ' selected' : ''}>${n}</option>`).join('');
  return `<div class="ai-sec">
    <div class="ai-auto${row.auto ? '' : ' is-off'}">
      ${mbAiSwitch(`ai-auto-${id}`, row.auto, mbAiSay('ai.staff.auto', 'Otomatik arasın'), "this.closest('.ai-auto').classList.toggle('is-off',!this.checked)")}
      <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.auto_hint', ''))}</div>
      <div class="ai-auto-body">
        <div class="ai-field"><label>${mbAiEsc(mbAiSay('ai.staff.call_status', 'Hangi sonuçtakileri arasın'))}</label><div class="ai-pills">${statusPills}</div></div>
        <div class="ai-field"><label>${mbAiEsc(mbAiSay('ai.staff.call_when', 'Hangi randevuları arasın'))}</label><div class="ai-pills">${day('today', mbAiSay('ai.staff.when.today', 'Bugün'))}${day('tomorrow', mbAiSay('ai.staff.when.tomorrow', 'Yarın'))}${day('past', mbAiSay('ai.staff.when.past', 'Geçmişte kalan'))}</div></div>
        <div class="ai-grid">
          <div class="ai-field"><label for="ai-from-${id}">${mbAiEsc(mbAiSay('ai.staff.call_hours', 'Hangi saatler arasında'))}</label><div class="ai-hours"><input class="form-input" type="time" id="ai-from-${id}" value="${mbAiEsc(row.call_from || '')}"><span>–</span><input class="form-input" type="time" id="ai-until-${id}" value="${mbAiEsc(row.call_until || '')}"></div></div>
          <div class="ai-field"><label for="ai-retry-${id}">${mbAiEsc(mbAiSay('ai.staff.retry', 'Ulaşamazsa kaç dakikada bir'))}</label><select class="form-input" id="ai-retry-${id}">${retry}</select></div>
        </div>
      </div>
    </div>
  </div>`;
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
    engine: draft.engine === 'super' ? 'super' : 'std',
    llm: MB_AI_LLMS.some((row) => row.id === draft.llm) ? draft.llm : MB_AI_LLMS[0].id,
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
    <textarea id="ai-callin-note" class="form-input" rows="4" maxlength="800"></textarea>
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
    const key = { gate: 'qc.callin.gate', results: 'qc.callin.gate', phone: 'qc.callin.phone', busy: 'qc.callin.busy', nokey_el: 'qc.callin.nokey_el' }[res?.error] || 'qc.callin.fail';
    const why = String(res?.detail || '').slice(0, 220);
    if (typeof toast === 'function') toast(mbAiSay(key, 'Arama çıkmadı.') + (why ? ` (${why})` : ''), 'err');
    return;
  }
  qcCloseCallin();
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.started', 'Arama çıktı. Karşı taraf açınca konuşma başlar.'), 'ok');
  if (res?.engine === 'super') mbAiWatchCall(apptId);
}

// Süper motorda bitiş bildirimi gelmez; arama bitene kadar sunucudan durum sorulur ve süre faturalanır.
async function mbAiWatchCall(apptId) {
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const res = await mbTelnyxAi('sync', { appointment_id: apptId });
    if (!res?.ok || !res.done) continue;
    if (typeof toast === 'function') {
      toast(res.secs > 0
        ? mbAiSay('qc.callin.done', 'Arama bitti.')
        : mbAiSay('qc.callin.noanswer', 'Arama açılmadı.'), res.secs > 0 ? 'ok' : 'warn');
    }
    if (typeof loadQcData === 'function') loadQcData();
    return;
  }
}
