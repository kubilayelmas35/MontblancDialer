// ─────────────────────────────────────────────
// Ekip sohbeti — Realtime, global (süper admin), grup üyeleri, gelişmiş UI
// ─────────────────────────────────────────────

let _chatOpen = false;
let _chatMode = 'firm'; // 'firm' | 'global'
let _chatGroups = [];
let _chatActiveGroupId = null;
let _chatMessages = [];
let _globalFeed = [];
let _chatPollTimer = null;
let _chatLastNotifiedId = null;
let _mediaRecorder = null;
let _mediaChunks = [];
let _recording = false;
let _firmUsersCache = [];
let _chatLastFirmId = null;
let _sbClient = null;
let _rtChannel = null;
let _firmChatSettingsCache = {};
let _chatNotifySuppressedUntil = 0;
let _chatLastNotifyTs = null;
let _chatFabPreviewTimer = null;
let _pendingNotifyGroupId = null;

function defaultFirmChatSettings() {
  return {
    allow_peer_dm: true,
    firm_admin_can_dm_super: true,
    hidden_from_picker_ids: []
  };
}

function invalidateFirmChatSettingsCache(fid) {
  if (fid) delete _firmChatSettingsCache[fid];
  else _firmChatSettingsCache = {};
}

async function getFirmChatSettings(fid) {
  if (!fid) return defaultFirmChatSettings();
  if (_firmChatSettingsCache[fid]) return _firmChatSettingsCache[fid];
  try {
    const r = await sb(`firms?id=eq.${fid}&select=settings`);
    const raw = r?.[0]?.settings?.chat || {};
    const merged = { ...defaultFirmChatSettings(), ...raw };
    if (!Array.isArray(merged.hidden_from_picker_ids)) merged.hidden_from_picker_ids = [];
    _firmChatSettingsCache[fid] = merged;
    return merged;
  } catch (e) {
    return defaultFirmChatSettings();
  }
}

function filterUsersByChatSettings(users, fid, settings, viewer) {
  const hidden = new Set(settings.hidden_from_picker_ids || []);
  const viewerRole = viewer?.role || '';
  let out = (users || []).filter((u) => {
    if (hidden.has(u.id)) return false;
    return true;
  });
  if (['agent', 'qc'].includes(viewerRole) && !settings.allow_peer_dm) {
    out = out.filter((u) => !['agent', 'qc'].includes(u.role));
  }
  return out;
}

function _chatFirmId() {
  const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : null;
  return fid || currentUser?.firm_id || null;
}

function _canManageChatGroups() {
  const r = currentUser?.role || '';
  return ['super_admin', 'admin', 'firm_admin'].includes(r);
}

function _chatSuperSeesAll() {
  return currentUser?.role === 'super_admin';
}

/** Grup / DM üye seçiminde tüm firmalar (süper admin + firmasız global admin) */
function _chatPickUsersGlobally() {
  const r = currentUser?.role || '';
  if (r === 'super_admin') return true;
  if (r === 'admin' && !currentUser?.firm_id) return true;
  return false;
}

async function fetchUsersForChatPicker(fid) {
  let rows = [];
  if (_chatPickUsersGlobally()) {
    rows =
      (await sb(
        `users?is_active=eq.true&select=id,name,role,firm_id,firms(name)&order=name.asc`
      ).catch(() => null)) || [];
    if (!rows.length) {
      rows =
        (await sb(`users?is_active=eq.true&select=id,name,role,firm_id&order=name.asc`).catch(() => [])) || [];
    }
    if (fid) {
      const settings = await getFirmChatSettings(fid);
      rows = rows.filter((u) => {
        if (u.role === 'super_admin') return true;
        if (!u.firm_id || u.firm_id === fid) return true;
        return false;
      });
      rows = filterUsersByChatSettings(rows, fid, settings, currentUser);
    }
  } else {
    if (!fid) return [];
    rows =
      (await sb(`users?firm_id=eq.${fid}&is_active=eq.true&select=id,name,role&order=name.asc`).catch(() => [])) ||
      [];
    const settings = await getFirmChatSettings(fid);
    rows = filterUsersByChatSettings(rows, fid, settings, currentUser);
    if (
      settings.firm_admin_can_dm_super !== false &&
      ['firm_admin', 'admin'].includes(currentUser?.role || '')
    ) {
      const supers =
        (await sb(
          `users?role=eq.super_admin&is_active=eq.true&select=id,name,role,firm_id,firms(name)&order=name.asc`
        ).catch(() => [])) || [];
      const have = new Set(rows.map((u) => u.id));
      for (const s of supers) {
        if (!have.has(s.id)) rows.push(s);
      }
    }
  }
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
  return rows;
}

function formatChatUserLabel(u) {
  const fn = u.firms;
  const firmName = typeof fn === 'object' && fn && fn.name ? fn.name : null;
  if (firmName) return `${u.name} · ${firmName}`;
  return `${u.name} (${u.role || '—'})`;
}

async function getSupabaseClient() {
  if (_sbClient) return _sbClient;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    _sbClient = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 12 } }
    });
    return _sbClient;
  } catch (e) {
    console.warn('supabase-js load', e);
    return null;
  }
}

async function unbindRealtime() {
  try {
    if (_rtChannel && _sbClient) {
      await _sbClient.removeChannel(_rtChannel);
    }
  } catch (e) {}
  _rtChannel = null;
}

async function bindRealtime() {
  await unbindRealtime();
  const client = await getSupabaseClient();
  if (!client) return;
  const handler = (payload) => {
    const row = payload.new;
    updateTeamChatBadge();
    if (row && row.sender_id && row.sender_id !== currentUser.id) {
      void handleChatMessageNotification(row);
    }
    if (!_chatOpen) return;
    if (_chatSuperSeesAll() && _chatMode === 'global') {
      loadGlobalFeed(true);
      return;
    }
    if (row && row.group_id === _chatActiveGroupId) loadTeamChatMessages(true);
  };
  const base = { event: 'INSERT', schema: 'public', table: 'chat_messages' };
  let filter = null;
  if (!(_chatSuperSeesAll() && _chatMode === 'global')) {
    const fid = _chatFirmId();
    if (!fid) return;
    filter = `firm_id=eq.${fid}`;
  }
  const topic = filter ? `chat-ins-${filter}` : 'chat-ins-all';
  const cfg = filter ? { ...base, filter } : base;
  _rtChannel = client
    .channel(topic + '-' + Date.now())
    .on('postgres_changes', cfg, handler)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.warn('chat realtime channel error');
    });
}

function setChatMode(mode) {
  _chatMode = mode === 'global' ? 'global' : 'firm';
  document.querySelectorAll('.team-chat-mode-pill').forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-mode') === _chatMode);
  });
  const firmLayout = document.getElementById('team-chat-firm-layout');
  const globalEl = document.getElementById('team-chat-global-feed');
  const compose = document.getElementById('team-chat-compose-wrap');
  if (firmLayout) firmLayout.style.display = _chatMode === 'firm' ? 'flex' : 'none';
  if (globalEl) globalEl.style.display = _chatMode === 'global' ? 'flex' : 'none';
  if (compose) compose.style.display = _chatMode === 'global' ? 'none' : '';
  if (_chatMode === 'global') {
    loadGlobalFeed();
  } else {
    void refreshTeamChatGroups();
  }
  bindRealtime();
}

async function initChat() {
  const root = document.getElementById('team-chat-root');
  const fab = document.getElementById('team-chat-fab');
  if (!root || !fab || !currentUser) return;
  fab.onclick = () => {
    dismissChatFabPreview();
    toggleTeamChat();
  };
  const closeBtn = document.getElementById('team-chat-close');
  if (closeBtn) closeBtn.onclick = () => toggleTeamChat(false);
  const sendBtn = document.getElementById('team-chat-send');
  if (sendBtn) sendBtn.onclick = () => sendTeamChatText();
  const inp = document.getElementById('team-chat-input');
  if (inp) {
    inp.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTeamChatText();
      }
    };
  }
  const fInp = document.getElementById('team-chat-file');
  if (fInp) fInp.onchange = () => sendTeamChatFile(fInp);
  const micBtn = document.getElementById('team-chat-mic');
  if (micBtn) micBtn.onclick = () => toggleTeamChatVoice();
  const newGrp = document.getElementById('team-chat-new-group');
  if (newGrp) newGrp.onclick = () => openNewGroupModal();
  const quickDm = document.getElementById('team-chat-quick-dm');
  if (quickDm) quickDm.onclick = () => void openQuickDmModal();
  const quickCancel = document.getElementById('team-chat-quick-cancel');
  const quickGo = document.getElementById('team-chat-quick-go');
  if (quickCancel) quickCancel.onclick = () => closeQuickDmModal();
  if (quickGo) quickGo.onclick = () => void confirmQuickDm();
  const saveGrp = document.getElementById('team-chat-save-group');
  if (saveGrp) saveGrp.onclick = () => saveNewGroup();
  const modeWrap = document.getElementById('team-chat-mode-wrap');
  if (modeWrap && _chatSuperSeesAll()) {
    modeWrap.style.display = 'flex';
    modeWrap.querySelectorAll('.team-chat-mode-pill').forEach((p) => {
      p.onclick = () => setChatMode(p.getAttribute('data-mode'));
    });
  } else if (modeWrap) modeWrap.style.display = 'none';

  _chatLastNotifyTs = new Date().toISOString();
  _chatNotifySuppressedUntil = Date.now() + 2600;
  const pop = document.getElementById('team-chat-fab-pop');
  if (pop) {
    pop.onclick = () => {
      dismissChatFabPreview();
      if (_pendingNotifyGroupId) {
        const gid = _pendingNotifyGroupId;
        _pendingNotifyGroupId = null;
        _chatMode = 'firm';
        setChatMode('firm');
        _chatActiveGroupId = gid;
        refreshTeamChatGroups().then(() => {
          selectTeamChatGroup(gid);
          bindRealtime();
          toggleTeamChat(true);
        });
      } else toggleTeamChat(true);
    };
  }

  try {
    await refreshTeamChatGroups();
    await updateTeamChatBadge();
  } catch (e) {
    console.warn('chat init', e);
  }
  if (_chatPollTimer) clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(() => {
    if (!currentUser) return;
    updateTeamChatBadge();
    if (_chatOpen && _chatSuperSeesAll() && _chatMode === 'global') loadGlobalFeed(true);
    else if (_chatOpen && _chatActiveGroupId && _chatMode === 'firm') loadTeamChatMessages(true);
  }, 12000);
}

function toggleTeamChat(open) {
  const panel = document.getElementById('team-chat-panel');
  if (!panel) return;
  if (open === undefined) _chatOpen = !_chatOpen;
  else _chatOpen = !!open;
  panel.classList.toggle('team-chat-panel--open', _chatOpen);
  panel.style.display = _chatOpen ? 'flex' : 'none';
  if (_chatOpen) {
    dismissChatFabPreview();
    const fid = _chatFirmId();
    if (!fid && _chatSuperSeesAll() && _chatMode === 'firm') {
      toast('Süper admin: firma seçin veya Tümü sekmesine geçin', 'warn');
    }
    if (_chatMode === 'global') {
      loadGlobalFeed();
      bindRealtime();
    } else {
      refreshTeamChatGroups().then(() => {
        if (_chatActiveGroupId) loadTeamChatMessages();
        markTeamChatRead();
        bindRealtime();
      });
    }
  } else {
    unbindRealtime();
  }
}

async function ensureFirmWideGroup(firmId) {
  const existing = await sb(`chat_groups?firm_id=eq.${firmId}&slug=eq.firm_wide&select=id`).catch(() => []);
  if (existing?.length) return existing[0].id;
  let row = await sb('chat_groups', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify({
      firm_id: firmId,
      name: 'Tüm ekip',
      slug: 'firm_wide',
      created_by: currentUser.id
    })
  }).catch(() => null);
  let gid = row?.[0]?.id;
  if (!gid) {
    const again = await sb(`chat_groups?firm_id=eq.${firmId}&slug=eq.firm_wide&select=id`).catch(() => []);
    gid = again?.[0]?.id;
  }
  if (!gid) return null;
  await syncFirmWideMembers(firmId, gid);
  return gid;
}

async function syncFirmWideMembers(firmId, groupId) {
  const users = await sb(`users?firm_id=eq.${firmId}&select=id&is_active=eq.true`).catch(() => []);
  const supers = await sb(`users?role=eq.super_admin&select=id`).catch(() => []);
  const ids = new Set([...(users || []).map((u) => u.id), ...(supers || []).map((s) => s.id)]);
  const mems = await sb(`chat_group_members?group_id=eq.${groupId}&select=user_id`).catch(() => []);
  const have = new Set((mems || []).map((m) => m.user_id));
  for (const uid of ids) {
    if (!have.has(uid)) {
      await sb('chat_group_members', {
        method: 'POST',
        body: JSON.stringify({ group_id: groupId, user_id: uid })
      }).catch(() => {});
    }
  }
}

async function refreshTeamChatGroups() {
  const fid = _chatFirmId();
  const listEl = document.getElementById('team-chat-group-list');
  if (!fid) {
    _chatGroups = [];
    _chatActiveGroupId = null;
    if (listEl) listEl.innerHTML = '<div class="team-chat-muted">Firma seçin</div>';
    return;
  }
  if (fid !== _chatLastFirmId) {
    _chatLastFirmId = fid;
    _chatActiveGroupId = null;
  }
  await ensureFirmWideGroup(fid);
  const gwide = await sb(`chat_groups?firm_id=eq.${fid}&slug=eq.firm_wide&select=id`).catch(() => []);
  if (gwide?.[0]?.id) await syncFirmWideMembers(fid, gwide[0].id);

  const mems = await sb(`chat_group_members?user_id=eq.${currentUser.id}&select=group_id`).catch(() => []);
  const gids = (mems || []).map((m) => m.group_id);
  if (!gids.length) {
    _chatGroups = [];
    if (listEl) listEl.innerHTML = '<div class="team-chat-muted">Grup yok</div>';
    return;
  }
  const inList = gids.join(',');
  const groups = await sb(`chat_groups?id=in.(${inList})&firm_id=eq.${fid}&select=id,name,slug&order=name.asc`).catch(() => []);
  _chatGroups = groups || [];
  if (listEl) {
    listEl.innerHTML = _chatGroups
      .map((g) => {
        const sel = g.id === _chatActiveGroupId ? ' selected' : '';
        const canGear = _canManageChatGroups() && g.slug !== 'firm_wide';
        const gear = canGear
          ? `<button type="button" class="team-chat-group-gear" data-gid="${g.id}" title="Üyeler"><i class="ph ph-users-three"></i></button>`
          : _canManageChatGroups() && g.slug === 'firm_wide'
            ? `<button type="button" class="team-chat-group-gear" data-gid="${g.id}" title="Üyeler (salt okunur)"><i class="ph ph-users-three"></i></button>`
            : '';
        return `<div class="team-chat-group-row${sel}">
<button type="button" class="team-chat-group-item" data-gid="${g.id}">${escapeHtml(g.name)}</button>${gear}</div>`;
      })
      .join('');
    listEl.querySelectorAll('.team-chat-group-item').forEach((btn) => {
      btn.onclick = () => selectTeamChatGroup(btn.getAttribute('data-gid'));
    });
    listEl.querySelectorAll('.team-chat-group-gear').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        openGroupMembersModal(b.getAttribute('data-gid'));
      };
    });
  }
  const newBtn = document.getElementById('team-chat-new-group');
  const quickBtn = document.getElementById('team-chat-quick-dm');
  const showMgr = _canManageChatGroups();
  const st = await getFirmChatSettings(fid);
  const peerOk = st.allow_peer_dm && ['agent', 'qc'].includes(currentUser?.role || '');
  const showQuick = showMgr || peerOk;
  if (newBtn) newBtn.style.display = showMgr ? '' : 'none';
  if (quickBtn) quickBtn.style.display = showQuick ? '' : 'none';
  if (!_chatActiveGroupId && _chatGroups.length) selectTeamChatGroup(_chatGroups[0].id);
}

function selectTeamChatGroup(gid) {
  _chatActiveGroupId = gid;
  document.querySelectorAll('.team-chat-group-row').forEach((row) => {
    const btn = row.querySelector('.team-chat-group-item');
    row.classList.toggle('selected', btn && btn.getAttribute('data-gid') === gid);
  });
  loadTeamChatMessages();
  markTeamChatRead();
}

async function loadGlobalFeed(quiet) {
  if (!_chatSuperSeesAll()) return;
  const rows =
    (await sb(
      `chat_messages?select=id,body,content_type,file_url,file_name,created_at,sender_id,firm_id,group_id,firms(name),chat_groups(name)&order=created_at.desc&limit=100`
    ).catch(() => [])) || [];
  const senders = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
  let names = {};
  if (senders.length) {
    const su = senders.join(',');
    const users = await sb(`users?id=in.(${su})&select=id,name`).catch(() => []);
    (users || []).forEach((u) => (names[u.id] = u.name));
  }
  _globalFeed = rows.map((r) => {
    const fr = r.firms;
    const gr = r.chat_groups;
    const firmName = typeof fr === 'object' && fr ? fr.name : null;
    const groupName = typeof gr === 'object' && gr ? gr.name : null;
    return {
      ...r,
      sender_name: names[r.sender_id] || '—',
      firm_label: firmName || '—',
      group_label: groupName || '—'
    };
  });
  renderGlobalFeed();
  if (!quiet && rows.length) {
    const last = rows[0];
    if (last.id !== _chatLastNotifiedId && last.sender_id !== currentUser.id) {
      _chatLastNotifiedId = last.id;
      pulseTeamChatFab();
    }
  }
}

function renderGlobalFeed() {
  const box = document.getElementById('team-chat-global-list');
  if (!box) return;
  if (!_globalFeed.length) {
    box.innerHTML = '<div class="team-chat-empty"><i class="ph ph-globe-hemisphere-west"></i><p>Henüz mesaj yok</p></div>';
    return;
  }
  box.innerHTML = _globalFeed
    .map((m) => {
      const prev = escapeHtml(m.body || m.file_name || '…');
      return `<button type="button" class="team-chat-global-card" data-firm="${m.firm_id}" data-group="${m.group_id}">
<div class="team-chat-global-card-top"><span class="team-chat-pill">${escapeHtml(m.firm_label)}</span><span class="team-chat-pill team-chat-pill--soft">${escapeHtml(m.group_label)}</span></div>
<div class="team-chat-global-card-mid"><span class="team-chat-global-from">${escapeHtml(m.sender_name)}</span><span class="team-chat-global-time">${formatTeamChatTime(m.created_at)}</span></div>
<div class="team-chat-global-snippet">${prev}</div>
</button>`;
    })
    .join('');
  box.querySelectorAll('.team-chat-global-card').forEach((card) => {
    card.onclick = () => {
      const firmId = card.getAttribute('data-firm');
      const groupId = card.getAttribute('data-group');
      if (typeof setSuperAdminFirmSelection === 'function') setSuperAdminFirmSelection(firmId);
      _chatMode = 'firm';
      setChatMode('firm');
      _chatActiveGroupId = groupId;
      refreshTeamChatGroups().then(() => {
        selectTeamChatGroup(groupId);
        bindRealtime();
      });
    };
  });
}

async function loadTeamChatMessages(quiet) {
  if (!_chatActiveGroupId || _chatMode === 'global') return;
  const fid = _chatFirmId();
  if (!fid) return;
  const rows =
    (await sb(
      `chat_messages?group_id=eq.${_chatActiveGroupId}&order=created_at.asc&limit=200`
    ).catch(() => [])) || [];
  const senders = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
  let names = {};
  if (senders.length) {
    const su = senders.join(',');
    const users = await sb(`users?id=in.(${su})&select=id,name`).catch(() => []);
    (users || []).forEach((u) => (names[u.id] = u.name));
  }
  _chatMessages = rows.map((r) => ({ ...r, sender_name: names[r.sender_id] || '—' }));
  renderTeamChatMessages();
  if (!quiet && rows.length) {
    const last = rows[rows.length - 1];
    if (last.id !== _chatLastNotifiedId && last.sender_id !== currentUser.id) {
      _chatLastNotifiedId = last.id;
      pulseTeamChatFab();
    }
  }
  markTeamChatRead();
}

function renderTeamChatMessages() {
  const box = document.getElementById('team-chat-messages');
  if (!box) return;
  if (!_chatMessages.length) {
    box.innerHTML =
      '<div class="team-chat-empty"><i class="ph ph-chat-circle-dots"></i><p>Henüz mesaj yok<br><span class="team-chat-muted">Sohbete başlayın</span></p></div>';
    return;
  }
  let lastDay = '';
  const parts = [];
  for (const m of _chatMessages) {
    const d = new Date(m.created_at);
    const dayKey = d.toDateString();
    if (dayKey !== lastDay) {
      lastDay = dayKey;
      parts.push(
        `<div class="team-chat-daysep"><span>${d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long' })}</span></div>`
      );
    }
    const mine = m.sender_id === currentUser.id;
    const initial = (m.sender_name || '?').charAt(0).toUpperCase();
    let inner = '';
    if (m.content_type === 'text') {
      inner = `<div class="team-chat-bubble-txt">${escapeHtml(m.body || '')}</div>`;
    } else if (m.content_type === 'image' && m.file_url) {
      inner = `<img class="team-chat-img" src="${escapeAttr(m.file_url)}" alt=""/>`;
      if (m.body) inner += `<div class="team-chat-caption">${escapeHtml(m.body)}</div>`;
    } else if (m.content_type === 'audio' && m.file_url) {
      inner = `<audio controls class="team-chat-audio" src="${escapeAttr(m.file_url)}"></audio>`;
    } else if (m.content_type === 'file' && m.file_url) {
      inner = `<a href="${escapeAttr(m.file_url)}" target="_blank" rel="noopener" class="team-chat-filelink"><i class="ph ph-file"></i> ${escapeHtml(m.file_name || 'Dosya')}</a>`;
    } else {
      inner = `<div class="team-chat-bubble-txt">${escapeHtml(m.body || '(mesaj)')}</div>`;
    }
    parts.push(`<div class="team-chat-row ${mine ? 'mine' : ''}">
${mine ? '' : `<div class="team-chat-avatar" aria-hidden="true">${escapeHtml(initial)}</div>`}
<div class="team-chat-bubble-wrap">
<div class="team-chat-meta">${mine ? '' : `<span class="team-chat-name">${escapeHtml(m.sender_name)}</span>`}<span class="team-chat-time">${formatTeamChatTime(m.created_at)}</span></div>
<div class="team-chat-bubble">${inner}</div>
</div>
</div>`);
  }
  box.innerHTML = parts.join('');
  box.scrollTop = box.scrollHeight;
}

function formatTeamChatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

async function markTeamChatRead() {
  if (!_chatActiveGroupId || !currentUser || _chatMode === 'global') return;
  const iso = new Date().toISOString();
  const uid = currentUser.id;
  const gid = _chatActiveGroupId;
  const ex = await sb(`chat_user_read_state?user_id=eq.${uid}&group_id=eq.${gid}&select=user_id`).catch(() => []);
  if (ex?.length) {
    await sb(`chat_user_read_state?user_id=eq.${uid}&group_id=eq.${gid}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_read_at: iso })
    }).catch(() => {});
  } else {
    await sb('chat_user_read_state', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ user_id: uid, group_id: gid, last_read_at: iso })
    }).catch(() => {});
  }
  updateTeamChatBadge();
}

async function updateTeamChatBadge() {
  const fid = _chatFirmId();
  const fab = document.getElementById('team-chat-fab');
  const badge = document.getElementById('team-chat-badge');
  if (!currentUser) {
    if (badge) badge.style.display = 'none';
    if (fab) fab.classList.remove('team-chat-fab--unread');
    return;
  }
  let gids = [];
  if (_chatSuperSeesAll() && !fid) {
    const mems = await sb(`chat_group_members?user_id=eq.${currentUser.id}&select=group_id`).catch(() => []);
    gids = (mems || []).map((m) => m.group_id);
  } else if (!fid) {
    if (badge) badge.style.display = 'none';
    return;
  } else {
    const mems = await sb(`chat_group_members?user_id=eq.${currentUser.id}&select=group_id`).catch(() => []);
    gids = (mems || []).map((m) => m.group_id);
  }
  let total = 0;
  for (const gid of gids) {
    const rs = await sb(`chat_user_read_state?user_id=eq.${currentUser.id}&group_id=eq.${gid}&select=last_read_at`).catch(() => []);
    const lr = rs?.[0]?.last_read_at || '1970-01-01T00:00:00Z';
    const lrEnc = encodeURIComponent(lr);
    const newer = await sb(
      `chat_messages?group_id=eq.${gid}&sender_id=neq.${currentUser.id}&created_at=gt.${lrEnc}&select=id`
    ).catch(() => []);
    total += (newer || []).length;
  }
  if (badge) {
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
    badge.textContent = total > 99 ? '99+' : String(total);
  }
  if (fab) fab.classList.toggle('team-chat-fab--unread', total > 0);
  await scanChatInboundPreview(gids);
}

async function scanChatInboundPreview(gids) {
  if (!currentUser || !gids.length) return;
  const uid = currentUser.id;
  const rows = await sb(
    `chat_messages?group_id=in.(${gids.join(',')})&sender_id=neq.${uid}&select=id,body,content_type,file_name,sender_id,group_id,created_at&order=created_at.desc&limit=1`
  ).catch(() => []);
  const row = rows?.[0];
  if (!row) return;
  if (_chatLastNotifyTs && row.created_at <= _chatLastNotifyTs) return;
  _chatLastNotifyTs = row.created_at;
  if (_chatOpen && _chatMode === 'firm' && row.group_id === _chatActiveGroupId) return;
  if (Date.now() < _chatNotifySuppressedUntil) return;
  await showChatInboundPreview(row);
}

async function handleChatMessageNotification(row) {
  if (!row || !currentUser || row.sender_id === currentUser.id) return;
  const mem = await sb(
    `chat_group_members?group_id=eq.${row.group_id}&user_id=eq.${currentUser.id}&select=user_id`
  ).catch(() => []);
  if (!mem?.length) return;
  if (_chatLastNotifyTs && row.created_at <= _chatLastNotifyTs) return;
  _chatLastNotifyTs = row.created_at;
  if (_chatOpen && _chatMode === 'firm' && row.group_id === _chatActiveGroupId) return;
  if (Date.now() < _chatNotifySuppressedUntil) return;
  await showChatInboundPreview(row);
}

function playChatNotifySound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.085, ctx.currentTime + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    [698, 932].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      o.connect(g);
      g.connect(master);
      g.gain.value = i === 0 ? 0.55 : 0.5;
      o.start(ctx.currentTime + i * 0.065);
      o.stop(ctx.currentTime + i * 0.065 + 0.16);
    });
    setTimeout(() => ctx.close(), 450);
  } catch (e) {}
}

async function showChatInboundPreview(row) {
  playChatNotifySound();
  let name = '—';
  try {
    const u = await sb(`users?id=eq.${row.sender_id}&select=name`);
    name = u?.[0]?.name || '—';
  } catch (e) {}
  let snippet = row.body || row.file_name || '';
  if (row.content_type === 'audio') snippet = snippet || 'Sesli mesaj';
  if (row.content_type === 'image') snippet = snippet || 'Görsel';
  if (!snippet) snippet = 'Yeni mesaj';
  snippet = String(snippet);
  if (snippet.length > 80) snippet = snippet.slice(0, 78) + '…';
  const pop = document.getElementById('team-chat-fab-pop');
  const fromEl = document.getElementById('team-chat-fab-pop-from');
  const textEl = document.getElementById('team-chat-fab-pop-text');
  const fab = document.getElementById('team-chat-fab');
  const stack = document.getElementById('team-chat-fab-stack');
  _pendingNotifyGroupId = row.group_id;
  if (fromEl) fromEl.textContent = name;
  if (textEl) textEl.textContent = snippet;
  if (pop) {
    pop.style.display = 'block';
    requestAnimationFrame(() => pop.classList.add('team-chat-fab-pop--show'));
  }
  if (fab) fab.classList.add('team-chat-fab--notify');
  if (stack) stack.classList.add('team-chat-fab-stack--pulse');
  pulseTeamChatFab();
  if (_chatFabPreviewTimer) clearTimeout(_chatFabPreviewTimer);
  _chatFabPreviewTimer = setTimeout(() => dismissChatFabPreview(), 9000);
}

function dismissChatFabPreview() {
  const pop = document.getElementById('team-chat-fab-pop');
  const fab = document.getElementById('team-chat-fab');
  const stack = document.getElementById('team-chat-fab-stack');
  if (_chatFabPreviewTimer) clearTimeout(_chatFabPreviewTimer);
  _chatFabPreviewTimer = null;
  if (pop) {
    pop.classList.remove('team-chat-fab-pop--show');
    setTimeout(() => {
      if (!pop.classList.contains('team-chat-fab-pop--show')) pop.style.display = 'none';
    }, 450);
  }
  if (fab) fab.classList.remove('team-chat-fab--notify');
  if (stack) stack.classList.remove('team-chat-fab-stack--pulse');
}

function pulseTeamChatFab() {
  const fab = document.getElementById('team-chat-fab');
  if (!fab) return;
  fab.classList.add('team-chat-fab--ping');
  setTimeout(() => fab.classList.remove('team-chat-fab--ping'), 600);
}

async function sendTeamChatText() {
  if (_chatMode === 'global') {
    toast('Yanıt için Firma sekmesine geçin veya kart seçin', 'warn');
    return;
  }
  const inp = document.getElementById('team-chat-input');
  const fid = _chatFirmId();
  if (!inp || !fid || !_chatActiveGroupId) return;
  const t = (inp.value || '').trim();
  if (!t) return;
  inp.value = '';
  await sb('chat_messages', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      firm_id: fid,
      group_id: _chatActiveGroupId,
      sender_id: currentUser.id,
      content_type: 'text',
      body: t
    })
  }).catch(() => toast('Gönderilemedi', 'err'));
  await loadTeamChatMessages(true);
}

async function sendTeamChatFile(inputEl) {
  if (_chatMode === 'global') return;
  const f = inputEl?.files?.[0];
  inputEl.value = '';
  const fid = _chatFirmId();
  if (!f || !fid || !_chatActiveGroupId) return;
  if (f.size > 25 * 1024 * 1024) {
    toast('Dosya 25MB altında olmalı', 'warn');
    return;
  }
  const path = `${fid}/${Date.now()}_${fileSafeName(f.name)}`;
  let url = '';
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/chat-files/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': f.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: f
    });
    if (!r.ok) throw new Error(await r.text());
    url = `${SB_URL}/storage/v1/object/public/chat-files/${path}`;
  } catch (e) {
    console.warn(e);
    toast('Dosya yüklenemedi (storage)', 'err');
    return;
  }
  let ctype = 'file';
  if (f.type.startsWith('image/')) ctype = 'image';
  await sb('chat_messages', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      firm_id: fid,
      group_id: _chatActiveGroupId,
      sender_id: currentUser.id,
      content_type: ctype,
      body: null,
      file_url: url,
      file_name: f.name,
      mime_type: f.type || null
    })
  }).catch(() => toast('Mesaj kaydedilemedi', 'err'));
  await loadTeamChatMessages(true);
}

function fileSafeName(n) {
  return String(n).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function toggleTeamChatVoice() {
  if (_chatMode === 'global') return;
  if (_recording) {
    stopTeamChatVoice();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _mediaChunks = [];
    _mediaRecorder = new MediaRecorder(stream);
    _mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) _mediaChunks.push(e.data);
    };
    _mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(_mediaChunks, { type: _mediaRecorder.mimeType || 'audio/webm' });
      await uploadTeamChatVoice(blob);
      _mediaRecorder = null;
      _recording = false;
      const micBtn = document.getElementById('team-chat-mic');
      if (micBtn) micBtn.classList.remove('recording');
    };
    _mediaRecorder.start();
    _recording = true;
    const micBtn = document.getElementById('team-chat-mic');
    if (micBtn) micBtn.classList.add('recording');
    toast('Kayıt… Tekrar tıklayınca gönderilir', 'ok');
  } catch (e) {
    toast('Mikrofon izni gerekli', 'warn');
  }
}

function stopTeamChatVoice() {
  if (_mediaRecorder && _recording) {
    try {
      _mediaRecorder.stop();
    } catch (e) {}
  }
}

async function uploadTeamChatVoice(blob) {
  const fid = _chatFirmId();
  if (!fid || !_chatActiveGroupId) return;
  const path = `${fid}/${Date.now()}_voice.webm`;
  let url = '';
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/chat-files/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': blob.type || 'audio/webm',
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!r.ok) throw new Error(await r.text());
    url = `${SB_URL}/storage/v1/object/public/chat-files/${path}`;
  } catch (e) {
    toast('Ses yüklenemedi', 'err');
    return;
  }
  await sb('chat_messages', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      firm_id: fid,
      group_id: _chatActiveGroupId,
      sender_id: currentUser.id,
      content_type: 'audio',
      file_url: url,
      file_name: 'ses.webm',
      mime_type: blob.type || 'audio/webm'
    })
  }).catch(() => {});
  await loadTeamChatMessages(true);
}

function openNewGroupModal() {
  const fid = _chatFirmId();
  if (!fid) {
    toast('Firma seçin', 'warn');
    return;
  }
  if (!_canManageChatGroups()) return;
  const modal = document.getElementById('team-chat-group-modal');
  const nameInp = document.getElementById('team-chat-group-name');
  const memSel = document.getElementById('team-chat-group-members');
  if (nameInp) nameInp.value = '';
  if (modal) modal.style.display = 'flex';
  fetchUsersForChatPicker(fid)
    .then((users) => {
      _firmUsersCache = users || [];
      if (memSel) {
        memSel.innerHTML = (_firmUsersCache || [])
          .filter((u) => u.id !== currentUser.id)
          .map(
            (u) =>
              `<label class="team-chat-cb"><input type="checkbox" value="${u.id}"/> ${escapeHtml(formatChatUserLabel(u))}</label>`
          )
          .join('');
      }
    })
    .catch(() => {});
}

async function openQuickDmModal() {
  const fid = _chatFirmId();
  if (!fid) {
    toast('Firma seçin', 'warn');
    return;
  }
  const st = await getFirmChatSettings(fid);
  const peerOk = st.allow_peer_dm && ['agent', 'qc'].includes(currentUser?.role || '');
  if (!_canManageChatGroups() && !peerOk) {
    toast('Hızlı mesaj yetkiniz yok', 'warn');
    return;
  }
  const modal = document.getElementById('team-chat-quick-modal');
  const sel = document.getElementById('team-chat-quick-user');
  if (modal) modal.style.display = 'flex';
  if (sel) sel.innerHTML = '<option value="">Kişi seçin…</option>';
  fetchUsersForChatPicker(fid).then((users) => {
    _firmUsersCache = users || [];
    if (!sel) return;
    for (const u of _firmUsersCache) {
      if (u.id === currentUser.id) continue;
      const o = document.createElement('option');
      o.value = u.id;
      o.textContent = formatChatUserLabel(u);
      sel.appendChild(o);
    }
  });
}

function closeQuickDmModal() {
  const modal = document.getElementById('team-chat-quick-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmQuickDm() {
  const sel = document.getElementById('team-chat-quick-user');
  const uid = sel?.value;
  if (!uid) {
    toast('Kişi seçin', 'warn');
    return;
  }
  await ensureOrOpenDirectChat(uid);
}

async function ensureOrOpenDirectChat(targetUserId) {
  const fid = _chatFirmId();
  if (!fid) {
    toast('Firma seçin', 'warn');
    return;
  }
  if (targetUserId === currentUser.id) return;
  const settings = await getFirmChatSettings(fid);
  const peers = ['agent', 'qc'];
  if (!settings.allow_peer_dm && peers.includes(currentUser?.role || '')) {
    const tu =
      (await sb(`users?id=eq.${targetUserId}&select=id,role,firm_id`).catch(() => [])) || [];
    const tr = tu[0]?.role || '';
    if (peers.includes(tr)) {
      toast('Bu firma ayarlarında personeller arası mesaj kapalı', 'warn');
      return;
    }
  }
  const pair = [currentUser.id, targetUserId].sort();
  const slug = 'dm_' + pair[0] + '_' + pair[1];
  const existing = await sb(`chat_groups?firm_id=eq.${fid}&slug=eq.${slug}&select=id,name`).catch(() => []);
  let gid = existing?.[0]?.id;
  if (!gid) {
    const users = await sb(`users?id=eq.${targetUserId}&select=name`).catch(() => []);
    const otherName = users?.[0]?.name || 'Sohbet';
    const row = await sb('chat_groups', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        firm_id: fid,
        name: otherName,
        slug,
        created_by: currentUser.id
      })
    }).catch(() => null);
    gid = row?.[0]?.id;
    if (!gid) {
      toast('Sohbet açılamadı', 'err');
      return;
    }
    for (const uid of pair) {
      await sb('chat_group_members', {
        method: 'POST',
        body: JSON.stringify({ group_id: gid, user_id: uid })
      }).catch(() => {});
    }
  }
  closeQuickDmModal();
  _chatMode = 'firm';
  document.querySelectorAll('.team-chat-mode-pill').forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-mode') === 'firm');
  });
  const firmLayout = document.getElementById('team-chat-firm-layout');
  const globalEl = document.getElementById('team-chat-global-feed');
  const compose = document.getElementById('team-chat-compose-wrap');
  if (firmLayout) firmLayout.style.display = 'flex';
  if (globalEl) globalEl.style.display = 'none';
  if (compose) compose.style.display = '';
  _chatActiveGroupId = gid;
  await refreshTeamChatGroups();
  selectTeamChatGroup(gid);
  bindRealtime();
  if (!_chatOpen) toggleTeamChat(true);
  else await loadTeamChatMessages();
}

function closeNewGroupModal() {
  const modal = document.getElementById('team-chat-group-modal');
  if (modal) modal.style.display = 'none';
}

let _membersModalGroupId = null;

async function openGroupMembersModal(groupId) {
  const fid = _chatFirmId();
  if (!fid || !_canManageChatGroups()) return;
  const g = _chatGroups.find((x) => x.id === groupId);
  const isWide = g?.slug === 'firm_wide';
  _membersModalGroupId = groupId;
  const modal = document.getElementById('team-chat-members-modal');
  const title = document.getElementById('team-chat-members-title');
  const list = document.getElementById('team-chat-members-list');
  const addWrap = document.getElementById('team-chat-members-add');
  if (title) title.textContent = isWide ? 'Tüm ekip üyeleri (otomatik)' : 'Grup üyeleri';
  if (modal) modal.style.display = 'flex';
  const mems = await sb(`chat_group_members?group_id=eq.${groupId}&select=user_id`).catch(() => []);
  const uids = (mems || []).map((m) => m.user_id);
  let users = [];
  if (uids.length) {
    users = (await sb(`users?id=in.(${uids.join(',')})&select=id,name,role`).catch(() => [])) || [];
  }
  if (list) {
    list.innerHTML = users
      .map((u) => {
        const rm =
          !isWide && u.id !== currentUser.id
            ? `<button type="button" class="team-chat-member-rm" data-uid="${u.id}">Çıkar</button>`
            : '';
        return `<div class="team-chat-member-row"><span>${escapeHtml(u.name)}</span><span class="team-chat-muted">${u.role}</span>${rm}</div>`;
      })
      .join('');
    list.querySelectorAll('.team-chat-member-rm').forEach((b) => {
      b.onclick = () => removeUserFromGroup(groupId, b.getAttribute('data-uid'));
    });
  }
  if (addWrap) {
    if (isWide) {
      addWrap.innerHTML = '<p class="team-chat-muted" style="margin:0;font-size:12px;">Bu grupta üyelik firma kullanıcılarıyla senkrondur.</p>';
    } else {
      const firmUsers = (await fetchUsersForChatPicker(fid)) || [];
      const avail = firmUsers.filter((u) => !uids.includes(u.id));
      addWrap.innerHTML =
        `<label class="form-label" style="font-size:11px;">Üye ekle</label><select id="team-chat-add-user" class="form-input" style="width:100%;margin-top:4px;">
<option value="">Seçin…</option>${avail.map((u) => `<option value="${u.id}">${escapeHtml(formatChatUserLabel(u))}</option>`).join('')}
</select><button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;" id="team-chat-add-user-btn">Ekle</button>`;
      const btn = document.getElementById('team-chat-add-user-btn');
      if (btn)
        btn.onclick = async () => {
          const sel = document.getElementById('team-chat-add-user');
          const uid = sel?.value;
          if (!uid) return;
          await sb('chat_group_members', {
            method: 'POST',
            body: JSON.stringify({ group_id: groupId, user_id: uid })
          }).catch(() => toast('Eklenemedi', 'err'));
          toast('Üye eklendi', 'ok');
          openGroupMembersModal(groupId);
          refreshTeamChatGroups();
        };
    }
  }
}

async function removeUserFromGroup(groupId, userId) {
  await sb(`chat_group_members?group_id=eq.${groupId}&user_id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
  toast('Çıkarıldı', 'ok');
  openGroupMembersModal(groupId);
  refreshTeamChatGroups();
}

function closeMembersModal() {
  const modal = document.getElementById('team-chat-members-modal');
  if (modal) modal.style.display = 'none';
  _membersModalGroupId = null;
}

async function saveNewGroup() {
  const fid = _chatFirmId();
  const nameInp = document.getElementById('team-chat-group-name');
  const memSel = document.getElementById('team-chat-group-members');
  if (!fid || !nameInp) return;
  const name = (nameInp.value || '').trim();
  if (!name) {
    toast('Grup adı girin', 'warn');
    return;
  }
  const slug = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const row = await sb('chat_groups', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify({
      firm_id: fid,
      name,
      slug,
      created_by: currentUser.id
    })
  }).catch(() => null);
  const gid = row?.[0]?.id;
  if (!gid) {
    toast('Grup oluşturulamadı', 'err');
    return;
  }
  const ids = [currentUser.id];
  if (memSel) {
    memSel.querySelectorAll('input[type="checkbox"]:checked').forEach((c) => ids.push(c.value));
  }
  for (const uid of ids) {
    await sb('chat_group_members', {
      method: 'POST',
      body: JSON.stringify({ group_id: gid, user_id: uid })
    }).catch(() => {});
  }
  closeNewGroupModal();
  toast('Grup oluşturuldu', 'ok');
  _chatActiveGroupId = gid;
  await refreshTeamChatGroups();
  selectTeamChatGroup(gid);
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

window.invalidateFirmChatSettingsCache = invalidateFirmChatSettingsCache;
