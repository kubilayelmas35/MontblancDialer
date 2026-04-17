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

    // Seçili kampanyayı (kullanıcı bazlı) geri yükle
    // Not: Eğer aktif kampanya listesi "bilerek boş" kaydedildiyse (savedActive === []), seçim UI için restore edilir ama aktif listeye eklenmez.
    if (!selectedCampId) {
      const saved = _loadSelectedCampId();
      if (saved && myCamps.some((x) => String(x.campaign_id) === String(saved))) {
        const found = myCamps.find((x) => String(x.campaign_id) === String(saved));
        selectCamp(found.campaign_id, found.campaigns?.name || '', { skipActivate: true });
      }
    }

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
    // kampanya otomatik seçilmez; kullanıcı tıklamalı
    if (!myCamps.length) {
      const notice = document.getElementById('camp-required-notice');
      if (notice) notice.style.display = 'flex';
    }
  } catch(e){ console.error('initDialer err:', e); }
  refreshDialerHealthPanel();
  loadMyMiniStats();
  loadWvBadge();
  startTickerPoll();
  const goalBar = document.getElementById('daily-goal-bar');
  if (goalBar) goalBar.style.display = '';
  _dailyGoal = parseInt(localStorage.getItem('mb_daily_goal')||'5');
  renderHotkeyHints();
  const hints = document.getElementById('hotkey-hints');
  if (hints) hints.style.display = '';
  refreshAutoDialUi();
}

// Kampanya aktif/pasif toggle
function toggleCampActive(campId, checked) {
  if (checked) {
    if (!_activeCampIds.includes(campId)) _activeCampIds.push(campId);
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
  _autoDial = allowedCount > 0;
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

function setPerfTab(tab) {
  _perfTab = tab;
  ['today','week','month'].forEach(t => {
    const b = document.getElementById(`perf-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--accent)' : 'transparent'; b.style.color = t===tab ? '#fff' : 'var(--text-2)'; }
  });
  loadMyMiniStats();
}

function setGoalTab(tab) {
  _goalTab = tab;
  ['daily','weekly','monthly'].forEach(t => {
    const b = document.getElementById(`goal-tab-${t}`);
    if (b) { b.style.background = t===tab ? 'var(--accent)' : 'transparent'; b.style.color = t===tab ? '#fff' : 'var(--text-2)'; }
  });
  const labels = {daily:'Günlük Hedef', weekly:'Haftalık Hedef', monthly:'Aylık Hedef'};
  const lbl = document.getElementById('goal-tab-label');
  if (lbl) lbl.textContent = labels[tab]||'Hedef';
  loadMyMiniStats();
}

async function loadMyMiniStats() {
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
    const callsRows = await sb(
      `call_logs?select=outcome&agent_id=eq.${currentUser?.id}` +
      `&started_at=gte.${since}&started_at=lte.${nowIso}`
    );
    const calls = (callsRows || []).length;
    const posOutcomes = new Set(['appointment', 'appointment_done', 'basarili', 'positive']);
    const posCalls = (callsRows || []).filter((r) => posOutcomes.has(String(r?.outcome || '').toLowerCase())).length;

    const apRowsPerf = await sb(
      `appointments?select=durum&agent_id=eq.${currentUser?.id}` +
      `&termin_tarih=gte.${since}&termin_tarih=lte.${nowIso}`
    );
    const appts = (apRowsPerf || []).length;
    try {
      window._dialerPerfSnapshot = { calls, appts, posCalls, since, tab: _perfTab };
    } catch (e) {}

    document.getElementById('my-appt').textContent = appts;
    document.getElementById('my-calls').textContent = calls;

    // Goal depends on tab
    let goalVal = _dailyGoal;
    if (_goalTab === 'weekly') goalVal = _dailyGoal * 5;
    else if (_goalTab === 'monthly') goalVal = _dailyGoal * 22;
    let goalAppts = appts;
    if (_goalTab === 'weekly') {
      const monSince = new Date(now); monSince.setDate(now.getDate()-(now.getDay()||7)+1); monSince.setHours(0,0,0,0);
      const wl = await sb(
        `appointments?select=id&agent_id=eq.${currentUser?.id}` +
        `&termin_tarih=gte.${monSince.toISOString()}&termin_tarih=lte.${nowIso}`
      );
      goalAppts = (wl || []).length;
    } else if (_goalTab === 'monthly') {
      const monSince = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
      const ml = await sb(
        `appointments?select=id&agent_id=eq.${currentUser?.id}` +
        `&termin_tarih=gte.${monSince}&termin_tarih=lte.${nowIso}`
      );
      goalAppts = (ml || []).length;
    }
    updateDailyProgress(goalAppts, goalVal);

    const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id;
    const resultRows = await loadFirmAppointmentResults(fid, false).catch(() => defaultAppointmentResults());
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

    document.getElementById('my-stats-mini').innerHTML = boxes.join('');
    loadUpcomingWv();
    loadUnfinalizedCalls();
    if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
  } catch(e){ console.error('stats err:',e); }
}

let _custEmptyCoachTimer = null;

function _custEmptyCoachTargetVisible() {
  const root = document.getElementById('cust-empty');
  return !!(root && root.style.display !== 'none');
}

function refreshCustEmptyCoachBubble() {
  const bubble = document.getElementById('cust-empty-bubble');
  const root = document.getElementById('cust-empty');
  if (!bubble || !root || root.style.display === 'none') {
    if (bubble) bubble.style.display = 'none';
    return;
  }
  const tr = currentLang === 'tr';
  const p = window._dialerPerfSnapshot || {};
  const calls = Number(p.calls) || 0;
  const appts = Number(p.appts) || 0;
  const posCalls = Number(p.posCalls) || 0;
  let msg = '';
  if (calls >= 18 && appts >= 4) {
    msg = tr ? 'Bugün çok tempo var — termin yağmuru!' : 'Starkes Tempo — viele Termine!';
  } else if (calls >= 14 && posCalls === 0) {
    msg = tr ? 'Çok çağrı aldın; birazdan yakalarsın.' : 'Viele Anrufe — der Treffer kommt.';
  } else if (calls >= 10 && appts === 0) {
    msg = tr ? 'Ritmin iyi, bir termin çok yakın.' : 'Guter Rhythmus — Termin in Sicht.';
  } else if (appts >= 6) {
    msg = tr ? 'Mükemmel iş — akış mükemmel.' : 'Sehr starke Buchungen heute!';
  } else if (appts >= 3) {
    msg = tr ? 'Harika gün, böyle devam.' : 'Tolle Serie — weiter so!';
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
  bubble.textContent = msg;
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
}

function startCustEmptyCoach() {
  stopCustEmptyCoach();
  if (!_custEmptyCoachTargetVisible()) return;
  refreshCustEmptyCoachBubble();
  _custEmptyCoachTimer = setInterval(() => refreshCustEmptyCoachBubble(), 68000);
}

function stopCustEmptyCoach() {
  if (_custEmptyCoachTimer) {
    clearInterval(_custEmptyCoachTimer);
    _custEmptyCoachTimer = null;
  }
  const bubble = document.getElementById('cust-empty-bubble');
  if (bubble) {
    bubble.style.display = 'none';
    bubble.classList.remove('cust-empty-bubble--pop');
  }
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

function toggleUnfinalizedCallsPanel() {
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
    (dialerStatus === 'offline' || dialerStatus === 'ready') &&
    !!currentContact &&
    _isCustDataVisible() &&
    !_outboundDialPending &&
    !_fakeCallActive;

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
    on_call: {tr:'Aramada',de:'Im Gespräch'},
    wrapping:{tr:'Sonuç Giriliyor',de:'Nachbearbeitung'},
    break:   {tr:'Mola',de:'Pause'},
  };
  if (label) label.textContent = labels[s]?.[currentLang]||s;
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
  push(!!_activeCampIds.length, 'Aktif kampanya var');
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
      : !_activeCampIds.length
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
  updateDialerVoiceVisuals(0);
  if (typeof startDialerVoiceRings === 'function') startDialerVoiceRings();
  callTimerInt = setInterval(()=>{
    callSeconds++;
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0');
    const s=String(callSeconds%60).padStart(2,'0');
    const el = document.getElementById('dialer-timer');
    if (el) el.textContent=`${m}:${s}`;
    updateDialerVoiceVisuals(callSeconds);
  },1000);
}

function stopCallTimer() {
  clearInterval(callTimerInt);
  const tblk = document.getElementById('dialer-timer-block');
  if (tblk) tblk.style.display='none';
  resetDialerVoiceVisuals();
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
      out.innerHTML = `<div style="color:var(--text-3);padding:8px;">${tr ? 'Kayıt bulunamadı' : 'Nicht gefunden'}</div>`;
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
    out.innerHTML = `<div style="color:var(--red);padding:8px;">${e.message || 'Error'}</div>`;
  }
}

function pickManualDialContact(idx) {
  const row = window._manualDialLastResults?.[idx];
  if (!row) return;
  const camp = campaigns.find((x) => x.id === row.campaign_id);
  if (row.campaign_id) selectCamp(row.campaign_id, camp?.name || '', { skipActivate: true });
  currentContact = row;
  showCustomerCard(row);
  closeManualDialDrawer();
  if (typeof navigate === 'function') navigate('dialer');
  if (typeof switchContactTab === 'function') switchContactTab('info');
  toast(currentLang === 'tr' ? 'Kişi yüklendi — Ara ile arayın' : 'Kontakt geladen — mit Anrufen wählen', 'ok', 3200);
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
}

async function submitOutcome(goBreak) {
  if (!selectedOutcome) { toast(currentLang==='tr'?'Sonuç seçin':'Ergebnis auswählen','err'); return; }
  const note   = document.getElementById('outcome-note')?.value.trim()||'';
  const cbTime = document.getElementById('callback-dt')?.value||null;
  const isDnc  = document.getElementById('outcome-dnc')?.checked || false;
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
      if (isDnc) await addToDnc(currentContact.phone, currentContact.id);
      const logData = {
        contact_id: contactId,
        campaign_id: selectedCampId,
        firm_id: currentUser.firm_id,
        agent_id: currentUser.id,
        phone: currentContact.phone,
        outcome: finalOutcome,   // normalleştirilmiş (appointment_done → appointment)
        notes: note,
        duration_sec: callSeconds,
        started_at: new Date(Date.now()-callSeconds*1000).toISOString(),
        ended_at: new Date().toISOString(),
      };
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
      const callCheck = isCallAllowed(new Date().toISOString().split('T')[0], new Date().toTimeString().slice(0,8));
      if (!callCheck.allowed) {
        toast('⏸ Otomatik arama duraklatıldı: ' + callCheck.reason, 'warn', 6000);
        _autoDial = false;
        const tog = document.getElementById('auto-dial-toggle');
        if (tog) tog.checked = false;
      } else {
        setTimeout(()=>dialNext(), 1200);
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
  const cb = document.getElementById('auto-dial-toggle');
  const slider = document.getElementById('auto-dial-slider');
  const knob = document.getElementById('auto-dial-knob');
  if (cb) cb.checked = _autoDial;
  if (slider) slider.style.background = _autoDial ? 'var(--accent)' : 'var(--text-3)';
  if (knob) knob.style.transform = _autoDial ? 'translateX(18px)' : 'translateX(0)';
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
  _googleApiKey = gk;
  if (document.getElementById('s-google-key')) document.getElementById('s-google-key').value = gk;
  if (document.getElementById('s-tomtom-key')) document.getElementById('s-tomtom-key').value = tk;
  if (document.getElementById('s-daily-goal')) document.getElementById('s-daily-goal').value = goal;
  _dailyGoal = parseInt(goal);
}

function saveApiSettings() {
  const gk = document.getElementById('s-google-key')?.value?.trim();
  const tk = document.getElementById('s-tomtom-key')?.value?.trim();
  const goal = parseInt(document.getElementById('s-daily-goal')?.value||'5');
  if (gk) { _googleApiKey=gk; localStorage.setItem('mb_google_key',gk); }
  if (tk) localStorage.setItem('mb_tomtom_key',tk);
  if (goal>0) { _dailyGoal=goal; localStorage.setItem('mb_daily_goal',String(goal)); }
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
}

// Test moduna özel hazır toggle — Telnyx kontrolü yok
async function testToggleReady() {
  // Test modunda bile en az bir izinli/aktif kampanya olmadan arama başlamasın.
  const allowed = getAutoDialCampaignIds();
  if (!selectedCampId) { toast('Önce kampanya seçin', 'err'); return; }
  if (!allowed.length) { toast('Önce en az bir kampanyayı aktif edin', 'err'); return; }
  if (dialerStatus === 'offline' || dialerStatus === 'break') {
    setDialerStatus('ready');
    upsertAgentSession({agent_id:currentUser.id, status:'ready', last_seen:new Date().toISOString()}).catch(()=>{});
    setTimeout(() => dialNext(), 300);
  } else if (dialerStatus === 'ready') {
    setDialerStatus('offline');
    upsertAgentSession({agent_id:currentUser.id, status:'offline', last_seen:new Date().toISOString()}).catch(()=>{});
  }
}

// Test modunda gerçek contact ile simüle edilmiş çağrı başlat
async function startTestCall() {
  if (_fakeCallActive) return;
  const contact = await getNextContact(getAutoDialCampaignIds());
  if (!contact) {
    toast('✅ Kuyrukta numara kalmadı', 'ok');
    setDialerStatus('offline'); updateSessionInDB('offline');
    return;
  }
  _fakeCallActive = true;
  window.__voiceOrbSimRemote = true;
  currentContact = contact;
  showCustomerCard(contact);
  // Kontakt durumunu "calling" olarak güncelle
  try {
    await sb(`contacts?id=eq.${contact.id}`, {
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify({ status:'calling', last_called_at: new Date().toISOString() })
    });
  } catch(e) {}
  setDialerStatus('on_call');
  toast(`⚙ TEST: ${contact.first_name||''} ${contact.last_name||''} ${contact.phone}`, 'ok', 3000);
}

function endFakeCall() {
  _fakeCallActive = false;
  window.__voiceOrbSimRemote = false;
  clearTimeout(_fakeCallTimer); _fakeCallTimer = null;
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

  // Overlay içindeki grid ID'lerini ayarla
  window._takvimGridId      = 'takvim-grid-ov';
  window._takvimScrollId    = 'takvim-scroll-ov';
  window._takvimWeekLabelId = 'takvim-week-label-ov';

  const ovAdmin  = document.getElementById('takvim-overlay-admin');
  const ovCampLbl = document.getElementById('takvim-overlay-camp-label');
  const isAdmin  = ['admin','super_admin','firm_admin'].includes(currentUser?.role||'');
  if (ovAdmin) ovAdmin.style.display = isAdmin ? 'flex' : 'none';

  if (isAdmin) {
    // Super admin: firma seçici göster, firma değişince kampanyaları yenile
    if (currentUser?.role === 'super_admin') {
      renderFirmSelector('takvim-overlay-firm-selector', () => _loadTakvimOverlayCamps());
    }
    await _loadTakvimOverlayCamps();
  } else {
    // Agent: atanmış kampanyaları yükle ve select göster
    try {
      const ac = await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id,campaigns(id,name,status)`);
      const agentCamps = (ac||[]).map(a=>a.campaigns).filter(Boolean);
      if (!takvimCampId && agentCamps.length) takvimCampId = agentCamps[0].id;
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
      if (selectedCampId) takvimCampId = selectedCampId;
    }
  }

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
  // Ana sayfaya geçince grid ID'leri resetle
  window._takvimGridId     = 'takvim-grid';
  window._takvimScrollId   = 'takvim-scroll';
  window._takvimWeekLabelId = 'takvim-week-label';
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
