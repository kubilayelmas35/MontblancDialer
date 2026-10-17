// Çağrı, aktarma ve hat — dialer.js ile aynı global kapsam
// ── Çağrı Aktarma (Transfer) ──────────────────

let _xferRealtimeSub = null;

async function _startTransferSubscription() {
  if (_xferRealtimeSub || !currentUser?.id) return;
  const client = typeof getSupabaseClient === 'function' ? await getSupabaseClient() : null;
  if (!client) return;
  _xferRealtimeSub = client
    .channel(`transfer-inbox-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pending_transfers', filter: `to_agent_id=eq.${currentUser.id}` },
      (payload) => { if (payload.new) _consumeIncomingTransfer(payload.new); }
    )
    .subscribe();
}

async function _stopTransferSubscription() {
  if (!_xferRealtimeSub) return;
  try {
    const client = typeof getSupabaseClient === 'function' ? await getSupabaseClient() : null;
    if (client) await client.removeChannel(_xferRealtimeSub);
  } catch (_) {}
  _xferRealtimeSub = null;
}

function _consumeIncomingTransfer(row) {
  if (dialerStatus !== 'ready' || _fakeCallActive || _inboundTestRingOpen) return;
  if (Date.now() - new Date(row.created_at).getTime() > 180000) return;

  const phone = row.contact_phone || '';
  const contactName = row.contact_name || phone;
  const fromAgent = row.from_agent_name || '—';
  const parts = contactName.split(/\s+/);

  const contact = {
    id: `xfer-${row.id}`,
    phone,
    first_name: parts[0] || (typeof t === 'function' ? t('dial.contact_transfer') : 'Transfer'),
    last_name: parts.slice(1).join(' ') || '',
    firm_id: currentUser.firm_id,
    campaign_id: selectedCampId || campaigns?.[0]?.id || null,
    status: 'pending',
    attempt_count: 0,
    is_inbound_test: true,
    _testScenario: 'forwarded',
    _testFromAgentName: fromAgent,
  };

  sb(`pending_transfers?id=eq.${row.id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ status: 'accepted' }),
  }).catch(() => {});

  void beginInboundTestCall({
    phone,
    displayName: contactName,
    contact,
    routeDetail: typeof tReplace === 'function' ? tReplace('dial.route_from', { name: fromAgent }) : `Aktaran: ${fromAgent}`,
    isExternalInbound: false,
  });
}

async function openTransferModal() {
  if (dialerStatus !== 'on_call') return;
  const fid = currentUser?.firm_id;
  if (!fid) return;

  const list = document.getElementById('transfer-agent-list');
  if (list) list.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${escapeHtml(typeof t === 'function' ? t('dial.transfer_loading') : '…')}</div>`;
  openModal('m-transfer');

  const rows = await sb(
    `agent_sessions?firm_id=eq.${fid}&status=eq.ready&select=agent_id,agent_name&order=agent_name.asc`
  ).catch(() => []);
  const agents = (rows || []).filter(a => a.agent_id !== currentUser.id);

  if (!list) return;
  if (!agents.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${escapeHtml(typeof t === 'function' ? t('dial.transfer_no_agents') : '')}</div>`;
    return;
  }
  list.innerHTML = agents.map(a => `
<button class="transfer-agent-btn" onclick="executeTransfer('${escapeHtml(a.agent_id)}','${escapeHtml(a.agent_name || a.agent_id)}')">
  <div class="transfer-agent-avatar">${escapeHtml((a.agent_name || '?').charAt(0).toUpperCase())}</div>
  <div class="transfer-agent-name">${escapeHtml(a.agent_name || a.agent_id)}</div>
  <span class="transfer-agent-badge">${escapeHtml(typeof t === 'function' ? t('dial.transfer_ready_badge') : 'Hazır')}</span>
</button>`).join('');
}

async function executeTransfer(toAgentId, toAgentName) {
  closeModal('m-transfer');
  const fid   = currentUser?.firm_id;
  const phone = currentContact?.phone || '';
  const name  = `${currentContact?.first_name || ''} ${currentContact?.last_name || ''}`.trim();
  try {
    await sb('pending_transfers', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: fid,
        from_agent_id: currentUser.id,
        from_agent_name: currentUser.name,
        to_agent_id: toAgentId,
        contact_phone: phone,
        contact_name: name,
        status: 'pending',
      }),
    });
    toast(typeof tReplace === 'function' ? tReplace('dial.transfer_toast', { name: toAgentName }) : '', 'ok', 3000);
    setTimeout(() => hangup(), 800);
  } catch (e) {
    toast((typeof t === 'function' ? t('dial.transfer_err') : 'Aktarma hatası: ') + e.message, 'err');
  }
}

function _hideInboundExternalFluidCue() {
  if (_inboundExternalCueTimer) {
    clearTimeout(_inboundExternalCueTimer);
    _inboundExternalCueTimer = null;
  }
  const custEmpty = document.getElementById('cust-empty');
  const cue = document.getElementById('cust-empty-inbound-cue');
  custEmpty?.classList.remove('cust-empty--inbound-external');
  if (cue) cue.style.display = 'none';
}

function _hasLiveCallInProgress() {
  return dialerStatus === 'on_call' && (!!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending);
}

function toggleUnfinalizedCallsPanel() {
  if (_hasLiveCallInProgress()) {
    toast(typeof t === 'function' ? t('dial.close_active_first') : 'Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  _unfinalizedCallsOpen = !_unfinalizedCallsOpen;
  const list = document.getElementById('unfinalized-calls-list');
  const btn = document.getElementById('unfinalized-calls-toggle');
  if (list) list.style.display = _unfinalizedCallsOpen ? 'flex' : 'none';
  if (btn) btn.textContent = _unfinalizedCallsOpen ? 'Kapat' : 'Aç';
  if (_unfinalizedCallsOpen) void loadUnfinalizedCalls();
}

async function loadUnfinalizedCalls() {
  const el = document.getElementById('unfinalized-calls-list');
  const btn = document.getElementById('unfinalized-calls-toggle');
  if (!el || !currentUser) return;
  try {
    const role = currentUser?.role || '';
    const adminLike = ['admin', 'firm_admin', 'super_admin', 'qc'].includes(role);
    let campIds = [];
    if (adminLike) {
      campIds = (campaigns || []).map((c) => c.id).filter(Boolean);
    } else {
      const rows = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id`).catch(() => []);
      campIds = (rows || []).map((r) => r.campaign_id).filter(Boolean);
    }
    if (!campIds.length) {
      el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:8px;">Kampanya yok</div>';
      return;
    }
    const query = `contacts?campaign_id=in.(${campIds.join(',')})&status=eq.calling&select=id,first_name,last_name,phone,last_called_at,attempt_count,campaign_id&order=last_called_at.desc&limit=25`;
    const rows = await sb(query).catch(() => []);
    const setBtnText = (count) => {
      if (!btn) return;
      const base = _unfinalizedCallsOpen ? 'Kapat' : 'Aç';
      btn.textContent = count > 0 ? `${base} (${count})` : base;
    };
    if (!rows?.length) {
      setBtnText(0);
      el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:8px;">Sonuçsuz çağrı yok</div>';
      return;
    }
    setBtnText(rows.length);
    el.innerHTML = rows.map((r) => {
      const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.phone || '—';
      const dt = r.last_called_at ? new Date(r.last_called_at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      const camp = campaigns.find((c) => c.id === r.campaign_id)?.name || '—';
      return `<button type="button" onclick="openUnfinalizedCall('${r.id}')" style="text-align:left;padding:6px 8px;border:1px solid var(--border);background:var(--bg-3);border-radius:6px;cursor:pointer;">
<div style="font-weight:700;font-size:11px;color:var(--text);">${name}</div>
<div style="font-size:10px;color:var(--text-3);">${r.phone || '—'} · ${camp}</div>
<div style="font-size:10px;color:var(--yellow);margin-top:2px;">${dt} · ${r.attempt_count || 0}. deneme</div>
</button>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:8px;">Yüklenemedi</div>';
  }
}

async function openUnfinalizedCall(contactId) {
  if (_hasLiveCallInProgress()) {
    toast(typeof t === 'function' ? t('dial.close_active_first') : 'Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  if (!contactId) return;
  try {
    const rows = await sb(`contacts?id=eq.${contactId}&select=*,queues(name,status)&limit=1`);
    const c = rows?.[0];
    if (!c) return;
    currentContact = c;
    if (c.campaign_id) {
      const camp = campaigns.find((x) => x.id === c.campaign_id);
      selectCamp(c.campaign_id, camp?.name || '', { skipActivate: true });
    }
    if (typeof showCustomerCard === 'function') showCustomerCard(c);
    if (typeof switchContactTab === 'function') switchContactTab('outcome');
    setDialerStatus('wrapping');
    toast(typeof t === 'function' ? t('dial.wrap_loaded') : 'Sonuçsuz çağrı yüklendi', 'warn', 2200);
  } catch (e) {}
}

async function toggleReady() {
  refreshDialerHealthPanel();
  if (dialerStatus==='offline' || dialerStatus==='break') {
    if (!selectedCampId) { toast(typeof t === 'function' ? t('dial.pick_camp_first') : 'Önce kampanya seçin', 'err'); return; }
    if (!telnyxReady && !_testMode) { toast(typeof t === 'function' ? t('dial.line_preparing') : '...', 'err'); return; }
    setDialerStatus('ready');
    try {
      await sb('agent_sessions',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
        body:JSON.stringify({agent_id:currentUser.id,agent_name:currentUser.name,firm_id:currentUser.firm_id,status:'ready',last_seen:new Date().toISOString()})
      });
    } catch(e){}
    setTimeout(()=>dialNext(), 500);
  } else if (dialerStatus==='ready') {
    setDialerStatus('offline');
    try {
      await sb(`agent_sessions?agent_id=eq.${currentUser.id}`,{method:'PATCH',prefer:'return=minimal',body:JSON.stringify({status:'offline'})});
    } catch(e){}
  }
}

function refreshBreakCustEmpty() {
  if (dialerStatus !== 'break') return;
  const root = document.getElementById('cust-empty');
  if (!root) return;
  const title = root.querySelector('.cust-empty-text');
  const sub = root.querySelector('.cust-empty-sub');
  if (!title || !sub) return;
  const code = auxDisplay(String(_breakCode || '').trim());
  title.textContent = code
    ? (typeof tReplace === 'function' ? tReplace('dial.break_title_with', { code }) : `Mola — ${code}`)
    : (typeof t === 'function' ? t('dial.break_title_none') : 'Mola — tür seçilmedi');
  if (!_breakStartedAt) {
    sub.textContent = typeof t === 'function' ? t('ui.dash') : '—';
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - _breakStartedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  sub.textContent = `${mm}:${ss}`;
  refreshStatusElapsed();
}

function _formatElapsed(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const mm = String(Math.floor(n / 60)).padStart(2, '0');
  const ss = String(n % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function refreshStatusElapsed() {
  const el = document.getElementById('status-elapsed');
  if (!el) return;
  if (dialerStatus === 'on_call') {
    el.style.display = '';
    el.textContent = _formatElapsed(callSeconds);
    return;
  }
  if (dialerStatus === 'break' && _breakStartedAt) {
    const sec = Math.max(0, Math.floor((Date.now() - _breakStartedAt) / 1000));
    el.style.display = '';
    el.textContent = _formatElapsed(sec);
    return;
  }
  el.style.display = 'none';
}

function _clearHangupUiTick() {
  if (_hangupUiTick) {
    clearInterval(_hangupUiTick);
    _hangupUiTick = null;
  }
}

function refreshHangupFinalizeButton() {
  if (document.getElementById('call-actions')?.classList.contains('call-actions--pre-call')) return;
  if (dialerStatus !== 'on_call') return;
  const lbl = document.getElementById('btn-hangup-label');
  const btn = document.getElementById('btn-hangup');
  if (!lbl || !btn) return;
  const lineUp = !!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = 'pointer';
  btn.onclick = hangup;
  if (lineUp) {
    lbl.textContent = typeof t === 'function' ? t('dial.hangup_close') : 'Kapat';
    btn.style.color = 'var(--red)';
    btn.title = '';
  } else {
    lbl.textContent = typeof t === 'function' ? t('dial.hangup_finish') : 'Bitir';
    btn.style.color = 'var(--accent)';
    btn.title = typeof t === 'function' ? t('dial.hangup_finish_title') : '';
  }
}

function _startHangupUiTick() {
  _clearHangupUiTick();
  refreshHangupFinalizeButton();
  _hangupUiTick = setInterval(refreshHangupFinalizeButton, 400);
}

/** Müşteri kartı açıkken (offline/ready) alt çubukta Hazır/sağlık yerine Ara/Mikrofon/Beklet/Sonuçlandır */
function _isCustDataVisible() {
  const custEmpty = document.getElementById('cust-empty');
  return !!(custEmpty && custEmpty.style.display === 'none');
}

function refreshPreCallToolbarUi() {
  const lbl = document.getElementById('btn-hangup-label');
  const btn = document.getElementById('btn-hangup');
  if (lbl) lbl.textContent = typeof t === 'function' ? t('dial.pre_outcome') : 'Sonuçlandır';
  if (btn) {
    btn.style.color = 'var(--accent)';
    btn.onclick = () => {
      if (typeof switchContactTab === 'function') switchContactTab('outcome');
    };
  }
  const hold = document.getElementById('btn-hold');
  if (hold) hold.disabled = true;
}

/** Müşteri kartı açıkken (ön arama) alt çubuğu Ara modunda tut — initDialer gecikmeli boyamalarda da kullanılır */
function forceDialerPreCallBar() {
  if (!(dialerStatus === 'offline' || dialerStatus === 'ready' || dialerStatus === 'calling')) return;
  const readySec = document.getElementById('ready-section');
  const callAct = document.getElementById('call-actions');
  if (readySec) readySec.style.display = 'none';
  if (callAct) {
    callAct.style.display = '';
    callAct.classList.add('call-actions--pre-call');
    callAct.classList.remove('call-actions--wrapping');
  }
  refreshPreCallToolbarUi();
  paintCallActionButtons();
}

/** Numara ile ara / WV vb. ön aramadan çık: boş hazır kartına dön (sayfa yenilemeden) */
function returnToDialerHub() {
  if (dialerStatus === 'on_call' || dialerStatus === 'wrapping' || _fakeCallActive || _outboundDialPending) {
    toast(typeof t === 'function' ? t('dial.close_active_first') : 'Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  currentContact = null;
  window._manualDialLastResults = null;
  closeManualDialDrawer();
  clearCustomerCard();
  if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel();
  toast(typeof t === 'function' ? t('dial.hub_return') : 'Dialer hazır ekranına dönüldü', 'ok', 2400);
}

function _callLineIsLive() {
  return dialerStatus === 'on_call' || (dialerStatus === 'calling' && (_outboundDialPending || _telnyxCall || _fakeCallActive));
}

function paintCallActionButtons() {
  const redial = document.getElementById('btn-redial');
  if (redial) {
    const live = _callLineIsLive();
    redial.disabled = live;
    redial.classList.toggle('is-passive', live);
    redial.classList.toggle('is-go', !live);
    redial.setAttribute('aria-disabled', live ? 'true' : 'false');
  }
  const mute = document.getElementById('btn-mute');
  if (!mute) return;
  const off = !!isMuted;
  mute.classList.toggle('is-muted', off);
  mute.classList.toggle('active', off);
  mute.setAttribute('aria-pressed', off ? 'true' : 'false');
  const icon = mute.querySelector('i.ph');
  if (icon) icon.className = off ? 'ph ph-microphone-slash' : 'ph ph-microphone';
  const span = mute.querySelector('span');
  const label = off
    ? (typeof t === 'function' ? t('dial.mic_btn_off') : 'Kapalı')
    : (typeof t === 'function' ? t('dial.mic_chip') : 'Mikrofon');
  if (span) {
    span.textContent = label;
    if (off) {
      span.setAttribute('data-tr', 'Kapalı');
      span.setAttribute('data-de', 'Stumm');
    } else {
      span.setAttribute('data-tr', 'Mikrofon');
      span.setAttribute('data-de', 'Mikrofon');
    }
  }
  mute.title = off
    ? (typeof t === 'function' ? t('dial.mic_off') : 'Mikrofon kapatıldı')
    : (typeof t === 'function' ? t('dial.mic_chip') : 'Mikrofon');
}

function syncDialerBottomChrome() {
  const readySec = document.getElementById('ready-section');
  const callAct = document.getElementById('call-actions');
  const hold = document.getElementById('btn-hold');

  const resetHold = () => {
    if (hold) hold.disabled = false;
  };

  const outboundRing = dialerStatus === 'calling' && (_outboundDialPending || _telnyxCall || _fakeCallActive);
  if (dialerStatus === 'on_call' || dialerStatus === 'wrapping' || outboundRing) {
    if (callAct) callAct.classList.remove('call-actions--pre-call');
    if (outboundRing) {
      if (readySec) readySec.style.display = 'none';
      if (callAct) {
        callAct.style.display = '';
        callAct.classList.remove('call-actions--wrapping');
      }
    }
    if (dialerStatus === 'on_call' || outboundRing) resetHold();
    if (typeof mbApplyCampWarning === 'function') mbApplyCampWarning();
    paintCallActionButtons();
    return;
  }

  const preCall =
    (dialerStatus === 'offline' || dialerStatus === 'ready' || dialerStatus === 'calling') &&
    !!currentContact &&
    _isCustDataVisible();

  if (preCall) {
    if (readySec) readySec.style.display = 'none';
    if (callAct) {
      callAct.style.display = '';
      callAct.classList.add('call-actions--pre-call');
      callAct.classList.remove('call-actions--wrapping');
    }
    refreshPreCallToolbarUi();
    _clearHangupUiTick();
    if (typeof mbApplyCampWarning === 'function') mbApplyCampWarning();
    paintCallActionButtons();
    return;
  }

  if (callAct) {
    callAct.classList.remove('call-actions--pre-call');
    callAct.style.display = 'none';
  }
  resetHold();

  if (readySec && (dialerStatus === 'offline' || dialerStatus === 'ready' || dialerStatus === 'break')) {
    readySec.style.display = '';
  }
  if (typeof mbApplyCampWarning === 'function') mbApplyCampWarning();
  paintCallActionButtons();
}

function setDialerStatus(s) {
  const prev = dialerStatus;
  dialerStatus = s;
  if (s === 'ready' && prev !== 'ready') {
    _readyEnteredAt = Date.now();
    _custEmptyIdleSince = null;
    _startTransferSubscription().catch(() => {});
  } else if (s !== 'ready') {
    _readyEnteredAt = null;
  }
  if (s === 'offline' && prev !== 'offline') {
    _custEmptyIdleSince = Date.now();
  }
  updateDialerNavCallIndicator();
  if (s === 'on_call' && prev !== 'on_call' && typeof mbPlayCue === 'function') mbPlayCue('connect');
  if (s === 'wrapping' && (prev === 'on_call' || prev === 'calling') && typeof mbPlayCue === 'function') mbPlayCue('hangup');
  const dot    = document.getElementById('status-dot');
  const label  = document.getElementById('status-label');
  const rdyBtn = document.getElementById('btn-ready');
  const rdyTxt = document.getElementById('ready-text');
  const rdyIc  = document.getElementById('ready-icon');
  if (dot) { dot.className = `status-dot ${s}`; }
  const labels = {
    offline: () => (typeof t === 'function' ? t('dial.status.offline') : 'offline'),
    ready: () => (typeof t === 'function' ? t('dial.status.ready_wait') : 'ready'),
    calling: () => (typeof t === 'function' ? t('dial.status.calling') : 'calling'),
    on_call: () => (typeof t === 'function' ? t('dial.status.on_call') : 'on_call'),
    wrapping: () => (typeof t === 'function' ? t('dial.status.wrapping') : 'wrapping'),
    break: () => (typeof t === 'function' ? t('dial.status.break') : 'break'),
  };
  if (label) {
    const fn = labels[s];
    label.textContent = typeof fn === 'function' ? fn() : s;
  }
  refreshStatusElapsed();
  const callAct = document.getElementById('call-actions');
  if (callAct) callAct.classList.remove('call-actions--wrapping');

  const xferBtnHide = document.getElementById('btn-transfer');
  if (xferBtnHide && s !== 'on_call') xferBtnHide.style.display = 'none';

  if (s==='offline'||s==='break') {
    if (rdyBtn) rdyBtn.className='btn-ready-big ready';
    if (rdyIc) rdyIc.textContent='▶';
    if (rdyTxt) {
      const rs = typeof tPair === 'function' ? tPair('dial.ready_start') : { tr: 'Hazır — Aramayı Başlat', de: 'Bereit — Start' };
      rdyTxt.setAttribute('data-tr', rs.tr);
      rdyTxt.setAttribute('data-de', rs.de);
      rdyTxt.textContent =
        typeof currentLang !== 'undefined' && currentLang === 'de'
          ? (typeof t === 'function' ? t('dial.ready_start_de_btn') : 'Bereit schalten')
          : (typeof t === 'function' ? t('dial.ready_start') : 'Hazır — Aramayı Başlat');
    }
    document.getElementById('ready-section').style.display='';
    if (callAct) callAct.style.display='none';
    document.getElementById('customer-card').style.display='';
    _clearHangupUiTick();
  } else if (s==='ready') {
    if (rdyBtn) rdyBtn.className='btn-ready-big stop';
    if (rdyIc) rdyIc.textContent='⏹';
    if (rdyTxt) {
      const stp = typeof tPair === 'function' ? tPair('dial.stop') : { tr: 'Durdur', de: 'Stoppen' };
      rdyTxt.setAttribute('data-tr', stp.tr);
      rdyTxt.setAttribute('data-de', stp.de);
      rdyTxt.textContent = typeof currentLang !== 'undefined' && currentLang === 'de' ? stp.de : stp.tr;
    }
    document.getElementById('ready-section').style.display='';
    if (callAct) callAct.style.display='none';
    document.getElementById('customer-card').style.display='';
    _clearHangupUiTick();
  } else if (s==='calling') {
    document.getElementById('ready-section').style.display='none';
    if (callAct) {
      callAct.style.display='';
      callAct.classList.remove('call-actions--pre-call', 'call-actions--wrapping');
    }
    document.getElementById('customer-card').style.display='';
    _startHangupUiTick();
  } else if (s==='on_call') {
    document.getElementById('ready-section').style.display='none';
    if (callAct) {
      callAct.style.display='';
      callAct.classList.remove('call-actions--wrapping');
    }
    const xferBtn = document.getElementById('btn-transfer');
    if (xferBtn) xferBtn.style.display = '';
    const tblk = document.getElementById('dialer-timer-block');
    if (tblk) tblk.style.display = 'flex';
    document.getElementById('customer-card').style.display='';
    startCallTimer();
    _startHangupUiTick();
    _applyMicSensitivityToLiveCall();
    _startMicThresholdGate();
  } else if (s==='wrapping') {
    const keepWrap = prev === 'on_call';
    const keptOutcome = keepWrap ? selectedOutcome : null;
    const noteEl = document.getElementById('outcome-note');
    const keptNote = keepWrap && noteEl ? noteEl.value : '';
    const dncEl = document.getElementById('outcome-dnc');
    const keptDnc = !!(keepWrap && dncEl?.checked);
    const cbDt = document.getElementById('callback-dt');
    const keptCb = keepWrap && cbDt ? cbDt.value : '';
    if (typeof startAcwTimer === 'function') startAcwTimer();
    document.getElementById('ready-section').style.display='none';
    if (callAct) {
      callAct.style.display='';
      callAct.classList.add('call-actions--wrapping');
    }
    stopCallTimer();
    _clearHangupUiTick();
    if (!keepWrap) {
      selectedOutcome = null;
      document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
      const cbRow2 = document.getElementById('callback-time-row');
      if (cbRow2) cbRow2.style.display = 'none';
      if (cbDt) cbDt.value = '';
      if (noteEl) noteEl.value = '';
      if (dncEl) dncEl.checked = false;
    }
    const hasSlot = _bookingSlot || window._selectedBookingSlot;
    document.getElementById('customer-card').style.display='';
    if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
    if (typeof switchContactTab === 'function') {
      switchContactTab(hasSlot ? 'info' : 'outcome');
    }
    if (keepWrap) {
      if (keptOutcome && typeof setOutcome === 'function') setOutcome(keptOutcome);
      const noteAgain = document.getElementById('outcome-note');
      if (noteAgain) noteAgain.value = keptNote;
      const dncAgain = document.getElementById('outcome-dnc');
      if (dncAgain) dncAgain.checked = keptDnc;
      const cbAgain = document.getElementById('callback-dt');
      if (cbAgain && keptCb) cbAgain.value = keptCb;
    }
    _stopMicThresholdGate();
  }

  if (prev === 'break' && s !== 'break') {
    _breakStartedAt = null;
    _breakCode = null;
    if (_breakCardTick) {
      clearInterval(_breakCardTick);
      _breakCardTick = null;
    }
    if (typeof applyLang === 'function') applyLang();
  } else if (s === 'break' && prev !== 'break') {
    _breakStartedAt = Date.now();
    _breakCode = null;
    if (_breakCardTick) clearInterval(_breakCardTick);
    _breakCardTick = setInterval(refreshBreakCustEmpty, 1000);
  }
  if (s === 'break') refreshBreakCustEmpty();
  if (s !== 'on_call' && s !== 'wrapping') _stopMicThresholdGate();
  syncDialerBottomChrome();
  if ((s === 'ready' || s === 'offline') && currentContact) {
    forceDialerPreCallBar();
  }
  if (s === 'ready' || s === 'break' || s === 'offline') {
    startCustEmptyMascotLoops();
  } else {
    _stopCustEmptyMascotTimers();
    _custEmptyIdleSince = null;
    document.getElementById('cust-empty')?.classList.remove(
      'cust-empty--mascot-bored',
      'cust-empty--mascot-angry',
      'cust-empty--break',
      'cust-empty--mascot-eat',
      'cust-empty--mascot-drink',
      'cust-empty--mascot-yawn',
      'cust-empty--mascot-stretch',
      'cust-empty--mascot-celebrate'
    );
  }
  syncGlobalMascotMoodFromCustEmpty();
  if (s === 'on_call') _lastMascotCheerSec = -1;
  if (s !== 'on_call') document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', '0');
  syncCustomerCardEmptyVisual();
  syncGlobalMascotDock();
}

function updateDialerNavCallIndicator() {
  const onCall = dialerStatus === 'on_call' || !!_fakeCallActive;
  document.getElementById('nav-dialer-btn')?.classList.toggle('dialer-calling', onCall);
}

function showOutboundWait() {
  const card = document.getElementById('customer-card');
  const root = document.getElementById('cust-empty');
  const def = document.getElementById('cust-empty-default');
  const data = document.getElementById('cust-data');
  const panel = document.getElementById('cust-empty-outbound-wait');
  const inc = document.getElementById('cust-empty-incoming-panel');
  if (card) {
    card.style.display = '';
    card.classList.add('customer-card--empty');
  }
  if (data) data.style.display = 'none';
  if (root) {
    root.style.display = 'none';
    root.classList.add('cust-empty--outbound-wait');
    root.classList.remove('cust-empty--ringing');
  }
  if (def) def.style.display = 'none';
  if (inc) {
    inc.style.display = 'none';
    inc.setAttribute('aria-hidden', 'true');
  }
  if (panel) {
    panel.style.display = 'flex';
    panel.setAttribute('aria-hidden', 'false');
  }
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
}

function hideOutboundWait() {
  const root = document.getElementById('cust-empty');
  const def = document.getElementById('cust-empty-default');
  const panel = document.getElementById('cust-empty-outbound-wait');
  if (root) root.classList.remove('cust-empty--outbound-wait');
  if (panel) {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
  }
  if (def && root && !root.classList.contains('cust-empty--ringing')) def.style.display = '';
}

function mbCampaignDialSpeed(campId) {
  const camp = (campaigns || []).find((c) => String(c.id) === String(campId));
  const n = parseInt(camp?.dial_speed, 10);
  if (!n || n < 1) return 1;
  return Math.min(10, n);
}

function mbDialSpeed() {
  return mbCampaignDialSpeed(selectedCampId);
}

function mbSharedDialSpeed(speed, openCount) {
  const s = Math.min(10, Math.max(1, Number(speed) || 1));
  const n = Math.max(1, Number(openCount) || 1);
  return Math.max(1, Math.floor(s / n));
}

function mbPoolPlan(ready, speed, ringing) {
  const r = Math.max(0, Number(ready) || 0);
  const s = Math.min(10, Math.max(1, Number(speed) || 1));
  const ring = Math.max(0, Number(ringing) || 0);
  const target = r * s;
  return {
    ready: r,
    speed: s,
    ringing: ring,
    target,
    dial: Math.max(0, target - ring),
    drop: Math.max(0, ring - target),
  };
}

function mbRefreshHopperUi() {
  const ringing = _hopper.filter((r) => r.phase === 'dialing' || r.phase === 'ringing').length;
  const title = document.querySelector('#cust-empty-outbound-wait .cust-outbound-wait__title');
  const sub = document.querySelector('#cust-empty-outbound-wait .cust-outbound-wait__sub');
  const plan = _poolPlan;
  if (title && dialerStatus === 'calling') {
    title.textContent = ringing > 0
      ? (typeof tReplace === 'function' ? tReplace('dial.hopper.ringing', { n: ringing }) : `Havuz: ${ringing} kişi aranıyor`)
      : (typeof t === 'function' ? t('dial.wait_answer') : 'Telefonun açılması bekleniyor');
  }
  if (sub && dialerStatus === 'calling') {
    if (plan && plan.multi) {
      sub.textContent = typeof tReplace === 'function'
        ? tReplace('dial.hopper.ratio_multi', { ready: plan.ready, open: plan.open, target: plan.target })
        : `Hazır ${plan.ready} · hız ${plan.open} kampanyaya bölünür · hedef ${plan.target}`;
    } else if (plan) {
      sub.textContent = typeof tReplace === 'function'
        ? tReplace('dial.hopper.ratio', { ready: plan.ready, speed: plan.speed, target: plan.target })
        : `Hazır ${plan.ready} × hız ${plan.speed} = ${plan.target}`;
    } else {
      sub.textContent = typeof t === 'function' ? t('dial.wait_answer_sub') : '';
    }
  }
  let note = document.getElementById('hopper-hold-note');
  const host = document.querySelector('#cust-data .cust-badge-row');
  if (!note && host) {
    note = document.createElement('span');
    note.id = 'hopper-hold-note';
    note.className = 'badge badge-gray';
    host.appendChild(note);
  }
  if (note) {
    const parts = [];
    if (ringing && dialerStatus === 'on_call') parts.push(typeof tReplace === 'function' ? tReplace('dial.hopper.ringing', { n: ringing }) : `${ringing} kişi aranıyor`);
    note.style.display = parts.length ? '' : 'none';
    note.textContent = parts.join(' · ');
  }
}

function mbRefillHopper() {
  mbSyncPool();
}

function mbSelfWaiting() {
  return (dialerStatus === 'ready' || dialerStatus === 'calling') && !_liveCallId;
}

async function mbCountReadyAgents() {
  if (typeof window.__mbPoolReady === 'number') return Math.max(0, window.__mbPoolReady);
  const selfWaiting = mbSelfWaiting();
  const ids = new Set();
  const fid = currentUser?.firm_id;
  if (fid && typeof sb === 'function') {
    const since = new Date(Date.now() - 90000).toISOString();
    const rows = await sb(
      `agent_sessions?firm_id=eq.${fid}&status=eq.ready&last_seen=gte.${encodeURIComponent(since)}&select=agent_id&limit=200`
    ).catch(() => []);
    (rows || []).forEach((r) => { if (r?.agent_id) ids.add(r.agent_id); });
  }
  if (currentUser?.id) {
    if (selfWaiting) ids.add(currentUser.id);
    else ids.delete(currentUser.id);
  } else if (selfWaiting && !ids.size) {
    ids.add('self');
  }
  if (selfWaiting && currentUser?.id && typeof sb === 'function') {
    sb(`agent_sessions?agent_id=eq.${currentUser.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ last_seen: new Date().toISOString() }),
    }).catch(() => {});
  }
  return ids.size;
}

async function mbRemoteRingingByCampaign(campIds) {
  const counts = {};
  (campIds || []).forEach((id) => { counts[String(id)] = 0; });
  if (typeof window.__mbPoolRemoteRinging === 'number') {
    const first = (campIds || [])[0];
    if (first) counts[String(first)] = Math.max(0, window.__mbPoolRemoteRinging);
    return counts;
  }
  if (!campIds?.length || typeof sb !== 'function') return counts;
  const since = new Date(Date.now() - 90000).toISOString();
  const filter = campIds.map((id) => encodeURIComponent(id)).join(',');
  const rows = await sb(
    `contacts?status=eq.calling&campaign_id=in.(${filter})&last_called_at=gte.${encodeURIComponent(since)}&select=id,campaign_id&limit=500`
  ).catch(() => []);
  const mine = new Set(_hopper.map((r) => r.contact?.id).filter(Boolean));
  (rows || []).forEach((r) => {
    if (!r?.id || mine.has(r.id)) return;
    const key = String(r.campaign_id || '');
    if (!key || counts[key] == null) return;
    counts[key] += 1;
  });
  return counts;
}

async function mbNextPoolContact(campIds) {
  if (Array.isArray(window.__mbPoolQueue)) {
    return window.__mbPoolQueue.shift() || null;
  }
  for (let i = 0; i < 4; i++) {
    const contact = await getNextContact(campIds);
    if (!contact) return null;
    if (_hopper.some((r) => r.contact?.id === contact.id)) return null;
    if ((_hopperSkip.get(String(contact.id)) || 0) > Date.now()) return null;
    if (typeof isValidUUID === 'function' && isValidUUID(contact.id) && typeof sb === 'function') {
      const updated = await sb(
        `contacts?id=eq.${contact.id}&status=in.(pending,no_answer,callback)`,
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: JSON.stringify({
            status: 'calling',
            locked_by: currentUser?.id || null,
            last_called_at: new Date().toISOString(),
          }),
        }
      ).catch(() => null);
      if (!updated || !updated.length) continue;
      return { ...contact, ...updated[0] };
    }
    return contact;
  }
  return null;
}

async function mbPlacePoolCall(contact) {
  const own = (campaigns || []).find((c) => String(c.id) === String(contact?.campaign_id));
  const selected = (campaigns || []).find((c) => String(c.id) === String(selectedCampId));
  const campaign = own || selected;
  const caller = campaign?.telnyx_did || '';
  if (!_liveCallId) {
    _outboundAnswered = false;
    _voicemailAutoLogged = false;
    if (dialerStatus === 'ready') {
      setDialerStatus('calling');
      showOutboundWait();
    }
  }
  if (_testMode || window.__mbPoolSimulate) {
    if (typeof mbSimOutbound === 'function') mbSimOutbound(contact, 900);
    return;
  }
  sendToRTC('MB_CALL', { destination: contact.phone, callerNumber: caller, contact });
}

function mbEnsurePoolTimer() {
  if (_poolTimer) return;
  _poolTimer = setInterval(() => {
    if (dialerStatus === 'offline' || dialerStatus === 'break') {
      clearInterval(_poolTimer);
      _poolTimer = null;
      return;
    }
    mbSyncPool();
  }, 2000);
}

async function mbSyncPool() {
  if (_poolSyncing) return;
  if (dialerStatus === 'offline' || dialerStatus === 'break' || dialerStatus === 'wrapping') return;
  if (!_autoDial && dialerStatus !== 'calling' && dialerStatus !== 'ready' && dialerStatus !== 'on_call' && dialerStatus !== 'wrapping') return;
  const campIds = typeof getAutoDialCampaignIds === 'function' ? getAutoDialCampaignIds() : [];
  const ids = campIds;
  if (!ids.length) {
    if (dialerStatus === 'ready' || dialerStatus === 'calling') {
      mbWarnNoActiveCampaign();
      if (dialerStatus === 'ready' && !_liveCallId && !_fakeCallActive && !_telnyxCall) {
        setDialerStatus('offline');
        updateSessionInDB('offline');
      }
    }
    return;
  }
  _poolSyncing = true;
  try {
    const ready = await mbCountReadyAgents();
    const remoteMap = await mbRemoteRingingByCampaign(ids);
    const ringingLocal = (cid) => _hopper.filter((r) => (r.phase === 'dialing' || r.phase === 'ringing') && String(r.contact?.campaign_id || '') === String(cid));
    const openCount = ids.length;
    const plans = ids.map((cid) => {
      const local = ringingLocal(cid);
      const remote = remoteMap[String(cid)] || 0;
      const plan = mbPoolPlan(ready, mbSharedDialSpeed(mbCampaignDialSpeed(cid), openCount), local.length + remote);
      plan.campId = cid;
      plan.local = local;
      return plan;
    });
    const totalTarget = plans.reduce((sum, plan) => sum + plan.target, 0);
    _poolPlan = {
      ready,
      speed: plans.length === 1 ? plans[0].speed : null,
      open: openCount,
      target: totalTarget,
      multi: plans.length > 1,
    };
    plans.forEach((plan) => {
      if (plan.drop <= 0) return;
      plan.local.slice(-plan.drop).forEach((row) => {
        if (row.contact?.id) _hopperSkip.set(String(row.contact.id), Date.now() + 20000);
        if (row.contact && typeof mbReleaseUnanswered === 'function') mbReleaseUnanswered(row.contact, 'pending');
        _hopper = _hopper.filter((r) => r !== row);
        try { row.call.hangup(); } catch (e) {}
      });
    });
    const canDial = _testMode || window.__mbPoolSimulate || telnyxReady;
    if (canDial && plans.some((plan) => plan.dial > 0)) {
      let placed = 0;
      for (let i = 0; i < plans.length; i++) {
        const plan = plans[i];
        let left = plan.dial;
        while (left > 0) {
          if (dialerStatus === 'offline' || dialerStatus === 'break') break;
          const liveNow = ringingLocal(plan.campId).length + (remoteMap[String(plan.campId)] || 0);
          if (liveNow >= plan.target) break;
          const contact = await mbNextPoolContact([plan.campId]);
          if (!contact) break;
          await mbPlacePoolCall(contact);
          placed++;
          left--;
        }
      }
      if (!placed && !_hopper.length && !_liveCallId && dialerStatus === 'ready') {
        toast(typeof t === 'function' ? t('dial.queue_empty') : '✅ Kuyrukta numara kalmadı', 'ok');
        setDialerStatus('offline');
        updateSessionInDB('offline');
      }
    }
    mbRefreshHopperUi();
    if (dialerStatus === 'calling' || dialerStatus === 'on_call' || dialerStatus === 'ready' || dialerStatus === 'wrapping') {
      mbEnsurePoolTimer();
    }
  } finally {
    _poolSyncing = false;
  }
}

async function dialNext() {
  refreshDialerHealthPanel();
  if (_dialNextLock) return;
  if (dialerStatus !== 'ready') return;
  if (_outboundDialPending || _telnyxCall || _fakeCallActive) return;
  if (!selectedCampId || !mbCampaignIsActive(selectedCampId)) {
    mbWarnNoActiveCampaign();
    setDialerStatus('offline');
    updateSessionInDB('offline');
    return;
  }
  if (!_testMode && !checkCallAllowed()) return;

  // Test modunda Telnyx gerekmez
  if (_testMode || window.__mbPoolSimulate) {
    _dialNextLock = true;
    try { await mbSyncPool(); }
    finally { _dialNextLock = false; }
    return;
  }

  if (!telnyxReady) {
    toast(typeof t === 'function' ? t('dial.line_waiting') : 'Hat bağlantısı bekleniyor...', 'err');
    return;
  }
  _dialNextLock = true;
  try {
  await _dialNextPlaced();
  } finally {
    _dialNextLock = false;
  }
}

async function _dialNextPlaced() {
  if (dialerStatus !== 'ready' && dialerStatus !== 'calling') return;
  const autoCampIds = getAutoDialCampaignIds();
  if (!autoCampIds.length || !mbCampaignIsActive(selectedCampId)) {
    mbWarnNoActiveCampaign();
    setDialerStatus('offline');
    updateSessionInDB('offline');
    return;
  }
  await mbSyncPool();
}

function dialerHealthLabel(ok, okKey, needKey, okFb, needFb) {
  const key = ok ? okKey : needKey;
  const fb = ok ? okFb : needFb;
  return typeof t === 'function' ? t(key) : fb;
}

function dialerBusinessClock() {
  if (typeof mbBusinessNow === 'function') return mbBusinessNow();
  const now = new Date();
  return { dateStr: now.toISOString().split('T')[0], timeStr: now.toTimeString().slice(0, 8) };
}

function getDialerHealthState() {
  const checks = [];
  const push = (ok, label) => checks.push({ ok, label });
  push(!!selectedCampId, dialerHealthLabel(!!selectedCampId, 'dial.health.push.camp', 'dial.health.need.camp', 'Kampanya seçildi', 'Kampanya seçin'));
  const campActiveOk = !!selectedCampId && mbCampaignIsActive(selectedCampId);
  push(campActiveOk, dialerHealthLabel(campActiveOk, 'dial.health.push.active', 'dial.health.need.active', 'Aktif kampanya var', 'Kampanyayı aktif edin'));
  const lineOk = _testMode || !!telnyxReady;
  push(lineOk, _testMode
    ? (typeof t === 'function' ? t('dial.health.push.test') : 'Test modu aktif')
    : dialerHealthLabel(lineOk, 'dial.health.push.line', 'dial.health.need.line', 'Hat bağlantısı hazır', 'Hat bağlantısını bekleyin'));
  const clock = dialerBusinessClock();
  const callWindow = isCallAllowed(clock.dateStr, clock.timeStr).allowed;
  const hoursOk = _testMode || callWindow;
  push(hoursOk, dialerHealthLabel(hoursOk, 'dial.health.push.hours', 'dial.health.need.hours', 'Saat kısıtı uygun', 'Arama saati dışında'));
  const micOk = _testMode || (typeof micGranted === 'undefined' ? true : !!micGranted);
  push(micOk, dialerHealthLabel(micOk, 'dial.health.push.mic', 'dial.health.need.mic', 'Mikrofon izni', 'Mikrofon izni verin'));
  const firstFail = checks.find((c) => !c.ok);
  const code = firstFail
    ? !selectedCampId
      ? 'DIAL-CAMP'
      : !campActiveOk
        ? 'DIAL-ACTIVE'
        : (!_testMode && !telnyxReady)
          ? 'DIAL-SIP'
          : (!_testMode && !callWindow)
            ? 'DIAL-HOURS'
            : 'DIAL-MIC'
    : 'DIAL-OK';
  const msg = firstFail
    ? (typeof tReplace === 'function' ? tReplace('dial.health.wait', { label: firstFail.label }) : `Bekleniyor: ${firstFail.label}`)
    : (typeof t === 'function' ? t('dial.health.ok') : 'Tüm kontroller geçildi. Arama başlatılabilir.');
  return { checks, code, msg };
}

function refreshDialerHealthPanel() {
  if (typeof mbRetargetSelectedCamp === 'function') mbRetargetSelectedCamp();
  const codeEl = document.getElementById('dialer-health-code');
  const msgEl = document.getElementById('dialer-health-msg');
  const checksEl = document.getElementById('dialer-health-checks');
  if (!codeEl || !msgEl || !checksEl) return;
  const h = getDialerHealthState();
  codeEl.textContent = h.code;
  msgEl.textContent = h.msg;
  checksEl.innerHTML = h.checks
    .map((c) => `<div style="display:flex;align-items:center;gap:6px;color:${c.ok ? 'var(--green)' : 'var(--yellow)'};"><span>${c.ok ? '✓' : '•'}</span><span>${c.label}</span></div>`)
    .join('');
  const btn = document.getElementById('btn-ready');
  const txt = document.getElementById('ready-text');
  if (!btn || !txt) return;
  const ok = h.code === 'DIAL-OK';
  btn.disabled = !ok;
  btn.style.opacity = ok ? '' : '0.45';
  btn.style.cursor = ok ? 'pointer' : 'not-allowed';
  btn.title = ok ? '' : h.msg;

  if (typeof dialerStatus !== 'undefined' && dialerStatus === 'ready') {
    const whyKey =
      h.code === 'DIAL-CAMP' ? 'dial.why.camp' :
      h.code === 'DIAL-ACTIVE' ? 'dial.why.active' :
      h.code === 'DIAL-SIP' ? 'dial.why.sip_short' :
      h.code === 'DIAL-HOURS' ? 'dial.why.hours' :
      'dial.why.mic';
    const w = typeof tPair === 'function' ? tPair(whyKey) : { tr: '', de: '' };
    const st = typeof tPair === 'function' ? tPair('dial.stop') : { tr: 'Durdur', de: 'Stoppen' };
    txt.setAttribute('data-tr', ok ? st.tr : `${st.tr} (${w.tr})`);
    txt.setAttribute('data-de', ok ? st.de : `${st.de} (${w.de})`);
    txt.textContent =
      typeof currentLang !== 'undefined' && currentLang === 'de'
        ? (ok ? st.de : `${st.de} (${w.de})`)
        : (ok ? st.tr : `${st.tr} (${w.tr})`);
    mbApplyCampWarning();
    return;
  }

  const b = typeof tPair === 'function' ? tPair('dial.ready_start') : { tr: 'Hazır — Aramayı Başlat', de: 'Bereit — Start' };
  txt.setAttribute('data-tr', b.tr);
  txt.setAttribute('data-de', b.de);
  if (ok) {
    txt.textContent = typeof currentLang !== 'undefined' && currentLang === 'de' ? b.de : b.tr;
  } else {
    const whyKey =
      h.code === 'DIAL-CAMP' ? 'dial.why.camp' :
      h.code === 'DIAL-ACTIVE' ? 'dial.why.active' :
      h.code === 'DIAL-SIP' ? 'dial.why.sip_short' :
      h.code === 'DIAL-HOURS' ? 'dial.why.hours' :
      'dial.why.mic';
    const w = typeof tPair === 'function' ? tPair(whyKey) : { tr: '', de: '' };
    txt.textContent =
      typeof currentLang !== 'undefined' && currentLang === 'de'
        ? `${b.de} (${w.de})`
        : `${b.tr} (${w.tr})`;
  }
  mbApplyCampWarning();
}

async function updateSessionInDB(status, extra = {}) {
  if (!currentUser) return;
  try {
    const payload = {
      agent_id: currentUser.id, agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status, last_seen: new Date().toISOString(),
      ...extra,
    };
    // on_call dışında çağrı alanlarını temizle
    if (status !== 'on_call') {
      payload.current_contact_name  = null;
      payload.current_contact_phone = null;
      payload.telnyx_call_control_id = null;
      payload.call_started_at = null;
    }
    await upsertAgentSession(payload);
  } catch(e) {}
}
