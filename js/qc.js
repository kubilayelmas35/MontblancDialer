// ─────────────────────────────────────────────
// KK PANELİ — randevu kalite kontrolü
// ─────────────────────────────────────────────

const QC_CAP = 50000;

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

function qcRestrictedIds(scope, userId) {
  if (!scope || typeof scope !== 'object' || !userId) return null;
  if (!Object.prototype.hasOwnProperty.call(scope, userId)) return null;
  return (Array.isArray(scope[userId]) ? scope[userId] : []).map(String).filter(Boolean);
}

function qcScopeEditorHtml(userId, customers, scope, jobSee) {
  const key = String(userId || '');
  const restricted = qcRestrictedIds(scope, key);
  const picked = new Set(restricted || []);
  const allOn = restricted == null;
  const jobsOn = jobSee?.[key] !== false;
  const esc = typeof _uiEsc === 'function' ? _uiEsc : (v) => String(v ?? '');
  const boxes = (customers || []).map((c) => {
    const label = `${c.code ? `${c.code} · ` : ''}${c.name || ''}`.trim();
    return `<label><input type="checkbox" data-qc-scope-user="${esc(key)}" value="${esc(c.id)}" ${picked.has(String(c.id)) ? 'checked' : ''}>${esc(label || c.id)}</label>`;
  }).join('');
  return `<label class="qc-scope-all"><input type="checkbox" data-qc-scope-all="${esc(key)}" ${allOn ? 'checked' : ''} onchange="qcScopeToggleAll(this)">${esc(t('qc.scope.all'))}</label>
<div class="qc-scope-picks"${allOn ? ' hidden' : ''}>${boxes || `<div style="color:var(--text-3);">${esc(t('qc.scope.no_customers'))}</div>`}</div>
<label class="qc-scope-jobs"><input type="checkbox" data-qc-scope-jobs="${esc(key)}" ${jobsOn ? 'checked' : ''}>${esc(t('qc.scope.jobs'))}</label>`;
}

function qcScopeToggleAll(box) {
  const picks = box?.closest('.qc-scope-block')?.querySelector('.qc-scope-picks');
  if (picks) picks.hidden = !!box.checked;
}

function qcReadScopeEditor(root, userId) {
  const jobsEl = root?.querySelector(`[data-qc-scope-jobs="${userId}"]`);
  const jobs = jobsEl ? !!jobsEl.checked : true;
  if (!root) return { customers: null, jobs };
  const all = root.querySelector(`[data-qc-scope-all="${userId}"]`);
  const customers = (!all || all.checked)
    ? null
    : [...root.querySelectorAll(`[data-qc-scope-user="${userId}"]:checked`)].map((el) => el.value).filter(Boolean);
  return { customers, jobs };
}

function qcAgentScopeLabel(user) {
  const scope = window._agentQcScopeByFirm?.[user?.firm_id] || {};
  const customers = (window._agentCustomers || []).filter((c) => String(c.firm_id) === String(user?.firm_id));
  const ids = qcRestrictedIds(scope, user?.id);
  const jobsOn = window._agentQcJobSeeByFirm?.[user?.firm_id]?.[user?.id] !== false;
  const jobs = jobsOn ? t('qc.scope.jobs_on') : t('qc.scope.jobs_off');
  let cust = t('qc.scope.all');
  if (ids != null) {
    if (!ids.length) cust = t('qc.scope.none_picked');
    else {
      const names = ids.map((id) => customers.find((c) => String(c.id) === id)?.name).filter(Boolean);
      cust = !names.length ? String(ids.length) : (names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`);
    }
  }
  return `${cust} · ${jobs}`;
}

async function qcCommitUserScope(firmId, userId, spec) {
  if (!firmId || !userId || typeof sb !== 'function') return;
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`);
  const existing = firms?.[0]?.settings || {};
  const scope = { ...(existing.qc_customer_scope || {}) };
  const jobSee = { ...(existing.qc_job_see || {}) };
  if (!spec) {
    delete scope[userId];
    delete jobSee[userId];
  } else {
    if (spec.customers == null) delete scope[userId];
    else scope[userId] = spec.customers;
    if (spec.jobs === false) jobSee[userId] = false;
    else delete jobSee[userId];
  }
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, qc_customer_scope: scope, qc_job_see: jobSee } }),
  });
  if (window._agentQcScopeByFirm) window._agentQcScopeByFirm[firmId] = scope;
  if (!window._agentQcJobSeeByFirm) window._agentQcJobSeeByFirm = {};
  window._agentQcJobSeeByFirm[firmId] = jobSee;
}

async function loadQcScopeSettings() {
  const card = document.getElementById('qc-scope-card');
  const list = document.getElementById('qc-scope-list');
  if (!card || !list) return;
  const can = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  card.style.display = can ? '' : 'none';
  if (!can) return;
  const host = document.getElementById('qc-scope-firm');
  if (host && typeof renderFirmSelector === 'function') {
    host.style.display = typeof isSuperAdmin === 'function' && isSuperAdmin() ? '' : 'none';
    renderFirmSelector('qc-scope-firm', loadQcScopeSettings);
  }
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  if (!fid) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${_uiEsc(t('qc.scope.needfirm'))}</div>`;
    return;
  }
  list.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${_uiEsc(t('ui.loading'))}</div>`;
  const [users, customers, firms] = await Promise.all([
    sb(`users?firm_id=eq.${fid}&role=eq.qc&select=id,name,email&order=name.asc`).catch(() => []),
    sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => []),
    sb(`firms?id=eq.${fid}&select=settings`).catch(() => []),
  ]);
  const scope = firms?.[0]?.settings?.qc_customer_scope || {};
  const jobSee = firms?.[0]?.settings?.qc_job_see || {};
  window._qcScopeDraftFirm = fid;
  if (!users?.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${_uiEsc(t('qc.scope.empty'))}</div>`;
    return;
  }
  list.innerHTML = users.map((u) => `<div class="qc-scope-block" data-user="${_uiEsc(u.id)}">
<div class="qc-scope-name">${_uiEsc(u.name || '')}<small>${_uiEsc(u.email || '')}</small></div>
${qcScopeEditorHtml(u.id, customers || [], scope, jobSee)}
</div>`).join('');
}

async function saveQcScopeSettings() {
  if (typeof mbIsFirmAdmin === 'function' && !mbIsFirmAdmin()) return;
  const fid = window._qcScopeDraftFirm || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  const list = document.getElementById('qc-scope-list');
  if (!fid || !list) { toast(t('qc.scope.needfirm'), 'warn'); return; }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const scope = { ...(existing.qc_customer_scope || {}) };
    const jobSee = { ...(existing.qc_job_see || {}) };
    list.querySelectorAll('.qc-scope-block').forEach((block) => {
      const id = block.dataset.user;
      const next = qcReadScopeEditor(block, id);
      if (next.customers == null) delete scope[id];
      else scope[id] = next.customers;
      if (next.jobs === false) jobSee[id] = false;
      else delete jobSee[id];
    });
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, qc_customer_scope: scope, qc_job_see: jobSee } }),
    });
    if (window._agentQcScopeByFirm) window._agentQcScopeByFirm[fid] = scope;
    if (!window._agentQcJobSeeByFirm) window._agentQcJobSeeByFirm = {};
    window._agentQcJobSeeByFirm[fid] = jobSee;
    toast(t('qc.scope.saved'), 'ok');
  } catch (e) {
    toast(t('qc.fail') + (e.message || ''), 'err');
  }
}

async function qcFillAgentScope(userId, firmId) {
  const host = document.getElementById('am-qc-scope');
  if (!host || !userId || !firmId) return;
  host.dataset.firm = firmId;
  host.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${_uiEsc(t('ui.loading'))}</div>`;
  const [customers, firms] = await Promise.all([
    sb(`customers?firm_id=eq.${firmId}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => []),
    sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []),
  ]);
  const scope = firms?.[0]?.settings?.qc_customer_scope || {};
  const jobSee = firms?.[0]?.settings?.qc_job_see || {};
  host.innerHTML = `<div class="form-label">${_uiEsc(t('qc.scope.short'))}</div><div class="qc-scope-block" data-user="${_uiEsc(userId)}">${qcScopeEditorHtml(userId, customers || [], scope, jobSee)}</div>`;
  host.dataset.loaded = '1';
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
  const cachedTab = window._qcTabCache && window._qcTabCache[qcTab];
  if (tbody && !(Array.isArray(cachedTab) && cachedTab.length)) {
    tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(10) : `<tr><td colspan="10" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  }
  try {
    const fid = getActiveFirmId() || currentUser?.firm_id || null;
    const resultCfg = typeof loadFirmAppointmentResults === 'function'
      ? await loadFirmAppointmentResults(fid)
      : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
    window._qcResultCfg = resultCfg || [];
    window._qcResultMap = {};
    (window._qcResultCfg || []).forEach((r) => { window._qcResultMap[r.key] = r; });
    if (typeof mbCacheAiStaff === 'function' && fid) await mbCacheAiStaff(fid);
    const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : (fid ? `&firm_id=eq.${fid}` : '');
    const cols = 'id,slot_id,contact_id,termin_tarih,durum,nachname,telefonnummer,telefon2,strasse,plz,ortschaft,hausart,baujahr,qm,heizung,alter_der_heizung,verbrauch_pro_jahr,personen,interesse_an_pv,agent_notu,qc_notu,agent_id,campaign_id,customer_id,firm_id,form_ek';
    let dateQ = '';
    const from = document.getElementById('qc-date-from')?.value || '';
    const to = document.getElementById('qc-date-to')?.value || '';
    if (from && typeof mbInstantGte === 'function') dateQ += `&termin_tarih=gte.${mbInstantGte(from)}`;
    if (to && typeof mbInstantLte === 'function') dateQ += `&termin_tarih=lte.${mbInstantLte(to)}`;
    let scopeIds = null;
    if (String(currentUser?.role || '') === 'qc' && fid) {
      const firms = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
      scopeIds = qcRestrictedIds(firms?.[0]?.settings?.qc_customer_scope, currentUser.id);
    }
    const scopeQ = scopeIds?.length ? `&customer_id=in.(${scopeIds.join(',')})` : '';
    const embed = `appointments?select=${cols},users(name),campaigns(name),customers(name,code),takvim_slots!slot_id(id,tarih,baslangic_saat,bitis_saat,alta_tasindi)${ff}${dateQ}${scopeQ}&order=termin_tarih.desc,id.asc`;
    const gen = ++_qcLoadGen;
    if (!window._qcResultMap[qcTab] && qcTab !== 'all' && qcTab !== '__moved') qcTab = 'qc_bekleniyor';
    const sameQuery = window._qcEmbed === embed && window._qcTabCache;
    if (!sameQuery) {
      window._qcEmbed = embed;
      window._qcTabCache = {};
      window._qcCounts = {};
    }
    window._qcListPartial = false;
    const custP = fid
      ? sb(`customers?firm_id=eq.${fid}&is_active=eq.true&select=id,name,code&order=name.asc`).catch(() => [])
      : Promise.resolve([]);
    const campP = sb(`campaigns?select=id,name,settings,field_config${ff}&limit=500`).catch(() => []);
    if (scopeIds && !scopeIds.length) qcList = [];
    else await qcEnsureTab(qcTab || 'qc_bekleniyor', gen);
    if (gen !== _qcLoadGen) return;
    if (!sameQuery || !window._qcCounts || window._qcCounts.all == null) {
      await qcRefreshCounts(`appointments?select=id,durum${ff}${dateQ}${scopeQ}&order=id.asc`);
    }
    if (gen !== _qcLoadGen) return;
    const qcCapped = !!qcList.capped;
    window._qcCustomers = await custP;
    if (scopeIds) {
      const allow = new Set(scopeIds);
      window._qcCustomers = (window._qcCustomers || []).filter((c) => allow.has(String(c.id)));
    }
    window._qcCampById = {};
    const camps = await campP;
    (camps || []).forEach((c) => { window._qcCampById[c.id] = c; });
    const cap = document.getElementById('qc-cap');
    if (cap) {
      const hit = qcCapped;
      cap.style.display = hit ? '' : 'none';
      cap.textContent = hit ? t('qc.cap').replace('{n}', String(QC_CAP)) : '';
    }
    renderQcTable();
    const recs = await _qcAttachRec(qcList);
    if (gen !== _qcLoadGen) return;
    window._qcRecByContact = recs;
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

let _qcLoadGen = 0;

async function _qcAttachRec(rows) {
  const ids = [...new Set((rows || []).map((r) => r.contact_id).filter((id) => typeof isValidUUID !== 'function' || isValidUUID(id)))];
  const map = {};
  if (!ids.length) return map;
  if (typeof mbHeadCount === 'function') {
    const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
    const n = await mbHeadCount(`call_logs?select=id&recording_url=not.is.null${ff}`).catch(() => null);
    if (n === 0) return map;
  }
  const chunks = [];
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40).join(','));
  for (let i = 0; i < chunks.length; i += 6) {
    const wave = chunks.slice(i, i + 6);
    const parts = await Promise.all(wave.map((chunk) => sb(`call_logs?contact_id=in.(${chunk})&select=id,contact_id,recording_url,duration_sec,started_at,phone&recording_url=not.is.null&order=started_at.desc&limit=400`).catch(() => [])));
    parts.forEach((logs) => {
      (logs || []).forEach((log) => {
        if (!map[log.contact_id] && log.recording_url) map[log.contact_id] = log;
      });
    });
  }
  return map;
}

async function qcRefreshCounts(path) {
  const rows = await mbFetchAll(path).catch(() => []);
  const counts = { all: Array.isArray(rows) ? rows.length : 0 };
  (rows || []).forEach((row) => {
    const key = typeof _qcDurumKey === 'function' ? _qcDurumKey(row) : String(row?.durum || '');
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  window._qcCounts = counts;
}

async function qcEnsureTab(tabKey, gen) {
  const cache = window._qcTabCache || (window._qcTabCache = {});
  const key = tabKey || 'qc_bekleniyor';
  if (cache[key]) {
    if (gen == null || gen === _qcLoadGen) {
      qcList = cache[key];
      renderQcTable();
    }
    return cache[key];
  }
  const embed = window._qcEmbed || '';
  if (!embed || key === '__moved') {
    qcList = [];
    renderQcTable();
    return [];
  }
  const q = key === 'all' ? embed : `${embed}&durum=eq.${encodeURIComponent(key)}`;
  const all = await mbFetchAll(q).catch(() => []);
  cache[key] = Array.isArray(all) ? all : [];
  if ((gen == null || gen === _qcLoadGen) && qcTab === key) {
    qcList = cache[key];
    renderQcTable();
  }
  return cache[key];
}

async function setQcTab(tab) {
  const alias = {
    'qc bekleniyor': 'qc_bekleniyor',
    'başarılı': 'basarili',
    'başarısız': 'basarisiz',
    beklemede: 'beklemede',
  };
  qcTab = alias[tab] || tab || 'qc_bekleniyor';
  await qcEnsureTab(qcTab);
}

let _qcColFilters = {};
let _qcSort = { key: 'when', dir: 'desc' };

function qcColDefs() {
  return [
    { key: 'when', label: t('qc.when') },
    { key: 'name', label: t('qc.name') },
    { key: 'phone', label: t('qc.phone') },
    { key: 'plz', label: t('qc.plz') },
    { key: 'agent', label: t('qc.agent') },
    { key: 'camp', label: t('qc.camp') },
    { key: 'customer', label: t('qc.customer') },
    { key: 'rec', label: t('qc.rec') },
    { key: 'status', label: t('qc.status') },
    { key: '', label: t('qc.action') },
  ];
}

function qcFold(value) {
  return String(value || '').toLocaleLowerCase('tr-TR');
}

function qcMatch(text, query) {
  if (typeof campMatch === 'function') return campMatch(text, query);
  const q = qcFold(query).trim();
  if (!q) return true;
  return qcFold(text).includes(q);
}

function qcCustomerText(row) {
  const id = row?.customer_id;
  const hit = (window._qcCustomers || []).find((c) => String(c.id) === String(id));
  return hit?.name || row?.customers?.name || '';
}

function qcRecInfo(row) {
  const rec = row?.contact_id ? window._qcRecByContact?.[row.contact_id] : null;
  if (!rec?.recording_url) return { text: '', n: 0 };
  const sec = Number(rec.duration_sec) || 0;
  const text = sec ? `${Math.floor(sec / 60)}m${sec % 60}s` : t('qc.rec');
  return { text, n: sec || 1 };
}

function qcFields(row) {
  const wall = _qcWall(row);
  const time = String(wall.time || '').slice(0, 5);
  const when = wall.dayKey && time ? `${wall.dayKey}T${time}` : String(row?.termin_tarih || '');
  const rec = qcRecInfo(row);
  return {
    when,
    whenText: `${wall.day || ''} ${wall.time || ''}`.trim(),
    name: row?.nachname || '',
    phone: `${row?.telefonnummer || ''} ${row?.telefon2 || ''}`.trim(),
    plz: `${row?.plz || ''} ${row?.ortschaft || ''}`.trim(),
    agent: row?.users?.name || '',
    camp: row?.campaigns?.name || window._qcCampById?.[row.campaign_id]?.name || '',
    customer: qcCustomerText(row),
    rec: rec.text,
    recN: rec.n,
    status: _qcResultLabel(_qcDurumKey(row)),
  };
}

function qcFilterText(fields, key) {
  if (key === 'when') return fields.whenText;
  return fields[key] || '';
}

function qcBySort(a, b) {
  const key = _qcSort.key || 'when';
  const dir = _qcSort.dir === 'asc' ? 1 : -1;
  const fa = qcFields(a);
  const fb = qcFields(b);
  const av = key === 'rec' ? fa.recN : (key === 'when' ? fa.when : qcFilterText(fa, key));
  const bv = key === 'rec' ? fb.recN : (key === 'when' ? fb.when : qcFilterText(fb, key));
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), 'tr', { numeric: true, sensitivity: 'base' });
  if (!cmp) cmp = String(a?.id || '').localeCompare(String(b?.id || ''));
  return cmp * dir;
}

function qcVisibleRows() {
  const search = qcFold(document.getElementById('qc-search')?.value || '').trim();
  let list = (qcList || []).filter((row) => _qcInDates(row) && _qcMatchesTab(row));
  if (search) {
    list = list.filter((row) => {
      const f = qcFields(row);
      const blob = [f.whenText, f.name, f.phone, f.plz, f.agent, f.camp, f.customer, f.rec, f.status].join(' ');
      return qcFold(blob).includes(search);
    });
  }
  list = list.filter((row) => {
    const f = qcFields(row);
    return qcColDefs().every((col) => !col.key || qcMatch(qcFilterText(f, col.key), _qcColFilters[col.key] || ''));
  });
  list.sort(qcBySort);
  return list;
}

function qcPaintNearBtn() {
  const btn = document.getElementById('qc-near-btn');
  if (!btn) return;
  const early = _qcSort.key === 'when' && _qcSort.dir === 'asc';
  btn.textContent = early ? t('qc.when_early') : t('qc.when_late');
  btn.classList.toggle('active', early);
  btn.title = t('qc.when_hint');
  const lbl = document.getElementById('qc-near-lbl');
  if (lbl) lbl.textContent = t('qc.when_label');
}

function qcPaintHead() {
  const head = document.getElementById('qc-thead');
  if (!head) return;
  const esc = typeof _uiEsc === 'function' ? _uiEsc : (v) => String(v ?? '');
  head.innerHTML = `<tr>${qcColDefs().map((col) => {
    if (!col.key) return `<th>${esc(col.label)}</th>`;
    const on = _qcSort.key === col.key;
    const upTitle = col.key === 'when' ? t('qc.when_early') : t('camp.sort.asc');
    const downTitle = col.key === 'when' ? t('qc.when_late') : t('camp.sort.desc');
    const sort = `<span class="camp-sort"><button type="button" class="camp-sort-btn${on && _qcSort.dir === 'asc' ? ' is-on' : ''}" title="${esc(upTitle)}" onclick="event.stopPropagation();setQcSort('${col.key}','asc')"><i class="ph ph-caret-up"></i></button><button type="button" class="camp-sort-btn${on && _qcSort.dir === 'desc' ? ' is-on' : ''}" title="${esc(downTitle)}" onclick="event.stopPropagation();setQcSort('${col.key}','desc')"><i class="ph ph-caret-down"></i></button></span>`;
    const filter = `<input class="camp-col-filter" value="${esc(_qcColFilters[col.key] || '')}" aria-label="${esc(col.label)}" oninput="setQcColFilter('${col.key}', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">`;
    return `<th><span class="camp-sort-label">${esc(col.label)}${sort}</span>${filter}</th>`;
  }).join('')}</tr>`;
  qcPaintNearBtn();
}

function setQcColFilter(key, value) {
  _qcColFilters[key] = String(value || '');
  qcPaintBody();
}

function setQcSort(key, dir) {
  _qcSort = { key: key || 'when', dir: dir === 'asc' ? 'asc' : 'desc' };
  qcPaintHead();
  qcPaintBody();
}

function qcToggleNear() {
  if (_qcSort.key === 'when' && _qcSort.dir === 'asc') setQcSort('when', 'desc');
  else setQcSort('when', 'asc');
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
  const countOf = (key) => {
    if (window._qcCounts && window._qcCounts[key] != null && key !== '__moved') return window._qcCounts[key];
    return list.filter((row) => (key === 'all' ? true : key === '__moved' ? _qcMoved(row) : _qcDurumKey(row) === key)).length;
  };
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
  renderQcTabs((qcList || []).filter((row) => _qcInDates(row)));
  qcPaintHead();
  qcPaintBody();
}

function qcPaintBody() {
  const tbody = document.getElementById('qc-tbody');
  if (!tbody) return;
  const canAssignField = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  const hasCustomers = (window._qcCustomers || []).length > 0;
  const list = qcVisibleRows();
  const cols = qcColDefs().length;
  if (!list.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(cols, 'ui.no_records') : `<tr><td colspan="${cols}" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
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
    const recHtml = rec?.recording_url && typeof mbRecPlayerHtml === 'function'
      ? mbRecPlayerHtml(rec.id, rec.recording_url, rec.duration_sec, typeof mbRecMeta === 'function' ? mbRecMeta(rec, { last_name: row.nachname || '', phone: row.telefonnummer || '' }) : null)
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
    const resultBtn = (window._qcResultCfg || []).length
      ? `<button type="button" class="icon-btn qc-result-btn" title="${_uiEsc(t('qc.pick'))}" onclick="qcToggleResultMenu(this,'${_uiEsc(row.id)}')"><i class="ph ph-caret-down"></i></button>`
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
<td><div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;">
<button type="button" class="icon-btn" onclick="qcOpenPersonCard('${_uiEsc(row.id)}')" title="${_uiEsc(t('qc.card'))}"><i class="ph ph-user"></i></button>
<button type="button" class="icon-btn" onclick="openQcDetail('${_uiEsc(row.id)}')" title="${_uiEsc(t('qc.detail'))}"><i class="ph ph-magnifying-glass"></i></button>
${typeof qcCallinButton === 'function' ? qcCallinButton(row) : ''}
${assignBtn}${resultBtn}
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
${typeof qcCallinButton === 'function' ? qcCallinButton(row) : ''}
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${fields}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-top:8px;">
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.agent'))}</div><div style="font-weight:700;">${_uiEsc(row.users?.name || '—')}</div></div>
<div style="background:var(--bg-3);padding:8px;border-radius:6px;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.camp'))}</div><div class="qc-camp" style="font-weight:700;" title="${_uiEsc(campName)}">${_uiEsc(campName)}</div></div>
${row.agent_notu ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">${_uiEsc(t('qc.agent_note'))}</div><div>${_uiEsc(row.agent_notu)}</div></div>` : ''}
${rec?.recording_url && typeof mbRecPlayerHtml === 'function' ? `<div style="background:var(--bg-3);padding:8px;border-radius:6px;grid-column:1/-1;"><div style="font-size:10px;color:var(--text-3);margin-bottom:6px;">${_uiEsc(t('qc.rec'))}</div>${mbRecPlayerHtml(rec.id, rec.recording_url, rec.duration_sec, typeof mbRecMeta === 'function' ? mbRecMeta(rec, { last_name: row.nachname || '', phone: row.telefonnummer || '' }) : null)}</div>` : ''}
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

function qcCloseResultMenu() {
  document.getElementById('qc-result-menu')?.remove();
}

function qcToggleResultMenu(btn, apptId) {
  const open = document.getElementById('qc-result-menu');
  if (open && open.dataset.appt === String(apptId)) {
    open.remove();
    return;
  }
  open?.remove();
  const items = (window._qcResultCfg || []).map((row) => {
    const color = row.color || '#64748b';
    return `<button type="button" class="qc-result-opt" data-key="${_uiEsc(row.key)}"><span class="qc-dot" style="background:${_uiEsc(color)}"></span><span>${_uiEsc(_qcResultLabel(row.key))}</span></button>`;
  }).join('');
  if (!items) return;
  const menu = document.createElement('div');
  menu.id = 'qc-result-menu';
  menu.className = 'qc-result-menu';
  menu.dataset.appt = String(apptId);
  menu.innerHTML = items;
  document.body.appendChild(menu);
  const box = btn.getBoundingClientRect();
  const width = menu.offsetWidth || 200;
  const height = menu.offsetHeight || 0;
  let left = Math.min(box.left, window.innerWidth - width - 8);
  if (left < 8) left = 8;
  let top = box.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, box.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelectorAll('.qc-result-opt').forEach((opt) => {
    opt.onclick = () => {
      const key = opt.getAttribute('data-key') || '';
      qcCloseResultMenu();
      quickQcUpdate(apptId, key);
    };
  });
  if (!window._qcMenuBound) {
    window._qcMenuBound = true;
    document.addEventListener('click', (ev) => {
      if (ev.target.closest?.('#qc-result-menu') || ev.target.closest?.('.qc-result-btn')) return;
      qcCloseResultMenu();
    });
    document.getElementById('qc-scroll')?.addEventListener('scroll', qcCloseResultMenu, { passive: true });
  }
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
    const slotId = slot?.id || row.slot_id;
    let openedSlot = false;
    if (resultCfg.auto_move_down && slotId && !_qcMoved(row)) {
      await sb(`takvim_slots?id=eq.${slotId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ alta_tasindi: true, durum: 'dolu' }),
      }).catch(() => {});
      if (typeof openReplacementForSlot === 'function') openedSlot = await openReplacementForSlot(slotId).catch(() => false);
      if (typeof ariaAfterCalendar === 'function') {
        void ariaAfterCalendar(openedSlot ? 'alta-open' : 'alta', {
          day: slot?.tarih || '',
          saat: slot?.baslangic_saat || '',
          campId: row.campaign_id,
        });
      }
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
    toast(openedSlot ? t('cal.down.slot') : t('qc.saved'), 'ok');
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
