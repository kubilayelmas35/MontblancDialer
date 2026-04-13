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

async function loadDashboard() {
renderFirmSelector('dash-firm-selector', loadDashboard);
const now = new Date();
document.getElementById('dash-date').textContent =
now.toLocaleDateString(currentLang==='tr'?'tr-TR':'de-DE', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
try {
const today = now.toISOString().split('T')[0];
const logs  = await sb(`call_logs?select=*&started_at=gte.${today}T00:00:00&started_at=lte.${today}T23:59:59`);
const total = logs.length;
const appts = logs.filter(l=>l.outcome==='appointment').length;
const cbs   = logs.filter(l=>l.outcome==='callback').length;
const vms   = logs.filter(l=>l.amd_result==='machine').length;
const cost  = logs.reduce((s,l)=>s+(l.cost_usd||0),0);
const talk  = logs.reduce((s,l)=>s+(l.talk_seconds||0),0);
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
} catch(e){ console.error(e); }
try {
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
<button onclick="remoteChangeAgentStatus('${s.agent_id}','break')" title="Molaya al" style="background:var(--yellow);border:none;border-radius:3px;padding:2px 5px;color:#000;font-size:9px;cursor:pointer;">☕</button>
<button onclick="remoteChangeAgentStatus('${s.agent_id}','offline')" title="Çevrimdışı" style="background:var(--text-3);border:none;border-radius:3px;padding:2px 5px;color:#fff;font-size:9px;cursor:pointer;">⏹</button>
</div>` : ''}
</div>`;
}).join('');
} catch(e){}
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
<td colspan="2" style="font-size:12px;">📊 TOPLAM</td>
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
if(tbody) tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:24px;">Yükleniyor...</td></tr>`;
try {
const ff = getFirmFilter('&');
const search = document.getElementById('ch-search')?.value?.toLowerCase()||'';
const outcome = document.getElementById('ch-outcome')?.value||'';
const dateFrom = document.getElementById('ch-date-from')?.value||new Date().toISOString().split('T')[0];
const dateTo = document.getElementById('ch-date-to')?.value||new Date().toISOString().split('T')[0];
let query = `call_logs?select=*,users(name),campaigns(name),contacts(first_name,last_name,phone)${ff}&order=started_at.desc&limit=500`;
query += `&started_at=gte.${dateFrom}T00:00:00`;
query += `&started_at=lte.${dateTo}T23:59:59`;
if (outcome) query += `&outcome=eq.${outcome}`;
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
if (!filtered.length) {
tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:32px;">Kayıt yok</td></tr>`;
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
<button onclick="toggleAudio('ch-aud-${l.id.split('-')[0]}')" style="background:var(--accent);border:none;border-radius:50%;width:24px;height:24px;color:#fff;cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center;">▶</button>
</div>`
: '<span style="font-size:10px;color:var(--text-3);">—</span>';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:11px;cursor:pointer;" onclick="copyToClipboard('${phone}','Numara kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:12px;">${agentName}</td>
<td style="font-size:11px;">${campName}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${OM[l.outcome]||`<span class="badge badge-gray">${l.outcome||'—'}</span>`}</td>
</tr>`;
}).join('');
} catch(e){ console.error(e); if(tbody) tbody.innerHTML=`<tr><td colspan="8" style="color:var(--red);padding:24px;">Hata: ${e.message}</td></tr>`; }
}

async function loadMyHistory() {
if (!currentUser) return;
try {
const logs=await sb(`call_logs?select=*&agent_id=eq.${currentUser.id}&order=started_at.desc&limit=100`);
const OM={
  appointment:'<span class="badge badge-green">Termin</span>',
  appointment_done:'<span class="badge badge-green">Termin</span>',
  negative:'<span class="badge badge-red">Olumsuz</span>',
  callback:'<span class="badge badge-yellow">Geri Ara</span>',
  voicemail:'<span class="badge badge-gray">Telesekreter</span>',
  no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
  dnc:'<span class="badge badge-red">DNC</span>'
};
document.getElementById('my-tbody').innerHTML=(logs||[]).map(l=>{
const dt=new Date(l.started_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const cbInfo = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);">📅 ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
return `<tr><td class="td-mono">${dt}</td><td>—</td><td class="td-mono">${l.phone||'—'}</td><td>—</td><td class="td-mono">${l.duration_sec||0}sn</td><td>${OM[l.outcome]||'—'}${cbInfo}</td></tr>`;
}).join('')||`<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:32px;">Henüz çağrı yok</td></tr>`;
} catch(e){}
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
}

function exportStatsCsv() {
var table = document.querySelector("#stats-tbody");
if (!table) return;
var result = ["Agent,Kampanya,Toplam,Termin,Olumsuz,Geri Ara,Cevap Yok,Ort Sure,Donusum"];
var trs = table.querySelectorAll("tr");
for (var i=0;i<trs.length;i++) {
var tds=trs[i].querySelectorAll("td"), cells=[];
for(var j=0;j<tds.length;j++) cells.push(tds[j].textContent.trim());
if(cells.length) result.push(cells.join(","));
}
var blob=new Blob([result.join("\n")],{type:"text/csv"});
var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="stats.csv"; a.click();
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
