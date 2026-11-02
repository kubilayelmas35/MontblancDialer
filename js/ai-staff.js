// YZ personel — Callin sekmeleri: kurulum, başlatma. Tek kalite araması onay kutusundan da çıkar.

let _aiDesk = null;
let _aiFirmId = '';
const _aiOpen = new Set();
let _aiRunTimer = null;
let _aiRunSaving = false;
const _aiRunBusy = new Set();
const _aiRunLive = {};
const _aiRunRecent = [];
let _aiRunHist = { staff: '', outcome: '', sort: 'new', q: '', day: '7', from: '', to: '', rows: [], loading: false };
let _aiHistJump = null;

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
    run_mode: ai.run_mode === 'server' ? 'server' : 'page',
    run_allow: mbAiRunAllowList(ai),
    day_min_cap: Number(ai.day_min_cap) > 0 ? Math.min(1440, Math.round(Number(ai.day_min_cap))) : 0,
    qc_after: ['now', '5', '15', '30'].includes(String(ai.qc_after || '')) ? String(ai.qc_after) : 'off',
  };
}

function mbAiRunAllowList(ai) {
  const raw = Array.isArray(ai?.run_allow) ? ai.run_allow : null;
  if (raw && raw.length) {
    const set = [...new Set(raw.map((item) => String(item || '')).filter((item) => item === 'page' || item === 'server'))];
    if (set.length) return set;
  }
  return [ai?.run_mode === 'server' ? 'server' : 'page'];
}

function mbAiRunAllow(settings) {
  return mbFirmAi(settings).run_allow;
}

function mbAiRunMode(settings) {
  const allow = mbAiRunAllow(settings);
  const pick = settings?.ai?.run_mode === 'server' ? 'server' : 'page';
  if (allow.includes(pick)) return pick;
  return allow[0] || 'page';
}

function mbAiRunAllowBoth(settings) {
  const allow = mbAiRunAllow(settings);
  return allow.includes('page') && allow.includes('server');
}

function mbAiFocusIds(row) {
  const allowed = new Set(mbAiCampIds(row));
  const focus = (Array.isArray(row?.focus_ids) ? row.focus_ids : []).map((id) => String(id || '')).filter(mbAiUuid);
  const picked = focus.filter((id) => !allowed.size || allowed.has(id));
  if (picked.length) return [...new Set(picked)].slice(0, 24);
  return [...allowed];
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

function mbAiWithinHours(row) {
  const from = String(row?.call_from || '').slice(0, 5);
  const until = String(row?.call_until || '').slice(0, 5);
  if (!from || !until) return true;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hhmm >= from && hhmm <= until;
}

function mbAiStopWhyMap() {
  window._aiStopWhy = window._aiStopWhy && typeof window._aiStopWhy === 'object' ? window._aiStopWhy : {};
  return window._aiStopWhy;
}

function mbAiSetStopWhy(staffId, code, detail) {
  if (!staffId) return;
  const map = mbAiStopWhyMap();
  map[String(staffId)] = { code: code || 'manual', detail: String(detail || '').slice(0, 120), at: Date.now() };
}

function mbAiClearStopWhy(staffId) {
  if (!staffId) return;
  delete mbAiStopWhyMap()[String(staffId)];
}

function mbAiStopWhyLabel(staffId) {
  const row = mbAiStopWhyMap()[String(staffId || '')];
  if (!row) return '';
  const map = {
    hours: mbAiSay('ai.run.stop.hours', 'Saat dışı durdu'),
    quota: mbAiSay('ai.run.stop.quota', 'Kota doldu, durdu'),
    error: mbAiSay('ai.run.stop.error', 'Hata sonrası durdu'),
    manual: mbAiSay('ai.run.stop.manual', 'Elle durduruldu'),
    stop_all: mbAiSay('ai.run.stop.all', 'Hepsini durdur'),
  };
  const base = map[row.code] || map.manual;
  return row.detail ? `${base} · ${row.detail}` : base;
}

function mbAiQcAfterMode(settings) {
  const raw = String((settings || _aiDesk?.settings)?.ai?.qc_after || 'off');
  if (raw === 'now' || raw === '5' || raw === '15' || raw === '30') return raw;
  return 'off';
}

function mbAiTranscriptSnippet(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const take = parts.length > 3 ? parts.slice(-3) : parts;
  return take.join(' ').slice(0, 280);
}

function mbAiDayCap(settings) {
  const n = Number((settings || _aiDesk?.settings)?.ai?.day_min_cap);
  return n > 0 ? n : 0;
}

function mbAiQuotaBlocked(settings) {
  const cap = mbAiDayCap(settings);
  if (!cap) return false;
  const secs = Number(window._callinAiCostToday?.secs) || Number(_callinDesk?.stats?.secs) || 0;
  return (secs / 60) >= cap;
}

function mbAiScoreFlip(staffId, out, cls, nKey, pKey, nLab, pLab, count, dialed) {
  const n = Number(count) || 0;
  const pct = dialed > 0 ? Math.round((n / dialed) * 100) : 0;
  const num = mbAiSay(nKey, nLab).replace('{n}', String(n));
  const per = mbAiSay(pKey, pLab).replace('{n}', String(pct));
  const sid = mbAiEsc(staffId);
  const oid = mbAiEsc(out || '');
  return `<button type="button" class="ai-run-score-bit ${cls}" title="${mbAiEsc(`${num} · ${per}`)}" onclick="mbAiScoreOpenHist('${sid}','${oid}')">
    <span class="ai-run-score-flip">
      <span class="ai-run-score-n">${mbAiEsc(num)}</span>
      <span class="ai-run-score-p">${mbAiEsc(per)}</span>
    </span>
  </button>`;
}

function mbAiStaffScoreHtml(staffId) {
  const bag = window._callinStaffToday || {};
  const s = bag[String(staffId)] || { dialed: 0, appt: 0, miss: 0, neg: 0, cb: 0, vm: 0 };
  const d = Number(s.dialed) || 0;
  const sid = mbAiEsc(staffId);
  return `<div class="ai-run-score" id="ai-run-score-${sid}" data-ai-score="1">
    <button type="button" class="ai-run-score-bit" onclick="mbAiScoreOpenHist('${sid}','')">${mbAiEsc(mbAiSay('ai.run.score.dial', '{n} arama').replace('{n}', String(d)))}</button>
    ${mbAiScoreFlip(staffId, 'ok', 'is-ok', 'ai.run.score.appt', 'ai.run.score.appt_pct', '{n} randevu', '%{n} randevu', s.appt, d)}
    ${mbAiScoreFlip(staffId, 'neg', 'is-neg', 'ai.run.score.neg', 'ai.run.score.neg_pct', '{n} olumsuz', '%{n} olumsuz', s.neg, d)}
    ${mbAiScoreFlip(staffId, 'miss', 'is-miss', 'ai.run.score.miss_n', 'ai.run.score.miss', '{n} cevapsız', '%{n} cevapsız', s.miss, d)}
    ${mbAiScoreFlip(staffId, 'cb', 'is-cb', 'ai.run.score.cb', 'ai.run.score.cb_pct', '{n} geri arama', '%{n} geri arama', s.cb, d)}
    ${mbAiScoreFlip(staffId, 'vm', 'is-vm', 'ai.run.score.vm', 'ai.run.score.vm_pct', '{n} telesekreter', '%{n} telesekreter', s.vm, d)}
  </div>`;
}

function mbAiScoreOpenHist(staffId, outcome) {
  _aiHistJump = {
    staff: String(staffId || ''),
    outcome: String(outcome || ''),
    day: 'today',
  };
  _aiRunHist.staff = _aiHistJump.staff;
  _aiRunHist.outcome = _aiHistJump.outcome;
  _aiRunHist.day = 'today';
  if (typeof callinTab === 'function') callinTab('run');
  mbAiApplyHistJump();
  setTimeout(() => mbAiApplyHistJump(), 350);
}

function mbAiApplyHistJump() {
  const jump = _aiHistJump;
  if (!jump) return;
  const staffEl = document.getElementById('ai-run-hist-staff');
  const outEl = document.getElementById('ai-run-hist-out');
  const dayEl = document.getElementById('ai-run-hist-day');
  if (!staffEl && !outEl) return;
  _aiRunHist.staff = jump.staff;
  _aiRunHist.outcome = jump.outcome;
  _aiRunHist.day = jump.day || 'today';
  if (staffEl) staffEl.value = jump.staff;
  if (outEl) outEl.value = jump.outcome;
  if (dayEl) dayEl.value = _aiRunHist.day;
  const custom = document.getElementById('ai-run-hist-custom');
  if (custom) custom.hidden = _aiRunHist.day !== 'custom';
  mbAiRunHistFilter(true);
  const side = document.querySelector('.ai-run-side');
  if (side) {
    side.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    side.classList.add('is-flash');
    setTimeout(() => side.classList.remove('is-flash'), 1400);
  }
  _aiHistJump = null;
}

function mbAiTodayYmd() {
  if (typeof mbBusinessToday === 'function') return mbBusinessToday();
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mbAiAbStore(staffId) {
  const key = `mb_ai_ab_${String(staffId || '')}`;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') raw = { a: { dial: 0, appt: 0 }, b: { dial: 0, appt: 0 }, next: 'a' };
  raw.a = raw.a || { dial: 0, appt: 0 };
  raw.b = raw.b || { dial: 0, appt: 0 };
  raw.next = raw.next === 'b' ? 'b' : 'a';
  return { key, raw };
}

function mbAiAbEnabled(staff) {
  return !!(staff?.ab_on && String(staff.greeting_b || '').trim());
}

function mbAiPickAb(staff) {
  const a = String(staff?.greeting || '').trim();
  const b = String(staff?.greeting_b || '').trim();
  if (!mbAiAbEnabled(staff)) return { variant: '', text: a };
  const { key, raw } = mbAiAbStore(staff.id);
  const variant = raw.next === 'b' ? 'b' : 'a';
  raw.next = variant === 'a' ? 'b' : 'a';
  try { localStorage.setItem(key, JSON.stringify(raw)); } catch (e) {}
  return { variant, text: variant === 'b' ? b : a };
}

function mbAiAbRecord(staffId, variant, appt) {
  if (!staffId || (variant !== 'a' && variant !== 'b')) return;
  const { key, raw } = mbAiAbStore(staffId);
  const bucket = variant === 'b' ? raw.b : raw.a;
  bucket.dial = (Number(bucket.dial) || 0) + 1;
  if (appt) bucket.appt = (Number(bucket.appt) || 0) + 1;
  try { localStorage.setItem(key, JSON.stringify(raw)); } catch (e) {}
}

function mbAiAbScoreHtml(staffId) {
  if (!staffId) return '';
  const { raw } = mbAiAbStore(staffId);
  const ra = raw.a.dial ? Math.round((raw.a.appt / raw.a.dial) * 100) : 0;
  const rb = raw.b.dial ? Math.round((raw.b.appt / raw.b.dial) * 100) : 0;
  return `<div class="ai-ab-score">${mbAiEsc(mbAiSay('ai.staff.ab.score', 'A {a}/{ad} (%{ap}) · B {b}/{bd} (%{bp})')
    .replace('{a}', String(raw.a.appt || 0))
    .replace('{ad}', String(raw.a.dial || 0))
    .replace('{ap}', String(ra))
    .replace('{b}', String(raw.b.appt || 0))
    .replace('{bd}', String(raw.b.dial || 0))
    .replace('{bp}', String(rb)))}</div>`;
}

function mbAiPlacePayload(staff, base) {
  const ab = mbAiPickAb(staff);
  const payload = { ...(base || {}), staff_id: staff.id };
  if (ab.text) payload.greeting = ab.text;
  if (ab.variant) payload.ab = ab.variant;
  return { payload, ab };
}

async function mbAiPlaceForStaff(staff, base, meta) {
  const { payload, ab } = mbAiPlacePayload(staff, base);
  if (meta && ab.variant) meta.ab = ab.variant;
  const res = await mbTelnyxAi('place', payload);
  return { res, ab };
}

async function mbAiCampsMissingSlots(campIds) {
  const ids = (campIds || []).map(String).filter(mbAiUuid);
  if (!ids.length || typeof sb !== 'function') return [];
  const today = mbAiTodayYmd();
  const campQ = ids.map(encodeURIComponent).join(',');
  const rows = await sb(
    `takvim_slots?campaign_id=in.(${campQ})&durum=eq.bos&gun_kapali=eq.false&tarih=gte.${today}&select=campaign_id&limit=800`
  ).catch(() => []) || [];
  const have = new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.campaign_id || '')));
  return ids.filter((id) => !have.has(String(id)));
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
    user_id: mbAiUuid(row.user_id) ? String(row.user_id) : '',
    campaign_ids: campaignIds,
    campaign_id: campaignIds.length === 1 ? campaignIds[0] : '',
    parallel: parallel >= 1 && parallel <= 5 ? parallel : 1,
    auto: row.auto === true,
    retry_min: [15, 30, 60, 120, 240].includes(retry) ? retry : 30,
    greeting: String(row.greeting || '').trim().slice(0, 400),
    greeting_b: String(row.greeting_b || '').trim().slice(0, 400),
    ab_on: row.ab_on === true,
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
    running: row.running === true,
    focus_ids: (() => {
      const allowed = new Set(campaignIds);
      return (Array.isArray(row.focus_ids) ? row.focus_ids : [])
        .map((id) => String(id || ''))
        .filter((id) => mbAiUuid(id) && (!allowed.size || allowed.has(id)))
        .slice(0, 24);
    })(),
  };
}

async function mbAiEnsureOperatorUser(staff, firmId) {
  const fid = firmId || _aiFirmId || mbAiActiveFirmId() || '';
  if (!fid || !staff?.id || typeof sb !== 'function') return '';
  const name = String(staff.name || staff.id).trim().slice(0, 40) || staff.id;
  if (mbAiUuid(staff.user_id)) {
    await sb(`users?id=eq.${staff.user_id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ name, is_active: true, role: 'ai', firm_id: fid }),
    }).catch(() => null);
    return staff.user_id;
  }
  const firmKey = String(fid).replace(/-/g, '').slice(0, 12);
  const email = `ai.${String(staff.id).toLowerCase()}.${firmKey}@callin.internal`;
  const found = await sb(`users?email=eq.${encodeURIComponent(email)}&select=id&limit=1`).catch(() => []) || [];
  if (mbAiUuid(found[0]?.id)) {
    await sb(`users?id=eq.${found[0].id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ name, is_active: true, role: 'ai', firm_id: fid }),
    }).catch(() => null);
    return found[0].id;
  }
  const hash = `!ai!${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
  const made = await sb('users', {
    method: 'POST',
    body: JSON.stringify({
      firm_id: fid,
      email,
      name,
      role: 'ai',
      is_active: true,
      password_hash: hash,
    }),
  }).catch(() => null);
  const id = made?.[0]?.id || made?.id || '';
  return mbAiUuid(id) ? id : '';
}

async function mbAiSyncLiveSession(staff, meta) {
  if (!staff?.user_id || typeof upsertAgentSession !== 'function') return;
  const open = meta && !meta.doneAt;
  const payload = {
    agent_id: staff.user_id,
    agent_name: staff.name || staff.id,
    firm_id: _aiFirmId || null,
    status: staff.running ? (open ? 'on_call' : 'ready') : 'offline',
    last_seen: new Date().toISOString(),
    current_contact_name: open ? (meta.name || meta.phone || '') : null,
    current_contact_phone: open ? (meta.phone || '') : null,
    campaign_id: open && mbAiUuid(meta.campId) ? meta.campId : null,
    call_started_at: open ? new Date(meta.at || Date.now()).toISOString() : null,
  };
  await upsertAgentSession(payload).catch(() => null);
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

async function mbCacheAiStaff(firmId, force) {
  window._aiStaffByFirm = window._aiStaffByFirm || {};
  window._aiFirmSettings = window._aiFirmSettings || {};
  window._aiStaffCacheAt = window._aiStaffCacheAt || {};
  if (!firmId || typeof sb !== 'function') return [];
  const at = Number(window._aiStaffCacheAt[firmId]) || 0;
  if (!force && window._aiStaffByFirm[firmId] && window._aiFirmSettings[firmId] && Date.now() - at < 45000) {
    return window._aiStaffByFirm[firmId];
  }
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const settings = rows?.[0]?.settings || {};
  window._aiFirmSettings[firmId] = settings;
  const list = mbAiStaffList(settings);
  window._aiStaffByFirm[firmId] = mbAiResolveEngine(list, settings);
  window._aiStaffCacheAt[firmId] = Date.now();
  return list;
}

function mbAiSalesStaffAll(firmId, campaignId) {
  const list = window._aiStaffByFirm?.[firmId] || [];
  const camp = String(campaignId || '');
  return list.filter((row) => {
    if (row.kind === 'qc') return false;
    const ids = mbAiCampIds(row);
    return !ids.length || !camp || ids.includes(camp);
  });
}

function mbAiSalesStaffPickList(firmId, campaignId) {
  const list = (window._aiStaffByFirm?.[firmId] || []).filter((row) => row.kind !== 'qc');
  const camp = String(campaignId || '');
  if (!camp || !list.length) return list;
  const matched = [];
  const rest = [];
  for (const row of list) {
    const ids = mbAiCampIds(row);
    if (!ids.length || ids.includes(camp)) matched.push(row);
    else rest.push(row);
  }
  return matched.length ? matched.concat(rest) : list;
}

function mbAiSalesStaffFor(firmId, campaignId) {
  return mbAiSalesStaffPickList(firmId, campaignId)[0] || mbAiSalesStaffAll(firmId, campaignId)[0] || null;
}

function mbDialerCallinFirmId() {
  return String(
    (typeof currentContact !== 'undefined' && currentContact?.firm_id)
    || (typeof getActiveFirmId === 'function' && getActiveFirmId())
    || currentUser?.firm_id
    || ''
  );
}

function mbDialerCallinEligible() {
  if (typeof mbIsFirmAdmin === 'function' ? !mbIsFirmAdmin() : !['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '')) {
    return false;
  }
  const contact = typeof currentContact !== 'undefined' ? currentContact : null;
  if (!contact?.id || !String(contact.phone || '').trim()) return false;
  if (typeof _callLineIsLive === 'function' && _callLineIsLive()) return false;
  const firmId = mbDialerCallinFirmId();
  if (!firmId) return false;
  const settings = window._aiFirmSettings?.[firmId];
  if (!settings || !mbAiFirmReady(settings)) return false;
  return mbAiSalesStaffPickList(firmId, contact.campaign_id || '').length > 0;
}

function mbPaintDialerCallin(forceOff) {
  const btn = document.getElementById('btn-callin-dial');
  if (!btn) return;
  const visible = forceOff === true ? false : mbDialerCallinEligible();
  btn.classList.toggle('is-on', visible);
  btn.hidden = !visible;
  btn.disabled = !!window._dialerCallinBusy;
  btn.classList.toggle('is-busy', !!window._dialerCallinBusy);
  const name = typeof ariaName === 'function' ? ariaName() : 'Callin';
  const label = mbAiSay('qc.callin', '{name} arasın').replace('{name}', name);
  const span = document.getElementById('btn-callin-dial-label') || btn.querySelector('span');
  if (span) span.textContent = label;
  btn.title = label;
}

async function mbRefreshDialerCallin() {
  const btn = document.getElementById('btn-callin-dial');
  if (!btn) return;
  if (typeof mbIsFirmAdmin === 'function' ? !mbIsFirmAdmin() : !['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '')) {
    mbPaintDialerCallin(true);
    return;
  }
  const firmId = mbDialerCallinFirmId();
  const contact = typeof currentContact !== 'undefined' ? currentContact : null;
  if (firmId && contact?.id) await mbCacheAiStaff(firmId);
  mbPaintDialerCallin();
}

function mbAskDialerCallin() {
  if (window._dialerCallinBusy) return;
  const contact = typeof currentContact !== 'undefined' ? currentContact : null;
  const firmId = mbDialerCallinFirmId();
  const all = contact ? mbAiSalesStaffPickList(firmId, contact.campaign_id || '') : [];
  const staff = all[0] || null;
  if (!contact?.id || !staff) {
    if (typeof toast === 'function') toast(mbAiSay('dial.callin.none', 'Bu kampanya için randevu personeli yok'), 'warn');
    void mbRefreshDialerCallin();
    return;
  }
  if (!mbAiFirmReady(window._aiFirmSettings?.[firmId] || {})) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.not_ready', 'Önce şirket adı ve dakika fiyatı hazır olsun.'), 'warn');
    return;
  }
  document.getElementById('ai-callin-pop')?.remove();
  const name = typeof ariaName === 'function' ? ariaName() : 'Callin';
  const who = [contact.first_name, contact.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || contact.phone || '—';
  const camp = String(contact.campaign_id || '');
  const staffOpts = all.map((item) => {
    const ids = mbAiCampIds(item);
    const fit = !camp || !ids.length || ids.includes(camp);
    const tag = fit ? '' : ` · ${mbAiSay('dial.callin.other_camp', 'başka kampanya')}`;
    return `<option value="${mbAiEsc(item.id)}">${mbAiEsc(item.name || mbAiSay('ai.staff.sales', 'Randevu'))} · ${mbAiEsc(mbAiStaffEngineLabel(item))}${mbAiEsc(tag)}</option>`;
  }).join('');
  const pop = document.createElement('div');
  pop.id = 'ai-callin-pop';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card" role="dialog" aria-modal="true">
    <div style="font-weight:800;">${mbAiEsc(mbAiSay('dial.callin.ask', '{name}, {who} kişisini arasın mı?').replace('{name}', name).replace('{who}', who))}</div>
    <div style="font-size:12px;color:var(--text-3);line-height:1.45;">${mbAiEsc(mbAiSay('dial.callin.hint', 'İstersen kısa bir not yaz. Onaylayınca Callin bu kişiyi arar; senin hattın meşgul olmaz.'))}</div>
    <label class="form-label" for="ai-callin-staff" style="margin:0;">${mbAiEsc(mbAiSay('dial.callin.staff', 'Hangi agent arasın'))}</label>
    <select id="ai-callin-staff" class="form-input" ${all.length < 2 ? 'disabled' : ''}>${staffOpts}</select>
    <textarea id="ai-callin-note" class="form-input" rows="3" maxlength="800" placeholder="${mbAiEsc(mbAiSay('dial.callin.note_ph', 'Opsiyonel not…'))}"></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="qcCloseCallin()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbConfirmDialerCallin('${mbAiEsc(contact.id)}','${mbAiEsc(staff.id)}',true)">${mbAiEsc(mbAiSay('dial.callin.direct', 'Direkt arasın'))}</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="mbConfirmDialerCallin('${mbAiEsc(contact.id)}','${mbAiEsc(staff.id)}',false)">${mbAiEsc(mbAiSay('dial.callin.note', 'Bu notla arasın'))}</button>
    </div>
  </div>`;
  document.body.appendChild(pop);
}

async function mbConfirmDialerCallin(contactId, staffId, direct) {
  const note = direct ? '' : String(document.getElementById('ai-callin-note')?.value || '').trim().slice(0, 800);
  const picked = String(document.getElementById('ai-callin-staff')?.value || '') || staffId;
  if (typeof qcCloseCallin === 'function') qcCloseCallin();
  else document.getElementById('ai-callin-pop')?.remove();
  if (!contactId || !picked || window._dialerCallinBusy) return;
  window._dialerCallinBusy = contactId;
  mbPaintDialerCallin();
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.placing', 'Aranıyor. Hat açılınca konuşma başlar.'), 'ok');
  const res = await mbTelnyxAi('place', { contact_id: contactId, staff_id: picked, note });
  if (!res?.ok || !res.appointment_id) {
    window._dialerCallinBusy = '';
    mbPaintDialerCallin();
    const key = { gate: 'qc.callin.gate', results: 'qc.callin.gate', phone: 'qc.callin.phone', busy: 'qc.callin.busy', nokey_el: 'qc.callin.nokey_el' }[res?.error] || 'qc.callin.fail';
    const why = String(res?.detail || '').slice(0, 220);
    if (typeof callinDeskPushError === 'function') {
      callinDeskPushError({
        staffId: picked,
        staffName: (window._aiStaffByFirm?.[mbDialerCallinFirmId()] || []).find((row) => String(row.id) === String(picked))?.name || '',
        who: typeof currentContact !== 'undefined' ? [currentContact?.first_name, currentContact?.last_name].filter(Boolean).join(' ') : '',
        phone: typeof currentContact !== 'undefined' ? currentContact?.phone : '',
        contactId,
        code: res?.error || 'fail',
        detail: why,
      });
    }
    if (typeof toast === 'function') toast(mbAiSay(key, 'Arama çıkmadı.') + (why ? ` (${why})` : ''), 'err');
    return;
  }
  if (typeof toast === 'function') toast(mbAiSay('qc.callin.started', 'Arama çıktı. Karşı taraf açınca konuşma başlar.'), 'ok');
  void mbDialerWatchCallin(res.appointment_id);
}

async function mbDialerWatchCallin(apptId) {
  const started = Date.now();
  try {
    while (Date.now() - started < 12 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const res = await mbTelnyxAi('sync', { appointment_id: apptId });
      if (!res?.ok || !res.done) continue;
      if (typeof toast === 'function') {
        toast(res.phase === 'missed' || !(res.secs > 0)
          ? mbAiSay('qc.callin.noanswer', 'Arama açılmadı.')
          : mbAiSay('qc.callin.done', 'Arama bitti.'), res.secs > 0 ? 'ok' : 'warn');
      }
      break;
    }
  } finally {
    window._dialerCallinBusy = '';
    mbPaintDialerCallin();
  }
}

function callinTab(name) {
  const tab = name === 'staff' || name === 'run' ? name : 'auto';
  document.querySelectorAll('.callin-tab').forEach((btn) => {
    const on = btn.dataset.callin === tab;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const desc = document.getElementById('callin-tab-desc');
  if (desc) {
    const key = `callin.tab.${tab}.desc`;
    const fallback = {
      auto: 'Boş güne kampanya seçer, sıra azalınca kişi yükler. Randevu alta inince yer açar.',
      staff: 'Randevu ve kalite YZ’lerini burada kurarsın: ses, dil, talimat ve kampanya izni.',
      run: 'Kurulu personeli çalıştırır. Bugün hangi kampanyada arayacağını ve açık hatları buradan yönetirsin.',
    }[tab] || '';
    const text = mbAiSay(key, fallback);
    desc.textContent = text;
    const deMap = {
      auto: 'Wählt die Kampagne am freien Tag, füllt die Reihe nach und öffnet einen Platz, wenn ein Termin nach unten geht.',
      staff: 'Hier legst du Termin- und Qualitäts-KI an: Stimme, Sprache, Anweisung und Kampagnen-Erlaubnis.',
      run: 'Startet das eingerichtete Personal. Hier steuerst du, in welcher Kampagne es heute anruft und welche Leitungen offen sind.',
    };
    desc.setAttribute('data-tr', fallback);
    desc.setAttribute('data-de', deMap[tab] || '');
  }
  const auto = document.getElementById('callin-pane-auto');
  const pane = document.getElementById('callin-pane-staff');
  const run = document.getElementById('callin-pane-run');
  if (auto) auto.hidden = tab !== 'auto';
  if (pane) pane.hidden = tab !== 'staff';
  if (run) run.hidden = tab !== 'run';
  if (tab !== 'run') mbAiStopRunLoop();
  if (tab === 'staff' || tab === 'run') void mbLoadAiStaff(tab);
  if (typeof callinDeskStart === 'function') callinDeskStart();
  if (typeof callinDeskPaint === 'function') callinDeskPaint();
}

async function mbLoadAiStaff(tab) {
  const wantRun = tab === 'run';
  const root = document.getElementById(wantRun ? 'ai-run-root' : 'ai-staff-root');
  const pane = document.getElementById(wantRun ? 'callin-pane-run' : 'callin-pane-staff');
  if (!root || !pane || pane.hidden || typeof sb !== 'function') return;
  const gen = (_aiDesk?.gen || 0) + 1;
  _aiDesk = { gen, firms: [], camps: [], results: [], settings: {}, staff: [], view: wantRun ? 'run' : 'staff', loading: true };
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

function mbAiActiveFirmId() {
  if (_aiFirmId) return _aiFirmId;
  const active = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
  return active || currentUser?.firm_id || '';
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
  window._aiFirmSettings = window._aiFirmSettings || {};
  if (_aiFirmId) {
    window._aiStaffByFirm[_aiFirmId] = mbAiResolveEngine(_aiDesk.staff, _aiDesk.settings);
    window._aiFirmSettings[_aiFirmId] = _aiDesk.settings || {};
    window._aiStaffCacheAt = window._aiStaffCacheAt || {};
    window._aiStaffCacheAt[_aiFirmId] = Date.now();
  }
  _aiDesk.loading = false;
  if (_aiDesk.view === 'run') {
    mbPaintAiRun();
    mbAiStartRunLoop();
  } else mbPaintAiStaff();
  if (typeof callinDeskPaint === 'function') {
    try { callinDeskPaint(); } catch (_) {}
  }
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
      day_min_cap: (() => {
        const n = Number(document.getElementById('ai-daycap')?.value);
        return Number.isFinite(n) && n > 0 ? Math.min(1440, Math.round(n)) : 0;
      })(),
      qc_after: (() => {
        const v = String(document.getElementById('ai-qcafter')?.value || 'off');
        return ['now', '5', '15', '30'].includes(v) ? v : 'off';
      })(),
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
      greeting_b: mbAiRichValue(document.getElementById(`ai-greetb-${row.id}`)),
      ab_on: !!document.getElementById(`ai-abon-${row.id}`)?.checked,
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
  const name = String(document.getElementById(`ai-name-${id}`)?.value || '').trim();
  const ask = mbAiSay('ai.staff.remove_ask', '«{name}» silinsin mi? Kart kalkar.').replace('{name}', name || mbAiSay('ai.staff.name', 'Personel'));
  if (!window.confirm(ask)) return;
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
  if (_aiDesk?.view !== 'run') mbAiReadDesk();
  _aiFirmId = String(id || '');
  const gen = (_aiDesk?.gen || 0) + 1;
  if (_aiDesk) _aiDesk.gen = gen;
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

function mbAiCopyToCamp(id) {
  mbAiReadDesk();
  if (!_aiDesk) return;
  if (_aiDesk.staff.length >= 8) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_full', 'En fazla 8 personel.'), 'err');
    return;
  }
  const src = _aiDesk.staff.find((row) => row.id === id);
  if (!src) return;
  const camps = _aiDesk.camps || [];
  if (!camps.length) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.wiz.nocamp', 'Kampanya yok — sonra ekleyebilirsin.'), 'warn');
    return;
  }
  document.getElementById('ai-copy-camp')?.remove();
  const opts = camps.map((camp) => `<label class="ai-wiz-check"><input type="checkbox" value="${mbAiEsc(camp.id)}"> ${mbAiEsc(camp.name || '')}</label>`).join('');
  const pop = document.createElement('div');
  pop.id = 'ai-copy-camp';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card ai-wiz-card" role="dialog" aria-modal="true">
    <div class="ai-wiz-hd">
      <b>${mbAiEsc(mbAiSay('ai.staff.copy_camp.title', 'Kopyala → kampanya'))}</b>
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('ai-copy-camp')?.remove()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
    </div>
    <p class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.copy_camp.hint', '«{name}» kopyası seçtiğin kampanyalarda çalışır.').replace('{name}', src.name || ''))}</p>
    <div class="ai-wiz-camps">${opts}</div>
    <div class="ai-wiz-foot">
      <button type="button" class="btn btn-primary" onclick="mbAiCopyToCampDone('${mbAiEsc(id)}')">${mbAiEsc(mbAiSay('ai.staff.copy_camp.done', 'Kopyala'))}</button>
    </div>
  </div>`;
  pop.addEventListener('click', (event) => { if (event.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

function mbAiCopyToCampDone(id) {
  mbAiReadDesk();
  if (!_aiDesk) return;
  const src = _aiDesk.staff.find((row) => row.id === id);
  if (!src) return;
  const campIds = [...document.querySelectorAll('#ai-copy-camp input[type="checkbox"]:checked')].map((el) => el.value).filter(mbAiUuid);
  document.getElementById('ai-copy-camp')?.remove();
  if (!campIds.length) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_camp.need', 'En az bir kampanya seç.'), 'warn');
    return;
  }
  if (_aiDesk.staff.length >= 8) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_full', 'En fazla 8 personel.'), 'err');
    return;
  }
  const campName = (_aiDesk.camps || []).find((camp) => String(camp.id) === String(campIds[0]))?.name || '';
  const suffix = campIds.length === 1 && campName
    ? campName.slice(0, 16)
    : mbAiSay('ai.staff.copy_suffix', 'kopya');
  const copy = mbAiStaffNorm({
    ...src,
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `${String(src.name || '').replace(/\s+kopya$/i, '').trim()} ${suffix}`.trim().slice(0, 40),
    campaign_ids: campIds,
    focus_ids: campIds,
    running: false,
  });
  if (!copy) return;
  const at = _aiDesk.staff.findIndex((row) => row.id === id);
  _aiDesk.staff.splice(at + 1, 0, copy);
  _aiOpen.add(copy.id);
  mbPaintAiStaff();
  if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_camp.ok', 'Kopya hazır. Kaydetmeyi unutma.'), 'ok');
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

function mbAiAllowedCamps(row) {
  const ids = mbAiCampIds(row);
  const camps = _aiDesk?.camps || [];
  if (!ids.length) return camps;
  const want = new Set(ids);
  return camps.filter((camp) => want.has(camp.id));
}

function mbAiParallelBlock(row) {
  const id = mbAiEsc(row.id);
  const n = Number(row.parallel) || 1;
  return `<div class="ai-sec">
    <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.parallel', 'Aynı anda kaç kişi'))}</div>
    <select class="form-input ai-narrow" id="ai-parallel-${id}">${[1, 2, 3, 4, 5].map((v) => `<option value="${v}"${n === v ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.parallel_hint', 'Kampanya hızı burada yok. 5 dersen bu personel aynı anda 5 kişi arar. İnsan dialer havuzu kullanılmaz.'))}</div>
  </div>`;
}

function mbAiCampName(id) {
  return (_aiDesk?.camps || []).find((camp) => String(camp.id) === String(id))?.name || '';
}

function mbAiRunPhaseLabel(phase) {
  return {
    ringing: mbAiSay('ai.run.phase.ring', 'Arıyor'),
    talking: mbAiSay('ai.run.phase.talk', 'Konuşuyor'),
    talked: mbAiSay('ai.run.phase.done', 'Bitti'),
    missed: mbAiSay('ai.run.phase.miss', 'Açılmadı'),
  }[phase] || mbAiSay('ai.run.phase.ring', 'Arıyor');
}

function mbAiRunResultLabel(row) {
  if (!row?.doneAt && !row?.forceResult) return '';
  const outcome = String(row.outcome || '').toLowerCase();
  const durum = String(row.durum || '').toLowerCase();
  const err = String(row.error || '');
  const when = String(row.termin || '').trim();
  const whenShort = when.length >= 16 ? `${when.slice(0, 10)} ${when.slice(11, 16)}` : when.slice(0, 16);
  if (err === 'noanswer' || outcome === 'no_answer' || row.phase === 'missed') {
    return mbAiSay('ai.run.result.no_answer', 'Cevapsız');
  }
  if (err && err !== 'noanswer') {
    return mbAiSay('ai.run.result.fail', 'Başarısız — {why}').replace('{why}', err);
  }
  if (outcome === 'appointment' || durum === 'qc_bekleniyor' || durum === 'appointment') {
    return whenShort
      ? mbAiSay('ai.run.result.appt_when', 'Başarılı — {when} randevu').replace('{when}', whenShort)
      : mbAiSay('ai.run.result.appt', 'Başarılı — randevu');
  }
  if (outcome === 'negative' || durum === 'negative' || durum === 'basarisiz') {
    return mbAiSay('ai.run.result.neg', 'Olumsuz');
  }
  if (outcome === 'callback' || durum === 'callback' || durum === 'beklemede') {
    return mbAiSay('ai.run.result.cb', 'Geri arama');
  }
  if (outcome === 'voicemail' || durum === 'voicemail') {
    return mbAiSay('ai.run.result.vm', 'Telesekreter');
  }
  if (outcome === 'dnc' || durum === 'dnc') {
    return mbAiSay('ai.run.result.dnc', 'Kara liste');
  }
  if (outcome === 'basarili' || durum === 'basarili') {
    return mbAiSay('ai.run.result.ok', 'Başarılı');
  }
  if (outcome === 'ulasilamadi' || durum === 'ulasilamadi') {
    return mbAiSay('ai.run.result.reach', 'Ulaşılamadı');
  }
  if (row.secs > 0) {
    const note = `${row.summary || ''} ${row.qc_notu || ''}`;
    if (/randevu|termin|appointment/i.test(note)) return mbAiSay('ai.run.result.appt', 'Başarılı — randevu');
    return mbAiSay('ai.run.result.talked', 'Konuşuldu');
  }
  return mbAiSay('ai.run.phase.done', 'Bitti');
}

function mbAiRunTone(row) {
  if (!row?.doneAt) return row?.phase === 'talking' ? 'is-talk' : 'is-ring';
  const outcome = String(row.outcome || '').toLowerCase();
  const durum = String(row.durum || '').toLowerCase();
  if (row.phase === 'missed' || outcome === 'no_answer' || outcome === 'ulasilamadi' || durum === 'ulasilamadi' || row.error === 'noanswer') return 'is-miss';
  if (outcome === 'appointment' || durum === 'qc_bekleniyor' || durum === 'appointment' || outcome === 'basarili' || durum === 'basarili') return 'is-ok';
  if (outcome === 'negative' || durum === 'negative' || durum === 'basarisiz' || outcome === 'dnc' || durum === 'dnc') return 'is-neg';
  if (outcome === 'callback' || durum === 'callback' || durum === 'beklemede' || outcome === 'voicemail') return 'is-cb';
  if (row.error) return 'is-miss';
  if (row.secs > 0) return 'is-ok';
  return 'is-miss';
}

function mbAiRunSlotDetail(row) {
  const note = String(row.summary || row.qc_notu || '').trim();
  const script = String(row.transcript || '').trim();
  const noteHtml = note ? `<div class="qc-callin-note">${mbAiEsc(note.slice(0, 500))}</div>` : '';
  const scriptHtml = script
    ? `<details class="qc-callin-script"><summary>${mbAiEsc(mbAiSay('qc.callin.transcript', 'Konuşma'))}</summary>${mbAiEsc(script.slice(0, 2500))}</details>`
    : '';
  const rec = row.recording && typeof mbRecPlayerHtml === 'function'
    ? `<div class="ai-run-rec">${mbRecPlayerHtml(row.logId || row.key || row.id || 'ai', row.recording, row.secs || 0, { name: row.name || '', phone: row.phone || '', at: row.startedAt || '' })}</div>`
    : '';
  if (!noteHtml && !scriptHtml && !rec) return '';
  return `<div class="ai-run-slot-detail">${noteHtml}${scriptHtml}${rec}</div>`;
}

function mbAiRunSlotHtml(row) {
  const tone = mbAiRunTone(row);
  const who = row.name || row.phone || '—';
  const camp = row.camp ? `<span class="ai-run-camp">${mbAiEsc(row.camp)}</span>` : '';
  const phone = row.phone ? `<span class="ai-run-phone">${mbAiEsc(row.phone)}</span>` : '';
  const secs = row.secs > 0 ? `<span class="ai-run-secs">${mbAiEsc(String(row.secs))}s</span>` : '';
  const result = mbAiRunResultLabel(row);
  const phase = result
    ? `<span class="ai-run-phase">${mbAiEsc(result)}</span>`
    : `<span class="ai-run-phase">${mbAiEsc(mbAiRunPhaseLabel(row.phase))}</span>`;
  const liveBtn = !row.doneAt
    ? `<button type="button" class="btn btn-ghost btn-sm ai-run-live-go" onclick="event.stopPropagation(); mbAiGoLiveFocus()">${mbAiEsc(mbAiSay('callin.desk.live', 'Canlıya git'))}</button>`
    : '';
  const snip = !row.doneAt ? mbAiTranscriptSnippet(row.transcript) : '';
  const snipHtml = snip ? `<div class="ai-run-snip">${mbAiEsc(snip)}</div>` : '';
  const head = `<div class="ai-run-slot-top">
      <div class="ai-run-slot-main">
        <b>${mbAiEsc(who)}</b>
        ${camp}${phone}
      </div>
      <div class="ai-run-slot-meta">${phase}${secs}${liveBtn}</div>
    </div>`;
  const detail = row.doneAt ? mbAiRunSlotDetail(row) : '';
  if (row.doneAt && detail) {
    return `<details class="ai-run-slot ${tone}">
      <summary>${head}</summary>
      ${detail}
    </details>`;
  }
  return `<div class="ai-run-slot ${tone}">${head}${snipHtml}${row.doneAt ? '' : mbAiRunSlotDetail(row)}</div>`;
}

function mbAiGoLiveFocus() {
  try { sessionStorage.setItem('mb_live_focus_ai', '1'); } catch (e) {}
  if (typeof navigate === 'function') navigate('supervisor');
}

function mbAiRunLiveRows(staffId) {
  const now = Date.now();
  const rows = (_aiRunLive[staffId] || []).filter((row) => {
    if (!row.doneAt) return true;
    return now - row.doneAt < 180000;
  });
  _aiRunLive[staffId] = rows;
  return rows;
}

function mbAiRunEndedAlert(staff, meta) {
  if (!meta) return;
  const who = meta.name || meta.phone || '—';
  const staffName = staff?.name || mbAiSay('ai.run.kicker', 'YZ');
  const result = mbAiRunResultLabel({ ...meta, doneAt: meta.doneAt || Date.now(), forceResult: true });
  const miss = meta.phase === 'missed' || !(meta.secs > 0) || meta.error === 'noanswer';
  const out = String(meta.outcome || meta.durum || '').toLowerCase();
  const appt = !miss && (['appointment', 'basarili', 'qc_bekleniyor'].includes(out)
    || /randevu|termin|appointment/i.test(String(meta.summary || '')));
  if (meta.ab) mbAiAbRecord(staff?.id || meta.staffId, meta.ab, appt);
  if (typeof toast === 'function') {
    if (miss) {
      toast(mbAiSay('ai.run.ended.miss', '{staff}: hat bitti — {who} açılmadı.')
        .replace('{staff}', staffName)
        .replace('{who}', who), 'warn');
    } else {
      toast(mbAiSay('ai.run.ended.ok', '{staff}: hat bitti — {result} ({who})')
        .replace('{staff}', staffName)
        .replace('{result}', result)
        .replace('{who}', who), 'ok');
    }
  }
  if (appt && staff?.kind !== 'qc' && meta.apptId) void mbAiQcHandoff(meta);
}

function mbAiPickQcStaff(campId) {
  const list = (_aiDesk?.staff || []).filter((row) => row.kind === 'qc');
  if (!list.length) return null;
  const camp = String(campId || '');
  const fit = list.find((row) => {
    const ids = mbAiCampIds(row);
    return !ids.length || !camp || ids.includes(camp);
  });
  return fit || list[0];
}

async function mbAiQcHandoff(meta) {
  const mode = mbAiQcAfterMode(_aiDesk?.settings);
  if (mode === 'off' || !meta?.apptId) return;
  const qc = mbAiPickQcStaff(meta.campId);
  if (!qc) return;
  const wait = mode === 'now' ? 0 : Math.max(1, Number(mode) || 0);
  const run = async () => {
    if (typeof toast === 'function') {
      toast(mbAiSay('ai.run.qc_hand', 'Kalite sıraya alındı: {name} → {who}')
        .replace('{name}', qc.name || 'QC')
        .replace('{who}', meta.name || meta.phone || '—'), 'ok');
    }
    if (!qc.running) {
      qc.running = true;
      mbAiClearStopWhy(qc.id);
      const el = document.getElementById(`ai-run-${qc.id}`);
      if (el) el.checked = true;
      await mbAiPersistRun();
    }
    await mbAiRunOneQc(qc);
  };
  if (!wait) {
    void run();
    return;
  }
  setTimeout(() => { void run(); }, wait * 60000);
}

function mbAiPushRunRecent(staff, meta) {
  if (!meta) return;
  const row = {
    id: meta.logId || meta.key || `${staff?.id || 'ai'}-${meta.at || Date.now()}`,
    key: meta.key || '',
    staffId: staff?.id || meta.staffId || '',
    staffName: staff?.name || meta.staffName || '',
    name: meta.name || '',
    phone: meta.phone || '',
    camp: meta.camp || '',
    campId: meta.campId || '',
    outcome: meta.outcome || '',
    durum: meta.durum || '',
    phase: meta.phase || '',
    secs: Number(meta.secs) || 0,
    summary: meta.summary || meta.qc_notu || '',
    transcript: meta.transcript || '',
    recording: meta.recording || '',
    termin: meta.termin || '',
    error: meta.error || '',
    startedAt: meta.startedAt || new Date(meta.at || Date.now()).toISOString(),
    doneAt: meta.doneAt || Date.now(),
    forceResult: true,
  };
  const idx = _aiRunRecent.findIndex((item) => String(item.key || item.id) === String(row.key || row.id));
  if (idx >= 0) _aiRunRecent.splice(idx, 1);
  _aiRunRecent.unshift(row);
  if (_aiRunRecent.length > 80) _aiRunRecent.length = 80;
  mbAiPaintRunHist();
}

function mbAiHistDayBounds(day, from, to) {
  const mode = String(day || '7');
  const startOf = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOf = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const now = new Date();
  if (mode === 'today') return { from: startOf(now), to: endOf(now) };
  if (mode === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOf(y), to: endOf(y) };
  }
  if (mode === 'custom') {
    const a = from ? startOf(from) : null;
    const b = to ? endOf(to) : null;
    return { from: a, to: b };
  }
  if (mode === 'all') return { from: null, to: null };
  const days = mode === '30' ? 30 : 7;
  const a = startOf(now);
  a.setDate(a.getDate() - (days - 1));
  return { from: a, to: endOf(now) };
}

function mbAiHistRows() {
  const staff = String(_aiRunHist.staff || '');
  const outcome = String(_aiRunHist.outcome || '');
  const q = String(_aiRunHist.q || '').trim().toLowerCase();
  const bounds = mbAiHistDayBounds(_aiRunHist.day, _aiRunHist.from, _aiRunHist.to);
  let rows = _aiRunRecent.slice();
  if (staff) rows = rows.filter((row) => String(row.staffId) === staff);
  if (outcome) {
    rows = rows.filter((row) => {
      const key = String(row.outcome || row.durum || '').toLowerCase();
      if (outcome === 'ok') return ['appointment', 'basarili', 'qc_bekleniyor'].includes(key) || (row.secs > 0 && row.phase === 'talked' && !key);
      if (outcome === 'miss') return ['no_answer', 'ulasilamadi'].includes(key) || row.phase === 'missed';
      if (outcome === 'vm') return key === 'voicemail';
      if (outcome === 'neg') return ['negative', 'basarisiz', 'dnc'].includes(key);
      if (outcome === 'cb') return ['callback', 'geri_arama', 'wiedervorlage', 'beklemede'].includes(key);
      return true;
    });
  }
  if (bounds.from || bounds.to) {
    rows = rows.filter((row) => {
      const at = Date.parse(row.startedAt || '') || Number(row.doneAt) || 0;
      if (!at) return false;
      if (bounds.from && at < bounds.from.getTime()) return false;
      if (bounds.to && at > bounds.to.getTime()) return false;
      return true;
    });
  }
  if (q) {
    rows = rows.filter((row) => [row.name, row.phone, row.camp, row.staffName, row.summary]
      .join(' ')
      .toLowerCase()
      .includes(q));
  }
  const sort = String(_aiRunHist.sort || 'new');
  rows.sort((a, b) => {
    if (sort === 'old') return (a.doneAt || 0) - (b.doneAt || 0);
    if (sort === 'long') return (b.secs || 0) - (a.secs || 0);
    if (sort === 'short') return (a.secs || 0) - (b.secs || 0);
    return (b.doneAt || 0) - (a.doneAt || 0);
  });
  return rows;
}

function mbAiHistOutcomeBadge(row) {
  const tone = mbAiRunTone(row);
  const label = mbAiRunResultLabel(row) || '—';
  const cls = tone === 'is-ok' || tone === 'is-talk' ? 'badge-green'
    : (tone === 'is-miss' || tone === 'is-neg' ? 'badge-red'
      : (tone === 'is-cb' ? 'badge-yellow' : 'badge-gray'));
  return `<span class="badge ${cls}">${mbAiEsc(label)}</span>`;
}

function mbAiHistRecHtml(row) {
  if (row.recording && typeof mbRecPlayerHtml === 'function') {
    return mbRecPlayerHtml(row.logId || row.key || row.id || 'ai', row.recording, row.secs || 0, {
      name: row.name || '',
      phone: row.phone || '',
      at: row.startedAt || '',
    });
  }
  return `<span style="color:var(--text-3);font-size:11px;">—</span>`;
}

function mbAiPaintRunHist() {
  const box = document.getElementById('ai-run-hist');
  if (!box) return;
  const rows = mbAiHistRows();
  if (_aiRunHist.loading && !rows.length) {
    box.innerHTML = `<div class="ai-run-empty">${mbAiEsc(mbAiSay('ui.loading', 'Yükleniyor…'))}</div>`;
    return;
  }
  if (!rows.length) {
    box.innerHTML = `<div class="ai-run-empty">${mbAiEsc(mbAiSay('ai.run.hist.empty', 'Henüz YZ araması yok.'))}</div>`;
    return;
  }
  const head = `<thead><tr>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.time', 'Zaman'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.who', 'Müşteri'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.phone', 'Numara'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.camp', 'Kampanya'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.dur', 'Süre'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.rec', 'Kayıt'))}</th>
    <th>${mbAiEsc(mbAiSay('ai.run.hist.col.out', 'Sonuç'))}</th>
  </tr></thead>`;
  const body = rows.map((row) => {
    const when = row.startedAt
      ? new Date(row.startedAt).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';
    const sec = Number(row.secs) || 0;
    const dur = sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '—';
    const note = String(row.summary || row.qc_notu || '').trim();
    const script = String(row.transcript || '').trim();
    const talk = note || script
      ? `<details class="ai-run-hist-talk"><summary>${mbAiEsc(mbAiSay('qc.callin.transcript', 'Konuşma'))}</summary>
          ${note ? `<div class="qc-callin-note">${mbAiEsc(note.slice(0, 600))}</div>` : ''}
          ${script ? `<div class="qc-callin-note">${mbAiEsc(script.slice(0, 2500))}</div>` : ''}
        </details>`
      : '';
    const staff = row.staffName ? `<div class="ai-run-hist-staff">${typeof mbAiMarkHtml === 'function' ? mbAiMarkHtml() : ''}${mbAiEsc(row.staffName)}</div>` : '';
    return `<tr class="${mbAiRunTone(row)}">
      <td class="td-mono" style="font-size:11px;">${mbAiEsc(when)}</td>
      <td style="font-weight:600;">${mbAiEsc(row.name || row.phone || '—')}${staff}${talk}</td>
      <td class="td-mono" style="font-size:11px;">${mbAiEsc(row.phone || '—')}</td>
      <td style="font-size:11px;">${mbAiEsc(row.camp || '—')}</td>
      <td class="td-mono" style="font-size:11px;">${mbAiEsc(dur)}</td>
      <td>${mbAiHistRecHtml(row)}</td>
      <td>${mbAiHistOutcomeBadge(row)}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="ai-run-hist-scroll"><table class="ai-run-hist-table">${head}<tbody>${body}</tbody></table></div>`;
}

function mbAiRunHistFilter(reload) {
  const prevDay = _aiRunHist.day;
  const prevFrom = _aiRunHist.from;
  const prevTo = _aiRunHist.to;
  _aiRunHist.staff = document.getElementById('ai-run-hist-staff')?.value || '';
  _aiRunHist.outcome = document.getElementById('ai-run-hist-out')?.value || '';
  _aiRunHist.sort = document.getElementById('ai-run-hist-sort')?.value || 'new';
  _aiRunHist.q = document.getElementById('ai-run-hist-q')?.value || '';
  _aiRunHist.day = document.getElementById('ai-run-hist-day')?.value || '7';
  _aiRunHist.from = document.getElementById('ai-run-hist-from')?.value || '';
  _aiRunHist.to = document.getElementById('ai-run-hist-to')?.value || '';
  const custom = document.getElementById('ai-run-hist-custom');
  if (custom) custom.hidden = _aiRunHist.day !== 'custom';
  const dateChanged = reload
    || prevDay !== _aiRunHist.day
    || prevFrom !== _aiRunHist.from
    || prevTo !== _aiRunHist.to;
  if (dateChanged) void mbAiLoadRunHist();
  else mbAiPaintRunHist();
}

async function mbAiLoadRunHist() {
  if (!_aiFirmId || typeof sb !== 'function') return;
  _aiRunHist.loading = true;
  mbAiPaintRunHist();
  const staffById = new Map((_aiDesk?.staff || []).map((row) => [String(row.id), row]));
  const bounds = mbAiHistDayBounds(_aiRunHist.day, _aiRunHist.from, _aiRunHist.to);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const gte = bounds.from ? (typeof mbInstantGte === 'function' ? mbInstantGte(ymd(bounds.from)) : bounds.from.toISOString()) : '';
  const lte = bounds.to ? (typeof mbInstantLte === 'function' ? mbInstantLte(ymd(bounds.to)) : bounds.to.toISOString()) : '';
  let path = `call_logs?firm_id=eq.${_aiFirmId}&or=(work_type.eq.ai_sales,work_type.eq.ai_qc,ai_staff_id.not.is.null)&select=id,started_at,phone,outcome,duration_sec,notes,recording_url,operator_name,ai_staff_id,work_type,campaign_id,campaigns(name),contacts(first_name,last_name)&order=started_at.desc&limit=120`;
  if (gte) path += `&started_at=gte.${encodeURIComponent(gte)}`;
  if (lte) path += `&started_at=lte.${encodeURIComponent(lte)}`;
  const rows = await sb(path).catch(() => []) || [];
  const mapped = rows.map((log) => {
    const contact = Array.isArray(log.contacts) ? log.contacts[0] : log.contacts;
    const person = [contact?.first_name, contact?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    const notes = String(log.notes || '');
    const summary = notes.split(/\n\n/)[0] || '';
    const transcript = notes.includes('\n\n') ? notes.slice(summary.length).trim() : '';
    const staff = staffById.get(String(log.ai_staff_id || '')) || null;
    return {
      id: log.id,
      key: `log:${log.id}`,
      logId: log.id,
      staffId: log.ai_staff_id || '',
      staffName: staff?.name || log.operator_name || '',
      name: person || log.phone || '—',
      phone: log.phone || '',
      camp: log.campaigns?.name || mbAiCampName(log.campaign_id),
      campId: log.campaign_id || '',
      outcome: log.outcome || '',
      phase: Number(log.duration_sec) > 0 ? 'talked' : 'missed',
      secs: Number(log.duration_sec) || 0,
      summary,
      transcript,
      recording: log.recording_url || '',
      startedAt: log.started_at || '',
      doneAt: Date.parse(log.started_at || '') || Date.now(),
      forceResult: true,
    };
  });
  const freshLocal = _aiRunRecent.filter((row) => {
    if (String(row.key || '').startsWith('log:')) return false;
    if (Date.now() - (row.doneAt || 0) > 10 * 60 * 1000) return false;
    return !mapped.some((log) => log.phone && row.phone && String(log.phone) === String(row.phone)
      && Math.abs((Date.parse(log.startedAt || '') || 0) - (row.at || row.doneAt || 0)) < 5 * 60 * 1000);
  });
  _aiRunRecent.length = 0;
  [...freshLocal, ...mapped].forEach((row) => _aiRunRecent.push(row));
  _aiRunHist.loading = false;
  mbAiPaintRunHist();
}

function mbAiPaintRunLive(staffId) {
  const staff = (_aiDesk?.staff || []).find((row) => String(row.id) === String(staffId));
  const cap = document.getElementById(`ai-run-cap-${staffId}`);
  const box = document.getElementById(`ai-run-calls-${staffId}`);
  const live = document.getElementById(`ai-run-live-${staffId}`);
  if (typeof callinDeskPaint === 'function' && document.getElementById('page-tour')?.classList.contains('active')) {
    try { callinDeskPaint(); } catch (_) {}
  }
  if (!staff) return;
  const max = Math.max(1, Number(staff.parallel) || 1);
  const rows = mbAiRunLiveRows(staffId);
  const open = rows.filter((row) => !row.doneAt).length;
  if (cap) {
    cap.textContent = staff.running
      ? mbAiSay('ai.run.cap', '{open} / {max} hat').replace('{open}', String(open)).replace('{max}', String(max))
      : mbAiSay('ai.run.idle', 'Duruyor.');
    cap.classList.toggle('is-on', !!staff.running);
  }
  if (live) {
    const why = !staff.running ? mbAiStopWhyLabel(staff.id) : '';
    live.innerHTML = staff.running
      ? mbAiEsc(mbAiSay('ai.run.rule', 'Kampanya hızı yok. Bu personel kendi {max} hattında arar; havuz yok.').replace('{max}', String(max)))
      : (why
        ? `<span class="ai-run-why">${mbAiEsc(why)}</span>`
        : mbAiEsc(mbAiSay('ai.run.idle_hint', 'Çalışsın deyince seçili kampanyalardan sıradaki kişiyi arar.')));
  }
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = `<div class="ai-run-empty">${mbAiEsc(staff.running
      ? mbAiSay('ai.run.waiting', 'Sıradaki kişiyi arıyor…')
      : mbAiSay('ai.run.none', 'Şu an açık arama yok.'))}</div>`;
    return;
  }
  box.innerHTML = rows.map((row) => mbAiRunSlotHtml(row)).join('');
}

function mbPaintAiRun() {
  const root = document.getElementById('ai-run-root');
  if (!root || !_aiDesk) return;
  const mode = mbAiRunMode(_aiDesk.settings);
  const firms = _aiDesk.firms || [];
  const firmPick = firms.length > 1
    ? `<div class="ai-field is-wide"><label for="ai-run-firm">${mbAiEsc(mbAiSay('ai.staff.firm', 'Firma'))}</label><select class="form-input" id="ai-run-firm" onchange="mbAiFirmPicked(this.value)">${firms.map((row) => `<option value="${mbAiEsc(row.id)}"${String(row.id) === String(_aiFirmId) ? ' selected' : ''}>${mbAiEsc(row.name || '')}</option>`).join('')}</select></div>`
    : '';
  const both = mbAiRunAllowBoth(_aiDesk.settings);
  const modeNote = both
    ? mbAiSay('ai.run.mode.both', 'Süper admin iki yolu da açmış. Bu firmada hangisini kullanacağını sen seçersin.')
    : (mode === 'server'
      ? mbAiSay('ai.run.mode.server', 'Bu firmada Çalışsın sunucuya yazılır. Sayfa açıkken kalite araması çalışır. Kapalıyken tarama sonraki adımda bağlanır.')
      : mbAiSay('ai.run.mode.page', 'Bu firmada yalnız Başlat sayfası açıkken arar. Sayfa veya bilgisayar kapanınca yeni arama çıkmaz.'));
  const modePick = both
    ? `<div class="ai-run-mode-pick" role="group" aria-label="${mbAiEsc(mbAiSay('line.ai.run', 'YZ otomatik arama'))}">
        <button type="button" class="ai-run-mode-btn${mode === 'page' ? ' is-on' : ''}" onclick="mbAiPickRunMode('page')">${mbAiEsc(mbAiSay('line.ai.run.page', 'Sayfa açıkken'))}</button>
        <button type="button" class="ai-run-mode-btn${mode === 'server' ? ' is-on' : ''}" onclick="mbAiPickRunMode('server')">${mbAiEsc(mbAiSay('line.ai.run.server', 'Sunucudan'))}</button>
      </div>`
    : `<div class="ai-run-mode ${mode === 'server' ? 'is-server' : 'is-page'}">${mbAiEsc(mode === 'server' ? mbAiSay('line.ai.run.server', 'Sunucudan') : mbAiSay('line.ai.run.page', 'Sayfa açıkken'))}</div>`;
  const cards = (_aiDesk.staff || []).map((row) => mbAiRunCard(row, mode)).join('');
  const empty = _aiDesk.staff.length ? '' : `<p class="ai-note">${mbAiEsc(mbAiSay('ai.run.empty', 'Önce Personel kur sekmesinden personel ekleyin.'))}</p>`;
  const staffOpts = (_aiDesk.staff || []).map((row) => `<option value="${mbAiEsc(row.id)}"${String(_aiRunHist.staff) === String(row.id) ? ' selected' : ''}>${mbAiEsc(row.name || row.id)}</option>`).join('');
  const anyRun = (_aiDesk.staff || []).some((row) => row.running);
  const stopAll = anyRun
    ? `<button type="button" class="btn btn-ghost btn-sm" onclick="mbAiStopAll()">${mbAiEsc(mbAiSay('callin.desk.stop_all', 'Hepsini durdur'))}</button>`
    : '';
  root.innerHTML = `<div class="ai-run-shell">
  <div class="ai-run">
    <header class="ai-run-hero">
      <div>
        <div class="ai-run-kicker">${mbAiEsc(mbAiSay('ai.run.kicker', 'YZ çalışma'))}</div>
        <h2 class="ai-run-title">${mbAiEsc(mbAiSay('ai.run.title', 'Personeli başlat'))}</h2>
        <p class="ai-note">${mbAiEsc(mbAiSay('ai.run.intro', 'Karttaki kampanyalar çalışabilir listesidir. Burada yalnız bugün yoğunlaşacağın kampanyayı seçersin. Aynı anda kaç kişi, o personelin kendi hattıdır; kampanya hızı yok, havuz yok.'))}</p>
      </div>
      <div class="ai-run-hero-tools">${stopAll}${modePick}</div>
    </header>
    <p class="ai-note ${mode === 'server' && !both ? 'ai-note-warn' : ''}">${mbAiEsc(modeNote)}</p>
    ${firmPick}
    <div class="ai-run-list">${empty}${cards}</div>
  </div>
  <aside class="ai-run-side">
    <header class="ai-run-side-hd">
      <div>
        <div class="ai-run-kicker">${mbAiEsc(mbAiSay('ai.run.hist.kicker', 'Geçmiş'))}</div>
        <h3 class="ai-run-side-title">${mbAiEsc(mbAiSay('ai.run.hist.title', 'Son arananlar'))}</h3>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiLoadRunHist()">${mbAiEsc(mbAiSay('ai.run.hist.refresh', 'Yenile'))}</button>
    </header>
    <div class="ai-run-side-filters">
      <input class="form-input" id="ai-run-hist-q" type="search" value="${mbAiEsc(_aiRunHist.q || '')}" placeholder="${mbAiEsc(mbAiSay('ai.run.hist.search', 'İsim, telefon, not…'))}" oninput="mbAiRunHistFilter()">
      <select class="form-input" id="ai-run-hist-day" onchange="mbAiRunHistFilter(true)">
        <option value="today"${_aiRunHist.day === 'today' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.today', 'Bugün'))}</option>
        <option value="yesterday"${_aiRunHist.day === 'yesterday' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.yesterday', 'Dün'))}</option>
        <option value="7"${_aiRunHist.day === '7' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.7', 'Son 7 gün'))}</option>
        <option value="30"${_aiRunHist.day === '30' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.30', 'Son 30 gün'))}</option>
        <option value="all"${_aiRunHist.day === 'all' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.all', 'Tümü'))}</option>
        <option value="custom"${_aiRunHist.day === 'custom' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.day.custom', 'Tarih seç'))}</option>
      </select>
      <div class="ai-run-hist-custom" id="ai-run-hist-custom"${_aiRunHist.day === 'custom' ? '' : ' hidden'}>
        <input class="form-input" id="ai-run-hist-from" type="date" value="${mbAiEsc(_aiRunHist.from || '')}" onchange="mbAiRunHistFilter(true)">
        <input class="form-input" id="ai-run-hist-to" type="date" value="${mbAiEsc(_aiRunHist.to || '')}" onchange="mbAiRunHistFilter(true)">
      </div>
      <select class="form-input" id="ai-run-hist-staff" onchange="mbAiRunHistFilter()">
        <option value="">${mbAiEsc(mbAiSay('ai.run.hist.all_staff', 'Tüm personel'))}</option>
        ${staffOpts}
      </select>
      <select class="form-input" id="ai-run-hist-out" onchange="mbAiRunHistFilter()">
        <option value=""${ !_aiRunHist.outcome ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.all_out', 'Tüm sonuçlar'))}</option>
        <option value="ok"${_aiRunHist.outcome === 'ok' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.out.ok', 'Başarılı'))}</option>
        <option value="miss"${_aiRunHist.outcome === 'miss' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.out.miss', 'Cevapsız'))}</option>
        <option value="neg"${_aiRunHist.outcome === 'neg' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.out.neg', 'Olumsuz'))}</option>
        <option value="cb"${_aiRunHist.outcome === 'cb' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.out.cb', 'Geri arama'))}</option>
        <option value="vm"${_aiRunHist.outcome === 'vm' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.out.vm', 'Telesekreter'))}</option>
      </select>
      <select class="form-input" id="ai-run-hist-sort" onchange="mbAiRunHistFilter()">
        <option value="new"${_aiRunHist.sort === 'new' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.sort.new', 'En yeni'))}</option>
        <option value="old"${_aiRunHist.sort === 'old' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.sort.old', 'En eski'))}</option>
        <option value="long"${_aiRunHist.sort === 'long' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.sort.long', 'En uzun'))}</option>
        <option value="short"${_aiRunHist.sort === 'short' ? ' selected' : ''}>${mbAiEsc(mbAiSay('ai.run.hist.sort.short', 'En kısa'))}</option>
      </select>
    </div>
    <div class="ai-run-hist" id="ai-run-hist"></div>
  </aside>
</div>`;
  (_aiDesk.staff || []).forEach((row) => mbAiPaintRunLive(row.id));
  mbAiPaintRunHist();
  void mbAiLoadRunHist();
  if (_aiHistJump) setTimeout(() => mbAiApplyHistJump(), 80);
}

function mbAiRunCard(row, mode) {
  const id = mbAiEsc(row.id);
  const qc = row.kind === 'qc';
  const kindLabel = qc ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu');
  const allowed = mbAiAllowedCamps(row);
  const focus = new Set(row.focus_ids || []);
  const noFocus = !focus.size;
  const max = Math.max(1, Number(row.parallel) || 1);
  const pills = allowed.length
    ? allowed.map((camp) => mbAiPill('data-ai-focus', row.id, camp.id, camp.name || '', noFocus || focus.has(camp.id), `mbAiFocusPick('${id}')`)).join('')
    : `<span class="ai-hint">${mbAiEsc(mbAiSay('ai.run.no_camp', 'Önce personel kartında kampanya seçin.'))}</span>`;
  const job = qc
    ? mbAiSay('ai.run.job.qc', 'Odaktaki kampanyalarda kalite bekleyen randevuları arar. Konuşur, sonucu yazar.')
    : mbAiSay('ai.run.job.sales', 'Odaktaki kampanyaların kuyruğundan kişileri arar. Randevu yazarsa kaliteye düşer.');
  return `<section class="ai-card ai-run-card${row.running ? ' is-on' : ''}" data-ai-run="${id}">
    <header class="ai-run-hd">
      <div class="ai-run-who">
        <span class="ai-badge ${qc ? 'is-qc' : 'is-sales'}"><i class="ph ${qc ? 'ph-seal-check' : 'ph-calendar-check'}"></i> ${mbAiEsc(kindLabel)}</span>
        <div class="ai-card-title">${mbAiEsc(row.name || kindLabel)}</div>
      </div>
      <div class="ai-run-tools">
        <span class="ai-run-cap" id="ai-run-cap-${id}">${mbAiEsc(row.running ? mbAiSay('ai.run.cap', '{open} / {max} hat').replace('{open}', '0').replace('{max}', String(max)) : mbAiSay('ai.run.idle', 'Duruyor.'))}</span>
        ${mbAiSwitch(`ai-run-${id}`, row.running, mbAiSay('ai.run.work', 'Çalışsın'), `mbAiRunToggle('${id}')`)}
      </div>
    </header>
    ${mbAiStaffScoreHtml(row.id)}
    <p class="ai-run-job">${mbAiEsc(job)}</p>
    <div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.run.focus', 'Şimdi bu kampanyalarda'))}</div>
      <div class="ai-pills" id="ai-focus-${id}">${pills}</div>
      <div class="ai-hint">${mbAiEsc(mbAiSay('ai.run.focus_hint', 'Kartta izinli kampanyalardan seç. Hiçbiri işaretli değilse izinli olanların hepsinde çalışır.'))}</div>
      <div class="ai-hint">${mbAiEsc(mbAiSay('ai.run.parallel', 'Aynı anda {n} hat — kampanya hızı yok, havuz yok.').replace('{n}', String(max)))}</div>
    </div>
    <div class="ai-sec ai-run-board">
      <div class="ai-run-now-hd">
        <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.run.now', 'Şu an'))}</div>
        ${qc ? '' : `<button type="button" class="btn btn-ghost btn-sm" onclick="mbAskRunCallNow('${id}')"><i class="ph ph-phone-call"></i> ${mbAiEsc(mbAiSay('callin.desk.now', 'Şimdi bir kişi ara'))}</button>`}
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiDryRun('${id}')"><i class="ph ph-eye"></i> ${mbAiEsc(mbAiSay('ai.run.dry', 'Kuru koşum'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiGoLiveFocus()">${mbAiEsc(mbAiSay('callin.desk.live', 'Canlıya git'))}</button>
      </div>
      <div class="ai-run-live" id="ai-run-live-${id}"></div>
      <div class="ai-run-calls" id="ai-run-calls-${id}"></div>
    </div>
  </section>`;
}

function mbAiFocusPick(staffId) {
  if (!_aiDesk) return;
  const row = _aiDesk.staff.find((item) => String(item.id) === String(staffId));
  if (!row) return;
  const boxes = [...document.querySelectorAll(`[data-ai-focus="${staffId}"]`)];
  let on = boxes.filter((el) => el.checked).map((el) => el.value).filter(mbAiUuid);
  if (!on.length) {
    boxes.forEach((el) => { el.checked = true; });
    on = boxes.map((el) => el.value).filter(mbAiUuid);
  }
  row.focus_ids = on.length === boxes.length ? [] : on;
  void mbAiPersistRun();
}

async function mbAiStopAll() {
  if (!_aiDesk) {
    callinTab('run');
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!_aiDesk) return;
  const running = (_aiDesk.staff || []).filter((row) => row.running);
  if (!running.length) {
    if (typeof toast === 'function') toast(mbAiSay('callin.desk.stop_none', 'Çalışan YZ yok.'), 'warn');
    return;
  }
  running.forEach((row) => {
    row.running = false;
    mbAiSetStopWhy(row.id, 'stop_all');
    const el = document.getElementById(`ai-run-${row.id}`);
    if (el) el.checked = false;
    const card = document.querySelector(`[data-ai-run="${row.id}"]`);
    if (card) card.classList.remove('is-on');
    mbAiPaintRunLive(row.id);
    void mbAiSyncLiveSession(row, null);
  });
  await mbAiPersistRun();
  if (typeof toast === 'function') toast(mbAiSay('callin.desk.stop_ok', '{n} YZ durdu.').replace('{n}', String(running.length)), 'ok');
  if (typeof callinDeskPaint === 'function') callinDeskPaint();
}

async function mbAiRunToggle(staffId) {
  if (!_aiDesk) return;
  const row = _aiDesk.staff.find((item) => String(item.id) === String(staffId));
  if (!row) return;
  const on = !!document.getElementById(`ai-run-${staffId}`)?.checked;
  if (on && !mbAiFirmReady(_aiDesk.settings)) {
    if (document.getElementById(`ai-run-${staffId}`)) document.getElementById(`ai-run-${staffId}`).checked = false;
    if (typeof toast === 'function') toast(mbAiSay('ai.run.not_ready', 'Önce şirket adı ve dakika fiyatı hazır olsun.'), 'err');
    return;
  }
  if (on && !mbAiAllowedCamps(row).length) {
    if (document.getElementById(`ai-run-${staffId}`)) document.getElementById(`ai-run-${staffId}`).checked = false;
    if (typeof toast === 'function') toast(mbAiSay('ai.run.no_camp', 'Önce personel kartında kampanya seçin.'), 'err');
    return;
  }
  if (on && !mbAiWithinHours(row)) {
    if (document.getElementById(`ai-run-${staffId}`)) document.getElementById(`ai-run-${staffId}`).checked = false;
    if (typeof toast === 'function') {
      toast(mbAiSay('ai.run.hours_lock', 'Çalışma saati dışında açılamaz ({from}–{until}).')
        .replace('{from}', String(row.call_from || '').slice(0, 5))
        .replace('{until}', String(row.call_until || '').slice(0, 5)), 'err');
    }
    return;
  }
  if (on && mbAiQuotaBlocked(_aiDesk.settings)) {
    if (document.getElementById(`ai-run-${staffId}`)) document.getElementById(`ai-run-${staffId}`).checked = false;
    if (typeof toast === 'function') toast(mbAiSay('ai.run.quota_lock', 'Günlük YZ dakika kotası doldu. Yeni arama yok.'), 'err');
    return;
  }
  if (on && row.kind !== 'qc' && !(typeof callinDeskTrustOn === 'function' && callinDeskTrustOn())) {
    const focus = mbAiFocusIds(row);
    const pool = focus.length ? focus : mbAiCampIds(row);
    const missing = await mbAiCampsMissingSlots(pool);
    if (missing.length) {
      const names = missing.map((id) => mbAiCampName(id) || id).filter(Boolean).join(', ');
      const ask = mbAiSay('ai.run.noslot_ask', 'Şu takvimlerde boş slot yok: {names}. Yine de başlatılsın mı?')
        .replace('{names}', names || '—');
      const ok = typeof mbConfirm === 'function'
        ? await mbConfirm(ask, mbAiSay('ai.run.work', 'Çalışsın'))
        : window.confirm(ask);
      if (!ok) {
        if (document.getElementById(`ai-run-${staffId}`)) document.getElementById(`ai-run-${staffId}`).checked = false;
        return;
      }
    }
  }
  if (on) mbAiClearStopWhy(staffId);
  else mbAiSetStopWhy(staffId, 'manual');
  row.running = on;
  const card = document.querySelector(`[data-ai-run="${staffId}"]`);
  if (card) card.classList.toggle('is-on', on);
  if (!row.user_id) {
    const uid = await mbAiEnsureOperatorUser(row);
    if (uid) row.user_id = uid;
  }
  mbAiPaintRunLive(staffId);
  await mbAiPersistRun();
  void mbAiSyncLiveSession(row, null);
  if (on) {
    if (row.kind === 'qc') void mbAiRunOneQc(row);
    else void mbAiRunOneSales(row);
  }
}

async function mbAiAutoStop(staff, code, detail) {
  if (!staff?.running) return;
  staff.running = false;
  mbAiSetStopWhy(staff.id, code, detail);
  const el = document.getElementById(`ai-run-${staff.id}`);
  if (el) el.checked = false;
  const card = document.querySelector(`[data-ai-run="${staff.id}"]`);
  if (card) card.classList.remove('is-on');
  mbAiPaintRunLive(staff.id);
  await mbAiPersistRun();
  void mbAiSyncLiveSession(staff, null);
  if (typeof toast === 'function') toast(mbAiStopWhyLabel(staff.id), 'warn');
  if (typeof callinDeskBeep === 'function') callinDeskBeep('stop');
}

async function mbAiPersistRun() {
  if (!_aiDesk || !_aiFirmId || _aiRunSaving || typeof sb !== 'function') return;
  _aiRunSaving = true;
  try {
    const rows = await sb(`firms?id=eq.${_aiFirmId}&select=settings`);
    const settings = { ...(rows?.[0]?.settings || {}) };
    const prev = mbAiStaffList(settings);
    const byId = new Map((_aiDesk.staff || []).map((row) => [row.id, row]));
    settings.ai_staff = prev.map((row) => {
      const next = byId.get(row.id);
      if (!next) return row;
      return mbAiStaffNorm({
        ...row,
        running: next.running === true,
        focus_ids: next.focus_ids || [],
        user_id: next.user_id || row.user_id || '',
      });
    }).filter(Boolean);
    await sb(`firms?id=eq.${_aiFirmId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    const hit = _aiDesk.firms.find((row) => String(row.id) === String(_aiFirmId));
    if (hit) hit.settings = settings;
    _aiDesk.settings = settings;
    window._aiStaffByFirm = window._aiStaffByFirm || {};
    window._aiFirmSettings = window._aiFirmSettings || {};
    window._aiStaffByFirm[_aiFirmId] = mbAiResolveEngine(mbAiStaffList(settings), settings);
    window._aiFirmSettings[_aiFirmId] = settings;
    window._aiStaffCacheAt = window._aiStaffCacheAt || {};
    window._aiStaffCacheAt[_aiFirmId] = Date.now();
  } catch (e) {
    if (typeof toast === 'function') toast((typeof t === 'function' ? t('dial.log_err') : '') + (e?.message || ''), 'err');
  } finally {
    _aiRunSaving = false;
  }
}

async function mbAiPickRunMode(mode) {
  if (!_aiDesk || !_aiFirmId || typeof sb !== 'function') return;
  const want = mode === 'server' ? 'server' : 'page';
  if (!mbAiRunAllow(_aiDesk.settings).includes(want)) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.mode.locked', 'Bu yol süper admin tarafından kapalı.'), 'warn');
    return;
  }
  if (mbAiRunMode(_aiDesk.settings) === want) return;
  try {
    const rows = await sb(`firms?id=eq.${_aiFirmId}&select=settings`);
    const settings = { ...(rows?.[0]?.settings || {}) };
    settings.ai = { ...(settings.ai || {}), run_mode: want, run_allow: mbAiRunAllow(settings) };
    await sb(`firms?id=eq.${_aiFirmId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    const hit = _aiDesk.firms.find((row) => String(row.id) === String(_aiFirmId));
    if (hit) hit.settings = settings;
    _aiDesk.settings = settings;
    if (typeof toast === 'function') {
      toast(want === 'server'
        ? mbAiSay('ai.run.mode.picked.server', 'Sunucudan moda geçildi')
        : mbAiSay('ai.run.mode.picked.page', 'Sayfa açıkken moda geçildi'), 'ok');
    }
    mbPaintAiRun();
  } catch (e) {
    if (typeof toast === 'function') toast((typeof t === 'function' ? t('dial.log_err') : '') + (e?.message || ''), 'err');
  }
}

function mbAiStartRunLoop() {
  mbAiStopRunLoop();
  if (!_aiDesk || _aiDesk.view !== 'run') return;
  _aiRunTimer = setInterval(() => { void mbAiRunTick(); }, 20000);
  void mbAiRunTick();
}

function mbAiStopRunLoop() {
  if (_aiRunTimer) clearInterval(_aiRunTimer);
  _aiRunTimer = null;
}

async function mbAiRunTick() {
  if (!_aiDesk || _aiDesk.view !== 'run') return;
  if (document.getElementById('callin-pane-run')?.hidden) return;
  if (!mbAiFirmReady(_aiDesk.settings)) return;
  if (mbAiQuotaBlocked(_aiDesk.settings)) {
    const running = (_aiDesk.staff || []).filter((row) => row.running);
    for (const row of running) await mbAiAutoStop(row, 'quota');
    return;
  }
  const list = (_aiDesk.staff || []).filter((row) => row.running);
  for (const row of list) {
    if (!mbAiWithinHours(row)) {
      await mbAiAutoStop(row, 'hours', `${String(row.call_from || '').slice(0, 5)}–${String(row.call_until || '').slice(0, 5)}`);
      continue;
    }
    if (row.kind === 'qc') await mbAiRunOneQc(row);
    else await mbAiRunOneSales(row);
  }
  (_aiDesk.staff || []).forEach((row) => mbAiPaintRunLive(row.id));
}

async function mbAiDryWhy(staff, pool, kind, who) {
  const reasons = [];
  if (!pool.length) {
    reasons.push(mbAiSay('ai.run.dry.why.camp', 'Odak / izinli kampanya yok.'));
    return reasons;
  }
  if (!mbAiWithinHours(staff)) {
    reasons.push(mbAiSay('ai.run.dry.why.hours', 'Çalışma saati dışında ({from}–{until}).')
      .replace('{from}', String(staff.call_from || '').slice(0, 5) || '—')
      .replace('{until}', String(staff.call_until || '').slice(0, 5) || '—'));
  }
  if (mbAiQuotaBlocked(_aiDesk?.settings)) {
    reasons.push(mbAiSay('ai.run.dry.why.quota', 'Günlük YZ dakika kotası dolu.'));
  }
  const campQ = pool.map(encodeURIComponent).join(',');
  if (kind !== 'qc') {
    const missing = await mbAiCampsMissingSlots(pool);
    if (missing.length) {
      const names = missing.map((id) => mbAiCampName(id) || id).filter(Boolean).join(', ');
      reasons.push(mbAiSay('ai.run.dry.why.slot', 'Boş slot yok: {names}.').replace('{names}', names || '—'));
    }
  }
  if (who) return reasons;
  if (kind === 'qc') {
    const want = (staff.call_statuses || []).filter(Boolean);
    const statuses = want.length ? want : ['qc_bekleniyor'];
    const statusQ = statuses.map(encodeURIComponent).join(',');
    const any = await sb(
      `appointments?select=id&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&durum=in.(${statusQ})&limit=1`
    ).catch(() => []) || [];
    if (!any.length) {
      reasons.push(mbAiSay('ai.run.dry.why.qc', 'Seçili kampanyalarda kalite bekleyen randevu yok ({st}).')
        .replace('{st}', statuses.join(', ')));
    }
  } else {
    const any = await sb(
      `contacts?select=id&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&status=in.(pending,callback,no_answer)&limit=1`
    ).catch(() => []) || [];
    if (!any.length) {
      reasons.push(mbAiSay('ai.run.dry.why.queue', 'Seçili kampanyalarda aranacak kişi yok (pending / geri arama / cevapsız).'));
    }
  }
  if (!reasons.length) reasons.push(mbAiSay('ai.run.dry.why.busy', 'Aday var ama meşgul / kısa süre önce arandı olabilir.'));
  return reasons;
}

async function mbAiDryRun(staffId) {
  if (!_aiDesk || typeof sb !== 'function') {
    if (typeof toast === 'function') toast(mbAiSay('callin.desk.now.wait', 'YZ arama yükleniyor…'), 'warn');
    return;
  }
  const staff = _aiDesk.staff.find((row) => String(row.id) === String(staffId));
  if (!staff) return;
  const camps = mbAiFocusIds(staff);
  const pool = camps.length ? camps : (_aiDesk.camps || []).map((camp) => camp.id).filter(mbAiUuid);
  if (!pool.length) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.no_camp', 'Önce personel kartında kampanya seçin.'), 'err');
    return;
  }
  const campQ = pool.map(encodeURIComponent).join(',');
  let who = null;
  let kind = 'sales';
  if (staff.kind === 'qc') {
    kind = 'qc';
    const want = (staff.call_statuses || []).filter(Boolean);
    const statuses = want.length ? want : ['qc_bekleniyor'];
    const statusQ = statuses.map(encodeURIComponent).join(',');
    const rows = await sb(
      `appointments?select=id,campaign_id,telefonnummer,nachname,termin_tarih,durum&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&durum=in.(${statusQ})&order=termin_tarih.asc&limit=1`
    ).catch(() => []) || [];
    who = rows[0] || null;
  } else {
    const rows = await sb(
      `contacts?select=id,first_name,last_name,phone,campaign_id,status&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&status=in.(pending,callback,no_answer)&order=last_called_at.asc.nullsfirst&limit=1`
    ).catch(() => []) || [];
    who = rows[0] || null;
  }
  const why = await mbAiDryWhy(staff, pool, kind, who);
  document.getElementById('ai-dry-pop')?.remove();
  const name = who
    ? (kind === 'qc'
      ? String(who.nachname || who.telefonnummer || '—')
      : [who.first_name, who.last_name].filter(Boolean).join(' ') || who.phone || '—')
    : '';
  const phone = who ? String(who.telefonnummer || who.phone || '') : '';
  const camp = who ? mbAiCampName(who.campaign_id) : '';
  const greet = String(staff.greeting || '').trim() || mbAiSay('ai.run.dry.nogreet', 'İlk cümle boş.');
  const prompt = String(staff.prompt || '').trim().slice(0, 400);
  const whyHtml = why.length
    ? `<div class="ai-dry-why"><div class="ai-sec-t">${mbAiEsc(who ? mbAiSay('ai.run.dry.why_title_ok', 'Not') : mbAiSay('ai.run.dry.why_title', 'Neden atlandı / sırada yok'))}</div>
        <ul>${why.map((line) => `<li>${mbAiEsc(line)}</li>`).join('')}</ul></div>`
    : '';
  const pop = document.createElement('div');
  pop.id = 'ai-dry-pop';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card ai-wiz-card" role="dialog" aria-modal="true">
    <div class="ai-wiz-hd">
      <b>${mbAiEsc(mbAiSay('ai.run.dry.title', 'Kuru koşum'))}</b>
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('ai-dry-pop')?.remove()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
    </div>
    <p class="ai-hint">${mbAiEsc(mbAiSay('ai.run.dry.hint', 'Gerçek arama yok. Sıradaki kişi ve script önizlemesi.'))}</p>
    ${who ? `<div class="ai-dry-who"><b>${mbAiEsc(name)}</b>
      <div class="ai-hint">${mbAiEsc(phone)}${camp ? ` · ${mbAiEsc(camp)}` : ''}</div></div>`
      : `<p class="ai-note">${mbAiEsc(mbAiSay('ai.run.dry.empty', 'Sırada kişi yok.'))}</p>`}
    ${whyHtml}
    <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.greeting', 'İlk cümle'))}</div>
    <div class="ai-dry-script">${mbAiEsc(greet)}</div>
    ${prompt ? `<div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.prompt', 'Talimat'))}</div><div class="ai-dry-script is-muted">${mbAiEsc(prompt)}</div>` : ''}
  </div>`;
  pop.addEventListener('click', (event) => { if (event.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

async function mbAiRunOneQc(staff) {
  if (!_aiFirmId || typeof sb !== 'function') return;
  if (!mbAiWithinHours(staff)) return;
  if (mbAiQuotaBlocked(_aiDesk?.settings)) return;
  const camps = mbAiFocusIds(staff);
  const pool = camps.length ? camps : (_aiDesk.camps || []).map((camp) => camp.id).filter(mbAiUuid);
  if (!pool.length) return;
  const want = (staff.call_statuses || []).filter(Boolean);
  const statuses = want.length ? want : ['qc_bekleniyor'];
  const open = mbAiRunLiveRows(staff.id).filter((row) => !row.doneAt).length;
  const room = Math.max(1, Number(staff.parallel) || 1) - open;
  if (room <= 0) return;
  const campQ = pool.map(encodeURIComponent).join(',');
  const statusQ = statuses.map(encodeURIComponent).join(',');
  const rows = await sb(
    `appointments?select=id,campaign_id,form_ek,durum,telefonnummer,nachname,termin_tarih&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&durum=in.(${statusQ})&order=termin_tarih.asc&limit=${Math.max(room * 3, 3)}`
  ).catch(() => []) || [];
  let left = room;
  for (const appt of rows) {
    if (left <= 0) break;
    const key = `${staff.id}:${appt.id}`;
    if (_aiRunBusy.has(key)) continue;
    if (( _aiRunLive[staff.id] || []).some((row) => row.apptId === appt.id && !row.doneAt)) continue;
    const ek = appt.form_ek && typeof appt.form_ek === 'object' ? appt.form_ek : {};
    const at = Date.parse(String(ek.callin_at || ''));
    if (ek.callin_state === 'dialing' && at && Date.now() - at < 120000) continue;
    _aiRunBusy.add(key);
    left -= 1;
    const meta = {
      key,
      apptId: appt.id,
      contactId: '',
      campId: appt.campaign_id || '',
      name: String(appt.nachname || '').trim(),
      phone: String(appt.telefonnummer || '').trim(),
      camp: mbAiCampName(appt.campaign_id),
      phase: 'ringing',
      secs: 0,
      at: Date.now(),
      doneAt: 0,
    };
    _aiRunLive[staff.id] = [...mbAiRunLiveRows(staff.id), meta];
    void mbAiSyncLiveSession(staff, meta);
    mbAiPaintRunLive(staff.id);
    const { res } = await mbAiPlaceForStaff(staff, { appointment_id: appt.id, note: '' }, meta);
    if (!res?.ok) {
      _aiRunBusy.delete(key);
      meta.phase = 'missed';
      meta.error = String(res?.error || res?.detail || 'dial');
      meta.doneAt = Date.now();
      if (typeof callinDeskPushError === 'function') {
        callinDeskPushError({
          staffId: staff.id,
          staffName: staff.name,
          who: meta.name,
          phone: meta.phone,
          apptId: appt.id,
          code: res?.error || 'fail',
          detail: String(res?.detail || '').slice(0, 220),
        });
      }
      void mbAiSyncLiveSession(staff, meta);
      mbAiPaintRunLive(staff.id);
      mbAiRunEndedAlert(staff, meta);
      mbAiPushRunRecent(staff, meta);
      continue;
    }
    void mbAiWatchRun(staff.id, meta);
  }
}

async function mbAiRunOneSales(staff) {
  if (!_aiFirmId || typeof sb !== 'function') return;
  if (!mbAiWithinHours(staff)) return;
  if (mbAiQuotaBlocked(_aiDesk?.settings)) return;
  const camps = mbAiFocusIds(staff);
  const pool = camps.length ? camps : (_aiDesk.camps || []).map((camp) => camp.id).filter(mbAiUuid);
  if (!pool.length) return;
  const open = mbAiRunLiveRows(staff.id).filter((row) => !row.doneAt).length;
  const room = Math.max(1, Number(staff.parallel) || 1) - open;
  if (room <= 0) return;
  const campQ = pool.map(encodeURIComponent).join(',');
  const rows = await sb(
    `contacts?select=id,first_name,last_name,phone,campaign_id,status,last_called_at&firm_id=eq.${_aiFirmId}&campaign_id=in.(${campQ})&status=in.(pending,callback,no_answer)&order=last_called_at.asc.nullsfirst&limit=${Math.max(room * 3, 3)}`
  ).catch(() => []) || [];
  let left = room;
  for (const contact of rows) {
    if (left <= 0) break;
    const key = `${staff.id}:c:${contact.id}`;
    if (_aiRunBusy.has(key)) continue;
    if ((_aiRunLive[staff.id] || []).some((row) => row.contactId === contact.id && !row.doneAt)) continue;
    const calledAt = Date.parse(String(contact.last_called_at || ''));
    if (contact.status === 'calling' && calledAt && Date.now() - calledAt < 120000) continue;
    if (!String(contact.phone || '').trim()) continue;
    _aiRunBusy.add(key);
    left -= 1;
    const name = [contact.first_name, contact.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    const meta = {
      key,
      apptId: '',
      contactId: contact.id,
      campId: contact.campaign_id || '',
      name,
      phone: String(contact.phone || '').trim(),
      camp: mbAiCampName(contact.campaign_id),
      phase: 'ringing',
      secs: 0,
      at: Date.now(),
      doneAt: 0,
    };
    _aiRunLive[staff.id] = [...mbAiRunLiveRows(staff.id), meta];
    void mbAiSyncLiveSession(staff, meta);
    mbAiPaintRunLive(staff.id);
    const { res } = await mbAiPlaceForStaff(staff, { contact_id: contact.id, note: '' }, meta);
    if (!res?.ok || !res.appointment_id) {
      _aiRunBusy.delete(key);
      meta.phase = 'missed';
      meta.error = String(res?.error || res?.detail || 'dial');
      meta.doneAt = Date.now();
      if (typeof callinDeskPushError === 'function') {
        callinDeskPushError({
          staffId: staff.id,
          staffName: staff.name,
          who: meta.name,
          phone: meta.phone,
          contactId: contact.id,
          code: res?.error || 'fail',
          detail: String(res?.detail || '').slice(0, 220),
        });
      }
      void mbAiSyncLiveSession(staff, meta);
      mbAiPaintRunLive(staff.id);
      mbAiRunEndedAlert(staff, meta);
      mbAiPushRunRecent(staff, meta);
      continue;
    }
    meta.apptId = res.appointment_id;
    void mbAiWatchRun(staff.id, meta);
  }
}

async function mbAskRunCallNow(staffId, contactId) {
  if (!_aiDesk || _aiDesk.view !== 'run') {
    callinTab('run');
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!_aiDesk) {
    if (typeof toast === 'function') toast(mbAiSay('callin.desk.now.wait', 'YZ arama yükleniyor…'), 'warn');
    return;
  }
  if (!mbAiFirmReady(_aiDesk.settings)) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.not_ready', 'Önce şirket adı ve dakika fiyatı hazır olsun.'), 'err');
    return;
  }
  if (mbAiQuotaBlocked(_aiDesk.settings)) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.quota_lock', 'Günlük YZ dakika kotası doldu. Yeni arama yok.'), 'err');
    return;
  }
  const sales = (_aiDesk.staff || []).filter((row) => row.kind !== 'qc');
  const staff = (staffId && sales.find((row) => String(row.id) === String(staffId)))
    || sales.find((row) => row.running)
    || sales[0];
  if (!staff) {
    if (typeof toast === 'function') toast(mbAiSay('callin.desk.now.nostaff', 'Önce Personel kur’dan randevu personeli ekle.'), 'warn');
    return;
  }
  if (!mbAiWithinHours(staff)) {
    if (typeof toast === 'function') {
      toast(mbAiSay('ai.run.hours_lock', 'Çalışma saati dışında açılamaz ({from}–{until}).')
        .replace('{from}', String(staff.call_from || '').slice(0, 5))
        .replace('{until}', String(staff.call_until || '').slice(0, 5)), 'err');
    }
    return;
  }
  if (!mbAiAllowedCamps(staff).length) {
    if (typeof toast === 'function') toast(mbAiSay('ai.run.no_camp', 'Önce personel kartında kampanya seçin.'), 'err');
    return;
  }
  if (contactId && typeof sb === 'function') {
    const rows = await sb(`contacts?id=eq.${encodeURIComponent(contactId)}&select=id,first_name,last_name,phone,campaign_id&limit=1`).catch(() => []) || [];
    const contact = rows[0];
    if (!contact?.id || !String(contact.phone || '').trim()) {
      if (typeof toast === 'function') toast(mbAiSay('qc.callin.phone', 'Numara yok'), 'err');
      return;
    }
    const key = `${staff.id}:c:${contact.id}:now`;
    if (_aiRunBusy.has(key)) return;
    _aiRunBusy.add(key);
    const name = [contact.first_name, contact.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    const meta = {
      key,
      apptId: '',
      contactId: contact.id,
      campId: contact.campaign_id || '',
      name,
      phone: String(contact.phone || '').trim(),
      camp: mbAiCampName(contact.campaign_id),
      phase: 'ringing',
      secs: 0,
      at: Date.now(),
      doneAt: 0,
    };
    _aiRunLive[staff.id] = [...mbAiRunLiveRows(staff.id), meta];
    void mbAiSyncLiveSession(staff, meta);
    mbAiPaintRunLive(staff.id);
    if (typeof toast === 'function') toast(mbAiSay('qc.callin.placing', 'Aranıyor. Hat açılınca konuşma başlar.'), 'ok');
    const { res } = await mbAiPlaceForStaff(staff, { contact_id: contact.id, note: '' }, meta);
    if (!res?.ok || !res.appointment_id) {
      _aiRunBusy.delete(key);
      meta.phase = 'missed';
      meta.error = String(res?.error || res?.detail || 'dial');
      meta.doneAt = Date.now();
      if (typeof callinDeskPushError === 'function') {
        callinDeskPushError({
          staffId: staff.id,
          staffName: staff.name,
          who: meta.name,
          phone: meta.phone,
          contactId: contact.id,
          code: res?.error || 'fail',
          detail: String(res?.detail || '').slice(0, 220),
        });
      }
      mbAiPaintRunLive(staff.id);
      mbAiRunEndedAlert(staff, meta);
      if (typeof toast === 'function') toast(mbAiSay('qc.callin.fail', 'Arama çıkmadı.'), 'err');
      return;
    }
    meta.apptId = res.appointment_id;
    void mbAiWatchRun(staff.id, meta);
    return;
  }
  if (typeof toast === 'function') toast(mbAiSay('callin.desk.now.going', 'Sıradaki kişi aranıyor…'), 'ok');
  await mbAiRunOneSales(staff);
  mbAiPaintRunLive(staff.id);
  if (typeof callinDeskPaint === 'function') callinDeskPaint();
}

function mbAiApplySyncMeta(meta, res) {
  if (!meta || !res) return;
  if (res.phase) meta.phase = String(res.phase);
  meta.secs = Number(res.secs) || meta.secs || 0;
  if (res.phase === 'talking' || (meta.secs > 0 && !res.done)) meta.phase = 'talking';
  if (res.durum) meta.durum = String(res.durum);
  if (res.outcome) meta.outcome = String(res.outcome);
  if (res.summary) meta.summary = String(res.summary);
  if (res.qc_notu) meta.qc_notu = String(res.qc_notu);
  if (res.transcript) meta.transcript = String(res.transcript);
  if (res.recording) meta.recording = String(res.recording);
  if (res.termin_tarih) meta.termin = String(res.termin_tarih);
  if (res.error) meta.error = String(res.error);
}

async function mbAiWatchRun(staffId, meta) {
  const staff = (_aiDesk?.staff || []).find((row) => String(row.id) === String(staffId));
  const started = Date.now();
  while (Date.now() - started < 12 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const res = await mbTelnyxAi('sync', { appointment_id: meta.apptId });
    if (!res?.ok) continue;
    if (!res.done && !res.phase) meta.phase = meta.phase === 'talking' ? 'talking' : 'ringing';
    mbAiApplySyncMeta(meta, res);
    if (staff) void mbAiSyncLiveSession(staff, meta);
    mbAiPaintRunLive(staffId);
    if (res.done) {
      meta.phase = res.phase === 'missed' || !(res.secs > 0) ? 'missed' : 'talked';
      meta.secs = Number(res.secs) || meta.secs || 0;
      meta.doneAt = Date.now();
      if (!meta.recording || !meta.transcript) {
        await new Promise((resolve) => setTimeout(resolve, 2200));
        const again = await mbTelnyxAi('sync', { appointment_id: meta.apptId });
        if (again?.ok) mbAiApplySyncMeta(meta, again);
      }
      break;
    }
  }
  if (!meta.doneAt) {
    meta.phase = meta.secs > 0 ? 'talked' : 'missed';
    meta.doneAt = Date.now();
  }
  _aiRunBusy.delete(meta.key);
  if (staff) void mbAiSyncLiveSession(staff, meta);
  mbAiPaintRunLive(staffId);
  mbAiRunEndedAlert(staff, meta);
  mbAiPushRunRecent(staff, meta);
  setTimeout(() => { void mbAiLoadRunHist(); }, 2500);
}

function mbAiStaffSummaryHtml(ai, ready) {
  const staff = _aiDesk?.staff || [];
  const sales = staff.filter((row) => row.kind !== 'qc').length;
  const qc = staff.length - sales;
  const campsOk = staff.filter((row) => mbAiAllowedCamps(row).length).length;
  const bits = [
    ready ? mbAiSay('ai.staff.sum.ready', 'Firma hazır') : mbAiSay('ai.staff.sum.wait', 'Firma eksik'),
    mbAiSay('ai.staff.sum.count', '{n} personel').replace('{n}', String(staff.length)),
    mbAiSay('ai.staff.sum.split', '{s} randevu · {q} kalite').replace('{s}', String(sales)).replace('{q}', String(qc)),
    staff.length ? mbAiSay('ai.staff.sum.camps', '{n} kampanya seçili').replace('{n}', String(campsOk)) : '',
  ].filter(Boolean);
  return `<div class="ai-staff-sum ai-staff-span">
    <div class="ai-staff-sum-main">
      <div class="ai-staff-sum-title">${mbAiEsc(mbAiSay('ai.staff.sum.title', 'Kısa özet'))}</div>
      <div class="ai-staff-sum-bits">${bits.map((bit) => `<span>${mbAiEsc(bit)}</span>`).join('')}</div>
      ${ai.spoken_name ? `<div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.sum.spoken', 'Söylenecek ad: {name}').replace('{name}', ai.spoken_name))}</div>` : ''}
    </div>
    <div class="ai-staff-sum-act">
      <button type="button" class="btn btn-primary btn-sm" onclick="mbAiStaffWizard('sales')"><i class="ph ph-magic-wand"></i> ${mbAiEsc(mbAiSay('ai.staff.wiz.start', 'Hızlı kur'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiStaffWizard('qc')">${mbAiEsc(mbAiSay('ai.staff.wiz.qc', 'Kalite hızlı'))}</button>
    </div>
  </div>`;
}

function mbAiStaffWizard(kind) {
  if (!_aiDesk) return;
  if (_aiDesk.staff.length >= 8) {
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.copy_full', 'En fazla 8 personel.'), 'err');
    return;
  }
  document.getElementById('ai-staff-wiz')?.remove();
  const qc = kind === 'qc';
  const camps = _aiDesk.camps || [];
  const campOpts = camps.map((camp) => `<label class="ai-wiz-check"><input type="checkbox" value="${mbAiEsc(camp.id)}" checked> ${mbAiEsc(camp.name || '')}</label>`).join('')
    || `<div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.wiz.nocamp', 'Kampanya yok — sonra ekleyebilirsin.'))}</div>`;
  const pop = document.createElement('div');
  pop.id = 'ai-staff-wiz';
  pop.className = 'ai-callin';
  pop.innerHTML = `<div class="ai-callin-card ai-wiz-card" role="dialog" aria-modal="true">
    <div class="ai-wiz-hd">
      <b>${mbAiEsc(mbAiSay('ai.staff.wiz.title', 'Hızlı personel'))}</b>
      <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiStaffWizardClose()">${mbAiEsc(mbAiSay('qc.callin.cancel', 'Vazgeç'))}</button>
    </div>
    <p class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.wiz.hint', '3 adım: ad, kampanya, ilk cümle. Detayları karttan sonra açarsın.'))}</p>
    <label class="form-label">${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}</label>
    <input class="form-input" id="ai-wiz-name" maxlength="40" value="${mbAiEsc(qc ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu'))}">
    <div class="ai-wiz-sec-t">${mbAiEsc(mbAiSay('ai.staff.camps', 'Kampanyalar'))}</div>
    <div class="ai-wiz-camps" id="ai-wiz-camps">${campOpts}</div>
    <label class="form-label">${mbAiEsc(mbAiSay('ai.staff.greeting', 'İlk cümle'))}</label>
    <textarea class="form-input" id="ai-wiz-greet" rows="3" maxlength="400" placeholder="${mbAiEsc(mbAiSay('ai.staff.greeting_ph', ''))}"></textarea>
    <div class="ai-wiz-foot">
      <button type="button" class="btn btn-primary" onclick="mbAiStaffWizardDone('${qc ? 'qc' : 'sales'}')">${mbAiEsc(mbAiSay('ai.staff.wiz.done', 'Oluştur ve aç'))}</button>
    </div>
  </div>`;
  pop.addEventListener('click', (event) => { if (event.target === pop) mbAiStaffWizardClose(); });
  document.body.appendChild(pop);
  document.getElementById('ai-wiz-name')?.focus();
}

function mbAiStaffWizardClose() {
  document.getElementById('ai-staff-wiz')?.remove();
}

function mbAiStaffWizardDone(kind) {
  mbAiReadDesk();
  if (!_aiDesk || _aiDesk.staff.length >= 8) return;
  const name = String(document.getElementById('ai-wiz-name')?.value || '').trim().slice(0, 40);
  const greeting = String(document.getElementById('ai-wiz-greet')?.value || '').trim().slice(0, 400);
  const campIds = [...document.querySelectorAll('#ai-wiz-camps input[type="checkbox"]:checked')].map((el) => el.value).filter(mbAiUuid);
  const allCamps = (_aiDesk.camps || []).map((camp) => camp.id).filter(mbAiUuid);
  const results = kind === 'qc'
    ? (_aiDesk.results || []).map((row) => row.key).filter((key) => key && key !== 'qc_bekleniyor')
    : (typeof DEFAULT_OUTCOMES !== 'undefined' ? DEFAULT_OUTCOMES.map((row) => row.key) : []);
  const added = mbAiStaffNorm({
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    name: name || (kind === 'qc' ? mbAiSay('ai.staff.qc', 'Kalite') : mbAiSay('ai.staff.sales', 'Randevu')),
    greeting,
    campaign_ids: campIds.length && campIds.length < allCamps.length ? campIds : [],
    results,
    call_statuses: kind === 'qc' ? ['qc_bekleniyor'] : [],
    call_when: ['today'],
    retry_min: 30,
    parallel: 1,
  });
  mbAiStaffWizardClose();
  if (!added) return;
  _aiOpen.add(added.id);
  _aiDesk.staff.push(added);
  mbPaintAiStaff();
  if (typeof toast === 'function') toast(mbAiSay('ai.staff.wiz.ok', 'Personel hazır. Kaydetmeyi unutma.'), 'ok');
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
    <header class="ai-card-hd"><div class="ai-card-title">${typeof mbAiMarkHtml === 'function' ? mbAiMarkHtml() : ''}${mbAiEsc(mbAiSay('line.ai', 'Agent'))}</div>${state}</header>
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
      ${mbAiField('ai-daycap', mbAiSay('ai.talk.daycap', 'Günlük YZ dakika kotası'), `<input class="form-input" id="ai-daycap" type="number" min="0" max="1440" step="1" value="${mbAiEsc(ai.day_min_cap || '')}" placeholder="0"><div class="ai-hint">${mbAiEsc(mbAiSay('ai.talk.daycap_hint', '0 = limitsiz. Doluluğunda yeni YZ araması çıkmaz; %80’de uyarı gelir.'))}</div>`, true)}
      ${mbAiField('ai-qcafter', mbAiSay('ai.talk.qc_after', 'Randevu sonrası kalite'), `<select class="form-input" id="ai-qcafter">${opt('off', ai.qc_after || 'off', mbAiSay('ai.talk.qc_after.off', 'Kapalı'))}${opt('now', ai.qc_after || 'off', mbAiSay('ai.talk.qc_after.now', 'Hemen'))}${opt('5', ai.qc_after || 'off', mbAiSay('ai.talk.qc_after.5', '5 dk sonra'))}${opt('15', ai.qc_after || 'off', mbAiSay('ai.talk.qc_after.15', '15 dk sonra'))}${opt('30', ai.qc_after || 'off', mbAiSay('ai.talk.qc_after.30', '30 dk sonra'))}</select><div class="ai-hint">${mbAiEsc(mbAiSay('ai.talk.qc_after_hint', 'Satış randevu yazınca kalite personeli sıraya alınır.'))}</div>`, true)}
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
    ${mbAiStaffSummaryHtml(ai, ready)}
    <p class="ai-note ai-staff-span">${mbAiEsc(mbAiSay('ai.staff.intro', ''))}</p>
    <div class="ai-staff-side">${voice}</div>
    <div class="ai-staff-main">${empty}${cards}</div>
    <div class="ai-bar ai-staff-span">
      <div class="ai-bar-add">
        <button type="button" class="btn btn-ghost btn-sm" onclick="mbAiStaffWizard('sales')"><i class="ph ph-magic-wand"></i> ${mbAiEsc(mbAiSay('ai.staff.wiz.start', 'Hızlı kur'))}</button>
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
  const tail = `${mbAiParallelBlock(row)}${qc ? mbAiQcAuto(row, choices) : ''}`;
  const powers = qc ? `<div class="ai-sec">
      <div class="ai-sec-t">${mbAiEsc(mbAiSay('ai.staff.powers', 'Yetki'))}</div>
      ${mbAiSwitch(`ai-move-${id}`, row.move_time !== false, mbAiSay('ai.staff.move', 'Randevu saatini değiştirebilir'), `mbAiMoveHint('${id}')`)}
      <div class="ai-hint" id="ai-move-hint-${id}">${mbAiEsc(mbAiMoveHintText(row.move_time !== false, row.results || []))}</div>
    </div>` : '';
  const open = _aiOpen.has(row.id) ? ' open' : '';
  const campCount = pickedCamps.size || camps.length;
  const engineLab = mbAiStaffEngineLabel(row);
  const hours = row.call_from && row.call_until ? `${row.call_from.slice(0, 5)}–${row.call_until.slice(0, 5)}` : '';
  const blurb = [
    engineLab,
    mbAiSay('ai.staff.sum.n_camps', '{n} kampanya').replace('{n}', String(campCount || 0)),
    mbAiSay('ai.run.parallel', 'Aynı anda {n} hat').replace('{n}', String(Math.max(1, Number(row.parallel) || 1))),
    hours,
  ].filter(Boolean).join(' · ');
  return `<section class="ai-card">
    <details class="ai-fold"${open} ontoggle="mbAiFold('${id}', this.open)">
    <summary class="ai-card-hd">
      <span class="ai-badge ${qc ? 'is-qc' : 'is-sales'}"><i class="ph ${qc ? 'ph-seal-check' : 'ph-calendar-check'}"></i> ${mbAiEsc(kindLabel)}</span>
      <div class="ai-card-sum">
        <input class="ai-name" id="ai-name-${id}" maxlength="40" value="${mbAiEsc(row.name)}" placeholder="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.name', 'Personel adı'))}" onclick="event.stopPropagation()">
        <span class="ai-card-blurb">${mbAiEsc(blurb)}</span>
      </div>
      <i class="ph ph-caret-down ai-caret"></i>
      <button type="button" class="ai-copy" title="${mbAiEsc(mbAiSay('ai.staff.copy_camp.title', 'Kopyala → kampanya'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.copy_camp.title', 'Kopyala → kampanya'))}" onclick="event.preventDefault(); event.stopPropagation(); mbAiCopyToCamp('${id}')"><i class="ph ph-arrows-left-right"></i></button>
      <button type="button" class="ai-copy" title="${mbAiEsc(mbAiSay('ai.staff.copy', 'Kopyala'))}" aria-label="${mbAiEsc(mbAiSay('ai.staff.copy', 'Kopyala'))}" onclick="event.preventDefault(); event.stopPropagation(); mbAiCopyStaff('${id}')"><i class="ph ph-copy"></i></button>
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
      ${mbAiField(`ai-greetb-${row.id}`, mbAiSay('ai.staff.greeting_b', 'İlk cümle B (A/B)'), `${mbAiRichBox(`ai-greetb-${row.id}`, row.greeting_b || '', 400, 2, mbAiSay('ai.staff.greeting_b_ph', 'İkinci varyant…'), row.id)}${mbAiSwitch(`ai-abon-${id}`, !!row.ab_on, mbAiSay('ai.staff.ab_on', 'A/B dönüşümlü dene'))}${mbAiAbScoreHtml(row.id)}<div class="ai-hint">${mbAiEsc(mbAiSay('ai.staff.ab_hint', 'Açıkken aramalar A ve B arasında sırayla gider. Hangisi daha çok randevu getirir buradan görünür.'))}</div>`, true)}
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
    <div class="ai-sec">
      <button type="button" class="btn btn-danger btn-sm" onclick="mbAiDropStaff('${id}')"><i class="ph ph-trash"></i> ${mbAiEsc(mbAiSay('ai.staff.remove', 'Bu personeli sil'))}</button>
    </div>
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
    day_min_cap: Number(draft.day_min_cap) > 0 ? Math.min(1440, Math.round(Number(draft.day_min_cap))) : 0,
    qc_after: ['now', '5', '15', '30'].includes(String(draft.qc_after || '')) ? String(draft.qc_after) : 'off',
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
    for (const row of _aiDesk.staff) {
      const uid = await mbAiEnsureOperatorUser(row);
      if (uid) row.user_id = uid;
    }
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
    window._aiFirmSettings = window._aiFirmSettings || {};
    window._aiStaffByFirm[_aiFirmId] = mbAiResolveEngine(_aiDesk.staff, settings);
    window._aiFirmSettings[_aiFirmId] = settings;
    window._aiStaffCacheAt = window._aiStaffCacheAt || {};
    window._aiStaffCacheAt[_aiFirmId] = Date.now();
    if (typeof toast === 'function') toast(mbAiSay('ai.staff.saved', 'YZ personel kaydedildi'), 'ok');
    mbPaintAiStaff();
  } catch (e) {
    if (typeof toast === 'function') toast((typeof t === 'function' ? t('dial.log_err') : '') + (e?.message || ''), 'err');
  }
}

/** Call history / kişi kartı: AI araması satırı (QC’deki Callin satırı gibi). */
function mbAiCallLogHtml(log) {
  if (!log || !(typeof mbIsAiOperator === 'function' ? mbIsAiOperator(log) : (log.ai_staff_id || String(log.work_type || '').startsWith('ai_')))) return '';
  const name = (typeof mbOperatorName === 'function' ? mbOperatorName(log) : (log.operator_name || '')) || (typeof ariaName === 'function' ? ariaName() : 'Callin');
  const outcome = String(log.outcome || '');
  const resultMap = {
    appointment: mbAiSay('ai.run.result.appt', 'Başarılı — randevu'),
    qc_bekleniyor: mbAiSay('ai.run.result.appt', 'Başarılı — randevu'),
    negative: mbAiSay('ai.run.result.neg', 'Olumsuz'),
    callback: mbAiSay('ai.run.result.cb', 'Geri arama'),
    no_answer: mbAiSay('ai.run.result.no_answer', 'Cevapsız'),
    voicemail: mbAiSay('ai.run.result.vm', 'Telesekreter'),
    dnc: mbAiSay('ai.run.result.dnc', 'Kara liste'),
    basarili: mbAiSay('ai.run.result.ok', 'Başarılı'),
    basarisiz: mbAiSay('ai.run.result.neg', 'Olumsuz'),
    beklemede: mbAiSay('qc.callin.pending_result', 'Bekleniyor'),
    ulasilamadi: mbAiSay('ai.run.result.reach', 'Ulaşılamadı'),
    qc_ai: mbAiSay('qc.callin.pending_result', 'Bekleniyor'),
  };
  const resultName = resultMap[outcome] || (outcome ? outcome : mbAiSay('qc.callin.pending_result', 'Bekleniyor'));
  const text = mbAiSay('qc.callin.result', '{name} aradı. Sonuç: {result}')
    .replace('{name}', name)
    .replace('{result}', resultName);
  const miss = ['no_answer', 'ulasilamadi', 'voicemail', 'negative', 'basarisiz', 'dnc'].includes(outcome);
  const pending = !outcome || outcome === 'beklemede' || outcome === 'qc_ai';
  const tone = miss ? 'is-miss' : (pending ? 'is-ring' : 'is-talk');
  const notes = String(log.notes || '').trim();
  const summary = notes.split(/\n\n/)[0] || '';
  const transcript = notes.includes('\n\n') ? notes.slice(summary.length).trim() : '';
  const noteHtml = summary ? `<div class="qc-callin-note">${mbAiEsc(summary.slice(0, 400))}</div>` : '';
  const scriptHtml = transcript
    ? `<details class="qc-callin-script"><summary>${mbAiEsc(mbAiSay('qc.callin.transcript', 'Konuşma'))}</summary>${mbAiEsc(transcript.slice(0, 2000))}</details>`
    : '';
  const shell = `class="qc-callin-live ${tone}" data-ai-log="${mbAiEsc(log.id || '')}"`;
  if (!noteHtml && !scriptHtml) return `<div ${shell}><b>${mbAiEsc(text)}</b></div>`;
  return `<details ${shell}><summary><b>${mbAiEsc(text)}</b></summary>${noteHtml}${scriptHtml}</details>`;
}

async function mbAiSetRunning(staffId, on, firmId) {
  const fid = firmId || mbAiActiveFirmId() || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  if (!fid || !staffId || typeof sb !== 'function') return false;
  const prevFirm = _aiFirmId;
  _aiFirmId = String(fid);
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []) || [];
    const settings = { ...(rows[0]?.settings || {}) };
    const list = mbAiStaffList(settings);
    const hit = list.find((row) => String(row.id) === String(staffId));
    if (!hit) return false;
    if (on) {
      const uid = await mbAiEnsureOperatorUser({ ...hit }, fid);
      if (uid) hit.user_id = uid;
    }
    hit.running = !!on;
    if (on) mbAiClearStopWhy(staffId);
    else if (!mbAiStopWhyMap()[String(staffId)]) mbAiSetStopWhy(staffId, 'manual');
    settings.ai_staff = list.map((row) => String(row.id) === String(staffId) ? mbAiStaffNorm(hit) : row).filter(Boolean);
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    window._aiStaffByFirm = window._aiStaffByFirm || {};
    window._aiFirmSettings = window._aiFirmSettings || {};
    window._aiStaffByFirm[fid] = mbAiResolveEngine(mbAiStaffList(settings), settings);
    window._aiFirmSettings[fid] = settings;
    window._aiStaffCacheAt = window._aiStaffCacheAt || {};
    window._aiStaffCacheAt[fid] = Date.now();
    if (_aiDesk && String(_aiFirmId) === String(fid)) {
      _aiDesk.settings = settings;
      const deskRow = (_aiDesk.staff || []).find((row) => String(row.id) === String(staffId));
      if (deskRow) deskRow.running = !!on;
      else _aiDesk.staff = mbAiStaffList(settings);
      if (_aiDesk.view === 'run') mbPaintAiRun();
    }
    const staff = (window._aiStaffByFirm[fid] || []).find((row) => String(row.id) === String(staffId));
    if (staff) void mbAiSyncLiveSession(staff, null);
    if (on && staff) {
      if (staff.kind === 'qc') void mbAiRunOneQc(staff);
      else void mbAiRunOneSales(staff);
    }
    return true;
  } finally {
    if (!_aiDesk) _aiFirmId = prevFirm;
  }
}

async function mbAiLiveSnapshot(firmId) {
  const fid = firmId || mbAiActiveFirmId() || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  if (!fid) return { firmId: '', staff: [], talking: 0, ringing: 0, running: 0 };
  await mbCacheAiStaff(fid);
  const staff = window._aiStaffByFirm?.[fid] || [];
  const userIds = staff.map((row) => row.user_id).filter(mbAiUuid);
  let sessions = [];
  if (userIds.length && typeof sb === 'function') {
    sessions = await sb(`agent_sessions?agent_id=in.(${userIds.join(',')})&select=agent_id,status,agent_name,current_contact_name,current_contact_phone,last_seen`).catch(() => []) || [];
  }
  const byUser = new Map(sessions.map((row) => [String(row.agent_id), row]));
  let talking = 0;
  let ringing = 0;
  let running = 0;
  const rows = staff.map((row) => {
    const sess = byUser.get(String(row.user_id || '')) || null;
    const live = (_aiRunLive[row.id] || []).filter((item) => !item.doneAt);
    const phase = live[0]?.phase || (sess?.status === 'on_call' ? 'talking' : '');
    if (row.running) running += 1;
    if (phase === 'talking' || sess?.status === 'on_call') talking += 1;
    else if (phase === 'ringing') ringing += 1;
    return {
      ...row,
      sess,
      phase,
      who: live[0]?.name || sess?.current_contact_name || '',
      phone: live[0]?.phone || sess?.current_contact_phone || '',
      at: Number(live[0]?.at) || 0,
      stopWhy: !row.running ? mbAiStopWhyLabel(row.id) : '',
    };
  });
  const talker = rows.find((row) => row.phase === 'talking' || row.sess?.status === 'on_call')
    || rows.find((row) => row.phase === 'ringing')
    || null;
  return {
    firmId: fid,
    staff: rows,
    talking,
    ringing,
    running,
    talkWho: talker?.who || '',
    talkStaff: talker?.name || '',
    talkAt: Number(talker?.at) || 0,
    talkPhase: talker?.phase || '',
  };
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
    if (typeof callinDeskPushError === 'function') {
      callinDeskPushError({
        staffId: picked,
        staffName: (mbAiQcStaffAll(row?.firm_id, row?.campaign_id) || []).find((item) => String(item.id) === String(picked))?.name || '',
        who: row?.nachname || '',
        phone: row?.telefonnummer || '',
        apptId,
        code: res?.error || 'fail',
        detail: why,
      });
    }
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
