// ─────────────────────────────────────────────
// AGENTS — agent yönetimi, firmalar, kullanıcılar
// ─────────────────────────────────────────────

async function loadAgents() {
  renderFirmSelector('agents-firm-selector', loadAgents);
  const grid = document.getElementById('agents-grid');
  try {
    const ff = getFirmFilter('&');
    const users    = await sb(`users?select=id,name,email,role,is_active${ff}&role=in.(agent,qc,firm_admin)&order=name.asc`) || [];
    const acs      = await sb(`agent_campaigns?select=*,campaigns(id,name)${ff}`) || [];
    const sessions = await sb('agent_sessions?select=*') || [];
    const SC = {ready:'var(--green)',on_call:'var(--accent)',wrapping:'var(--yellow)',break:'var(--yellow)',offline:'var(--text-3)'};
    if (!users.length) {
      grid.innerHTML = `<div style="color:var(--text-3);padding:32px;font-size:13px;">Henüz kullanıcı yok</div>`;
      return;
    }
    grid.innerHTML = users.map(u => {
      const myAcs    = acs.filter(a => a.agent_id === u.id);
      const sess     = sessions.find(s => s.agent_id === u.id);
      const status   = sess?.status || 'offline';
      const color    = SC[status] || 'var(--text-3)';
      const campNames = myAcs.map(a=>a.campaigns?.name||'').filter(Boolean);
      const roleMap  = {agent:'Agent',qc:'QC',firm_admin:'Firma Admin'};
      return `<div class="agent-card-item" style="position:relative;">
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
${status}
</div>
</div>
</div>`;
    }).join('');
  } catch(e) { console.error(e); grid.innerHTML=`<div style="color:var(--red);padding:24px;">Hata: ${e.message}</div>`; }
}

async function openAssignModal() {
  if (!currentCampId) return;
  const ff = getFirmFilter('&');
  try {
    const users = await sb(`users?select=id,name,email,role${ff}&role=in.(agent,qc)&is_active=eq.true&order=name.asc`) || [];
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
<button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="resetUserPass('${u.id}','${u.email}')">🔑</button>
<button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="openEditUserModal('${u.id}')">✏️</button>
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
<div class="modal-title">✏️ Kullanıcı Düzenle</div>
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
}

async function saveEditUser(userId) {
  const name   = document.getElementById('eu-name')?.value.trim();
  const email  = document.getElementById('eu-email')?.value.trim().toLowerCase();
  const pass   = document.getElementById('eu-pass')?.value;
  const role   = document.getElementById('eu-role')?.value;
  const active = document.getElementById('eu-active')?.value === 'true';
  if (!name||!email) { toast('Ad ve e-posta zorunlu','err'); return; }
  try {
    await sb(`users?id=eq.${userId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({name,email,role,is_active:active})});
    if (pass) {
      await fetch(`${SB_URL}/rest/v1/rpc/reset_user_password`,{
        method:'POST',
        headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({p_user_id:userId,p_new_password:pass})
      });
    }
    document.getElementById('m-edit-user')?.remove();
    await loadFirmsPage();
    toast('Kullanıcı güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
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
  const p = prompt(`${email} için yeni şifre:`);
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
