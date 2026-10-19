// Takvim araçları — appointments.js ile aynı global kapsam
// ── Context menu ──────────────────────────────
function showSlotContextMenu(e, slot, appt) {
  e.preventDefault(); e.stopPropagation();
  if (typeof takvimHideTip === 'function') takvimHideTip();
  _ctxSlot = slot; _ctxAppt = appt;
  const old = document.getElementById('slot-ctx-menu');
  if (old) old.remove();
  const isAdmin = mbIsFirmAdmin();
  const isDolu = slot.durum === 'dolu' && appt;
  const items = [];
  if (window._takvimMovePick) {
    items.push({ icon: '', label: 'Taşımayı iptal', onClick: () => takvimClearMovePickMode(), yellow: true });
    items.push({ sep: true });
  }
  const isMySlot = slot.kilitli_agent_id === currentUser?.id;
  if (slot.durum === 'bos') {
    if (!isAdmin) items.push({ icon:'', label:'Randevu Al', onClick: () => lockAndBookSlot(_ctxSlot) });
    if (isAdmin) items.push({ icon:'', label:'Detay', onClick: () => openTakvimSlotDetail(_ctxSlot, null) });
    if (isAdmin) items.push({ icon:'', label:'Randevu ekle', onClick: () => takvimAdminRandevuEkle(_ctxSlot) });
    if (isAdmin) items.push({ icon:'', label: (typeof t === 'function' ? t('cal.bind') : 'Atanmamış randevu bağla'), onClick: () => openTakvimBindUnassigned(_ctxSlot) });
    if (isAdmin) items.push({ icon:'', label:'Kilitle', onClick: () => takvimAdminKilitle(_ctxSlot), yellow:true });
    if (isAdmin) items.push({ icon:'', label:'Sil', onClick: () => deleteTakvimSlot(_ctxSlot.id), danger:true });
  }
  if (slot.durum === 'kilitli') {
    // Admin can see who locked and unlock
    if (isAdmin) {
      const agentName = slot.kilitli_agent_id || 'Bilinmiyor';
      items.push({ icon:'', label:`Kilitleyen: ${agentName}`, onClick: null });
      items.push({ icon:'', label:'Kilidi Kaldır', onClick: () => unlockSlot(slot.id), yellow:true });
    }
    // Agent can cancel their own lock
    if (isMySlot) {
      items.push({ icon:'', label:'Randevuyu İptal Et', onClick: () => unlockSlot(slot.id), danger:true });
    }
  }
  const canManageAppt = ['admin','super_admin','firm_admin','qc'].includes(currentUser?.role||'');
  if (isDolu) {
    items.push({ icon:'', label:'Detaya Git (Dialer)', onClick: () => openDialerForContact(_ctxAppt.contact_id) });
    items.push({ icon:'', label:'Slot Detayı', onClick: () => openTakvimSlotDetail(_ctxSlot, _ctxAppt) });
    if (isAdmin) items.push({ icon:'', label:'Sahaya Ata', onClick: () => openFieldAssignModal(_ctxAppt.id, _ctxAppt.firm_id) });
    if (isAdmin) {
      items.push({ icon:'', label:'Kampanya değiştir', onClick: () => openTakvimChangeCampaignModal(_ctxSlot, _ctxAppt) });
      items.push({ icon:'', label:'Randevuyu taşı', onClick: () => openTakvimMoveAppointmentModal(_ctxSlot, _ctxAppt) });
    }
    if (isAdmin || canManageAppt) {
      items.push({ sep: true });
      const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
      const rows = (fid && window._apptResultsByFirm?.[fid]) || (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const hex = (r.color || '#64748b').replace(/\s/g, '');
        items.push({
          icon: '',
          label: r.label || r.key,
          hexColor: hex,
          onClick: () => takvimQcUpdate(_ctxAppt.id, r.key)
        });
      });
    }
    if (isAdmin) {
      items.push({ sep: true });
      if (slot.alta_tasindi) items.push({ icon:'', label: (typeof t === 'function' ? t('cal.up') : 'Üste al'), onClick: () => slotUsteCikar(_ctxSlot.id), green:true });
      else items.push({ icon:'', label:'Alta Taşı', onClick: () => slotAltaTasi(_ctxSlot.id), yellow:true });
      items.push({ icon:'', label:'Slotu Sil', onClick: () => deleteTakvimSlot(_ctxSlot.id), danger:true });
    }
    // Agent can cancel their own appointment if not yet confirmed
    if (!isAdmin && appt?.agent_id === currentUser?.id && appt?.durum === 'qc_bekleniyor') {
      items.push({ sep: true });
      items.push({ icon:'', label:'Termimi İptal Et', onClick: () => agentCancelAppt(slot.id, appt.id), danger:true });
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
    const baseColor = item.hexColor
      ? item.hexColor
      : item.danger
        ? 'var(--red)'
        : item.green
          ? 'var(--green)'
          : item.yellow
            ? 'var(--yellow)'
            : 'var(--text)';
    btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:12px;color:${baseColor};text-align:left;transition:.12s;`;
    btn.innerHTML = `<span style="font-size:14px;">${item.icon}</span><span style="font-weight:600;">${item.label}</span>`;
    btn.onmouseover = () => btn.style.background = 'var(--bg-3)';
    btn.onmouseout  = () => btn.style.background = 'transparent';
    btn.onclick = (ev) => {
      ev.stopPropagation();
      menu.remove();
      if (typeof item.onClick === 'function') item.onClick();
    };
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

async function openTakvimBindUnassigned(slot) {
  const campId = slot?.campaign_id || (typeof takvimCampId !== 'undefined' ? takvimCampId : '');
  if (!slot?.id || !campId) {
    toast(typeof t === 'function' ? t('ops.panel.needfirm') : 'Önce firma seçin', 'warn');
    return;
  }
  document.getElementById('takvim-bind-pop')?.remove();
  let appts = [];
  let used = [];
  try {
    [appts, used] = await Promise.all([
      sb(`appointments?campaign_id=eq.${campId}&slot_id=is.null&select=id,nachname,telefonnummer,plz,ortschaft,termin_tarih&order=kayit_tarihi.desc&limit=120`),
      sb(`takvim_slots?campaign_id=eq.${campId}&appointment_id=not.is.null&select=appointment_id&limit=500`),
    ]);
  } catch (e) {
    toast((typeof t === 'function' ? t('cal.bind.fail') : 'Bağlama hatası: ') + (e.message || ''), 'err');
    return;
  }
  const taken = new Set((used || []).map((row) => String(row.appointment_id || '')));
  const free = (appts || []).filter((row) => row?.id && !taken.has(String(row.id)));
  const pop = document.createElement('div');
  pop.id = 'takvim-bind-pop';
  pop.className = 'takvim-bind-pop';
  const card = document.createElement('div');
  card.className = 'takvim-bind-card';
  const title = document.createElement('h3');
  title.textContent = typeof t === 'function' ? t('cal.bind.title') : 'Atanmamış randevu';
  card.appendChild(title);
  if (!free.length) {
    const empty = document.createElement('p');
    empty.textContent = typeof t === 'function' ? t('cal.bind.empty') : 'Bu kampanyada slota bağlı olmayan randevu yok';
    card.appendChild(empty);
  }
  free.forEach((row) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'takvim-bind-row';
    const who = String(row.nachname || '').trim() || '—';
    const place = [row.plz, row.ortschaft].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    btn.textContent = [who, row.telefonnummer || '', place, row.termin_tarih || ''].filter(Boolean).join(' · ');
    btn.onclick = () => bindTakvimUnassigned(slot.id, row.id, pop);
    card.appendChild(btn);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'takvim-bind-row';
  close.textContent = typeof t === 'function' ? t('wv.due.snooze') : 'Tamam';
  close.onclick = () => pop.remove();
  card.appendChild(close);
  pop.appendChild(card);
  pop.addEventListener('click', (ev) => { if (ev.target === pop) pop.remove(); });
  document.body.appendChild(pop);
}

async function bindTakvimUnassigned(slotId, apptId, pop) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ durum: 'dolu', appointment_id: apptId }),
    });
    await sb(`appointments?id=eq.${apptId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ slot_id: slotId }),
    });
    pop?.remove();
    if (typeof loadTakvimSlots === 'function') await loadTakvimSlots();
    toast(typeof t === 'function' ? t('cal.bind.done') : 'Randevu slota bağlandı', 'ok');
  } catch (e) {
    toast((typeof t === 'function' ? t('cal.bind.fail') : 'Bağlama hatası: ') + (e.message || ''), 'err');
  }
}

async function slotAltaTasi(slotId) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({alta_tasindi: true, durum: 'dolu'})});
    await loadTakvimSlots();
    toast('Slot alta taşındı', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

async function slotUsteCikar(slotId) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({alta_tasindi: false, durum: 'dolu'})});
    await loadTakvimSlots();
    toast(typeof t === 'function' ? t('cal.up.done') : 'Randevu üste alındı', 'ok');
  } catch (e) { toast('Hata: ' + (e.message || ''), 'err'); }
}

// ── Drag & Drop ───────────────────────────────
function initSlotDrag(el, slot, appt) {
  const isAdmin = mbIsFirmAdmin();
  const canDrag = isAdmin && (slot.durum === 'bos' || (slot.durum === 'dolu' && appt));
  if (!canDrag) return;
  el.draggable = true; el.style.cursor = 'grab';
  el.addEventListener('dragstart', e => {
    if (typeof takvimHideTip === 'function') takvimHideTip();
    if (
      e.target.closest &&
      (e.target.closest('.tak-slot-move') ||
        e.target.closest('.tak-slot-dist') ||
        e.target.closest('.tak-slot-add-wrap'))
    ) {
      e.preventDefault();
      return;
    }
    _dragSlot = slot; _dragOrigCell = el.parentElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', slot.id);
    el.style.opacity = '0.4'; _dragGhost = el;
    takvimHourCells().forEach(cell => { cell.classList.add('drag-target'); });
  });
  el.addEventListener('dragend', () => {
    el.style.opacity = '1'; el.style.cursor = 'grab';
    document.querySelectorAll('.drag-target').forEach(c => { c.classList.remove('drag-target','drag-over'); c.style.background = ''; });
    _dragSlot = null; _dragGhost = null;
  });
}

function setupDropZones() {
  const isAdmin = mbIsFirmAdmin();
  if (!isAdmin) return;
  takvimHourCells().forEach(cell => {
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
      const newDate = cell.dataset.tkDate;
      const newHour = cell.dataset.tkHour;
      if (!newDate || !newHour) return;
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
  const sec = document.getElementById(window._takvimFailedSecId || 'takvim-failed-section');
  const grid = document.getElementById(window._takvimFailedGridId || 'takvim-failed-grid');
  if (!sec || !grid) return;
  const failed = takvimSlots.filter((s) => s.alta_tasindi);
  const [rangeStart, rangeEnd] = takvimVisibleDateRange();
  const byDay = {};
  failed.forEach((s) => {
    const ds = s.tarih;
    if (ds < rangeStart || ds > rangeEnd) return;
    if (!byDay[ds]) byDay[ds] = [];
    byDay[ds].push(s);
  });
  const dayKeys = [];
  takvimEachDayInRange(rangeStart, rangeEnd, (ds) => dayKeys.push(ds));
  const hasAny = dayKeys.some((ds) => (byDay[ds] || []).length);
  sec.style.display = hasAny ? '' : 'none';
  if (!hasAny) {
    grid.innerHTML = '';
    return;
  }
  const n = dayKeys.length;
  let h = `<div style="display:grid;grid-template-columns:52px repeat(${n},minmax(0,1fr));width:100%;box-sizing:border-box;">`;
  h += '<div style="border-right:1px solid var(--border);"></div>';
  dayKeys.forEach((ds) => {
    const dt = new Date(ds + 'T12:00:00');
    const head = `${typeof takvimWeekdayName === 'function' ? takvimWeekdayName(dt, 'short') : ''} ${dt.getDate()}`;
    h += `<div style="font-size:9px;font-weight:800;color:var(--text-3);text-align:center;padding:0 4px 4px;border-right:1px solid var(--border);">${head}</div>`;
  });
  h += '<div style="border-right:1px solid var(--border);"></div>';
  dayKeys.forEach((ds) => {
    const items = byDay[ds] || [];
    h += `<div style="display:flex;flex-direction:column;gap:4px;min-width:0;border-right:1px solid var(--border);padding:0 6px;">`;
    items.forEach((s) => {
      const appt = takvimAppts.find((a) => a.id === s.appointment_id);
      const nm = appt ? appt.nachname : '—';
      const fv = getSlotGradientAndText(s, appt);
      const badge = appt && typeof takvimPlzBadge === 'function' ? takvimPlzBadge(appt) : '';
      h += `<div data-failed="${s.id}" style="position:relative;display:flex;align-items:center;gap:4px;font-size:9px;font-weight:700;padding:4px 6px;border-radius:4px;cursor:pointer;background:${fv.background};color:${fv.color};">
${badge}
<button type="button" data-up="${s.id}" style="border:0;border-radius:4px;background:#14532d;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;cursor:pointer;">${typeof t === 'function' ? t('cal.up') : 'Üste al'}</button>
<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nm}</span>
</div>`;
    });
    h += `</div>`;
  });
  h += '</div>';
  grid.innerHTML = h;
  grid.querySelectorAll('[data-up]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      slotUsteCikar(btn.dataset.up);
    };
  });
  grid.querySelectorAll('[data-failed]').forEach((el) => {
    el.onclick = () => {
      const slot = takvimSlots.find((x) => x.id === el.dataset.failed);
      const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
      openTakvimSlotDetail(slot, appt);
    };
    el.oncontextmenu = (ev) => {
      const slot = takvimSlots.find((x) => x.id === el.dataset.failed);
      const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
      if (slot) showSlotContextMenu(ev, slot, appt);
    };
  });
}

async function checkActiveCampaignNotif() {
  if (!currentUser?.firm_id) return;
  if (mbIsFirmAdmin()) return;
  try {
    const camps = await sb(`campaigns?firm_id=eq.${currentUser.firm_id}&active_for_agents=eq.true&order=updated_at.desc&limit=1`).catch(()=>[]);
    if (!camps?.length) return;
    const camp = camps[0];
    const lastTs = parseInt(localStorage.getItem('mb_notif_ts')||'0', 10) || 0;
    const nextTs = Number(camp.notif_ts) || 0;
    if (nextTs > lastTs) {
      localStorage.setItem('mb_notif_ts', String(nextTs));
      const onTakvim = document.getElementById('page-takvim')?.classList.contains('active');
      if (!onTakvim) showCampNotif(camp);
    }
    if (!takvimCampId && camp.id) takvimCampId = camp.id;
  } catch(e) {}
}

function showCampNotif(camp) {
  document.getElementById('mb-camp-notif')?.remove();
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? ''));
  const title = typeof t === 'function' ? t('camp.notif_title') : 'Aktif Kampanya';
  const go = typeof t === 'function' ? t('camp.notif_go') : 'Takvime Git';
  const close = typeof t === 'function' ? t('camp.notif_close') : 'Kapat';
  const ov = document.createElement('div');
  ov.id = 'mb-camp-notif';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  ov.innerHTML = `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:16px;padding:32px 40px;text-align:center;max-width:400px;width:90vw;">
<div style="font-size:18px;font-weight:800;margin-bottom:8px;">${esc(title)}</div>
<div style="font-size:16px;font-weight:700;padding:10px 16px;background:var(--bg-3);border-radius:8px;margin-bottom:20px;">${esc(camp.name)}</div>
${camp.notif_message?`<div style="font-size:13px;color:var(--text-2);margin-bottom:16px;">${esc(camp.notif_message)}</div>`:''}
<button type="button" id="mb-camp-notif-go" style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">${esc(go)}</button>
<button type="button" id="mb-camp-notif-close" style="width:100%;padding:10px;background:transparent;color:var(--text-2);border:none;font-size:12px;cursor:pointer;margin-top:8px;">${esc(close)}</button>
</div>`;
  ov.querySelector('#mb-camp-notif-close').onclick = () => ov.remove();
  ov.querySelector('#mb-camp-notif-go').onclick = () => { ov.remove(); navigate('takvim'); };
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── TomTom mesafe / rota ──────────────────────
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

async function geocodeTomTom(query) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !String(query || '').trim()) return null;
  try {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${tk}&countrySet=DE&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.position || null;
  } catch (_) { return null; }
}

async function routeTomTomCoords(p1, p2) {
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  if (!tk || !p1?.lat || !p2?.lat) return null;
  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${p1.lat},${p1.lon}:${p2.lat},${p2.lon}/json?key=${tk}&travelMode=car`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const s = data?.routes?.[0]?.summary;
    if (!s) return null;
    return { d: s.lengthInMeters, t: s.travelTimeInSeconds };
  } catch (_) { return null; }
}

async function measureSlotDistance(slotId) {
  const slot = takvimSlots.find((s) => s.id === slotId);
  const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
  const el = document.getElementById(`dist-${slotId}`);
  if (!slot || !appt) {
    toast('Bu slotta randevu yok', 'warn');
    return;
  }
  if (!currentContact || (!currentContact.address && !currentContact.plz)) {
    toast('Dialer\'da açık müşteri veya adres/PLZ yok', 'warn');
    return;
  }
  if (el) el.textContent = '…';
  const fromAddr = [currentContact.address, currentContact.plz, currentContact.city, 'Germany'].filter(Boolean).join(', ');
  const toAddr = [appt.strasse, appt.plz, appt.ortschaft, 'Germany'].filter(Boolean).join(', ');
  const dist = await calcTomTomDistance(fromAddr, toAddr);
  if (el) el.textContent = dist ? `📍 ${dist}` : '—';
  if (!dist) toast('Mesafe alınamadı (TomTom anahtarı veya adres)', 'warn');
}

async function toggleTakvimDistAll(slotId) {
  if (_takvimDistAllOriginId === slotId) {
    _takvimDistAllOriginId = null;
    renderTakvimSlots();
    toast('Çoklu uzaklık kapatıldı', 'ok');
    return;
  }
  const slot = takvimSlots.find((s) => s.id === slotId);
  const appt = takvimAppts.find((a) => a.id === slot?.appointment_id);
  if (!appt?.plz) {
    toast('Kaynak randevuda PLZ yok', 'warn');
    return;
  }
  _takvimMeasureFromPlz = null;
  _takvimMeasureCache = {};
  _takvimDistAllOriginId = slotId;
  renderTakvimSlots();
  toast('Diğer randevulara uzaklık hesaplanıyor…', 'ok');
  const others = takvimSlots.filter((s) => s.id !== slotId && s.durum === 'dolu' && s.appointment_id);
  for (const s of others) {
    const da = takvimAppts.find((a) => a.id === s.appointment_id);
    if (!da?.plz) continue;
    const key = `${appt.plz}_${da.plz}`;
    if (_takvimPlzRouteCache[key]) continue;
    try {
      const g1 = await geocodeTomTom(`${appt.plz}, Germany`);
      const g2 = await geocodeTomTom(`${da.plz}, Germany`);
      if (!g1 || !g2) continue;
      const rt = await routeTomTomCoords(g1, g2);
      if (rt) _takvimPlzRouteCache[key] = { km: (rt.d / 1000).toFixed(1), min: Math.round(rt.t / 60) };
    } catch (_) {}
  }
  renderTakvimSlots();
}

async function nudgeTakvimSlot(slotId, deltaMin) {
  const slot = takvimSlots.find((s) => s.id === slotId);
  if (!slot || slot.gun_kapali) return;
  const role = currentUser?.role || '';
  if (!mbIsFirmAdmin(role)) return;
  const sh = (slot.baslangic_saat || '09:00').slice(0, 5);
  const eh = (slot.bitis_saat || takvimAddHours(sh, takvimSlotDurHours())).slice(0, 5);
  const startMin = takvimTimeToMinutes(sh);
  const endMin = takvimTimeToMinutes(eh);
  const dur = endMin - startMin;
  if (dur <= 0) return;
  let ns = startMin + deltaMin;
  let ne = ns + dur;
  const tset = getCampaignTakvimSettings();
  const dayStart = tset.startH * 60;
  const dayEnd = tset.endH * 60 + 60;
  if (ns < dayStart) {
    toast('Gün başlangıcından önce taşınamaz', 'warn');
    return;
  }
  if (ne > dayEnd) {
    toast('Gün bitişinden sonra taşınamaz', 'warn');
    return;
  }
  const newStart = takvimMinutesToHHMM(ns);
  const newEnd = takvimMinutesToHHMM(ne);
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ baslangic_saat: newStart, bitis_saat: newEnd })
    });
    await loadTakvimSlots();
    toast(`Slot ${deltaMin > 0 ? '+' : ''}${deltaMin} dk kaydırıldı`, 'ok');
  } catch (e) {
    toast('Kaydırma hatası: ' + (e?.message || ''), 'err');
  }
}

let _takvimPlzTimer = null;
function takvimNormalizePlz(value) {
  let p = String(value || '').replace(/\D/g, '');
  if (p.length === 4) p = `0${p}`;
  if (p.length > 5) p = p.slice(0, 5);
  return p;
}
function takvimToggleFilters() {
  const box = document.getElementById('takvim-filters');
  const open = !box || box.hidden;
  ['takvim-filters', 'takvim-filters-ov'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = !open;
  });
  ['takvim-filter-btn', 'takvim-filter-btn-ov'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('is-on', open);
  });
  requestAnimationFrame(() => {
    if (typeof takvimApplyWeekRowHeights === 'function') takvimApplyWeekRowHeights();
  });
}
function takvimPlzMeasureOpen() {
  ['takvim-plz-btn', 'takvim-plz-btn-ov'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = true;
  });
  ['takvim-plz-inp', 'takvim-plz-inp-ov'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    if (_takvimMeasureFromPlz && !el.value) el.value = _takvimMeasureFromPlz;
  });
  (document.getElementById('takvim-plz-inp') || document.getElementById('takvim-plz-inp-ov'))?.focus();
}
function takvimPlzMeasureClose() {
  clearTimeout(_takvimPlzTimer);
  _takvimMeasureFromPlz = null;
  _takvimMeasureCache = {};
  ['takvim-plz-inp', 'takvim-plz-inp-ov'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.hidden = true;
  });
  ['takvim-plz-btn', 'takvim-plz-btn-ov'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = false;
  });
  if (typeof renderTakvimSlots === 'function') renderTakvimSlots();
  if (typeof renderTakvimFailed === 'function') renderTakvimFailed();
}
function takvimPlzMeasureKey(ev) {
  if (ev.key === 'Escape') takvimPlzMeasureClose();
}
function takvimPlzMeasureInput(value) {
  ['takvim-plz-inp', 'takvim-plz-inp-ov'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && el.value !== value) el.value = value;
  });
  clearTimeout(_takvimPlzTimer);
  const raw = String(value || '').trim();
  if (!raw) {
    _takvimMeasureFromPlz = null;
    _takvimMeasureCache = {};
    renderTakvimSlots();
    if (typeof renderTakvimFailed === 'function') renderTakvimFailed();
    return;
  }
  const plz = takvimNormalizePlz(raw);
  if (plz.length < 5) return;
  _takvimPlzTimer = setTimeout(() => runTakvimPlzMeasure(plz), 450);
}
async function runTakvimPlzMeasure(plz) {
  if (!takvimCampId) { toast('Önce kampanya seçin', 'err'); return; }
  _takvimDistAllOriginId = null;
  _takvimMeasureFromPlz = plz;
  _takvimMeasureCache = {};
  const targets = (takvimSlots || []).filter((s) => s.durum === 'dolu' && s.appointment_id);
  for (const s of targets) {
    if (_takvimMeasureFromPlz !== plz) return;
    const da = takvimAppts.find((a) => a.id === s.appointment_id);
    if (!da?.plz) continue;
    const dest = takvimNormalizePlz(da.plz);
    if (dest.length < 4) continue;
    const key = `${plz}_${dest}`;
    if (_takvimMeasureCache[key]) continue;
    try {
      const g1 = await geocodeTomTom(`${plz}, Germany`);
      const g2 = await geocodeTomTom(`${dest}, Germany`);
      if (!g1 || !g2) continue;
      const rt = await routeTomTomCoords(g1, g2);
      if (rt) _takvimMeasureCache[key] = { km: (rt.d / 1000).toFixed(1), min: Math.round(rt.t / 60) };
    } catch (_) {}
  }
  if (_takvimMeasureFromPlz === plz && typeof renderTakvimSlots === 'function') {
    renderTakvimSlots();
    if (typeof renderTakvimFailed === 'function') renderTakvimFailed();
  }
}
function openTakvimPlzMeasureModal() {
  takvimPlzMeasureOpen();
}

async function runPlzMeasureFromModal() {
  const inp = document.getElementById('takvim-plz-measure-inp');
  const plz = String(inp?.value || '')
    .trim()
    .replace(/\s+/g, '');
  if (!plz) {
    toast('PLZ girin', 'warn');
    return;
  }
  document.getElementById('m-takvim-plz-measure')?.remove();
  _takvimDistAllOriginId = null;
  _takvimMeasureFromPlz = plz;
  _takvimMeasureCache = {};
  toast('Mesafeler hesaplanıyor…', 'ok');
  const targets = takvimSlots.filter((s) => s.durum === 'dolu' && s.appointment_id);
  for (const s of targets) {
    const da = takvimAppts.find((a) => a.id === s.appointment_id);
    if (!da?.plz) continue;
    const key = `${plz}_${da.plz}`;
    if (_takvimMeasureCache[key]) continue;
    try {
      const g1 = await geocodeTomTom(`${plz}, Germany`);
      const g2 = await geocodeTomTom(`${da.plz}, Germany`);
      if (!g1 || !g2) continue;
      const rt = await routeTomTomCoords(g1, g2);
      if (rt) _takvimMeasureCache[key] = { km: (rt.d / 1000).toFixed(1), min: Math.round(rt.t / 60) };
    } catch (_) {}
  }
  renderTakvimSlots();
  toast('Mesafe satırları güncellendi', 'ok');
}

function clearTakvimPlzMeasure() {
  _takvimMeasureFromPlz = null;
  _takvimMeasureCache = {};
  _takvimDistAllOriginId = null;
  document.getElementById('m-takvim-plz-measure')?.remove();
  renderTakvimSlots();
  toast('Mesafe ölçümü temizlendi', 'ok');
}

async function addAdjacentEmptySlot(slotId) {
  const role = currentUser?.role || '';
  if (!mbIsFirmAdmin(role)) return;
  if (!takvimCampId) {
    toast('Kampanya yok', 'err');
    return;
  }
  const slot = takvimSlots.find((s) => s.id === slotId);
  if (!slot || slot.gun_kapali) return;
  const bs = (slot.baslangic_saat || '09:00').slice(0, 8);
  const beRaw = slot.bitis_saat || takvimAddHours(bs.slice(0, 5), takvimSlotDurHours());
  let durMin = takvimTimeToMinutes(beRaw) - takvimTimeToMinutes(bs);
  if (durMin <= 0) durMin = takvimSlotDurHours() * 60;
  const ns = takvimTimeToMinutes(bs);
  const ne = ns + durMin;
  const tset = getCampaignTakvimSettings();
  if (ne > tset.endH * 60 + 60) {
    toast('Bu gün için aynı saatte yeni slot sığmıyor', 'warn');
    return;
  }
  const newStart = takvimMinutesToHHMM(ns);
  const newEnd = takvimMinutesToHHMM(ne);
  try {
    await sb('takvim_slots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        campaign_id: takvimCampId,
        firm_id: currentUser.firm_id,
        tarih: slot.tarih,
        baslangic_saat: newStart,
        bitis_saat: newEnd,
        durum: 'bos',
        gun_kapali: false
      })
    });
    await loadTakvimSlots();
    toast('Aynı saatte boş slot eklendi', 'ok');
  } catch (e) {
    toast('Eklenemedi: ' + (e?.message || ''), 'err');
  }
}

// ── Import Appts ──────────────────────────────
let _iaUsers = [];
let _iaResults = [];
let _iaCustomers = [];
let _iaReviewed = false;

const IA_MATCH = {
  nachname: ['nachname', 'soyad', 'ad soyad', 'name'],
  telefon: ['telefon', 'telefonnummer', 'phone', 'handy', 'tel'],
  telefon2: ['telefon2', 'telefon 2', 'phone2', 'tel2'],
  strasse: ['strasse', 'straße', 'adresse', 'adres', 'sokak'],
  plz: ['postleitzahl', 'plz', 'posta'],
  ort: ['ortschaft', 'şehir', 'sehir', 'stadt', 'city', 'ort'],
  termin_tarih: ['termin tarihi', 'randevu tarihi', 'datum', 'tarih', 'date'],
  termin_saat: ['uhrzeit', 'termin saati', 'saat', 'time'],
  notiz: ['notiz', 'notu', 'note', 'not'],
  durum: ['ergebnis', 'qc sonucu', 'durum', 'status', 'qc'],
  kampanya: ['kampagne', 'kampanya', 'campaign'],
  personel: ['mitarbeiter', 'personel', 'temsilci', 'agent'],
  musteri: ['kunde', 'musteri', 'müşteri', 'customer'],
  hausart: ['hausart', 'ev tipi', 'evtipi'],
  baujahr: ['baujahr', 'yapım yılı', 'yapim yili'],
  qm: ['m²', 'qm', 'm2'],
  heizung: ['heizung', 'ısıtma', 'isitma'],
  alter_der_heizung: ['alter der heizung', 'ısıtma yaşı', 'isitma yasi'],
  verbrauch_pro_jahr: ['verbrauch', 'tüketim', 'tuketim'],
  personen: ['personen', 'kişi sayısı', 'kisi sayisi', 'kişi', 'kisi'],
};

function iaMatchScore(header, fieldKey) {
  const h = iaFold(header);
  const tokens = h.split(/[^a-z0-9]+/).filter(Boolean);
  let best = 0;
  (IA_MATCH[fieldKey] || []).forEach((raw) => {
    const kw = iaFold(raw);
    if (!kw) return;
    if (h === kw) best = Math.max(best, 200 + kw.length);
    else if (tokens.includes(kw)) best = Math.max(best, 100 + kw.length);
    else if (kw.length >= 5 && h.includes(kw)) best = Math.max(best, kw.length);
  });
  return best;
}

function iaCellText(raw) {
  if (raw == null) return '';
  if (raw instanceof Date) return isNaN(raw.getTime()) ? '' : '1';
  return String(raw).trim();
}

function iaColumnFill(rows, idx) {
  let n = 0;
  (rows || []).forEach((row) => { if (iaCellText(row?.[idx])) n++; });
  return n;
}

function iaIsMetaDate(header) {
  const h = iaFold(header);
  return /(created|updated|publish|unpublish|kayit|songuncelleme|owner)/.test(h);
}

function iaAllPublish(rows, idx) {
  const vals = new Set();
  (rows || []).forEach((row) => {
    const s = iaFold(iaCellText(row?.[idx]));
    if (s && s !== '1') vals.add(s);
  });
  if (!vals.size) return false;
  return [...vals].every((v) => v === 'published' || v === 'draft' || v === 'unpublished' || v === 'archived');
}

function iaNoiseHeader(header) {
  const h = iaFold(String(header || '').replace(/^\uFEFF/, '')).replace(/[^a-z0-9]+/g, '');
  return ['id', 'owner', 'slotid', 'bitrix', 'createddate', 'updateddate', 'publishdate', 'unpublishdate', 'songuncelleme', 'kayittarihi', 'kundemanuel'].includes(h);
}

function iaNoteHeader(header) {
  const h = iaFold(header);
  return /zusatz|bilgi|information|qcnot|qcstatus|interesse|pv/.test(h);
}

function iaAutoAssign(headers, rows) {
  const pairs = [];
  IA_FIELDS.forEach((f) => {
    (headers || []).forEach((h, i) => {
      const score = iaMatchScore(h, f.key);
      if (!score) return;
      if ((f.key === 'termin_tarih' || f.key === 'termin_saat') && iaIsMetaDate(h)) return;
      if (f.key === 'durum' && iaAllPublish(rows, i)) return;
      pairs.push({ key: f.key, i, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const chosen = {};
  const taken = new Set();
  pairs.forEach((p) => {
    if (chosen[p.key] != null || taken.has(p.i)) return;
    chosen[p.key] = p.i;
    taken.add(p.i);
  });
  Object.keys(chosen).forEach((key) => {
    if (iaColumnFill(rows, chosen[key]) > 0) return;
    const alt = pairs
      .filter((p) => p.key === key && !taken.has(p.i) && iaColumnFill(rows, p.i) > 0)
      .sort((a, b) => b.score - a.score)[0];
    if (!alt) return;
    taken.delete(chosen[key]);
    taken.add(alt.i);
    chosen[key] = alt.i;
  });
  return chosen;
}

function iaBerlinStamp(raw) {
  let d = null;
  if (raw instanceof Date && !isNaN(raw.getTime())) d = raw;
  else if (typeof raw === 'string' && /T\d{2}:\d{2}/.test(raw)) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) d = parsed;
  } else if (typeof raw === 'number') return null;
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (type) => parts.find((p) => p.type === type)?.value || '';
  let hour = g('hour');
  if (hour === '24') hour = '00';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, time: `${hour.padStart(2, '0')}:${g('minute').padStart(2, '0')}` };
}

function iaPlz(raw) {
  const s = String(raw || '').trim();
  if (/^\d{1,4}$/.test(s)) return s.padStart(5, '0');
  return s;
}

function iaDirty() {
  _iaReviewed = false;
  const q = document.getElementById('ia-questions');
  if (q) { q.innerHTML = ''; q.style.display = 'none'; }
}

function iaCustomerOptions(selectedId, withBlank) {
  const id = String(selectedId || '');
  const qc = id === 'qc' || (!withBlank && !id);
  const blank = withBlank && !id ? 'selected' : '';
  const rows = (_iaCustomers || []).map((c) => {
    const label = `${c.code ? c.code + ' · ' : ''}${c.name || ''}`.trim();
    return `<option value="${iaEsc(c.id)}" ${String(c.id) === id ? 'selected' : ''}>${iaEsc(label || c.id)}</option>`;
  }).join('');
  const choose = withBlank ? `<option value="" ${blank}>${iaEsc(iaSay('ia.q.pick', 'Seçin'))}</option>` : '';
  return `${choose}<option value="qc" ${qc ? 'selected' : ''}>${iaEsc(iaSay('camp.customer.qc', 'Tümü — QC seçer'))}</option>${rows}`;
}

function iaSyncFallbackCustomer() {
  const sel = document.getElementById('ia-customer');
  if (!sel) return;
  const campId = document.getElementById('ia-campaign')?.value || '';
  const camp = (campaigns || []).find((c) => String(c.id) === String(campId));
  const id = camp && typeof mbCampDefaultCustomerId === 'function' ? (mbCampDefaultCustomerId(camp) || '') : '';
  sel.innerHTML = iaCustomerOptions(id);
}

async function iaFillCustomers() {
  const fid = iaFirmId();
  try {
    _iaCustomers = fid ? (await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`)) || [] : [];
  } catch (e) {
    _iaCustomers = [];
  }
  iaSyncFallbackCustomer();
}

function iaSay(key, fb, vars) {
  let s = typeof t === 'function' ? t(key) : fb;
  if (!s || s === key) s = fb;
  Object.entries(vars || {}).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
  return s;
}

function iaEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function iaFold(v) {
  return String(v || '').trim().toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

function iaParseDay(raw, fmt) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  const s = String(raw || '').trim();
  if (!s) return '';
  let d;
  let m;
  let y;
  if (fmt === 'yyyy-mm-dd' || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const p = s.slice(0, 10).split('-');
    y = p[0]; m = p[1]; d = p[2];
  } else if (fmt === 'dd/mm/yyyy') {
    const p = s.split(/[/.\-]/);
    d = p[0]; m = p[1]; y = p[2];
  } else {
    const p = s.split(/[/.\-]/);
    d = p[0]; m = p[1]; y = p[2];
  }
  if (!y || !m || !d || y.length < 4) return '';
  const iso = `${y.padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${iso}T12:00:00`);
  if (isNaN(check.getTime())) return '';
  return iso;
}

function iaFirmId() {
  return (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || '';
}

async function iaFillStatusSelect() {
  const sel = document.getElementById('ia-status');
  if (!sel) return;
  const keep = sel.value;
  let rows = [];
  try {
    rows = typeof loadFirmAppointmentResults === 'function' ? await loadFirmAppointmentResults(iaFirmId(), true) : [];
  } catch (e) {
    rows = [];
  }
  if (!rows?.length && typeof defaultAppointmentResults === 'function') rows = defaultAppointmentResults();
  _iaResults = rows || [];
  sel.innerHTML = _iaResults.map((r) => `<option value="${iaEsc(r.key)}">${iaEsc(r.label || r.key)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  else if ([...sel.options].some((o) => o.value === 'qc_bekleniyor')) sel.value = 'qc_bekleniyor';
}

function openImportApptModal() {
  const campSel = document.getElementById('ia-campaign');
  const agentSel = document.getElementById('ia-agent');
  if (campSel) {
    campSel.innerHTML = '<option value="">Kampanya seçin...</option>' +
      (campaigns||[]).map(c=>`<option value="${iaEsc(c.id)}">${iaEsc(c.name)}</option>`).join('');
  }
  const ff = getFirmFilter('&');
  const roles = (typeof MB_PERSONNEL_ROLES !== 'undefined' ? MB_PERSONNEL_ROLES : ['agent', 'qc', 'firm_admin', 'field_agent', 'admin']).join(',');
  sb(`users?select=id,name,role${ff}&role=in.(${roles})&is_active=eq.true&order=name.asc`)
    .then(users => {
      _iaUsers = users || [];
      if (agentSel) agentSel.innerHTML = '<option value="">Personel seçin...</option>' +
        _iaUsers.map(u=>`<option value="${iaEsc(u.id)}">${iaEsc(u.name)}</option>`).join('');
    }).catch(()=>{ _iaUsers = []; });
  iaFillStatusSelect();
  iaFillCustomers();
  _iaReviewed = false;
  _iaRows=[]; _iaHeaders=[];
  document.getElementById('ia-file').value='';
  document.getElementById('ia-file-name').textContent='Dosya seçmek için tıkla';
  ['ia-mapping-section','ia-options-section','ia-preview-section','ia-progress-section','ia-questions'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const q = document.getElementById('ia-questions');
  if (q) q.innerHTML = '';
  document.getElementById('ia-preview-btn').style.display='none';
  document.getElementById('ia-match-btn').style.display='none';
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
  _iaHeaders = data[0].map(h=>String(h).replace(/^\uFEFF/, '').trim());
  _iaRows = data.slice(1).filter(row=>row.some(cell=>cell!==''));
  const chosen = iaAutoAssign(_iaHeaders, _iaRows);
  const grid = document.getElementById('ia-mapping-grid');
  grid.innerHTML = IA_FIELDS.map(f=>`
<div style="display:flex;align-items:center;gap:6px;">
<label style="font-size:11px;font-weight:700;min-width:110px;color:${f.required?'var(--text)':'var(--text-3)'};">${iaEsc(f.label)}</label>
<select class="form-input" id="ia-map-${f.key}" onchange="iaDirty()" style="flex:1;font-size:11px;padding:4px 6px;">
<option value="">— Seç —</option>
${_iaHeaders.map((h,i)=>`<option value="${i}" ${chosen[f.key]===i?'selected':''}>${iaEsc(h)}</option>`).join('')}
</select>
</div>`).join('');
  document.getElementById('ia-mapping-section').style.display='';
  document.getElementById('ia-options-section').style.display='';
  document.getElementById('ia-preview-btn').style.display='';
  document.getElementById('ia-match-btn').style.display='';
  document.getElementById('ia-submit-btn').style.display='';
  iaDirty();
  toast(`${_iaRows.length} satır okundu ✓`, 'ok');
}

function iaParseTime(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${String(raw.getHours()).padStart(2, '0')}:${String(raw.getMinutes()).padStart(2, '0')}`;
  }
  const m = String(raw || '').trim().match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return '10:00';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
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
  const isSuperAdmin  = mbIsSuperAdmin(role);
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
  const isSuperAdmin = mbIsSuperAdmin(role);
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
    return `<div class="mesai-row" data-gun="${g.key}">
<input type="checkbox" class="mesai-aktif" ${aktif?'checked':''} ${dis} style="width:15px;height:15px;flex:0 0 auto;${dis?'cursor:not-allowed;opacity:.5;':''}">
<span class="mesai-gun">${g.label}</span>
<input type="time" class="form-input mesai-bas" value="${r.mesai_baslangic||'09:00'}" ${dis} ${dis?'style="opacity:.5;"':''}>
<span class="mesai-sep">—</span>
<input type="time" class="form-input mesai-bit" value="${r.mesai_bitis||'18:00'}" ${dis} ${dis?'style="opacity:.5;"':''}>
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
  if (!mbIsSuperAdmin()) return;
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
  const isSuperAdmin = mbIsSuperAdmin(role);

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
  const isSuperAdmin = mbIsSuperAdmin();
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
  if (!mbIsSuperAdmin()) return;
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

async function loadDefaultTakvimFirmCard() {
  const card = document.getElementById('default-takvim-firm-card');
  const host = document.getElementById('default-takvim-firm-body');
  if (!card || !host) return;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    host.innerHTML = '<div style="font-size:12px;color:var(--text-3);">Varsayılan takvim için firma seçin.</div>';
    return;
  }
  await ensureFirmTakvimDefaultsLoaded(fid);
  let raw = {};
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    raw = rows?.[0]?.settings?.default_takvim && typeof rows[0].settings.default_takvim === 'object' ? rows[0].settings.default_takvim : {};
  } catch (_) {}
  const cfg = mergeTakvimSettings(raw);
  const bosDisp = /^#[0-9A-Fa-f]{6}$/i.test(String(cfg.bos_color || '').trim()) ? String(cfg.bos_color).trim() : '#3b82f6';
  const dayNames = { pzt: 'Pazartesi', sal: 'Salı', car: 'Çarşamba', per: 'Perşembe', cum: 'Cuma', cmt: 'Cumartesi', paz: 'Pazar' };
  const slotOpts = [1, 2, 3, 4]
    .map((n) => `<option value="${n}"${cfg.slot_dur === n ? ' selected' : ''}>${n} saat</option>`)
    .join('');
  host.innerHTML = `
<div style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Yeni kampanyalar ve takvim ayarı kaydı olmayan kampanyalar bu değerleri firma varsayılanından alır. İstersen tüm aktif kampanyalara da uygulayabilirsin.</div>
<div>
<div style="font-size:12px;font-weight:800;margin-bottom:8px;color:var(--text-2);">Çalışma Günleri</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;" id="fdt-days">
${Object.entries(dayNames)
  .map(([k, v]) => {
    const on = cfg.active_days.includes(k);
    const st = on ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '';
    return (
      '<button type="button" class="btn btn-ghost btn-sm fdt-day-btn' +
      (on ? ' active' : '') +
      '" data-d="' +
      k +
      '" style="' +
      st +
      '" onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'var(--accent)\':\'\';this.style.color=this.classList.contains(\'active\')?\'#fff\':\'\';this.style.borderColor=this.classList.contains(\'active\')?\'var(--accent)\':\'\';">' +
      v.slice(0, 3) +
      '</button>'
    );
  })
  .join('')}
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
<div class="form-row"><label class="form-label">Başlangıç</label><input type="time" class="form-input" id="fdt-start" value="${cfg.start_hour}"></div>
<div class="form-row"><label class="form-label">Bitiş</label><input type="time" class="form-input" id="fdt-end" value="${cfg.end_hour}"></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">Slot süresi</label><select class="form-input" id="fdt-slot-dur">${slotOpts}</select></div>
<div class="form-row"><label class="form-label">Gün başına maks. slot</label><input type="number" class="form-input" id="fdt-max-slots" value="${cfg.max_slots}" min="1" max="40" style="width:80px;"></div>
<div class="form-row"><label class="form-label">Boş slot rengi</label><input type="color" class="form-input" id="fdt-bos-color" value="${bosDisp}" style="width:72px;height:40px;padding:2px;"></div>
<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:6px;">
<input type="checkbox" id="fdt-confirm-slot" ${cfg.confirm_new_slot !== false ? 'checked' : ''}> Yeni slot eklerken onay penceresi (varsayılan)
</label>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
<button type="button" class="btn btn-primary btn-sm" onclick="saveDefaultTakvimFirmSettings()">Varsayılanı kaydet</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="applyDefaultTakvimToFirmCampaigns()">Tüm aktif kampanyalara uygula</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="localStorage.removeItem('mb_takvim_skip_new_slot_confirm');toast('Hızlı slot tercihi sıfırlandı','ok')">Hızlı slot (bir daha gösterme) sıfırla</button>
</div>`;
}

async function saveDefaultTakvimFirmSettings() {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    toast('Önce firma seçin', 'warn');
    return;
  }
  const activeDays = [...document.querySelectorAll('.fdt-day-btn.active')].map((b) => b.dataset.d);
  const start = document.getElementById('fdt-start')?.value || '08:00';
  const end = document.getElementById('fdt-end')?.value || '20:00';
  const dur = parseInt(document.getElementById('fdt-slot-dur')?.value || '2', 10);
  const maxSlots = parseInt(document.getElementById('fdt-max-slots')?.value || '5', 10);
  const bos_color = document.getElementById('fdt-bos-color')?.value || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('fdt-confirm-slot')?.checked;
  const payload = { active_days: activeDays, start_hour: start, end_hour: end, slot_dur: dur, max_slots: maxSlots, bos_color, confirm_new_slot };
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, default_takvim: payload } })
    });
    window._firmDefaultTakvimByFirm[fid] = { ...payload };
    _takvimDefaultsFidLoaded = fid;
    toast('Firma varsayılan takvimi kaydedildi ✓', 'ok');
    if (typeof takvimCampId !== 'undefined' && takvimCampId) await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function applyDefaultTakvimToFirmCampaigns() {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    toast('Önce firma seçin', 'warn');
    return;
  }
  if (!(await mbConfirm('Bu firmadaki tüm aktif kampanyalara aşağıdaki formdaki takvim ayarları yazılsın mı?', 'Kampanyalar'))) return;
  const activeDays = [...document.querySelectorAll('.fdt-day-btn.active')].map((b) => b.dataset.d);
  if (!activeDays.length) {
    toast('En az bir çalışma günü seçin', 'warn');
    return;
  }
  const start = document.getElementById('fdt-start')?.value || '08:00';
  const end = document.getElementById('fdt-end')?.value || '20:00';
  const dur = parseInt(document.getElementById('fdt-slot-dur')?.value || '2', 10);
  const maxSlots = parseInt(document.getElementById('fdt-max-slots')?.value || '5', 10);
  const bos_color = document.getElementById('fdt-bos-color')?.value || '#3b82f6';
  const confirm_new_slot = !!document.getElementById('fdt-confirm-slot')?.checked;
  const takvim = { active_days: activeDays, start_hour: start, end_hour: end, slot_dur: dur, max_slots: maxSlots, bos_color, confirm_new_slot };
  try {
    const camps = await sb(`campaigns?firm_id=eq.${fid}&status=eq.active&select=id,settings`);
    let n = 0;
    for (const c of camps || []) {
      const st = c.settings || {};
      await sb(`campaigns?id=eq.${c.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings: { ...st, takvim: { ...takvim } } })
      });
      n++;
      const idx = typeof campaigns !== 'undefined' && campaigns ? campaigns.findIndex((x) => x.id === c.id) : -1;
      if (idx >= 0) campaigns[idx].settings = { ...(campaigns[idx].settings || {}), takvim: { ...takvim } };
    }
    toast(`${n} kampanyaya takvim ayarları uygulandı ✓`, 'ok');
    if (typeof takvimCampId !== 'undefined' && takvimCampId) await loadTakvimSlots();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

let _mesaiPlanDraft = null;
let _mesaiPlanGun = 'pzt';
let _mesaiPlanFirm = '';
let _mesaiPlanTz = 'Europe/Berlin';
let _mesaiPlanFirms = [];
const MESAI_GUN_ORDER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const MESAI_GUN_LABEL = { pzt: 'Pazartesi', sal: 'Salı', car: 'Çarşamba', per: 'Perşembe', cum: 'Cuma', cmt: 'Cumartesi', paz: 'Pazar' };

function mesaiPlanFallback() {
  const plan = {};
  MESAI_GUN_ORDER.forEach((gun) => {
    const day = opsMesaiFallbackDay(gun);
    plan[gun] = { off: day.off, start: day.start, end: day.end, breaks: [] };
  });
  return plan;
}

function mesaiPlanFlush() {
  const tz = document.getElementById('mp-tz');
  if (tz) _mesaiPlanTz = tz.checked ? 'Europe/Istanbul' : 'Europe/Berlin';
  if (!_mesaiPlanDraft || !_mesaiPlanGun) return;
  const on = document.getElementById('mp-on');
  const start = document.getElementById('mp-start');
  const end = document.getElementById('mp-end');
  if (!on) return;
  const breaks = [...document.querySelectorAll('#mesai-plan-body .mp-break')].map((row) => ({
    start: row.querySelector('.mp-bstart')?.value || '',
    end: row.querySelector('.mp-bend')?.value || '',
  }));
  _mesaiPlanDraft[_mesaiPlanGun] = {
    off: !on.checked,
    start: start?.value || '08:00',
    end: end?.value || '20:00',
    breaks,
  };
}

function mesaiPlanPick(gun) {
  mesaiPlanFlush();
  _mesaiPlanGun = gun;
  mesaiPlanRender();
}

function mesaiPlanAddBreak() {
  mesaiPlanFlush();
  const day = _mesaiPlanDraft?.[_mesaiPlanGun];
  if (!day) return;
  day.breaks = Array.isArray(day.breaks) ? day.breaks : [];
  day.breaks.push({ start: '12:00', end: '12:30' });
  mesaiPlanRender();
}

function mesaiPlanRemoveBreak(index) {
  mesaiPlanFlush();
  const day = _mesaiPlanDraft?.[_mesaiPlanGun];
  if (!day || !Array.isArray(day.breaks)) return;
  day.breaks.splice(index, 1);
  mesaiPlanRender();
}

function mesaiPlanRender() {
  const host = document.getElementById('mesai-plan-body');
  if (!host || !_mesaiPlanDraft) return;
  const gun = _mesaiPlanGun || 'pzt';
  const day = _mesaiPlanDraft[gun] || { off: false, start: '08:00', end: '20:00', breaks: [] };
  const shorts = { pzt: 'Pzt', sal: 'Sal', car: 'Çar', per: 'Per', cum: 'Cum', cmt: 'Cmt', paz: 'Paz' };
  const pills = MESAI_GUN_ORDER.map((key) =>
    `<button type="button" class="btn btn-ghost btn-sm mesai-plan-day${key === gun ? ' active' : ''}" onclick="mesaiPlanPick('${key}')">${shorts[key]}</button>`
  ).join('');
  const breaks = Array.isArray(day.breaks) ? day.breaks : [];
  const breakHtml = day.off ? '' : breaks.map((item, index) => `<div class="mesai-plan-break mp-break">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<b>${index + 1}. ${t('ops.break.title')}</b>
<button type="button" class="btn btn-ghost btn-sm" onclick="mesaiPlanRemoveBreak(${index})" aria-label="Sil">✕</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
<div class="form-row"><label class="form-label">${t('mesai.plan.start')}</label><input type="text" inputmode="numeric" maxlength="5" placeholder="08:00" class="form-input mp-bstart" value="${item.start || ''}" onblur="this.value=opsHm(this.value, this.value)"></div>
<div class="form-row"><label class="form-label">${t('mesai.plan.end')}</label><input type="text" inputmode="numeric" maxlength="5" placeholder="18:30" class="form-input mp-bend" value="${item.end || ''}" onblur="this.value=opsHm(this.value, this.value)"></div>
</div>
</div>`).join('');
  const superAdmin = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const firmPick = superAdmin ? `<div class="form-row" style="margin-bottom:12px;"><label class="form-label">${t('mesai.plan.firm')}</label>
<select class="form-input" id="mp-firm" onchange="mesaiPlanFirmChanged(this.value)">${_mesaiPlanFirms.map((firm) => `<option value="${String(firm.id).replace(/"/g, '')}"${String(firm.id) === String(_mesaiPlanFirm) ? ' selected' : ''}>${String(firm.name || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))}</option>`).join('')}</select></div>` : '';
  host.innerHTML = `${firmPick}
<label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:700;margin-bottom:4px;">
<input type="checkbox" id="mp-tz" ${_mesaiPlanTz === 'Europe/Istanbul' ? 'checked' : ''}> ${t('mesai.plan.tz')}
</label>
<div style="font-size:11px;color:var(--text-3);margin-bottom:12px;">${t('mesai.plan.tzHint')}</div>
<div class="form-label">${t('mesai.plan.day')}</div>
<div class="mesai-plan-days">${pills}</div>
<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;margin-bottom:12px;">
<input type="checkbox" id="mp-on" ${day.off ? '' : 'checked'} onchange="mesaiPlanFlush();mesaiPlanRender();"> ${t('mesai.plan.on')}
</label>
<div style="${day.off ? 'display:none;' : ''}">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
<div class="form-row"><label class="form-label">${t('mesai.plan.start')}</label><input type="text" inputmode="numeric" maxlength="5" placeholder="08:00" class="form-input" id="mp-start" value="${day.start || '08:00'}" onblur="this.value=opsHm(this.value,'08:00')"></div>
<div class="form-row"><label class="form-label">${t('mesai.plan.end')}</label><input type="text" inputmode="numeric" maxlength="5" placeholder="20:00" class="form-input" id="mp-end" value="${day.end || '20:00'}" onblur="this.value=opsHm(this.value,'20:00')"></div>
</div>
<div class="form-label">${t('ops.mesai.breaks')}</div>
${breakHtml || `<div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">${t('ops.mesai.noBreak')}</div>`}
<button type="button" class="btn btn-ghost btn-sm" onclick="mesaiPlanAddBreak()">+ ${t('mesai.plan.add')}</button>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
<button type="button" class="btn btn-ghost btn-sm" onclick="mesaiPlanCopyMonday()">${t('mesai.plan.copy')}</button>
<button type="button" class="btn btn-primary btn-sm" onclick="saveMesaiPlan()">${t('mesai.plan.save')}</button>
</div>`;
}

function mesaiPlanCopyMonday() {
  mesaiPlanFlush();
  const monday = _mesaiPlanDraft?.pzt;
  if (!monday) return;
  MESAI_GUN_ORDER.forEach((gun) => {
    if (gun === 'pzt') return;
    _mesaiPlanDraft[gun] = {
      off: !!monday.off,
      start: monday.start || '08:00',
      end: monday.end || '20:00',
      breaks: (monday.breaks || []).map((item) => ({ start: item.start || '', end: item.end || '' })),
    };
  });
  mesaiPlanRender();
  toast(t('mesai.plan.copied'), 'ok');
}

async function mesaiPlanFirmChanged(id) {
  if (!id || String(id) === String(_mesaiPlanFirm)) return;
  _mesaiPlanFirm = String(id);
  await mesaiPlanLoadFirm(id);
}

async function mesaiPlanLoadFirm(fid) {
  const host = document.getElementById('mesai-plan-body');
  if (!host) return;
  if (!fid) {
    host.textContent = t('mesai.plan.pick');
    return;
  }
  _mesaiPlanFirm = String(fid);
  if (typeof ensureFirmTakvimDefaultsLoaded === 'function') await ensureFirmTakvimDefaultsLoaded(fid);
  let raw = null;
  try {
    const rows = await sb(`firms?id=eq.${fid}&select=settings`);
    raw = rows?.[0]?.settings?.mesai_plan || null;
  } catch (e) {}
  _mesaiPlanTz = typeof opsMesaiTzOf === 'function' ? opsMesaiTzOf(raw) : 'Europe/Berlin';
  const saved = typeof opsNormalizeMesaiPlan === 'function' ? opsNormalizeMesaiPlan(raw) : null;
  _mesaiPlanDraft = saved || mesaiPlanFallback();
  const clock = typeof opsBerlinClock === 'function' ? opsBerlinClock(_mesaiPlanTz) : null;
  _mesaiPlanGun = clock?.gun || 'pzt';
  mesaiPlanRender();
}

async function loadMesaiPlanCard() {
  const host = document.getElementById('mesai-plan-body');
  if (!host) return;
  const superAdmin = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  if (superAdmin) {
    try {
      _mesaiPlanFirms = await sb('firms?is_active=eq.true&select=id,name&order=name.asc') || [];
    } catch (e) {
      _mesaiPlanFirms = [];
    }
    const current = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
    const known = _mesaiPlanFirms.some((firm) => String(firm.id) === String(_mesaiPlanFirm));
    if (!known) _mesaiPlanFirm = current && _mesaiPlanFirms.some((firm) => String(firm.id) === String(current)) ? String(current) : String(_mesaiPlanFirms[0]?.id || '');
  } else {
    _mesaiPlanFirms = [];
    _mesaiPlanFirm = String(currentUser?.firm_id || '');
  }
  await mesaiPlanLoadFirm(_mesaiPlanFirm);
}

async function saveMesaiPlan() {
  mesaiPlanFlush();
  const superAdmin = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const fid = superAdmin ? _mesaiPlanFirm : (currentUser?.firm_id || '');
  if (!fid || !_mesaiPlanDraft) {
    toast('Önce firma seçin', 'warn');
    return;
  }
  const plan = {};
  for (const gun of MESAI_GUN_ORDER) {
    const day = _mesaiPlanDraft[gun] || { off: true, start: '08:00', end: '20:00', breaks: [] };
    const start = opsHm(day.start, '08:00');
    const end = opsHm(day.end, '20:00');
    if (!day.off && opsHmMins(start) >= opsHmMins(end)) {
      toast(`${MESAI_GUN_LABEL[gun]}: ${t('mesai.plan.order')}`, 'warn');
      return;
    }
    const breaks = [];
    for (const item of (day.breaks || [])) {
      const b0 = opsHm(item.start, '');
      const b1 = opsHm(item.end, '');
      if (!b0 || !b1) continue;
      const a = opsHmMins(b0);
      const z = opsHmMins(b1);
      if (a >= z || (!day.off && (a < opsHmMins(start) || z > opsHmMins(end)))) {
        toast(`${MESAI_GUN_LABEL[gun]}: ${t('mesai.plan.bad')}`, 'warn');
        return;
      }
      breaks.push({ start: b0, end: b1 });
    }
    breaks.sort((a, b) => opsHmMins(a.start) - opsHmMins(b.start));
    plan[gun] = { off: !!day.off, start, end, breaks };
  }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, mesai_plan: { tz: _mesaiPlanTz, ...plan } } }),
    });
    _mesaiPlanDraft = plan;
    if (String(fid) === String(typeof opsFirmId === 'function' ? opsFirmId() : '') && typeof opsApplyMesaiPlan === 'function') {
      opsApplyMesaiPlan({ tz: _mesaiPlanTz, ...plan });
    }
    toast(t('mesai.plan.saved'), 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

function iaDistinct(idx) {
  const counts = new Map();
  (_iaRows || []).forEach((row) => {
    const raw = row?.[idx];
    if (raw instanceof Date || typeof raw === 'number') return;
    const s = String(raw ?? '').trim();
    if (!s) return;
    counts.set(s, (counts.get(s) || 0) + 1);
  });
  return [...counts.entries()];
}

function iaGuessId(list, value, labelOf, keyOf) {
  const n = iaFold(value);
  const hit = (list || []).find((item) => iaFold(labelOf(item)) === n || (keyOf && iaFold(keyOf(item)) === n));
  return hit ? String(keyOf ? keyOf(hit) : hit.id) : '';
}

function iaQuestionRow(kind, value, optionsHtml, createLabel, titleText) {
  const fallback = { campaign: 'Kampanya: {v} — hangisi?', agent: 'Personel: {v} — kim?', durum: 'QC sonucu: {v} — bu nedir?' }[kind] || kind;
  const title = titleText || iaSay(`ia.q.${kind}`, fallback, { v: value });
  const create = createLabel ? `<option value="__create__">${iaEsc(createLabel)}</option>` : '';
  const extra = kind === 'agent'
    ? `<div class="ia-create" style="display:none;gap:6px;margin-top:6px;">
<input class="form-input ia-q-email" placeholder="${iaEsc(iaSay('ia.q.email', 'E-posta'))}" style="font-size:12px;">
<input class="form-input ia-q-pass" type="password" placeholder="${iaEsc(iaSay('ia.q.pass', 'Şifre'))}" style="font-size:12px;">
</div>`
    : '';
  let customer = '';
  if (kind === 'campaign' && getImportMapping().musteri == null) {
    const camp = (campaigns || []).find((c) => iaFold(c.name) === iaFold(value));
    const preset = camp && typeof mbCampDefaultCustomerId === 'function' ? (mbCampDefaultCustomerId(camp) || '') : '';
    customer = `<div style="font-size:11px;color:var(--text-3);margin-top:6px;">${iaEsc(iaSay('ia.q.customer', 'Müşteri'))}</div><select class="form-input ia-q-customer" style="font-size:12px;margin-top:4px;">${iaCustomerOptions(preset)}</select>`;
  }
  return `<div data-ia-kind="${iaEsc(kind)}" data-ia-value="${iaEsc(value)}" style="padding:8px 10px;background:var(--bg-3);border-radius:8px;">
<div style="font-size:12px;font-weight:700;margin-bottom:6px;">${iaEsc(title)}</div>
<select class="form-input ia-q-pick" style="font-size:12px;" onchange="iaToggleCreate(this)">${optionsHtml}${create}</select>
${customer}
${extra}
</div>`;
}

function iaToggleCreate(sel) {
  const box = sel.parentElement?.querySelector('.ia-create');
  if (box) box.style.display = sel.value === '__create__' ? 'flex' : 'none';
  const cust = sel.parentElement?.querySelector('.ia-q-customer');
  if (!cust) return;
  if (!sel.value || sel.value === '__create__') {
    cust.innerHTML = iaCustomerOptions('');
    return;
  }
  const camp = (campaigns || []).find((c) => String(c.id) === sel.value);
  const id = camp && typeof mbCampDefaultCustomerId === 'function' ? (mbCampDefaultCustomerId(camp) || '') : '';
  cust.innerHTML = iaCustomerOptions(id);
}

function iaReadAnswers() {
  const out = { campaign: {}, agent: {}, durum: {}, musteri: {}, extra: {} };
  document.querySelectorAll('#ia-questions [data-ia-kind]').forEach((row) => {
    const kind = row.dataset.iaKind;
    const value = row.dataset.iaValue;
    const pick = row.querySelector('.ia-q-pick')?.value || '';
    if (!out[kind]) return;
    out[kind][value] = {
      pick,
      customer: row.querySelector('.ia-q-customer')?.value || '',
      email: row.querySelector('.ia-q-email')?.value?.trim() || '',
      pass: row.querySelector('.ia-q-pass')?.value || '',
    };
  });
  return out;
}

function iaBuildQuestions() {
  const host = document.getElementById('ia-questions');
  if (!host) return false;
  const map = getImportMapping();
  const used = new Set(Object.values(map).filter((n) => n != null && !Number.isNaN(n)));
  const parts = [];
  const askKind = (kind, idx, list, labelOf, keyOf, createLabel) => {
    if (idx == null || Number.isNaN(idx)) return false;
    const values = iaDistinct(idx);
    if (values.length > 30) {
      toast(iaSay('ia.q.many', 'Bu sütunda çok fazla farklı değer var. Tek seçim kullanılacak.'), 'warn');
      return false;
    }
    values.forEach(([value]) => {
      const guessed = iaGuessId(list, value, labelOf, keyOf);
      const opts = [`<option value="">${iaEsc(iaSay('ia.q.pick', 'Seçin'))}</option>`]
        .concat(list.map((item) => {
          const id = String(keyOf(item));
          const label = labelOf(item);
          return `<option value="${iaEsc(id)}" ${id === guessed ? 'selected' : ''}>${iaEsc(label)}</option>`;
        })).join('');
      parts.push(iaQuestionRow(kind, value, opts, createLabel));
    });
    return values.length > 0;
  };
  askKind('campaign', map.kampanya, campaigns || [], (c) => c.name || '', (c) => c.id, iaSay('ia.q.create.camp', 'Yeni kampanya oluştur'));
  askKind('agent', map.personel, _iaUsers || [], (u) => u.name || '', (u) => u.id, iaSay('ia.q.create.agent', 'Bu personeli oluştur'));
  askKind('durum', map.durum, _iaResults || [], (r) => r.label || r.key, (r) => r.key, iaSay('ia.q.create.durum', 'Yeni QC sonucu oluştur'));
  if (map.musteri != null && !Number.isNaN(map.musteri)) {
    const values = iaDistinct(map.musteri);
    if (values.length > 30) toast(iaSay('ia.q.many', 'Bu sütunda çok fazla farklı değer var. Tek seçim kullanılacak.'), 'warn');
    else values.forEach(([value]) => {
      const folded = iaFold(value);
      const blankName = ['bos', 'leer', 'yok', 'none', 'null', '-'].includes(folded);
      const guessed = blankName ? 'qc' : (iaGuessId(_iaCustomers, value, (c) => c.name || '', (c) => c.id) || '');
      const opts = iaCustomerOptions(guessed, !guessed);
      parts.push(iaQuestionRow('musteri', value, opts, '', iaSay('ia.q.musteri', 'Müşteri: {v} — hangisi?', { v: value })));
    });
  }
  (_iaHeaders || []).forEach((header, idx) => {
    if (used.has(idx) || !String(header || '').trim()) return;
    if (iaNoiseHeader(header) || iaAllPublish(_iaRows, idx) || !iaDistinct(idx).length) return;
    const note = iaNoteHeader(header);
    const opts = [`<option value="" ${note ? '' : 'selected'}>${iaEsc(iaSay('ia.q.skip', 'Atla'))}</option>`, `<option value="__note__" ${note ? 'selected' : ''}>${iaEsc(iaSay('ia.q.note', 'Notun içine yaz'))}</option>`]
      .concat(IA_FIELDS.filter((f) => map[f.key] == null).map((f) => `<option value="${iaEsc(f.key)}">${iaEsc(f.label)}</option>`)).join('');
    parts.push(iaQuestionRow('extra', String(idx), opts, '', iaSay('ia.q.field', 'Sütun: {v} — nereye gelsin?', { v: header })));
  });
  host.innerHTML = parts.join('') || `<div style="font-size:12px;color:var(--text-3);">${iaEsc(iaSay('ia.q.ready', 'Eşleşmeler hazır'))}</div>`;
  host.style.display = 'flex';
  host.querySelectorAll('.ia-q-pick').forEach((sel) => { if (sel.value === '__create__') iaToggleCreate(sel); });
  _iaReviewed = true;
  toast(iaSay('ia.q.ready', 'Eşleşmeler hazır'), 'ok');
  return true;
}

function iaAnswerProblem(answers) {
  const need = (kind, label) => {
    const bag = answers[kind] || {};
    const missing = Object.entries(bag).find(([, ans]) => !ans.pick);
    if (missing) return `${label}: ${missing[0]}`;
    if (kind === 'agent') {
      const bad = Object.entries(bag).find(([, ans]) => ans.pick === '__create__' && (!String(ans.email || '').includes('@') || String(ans.pass || '').length < 6));
      if (bad) return `${bad[0]}: ${iaSay('ia.q.email', 'E-posta')} / ${iaSay('ia.q.pass', 'Şifre')}`;
    }
    return '';
  };
  const campFallback = document.getElementById('ia-campaign')?.value || '';
  const agentFallback = document.getElementById('ia-agent')?.value || '';
  return need('campaign', 'Kampanya') || need('agent', 'Personel') || need('durum', 'QC') || need('musteri', 'Müşteri')
    || (!Object.keys(answers.campaign || {}).length && !campFallback ? 'Kampanya' : '')
    || (!Object.keys(answers.agent || {}).length && !agentFallback ? 'Personel' : '');
}

async function iaEnsureCreates(answers, firmId) {
  const campIds = {};
  const agentIds = {};
  const durumIds = {};
  for (const [name, ans] of Object.entries(answers.campaign || {})) {
    if (ans.pick !== '__create__') { campIds[name] = ans.pick; continue; }
    const created = await sb('campaigns', {
      method: 'POST', prefer: 'return=representation',
      body: JSON.stringify({ name, firm_id: firmId, status: 'paused', dial_speed: 1, settings: { customer_qc: true } }),
    });
    const row = Array.isArray(created) ? created[0] : created;
    if (!row?.id) throw new Error(name);
    campIds[name] = row.id;
    if (Array.isArray(campaigns)) campaigns.push(row);
  }
  for (const [name, ans] of Object.entries(answers.agent || {})) {
    if (ans.pick !== '__create__') { agentIds[name] = ans.pick; continue; }
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_user_with_password`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({ p_firm_id: firmId, p_email: ans.email, p_password: ans.pass, p_name: name, p_role: 'agent' }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 180); } catch (e) { detail = ''; }
      throw new Error(detail ? `${name}: ${detail}` : name);
    }
    const found = await sb(`users?email=eq.${encodeURIComponent(ans.email)}&select=id,name&limit=1`);
    const id = found?.[0]?.id;
    if (!id) throw new Error(name);
    agentIds[name] = id;
    _iaUsers.push({ id, name });
  }
  const fresh = Object.entries(answers.durum || {}).filter(([, ans]) => ans.pick === '__create__');
  if (fresh.length) {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const rows = Array.isArray(existing.appointment_results) && existing.appointment_results.length
      ? existing.appointment_results.slice()
      : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
    fresh.forEach(([name]) => {
      const key = typeof _normResultKey === 'function' ? _normResultKey(name) : iaFold(name).replace(/[^a-z0-9_]+/g, '_');
      if (!rows.some((r) => r.key === key)) {
        const contact = typeof appointmentResultToContactStatus === 'function' ? appointmentResultToContactStatus(key) : name;
        rows.push({ key, label: name, color: '#64748b', contact_status: contact, auto_move_down: false });
      }
      durumIds[name] = key;
    });
    await sb(`firms?id=eq.${firmId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, appointment_results: rows } }),
    });
    if (window._apptResultsByFirm) window._apptResultsByFirm[firmId] = rows;
    _iaResults = rows;
  }
  Object.entries(answers.durum || {}).forEach(([name, ans]) => {
    if (ans.pick !== '__create__') durumIds[name] = ans.pick;
  });
  return { campIds, agentIds, durumIds };
}

function previewImport() {
  const map = getImportMapping();
  const box = document.getElementById('ia-preview-table');
  const info = document.getElementById('ia-preview-info');
  const sec = document.getElementById('ia-preview-section');
  if (!box || !sec) return;
  const rows = (_iaRows || []).slice(0, 8);
  const keys = Object.keys(map);
  box.innerHTML = `<table><thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((k) => `<td>${escapeHtml(row[map[k]] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if (info) info.textContent = `${(_iaRows || []).length} satır`;
  sec.style.display = '';
}

async function startImportAppt() {
  const map = getImportMapping();
  if (map.nachname == null || map.telefon == null) {
    toast('Ad ve telefon sütunlarını eşleştirin', 'err');
    return;
  }
  if (map.termin_tarih == null || Number.isNaN(map.termin_tarih)) {
    toast(iaSay('ia.q.needdate', 'Randevu tarihi sütununu eşleştirin'), 'err');
    return;
  }
  if (!_iaReviewed) {
    iaBuildQuestions();
    if (document.querySelector('#ia-questions [data-ia-kind]')) {
      toast(iaSay('ia.q.review', 'Eşleşmeleri kontrol et. Doğruysa İçe aktar’a tekrar bas.'), 'ok');
      return;
    }
  }
  const answers = iaReadAnswers();
  const problem = iaAnswerProblem(answers);
  if (problem) {
    toast(iaSay('ia.q.need', 'Önce eşleşmeyenleri seçin') + ' — ' + problem, 'err');
    const host = document.getElementById('ia-questions');
    if (host) host.style.display = 'flex';
    return;
  }
  const fallbackCamp = document.getElementById('ia-campaign')?.value || '';
  const fallbackAgent = document.getElementById('ia-agent')?.value || '';
  const fallbackStatus = document.getElementById('ia-status')?.value || 'qc_bekleniyor';
  const fmt = document.getElementById('ia-date-fmt')?.value || 'dd.mm.yyyy';
  const firmId = iaFirmId();
  let made;
  try {
    made = await iaEnsureCreates(answers, firmId);
  } catch (e) {
    toast(e?.message || 'Oluşturulamadı', 'err');
    return;
  }
  Object.entries(answers.extra || {}).forEach(([idx, ans]) => {
    if (ans.pick && ans.pick !== '__note__' && map[ans.pick] == null) map[ans.pick] = parseInt(idx, 10);
  });
  const prog = document.getElementById('ia-progress-section');
  const bar = document.getElementById('ia-progress-bar');
  const label = document.getElementById('ia-progress-label');
  if (prog) prog.style.display = '';
  let ok = 0;
  let skip = 0;
  const seen = new Set();
  const rows = _iaRows || [];
  const text = (row, key) => {
    const idx = map[key];
    if (idx == null || Number.isNaN(idx)) return '';
    const raw = row[idx];
    if (raw == null || raw instanceof Date) return '';
    return String(raw).trim();
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let phone = text(row, 'telefon');
    let phone2 = text(row, 'telefon2');
    if (phone && !phone2) {
      const parts = phone.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) { phone = parts[0]; phone2 = parts.slice(1).join(' - '); }
    }
    const rawDay = map.termin_tarih == null ? '' : row[map.termin_tarih];
    const rawSaat = map.termin_saat == null ? '' : row[map.termin_saat];
    const berlin = (map.termin_saat == null || iaCellText(rawSaat) === '') ? iaBerlinStamp(rawDay) : null;
    const day = berlin ? berlin.day : iaParseDay(rawDay, fmt);
    const saat = berlin ? berlin.time : iaParseTime(rawSaat);
    const campName = text(row, 'kampanya');
    const agentName = text(row, 'personel');
    const durumName = text(row, 'durum');
    const custName = text(row, 'musteri');
    const campId = (campName && made.campIds[campName]) || fallbackCamp;
    const agentId = (agentName && made.agentIds[agentName]) || fallbackAgent;
    const durum = (durumName && made.durumIds[durumName]) || fallbackStatus;
    if (!phone || !day || !campId || !agentId || !durum) { skip++; continue; }
    const sig = `${campId}|${phone}|${day}|${saat}`;
    if (seen.has(sig)) { skip++; continue; }
    seen.add(sig);
    const camp = (campaigns || []).find((c) => String(c.id) === String(campId));
    let custPick = '';
    if (custName && answers.musteri?.[custName]) custPick = answers.musteri[custName].pick;
    else if (campName && answers.campaign[campName]?.customer) custPick = answers.campaign[campName].customer;
    else custPick = document.getElementById('ia-customer')?.value || 'qc';
    const custId = custPick && custPick !== 'qc' ? custPick : null;
    const notes = [];
    const baseNote = text(row, 'notiz');
    if (baseNote) notes.push(baseNote);
    Object.entries(answers.extra || {}).forEach(([idx, ans]) => {
      if (ans.pick !== '__note__') return;
      const val = String(row[idx] ?? '').trim();
      if (!val) return;
      notes.push(`${_iaHeaders[idx] || 'Alan'}: ${val}`);
    });
    const payload = {
      firm_id: camp?.firm_id || firmId,
      campaign_id: campId,
      agent_id: agentId,
      nachname: text(row, 'nachname') || '—',
      telefonnummer: phone,
      telefon2: phone2 || null,
      strasse: text(row, 'strasse') || null,
      plz: iaPlz(text(row, 'plz')) || null,
      ortschaft: text(row, 'ort') || null,
      hausart: text(row, 'hausart') || null,
      baujahr: text(row, 'baujahr') || null,
      qm: text(row, 'qm') || null,
      heizung: text(row, 'heizung') || null,
      alter_der_heizung: text(row, 'alter_der_heizung') || null,
      verbrauch_pro_jahr: text(row, 'verbrauch_pro_jahr') || null,
      personen: text(row, 'personen') || null,
      agent_notu: notes.join('\n') || null,
      durum,
      customer_id: custId || null,
      termin_tarih: typeof mbWallToIso === 'function' ? (mbWallToIso(`${day}T${saat}`) || `${day}T${saat}:00`) : `${day}T${saat}:00`,
    };
    try {
      await sb('appointments', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(payload) });
      ok++;
    } catch (e) {
      skip++;
    }
    if (bar) bar.style.width = `${Math.round(((i + 1) / Math.max(rows.length, 1)) * 100)}%`;
  }
  const done = iaSay('ia.done', '{ok} randevu yazıldı, {skip} satır atlandı', { ok, skip });
  if (label) label.textContent = done;
  toast(done, skip ? 'warn' : 'ok');
}

