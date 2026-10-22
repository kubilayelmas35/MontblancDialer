// ── Contact manipulation ──────────────────────
async function getNextContact(campaignIds = null) {
  // Aktif kampanya listesini kullan (yoksa selectedCampId ile fallback)
  let ids = Array.isArray(campaignIds)
    ? campaignIds
    : (typeof _activeCampIds !== 'undefined' && _activeCampIds.length)
      ? _activeCampIds
      : [];
  if (!ids.length && typeof selectedCampId !== 'undefined' && selectedCampId) {
    ids = [selectedCampId];
  }
  // Agent tarafında aktif/seçili kampanya boşsa atandığı kampanyalardan otomatik çıkar.
  if (!ids.length && currentUser?.id) {
    try {
      const acRows =
        (await sb(`agent_campaigns?agent_id=eq.${currentUser.id}&select=campaign_id&limit=200`).catch(() => [])) || [];
      const fromAc = acRows.map((r) => String(r.campaign_id || '')).filter(Boolean);
      if (fromAc.length) ids = fromAc;
    } catch (e) {}
  }
  if (!ids.length) {
    // Agent tarafında bazen kampanya listesi/selection henüz oluşmadan test arama tetiklenebiliyor.
    // Test modunda bu durumda erişilebilir herhangi bir gerçek kişiyi döndür.
    if (typeof _testMode !== 'undefined' && _testMode) {
      try {
        const rows =
          (await sb(`contacts?order=last_called_at.asc.nullsfirst&limit=120&select=*`).catch(() => [])) || [];
        const pick = rows.find((c) => {
          if (!c) return false;
          if (!String(c.phone || '').trim()) return false;
          if (c.is_adhoc === true) return false;
          if (String(c.id || '').startsWith('adhoc-')) return false;
          const fn = String(c.first_name || '').trim().toLowerCase();
          const ln = String(c.last_name || '').trim().toLowerCase();
          if ((fn === 'yeni' || fn === 'neu') && (ln === 'çağrı' || ln === 'cagri' || ln === 'anruf')) return false;
          return true;
        });
        if (pick) return pick;
      } catch (e) {}
    }
    return null;
  }
  try {
    const isUsableRealContact = (c) => {
      if (!c) return false;
      if (!String(c.phone || '').trim()) return false;
      if (c.is_adhoc === true) return false;
      if (String(c.id || '').startsWith('adhoc-')) return false;
      const fn = String(c.first_name || '').trim().toLowerCase();
      const ln = String(c.last_name || '').trim().toLowerCase();
      if ((fn === 'yeni' || fn === 'neu') && (ln === 'çağrı' || ln === 'cagri' || ln === 'anruf')) return false;
      return true;
    };
    const idList = ids.map((x) => String(x)).filter(Boolean);
    // Eski/karma veride contact.campaign_id boş, sadece queue_id dolu olabilir.
    let queueIds = [];
    const pausedQueueIds = new Set();
    let queueRows = [];
    try {
      for (let i = 0; i < idList.length; i++) {
        const cid = idList[i];
        const rows =
          (await sb(
            `queues?campaign_id=eq.${cid}&select=id,status,campaign_id&limit=500`
          ).catch(() => [])) || [];
        if (rows.length) queueRows = queueRows.concat(rows);
      }
      const seenQ = new Set();
      queueRows.forEach((q) => {
        const k = String(q?.id || '');
        if (!k || seenQ.has(k)) return;
        seenQ.add(k);
        if (q.status && q.status !== 'active') pausedQueueIds.add(k);
      });
      const testRelaxEarly = typeof _testMode !== 'undefined' && _testMode;
      queueIds = queueRows
        .map((q) => String(q?.id || ''))
        .filter((id, idx, arr) => id && arr.indexOf(id) === idx && (testRelaxEarly || !pausedQueueIds.has(id)));
    } catch (e) {}
    const fetchScopedContacts = async (extraFilters = '', limit = 80) => {
      let out = [];
      // in()/or() kombinasyonlarında PostgREST parse sorunlarını önlemek için
      // kampanya ve queue bazında tek tek eq sorguları atılır.
      for (let i = 0; i < idList.length; i++) {
        const cid = idList[i];
        const byCamp =
          (await sb(
            `contacts?campaign_id=eq.${cid}` +
            `${extraFilters}` +
            `&order=last_called_at.asc.nullsfirst` +
            `&limit=${limit}&select=*`
          ).catch(() => [])) || [];
        if (byCamp.length) out = out.concat(byCamp);
      }
      for (let i = 0; i < queueIds.length; i++) {
        const qid = queueIds[i];
        const byQueue =
          (await sb(
            `contacts?queue_id=eq.${qid}` +
            `${extraFilters}` +
            `&order=last_called_at.asc.nullsfirst` +
            `&limit=${limit}&select=*`
          ).catch(() => [])) || [];
        if (byQueue.length) out = out.concat(byQueue);
      }
      const seen = new Set();
      return out.filter((r) => {
        const k = String(r?.id || `${r?.campaign_id || ''}:${r?.queue_id || ''}:${r?.phone || ''}`);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const nowIso = new Date().toISOString();

    // Test modunda önce kampanyadaki gerçek kişileri doğrudan dene
    if (typeof _testMode !== 'undefined' && _testMode) {
      const allInCamp = await fetchScopedContacts('', 120);
      if (allInCamp.length) {
        const preferred = allInCamp.find((c) =>
          isUsableRealContact(c) && ['pending', 'no_answer', 'callback'].includes(String(c.status || '').toLowerCase())
        );
        if (preferred) return preferred;
        const anyReal = allInCamp.find((c) => isUsableRealContact(c));
        if (anyReal) return anyReal;
      }
    }

    // Normal akış: önce bekleyen / cevap yok / vakti gelen geri aramalar
    let contacts = await fetchScopedContacts(
      `&status=in.(pending,no_answer,callback)&or=(callback_at.is.null,callback_at.lte.${nowIso})`,
      50
    ) || [];
    if (!(typeof _testMode !== 'undefined' && _testMode) && typeof campRecyclePolicy === 'function') {
      for (let i = 0; i < idList.length; i++) {
        const pol = campRecyclePolicy(idList[i]);
        if (!pol?.on) continue;
        const extraSt = pol.statuses.filter((st) => !['pending', 'no_answer', 'callback'].includes(st));
        if (!extraSt.length) continue;
        const rows = (await sb(
          `contacts?campaign_id=eq.${idList[i]}&status=in.(${extraSt.join(',')})&order=last_called_at.asc.nullsfirst&limit=40&select=*`
        ).catch(() => [])) || [];
        if (rows.length) contacts = contacts.concat(rows);
      }
    }
    if (!contacts?.length) {
      if (typeof _testMode !== 'undefined' && _testMode && ids.length) {
        // Test modunda: uygun statüde kayıt yoksa kampanyadaki gerçek kayıttan devam et.
        const fallback = await fetchScopedContacts('', 120);
        if (fallback?.length) {
          for (let i = 0; i < fallback.length; i++) {
            const c = fallback[i];
            if (isUsableRealContact(c)) return c;
          }
          const any = fallback.find((x) => isUsableRealContact(x));
          if (any) return any;
        }
        // Hala bulunamadıysa firmadaki herhangi bir gerçek kişiyle test et.
        const fid = typeof currentUser !== 'undefined' ? currentUser?.firm_id : null;
        if (fid) {
          const firmWide = await sb(
            `contacts?firm_id=eq.${fid}` +
            `&order=last_called_at.asc.nullsfirst` +
            `&limit=30&select=*`
          ).catch(() => []);
          if (firmWide?.length) {
            const byCamp = firmWide.find((x) => ids.includes(x?.campaign_id) && isUsableRealContact(x));
            if (byCamp) return byCamp;
            const anyFirm = firmWide.find((x) => isUsableRealContact(x));
            if (anyFirm) return anyFirm;
          }
        }
        // Son çare: filtreyi tamamen bırak, erişebildiğimiz gerçek kaydı kullan.
        const absoluteFallback =
          (await sb(
            `contacts?order=last_called_at.asc.nullsfirst&limit=120&select=*`
          ).catch(() => [])) || [];
        const anyAbsolute = absoluteFallback.find((x) => isUsableRealContact(x));
        if (anyAbsolute) return anyAbsolute;
        // Test modunda sentetik kişi üretme: veri yoksa boş kuyruk dön.
        return null;
      }
      return null;
    }
    const testRelax = typeof _testMode !== 'undefined' && _testMode;
    if (!testRelax) {
      const hot = queueRows
        .filter((q) => q?.id && !pausedQueueIds.has(String(q.id)) && typeof queueDialPrefs === 'function' && queueDialPrefs(q.campaign_id, q.id).priority > 0)
        .sort((a, b) => queueDialPrefs(b.campaign_id, b.id).priority - queueDialPrefs(a.campaign_id, a.id).priority)
        .slice(0, 5);
      for (let i = 0; i < hot.length; i++) {
        const extra = (await sb(
          `contacts?queue_id=eq.${hot[i].id}&status=in.(pending,no_answer,callback)&or=(callback_at.is.null,callback_at.lte.${nowIso})&order=last_called_at.asc.nullsfirst&limit=20&select=*`
        ).catch(() => [])) || [];
        extra.forEach((row) => contacts.unshift(row));
      }
    }
    const seenPick = new Set();
    const usable = [];
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const key = String(c?.id || '');
      if (key && seenPick.has(key)) continue;
      if (key) seenPick.add(key);
      if (!isUsableRealContact(c)) continue;
      const qid = String(c.queue_id || '');
      if (qid && pausedQueueIds.has(qid) && !testRelax) continue;
      const prefs = typeof queueDialPrefs === 'function' ? queueDialPrefs(c.campaign_id, c.queue_id) : { priority: 0, maxAttempts: 0 };
      if (!testRelax && prefs.maxAttempts > 0 && (Number(c.attempt_count) || 0) >= prefs.maxAttempts) continue;
      if (typeof contactEligibleForRecycle === 'function' && !contactEligibleForRecycle(c, testRelax)) continue;
      c._qPri = prefs.priority || 0;
      usable.push(c);
    }
    usable.sort((a, b) => (b._qPri - a._qPri) || ((Date.parse(a.last_called_at || '') || 0) - (Date.parse(b.last_called_at || '') || 0)));
    return usable[0] || null;
  } catch(e) { console.error(e); return null; }
}

function showCustomerCard(c) {
  if (typeof hideOutboundWait === 'function') hideOutboundWait();
  if (typeof stopCustEmptyCoach === 'function') stopCustEmptyCoach();
  document.getElementById('customer-card')?.classList.remove('customer-card--empty');
  document.getElementById('cust-empty').style.display='none';
  document.getElementById('cust-data').style.display='';
  showPrevCallInfo(c);
  showCampScript(c);
  const camp = campaigns.find(x=>x.id===c.campaign_id);
  const fc = typeof mbParseFieldConfig === 'function' ? mbParseFieldConfig(camp) : {};
  const show = (key, def=true) => (typeof mbFieldShown === 'function' ? mbFieldShown(fc, key, def) : def);
  const layout = typeof mbDialerLayoutFields === 'function' ? mbDialerLayoutFields(fc) : [];
  const head = layout.slice(0, 2);
  const headText = (field) => (field && typeof mbContactFieldText === 'function' ? (mbContactFieldText(c, field.key) || '—') : '');
  const titleText = headText(head[0]) || c.phone || '—';
  const subText = head[1] ? headText(head[1]) : '';
  const avEl = document.getElementById('cust-av');
  const avLetter = String(titleText || c.phone || '?').trim().charAt(0).toUpperCase();
  const avInner = avEl?.querySelector('.cust-av-inner');
  if (avInner) avInner.textContent = avLetter;
  else if (avEl) avEl.textContent = avLetter;
  document.getElementById('cust-name').textContent  = titleText;
  document.getElementById('cust-phone').textContent = subText;
  document.getElementById('cust-attempt-badge').style.display = show('attempt') ? '' : 'none';
  document.getElementById('cust-attempt-badge').textContent = uqSay('dial.attempt', '{n}. arama', { n: c.attempt_count || 1 });
  document.getElementById('cust-camp-badge').textContent  = camp?.name||'—';
  document.getElementById('cust-queue-badge').textContent = c.queues?.name||c.queue_name||'—';
  const labelOf = (key, fallback) => (typeof mbFieldLabel === 'function' ? mbFieldLabel(fc, key, fallback) : fallback);
  const textOf = (key) => (typeof mbContactFieldText === 'function' ? mbContactFieldText(c, key) : '');
  const visibleFields = layout.slice(2).map((field) => ({
    key: field.key,
    l: labelOf(field.key, field.label || field.key),
    v: textOf(field.key),
    mono: field.key === 'plz' || field.key === 'phone' || field.key === 'phone2',
  }));
  const terminFields = dialerTerminFields(camp, c);
  document.getElementById('cust-fields').innerHTML = visibleFields.map(f=>{
    const canEditFields = typeof mbAgentCanEditFields !== 'function' || mbAgentCanEditFields(camp);
    const canCallSecondary = f.key === 'phone2' && String(f.v || '').trim().length > 0;
    const quickCallBtn = canCallSecondary
      ? `<button type="button" onclick="callSecondaryPhone()"
style="flex-shrink:0;background:var(--accent-soft);border:1px solid var(--accent);cursor:pointer;color:var(--accent);padding:4px 7px;border-radius:6px;transition:.15s;font-size:11px;font-weight:700;"
title="2. numarayı ara"
onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
onmouseout="this.style.background='var(--accent-soft)';this.style.color='var(--accent)'">
<i class="ph ph-phone-call" style="font-size:12px;vertical-align:-1px;"></i>
</button>`
      : '';
    return `
<div class="cust-field" style="position:relative;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
<div class="cust-field-lbl" style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${f.l}</div>
<div style="display:flex;align-items:center;gap:6px;">
<div class="cust-field-val${f.mono?' mono':''}" id="cval-${f.key}"
style="flex:1;font-size:14px;font-weight:600;cursor:pointer;min-height:20px;"
onclick="copyToClipboard('${(f.v||'').replace(/'/g,"\\'")}','${f.l} kopyalandı')"
title="Kopyala (tıkla) — düzenlemek için kalem ikonuna bas">${f.v||'—'}</div>
${quickCallBtn}
${canEditFields ? `<button onclick="startFieldEdit('${f.key}','${f.l}',this)"
style="flex-shrink:0;background:transparent;border:none;cursor:pointer;color:var(--text-3);padding:2px;border-radius:4px;opacity:.6;transition:.15s;"
title="Düzenle"
onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
onmouseout="this.style.opacity='.6';this.style.color='var(--text-3)'">
<i class="ph ph-pencil-simple" style="font-size:14px;"></i>
</button>` : ''}
</div>
</div>`;
  }).join('');
  const terminContainer = document.getElementById('termin-fields-section') || (() => {
    const el = document.createElement('div');
    el.id = 'termin-fields-section';
    el.style.cssText = 'margin-top:12px;padding-top:12px;border-top:2px dashed var(--accent);display:none;';
    document.getElementById('cust-fields')?.after(el);
    return el;
  })();
  // Default hidden — only show when slot selected
  if (!window._selectedBookingSlot) terminContainer.style.display = 'none';
  terminContainer.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<div style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:5px;" class="termin-slot-hdr">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Randevu Bilgileri
</div>
<span id="termin-slot-badge" style="font-size:9px;color:var(--text-3);background:var(--bg-3);border:1px solid var(--border);border-radius:4px;padding:2px 6px;">Slot seçilmedi</span>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
${terminFields.map(f => `
<div data-tf-key="${_escHtml(f.key)}" data-required="${f.required ? '1' : '0'}" style="background:var(--bg-3);border:1px solid ${f.required?'rgba(37,99,235,.3)':'var(--border)'};border-radius:8px;padding:7px 10px;">
<div style="font-size:10px;font-weight:700;color:${f.required?'var(--accent-text)':'var(--text-3)'};text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">
${_escHtml(f.l)}${f.required?'<span style="color:var(--red);margin-left:2px;">*</span>':''}
</div>
${f.type==='select'
? `<select id="tf2-${f.key}" class="form-input" style="font-size:12px;padding:2px 6px;height:26px;" onchange="updateTerminField('${f.key}',this.value)">
${(f.opts||['']).map(o=>`<option value="${_escHtml(o)}" ${o===f.v?'selected':''}>${_escHtml(o||f.placeholder||'…')}</option>`).join('')}
</select>`
: f.type==='boolean'
? `<select id="tf2-${f.key}" class="form-input" style="font-size:12px;padding:2px 6px;height:26px;" onchange="updateTerminField('${f.key}',this.value)">
<option value="" ${!f.v?'selected':''}>…</option>
<option value="true" ${String(f.v)==='true'?'selected':''}>${typeof currentLang!=='undefined'&&currentLang==='de'?'Ja':'Evet'}</option>
<option value="false" ${String(f.v)==='false'?'selected':''}>${typeof currentLang!=='undefined'&&currentLang==='de'?'Nein':'Hayır'}</option>
</select>`
: `<input id="tf2-${f.key}" class="form-input" style="font-size:12px;padding:2px 6px;height:26px;" type="${f.type==='number'?'number':'text'}"
value="${_escHtml(f.v||'')}" placeholder="${_escHtml(f.placeholder||'')}"${f.type==='number'?` data-tf-min="${_escHtml(f.min??'')}" data-tf-max="${_escHtml(f.max??'')}"`:''}
oninput="updateTerminField('${f.key}',this.value);mbMarkTerminRange(this)">
${f.type==='number'?`<div data-tf-warn style="display:none;font-size:10px;color:var(--red);margin-top:3px;font-weight:700;"></div>`:''}`
}
</div>`).join('')}
</div>
<div id="tf2-customer-wrap" style="margin-top:8px;"></div>
<div id="tf-note-row" style="margin-top:8px;">
<label style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;">Not</label>
<textarea id="tf2-note" class="form-input" rows="2" style="font-size:12px;resize:vertical;margin-top:3px;" placeholder="Agent notu..." oninput="onDialerNoteInput(this.value,'tf2')">${_escHtml(c.notes || '')}</textarea>
</div>
<button onclick="saveTerminFromSection()" style="margin-top:8px;width:100%;padding:8px;background:linear-gradient(135deg,var(--accent),var(--accent-2,var(--accent)));color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;">
Randevuyu Kaydet
</button>`;
  if (typeof renderInlineTerminCustomerField === 'function') {
    renderInlineTerminCustomerField();
  }
  terminContainer.querySelectorAll('input[data-tf-min], input[data-tf-max]').forEach((el) => mbMarkTerminRange(el));
  const nameEl = document.getElementById('cust-name');
  if (nameEl) {
    const headKey = head[0]?.key;
    const canEditFields = typeof mbAgentCanEditFields !== 'function' || mbAgentCanEditFields(camp);
    if (headKey === 'name' && canEditFields) {
      nameEl.innerHTML = `<span>${_escHtml(titleText || '—')}</span><button onclick="startCustomerNameEdit(this)" style="margin-left:6px;background:transparent;border:none;cursor:pointer;color:var(--text-3);vertical-align:middle;" title="İsim düzenle"><i class="ph ph-pencil-simple"></i></button>`;
    } else {
      nameEl.textContent = titleText || '—';
    }
    nameEl.dataset.headKey = headKey || '';
    const nameLabel = head[0] ? labelOf(head[0].key, head[0].label || 'Ad') : 'Ad';
    nameEl.style.cursor = 'pointer';
    nameEl.title = 'Kopyala';
    nameEl.onclick = (ev) => {
      if (ev.target.closest('button, input')) return;
      const text = (nameEl.querySelector('span')?.textContent || (nameEl.querySelector('input') ? '' : nameEl.textContent) || '').trim();
      if (!text || text === '—') return;
      copyToClipboard(text, `${nameLabel} kopyalandı`);
    };
  }
  const phoneEl = document.getElementById('cust-phone');
  if (phoneEl) {
    phoneEl.dataset.headKey = head[1]?.key || '';
    const subLabel = head[1] ? labelOf(head[1].key, head[1].label || '') : '';
    phoneEl.style.cursor = subText ? 'pointer' : 'default';
    phoneEl.title = subText ? 'Kopyala' : '';
    phoneEl.onclick = subText ? () => copyToClipboard(phoneEl.textContent, `${subLabel} kopyalandı`) : null;
  }
  if (typeof dialerStatus === 'undefined' || dialerStatus !== 'wrapping') {
    if (typeof switchContactTab === 'function') switchContactTab('info');
  }
  if (window._qcReviewApptId && typeof mountQcReviewForm === 'function') mountQcReviewForm();
  else document.getElementById('qc-review-form')?.remove();
  if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
  syncDialerNotes(c.notes || '', 'load');
  bindDialerNoteSync();
}

function mbTerminBound(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mbMarkTerminRange(input) {
  if (!input) return;
  const min = mbTerminBound(input.getAttribute('data-tf-min'));
  const max = mbTerminBound(input.getAttribute('data-tf-max'));
  const warn = input.parentElement?.querySelector('[data-tf-warn]');
  const raw = String(input.value || '').trim().replace(',', '.');
  const n = raw === '' ? null : Number(raw);
  const bad = n != null && Number.isFinite(n) && ((min != null && n < min) || (max != null && n > max));
  input.style.borderColor = bad ? 'var(--red)' : '';
  input.style.boxShadow = bad ? '0 0 0 2px rgba(220,38,38,.15)' : '';
  if (!warn) return;
  if (!bad) {
    warn.style.display = 'none';
    warn.textContent = '';
    return;
  }
  let msg = '';
  if (min != null && max != null) msg = typeof tReplace === 'function' ? tReplace('camp.tf.range.both', { min, max }) : `${min}–${max} dışında`;
  else if (min != null) msg = typeof tReplace === 'function' ? tReplace('camp.tf.range.min', { n: min }) : `En az ${min}`;
  else msg = typeof tReplace === 'function' ? tReplace('camp.tf.range.max', { n: max }) : `En fazla ${max}`;
  warn.textContent = msg;
  warn.style.display = '';
}

function dialerTerminFields(camp, contact) {
  const defaults = [
    { key:'hausart', l:'Ev Tipi', type:'select', opts:['','Einfamilienhaus','Zweifamilienhaus','Reihenhaus','Doppelhaus','Mehrfamilienhaus'], required:true, enabled:true, placeholder:'' },
    { key:'baujahr', l:'Yapım Yılı', required:true, enabled:true, placeholder:'1998' },
    { key:'qm', l:'m²', type:'number', required:true, enabled:true, placeholder:'140' },
    { key:'heizung', l:'Isıtma', type:'select', opts:['','Gas','Öl','Pellet','WP','Fernwärme'], required:true, enabled:true, placeholder:'' },
    { key:'alter_der_heizung', l:'Isıtma Yaşı', required:true, enabled:true, placeholder:'15' },
    { key:'verbrauch_pro_jahr', l:'Tüketim/Yıl', enabled:true, placeholder:'18000' },
    { key:'personen', l:'Kişi Sayısı', type:'number', enabled:true, placeholder:'4' },
    { key:'interesse_an_pv', l:'PV İlgisi', type:'boolean', enabled:false, placeholder:'' },
  ];
  const saved = (typeof getCampSettings === 'function' ? getCampSettings(camp) : {}).termin_form || {};
  const source = Array.isArray(saved.fields) && saved.fields.length
    ? saved.fields
    : defaults.map((f) => ({ ...f, ...(saved[f.key] || {}), label: saved[f.key]?.label || f.l }));
  return source.map((f) => {
    const base = defaults.find((d) => d.key === f.key) || {};
    if (f.enabled === false) return null;
    const next = {
      key: f.key,
      l: f.label || f.l || base.l || f.key,
      v: contact?.[f.key] || '',
      type: f.type || base.type || 'text',
      required: !!(f.required ?? base.required),
      placeholder: f.placeholder ?? base.placeholder ?? '',
      min: f.min ?? base.min ?? '',
      max: f.max ?? base.max ?? '',
    };
    if (next.type === 'select') {
      const raw = f.opts || (base.opts || []).slice(1).join(',');
      next.opts = [''].concat(String(raw || '').split(',').map((s) => s.trim()).filter(Boolean));
    }
    return next;
  }).filter(Boolean);
}

let _noteSyncLock = false;
let _noteSaveTimer = 0;

function syncDialerNotes(note, source) {
  const text = String(note ?? '');
  if (_noteSyncLock) return;
  _noteSyncLock = true;
  try {
    const out = document.getElementById('outcome-note');
    const tf = document.getElementById('tf2-note');
    const top = document.getElementById('cval-notes');
    const editing = document.getElementById('cedit-notes');
    if (!window._qcReviewApptId && source !== 'outcome' && out && out.value !== text) out.value = text;
    if (source !== 'tf2' && tf && tf.value !== text) tf.value = text;
    if (source !== 'top' && editing && editing.value !== text) editing.value = text;
    if (source !== 'top' && top && top.style.display !== 'none') top.textContent = text.trim() ? text : '—';
    if (typeof currentContact !== 'undefined' && currentContact) currentContact.notes = text;
  } finally {
    _noteSyncLock = false;
  }
}

function onDialerNoteInput(value, source) {
  if (window._qcReviewApptId) return;
  syncDialerNotes(value, source);
  queueContactNoteSave(value);
}

function bindDialerNoteSync() {
  const out = document.getElementById('outcome-note');
  if (out && out.dataset.noteSync !== '1') {
    out.dataset.noteSync = '1';
    out.addEventListener('input', () => onDialerNoteInput(out.value, 'outcome'));
  }
}

function queueContactNoteSave(text) {
  const id = currentContact?.id;
  if (!id || typeof isValidUUID !== 'function' || !isValidUUID(id)) return;
  clearTimeout(_noteSaveTimer);
  _noteSaveTimer = setTimeout(() => {
    if (currentContact?.id !== id) return;
    sb(`contacts?id=eq.${id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ notes: text })
    }).catch(() => {});
  }, 400);
}

function markContactDirty() {
  const saveBtn = document.getElementById('cust-save-btn');
  if (saveBtn) saveBtn.style.display = '';
}

async function saveContactEdits() {
  if (!currentContact?.id) return;
  const updates = {};
  const fieldMap = {plz:'plz',city:'city',address:'address',phone2:'phone2',notes:'notes'};
  Object.entries(fieldMap).forEach(([key]) => {
    const el = document.getElementById('cedit-'+key);
    if (el) updates[key] = el.value.trim();
  });
  try {
    await sb(`contacts?id=eq.${currentContact.id}`,{
      method:'PATCH', prefer:'return=minimal',
      body: JSON.stringify(updates)
    });
    Object.assign(currentContact, updates);
    const saveBtn = document.getElementById('cust-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    toast('Müşteri bilgileri güncellendi ✓','ok');
  } catch(e) { toast('Hata: '+e.message,'err'); }
}

function clearCustomerCard() {
  if (typeof hideOutboundWait === 'function') hideOutboundWait();
  document.getElementById('customer-card')?.classList.add('customer-card--empty');
  document.getElementById('cust-empty').style.display='';
  document.getElementById('cust-data').style.display='none';
  const dock = document.getElementById('outcome-dock');
  if (dock) dock.hidden = true;
  if (typeof syncDialerBottomChrome === 'function') syncDialerBottomChrome();
  if (typeof startCustEmptyCoach === 'function') startCustEmptyCoach();
}

function switchContactTab(tab) {
  ['info','map','history','file','outcome'].forEach(t => {
    const btn   = document.getElementById('ctab-'+t);
    const panel = document.getElementById('ctab-'+t+'-panel');
    if (btn) { btn.style.background=t===tab?'var(--text)':'transparent'; btn.style.color=t===tab?'var(--bg-2)':'var(--text-2)'; }
    if (panel) panel.style.display=t===tab?'':'none';
  });
  const dock = document.getElementById('outcome-dock');
  if (dock) dock.hidden = tab !== 'outcome';
  if (tab==='map' && currentContact) showContactMap(currentContact.address, currentContact.plz, currentContact.city);
  if (tab==='history' && currentContact) loadContactHistory(currentContact.id);
  if (tab==='file' && currentContact) updateContactFileHint();
  if (tab==='outcome' && typeof paintDialerOutcomes === 'function') paintDialerOutcomes();
}

function _escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function startCustomerNameEdit(btnEl) {
  if (!currentContact?.id) return;
  const camp = (campaigns || []).find((c) => c.id === currentContact.campaign_id);
  if (typeof mbAgentCanEditFields === 'function' && !mbAgentCanEditFields(camp)) {
    toast(typeof t === 'function' ? t('camp.arama.edit.locked') : 'Bu kampanyada alanlar kilitli', 'warn');
    return;
  }
  const nameEl = document.getElementById('cust-name');
  if (!nameEl) return;
  const curFirst = currentContact.first_name || '';
  const curLast = currentContact.last_name || '';
  nameEl.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
    <input id="cust-edit-first" class="form-input" style="max-width:140px;height:28px;padding:4px 8px;font-size:12px;" value="${_escHtml(curFirst)}" placeholder="Ad">
    <input id="cust-edit-last" class="form-input" style="max-width:160px;height:28px;padding:4px 8px;font-size:12px;" value="${_escHtml(curLast)}" placeholder="Soyad">
    <button onclick="saveCustomerNameEdit()" style="background:transparent;border:none;color:var(--green);cursor:pointer;" title="Kaydet"><i class="ph ph-check"></i></button>
    <button onclick="showCustomerCard(currentContact)" style="background:transparent;border:none;color:var(--text-3);cursor:pointer;" title="İptal"><i class="ph ph-x"></i></button>
  </div>`;
  const pushName = () => {
    if (typeof qcSyncTwin !== 'function') return;
    const full = `${document.getElementById('cust-edit-first')?.value || ''} ${document.getElementById('cust-edit-last')?.value || ''}`.trim();
    qcSyncTwin('name', full, 'top', { domOnly: true });
  };
  nameEl.querySelector('#cust-edit-first')?.addEventListener('input', pushName);
  nameEl.querySelector('#cust-edit-last')?.addEventListener('input', pushName);
}

async function saveCustomerNameEdit() {
  if (!currentContact?.id) return;
  const first = document.getElementById('cust-edit-first')?.value?.trim() || '';
  const last = document.getElementById('cust-edit-last')?.value?.trim() || '';
  try {
    await sb(`contacts?id=eq.${currentContact.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ first_name: first, last_name: last })
    });
    currentContact.first_name = first;
    currentContact.last_name = last;
    if (typeof qcSyncTwin === 'function') qcSyncTwin('name', `${first} ${last}`.trim(), 'top');
    showCustomerCard(currentContact);
    toast('İsim güncellendi', 'ok');
  } catch (e) {
    toast('İsim güncellenemedi: ' + e.message, 'err');
  }
}

async function _getLatestAppointmentForContact(contactId) {
  if (!contactId) return null;
  try {
    const rows = await sb(`appointments?contact_id=eq.${contactId}&select=*&order=kayit_tarihi.desc&limit=1`);
    return rows?.[0] || null;
  } catch (e) {
    return null;
  }
}

async function updateContactFileHint() {
  const hint = document.getElementById('contact-file-hint');
  if (!hint || !currentContact?.id) return;
  const appt = await _getLatestAppointmentForContact(currentContact.id);
  if (!appt) {
    hint.textContent = 'Henüz randevu bulunamadı. Müşteri ve çağrı bilgileri indirilecek.';
    return;
  }
  const bookedAt = appt.kayit_tarihi || appt.termin_tarih;
  hint.textContent = `Son randevu: ${bookedAt ? new Date(bookedAt).toLocaleString('tr-TR') : '—'} · Durum: ${appt.durum || '—'}`;
}

function _apptWallDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR');
}

function _apptWallTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

async function _buildContactExportRows() {
  if (!currentContact) return [];
  const appt = await _getLatestAppointmentForContact(currentContact.id);
  return [{
    ad_soyad: `${currentContact.first_name || ''} ${currentContact.last_name || ''}`.trim() || '—',
    telefon: currentContact.phone || '—',
    plz: currentContact.plz || '—',
    sehir: currentContact.city || '—',
    adres: currentContact.address || '—',
    kampanya: campaigns.find((x) => x.id === currentContact.campaign_id)?.name || currentContact.campaign_id || '—',
    randevu_durum: appt?.durum || '—',
    randevu_tarih: _apptWallDate(appt?.termin_tarih),
    randevu_saat: _apptWallTime(appt?.termin_tarih),
    not: appt?.agent_notu || currentContact.notes || '—'
  }];
}

async function downloadContactAppointmentExcel() {
  const rows = await _buildContactExportRows();
  if (!rows.length || typeof XLSX === 'undefined') {
    toast('Excel için veri/kütüphane bulunamadı', 'err');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Randevu');
  const slug = (rows[0].ad_soyad || 'musteri').replace(/[^\w]+/g, '_');
  XLSX.writeFile(wb, `randevu_${slug}.xlsx`);
}

async function downloadContactAppointmentPdf() {
  const rows = await _buildContactExportRows();
  if (!rows.length || !window.jspdf?.jsPDF) {
    toast('PDF kütüphanesi bulunamadı', 'err');
    return;
  }
  const r = rows[0];
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14);
  doc.text('Randevu Bilgileri', 14, 16);
  doc.setFontSize(10);
  let y = 28;
  Object.entries(r).forEach(([k, v]) => {
    doc.text(`${k}: ${String(v || '—')}`, 14, y);
    y += 8;
  });
  const slug = (r.ad_soyad || 'musteri').replace(/[^\w]+/g, '_');
  doc.save(`randevu_${slug}.pdf`);
}

async function loadContactHistory(contactId) {
  if (!contactId) return;
  const el = document.getElementById('contact-history-list');
  if (!el) return;
  try {
    const logs = await sb(`call_logs?contact_id=eq.${contactId}&select=*&order=started_at.desc&limit=10`);
    if (!logs?.length) { el.innerHTML='<div style="color:var(--text-3);padding:12px;text-align:center;">Önceki arama yok</div>'; return; }
    el.innerHTML = logs.map(l=>`
<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
<div>
<div style="font-weight:700;font-size:11px;">${new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
${(() => { const nt = _stripSimCallMarker(l.notes); return nt ? '<div style="font-size:11px;color:var(--text-3);">' + _escHtml(nt) + '</div>' : ''; })()}
${_isFakeRecordingRow(l) ? _fakeRecordingMarkup(l, 'history') : ''}
</div>
<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--bg-3);">${l.outcome||'—'}</span>
</div>`).join('');
  } catch(e) { el.innerHTML='<div style="color:var(--text-3);padding:12px;text-align:center;">Geçmiş okunamadı</div>'; }
}

function _logDurationSec(log) {
  return Math.max(0, Number(log?.duration_sec ?? log?.duration_seconds ?? 0) || 0);
}

const _SIM_CALL_MARKER = '__test_sim__';

function _stripSimCallMarker(notes) {
  return String(notes || '')
    .replace(new RegExp(`(?:^|\\n)\\s*${_SIM_CALL_MARKER}\\s*$`, 'i'), '')
    .trim();
}

function _isFakeRecordingRow(log) {
  const noRealRecording = !String(log?.recording_url || '').trim();
  if (!noRealRecording) return false;
  const notesRaw = String(log?.notes || '');
  const explicitTest =
    log?.is_test === true ||
    log?.is_inbound_test === true ||
    notesRaw.includes(_SIM_CALL_MARKER);
  if (explicitTest) return true;
  // Eski kayıtlar (işaretsiz): yalnızca test oturumunda, Telnyx kaydı yoksa
  if (typeof _testMode !== 'undefined' && _testMode) {
    const dur = _logDurationSec(log);
    const hasTelnyx = String(log?.telnyx_call_id || '').trim();
    if (dur >= 1 && dur <= 900 && !hasTelnyx) return true;
  }
  return false;
}

function _formatMMSS(totalSec) {
  const n = Math.max(0, Number(totalSec) || 0);
  const mm = Math.floor(n / 60);
  const ss = Math.floor(n % 60);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

let _simRecTimer = null;
let _simRecState = { key: '', sec: 0, dur: 0 };

function _stopSimRec() {
  if (_simRecTimer) clearInterval(_simRecTimer);
  _simRecTimer = null;
  _simRecState = { key: '', sec: 0, dur: 0 };
  const all = document.querySelectorAll('.sim-rec-wrap');
  all.forEach((wrap) => {
    const btn = wrap.querySelector('.sim-rec-btn');
    const fill = wrap.querySelector('.sim-rec-fill');
    const time = wrap.querySelector('.sim-rec-time');
    const dur = Number(wrap.getAttribute('data-dur') || 0);
    if (btn) btn.textContent = '▶';
    if (fill) fill.style.width = '0%';
    if (time) time.textContent = `00:00 / ${_formatMMSS(dur)}`;
  });
}

function toggleFakeRecording(key, durSec) {
  const wrap = document.querySelector(`.sim-rec-wrap[data-key="${String(key).replace(/"/g, '\\"')}"]`);
  if (!wrap) return;
  const btn = wrap.querySelector('.sim-rec-btn');
  const fill = wrap.querySelector('.sim-rec-fill');
  const time = wrap.querySelector('.sim-rec-time');
  const dur = Math.max(1, Number(durSec) || 1);
  if (_simRecState.key === key && _simRecTimer) {
    _stopSimRec();
    return;
  }
  _stopSimRec();
  _simRecState = { key, sec: 0, dur };
  if (btn) btn.textContent = '⏸';
  _simRecTimer = setInterval(() => {
    _simRecState.sec += 1;
    const pct = Math.min(100, (_simRecState.sec / dur) * 100);
    if (fill) fill.style.width = `${pct}%`;
    if (time) time.textContent = `${_formatMMSS(_simRecState.sec)} / ${_formatMMSS(dur)}`;
    if (_simRecState.sec >= dur) _stopSimRec();
  }, 1000);
}

function mbDownloadTestTone(seconds) {
  const sr = 8000;
  const n = Math.max(1, Math.min(3, Number(seconds) || 1)) * sr;
  const data = n * 2;
  const buf = new ArrayBuffer(44 + data);
  const view = new DataView(buf);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < n; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.18;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  link.download = 'test-kayit.wav';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

function _fakeRecordingMarkup(log, scopeKey) {
  const dur = Math.max(8, _logDurationSec(log));
  const key = `${scopeKey}-${log?.id || log?.started_at || Math.random().toString(16).slice(2)}`;
  const dl = typeof t === 'function' ? t('ch.rec.download') : 'Kaydı indir';
  return `<div class="sim-rec-wrap" data-key="${_escHtml(key)}" data-dur="${dur}" style="margin-top:6px;">
<div style="display:flex;align-items:center;gap:6px;">
  <button type="button" class="sim-rec-btn" onclick="toggleFakeRecording('${key}',${dur})"
    style="border:1px solid var(--border);background:var(--bg-3);border-radius:6px;padding:2px 8px;cursor:pointer;">▶</button>
  <span class="sim-rec-time" style="font-size:11px;color:var(--text-2);font-family:var(--mono);">00:00 / ${_formatMMSS(dur)}</span>
  <button type="button" class="ch-rec-dl" onclick="event.stopPropagation();mbDownloadTestTone(${dur})">${_escHtml(dl)}</button>
  <span style="font-size:10px;color:var(--yellow);font-weight:700;">${typeof t === 'function' ? t('ch.test_rec') : 'TEST KAYIT'}</span>
</div>
<div style="height:4px;background:var(--bg-3);border-radius:999px;overflow:hidden;margin-top:4px;">
  <div class="sim-rec-fill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent),var(--accent-2,var(--accent)));"></div>
</div>
</div>`;
}

function toggleAudio(logId) {
  const aud = document.getElementById('aud-'+logId) || document.getElementById('ch-aud-'+logId);
  const btn = document.querySelector(`button[onclick*="toggleAudio('${logId}')"]`);
  if (!aud) return;
  if (_currentAudio && _currentAudio !== aud) {
    _currentAudio.pause(); _currentAudio.currentTime = 0;
    if (_currentAudioBtn) _currentAudioBtn.textContent = '▶';
  }
  if (aud.paused) {
    aud.play();
    if (btn) btn.textContent = '⏸';
    _currentAudio = aud; _currentAudioBtn = btn;
    aud.ontimeupdate = () => {
      const pct = aud.duration ? (aud.currentTime/aud.duration*100).toFixed(0) : 0;
      if (btn) btn.title = `${pct}%`;
    };
    aud.onended = () => { if (btn) btn.textContent = '▶'; _currentAudio = null; };
  } else {
    aud.pause(); if (btn) btn.textContent = '▶'; _currentAudio = null;
  }
}

async function addToDnc(phone, contactId) {
  if (!phone) return;
  try {
    await sb(`contacts?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({status: 'dnc', locked_by: null})
    });
    await sb('call_logs', {method:'POST', prefer:'return=minimal',
      body: JSON.stringify({
        contact_id: contactId, agent_id: currentUser.id,
        campaign_id: selectedCampId, firm_id: currentUser.firm_id,
        phone, outcome: 'dnc',
        started_at: new Date().toISOString(), ended_at: new Date().toISOString()
      })
    });
    toast('🚫 Numara kara listeye eklendi', 'ok');
  } catch(e) { console.error('DNC error:', e); }
}

async function mbFindExistingPhones(phones, mode, campaignId) {
  const found = new Set();
  if (mode !== 'campaign' && mode !== 'system') return found;
  const unique = [...new Set((phones || []).map((p) => mbNormalizeDialPhone(p)).filter(Boolean))];
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const list = chunk.map((p) => encodeURIComponent(p)).join(',');
    const scope = mode === 'campaign' && campaignId ? `&campaign_id=eq.${campaignId}` : '';
    try {
      const existing = await sb(`contacts?select=phone&phone=in.(${list})${scope}`) || [];
      existing.forEach((e) => {
        const n = mbNormalizeDialPhone(e.phone);
        if (n) found.add(n);
      });
    } catch (e) {}
  }
  return found;
}

async function mbFindPhonesWithStatuses(phones, statuses) {
  const found = new Map();
  const allowed = (statuses || []).filter((key) => UQ_OUTCOME_SKIP.some((row) => row.key === key));
  if (!allowed.length) return found;
  const unique = [...new Set((phones || []).map((p) => mbNormalizeDialPhone(p)).filter(Boolean))];
  const statusList = allowed.join(',');
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const list = chunk.map((p) => encodeURIComponent(p)).join(',');
    const rows = await sb(`contacts?select=phone,status&phone=in.(${list})&status=in.(${statusList})`) || [];
    rows.forEach((row) => {
      const n = mbNormalizeDialPhone(row.phone);
      if (!n || found.has(n) || !allowed.includes(row.status)) return;
      found.set(n, row.status);
    });
  }
  return found;
}

async function deduplicateContacts(contacts, mode, campaignId) {
  const classified = mbClassifyLeadRows(contacts);
  const existing = await mbFindExistingPhones(classified.accepted.map((c) => c.phone), mode, campaignId);
  const filtered = classified.accepted.filter((c) => !existing.has(c.phone));
  return { filtered, dupCount: contacts.length - filtered.length, existingPhones: existing };
}

let _personTimer = 0;
let _personSeq = 0;
let _personWait = false;

function mbPersonSay(key, fallback) {
  const msg = typeof t === 'function' ? t(key) : fallback;
  return msg && msg !== key ? msg : fallback;
}

function mbPersonOwnOnly() {
  return String(currentUser?.role || '') === 'agent';
}

function mbPersonFirmId() {
  const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
  if (/^[0-9a-f-]{36}$/i.test(String(fid || ''))) return String(fid);
  if (typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()) return '*';
  return '';
}

function mbPersonClose() {
  clearTimeout(_personTimer);
  _personWait = false;
  _personSeq += 1;
  const pop = document.getElementById('sb-person-pop');
  if (!pop) return;
  pop.hidden = true;
  pop.innerHTML = '';
  if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
}

function mbPersonPlace() {
  const input = document.getElementById('sb-nav-search');
  const pop = document.getElementById('sb-person-pop');
  const sb = document.getElementById('sidebar');
  if (!input || !pop || pop.hidden) return;
  if (sb?.classList.contains('collapsed') || input.offsetParent === null) {
    pop.hidden = true;
    return;
  }
  const r = input.getBoundingClientRect();
  const width = Math.max(160, Math.round(r.width));
  const left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - width - 8));
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.round(left)}px`;
  const height = pop.offsetHeight || 160;
  const above = r.top - 6 - height;
  pop.style.top = `${Math.round(above >= 8 ? above : r.bottom + 6)}px`;
}

function mbPersonPaint(html) {
  const pop = document.getElementById('sb-person-pop');
  if (!pop) return;
  pop.hidden = false;
  pop.innerHTML = html;
  mbPersonMarkFirst();
  mbPersonPlace();
  if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
}

function mbPersonBusy() {
  const live = typeof _callLineIsLive === 'function' && _callLineIsLive();
  const hopper = typeof _hopper !== 'undefined' && _hopper.some((r) => r && (r.phase === 'dialing' || r.phase === 'ringing'));
  return live
    || dialerStatus === 'on_call'
    || dialerStatus === 'calling'
    || dialerStatus === 'wrapping'
    || !!_outboundDialPending
    || !!_telnyxCall
    || !!_fakeCallActive
    || hopper;
}

function mbPersonSearchInput(raw) {
  clearTimeout(_personTimer);
  _personWait = false;
  const q = String(raw || '').trim();
  if (!q) {
    if (document.activeElement?.id === 'sb-nav-search') mbPersonRecent();
    else {
      const pop = document.getElementById('sb-person-pop');
      if (pop) { pop.hidden = true; pop.innerHTML = ''; }
      _personSeq += 1;
    }
    if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
    return;
  }
  if (q.length < 2) {
    const pop = document.getElementById('sb-person-pop');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
    _personSeq += 1;
    if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
    return;
  }
  if (mbPersonPageHit()) {
    document.querySelectorAll('#sb-person-pop .sb-person-row.is-on').forEach((row) => row.classList.remove('is-on'));
  }
  _personWait = true;
  _personTimer = setTimeout(() => { mbPersonRun(q); }, 280);
  if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
}

function mbPersonOutcomeLabel(key) {
  const raw = String(key || '');
  const k = raw === 'appointment_done' ? 'appointment' : raw;
  if (!k || k === 'pending' || k === 'new') return '';
  if (k === 'calling') return mbPersonSay('find.unfinal', 'Sonuçsuz');
  if (k === 'appointment') return mbPersonSay('camp.ops.appointment', 'Randevu');
  if (['no_answer', 'negative', 'callback', 'dnc', 'voicemail'].includes(k)) {
    return mbPersonSay(`camp.st.${k}`, k);
  }
  return '';
}

function mbPersonHtml(rows, mode) {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const title = mode === 'recent'
    ? mbPersonSay('find.recent', 'Son görüşülenler')
    : mbPersonSay('find.people', 'Kişiler');
  const note = `<div class="sb-person-note">${esc(mbPersonSay('find.hint', 'Aramaz. Sadece kişinin kartını açar.'))}</div>`;
  const open = esc(mbPersonSay('find.open', 'Aç'));
  const dotLabel = esc(mbPersonSay('find.unfinal', 'Sonuçsuz'));
  const fid = mbPersonFirmId();
  const html = rows.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—';
    const camp = r.campaigns?.name || (typeof campaigns !== 'undefined' ? (campaigns || []).find((c) => String(c.id) === String(r.campaign_id))?.name : '') || '';
    let firm = '';
    if (fid === '*' && typeof _allFirms !== 'undefined') {
      firm = (_allFirms || []).find((f) => String(f.id) === String(r.firm_id))?.name || '';
    }
    const meta = [firm, r.city, r.phone].filter(Boolean).join(' · ');
    const outcomeKey = r._outcome || (r.status === 'calling' ? '' : r.status);
    const outcome = mbPersonOutcomeLabel(outcomeKey);
    const openDot = r._open || r.status === 'calling';
    const campHtml = camp ? `<span class="sb-person-camp">${esc(camp)}</span>` : '';
    const outHtml = outcome ? `<span class="sb-person-out">${esc(outcome)}</span>` : '';
    const dot = openDot ? `<i class="sb-person-dot" title="${dotLabel}" aria-label="${dotLabel}"></i>` : '';
    return `<button type="button" class="sb-person-row" data-person-id="${esc(r.id)}"><span class="sb-person-name">${dot}${esc(name)}</span>${campHtml}${outHtml}<span class="sb-person-meta">${esc(meta)}</span><span class="sb-person-open">${open}</span></button>`;
  }).join('');
  return `<div class="sb-person-label">${esc(title)}</div>${html}${note}`;
}

function mbPersonPageHit() {
  const q = String(document.getElementById('sb-nav-search')?.value || '').trim();
  if (!q) return false;
  return [...document.querySelectorAll('#sidebar .sb-item')].some((btn) => {
    return btn.style.display !== 'none' && !btn.classList.contains('is-nav-miss');
  });
}

function mbPersonMarkFirst() {
  const pop = document.getElementById('sb-person-pop');
  if (!pop) return;
  const rows = [...pop.querySelectorAll('.sb-person-row')];
  rows.forEach((row) => row.classList.remove('is-on'));
  if (!mbPersonPageHit() && rows[0]) rows[0].classList.add('is-on');
}

async function mbPersonRecent() {
  const q = String(document.getElementById('sb-nav-search')?.value || '').trim();
  if (q) return;
  const seq = ++_personSeq;
  _personWait = true;
  const fid = mbPersonFirmId();
  if (!fid) {
    _personWait = false;
    mbPersonClose();
    return;
  }
  const own = mbPersonOwnOnly();
  const uid = String(currentUser?.id || '');
  let path = 'call_logs?select=contact_id,outcome,started_at,contacts(id,first_name,last_name,phone,city,firm_id,campaign_id,status,campaigns(name))&contact_id=not.is.null&order=started_at.desc&limit=30';
  if (own && /^[0-9a-f-]{36}$/i.test(uid)) path += `&agent_id=eq.${uid}`;
  if (fid !== '*') path += `&firm_id=eq.${fid}`;
  let logs = [];
  try {
    const got = await sb(path);
    logs = Array.isArray(got) ? got : [];
  } catch (e) {
    logs = [];
  }
  _personWait = false;
  if (seq !== _personSeq) return;
  if (String(document.getElementById('sb-nav-search')?.value || '').trim()) return;
  const rows = [];
  const seen = new Set();
  logs.forEach((log) => {
    const c = log?.contacts || {};
    const id = c.id || log.contact_id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      city: c.city,
      firm_id: c.firm_id,
      campaign_id: c.campaign_id,
      campaigns: c.campaigns,
      status: c.status,
      _outcome: log.outcome,
      _open: c.status === 'calling',
    });
  });
  if (!rows.length) {
    const pop = document.getElementById('sb-person-pop');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
    if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
    return;
  }
  mbPersonPaint(mbPersonHtml(rows.slice(0, 8), 'recent'));
}

async function mbPersonRun(raw) {
  const q = String(raw || '').trim();
  const inputNow = String(document.getElementById('sb-nav-search')?.value || '').trim();
  if (q.length < 2 || q !== inputNow) {
    _personWait = false;
    if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
    return;
  }
  const seq = ++_personSeq;
  const fid = mbPersonFirmId();
  const own = mbPersonOwnOnly();
  const uid = String(currentUser?.id || '');
  const clean = q.replace(/[%*,()\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!fid || clean.length < 2) {
    _personWait = false;
    mbPersonClose();
    return;
  }
  const star = `*${encodeURIComponent(clean)}*`;
  const parts = ['first_name', 'last_name', 'phone', 'phone2', 'city'].map((f) => `${f}.ilike.${star}`);
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 3 && digits !== clean) {
    const dstar = `*${encodeURIComponent(digits)}*`;
    parts.push(`phone.ilike.${dstar}`, `phone2.ilike.${dstar}`);
  }
  const firmQ = fid === '*' ? '' : `firm_id=eq.${fid}&`;
  const ownQ = own && /^[0-9a-f-]{36}$/i.test(uid)
    ? `call_logs.agent_id=eq.${uid}&`
    : '';
  const ownSel = ownQ ? ',call_logs!inner(agent_id)' : '';
  let rows = [];
  try {
    const got = await sb(`contacts?${firmQ}${ownQ}or=(${parts.join(',')})&select=id,first_name,last_name,phone,city,firm_id,campaign_id,status,campaigns(name)${ownSel}&limit=${ownQ ? 24 : 8}`);
    rows = Array.isArray(got) ? got : [];
  } catch (e) {
    rows = [];
  }
  const seenIds = new Set();
  rows = rows.filter((r) => {
    const id = String(r?.id || '');
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  }).slice(0, 8);
  _personWait = false;
  if (seq !== _personSeq) return;
  if (!rows.length) {
    const pop = document.getElementById('sb-person-pop');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
    if (typeof mbNavRefreshEmpty === 'function') mbNavRefreshEmpty();
    return;
  }
  mbPersonPaint(mbPersonHtml(rows, 'search'));
}

async function mbOpenPerson(id) {
  const pid = String(id || '');
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return;
  if (mbPersonBusy()) {
    toast(mbPersonSay('dial.preview_busy', 'Süren arama var. Önce onu bitir.'), 'err', 2400);
    return;
  }
  mbPersonClose();
  if (mbPersonOwnOnly()) {
    const seen = await sb(`call_logs?agent_id=eq.${currentUser.id}&contact_id=eq.${pid}&select=id&limit=1`).catch(() => []);
    if (!Array.isArray(seen) || !seen.length) {
      toast(mbPersonSay('find.own', 'Bu kişiyle görüşmen yok'), 'warn', 2200);
      return;
    }
  }
  let contact = null;
  try {
    const found = await sb(`contacts?id=eq.${pid}&select=*,queues(name,status)&limit=1`);
    contact = Array.isArray(found) ? found[0] : null;
  } catch (e) {
    contact = null;
  }
  if (!contact) return;
  if (mbPersonBusy()) {
    toast(mbPersonSay('dial.preview_busy', 'Süren arama var. Önce onu bitir.'), 'err', 2400);
    return;
  }
  window._mbDialerPreview = true;
  currentContact = contact;
  const onDialer = document.getElementById('page-dialer')?.classList.contains('active');
  if (!onDialer && typeof navigate === 'function') navigate('dialer');
  if (typeof showCustomerCard === 'function') showCustomerCard(contact);
  if (typeof switchContactTab === 'function') switchContactTab('info');
  if (typeof forceDialerPreCallBar === 'function') forceDialerPreCallBar();
  if (typeof mbClearNavSearch === 'function') mbClearNavSearch();
  toast(mbPersonSay('dial.wv_opened', 'Kişi kartı açıldı. Aramak için Ara’ya bas.'), 'ok', 2400);
}

document.addEventListener('click', (e) => {
  const pop = document.getElementById('sb-person-pop');
  const input = document.getElementById('sb-nav-search');
  if (!pop || pop.hidden) return;
  if (pop.contains(e.target) || input?.contains(e.target)) return;
  mbPersonClose();
});
document.getElementById('sb-person-pop')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-person-id]');
  if (!btn) return;
  e.preventDefault();
  mbOpenPerson(btn.getAttribute('data-person-id'));
});
document.getElementById('sb-person-pop')?.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('.sb-person-row');
  const pop = document.getElementById('sb-person-pop');
  if (!btn || !pop) return;
  pop.querySelectorAll('.sb-person-row').forEach((row) => row.classList.toggle('is-on', row === btn));
});
window.addEventListener('resize', () => { if (typeof mbPersonPlace === 'function') mbPersonPlace(); });
