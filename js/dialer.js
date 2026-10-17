// ─────────────────────────────────────────────
// DIALER — agent dialer, call management
// ─────────────────────────────────────────────

async function initDialer() {
  if (!currentUser) return;
  resetDialerVoiceVisuals();
  if (typeof isFeatureEnabledForCurrentFirm === 'function') {
    const canDial = await isFeatureEnabledForCurrentFirm('dialer_enabled');
    if (!canDial) {
      const list = document.getElementById('agent-camp-list');
      if (list) list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">${escapeHtml(typeof t === 'function' ? t('dial.init.feature_off') : '')}</div>`;
      refreshDialerHealthPanel();
      return;
    }
  }
  try {
    const role = currentUser?.role || '';
    const adminLike = ['admin', 'firm_admin', 'super_admin', 'qc'].includes(role);
    const firmScopeId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id;
    const firmSelWrap = document.getElementById('dialer-firm-selector');
    if (firmSelWrap) {
      if (mbIsSuperAdmin(role) && typeof renderFirmSelector === 'function') {
        renderFirmSelector('dialer-firm-selector', initDialer);
      } else {
        firmSelWrap.innerHTML = '';
      }
    }
    if (mbIsSuperAdmin(role) && !firmScopeId) {
      const list = document.getElementById('agent-camp-list');
      if (list) {
        list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">${escapeHtml(typeof t === 'function' ? t('dial.init.select_firm') : '')}</div>`;
      }
      return;
    }

    let myCamps = [];
    if (adminLike) {
      const allCamps = await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${firmScopeId}&order=created_at.desc`) || [];
      myCamps = allCamps.map(c => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
    } else {
      myCamps = await sb(`agent_campaigns?select=*,campaigns(*,queues(*))&agent_id=eq.${currentUser.id}`) || [];
    }
    const list = document.getElementById('agent-camp-list');
    if (!myCamps.length) {
      list.innerHTML=`<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">${typeof t === 'function' ? t('dial.init.no_camp_html') : ''}</div>`;
      return;
    }

    // Tüm kampanyaları varsayılan aktif yap (ilk yüklemede)
    if (!_activeCampIds.length) {
      const savedActive = _loadActiveCampIds();
      if (savedActive !== null) {
        const allowed = new Set(myCamps.map((x) => String(x.campaign_id)));
        _activeCampIds = (savedActive || []).filter((id) => allowed.has(String(id)));
      } else {
        // Daha önce hiç kayıt yoksa: seçili kampanya varsa onu aktif yap, yoksa boş kalsın
        const savedSel = _loadSelectedCampId();
        if (savedSel && myCamps.some((x) => String(x.campaign_id) === String(savedSel))) {
          _activeCampIds = [savedSel];
        } else {
          _activeCampIds = [];
        }
      }
    }

    /* Seçili kampanyayı localStorage'tan otomatik yükleme: kullanıcı tıklamadan
       selectedCampId dolmasın; aksi halde "seçmedim" denmesine rağmen çağrı başlıyordu. */

    // A-Z sırala (kampanya adı)
    myCamps = (myCamps || []).slice().sort((a, b) => {
      const an = String(a?.campaigns?.name || '').toLocaleLowerCase('tr-TR');
      const bn = String(b?.campaigns?.name || '').toLocaleLowerCase('tr-TR');
      return an.localeCompare(bn, 'tr-TR');
    });
    // Kullanıcı kampanya seçmeden hazır başlatamasın
    if (!selectedCampId) {
      const rdyBtn = document.getElementById('btn-ready');
      if (rdyBtn) {
        rdyBtn.disabled = true;
        rdyBtn.style.opacity = '';
        rdyBtn.style.cursor = '';
        rdyBtn.title = typeof t === 'function' ? t('dial.init.pick_camp_title') : '';
      }
      const notice = document.getElementById('camp-required-notice');
      if (notice) notice.style.display = 'flex';
    }
    list.innerHTML = myCamps.map(ac=>{
      const isActive = _activeCampIds.includes(ac.campaign_id);
      const camp = ac.campaigns || {};
      const campSettings = (typeof getCampSettings === 'function') ? getCampSettings(camp) : (camp?.settings || {});
      // campaign.settings.auto_dial: "agent bu kampanyada auto-dial kapatabilir mi?"
      const canDisableAutoDial = (campSettings?.auto_dial !== false);
      const enabledForMe = isAutoDialEnabledForCampaign(ac.campaign_id, canDisableAutoDial);
      const cid = ac.campaign_id;
      const cName = String(ac.campaigns?.name || cid).replace(/'/g, "\\'");
      const rulesText = String(campSettings?.rules || '').trim();
      const rulesBtn = rulesText
        ? `<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:10px;" onclick="event.stopPropagation();openCampRules('${cid}')">${typeof currentLang !== 'undefined' && currentLang === 'de' ? 'Regeln' : 'Kurallar'}</button>`
        : '';
      const adHint =
        typeof t === 'function'
          ? (canDisableAutoDial ? t('dial.camp_auto_hint_on') : t('dial.camp_auto_hint_off'))
          : '';
      const autoLbl = typeof t === 'function' ? t('dial.camp_auto_label') : 'Bu kampanyada otomatik ara';
      const toggOn = typeof t === 'function' ? t('dial.camp_toggle_on') : 'Kapat';
      const toggOff = typeof t === 'function' ? t('dial.camp_toggle_off') : 'Aktif Et';
      return `<div class="agent-camp-item ${isActive?'active':''}" id="camp-item-${cid}" style="padding:8px 10px;" onclick="selectCamp('${cid}','${cName}')">
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <div style="flex:1;min-width:0;">
    <div style="display:flex;align-items:center;gap:6px;min-width:0;">
      <div class="agent-camp-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ac.campaigns?.name||cid}</div>
      ${rulesBtn}
    </div>
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-2);cursor:pointer;opacity:1;"
        title="${escapeHtml(adHint)}">
        <input type="checkbox" ${enabledForMe ? 'checked' : ''}
          onchange="toggleCampaignAutoDialForMe('${cid}', this.checked)"
          onclick="event.stopPropagation()"
          style="width:14px;height:14px;accent-color:var(--accent);">
        ${escapeHtml(autoLbl)}
      </label>
    </div>
  </div>
  <!-- Toggle switch -->
  <label style="position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0;cursor:pointer;" title="${escapeHtml(isActive ? toggOn : toggOff)}" onclick="event.stopPropagation()">
    <input type="checkbox" ${isActive?'checked':''} onchange="toggleCampActive('${cid}',this.checked)"
      onclick="event.stopPropagation()"
      style="opacity:0;width:0;height:0;">
    <span style="position:absolute;inset:0;background:${isActive?'var(--accent)':'var(--border)'};border-radius:10px;transition:.25s;" id="camp-slider-${cid}">
      <span style="position:absolute;top:3px;left:${isActive?'19':'3'}px;width:14px;height:14px;background:#fff;border-radius:50%;transition:.25s;" id="camp-knob-${cid}"></span>
    </span>
  </label>
</div>
</div>`;
    }).join('');
    // Manuel arama / Telnyx DID vb. için global kampanya listesi (agent kampanyaları)
    campaigns = (myCamps || []).map((ac) => ac.campaigns).filter(Boolean);
    // Önceki oturumdan seçili kampanya: arama başlatmaz ama hazır/etiket/sağlık paneli doğru olsun
    (function restoreSelectedCampFromStorage() {
      const allowedIds = new Set(myCamps.map((x) => String(x.campaign_id)));
      if (selectedCampId && !allowedIds.has(String(selectedCampId))) selectedCampId = null;
      const savedSel = _loadSelectedCampId();
      let pick = null;
      if (savedSel && allowedIds.has(String(savedSel))) pick = savedSel;
      else if (!selectedCampId && _activeCampIds.length) {
        const first = _activeCampIds.find((id) => allowedIds.has(String(id)));
        if (first) pick = first;
      }
      if (pick && !selectedCampId) {
        const ac = myCamps.find((x) => String(x.campaign_id) === String(pick));
        selectCamp(pick, ac?.campaigns?.name || pick, { skipActivate: true });
      }
    })();
    // kampanya otomatik seçilmez; kullanıcı tıklamalı
    if (!myCamps.length) {
      const notice = document.getElementById('camp-required-notice');
      if (notice) notice.style.display = 'flex';
    }
  } catch(e){ console.error('initDialer err:', e); }
  refreshDialerHealthPanel();
  _dailyGoal = parseInt(localStorage.getItem('mb_daily_goal') || '5', 10);
  loadMyMiniStats();
  loadWvBadge();
  startTickerPoll();
  const goalBar = document.getElementById('daily-goal-bar');
  if (goalBar) goalBar.style.display = '';
  renderHotkeyHints();
  const hints = document.getElementById('hotkey-hints');
  if (hints) hints.style.display = '';
  refreshAutoDialUi();
  void loadFirmDialerSettingsCache().then(() => restartInboundTestSimulationScheduler());
  if (typeof dialerStatus !== 'undefined' && (dialerStatus === 'ready' || dialerStatus === 'break' || dialerStatus === 'offline')) {
    if (dialerStatus === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
    startCustEmptyMascotLoops();
  }
  if (typeof applyMascotTheme === 'function') applyMascotTheme();
  syncCustomerCardEmptyVisual();
  if (typeof syncGlobalMascotDock === 'function') {
    syncGlobalMascotDock();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => syncGlobalMascotDock());
    });
  }
  if (!_globalMascotResizeWired) {
    _globalMascotResizeWired = true;
    window.addEventListener('resize', () => {
      if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
      if (typeof positionGlobalMascotInfoPanel === 'function') positionGlobalMascotInfoPanel();
    });
  }
}

function _campIdsMatch(a, b) {
  return String(a || '') === String(b || '');
}

function mbRetargetSelectedCamp() {
  const active = (Array.isArray(_activeCampIds) ? _activeCampIds : []).filter(Boolean);
  const busy = typeof dialerStatus !== 'undefined' && (dialerStatus === 'on_call' || dialerStatus === 'calling' || dialerStatus === 'wrapping');
  if (busy) return;
  if (selectedCampId && active.some((id) => _campIdsMatch(id, selectedCampId))) return;
  if (!active.length) {
    if (selectedCampId) {
      selectedCampId = null;
      _saveSelectedCampId(null);
    }
    return;
  }
  const next = active[0];
  const camp = (campaigns || []).find((c) => _campIdsMatch(c.id, next));
  selectedCampId = next;
  _saveSelectedCampId(next);
  const lbl = document.getElementById('dialer-camp-label');
  if (lbl && camp?.name) lbl.textContent = camp.name;
}

// Kampanya aktif/pasif toggle
function toggleCampActive(campId, checked) {
  if (checked) {
    if (!_activeCampIds.some((id) => _campIdsMatch(id, campId))) _activeCampIds.push(campId);
    const camp = campaigns.find((c) => _campIdsMatch(c.id, campId));
    selectCamp(campId, camp?.name || '', { skipActivate: true });
  } else {
    _activeCampIds = _activeCampIds.filter((id) => !_campIdsMatch(id, campId));
  }
  _saveActiveCampIds(_activeCampIds);
  // Görsel güncelle
  const item   = document.getElementById(`camp-item-${campId}`);
  const slider = document.getElementById(`camp-slider-${campId}`);
  const knob   = document.getElementById(`camp-knob-${campId}`);
  if (item)   item.classList.toggle('active', checked);
  if (slider) slider.style.background = checked ? 'var(--accent)' : 'var(--border)';
  if (knob)   knob.style.left = checked ? '19px' : '3px';
  mbRetargetSelectedCamp();
  const countStr =
    _activeCampIds.length === 0
      ? (typeof t === 'function' ? t('dial.camp_active_none') : '')
      : typeof tReplace === 'function'
        ? tReplace('dial.camp_active_count', { n: _activeCampIds.length })
        : `${_activeCampIds.length} kampanya aktif`;
  toast(checked ? `✓ ${countStr}` : countStr, checked ? 'ok' : 'warn', 2000);
  refreshAutoDialUi();
  refreshDialerHealthPanel();
}

function selectCamp(id, name, opts = {}) {
  selectedCampId = id;
  _saveSelectedCampId(id);
  // İlk kez kampanya seçiliyorsa aktif listesine ekle (hepsini seçmeden)
  const skipActivate = !!opts?.skipActivate;
  if (!skipActivate && !_activeCampIds.includes(id)) {
    _activeCampIds = _activeCampIds.length ? _activeCampIds : [];
    _activeCampIds.push(id);
    _saveActiveCampIds(_activeCampIds);
  }
  const lbl = document.getElementById('dialer-camp-label');
  if (lbl) lbl.textContent = name || id;
  // Store aux codes from campaign settings
  const camp = campaigns.find(c=>c.id===id);
  if (camp?.qc_settings) {
    try {
      const qs = typeof camp.qc_settings==='string' ? JSON.parse(camp.qc_settings) : camp.qc_settings;
      if (qs.aux_codes?.length) window._campAuxCodes = qs.aux_codes;
    } catch(e){}
  }
  // Re-render camp list to reflect active state
  document.querySelectorAll('.agent-camp-item').forEach(el => {
    el.classList.toggle('active', el.querySelector('[onclick]')?.getAttribute('onclick')?.includes(id)||false);
  });
  const fakeBtn = document.getElementById('fake-call-btn');
  if (fakeBtn) fakeBtn.style.display = '';
  const btn = document.getElementById('btn-ready');
  const notice = document.getElementById('camp-required-notice');
  if (btn) {
    btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; btn.title = '';
    const txt = document.getElementById('ready-text');
    if (txt) {
      if (typeof dialerStatus !== 'undefined' && dialerStatus === 'ready') {
        txt.setAttribute('data-tr', 'Durdur');
        txt.setAttribute('data-de', 'Stoppen');
      } else {
        txt.setAttribute('data-tr', 'Hazır — Aramayı Başlat');
        txt.setAttribute('data-de', 'Bereit — Start');
      }
    }
    applyLang();
  }
  refreshAutoDialUi();
  refreshDialerHealthPanel();
}

function mbApplyCampWarning() {
  if (typeof mbRetargetSelectedCamp === 'function') mbRetargetSelectedCamp();
  const notice = document.getElementById('camp-required-notice');
  const readySec = document.getElementById('ready-section');
  const btn = document.getElementById('btn-ready');
  const span = notice?.querySelector('span[data-tr]');
  const onLive = typeof dialerStatus !== 'undefined' && (dialerStatus === 'on_call' || dialerStatus === 'wrapping' || dialerStatus === 'calling');
  const selected = !!selectedCampId;
  const active = selected && mbCampaignIsActive(selectedCampId);
  const bad = !active;
  if (span) {
    if (!selected) {
      span.setAttribute('data-tr', 'Aramaya başlamadan önce sağdan bir kampanya seçin');
      span.setAttribute('data-de', 'Wählen Sie rechts eine Kampagne bevor Sie starten');
    } else if (!active) {
      span.setAttribute('data-tr', 'Kampanya seçili ama aktif değil. Sağdaki anahtarı açın.');
      span.setAttribute('data-de', 'Kampagne ist gewählt, aber nicht aktiv. Schalter rechts einschalten.');
    }
    const de = typeof currentLang !== 'undefined' && currentLang === 'de';
    span.textContent = de ? span.getAttribute('data-de') : span.getAttribute('data-tr');
  }
  if (notice) notice.style.display = bad ? 'flex' : 'none';
  if (btn && onLive) btn.style.display = 'none';
  else if (btn) btn.style.display = '';
  if (bad && readySec && readySec.style.display === 'none') readySec.style.display = '';
}

function _selectedCampLsKey() {
  return `mb_selected_camp_${currentUser?.id || 'anon'}`;
}

function _activeCampLsKey() {
  return `mb_active_camps_${currentUser?.id || 'anon'}`;
}

function _saveSelectedCampId(campId) {
  try {
    if (!campId) localStorage.removeItem(_selectedCampLsKey());
    else localStorage.setItem(_selectedCampLsKey(), String(campId));
  } catch (e) {}
}

function _loadSelectedCampId() {
  try { return localStorage.getItem(_selectedCampLsKey()); } catch (e) { return null; }
}

function _saveActiveCampIds(ids) {
  try {
    const arr = Array.isArray(ids) ? ids : [];
    localStorage.setItem(_activeCampLsKey(), JSON.stringify(arr));
  } catch (e) {}
}

function _loadActiveCampIds() {
  try {
    const raw = localStorage.getItem(_activeCampLsKey());
    if (raw === null) return null; // hiç kayıt yok
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return null;
  }
}

async function setCampaignAutoDialPermission(campId, allowed) {
  if (!campId) return;
  const role = currentUser?.role || '';
  const adminLike = ['admin', 'firm_admin', 'super_admin', 'qc'].includes(role);
  if (!adminLike) {
    toast(typeof t === 'function' ? t('dial.admin_only_setting') : 'Bu ayarı sadece admin değiştirebilir', 'warn', 2200);
    initDialer();
    return;
  }
  try {
    const camp = campaigns.find((c) => c.id === campId) || (await sb(`campaigns?id=eq.${campId}&select=id,settings&limit=1`))?.[0];
    const existing = (typeof getCampSettings === 'function') ? getCampSettings(camp || {}) : (camp?.settings || {});
    const merged = { ...(existing || {}), auto_dial: !!allowed };
    await sb(`campaigns?id=eq.${campId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: merged })
    });
    // local cache refresh (best-effort)
    const idx = campaigns.findIndex((c) => c.id === campId);
    if (idx >= 0) campaigns[idx].settings = merged;
    toast(
      allowed
        ? (typeof t === 'function' ? t('dial.auto_perm_on') : '')
        : (typeof t === 'function' ? t('dial.auto_perm_off') : ''),
      'ok',
      2200
    );
  } catch (e) {
    toast((typeof t === 'function' ? t('dial.save_failed') : 'Kaydedilemedi: ') + e.message, 'err');
  }
  refreshAutoDialUi();
}

function isCampaignAutoDialAllowed(campId) {
  if (!campId) return false;
  const camp = campaigns.find((c) => c.id === campId);
  if (!camp) return true;
  const s = (typeof getCampSettings === 'function') ? getCampSettings(camp) : {};
  const canDisableAutoDial = (s.auto_dial !== false);
  return isAutoDialEnabledForCampaign(campId, canDisableAutoDial);
}

function getAutoDialCampaignIds() {
  const base = Array.isArray(_activeCampIds) ? _activeCampIds : [];
  return base.filter((cid) => cid && isCampaignAutoDialAllowed(cid));
}

function mbCampaignIsActive(id) {
  if (!id) return false;
  return (Array.isArray(_activeCampIds) ? _activeCampIds : []).some((cid) => _campIdsMatch(cid, id));
}

let _noActiveCampWarnAt = 0;
function mbWarnNoActiveCampaign() {
  const now = Date.now();
  if (now - _noActiveCampWarnAt < 8000) return;
  _noActiveCampWarnAt = now;
  const msg = !selectedCampId
    ? (typeof t === 'function' ? t('dial.pick_camp_first') : 'Önce kampanya seçin')
    : (typeof t === 'function' ? t('dial.camp_active_none') : 'Hiç kampanya aktif değil');
  toast(msg, 'warn', 3200);
  if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel();
}

function refreshAutoDialUi() {
  const allowedCount = getAutoDialCampaignIds().length;
  if (!allowedCount) {
    _autoDial = false;
  }
  const cb = document.getElementById('auto-dial-toggle');
  const slider = document.getElementById('auto-dial-slider');
  const knob = document.getElementById('auto-dial-knob');
  const effective = !!_autoDial && allowedCount > 0;
  if (cb) cb.checked = effective;
  if (slider) slider.style.background = effective ? 'var(--accent)' : 'var(--text-3)';
  if (knob) knob.style.transform = effective ? 'translateX(18px)' : 'translateX(0)';
}

function _autoDialLsKey() {
  return `mb_auto_dial_off_${currentUser?.id || 'anon'}`;
}

function _getAutoDialOffSet() {
  try {
    const raw = localStorage.getItem(_autoDialLsKey());
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

function _saveAutoDialOffSet(set) {
  try { localStorage.setItem(_autoDialLsKey(), JSON.stringify([...set])); } catch (e) {}
}

function isAutoDialEnabledForCampaign(campId, canDisableAutoDial) {
  // Eğer admin bu kampanyada kapatmaya izin vermiyorsa her zaman açık kabul et.
  if (!canDisableAutoDial) return true;
  const off = _getAutoDialOffSet();
  return !off.has(campId);
}

function toggleCampaignAutoDialForMe(campId, checked) {
  const camp = campaigns.find((c) => c.id === campId);
  const s = camp ? (typeof getCampSettings === 'function' ? getCampSettings(camp) : (camp.settings || {})) : {};
  const canDisableAutoDial = (s?.auto_dial !== false);
  if (!canDisableAutoDial && !checked) {
    toast(typeof t === 'function' ? t('dial.auto_disable_blocked') : 'Bu kampanyada otomatik arama kapatılamaz', 'warn', 2600);
    initDialer();
    return;
  }
  const off = _getAutoDialOffSet();
  if (!checked) off.add(campId);
  else off.delete(campId);
  _saveAutoDialOffSet(off);
  refreshAutoDialUi();
  // Arama devam ederken kapatıldıysa bir sonraki döngüde zaten filtrelenecek
}

let _perfTab = 'today';
let _goalTab = 'daily';
let _loadMiniStatsTimer = null;
let _miniStatsReq = 0;

function scheduleLoadMyMiniStats(delayMs = 0) {
  if (_loadMiniStatsTimer) clearTimeout(_loadMiniStatsTimer);
  _loadMiniStatsTimer = setTimeout(() => {
    _loadMiniStatsTimer = null;
    void loadMyMiniStats();
  }, delayMs);
}

function _syncGoalTabChromeFromPerf() {
  const goalScope = _perfTab === 'week' ? 'weekly' : _perfTab === 'month' ? 'monthly' : 'daily';
  _goalTab = goalScope;
  ['daily', 'weekly', 'monthly'].forEach((t) => {
    const b = document.getElementById(`goal-tab-${t}`);
    if (b) {
      b.style.background = t === goalScope ? 'var(--text)' : 'transparent';
      b.style.color = t === goalScope ? 'var(--bg-2)' : 'var(--text-2)';
    }
  });
  const labels = {
    daily: t('dial.goal.daily'),
    weekly: t('dial.goal.weekly'),
    monthly: t('dial.goal.monthly'),
  };
  const lbl = document.getElementById('goal-tab-label');
  if (lbl) lbl.textContent = labels[goalScope] || t('dial.goal.short');
}

function setPerfTab(tab) {
  _perfTab = tab;
  ['today','week','month'].forEach(t => {
    const b = document.getElementById(`perf-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--text)' : 'transparent'; b.style.color = t===tab ? 'var(--bg-2)' : 'var(--text-2)'; }
  });
  _syncGoalTabChromeFromPerf();
  scheduleLoadMyMiniStats(0);
}

function setGoalTab(tab) {
  // Keep goal scope aligned with selected performance period.
  const perfMap = { daily: 'today', weekly: 'week', monthly: 'month' };
  const nextPerf = perfMap[tab] || 'today';
  if (_perfTab !== nextPerf) {
    setPerfTab(nextPerf);
    return;
  }
  _syncGoalTabChromeFromPerf();
  scheduleLoadMyMiniStats(0);
}

function _dialerStatWindows() {
  const pad = (n) => String(n).padStart(2, '0');
  const today = (typeof mbBusinessNow === 'function' ? mbBusinessNow().dateStr : new Date().toISOString().slice(0, 10));
  const [y, m, d] = today.split('-').map(Number);
  const dayStart = `${today}T00:00:00`;
  const dayEnd = `${today}T23:59:59`;
  let start = dayStart;
  let end = dayEnd;
  if (_perfTab === 'week') {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() - dow + 1);
    start = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T00:00:00`;
    const sun = new Date(dt);
    sun.setUTCDate(dt.getUTCDate() + 6);
    end = `${sun.getUTCFullYear()}-${pad(sun.getUTCMonth() + 1)}-${pad(sun.getUTCDate())}T23:59:59`;
  } else if (_perfTab === 'month') {
    start = `${today.slice(0, 8)}01T00:00:00`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    end = `${today.slice(0, 8)}${pad(last)}T23:59:59`;
  }
  const monthLast = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = `${today.slice(0, 8)}01T00:00:00`;
  const monthEnd = `${today.slice(0, 8)}${pad(monthLast)}T23:59:59`;
  const wall = (stamp) => (typeof mbWallToIso === 'function' ? mbWallToIso(String(stamp).slice(0, 16)) : null);
  return {
    start,
    end,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
    callSince: wall(start) || new Date().toISOString(),
    callDaySince: wall(dayStart) || new Date().toISOString(),
    nowIso: new Date().toISOString(),
  };
}

async function _loadAgentAppointments(uid, start, end, basis) {
  const bookedStart = (typeof mbWallToIso === 'function' && mbWallToIso(String(start).slice(0, 16))) || start;
  const bookedEnd = (typeof mbWallToIso === 'function' && mbWallToIso(String(end).slice(0, 16))) || end;
  const base = `appointments?select=durum&agent_id=eq.${uid}`;
  const createdQ = `${base}&created_at=gte.${bookedStart}&created_at=lte.${bookedEnd}`;
  if (basis === 'created') return sb(createdQ).catch(() => []);
  try {
    return await sb(
      `${base}&or=(and(termin_tarih.gte.${start},termin_tarih.lte.${end}),and(created_at.gte.${bookedStart},created_at.lte.${bookedEnd}))`
    );
  } catch (e) {
    return sb(createdQ).catch(() => []);
  }
}

async function loadMyMiniStats() {
  const myReq = ++_miniStatsReq;
  try {
    const win = _dialerStatWindows();
    const since = win.start;
    const uid = currentUser?.id;

    const qCalls = sb(
      `call_logs?select=outcome&agent_id=eq.${uid}` +
      `&started_at=gte.${win.callSince}&started_at=lte.${win.nowIso}`
    );
    const periodBasis = _perfTab === 'today' ? 'created' : 'either';
    const qApDurum = _loadAgentAppointments(uid, win.start, win.end, periodBasis);
    const qMonth =
      _perfTab !== 'month'
        ? _loadAgentAppointments(uid, win.monthStart, win.monthEnd, 'either').catch(() => [])
        : Promise.resolve(null);
    const qDay =
      _perfTab !== 'today'
        ? Promise.all([
            _loadAgentAppointments(uid, win.dayStart, win.dayEnd, 'created').catch(() => []),
            sb(
              `call_logs?select=id&agent_id=eq.${uid}` +
                `&started_at=gte.${win.callDaySince}&started_at=lte.${win.nowIso}`
            ).catch(() => []),
          ])
        : Promise.resolve(null);

    const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
    const [callsRows, apRowsPerf, apMonthRows, dayBundle] = await Promise.all([
      qCalls,
      qApDurum,
      qMonth,
      qDay,
    ]);

    if (myReq !== _miniStatsReq) return;

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const resultRows = await loadFirmAppointmentResults(fid, false).catch(() => defaultAppointmentResults());

    if (myReq !== _miniStatsReq) return;

    const calls = (callsRows || []).length;
    const posOutcomes = new Set(['appointment', 'appointment_done', 'basarili', 'positive']);
    const posCalls = (callsRows || []).filter((r) => posOutcomes.has(String(r?.outcome || '').toLowerCase())).length;

    const appts = (apRowsPerf || []).length;
    let monthlyAppts = appts;
    if (_perfTab !== 'month' && apMonthRows) {
      monthlyAppts = (apMonthRows || []).length;
    }
    let todayAppts = appts;
    let todayCalls = calls;
    if (_perfTab !== 'today' && dayBundle) {
      todayAppts = (dayBundle[0] || []).length;
      todayCalls = (dayBundle[1] || []).length;
    }
    try {
      window._dialerPerfSnapshot = {
        calls,
        appts,
        posCalls,
        since,
        tab: _perfTab,
        monthlyAppts,
        todayAppts,
        todayCalls,
      };
    } catch (e) {}
    updateCustEmptyMascotScale();

    document.getElementById('my-appt').textContent = appts;
    document.getElementById('my-calls').textContent = calls;

    // Goal scope follows the selected performance period.
    const goalScope = _perfTab === 'week' ? 'weekly' : (_perfTab === 'month' ? 'monthly' : 'daily');
    _goalTab = goalScope;
    ['daily','weekly','monthly'].forEach((t) => {
      const b = document.getElementById(`goal-tab-${t}`);
      if (b) {
        b.style.background = t === goalScope ? 'var(--text)' : 'transparent';
        b.style.color = t === goalScope ? 'var(--bg-2)' : 'var(--text-2)';
      }
    });
    const labels = {
      daily: t('dial.goal.daily'),
      weekly: t('dial.goal.weekly'),
      monthly: t('dial.goal.monthly'),
    };
    const lbl = document.getElementById('goal-tab-label');
    if (lbl) lbl.textContent = labels[goalScope] || t('dial.goal.short');

    let goalVal = _dailyGoal;
    if (goalScope === 'weekly') goalVal = _dailyGoal * 5;
    else if (goalScope === 'monthly') goalVal = _dailyGoal * 22;
    updateDailyProgress(appts, goalVal);
    const orderedResultRows = (() => {
      const primary = ['basarili', 'basarisiz'];
      const out = [];
      primary.forEach((k) => {
        const row = (resultRows || []).find((r) => r.key === k);
        if (row) out.push(row);
      });
      (resultRows || []).forEach((r) => {
        if (!out.some((x) => x.key === r.key)) out.push(r);
      });
      return out;
    })();
    const counts = {};
    (orderedResultRows || []).forEach((r) => { counts[r.key] = 0; });
    (apRowsPerf || []).forEach((a) => {
      const k = (typeof _normResultKey === 'function') ? _normResultKey(a?.durum) : String(a?.durum || '').toLowerCase();
      if (counts[k] === undefined) counts[k] = 0;
      counts[k] += 1;
    });

    const boxes = [];
    boxes.push(`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--green);font-family:var(--mono);">${appts}</div>
<div style="font-size:10px;color:var(--text-3);">${typeof t === 'function' ? t('dial.stat.appt') : 'Randevu'}</div>
</div>`);
    boxes.push(`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--accent);font-family:var(--mono);">${calls}</div>
<div style="font-size:10px;color:var(--text-3);">${typeof t === 'function' ? t('dial.stat.call') : 'Çağrı'}</div>
</div>`);
    (orderedResultRows || []).forEach((r) => {
      const val = counts[r.key] || 0;
      const color = r.color || '#64748b';
      const shown = typeof mbResultLabel === 'function' ? mbResultLabel(r.key, r.label) : (r.label || r.key || '');
      const lbl = String(shown).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      boxes.push(`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:${color};font-family:var(--mono);">${val}</div>
<div style="font-size:10px;color:var(--text-3);">${lbl}</div>
</div>`);
    });

    if (myReq !== _miniStatsReq) return;
    document.getElementById('my-stats-mini').innerHTML = boxes.join('');
    const runSide = () => {
      loadUpcomingWv();
      loadUnfinalizedCalls();
      if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runSide, { timeout: 1800 });
    } else {
      setTimeout(runSide, 0);
    }
  } catch (e) {
    console.error('stats err:', e);
    if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  }
}

