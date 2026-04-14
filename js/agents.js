// ─────────────────────────────────────────────
// AGENTS — agent yönetimi, firmalar, kullanıcılar
// ─────────────────────────────────────────────

async function loadAgents() {
  renderFirmSelector('agents-firm-selector', loadAgents);
  const grid = document.getElementById('agents-grid');
  try {
    const ff = getFirmFilter('&');
    const users    = await sb(`users?select=id,name,email,role,is_active${ff}&role=in.(agent,qc,firm_admin,field_agent)&order=name.asc`) || [];
    const acs      = await sb(`agent_campaigns?select=*,campaigns(id,name)${ff}`) || [];
    const sessions = await sb('agent_sessions?select=*') || [];
    const SC = {ready:'var(--green)',on_call:'var(--accent)',wrapping:'var(--yellow)',break:'var(--yellow)',offline:'var(--text-3)'};
    if (!users.length) {
      grid.innerHTML = `<div style="color:var(--text-3);padding:32px;font-size:13px;">Henüz kullanıcı yok</div>`;
      return;
    }
    const statusLabel = {ready:'Hazır',on_call:'Aramada',wrapping:'Sonuç giriyor',break:'Mola',offline:'Çevrimdışı'};
    grid.innerHTML = users.map(u => {
      const myAcs    = acs.filter(a => a.agent_id === u.id);
      const sess     = sessions.find(s => s.agent_id === u.id);
      const status   = sess?.status || 'offline';
      const color    = SC[status] || 'var(--text-3)';
      const campNames = myAcs.map(a=>a.campaigns?.name||'').filter(Boolean);
      const roleMap  = {agent:'Agent',qc:'QC',firm_admin:'Firma Admin',field_agent:'Saha Elemanı'};
      return `<div class="agent-card-item" style="position:relative;cursor:pointer;" onclick="openEditAgentModal('${u.id}')">
<div class="agent-av-lg" style="background:${u.is_active?'var(--accent)':'var(--text-3)'};">${u.name.charAt(0)}</div>
<div class="agent-info-lg" style="flex:1;">
<div class="name">${u.name}</div>
<div style="font-size:11px;color:var(--text-3);">${u.email}</div>
<div class="camps" style="margin-top:3px;">${campNames.length?campNames.join(', '):'Kampanya atanmamış'}</div>
</div>
<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:700;">${roleMap[u.role]||u.role}</span>
<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:${color};">
<div style="width:7px;height:7px;border-radius:50%;background:${color};"></div>
${statusLabel[status]||status}
</div>
</div>
</div>`;
    }).join('');
  } catch(e) { console.error(e); grid.innerHTML=`<div style="color:var(--red);padding:24px;">Hata: ${e.message}</div>`; }
}

async function canManageFieldAgents(targetFirmId) {
  if (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') return true;
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
  const showFieldOpt = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
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
${!(_allFirms||[]).length ? `<option value="${currentUser.firm_id}">${currentUser.firm_id}</option>` : ''}
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
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_user_with_password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_firm_id:firmId,p_email:email,p_password:pass,p_name:name,p_role:role})
    });
    if (!res.ok) throw new Error(await res.text());
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
  try {
    await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({name,role,is_active:active})});
    if (pass) {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
        method:'POST',
        headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({p_user_id:userId,p_new_password:pass})
      });
      if (!r.ok) throw new Error(await r.text());
    }
    document.getElementById('m-agent-mgr')?.remove();
    await loadAgents();
    toast('Güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+_safeErrorText(e),'err'); }
}

async function confirmDeleteAgent(userId) {
  if (!(await mbConfirm('Bu kullanıcıyı silmek istediğinize emin misiniz?', 'Kullanıcı Sil'))) return;
  try {
    await sb(`users?id=eq.${userId}`,{method:'DELETE',prefer:'return=minimal'});
    document.getElementById('m-agent-mgr')?.remove();
    await loadAgents();
    toast('Kullanıcı silindi','ok');
  } catch(e) { toast('Silinemedi: '+e.message,'err'); }
}

async function openAssignModal() {
  if (!currentCampId) return;
  const ff = getFirmFilter('&');
  try {
    const users = await sb(`users?select=id,name,email,role${ff}&role=in.(agent,qc,field_agent)&is_active=eq.true&order=name.asc`) || [];
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
    loadCampaigns();
    setTimeout(()=>openCampDetail(currentCampId), 400);
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

async function removeAgent(agentId, campId) {
  try {
    await sb(`agent_campaigns?agent_id=eq.${agentId}&campaign_id=eq.${campId}`,{method:'DELETE',prefer:'return=minimal'});
    toast('Agent çıkarıldı','ok');
    loadCampaigns();
    setTimeout(()=>openCampDetail(campId), 300);
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
  try {
    await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({name,email,role,is_active:active})});
    if (pass) {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
        method:'POST',
        headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
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
  document.getElementById('firm-name').value = '';
  document.getElementById('firm-slug').value = '';
  openModal('m-firm');
}

function editFirm(id) {
  firmEditId = id;
  openModal('m-firm');
}

async function saveFirm() {
  const name = document.getElementById('firm-name').value.trim();
  const slug = document.getElementById('firm-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
  const plan = document.getElementById('firm-plan').value;
  if (!name||!slug) { toast('Ad ve slug zorunlu','err'); return; }
  try {
    if (firmEditId) await sb(`firms?id=eq.${firmEditId}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({name,slug,plan})});
    else await sb('firms',{method:'POST',prefer:'return=minimal',body:JSON.stringify({name,slug,plan})});
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
  document.getElementById('user-role').value = 'agent';
  openModal('m-user');
}

async function saveUser() {
  const name   = document.getElementById('user-name').value.trim();
  const email  = document.getElementById('user-email').value.trim().toLowerCase();
  const pass   = document.getElementById('user-pass').value;
  const role   = document.getElementById('user-role').value;
  const firmId = document.getElementById('user-firm-id').value;
  if (!name||!email||!pass) { toast('Tüm alanlar zorunlu','err'); return; }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/create_user_with_password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
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
    await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_user_id:userId,p_new_password:p})
    });
    toast('Şifre sıfırlandı ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

// ── Roller & İzinler ──────────────────────────
const BUILTIN_ROLES = [
  { key:'super_admin', label:'Süper Admin', color:'var(--red)', builtin:true,
    perms:['dashboard','campaigns','contacts','callhistory','stats','agents','firms','settings','takvim','qc','wiedervorlage','leave','competition','muhasebe','export','performance'] },
  { key:'firm_admin',  label:'Firma Admin',  color:'var(--accent)', builtin:true,
    perms:['dashboard','campaigns','contacts','callhistory','stats','agents','takvim','qc','wiedervorlage','leave','competition','muhasebe','export','performance'] },
  { key:'agent',       label:'Agent',        color:'var(--green)', builtin:true,
    perms:['dashboard','dialer','myhistory','wiedervorlage','takvim','leave','competition','maasim','performansim'] },
  { key:'qc',          label:'QC',           color:'var(--yellow)', builtin:true,
    perms:['dashboard','qc','callhistory','wiedervorlage','leave','competition','maasim','performansim'] },
  { key:'field_agent', label:'Saha Elemanı', color:'var(--accent-2)', builtin:true,
    perms:['dashboard','field','leave','competition','maasim','performansim'] },
];
const ALL_PAGES = [
  {key:'dashboard',    label:'Özet'},
  {key:'campaigns',    label:'Kampanyalar'},
  {key:'contacts',     label:'Kişiler/Kuyruk'},
  {key:'callhistory',  label:'Çağrı Geçmişi'},
  {key:'stats',        label:'İstatistikler'},
  {key:'agents',       label:'Agentler'},
  {key:'firms',        label:'Firmalar'},
  {key:'settings',     label:'Ayarlar'},
  {key:'takvim',       label:'Takvim'},
  {key:'qc',           label:'QC Paneli'},
  {key:'wiedervorlage',label:'Aranacaklar'},
  {key:'dialer',       label:'Dialer'},
  {key:'field',        label:'Saha Operasyon'},
  {key:'myhistory',    label:'Geçmişim'},
  {key:'leave',        label:'İzin & Devam'},
  {key:'competition',  label:'Ayın elemanı'},
  {key:'muhasebe',     label:'Muhasebe'},
  {key:'maasim',       label:'Maaşım'},
  {key:'performansim', label:'Performansım'},
  {key:'export',       label:'Dışa aktarım'},
  {key:'performance',  label:'Personel performans'},
];

async function loadRolesPage() {
  const card = document.getElementById('roles-card');
  const el   = document.getElementById('roles-list');
  const addBtn = card?.querySelector('button[onclick="openAddRoleModal()"]');
  if (!card || !el) return;
  const canManage = ['super_admin', 'admin', 'firm_admin'].includes(currentUser?.role || '');
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
  const p = window._userPagePerms;
  if (!p || !(p instanceof Set) || p.size === 0) {
    const b = BUILTIN_ROLES.find(r => r.key === currentUser?.role);
    const arr = b?.perms || [];
    if (arr.includes(key)) return true;
    if ((key === 'maasim' || key === 'performansim') && arr.includes('muhasebe')) return true;
    return false;
  }
  if (p.has(key)) return true;
  if ((key === 'maasim' || key === 'performansim') && p.has('muhasebe')) return true;
  return false;
}

async function refreshUserPagePerms() {
  const role = currentUser?.role;
  let list = [...(BUILTIN_ROLES.find(r => r.key === role)?.perms || [])];
  window._userPagePerms = new Set(list);
  if (typeof applyAgentPayNavVisibility === 'function') applyAgentPayNavVisibility();
  try {
    if (!currentUser?.firm_id) return;
    const firms = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const st = firms?.[0]?.settings || {};
    const ov = st.role_permissions?.[role];
    if (Array.isArray(ov)) list = [...ov];
    else if (!BUILTIN_ROLES.find(r => r.key === role)) {
      const cr = (st.custom_roles || []).find(r => r.key === role);
      if (cr?.perms) list = [...cr.perms];
    }
    window._userPagePerms = new Set(list);
    if (typeof applyAgentPayNavVisibility === 'function') applyAgentPayNavVisibility();
  } catch (e) {}
}

function applyAgentPayNavVisibility() {
  const isStaff = ['agent', 'qc', 'field_agent'].includes(currentUser?.role || '');
  const p = window._userPagePerms || new Set();
  const legacy = p.has('muhasebe');
  const ma = p.has('maasim') || legacy;
  const pe = p.has('performansim') || legacy;
  const maBtn = document.getElementById('nav-maasim-btn');
  const peBtn = document.getElementById('nav-performansim-btn');
  if (maBtn) maBtn.style.display = isStaff && ma ? '' : 'none';
  if (peBtn) peBtn.style.display = isStaff && pe ? '' : 'none';
}
