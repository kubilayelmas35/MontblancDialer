// ─────────────────────────────────────────────
// Supervisor — Canlı Agent İzleme Paneli
// ─────────────────────────────────────────────

let _supRealtimeSub = null;
let _supTickTimer    = null;
let _supSessions     = [];

const _SUP_STATUS_LABEL = {
  on_call:  { tr: 'Çağrıda',     de: 'Im Gespräch', cls: 'sup-status--oncall'  },
  ready:    { tr: 'Hazır',       de: 'Bereit',       cls: 'sup-status--ready'   },
  wrapping: { tr: 'Sarılıyor',   de: 'Nachbearb.',   cls: 'sup-status--wrap'    },
  break:    { tr: 'Mola',        de: 'Pause',        cls: 'sup-status--break'   },
  offline:  { tr: 'Çevrimdışı',  de: 'Offline',      cls: 'sup-status--offline' },
};

function _supFmtDuration(isoStart) {
  if (!isoStart) return '—';
  const sec = Math.floor((Date.now() - new Date(isoStart).getTime()) / 1000);
  if (sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function _supStatusInfo(status) {
  return _SUP_STATUS_LABEL[status] || { tr: status, de: status, cls: 'sup-status--offline' };
}

function _supRenderCards() {
  const grid = document.getElementById('sup-agent-grid');
  if (!grid) return;
  const lang = typeof currentLang !== 'undefined' ? currentLang : 'tr';

  const sorted = [..._supSessions].sort((a, b) => {
    const order = { on_call: 0, wrapping: 1, ready: 2, break: 3, offline: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  if (!sorted.length) {
    grid.innerHTML = `<div class="sup-empty">${lang === 'tr' ? 'Aktif oturum yok.' : 'Keine aktiven Sitzungen.'}</div>`;
    return;
  }

  grid.innerHTML = sorted.map(s => {
    const info   = _supStatusInfo(s.status);
    const label  = lang === 'tr' ? info.tr : info.de;
    const dur    = s.status === 'on_call' ? _supFmtDuration(s.call_started_at) : '—';
    const name   = escapeHtml(s.current_contact_name  || '—');
    const phone  = escapeHtml(s.current_contact_phone || '—');
    const agent  = escapeHtml(s.agent_name || s.agent_id?.slice(0, 8) || '?');
    const isCall = s.status === 'on_call';

    const callInfo = isCall && (s.current_contact_name || s.current_contact_phone) ? `
  <div class="sup-call-info">
    ${s.current_contact_name ? `<div class="sup-call-row"><span class="sup-call-lbl">${lang === 'tr' ? 'Müşteri' : 'Kontakt'}</span><span class="sup-call-val">${name}</span></div>` : ''}
    ${s.current_contact_phone ? `<div class="sup-call-row"><span class="sup-call-lbl">${lang === 'tr' ? 'Numara' : 'Nummer'}</span><span class="sup-call-val">${phone}</span></div>` : ''}
  </div>` : '';

    return `
<div class="sup-card ${isCall ? 'sup-card--active' : ''}">
  <div class="sup-card-top">
    <div class="sup-avatar">${agent.charAt(0).toUpperCase()}</div>
    <div class="sup-agent-info">
      <div class="sup-agent-name">${agent}</div>
      <span class="sup-status ${info.cls}">${label}</span>
    </div>
    ${isCall ? `<div class="sup-dur sup-dur--live" data-start="${escapeHtml(s.call_started_at || '')}">${dur}</div>` : ''}
  </div>
  ${callInfo}
</div>`;
  }).join('');
}

function _supTickDurations() {
  document.querySelectorAll('.sup-dur--live').forEach(el => {
    const start = el.dataset.start;
    if (start) el.textContent = _supFmtDuration(start);
  });
}

function _supUpdateSummary() {
  const total   = _supSessions.length;
  const onCall  = _supSessions.filter(s => s.status === 'on_call').length;
  const ready   = _supSessions.filter(s => s.status === 'ready').length;
  const offline = _supSessions.filter(s => s.status === 'offline').length;
  const lang    = typeof currentLang !== 'undefined' ? currentLang : 'tr';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('sup-pill-total',   total);
  set('sup-pill-oncall',  onCall);
  set('sup-pill-ready',   ready);
  set('sup-pill-offline', offline);

  const statusEl = document.getElementById('sup-live-badge');
  if (statusEl) statusEl.textContent = lang === 'tr' ? `${onCall} aktif çağrı` : `${onCall} aktive Gespräche`;
}

async function _supFetchSessions() {
  if (!currentUser?.firm_id) return;
  const isSuper = currentUser.role === 'super_admin';
  const filter  = isSuper ? '' : `firm_id=eq.${currentUser.firm_id}&`;
  const rows = await sb(`agent_sessions?${filter}select=*&order=status.asc,agent_name.asc`).catch(() => []);
  _supSessions = Array.isArray(rows) ? rows : [];
  _supRenderCards();
  _supUpdateSummary();
}

async function _supStartRealtime() {
  if (_supRealtimeSub) return;
  // chat.js'deki getSupabaseClient() fonksiyonunu paylaş
  const client = typeof getSupabaseClient === 'function' ? await getSupabaseClient() : null;
  if (!client) return;
  _supRealtimeSub = client
    .channel('supervisor-sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_sessions' }, () => {
      _supFetchSessions();
    })
    .subscribe();
}

async function _supStopRealtime() {
  if (_supRealtimeSub) {
    try {
      const client = typeof getSupabaseClient === 'function' ? await getSupabaseClient() : null;
      if (client) await client.removeChannel(_supRealtimeSub);
    } catch (_) {}
    _supRealtimeSub = null;
  }
  if (_supTickTimer) {
    clearInterval(_supTickTimer);
    _supTickTimer = null;
  }
}

async function loadSupervisorPanel() {
  const page = document.getElementById('page-supervisor');
  if (!page) return;

  const lang = typeof currentLang !== 'undefined' ? currentLang : 'tr';

  page.innerHTML = `
<div class="page-hdr">
  <div>
    <div class="page-title">${lang === 'tr' ? 'Supervisor Paneli' : 'Supervisor Panel'}</div>
    <div class="page-sub" id="sup-live-badge" style="color:var(--accent);font-size:13px;">—</div>
  </div>
  <button class="btn btn-sm" onclick="_supFetchSessions()" style="gap:6px;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
    ${lang === 'tr' ? 'Yenile' : 'Aktualisieren'}
  </button>
</div>

<div class="sup-pills">
  <div class="sup-pill">
    <span class="sup-pill-num" id="sup-pill-total">—</span>
    <span class="sup-pill-lbl">${lang === 'tr' ? 'Toplam' : 'Gesamt'}</span>
  </div>
  <div class="sup-pill sup-pill--oncall">
    <span class="sup-pill-num" id="sup-pill-oncall">—</span>
    <span class="sup-pill-lbl">${lang === 'tr' ? 'Çağrıda' : 'Im Gespräch'}</span>
  </div>
  <div class="sup-pill sup-pill--ready">
    <span class="sup-pill-num" id="sup-pill-ready">—</span>
    <span class="sup-pill-lbl">${lang === 'tr' ? 'Hazır' : 'Bereit'}</span>
  </div>
  <div class="sup-pill sup-pill--offline">
    <span class="sup-pill-num" id="sup-pill-offline">—</span>
    <span class="sup-pill-lbl">${lang === 'tr' ? 'Çevrimdışı' : 'Offline'}</span>
  </div>
</div>

<div class="sup-agent-grid" id="sup-agent-grid">
  <div class="sup-empty">${lang === 'tr' ? 'Yükleniyor…' : 'Wird geladen…'}</div>
</div>`;

  await _supFetchSessions();
  _supStartRealtime();

  if (_supTickTimer) clearInterval(_supTickTimer);
  _supTickTimer = setInterval(() => {
    _supTickDurations();
    _supUpdateSummary();
  }, 1000);
}

function unloadSupervisorPanel() {
  _supStopRealtime();
}

try {
  window.loadSupervisorPanel  = loadSupervisorPanel;
  window.unloadSupervisorPanel = unloadSupervisorPanel;
  window._supFetchSessions    = _supFetchSessions;
} catch (_) {}
