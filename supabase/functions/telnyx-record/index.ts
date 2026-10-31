import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mb-session, x-mb-user-id, x-mb-firm-id, x-mb-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeId(value: unknown) {
  const id = String(value || '').trim();
  if (!id || id.length > 200 || !/^[\w:.-]+$/.test(id)) return '';
  return id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  try {
    const token = String(req.headers.get('x-mb-session') || '').trim();
    if (token.length < 32) return json({ error: 'auth' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { data: sess } = await admin
      .from('app_sessions')
      .select('user_id, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!sess?.user_id || new Date(sess.expires_at).getTime() <= Date.now()) {
      return json({ error: 'auth' }, 401);
    }

    const { data: user } = await admin
      .from('users')
      .select('id, firm_id, role, is_active')
      .eq('id', sess.user_id)
      .maybeSingle();
    if (!user || user.is_active === false) return json({ error: 'auth' }, 401);

    let firmId = String(user.firm_id || '');
    if (String(user.role || '') === 'super_admin') {
      const asked = String(req.headers.get('x-mb-firm-id') || '').trim();
      if (uuidRe.test(asked)) firmId = asked;
    }
    if (!uuidRe.test(firmId) && String(user.role || '') !== 'super_admin') return json({ error: 'auth' }, 401);

    let key = '';
    let firmSettings: Record<string, any> = {};
    if (uuidRe.test(firmId)) {
      const { data: firm } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
      firmSettings = (firm?.settings || {}) as Record<string, any>;
      key = String(firmSettings?.integrations?.telnyx_api_key || '').trim();
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (action !== 'mode' && action !== 'grab' && !key) return json({ error: 'nokey' }, 400);
    const control = safeId(body?.call_control_id);
    const session = safeId(body?.session_id);
    const leg = safeId(body?.leg_id);

    if (action === 'start') {
      if (!control) return json({ error: 'id' }, 400);
      const res = await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(control)}/actions/record_start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'mp3', channels: 'dual', play_beep: false }),
      });
      const text = await res.text();
      let already = false;
      try {
        already = /already/i.test(JSON.stringify(JSON.parse(text)?.errors || []));
      } catch (_) { already = false; }
      const ok = res.ok || already;
      return json({ ok }, ok ? 200 : 502);
    }

    if (action === 'lookup') {
      const phone = String(body?.phone || '').replace(/\D/g, '');
      if (phone.length < 6) return json({ error: 'id' }, 400);
      const tail = (value: unknown) => {
        const digits = String(value || '').replace(/\D/g, '');
        const n = Math.min(8, digits.length, phone.length);
        return n >= 6 && digits.slice(-n) === phone.slice(-n);
      };
      const listed = await fetch('https://api.telnyx.com/v2/calls?page[size]=50', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const payload = await listed.json().catch(() => ({}));
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const hit = rows.find((row: Record<string, unknown>) => tail(row.to) || tail(row.from) || tail(row.destination) || tail(row.to_number));
      const foundId = safeId(hit?.call_control_id);
      if (!hit || !foundId) return json({ ok: false });
      return json({
        ok: true,
        call_control_id: foundId,
        call_session_id: safeId(hit.call_session_id),
        call_leg_id: safeId(hit.call_leg_id),
      });
    }

    if (action === 'mode') {
      if (String(user.role || '') !== 'super_admin') return json({ error: 'auth' }, 403);
      const askedFirm = String(body?.firm_id || '').trim();
      if (!uuidRe.test(askedFirm)) return json({ error: 'auth' }, 401);
      const { data: target } = await admin.from('firms').select('settings').eq('id', askedFirm).maybeSingle();
      const firmKey = String(target?.settings?.integrations?.telnyx_api_key || '').trim();
      const conn = safeId(body?.connection_id) || safeId(target?.settings?.integrations?.sip_connection_id);
      if (!firmKey) return json({ ok: false, error: 'nokey' });
      if (!conn) return json({ ok: false, error: 'id' });
      const source = body?.source === 'telnyx' ? 'telnyx' : 'supabase';
      const headers = { Authorization: `Bearer ${firmKey}`, 'Content-Type': 'application/json' };
      const connRes = await fetch(`https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(conn)}`, { headers });
      const connBody = await connRes.json().catch(() => ({}));
      const profileId = safeId(connBody?.data?.outbound?.outbound_voice_profile_id);
      if (!connRes.ok || !profileId) return json({ ok: false, error: 'profile' });
      const recording = source === 'telnyx'
        ? { call_recording_type: 'all', call_recording_channels: 'dual', call_recording_format: 'mp3' }
        : { call_recording_type: 'none', call_recording_channels: 'dual', call_recording_format: 'mp3' };
      const patched = await fetch(`https://api.telnyx.com/v2/outbound_voice_profiles/${encodeURIComponent(profileId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ call_recording: recording }),
      });
      return json({ ok: patched.ok, error: patched.ok ? '' : 'profile' }, patched.ok ? 200 : 502);
    }

    if (action === 'recent') {
      const phone = String(body?.phone || '').replace(/\D/g, '');
      if (phone.length < 6) return json({ ok: false, url: '' });
      const sinceMs = Date.parse(String(body?.since || ''));
      const gte = Number.isFinite(sinceMs) ? new Date(sinceMs - 15000).toISOString() : new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams();
      params.set('filter[created_at][gte]', gte);
      if (Number.isFinite(sinceMs)) params.set('filter[created_at][lte]', new Date(sinceMs + 20 * 60 * 1000).toISOString());
      params.set('page[size]', '25');
      const listed = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const payload = await listed.json().catch(() => ({}));
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const tail = (value: unknown) => {
        const digits = String(value || '').replace(/\D/g, '');
        const n = Math.min(8, digits.length, phone.length);
        return n >= 6 && digits.slice(-n) === phone.slice(-n);
      };
      const hits = rows.filter((row: Record<string, unknown>) => {
        const urls = row?.download_urls as Record<string, unknown> | undefined;
        const file = String(urls?.mp3 || urls?.wav || '');
        return /^https:\/\//i.test(file) && (tail(row.to) || tail(row.from));
      });
      const hit = hits.reduce((best: Record<string, unknown> | null, row: Record<string, unknown>) => {
        if (!best) return row;
        if (!Number.isFinite(sinceMs)) return best;
        const rowAt = Date.parse(String(row.created_at || ''));
        const bestAt = Date.parse(String(best.created_at || ''));
        if (!Number.isFinite(rowAt)) return best;
        if (!Number.isFinite(bestAt)) return row;
        return Math.abs(rowAt - sinceMs) < Math.abs(bestAt - sinceMs) ? row : best;
      }, null as Record<string, unknown> | null);
      const urls = hit?.download_urls as Record<string, unknown> | undefined;
      const url = String(urls?.mp3 || urls?.wav || '');
      return json({ ok: /^https:\/\//i.test(url), url: /^https:\/\//i.test(url) ? url : '' });
    }

    if (action === 'grab') {
      const logId = String(body?.log_id || '').trim();
      if (!uuidRe.test(logId)) return json({ error: 'id' }, 400);
      const { data: log } = await admin.from('call_logs').select('id,firm_id,recording_url').eq('id', logId).maybeSingle();
      const fileUrl = String(log?.recording_url || '');
      if (!/^https:\/\//i.test(fileUrl)) return json({ error: 'none' }, 404);
      const sameFirm = String(log?.firm_id || '') === String(user.firm_id || '') || String(log?.firm_id || '') === firmId;
      if (String(user.role || '') !== 'super_admin' && !sameFirm) return json({ error: 'auth' }, 403);
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) return json({ error: 'file' }, 502);
      const type = String(fileRes.headers.get('content-type') || 'application/octet-stream');
      if (/json|xml|html/i.test(type)) return json({ error: 'file' }, 502);
      const bytes = await fileRes.arrayBuffer();
      if (bytes.byteLength < 400) return json({ error: 'file' }, 502);
      return new Response(bytes, {
        headers: { ...corsHeaders, 'Content-Type': type, 'Cache-Control': 'no-store' },
      });
    }

    if (action === 'fetch') {
      const params = new URLSearchParams();
      if (control) params.set('filter[call_control_id]', control);
      else if (session) params.set('filter[call_session_id]', session);
      else if (leg) params.set('filter[call_leg_id]', leg);
      else return json({ error: 'id' }, 400);
      params.set('page[size]', '5');
      const res = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return json({ ok: false, url: '' }, 200);
      const payload = await res.json().catch(() => ({}));
      const row = Array.isArray(payload?.data) ? payload.data[0] : null;
      const url = String(row?.download_urls?.mp3 || row?.download_urls?.wav || '');
      return json({ ok: true, url: /^https:\/\//i.test(url) ? url : '' });
    }

    if (action === 'jitter') {
      const conn = safeId(firmSettings?.integrations?.sip_connection_id);
      if (!conn || !key) return json({ error: 'id' }, 400);
      const enabled = body?.enabled === true;
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const patched = await fetch(`https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(conn)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          jitter_buffer: {
            enable_jitter_buffer: enabled,
            jitterbuffer_msec_min: 60,
            jitterbuffer_msec_max: 200,
          },
        }),
      });
      if (!patched.ok) return json({ ok: false }, 502);
      firmSettings.jitter_buffer = enabled;
      const saved = await admin.from('firms').update({ settings: firmSettings }).eq('id', firmId);
      if (saved.error) return json({ ok: false }, 502);
      return json({ ok: true });
    }

    if (action === 'suppress') {
      if (!control) return json({ error: 'id' }, 400);
      const advanced = firmSettings.noise_advanced === true;
      const list = Array.isArray(firmSettings.noise_agents) ? firmSettings.noise_agents.map(String) : null;
      const allowed = advanced && (list == null || list.includes(String(user.id)));
      if (!allowed && String(user.role || '') !== 'super_admin') return json({ error: 'auth' }, 403);
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const base = `https://api.telnyx.com/v2/calls/${encodeURIComponent(control)}/actions/`;
      const level = Math.max(1, Math.min(4, Number(body?.level) || 1));
      const mine = body?.mine !== false;
      const far = body?.far === true;
      if (level < 2 || (!mine && !far)) {
        const stopped = await fetch(`${base}suppression_stop`, { method: 'POST', headers, body: '{}' });
        return json({ ok: stopped.ok || stopped.status === 422 }, stopped.ok || stopped.status === 422 ? 200 : 502);
      }
      const direction = mine && far ? 'both' : (mine ? 'inbound' : 'outbound');
      const engine = level >= 4 ? 'Krisp' : (level === 3 ? 'AiCoustics' : 'Denoiser');
      const payload: Record<string, unknown> = { direction, noise_suppression_engine: engine };
      if (engine === 'Krisp') {
        payload.noise_suppression_engine_config = { model: 'krisp-viva-pro-v1.kef', suppression_level: 80 };
      }
      const started = await fetch(`${base}suppression_start`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return json({ ok: started.ok }, started.ok ? 200 : 502);
    }

    if (action === 'play' || action === 'stop') {
      if (!control) return json({ error: 'id' }, 400);
      const base = `https://api.telnyx.com/v2/calls/${encodeURIComponent(control)}/actions/`;
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      if (action === 'stop') {
        const stopped = await fetch(`${base}playback_stop`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ stop: 'all' }),
        });
        return json({ ok: stopped.ok || stopped.status === 422 }, stopped.ok || stopped.status === 422 ? 200 : 502);
      }
      const audio = String(body?.audio_url || '').trim();
      const storage = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
      const allowed = storage && audio.startsWith(`${storage}/storage/v1/object/public/call-recordings/hold-music/`);
      if (!allowed || audio.length > 500 || /[\s<>]/.test(audio)) return json({ error: 'url' }, 400);
      const started = await fetch(`${base}playback_start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ audio_url: audio, loop: 'infinity', overlay: false, target_legs: 'opposite' }),
      });
      return json({ ok: started.ok }, started.ok ? 200 : 502);
    }

    return json({ error: 'action' }, 400);
  } catch (_) {
    return json({ error: 'fail' }, 500);
  }
});
