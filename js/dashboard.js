// ─────────────────────────────────────────────
// DASHBOARD — topbar stats, ana sayfa, istatistikler
// ─────────────────────────────────────────────

async function updateTopbarStats() {
const t0 = Date.now();
try {
await fetch(`${SB_URL}/rest/v1/campaigns?limit=1`, { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} });
document.getElementById('pill-ping').textContent = Date.now()-t0;
} catch(e) { document.getElementById('pill-ping').textContent = '!'; }
try {
const sessions = await sb('agent_sessions?select=*');
document.getElementById('pill-call').textContent  = sessions.filter(s=>s.status==='on_call').length;
document.getElementById('pill-ready').textContent = sessions.filter(s=>s.status==='ready').length;
document.getElementById('pill-break').textContent = sessions.filter(s=>s.status==='break').length;
} catch(e){}
try {
const cs = await sb('campaigns?select=id,status&status=eq.active');
document.getElementById('pill-camp').textContent = cs.length;
document.getElementById('sb-badge-camp').textContent = cs.length;
} catch(e){}
try {
const today = new Date().toISOString().split('T')[0];
const logs  = await sb(`call_logs?select=id&outcome=eq.appointment&started_at=gte.${today}T00:00:00`);
document.getElementById('pill-appt').textContent = logs.length;
} catch(e){}
}

function _dashCanUseAgentFilter() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

function _dashLogFilter() {
  const ff = getFirmFilter('&') || '';
  const role = currentUser?.role || '';
  const onlySelf = role === 'agent';
  let agentQ = '';
  if (onlySelf) {
    agentQ = `&agent_id=eq.${currentUser.id}`;
  } else if (_dashCanUseAgentFilter()) {
    const sel = document.getElementById('dash-agent-f');
    const aid = sel && !sel.disabled ? String(sel.value || '').trim() : '';
    if (aid) agentQ = `&agent_id=eq.${aid}`;
  }
  return { ff, agentQ, onlySelf, isAdmin: ['admin', 'super_admin', 'firm_admin'].includes(role) };
}

async function populateDashAgentSelect() {
  const wrap = document.getElementById('dash-agent-wrap');
  const sel = document.getElementById('dash-agent-f');
  if (!wrap || !sel) return;
  if (!_dashCanUseAgentFilter()) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const prev = sel.value;
  if (currentUser?.role === 'super_admin' && !getActiveFirmId()) {
    sel.innerHTML = `<option value="">${currentLang === 'tr' ? 'Önce firma seçin' : 'Firma wählen'}</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const fid = getActiveFirmId() || currentUser.firm_id;
  if (!fid) {
    sel.innerHTML = `<option value="">${currentLang === 'tr' ? 'Tüm agentler' : 'Alle Agenten'}</option>`;
    return;
  }
  try {
    const users = await sb(`users?firm_id=eq.${fid}&select=id,name,role&order=name.asc`) || [];
    const trAll = currentLang === 'tr' ? 'Tüm agentler' : 'Alle Agenten';
    sel.innerHTML = `<option value="">${trAll}</option>` + users.map(u => {
      const nm = String(u.name || u.id.slice(0, 8)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<option value="${u.id}">${nm}</option>`;
    }).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  } catch (e) {
    console.error(e);
  }
}

function _isTerminOutcome(o) {
  return o === 'appointment' || o === 'appointment_done';
}

function _dashCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function renderDashChart7d(logsByDay, labels) {
  const canvas = document.getElementById('dash-chart-7d');
  if (!canvas || typeof Chart === 'undefined') return;
  const accent = _dashCssVar('--accent', '#2563eb');
  const border = _dashCssVar('--border', '#e2e8f0');
  if (window._dashChart7d) { window._dashChart7d.destroy(); window._dashChart7d = null; }
  window._dashChart7d = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: currentLang === 'tr' ? 'Çağrı' : 'Anrufe',
        data: logsByDay,
        borderColor: accent,
        backgroundColor: accent.length === 7 ? accent + '22' : 'rgba(37,99,235,0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: border }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: border }, ticks: { stepSize: 1, font: { size: 11 } } }
      }
    }
  });
}

/** Bugün — saatlik: çubuk = toplam çağrı, çizgi = termin */
function renderDashHourlyMixed(logs) {
  const canvas = document.getElementById('dash-chart-hourly');
  if (!canvas || typeof Chart === 'undefined') return;
  const hourly = Array(24).fill(0);
  const hourlyTermin = Array(24).fill(0);
  (logs || []).forEach(l => {
    if (!l.started_at) return;
    const h = new Date(l.started_at).getHours();
    if (h < 0 || h > 23) return;
    hourly[h]++;
    if (_isTerminOutcome(l.outcome)) hourlyTermin[h]++;
  });
  const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const accent = _dashCssVar('--accent', '#2563eb');
  const green = _dashCssVar('--green', '#16a34a');
  const border = _dashCssVar('--border', '#e2e8f0');
  const t = currentLang === 'tr';
  if (window._dashChartHourly) { window._dashChartHourly.destroy(); window._dashChartHourly = null; }
  window._dashChartHourly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t ? 'Çağrı' : 'Anrufe',
          data: hourly,
          backgroundColor: accent.length === 7 ? accent + '33' : 'rgba(37,99,235,0.2)',
          borderColor: accent,
          borderWidth: 1,
          order: 2,
          borderRadius: 4
        },
        {
          type: 'line',
          label: t ? 'Termin' : 'Termin',
          data: hourlyTermin,
          borderColor: green,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const tot = hourly[ctx.dataIndex] || 0;
              const te = hourlyTermin[ctx.dataIndex] || 0;
              if (!tot) return '';
              return t ? `Başarı: %${((te / tot) * 100).toFixed(0)} (termin/çağrı)` : `Quote: %${((te / tot) * 100).toFixed(0)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: { stepSize: 1, font: { size: 11 } }
        }
      }
    }
  });
}

/** Bugün — sonuç dağılımı (doughnut) */
function renderDashOutcomeDonut(logs) {
  const canvas = document.getElementById('dash-chart-outcomes');
  if (!canvas || typeof Chart === 'undefined') return;
  const tr = currentLang === 'tr';
  const cat = {
    termin: { n: 0, tr: 'Termin', de: 'Termin' },
    callback: { n: 0, tr: 'Geri ara', de: 'Rückruf' },
    negative: { n: 0, tr: 'Olumsuz', de: 'Negativ' },
    no_answer: { n: 0, tr: 'Cevap yok', de: 'Keine Antwort' },
    voicemail: { n: 0, tr: 'Telesekreter', de: 'Mailbox' },
    dnc: { n: 0, tr: 'Kara liste', de: 'DNC' },
    other: { n: 0, tr: 'Diğer', de: 'Sonstige' }
  };
  (logs || []).forEach(l => {
    const o = l.outcome || '';
    if (_isTerminOutcome(o)) cat.termin.n++;
    else if (o === 'callback') cat.callback.n++;
    else if (o === 'negative') cat.negative.n++;
    else if (o === 'no_answer') cat.no_answer.n++;
    else if (o === 'voicemail') cat.voicemail.n++;
    else if (o === 'dnc') cat.dnc.n++;
    else cat.other.n++;
  });
  const order = ['termin', 'callback', 'negative', 'no_answer', 'voicemail', 'dnc', 'other'];
  const labels = [];
  const data = [];
  const colors = [];
  const green = _dashCssVar('--green', '#16a34a');
  const yellow = _dashCssVar('--yellow', '#d97706');
  const red = _dashCssVar('--red', '#dc2626');
  const accent = _dashCssVar('--accent', '#2563eb');
  const purple = _dashCssVar('--purple', '#7c3aed');
  const muted = _dashCssVar('--text-3', '#9ca3af');
  const colorMap = { termin: green, callback: yellow, negative: red, no_answer: muted, voicemail: accent, dnc: purple, other: _dashCssVar('--text-2', '#6b7280') };
  order.forEach(k => {
    if (cat[k].n > 0) {
      labels.push(tr ? cat[k].tr : cat[k].de);
      data.push(cat[k].n);
      colors.push(colorMap[k]);
    }
  });
  if (window._dashChartOutcomes) { window._dashChartOutcomes.destroy(); window._dashChartOutcomes = null; }
  if (!data.length) {
    labels.push(tr ? 'Veri yok' : 'Keine Daten');
    data.push(1);
    colors.push(muted);
  }
  const sliceBorder = _dashCssVar('--bg-2', '#ffffff');
  window._dashChartOutcomes = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: sliceBorder, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 10, font: { size: 11 }, padding: 10, usePointStyle: true }
        }
      }
    }
  });
}

async function loadDashboard() {
renderFirmSelector('dash-firm-selector', loadDashboard);
await populateDashAgentSelect();
const { ff, agentQ, onlySelf } = _dashLogFilter();
const costEl = document.getElementById('dash-stat-cost');
const liveWrap = document.getElementById('dash-live-wrap');
const subEl = document.getElementById('dash-chart-sub');
if (costEl) costEl.style.display = onlySelf ? 'none' : '';
const showLive = ['admin', 'super_admin', 'firm_admin', 'qc'].includes(currentUser?.role || '');
if (liveWrap) liveWrap.style.display = showLive ? '' : 'none';
if (subEl) {
  subEl.textContent = onlySelf
    ? (currentLang === 'tr' ? 'Senin günlük çağrı sayın' : 'Deine Anrufe pro Tag')
    : (currentLang === 'tr' ? 'Günlük toplam çağrı sayısı' : 'Anzahl Anrufe pro Tag');
}
const now = new Date();
const today = now.toISOString().split('T')[0];
document.getElementById('dash-date').textContent =
now.toLocaleDateString(currentLang==='tr'?'tr-TR':'de-DE', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
try {
let qToday = `call_logs?select=*&started_at=gte.${today}T00:00:00&started_at=lte.${today}T23:59:59`;
qToday += ff;
qToday += agentQ;
const logs  = await sb(qToday);
renderDashHourlyMixed(logs);
renderDashOutcomeDonut(logs);
const total = logs.length;
const appts = logs.filter(l=>_isTerminOutcome(l.outcome)).length;
const cbs   = logs.filter(l=>l.outcome==='callback').length;
const vms   = logs.filter(l=>l.amd_result==='machine').length;
const cost  = logs.reduce((s,l)=>s+(l.cost_usd||0),0);
const talk  = logs.reduce((s,l)=>s+(l.duration_sec||0),0);
document.getElementById('d-calls').textContent  = total;
document.getElementById('d-appt').textContent   = appts;
document.getElementById('d-cb').textContent     = cbs;
document.getElementById('d-vm').textContent     = vms;
document.getElementById('d-cost').textContent   = `$${cost.toFixed(2)}`;
document.getElementById('d-talk').textContent   = `${Math.floor(talk/60)}dk`;
document.getElementById('d-calls-m').textContent= `${total} çağrı bugün`;
document.getElementById('d-appt-m').textContent = total>0?`%${((appts/total)*100).toFixed(1)} dönüşüm`:'%0 dönüşüm';
document.getElementById('d-avg').textContent    = `ort. ${total>0?Math.round(talk/total):0}sn/çağrı`;
document.getElementById('pill-appt').textContent= appts;
} catch(e){ console.error(e); renderDashHourlyMixed([]); renderDashOutcomeDonut([]); }
try {
const from7 = new Date(now);
from7.setDate(from7.getDate() - 6);
const fromStr = from7.toISOString().split('T')[0];
let q7 = `call_logs?select=started_at&started_at=gte.${fromStr}T00:00:00&started_at=lte.${today}T23:59:59`;
q7 += ff;
q7 += agentQ;
const weekLogs = await sb(q7) || [];
const labels = [];
const counts = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const ds = d.toISOString().split('T')[0];
  labels.push(d.toLocaleDateString(currentLang === 'tr' ? 'tr-TR' : 'de-DE', { weekday: 'short', day: 'numeric' }));
  counts.push(weekLogs.filter(l => String(l.started_at || '').slice(0, 10) === ds).length);
}
renderDashChart7d(counts, labels);
} catch (e) { console.error(e); }
if (showLive) try {
const sessions = await sb('agent_sessions?select=*');
const live = document.getElementById('live-agents');
const active = sessions.filter(s=>s.status!=='offline');
if (!active.length) {
live.innerHTML = `<div style="color:var(--text-3);text-align:center;padding:24px;font-size:13px;">${currentLang==='tr'?'Aktif agent yok':'Keine aktiven Agenten'}</div>`;
return;
}
const SC = { ready:{c:'var(--green)',l:'Hazır'}, on_call:{c:'var(--accent)',l:'Aramada'}, wrapping:{c:'var(--yellow)',l:'Sonuç giriyor'}, break:{c:'var(--yellow)',l:'Mola'} };
const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
live.innerHTML = active.map(s => {
const st = SC[s.status]||{c:'var(--text-3)',l:s.status};
return `<div class="live-row">
<div class="live-av">${s.agent_name.charAt(0)}</div>
<div style="flex:1;">
<div class="live-name">${s.agent_name}</div>
<div style="font-size:10px;color:var(--text-3);">${s.campaign_id?'Kampanyada':'—'}</div>
</div>
<span class="badge" style="background:${st.c}18;color:${st.c};">
<div style="width:6px;height:6px;border-radius:50%;background:${st.c};"></div>${st.l}
</span>
${isAdmin ? `<div style="display:flex;gap:2px;margin-left:4px;">
<button onclick="remoteChangeAgentStatus('${s.agent_id}','ready')" title="Hazır yap" style="background:var(--green);border:none;border-radius:3px;padding:2px 5px;color:#fff;font-size:9px;cursor:pointer;">▶</button>
<button onclick="remoteChangeAgentStatus('${s.agent_id}','break')" title="Molaya al" style="background:var(--yellow);border:none;border-radius:3px;padding:2px 5px;color:#000;font-size:9px;cursor:pointer;"><i class="ph ph-coffee" style="font-size:10px;"></i></button>
<button onclick="remoteChangeAgentStatus('${s.agent_id}','offline')" title="Çevrimdışı" style="background:var(--text-3);border:none;border-radius:3px;padding:2px 5px;color:#fff;font-size:9px;cursor:pointer;">⏹</button>
</div>` : ''}
</div>`;
}).join('');
} catch(e){}
if (typeof loadDashEmployeeOfMonth === 'function') {
  try { await loadDashEmployeeOfMonth(); } catch (e) { console.warn('eom', e); }
}
}

async function loadStats() {
renderFirmSelector('stats-firm-selector', loadStats);
const tbody = document.getElementById('stats-tbody');
if(tbody) tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:24px;">Yükleniyor...</td></tr>`;
try {
const ff = getFirmFilter('&');
const dateFilter = document.getElementById('stats-date-f')?.value || 'today';
const campFilter = document.getElementById('stats-camp-f')?.value || '';
const now = new Date();
let dateFrom = now.toISOString().split('T')[0];
let dateTo = now.toISOString().split('T')[0];
if (dateFilter === 'week') {
const d = new Date(now); d.setDate(d.getDate() - 6);
dateFrom = d.toISOString().split('T')[0];
} else if (dateFilter === 'month') {
dateFrom = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
} else if (dateFilter === 'custom') {
dateFrom = document.getElementById('stats-date-from')?.value || dateFrom;
dateTo   = document.getElementById('stats-date-to')?.value   || dateTo;
}
let query = `call_logs?select=*,users(id,name),campaigns(id,name)${ff}`;
query += `&started_at=gte.${dateFrom}T00:00:00&started_at=lte.${dateTo}T23:59:59`;
if (campFilter) query += `&campaign_id=eq.${campFilter}`;
query += '&order=started_at.desc&limit=2000';
const logs = await sb(query) || [];
const groups = {};
logs.forEach(l => {
const agentId = l.agent_id || 'unknown';
const campId  = l.campaign_id || 'unknown';
const key = `${agentId}__${campId}`;
if (!groups[key]) groups[key] = {
agent_id: agentId,
agent_name: l.users?.name || agentId.slice(0,8),
campaign_id: campId,
campaign_name: l.campaigns?.name || '—',
logs: []
};
groups[key].logs.push(l);
});
const rows = Object.values(groups);
if (!rows.length) {
tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:32px;">Bu tarih aralığında veri yok</td></tr>`;
return;
}
let totAll=0,apAll=0,ngAll=0,cbAll=0,naAll=0,secAll=0;
tbody.innerHTML = rows.map(r => {
const ls = r.logs, tot = ls.length;
const ap = ls.filter(l=>l.outcome==='appointment').length;
const ng = ls.filter(l=>l.outcome==='negative').length;
const cb = ls.filter(l=>l.outcome==='callback').length;
const na = ls.filter(l=>l.outcome==='no_answer').length;
const totalSec = ls.reduce((s,l)=>s+(l.duration_sec||l.duration_seconds||0),0);
const avgSec = tot ? Math.round(totalSec/tot) : 0;
const convPct = tot ? Math.round(ap/tot*100) : 0;
totAll+=tot; apAll+=ap; ngAll+=ng; cbAll+=cb; naAll+=na; secAll+=totalSec;
return `<tr>
<td style="font-weight:700;">${r.agent_name}</td>
<td style="font-size:11px;">${r.campaign_name}</td>
<td class="td-mono">${tot}</td>
<td><span class="badge badge-green" style="font-size:12px;font-weight:800;">${ap}</span></td>
<td><span class="badge badge-red">${ng}</span></td>
<td><span class="badge badge-yellow">${cb}</span></td>
<td><span class="badge badge-gray">${na}</span></td>
<td class="td-mono">${Math.floor(avgSec/60)}:${String(avgSec%60).padStart(2,'0')}</td>
<td><span style="font-weight:800;color:${convPct>=20?'var(--green)':convPct>=10?'var(--yellow)':'var(--red)'};">${convPct}%</span></td>
</tr>`;
}).join('') + `<tr style="background:var(--bg-3);font-weight:800;border-top:2px solid var(--border);">
<td colspan="2" style="font-size:12px;font-weight:800;">TOPLAM</td>
<td class="td-mono">${totAll}</td>
<td><span class="badge badge-green">${apAll}</span></td>
<td><span class="badge badge-red">${ngAll}</span></td>
<td><span class="badge badge-yellow">${cbAll}</span></td>
<td><span class="badge badge-gray">${naAll}</span></td>
<td class="td-mono">${Math.floor(secAll/totAll/60||0)}:${String(Math.round(secAll/totAll%60||0)).padStart(2,'0')}</td>
<td><span style="font-weight:800;color:var(--accent);">${totAll?Math.round(apAll/totAll*100):0}%</span></td>
</tr>`;
const campSel = document.getElementById('stats-camp-f');
if (campSel && campSel.options.length <= 1) {
const uniqueCamps = [...new Set(logs.map(l=>l.campaign_id).filter(Boolean))];
uniqueCamps.forEach(cid => {
const log = logs.find(l=>l.campaign_id===cid);
const opt = document.createElement('option');
opt.value = cid; opt.textContent = log?.campaigns?.name || cid.slice(0,8);
campSel.appendChild(opt);
});
}
} catch(e){ console.error(e); if(tbody) tbody.innerHTML=`<tr><td colspan="9" style="color:var(--red);padding:24px;">Hata: ${e.message}</td></tr>`; }
}

async function loadCallHistory() {
const tbody = document.getElementById('ch-tbody');
if(tbody) tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:24px;">Yükleniyor...</td></tr>`;
try {
const ff = getFirmFilter('&');
const search = document.getElementById('ch-search')?.value?.toLowerCase()||'';
const outcome = document.getElementById('ch-outcome')?.value||'';
const agentFilter = document.getElementById('ch-agent-f')?.value||'';
const dateFrom = document.getElementById('ch-date-from')?.value||new Date().toISOString().split('T')[0];
const dateTo = document.getElementById('ch-date-to')?.value||new Date().toISOString().split('T')[0];
let query = `call_logs?select=*,users(id,name),campaigns(name),contacts(first_name,last_name,phone)${ff}&order=started_at.desc&limit=500`;
query += `&started_at=gte.${dateFrom}T00:00:00`;
query += `&started_at=lte.${dateTo}T23:59:59`;
if (outcome) query += outcome==='appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
if (agentFilter) query += `&agent_id=eq.${agentFilter}`;
const logs = await sb(query) || [];
const OM={
appointment:'<span class="badge badge-green">Termin</span>',
negative:'<span class="badge badge-red">Olumsuz</span>',
callback:'<span class="badge badge-yellow">Geri Ara</span>',
voicemail:'<span class="badge badge-gray">Telesekreter</span>',
no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
dnc:'<span class="badge badge-red">🚫 DNC</span>',
};
let filtered = logs;
if (search) {
filtered = logs.filter(l => {
const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.toLowerCase();
const phone = l.phone||l.contacts?.phone||'';
const agent = l.users?.name?.toLowerCase()||'';
return name.includes(search) || phone.includes(search) || agent.includes(search);
});
}
// Populate agent filter dropdown from unique agents in results
const agentSel = document.getElementById('ch-agent-f');
if (agentSel && agentSel.options.length <= 1 && logs.length) {
  const uniqueAgents = [];
  const seen = new Set();
  logs.forEach(l => { if (l.agent_id && !seen.has(l.agent_id)) { seen.add(l.agent_id); uniqueAgents.push({id:l.agent_id, name:l.users?.name||l.agent_id.slice(0,8)}); }});
  uniqueAgents.sort((a,b)=>a.name.localeCompare(b.name));
  uniqueAgents.forEach(a => { const o=document.createElement('option'); o.value=a.id; o.textContent=a.name; agentSel.appendChild(o); });
}
if (!filtered.length) {
tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:32px;">Kayıt yok</td></tr>`;
return;
}
tbody.innerHTML = filtered.map(l=>{
const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const dur = l.duration_sec ? `${Math.floor(l.duration_sec/60)}:${String(l.duration_sec%60).padStart(2,'0')}` : '—';
const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.trim() || '—';
const phone = l.phone || l.contacts?.phone || '—';
const agentName = l.users?.name || '—';
const campName = l.campaigns?.name || '—';
const recHtml = l.recording_url
? `<div style="display:flex;align-items:center;gap:4px;">
<audio id="ch-aud-${l.id}" src="${l.recording_url}" preload="none" style="display:none;"></audio>
<button onclick="toggleAudio('ch-aud-${l.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;color:var(--text-2);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;"><i class="ph ph-play"></i></button>
</div>`
: '<span style="font-size:10px;color:var(--text-3);">—</span>';
const detailBtn = l.contact_id ? `<button class="icon-btn" onclick="openContactDrawer('${l.contact_id}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
const cbHtml = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);margin-top:2px;"><i class="ph ph-calendar" style="vertical-align:-2px;"></i> ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:11px;cursor:pointer;" onclick="copyToClipboard('${phone}','Numara kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:12px;">${agentName}</td>
<td style="font-size:11px;">${campName}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${OM[l.outcome]||`<span class="badge badge-gray">${l.outcome||'—'}</span>`}${cbHtml}</td>
<td>${detailBtn}</td>
</tr>`;
}).join('');
} catch(e){ console.error(e); if(tbody) tbody.innerHTML=`<tr><td colspan="8" style="color:var(--red);padding:24px;">Hata: ${e.message}</td></tr>`; }
}

async function loadMyHistory() {
if (!currentUser) return;
try {
const today = new Date().toISOString().split('T')[0];
const dateFrom = document.getElementById('mh-date-from')?.value || today;
const dateTo   = document.getElementById('mh-date-to')?.value   || today;
const search   = (document.getElementById('mh-search')?.value||'').toLowerCase();
const outcome  = document.getElementById('mh-outcome')?.value||'';
let query = `call_logs?select=*,contacts(first_name,last_name,phone),campaigns(name)&agent_id=eq.${currentUser.id}`;
query += `&started_at=gte.${dateFrom}T00:00:00&started_at=lte.${dateTo}T23:59:59`;
if (outcome) query += outcome === 'appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
query += '&order=started_at.desc&limit=200';
const logs = await sb(query) || [];
const OM={
  appointment:'<span class="badge badge-green">Termin</span>',
  appointment_done:'<span class="badge badge-green">Termin</span>',
  negative:'<span class="badge badge-red">Olumsuz</span>',
  callback:'<span class="badge badge-yellow">Geri Ara</span>',
  voicemail:'<span class="badge badge-gray">Telesekreter</span>',
  no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
  dnc:'<span class="badge badge-red">DNC</span>'
};
let filtered = logs;
if (search) {
  filtered = logs.filter(l => {
    const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.toLowerCase();
    const phone = (l.phone||l.contacts?.phone||'').toLowerCase();
    return name.includes(search) || phone.includes(search);
  });
}
const tbody = document.getElementById('my-tbody');
if (!filtered.length) {
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:32px;">Kayıt yok</td></tr>`;
  return;
}
tbody.innerHTML = filtered.map(l=>{
const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.trim()||'—';
const phone = l.phone || l.contacts?.phone || '—';
const camp = l.campaigns?.name || '—';
const dur = l.duration_sec ? `${Math.floor(l.duration_sec/60)}:${String(l.duration_sec%60).padStart(2,'0')}` : '—';
const cbInfo = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);margin-top:2px;"><i class="ph ph-calendar" style="vertical-align:-2px;"></i> ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
const recHtml = l.recording_url
  ? `<button onclick="event.stopPropagation();toggleAudio('mh-aud-${l.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;">
<audio id="mh-aud-${l.id}" src="${l.recording_url}" preload="none" style="display:none;"></audio>
<i class="ph ph-play"></i></button>`
  : '<span style="color:var(--text-3);font-size:11px;">—</span>';
const detailBtn = l.contact_id ? `<button class="icon-btn" onclick="openContactDrawer('${l.contact_id}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:12px;cursor:pointer;" onclick="copyToClipboard('${phone}','Kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:11px;">${camp}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${OM[l.outcome]||`<span class="badge badge-gray">${l.outcome||'—'}</span>`}${cbInfo}</td>
<td>${detailBtn}</td>
</tr>`;
}).join('');
} catch(e){ console.error(e); }
}

function initStatsFilters() {
const today = new Date().toISOString().split('T')[0];
const from = document.getElementById('stats-date-from');
const to   = document.getElementById('stats-date-to');
if (from) from.value = today;
if (to)   to.value   = today;
}

function initCallHistoryFilters() {
const today = new Date().toISOString().split('T')[0];
const from = document.getElementById('ch-date-from');
const to   = document.getElementById('ch-date-to');
if (from && !from.value) from.value = today;
if (to   && !to.value)   to.value   = today;
if (typeof updateCallHistoryExportVisibility === 'function') updateCallHistoryExportVisibility();
}

function initMyHistoryFilters() {
const today = new Date().toISOString().split('T')[0];
const from = document.getElementById('mh-date-from');
const to   = document.getElementById('mh-date-to');
if (from && !from.value) from.value = today;
if (to   && !to.value)   to.value   = today;
}

function toggleCustomDateRange() {
var val = document.getElementById("stats-date-f") ? document.getElementById("stats-date-f").value : "";
var wrap = document.getElementById("stats-custom-range");
if (wrap) wrap.style.display = val==="custom" ? "flex" : "none";
}

async function remoteChangeAgentStatus(agentId, newStatus) {
try {
await sb(`agent_sessions?agent_id=eq.${agentId}`,{
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({status:newStatus, updated_at:new Date().toISOString()})
});
toast(`Agent durumu: ${newStatus} ✓`, 'ok');
loadDashboard();
} catch(e) { toast('Hata: '+e.message,'err'); }
}
