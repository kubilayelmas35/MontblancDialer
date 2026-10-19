// ─────────────────────────────────────────────
// AGENTS — agent yönetimi, firmalar, kullanıcılar
// ─────────────────────────────────────────────

let _agentUsers = [];
let _agentCamps = [];
let _agentSessById = {};
let _agentCallMap = null;
let _agentApptMap = null;
let _agentsTimer = null;
let _agentsLoadGen = 0;
let _agentsPaintWait = false;
let _agentSearch = '';
let _agentRole = '';
let _agentStatus = '';
let _agentCamp = '';
let _agentActive = '';
let _agentColFilters = {};

function agentsStopPoll() {
  if (_agentsTimer) clearInterval(_agentsTimer);
  _agentsTimer = null;
}

function agentsStartPoll() {
  agentsStopPoll();
  _agentsTimer = setInterval(() => { agentsRefreshLive(); }, 20000);
}

function agentViewMode() {
  try { return localStorage.getItem('mb-agent-view') === 'rows' ? 'rows' : 'cards'; }
  catch (_) { return 'cards'; }
}

function paintAgentViewToggle() {
  const mode = agentViewMode();
  document.getElementById('agent-view-cards')?.classList.toggle('is-on', mode === 'cards');
  document.getElementById('agent-view-rows')?.classList.toggle('is-on', mode === 'rows');
  document.getElementById('agents-grid')?.classList.toggle('agents-grid--rows', mode === 'rows');
}

function setAgentView(mode) {
  try { localStorage.setItem('mb-agent-view', mode === 'rows' ? 'rows' : 'cards'); } catch (_) {}
  paintAgentViewToggle();
  renderAgents();
}

function setAgentSearch(value) {
  _agentSearch = String(value || '').trim();
  renderAgents();
}

function setAgentFacet(key, value) {
  const v = String(value || '');
  if (key === 'role') _agentRole = v;
  else if (key === 'status') _agentStatus = v;
  else if (key === 'camp') _agentCamp = v;
  else if (key === 'active') _agentActive = v;
  renderAgents();
}

function setAgentColFilter(key, value) {
  _agentColFilters[key] = String(value || '');
  if (agentViewMode() === 'rows') {
    const tbody = document.querySelector('#agents-grid .camp-rows tbody');
    if (tbody) {
      tbody.innerHTML = agentRowsBody();
      return;
    }
  }
  renderAgents();
}

function agentsInputBusy() {
  const el = document.activeElement;
  return !!el?.closest?.('#page-agents input, #page-agents select, #page-agents textarea');
}

function agentsBindPaintWait() {
  const page = document.getElementById('page-agents');
  if (!page || page.dataset.paintWait) return;
  page.dataset.paintWait = '1';
  page.addEventListener('focusout', () => {
    if (!_agentsPaintWait) return;
    setTimeout(() => {
      if (agentsInputBusy()) return;
      _agentsPaintWait = false;
      renderAgents();
    }, 0);
  });
}

function agentEsc(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value ?? '') : String(value ?? '');
}

function agentRoleLabel(role) {
  const map = {
    agent: 'Agent',
    qc: 'QC',
    firm_admin: t('agent.role.firm_admin'),
    field_agent: t('agent.role.field'),
    super_admin: t('agent.role.super'),
    admin: 'Admin',
  };
  return map[role] || role || '';
}

function agentStatusLabel(status) {
  const key = {
    ready: 'agent.status.ready',
    on_call: 'agent.status.on_call',
    wrapping: 'agent.status.wrapping',
    break: 'agent.status.break',
    offline: 'agent.status.offline',
  }[status];
  return key ? t(key) : (status || '');
}

function agentStatusColor(status) {
  return ({
    ready: 'var(--green)',
    on_call: 'var(--accent)',
    wrapping: 'var(--yellow)',
    break: 'var(--yellow)',
    offline: 'var(--text-3)',
  })[status] || 'var(--text-3)';
}

function agentSeenFresh(sess) {
  const seenMs = typeof OPS_SEEN_MS === 'number' ? OPS_SEEN_MS : 90000;
  const at = new Date(sess?.last_seen || sess?.updated_at || 0).getTime();
  return Number.isFinite(at) && (Date.now() - at) <= seenMs;
}

function agentLiveStatus(sess) {
  if (!sess || !agentSeenFresh(sess)) return 'offline';
  const st = String(sess.status || '');
  return ['ready', 'on_call', 'wrapping', 'break'].includes(st) ? st : 'offline';
}

function agentSeesCamp(camp, userId) {
  if (typeof mbUserSeesCampaign === 'function') return mbUserSeesCampaign(camp, userId);
  return true;
}

function agentFirmCamps(user) {
  return (_agentCamps || []).filter((c) => !user?.firm_id || !c.firm_id || String(c.firm_id) === String(user.firm_id));
}

function agentCampsFor(user) {
  return agentFirmCamps(user).filter((c) => agentSeesCamp(c, user?.id));
}

function agentCampNames(user) {
  return agentCampsFor(user).map((c) => String(c.name || '').trim()).filter(Boolean);
}

function agentCountText(map, id) {
  if (!map) return '—';
  return String(map[String(id)] || 0);
}

function agentCountMap(rows) {
  if (!Array.isArray(rows)) return null;
  const map = {};
  rows.forEach((r) => {
    const id = String(r?.agent_id || '');
    if (!id) return;
    map[id] = (map[id] || 0) + 1;
  });
  return map;
}

function agentTodayLine(user) {
  const calls = agentCountText(_agentCallMap, user?.id);
  const appts = agentCountText(_agentApptMap, user?.id);
  return `${calls} ${t('agent.today.calls')} · ${appts} ${t('agent.today.appts')}`;
}

function agentRowText(user) {
  const sess = _agentSessById[user?.id];
  const status = agentLiveStatus(sess);
  return {
    name: user?.name || '',
    email: user?.email || '',
    role: agentRoleLabel(user?.role),
    status: agentStatusLabel(status),
    camps: agentCampNames(user).join(', '),
    calls: agentCountText(_agentCallMap, user?.id),
    appts: agentCountText(_agentApptMap, user?.id),
    active: user?.is_active === false ? t('agent.passive') : t('agent.active'),
  };
}

function agentMatch(text, query) {
  if (typeof campMatch === 'function') return campMatch(text, query);
  const q = String(query || '').trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  return String(text || '').toLocaleLowerCase('tr-TR').includes(q);
}

function agentVisibleList() {
  const q = _agentSearch.toLocaleLowerCase('tr-TR');
  return (_agentUsers || []).filter((u) => {
    if (q) {
      const blob = `${u.name || ''} ${u.email || ''}`.toLocaleLowerCase('tr-TR');
      if (!blob.includes(q)) return false;
    }
    if (_agentRole && u.role !== _agentRole) return false;
    if (_agentActive === 'true' && u.is_active === false) return false;
    if (_agentActive === 'false' && u.is_active !== false) return false;
    const status = agentLiveStatus(_agentSessById[u.id]);
    if (_agentStatus && status !== _agentStatus) return false;
    if (_agentCamp && !agentCampsFor(u).some((c) => String(c.id) === String(_agentCamp))) return false;
    const text = agentRowText(u);
    return Object.entries(_agentColFilters).every(([key, raw]) => !key || agentMatch(text[key] || '', raw));
  });
}

function agentFacetSelect(id, label, value, options) {
  const opts = options.map(([v, text]) => `<option value="${agentEsc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${agentEsc(text)}</option>`).join('');
  return `<select class="form-input" id="${id}" aria-label="${agentEsc(label)}" onchange="setAgentFacet(this.dataset.facet, this.value)" data-facet="${id.replace('agents-f-', '')}">${opts}</select>`;
}

function paintAgentFacets() {
  const host = document.getElementById('agents-filters');
  if (!host) return;
  const all = t('agent.filter.all');
  const roles = [['', all], ['agent', 'Agent'], ['qc', 'QC'], ['firm_admin', t('agent.role.firm_admin')], ['field_agent', t('agent.role.field')], ['super_admin', t('agent.role.super')]];
  const statuses = [['', all], ['ready', t('agent.status.ready')], ['on_call', t('agent.status.on_call')], ['wrapping', t('agent.status.wrapping')], ['break', t('agent.status.break')], ['offline', t('agent.status.offline')]];
  const camps = [['', all]].concat((_agentCamps || []).map((c) => [c.id, c.name || c.id]));
  const active = [['', all], ['true', t('agent.active')], ['false', t('agent.passive')]];
  host.innerHTML = [
    agentFacetSelect('agents-f-role', t('agent.filter.role'), _agentRole, roles),
    agentFacetSelect('agents-f-status', t('agent.filter.status'), _agentStatus, statuses),
    agentFacetSelect('agents-f-camp', t('agent.filter.camp'), _agentCamp, camps),
    agentFacetSelect('agents-f-active', t('agent.filter.active'), _agentActive, active),
  ].join('');
}

function agentColDefs() {
  return [
    { key: 'name', label: t('agent.col.name') },
    { key: 'email', label: t('agent.col.email') },
    { key: 'role', label: t('agent.col.role') },
    { key: 'status', label: t('agent.col.status') },
    { key: 'camps', label: t('agent.col.camps') },
    { key: 'calls', label: t('agent.col.calls'), num: true },
    { key: 'appts', label: t('agent.col.appts'), num: true },
    { key: 'active', label: t('agent.col.active') },
    { key: '', label: '' },
  ];
}

function agentCardMarkup(user) {
  const text = agentRowText(user);
  const status = agentLiveStatus(_agentSessById[user.id]);
  const color = agentStatusColor(status);
  const camps = text.camps || t('agent.no_campaign');
  const initial = String(user.name || '?').charAt(0);
  return `<div class="agent-card-item${user.is_active === false ? ' is-off' : ''}" style="position:relative;cursor:pointer;" onclick="if (event.target.closest('button')) return; openEditAgentModal('${user.id}')">
<div class="agent-av-lg" style="background:${user.is_active === false ? 'var(--text-3)' : 'var(--accent)'};">${agentEsc(initial)}</div>
<div class="agent-info-lg" style="flex:1;">
<div class="name">${agentEsc(user.name || '')}</div>
<div style="font-size:11px;color:var(--text-3);">${agentEsc(user.email || '')}</div>
<button type="button" class="agent-camps-hit" title="${agentEsc(t('agent.camp.title'))}" onclick="event.stopPropagation();openAgentCampaigns('${user.id}')">${agentEsc(camps)}</button>
<div class="agent-today" title="${agentEsc(t('agent.today.hint'))}">${agentEsc(agentTodayLine(user))}</div>
<button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();openAgentCampaigns('${user.id}')">${agentEsc(t('agent.campaigns'))}</button>
</div>
<div class="agent-card-side">
<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:700;">${agentEsc(text.role)}</span>
<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${color};">
<div style="width:7px;height:7px;border-radius:50%;background:${color};"></div>
${agentEsc(text.status)}
</div>
</div>
</div>`;
}

function agentRowsBody() {
  const defs = agentColDefs();
  const visible = agentVisibleList();
  if (!visible.length) {
    const msg = _agentUsers.length ? t('agent.filter.empty') : t('agent.empty');
    return `<tr class="camp-filter-empty"><td colspan="${defs.length}">${agentEsc(msg)}</td></tr>`;
  }
  return visible.map((u) => {
    const text = agentRowText(u);
    const status = agentLiveStatus(_agentSessById[u.id]);
    const color = agentStatusColor(status);
    const camps = text.camps || t('agent.no_campaign');
    const cells = {
      name: `<td><span class="camp-row-name" title="${agentEsc(u.name || '')}">${agentEsc(u.name || '')}</span></td>`,
      email: `<td>${agentEsc(u.email || '')}</td>`,
      role: `<td>${agentEsc(text.role)}</td>`,
      status: `<td style="color:${color};">${agentEsc(text.status)}</td>`,
      camps: `<td class="agent-camps-cell" title="${agentEsc(t('agent.camp.title'))}" onclick="event.stopPropagation();openAgentCampaigns('${u.id}')">${agentEsc(camps)}</td>`,
      calls: `<td class="num" title="${agentEsc(t('agent.today.hint'))}">${agentEsc(text.calls)}</td>`,
      appts: `<td class="num" title="${agentEsc(t('agent.today.hint'))}">${agentEsc(text.appts)}</td>`,
      active: `<td>${agentEsc(text.active)}</td>`,
      '': `<td onclick="event.stopPropagation()"><div class="agent-row-actions">
<button type="button" class="btn btn-ghost btn-sm" onclick="openAgentCampaigns('${u.id}')">${agentEsc(t('agent.campaigns'))}</button>
</div></td>`,
    };
    return `<tr class="camp-row${u.is_active === false ? ' is-off' : ''}" onclick="if (event.target.closest('button, .agent-camps-cell')) return; openEditAgentModal('${u.id}')">${defs.map((col) => cells[col.key] || '').join('')}</tr>`;
  }).join('');
}

function renderAgentRows() {
  const defs = agentColDefs();
  const head = defs.map((col) => {
    const filter = col.key
      ? `<input class="camp-col-filter" value="${agentEsc(_agentColFilters[col.key] || '')}" oninput="setAgentColFilter('${col.key}', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">`
      : '';
    return `<th class="${col.num ? 'num' : ''}">${agentEsc(col.label)}${filter}</th>`;
  }).join('');
  return `<div class="camp-rows-wrap"><table class="camp-rows"><thead><tr>${head}</tr></thead><tbody>${agentRowsBody()}</tbody></table></div>`;
}

function renderAgents() {
  const grid = document.getElementById('agents-grid');
  if (!grid) return;
  paintAgentViewToggle();
  if (!_agentUsers.length) {
    grid.innerHTML = `<div style="color:var(--text-3);padding:32px;font-size:13px;">${agentEsc(t('agent.empty'))}</div>`;
    return;
  }
  if (agentViewMode() === 'rows') {
    grid.innerHTML = renderAgentRows();
    return;
  }
  const visible = agentVisibleList();
  if (!visible.length) {
    grid.innerHTML = `<div style="color:var(--text-3);padding:32px;font-size:13px;">${agentEsc(t('agent.filter.empty'))}</div>`;
    return;
  }
  grid.innerHTML = visible.map(agentCardMarkup).join('');
}

async function agentFetchCounts(ff) {
  const day = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const gte = encodeURIComponent(typeof mbInstantGte === 'function' ? mbInstantGte(day) : `${day}T00:00:00`);
  const lte = encodeURIComponent(typeof mbInstantLte === 'function' ? mbInstantLte(day) : `${day}T23:59:59`);
  const [calls, appts] = await Promise.all([
    sb(`call_logs?select=agent_id&started_at=gte.${gte}&started_at=lte.${lte}${ff}&limit=8000`).catch(() => null),
    sb(`appointments?select=agent_id&kayit_tarihi=gte.${gte}&kayit_tarihi=lte.${lte}${ff}&limit=8000`).catch(() => null),
  ]);
  return { calls: agentCountMap(calls), appts: agentCountMap(appts) };
}

function agentStoreSessions(rows) {
  _agentSessById = {};
  (rows || []).forEach((s) => { if (s?.agent_id) _agentSessById[s.agent_id] = s; });
}

async function agentsRefreshLive() {
  const page = document.getElementById('page-agents');
  if (!page?.classList.contains('active')) {
    agentsStopPoll();
    return;
  }
  const gen = _agentsLoadGen;
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  try {
    const [sessions, counts] = await Promise.all([
      sb(`agent_sessions?select=agent_id,status,campaign_id,last_seen,updated_at${ff}`).catch(() => null),
      agentFetchCounts(ff),
    ]);
    if (gen !== _agentsLoadGen) return;
    if (Array.isArray(sessions)) agentStoreSessions(sessions);
    if (counts) {
      _agentCallMap = counts.calls;
      _agentApptMap = counts.appts;
    }
  } catch (e) {}
  if (gen !== _agentsLoadGen) return;
  if (agentsInputBusy()) {
    _agentsPaintWait = true;
    return;
  }
  renderAgents();
}

async function loadAgents() {
  const gen = ++_agentsLoadGen;
  agentsBindPaintWait();
  renderFirmSelector('agents-firm-selector', loadAgents);
  paintAgentViewToggle();
  const grid = document.getElementById('agents-grid');
  try {
    const ff = getFirmFilter('&');
    const [users, camps, sessions, counts] = await Promise.all([
      sb(`users?select=id,name,email,role,is_active,firm_id${ff}&role=in.(agent,qc,firm_admin,field_agent,super_admin)&order=name.asc`),
      sb(`campaigns?select=id,name,firm_id,settings${ff}&order=name.asc`),
      sb(`agent_sessions?select=agent_id,status,campaign_id,last_seen,updated_at${ff}`),
      agentFetchCounts(ff),
    ]);
    if (gen !== _agentsLoadGen) return;
    _agentUsers = users || [];
    _agentCamps = (camps || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'));
    agentStoreSessions(sessions || []);
    _agentCallMap = counts.calls;
    _agentApptMap = counts.appts;
    const search = document.getElementById('agents-search');
    if (search && search.value !== _agentSearch) search.value = _agentSearch;
    paintAgentFacets();
    renderAgents();
    if (document.getElementById('page-agents')?.classList.contains('active')) agentsStartPoll();
  } catch (e) {
    console.error(e);
    if (gen !== _agentsLoadGen || !grid) return;
    grid.innerHTML = `<div style="color:var(--red);padding:24px;">Hata: ${agentEsc(e?.message || 'Bilinmeyen hata')}</div>`;
  }
}

function paintAgentCampaignList(userId) {
  const box = document.querySelector('#m-agent-camps #agent-page-camp-list');
  const user = (_agentUsers || []).find((u) => String(u.id) === String(userId));
  if (!box || !user) return;
  const camps = agentFirmCamps(user);
  if (!camps.length) {
    box.innerHTML = `<div style="color:var(--text-3);font-size:12px;">${agentEsc(t('agent.camp.empty'))}</div>`;
    return;
  }
  box.innerHTML = camps.map((c) => {
    const on = agentSeesCamp(c, user.id);
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-3);border-radius:8px;cursor:pointer;">
<input type="checkbox" ${on ? 'checked' : ''} onchange="agentCampaignToggle('${user.id}','${c.id}', this.checked)" style="width:16px;height:16px;">
<span style="font-size:13px;font-weight:700;">${agentEsc(c.name || '')}</span>
</label>`;
  }).join('');
}

function openAgentCampaigns(userId) {
  const user = (_agentUsers || []).find((u) => String(u.id) === String(userId));
  if (!user) {
    if (typeof toast === 'function') toast(t('agent.camp.empty'), 'err');
    return;
  }
  document.getElementById('m-agent-camps')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-agent-camps';
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '1400';
  modal.innerHTML = `<div class="modal" style="max-width:460px;">
<div class="modal-hdr">
<div class="modal-title"><i class="ph ph-megaphone"></i> ${agentEsc(t('agent.camp.title'))}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
<div style="font-size:13px;font-weight:700;">${agentEsc(user.name || '')}</div>
<div id="agent-page-camp-list" style="display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto;"></div>
</div>
</div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  paintAgentCampaignList(userId);
}

async function agentCampaignToggle(userId, campId, on) {
  const camp = (_agentCamps || []).find((c) => String(c.id) === String(campId));
  if (!camp || !userId) return;
  const off = new Set(typeof mbPersonnelOff === 'function' ? mbPersonnelOff(camp) : []);
  if (on) off.delete(String(userId));
  else off.add(String(userId));
  const existing = typeof getCampSettings === 'function' ? getCampSettings(camp) : (camp.settings && typeof camp.settings === 'object' ? camp.settings : {});
  const merged = { ...existing, personnel_off: [...off] };
  try {
    await sb(`campaigns?id=eq.${campId}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ settings: merged }),
    });
    camp.settings = merged;
    if (typeof campaigns !== 'undefined' && Array.isArray(campaigns)) {
      const live = campaigns.find((c) => String(c.id) === String(campId));
      if (live) live.settings = merged;
    }
    if (on) {
      await sb('agent_campaigns', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ agent_id: userId, campaign_id: campId, firm_id: camp.firm_id || currentUser?.firm_id }),
      }).catch(() => {});
    } else {
      await sb(`agent_campaigns?agent_id=eq.${userId}&campaign_id=eq.${campId}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    }
    if (typeof toast === 'function') toast(t('agent.camp.saved'), 'ok');
    renderAgents();
    paintAgentCampaignList(userId);
  } catch (e) {
    if (typeof toast === 'function') toast(e?.message || 'Hata', 'err');
    paintAgentCampaignList(userId);
  }
}

async function canManageFieldAgents(targetFirmId) {
  if (mbIsSuperAdmin() || currentUser?.role === 'admin') return true;
  if (currentUser?.role !== 'firm_admin') return false;
  const fid = targetFirmId || currentUser?.firm_id;
  if (!fid) return false;
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    return !!firms?.[0]?.settings?.fieldService?.can_manage_agents;
  } catch (e) {
    return false;
  }
}

function _safeErrorText(e) {
  const t = String(e?.message || e || '');
  if (t.includes('duplicate key') || t.includes('already exists') || t.includes('users_email_key')) {
    return 'Bu e-posta zaten kayıtlı.';
  }
  if (t.includes('users_role_check')) {
    return 'Rol doğrulaması başarısız. Veritabanı migration güncel olmayabilir.';
  }
  if (t.includes('Password') || t.includes('password')) {
    return 'Şifre geçersiz. En az 6 karakter kullanın.';
  }
  return t || 'Beklenmeyen hata';
}

function _validateUserPassword(pass, isNew) {
  const p = String(pass || '');
  if (isNew && !p) return 'Şifre zorunlu';
  if (p && p.length < 6) return 'Şifre en az 6 karakter olmalı';
  return '';
}

async function syncFieldAgentRoleOption(prefillRole, targetFirmId) {
  const sel = document.getElementById('am-role');
  if (!sel) return;
  const can = await canManageFieldAgents(targetFirmId);
  const has = [...sel.options].some((o) => o.value === 'field_agent');
  if (can && !has) {
    const o = document.createElement('option');
    o.value = 'field_agent';
    o.textContent = 'Saha Elemanı';
    sel.appendChild(o);
    if (prefillRole === 'field_agent') sel.value = 'field_agent';
  }
  if (!can && has) {
    if (sel.value === 'field_agent') sel.value = 'agent';
    [...sel.options].forEach((o) => {
      if (o.value === 'field_agent') o.remove();
    });
  }
}

function _agentModal(userId, prefill) {
  const isEdit = !!userId;
  document.getElementById('m-agent-mgr')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-agent-mgr'; modal.className = 'modal-overlay open';
  const showFieldOpt = mbIsSuperAdmin() || currentUser?.role === 'admin';
  const canAssignSuper = mbIsSuperAdmin();
  modal.innerHTML = `
<div class="modal" style="max-width:460px;">
<div class="modal-hdr">
<div class="modal-title"><i class="ph ph-user-circle"></i> ${isEdit ? 'Agent Düzenle' : 'Yeni Agent / Kullanıcı'}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
<div class="form-grid">
<div class="form-row"><label class="form-label">Ad Soyad *</label>
<input class="form-input" id="am-name" value="${prefill?.name||''}" placeholder="Kürşat Şahan"></div>
<div class="form-row"><label class="form-label">E-posta *</label>
<input class="form-input" id="am-email" type="email" value="${prefill?.email||''}" placeholder="k.sahan@firma.com" ${isEdit?'readonly style="opacity:.6;"':''}></div>
</div>
${!isEdit ? `<div class="form-row"><label class="form-label">Şifre *</label>
<input class="form-input" id="am-pass" type="password" placeholder="En az 6 karakter"></div>` : `
<div class="form-row"><label class="form-label">Yeni Şifre <span style="color:var(--text-3)">(boş = değişmez)</span></label>
<input class="form-input" id="am-pass" type="password" placeholder="••••••••"></div>`}
<div class="form-grid">
<div class="form-row"><label class="form-label">Rol</label>
<select class="form-input" id="am-role">
<option value="agent" ${prefill?.role==='agent'?'selected':''}>Agent</option>
<option value="qc" ${prefill?.role==='qc'?'selected':''}>QC</option>
<option value="firm_admin" ${prefill?.role==='firm_admin'?'selected':''}>Firma Admin</option>
${showFieldOpt ? `<option value="field_agent" ${prefill?.role==='field_agent'?'selected':''}>Saha Elemanı</option>` : ''}
${canAssignSuper ? `<option value="super_admin" ${prefill?.role==='super_admin'?'selected':''}>Süper Admin</option>` : ''}
</select></div>
<div class="form-row"><label class="form-label">Durum</label>
<select class="form-input" id="am-active">
<option value="true" ${prefill?.is_active!==false?'selected':''}>Aktif</option>
<option value="false" ${prefill?.is_active===false?'selected':''}>Pasif</option>
</select></div>
</div>
${!isEdit ? `<div class="form-row"><label class="form-label">Firma</label>
<select class="form-input" id="am-firm">
${(_allFirms||[]).map(f=>`<option value="${f.id}">${f.name}</option>`).join('')}
${!(_allFirms||[]).length ? `<option value="${currentUser.firm_id}">${escapeHtml(currentUser.firm_name || 'Firma')}</option>` : ''}
</select></div>` : ''}
</div>
<div class="modal-footer">
${isEdit ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--red);" onclick="confirmDeleteAgent('${userId}')"><i class="ph ph-trash"></i> Sil</button>` : ''}
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">İptal</button>
<button class="btn btn-primary" onclick="${isEdit?`saveAgentEdit('${userId}')`:'saveNewAgent()'}">Kaydet</button>
</div>
</div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  const targetFirmId = document.getElementById('am-firm')?.value || prefill?.firm_id || currentUser?.firm_id;
  syncFieldAgentRoleOption(prefill?.role, targetFirmId);
  const firmSel = document.getElementById('am-firm');
  if (firmSel) {
    firmSel.onchange = () => syncFieldAgentRoleOption(prefill?.role, firmSel.value);
  }
}

function openAddAgentModal() { _agentModal(null, null); }

async function openEditAgentModal(userId) {
  try {
    const users = await sb(`users?id=eq.${userId}&select=*`).catch(()=>[]);
    const u = users?.[0]; if (!u) return;
    _agentModal(userId, u);
  } catch(e) { toast('Kullanıcı yüklenemedi','err'); }
}

async function saveNewAgent() {
  const name  = document.getElementById('am-name')?.value.trim();
  const email = document.getElementById('am-email')?.value.trim().toLowerCase();
  const pass  = document.getElementById('am-pass')?.value;
  const role  = document.getElementById('am-role')?.value || 'agent';
  const firmId = document.getElementById('am-firm')?.value || currentUser.firm_id;
  if (!name||!email||!pass) { toast('Ad, e-posta ve şifre zorunlu','err'); return; }
  const pwdErr = _validateUserPassword(pass, true);
  if (pwdErr) { toast(pwdErr, 'err'); return; }
  if (role === 'field_agent' && !(await canManageFieldAgents(firmId))) {
    toast('Saha elemanı ekleme yetkiniz yok','err');
    return;
  }
  if (mbIsSuperAdmin(role) && !mbIsSuperAdmin()) {
    toast('Süper Admin rolünü sadece Süper Admin verebilir','err');
    return;
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_user_with_password`,{
      method:'POST',
      headers: mbAuthHeaders(),
      body:JSON.stringify({p_firm_id:firmId,p_email:email,p_password:pass,p_name:name,p_role:role})
    });
    if (!res.ok) throw new Error(await res.text());
    if (typeof logAuditEvent === 'function') await logAuditEvent('user_created', 'user', email, { role, firm_id: firmId });
    document.getElementById('m-agent-mgr')?.remove();
    await loadAgents();
    toast('Kullanıcı oluşturuldu ✓','ok');
  } catch(e) { toast('Hata: '+_safeErrorText(e),'err'); }
}

async function saveAgentEdit(userId) {
  const name   = document.getElementById('am-name')?.value.trim();
  const pass   = document.getElementById('am-pass')?.value;
  const role   = document.getElementById('am-role')?.value;
  const active = document.getElementById('am-active')?.value === 'true';
  if (!name) { toast('Ad zorunlu','err'); return; }
  const pwdErr = _validateUserPassword(pass, false);
  if (pwdErr) { toast(pwdErr, 'err'); return; }
  if (role === 'field_agent' && !(await canManageFieldAgents(currentUser?.firm_id))) {
    toast('Saha elemanı rolü için yetkiniz yok','err');
    return;
  }
  if (mbIsSuperAdmin(role) && !mbIsSuperAdmin()) {
    toast('Süper Admin rolünü sadece Süper Admin verebilir','err');
    return;
  }
  try {
    await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({name,role,is_active:active})});
    if (pass) {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
        method:'POST',
        headers: mbAuthHeaders(),
        body:JSON.stringify({p_user_id:userId,p_new_password:pass})
      });
      if (!r.ok) throw new Error(await r.text());
      if (typeof logAuditEvent === 'function') await logAuditEvent('user_password_reset', 'user', userId, {});
    }
    if (typeof logAuditEvent === 'function') await logAuditEvent('user_updated', 'user', userId, { role, active });
    document.getElementById('m-agent-mgr')?.remove();
    await loadAgents();
    toast('Güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+_safeErrorText(e),'err'); }
}

async function confirmDeleteAgent(userId) {
  if (!(await mbConfirm('Bu kullanıcıyı silmek istediğinize emin misiniz?', 'Kullanıcı Sil'))) return;
  try {
    await sb(`users?id=eq.${userId}`,{method:'DELETE',prefer:'return=minimal'});
    if (typeof logAuditEvent === 'function') await logAuditEvent('user_deleted', 'user', userId, {});
    document.getElementById('m-agent-mgr')?.remove();
    await loadAgents();
    toast('Kullanıcı silindi','ok');
  } catch(e) { toast('Silinemedi: '+e.message,'err'); }
}

async function openAssignModal() {
  if (!currentCampId) return;
  const ff = getFirmFilter('&');
  try {
    const users = await sb(`users?select=id,name,email,role${ff}&role=eq.agent&is_active=eq.true&order=name.asc`) || [];
    const sel = document.getElementById('assign-sel');
    if (sel) {
      sel.innerHTML = '<option value="">Agent seçin...</option>' +
        users.map(u=>`<option value="${u.id}">${u.name} (${u.email})</option>`).join('');
    }
  } catch(e) {}
  openModal('m-assign');
}

async function assignAgent() {
  const id = document.getElementById('assign-sel').value;
  if (!id||!currentCampId) { toast('Seçim yapın','err'); return; }
  const camp = campaigns.find(c=>c.id===currentCampId);
  try {
    await sb('agent_campaigns',{method:'POST',prefer:'return=minimal',
      body:JSON.stringify({
        agent_id:id, campaign_id:currentCampId,
        firm_id: camp?.firm_id || currentUser.firm_id
      })
    });
    closeModal('m-assign');
    toast('Agent eklendi ✓','ok');
    await loadCampaigns();
    openCampDetail(currentCampId, { keepTab: true });
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function removeAgent(agentId, campId) {
  try {
    await sb(`agent_campaigns?agent_id=eq.${agentId}&campaign_id=eq.${campId}`,{method:'DELETE',prefer:'return=minimal'});
    toast('Agent çıkarıldı','ok');
    await loadCampaigns();
    openCampDetail(campId, { keepTab: true });
  } catch(e) {}
}

// ── Firma Yönetimi (super_admin) ──────────────
async function loadFirmsPage() {
  const el = document.getElementById('firms-list');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-3);padding:24px;">Yükleniyor...</div>';
  try {
    const [firms, users] = await Promise.all([
      sb('firms?select=*&order=created_at.asc'),
      sb('users?select=id,firm_id,name,email,role,is_active&order=name.asc')
    ]);
    if (!firms?.length) { el.innerHTML = '<div style="color:var(--text-3);padding:24px;">Firma yok</div>'; return; }
    el.innerHTML = firms.map(f => {
      const fu  = (users||[]).filter(u=>u.firm_id===f.id);
      const bal = f.balance || 0;
      const cur = f.currency || 'EUR';
      const sym = {EUR:'€',USD:'$',TRY:'₺'}[cur]||cur;
      return `<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
<div>
<div style="font-size:16px;font-weight:800;">${f.name}</div>
<div style="font-size:12px;color:var(--text-3);">${f.slug} · ${f.plan} · ${fu.length} kullanıcı</div>
</div>
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--radius-sm);">
<span style="font-size:11px;color:var(--text-3);">Bakiye:</span>
<span style="font-size:14px;font-weight:800;color:var(--green);font-family:var(--mono);">${sym}${Number(bal).toFixed(2)}</span>
<button class="btn btn-ghost btn-sm" style="padding:1px 7px;font-size:11px;" onclick="openBalanceModal('${f.id}','${f.name.replace(/'/g,"\\'")}','${cur}')">+ Yükle</button>
</div>
<button class="btn btn-ghost btn-sm" onclick="openUserModal('${f.id}','${f.name.replace(/'/g,"\\'")}')">+ Kullanıcı</button>
<button class="btn btn-ghost btn-sm" onclick="editFirm('${f.id}')">Düzenle</button>
</div>
</div>
<div style="display:flex;flex-direction:column;gap:4px;">
${fu.map(u=>`
<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-3);border-radius:var(--radius-xs);cursor:pointer;" onclick="openEditUserModal('${u.id}')">
<div style="display:flex;align-items:center;gap:10px;">
<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;">${u.name.charAt(0)}</div>
<div>
<div style="font-size:12px;font-weight:700;">${u.name}</div>
<div style="font-size:11px;color:var(--text-3);">${u.email}</div>
</div>
</div>
<div style="display:flex;gap:5px;align-items:center;" onclick="event.stopPropagation()">
<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:700;">${u.role}</span>
<button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;${u.is_active?'':'color:var(--red);'}" onclick="toggleUserActive('${u.id}',${u.is_active})">${u.is_active?'Aktif':'Pasif'}</button>
<button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="resetUserPass('${u.id}','${u.email}')"><i class="ph ph-key"></i></button>
<button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="openEditUserModal('${u.id}')"><i class="ph ph-pencil-simple"></i></button>
</div>
</div>`).join('')}
</div>
</div>`;
    }).join('');
  } catch(e) { el.innerHTML = '<div style="color:var(--red);padding:24px;">Hata: '+e.message+'</div>'; }
}

async function openEditUserModal(userId) {
  const users = await sb(`users?id=eq.${userId}&select=*`).catch(()=>[]);
  const u = users?.[0]; if (!u) return;
  document.getElementById('m-edit-user')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-edit-user'; modal.className = 'modal-overlay open'; modal.style.zIndex='3001';
  const canAssignSuper = mbIsSuperAdmin();
  modal.innerHTML = `
<div class="modal" style="max-width:440px;">
<div class="modal-hdr">
<div class="modal-title"><i class="ph ph-pencil-simple"></i> Kullanıcı Düzenle</div>
<button class="modal-close" onclick="document.getElementById('m-edit-user').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
<div class="form-row"><label class="form-label">Ad Soyad *</label>
<input class="form-input" id="eu-name" value="${u.name}"></div>
<div class="form-row"><label class="form-label">E-posta *</label>
<input class="form-input" id="eu-email" value="${u.email}" type="email"></div>
<div class="form-row"><label class="form-label">Yeni Şifre (boş = değişmez)</label>
<input class="form-input" id="eu-pass" type="password" placeholder="••••••••"></div>
<div class="form-row"><label class="form-label">Rol</label>
<select class="form-input" id="eu-role">
<option value="agent" ${u.role==='agent'?'selected':''}>Agent</option>
<option value="qc" ${u.role==='qc'?'selected':''}>QC</option>
<option value="field_agent" ${u.role==='field_agent'?'selected':''}>Saha Elemanı</option>
<option value="firm_admin" ${u.role==='firm_admin'?'selected':''}>Firma Admin</option>
${canAssignSuper ? `<option value="super_admin" ${u.role==='super_admin'?'selected':''}>Süper Admin</option>` : ''}
</select></div>
<div class="form-row"><label class="form-label">Durum</label>
<select class="form-input" id="eu-active">
<option value="true" ${u.is_active?'selected':''}>Aktif</option>
<option value="false" ${!u.is_active?'selected':''}>Pasif</option>
</select></div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('m-edit-user').remove()">İptal</button>
<button class="btn btn-primary" onclick="saveEditUser('${userId}')">Kaydet</button>
</div>
</div>`;
  modal.addEventListener('click', e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
  const euRole = document.getElementById('eu-role');
  canManageFieldAgents(u.firm_id).then((can) => {
    if (!euRole) return;
    const opt = [...euRole.options].find((o) => o.value === 'field_agent');
    if (!can && opt) {
      if (euRole.value === 'field_agent') euRole.value = 'agent';
      opt.remove();
    }
  });
}

async function saveEditUser(userId) {
  const name   = document.getElementById('eu-name')?.value.trim();
  const email  = document.getElementById('eu-email')?.value.trim().toLowerCase();
  const pass   = document.getElementById('eu-pass')?.value;
  const role   = document.getElementById('eu-role')?.value;
  const active = document.getElementById('eu-active')?.value === 'true';
  if (!name||!email) { toast('Ad ve e-posta zorunlu','err'); return; }
  const pwdErr = _validateUserPassword(pass, false);
  if (pwdErr) { toast(pwdErr, 'err'); return; }
  if (role === 'field_agent' && !(await canManageFieldAgents(currentUser?.firm_id))) {
    toast('Saha elemanı rolü için yetkiniz yok','err');
    return;
  }
  if (mbIsSuperAdmin(role) && !mbIsSuperAdmin()) {
    toast('Süper Admin rolünü sadece Süper Admin verebilir','err');
    return;
  }
  try {
    await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({name,email,role,is_active:active})});
    if (pass) {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
        method:'POST',
        headers: mbAuthHeaders(),
        body:JSON.stringify({p_user_id:userId,p_new_password:pass})
      });
      if (!r.ok) throw new Error(await r.text());
    }
    document.getElementById('m-edit-user')?.remove();
    await loadFirmsPage();
    toast('Kullanıcı güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+_safeErrorText(e),'err'); }
}

function openBalanceModal(firmId, firmName, currentCurrency) {
  document.getElementById('m-balance')?.remove();
  const modal = document.createElement('div');
  modal.id='m-balance'; modal.className='modal-overlay open'; modal.style.zIndex='3001';
  modal.innerHTML=`
<div class="modal" style="max-width:360px;">
<div class="modal-hdr">
<div class="modal-title">💰 Bakiye Yükle — ${firmName}</div>
<button class="modal-close" onclick="document.getElementById('m-balance').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
<div class="form-row"><label class="form-label">Para Birimi</label>
<select class="form-input" id="bal-currency">
<option value="EUR" ${currentCurrency==='EUR'?'selected':''}>€ Euro</option>
<option value="USD" ${currentCurrency==='USD'?'selected':''}>$ Dolar</option>
<option value="TRY" ${currentCurrency==='TRY'?'selected':''}>₺ Türk Lirası</option>
</select></div>
<div class="form-row"><label class="form-label">Miktar *</label>
<input class="form-input" id="bal-amount" type="number" min="0" step="0.01" placeholder="100.00"></div>
<div class="form-row"><label class="form-label">Not (opsiyonel)</label>
<input class="form-input" id="bal-note" placeholder="Ocak ödemesi..."></div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('m-balance').remove()">İptal</button>
<button class="btn btn-primary" onclick="saveBalance('${firmId}')">✓ Yükle</button>
</div>
</div>`;
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}

async function saveBalance(firmId) {
  const amount   = parseFloat(document.getElementById('bal-amount')?.value||'0');
  const currency = document.getElementById('bal-currency')?.value||'EUR';
  if (!amount||amount<=0) { toast('Geçerli miktar girin','err'); return; }
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=balance,currency`);
    const oldBal = firms?.[0]?.balance || 0;
    const newBal = oldBal + amount;
    await sb(`firms?id=eq.${firmId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({balance:newBal, currency})});
    document.getElementById('m-balance')?.remove();
    await loadFirmsPage();
    const sym = {EUR:'€',USD:'$',TRY:'₺'}[currency]||currency;
    toast(`${sym}${amount.toFixed(2)} yüklendi ✓ (Toplam: ${sym}${newBal.toFixed(2)})`,'ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function openFirmModal() {
  firmEditId = null;
  document.getElementById('firm-modal-title').textContent = 'Firma Ekle';
  document.getElementById('firm-name').value = '';
  document.getElementById('firm-slug').value = '';
  document.getElementById('firm-plan').value = 'enterprise';
  document.getElementById('firm-currency').value = 'EUR';
  const incRow = document.getElementById('firm-incoming-super-row');
  const incChk = document.getElementById('firm-incoming-super');
  const didRow = document.getElementById('firm-did-row');
  const didEl = document.getElementById('firm-outbound-did');
  if (incRow) incRow.style.display = mbIsSuperAdmin() ? '' : 'none';
  if (incChk) incChk.checked = false;
  if (didRow) didRow.style.display = mbIsSuperAdmin() ? '' : 'none';
  if (didEl) didEl.value = '';
  openModal('m-firm');
}

async function editFirm(id) {
  firmEditId = id;
  try {
    const rows = await sb(`firms?id=eq.${id}&select=name,slug,plan,currency,settings`);
    const f = rows?.[0] || {};
    document.getElementById('firm-modal-title').textContent = 'Firma Düzenle';
    document.getElementById('firm-name').value = f.name || '';
    document.getElementById('firm-slug').value = f.slug || '';
    document.getElementById('firm-plan').value = f.plan || 'enterprise';
    const cur = String(f.currency || f.settings?.currency || 'EUR').toUpperCase();
    document.getElementById('firm-currency').value = ['EUR','USD','TRY'].includes(cur) ? cur : 'EUR';
    const incRow = document.getElementById('firm-incoming-super-row');
    const incChk = document.getElementById('firm-incoming-super');
    if (incRow) incRow.style.display = mbIsSuperAdmin() ? '' : 'none';
    if (incChk) incChk.checked = !!(f.settings?.dialer?.incoming_super_enabled);
    const didRow = document.getElementById('firm-did-row');
    const didEl = document.getElementById('firm-outbound-did');
    if (didRow) didRow.style.display = mbIsSuperAdmin() ? '' : 'none';
    if (didEl) didEl.value = f.settings?.dialer?.outbound_did || '';
  } catch (e) {}
  openModal('m-firm');
}

async function saveFirm() {
  const name = document.getElementById('firm-name').value.trim();
  const slug = document.getElementById('firm-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
  const plan = document.getElementById('firm-plan').value;
  const currency = String(document.getElementById('firm-currency')?.value || 'EUR').toUpperCase();
  if (!name||!slug) { toast('Ad ve slug zorunlu','err'); return; }
  try {
    if (firmEditId) {
      const rows = await sb(`firms?id=eq.${firmEditId}&select=settings`).catch(() => []);
      const oldSettings = rows?.[0]?.settings || {};
      const oldDialer = oldSettings.dialer || {};
      const incomingSuper = document.getElementById('firm-incoming-super')?.checked;
      const didRaw = String(document.getElementById('firm-outbound-did')?.value || '').replace(/[\s()-]/g, '');
      if (mbIsSuperAdmin() && didRaw && (typeof mbIsE164 !== 'function' || !mbIsE164(didRaw))) {
        toast('Firma hattı + ile başlamalı, örnek +49301234567', 'err');
        return;
      }
      const dialer = {
        ...oldDialer,
        ...(mbIsSuperAdmin()
          ? { incoming_super_enabled: !!incomingSuper, outbound_did: didRaw }
          : {}),
      };
      await sb(`firms?id=eq.${firmEditId}`,{
        method:'PATCH',
        prefer:'return=minimal',
        body:JSON.stringify({name,slug,plan,currency,settings:{...oldSettings,currency,dialer}})
      });
      if (mbIsSuperAdmin() && dialer.outbound_did) {
        await sb(`campaigns?firm_id=eq.${firmEditId}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ telnyx_did: dialer.outbound_did }),
        }).catch(() => {});
      }
    } else {
      const incomingSuperNew = document.getElementById('firm-incoming-super')?.checked;
      const didNew = mbIsSuperAdmin() ? String(document.getElementById('firm-outbound-did')?.value || '').replace(/[\s()-]/g, '') : '';
      if (didNew && (typeof mbIsE164 !== 'function' || !mbIsE164(didNew))) {
        toast('Firma hattı + ile başlamalı, örnek +49301234567', 'err');
        return;
      }
      const dialerNew = { incoming_super_enabled: mbIsSuperAdmin() ? !!incomingSuperNew : false, outbound_did: didNew };
      await sb('firms',{method:'POST',prefer:'return=minimal',body:JSON.stringify({name,slug,plan,currency,settings:{currency,dialer:dialerNew}})});
    }
    closeModal('m-firm');
    await loadFirmsPage();
    toast('Firma kaydedildi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function openUserModal(firmId, firmName) {
  userEditId = null;
  document.getElementById('user-modal-title').textContent = `Kullanıcı Ekle — ${firmName}`;
  document.getElementById('user-firm-id').value = firmId;
  ['user-name','user-email','user-pass'].forEach(id => document.getElementById(id).value='');
  const roleSel = document.getElementById('user-role');
  if (roleSel) {
    const canAssignSuper = mbIsSuperAdmin();
    const hasSuper = [...roleSel.options].some((o) => o.value === 'super_admin');
    if (!canAssignSuper && hasSuper) {
      [...roleSel.options].forEach((o) => { if (o.value === 'super_admin') o.remove(); });
    }
    if (canAssignSuper && !hasSuper) {
      const o = document.createElement('option');
      o.value = 'super_admin';
      o.textContent = 'Süper Admin';
      roleSel.appendChild(o);
    }
    roleSel.value = 'agent';
  }
  openModal('m-user');
}

async function saveUser() {
  const name   = document.getElementById('user-name').value.trim();
  const email  = document.getElementById('user-email').value.trim().toLowerCase();
  const pass   = document.getElementById('user-pass').value;
  const role   = document.getElementById('user-role').value;
  const firmId = document.getElementById('user-firm-id').value;
  if (!name||!email||!pass) { toast('Tüm alanlar zorunlu','err'); return; }
  if (mbIsSuperAdmin(role) && !mbIsSuperAdmin()) {
    toast('Süper Admin rolünü sadece Süper Admin verebilir','err');
    return;
  }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_user_with_password`,{
      method:'POST',
      headers: mbAuthHeaders(),
      body:JSON.stringify({p_firm_id:firmId,p_email:email,p_password:pass,p_name:name,p_role:role})
    });
    if (!res.ok) throw new Error(await res.text());
    closeModal('m-user');
    await loadFirmsPage();
    toast('Kullanıcı eklendi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function toggleUserActive(userId, cur) {
  await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({is_active:!cur})});
  loadFirmsPage();
}

async function resetUserPass(userId, email) {
  const p = await mbPrompt(`${email} için yeni şifre:`, '', 'Şifre Sıfırla');
  if (!p) return;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
      method:'POST',
      headers: mbAuthHeaders(),
      body:JSON.stringify({p_user_id:userId,p_new_password:p})
    });
    if (!r.ok) throw new Error(await r.text());
    toast('Şifre sıfırlandı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

// ── Roller & İzinler ──────────────────────────
// BUILTIN_ROLES ve ALL_PAGES js/access.js içinden gelir.

async function loadRolesPage() {
  const card = document.getElementById('roles-card');
  const el   = document.getElementById('roles-list');
  const addBtn = card?.querySelector('button[onclick="openAddRoleModal()"]');
  if (!card || !el) return;
  const canManage = mbIsFirmAdmin();
  if (!canManage) { card.style.display='none'; return; }
  card.style.display = '';
  let targetFirmId = getActiveFirmId() || currentUser.firm_id;
  if (addBtn) addBtn.style.display = isSuperAdmin() ? '' : 'none';
  let firmOptions = '';
  try {
    const titleRow = card.querySelector('.roles-firm-row');
    if (titleRow) titleRow.remove();
    if (isSuperAdmin()) {
      const firmsAll = await sb('firms?select=id,name&order=name.asc');
      if (firmsAll?.length) {
        firmOptions = firmsAll.map(f => `<option value="${f.id}" ${String(targetFirmId)===String(f.id)?'selected':''}>${f.name||f.id}</option>`).join('');
        const row = document.createElement('div');
        row.className = 'roles-firm-row';
        row.style.cssText = 'margin-bottom:12px;';
        row.innerHTML = `<label class="form-label" style="font-size:11px;">Firma</label><select class="form-input" id="roles-firm-select" onchange="loadRolesPage()">${firmOptions}</select>`;
        card.insertBefore(row, el);
        targetFirmId = document.getElementById('roles-firm-select')?.value || targetFirmId;
      }
    }
  } catch(e) {}
  let customRoles = [];
  let rolePermOverrides = {};
  try {
    const firms = await sb(`firms?id=eq.${targetFirmId}&select=settings`);
    customRoles = firms?.[0]?.settings?.custom_roles || [];
    rolePermOverrides = firms?.[0]?.settings?.role_permissions || {};
  } catch(e) {}
  const allRoles = [
    ...BUILTIN_ROLES.map(r => ({ ...r, perms: rolePermOverrides?.[r.key] || r.perms })),
    ...customRoles.map(r=>({...r,builtin:false}))
  ].filter(role => {
    if (isSuperAdmin()) return true;
    return ['agent', 'qc'].includes(role.key);
  });
  el.innerHTML = allRoles.map(role => `
<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-3);">
<span style="width:10px;height:10px;border-radius:50%;background:${role.color||'var(--text-3)'};flex-shrink:0;"></span>
<span style="font-size:13px;font-weight:700;flex:1;">${role.label}</span>
<span style="font-size:11px;color:var(--text-3);font-family:var(--mono);">${role.key}</span>
<button class="btn btn-ghost btn-sm" type="button" onclick="openRolePermModal('${role.key}')"><i class="ph ph-pencil-simple"></i> Düzenle</button>
${(!role.builtin && isSuperAdmin()) ?
  `<button class="icon-btn" style="border-color:var(--red);color:var(--red);" onclick="deleteCustomRole('${role.key}')"><i class="ph ph-trash"></i></button>` :
  (role.builtin ? '<span class="badge badge-gray" style="font-size:10px;">Yerleşik</span>' : '')}
</div>
<div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px;">
${ALL_PAGES.map(p=>`
<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;background:${role.perms.includes(p.key)?'var(--accent-soft)':'var(--bg-4)'};color:${role.perms.includes(p.key)?'var(--accent)':'var(--text-3)'};padding:3px 9px;border-radius:12px;border:1px solid ${role.perms.includes(p.key)?'var(--accent)':'var(--border)'};">
${p.label}</label>`).join('')}
</div>
</div>`).join('');
}

function _canEditRoleForCurrentUser(roleKey) {
  if (isSuperAdmin()) return true;
  const role = currentUser?.role || '';
  if (role === 'admin' || role === 'firm_admin') return ['agent', 'qc'].includes(roleKey);
  return false;
}

async function openAddRoleModal() {
  if (!isSuperAdmin()) { toast('Sadece süper admin yeni rol ekleyebilir', 'warn'); return; }
  const name = await mbPrompt('Yeni rol adı (örn: muhasebeci):','', 'Yeni Rol');
  if (!name) return;
  const key   = name.toLowerCase().replace(/[^a-z0-9_]/g,'_');
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  try {
    const fid = document.getElementById('roles-firm-select')?.value || getActiveFirmId() || currentUser.firm_id;
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const roles = existing.custom_roles || [];
    if (roles.find(r=>r.key===key)||BUILTIN_ROLES.find(r=>r.key===key)) { toast('Bu rol adı zaten var','warn'); return; }
    roles.push({key,label,color:'var(--text-2)',perms:[]});
    await sb(`firms?id=eq.${fid}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({settings:{...existing,custom_roles:roles}})});
    await loadRolesPage();
    toast('Rol oluşturuldu ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function toggleRolePerm(roleKey, pageKey, enabled) {
  if (!_canEditRoleForCurrentUser(roleKey)) { toast('Bu rolü düzenleyemezsiniz', 'warn'); return; }
  try {
    const fid = document.getElementById('roles-firm-select')?.value || getActiveFirmId() || currentUser.firm_id;
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const roles = existing.custom_roles || [];
    const role = roles.find(r=>r.key===roleKey);
    if (role) {
      if (enabled) { if (!role.perms.includes(pageKey)) role.perms.push(pageKey); }
      else role.perms = role.perms.filter(p=>p!==pageKey);
    } else {
      const builtin = BUILTIN_ROLES.find(r => r.key === roleKey);
      if (!builtin) return;
      const overrides = { ...(existing.role_permissions || {}) };
      const perms = Array.isArray(overrides[roleKey]) ? [...overrides[roleKey]] : [...builtin.perms];
      if (enabled) { if (!perms.includes(pageKey)) perms.push(pageKey); }
      else {
        const minPerm = roleKey === 'agent' ? 'dialer' : 'qc';
        if (pageKey === minPerm) { toast('Temel izin kaldırılamaz', 'warn'); return; }
        const idx = perms.indexOf(pageKey);
        if (idx >= 0) perms.splice(idx, 1);
      }
      overrides[roleKey] = perms;
      existing.role_permissions = overrides;
      existing.role_permissions_rev = 2;
    }
    await sb(`firms?id=eq.${fid}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({settings:{...existing,custom_roles:roles}})});
    toast('İzin güncellendi ✓','ok',1200);
  } catch(e) { toast('Hata','err'); }
}

async function deleteCustomRole(roleKey) {
  if (!isSuperAdmin()) { toast('Sadece süper admin rol silebilir', 'warn'); return; }
  if (!(await mbConfirm('Bu rolü silmek istediğinize emin misiniz?', 'Rol Sil'))) return;
  try {
    const fid = document.getElementById('roles-firm-select')?.value || getActiveFirmId() || currentUser.firm_id;
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const roles = (existing.custom_roles||[]).filter(r=>r.key!==roleKey);
    await sb(`firms?id=eq.${fid}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({settings:{...existing,custom_roles:roles}})});
    await loadRolesPage();
    toast('Rol silindi','ok');
  } catch(e) { toast('Hata','err'); }
}

async function openRolePermModal(roleKey) {
  if (!_canEditRoleForCurrentUser(roleKey)) { toast('Bu rolü düzenleyemezsiniz', 'warn'); return; }
  const fid = document.getElementById('roles-firm-select')?.value || getActiveFirmId() || currentUser.firm_id;
  if (!fid) { toast('Önce firma seçin', 'warn'); return; }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = firms?.[0]?.settings || {};
    const roleOverrides = settings.role_permissions || {};
    const customRoles = settings.custom_roles || [];
    const builtin = BUILTIN_ROLES.find(r => r.key === roleKey);
    const custom = customRoles.find(r => r.key === roleKey);
    const base = custom || (builtin ? { ...builtin, perms: roleOverrides[roleKey] || builtin.perms, builtin: true } : null);
    if (!base) return;
    const currentPerms = new Set(base.perms || []);
    const title = `${base.label} izinleri`;
    const html = `
      <div id="role-perm-modal" class="modal-overlay open">
        <div class="modal" style="max-width:620px;">
          <div class="modal-hdr">
            <div class="modal-title"><i class="ph ph-shield-check"></i> ${title}</div>
            <button class="modal-close" onclick="document.getElementById('role-perm-modal')?.remove()">✕</button>
          </div>
          <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;max-height:60vh;overflow:auto;">
            ${ALL_PAGES.map(p => `
              <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:8px;">
                <input type="checkbox" id="rpm-${p.key}" ${currentPerms.has(p.key) ? 'checked' : ''}>
                <span style="font-size:12px;">${p.label}</span>
              </label>
            `).join('')}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="document.getElementById('role-perm-modal')?.remove()">İptal</button>
            <button class="btn btn-primary" onclick="saveRolePermModal('${roleKey}', '${fid}')">Kaydet</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) {
    toast('İzinler açılamadı: ' + e.message, 'err');
  }
}

async function saveRolePermModal(roleKey, fid) {
  if (!_canEditRoleForCurrentUser(roleKey)) { toast('Bu rolü düzenleyemezsiniz', 'warn'); return; }
  const selected = ALL_PAGES.filter(p => document.getElementById(`rpm-${p.key}`)?.checked).map(p => p.key);
  if (!selected.length) { toast('En az bir izin seçin', 'warn'); return; }
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = firms?.[0]?.settings || {};
    const roles = settings.custom_roles || [];
    const custom = roles.find(r => r.key === roleKey);
    if (custom) {
      custom.perms = selected;
    } else {
      const overrides = { ...(settings.role_permissions || {}) };
      overrides[roleKey] = selected;
      settings.role_permissions = overrides;
      settings.role_permissions_rev = 2;
    }
    await sb(`firms?id=eq.${fid}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body: JSON.stringify({ settings: { ...settings, custom_roles: roles } })
    });
    document.getElementById('role-perm-modal')?.remove();
    await loadRolesPage();
    if (typeof refreshUserPagePerms === 'function') refreshUserPagePerms().catch(() => {});
    toast('İzinler güncellendi ✓', 'ok');
  } catch (e) {
    toast('Kaydetme hatası: ' + e.message, 'err');
  }
}

function userHasPagePerm(key) {
  if (key === 'settings' && currentUser?.role === 'agent') return true;
  if (window._userPagePermsLoaded !== true) {
    const b = BUILTIN_ROLES.find(r => r.key === currentUser?.role);
    if (!b) return true;
    const arr = b.perms || [];
    if (arr.includes(key)) return true;
    if ((key === 'maasim' || key === 'performansim') && arr.includes('muhasebe')) return true;
    return false;
  }
  const p = window._userPagePerms;
  if (p && p.has(key)) return true;
  if (p && (key === 'maasim' || key === 'performansim') && p.has('muhasebe')) return true;
  return false;
}

function _bounceIfPageForbidden() {
  const active = document.querySelector('.page.active');
  const page = active?.id?.startsWith('page-') ? active.id.slice(5) : '';
  if (!page || !ALL_PAGES.some((p) => p.key === page) || userHasPagePerm(page)) return;
  const fallback = [...(window._userPagePerms || [])].find((k) => ALL_PAGES.some((p) => p.key === k));
  if (fallback && fallback !== page) navigate(fallback);
}

async function refreshUserPagePerms() {
  const role = currentUser?.role;
  const builtin = BUILTIN_ROLES.find(r => r.key === role);
  let list = [...(builtin?.perms || [])];
  window._userPagePerms = new Set(list);
  window._userPagePermsLoaded = !!builtin;
  applySidebarPermVisibility();
  try {
    if (!currentUser?.firm_id) return;
    const firms = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const st = firms?.[0]?.settings || {};
    const ov = st.role_permissions?.[role];
    if (Array.isArray(ov)) list = mbMergeStoredPerms([...ov], role, st);
    else if (!builtin) {
      const cr = (st.custom_roles || []).find(r => r.key === role);
      if (cr?.perms) list = [...cr.perms];
    }
    window._userPagePerms = new Set(list);
    window._userPagePermsLoaded = true;
    applySidebarPermVisibility();
    _bounceIfPageForbidden();
  } catch (e) {}
}

function applySidebarPermVisibility() {
  if (typeof mbApplyNavAccess === 'function') mbApplyNavAccess();
}
