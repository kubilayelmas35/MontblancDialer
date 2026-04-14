// ─────────────────────────────────────────────
// Unified notification center (chat + field + qc)
// ─────────────────────────────────────────────

let _notifTimer = null;

function toggleNotificationCenter(forceOpen) {
  const el = document.getElementById('notification-center');
  if (!el) return;
  const open = forceOpen === undefined ? el.style.display === 'none' || !el.style.display : !!forceOpen;
  el.style.display = open ? 'block' : 'none';
  if (open) loadNotificationCenter();
}

function _notifItem(title, body, meta) {
  return `<div style="padding:8px 10px;background:var(--bg-3);border-radius:8px;">
<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
<div style="font-size:12px;font-weight:700;">${title}</div>
<div style="font-size:10px;color:var(--text-3);">${meta || ''}</div>
</div>
<div style="font-size:11px;color:var(--text-2);margin-top:3px;">${body || ''}</div>
</div>`;
}

async function loadNotificationCenter() {
  const list = document.getElementById('notification-center-list');
  const badge = document.getElementById('tb-notif-badge');
  if (!list || !currentUser) return;
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
  if (!fid) {
    list.innerHTML = _notifItem('Bildirim yok', 'Önce firma seçin', '');
    if (badge) badge.style.display = 'none';
    return;
  }

  const out = [];
  let unread = 0;

  try {
    const chat = await sb(`chat_messages?firm_id=eq.${fid}&order=created_at.desc&limit=5`).catch(() => []);
    const senderIds = [...new Set((chat || []).map((x) => x.sender_id).filter(Boolean))];
    let names = {};
    if (senderIds.length) {
      const users = await sb(`users?id=in.(${senderIds.join(',')})&select=id,name`).catch(() => []);
      (users || []).forEach((u) => { names[u.id] = u.name; });
    }
    (chat || []).forEach((c) => {
      if (c.sender_id !== currentUser.id) unread++;
      out.push(_notifItem('Chat mesajı', `${names[c.sender_id] || 'Kullanıcı'}: ${c.body || c.file_name || 'Mesaj'}`, new Date(c.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
    });
  } catch (e) {}

  try {
    const field = await sb(`field_tasks?firm_id=eq.${fid}&status=eq.assigned&order=created_at.desc&limit=5`).catch(() => []);
    (field || []).forEach((t) => {
      if (t.assigned_to === currentUser.id || ['admin', 'firm_admin', 'super_admin'].includes(currentUser.role)) unread++;
      out.push(_notifItem('Saha görevi', `Yeni görev atandı · ${t.result_key || 'sonuç bekleniyor'}`, new Date(t.created_at).toLocaleDateString('tr-TR')));
    });
  } catch (e) {}

  try {
    const qcRows = await sb(`appointments?firm_id=eq.${fid}&durum=eq.qc_bekleniyor&select=id,nachname,updated_at&order=updated_at.desc&limit=5`).catch(() => []);
    (qcRows || []).forEach((a) => {
      if (['qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser.role)) unread++;
      out.push(_notifItem('QC bekleyen', `${a.nachname || 'Müşteri'} için değerlendirme bekleniyor`, new Date(a.updated_at || Date.now()).toLocaleDateString('tr-TR')));
    });
  } catch (e) {}

  try {
    const events = await sb(`job_events?select=id,event_type,created_at,job_posts!inner(id,title,requester_firm_id)&order=created_at.desc&limit=12`).catch(() => []);
    (events || []).forEach((ev) => {
      const title = ev?.job_posts?.title || 'İş ilanı';
      const own = ev?.job_posts?.requester_firm_id === fid;
      const isWithdraw = ev.event_type === 'job_withdrawn';
      const headline = isWithdraw ? 'İlan geri çekildi' : 'İş platformu';
      const detail = isWithdraw ? `${title} · rezerv iade edildi, ilan iptal` : `${title} · ${ev.event_type}`;
      if (own || ['admin', 'firm_admin', 'super_admin', 'qc'].includes(currentUser.role)) unread++;
      out.push(_notifItem(headline, detail, new Date(ev.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
    });
  } catch (e) {}

  list.innerHTML = out.length ? out.join('') : _notifItem('Bildirim yok', 'Yeni bildirim bulunmuyor', '');
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
}

function initNotificationCenter() {
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(() => {
    if (!currentUser) return;
    loadNotificationCenter();
  }, 20000);
  loadNotificationCenter();
}
