// ── Inline field edit ─────────────────────────
function startFieldEdit(fieldKey, fieldLabel, btnEl) {
  const camp = (campaigns || []).find((c) => c.id === currentContact?.campaign_id);
  if (typeof mbAgentCanEditFields === 'function' && !mbAgentCanEditFields(camp)) {
    toast(typeof t === 'function' ? t('camp.arama.edit.locked') : 'Bu kampanyada alanlar kilitli', 'warn');
    return;
  }
  const valEl = document.getElementById('cval-' + fieldKey);
  if (!valEl) return;
  const parent = valEl.parentElement;
  const currentVal = valEl.textContent === '—' ? '' : valEl.textContent;
  const input = document.createElement('input');
  input.className = 'form-input';
  input.value = currentVal;
  input.style.cssText = 'flex:1;font-size:13px;padding:3px 8px;height:28px;';
  input.placeholder = fieldLabel + '...';
  valEl.style.display = 'none';
  parent.insertBefore(input, valEl);
  if (fieldKey === 'notes') {
    input.id = 'cedit-notes';
    input.addEventListener('input', () => {
      if (typeof onDialerNoteInput === 'function') onDialerNoteInput(input.value, 'top');
    });
  }
  input.addEventListener('input', () => {
    if (typeof qcSyncTwin === 'function') qcSyncTwin(fieldKey, input.value, 'top', { domOnly: true });
  });
  input.focus(); input.select();
  btnEl.innerHTML = '<i class="ph ph-check" style="font-size:14px;"></i>';
  btnEl.title = 'Kaydet'; btnEl.style.color = 'var(--green)'; btnEl.style.opacity = '1';
  btnEl.onclick = () => saveFieldEdit(fieldKey, fieldLabel, input, valEl, btnEl);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const pick = fieldKey === 'address' ? input.closest('.cust-field')?.querySelector('.addr-suggest button') : null;
      if (pick) { e.preventDefault(); pick.click(); return; }
      saveFieldEdit(fieldKey, fieldLabel, input, valEl, btnEl);
    }
    if (e.key === 'Escape') cancelFieldEdit(fieldKey, input, valEl, btnEl);
  };
  if (fieldKey === 'address') bindAddressSuggest(input, valEl, btnEl);
}

async function saveFieldEdit(fieldKey, fieldLabel, inputEl, valEl, btnEl) {
  const newVal = inputEl.value.trim();
  if (!currentContact?.id) { cancelFieldEdit(fieldKey, inputEl, valEl, btnEl); return; }
  try {
    const updateData = {};
    if (fieldKey === 'plz') updateData.plz = newVal;
    else if (fieldKey === 'city') updateData.city = newVal;
    else if (fieldKey === 'address') {
      updateData.address = newVal;
      if (currentContact._addrCity) updateData.city = currentContact._addrCity;
    }
    else if (fieldKey === 'phone2') updateData.phone2 = newVal;
    else if (fieldKey === 'notes') updateData.notes = newVal;
    else {
      const extra = { ...(currentContact.extra && typeof currentContact.extra === 'object' ? currentContact.extra : {}) };
      extra[fieldKey] = newVal;
      updateData.extra = extra;
      currentContact.extra = extra;
    }
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify(updateData)
    });
    currentContact[fieldKey] = newVal;
    if (fieldKey === 'address' && currentContact._addrCity) {
      currentContact.city = currentContact._addrCity;
      delete currentContact._addrCity;
      const cityVal = document.getElementById('cval-city');
      if (cityVal && cityVal.style.display !== 'none') cityVal.textContent = currentContact.city;
    }
    if (fieldKey === 'notes' && typeof syncDialerNotes === 'function') syncDialerNotes(newVal, 'top');
    valEl.textContent = newVal || '—';
    if (typeof qcSyncTwin === 'function') qcSyncTwin(fieldKey, newVal, 'top');
    if (fieldKey === 'address' && currentContact.city && typeof qcSyncTwin === 'function') qcSyncTwin('city', currentContact.city, 'top');
    clearAddressSuggest(inputEl.closest('.cust-field'));
    inputEl.remove(); valEl.style.display = '';
    btnEl.innerHTML = '<i class="ph ph-pencil-simple" style="font-size:14px;"></i>';
    btnEl.title = 'Düzenle'; btnEl.style.color = 'var(--text-3)'; btnEl.style.opacity = '.6';
    btnEl.onclick = () => startFieldEdit(fieldKey, fieldLabel, btnEl);
    toast(uqSay('dial.field_saved', '{label} güncellendi', { label: fieldLabel }), 'ok', 1500);
  } catch(e) {
    if (currentContact) delete currentContact._addrCity;
    toast('Güncelleme hatası: ' + e.message, 'err');
    cancelFieldEdit(fieldKey, inputEl, valEl, btnEl);
  }
}

function clearAddressSuggest(box) {
  if (box) box.style.zIndex = '';
  box?.querySelector('.addr-suggest')?.remove();
}

let _addrSuggestTimer = 0;
let _addrSuggestGen = 0;

function bindAddressSuggest(input, valEl, btnEl) {
  const ph = typeof t === 'function' ? t('dial.addr.ph') : '';
  input.placeholder = ph && ph !== 'dial.addr.ph' ? ph : 'Sokak ve kapı no — yanlış yazsan da bulur';
  input.addEventListener('input', () => {
    clearTimeout(_addrSuggestTimer);
    const box = input.closest('.cust-field');
    if (input.value.trim().length < 3) { clearAddressSuggest(box); return; }
    _addrSuggestTimer = setTimeout(() => paintAddressSuggest(input, valEl, btnEl), 280);
  });
}

function addrEsc(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value ?? '') : String(value ?? '');
}

async function paintAddressSuggest(input, valEl, btnEl) {
  const box = input.closest('.cust-field');
  if (!box || !input.isConnected) return;
  const gen = ++_addrSuggestGen;
  const typed = input.value.trim();
  let rows = [];
  try {
    rows = typeof searchTomTomAddresses === 'function'
      ? await searchTomTomAddresses(typed, { plz: currentContact?.plz, city: currentContact?.city })
      : [];
  } catch (_) { rows = []; }
  if (gen !== _addrSuggestGen || !input.isConnected) return;
  clearAddressSuggest(box);
  const list = document.createElement('div');
  list.className = 'addr-suggest';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = typeof t === 'function' && t('dial.addr.empty') !== 'dial.addr.empty' ? t('dial.addr.empty') : 'Adres bulunamadı';
    list.appendChild(empty);
  } else {
    rows.forEach((row) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${addrEsc(row.line)}</span><span class="sub">${addrEsc([row.plz, row.city].filter(Boolean).join(' '))}</span>`;
      b.onmousedown = (ev) => ev.preventDefault();
      b.onclick = () => applyDialerAddressSuggestion(row, input, valEl, btnEl);
      list.appendChild(b);
    });
  }
  box.style.zIndex = '6';
  box.appendChild(list);
}

async function applyDialerAddressSuggestion(row, input, valEl, btnEl) {
  if (!row?.line || !input?.isConnected) return;
  input.value = row.line;
  const cityNow = String(currentContact?.city || '').trim();
  if (!cityNow && row.city) currentContact._addrCity = row.city;
  else if (currentContact) delete currentContact._addrCity;
  const label = typeof t === 'function' ? t('uq.field.address') : 'Adres';
  await saveFieldEdit('address', label && label !== 'uq.field.address' ? label : 'Adres', input, valEl, btnEl);
}

function cancelFieldEdit(fieldKey, inputEl, valEl, btnEl) {
  const kept = valEl?.textContent === '—' ? '' : (valEl?.textContent || '');
  if (typeof qcSyncTwin === 'function') qcSyncTwin(fieldKey, kept, 'top', { domOnly: true });
  clearAddressSuggest(inputEl.closest('.cust-field'));
  inputEl.remove(); valEl.style.display = '';
  btnEl.innerHTML = '<i class="ph ph-pencil-simple" style="font-size:14px;"></i>';
  btnEl.title = 'Düzenle'; btnEl.style.color = 'var(--text-3)'; btnEl.style.opacity = '.6';
  btnEl.onclick = () => startFieldEdit(fieldKey, '', btnEl);
}

let _prevCallGen = 0;
async function showPrevCallInfo(contact) {
  const gen = ++_prevCallGen;
  const el = document.getElementById('prev-call-info');
  const body = document.getElementById('prev-call-body');
  if (!el || !body) return;
  el.style.display = 'none';
  body.innerHTML = '';
  if (!contact?.id || (contact.attempt_count || 0) < 1) return;
  try {
    const logs = await sb(`call_logs?contact_id=eq.${contact.id}&order=started_at.desc&limit=10&select=id,outcome,notes,started_at,duration_sec,recording_url,agent_id,users(name)`);
    if (gen !== _prevCallGen) return;
    if (!logs?.length) { el.style.display = 'none'; return; }
    const prev = logs[0];
    const recLog = logs.find((l) => String(l?.recording_url || '').trim());
    const dt = new Date(prev.started_at).toLocaleString('tr-TR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const outcomeMap = {appointment:'Randevu',negative:'Olumsuz',callback:'Geri Ara',no_answer:'Cevap Yok',dnc:'Kara Liste',stuck:'Tıkanık',unused:'Kullanım dışı'};
    const rawAgent = prev?.users?.name || '';
    const own = !!currentUser?.id && prev?.agent_id === currentUser.id;
    const agentLabel = own
      ? `Sen${rawAgent ? ` · ${rawAgent}` : ''}`
      : (rawAgent || '—');
    body.innerHTML = `
<div class="prev-call-row">
  <div class="prev-call-main">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span style="font-weight:700;">${outcomeMap[prev.outcome]||prev.outcome}</span>
      <span style="color:var(--text-3);">${dt}</span>
      <span style="color:var(--text-3);">(${uqSay('dial.attempt', '{n}. arama', { n: contact.attempt_count || 1 })})</span>
      <span class="prev-call-agent"><i class="ph ph-user-circle"></i> ${agentLabel}</span>
    </div>
    ${(() => { const nt = _stripSimCallMarker(prev.notes); return nt ? '<div style="margin-top:4px;color:var(--text-2);">"' + _escHtml(nt) + '"</div>' : ''; })()}
  </div>
  ${recLog?.recording_url && typeof mbRecPlayerHtml === 'function' ? `
  <div class="prev-call-audio-wrap">
    <span class="prev-call-audio-lbl">Ses kaydı</span>
    ${mbRecPlayerHtml(recLog.id, recLog.recording_url, typeof _logDurationSec === 'function' ? _logDurationSec(recLog) : recLog.duration_sec, typeof mbRecMeta === 'function' ? mbRecMeta(recLog, contact) : null)}
  </div>` : (_isFakeRecordingRow(prev) ? `
  <div class="prev-call-audio-wrap">
    <span class="prev-call-audio-lbl">Test kaydı</span>
    ${_fakeRecordingMarkup(prev, 'prev')}
  </div>` : '')}
</div>`;
    el.style.display = '';
  } catch(e) { el.style.display = 'none'; }
}

function mbFillScript(text, contact) {
  const c = contact || {};
  const camp = (typeof campaigns !== 'undefined' && Array.isArray(campaigns))
    ? campaigns.find((x) => String(x.id) === String(c.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : '')))
    : null;
  let out = String(text || '');
  const tokens = typeof mbScriptTokens === 'function' ? mbScriptTokens(camp) : [];
  tokens.sort((a, b) => b.token.length - a.token.length);
  tokens.forEach((v) => {
    const value = typeof mbContactFieldText === 'function' ? mbContactFieldText(c, v.key) : '';
    out = out.split(v.token).join(value);
  });
  const legacy = {
    Ad: c.first_name || '',
    Soyad: c.last_name || '',
    Vorname: c.first_name || '',
    Nachname: c.last_name || '',
    PLZ: c.plz || '',
    Şehir: c.city || '',
    Ort: c.city || '',
    Telefon: c.phone || '',
    Adres: c.address || '',
  };
  return out.replace(/\[(Ad|Soyad|Vorname|Nachname|PLZ|Şehir|Ort|Telefon|Adres)\]/g, (_, key) => legacy[key] ?? '');
}

function mbScriptOpen() {
  try { return localStorage.getItem('mb-script-open') !== '0'; } catch (e) { return true; }
}

function mbApplyScriptOpen(open) {
  const body = document.getElementById('camp-script-body');
  const chev = document.getElementById('camp-script-chev');
  const btn = document.getElementById('camp-script-toggle');
  if (body) body.style.display = open ? '' : 'none';
  if (chev) chev.style.transform = open ? '' : 'rotate(-90deg)';
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleCampScript() {
  const open = !mbScriptOpen();
  try { localStorage.setItem('mb-script-open', open ? '1' : '0'); } catch (e) {}
  mbApplyScriptOpen(open);
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbRulesOpen() {
  try { return localStorage.getItem('mb-rules-open') !== '0'; } catch (e) { return true; }
}

function mbApplyRulesOpen(open) {
  const body = document.getElementById('camp-rules-body-dial');
  const chev = document.getElementById('camp-rules-chev');
  const btn = document.getElementById('camp-rules-toggle');
  if (body) body.style.display = open ? '' : 'none';
  if (chev) chev.style.transform = open ? '' : 'rotate(-90deg)';
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleCampRules() {
  const open = !mbRulesOpen();
  try { localStorage.setItem('mb-rules-open', open ? '1' : '0'); } catch (e) {}
  mbApplyRulesOpen(open);
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function showCampRules(contact) {
  const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => c.id === (contact?.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : null)));
  const rules = String((typeof getCampSettings === 'function' ? getCampSettings(camp || {}) : {})?.rules || '').trim();
  const el = document.getElementById('camp-rules-box');
  if (!el) return;
  if (!rules) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const open = mbRulesOpen();
  el.style.display = '';
  el.innerHTML = `<button type="button" id="camp-rules-toggle" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleCampRules()" style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;background:transparent;border:none;padding:0;cursor:pointer;color:var(--accent);font-size:11px;font-weight:800;">
<span>${esc(typeof uqSay === 'function' ? uqSay('dial.rules', 'Kurallar') : 'Kurallar')}</span>
<i id="camp-rules-chev" class="ph ph-caret-down" style="font-size:14px;transition:transform .15s;${open ? '' : 'transform:rotate(-90deg);'}"></i>
</button>
<div id="camp-rules-body-dial" style="font-size:12px;color:var(--text);white-space:pre-wrap;max-height:120px;overflow-y:auto;margin-top:6px;${open ? '' : 'display:none;'}">${esc(rules)}</div>`;
}

function showCampScript(contact) {
  const camp = campaigns.find(c => c.id === (contact?.campaign_id || selectedCampId));
  const settings = getCampSettings(camp||{});
  const el = document.getElementById('camp-script-box');
  if (!el) return;
  if (settings.script_enabled && settings.script) {
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
    const open = mbScriptOpen();
    el.style.display = '';
    el.innerHTML = `<button type="button" id="camp-script-toggle" aria-expanded="${open ? 'true' : 'false'}" onclick="toggleCampScript()" style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;background:transparent;border:none;padding:0;cursor:pointer;color:var(--accent);font-size:11px;font-weight:800;">
<span>${esc(uqSay('dial.script', 'Konuşma metni'))}</span>
<i id="camp-script-chev" class="ph ph-caret-down" style="font-size:14px;transition:transform .15s;${open ? '' : 'transform:rotate(-90deg);'}"></i>
</button>
<div id="camp-script-body" style="font-size:12px;color:var(--text);white-space:pre-wrap;max-height:120px;overflow-y:auto;margin-top:6px;${open ? '' : 'display:none;'}">${esc(mbFillScript(settings.script, contact))}</div>`;
  } else {
    el.style.display = 'none';
  }
  if (typeof showCampRules === 'function') showCampRules(contact);
}

function showCampScript2(contact) { showCampScript(contact); }

// ── Contact Drawer ─────────────────────────────
let _cdrContactId = null;
let _cdrContact   = null;
let _cdrTab = 'info';
let _cdrLogs = [];

async function openContactDrawer(contactId) {
  if (!contactId) return;
  _cdrContactId = contactId;
  _cdrTab = 'info';
  // Show drawer immediately with loading state
  const overlay = document.getElementById('contact-drawer-overlay');
  const drawer  = document.getElementById('contact-drawer');
  if (!overlay || !drawer) return;
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.getElementById('cdr-av').textContent = '…';
  document.getElementById('cdr-name').textContent = 'Yükleniyor…';
  document.getElementById('cdr-phone').textContent = '';
  document.getElementById('cdr-fields-grid').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  document.getElementById('cdr-history-list').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  document.getElementById('cdr-recordings-list').innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Yükleniyor...</div>';
  // Reset tabs
  setCdrTab('info');
  try {
    const [contacts, logs] = await Promise.all([
      sb(`contacts?id=eq.${contactId}&select=*,queues(name,status),campaigns:campaign_id(name)`),
      sb(`call_logs?contact_id=eq.${contactId}&select=*,users(name),campaigns:campaign_id(name)&order=started_at.desc&limit=50`)
    ]);
    const c = Array.isArray(contacts) ? contacts[0] : contacts;
    _cdrLogs = Array.isArray(logs) ? logs : [];
    _cdrContact = c || null;
    if (!c) { toast('Kişi bulunamadı','warn'); closeContactDrawer(); return; }
    const fullName = `${c.first_name||''} ${c.last_name||''}`.trim() || c.phone || '?';
    document.getElementById('cdr-av').textContent = (fullName.charAt(0)||'?').toUpperCase();
    document.getElementById('cdr-name').textContent = fullName;
    document.getElementById('cdr-phone').textContent = c.phone || '—';
    // Info tab
    const statusMap = {pending:'Bekliyor',no_answer:'Cevap Yok',callback:'Geri Ara',negative:'Olumsuz',appointment:'Randevu',dnc:'Kara Liste',done:'Tamamlandı',stuck:'Tıkanık',unused:'Kullanım dışı'};
    const fields = [
      {l:'Telefon',    v:c.phone,      mono:true, copy:true},
      {l:'2. Tel',     v:c.phone2,     mono:true, copy:true},
      {l:'Ad Soyad',   v:fullName},
      {l:'PLZ',        v:c.plz,        mono:true},
      {l:'Şehir',      v:c.city},
      {l:'Adres',      v:c.address},
      {l:'Kampanya',   v:c.campaigns?.name || c.campaign_id?.slice(0,8)},
      {l:'Kuyruk',     v:c.queues?.name},
      {l:'Durum',      v:statusMap[c.status]||c.status},
      {l:'Deneme',     v:c.attempt_count ? `${c.attempt_count}. arama` : '—'},
      {l:'Geri Ara',   v:c.callback_at ? new Date(c.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : null},
      {l:'Not',        v:c.notes},
    ].filter(f => f.v);
    document.getElementById('cdr-fields-grid').innerHTML = fields.map(f => `
<div class="cdr-field">
  <div class="cdr-field-label">${f.l}</div>
  <div class="cdr-field-val${f.mono?' mono':''}"
    ${f.copy?`style="cursor:pointer;" onclick="copyToClipboard('${(f.v||'').replace(/'/g,"\\'")}','${f.l} kopyalandı')" title="Kopyala"`:''}
  >${f.v}</div>
</div>`).join('');
    // History tab
    _renderCdrHistory();
    // Recordings tab
    _renderCdrRecordings();
    // Show call button for agents and qc users
    const footer = document.getElementById('cdr-footer');
    if (footer) {
      const canCall = ['agent','qc'].includes(currentUser?.role);
      footer.style.display = canCall ? '' : 'none';
      const btn = document.getElementById('cdr-call-btn');
      if (btn) btn.setAttribute('data-phone', c.phone||'');
    }
  } catch(e) {
    toast('Drawer yüklenemedi: ' + e.message, 'err');
    closeContactDrawer();
  }
}

async function openDialerForContact(contactId) {
  if (!contactId) return;
  try {
    const rows = await sb(`contacts?id=eq.${contactId}&select=*`);
    const c = rows?.[0];
    if (!c) { toast('Kişi bulunamadı', 'warn'); return; }
    currentContact = c;
    navigate('dialer');
    setTimeout(() => {
      if (typeof showCustomerCard === 'function') showCustomerCard(c);
      if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
      if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
      if (typeof switchContactTab === 'function') switchContactTab('info');
      setTimeout(() => {
        if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
        if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
      }, 220);
      setTimeout(() => {
        if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
        if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
      }, 650);
    }, 120);
  } catch (e) {
    toast('Dialer açılırken hata: ' + e.message, 'err');
  }
}

function _renderCdrHistory() {
  const el = document.getElementById('cdr-history-list');
  if (!el) return;
  if (!_cdrLogs.length) {
    el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Arama geçmişi yok</div>';
    return;
  }
  const OM = {appointment:'Randevu',appointment_done:'Randevu',negative:'Olumsuz',callback:'Geri Ara',no_answer:'Cevap Yok',voicemail:'Telesekreter',dnc:'Kara Liste',stuck:'Tıkanık',unused:'Kullanım dışı'};
  const colorMap = {appointment:'var(--green)',appointment_done:'var(--green)',negative:'var(--red)',callback:'var(--yellow)',no_answer:'var(--text-3)',dnc:'var(--red)',voicemail:'var(--text-3)',stuck:'var(--text-3)',unused:'var(--text-3)'};
  el.innerHTML = _cdrLogs.map(l => {
    const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    const sec = _logDurationSec(l);
    const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
    const named = typeof mbOutcomeShown === 'function' ? mbOutcomeShown(l.outcome, l.campaigns, l.campaign_id) : '';
    const oc = named || OM[l.outcome] || l.outcome || '—';
    const oc_color = colorMap[l.outcome] || 'var(--text-3)';
    const camp = typeof mbCampShown === 'function' ? mbCampShown(l.campaigns, l.campaign_id) : (l.campaigns?.name || '—');
    const ocSafe = typeof _escHtml === 'function' ? _escHtml(oc) : oc;
    const campSafe = typeof _escHtml === 'function' ? _escHtml(camp) : camp;
    const agent = l.users?.name || '—';
    return `<div class="cdr-log-row">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
  <div style="font-size:11px;font-family:var(--mono);color:var(--text-2);">${dt}</div>
  <span style="font-size:11px;font-weight:700;color:${oc_color};background:${oc_color}18;padding:2px 8px;border-radius:10px;">${ocSafe}</span>
</div>
<div style="display:flex;gap:12px;font-size:11px;color:var(--text-3);">
  <span><i class="ph ph-user" style="vertical-align:-2px;"></i> ${agent}</span>
  <span><i class="ph ph-megaphone-simple" style="vertical-align:-2px;"></i> ${campSafe}</span>
  <span><i class="ph ph-clock" style="vertical-align:-2px;"></i> ${dur}</span>
</div>
${(() => { const nt = _stripSimCallMarker(l.notes); return nt ? '<div style="margin-top:4px;font-size:11px;color:var(--text-2);font-style:italic;">"' + _escHtml(nt) + '"</div>' : ''; })()}
${l.recording_url && typeof mbRecPlayerHtml === 'function' ? `<div style="margin-top:6px;">${mbRecPlayerHtml(l.id, l.recording_url, typeof _logDurationSec === 'function' ? _logDurationSec(l) : l.duration_sec, typeof mbRecMeta === 'function' ? mbRecMeta(l, _cdrContact) : null)}</div>` : (_isFakeRecordingRow(l) ? _fakeRecordingMarkup(l, 'cdrhist') : '')}
</div>`;
  }).join('');
}

function _renderCdrRecordings() {
  const el = document.getElementById('cdr-recordings-list');
  if (!el) return;
  const recs = _cdrLogs.filter(l => l.recording_url || _isFakeRecordingRow(l));
  if (!recs.length) {
    el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;font-size:12px;">Ses kaydı yok</div>';
    return;
  }
  el.innerHTML = recs.map(l => {
    const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    const sec = _logDurationSec(l);
    const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
    return `<div class="cdr-log-row">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
  <span style="font-size:11px;color:var(--text-2);font-family:var(--mono);">${dt}</span>
  <span style="font-size:11px;color:var(--text-3);">${dur}</span>
</div>
${l.recording_url && typeof mbRecPlayerHtml === 'function'
  ? mbRecPlayerHtml(l.id, l.recording_url, typeof _logDurationSec === 'function' ? _logDurationSec(l) : l.duration_sec, typeof mbRecMeta === 'function' ? mbRecMeta(l, _cdrContact) : null)
  : _fakeRecordingMarkup(l, 'cdrrec')}
</div>`;
  }).join('');
}

function setCdrTab(tab) {
  _cdrTab = tab;
  ['info','history','recordings'].forEach(t => {
    const btn   = document.getElementById('cdr-tab-' + t);
    const panel = document.getElementById('cdr-panel-' + t);
    if (btn)   btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
}

function closeContactDrawer() {
  document.getElementById('contact-drawer-overlay')?.classList.remove('open');
  document.getElementById('contact-drawer')?.classList.remove('open');
  _cdrContactId = null;
}

function drawerCallContact() {
  const c = _cdrContact;
  if (!c?.phone) { toast('Telefon numarası yok', 'warn'); return; }
  closeContactDrawer();
  // Set as current contact and open dialer
  currentContact = c;
  navigate('dialer');
  // Small delay to let dialer UI render
  setTimeout(() => {
    if (typeof showCustomerCard === 'function') showCustomerCard(c);
    if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
    if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
    setTimeout(() => {
      if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
      if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
    }, 220);
    setTimeout(() => {
      if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
      if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
    }, 650);
    if (typeof switchContactTab === 'function') switchContactTab('info');
  }, 150);
}

let _contactMap = null;
let _contactMapMarker = null;
let _contactMapMeasureMode = false;
let _contactMapMeasurePath = [];
let _contactMapMeasurePolyline = null;
let _contactMapMeasurePolygon = null;
let _contactMapMeasureInfo = null;
let _contactMapMeasureClickListener = null;
let _contactMapMeasureType = 'distance';

function _fmtMeters(m) {
  const n = Number(m || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(2)} km`;
  return `${Math.round(n)} m`;
}

function _fmtAreaM2(m2) {
  const n = Math.max(0, Number(m2) || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)} km²`;
  if (n >= 10000) return `${Math.round(n).toLocaleString('tr-TR')} m²`;
  return `${n.toFixed(1)} m²`;
}

function _haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat() - a.lat());
  const dLng = toRad(b.lng() - a.lng());
  const la1 = toRad(a.lat());
  const la2 = toRad(b.lat());
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function _measureTotalMeters(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (window.google?.maps?.geometry?.spherical?.computeDistanceBetween) {
      total += google.maps.geometry.spherical.computeDistanceBetween(a, b);
    } else {
      total += _haversineMeters(a, b);
    }
  }
  return total;
}

function _measureAreaM2(path) {
  if (!Array.isArray(path) || path.length < 3) return 0;
  if (window.google?.maps?.geometry?.spherical?.computeArea) {
    return google.maps.geometry.spherical.computeArea(path);
  }
  return 0;
}

function _contactMapResetMeasure() {
  _contactMapMeasurePath = [];
  if (_contactMapMeasurePolyline) {
    _contactMapMeasurePolyline.setMap(null);
    _contactMapMeasurePolyline = null;
  }
  if (_contactMapMeasurePolygon) {
    _contactMapMeasurePolygon.setMap(null);
    _contactMapMeasurePolygon = null;
  }
  if (_contactMapMeasureInfo) {
    _contactMapMeasureInfo.close();
    _contactMapMeasureInfo = null;
  }
}

function _contactMapRenderMeasure() {
  if (!_contactMap) return;
  if (_contactMapMeasureType === 'area') {
    if (_contactMapMeasurePolyline) {
      _contactMapMeasurePolyline.setMap(null);
      _contactMapMeasurePolyline = null;
    }
    if (!_contactMapMeasurePolygon) {
      _contactMapMeasurePolygon = new google.maps.Polygon({
        map: _contactMap,
        paths: [],
        strokeColor: '#f59e0b',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        clickable: false,
      });
    }
    _contactMapMeasurePolygon.setPath(_contactMapMeasurePath);
    if (_contactMapMeasurePath.length < 3) return;
    const area = _measureAreaM2(_contactMapMeasurePath);
    const last = _contactMapMeasurePath[_contactMapMeasurePath.length - 1];
    if (!_contactMapMeasureInfo) _contactMapMeasureInfo = new google.maps.InfoWindow();
    _contactMapMeasureInfo.setContent(`<div style="font-size:12px;font-weight:700;">Alan: ${_fmtAreaM2(area)}</div>`);
    _contactMapMeasureInfo.setPosition(last);
    _contactMapMeasureInfo.open({ map: _contactMap });
    return;
  }
  if (_contactMapMeasurePolygon) {
    _contactMapMeasurePolygon.setMap(null);
    _contactMapMeasurePolygon = null;
  }
  if (!_contactMapMeasurePolyline) {
    _contactMapMeasurePolyline = new google.maps.Polyline({
      map: _contactMap,
      path: [],
      strokeColor: '#ef4444',
      strokeOpacity: 0.95,
      strokeWeight: 3,
      clickable: false,
    });
  }
  _contactMapMeasurePolyline.setPath(_contactMapMeasurePath);
  if (_contactMapMeasurePath.length < 2) return;
  const total = _measureTotalMeters(_contactMapMeasurePath);
  const last = _contactMapMeasurePath[_contactMapMeasurePath.length - 1];
  if (!_contactMapMeasureInfo) _contactMapMeasureInfo = new google.maps.InfoWindow();
  _contactMapMeasureInfo.setContent(`<div style="font-size:12px;font-weight:700;">Mesafe: ${_fmtMeters(total)}</div>`);
  _contactMapMeasureInfo.setPosition(last);
  _contactMapMeasureInfo.open({ map: _contactMap });
}

function _setContactMapMeasureMode(on) {
  _contactMapMeasureMode = !!on;
  if (!_contactMap) return;
  if (_contactMapMeasureClickListener) {
    google.maps.event.removeListener(_contactMapMeasureClickListener);
    _contactMapMeasureClickListener = null;
  }
  if (_contactMapMeasureMode) {
    _contactMapMeasureClickListener = _contactMap.addListener('click', (ev) => {
      _contactMapMeasurePath.push(ev.latLng);
      _contactMapRenderMeasure();
    });
  }
}

function _setContactMapMeasureType(type) {
  _contactMapMeasureType = type === 'area' ? 'area' : 'distance';
  _contactMapResetMeasure();
}

function _ensureContactMapScript(apiKey) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__contactMapScriptPromise) return window.__contactMapScriptPromise;
  window.__contactMapScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps yüklenemedi'));
    document.head.appendChild(s);
  });
  return window.__contactMapScriptPromise;
}

function _buildContactMapToolbar(container) {
  const existing = document.getElementById('contact-map-toolbar');
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.id = 'contact-map-toolbar';
  bar.style.cssText = 'position:absolute;bottom:12px;left:10px;z-index:8;display:flex;gap:6px;flex-wrap:wrap;';
  const btnStyle = 'background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;color:var(--text);';
  bar.innerHTML = `
    <button id="cm-btn-dist" type="button" style="${btnStyle}">Mesafe</button>
    <button id="cm-btn-area" type="button" style="${btnStyle}">Alan (m²)</button>
    <button id="cm-btn-clear" type="button" style="${btnStyle}">Temizle</button>
  `;
  container.appendChild(bar);
  const btnDist = document.getElementById('cm-btn-dist');
  const btnArea = document.getElementById('cm-btn-area');
  const btnClear = document.getElementById('cm-btn-clear');
  const refreshMeasureUi = () => {
    if (btnDist) {
      btnDist.style.background = _contactMapMeasureMode && _contactMapMeasureType === 'distance' ? 'var(--accent-soft)' : 'var(--bg-2)';
      btnDist.style.borderColor = _contactMapMeasureMode && _contactMapMeasureType === 'distance' ? 'var(--accent)' : 'var(--border)';
    }
    if (btnArea) {
      btnArea.style.background = _contactMapMeasureMode && _contactMapMeasureType === 'area' ? 'var(--accent-soft)' : 'var(--bg-2)';
      btnArea.style.borderColor = _contactMapMeasureMode && _contactMapMeasureType === 'area' ? 'var(--accent)' : 'var(--border)';
    }
  };
  if (btnDist) {
    btnDist.onclick = () => {
      _setContactMapMeasureType('distance');
      _setContactMapMeasureMode(!_contactMapMeasureMode);
      refreshMeasureUi();
    };
  }
  if (btnArea) {
    btnArea.onclick = () => {
      _setContactMapMeasureType('area');
      _setContactMapMeasureMode(!_contactMapMeasureMode);
      refreshMeasureUi();
    };
  }
  if (btnClear) btnClear.onclick = () => _contactMapResetMeasure();
  refreshMeasureUi();
}

async function showContactMap(address, plz, city) {
  const container = document.getElementById('contact-map-container');
  if (!container) return;
  const key = _googleApiKey || localStorage.getItem('mb_google_key') || '';
  if (!key) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12px;">Google Maps API anahtarı gerekli<br><small>Ayarlar → Google API Key</small></div>';
    return;
  }
  try {
    await _ensureContactMapScript(key);
  } catch (e) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px;">${escapeHtml(e?.message || 'Map error')}</div>`;
    return;
  }
  container.innerHTML = '<div id="contact-map-canvas"></div>';
  _buildContactMapToolbar(container);
  const mapEl = document.getElementById('contact-map-canvas');
  if (!mapEl) return;
  const mapOpts = {
    center: { lat: 52.52, lng: 13.405 },
    zoom: 17,
    mapTypeId: 'satellite',
    streetViewControl: true, // Pegman
    fullscreenControl: true,
    rotateControl: true,
    gestureHandling: 'greedy', // Ctrl zorunlu olmasın
    tilt: 67.5,
    heading: 35,
    headingInteractionEnabled: true,
    tiltInteractionEnabled: true,
  };
  _contactMap = new google.maps.Map(mapEl, mapOpts);
  _contactMap.setOptions({ minZoom: 3, maxZoom: 22 });
  _setContactMapMeasureMode(false);
  _contactMapResetMeasure();
  const q = `${address || ''} ${plz || ''} ${city || ''} Germany`.trim();
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: q }, (results, status) => {
    if (status === 'OK' && results?.[0]?.geometry?.location) {
      const loc = results[0].geometry.location;
      _contactMap.setCenter(loc);
      _contactMap.setZoom(20);
      if (_contactMapMarker) _contactMapMarker.setMap(null);
      _contactMapMarker = new google.maps.Marker({ map: _contactMap, position: loc, title: q || 'Konum' });
    }
    mbFitContactMap();
  });
  mbFitContactMap();
}

function mbFitContactMap() {
  const map = _contactMap;
  if (!map || !window.google?.maps?.event) return;
  requestAnimationFrame(() => {
    google.maps.event.trigger(map, 'resize');
  });
}
