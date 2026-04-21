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
      if (list) list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">Bu firma için dialer kapalı</div>`;
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
      if (role === 'super_admin' && typeof renderFirmSelector === 'function') {
        renderFirmSelector('dialer-firm-selector', initDialer);
      } else {
        firmSelWrap.innerHTML = '';
      }
    }
    if (role === 'super_admin' && !firmScopeId) {
      const list = document.getElementById('agent-camp-list');
      if (list) {
        list.innerHTML = `<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">Dialer için önce firma seçin</div>`;
      }
      return;
    }

    let myCamps = [];
    if (adminLike) {
      const allCamps = await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${firmScopeId}&order=created_at.desc`) || [];
      myCamps = allCamps.map(c => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
    } else {
      myCamps = await sb(`agent_campaigns?select=*,campaigns(*,queues(*))&agent_id=eq.${currentUser.id}`) || [];
      if (!myCamps.length) {
        const allCamps = await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${currentUser.firm_id}&order=created_at.desc`) || [];
        myCamps = allCamps.map(c => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
      }
    }
    const list = document.getElementById('agent-camp-list');
    if (!myCamps.length) {
      list.innerHTML=`<div style="color:var(--text-3);font-size:12px;text-align:center;padding:16px;">Kampanya atanmamış<br><small style="font-size:10px;">Admin sizi bir kampanyaya atamalı</small></div>`;
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
        rdyBtn.style.opacity = '0.45';
        rdyBtn.style.cursor = 'not-allowed';
        rdyBtn.title = 'Önce bir kampanya seçin';
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
      return `<div class="agent-camp-item ${isActive?'active':''}" id="camp-item-${cid}" style="padding:8px 10px;" onclick="selectCamp('${cid}','${cName}')">
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
  <div style="flex:1;min-width:0;">
    <div class="agent-camp-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ac.campaigns?.name||cid}</div>
    <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text-2);cursor:pointer;opacity:1;"
        title="${canDisableAutoDial ? 'Bu kampanyada otomatik aramayı kapatabilirsiniz' : 'Bu kampanyada otomatik arama kapatılamaz'}">
        <input type="checkbox" ${enabledForMe ? 'checked' : ''}
          onchange="toggleCampaignAutoDialForMe('${cid}', this.checked)"
          onclick="event.stopPropagation()"
          style="width:14px;height:14px;accent-color:var(--accent);">
        Otomatik Arama
      </label>
    </div>
  </div>
  <!-- Toggle switch -->
  <label style="position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0;cursor:pointer;" title="${isActive?'Kapat':'Aktif Et'}">
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

// Kampanya aktif/pasif toggle
function toggleCampActive(campId, checked) {
  if (checked) {
    if (!_activeCampIds.includes(campId)) _activeCampIds.push(campId);
    const camp = campaigns.find((c) => c.id === campId);
    selectCamp(campId, camp?.name || '', { skipActivate: true });
  } else {
    _activeCampIds = _activeCampIds.filter(id => id !== campId);
  }
  _saveActiveCampIds(_activeCampIds);
  // Görsel güncelle
  const item   = document.getElementById(`camp-item-${campId}`);
  const slider = document.getElementById(`camp-slider-${campId}`);
  const knob   = document.getElementById(`camp-knob-${campId}`);
  if (item)   item.classList.toggle('active', checked);
  if (slider) slider.style.background = checked ? 'var(--accent)' : 'var(--border)';
  if (knob)   knob.style.left = checked ? '19px' : '3px';
  // selectedCampId'yi güncelle: aktif kampanya yoksa ilkini seç
  if (!_activeCampIds.includes(selectedCampId)) {
    // Kullanıcı seçtiği kampanya pasif olduysa seçimi kaldır
    selectedCampId = null;
  }
  const countStr = _activeCampIds.length === 0 ? 'Hiç kampanya aktif değil' :
    `${_activeCampIds.length} kampanya aktif`;
  toast(checked ? `✓ Aktif: ${countStr}` : `Pasif: ${countStr}`, checked ? 'ok' : 'warn', 2000);
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
  if (notice) notice.style.display = 'none';
  refreshAutoDialUi();
  refreshDialerHealthPanel();
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
    toast('Bu ayarı sadece admin değiştirebilir', 'warn', 2200);
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
    toast(allowed ? 'Bu kampanyada otomatik arama kapatma izni açıldı' : 'Bu kampanyada otomatik arama kapatma izni kapatıldı', 'ok', 2200);
  } catch (e) {
    toast('Kaydedilemedi: ' + e.message, 'err');
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
  const base = _activeCampIds.length ? _activeCampIds : (selectedCampId ? [selectedCampId] : []);
  return base.filter((cid) => isCampaignAutoDialAllowed(cid));
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
    toast('Bu kampanyada otomatik arama kapatılamaz', 'warn', 2600);
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
      b.style.background = t === goalScope ? 'var(--accent)' : 'transparent';
      b.style.color = t === goalScope ? '#fff' : 'var(--text-2)';
    }
  });
  const labels = { daily: 'Günlük Hedef', weekly: 'Haftalık Hedef', monthly: 'Aylık Hedef' };
  const lbl = document.getElementById('goal-tab-label');
  if (lbl) lbl.textContent = labels[goalScope] || 'Hedef';
}

function setPerfTab(tab) {
  _perfTab = tab;
  ['today','week','month'].forEach(t => {
    const b = document.getElementById(`perf-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--accent)' : 'transparent'; b.style.color = t===tab ? '#fff' : 'var(--text-2)'; }
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

async function loadMyMiniStats() {
  const myReq = ++_miniStatsReq;
  try {
    const now = new Date();
    let since;
    if (_perfTab === 'today') {
      since = now.toISOString().split('T')[0] + 'T00:00:00';
    } else if (_perfTab === 'week') {
      const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay()||7) + 1); mon.setHours(0,0,0,0);
      since = mon.toISOString();
    } else {
      since = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
    }
    const nowIso = now.toISOString();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
    const dayStart = now.toISOString().split('T')[0] + 'T00:00:00';
    const uid = currentUser?.id;

    const qCalls = sb(
      `call_logs?select=outcome&agent_id=eq.${uid}` +
      `&started_at=gte.${since}&started_at=lte.${nowIso}`
    );
    const qApDurum = sb(
      `appointments?select=durum&agent_id=eq.${uid}` +
      `&termin_tarih=gte.${since}&termin_tarih=lte.${nowIso}`
    );
    const qMonth =
      _perfTab !== 'month'
        ? sb(
            `appointments?select=id&agent_id=eq.${uid}` +
              `&termin_tarih=gte.${monthStart}&termin_tarih=lte.${nowIso}`
          ).catch(() => [])
        : Promise.resolve(null);
    const qDay =
      _perfTab !== 'today'
        ? Promise.all([
            sb(
              `appointments?select=id&agent_id=eq.${uid}` +
                `&termin_tarih=gte.${dayStart}&termin_tarih=lte.${nowIso}`
            ).catch(() => []),
            sb(
              `call_logs?select=id&agent_id=eq.${uid}` +
                `&started_at=gte.${dayStart}&started_at=lte.${nowIso}`
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
        b.style.background = t === goalScope ? 'var(--accent)' : 'transparent';
        b.style.color = t === goalScope ? '#fff' : 'var(--text-2)';
      }
    });
    const labels = { daily:'Günlük Hedef', weekly:'Haftalık Hedef', monthly:'Aylık Hedef' };
    const lbl = document.getElementById('goal-tab-label');
    if (lbl) lbl.textContent = labels[goalScope] || 'Hedef';

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
<div style="font-size:10px;color:var(--text-3);">Termin</div>
</div>`);
    boxes.push(`
<div style="text-align:center;background:var(--bg-3);border-radius:var(--radius-sm);padding:8px 6px;">
<div style="font-size:18px;font-weight:800;color:var(--accent);font-family:var(--mono);">${calls}</div>
<div style="font-size:10px;color:var(--text-3);">Çağrı</div>
</div>`);
    (orderedResultRows || []).forEach((r) => {
      const val = counts[r.key] || 0;
      const color = r.color || '#64748b';
      const lbl = String(r.label || r.key || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// ── Maskot tema (isim, ana renk, gradient) — localStorage ─────────
const MASCOT_VARIANT_OFFSETS = {
  aurora: [0, 24, 50, 78],
  sunset: [0, 14, -22, -38],
  ocean: [-10, 8, 28, 48],
  forest: [28, 72, 98, 118],
  candy: [0, 38, 58, 82],
  midnight: [-18, -6, 14, 46],
  ember: [6, -14, -32, 52],
};
let _mascotVariantRandResolved = '';

function resolveMascotVariantKeyFromPref() {
  const raw = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) {
    const keys = Object.keys(MASCOT_VARIANT_OFFSETS);
    _mascotVariantRandResolved = keys[Math.floor(Math.random() * keys.length)];
  }
  return _mascotVariantRandResolved;
}

function resolveMascotVariantKeyFromFormValue(val) {
  const raw = String(val || 'aurora').toLowerCase();
  if (raw !== 'random') {
    _mascotVariantRandResolved = '';
    return MASCOT_VARIANT_OFFSETS[raw] ? raw : 'aurora';
  }
  if (!_mascotVariantRandResolved) {
    const keys = Object.keys(MASCOT_VARIANT_OFFSETS);
    _mascotVariantRandResolved = keys[Math.floor(Math.random() * keys.length)];
  }
  return _mascotVariantRandResolved;
}

const MASCOT_SHAPES = new Set([
  'blob',
  'circle',
  'squircle',
  'square',
  'pill',
  'hex',
  'diamond',
  'star',
  'heart',
  'droplet',
  'ring',
  /* dinamik / canlı */
  'pulse',
  'wave',
  'ripple',
  'morph',
  /* ek statik */
  'cloud',
  'egg',
  'pebble',
  'clover',
  'leaf',
  'moon',
  'sun',
  'bolt',
  'gem',
  'shield',
  'flower',
  'ticket',
  'bow',
]);

function mascotShapeFromString(val) {
  const s = String(val || 'blob').toLowerCase();
  return MASCOT_SHAPES.has(s) ? s : 'blob';
}

function _mascotHexToRgb(hex) {
  const s = String(hex || '')
    .replace('#', '')
    .trim();
  if (s.length === 3) {
    return {
      r: parseInt(s[0] + s[0], 16),
      g: parseInt(s[1] + s[1], 16),
      b: parseInt(s[2] + s[2], 16),
    };
  }
  if (s.length !== 6) return { r: 168, g: 85, b: 247 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function _mascotRgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function _mascotHexToHue(hex) {
  const { r, g, b } = _mascotHexToRgb(hex);
  return Math.round(_mascotRgbToHsl(r, g, b).h);
}

function _mascotWrapHue(x) {
  let n = Math.round(x) % 360;
  if (n < 0) n += 360;
  return n;
}

/** Ayar formu / rastgele görünüş için HSL → #rrggbb */
function _mascotHslToHex(h, s, l) {
  let hh = ((Number(h) % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, Number(s))) / 100;
  const ll = Math.max(0, Math.min(100, Number(l))) / 100;
  hh /= 360;
  let r;
  let g;
  let b;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function _mascotPickRandomSelectValue(selectId) {
  const el = document.getElementById(selectId);
  if (!el?.options?.length) return '';
  const vals = Array.from(el.options)
    .map((o) => String(o.value || ''))
    .filter((v) => v && v !== 'random');
  if (!vals.length) return '';
  return vals[Math.floor(Math.random() * vals.length)];
}

/** Ayarlardaki tüm renk + kozmetik seçeneklerini rastgele doldurur (gezinme ayarlarına dokunmaz). */
function randomizeMascotAppearance() {
  const mainHue = Math.floor(Math.random() * 360);
  const hex = _mascotHslToHex(mainHue, 58 + Math.floor(Math.random() * 32), 44 + Math.floor(Math.random() * 20));
  const breakHue = _mascotWrapHue(mainHue + 35 + Math.floor(Math.random() * 90));
  const breakHex = _mascotHslToHex(breakHue, 52 + Math.floor(Math.random() * 36), 48 + Math.floor(Math.random() * 16));
  const angryHue = _mascotWrapHue(mainHue - 40 + Math.floor(Math.random() * 80));
  const angryHex = _mascotHslToHex(angryHue, 62 + Math.floor(Math.random() * 30), 44 + Math.floor(Math.random() * 18));

  _mascotVariantRandResolved = '';
  const variant =
    Math.random() < 0.34 ? 'random' : _mascotPickRandomSelectValue('s-mascot-variant') || 'aurora';
  const shapeRaw = _mascotPickRandomSelectValue('s-mascot-shape') || 'blob';
  const shape = mascotShapeFromString(shapeRaw);

  setMascotPref('mb_mascot_color', hex);
  setMascotPref('mb_mascot_break_color', breakHex);
  setMascotPref('mb_mascot_angry_color', angryHex);
  setMascotPref('mb_mascot_variant', variant);
  setMascotPref('mb_mascot_shape', shape);
  setMascotPref('mb_mascot_cos_eye', _mascotPickRandomSelectValue('s-mascot-cos-eye') || 'none');
  setMascotPref('mb_mascot_cos_brow', _mascotPickRandomSelectValue('s-mascot-cos-brow') || 'none');
  setMascotPref('mb_mascot_cos_stache', _mascotPickRandomSelectValue('s-mascot-cos-stache') || 'none');
  setMascotPref('mb_mascot_cos_mouth', _mascotPickRandomSelectValue('s-mascot-cos-mouth') || 'none');
  setMascotPref('mb_mascot_cos_nose', _mascotPickRandomSelectValue('s-mascot-cos-nose') || 'none');
  setMascotPref('mb_mascot_cos_hat', _mascotPickRandomSelectValue('s-mascot-cos-hat') || 'none');
  setMascotPref('mb_mascot_cos_outfit', _mascotPickRandomSelectValue('s-mascot-cos-outfit') || 'none');
  setMascotPref('mb_mascot_cos_earring', _mascotPickRandomSelectValue('s-mascot-cos-earring') || 'none');
  setMascotPref('mb_mascot_cos_makeup', _mascotPickRandomSelectValue('s-mascot-cos-makeup') || 'none');
  setMascotPref('mb_mascot_cos_hair', _mascotPickRandomSelectValue('s-mascot-cos-hair') || 'none');
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const hx = _mascotHslToHex(
      Math.floor(Math.random() * 360),
      38 + Math.floor(Math.random() * 48),
      32 + Math.floor(Math.random() * 38),
    );
    setMascotPref(`mb_mascot_cos_${part}_color`, hx);
  }

  try {
    loadMascotSettingsForm();
  } catch (e) {}
  applyMascotTheme();
  if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
}

function _mascotUserScope() {
  return String(currentUser?.id || 'anon');
}

function _mascotLsKey(base) {
  return `${base}_${_mascotUserScope()}`;
}

function getMascotPref(base, fallback = '') {
  const key = _mascotLsKey(base);
  const scoped = localStorage.getItem(key);
  if (scoped !== null && scoped !== undefined && scoped !== '') return scoped;
  const legacy = localStorage.getItem(base);
  if (legacy !== null && legacy !== undefined && legacy !== '') {
    localStorage.setItem(key, legacy);
    return legacy;
  }
  return fallback;
}

function setMascotPref(base, value) {
  localStorage.setItem(_mascotLsKey(base), String(value ?? ''));
}

function getMascotAgeCoeff() {
  const fromFirm = Number(window._firmDialerSettings?.mascot_age_coeff || 10);
  if (Number.isFinite(fromFirm) && fromFirm > 0) return fromFirm;
  return 10;
}

function getMascotWanderPct() {
  const n = Number(getMascotPref('mb_mascot_wander_pct', '35'));
  if (!Number.isFinite(n)) return 35;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Ayarlardan maskot boyutu: 50–150 → 0.5–1.5 (performans büyümesi ile çarpılır) */
function getMascotUserScalePct() {
  const n = Number(getMascotPref('mb_mascot_user_scale', '100'));
  if (!Number.isFinite(n)) return 100;
  return Math.max(50, Math.min(150, Math.round(n)));
}

function getMascotUserScaleMul() {
  return getMascotUserScalePct() / 100;
}

const MASCOT_COS_KEYS = ['eye', 'brow', 'stache', 'mouth', 'nose', 'hat', 'outfit', 'earring', 'makeup', 'hair'];

const MASCOT_COS_COLOR_PARTS = ['eye', 'brow', 'stache', 'mouth', 'nose', 'hat', 'outfit', 'earring', 'makeup', 'hair'];

const MASCOT_CCOL_PLACEHOLDER = '#64748b';

/** Eski kayıtlı değerler → yeni bıyık / ağız anahtarları */
const MASCOT_COS_LEGACY = {
  stache: {
    shadow: 'silk',
    pencil: 'gentle',
    chevron: 'twirl',
    horseshoe: 'crescent',
    handlebar: 'dapper',
    walrus: 'velvet',
    toothbrush: 'painter',
    zapata: 'film',
  },
  mouth: {
    smile: 'beam',
    grin: 'laugh',
    smirk: 'playful',
    flat: 'cool',
    ooh: 'tiny',
    tongue: 'playful',
    line: 'cool',
    kiss: 'smitten',
  },
};

/** Rastgele seçenek: sayfa yükünde bir kez çözülür (yenilemede yeniden). */
const MASCOT_COS_RANDOM_POOLS = {
  eye: ['none', 'sparkle', 'anime', 'sleepy', 'wink', 'shy', 'big', 'star', 'glow', 'retro'],
  brow: ['none', 'thin', 'soft', 'arch', 'thick', 'wispy', 'bold', 'angry', 'straight', 'curved'],
  stache: ['none', 'silk', 'gentle', 'twirl', 'dapper', 'velvet', 'painter', 'crescent', 'film', 'sombrero'],
  mouth: ['none', 'beam', 'soft', 'laugh', 'smitten', 'playful', 'tiny', 'pout', 'cool', 'dreamy'],
  nose: ['none', 'dot', 'oval', 'button', 'tiny', 'upturned', 'pierced'],
  hat: ['none', 'cap', 'beanie', 'tophat', 'crown', 'headband', 'cat', 'party', 'wizard'],
  outfit: ['none', 'bowtie', 'necktie', 'scarf', 'badge', 'collar', 'pearls', 'ribbon', 'vest'],
  earring: ['none', 'stud', 'hoop', 'pearl', 'drop', 'crystal', 'heart'],
  makeup: ['none', 'blush', 'glow', 'freckles', 'liner', 'sparkle', 'cute'],
  hair: ['none', 'bob', 'short', 'long', 'braid', 'bun', 'pony', 'pixie', 'waves', 'slick', 'mohawk', 'afro', 'spikes', 'curly', 'side'],
};

let _mascotCosRandCache = {};

function getMascotCosmeticPref(part) {
  let v = String(getMascotPref(`mb_mascot_cos_${part}`, '') || 'none')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  v = v || 'none';
  const leg = MASCOT_COS_LEGACY[part]?.[v];
  return leg || v;
}

function _rollMascotCosmeticFromPool(part) {
  const pool = MASCOT_COS_RANDOM_POOLS[part];
  if (!pool || !pool.length) return 'none';
  return pool[Math.floor(Math.random() * pool.length)];
}

/** DOM / tema için: random → havuzdan rastgele (oturum içi önbellek). */
function getMascotCosmeticApplied(part) {
  const raw = getMascotCosmeticPref(part);
  if (raw !== 'random') return raw;
  if (!_mascotCosRandCache[part]) {
    _mascotCosRandCache[part] = _rollMascotCosmeticFromPool(part);
  }
  return _mascotCosRandCache[part];
}

function applyMascotCosmetics() {
  const attrs = {};
  for (const k of MASCOT_COS_KEYS) {
    attrs[`data-mascot-${k}`] = getMascotCosmeticApplied(k);
  }
  document.querySelectorAll('.mascot-theme-root').forEach((root) => {
    for (const [attr, val] of Object.entries(attrs)) {
      root.setAttribute(attr, val);
    }
  });
}

function getMascotCosmeticColorPref(part) {
  const v = String(getMascotPref(`mb_mascot_cos_${part}_color`, '') || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
}

function applyMascotCosmeticColors() {
  document.querySelectorAll('.mascot-theme-root').forEach((root) => {
    for (const p of MASCOT_COS_COLOR_PARTS) {
      const hex = getMascotCosmeticColorPref(p);
      if (hex) root.style.setProperty(`--cos-${p}-color`, hex);
      else root.style.removeProperty(`--cos-${p}-color`);
    }
  });
}

function _syncMascotCosColorInputsFromPrefs() {
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const el = document.getElementById(`s-mascot-ccol-${part}`);
    if (!el) continue;
    const raw = getMascotCosmeticColorPref(part);
    el.value = raw || MASCOT_CCOL_PLACEHOLDER;
    el.dataset.cosInherit = raw ? '' : '1';
  }
}

/** 0 = neredeyse duruyor, 100 = hızlı */
function getMascotWanderSpeedPct() {
  const n = Number(getMascotPref('mb_mascot_wander_speed', '22'));
  if (!Number.isFinite(n)) return 22;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getMascotShape() {
  return mascotShapeFromString(getMascotPref('mb_mascot_shape', 'blob'));
}

function applyMascotShape() {
  const s = getMascotShape();
  document.querySelectorAll('.mascot-theme-root').forEach((el) => {
    el.setAttribute('data-mascot-shape', s);
  });
}

function _mascotAnchorCenterPx(gm) {
  const x = parseFloat(String(gm.style.left || '0').replace('px', '')) || 0;
  const y = parseFloat(String(gm.style.top || '0').replace('px', '')) || 0;
  return { x, y };
}

/** Bırakılan noktadan viewport kenarına kadar (kenar payı ile) tam ofset aralığı. */
function _mascotWanderBoundsFromViewport(gm) {
  const t = 1;
  const edge = 12;
  const animPad = 18;
  const bubbleBelow = 58;
  let halfW = 40;
  let halfH = 44;
  try {
    const blob = gm.querySelector('.cust-empty-blob');
    const el = blob || gm.querySelector('.cust-empty-mascot');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 8) halfW = (r.width / 2) * 1.12 + animPad * 0.35;
      if (r.height > 8) halfH = (r.height / 2) * 1.12 + animPad * 0.35 + bubbleBelow * 0.45;
    }
  } catch (e) {}
  halfW += animPad;
  halfH += animPad + bubbleBelow * 0.55;
  const { x: Px, y: Py } = _mascotAnchorCenterPx(gm);
  const vw = Number(window.innerWidth) || 800;
  const vh = Number(window.innerHeight) || 600;
  /* Tüm sekmelerde aynı: gezinme alanı viewport (dialer paneline sıkıştırma yok). */
  const dl = 0;
  const dt = 0;
  const dr = vw;
  const db = vh;
  const minCx = dl + edge + halfW;
  const maxCx = dr - edge - halfW;
  const minCy = dt + edge + halfH;
  const maxCy = db - edge - halfH;
  if (!Number.isFinite(Px) || !Number.isFinite(Py) || maxCx <= minCx + 4 || maxCy <= minCy + 4) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const fullMinX = minCx - Px;
  const fullMaxX = maxCx - Px;
  const fullMinY = minCy - Py;
  const fullMaxY = maxCy - Py;
  return {
    minX: t * fullMinX,
    maxX: t * fullMaxX,
    minY: t * fullMinY,
    maxY: t * fullMaxY,
  };
}

function isMimiHidden() {
  return getMascotPref('mb_mascot_hidden', '0') === '1';
}

function isMimiBubbleMuted() {
  return getMascotPref('mb_mascot_bubble_mute', '0') === '1';
}

function toggleMimiBubbleMute() {
  const next = isMimiBubbleMuted() ? '0' : '1';
  setMascotPref('mb_mascot_bubble_mute', next);
  if (next === '1') {
    stopCustEmptyCoach();
    const bubble = document.getElementById('cust-empty-bubble');
    if (bubble) {
      bubble.style.display = 'none';
      bubble.classList.remove('cust-empty-bubble--pop');
    }
  } else if (!isMimiHidden()) {
    startCustEmptyCoach();
  }
  refreshGlobalMascotInfoPanel();
}

function _applyMascotVarsToEl(el, baseHue, variantKey, opts = {}) {
  if (!el || !el.style) return;
  const offs = MASCOT_VARIANT_OFFSETS[variantKey] || MASCOT_VARIANT_OFFSETS.aurora;
  const d = offs.map((o) => _mascotWrapHue(baseHue + o));
  d.forEach((v, i) => el.style.setProperty(`--m-d${i}`, String(v)));
  const bored = [18, 8, -4, -16];
  bored.forEach((o, i) => el.style.setProperty(`--m-b${i}`, String(_mascotWrapHue(baseHue + o))));
  const angryHue = Number(opts.angryHue);
  const breakHue = Number(opts.breakHue);
  const angryAnc = Number.isFinite(angryHue) ? _mascotWrapHue(angryHue) : _mascotWrapHue(baseHue * 0.26 + 11 * 0.74);
  const angryOff = [16, 5, -7, -18];
  angryOff.forEach((o, i) => el.style.setProperty(`--m-a${i}`, String(_mascotWrapHue(angryAnc + o))));
  const breakAnc = Number.isFinite(breakHue) ? _mascotWrapHue(breakHue) : _mascotWrapHue(baseHue * 0.2 + 216 * 0.8);
  const brkOff = [12, 2, -8, -18];
  brkOff.forEach((o, i) => el.style.setProperty(`--m-k${i}`, String(_mascotWrapHue(breakAnc + o))));
}

function formatMascotSpokenLine(msg) {
  return msg;
}

function applyMascotTheme() {
  const hex = getMascotPref('mb_mascot_color', '#a855f7') || '#a855f7';
  const variant = resolveMascotVariantKeyFromPref();
  const breakHex = getMascotPref('mb_mascot_break_color', '#4f8cff') || '#4f8cff';
  const angryHex = getMascotPref('mb_mascot_angry_color', '#ff5b55') || '#ff5b55';
  const h = _mascotHexToHue(hex);
  const breakHue = _mascotHexToHue(breakHex);
  const angryHue = _mascotHexToHue(angryHex);
  const cust = document.getElementById('cust-empty');
  const prev = document.getElementById('settings-mascot-preview-wrap');
  const gm = document.getElementById('global-mascot');
  if (cust) _applyMascotVarsToEl(cust, h, variant, { breakHue, angryHue });
  if (prev) _applyMascotVarsToEl(prev, h, variant, { breakHue, angryHue });
  if (gm) _applyMascotVarsToEl(gm, h, variant, { breakHue, angryHue });
  if (prev) prev.style.setProperty('--mascot-user-scale', String(getMascotUserScaleMul()));
  applyMascotShape();
  applyMascotCosmetics();
  applyMascotCosmeticColors();
  if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  updateMascotNameLabel();
}

function applyMascotThemeLiveFromForm() {
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const sh = document.getElementById('s-mascot-shape');
  if (!c || !v) {
    applyMascotTheme();
    return;
  }
  const h = _mascotHexToHue(c.value);
  const breakHue = _mascotHexToHue(bk?.value || '#4f8cff');
  const angryHue = _mascotHexToHue(ag?.value || '#ff5b55');
  const cust = document.getElementById('cust-empty');
  const prev = document.getElementById('settings-mascot-preview-wrap');
  const gm = document.getElementById('global-mascot');
  const vKey = resolveMascotVariantKeyFromFormValue(v.value);
  if (cust) _applyMascotVarsToEl(cust, h, vKey, { breakHue, angryHue });
  if (prev) _applyMascotVarsToEl(prev, h, vKey, { breakHue, angryHue });
  if (gm) _applyMascotVarsToEl(gm, h, vKey, { breakHue, angryHue });
  const sc = document.getElementById('s-mascot-user-scale');
  const mul = sc ? Math.max(0.5, Math.min(1.5, Number(sc.value) / 100 || 1)) : getMascotUserScaleMul();
  if (prev) prev.style.setProperty('--mascot-user-scale', String(mul));
  if (sh) {
    const sVal = mascotShapeFromString(sh.value);
    document.querySelectorAll('.mascot-theme-root').forEach((el) => el.setAttribute('data-mascot-shape', sVal));
  }
  if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
  applyMascotCosmetics();
  applyMascotCosmeticColors();
}

function updateMascotNameLabel() {
  const tag = document.getElementById('cust-empty-mascot-tag');
  if (!tag) return;
  tag.textContent = '';
  tag.style.display = 'none';
  refreshGlobalMascotInfoPanel();
}

let _mascotSettingsFormWired = false;

function loadMascotSettingsForm() {
  const n = document.getElementById('s-mascot-name');
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const wd = document.getElementById('s-mascot-wander');
  const ws = document.getElementById('s-mascot-wander-speed');
  const sc = document.getElementById('s-mascot-user-scale');
  const sh = document.getElementById('s-mascot-shape');
  const cosEye = document.getElementById('s-mascot-cos-eye');
  const cosBrow = document.getElementById('s-mascot-cos-brow');
  const cosStache = document.getElementById('s-mascot-cos-stache');
  const cosMouth = document.getElementById('s-mascot-cos-mouth');
  const cosNose = document.getElementById('s-mascot-cos-nose');
  const cosHat = document.getElementById('s-mascot-cos-hat');
  const cosOutfit = document.getElementById('s-mascot-cos-outfit');
  const cosEarring = document.getElementById('s-mascot-cos-earring');
  const cosMakeup = document.getElementById('s-mascot-cos-makeup');
  const cosHair = document.getElementById('s-mascot-cos-hair');
  const coef = document.getElementById('s-mascot-age-coef');
  const coefHint = document.getElementById('s-mascot-age-coef-hint');
  if (!n || !c || !v) return;
  n.value = getMascotPref('mb_mascot_name', '');
  c.value = getMascotPref('mb_mascot_color', '#a855f7');
  v.value = getMascotPref('mb_mascot_variant', 'aurora');
  if (bk) bk.value = getMascotPref('mb_mascot_break_color', '#4f8cff');
  if (ag) ag.value = getMascotPref('mb_mascot_angry_color', '#ff5b55');
  if (wd) wd.value = String(getMascotWanderPct());
  if (ws) ws.value = String(getMascotWanderSpeedPct());
  if (sc) sc.value = String(getMascotUserScalePct());
  if (sh) sh.value = getMascotShape();
  if (cosEye) cosEye.value = getMascotCosmeticPref('eye');
  if (cosBrow) cosBrow.value = getMascotCosmeticPref('brow');
  if (cosStache) cosStache.value = getMascotCosmeticPref('stache');
  if (cosMouth) cosMouth.value = getMascotCosmeticPref('mouth');
  if (cosNose) cosNose.value = getMascotCosmeticPref('nose');
  if (cosHat) cosHat.value = getMascotCosmeticPref('hat');
  if (cosOutfit) cosOutfit.value = getMascotCosmeticPref('outfit');
  if (cosEarring) cosEarring.value = getMascotCosmeticPref('earring');
  if (cosMakeup) cosMakeup.value = getMascotCosmeticPref('makeup');
  if (cosHair) cosHair.value = getMascotCosmeticPref('hair');
  _syncMascotCosColorInputsFromPrefs();
  const role = currentUser?.role || '';
  const adminLike = ['firm_admin', 'admin', 'super_admin'].includes(role);
  if (coef) {
    coef.value = String(getMascotAgeCoeff());
    coef.disabled = !adminLike;
    coef.style.opacity = adminLike ? '' : '0.65';
  }
  if (coefHint) {
    coefHint.textContent = adminLike
      ? 'Firma geneli katsayıdır.'
      : 'Bu katsayıyı sadece admin değiştirebilir.';
  }
  if (currentUser?.firm_id) {
    loadFirmDialerSettingsCache().then(() => {
      if (coef) coef.value = String(getMascotAgeCoeff());
      refreshGlobalMascotInfoPanel();
    }).catch(() => {});
  }
  applyMascotTheme();
  if (_mascotSettingsFormWired) return;
  _mascotSettingsFormWired = true;
  const onLive = () => {
    applyMascotThemeLiveFromForm();
    const tag = document.getElementById('cust-empty-mascot-tag');
    if (tag) {
      tag.textContent = '';
      tag.style.display = 'none';
    }
    refreshGlobalMascotInfoPanel();
  };
  c.addEventListener('input', onLive);
  v.addEventListener('change', () => {
    if (v.value === 'random') _mascotVariantRandResolved = '';
    onLive();
  });
  n.addEventListener('input', onLive);
  bk?.addEventListener('input', onLive);
  ag?.addEventListener('input', onLive);
  wd?.addEventListener('input', () => {
    setMascotPref('mb_mascot_wander_pct', wd.value);
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  sc?.addEventListener('input', () => {
    setMascotPref('mb_mascot_user_scale', sc.value);
    const prevWrap = document.getElementById('settings-mascot-preview-wrap');
    if (prevWrap) prevWrap.style.setProperty('--mascot-user-scale', String(getMascotUserScaleMul()));
    if (typeof updateCustEmptyMascotScale === 'function') updateCustEmptyMascotScale();
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  ws?.addEventListener('input', () => {
    setMascotPref('mb_mascot_wander_speed', ws.value);
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
  });
  sh?.addEventListener('change', () => {
    setMascotPref('mb_mascot_shape', sh.value);
    applyMascotShape();
    onLive();
  });
  const onCos = (part, el) => {
    if (!el) return;
    el.addEventListener('change', () => {
      setMascotPref(`mb_mascot_cos_${part}`, el.value || 'none');
      delete _mascotCosRandCache[part];
      applyMascotCosmetics();
    });
  };
  onCos('eye', cosEye);
  onCos('brow', cosBrow);
  onCos('stache', cosStache);
  onCos('mouth', cosMouth);
  onCos('nose', cosNose);
  onCos('hat', cosHat);
  onCos('outfit', cosOutfit);
  onCos('earring', cosEarring);
  onCos('makeup', cosMakeup);
  onCos('hair', cosHair);
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const cel = document.getElementById(`s-mascot-ccol-${part}`);
    if (!cel) continue;
    cel.addEventListener('input', () => {
      delete cel.dataset.cosInherit;
      setMascotPref(`mb_mascot_cos_${part}_color`, cel.value || '');
      applyMascotCosmeticColors();
    });
    cel.addEventListener('dblclick', (e) => {
      e.preventDefault();
      setMascotPref(`mb_mascot_cos_${part}_color`, '');
      _syncMascotCosColorInputsFromPrefs();
      applyMascotCosmeticColors();
    });
  }
}

function saveMascotSettings() {
  const n = document.getElementById('s-mascot-name');
  const c = document.getElementById('s-mascot-color');
  const v = document.getElementById('s-mascot-variant');
  const bk = document.getElementById('s-mascot-break-color');
  const ag = document.getElementById('s-mascot-angry-color');
  const wd = document.getElementById('s-mascot-wander');
  const ws = document.getElementById('s-mascot-wander-speed');
  const sc = document.getElementById('s-mascot-user-scale');
  const sh = document.getElementById('s-mascot-shape');
  const cosEye = document.getElementById('s-mascot-cos-eye');
  const cosBrow = document.getElementById('s-mascot-cos-brow');
  const cosStache = document.getElementById('s-mascot-cos-stache');
  const cosMouth = document.getElementById('s-mascot-cos-mouth');
  const cosNose = document.getElementById('s-mascot-cos-nose');
  const cosHat = document.getElementById('s-mascot-cos-hat');
  const cosOutfit = document.getElementById('s-mascot-cos-outfit');
  const cosEarring = document.getElementById('s-mascot-cos-earring');
  const cosMakeup = document.getElementById('s-mascot-cos-makeup');
  const cosHair = document.getElementById('s-mascot-cos-hair');
  const coef = document.getElementById('s-mascot-age-coef');
  if (!n || !c || !v) return;
  const name = String(n.value || '')
    .trim()
    .slice(0, 28);
  let hex = String(c.value || '#a855f7').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) hex = '#a855f7';
  const vRaw = String(v.value || 'aurora').toLowerCase();
  const variant = vRaw === 'random' || MASCOT_VARIANT_OFFSETS[vRaw] ? vRaw : 'aurora';
  setMascotPref('mb_mascot_name', name);
  setMascotPref('mb_mascot_color', hex);
  setMascotPref('mb_mascot_variant', variant);
  if (variant === 'random') _mascotVariantRandResolved = '';
  if (bk) setMascotPref('mb_mascot_break_color', bk.value || '#4f8cff');
  if (ag) setMascotPref('mb_mascot_angry_color', ag.value || '#ff5b55');
  if (wd) setMascotPref('mb_mascot_wander_pct', wd.value || '35');
  if (ws) setMascotPref('mb_mascot_wander_speed', ws.value || '22');
  if (sc) setMascotPref('mb_mascot_user_scale', sc.value || '100');
  if (sh) setMascotPref('mb_mascot_shape', mascotShapeFromString(sh.value));
  if (cosEye) setMascotPref('mb_mascot_cos_eye', cosEye.value || 'none');
  if (cosBrow) setMascotPref('mb_mascot_cos_brow', cosBrow.value || 'none');
  if (cosStache) setMascotPref('mb_mascot_cos_stache', cosStache.value || 'none');
  if (cosMouth) setMascotPref('mb_mascot_cos_mouth', cosMouth.value || 'none');
  if (cosNose) setMascotPref('mb_mascot_cos_nose', cosNose.value || 'none');
  if (cosHat) setMascotPref('mb_mascot_cos_hat', cosHat.value || 'none');
  if (cosOutfit) setMascotPref('mb_mascot_cos_outfit', cosOutfit.value || 'none');
  if (cosEarring) setMascotPref('mb_mascot_cos_earring', cosEarring.value || 'none');
  if (cosMakeup) setMascotPref('mb_mascot_cos_makeup', cosMakeup.value || 'none');
  if (cosHair) setMascotPref('mb_mascot_cos_hair', cosHair.value || 'none');
  for (const part of MASCOT_COS_COLOR_PARTS) {
    const cel = document.getElementById(`s-mascot-ccol-${part}`);
    if (!cel) continue;
    if (cel.dataset.cosInherit === '1') setMascotPref(`mb_mascot_cos_${part}_color`, '');
    else setMascotPref(`mb_mascot_cos_${part}_color`, cel.value || '');
  }
  applyMascotTheme();
  const role = currentUser?.role || '';
  const adminLike = ['firm_admin', 'admin', 'super_admin'].includes(role);
  const desiredCoef = Number(coef?.value || getMascotAgeCoeff());
  if (adminLike && currentUser?.firm_id && Number.isFinite(desiredCoef) && desiredCoef > 0) {
    sb(`firms?id=eq.${currentUser.firm_id}&select=settings`)
      .then((rows) => {
        const oldSettings = rows?.[0]?.settings || {};
        const oldDialer = oldSettings?.dialer || {};
        const dialer = { ...oldDialer, mascot_age_coeff: Math.max(1, Math.min(30, desiredCoef)) };
        return sb(`firms?id=eq.${currentUser.firm_id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ settings: { ...oldSettings, dialer } }),
        });
      })
      .then(() => loadFirmDialerSettingsCache())
      .then(() => refreshGlobalMascotInfoPanel())
      .catch(() => {});
  }
  toast(currentLang === 'tr' ? '✓ Maskot kaydedildi' : '✓ Maskottchen gespeichert', 'ok');
}

try {
  window.saveMascotSettings = saveMascotSettings;
  window.loadMascotSettingsForm = loadMascotSettingsForm;
  window.applyMascotTheme = applyMascotTheme;
  window.applyMascotShape = applyMascotShape;
  window.applyMascotCosmetics = applyMascotCosmetics;
  window.applyMascotCosmeticColors = applyMascotCosmeticColors;
  window.randomizeMascotAppearance = randomizeMascotAppearance;
  window.switchMimiTab = switchMimiTab;
  window.hideMimi = hideMimi;
  window.showMimi = showMimi;
  window.toggleMimiBubbleMute = toggleMimiBubbleMute;
} catch (e) {}

let _globalMascotResizeWired = false;
let _lastMascotCheerSec = -1;
let _mascotNotifMorphT = null;
let _mascotDragState = null;
let _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
let _wanderRaf = null;
let _wanderCur = { x: 0, y: 0 };
let _wanderTgt = { x: 0, y: 0 };
let _dockRaf = null;
let _mimiActiveTab = 'profile';

function _fmtMimiLife(sec) {
  const s = Math.max(0, Math.floor(sec));
  const day = Math.floor(s / 86400);
  const hour = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${day}g ${hour}s ${min}d ${rem}sn`;
}

function refreshGlobalMascotInfoPanel() {
  const nameEl = document.getElementById('global-mascot-info-name');
  const ageEl = document.getElementById('global-mascot-info-age');
  const callsEl = document.getElementById('global-mascot-info-calls');
  const variantEl = document.getElementById('global-mascot-info-variant');
  const noteEl = document.getElementById('global-mascot-info-note');
  const moodEl = document.getElementById('global-mascot-info-mood');
  const energyEl = document.getElementById('global-mascot-info-energy');
  const moodNoteEl = document.getElementById('global-mascot-info-mood-note');
  const tCallsEl = document.getElementById('global-mascot-info-today-calls');
  const tApptEl = document.getElementById('global-mascot-info-today-appts');
  const mApptEl = document.getElementById('global-mascot-info-month-appts');
  const statsNoteEl = document.getElementById('global-mascot-info-stats-note');
  const tr = currentLang === 'tr';
  const n = (getMascotPref('mb_mascot_name', '') || '').trim() || 'Mimi';
  const rawVariant = String(getMascotPref('mb_mascot_variant', 'aurora') || 'aurora').toLowerCase();
  const appliedV = resolveMascotVariantKeyFromPref();
  const appliedLabel = appliedV.charAt(0).toUpperCase() + appliedV.slice(1);
  const totalCall = Math.max(0, _mascotCallAccumSec + (dialerStatus === 'on_call' ? (Number(callSeconds) || 0) : 0));
  const mimiAge = totalCall * getMascotAgeCoeff();
  if (nameEl) nameEl.textContent = n;
  if (ageEl) ageEl.textContent = _fmtMimiLife(mimiAge);
  if (callsEl) callsEl.textContent = _fmtMimiLife(totalCall);
  if (variantEl) {
    variantEl.textContent =
      rawVariant === 'random'
        ? (tr ? `Rastgele (${appliedLabel})` : `Zufall (${appliedLabel})`)
        : appliedLabel;
  }
  const muteBtn = document.getElementById('mimi-bubble-mute-btn');
  const muteLbl = document.getElementById('mimi-bubble-mute-label');
  if (muteLbl) {
    muteLbl.textContent = isMimiBubbleMuted()
      ? tr
        ? 'Balonları aç'
        : 'Blasen an'
      : tr
        ? 'Balon konuşmasını kapat'
        : 'Keine Sprechblasen';
  }
  if (muteBtn) muteBtn.setAttribute('aria-pressed', isMimiBubbleMuted() ? 'true' : 'false');
  if (noteEl) {
    noteEl.textContent = currentLang === 'tr'
      ? `Çağrı süresinin ${getMascotAgeCoeff().toFixed(1)} katı kadar Mimi yaş alıyor. Ne kadar sakin kalırsan o kadar büyüyor.`
      : `Mimi altert mit dem ${getMascotAgeCoeff().toFixed(1)}-fachen deiner Gesprächszeit. Je ruhiger du bleibst, desto stärker wird sie.`;
  }
  const gm = document.getElementById('global-mascot');
  const moodKey = gm?.getAttribute('data-mood') || '';
  const sad = gm?.classList.contains('global-mascot--sad');
  const cel = gm?.classList.contains('global-mascot--celebrate');
  const moodLabel = cel ? (tr ? 'Kutlama' : 'Feier') : sad ? (tr ? 'Üzgün' : 'Traurig') : moodKey === 'break' ? (tr ? 'Uykulu' : 'Müde') : moodKey === 'angry' ? (tr ? 'Gergin' : 'Genervt') : moodKey === 'bored' ? (tr ? 'Sıkıldı' : 'Gelngweilt') : moodKey === 'eat' ? (tr ? 'Mutlu' : 'Happy') : (tr ? 'Sakin' : 'Ruhig');
  if (moodEl) moodEl.textContent = moodLabel;
  const heat = Number(document.getElementById('global-mascot')?.style.getPropertyValue('--mascot-call-heat') || '0') || 0;
  if (energyEl) energyEl.textContent = `${Math.round(heat * 100)}%`;
  if (moodNoteEl) {
    moodNoteEl.textContent = tr
      ? (sad ? 'Bir sonraki arama için minik bir nefes… Hazırsın.' : cel ? 'Bu enerjiyle çok iyi gidiyoruz!' : 'Sakin ve odaklı — en iyi hâlim.')
      : (sad ? 'Kurz durchatmen… der nächste wird besser.' : cel ? 'Mit dieser Energie läuft’s!' : 'Ruhig und fokussiert.');
  }
  const p = window._dialerPerfSnapshot || {};
  if (tCallsEl) tCallsEl.textContent = String(Number(p.todayCalls) || 0);
  if (tApptEl) tApptEl.textContent = String(Number(p.todayAppts) || 0);
  if (mApptEl) mApptEl.textContent = String(Number(p.monthlyAppts) || 0);
  if (statsNoteEl) {
    statsNoteEl.textContent = tr
      ? 'İstatistikler performans panelinden güncellenir.'
      : 'Statistiken werden aus dem Performance-Panel aktualisiert.';
  }
}

function _resetGlobalMascotInfoPanelPosition() {
  const panel = document.getElementById('global-mascot-info');
  if (!panel) return;
  panel.style.position = '';
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.transform = '';
  panel.style.maxWidth = '';
}

/** Mimi kartı maskot viewport kenarındayken taşmasın — fixed konum + clamp */
function positionGlobalMascotInfoPanel() {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm || panel.style.display === 'none') return;
  const anchor =
    document.querySelector('#global-mascot .cust-empty-blob') || document.getElementById('cust-empty-mascot');
  if (!anchor) return;
  const pad = 10;
  const maxW = Math.min(420, Math.max(220, window.innerWidth - pad * 2));
  panel.style.position = 'fixed';
  panel.style.transform = 'none';
  panel.style.maxWidth = `${maxW}px`;
  panel.style.left = '-9999px';
  panel.style.top = '0';
  const ar = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  let left = ar.right + 12;
  let top = ar.top + ar.height / 2 - ph / 2;
  if (left + pw > window.innerWidth - pad) {
    left = ar.left - pw - 12;
  }
  if (left < pad) left = pad;
  if (left + pw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - pw);
  if (top + ph > window.innerHeight - pad) top = window.innerHeight - pad - ph;
  if (top < pad) top = pad;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function switchMimiTab(tab) {
  _mimiActiveTab = tab || 'profile';
  const map = [
    ['profile', 'mimi-pane-profile', 'mimi-tab-profile'],
    ['mood', 'mimi-pane-mood', 'mimi-tab-mood'],
    ['stats', 'mimi-pane-stats', 'mimi-tab-stats'],
  ];
  map.forEach(([k, paneId, tabId]) => {
    document.getElementById(paneId)?.style && (document.getElementById(paneId).style.display = k === _mimiActiveTab ? '' : 'none');
    document.getElementById(tabId)?.classList.toggle('active', k === _mimiActiveTab);
  });
  refreshGlobalMascotInfoPanel();
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    requestAnimationFrame(() => {
      positionGlobalMascotInfoPanel();
      requestAnimationFrame(() => positionGlobalMascotInfoPanel());
    });
  }
}

function toggleGlobalMascotInfoPanel(forceOpen) {
  const panel = document.getElementById('global-mascot-info');
  const gm = document.getElementById('global-mascot');
  if (!panel || !gm) return;
  if (isMimiHidden()) return;
  const open = forceOpen === undefined ? panel.style.display === 'none' || !panel.style.display : !!forceOpen;
  if (!open) {
    _resetGlobalMascotInfoPanelPosition();
    panel.style.display = 'none';
    gm.classList.remove('global-mascot--panel-open');
    return;
  }
  panel.style.display = 'block';
  gm.classList.add('global-mascot--panel-open');
  switchMimiTab(_mimiActiveTab || 'profile');
  requestAnimationFrame(() => {
    positionGlobalMascotInfoPanel();
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  });
}

function hideMimi() {
  setMascotPref('mb_mascot_hidden', '1');
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) bubble.style.display = 'none';
  toggleGlobalMascotInfoPanel(false);
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  if (typeof _clearCustEmptyNotifPeek === 'function') _clearCustEmptyNotifPeek();
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-chat', 'cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-chat', 'global-mascot--peek-notif');
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
  syncGlobalMascotDock();
}

function showMimi() {
  setMascotPref('mb_mascot_hidden', '0');
  syncGlobalMascotDock();
  if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
}

function _loadMascotCustomPos() {
  try {
    const raw = getMascotPref('mb_mascot_custom_pos', '');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function _wireGlobalMascotInteractions() {
  const gm = document.getElementById('global-mascot');
  const mascot = document.getElementById('cust-empty-mascot');
  if (!gm || !mascot || gm.dataset.interactiveReady === '1') return;
  gm.dataset.interactiveReady = '1';
  mascot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    _stopGlobalMascotWander();
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    const r = gm.getBoundingClientRect();
    _mascotDragState = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      moved: false,
    };
    gm.classList.add('global-mascot--dragging');
    mascot.setPointerCapture(e.pointerId);
  });
  mascot.addEventListener('pointermove', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - _mascotDragState.sx;
    const dy = e.clientY - _mascotDragState.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _mascotDragState.moved = true;
    const x = _mascotDragState.left + dx;
    const y = _mascotDragState.top + dy;
    gm.style.left = `${x}px`;
    gm.style.top = `${y}px`;
    gm.classList.add('global-mascot--custom');
    setMascotPref('mb_mascot_custom_pos', JSON.stringify({ x, y }));
  });
  mascot.addEventListener('pointerup', (e) => {
    if (!_mascotDragState || _mascotDragState.pointerId !== e.pointerId) return;
    const wasMove = _mascotDragState.moved;
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (wasMove) {
      if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
      else _syncGlobalMascotWanderOnly();
    } else {
      const bubble = document.getElementById('cust-empty-bubble');
      if (bubble && bubble.style.display !== 'none') {
        bubble.style.display = 'none';
        _syncGlobalMascotWanderOnly();
        return;
      }
      if (isMimiHidden()) showMimi();
      else toggleGlobalMascotInfoPanel();
      _syncGlobalMascotWanderOnly();
    }
  });
  mascot.addEventListener('pointercancel', () => {
    _mascotDragState = null;
    gm.classList.remove('global-mascot--dragging');
    if (typeof syncGlobalMascotDock === 'function') syncGlobalMascotDock();
    else _syncGlobalMascotWanderOnly();
  });
}

function _stopGlobalMascotWander() {
  if (_wanderRaf) {
    cancelAnimationFrame(_wanderRaf);
    _wanderRaf = null;
  }
  _wanderCur = { x: 0, y: 0 };
  _wanderTgt = { x: 0, y: 0 };
  const gm = document.getElementById('global-mascot');
  if (gm) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  }
}

/** Sürükleme bittiğinde veya ayar değişince: gezinmeyi yeniden başlat / durdur (konumu sıfırlamaz). */
function _syncGlobalMascotWanderOnly() {
  const gm = document.getElementById('global-mascot');
  if (!gm || isMimiHidden()) return;
  const allowWander =
    getMascotWanderPct() > 0 &&
    !gm.classList.contains('global-mascot--peek-chat') &&
    !gm.classList.contains('global-mascot--peek-notif') &&
    !gm.classList.contains('global-mascot--notif-morph');
  if (allowWander) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
}

function _pickWanderTarget(gm) {
  const b = _mascotWanderBoundsFromViewport(gm);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) {
    _wanderTgt.x = Number.isFinite(_wanderCur.x) ? _wanderCur.x : 0;
    _wanderTgt.y = Number.isFinite(_wanderCur.y) ? _wanderCur.y : 0;
    return;
  }
  if (w < 1e-4 && h < 1e-4) {
    _wanderTgt.x = b.minX;
    _wanderTgt.y = b.minY;
    return;
  }
  const wanderPct = getMascotWanderPct();
  /** Düşük gezinmede hedef yarıçapı küçülür; hareket alanı büyük olsa bile “sürekli köşelere” gitmez. */
  const wf = Math.pow(Math.max(0, wanderPct) / 100, 1.22);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const halfWx = w / 2;
  const halfHy = h / 2;
  _wanderTgt.x = midX + (Math.random() * 2 - 1) * halfWx * wf;
  _wanderTgt.y = midY + (Math.random() * 2 - 1) * halfHy * wf;
}

function _wanderFrame() {
  const gm = document.getElementById('global-mascot');
  if (!gm) {
    _wanderRaf = null;
    return;
  }
  const pct = getMascotWanderPct();
  if (pct <= 0) {
    _wanderCur.x = 0;
    _wanderCur.y = 0;
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    _wanderRaf = null;
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  const dx = _wanderTgt.x - _wanderCur.x;
  const dy = _wanderTgt.y - _wanderCur.y;
  if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) {
    _pickWanderTarget(gm);
  }
  const bounds = _mascotWanderBoundsFromViewport(gm);
  const speedPct = getMascotWanderSpeedPct();
  const speedT = Math.max(0, speedPct) / 100;
  const speedK = 0.006 + speedT * 0.14;
  const wanderT = Math.max(0, Math.min(100, pct)) / 100;
  const step = speedK * (0.12 + wanderT * 0.88) * 0.09 * Math.pow(wanderT, 1.35);
  _wanderCur.x += dx * step;
  _wanderCur.y += dy * step;
  _wanderCur.x = Math.min(bounds.maxX, Math.max(bounds.minX, _wanderCur.x));
  _wanderCur.y = Math.min(bounds.maxY, Math.max(bounds.minY, _wanderCur.y));
  if (!Number.isFinite(_wanderCur.x)) _wanderCur.x = 0;
  if (!Number.isFinite(_wanderCur.y)) _wanderCur.y = 0;
  gm.style.setProperty('--gm-wx', `${_wanderCur.x.toFixed(2)}px`);
  gm.style.setProperty('--gm-wy', `${_wanderCur.y.toFixed(2)}px`);
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble && bubble.style.display === 'block') {
    const pad = 10;
    let shift = 0;
    const br = bubble.getBoundingClientRect();
    if (br.left < pad) shift += pad - br.left;
    if (br.right > window.innerWidth - pad) shift -= br.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  }
  const panel = document.getElementById('global-mascot-info');
  if (panel && panel.style.display !== 'none') {
    if (typeof positionGlobalMascotInfoPanel === 'function') positionGlobalMascotInfoPanel();
  }
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _startGlobalMascotWander() {
  if (_wanderRaf) return;
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const pct = getMascotWanderPct();
  if (pct <= 0) {
    gm.style.setProperty('--gm-wx', '0px');
    gm.style.setProperty('--gm-wy', '0px');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  _wanderCur = { x: 0, y: 0 };
  _pickWanderTarget(gm);
  _wanderRaf = requestAnimationFrame(_wanderFrame);
}

function _placeGlobalMascotAtRect(rect) {
  const gm = document.getElementById('global-mascot');
  if (!gm || !rect) return;
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rect.width < 0.5) {
    const ax = document.getElementById('sb-mascot-anchor') || document.getElementById('tb-mascot-anchor');
    const r2 = ax ? ax.getBoundingClientRect() : null;
    if (r2 && Number.isFinite(r2.left) && r2.width >= 0.5) {
      cx = r2.left + r2.width / 2;
      cy = r2.top + r2.height / 2;
    } else {
      cx = Math.max(40, (Number(window.innerWidth) || 800) * 0.5);
      cy = 36;
    }
  }
  gm.style.left = `${cx}px`;
  gm.style.top = `${cy}px`;
  gm.classList.add('global-mascot--placed');
}

function syncCustomerCardEmptyVisual() {
  const cc = document.getElementById('customer-card');
  const ce = document.getElementById('cust-empty');
  if (!cc || !ce) return;
  const showEmpty = ce.style.display !== 'none';
  cc.classList.toggle('customer-card--empty', showEmpty);
}

function syncGlobalMascotDock() {
  if (_dockRaf) cancelAnimationFrame(_dockRaf);
  _dockRaf = requestAnimationFrame(() => {
    _dockRaf = null;
    _syncGlobalMascotDockImpl();
  });
}

function _syncGlobalMascotDockImpl() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  const anchor = document.getElementById('sb-mascot-anchor') || document.getElementById('tb-mascot-anchor');
  gm.classList.toggle('global-mascot--muted', isMimiHidden());
  _wireGlobalMascotInteractions();
  if (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif')) {
    gm.classList.add('global-mascot--placed');
    return;
  }
  if (isMimiHidden()) {
    const logo = document.querySelector('.tb-logo');
    const fallback = { left: 80, top: 28, width: 36, height: 34 };
    const lr = logo
      ? logo.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : fallback;
    _placeGlobalMascotAtRect({ left: lr.left + lr.width + 22, top: lr.top + 16, width: 18, height: 18 });
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
    _stopGlobalMascotWander();
    return;
  }
  if (gm.classList.contains('global-mascot--notif-morph')) {
    const nb = document.getElementById('tb-notif-btn');
    const r = nb
      ? nb.getBoundingClientRect()
      : anchor
        ? anchor.getBoundingClientRect()
        : { left: 80, top: 28, width: 36, height: 34 };
    _placeGlobalMascotAtRect(r);
    gm.classList.add('global-mascot--topbar');
    gm.classList.remove('global-mascot--dialer');
    if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
    return;
  }
  const custom = _loadMascotCustomPos();
  if (custom) {
    gm.style.left = `${custom.x}px`;
    gm.style.top = `${custom.y}px`;
    gm.classList.add('global-mascot--custom', 'global-mascot--placed');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    _placeGlobalMascotAtRect(rect);
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar');
  } else {
    const vw = Number(window.innerWidth) || 800;
    _placeGlobalMascotAtRect({ left: vw * 0.5 - 18, top: 52, width: 36, height: 34 });
    gm.classList.remove('global-mascot--custom');
    gm.classList.remove('global-mascot--dialer');
    gm.classList.add('global-mascot--topbar', 'global-mascot--placed');
  }
  const allowWander =
    getMascotWanderPct() > 0 &&
    !gm.classList.contains('global-mascot--peek-chat') &&
    !gm.classList.contains('global-mascot--peek-notif') &&
    !gm.classList.contains('global-mascot--notif-morph');
  if (allowWander) _startGlobalMascotWander();
  else _stopGlobalMascotWander();
  if (!isMimiHidden()) gm.classList.add('global-mascot--placed');
  const info = document.getElementById('global-mascot-info');
  if (info && info.style.display !== 'none') {
    requestAnimationFrame(() => positionGlobalMascotInfoPanel());
  }
}

function syncGlobalMascotMoodFromCustEmpty() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (!root || root.style.display === 'none') {
    gm.removeAttribute('data-mood');
    return;
  }
  if (root.classList.contains('cust-empty--break')) gm.setAttribute('data-mood', 'break');
  else if (root.classList.contains('cust-empty--mascot-angry')) gm.setAttribute('data-mood', 'angry');
  else if (root.classList.contains('cust-empty--mascot-bored')) gm.setAttribute('data-mood', 'bored');
  else if (root.classList.contains('cust-empty--mascot-eat')) gm.setAttribute('data-mood', 'eat');
  else gm.removeAttribute('data-mood');
}

function onCallTickForGlobalMascot() {
  if (typeof dialerStatus === 'undefined' || dialerStatus !== 'on_call') return;
  const sec = typeof callSeconds !== 'undefined' ? callSeconds : 0;
  const heat = Math.min(sec / 90, 1);
  document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', String(heat));
  refreshGlobalMascotInfoPanel();
  const milestones = [30, 70, 115, 175, 240, 330, 450];
  const hit = milestones.find((m) => m <= sec && m > _lastMascotCheerSec);
  if (!hit) return;
  if (isMimiHidden()) return;
  _lastMascotCheerSec = hit;
  const tr = currentLang === 'tr';
  const pool = tr
    ? [
        'Harika gidiyorsun — böyle devam!',
        'Süpersin, ritmini koru.',
        'Ses tonun güven veriyor.',
        'Uzun arama seni güçlendirir; haydi bitirelim!',
        'İyi iş çıkarıyorsun — yaklaşıyoruz.',
        'Müşteri seni dinliyor; net ve sakin.',
        'Profesyonel duruşun çok iyi.',
        'Haydi, başarabilirsin — nefes al, devam.',
        'Zaman uzadıkça sen daha da iyisin; sabır senin gücün.',
      ]
    : [
        'Stark — weiter so!',
        'Sehr gute Kontrol — ruhig bleiben.',
        'Das klingt vertrauenswürdig.',
        'Längere Calls machen Routine — du packst das.',
        'Du bist nah dran — klasse.',
        'Bleib klar — der Kunde hört zu.',
        'Professioneller Auftritt.',
        'Du schaffst das — tief durchatmen, weiter.',
        'Je länger das Gespräch, desto ruhiger wirkst du — top.',
      ];
  const msg = pool[Math.floor(Math.random() * pool.length)];
  _showCustEmptyBubbleMsg(msg);
}

function runGlobalMascotNotifMorph() {
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (_mascotNotifMorphT) clearTimeout(_mascotNotifMorphT);
  gm.classList.remove('global-mascot--notif-open');
  gm.classList.add('global-mascot--notif-morph');
  syncGlobalMascotDock();
  setTimeout(() => gm.classList.add('global-mascot--notif-open'), 420);
  _mascotNotifMorphT = setTimeout(() => {
    gm.classList.remove('global-mascot--notif-morph', 'global-mascot--notif-open');
    _mascotNotifMorphT = null;
    syncGlobalMascotDock();
  }, 2900);
}

function reloadMascotStateForUser() {
  _mascotCallAccumSec = Number(getMascotPref('mb_mascot_call_accum_sec', '0')) || 0;
  _lastMascotCheerSec = -1;
  _mascotCosRandCache = {};
  _mascotVariantRandResolved = '';
  try {
    refreshGlobalMascotInfoPanel();
    applyMascotTheme();
    syncGlobalMascotDock();
  } catch (e) {}
}

try {
  window.syncGlobalMascotDock = syncGlobalMascotDock;
  window.runGlobalMascotNotifMorph = runGlobalMascotNotifMorph;
  window.reloadMascotStateForUser = reloadMascotStateForUser;
} catch (e) {}

let _custEmptyCoachTimer = null;
let _custEmptyChatPeekTimer = null;
let _custEmptyNotifPeekTimer = null;
let _custEmptyNotifPeekDelayT = null;
let _custEmptyLastNotifHint = 0;

function _clearCustEmptyCoachTimer() {
  if (_custEmptyCoachTimer) {
    clearInterval(_custEmptyCoachTimer);
    _custEmptyCoachTimer = null;
  }
}

function _showCustEmptyBubbleMsg(msg) {
  const bubble = document.getElementById('cust-empty-bubble');
  if (!bubble || isMimiHidden() || isMimiBubbleMuted()) return;
  bubble.textContent = formatMascotSpokenLine(msg);
  bubble.style.setProperty('--bubble-shift-x', '0px');
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
  const clampBubble = () => {
    const r = bubble.getBoundingClientRect();
    const pad = 10;
    let shift = 0;
    if (r.left < pad) shift += pad - r.left;
    if (r.right > window.innerWidth - pad) shift -= r.right - (window.innerWidth - pad);
    const maxShift = Math.min(120, Math.max(window.innerWidth, 400) * 0.2);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(clampBubble);
  });
}

function _clearCustEmptyNotifPeek() {
  if (_custEmptyNotifPeekDelayT) {
    clearTimeout(_custEmptyNotifPeekDelayT);
    _custEmptyNotifPeekDelayT = null;
  }
  if (_custEmptyNotifPeekTimer) {
    clearTimeout(_custEmptyNotifPeekTimer);
    _custEmptyNotifPeekTimer = null;
  }
  document.getElementById('cust-empty')?.classList.remove('cust-empty--peek-notif');
  document.getElementById('global-mascot')?.classList.remove('global-mascot--peek-notif');
}

function hintCustEmptyNotifUnread(totalUnread) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  if (root?.classList.contains('cust-empty--peek-chat')) return;
  if (gm.classList.contains('global-mascot--peek-chat')) return;
  const n = Math.max(1, Number(totalUnread) || 1);
  if (Date.now() - _custEmptyLastNotifHint < 85000) return;
  _custEmptyLastNotifHint = Date.now();
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  if (typeof runGlobalMascotNotifMorph === 'function') runGlobalMascotNotifMorph();
  const tr = currentLang === 'tr';
  _showCustEmptyBubbleMsg(
    tr
      ? `Bildirim merkezinde okunmamış öğe var (${n}). Sağ üstteki zile tıkla.`
      : `Ungelesene Benachrichtigungen (${n}). Glocke oben rechts.`
  );
  _custEmptyNotifPeekDelayT = setTimeout(() => {
    _custEmptyNotifPeekDelayT = null;
    root?.classList.add('cust-empty--peek-notif');
    gm.classList.add('global-mascot--peek-notif');
    syncGlobalMascotDock();
  }, 3000);
  _custEmptyNotifPeekTimer = setTimeout(() => {
    _custEmptyNotifPeekTimer = null;
    root?.classList.remove('cust-empty--peek-notif');
    gm.classList.remove('global-mascot--peek-notif');
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }, 14000);
}

function hintCustEmptyChatMessage(fromName) {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!gm) return;
  if (isMimiHidden()) return;
  if (root && root.style.display !== 'none' && root.classList.contains('cust-empty--ringing')) return;
  _clearCustEmptyCoachTimer();
  _clearCustEmptyNotifPeek();
  root?.classList.remove('cust-empty--peek-notif');
  gm.classList.remove('global-mascot--peek-notif');
  root?.classList.add('cust-empty--peek-chat');
  gm.classList.add('global-mascot--peek-chat');
  const tr = currentLang === 'tr';
  const who = fromName && String(fromName).trim() ? String(fromName).trim() : tr ? 'Ekip' : 'Team';
  _showCustEmptyBubbleMsg(
    tr
      ? `Sohbette yeni mesaj — ${who} yazdı. Sağ alttaki sohbet ikonuna bak!`
      : `Neuer Chat — ${who}. Unten rechts das Chat-Symbol!`
  );
  if (_custEmptyChatPeekTimer) clearTimeout(_custEmptyChatPeekTimer);
  _custEmptyChatPeekTimer = setTimeout(() => clearCustEmptyChatPeek(), 14000);
}

function clearCustEmptyChatPeek() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const hadPeek = !!(
    (root && root.classList.contains('cust-empty--peek-chat')) ||
    (gm && gm.classList.contains('global-mascot--peek-chat'))
  );
  if (_custEmptyChatPeekTimer) {
    clearTimeout(_custEmptyChatPeekTimer);
    _custEmptyChatPeekTimer = null;
  }
  root?.classList.remove('cust-empty--peek-chat');
  gm?.classList.remove('global-mascot--peek-chat');
  if (hadPeek) {
    startCustEmptyCoach();
    syncGlobalMascotDock();
  }
}

try {
  window.hintCustEmptyChatMessage = hintCustEmptyChatMessage;
  window.clearCustEmptyChatPeek = clearCustEmptyChatPeek;
  window.hintCustEmptyNotifUnread = hintCustEmptyNotifUnread;
} catch (e) {}

function _custEmptyCoachTargetVisible() {
  const root = document.getElementById('cust-empty');
  const dialer = document.getElementById('page-dialer')?.classList.contains('active');
  return !!(dialer && root && root.style.display !== 'none');
}

function refreshCustEmptyCoachBubble() {
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  const bubble = document.getElementById('cust-empty-bubble');
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (!bubble || !root || root.style.display === 'none' || root.classList.contains('cust-empty--ringing')) {
    if (bubble) bubble.style.display = 'none';
    return;
  }
  if (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif')) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  const tr = currentLang === 'tr';
  const p = window._dialerPerfSnapshot || {};
  const calls = Number(p.calls) || 0;
  const appts = Number(p.appts) || 0;
  const posCalls = Number(p.posCalls) || 0;
  const tdA = Number(p.todayAppts) || 0;
  const tdC = Number(p.todayCalls) || 0;
  const monA = Number(p.monthlyAppts) || 0;
  const scope = p.tab === 'week' ? 'week' : (p.tab === 'month' ? 'month' : 'today');
  const scopeWordTr = scope === 'week' ? 'Bu hafta' : (scope === 'month' ? 'Bu ay' : 'Bugün');
  const scopeWordDe = scope === 'week' ? 'Diese Woche' : (scope === 'month' ? 'Diesen Monat' : 'Heute');
  const goalBase = Math.max(1, Number(_dailyGoal) || 5);
  const goalFactor = scope === 'week' ? 5 : (scope === 'month' ? 22 : 1);
  const periodGoal = goalBase * goalFactor;
  const apptRatio = appts / periodGoal;
  const hasStrongCallVolume = calls >= (12 * goalFactor);
  const roll = Math.random();
  let msg = '';
  if (roll < 0.28) {
    msg = tr
      ? `Bugün ${tdA} termin, ${tdC} çağrı kaydın var.`
      : `Heute ${tdA} Termine, ${tdC} Anrufe notiert.`;
  } else if (roll < 0.36 && monA > 0) {
    msg = tr
      ? `Bu ay ${monA} termin — maskotun da büyüyor.`
      : `Diesen Monat ${monA} Termine — dein Maskottchen wächst mit.`;
  } else if (apptRatio >= 1.1 && hasStrongCallVolume) {
    msg = tr ? `${scopeWordTr} çok tempo var — termin yağmuru!` : `${scopeWordDe} starkes Tempo — viele Termine!`;
  } else if (calls >= (14 * goalFactor) && posCalls === 0) {
    msg = tr ? `${scopeWordTr} çok çağrı aldın; birazdan yakalarsın.` : `${scopeWordDe} viele Anrufe — der Treffer kommt.`;
  } else if (calls >= (10 * goalFactor) && appts === 0) {
    msg = tr ? `${scopeWordTr} ritmin iyi, bir termin çok yakın.` : `${scopeWordDe} guter Rhythmus — Termin in Sicht.`;
  } else if (apptRatio >= 0.9) {
    msg = tr ? `${scopeWordTr} mükemmel iş — akış çok güçlü.` : `${scopeWordDe} sehr starke Buchungen!`;
  } else if (apptRatio >= 0.6) {
    msg = tr ? `${scopeWordTr} harika gidiyor, böyle devam.` : `${scopeWordDe} tolle Serie — weiter so!`;
  } else {
    const pool = tr
      ? [
        'Hazır olunca müşteri kartı burada belirir.',
        'Yeşil düğme aramayı başlatır; kırmızı durdurur.',
        'Kısayollar: Space sustur, Enter ilerlet.',
        'Net ton, kısa cümle — güven verir.',
      ]
      : [
        'Die Kundenkarte erscheint, sobald du startest.',
        'Grün startet, Rot stoppt.',
        'Kurz und klar klingt professionell.',
      ];
    msg = pool[Math.floor(Math.random() * pool.length)];
  }
  _showCustEmptyBubbleMsg(msg);
}

function startCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  if (isMimiHidden() || isMimiBubbleMuted()) return;
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  if (root && (root.classList.contains('cust-empty--peek-chat') || root.classList.contains('cust-empty--peek-notif'))) return;
  if (gm && (gm.classList.contains('global-mascot--peek-chat') || gm.classList.contains('global-mascot--peek-notif'))) return;
  if (!_custEmptyCoachTargetVisible()) return;
  refreshCustEmptyCoachBubble();
  _custEmptyCoachTimer = setInterval(() => refreshCustEmptyCoachBubble(), 52000);
}

function stopCustEmptyCoach() {
  _clearCustEmptyCoachTimer();
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) {
    bubble.style.display = 'none';
    bubble.classList.remove('cust-empty-bubble--pop');
  }
}

let _readyEnteredAt = null;
/** Boş kartta (Hazır değilken) sıkılma/sinir süresi için başlangıç */
let _custEmptyIdleSince = null;
let _mascotMoodTimer = null;
let _mascotEatTimer = null;

/** İç --mx/--my titremesi kaldırıldı; gezinme yalnızca global _wanderFrame ile (diğer sekmelerle aynı). */
function _resetCustEmptyMascotInnerOffset() {
  const mascot = document.getElementById('cust-empty-mascot');
  if (!mascot) return;
  mascot.style.setProperty('--mx', '0px');
  mascot.style.setProperty('--my', '0px');
}

function _stopCustEmptyMascotTimers() {
  if (_mascotMoodTimer) {
    clearInterval(_mascotMoodTimer);
    _mascotMoodTimer = null;
  }
  if (_mascotEatTimer) {
    clearTimeout(_mascotEatTimer);
    _mascotEatTimer = null;
  }
  _resetCustEmptyMascotInnerOffset();
}

function refreshCustEmptyMascotState() {
  const root = document.getElementById('cust-empty');
  if (!root || root.style.display === 'none') {
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (root.classList.contains('cust-empty--ringing')) return;
  root.classList.remove('cust-empty--mascot-bored', 'cust-empty--mascot-angry', 'cust-empty--break');
  const st = typeof dialerStatus !== 'undefined' ? dialerStatus : '';
  if (st === 'break') {
    root.classList.add('cust-empty--break');
    syncGlobalMascotMoodFromCustEmpty();
    return;
  }
  if (st !== 'ready' && st !== 'offline') return;
  if (st === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  const t0 = st === 'ready' && _readyEnteredAt ? _readyEnteredAt : _custEmptyIdleSince || Date.now();
  const waitSec = (Date.now() - t0) / 1000;
  if (waitSec > 120) root.classList.add('cust-empty--mascot-angry');
  else if (waitSec > 45) root.classList.add('cust-empty--mascot-bored');
  syncGlobalMascotMoodFromCustEmpty();
}

function scheduleMascotEatOnce() {
  if (_mascotEatTimer) clearTimeout(_mascotEatTimer);
  const delay = 22000 + Math.floor(Math.random() * 28000);
  _mascotEatTimer = setTimeout(() => {
    _mascotEatTimer = null;
    if (dialerStatus !== 'ready' && dialerStatus !== 'offline') {
      scheduleMascotEatOnce();
      return;
    }
    const root = document.getElementById('cust-empty');
    if (!root || root.classList.contains('cust-empty--ringing')) {
      scheduleMascotEatOnce();
      return;
    }
    root.classList.add('cust-empty--mascot-eat');
    syncGlobalMascotMoodFromCustEmpty();
    setTimeout(() => {
      root.classList.remove('cust-empty--mascot-eat');
      syncGlobalMascotMoodFromCustEmpty();
      scheduleMascotEatOnce();
    }, 2600);
  }, delay);
}

function startCustEmptyMascotLoops() {
  _stopCustEmptyMascotTimers();
  if (dialerStatus === 'offline' && !_custEmptyIdleSince) _custEmptyIdleSince = Date.now();
  refreshCustEmptyMascotState();
  if (dialerStatus !== 'ready' && dialerStatus !== 'break' && dialerStatus !== 'offline') return;
  _mascotMoodTimer = setInterval(refreshCustEmptyMascotState, 8000);
  if (dialerStatus === 'ready' || dialerStatus === 'offline') scheduleMascotEatOnce();
}

/** Aylık termin / hedefe göre büyüme × kullanıcı boyutu (ayarlar 50–150%) */
function updateCustEmptyMascotScale() {
  const root = document.getElementById('cust-empty');
  const gm = document.getElementById('global-mascot');
  const monthlyGoal = Math.max(1, Number(_dailyGoal) || 5) * 22;
  const n = Number(window._dialerPerfSnapshot?.monthlyAppts ?? 0);
  const t = Math.min(Math.max(n / monthlyGoal, 0), 2.2);
  const perf = 1 + 0.28 * t;
  const userMul = getMascotUserScaleMul();
  const combined = perf * userMul;
  const v = String(Math.min(Math.max(combined, 0.45), 2));
  if (root) root.style.setProperty('--mascot-scale', v);
  if (gm) gm.style.setProperty('--mascot-scale', v);
}

async function loadUpcomingWv() {
  const el = document.getElementById('upcoming-wv-list');
  if (!el) return;
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48*60*60*1000).toISOString();
    const list = await sb(`wiedervorlage?agent_id=eq.${currentUser?.id}&durum=eq.bekliyor&termin_zaman=lte.${soon}&order=termin_zaman.asc&limit=5`);
    if (!list?.length) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">Yaklaşan arama yok</div>'; return; }
    el.innerHTML = list.map(w => {
      const dt = new Date(w.termin_zaman);
      const timeStr = dt.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const isOverdue = dt < now;
      return `<div style="padding:5px 8px;background:var(--bg-3);border-radius:5px;border-left:3px solid ${isOverdue?'var(--red)':'var(--yellow)'};" onclick="navigate('wiedervorlage')">
<div style="font-weight:700;font-size:11px;color:${isOverdue?'var(--red)':'var(--text)'};">${w.nachname||w.telefon}</div>
<div style="font-size:10px;color:var(--text-3);">${timeStr}</div>
</div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--text-3);text-align:center;padding:6px;font-size:11px;">—</div>'; }
}

let _unfinalizedCallsOpen = false;
/** TEST gelen arama simülasyonu: dış numara sıklığı için sayaç */
let _inboundSimTickCount = 0;
/** Dış gelen (TEST) fluid vurgusu — proceed’den önce iptal */
let _inboundExternalCueTimer = null;
/** Gelen (TEST) kaydırmalı yanıtlama kartı açık */
let _inboundTestRingOpen = false;
let _inboundRingAutoDeclineTimer = null;
/** Gelen test bağlamı (sahiplik, aktarım, proceed) */
let _inboundTestCtx = null;
let _inboundTestXferPoll = null;

async function _fetchFirmAgentsForInboundTest(fid) {
  const now = Date.now();
  if (window._firmAgentsInboundCache && window._firmAgentsInboundTs && now - window._firmAgentsInboundTs < 45000) {
    return window._firmAgentsInboundCache;
  }
  const rows =
    (await sb(
      `users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&is_active=eq.true&select=id,name&order=name.asc`
    ).catch(() => [])) || [];
  window._firmAgentsInboundCache = rows;
  window._firmAgentsInboundTs = now;
  return rows;
}

/** RLS çoğu zaman sadece kendi satırını döndürür; test senaryoları için isimler (aktarım metni) */
function _testInboundAugmentOthers(others) {
  const base = Array.isArray(others) ? [...others] : [];
  if (base.length >= 2) return base;
  const extra = [
    { id: null, name: 'Ziya' },
    { id: null, name: 'Mehmet' },
  ];
  for (const e of extra) {
    if (base.length >= 2) break;
    if (!base.some((b) => (b.name || '') === e.name)) base.push(e);
  }
  return base;
}

function _maybeConsumeTestTransferInbox() {
  if (!_testMode || dialerStatus !== 'ready') return;
  if (_inboundTestRingOpen || _fakeCallActive || dialerStatus === 'on_call') return;
  if (!currentUser?.id) return;
  const k = `mb_test_xfer_${currentUser.id}`;
  let raw;
  try {
    raw = localStorage.getItem(k);
  } catch (e) {
    return;
  }
  if (!raw) return;
  let p;
  try {
    p = JSON.parse(raw);
  } catch (e) {
    try {
      localStorage.removeItem(k);
    } catch (e2) {}
    return;
  }
  if (Date.now() - (p.ts || 0) > 120000) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
    return;
  }
  try {
    localStorage.removeItem(k);
  } catch (e) {}
  const tr = currentLang === 'tr';
  const phone = String(p.phone || '').trim();
  if (!phone) return;
  const displayName = String(p.displayName || phone).trim();
  const parts = displayName.split(/\s+/);
  const contact = {
    id: `in-${Date.now()}`,
    phone,
    first_name: parts[0] || (tr ? 'Gelen' : 'Eingehend'),
    last_name: parts.slice(1).join(' ') || (tr ? 'Test' : 'Test'),
    firm_id: currentUser.firm_id,
    campaign_id: selectedCampId || campaigns?.[0]?.id || null,
    status: 'pending',
    attempt_count: 0,
    is_inbound_test: true,
    _testScenario: 'forwarded',
    _testFromAgentName: p.fromAgent || '—',
  };
  void beginInboundTestCall({
    phone,
    displayName,
    contact,
    routeDetail: '',
    isExternalInbound: false,
  });
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
    toast('Önce aktif çağrıyı kapatın', 'err', 2200);
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
    toast('Önce aktif çağrıyı kapatın', 'err', 2200);
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
    toast('Sonuçsuz çağrı yüklendi — sonucu girin', 'warn', 2200);
  } catch (e) {}
}

async function toggleReady() {
  refreshDialerHealthPanel();
  if (dialerStatus==='offline' || dialerStatus==='break') {
    if (!selectedCampId) { toast(currentLang==='tr'?'Önce kampanya seçin':'Kampagne auswählen','err'); return; }
    if (!telnyxReady && !_testMode) { toast(currentLang==='tr'?'Hat bağlantısı hazırlanıyor, bekleyin...':'Verbindung wird vorbereitet, bitte warten...','err'); return; }
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
  const code = String(_breakCode || '').trim();
  const trTitle = code ? `Mola — ${code}` : 'Mola — tür seçilmedi';
  const deTitle = code ? `Pause — ${code}` : 'Pause — Typ nicht gewählt';
  title.textContent = currentLang === 'tr' ? trTitle : deTitle;
  if (!_breakStartedAt) {
    sub.textContent = currentLang === 'tr' ? '—' : '—';
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
  const tr = currentLang === 'tr';
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = 'pointer';
  btn.onclick = hangup;
  if (lineUp) {
    lbl.textContent = tr ? 'Kapat' : 'Auflegen';
    btn.style.color = 'var(--red)';
    btn.title = '';
  } else {
    lbl.textContent = tr ? 'Bitir' : 'Beenden';
    btn.style.color = 'var(--accent)';
    btn.title = tr
      ? 'Sonuçlandırmak için önce çağrıyı kapatın. Hat kapandıysa Bitir ile sonuç ekranına geçin.'
      : 'Zum Abschließen zuerst auflegen. Wenn die Leitung weg ist: Beenden.';
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
  const tr = currentLang === 'tr';
  if (lbl) lbl.textContent = tr ? 'Sonuçlandır' : 'Abschließen';
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
}

/** Numara ile ara / WV vb. ön aramadan çık: boş hazır kartına dön (sayfa yenilemeden) */
function returnToDialerHub() {
  if (dialerStatus === 'on_call' || dialerStatus === 'wrapping' || _fakeCallActive || _outboundDialPending) {
    toast(currentLang === 'tr' ? 'Önce aktif çağrıyı kapatın' : 'Zuerst Gespräch beenden', 'err', 2200);
    return;
  }
  currentContact = null;
  window._manualDialLastResults = null;
  closeManualDialDrawer();
  clearCustomerCard();
  if (typeof refreshDialerHealthPanel === 'function') refreshDialerHealthPanel();
  const tr = currentLang === 'tr';
  toast(tr ? 'Dialer hazır ekranına dönüldü' : 'Zurück zur Bereitschaft', 'ok', 2400);
}

function syncDialerBottomChrome() {
  const readySec = document.getElementById('ready-section');
  const callAct = document.getElementById('call-actions');
  const hold = document.getElementById('btn-hold');

  const resetHold = () => {
    if (hold) hold.disabled = false;
  };

  if (dialerStatus === 'on_call' || dialerStatus === 'wrapping') {
    if (callAct) callAct.classList.remove('call-actions--pre-call');
    if (dialerStatus === 'on_call') resetHold();
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
}

function setDialerStatus(s) {
  const prev = dialerStatus;
  dialerStatus = s;
  if (s === 'ready' && prev !== 'ready') {
    _readyEnteredAt = Date.now();
    _custEmptyIdleSince = null;
  } else if (s !== 'ready') {
    _readyEnteredAt = null;
  }
  if (s === 'offline' && prev !== 'offline') {
    _custEmptyIdleSince = Date.now();
  }
  updateDialerNavCallIndicator();
  const dot    = document.getElementById('status-dot');
  const label  = document.getElementById('status-label');
  const rdyBtn = document.getElementById('btn-ready');
  const rdyTxt = document.getElementById('ready-text');
  const rdyIc  = document.getElementById('ready-icon');
  if (dot) { dot.className = `status-dot ${s}`; }
  const labels = {
    offline: {tr:'Çevrimdışı',de:'Offline'},
    ready:   {tr:'Hazır — Arama Bekleniyor',de:'Bereit — Warte auf Anruf'},
    calling: {tr:'Ön arama',de:'Vor Anruf'},
    on_call: {tr:'Aramada',de:'Im Gespräch'},
    wrapping:{tr:'Sonuç Giriliyor',de:'Nachbearbeitung'},
    break:   {tr:'Mola',de:'Pause'},
  };
  if (label) label.textContent = labels[s]?.[currentLang]||s;
  refreshStatusElapsed();
  const callAct = document.getElementById('call-actions');
  if (callAct) callAct.classList.remove('call-actions--wrapping');

  if (s==='offline'||s==='break') {
    if (rdyBtn) rdyBtn.className='btn-ready-big ready';
    if (rdyIc) rdyIc.textContent='▶';
    if (rdyTxt) {
      rdyTxt.setAttribute('data-tr', 'Hazır — Aramayı Başlat');
      rdyTxt.setAttribute('data-de', 'Bereit — Start');
      rdyTxt.textContent = currentLang === 'tr' ? 'Hazır — Aramayı Başlat' : 'Bereit schalten';
    }
    document.getElementById('ready-section').style.display='';
    if (callAct) callAct.style.display='none';
    document.getElementById('customer-card').style.display='';
    _clearHangupUiTick();
  } else if (s==='ready') {
    if (rdyBtn) rdyBtn.className='btn-ready-big stop';
    if (rdyIc) rdyIc.textContent='⏹';
    if (rdyTxt) {
      rdyTxt.setAttribute('data-tr', 'Durdur');
      rdyTxt.setAttribute('data-de', 'Stoppen');
      rdyTxt.textContent = currentLang === 'tr' ? 'Durdur' : 'Stoppen';
    }
    document.getElementById('ready-section').style.display='';
    if (callAct) callAct.style.display='none';
    document.getElementById('customer-card').style.display='';
    _clearHangupUiTick();
  } else if (s==='calling') {
    document.getElementById('customer-card').style.display='';
    _clearHangupUiTick();
  } else if (s==='on_call') {
    document.getElementById('ready-section').style.display='none';
    if (callAct) {
      callAct.style.display='';
      callAct.classList.remove('call-actions--wrapping');
    }
    const tblk = document.getElementById('dialer-timer-block');
    if (tblk) tblk.style.display = 'flex';
    document.getElementById('customer-card').style.display='';
    startCallTimer();
    _startHangupUiTick();
    _applyMicSensitivityToLiveCall();
    _startMicThresholdGate();
  } else if (s==='wrapping') {
    if (typeof startAcwTimer === 'function') startAcwTimer();
    document.getElementById('ready-section').style.display='none';
    if (callAct) {
      callAct.style.display='';
      callAct.classList.add('call-actions--wrapping');
    }
    stopCallTimer();
    _clearHangupUiTick();
    // Önceki sonuç seçimini temizle
    selectedOutcome = null;
    document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
    const cbRow2 = document.getElementById('callback-time-row');
    if (cbRow2) cbRow2.style.display = 'none';
    const cbDt = document.getElementById('callback-dt');
    if (cbDt) cbDt.value = '';
    const noteEl = document.getElementById('outcome-note');
    if (noteEl) noteEl.value = '';
    const dncEl = document.getElementById('outcome-dnc');
    if (dncEl) dncEl.checked = false;
    const hasSlot = _bookingSlot || window._selectedBookingSlot;
    document.getElementById('customer-card').style.display='';
    if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
    if (typeof switchContactTab === 'function') {
      switchContactTab(hasSlot ? 'info' : 'outcome');
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
  if ((s === 'ready' || s === 'offline' || s === 'calling') && currentContact) {
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
      'cust-empty--mascot-eat'
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
  const btn1 = document.getElementById('nav-dialer-btn');
  const btn2 = document.getElementById('nav-admin-dialer-btn');
  [btn1, btn2].forEach((b) => {
    if (!b) return;
    b.classList.toggle('dialer-calling', onCall);
  });
}

async function dialNext() {
  refreshDialerHealthPanel();
  if (dialerStatus !== 'ready') return;
  if (!selectedCampId) {
    toast('Önce kampanya seçin', 'err');
    setDialerStatus('offline');
    updateSessionInDB('offline');
    return;
  }
  if (!_testMode && !checkCallAllowed()) return;

  // Test modunda Telnyx gerekmez
  if (_testMode) {
    await startTestCall();
    return;
  }

  if (!telnyxReady) {
    toast(currentLang==='tr' ? 'Hat bağlantısı bekleniyor...' : 'Warte auf Verbindung...', 'err');
    return;
  }
  const autoCampIds = getAutoDialCampaignIds();
  if (!autoCampIds.length) {
    toast('Otomatik arama izni olan aktif kampanya yok', 'warn');
    setDialerStatus('offline');
    updateSessionInDB('offline');
    return;
  }
  const contact = await getNextContact(autoCampIds);
  if (!contact) {
    toast(currentLang==='tr' ? '✅ Kuyrukta numara kalmadı' : '✅ Keine Nummern mehr', 'ok');
    setDialerStatus('offline'); updateSessionInDB('offline');
    return;
  }
  currentContact = contact;
  _outboundDialPending = true;
  showCustomerCard(contact);
  try {
    await sb(`contacts?id=eq.${contact.id}`, { method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ status:'calling', last_called_at: new Date().toISOString() })
    });
  } catch(e) {}
  const campaign = campaigns.find(c => c.id === selectedCampId);
  sendToRTC('MB_CALL', { destination: contact.phone, callerNumber: campaign?.telnyx_did || '' });
}

function getDialerHealthState() {
  const checks = [];
  const push = (ok, label) => checks.push({ ok, label });
  push(!!selectedCampId, 'Kampanya seçildi');
  const campActiveOk =
    !!selectedCampId &&
    (_activeCampIds.length === 0 || _activeCampIds.includes(selectedCampId));
  push(campActiveOk, 'Aktif kampanya var');
  push(_testMode || !!telnyxReady, _testMode ? 'Test modu aktif' : 'Hat bağlantısı hazır');
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 8);
  const callWindow = isCallAllowed(dateStr, timeStr).allowed;
  push(_testMode || callWindow, 'Saat kısıtı uygun');
  push(typeof micGranted === 'undefined' ? true : !!micGranted, 'Mikrofon izni');
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
  const msg = firstFail ? `Bekleniyor: ${firstFail.label}` : 'Tüm kontroller geçildi. Arama başlatılabilir.';
  return { checks, code, msg };
}

function refreshDialerHealthPanel() {
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
    const why =
      h.code === 'DIAL-CAMP' ? (currentLang === 'tr' ? 'Kampanya seçin' : 'Kampagne wählen') :
      h.code === 'DIAL-ACTIVE' ? (currentLang === 'tr' ? 'Aktif kampanya yok' : 'Keine aktive Kampagne') :
      h.code === 'DIAL-SIP' ? (currentLang === 'tr' ? 'Hat hazır değil' : 'Verbindung nicht bereit') :
      h.code === 'DIAL-HOURS' ? (currentLang === 'tr' ? 'Saat kısıtı' : 'Zeitfenster') :
      (currentLang === 'tr' ? 'Mikrofon izni' : 'Mikrofon');
    txt.setAttribute('data-tr', ok ? 'Durdur' : `Durdur (${why})`);
    txt.setAttribute('data-de', ok ? 'Stoppen' : `Stoppen (${why})`);
    txt.textContent = ok
      ? (currentLang === 'tr' ? 'Durdur' : 'Stoppen')
      : (currentLang === 'tr' ? `Durdur (${why})` : `Stoppen (${why})`);
    return;
  }

  const base = currentLang === 'tr' ? 'Hazır — Aramayı Başlat' : 'Bereit — Start';
  txt.setAttribute('data-tr', 'Hazır — Aramayı Başlat');
  txt.setAttribute('data-de', 'Bereit — Start');
  if (ok) txt.textContent = base;
  else {
    const why =
      h.code === 'DIAL-CAMP' ? (currentLang === 'tr' ? 'Kampanya seçin' : 'Kampagne wählen') :
      h.code === 'DIAL-ACTIVE' ? (currentLang === 'tr' ? 'Aktif kampanya yok' : 'Keine aktive Kampagne') :
      h.code === 'DIAL-SIP' ? (currentLang === 'tr' ? 'Hat bağlantısı hazır değil' : 'Verbindung nicht bereit') :
      h.code === 'DIAL-HOURS' ? (currentLang === 'tr' ? 'Saat kısıtı' : 'Zeitfenster') :
      (currentLang === 'tr' ? 'Mikrofon izni' : 'Mikrofon');
    txt.textContent = `${base} (${why})`;
  }
}

async function updateSessionInDB(status) {
  if (!currentUser) return;
  try {
    await upsertAgentSession({
      agent_id: currentUser.id, agent_name: currentUser.name,
      status, last_seen: new Date().toISOString()
    });
  } catch(e) {}
}

// ── Call timer ────────────────────────────────
function _dialerVoiceProgressFromSeconds(sec) {
  const t = Math.min(1, Number(sec || 0) / 150);
  return Math.round(t * 1000) / 1000;
}

function updateDialerVoiceVisuals(seconds) {
  const page = document.getElementById('page-dialer');
  if (!page) return;
  const p = _dialerVoiceProgressFromSeconds(seconds);
  page.style.setProperty('--voice-progress', String(p));
}

function resetDialerVoiceVisuals() {
  if (typeof stopDialerVoiceRings === 'function') stopDialerVoiceRings();
  const page = document.getElementById('page-dialer');
  if (!page) return;
  page.style.removeProperty('--voice-progress');
}

function startCallTimer() {
  clearInterval(callTimerInt);
  callSeconds = 0;
  _lastMascotCheerSec = -1;
  refreshStatusElapsed();
  updateDialerVoiceVisuals(0);
  if (typeof startDialerVoiceRings === 'function') startDialerVoiceRings();
  callTimerInt = setInterval(()=>{
    callSeconds++;
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0');
    const s=String(callSeconds%60).padStart(2,'0');
    const el = document.getElementById('dialer-timer');
    if (el) el.textContent=`${m}:${s}`;
    refreshStatusElapsed();
    updateDialerVoiceVisuals(callSeconds);
    if (typeof onCallTickForGlobalMascot === 'function') onCallTickForGlobalMascot();
  },1000);
}

function stopCallTimer() {
  const lastDur = Number(callSeconds) || 0;
  clearInterval(callTimerInt);
  _lastMascotCheerSec = -1;
  document.getElementById('global-mascot')?.style.setProperty('--mascot-call-heat', '0');
  if (lastDur > 0) {
    _mascotCallAccumSec += lastDur;
    setMascotPref('mb_mascot_call_accum_sec', String(_mascotCallAccumSec));
    if (lastDur < 60 && !isMimiHidden()) {
      _showCustEmptyBubbleMsg(
        currentLang === 'tr'
          ? 'Sanırım olmadı; bence diğer çağrıda başaracağız.'
          : 'Hat wohl nicht gereicht; den nächsten holen wir.'
      );
    }
  }
  refreshGlobalMascotInfoPanel();
  const tblk = document.getElementById('dialer-timer-block');
  if (tblk) tblk.style.display='none';
  resetDialerVoiceVisuals();
  refreshStatusElapsed();
}

// ── Call controls ─────────────────────────────
function toggleMute() {
  if ((_micForcedMute || _micThresholdForcedMute) && !isMuted) {
    toast(currentLang === 'tr' ? 'Eşik altında mikrofon kapalı (eşiği belirgin geçin)' : 'Unter Schwelle bleibt Mikrofon stumm', 'warn', 1800);
    return;
  }
  const pre = document.getElementById('call-actions')?.classList.contains('call-actions--pre-call');
  const lineUp = !!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending;
  if (pre && !lineUp && dialerStatus !== 'on_call') {
    if (typeof toggleMicAudioDrawer === 'function') toggleMicAudioDrawer();
    return;
  }
  isMuted=!isMuted;
  document.getElementById('btn-mute')?.classList.toggle('active',isMuted);
  if (isMuted) _micThresholdForcedMute = false;
  sendToRTC('MB_MUTE',{muted:isMuted});
  toast(isMuted?(currentLang==='tr'?'Mikrofon kapatıldı':'Mikrofon stumm'):(currentLang==='tr'?'Mikrofon açıldı':'Mikrofon aktiv'),'ok');
}

function toggleHold() {
  if (document.getElementById('call-actions')?.classList.contains('call-actions--pre-call') && dialerStatus !== 'on_call') {
    toast(currentLang === 'tr' ? 'Önce arama başlatın' : 'Zuerst Anruf starten', 'warn');
    return;
  }
  isOnHold=!isOnHold;
  document.getElementById('btn-hold')?.classList.toggle('active',isOnHold);
  sendToRTC('MB_HOLD',{hold:isOnHold});
  toast(isOnHold?(currentLang==='tr'?'Çağrı beklemeye alındı':'Anruf gehalten'):(currentLang==='tr'?'Çağrı devam ediyor':'Anruf fortgesetzt'),'ok');
}

function hangup() {
  if (_fakeCallActive || _testMode) { endFakeCall(); return; }
  if (_telnyxCall) {
    sendToRTC('MB_HANGUP');
    return;
  }
  if (dialerStatus === 'on_call') handleCallEnd(Math.floor(callSeconds) || 0);
}

async function refreshDialerCampaignCacheIfEmpty() {
  if (!currentUser) return;
  if (Array.isArray(campaigns) && campaigns.length > 0) return;
  const role = currentUser?.role || '';
  const adminLike = ['admin', 'firm_admin', 'super_admin', 'qc'].includes(role);
  const firmScopeId = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser.firm_id;
  if (adminLike && role === 'super_admin' && !firmScopeId) return;
  let myCamps = [];
  if (adminLike && firmScopeId) {
    const allCamps = (await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${firmScopeId}&order=created_at.desc`)) || [];
    myCamps = allCamps.map((c) => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
  } else {
    myCamps = (await sb(`agent_campaigns?select=*,campaigns(*,queues(*))&agent_id=eq.${currentUser.id}`)) || [];
    if (!myCamps.length && currentUser.firm_id) {
      const allCamps = (await sb(`campaigns?select=*,queues(*)&status=eq.active&firm_id=eq.${currentUser.firm_id}&order=created_at.desc`)) || [];
      myCamps = allCamps.map((c) => ({ campaign_id: c.id, campaigns: c, agent_id: currentUser.id }));
    }
  }
  campaigns = (myCamps || []).map((ac) => ac.campaigns).filter(Boolean);
}

function redialCurrentContact() {
  if (!currentContact?.phone) {
    toast(currentLang === 'tr' ? 'Önce müşteri / numara yok' : 'Kein Kontakt / Nummer', 'err');
    return;
  }
  if (!_testMode && !telnyxReady) {
    toast(currentLang === 'tr' ? 'Hat bağlantısı yok' : 'Keine Verbindung', 'err');
    return;
  }
  const campId = currentContact.campaign_id || selectedCampId;
  const campaign = campaigns.find((c) => c.id === campId);
  if (campId) selectCamp(campId, campaign?.name || '', { skipActivate: true });
  if (_testMode) {
    _fakeCallActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    toast(currentLang === 'tr' ? 'TEST: Tekrar aranıyor' : 'TEST: erneuter Anruf', 'ok', 2200);
    return;
  }
  setDialerStatus('on_call');
  _outboundDialPending = true;
  sendToRTC('MB_CALL', { destination: currentContact.phone, callerNumber: campaign?.telnyx_did || '' });
  updateSessionInDB('on_call').catch(() => {});
  if (typeof switchContactTab === 'function') switchContactTab('info');
}

function callSecondaryPhone() {
  const p2 = String(currentContact?.phone2 || '').trim();
  if (!p2) {
    toast(currentLang === 'tr' ? '2. telefon numarası yok' : 'Keine zweite Nummer', 'warn');
    return;
  }
  if (!_testMode && !telnyxReady) {
    toast(currentLang === 'tr' ? 'Hat bağlantısı yok' : 'Keine Verbindung', 'err');
    return;
  }
  const campId = currentContact?.campaign_id || selectedCampId;
  const campaign = campaigns.find((c) => c.id === campId);
  if (campId) selectCamp(campId, campaign?.name || '', { skipActivate: true });
  if (_testMode) {
    _fakeCallActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    toast(currentLang === 'tr' ? 'TEST: 2. numara aranıyor' : 'TEST: Zweitnummer wird angerufen', 'ok', 2200);
    return;
  }
  setDialerStatus('on_call');
  _outboundDialPending = true;
  sendToRTC('MB_CALL', { destination: p2, callerNumber: campaign?.telnyx_did || '' });
  updateSessionInDB('on_call').catch(() => {});
  if (typeof switchContactTab === 'function') switchContactTab('info');
}

function _manualDialNormalizeDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function _manualDialVariants(raw) {
  const t = String(raw || '').trim();
  const d = _manualDialNormalizeDigits(t);
  const set = new Set();
  if (t) set.add(t);
  if (d) {
    set.add(d);
    if (d.length > 10) set.add(d.slice(-10));
    if (d.startsWith('0')) set.add(d.replace(/^0+/, ''));
    if (d.length === 10 && !d.startsWith('0')) set.add(`0${d}`);
  }
  return [...set].filter(Boolean).slice(0, 12);
}

async function _manualDialFetchRows(variants, campIds) {
  const merged = new Map();
  for (const v of variants) {
    const enc = encodeURIComponent(v);
    const path = `contacts?campaign_id=in.(${campIds.join(',')})&or=(phone.eq.${enc},phone2.eq.${enc})&select=*,queues(name,status)&limit=25`;
    try {
      const rows = await sb(path);
      (rows || []).forEach((r) => merged.set(r.id, r));
    } catch (e) {}
  }
  if (!merged.size && variants.length) {
    const d = _manualDialNormalizeDigits(variants[0]);
    const core = d.slice(-9);
    if (core.length >= 6) {
      const pat = encodeURIComponent(`*${core}*`);
      const path2 = `contacts?campaign_id=in.(${campIds.join(',')})&or=(phone.like.${pat},phone2.like.${pat})&select=*,queues(name,status)&limit=25`;
      try {
        const rows2 = await sb(path2);
        (rows2 || []).forEach((r) => merged.set(r.id, r));
      } catch (e) {}
    }
  }
  return [...merged.values()];
}

function closeManualDialDrawer() {
  const el = document.getElementById('manual-dial-drawer');
  if (el) el.style.display = 'none';
  document.getElementById('manual-dial-toggle')?.classList.remove('is-open');
}

function toggleManualDialDrawer() {
  if (_hasLiveCallInProgress()) {
    toast('Aktif çağrı varken numara ile aramaya geçilemez', 'err', 2200);
    return;
  }
  const el = document.getElementById('manual-dial-drawer');
  const chip = document.getElementById('manual-dial-toggle');
  if (!el) return;
  const isOpen = el.style.display !== 'none' && el.style.display !== '';
  if (isOpen) {
    closeManualDialDrawer();
    return;
  }
  closeMicAudioDrawer();
  el.style.display = 'block';
  chip?.classList.add('is-open');
  setTimeout(() => document.getElementById('manual-dial-input')?.focus(), 40);
}

function _micDrawerWireControlsOnce() {
  if (window._micDrawerControlsWired) return;
  window._micDrawerControlsWired = true;
  const gainEl = document.getElementById('mic-drawer-gain');
  const thrEl = document.getElementById('mic-drawer-threshold');
  gainEl?.addEventListener('input', () => {
    localStorage.setItem('mb_mic_drawer_gain', gainEl.value);
    const g = parseFloat(gainEl.value);
    if (_micDrawerInputGain) _micDrawerInputGain.gain.value = Number.isFinite(g) ? g : 1;
    _applyMicSensitivityToLiveCall();
    if (_micGateAnalyser) _runMicThresholdGateTick();
  });
  thrEl?.addEventListener('input', () => {
    localStorage.setItem('mb_mic_drawer_thresh', thrEl.value);
    const t = document.getElementById('mic-drawer-in-threshold');
    if (t) t.style.left = `${thrEl.value}%`;
    if (_micGateAnalyser) _runMicThresholdGateTick();
  });
}

function _micDrawerLoadPrefs() {
  const g = localStorage.getItem('mb_mic_drawer_gain');
  const t = localStorage.getItem('mb_mic_drawer_thresh');
  const ge = document.getElementById('mic-drawer-gain');
  const te = document.getElementById('mic-drawer-threshold');
  if (ge && g) ge.value = g;
  if (te && t) te.value = t;
  if (_micDrawerInputGain && ge) _micDrawerInputGain.gain.value = parseFloat(ge.value) || 1;
  const trEl = document.getElementById('mic-drawer-in-threshold');
  if (trEl && te) trEl.style.left = `${te.value}%`;
  _applyMicSensitivityToLiveCall();
}

function _getMicThresholdValue() {
  const te = document.getElementById('mic-drawer-threshold');
  const raw = te?.value ?? localStorage.getItem('mb_mic_drawer_thresh') ?? '18';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 18;
}

function _getMicGainValue() {
  const ge = document.getElementById('mic-drawer-gain');
  const raw = ge?.value ?? localStorage.getItem('mb_mic_drawer_gain') ?? '1';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.min(4, Math.max(0, n)) : 1;
}

function _computeMicLevelPctFromAvg(avg, gain) {
  const gainForMeter = Math.min(2.2, Math.max(0.75, Number.isFinite(gain) ? gain : 1));
  return Math.min(100, (avg * 0.62 * gainForMeter) + (avg > 4 ? 6 : 0));
}

function _applyMicSensitivityToLiveCall() {
  const gain = _getMicGainValue();
  const hardMute = Number.isFinite(gain) && gain <= 0.05;
  if (hardMute && !_micForcedMute) {
    _micForcedMute = true;
    _micGateOpenUntilMs = 0;
    sendToRTC('MB_MUTE', { muted: true });
    if (dialerStatus === 'on_call') {
      toast(currentLang === 'tr' ? 'Hassasiyet 0: mikrofon çağrıda kapatıldı' : 'Empfindlichkeit 0: Mikrofon stumm', 'warn', 2200);
    }
    return;
  }
  if (!hardMute && _micForcedMute) {
    _micForcedMute = false;
    if (!isMuted) {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
}

function _stopMicThresholdGate() {
  if (_micGateRaf) {
    cancelAnimationFrame(_micGateRaf);
    _micGateRaf = null;
  }
  if (_micGateStream) {
    try { _micGateStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    _micGateStream = null;
  }
  try { _micGateCtx?.close(); } catch (e) {}
  _micGateCtx = null;
  _micGateAnalyser = null;
  _micGateLevelPct = 0;
  _micGateOpenUntilMs = 0;
  if (_micThresholdForcedMute) {
    _micThresholdForcedMute = false;
    if (!_micForcedMute && !isMuted && dialerStatus === 'on_call') {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
}

function _runMicThresholdGateTick() {
  if (!_micGateAnalyser || dialerStatus !== 'on_call') {
    _stopMicThresholdGate();
    return;
  }
  const threshold = _getMicThresholdValue();
  const gain = _getMicGainValue();
  const buf = new Uint8Array(_micGateAnalyser.frequencyBinCount);
  _micGateAnalyser.getByteFrequencyData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const avg = sum / buf.length;
  const levelPct = _computeMicLevelPctFromAvg(avg, gain);
  _micGateLevelPct = levelPct;
  const openMargin = threshold <= 5 ? 1 : (threshold <= 20 ? 2 : 4);
  const closeMargin = threshold <= 5 ? 0.5 : (threshold <= 20 ? 1 : 2);
  const openThreshold = Math.min(100, threshold + openMargin);
  const closeThreshold = Math.min(100, threshold + closeMargin);
  const now = Date.now();
  if (levelPct >= openThreshold) _micGateOpenUntilMs = now + 700;
  const gateOpen = levelPct >= closeThreshold || now < _micGateOpenUntilMs;
  const canAutoMute = !_micForcedMute && !isMuted;

  if (!canAutoMute && _micThresholdForcedMute) {
    _micThresholdForcedMute = false;
  }

  if (!gateOpen && canAutoMute && !_micThresholdForcedMute) {
    _micThresholdForcedMute = true;
    sendToRTC('MB_MUTE', { muted: true });
  } else if (gateOpen && _micThresholdForcedMute) {
    _micThresholdForcedMute = false;
    if (!_micForcedMute && !isMuted) {
      sendToRTC('MB_MUTE', { muted: false });
    }
  }
  _micGateRaf = requestAnimationFrame(_runMicThresholdGateTick);
}

async function _startMicThresholdGate() {
  _stopMicThresholdGate();
  if (dialerStatus !== 'on_call') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _micGateStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _micGateCtx = new Ctx();
    const src = _micGateCtx.createMediaStreamSource(_micGateStream);
    _micGateAnalyser = _micGateCtx.createAnalyser();
    _micGateAnalyser.fftSize = 512;
    _micGateAnalyser.smoothingTimeConstant = 0.72;
    src.connect(_micGateAnalyser);
    _runMicThresholdGateTick();
  } catch (e) {
    _stopMicThresholdGate();
  }
}

function saveMicDrawerPrefs() {
  const ge = document.getElementById('mic-drawer-gain');
  const te = document.getElementById('mic-drawer-threshold');
  if (ge) localStorage.setItem('mb_mic_drawer_gain', ge.value);
  if (te) localStorage.setItem('mb_mic_drawer_thresh', te.value);
  if (_micDrawerInputGain && ge) {
    const g = parseFloat(ge.value);
    _micDrawerInputGain.gain.value = Number.isFinite(g) ? g : 1;
  }
  const trEl = document.getElementById('mic-drawer-in-threshold');
  if (trEl && te) trEl.style.left = `${te.value}%`;
  _applyMicSensitivityToLiveCall();
  toast(currentLang === 'tr' ? 'Mikrofon ayarları kaydedildi' : 'Mikrofoneinstellungen gespeichert', 'ok', 1800);
}

function _micDrawerStopAudioCore() {
  _micDrawerMonitoring = false;
  if (_micDrawerRaf) {
    cancelAnimationFrame(_micDrawerRaf);
    _micDrawerRaf = null;
  }
  if (_micDrawerStream) {
    try { _micDrawerStream.getTracks().forEach((x) => x.stop()); } catch (e) {}
    _micDrawerStream = null;
  }
  try { _micDrawerInputCtx?.close(); } catch (e) {}
  try { _micDrawerRemoteCtx?.close(); } catch (e) {}
  _micDrawerInputCtx = null;
  _micDrawerRemoteCtx = null;
  _micDrawerInputGain = null;
  _micDrawerInAn = null;
  _micDrawerOutAn = null;
}

function _micDrawerTick() {
  if (!_micDrawerMonitoring) return;
  const inMeter = document.getElementById('mic-drawer-in-meter');
  const outMeter = document.getElementById('mic-drawer-out-meter');
  const thrVal = parseFloat(document.getElementById('mic-drawer-threshold')?.value || '18');
  if (_micDrawerInAn) {
    const buf = new Uint8Array(_micDrawerInAn.frequencyBinCount);
    _micDrawerInAn.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const avg = sum / buf.length;
    const gain = parseFloat(document.getElementById('mic-drawer-gain')?.value || '1');
    const v = _computeMicLevelPctFromAvg(avg, gain);
    const gainForMeter = Math.min(2.2, Math.max(0.75, Number.isFinite(gain) ? gain : 1));
    const effectiveThreshold = Math.max(6, thrVal * (gainForMeter < 1 ? 0.82 : 1));
    if (inMeter) {
      inMeter.style.width = `${v}%`;
      inMeter.style.opacity = v >= effectiveThreshold ? '1' : '0.55';
    }
  } else if (inMeter) inMeter.style.width = '0%';
  if (_micDrawerOutAn) {
    const buf2 = new Uint8Array(_micDrawerOutAn.frequencyBinCount);
    _micDrawerOutAn.getByteFrequencyData(buf2);
    let s2 = 0;
    for (let i = 0; i < buf2.length; i++) s2 += buf2[i];
    const v2 = Math.min(100, (s2 / buf2.length) * 0.55);
    if (outMeter) outMeter.style.width = `${v2}%`;
  } else if (outMeter) outMeter.style.width = '0%';
  _micDrawerRaf = requestAnimationFrame(_micDrawerTick);
}

async function startMicDrawerMonitor() {
  if (_micDrawerMonitoring) return;
  _micDrawerStopAudioCore();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _micDrawerStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _micDrawerInputCtx = new Ctx();
    const src = _micDrawerInputCtx.createMediaStreamSource(_micDrawerStream);
    _micDrawerInputGain = _micDrawerInputCtx.createGain();
    _micDrawerInputGain.gain.value = parseFloat(document.getElementById('mic-drawer-gain')?.value || '1');
    _micDrawerInAn = _micDrawerInputCtx.createAnalyser();
    _micDrawerInAn.fftSize = 512;
    src.connect(_micDrawerInputGain).connect(_micDrawerInAn);
    if (window._telnyxRemoteStream) {
      try {
        _micDrawerRemoteCtx = new Ctx();
        const rsrc = _micDrawerRemoteCtx.createMediaStreamSource(window._telnyxRemoteStream);
        _micDrawerOutAn = _micDrawerRemoteCtx.createAnalyser();
        _micDrawerOutAn.fftSize = 512;
        rsrc.connect(_micDrawerOutAn);
      } catch (e) {
        _micDrawerOutAn = null;
      }
    }
    _micDrawerMonitoring = true;
    const btn = document.getElementById('mic-drawer-monitor-btn');
    const sp = btn?.querySelector('span');
    if (sp) {
      sp.textContent = currentLang === 'tr' ? 'Dinlemeyi durdur' : 'Überwachung stoppen';
      sp.setAttribute('data-tr', 'Dinlemeyi durdur');
      sp.setAttribute('data-de', 'Überwachung stoppen');
    }
    micGranted = true;
    if (typeof updateMicStatus === 'function') updateMicStatus(true);
    _micDrawerTick();
  } catch (e) {
    toast(currentLang === 'tr' ? 'Mikrofon açılamadı: ' + e.message : 'Mikrofon: ' + e.message, 'err');
    _micDrawerStopAudioCore();
  }
}

function stopMicDrawerMonitor() {
  _micDrawerStopAudioCore();
  const btn = document.getElementById('mic-drawer-monitor-btn');
  const sp = btn?.querySelector('span');
  if (sp) {
    sp.textContent = currentLang === 'tr' ? 'Dinlemeyi başlat' : 'Überwachung starten';
    sp.setAttribute('data-tr', 'Dinlemeyi başlat');
    sp.setAttribute('data-de', 'Überwachung starten');
  }
}

function toggleMicDrawerMonitor() {
  if (_micDrawerMonitoring) stopMicDrawerMonitor();
  else void startMicDrawerMonitor();
}

function playMicDrawerBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.connect(g).connect(ctx.destination);
    o.start();
    setTimeout(() => {
      try { o.stop(); } catch (e) {}
      ctx.close();
    }, 280);
  } catch (e) {
    toast('Beep: ' + (e.message || 'err'), 'err');
  }
}

function closeMicAudioDrawer() {
  const el = document.getElementById('mic-audio-drawer');
  if (el) el.style.display = 'none';
  stopMicDrawerMonitor();
}

function toggleMicAudioDrawer() {
  const el = document.getElementById('mic-audio-drawer');
  if (!el) return;
  const isOpen = el.style.display !== 'none' && el.style.display !== '';
  if (isOpen) {
    closeMicAudioDrawer();
    return;
  }
  closeManualDialDrawer();
  _micDrawerWireControlsOnce();
  _micDrawerLoadPrefs();
  el.style.display = 'block';
}

async function runManualDialSearch() {
  if (_hasLiveCallInProgress()) {
    toast('Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  const input = document.getElementById('manual-dial-input');
  const out = document.getElementById('manual-dial-results');
  if (!input || !out || !currentUser) return;
  const raw = input.value.trim();
  if (!raw) {
    toast(currentLang === 'tr' ? 'Numara girin' : 'Nummer eingeben', 'warn');
    return;
  }
  const tr = currentLang === 'tr';
  out.innerHTML = `<div style="color:var(--text-3);padding:8px;">${tr ? 'Aranıyor…' : 'Suche…'}</div>`;
  await refreshDialerCampaignCacheIfEmpty();
  const campIds = (campaigns || []).map((c) => c.id).filter(Boolean);
  if (!campIds.length) {
    out.innerHTML = `<div style="color:var(--red);padding:8px;">${tr ? 'Kampanya yüklenemedi — önce Dialer sayfasını açın veya firma seçin.' : 'Keine Kampagne — Dialer öffnen oder Firma wählen.'}</div>`;
    return;
  }
  const variants = _manualDialVariants(raw);
  try {
    const rows = await _manualDialFetchRows(variants, campIds);
    window._manualDialLastResults = rows;
    if (!rows.length) {
      const adhoc = _buildAdhocDialContact(raw);
      const saved = await _persistAdhocDialContact(adhoc);
      window._manualDialLastResults = [saved];
      out.innerHTML = `<button type="button" class="manual-dial-pick" data-idx="0" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;border:1px solid var(--accent);border-radius:8px;background:var(--accent-soft);cursor:pointer;font-size:12px;">
<div style="font-weight:800;">${String(saved.phone || raw).replace(/</g, '&lt;')}</div>
<div style="color:var(--text-2);margin-top:2px;">${tr ? 'Yeni çağrı olarak oluşturuldu — açmak için tıkla' : 'Als neuer Kontakt erstellt — zum Öffnen klicken'}</div>
</button>`;
      out.querySelectorAll('.manual-dial-pick').forEach((btn) => {
        btn.onclick = () => pickManualDialContact(0);
      });
      return;
    }
    out.innerHTML = rows.map((r, i) => {
      const camp = campaigns.find((x) => x.id === r.campaign_id);
      const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—';
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return `<button type="button" class="manual-dial-pick" data-idx="${i}" style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-3);cursor:pointer;font-size:12px;">
<div style="font-weight:800;">${esc(r.phone)}</div>
<div style="color:var(--text-2);margin-top:2px;">${esc(nm)} · ${esc(camp?.name || '—')}</div>
</button>`;
    }).join('');
    out.querySelectorAll('.manual-dial-pick').forEach((btn) => {
      btn.onclick = () => pickManualDialContact(Number(btn.getAttribute('data-idx')));
    });
  } catch (e) {
    out.innerHTML = `<div style="color:var(--red);padding:8px;">${escapeHtml(e?.message || 'Error')}</div>`;
  }
}

function pickManualDialContact(idx) {
  if (_hasLiveCallInProgress()) {
    toast('Önce aktif çağrıyı kapatın', 'err', 2200);
    return;
  }
  const row = window._manualDialLastResults?.[idx];
  if (!row) return;
  const camp = campaigns.find((x) => x.id === row.campaign_id);
  if (row.campaign_id) selectCamp(row.campaign_id, camp?.name || '', { skipActivate: true });
  currentContact = row;
  closeManualDialDrawer();
  const dialerPageOpen = !!document.getElementById('page-dialer')?.classList.contains('active');
  if (!dialerPageOpen && typeof navigate === 'function') navigate('dialer');
  showCustomerCard(row);
  syncDialerBottomChrome();
  forceDialerPreCallBar();
  setTimeout(() => { syncDialerBottomChrome(); forceDialerPreCallBar(); }, 220);
  setTimeout(() => { syncDialerBottomChrome(); forceDialerPreCallBar(); }, 650);
  if (typeof switchContactTab === 'function') switchContactTab('info');
  toast(currentLang === 'tr' ? 'Kişi yüklendi — Ara ile arayın' : 'Kontakt geladen — mit Anrufen wählen', 'ok', 3200);
}

function _buildAdhocDialContact(phoneRaw) {
  const phone = String(phoneRaw || '').trim();
  const campId = selectedCampId || campaigns?.[0]?.id || null;
  return {
    id: `adhoc-${Date.now()}`,
    firm_id: currentUser?.firm_id || null,
    campaign_id: campId,
    first_name: currentLang === 'tr' ? 'Yeni' : 'Neu',
    last_name: currentLang === 'tr' ? 'Çağrı' : 'Anruf',
    phone,
    phone2: '',
    city: '',
    plz: '',
    address: '',
    notes: '',
    attempt_count: 0,
    status: 'pending',
    is_adhoc: true,
  };
}

async function _persistAdhocDialContact(contact) {
  if (!contact?.phone || !contact?.campaign_id || !currentUser?.firm_id) return contact;
  try {
    const rows = await sb('contacts', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        firm_id: currentUser.firm_id,
        campaign_id: contact.campaign_id,
        first_name: contact.first_name || 'Yeni',
        last_name: contact.last_name || 'Çağrı',
        phone: contact.phone,
        status: 'pending',
      }),
    });
    return rows?.[0] || contact;
  } catch (e) {
    return contact;
  }
}

function setOutcome(o) {
  selectedOutcome = o;
  document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
  const map = {appointment:'.ob-appointment',negative:'.ob-negative',callback:'.ob-callback',no_answer:'.ob-noanswer',voicemail:'.ob-voicemail'};
  if (map[o]) document.querySelector(map[o])?.classList.add('active');
  const cbRow = document.getElementById('callback-time-row') || document.getElementById('callback-row');
  if (cbRow) cbRow.style.display = o==='callback' ? '' : 'none';
  // Geri ara seçildiğinde varsayılan zaman: yarın aynı saat
  if (o === 'callback') {
    const dtInput = document.getElementById('callback-dt');
    if (dtInput && !dtInput.value) {
      const def = new Date(Date.now() + 24*60*60*1000);
      dtInput.value = def.toISOString().slice(0,16);
    }
  }
  const tr = currentLang === 'tr';
  const gm = document.getElementById('global-mascot');
  if (gm) gm.classList.remove('global-mascot--sad', 'global-mascot--celebrate');
  if (o === 'appointment' || o === 'appointment_done') {
    if (gm && !isMimiHidden()) gm.classList.add('global-mascot--celebrate');
    const okPool = tr
      ? [
          'Başardık! Termin adımına geçiyoruz.',
          'Harikasın, bu müşteri artık bizde.',
          'Net ve güzel kapattın, süpersin.',
        ]
      : [
          'Geschafft! Wir gehen zum Termin-Schritt.',
          'Stark abgeschlossen, der Kunde ist drin.',
          'Sehr sauber geführt, top!',
        ];
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(okPool[Math.floor(Math.random() * okPool.length)]);
      setTimeout(() => gm?.classList.remove('global-mascot--celebrate'), 2300);
    }
  } else if (o === 'negative') {
    if (gm && !isMimiHidden()) gm.classList.add('global-mascot--sad');
    const negPool = tr
      ? [
          'Bu olmadı ama sorun değil; diğerinde alacağız.',
          'Bir nefes al, sıradaki çağrıda kapanır.',
          'Ritim sende; bu sadece bir adım.',
        ]
      : [
          'Das war nichts, aber der nächste sitzt.',
          'Kurz durchatmen, der nächste wird gut.',
          'Du hast den Rhythmus, weiter.',
        ];
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(negPool[Math.floor(Math.random() * negPool.length)]);
      setTimeout(() => gm?.classList.remove('global-mascot--sad'), 3600);
    }
  } else if (o === 'callback') {
    const cbPool = tr
      ? [
          'Bence bu müşteri bizde, geri aramada kapanır.',
          'Bu sıcak lead, geri arama iyi fikir.',
          'Geri aramada doğru cümleyle alırız.',
        ]
      : [
          'Der Kunde ist nah dran, Rückruf bringt es.',
          'Warmer Lead, Rückruf passt gut.',
          'Im Rückruf holen wir ihn.',
        ];
    if (!isMimiHidden()) {
      _showCustEmptyBubbleMsg(cbPool[Math.floor(Math.random() * cbPool.length)]);
    }
  }
}

/** Aranacaklar (WV) listesindeki bekleyen kayıtları olumsuz sonuçla eşleştir — listeden düşer. */
async function _markMatchingWiedervorlageOlumsuz(contact) {
  if (!contact || !currentUser?.firm_id || !currentUser?.id) return;
  const fid = currentUser.firm_id;
  const aid = currentUser.id;
  const phone = String(contact.phone || '').trim();
  const cid = isValidUUID(contact.id) ? contact.id : null;
  let rows = [];
  if (cid) {
    rows = await sb(`wiedervorlage?firm_id=eq.${fid}&agent_id=eq.${aid}&contact_id=eq.${cid}&durum=eq.bekliyor&select=id`).catch(() => []);
  }
  if ((!rows || !rows.length) && phone) {
    const enc = encodeURIComponent(phone);
    rows = await sb(`wiedervorlage?firm_id=eq.${fid}&agent_id=eq.${aid}&telefon=eq.${enc}&durum=eq.bekliyor&select=id`).catch(() => []);
  }
  if (!rows?.length) return;
  await Promise.all(
    rows.map((r) =>
      sb(`wiedervorlage?id=eq.${r.id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ durum: 'olumsuz' }),
      })
    )
  );
  if (typeof refreshWvList === 'function') void refreshWvList();
  if (typeof loadWvBadge === 'function') loadWvBadge();
}

async function submitOutcome(goBreak) {
  const lineUp = !!_telnyxCall || !!_fakeCallActive || !!_outboundDialPending;
  if (dialerStatus === 'on_call' && lineUp) {
    toast(
      currentLang === 'tr'
        ? 'Önce çağrıyı kapatın. Çağrı kapanmadan sonuçlandırılamaz.'
        : 'Bitte zuerst auflegen. Abschluss erst nach Gesprächsende.',
      'warn',
      2400
    );
    return;
  }
  if (!selectedOutcome) { toast(currentLang==='tr'?'Sonuç seçin':'Ergebnis auswählen','err'); return; }
  const note   = document.getElementById('outcome-note')?.value.trim()||'';
  const cbTime = document.getElementById('callback-dt')?.value||null;
  const isDnc  = document.getElementById('outcome-dnc')?.checked || false;
  const lockedSlotEarly = _bookingSlot?.id || window._selectedBookingSlot?.id;
  const inboundTestContact =
    !!currentContact &&
    (_testMode &&
      (currentContact.is_inbound_test ||
        String(currentContact.id || '').startsWith('in-') ||
        currentContact._synthetic_test_outbound));
  if (!isDnc && selectedCampId && typeof getCampSettings === 'function') {
    const camp = campaigns.find((c) => c.id === selectedCampId);
    const cs = camp ? getCampSettings(camp) : {};
    if (cs.appointment_slot_required && !inboundTestContact) {
      const oc = String(selectedOutcome || '').toLowerCase();
      if ((oc === 'appointment' || oc === 'appointment_done') && !lockedSlotEarly) {
        toast(
          currentLang === 'tr'
            ? 'Bu kampanyada termin için önce takvimden slot seçmelisiniz.'
            : 'In dieser Kampagne musst du zuerst einen Termin-Slot wählen.',
          'warn',
          4200
        );
        return;
      }
    }
  }
  try {
    if (currentContact) {
      // appointment_done → call_logs'da 'appointment' olarak sakla (QC uyumu için)
      const finalOutcome = isDnc ? 'dnc' : (selectedOutcome === 'appointment_done' ? 'appointment' : selectedOutcome);
      const statusMap = {appointment:'appointment',appointment_done:'appointment',negative:'negative',callback:'callback',no_answer:'no_answer',dnc:'dnc'};
      const cbAt = (finalOutcome === 'callback' && cbTime) ? new Date(cbTime).toISOString() : null;
      const contactPatch = {
        status: statusMap[finalOutcome] || finalOutcome,
        attempt_count: (currentContact.attempt_count||0)+1,
        last_called_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
      };
      if (cbAt) contactPatch.callback_at = cbAt; // geri ara zamanı
      // Fake/test ID'lerinde UUID hatası önle
      const contactId = isValidUUID(currentContact.id) ? currentContact.id : null;
      if (contactId) {
        await sb(`contacts?id=eq.${contactId}`,{method:'PATCH',prefer:'return=minimal',
          body:JSON.stringify(contactPatch)
        });
      }
      if (isDnc) await addToDnc(currentContact.phone, contactId);
      const logNotes = _testMode
        ? [note, '__test_sim__'].filter((x) => String(x || '').trim()).join('\n').trim() || '__test_sim__'
        : note;
      const logData = {
        campaign_id: selectedCampId,
        firm_id: currentUser.firm_id,
        agent_id: currentUser.id,
        phone: currentContact.phone,
        outcome: finalOutcome,   // normalleştirilmiş (appointment_done → appointment)
        notes: logNotes,
        duration_sec: callSeconds,
        started_at: new Date(Date.now()-callSeconds*1000).toISOString(),
        ended_at: new Date().toISOString(),
      };
      if (contactId) logData.contact_id = contactId;
      if (cbAt) logData.callback_at = cbAt;
      if (activeCallId) { try { logData.telnyx_call_id = activeCallId; } catch(e) {} }
      await sb('call_logs',{method:'POST',prefer:'return=minimal',body:JSON.stringify(logData)});
      if (contactId && currentContact.queue_id) {
        // dialed_count'u contacts tablosundan dinamik hesapla
        sb(`contacts?queue_id=eq.${currentContact.queue_id}&status=not.in.(pending,calling)&select=id`)
          .then(rows => sb(`queues?id=eq.${currentContact.queue_id}`,{method:'PATCH',prefer:'return=minimal',
            body:JSON.stringify({dialed_count:(rows||[]).length})
          })).catch(()=>{});
      }
    }
  } catch(e){ console.error(e); toast('Kayıt hatası: '+e.message,'err'); }
  // Termin dışı sonuç seçilirse kilitli slot serbest bırak
  const lockedSlotId = _bookingSlot?.id || window._selectedBookingSlot?.id;
  if (lockedSlotId && selectedOutcome !== 'appointment' && selectedOutcome !== 'appointment_done') {
    sb(`takvim_slots?id=eq.${lockedSlotId}`,{method:'PATCH',prefer:'return=minimal',
      body:JSON.stringify({durum:'bos',kilitli_agent_id:null,kilitli_at:null})
    }).catch(()=>{});
    _bookingSlot = null; window._selectedBookingSlot = null;
  }
  // Termin → Takvim aç (sadece slot henüz seçilmemişse; appointment_done slot zaten kaydedildi)
  if (selectedOutcome==='appointment' && !isDnc) {
    openTakvimOverlay();
    if (currentContact) {
      setTimeout(() => {
        const wvPrefill = {
          phone: currentContact.phone, phone2: currentContact.phone2||'',
          first_name: currentContact.first_name||'', last_name: currentContact.last_name||'',
          plz: currentContact.plz||'', city: currentContact.city||'',
          address: currentContact.address||''
        };
        window._wvPrefill = wvPrefill;
      }, 500);
    }
  }
  // Callback → WV ekle
  if (selectedOutcome==='callback' && cbTime && currentContact) {
    try {
      await sb('wiedervorlage',{method:'POST',prefer:'return=minimal',body:JSON.stringify({
        nachname: `${currentContact.first_name||''} ${currentContact.last_name||''}`.trim() || currentContact.phone,
        telefon: currentContact.phone, telefon2: currentContact.phone2||'',
        plz: currentContact.plz||'', ort: currentContact.city||'', strasse: currentContact.address||'',
        termin_zaman: new Date(cbTime).toISOString(),
        agent_id: currentUser.id,
        agent_name: currentUser.name,
        firm_id: currentUser.firm_id,
        contact_id: isValidUUID(currentContact.id) ? currentContact.id : null,
        durum: 'bekliyor',
        notiz: note
      })});
    } catch(e) {}
  }
  if (selectedOutcome === 'negative' && currentContact) {
    try {
      await _markMatchingWiedervorlageOlumsuz(currentContact);
    } catch (e) {}
  }
  // ACW timer başlat
  setDialerStatus('wrapping');
  selectedOutcome = null;
  currentContact = null;
  clearCustomerCard();
  loadMyMiniStats();
  if (goBreak) {
    setDialerStatus('break');
    upsertAgentSession({agent_id:currentUser.id,status:'break',last_seen:new Date().toISOString()}).catch(()=>{});
    openBreakModal();
  } else {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id,status:'ready',last_seen:new Date().toISOString()}).catch(()=>{});
    if (_autoDial) {
      if (!getAutoDialCampaignIds().length) {
        _autoDial = false;
        refreshAutoDialUi();
        toast('Bu kampanyalarda otomatik arama pasif', 'warn', 2400);
        return;
      }
      if (!_testMode) {
        const callCheck = isCallAllowed(new Date().toISOString().split('T')[0], new Date().toTimeString().slice(0, 8));
        if (!callCheck.allowed) {
          toast('⏸ Otomatik arama duraklatıldı: ' + callCheck.reason, 'warn', 6000);
          _autoDial = false;
          const tog = document.getElementById('auto-dial-toggle');
          if (tog) tog.checked = false;
          refreshAutoDialUi();
        } else {
          setTimeout(() => dialNext(), 1200);
        }
      } else {
        setTimeout(() => dialNext(), 1200);
      }
    }
  }
}

function handleAppointmentClick() {
  setOutcome('appointment');
  // Takvim overlay'ini aç — agent slot seçer
  openTakvimOverlay();
  toast('Takvimden uygun bir slot seçin', 'ok', 3500);
}

// Called from appointments.js when agent selects a slot
function onAgentSlotSelected(slot) {
  window._selectedBookingSlot = slot;
  _bookingSlot = slot;
  setOutcome('appointment');

  // Termin moduna geç: müşteri kartı + bilgi sekmesi
  document.getElementById('customer-card').style.display = '';
  if (currentContact) showCustomerCard(currentContact);
  if (typeof switchContactTab === 'function') switchContactTab('info');

  // termin-fields-section'ı göster ve slot başlığını güncelle
  const terminSection = document.getElementById('termin-fields-section');
  if (terminSection) {
    terminSection.style.display = '';
    const hdr = terminSection.querySelector('.termin-slot-hdr');
    if (hdr) hdr.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${slot.tarih} · ${(slot.baslangic_saat||'').slice(0,5)}–${(slot.bitis_saat||'').slice(0,5)}`;
    const badge = document.getElementById('termin-slot-badge');
    if (badge) badge.textContent = `${slot.tarih} ${(slot.baslangic_saat||'').slice(0,5)}`;
  }

  // Mevcut müşteri verisiyle form alanlarını önceden doldur
  if (currentContact) {
    const pre = {
      'tf2-hausart': currentContact.hausart,
      'tf2-baujahr': currentContact.baujahr,
      'tf2-qm':      currentContact.qm,
      'tf2-heizung': currentContact.heizung,
      'tf2-alter_der_heizung': currentContact.alter_der_heizung,
      'tf2-verbrauch_pro_jahr': currentContact.verbrauch_pro_jahr,
      'tf2-personen': currentContact.personen
    };
    Object.entries(pre).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    });
  }

  // Termin formunun en altına "İptal" butonu ekle (yoksa)
  if (!document.getElementById('termin-cancel-slot-btn') && terminSection) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'termin-cancel-slot-btn';
    cancelBtn.style.cssText = 'margin-top:6px;width:100%;padding:6px;background:transparent;color:var(--text-3);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;';
    cancelBtn.textContent = '↩ Slotu İptal Et — Sonuç Seçimine Dön';
    cancelBtn.onclick = cancelSlotAndShowOutcome;
    terminSection.appendChild(cancelBtn);
  }

  // Scroll to termin form
  setTimeout(() => {
    terminSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);

  toast('Slot seçildi — termin bilgilerini doldurun', 'ok', 3000);
}

// Slot iptal et ve outcome seçimine dön
function cancelSlotAndShowOutcome() {
  const slotId = (_bookingSlot || window._selectedBookingSlot)?.id;
  if (slotId) {
    sb(`takvim_slots?id=eq.${slotId}`, {method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({durum:'bos', kilitli_agent_id:null, kilitli_at:null})
    }).catch(()=>{});
  }
  _bookingSlot = null;
  window._selectedBookingSlot = null;
  selectedOutcome = null;
  document.getElementById('customer-card').style.display = '';
  if (currentContact && typeof showCustomerCard === 'function') showCustomerCard(currentContact);
  if (typeof switchContactTab === 'function') switchContactTab('outcome');
  const cancelBtn = document.getElementById('termin-cancel-slot-btn');
  if (cancelBtn) cancelBtn.remove();
  toast('Slot iptal edildi', 'warn', 2000);
}

async function updateTerminField(key, value) {
  if (!currentContact?.id) return;
  currentContact[key] = value;
  try {
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({[key]: value || null})
    });
  } catch(e) {}
}

function getTerminFieldValues() {
  if (!currentContact) return {};
  const keys = ['hausart','baujahr','qm','heizung','alter_der_heizung','verbrauch_pro_jahr','personen'];
  const vals = {};
  keys.forEach(k => {
    const el = document.getElementById('tf2-' + k);
    vals[k] = el ? el.value : (currentContact[k] || '');
  });
  return vals;
}

function validateTerminFields() {
  const required = ['hausart','baujahr','qm','heizung','alter_der_heizung'];
  const missing = [];
  required.forEach(k => {
    const el = document.getElementById('tf2-' + k);
    const val = el ? el.value.trim() : (currentContact?.[k] || '');
    if (!val) {
      missing.push(k);
      if (el) { el.style.borderColor = 'var(--red)'; el.style.boxShadow = '0 0 0 2px rgba(220,38,38,.2)'; }
    } else {
      if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
    }
  });
  return missing;
}

// ── Break / Mola modal ────────────────────────
function openBreakModal() {
  const auxCodes = window._campAuxCodes || DEFAULT_AUX_CODES;
  const old = document.getElementById('m-break-select');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'm-break-select';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div style="background:var(--bg-2);border-radius:var(--radius);padding:20px;width:280px;box-shadow:0 16px 48px rgba(0,0,0,.3);">
<div style="font-size:14px;font-weight:800;margin-bottom:12px;">Mola Türü Seç</div>
<div style="display:flex;flex-direction:column;gap:6px;">
${auxCodes.map(c=>`<button onclick="selectBreakCode('${c}');this.closest('#m-break-select').remove();"
style="padding:10px 14px;border:1px solid var(--border);background:var(--bg-3);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;text-align:left;color:var(--text);">${c}</button>`).join('')}
</div>
<button onclick="this.closest('#m-break-select').remove();"
style="margin-top:10px;width:100%;padding:8px;background:transparent;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-3);">Kapat</button>
</div>`;
  document.body.appendChild(m);
}

async function selectBreakCode(code) {
  _breakCode = code;
  refreshBreakCustEmpty();
  toast(`☕ Mola: ${code}`, 'ok', 2000);
  upsertAgentSession({agent_id:currentUser.id,status:'break',break_code:code,last_seen:new Date().toISOString()}).catch(()=>{});
}

// ── Auto-dial ─────────────────────────────────
function toggleAutoDial() {
  const allowedCount = getAutoDialCampaignIds().length;
  if (!allowedCount) {
    _autoDial = false;
    refreshAutoDialUi();
    toast('Aktif kampanyalarda otomatik arama izni yok', 'warn', 2200);
    return;
  }
  _autoDial = !_autoDial;
  toast(_autoDial ? '⚡ Otomatik arama açık' : '⏸ Otomatik arama kapalı', 'ok', 1500);
  refreshAutoDialUi();
}

// ── Gamification ──────────────────────────────
function updateDailyProgress(apptCount, customGoal) {
  _dailyAppointments = apptCount;
  const el = document.getElementById('daily-progress-bar');
  const label = document.getElementById('daily-progress-label');
  if (!el) return;
  const goal = customGoal || _dailyGoal;
  const pct = Math.min(100, Math.round((apptCount/goal)*100));
  el.style.width = pct + '%';
  el.style.background = pct>=100 ? 'var(--green)' : pct>=60 ? 'var(--yellow)' : 'var(--accent)';
  if (label) label.textContent = `${apptCount}/${goal} Termin`;
  if (pct>=100 && !_confettiShown && _goalTab==='daily') { _confettiShown = true; launchConfetti(); }
}

function launchConfetti() {
  const colors = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  for (let i=0; i<80; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random()*colors.length)];
    const size = Math.random()*8+4;
    const left = Math.random()*100;
    const delay = Math.random()*2;
    const duration = Math.random()*2+2;
    piece.style.cssText = `position:absolute;top:-20px;left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random()>0.5?'50%':'2px'};animation:confetti-fall ${duration}s ${delay}s ease-in forwards;`;
    container.appendChild(piece);
  }
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `@keyframes confetti-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}`;
    document.head.appendChild(style);
  }
  setTimeout(() => container.remove(), 5000);
  toast('🎉 Günlük hedefe ulaştınız!', 'ok', 4000);
}

// ── Hotkeys ───────────────────────────────────
function renderHotkeyHints() {
  const el = document.getElementById('hotkey-hints');
  if (!el) return;
  el.innerHTML = `
<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--text-3);">
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Space</kbd> Mute</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Enter</kbd> Kapat/İleri</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">1-4</kbd> Sonuç</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">S</kbd> Kaydet</span>
<span><kbd style="background:var(--bg-3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--mono);">Esc</kbd> Kapat</span>
</div>`;
}

document.addEventListener('keydown', e => {
  if (!_hotkeysEnabled) return;
  const tag = e.target.tagName.toLowerCase();
  if (tag==='input'||tag==='textarea'||tag==='select') return;
  if (e.altKey||e.ctrlKey||e.metaKey) return;
  const dialerPage = document.getElementById('page-dialer');
  if (!dialerPage?.classList.contains('active')) return;
  switch(e.code) {
    case 'Space': e.preventDefault(); if (dialerStatus==='on_call') toggleMute(); break;
    case 'Enter':
      e.preventDefault();
      if (dialerStatus==='on_call') hangup();
      else if (dialerStatus==='ready') getNextContact();
      break;
    case 'Digit1': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('appointment'); e.preventDefault(); } break;
    case 'Digit2': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('negative'); e.preventDefault(); } break;
    case 'Digit3': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('callback'); e.preventDefault(); } break;
    case 'Digit4': if (dialerStatus==='wrapping'||dialerStatus==='on_call') { setOutcome('no_answer'); e.preventDefault(); } break;
    case 'KeyS': e.preventDefault(); if (dialerStatus==='wrapping') submitOutcome(); break;
    case 'Escape':
      document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
      document.querySelectorAll('[class*="modal-overlay"][style*="block"]').forEach(m=>m.style.display='none');
      break;
  }
});

// ── Clipboard ─────────────────────────────────
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    toast(`📋 ${label||'Kopyalandı'}`, 'ok', 1500);
  });
}

// ── Google Maps / API settings ────────────────
function initGoogleMaps(apiKey) {
  _googleApiKey = apiKey;
  localStorage.setItem('mb_google_key', apiKey);
}

function loadApiSettings() {
  const gk = localStorage.getItem('mb_google_key') || DEFAULT_GOOGLE_KEY;
  const tk = localStorage.getItem('mb_tomtom_key') || DEFAULT_TOMTOM_KEY;
  const goal = localStorage.getItem('mb_daily_goal') || '5';
  const wGoal = localStorage.getItem('mb_weekly_goal') || '25';
  const mGoal = localStorage.getItem('mb_monthly_goal') || '100';
  _googleApiKey = gk;
  if (document.getElementById('s-google-key')) document.getElementById('s-google-key').value = gk;
  if (document.getElementById('s-tomtom-key')) document.getElementById('s-tomtom-key').value = tk;
  if (document.getElementById('s-daily-goal')) document.getElementById('s-daily-goal').value = goal;
  if (document.getElementById('s-weekly-goal')) document.getElementById('s-weekly-goal').value = wGoal;
  if (document.getElementById('s-monthly-goal')) document.getElementById('s-monthly-goal').value = mGoal;
  _dailyGoal = parseInt(goal);
  window._weeklyGoal = parseInt(wGoal, 10) || 25;
  window._monthlyGoal = parseInt(mGoal, 10) || 100;
  updateCustEmptyMascotScale();
}

function saveApiSettings() {
  const gk = document.getElementById('s-google-key')?.value?.trim();
  const tk = document.getElementById('s-tomtom-key')?.value?.trim();
  const goal = parseInt(document.getElementById('s-daily-goal')?.value||'5');
  const wGoal = parseInt(document.getElementById('s-weekly-goal')?.value||'25');
  const mGoal = parseInt(document.getElementById('s-monthly-goal')?.value||'100');
  if (gk) { _googleApiKey=gk; localStorage.setItem('mb_google_key',gk); }
  if (tk) localStorage.setItem('mb_tomtom_key',tk);
  if (goal>0) { _dailyGoal=goal; localStorage.setItem('mb_daily_goal',String(goal)); }
  if (wGoal>0) { window._weeklyGoal = wGoal; localStorage.setItem('mb_weekly_goal',String(wGoal)); }
  if (mGoal>0) { window._monthlyGoal = mGoal; localStorage.setItem('mb_monthly_goal',String(mGoal)); }
  updateCustEmptyMascotScale();
  toast('API ayarları kaydedildi ✓','ok');
}

// ── Call rules (Ruhezeit) ─────────────────────
function getGermanHolidays(year) {
  const holidays = new Set();
  [[1,1],[5,1],[10,3],[10,26],[11,1],[12,25],[12,26]].forEach(([m,d])=>{
    holidays.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  });
  const a=year%19,b=Math.floor(year/100),cc=year%100;
  const d2=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d2-g+15)%30,i=Math.floor(cc/4),k=cc%4;
  const l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m2+114)/31),day=((h+l-7*m2+114)%31)+1;
  const easter = new Date(year,month-1,day);
  const addDays = (d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r.toISOString().split('T')[0];};
  holidays.add(addDays(easter,-2)); holidays.add(addDays(easter,0));
  holidays.add(addDays(easter,1));  holidays.add(addDays(easter,39));
  holidays.add(addDays(easter,49)); holidays.add(addDays(easter,50));
  return holidays;
}

function isGermanHoliday(dateStr) {
  return getGermanHolidays(parseInt(dateStr.split('-')[0])).has(dateStr);
}

function isCallAllowed(dateStr, timeStr) {
  const d   = new Date(dateStr + 'T' + timeStr);
  const day = d.getDay();
  const toMin = t => { const [hh,mm] = (t||'00:00').split(':').map(Number); return hh*60+mm; };
  const nowMin = toMin(timeStr.slice(0,5));

  // Firma ayarlarına bak, yoksa Almanya yasal saatleri varsayılan
  const ch = _callHours || {};
  const wdStart      = ch.weekday_start   || '09:00';
  const wdEnd        = ch.weekday_end     || '20:00';
  const satAllowed   = ch.sat_allowed     !== false;
  const satStart     = ch.sat_start       || '09:00';
  const satEnd       = ch.sat_end         || '13:00';
  const sunAllowed   = !!ch.sun_allowed;
  const holidayCheck = ch.holiday_check   !== false;

  if (day === 0 && !sunAllowed)
    return {allowed:false, reason:'Pazar günü arama yapılamaz'};
  if (holidayCheck && isGermanHoliday(dateStr))
    return {allowed:false, reason:'Tatil günü arama yapılamaz'};
  if (day === 6) {
    if (!satAllowed)
      return {allowed:false, reason:'Cumartesi arama yapılamaz'};
    if (nowMin < toMin(satStart) || nowMin >= toMin(satEnd))
      return {allowed:false, reason:`Cumartesi ${satStart}–${satEnd} arası arama yapılabilir`};
  } else if (day !== 0) {
    if (nowMin < toMin(wdStart) || nowMin >= toMin(wdEnd))
      return {allowed:false, reason:`Sessizlik saati (${wdStart}–${wdEnd} arası arama yapılabilir)`};
  }
  return {allowed:true};
}

function checkCallAllowed() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0,8);
  const check = isCallAllowed(dateStr, timeStr);
  if (!check.allowed) { toast('⚠️ ' + check.reason, 'err', 5000); return false; }
  return true;
}

// ── Gelen arama (firma ayarı + test simülasyonu) ─────────────────
function _normalizeFirmDialerSettings(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    incoming_super_enabled: !!d.incoming_super_enabled,
    incoming_enabled: !!d.incoming_enabled,
    incoming_external: !!d.incoming_external,
    incoming_show_routing_admin: d.incoming_show_routing_admin !== false,
    mascot_age_coeff: Number.isFinite(Number(d.mascot_age_coeff)) ? Math.max(1, Math.min(30, Number(d.mascot_age_coeff))) : 10,
  };
}

async function loadFirmDialerSettingsCache() {
  if (!currentUser?.firm_id) {
    window._firmDialerSettings = _normalizeFirmDialerSettings({});
    return window._firmDialerSettings;
  }
  try {
    const rows = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const d = rows?.[0]?.settings?.dialer || {};
    window._firmDialerSettings = _normalizeFirmDialerSettings(d);
  } catch (e) {
    window._firmDialerSettings = _normalizeFirmDialerSettings({});
  }
  refreshGlobalMascotInfoPanel();
  return window._firmDialerSettings;
}

function stopInboundTestSimulationScheduler() {
  if (_inboundSimTimer) {
    clearTimeout(_inboundSimTimer);
    _inboundSimTimer = null;
  }
}

function restartInboundTestSimulationScheduler() {
  stopInboundTestSimulationScheduler();
  const page = document.getElementById('page-dialer');
  if (!page?.classList.contains('active')) return;
  /** Kullanıcı akışı: test modunda otomatik "yeni gelen çağrı" simülasyonu çalışmasın. */
  if (_testMode) return;
  const tick = () => {
    const gap = _testMode
      ? 12000 + Math.floor(Math.random() * 10000)
      : 26000 + Math.floor(Math.random() * 24000);
    _inboundSimTimer = setTimeout(async () => {
      await tickInboundTestSimulation();
      tick();
    }, gap);
  };
  tick();
}

function _canShowInboundRoutingDetail() {
  const s = window._firmDialerSettings || {};
  if (!s.incoming_show_routing_admin) return false;
  const role = currentUser?.role || '';
  return ['firm_admin', 'admin', 'super_admin'].includes(role);
}

async function tickInboundTestSimulation() {
  if (!_testMode) return;
  await loadFirmDialerSettingsCache();
  /** Test modunda gelen simülasyonu firma «Gelen aramalar» kapalı olsa da çalışır (demo). */
  if (dialerStatus !== 'ready') return;
  if (_fakeCallActive || dialerStatus === 'on_call' || _inboundTestRingOpen) return;
  if (!currentUser?.firm_id) return;
  const fid = currentUser.firm_id;
  const tr = currentLang === 'tr';

  let sessions = await sb(`agent_sessions?firm_id=eq.${fid}&status=eq.ready&select=agent_id,agent_name,last_seen&order=last_seen.asc`).catch(() => []);
  if ((!sessions?.length || !sessions.some((x) => x.agent_id === currentUser.id)) && dialerStatus === 'ready') {
    sessions = [
      {
        agent_id: currentUser.id,
        agent_name: currentUser.name || '',
        last_seen: new Date().toISOString(),
      },
    ];
  }
  if (!sessions?.length) return;
  const readyIds = new Set(sessions.map((x) => x.agent_id));
  if (!readyIds.has(currentUser.id)) return;

  const autoIds = typeof getAutoDialCampaignIds === 'function' ? getAutoDialCampaignIds() : [];
  const sc = typeof selectedCampId !== 'undefined' && selectedCampId ? selectedCampId : null;
  const campIdsForPool = autoIds.length ? autoIds : sc ? [sc] : [];
  // Kampanyada aranacak gerçek kayıt varsa gelen test simülasyonunu sustur.
  if (campIdsForPool.length) {
    const inf =
      campIdsForPool.length === 1
        ? `campaign_id=eq.${campIdsForPool[0]}`
        : `campaign_id=in.(${campIdsForPool.join(',')})`;
    const nowIso = new Date().toISOString();
    const outboundPool =
      (await sb(
        `contacts?firm_id=eq.${fid}&${inf}` +
        `&status=in.(pending,no_answer,callback)` +
        `&or=(callback_at.is.null,callback_at.lte.${nowIso})` +
        `&select=id&limit=1`
      ).catch(() => [])) || [];
    if (outboundPool.length) return;
  }
  let contacts = [];
  if (campIdsForPool.length) {
    const inf =
      campIdsForPool.length === 1
        ? `campaign_id=eq.${campIdsForPool[0]}`
        : `campaign_id=in.(${campIdsForPool.join(',')})`;
    contacts =
      (await sb(
        `contacts?firm_id=eq.${fid}&${inf}&status=eq.pending&select=id,phone,first_name,last_name,campaign_id&limit=80`
      ).catch(() => [])) || [];
  }
  if (!contacts.length) {
    contacts =
      (await sb(`contacts?firm_id=eq.${fid}&select=id,phone,first_name,last_name,campaign_id&limit=120`).catch(() => [])) ||
      [];
  }
  let phone = '';
  let pickedContact = null;
  _inboundSimTickCount += 1;
  /**
   * Test modunda dış / kayıtlı / aktarım senaryoları deterministik döner (şansa bırakılmaz).
   * 0–1–2: dış numara (standart, aktarım bildirimi, sahiplik); 3–4–5: kampanyadan kayıtlı kontak.
   */
  const phase = (_inboundSimTickCount - 1) % 6;
  let useExternal = phase <= 2;
  let scenarioKind = 'standard';
  if (phase === 1 || phase === 4) scenarioKind = 'forwarded';
  else if (phase === 2 || phase === 5) scenarioKind = 'owner_other';

  if (useExternal) {
    phone = `49${15 + Math.floor(Math.random() * 74)}${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  } else if (contacts?.length) {
    pickedContact = contacts[Math.floor(Math.random() * contacts.length)];
    phone = pickedContact.phone;
  } else {
    useExternal = true;
    phone = `49${15 + Math.floor(Math.random() * 74)}${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  }

  let preferredId = null;
  try {
    const logs = await sb(`call_logs?phone=eq.${encodeURIComponent(phone)}&firm_id=eq.${fid}&order=started_at.desc&limit=1&select=agent_id`).catch(() => []);
    preferredId = logs?.[0]?.agent_id || null;
  } catch (e) {}

  let targetId = null;
  let routeDetail = '';
  const prefName = sessions.find((x) => x.agent_id === preferredId)?.agent_name || '';
  if (_testMode) {
    /** Prod’da sıradaki temsilciye gider; testte aksi halde çoğu zaman başka temsilciye gider ve bu ekranda hiçbir şey olmaz */
    targetId = currentUser.id;
    routeDetail = tr
      ? 'TEST: Gelen simülasyon bu oturuma yönlendirildi'
      : 'TEST: Eingehend-Simulation an diese Session';
  } else if (preferredId && readyIds.has(preferredId)) {
    targetId = preferredId;
    routeDetail = tr
      ? `Yönlendirme: son arayan temsilci${prefName ? ` (${prefName})` : ''} müsait → öncelik`
      : `Routing: letzter Agent${prefName ? ` (${prefName})` : ''} verfügbar`;
  } else {
    targetId = sessions[0].agent_id;
    const tname = sessions[0].agent_name || '';
    if (preferredId && !readyIds.has(preferredId)) {
      routeDetail = tr
        ? `Yönlendirme: son temsilci müsait değil → sıradaki hazır: ${tname || '—'}`
        : `Routing: letzter Agent nicht frei → nächster: ${tname || '—'}`;
    } else {
      routeDetail = tr
        ? `Yönlendirme: müsait temsilci: ${tname || '—'}`
        : `Routing: verfügbar: ${tname || '—'}`;
    }
  }

  if (targetId !== currentUser.id) {
    if (_canShowInboundRoutingDetail()) {
      toast(`📥 ${tr ? 'Gelen (TEST) başka temsilciye giderdi' : 'Eingehend (TEST) geht an anderen'} — ${routeDetail}`, 'warn', 4200);
    }
    return;
  }

  let contact = pickedContact;
  if (!contact && phone) {
    try {
      const rows = await sb(`contacts?phone=eq.${encodeURIComponent(phone)}&firm_id=eq.${fid}&select=*&limit=1`).catch(() => []);
      contact = rows?.[0] || null;
    } catch (e) {}
  }
  if (!contact) {
    const campId = selectedCampId || campaigns?.[0]?.id || null;
    contact = {
      id: `in-${Date.now()}`,
      phone,
      first_name: tr ? 'Gelen' : 'Eingehend',
      last_name: tr ? 'Test' : 'Test',
      firm_id: fid,
      campaign_id: campId,
      status: 'pending',
      attempt_count: 0,
      is_inbound_test: true,
    };
  }

  const displayName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || phone;
  contact._inboundRouteDetail = routeDetail;

  const agents = await _fetchFirmAgentsForInboundTest(fid);
  let others = (agents || []).filter((a) => a.id !== currentUser.id);
  others = _testInboundAugmentOthers(others);

  let scenario = 'standard';
  let fromAgentName = '';
  let testOwner = null;
  let testOwnerOnline = false;

  if (scenarioKind === 'forwarded') {
    scenario = 'forwarded';
    const from = others[Math.floor(Math.random() * others.length)];
    fromAgentName = from.name || '—';
  } else if (scenarioKind === 'owner_other') {
    scenario = 'owner_other';
    const pool = others.filter((o) => o.id);
    const o = (pool.length ? pool : others)[Math.floor(Math.random() * (pool.length || others.length))];
    if (o?.id) {
      testOwner = { id: o.id, name: o.name || '—' };
      testOwnerOnline = readyIds.has(o.id);
    } else {
      testOwner = { id: null, name: o?.name || 'Ziya' };
      testOwnerOnline = false;
    }
  }

  contact._testScenario = scenario;
  contact._testFromAgentName = scenario === 'forwarded' ? fromAgentName : '';
  contact._testOwner = scenario === 'owner_other' ? testOwner : null;
  contact._testOwnerOnline = scenario === 'owner_other' ? testOwnerOnline : false;

  await beginInboundTestCall({ phone, displayName, contact, routeDetail, isExternalInbound: useExternal });
}

function _closeInboundTestRingUI(opts = {}) {
  _inboundTestRingOpen = false;
  _inboundTestCtx = null;
  if (_inboundRingAutoDeclineTimer) {
    clearTimeout(_inboundRingAutoDeclineTimer);
    _inboundRingAutoDeclineTimer = null;
  }
  const root = document.getElementById('cust-empty');
  const panel = document.getElementById('cust-empty-incoming-panel');
  const def = document.getElementById('cust-empty-default');
  if (root) root.classList.remove('cust-empty--ringing');
  if (panel) {
    panel.style.display = 'none';
    panel.setAttribute('aria-hidden', 'true');
  }
  if (def) def.style.display = '';
  const addWrap = document.getElementById('cust-empty-inbound-add-wrap');
  if (addWrap) addWrap.style.display = 'none';
  const fw = document.getElementById('cust-empty-incoming-forward');
  const ow = document.getElementById('cust-empty-incoming-owner');
  if (fw) {
    fw.style.display = 'none';
    fw.textContent = '';
  }
  if (ow) {
    ow.style.display = 'none';
    ow.textContent = '';
  }
  const ownBtn = document.getElementById('dialer-incoming-btn-owner');
  if (ownBtn) ownBtn.style.display = 'none';
  const addTg = document.getElementById('dialer-incoming-btn-addtoggle');
  if (addTg) addTg.style.display = 'none';
  const xWrap = document.getElementById('cust-empty-incoming-xfer-wrap');
  if (xWrap) xWrap.style.display = 'none';
  const knob = document.getElementById('dialer-incoming-knob');
  if (knob) {
    knob.style.transform = '';
    knob.onpointerdown = null;
    knob.onpointermove = null;
    knob.onpointerup = null;
    knob.onpointercancel = null;
  }
  if (
    !opts.skipMascotRestart &&
    (dialerStatus === 'ready' || dialerStatus === 'break')
  ) {
    startCustEmptyMascotLoops();
  }
}

function _wireInboundTestSwipeOnce({ accept, decline }) {
  const knob = document.getElementById('dialer-incoming-knob');
  if (!knob) return;
  const maxX = 92;
  const TH = 46;
  let startX = 0;
  let cur = 0;
  let dragging = false;
  const onDown = (e) => {
    dragging = true;
    startX = e.clientX;
    cur = 0;
    try {
      knob.setPointerCapture(e.pointerId);
    } catch (err) {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    cur = Math.max(-maxX, Math.min(maxX, dx));
    knob.style.transform = `translateX(${cur}px)`;
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      knob.releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (cur >= TH) accept();
    else if (cur <= -TH) decline();
    knob.style.transform = '';
  };
  knob.onpointerdown = onDown;
  knob.onpointermove = onMove;
  knob.onpointerup = onUp;
  knob.onpointercancel = onUp;
}

function openInboundTestRingUI(ctx) {
  const { phone, displayName, routeDetail, isExternalInbound, proceed, contact } = ctx;
  _closeInboundTestRingUI({ skipMascotRestart: true });
  _stopCustEmptyMascotTimers();
  _inboundTestRingOpen = true;
  _inboundTestCtx = ctx;
  const tr = currentLang === 'tr';
  const scenario = contact?._testScenario || 'standard';
  const fromNm = contact?._testFromAgentName || '';
  const owner = contact?._testOwner || null;
  const ownerOn = !!contact?._testOwnerOnline;

  const root = document.getElementById('cust-empty');
  const def = document.getElementById('cust-empty-default');
  const panel = document.getElementById('cust-empty-incoming-panel');
  if (def) def.style.display = 'none';
  if (root) root.classList.add('cust-empty--ringing');
  if (panel) {
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.toggle('cust-empty-incoming-panel--external', !!isExternalInbound);
  }

  if (typeof applyLang === 'function') applyLang();

  const nm = document.getElementById('dialer-incoming-name');
  const ph = document.getElementById('dialer-incoming-phone');
  const bd = document.getElementById('dialer-incoming-badge');
  const sub = document.getElementById('dialer-incoming-sub');
  const lblL = document.getElementById('dialer-incoming-label-left');
  const lblR = document.getElementById('dialer-incoming-label-right');
  const fw = document.getElementById('cust-empty-incoming-forward');
  const ow = document.getElementById('cust-empty-incoming-owner');
  const ownBtn = document.getElementById('dialer-incoming-btn-owner');
  const addTg = document.getElementById('dialer-incoming-btn-addtoggle');

  if (nm) nm.textContent = displayName || '—';
  if (ph) ph.textContent = phone || '—';
  if (bd) {
    bd.textContent = isExternalInbound ? (tr ? 'Dış numara' : 'Extern') : tr ? 'Kayıtlı / iç' : 'Intern';
  }

  if (fw) {
    fw.style.display = scenario === 'forwarded' ? 'block' : 'none';
    if (scenario === 'forwarded') {
      fw.textContent = tr
        ? `${fromNm || 'Temsilci'} size müşterinizi aktarıyor (TEST)`
        : `${fromNm || 'Agent'} leitet Ihren Kontakt an Sie (TEST)`;
    }
  }
  if (ow) {
    ow.style.display = 'none';
    ow.textContent = '';
  }
  if (ownBtn) ownBtn.style.display = 'none';
  if (scenario === 'owner_other' && owner?.name) {
    if (owner.id && owner.id !== currentUser.id) {
      if (ow) {
        ow.style.display = 'block';
        ow.textContent = ownerOn
          ? tr
            ? `Müşteri temsilcisi: ${owner.name} (hazır)`
            : `Kunde von: ${owner.name} (bereit)`
          : tr
            ? `${owner.name} şu an hazır değil / sistemde görünmüyor`
            : `${owner.name} nicht bereit / nicht im System`;
      }
      if (ownBtn) {
        ownBtn.style.display = ownerOn ? 'inline-flex' : 'none';
        ownBtn.textContent = tr ? `${owner.name}’a aktar` : `An ${owner.name}`;
      }
    } else if (!owner.id) {
      if (ow) {
        ow.style.display = 'block';
        ow.textContent = tr
          ? `${owner.name} şu an hazır değil / sistemde görünmüyor`
          : `${owner.name} nicht bereit / nicht im System`;
      }
      if (ownBtn) ownBtn.style.display = 'none';
    }
  }

  if (sub) {
    if (scenario === 'forwarded') {
      sub.textContent = tr
        ? 'Sağa kaydır — yanıtla · Sola kaydır — kapat (başkasına aktaramazsınız)'
        : 'Rechts — annehmen · Links — ablehnen';
    } else if (scenario === 'owner_other') {
      sub.textContent = tr
        ? 'Sağa kaydır — yanıtla · Sola kaydır — reddet · veya sahibine aktarın'
        : 'Rechts annehmen · Links ablehnen oder an Besitzer weiterleiten';
    } else if (isExternalInbound && typeof _testMode !== 'undefined' && _testMode) {
      sub.textContent = tr
        ? 'Sağa kaydır — yanıtla · Sola kaydır — reddet · veya aşağıdan başka temsilciye aktarın (TEST)'
        : 'Rechts — annehmen · Links — ablehnen · oder unten weiterleiten (TEST)';
    } else {
      sub.textContent = tr
        ? 'Sağa kaydır — yanıtla · Sola kaydır — reddet'
        : 'Rechts — annehmen · Links — ablehnen';
    }
  }
  if (lblL) {
    lblL.textContent = tr ? 'Reddet' : 'Ablehnen';
    if (scenario === 'forwarded') lblL.textContent = tr ? 'Kapat' : 'Schließen';
  }
  if (lblR) lblR.textContent = tr ? 'Yanıtla' : 'Annehmen';

  const decBtn = document.getElementById('dialer-incoming-btn-decline');
  if (decBtn) {
    decBtn.textContent =
      scenario === 'forwarded' ? (tr ? 'Kapat' : 'Schließen') : tr ? 'Reddet' : 'Ablehnen';
  }

  const linkIn = document.getElementById('inbound-link-phone');
  if (linkIn) linkIn.value = '';

  const unreg =
    !contact?.id ||
    String(contact.id).startsWith('in-') ||
    String(contact.id).startsWith('adhoc-') ||
    contact?.is_inbound_test === true;
  if (addTg) addTg.style.display = unreg ? 'inline-flex' : 'none';

  const xWrap = document.getElementById('cust-empty-incoming-xfer-wrap');
  const xferSel = document.getElementById('dialer-incoming-xfer-agent');
  if (xWrap && xferSel && isExternalInbound && typeof _testMode !== 'undefined' && _testMode && currentUser?.firm_id) {
    xWrap.style.display = '';
    xferSel.innerHTML = `<option value="">${tr ? 'Temsilci seçin' : 'Agent wählen'}</option>`;
    void _fetchFirmAgentsForInboundTest(currentUser.firm_id).then((agents) => {
      const list = (agents || []).filter((a) => a.id && a.id !== currentUser.id);
      xferSel.innerHTML =
        `<option value="">${tr ? 'Temsilci seçin' : 'Agent wählen'}</option>` +
        list
          .map((a) => {
            const nm = String(a.name || a.id || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return `<option value="${a.id}">${nm}</option>`;
          })
          .join('');
    });
  } else if (xWrap) {
    xWrap.style.display = 'none';
  }

  try {
    navigator.vibrate?.(70);
  } catch (e) {}

  const accept = () => {
    _closeInboundTestRingUI();
    void proceed();
  };
  const decline = () => {
    _closeInboundTestRingUI();
    toast(
      tr
        ? `↩ Gelen (TEST) reddedildi${routeDetail ? ' — ' + routeDetail : ''}`
        : `↩ Eingehend (TEST) abgelehnt${routeDetail ? ' — ' + routeDetail : ''}`,
      'warn',
      3600
    );
    restartInboundTestSimulationScheduler();
  };

  const accBtn = document.getElementById('dialer-incoming-btn-accept');
  if (accBtn) accBtn.onclick = () => accept();
  if (decBtn) decBtn.onclick = () => decline();

  _inboundRingAutoDeclineTimer = setTimeout(() => {
    _inboundRingAutoDeclineTimer = null;
    if (_inboundTestRingOpen) decline();
  }, 32000);

  _wireInboundTestSwipeOnce({ accept, decline });
}

function inboundTestToggleAddPanel() {
  const w = document.getElementById('cust-empty-inbound-add-wrap');
  if (!w) return;
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
}

async function inboundTestLinkToContact() {
  const ctx = _inboundTestCtx;
  if (!ctx?.contact || !currentUser?.firm_id) return;
  const tr = currentLang === 'tr';
  const incoming = String(ctx.phone || '').trim();
  const targetPhone = document.getElementById('inbound-link-phone')?.value?.trim();
  if (!targetPhone) {
    toast(tr ? 'Mevcut müşteri telefonunu girin' : 'Telefon eingeben', 'warn');
    return;
  }
  if (!incoming) return;
  const fid = currentUser.firm_id;
  let rows =
    (await sb(`contacts?firm_id=eq.${fid}&phone=eq.${encodeURIComponent(targetPhone)}&select=*&limit=1`).catch(() => [])) ||
    [];
  if (!rows.length) {
    rows =
      (await sb(`contacts?firm_id=eq.${fid}&phone2=eq.${encodeURIComponent(targetPhone)}&select=*&limit=1`).catch(() => [])) ||
      [];
  }
  if (!rows?.length) {
    toast(tr ? 'Bu telefonla müşteri bulunamadı' : 'Kein Kontakt', 'err');
    return;
  }
  const row = rows[0];
  const patch = {};
  const p2 = String(row.phone2 || '').trim();
  const p1 = String(row.phone || '').trim();
  if (incoming === p1 || incoming === p2) {
    toast(tr ? 'Numara zaten bu kayıtta' : 'Schon vorhanden', 'warn');
    return;
  }
  if (!p2) {
    patch.phone2 = incoming;
  } else {
    const note = String(row.notes || '').trim();
    const line = tr ? `\n3. numara: ${incoming}` : `\n3. Nummer: ${incoming}`;
    patch.notes = note ? note + line : line.trim();
  }
  try {
    await sb(`contacts?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(patch) });
    toast(tr ? 'Numara kayda bağlandı ✓' : 'Gespeichert ✓', 'ok');
    Object.assign(row, patch);
    ctx.contact = row;
    _closeInboundTestRingUI();
    currentContact = row;
    if (row.campaign_id) {
      const camp = campaigns.find((c) => c.id === row.campaign_id);
      selectCamp(row.campaign_id, camp?.name || '', { skipActivate: true });
    }
    showCustomerCard(row);
    _fakeCallActive = true;
    _inboundSimActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    updateSessionInDB('on_call').catch(() => {});
    if (typeof switchContactTab === 'function') switchContactTab('info');
  } catch (e) {
    toast((tr ? 'Hata: ' : 'Fehler: ') + (e.message || ''), 'err');
  }
}

function inboundTestTransferToSelectedAgent() {
  const ctx = _inboundTestCtx;
  if (!ctx) return;
  const sel = document.getElementById('dialer-incoming-xfer-agent');
  const targetId = sel?.value;
  const tr = currentLang === 'tr';
  if (!targetId) {
    toast(tr ? 'Önce bir temsilci seçin' : 'Agent wählen', 'warn');
    return;
  }
  const payload = {
    phone: ctx.phone,
    displayName: ctx.displayName,
    fromAgent: currentUser?.name || '',
    ts: Date.now(),
  };
  try {
    localStorage.setItem(`mb_test_xfer_${targetId}`, JSON.stringify(payload));
  } catch (e) {}
  const nm = sel?.options?.[sel.selectedIndex]?.text || '';
  toast(
    tr
      ? `TEST: ${nm} için kuyruk bildirimi (aynı tarayıcıda o temsilci oturumu açıksa gelen çalar)`
      : `TEST: Benachrichtigung an ${nm}`,
    'ok',
    5200
  );
  _closeInboundTestRingUI();
  restartInboundTestSimulationScheduler();
}

function inboundTestTransferToOwner() {
  const ctx = _inboundTestCtx;
  const owner = ctx?.contact?._testOwner;
  if (!owner?.id) return;
  const tr = currentLang === 'tr';
  const payload = {
    phone: ctx.phone,
    displayName: ctx.displayName,
    fromAgent: currentUser.name,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(`mb_test_xfer_${owner.id}`, JSON.stringify(payload));
  } catch (e) {}
  toast(
    tr
      ? `TEST: ${owner.name} için kuyruk bildirimi (aynı tarayıcıda ${owner.name} oturumu açıksa gelen çalar)`
      : `TEST: Benachrichtigung an ${owner.name}`,
    'ok',
    5200
  );
  _closeInboundTestRingUI();
  restartInboundTestSimulationScheduler();
}

async function beginInboundTestCall({ phone, displayName, contact, routeDetail, isExternalInbound }) {
  if (_fakeCallActive || dialerStatus === 'on_call' || _inboundTestRingOpen) return;

  const proceed = async () => {
    const tr = currentLang === 'tr';
    const campId = contact.campaign_id || selectedCampId || campaigns?.[0]?.id;
    if (campId) {
      const camp = campaigns.find((c) => c.id === campId);
      selectCamp(campId, camp?.name || '', { skipActivate: true });
    }
    currentContact = contact;
    showCustomerCard(contact);
    _fakeCallActive = true;
    _inboundSimActive = true;
    window.__voiceOrbSimRemote = true;
    setDialerStatus('on_call');
    updateSessionInDB('on_call').catch(() => {});

    const ban = document.getElementById('dialer-inbound-banner');
    if (ban) {
      ban.style.display = '';
      if (isExternalInbound) {
        ban.classList.add('dialer-inbound-banner--external');
        ban.textContent = tr
          ? `Dış arama (TEST) · ${phone} — size aktarılıyor${routeDetail ? ' — ' + routeDetail : ''}`
          : `Extern (TEST) · ${phone} — wird an Sie durchgestellt${routeDetail ? ' — ' + routeDetail : ''}`;
      } else {
        ban.classList.remove('dialer-inbound-banner--external');
        ban.textContent = tr
          ? `Gelen arama (TEST): ${displayName} · ${phone}${routeDetail ? ' — ' + routeDetail : ''}`
          : `Eingehend (TEST): ${displayName} · ${phone}`;
      }
    }
    const extra = _canShowInboundRoutingDetail() ? ` — ${routeDetail}` : '';
    if (isExternalInbound) {
      toast(
        `${tr ? '📥 Dış arama (TEST) — size aktarılıyor: ' : '📥 Extern (TEST) — wird durchgestellt: '}${phone}${extra}`,
        'ok',
        5600
      );
    } else {
      toast(`${tr ? '📥 Gelen arama (TEST)' : '📥 Eingehend (TEST)'}: ${displayName} · ${phone}${extra}`, 'ok', 5200);
    }
    if (typeof switchContactTab === 'function') switchContactTab('info');
  };

  if (!_testMode) {
    await proceed();
    return;
  }

  const ring = () =>
    openInboundTestRingUI({ phone, displayName, routeDetail, isExternalInbound, proceed, contact });

  if (isExternalInbound && !_isCustDataVisible()) {
    stopCustEmptyCoach();
    if (_inboundExternalCueTimer) {
      clearTimeout(_inboundExternalCueTimer);
      _inboundExternalCueTimer = null;
    }
    const custData = document.getElementById('cust-data');
    const cue = document.getElementById('cust-empty-inbound-cue');
    const bubble = document.getElementById('cust-empty-bubble');
    if (bubble) bubble.style.display = 'none';
    if (custData) custData.style.display = 'none';
    const custEmpty = document.getElementById('cust-empty');
    if (custEmpty) {
      custEmpty.style.display = '';
      custEmpty.classList.add('cust-empty--inbound-external');
    }
    if (cue) {
      cue.style.display = '';
      if (typeof applyLang === 'function') applyLang();
    }
    _inboundExternalCueTimer = setTimeout(() => {
      _inboundExternalCueTimer = null;
      _hideInboundExternalFluidCue();
      ring();
    }, 900);
    return;
  }

  ring();
}

async function loadIncomingCallsSettingsPage() {
  const card = document.getElementById('incoming-calls-settings-card');
  if (!card) return;
  const role = currentUser?.role || '';
  const can = ['firm_admin', 'admin', 'super_admin'].includes(role);
  if (!can || !currentUser?.firm_id) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  await loadFirmDialerSettingsCache();
  const s = window._firmDialerSettings || {};
  const locked = !s.incoming_super_enabled;
  const hint = document.getElementById('inc-set-locked-hint');
  const en = document.getElementById('inc-set-enabled');
  const ex = document.getElementById('inc-set-external');
  const ri = document.getElementById('inc-set-routing-info');
  if (hint) hint.style.display = locked ? '' : 'none';
  [en, ex, ri].forEach((el) => {
    if (!el) return;
    el.disabled = locked;
    el.style.opacity = locked ? '0.5' : '';
  });
  if (en) en.checked = !!s.incoming_enabled;
  if (ex) ex.checked = !!s.incoming_external;
  if (ri) ri.checked = s.incoming_show_routing_admin !== false;
}

async function saveIncomingCallsSettings() {
  if (!currentUser?.firm_id) return;
  const role = currentUser?.role || '';
  if (!['firm_admin', 'admin', 'super_admin'].includes(role)) {
    toast('Yetki yok', 'err');
    return;
  }
  try {
    const rows = await sb(`firms?id=eq.${currentUser.firm_id}&select=settings`);
    const oldSettings = rows?.[0]?.settings || {};
    const oldDialer = oldSettings.dialer || {};
    const locked = !oldDialer.incoming_super_enabled;
    if (locked) {
      toast('Süper admin bu özelliği henüz açmadı', 'warn');
      return;
    }
    const dialer = {
      ...oldDialer,
      incoming_enabled: !!document.getElementById('inc-set-enabled')?.checked,
      incoming_external: !!document.getElementById('inc-set-external')?.checked,
      incoming_show_routing_admin: !!document.getElementById('inc-set-routing-info')?.checked,
    };
    await sb(`firms?id=eq.${currentUser.firm_id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...oldSettings, dialer } }),
    });
    await loadFirmDialerSettingsCache();
    toast('Gelen arama ayarları kaydedildi ✓', 'ok');
    restartInboundTestSimulationScheduler();
  } catch (e) {
    toast('Kayıt hatası: ' + e.message, 'err');
  }
}

window.isIncomingDialerEnabled = function () {
  const s = window._firmDialerSettings || {};
  return !!(s.incoming_super_enabled && s.incoming_enabled);
};

// ── Test Modu ─────────────────────────────────
function toggleTestMode() {
  _testMode = !_testMode;
  const btn    = document.getElementById('test-mode-btn');
  const rdyBtn = document.getElementById('btn-ready');
  if (_testMode) {
    btn.style.cssText += ';background:rgba(234,179,8,.18)!important;color:var(--yellow)!important;border-color:var(--yellow)!important;';
    btn.textContent = '⚙ TEST AÇIK';
    // Hazır butonunu Telnyx'ten bağımsız hale getir
    if (rdyBtn) {
      const canStart = !!selectedCampId && getAutoDialCampaignIds().length > 0;
      rdyBtn.disabled = !canStart;
      rdyBtn.style.opacity = '1';
      rdyBtn.style.cursor = canStart ? 'pointer' : 'not-allowed';
      rdyBtn.onclick = testToggleReady; // Telnyx kontrolsüz versiyon
    }
    toast('Test modu açık — gerçek arama yapılmaz, veriler DB\'ye kaydedilir', 'ok', 4000);
    void loadFirmDialerSettingsCache().then(() => {
      if (!(window._firmDialerSettings?.incoming_enabled)) {
        toast(
          currentLang === 'tr'
            ? 'Gelen arama simülasyonu için: admin panelinde firma ayarlarında «Gelen aramalar» açık olmalı.'
            : 'Für eingehende Test-Anrufe: «Eingehend» in den Firmeneinstellungen aktivieren.',
          'warn',
          7000
        );
      }
    });
  } else {
    btn.style.cssText = btn.style.cssText.replace(/background[^;]+;|color[^;]+;|border-color[^;]+;/g, '');
    btn.textContent = 'TEST MODU';
    if (rdyBtn) {
      rdyBtn.onclick = toggleReady; // Normal versiyona geri dön
      if (!telnyxReady && !selectedCampId) {
        rdyBtn.disabled = true;
        rdyBtn.style.opacity = '0.45';
        rdyBtn.style.cursor = 'not-allowed';
      }
    }
    toast('Test modu kapatıldı', 'warn', 2000);
  }
  if (_inboundTestXferPoll) {
    clearInterval(_inboundTestXferPoll);
    _inboundTestXferPoll = null;
  }
  if (_testMode) {
    _maybeConsumeTestTransferInbox();
    _inboundTestXferPoll = setInterval(() => _maybeConsumeTestTransferInbox(), 2000);
  }
  restartInboundTestSimulationScheduler();
}

// Test moduna özel hazır toggle — Telnyx kontrolü yok
async function testToggleReady() {
  // Test modunda bile en az bir izinli/aktif kampanya olmadan arama başlamasın.
  const allowed = getAutoDialCampaignIds();
  if (!selectedCampId) { toast('Önce kampanya seçin', 'err'); return; }
  if (!allowed.length) { toast('Önce en az bir kampanyayı aktif edin', 'err'); return; }
  if (dialerStatus === 'offline' || dialerStatus === 'break') {
    setDialerStatus('ready');
    upsertAgentSession({
      agent_id: currentUser.id,
      agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status: 'ready',
      last_seen: new Date().toISOString(),
    }).catch(() => {});
    restartInboundTestSimulationScheduler();
    setTimeout(() => dialNext(), 300);
  } else if (dialerStatus === 'ready') {
    setDialerStatus('offline');
    stopInboundTestSimulationScheduler();
    upsertAgentSession({
      agent_id: currentUser.id,
      agent_name: currentUser.name,
      firm_id: currentUser.firm_id,
      status: 'offline',
      last_seen: new Date().toISOString(),
    }).catch(() => {});
  }
}

// Test modunda gerçek contact ile simüle edilmiş çağrı başlat
async function startTestCall() {
  if (_fakeCallActive) return;
  let campIds = getAutoDialCampaignIds();
  if (!campIds.length && selectedCampId) campIds = [selectedCampId];
  if (!campIds.length && _activeCampIds.length) campIds = _activeCampIds.slice();
  if (!campIds.length && campaigns?.length) campIds = campaigns.map((c) => c.id).filter(Boolean);
  const contact = await getNextContact(campIds);
  if (!contact) {
    toast('✅ Kuyrukta numara kalmadı', 'ok');
    setDialerStatus('offline'); updateSessionInDB('offline');
    return;
  }
  _fakeCallActive = true;
  window.__voiceOrbSimRemote = true;
  currentContact = contact;
  showCustomerCard(contact);
  // Kontakt durumunu "calling" olarak güncelle (sentetik test kişisinde DB yok)
  if (!contact._synthetic_test_outbound) {
    try {
      await sb(`contacts?id=eq.${contact.id}`, {
        method:'PATCH', prefer:'return=minimal',
        body: JSON.stringify({ status:'calling', last_called_at: new Date().toISOString() })
      });
    } catch(e) {}
  }
  setDialerStatus('on_call');
  toast(`⚙ TEST: ${contact.first_name||''} ${contact.last_name||''} ${contact.phone}`, 'ok', 3000);
}

function endFakeCall() {
  _closeInboundTestRingUI();
  _hideInboundExternalFluidCue();
  _fakeCallActive = false;
  _inboundSimActive = false;
  window.__voiceOrbSimRemote = false;
  clearTimeout(_fakeCallTimer); _fakeCallTimer = null;
  const ban = document.getElementById('dialer-inbound-banner');
  if (ban) {
    ban.style.display = 'none';
    ban.textContent = '';
    ban.classList.remove('dialer-inbound-banner--external');
  }
  handleCallEnd(Math.floor(callSeconds) || 15);
}

// ── Kalender / Takvim bağlantısı ─────────────
function openKalender(contact) {
  if (!contact) contact = currentContact;
  const params = new URLSearchParams({
    name:  [contact?.first_name||'', contact?.last_name||''].join(' ').trim() || '',
    phone: contact?.phone||'',
    plz:   contact?.plz||'',
    city:  contact?.city||'',
    address: contact?.address||'',
    hausart: contact?.hausart||'',
    baujahr: contact?.baujahr||'',
    qm:    contact?.qm||'',
    heizung: contact?.heizung||'',
    alter: contact?.alter_der_heizung||'',
    campId: selectedCampId||'',
  });
  const url = TAKVIM_URL + '?' + params.toString();
  window.open(url, '_blank', 'width=900,height=750,resizable=yes,scrollbars=yes');
}

function toggleTakvimPopup() {
  const popup = document.getElementById('takvim-popup-frame');
  if (!popup) return;
  const isVisible = popup.style.display !== 'none';
  popup.style.display = isVisible ? 'none' : '';
  if (!isVisible && currentContact) {
    openKalender(currentContact);
  }
}

// Tam ekran takvim overlay'ini aç (topbar butonu + handleAppointmentClick)
async function _loadTakvimOverlayCamps() {
  const sel = document.getElementById('takvim-camp-select-ov');
  if (!sel) return;
  try {
    const fid = getActiveFirmId();
    const q = fid ? `campaigns?firm_id=eq.${fid}&status=eq.active&order=name.asc` : `campaigns?status=eq.active&order=name.asc`;
    const camps = await sb(q) || [];
    sel.innerHTML = '<option value="">Kampanya seç...</option>' + camps.map(c=>`<option value="${c.id}" ${c.id===takvimCampId?'selected':''}>${c.name}</option>`).join('');
    if (!takvimCampId && camps.length === 1) { takvimCampId = camps[0].id; sel.value = takvimCampId; }
    if (takvimCampId) loadTakvimSlots();
  } catch(e) {}
}

async function openTakvimOverlay() {
  const ov = document.getElementById('takvim-popup-overlay');
  if (!ov) { navigate('takvim'); return; }
  ov.classList.add('open');

  // Overlay içindeki grid ID'lerini ayarla (ana sayfa takvimi ile aynı renderTakvimGrid / slot mantığı)
  window._takvimGridId      = 'takvim-grid-ov';
  window._takvimScrollId    = 'takvim-scroll-ov';
  window._takvimWeekLabelId = 'takvim-week-label-ov';
  window._takvimFailedSecId = 'takvim-failed-section-ov';
  window._takvimFailedGridId = 'takvim-failed-grid-ov';

  const ovAdmin  = document.getElementById('takvim-overlay-admin');
  const ovCampLbl = document.getElementById('takvim-overlay-camp-label');
  const isAdmin  = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (ovAdmin) ovAdmin.style.display = isAdmin ? 'flex' : 'none';

  const preferredCamp =
    (currentContact && currentContact.campaign_id) ||
    (typeof selectedCampId !== 'undefined' && selectedCampId ? selectedCampId : null) ||
    null;

  if (isAdmin) {
    // Super admin: firma seçici göster, firma değişince kampanyaları yenile
    if (currentUser?.role === 'super_admin') {
      renderFirmSelector('takvim-overlay-firm-selector', () => _loadTakvimOverlayCamps());
    }
    await _loadTakvimOverlayCamps();
    const selOv = document.getElementById('takvim-camp-select-ov');
    if (preferredCamp && selOv && [...selOv.options].some((o) => o.value === String(preferredCamp))) {
      takvimCampId = preferredCamp;
      selOv.value = preferredCamp;
      await loadTakvimSlots();
    }
  } else {
    // Agent: atanmış kampanyaları yükle ve select göster
    try {
      const ac = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id,campaigns(id,name,status)`);
      const agentCamps = (ac||[]).map(a=>a.campaigns).filter(Boolean);
      const prefOk = preferredCamp && agentCamps.some((c) => c.id === preferredCamp);
      if (prefOk) takvimCampId = preferredCamp;
      else if (!takvimCampId && agentCamps.length) takvimCampId = agentCamps[0].id;
      // Show a simple select for agents too if they have multiple campaigns
      if (agentCamps.length > 1) {
        const agentCampWrap = document.getElementById('takvim-overlay-camp-label');
        if (agentCampWrap) {
          agentCampWrap.innerHTML = `<select class="form-input" id="takvim-camp-select-agent-ov" style="font-size:12px;padding:5px 10px;max-width:200px;" onchange="onTakvimCampChange(this.value)">
          ${agentCamps.map(c=>`<option value="${c.id}" ${c.id===takvimCampId?'selected':''}>${c.name}</option>`).join('')}
          </select>`;
        }
      } else if (agentCamps.length === 1) {
        if (ovCampLbl) ovCampLbl.textContent = agentCamps[0].name;
        takvimCampId = agentCamps[0].id;
      }
    } catch(e) {
      if (preferredCamp) takvimCampId = preferredCamp;
      else if (selectedCampId) takvimCampId = selectedCampId;
    }
  }

  const mainSel = document.getElementById('takvim-camp-select');
  if (mainSel && takvimCampId && [...mainSel.options].some((o) => o.value === String(takvimCampId))) {
    mainSel.value = takvimCampId;
  }

  if (typeof syncTakvimViewButtonStyles === 'function') syncTakvimViewButtonStyles();

  if (!takvimDate) takvimDate = new Date();
  // Re-render after layout is ready so clientHeight is correct for row height calc
  requestAnimationFrame(() => {
    renderTakvimGrid();
    if (takvimCampId) loadTakvimSlots();
  });
}

function closeTakvimOverlay() {
  const ov = document.getElementById('takvim-popup-overlay');
  if (ov) ov.classList.remove('open');
  if (typeof takvimClearMovePickMode === 'function') takvimClearMovePickMode();
  // Ana sayfaya geçince grid ID'leri resetle
  window._takvimGridId     = 'takvim-grid';
  window._takvimScrollId   = 'takvim-scroll';
  window._takvimWeekLabelId = 'takvim-week-label';
  delete window._takvimFailedSecId;
  delete window._takvimFailedGridId;
}

// ── Precall mic test ──────────────────────────
async function startPrecallTest() {
  const meter = document.getElementById('precall-meter-fill');
  const status = document.getElementById('precall-status');
  try {
    _precallStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    _precallAnalyser = ctx.createAnalyser();
    const src = ctx.createMediaStreamSource(_precallStream);
    src.connect(_precallAnalyser);
    _precallAnalyser.fftSize = 256;
    const buf = new Uint8Array(_precallAnalyser.frequencyBinCount);
    _precallOk = false;
    const check = () => {
      if (!_precallStream) return;
      _precallAnalyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s,v)=>s+v,0)/buf.length;
      if (meter) meter.style.width = Math.min(100,avg*3)+'%';
      if (avg > 10) _precallOk = true;
      requestAnimationFrame(check);
    };
    check();
    if (status) { status.textContent = '🎤 Konuşun — ses seviyesi gösteriliyor'; status.style.color='var(--green)'; }
  } catch(e) {
    if (status) { status.textContent = '❌ Mikrofon izni reddedildi'; status.style.color='var(--red)'; }
  }
}

function stopPrecallTest() {
  if (_precallStream) { _precallStream.getTracks().forEach(t=>t.stop()); _precallStream=null; }
  const status = document.getElementById('precall-status');
  if (status) {
    if (_precallOk) { status.textContent='✅ Mikrofon çalışıyor'; status.style.color='var(--green)'; }
    else { status.textContent='⚠️ Ses algılanmadı — kontrol edin'; status.style.color='var(--yellow)'; }
  }
}
