// ─────────────────────────────────────────────
// Agent / QC — kendi performans & arama özeti (Muhasebe > Personel)
// Referans HTML ile uyumlu özet; Chart.js, firma payroll verisi
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

async function _aspFetchAppointments(fid, uid, start, end) {
  if (!fid || !uid) return [];
  const base =
    `appointments?select=id,termin_tarih,durum,nachname,telefonnummer,plz,ortschaft,agent_notu,hausart,baujahr,qm,heizung&firm_id=eq.${fid}&agent_id=eq.${uid}&termin_tarih=gte.${start}T00:00:00&termin_tarih=lte.${end}T23:59:59&order=termin_tarih.asc&limit=3000`;
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

function _aspRenderBonusTiers(success, tiers, currency) {
  const cur = String(currency || 'EUR').toUpperCase();
  const norm = (tiers || [])
    .map((t) => ({
      min: Number(t.min || 0),
      max: Number(t.max || 999999),
      amount: Number(t.amount || 0),
      calc_type: t.calc_type === 'per_appointment' ? 'per_appointment' : 'fixed',
    }))
    .filter((t) => t.max >= t.min)
    .sort((a, b) => a.min - b.min);
  if (!norm.length) {
    return `<div style="font-size:12px;color:var(--text-3);padding:8px 0;">Prim kademesi tanımlı değil.</div>`;
  }
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:8px;">
${norm.map((t) => {
  const span = Math.max(1, t.max - t.min + 1);
  const prog = Math.min(100, Math.round((Math.max(0, success - t.min + 1) / span) * 100));
  const hit = success >= t.min;
  const sub = t.calc_type === 'per_appointment'
    ? `${t.min}–${t.max === 999999 ? '∞' : t.max} başarılı · ${_aspFmt(t.amount)} ${cur}/termin`
    : `${t.min}–${t.max === 999999 ? '∞' : t.max} başarılı · ${_aspFmt(t.amount)} ${cur} sabit`;
  return `<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:10px;padding:12px;">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
<span style="font-weight:800;font-size:13px;">${t.min} → ${t.max === 999999 ? '∞' : t.max}</span>
<span class="badge" style="background:${hit ? 'var(--green)' : 'var(--bg-4)'};color:${hit ? '#fff' : 'var(--text-3)'};">${hit ? '\u2713' : '—'}</span>
</div>
<div style="font-size:11px;color:var(--text-3);margin-bottom:6px;">${_uiEsc(sub)}</div>
<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
<div style="height:100%;width:${prog}%;background:linear-gradient(90deg,${_aspAccentHex()},#10b981);transition:width .4s;"></div>
</div>
<div style="font-size:11px;color:var(--text-3);margin-top:6px;">İlerleme: ${prog}% (siz: ${success})</div>
</div>`;
}).join('')}
</div>`;
}

async function loadAgentSelfPerformanceDash(fid, ym, rules, payrollRow) {
  const host = document.getElementById('muh-agent-perf-wrap');
  if (!host) return;
  if (!['agent', 'qc'].includes(currentUser?.role || '')) {
    host.style.display = 'none';
    host.innerHTML = '';
    aspDestroyCharts();
    return;
  }
  host.style.display = '';
  const uid = currentUser.id;
  const { start, end } = _aspMonthBounds(ym);
  if (!start) return;

  host.innerHTML = `<div class="card" style="padding:16px;margin-bottom:14px;">
<div class="card-title" style="margin-bottom:4px;"><i class="ph ph-chart-line-up"></i> Performansım & aramalar</div>
<div class="card-sub" style="margin-bottom:14px;">Seçili ay: <strong id="asp-ym-label"></strong> · Termin ve çağrı özeti</div>
<div id="asp-body" style="color:var(--text-3);font-size:13px;">Yükleniyor…</div>
</div>`;
  document.getElementById('asp-ym-label').textContent = ym;

  const [appts, calls] = await Promise.all([
    _aspFetchAppointments(fid, uid, start, end),
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

  const cur = String(rules?.currency || 'EUR').toUpperCase();
  const pr = payrollRow || {};
  const base = Number(pr.baseSalary || 0);
  const bonus = Number(pr.bonus || 0);
  const net = Number(pr.netPayable || 0);

  const dayKeys = _aspDaysInMonth(ym);
  const byDay = {};
  dayKeys.forEach((d) => { byDay[d] = { ok: 0, pend: 0, qc: 0, fail: 0, oth: 0 }; });
  appts.forEach((a) => {
    const d = String(a.termin_tarih || '').slice(0, 10);
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
<div class="stat-card"><div class="stat-lbl">Baz maaş (${cur})</div><div class="stat-val">${_aspFmt(base)}</div></div>
<div class="stat-card stat-green"><div class="stat-lbl">Prim (${cur})</div><div class="stat-val">${_aspFmt(bonus)}</div></div>
<div class="stat-card stat-blue"><div class="stat-lbl">Hakediş (${cur})</div><div class="stat-val">${_aspFmt(net)}</div></div>
<div class="stat-card"><div class="stat-lbl">Termin (ay)</div><div class="stat-val">${tot}</div><div class="stat-meta">${ok} başarılı · %${rate}</div></div>
</div>
<div class="stats-grid" style="margin-bottom:14px;">
<div class="stat-card"><div class="stat-lbl">Aramalar</div><div class="stat-val">${cTot}</div></div>
<div class="stat-card stat-green"><div class="stat-lbl">Arama → Termin</div><div class="stat-val">${cAp}</div></div>
<div class="stat-card"><div class="stat-lbl">Dönüşüm</div><div class="stat-val">${conv}%</div></div>
<div class="stat-card"><div class="stat-lbl">Ort. süre</div><div class="stat-val">${mm}:${ss}</div></div>
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
<div style="font-weight:800;font-size:13px;margin-bottom:8px;">Günlük terminler</div>
<div style="height:240px;position:relative;"><canvas id="asp-chart-day"></canvas></div>
</div>
<div style="margin-bottom:10px;">
<div class="form-label" style="margin-bottom:6px;">Prim kademeleri (firma ayarı)</div>
${_aspRenderBonusTiers(ok, rules?.bonus_tiers, rules?.currency)}
</div>
<div style="margin-top:14px;">
<div class="form-label" style="margin-bottom:6px;">Son terminler</div>
<div class="tbl-wrap" style="max-height:260px;">
<table style="font-size:12px;min-width:520px;"><thead><tr><th>Tarih</th><th>Müşteri</th><th>Durum</th><th>PLZ</th></tr></thead>
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
    const sorted = [...appts].sort((a, b) => String(b.termin_tarih).localeCompare(String(a.termin_tarih))).slice(0, 25);
    tbAp.innerHTML = sorted.length ? sorted.map((a) => {
      const d = new Date(a.termin_tarih);
      const ds = isNaN(d.getTime()) ? '—' : d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const st = _aspApptBucket(a.durum);
      const badge = st === 'ok' ? 'badge-green' : st === 'pend' ? 'badge-yellow' : st === 'qc' ? '' : 'badge-red';
      const stl = st === 'qc' ? 'background:var(--accent-soft);color:var(--accent);' : '';
      return `<tr><td class="td-mono">${ds}</td><td>${_uiEsc(a.nachname || '—')}</td><td><span class="badge ${badge}" style="${stl}">${_uiEsc(String(a.durum || '—'))}</span></td><td>${_uiEsc(a.plz || '—')}</td></tr>`;
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
  const ax = _aspAccentHex();

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
