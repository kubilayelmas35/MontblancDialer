// ─────────────────────────────────────────────
// CAMPAIGNS — kampanya yönetimi
// ─────────────────────────────────────────────

function campT(key, fb) {
  return typeof t === 'function' ? t(key) : fb;
}

let _mbFieldTpl = null;
let _ncCopySettings = null;

function mbSanitizeFieldTemplates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).slice(0, 30).forEach((name) => {
    const key = String(name || '').trim().slice(0, 60);
    const rows = raw[name];
    if (!key || !Array.isArray(rows)) return;
    const fields = rows.slice(0, 40).map((f) => {
      const fieldKey = String(f?.key || '').trim().slice(0, 40);
      if (!fieldKey) return null;
      const row = {
        key: fieldKey,
        label: String(f?.label || fieldKey).slice(0, 80),
        type: String(f?.type || 'text').slice(0, 20),
        show: f?.show !== false,
        locked: !!f?.locked,
      };
      if (Array.isArray(f?.options) && f.options.length) {
        row.options = f.options.slice(0, 30).map((o) => String(o).slice(0, 40)).filter(Boolean);
      }
      return row;
    }).filter(Boolean);
    if (fields.length) out[key] = fields;
  });
  return out;
}

function mbFieldTemplates() {
  if (_mbFieldTpl) return _mbFieldTpl;
  try {
    _mbFieldTpl = mbSanitizeFieldTemplates(JSON.parse(localStorage.getItem('mb_field_templates') || '{}'));
  } catch (e) {
    _mbFieldTpl = {};
  }
  return _mbFieldTpl;
}

function mbSaveFieldTemplates(tpls) {
  _mbFieldTpl = mbSanitizeFieldTemplates(tpls);
  try { localStorage.setItem('mb_field_templates', JSON.stringify(_mbFieldTpl)); } catch (e) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbAdoptFieldTemplates(remoteRaw, migrateLocal) {
  const remoteTpl = mbSanitizeFieldTemplates(remoteRaw);
  if (Object.keys(remoteTpl).length || !migrateLocal) {
    _mbFieldTpl = remoteTpl;
    try { localStorage.setItem('mb_field_templates', JSON.stringify(_mbFieldTpl)); } catch (e) {}
  } else {
    let local = {};
    try { local = mbSanitizeFieldTemplates(JSON.parse(localStorage.getItem('mb_field_templates') || '{}')); } catch (e) {}
    _mbFieldTpl = local;
    if (Object.keys(local).length && typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
  }
  if (typeof renderNcTemplateSelect === 'function' && document.getElementById('m-new-camp')?.classList.contains('open')) {
    renderNcTemplateSelect();
  }
}

function mbCanEditDid() {
  return typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
}

function syncDidVisibility() {
  const show = mbCanEditDid();
  const nc = document.getElementById('nc-did-row');
  const cd = document.getElementById('cd-did-row');
  const sub = document.getElementById('cd-did');
  if (nc) nc.style.display = show ? '' : 'none';
  if (cd) cd.style.display = show ? '' : 'none';
  if (sub && !show) sub.style.display = 'none';
}

async function firmOutboundDid(firmId) {
  if (!firmId) return '';
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const settings = rows?.[0]?.settings || {};
  if (typeof mbLineDefaultFromSettings === 'function') {
    const picked = mbLineDefaultFromSettings(settings);
    if (picked) return picked;
  }
  return String(settings?.dialer?.outbound_did || '').replace(/[\s()-]/g, '');
}

async function attachCampaignPeople() {
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  let users = [];
  let sessions = [];
  try {
    [users, sessions] = await Promise.all([
      sb(`users?select=id,name${ff}&limit=500`),
      sb(`agent_sessions?select=agent_id,agent_name,campaign_id,status${ff}&limit=500`),
    ]);
  } catch (e) {
    users = [];
    sessions = [];
  }
  const nameById = {};
  (users || []).forEach((u) => { if (u?.id && u.name) nameById[u.id] = u.name; });
  (campaigns || []).forEach((c) => {
    const people = new Map();
    (c.agent_campaigns || []).forEach((ac) => {
      const id = ac.agent_id;
      if (!id) return;
      people.set(id, { agent_id: id, name: nameById[id] || '', assigned: true, live: false });
    });
    (sessions || []).forEach((s) => {
      if (s.campaign_id !== c.id) return;
      const prev = people.get(s.agent_id);
      if (!prev) return;
      if (s.status && s.status !== 'offline') prev.live = true;
    });
    c._people = [...people.values()];
  });
}

function mbPersonnelOff(camp) {
  const raw = (typeof getCampSettings === 'function' ? getCampSettings(camp || {}) : camp?.settings)?.personnel_off;
  return Array.isArray(raw) ? raw.map(String) : [];
}

function mbUserSeesCampaign(camp, userId) {
  if (!userId) return false;
  return !mbPersonnelOff(camp).includes(String(userId));
}

function mbCampDefaultCustomerId(campOrId) {
  const camp = campOrId && typeof campOrId === 'object'
    ? campOrId
    : (typeof campaigns !== 'undefined' ? (campaigns || []).find((c) => String(c.id) === String(campOrId || '')) : null);
  const raw = (typeof getCampSettings === 'function' ? getCampSettings(camp || {}) : camp?.settings)?.default_customer_id;
  const id = String(raw || '').trim();
  return id || null;
}

function campPersonLabel(person) {
  const name = String(person?.name || '').trim();
  if (name && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name)) return name;
  return campT('camp.agent.unnamed', 'Temsilci');
}

async function loadCampaigns() {
if (typeof mbEnsureSession === 'function') {
  const ok = await mbEnsureSession();
  if (!ok) return;
}
renderFirmSelector('camp-firm-selector', loadCampaigns);
try {
const ff = getFirmFilter('&');
campaigns = await sb(`campaigns?select=*,queues(*),agent_campaigns(*)&order=name.asc${ff}`);
campaigns = campaigns || [];
await attachCampaignPeople();
await reconcileQueueTotals(campaigns);
await attachCampaignDialCounts();
renderCampGrid();
const detailOpen = document.getElementById('camp-detail')?.style.display === 'block';
if (detailOpen && currentCampId && campaigns.some((c) => c.id === currentCampId)) {
  openCampDetail(currentCampId, { keepTab: true, silent: true });
}
if (window._mbOpenCampId && campaigns.some((c) => c.id === window._mbOpenCampId)) {
  openCampDetail(window._mbOpenCampId);
  window._mbOpenCampId = '';
}
if (typeof updateTopbarStats === 'function') updateTopbarStats();
} catch(e){ toast(campT('camp.load.err','Kampanyalar yüklenemedi: ')+e.message,'err'); console.error(e); }
}

function campViewMode() {
  try { return localStorage.getItem('mb-camp-view') === 'rows' ? 'rows' : 'cards'; }
  catch (_) { return 'cards'; }
}

function paintCampViewToggle() {
  const mode = campViewMode();
  document.getElementById('camp-view-cards')?.classList.toggle('is-on', mode === 'cards');
  document.getElementById('camp-view-rows')?.classList.toggle('is-on', mode === 'rows');
  document.getElementById('camp-grid')?.classList.toggle('camp-grid--rows', mode === 'rows');
}

function setCampView(mode) {
  try { localStorage.setItem('mb-camp-view', mode === 'rows' ? 'rows' : 'cards'); } catch (_) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
  paintCampViewToggle();
  renderCampGrid();
}

function campStats(c) {
  const qs = c?.queues || [];
  const total = qs.reduce((s, q) => s + (q.total_contacts || 0), 0);
  const dialed = qs.reduce((s, q) => s + (q.dialed_count || 0), 0);
  return {
    qs,
    total,
    dialed,
    pct: total > 0 ? Math.round(dialed / total * 100) : 0,
    agents: (c?._people || c?.agent_campaigns || []).length,
  };
}

let _campSearch = '';
let _campColFilters = {};

function setCampSearch(value) {
  _campSearch = String(value || '').trim();
  renderCampGrid();
}

function setCampColFilter(key, value) {
  _campColFilters[key] = String(value || '');
  if (campViewMode() === 'rows') {
    const tbody = document.querySelector('#camp-grid .camp-rows tbody');
    if (tbody) {
      tbody.innerHTML = campRowsBody();
      return;
    }
  }
  renderCampGrid();
}

function campFold(value) {
  return String(value || '').toLocaleLowerCase('tr-TR');
}

function campMatch(text, query) {
  const q = campFold(query).trim();
  if (!q) return true;
  const hay = campFold(text);
  if (hay.includes(q)) return true;
  const digits = q.replace(/[^\d]/g, '');
  return !!digits && hay.replace(/[^\d]/g, '').includes(digits);
}

function campShowFirm() {
  return typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()
    && !(typeof getActiveFirmId === 'function' && getActiveFirmId());
}

function campFirmName(firmId) {
  const row = (typeof _allFirms !== 'undefined' ? _allFirms : []).find((f) => String(f.id) === String(firmId));
  return String(row?.name || '').trim();
}

let _campSort = { key: 'name', dir: 'asc' };

function campSortValue(c, key) {
  const f = campRowFields(c, false);
  const st = f.st;
  if (key === 'status') return f.statusLabel;
  if (key === 'did') return f.didText;
  if (key === 'queues') return st.qs.length;
  if (key === 'total') return st.total;
  if (key === 'dialed') return st.dialed;
  if (key === 'left') return c._left == null ? -1 : Number(c._left);
  if (key === 'stuck') return c._stuck == null ? -1 : Number(c._stuck);
  if (key === 'pct') return st.pct;
  if (key === 'speed') return Number(c.dial_speed) || 0;
  if (key === 'agents') return st.agents;
  if (key === 'created') return String(c.created_at || '');
  return String(c.name || '');
}

function campBySort(a, b) {
  const key = _campSort.key || 'name';
  const dir = _campSort.dir === 'desc' ? -1 : 1;
  const av = campSortValue(a, key);
  const bv = campSortValue(b, key);
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), 'tr', { numeric: true, sensitivity: 'base' });
  if (!cmp) cmp = String(a?.name || '').localeCompare(String(b?.name || ''), 'tr', { numeric: true, sensitivity: 'base' });
  return cmp * dir;
}

function setCampSort(key, dir) {
  _campSort = { key: key || 'name', dir: dir === 'desc' ? 'desc' : 'asc' };
  renderCampGrid();
}

function campVisibleList() {
  const q = _campSearch.toLocaleLowerCase('tr-TR');
  return (campaigns || []).filter((c) => {
    if (q) {
      const name = String(c.name || '').toLocaleLowerCase('tr-TR');
      const firm = campFirmName(c.firm_id).toLocaleLowerCase('tr-TR');
      if (!name.includes(q) && !firm.includes(q)) return false;
    }
    const text = campRowFields(c, campShowFirm()).text;
    return Object.entries(_campColFilters).every(([key, raw]) => !key || campMatch(text[key] || '', raw));
  }).sort(campBySort);
}

function campColDefs() {
  const defs = [
    { key: 'name', label: campT('camp.col.name', 'Ad') },
    { key: 'status', label: campT('camp.queue.status', 'Durum') },
  ];
  if (mbCanEditDid()) defs.push({ key: 'did', label: campT('camp.col.did', 'Arayan numara') });
  defs.push(
    { key: 'queues', label: campT('camp.kpi.queues', 'Kuyruk'), num: true },
    { key: 'total', label: campT('camp.kpi.total', 'Toplam'), num: true },
    { key: 'dialed', label: campT('camp.kpi.dialed', 'Aranan'), num: true },
    { key: 'left', label: campT('camp.kpi.left', 'Kalan'), num: true },
    { key: 'stuck', label: campT('camp.kpi.stuck', 'Sonuçsuz'), num: true },
    { key: 'pct', label: campT('camp.kpi.progress', 'İlerleme'), num: true },
    { key: 'speed', label: campT('camp.speed', 'Hız'), num: true },
    { key: 'agents', label: campT('camp.kpi.agent', 'Temsilci'), num: true },
    { key: 'created', label: campT('camp.col.created', 'Oluşturma') },
    { key: '', label: '' },
  );
  return defs;
}

function campRowFields(c, showFirm) {
  const st = campStats(c);
  const didRaw = String(c.telnyx_did || '').trim();
  const didBad = didRaw && typeof mbIsE164 === 'function' && !mbIsE164(didRaw);
  const didText = didRaw || campT('camp.did.none', 'DID atanmadı');
  const statusLabel = c.status === 'active'
    ? campT('camp.status.active', 'Aktif')
    : c.status === 'paused'
      ? campT('camp.status.paused', 'Duraklatıldı')
      : campT('camp.status.done', 'Tamamlandı');
  const firmLine = showFirm ? campFirmName(c.firm_id) : '';
  const desc = String(c.description || '').trim();
  return {
    st, didBad, didText, statusLabel, firmLine, desc,
    text: {
      name: [c.name, firmLine, desc].filter(Boolean).join(' '),
      status: statusLabel,
      did: didBad ? `${didText} ${campT('camp.did.invalid', 'DID geçersiz')}` : didText,
      queues: String(st.qs.length),
      total: st.total.toLocaleString('tr-TR'),
      dialed: st.dialed.toLocaleString('tr-TR'),
      left: campCountText(c._left),
      stuck: campCountText(c._stuck),
      pct: `${st.pct}%`,
      speed: `${c.dial_speed} ${campT('camp.speed.unit', 'hat')}`,
      agents: String(st.agents),
      created: campCreatedLabel(c.created_at),
    },
  };
}

async function attachCampaignDialCounts() {
  const ids = (campaigns || []).map((c) => c.id).filter(Boolean);
  const left = {};
  const stuck = {};
  const chunk = 6;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    await Promise.all(slice.map(async (id) => {
      const [remain, calling] = await Promise.all([
        typeof mbDashCount === 'function'
          ? mbDashCount(`contacts?select=id&campaign_id=eq.${id}&status=in.(pending,no_answer,callback)`)
          : null,
        typeof mbDashCount === 'function'
          ? mbDashCount(`contacts?select=id&campaign_id=eq.${id}&status=eq.calling`)
          : null,
      ]);
      left[id] = remain;
      stuck[id] = calling;
    }));
  }
  (campaigns || []).forEach((c) => {
    c._left = Object.prototype.hasOwnProperty.call(left, c.id) ? left[c.id] : null;
    c._stuck = Object.prototype.hasOwnProperty.call(stuck, c.id) ? stuck[c.id] : null;
  });
}

function campCountText(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('tr-TR');
}

function campCreatedLabel(iso) {
  if (!iso) return '—';
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return String(iso).slice(0, 16).replace('T', ' ');
}

function paintCampSelection() {
  const open = document.getElementById('camp-detail')?.style.display === 'block';
  document.querySelectorAll('.camp-card, .camp-row').forEach((el) => {
    el.classList.toggle('sel', !!(open && currentCampId && el.dataset.campId === currentCampId));
  });
}

function renderCampGrid() {
const grid = document.getElementById('camp-grid');
if (!grid) return;
paintCampViewToggle();
if (!campaigns.length) {
grid.innerHTML = `<div style="color:var(--text-3);padding:32px;text-align:center;grid-column:1/-1;font-size:13px;">${campT('camp.empty','Henüz kampanya yok')}</div>`;
return;
}
const visible = campVisibleList();
const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
const detailOpen = document.getElementById('camp-detail')?.style.display === 'block';
const showFirm = campShowFirm();
if (campViewMode() === 'rows') {
  grid.innerHTML = renderCampRows(esc, detailOpen, visible, showFirm);
  mbFitCampNames(grid);
  return;
}
if (!visible.length) {
grid.innerHTML = `<div style="color:var(--text-3);padding:32px;text-align:center;grid-column:1/-1;font-size:13px;">${campT('camp.search.empty','Eşleşen kampanya yok')}</div>`;
return;
}
grid.innerHTML = visible.map(c=>{
const st = campStats(c);
const qs = st.qs;
const tot = st.total;
const dia = st.dialed;
const pct = st.pct;
const ags = st.agents;
const sb2= c.status==='active'
?`<span class="badge badge-green">${esc(campT('camp.status.active','Aktif'))}</span>`
:c.status==='paused'
?`<span class="badge badge-yellow">${esc(campT('camp.status.paused','Duraklatıldı'))}</span>`
:`<span class="badge badge-gray">${esc(campT('camp.status.done','Tamamlandı'))}</span>`;
const didRaw = String(c.telnyx_did || '').trim();
const didBad = didRaw && typeof mbIsE164 === 'function' && !mbIsE164(didRaw);
const didText = !mbCanEditDid() ? '' : (!didRaw
  ? campT('camp.did.none','DID atanmadı')
  : (didBad ? `${didRaw} · ${campT('camp.did.invalid','DID geçersiz')}` : didRaw));
const descLine = String(c.description || '').trim();
const firmLine = showFirm ? campFirmName(c.firm_id) : '';
const empty = c._left === 0;
const stuckHot = c._stuck > 0;
const pauseLabel = c.status==='active'
  ? `<i class="ph ph-pause"></i> ${esc(campT('camp.pause','Duraklat'))}`
  : `<i class="ph ph-play"></i> ${esc(campT('camp.start','Başlat'))}`;
const sel = detailOpen && currentCampId === c.id ? ' sel' : '';
const displayName = String(mbCampSettings(c).display_name || '').trim();
const displayLine = displayName && displayName !== String(c.name || '') ? `<div class="queue-sub">${esc(displayName)}</div>` : '';
return `<div class="camp-card${sel}${empty ? ' is-empty' : ''}" data-camp-id="${esc(c.id)}" onclick="openCampDetail('${c.id}')">
<div class="camp-card-head">
<div class="camp-card-main"><div class="camp-name" title="${esc(c.name)}">${esc(c.name)}</div>${displayLine}${firmLine ? `<div class="camp-firm">${esc(firmLine)}</div>` : ''}${didText ? `<div class="camp-did">${esc(didText)}</div>` : ''}${descLine ? `<div class="queue-sub" title="${esc(descLine)}">${esc(descLine)}</div>` : ''}</div>
<div style="display:flex;gap:12px;flex-shrink:0;align-items:center;" onclick="event.stopPropagation()">
${sb2}
<button class="icon-btn" onclick="openCampFieldSettings('${c.id}')" title="${esc(campT('camp.field.title','Alan Ayarları'))}" aria-label="${esc(campT('camp.field.title','Alan Ayarları'))}"><i class="ph ph-gear" aria-hidden="true"></i></button>
<button class="icon-btn" onclick="deleteCampaign('${c.id}')" style="border-color:var(--red);color:var(--red);margin-left:4px;" title="${esc(campT('camp.delete','Sil'))}" aria-label="${esc(campT('camp.delete','Sil'))}"><i class="ph ph-trash" aria-hidden="true"></i></button>
</div>
</div>
<div class="camp-kpi">
<div class="camp-kpi-item"><div class="camp-kpi-val">${tot.toLocaleString()}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.total','Toplam'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--accent);">${dia.toLocaleString()}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.dialed','Aranan'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val${empty ? ' is-hot' : ''}">${campCountText(c._left)}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.left','Kalan'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val">${qs.length}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.queues','Kuyruk'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val" style="color:var(--text-2);">${ags}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.agent','Temsilci'))}</div></div>
<div class="camp-kpi-item"><div class="camp-kpi-val${stuckHot ? ' is-hot' : ''}">${campCountText(c._stuck)}</div><div class="camp-kpi-lbl">${esc(campT('camp.kpi.stuck','Sonuçsuz'))}</div></div>
</div>
<div>
<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:4px;">
<span>${esc(campT('camp.kpi.progress','İlerleme'))}</span><span style="color:var(--accent);font-weight:700;font-family:var(--mono);">${pct}%</span>
</div>
<div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;"></div></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;">
<span style="font-size:12px;color:var(--text-3);">${esc(campT('camp.speed','Hız'))}: <strong style="color:var(--accent);font-family:var(--mono);">${esc(c.dial_speed)} ${esc(campT('camp.speed.unit','hat'))}</strong></span>
<button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();toggleCampStatus('${c.id}','${c.status}')">
${pauseLabel}
</button>
</div>
</div>`;
}).join('');
mbFitCampNames(grid);
}

function mbFitCampNames(root) {
  if (!root || typeof opsFitMarquee !== 'function') return;
  root.querySelectorAll('.camp-name, .camp-row-name').forEach((el) => {
    opsFitMarquee(el, el.getAttribute('title') || el.textContent || '');
  });
}

function campRowsBody() {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const detailOpen = document.getElementById('camp-detail')?.style.display === 'block';
  const showFirm = campShowFirm();
  const defs = campColDefs();
  const visible = campVisibleList();
  if (!visible.length) {
    return `<tr class="camp-filter-empty"><td colspan="${defs.length}">${esc(campT('camp.search.empty', 'Eşleşen kampanya yok'))}</td></tr>`;
  }
  return visible.map((c) => {
    const f = campRowFields(c, showFirm);
    const status = c.status === 'active'
      ? `<span class="badge badge-green">${esc(f.statusLabel)}</span>`
      : c.status === 'paused'
        ? `<span class="badge badge-yellow">${esc(f.statusLabel)}</span>`
        : `<span class="badge badge-gray">${esc(f.statusLabel)}</span>`;
    const pauseTitle = c.status === 'active' ? campT('camp.pause', 'Duraklat') : campT('camp.start', 'Başlat');
    const pauseIcon = c.status === 'active' ? 'ph-pause' : 'ph-play';
    const sel = detailOpen && currentCampId === c.id ? ' sel' : '';
    const empty = c._left === 0;
    const cells = {
      name: `<td><span class="camp-row-name" title="${esc(c.name)}">${esc(c.name)}</span>${f.firmLine ? `<span class="camp-row-desc">${esc(f.firmLine)}</span>` : ''}${f.desc ? `<span class="camp-row-desc">${esc(f.desc)}</span>` : ''}</td>`,
      status: `<td>${status}</td>`,
      did: `<td class="num" style="text-align:left;color:${f.didBad ? 'var(--yellow)' : 'inherit'};" title="${esc(f.didBad ? campT('camp.did.invalid', 'DID geçersiz') : f.didText)}">${esc(f.didText)}</td>`,
      queues: `<td class="num">${f.st.qs.length}</td>`,
      total: `<td class="num">${f.text.total}</td>`,
      dialed: `<td class="num">${f.text.dialed}</td>`,
      left: `<td class="num${empty ? ' is-hot' : ''}">${esc(f.text.left)}</td>`,
      stuck: `<td class="num${c._stuck > 0 ? ' is-hot' : ''}">${esc(f.text.stuck)}</td>`,
      pct: `<td class="num">${f.st.pct}%</td>`,
      speed: `<td class="num">${esc(c.dial_speed)} ${esc(campT('camp.speed.unit', 'hat'))}</td>`,
      agents: `<td class="num">${f.st.agents}</td>`,
      created: `<td>${esc(f.text.created)}</td>`,
      '': `<td onclick="event.stopPropagation()"><div class="camp-row-actions">
<button type="button" class="icon-btn" title="${esc(pauseTitle)}" aria-label="${esc(pauseTitle)}" onclick="toggleCampStatus('${c.id}','${c.status}')"><i class="ph ${pauseIcon}"></i></button>
<button type="button" class="icon-btn" title="${esc(campT('camp.field.title', 'Alan Ayarları'))}" aria-label="${esc(campT('camp.field.title', 'Alan Ayarları'))}" onclick="openCampFieldSettings('${c.id}')"><i class="ph ph-gear"></i></button>
<button type="button" class="icon-btn" title="${esc(campT('camp.delete', 'Sil'))}" aria-label="${esc(campT('camp.delete', 'Sil'))}" style="border-color:var(--red);color:var(--red);" onclick="deleteCampaign('${c.id}')"><i class="ph ph-trash"></i></button>
</div></td>`,
    };
    return `<tr class="camp-row${sel}${empty ? ' is-empty' : ''}" data-camp-id="${esc(c.id)}" onclick="openCampDetail('${c.id}')">${defs.map((col) => cells[col.key] || '').join('')}</tr>`;
  }).join('');
}

function renderCampRows(esc) {
  const defs = campColDefs();
  const head = defs.map((col) => {
    const filter = col.key
      ? `<input class="camp-col-filter" value="${esc(_campColFilters[col.key] || '')}" oninput="setCampColFilter('${col.key}', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">`
      : '';
    const on = col.key && _campSort.key === col.key;
    const sort = col.key
      ? `<span class="camp-sort"><button type="button" class="camp-sort-btn${on && _campSort.dir === 'asc' ? ' is-on' : ''}" title="${esc(campT('camp.sort.asc', 'Küçükten büyüğe'))}" aria-label="${esc(campT('camp.sort.asc', 'Küçükten büyüğe'))}" onclick="event.stopPropagation();setCampSort('${col.key}','asc')"><i class="ph ph-caret-up"></i></button><button type="button" class="camp-sort-btn${on && _campSort.dir === 'desc' ? ' is-on' : ''}" title="${esc(campT('camp.sort.desc', 'Büyükten küçüğe'))}" aria-label="${esc(campT('camp.sort.desc', 'Büyükten küçüğe'))}" onclick="event.stopPropagation();setCampSort('${col.key}','desc')"><i class="ph ph-caret-down"></i></button></span>`
      : '';
    return `<th class="${col.num ? 'num' : ''}"><span class="camp-sort-label">${esc(col.label)}${sort}</span>${filter}</th>`;
  }).join('');
  return `<div class="camp-rows-wrap"><table class="camp-rows"><thead><tr>${head}</tr></thead><tbody>${campRowsBody()}</tbody></table></div>`;
}

function openCampDetail(id, opts) {
currentCampId = id;
const c = campaigns.find(x=>x.id===id);
if (!c) return;
document.getElementById('camp-detail').style.display = 'block';
paintCampSelection();
document.getElementById('cd-name').textContent = mbCampShown(c);
const didRaw = String(c.telnyx_did || '').trim();
const didBad = didRaw && typeof mbIsE164 === 'function' && !mbIsE164(didRaw);
const didEl = document.getElementById('cd-did');
if (didEl) {
  didEl.style.display = mbCanEditDid() ? '' : 'none';
  didEl.textContent = !mbCanEditDid() ? '' : (!didRaw
    ? campT('camp.did.none','DID atanmadı')
    : (didBad ? `${didRaw} · ${campT('camp.did.invalid','DID geçersiz')}` : didRaw));
}
syncDidVisibility();
const nameInput = document.getElementById('cd-edit-name');
const descInput = document.getElementById('cd-edit-desc');
const didInput = document.getElementById('cd-edit-did');
if (nameInput) nameInput.value = c.name || '';
const displayInput = document.getElementById('cd-edit-display');
if (displayInput) displayInput.value = String(mbCampSettings(c).display_name || '');
if (descInput) descInput.value = c.description || '';
if (didInput) {
  didInput.value = didRaw;
  didInput.hidden = true;
}
const didPick = document.getElementById('cd-edit-did-pick');
if (didPick) didPick.hidden = true;
if (typeof mbBindCampDid === 'function') void mbBindCampDid(c.firm_id, didRaw);
const nameErr = document.getElementById('cd-edit-name-err');
const didErr = document.getElementById('cd-edit-did-err');
if (nameInput) nameInput.classList.remove('is-invalid');
if (nameErr) nameErr.hidden = true;
if (didInput) didInput.classList.toggle('is-invalid', !!didBad);
if (didErr) {
  didErr.hidden = !didBad;
  if (didBad) didErr.textContent = campT('camp.did.invalid','DID geçersiz');
}
document.getElementById('cd-speed').value = c.dial_speed;
document.getElementById('cd-speed-v').textContent = c.dial_speed;
renderCampQueues(c);
const agentsEl = document.getElementById('cd-agents');
if (agentsEl && document.querySelector('.cd-tab.active')?.dataset.tab !== 'agentler') agentsEl.innerHTML = '';
if (!opts?.silent) document.getElementById('camp-detail').scrollIntoView({behavior:'smooth'});
if (!opts?.keepTab) switchCampTab('genel');
else {
  const activeTab = document.querySelector('.cd-tab.active')?.dataset.tab;
  if (activeTab && activeTab !== 'genel') switchCampTab(activeTab);
}
}

function closeCampDetail() {
document.getElementById('camp-detail').style.display='none'; currentCampId=null;
paintCampSelection();
}

function fillCampDidList() {
  const list = document.getElementById('nc-did-list');
  if (!list) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const seen = new Set();
  const opts = [];
  (campaigns || []).forEach((c) => {
    const d = String(c.telnyx_did || '').replace(/[\s()-]/g, '');
    if (!d || seen.has(d)) return;
    if (typeof mbIsE164 === 'function' && !mbIsE164(d)) return;
    seen.add(d);
    opts.push(`<option value="${esc(d)}"></option>`);
  });
  list.innerHTML = opts.join('');
}

const NC_LABEL_DE = {
  'Telefon': 'Telefon',
  'Telefon 2': 'Telefon 2',
  'Ad / Soyad': 'Name',
  'PLZ': 'PLZ',
  'Şehir': 'Stadt',
  'Adres': 'Adresse',
  'Arama Sayısı': 'Anrufanzahl',
  'Notlar': 'Notizen',
};
const NC_LABEL_TR = {
  'PLZ': 'Posta kodu',
};

function ncLabelShown(label) {
  const raw = String(label || '');
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  if (!de) {
    if (NC_LABEL_TR[raw]) return NC_LABEL_TR[raw];
    return raw;
  }
  if (NC_LABEL_DE[raw]) return NC_LABEL_DE[raw];
  const m = raw.match(/^Özel Alan (\d+)$/);
  if (m) return `Eigenes Feld ${m[1]}`;
  return raw;
}

function ncLabelCanonical(shown) {
  const s = String(shown || '').trim();
  if (s === 'Posta kodu') return 'PLZ';
  const hit = Object.entries(NC_LABEL_DE).find(([, de]) => de === s);
  if (hit) return hit[0];
  const m = s.match(/^Eigenes Feld (\d+)$/);
  if (m) return `Özel Alan ${m[1]}`;
  return s;
}

function openNewCampModal() {
try {
const saved = localStorage.getItem('mb_field_template');
_ncFields = saved ? JSON.parse(saved) : NC_DEFAULT_FIELDS.map(f=>({...f}));
} catch(e) { _ncFields = NC_DEFAULT_FIELDS.map(f=>({...f})); }
renderNcFieldList();
updateCampPreview();
openModal('m-new-camp');
setTimeout(renderNcTemplateSelect, 50);
document.getElementById('nc-name').value = '';
const ncDisplay = document.getElementById('nc-display');
if (ncDisplay) ncDisplay.value = '';
document.getElementById('nc-name')?.classList.remove('is-invalid');
const ncNameErr = document.getElementById('nc-name-err');
if (ncNameErr) ncNameErr.hidden = true;
document.getElementById('nc-did').value = '';
document.getElementById('nc-desc').value = '';
document.getElementById('nc-speed').value = 1;
document.getElementById('nc-sv').textContent = '1';
_ncCopySettings = null;
const copySel = document.getElementById('nc-copy-from');
if (copySel) copySel.value = '';
const custSel = document.getElementById('nc-customer');
if (custSel) custSel.value = '';
fillCampDidList();
syncDidVisibility();
const ncFirmRow = document.getElementById('nc-firm-row');
const ncFirmSel = document.getElementById('nc-firm-id');
if (ncFirmRow && ncFirmSel) {
if (isSuperAdmin()) {
ncFirmRow.style.display = '';
ncFirmSel.innerHTML = '<option value="">Firma seçin...</option>' +
_allFirms.map(f=>`<option value="${f.id}" ${f.id===(_selectedFirmId||'')?'selected':''}>${f.name}</option>`).join('');
} else {
ncFirmRow.style.display = 'none';
}
}
ncFillCopySelect();
ncFillCustomers(ncTargetFirmId());
ncFillPersonnel(ncTargetFirmId());
ncCustomerNote();
if (typeof mbBindNewCampDid === 'function') void mbBindNewCampDid(ncTargetFirmId());
}

function ncTargetFirmId() {
  const picked = (typeof isSuperAdmin === 'function' && isSuperAdmin()) ? document.getElementById('nc-firm-id')?.value : '';
  return picked || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || '';
}

function ncFillCopySelect() {
  const sel = document.getElementById('nc-copy-from');
  if (!sel) return;
  const firmId = String(ncTargetFirmId() || '');
  const rows = (campaigns || []).filter((c) => c?.id && (!firmId || String(c.firm_id) === firmId));
  const cur = sel.value;
  sel.innerHTML = `<option value="">${campEsc(campT('camp.new.copy.none', 'Kopyalama'))}</option>` +
    rows.map((c) => `<option value="${campEsc(c.id)}">${campEsc(c.name || '')}</option>`).join('');
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

async function ncOnFirmChange() {
  _ncCopySettings = null;
  const copySel = document.getElementById('nc-copy-from');
  if (copySel) copySel.value = '';
  const custSel = document.getElementById('nc-customer');
  if (custSel) custSel.value = '';
  ncFillCopySelect();
  await ncFillCustomers(ncTargetFirmId());
  await ncFillPersonnel(ncTargetFirmId());
  ncCustomerNote();
  if (typeof mbBindNewCampDid === 'function') await mbBindNewCampDid(ncTargetFirmId());
}

async function ncFillCustomers(firmId) {
  const sel = document.getElementById('nc-customer');
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = `<option value="">${campEsc(campT('camp.customer.pick', 'Seçin'))}</option><option value="qc">${campEsc(campT('camp.customer.qc', 'Tümü — QC seçer'))}</option>`;
  if (!firmId || typeof sb !== 'function') return;
  let rows = [];
  try {
    rows = await sb(`customers?firm_id=eq.${firmId}&is_active=eq.true&select=id,name,code&order=name.asc`) || [];
  } catch (e) {
    rows = [];
  }
  (rows || []).forEach((c) => {
    if (!c?.id) return;
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = `${c.code ? c.code + ' · ' : ''}${c.name || ''}`.trim() || String(c.id);
    sel.appendChild(opt);
  });
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

function ncFieldsFromCamp(camp) {
  const fc = typeof mbParseFieldConfig === 'function' ? mbParseFieldConfig(camp) : (camp?.field_config || {});
  if (typeof mbMergeCampFields !== 'function') return NC_DEFAULT_FIELDS.map((f) => ({ ...f }));
  return mbMergeCampFields(fc).map((f) => ({
    key: f.key,
    label: f.label || f.defaultLabel || f.key,
    type: f.type || 'text',
    show: f.show !== false,
    locked: f.key === 'phone' ? true : !!f.locked,
    options: Array.isArray(f.options) ? f.options.slice() : [],
  }));
}

function ncApplyCopy(id) {
  if (!id) {
    _ncCopySettings = null;
    return;
  }
  const camp = (campaigns || []).find((c) => String(c.id) === String(id));
  if (!camp) return;
  const src = typeof getCampSettings === 'function' ? getCampSettings(camp) : (camp.settings || {});
  const clone = { ...(src || {}) };
  delete clone.notif_ts;
  delete clone.notif_message;
  _ncCopySettings = clone;
  const desc = document.getElementById('nc-desc');
  if (desc) desc.value = camp.description || '';
  const speed = document.getElementById('nc-speed');
  const speedV = document.getElementById('nc-sv');
  const spd = parseInt(camp.dial_speed, 10) || 1;
  if (speed) speed.value = String(spd);
  if (speedV) speedV.textContent = String(spd);
  _ncFields = ncFieldsFromCamp(camp);
  if (typeof renderNcFieldList === 'function') renderNcFieldList();
  if (typeof updateCampPreview === 'function') updateCampPreview();
  const cust = document.getElementById('nc-customer');
  const cid = typeof mbCampDefaultCustomerId === 'function' ? (mbCampDefaultCustomerId(camp) || '') : '';
  if (cust && cid && [...cust.options].some((o) => o.value === cid)) cust.value = cid;
  else if (cust) cust.value = 'qc';
  ncSyncPersonnelChecks();
  ncCustomerNote();
  toast(campT('camp.new.copied', 'Ayarlar kopyalandı'), 'ok');
}

function ncCustomerNote() {
  const note = document.getElementById('nc-customer-note');
  const val = String(document.getElementById('nc-customer')?.value || '').trim();
  if (!note) return;
  const text = val === 'qc'
    ? campT('camp.customer.note.qc', 'Seçim QC\'de. Randevu müşterisiz açılır, QC müşteriyi yazar.')
    : val
      ? campT('camp.customer.note.one', 'Yeni randevular bu müşteriye yazılır. Öncekiler durur. QC tek kaydı değiştirebilir.')
      : campT('camp.customer.note.pick', 'Bir müşteri seçin ya da Tümü deyip seçimi QC\'ye bırakın.');
  note.textContent = text;
}

async function ncFillPersonnel(firmId) {
  const el = document.getElementById('nc-personnel');
  if (!el) return;
  el.innerHTML = `<span style="color:var(--text-3);font-size:12px;">...</span>`;
  const roles = (typeof MB_PERSONNEL_ROLES !== 'undefined' ? MB_PERSONNEL_ROLES : ['agent', 'qc', 'firm_admin', 'field_agent', 'admin', 'super_admin']).join(',');
  let rows = [];
  try {
    rows = firmId && typeof sb === 'function'
      ? await sb(`users?select=id,name,role&is_active=eq.true&role=in.(${roles})&firm_id=eq.${firmId}&order=name.asc`)
      : [];
  } catch (e) {
    rows = [];
  }
  rows = (rows || []).filter((u) => u?.id);
  if (!rows.length) {
    el.innerHTML = `<span style="color:var(--text-3);font-size:12px;">${campEsc(campT('camp.personnel.empty', 'Bu firmada personel yok'))}</span>`;
    return;
  }
  const off = new Set(((_ncCopySettings && _ncCopySettings.personnel_off) || []).map(String));
  el.innerHTML = rows.map((u) => {
    const on = !off.has(String(u.id));
    const name = String(u.name || '').trim() || campT('camp.agent.unnamed', 'Personel');
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-3);border-radius:8px;cursor:pointer;">
<input type="checkbox" data-nc-personnel-id="${campEsc(u.id)}" ${on ? 'checked' : ''} style="width:16px;height:16px;">
<span style="font-size:12px;font-weight:700;">${campEsc(name)}</span>
</label>`;
  }).join('');
}

function ncSyncPersonnelChecks() {
  const off = new Set(((_ncCopySettings && _ncCopySettings.personnel_off) || []).map(String));
  document.querySelectorAll('#nc-personnel [data-nc-personnel-id]').forEach((el) => {
    el.checked = !off.has(String(el.dataset.ncPersonnelId));
  });
}

function ncPersonnelAll(on) {
  document.querySelectorAll('#nc-personnel [data-nc-personnel-id]').forEach((el) => { el.checked = !!on; });
}

function ncBuildFieldConfig() {
  const fieldConfig = {};
  (_ncFields || []).forEach((f, i) => {
    if (!f?.key) return;
    const row = { show: !!f.show, label: f.label, type: f.type || 'text', locked: !!f.locked, order: i };
    if (Array.isArray(f.options) && f.options.length) row.options = f.options;
    fieldConfig[f.key] = row;
  });
  return fieldConfig;
}

function ncBuildSettings() {
  const settings = { ...(_ncCopySettings || {}) };
  delete settings.notif_ts;
  delete settings.notif_message;
  const cust = String(document.getElementById('nc-customer')?.value || '').trim();
  if (cust && cust !== 'qc') {
    settings.default_customer_id = cust;
    settings.customer_qc = false;
  } else if (cust === 'qc') {
    delete settings.default_customer_id;
    settings.customer_qc = true;
  }
  const boxes = [...document.querySelectorAll('#nc-personnel [data-nc-personnel-id]')];
  if (boxes.length) settings.personnel_off = boxes.filter((el) => !el.checked).map((el) => String(el.dataset.ncPersonnelId || '')).filter(Boolean);
  const displayName = String(document.getElementById('nc-display')?.value || '').trim().slice(0, 80);
  if (displayName) settings.display_name = displayName;
  return settings;
}

function renderNcFieldList() {
const el = document.getElementById('nc-field-list');
if (!el) return;
el.innerHTML = _ncFields.map((f,i) => `
<div draggable="true" ondragstart="_ncDragIdx=${i}" ondragover="event.preventDefault()"
ondrop="ncDropField(${i})"
style="display:flex;align-items:center;gap:5px;padding:5px 7px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;cursor:grab;">
<span style="color:var(--text-3);font-size:14px;cursor:grab;user-select:none;">⠿</span>
<input type="checkbox" ${f.show?'checked':''} ${f.locked?'disabled':''}
onchange="_ncFields[${i}].show=this.checked;updateCampPreview()" title="Göster/Gizle">
<input class="form-input" value="${ncLabelShown(f.label)}" style="flex:1;font-size:12px;padding:3px 7px;"
oninput="_ncFields[${i}].label=ncLabelCanonical(this.value);updateCampPreview()" placeholder="Alan adı">
<select class="form-input" style="width:152px;flex-shrink:0;font-size:11px;padding:3px;"
onchange="_ncFields[${i}].type=this.value;updateCampPreview()">
<option value="text" ${f.type==='text'?'selected':''} data-tr="Metin" data-de="Text">Metin</option>
<option value="number" ${f.type==='number'?'selected':''} data-tr="Sayı" data-de="Zahl">Sayı</option>
<option value="date" ${f.type==='date'?'selected':''} data-tr="Tarih" data-de="Datum">Tarih</option>
<option value="boolean" ${f.type==='boolean'?'selected':''} data-tr="Evet/Hayır" data-de="Ja/Nein">Evet/Hayır</option>
<option value="select" ${f.type==='select'?'selected':''} data-tr="Açılır Menü" data-de="Auswahl">Açılır Menü</option>
<option value="multiselect" ${f.type==='multiselect'?'selected':''} data-tr="Çoktan Seçmeli" data-de="Mehrfachauswahl">Çoktan Seçmeli</option>
<option value="checkbox" ${f.type==='checkbox'?'selected':''} data-tr="Onay kutusu" data-de="Kontrollkästchen">Onay kutusu</option>
</select>
${f.locked
? '<i class="ph ph-lock-simple" style="font-size:13px;color:var(--text-3);"></i>'
: `<button onclick="ncRemoveField(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 2px;display:flex;align-items:center;"><i class="ph ph-x"></i></button>`
}
</div>`).join('');
if (typeof currentLang !== 'undefined' && currentLang === 'de') {
  el.querySelectorAll('[data-de]').forEach((opt) => { opt.textContent = opt.getAttribute('data-de'); });
}
}

function ncDropField(toIdx) {
if (_ncDragIdx===null || _ncDragIdx===toIdx) return;
const moved = _ncFields.splice(_ncDragIdx, 1)[0];
_ncFields.splice(toIdx, 0, moved);
_ncDragIdx = null;
renderNcFieldList();
updateCampPreview();
}

function ncAddField() {
_ncFields.push({
key: 'custom_' + Date.now(),
label: 'Özel Alan ' + (_ncFields.filter(f=>f.key.startsWith('custom')).length+1),
type: 'text', show: true, locked: false
});
renderNcFieldList();
updateCampPreview();
}

function ncRemoveField(i) {
if (_ncFields[i]?.locked) return;
_ncFields.splice(i, 1);
renderNcFieldList();
updateCampPreview();
}

function getFieldTemplates() {
return mbFieldTemplates();
}

function saveFieldTemplates(tpls) {
mbSaveFieldTemplates(tpls);
}

async function ncSaveTemplate() {
const name = await mbPrompt('Şablon adı:', 'Varsayılan', 'Şablon Kaydet');
if (!name) return;
const tpls = getFieldTemplates();
tpls[name] = _ncFields.map(f=>({...f}));
saveFieldTemplates(tpls);
toast(`"${name}" şablonu kaydedildi ✓`, 'ok');
renderNcTemplateSelect();
}

function renderNcTemplateSelect() {
const wrap = document.getElementById('nc-template-wrap');
if (!wrap) return;
const tpls = getFieldTemplates();
const names = Object.keys(tpls);
if (!names.length) { wrap.innerHTML = ''; return; }
wrap.innerHTML = `
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
<span style="font-size:11px;color:var(--text-3);font-weight:700;">Şablon:</span>
<select class="form-input" id="nc-template-sel" style="font-size:11px;padding:3px 8px;max-width:150px;">
<option value="">Seç...</option>
${names.map(n=>`<option value="${n}">${n}</option>`).join('')}
</select>
<button class="btn btn-ghost btn-sm" onclick="ncLoadTemplate()" style="font-size:11px;">Yükle</button>
<button class="btn btn-ghost btn-sm" onclick="ncDeleteTemplate()" style="font-size:11px;color:var(--red);">Sil</button>
</div>`;
}

function ncLoadTemplate() {
const sel = document.getElementById('nc-template-sel');
const name = sel?.value;
if (!name) return;
const tpls = getFieldTemplates();
if (!tpls[name]) return;
_ncFields = tpls[name].map(f=>({...f}));
renderNcFieldList();
updateCampPreview();
toast(`"${name}" şablonu yüklendi`, 'ok');
}

async function ncDeleteTemplate() {
const sel = document.getElementById('nc-template-sel');
const name = sel?.value;
if (!name || !(await mbConfirm(`"${name}" şablonu silinsin?`, 'Şablon Sil'))) return;
const tpls = getFieldTemplates();
delete tpls[name];
saveFieldTemplates(tpls);
renderNcTemplateSelect();
toast('Şablon silindi', 'ok');
}

function ncLoadDefault() {
_ncFields = NC_DEFAULT_FIELDS.map(f=>({...f}));
renderNcFieldList();
updateCampPreview();
}

function updateCampPreview() {
const el = document.getElementById('nc-preview');
if (!el) return;
const visible = _ncFields.filter(f => f.show);
if (!visible.length) {
el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Alan seçilmedi</div>';
return;
}
const dePrev = typeof currentLang !== 'undefined' && currentLang === 'de';
const sampleVal = (tp) => tp==='number'?'123':tp==='date'?'01.01.2024':tp==='boolean'?(dePrev?'Ja':'Evet'):(dePrev?'Beispieldaten':'Örnek veri');
el.innerHTML = `
<div style="font-size:13px;font-weight:800;padding:8px 10px;background:var(--accent);color:#fff;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
<i class="ph ph-phone"></i> +49 176 1234567
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
${visible.map(f=>`
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:5px;padding:5px 7px;">
<div style="font-size:9px;color:var(--text-3);font-weight:700;letter-spacing:.4px;">${typeof ncLabelShown==='function'?ncLabelShown(f.label):f.label}</div>
<div style="font-size:11px;font-weight:600;color:var(--text);margin-top:2px;">${sampleVal(f.type)}</div>
</div>`).join('')}
</div>`;
}

async function createCampaign() {
if (typeof mbEnsureSession === 'function') {
  const ok = await mbEnsureSession();
  if (!ok) return;
}
const name = document.getElementById('nc-name').value.trim();
const didPick = document.getElementById('nc-did-pick');
const didInput = document.getElementById('nc-did');
const did = (didPick && !didPick.hidden)
  ? String(didPick.value || '').trim()
  : ((didInput && !didInput.hidden) ? didInput.value.trim() : '');
const desc = document.getElementById('nc-desc').value.trim();
const spd  = parseInt(document.getElementById('nc-speed').value)||1;
const nameEl = document.getElementById('nc-name');
const nameErr = document.getElementById('nc-name-err');
if (!name) {
  if (nameEl) {
    nameEl.classList.add('is-invalid');
    nameEl.setAttribute('aria-invalid', 'true');
    nameEl.focus();
    nameEl.scrollIntoView({ block: 'nearest' });
  }
  if (nameErr) { nameErr.hidden = false; nameErr.textContent = campT('camp.name.required','Kampanya adı gerekli'); }
  toast(campT('camp.name.required','Kampanya adı gerekli'),'err');
  return;
}
if (nameEl) {
  nameEl.classList.remove('is-invalid');
  nameEl.removeAttribute('aria-invalid');
}
if (nameErr) nameErr.hidden = true;
const custPick = String(document.getElementById('nc-customer')?.value || '').trim();
if (!custPick) {
  toast(campT('camp.customer.need', 'Bir müşteri seçin veya seçimi QC\'ye bırakın'), 'err');
  document.getElementById('nc-customer')?.focus();
  return;
}
let didNorm = did.replace(/[\s()-]/g, '');
if (didNorm && (typeof mbIsE164 !== 'function' || !mbIsE164(didNorm))) {
  toast(campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'), 'err');
  return;
}
const targetFirmId = (isSuperAdmin() ? document.getElementById('nc-firm-id')?.value : null) || getActiveFirmId() || currentUser?.firm_id;
if (!targetFirmId) { toast('Firma seçin veya yeniden giriş yapın','err'); return; }
if (!didNorm) didNorm = await firmOutboundDid(targetFirmId);
const fieldConfig = ncBuildFieldConfig();
const settings = ncBuildSettings();
try {
const created = await sb('campaigns', {
method:'POST', prefer:'return=representation',
body: JSON.stringify({
name, telnyx_did:didNorm||null, description:desc||null,
dial_speed:spd, field_config:fieldConfig, settings,
firm_id: targetFirmId, status:'paused'
})
});
const row = Array.isArray(created) ? created[0] : created;
closeModal('m-new-camp');
toast(campT('camp.created.paused','Kampanya duraklatılmış olarak açıldı'),'ok');
await loadCampaigns();
if (row?.id) openCampDetail(row.id);
} catch(e){ toast(e.message || campT('api.err.generic','İşlem tamamlanamadı. Tekrar deneyin.'),'err'); console.error(e); }
}

async function toggleCampStatus(id, status) {
const ns = status==='active'?'paused':'active';
try {
await sb(`campaigns?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({status:ns})});
loadCampaigns();
} catch(e){ toast('Hata','err'); }
}

async function deleteCampaign(id) {
if (!(await mbConfirm('Bu kampanyayı silmek istediğine emin misin?', 'Kampanya Sil'))) return;
try {
await sb(`campaigns?id=eq.${id}`,{method:'DELETE',prefer:'return=minimal'});
toast('Silindi','ok'); closeCampDetail(); loadCampaigns();
} catch(e){ toast('Hata','err'); }
}

async function saveSpeed(v) {
if (!currentCampId) return;
const speed = parseInt(v, 10);
if (!speed) return;
try {
await sb(`campaigns?id=eq.${currentCampId}`,{method:'PATCH',body:JSON.stringify({dial_speed:speed})});
const camp = campaigns.find((c) => c.id === currentCampId);
if (camp) camp.dial_speed = speed;
toast(campT('camp.speed.saved','Hız {v} olarak kaydedildi').replace('{v}', String(speed)),'ok');
} catch(e){ toast(e.message,'err'); }
}

function campEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '');
}

function findQueue(queueId) {
  for (const camp of campaigns || []) {
    const queue = (camp.queues || []).find((q) => q.id === queueId);
    if (queue) return { camp, queue };
  }
  return null;
}

function queueMetaFor(camp, queueId) {
  const map = getCampSettings(camp).queue_meta || {};
  const meta = map[queueId] || {};
  return {
    priority: (() => {
      const raw = parseInt(meta.priority, 10);
      return Number.isFinite(raw) ? Math.max(-100, Math.min(100, raw)) : 0;
    })(),
    maxAttempts: Math.max(0, Math.min(50, parseInt(meta.max_attempts, 10) || 0)),
    notes: String(meta.notes || '').slice(0, 500),
  };
}

function queueDialPrefs(campaignId, queueId) {
  const camp = (campaigns || []).find((c) => c.id === campaignId);
  if (!camp || !queueId) return { priority: 0, maxAttempts: 0 };
  const meta = queueMetaFor(camp, queueId);
  return { priority: meta.priority, maxAttempts: meta.maxAttempts };
}

const RECYCLE_STATUS_KEYS = ['no_answer', 'voicemail', 'negative', 'callback'];

const _mbCampShownCache = new Map();

function mbCampSettings(camp) {
  if (!camp) return {};
  if (typeof getCampSettings === 'function') {
    try { return getCampSettings(camp) || {}; } catch (e) { return {}; }
  }
  let raw = camp.settings;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function mbCampRecord(id, embed) {
  const key = String(id || embed?.id || '');
  const live = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => String(c.id) === key);
  if (live) return live;
  if (key && _mbCampShownCache.has(key)) return _mbCampShownCache.get(key);
  return embed || null;
}

function mbCampShown(camp, id) {
  const src = mbCampRecord(id || camp?.id, camp) || {};
  const code = String(src.name || camp?.name || '').trim();
  const shown = String(mbCampSettings(src).display_name || mbCampSettings(camp).display_name || '').trim();
  if (!code) return shown || '—';
  if (!shown || shown.toLocaleLowerCase('tr-TR') === code.toLocaleLowerCase('tr-TR')) return code;
  return `${code} · ${shown}`;
}

function mbOutcomeShown(key, camp, id) {
  const raw = String(key || '');
  const k = raw === 'appointment_done' ? 'appointment' : raw;
  if (!k || k === 'pending' || k === 'new') return '';
  if (k === 'calling') return typeof t === 'function' ? t('find.unfinal') : 'Sonuçsuz';
  const std = {
    appointment: 'camp.ops.appointment',
    no_answer: 'camp.st.no_answer',
    negative: 'camp.st.negative',
    callback: 'camp.st.callback',
    dnc: 'camp.st.dnc',
    voicemail: 'camp.st.voicemail',
  };
  if (std[k] && typeof t === 'function') return t(std[k]);
  const sources = [];
  const one = mbCampRecord(id || camp?.id, camp);
  if (one) sources.push(one);
  if (camp && camp !== one) sources.push(camp);
  if (!one) {
    (typeof campaigns !== 'undefined' ? campaigns : []).forEach((row) => sources.push(row));
    _mbCampShownCache.forEach((row) => sources.push(row));
  }
  for (let i = 0; i < sources.length; i++) {
    const rows = mbCampSettings(sources[i]).outcomes || [];
    const hit = rows.find((row) => String(row?.key || '') === raw || String(row?.key || '') === k);
    const label = String(hit?.label || '').trim();
    if (label && label !== raw && label !== k) return label;
  }
  return '';
}

async function mbWarmCampShown(ids) {
  const need = [...new Set((ids || []).map((id) => String(id || '')).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
    .filter((id) => !_mbCampShownCache.has(id) && !(typeof campaigns !== 'undefined' ? campaigns : []).some((c) => String(c.id) === id));
  for (let i = 0; i < need.length; i += 80) {
    const chunk = need.slice(i, i + 80);
    const rows = (await sb(`campaigns?select=id,name,settings&id=in.(${chunk.join(',')})`).catch(() => [])) || [];
    rows.forEach((row) => { if (row?.id) _mbCampShownCache.set(String(row.id), row); });
    chunk.forEach((id) => { if (!_mbCampShownCache.has(id)) _mbCampShownCache.set(id, { id, name: '' }); });
  }
}

function campRecycleChoiceList(camp) {
  const base = [
    { key: 'no_answer', label: campT('camp.st.no_answer', 'Cevap yok') },
    { key: 'voicemail', label: campT('camp.st.voicemail', 'Telesekreter') },
    { key: 'negative', label: campT('camp.st.negative', 'Olumsuz') },
    { key: 'callback', label: campT('camp.st.callback', 'Geri ara') },
  ];
  const seen = new Set(base.map((row) => row.key));
  const builtin = new Set(['appointment', 'negative', 'callback', 'no_answer', 'dnc', 'voicemail']);
  const outcomes = (typeof getCampSettings === 'function' ? getCampSettings(camp) : {})?.outcomes || [];
  outcomes.forEach((row) => {
    const key = String(row?.key || '').trim();
    if (!key || builtin.has(key) || seen.has(key) || row.enabled === false) return;
    if (!/^[a-z0-9_]+$/i.test(key)) return;
    seen.add(key);
    base.push({ key, label: String(row.label || key) });
  });
  return base;
}

function campRecyclePolicy(campaignId) {
  const camp = (campaigns || []).find((c) => c.id === campaignId);
  if (!camp) return null;
  const s = getCampSettings(camp);
  if (!s || !s.recycle_configured) return null;
  const allowed = new Set(campRecycleChoiceList(camp).map((row) => row.key));
  const statuses = (Array.isArray(s.recycle_statuses) ? s.recycle_statuses : [])
    .map((x) => String(x || ''))
    .filter((x) => allowed.has(x));
  const max = Math.max(1, Math.min(5, parseInt(s.recycle_max, 10) || 1));
  const delayMin = Math.max(0, Math.min(1440, parseInt(s.recycle_delay, 10) || 0));
  return { on: !!s.recycle && statuses.length > 0, statuses, max, delayMin };
}

function mbDialableContactFilter(campaignId) {
  const nowIso = new Date().toISOString();
  const pol = campRecyclePolicy(campaignId);
  const parts = [
    'status.eq.pending',
    `and(status.eq.callback,or(callback_at.is.null,callback_at.lte.${nowIso}))`,
  ];
  if (pol?.on) {
    const due = new Date(Date.now() - pol.delayMin * 60000).toISOString();
    pol.statuses.forEach((st) => {
      if (st === 'pending' || st === 'callback' || !/^[a-z0-9_]+$/i.test(st)) return;
      parts.push(`and(status.eq.${st},attempt_count.lt.${pol.max},or(last_called_at.is.null,last_called_at.lte.${due}))`);
    });
  }
  return `or=(${parts.join(',')})`;
}

function contactEligibleForRecycle(c, testRelax) {
  if (testRelax || !c) return true;
  const st = String(c.status || '').toLowerCase();
  if (!st || st === 'pending' || st === 'calling') return true;
  const dueCb = st === 'callback' && (!c.callback_at || Date.parse(c.callback_at) <= Date.now());
  if (dueCb) return true;
  const pol = campRecyclePolicy(c.campaign_id);
  if (!pol?.on || !pol.statuses.includes(st)) return false;
  if ((Number(c.attempt_count) || 0) >= pol.max) return false;
  if (pol.delayMin > 0 && c.last_called_at) {
    if (Date.parse(c.last_called_at) + pol.delayMin * 60000 > Date.now()) return false;
  }
  return true;
}

let _queueColFilters = {};
let _queuePaint = 0;

function setQueueColFilter(key, value) {
  _queueColFilters[key] = String(value || '');
  const camp = (campaigns || []).find((c) => c.id === currentCampId);
  const tbody = document.querySelector('#cd-queues .camp-rows tbody');
  if (tbody && camp) {
    tbody.innerHTML = queueRowsBody(camp);
    return;
  }
  if (camp) renderCampQueues(camp);
}

function queueColDefs() {
  return [
    { key: 'name', label: campT('camp.queue.col.name', 'Adı') },
    { key: 'status', label: campT('camp.queue.status', 'Durum') },
    { key: 'ratio', label: campT('camp.queue.col.ratio', 'Aranacak/Toplam'), num: true },
    { key: 'dialed', label: campT('camp.queue.col.dialed', 'Aranan'), num: true },
    { key: 'sales', label: campT('camp.queue.col.sales', 'Satışlar'), num: true },
    { key: 'created', label: campT('camp.queue.col.created', 'Oluşturma Tarihi') },
    { key: '', label: '' },
  ];
}

function queueFieldText(camp, q) {
  const meta = queueMetaFor(camp, q.id);
  const bits = [];
  if (meta.priority) bits.push(`${campT('camp.queue.priority', 'Öncelik')} ${meta.priority}`);
  if (meta.maxAttempts > 0) bits.push(`${campT('camp.queue.max', 'En fazla deneme')} ${meta.maxAttempts}`);
  if (meta.notes) bits.push(meta.notes);
  const active = q.status === 'active';
  const left = q._left == null ? '—' : campCountText(q._left);
  const sales = q._sales == null ? '—' : campCountText(q._sales);
  return {
    bits,
    active,
    status: active ? campT('camp.queue.active', 'Aktif') : campT('camp.queue.stopped', 'Durdu'),
    ratio: `${left}/${campCountText(q.total_contacts || 0)}`,
    dialed: campCountText(q.dialed_count || 0),
    sales,
    created: campCreatedLabel(q.created_at),
    name: [q.name, ...bits].filter(Boolean).join(' '),
  };
}

function queueRowsBody(camp) {
  const defs = queueColDefs();
  const rows = (camp?.queues || []).filter((q) => {
    const text = queueFieldText(camp, q);
    return Object.entries(_queueColFilters).every(([key, raw]) => !key || campMatch(text[key] || '', raw));
  });
  if (!rows.length) {
    return `<tr class="camp-filter-empty"><td colspan="${defs.length}">${campEsc(campT('camp.queue.search.empty', 'Eşleşen kuyruk yok'))}</td></tr>`;
  }
  return rows.map((q) => {
    const text = queueFieldText(camp, q);
    const cells = {
      name: `<td><div class="queue-name">${campEsc(q.name)}</div>${text.bits.length ? `<div class="queue-sub">${campEsc(text.bits.join(' · '))}</div>` : ''}</td>`,
      status: `<td><span class="badge ${text.active ? 'badge-green' : 'badge-gray'}">${campEsc(text.status)}</span></td>`,
      ratio: `<td class="num">${campEsc(text.ratio)}</td>`,
      dialed: `<td class="num">${campEsc(text.dialed)}</td>`,
      sales: `<td class="num">${campEsc(text.sales)}</td>`,
      created: `<td>${campEsc(text.created)}</td>`,
      '': `<td onclick="event.stopPropagation()"><div class="queue-actions">
<button type="button" class="btn btn-primary btn-xs" onclick="openQueueOps('${q.id}')">${campEsc(campT('camp.queue.ops', 'İşlemler'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="openQueueUpload('${q.id}')">${campEsc(campT('camp.queue.upload', 'Yükle'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="startQueueRename('${q.id}')">${campEsc(campT('camp.queue.rename', 'Adı değiştir'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="toggleQueueStatus('${q.id}')">${campEsc(text.active ? campT('camp.queue.pause', 'Duraklat') : campT('camp.queue.resume', 'Sürdür'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="openRequeueModal('${q.id}')">${campEsc(campT('camp.queue.manage', 'Ayarlar'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="openQueuePeople('${q.id}')">${campEsc(campT('camp.queue.contacts', 'Kişiler'))}</button>
<button type="button" class="btn btn-danger btn-xs" onclick="deleteQueue('${q.id}')">${campEsc(campT('camp.queue.delete', 'Sil'))}</button>
</div></td>`,
    };
    return `<tr class="camp-row" data-queue-id="${campEsc(q.id)}">${defs.map((col) => cells[col.key] || '').join('')}</tr>`;
  }).join('');
}

async function attachQueueColumnStats(camp) {
  const queues = camp?.queues || [];
  const count = typeof mbDashCount === 'function' ? mbDashCount : null;
  const chunk = 4;
  for (let i = 0; i < queues.length; i += chunk) {
    const slice = queues.slice(i, i + chunk);
    await Promise.all(slice.map(async (q) => {
      if (!count || !q.id) return;
      const [left, sales] = await Promise.all([
        count(`contacts?select=id&queue_id=eq.${q.id}&status=in.(pending,no_answer,callback)`),
        count(`contacts?select=id&queue_id=eq.${q.id}&status=eq.appointment`),
      ]);
      q._left = left;
      q._sales = sales;
    }));
  }
}

function paintQueueTable(c) {
  const host = document.getElementById('cd-queues');
  if (!host) return;
  host.style.display = 'block';
  const qs = c?.queues || [];
  const countEl = document.getElementById('cd-queue-count');
  if (countEl) countEl.textContent = ` · ${qs.length}`;
  if (!qs.length) {
    host.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">${campEsc(campT('camp.queue.none', 'Kuyruk yok'))}</div>`;
    return;
  }
  const defs = queueColDefs();
  const head = defs.map((col) => {
    const filter = col.key
      ? `<input class="camp-col-filter" value="${campEsc(_queueColFilters[col.key] || '')}" oninput="setQueueColFilter('${col.key}', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">`
      : '';
    return `<th class="${col.num ? 'num' : ''}">${campEsc(col.label)}${filter}</th>`;
  }).join('');
  host.innerHTML = `<div class="camp-rows-wrap"><table class="camp-rows"><thead><tr>${head}</tr></thead><tbody>${queueRowsBody(c)}</tbody></table></div>`;
}

async function renderCampQueues(c) {
  const host = document.getElementById('cd-queues');
  if (!host) return;
  const gen = ++_queuePaint;
  paintQueueTable(c);
  if (!(c?.queues || []).length) return;
  await attachQueueColumnStats(c);
  if (gen !== _queuePaint) return;
  if (host.querySelector('.queue-rename-input')) return;
  const tbody = host.querySelector('.camp-rows tbody');
  if (tbody) tbody.innerHTML = queueRowsBody(c);
}

function startQueueRename(queueId) {
  const found = findQueue(queueId);
  const host = document.querySelector(`[data-queue-id="${queueId}"] .queue-name`);
  if (!found || !host) return;
  host.innerHTML = `<div class="queue-name-edit">
<input class="form-input queue-rename-input" id="queue-rename-${queueId}" value="${campEsc(found.queue.name || '')}" maxlength="120">
<button type="button" class="btn btn-primary btn-xs" onclick="commitQueueRename('${queueId}')">${campEsc(campT('camp.notif.save','Kaydet'))}</button>
</div>`;
  const input = document.getElementById(`queue-rename-${queueId}`);
  input?.focus();
  input?.select();
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitQueueRename(queueId);
    if (e.key === 'Escape' && currentCampId) openCampDetail(currentCampId, { keepTab: true, silent: true });
  });
}

function queueNameTaken(camp, queueId, name) {
  const key = String(name || '').trim().toLocaleLowerCase('tr-TR');
  return (camp.queues || []).some((q) => q.id !== queueId && String(q.name || '').trim().toLocaleLowerCase('tr-TR') === key);
}

async function commitQueueRename(queueId) {
  const found = findQueue(queueId);
  const input = document.getElementById(`queue-rename-${queueId}`);
  const name = String(input?.value || '').trim();
  if (!found) return;
  if (!name) {
    toast(campT('camp.queue.name.required','Kuyruk adı gerekli'), 'err');
    input?.focus();
    return;
  }
  if (queueNameTaken(found.camp, queueId, name)) {
    toast(campT('camp.queue.name.dup','Bu kampanyada aynı kuyruk adı var'), 'err');
    return;
  }
  if (name === found.queue.name) {
    renderCampQueues(found.camp);
    return;
  }
  try {
    await sb(`queues?id=eq.${queueId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ name }) });
    found.queue.name = name;
    toast(campT('camp.queue.saved','Kuyruk ayarları kaydedildi'), 'ok');
    renderCampQueues(found.camp);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function toggleQueueStatus(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const next = found.queue.status === 'active' ? 'paused' : 'active';
  try {
    await sb(`queues?id=eq.${queueId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: next }) });
    found.queue.status = next;
    renderCampQueues(found.camp);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function saveCampIdentity() {
  const camp = campaigns.find((c) => c.id === currentCampId);
  if (!camp) return;
  const nameEl = document.getElementById('cd-edit-name');
  const nameErr = document.getElementById('cd-edit-name-err');
  const didEl = document.getElementById('cd-edit-did');
  const didErr = document.getElementById('cd-edit-did-err');
  const name = String(nameEl?.value || '').trim();
  const displayName = String(document.getElementById('cd-edit-display')?.value || '').trim().slice(0, 80);
  const desc = String(document.getElementById('cd-edit-desc')?.value || '').trim();
  const didRaw = String(didEl?.value || '').trim();
  if (!name) {
    if (nameEl) { nameEl.classList.add('is-invalid'); nameEl.focus(); }
    if (nameErr) { nameErr.hidden = false; nameErr.textContent = campT('camp.name.required','Kampanya adı gerekli'); }
    toast(campT('camp.name.required','Kampanya adı gerekli'), 'err');
    return;
  }
  if (nameEl) nameEl.classList.remove('is-invalid');
  if (nameErr) nameErr.hidden = true;
  const prev = String(camp.telnyx_did || '').trim();
  let telnyx_did = prev || null;
  const didPickEl = document.getElementById('cd-edit-did-pick');
  const usePick = didPickEl && !didPickEl.hidden;
  const useInput = didEl && !didEl.hidden;
  if (usePick || useInput) {
    const nextRaw = usePick ? String(didPickEl.value || '') : didRaw;
    const nextNorm = nextRaw.replace(/[\s()-]/g, '');
    if (nextNorm && (typeof mbIsE164 !== 'function' || !mbIsE164(nextNorm))) {
      if (didEl) didEl.classList.add('is-invalid');
      if (didErr) { didErr.hidden = false; didErr.textContent = campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'); }
      toast(campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'), 'err');
      return;
    }
    telnyx_did = nextNorm || null;
  }
  try {
    const settings = { ...(mbCampSettings(camp) || {}) };
    if (displayName) settings.display_name = displayName;
    else delete settings.display_name;
    await sb(`campaigns?id=eq.${camp.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ name, description: desc || null, telnyx_did, settings })
    });
    camp.name = name;
    camp.description = desc || null;
    camp.telnyx_did = telnyx_did;
    camp.settings = settings;
    toast(campT('camp.identity.saved','Kampanya kaydedildi'), 'ok');
    await loadCampaigns();
  } catch (e) {
    toast(e.message, 'err');
  }
}
