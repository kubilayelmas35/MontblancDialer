// ─────────────────────────────────────────────
// QC PANELİ — kalite kontrol
// ─────────────────────────────────────────────

async function loadQcData() {
  const qcSel = document.getElementById('qc-firm-selector');
  if (qcSel) { qcSel.style.display = isSuperAdmin() ? '' : 'none'; renderFirmSelector('qc-firm-selector', loadQcData); }
  const tbody = document.getElementById('qc-tbody');
  if (tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(10) : `<tr><td colspan="10" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  try {
    const fid = getActiveFirmId() || currentUser?.firm_id || null;
    const resultCfg = await loadFirmAppointmentResults(fid);
    window._qcResultCfg = resultCfg || [];
    window._qcResultMap = {};
    (window._qcResultCfg || []).forEach(r => { window._qcResultMap[r.key] = r; });
    const firmFilter = fid ? `&firm_id=eq.${fid}` : '';
    qcList = await sb(`call_logs?select=*,contacts(*),users(name),campaigns(name)&outcome=in.(appointment,appointment_done)${firmFilter}&order=started_at.desc&limit=500`).catch(()=>[]);
    window._qcCustomers = fid ? await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(()=>[]) : [];
    const contactIds = [...new Set((qcList || []).map(r => r.contact_id).filter(Boolean))];
    window._qcApptByContact = {};
    if (fid && contactIds.length) {
      const ids = contactIds.join(',');
      const appts = await sb(`appointments?firm_id=eq.${fid}&contact_id=in.(${ids})&select=id,contact_id,customer_id&order=created_at.desc&limit=1000`).catch(()=>[]);
      (appts || []).forEach(a => {
        if (!window._qcApptByContact[a.contact_id]) window._qcApptByContact[a.contact_id] = a;
      });
    }
    renderQcTable();
    const pending = (qcList||[]).filter(r => ['appointment','appointment_done'].includes(r.outcome||'') && (r.contacts?.durum||'qc bekleniyor') === 'qc bekleniyor');
    const badge = document.getElementById('sb-badge-qc');
    if (badge) {
      badge.style.display = pending.length > 0 ? '' : 'none';
      badge.textContent = pending.length;
    }
    if (typeof loadJobMarketQcQueue === 'function') loadJobMarketQcQueue();
  } catch(e) { console.error('QC load err:', e); }
}

function setQcTab(tab) {
  qcTab = tab;
  const tabs = ['pending','success','fail','callback','all'];
  const tabMap = {'qc bekleniyor':'pending','başarılı':'success','başarısız':'fail','beklemede':'callback','all':'all'};
  tabs.forEach(t => {
    const btn = document.getElementById('qc-tab-'+t);
    if (btn) {
      const isActive = tabMap[qcTab] === t || (t==='pending' && qcTab==='qc bekleniyor');
      btn.style.background = isActive ? 'var(--accent)' : 'transparent';
      btn.style.color = isActive ? '#fff' : 'var(--text-2)';
    }
  });
  renderQcTable();
}

function filterQcTable() { renderQcTable(); }

function renderQcTable() {
  const tbody = document.getElementById('qc-tbody');
  if (!tbody) return;
  const canAssignField = ['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '');
  const hasCustomers = (window._qcCustomers || []).length > 0;
  const search = (document.getElementById('qc-search')?.value||'').toLowerCase();
  let list = [...(qcList||[])];
  list = list.filter(r => ['appointment','appointment_done'].includes(r.outcome) || r.contacts?.durum);
  if (qcTab !== 'all') {
    list = list.filter(r => {
      const durum = (r.contacts?.durum || 'qc bekleniyor').toLowerCase();
      return durum.includes(qcTab.toLowerCase());
    });
  }
  if (search) {
    list = list.filter(r =>
      (r.contacts?.last_name||'').toLowerCase().includes(search) ||
      (r.contacts?.first_name||'').toLowerCase().includes(search) ||
      (r.contacts?.phone||'').includes(search) ||
      (r.agent_id||'').toLowerCase().includes(search)
    );
  }
  const pendingCnt = (qcList||[]).filter(r => (r.contacts?.durum||'qc bekleniyor') === 'qc bekleniyor' && ['appointment','appointment_done'].includes(r.outcome||'')).length;
  const cntEl = document.getElementById('qc-cnt-pending');
  if (cntEl) cntEl.textContent = pendingCnt;
  if (!list.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(10, 'ui.no_records') : `<tr><td colspan="10" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  const customerOptions = (window._qcCustomers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  tbody.innerHTML = list.map(r => {
    const contact = r.contacts||{};
    const dt = r.started_at ? new Date(r.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
    const rawDurum = contact.durum || 'qc bekleniyor';
    const resultKey = contactStatusToAppointmentResult(rawDurum);
    const resultCfg = window._qcResultMap?.[resultKey];
    const durum = resultCfg?.label || rawDurum;
    const durumColor = resultCfg?.color || 'var(--text-3)';
    const name = `${contact.first_name||''} ${contact.last_name||''}`.trim()||'—';
    const agentName = r.users?.name || r.agent_id?.slice(0,8)||'—';
    const campName = r.campaigns?.name || r.campaign_id?.slice(0,8)||'—';
    const recUrl = r.recording_url||'';
    const recHtml = recUrl
      ? `<div style="display:flex;align-items:center;gap:4px;">
<audio id="aud-${r.id}" src="${recUrl}" preload="none" style="display:none;"></audio>
<button onclick="toggleAudio('${r.id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-2);font-size:11px;" title="Dinle"><i class="ph ph-play"></i></button>
<span style="font-size:10px;color:var(--text-3);">${r.duration_sec?Math.floor(r.duration_sec/60)+'m'+r.duration_sec%60+'s':''}</span>
</div>`
      : `<span style="font-size:10px;color:var(--text-3);">—</span>`;
    const contactDetailBtn = r.contact_id
      ? `<button class="icon-btn" onclick="openDialerForContact('${r.contact_id}')" title="Dialer'da Aç"><i class="ph ph-magnifying-glass"></i></button>`
      : `<button class="icon-btn" onclick="openQcDetail('${r.id}')" title="Detay"><i class="ph ph-magnifying-glass"></i></button>`;
    const ap = window._qcApptByContact?.[r.contact_id] || {};
    const selectedCustomer = ap.customer_id || '';
    const assignBtn = canAssignField
      ? `<button class="icon-btn" ${ap.id ? '' : 'disabled style="opacity:.45;cursor:not-allowed;"'} onclick="${ap.id ? `openFieldAssignModal('${ap.id}','${r.firm_id || currentUser?.firm_id || ''}')` : 'void(0)'}" title="Sahaya Ata"><i class="ph ph-map-pin"></i></button>`
      : '';
    return `<tr>
<td style="font-family:var(--mono);font-size:11px;">${dt}</td>
<td style="font-weight:600;cursor:pointer;" onclick="openQcDetail('${r.id}')">${name}</td>
<td style="font-family:var(--mono);font-size:12px;">${contact.phone||'—'}</td>
<td style="font-family:var(--mono);font-size:12px;">${contact.plz||'—'}</td>
<td style="font-size:12px;">${agentName}</td>
<td style="font-size:11px;">${campName}</td>
<td>${hasCustomers ? `
  <select class="form-input" id="qc-customer-select-${r.id}" style="min-width:150px;">
    <option value="">Müşteri seç</option>
    ${customerOptions.replace(`value="${selectedCustomer}"`, `value="${selectedCustomer}" selected`)}
  </select>
` : `<span style="font-size:11px;color:var(--text-3);">—</span>`}</td>
<td>${recHtml}</td>
<td><span style="font-size:11px;font-weight:700;color:${durumColor};">${durum}</span></td>
<td>
<div style="display:flex;gap:3px;align-items:center;">
${contactDetailBtn}
${assignBtn}
<button class="icon-btn" style="border-color:var(--green);color:var(--green);" onclick="quickQcUpdate('${r.id}','başarılı')" title="Başarılı"><i class="ph ph-check"></i></button>
<button class="icon-btn" style="border-color:var(--red);color:var(--red);" onclick="quickQcUpdate('${r.id}','başarısız')" title="Başarısız"><i class="ph ph-x"></i></button>
</div>
</td>
</tr>`;
  }).join('');
}

function openQcDetail(logId) {
  const r = (qcList||[]).find(x => x.id === logId);
  if (!r) return;
  const role = currentUser?.role || '';
  const canAssignField = ['admin','super_admin','firm_admin'].includes(role);
  qcDetailId = logId;
  const contact = r.contacts||{};
  const name = `${contact.first_name||''} ${contact.last_name||''}`.trim()||'—';
  const dt = r.started_at ? new Date(r.started_at).toLocaleString('tr-TR') : '—';
  const body = document.getElementById('qc-detail-body');
  const hasCustomers = (window._qcCustomers || []).length > 0;
  if (body) body.innerHTML = `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">MÜŞTERİ</div><div style="font-weight:700;">${name}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">TELEFON</div><div style="font-weight:700;font-family:var(--mono);">${contact.phone||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">PLZ / ŞEHİR</div><div style="font-weight:700;">${contact.plz||'—'} ${contact.city||''}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">ADRES</div><div style="font-weight:700;">${contact.address||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">AGENT</div><div style="font-weight:700;">${r.users?.name||r.agent_id||'—'}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">TARİH</div><div style="font-weight:700;">${dt}</div></div>
${contact.notes ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">NOT</div><div>${contact.notes}</div></div>` : ''}
${r.recording_url ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">KAYIT</div><audio controls src="${r.recording_url}" style="width:100%;"></audio></div>` : ''}
</div>
${hasCustomers ? `<div style="margin-top:10px;">
  <label class="form-label">Müşteri</label>
  <select class="form-input" id="qc-detail-customer" style="width:100%;">
    <option value="">Müşteri seç</option>
    ${(window._qcCustomers || []).map(c => {
      const ap = window._qcApptByContact?.[r.contact_id] || {};
      return `<option value="${c.id}" ${ap.customer_id === c.id ? 'selected' : ''}>${c.name}</option>`;
    }).join('')}
  </select>
</div>` : ''}
<div style="margin-top:10px;">
  <label class="form-label">Sonuç</label>
  <select class="form-input" id="qc-status-select" style="width:100%;">
    ${(window._qcResultCfg || []).map(s => `<option value="${s.key}" ${contactStatusToAppointmentResult(contact.durum||'qc bekleniyor')===s.key?'selected':''}>${s.label}</option>`).join('')}
  </select>
</div>
<div style="margin-top:12px;">
<textarea id="qc-note-input" class="form-input" rows="2" placeholder="QC notu..." style="width:100%;resize:vertical;"></textarea>
</div>
${canAssignField ? `<div style="margin-top:10px;display:flex;justify-content:flex-end;">
  <button class="btn btn-primary" onclick="(function(){ const ap = window._qcApptByContact?.['${r.contact_id || ''}']; if (!ap?.id) { toast('Bu kayda bağlı randevu bulunamadı','warn'); return; } openFieldAssignModal(ap.id, '${r.firm_id || currentUser?.firm_id || ''}'); })()">Sahaya Ata</button>
</div>` : ''}`;
  openModal('m-qc-detail');
}

async function qcUpdateStatus(status) {
  if (!qcDetailId) return;
  const selected = document.getElementById('qc-status-select')?.value || '';
  await quickQcUpdate(qcDetailId, selected || status);
  closeModal('m-qc-detail');
}

async function quickQcUpdate(logId, status) {
  const r = (qcList||[]).find(x => x.id === logId);
  if (!r?.contact_id) { toast('Contact ID yok','err'); return; }
  const hasCustomers = (window._qcCustomers || []).length > 0;
  const customerId = document.getElementById(`qc-customer-select-${logId}`)?.value
    || document.getElementById('qc-detail-customer')?.value
    || '';
  if (hasCustomers && !customerId) { toast('Önce müşteri seçmelisiniz', 'err'); return; }
  const resultKey = _normResultKey(status || '');
  const resultCfg = window._qcResultMap?.[resultKey];
  const contactStatus = resultCfg?.contact_status || appointmentResultToContactStatus(resultKey);
  const apptStatus = resultKey || contactStatusToAppointmentResult(contactStatus);
  const note = document.getElementById('qc-note-input')?.value||'';
  try {
    const fid = getActiveFirmId() || currentUser?.firm_id || null;
    await sb(`contacts?id=eq.${r.contact_id}`, {method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({durum: contactStatus, qc_note: note || undefined})});
    const apptRows = fid ? await sb(`appointments?firm_id=eq.${fid}&contact_id=eq.${r.contact_id}&select=id&order=created_at.desc&limit=1`).catch(()=>[]) : [];
    let apptDate = '', apptTime = '';
    if (apptRows?.length) {
      const cfg = (window._qcResultCfg || []).find(x => x.key === apptStatus);
      await sb(`appointments?id=eq.${apptRows[0].id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ customer_id: hasCustomers ? (customerId || null) : null, durum: apptStatus }),
      });
      if (cfg?.auto_move_down) {
        const slots = await sb(`takvim_slots?appointment_id=eq.${apptRows[0].id}&select=id&limit=1`).catch(() => []);
        if (slots?.[0]?.id) {
          await sb(`takvim_slots?id=eq.${slots[0].id}`, {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: JSON.stringify({ alta_tasindi: true, durum: 'dolu' }),
          }).catch(() => {});
        }
      }
      // Fetch slot date/time for SMS template
      const slotRows = await sb(`takvim_slots?appointment_id=eq.${apptRows[0].id}&select=tarih,baslangic_saat&order=created_at.desc&limit=1`).catch(() => []);
      if (slotRows?.[0]) {
        apptDate = slotRows[0].tarih || '';
        apptTime = (slotRows[0].baslangic_saat || '').slice(0, 5);
      }
    }
    await loadQcData();
    toast(`Durum güncellendi ✓`, 'ok');

    // SMS prompt for successful QC approval
    if (resultKey === 'basarili' || contactStatus === 'başarılı') {
      const contact = r.contacts || {};
      const phone = contact.phone || '';
      const name  = `${contact.first_name||''} ${contact.last_name||''}`.trim();
      if (phone && typeof showQcSmsPrompt === 'function') {
        await showQcSmsPrompt(phone, name, apptDate, apptTime);
      }
    }
  } catch(e) { toast('Hata: '+e.message,'err'); }
}
