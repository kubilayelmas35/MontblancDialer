// ─────────────────────────────────────────────
// Ekip sohbeti — gruplar, metin, ses, dosya, görsel
// ─────────────────────────────────────────────

let _chatOpen = false;
let _chatGroups = [];
let _chatActiveGroupId = null;
let _chatMessages = [];
let _chatPollTimer = null;
let _chatLastNotifiedId = null;
let _mediaRecorder = null;
let _mediaChunks = [];
let _recording = false;
let _firmUsersCache = [];
let _chatLastFirmId = null;

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

async function initChat() {
  const root = document.getElementById('team-chat-root');
  const fab = document.getElementById('team-chat-fab');
  if (!root || !fab || !currentUser) return;
  fab.onclick = () => toggleTeamChat();
  const closeBtn = document.getElementById('team-chat-close');
  if (closeBtn) closeBtn.onclick = () => toggleTeamChat(false);
  const sendBtn = document.getElementById('team-chat-send');
  if (sendBtn) sendBtn.onclick = () => sendTeamChatText();
  const inp = document.getElementById('team-chat-input');
  if (inp) {
    inp.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeamChatText(); }
    };
  }
  const fInp = document.getElementById('team-chat-file');
  if (fInp) fInp.onchange = () => sendTeamChatFile(fInp);
  const micBtn = document.getElementById('team-chat-mic');
  if (micBtn) micBtn.onclick = () => toggleTeamChatVoice();
  const newGrp = document.getElementById('team-chat-new-group');
  if (newGrp) newGrp.onclick = () => openNewGroupModal();
  const saveGrp = document.getElementById('team-chat-save-group');
  if (saveGrp) saveGrp.onclick = () => saveNewGroup();
  try {
    await refreshTeamChatGroups();
    await updateTeamChatBadge();
  } catch (e) { console.warn('chat init', e); }
  if (_chatPollTimer) clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(() => {
    if (!currentUser) return;
    if (_chatOpen && _chatActiveGroupId) loadTeamChatMessages(true);
    else updateTeamChatBadge();
  }, 4000);
}

function toggleTeamChat(open) {
  const panel = document.getElementById('team-chat-panel');
  if (!panel) return;
  if (open === undefined) _chatOpen = !_chatOpen;
  else _chatOpen = !!open;
  panel.style.display = _chatOpen ? 'flex' : 'none';
  if (_chatOpen) {
    const fid = _chatFirmId();
    if (!fid && _chatSuperSeesAll()) {
      toast('Süper admin: önce üstte firma seçin', 'warn');
    }
    refreshTeamChatGroups().then(() => {
      if (_chatActiveGroupId) loadTeamChatMessages();
      markTeamChatRead();
    });
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
  const mems = await sb(`chat_group_members?group_id=eq.${groupId}&select=user_id`).catch(() => []);
  const have = new Set((mems || []).map((m) => m.user_id));
  for (const u of users || []) {
    if (!have.has(u.id)) {
      await sb('chat_group_members', {
        method: 'POST',
        body: JSON.stringify({ group_id: groupId, user_id: u.id })
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
      .map(
        (g) =>
          `<button type="button" class="team-chat-group-item${g.id === _chatActiveGroupId ? ' active' : ''}" data-gid="${g.id}">${escapeHtml(g.name)}</button>`
      )
      .join('');
    listEl.querySelectorAll('.team-chat-group-item').forEach((btn) => {
      btn.onclick = () => selectTeamChatGroup(btn.getAttribute('data-gid'));
    });
  }
  const newBtn = document.getElementById('team-chat-new-group');
  if (newBtn) newBtn.style.display = _canManageChatGroups() ? '' : 'none';
  if (!_chatActiveGroupId && _chatGroups.length) selectTeamChatGroup(_chatGroups[0].id);
}

function selectTeamChatGroup(gid) {
  _chatActiveGroupId = gid;
  document.querySelectorAll('.team-chat-group-item').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-gid') === gid);
  });
  loadTeamChatMessages();
  markTeamChatRead();
}

async function loadTeamChatMessages(quiet) {
  if (!_chatActiveGroupId) return;
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
    box.innerHTML = '<div class="team-chat-muted" style="padding:16px;">Henüz mesaj yok</div>';
    return;
  }
  box.innerHTML = _chatMessages
    .map((m) => {
      const mine = m.sender_id === currentUser.id;
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
      return `<div class="team-chat-row ${mine ? 'mine' : ''}">
<div class="team-chat-meta">${escapeHtml(m.sender_name)} · ${formatTeamChatTime(m.created_at)}</div>
<div class="team-chat-bubble">${inner}</div>
</div>`;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
}

function formatTeamChatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  } catch (e) {
    return '';
  }
}

async function markTeamChatRead() {
  if (!_chatActiveGroupId || !currentUser) return;
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
  if (!fid || !currentUser) {
    if (badge) badge.style.display = 'none';
    if (fab) fab.classList.remove('team-chat-fab--unread');
    return;
  }
  const mems = await sb(`chat_group_members?user_id=eq.${currentUser.id}&select=group_id`).catch(() => []);
  const gids = (mems || []).map((m) => m.group_id);
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
}

function pulseTeamChatFab() {
  const fab = document.getElementById('team-chat-fab');
  if (!fab) return;
  fab.classList.add('team-chat-fab--ping');
  setTimeout(() => fab.classList.remove('team-chat-fab--ping'), 600);
}

async function sendTeamChatText() {
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
  sb(`users?firm_id=eq.${fid}&select=id,name,role&is_active=eq.true&order=name.asc`)
    .then((users) => {
      _firmUsersCache = users || [];
      if (memSel) {
        memSel.innerHTML = (_firmUsersCache || [])
          .filter((u) => u.id !== currentUser.id)
          .map(
            (u) =>
              `<label class="team-chat-cb"><input type="checkbox" value="${u.id}"/> ${escapeHtml(u.name)} <span class="team-chat-muted">${u.role}</span></label>`
          )
          .join('');
      }
    })
    .catch(() => {});
}

function closeNewGroupModal() {
  const modal = document.getElementById('team-chat-group-modal');
  if (modal) modal.style.display = 'none';
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
