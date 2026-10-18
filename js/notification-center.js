// ─────────────────────────────────────────────
// Unified notification center (chat + field + qc)
// ─────────────────────────────────────────────

let _notifTimer = null;
/** Maskot bildirim ipucu: ilk yüklemede tetikleme yok */
let _notifLastUnreadForMascot = null;
function _isValidFirmId(fid) {
  const v = String(fid || '').trim();
  if (!v || v === 'all') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function notifPickFirm() {
  const sel = document.getElementById('notif-firm-sel');
  const mine = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  const superUser = typeof isSuperAdmin === 'function' && isSuperAdmin();
  if (!sel || !superUser) {
    if (sel) sel.hidden = true;
    return mine;
  }
  sel.hidden = false;
  if (sel.dataset.ready !== '1') {
    let firms = (typeof _allFirms !== 'undefined' && Array.isArray(_allFirms) && _allFirms.length) ? _allFirms : [];
    if (!firms.length && typeof sb === 'function') {
      firms = await sb('firms?select=id,name&order=name.asc').catch(() => []) || [];
    }
    const preferred = _isValidFirmId(mine) ? mine : 'all';
    sel.replaceChildren();
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = typeof t === 'function' ? t('notif.allfirms') : 'Tümü';
    sel.appendChild(allOpt);
    firms.forEach((f) => {
      if (!_isValidFirmId(f?.id)) return;
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name || f.id;
      sel.appendChild(opt);
    });
    sel.value = [...sel.options].some((o) => o.value === preferred) ? preferred : 'all';
    sel.dataset.ready = '1';
  }
  return sel.value || 'all';
}

function toggleNotificationCenter(forceOpen) {
  const el = document.getElementById('notification-center');
  if (!el) return;
  const open = forceOpen === undefined ? el.style.display === 'none' || !el.style.display : !!forceOpen;
  el.style.display = open ? 'block' : 'none';
  if (open && typeof opsMarkNoticesSeen === 'function') opsMarkNoticesSeen();
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
  const picked = await notifPickFirm();
  const fid = picked === 'all' ? 'all' : picked;
  if (fid !== 'all' && !_isValidFirmId(fid)) {
    list.innerHTML = _notifItem(typeof t === 'function' ? t('notif.empty') : 'Bildirim yok', typeof t === 'function' ? t('ops.panel.needfirm') : 'Önce firma seçin', '');
    if (badge) badge.style.display = 'none';
    return;
  }
  const ff = fid === 'all' ? '' : `firm_id=eq.${fid}&`;

  const out = (typeof opsNoticeRows === 'function' ? opsNoticeRows() : []).map((row) => opsNoticeHtml(row));
  let unread = typeof opsUnseenNoticeCount === 'function' ? opsUnseenNoticeCount() : 0;

  try {
    const chat = await sb(`chat_messages?${ff}order=created_at.desc&limit=5`).catch(() => []);
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
    const field = await sb(`field_tasks?${ff}status=eq.assigned&order=created_at.desc&limit=5`).catch(() => []);
    (field || []).forEach((t) => {
      const mine = t.assigned_to === currentUser.id;
      const fresh = Date.now() - new Date(t.created_at).getTime() < 48 * 3600 * 1000;
      if (mine || (fresh && mbIsFirmAdmin())) unread++;
      out.push(_notifItem('Saha görevi', `Yeni görev atandı · ${t.result_key || 'sonuç bekleniyor'}`, new Date(t.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
    });
  } catch (e) {}

  try {
    const qcRows = await sb(`appointments?${ff}durum=eq.qc_bekleniyor&select=id,nachname,son_guncelleme&order=son_guncelleme.desc&limit=5`).catch(() => []);
    (qcRows || []).forEach((a) => {
      if (['qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser.role)) unread++;
      out.push(_notifItem('QC bekleyen', `${a.nachname || 'Müşteri'} için değerlendirme bekleniyor`, new Date(a.son_guncelleme || Date.now()).toLocaleDateString('tr-TR')));
    });
  } catch (e) {}

  try {
    const events = await sb(`job_events?select=id,event_type,created_at,job_posts!inner(id,title,requester_firm_id)&order=created_at.desc&limit=12`).catch(() => []);
    (events || []).forEach((ev) => {
      const title = ev?.job_posts?.title || 'İş ilanı';
      const own = ev?.job_posts?.requester_firm_id === fid;
      const isWithdraw = ev.event_type === 'job_withdrawn';
      const eventLabel = {
        job_created: 'İlan yayınlandı',
        job_withdrawn: 'İlan geri çekildi',
        job_joined: 'İlana katılım',
        submission_created: 'Teslim geldi',
      }[ev.event_type] || 'İş güncellemesi';
      const headline = isWithdraw ? 'İlan geri çekildi' : 'İş platformu';
      const detail = isWithdraw ? `${title} · rezerv iade edildi, ilan iptal` : `${title} · ${eventLabel}`;
      if (own || ['admin', 'firm_admin', 'super_admin', 'qc'].includes(currentUser.role)) unread++;
      out.push(_notifItem(headline, detail, new Date(ev.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })));
    });
  } catch (e) {}

  try {
    const prefs = typeof opsNotifyPrefs === 'function' ? opsNotifyPrefs() : null;
    if (prefs?.appt !== false && currentUser?.id) {
      const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
      const appts = await sb(`appointments?${ff}agent_id=eq.${currentUser.id}&termin_tarih=gte.${today}&select=id,nachname,telefonnummer,termin_tarih&order=termin_tarih.asc&limit=5`).catch(() => []);
      (appts || []).forEach((a) => {
        unread++;
        const title = typeof t === 'function' ? t('ops.notice.appt') : 'Randevun';
        out.push(_notifItem(title, `${a.nachname || '—'} · ${a.termin_tarih || ''} · ${a.telefonnummer || ''}`, ''));
      });
    }
    if (prefs?.campaign !== false && typeof opsRoleSeesWarn === 'function' && opsRoleSeesWarn()) {
      const ids = (typeof _opsDirective !== 'undefined' && Array.isArray(_opsDirective.ids)) ? _opsDirective.ids : [];
      if (ids.length) {
        const names = ids.map((id) => (typeof opsCampName === 'function' ? opsCampName(id) : id)).join(', ');
        const title = typeof t === 'function' ? t('ops.notice.camps') : 'Çalışılacak kampanyalar';
        unread++;
        out.push(_notifItem(title, names, ''));
      }
    }
  } catch (e) {}

  list.innerHTML = out.length ? [...new Set(out)].join('') : _notifItem('Bildirim yok', 'Yeni bildirim bulunmuyor', '');
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
  if (_notifLastUnreadForMascot !== null && unread > _notifLastUnreadForMascot) {
    if (typeof window.hintCustEmptyNotifUnread === 'function') window.hintCustEmptyNotifUnread(unread);
  }
  _notifLastUnreadForMascot = unread;
}

function initNotificationCenter() {
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(() => {
    if (!currentUser) return;
    loadNotificationCenter();
  }, 20000);
  loadNotificationCenter();
}
