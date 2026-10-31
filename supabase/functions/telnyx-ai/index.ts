import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  allowedChoices,
  berlinClock,
  berlinDay,
  buildAiBrief,
  clip,
  fillAiText,
  fieldLines,
  normDid,
  normKey,
  resultAllowed,
  type AiChoice,
} from './instruct.ts';
import { ensureEleven, elAudio, elConversation, elDial, elVoiceAdd, elVoices, elWhy, el, llmOf } from './eleven.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mb-session, x-mb-user-id, x-mb-firm-id, x-mb-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = 'Qwen/Qwen3-235B-A22B';
const APPT_COLS = ['nachname', 'telefonnummer', 'telefon2', 'strasse', 'plz', 'ortschaft', 'hausart', 'baujahr', 'qm', 'heizung', 'alter_der_heizung', 'verbrauch_pro_jahr', 'personen', 'interesse_an_pv'];

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

function packState(data: Record<string, string>) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach((byte) => { bin += String.fromCharCode(byte); });
  return btoa(bin);
}

function unpackState(value: unknown) {
  try {
    const raw = atob(String(value || ''));
    const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : null;
  } catch {
    return null;
  }
}

function tokenOk(token: string) {
  return /^[a-f0-9]{32}$/.test(token);
}

function newToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function b64(value: string) {
  const raw = atob(value);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function verifySignature(raw: string, req: Request) {
  const publicKey = String(Deno.env.get('TELNYX_PUBLIC_KEY') || '').trim();
  if (!publicKey) return true;
  const signature = String(req.headers.get('telnyx-signature-ed25519') || '');
  const timestamp = String(req.headers.get('telnyx-timestamp') || '');
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey('raw', b64(publicKey), { name: 'Ed25519' }, false, ['verify']);
    const payload = new TextEncoder().encode(`${timestamp}|${raw}`);
    return await crypto.subtle.verify('Ed25519', key, b64(signature), payload);
  } catch {
    return false;
  }
}

async function telnyx(key: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telnyx.com/v2/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function telnyxWhy(res: { ok: boolean; status: number; data: any }) {
  const list = Array.isArray(res.data?.errors) ? res.data.errors : [];
  const text = list.map((row: any) => [row?.code, row?.title, row?.detail].filter(Boolean).join(' ')).join(' | ');
  return `${res.status} ${text}`.trim();
}

async function telnyxGet(key: string, path: string) {
  const res = await fetch(`https://api.telnyx.com/v2/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// POST /v2/calls needs a Call Control App id. The saved sip connection is a credential connection, so one app is made once and kept.
async function ensureCallApp(key: string, settings: Record<string, any>, firmId: string, admin: SupabaseClient, connection: string, hookBase: string) {
  const ai = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
  const saved = clip(ai.call_app_id, 80);
  if (saved) return { id: saved, why: '' };
  const conn = await telnyxGet(key, `credential_connections/${encodeURIComponent(connection)}`);
  const profile = clip(conn.data?.data?.outbound?.outbound_voice_profile_id, 80);
  const made = await telnyx(key, 'call_control_applications', {
    application_name: 'Callin Kalite',
    webhook_event_url: hookBase,
    webhook_api_version: '2',
    ...(profile ? { outbound: { outbound_voice_profile_id: profile } } : {}),
  });
  const id = clip(made.data?.data?.id, 80);
  if (!made.ok || !id) return { id: '', why: `app ${telnyxWhy(made)}${profile ? '' : ' (no outbound profile on connection)'}` };
  const { data: fresh } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
  const current = (fresh?.settings || settings) as Record<string, any>;
  const next = { ...(current.ai || {}), call_app_id: id };
  await admin.from('firms').update({ settings: { ...current, ai: next } }).eq('id', firmId);
  settings.ai = next;
  return { id, why: '' };
}

function lineFrom(settings: Record<string, any>) {
  const direct = normDid(settings.line_default) || normDid(settings.dialer?.outbound_did);
  if (direct) return direct;
  const nums = Array.isArray(settings.line_numbers) ? settings.line_numbers : [];
  for (const item of nums) {
    const hit = normDid(item);
    if (hit) return hit;
  }
  return '';
}

function firmAi(settings: Record<string, any>) {
  const ai = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
  return {
    spoken_name: clip(ai.spoken_name, 80),
    lang: ai.lang === 'tr' ? 'tr' as const : 'de' as const,
    voice: ai.voice === 'female' || ai.voice === 'male' ? ai.voice : '',
    rate: Number(ai.rate) > 0 ? Number(ai.rate) : 0,
    transfer: normDid(ai.transfer),
    forbidPrice: ai.forbid_price !== false,
    forbidContract: ai.forbid_contract !== false,
    forbidOther: ai.forbid_other !== false,
    qcAssistant: clip(ai.qc_assistant_id, 80),
    engine: ai.engine === 'super' ? 'super' as const : 'std' as const,
    llm: llmOf(ai.llm),
  };
}

function campIds(row: Record<string, any>) {
  const many = Array.isArray(row?.campaign_ids) ? row.campaign_ids : [];
  const ids = many.map((id: unknown) => String(id || '')).filter((id: string) => uuidRe.test(id));
  if (ids.length) return ids;
  const one = String(row?.campaign_id || '');
  return uuidRe.test(one) ? [one] : [];
}

function staffOf(settings: Record<string, any>, staffId: string, campaignId: string) {
  const raw = Array.isArray(settings.ai_staff) ? settings.ai_staff : [];
  const hit = raw.find((row: any) => String(row?.id || '') === staffId);
  if (!hit) return { error: 'staff' as const };
  if (hit.kind !== 'qc') return { error: 'kind' as const };
  const ids = campIds(hit);
  if (ids.length && !ids.includes(campaignId)) return { error: 'staff' as const };
  const results = Array.isArray(hit.results) ? hit.results.map((key: unknown) => normKey(key)).filter(Boolean) : [];
  const engine = hit.engine === 'super' ? 'super' as const : hit.engine === 'std' ? 'std' as const : '';
  return { id: staffId, prompt: clip(hit.prompt, 2000), greeting: clip(hit.greeting, 400), results, engine, llm: clip(hit.llm, 40), voiceId: clip(hit.voice_id, 60).replace(/[^A-Za-z0-9]/g, '') };
}

function spokenBrief(brief: { ok: true; instructions: string; greeting: string; voice: string }, appt: Record<string, any>, extra: Record<string, any>, when: string) {
  return {
    ...brief,
    instructions: fillAiText(brief.instructions, appt, extra, when),
    greeting: fillAiText(brief.greeting, appt, extra, when),
  };
}

function resultChoices(settings: Record<string, any>): AiChoice[] {
  const raw = Array.isArray(settings.appointment_results) ? settings.appointment_results : [];
  if (!raw.length) {
    return [
      { key: 'basarili', label: 'Başarılı' },
      { key: 'basarisiz', label: 'Başarısız' },
      { key: 'beklemede', label: 'Beklemede' },
      { key: 'ulasilamadi', label: 'Ulaşılamadı' },
      { key: 'iptal', label: 'İptal' },
    ];
  }
  return raw.map((row: any) => ({ key: normKey(row?.key), label: clip(row?.label || row?.key, 80) })).filter((row: AiChoice) => row.key);
}

function contactStatus(key: string, settings: Record<string, any>) {
  const raw = Array.isArray(settings.appointment_results) ? settings.appointment_results : [];
  const hit = raw.find((row: any) => normKey(row?.key) === key);
  const saved = clip(hit?.contact_status, 80);
  if (saved) return saved;
  const map: Record<string, string> = {
    basarili: 'başarılı',
    basarisiz: 'başarısız',
    beklemede: 'beklemede',
    ulasilamadi: 'ulaşılamadı',
    iptal: 'iptal',
  };
  return map[key] || key.replaceAll('_', ' ');
}

function whenText(appt: Record<string, any>) {
  const raw = String(appt.termin_tarih || '');
  if (raw.length >= 16) return `${raw.slice(0, 10)} ${raw.slice(11, 16)}`;
  return raw.slice(0, 40);
}

async function ensureAssistant(key: string, settings: Record<string, any>, firmId: string, admin: SupabaseClient) {
  const ai = firmAi(settings);
  if (ai.qcAssistant) return ai.qcAssistant;
  let made = await telnyx(key, 'ai/assistants', {
    name: 'Callin Kalite',
    model: MODEL,
    instructions: 'Per-call instructions replace this text.',
  });
  if (!made.ok) {
    made = await telnyx(key, 'ai/assistants', {
      name: 'Callin Kalite',
      instructions: 'Per-call instructions replace this text.',
    });
  }
  const id = clip(made.data?.data?.id || made.data?.id, 80);
  if (!made.ok || !id) return '';
  const { data: fresh } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
  const current = (fresh?.settings || settings) as Record<string, any>;
  const next = { ...(current.ai || {}), qc_assistant_id: id };
  await admin.from('firms').update({ settings: { ...current, ai: next } }).eq('id', firmId);
  settings.ai = next;
  return id;
}

function toolDefs(url: string) {
  const hook = (name: string, description: string, toolUrl: string, properties: Record<string, unknown>) => ({
    type: 'webhook',
    webhook: {
      name,
      description,
      url: toolUrl,
      method: 'POST',
      body_parameters: { type: 'object', properties },
    },
  });
  return [
    hook('takvim_bak', 'List free appointment times in Europe/Berlin. Offer only returned times.', `${url}&tool=takvim_bak`, {
      date: { type: 'string', description: 'YYYY-MM-DD, optional' },
      after: { type: 'string', description: 'HH:MM, optional' },
    }),
    hook('sonuc_yaz', 'Write one allowed result key and optional corrected fields or a free slot id.', `${url}&tool=sonuc_yaz`, {
      result: { type: 'string', description: 'Allowed result key' },
      note: { type: 'string', description: 'Short note' },
      slot_id: { type: 'string', description: 'Free slot id from takvim_bak, optional' },
      fields: { type: 'object', description: 'Corrected form fields' },
    }),
    hook('insana_aktar', 'Transfer the call to the saved human number.', `${url}&tool=insana_aktar`, {}),
  ];
}

const FALLBACK_VOICE = 'AWS.Polly.Filiz';

function voiceOpts(voice: string, withLang = true) {
  if (voice.startsWith('AWS.')) return { type: 'aws' };
  // Azure speaks with its default en-US locale unless language_code is set.
  const lang = voice.match(/^Azure\.([a-z]{2}-[A-Z]{2})-/)?.[1] || '';
  return lang && withLang ? { language_code: lang } : {};
}

function asrFor(voice: string) {
  return voice.startsWith('Azure.tr-') ? { model: 'azure/fast', language: 'tr-TR', region: 'westeurope' } : null;
}

function assistantBody(assistantId: string, brief: { instructions: string; greeting: string; voice: string }, url: string, withVoice: boolean, withAsr = false) {
  const assistant: Record<string, unknown> = {
    id: assistantId,
    instructions: brief.instructions,
    greeting: brief.greeting,
    tools: toolDefs(url),
  };
  if (withVoice) assistant.voice_settings = { voice: brief.voice };
  const asr = withAsr ? asrFor(brief.voice) : null;
  if (asr) assistant.transcription = asr;
  return assistant;
}

async function startAssistant(key: string, control: string, assistantId: string, brief: { instructions: string; greeting: string; voice: string }, url: string) {
  const path = `calls/${encodeURIComponent(control)}/actions/ai_assistant_start`;
  const asr = asrFor(brief.voice);
  const top = { assistant: assistantBody(assistantId, brief, url, false), voice: brief.voice, voice_settings: voiceOpts(brief.voice) };
  const plain = { ...brief, voice: FALLBACK_VOICE };
  const variants: { tag: string; body: Record<string, unknown> }[] = [];
  const bare = { ...top, voice_settings: voiceOpts(brief.voice, false) };
  variants.push({ tag: 'asst_voice', body: { assistant: assistantBody(assistantId, brief, url, true, true) } });
  if (asr) variants.push({ tag: 'azure_asr', body: { ...top, transcription: asr } });
  if (asr) variants.push({ tag: 'azure_asr_nolang', body: { ...bare, transcription: asr } });
  variants.push({ tag: 'top_voice', body: top });
  variants.push({ tag: 'voice_only', body: { assistant: assistantBody(assistantId, brief, url, true) } });
  if (brief.voice.startsWith('Azure.')) {
    variants.push({ tag: 'polly', body: { assistant: assistantBody(assistantId, plain, url, false), voice: FALLBACK_VOICE, voice_settings: { type: 'aws' } } });
  }
  const whys: string[] = [];
  let last = { ok: false, status: 0, data: {} as any };
  let tag = 'err';
  for (const variant of variants) {
    last = await telnyx(key, path, variant.body);
    tag = variant.tag;
    if (last.ok) return { ...last, tag, why: whys.join(' | ') };
    whys.push(`${variant.tag}:${telnyxWhy(last)}`);
    if (last.status !== 422) break;
  }
  return { ...last, tag: 'err', why: whys.join(' | ') };
}

async function loadByToken(admin: SupabaseClient, token: string) {
  if (!tokenOk(token)) return null;
  const { data } = await admin.from('appointments').select('*').filter('form_ek->>callin_token', 'eq', token).maybeSingle();
  return data;
}

async function mergeEk(admin: SupabaseClient, appt: Record<string, any>, patch: Record<string, unknown>) {
  const ek = { ...(appt.form_ek && typeof appt.form_ek === 'object' ? appt.form_ek : {}), ...patch };
  const { error } = await admin.from('appointments').update({ form_ek: ek }).eq('id', appt.id);
  if (!error) appt.form_ek = ek;
  return !error;
}

async function placeCall(admin: SupabaseClient, user: Record<string, any>, body: Record<string, any>) {
  const appointmentId = String(body.appointment_id || '');
  const staffId = String(body.staff_id || '');
  if (!uuidRe.test(appointmentId) || !staffId) return json({ ok: false, error: 'id' }, 400);
  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!appt) return json({ ok: false, error: 'missing' }, 404);
  const role = String(user.role || '');
  if (!['super_admin', 'admin', 'firm_admin', 'qc'].includes(role)) return json({ ok: false, error: 'auth' }, 403);
  if (role !== 'super_admin' && String(user.firm_id || '') !== String(appt.firm_id || '')) return json({ ok: false, error: 'auth' }, 403);
  const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const staff = staffOf(settings, staffId, String(appt.campaign_id || ''));
  if ('error' in staff) return json({ ok: false, error: staff.error }, 400);
  const ai = firmAi(settings);
  // The staff member's own engine wins; firms that never chose per staff keep their old firm-level choice.
  ai.engine = staff.engine || ai.engine;
  ai.llm = llmOf(staff.llm || ai.llm);
  const choices = allowedChoices('qc', staff.results, resultChoices(settings));
  const extra = appt.form_ek && typeof appt.form_ek === 'object' ? appt.form_ek : {};
  const note = clip(body.note, 800);
  const brief = buildAiBrief({
    kind: 'qc',
    lang: ai.lang,
    company: ai.spoken_name,
    rate: ai.rate,
    prompt: staff.prompt,
    greetingText: staff.greeting,
    note,
    forbidPrice: ai.forbidPrice,
    forbidContract: ai.forbidContract,
    forbidOther: ai.forbidOther,
    transfer: ai.transfer,
    voice: ai.voice,
    allowed: choices,
    fields: fieldLines(ai.lang, appt, extra),
    when: whenText(appt),
    engine: ai.engine,
  });
  if (!brief.ok) return json({ ok: false, error: brief.error }, 400);
  const to = normDid(appt.telefonnummer);
  if (!to) return json({ ok: false, error: 'phone' }, 400);
  const { data: camp } = await admin.from('campaigns').select('telnyx_did').eq('id', appt.campaign_id).maybeSingle();
  const from = normDid(camp?.telnyx_did) || lineFrom(settings);
  if (ai.engine === 'super') {
    return placeEleven(admin, appt, settings, { staffId: staff.id, by: String(user.id || ''), voiceId: staff.voiceId, llm: ai.llm, note, extra, to, from, speech: spokenBrief(brief, appt, extra, whenText(appt)) });
  }
  const connection = clip(settings.integrations?.sip_connection_id, 80);
  const key = clip(settings.integrations?.telnyx_api_key, 200);
  if (!key) return json({ ok: false, error: 'nokey' }, 400);
  if (!connection) return json({ ok: false, error: 'noconnection' }, 400);
  if (!from) return json({ ok: false, error: 'nodid' }, 400);
  const state = String(extra.callin_state || '');
  const at = Date.parse(String(extra.callin_at || ''));
  if (state === 'dialing' && at && Date.now() - at < 120000) return json({ ok: false, error: 'busy' }, 409);
  const assistantId = await ensureAssistant(key, settings, String(appt.firm_id), admin);
  if (!assistantId) return json({ ok: false, error: 'assistant' }, 502);
  const token = newToken();
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const hook = `${base}/functions/v1/telnyx-ai?callin=${token}`;
  const app = await ensureCallApp(key, settings, String(appt.firm_id), admin, connection, `${base}/functions/v1/telnyx-ai`);
  if (!app.id) return json({ ok: false, error: 'callapp', detail: clip(app.why, 300) }, 502);
  const saved = await mergeEk(admin, appt, {
    callin_note: note,
    callin_staff_id: staff.id,
    callin_token: token,
    callin_state: 'dialing',
    callin_at: new Date().toISOString(),
    callin_error: '',
    callin_billed: '',
    callin_started: '',
    callin_warm: '',
    callin_retry: '',
    callin_error_detail: '',
    callin_error_first: '',
    callin_voice_used: '',
  });
  if (!saved) return json({ ok: false, error: 'save' }, 500);
  const callBody = {
    connection_id: app.id,
    to,
    from,
    webhook_url: hook,
    webhook_url_method: 'POST',
    client_state: packState({ token, appointment_id: appointmentId, firm_id: String(appt.firm_id) }),
  };
  // Plain dial; the assistant starts on answer so voice problems come back as readable 422s with a fallback.
  const dial = await telnyx(key, 'calls', callBody);
  const control = clip(dial.data?.data?.call_control_id || '', 120);
  const warm = false;
  const firstWhy = '';
  if (!dial.ok || !control) {
    const why = telnyxWhy(dial);
    console.error('telnyx dial failed', firstWhy, why);
    await mergeEk(admin, appt, { callin_state: 'idle', callin_error: 'dial', callin_error_detail: clip(why, 300), callin_error_first: clip(firstWhy, 300) });
    return json({ ok: false, error: 'dial', detail: clip(why, 300), first: clip(firstWhy, 300) }, 502);
  }
  await mergeEk(admin, appt, { callin_control: control, callin_warm: warm ? '1' : '', callin_error_first: clip(firstWhy, 300) });
  return json({ ok: true });
}

function elementsFor(settings: Record<string, any>, from: string, hook: string) {
  const ai = firmAi(settings);
  const integ = settings.integrations || {};
  return {
    firmId: '',
    settings,
    key: clip(integ.elevenlabs_api_key, 300),
    hook,
    lang: ai.lang,
    llm: ai.llm,
    voice: ai.voice,
    voiceId: '',
    from,
    sipUser: clip(integ.sip_username, 120),
    sipPass: clip(integ.sip_password, 200),
  };
}

async function placeEleven(
  admin: SupabaseClient,
  appt: Record<string, any>,
  settings: Record<string, any>,
  job: { staffId: string; by: string; voiceId: string; llm: string; note: string; extra: Record<string, any>; to: string; from: string; speech: { instructions: string; greeting: string } },
) {
  const key = clip(settings.integrations?.elevenlabs_api_key, 300);
  if (!key) return json({ ok: false, error: 'nokey_el' }, 400);
  if (!job.from) return json({ ok: false, error: 'nodid' }, 400);
  const state = String(job.extra.callin_state || '');
  const at = Date.parse(String(job.extra.callin_at || ''));
  if (state === 'dialing' && at && Date.now() - at < 120000) return json({ ok: false, error: 'busy' }, 409);
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const ctx = elementsFor(settings, job.from, `${base}/functions/v1/telnyx-ai`);
  ctx.firmId = String(appt.firm_id);
  ctx.llm = llmOf(job.llm);
  ctx.voiceId = job.voiceId;
  const ready = await ensureEleven(admin, ctx);
  if (!ready.ok || !ready.agentId || !ready.phoneId) {
    return json({ ok: false, error: 'eleven', detail: clip(ready.why || 'setup', 300) }, 502);
  }
  const token = newToken();
  const saved = await mergeEk(admin, appt, {
    callin_note: job.note,
    callin_staff_id: job.staffId,
    callin_token: token,
    callin_state: 'dialing',
    callin_at: new Date().toISOString(),
    callin_engine: 'eleven',
    callin_by: job.by,
    callin_log: '',
    callin_conv: '',
    callin_error: '',
    callin_billed: '',
    callin_started: '',
    callin_warm: '',
    callin_retry: '',
    callin_error_detail: '',
    callin_error_first: '',
    callin_voice_used: 'eleven',
  });
  if (!saved) return json({ ok: false, error: 'save' }, 500);
  const dial = await elDial(key, ready.agentId, ready.phoneId, job.to, {
    brief: job.speech.instructions,
    greeting: job.speech.greeting,
    callin_token: token,
  });
  if (!dial.ok) {
    await mergeEk(admin, appt, { callin_state: 'idle', callin_error: 'dial', callin_error_detail: clip(dial.why, 300) });
    return json({ ok: false, error: 'dial', detail: clip(dial.why, 300) }, 502);
  }
  await mergeEk(admin, appt, { callin_conv: dial.conv, callin_started: '1' });
  return json({ ok: true, engine: 'super' });
}

async function syncEleven(admin: SupabaseClient, appt: Record<string, any>) {
  const extra = appt.form_ek || {};
  if (extra.callin_engine !== 'eleven' || !extra.callin_conv) return { state: String(extra.callin_state || ''), done: String(extra.callin_state || '') === 'done' };
  const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const key = clip(firm?.settings?.integrations?.elevenlabs_api_key, 300);
  if (String(extra.callin_billed || '') === '1') {
    // Billing is done; a missing call-history row (audio not ready earlier) is retried here.
    if (key && !extra.callin_log && Number(extra.callin_sec) > 0) {
      const again = await elConversation(key, String(extra.callin_conv));
      if (again.ok) await saveElevenLog(admin, appt, key, String(extra.callin_conv), again);
    }
    return { state: 'done', done: true };
  }
  if (!key) return { state: 'dialing', done: false };
  const conv = await elConversation(key, String(extra.callin_conv));
  if (!conv.ok) return { state: 'dialing', done: false, why: conv.why };
  if (conv.status !== 'done' && conv.status !== 'failed') return { state: 'dialing', done: false, status: conv.status };
  await onHangup(admin, appt, { duration_secs: conv.secs });
  if (conv.secs <= 0) await mergeEk(admin, appt, { callin_error: 'noanswer' });
  else await saveElevenLog(admin, appt, key, String(extra.callin_conv), conv);
  return { state: 'done', done: true, secs: conv.secs };
}

// Puts the finished AI call into the normal call history with its recording and transcript.
async function saveElevenLog(
  admin: SupabaseClient,
  appt: Record<string, any>,
  key: string,
  conv: string,
  info: { secs: number; start: number; summary: string; transcript: string },
) {
  if (!conv || appt.form_ek?.callin_log) return;
  const tag = `el:${conv}`;
  const { data: dup } = await admin.from('call_logs').select('id').eq('telnyx_call_id', tag).maybeSingle();
  if (dup?.id) {
    await mergeEk(admin, appt, { callin_log: dup.id });
    return;
  }
  let url = '';
  for (let attempt = 0; attempt < 4 && !url; attempt += 1) {
    const audio = await elAudio(key, conv);
    if (audio.ok && audio.bytes.byteLength > 500) {
      const path = `${appt.firm_id}/el-${conv}.mp3`;
      const up = await admin.storage.from('call-recordings').upload(path, audio.bytes, { contentType: audio.type || 'audio/mpeg', upsert: true });
      if (!up.error) url = admin.storage.from('call-recordings').getPublicUrl(path).data.publicUrl;
    }
    if (!url && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  const secs = Math.max(0, Math.round(info.secs));
  const started = info.start ? new Date(info.start * 1000).toISOString() : new Date(Date.now() - secs * 1000).toISOString();
  const by = String(appt.form_ek?.callin_by || '');
  const notes = [info.summary, info.transcript].filter(Boolean).join('\n\n').slice(0, 3500);
  const row = {
    contact_id: appt.contact_id || null,
    campaign_id: appt.campaign_id || null,
    firm_id: appt.firm_id,
    agent_id: uuidRe.test(by) ? by : null,
    phone: clip(appt.telefonnummer, 40) || null,
    outcome: 'qc_ai',
    duration_sec: secs,
    notes,
    telnyx_call_id: tag,
    started_at: started,
    ended_at: new Date().toISOString(),
    recording_url: url || null,
    work_type: 'ai_qc',
  };
  const { data: made, error } = await admin.from('call_logs').insert(row).select('id').maybeSingle();
  if (error) console.error('call log insert failed', error.message);
  if (made?.id) await mergeEk(admin, appt, { callin_log: made.id });
}

async function sweepEleven(admin: SupabaseClient, firmId: string) {
  const { data } = await admin.from('appointments').select('*').eq('firm_id', firmId).filter('form_ek->>callin_engine', 'eq', 'eleven').filter('form_ek->>callin_state', 'eq', 'dialing').limit(5);
  for (const row of data || []) {
    const at = Date.parse(String(row.form_ek?.callin_at || ''));
    if (at && Date.now() - at < 60000) continue;
    await syncEleven(admin, row).catch(() => null);
  }
}

function qcBrief(settings: Record<string, any>, appt: Record<string, any>, extra: Record<string, any>, staffId: string, note: string) {
  const staff = staffOf(settings, staffId, String(appt.campaign_id || ''));
  if ('error' in staff) return null;
  const ai = firmAi(settings);
  const brief = buildAiBrief({
    kind: 'qc',
    lang: ai.lang,
    company: ai.spoken_name,
    rate: ai.rate,
    prompt: staff.prompt,
    greetingText: staff.greeting,
    note,
    forbidPrice: ai.forbidPrice,
    forbidContract: ai.forbidContract,
    forbidOther: ai.forbidOther,
    transfer: ai.transfer,
    voice: ai.voice,
    allowed: allowedChoices('qc', staff.results, resultChoices(settings)),
    fields: fieldLines(ai.lang, appt, extra),
    when: whenText(appt),
  });
  return brief.ok ? spokenBrief(brief, appt, extra, whenText(appt)) : null;
}

async function onAnswer(admin: SupabaseClient, appt: Record<string, any>, control: string) {
  const extra = appt.form_ek || {};
  if (extra.callin_started === '1' || String(extra.callin_warm || '') === '1') return;
  const saved = String(extra.callin_control || '');
  if (saved && saved !== control) return;
  if (!saved) await mergeEk(admin, appt, { callin_control: control });
  const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const staff = staffOf(settings, String(extra.callin_staff_id || ''), String(appt.campaign_id || ''));
  const ai = firmAi(settings);
  const key = clip(settings.integrations?.telnyx_api_key, 200);
  if ('error' in staff || !key || !ai.qcAssistant) {
    if (key) await telnyx(key, `calls/${encodeURIComponent(control)}/actions/hangup`, {});
    await mergeEk(admin, appt, { callin_state: 'idle', callin_error: 'start' });
    return;
  }
  const choices = allowedChoices('qc', staff.results, resultChoices(settings));
  const brief = buildAiBrief({
    kind: 'qc',
    lang: ai.lang,
    company: ai.spoken_name,
    rate: ai.rate,
    prompt: staff.prompt,
    greetingText: staff.greeting,
    note: clip(extra.callin_note, 800),
    forbidPrice: ai.forbidPrice,
    forbidContract: ai.forbidContract,
    forbidOther: ai.forbidOther,
    transfer: ai.transfer,
    voice: ai.voice,
    allowed: choices,
    fields: fieldLines(ai.lang, appt, extra),
    when: whenText(appt),
  });
  if (!brief.ok) {
    await telnyx(key, `calls/${encodeURIComponent(control)}/actions/hangup`, {});
    await mergeEk(admin, appt, { callin_state: 'idle', callin_error: brief.error });
    return;
  }
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const hook = `${base}/functions/v1/telnyx-ai?callin=${extra.callin_token}`;
  const speech = spokenBrief(brief, appt, extra, whenText(appt));
  // Make the stored assistant itself carry the call voice and speech model, then read it back for diagnostics.
  const asrCfg = asrFor(speech.voice);
  const patched = await fetch(`https://api.telnyx.com/v2/ai/assistants/${encodeURIComponent(ai.qcAssistant)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_settings: { voice: speech.voice }, ...(asrCfg ? { transcription: asrCfg } : {}) }),
  });
  const patchBody = await patched.json().catch(() => ({}));
  const seen = patchBody?.data || patchBody || {};
  await mergeEk(admin, appt, {
    callin_debug: clip(JSON.stringify({ patch: patched.status, vs: seen.voice_settings, tr: seen.transcription, lang: seen.language, model: seen.model, err: patched.ok ? undefined : patchBody?.errors }), 400),
  });
  const started = await startAssistant(key, control, ai.qcAssistant, speech, hook);
  if (!started.ok) {
    await telnyx(key, `calls/${encodeURIComponent(control)}/actions/hangup`, {});
    await mergeEk(admin, appt, { callin_state: 'idle', callin_error: 'start', callin_error_detail: clip(started.why, 300) });
    return;
  }
  await mergeEk(admin, appt, { callin_started: '1', callin_voice_used: started.tag, callin_error_first: clip(started.why, 300) });
}

async function onHangup(admin: SupabaseClient, appt: Record<string, any>, payload: Record<string, any>) {
  const extra = appt.form_ek || {};
  if (String(extra.callin_billed || '') === '1') return;
  const { data: firm } = await admin.from('firms').select('settings,balance').eq('id', appt.firm_id).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const rate = firmAi(settings).rate;
  const direct = Number(payload.duration_secs ?? payload.duration_sec ?? 0);
  let sec = direct > 0 ? direct : 0;
  const start = Date.parse(String(payload.start_time || ''));
  const end = Date.parse(String(payload.end_time || ''));
  if (!sec && start && end && end > start) sec = Math.round((end - start) / 1000);
  const cost = sec > 0 && rate > 0 ? Math.round((sec / 60) * rate * 100) / 100 : 0;
  const ek = {
    ...(extra && typeof extra === 'object' ? extra : {}),
    callin_billed: '1',
    callin_state: 'done',
    callin_sec: String(sec),
    callin_cost: String(cost),
  };
  const { data: claimed } = await admin.from('appointments').update({ form_ek: ek }).eq('id', appt.id).eq('form_ek->>callin_billed', String(extra.callin_billed || '')).select('id');
  if (!Array.isArray(claimed) || !claimed.length) return;
  appt.form_ek = ek;
  if (cost <= 0) return;
  let balance = Number(firm?.balance || 0);
  let wrote = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = Math.round((balance - cost) * 100) / 100;
    const { data } = await admin.from('firms').update({ balance: next }).eq('id', appt.firm_id).eq('balance', balance).select('balance');
    if (Array.isArray(data) && data.length) { wrote = true; break; }
    const fresh = await admin.from('firms').select('balance').eq('id', appt.firm_id).maybeSingle();
    balance = Number(fresh.data?.balance || 0);
  }
  if (!wrote) {
    const next = Math.round((balance - cost) * 100) / 100;
    await admin.from('firms').update({ balance: next }).eq('id', appt.firm_id);
  }
}

async function freeSlots(admin: SupabaseClient, appt: Record<string, any>, args: Record<string, any>) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : '';
  const after = /^\d{2}:\d{2}$/.test(String(args.after || '')) ? String(args.after) : '';
  const today = berlinDay();
  const now = berlinClock();
  let query = admin.from('takvim_slots').select('id,tarih,baslangic_saat,bitis_saat,alta_tasindi').eq('campaign_id', appt.campaign_id).eq('firm_id', appt.firm_id).eq('durum', 'bos').eq('gun_kapali', false).gte('tarih', day || today).order('tarih', { ascending: true }).order('baslangic_saat', { ascending: true }).limit(80);
  if (day) query = query.eq('tarih', day);
  const { data } = await query;
  const rows = (data || []).filter((slot) => {
    if (slot.alta_tasindi) return false;
    const time = String(slot.baslangic_saat || '').slice(0, 5);
    if (slot.tarih === today && time <= now) return false;
    if (after && slot.tarih === (day || today) && time <= after) return false;
    return true;
  }).slice(0, 8);
  return {
    result: rows.length ? rows.map((slot) => `${slot.tarih} ${String(slot.baslangic_saat || '').slice(0, 5)} id=${slot.id}`).join('\n') : 'no_free_time',
  };
}

async function writeResult(admin: SupabaseClient, appt: Record<string, any>, args: Record<string, any>) {
  const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const extra = appt.form_ek || {};
  const staff = staffOf(settings, String(extra.callin_staff_id || ''), String(appt.campaign_id || ''));
  if ('error' in staff) return { result: 'no_staff' };
  const choices = allowedChoices('qc', staff.results, resultChoices(settings));
  const key = normKey(args.result);
  if (!resultAllowed('qc', key, choices.map((row) => row.key))) return { result: 'result_denied' };
  const patch: Record<string, unknown> = { durum: key };
  const extras: Record<string, string> = {};
  let rawFields: unknown = args.fields;
  if (typeof args.fields_json === 'string' && args.fields_json.trim()) {
    try { rawFields = JSON.parse(args.fields_json); } catch { rawFields = {}; }
  }
  const fields = rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields) ? rawFields as Record<string, unknown> : {};
  Object.entries(fields).forEach(([name, value]) => {
    if (value && typeof value === 'object') return;
    const col = normKey(name);
    const text = clip(value, 180);
    if (!col || !text || col.startsWith('callin_')) return;
    if (APPT_COLS.includes(col)) patch[col] = text;
    else if (/^[a-z0-9_]{1,40}$/.test(col)) extras[col] = text;
  });
  const note = clip(args.note, 500);
  if (note) patch.qc_notu = note;
  const slotId = String(args.slot_id || '');
  if (uuidRe.test(slotId)) {
    const { data: slot } = await admin.from('takvim_slots').select('id,tarih,baslangic_saat,durum,campaign_id,firm_id,gun_kapali,alta_tasindi').eq('id', slotId).maybeSingle();
    const time = String(slot?.baslangic_saat || '').slice(0, 5);
    const open = slot && slot.durum === 'bos' && !slot.gun_kapali && !slot.alta_tasindi && String(slot.campaign_id) === String(appt.campaign_id) && String(slot.firm_id) === String(appt.firm_id);
    if (!open) return { result: 'slot_taken' };
    const { data: moved } = await admin.from('takvim_slots').update({ durum: 'dolu', appointment_id: appt.id, kilitli_agent_id: null, kilitli_at: null }).eq('id', slotId).eq('durum', 'bos').select('id');
    if (!Array.isArray(moved) || !moved.length) return { result: 'slot_taken' };
    if (appt.slot_id && appt.slot_id !== slotId) {
      await admin.from('takvim_slots').update({ durum: 'bos', appointment_id: null }).eq('id', appt.slot_id);
    }
    patch.slot_id = slotId;
    patch.termin_tarih = `${slot.tarih}T${time}:00`;
  }
  const { data: live } = await admin.from('appointments').select('form_ek').eq('id', appt.id).maybeSingle();
  const ek = { ...(live?.form_ek && typeof live.form_ek === 'object' ? live.form_ek : extra), ...extras };
  patch.form_ek = ek;
  const { error } = await admin.from('appointments').update(patch).eq('id', appt.id);
  if (error) {
    if (uuidRe.test(slotId)) {
      await admin.from('takvim_slots').update({ durum: 'bos', appointment_id: null }).eq('id', slotId);
      if (appt.slot_id && appt.slot_id !== slotId) {
        await admin.from('takvim_slots').update({ durum: 'dolu', appointment_id: appt.id }).eq('id', appt.slot_id);
      }
    }
    return { result: 'save_failed' };
  }
  if (appt.contact_id) {
    await admin.from('contacts').update({ status: contactStatus(key, settings) }).eq('id', appt.contact_id);
  }
  const { data: fresh } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const callKey = clip((fresh?.settings || settings).integrations?.telnyx_api_key, 200);
  const control = clip(extra.callin_control, 120);
  if (callKey && control) await telnyx(callKey, `calls/${encodeURIComponent(control)}/actions/hangup`, {});
  return { result: `saved ${key}` };
}

async function transferCall(admin: SupabaseClient, appt: Record<string, any>) {
  const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const to = firmAi(settings).transfer;
  const key = clip(settings.integrations?.telnyx_api_key, 200);
  const control = clip(appt.form_ek?.callin_control, 120);
  if (!to) return { result: 'no_transfer_number' };
  if (!key || !control) return { result: 'no_call' };
  const moved = await telnyx(key, `calls/${encodeURIComponent(control)}/actions/transfer`, { to });
  return { result: moved.ok ? 'transferred' : 'transfer_failed' };
}

function toolRequest(body: Record<string, any>, hinted: string) {
  const names = ['takvim_bak', 'sonuc_yaz', 'insana_aktar'];
  const payload = body?.data?.payload && typeof body.data.payload === 'object' ? body.data.payload : body;
  let name = String(payload?.name || payload?.tool_name || payload?.function?.name || '');
  if (!names.includes(name) && names.includes(hinted)) name = hinted;
  if (!names.includes(name)) return null;
  let args = payload?.arguments ?? payload?.function?.arguments;
  if (args == null && !body?.data?.event_type) args = body;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  return { name, args: args as Record<string, any> };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  let body: Record<string, any> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: 'json' }, 400); }
  const url = new URL(req.url);
  const queryToken = String(url.searchParams.get('callin') || '');
  const hinted = String(url.searchParams.get('tool') || '');
  const event = String(body?.data?.event_type || '');
  const tool = toolRequest(body, hinted);
  if (event || tool) {
    // ElevenLabs tool calls carry no Telnyx signature; their per-call secret token in the URL is the proof.
    const fromEleven = !event && !!tool && !req.headers.get('telnyx-signature-ed25519');
    if (!fromEleven && !await verifySignature(raw, req)) return json({ error: 'signature' }, 401);
    const admin = adminClient();
    const state = unpackState(body?.data?.payload?.client_state);
    const token = tokenOk(queryToken) ? queryToken : String(state?.token || '');
    const appt = await loadByToken(admin, token);
    if (!appt) return json({ result: 'unknown' }, 404);
    if (state?.token && state.token !== token) return json({ error: 'token' }, 401);
    if (fromEleven && appt.form_ek?.callin_engine !== 'eleven') return json({ error: 'token' }, 401);
    if (event === 'call.answered') {
      const control = clip(body?.data?.payload?.call_control_id, 120);
      if (control) await onAnswer(admin, appt, control);
      return json({ ok: true });
    }
    if (event === 'call.hangup') {
      await onHangup(admin, appt, body?.data?.payload || {});
      return json({ ok: true });
    }
    if (event === 'call.conversation.start_failed') {
      const control = clip(body?.data?.payload?.call_control_id, 120);
      const { data: firm } = await admin.from('firms').select('settings').eq('id', appt.firm_id).maybeSingle();
      const settings = (firm?.settings || {}) as Record<string, any>;
      const key = clip(settings.integrations?.telnyx_api_key, 200);
      const ai = firmAi(settings);
      const seen = String(appt.form_ek?.callin_retry || '') === '1';
      await mergeEk(admin, appt, { callin_retry: '1', callin_error_detail: clip(`start_failed ${JSON.stringify(body?.data?.payload || {})}`, 300) });
      if (!seen && key && control && ai.qcAssistant) {
        const extra = appt.form_ek || {};
        const speech = qcBrief(settings, appt, extra, String(extra.callin_staff_id || ''), clip(extra.callin_note, 800));
        if (speech) {
          const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
          const hook = `${base}/functions/v1/telnyx-ai?callin=${extra.callin_token}`;
          const plain = { ...speech, voice: FALLBACK_VOICE };
          const again = await telnyx(key, `calls/${encodeURIComponent(control)}/actions/ai_assistant_start`, {
            assistant: assistantBody(ai.qcAssistant, plain, hook, false),
            voice: FALLBACK_VOICE,
            voice_settings: { type: 'aws' },
          });
          if (again.ok) {
            await mergeEk(admin, appt, { callin_state: 'dialing', callin_error: '', callin_started: '1', callin_voice_used: 'polly' });
            return json({ ok: true });
          }
        }
      }
      if (key && control) await telnyx(key, `calls/${encodeURIComponent(control)}/actions/hangup`, {});
      await mergeEk(admin, appt, { callin_state: 'idle', callin_error: 'start' });
      return json({ ok: true });
    }
    if (tool?.name === 'takvim_bak') return json(await freeSlots(admin, appt, tool.args));
    if (tool?.name === 'sonuc_yaz') return json(await writeResult(admin, appt, tool.args));
    if (tool?.name === 'insana_aktar') return json(await transferCall(admin, appt));
    return json({ ok: true });
  }

  const action = String(body?.action || '');
  if (!['place', 'sync', 'eleven_setup', 'voices', 'voice_add'].includes(action)) return json({ error: 'action' }, 400);
  const session = String(req.headers.get('x-mb-session') || '').trim();
  if (session.length < 32) return json({ error: 'auth' }, 401);
  const admin = adminClient();
  const { data: sess } = await admin.from('app_sessions').select('user_id, expires_at').eq('token', session).maybeSingle();
  if (!sess?.user_id || new Date(sess.expires_at).getTime() <= Date.now()) return json({ error: 'auth' }, 401);
  const { data: user } = await admin.from('users').select('id, firm_id, role, is_active').eq('id', sess.user_id).maybeSingle();
  if (!user || user.is_active === false) return json({ error: 'auth' }, 401);
  if (action === 'sync') return syncAction(admin, user, body);
  if (action === 'eleven_setup') return setupAction(admin, user, body);
  if (action === 'voices' || action === 'voice_add') return voiceAction(admin, user, body, action);
  return placeCall(admin, user, body);
});

async function syncAction(admin: SupabaseClient, user: Record<string, any>, body: Record<string, any>) {
  const id = String(body.appointment_id || '');
  if (!uuidRe.test(id)) return json({ ok: false, error: 'id' }, 400);
  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return json({ ok: false, error: 'missing' }, 404);
  const role = String(user.role || '');
  if (!['super_admin', 'admin', 'firm_admin', 'qc'].includes(role)) return json({ ok: false, error: 'auth' }, 403);
  if (role !== 'super_admin' && String(user.firm_id || '') !== String(appt.firm_id || '')) return json({ ok: false, error: 'auth' }, 403);
  const res = await syncEleven(admin, appt);
  await sweepEleven(admin, String(appt.firm_id)).catch(() => null);
  const { data: fresh } = await admin.from('appointments').select('durum, form_ek').eq('id', id).maybeSingle();
  return json({
    ok: true,
    done: !!res.done,
    state: res.state,
    secs: Number((res as any).secs || fresh?.form_ek?.callin_sec || 0),
    durum: String(fresh?.durum || ''),
    error: String(fresh?.form_ek?.callin_error || ''),
  });
}

// Voice picker backend: lists voices with preview links and adds a chosen library voice to the account.
async function voiceAction(admin: SupabaseClient, user: Record<string, any>, body: Record<string, any>, action: string) {
  const role = String(user.role || '');
  if (!['super_admin', 'admin', 'firm_admin'].includes(role)) return json({ ok: false, error: 'auth' }, 403);
  const firmId = role === 'super_admin' ? String(body.firm_id || user.firm_id || '') : String(user.firm_id || '');
  if (!uuidRe.test(firmId)) return json({ ok: false, error: 'id' }, 400);
  const { data: firm } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
  const key = clip(firm?.settings?.integrations?.elevenlabs_api_key, 300);
  if (!key) return json({ ok: false, error: 'nokey_el' }, 400);
  if (action === 'voice_add') {
    const id = clip(body.voice_id, 60).replace(/[^A-Za-z0-9]/g, '');
    const owner = clip(body.owner, 100).replace(/[^A-Za-z0-9]/g, '');
    if (!id) return json({ ok: false, error: 'id' }, 400);
    const added = await elVoiceAdd(key, id, owner, clip(body.name, 40));
    if (!added.ok) return json({ ok: false, error: 'eleven', detail: clip(added.why, 300) }, 502);
    return json({ ok: true, voice_id: id });
  }
  const page = Math.max(0, Math.min(40, Math.floor(Number(body.page) || 0)));
  const list = await elVoices(key, {
    lang: body.lang === 'tr' ? 'tr' : 'de',
    gender: String(body.gender || ''),
    q: clip(body.q, 60),
    page,
    mine: body.mine === true,
  });
  if (!list.ok) return json({ ok: false, error: 'eleven', detail: clip(list.why, 300) }, 502);
  return json({ ok: true, voices: list.voices, more: list.more });
}

async function setupAction(admin: SupabaseClient, user: Record<string, any>, body: Record<string, any>) {
  const role = String(user.role || '');
  if (!['super_admin', 'admin', 'firm_admin'].includes(role)) return json({ ok: false, error: 'auth' }, 403);
  const firmId = role === 'super_admin' ? String(body.firm_id || user.firm_id || '') : String(user.firm_id || '');
  if (!uuidRe.test(firmId)) return json({ ok: false, error: 'id' }, 400);
  const { data: firm } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
  const settings = (firm?.settings || {}) as Record<string, any>;
  const key = clip(settings.integrations?.elevenlabs_api_key, 300);
  if (!key) return json({ ok: false, error: 'nokey_el' }, 400);
  const check = await el(key, 'GET', '/v1/convai/agents?page_size=1');
  if (!check.ok) return json({ ok: false, error: 'eleven', detail: `key ${elWhy(check)}` }, 502);
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const from = lineFrom(settings);
  const ctx = elementsFor(settings, from, `${base}/functions/v1/telnyx-ai`);
  ctx.firmId = firmId;
  const ready = await ensureEleven(admin, ctx);
  if (!ready.ok) return json({ ok: false, error: 'eleven', detail: clip(ready.why, 300) }, 502);
  return json({ ok: true, steps: ready.log, phone: !!ready.phoneId });
}
