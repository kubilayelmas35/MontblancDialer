// ─────────────────────────────────────────────
// WİEDERVORLAGE — geri arama yönetimi
// ─────────────────────────────────────────────

let _wvCamps = [];

function wvEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function wvSay(key, fb) {
  const s = typeof t === 'function' ? t(key) : fb;
  return !s || s === key ? fb : s;
}

function wvFirmId() {
  return (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
}

function wvCampName(id) {
  if (!id) return '—';
  const hit = [...(_wvCamps || []), ...(typeof campaigns !== 'undefined' ? campaigns || [] : [])]
    .find((c) => String(c.id) === String(id));
  return hit?.name || '—';
}

function wvAgentLabel(sel, id) {
  const opt = [...(sel?.options || [])].find((o) => o.value === id);
  return String(opt?.textContent || '').replace(/\s*\(Ben\)\s*$/, '').trim();
}

async function wvFillAgents() {
  const isAdminRole = mbIsFirmAdmin();
  const sel = document.getElementById('wv-agent-sel');
  const col = document.getElementById('wv-agent-col');
  const agentRow = document.getElementById('wv-agent-row');
  if (col) col.style.display = isAdminRole ? '' : 'none';
  if (agentRow) agentRow.style.display = isAdminRole ? '' : 'none';
  if (!isAdminRole || !sel) return;
  const fid = wvFirmId();
  const firmQ = fid ? `&firm_id=eq.${fid}` : '';
  const agents = await sb(`users?role=in.(agent,firm_admin,admin)&is_active=eq.true&select=id,name&order=name.asc${firmQ}`).catch(() => []);
  const keep = sel.value || '';
  sel.innerHTML = `<option value="">${wvEsc(wvSay('wv.all_agents', 'Tüm temsilciler'))}</option>` +
    `<option value="${wvEsc(currentUser.id)}">${wvEsc(currentUser.name)} (Ben)</option>` +
    (agents || []).filter((a) => a.id !== currentUser.id).map((a) =>
      `<option value="${wvEsc(a.id)}">${wvEsc(a.name || a.id)}</option>`
    ).join('');
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

async function wvFillCamps(selectedId) {
  const sel = document.getElementById('wv-camp');
  const fid = wvFirmId();
  let list = [];
  try {
    list = fid ? (await sb(`campaigns?firm_id=eq.${fid}&select=id,name,settings&order=name.asc`)) || [] : [];
  } catch (e) {
    list = [];
  }
  _wvCamps = list;
  if (!sel) return;
  const uid = currentUser?.id;
  const choices = typeof mbUserSeesCampaign === 'function' && uid
    ? list.filter((c) => mbUserSeesCampaign(c, uid))
    : list;
  const cur = String(selectedId || '');
  sel.innerHTML = `<option value="">${wvEsc(wvSay('wv.no_camp', 'Kampanya yok'))}</option>` +
    choices.map((c) => `<option value="${wvEsc(c.id)}" ${String(c.id) === cur ? 'selected' : ''}>${wvEsc(c.name || c.id)}</option>`).join('');
  if (cur && ![...sel.options].some((o) => o.value === cur)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${wvEsc(cur)}" selected>${wvEsc(wvCampName(cur))}</option>`);
  }
}

async function loadWvPage() {
  await wvFillAgents();
  await wvFillCamps();
  await refreshWvList();
  startWvReminders();
}

async function refreshWvList() {
  try {
    const isAdminRole = mbIsFirmAdmin();
    const url = isAdminRole
      ? 'wiedervorlage?select=*&durum=eq.bekliyor&order=termin_zaman.asc'
      : `wiedervorlage?select=*&agent_id=eq.${currentUser?.id}&durum=eq.bekliyor&order=termin_zaman.asc`;
    wvList = await sb(url).catch(() => []);
    renderWvTable();
    updateWvBadge();
  } catch(e) { console.error('WV load err:', e); }
}

function loadWvBadge() {
  if (!currentUser) return;
  const isAdminRole = mbIsFirmAdmin();
  const url = isAdminRole
    ? 'wiedervorlage?select=id,termin_zaman,durum&durum=eq.bekliyor&order=termin_zaman.asc'
    : `wiedervorlage?select=id,termin_zaman,durum&agent_id=eq.${currentUser.id}&durum=eq.bekliyor`;
  sb(url).then(list => {
    wvList = list || [];
    updateWvBadge();
    if (currentUser?.role !== 'admin') checkWvReminders();
  }).catch(()=>{});
}

function updateWvBadge() {
  const now = new Date();
  const overdue = (wvList||[]).filter((w) => w.durum === 'bekliyor' && new Date(w.termin_zaman) <= now);
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

function wvWhenLabel(w) {
  if (!w?.termin_zaman) return '—';
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(w.termin_zaman, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  const dt = new Date(w.termin_zaman);
  if (!Number.isFinite(dt.getTime())) return '—';
  return dt.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

function filterWvTable() { renderWvTable(); }

function renderWvTable() {
  const tbody = document.getElementById('wv-tbody');
  if (!tbody) return;
  const search = (document.getElementById('wv-search')?.value||'').toLowerCase();
  const now = new Date();
  const todayStr = typeof mbBusinessNow === 'function' ? mbBusinessNow().dateStr : now.toISOString().split('T')[0];
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate()+7);
  let list = [...(wvList||[])].sort((a,b) => new Date(a.termin_zaman)-new Date(b.termin_zaman));
  if (wvTab === 'today') {
    list = list.filter(w => (typeof mbBerlinDay === 'function' ? mbBerlinDay(w.termin_zaman) : String(w.termin_zaman || '').slice(0, 10)) === todayStr);
  } else if (wvTab === 'overdue') {
    list = list.filter((w) => w.durum === 'bekliyor' && new Date(w.termin_zaman) < now);
  } else if (wvTab === 'week') {
    list = list.filter(w => new Date(w.termin_zaman) <= weekEnd && new Date(w.termin_zaman) >= now);
  }
  const col = (id) => String(document.getElementById(id)?.value || '').trim().toLocaleLowerCase('tr-TR');
  const fTime = col('wv-f-time');
  const fName = col('wv-f-name');
  const fTel = col('wv-f-tel');
  const fPlace = col('wv-f-place');
  const fAgent = col('wv-f-agent');
  const fCamp = col('wv-f-camp');
  const fNote = col('wv-f-note');
  if (fTime || fName || fTel || fPlace || fAgent || fCamp || fNote) {
    list = list.filter((w) => {
      const when = wvWhenLabel(w);
      const place = `${w.plz || ''} ${w.ort || ''}`.toLocaleLowerCase('tr-TR');
      const phone = `${w.telefon || ''} ${w.telefon2 || ''}`.toLocaleLowerCase('tr-TR');
      if (fTime && !when.toLocaleLowerCase('tr-TR').includes(fTime)) return false;
      if (fName && !String(w.nachname || '').toLocaleLowerCase('tr-TR').includes(fName)) return false;
      if (fTel && !phone.includes(fTel)) return false;
      if (fPlace && !place.includes(fPlace)) return false;
      if (fAgent && !String(w.agent_name || w.agent || '').toLocaleLowerCase('tr-TR').includes(fAgent)) return false;
      if (fCamp && !wvCampName(w.campaign_id).toLocaleLowerCase('tr-TR').includes(fCamp)) return false;
      if (fNote && !String(w.notiz || '').toLocaleLowerCase('tr-TR').includes(fNote)) return false;
      return true;
    });
  }
  if (search) {
    list = list.filter(w =>
      (w.nachname||'').toLowerCase().includes(search) ||
      (w.telefon||'').includes(search) ||
      (w.plz||'').includes(search) ||
      (w.agent_name||w.agent||'').toLowerCase().includes(search) ||
      wvCampName(w.campaign_id).toLowerCase().includes(search)
    );
  }
  if (!list.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(8, 'ui.no_records') : `<tr><td colspan="8" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  const isAdminRole = mbIsFirmAdmin();
  tbody.innerHTML = list.map(w => {
    const dt = w.termin_zaman ? new Date(w.termin_zaman) : null;
    const dtStr = wvWhenLabel(w);
    const isOverdue = dt && dt < now && w.durum === 'bekliyor';
    const rowStyle = isOverdue ? 'background:rgba(var(--red-rgb),.06);' : '';
    // Conditionally render agent cell to avoid misalignment for non-admin
    const agentCell = isAdminRole
      ? `<td style="font-size:12px;">${w.agent_name||w.agent||'—'}</td>`
      : '';
    return `<tr style="${rowStyle}">
<td style="font-family:var(--mono);font-size:11px;${isOverdue?'color:var(--red);font-weight:700;':''}">${dtStr}</td>
<td style="font-weight:600;">${w.nachname||'—'}</td>
<td><a href="tel:${w.telefon||''}" style="color:var(--accent);font-family:var(--mono);font-size:12px;">${w.telefon||'—'}</a>
${w.telefon2?`<br><a href="tel:${w.telefon2}" style="color:var(--text-3);font-family:var(--mono);font-size:11px;">${w.telefon2}</a>`:''}
</td>
<td style="font-family:var(--mono);font-size:12px;">${w.plz||''} ${w.ort||''}</td>
${agentCell}
<td style="font-size:12px;">${wvEsc(wvCampName(w.campaign_id))}</td>
<td style="font-size:11px;color:var(--text-2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${wvEsc(w.notiz || '')}">${wvEsc(w.notiz || '—')}</td>
<td>
<div style="display:flex;gap:4px;align-items:center;">
<button class="icon-btn" onclick="openWvEditModal('${w.id}')" title="Düzenle"><i class="ph ph-pencil-simple"></i></button>
<button class="icon-btn" style="border-color:var(--green);color:var(--green);" onclick="wvMarkDone('${w.id}')" title="${wvEsc(wvSay('wv.called', 'Arandı'))}"><i class="ph ph-check"></i></button>
<button class="icon-btn" style="border-color:var(--red);color:var(--red);" onclick="wvMarkOlumsuz('${w.id}')" title="Olumsuz"><i class="ph ph-trash"></i></button>
<button class="icon-btn" style="border-color:var(--accent);color:var(--accent);" onclick="wvCallNow('${w.id}')" title="Ara"><i class="ph ph-phone"></i></button>
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
  const today = typeof mbBusinessNow === 'function' ? mbBusinessNow().dateStr : '';
  const tomorrow = today && typeof mbShiftDate === 'function' ? mbShiftDate(today, 1) : '';
  document.getElementById('wv-dt').value = tomorrow ? `${tomorrow}T10:00` : '';
  const sel = document.getElementById('wv-agent-sel');
  if (sel) sel.value = prefill?.agent_id || currentUser?.id || '';
  wvFillCamps(prefill?.campaign_id || '');
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
  document.getElementById('wv-dt').value = w.termin_zaman ? (typeof mbIsoToWallInput === 'function' ? mbIsoToWallInput(w.termin_zaman) : w.termin_zaman.slice(0,16)) : '';
  const sel = document.getElementById('wv-agent-sel');
  if (sel) sel.value = w.agent_id || '';
  wvFillCamps(w.campaign_id || '');
  openModal('m-wv-form');
}

async function saveWv() {
  const name = document.getElementById('wv-name').value.trim();
  const tel  = document.getElementById('wv-tel').value.trim();
  const dt   = document.getElementById('wv-dt').value;
  if (!name||!tel||!dt) { toast('Ad, telefon ve zaman zorunlu','err'); return; }
  if (typeof mbIsE164 === 'function' && !mbIsE164(tel)) {
    toast('Telefon +49 veya +90 ile, ülke koduyla yazılmalı','err');
    return;
  }
  const agentRow = document.getElementById('wv-agent-row');
  const agentSel = document.getElementById('wv-agent-sel');
  const adminPick = agentRow && agentRow.style.display !== 'none';
  const pickedAgent = String(agentSel?.value || '').trim();
  if (adminPick && !pickedAgent) {
    toast('Temsilci seçin','err');
    return;
  }
  const when = typeof mbWallToIso === 'function' ? mbWallToIso(dt) : new Date(dt).toISOString();
  if (!when) { toast('Zaman geçersiz','err'); return; }
  const agentId = pickedAgent || currentUser?.id;
  const campId = document.getElementById('wv-camp')?.value || '';
  const data = {
    nachname: name, telefon: tel,
    telefon2: document.getElementById('wv-tel2').value.trim(),
    plz: document.getElementById('wv-plz').value.trim(),
    ort: document.getElementById('wv-ort').value.trim(),
    strasse: document.getElementById('wv-str').value.trim(),
    notiz: document.getElementById('wv-note').value.trim(),
    termin_zaman: when,
    agent_id: agentId,
    agent_name: wvAgentLabel(agentSel, agentId) || currentUser?.name || '',
    firm_id: wvFirmId() || currentUser?.firm_id,
    campaign_id: campId || null,
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
    toast(currentLang === 'de' ? 'Rückruf gespeichert' : 'Geri arama kaydedildi','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function wvMarkOlumsuz(id) {
  if (!window.confirm(wvSay('wv.confirm_negative', 'Bu kayıt olumsuz işaretlensin mi?'))) return;
  try {
    await sb(`wiedervorlage?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ durum: 'olumsuz' }) });
    await refreshWvList();
    toast(t('wv.marked_negative'), 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function wvMarkDone(id) {
  try {
    await sb(`wiedervorlage?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ durum: 'arandi' }) });
    await refreshWvList();
    toast(wvSay('wv.marked_done', 'Arandı — listeden çıktı'), 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function wvCallNow(id) {
  const w = (wvList || []).find((x) => x.id === id);
  if (!w) return;
  navigate('dialer');
  if (typeof initDialer === 'function') await initDialer();
  const fid = currentUser?.firm_id;
  if (!fid || !w.telefon) {
    toast(t('wv.err_firm_phone'), 'err');
    return;
  }
  let contact = null;
  const cid = w.contact_id;
  if (cid && typeof isValidUUID === 'function' && isValidUUID(cid)) {
    const rows =
      (await sb(`contacts?id=eq.${cid}&firm_id=eq.${fid}&select=*&limit=1`).catch(() => [])) || [];
    contact = rows[0] || null;
  }
  if (!contact) {
    const ph = String(w.telefon).trim();
    let rows =
      (await sb(`contacts?firm_id=eq.${fid}&phone=eq.${encodeURIComponent(ph)}&select=*&limit=1`).catch(() => [])) ||
      [];
    if (!rows.length) {
      rows =
        (await sb(`contacts?firm_id=eq.${fid}&phone2=eq.${encodeURIComponent(ph)}&select=*&limit=1`).catch(() => [])) ||
        [];
    }
    contact = rows[0] || null;
  }
  const campId = w.campaign_id || contact?.campaign_id || '';
  if (campId && typeof selectCamp === 'function') {
    const campLabel = wvCampName(campId);
    selectCamp(campId, campLabel === '—' ? '' : campLabel, { skipActivate: true });
  }
  if (contact) {
    currentContact = contact;
    if (typeof showCustomerCard === 'function') showCustomerCard(contact);
    if (typeof syncCustomerCardEmptyVisual === 'function') syncCustomerCardEmptyVisual();
    toast(`${w.nachname || contact.first_name || ''} — ${w.telefon}`, 'ok');
    return;
  }
  const parts = String(w.nachname || '').trim().split(/\s+/);
  const synthetic = {
    id: `wv-${w.id}`,
    phone: String(w.telefon).trim(),
    phone2: w.telefon2 || '',
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || '',
    plz: w.plz || '',
    city: w.ort || '',
    address: w.strasse || '',
    notes: w.notiz || '',
    firm_id: fid,
    campaign_id: campId || null,
    status: 'pending',
    attempt_count: 0,
    _fromWiedervorlageId: w.id,
  };
  currentContact = synthetic;
  if (typeof showCustomerCard === 'function') showCustomerCard(synthetic);
  if (typeof syncCustomerCardEmptyVisual === 'function') syncCustomerCardEmptyVisual();
  window._wvPrefill = w;
  toast(t('wv.no_contact_hint'), 'warn', 4200);
}

function startWvReminders() {
  if (wvReminderTimer) clearInterval(wvReminderTimer);
  checkWvReminders();
  wvReminderTimer = setInterval(checkWvReminders, 60000);
}

const _wvSnooze = new Set();
const _wvPing = new Set();
try {
  JSON.parse(sessionStorage.getItem('mb_wv_snooze') || '[]').forEach((id) => { if (id) _wvSnooze.add(id); });
} catch (e) {}

function wvPlace(w) {
  return [w?.plz, w?.ort].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}

function showWvDuePopup(w) {
  if (!w?.id) return;
  const open = document.getElementById('wv-due-pop');
  if (open && open.dataset.id === String(w.id)) return;
  open?.remove();
  if (typeof opsCue === 'function') opsCue('due');
  if (typeof opsRememberNotice === 'function') {
    const dueTitle = typeof t === 'function' ? t('wv.due.title') : 'Arama vakti geldi';
    const dueBody = [w.nachname || '—', w.telefon || '', wvPlace(w)].filter(Boolean).join(' · ');
    const dueColor = typeof opsSoundEntry === 'function' ? opsSoundEntry('due').color : '#64748b';
    opsRememberNotice(dueTitle, dueBody, dueColor, 'wv');
  }
  const pop = document.createElement('div');
  pop.id = 'wv-due-pop';
  pop.className = 'wv-due-pop';
  pop.dataset.id = String(w.id);
  const card = document.createElement('div');
  card.className = 'wv-due-card';
  const title = document.createElement('h3');
  title.textContent = typeof t === 'function' ? t('wv.due.title') : 'Arama vakti geldi';
  const who = document.createElement('p');
  who.textContent = w.nachname || '—';
  const phone = document.createElement('p');
  phone.textContent = `${typeof t === 'function' ? t('wv.due.phone') : 'Telefon'}: ${w.telefon || '—'}`;
  const place = document.createElement('p');
  place.textContent = `${typeof t === 'function' ? t('wv.due.place') : 'Yer'}: ${wvPlace(w) || '—'}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = typeof t === 'function' ? t('wv.due.snooze') : 'Tamam';
  btn.onclick = () => wvSnoozeDue(w.id);
  card.append(title, who, phone, place, btn);
  pop.appendChild(card);
  document.body.appendChild(pop);
}

async function wvSnoozeDue(id) {
  if (!id) return;
  _wvSnooze.add(id);
  try {
    const cur = JSON.parse(sessionStorage.getItem('mb_wv_snooze') || '[]');
    if (!cur.includes(id)) cur.push(id);
    sessionStorage.setItem('mb_wv_snooze', JSON.stringify(cur.slice(-200)));
  } catch (e) {}
  document.getElementById('wv-due-pop')?.remove();
  try {
    await sb(`wiedervorlage?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ hatirlatildi: true }),
    });
  } catch (e) {}
}

function checkWvReminders() {
  if (!wvList?.length) return;
  const now = new Date();
  const on = (key) => (typeof opsSoundOn === 'function' ? opsSoundOn(key) : true);
  const soon = [];
  const hour = [];
  let due = null;
  wvList.forEach((w) => {
    if (w.durum !== 'bekliyor' || w.hatirlatildi || _wvSnooze.has(w.id)) return;
    const when = new Date(w.termin_zaman);
    if (Number.isNaN(when.getTime())) return;
    const diff = when - now;
    if (diff <= 0 && diff >= -5 * 60 * 1000) {
      if (!due || when < new Date(due.termin_zaman)) due = w;
      return;
    }
    const min = Math.round(diff / 60000);
    if (min > 0 && min <= 15) soon.push({ w, min });
    else if (min > 15 && min <= 60) hour.push({ w, min });
  });
  if (on('soon')) {
    soon.forEach(({ w, min }) => {
      const key = `${w.id}:15`;
      if (_wvPing.has(key)) return;
      _wvPing.add(key);
      const soonText = `${w.nachname || '?'} — ${min} dk sonra aranacak`;
      toast(soonText, 'ok', 6000);
      if (typeof opsCue === 'function') opsCue('soon');
      if (typeof opsRememberNotice === 'function') {
        const soonColor = typeof opsSoundEntry === 'function' ? opsSoundEntry('soon').color : '#64748b';
        opsRememberNotice('15 dk kala', soonText, soonColor, 'wv');
      }
    });
  }
  if (on('hour') && typeof opsPaintApptStrip === 'function') opsPaintApptStrip(hour);
  else if (typeof opsPaintApptStrip === 'function') opsPaintApptStrip([]);
  if (due && on('due')) showWvDuePopup(due);
  else document.getElementById('wv-due-pop')?.remove();
}
