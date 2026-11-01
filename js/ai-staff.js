// YZ personel — Callin sayfasının ikinci sekmesi. Tek kalite araması onay kutusundan çıkar.

let _aiDesk = null;
let _aiFirmId = '';
const _aiOpen = new Set();

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
    work: String(ai.work || '').trim().slice(0, 800),
    lang: ai.lang === 'tr' ? 'tr' : 'de',
    voice: ai.voice === 'female' || ai.voice === 'male' ? ai.voice : '',
    rate: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 1000) / 1000 : 0,
    transfer: typeof mbNormDid === 'function' ? (mbNormDid(ai.transfer) || '') : '',
    forbid_price: ai.forbid_price !== false,
    forbid_contract: ai.forbid_contract !== false,
    forbid_other: ai.forbid_other !== false,
    engine: ai.engine === 'super' ? 'super' : 'std',
    llm: mbAiLlmId(ai.llm) || MB_AI_LLMS[0].id,
    eagerness: ai.eagerness === 'patient' || ai.eagerness === 'eager' ? ai.eagerness : 'normal',
    silence_sec: [30, 60, 120, 300].includes(Number(ai.silence_sec)) ? Number(ai.silence_sec) : 60,
    max_min: [5, 7, 10].includes(Number(ai.max_min)) ? Number(ai.max_min) : 7,
    voice_style: ai.voice_style === 'calm' || ai.voice_style === 'lively' ? ai.voice_style : 'natural',
    expressive: ai.expressive !== false,
  };
}

const MB_AI_LLMS = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tag: 'rec' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', tag: 'eco' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tag: 'smart' },
  { id: 'gpt-5.4', label: 'GPT-5.4', tag: 'strong' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', tag: 'best' },
];
const MB_AI_LLM_ALIAS = {
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gpt-4o-mini': 'gpt-5.4-mini',
  'claude-haiku-4-5': 'claude-haiku-5-5',
  'gpt-4o': 'gpt-5.4',
  'claude-sonnet-4-5': 'claude-sonnet-5',
};

function mbAiLlmId(value) {
  const id = MB_AI_LLM_ALIAS[String(value || '')] || String(value || '');
  return MB_AI_LLMS.some((row) => row.id === id) ? id : '';
}

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

function mbAiDay(raw) {
  const text = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
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
    must_do: String(row.must_do || '').trim().slice(0, 600),
    must_not: String(row.must_not || '').trim().slice(0, 600),
    engine: row.engine === 'super' ? 'super' : (row.engine === 'std' ? 'std' : ''),
    llm: mbAiLlmId(row.llm),
    voice_id: String(row.voice_id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40),
    voice_name: String(row.voice_name || '').trim().slice(0, 60),
    results: mbAiKeys(row.results),
    call_statuses: mbAiKeys(row.call_statuses),
    call_when: when.length ? when : ['today'],
    call_on: mbAiDay(row.call_on),
    call_from: mbAiClock(row.call_from),
    call_until: mbAiClock(row.call_until),
    move_time: row.move_time !== false,
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

// Personelde motor seçilmediyse firmanın eski genel seçimi geçerli olur; sunucu da aynısını yapar.
function mbAiResolveEngine(list, settings) {
  const fallback = mbFirmAi(settings || {});
  return (list || []).map((row) => ({ ...row, engine: row.engine || fallback.engine, llm: row.llm || fallback.llm }));
}

function mbAiQcStaffAll(firmId, campaignId) {
  const list = window._aiStaffByFirm?.[firmId] || [];
  const camp = String(campaignId || '');
  return list.filter((row) => {
    if (row.kind !== 'qc') return false;
    const ids = mbAiCampIds(row);
    return !ids.length || ids.includes(camp);
  });
}

async function mbCacheAiStaff(firmId) {
  window._aiStaffByFirm = window._aiStaffByFirm || {};
  if (!firmId || typeof sb !== 'function') return [];
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const list = mbAiStaffList(rows?.[0]?.settings);
  window._aiStaffByFirm[firmId] = mbAiResolveEngine(list, rows?.[0]?.settings);
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
  if (_aiFirmId) window._aiStaffByFirm[_aiFirmId] = mbAiResolveEngine(_aiDesk.staff, _aiDesk.settings);
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
      work: String(document.getElementById('ai-work')?.value || '').trim().slice(0, 800),
      lang: document.getElementById('ai-lang')?.value === 'tr' ? 'tr' : 'de',
      voice: ['female', 'male'].includes(document.getElementById('ai-voice')?.value) ? document.getElementById('ai-voice').value : '',
      rate: prev.rate,
      draft: true,
      transfer: transferRaw ? (typeof mbNormDid === 'function' ? mbNormDid(transferRaw) : '') : '',
      transfer_raw: transferRaw,
      forbid_price: !!document.getElementById('ai-price')?.checked,
      forbid_contract: !!document.getElementById('ai-contract')?.checked,
      forbid_other: !!document.getElementById('ai-other')?.checked,
      eagerness: document.getElementById('ai-eager')?.value || prev.eagerness,
      silence_sec: document.getElementById('ai-silence')?.value || prev.silence_sec,
      max_min: document.getElementById('ai-maxmin')?.value || prev.max_min,
      voice_style: document.getElementById('ai-style')?.value || prev.voice_style,
      expressive: document.getElementById('ai-express') ? !!document.getElementById('ai-express').checked : prev.expressive !== false,
    },
  };
  _aiDesk.staff = _aiDesk.staff.map((row) => {
    const checked = (attr) => [...document.querySelectorAll(`[${attr}="${row.id}"]`)].filter((el) => el.checked).map((el) => el.value);
    const moveEl = document.getElementById(`ai-move-${row.id}`);
    const campIds = checked('data-ai-camp').filter((id) => id !== '*');
    return mbAiStaffNorm({
      ...row,
      name: document.getElementById(`ai-name-${row.id}`)?.value,
      campaign_ids: campIds,
      campaign_id: campIds.length === 1 ? campIds[0] : '',
      parallel: document.getElementById(`ai-parallel-${row.id}`)?.value,
      auto: !!document.getElementById(`ai-auto-${row.id}`)?.checked,
      retry_min: document.getElementById(`ai-retry-${row.id}`)?.value,
      greeting: mbAiRichValue(document.getElementById(`ai-greet-${row.id}`)),
      prompt: mbAiRichValue(document.getElementById(`ai-prompt-${row.id}`)),
      must_do: document.getElementById(`ai-must-${row.id}`)?.value,
      must_not: document.getElementById(`ai-mustnot-${row.id}`)?.value,
      engine: document.getElementById(`ai-engine-${row.id}`)?.value ?? row.engine,
      llm: document.getElementById(`ai-llm-${row.id}`)?.value ?? row.llm,
      voice_id: document.getElementById(`ai-evoice-${row.id}`)?.value ?? row.voice_id,
      voice_name: document.getElementById(`ai-evname-${row.id}`)?.value ?? row.voice_name,
      results: checked('data-ai-result'),
      call_statuses: checked('data-ai-call'),
      call_when: checked('data-ai-when'),
      call_on: document.getElementById(`ai-ondate-${row.id}`)?.value,
      call_from: document.getElementById(`ai-from-${row.id}`)?.value,
      call_until: document.getElementById(`ai-until-${row.id}`)?.value,
      move_time: moveEl ? !!moveEl.checked : row.move_time !== false,
    });
  }).filter(Boolean);
}

function mbAiAddStaff(kind) {
  mbAiReadDesk();
  if (!_aiDesk || _aiDesk.staff.length >= 8) return;
  const results = kind === 'qc'
    ? (_aiDesk.results || []).map((row) => row.key).filter((key) => key && key !== 'qc_bekleniyor')
    : (typeof DEFAULT_OUTCOMES !== 'undefined' ? DEFAULT_OUTCOMES.map((row) => row.key) : []);
  const added = mbAiStaffNorm({
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: kind === 'qc' ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu'),
    results,
    call_statuses: kind === 'qc' ? ['qc_bekleniyor'] : [],
    call_when: ['today'],
    retry_min: 30,
    parallel: 1,
  });
  if (added) _aiOpen.add(added.id);
  _aiDesk.staff.push(added);
  mbPaintAiStaff();
}

function mbAiDropStaff(id) {
  mbAiReadDesk();
  if (!_aiDesk) return;
  _aiDesk.staff = _aiDesk.staff.filter((row) => row.id !== id);
  _aiOpen.delete(id);
  mbPaintAiStaff();
}

function mbAiFold(id, open) {
  if (open) _aiOpen.add(String(id || ''));
  else _aiOpen.delete(String(id || ''));
}

function mbAiCampPick(el) {
  const box = el?.closest?.('.ai-camp-pick');
  if (!box) return;
  const all = box.querySelector('[data-ai-camp][value="*"]');
  const ones = [...box.querySelectorAll('[data-ai-camp]')].filter((node) => node.value !== '*');
  if (el.value === '*') {
    if (el.checked) ones.forEach((node) => { node.checked = false; });
    else if (all) all.checked = true;
  } else if (el.checked) {
    if (all) all.checked = false;
  } else if (!ones.some((node) => node.checked) && all) {
    all.checked = true;
  }
  mbAiStaffCampChanged();
}

function mbAiFirmPicked(id) {
  mbAiReadDesk();
  _aiFirmId = String(id || '');
  const gen = _aiDesk?.gen || 1;
  void mbAiLoadFirm(gen);
}

function mbAiStaffCampChanged() {
  mbAiReadDesk();
  setTimeout(() => { if (_aiDesk) mbPaintAiStaff(); }, 0);
}

function mbAiCopyStaff(id) {
  mbAiReadDesk();
  if (!_aiDesk) return;
  if (_aiDesk.staff.length >= 8) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_full', 'En fazla 8 personel.'), 'err');
    return;
  }
  const src = _aiDesk.staff.find((row) => row.id === id);
  if (!src) return;
  const suffix = mbAiSay('ai.staff.copy_suffix', 'kopya');
  const copy = mbAiStaffNorm({
    ...src,
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `${src.name || ''} ${suffix}`.trim().slice(0, 40),
  });
  if (!copy) return;
  const at = _aiDesk.staff.findIndex((row) => row.id === id);
  _aiDesk.staff.splice(at + 1, 0, copy);
  _aiOpen.add(copy.id);
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
      ${mbAiField('ai-work', mbAiSay('line.ai.work', 'Yaptığımız iş'), `<textarea class="form-input" id="ai-work" rows="5" maxlength="800" placeholder="${mbAiEsc(mbAiSay('line.ai.work_ph', ''))}">${mbAiEsc(ai.work || '')}</textarea><div class="ai-hint">${mbAiEsc(mbAiSay('line.ai.work_hint', ''))}</div>`, true)}
      ${mbAiField('ai-transfer', mbAiSay('line.ai.transfer', 'İnsana aktar'), `<input class="form-input" id="ai-transfer" maxlength="20" placeholder="+49301234567" value="${mbAiEsc(ai.transfer || ai.transfer_raw || '')}">`)}
      ${mbAiField('ai-lang', mbAiSay('line.ai.lang', 'Dil'), `<select class="form-input" id="ai-lang">${opt('de', ai.lang, mbAiSay('line.ai.lang.de', 'Almanca'))}${opt('tr', ai.lang, mbAiSay('line.ai.lang.tr', 'Türkçe'))}</select>`)}
      ${mbAiField('ai-voice', mbAiSay('line.ai.voice', 'Ses'), `<select class="form-input" id="ai-voice">${opt('', ai.voice || '', mbAiSay('line.ai.voice.default', 'Varsayılan'))}${opt('female', ai.voice || '', mbAiSay('line.ai.voice.female', 'Kadın'))}${opt('male', ai.voice || '', mbAiSay('line.ai.voice.male', 'Erkek'))}</select>`)}
      ${mbAiField('ai-eager', mbAiSay('ai.talk.eager', 'Ne kadar çabuk cevap versin'), `<select class="form-input" id="ai-eager">${opt('patient', ai.eagerness || 'normal', mbAiSay('ai.talk.patient', 'Sabırlı, bekler'))}${opt('normal', ai.eagerness || 'normal', mbAiSay('ai.talk.normal', 'Normal'))}${opt('eager', ai.eagerness || 'normal', mbAiSay('ai.talk.eager_fast', 'Hemen cevaplar'))}</select>`)}
      ${mbAiField('ai-silence', mbAiSay('ai.talk.silence', 'Sessiz kalırsa kapatsın'), `<select class="form-input" id="ai-silence">${opt(30, Number(ai.silence_sec) || 60, mbAiSay('ai.talk.silence.30', '30 saniye'))}${opt(60, Number(ai.silence_sec) || 60, mbAiSay('ai.talk.silence.60', '1 dakika'))}${opt(120, Number(ai.silence_sec) || 60, mbAiSay('ai.talk.silence.120', '2 dakika'))}${opt(300, Number(ai.silence_sec) || 60, mbAiSay('ai.talk.silence.300', '5 dakika'))}</select>`)}
      ${mbAiField('ai-maxmin', mbAiSay('ai.talk.max', 'En uzun arama'), `<select class="form-input" id="ai-maxmin">${opt(5, Number(ai.max_min) || 7, mbAiSay('ai.talk.max.5', '5 dakika'))}${opt(7, Number(ai.max_min) || 7, mbAiSay('ai.talk.max.7', '7 dakika'))}${opt(10, Number(ai.max_min) || 7, mbAiSay('ai.talk.max.10', '10 dakika'))}</select>`)}
      ${mbAiField('ai-style', mbAiSay('ai.talk.style', 'Ses karakteri'), `<select class="form-input" id="ai-style">${opt('calm', ai.voice_style || 'natural', mbAiSay('ai.talk.calm', 'Sakin'))}${opt('natural', ai.voice_style || 'natural', mbAiSay('ai.talk.natural', 'Doğal'))}${opt('lively', ai.voice_style || 'natural', mbAiSay('ai.talk.lively', 'Canlı'))}</select>`)}
    </div>
    <div class="ai-switches">
      ${mbAiSwitch('ai-express', ai.expressive !== false, mbAiSay('ai.talk.express', 'İfadeli konuşsun'))}
      ${mbAiSwitch('ai-price', ai.forbid_price !== false, mbAiSay('line.ai.forbid_price', 'Fiyat söylemesin'))}
      ${mbAiSwitch('ai-contract', ai.forbid_contract !== false, mbAiSay('line.ai.forbid_contract', 'Sözleşme konuşmasın'))}
      ${mbAiSwitch('ai-other', ai.forbid_other !== false, mbAiSay('line.ai.forbid_other', 'Başka şirket adı vermesin'))}
    </div>
    <p class="ai-hint">${mbAiEsc(mbAiSay('ai.talk.hint', ''))}</p>
  </section>`;
  const cards = _aiDesk.staff.map((row) => mbAiStaffCard(row)).join('');
  const empty = _aiDesk.staff.length ? '' : `<p class="ai-note">${mbAiEsc(mbAiSay('ai.staff.empty', ''))}</p>`;
  root.innerHTML = `<div class="ai-staff-grid">
    <p class="ai-note ai-staff-span">${mbAiEsc(mbAiSay('ai.staff.intro', ''))}</p>
    <div class="ai-staff-side">${voice}</div>
    <div class="ai-staff-main">${empty}${cards}</div>
    <div class="ai-bar ai-staff-span">
      <div class="ai-bar-add">
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('sales')"><i class="ph ph-plus"></i> ${mbAiEsc(mbAiSay('ai.staff.add_sales', 'Randevu personeli'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiAddStaff('qc')"><i class="ph ph-plus"></i> ${mbAiEsc(mbAiSay('ai.staff.add_qc', 'Kalite personeli'))}</button>
      </div>
      <button type="button" class="btn btn-primary" onclick="mbSaveAiStaff()"><i class="ph ph-floppy-disk"></i> ${mbAiEsc(mbAiSay('ai.staff.save', 'Kaydet'))}</button>
    </div>
  </div>`;
  _aiDesk.staff.forEach((row) => mbAiEngineChanged(row.id));
}

function mbAiEngineChanged(sid) {
  const sup = document.getElementById('ai-engine-' + sid)?.value === 'super';
  const wrap = document.getElementById('ai-llm-wrap-' + sid);
  if (wrap) wrap.style.display = sup ? 'block' : 'none';
  const hint = document.getElementById('ai-engine-hint-' + sid);
  if (hint) {
    hint.textContent = sup
      ? mbAiSay('ai.engine.super.desc', 'Gelişmiş: ElevenLabs. Daha doğal ses, daha akıllı konuşma, model seçilebilir. Dakika maliyeti daha yüksek. Telnyx yalnız hat olarak kullanılır. ElevenLabs anahtarı gerekir.')
      : mbAiSay('ai.engine.std.desc', 'Standart: Telnyx yapay zekası. Ek kurulum yok, dakika maliyeti düşük, ses kalitesi orta.');
  }
  mbAiReadDesk();
  const fresh = (_aiDesk?.staff || []).find((row) => String(row.id) === String(sid));
  const jobs = document.getElementById(`ai-jobs-${sid}`);
  if (jobs && fresh) jobs.outerHTML = mbAiJobsBlock(fresh);
  const llm = MB_AI_LLMS.find((row) => row.id === document.getElementById('ai-llm-' + sid)?.value) || MB_AI_LLMS[0];
  const llmHint = document.getElementById('ai-llm-hint-' + sid);
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

function mbAiJobChip(raw, label, extra) {
  const rows = [
    { raw, label, job: true },
    { raw: `{${raw}}`, label, job: true, store: raw },
  ];
  (extra || []).forEach((alias) => rows.push({ raw: alias, label, job: true, store: raw }));
  return rows;
}

function mbAiSystemChips() {
  return [
    ...mbAiJobChip('takvim_bak', mbAiSay('ai.job.look', 'Boş saatlere bak'), ['takvim.bak']),
    ...mbAiJobChip('slot_id', mbAiSay('ai.job.slot', 'Seçilen saat')),
    ...mbAiJobChip('sonuc_yaz', mbAiSay('ai.job.save', 'Sonucu kaydet')),
    ...mbAiJobChip('fields_json', mbAiSay('ai.job.fix', 'Düzeltilen bilgi')),
    ...mbAiJobChip('end_call', mbAiSay('ai.job.end', 'Görüşmeyi bitir')),
    ...mbAiJobChip('skip_turn', mbAiSay('ai.job.quiet', 'Sus')),
    ...mbAiJobChip('voicemail_detection', mbAiSay('ai.job.tape', 'Telesekreter')),
    ...mbAiJobChip('insana_aktar', mbAiSay('ai.job.hand', 'İnsana aktar')),
  ];
}

function mbAiChipList(row) {
  const list = mbAiSystemChips();
  const seen = new Set(list.map((chip) => chip.raw));
  mbAiTokensFor(row || {}).forEach(([token, label]) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    list.push({ raw: token, label, job: false });
  });
  return list;
}

function mbAiChipHtml(text, chips) {
  const ordered = [...chips].sort((a, b) => b.raw.length - a.raw.length);
  const alt = ordered.map((chip) => chip.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const src = String(text || '');
  if (!alt) return mbAiEsc(src).replace(/\n/g, '<br>');
  const re = new RegExp(alt, 'g');
  let html = '';
  let last = 0;
  let match;
  while ((match = re.exec(src))) {
    html += mbAiEsc(src.slice(last, match.index)).replace(/\n/g, '<br>');
    const hit = ordered.find((chip) => chip.raw === match[0]);
    const store = hit?.store || hit?.raw || match[0];
    html += `<span class="ai-chip${hit?.job ? ' is-job' : ''}" contenteditable="false" data-token="${mbAiEsc(store)}">${mbAiEsc(hit?.label || store)}</span>`;
    last = match.index + match[0].length;
  }
  html += mbAiEsc(src.slice(last)).replace(/\n/g, '<br>');
  return html;
}

function mbAiNodeLen(node) {
  if (!node) return 0;
  if (node.nodeType === 3) return node.textContent.length;
  if (node.nodeType !== 1) return 0;
  if (node.classList.contains('ai-chip')) return String(node.dataset.token || '').length;
  if (node.tagName === 'BR') return 1;
  let total = 0;
  node.childNodes.forEach((child) => { total += mbAiNodeLen(child); });
  return total;
}

function mbAiRichValue(el) {
  if (!el) return '';
  if (el.getAttribute?.('contenteditable') !== 'true') return String(el.value || '');
  const max = Number(el.dataset.max) || 2000;
  let out = '';
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) out += child.textContent.replace(/\u00a0/g, ' ');
      else if (child.nodeType !== 1) return;
      else if (child.classList.contains('ai-chip')) out += child.dataset.token || '';
      else if (child.tagName === 'BR') out += '\n';
      else {
        if ((child.tagName === 'DIV' || child.tagName === 'P') && out && !out.endsWith('\n')) out += '\n';
        walk(child);
      }
    });
  };
  walk(el);
  return out.slice(0, max);
}

function mbAiRichCaret(el) {
  const sel = window.getSelection?.();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return null;
  const anchor = sel.anchorNode;
  const anchorOff = sel.anchorOffset;
  let count = 0;
  const walk = (parent) => {
    const kids = [...parent.childNodes];
    for (let i = 0; i < kids.length; i += 1) {
      const child = kids[i];
      if (parent === anchor && i === anchorOff) return true;
      if (child === anchor && child.nodeType === 3) {
        count += Math.min(anchorOff, child.textContent.length);
        return true;
      }
      if (child.nodeType === 3) {
        count += child.textContent.length;
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.classList.contains('ai-chip')) {
        count += String(child.dataset.token || '').length;
        if (child === anchor || child.contains(anchor)) return true;
        continue;
      }
      if (child.tagName === 'BR') {
        if (child === anchor) return true;
        count += 1;
        continue;
      }
      if (child === anchor) {
        const inner = [...child.childNodes];
        for (let j = 0; j < anchorOff && j < inner.length; j += 1) count += mbAiNodeLen(inner[j]);
        return true;
      }
      if (child.contains(anchor)) return walk(child);
      count += mbAiNodeLen(child);
    }
    if (parent === anchor) return true;
    return false;
  };
  return walk(el) ? count : null;
}

function mbAiRichCaretSet(el, offset) {
  const sel = window.getSelection?.();
  if (!sel || typeof document === 'undefined' || !document.createRange) return;
  let left = Math.max(0, offset);
  const range = document.createRange();
  const place = (node) => {
    const kids = [...node.childNodes];
    for (const child of kids) {
      if (child.nodeType === 3) {
        if (left <= child.textContent.length) {
          range.setStart(child, left);
          range.collapse(true);
          return true;
        }
        left -= child.textContent.length;
      } else if (child.nodeType === 1 && child.classList.contains('ai-chip')) {
        const len = String(child.dataset.token || '').length;
        if (left <= len) {
          range.setStartAfter(child);
          range.collapse(true);
          return true;
        }
        left -= len;
      } else if (child.tagName === 'BR') {
        if (left <= 0) {
          range.setStartAfter(child);
          range.collapse(true);
          return true;
        }
        left -= 1;
      } else if (child.nodeType === 1 && place(child)) return true;
    }
    return false;
  };
  if (!place(el)) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function mbAiChipListFor(el) {
  const row = (_aiDesk?.staff || []).find((item) => String(item.id) === String(el?.dataset?.staff || ''));
  return mbAiChipList(row);
}

let _aiRichLock = false;

function mbAiRichDirty(el, chips) {
  const raws = chips.map((chip) => chip.raw);
  let dirty = false;
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (dirty) return;
      if (child.nodeType === 3) {
        if (raws.some((raw) => child.textContent.includes(raw))) dirty = true;
      } else if (child.nodeType !== 1) return;
      else if (child.tagName === 'DIV' || child.tagName === 'P') dirty = true;
      else if (child.classList.contains('ai-chip')) {
        if (!chips.some((chip) => (chip.store || chip.raw) === child.dataset.token)) dirty = true;
      } else if (child.tagName !== 'BR') walk(child);
    });
  };
  walk(el);
  return dirty;
}

function mbAiRichRender(el, text, caret) {
  const max = Number(el.dataset.max) || 2000;
  const clipped = String(text || '').slice(0, max);
  _aiRichLock = true;
  el.innerHTML = mbAiChipHtml(clipped, mbAiChipListFor(el));
  if (caret != null) mbAiRichCaretSet(el, Math.min(caret, clipped.length));
  _aiRichLock = false;
}

function mbAiRichSync(el) {
  if (_aiRichLock || !el || el.getAttribute?.('contenteditable') !== 'true') return;
  const text = mbAiRichValue(el);
  const max = Number(el.dataset.max) || 2000;
  if (text.length <= max && !mbAiRichDirty(el, mbAiChipListFor(el))) return;
  mbAiRichRender(el, text, mbAiRichCaret(el));
}

function mbAiRichPaste(event, el) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  const plain = mbAiRichValue(el);
  const caret = mbAiRichCaret(el);
  const at = caret == null ? plain.length : caret;
  const next = `${plain.slice(0, at)}${text}${plain.slice(at)}`;
  mbAiRichRender(el, next, at + text.length);
}

function mbAiRichKey(event, el) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const plain = mbAiRichValue(el);
  const caret = mbAiRichCaret(el);
  const at = caret == null ? plain.length : caret;
  mbAiRichRender(el, `${plain.slice(0, at)}\n${plain.slice(at)}`, at + 1);
}

function mbAiRichInsert(el, chunk) {
  if (!el) return;
  const max = Number(el.dataset.max) || 2000;
  if (el.getAttribute?.('contenteditable') !== 'true') {
    const start = el.selectionStart ?? el.value.length;
    const prev = el.value.slice(0, start);
    const next = `${prev}${chunk}${el.value.slice(el.selectionEnd ?? start)}`.slice(0, max);
    el.value = next;
    const at = Math.min(start + chunk.length, next.length);
    el.focus();
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(at, at);
    return;
  }
  el.focus();
  const plain = mbAiRichValue(el);
  const caret = mbAiRichCaret(el);
  const at = caret == null ? plain.length : caret;
  const next = `${plain.slice(0, at)}${chunk}${plain.slice(at)}`.slice(0, max);
  mbAiRichRender(el, next, Math.min(at + chunk.length, next.length));
}

function mbAiRichBox(id, value, max, rows, placeholder, staffId) {
  const row = (_aiDesk?.staff || []).find((item) => String(item.id) === String(staffId));
  const html = mbAiChipHtml(String(value || '').slice(0, max), mbAiChipList(row));
  return `<div class="ai-rich form-input" id="${mbAiEsc(id)}" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-max="${max}" data-rows="${rows}" data-staff="${mbAiEsc(staffId)}" data-placeholder="${mbAiEsc(placeholder)}" onfocus="mbAiTokenFocus(this.id)" oninput="mbAiRichSync(this)" onblur="mbAiRichSync(this)" onpaste="mbAiRichPaste(event,this)" onkeydown="mbAiRichKey(event,this)">${html}</div>`;
}

function mbAiRowSuper(row) {
  const live = document.getElementById(`ai-engine-${row?.id}`)?.value;
  const engine = live || row?.engine || mbFirmAi(_aiDesk?.settings || {}).engine;
  return engine === 'super';
}

function mbAiInsertTask(staffId, key) {
  const row = (_aiDesk?.staff || []).find((item) => String(item.id) === String(staffId));
  const textKey = key === 'end' && row && !mbAiRowSuper(row) ? 'ai.task.end_std_text' : `ai.task.${key}_text`;
  const text = mbAiSay(textKey, '');
  const el = document.getElementById(`ai-prompt-${staffId}`);
  if (!el || !text) return;
  const plain = mbAiRichValue(el);
  const gap = plain && !plain.endsWith('\n') ? '\n' : '';
  const caret = mbAiRichCaret(el);
  if (el.getAttribute?.('contenteditable') === 'true' && caret != null && caret < plain.length) {
    mbAiRichInsert(el, text);
  } else {
    mbAiRichInsert(el, `${gap}${text}`);
  }
  mbAiTokenFocus(el.id);
}

function mbAiJobPairs(sup) {
  const shared = [['look', 'look'], ['slot', 'slot'], ['result', 'save'], ['fix', 'fix'], ['end', sup ? 'end' : 'end_std']];
  return sup ? [...shared, ['quiet', 'quiet'], ['tape', 'tape']] : [...shared, ['hand', 'hand']];
}

function mbAiJobsBlock(row) {
  const staffId = row.id;
  const jobs = mbAiJobPairs(mbAiRowSuper(row));
  const button = (key) => `<button type="button" class="ai-token" onclick="mbAiInsertTask('${mbAiEsc(staffId)}','${key}')"><b>${mbAiEsc(mbAiSay(`ai.task.${key}`, key))}</b></button>`;
  const note = (key) => `<p class="ai-job"><b>${mbAiEsc(mbAiSay(`ai.job.${key}`, ''))}</b> ${mbAiEsc(mbAiSay(`ai.job.${key}_note`, ''))}</p>`;
  return `<div id="ai-jobs-${mbAiEsc(staffId)}">
    <div class="ai-tokens-lab">${mbAiEsc(mbAiSay('ai.staff.jobs', 'Nasıl yapılır'))}</div>
    <div class="ai-token-row">${jobs.map(([key]) => button(key)).join('')}</div>
    <div class="ai-job-notes">${jobs.map(([, key]) => note(key)).join('')}</div>
  </div>`;
}

function mbAiQcTaskRow(row) {
  const staffId = row.id;
  const flow = ['name', 'when', 'form', 'move', 'bye'];
  const button = (key) => `<button type="button" class="ai-token" onclick="mbAiInsertTask('${mbAiEsc(staffId)}','${key}')"><b>${mbAiEsc(mbAiSay(`ai.task.${key}`, key))}</b></button>`;
  return `<div class="ai-tokens-lab">${mbAiEsc(mbAiSay('ai.staff.tasks', 'Görev ekle'))}</div>
    <div class="ai-token-row">${flow.map(button).join('')}</div>
    ${mbAiJobsBlock(row)}
    <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.tasks_hint', ''))}</div>`;
}

function mbAiRulesFields(row) {
  const id = mbAiEsc(row.id);
  return `<div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.rules', 'Kurallar'))}</div>
    ${mbAiField(`ai-must-${row.id}`, mbAiSay('ai.staff.must', 'Kesinlikle yapılması gerek'), `<textarea class="form-input" id="ai-must-${id}" rows="3" maxlength="600" placeholder="${mbAiEsc(mbAiSay('ai.staff.must_ph', ''))}">${mbAiEsc(row.must_do || '')}</textarea>`, true)}
    ${mbAiField(`ai-mustnot-${row.id}`, mbAiSay('ai.staff.mustnot', 'Kesinlikle yapılmaması gerek'), `<textarea class="form-input" id="ai-mustnot-${id}" rows="3" maxlength="600" placeholder="${mbAiEsc(mbAiSay('ai.staff.mustnot_ph', ''))}">${mbAiEsc(row.must_not || '')}</textarea>`, true)}
    <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.rules_hint', ''))}</div>`;
}

function mbAiInsertToken(staffId, token) {
  const prefer = _aiTokenFocus.endsWith(`-${staffId}`) ? _aiTokenFocus : `ai-prompt-${staffId}`;
  const el = document.getElementById(prefer) || document.getElementById(`ai-prompt-${staffId}`);
  if (!el) return;
  mbAiRichInsert(el, token);
  mbAiTokenFocus(el.id);
}

function mbAiIsWaitResult(row) {
  const key = String(row?.key || '');
  if (!key || key === 'qc_bekleniyor') return false;
  if (key === 'beklemede') return true;
  const status = String(row.contact_status || '').toLowerCase();
  if (status === 'beklemede' || status === 'wartend') return true;
  const label = String(row.label || '').toLowerCase();
  return label === 'beklemede' || label === 'wartend' || label.includes('beklemede');
}

function mbAiIsMissResult(row) {
  const key = String(row?.key || '');
  if (key === 'ulasilamadi') return true;
  const status = String(row?.contact_status || '').toLowerCase();
  if (status === 'ulaşılamadı' || status === 'ulasilamadi' || status === 'nicht erreicht') return true;
  const label = String(row?.label || '').toLowerCase();
  return label === 'ulaşılamadı' || label.includes('ulaşılamadı') || label.includes('nicht erreicht');
}

function mbAiHoldPick(keys) {
  const wanted = new Set(keys || []);
  const rows = (_aiDesk?.results || []).filter((row) => wanted.has(row.key));
  const labelOf = (row) => (typeof mbResultLabel === 'function' ? mbResultLabel(row.key, row.label) : (row.label || row.key));
  const wait = rows.find(mbAiIsWaitResult);
  const miss = rows.find(mbAiIsMissResult);
  return {
    wait: wait ? { key: wait.key, label: labelOf(wait) } : null,
    miss: miss ? { key: miss.key, label: labelOf(miss) } : null,
  };
}

function mbAiMoveHintText(on, keys) {
  if (on) return mbAiSay('ai.staff.move_hint', '');
  const hold = mbAiHoldPick(keys);
  if (hold.wait) return mbAiSay('ai.staff.move_off_wait', 'Kapalıysa saat kalır. Başka saat istenirse sonuç «{name}» yazılır.').replace('{name}', hold.wait.label);
  if (hold.miss) return mbAiSay('ai.staff.move_off_miss', 'Kapalıysa saat kalır. Bekleme sonucu işaretli değil. Başka saat istenirse «{name}» yazılır.').replace('{name}', hold.miss.label);
  return mbAiSay('ai.staff.move_off_none', 'Kapalıysa saat kalır. Bekleme sonucu yok. Başka saat istenirse ulaşılamadı yazılır.');
}

function mbAiMoveHint(staffId) {
  const hint = document.getElementById(`ai-move-hint-${staffId}`);
  if (!hint) return;
  const keys = [...document.querySelectorAll(`[data-ai-result="${staffId}"]`)].filter((el) => el.checked).map((el) => el.value);
  hint.textContent = mbAiMoveHintText(!!document.getElementById(`ai-move-${staffId}`)?.checked, keys);
}

function mbAiStaffCard(row) {
  const id = mbAiEsc(row.id);
  const camps = _aiDesk?.camps || [];
  const pickedCamps = new Set(mbAiCampIds(row));
  const campAll = mbAiPill('data-ai-camp', row.id, '*', mbAiSay('ai.staff.camps_all', 'Tümü'), pickedCamps.size === 0, 'mbAiCampPick(this)');
  const campRest = camps.map((camp) => mbAiPill('data-ai-camp', row.id, camp.id, camp.name || '', pickedCamps.has(camp.id), 'mbAiCampPick(this)')).join('');
  const qc = row.kind === 'qc';
  const kindLabel = qc ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu');
  const choices = qc ? mbAiQcChoices() : mbAiSalesChoicesMany(pickedCamps);
  const picked = new Set(row.results || []);
  const resultPills = choices.map((item) => mbAiPill('data-ai-result', row.id, item.key, item.label, picked.has(item.key), `mbAiMoveHint('${id}')`)).join('');
  const tokens = mbAiTokensFor(row).map(([token, label]) => `<button type="button" class="ai-token" title="${mbAiEsc(token)}" onclick="mbAiInsertToken('${id}','${mbAiEsc(token)}')"><b>${mbAiEsc(label)}</b><code>${mbAiEsc(token)}</code></button>`).join('');
  const tail = qc
    ? mbAiQcAuto(row, choices)
    : `<div class="ai-sec"><div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.parallel', 'Aynı anda kaç kişi'))}</div><select class="form-input ai-narrow" id="ai-parallel-${id}">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${row.parallel === n ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
  const powers = qc ? `<div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.powers', 'Yetki'))}</div>
      ${mbAiSwitch(`ai-move-${id}`, row.move_time !== false, mbAiSay('ai.staff.move', 'Randevu saatini değiştirebilir'), `mbAiMoveHint('${id}')`)}
      <div class="ai-hint" id="ai-move-hint-${id}">${mbAiEsc(mbAiMoveHintText(row.move_time !== false, row.results || []))}</div>
    </div>` : '';
  const open = _aiOpen.has(row.id) ? ' open' : '';
  return `<section class="ai-card">
    <details class="ai-fold"${open} ontoggle="mbAiFold('${id}', this.open)">
    <summary class="ai-card-hd">
      <span class="ai-badge ${qc ? 'is-qc' : 'is-sales'}"><i class="ph ${qc ? 'ph-seal-check' : 'ph-calendar-check'}"></i> ${mbAiEsc(kindLabel)}</span>
      <input class="ai-name" id="ai-name-${id}" maxlength="40" value="${mbAiEsc(row.name)}" placeholder="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}">
      <i class="ph ph-caret-down ai-caret"></i>
      <button type="button" class="ai-copy" title="${mbAiEsc(mbAiSay('ai.staff.copy', 'Kopyala'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.copy', 'Kopyala'))}" onclick="event.preventDefault(); event.stopPropagation(); mbAiCopyStaff('${id}')"><i class="ph ph-copy"></i></button>
      <button type="button" class="ai-del" title="${mbAiEsc(mbAiSay('ai.staff.remove', 'Kaldır'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.remove', 'Kaldır'))}" onclick="event.preventDefault(); event.stopPropagation(); mbAiDropStaff('${id}')"><i class="ph ph-trash"></i></button>
    </summary>
    <div class="ai-fold-body">
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.camps', 'Kampanyalar'))}</div>
      <div class="ai-camp-pick"><div class="ai-pills">${campAll}</div>${campRest ? `<div class="ai-camp-box"><div class="ai-pills">${campRest}</div></div>` : ''}</div>
      <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.camps_hint', ''))}</div>
    </div>
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.sec.talk', 'Konuşma'))}</div>
      <div class="ai-tokens-lab">${mbAiEsc(mbAiSay('ai.staff.tokens', 'Kişi kartından ekle'))}</div>
      <div class="ai-token-row">${tokens}</div>
      ${qc ? mbAiQcTaskRow(row) : ''}
      ${mbAiField(`ai-greet-${row.id}`, mbAiSay('ai.staff.greeting', 'İlk cümle'), `${mbAiRichBox(`ai-greet-${row.id}`, row.greeting || '', 400, 2, mbAiSay('ai.staff.greeting_ph', ''), row.id)}<div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.greeting_hint', ''))}</div>`, true)}
      ${mbAiField(`ai-prompt-${row.id}`, mbAiSay('ai.staff.prompt', 'Talimat'), `${mbAiRichBox(`ai-prompt-${row.id}`, row.prompt || '', 2000, 7, mbAiSay('ai.staff.prompt_ph', ''), row.id)}<div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.prompt_hint', ''))}</div>`, true)}
      ${mbAiRulesFields(row)}
    </div>
    ${mbAiEngineSection(row)}
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.results', 'Yazabileceği sonuçlar'))}</div>
      <div class="ai-pills">${resultPills}</div>
    </div>
    ${powers}
    ${tail}
    </div>
    </details>
  </section>`;
}

function mbAiEngineSection(row) {
  const id = mbAiEsc(row.id);
  const fallback = mbFirmAi(_aiDesk?.settings || {});
  const engine = row.engine || fallback.engine;
  const llm = row.llm || fallback.llm;
  const opt = (value, cur, label) => `<option value="${value}"${value === cur ? ' selected' : ''}>${mbAiEsc(label)}</option>`;
  return `<div class="ai-sec">
    <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.engine', 'Motor'))}</div>
    <select class="form-input ai-narrow" id="ai-engine-${id}" onchange="mbAiEngineChanged('${id}')">${opt('std', engine, mbAiSay('ai.engine.std', 'Standart'))}${opt('super', engine, mbAiSay('ai.engine.super', 'Gelişmiş'))}</select>
    <div class="ai-hint" id="ai-engine-hint-${id}"></div>
    <div id="ai-llm-wrap-${id}" style="display:${engine === 'super' ? 'block' : 'none'};margin-top:8px;">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.llm', 'Yapay zeka modeli'))}</div>
      <select class="form-input" id="ai-llm-${id}" onchange="mbAiEngineChanged('${id}')">${MB_AI_LLMS.map((item) => opt(item.id, llm, item.label)).join('')}</select>
      <div class="ai-hint" id="ai-llm-hint-${id}"></div>
      <div class="ai-sec-t" style="margin-top:8px;">${mbAiEsc(mbAiSay('ai.voice.title', 'Ses'))}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="hidden" id="ai-evoice-${id}" value="${mbAiEsc(row.voice_id || '')}">
        <input type="hidden" id="ai-evname-${id}" value="${mbAiEsc(row.voice_name || '')}">
        <span id="ai-evlabel-${id}" style="flex:1;min-width:140px;font-weight:700;">${mbAiEsc(row.voice_id ? (row.voice_name || row.voice_id) : mbAiSay('ai.voice.auto', 'Otomatik (Türkçe ses seçilir)'))}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiVoicePick('${id}')"><i class="ph ph-speaker-high"></i> ${mbAiEsc(mbAiSay('ai.voice.pick', 'Ses seç ve dinle'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiVoiceClear('${id}')">${mbAiEsc(mbAiSay('ai.voice.clear', 'Otomatik'))}</button>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="mbAiElevenSetup(this)"><i class="ph ph-plugs-connected"></i> ${mbAiEsc(mbAiSay('ai.eleven.test', 'ElevenLabs bağlantısını dene'))}</button>
    </div>
  </div>`;
}

function mbAiVoiceClear(sid) {
  const idEl = document.getElementById('ai-evoice-' + sid);
  const nameEl = document.getElementById('ai-evname-' + sid);
  const label = document.getElementById('ai-evlabel-' + sid);
  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (label) label.textContent = mbAiSay('ai.voice.auto', 'Otomatik (Türkçe ses seçilir)');
}

// Ses seçici: ElevenLabs kütüphanesindeki sesleri dinletir; seçilen ses hesaba eklenir ve personele yazılır.
function mbAiVoicePick(sid) {
  window._aiVoice = { sid, gender: '', q: '', mine: false, page: 0, items: [], more: false, busy: false };
  document.getElementById('ai-voice-pop')?.remove();
  const pop = document.createElement('div');
  pop.id = 'ai-voice-pop';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card" role="dialog" aria-modal="true" style="max-width:720px;width:min(720px,94vw);max-height:84vh;display:flex;flex-direction:column;gap:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div style="font-weight:800;">${mbAiEsc(mbAiSay('ai.voice.title', 'Ses'))}</div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiVoiceClose()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <select id="ai-voice-tab" class="form-input" style="width:auto;" onchange="mbAiVoiceFilter()">
        <option value="lib">${mbAiEsc(mbAiSay('ai.voice.lib', 'Ses kütüphanesi'))}</option>
        <option value="mine">${mbAiEsc(mbAiSay('ai.voice.mine', 'Eklediklerim'))}</option>
      </select>
      <select id="ai-voice-gender" class="form-input" style="width:auto;" onchange="mbAiVoiceFilter()">
        <option value="">${mbAiEsc(mbAiSay('ai.voice.all', 'Hepsi'))}</option>
        <option value="female">${mbAiEsc(mbAiSay('line.ai.voice.female', 'Kadın'))}</option>
        <option value="male">${mbAiEsc(mbAiSay('line.ai.voice.male', 'Erkek'))}</option>
      </select>
      <input id="ai-voice-q" class="form-input" style="flex:1;min-width:140px;" maxlength="60" placeholder="${mbAiEsc(mbAiSay('ai.voice.search', 'Ara'))}" onkeydown="if(event.key==='Enter')mbAiVoiceFilter()">
      <button type="button" class="btn btn-primary btn-sm" onclick="mbAiVoiceFilter()">${mbAiEsc(mbAiSay('ai.voice.search', 'Ara'))}</button>
    </div>
    <div id="ai-voice-list" style="overflow:auto;display:flex;flex-direction:column;gap:8px;min-height:120px;"></div>
  </div>`;
  pop.addEventListener('click', (event) => { if (event.target === pop) mbAiVoiceClose(); });
  document.body.appendChild(pop);
  mbAiVoiceFilter();
}

function mbAiVoiceClose() {
  document.querySelectorAll('#ai-voice-pop audio').forEach((el) => el.pause());
  document.getElementById('ai-voice-pop')?.remove();
}

function mbAiVoiceFilter() {
  const st = window._aiVoice;
  if (!st) return;
  st.mine = document.getElementById('ai-voice-tab')?.value === 'mine';
  st.gender = document.getElementById('ai-voice-gender')?.value || '';
  st.q = String(document.getElementById('ai-voice-q')?.value || '').trim();
  st.page = 0;
  st.items = [];
  void mbAiVoiceLoad();
}

async function mbAiVoiceLoad() {
  const st = window._aiVoice;
  const host = document.getElementById('ai-voice-list');
  if (!st || !host || st.busy) return;
  st.busy = true;
  if (!st.items.length) host.innerHTML = `<div class="ai-hint">${mbAiEsc(mbAiSay('ai.voice.loading', 'Yükleniyor...'))}</div>`;
  const lang = document.getElementById('ai-lang')?.value === 'de' ? 'de' : 'tr';
  const res = await mbTelnyxAi('voices', { firm_id: _aiFirmId, lang, gender: st.gender, q: st.q, page: st.page, mine: st.mine });
  st.busy = false;
  if (window._aiVoice !== st) return;
  if (!res?.ok) {
    host.innerHTML = `<div class="ai-hint">${mbAiEsc(res?.error === 'nokey_el' ? mbAiSay('ai.eleven.nokey', 'ElevenLabs API anahtarı yok.') : mbAiSay('ai.voice.fail', 'Sesler alınamadı.') + ' ' + String(res?.detail || ''))}</div>`;
    return;
  }
  st.items = st.items.concat(res.voices || []);
  st.more = !!res.more;
  mbAiVoicePaint();
}

function mbAiVoicePaint() {
  const st = window._aiVoice;
  const host = document.getElementById('ai-voice-list');
  if (!st || !host) return;
  if (!st.items.length) {
    host.innerHTML = `<div class="ai-hint">${mbAiEsc(mbAiSay('ai.voice.none', 'Ses bulunamadı.'))}</div>`;
    return;
  }
  const rows = st.items.map((item, index) => {
    const tags = [item.gender, item.accent, item.use].filter(Boolean).join(' · ');
    return `<div style="border:1px solid var(--border, #ddd);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
        <div><b>${mbAiEsc(item.name)}</b><div class="ai-hint">${mbAiEsc(tags)}</div></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="mbAiVoiceUse(${index}, this)">${mbAiEsc(mbAiSay('ai.voice.use', 'Bunu seç'))}</button>
      </div>
      ${item.desc ? `<div class="ai-hint">${mbAiEsc(item.desc)}</div>` : ''}
      ${item.preview ? `<audio controls preload="none" src="${mbAiEsc(item.preview)}" style="width:100%;height:32px;"></audio>` : ''}
    </div>`;
  }).join('');
  const more = st.more ? `<button type="button" class="btn btn-ghost btn-sm" onclick="mbAiVoiceMore()">${mbAiEsc(mbAiSay('ai.voice.more', 'Daha fazla'))}</button>` : '';
  host.innerHTML = rows + more;
}

function mbAiVoiceMore() {
  const st = window._aiVoice;
  if (!st) return;
  st.page += 1;
  void mbAiVoiceLoad();
}

async function mbAiVoiceUse(index, btn) {
  const st = window._aiVoice;
  const item = st?.items?.[index];
  if (!st || !item) return;
  if (btn) btn.disabled = true;
  const res = item.owner
    ? await mbTelnyxAi('voice_add', { firm_id: _aiFirmId, voice_id: item.id, owner: item.owner, name: item.name })
    : { ok: true };
  if (!res?.ok) {
    if (btn) btn.disabled = false;
    if (typeof toast === 'function') toast(mbAiSay('ai.voice.fail', 'Ses eklenemedi.') + ' ' + String(res?.detail || '').slice(0, 200), 'err');
    return;
  }
  const idEl = document.getElementById('ai-evoice-' + st.sid);
  const nameEl = document.getElementById('ai-evname-' + st.sid);
  const label = document.getElementById('ai-evlabel-' + st.sid);
  if (idEl) idEl.value = item.id;
  if (nameEl) nameEl.value = item.name;
  if (label) label.textContent = item.name;
  mbAiVoiceClose();
  if (typeof toast === 'function') toast(mbAiSay('ai.voice.picked', 'Ses seçildi. Kaydet düğmesine basın.'), 'ok');
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
        <div class="ai-field"><label for="ai-ondate-${id}">${mbAiEsc(mbAiSay('ai.staff.call_on', 'Şu tarihteki randevular'))}</label><input class="form-input" type="date" id="ai-ondate-${id}" value="${mbAiEsc(row.call_on || '')}"><div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.call_on_hint', ''))}</div></div>
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
    work: String(draft.work || '').trim().slice(0, 800),
    lang: draft.lang === 'tr' ? 'tr' : 'de',
    voice: draft.voice === 'female' || draft.voice === 'male' ? draft.voice : '',
    engine: draft.engine === 'super' ? 'super' : 'std',
    llm: MB_AI_LLMS.some((row) => row.id === draft.llm) ? draft.llm : MB_AI_LLMS[0].id,
    rate: Number(draft.rate) > 0 ? Number(draft.rate) : 0,
    transfer,
    forbid_price: draft.forbid_price !== false,
    forbid_contract: draft.forbid_contract !== false,
    forbid_other: draft.forbid_other !== false,
    eagerness: draft.eagerness === 'patient' || draft.eagerness === 'eager' ? draft.eagerness : 'normal',
    silence_sec: [30, 60, 120, 300].includes(Number(draft.silence_sec)) ? Number(draft.silence_sec) : 60,
    max_min: [5, 7, 10].includes(Number(draft.max_min)) ? Number(draft.max_min) : 7,
    voice_style: draft.voice_style === 'calm' || draft.voice_style === 'lively' ? draft.voice_style : 'natural',
    expressive: draft.expressive !== false,
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
    window._aiStaffByFirm[_aiFirmId] = mbAiResolveEngine(_aiDesk.staff, settings);
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
  return `<button type="button" class="qc-callin-btn" onclick="qcAskCallin('${mbAiEsc(row.id)}')"><i class="ph ph-phone-call"></i><span>${mbAiEsc(label)}</span></button>`;
}

function qcCallinPhase(row) {
  const busy = window._qcCallinBusy?.[row?.id];
  if (busy) return busy;
  const ek = row?.form_ek && typeof row.form_ek === 'object' ? row.form_ek : {};
  if (ek.callin_phase) return String(ek.callin_phase);
  if (ek.callin_state === 'dialing') return 'ringing';
  if (ek.callin_state === 'done') return Number(ek.callin_sec) > 0 ? 'talked' : 'missed';
  return '';
}

function qcCallinLiveHtml(row) {
  const ek = row?.form_ek && typeof row.form_ek === 'object' ? row.form_ek : {};
  const phase = qcCallinPhase(row);
  if (!phase) return '';
  const name = typeof ariaName === 'function' ? ariaName() : 'Callin';
  const who = row?.nachname || '—';
  const finished = ek.callin_state === 'done' || phase === 'talked' || phase === 'missed';
  const key = typeof _qcDurumKey === 'function' ? _qcDurumKey(row) : '';
  const cfg = window._qcResultMap?.[key];
  let resultName = key && key !== 'qc_bekleniyor' && typeof _qcResultLabel === 'function' ? _qcResultLabel(key) : '';
  if (!resultName && phase === 'missed') resultName = mbAiSay('qc.callin.missed_result', 'Ulaşılamadı');
  if (!resultName && finished) resultName = mbAiSay('qc.callin.pending_result', 'Bekleniyor');
  const line = finished
    ? mbAiSay('qc.callin.result', '{name} aradı. Sonuç: {result}')
    : {
      ringing: mbAiSay('qc.callin.ringing', '{name}, {who} kişisini arıyor.'),
      talking: mbAiSay('qc.callin.talking', 'Telefon açıldı. {name} konuşuyor.'),
    }[phase] || mbAiSay('qc.callin.ringing', '{name}, {who} kişisini arıyor.');
  const text = line.replace('{name}', name).replace('{who}', who).replace('{result}', resultName);
  const tone = finished ? (phase === 'missed' || (cfg?.color && phase !== 'talked') ? 'is-miss' : 'is-talk') : (phase === 'talking' ? 'is-talk' : 'is-ring');
  const color = cfg?.color || (phase === 'missed' ? '#b91c1c' : '');
  const paint = color ? ` style="color:${mbAiEsc(color)};border-left-color:${mbAiEsc(color)}"` : '';
  const result = `<b${finished && color ? ` style="color:${mbAiEsc(color)}"` : ''}>${mbAiEsc(text)}</b>`;
  const note = String(row?.qc_notu || ek.callin_summary || '').trim();
  const script = String(ek.callin_transcript || '').trim();
  const noteHtml = note ? `<div class="qc-callin-note">${mbAiEsc(note)}</div>` : '';
  const scriptHtml = script
    ? `<details class="qc-callin-script"><summary>${mbAiEsc(mbAiSay('qc.callin.transcript', 'Konuşma'))}</summary>${mbAiEsc(script)}</details>`
    : '';
  const shell = `class="qc-callin-live ${tone}" data-callin-live="${mbAiEsc(row.id)}" onclick="event.stopPropagation()"${paint}`;
  if (!note && !script) return `<div ${shell}>${result}</div>`;
  return `<details ${shell}><summary>${result}</summary>${noteHtml}${scriptHtml}</details>`;
}

function qcPaintCallin(row) {
  if (!row?.id) return;
  const html = qcCallinLiveHtml(row);
  const nodes = document.querySelectorAll(`[data-callin-live="${row.id}"]`);
  if (!nodes.length) {
    if (typeof renderQcTable === 'function') renderQcTable();
    if (typeof mountQcReviewForm === 'function') mountQcReviewForm();
    return;
  }
  nodes.forEach((node) => { node.outerHTML = html; });
}

function qcApplyCallin(row, res) {
  if (!row) return;
  const ek = { ...(row.form_ek && typeof row.form_ek === 'object' ? row.form_ek : {}) };
  if (res?.phase) ek.callin_phase = res.phase;
  if (res?.state) ek.callin_state = res.done ? 'done' : (res.state || ek.callin_state);
  if (res?.transcript) ek.callin_transcript = String(res.transcript).slice(0, 3500);
  if (res?.summary) ek.callin_summary = String(res.summary).slice(0, 800);
  if (res?.error) ek.callin_error = res.error;
  if (res?.secs) ek.callin_sec = String(res.secs);
  ek.callin_engine = ek.callin_engine || 'eleven';
  row.form_ek = ek;
  if (res?.qc_notu) row.qc_notu = res.qc_notu;
  if (res?.durum) row.durum = res.durum;
  if (res?.recording && row.contact_id && typeof qcRememberRec === 'function') {
    qcRememberRec(row.contact_id, { id: ek.callin_log || '', contact_id: row.contact_id, recording_url: res.recording, duration_sec: Number(res.secs) || 0, started_at: new Date().toISOString(), phone: row.telefonnummer || '' });
    if (typeof renderQcTable === 'function') renderQcTable();
  }
  if (res?.phase && res.phase !== 'ringing') delete window._qcCallinBusy?.[row.id];
  qcPaintCallin(row);
}

function qcAskCallin(apptId) {
  const row = (typeof qcList !== 'undefined' ? qcList : []).find((item) => item.id === apptId);
  const all = row ? mbAiQcStaffAll(row.firm_id, row.campaign_id) : [];
  const staff = all[0] || null;
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
    ${all.length > 1 ? `<select id="ai-callin-staff" class="form-input">${all.map((item) => `<option value="${mbAiEsc(item.id)}">${mbAiEsc(item.name || mbAiSay('ai.staff.qc', 'Kalite'))} · ${mbAiEsc(mbAiStaffEngineLabel(item))}</option>`).join('')}</select>` : ''}
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

function mbAiStaffEngineLabel(staff) {
  return staff.engine === 'super' ? mbAiSay('ai.engine.super', 'Gelişmiş') : mbAiSay('ai.engine.std', 'Standart');
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
  const note = direct ? '' : String(document.getElementById('ai-callin-note')?.value || '').trim().slice(0, 800);
  const picked = String(document.getElementById('ai-callin-staff')?.value || '') || staffId;
  const row = (typeof qcList !== 'undefined' ? qcList : []).find((item) => item.id === apptId);
  qcCloseCallin();
  window._qcCallinBusy = window._qcCallinBusy || {};
  window._qcCallinBusy[apptId] = 'ringing';
  if (row) {
    row.form_ek = { ...(row.form_ek && typeof row.form_ek === 'object' ? row.form_ek : {}), callin_engine: 'eleven', callin_state: 'dialing', callin_phase: 'ringing' };
    qcPaintCallin(row);
  }
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.placing', 'Aranıyor. Hat açılınca konuşma başlar.'), 'ok');
  const res = await mbTelnyxAi('place', { appointment_id: apptId, staff_id: picked, note });
  if (!res?.ok) {
    delete window._qcCallinBusy[apptId];
    if (row?.form_ek) delete row.form_ek.callin_phase;
    if (row) qcPaintCallin(row);
    const key = { gate: 'qc.callin.gate', results: 'qc.callin.gate', phone: 'qc.callin.phone', busy: 'qc.callin.busy', nokey_el: 'qc.callin.nokey_el' }[res?.error] || 'qc.callin.fail';
    const why = String(res?.detail || '').slice(0, 220);
    if (typeof toast === 'function') toast(mbAiSay(key, 'Arama çıkmadı.') + (why ? ` (${why})` : ''), 'err');
    return;
  }
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.started', 'Arama çıktı. Karşı taraf açınca konuşma başlar.'), 'ok');
  mbAiWatchCall(apptId);
}

// Süper motorda bitiş bildirimi gelmez; arama bitene kadar sunucudan durum sorulur ve süre faturalanır.
async function mbAiWatchCall(apptId) {
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const res = await mbTelnyxAi('sync', { appointment_id: apptId });
    const row = (typeof qcList !== 'undefined' ? qcList : []).find((item) => item.id === apptId);
    if (res?.ok && row) qcApplyCallin(row, res);
    if (!res?.ok || !res.done) continue;
    delete window._qcCallinBusy?.[apptId];
    if (typeof toast === 'function') {
      toast(res.phase === 'missed' || !(res.secs > 0)
        ? mbAiSay('qc.callin.noanswer', 'Arama açılmadı.')
        : mbAiSay('qc.callin.done', 'Arama bitti.'), res.secs > 0 ? 'ok' : 'warn');
    }
    if (row && typeof _qcAttachRec === 'function') {
      const recs = await _qcAttachRec([row]).catch(() => null);
      if (recs && row.contact_id && recs[row.contact_id]) {
        window._qcRecByContact = { ...(window._qcRecByContact || {}), [row.contact_id]: recs[row.contact_id] };
        if (typeof renderQcTable === 'function') renderQcTable();
        else qcPaintCallin(row);
      }
    }
    return;
  }
}
