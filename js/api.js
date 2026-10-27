// ─────────────────────────────────────────────
// API — Supabase REST iletişim katmanı
// ─────────────────────────────────────────────
function mbAuthHeaders(extra) {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    ..._mbRequestScopeHeaders(),
    ...(extra || {})
  };
}

function _mbSessionToken() {
  const base = (typeof _baseUser !== 'undefined' && _baseUser) ? _baseUser : null;
  const cur = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  const impersonating = !!(base && cur && base.id && cur.id && String(base.id) !== String(cur.id));
  if (impersonating && base.session_token) return String(base.session_token);
  const token = cur?.session_token || base?.session_token || '';
  return token ? String(token) : '';
}

function mbHumanDbError(status, detail) {
  let code = '';
  let message = '';
  const raw = String(detail || '');
  try {
    const parsed = JSON.parse(raw);
    code = String(parsed.code || '');
    message = String(parsed.message || '');
  } catch (_) {
    message = raw;
  }
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const say = (key, tr, deText) => {
    if (typeof t === 'function') {
      const translated = t(key);
      if (translated && translated !== key) return translated;
    }
    return de ? deText : tr;
  };
  if (code === '42501' || /row-level security/i.test(message)) {
    return say('api.err.rls', 'Bu işlem için yetkin yok. Çıkış yapıp tekrar gir.', 'Keine Berechtigung für diesen Vorgang. Bitte abmelden und erneut anmelden.');
  }
  if (Number(status) === 401 || Number(status) === 403 || /JWT|not_authenticated/i.test(message)) {
    return say('api.err.auth', 'Oturum geçersiz. Tekrar giriş yapın.', 'Sitzung ungültig. Bitte erneut anmelden.');
  }
  return say('api.err.generic', 'İşlem tamamlanamadı. Tekrar deneyin.', 'Vorgang fehlgeschlagen. Bitte erneut versuchen.');
}

function _mbRequestScopeHeaders(userOverride = null) {
  const u = userOverride || ((typeof currentUser !== 'undefined' && currentUser) ? currentUser : null);
  const h = {};
  const token = _mbSessionToken();
  if (token) h['x-mb-session'] = token;
  if (!u) return h;
  if (u.id) h['x-mb-user-id'] = String(u.id);
  if (u.firm_id) h['x-mb-firm-id'] = String(u.firm_id);
  if (u.role) h['x-mb-role'] = String(u.role);
  return h;
}

function _mbPathRoot(path) {
  return String(path || '').split('?')[0].trim();
}

function _mbScopedUserForRequest(path, method = 'GET') {
  const cur = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
  const imp = (typeof _impersonation !== 'undefined' && _impersonation) ? _impersonation : null;
  const base = (typeof _baseUser !== 'undefined' && _baseUser) ? _baseUser : null;
  if (!cur || !imp || !base) return cur;
  const baseRole = String(base.role || '').toLowerCase();
  const isAdminBase = mbIsFirmAdmin(baseRole);
  if (!isAdminBase) return cur;
  const root = _mbPathRoot(path);
  const m = String(method || 'GET').toUpperCase();
  const adminScopedRoots = new Set(['campaigns', 'queues', 'agent_campaigns']);
  if (adminScopedRoots.has(root)) return base;
  // Temsil modunda agent RLS nedeniyle kontak listesi boş gelebilir;
  // dialer/test akışları için kontak okumayı base admin scope ile yap.
  if (root === 'contacts' && m === 'GET') return base;
  // Temsil modunda queue upload vb. yazma işlemlerinde admin bağlamını kullan.
  if (m !== 'GET' && (root === 'contacts' || root === 'queues' || root === 'campaigns')) return base;
  return cur;
}

async function mbFetchAll(path) {
  let base = String(path || '');
  base = base.replace(/([?&])limit=\d+/g, '').replace(/([?&])offset=\d+/g, '');
  base = base.replace(/\?&/g, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');
  if (!/(?:^|[?&])order=/.test(base)) base += `${base.includes('?') ? '&' : '?'}order=id.asc`;
  const size = 1000;
  const max = 50000;
  const all = [];
  const seen = new Set();
  const pages = new Set();
  for (let offset = 0; offset < max; offset += size) {
    const sep = base.includes('?') ? '&' : '?';
    let rows;
    try {
      rows = await sb(`${base}${sep}limit=${size}&offset=${offset}`);
    } catch (e) {
      if (offset === 0) throw e;
      break;
    }
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) break;
    const sig = rows.map((row) => (row && row.id != null ? String(row.id) : JSON.stringify(row))).join('|');
    if (pages.has(sig)) break;
    pages.add(sig);
    let added = 0;
    rows.forEach((row) => {
      const id = row && row.id != null ? String(row.id) : '';
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      all.push(row);
      added += 1;
    });
    if (rows.length < size || added === 0) break;
    if (offset + size >= max) {
      all.capped = true;
      break;
    }
  }
  return all;
}

async function sb(path, opts={}) {
const ctrl = new AbortController();
const timeoutMs = Number(opts.timeoutMs || 20000);
const t = setTimeout(() => ctrl.abort(), timeoutMs);
let r;
const method = String(opts?.method || 'GET').toUpperCase();
const scopedUser = _mbScopedUserForRequest(path, method);
try {
  r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    signal: opts.signal || ctrl.signal,
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ..._mbRequestScopeHeaders(scopedUser),
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
  console.error(`Supabase error (${r.status}) @ ${path}: ${detail || r.statusText || 'HTTP_ERROR'}`);
  const authFail = /42501|row-level security/i.test(detail || '') || Number(r.status) === 401 || Number(r.status) === 403;
  if (authFail && !String(path || '').includes('mb_whoami') && typeof mbEnsureSession === 'function') {
    mbEnsureSession({ force: true }).catch(() => {});
  }
  throw new Error(mbHumanDbError(r.status, detail));
}
if (r.status === 204) return null;
const txt = await r.text();
if (!txt || !txt.trim()) return null;
try { return JSON.parse(txt); }
catch(e) { return null; }
}

async function sbUpsert(table, data, onConflict) {
try {
const scopeHeaders = _mbRequestScopeHeaders(_mbScopedUserForRequest(table, 'POST'));
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

function mbStampLogin(data, prev) {
  if (!data?.status || data.status === 'offline') return;
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const day = prev?.login_at && typeof mbBerlinDay === 'function' ? mbBerlinDay(prev.login_at) : String(prev?.login_at || '').slice(0, 10);
  const wasOffline = !prev || !prev.status || prev.status === 'offline';
  if (wasOffline || (today && day !== today)) data.login_at = new Date().toISOString();
}

async function mbLogStatusChange(data, prev) {
  if (!data?.agent_id || !data.status) return;
  const firmId = data.firm_id || prev?.firm_id || (typeof currentUser !== 'undefined' ? currentUser?.firm_id : null);
  if (!firmId) return;
  const breakChanged = Object.prototype.hasOwnProperty.call(data, 'break_code') && String(data.break_code || '') !== String(prev?.break_code || '');
  const campChanged = Object.prototype.hasOwnProperty.call(data, 'campaign_id') && String(data.campaign_id || '') !== String(prev?.campaign_id || '');
  const statusChanged = !prev || data.status !== prev.status;
  if (!statusChanged && !breakChanged && !campChanged) return;
  const now = new Date().toISOString();
  const open = await sb(`agent_status_log?agent_id=eq.${data.agent_id}&ended_at=is.null&select=id,started_at&order=started_at.desc&limit=1`).catch(() => []);
  const row = open?.[0];
  if (row?.id && row.started_at) {
    const dur = Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000));
    await sb(`agent_status_log?id=eq.${row.id}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ ended_at: now, duration_sec: dur }),
    }).catch(() => {});
  }
  const camp = Object.prototype.hasOwnProperty.call(data, 'campaign_id')
    ? data.campaign_id
    : (typeof selectedCampId !== 'undefined' ? selectedCampId : (prev?.campaign_id || null));
  await sb('agent_status_log', {
    method: 'POST', prefer: 'return=minimal',
    body: JSON.stringify({
      firm_id: firmId,
      agent_id: data.agent_id,
      status: data.status,
      break_code: data.status === 'break' ? (data.break_code || prev?.break_code || null) : null,
      campaign_id: camp || null,
      started_at: now,
    }),
  }).catch(() => {});
}

// agent_sessions upsert (conflict safe)
async function upsertAgentSession(data) {
try {
let existing = await sb(`agent_sessions?agent_id=eq.${data.agent_id}&select=id,status,break_code,campaign_id,firm_id,login_at`).catch(() => null);
const canLogin = Array.isArray(existing);
if (!canLogin) existing = await sb(`agent_sessions?agent_id=eq.${data.agent_id}&select=id,status,break_code,campaign_id,firm_id`).catch(() => null);
const prev = existing?.[0] || null;
if (canLogin) mbStampLogin(data, prev);
if (prev) {
await sb(`agent_sessions?agent_id=eq.${data.agent_id}`, {
method:'PATCH', prefer:'return=minimal', body:JSON.stringify(data)
});
} else {
await sb('agent_sessions', {
method:'POST', prefer:'return=minimal', body:JSON.stringify(data)
});
}
mbLogStatusChange(data, prev).catch(() => {});
} catch(e) { console.warn('session upsert:', e.message); }
}
