// ─────────────────────────────────────────────
// Termin dışa aktarım — filtre, çoklu seçim, XLSX
// ─────────────────────────────────────────────

let _etProcessed = [];
let _etFiltered = [];
let _etSelectedIds = new Set();
let _etKampSel = new Set();
let _etStatSel = new Set();
let _etResultDefs = [];

function _etFmtInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _etDefaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  const to = new Date(today);
  to.setDate(to.getDate() + 30);
  return { from: _etFmtInputDate(from), to: _etFmtInputDate(to) };
}

function _etWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), diffToMonday);
  const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
  return { from: _etFmtInputDate(startOfWeek), to: _etFmtInputDate(endOfWeek) };
}

function _etNormDurum(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'qc_bekleniyor';
  if (typeof contactStatusToAppointmentResult === 'function') {
    return _normResultKey(contactStatusToAppointmentResult(s));
  }
  return _normResultKey(s);
}

function _etDurumLabel(key) {
  const d = _etResultDefs.find((x) => x.key === key);
  if (d?.label) return d.label;
  return key || '—';
}

function _etBadgeColor(key) {
  const d = _etResultDefs.find((x) => x.key === key);
  const c = d?.color && /^#[0-9a-fA-F]{6}$/.test(String(d.color)) ? d.color : '#64748b';
  return c;
}

function _etShowLoading(on, msg) {
  const ov = document.getElementById('et-loading');
  const t = document.getElementById('et-loading-text');
  if (t && msg) t.textContent = msg;
  if (ov) ov.style.display = on ? 'flex' : 'none';
}

async function _etFetchRows(from, to) {
  const ff = getFirmFilter('&');
  if (isSuperAdmin() && !getActiveFirmId()) {
    toast(currentLang === 'de' ? 'Bitte Firma wählen' : 'Önce firma seçin', 'warn');
    return [];
  }
  const cols =
    'id,termin_tarih,durum,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,agent_notu,agent_id,campaign_id,customer_id,firm_id';
  let q = `appointments?select=${cols},users(name),campaigns(name),customers(name,code)${ff}`;
  q += `&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&order=termin_tarih.asc&limit=15000`;
  let rows;
  try {
    rows = await sb(q);
  } catch (e) {
    q = `appointments?select=${cols}${ff}&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&order=termin_tarih.asc&limit=15000`;
    rows = await sb(q).catch(() => []);
    if (!rows?.length) return [];
    const aIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
    const cIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))];
    const uIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const uMap = {};
    const campMap = {};
    const custMap = {};
    if (aIds.length) {
      const uu = await sb(`users?id=in.(${aIds.join(',')})&select=id,name`).catch(() => []);
      (uu || []).forEach((u) => { uMap[u.id] = u; });
    }
    if (cIds.length) {
      const cc = await sb(`campaigns?id=in.(${cIds.join(',')})&select=id,name`).catch(() => []);
      (cc || []).forEach((c) => { campMap[c.id] = c; });
    }
    if (uIds.length) {
      const kk = await sb(`customers?id=in.(${uIds.join(',')})&select=id,name,code`).catch(() => []);
      (kk || []).forEach((k) => { custMap[k.id] = k; });
    }
    rows = rows.map((r) => ({
      ...r,
      users: r.agent_id && uMap[r.agent_id] ? { name: uMap[r.agent_id].name } : null,
      campaigns: r.campaign_id && campMap[r.campaign_id] ? { name: campMap[r.campaign_id].name } : null,
      customers: r.customer_id && custMap[r.customer_id] ? custMap[r.customer_id] : null,
    }));
  }
  return rows || [];
}

function _etProcess(rows) {
  return (rows || []).map((r) => {
    const dt = r.termin_tarih ? new Date(r.termin_tarih) : null;
    const kampName = r.campaigns?.name ? String(r.campaigns.name) : '—';
    const agentName = r.users?.name ? String(r.users.name) : '';
    let custLabel = '';
    if (r.customers) {
      custLabel = r.customers.code
        ? `${r.customers.code} · ${r.customers.name || ''}`.trim()
        : String(r.customers.name || '');
    }
    return {
      id: r.id,
      raw: r,
      terminDate: dt,
      nachname: r.nachname || '—',
      telefon: String(r.telefonnummer || r.telefon2 || '').trim(),
      strasse: r.strasse || '',
      plz: r.plz || '',
      ortschaft: r.ortschaft || '',
      kampName,
      durumKey: _etNormDurum(r.durum),
      agentName,
      agentId: r.agent_id || '',
      customerId: r.customer_id ? String(r.customer_id) : '',
      custLabel: custLabel || '—',
    };
  }).sort((a, b) => (a.terminDate?.getTime() || 0) - (b.terminDate?.getTime() || 0));
}

function _etUpdateKampCount() {
  const el = document.getElementById('et-kamp-count');
  if (el) el.textContent = String(_etKampSel.size);
}

function _etBuildKampagneList() {
  const container = document.getElementById('et-kamp-list');
  if (!container) return;
  const stats = {};
  _etProcessed.forEach((e) => {
    const k = e.kampName || '—';
    stats[k] = (stats[k] || 0) + 1;
  });
  const list = Object.keys(stats).sort((a, b) => a.localeCompare(b, 'tr'));
  container.innerHTML = '';
  list.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'et-kamp-item';
    item.dataset.name = name;
    const sel = _etKampSel.has(name);
    if (sel) item.classList.add('et-kamp-sel');
    item.innerHTML = `
<input type="checkbox" class="et-kamp-cb" ${sel ? 'checked' : ''}/>
<span class="et-kamp-lbl">${_uiEsc(name)}</span>
<span class="et-kamp-n">0</span>`;
    item.onclick = (ev) => {
      if (ev.target.classList?.contains('et-kamp-cb')) return;
      const cb = item.querySelector('.et-kamp-cb');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const cb = item.querySelector('.et-kamp-cb');
    cb.onchange = () => {
      if (cb.checked) {
        _etKampSel.add(name);
        item.classList.add('et-kamp-sel');
      } else {
        _etKampSel.delete(name);
        item.classList.remove('et-kamp-sel');
      }
      _etUpdateKampCount();
      etApplyFilter();
    };
    container.appendChild(item);
  });
  _etUpdateKampVisibility();
}

function _etUpdateKampVisibility() {
  const stats = {};
  let base = _etProcessed.slice();
  const df = document.getElementById('et-date-from')?.value;
  const dt = document.getElementById('et-date-to')?.value;
  const agentVal = document.getElementById('et-agent')?.value || '';
  const custVal = document.getElementById('et-customer')?.value || '';
  base = base.filter((e) => {
    if (df) {
      const s = new Date(df);
      s.setHours(0, 0, 0, 0);
      if (e.terminDate && e.terminDate < s) return false;
    }
    if (dt) {
      const end = new Date(dt);
      end.setHours(23, 59, 59, 999);
      if (e.terminDate && e.terminDate > end) return false;
    }
    if (_etStatSel.size && !_etStatSel.has(e.durumKey)) return false;
    if (agentVal && String(e.agentId) !== agentVal) return false;
    if (custVal && String(e.customerId) !== custVal) return false;
    return true;
  });
  base.forEach((e) => {
    const k = e.kampName || '—';
    stats[k] = (stats[k] || 0) + 1;
  });
  document.querySelectorAll('.et-kamp-item').forEach((item) => {
    const name = item.dataset.name;
    const count = stats[name] || 0;
    const nEl = item.querySelector('.et-kamp-n');
    if (nEl) nEl.textContent = String(count);
    if (count === 0 && !_etKampSel.has(name)) item.style.display = 'none';
    else item.style.display = 'flex';
  });
}

function _etBuildStatusGrid() {
  const container = document.getElementById('et-status-grid');
  if (!container) return;
  const stats = {};
  _etProcessed.forEach((e) => {
    const k = e.durumKey;
    stats[k] = (stats[k] || 0) + 1;
  });
  const keys = _etResultDefs.length
    ? _etResultDefs.map((r) => r.key)
    : ['qc_bekleniyor', 'basarili', 'basarisiz', 'beklemede', 'ulasilamadi', 'iptal'];
  container.innerHTML = '';
  keys.forEach((key) => {
    const lbl = _etDurumLabel(key);
    const cnt = stats[key] || 0;
    const sel = _etStatSel.has(key);
    const row = document.createElement('div');
    row.className = 'et-stat-item' + (sel ? ' et-stat-sel' : '');
    row.dataset.key = key;
    row.innerHTML = `<span class="et-stat-dot" style="background:${_etBadgeColor(key)}"></span><span class="et-stat-lbl">${_uiEsc(lbl)}</span><span class="et-stat-n">${cnt}</span>`;
    row.onclick = () => {
      if (_etStatSel.has(key)) _etStatSel.delete(key);
      else _etStatSel.add(key);
      row.classList.toggle('et-stat-sel', _etStatSel.has(key));
      etApplyFilter();
    };
    container.appendChild(row);
  });
}

function _etUpdateStatusCounts(base) {
  const stats = {};
  base.forEach((e) => {
    stats[e.durumKey] = (stats[e.durumKey] || 0) + 1;
  });
  document.querySelectorAll('.et-stat-item').forEach((item) => {
    const key = item.dataset.key;
    const n = item.querySelector('.et-stat-n');
    if (n) n.textContent = String(stats[key] || 0);
  });
}

function _etFillAgentSelect() {
  const sel = document.getElementById('et-agent');
  if (!sel) return;
  const cur = sel.value;
  const byId = new Map();
  _etProcessed.forEach((e) => {
    if (e.agentId && e.agentName) byId.set(String(e.agentId), e.agentName);
  });
  const opts = Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  sel.innerHTML = `<option value="">${currentLang === 'de' ? 'Alle Agenten' : 'Tüm agentler'}</option>`;
  opts.forEach(([id, name]) => {
    sel.innerHTML += `<option value="${String(id).replace(/"/g, '')}">${_uiEsc(name)}</option>`;
  });
  if (cur && [...byId.keys()].includes(cur)) sel.value = cur;
}

async function _etFillCustomerSelect() {
  const sel = document.getElementById('et-customer');
  if (!sel) return;
  const cur = sel.value;
  const m = new Map();
  _etProcessed.forEach((e) => {
    if (e.customerId) m.set(e.customerId, e.custLabel);
  });
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (fid) {
    const all = await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc&limit=300`).catch(() => []);
    (all || []).forEach((c) => {
      if (!m.has(c.id)) {
        const label = c.code ? `${c.code} · ${c.name || ''}`.trim() : String(c.name || '');
        m.set(c.id, label || '—');
      }
    });
  }
  sel.innerHTML = `<option value="">${currentLang === 'de' ? 'Alle Kunden' : 'Tüm müşteriler'}</option>`;
  Array.from(m.entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
    .forEach(([id, label]) => {
      sel.innerHTML += `<option value="${String(id).replace(/"/g, '&quot;')}">${_uiEsc(label)}</option>`;
    });
  if (cur && m.has(cur)) sel.value = cur;
}

async function _etBuildShortcuts() {
  const host = document.getElementById('et-shortcuts');
  if (!host) return;
  const fid = getActiveFirmId() || currentUser?.firm_id;
  if (!fid) {
    host.innerHTML = '';
    return;
  }
  let customers = [];
  try {
    customers = await sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc&limit=200`) || [];
  } catch (e) {
    customers = [];
  }
  if (!customers.length) {
    host.innerHTML = `<div style="font-size:11px;color:var(--text-3);">${currentLang === 'de' ? 'Keine Kunden für Schnellwahl.' : 'Kısayol için müşteri yok.'}</div>`;
    return;
  }
  host.innerHTML = `<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${currentLang === 'de' ? 'Diese Woche · erfolgreich · Kunde' : 'Bu hafta · başarılı · müşteri'}</div>
<div style="display:flex;flex-wrap:wrap;gap:8px;">${customers.map((c) => {
  const lab = c.code ? `${c.code} · ${c.name || ''}` : (c.name || c.id);
  return `<button type="button" class="btn btn-ghost btn-sm" style="border-color:var(--accent);color:var(--accent);" onclick="exportTerminShortcutWeekSuccess('${c.id}')">${_uiEsc(lab)}</button>`;
}).join('')}</div>`;
}

function etApplyFilter() {
  const df = document.getElementById('et-date-from')?.value;
  const dt = document.getElementById('et-date-to')?.value;
  const agentVal = document.getElementById('et-agent')?.value || '';
  const custVal = document.getElementById('et-customer')?.value || '';

  let base = _etProcessed.filter((e) => {
    if (df) {
      const s = new Date(df);
      s.setHours(0, 0, 0, 0);
      if (e.terminDate && e.terminDate < s) return false;
    }
    if (dt) {
      const end = new Date(dt);
      end.setHours(23, 59, 59, 999);
      if (e.terminDate && e.terminDate > end) return false;
    }
    if (_etStatSel.size && !_etStatSel.has(e.durumKey)) return false;
    if (agentVal && String(e.agentId) !== agentVal) return false;
    if (custVal && String(e.customerId) !== custVal) return false;
    return true;
  });

  _etUpdateKampVisibility();
  _etUpdateStatusCounts(base);

  if (_etKampSel.size) {
    _etFiltered = base.filter((e) => _etKampSel.has(e.kampName || '—'));
  } else {
    _etFiltered = base;
  }

  etRenderTable();
}

function etRenderTable() {
  const tbody = document.getElementById('et-tbody');
  const rc = document.getElementById('et-results-count');
  const sc = document.getElementById('et-selected-count');
  const dl = document.getElementById('et-download');
  const dlc = document.getElementById('et-download-count');
  const hh = document.getElementById('et-header-check');
  if (!tbody) return;

  if (!_etFiltered.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(9, 'ui.no_termin') : `<tr><td colspan="9" class="mb-empty-hint" style="padding:40px;">${t('ui.no_termin')}</td></tr>`;
    if (rc) rc.textContent = '0';
    if (sc) sc.textContent = '0';
    if (dl) dl.disabled = true;
    if (dlc) dlc.textContent = '0';
    if (hh) hh.checked = false;
    return;
  }

  if (rc) rc.textContent = String(_etFiltered.length);
  tbody.innerHTML = '';
  _etFiltered.forEach((e) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const isSel = _etSelectedIds.has(e.id);
    if (isSel) tr.style.background = 'var(--accent-soft)';
    let timeStr = '—';
    let dayStr = '';
    if (e.terminDate && !isNaN(e.terminDate.getTime())) {
      const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
      timeStr = e.terminDate.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
      dayStr = e.terminDate.toLocaleDateString(loc, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    let tel = e.telefon || '—';
    if (tel === '0' || tel === '0.00') tel = '—';
    const addr = [e.strasse, [e.plz, e.ortschaft].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const durumLbl = _etDurumLabel(e.durumKey);
    const badgeBg = _etBadgeColor(e.durumKey);
    tr.innerHTML = `
<td data-label="Seç" style="text-align:center;"><input type="checkbox" class="et-row-cb" data-id="${e.id}" ${isSel ? 'checked' : ''}/></td>
<td data-label="Tarih / saat"><div style="font-weight:700;color:var(--accent);">${_uiEsc(timeStr)}</div><div style="font-size:11px;color:var(--text-3);">${_uiEsc(dayStr)}</div></td>
<td data-label="Müşteri" style="font-weight:600;">${_uiEsc(e.nachname)}</td>
<td data-label="Telefon">${_uiEsc(tel)}</td>
<td data-label="Adres" style="max-width:220px;font-size:12px;">${_uiEsc(addr)}</td>
<td data-label="Kampanya"><span class="badge" style="background:var(--accent);color:#fff;font-size:10px;">${_uiEsc(e.kampName)}</span></td>
<td data-label="Durum"><span class="badge" style="background:${badgeBg};color:#fff;font-size:10px;">${_uiEsc(durumLbl)}</span></td>
<td data-label="Agent">${_uiEsc(e.agentName || '—')}</td>
<td data-label="Atanan müşteri" style="font-size:12px;">${_uiEsc(e.custLabel)}</td>`;
    const cb = tr.querySelector('.et-row-cb');
    cb.onchange = () => {
      if (cb.checked) _etSelectedIds.add(e.id);
      else _etSelectedIds.delete(e.id);
      tr.style.background = cb.checked ? 'var(--accent-soft)' : '';
      etUpdateSelectionUi();
    };
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('input[type=checkbox]')) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
    tbody.appendChild(tr);
  });
  etUpdateSelectionUi();
}

function etUpdateSelectionUi() {
  const sc = document.getElementById('et-selected-count');
  const dl = document.getElementById('et-download');
  const dlc = document.getElementById('et-download-count');
  const hh = document.getElementById('et-header-check');
  const nSel = _etSelectedIds.size;
  const nShow = nSel > 0 ? nSel : _etFiltered.length;
  if (sc) sc.textContent = String(nSel);
  if (dlc) dlc.textContent = String(nShow);
  if (dl) dl.disabled = nShow === 0;
  if (hh && _etFiltered.length) {
    hh.checked = _etFiltered.every((e) => _etSelectedIds.has(e.id));
  } else if (hh) hh.checked = false;
}

function etSelectAllFiltered() {
  _etFiltered.forEach((e) => _etSelectedIds.add(e.id));
  etRenderTable();
}

function etDeselectAll() {
  _etSelectedIds.clear();
  etRenderTable();
}

function etInvertSelection() {
  _etFiltered.forEach((e) => {
    if (_etSelectedIds.has(e.id)) _etSelectedIds.delete(e.id);
    else _etSelectedIds.add(e.id);
  });
  etRenderTable();
}

function etToggleHeaderAll() {
  const hh = document.getElementById('et-header-check');
  if (hh?.checked) etSelectAllFiltered();
  else etDeselectAll();
}

function etSelectAllKamp() {
  document.querySelectorAll('.et-kamp-item').forEach((item) => {
    if (item.style.display === 'none') return;
    const name = item.dataset.name;
    _etKampSel.add(name);
    item.classList.add('et-kamp-sel');
    const cb = item.querySelector('.et-kamp-cb');
    if (cb) cb.checked = true;
  });
  _etUpdateKampCount();
  etApplyFilter();
}

function etDeselectAllKamp() {
  _etKampSel.clear();
  document.querySelectorAll('.et-kamp-item').forEach((item) => {
    item.classList.remove('et-kamp-sel');
    const cb = item.querySelector('.et-kamp-cb');
    if (cb) cb.checked = false;
  });
  _etUpdateKampCount();
  etApplyFilter();
}

function etResetFilters(reload) {
  const r = _etDefaultRange();
  const df = document.getElementById('et-date-from');
  const dt = document.getElementById('et-date-to');
  if (df) df.value = r.from;
  if (dt) dt.value = r.to;
  _etKampSel.clear();
  _etStatSel.clear();
  _etSelectedIds.clear();
  const ag = document.getElementById('et-agent');
  const cu = document.getElementById('et-customer');
  if (ag) ag.value = '';
  if (cu) cu.value = '';
  if (reload) etReload();
  else etApplyFilter();
}

async function etReload() {
  const df = document.getElementById('et-date-from')?.value;
  const dt = document.getElementById('et-date-to')?.value;
  if (!df || !dt) {
    toast(currentLang === 'de' ? 'Datumsbereich wählen' : 'Tarih aralığı seçin', 'warn');
    return;
  }
  _etShowLoading(true, currentLang === 'de' ? 'Laden…' : 'Yükleniyor…');
  try {
    const rows = await _etFetchRows(df, dt);
    _etProcessed = _etProcess(rows);
    _etSelectedIds.clear();
    _etFillAgentSelect();
    await _etFillCustomerSelect();
    _etBuildKampagneList();
    _etBuildStatusGrid();
    etApplyFilter();
  } finally {
    _etShowLoading(false);
  }
}

function exportTerminShortcutWeekSuccess(customerId) {
  const w = _etWeekRange();
  const df = document.getElementById('et-date-from');
  const dt = document.getElementById('et-date-to');
  if (df) df.value = w.from;
  if (dt) dt.value = w.to;
  _etKampSel.clear();
  document.querySelectorAll('.et-kamp-item').forEach((item) => {
    item.classList.remove('et-kamp-sel');
    const cb = item.querySelector('.et-kamp-cb');
    if (cb) cb.checked = false;
  });
  _etUpdateKampCount();
  _etStatSel.clear();
  _etStatSel.add('basarili');
  const ag = document.getElementById('et-agent');
  if (ag) ag.value = '';
  const cu = document.getElementById('et-customer');
  if (cu) cu.value = String(customerId || '');
  etReload();
}

function exportTerminXlsx() {
  if (typeof XLSX === 'undefined') {
    toast(currentLang === 'de' ? 'Excel fehlt' : 'Excel kütüphanesi yok', 'err');
    return;
  }
  if (!_etFiltered.length) {
    toast(t('ui.no_rows_export'), 'warn');
    return;
  }
  const use = _etSelectedIds.size
    ? _etFiltered.filter((e) => _etSelectedIds.has(e.id))
    : _etFiltered.slice();
  if (!use.length) {
    toast(currentLang === 'de' ? 'Keine Auswahl' : 'Seçim yok', 'warn');
    return;
  }
  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  const excelData = use.map((e) => {
    const r = e.raw;
    let tDate = '';
    let tTime = '';
    if (e.terminDate && !isNaN(e.terminDate.getTime())) {
      tDate = e.terminDate.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
      tTime = e.terminDate.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    }
    const pv = r.interesse_an_pv === true ? (currentLang === 'de' ? 'Ja' : 'Evet') : r.interesse_an_pv === false ? (currentLang === 'de' ? 'Nein' : 'Hayır') : '';
    return {
      'Termin': `${tDate} ${tTime}`.trim(),
      'Ad Soyad': e.nachname || '',
      'Sokak': r.strasse || '',
      'PLZ': r.plz || '',
      'İlçe/Şehir': r.ortschaft || '',
      'Telefon': e.telefon || '',
      'Baujahr': r.baujahr || '',
      'Hausart': r.hausart || '',
      'm²': r.qm || '',
      'Heizung': r.heizung || '',
      'Heizung Alter': r.alter_der_heizung || '',
      'Verbrauch/Jahr': r.verbrauch_pro_jahr || '',
      'Personen': r.personen || '',
      'PV Interesse': pv,
      'Agent Notu': r.agent_notu || '',
      'Agent': e.agentName || '',
      'Müşteri': e.custLabel || '',
      'Kampagne': e.kampName || '',
      'Durum': _etDurumLabel(e.durumKey),
    };
  });
  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Termine');
  const datePart = document.getElementById('et-date-from')?.value || new Date().toISOString().slice(0, 10);
  let kampagnePart = '';
  if (_etKampSel.size === 1) kampagnePart = `_${Array.from(_etKampSel)[0].replace(/\s+/g, '')}`;
  else if (_etKampSel.size > 1) kampagnePart = `_${_etKampSel.size}Kampanya`;
  XLSX.writeFile(wb, `termin_export_${datePart}${kampagnePart}.xlsx`);
  toast(currentLang === 'de' ? 'Excel gespeichert' : 'Excel indirildi', 'ok');
}

async function loadExportTerminPage() {
  if (typeof isExportAdmin === 'function' && !isExportAdmin()) {
    toast(currentLang === 'de' ? 'Keine Berechtigung' : 'Yetki yok', 'warn');
    navigate('dashboard');
    return;
  }
  const firmHost = document.getElementById('et-firm-wrap');
  if (firmHost && typeof renderFirmSelector === 'function') {
    renderFirmSelector('et-firm-wrap', loadExportTerminPage);
  }
  const df = document.getElementById('et-date-from');
  const dt = document.getElementById('et-date-to');
  if (df && !df.value && dt && !dt.value) {
    const r = _etDefaultRange();
    df.value = r.from;
    dt.value = r.to;
  }
  const fid = getActiveFirmId() || currentUser?.firm_id;
  _etResultDefs = fid ? await loadFirmAppointmentResults(fid) : defaultAppointmentResults();
  await _etBuildShortcuts();
  await etReload();
  if (typeof applyLang === 'function') applyLang();
}
