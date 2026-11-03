// ─────────────────────────────────────────────
// Randevular — Termin-Manager tarzı liste
// ─────────────────────────────────────────────

let _rdBusy = false;
let _rdRows = [];
let _rdFiltered = [];
let _rdStatSel = new Set();
let _rdResults = [];
let _rdResultsByFirm = {};
let _rdQ = '';
let _rdSort = { key: 'termin', dir: 'desc' };
let _rdAgents = [];
let _rdCustomers = [];
let _rdCampById = {};
let _rdExtraCols = [];
let _rdAgentFilter = '';
let _rdCustomerFilter = '';
let _rdPreset = 'range';

const _RD_CORE_SKIP = new Set(['name', 'phone', 'phone2', 'address', 'plz', 'city', 'attempt', 'notes']);

const _RD_STD_FIELDS = [
  ['baujahr', 'Baujahr', 'Yapım yılı'],
  ['hausart', 'Hausart', 'Ev tipi'],
  ['qm', 'Wohnfläche (qm)', 'm²'],
  ['heizung', 'Heizung', 'Isıtma'],
  ['alter_der_heizung', 'Alter der Heizung', 'Isıtma yaşı'],
  ['verbrauch_pro_jahr', 'Verbrauch pro Jahr', 'Tüketim/yıl'],
  ['personen', 'Personen im Haushalt', 'Kişi'],
  ['interesse_an_pv', 'Interesse an PV', 'PV ilgisi'],
];

function _rdIsHiddenExtraKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!k) return true;
  if (_RD_CORE_SKIP.has(k)) return true;
  if (k.startsWith('callin_') || k.startsWith('callin')) return true;
  if (k.includes('transcript') || k.includes('recording') || k.includes('voice_url')) return true;
  return false;
}

function _rdEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v ?? '') : String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _rdSay(tr, de) {
  const deLang = (typeof currentLang === 'string' ? currentLang : 'tr') === 'de';
  return deLang ? de : tr;
}

function _rdToday() {
  return typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
}

function _rdShift(day, delta) {
  return typeof mbShiftDate === 'function' ? mbShiftDate(day, delta) : day;
}

function _rdBounds(from, to) {
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
  return { gte, lte };
}

function _rdCanEditAgent() {
  const role = currentUser?.role || '';
  if (typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin(role)) return true;
  return role === 'qc';
}

function _rdNormDurum(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'qc_bekleniyor';
  if (typeof contactStatusToAppointmentResult === 'function') {
    return typeof _normResultKey === 'function'
      ? _normResultKey(contactStatusToAppointmentResult(s))
      : contactStatusToAppointmentResult(s);
  }
  return typeof _normResultKey === 'function' ? _normResultKey(s) : s;
}

function _rdDurumLabel(key, firmId) {
  const list = (firmId && _rdResultsByFirm[firmId]) || _rdResults;
  const d = (list || []).find((x) => x.key === key);
  if (d?.label) return d.label;
  const any = Object.values(_rdResultsByFirm)
    .map((rows) => (rows || []).find((x) => x.key === key)?.label)
    .find(Boolean);
  return any || key || '—';
}

function _rdBadgeColor(key) {
  const pool = Object.values(_rdResultsByFirm).flat();
  const d = (pool.length ? pool : _rdResults).find((x) => x.key === key);
  const c = d?.color && /^#[0-9a-fA-F]{6}$/.test(String(d.color)) ? d.color : '#64748b';
  return c;
}

function _rdRowBg(key) {
  const c = _rdBadgeColor(key);
  if (!c || c.length !== 7) return 'transparent';
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.18)`;
}

function _rdFmtWhen(iso) {
  if (!iso) return '—';
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(iso, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return String(iso).replace('T', ' ').slice(0, 16);
}

function _rdDefaultRange() {
  const today = _rdToday();
  return { from: _rdShift(today, -14), to: _rdShift(today, 45) };
}

function _rdShowLoading(on) {
  const el = document.getElementById('rd-loading');
  if (el) el.hidden = !on;
}

function _rdEk(raw) {
  let value = raw?.form_ek;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (_) { value = {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function _rdFormList(camp) {
  const tf = typeof getCampSettings === 'function' ? getCampSettings(camp).termin_form : null;
  if (typeof terminFormListFromSaved === 'function') return terminFormListFromSaved(tf);
  if (typeof dialerTerminFields === 'function') {
    return dialerTerminFields(camp).map((field) => ({ key: field.key, label: field.l, enabled: true }));
  }
  return [];
}

function _rdFieldValue(raw, key) {
  const col = typeof TAKVIM_APPT_COL !== 'undefined' ? TAKVIM_APPT_COL[key] : '';
  if (col && raw?.[col] != null && raw[col] !== '') {
    if (typeof takvimYesNo === 'function' && (key === 'interesse_an_pv' || raw[col] === true || raw[col] === false)) {
      return takvimYesNo(raw[col]);
    }
    return raw[col];
  }
  const extra = _rdEk(raw);
  if (extra[key] != null && extra[key] !== '') {
    if (typeof takvimYesNo === 'function' && (key === 'interesse_an_pv' || extra[key] === true || extra[key] === false)) {
      return takvimYesNo(extra[key]);
    }
    return extra[key];
  }
  return '';
}

function _rdDiscoverExtraCols() {
  const map = new Map();
  // Termin-Manager sabit alan sırası — her zaman
  _RD_STD_FIELDS.forEach(([key, de, tr]) => {
    map.set(key, _rdSay(tr, de));
  });
  Object.values(_rdCampById).forEach((camp) => {
    _rdFormList(camp).forEach((field) => {
      const key = String(field.key || '').trim();
      if (!key || _rdIsHiddenExtraKey(key) || field.enabled === false) return;
      const label = String(field.label || field.l || key).trim() || key;
      if (!map.has(key)) map.set(key, label);
    });
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function _rdColSpan() {
  return 13 + _rdExtraCols.length;
}

function _rdStatusKeys() {
  const keys = [];
  const push = (k) => { if (k && !keys.includes(k)) keys.push(k); };
  const lists = Object.values(_rdResultsByFirm);
  (lists.length ? lists : [_rdResults]).forEach((list) => (list || []).forEach((row) => push(row.key)));
  _rdRows.forEach((row) => push(row.durumKey));
  return keys;
}

async function _rdLoadResultDefs() {
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  _rdResultsByFirm = {};
  if (fid && typeof loadFirmAppointmentResults === 'function') {
    _rdResults = await loadFirmAppointmentResults(fid, true);
    _rdResultsByFirm[fid] = _rdResults;
  } else if (typeof defaultAppointmentResults === 'function') {
    _rdResults = defaultAppointmentResults();
  } else {
    _rdResults = [];
  }
}

async function _rdLoadCampsAndAgents() {
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  _rdCampById = {};
  const camps = await sb(`campaigns?select=id,name,settings,field_config${ff}&order=name.asc&limit=500`).catch(() => []);
  (camps || []).forEach((c) => { if (c?.id) _rdCampById[c.id] = c; });

  let agentQ = `users?select=id,name,role&role=eq.agent&is_active=eq.true&order=name.asc`;
  if (fid) agentQ += `&firm_id=eq.${fid}`;
  else if (ff) agentQ += ff;
  _rdAgents = (await sb(agentQ).catch(() => [])) || [];

  let custQ = `customers?select=id,name,code&is_active=eq.true&order=name.asc&limit=500`;
  if (fid) custQ += `&firm_id=eq.${fid}`;
  else if (ff) custQ += ff;
  _rdCustomers = (await sb(custQ).catch(() => [])) || [];
}

function _rdFillFilterSelects() {
  const st = document.getElementById('rd-filter-status');
  if (st) {
    const cur = st.value;
    const allSt = (typeof t === 'function' ? t('rd.filter.all_status') : null) || 'Tüm durumlar';
    st.innerHTML = `<option value="">${_rdEsc(allSt)}</option>` + _rdStatusKeys().map((k) =>
      `<option value="${_rdEsc(k)}">${_rdEsc(_rdDurumLabel(k))}</option>`
    ).join('');
    if (cur) st.value = cur;
  }
  const ag = document.getElementById('rd-filter-agent');
  if (ag) {
    const cur = ag.value;
    const allAg = (typeof t === 'function' ? t('rd.filter.all_agents') : null) || 'Tüm temsilciler';
    ag.innerHTML = `<option value="">${_rdEsc(allAg)}</option>` + _rdAgents.map((a) =>
      `<option value="${_rdEsc(a.id)}">${_rdEsc(a.name || a.id)}</option>`
    ).join('');
    if (cur) ag.value = cur;
  }
  const cu = document.getElementById('rd-filter-customer');
  if (cu) {
    const cur = cu.value;
    const allCu = (typeof t === 'function' ? t('rd.filter.all_customers') : null) || 'Tüm müşteriler';
    cu.innerHTML = `<option value="">${_rdEsc(allCu)}</option>` + _rdCustomers.map((c) => {
      const label = c.code ? `${c.code} · ${c.name || ''}` : (c.name || c.id);
      return `<option value="${_rdEsc(c.id)}">${_rdEsc(label)}</option>`;
    }).join('');
    if (cur) cu.value = cur;
  }
}

function _rdPaintLegend() {
  const host = document.getElementById('rd-legend');
  if (!host) return;
  const keys = _rdStatusKeys().slice(0, 8);
  host.innerHTML = keys.map((k) => {
    const c = _rdBadgeColor(k);
    return `<span class="rd-leg"><i style="background:${c}"></i>${_rdEsc(_rdDurumLabel(k))}</span>`;
  }).join('');
}

function _rdMarkPreset(active) {
  _rdPreset = active;
  document.querySelectorAll('#page-randevular .rd-preset').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.rdPreset === active);
  });
}

function rdPreset(kind) {
  const today = _rdToday();
  const fromEl = document.getElementById('rd-date-from');
  const toEl = document.getElementById('rd-date-to');
  let from = today;
  let to = today;
  if (kind === 'today') {
    from = today; to = today;
  } else if (kind === 'week') {
    from = _rdShift(today, -6); to = today;
  } else if (kind === 'month') {
    from = `${today.slice(0, 8)}01`;
    to = today;
  } else {
    const def = _rdDefaultRange();
    from = def.from; to = def.to;
    kind = 'range';
  }
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
  _rdMarkPreset(kind);
  loadRandevularPage();
}

function rdOnDateManual() {
  _rdMarkPreset('range');
  loadRandevularPage();
}

function rdSetStatusFilter(v) {
  _rdStatSel.clear();
  if (v) _rdStatSel.add(v);
  rdApplyFilter();
}

function rdSetAgentFilter(v) {
  _rdAgentFilter = String(v || '');
  rdApplyFilter();
}

function rdSetCustomerFilter(v) {
  _rdCustomerFilter = String(v || '');
  rdApplyFilter();
}

function rdClearFilters() {
  _rdQ = '';
  _rdStatSel.clear();
  _rdAgentFilter = '';
  _rdCustomerFilter = '';
  const search = document.getElementById('rd-search');
  if (search) search.value = '';
  const st = document.getElementById('rd-filter-status');
  if (st) st.value = '';
  const ag = document.getElementById('rd-filter-agent');
  if (ag) ag.value = '';
  const cu = document.getElementById('rd-filter-customer');
  if (cu) cu.value = '';
  rdPreset('range');
}

async function _rdFetchRows(from, to) {
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  const cols =
    'id,contact_id,slot_id,termin_tarih,kayit_tarihi,durum,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,agent_id,campaign_id,customer_id,firm_id,agent_notu,qc_notu,form_ek';
  const bounds = _rdBounds(from, to);
  let q = `appointments?select=${cols},users(name),campaigns(name),customers(name,code)${ff}`;
  q += `&termin_tarih=gte.${bounds.gte}&termin_tarih=lte.${bounds.lte}&order=termin_tarih.desc,id.desc`;
  let rows = [];
  try {
    rows = typeof mbFetchAll === 'function' ? await mbFetchAll(q) : (await sb(q).catch(() => [])) || [];
  } catch (_) {
    q = `appointments?select=${cols}${ff}&termin_tarih=gte.${bounds.gte}&termin_tarih=lte.${bounds.lte}&order=termin_tarih.desc,id.desc`;
    rows = typeof mbFetchAll === 'function' ? await mbFetchAll(q).catch(() => []) : (await sb(q).catch(() => [])) || [];
    if (rows?.length) {
      const aIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
      const cIds = [...new Set(rows.map((r) => r.campaign_id).filter(Boolean))];
      const uIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
      const uMap = {}; const campMap = {}; const custMap = {};
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
  }
  rows = Array.isArray(rows) ? rows : [];

  return rows.map((r) => {
    const durumKey = _rdNormDurum(r.durum);
    if (r.campaign_id && r.campaigns && !_rdCampById[r.campaign_id]) {
      _rdCampById[r.campaign_id] = { id: r.campaign_id, name: r.campaigns.name, settings: {} };
    }
    let custLabel = '';
    if (r.customers) {
      custLabel = r.customers.code
        ? `${r.customers.code} · ${r.customers.name || ''}`.trim()
        : String(r.customers.name || '');
    }
    return {
      id: r.id,
      contactId: r.contact_id || '',
      name: r.nachname || '—',
      phone: String(r.telefonnummer || r.telefon2 || '').trim(),
      street: r.strasse || '',
      plz: r.plz || '',
      city: r.ortschaft || '',
      camp: r.campaigns?.name || '',
      campId: r.campaign_id || '',
      agent: r.users?.name || '',
      agentId: r.agent_id || '',
      customerId: r.customer_id || '',
      customer: custLabel,
      firmId: r.firm_id || '',
      note: r.agent_notu || '',
      durumKey,
      durumLabel: _rdDurumLabel(durumKey, r.firm_id),
      termin: r.termin_tarih || '',
      created: r.kayit_tarihi || '',
      raw: r,
    };
  });
}

function rdToggleStatus(key) {
  rdSetStatusFilter(key === '*' ? '' : key);
  const st = document.getElementById('rd-filter-status');
  if (st) st.value = key === '*' ? '' : key;
}

function rdSetSearch(v) {
  _rdQ = String(v || '').trim().toLocaleLowerCase('tr-TR');
  rdApplyFilter();
}

function rdSortBy(key) {
  if (_rdSort.key === key) _rdSort.dir = _rdSort.dir === 'asc' ? 'desc' : 'asc';
  else { _rdSort.key = key; _rdSort.dir = key === 'name' ? 'asc' : 'desc'; }
  rdApplyFilter();
}

function _rdCmp(a, b) {
  const dir = _rdSort.dir === 'asc' ? 1 : -1;
  const k = _rdSort.key;
  let va = a.termin;
  let vb = b.termin;
  if (k === 'name') { va = a.name; vb = b.name; }
  else if (k === 'phone') { va = a.phone; vb = b.phone; }
  else if (k === 'plz') { va = a.plz; vb = b.plz; }
  else if (k === 'created') { va = a.created; vb = b.created; }
  else if (k === 'agent') { va = a.agent; vb = b.agent; }
  else if (k === 'customer') { va = a.customer; vb = b.customer; }
  else if (String(k).startsWith('f:')) {
    const fk = k.slice(2);
    va = _rdFieldValue(a.raw, fk);
    vb = _rdFieldValue(b.raw, fk);
  }
  return String(va || '').localeCompare(String(vb || ''), 'tr', { numeric: true }) * dir;
}

function rdApplyFilter() {
  let list = _rdRows.slice();
  if (_rdStatSel.size) list = list.filter((r) => _rdStatSel.has(r.durumKey));
  if (_rdAgentFilter) list = list.filter((r) => String(r.agentId || '') === _rdAgentFilter);
  if (_rdCustomerFilter) list = list.filter((r) => String(r.customerId || '') === _rdCustomerFilter);
  if (_rdQ) {
    list = list.filter((r) => {
      const extras = _rdExtraCols.map((c) => _rdFieldValue(r.raw, c.key)).join(' ');
      const blob = [r.name, r.phone, r.street, r.plz, r.city, r.camp, r.agent, r.customer, r.note, r.durumLabel, r.id, extras]
        .join(' ').toLocaleLowerCase('tr-TR');
      return blob.includes(_rdQ);
    });
  }
  list.sort(_rdCmp);
  _rdFiltered = list;
  _rdPaintHead();
  _rdPaintTable();
  _rdPaintLegend();
  const n = String(list.length);
  const c1 = document.getElementById('rd-count');
  const c2 = document.getElementById('rd-count-foot');
  if (c1) c1.textContent = n;
  if (c2) c2.textContent = n;
}

function _rdPaintHead() {
  const head = document.getElementById('rd-thead');
  if (!head) return;
  const th = (label, sortKey) => sortKey
    ? `<th onclick="rdSortBy('${sortKey}')" style="cursor:pointer;">${_rdEsc(label)}</th>`
    : `<th>${_rdEsc(label)}</th>`;
  const extra = _rdExtraCols.map((c) => th(c.label, `f:${c.key}`)).join('');
  head.innerHTML = `<tr>
${th(_rdSay('Randevu', 'Termin'), 'termin')}
${th(_rdSay('Kayıt', 'Erfasst am'), 'created')}
${th(_rdSay('Ad Soyad', 'Name/Nachname'), 'name')}
${th(_rdSay('Cadde', 'Strasse & Hausnummer'))}
${th('PLZ', 'plz')}
${th(_rdSay('Şehir', 'Ortschaft'))}
${th(_rdSay('Telefon', 'Telefonnummer'), 'phone')}
${extra}
${th(_rdSay('Temsilci', 'Agent'), 'agent')}
${th(_rdSay('Not', 'Zusatzinformation'))}
${th(_rdSay('Müşteri', 'Kunde'), 'customer')}
${th(_rdSay('Durum', 'Status'))}
<th></th>
</tr>`;
}

function _rdAgentSelect(row) {
  const idAttr = String(row.id).replace(/'/g, '');
  if (!_rdCanEditAgent()) return _rdEsc(row.agent || '—');
  const opts = [`<option value="">—</option>`]
    .concat(_rdAgents.map((a) => {
      const sel = String(a.id) === String(row.agentId || '') ? ' selected' : '';
      return `<option value="${_rdEsc(a.id)}"${sel}>${_rdEsc(a.name || a.id)}</option>`;
    }));
  if (row.agentId && !_rdAgents.some((a) => String(a.id) === String(row.agentId))) {
    opts.splice(1, 0, `<option value="${_rdEsc(row.agentId)}" selected>${_rdEsc(row.agent || row.agentId)}</option>`);
  }
  return `<select class="form-input rd-agent-sel" onclick="event.stopPropagation()" onchange="rdChangeAgent('${idAttr}', this.value)">${opts.join('')}</select>`;
}

function _rdPaintTable() {
  const tb = document.getElementById('rd-tbody');
  if (!tb) return;
  const span = _rdColSpan();
  if (!_rdFiltered.length) {
    tb.innerHTML = `<tr><td colspan="${span}" style="text-align:center;padding:36px;color:var(--text-3);">${_rdEsc(_rdSay('Kayıt yok', 'Keine Einträge'))}</td></tr>`;
    return;
  }
  tb.innerHTML = _rdFiltered.map((r) => {
    const color = _rdBadgeColor(r.durumKey);
    const bg = _rdRowBg(r.durumKey);
    const idAttr = String(r.id).replace(/'/g, '');
    const extras = _rdExtraCols.map((c) => {
      const v = _rdFieldValue(r.raw, c.key);
      return `<td title="${_rdEsc(v || '')}">${_rdEsc(v === '' || v == null ? '—' : v)}</td>`;
    }).join('');
    return `<tr class="rd-row" style="--rd-row-bg:${bg}" onclick="rdOpenRow('${idAttr}')">
<td>${_rdEsc(_rdFmtWhen(r.termin))}</td>
<td class="td-mono">${_rdEsc(_rdFmtWhen(r.created))}</td>
<td><b>${_rdEsc(r.name)}</b></td>
<td title="${_rdEsc(r.street)}">${_rdEsc(r.street || '—')}</td>
<td class="td-mono">${_rdEsc(r.plz || '—')}</td>
<td>${_rdEsc(r.city || '—')}</td>
<td class="td-mono">${_rdEsc(r.phone || '—')}</td>
${extras}
<td class="rd-agent-cell" onclick="event.stopPropagation()">${_rdAgentSelect(r)}</td>
<td title="${_rdEsc(r.note)}">${_rdEsc(r.note || '—')}</td>
<td>${_rdEsc(r.customer || '—')}</td>
<td><span class="rd-status" style="background:${color}22;color:${color};border-color:${color}55">${_rdEsc(r.durumLabel)}</span></td>
<td class="rd-actions" onclick="event.stopPropagation()">
<button type="button" class="btn btn-ghost btn-sm" title="${_rdEsc(_rdSay('Aç', 'Öffnen'))}" onclick="rdOpenRow('${idAttr}')"><i class="ph ph-arrow-square-out"></i></button>
</td>
</tr>`;
  }).join('');
}

async function rdChangeAgent(apptId, agentId) {
  if (!_rdCanEditAgent()) return;
  const next = agentId || null;
  const row = _rdRows.find((r) => r.id === apptId);
  const prev = row?.agentId || '';
  try {
    await sb(`appointments?id=eq.${apptId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ agent_id: next }),
    });
    if (row) {
      row.agentId = next || '';
      row.agent = next ? (_rdAgents.find((a) => String(a.id) === String(next))?.name || row.agent) : '';
      if (row.raw) row.raw.agent_id = next;
    }
    if (typeof toast === 'function') toast(_rdSay('Temsilci güncellendi', 'Mitarbeiter aktualisiert'), 'ok');
    rdApplyFilter();
  } catch (e) {
    console.error(e);
    if (typeof toast === 'function') toast(e.message || _rdSay('Temsilci değiştirilemedi', 'Mitarbeiter konnte nicht geändert werden'), 'err');
    const sel = document.querySelector(`select.rd-agent-sel[onchange*="${apptId}"]`);
    if (sel) sel.value = prev;
  }
}

async function rdOpenRow(id) {
  const row = _rdRows.find((r) => r.id === id);
  try {
    if (row?.contactId && typeof openContactDrawer === 'function') {
      await openContactDrawer(row.contactId);
      return;
    }
    const appts = await sb(`appointments?id=eq.${id}&select=*&limit=1`).catch(() => []);
    const appt = appts?.[0];
    if (!appt) throw new Error('missing');
    if (appt.contact_id && typeof openContactDrawer === 'function') {
      await openContactDrawer(appt.contact_id);
      return;
    }
    if (appt.slot_id && typeof openTakvimSlotDetail === 'function') {
      const slots = await sb(`takvim_slots?id=eq.${appt.slot_id}&select=*&limit=1`).catch(() => []);
      const slot = slots?.[0];
      if (slot) {
        await openTakvimSlotDetail(slot, appt);
        return;
      }
    }
  } catch (_) {}
  if (typeof toast === 'function') toast(_rdSay('Randevu açılamadı', 'Termin konnte nicht geöffnet werden'), 'warn');
}

function _rdExportHeaders() {
  return [
    _rdSay('Randevu', 'Termin'),
    _rdSay('Kayıt', 'Erfasst am'),
    _rdSay('Ad Soyad', 'Name/Nachname'),
    _rdSay('Cadde', 'Strasse & Hausnummer'),
    'PLZ',
    _rdSay('Şehir', 'Ortschaft'),
    _rdSay('Telefon', 'Telefonnummer'),
    ..._rdExtraCols.map((c) => c.label),
    _rdSay('Temsilci', 'Agent'),
    _rdSay('Not', 'Zusatzinformation'),
    _rdSay('Müşteri', 'Kunde'),
    _rdSay('Durum', 'Status'),
  ];
}

function _rdExportCells(r) {
  return [
    _rdFmtWhen(r.termin),
    _rdFmtWhen(r.created),
    r.name,
    r.street,
    r.plz,
    r.city,
    r.phone,
    ..._rdExtraCols.map((c) => _rdFieldValue(r.raw, c.key)),
    r.agent,
    r.note,
    r.customer,
    r.durumLabel,
  ];
}

function rdExportCsv() {
  const rows = _rdFiltered.length ? _rdFiltered : _rdRows;
  if (!rows.length) {
    toast(_rdSay('Dışa aktarılacak kayıt yok', 'Keine Daten zum Export'), 'warn');
    return;
  }
  const headers = _rdExportHeaders();
  const lines = [headers.join(';')];
  rows.forEach((r) => {
    lines.push(_rdExportCells(r).map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(';'));
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `randevular-${_rdToday()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function rdExportExcel() {
  if (typeof XLSX === 'undefined') {
    toast(_rdSay('Excel kütüphanesi yok', 'Excel-Bibliothek fehlt'), 'err');
    return;
  }
  const rows = _rdFiltered.length ? _rdFiltered : _rdRows;
  if (!rows.length) {
    toast(_rdSay('Dışa aktarılacak kayıt yok', 'Keine Daten zum Export'), 'warn');
    return;
  }
  const headers = _rdExportHeaders();
  const data = rows.map((r) => {
    const cells = _rdExportCells(r);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Termine');
  XLSX.writeFile(wb, `termin_manager_${_rdToday()}.xlsx`);
  toast(_rdSay('Excel indirildi', 'Excel heruntergeladen'), 'ok');
}

async function loadRandevularPage() {
  if (_rdBusy) return;
  _rdBusy = true;
  _rdShowLoading(true);
  try {
    const fromEl = document.getElementById('rd-date-from');
    const toEl = document.getElementById('rd-date-to');
    const def = _rdDefaultRange();
    if (fromEl && !fromEl.value) fromEl.value = def.from;
    if (toEl && !toEl.value) toEl.value = def.to;
    const from = fromEl?.value || def.from;
    const to = toEl?.value || def.to;

    if (typeof renderFirmSelector === 'function') {
      renderFirmSelector('rd-firm-wrap', loadRandevularPage);
    }

    await Promise.all([_rdLoadResultDefs(), _rdLoadCampsAndAgents()]);
    _rdRows = await _rdFetchRows(from, to);
    _rdExtraCols = _rdDiscoverExtraCols();
    _rdFillFilterSelects();
    rdApplyFilter();
  } catch (e) {
    console.error(e);
    const tb = document.getElementById('rd-tbody');
    if (tb) tb.innerHTML = `<tr><td colspan="${_rdColSpan()}" style="text-align:center;padding:28px;color:var(--red);">${_rdEsc(e.message || 'Hata')}</td></tr>`;
  } finally {
    _rdShowLoading(false);
    _rdBusy = false;
  }
}

try {
  window.loadRandevularPage = loadRandevularPage;
  window.rdToggleStatus = rdToggleStatus;
  window.rdSetSearch = rdSetSearch;
  window.rdSortBy = rdSortBy;
  window.rdOpenRow = rdOpenRow;
  window.rdExportCsv = rdExportCsv;
  window.rdExportExcel = rdExportExcel;
  window.rdChangeAgent = rdChangeAgent;
  window.rdPreset = rdPreset;
  window.rdOnDateManual = rdOnDateManual;
  window.rdSetStatusFilter = rdSetStatusFilter;
  window.rdSetAgentFilter = rdSetAgentFilter;
  window.rdSetCustomerFilter = rdSetCustomerFilter;
  window.rdClearFilters = rdClearFilters;
} catch (_) {}
