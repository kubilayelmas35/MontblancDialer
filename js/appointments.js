// ─────────────────────────────────────────────
// APPOINTMENTS — takvim ve randevu yönetimi
// ─────────────────────────────────────────────

// ── Takvim yardımcı fonksiyonlar ─────────────
function takvimFmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function takvimGetMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay() || 7;
  if (day !== 1) dt.setDate(dt.getDate() - (day-1));
  dt.setHours(0,0,0,0);
  return dt;
}

function takvimAddHours(timeStr, hours) {
  const [h,m] = timeStr.split(':').map(Number);
  const total = h*60 + m + hours*60;
  return String(Math.floor(total/60)).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
}

async function _loadPayrollRulesFromFirmSettings(fid) {
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    return rows?.[0]?.settings?.payroll || null;
  } catch (e) {
    return null;
  }
}

async function _getCustomerCtx(selectedId) {
  const fid = getActiveFirmId?.() || currentUser?.firm_id;
  const role = currentUser?.role || '';
  const elevated = ['admin', 'super_admin', 'firm_admin', 'qc'].includes(role);
  let rules = null;
  if (typeof loadFirmPayrollRules === 'function') rules = await loadFirmPayrollRules(fid).catch(() => null);
  if (!rules) rules = await _loadPayrollRulesFromFirmSettings(fid);
  rules = rules || {};
  let customers = [];
  if (typeof loadFirmCustomers === 'function') customers = await loadFirmCustomers(fid, true).catch(() => []);
  if (!customers.length) {
    customers = await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => []);
  }
  const agentCanSelect = !!rules.appointment_customer_select_by_agent;
  const canSelect = elevated || agentCanSelect;
  return { fid, customers: customers || [], canSelect, mustSelect: canSelect && (customers || []).length > 0, selectedId: selectedId || '' };
}

function _renderCustomerField(ctx, selectId) {
  const opts = (ctx.customers || []).map(c =>
    `<option value="${c.id}" ${String(ctx.selectedId || '') === String(c.id) ? 'selected' : ''}>${(c.code ? c.code + ' · ' : '') + c.name}</option>`
  ).join('');
  if (!ctx.customers?.length) {
    return `<div class="form-row" style="grid-column:1/-1;">
      <label class="form-label">Müşteri</label>
      <div style="font-size:11px;color:var(--text-3);padding:8px 10px;background:var(--bg-3);border:1px solid var(--border);border-radius:6px;">
        Müşteri listesi boş. Muhasebe sayfasından müşteri ekleyin.
      </div>
    </div>`;
  }
  if (!ctx.canSelect) {
    return `<div class="form-row" style="grid-column:1/-1;">
      <label class="form-label">Müşteri</label>
      <div style="font-size:11px;color:var(--text-3);padding:8px 10px;background:var(--bg-3);border:1px solid var(--border);border-radius:6px;">
        Bu alanda müşteri seçimi sadece QC/Admin tarafından yapılır.
      </div>
    </div>`;
  }
  return `<div class="form-row" style="grid-column:1/-1;">
    <label class="form-label">Müşteri *</label>
    <select class="form-input" id="${selectId}"><option value="">Seçin...</option>${opts}</select>
  </div>`;
}

function _selectedCustomerId(selectId) {
  return String(document.getElementById(selectId)?.value || '').trim() || null;
}

function _validateCustomerSelection(ctx, selectId) {
  if (!ctx.mustSelect) return true;
  if (!_selectedCustomerId(selectId)) {
    toast('Müşteri seçin', 'err');
    return false;
  }
  return true;
}

async function _createAppointmentWithCustomerFallback(data) {
  try {
    return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(data)});
  } catch (e) {
    if (String(e.message || '').includes('customer_id')) {
      const clone = { ...data };
      delete clone.customer_id;
      toast('Not: customer_id migration bekliyor, müşteri bilgisi geçici kaydedilemedi.', 'warn');
      return await sb('appointments',{method:'POST',prefer:'return=representation',body:JSON.stringify(clone)});
    }
    throw e;
  }
}

async function renderInlineTerminCustomerField(selectedId) {
  const wrap = document.getElementById('tf2-customer-wrap');
  if (!wrap) return;
  const ctx = await _getCustomerCtx(selectedId || null);
  wrap.innerHTML = _renderCustomerField(ctx, 'tf2-customer');
}

async function loadTakvimPage() {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const tools = document.getElementById('takvim-admin-tools');
  const campWrap = document.getElementById('takvim-camp-select-wrap');
  if (tools) tools.style.display = isAdmin ? 'flex' : 'none';
  if (campWrap) campWrap.style.display = isAdmin ? '' : 'none';
  if (isAdmin) {
    const fid = getActiveFirmId();
    const camps = await sb(fid ? `campaigns?firm_id=eq.${fid}&status=eq.active&order=name.asc` : `campaigns?status=eq.active&order=name.asc`).catch(()=>[]);
    const sel = document.getElementById('takvim-camp-select');
    if (sel) {
      sel.innerHTML = '<option value="">Kampanya seç...</option>' + (camps||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      if (takvimCampId) sel.value = takvimCampId;
      else if (camps?.length===1) { takvimCampId = camps[0].id; sel.value = takvimCampId; }
    }
  } else {
    const myAc = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id,campaigns(id,name)&limit=1`).catch(()=>[]);
    if (myAc?.length) {
      takvimCampId = myAc[0].campaign_id;
      const lbl = document.getElementById('takvim-camp-label');
      if (lbl) lbl.textContent = myAc[0].campaigns?.name||'';
    }
  }
  takvimDate = new Date(); takvimDate.setHours(0,0,0,0);
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
  if (!isAdmin) setInterval(checkActiveCampaignNotif, 30000);
  checkActiveCampaignNotif();
}

function onTakvimCampChange(campId) {
  takvimCampId = campId;
  // Hem ana sayfa select'ini hem overlay select'ini güncelle
  ['takvim-camp-select','takvim-camp-select-ov'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.value = campId;
  });
  const lbl = document.getElementById('takvim-camp-label');
  const selRef = document.getElementById('takvim-camp-select') || document.getElementById('takvim-camp-select-ov');
  if (lbl && selRef) lbl.textContent = selRef.options[selRef.selectedIndex]?.text||campId;
  if (campId) loadTakvimSlots();
}

function setTakvimView(v) {
  takvimView = v;
  ['day','week','month'].forEach(x=>{
    const b = document.getElementById(`tv-${x}-btn`);
    if (b) { b.style.background = x===v ? 'var(--accent)' : 'transparent'; b.style.color = x===v ? '#fff' : 'var(--text-2)'; }
  });
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimPrev() {
  if (takvimView==='day') takvimDate.setDate(takvimDate.getDate()-1);
  else if (takvimView==='week') takvimDate.setDate(takvimDate.getDate()-7);
  else takvimDate.setMonth(takvimDate.getMonth()-1);
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimNext() {
  if (takvimView==='day') takvimDate.setDate(takvimDate.getDate()+1);
  else if (takvimView==='week') takvimDate.setDate(takvimDate.getDate()+7);
  else takvimDate.setMonth(takvimDate.getMonth()+1);
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

function takvimGoToday() {
  takvimDate = new Date(); takvimDate.setHours(0,0,0,0);
  takvimSlots=[]; takvimAppts=[];
  renderTakvimGrid();
  if (takvimCampId) loadTakvimSlots();
}

async function loadTakvimSlots() {
  if (!takvimCampId) return;
  let startD, endD;
  if (takvimView==='day') {
    startD = endD = takvimFmtD(takvimDate);
  } else if (takvimView==='week') {
    const mon = takvimGetMonday(takvimDate);
    const fri = new Date(mon); fri.setDate(fri.getDate()+4);
    startD = takvimFmtD(mon); endD = takvimFmtD(fri);
  } else {
    const y = takvimDate.getFullYear(), m = takvimDate.getMonth();
    startD = `${y}-${String(m+1).padStart(2,'0')}-01`;
    endD = `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`;
  }
  try {
    const slots = await sb(`takvim_slots?campaign_id=eq.${takvimCampId}&tarih=gte.${startD}&tarih=lte.${endD}&order=tarih.asc,baslangic_saat.asc`);
    takvimSlots = slots||[];
    const ids = takvimSlots.filter(s=>s.appointment_id).map(s=>s.appointment_id);
    takvimAppts = ids.length ? await sb(`appointments?id=in.(${ids.join(',')})`) || [] : [];
    takvimClosedDays = {};
    takvimSlots.filter(s=>s.gun_kapali).forEach(s=>{ takvimClosedDays[s.tarih]=true; });
    renderTakvimGrid();
    renderTakvimFailed();
  } catch(e) { toast('Takvim hatası: '+e.message,'err'); }
}

function renderTakvimGrid() {
  const grid = document.getElementById(window._takvimGridId || 'takvim-grid');
  if (!grid) return;
  if (takvimView==='month') { renderTakvimMonthGrid(grid); return; }
  const isDay = takvimView==='day';
  const startDt = isDay ? new Date(takvimDate) : takvimGetMonday(takvimDate);
  const daysCount = isDay ? 1 : 5;
  const locale = currentLang==='de' ? 'de-DE' : 'tr-TR';
  const dNames = currentLang==='de' ? ['','Mo','Di','Mi','Do','Fr'] : ['','Pzt','Sal','Çar','Per','Cum'];
  const endDt = new Date(startDt); endDt.setDate(endDt.getDate()+(daysCount-1));
  const lbl = document.getElementById(window._takvimWeekLabelId||'takvim-week-label');
  if (lbl) {
    if (isDay) lbl.textContent = startDt.toLocaleDateString(locale,{weekday:'long',day:'2-digit',month:'short'});
    else lbl.textContent = `${startDt.toLocaleDateString(locale,{day:'2-digit',month:'short'})} – ${endDt.toLocaleDateString(locale,{day:'2-digit',month:'short',year:'numeric'})}`;
  }
  const scroll = document.getElementById(window._takvimScrollId||'takvim-scroll');
  const rowH = scroll ? Math.max(44, Math.floor((scroll.clientHeight-36)/12)) : 52;
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  let h = `<div style="display:grid;grid-template-columns:52px repeat(${daysCount},1fr);">`;
  h += '<div style="background:var(--bg-3);border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:8px 4px;"></div>';
  for (let d=0; d<daysCount; d++) {
    const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
    const ds = takvimFmtD(dt);
    const isToday = dt.toDateString()===new Date().toDateString();
    const isClosed = takvimClosedDays[ds];
    const click = isAdmin ? `onclick="takvimHeaderClick('${ds}')"` : '';
    h += `<div style="background:${isClosed?'rgba(220,38,38,.08)':isToday?'rgba(37,99,235,.06)':'var(--bg-3)'};border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:6px 4px;text-align:center;font-size:10px;font-weight:800;color:${isClosed?'var(--red)':isToday?'var(--accent)':'var(--text-2)'};cursor:${isAdmin?'pointer':'default'}" ${click}>${dNames[dt.getDay()||7]}<br><span style="font-size:13px;font-weight:900;">${dt.getDate()}</span></div>`;
  }
  for (let hr=9; hr<=20; hr++) {
    const hh = String(hr).padStart(2,'0');
    h += `<div style="height:${rowH}px;background:var(--bg-2);border-bottom:1px solid var(--border);border-right:1px solid var(--border);font-size:9px;font-weight:700;color:var(--text-3);text-align:center;padding-top:4px;font-family:var(--mono);">${hh}:00</div>`;
    for (let d=0; d<daysCount; d++) {
      const dt = new Date(startDt); dt.setDate(dt.getDate()+d);
      const ds = takvimFmtD(dt);
      const isClosed = takvimClosedDays[ds];
      const click = isAdmin&&!isClosed ? `onclick="takvimCellClick('${ds}','${hh}',event)"` : '';
      const bg = isClosed ? 'repeating-linear-gradient(-45deg,rgba(220,38,38,.06),rgba(220,38,38,.06) 4px,rgba(220,38,38,.1) 4px,rgba(220,38,38,.1) 8px)' : '';
      h += `<div id="tc_${ds}_${hh}" style="height:${rowH}px;position:relative;border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:${bg};${isAdmin&&!isClosed?'cursor:pointer;':''}" ${click}></div>`;
    }
  }
  h += '</div>'; grid.innerHTML = h;
  renderTakvimSlots();
}

function renderTakvimMonthGrid(grid) {
  const y=takvimDate.getFullYear(), m=takvimDate.getMonth(), locale=currentLang==='de'?'de-DE':'tr-TR';
  const dNames = currentLang==='de' ? ['Mo','Di','Mi','Do','Fr'] : ['Pzt','Sal','Çar','Per','Cum'];
  let h = `<div style="display:grid;grid-template-columns:repeat(5,1fr);">`;
  dNames.forEach(d => h += `<div style="background:var(--bg-3);padding:6px;text-align:center;font-size:10px;font-weight:800;color:var(--text-2);border-bottom:1px solid var(--border);">${d}</div>`);
  let cur = takvimGetMonday(new Date(y,m,1));
  const last = new Date(y,m+1,0);
  let end = new Date(last); const ed = end.getDay()||7; end.setDate(end.getDate()+(7-ed));
  while (cur<=end) {
    const wd = cur.getDay();
    if (wd!==0&&wd!==6) {
      const ds = takvimFmtD(cur);
      const other = cur.getMonth()!==m;
      const today = cur.toDateString()===new Date().toDateString();
      h += `<div id="mc_${ds}" style="min-height:80px;background:${other?'var(--bg)':'var(--bg-2)'};border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:4px;overflow:hidden;"><div style="font-size:11px;font-weight:800;color:${today?'var(--accent)':'var(--text-3)'};text-align:right;">${cur.getDate()}</div><div id="ms_${ds}" style="display:flex;flex-direction:column;gap:2px;overflow:hidden;"></div></div>`;
    }
    cur.setDate(cur.getDate()+1);
  }
  h += '</div>'; grid.innerHTML = h;
  renderTakvimSlots();
}

function renderTakvimSlots() {
  if (takvimView==='month') { renderTakvimSlotsMonth(); return; }
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  takvimSlots.filter(s=>!s.gun_kapali&&!s.alta_tasindi).forEach(s=>{
    const cell = document.getElementById(`tc_${s.tarih}_${s.baslangic_saat.slice(0,2)}`);
    if (!cell) return;
    const appt = takvimAppts.find(a=>a.id===s.appointment_id);
    const el = makeTakvimSlotEl(s, appt, isAdmin);
    const [sh,sm] = s.baslangic_saat.split(':').map(Number);
    const [eh,em] = s.bitis_saat.split(':').map(Number);
    el.style.cssText += `;position:absolute;top:${(sm/60)*100}%;height:${((eh+em/60)-(sh+sm/60))*100}%;left:2px;right:2px;z-index:10;`;
    cell.appendChild(el);
  });
  setTimeout(setupDropZones, 50);
}

function renderTakvimSlotsMonth() {
  takvimSlots.filter(s=>!s.gun_kapali&&!s.alta_tasindi).forEach(s=>{
    const el = document.getElementById(`ms_${s.tarih}`);
    if (!el) return;
    const appt = takvimAppts.find(a=>a.id===s.appointment_id);
    const div = document.createElement('div');
    div.style.cssText = `font-size:9px;padding:2px 4px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-weight:700;background:${getSlotBg(s,appt)};color:#fff;`;
    div.textContent = `${s.baslangic_saat.slice(0,5)} ${appt?appt.nachname:'Boş'}`;
    div.onclick = () => openTakvimSlotDetail(s, appt);
    el.appendChild(div);
  });
}

function makeTakvimSlotEl(slot, appt, isAdmin) {
  const el = document.createElement('div');
  el.style.cssText = `border-radius:5px;padding:5px 7px;font-size:10px;cursor:pointer;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.15);background:${getSlotBg(slot,appt)};color:#fff;transition:.15s;`;
  el.onmouseover = () => el.style.transform = 'scale(1.02)';
  el.onmouseout = () => el.style.transform = '';
  const distId = `dist-${slot.id}`;
  if (slot.durum==='bos') {
    el.innerHTML = `<div style="font-weight:700;opacity:.9;">+ Boş ${slot.baslangic_saat.slice(0,5)}</div><div id="${distId}" style="font-size:8px;opacity:.8;"></div>`;
    el.style.color = getSlotColor(slot, appt);
    el.onclick = isAdmin ? () => openTakvimSlotDetail(slot, null) : () => lockAndBookSlot(slot);
    setTimeout(() => calcAndShowSlotDistance(slot, distId), 100);
  } else if (slot.durum==='kilitli') {
    el.innerHTML = `<div style="font-weight:700;">🔒 ${slot.baslangic_saat.slice(0,5)}</div>`;
    el.style.color = '#1e40af';
  } else if (appt) {
    const show = isAdmin || appt.agent_id===currentUser?.id;
    el.innerHTML = `<div style="font-weight:800;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${show?appt.nachname:'***'}</div><div style="font-size:9px;opacity:.85;">${show?appt.plz||'':''} ${slot.baslangic_saat.slice(0,5)}</div>`;
    el.onclick = () => openTakvimSlotDetail(slot, appt);
  } else {
    el.innerHTML = `<div>${slot.baslangic_saat.slice(0,5)}</div>`;
    el.onclick = () => openTakvimSlotDetail(slot, null);
  }
  el.oncontextmenu = (e) => { e.preventDefault(); showSlotContextMenu(e, slot, appt); };
  if (slot.durum==='bos') initSlotDrag(el, slot);
  return el;
}

function getSlotBg(slot, appt) {
  if (slot.durum==='bos') return 'linear-gradient(135deg,#3b82f6,#1d4ed8)';
  if (slot.durum==='kilitli') return '#dbeafe';
  const d = (appt?.durum||'').toLowerCase();
  if (d==='basarili') return 'linear-gradient(135deg,#16a34a,#15803d)';
  if (d.includes('basarisiz')||d.includes('iptal')) return 'linear-gradient(135deg,#b91c1c,#991b1b)';
  if (d==='beklemede') return 'linear-gradient(135deg,#f97316,#c2410c)';
  if (d==='ulasilamadi') return 'linear-gradient(135deg,#ca8a04,#a16207)';
  return 'linear-gradient(135deg,#1e40af,#1d4ed8)';
}

function getSlotColor(slot, appt) { return slot.durum==='kilitli' ? '#1e40af' : '#fff'; }

function takvimCellClick(ds, hh, e) {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  const start = `${hh}:00`;
  openTakvimNewSlotModal(ds, start, takvimAddHours(start, SLOT_HOURS));
}

async function takvimHeaderClick(ds) {
  const isClosed = takvimClosedDays[ds];
  if (!(await mbConfirm(isClosed ? 'Günü açmak istiyor musunuz?' : 'Günü kapatmak istiyor musunuz?', 'Gün Durumu'))) return;
  if (isClosed) {
    takvimClosedDays[ds] = false;
    sb(`takvim_slots?campaign_id=eq.${takvimCampId}&tarih=eq.${ds}&gun_kapali=eq.true`,{method:'DELETE',prefer:'return=minimal'}).then(()=>loadTakvimSlots());
  } else {
    takvimClosedDays[ds] = true;
    sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify({campaign_id:takvimCampId,firm_id:currentUser.firm_id,tarih:ds,baslangic_saat:'00:00',bitis_saat:'00:00',durum:'bos',gun_kapali:true})}).then(()=>loadTakvimSlots());
  }
}

function openTakvimNewSlotModal(ds, start, end) {
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-title').textContent = 'Yeni Slot';
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="display:flex;flex-direction:column;gap:10px;">
<div class="form-row"><label class="form-label">Tarih</label><input type="date" class="form-input" id="ns-date" value="${ds}"></div>
<div class="form-row"><label class="form-label">Başlangıç</label><input type="time" class="form-input" id="ns-start" value="${start}"></div>
<div class="form-row"><label class="form-label">Bitiş</label><input type="time" class="form-input" id="ns-end" value="${end}"></div>
</div>`;
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">İptal</button><button class="btn btn-primary" onclick="saveTakvimSlot('${ds}')">Slot Oluştur</button>`;
}

async function saveTakvimSlot(od) {
  const tarih = document.getElementById('ns-date')?.value||od;
  const bas = document.getElementById('ns-start')?.value||'10:00';
  const bit = document.getElementById('ns-end')?.value||'12:00';
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  if (!currentUser?.firm_id) { toast('Firma bilgisi eksik','err'); return; }
  try {
    await sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
      campaign_id:takvimCampId, firm_id:currentUser.firm_id,
      tarih, baslangic_saat:bas, bitis_saat:bit, durum:'bos', gun_kapali:false
    })});
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Slot oluşturuldu ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function openTakvimSlotDetail(slot, appt) {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const canManageAppt = ['admin','super_admin','firm_admin','qc'].includes(currentUser?.role||'');
  const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
  const resultMap = {};
  (resultCfg || []).forEach(r => { resultMap[r.key] = r; });
  document.getElementById('takvim-detail-title').textContent = appt ? appt.nachname : 'Boş Slot';
  openModal('m-takvim-detail');
  const body = document.getElementById('takvim-detail-body');
  const footer = document.getElementById('takvim-detail-footer');
  if (!appt) {
    const lockInfo = slot.durum==='kilitli' && isAdmin ?
      `<div style="margin-top:8px;padding:6px 10px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.3);border-radius:5px;font-size:11px;"><b>Kilitleyen Agent:</b> ${slot.kilitli_agent_id||'?'}<br><b>Kilitlenme:</b> ${slot.kilitli_at?new Date(slot.kilitli_at).toLocaleString('tr-TR'):'—'}</div>` : '';
    body.innerHTML = `<div style="text-align:center;padding:20px;">
<div style="font-weight:800;font-size:14px;">${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)} – ${slot.bitis_saat?.slice(0,5)}</div>
<div style="color:var(--text-3);font-size:12px;margin-top:4px;">${slot.durum==='kilitli'?'Kilitli':'Boş'} slot</div>
${lockInfo}
</div>`;
    footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
${isAdmin?`<button class="btn btn-ghost" style="color:var(--red);" onclick="deleteTakvimSlot('${slot.id}')">Sil</button>${slot.durum==='kilitli'?`<button class="btn btn-ghost" style="color:var(--yellow);" onclick="closeModal('m-takvim-detail');unlockSlot('${slot.id}')">Kilidi Kaldır</button>`:''}`:`<button class="btn btn-primary" onclick="closeModal('m-takvim-detail');lockAndBookSlot(takvimSlots.find(s=>s.id==='${slot.id}'))">Termin Al</button>`}`;
    return;
  }
  const statusCfg = resultMap[_normResultKey(appt.durum)] || {};
  const dc = statusCfg.color || 'var(--accent)';
  const statusLabel = statusCfg.label || (appt.durum || '').replace('_', ' ').toUpperCase();
  body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);">DURUM</div><div style="font-weight:800;font-size:14px;color:${dc};">${statusLabel}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">MÜŞTERİ</div><div style="font-weight:700;">${appt.nachname||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TELEFON</div><div style="font-weight:700;font-family:var(--mono);">${appt.telefonnummer||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">PLZ / ŞEHİR</div><div style="font-weight:700;">${appt.plz||'—'} ${appt.ortschaft||''}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ADRES</div><div style="font-weight:700;">${appt.strasse||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">EV TİPİ</div><div style="font-weight:700;">${appt.hausart||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">BAUJAHR / m²</div><div style="font-weight:700;">${appt.baujahr||'—'} / ${appt.qm||'—'}m²</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">ISITMA</div><div style="font-weight:700;">${appt.heizung||'—'} (${appt.alter_der_heizung||'—'} yaş)</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);">TÜKETİM</div><div style="font-weight:700;">${appt.verbrauch_pro_jahr||'—'}</div></div>
${appt.agent_notu?`<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);">AGENT NOTU</div><div>${appt.agent_notu}</div></div>`:''}
</div>`;
  footer.innerHTML = `<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail')">Kapat</button>
<button class="btn btn-ghost" onclick="closeModal('m-takvim-detail');openDialerForContact('${appt.contact_id||''}')">Dialer'a Git</button>
${canManageAppt ? `
<select class="form-input" id="appt-status-sel" style="width:auto;font-size:12px;padding:6px 10px;">
<option value="">Durum değiştir...</option>
${(resultCfg||[]).map(r=>`<option value="${r.key}">${r.label}</option>`).join('')}
</select>
<button class="btn btn-primary" onclick="takvimQcUpdate('${appt.id}',document.getElementById('appt-status-sel').value,document.getElementById('appt-customer-sel')?.value)">Kaydet</button>` : ''}`;
  if (canManageAppt) {
    _getCustomerCtx(appt.customer_id).then(ctx => {
      if (!ctx?.customers?.length) return;
      const el = document.createElement('div');
      el.className = 'form-row';
      el.style.cssText = 'margin-top:8px;';
      el.innerHTML = `<label class="form-label">Müşteri</label>
      <select class="form-input" id="appt-customer-sel" style="width:100%;font-size:12px;padding:6px 10px;">
        <option value="">Seçin...</option>
        ${ctx.customers.map(c => `<option value="${c.id}" ${String(appt.customer_id||'')===String(c.id)?'selected':''}>${(c.code?c.code+' · ':'')+c.name}</option>`).join('')}
      </select>`;
      body.appendChild(el);
    }).catch(()=>{});
  }
}

async function takvimQcUpdate(apptId, status, customerId) {
  if (!status && !customerId) { toast('Durum veya müşteri seçin','err'); return; }
  try {
    const body = {};
    if (status) body.durum = status;
    if (customerId !== undefined) body.customer_id = customerId || null;
    await sb(`appointments?id=eq.${apptId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify(body)});
    if (status) {
      const resultCfg = await loadFirmAppointmentResults(getActiveFirmId() || currentUser?.firm_id);
      const cfg = (resultCfg || []).find(r => r.key === _normResultKey(status));
      if (cfg?.auto_move_down) {
        const slots = await sb(`takvim_slots?appointment_id=eq.${apptId}&select=id&limit=1`).catch(() => []);
        if (slots?.[0]?.id) await slotAltaTasi(slots[0].id);
      }
    }
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Termin güncellendi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function unlockSlot(slotId) {
  if (!(await mbConfirm('Slot kilidi kaldırılsın mı?', 'Slot Kilidi'))) return;
  try {
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})});
    await loadTakvimSlots();
    toast('Kilit kaldırıldı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function agentCancelAppt(slotId, apptId) {
  if (!(await mbConfirm('Terminini iptal etmek istediğine emin misin?', 'Termin İptali'))) return;
  try {
    await sb(`appointments?id=eq.${apptId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'iptal'})});
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',appointment_id:null})});
    await loadTakvimSlots();
    toast('Termin iptal edildi','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function deleteTakvimSlot(slotId) {
  if (!(await mbConfirm('Slot silinecek?', 'Slot Sil'))) return;
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'DELETE',prefer:'return=minimal'}).catch(e=>toast('Hata: '+e.message,'err'));
  closeModal('m-takvim-detail');
  await loadTakvimSlots();
  toast('Slot silindi','ok');
}

async function lockAndBookSlot(slot) {
  if (!slot) return;
  try {
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'kilitli',kilitli_agent_id:currentUser.id,kilitli_at:new Date().toISOString()})});
  } catch(e) { toast('Slot kilitlenemiyor: '+e.message,'err'); return; }
  _bookingSlot = slot;
  // If we're in dialer context, show termin section instead of popup
  // Agent, dialer sayfasındayken takvim overlay'inden slot seçti
  const inDialerCtx = typeof onAgentSlotSelected === 'function' && typeof dialerStatus !== 'undefined';
  if (inDialerCtx) {
    // Overlay'i kapat
    const _ov = document.getElementById('takvim-popup-overlay');
    if (_ov) _ov.classList.remove('open');
    // Termin formunu göster (navigate gereksiz — onAgentSlotSelected UI'yı yönetiyor)
    onAgentSlotSelected(slot);
  } else {
    openTakvimBookForm(slot);
  }
}

async function openTakvimBookForm(slot) {
  const contact = currentContact||{};
  const custCtx = await _getCustomerCtx(null);
  document.getElementById('takvim-detail-title').textContent = `Termin — ${slot.tarih} ${slot.baslangic_saat?.slice(0,5)}`;
  openModal('m-takvim-detail');
  document.getElementById('takvim-detail-body').innerHTML = `
<div style="background:var(--bg-3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:12px;font-weight:600;">📅 ${slot.tarih} · ${slot.baslangic_saat?.slice(0,5)}–${slot.bitis_saat?.slice(0,5)}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Ad Soyad *</label><input class="form-input" id="tf-name" value="${contact.first_name?contact.first_name+' '+(contact.last_name||''):''}"></div>
<div class="form-row"><label class="form-label">Telefon *</label><input class="form-input" id="tf-tel" value="${contact.phone||''}"></div>
<div class="form-row"><label class="form-label">Telefon 2</label><input class="form-input" id="tf-tel2" value="${contact.phone2||''}"></div>
<div class="form-row" style="grid-column:1/-1;"><label class="form-label">Adres *</label><input class="form-input" id="tf-str" value="${contact.address||''}"></div>
<div class="form-row"><label class="form-label">PLZ *</label><input class="form-input" id="tf-plz" value="${contact.plz||''}"></div>
<div class="form-row"><label class="form-label">Şehir</label><input class="form-input" id="tf-ort" value="${contact.city||''}"></div>
<div class="form-row"><label class="form-label">Ev Tipi *</label><select class="form-input" id="tf-hausart"><option value="">Seçin</option><option>Einfamilienhaus</option><option>Zweifamilienhaus</option><option>Reihenhaus</option><option>Doppelhaus</option><option>Mehrfamilienhaus</option></select></div>
<div class="form-row"><label class="form-label">Yapım Yılı *</label><input class="form-input" id="tf-bj" value="${contact.baujahr||''}"></div>
<div class="form-row"><label class="form-label">m² *</label><input class="form-input" id="tf-qm" value="${contact.qm||''}"></div>
<div class="form-row"><label class="form-label">Isıtma *</label><select class="form-input" id="tf-hz"><option value="">Seçin</option><option>Gas</option><option>Öl</option><option>Pellet</option><option>WP</option><option>Fernwärme</option></select></div>
<div class="form-row"><label class="form-label">Isıtma Yaşı *</label><input class="form-input" id="tf-ah" value="${contact.alter_der_heizung||''}"></div>
<div class="form-row"><label class="form-label">Tüketim/Yıl *</label><input class="form-input" id="tf-vj" value="${contact.verbrauch_pro_jahr||''}"></div>
<div class="form-row"><label class="form-label">Kişi *</label><input class="form-input" id="tf-pe" value="${contact.personen||''}"></div>
<div class="form-row"><label class="form-label">PV İlgisi</label><select class="form-input" id="tf-pv"><option value="false">Hayır</option><option value="true">Evet</option></select></div>
${_renderCustomerField(custCtx, 'tf-customer')}
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Not</label><textarea class="form-input" id="tf-note" rows="2" style="resize:vertical;">${contact.notes||''}</textarea></div>`;
  document.getElementById('takvim-detail-footer').innerHTML = `<button class="btn btn-ghost" onclick="cancelTakvimBook('${slot.id}')">İptal</button><button class="btn btn-primary" onclick="submitTakvimBook('${slot.id}')">✓ Kaydet</button>`;
}

// Save termin directly from the inline termin-fields-section
async function saveTerminFromSection() {
  const slot = _bookingSlot || window._selectedBookingSlot;
  if (!slot) { toast('Önce takvimden bir slot seçin','err'); return; }
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf2-customer')) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  if (!g('tf2-hausart')||!g('tf2-baujahr')||!g('tf2-qm')||!g('tf2-heizung')||!g('tf2-alter_der_heizung')) {
    toast('Zorunlu alanları doldurun (*)','err'); return;
  }
  const contact = currentContact || {};
  const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
  try {
    const data = {
      slot_id: slot.id, contact_id: isValidUUID(contact.id) ? contact.id : null,
      agent_id: currentUser.id, campaign_id: takvimCampId||selectedCampId, firm_id: currentUser.firm_id,
      nachname: `${contact.first_name||''} ${contact.last_name||''}`.trim() || contact.phone || '—',
      telefonnummer: contact.phone||'', telefon2: contact.phone2||'',
      strasse: contact.address||'', plz: contact.plz||'', ortschaft: contact.city||'',
      hausart: g('tf2-hausart'), baujahr: g('tf2-baujahr'), qm: g('tf2-qm'),
      heizung: g('tf2-heizung'), alter_der_heizung: g('tf2-alter_der_heizung'),
      verbrauch_pro_jahr: g('tf2-verbrauch_pro_jahr'), personen: g('tf2-personen'),
      agent_notu: g('tf2-note'), durum: 'qc_bekleniyor',
      customer_id: _selectedCustomerId('tf2-customer'),
      termin_tarih: `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00`
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slot.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    _bookingSlot = null; window._selectedBookingSlot = null;
    // Hide the termin section
    const ts = document.getElementById('termin-fields-section');
    if (ts) ts.style.display = 'none';
    const badge = document.getElementById('termin-slot-badge');
    if (badge) { badge.textContent = 'Slot seçilmedi'; }
    toast('Termin kaydedildi ✓','ok');
    // Finalize outcome — override to prevent re-opening overlay
    if (typeof submitOutcome === 'function' && selectedOutcome === 'appointment') {
      selectedOutcome = 'appointment_done'; // prevent overlay re-open in submitOutcome
      submitOutcome(false);
    }
  } catch(e) { toast('Hata: '+e.message,'err'); console.error(e); }
}

async function cancelTakvimBook(slotId) {
  await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})}).catch(()=>{});
  _bookingSlot = null;
  closeModal('m-takvim-detail');
}

async function submitTakvimBook(slotId) {
  const custCtx = await _getCustomerCtx(null);
  if (!_validateCustomerSelection(custCtx, 'tf-customer')) return;
  const g = id => document.getElementById(id)?.value?.trim()||'';
  if (!g('tf-name')||!g('tf-tel')||!g('tf-plz')||!g('tf-hausart')||!g('tf-bj')||!g('tf-qm')||!g('tf-hz')||!g('tf-ah')) {
    toast('Zorunlu alanları doldurun!','err'); return;
  }
  const slot = _bookingSlot || takvimSlots.find(s=>s.id===slotId);
  try {
    // Fix 22007: baslangic_saat may be 'HH:MM:SS' from DB — normalize to 'HH:MM'
    const saatNorm = (t) => t ? t.slice(0,5) : '10:00';
    const data = {
      slot_id:slotId, contact_id:isValidUUID(currentContact?.id) ? currentContact.id : null,
      agent_id:currentUser.id, campaign_id:takvimCampId||selectedCampId, firm_id:currentUser.firm_id,
      nachname:g('tf-name'), telefonnummer:g('tf-tel'), telefon2:g('tf-tel2'),
      strasse:g('tf-str'), plz:g('tf-plz'), ortschaft:g('tf-ort'),
      hausart:g('tf-hausart'), baujahr:g('tf-bj'), qm:g('tf-qm'),
      heizung:g('tf-hz'), alter_der_heizung:g('tf-ah'), verbrauch_pro_jahr:g('tf-vj'),
      personen:g('tf-pe'), interesse_an_pv:g('tf-pv')==='true',
      agent_notu:g('tf-note'), durum:'qc_bekleniyor',
      customer_id:_selectedCustomerId('tf-customer'),
      termin_tarih: slot ? `${slot.tarih}T${saatNorm(slot.baslangic_saat)}:00` : new Date().toISOString()
    };
    const created = await _createAppointmentWithCustomerFallback(data);
    const aid = Array.isArray(created) ? created[0]?.id : created?.id;
    await sb(`takvim_slots?id=eq.${slotId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({durum:'dolu',appointment_id:aid,kilitli_agent_id:null,kilitli_at:null})});
    _bookingSlot = null;
    closeModal('m-takvim-detail');
    await loadTakvimSlots();
    toast('Termin kaydedildi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function openTakvimSettings() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  const old = document.getElementById('m-takvim-settings');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-takvim-settings';
  m.className = 'modal-overlay open';
  const dayNames = {pzt:'Pazartesi',sal:'Salı',car:'Çarşamba',per:'Perşembe',cum:'Cuma',cmt:'Cumartesi',paz:'Pazar'};
  m.innerHTML = `<div class="modal" style="max-width:460px;">
<div class="modal-hdr">
<div class="modal-title">Takvim Ayarları</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;">
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Çalışma Günleri</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;" id="ts-days">
${Object.entries(dayNames).map(([k,v])=>`<button class="btn btn-ghost btn-sm ts-day-btn ${['pzt','sal','car','per','cum'].includes(k)?'active':''}" data-d="${k}"
style="${['pzt','sal','car','per','cum'].includes(k)?'background:var(--accent);color:#fff;border-color:var(--accent)':''}"
onclick="this.classList.toggle('active');this.style.background=this.classList.contains('active')?'var(--accent)':'';this.style.color=this.classList.contains('active')?'#fff':'';this.style.borderColor=this.classList.contains('active')?'var(--accent)':'';">${v.slice(0,3)}</button>`).join('')}
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
<div class="form-row">
<label class="form-label">Başlangıç Saati</label>
<input type="time" class="form-input" id="ts-start" value="08:00">
</div>
<div class="form-row">
<label class="form-label">Bitiş Saati</label>
<input type="time" class="form-input" id="ts-end" value="20:00">
</div>
</div>
<div class="form-row">
<label class="form-label">Slot Süresi (saat)</label>
<select class="form-input" id="ts-slot-dur">
<option value="1">1 saat</option>
<option value="2" selected>2 saat</option>
<option value="3">3 saat</option>
</select>
</div>
<div class="form-row">
<label class="form-label">Gün başına maks. slot</label>
<input type="number" class="form-input" id="ts-max-slots" value="5" min="1" max="20" style="width:80px;">
</div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">İptal</button>
<button class="btn btn-primary" onclick="saveTakvimSettings()">Kaydet</button>
</div>
</div>`;
  document.body.appendChild(m);
}

async function saveTakvimSettings() {
  if (!takvimCampId) { toast('Kampanya seçili değil','err'); return; }
  const activeDays = [...document.querySelectorAll('.ts-day-btn.active')].map(b=>b.dataset.d);
  const start    = document.getElementById('ts-start')?.value    || '08:00';
  const end      = document.getElementById('ts-end')?.value      || '20:00';
  const dur      = parseInt(document.getElementById('ts-slot-dur')?.value||'2');
  const maxSlots = parseInt(document.getElementById('ts-max-slots')?.value||'5');
  const takvimSettings = { active_days: activeDays, start_hour: start, end_hour: end, slot_dur: dur, max_slots: maxSlots };
  try {
    // Takvim ayarlarını campaigns.settings.takvim altına yaz
    const camps = await sb(`campaigns?id=eq.${takvimCampId}&select=settings`);
    const existingSettings = camps?.[0]?.settings || {};
    await sb(`campaigns?id=eq.${takvimCampId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existingSettings, takvim: takvimSettings } })
    });
    document.getElementById('m-takvim-settings')?.remove();
    toast('Takvim ayarları kaydedildi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

function openBulkSlotModal() {
  if (!takvimCampId) { toast('Önce kampanya seçin','err'); return; }
  openModal('m-bulk-slot');
}

async function saveBulkSlots() {
  const days = [...document.querySelectorAll('.bulk-day.active')].map(b=>parseInt(b.dataset.d));
  if (!days.length) { toast('En az 1 gün seçin','err'); return; }
  const count = parseInt(document.getElementById('bulk-count').value);
  const st = document.getElementById('bulk-start').value||'10:00';
  const [sh,sm] = st.split(':').map(Number);
  const hours = Array.from({length:count},(_,i)=>String(sh+i*2).padStart(2,'0')+':'+String(sm).padStart(2,'0'));
  const monday = takvimGetMonday(takvimDate);
  const slots = [];
  days.forEach(d=>{
    const dt = new Date(monday); dt.setDate(dt.getDate()+(d-1));
    const ds = takvimFmtD(dt);
    hours.forEach(h=>slots.push({campaign_id:takvimCampId,firm_id:currentUser.firm_id,tarih:ds,baslangic_saat:h,bitis_saat:takvimAddHours(h,SLOT_HOURS),durum:'bos',gun_kapali:false}));
  });
  try {
    await sb('takvim_slots',{method:'POST',prefer:'return=minimal',body:JSON.stringify(slots)});
    closeModal('m-bulk-slot');
    await loadTakvimSlots();
    toast(`${slots.length} slot eklendi ✓`,'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

// ── Context menu ──────────────────────────────
function showSlotContextMenu(e, slot, appt) {
  e.preventDefault(); e.stopPropagation();
  _ctxSlot = slot; _ctxAppt = appt;
  const old = document.getElementById('slot-ctx-menu');
  if (old) old.remove();
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const isDolu = slot.durum === 'dolu' && appt;
  const items = [];
  const isMySlot = slot.kilitli_agent_id === currentUser?.id;
  if (slot.durum === 'bos') {
    if (!isAdmin) items.push({ icon:'', label:'Termin Al', fn:'lockAndBookSlot(_ctxSlot)' });
    if (isAdmin) items.push({ icon:'', label:'Detay', fn:'openTakvimSlotDetail(_ctxSlot,null)' });
    if (isAdmin) items.push({ icon:'', label:'Sil', fn:'deleteTakvimSlot(_ctxSlot.id)', danger:true });
  }
  if (slot.durum === 'kilitli') {
    // Admin can see who locked and unlock
    if (isAdmin) {
      const agentName = slot.kilitli_agent_id || 'Bilinmiyor';
      items.push({ icon:'', label:`Kilitleyen: ${agentName}`, fn:'void(0)' });
      items.push({ icon:'', label:'Kilidi Kaldır', fn:`unlockSlot('${slot.id}')`, yellow:true });
    }
    // Agent can cancel their own lock
    if (isMySlot) {
      items.push({ icon:'', label:'Termini İptal Et', fn:`unlockSlot('${slot.id}')`, danger:true });
    }
  }
  if (isDolu) {
    items.push({ icon:'', label:'Detaya Git (Dialer)', fn:'openDialerForContact(_ctxAppt.contact_id)' });
    items.push({ icon:'', label:'Slot Detayı', fn:'openTakvimSlotDetail(_ctxSlot,_ctxAppt)' });
    if (isAdmin) {
      items.push({ sep: true });
      items.push({ icon:'', label:'Başarılı', fn:"takvimQcUpdate(_ctxAppt.id,'basarili')", green:true });
      items.push({ icon:'', label:'Başarısız', fn:"takvimQcUpdate(_ctxAppt.id,'basarisiz')", danger:true });
      items.push({ icon:'', label:'Beklemede', fn:"takvimQcUpdate(_ctxAppt.id,'beklemede')", yellow:true });
      items.push({ sep: true });
      items.push({ icon:'', label:'Alta Taşı', fn:'slotAltaTasi(_ctxSlot.id)', yellow:true });
      items.push({ icon:'', label:'Slotu Sil', fn:'deleteTakvimSlot(_ctxSlot.id)', danger:true });
    }
    // Agent can cancel their own appointment if not yet confirmed
    if (!isAdmin && appt?.agent_id === currentUser?.id && appt?.durum === 'qc_bekleniyor') {
      items.push({ sep: true });
      items.push({ icon:'', label:'Termimi İptal Et', fn:`agentCancelAppt('${slot.id}','${appt.id}')`, danger:true });
    }
  }
  if (!items.length) return;
  const menu = document.createElement('div');
  menu.id = 'slot-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.2);padding:6px;min-width:180px;font-size:12px;';
  if (!document.getElementById('ctx-style')) {
    const s = document.createElement('style');
    s.id = 'ctx-style';
    s.textContent = '@keyframes ctxFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(s);
  }
  items.forEach(item => {
    if (item.sep) {
      const hr = document.createElement('div');
      hr.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
      menu.appendChild(hr); return;
    }
    const btn = document.createElement('button');
    btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:12px;color:${item.danger?'var(--red)':item.green?'var(--green)':item.yellow?'var(--yellow)':'var(--text)'};text-align:left;transition:.12s;`;
    btn.innerHTML = `<span style="font-size:14px;">${item.icon}</span><span style="font-weight:600;">${item.label}</span>`;
    btn.onmouseover = () => btn.style.background = 'var(--bg-3)';
    btn.onmouseout  = () => btn.style.background = 'transparent';
    btn.onclick = (ev) => { ev.stopPropagation(); menu.remove(); eval(item.fn); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const mw=menu.offsetWidth, mh=menu.offsetHeight, vw=window.innerWidth, vh=window.innerHeight;
  let x=e.clientX+4, y=e.clientY+4;
  if (x+mw>vw-8) x=e.clientX-mw-4;
  if (y+mh>vh-8) y=e.clientY-mh-4;
  menu.style.left=x+'px'; menu.style.top=y+'px';
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
    document.addEventListener('contextmenu', () => menu.remove(), { once: true });
  }, 50);
}

async function slotAltaTasi(slotId) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({alta_tasindi: true, durum: 'dolu'})});
    await loadTakvimSlots();
    toast('Slot alta taşındı', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// ── Drag & Drop ───────────────────────────────
function initSlotDrag(el, slot) {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (!isAdmin || slot.durum !== 'bos') return;
  el.draggable = true; el.style.cursor = 'grab';
  el.addEventListener('dragstart', e => {
    _dragSlot = slot; _dragOrigCell = el.parentElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', slot.id);
    el.style.opacity = '0.4'; _dragGhost = el;
    document.querySelectorAll('[id^="tc_"]').forEach(cell => { cell.classList.add('drag-target'); });
  });
  el.addEventListener('dragend', () => {
    el.style.opacity = '1'; el.style.cursor = 'grab';
    document.querySelectorAll('.drag-target').forEach(c => { c.classList.remove('drag-target','drag-over'); c.style.background = ''; });
    _dragSlot = null; _dragGhost = null;
  });
}

function setupDropZones() {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (!isAdmin) return;
  document.querySelectorAll('[id^="tc_"]').forEach(cell => {
    cell.addEventListener('dragover', e => {
      if (!_dragSlot) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drag-over').forEach(c => { c.classList.remove('drag-over'); c.style.background = ''; });
      cell.classList.add('drag-over'); cell.style.background = 'rgba(37,99,235,.15)';
    });
    cell.addEventListener('dragleave', e => { cell.classList.remove('drag-over'); cell.style.background = ''; });
    cell.addEventListener('drop', async e => {
      e.preventDefault(); cell.classList.remove('drag-over'); cell.style.background = '';
      if (!_dragSlot) return;
      const parts = cell.id.replace('tc_','').split('_');
      const newDate = parts.slice(0,-1).join('_');
      const newHour = parts[parts.length-1];
      const newStart = `${newHour}:00`;
      const [sh,sm] = _dragSlot.baslangic_saat.split(':').map(Number);
      const [eh,em] = _dragSlot.bitis_saat.split(':').map(Number);
      const durMin = (eh*60+em)-(sh*60+sm);
      const newStartMin = parseInt(newHour)*60;
      const newEndMin = newStartMin + durMin;
      const newEnd = String(Math.floor(newEndMin/60)).padStart(2,'0')+':'+String(newEndMin%60).padStart(2,'0');
      if (newDate === _dragSlot.tarih && newStart === _dragSlot.baslangic_saat) return;
      try {
        await sb(`takvim_slots?id=eq.${_dragSlot.id}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({tarih: newDate, baslangic_saat: newStart, bitis_saat: newEnd})});
        await loadTakvimSlots();
        toast(`Slot taşındı: ${newDate} ${newStart}`, 'ok');
      } catch(e2) { toast('Taşıma hatası: '+e2.message, 'err'); }
    });
  });
}

function renderTakvimFailed() {
  const sec = document.getElementById(window._takvimFailedSecId||'takvim-failed-section');
  const grid = document.getElementById(window._takvimFailedGridId||'takvim-failed-grid');
  const failed = takvimSlots.filter(s=>s.alta_tasindi);
  if (!sec||!grid) return;
  sec.style.display = failed.length ? '' : 'none';
  grid.innerHTML = failed.map(s=>{
    const appt = takvimAppts.find(a=>a.id===s.appointment_id);
    return `<div onclick="openTakvimSlotDetail(takvimSlots.find(x=>x.id==='${s.id}'),takvimAppts.find(a=>a.id==='${s.appointment_id}'))" style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;cursor:pointer;background:linear-gradient(135deg,#b91c1c,#991b1b);color:#fff;">${appt?appt.nachname:'—'} · ${s.tarih}</div>`;
  }).join('');
}

async function checkActiveCampaignNotif() {
  if (!currentUser?.firm_id) return;
  try {
    const camps = await sb(`campaigns?firm_id=eq.${currentUser.firm_id}&active_for_agents=eq.true&order=updated_at.desc&limit=1`).catch(()=>[]);
    if (!camps?.length) return;
    const camp = camps[0];
    const lastTs = parseInt(localStorage.getItem('mb_notif_ts')||'0');
    if (camp.notif_ts && camp.notif_ts > lastTs) {
      localStorage.setItem('mb_notif_ts', String(camp.notif_ts));
      showCampNotif(camp);
    }
    if (!takvimCampId && camp.id) takvimCampId = camp.id;
  } catch(e) {}
}

function showCampNotif(camp) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  ov.innerHTML = `<div style="background:var(--bg-2);border:2px solid var(--accent);border-radius:16px;padding:32px 40px;text-align:center;max-width:400px;width:90vw;">
<div style="font-size:40px;margin-bottom:12px;">📢</div>
<div style="font-size:18px;font-weight:900;color:var(--accent);margin-bottom:8px;">Aktif Kampanya</div>
<div style="font-size:16px;font-weight:700;padding:10px 16px;background:var(--bg-3);border-radius:8px;margin-bottom:20px;">${camp.name}</div>
${camp.notif_message?`<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">${camp.notif_message}</div>`:''}
<button onclick="this.closest('[style*=fixed]').remove();navigate('takvim');" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">📅 Takvime Git</button>
<button onclick="this.closest('[style*=fixed]').remove();" style="width:100%;padding:10px;background:transparent;color:var(--text-2);border:none;font-size:12px;cursor:pointer;margin-top:8px;">Kapat</button>
</div>`;
  document.body.appendChild(ov);
}

// ── TomTom mesafe ─────────────────────────────
async function calcTomTomDistance(from, to) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !from || !to) return null;
  try {
    const enc = (s) => encodeURIComponent(s);
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${enc(from)}:${enc(to)}/json?key=${tk}&travelMode=car`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const meters = data?.routes?.[0]?.summary?.lengthInMeters;
    if (!meters) return null;
    return meters < 1000 ? `${meters}m` : `${(meters/1000).toFixed(1)}km`;
  } catch(e) { return null; }
}

async function calcAndShowSlotDistance(slot, distElId) {
  const el = document.getElementById(distElId);
  if (!el) return;
  if (!currentContact?.address && !currentContact?.plz) return;
  const fromAddr = `${currentContact.address||''} ${currentContact.plz||''} Germany`.trim();
  if (!slot.appointment_id) return;
  const appt = takvimAppts.find(a => a.id === slot.appointment_id);
  if (!appt?.strasse) return;
  const toAddr = `${appt.strasse} ${appt.plz||''} Germany`.trim();
  const dist = await calcTomTomDistance(fromAddr, toAddr);
  if (dist && el) el.textContent = `📍 ${dist}`;
}

// ── Import Appts ──────────────────────────────
function openImportApptModal() {
  const campSel = document.getElementById('ia-campaign');
  const agentSel = document.getElementById('ia-agent');
  if (campSel) {
    campSel.innerHTML = '<option value="">Kampanya seçin...</option>' +
      (campaigns||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  const ff = getFirmFilter('&');
  sb(`users?select=id,name,role${ff}&role=in.(agent,firm_admin)&is_active=eq.true&order=name.asc`)
    .then(users => {
      if (agentSel) agentSel.innerHTML = '<option value="">Agent seçin...</option>' +
        (users||[]).map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
    }).catch(()=>{});
  _iaRows=[]; _iaHeaders=[];
  document.getElementById('ia-file').value='';
  document.getElementById('ia-file-name').textContent='Dosya seçmek için tıkla';
  ['ia-mapping-section','ia-options-section','ia-preview-section','ia-progress-section'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  document.getElementById('ia-preview-btn').style.display='none';
  document.getElementById('ia-submit-btn').style.display='none';
  openModal('m-import-appt');
}

async function onImportFileChange(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('ia-file-name').textContent = file.name;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array', cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  if (!data.length) { toast('Dosya boş','err'); return; }
  _iaHeaders = data[0].map(h=>String(h).trim());
  _iaRows = data.slice(1).filter(row=>row.some(cell=>cell!==''));
  const grid = document.getElementById('ia-mapping-grid');
  grid.innerHTML = IA_FIELDS.map(f=>`
<div style="display:flex;align-items:center;gap:6px;">
<label style="font-size:11px;font-weight:700;min-width:110px;color:${f.required?'var(--text)':'var(--text-3)'};">${f.label}</label>
<select class="form-input" id="ia-map-${f.key}" style="flex:1;font-size:11px;padding:4px 6px;">
<option value="">— Seç —</option>
${_iaHeaders.map((h,i)=>`<option value="${i}" ${autoMatchImport(h,f.key)?'selected':''}>${h}</option>`).join('')}
</select>
</div>`).join('');
  document.getElementById('ia-mapping-section').style.display='';
  document.getElementById('ia-options-section').style.display='';
  document.getElementById('ia-preview-btn').style.display='';
  document.getElementById('ia-submit-btn').style.display='';
  toast(`${_iaRows.length} satır okundu ✓`, 'ok');
}

function autoMatchImport(header, fieldKey) {
  const h = header.toLowerCase();
  const matches = {
    nachname: ['name','ad','soyad','müşteri','nachname'],
    telefon:  ['tel','telefon','phone','handy'],
    telefon2: ['tel2','telefon2','phone2'],
    strasse:  ['adres','adresse','strasse','sokak'],
    plz:      ['plz','posta','postleitzahl'],
    ort:      ['şehir','stadt','ort','city'],
    termin_tarih: ['tarih','datum','termin','date'],
    termin_saat:  ['saat','uhrzeit','time'],
    notiz:    ['not','notiz','note'],
    durum:    ['durum','status','ergebnis'],
  };
  return (matches[fieldKey]||[]).some(kw=>h.includes(kw));
}

function getImportMapping() {
  const map = {};
  IA_FIELDS.forEach(f => {
    const sel = document.getElementById(`ia-map-${f.key}`);
    if (sel?.value !== '') map[f.key] = parseInt(sel.value);
  });
  return map;
}

// ── Mesai saatleri ────────────────────────────

async function loadMesaiSettings() {
  const card = document.getElementById('mesai-settings-card');
  if (!card) return;

  const role = currentUser?.role || '';
  const isSuperAdmin  = role === 'super_admin';
  const isAdminLevel  = ['admin','firm_admin'].includes(role);
  const canView = isSuperAdmin || isAdminLevel;

  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const firmRow    = document.getElementById('mesai-firm-row');
  const permRow    = document.getElementById('mesai-admin-perm-row');
  const saveBtn    = document.getElementById('mesai-save-btn');
  const noticeEl   = document.getElementById('mesai-readonly-notice');

  if (isSuperAdmin) {
    // Firma seçici göster
    if (firmRow) firmRow.style.display = '';
    if (permRow) permRow.style.display = 'flex';

    const firmSel = document.getElementById('mesai-firm-select');
    if (firmSel && !firmSel.options.length) {
      try {
        const firms = await sb('firms?is_active=eq.true&select=id,name&order=name');
        firmSel.innerHTML = (firms||[]).map(f =>
          `<option value="${f.id}">${f.name}</option>`
        ).join('');
      } catch(e) {}
    }
    if (firmSel?.value) _mesaiFirmId = firmSel.value;
    else if (firmSel?.options.length) _mesaiFirmId = firmSel.options[0].value;
    _mesaiFirmSettings = null; // firma değişti, cache temizle
  } else {
    if (firmRow) firmRow.style.display = 'none';
    if (permRow) permRow.style.display = 'none';
    _mesaiFirmId = currentUser?.firm_id;
  }

  await _renderMesaiGrid();
}

async function _renderMesaiGrid() {
  const grid    = document.getElementById('mesai-grid');
  const saveBtn = document.getElementById('mesai-save-btn');
  const noticeEl= document.getElementById('mesai-readonly-notice');
  const permChk = document.getElementById('mesai-admin-perm-chk');
  if (!grid) return;

  const role         = currentUser?.role || '';
  const isSuperAdmin = role === 'super_admin';
  const firmId       = _mesaiFirmId;

  if (!firmId) {
    grid.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px;">Firma seçin</div>';
    return;
  }

  // Firma settings'ini yükle (admin izin kontrolü için)
  if (!_mesaiFirmSettings) {
    try {
      const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
      _mesaiFirmSettings = firms?.[0]?.settings || {};
    } catch(e) { _mesaiFirmSettings = {}; }
  }

  const adminCanEdit = !!_mesaiFirmSettings?.admin_can_edit_mesai;
  const canEdit = isSuperAdmin || adminCanEdit;

  // Admin izin checkbox'ını güncelle
  if (permChk && isSuperAdmin) permChk.checked = adminCanEdit;

  // Readonly uyarısı
  if (noticeEl) noticeEl.style.display = (!isSuperAdmin && !canEdit) ? '' : 'none';
  if (saveBtn)  saveBtn.style.display  = canEdit ? '' : 'none';

  // Mesai satırlarını yükle
  let existing = {};
  try {
    const rows = await sb(`mesai_saatleri?firm_id=eq.${firmId}`);
    (rows||[]).forEach(r => { existing[r.gun] = r; });
  } catch(e) {}

  const dis = canEdit ? '' : 'disabled';
  grid.innerHTML = GUNLER.map(g => {
    const r = existing[g.key] || {};
    const aktif = !r.calismiyor;
    return `<div class="mesai-row" data-gun="${g.key}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-3);border-radius:6px;">
<input type="checkbox" class="mesai-aktif" ${aktif?'checked':''} ${dis} style="width:15px;height:15px;${dis?'cursor:not-allowed;opacity:.5;':''}">
<span style="font-size:12px;font-weight:600;min-width:90px;">${g.label}</span>
<input type="time" class="form-input mesai-bas" value="${r.mesai_baslangic||'09:00'}" ${dis} style="width:90px;font-size:12px;padding:4px 6px;${dis?'opacity:.5;':''}">
<span style="font-size:11px;color:var(--text-3);">—</span>
<input type="time" class="form-input mesai-bit" value="${r.mesai_bitis||'18:00'}" ${dis} style="width:90px;font-size:12px;padding:4px 6px;${dis?'opacity:.5;':''}">
</div>`;
  }).join('');
}

// Süper admin firma dropdown değiştirince
async function onMesaiFirmChange() {
  const firmSel = document.getElementById('mesai-firm-select');
  _mesaiFirmId       = firmSel?.value || null;
  _mesaiFirmSettings = null; // cache sıfırla
  await _renderMesaiGrid();
}

// Süper admin: adminin düzenleme iznini kaydet
async function saveAdminMesaiPermission() {
  if (currentUser?.role !== 'super_admin') return;
  const firmId = _mesaiFirmId;
  if (!firmId) { toast('Önce firma seçin', 'err'); return; }
  const perm = !!document.getElementById('mesai-admin-perm-chk')?.checked;
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,settings`);
    const firm  = firms?.[0];
    if (!firm) throw new Error('Firma bulunamadı');
    const newSettings = { ...(firm.settings||{}), admin_can_edit_mesai: perm };
    await sb(`firms?id=eq.${firmId}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ settings: newSettings })
    });
    _mesaiFirmSettings = newSettings;
    toast(perm ? 'Admin düzenleme yetkisi verildi ✓' : 'Admin yetkisi kaldırıldı ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

async function saveMesaiSaatleri() {
  const role = currentUser?.role || '';
  const isSuperAdmin = role === 'super_admin';

  // Yetki kontrolü
  if (!isSuperAdmin && !_mesaiFirmSettings?.admin_can_edit_mesai) {
    toast('Düzenleme yetkiniz yok', 'err'); return;
  }

  const rows = document.querySelectorAll('.mesai-row');
  if (!rows.length) { toast('Kayıt edilecek satır yok', 'err'); return; }

  const firmId = _mesaiFirmId;
  if (!firmId) { toast('Firma bilgisi bulunamadı', 'err'); return; }

  const records = [];
  rows.forEach(row => {
    const gun  = row.dataset.gun;
    const aktif = row.querySelector('.mesai-aktif')?.checked;
    const bas   = row.querySelector('.mesai-bas')?.value || '09:00';
    const bit   = row.querySelector('.mesai-bit')?.value || '18:00';
    records.push({ firm_id: firmId, gun, calismiyor: !aktif, mesai_baslangic: bas, mesai_bitis: bit });
  });

  try {
    for (const r of records) {
      await sbUpsert('mesai_saatleri', r, 'firm_id,gun');
    }
    toast('Çalışma saatleri kaydedildi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// ── Arama Kısıtlamaları (Call Hours) ──────────

async function loadCallHoursSettings() {
  const card = document.getElementById('call-hours-card');
  if (!card) return;
  const isSuperAdmin = currentUser?.role === 'super_admin';
  card.style.display = isSuperAdmin ? '' : 'none';
  if (!isSuperAdmin) return;

  const firmSel = document.getElementById('ch-firm-select');
  if (firmSel && !firmSel.options.length) {
    try {
      const firms = await sb('firms?is_active=eq.true&select=id,name&order=name');
      firmSel.innerHTML = (firms||[]).map(f =>
        `<option value="${f.id}">${f.name}</option>`
      ).join('');
    } catch(e) {}
  }
  if (!_callHoursFirmId && firmSel?.value) _callHoursFirmId = firmSel.value;

  await _renderCallHoursForm();
}

async function _renderCallHoursForm() {
  const firmId = _callHoursFirmId;
  if (!firmId) return;

  let ch = {};
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    ch = firms?.[0]?.settings?.call_hours || {};
  } catch(e) {}

  const g = id => document.getElementById(id);
  g('ch-wd-start')?.setAttribute('value', ch.weekday_start||'09:00');
  g('ch-wd-end')  ?.setAttribute('value', ch.weekday_end  ||'20:00');

  const satAllowed = ch.sat_allowed !== false;
  if (g('ch-sat-allowed')) g('ch-sat-allowed').checked = satAllowed;
  const satTimes = g('ch-sat-times');
  if (satTimes) satTimes.style.display = satAllowed ? 'flex' : 'none';
  g('ch-sat-start')?.setAttribute('value', ch.sat_start||'09:00');
  g('ch-sat-end')  ?.setAttribute('value', ch.sat_end  ||'13:00');

  if (g('ch-sun-allowed'))   g('ch-sun-allowed').checked   = !!ch.sun_allowed;
  if (g('ch-holiday-check')) g('ch-holiday-check').checked = ch.holiday_check !== false;

  // value attribute does not update live input, set .value directly too
  ['ch-wd-start','ch-wd-end','ch-sat-start','ch-sat-end'].forEach(id => {
    const el = g(id); if (el) el.value = el.getAttribute('value');
  });
}

async function onCallHoursFirmChange() {
  _callHoursFirmId = document.getElementById('ch-firm-select')?.value || null;
  await _renderCallHoursForm();
}

async function saveCallHoursSettings() {
  if (currentUser?.role !== 'super_admin') return;
  const firmId = _callHoursFirmId;
  if (!firmId) { toast('Önce firma seçin', 'err'); return; }

  const g = id => document.getElementById(id);
  const ch = {
    weekday_start  : g('ch-wd-start')?.value     || '09:00',
    weekday_end    : g('ch-wd-end')?.value        || '20:00',
    sat_allowed    : !!g('ch-sat-allowed')?.checked,
    sat_start      : g('ch-sat-start')?.value     || '09:00',
    sat_end        : g('ch-sat-end')?.value        || '13:00',
    sun_allowed    : !!g('ch-sun-allowed')?.checked,
    holiday_check  : !!g('ch-holiday-check')?.checked
  };

  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=id,settings`);
    const firm  = firms?.[0];
    if (!firm) throw new Error('Firma bulunamadı');
    const newSettings = { ...(firm.settings||{}), call_hours: ch };
    await sb(`firms?id=eq.${firmId}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ settings: newSettings })
    });
    // Aynı firma aktif firmaysa çalışan _callHours'u da güncelle
    if (firmId === currentUser?.firm_id || firmId === _selectedFirmId) {
      _callHours = ch;
    }
    toast('Arama kısıtlamaları kaydedildi ✓', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// Login sonrası kendi firmasının call_hours'unu yükle
async function loadFirmCallHours() {
  const firmId = currentUser?.firm_id;
  if (!firmId) return;
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    _callHours = firms?.[0]?.settings?.call_hours || null;
  } catch(e) { _callHours = null; }
}
