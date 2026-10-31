// ElevenLabs Agents ("Süper" motor). Telnyx only carries the call as a SIP trunk.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { clip, normDid } from './instruct.ts';

const EL = 'https://api.elevenlabs.io';

export const EL_LLMS = ['gemini-2.5-flash', 'gpt-4o-mini', 'claude-haiku-4-5', 'gpt-4o', 'claude-sonnet-4-5'];
export const EL_DEFAULT_LLM = 'gemini-2.5-flash';
const TTS_MODEL = 'eleven_turbo_v2_5';
// Premade multilingual voices, used only when no Turkish library voice can be attached.
const FALLBACK_VOICES: Record<string, string> = { female: '21m00Tcm4TlvDq8ikWAM', male: 'pNInz6obpgDQGcFmaJgB' };

type Res = { ok: boolean; status: number; data: any };

export async function el(key: string, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function elWhy(res: Res) {
  const d = res.data?.detail ?? res.data;
  let text = '';
  if (typeof d === 'string') text = d;
  else if (Array.isArray(d)) text = d.map((row: any) => `${(row?.loc || []).join('.')} ${row?.msg || ''}`.trim()).join(' | ');
  else if (d && typeof d === 'object') text = [d.status, d.message, d.code].filter(Boolean).join(' ') || JSON.stringify(d);
  return `${res.status} ${text}`.trim().slice(0, 300);
}

export function llmOf(value: unknown) {
  const id = String(value || '');
  return EL_LLMS.includes(id) ? id : EL_DEFAULT_LLM;
}

async function saveEl(admin: SupabaseClient, firmId: string, patch: Record<string, unknown>) {
  const { data: fresh } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
  const current = (fresh?.settings || {}) as Record<string, any>;
  const ai = current.ai && typeof current.ai === 'object' ? current.ai : {};
  const eleven = { ...(ai.eleven && typeof ai.eleven === 'object' ? ai.eleven : {}), ...patch };
  await admin.from('firms').update({ settings: { ...current, ai: { ...ai, eleven } } }).eq('id', firmId);
  return eleven as Record<string, any>;
}

function webhookTool(name: string, description: string, url: string, props: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  Object.entries(props).forEach(([key, text]) => { properties[key] = { type: 'string', description: text }; });
  return {
    tool_config: {
      type: 'webhook',
      name,
      description,
      response_timeout_secs: 20,
      api_schema: {
        url,
        method: 'POST',
        query_params_schema: {
          properties: {
            callin: { type: 'string', dynamic_variable: 'callin_token' },
            tool: { type: 'string', constant_value: name },
          },
        },
        ...(Object.keys(properties).length ? { request_body_schema: { type: 'object', properties } } : {}),
      },
    },
  };
}

async function ensureTools(key: string, saved: Record<string, any>, hook: string) {
  const ids: Record<string, string> = { ...(saved.tools || {}) };
  const defs: { name: string; make: () => unknown }[] = [
    {
      name: 'takvim_bak',
      make: () => webhookTool('takvim_bak', 'List free appointment times (Europe/Berlin). Offer only returned times.', hook, {
        date: 'YYYY-MM-DD, optional',
        after: 'HH:MM, optional',
      }),
    },
    {
      name: 'sonuc_yaz',
      make: () => webhookTool('sonuc_yaz', 'Write one allowed result key. Optionally a short note, a free slot id from takvim_bak, and corrected fields as JSON text.', hook, {
        result: 'Allowed result key',
        note: 'Short note, optional',
        slot_id: 'Free slot id from takvim_bak, optional',
        fields_json: 'Corrected form fields as JSON text, optional',
      }),
    },

  ];
  for (const def of defs) {
    if (ids[def.name]) continue;
    const made = await el(key, 'POST', '/v1/convai/tools', def.make());
    const id = clip(made.data?.id, 80);
    if (!made.ok || !id) return { ids, why: `tool ${def.name} ${elWhy(made)}` };
    ids[def.name] = id;
  }
  return { ids, why: '' };
}

type VoiceTry = { id: string; owner: string; fallback?: boolean };

async function voiceCandidates(key: string, lang: string, kind: string) {
  const gender = kind === 'male' ? 'male' : 'female';
  const base = `/v1/shared-voices?page_size=10&language=${lang === 'tr' ? 'tr' : 'de'}&gender=${gender}&sort=usage_character_count_7d`;
  let shared = await el(key, 'GET', `${base}&use_cases=conversational`);
  let list = Array.isArray(shared.data?.voices) ? shared.data.voices : [];
  if (!list.length) {
    shared = await el(key, 'GET', base);
    list = Array.isArray(shared.data?.voices) ? shared.data.voices : [];
  }
  const out: VoiceTry[] = [];
  list.forEach((row: any) => {
    const id = clip(row?.voice_id, 60);
    if (id && !out.some((item) => item.id === id)) out.push({ id, owner: clip(row?.public_owner_id, 100) });
  });
  return out.slice(0, 4);
}

// Library voices must sit in "My voices" before an agent may use them.
async function addToLibrary(key: string, voice: VoiceTry) {
  if (!voice.owner) return;
  await el(key, 'POST', `/v1/voices/add/${encodeURIComponent(voice.owner)}/${encodeURIComponent(voice.id)}`, { new_name: `Callin ${voice.id.slice(0, 6)}` });
}

function agentConfig(lang: string, llm: string, toolIds: string[], voiceId: string) {
  return {
    agent: {
      first_message: '{{greeting}}',
      language: lang === 'tr' ? 'tr' : 'de',
      dynamic_variables: { dynamic_variable_placeholders: { brief: 'brief', greeting: 'greeting', callin_token: 'token' } },
      prompt: { prompt: '{{brief}}', llm, temperature: 0.4, timezone: 'Europe/Berlin', tool_ids: toolIds, built_in_tools: { end_call: { name: 'end_call', description: '', params: { system_tool_type: 'end_call' } } } },
    },
    tts: { model_id: TTS_MODEL, voice_id: voiceId, stability: 0.5, similarity_boost: 0.8, speed: 1 },
    conversation: { max_duration_seconds: 420 },
  };
}

export type ElevenSetup = {
  firmId: string;
  settings: Record<string, any>;
  key: string;
  hook: string;
  lang: string;
  llm: string;
  voice: string;
  voiceId?: string;
  from: string;
  sipUser: string;
  sipPass: string;
};

export async function ensureEleven(admin: SupabaseClient, ctx: ElevenSetup) {
  const log: string[] = [];
  const ai = ctx.settings.ai && typeof ctx.settings.ai === 'object' ? ctx.settings.ai : {};
  let saved = (ai.eleven && typeof ai.eleven === 'object' ? ai.eleven : {}) as Record<string, any>;
  const fail = async (why: string) => {
    await saveEl(admin, ctx.firmId, { last: { ok: false, why: clip(why, 300), at: new Date().toISOString() } });
    return { ok: false as const, why, log };
  };

  const kind = ctx.voice === 'male' ? 'male' : 'female';
  const tools = await ensureTools(ctx.key, saved, ctx.hook);
  if (tools.why) return fail(tools.why);
  saved = await saveEl(admin, ctx.firmId, { tools: tools.ids });
  const toolIds = [tools.ids.takvim_bak, tools.ids.sonuc_yaz].filter(Boolean);
  log.push('tools ok');

  // One agent per language model and pinned voice, so staff with different choices never overwrite each other.
  const pinned = clip(ctx.voiceId, 60).replace(/[^A-Za-z0-9]/g, '');
  const akey = pinned ? `${ctx.llm}@${pinned}` : ctx.llm;
  const agents = { ...(saved.agents || {}) } as Record<string, { id: string; sig: string }>;
  if (!pinned && !agents[akey] && saved.agent_id && saved.sig && String(saved.sig).includes(`|${ctx.llm}|`)) agents[akey] = { id: String(saved.agent_id), sig: String(saved.sig) };
  let agentId = clip(agents[akey]?.id, 80);
  const voices = { ...(saved.voices || {}) } as Record<string, string>;
  const vkey = `v3_${ctx.lang}_${kind}`;
  const known = pinned || clip(voices[vkey], 60);
  const sigFor = (voiceId: string) => `v3|${ctx.llm}|${ctx.lang}|${kind}|${toolIds.join(',')}|${voiceId}`;
  if (!agentId || !known || agents[akey]?.sig !== sigFor(known)) {
    const picked: VoiceTry[] = known ? [{ id: known, owner: '' }] : await voiceCandidates(ctx.key, ctx.lang, kind);
    if (!known) picked.push({ id: FALLBACK_VOICES[kind], owner: '', fallback: true });
    let lastWhy = '';
    let used: VoiceTry | null = null;
    for (const voice of picked) {
      await addToLibrary(ctx.key, voice);
      const config = agentConfig(ctx.lang, ctx.llm, toolIds, voice.id);
      const res = agentId
        ? await el(ctx.key, 'PATCH', `/v1/convai/agents/${encodeURIComponent(agentId)}`, { conversation_config: config })
        : await el(ctx.key, 'POST', '/v1/convai/agents/create', { name: `Callin Kalite ${ctx.llm}`, conversation_config: config });
      if (res.ok) {
        agentId = agentId || clip(res.data?.agent_id, 80);
        used = voice;
        break;
      }
      lastWhy = `agent ${elWhy(res)} voice=${voice.id}`;
    }
    if (!used || !agentId) return fail(lastWhy || 'agent');
    if (!used.fallback && !pinned) voices[vkey] = used.id;
    agents[akey] = { id: agentId, sig: sigFor(used.id) };
    saved = await saveEl(admin, ctx.firmId, { agents, voices });
    log.push(`agent ok voice=${used.id}${used.fallback ? ' (yedek, Turkce ses eklenemedi)' : ''}`);
  }

  let phoneId = '';
  const from = normDid(ctx.from);
  if (from) {
    phoneId = clip((saved.phones || {})[from], 80);
    if (!phoneId) {
      const list = await el(ctx.key, 'GET', '/v1/convai/phone-numbers');
      const rows = Array.isArray(list.data) ? list.data : [];
      const hit = rows.find((row: any) => normDid(row?.phone_number) === from);
      phoneId = clip(hit?.phone_number_id, 80);
    }
    if (!phoneId) {
      if (!ctx.sipUser || !ctx.sipPass) return fail('sip user/password missing');
      const made = await el(ctx.key, 'POST', '/v1/convai/phone-numbers', {
        provider: 'sip_trunk',
        label: 'Callin Kalite',
        phone_number: from,
        outbound_trunk_config: {
          address: 'sip.telnyx.com',
          transport: 'tcp',
          media_encryption: 'allowed',
          credentials: { username: ctx.sipUser, password: ctx.sipPass },
        },
      });
      phoneId = clip(made.data?.phone_number_id, 80);
      if (!made.ok || !phoneId) return fail(`phone ${elWhy(made)}`);
    }
    saved = await saveEl(admin, ctx.firmId, { phones: { ...(saved.phones || {}), [from]: phoneId } });
    log.push('phone ok');
  }
  await saveEl(admin, ctx.firmId, { last: { ok: true, why: log.join(', '), at: new Date().toISOString() } });
  return { ok: true as const, agentId, phoneId, log, why: '' };
}

export async function elDial(key: string, agentId: string, phoneId: string, to: string, vars: Record<string, string>) {
  const res = await el(key, 'POST', '/v1/convai/sip-trunk/outbound-call', {
    agent_id: agentId,
    agent_phone_number_id: phoneId,
    to_number: to,
    conversation_initiation_client_data: { dynamic_variables: vars },
    telephony_call_config: { ringing_timeout_secs: 40 },
  });
  const conv = clip(res.data?.conversation_id, 100);
  if (!res.ok || res.data?.success === false || !conv) {
    return { ok: false as const, why: res.ok ? clip(res.data?.message || 'dial', 300) : elWhy(res), conv: '' };
  }
  return { ok: true as const, why: '', conv };
}

export async function elConversation(key: string, conv: string) {
  const res = await el(key, 'GET', `/v1/convai/conversations/${encodeURIComponent(conv)}`);
  if (!res.ok) return { ok: false as const, status: '', secs: 0, start: 0, summary: '', transcript: '', why: elWhy(res) };
  const meta = res.data?.metadata || {};
  const secs = Number(meta.call_duration_secs ?? meta.duration_secs ?? 0);
  const rows = Array.isArray(res.data?.transcript) ? res.data.transcript : [];
  const transcript = rows
    .filter((row: any) => row?.message)
    .map((row: any) => `${row.role === 'agent' ? 'YZ' : 'Kisi'}: ${clip(row.message, 400)}`)
    .join('\n');
  return {
    ok: true as const,
    status: String(res.data?.status || ''),
    secs: Number.isFinite(secs) ? secs : 0,
    start: Number(meta.start_time_unix_secs) || 0,
    summary: clip(res.data?.analysis?.transcript_summary, 600),
    transcript,
    why: '',
  };
}

export async function elAudio(key: string, conv: string) {
  const res = await fetch(`${EL}/v1/convai/conversations/${encodeURIComponent(conv)}/audio`, { headers: { 'xi-api-key': key } });
  if (!res.ok) return { ok: false as const, bytes: new Uint8Array(0), type: '' };
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { ok: true as const, bytes, type: res.headers.get('content-type') || 'audio/mpeg' };
}
