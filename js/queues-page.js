let _queuesPaint = 0;
let _queuesSort = { key: '', dir: 'desc' };
let _queuesFilters = {};

function queuesSay(key, fb) {
  return typeof campT === 'function' ? campT(key, fb) : (typeof t === 'function' ? t(key) : fb);
}

function queuesColDefs() {
  return [
    { key: 'name', label: queuesSay('camp.queue.col.name', 'Adı') },
    { key: 'campaign', label: queuesSay('queues.col.campaign', 'Kampanya') },
    { key: 'status', label: queuesSay('camp.queue.status', 'Durum') },
    { key: 'ratio', label: queuesSay('camp.queue.col.ratio', 'Aranacak/Toplam'), num: true },
    { key: 'dialed', label: queuesSay('camp.queue.col.dialed', 'Aranan'), num: true },
    { key: 'sales', label: queuesSay('camp.queue.col.sales', 'Satışlar'), num: true },
    { key: 'created', label: queuesSay('camp.queue.col.created', 'Oluşturma Tarihi') },
    { key: '', label: '' },
  ];
}

function queuesSortValue(row, key) {
  const q = row.q;
  if (key === 'name') return String(q.name || '').toLocaleLowerCase('tr-TR');
  if (key === 'campaign') return String(typeof mbCampShown === 'function' ? mbCampShown(row.camp) : (row.camp?.name || '')).toLocaleLowerCase('tr-TR');
  if (key === 'status') return q.status === 'active' ? 0 : 1;
  if (key === 'ratio') return q._left == null ? null : Number(q._left);
  if (key === 'dialed') return Number(q.dialed_count || 0);
  if (key === 'sales') return q._sales == null ? null : Number(q._sales);
  if (key === 'created') return String(q.created_at || '');
  return '';
}

function queuesCompare(a, b) {
  const activeRank = (row) => (row.q.status === 'active' ? 0 : 1);
  const key = _queuesSort.key;
  if (!key) {
    const rank = activeRank(a) - activeRank(b);
    if (rank) return rank;
    return String(b.q.created_at || '').localeCompare(String(a.q.created_at || ''));
  }
  const dir = _queuesSort.dir === 'desc' ? -1 : 1;
  const av = queuesSortValue(a, key);
  const bv = queuesSortValue(b, key);
  if (av == null && bv == null) return activeRank(a) - activeRank(b);
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number' && av !== bv) return (av - bv) * dir;
  if (typeof av === 'string' || typeof bv === 'string') {
    const cmp = String(av).localeCompare(String(bv), 'tr');
    if (cmp) return cmp * dir;
  }
  return activeRank(a) - activeRank(b);
}

function queuesPageList() {
  const list = [];
  (campaigns || []).forEach((camp) => {
    (camp.queues || []).forEach((q) => list.push({ camp, q }));
  });
  const needle = String(document.getElementById('queues-search')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const filtered = list.filter((row) => {
    const text = typeof queueFieldText === 'function' ? queueFieldText(row.camp, row.q) : {};
    const campName = typeof mbCampShown === 'function' ? mbCampShown(row.camp) : (row.camp?.name || '');
    const fields = {
      name: row.q.name || '',
      campaign: campName,
      status: text.status || '',
      ratio: text.ratio || '',
      dialed: text.dialed || '',
      sales: text.sales || '',
      created: text.created || '',
    };
    if (needle) {
      const hay = `${fields.name} ${fields.campaign}`.toLocaleLowerCase('tr-TR');
      if (!hay.includes(needle)) return false;
    }
    return Object.entries(_queuesFilters).every(([key, raw]) => {
      if (!key || !String(raw || '').trim()) return true;
      return typeof campMatch === 'function' ? campMatch(fields[key] || '', raw) : String(fields[key] || '').toLocaleLowerCase('tr-TR').includes(String(raw).toLocaleLowerCase('tr-TR'));
    });
  });
  filtered.sort(queuesCompare);
  return filtered;
}

function paintQueuesHead() {
  const head = document.getElementById('queues-thead');
  if (!head) return;
  const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
  head.innerHTML = `<tr>${queuesColDefs().map((col) => {
    const on = col.key && _queuesSort.key === col.key;
    const sort = col.key
      ? `<span class="camp-sort"><button type="button" class="camp-sort-btn${on && _queuesSort.dir === 'asc' ? ' is-on' : ''}" title="${esc(queuesSay('camp.sort.asc', 'Küçükten büyüğe'))}" onclick="setQueuesSort('${col.key}','asc')"><i class="ph ph-caret-up"></i></button><button type="button" class="camp-sort-btn${on && _queuesSort.dir === 'desc' ? ' is-on' : ''}" title="${esc(queuesSay('camp.sort.desc', 'Büyükten küçüğe'))}" onclick="setQueuesSort('${col.key}','desc')"><i class="ph ph-caret-down"></i></button></span>`
      : '';
    const filter = col.key
      ? `<input class="camp-col-filter" data-k="${esc(col.key)}" value="${esc(_queuesFilters[col.key] || '')}" oninput="setQueuesFilter('${col.key}', this.value)" onclick="event.stopPropagation()">`
      : '';
    return `<th class="${col.num ? 'num' : ''}"><span class="camp-sort-label">${esc(col.label)}${sort}</span>${filter}</th>`;
  }).join('')}</tr>`;
}

function queuesMenuHtml(q) {
  const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
  return `<button type="button" class="btn btn-primary btn-xs queue-menu-btn" onclick="event.stopPropagation();toggleQueueMenu('${q.id}', this)">${esc(queuesSay('camp.queue.ops', 'İşlemler'))} <i class="ph ph-caret-down"></i></button>`;
}

function paintQueuesPage() {
  const body = document.getElementById('queues-tbody');
  if (!body) return;
  if (body.querySelector('.queue-rename-input')) return;
  document.getElementById('queue-menu-pop')?.remove();
  const rows = queuesPageList();
  const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
  const cols = queuesColDefs().length;
  if (!rows.length) {
    const any = (campaigns || []).some((camp) => (camp.queues || []).length);
    const msg = any ? queuesSay('camp.queue.search.empty', 'Eşleşen kuyruk yok') : queuesSay('queues.none', 'Kuyruk yok');
    body.innerHTML = `<tr><td colspan="${cols}" class="mb-empty-hint">${esc(msg)}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => {
    const q = row.q;
    const text = typeof queueFieldText === 'function' ? queueFieldText(row.camp, q) : {};
    const camp = typeof mbCampShown === 'function' ? mbCampShown(row.camp) : (row.camp?.name || '—');
    const manual = typeof mbIsManualQueue === 'function' && mbIsManualQueue(q);
    const badge = manual ? ` <span class="badge badge-gray">${esc(queuesSay('queues.manual', 'Manuel'))}</span>` : '';
    const paused = q.status !== 'active' ? ' is-paused' : '';
    return `<tr class="camp-row${paused}" data-queue-id="${esc(q.id)}" onclick="openQueueOps('${q.id}')">
<td><div class="queue-name">${esc(q.name || '—')}${badge}</div></td>
<td>${esc(camp)}</td>
<td><span class="badge ${text.active ? 'badge-green' : 'badge-gray'}">${esc(text.status || '')}</span></td>
<td class="num">${esc(text.ratio || '—')}</td>
<td class="num">${esc(text.dialed || '—')}</td>
<td class="num">${esc(text.sales || '—')}</td>
<td>${esc(text.created || '—')}</td>
<td onclick="event.stopPropagation()">${queuesMenuHtml(q)}</td>
</tr>`;
  }).join('');
}

function setQueuesSort(key, dir) {
  _queuesSort = { key: key || '', dir: dir === 'asc' ? 'asc' : 'desc' };
  paintQueuesHead();
  paintQueuesPage();
}

function setQueuesFilter(key, value) {
  _queuesFilters[key] = String(value || '');
  paintQueuesPage();
}

function mbPaintQueuesIfOpen() {
  if (!document.getElementById('page-queues')?.classList.contains('active')) return;
  paintQueuesHead();
  paintQueuesPage();
}

function toggleQueueMenu(queueId, btn) {
  const open = document.getElementById('queue-menu-pop');
  if (open?.dataset.for === queueId) {
    open.remove();
    return;
  }
  open?.remove();
  const found = typeof findQueue === 'function' ? findQueue(queueId) : null;
  if (!found || !btn) return;
  const text = typeof queueFieldText === 'function' ? queueFieldText(found.camp, found.queue) : { active: found.queue.status === 'active' };
  const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
  const pause = text.active ? queuesSay('camp.queue.pause', 'Duraklat') : queuesSay('camp.queue.resume', 'Sürdür');
  const pop = document.createElement('div');
  pop.id = 'queue-menu-pop';
  pop.className = 'queue-menu-pop';
  pop.dataset.for = queueId;
  pop.innerHTML = `
<button type="button" class="qm-ops" onclick="queuesMenuGo(() => openQueueOps('${queueId}'))">${esc(queuesSay('camp.queue.ops', 'İşlemler'))}</button>
<button type="button" class="qm-up" onclick="queuesMenuGo(() => openQueueUpload('${queueId}'))">${esc(queuesSay('camp.queue.upload', 'Yükle'))}</button>
<button type="button" class="qm-name" onclick="queuesMenuGo(() => startQueueRename('${queueId}'))">${esc(queuesSay('camp.queue.rename', 'Adı değiştir'))}</button>
<button type="button" class="qm-pause" onclick="queuesMenuGo(() => toggleQueueStatus('${queueId}'))">${esc(pause)}</button>
<button type="button" class="qm-set" onclick="queuesMenuGo(() => openRequeueModal('${queueId}'))">${esc(queuesSay('camp.queue.manage', 'Ayarlar'))}</button>
<button type="button" class="qm-people" onclick="queuesMenuGo(() => openQueuePeople('${queueId}'))">${esc(queuesSay('camp.queue.contacts', 'Kişiler'))}</button>
<button type="button" class="qm-del" onclick="queuesMenuGo(() => deleteQueue('${queueId}'))">${esc(queuesSay('camp.queue.delete', 'Sil'))}</button>`;
  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const h = pop.offsetHeight;
  const w = pop.offsetWidth;
  const top = (window.innerHeight - rect.bottom < h + 8 && rect.top > h) ? rect.top - h - 4 : rect.bottom + 4;
  pop.style.top = `${Math.max(8, top)}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))}px`;
}

function queuesMenuGo(fn) {
  document.getElementById('queue-menu-pop')?.remove();
  if (typeof fn === 'function') fn();
}

if (!window._queuesMenuBound) {
  window._queuesMenuBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#queue-menu-pop, .queue-menu-btn')) return;
    document.getElementById('queue-menu-pop')?.remove();
  });
}

async function fillQueuesPageCounts() {
  const gen = _queuesPaint;
  const camps = (campaigns || []).filter((camp) => (camp.queues || []).length);
  for (let i = 0; i < camps.length; i += 1) {
    if (gen !== _queuesPaint) return;
    if (typeof attachQueueColumnStats === 'function') await attachQueueColumnStats(camps[i]);
    if (gen === _queuesPaint && document.getElementById('page-queues')?.classList.contains('active')) paintQueuesPage();
  }
}

async function loadQueuesPage() {
  const body = document.getElementById('queues-tbody');
  const gen = ++_queuesPaint;
  const cols = queuesColDefs().length;
  if (body) body.innerHTML = `<tr><td colspan="${cols}" class="mb-empty-hint">${typeof escapeHtml === 'function' ? escapeHtml(queuesSay('queues.loading', 'Yükleniyor…')) : '…'}</td></tr>`;
  paintQueuesHead();
  if (typeof loadCampaigns === 'function') await loadCampaigns();
  if (gen !== _queuesPaint) return;
  paintQueuesHead();
  paintQueuesPage();
  void fillQueuesPageCounts();
}

function openQueuesNew() {
  document.getElementById('m-queues-new')?.remove();
  const camps = (campaigns || []).slice().sort((a, b) => {
    const left = typeof mbCampShown === 'function' ? mbCampShown(a) : (a.name || '');
    const right = typeof mbCampShown === 'function' ? mbCampShown(b) : (b.name || '');
    return left.localeCompare(right, 'tr');
  });
  if (!camps.length) {
    if (typeof toast === 'function') toast(queuesSay('queues.pick.need', 'Kampanya seçin'), 'warn');
    return;
  }
  const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
  const options = camps.map((camp) => {
    const label = typeof mbCampShown === 'function' ? mbCampShown(camp) : (camp.name || camp.id);
    return `<option value="${esc(camp.id)}">${esc(label)}</option>`;
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'm-queues-new';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `<div class="modal" style="max-width:420px;">
<div class="modal-hdr">
<div class="modal-title">${esc(queuesSay('queues.new.title', 'Yeni kuyruk'))}</div>
<button type="button" class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;">
<label class="form-label" for="queues-camp-pick">${esc(queuesSay('queues.pick.need', 'Kampanya seçin'))}</label>
<select class="form-input" id="queues-camp-pick">${options}</select>
<div style="font-size:12px;color:var(--text-3);line-height:1.45;">${esc(queuesSay('queues.new.hint', ''))}</div>
<div style="display:flex;justify-content:flex-end;gap:8px;">
<button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
<button type="button" class="btn btn-primary btn-sm" onclick="confirmQueuesNew()">${esc(queuesSay('queues.new.go', 'Devam'))}</button>
</div>
</div>
</div>`;
  document.body.appendChild(modal);
}

function confirmQueuesNew() {
  const id = document.getElementById('queues-camp-pick')?.value || '';
  if (!id) {
    if (typeof toast === 'function') toast(queuesSay('queues.pick.need', 'Kampanya seçin'), 'warn');
    return;
  }
  if (typeof currentCampId !== 'undefined') currentCampId = id;
  document.getElementById('m-queues-new')?.remove();
  if (typeof openFreshQueueUpload === 'function') openFreshQueueUpload();
}
