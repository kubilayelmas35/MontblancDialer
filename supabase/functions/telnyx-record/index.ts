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
    if (!uuidRe.test(firmId)) return json({ error: 'auth' }, 401);

    const { data: firm } = await admin.from('firms').select('settings').eq('id', firmId).maybeSingle();
    const key = String(firm?.settings?.integrations?.telnyx_api_key || '').trim();
    if (!key) return json({ error: 'nokey' }, 400);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
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

    return json({ error: 'action' }, 400);
  } catch (_) {
    return json({ error: 'fail' }, 500);
  }
});
