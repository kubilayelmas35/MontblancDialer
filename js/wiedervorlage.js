// ─────────────────────────────────────────────
// WİEDERVORLAGE — geri arama yönetimi
// ─────────────────────────────────────────────

async function loadWvPage() {
  const agentFilter = currentUser?.role === 'admin' ? null : currentUser?.email;
  const col = document.getElementById('wv-agent-col');
  if (col) col.style.display = currentUser?.role === 'admin' ? '' : 'none';
  const agentRow = document.getElementById('wv-agent-row');
  if (agentRow) agentRow.style.display = currentUser?.role === 'admin' ? '' : 'none';
  if (currentUser?.role === 'admin') {
    const sel = document.getElementById('wv-agent-sel');
    if (sel) {
      const agents = await sb('agent_sessions?select=agent_id,agent_name&order=agent_name.asc').catch(() => []);
      sel.innerHTML = `<option value="${currentUser.email}">${currentUser.name||currentUser.email}</option>` +
        [...new Set((agents||[]).map(a=>a.agent_name||a.agent_id).filter(Boolean))].map(n=>
          `<option value="${n}">${n}</option>`).join('');
    }
  }
  await refreshWvList();
  startWvReminders();
}

async function refreshWvList() {
  try {
    const url = currentUser?.role === 'admin'
      ? 'wiedervorlage?select=*&order=termin_zaman.asc'
      : `wiedervorlage?select=*&agent_name=eq.${encodeURIComponent(currentUser?.name||currentUser?.email)}&order=termin_zaman.asc`;
    wvList = await sb(url).catch(() => []);
    renderWvTable();
    updateWvBadge();
  } catch(e) { console.error('WV load err:', e); }
}

function loadWvBadge() {
  if (!currentUser) return;
  const url = currentUser?.role === 'admin'
    ? 'wiedervorlage?select=id,termin_zaman,durum&order=termin_zaman.asc'
    : `wiedervorlage?select=id,termin_zaman,durum&agent_name=eq.${encodeURIComponent(currentUser?.name||currentUser?.email)}`;
  sb(url).then(list => {
    wvList = list || [];
    updateWvBadge();
    if (currentUser?.role !== 'admin') checkWvReminders();
  }).catch(()=>{});
}

function updateWvBadge() {
  const now = new Date();
  const overdue = (wvList||[]).filter(w => w.durum !== 'tamamlandi' && new Date(w.termin_zaman) <= now);
  const badge = document.getElementById('sb-badge-wv');
  if (badge) {
    badge.style.display = overdue.length > 0 ? '' : 'none';
    if (overdue.length > 0) badge.textContent = overdue.length;
  }
  const overdueEl = document.getElementById('wv-overdue-count');
  if (overdueEl) {
    overdueEl.style.display = overdue.length > 0 ? '' : 'none';
    overdueEl.textContent = overdue.length;
  }
}

function setWvTab(tab) {
  wvTab = tab;
  ['all','today','overdue','week'].forEach(t => {
    const btn = document.getElementById('wv-tab-'+t);
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#fff' : 'var(--text-2)';
    }
  });
  renderWvTable();
}

function filterWvTable() { renderWvTable(); }

function renderWvTable() {
  const tbody = document.getElementById('wv-tbody');
  if (!tbody) return;
  const search = (document.getElementById('wv-search')?.value||'').toLowerCase();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate()+7);
  let list = [...(wvList||[])].sort((a,b) => new Date(a.termin_zaman)-new Date(b.termin_zaman));
  if (wvTab === 'today') {
    list = list.filter(w => w.termin_zaman?.startsWith(todayStr));
  } else if (wvTab === 'overdue') {
    list = list.filter(w => w.durum !== 'tamamlandi' && new Date(w.termin_zaman) < now);
  } else if (wvTab === 'week') {
    list = list.filter(w => new Date(w.termin_zaman) <= weekEnd && new Date(w.termin_zaman) >= now);
  }
  if (search) {
    list = list.filter(w =>
      (w.nachname||'').toLowerCase().includes(search) ||
      (w.telefon||'').includes(search) ||
      (w.plz||'').includes(search) ||
      (w.agent||'').toLowerCase().includes(search)
    );
  }
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:32px;">Kayıt yok</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(w => {
    const dt = w.termin_zaman ? new Date(w.termin_zaman) : null;
    const dtStr = dt ? dt.toLocaleString('tr-TR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    const isOverdue = dt && dt < now && w.durum !== 'tamamlandi';
    const rowStyle = isOverdue ? 'background:rgba(var(--red-rgb),.06);' : '';
    return `<tr style="${rowStyle}">
<td style="font-family:var(--mono);font-size:11px;${isOverdue?'color:var(--red);font-weight:700;':''}">${dtStr}</td>
<td style="font-weight:600;">${w.nachname||'—'}</td>
<td><a href="tel:${w.telefon||''}" style="color:var(--accent);font-family:var(--mono);font-size:12px;">${w.telefon||'—'}</a>
${w.telefon2?`<br><a href="tel:${w.telefon2}" style="color:var(--text-3);font-family:var(--mono);font-size:11px;">${w.telefon2}</a>`:''}
</td>
<td style="font-family:var(--mono);font-size:12px;">${w.plz||''} ${w.ort||''}</td>
<td style="font-size:12px;">${w.agent||'—'}</td>
<td style="font-size:11px;color:var(--text-2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(w.notiz||'').replace(/"/g,'')}">${w.notiz||'—'}</td>
<td>
<div style="display:flex;gap:4px;">
<button class="btn btn-ghost btn-sm" style="padding:3px 7px;" onclick="openWvEditModal('${w.id}')">✏️</button>
<button class="btn btn-ghost btn-sm" style="padding:3px 7px;color:var(--green);" onclick="wvMarkDone('${w.id}')" title="Tamamlandı">✓</button>
<button class="btn btn-ghost btn-sm" style="padding:3px 7px;" onclick="wvCallNow('${w.id}')">📞</button>
</div>
</td>
</tr>`;
  }).join('');
}

function openWvModal(prefill) {
  wvEditId = null;
  document.getElementById('wv-form-title').textContent = 'Aranacak Ekle';
  document.getElementById('wv-name').value = prefill?.nachname||prefill?.first_name&&prefill?.last_name?`${prefill.first_name} ${prefill.last_name}`.trim():prefill?.first_name||'';
  document.getElementById('wv-tel').value = prefill?.phone||prefill?.telefon||'';
  document.getElementById('wv-tel2').value = prefill?.phone2||prefill?.telefon2||'';
  document.getElementById('wv-plz').value = prefill?.plz||'';
  document.getElementById('wv-ort').value = prefill?.city||prefill?.ort||'';
  document.getElementById('wv-str').value = prefill?.address||prefill?.strasse||'';
  document.getElementById('wv-note').value = prefill?.notiz||'';
  const def = new Date(); def.setDate(def.getDate()+1); def.setHours(10,0,0,0);
  document.getElementById('wv-dt').value = def.toISOString().slice(0,16);
  const sel = document.getElementById('wv-agent-sel');
  if (sel && prefill?.agent) sel.value = prefill.agent;
  openModal('m-wv-form');
}

function openWvEditModal(id) {
  const w = (wvList||[]).find(x => x.id === id);
  if (!w) return;
  wvEditId = id;
  document.getElementById('wv-form-title').textContent = 'Aranacak Düzenle';
  document.getElementById('wv-name').value = w.nachname||'';
  document.getElementById('wv-tel').value = w.telefon||'';
  document.getElementById('wv-tel2').value = w.telefon2||'';
  document.getElementById('wv-plz').value = w.plz||'';
  document.getElementById('wv-ort').value = w.ort||'';
  document.getElementById('wv-str').value = w.strasse||'';
  document.getElementById('wv-note').value = w.notiz||'';
  document.getElementById('wv-dt').value = w.termin_zaman ? w.termin_zaman.slice(0,16) : '';
  const sel = document.getElementById('wv-agent-sel');
  if (sel) sel.value = w.agent||'';
  openModal('m-wv-form');
}

async function saveWv() {
  const name = document.getElementById('wv-name').value.trim();
  const tel  = document.getElementById('wv-tel').value.trim();
  const dt   = document.getElementById('wv-dt').value;
  if (!name||!tel||!dt) { toast('Ad, Telefon ve Zaman zorunlu!','err'); return; }
  const agentSel = document.getElementById('wv-agent-sel');
  const data = {
    nachname: name, telefon: tel,
    telefon2: document.getElementById('wv-tel2').value.trim(),
    plz: document.getElementById('wv-plz').value.trim(),
    ort: document.getElementById('wv-ort').value.trim(),
    strasse: document.getElementById('wv-str').value.trim(),
    notiz: document.getElementById('wv-note').value.trim(),
    termin_zaman: new Date(dt).toISOString(),
    agent: agentSel?.value || currentUser?.name || currentUser?.email || '',
    durum: 'bekliyor',
  };
  try {
    if (wvEditId) {
      await sb(`wiedervorlage?id=eq.${wvEditId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify(data)});
    } else {
      await sb('wiedervorlage', {method:'POST', prefer:'return=minimal', body: JSON.stringify(data)});
    }
    closeModal('m-wv-form');
    await refreshWvList();
    toast('WV kaydedildi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function wvMarkDone(id) {
  try {
    await sb(`wiedervorlage?id=eq.${id}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({durum:'tamamlandi'})});
    await refreshWvList();
    toast('Tamamlandı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function wvCallNow(id) {
  const w = (wvList||[]).find(x=>x.id===id);
  if (!w) return;
  navigate('dialer');
  setTimeout(() => {
    if (w.telefon) { window._wvPrefill = w; toast(`${w.nachname} — ${w.telefon}`, 'ok'); }
  }, 300);
}

function startWvReminders() {
  if (wvReminderTimer) clearInterval(wvReminderTimer);
  checkWvReminders();
  wvReminderTimer = setInterval(checkWvReminders, 60000);
}

function checkWvReminders() {
  if (!wvList?.length) return;
  const now = new Date();
  const in15 = new Date(now.getTime() + 15*60*1000);
  const overdue = wvList.filter(w => {
    if (w.durum === 'tamamlandi') return false;
    const t = new Date(w.termin_zaman);
    return t <= in15 && t >= new Date(now.getTime()-5*60*1000);
  });
  overdue.forEach(w => {
    const t = new Date(w.termin_zaman);
    const diff = Math.round((t-now)/60000);
    const msg = diff <= 0 ? `${w.nachname||'?'} — ŞIMDI aranmalı!` : `${w.nachname||'?'} — ${diff} dk sonra aranacak`;
    toast(msg, diff<=0 ? 'err' : 'ok', 6000);
  });
}
