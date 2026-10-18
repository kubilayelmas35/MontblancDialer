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

const NOTIF_CATS = [
  ['live', 'notif.cat.live', 'Canlı'],
  ['appt', 'notif.cat.appt', 'Randevu'],
  ['camp', 'notif.cat.camp', 'Kampanya'],
  ['qc', 'notif.cat.qc', 'QC'],
  ['field', 'notif.cat.field', 'Saha'],
  ['chat', 'notif.cat.chat', 'Sohbet'],
  ['job', 'notif.cat.job', 'İş'],
];
let _notifFilter = 'all';
let _notifItems = [];
let _notifGen = 0;

function notifSay(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function notifHideKey() {
  return `mb_notif_hide_${currentUser?.id || '0'}`;
}

function notifHidden() {
  try {
    const rows = JSON.parse(localStorage.getItem(notifHideKey()) || '[]');
    return new Set(Array.isArray(rows) ? rows : []);
  } catch (e) {
    return new Set();
  }
}

function notifRememberHide(ids) {
  const set = notifHidden();
  ids.forEach((id) => { if (id) set.add(id); });
  try { localStorage.setItem(notifHideKey(), JSON.stringify([...set].slice(-300))); } catch (e) {}
}

function notifStoreId(row) {
  if (row?.id) return String(row.id);
  return `live:${row?.at || ''}:${row?.title || ''}:${String(row?.text || '').slice(0, 80)}`;
}

function notifSeenAt() {
  let seen = '';
  try { seen = localStorage.getItem(`mb_ops_notice_seen_${currentUser?.id || ''}`) || ''; } catch (e) {}
  return seen ? new Date(seen).getTime() : 0;
}

function notifPush(bucket, hidden, item) {
  if (!item?.id || hidden.has(item.id) || bucket.some((row) => row.id === item.id)) return;
  bucket.push(item);
}

function notifEmptyCard(title, body) {
  const card = document.createElement('div');
  card.className = 'notif-card';
  const head = document.createElement('div');
  head.className = 'notif-card-title';
  head.textContent = title || notifSay('notif.empty', 'Bildirim yok');
  const text = document.createElement('div');
  text.className = 'notif-card-body';
  text.textContent = body || notifSay('notif.none', 'Yeni bildirim bulunmuyor');
  card.append(head, text);
  return card;
}

function notifCard(item) {
  const card = document.createElement('div');
  card.className = 'notif-card';
  if (item.color && typeof opsHex === 'function') {
    const color = opsHex(item.color, '');
    if (color) {
      card.style.borderLeft = `4px solid ${color}`;
      card.style.background = typeof opsTint === 'function' ? opsTint(color) : '';
      card.style.color = '#1f2937';
    }
  }
  const top = document.createElement('div');
  top.className = 'notif-card-top';
  const title = document.createElement('div');
  title.className = 'notif-card-title';
  title.textContent = item.title;
  const meta = document.createElement('div');
  meta.className = 'notif-card-meta';
  meta.textContent = item.meta || '';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'notif-del';
  del.dataset.notifDel = item.id;
  del.dataset.notifSrc = item.src;
  del.setAttribute('aria-label', notifSay('notif.del', 'Sil'));
  del.textContent = '×';
  top.append(title, meta, del);
  const body = document.createElement('div');
  body.className = 'notif-card-body';
  body.textContent = item.body || '';
  card.append(top, body);
  return card;
}

function notifPaint() {
  const list = document.getElementById('notification-center-list');
  const cats = document.getElementById('notif-cats');
  const badge = document.getElementById('tb-notif-badge');
  if (!list) return;
  const items = _notifItems;
  const groups = NOTIF_CATS.map(([id, key, fb]) => ({
    id,
    label: notifSay(key, fb),
    items: items.filter((item) => item.cat === id),
  })).filter((group) => group.items.length);
  if (!groups.some((group) => group.id === _notifFilter)) _notifFilter = 'all';
  if (cats) {
    cats.replaceChildren();
    if (items.length) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = `notif-chip${_notifFilter === 'all' ? ' is-on' : ''}`;
      all.dataset.notifCat = 'all';
      all.textContent = `${notifSay('notif.cat.all', 'Tümü')} ${items.length}`;
      cats.appendChild(all);
      groups.forEach((group) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `notif-chip${_notifFilter === group.id ? ' is-on' : ''}`;
        chip.dataset.notifCat = group.id;
        chip.textContent = `${group.label} ${group.items.length}`;
        cats.appendChild(chip);
      });
    }
  }
  list.replaceChildren();
  const shown = _notifFilter === 'all' ? groups : groups.filter((group) => group.id === _notifFilter);
  if (!shown.length) {
    list.appendChild(notifEmptyCard());
  } else {
    shown.forEach((group) => {
      const sec = document.createElement('section');
      sec.className = 'notif-sec';
      const head = document.createElement('div');
      head.className = 'notif-sec-h';
      const name = document.createElement('span');
      name.textContent = group.label;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'notif-clear';
      clear.dataset.notifClear = group.id;
      clear.textContent = notifSay('notif.clear', 'Temizle');
      head.append(name, clear);
      sec.appendChild(head);
      group.items.forEach((item) => sec.appendChild(notifCard(item)));
      list.appendChild(sec);
    });
  }
  const unread = items.reduce((sum, item) => sum + (item.unread ? 1 : 0), 0);
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
  return unread;
}

function notifDropStored(ids) {
  if (!ids.size || typeof opsNoticeRows !== 'function' || typeof opsNoticeKey !== 'function') return;
  const rows = opsNoticeRows().filter((row) => !ids.has(notifStoreId(row)));
  try { localStorage.setItem(opsNoticeKey(), JSON.stringify(rows)); } catch (e) {}
}

function notifDismiss(id, src) {
  if (!id) return;
  if (src === 'store') notifDropStored(new Set([id]));
  else notifRememberHide([id]);
  _notifItems = _notifItems.filter((item) => item.id !== id);
  notifPaint();
}

function notifClearAll() {
  if (typeof opsNoticeKey === 'function') {
    try { localStorage.setItem(opsNoticeKey(), '[]'); } catch (e) {}
  }
  notifRememberHide(_notifItems.filter((item) => item.src !== 'store').map((item) => item.id));
  _notifItems = [];
  _notifFilter = 'all';
  notifPaint();
}

function notifClearCat(cat) {
  const gone = _notifItems.filter((item) => item.cat === cat);
  if (!gone.length) return;
  notifDropStored(new Set(gone.filter((item) => item.src === 'store').map((item) => item.id)));
  notifRememberHide(gone.filter((item) => item.src !== 'store').map((item) => item.id));
  _notifItems = _notifItems.filter((item) => item.cat !== cat);
  if (_notifFilter === cat) _notifFilter = 'all';
  notifPaint();
}

function notifBind() {
  const list = document.getElementById('notification-center-list');
  const cats = document.getElementById('notif-cats');
  if (list && list.dataset.bound !== '1') {
    list.dataset.bound = '1';
    list.addEventListener('click', (ev) => {
      const del = ev.target.closest('[data-notif-del]');
      if (del) {
        notifDismiss(del.dataset.notifDel, del.dataset.notifSrc);
        return;
      }
      const clear = ev.target.closest('[data-notif-clear]');
      if (clear) notifClearCat(clear.dataset.notifClear);
    });
  }
  if (cats && cats.dataset.bound !== '1') {
    cats.dataset.bound = '1';
    cats.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-notif-cat]');
      if (!chip) return;
      _notifFilter = chip.dataset.notifCat || 'all';
      notifPaint();
    });
  }
}

async function loadNotificationCenter() {
  const list = document.getElementById('notification-center-list');
  const badge = document.getElementById('tb-notif-badge');
  const cats = document.getElementById('notif-cats');
  if (!list || !currentUser) return;
  const gen = ++_notifGen;
  const picked = await notifPickFirm();
  if (gen !== _notifGen) return;
  const fid = picked === 'all' ? 'all' : picked;
  if (fid !== 'all' && !_isValidFirmId(fid)) {
    _notifItems = [];
    if (cats) cats.replaceChildren();
    list.replaceChildren(notifEmptyCard(notifSay('notif.empty', 'Bildirim yok'), notifSay('ops.panel.needfirm', 'Önce firma seçin')));
    if (badge) badge.style.display = 'none';
    return;
  }
  const ff = fid === 'all' ? '' : `firm_id=eq.${fid}&`;
  const hidden = notifHidden();
  const out = [];
  const seenAt = notifSeenAt();
  const clock = (iso) => {
    const d = new Date(iso || '');
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  if (typeof opsNoticeRows === 'function') {
    opsNoticeRows().forEach((row) => {
      const id = notifStoreId(row);
      notifPush(out, hidden, {
        cat: 'live',
        src: 'store',
        id,
        title: row?.title || 'Bildirim',
        body: row?.text || '',
        meta: typeof opsNoticeWhen === 'function' ? opsNoticeWhen(row?.at) : clock(row?.at),
        color: row?.color || '',
        unread: new Date(row?.at || 0).getTime() > seenAt,
      });
    });
  }

  try {
    const chat = await sb(`chat_messages?${ff}order=created_at.desc&limit=5`).catch(() => []);
    const senderIds = [...new Set((chat || []).map((x) => x.sender_id).filter(Boolean))];
    let names = {};
    if (senderIds.length) {
      const users = await sb(`users?id=in.(${senderIds.join(',')})&select=id,name`).catch(() => []);
      (users || []).forEach((u) => { names[u.id] = u.name; });
    }
    (chat || []).forEach((c) => {
      notifPush(out, hidden, {
        cat: 'chat',
        src: 'hide',
        id: `chat:${c.id || `${c.sender_id}:${c.created_at}`}`,
        title: 'Sohbet',
        body: `${names[c.sender_id] || 'Kullanıcı'}: ${c.body || c.file_name || 'Mesaj'}`,
        meta: clock(c.created_at),
        unread: c.sender_id !== currentUser.id,
      });
    });
  } catch (e) {}

  try {
    const field = await sb(`field_tasks?${ff}status=eq.assigned&order=created_at.desc&limit=5`).catch(() => []);
    (field || []).forEach((task) => {
      const mine = task.assigned_to === currentUser.id;
      const fresh = Date.now() - new Date(task.created_at).getTime() < 48 * 3600 * 1000;
      notifPush(out, hidden, {
        cat: 'field',
        src: 'hide',
        id: `field:${task.id || task.created_at}`,
        title: 'Saha görevi',
        body: `Yeni görev atandı · ${task.result_key || 'sonuç bekleniyor'}`,
        meta: new Date(task.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        unread: mine || (fresh && mbIsFirmAdmin()),
      });
    });
  } catch (e) {}

  try {
    const qcRows = await sb(`appointments?${ff}durum=eq.qc_bekleniyor&select=id,nachname,son_guncelleme&order=son_guncelleme.desc&limit=5`).catch(() => []);
    (qcRows || []).forEach((a) => {
      notifPush(out, hidden, {
        cat: 'qc',
        src: 'hide',
        id: `qc:${a.id}`,
        title: 'QC bekleyen',
        body: `${a.nachname || 'Müşteri'} için değerlendirme bekleniyor`,
        meta: new Date(a.son_guncelleme || Date.now()).toLocaleDateString('tr-TR'),
        unread: ['qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser.role),
      });
    });
  } catch (e) {}

  try {
    const events = await sb(`job_events?select=id,event_type,created_at,job_posts!inner(id,title,requester_firm_id)&order=created_at.desc&limit=12`).catch(() => []);
    (events || []).forEach((ev) => {
      const title = ev?.job_posts?.title || 'İş ilanı';
      const own = fid === 'all' || ev?.job_posts?.requester_firm_id === fid;
      const isWithdraw = ev.event_type === 'job_withdrawn';
      const eventLabel = {
        job_created: 'İlan yayınlandı',
        job_withdrawn: 'İlan geri çekildi',
        job_joined: 'İlana katılım',
        submission_created: 'Teslim geldi',
      }[ev.event_type] || 'İş güncellemesi';
      notifPush(out, hidden, {
        cat: 'job',
        src: 'hide',
        id: `job:${ev.id || ev.created_at}`,
        title: isWithdraw ? 'İlan geri çekildi' : 'İş platformu',
        body: isWithdraw ? `${title} · rezerv iade edildi, ilan iptal` : `${title} · ${eventLabel}`,
        meta: clock(ev.created_at),
        unread: own || ['admin', 'firm_admin', 'super_admin', 'qc'].includes(currentUser.role),
      });
    });
  } catch (e) {}

  try {
    const prefs = typeof opsNotifyPrefs === 'function' ? opsNotifyPrefs() : null;
    if (prefs?.appt !== false && currentUser?.id) {
      const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
      const appts = await sb(`appointments?${ff}agent_id=eq.${currentUser.id}&termin_tarih=gte.${today}&select=id,nachname,telefonnummer,termin_tarih&order=termin_tarih.asc&limit=5`).catch(() => []);
      (appts || []).forEach((a) => {
        notifPush(out, hidden, {
          cat: 'appt',
          src: 'hide',
          id: `appt:${a.id}`,
          title: notifSay('ops.notice.appt', 'Randevun'),
          body: `${a.nachname || '—'} · ${a.termin_tarih || ''} · ${a.telefonnummer || ''}`,
          meta: '',
          unread: true,
        });
      });
    }
    if (prefs?.campaign !== false && typeof opsRoleSeesWarn === 'function' && opsRoleSeesWarn()) {
      const ids = (typeof _opsDirective !== 'undefined' && Array.isArray(_opsDirective.ids)) ? _opsDirective.ids : [];
      if (ids.length) {
        const names = ids.map((id) => (typeof opsCampName === 'function' ? opsCampName(id) : id)).filter(Boolean).join(', ');
        notifPush(out, hidden, {
          cat: 'camp',
          src: 'hide',
          id: `camp:${ids.join(',')}`,
          title: notifSay('ops.notice.camps', 'Çalışılacak kampanyalar'),
          body: names,
          meta: '',
          unread: true,
        });
      }
    }
  } catch (e) {}

  if (gen !== _notifGen) return;
  _notifItems = out;
  const unread = notifPaint();
  if (_notifLastUnreadForMascot !== null && unread > _notifLastUnreadForMascot) {
    if (typeof window.hintCustEmptyNotifUnread === 'function') window.hintCustEmptyNotifUnread(unread);
  }
  _notifLastUnreadForMascot = unread;
}

function initNotificationCenter() {
  notifBind();
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(() => {
    if (!currentUser) return;
    loadNotificationCenter();
  }, 20000);
  loadNotificationCenter();
}
