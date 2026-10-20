// ─────────────────────────────────────────────
// KK PANELİ — randevu kalite kontrolü
// ─────────────────────────────────────────────

const QC_CAP = 2000;

function _qcSlot(row) {
  const slot = row?.takvim_slots;
  return Array.isArray(slot) ? slot[0] : slot;
}

function _qcMoved(row) {
  const slot = _qcSlot(row);
  return !!(slot && (slot.alta_tasindi === true || slot.alta_tasindi === 'true' || slot.alta_tasindi === 't'));
}

function _qcDurumKey(row) {
  const raw = String(row?.durum || '').trim();
  const norm = typeof _normResultKey === 'function' ? _normResultKey(raw) : raw;
  if (window._qcResultMap?.[norm]) return norm;
  const mapped = typeof contactStatusToAppointmentResult === 'function' ? contactStatusToAppointmentResult(raw) : norm;
  const key = typeof _normResultKey === 'function' ? _normResultKey(mapped) : mapped;
  return window._qcResultMap?.[key] ? key : (norm || key || '');
}

function _qcResultLabel(key) {
  const cfg = window._qcResultMap?.[key];
  if (cfg && typeof mbResultLabel === 'function') return mbResultLabel(cfg.key, cfg.label);
  if (cfg?.label) return cfg.label;
  return key || '—';
}

function _qcWall(row) {
  if (typeof _etWall === 'function') return _etWall(row?.termin_tarih, _qcSlot(row));
  return { dayKey: '', day: '', time: '', text: '' };
}

function _qcInDates(row) {
  const from = document.getElementById('qc-date-from')?.value || '';
  const to = document.getElementById('qc-date-to')?.value || '';
  if (!from && !to) return true;
  if (typeof _etInRange === 'function') return _etInRange({ dayKey: _qcWall(row).dayKey }, from, to);
  const day = _qcWall(row).dayKey || '';
  if (!day) return true;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function openQcSettings() {
  if (typeof mbIsFirmAdmin === 'function' && !mbIsFirmAdmin()) return;
  window.__settingsTab = 'quality';
  if (typeof navigate === 'function') navigate('settings');
}

async function loadQcData() {
  const settingsBtn = document.getElementById('qc-settings-btn');
  if (settingsBtn) settingsBtn.style.display = (typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin()) ? '' : 'none';
  const qcSel = document.getElementById('qc-firm-selector');
  if (qcSel && typeof renderFirmSelector === 'function') {
    qcSel.style.display = typeof isSuperAdmin === 'function' && isSuperAdmin() ? '' : 'none';
    renderFirmSelector('qc-firm-selector', loadQcData);
  }
  const tbody = document.getElementById('qc-tbody');
  if (tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(10) : `<tr><td colspan="10" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  try {
    const fid = getActiveFirmId() || currentUser?.firm_id || null;
    const resultCfg = typeof loadFirmAppointmentResults === 'function'
      ? await loadFirmAppointmentResults(fid)
      : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
    window._qcResultCfg = resultCfg || [];
    window._qcResultMap = {};
    (window._qcResultCfg || []).forEach((r) => { window._qcResultMap[r.key] = r; });
    const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : (fid ? `&firm_id=eq.${fid}` : '');
    const cols = 'id,slot_id,contact_id,termin_tarih,durum,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,agent_notu,qc_notu,agent_id,campaign_id,customer_id,firm_id,form_ek';
    let dateQ = '';
    const from = document.getElementById('qc-date-from')?.value || '';
    const to = document.getElementById('qc-date-to')?.value || '';
    if (from && typeof mbInstantGte === 'function') dateQ += `&termin_tarih=gte.${mbInstantGte(from)}`;
    if (to && typeof mbInstantLte === 'function') dateQ += `&termin_tarih=lte.${mbInstantLte(to)}`;
    const embed = `appointments?select=${cols},users(name),campaigns(name),customers(name,code),takvim_slots!slot_id(tarih,baslangic_saat,bitis_saat,alta_tasindi)${ff}${dateQ}&order=termin_tarih.desc&limit=${QC_CAP}`;
    try {
      qcList = await sb(embed);
    } catch (e) {
      qcList = await sb(`appointments?select=${cols}${ff}${dateQ}&order=termin_tarih.desc&limit=${QC_CAP}`).catch(() => []);
    }
    qcList = qcList || [];
    window._qcCustomers = fid
      ? await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => [])
      : [];
    window._qcCampById = {};
    const camps = await sb(`campaigns?select=id,name,settings,field_config${ff}&limit=500`).catch(() => []);
    (camps || []).forEach((c) => { window._qcCampById[c.id] = c; });
    window._qcRecByContact = await _qcAttachRec(qcList);
    const cap = document.getElementById('qc-cap');
    if (cap) {
      const hit = qcList.length >= QC_CAP;
      cap.style.display = hit ? '' : 'none';
      cap.textContent = hit ? t('qc.cap').replace('{n}', String(QC_CAP)) : '';
    }
    if (!window._qcResultMap[qcTab] && qcTab !== 'all' && qcTab !== '__moved') qcTab = 'qc_bekleniyor';
    renderQcTable();
    const pending = qcList.filter((r) => _qcDurumKey(r) === 'qc_bekleniyor').length;
    const badge = document.getElementById('sb-badge-qc');
    if (badge) {
      badge.style.display = pending > 0 ? '' : 'none';
      badge.textContent = pending;
    }
    if (typeof loadJobMarketQcQueue === 'function') loadJobMarketQcQueue();
  } catch (e) {
    console.error('QC load err:', e);
  }
}

async function _qcAttachRec(rows) {
  const ids = [...new Set((rows || []).map((r) => r.contact_id).filter((id) => typeof isValidUUID !== 'function' || isValidUUID(id)))];
  const map = {};
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40).join(',');
    const logs = await sb(`call_logs?contact_id=in.(${chunk})&select=id,contact_id,recording_url,duration_sec&recording_url=not.is.null&order=started_at.desc&limit=400`).catch(() => []);
    (logs || []).forEach((log) => {
      if (!map[log.contact_id] && log.recording_url) map[log.contact_id] = log;
    });
  }
  return map;
}

function setQcTab(tab) {
  const alias = {
    'qc bekleniyor': 'qc_bekleniyor',
    'başarılı': 'basarili',
    'başarısız': 'basarisiz',
    beklemede: 'beklemede',
  };
  qcTab = alias[tab] || tab || 'qc_bekleniyor';
  renderQcTable();
}

function filterQcTable() { renderQcTable(); }

function _qcMatchesTab(row) {
  if (qcTab === '__moved') return _qcMoved(row);
  if (qcTab === 'all') return true;
  return _qcDurumKey(row) === qcTab;
}

function renderQcTabs(list) {
  const host = document.getElementById('qc-tabs');
  if (!host) return;
  const defs = window._qcResultCfg || [];
  const countOf = (key) => list.filter((row) => (key === 'all' ? true : key === '__moved' ? _qcMoved(row) : _qcDurumKey(row) === key)).length;
  const items = defs.map((def) => ({ key: def.key, label: _qcResultLabel(def.key), color: def.color || '' }));
  items.push({ key: '__moved', label: t('export.moved_down'), color: '#b91c1c' });
  items.push({ key: 'all', label: t('qc.all'), color: '' });
  host.innerHTML = items.map((item) => {
    const on = qcTab === item.key;
    const n = countOf(item.key);
    const dot = item.color ? `<span class="qc-dot" style="background:${_uiEsc(item.color)}"></span>` : '';
    return `<button type="button" class="qc-tab${on ? ' is-on' : ''}" data-key="${_uiEsc(item.key)}">${dot}<span>${_uiEsc(item.label)}</span><span class="qc-tab-n">${n}</span></button>`;
  }).join('');
  host.querySelectorAll('.qc-tab').forEach((btn) => {
    btn.onclick = () => setQcTab(btn.getAttribute('data-key'));
  });
}

function renderQcTable() {
  const tbody = document.getElementById('qc-tbody');
  if (!tbody) return;
  const canAssignField = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  const hasCustomers = (window._qcCustomers || []).length > 0;
  const search = (document.getElementById('qc-search')?.value || '').toLowerCase();
  let list = (qcList || []).filter((row) => _qcInDates(row));
  renderQcTabs(list);
  list = list.filter((row) => _qcMatchesTab(row));
  if (search) {
    list = list.filter((row) => {
      const camp = row.campaigns?.name || window._qcCampById?.[row.campaign_id]?.name || '';
      const blob = [
        row.nachname, row.telefonnummer, row.telefon2, row.plz, row.ortschaft,
        row.users?.name, camp, _qcResultLabel(_qcDurumKey(row)),
      ].join(' ').toLowerCase();
      return blob.includes(search);
    });
  }
  if (!list.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(10, 'ui.no_records') : `<tr><td colspan="10" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  const customerOptions = (window._qcCustomers || []).map((c) => `<option value="${_uiEsc(c.id)}">${_uiEsc(c.name || '')}</option>`).join('');
  tbody.innerHTML = list.map((row) => {
    const wall = _qcWall(row);
    const key = _qcDurumKey(row);
    const cfg = window._qcResultMap?.[key];
    const color = cfg?.color || 'var(--text-3)';
    const campName = row.campaigns?.name || window._qcCampById?.[row.campaign_id]?.name || '—';
    const agentName = row.users?.name || '—';
    const moved = _qcMoved(row) ? `<span class="qc-down">! ${_uiEsc(t('export.moved_short'))}</span>` : '';
    const rec = row.contact_id ? window._qcRecByContact?.[row.contact_id] : null;
    const recHtml = rec?.recording_url
      ? `<div style="display:flex;align-items:center;gap:4px;">
<audio id="aud-${_uiEsc(rec.id)}" src="${_uiEsc(rec.recording_url)}" preload="none" style="display:none;"></audio>
<button type="button" onclick="toggleAudio('${_uiEsc(rec.id)}')" class="icon-btn" title="${_uiEsc(t('qc.listen'))}"><i class="ph ph-play"></i></button>
<span style="font-size:10px;color:var(--text-3);">${rec.duration_sec ? `${Math.floor(rec.duration_sec / 60)}m${rec.duration_sec % 60}s` : ''}</span>
</div>`
      : '<span style="font-size:10px;color:var(--text-3);">—</span>';
    const selectedCustomer = row.customer_id || '';
    const custCell = hasCustomers
      ? `<select class="form-input" id="qc-customer-select-${_uiEsc(row.id)}" style="min-width:140px;max-width:180px;">
    <option value="">${_uiEsc(t('qc.customer_ph'))}</option>
    ${customerOptions.replace(`value="${_uiEsc(selectedCustomer)}"`, `value="${_uiEsc(selectedCustomer)}" selected`)}
  </select>`
      : `<span style="font-size:11px;">${_uiEsc(row.customers?.name || '—')}</span>`;
    const assignBtn = canAssignField
      ? `<button type="button" class="icon-btn" onclick="openFieldAssignModal('${_uiEsc(row.id)}','${_uiEsc(row.firm_id || '')}')" title="${_uiEsc(t('qc.field'))}"><i class="ph ph-map-pin"></i></button>`
      : '';
    const okBtn = window._qcResultMap?.basarili
      ? `<button type="button" class="icon-btn" style="border-color:var(--green);color:var(--green);" onclick="quickQcUpdate('${_uiEsc(row.id)}','basarili')" title="${_uiEsc(_qcResultLabel('basarili'))}"><i class="ph ph-check"></i></button>`
      : '';
    const noBtn = window._qcResultMap?.basarisiz
      ? `<button type="button" class="icon-btn" style="border-color:var(--red);color:var(--red);" onclick="quickQcUpdate('${_uiEsc(row.id)}','basarisiz')" title="${_uiEsc(_qcResultLabel('basarisiz'))}"><i class="ph ph-x"></i></button>`
      : '';
    return `<tr>
<td><div style="font-weight:700;color:var(--accent);">${_uiEsc(wall.time || '—')}</div><div style="font-size:11px;color:var(--text-3);margin-top:2px;">${_uiEsc(wall.day || '')}</div></td>
<td style="font-weight:600;cursor:pointer;" onclick="openQcDetail('${_uiEsc(row.id)}')">${_uiEsc(row.nachname || '—')}${moved}</td>
<td style="font-family:var(--mono);font-size:12px;">${_uiEsc(row.telefonnummer || '—')}</td>
<td style="font-family:var(--mono);font-size:12px;">${_uiEsc(row.plz || '—')}</td>
<td style="font-size:12px;">${_uiEsc(agentName)}</td>
<td><span class="qc-camp" title="${_uiEsc(campName)}">${_uiEsc(campName)}</span></td>
<td>${custCell}</td>
<td>${recHtml}</td>
<td><span style="font-size:11px;font-weight:700;color:${_uiEsc(color)};">${_uiEsc(_qcResultLabel(key))}</span></td>
<td><div style="display:flex;gap:3px;align-items:center;">
<button type="button" class="icon-btn" onclick="qcOpenPersonCard('${_uiEsc(row.id)}')" title="${_uiEsc(t('qc.card'))}"><i class="ph ph-user"></i></button>
<button type="button" class="icon-btn" onclick="openQcDetail('${_uiEsc(row.id)}')" title="${_uiEsc(t('qc.detail'))}"><i class="ph ph-magnifying-glass"></i></button>
${assignBtn}${okBtn}${noBtn}
</div></td>
</tr>`;
  }).join('');
}

function _qcFormHtml(row) {
  const camp = window._qcCampById?.[row.campaign_id] || {};
  const list = typeof _etFormList === 'function' ? _etFormList(camp) : [];
  return list.filter((field) => field.enabled !== false).map((field) => {
    const val = typeof _etFieldValue === 'function' ? _etFieldValue(row, field.key) : '';
    if (val == null || val === '') return '';
    return `<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(field.label || field.l || field.key)}</div><div style="font-weight:650;">${_uiEsc(val)}</div></div>`;
  }).filter(Boolean).join('');
}

function openQcDetail(id) {
  const row = (qcList || []).find((x) => x.id === id);
  if (!row) return;
  qcDetailId = id;
  const wall = _qcWall(row);
  const key = _qcDurumKey(row);
  const body = document.getElementById('qc-detail-body');
  const hasCustomers = (window._qcCustomers || []).length > 0;
  const canAssignField = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  const rec = row.contact_id ? window._qcRecByContact?.[row.contact_id] : null;
  const moved = _qcMoved(row) ? `<span class="qc-down">! ${_uiEsc(t('export.moved_short'))}</span>` : '';
  const campName = row.campaigns?.name || window._qcCampById?.[row.campaign_id]?.name || '—';
  const camp = window._qcCampById?.[row.campaign_id] || {};
  const fields = typeof takvimFieldsMarkup === 'function' ? takvimFieldsMarkup(camp, row, null, 'edit') : '';
  if (body) body.innerHTML = `
<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px;">
<div style="font-size:12px;color:var(--text-3);">${_uiEsc(wall.time || '—')} · ${_uiEsc(wall.day || '')} ${moved}</div>
<button type="button" class="btn btn-ghost btn-sm" onclick="qcOpenPersonCard('${_uiEsc(row.id)}')">${_uiEsc(t('qc.card'))}</button>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${fields}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-top:8px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.agent'))}</div><div style="font-weight:700;">${_uiEsc(row.users?.name || '—')}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.camp'))}</div><div class="qc-camp" style="font-weight:700;" title="${_uiEsc(campName)}">${_uiEsc(campName)}</div></div>
${row.agent_notu ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.agent_note'))}</div><div>${_uiEsc(row.agent_notu)}</div></div>` : ''}
${rec?.recording_url ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">${_uiEsc(t('qc.rec'))}</div><audio controls src="${_uiEsc(rec.recording_url)}" style="width:100%;"></audio></div>` : ''}
</div>
${hasCustomers ? `<div style="margin-top:10px;">
  <label class="form-label">${_uiEsc(t('qc.customer_ph'))}</label>
  <select class="form-input" id="qc-detail-customer" style="width:100%;">
    <option value="">${_uiEsc(t('qc.customer_ph'))}</option>
    ${(window._qcCustomers || []).map((c) => `<option value="${_uiEsc(c.id)}" ${row.customer_id === c.id ? 'selected' : ''}>${_uiEsc(c.name || '')}</option>`).join('')}
  </select>
</div>` : ''}
<div style="margin-top:10px;">
  <label class="form-label">${_uiEsc(t('qc.result'))}</label>
  <select class="form-input" id="qc-status-select" style="width:100%;">
    ${(window._qcResultCfg || []).map((s) => `<option value="${_uiEsc(s.key)}" ${key === s.key ? 'selected' : ''}>${_uiEsc(_qcResultLabel(s.key))}</option>`).join('')}
  </select>
</div>
<div style="margin-top:12px;">
<div style="font-size:10px;color:var(--text-3);font-weight:700;margin-bottom:4px;">${_uiEsc(t('qc.note'))}</div>
<textarea id="qc-note-input" class="form-input" rows="2" style="width:100%;resize:vertical;">${_uiEsc(row.qc_notu || '')}</textarea>
</div>
${canAssignField ? `<div style="margin-top:10px;display:flex;justify-content:flex-end;"><button type="button" class="btn btn-ghost btn-sm" onclick="openFieldAssignModal('${_uiEsc(row.id)}','${_uiEsc(row.firm_id || '')}')">${_uiEsc(t('qc.field'))}</button></div>` : ''}`;
  if (typeof openModal === 'function') openModal('m-qc-detail');
}

async function qcOpenPersonCard(apptId) {
  const row = (qcList || []).find((x) => x.id === apptId);
  if (!row?.contact_id) { toast(t('qc.no_contact'), 'warn'); return; }
  window._qcReviewApptId = apptId;
  selectedOutcome = _qcDurumKey(row) || null;
  if (typeof closeModal === 'function') closeModal('m-qc-detail');
  if (typeof openDialerForContact === 'function') await openDialerForContact(row.contact_id);
}

function mountQcReviewForm() {
  const id = window._qcReviewApptId;
  const old = document.getElementById('qc-review-form');
  if (!id) {
    old?.remove();
    return;
  }
  const row = (qcList || []).find((x) => x.id === id);
  const anchor = document.getElementById('cust-fields');
  if (!row || !anchor) return;
  const camp = window._qcCampById?.[row.campaign_id] || (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === row.campaign_id) || {};
  const fields = typeof takvimFieldsMarkup === 'function' ? takvimFieldsMarkup(camp, row, currentContact, 'edit') : '';
  const host = old || document.createElement('div');
  host.id = 'qc-review-form';
  host.innerHTML = `<div class="qc-review-form-title">${_uiEsc(t('qc.form'))}</div><div class="qc-review-form-grid">${fields}</div><div class="qc-review-form-hint">${_uiEsc(t('qc.form_hint'))}</div>`;
  if (!old) anchor.after(host);
  if (host.dataset.twin !== '1') {
    host.dataset.twin = '1';
    host.addEventListener('input', qcTwinFromForm);
    host.addEventListener('change', qcTwinFromForm);
  }
  if (typeof _qcApplyReviewNoteChrome === 'function') _qcApplyReviewNoteChrome();
}

let _qcTwinLock = false;

function qcTwinShown(value) {
  const text = String(value ?? '').trim();
  if (text === 'true') return 'Evet';
  if (text === 'false') return 'Hayır';
  return text;
}

function qcRememberTwin(key, value) {
  const text = String(value ?? '').trim();
  const row = (qcList || []).find((x) => x.id === window._qcReviewApptId);
  const col = typeof TAKVIM_APPT_COL !== 'undefined' ? TAKVIM_APPT_COL[key] : '';
  if (row && col) row[col] = text || null;
  else if (row && key !== 'attempt') {
    const ek = row.form_ek && typeof row.form_ek === 'object' ? { ...row.form_ek } : {};
    if (text) ek[key] = text;
    else delete ek[key];
    row.form_ek = ek;
  }
  if (!currentContact || key === 'attempt') return;
  if (key === 'name') {
    const parts = text.split(/\s+/).filter(Boolean);
    currentContact.first_name = parts.shift() || '';
    currentContact.last_name = parts.join(' ');
    return;
  }
  if (key === 'phone') { currentContact.phone = text; return; }
  if (['plz', 'city', 'address', 'phone2', 'notes'].includes(key)) { currentContact[key] = text; return; }
  const extra = { ...(currentContact.extra && typeof currentContact.extra === 'object' ? currentContact.extra : {}) };
  extra[key] = text;
  currentContact.extra = extra;
}

function qcPaintTop(key, value) {
  const shown = qcTwinShown(value);
  const valEl = document.getElementById(`cval-${key}`);
  if (valEl) {
    const editor = [...(valEl.parentElement?.children || [])].find((el) => el.tagName === 'INPUT');
    if (editor && document.activeElement !== editor) editor.value = shown;
    if (!editor || valEl.style.display !== 'none') valEl.textContent = shown || '—';
  }
  const nameEl = document.getElementById('cust-name');
  if (key === 'name' || nameEl?.dataset.headKey === key) {
    const span = nameEl?.querySelector('span');
    const first = document.getElementById('cust-edit-first');
    const last = document.getElementById('cust-edit-last');
    if (key === 'name' && first && last && document.activeElement !== first && document.activeElement !== last) {
      const parts = shown.split(/\s+/).filter(Boolean);
      first.value = parts.shift() || '';
      last.value = parts.join(' ');
    } else if (span && nameEl?.dataset.headKey === key) span.textContent = shown || '—';
    else if (nameEl && !span && nameEl.dataset.headKey === key && !nameEl.querySelector('input')) nameEl.textContent = shown || '—';
    if (key === 'name') {
      const av = document.querySelector('#cust-av .cust-av-inner');
      if (av && shown) av.textContent = shown.charAt(0).toUpperCase();
    }
  }
  const phoneEl = document.getElementById('cust-phone');
  if (phoneEl?.dataset.headKey === key && !phoneEl.querySelector('input')) phoneEl.textContent = shown || '—';
}

function qcSyncTwin(key, value, source, opts) {
  if (!window._qcReviewApptId || !key || key === 'attempt' || _qcTwinLock) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return;
  _qcTwinLock = true;
  try {
    const text = String(value ?? '');
    if (source !== 'top') qcPaintTop(key, text);
    if (source !== 'form') {
      const el = document.querySelector(`#qc-review-form [data-takvim-key="${key}"]`);
      if (el && document.activeElement !== el) el.value = text;
    }
    if (!opts?.domOnly) qcRememberTwin(key, text);
  } finally {
    _qcTwinLock = false;
  }
}

function qcContactFromForm(extra) {
  const body = extra?.body || {};
  const patch = {};
  if ('nachname' in body) {
    const parts = String(body.nachname || '').trim().split(/\s+/).filter(Boolean);
    patch.first_name = parts.shift() || '';
    patch.last_name = parts.join(' ');
  }
  if ('telefonnummer' in body) patch.phone = body.telefonnummer || '';
  if ('telefon2' in body) patch.phone2 = body.telefon2 || '';
  if ('plz' in body) patch.plz = body.plz || '';
  if ('ortschaft' in body) patch.city = body.ortschaft || '';
  if ('strasse' in body) patch.address = body.strasse || '';
  return patch;
}

function qcTwinFromForm(ev) {
  const el = ev.target?.closest?.('[data-takvim-key]');
  if (!el || el.hasAttribute('readonly')) return;
  qcSyncTwin(el.getAttribute('data-takvim-key'), el.value, 'form');
}

async function qcUpdateStatus(status) {
  if (!qcDetailId) return;
  const root = document.getElementById('qc-detail-body');
  const row = (qcList || []).find((x) => x.id === qcDetailId);
  if (root && row && typeof takvimCollectPatch === 'function') window._qcDetailPatch = takvimCollectPatch(root, row);
  const selected = document.getElementById('qc-status-select')?.value || '';
  const ok = await quickQcUpdate(qcDetailId, selected || status);
  if (ok && typeof closeModal === 'function') closeModal('m-qc-detail');
}

async function quickQcUpdate(apptId, status) {
  const row = (qcList || []).find((x) => x.id === apptId);
  if (!row) { toast(t('qc.missing'), 'err'); return false; }
  const resultKey = typeof _normResultKey === 'function' ? _normResultKey(status || '') : String(status || '');
  const resultCfg = window._qcResultMap?.[resultKey];
  if (!resultKey || !resultCfg) { toast(t('qc.missing'), 'err'); return false; }
  const contactStatus = resultCfg.contact_status || (typeof appointmentResultToContactStatus === 'function' ? appointmentResultToContactStatus(resultKey) : resultKey);
  const detailOpen = qcDetailId === apptId && document.getElementById('qc-note-input');
  const reviewNote = window._qcReviewNote;
  const note = reviewNote != null ? String(reviewNote) : (detailOpen ? String(document.getElementById('qc-note-input').value || '') : null);
  const custEl = document.getElementById(`qc-customer-select-${apptId}`) || (detailOpen ? document.getElementById('qc-detail-customer') : null);
  const customerId = custEl ? String(custEl.value || '') : '';
  try {
    const apptPatch = { durum: resultKey };
    const extra = window._qcDetailPatch;
    window._qcDetailPatch = null;
    if (extra && (qcDetailId === apptId || window._qcReviewApptId === apptId)) {
      Object.assign(apptPatch, extra.body || {});
      apptPatch.durum = resultKey;
      if (extra.ek && typeof extra.ek === 'object') apptPatch.form_ek = extra.ek;
    }
    if (customerId) apptPatch.customer_id = customerId;
    if (note !== null) apptPatch.qc_notu = note;
    await sb(`appointments?id=eq.${apptId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(apptPatch) });
    if (extra?.contactExtra && row.contact_id && typeof takvimSaveContactExtras === 'function') {
      await takvimSaveContactExtras(row.contact_id, extra.contactExtra).catch(() => {});
    }
    if (row.contact_id && contactStatus) {
      const contactPatch = { status: contactStatus };
      if (extra && (qcDetailId === apptId || window._qcReviewApptId === apptId)) Object.assign(contactPatch, qcContactFromForm(extra));
      await sb(`contacts?id=eq.${row.contact_id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(contactPatch),
      }).catch(() => {});
    }
    if (row.contact_id) {
      const logs = await sb(`call_logs?contact_id=eq.${row.contact_id}&select=id&order=started_at.desc&limit=1`).catch(() => []);
      if (logs?.[0]?.id) {
        await sb(`call_logs?id=eq.${logs[0].id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ qc_by: currentUser?.id || null, qc_at: new Date().toISOString(), qc_result: resultKey }),
        }).catch(() => {});
      }
    }
    const slot = _qcSlot(row);
    if (resultCfg.auto_move_down && slot?.id && !_qcMoved(row)) {
      await sb(`takvim_slots?id=eq.${slot.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ alta_tasindi: true, durum: 'dolu' }),
      }).catch(() => {});
    }
    let apptDate = '';
    let apptTime = '';
    if (slot) {
      apptDate = slot.tarih || '';
      apptTime = String(slot.baslangic_saat || '').slice(0, 5);
    }
    if (typeof opsAnnounceQc === 'function') {
      opsAnnounceQc({
        id: apptId,
        nachname: row.nachname || '',
        campaign_id: row.campaign_id,
        tarih: apptDate,
        baslangic_saat: apptTime,
      }, resultKey);
    }
    toast(t('qc.saved'), 'ok');
    if (resultKey === 'basarili') {
      const phone = row.telefonnummer || '';
      let explicit = false;
      if (row.campaign_id && typeof getCampSettings === 'function') {
        const camp = window._qcCampById?.[row.campaign_id] || {};
        const cs = getCampSettings(camp);
        explicit = typeof cs.notif_sms === 'boolean' || typeof cs.notif_whatsapp === 'boolean' || typeof cs.notif_email === 'boolean';
      }
      if (!explicit && phone && typeof showQcSmsPrompt === 'function') {
        await showQcSmsPrompt(phone, row.nachname || '', apptDate, apptTime);
      }
    }
    await loadQcData();
    return true;
  } catch (e) {
    toast(t('qc.fail') + (e.message || ''), 'err');
    return false;
  }
}
