// ─────────────────────────────────────────────
// Agent / QC — Maaşım (bordro + kademeler) ve Performansım (termin & aramalar)
// ─────────────────────────────────────────────

let _aspCharts = {};

function _aspApptBucket(durum) {
  if (typeof perfApptBucket === 'function') return perfApptBucket(durum);
  const k = typeof contactStatusToAppointmentResult === 'function'
    ? _normResultKey(contactStatusToAppointmentResult(String(durum || '')))
    : _normResultKey(String(durum || ''));
  if (k === 'basarili') return 'ok';
  if (k === 'beklemede') return 'pend';
  if (k === 'qc_bekleniyor') return 'qc';
  if (k === 'basarisiz' || k === 'iptal' || k === 'ulasilamadi') return 'fail';
  return 'other';
}

function _aspAccentHex() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (/^#[0-9a-fA-F]{6}$/i.test(v)) return v;
  } catch (e) {}
  return '#2563eb';
}

function _aspFmt(n) {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _aspNormTiers(arr) {
  return (arr || []).map((t) => ({
    min: Number(t.min || 0),
    max: Number(t.max || 999999),
    amount: Number(t.amount || 0),
    currency: (t.currency || 'EUR').toUpperCase(),
    calc_type: t.calc_type === 'per_appointment' ? 'per_appointment' : 'fixed',
  })).filter((t) => t.max >= t.min && t.amount >= 0)
    .sort((a, b) => a.min - b.min);
}

function _aspConvertCurrency(v, from, to, rate) {
  const n = Number(v || 0);
  const a = (from || '').toUpperCase();
  const b = (to || '').toUpperCase();
  if (a === b) return n;
  if (a === 'EUR' && b === 'TRY') return n * (rate || 1);
  if (a === 'TRY' && b === 'EUR') return n / (rate || 1);
  return n;
}

function _aspTierBonusPortion(success, t, ruleCurrency, targetCurrency, rate) {
  const min = Number(t.min || 0);
  const max = Number(t.max || 999999);
  if (success < min || success > max) return { portion: 0, countInTier: 0, active: false };
  const calcType = t.calc_type === 'per_appointment' ? 'per_appointment' : 'fixed';
  const ccy = (t.currency || ruleCurrency || 'EUR').toUpperCase();
  let oneUnit = Number(t.amount || 0);
  if (ccy !== targetCurrency) oneUnit = _aspConvertCurrency(oneUnit, ccy, targetCurrency, rate);
  if (calcType === 'per_appointment') {
    const countInTier = Math.max(0, Math.min(success, max) - min + 1);
    return { portion: oneUnit * countInTier, countInTier, active: true };
  }
  return { portion: oneUnit, countInTier: 0, active: true };
}

function _aspMonthBounds(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return { start: '', end: '' };
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

function _aspCallDur(l) {
  return Number(l.duration_sec ?? l.duration_seconds ?? 0) || 0;
}

function _aspIsApptOutcome(o) {
  return o === 'appointment' || o === 'appointment_done';
}

function aspDestroyCharts() {
  Object.keys(_aspCharts).forEach((k) => {
    try {
      _aspCharts[k].destroy();
    } catch (e) {}
    delete _aspCharts[k];
  });
}

function _aspDaysInMonth(ym) {
  const [y, mo] = String(ym || '').split('-').map(Number);
  if (!y || !mo) return [];
  const last = new Date(y, mo, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

async function _aspFetchAppointments(fid, uid, start, end, mode = 'termin') {
  if (!fid || !uid) return [];
  if (mode === 'created') {
    const q =
      `appointments?select=id,termin_tarih,created_at,durum,nachname,telefonnummer,plz,ortschaft,agent_notu,hausart,baujahr,qm,heizung&firm_id=eq.${fid}&agent_id=eq.${uid}&created_at=gte.${start}T00:00:00.000Z&created_at=lte.${end}T23:59:59.999Z&order=created_at.desc&limit=3000`;
    return (await sb(q).catch(() => [])) || [];
  }
  const base =
    `appointments?select=id,termin_tarih,created_at,durum,nachname,telefonnummer,plz,ortschaft,agent_notu,hausart,baujahr,qm,heizung&firm_id=eq.${fid}&agent_id=eq.${uid}&termin_tarih=gte.${start}T00:00:00&termin_tarih=lte.${end}T23:59:59&order=termin_tarih.asc&limit=3000`;
  return (await sb(base).catch(() => [])) || [];
}

async function _aspFetchCalls(fid, uid, start, end) {
  if (!fid || !uid) return [];
  const q =
    `call_logs?select=id,started_at,outcome,duration_sec,duration_seconds,phone,campaigns(name)&firm_id=eq.${fid}&agent_id=eq.${uid}&started_at=gte.${start}T00:00:00&started_at=lte.${end}T23:59:59&order=started_at.desc&limit=8000`;
  try {
    return (await sb(q)) || [];
  } catch (e) {
    const simple =
      `call_logs?select=id,started_at,outcome,duration_sec,duration_seconds,phone&firm_id=eq.${fid}&agent_id=eq.${uid}&started_at=gte.${start}T00:00:00&started_at=lte.${end}T23:59:59&order=started_at.desc&limit=8000`;
    return (await sb(simple).catch(() => [])) || [];
  }
}

function _aspRenderSalaryTierTable(success, tiers, rules) {
  const cur = String(rules?.currency || 'EUR').toUpperCase();
  const rate = Number(rules?.exchange_rate || 1);
  const norm = _aspNormTiers(tiers);
  if (!norm.length) {
    return `<p style="font-size:12px;color:var(--text-3);margin:0;">Baz maaş kademesi yok; tek tutar baz maaş uygulanıyor.</p>`;
  }
  const rows = norm.map((t) => {
    const active = success >= t.min && success <= t.max;
    const ccy = (t.currency || cur).toUpperCase();
    let amt = Number(t.amount || 0);
    if (ccy !== cur) amt = _aspConvertCurrency(amt, ccy, cur, rate);
    const rng = `${t.min}–${t.max === 999999 ? '∞' : t.max}`;
    return `<tr style="${active ? 'background:var(--accent-soft);' : ''}"><td class="td-mono">${_uiEsc(rng)}</td><td><strong>${_aspFmt(amt)} ${_uiEsc(cur)}</strong> net baz</td><td>${active ? '<span class="badge badge-green">Bu aralıktasınız</span>' : '—'}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="margin-top:8px;"><table style="font-size:12px;min-width:100%;"><thead><tr><th>Başarılı termin aralığı</th><th>Net baz maaş</th><th>Durum</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _aspRenderBonusTierTable(success, tiers, rules) {
  const cur = String(rules?.currency || 'EUR').toUpperCase();
  const rate = Number(rules?.exchange_rate || 1);
  const ruleCcy = cur;
  const norm = _aspNormTiers(tiers);
  if (!norm.length) {
    return `<p style="font-size:12px;color:var(--text-3);margin:0;">Prim kademesi tanımlı değil; prim yalnızca manuel veya başka kural ile oluşabilir.</p>`;
  }
  const rows = norm.map((t) => {
    const rng = `${t.min}–${t.max === 999999 ? '∞' : t.max}`;
    const tip = t.calc_type === 'per_appointment' ? 'Termin başına' : 'Sabit (kademeye girince)';
    const ccy = (t.currency || ruleCcy).toUpperCase();
    const showAmt = Number(t.amount || 0);
    const inPay = _aspConvertCurrency(showAmt, ccy, cur, rate);
    const disp = ccy !== cur
      ? `${_aspFmt(showAmt)} ${_uiEsc(ccy)} (~ ${_aspFmt(inPay)} ${_uiEsc(cur)})`
      : `${_aspFmt(showAmt)} ${_uiEsc(cur)}`;
    const { portion, countInTier, active } = _aspTierBonusPortion(success, t, ruleCcy, cur, rate);
    let buDonem = 'Bu aralıkta değilsiniz';
    if (active) {
      if (t.calc_type === 'per_appointment') {
        const unit = countInTier > 0 ? portion / countInTier : inPay;
        buDonem = `${countInTier} termin × ${_aspFmt(unit)} ${cur} = ${_aspFmt(portion)} ${cur}`;
      } else {
        buDonem = `Sabit prim: ${_aspFmt(portion)} ${cur}`;
      }
    }
    return `<tr style="${active ? 'background:var(--accent-soft);' : ''}"><td class="td-mono">${_uiEsc(rng)}</td><td>${disp}</td><td>${_uiEsc(tip)}</td><td>${_uiEsc(buDonem)}</td></tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="margin-top:8px;"><table style="font-size:12px;min-width:100%;"><thead><tr><th>Başarılı termin</th><th>Tutar</th><th>Hesap tipi</th><th>Bu ay sizin durumunuz</th></tr></thead><tbody>${rows}</tbody></table></div>
<p style="font-size:11px;color:var(--text-3);margin:10px 0 0;line-height:1.45;"><strong>Termin başına:</strong> Örneğin 21–25 aralığı ve 46 ${cur} ise, bu aralıktaki her başarılı termin için 46 ${cur} esas alınır (bu ay kaç başarınız bu aralığa düşüyorsa çarpılır). <strong>Sabit:</strong> Başarılı sayınız aralığa girince tek seferde gösterilen prim.</p>`;
}

function loadAgentSalaryDash(fid, ym, rules, payrollRow, bonusTiersRaw, salaryTiersRaw) {
  const host = document.getElementById('muh-agent-salary-wrap');
  if (!host) return;
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '')) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = '';
  const pr = payrollRow || {};
  const cur = String(rules?.currency || 'EUR').toUpperCase();
  const success = Number(pr.success || 0);
  const noTermin = !!pr.noTermin;

  const man = Number(pr.manualAdd || 0) - Number(pr.manualDeduct || 0);
  const manLbl = man >= 0 ? `+${_aspFmt(man)}` : _aspFmt(man);

  const noteNoTermin = noTermin
    ? `<div class="card" style="padding:12px;margin-bottom:12px;background:var(--bg-3);border:1px solid var(--border);font-size:13px;">Termin primi hesabı sizin için kapalı (sabit personel). Aşağıdaki kademe tabloları yalnızca firma politikasını gösterir.</div>`
    : '';

  host.innerHTML = `<div class="card" style="padding:16px;margin-bottom:14px;">
<div class="card-title" style="margin-bottom:4px;"><i class="ph ph-wallet"></i> Maaşım</div>
<div class="card-sub" style="margin-bottom:14px;">Dönem: <strong>${_uiEsc(ym)}</strong> · Özet tutarlar seçili ay bordrosuna göredir</div>
${noteNoTermin}
<div class="stats-grid" style="margin-bottom:14px;">
<div class="stat-card"><div class="stat-lbl">Baz maaş (${cur})</div><div class="stat-val">${_aspFmt(pr.baseSalary)}</div></div>
<div class="stat-card stat-green"><div class="stat-lbl">Prim (${cur})</div><div class="stat-val">${_aspFmt(pr.bonus)}</div></div>
<div class="stat-card"><div class="stat-lbl">Manuel (+/−)</div><div class="stat-val">${manLbl} ${cur}</div></div>
<div class="stat-card"><div class="stat-lbl">Geç kalma / izin kes.</div><div class="stat-val">${_aspFmt(Number(pr.latePenalty || 0) + Number(pr.leavePenalty || 0))} ${cur}</div></div>
<div class="stat-card stat-blue"><div class="stat-lbl">Hakediş (${cur})</div><div class="stat-val">${_aspFmt(pr.netPayable)}</div></div>
<div class="stat-card"><div class="stat-lbl">Ödenen / Kalan</div><div class="stat-val">${_aspFmt(pr.paidAmount)} / ${_aspFmt(pr.remaining)}</div></div>
<div class="stat-card"><div class="stat-lbl">Başarılı termin</div><div class="stat-val">${noTermin ? '—' : success}</div></div>
</div>
<div class="form-label" style="margin-bottom:6px;">Prim kademeleri (size uygulanan tarife)</div>
${_aspRenderBonusTierTable(noTermin ? 0 : success, bonusTiersRaw, rules)}
<div class="form-label" style="margin-top:16px;margin-bottom:6px;">Baz maaş — net hakediş kademeleri</div>
${_aspRenderSalaryTierTable(noTermin ? 0 : success, salaryTiersRaw, rules)}
</div>`;
  if (typeof applyLang === 'function') applyLang();
}

async function loadAgentSelfPerformanceDash(fid, ym, rules) {
  const host = document.getElementById('muh-agent-perf-wrap');
  if (!host) return;
  if (!['agent', 'qc', 'admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '')) {
    host.style.display = 'none';
    host.innerHTML = '';
    aspDestroyCharts();
    return;
  }
  host.style.display = '';
  const uid = currentUser.id;
  const { start, end } = _aspMonthBounds(ym);
  if (!start) return;

  const apptMode = window._aspApptMode === 'created' ? 'created' : 'termin';
  host.innerHTML = `<div class="card" style="padding:16px;margin-bottom:14px;">
<div class="card-title" style="margin-bottom:4px;"><i class="ph ph-chart-line-up"></i> Performansım</div>
<div class="card-sub" style="margin-bottom:10px;">Seçili ay: <strong id="asp-ym-label"></strong> · Termin ve çağrı özeti (maaş için menüden <strong>Maaşım</strong>)</div>
<div style="display:flex;flex-wrap:wrap;gap:12px 18px;margin-bottom:12px;font-size:12px;align-items:center;">
<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
<input type="radio" name="asp-appt-mode" value="termin" ${apptMode === 'termin' ? 'checked' : ''} onchange="window._aspApptMode='termin';loadPerformansimPage();">
<span data-tr="Bu ay termin tarihli" data-de="Termin im Monat">Bu ay termin tarihli</span>
</label>
<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
<input type="radio" name="asp-appt-mode" value="created" ${apptMode === 'created' ? 'checked' : ''} onchange="window._aspApptMode='created';loadPerformansimPage();">
<span data-tr="Bu ay kaydettiğim (oluşturma)" data-de="Diesen Monat erfasst">Bu ay kaydettiğim (oluşturma)</span>
</label>
</div>
<p style="font-size:11px;color:var(--text-3);margin:0 0 12px;line-height:1.4;" data-tr="Maaşta genelde «bu ay oluşturduğun» randevular sayılır; termin Nisan’da olsa bile Mayıs’ta kayıt açtıysanız Mayıs performansına düşer." data-de="Für die Abrechnung zählt oft das Erfassungsdatum; ein April-Termin kann in Mai erfasst sein.">Maaşta genelde «bu ay oluşturduğun» randevular sayılır; termin Nisan’da olsa bile Mayıs’ta kayıt açtıysanız Mayıs performansına düşer.</p>
<div id="asp-body" style="color:var(--text-3);font-size:13px;">Yükleniyor…</div>
</div>`;
  document.getElementById('asp-ym-label').textContent = ym;

  const [appts, calls] = await Promise.all([
    _aspFetchAppointments(fid, uid, start, end, apptMode),
    _aspFetchCalls(fid, uid, start, end),
  ]);

  const ok = appts.filter((a) => _aspApptBucket(a.durum) === 'ok').length;
  const pend = appts.filter((a) => _aspApptBucket(a.durum) === 'pend').length;
  const qcN = appts.filter((a) => _aspApptBucket(a.durum) === 'qc').length;
  const fail = appts.filter((a) => _aspApptBucket(a.durum) === 'fail').length;
  const tot = appts.length;
  const rate = tot > 0 ? Math.round((ok / tot) * 100) : 0;

  const cTot = calls.length;
  const cAp = calls.filter((c) => _aspIsApptOutcome(c.outcome)).length;
  const cAvg = cTot > 0 ? Math.round(calls.reduce((s, c) => s + _aspCallDur(c), 0) / cTot) : 0;
  const mm = Math.floor(cAvg / 60);
  const ss = String(cAvg % 60).padStart(2, '0');
  const conv = cTot > 0 ? Math.round((cAp / cTot) * 100) : 0;

  const dayKeys = _aspDaysInMonth(ym);
  const byDay = {};
  dayKeys.forEach((d) => { byDay[d] = { ok: 0, pend: 0, qc: 0, fail: 0, oth: 0 }; });
  appts.forEach((a) => {
    const raw = apptMode === 'created' ? a.created_at : a.termin_tarih;
    const d = String(raw || '').slice(0, 10);
    if (!byDay[d]) return;
    const b = _aspApptBucket(a.durum);
    if (b === 'ok') byDay[d].ok++;
    else if (b === 'pend') byDay[d].pend++;
    else if (b === 'qc') byDay[d].qc++;
    else if (b === 'fail') byDay[d].fail++;
    else byDay[d].oth++;
  });
  const lbl = dayKeys.map((k) => k.slice(8, 10));

  const body = document.getElementById('asp-body');
  body.innerHTML = `
<div class="stats-grid" style="margin-bottom:14px;">
<div class="stat-card"><div class="stat-lbl">${apptMode === 'created' ? 'Randevu (oluşturma ayı)' : 'Termin (tarih ayı)'}</div><div class="stat-val">${tot}</div><div class="stat-meta">${ok} başarılı · oran %${rate}</div></div>
<div class="stat-card stat-green"><div class="stat-lbl">Aramalar</div><div class="stat-val">${cTot}</div></div>
<div class="stat-card"><div class="stat-lbl">Arama → Termin</div><div class="stat-val">${cAp}</div></div>
<div class="stat-card"><div class="stat-lbl">Dönüşüm</div><div class="stat-val">${conv}%</div></div>
<div class="stat-card"><div class="stat-lbl">Ort. görüşme</div><div class="stat-val">${mm}:${ss}</div></div>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px;">
<div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg-2);">
<div style="font-weight:800;font-size:13px;margin-bottom:8px;">Termin dağılımı</div>
<div style="height:200px;position:relative;"><canvas id="asp-chart-pie"></canvas></div>
</div>
<div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg-2);">
<div style="font-weight:800;font-size:13px;margin-bottom:8px;">Başarı oranı</div>
<div style="height:200px;position:relative;"><canvas id="asp-chart-don"></canvas></div>
<div style="text-align:center;font-weight:900;font-size:18px;margin-top:-120px;position:relative;z-index:1;pointer-events:none;">${rate}%</div>
</div>
</div>
<div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--bg-2);margin-bottom:14px;">
<div style="font-weight:800;font-size:13px;margin-bottom:8px;">${apptMode === 'created' ? 'Günlük (oluşturma tarihi)' : 'Günlük terminler'}</div>
<div style="height:240px;position:relative;"><canvas id="asp-chart-day"></canvas></div>
</div>
<div style="margin-top:14px;">
<div class="form-label" style="margin-bottom:6px;">Son terminler</div>
<div class="tbl-wrap" style="max-height:260px;">
<table style="font-size:12px;min-width:520px;"><thead><tr><th>${apptMode === 'created' ? 'Kayıt · termin' : 'Tarih'}</th><th>Müşteri</th><th>Durum</th><th>PLZ</th></tr></thead>
<tbody id="asp-tbody-ap"></tbody>
</table>
</div>
</div>
<div style="margin-top:14px;">
<div class="form-label" style="margin-bottom:6px;">Son aramalar</div>
<div class="tbl-wrap" style="max-height:220px;">
<table style="font-size:12px;min-width:520px;"><thead><tr><th>Tarih</th><th>Numara</th><th>Kampanya</th><th>Sonuç</th><th>Süre</th></tr></thead>
<tbody id="asp-tbody-cl"></tbody>
</table>
</div>
</div>`;

  const loc = currentLang === 'de' ? 'de-DE' : 'tr-TR';
  const om = { appointment: 'Termin', appointment_done: 'Termin', negative: 'Olumsuz', callback: 'Geri Ara', voicemail: 'VM', no_answer: 'Yok', dnc: 'DNC' };

  const tbAp = document.getElementById('asp-tbody-ap');
  if (tbAp) {
    const sorted = [...appts]
      .sort((a, b) => {
        const ka = apptMode === 'created' ? a.created_at : a.termin_tarih;
        const kb = apptMode === 'created' ? b.created_at : b.termin_tarih;
        return String(kb || '').localeCompare(String(ka || ''));
      })
      .slice(0, 25);
    tbAp.innerHTML = sorted.length ? sorted.map((a) => {
      const d = new Date(a.termin_tarih);
      const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const dc = a.created_at ? new Date(a.created_at) : null;
      const dcs =
        dc && !isNaN(dc.getTime())
          ? dc.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '—';
      const dateCell =
        apptMode === 'created'
          ? `<div class="td-mono">${dcs}</div><div style="font-size:10px;color:var(--text-3);margin-top:2px;">Termin: ${_uiEsc(ds)}</div>`
          : `<span class="td-mono">${ds}</span>`;
      const st = _aspApptBucket(a.durum);
      const badge = st === 'ok' ? 'badge-green' : st === 'pend' ? 'badge-yellow' : st === 'qc' ? '' : 'badge-red';
      const stl = st === 'qc' ? 'background:var(--accent-soft);color:var(--accent);' : '';
      return `<tr><td>${dateCell}</td><td>${_uiEsc(a.nachname || '—')}</td><td><span class="badge ${badge}" style="${stl}">${_uiEsc(String(a.durum || '—'))}</span></td><td>${_uiEsc(a.plz || '—')}</td></tr>`;
    }).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;">—</td></tr>`;
  }

  const tbCl = document.getElementById('asp-tbody-cl');
  if (tbCl) {
    tbCl.innerHTML = calls.length ? calls.slice(0, 25).map((c) => {
      const d = new Date(c.started_at);
      const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const dur = _aspCallDur(c);
      const dm = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
      return `<tr><td class="td-mono">${ds}</td><td class="td-mono">${_uiEsc(c.phone || '—')}</td><td>${_uiEsc(c.campaigns?.name || '—')}</td><td>${_uiEsc(om[c.outcome] || c.outcome || '—')}</td><td class="td-mono">${dm}</td></tr>`;
    }).join('') : `<tr><td colspan="5" style="text-align:center;padding:16px;">—</td></tr>`;
  }

  aspDestroyCharts();
  const ChartCtor = window.Chart;
  if (!ChartCtor) return;

  const pieEl = document.getElementById('asp-chart-pie');
  if (pieEl) {
    _aspCharts.pie = new ChartCtor(pieEl.getContext('2d'), {
      type: 'pie',
      data: {
        labels: ['Başarılı', 'Beklemede', 'QC', 'Diğer', 'Başarısız'],
        datasets: [{ data: [ok, pend, qcN, Math.max(0, tot - ok - pend - qcN - fail), fail], backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#94a3b8', '#ef4444'], borderWidth: 2, borderColor: '#fff' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } },
    });
  }

  const donEl = document.getElementById('asp-chart-don');
  if (donEl) {
    _aspCharts.don = new ChartCtor(donEl.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Başarılı', 'Kalan'],
        datasets: [{ data: [ok, Math.max(0, tot - ok)], backgroundColor: ['#10b981', '#e5e7eb'], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: true } } },
    });
  }

  const dayEl = document.getElementById('asp-chart-day');
  if (dayEl) {
    _aspCharts.day = new ChartCtor(dayEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: lbl,
        datasets: [
          { label: 'OK', data: dayKeys.map((k) => byDay[k].ok), backgroundColor: '#10b981', stack: 's', borderRadius: 3 },
          { label: 'Bekl.', data: dayKeys.map((k) => byDay[k].pend), backgroundColor: '#f59e0b', stack: 's', borderRadius: 3 },
          { label: 'QC', data: dayKeys.map((k) => byDay[k].qc), backgroundColor: '#3b82f6', stack: 's', borderRadius: 3 },
          { label: 'Kötü', data: dayKeys.map((k) => byDay[k].fail), backgroundColor: '#ef4444', stack: 's', borderRadius: 3 },
          { label: 'Diğ.', data: dayKeys.map((k) => byDay[k].oth), backgroundColor: '#cbd5e1', stack: 's', borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, font: { size: 9 } } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: { legend: { position: 'top', labels: { boxWidth: 8, font: { size: 10 } } } },
      },
    });
  }

  if (typeof applyLang === 'function') applyLang();
}
