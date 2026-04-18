// ─────────────────────────────────────────────
// Sohbet ayarları — firms.settings.chat
// ─────────────────────────────────────────────

let _chatSettingsFirmId = null;

function _chatSetEsc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function defaultChatSettingsForm() {
  return {
    allow_peer_dm: true,
    firm_admin_can_dm_super: true,
    hidden_from_picker_ids: []
  };
}

async function loadChatSettingsPage() {
  const card = document.getElementById('chat-settings-card');
  if (!card) return;

  const role = currentUser?.role || '';
  const isSuper = role === 'super_admin';
  const isFirmLevel = ['admin', 'firm_admin'].includes(role);
  const canView = isSuper || isFirmLevel;

  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const firmRow = document.getElementById('chat-settings-firm-row');
  const firmSel = document.getElementById('chat-settings-firm-select');

  if (isSuper) {
    if (firmRow) firmRow.style.display = '';
    if (firmSel && !firmSel.options.length) {
      try {
        const firms = await sb('firms?is_active=eq.true&select=id,name&order=name');
        firmSel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${_chatSetEsc(f.name)}</option>`).join('');
      } catch (e) {}
    }
    if (firmSel?.value) _chatSettingsFirmId = firmSel.value;
    else if (firmSel?.options.length) _chatSettingsFirmId = firmSel.options[0].value;
    else _chatSettingsFirmId = null;
  } else {
    if (firmRow) firmRow.style.display = 'none';
    _chatSettingsFirmId = currentUser?.firm_id || null;
  }

  await renderChatSettingsForm();
}

async function onChatSettingsFirmChange() {
  const firmSel = document.getElementById('chat-settings-firm-select');
  _chatSettingsFirmId = firmSel?.value || null;
  await renderChatSettingsForm();
}

async function renderChatSettingsForm() {
  const listEl = document.getElementById('chat-settings-user-list');
  const peerChk = document.getElementById('chat-set-peer-dm');
  const superChk = document.getElementById('chat-set-firmadmin-super');
  const fid = _chatSettingsFirmId;

  if (!fid) {
    if (listEl) listEl.innerHTML = '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:12px;">Firma seçin veya firma atanmış hesap kullanın</div>';
    return;
  }

  let settings = defaultChatSettingsForm();
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const raw = firms?.[0]?.settings?.chat || {};
    settings = { ...defaultChatSettingsForm(), ...raw };
    if (!Array.isArray(settings.hidden_from_picker_ids)) settings.hidden_from_picker_ids = [];
  } catch (e) {}

  if (peerChk) peerChk.checked = !!settings.allow_peer_dm;
  if (superChk) superChk.checked = settings.firm_admin_can_dm_super !== false;

  let users = [];
  try {
    users =
      (await sb(`users?firm_id=eq.${fid}&is_active=eq.true&select=id,name,role&order=name.asc`).catch(() => [])) || [];
  } catch (e) {}

  const hidden = new Set(settings.hidden_from_picker_ids || []);

  if (!listEl) return;
  if (!users.length) {
    listEl.innerHTML = '<div style="color:var(--text-3);font-size:12px;text-align:center;padding:12px;">Bu firmada aktif kullanıcı yok</div>';
    return;
  }

  listEl.innerHTML = users
    .map((u) => {
      const isHidden = hidden.has(u.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg-2);border-radius:6px;cursor:pointer;font-size:12px;">
<input type="checkbox" class="chat-set-user-vis" data-uid="${u.id}" ${isHidden ? '' : 'checked'} style="width:15px;height:15px;cursor:pointer;flex-shrink:0;">
<span style="flex:1;min-width:0;"><strong>${_chatSetEsc(u.name)}</strong> <span style="color:var(--text-3);font-size:11px;">${_chatSetEsc(u.role)}</span></span>
<span style="font-size:10px;color:var(--text-3);white-space:nowrap;">${isHidden ? 'gizli' : 'listede'}</span>
</label>`;
    })
    .join('');
}

async function saveChatSettings() {
  const fid = _chatSettingsFirmId;
  if (!fid) {
    toast('Firma yok', 'warn');
    return;
  }
  const role = currentUser?.role || '';
  if (!['super_admin', 'admin', 'firm_admin'].includes(role)) return;

  const peerChk = document.getElementById('chat-set-peer-dm');
  const superChk = document.getElementById('chat-set-firmadmin-super');
  const listEl = document.getElementById('chat-settings-user-list');

  const hidden = [];
  if (listEl) {
    listEl.querySelectorAll('.chat-set-user-vis').forEach((inp) => {
      if (!inp.checked) hidden.push(inp.getAttribute('data-uid'));
    });
  }

  const chat = {
    allow_peer_dm: !!peerChk?.checked,
    firm_admin_can_dm_super: !!superChk?.checked,
    hidden_from_picker_ids: hidden
  };

  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, chat } })
    });
    if (typeof invalidateFirmChatSettingsCache === 'function') invalidateFirmChatSettingsCache(fid);
    toast('Sohbet ayarları kaydedildi', 'ok');
    if (typeof refreshTeamChatGroups === 'function') await refreshTeamChatGroups();
  } catch (e) {
    toast('Kaydedilemedi', 'err');
  }
}
