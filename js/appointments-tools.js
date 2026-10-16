// Takvim araçları — appointments.js ile aynı global kapsam
// ── Context menu ──────────────────────────────
function showSlotContextMenu(e, slot, appt) {
  e.preventDefault(); e.stopPropagation();
  _ctxSlot = slot; _ctxAppt = appt;
  const old = document.getElementById('slot-ctx-menu');
  if (old) old.remove();
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
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
      items.push({ icon:'', label:'Alta Taşı', onClick: () => slotAltaTasi(_ctxSlot.id), yellow:true });
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

async function slotAltaTasi(slotId) {
  try {
    await sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal', body: JSON.stringify({alta_tasindi: true, durum: 'dolu'})});
    await loadTakvimSlots();
    toast('Slot alta taşındı', 'ok');
  } catch(e) { toast('Hata: '+e.message, 'err'); }
}

// ── Drag & Drop ───────────────────────────────
function initSlotDrag(el, slot, appt) {
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  const canDrag = isAdmin && (slot.durum === 'bos' || (slot.durum === 'dolu' && appt));
  if (!canDrag) return;
  el.draggable = true; el.style.cursor = 'grab';
  el.addEventListener('dragstart', e => {
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
  const isAdmin = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
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
  const locale = typeof mbLocale === 'function' ? mbLocale() : (currentLang === 'de' ? 'de-DE' : 'tr-TR');
  const n = dayKeys.length;
  let h = `<div style="display:grid;grid-template-columns:52px repeat(${n},minmax(0,1fr));width:100%;box-sizing:border-box;">`;
  h += '<div style="border-right:1px solid var(--border);"></div>';
  dayKeys.forEach((ds) => {
    const dt = new Date(ds + 'T12:00:00');
    const head = dt.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
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
      h += `<div onclick="openTakvimSlotDetail(takvimSlots.find(x=>x.id==='${s.id}'),takvimAppts.find(a=>a.id==='${s.appointment_id}'))" style="font-size:9px;font-weight:700;padding:4px 6px;border-radius:4px;cursor:pointer;background:${fv.background};color:${fv.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⬆ ${nm}</div>`;
    });
    h += `</div>`;
  });
  h += '</div>';
  grid.innerHTML = h;
}

async function checkActiveCampaignNotif() {
  if (!currentUser?.firm_id) return;
  if (['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '')) return;
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
  if (!['admin', 'super_admin', 'firm_admin'].includes(role)) return;
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

function openTakvimPlzMeasureModal() {
  if (!takvimCampId) {
    toast('Önce kampanya seçin', 'err');
    return;
  }
  const old = document.getElementById('m-takvim-plz-measure');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-takvim-plz-measure';
  m.className = 'modal-overlay open';
  const cur = _takvimMeasureFromPlz || '';
  m.innerHTML =
    '<div class="modal" style="max-width:400px;">' +
    '<div class="modal-hdr"><div class="modal-title">Mesafe ölç (PLZ)</div>' +
    '<button type="button" class="modal-close" onclick="document.getElementById(\'m-takvim-plz-measure\')?.remove()">✕</button></div>' +
    '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">' +
    '<div class="form-row"><label class="form-label">Başlangıç PLZ</label>' +
    '<input type="text" class="form-input" id="takvim-plz-measure-inp" placeholder="örn. 80331" value="' +
    String(cur).replace(/"/g, '') +
    '"></div>' +
    '<div style="font-size:11px;color:var(--text-3);">Girilen PLZ\'den takvimdeki tüm randevulara (PLZ bilgisi olan) rota mesafesi yazılır.</div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn btn-ghost" onclick="clearTakvimPlzMeasure()">Temizle</button>' +
    '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'m-takvim-plz-measure\')?.remove()">Kapat</button>' +
    '<button type="button" class="btn btn-primary" onclick="runPlzMeasureFromModal()">Ölç</button>' +
    '</div></div>';
  document.body.appendChild(m);
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
  if (!['admin', 'super_admin', 'firm_admin'].includes(role)) return;
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
  const camp = document.getElementById('ia-campaign')?.value || '';
  const agent = document.getElementById('ia-agent')?.value || '';
  if (!camp || !agent) {
    toast('Kampanya ve temsilci seçin', 'err');
    return;
  }
  const map = getImportMapping();
  if (map.nachname == null || map.telefon == null) {
    toast('Ad ve telefon sütunlarını eşleştirin', 'err');
    return;
  }
  const status = document.getElementById('ia-status')?.value || 'beklemede';
  const prog = document.getElementById('ia-progress-section');
  const bar = document.getElementById('ia-progress-bar');
  const label = document.getElementById('ia-progress-label');
  if (prog) prog.style.display = '';
  let ok = 0;
  const rows = _iaRows || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell = (k) => (map[k] == null ? '' : String(row[map[k]] ?? '').trim());
    const payload = {
      firm_id: currentUser?.firm_id,
      campaign_id: camp,
      agent_id: agent,
      nachname: cell('nachname') || '—',
      telefonnummer: cell('telefon'),
      telefon2: cell('telefon2') || null,
      strasse: cell('strasse') || null,
      plz: cell('plz') || null,
      ortschaft: cell('ort') || null,
      agent_notu: cell('notiz') || null,
      durum: cell('durum') || status,
    };
    const tarih = cell('termin_tarih');
    const saat = (cell('termin_saat') || '10:00').slice(0, 5);
    if (tarih) {
      const isoDay = tarih.includes('.') ? tarih.split('.').reverse().join('-') : tarih.slice(0, 10);
      payload.termin_tarih = typeof mbWallToIso === 'function' ? mbWallToIso(`${isoDay}T${saat}`) : `${isoDay}T${saat}:00`;
    }
    try {
      await sb('appointments', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(payload) });
      ok++;
    } catch (e) {
      if (label) label.textContent = 'Satır kaydedilemedi';
      toast('İçe aktarma durdu: ' + (e?.message || 'kayıt yazılamadı'), 'err');
      return;
    }
    if (bar) bar.style.width = `${Math.round(((i + 1) / Math.max(rows.length, 1)) * 100)}%`;
  }
  if (label) label.textContent = `${ok} randevu yazıldı`;
  toast(`${ok} randevu içe aktarıldı`, 'ok');
}

