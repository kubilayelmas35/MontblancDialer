let _queuesPaint = 0;

function queuesSay(key, fb) {
  return typeof t === 'function' ? t(key) : fb;
}

function queuesPageList() {
  const list = [];
  (campaigns || []).forEach((camp) => {
    (camp.queues || []).forEach((q) => list.push({ camp, q }));
  });
  list.sort((a, b) => String(b.q.created_at || '').localeCompare(String(a.q.created_at || '')));
  const needle = String(document.getElementById('queues-search')?.value || '').trim().toLocaleLowerCase('tr-TR');
  if (!needle) return list;
  return list.filter((row) => {
    const name = String(row.q.name || '').toLocaleLowerCase('tr-TR');
    const camp = (typeof mbCampShown === 'function' ? mbCampShown(row.camp) : row.camp?.name || '').toLocaleLowerCase('tr-TR');
    return name.includes(needle) || camp.includes(needle);
  });
}

function paintQueuesPage() {
  const body = document.getElementById('queues-tbody');
  if (!body) return;
  const rows = queuesPageList();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="mb-empty-hint">${typeof escapeHtml === 'function' ? escapeHtml(queuesSay('queues.none', 'Kuyruk yok')) : 'Kuyruk yok'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => {
    const q = row.q;
    const text = typeof queueFieldText === 'function' ? queueFieldText(row.camp, q) : {};
    const camp = typeof mbCampShown === 'function' ? mbCampShown(row.camp) : (row.camp?.name || '—');
    const esc = typeof campEsc === 'function' ? campEsc : (v) => String(v ?? '');
    const manual = typeof mbIsManualQueue === 'function' && mbIsManualQueue(q);
    const badge = manual ? ` <span class="badge badge-gray">${esc(queuesSay('queues.manual', 'Manuel'))}</span>` : '';
    return `<tr class="camp-row" data-queue-id="${esc(q.id)}" onclick="openQueueOps('${q.id}')" style="cursor:pointer;">
<td><div class="queue-name">${esc(q.name || '—')}${badge}</div></td>
<td>${esc(camp)}</td>
<td class="num">${esc(text.ratio || '—')}</td>
<td class="num">${esc(text.dialed || '—')}</td>
<td>${esc(text.created || '—')}</td>
<td onclick="event.stopPropagation()"><button type="button" class="btn btn-primary btn-xs" onclick="openQueueOps('${q.id}')">${esc(queuesSay('queues.open', 'İşlemler'))}</button></td>
</tr>`;
  }).join('');
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
  if (body) body.innerHTML = `<tr><td colspan="6" class="mb-empty-hint">${typeof escapeHtml === 'function' ? escapeHtml(queuesSay('queues.loading', 'Yükleniyor…')) : '…'}</td></tr>`;
  if (typeof loadCampaigns === 'function') await loadCampaigns();
  if (gen !== _queuesPaint) return;
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
