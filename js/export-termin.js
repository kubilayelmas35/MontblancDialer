// ─────────────────────────────────────────────
// Termin dışa aktarım — filtre, çoklu seçim, XLSX
// ─────────────────────────────────────────────

let _etPageBusy = false;
let _etProcessed = [];
let _etFiltered = [];
let _etSelectedIds = new Set();
let _etKampSel = new Set();
let _etStatSel = new Set();
let _etResultDefs = [];
let _etResultByFirm = {};
let _etCampById = {};
let _etCols = [];
let _etColsTouched = false;
let _etLayouts = [];
let _etLayoutName = '';
let _etLayoutsReady = false;
let _etMovedOnly = false;

function _etFmtInputDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function _etToday() {
  return typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
}

function _etShift(day, delta) {
  return typeof mbShiftDate === 'function' ? mbShiftDate(day, delta) : day;
}

function _etDefaultRange() {
  const today = _etToday();
  return { from: _etShift(today, -7), to: _etShift(today, 30) };
}

function _etWeekRange() {
  const today = _etToday();
  const p = String(today).split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  const from = _etShift(today, -back);
  return { from, to: _etShift(from, 6) };
}

function _etBounds(from, to) {
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
  return { gte, lte };
}

function _etNormDurum(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'qc_bekleniyor';
  if (typeof contactStatusToAppointmentResult === 'function') {
    return _normResultKey(contactStatusToAppointmentResult(s));
  }
  return _normResultKey(s);
}

function _etDurumLabel(key, firmId) {
  const list = (firmId && _etResultByFirm[firmId]) || _etResultDefs;
  const d = (list || []).find((x) => x.key === key);
  if (d?.label) return d.label;
  const any = Object.values(_etResultByFirm).map((rows) => (rows || []).find((x) => x.key === key)?.label).find(Boolean);
  return any || key || '—';
}

function _etChipLabel(key) {
  const labels = [];
  Object.values(_etResultByFirm).forEach((list) => {
    const label = (list || []).find((x) => x.key === key)?.label;
    if (label && !labels.includes(label)) labels.push(label);
  });
  if (!labels.length) return _etDurumLabel(key);
  return labels.join(' / ');
}

function _etStatusKeys() {
  const keys = [];
  const push = (key) => { if (key && !keys.includes(key)) keys.push(key); };
  const lists = Object.values(_etResultByFirm);
  (lists.length ? lists : [_etResultDefs]).forEach((list) => (list || []).forEach((row) => push(row.key)));
  _etProcessed.forEach((row) => push(row.durumKey));
  return keys;
}

function _etBadgeColor(key) {
  const pool = Object.values(_etResultByFirm).flat();
  const d = (pool.length ? pool : _etResultDefs).find((x) => x.key === key);
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
  const cols =
    'id,slot_id,termin_tarih,kayit_tarihi,durum,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,agent_notu,qc_notu,agent_id,campaign_id,customer_id,firm_id,form_ek';
  const bounds = _etBounds(from, to);
  let q = `appointments?select=${cols},users(name),campaigns(name),customers(name,code),takvim_slots!slot_id(tarih,baslangic_saat,bitis_saat,alta_tasindi)${ff}`;
  q += `&termin_tarih=gte.${bounds.gte}&termin_tarih=lte.${bounds.lte}&order=termin_tarih.asc&limit=15000`;
  let rows;
  try {
    rows = await sb(q);
  } catch (e) {
    q = `appointments?select=${cols}${ff}&termin_tarih=gte.${bounds.gte}&termin_tarih=lte.${bounds.lte}&order=termin_tarih.asc&limit=15000`;
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
    const slot = Array.isArray(r.takvim_slots) ? r.takvim_slots[0] : r.takvim_slots;
    const wall = _etWall(r.termin_tarih, slot);
    const dt = wall.sort ? new Date(wall.sort) : (r.termin_tarih ? new Date(r.termin_tarih) : null);
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
      dayKey: wall.dayKey,
      whenTime: wall.time,
      whenDay: wall.day,
      whenText: wall.text,
      nachname: r.nachname || '—',
      telefon: String(r.telefonnummer || r.telefon2 || '').trim(),
      strasse: r.strasse || '',
      plz: r.plz || '',
      ortschaft: r.ortschaft || '',
      kampName,
      durumKey: _etNormDurum(r.durum),
      movedDown: !!(slot && (slot.alta_tasindi === true || slot.alta_tasindi === 'true' || slot.alta_tasindi === 't')),
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
    if (!_etInRange(e, df, dt)) return false;
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
  const keys = _etStatusKeys();
  container.innerHTML = '';
  keys.forEach((key) => {
    const lbl = _etChipLabel(key);
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
  const moved = _etProcessed.filter((row) => row.movedDown).length;
  const chip = document.createElement('div');
  chip.className = 'et-stat-item et-moved' + (_etMovedOnly ? ' et-stat-sel' : '');
  chip.dataset.key = '__moved';
  chip.innerHTML = `<span class="et-stat-dot" style="background:#b91c1c;"></span><span class="et-stat-lbl">${_uiEsc(t('export.moved_down'))}</span><span class="et-stat-n et-moved-n">${moved}</span>`;
  chip.onclick = () => {
    _etMovedOnly = !_etMovedOnly;
    chip.classList.toggle('et-stat-sel', _etMovedOnly);
    etApplyFilter();
  };
  container.appendChild(chip);
}

function _etUpdateStatusCounts(base) {
  const stats = {};
  base.forEach((e) => {
    stats[e.durumKey] = (stats[e.durumKey] || 0) + 1;
  });
  document.querySelectorAll('.et-stat-item').forEach((item) => {
    if (item.dataset.key === '__moved') return;
    const key = item.dataset.key;
    const n = item.querySelector('.et-stat-n');
    if (n) n.textContent = String(stats[key] || 0);
  });
  const moved = document.querySelector('.et-moved-n');
  if (moved) moved.textContent = String(base.filter((row) => row.movedDown).length);
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
  sel.innerHTML = `<option value="">${t('ui.all_agents')}</option>`;
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
  sel.innerHTML = `<option value="">${t('ui.all_customers')}</option>`;
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
    host.innerHTML = `<div style="font-size:11px;color:var(--text-3);">${t('export.et_no_customers')}</div>`;
    return;
  }
  host.innerHTML = `<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${t('export.et_shortcut_caption')}</div>
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
    if (!_etInRange(e, df, dt)) return false;
    if (_etStatSel.size && !_etStatSel.has(e.durumKey)) return false;
    if (agentVal && String(e.agentId) !== agentVal) return false;
    if (custVal && String(e.customerId) !== custVal) return false;
    return true;
  });

  _etUpdateKampVisibility();
  _etUpdateStatusCounts(base);
  if (_etMovedOnly) base = base.filter((row) => row.movedDown);

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
  if (!tbody) return;

  const cols = _etVisibleCols();
  const span = cols.length + 1;
  const head = document.querySelector('#page-export thead tr');
  if (head) {
    head.innerHTML = `<th style="width:40px;text-align:center;"><input type="checkbox" id="et-header-check" onchange="etToggleHeaderAll()"/></th>${cols.map((col) => `<th>${_uiEsc(col.label)}</th>`).join('')}`;
  }
  if (!_etFiltered.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(span, 'ui.no_termin') : `<tr><td colspan="${span}" class="mb-empty-hint" style="padding:40px;">${t('ui.no_termin')}</td></tr>`;
    if (rc) rc.textContent = '0';
    if (sc) sc.textContent = '0';
    if (dl) dl.disabled = true;
    if (dlc) dlc.textContent = '0';
    const box = document.getElementById('et-header-check');
    if (box) box.checked = false;
    return;
  }

  if (rc) rc.textContent = String(_etFiltered.length);
  tbody.innerHTML = '';
  _etFiltered.forEach((e) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const isSel = _etSelectedIds.has(e.id);
    if (isSel) tr.style.background = 'var(--accent-soft)';
    const cells = cols.map((col) => `<td data-label="${_uiEsc(col.label)}">${_etCellHtml(e, col)}</td>`).join('');
    tr.innerHTML = `<td data-label="Seç" style="text-align:center;"><input type="checkbox" class="et-row-cb" data-id="${e.id}" ${isSel ? 'checked' : ''}/></td>${cells}`;
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
  _etMovedOnly = false;
  _etSelectedIds.clear();
  const ag = document.getElementById('et-agent');
  const cu = document.getElementById('et-customer');
  if (ag) ag.value = '';
  if (cu) cu.value = '';
  if (reload) etReload();
  else etApplyFilter();
}

let _etReloadGen = 0;
async function etReload() {
  const df = document.getElementById('et-date-from')?.value;
  const dt = document.getElementById('et-date-to')?.value;
  if (!df || !dt) {
    toast(t('export.date_range'), 'warn');
    return;
  }
  const gen = ++_etReloadGen;
  _etShowLoading(true, t('ui.loading'));
  try {
    const rows = await _etFetchRows(df, dt);
    if (gen !== _etReloadGen) return;
    _etProcessed = _etProcess(rows);
    await etLoadResultMaps(_etProcessed.map((row) => row.raw?.firm_id));
    await etLoadCampFields(_etProcessed.map((row) => row.raw?.campaign_id));
    if (gen !== _etReloadGen) return;
    etComposeCols();
    etPaintCols();
    _etSelectedIds.clear();
    _etFillAgentSelect();
    await _etFillCustomerSelect();
    if (gen !== _etReloadGen) return;
    _etBuildKampagneList();
    _etBuildStatusGrid();
    etApplyFilter();
  } finally {
    if (gen === _etReloadGen) _etShowLoading(false);
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
    toast(t('ui.excel_lib_missing'), 'err');
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
    toast(t('ui.no_selection'), 'warn');
    return;
  }
  const excelData = use.map((e) => _etExcelRow(e));
  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Termine');
  const datePart = document.getElementById('et-date-from')?.value || new Date().toISOString().slice(0, 10);
  let kampagnePart = '';
  if (_etKampSel.size === 1) kampagnePart = `_${Array.from(_etKampSel)[0].replace(/\s+/g, '')}`;
  else if (_etKampSel.size > 1) kampagnePart = `_${_etKampSel.size}Kampanya`;
  XLSX.writeFile(wb, `termin_export_${datePart}${kampagnePart}.xlsx`);
  toast(t('ui.excel_downloaded'), 'ok');
}

async function loadExportTerminPage() {
  if (_etPageBusy) return;
  if (typeof isExportAdmin === 'function' && !isExportAdmin()) {
    toast(t('ui.no_permission'), 'warn');
    navigate('dashboard');
    return;
  }
  _etPageBusy = true;
  try {
  await _loadExportTerminPageBody();
  } finally {
    _etPageBusy = false;
  }
}

async function _loadExportTerminPageBody() {
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
  await etHydrateLayouts();
  const fid = getActiveFirmId() || currentUser?.firm_id;
  _etResultDefs = fid && typeof loadFirmAppointmentResults === 'function' ? await loadFirmAppointmentResults(fid) : defaultAppointmentResults();
  if (fid) _etResultByFirm[fid] = _etResultDefs;
  await _etBuildShortcuts();
  await etReload();
  if (typeof applyLang === 'function') applyLang();
}

function _etWall(iso, slot) {
  const slotDay = slot?.tarih ? String(slot.tarih).slice(0, 10) : '';
  const start = slot?.baslangic_saat ? String(slot.baslangic_saat).slice(0, 5) : '';
  const end = slot?.bitis_saat ? String(slot.bitis_saat).slice(0, 5) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(slotDay) && /^\d{2}:\d{2}$/.test(start)) {
    const [y, m, d] = slotDay.split('-');
    const time = end && end !== start ? `${start}–${end}` : start;
    const day = `${d}.${m}.${y}`;
    return { dayKey: slotDay, day, time, text: `${day} ${time}`, sort: `${slotDay}T${start}:00` };
  }
  let day = '';
  let time = '';
  if (iso && typeof mbFormatWall === 'function') {
    const bits = String(mbFormatWall(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '').split(' ');
    day = bits[0] || '';
    time = bits[1] || '';
  }
  let dayKey = '';
  if (iso && typeof mbStampParts === 'function') {
    const p = mbStampParts(iso);
    if (p?.year) dayKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  }
  return { dayKey, day, time, text: `${day} ${time}`.trim(), sort: iso || '' };
}

function _etInRange(row, from, to) {
  const day = row?.dayKey || '';
  if (!day) return true;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function _etEk(raw) {
  let value = raw?.form_ek;
  if (!value) return {};
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (e) { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function _etMeta() {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const pair = (key, tr, deLabel, on) => ({ key, tr, de: deLabel, label: de ? deLabel : tr, on, kind: 'meta' });
  return [
    pair('when', 'Tarih / saat', 'Datum / Zeit', true),
    pair('name', 'Ad Soyad', 'Name', true),
    pair('phone', 'Telefon', 'Telefon', true),
    pair('phone2', 'Telefon 2', 'Telefon 2', false),
    pair('street', 'Sokak', 'Straße', true),
    pair('plz', 'PLZ', 'PLZ', true),
    pair('city', 'İlçe/Şehir', 'Ort', true),
    pair('camp', 'Kampanya', 'Kampagne', true),
    pair('status', 'Durum', 'Status', true),
    pair('moved', 'Alta', 'Unten', true),
    pair('agent', 'Agent', 'Agent', true),
    pair('customer', 'Atanan müşteri', 'Kundenzuweisung', true),
    pair('note', 'Agent notu', 'Agentnotiz', true),
    pair('qc', 'Kalite kontrol notu', 'QC-Notiz', false),
    pair('created', 'Kayıt tarihi', 'Erfasst am', false),
  ];
}

function _etFormList(camp) {
  const tf = typeof getCampSettings === 'function' ? getCampSettings(camp).termin_form : null;
  if (typeof terminFormListFromSaved === 'function') return terminFormListFromSaved(tf);
  if (typeof dialerTerminFields === 'function') {
    return dialerTerminFields(camp).map((field) => ({ key: field.key, label: field.l, enabled: true }));
  }
  return [];
}

function _etDiscoverFields() {
  const map = new Map();
  Object.values(_etCampById).forEach((camp) => {
    _etFormList(camp).forEach((field) => {
      const key = String(field.key || '').trim();
      const label = String(field.label || field.l || key).trim();
      if (!key || !label) return;
      const prev = map.get(key);
      if (!prev) map.set(key, { label, on: field.enabled !== false });
      else if (field.enabled !== false) prev.on = true;
    });
  });
  _etProcessed.forEach((row) => {
    Object.keys(_etEk(row.raw)).forEach((key) => {
      if (!map.has(key)) map.set(key, { label: key, on: true });
    });
  });
  return [...map.entries()].map(([key, info]) => ({
    key: `f:${key}`,
    field: key,
    label: info.label,
    on: info.on !== false,
    kind: 'field',
  }));
}

function _etFieldValue(raw, key) {
  const col = typeof TAKVIM_APPT_COL !== 'undefined' ? TAKVIM_APPT_COL[key] : '';
  if (col && raw?.[col] != null && raw[col] !== '') {
    if (typeof takvimYesNo === 'function' && (key === 'interesse_an_pv' || raw[col] === true || raw[col] === false)) return takvimYesNo(raw[col]);
    return raw[col];
  }
  const extra = _etEk(raw);
  if (extra[key] != null && extra[key] !== '') return extra[key];
  return '';
}

function _etVisibleCols() {
  const cols = _etCols.filter((col) => col.on);
  return cols.length ? cols : _etMeta().filter((col) => col.on);
}

function _etCellText(row, col) {
  const raw = row.raw || {};
  if (col.key === 'when') return row.whenText || '';
  if (col.key === 'name') return row.nachname && row.nachname !== '—' ? row.nachname : '';
  if (col.key === 'phone') {
    const tel = row.telefon || '';
    return tel === '0' || tel === '0.00' ? '' : tel;
  }
  if (col.key === 'phone2') return raw.telefon2 || '';
  if (col.key === 'street') return raw.strasse || '';
  if (col.key === 'plz') return raw.plz || '';
  if (col.key === 'city') return raw.ortschaft || '';
  if (col.key === 'camp') return row.kampName && row.kampName !== '—' ? row.kampName : '';
  if (col.key === 'status') return _etDurumLabel(row.durumKey, raw.firm_id);
  if (col.key === 'moved') return row.movedDown ? t('export.moved_short') : '';
  if (col.key === 'agent') return row.agentName || '';
  if (col.key === 'customer') return row.custLabel && row.custLabel !== '—' ? row.custLabel : '';
  if (col.key === 'note') return raw.agent_notu || '';
  if (col.key === 'qc') return raw.qc_notu || '';
  if (col.key === 'created') {
    return raw.kayit_tarihi && typeof mbFormatWall === 'function'
      ? mbFormatWall(raw.kayit_tarihi, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
  }
  if (col.field) return _etFieldValue(raw, col.field);
  return '';
}

function _etCellHtml(row, col) {
  const text = String(_etCellText(row, col) || '');
  const shown = text || '—';
  if (col.key === 'when') {
    return `<div style="font-weight:700;color:var(--accent);">${_uiEsc(row.whenTime || '—')}</div><div style="font-size:11px;color:var(--text-3);">${_uiEsc(row.whenDay || '')}</div>`;
  }
  if (col.key === 'name') {
    const flag = row.movedDown ? `<span class="et-down">! ${_uiEsc(t('export.moved_short'))}</span>` : '';
    return `<span style="font-weight:600;">${_uiEsc(shown)}</span>${flag}`;
  }
  if (col.key === 'moved' && row.movedDown) return `<span class="et-down">! ${_uiEsc(shown)}</span>`;
  if (col.key === 'camp') return `<span class="badge et-camp" style="background:var(--accent);color:#fff;font-size:10px;" title="${_uiEsc(text)}">${_uiEsc(shown)}</span>`;
  if (col.key === 'status') return `<span class="badge" style="background:${_etBadgeColor(row.durumKey)};color:#fff;font-size:10px;">${_uiEsc(shown)}</span>`;
  return _uiEsc(shown);
}

function _etExcelRow(row) {
  const out = {};
  _etVisibleCols().forEach((col) => { out[col.label] = _etCellText(row, col); });
  return out;
}

function etComposeCols() {
  const catalog = _etMeta().concat(_etDiscoverFields());
  const merge = (source, fallbackOn) => {
    const byKey = new Map(catalog.map((col) => [col.key, col]));
    const used = new Set();
    const next = [];
    (source || []).forEach((col) => {
      const base = byKey.get(col.key);
      if (!base) return;
      next.push({ ...base, on: fallbackOn ? !!col.on : !!col.on });
      used.add(col.key);
    });
    catalog.forEach((col) => {
      if (!used.has(col.key)) next.push({ ...col, on: false });
    });
    return next;
  };
  if (_etColsTouched && _etCols.length) {
    _etCols = merge(_etCols);
    return;
  }
  const saved = _etLayouts.find((item) => item.name === _etLayoutName);
  _etCols = saved ? merge(saved.cols) : catalog;
}

function etPaintCols() {
  const host = document.getElementById('et-cols');
  if (!host) return;
  host.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
<select id="et-layout-pick" class="form-input" style="width:auto;max-width:220px;"></select>
<input id="et-layout-name" class="form-input" style="width:180px;" maxlength="60" placeholder="${_uiEsc(t('export.layout_ph'))}" value="${_uiEsc(_etLayoutName)}">
<button type="button" class="btn btn-ghost btn-sm" id="et-layout-save">${_uiEsc(t('export.layout_save'))}</button>
<button type="button" class="btn btn-ghost btn-sm" id="et-layout-del">${_uiEsc(t('export.layout_delete'))}</button>
</div>
<div style="font-size:11px;color:var(--text-3);margin-bottom:6px;">${_uiEsc(t('export.cols_title'))} · ${_uiEsc(t('export.col_hint'))}</div>
<div class="et-col-row">${_etCols.map((col) => `<div class="et-col-chip${col.on ? ' is-on' : ''}" data-key="${_uiEsc(col.key)}">
<span class="et-grip" draggable="true" title="${_uiEsc(t('export.col_hint'))}"><i class="ph ph-dots-six-vertical"></i></span>
<span class="et-col-name" title="${_uiEsc(col.label)}">${_uiEsc(col.label)}</span>
<input type="checkbox" ${col.on ? 'checked' : ''} aria-label="${_uiEsc(col.label)}">
</div>`).join('')}</div>`;
  const pick = document.getElementById('et-layout-pick');
  if (pick) {
    pick.innerHTML = `<option value="">${_uiEsc(t('export.layout_none'))}</option>${_etLayouts.map((item) => `<option value="${_uiEsc(item.name)}">${_uiEsc(item.name)}</option>`).join('')}`;
    pick.value = _etLayouts.some((item) => item.name === _etLayoutName) ? _etLayoutName : '';
    pick.onchange = () => etPickLayout(pick.value);
  }
  const save = document.getElementById('et-layout-save');
  if (save) save.onclick = () => { etSaveLayout(); };
  const del = document.getElementById('et-layout-del');
  if (del) del.onclick = () => { etDeleteLayout(); };
  host.querySelectorAll('.et-col-chip').forEach((chip) => {
    const key = chip.getAttribute('data-key');
    const grip = chip.querySelector('.et-grip');
    if (grip) {
      grip.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', key);
        ev.dataTransfer.effectAllowed = 'move';
        chip.classList.add('is-drag');
      });
      grip.addEventListener('dragend', () => chip.classList.remove('is-drag'));
    }
    chip.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      chip.classList.add('is-over');
    });
    chip.addEventListener('dragleave', () => chip.classList.remove('is-over'));
    chip.addEventListener('drop', (ev) => {
      ev.preventDefault();
      chip.classList.remove('is-over');
      etMoveColTo(ev.dataTransfer.getData('text/plain'), key);
    });
    const box = chip.querySelector('input[type=checkbox]');
    if (box) box.onchange = () => etToggleCol(key, box.checked);
  });
}

function etMoveColTo(fromKey, toKey) {
  if (!fromKey || fromKey === toKey) return;
  const from = _etCols.findIndex((col) => col.key === fromKey);
  const to = _etCols.findIndex((col) => col.key === toKey);
  if (from < 0 || to < 0) return;
  const [row] = _etCols.splice(from, 1);
  _etCols.splice(to, 0, row);
  _etColsTouched = true;
  etPaintCols();
  etRenderTable();
}

function etToggleCol(key, on) {
  const col = _etCols.find((item) => item.key === key);
  if (!col) return;
  col.on = !!on;
  _etColsTouched = true;
  const chip = [...document.querySelectorAll('#et-cols .et-col-chip')].find((el) => el.getAttribute('data-key') === key);
  if (chip) chip.classList.toggle('is-on', col.on);
  etRenderTable();
}

function etPickLayout(name) {
  _etLayoutName = String(name || '');
  _etColsTouched = false;
  _etLayoutsReady = true;
  etComposeCols();
  etPaintCols();
  etRenderTable();
  if (name && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

async function etSaveLayout() {
  const name = String(document.getElementById('et-layout-name')?.value || '').trim().slice(0, 60);
  if (!name) {
    toast(t('export.layout_name'), 'warn');
    return;
  }
  const cols = _etCols.map((col) => ({ key: col.key, on: !!col.on }));
  _etLayouts = _etLayouts.filter((item) => item.name !== name).concat([{ name, cols }]).slice(-30);
  _etLayoutName = name;
  _etLayoutsReady = true;
  _etColsTouched = false;
  if (typeof mbFlushUiPrefs === 'function') await mbFlushUiPrefs();
  toast(t('export.layout_saved'), 'ok');
  etPaintCols();
}

async function etDeleteLayout() {
  const name = _etLayoutName || String(document.getElementById('et-layout-name')?.value || '').trim();
  if (!name) return;
  _etLayouts = _etLayouts.filter((item) => item.name !== name);
  if (_etLayoutName === name) _etLayoutName = '';
  _etLayoutsReady = true;
  _etColsTouched = false;
  etComposeCols();
  etPaintCols();
  etRenderTable();
  if (typeof mbFlushUiPrefs === 'function') await mbFlushUiPrefs();
  toast(t('export.layout_deleted'), 'ok');
}

async function etHydrateLayouts() {
  if (_etLayoutsReady) return;
  const id = currentUser?.id;
  if (!id || typeof sb !== 'function') {
    _etLayoutsReady = true;
    return;
  }
  try {
    const rows = await sb(`users?id=eq.${id}&select=ui_prefs&limit=1`);
    const remote = rows?.[0]?.ui_prefs || {};
    mbAdoptExportLayouts(remote.export_layouts, remote.export_layout_active);
  } catch (e) {
    _etLayoutsReady = true;
  }
}

function mbAdoptExportLayouts(raw, active) {
  const list = Array.isArray(raw) ? raw : [];
  _etLayouts = list.map((item) => {
    const name = String(item?.name || '').trim().slice(0, 60);
    const cols = Array.isArray(item?.cols) ? item.cols : [];
    if (!name) return null;
    return {
      name,
      cols: cols.map((col) => ({ key: String(col?.key || ''), on: !!col?.on })).filter((col) => /^[a-zA-Z0-9_:-]+$/.test(col.key)).slice(0, 80),
    };
  }).filter(Boolean).slice(0, 30);
  const want = String(active || '');
  _etLayoutName = _etLayouts.some((item) => item.name === want) ? want : '';
  _etLayoutsReady = true;
}

function mbExportLayoutsForPrefs() {
  if (!_etLayoutsReady) return null;
  return { layouts: _etLayouts, active: _etLayoutName };
}

async function etLoadResultMaps(firmIds) {
  const ids = [...new Set([typeof getActiveFirmId === 'function' ? getActiveFirmId() : null, currentUser?.firm_id, ...(firmIds || [])].filter(Boolean))];
  const map = {};
  for (const id of ids) {
    map[id] = typeof loadFirmAppointmentResults === 'function'
      ? await loadFirmAppointmentResults(id)
      : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  }
  _etResultByFirm = map;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  _etResultDefs = map[fid] || (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
}

async function etLoadCampFields(ids) {
  _etCampById = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const chunk = uniq.slice(i, i + 40);
    const rows = await sb(`campaigns?select=id,name,settings&id=in.(${chunk.join(',')})`).catch(() => []);
    (rows || []).forEach((camp) => { _etCampById[camp.id] = camp; });
  }
}
