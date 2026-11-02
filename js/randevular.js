// ─────────────────────────────────────────────
// Randevular — Satışlar benzeri liste + durum chip’leri
// Kolonlar: çekirdek + firma/kampanya termin_form alanları
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
let _rdCampById = {};
let _rdExtraCols = [];

const _RD_CORE_SKIP = new Set(['name', 'phone', 'phone2', 'address', 'plz', 'city', 'attempt', 'notes']);

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

function _rdShortId(id) {
  const s = String(id || '');
  if (!s) return '—';
  return s.length > 8 ? s.slice(0, 8) : s;
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

function _rdDiscoverExtraCols(rows) {
  const map = new Map();
  Object.values(_rdCampById).forEach((camp) => {
    _rdFormList(camp).forEach((field) => {
      const key = String(field.key || '').trim();
      if (!key || _RD_CORE_SKIP.has(key) || field.enabled === false) return;
      const label = String(field.label || field.l || key).trim() || key;
      const prev = map.get(key);
      if (!prev) map.set(key, label);
    });
  });
  (rows || []).forEach((row) => {
    Object.keys(_rdEk(row.raw || row)).forEach((key) => {
      if (!key || _RD_CORE_SKIP.has(key) || map.has(key)) return;
      if (typeof TAKVIM_APPT_COL !== 'undefined' && TAKVIM_APPT_COL[key]) {
        map.set(key, key);
        return;
      }
      map.set(key, key);
    });
  });
  // Standart termin kolonları kampanya ayarında yoksa ama veride varsa göster
  const std = [
    ['hausart', _rdSay('Ev tipi', 'Haustyp')],
    ['baujahr', _rdSay('Yapım yılı', 'Baujahr')],
    ['qm', 'm²'],
    ['heizung', _rdSay('Isıtma', 'Heizung')],
    ['alter_der_heizung', _rdSay('Isıtma yaşı', 'Heizungsalter')],
    ['verbrauch_pro_jahr', _rdSay('Tüketim/yıl', 'Verbrauch/Jahr')],
    ['personen', _rdSay('Kişi', 'Personen')],
    ['interesse_an_pv', _rdSay('PV ilgisi', 'PV-Interesse')],
  ];
  std.forEach(([key, label]) => {
    if (map.has(key)) return;
    const hit = (rows || []).some((r) => String(_rdFieldValue(r.raw || r, key) || '').trim());
    if (hit) map.set(key, label);
  });
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

function _rdColSpan() {
  return 12 + _rdExtraCols.length;
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

  const apptIds = rows.map((r) => r.id).filter(Boolean);
  const fieldByAppt = {};
  if (apptIds.length) {
    for (let i = 0; i < apptIds.length; i += 80) {
      const chunk = apptIds.slice(i, i + 80);
      const tasks = await sb(
        `field_tasks?appointment_id=in.(${chunk.join(',')})&select=id,appointment_id,assigned_to,status&order=created_at.desc`
      ).catch(() => []);
      const uids = [...new Set((tasks || []).map((t) => t.assigned_to).filter(Boolean))];
      let umap = {};
      if (uids.length) {
        const users = await sb(`users?id=in.(${uids.join(',')})&select=id,name`).catch(() => []);
        (users || []).forEach((u) => { umap[u.id] = u.name || ''; });
      }
      (tasks || []).forEach((t) => {
        if (!t.appointment_id || fieldByAppt[t.appointment_id]) return;
        fieldByAppt[t.appointment_id] = {
          name: umap[t.assigned_to] || '—',
          status: t.status || '',
        };
      });
    }
  }

  return rows.map((r) => {
    const durumKey = _rdNormDurum(r.durum);
    const field = fieldByAppt[r.id];
    if (r.campaign_id && r.campaigns && !_rdCampById[r.campaign_id]) {
      _rdCampById[r.campaign_id] = { id: r.campaign_id, name: r.campaigns.name, settings: {} };
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
      customer: r.customers?.name || (r.customers?.code || ''),
      firmId: r.firm_id || '',
      durumKey,
      durumLabel: _rdDurumLabel(durumKey, r.firm_id),
      termin: r.termin_tarih || '',
      created: r.kayit_tarihi || '',
      fieldName: field?.name || '',
      fieldStatus: field?.status || '',
      raw: r,
    };
  });
}

function _rdBuildChips() {
  const host = document.getElementById('rd-status-chips');
  if (!host) return;
  const stats = {};
  _rdRows.forEach((r) => { stats[r.durumKey] = (stats[r.durumKey] || 0) + 1; });
  const keys = _rdStatusKeys();
  const allN = _rdRows.length;
  const parts = [];
  parts.push(
    `<button type="button" class="rd-chip${!_rdStatSel.size ? ' is-on' : ''}" data-rd-status="*" onclick="rdToggleStatus('*')">` +
    `<span class="rd-chip-dot" style="background:var(--accent)"></span>` +
    `<span>${_rdEsc(_rdSay('Tümü', 'Alle'))}</span>` +
    `<span class="rd-chip-n">${allN}</span></button>`
  );
  keys.forEach((key) => {
    const color = _rdBadgeColor(key);
    const on = _rdStatSel.has(key);
    parts.push(
      `<button type="button" class="rd-chip${on ? ' is-on' : ''}" data-rd-status="${_rdEsc(key)}" onclick="rdToggleStatus('${String(key).replace(/'/g, "\\'")}')" style="${on ? `--rd-chip:${color}` : ''}">` +
      `<span class="rd-chip-dot" style="background:${color}"></span>` +
      `<span>${_rdEsc(_rdDurumLabel(key))}</span>` +
      `<span class="rd-chip-n">${stats[key] || 0}</span></button>`
    );
  });
  host.innerHTML = parts.join('');
}

function rdToggleStatus(key) {
  if (key === '*') {
    _rdStatSel.clear();
  } else if (_rdStatSel.has(key)) {
    _rdStatSel.delete(key);
  } else {
    _rdStatSel.add(key);
  }
  rdApplyFilter();
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
  if (_rdQ) {
    list = list.filter((r) => {
      const extras = _rdExtraCols.map((c) => _rdFieldValue(r.raw, c.key)).join(' ');
      const blob = [r.name, r.phone, r.street, r.plz, r.city, r.camp, r.agent, r.fieldName, r.durumLabel, r.id, extras]
        .join(' ').toLocaleLowerCase('tr-TR');
      return blob.includes(_rdQ);
    });
  }
  list.sort(_rdCmp);
  _rdFiltered = list;
  _rdBuildChips();
  _rdPaintHead();
  _rdPaintTable();
  const n = document.getElementById('rd-count');
  if (n) n.textContent = String(list.length);
}

function _rdPaintHead() {
  const head = document.getElementById('rd-thead');
  if (!head) return;
  const th = (label, sortKey) => sortKey
    ? `<th onclick="rdSortBy('${sortKey}')" style="cursor:pointer;">${_rdEsc(label)}</th>`
    : `<th>${_rdEsc(label)}</th>`;
  const extra = _rdExtraCols.map((c) => th(c.label, `f:${c.key}`)).join('');
  head.innerHTML = `<tr>
${th('ID', 'id')}
${th(_rdSay('Ad Soyad', 'Name'), 'name')}
${th(_rdSay('Numara', 'Nummer'), 'phone')}
${th(_rdSay('Cadde', 'Straße'))}
${th('PLZ', 'plz')}
${th(_rdSay('Şehir', 'Ort'))}
${extra}
${th(_rdSay('Kampanya', 'Kampagne'))}
${th(_rdSay('Temsilci', 'Mitarbeiter'), 'agent')}
${th(_rdSay('Saha', 'Feld'))}
${th(_rdSay('Durum', 'Status'))}
${th(_rdSay('Randevu', 'Termin'), 'termin')}
${th(_rdSay('Kayıt', 'Erfasst'), 'created')}
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
  // Mevcut temsilci listede yoksa ekle
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
    const idAttr = String(r.id).replace(/'/g, '');
    const extras = _rdExtraCols.map((c) => {
      const v = _rdFieldValue(r.raw, c.key);
      return `<td>${_rdEsc(v === '' || v == null ? '—' : v)}</td>`;
    }).join('');
    return `<tr class="rd-row" onclick="rdOpenRow('${idAttr}')">
<td class="td-mono" title="${_rdEsc(r.id)}">${_rdEsc(_rdShortId(r.id))}</td>
<td><b>${_rdEsc(r.name)}</b></td>
<td class="td-mono">${_rdEsc(r.phone || '—')}</td>
<td>${_rdEsc(r.street || '—')}</td>
<td class="td-mono">${_rdEsc(r.plz || '—')}</td>
<td>${_rdEsc(r.city || '—')}</td>
${extras}
<td>${_rdEsc(r.camp || '—')}</td>
<td class="rd-agent-cell" onclick="event.stopPropagation()">${_rdAgentSelect(r)}</td>
<td>${_rdEsc(r.fieldName || '—')}</td>
<td><span class="rd-status" style="background:${color}22;color:${color};border-color:${color}55">${_rdEsc(r.durumLabel)}</span></td>
<td>${_rdEsc(_rdFmtWhen(r.termin))}</td>
<td>${_rdEsc(_rdFmtWhen(r.created))}</td>
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
    // select geri al
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

function rdToggleFilterBar() {
  const bar = document.getElementById('rd-filter-bar');
  if (!bar) return;
  bar.hidden = !bar.hidden;
  if (!bar.hidden) document.getElementById('rd-search')?.focus();
}

async function rdExportCsv() {
  const rows = _rdFiltered.length ? _rdFiltered : _rdRows;
  if (!rows.length) {
    toast(_rdSay('Dışa aktarılacak kayıt yok', 'Keine Daten zum Export'), 'warn');
    return;
  }
  const headers = [
    'ID', 'Ad Soyad', 'Numara', 'Cadde', 'PLZ', 'Şehir',
    ..._rdExtraCols.map((c) => c.label),
    'Kampanya', 'Temsilci', 'Saha', 'Durum', 'Randevu', 'Kayıt',
  ];
  const lines = [headers.join(';')];
  rows.forEach((r) => {
    const cells = [
      r.id, r.name, r.phone, r.street, r.plz, r.city,
      ..._rdExtraCols.map((c) => _rdFieldValue(r.raw, c.key)),
      r.camp, r.agent, r.fieldName, r.durumLabel, _rdFmtWhen(r.termin), _rdFmtWhen(r.created),
    ].map((c) => `"${String(c || '').replace(/"/g, '""')}"`);
    lines.push(cells.join(';'));
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `randevular-${_rdToday()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
    _rdExtraCols = _rdDiscoverExtraCols(_rdRows);
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
  window.rdToggleFilterBar = rdToggleFilterBar;
  window.rdExportCsv = rdExportCsv;
  window.rdChangeAgent = rdChangeAgent;
} catch (_) {}
