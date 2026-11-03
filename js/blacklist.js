// Kara liste (firm_dnc) + numara spam sağlığı + GDPR silme yardımcıları

let _blTab = 'dnc';
let _blRows = [];
let _blDidHealth = null;
let _firmDncCache = { firmId: '', at: 0, phones: new Set() };

function blT(key, fb) {
  const msg = typeof t === 'function' ? t(key) : fb;
  return !msg || msg === key ? (fb || key) : msg;
}

function blEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function blFirmId() {
  const sel = document.getElementById('bl-firm-select')?.value;
  if (sel) return sel;
  if (typeof getActiveFirmId === 'function' && getActiveFirmId()) return getActiveFirmId();
  return currentUser?.firm_id || '';
}

function blNormPhone(raw) {
  if (typeof mbNormalizeDialPhone === 'function') return mbNormalizeDialPhone(raw);
  return String(raw || '').replace(/[\s()\/.-]/g, '');
}

async function mbLoadFirmDncSet(firmId, force) {
  const fid = String(firmId || '');
  if (!fid) return new Set();
  const now = Date.now();
  if (!force && _firmDncCache.firmId === fid && now - _firmDncCache.at < 60000) {
    return _firmDncCache.phones;
  }
  const phones = new Set();
  try {
    let offset = 0;
    while (offset < 20000) {
      const rows = await sb(
        `firm_dnc?firm_id=eq.${fid}&select=phone&order=created_at.desc&limit=1000&offset=${offset}`
      ).catch(() => []);
      if (!rows?.length) break;
      rows.forEach((r) => {
        const p = blNormPhone(r.phone);
        if (p) phones.add(p);
      });
      if (rows.length < 1000) break;
      offset += 1000;
    }
  } catch (e) { /* empty */ }
  _firmDncCache = { firmId: fid, at: now, phones };
  return phones;
}

async function mbIsFirmDnc(phone, firmId) {
  const p = blNormPhone(phone);
  const fid = String(firmId || currentUser?.firm_id || '');
  if (!p || !fid) return false;
  const set = await mbLoadFirmDncSet(fid);
  return set.has(p);
}

async function mbAddFirmDnc(phone, opts = {}) {
  const p = blNormPhone(phone);
  const fid = String(opts.firmId || currentUser?.firm_id || '');
  if (!p || !fid || p.length < 8) return null;
  const body = {
    firm_id: fid,
    phone: p,
    note: String(opts.note || '').slice(0, 500),
    source: ['manual', 'import', 'outcome', 'gdpr'].includes(opts.source) ? opts.source : 'manual',
    created_by: currentUser?.id || null,
  };
  try {
    const rows = await sb('firm_dnc?on_conflict=firm_id,phone', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify(body),
    });
    if (_firmDncCache.firmId === fid) _firmDncCache.phones.add(p);
    else _firmDncCache = { firmId: '', at: 0, phones: new Set() };
    return Array.isArray(rows) ? rows[0] : (rows || { phone: p, firm_id: fid });
  } catch (e) {
    try {
      const existing = await sb(
        `firm_dnc?firm_id=eq.${fid}&phone=eq.${encodeURIComponent(p)}&select=id&limit=1`
      ).catch(() => []);
      if (existing?.[0]?.id) {
        await sb(`firm_dnc?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ note: body.note, source: body.source }),
        });
        if (_firmDncCache.firmId === fid) _firmDncCache.phones.add(p);
        return { id: existing[0].id, phone: p, firm_id: fid };
      }
      console.warn('firm_dnc insert', e);
      return null;
    } catch (e2) {
      console.warn('firm_dnc upsert', e2);
      return null;
    }
  }
}

async function mbRemoveFirmDnc(id, firmId) {
  if (!id) return;
  await sb(`firm_dnc?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (_firmDncCache.firmId === String(firmId || '')) {
    _firmDncCache.at = 0;
  }
}

async function mbGdprEraseContact(contactId) {
  if (!contactId) throw new Error('no id');
  const rows = await sb(`contacts?id=eq.${contactId}&select=*`);
  const c = rows?.[0];
  if (!c) throw new Error('not found');
  const phone = blNormPhone(c.phone);
  const firmId = c.firm_id || currentUser?.firm_id;
  if (phone && firmId) {
    await mbAddFirmDnc(phone, {
      firmId,
      source: 'gdpr',
      note: blT('bl.gdpr.dnc_note', 'GDPR silme'),
    });
    if (c.phone2) {
      await mbAddFirmDnc(c.phone2, {
        firmId,
        source: 'gdpr',
        note: blT('bl.gdpr.dnc_note', 'GDPR silme'),
      });
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  await sb(`contacts?id=eq.${contactId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      first_name: 'GDPR',
      last_name: 'Silindi',
      phone: phone ? `deleted-${stamp}-${String(contactId).slice(0, 8)}` : c.phone,
      phone2: null,
      address: null,
      city: null,
      plz: null,
      notes: null,
      status: 'dnc',
      locked_by: null,
      extra: {
        ...(c.extra && typeof c.extra === 'object' ? c.extra : {}),
        gdpr_erased_at: new Date().toISOString(),
        gdpr_erased_by: currentUser?.id || null,
        consent_at: null,
        consent_source: null,
      },
    }),
  });
  return true;
}

async function mbSaveContactConsent(contactId, consentAt, consentSource) {
  const rows = await sb(`contacts?id=eq.${contactId}&select=extra`);
  const extra = { ...(rows?.[0]?.extra && typeof rows[0].extra === 'object' ? rows[0].extra : {}) };
  extra.consent_at = consentAt || null;
  extra.consent_source = consentSource || null;
  await sb(`contacts?id=eq.${contactId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ extra }),
  });
  return extra;
}

function mbDidHealthDefaults(raw) {
  const h = raw && typeof raw === 'object' ? raw : {};
  return {
    auto_rotate: h.auto_rotate !== false,
    min_calls: Math.max(5, Number(h.min_calls) || 30),
    min_answer_rate: Math.min(1, Math.max(0, Number(h.min_answer_rate) || 0.08)),
    window_days: Math.max(1, Math.min(60, Number(h.window_days) || 7)),
    numbers: h.numbers && typeof h.numbers === 'object' ? { ...h.numbers } : {},
  };
}

function mbDidNumState(health, did) {
  const n = mbNormDid ? mbNormDid(did) : blNormPhone(did);
  const row = health?.numbers?.[n] || {};
  return {
    spam: !!row.spam,
    paused: !!row.paused,
  };
}

function mbDidIsUnhealthy(stats, health, did) {
  const n = (typeof mbNormDid === 'function' ? mbNormDid(did) : blNormPhone(did));
  const st = mbDidNumState(health, n);
  if (st.spam || st.paused) return true;
  const s = stats?.[n];
  if (!s || s.total < (health?.min_calls || 30)) return false;
  return s.answerRate < (health?.min_answer_rate || 0.08);
}

async function mbComputeDidStats(firmId, windowDays) {
  const fid = String(firmId || '');
  const days = Math.max(1, Number(windowDays) || 7);
  if (!fid) return {};
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const map = {};
  let offset = 0;
  while (offset < 8000) {
    const rows = await sb(
      `call_logs?firm_id=eq.${fid}&started_at=gte.${encodeURIComponent(since)}&select=caller_number,answered_at,duration_sec,outcome&order=started_at.desc&limit=1000&offset=${offset}`
    ).catch(() => []);
    if (!rows?.length) break;
    rows.forEach((r) => {
      const did = typeof mbNormDid === 'function' ? mbNormDid(r.caller_number) : blNormPhone(r.caller_number);
      if (!did) return;
      if (!map[did]) map[did] = { total: 0, answered: 0 };
      map[did].total += 1;
      const ans = !!(r.answered_at || (Number(r.duration_sec) || 0) > 0);
      const out = String(r.outcome || '');
      if (ans && out !== 'no_answer' && out !== 'voicemail') map[did].answered += 1;
      else if (ans) map[did].answered += 1;
    });
    if (rows.length < 1000) break;
    offset += 1000;
  }
  Object.keys(map).forEach((k) => {
    const row = map[k];
    row.answerRate = row.total ? row.answered / row.total : 0;
  });
  return map;
}

async function mbEnsureHealthyDid(campaign) {
  if (!campaign?.id) return campaign?.telnyx_did || '';
  const firmId = campaign.firm_id || currentUser?.firm_id;
  if (!firmId) return campaign.telnyx_did || '';
  let settings = null;
  try {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
    settings = firms?.[0]?.settings || {};
  } catch (e) {
    return campaign.telnyx_did || '';
  }
  const health = mbDidHealthDefaults(settings.did_health);
  if (!health.auto_rotate) return campaign.telnyx_did || '';
  let numbers = [];
  if (typeof mbLineNumbersFromSettings === 'function') {
    numbers = mbLineNumbersFromSettings(settings).slice();
  } else if (Array.isArray(settings.line_numbers)) {
    numbers = settings.line_numbers
      .map((x) => (typeof mbNormDid === 'function' ? mbNormDid(x) : blNormPhone(x)))
      .filter(Boolean);
  }
  if (!numbers.length) {
    const camps = await sb(`campaigns?firm_id=eq.${firmId}&select=telnyx_did`).catch(() => []) || [];
    camps.forEach((c) => {
      const n = typeof mbNormDid === 'function' ? mbNormDid(c.telnyx_did) : blNormPhone(c.telnyx_did);
      if (n && !numbers.includes(n)) numbers.push(n);
    });
  }
  const current = typeof mbNormDid === 'function' ? mbNormDid(campaign.telnyx_did) : blNormPhone(campaign.telnyx_did);
  if (current && !numbers.includes(current)) numbers.unshift(current);

  if (numbers.length < 2) return current || '';

  const stats = await mbComputeDidStats(firmId, health.window_days);
  if (!mbDidIsUnhealthy(stats, health, current)) return current || '';

  const healthy = numbers.find((n) => n !== current && !mbDidIsUnhealthy(stats, health, n));
  if (!healthy) return current || '';

  try {
    await sb(`campaigns?id=eq.${campaign.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ telnyx_did: healthy }),
    });
    campaign.telnyx_did = healthy;
    if (typeof toast === 'function') {
      toast(blT('bl.spam.rotated', 'Düşük cevap oranı — arayan numara değiştirildi'), 'warn', 3200);
    }
  } catch (e) {
    console.warn('did rotate', e);
  }
  return healthy;
}

async function loadBlacklistPage() {
  const page = document.getElementById('page-blacklist');
  if (!page) return;
  await blFillFirmSelect();
  blSetTab(_blTab || 'dnc');
}

async function blFillFirmSelect() {
  const sel = document.getElementById('bl-firm-select');
  if (!sel) return;
  const isSuper = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const wrap = document.getElementById('bl-firm-wrap');
  if (wrap) wrap.style.display = isSuper ? '' : 'none';
  if (!isSuper) {
    sel.innerHTML = `<option value="${blEsc(currentUser?.firm_id || '')}">—</option>`;
    sel.value = currentUser?.firm_id || '';
    return;
  }
  const firms = await sb('firms?select=id,name&order=name.asc').catch(() => []) || [];
  const cur = sel.value || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id || '';
  sel.innerHTML = firms.map((f) => `<option value="${blEsc(f.id)}">${blEsc(f.name || f.id)}</option>`).join('');
  if (cur && firms.some((f) => f.id === cur)) sel.value = cur;
}

function blSetTab(tab) {
  _blTab = tab === 'spam' ? 'spam' : 'dnc';
  const dncBtn = document.getElementById('bl-tab-dnc');
  const spamBtn = document.getElementById('bl-tab-spam');
  const dncPane = document.getElementById('bl-pane-dnc');
  const spamPane = document.getElementById('bl-pane-spam');
  const on = (el, yes) => {
    if (!el) return;
    el.style.background = yes ? 'var(--accent)' : 'transparent';
    el.style.color = yes ? '#fff' : 'var(--text-2)';
  };
  on(dncBtn, _blTab === 'dnc');
  on(spamBtn, _blTab === 'spam');
  if (dncPane) dncPane.style.display = _blTab === 'dnc' ? '' : 'none';
  if (spamPane) spamPane.style.display = _blTab === 'spam' ? '' : 'none';
  if (_blTab === 'dnc') void blLoadDnc();
  else void blLoadSpam();
}

async function blLoadDnc() {
  const tbody = document.getElementById('bl-dnc-tbody');
  const countEl = document.getElementById('bl-dnc-count');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;">${blEsc(blT('ui.loading', 'Yükleniyor…'))}</td></tr>`;
  const fid = blFirmId();
  if (!fid) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;">${blEsc(blT('bl.need_firm', 'Firma seçin'))}</td></tr>`;
    return;
  }
  const q = (document.getElementById('bl-dnc-search')?.value || '').trim().toLowerCase();
  let rows = await sb(
    `firm_dnc?firm_id=eq.${fid}&select=id,phone,note,source,created_at,created_by,users:created_by(name)&order=created_at.desc&limit=2000`
  ).catch(() => []);
  if (!Array.isArray(rows)) rows = [];
  _blRows = rows;
  await mbLoadFirmDncSet(fid, true);
  let list = rows;
  if (q) {
    list = rows.filter((r) =>
      String(r.phone || '').toLowerCase().includes(q)
      || String(r.note || '').toLowerCase().includes(q)
      || String(r.source || '').toLowerCase().includes(q)
    );
  }
  if (countEl) countEl.textContent = String(list.length);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;">${blEsc(blT('bl.dnc.empty', 'Kara listede kayıt yok'))}</td></tr>`;
    return;
  }
  const srcLabel = {
    manual: blT('bl.src.manual', 'Elle'),
    import: blT('bl.src.import', 'İçe aktarım'),
    outcome: blT('bl.src.outcome', 'Sonuç'),
    gdpr: blT('bl.src.gdpr', 'GDPR'),
  };
  tbody.innerHTML = list.map((r) => {
    const when = r.created_at
      ? new Date(r.created_at).toLocaleString(typeof mbLocale === 'function' ? mbLocale() : 'tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : '—';
    const who = r.users?.name || '—';
    return `<tr>
<td class="mono" style="font-size:12px;">${blEsc(r.phone)}</td>
<td style="font-size:12px;">${blEsc(r.note || '—')}</td>
<td style="font-size:11px;">${blEsc(srcLabel[r.source] || r.source || '—')}</td>
<td style="font-size:11px;color:var(--text-3);">${blEsc(when)} · ${blEsc(who)}</td>
<td style="white-space:nowrap;">
<button type="button" class="btn btn-ghost btn-xs" onclick="blDeleteDnc('${blEsc(r.id)}')">${blEsc(blT('bl.remove', 'Çıkar'))}</button>
</td>
</tr>`;
  }).join('');
}

async function blAddDncManual() {
  const phone = blNormPhone(document.getElementById('bl-dnc-phone')?.value);
  const note = String(document.getElementById('bl-dnc-note')?.value || '').trim();
  const fid = blFirmId();
  if (!fid) { toast(blT('bl.need_firm', 'Firma seçin'), 'warn'); return; }
  if (!phone || phone.length < 8) { toast(blT('bl.bad_phone', 'Geçerli numara girin'), 'warn'); return; }
  await mbAddFirmDnc(phone, { firmId: fid, note, source: 'manual' });
  try {
    await sb(`contacts?firm_id=eq.${fid}&or=(phone.eq.${encodeURIComponent(phone)},phone2.eq.${encodeURIComponent(phone)})`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'dnc', locked_by: null }),
    });
  } catch (e) { /* optional */ }
  if (document.getElementById('bl-dnc-phone')) document.getElementById('bl-dnc-phone').value = '';
  if (document.getElementById('bl-dnc-note')) document.getElementById('bl-dnc-note').value = '';
  toast(blT('bl.dnc.added', 'Kara listeye eklendi'), 'ok');
  await blLoadDnc();
}

async function blDeleteDnc(id) {
  if (!id) return;
  try {
    await mbRemoveFirmDnc(id, blFirmId());
    toast(blT('bl.dnc.removed', 'Listeden çıkarıldı'), 'ok');
    await blLoadDnc();
  } catch (e) {
    toast(blT('bl.err', 'İşlem başarısız') + ': ' + (e.message || e), 'err');
  }
}

function blExportDncCsv() {
  const rows = _blRows || [];
  const lines = ['phone,note,source,created_at'];
  rows.forEach((r) => {
    const cells = [r.phone, r.note, r.source, r.created_at].map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kara-liste-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function blImportDncCsv(file) {
  if (!file) return;
  const fid = blFirmId();
  if (!fid) { toast(blT('bl.need_firm', 'Firma seçin'), 'warn'); return; }
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  let start = 0;
  if (/phone|numara|telefon/i.test(lines[0])) start = 1;
  let ok = 0;
  let skip = 0;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    let phone = '';
    let note = '';
    if (raw.includes(',')) {
      const parts = raw.split(',');
      phone = blNormPhone(parts[0]);
      note = parts.slice(1).join(',').replace(/^"|"$/g, '').trim();
    } else {
      phone = blNormPhone(raw);
    }
    if (!phone || phone.length < 8) { skip += 1; continue; }
    const row = await mbAddFirmDnc(phone, { firmId: fid, note, source: 'import' });
    if (row) ok += 1;
    else skip += 1;
  }
  try {
    const phones = [...(await mbLoadFirmDncSet(fid, true))];
    for (let i = 0; i < phones.length; i += 40) {
      const chunk = phones.slice(i, i + 40).map((p) => encodeURIComponent(p)).join(',');
      await sb(`contacts?firm_id=eq.${fid}&phone=in.(${chunk})`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ status: 'dnc', locked_by: null }),
      }).catch(() => null);
    }
  } catch (e) { /* best effort */ }
  toast(blT('bl.import.done', '{ok} eklendi, {skip} atlandı').replace('{ok}', ok).replace('{skip}', skip), 'ok');
  await blLoadDnc();
}

function blOnImportFile(input) {
  const file = input?.files?.[0];
  if (file) void blImportDncCsv(file);
  if (input) input.value = '';
}

async function blLoadSpam() {
  const box = document.getElementById('bl-spam-body');
  if (!box) return;
  box.innerHTML = `<div style="color:var(--text-3);padding:16px;text-align:center;">${blEsc(blT('ui.loading', 'Yükleniyor…'))}</div>`;
  const fid = blFirmId();
  if (!fid) {
    box.innerHTML = `<div style="color:var(--text-3);padding:16px;text-align:center;">${blEsc(blT('bl.need_firm', 'Firma seçin'))}</div>`;
    return;
  }
  const firms = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  const settings = firms?.[0]?.settings || {};
  const health = mbDidHealthDefaults(settings.did_health);
  _blDidHealth = health;

  let numbers = typeof mbLineNumbersFromSettings === 'function'
    ? mbLineNumbersFromSettings(settings).slice()
    : (Array.isArray(settings.line_numbers) ? settings.line_numbers.map((n) => (typeof mbNormDid === 'function' ? mbNormDid(n) : blNormPhone(n))).filter(Boolean) : []);
  if (!numbers.length) {
    const camps = await sb(`campaigns?firm_id=eq.${fid}&select=telnyx_did`).catch(() => []) || [];
    camps.forEach((c) => {
      const n = typeof mbNormDid === 'function' ? mbNormDid(c.telnyx_did) : blNormPhone(c.telnyx_did);
      if (n && !numbers.includes(n)) numbers.push(n);
    });
  }
  const stats = await mbComputeDidStats(fid, health.window_days);

  document.getElementById('bl-spam-auto').checked = health.auto_rotate;
  document.getElementById('bl-spam-min-calls').value = health.min_calls;
  document.getElementById('bl-spam-min-rate').value = Math.round(health.min_answer_rate * 100);
  document.getElementById('bl-spam-days').value = health.window_days;

  if (!numbers.length) {
    box.innerHTML = `<div style="color:var(--text-3);padding:16px;text-align:center;">${blEsc(blT('bl.spam.no_nums', 'Firma numarası yok. Hat ayarlarından ekleyin.'))}</div>`;
    return;
  }

  box.innerHTML = numbers.map((n) => {
    const s = stats[n] || { total: 0, answered: 0, answerRate: 0 };
    const st = mbDidNumState(health, n);
    const bad = mbDidIsUnhealthy(stats, health, n);
    const pct = s.total ? Math.round(s.answerRate * 1000) / 10 : 0;
    const color = bad ? 'var(--red)' : (pct >= 12 ? 'var(--green)' : 'var(--yellow)');
    return `<div class="bl-spam-row" style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-3);margin-bottom:8px;">
<div>
<div class="mono" style="font-size:13px;font-weight:700;">${blEsc(n)}</div>
<div style="font-size:12px;margin-top:4px;">
<span style="color:${color};font-weight:700;">${pct}%</span>
<span style="color:var(--text-3);"> · ${s.answered}/${s.total} ${blEsc(blT('bl.spam.answered', 'cevap'))}</span>
${bad ? `<span style="margin-left:8px;color:var(--red);font-weight:700;">${blEsc(blT('bl.spam.bad', 'Sağlıksız'))}</span>` : ''}
</div>
</div>
<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
<input type="checkbox" data-did="${blEsc(n)}" data-flag="spam" ${st.spam ? 'checked' : ''} onchange="blToggleDidFlag(this)">
${blEsc(blT('bl.spam.flag', 'Spam işaretli'))}
</label>
<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
<input type="checkbox" data-did="${blEsc(n)}" data-flag="paused" ${st.paused ? 'checked' : ''} onchange="blToggleDidFlag(this)">
${blEsc(blT('bl.spam.pause', 'Durdur'))}
</label>
</div>
</div>`;
  }).join('');
}

function blToggleDidFlag(el) {
  if (!_blDidHealth) _blDidHealth = mbDidHealthDefaults({});
  const did = el.getAttribute('data-did');
  const flag = el.getAttribute('data-flag');
  if (!did || !flag) return;
  if (!_blDidHealth.numbers[did]) _blDidHealth.numbers[did] = {};
  _blDidHealth.numbers[did][flag] = !!el.checked;
}

async function blSaveSpamSettings() {
  const fid = blFirmId();
  if (!fid) { toast(blT('bl.need_firm', 'Firma seçin'), 'warn'); return; }
  const health = mbDidHealthDefaults(_blDidHealth || {});
  health.auto_rotate = !!document.getElementById('bl-spam-auto')?.checked;
  health.min_calls = Math.max(5, Number(document.getElementById('bl-spam-min-calls')?.value) || 30);
  health.min_answer_rate = Math.min(1, Math.max(0, (Number(document.getElementById('bl-spam-min-rate')?.value) || 8) / 100));
  health.window_days = Math.max(1, Math.min(60, Number(document.getElementById('bl-spam-days')?.value) || 7));
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=id,settings`);
    const firm = firms?.[0];
    if (!firm) throw new Error('firm');
    const settings = { ...(firm.settings || {}), did_health: health };
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    _blDidHealth = health;
    toast(blT('bl.spam.saved', 'Spam sağlığı kaydedildi'), 'ok');
    await blLoadSpam();
  } catch (e) {
    toast(blT('bl.err', 'İşlem başarısız') + ': ' + (e.message || e), 'err');
  }
}

async function blGdprByPhone() {
  const phone = blNormPhone(document.getElementById('bl-gdpr-phone')?.value);
  const fid = blFirmId();
  if (!fid || !phone) { toast(blT('bl.bad_phone', 'Geçerli numara girin'), 'warn'); return; }
  if (!confirm(blT('bl.gdpr.confirm', 'Bu numaradaki kişisel veriler silinsin mi? Geri alınamaz.'))) return;
  const contacts = await sb(
    `contacts?firm_id=eq.${fid}&or=(phone.eq.${encodeURIComponent(phone)},phone2.eq.${encodeURIComponent(phone)})&select=id&limit=50`
  ).catch(() => []) || [];
  let n = 0;
  for (const c of contacts) {
    try {
      await mbGdprEraseContact(c.id);
      n += 1;
    } catch (e) { console.warn(e); }
  }
  if (!contacts.length) {
    await mbAddFirmDnc(phone, { firmId: fid, source: 'gdpr', note: blT('bl.gdpr.dnc_note', 'GDPR silme') });
  }
  toast(blT('bl.gdpr.done', '{n} kişi anonimleştirildi').replace('{n}', String(n || 1)), 'ok');
  if (document.getElementById('bl-gdpr-phone')) document.getElementById('bl-gdpr-phone').value = '';
  await blLoadDnc();
}
