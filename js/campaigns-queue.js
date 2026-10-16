// Kampanya kuyruk modalı — campaigns.js ile aynı kapsam
// ── Kuyruk Yönetim Modalı ─────────────────────
async function openRequeueModal(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const meta = queueMetaFor(found.camp, queueId);
  try {
    const statuses = ['pending', 'no_answer', 'voicemail', 'negative', 'callback', 'dnc'];
    const nums = await Promise.all(statuses.map((st) => mbHeadCount(`contacts?queue_id=eq.${queueId}&status=eq.${st}&select=id`)));
    const counts = {};
    statuses.forEach((st, i) => { counts[st] = nums[i]; });
    const labels = {
      pending: campT('camp.st.pending','Bekliyor'),
      no_answer: campT('camp.st.no_answer','Cevap yok'),
      negative: campT('camp.st.negative','Olumsuz'),
      callback: campT('camp.st.callback','Geri ara'),
      dnc: campT('camp.st.dnc','Kara liste'),
      voicemail: campT('camp.st.voicemail','Telesekreter'),
    };
    document.getElementById('m-requeue')?.remove();
    const modal = document.createElement('div');
    modal.id = 'm-requeue'; modal.className = 'modal-overlay open';
    modal.innerHTML = `
<div class="modal" style="max-width:520px;">
<div class="modal-hdr">
<div class="modal-title">${campEsc(campT('camp.queue.settings','Kuyruk ayarları'))}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
<label class="form-label" for="rq-name">${campEsc(campT('camp.queue.rename','Adı değiştir'))}</label>
<input class="form-input" id="rq-name" maxlength="120" value="${campEsc(found.queue.name || '')}">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div>
<label class="form-label" for="rq-status">${campEsc(campT('camp.queue.status','Durum'))}</label>
<select class="form-input" id="rq-status">
<option value="active" ${found.queue.status === 'active' ? 'selected' : ''}>${campEsc(campT('camp.queue.active','Aktif'))}</option>
<option value="paused" ${found.queue.status !== 'active' ? 'selected' : ''}>${campEsc(campT('camp.queue.stopped','Durdu'))}</option>
</select>
</div>
<div>
<label class="form-label" for="rq-priority">${campEsc(campT('camp.queue.priority','Öncelik'))}</label>
<input class="form-input" id="rq-priority" type="number" min="-100" max="100" value="${meta.priority}">
</div>
</div>
<div style="font-size:11px;color:var(--text-3);">${campEsc(campT('camp.queue.priority.hint','Yüksek sayı önce aranır. 0 hepsi eşit.'))}</div>
<div>
<label class="form-label" for="rq-max">${campEsc(campT('camp.queue.max','En fazla deneme'))}</label>
<input class="form-input" id="rq-max" type="number" min="0" max="50" value="${meta.maxAttempts}">
<div style="font-size:11px;color:var(--text-3);margin-top:4px;">${campEsc(campT('camp.queue.max.hint','0 sınırsız. Dolunca numara atlanır.'))}</div>
</div>
<div>
<label class="form-label" for="rq-notes">${campEsc(campT('camp.queue.notes','Not'))}</label>
<textarea class="form-input" id="rq-notes" rows="2" maxlength="500">${campEsc(meta.notes)}</textarea>
</div>
<button type="button" class="btn btn-primary btn-sm" style="align-self:flex-start;" onclick="saveQueueSettings('${queueId}')">${campEsc(campT('camp.notif.save','Kaydet'))}</button>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
${statuses.map((k) => `
<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
<span style="font-size:12px;color:var(--text-2);">${campEsc(labels[k])}</span>
<span style="font-size:18px;font-weight:800;font-family:var(--mono);">${counts[k]}</span>
</div>`).join('')}
</div>
<div style="font-size:12px;font-weight:700;color:var(--text-2);">${campEsc(campT('camp.queue.requeue','Tekrar kuyruğa al'))}</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${['no_answer','voicemail','negative','callback'].map((k) => `
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-${k}" style="width:15px;height:15px;">
<span style="font-size:12px;">${campEsc(labels[k])} <span style="color:var(--text-3);">(${counts[k]} ${campEsc(campT('camp.queue.people','kişi'))})</span></span>
</label>`).join('')}
</div>
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;background:var(--bg-3);border-radius:6px;border:1px solid var(--border);">
<input type="checkbox" id="rq-reset-attempts" style="width:15px;height:15px;">
<span style="font-size:12px;">${campEsc(campT('camp.queue.reset_attempts','Deneme sayılarını sıfırla'))}</span>
</label>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${campEsc(campT('camp.queue.cancel','İptal'))}</button>
<button class="btn btn-primary" onclick="doRequeue('${queueId}')">${campEsc(campT('camp.queue.requeue.do','Kuyruğa al'))}</button>
</div>
</div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(e) { toast(e.message, 'err'); }
}

async function doRequeue(queueId) {
  const statuses = ['no_answer','voicemail','negative','callback'].filter(s => document.getElementById('rq-'+s)?.checked);
  if (!statuses.length) { toast(campT('camp.queue.pick_status','En az bir durum seçin'),'warn'); return; }
  const resetAttempts = document.getElementById('rq-reset-attempts')?.checked;
  try {
    let moved = 0;
    for (const status of statuses) {
      const rows = await sb(`contacts?queue_id=eq.${queueId}&status=eq.${status}&select=id&limit=2000`) || [];
      const ids = rows.map((r) => r.id).filter(Boolean);
      const patch = { status: 'pending', last_called_at: null };
      if (resetAttempts) patch.attempt_count = 0;
      for (let i = 0; i < ids.length; i += 60) {
        const chunk = ids.slice(i, i + 60);
        await sb(`contacts?id=in.(${chunk.join(',')})`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: JSON.stringify(patch),
        });
      }
      moved += ids.length;
    }
    if (!moved) {
      toast(campT('camp.ops.requeue_zero','Kuyruğa alınacak kişi yok'), 'warn');
      return;
    }
    await syncQueueDialed(queueId);
    document.getElementById('m-requeue')?.remove();
    toast(campT('camp.ops.done','{n} kişi kuyruğa alındı').replace('{n}', String(moved)), 'ok');
    if (currentCampId) await loadCampaigns();
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteQueue(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  const ok = await mbConfirm(campT('camp.queue.delete.confirm','Bu kuyruk ve içindeki kişiler silinsin mi?'), found.queue.name || '');
  if (!ok) return;
  try {
    await sb(`contacts?queue_id=eq.${queueId}`, { method: 'DELETE', prefer: 'return=minimal' });
    await sb(`queues?id=eq.${queueId}`, { method: 'DELETE', prefer: 'return=minimal' });
    found.camp.queues = (found.camp.queues || []).filter((q) => q.id !== queueId);
    const meta = { ...(getCampSettings(found.camp).queue_meta || {}) };
    delete meta[queueId];
    currentCampId = found.camp.id;
    await saveCampSettingsPatch({ queue_meta: meta }).catch(() => {});
    renderCampQueues(found.camp);
    renderCampGrid();
    toast(campT('camp.queue.deleted','Kuyruk silindi'), 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function openQueuePeople(queueId) {
  const found = findQueue(queueId);
  if (!found) return;
  document.getElementById('m-queue-people')?.remove();
  const modal = document.createElement('div');
  modal.id = 'm-queue-people';
  modal.className = 'modal-overlay open';
  modal.dataset.queueId = queueId;
  modal.innerHTML = `<div class="modal" style="max-width:860px;max-height:88vh;overflow:auto;">
<div class="modal-hdr">
<div class="modal-title">${campEsc(campT('camp.queue.contacts','Kişiler'))} — ${campEsc(found.queue.name || '')}</div>
<button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
</div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px;">
<div style="display:flex;gap:8px;flex-wrap:wrap;">
<input class="form-input" id="qp-q" placeholder="${campEsc(campT('camp.people.search','Ara'))}" style="flex:1;min-width:160px;">
<select class="form-input" id="qp-status" style="width:160px;">
<option value="">${campEsc(campT('camp.people.all','Tümü'))}</option>
${QUEUE_OPS_ROWS.map((r) => `<option value="${r.key}">${campEsc(campT(r.label, r.fb))}</option>`).join('')}
</select>
<button type="button" class="btn btn-ghost btn-sm" onclick="refreshQueuePeople()">${campEsc(campT('camp.ops.apply','Göster'))}</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="downloadOpsContacts('${queueId}','all')">${campEsc(campT('camp.ops.download','İndir'))}</button>
</div>
<div id="qp-body" style="font-size:12px;color:var(--text-3);">…</div>
</div>
<div class="modal-footer"><button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${campEsc(campT('camp.ops.close','Kapat'))}</button></div>
</div>`;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  document.getElementById('qp-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') refreshQueuePeople(); });
  await refreshQueuePeople();
}

async function refreshQueuePeople() {
  const modal = document.getElementById('m-queue-people');
  const host = document.getElementById('qp-body');
  const queueId = modal?.dataset.queueId;
  if (!host || !queueId) return;
  const q = String(document.getElementById('qp-q')?.value || '').trim();
  const st = document.getElementById('qp-status')?.value || '';
  const statusQ = st ? `&status=eq.${st}` : '';
  const search = q ? `&or=(phone.ilike.*${encodeURIComponent(q)}*,first_name.ilike.*${encodeURIComponent(q)}*,last_name.ilike.*${encodeURIComponent(q)}*)` : '';
  try {
    const rows = await sb(`contacts?queue_id=eq.${queueId}${statusQ}${search}&select=id,phone,first_name,last_name,status,attempt_count&order=created_at.asc&limit=200`) || [];
    if (!rows.length) {
      host.innerHTML = campEsc(campT('camp.people.empty','Kişi yok'));
      return;
    }
    host.innerHTML = `<table class="qops"><thead><tr>
<th>${campEsc(campT('camp.ops.name','Adı'))}</th><th>${campEsc(campT('uq.field.phone','Telefon').replace(/\s*\*$/, ''))}</th><th>${campEsc(campT('camp.queue.status','Durum'))}</th><th></th>
</tr></thead><tbody>${rows.map((r) => `<tr>
<td><input class="form-input" id="qp-fn-${r.id}" value="${campEsc(r.first_name || '')}" style="margin-bottom:4px;"><input class="form-input" id="qp-ln-${r.id}" value="${campEsc(r.last_name || '')}"></td>
<td><input class="form-input" id="qp-ph-${r.id}" value="${campEsc(r.phone || '')}"></td>
<td>${campEsc(contactStatusLabel(r.status))}<div style="color:var(--text-3);font-family:var(--mono);">${r.attempt_count || 0}</div></td>
<td style="white-space:nowrap;">
<button type="button" class="btn btn-primary btn-xs" onclick="saveQueuePerson('${r.id}')">${campEsc(campT('camp.notif.save','Kaydet'))}</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="dncQueuePerson('${r.id}')">DNC</button>
<button type="button" class="btn btn-ghost btn-xs" onclick="deleteQueuePerson('${r.id}')">${campEsc(campT('camp.queue.delete','Sil'))}</button>
</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    host.textContent = e.message;
  }
}

async function saveQueuePerson(id) {
  const phone = mbNormalizeDialPhone(document.getElementById(`qp-ph-${id}`)?.value || '');
  if (phone && !mbIsE164(phone)) { toast(campT('camp.did.bad','DID + ile başlamalı, örnek +49301234567'), 'err'); return; }
  try {
    await sb(`contacts?id=eq.${id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({
        first_name: document.getElementById(`qp-fn-${id}`)?.value?.trim() || '',
        last_name: document.getElementById(`qp-ln-${id}`)?.value?.trim() || '',
        phone,
      }),
    });
    toast(campT('camp.people.saved','Kişi güncellendi'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function dncQueuePerson(id) {
  try {
    await sb(`contacts?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ status: 'dnc' }) });
    await refreshQueuePeople();
  } catch (e) { toast(e.message, 'err'); }
}

function contactStatusLabel(status) {
  const row = QUEUE_OPS_ROWS.find((r) => r.key === status);
  return row ? campT(row.label, row.fb) : (status || '');
}

async function deleteQueuePerson(id) {
  const ok = await mbConfirm(campT('camp.people.delete.confirm','Bu kişi silinsin mi?'), campT('camp.queue.delete','Sil'));
  if (!ok) return;
  const queueId = document.getElementById('m-queue-people')?.dataset.queueId || '';
  try {
    await sb(`contacts?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    if (queueId) await reconcileQueueTotals([{ queues: [{ id: queueId, total_contacts: -1 }] }]);
    const found = queueId ? findQueue(queueId) : null;
    if (found) {
      renderCampQueues(found.camp);
      renderCampGrid();
    }
    await refreshQueuePeople();
    toast(campT('camp.people.deleted','Kişi silindi'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

paintCampViewToggle();
