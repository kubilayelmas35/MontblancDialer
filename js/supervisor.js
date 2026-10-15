// ─────────────────────────────────────────────
// Supervisor — Canlı kat: kim, ne kadar, kiminle
// ─────────────────────────────────────────────

let _supRealtimeSub = null;
let _supTickTimer    = null;
let _supPollTimer    = null;
let _supSessions     = [];
let _supCampaigns    = {};
let _supQuery        = '';

const _SUP_STATUS_LABEL = {
  on_call:  { tr: 'Çağrıda',     de: 'Im Gespräch', cls: 'sup-status--oncall'  },
  ready:    { tr: 'Hazır',       de: 'Bereit',       cls: 'sup-status--ready'   },
  wrapping: { tr: 'Sonuç',       de: 'Nacharbeit',   cls: 'sup-status--wrap'    },
  break:    { tr: 'Mola',        de: 'Pause',        cls: 'sup-status--break'   },
  offline:  { tr: 'Çevrimdışı',  de: 'Offline',      cls: 'sup-status--offline' },
};

function _supLang() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de' : 'tr';
}

function _supFmtDuration(isoStart) {
  if (!isoStart) return '—';
  const sec = Math.floor((Date.now() - new Date(isoStart).getTime()) / 1000);
  if (sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function _supAgo(iso) {
  if (!iso) return '—';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const de = _supLang() === 'de';
  if (sec < 45) return de ? 'gerade' : 'az önce';
  const m = Math.floor(sec / 60);
  if (m < 60) return de ? `vor ${m} Min.` : `${m} dk önce`;
  const h = Math.floor(m / 60);
  return de ? `vor ${h} Std.` : `${h} sa önce`;
}

function _supStatusInfo(status) {
  return _SUP_STATUS_LABEL[status] || { tr: status, de: status, cls: 'sup-status--offline' };
}

function _supCampaignName(id) {
  if (!id) return '—';
  return _supCampaigns[id] || '—';
}

function _supFiltered() {
  const q = _supQuery;
  const rows = [..._supSessions].sort((a, b) => {
    const order = { on_call: 0, wrapping: 1, ready: 2, break: 3, offline: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });
  if (!q) return rows;
  return rows.filter((s) => {
    const camp = _supCampaignName(s.campaign_id);
    return [
      s.agent_name, s.status, s.current_contact_name, s.current_contact_phone, camp
    ].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function _supOnSearch(value) {
  _supQuery = String(value || '').trim().toLowerCase();
  _supRenderCards();
}

function _supRenderCards() {
  const grid = document.getElementById('sup-agent-grid');
  const board = document.getElementById('sup-live-board');
  if (!grid) return;
  const lang = _supLang();
  const de = lang === 'de';
  const sorted = _supFiltered();

  const calls = sorted.filter((s) => s.status === 'on_call');
  if (board) {
    if (!calls.length) {
      board.innerHTML = `<div class="sup-live-empty">${de ? 'Gerade keine Gespräche.' : 'Şu an görüşme yok.'}</div>`;
    } else {
      board.innerHTML = `<table class="sup-live-table"><thead><tr>
        <th>${de ? 'Agent' : 'Temsilci'}</th>
        <th>${de ? 'Dauer' : 'Süre'}</th>
        <th>${de ? 'Kontakt' : 'Müşteri'}</th>
        <th>${de ? 'Nummer' : 'Numara'}</th>
        <th>${de ? 'Kampagne' : 'Kampanya'}</th>
      </tr></thead><tbody>${calls.map((s) => {
        const agent = escapeHtml(s.agent_name || s.agent_id?.slice(0, 8) || '?');
        const name = escapeHtml(s.current_contact_name || '—');
        const phone = escapeHtml(s.current_contact_phone || '—');
        const camp = escapeHtml(_supCampaignName(s.campaign_id));
        const dur = _supFmtDuration(s.call_started_at);
        return `<tr>
          <td><span class="sup-live-dot" aria-hidden="true"></span>${agent}</td>
          <td class="sup-dur sup-dur--live" data-start="${escapeHtml(s.call_started_at || '')}">${dur}</td>
          <td>${name}</td>
          <td class="sup-mono">${phone}</td>
          <td>${camp}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    }
  }

  if (!sorted.length) {
    grid.innerHTML = `<div class="sup-empty">${de ? 'Keine passende Sitzung.' : 'Eşleşen oturum yok.'}</div>`;
    return;
  }

  grid.innerHTML = sorted.map((s) => {
    const info = _supStatusInfo(s.status);
    const label = de ? info.de : info.tr;
    const isCall = s.status === 'on_call';
    const agent = escapeHtml(s.agent_name || s.agent_id?.slice(0, 8) || '?');
    const name = escapeHtml(s.current_contact_name || '—');
    const phone = escapeHtml(s.current_contact_phone || '—');
    const camp = escapeHtml(_supCampaignName(s.campaign_id));
    const dur = isCall ? _supFmtDuration(s.call_started_at) : _supAgo(s.last_seen);
    const callInfo = isCall ? `
  <div class="sup-call-info">
    <div class="sup-call-row"><span class="sup-call-lbl">${de ? 'Kontakt' : 'Müşteri'}</span><span class="sup-call-val">${name}</span></div>
    <div class="sup-call-row"><span class="sup-call-lbl">${de ? 'Nummer' : 'Numara'}</span><span class="sup-call-val">${phone}</span></div>
    <div class="sup-call-row"><span class="sup-call-lbl">${de ? 'Kampagne' : 'Kampanya'}</span><span class="sup-call-val">${camp}</span></div>
  </div>` : `
  <div class="sup-call-info">
    <div class="sup-call-row"><span class="sup-call-lbl">${de ? 'Zuletzt' : 'Son görülme'}</span><span class="sup-call-val">${dur}</span></div>
    <div class="sup-call-row"><span class="sup-call-lbl">${de ? 'Kampagne' : 'Kampanya'}</span><span class="sup-call-val">${camp}</span></div>
  </div>`;

    return `
<div class="sup-card ${isCall ? 'sup-card--active' : ''}">
  <div class="sup-card-top">
    <div class="sup-avatar">${agent.charAt(0).toUpperCase()}</div>
    <div class="sup-agent-info">
      <div class="sup-agent-name">${agent}</div>
      <span class="sup-status ${info.cls}">${label}</span>
    </div>
    ${isCall ? `<div class="sup-dur sup-dur--live" data-start="${escapeHtml(s.call_started_at || '')}">${dur}</div>` : `<div class="sup-dur">${escapeHtml(_supAgo(s.last_seen))}</div>`}
  </div>
  ${callInfo}
</div>`;
  }).join('');
}

function _supTickDurations() {
  document.querySelectorAll('.sup-dur--live').forEach((el) => {
    const start = el.dataset.start;
    if (start) el.textContent = _supFmtDuration(start);
  });
}

function _supUpdateSummary() {
  const total = _supSessions.length;
  const count = (st) => _supSessions.filter((s) => s.status === st).length;
  const onCall = count('on_call');
  const lang = _supLang();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('sup-pill-total', total);
  set('sup-pill-oncall', onCall);
  set('sup-pill-ready', count('ready'));
  set('sup-pill-wrap', count('wrapping'));
  set('sup-pill-break', count('break'));
  set('sup-pill-offline', count('offline'));
  const statusEl = document.getElementById('sup-live-badge');
  if (statusEl) statusEl.textContent = lang === 'tr' ? `${onCall} aktif görüşme` : `${onCall} aktive Gespräche`;
}

async function _supFetchSessions() {
  if (!currentUser?.firm_id && currentUser?.role !== 'super_admin') return;
  const isSuper = currentUser.role === 'super_admin';
  const firmQ = isSuper ? '' : `&firm_id=eq.${currentUser.firm_id}`;
  const [rows, camps] = await Promise.all([
    sb(`agent_sessions?select=*&order=status.asc,agent_name.asc${firmQ}`).catch(() => []),
    sb(`campaigns?select=id,name${firmQ}`).catch(() => []),
  ]);
  _supSessions = Array.isArray(rows) ? rows : [];
  _supCampaigns = {};
  (Array.isArray(camps) ? camps : []).forEach((c) => { if (c?.id) _supCampaigns[c.id] = c.name || c.id; });
  _supRenderCards();
  _supUpdateSummary();
}

async function _supStartRealtime() {
  if (_supRealtimeSub) return;
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
  if (_supPollTimer) {
    clearInterval(_supPollTimer);
    _supPollTimer = null;
  }
}

async function loadSupervisorPanel() {
  const page = document.getElementById('page-supervisor');
  if (!page) return;
  const de = _supLang() === 'de';

  page.innerHTML = `
<div class="page-hdr">
  <div>
    <div class="page-title">${de ? 'Live-Ansicht' : 'Canlı Ekran'}</div>
    <div class="page-sub" id="sup-live-badge">—</div>
  </div>
  <button class="btn btn-sm" onclick="_supFetchSessions()" style="gap:6px;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
    ${de ? 'Aktualisieren' : 'Yenile'}
  </button>
</div>

<div class="sup-pills">
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-total">—</span><span class="sup-pill-lbl">${de ? 'Gesamt' : 'Toplam'}</span></div>
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-oncall">—</span><span class="sup-pill-lbl">${de ? 'Im Gespräch' : 'Çağrıda'}</span></div>
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-ready">—</span><span class="sup-pill-lbl">${de ? 'Bereit' : 'Hazır'}</span></div>
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-wrap">—</span><span class="sup-pill-lbl">${de ? 'Nacharbeit' : 'Sonuç'}</span></div>
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-break">—</span><span class="sup-pill-lbl">${de ? 'Pause' : 'Mola'}</span></div>
  <div class="sup-pill"><span class="sup-pill-num" id="sup-pill-offline">—</span><span class="sup-pill-lbl">${de ? 'Offline' : 'Çevrimdışı'}</span></div>
</div>

<div class="sup-toolbar">
  <input class="form-input" id="sup-search" placeholder="${de ? 'Agent, Kunde, Nummer, Kampagne' : 'Temsilci, müşteri, numara, kampanya'}" oninput="_supOnSearch(this.value)">
</div>

<div class="card sup-live-card">
  <div class="card-title">${de ? 'Wer spricht gerade' : 'Şu an kim konuşuyor'}</div>
  <div id="sup-live-board" class="sup-live-board"></div>
</div>

<div class="sup-agent-grid" id="sup-agent-grid">
  <div class="sup-empty">${de ? 'Wird geladen…' : 'Yükleniyor…'}</div>
</div>`;

  await _supFetchSessions();
  _supStartRealtime();

  if (_supTickTimer) clearInterval(_supTickTimer);
  _supTickTimer = setInterval(() => {
    _supTickDurations();
    _supUpdateSummary();
  }, 1000);
  if (_supPollTimer) clearInterval(_supPollTimer);
  _supPollTimer = setInterval(() => { _supFetchSessions(); }, 15000);
}

function unloadSupervisorPanel() {
  _supStopRealtime();
}

try {
  window.loadSupervisorPanel  = loadSupervisorPanel;
  window.unloadSupervisorPanel = unloadSupervisorPanel;
  window._supFetchSessions    = _supFetchSessions;
  window._supOnSearch         = _supOnSearch;
} catch (_) {}
