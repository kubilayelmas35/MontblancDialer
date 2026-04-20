// ─────────────────────────────────────────────
// API — Supabase REST iletişim katmanı
// ─────────────────────────────────────────────
function _mbRequestScopeHeaders() {
  const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  if (!u) return {};
  const h = {};
  if (u.id) h['x-mb-user-id'] = String(u.id);
  if (u.firm_id) h['x-mb-firm-id'] = String(u.firm_id);
  if (u.role) h['x-mb-role'] = String(u.role);
  return h;
}

async function sb(path, opts={}) {
const ctrl = new AbortController();
const timeoutMs = Number(opts.timeoutMs || 20000);
const t = setTimeout(() => ctrl.abort(), timeoutMs);
let r;
try {
  r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    signal: opts.signal || ctrl.signal,
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ..._mbRequestScopeHeaders(),
      ...(opts.headers||{})
    }
  });
} catch (e) {
  if (e?.name === 'AbortError') throw new Error(`İstek zaman aşımı (${timeoutMs}ms): ${path}`);
  throw e;
} finally {
  clearTimeout(t);
}
if (!r.ok) {
  let detail = '';
  try { detail = await r.text(); } catch (_) {}
  // Temsil modunda bazı RLS-korumalı endpointler 401/403 dönebilir.
  // Hızlı çözüm: UI'ı kırmamak için bu çağrılarda boş sonuç döndür.
  try {
    const inImpersonation = (typeof _impersonation !== 'undefined' && !!_impersonation);
    const status = Number(r.status || 0);
    if (inImpersonation && (status === 401 || status === 403)) {
      const p = String(path || '');
      const softFailPrefixes = ['chat_group_members', 'payroll_fx_rates'];
      if (softFailPrefixes.some((x) => p.startsWith(x))) {
        const method = String(opts?.method || 'GET').toUpperCase();
        if (method === 'GET') return [];
        return null;
      }
    }
  } catch (_) {}
  const msg = detail || `${r.status} ${r.statusText || 'HTTP_ERROR'}`;
  throw new Error(`Supabase error (${r.status}) @ ${path}: ${msg}`);
}
if (r.status === 204) return null;
const txt = await r.text();
if (!txt || !txt.trim()) return null;
try { return JSON.parse(txt); }
catch(e) { return null; }
}

async function sbUpsert(table, data, onConflict) {
try {
const scopeHeaders = _mbRequestScopeHeaders();
const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
method: 'POST',
headers: {
'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
'Content-Type': 'application/json',
'Prefer': `resolution=merge-duplicates,return=minimal`,
...scopeHeaders,
'on-conflict': onConflict || 'id'
},
body: JSON.stringify(data)
});
// 409 conflict durumunda PATCH ile dene
if (res.status === 409 && data[onConflict]) {
await fetch(`${SB_URL}/rest/v1/${table}?${onConflict}=eq.${data[onConflict]}`, {
method: 'PATCH',
headers: {'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal', ...scopeHeaders},
body: JSON.stringify(data)
});
}
} catch(e) { console.warn('upsert err:', e); }
}

// agent_sessions upsert (conflict safe)
async function upsertAgentSession(data) {
try {
const existing = await sb(`agent_sessions?agent_id=eq.${data.agent_id}&select=id`).catch(()=>null);
if (existing?.length) {
await sb(`agent_sessions?agent_id=eq.${data.agent_id}`, {
method:'PATCH', prefer:'return=minimal', body:JSON.stringify(data)
});
} else {
await sb('agent_sessions', {
method:'POST', prefer:'return=minimal', body:JSON.stringify(data)
});
}
} catch(e) { console.warn('session upsert:', e.message); }
}
