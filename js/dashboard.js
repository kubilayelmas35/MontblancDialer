// ─────────────────────────────────────────────
// DASHBOARD — topbar stats, ana sayfa, istatistikler
// ─────────────────────────────────────────────

function _fmtPillMoney(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (abs >= 10000) return sign + (abs / 1000).toFixed(1).replace('.0', '') + 'k';
  if (abs >= 1000) return sign + Math.round(abs).toLocaleString('tr-TR');
  return sign + abs.toFixed(2);
}

async function updateTopbarStats() {
const t0 = Date.now();
const ffLive = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
try {
await fetch(`${SB_URL}/rest/v1/campaigns?limit=1`, { headers: mbAuthHeaders() });
mbPaintPing(Date.now()-t0);
} catch(e) { mbPaintPing('!'); }
try {
const sessions = await mbLoadLiveRows(ffLive);
window._tbLiveRows = sessions;
const setPill = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = String(n); };
const countSt = (st) => sessions.filter(s => s.status === st).length;
setPill('pill-call', countSt('on_call'));
setPill('pill-ready', countSt('ready'));
setPill('pill-wrap', countSt('wrapping'));
setPill('pill-break', countSt('break'));
setPill('pill-off', countSt('offline'));
setPill('pill-total', sessions.length);
} catch(e){}
try {
const cs = await sb(`campaigns?select=id,name,status&status=eq.active${ffLive}`);
window._tbCampNames = {};
(cs || []).forEach((camp) => {
  window._tbCampNames[camp.id] = camp.name || '';
  if (typeof _opsCampNames !== 'undefined' && camp.id) _opsCampNames[camp.id] = camp.name || '';
});
if (typeof opsPaintCampPill === 'function') opsPaintCampPill();
document.getElementById('sb-badge-camp').textContent = cs.length;
} catch(e){}
try { await mbPaintTodayResults(); } catch (e) {}
if (window._tbChip) mbFillChipPop();
try {
const fid = getActiveFirmId() || currentUser?.firm_id;
if (fid) {
  const [wallet, cur] = await Promise.all([
    (typeof getFirmWallet === 'function' ? getFirmWallet(fid) : Promise.resolve({ balance: 0 })),
    (typeof getFirmCurrency === 'function' ? getFirmCurrency(fid) : Promise.resolve('EUR')),
  ]);
  window._tbBalWallet = wallet || { balance: 0, reserved_balance: 0, available: 0, overdraft: 0 };
  window._tbBalCur = cur || 'EUR';
  window._tbBalFid = fid;
  mbPaintBalChip(Number(wallet?.balance || 0), cur || 'EUR');
  if (typeof mbKickBilling === 'function') mbKickBilling(fid);
  const pop = document.getElementById('tb-bal-pop');
  if (pop && !pop.hidden) mbFillBalPop(pop);
}
} catch(e){}
}

function mbBalHex(hex) {
  const h = String(hex || '').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mbBalMix(a, b, t) {
  const pa = mbBalHex(a);
  const pb = mbBalHex(b);
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const c = pa.map((n, i) => Math.round(n + (pb[i] - n) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function mbChipMoney(n, cur) {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  const code = cur || 'EUR';
  const sym = typeof getCurrencySymbol === 'function' ? getCurrencySymbol(code) : '€';
  const full = typeof formatMoney === 'function' ? formatMoney(safe, code) : `${sym}${safe.toFixed(2)}`;
  if (Math.abs(safe) < 100000) {
    const text = full.startsWith(sym) ? full.slice(sym.length) : full;
    return { text, title: full, sym };
  }
  const compact = _fmtPillMoney(Math.abs(safe));
  const text = `${safe < 0 ? '-' : ''}${compact}`;
  return { text, title: full, sym };
}

function mbPaintBalChip(bal, cur) {
  const btn = document.getElementById('pill-bal-btn');
  const balEl = document.getElementById('pill-bal');
  const mark = document.getElementById('pill-bal-mark');
  const n = Number(bal);
  const safe = Number.isFinite(n) ? n : 0;
  const shown = mbChipMoney(safe, cur);
  if (mark) mark.textContent = shown.sym;
  if (balEl) {
    balEl.textContent = shown.text;
    balEl.title = shown.title;
  }
  if (!btn) return;
  btn.classList.remove('is-ok', 'is-warn', 'is-low', 'is-neg');
  btn.style.background = '';
  btn.style.borderColor = '';
  btn.style.color = '';
  btn.style.removeProperty('--bal-rest');
  btn.style.removeProperty('--bal-ink');
  btn.title = shown.title;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (safe >= 100) {
    btn.classList.add('is-ok');
  } else if (safe >= 50) {
    btn.classList.add('is-warn');
  } else if (safe < 0) {
    btn.classList.add('is-neg');
    const depth = Math.max(0, Math.min(1, Math.abs(safe) / 200));
    if (dark) {
      btn.style.setProperty('--bal-rest', mbBalMix('#450a0a', '#1c0505', depth));
      btn.style.setProperty('--bal-ink', depth > 0.55 ? '#fff' : '#fecaca');
    } else {
      btn.style.setProperty('--bal-rest', mbBalMix('#fee2e2', '#7f1d1d', depth));
      btn.style.setProperty('--bal-ink', depth > 0.55 ? '#fff' : '#991b1b');
    }
    btn.style.borderColor = '#dc2626';
  } else {
    btn.classList.add('is-low');
    const mix = 1 - (safe / 50);
    if (dark) {
      btn.style.background = mbBalMix('#3f2a14', '#450a0a', mix);
      btn.style.borderColor = mbBalMix('#fb923c', '#ef4444', mix);
      btn.style.color = mbBalMix('#fdba74', '#fecaca', mix);
    } else {
      btn.style.background = mbBalMix('#fff7ed', '#fee2e2', mix);
      btn.style.borderColor = mbBalMix('#fb923c', '#dc2626', mix);
      btn.style.color = mbBalMix('#c2410c', '#991b1b', mix);
    }
  }
}

function mbBalRow(label, value) {
  const esc = typeof statsEsc === 'function' ? statsEsc : (v) => String(v ?? '');
  return `<div class="tb-bal-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

async function mbTodaySpend(fid) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(today) : `${today}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
  const logs = await sb(`call_logs?select=duration_sec,cost_usd&firm_id=eq.${fid}&started_at=gte.${gte}&started_at=lte.${lte}&limit=8000`).catch(() => []);
  let cost = 0;
  let sec = 0;
  (logs || []).forEach((l) => {
    sec += Number(l.duration_sec) || 0;
    if (l.cost_usd == null || l.cost_usd === '') return;
    cost += Number(l.cost_usd) || 0;
  });
  return { cost, sec, n: (logs || []).length };
}

function mbFillBalPop(pop) {
  if (!pop) return;
  const esc = typeof statsEsc === 'function' ? statsEsc : (v) => String(v ?? '');
  const fid = window._tbBalFid || (typeof getActiveFirmId === 'function' ? getActiveFirmId() : '') || currentUser?.firm_id;
  const cur = window._tbBalCur || 'EUR';
  const w = window._tbBalWallet || { balance: 0, reserved_balance: 0, available: 0, overdraft: 0 };
  if (!fid) {
    pop.innerHTML = `<div class="tb-bal-empty">${esc(t('tb.bal_none'))}</div>`;
    return;
  }
  const money = (n) => (typeof formatMoney === 'function' ? formatMoney(n, cur) : Number(n || 0).toFixed(2));
  const plan = typeof mbBillPlan === 'function' ? mbBillPlan(window._tbBalPlan) : null;
  const due = plan && typeof mbNextBill === 'function' ? mbNextBill(plan) : null;
  const rows = [mbBalRow(t('tb.bal'), money(w.balance))];
  if (Number(w.reserved_balance) > 0) {
    rows.push(mbBalRow(t('tb.bal_reserved'), money(w.reserved_balance)));
    rows.push(mbBalRow(t('tb.bal_available'), money(w.available)));
  }
  if (Number(w.overdraft) > 0) rows.push(mbBalRow(t('tb.bal_overdraft'), money(w.overdraft)));
  if (due) {
    const when = due.days === 0
      ? t('firm.desk.today')
      : tReplace('firm.desk.days', { n: due.days });
    rows.push(mbBalRow(t('firm.desk.fee'), `${money(plan.monthly_fee)} · ${when}`));
  }
  const hold = Number(w.reserved_balance) > 0 ? `<p class="tb-bal-note">${esc(t('firm.desk.hold_hint'))}</p>` : '';
  pop.innerHTML = `
<div class="tb-bal-kicker">${esc(t('tb.bal_today'))}</div>
<div class="tb-bal-today" id="tb-bal-today">${esc(t('tb.bal_loading'))}</div>
<div class="tb-bal-sub" id="tb-bal-sub"></div>
<div class="tb-bal-rows">${rows.join('')}</div>
${hold}
<p class="tb-bal-note">${esc(t('tb.bal_note'))}</p>`;
  const seq = (window._tbBalSeq = (window._tbBalSeq || 0) + 1);
  mbTodaySpend(fid).then((spend) => {
    if (seq !== window._tbBalSeq || pop.hidden) return;
    const todayEl = document.getElementById('tb-bal-today');
    const subEl = document.getElementById('tb-bal-sub');
    if (todayEl) todayEl.textContent = money(spend.cost);
    if (subEl) subEl.textContent = `${tReplace('tb.bal_calls', { n: spend.n })} · ${tReplace('tb.bal_talk', { t: statsHms(spend.sec) })}`;
  }).catch(() => {
    const todayEl = document.getElementById('tb-bal-today');
    if (todayEl && seq === window._tbBalSeq) todayEl.textContent = money(0);
  });
  if (!window._tbBalPlan && fid) {
    sb(`firms?id=eq.${fid}&select=settings`).then((rows) => {
      window._tbBalPlan = rows?.[0]?.settings?.billing || {};
      if (seq === window._tbBalSeq && !pop.hidden) mbFillBalPop(pop);
    }).catch(() => {});
  }
}

function mbPlaceBalPop(pop) {
  const btn = document.getElementById('pill-bal-btn');
  if (!btn || !pop) return;
  const rect = btn.getBoundingClientRect();
  const width = 280;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function mbCloseTopbarPops(except) {
  if (except !== 'bal') {
    const bal = document.getElementById('tb-bal-pop');
    if (bal) bal.hidden = true;
    document.getElementById('pill-bal-btn')?.setAttribute('aria-expanded', 'false');
  }
  if (except !== 'ping') {
    const ping = document.getElementById('tb-ping-pop');
    if (ping) ping.hidden = true;
    document.getElementById('pill-ping-btn')?.setAttribute('aria-expanded', 'false');
  }
  if (except !== 'mesai' && typeof opsCloseMesaiInfo === 'function') opsCloseMesaiInfo();
  if (except !== 'aria' && typeof ariaClosePop === 'function') ariaClosePop();
  if (except !== 'camp' && typeof opsCloseCampSummary === 'function') opsCloseCampSummary();
  if (except !== 'chip' && typeof mbCloseChipPop === 'function') mbCloseChipPop();
}

function mbPingSay(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function mbPingGrade(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return 'fail';
  if (n < 80) return 'great';
  if (n < 160) return 'ok';
  if (n < 300) return 'mid';
  return 'slow';
}

function mbPaintPing(ms) {
  const el = document.getElementById('pill-ping');
  const btn = document.getElementById('pill-ping-btn');
  if (el) el.textContent = ms;
  if (btn) {
    btn.classList.remove('is-mid', 'is-slow');
    const grade = mbPingGrade(ms);
    if (grade === 'mid') btn.classList.add('is-mid');
    if (grade === 'slow' || grade === 'fail') btn.classList.add('is-slow');
  }
  const pop = document.getElementById('tb-ping-pop');
  if (pop && !pop.hidden && !window._tbPingBusy) mbFillPingPop(pop);
}

function mbPlacePingPop(pop) {
  const btn = document.getElementById('pill-ping-btn');
  if (!btn || !pop) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const width = 280;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function mbFillPingPop(pop, state) {
  if (!pop) return;
  const raw = document.getElementById('pill-ping')?.textContent || '--';
  const now = Number(raw);
  const grade = mbPingGrade(now);
  const label = mbPingSay(`tb.ping.${grade}`, grade === 'fail' ? 'Ölçülemedi' : 'İyi');
  const samples = (window._tbPingSamples || []).filter((n) => Number.isFinite(n));
  const min = samples.length ? Math.min(...samples) : null;
  const max = samples.length ? Math.max(...samples) : null;
  const avg = samples.length ? Math.round(samples.reduce((sum, n) => sum + n, 0) / samples.length) : null;
  const meter = Number.isFinite(now) ? Math.max(8, Math.min(100, Math.round(100 - now / 4))) : 8;
  const tone = grade === 'slow' || grade === 'fail' ? 'is-slow' : grade === 'mid' ? 'is-mid' : '';
  const busy = !!(state && state.busy);
  const num = (n) => (n == null ? '—' : `${n}`);
  pop.innerHTML = `
<div class="tb-ping-hd"><b>${mbPingSay('tb.ping.title', 'Bağlantı')}</b><span class="${tone}">${label}</span></div>
<div class="tb-ping-now">${Number.isFinite(now) ? now : '—'}${Number.isFinite(now) ? '<small>ms</small>' : ''}</div>
<div class="tb-ping-meter"><i class="${tone}" style="width:${meter}%"></i></div>
<div class="tb-ping-hint">${mbPingSay('tb.ping.hint', 'Sunucuya gidiş-dönüş. Test beş ölçüm alır.')}</div>
<div class="tb-ping-stats">
<div><small>${mbPingSay('tb.ping.min', 'En düşük')}</small><b>${num(min)}</b></div>
<div><small>${mbPingSay('tb.ping.avg', 'Ortalama')}</small><b>${num(avg)}</b></div>
<div><small>${mbPingSay('tb.ping.max', 'En yüksek')}</small><b>${num(max)}</b></div>
</div>
<button type="button" class="tb-ping-go" id="tb-ping-go" onclick="mbRunPingTest(event)" ${busy ? 'disabled' : ''}>${busy ? mbPingSay('tb.ping.testing', 'Ölçülüyor…') : (samples.length ? mbPingSay('tb.ping.again', 'Yeniden ölç') : mbPingSay('tb.ping.test', 'Hız testi'))}</button>`;
}

function mbOpenPingPop() {
  const pop = document.getElementById('tb-ping-pop');
  const btn = document.getElementById('pill-ping-btn');
  if (!pop) return;
  if (!pop.hidden) {
    mbPlacePingPop(pop);
    return;
  }
  mbCloseTopbarPops('ping');
  pop.hidden = false;
  mbFillPingPop(pop, window._tbPingBusy ? { busy: true } : null);
  mbPlacePingPop(pop);
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function mbTogglePingPop(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const pop = document.getElementById('tb-ping-pop');
  if (!pop) return;
  if (!pop.hidden) {
    pop.hidden = true;
    document.getElementById('pill-ping-btn')?.setAttribute('aria-expanded', 'false');
    return;
  }
  mbOpenPingPop();
}

function mbShowPingPop() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(window._tbPingHide);
  mbOpenPingPop();
}

function mbScheduleHidePing() {
  clearTimeout(window._tbPingHide);
  window._tbPingHide = setTimeout(() => {
    const pop = document.getElementById('tb-ping-pop');
    const btn = document.getElementById('pill-ping-btn');
    if (!pop || pop.hidden) return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    pop.hidden = true;
    btn?.setAttribute('aria-expanded', 'false');
  }, 180);
}

async function mbPingSample() {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    await fetch(`${SB_URL}/rest/v1/campaigns?select=id&limit=1`, {
      headers: typeof mbAuthHeaders === 'function' ? mbAuthHeaders() : {},
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return Math.max(1, Math.round(performance.now() - t0));
  } finally {
    clearTimeout(timer);
  }
}

async function mbRunPingTest(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const run = (window._tbPingRun = (window._tbPingRun || 0) + 1);
  window._tbPingBusy = true;
  window._tbPingSamples = [];
  const pop = document.getElementById('tb-ping-pop');
  mbFillPingPop(pop, { busy: true });
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    if (run !== window._tbPingRun) return;
    try { samples.push(await mbPingSample()); } catch (e) { samples.push(null); }
    window._tbPingSamples = samples.filter((n) => Number.isFinite(n));
    if (pop && !pop.hidden) mbFillPingPop(pop, { busy: i < 4 });
  }
  window._tbPingBusy = false;
  const ok = samples.filter((n) => Number.isFinite(n));
  if (ok.length) mbPaintPing(Math.round(ok.reduce((sum, n) => sum + n, 0) / ok.length));
  else if (pop && !pop.hidden) mbFillPingPop(pop);
}

function mbShowBalPop() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(window._tbBalHide);
  const pop = document.getElementById('tb-bal-pop');
  if (!pop || !pop.hidden) return;
  mbCloseTopbarPops('bal');
  pop.hidden = false;
  document.getElementById('pill-bal-btn')?.setAttribute('aria-expanded', 'true');
  mbPlaceBalPop(pop);
  mbFillBalPop(pop);
}

function mbScheduleHideBal() {
  clearTimeout(window._tbBalHide);
  window._tbBalHide = setTimeout(() => {
    const pop = document.getElementById('tb-bal-pop');
    const btn = document.getElementById('pill-bal-btn');
    if (!pop || pop.hidden) return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    pop.hidden = true;
    btn?.setAttribute('aria-expanded', 'false');
  }, 180);
}

function mbToggleBalPop(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const pop = document.getElementById('tb-bal-pop');
  const btn = document.getElementById('pill-bal-btn');
  if (!pop) return;
  if (!pop.hidden) {
    pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return;
  }
  mbCloseTopbarPops('bal');
  pop.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
  mbPlaceBalPop(pop);
  mbFillBalPop(pop);
}

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('tb-ping-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#pill-ping-btn, #tb-ping-pop')) return;
  pop.hidden = true;
  document.getElementById('pill-ping-btn')?.setAttribute('aria-expanded', 'false');
});

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('tb-bal-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#pill-bal-btn, #tb-bal-pop')) return;
  pop.hidden = true;
  const btn = document.getElementById('pill-bal-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
});

document.addEventListener('scroll', () => {
  const pop = document.getElementById('tb-bal-pop');
  if (!pop || pop.hidden) return;
  mbPlaceBalPop(pop);
  const chip = document.getElementById('tb-chip-pop');
  if (chip && !chip.hidden && window._tbChip?.anchor) mbPlaceChipPop(window._tbChip.anchor);
  const resPanel = document.getElementById('tb-res-panel');
  if (resPanel && !resPanel.hidden) mbPlaceResPanel();
}, true);

function mbChipSay(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function mbChipEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function mbChipInk(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1f2937' : '#fff';
}

function mbChipClock(sec) {
  const safe = Math.max(0, Number(sec) || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mbChipWhen(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
  return match ? `${match[3]}.${match[2]} ${match[4]}` : '';
}

async function mbLoadLiveRows(ff) {
  const rich = 'agent_id,agent_name,status,break_code,campaign_id,current_contact_name,call_started_at,call_start,updated_at,last_seen';
  const mid = 'agent_id,agent_name,status,break_code,campaign_id,current_contact_name,call_started_at,updated_at,last_seen';
  const plain = 'agent_id,agent_name,status,campaign_id,current_contact_name,call_started_at,updated_at,last_seen';
  try {
    return (await sb(`agent_sessions?select=${rich}${ff}`)) || [];
  } catch (e) {
    try {
      return (await sb(`agent_sessions?select=${mid}${ff}`)) || [];
    } catch (err) {
      return (await sb(`agent_sessions?select=${plain}${ff}`)) || [];
    }
  }
}

function mbCloseChipPop() {
  const pop = document.getElementById('tb-chip-pop');
  if (pop) pop.hidden = true;
  document.querySelectorAll('#tb-live-btn.is-open, button.tb-res.is-open').forEach((el) => {
    el.classList.remove('is-open');
    el.setAttribute('aria-expanded', 'false');
  });
  window._tbChip = null;
}

function mbPlaceChipPop(anchor) {
  const pop = document.getElementById('tb-chip-pop');
  if (!pop || !anchor) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  const width = pop.offsetWidth || 320;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function mbOpenChip(ev, spec) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const btn = spec.anchor || ev?.currentTarget;
  const pop = document.getElementById('tb-chip-pop');
  if (!pop || !btn) return;
  const same = window._tbChip && window._tbChip.kind === spec.kind && window._tbChip.key === spec.key && !pop.hidden;
  mbCloseChipPop();
  mbCloseTopbarPops('chip');
  if (same) return;
  window._tbChip = { ...spec, anchor: btn };
  btn.classList.add('is-open');
  btn.setAttribute('aria-expanded', 'true');
  mbFillChipPop();
  pop.hidden = false;
  mbPlaceChipPop(btn);
}

function mbToggleLivePop(ev, status) {
  const btn = document.getElementById('tb-live-btn');
  const inside = !!(ev?.currentTarget && ev.currentTarget.closest && ev.currentTarget.closest('#tb-chip-pop'));
  if (inside) {
    if (ev.stopPropagation) ev.stopPropagation();
    if (!window._tbChip || window._tbChip.kind !== 'live') return;
    window._tbChip = { kind: 'live', key: status || 'all', anchor: btn };
    mbFillChipPop();
    return;
  }
  const pop = document.getElementById('tb-chip-pop');
  if (pop && !pop.hidden && window._tbChip?.kind === 'live') {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    mbCloseChipPop();
    return;
  }
  mbOpenChip(ev, { kind: 'live', key: 'all', anchor: btn });
}

function mbToggleResPop(ev, key) {
  const fromPanel = !!(ev?.currentTarget && ev.currentTarget.closest && ev.currentTarget.closest('#tb-res-panel'));
  const safe = /^[a-z0-9_]*$/i.test(String(key || '')) ? String(key || '') : '';
  const chip = safe ? document.querySelector(`#tb-results .tb-res[data-res="${safe}"]`) : null;
  const panel = document.getElementById('tb-res-panel');
  if (panel) panel.hidden = true;
  mbOpenChip(ev, { kind: 'res', key: safe, anchor: fromPanel ? chip : null, fromTeam: fromPanel });
}

function mbPlaceResPanel() {
  const host = document.getElementById('tb-results');
  const panel = document.getElementById('tb-res-panel');
  if (!host || !panel || panel.hidden) return;
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  const rect = host.getBoundingClientRect();
  const width = panel.offsetWidth || 220;
  let left = rect.right - width;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  panel.style.top = `${Math.round(rect.bottom + 6)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

function mbShowResPanel() {
  clearTimeout(window._tbResHide);
  const host = document.getElementById('tb-results');
  const panel = document.getElementById('tb-res-panel');
  if (!host || host.hidden || !panel || !panel.childElementCount) return;
  const wasHidden = panel.hidden;
  panel.hidden = false;
  if (wasHidden) mbPlaceResPanel();
}

function mbScheduleHideResPanel() {
  clearTimeout(window._tbResHide);
  window._tbResHide = setTimeout(() => {
    const host = document.getElementById('tb-results');
    const panel = document.getElementById('tb-res-panel');
    if (!panel || panel.hidden) return;
    if (host?.matches(':hover') || panel.matches(':hover')) return;
    panel.hidden = true;
  }, 180);
}

function mbShowLiveBoard() {
  clearTimeout(window._tbLiveHide);
  const btn = document.getElementById('tb-live-btn');
  if (!btn || getComputedStyle(btn).display === 'none') return;
  const pop = document.getElementById('tb-chip-pop');
  if (pop && !pop.hidden && window._tbChip?.kind === 'live') return;
  mbOpenChip({ stopPropagation() {}, currentTarget: btn }, { kind: 'live', key: 'all', anchor: btn });
}

function mbSpinCounts() {
  const step = (window._tbSpin = (window._tbSpin || 0) + 1);
  const live = document.getElementById('tb-live-cycle');
  const slots = [
    ['pill-call', '#2E7D32', '#4CAF50'],
    ['pill-ready', '#E65100', '#FFB74D'],
    ['pill-wrap', '#00838F', '#00BCD4'],
    ['pill-break', '#5E35B1', '#7E57C2'],
    ['pill-off', '#757575', '#9E9E9E'],
  ];
  if (live) {
    const slot = slots[step % slots.length];
    const src = document.getElementById(slot[0]);
    live.textContent = src ? src.textContent : '0';
    live.style.color = slot[1];
    live.style.setProperty('--c', slot[2]);
  }
  const today = document.getElementById('tb-today-cycle');
  const bits = [...document.querySelectorAll('#tb-results .tb-res:not(.tb-res-sum)')];
  if (today && bits.length) {
    const bit = bits[step % bits.length];
    today.textContent = bit.textContent || '0';
    today.style.setProperty('--c', bit.style.getPropertyValue('--c') || '#64748b');
    today.style.setProperty('--ink', bit.style.getPropertyValue('--ink') || '#334155');
  }
}

function mbScheduleHideLive() {
  clearTimeout(window._tbLiveHide);
  window._tbLiveHide = setTimeout(() => {
    const pop = document.getElementById('tb-chip-pop');
    const btn = document.getElementById('tb-live-btn');
    if (!pop || pop.hidden || window._tbChip?.kind !== 'live') return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    mbCloseChipPop();
  }, 200);
}

function mbLiveMeta(status) {
  return {
    on_call: ['tb.live.call', 'Aramada', '#2E7D32'],
    ready: ['tb.live.ready', 'Hazır', '#E65100'],
    wrapping: ['tb.live.wrap', 'Sonuç', '#00838F'],
    break: ['tb.live.break', 'Mola', '#5E35B1'],
    offline: ['tb.live.off', 'Çevrimdışı', '#616161'],
    all: ['tb.live.all', 'Toplam', '#334155'],
  }[status] || ['tb.live.now', 'Şu an', '#64748b'];
}

function mbLiveDot(status) {
  return {
    on_call: '#4CAF50',
    ready: '#FFB74D',
    wrapping: '#00BCD4',
    break: '#7E57C2',
    offline: '#9E9E9E',
  }[status] || '#94a3b8';
}

function mbFillLivePop(pop, status) {
  const all = window._tbLiveRows || [];
  const key = status || 'all';
  const rows = all.filter((row) => key === 'all' || row.status === key);
  rows.sort((a, b) => {
    const ra = _DASH_LIVE_ORDER[a.status] ?? 9;
    const rb = _DASH_LIVE_ORDER[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.agent_name || '').localeCompare(String(b.agent_name || ''), 'tr');
  });
  const names = window._tbCampNames || {};
  const order = ['on_call', 'ready', 'wrapping', 'break', 'offline', 'all'];
  const count = (st) => (st === 'all' ? all.length : all.filter((row) => row.status === st).length);
  const tiles = order.map((st) => {
    const meta = mbLiveMeta(st);
    const on = st === key ? ' is-on' : '';
    return `<button type="button" class="tb-live-tile${on}" style="--tone:${meta[2]}" onclick="mbToggleLivePop(event,'${st}')"><em>${mbChipEsc(mbChipSay(meta[0], meta[1]))}</em><b>${count(st)}</b></button>`;
  }).join('');
  const head = `<div class="tb-chip-head"><strong>${mbChipEsc(mbChipSay('tb.live.now', 'Şu an'))}</strong><span>${all.length}</span></div>`;
  const de = (typeof currentLang !== 'undefined' && currentLang === 'de');
  const body = rows.length ? rows.map((row) => {
    const st = _DASH_LIVE_STATUS[row.status] ? row.status : 'offline';
    const info = _DASH_LIVE_STATUS[st];
    const label = de ? info.de : info.tr;
    const since = typeof liveStateSinceIso === 'function' ? liveStateSinceIso(row) : '';
    const age = typeof liveAgeUnit === 'function' ? liveAgeUnit(row) : 0;
    const dur = typeof liveClock === 'function' ? liveClock(since, de) : '';
    const name = row.agent_name || '—';
    const initial = String(name).trim().charAt(0).toUpperCase() || '?';
    const camp = names[row.campaign_id] || '—';
    return `<div class="live-line live-line--${st} tb-live-line" style="--live-age:${Number(age).toFixed(3)}"><div class="live-line-who"><span class="live-av">${mbChipEsc(initial)}</span><span class="live-name">${mbChipEsc(name)}</span></div><div class="live-status">${mbChipEsc(label)}</div><div class="live-dur">${mbChipEsc(dur)}</div><div class="live-line-clip">${mbChipEsc(camp)}</div></div>`;
  }).join('') : `<div class="tb-chip-empty">${mbChipEsc(mbChipSay('tb.live.empty', 'Bu durumda kimse yok'))}</div>`;
  pop.innerHTML = `${head}<div class="tb-live-tiles">${tiles}</div><div class="tb-live-people">${body}</div>`;
}

function mbFillResPop(pop, key) {
  const source = window._tbChip?.fromTeam ? window._tbTeamRows : window._tbApptRows;
  const rows = (source || []).filter((row) => !key || (typeof _normResultKey === 'function' ? _normResultKey(row.durum) : row.durum) === key);
  const def = (window._tbResDefs || []).find((item) => item.key === key);
  const title = key ? (def?.label || key) : mbChipSay('tb.res.total', 'Toplam');
  const scope = window._tbResOwn ? mbChipSay('tb.res.mine', 'Senin randevuların') : mbChipSay('tb.res.all', 'Firma toplamı');
  const head = `<div class="tb-chip-head"><strong>${mbChipEsc(title)}</strong><span>${mbChipEsc(scope)} · ${rows.length}</span></div>`;
  if (!rows.length) {
    pop.innerHTML = `${head}<div class="tb-chip-empty">${mbChipEsc(mbChipSay('tb.res.empty', 'Bu sonuçta randevu yok'))}</div>`;
    return;
  }
  const open = mbChipSay('tb.res.open', 'Dialerda aç');
  const body = rows.slice(0, 40).map((row) => {
    const id = /^[0-9a-f-]{36}$/i.test(String(row.contact_id || '')) ? String(row.contact_id) : '';
    const when = mbChipWhen(row.termin_tarih) || mbChipWhen(row.kayit_tarihi);
    const who = (window._tbLiveRows || []).find((agent) => agent.agent_id === row.agent_id);
    const detail = [when, !window._tbResOwn ? who?.agent_name : '', id ? open : ''].filter(Boolean).join(' · ');
    if (!id) return `<div class="tb-chip-row"><b>${mbChipEsc(row.nachname || '—')}</b>${detail ? `<small>${mbChipEsc(detail)}</small>` : ''}</div>`;
    return `<button type="button" class="tb-chip-row" onclick="mbOpenChipAppt('${id}')"><b>${mbChipEsc(row.nachname || '—')}</b><small>${mbChipEsc(detail)}</small></button>`;
  }).join('');
  pop.innerHTML = head + body;
}

function mbFillChipPop() {
  const pop = document.getElementById('tb-chip-pop');
  const spec = window._tbChip;
  if (!pop || !spec) return;
  pop.classList.toggle('is-board', spec.kind === 'live');
  if (spec.kind === 'live') mbFillLivePop(pop, spec.key);
  else mbFillResPop(pop, spec.key);
  if (spec.anchor) mbPlaceChipPop(spec.anchor);
}

function mbOpenChipAppt(contactId) {
  mbCloseChipPop();
  if (typeof openDialerForContact === 'function') openDialerForContact(contactId);
}

function mbResDayLabel(day, mode) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const lang = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'tr-TR';
  const opt = mode === 'month'
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(lang, opt).format(dt);
}

function mbResView() {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  if (!window._tbResView) window._tbResView = { basis: 'kayit', span: 'day', anchor: today };
  if (!window._tbResView.anchor) window._tbResView.anchor = today;
  return window._tbResView;
}

function mbResBounds(view) {
  const anchor = view.anchor;
  if (view.span === 'week') {
    const m = String(anchor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const back = dt.getUTCDay() === 0 ? 6 : dt.getUTCDay() - 1;
    const start = typeof mbShiftDate === 'function' ? mbShiftDate(anchor, -back) : anchor;
    const end = typeof mbShiftDate === 'function' ? mbShiftDate(start, 6) : anchor;
    return { start, end };
  }
  if (view.span === 'month') {
    const m = String(anchor).match(/^(\d{4})-(\d{2})-/);
    if (!m) return { start: anchor, end: anchor };
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` };
  }
  return { start: anchor, end: anchor };
}

function mbResRangeLabel(view, bounds) {
  if (view.span === 'month') return mbResDayLabel(bounds.start, 'month');
  if (view.span === 'week') return `${mbResDayLabel(bounds.start)} – ${mbResDayLabel(bounds.end)}`;
  return mbResDayLabel(bounds.start);
}

function mbResShift(delta, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const view = mbResView();
  const dir = Number(delta) < 0 ? -1 : 1;
  if (view.span === 'month') {
    const m = String(view.anchor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + dir, 1));
    const y = dt.getUTCFullYear();
    const mo = dt.getUTCMonth();
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const day = Math.min(Number(m[3]), last);
    view.anchor = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (typeof mbShiftDate === 'function') {
    view.anchor = mbShiftDate(view.anchor, dir * (view.span === 'week' ? 7 : 1));
  }
  void mbPaintResTeam();
}

function mbResSetSpan(span, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const view = mbResView();
  if (!['day', 'week', 'month'].includes(span) || view.span === span) return;
  view.span = span;
  void mbPaintResTeam();
}

function mbResSetBasis(basis, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const view = mbResView();
  if (!['kayit', 'termin'].includes(basis) || view.basis === basis) return;
  view.basis = basis;
  void mbPaintResTeam();
}

function mbResAgentName(row) {
  const id = String(row?.agent_id || '');
  const embedded = row?.users?.name;
  if (embedded) return String(embedded);
  const live = (window._tbLiveRows || []).find((agent) => String(agent.agent_id || '') === id);
  return live?.agent_name || '—';
}

function mbResAgentBoard(rows, pieces) {
  const norm = (value) => (typeof _normResultKey === 'function' ? _normResultKey(value) : String(value || ''));
  const by = new Map();
  (rows || []).forEach((row) => {
    const id = String(row.agent_id || '');
    if (!by.has(id)) by.set(id, { name: mbResAgentName(row), counts: {}, total: 0 });
    const slot = by.get(id);
    const key = norm(row.durum);
    slot.counts[key] = (slot.counts[key] || 0) + 1;
    slot.total += 1;
  });
  return [...by.values()].sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'tr'));
}

function mbResSampleBoard(pieces) {
  const grid = [
    [6, 2, 1, 0, 1, 0],
    [4, 3, 0, 2, 0, 1],
    [3, 1, 2, 1, 1, 0],
    [2, 4, 0, 0, 1, 2],
    [1, 1, 1, 2, 0, 0],
  ];
  const who = mbChipSay('tb.res.sampleAgent', 'Temsilci');
  return grid.map((counts, index) => {
    const slot = { name: `${who} ${index + 1}`, counts: {}, total: 0 };
    pieces.forEach((item, i) => {
      const n = counts[i] || 0;
      slot.counts[item.key] = n;
      slot.total += n;
    });
    return slot;
  });
}

function mbTodayTeamPanel(pieces, rows, view, bounds) {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const realAgents = mbResAgentBoard(rows, pieces);
  const sample = !realAgents.length && view.span === 'day' && view.basis === 'kayit' && view.anchor === today;
  const agents = sample ? mbResSampleBoard(pieces) : realAgents;
  const shown = pieces.map((item) => ({
    ...item,
    n: sample ? agents.reduce((sum, agent) => sum + (agent.counts[item.key] || 0), 0) : item.n,
  }));
  const total = shown.reduce((sum, item) => sum + (item.n || 0), 0);
  const title = view.span === 'day' && view.anchor === today
    ? mbChipSay('tb.res.today', 'Bugün')
    : (view.span === 'week' ? mbChipSay('tb.res.span.week', 'Hafta') : (view.span === 'month' ? mbChipSay('tb.res.span.month', 'Ay') : mbChipSay('tb.res.span.day', 'Gün')));
  const totalLabel = mbChipSay('tb.res.total', 'Toplam');
  const agentsLabel = mbChipSay('tb.res.agents', 'Temsilciler');
  const emptyLabel = mbChipSay('tb.res.emptyRange', 'Bu aralıkta kayıt yok');
  const sampleLabel = mbChipSay('tb.res.sample', 'Örnek');
  const seg = (key, on, fn, arg) => `<button type="button" class="${on ? 'is-on' : ''}" onclick="${fn}('${arg}', event)">${mbChipEsc(mbChipSay(key, arg))}</button>`;
  const tools = `<div class="tb-res-tools"><div class="tb-res-seg">${seg('tb.res.basis.kayit', view.basis === 'kayit', 'mbResSetBasis', 'kayit')}${seg('tb.res.basis.termin', view.basis === 'termin', 'mbResSetBasis', 'termin')}</div><div class="tb-res-nav"><button type="button" class="tb-res-step" aria-label="${mbChipEsc(mbChipSay('tb.res.prev', 'Geri'))}" onclick="mbResShift(-1, event)">‹</button><div class="tb-res-seg">${seg('tb.res.span.day', view.span === 'day', 'mbResSetSpan', 'day')}${seg('tb.res.span.week', view.span === 'week', 'mbResSetSpan', 'week')}${seg('tb.res.span.month', view.span === 'month', 'mbResSetSpan', 'month')}</div><button type="button" class="tb-res-step" aria-label="${mbChipEsc(mbChipSay('tb.res.next', 'İleri'))}" onclick="mbResShift(1, event)">›</button></div></div>`;
  const metrics = shown.map((item) => {
    const inner = `<b class="tb-res-num">${item.n}</b><span>${mbChipEsc(item.label)}</span>`;
    return sample
      ? `<div class="tb-res-row" style="--c:${item.color};--ink:${item.ink}">${inner}</div>`
      : `<button type="button" class="tb-res-row" style="--c:${item.color};--ink:${item.ink}" onclick="mbToggleResPop(event,'${item.key}')">${inner}</button>`;
  }).join('');
  const headDots = shown.map((item) => `<th title="${mbChipEsc(item.label)}"><i class="tb-res-dot" style="--c:${item.color}"></i></th>`).join('');
  const body = agents.length ? agents.map((agent) => {
    const cells = shown.map((item) => {
      const n = agent.counts[item.key] || 0;
      return `<td class="${n ? '' : 'is-zero'}" style="${n ? `color:${item.ink}` : ''}">${n}</td>`;
    }).join('');
    const rowTotal = shown.reduce((sum, item) => sum + (agent.counts[item.key] || 0), 0);
    return `<tr><td title="${mbChipEsc(agent.name)}">${mbChipEsc(agent.name)}</td>${cells}<td>${rowTotal}</td></tr>`;
  }).join('') : `<tr><td class="tb-res-empty" colspan="${shown.length + 2}">${mbChipEsc(emptyLabel)}</td></tr>`;
  const foot = shown.map((item) => `<td style="color:${item.ink}">${item.n}</td>`).join('');
  const footRow = agents.length ? `<tfoot><tr><td>${mbChipEsc(totalLabel)}</td>${foot}<td>${total}</td></tr></tfoot>` : '';
  const badge = sample ? `<em class="tb-res-sample">${mbChipEsc(sampleLabel)}</em>` : '';
  return `${tools}<div class="tb-res-head"><div><span>${mbChipEsc(title)}</span>${badge}<small class="tb-res-day">${mbChipEsc(mbResRangeLabel(view, bounds))}</small></div><b>${total}</b></div><div class="tb-res-metrics">${metrics}</div><div class="tb-res-table-wrap"><table class="tb-res-table"><thead><tr><th>${mbChipEsc(agentsLabel)}</th>${headDots}<th>${mbChipEsc(totalLabel)}</th></tr></thead><tbody>${body}</tbody>${footRow}</table></div>`;
}

async function mbPaintResTeam() {
  const panel = document.getElementById('tb-res-panel');
  const host = document.getElementById('tb-results');
  if (!panel || !host || !currentUser) return;
  if (!(typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin()) || currentUser.role === 'agent' || currentUser.role === 'field_agent') return;
  const seq = (window._tbResSeq = (window._tbResSeq || 0) + 1);
  const view = mbResView();
  const bounds = mbResBounds(view);
  const selected = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
  const fid = selected || currentUser.firm_id;
  const ff = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
  const defs = fid && typeof loadFirmAppointmentResults === 'function'
    ? await loadFirmAppointmentResults(fid, false).catch(() => [])
    : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  if (seq !== window._tbResSeq) return;
  const col = view.basis === 'termin' ? 'termin_tarih' : 'kayit_tarihi';
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(bounds.start) : `${bounds.start}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(bounds.end) : `${bounds.end}T23:59:59`;
  const limit = view.span === 'month' ? 4000 : (view.span === 'week' ? 1500 : 800);
  const select = 'id,nachname,durum,agent_id,contact_id,termin_tarih,kayit_tarihi,users(name)';
  const q = `appointments?select=${select}&${col}=gte.${gte}&${col}=lte.${lte}${ff}&order=${col}.desc&limit=${limit}`;
  let rows = await sb(q).catch(() => null);
  if (rows == null) rows = await sb(q.replace(',users(name)', '')).catch(() => []) || [];
  if (seq !== window._tbResSeq) return;
  const norm = (value) => (typeof _normResultKey === 'function' ? _normResultKey(value) : String(value || ''));
  const list = (defs || []).map((def) => ({
    key: norm(def.key),
    label: typeof mbResultLabel === 'function' ? mbResultLabel(def.key, def.label) : String(def.label || def.key || '').trim(),
    color: typeof _normalizeResultColor === 'function' ? _normalizeResultColor(def.color) : String(def.color || '#64748b'),
  })).filter((def) => def.key);
  const safeColor = (color) => (/^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#64748b');
  const pieces = list.map((def) => {
    const key = /^[a-z0-9_]*$/i.test(String(def.key || '')) ? String(def.key) : '';
    if (!key) return null;
    const color = safeColor(def.color);
    const ink = mbChipInk(color) === '#fff' ? color : color.replace(/[0-9a-f]{2}/gi, (pair) => {
      const n = Math.max(0, Math.round(parseInt(pair, 16) * 0.62));
      return n.toString(16).padStart(2, '0');
    });
    return { key, color, ink, n: rows.filter((row) => norm(row.durum) === key).length, label: def.label };
  }).filter(Boolean);
  const extra = {};
  rows.forEach((row) => {
    const key = norm(row.durum);
    if (!key || pieces.some((item) => item.key === key)) return;
    extra[key] = (extra[key] || 0) + 1;
  });
  Object.keys(extra).sort().forEach((key) => {
    const color = '#64748b';
    const pretty = key === 'onaylandi' ? 'Onaylandı' : key.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
    const label = typeof mbResultLabel === 'function' ? mbResultLabel(key, pretty) : pretty;
    const ink = color.replace(/[0-9a-f]{2}/gi, (pair) => {
      const n = Math.max(0, Math.round(parseInt(pair, 16) * 0.62));
      return n.toString(16).padStart(2, '0');
    });
    pieces.push({ key, color, ink, n: extra[key], label });
  });
  window._tbTeamRows = rows;
  window._tbTeamSample = !mbResAgentBoard(rows, pieces).length && view.span === 'day' && view.basis === 'kayit' && view.anchor === (typeof mbBusinessToday === 'function' ? mbBusinessToday() : '');
  const keepOpen = !panel.hidden || host.matches(':hover') || panel.matches(':hover');
  panel.classList.add('is-team');
  panel.innerHTML = pieces.length ? mbTodayTeamPanel(pieces, rows, view, bounds) : '';
  panel.hidden = !keepOpen || !panel.innerHTML;
  if (!panel.hidden) mbPlaceResPanel();
}

async function mbPaintTodayResults() {
  const host = document.getElementById('tb-results');
  const panel = document.getElementById('tb-res-panel');
  if (!host || !currentUser) return;
  if (currentUser.role === 'field_agent') {
    host.hidden = true;
    host.innerHTML = '';
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = '';
    }
    return;
  }
  const own = currentUser.role === 'agent';
  const admin = !own && typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  const selected = typeof getActiveFirmId === 'function' ? getActiveFirmId() : '';
  const fid = selected || currentUser.firm_id;
  const ff = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
  const mine = own && currentUser.id ? `&agent_id=eq.${currentUser.id}` : '';
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().slice(0, 10);
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(today) : `${today}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(today) : `${today}T23:59:59`;
  const defs = fid && typeof loadFirmAppointmentResults === 'function'
    ? await loadFirmAppointmentResults(fid, true).catch(() => [])
    : (typeof defaultAppointmentResults === 'function' ? defaultAppointmentResults() : []);
  const todaySelect = 'id,nachname,durum,agent_id,contact_id,termin_tarih,kayit_tarihi';
  const todayQ = `appointments?select=${todaySelect}&kayit_tarihi=gte.${gte}&kayit_tarihi=lte.${lte}${ff}${mine}&order=kayit_tarihi.desc&limit=400`;
  const rows = await sb(todayQ).catch(() => []) || [];
  const norm = (value) => (typeof _normResultKey === 'function' ? _normResultKey(value) : String(value || ''));
  const list = (defs || []).map((def) => ({
    key: norm(def.key),
    label: typeof mbResultLabel === 'function' ? mbResultLabel(def.key, def.label) : String(def.label || def.key || '').trim(),
    color: typeof _normalizeResultColor === 'function' ? _normalizeResultColor(def.color) : String(def.color || '#64748b'),
  })).filter((def) => def.key);
  window._tbApptRows = rows;
  window._tbResDefs = list;
  window._tbResOwn = own;
  const countOf = (key) => rows.filter((row) => norm(row.durum) === key).length;
  const safeColor = (color) => (/^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#64748b');
  const todayLabel = mbChipSay('tb.res.today', 'Bugün');
  const totalLabel = mbChipSay('tb.res.total', 'Toplam');
  const piece = (def) => {
    const key = /^[a-z0-9_]*$/i.test(String(def.key || '')) ? String(def.key) : '';
    if (!key) return '';
    const color = safeColor(def.color);
    const ink = mbChipInk(color) === '#fff' ? color : color.replace(/[0-9a-f]{2}/gi, (pair) => {
      const n = Math.max(0, Math.round(parseInt(pair, 16) * 0.62));
      return n.toString(16).padStart(2, '0');
    });
    return { key, color, ink, n: countOf(key), label: def.label };
  };
  const pieces = list.map(piece).filter((item) => item.key);
  const rowsHtml = pieces.length && !admin
    ? `<div class="tb-res-head"><span>${mbChipEsc(todayLabel)}</span><b>${rows.length}</b></div><div class="tb-res-list">${pieces.map((item) => `<button type="button" class="tb-res-row" style="--c:${item.color};--ink:${item.ink}" onclick="mbToggleResPop(event,'${item.key}')"><b class="tb-res-num">${item.n}</b><span>${mbChipEsc(item.label)}</span></button>`).join('')}</div>`
    : '';
  const keepOpen = !!(panel && (!panel.hidden || host.matches(':hover') || panel.matches(':hover')));
  host.hidden = false;
  host.setAttribute('aria-label', todayLabel);
  const nums = pieces.map((item) => `<button type="button" class="tb-res" data-res="${item.key}" aria-label="${mbChipEsc(item.label)}" style="--c:${item.color};--ink:${item.ink}" onclick="mbToggleResPop(event,'${item.key}')">${item.n}</button>`).join('');
  host.innerHTML = `<span class="tb-today-cycle" id="tb-today-cycle">0</span><button type="button" class="tb-res tb-res-sum" data-res="" aria-label="${mbChipEsc(totalLabel)}" onclick="mbToggleResPop(event,'')">${rows.length}</button>${nums}`;
  mbSpinCounts();
  if (typeof mbFitStatus === 'function') mbFitStatus();
  if (panel && !admin) {
    panel.classList.remove('is-team');
    panel.innerHTML = rowsHtml;
    panel.hidden = !keepOpen || !rowsHtml;
    if (!panel.hidden) mbPlaceResPanel();
  }
  if (admin) void mbPaintResTeam();
  if (window._tbChip?.kind === 'res') {
    const next = host.querySelector(`[data-res="${window._tbChip.key || ''}"]`);
    if (next) {
      next.classList.add('is-open');
      next.setAttribute('aria-expanded', 'true');
      window._tbChip.anchor = next;
    }
  }
}

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('tb-chip-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#tb-chip-pop, #tb-results, #tb-res-panel, #tb-live-btn')) return;
  mbCloseChipPop();
});

document.addEventListener('mouseover', (ev) => {
  const target = ev.target;
  if (!target || !target.closest) return;
  if (target.closest('#tb-results, #tb-res-panel')) mbShowResPanel();
  else mbScheduleHideResPanel();
  if (target.closest('#tb-live-btn') || (target.closest('#tb-chip-pop') && window._tbChip?.kind === 'live')) mbShowLiveBoard();
  else mbScheduleHideLive();
  if (target.closest('#pill-ping-btn, #tb-ping-pop')) mbShowPingPop();
  else mbScheduleHidePing();
  if (target.closest('#pill-bal-btn, #tb-bal-pop')) mbShowBalPop();
  else mbScheduleHideBal();
  if (target.closest('#tb-mesai-btn, #tb-mesai-pop') && typeof opsShowMesaiPop === 'function') opsShowMesaiPop();
  else if (typeof opsScheduleHideMesai === 'function') opsScheduleHideMesai();
  if (target.closest('#aria-live, #aria-pop') && typeof ariaShowPop === 'function') ariaShowPop();
  else if (typeof ariaScheduleHide === 'function') ariaScheduleHide();
  if (target.closest('#pill-camp-btn, #tb-camp-pop') && typeof opsShowCampSummary === 'function') opsShowCampSummary();
  else if (typeof opsScheduleHideCampSummary === 'function') opsScheduleHideCampSummary();
});

function mbStatusWidth(wrap) {
  const kids = [...wrap.children].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none');
  const gap = parseFloat(getComputedStyle(wrap).columnGap) || 0;
  const boxes = kids.reduce((sum, el) => {
    const style = getComputedStyle(el);
    return sum + el.getBoundingClientRect().width + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  }, 0);
  return boxes + gap * Math.max(0, kids.length - 1);
}

function mbFitStatus() {
  const wrap = document.getElementById('tb-pills-wrap');
  if (!wrap || wrap._fitLock) return;
  wrap._fitLock = true;
  const room = wrap.clientWidth;
  const steps = ['is-live-open', 'is-today-open', 'is-mesai-open'];
  wrap.classList.remove(...steps);
  for (const step of steps) {
    wrap.classList.add(step);
    if (mbStatusWidth(wrap) > room + 1) {
      wrap.classList.remove(step);
      break;
    }
  }
  wrap._fitLock = false;
}

setInterval(mbSpinCounts, 1400);
{
  const wrap = document.getElementById('tb-pills-wrap');
  if (wrap && window.ResizeObserver) new ResizeObserver(() => mbFitStatus()).observe(wrap);
  mbFitStatus();
}

function _dashCanUseAgentFilter() {
  return mbIsFirmAdmin();
}

function _dashLogFilter() {
  const ff = getFirmFilter('&') || '';
  const role = currentUser?.role || '';
  const onlySelf = role === 'agent';
  let agentQ = '';
  if (onlySelf) {
    agentQ = `&agent_id=eq.${currentUser.id}`;
  } else if (_dashCanUseAgentFilter()) {
    const sel = document.getElementById('dash-agent-f');
    const aid = sel && !sel.disabled ? String(sel.value || '').trim() : '';
    if (aid) agentQ = `&agent_id=eq.${aid}`;
  }
  return { ff, agentQ, onlySelf, isAdmin: mbIsFirmAdmin(role) };
}

window._dashRange = window._dashRange || 'today';

function setDashRange(r) {
  mbCommitReportRange({ mode: r });
  loadDashboard();
}

let _mbRangeApplying = false;

function mbReadReportRange() {
  try {
    const raw = JSON.parse(localStorage.getItem('mb_report_range') || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const mode = String(raw.mode || '');
    if (!['today', 'week', 'month', 'year', 'all', 'custom'].includes(mode)) return null;
    return { mode, from: String(raw.from || ''), to: String(raw.to || '') };
  } catch (e) {
    return null;
  }
}

function mbReportToday() {
  return typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
}

function mbReportBounds(mode, from, to) {
  const today = mbReportToday();
  if (mode === 'today') return { from: today, to: today };
  if (mode === 'week') {
    const start = typeof statsMonday === 'function' ? statsMonday(today) : today;
    const end = typeof mbShiftDate === 'function' ? mbShiftDate(start, 6) : today;
    return { from: start, to: end };
  }
  if (mode === 'month') return { from: `${String(today).slice(0, 8)}01`, to: today };
  if (mode === 'year') return { from: `${String(today).slice(0, 4)}-01-01`, to: today };
  if (mode === 'all') return { from: '2000-01-01', to: today };
  const a = String(from || '');
  const b = String(to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

function mbPaintReportRange(rec) {
  if (!rec || _mbRangeApplying) return;
  _mbRangeApplying = true;
  try {
    const mode = rec.mode;
    const bounds = mbReportBounds(mode, rec.from, rec.to);
    if (['today', 'week', 'month', 'all'].includes(mode)) {
      window._dashRange = mode;
      document.querySelectorAll('.dash-range-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.dashRange === mode);
      });
    }
    const stats = document.getElementById('stats-date-f');
    if (stats && [...stats.options].some((o) => o.value === mode)) stats.value = mode;
    if (typeof toggleCustomDateRange === 'function') toggleCustomDateRange();
    if (mode === 'custom' && bounds) {
      const sf = document.getElementById('stats-date-from');
      const st = document.getElementById('stats-date-to');
      if (sf) sf.value = bounds.from;
      if (st) st.value = bounds.to;
    }
    const ch = document.getElementById('ch-date-f');
    if (ch && ['today', 'week', 'month'].includes(mode)) ch.value = mode;
    else if (ch && (mode === 'custom' || mode === 'year')) ch.value = 'custom';
    if (typeof toggleCallHistoryRange === 'function') toggleCallHistoryRange();
    if ((mode === 'custom' || mode === 'year') && bounds) {
      const cf = document.getElementById('ch-date-from');
      const ct = document.getElementById('ch-date-to');
      if (cf) cf.value = bounds.from;
      if (ct) ct.value = bounds.to;
    }
    if (bounds && mode !== 'all') {
      const ef = document.getElementById('et-date-from');
      const et = document.getElementById('et-date-to');
      if (ef) ef.value = bounds.from;
      if (et) et.value = bounds.to;
    }
  } finally {
    _mbRangeApplying = false;
  }
}

function mbCommitReportRange(rec) {
  if (_mbRangeApplying) return;
  const mode = String(rec?.mode || 'today');
  const bounds = mbReportBounds(mode, rec?.from, rec?.to) || { from: '', to: '' };
  const next = { mode, from: bounds.from, to: bounds.to };
  try { localStorage.setItem('mb_report_range', JSON.stringify(next)); } catch (e) {}
  mbPaintReportRange(next);
}

function mbStatsRangeChanged() {
  if (_mbRangeApplying) return;
  const mode = document.getElementById('stats-date-f')?.value || 'today';
  if (mode === 'custom') {
    mbCommitReportRange({
      mode,
      from: document.getElementById('stats-date-from')?.value,
      to: document.getElementById('stats-date-to')?.value,
    });
  } else mbCommitReportRange({ mode });
  if (typeof toggleCustomDateRange === 'function') toggleCustomDateRange();
  if (typeof loadStats === 'function') loadStats();
}

function mbCallHistRangeChanged() {
  if (_mbRangeApplying) return;
  const mode = document.getElementById('ch-date-f')?.value || 'week';
  if (mode === 'custom') {
    mbCommitReportRange({
      mode,
      from: document.getElementById('ch-date-from')?.value,
      to: document.getElementById('ch-date-to')?.value,
    });
  } else mbCommitReportRange({ mode });
  if (typeof toggleCallHistoryRange === 'function') toggleCallHistoryRange();
  if (typeof loadCallHistory === 'function') loadCallHistory();
}

function mbExportRangeChanged() {
  if (_mbRangeApplying) return;
  mbCommitReportRange({
    mode: 'custom',
    from: document.getElementById('et-date-from')?.value,
    to: document.getElementById('et-date-to')?.value,
  });
  if (typeof etReload === 'function') etReload();
}

function _dashGetRange() {
  return window._dashRange || 'today';
}

function _dashDateBounds() {
  const range = _dashGetRange();
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
  if (range === 'today') return { from: today, to: today, range };
  if (range === 'week') {
    const from = typeof mbShiftDate === 'function' ? mbShiftDate(today, -6) : today;
    return { from, to: today, range };
  }
  if (range === 'month') {
    const from = `${String(today).slice(0, 8)}01`;
    return { from, to: today, range };
  }
  return { from: '2000-01-01', to: today, range };
}

function _eachDayInRange(fromStr, toStr) {
  const out = [];
  let cur = String(fromStr || '');
  let guard = 0;
  while (cur && cur <= String(toStr || '') && guard < 4000) {
    out.push(cur);
    cur = typeof mbShiftDate === 'function' ? mbShiftDate(cur, 1) : cur;
    if (typeof mbShiftDate !== 'function') break;
    guard++;
  }
  return out;
}

function _monthKeysLastN(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(mbLocale(), { month: 'short', year: '2-digit' });
    out.push({ key, label });
  }
  return out;
}

function _logDayKey(log) {
  if (typeof mbBerlinDay === 'function') return mbBerlinDay(log.started_at);
  return String(log.started_at || '').slice(0, 10);
}

function _logMonthKey(log) {
  const day = _logDayKey(log);
  return day.length >= 7 ? day.slice(0, 7) : '';
}

function _dashUpdateStatLabels(rangeKey) {
  const isTr = currentLang === 'tr';
  const calls = document.getElementById('stat-lbl-calls');
  const costM = document.getElementById('d-cost-m');
  if (calls) {
    if (isTr) {
      calls.textContent =
        rangeKey === 'today'
          ? 'Bugünkü Aramalar'
          : rangeKey === 'week'
            ? 'Bu haftaki Aramalar'
            : rangeKey === 'month'
              ? 'Bu ayki Aramalar'
              : 'Tüm zamanlar — Aramalar';
    } else {
      calls.textContent =
        rangeKey === 'today'
          ? 'Heutige Anrufe'
          : rangeKey === 'week'
            ? 'Anrufe (Woche)'
            : rangeKey === 'month'
              ? 'Anrufe (Monat)'
              : 'Anrufe (gesamt)';
    }
  }
  if (costM) {
    costM.textContent = isTr ? (rangeKey === 'today' ? 'bugün' : 'seçili aralık') : rangeKey === 'today' ? 'heute' : 'Zeitraum';
  }
}

function _dashUpdateCardTitles(rangeKey) {
  const isTr = currentLang === 'tr';
  const hourlyTitle = document.getElementById('dash-hourly-title');
  const hourlySub = document.getElementById('dash-hourly-sub');
  const outTitle = document.getElementById('dash-outcome-title');
  const outSub = document.getElementById('dash-outcome-sub');
  const trendTitle = document.getElementById('dash-trend-title');
  const trendSub = document.getElementById('dash-chart-sub');
  if (hourlyTitle && hourlySub) {
    if (rangeKey === 'today') {
      hourlyTitle.textContent = isTr ? 'Bugün — saatlik analiz' : 'Heute — Stundenanalyse';
      hourlySub.textContent = isTr ? 'Çağrı hacmi ve randevu (saat başı)' : 'Anrufvolumen und Termine pro Stunde';
    } else if (rangeKey === 'week') {
      hourlyTitle.textContent = isTr ? 'Bu hafta — günlük analiz' : 'Diese Woche — Tagesanalyse';
      hourlySub.textContent = isTr ? 'Günlük çağrı ve randevu' : 'Anrufe und Termine pro Tag';
    } else if (rangeKey === 'month') {
      hourlyTitle.textContent = isTr ? 'Bu ay — günlük analiz' : 'Dieser Monat — Tagesanalyse';
      hourlySub.textContent = isTr ? 'Günlük çağrı ve randevu' : 'Anrufe und Termine pro Tag';
    } else {
      hourlyTitle.textContent = isTr ? 'Son 24 ay — aylık analiz' : 'Letzte 24 Monate';
      hourlySub.textContent = isTr ? 'Aylık çağrı ve randevu' : 'Monatliche Anrufe und Termine';
    }
  }
  if (outTitle && outSub) {
    outTitle.textContent = isTr ? 'Randevu sonuçları' : 'Termin-Ergebnisse';
    outSub.textContent = isTr ? 'Randevu durumları (randevu tarihine göre)' : 'Terminstatus nach Terminzeit';
  }
  if (trendTitle && trendSub) {
    if (rangeKey === 'today') {
      trendTitle.textContent = isTr ? 'Bugün — kümülatif çağrı' : 'Heute — kumulativ';
      trendSub.textContent = isTr ? 'Gün içi birikimli çağrı sayısı' : 'Kumulative Anrufe';
    } else if (rangeKey === 'all') {
      trendTitle.textContent = isTr ? 'Son 24 ay — çağrı trendi' : 'Trend (24 Monate)';
      trendSub.textContent = isTr ? 'Aylık toplam çağrı' : 'Monatliche Anrufe';
    } else {
      trendTitle.textContent = isTr ? 'Çağrı trendi' : 'Anruf-Trend';
      trendSub.textContent = isTr ? 'Günlük toplam çağrı' : 'Anrufe pro Tag';
    }
  }
}

async function fetchDashAppointmentsInRange(from, to, ff, agentQ) {
  let q = `appointments?select=durum,termin_tarih,agent_id&termin_tarih=gte.${from}T00:00:00&termin_tarih=lte.${to}T23:59:59&limit=15000`;
  if (ff) q += ff;
  if (agentQ) q += agentQ;
  try {
    return (await sb(q)) || [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function populateDashAgentSelect() {
  const wrap = document.getElementById('dash-agent-wrap');
  const sel = document.getElementById('dash-agent-f');
  if (!wrap || !sel) return;
  if (!_dashCanUseAgentFilter()) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const prev = sel.value;
  if (mbIsSuperAdmin() && !getActiveFirmId()) {
    sel.disabled = false;
    sel.innerHTML = `<option value="">${t('ui.all_agents')}</option>`;
    return;
  }
  sel.disabled = false;
  const fid = getActiveFirmId() || currentUser.firm_id;
  if (!fid) {
    sel.innerHTML = `<option value="">${t('ui.all_agents')}</option>`;
    return;
  }
  try {
    const users = await sb(`users?firm_id=eq.${fid}&select=id,name,role&order=name.asc`) || [];
    const trAll = t('ui.all_agents');
    sel.innerHTML = `<option value="">${trAll}</option>` + users.map(u => {
      const nm = String(u.name || u.id.slice(0, 8)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<option value="${u.id}">${nm}</option>`;
    }).join('');
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  } catch (e) {
    console.error(e);
  }
}

function _isTerminOutcome(o) {
  return o === 'appointment' || o === 'appointment_done';
}

function _dashCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function renderDashChart7d(logsByDay, labels, opts) {
  const canvas = document.getElementById('dash-chart-7d');
  if (!canvas || typeof Chart === 'undefined') return;
  const accent = _dashCssVar('--accent', '#2563eb');
  const border = _dashCssVar('--border', '#e2e8f0');
  if (window._dashChart7d) { window._dashChart7d.destroy(); window._dashChart7d = null; }
  window._dashChart7d = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: opts?.datasetLabel || t('dash.chart_calls'),
        data: logsByDay,
        borderColor: accent,
        backgroundColor: accent.length === 7 ? accent + '22' : 'rgba(37,99,235,0.12)',
        fill: opts?.fill !== false,
        tension: 0.35,
        pointRadius: labels.length <= 2 ? 5 : 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: !!opts?.showLegend } },
      scales: {
        x: {
          grid: { color: border },
          ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: opts?.maxTicksLimit || 14 }
        },
        y: { beginAtZero: true, grid: { color: border }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

/** Bugün — saatlik: çubuk = toplam çağrı, çizgi = termin */
function renderDashHourlyMixed(logs) {
  const canvas = document.getElementById('dash-chart-hourly');
  if (!canvas || typeof Chart === 'undefined') return;
  const hourly = Array(24).fill(0);
  const hourlyTermin = Array(24).fill(0);
  (logs || []).forEach(l => {
    if (!l.started_at) return;
    const h = typeof mbBerlinHour === 'function' ? mbBerlinHour(l.started_at) : new Date(l.started_at).getHours();
    if (h < 0 || h > 23) return;
    hourly[h]++;
    if (_isTerminOutcome(l.outcome)) hourlyTermin[h]++;
  });
  const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const accent = _dashCssVar('--accent', '#2563eb');
  const green = _dashCssVar('--green', '#16a34a');
  const border = _dashCssVar('--border', '#e2e8f0');
  if (window._dashChartHourly) { window._dashChartHourly.destroy(); window._dashChartHourly = null; }
  window._dashChartHourly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('dash.chart_calls'),
          data: hourly,
          backgroundColor: accent.length === 7 ? accent + '33' : 'rgba(37,99,235,0.2)',
          borderColor: accent,
          borderWidth: 1,
          order: 2,
          borderRadius: 4
        },
        {
          type: 'line',
          label: t('dash.chart_termin'),
          data: hourlyTermin,
          borderColor: green,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const tot = hourly[ctx.dataIndex] || 0;
              const te = hourlyTermin[ctx.dataIndex] || 0;
              if (!tot) return '';
              return tReplace('dash.chart_tooltip', { p: ((te / tot) * 100).toFixed(0) });
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: { stepSize: 1, font: { size: 11 } }
        }
      }
    }
  });
}

/** Hafta/ay/24 ay — günlük veya aylık çubuk + termin çizgisi */
function renderDashPeriodMixed(logs, rangeKey, from, to) {
  const canvas = document.getElementById('dash-chart-hourly');
  if (!canvas || typeof Chart === 'undefined') return;
  const accent = _dashCssVar('--accent', '#2563eb');
  const green = _dashCssVar('--green', '#16a34a');
  const border = _dashCssVar('--border', '#e2e8f0');
  let labels = [];
  let bar = [];
  let line = [];
  if (rangeKey === 'all') {
    const months = _monthKeysLastN(24);
    const keys = months.map(m => m.key);
    labels = months.map(m => m.label);
    bar = Array(keys.length).fill(0);
    line = Array(keys.length).fill(0);
    (logs || []).forEach(l => {
      const mk = _logMonthKey(l);
      const ix = keys.indexOf(mk);
      if (ix < 0) return;
      bar[ix]++;
      if (_isTerminOutcome(l.outcome)) line[ix]++;
    });
  } else {
    const days = _eachDayInRange(from, to);
    labels = days.map(d => {
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString(mbLocale(), { weekday: 'short', day: 'numeric' });
    });
    bar = days.map(d => (logs || []).filter(l => _logDayKey(l) === d).length);
    line = days.map(d => (logs || []).filter(l => _logDayKey(l) === d && _isTerminOutcome(l.outcome)).length);
  }
  if (window._dashChartHourly) { window._dashChartHourly.destroy(); window._dashChartHourly = null; }
  window._dashChartHourly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('dash.chart_calls'),
          data: bar,
          backgroundColor: accent.length === 7 ? accent + '33' : 'rgba(37,99,235,0.2)',
          borderColor: accent,
          borderWidth: 1,
          order: 2,
          borderRadius: 4
        },
        {
          type: 'line',
          label: t('dash.chart_termin_per_call'),
          data: line,
          borderColor: green,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          order: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              if (ctx.datasetIndex !== 0) return '';
              const tot = bar[ctx.dataIndex] || 0;
              const te = line[ctx.dataIndex] || 0;
              if (!tot) return '';
              return tReplace('dash.chart_tooltip', { p: ((te / tot) * 100).toFixed(0) });
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: rangeKey === 'month' ? 45 : 0, autoSkip: true, maxTicksLimit: rangeKey === 'month' ? 16 : 14, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: { stepSize: 1, font: { size: 11 } }
        }
      }
    }
  });
}

/** Termin randevuları — durum dağılımı (doughnut) */
function renderDashTerminDonut(appts) {
  const canvas = document.getElementById('dash-chart-outcomes');
  if (!canvas || typeof Chart === 'undefined') return;
  const isTr = currentLang === 'tr';
  const cat = {
    basarili: { n: 0, tr: 'Başarılı', de: 'Erfolgreich' },
    basarisiz: { n: 0, tr: 'Başarısız', de: 'Nicht erfolgreich' },
    beklemede: { n: 0, tr: 'Beklemede', de: 'Wartend' },
    qc_bekleniyor: { n: 0, tr: 'QC bekleniyor', de: 'QC ausstehend' },
    iptal: { n: 0, tr: 'İptal', de: 'Storniert' },
    other: { n: 0, tr: 'Diğer', de: 'Sonstige' }
  };
  (appts || []).forEach(a => {
    const k = String(a.durum || '').toLowerCase();
    if (cat[k]) cat[k].n++;
    else cat.other.n++;
  });
  const order = ['basarili', 'basarisiz', 'beklemede', 'qc_bekleniyor', 'iptal', 'other'];
  const labels = [];
  const data = [];
  const colors = [];
  const green = _dashCssVar('--green', '#16a34a');
  const yellow = _dashCssVar('--yellow', '#d97706');
  const red = _dashCssVar('--red', '#dc2626');
  const accent = _dashCssVar('--accent', '#2563eb');
  const muted = _dashCssVar('--text-3', '#9ca3af');
  const colorMap = {
    basarili: green,
    basarisiz: red,
    beklemede: yellow,
    qc_bekleniyor: accent,
    iptal: _dashCssVar('--text-2', '#6b7280'),
    other: muted
  };
  order.forEach(k => {
    if (cat[k].n > 0) {
      labels.push(isTr ? cat[k].tr : cat[k].de);
      data.push(cat[k].n);
      colors.push(colorMap[k]);
    }
  });
  if (window._dashChartOutcomes) { window._dashChartOutcomes.destroy(); window._dashChartOutcomes = null; }
  if (!data.length) {
    labels.push(t('dash.donut_no_data'));
    data.push(1);
    colors.push('#e5e7eb');
  }
  const sliceBorder = _dashCssVar('--bg-2', '#ffffff');
  window._dashChartOutcomes = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: sliceBorder, borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 4 } },
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            boxWidth: 10,
            font: { size: 10 },
            padding: 8,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              const lbl = ctx.label || '';
              return tReplace('dash.donut_tooltip_line', { lbl, v, s: t('dash.donut_appt_suffix') });
            }
          }
        }
      }
    }
  });
}

/** Üçüncü grafik: aralığa göre trend */
function renderDashTrendForRange(rangeKey, logs, from, to) {
  if (rangeKey === 'today') {
    const hourly = Array(24).fill(0);
    (logs || []).forEach(l => {
      if (!l.started_at) return;
      const h = typeof mbBerlinHour === 'function' ? mbBerlinHour(l.started_at) : new Date(l.started_at).getHours();
      if (h >= 0 && h <= 23) hourly[h]++;
    });
    const cum = [];
    let s = 0;
    for (let i = 0; i < 24; i++) {
      s += hourly[i];
      cum.push(s);
    }
    const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    renderDashChart7d(cum, labels, {
      datasetLabel: t('dash.cumulative_calls'),
      fill: true,
      maxTicksLimit: 12
    });
    return;
  }
  if (rangeKey === 'all') {
    const months = _monthKeysLastN(24);
    const keys = months.map(m => m.key);
    const counts = Array(keys.length).fill(0);
    (logs || []).forEach(l => {
      const mk = _logMonthKey(l);
      const ix = keys.indexOf(mk);
      if (ix >= 0) counts[ix]++;
    });
    renderDashChart7d(counts, months.map(m => m.label), { maxTicksLimit: 12 });
    return;
  }
  const days = _eachDayInRange(from, to);
  const counts = days.map(d => (logs || []).filter(l => _logDayKey(l) === d).length);
  const labels = days.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString(mbLocale(), { weekday: 'short', day: 'numeric' });
  });
  renderDashChart7d(counts, labels, { maxTicksLimit: rangeKey === 'month' ? 18 : 10 });
}

const MB_DASH_ROWS = ['brief', 'eom', 'jobs', 'analytics', 'trend', 'live'];
let _dashDragKey = '';

function mbDashRowKey() {
  const id = (typeof currentUser !== 'undefined' && currentUser?.id) ? currentUser.id : 'local';
  return `mb_dash_rows_${id}`;
}

function mbApplyDashRowOrder() {
  const page = document.getElementById('page-dashboard');
  const anchor = document.getElementById('dash-range-tabs');
  if (!page || !anchor) return;
  let order = MB_DASH_ROWS.slice();
  try {
    const saved = JSON.parse(localStorage.getItem(mbDashRowKey()) || '[]');
    if (Array.isArray(saved)) {
      const known = saved.filter((key) => MB_DASH_ROWS.includes(key));
      if (!known.includes('brief')) known.unshift('brief');
      order = known.concat(MB_DASH_ROWS.filter((key) => !known.includes(key)));
    }
  } catch (e) {}
  let after = anchor;
  order.forEach((key) => {
    const row = page.querySelector(`.dash-row[data-dash-row="${key}"]`);
    if (!row) return;
    after.after(row);
    after = row;
  });
}

function mbSaveDashRowOrder() {
  const keys = [...document.querySelectorAll('#page-dashboard .dash-row')]
    .map((row) => row.dataset.dashRow)
    .filter(Boolean);
  try { localStorage.setItem(mbDashRowKey(), JSON.stringify(keys)); } catch (e) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbResetDashRows() {
  try { localStorage.removeItem(mbDashRowKey()); } catch (e) {}
  if (typeof mbBriefCardKey === 'function') {
    try { localStorage.removeItem(mbBriefCardKey()); } catch (e) {}
  }
  mbApplyDashRowOrder();
  mbSyncDashRows();
  if (typeof mbPackBrief === 'function') mbPackBrief(document.getElementById('dash-brief'));
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
}

function mbSyncDashRows() {
  document.querySelectorAll('#page-dashboard .dash-row').forEach((row) => {
    const body = [...row.children].find((el) => !el.classList.contains('dash-row-handle'));
    const hidden = !!body && body.style.display === 'none';
    row.classList.toggle('is-off', hidden);
  });
}

function mbInitDashRows() {
  const page = document.getElementById('page-dashboard');
  if (!page || page.dataset.dashRowsReady === '1') return;
  page.dataset.dashRowsReady = '1';
  page.addEventListener('dragstart', (e) => {
    const handle = e.target.closest?.('.dash-row-handle');
    if (!handle || !page.contains(handle)) return;
    const row = handle.closest('.dash-row');
    if (!row) return;
    _dashDragKey = row.dataset.dashRow || '';
    row.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dashDragKey);
    }
  });
  page.addEventListener('dragend', () => {
    _dashDragKey = '';
    page.querySelectorAll('.dash-row').forEach((row) => row.classList.remove('is-dragging', 'is-drop'));
  });
  page.addEventListener('dragover', (e) => {
    if (!_dashDragKey) return;
    const row = e.target.closest?.('.dash-row');
    if (!row || row.classList.contains('is-off') || row.dataset.dashRow === _dashDragKey) return;
    e.preventDefault();
    page.querySelectorAll('.dash-row.is-drop').forEach((item) => {
      if (item !== row) item.classList.remove('is-drop');
    });
    row.classList.add('is-drop');
  });
  page.addEventListener('drop', (e) => {
    const row = e.target.closest?.('.dash-row');
    if (!row || !_dashDragKey || row.dataset.dashRow === _dashDragKey) return;
    e.preventDefault();
    const from = page.querySelector(`.dash-row[data-dash-row="${_dashDragKey}"]`);
    if (!from) return;
    const rect = row.getBoundingClientRect();
    if (e.clientY > rect.top + rect.height / 2) row.after(from);
    else row.before(from);
    row.classList.remove('is-drop');
    mbSaveDashRowOrder();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
  const watch = ['dash-eom-card', 'dash-job-market-kpi', 'dash-live-wrap'];
  const obs = new MutationObserver(() => mbSyncDashRows());
  watch.forEach((id) => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  });
}

async function loadDashboard() {
const storedRange = typeof mbReadReportRange === 'function' ? mbReadReportRange() : null;
if (storedRange && ['today', 'week', 'month', 'all'].includes(storedRange.mode)) mbPaintReportRange(storedRange);
mbInitDashRows();
mbApplyDashRowOrder();
const dashRole = typeof mbDashRole === 'function' ? mbDashRole() : 'agent';
const pageDash = document.getElementById('page-dashboard');
if (pageDash) pageDash.dataset.dashRole = dashRole;
renderFirmSelector('dash-firm-selector', loadDashboard);
await populateDashAgentSelect();
const { ff, agentQ, onlySelf } = _dashLogFilter();
let dashLogs = [];
const costEl = document.getElementById('dash-stat-cost');
const liveWrap = document.getElementById('dash-live-wrap');
const subEl = document.getElementById('dash-chart-sub');
if (costEl) costEl.style.display = onlySelf ? 'none' : '';
const showLive = ['admin', 'super_admin', 'firm_admin'].includes(currentUser?.role || '');
if (liveWrap) liveWrap.style.display = showLive ? '' : 'none';
document.querySelectorAll('.dash-range-btn').forEach(b => {
  b.classList.toggle('active', b.dataset.dashRange === _dashGetRange());
});
const { from, to, range: rangeKey } = _dashDateBounds();
_dashUpdateStatLabels(rangeKey);
_dashUpdateCardTitles(rangeKey);
if (onlySelf && subEl) {
  subEl.textContent = t('dash.sub_agent_calls');
}
const now = new Date();
const today = now.toISOString().split('T')[0];
document.getElementById('dash-date').textContent =
now.toLocaleDateString(mbLocale(), {weekday:'long',day:'numeric',month:'long',year:'numeric'});
const isTr = currentLang === 'tr';
const rangeSuffix =
  rangeKey === 'today'
    ? (isTr ? 'bugün' : 'heute')
    : rangeKey === 'week'
      ? (isTr ? 'bu hafta' : 'diese Woche')
      : rangeKey === 'month'
        ? (isTr ? 'bu ay' : 'diesen Monat')
        : (isTr ? 'seçili aralık' : 'Zeitraum');
if (dashRole === 'field') {
  document.querySelectorAll('[data-dash-row="analytics"],[data-dash-row="trend"],[data-dash-row="live"],[data-dash-row="jobs"]').forEach((el) => { el.style.display = 'none'; });
  if (costEl) costEl.style.display = 'none';
  const talkCard = document.getElementById('d-talk')?.closest('.stat-card');
  if (talkCard) talkCard.style.display = 'none';
  try { await mbPaintFieldDash(from, to); } catch (e) { console.warn('field dash', e); }
  if (typeof loadDashCompetitionCard === 'function') {
    try { await loadDashCompetitionCard(); } catch (e) {}
  }
  if (typeof loadDashBrief === 'function') {
    try { await loadDashBrief({ logs: [], ff, agentQ, rangeKey, from, to }); } catch (e) {}
  }
  if (typeof mbSyncDashRows === 'function') mbSyncDashRows();
  return;
}
window._dashLogsReady = false;
window._dashPendingLogs = null;
const dashSeed = {
  opsP: (dashRole === 'super' || dashRole === 'firm') && typeof mbDashOps === 'function' ? mbDashOps(ff) : Promise.resolve(null),
  goalsP: (dashRole === 'super' || dashRole === 'firm' || dashRole === 'agent') && typeof mbDashGoalsData === 'function' ? mbDashGoalsData(ff, agentQ, dashRole) : Promise.resolve(null),
  usersP: (dashRole === 'super' || dashRole === 'firm') ? sb(`users?select=id,name&is_active=eq.true${ff}&limit=300`).catch(() => []) : Promise.resolve([]),
};
const dashCurP = typeof getFirmCurrency === 'function' ? getFirmCurrency() : Promise.resolve('EUR');
const briefShell = typeof loadDashBrief === 'function'
  ? loadDashBrief({ logs: [], ff, agentQ, rangeKey, from, to, seed: dashSeed }).catch((e) => console.warn('brief', e))
  : Promise.resolve();
try {
const logGte = typeof mbInstantGte === 'function' ? mbInstantGte(from) : `${from}T00:00:00`;
const logLte = typeof mbInstantLte === 'function' ? mbInstantLte(to) : `${to}T23:59:59`;
let qLogs = `call_logs?select=*&started_at=gte.${logGte}&started_at=lte.${logLte}`;
qLogs += ff;
qLogs += agentQ;
qLogs += '&limit=8000';
const logs  = await sb(qLogs) || [];
if (dashRole === 'qc') {
  logs.splice(0, logs.length, ...logs.filter((l) => l.outcome === 'appointment' || l.outcome === 'appointment_done'));
}
dashLogs = logs;
window._dashPendingLogs = logs;
window._dashLogsReady = true;
if (rangeKey === 'today') {
  renderDashHourlyMixed(logs);
} else {
  renderDashPeriodMixed(logs, rangeKey, from, to);
}
const apptRows = await fetchDashAppointmentsInRange(from, to, ff, agentQ);
renderDashTerminDonut(apptRows);
renderDashTrendForRange(rangeKey, logs, from, to);
const total = logs.length;
const appts = logs.filter(l=>_isTerminOutcome(l.outcome)).length;
const cbs   = logs.filter(l=>l.outcome==='callback').length;
const vms   = logs.filter(l=>l.amd_result==='machine').length;
const cost  = logs.reduce((s,l)=>s+(l.cost_usd||0),0);
const talk  = logs.reduce((s,l)=>s+(l.duration_sec||0),0);
document.getElementById('d-calls').textContent  = total;
document.getElementById('d-appt').textContent   = appts;
document.getElementById('d-cb').textContent     = cbs;
document.getElementById('d-vm').textContent     = vms;
const dashCur = await dashCurP;
document.getElementById('d-cost').textContent = typeof formatMoney === 'function' ? formatMoney(cost, dashCur) : `${Number(cost || 0).toFixed(2)} €`;
const talkMin = Math.floor(talk/60);
document.getElementById('d-talk').textContent   = isTr ? `${talkMin}dk` : `${talkMin} Min`;
const callWord = isTr ? 'çağrı' : (total === 1 ? 'Anruf' : 'Anrufe');
document.getElementById('d-calls-m').textContent= `${total} ${callWord} ${rangeSuffix}`;
document.getElementById('d-appt-m').textContent = total > 0
  ? (isTr ? `%${((appts / total) * 100).toFixed(1)} dönüşüm` : `${((appts / total) * 100).toFixed(1)}% Quote`)
  : (isTr ? '%0 dönüşüm' : '0% Quote');
document.getElementById('d-avg').textContent    = isTr
  ? `ort. ${total > 0 ? Math.round(talk / total) : 0}sn/çağrı`
  : `Ø ${total > 0 ? Math.round(talk / total) : 0}s/Anruf`;
} catch(e){
  console.error(e);
  renderDashHourlyMixed([]);
  renderDashTerminDonut([]);
  renderDashChart7d([0], ['—']);
  const errSub = document.getElementById('dash-chart-sub');
  if (errSub) errSub.textContent = (typeof t === 'function' ? t('ui.error_prefix') : 'Hata: ') + (e?.message || '');
}
const dashTail = [];
if (showLive) dashTail.push(renderDashLiveAgents().catch((e) => console.warn('live', e)));
if (typeof loadDashCompetitionCard === 'function') dashTail.push(loadDashCompetitionCard().catch((e) => console.warn('comp', e)));
if (typeof loadJobMarketKpi === 'function') dashTail.push(loadJobMarketKpi().catch(() => {}));
if (typeof loadJobFinanceSummary === 'function') dashTail.push(loadJobFinanceSummary().catch(() => {}));
dashTail.push(briefShell.then(() => (typeof mbDashApplyLogs === 'function' ? mbDashApplyLogs({ logs: dashLogs, ff, agentQ, rangeKey, from, to }) : null)).catch((e) => console.warn('brief', e)));
await Promise.all(dashTail);
if (typeof mbSyncDashRows === 'function') mbSyncDashRows();
}

const STATS_COL = 11;
const STATS_STD = ['appointment', 'negative', 'callback', 'no_answer', 'voicemail', 'dnc'];
const STATS_CAP = 5000;

function statsEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v ?? '') : String(v ?? '');
}

function statsClock(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function statsMonday(iso) {
  const p = String(iso || '').split('-').map(Number);
  if (p.length < 3 || !p[0]) return iso;
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return typeof mbShiftDate === 'function' ? mbShiftDate(iso, -back) : iso;
}

function statsFirmSuffix(firmId) {
  if (getActiveFirmId() || !firmId) return '';
  const firm = (typeof _allFirms !== 'undefined' ? _allFirms : []).find((f) => f.id === firmId);
  return firm?.name ? ` · ${firm.name}` : '';
}

async function statsFillSelect(id, sig, rows, trLabel, deLabel) {
  const sel = document.getElementById(id);
  if (!sel) return;
  if (sel.dataset.sig === sig && sel.options.length > 1) return;
  const prev = sel.value;
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const opts = (rows || []).map((row) => `<option value="${statsEsc(row.id)}">${statsEsc(row.name)}</option>`).join('');
  sel.innerHTML = `<option value="" data-tr="${statsEsc(trLabel)}" data-de="${statsEsc(deLabel)}">${statsEsc(de ? deLabel : trLabel)}</option>${opts}`;
  sel.dataset.sig = sig;
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else sel.value = '';
}

async function statsFillFilters(fid) {
  const sig = fid || 'all';
  try {
    let cq = 'campaigns?select=id,name,firm_id&order=name.asc&limit=500';
    if (fid) cq += `&firm_id=eq.${fid}`;
    const camps = (await sb(cq).catch(() => [])) || [];
    await statsFillSelect('stats-camp-f', `c:${sig}:${camps.length}`, camps.map((c) => ({
      id: c.id,
      name: `${c.name || '—'}${statsFirmSuffix(c.firm_id)}`,
    })), 'Tüm Kampanyalar', 'Alle Kampagnen');
  } catch (e) { console.warn('stats camps', e); }
  try {
    let uq = 'users?select=id,name,firm_id&order=name.asc&limit=400';
    if (fid) uq += `&firm_id=eq.${fid}`;
    const users = (await sb(uq).catch(() => [])) || [];
    await statsFillSelect('stats-agent-f', `u:${sig}:${users.length}`, users.map((u) => ({
      id: u.id,
      name: `${u.name || '—'}${statsFirmSuffix(u.firm_id)}`,
    })), 'Tüm temsilciler', 'Alle Agenten');
  } catch (e) { console.warn('stats agents', e); }
}

async function statsPullLogs(ff, gte, lte, camp, agent) {
  const tail = `${ff}&started_at=gte.${gte}&started_at=lte.${lte}${camp ? `&campaign_id=eq.${camp}` : ''}${agent ? `&agent_id=eq.${agent}` : ''}&order=started_at.desc`;
  const rich = `call_logs?select=id,outcome,agent_id,campaign_id,firm_id,duration_sec,started_at,phone,users(id,name,role),campaigns(id,name)${tail}`;
  const plain = `call_logs?select=id,outcome,agent_id,campaign_id,firm_id,duration_sec${tail}`;
  let usePlain = false;
  const all = [];
  let off = 0;
  while (off < STATS_CAP) {
    const size = Math.min(1000, STATS_CAP - off);
    const q = `${usePlain ? plain : rich}&limit=${size}&offset=${off}`;
    let rows;
    try {
      rows = (await sb(q)) || [];
    } catch (e) {
      if (!usePlain && off === 0) { usePlain = true; continue; }
      throw e;
    }
    all.push(...rows);
    if (rows.length < size) return { rows: all, capped: false };
    off += rows.length;
  }
  return { rows: all, capped: true };
}

function statsOutcomeKey(outcome) {
  const key = String(outcome || '').trim();
  if (key === 'appointment_done') return 'appointment';
  return key;
}

async function statsOutcomeLabels(campIds) {
  const map = {};
  const ids = [...new Set((campIds || []).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const rows = (await sb(`campaigns?select=id,settings&id=in.(${chunk.join(',')})`).catch(() => [])) || [];
    rows.forEach((camp) => {
      let settings = camp.settings;
      if (typeof settings === 'string') {
        try { settings = JSON.parse(settings); } catch (e) { settings = {}; }
      }
      (settings?.outcomes || []).forEach((row) => {
        const key = statsOutcomeKey(row?.key);
        const label = String(row?.label || '').trim();
        if (!key || !label) return;
        if (!map[key]) map[key] = [];
        if (!map[key].includes(label)) map[key].push(label);
      });
    });
  }
  return map;
}

function statsExtraLabel(key, labelMap) {
  const labels = labelMap?.[key] || [];
  if (labels.length) return labels.join(' / ');
  if (!key) return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'Ohne Ergebnis' : 'Sonuç yok';
  return key;
}

let _statsRows = [];
let _statsExtras = [];
let _statsSort = { key: 'calls', dir: 'desc' };
let _statsFilters = {};

function statsColumns(extras) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const pair = (key, tr, deLabel, type) => ({ key, tr, de: deLabel, label: de ? deLabel : tr, type });
  return [
    pair('agent', 'Agent', 'Agent', 'text'),
    pair('camp', 'Kampanya', 'Kampagne', 'text'),
    pair('calls', 'Aramalar', 'Anrufe', 'num'),
    pair('appointment', 'Randevu', 'Termin', 'num'),
    pair('negative', 'Olumsuz', 'Negativ', 'num'),
    pair('callback', 'Geri Ara', 'Rückruf', 'num'),
    pair('no_answer', 'Cevap Yok', 'Kein Anspr.', 'num'),
    pair('voicemail', 'Telesekreter', 'Mailbox', 'num'),
    pair('dnc', 'Kara liste', 'Sperrliste', 'num'),
  ].concat((extras || []).map((col) => ({
    key: `x:${col.key}`,
    extra: col.key,
    tr: col.label,
    de: col.label,
    label: col.label,
    type: 'num',
  }))).concat([
    pair('avg', 'Ort. Süre', 'Ø Dauer', 'num'),
    pair('conv', 'Dönüşüm', 'Konversion', 'num'),
  ]);
}

function statsCellText(row, col) {
  if (col.key === 'avg') return statsClock(row.avg);
  if (col.key === 'conv') return `${row.conv}%`;
  if (col.extra) return String(row.extra[col.extra] || 0);
  const v = row[col.key];
  return v == null ? '' : String(v);
}

function statsCellNum(row, col) {
  if (col.extra) return Number(row.extra[col.extra] || 0);
  return Number(row[col.key] || 0);
}

function statsRenderHead(extras) {
  const head = document.querySelector('#page-stats thead');
  if (!head) return;
  const cols = statsColumns(extras);
  head.innerHTML = `<tr>${cols.map((col) => {
    const on = _statsSort.key === col.key;
    const mark = on ? (_statsSort.dir === 'desc' ? '▼' : '▲') : '';
    const val = statsEsc(_statsFilters[col.key] || '');
    return `<th data-label="${statsEsc(col.label)}" data-tr="${statsEsc(col.tr)}" data-de="${statsEsc(col.de)}">
<button type="button" class="stats-sort${on ? ' is-on' : ''}" data-sort="${statsEsc(col.key)}">${statsEsc(col.label)} <span class="stats-sort-mark">${mark}</span></button>
<input class="camp-col-filter" data-filter="${statsEsc(col.key)}" value="${val}" aria-label="${statsEsc(col.label)}">
</th>`;
  }).join('')}</tr>`;
  head.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.onclick = () => statsSortBy(btn.dataset.sort);
  });
  head.querySelectorAll('[data-filter]').forEach((inp) => {
    inp.oninput = () => {
      _statsFilters[inp.dataset.filter] = inp.value;
      statsPaintBody();
    };
  });
}

function statsSortBy(key) {
  if (_statsSort.key === key && _statsSort.dir === 'desc') _statsSort = { key, dir: 'asc' };
  else _statsSort = { key, dir: 'desc' };
  document.querySelectorAll('#page-stats [data-sort]').forEach((btn) => {
    const on = btn.dataset.sort === _statsSort.key;
    btn.classList.toggle('is-on', on);
    const mark = btn.querySelector('.stats-sort-mark');
    if (mark) mark.textContent = on ? (_statsSort.dir === 'desc' ? '▼' : '▲') : '';
  });
  statsPaintBody();
}

function statsPaintBody() {
  const tbody = document.getElementById('stats-tbody');
  if (!tbody) return;
  const cols = statsColumns(_statsExtras);
  const colCount = cols.length;
  const filtered = _statsRows.filter((row) => cols.every((col) => {
    const q = String(_statsFilters[col.key] || '').trim().toLocaleLowerCase('tr');
    if (!q) return true;
    return statsCellText(row, col).toLocaleLowerCase('tr').includes(q);
  }));
  const dir = _statsSort.dir === 'asc' ? 1 : -1;
  const sortCol = cols.find((col) => col.key === _statsSort.key) || cols.find((col) => col.key === 'calls');
  filtered.sort((a, b) => {
    if (!sortCol) return 0;
    if (sortCol.type === 'num') return (statsCellNum(a, sortCol) - statsCellNum(b, sortCol)) * dir;
    return statsCellText(a, sortCol).localeCompare(statsCellText(b, sortCol), 'tr') * dir;
  });
  const setSum = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (!filtered.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(colCount, 'ui.no_data_range') : `<tr><td colspan="${colCount}" class="mb-empty-hint">${t('ui.no_data_range')}</td></tr>`;
    setSum('stats-sum-calls', '0');
    setSum('stats-sum-appt', '0');
    setSum('stats-sum-neg', '0');
    setSum('stats-sum-conv', '0%');
    setSum('stats-sum-avg', '0:00');
    return;
  }
  const tot = { calls: 0, appointment: 0, negative: 0, callback: 0, no_answer: 0, voicemail: 0, dnc: 0, sec: 0, extra: {} };
  _statsExtras.forEach((col) => { tot.extra[col.key] = 0; });
  const body = filtered.map((row) => {
    tot.calls += row.calls;
    tot.appointment += row.appointment;
    tot.negative += row.negative;
    tot.callback += row.callback;
    tot.no_answer += row.no_answer;
    tot.voicemail += row.voicemail;
    tot.dnc += row.dnc;
    tot.sec += row.sec;
    _statsExtras.forEach((col) => { tot.extra[col.key] += Number(row.extra[col.key] || 0); });
    const num = (n, badge) => badge ? `<td><span class="badge ${badge}">${n}</span></td>` : `<td class="td-mono">${n}</td>`;
    return `<tr>
<td style="font-weight:700;">${statsEsc(row.agent)}</td>
<td style="font-size:11px;">${statsEsc(row.camp)}</td>
${num(row.calls)}
${num(row.appointment, 'badge-green')}
${num(row.negative, 'badge-red')}
${num(row.callback, 'badge-yellow')}
${num(row.no_answer, 'badge-gray')}
${num(row.voicemail, 'badge-gray')}
${num(row.dnc, 'badge-red')}
${_statsExtras.map((col) => num(row.extra[col.key] || 0)).join('')}
<td class="td-mono">${statsClock(row.avg)}</td>
<td><span style="font-weight:800;color:${row.conv >= 20 ? 'var(--green)' : row.conv >= 10 ? 'var(--yellow)' : 'var(--red)'};">${row.conv}%</span></td>
</tr>`;
  }).join('');
  const avgAll = tot.calls ? tot.sec / tot.calls : 0;
  const convAll = tot.calls ? Math.round(tot.appointment / tot.calls * 100) : 0;
  tbody.innerHTML = body + `<tr style="background:var(--bg-3);font-weight:800;border-top:2px solid var(--border);">
<td colspan="2" style="font-size:12px;font-weight:800;">${typeof t === 'function' ? t('stats.total') : 'TOPLAM'}</td>
<td class="td-mono">${tot.calls}</td>
<td><span class="badge badge-green">${tot.appointment}</span></td>
<td><span class="badge badge-red">${tot.negative}</span></td>
<td><span class="badge badge-yellow">${tot.callback}</span></td>
<td><span class="badge badge-gray">${tot.no_answer}</span></td>
<td><span class="badge badge-gray">${tot.voicemail}</span></td>
<td><span class="badge badge-red">${tot.dnc}</span></td>
${_statsExtras.map((col) => `<td class="td-mono">${tot.extra[col.key] || 0}</td>`).join('')}
<td class="td-mono">${statsClock(avgAll)}</td>
<td><span style="font-weight:800;color:var(--accent);">${convAll}%</span></td>
</tr>`;
  setSum('stats-sum-calls', String(tot.calls));
  setSum('stats-sum-appt', String(tot.appointment));
  setSum('stats-sum-neg', String(tot.negative));
  setSum('stats-sum-conv', `${convAll}%`);
  setSum('stats-sum-avg', statsClock(avgAll));
}

function statsCurrentRange() {
  const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : null;
  const ff = typeof getFirmFilter === 'function' ? getFirmFilter('&') : '';
  const dateFilter = document.getElementById('stats-date-f')?.value || 'today';
  const camp = document.getElementById('stats-camp-f')?.value || '';
  const agent = document.getElementById('stats-agent-f')?.value || '';
  const todayBiz = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
  let dateFrom = todayBiz;
  let dateTo = todayBiz;
  if (dateFilter === 'week') dateFrom = statsMonday(todayBiz);
  else if (dateFilter === 'month') dateFrom = `${String(todayBiz).slice(0, 8)}01`;
  else if (dateFilter === 'year') dateFrom = `${String(todayBiz).slice(0, 4)}-01-01`;
  else if (dateFilter === 'all') dateFrom = '2020-01-01';
  else if (dateFilter === 'custom') {
    dateFrom = document.getElementById('stats-date-from')?.value || dateFrom;
    dateTo = document.getElementById('stats-date-to')?.value || dateTo;
  }
  if (dateTo < dateFrom) { const swap = dateFrom; dateFrom = dateTo; dateTo = swap; }
  const gte = typeof mbInstantGte === 'function' ? mbInstantGte(dateFrom) : `${dateFrom}T00:00:00`;
  const lte = typeof mbInstantLte === 'function' ? mbInstantLte(dateTo) : `${dateTo}T23:59:59`;
  return { fid, ff, camp, agent, dateFrom, dateTo, gte, lte };
}

async function loadStats() {
if (typeof mbSyncStatsChrome === 'function') mbSyncStatsChrome();
if (window._statsReport && window._statsReport !== 'overview') return loadStatsReport();
renderFirmSelector('stats-firm-selector', loadStats);
const tbody = document.getElementById('stats-tbody');
if (tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(STATS_COL) : `<tr><td colspan="${STATS_COL}" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
try {
const range = statsCurrentRange();
const fid = range.fid;
await statsFillFilters(fid);
const ff = range.ff;
const campFilter = range.camp;
const agentFilter = range.agent;
const statsGte = range.gte;
const statsLte = range.lte;
const pulled = await statsPullLogs(ff, statsGte, statsLte, campFilter, agentFilter);
const logs = pulled.rows || [];
const capEl = document.getElementById('stats-cap');
if (capEl) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  capEl.style.display = pulled.capped ? '' : 'none';
  capEl.textContent = pulled.capped
    ? (de ? `Nur die letzten ${STATS_CAP} Anrufe. Zeitraum eingrenzen.` : `Son ${STATS_CAP} arama gösteriliyor. Aralığı daralt.`)
    : '';
}
const groups = {};
if (typeof mbWarmCampShown === 'function') await mbWarmCampShown(logs.map((l) => l.campaign_id));
logs.forEach(l => {
const agentId = l.agent_id || 'unknown';
const campId  = l.campaign_id || 'unknown';
const key = `${agentId}__${campId}`;
if (!groups[key]) groups[key] = {
agent_id: agentId,
agent_name: l.users?.name || '',
campaign_id: campId,
campaign_name: (typeof mbCampShown === 'function' ? mbCampShown(l.campaigns, l.campaign_id) : (l.campaigns?.name || '')),
firm_id: l.firm_id || null,
logs: []
};
if (!groups[key].agent_name && l.users?.name) groups[key].agent_name = l.users.name;
if (!groups[key].campaign_name && l.campaigns?.name) groups[key].campaign_name = typeof mbCampShown === 'function' ? mbCampShown(l.campaigns, l.campaign_id) : l.campaigns.name;
groups[key].logs.push(l);
});
const rows = Object.values(groups).sort((a, b) => (b.logs.length - a.logs.length) || String(a.agent_name).localeCompare(String(b.agent_name), 'tr'));
const labelMap = await statsOutcomeLabels(logs.map((l) => l.campaign_id));
const extraCounts = {};
logs.forEach((l) => {
  const key = statsOutcomeKey(l.outcome);
  if (STATS_STD.includes(key)) return;
  extraCounts[key] = (extraCounts[key] || 0) + 1;
});
if (campFilter) {
  Object.keys(labelMap).forEach((key) => {
    if (!STATS_STD.includes(key) && extraCounts[key] == null) extraCounts[key] = 0;
  });
}
const extras = Object.keys(extraCounts)
  .sort((a, b) => (extraCounts[b] - extraCounts[a]) || statsExtraLabel(a, labelMap).localeCompare(statsExtraLabel(b, labelMap), 'tr'))
  .map((key) => ({ key, label: statsExtraLabel(key, labelMap) }));
const countOf = (ls, key) => ls.filter((l) => statsOutcomeKey(l.outcome) === key).length;
_statsExtras = extras;
_statsRows = rows.map((r) => {
  const ls = r.logs;
  const calls = ls.length;
  const sec = ls.reduce((s, l) => s + (l.duration_sec || l.duration_seconds || 0), 0);
  const extra = {};
  extras.forEach((col) => { extra[col.key] = countOf(ls, col.key); });
  return {
    agent: `${r.agent_name || String(r.agent_id).slice(0, 8)}${statsFirmSuffix(r.firm_id)}`,
    camp: r.campaign_name || (r.campaign_id === 'unknown' ? '—' : String(r.campaign_id).slice(0, 8)),
    calls,
    appointment: countOf(ls, 'appointment'),
    negative: countOf(ls, 'negative'),
    callback: countOf(ls, 'callback'),
    no_answer: countOf(ls, 'no_answer'),
    voicemail: countOf(ls, 'voicemail'),
    dnc: countOf(ls, 'dnc'),
    sec,
    avg: calls ? Math.round(sec / calls) : 0,
    conv: calls ? Math.round(countOf(ls, 'appointment') / calls * 100) : 0,
    extra,
  };
});
statsRenderHead(extras);
statsPaintBody();
window._statsLabelMap = labelMap;
void statsPaintDetail(logs, fid);
} catch(e){ console.error(e); if(tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(STATS_COL, t('ui.error_prefix') + (e?.message || t('ui.unknown_error'))) : `<tr><td colspan="${STATS_COL}" class="mb-empty-hint" style="color:var(--red);">${typeof escapeHtml === 'function' ? escapeHtml(t('ui.error_prefix') + (e?.message || t('ui.unknown_error'))) : ''}</td></tr>`; }
}

function statsHms(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function statsBerlinHour(iso) {
  if (typeof mbBerlinHour === 'function') return mbBerlinHour(iso);
  try {
    const h = new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' });
    return Number(String(h).slice(0, 2));
  } catch (_) {
    return new Date(iso).getHours();
  }
}

function statsMatchRate(phone, rates) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const list = (rates || []).slice().sort((a, b) => String(b.prefix || '').length - String(a.prefix || '').length);
  return list.find((r) => digits.startsWith(String(r.prefix || '').replace(/\D/g, ''))) || null;
}

async function statsPaintDetail(logs, fid) {
  const host = document.getElementById('stats-detail');
  if (!host) return;
  const rows = logs || [];
  const byOut = {};
  const hours = Array.from({ length: 24 }, () => ({ n: 0, appt: 0 }));
  const byRole = {};
  rows.forEach((l) => {
    const key = statsOutcomeKey(l.outcome) || 'other';
    if (!byOut[key]) byOut[key] = { n: 0, sec: 0 };
    byOut[key].n += 1;
    byOut[key].sec += Number(l.duration_sec) || 0;
    if (l.started_at) {
      const h = statsBerlinHour(l.started_at);
      if (h >= 0 && h <= 23) {
        hours[h].n += 1;
        if (key === 'appointment') hours[h].appt += 1;
      }
    }
    const role = l.users?.role || 'agent';
    if (!byRole[role]) byRole[role] = { n: 0, appt: 0, sec: 0 };
    byRole[role].n += 1;
    byRole[role].sec += Number(l.duration_sec) || 0;
    if (key === 'appointment') byRole[role].appt += 1;
  });
  const total = rows.length || 1;
  const outRows = Object.keys(byOut).sort((a, b) => byOut[b].n - byOut[a].n).map((key) => {
    const label = (typeof chOutcomeText === 'function' ? chOutcomeText(key, window._statsLabelMap) : '') || key;
    const share = Math.round(byOut[key].n / total * 100);
    return `<tr><td>${statsEsc(label)}</td><td>${byOut[key].n}</td><td>${statsEsc(statsHms(byOut[key].sec))}</td><td>${share}%</td></tr>`;
  }).join('');
  const maxHour = Math.max(1, ...hours.map((h) => h.n));
  const hourRows = hours.map((h, i) => ({ i, ...h })).filter((h) => h.n > 0).map((h) => {
    const w = Math.round(h.n / maxHour * 100);
    return `<div class="stats-hour"><span>${String(h.i).padStart(2, '0')}:00</span><span class="stats-hour-track"><span class="stats-hour-bar" style="width:${w}%"></span></span><span>${h.n}</span><span>${h.appt} ${statsEsc(t('stats.appt_short'))}</span></div>`;
  }).join('');
  const roleRows = Object.keys(byRole).sort().map((role) => {
    const label = typeof firmRoleLabel === 'function' ? firmRoleLabel(role) : role;
    return `<tr><td>${statsEsc(label)}</td><td>${byRole[role].n}</td><td>${byRole[role].appt}</td><td>${statsEsc(statsHms(byRole[role].sec))}</td></tr>`;
  }).join('');
  let costRows = `<tr><td colspan="4">${statsEsc(t('stats.cost_empty'))}</td></tr>`;
  if (fid) {
    const firms = await sb(`firms?id=eq.${fid}&select=settings,currency`).catch(() => []);
    const firm = firms?.[0] || {};
    const rates = firm.settings?.billing?.rates;
    const cur = typeof normalizeCurrency === 'function' ? normalizeCurrency(firm.currency) : (firm.currency || 'EUR');
    if (Array.isArray(rates) && rates.length) {
      const bag = {};
      rows.forEach((l) => {
        const rate = statsMatchRate(l.phone, rates);
        if (!rate) return;
        const id = `${rate.prefix}|${rate.name || ''}`;
        if (!bag[id]) bag[id] = { name: rate.name || rate.prefix, prefix: rate.prefix, price: Number(rate.price) || 0, sec: 0 };
        bag[id].sec += Number(l.duration_sec) || 0;
      });
      const lines = Object.values(bag);
      if (lines.length) {
        costRows = lines.map((line) => {
          const money = (line.sec / 60) * line.price;
          const shown = typeof formatMoney === 'function' ? formatMoney(money, cur) : money.toFixed(2);
          return `<tr><td>${statsEsc(line.prefix)}</td><td>${statsEsc(line.name)}</td><td>${statsEsc(statsHms(line.sec))}</td><td>${statsEsc(shown)}</td></tr>`;
        }).join('');
      }
    }
  }
  host.innerHTML = `
<div class="card"><div class="card-title">${statsEsc(t('stats.out_title'))}</div>
<div class="tbl-wrap"><table><thead><tr><th>${statsEsc(t('stats.col.result'))}</th><th>${statsEsc(t('stats.col.count'))}</th><th>${statsEsc(t('stats.col.time'))}</th><th>%</th></tr></thead><tbody>${outRows || `<tr><td colspan="4">${statsEsc(t('stats.none'))}</td></tr>`}</tbody></table></div></div>
<div class="card"><div class="card-title">${statsEsc(t('stats.hour_title'))}</div>
<div class="stats-hours">${hourRows || `<div class="firm-none">${statsEsc(t('stats.none'))}</div>`}</div></div>
<div class="card"><div class="card-title">${statsEsc(t('stats.role_title'))}</div>
<div class="tbl-wrap"><table><thead><tr><th>${statsEsc(t('stats.col.role'))}</th><th>${statsEsc(t('stats.col.count'))}</th><th>${statsEsc(t('stats.appt_short'))}</th><th>${statsEsc(t('stats.col.time'))}</th></tr></thead><tbody>${roleRows || `<tr><td colspan="4">${statsEsc(t('stats.none'))}</td></tr>`}</tbody></table></div></div>
<div class="card"><div class="card-title">${statsEsc(t('stats.cost_title'))}</div>
<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${statsEsc(t('stats.cost_hint'))}</div>
<div class="tbl-wrap"><table><thead><tr><th>${statsEsc(t('stats.col.prefix'))}</th><th>${statsEsc(t('stats.col.dest'))}</th><th>${statsEsc(t('stats.col.time'))}</th><th>${statsEsc(t('stats.col.cost'))}</th></tr></thead><tbody>${costRows}</tbody></table></div></div>`;
}

const CH_CAP = 5000;
let _chRows = [];
let _chSort = { key: 'when', dir: 'desc' };
let _chFilters = {};
let _chLabelMap = {};
let _chLoadGen = 0;

function chWhen(iso) {
  if (!iso) return '—';
  if (typeof mbFormatWall === 'function') {
    return mbFormatWall(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function chStdOutcome(key) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const tr = { appointment: 'Randevu', negative: 'Olumsuz', callback: 'Geri Ara', voicemail: 'Telesekreter', no_answer: 'Cevap Yok', dnc: 'Kara Liste' };
  const deMap = { appointment: 'Termin', negative: 'Negativ', callback: 'Rückruf', voicemail: 'Mailbox', no_answer: 'Keine Antwort', dnc: 'Sperrliste' };
  return (de ? deMap : tr)[statsOutcomeKey(key)] || '';
}

function chOutcomeText(key, labelMap) {
  const std = chStdOutcome(key);
  if (std) return std;
  const extra = statsExtraLabel(statsOutcomeKey(key), labelMap || _chLabelMap);
  if (extra && !String(extra).startsWith('custom_') && extra !== key) return extra;
  if (typeof mbOutcomeShown === 'function') {
    const named = mbOutcomeShown(key);
    if (named) return named;
  }
  return extra && !String(extra).startsWith('custom_') ? extra : (extra === key ? extra : (extra || '—'));
}

function chNoteText(raw) {
  return String(raw || '').replace(/__test_sim__/g, ' ').replace(/\s+/g, ' ').trim();
}

function chDurSec(l) {
  return Math.max(0, Number(l?.duration_sec ?? l?.duration_seconds ?? 0) || 0);
}

function chIsFakeRec(l) {
  if (typeof _isFakeRecordingRow === 'function') return _isFakeRecordingRow(l);
  if (String(l?.recording_url || '').trim()) return false;
  const notesRaw = String(l?.notes || '');
  if (l?.is_test === true || l?.is_inbound_test === true || notesRaw.includes('__test_sim__')) return true;
  if (typeof _testMode !== 'undefined' && _testMode) {
    const dur = chDurSec(l);
    if (dur >= 1 && dur <= 900 && !String(l?.telnyx_call_id || '').trim()) return true;
  }
  return false;
}

function chRecHtml(l) {
  const id = statsEsc(l.id);
  if (l.recording_url) {
    const src = statsEsc(l.recording_url);
    const dl = statsEsc(typeof t === 'function' ? t('ch.rec.download') : 'Kaydı indir');
    return `<div style="display:flex;align-items:center;gap:6px;"><audio id="ch-aud-${id}" src="${src}" preload="none" style="display:none;"></audio><button type="button" onclick="toggleAudio('ch-aud-${id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;color:var(--text-2);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;"><i class="ph ph-play"></i></button><a class="ch-rec-dl" href="${src}" download="kayit-${id}.mp3" target="_blank" rel="noopener" title="${dl}" aria-label="${dl}"><i class="ph ph-download-simple"></i>${dl}</a></div>`;
  }
  if (chIsFakeRec(l) && typeof _fakeRecordingMarkup === 'function') return _fakeRecordingMarkup(l, 'chhist');
  return '<span style="color:var(--text-3);font-size:11px;">—</span>';
}

function chCopyPhone(el) {
  const phone = el?.getAttribute('data-phone') || '';
  if (phone && phone !== '—' && typeof copyToClipboard === 'function') copyToClipboard(phone, 'Numara kopyalandı');
}

function chBadge(key) {
  const k = statsOutcomeKey(key);
  const label = statsEsc(chOutcomeText(key));
  const cls = k === 'appointment' ? 'badge-green' : (k === 'negative' || k === 'dnc') ? 'badge-red' : k === 'callback' ? 'badge-yellow' : 'badge-gray';
  return `<span class="badge ${cls}">${label}</span>`;
}

function toggleCallHistoryRange() {
  const val = document.getElementById('ch-date-f')?.value || 'week';
  const wrap = document.getElementById('ch-custom-range');
  if (wrap) wrap.style.display = val === 'custom' ? 'flex' : 'none';
}

function chSyncRange() {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
  const mode = document.getElementById('ch-date-f')?.value || 'week';
  let from = today;
  let to = today;
  if (mode === 'week') from = statsMonday(today);
  else if (mode === 'month') from = `${String(today).slice(0, 8)}01`;
  else if (mode === 'custom') {
    from = document.getElementById('ch-date-from')?.value || today;
    to = document.getElementById('ch-date-to')?.value || today;
  }
  if (to < from) { const swap = from; from = to; to = swap; }
  const df = document.getElementById('ch-date-from');
  const dt = document.getElementById('ch-date-to');
  if (df) df.value = from;
  if (dt) dt.value = to;
  return { from, to };
}

function chColumns() {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const pair = (key, tr, deLabel, type) => ({ key, tr, de: deLabel, label: de ? deLabel : tr, type });
  return [
    pair('id', 'ID', 'ID', 'text'),
    pair('dur', 'Süre', 'Dauer', 'num'),
    pair('rec', 'Ses kaydı', 'Aufnahme', 'text'),
    pair('name', 'Adı', 'Name', 'text'),
    pair('phone', 'Numara', 'Nummer', 'text'),
    pair('agent', 'Operatör', 'Operator', 'text'),
    pair('when', 'Arama zamanı', 'Anrufzeit', 'time'),
    pair('answer', 'Cevaplama', 'Annahme', 'time'),
    pair('end', 'Kapatma', 'Auflegen', 'time'),
    pair('work', 'Çalışma tipi', 'Arbeitsart', 'text'),
    pair('caller', 'Arayan numara', 'Anrufernummer', 'text'),
    pair('camp', 'Kuyruk', 'Warteschlange', 'text'),
    pair('cost', 'Ücret', 'Kosten', 'num'),
    pair('rate', 'Tarife', 'Tarif', 'text'),
    pair('outcome', 'Sonuç', 'Ergebnis', 'text'),
    pair('who', 'Sonlandıran', 'Aufgelegt von', 'text'),
    pair('note', 'Açıklama', 'Beschreibung', 'text'),
    pair('callid', 'Çağrı no', 'Anruf-Nr.', 'text'),
  ];
}

function chEuro(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
}

function chWorkText(value) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const map = {
    auto: de ? 'Automatischer Anruf' : 'Otomatik arama',
    manual: de ? 'Manueller Anruf' : 'Manuel arama',
    inbound: de ? 'Eingehender Anruf' : 'Gelen arama',
  };
  return map[String(value || '')] || '—';
}

function chWhoText(value) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const map = {
    agent: de ? 'Operator' : 'Operatör',
    customer: de ? 'Kunde' : 'Müşteri',
    system: de ? 'System' : 'Sistem',
  };
  return map[String(value || '')] || '—';
}

function chAnswerIso(l) {
  if (l?.answered_at) return l.answered_at;
  if (chDurSec(l) > 0 && l?.started_at) return l.started_at;
  return '';
}

function chEndIso(l) {
  if (l?.ended_at) return l.ended_at;
  const start = l?.started_at ? new Date(l.started_at).getTime() : 0;
  const sec = chDurSec(l);
  if (start && sec) return new Date(start + sec * 1000).toISOString();
  return '';
}

function chMoney(l) {
  if (l?.cost_usd == null || l.cost_usd === '') return { n: 0, text: '—', unit: '—' };
  const n = Number(l.cost_usd) || 0;
  return { n, text: chEuro(n), unit: '—' };
}

async function chFillFilters(fid) {
  const sig = fid || 'all';
  try {
    let cq = 'campaigns?select=id,name,firm_id&order=name.asc&limit=500';
    if (fid) cq += `&firm_id=eq.${fid}`;
    const camps = (await sb(cq).catch(() => [])) || [];
    await statsFillSelect('ch-camp-f', `c:${sig}:${camps.length}`, camps.map((c) => ({
      id: c.id,
      name: `${c.name || '—'}${statsFirmSuffix(c.firm_id)}`,
    })), 'Tüm Kampanyalar', 'Alle Kampagnen');
  } catch (e) { console.warn('ch camps', e); }
  try {
    let uq = 'users?select=id,name,firm_id&order=name.asc&limit=400';
    if (fid) uq += `&firm_id=eq.${fid}`;
    const users = (await sb(uq).catch(() => [])) || [];
    await statsFillSelect('ch-agent-f', `u:${sig}:${users.length}`, users.map((u) => ({
      id: u.id,
      name: `${u.name || '—'}${statsFirmSuffix(u.firm_id)}`,
    })), 'Tüm temsilciler', 'Alle Agenten');
  } catch (e) { console.warn('ch agents', e); }
}

function chFillOutcomeSelect(labelMap, logs, campId) {
  const sel = document.getElementById('ch-outcome');
  if (!sel) return;
  const prev = sel.value;
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const std = [
    ['appointment', 'Randevu', 'Termin'],
    ['negative', 'Olumsuz', 'Negativ'],
    ['callback', 'Geri Ara', 'Rückruf'],
    ['no_answer', 'Cevap Yok', 'Keine Antwort'],
    ['voicemail', 'Telesekreter', 'Mailbox'],
    ['dnc', 'Kara Liste', 'Sperrliste'],
  ];
  const extraKeys = new Set();
  (logs || []).forEach((l) => {
    const k = statsOutcomeKey(l.outcome);
    if (k && !STATS_STD.includes(k)) extraKeys.add(k);
  });
  if (campId) {
    Object.keys(labelMap || {}).forEach((k) => {
      if (k && !STATS_STD.includes(k)) extraKeys.add(k);
    });
  }
  if (prev && prev !== 'appointment' && !STATS_STD.includes(prev)) extraKeys.add(prev);
  const extras = [...extraKeys].sort((a, b) => statsExtraLabel(a, labelMap).localeCompare(statsExtraLabel(b, labelMap), 'tr'));
  const opt = (value, tr, deLabel) => `<option value="${statsEsc(value)}" data-tr="${statsEsc(tr)}" data-de="${statsEsc(deLabel)}">${statsEsc(de ? deLabel : tr)}</option>`;
  sel.innerHTML = opt('', 'Tüm Sonuçlar', 'Alle Ergebnisse')
    + std.map(([k, tr, d]) => opt(k, tr, d)).join('')
    + extras.map((k) => { const label = statsExtraLabel(k, labelMap); return opt(k, label, label); }).join('');
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

async function chPullLogs(ff, gte, lte, camp, agent, outcome) {
  const outcomeQ = !outcome ? ''
    : outcome === 'appointment' ? '&outcome=in.(appointment,appointment_done)'
    : `&outcome=eq.${encodeURIComponent(outcome)}`;
  const tail = `${ff}&started_at=gte.${gte}&started_at=lte.${lte}${camp ? `&campaign_id=eq.${camp}` : ''}${agent ? `&agent_id=eq.${agent}` : ''}${outcomeQ}&order=started_at.desc`;
  const fields = 'id,started_at,ended_at,dial_at,answered_at,outcome,agent_id,campaign_id,firm_id,phone,caller_number,work_type,hangup_by,duration_sec,cost_usd,contact_id,recording_url,notes,callback_at,telnyx_call_id';
  const legacy = 'id,started_at,ended_at,outcome,agent_id,campaign_id,firm_id,phone,duration_sec,cost_usd,contact_id,recording_url,notes,callback_at,telnyx_call_id';
  const rich = `call_logs?select=${fields},users(id,name),campaigns(name,telnyx_did),contacts(first_name,last_name,phone)${tail}`;
  const mid = `call_logs?select=${legacy},users(id,name),campaigns(name,telnyx_did),contacts(first_name,last_name,phone)${tail}`;
  const plain = `call_logs?select=${legacy}${tail}`;
  let mode = 'rich';
  const all = [];
  let off = 0;
  while (off < CH_CAP) {
    const size = Math.min(1000, CH_CAP - off);
    const base = mode === 'rich' ? rich : mode === 'mid' ? mid : plain;
    const q = `${base}&limit=${size}&offset=${off}`;
    let rows;
    try {
      rows = (await sb(q)) || [];
    } catch (e) {
      if (mode === 'rich' && off === 0) { mode = 'mid'; continue; }
      if (mode === 'mid' && off === 0) { mode = 'plain'; continue; }
      throw e;
    }
    all.push(...rows);
    if (rows.length < size) return { rows: all, capped: false };
    off += rows.length;
  }
  return { rows: all, capped: true };
}

function chRenderHead() {
  const head = document.querySelector('#page-callhistory thead');
  if (!head) return;
  const cells = chColumns().map((col) => {
    const on = _chSort.key === col.key;
    const mark = on ? (_chSort.dir === 'desc' ? '▼' : '▲') : '';
    const val = statsEsc(_chFilters[col.key] || '');
    return `<th data-label="${statsEsc(col.label)}">
<button type="button" class="stats-sort${on ? ' is-on' : ''}" data-sort="${statsEsc(col.key)}"><span data-tr="${statsEsc(col.tr)}" data-de="${statsEsc(col.de)}">${statsEsc(col.label)}</span> <span class="stats-sort-mark">${mark}</span></button>
<input class="camp-col-filter" data-filter="${statsEsc(col.key)}" value="${val}" aria-label="${statsEsc(col.label)}">
</th>`;
  }).join('');
  head.innerHTML = `<tr>${cells}<th></th></tr>`;
  head.querySelectorAll('[data-sort]').forEach((btn) => { btn.onclick = () => chSortBy(btn.dataset.sort); });
  head.querySelectorAll('[data-filter]').forEach((inp) => {
    inp.oninput = () => { _chFilters[inp.dataset.filter] = inp.value; chPaint(); };
  });
}

function chSortBy(key) {
  if (_chSort.key === key && _chSort.dir === 'desc') _chSort = { key, dir: 'asc' };
  else _chSort = { key, dir: 'desc' };
  document.querySelectorAll('#page-callhistory [data-sort]').forEach((btn) => {
    const on = btn.dataset.sort === _chSort.key;
    btn.classList.toggle('is-on', on);
    const mark = btn.querySelector('.stats-sort-mark');
    if (mark) mark.textContent = on ? (_chSort.dir === 'desc' ? '▼' : '▲') : '';
  });
  chPaint();
}

function chPaint() {
  const tbody = document.getElementById('ch-tbody');
  if (!tbody) return;
  const cols = chColumns();
  const search = String(document.getElementById('ch-search')?.value || '').trim().toLocaleLowerCase('tr');
  const way = document.getElementById('ch-dir')?.value || '';
  const filtered = _chRows.filter((row) => {
    if (search) {
      const blob = [row.idText, row.name, row.phone, row.caller, row.agent, row.camp, row.outcomeText, row.note, row.callid, row.work].join(' ').toLocaleLowerCase('tr');
      if (!blob.includes(search)) return false;
    }
    if (way === 'in' && row.workKey !== 'inbound') return false;
    if (way === 'out' && row.workKey === 'inbound') return false;
    return cols.every((col) => {
      const q = String(_chFilters[col.key] || '').trim().toLocaleLowerCase('tr');
      if (!q) return true;
      return chCellText(row, col.key).toLocaleLowerCase('tr').includes(q);
    });
  });
  const dir = _chSort.dir === 'asc' ? 1 : -1;
  const key = _chSort.key;
  filtered.sort((a, b) => {
    if (key === 'when' || key === 'answer' || key === 'end' || key === 'dur' || key === 'cost') return ((a[key] || 0) - (b[key] || 0)) * dir;
    return chCellText(a, key).localeCompare(chCellText(b, key), 'tr', { numeric: true, sensitivity: 'base' }) * dir;
  });
  const span = cols.length + 1;
  if (!filtered.length) {
    tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(span, 'ui.no_records') : `<tr><td colspan="${span}" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map((row) => {
    const l = row.raw;
    const detail = l.contact_id ? `<button type="button" class="icon-btn" onclick="openContactDrawer('${statsEsc(l.contact_id)}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
    return `<tr>${cols.map((col) => chCellHtml(row, col.key)).join('')}<td>${detail}</td></tr>`;
  }).join('');
}

function chCellText(row, key) {
  if (key === 'dur') return row.durText || '';
  if (key === 'when') return row.whenText || '';
  if (key === 'answer') return row.answerText || '';
  if (key === 'end') return row.endText || '';
  if (key === 'rec') return row.recText || '';
  if (key === 'outcome') return row.outcomeText || '';
  if (key === 'cost') return row.costText || '';
  if (key === 'id') return row.idText || '';
  return String(row[key] || '');
}

function chCellHtml(row, key) {
  const l = row.raw;
  if (key === 'rec') return `<td>${chRecHtml(l)}</td>`;
  if (key === 'outcome') {
    const cb = l.callback_at ? `<div class="ch-cb"><i class="ph ph-calendar"></i> ${statsEsc(chWhen(l.callback_at))}</div>` : '';
    return `<td>${chBadge(l.outcome)}${cb}</td>`;
  }
  if (key === 'phone' || key === 'caller') {
    const value = key === 'caller' ? row.caller : row.phone;
    return `<td class="td-mono" style="font-size:11px;cursor:pointer;" data-phone="${statsEsc(value)}" onclick="chCopyPhone(this)" title="Kopyala">${statsEsc(value || '—')}</td>`;
  }
  if (key === 'note') {
    const note = row.note ? `<div class="ch-note" title="${statsEsc(row.note)}">${statsEsc(row.note)}</div>` : '<span style="color:var(--text-3);">—</span>';
    return `<td>${note}</td>`;
  }
  if (key === 'name') return `<td style="font-weight:600;">${statsEsc(row.name || '—')}</td>`;
  if (key === 'id' || key === 'callid') return `<td class="td-mono" style="font-size:11px;" title="${statsEsc(key === 'id' ? l.id : (l.telnyx_call_id || ''))}">${statsEsc(chCellText(row, key) || '—')}</td>`;
  return `<td class="td-mono" style="font-size:11px;">${statsEsc(chCellText(row, key) || '—')}</td>`;
}

async function loadCallHistory() {
  const gen = ++_chLoadGen;
  const tbody = document.getElementById('ch-tbody');
  const colSpan = chColumns().length + 1;
  if (tbody) tbody.innerHTML = typeof mbLoadingRow === 'function' ? mbLoadingRow(colSpan) : `<tr><td colspan="${colSpan}" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  try {
    if (typeof renderFirmSelector === 'function') renderFirmSelector('ch-firm-selector', loadCallHistory);
    const fid = typeof getActiveFirmId === 'function' ? getActiveFirmId() : null;
    await chFillFilters(fid);
    if (gen !== _chLoadGen) return;
    toggleCallHistoryRange();
    const range = chSyncRange();
    const ff = getFirmFilter('&');
    const outcome = document.getElementById('ch-outcome')?.value || '';
    const agentFilter = document.getElementById('ch-agent-f')?.value || '';
    const campFilter = document.getElementById('ch-camp-f')?.value || '';
    const gte = typeof mbInstantGte === 'function' ? mbInstantGte(range.from) : `${range.from}T00:00:00`;
    const lte = typeof mbInstantLte === 'function' ? mbInstantLte(range.to) : `${range.to}T23:59:59`;
    const pulled = await chPullLogs(ff, gte, lte, campFilter, agentFilter, outcome);
    if (gen !== _chLoadGen) return;
    const logs = pulled.rows || [];
    const capEl = document.getElementById('ch-cap');
    if (capEl) {
      const de = typeof currentLang !== 'undefined' && currentLang === 'de';
      capEl.style.display = pulled.capped ? '' : 'none';
      capEl.textContent = pulled.capped
        ? (de ? `Nur die letzten ${CH_CAP} Anrufe. Zeitraum eingrenzen.` : `Son ${CH_CAP} arama gösteriliyor. Aralığı daralt.`)
        : '';
    }
    _chLabelMap = await statsOutcomeLabels(campFilter ? [campFilter] : logs.map((l) => l.campaign_id));
    const rateFirms = fid
      ? ((await sb(`firms?id=eq.${fid}&select=id,settings`).catch(() => [])) || [])
      : ((await sb('firms?select=id,settings&limit=200').catch(() => [])) || []);
    const ratesByFirm = {};
    rateFirms.forEach((firm) => { ratesByFirm[firm.id] = firm?.settings?.billing?.rates || []; });
    if (gen !== _chLoadGen) return;
    chFillOutcomeSelect(_chLabelMap, logs, campFilter);
    const contactNameById = {};
    try {
      const missingIds = [...new Set(logs
        .filter((l) => l?.contact_id && !(`${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim()))
        .map((l) => l.contact_id))];
      for (let i = 0; i < missingIds.length; i += 100) {
        const chunk = missingIds.slice(i, i + 100);
        if (!chunk.length) continue;
        const rows = await sb(`contacts?select=id,first_name,last_name&id=in.(${chunk.join(',')})`).catch(() => []);
        (rows || []).forEach((r) => {
          const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim();
          if (nm) contactNameById[r.id] = nm;
        });
      }
    } catch (_) {}
    if (gen !== _chLoadGen) return;
    if (typeof mbWarmCampShown === 'function') await mbWarmCampShown(logs.map((l) => l.campaign_id));
    if (gen !== _chLoadGen) return;
    _chRows = logs.map((l) => {
      const sec = chDurSec(l);
      const phone = l.phone || l.contacts?.phone || '—';
      const name = `${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim() || contactNameById[l.contact_id] || phone;
      const answerIso = chAnswerIso(l);
      const endIso = chEndIso(l);
      const dialIso = l.dial_at || l.started_at;
      const money = chMoney(l, ratesByFirm);
      const callNo = String(l.telnyx_call_id || '');
      return {
        raw: l,
        idText: String(l.id || '').replace(/-/g, '').slice(0, 8),
        when: new Date(dialIso).getTime() || 0,
        whenText: chWhen(dialIso),
        answer: answerIso ? new Date(answerIso).getTime() : 0,
        answerText: answerIso ? chWhen(answerIso) : '—',
        end: endIso ? new Date(endIso).getTime() : 0,
        endText: endIso ? chWhen(endIso) : '—',
        name,
        phone,
        caller: l.caller_number || l.campaigns?.telnyx_did || '—',
        agent: `${l.users?.name || '—'}${statsFirmSuffix(l.firm_id)}`,
        camp: typeof mbCampShown === 'function' ? mbCampShown(l.campaigns, l.campaign_id) : (l.campaigns?.name || '—'),
        work: chWorkText(l.work_type),
        workKey: l.work_type || '',
        who: chWhoText(l.hangup_by),
        dur: sec,
        durText: sec ? statsClock(sec) : '00:00',
        cost: money.n,
        costText: money.text,
        rate: money.unit,
        recText: l.recording_url ? 'Kayıt' : '—',
        outcomeText: chOutcomeText(l.outcome, _chLabelMap),
        note: chNoteText(l.notes),
        callid: callNo ? callNo.slice(0, 10) : '—',
      };
    });
    chRenderHead();
    chPaint();
  } catch (e) {
    console.error(e);
    if (gen !== _chLoadGen) return;
    if (tbody) {
      const msg = t('ui.error_prefix') + (e?.message || t('ui.unknown_error'));
      tbody.innerHTML = typeof mbErrorRow === 'function'
        ? mbErrorRow(colSpan, msg)
        : `<tr><td colspan="${colSpan}" class="mb-empty-hint" style="color:var(--red);">${statsEsc(msg)}</td></tr>`;
    }
  }
}

async function loadMyHistory() {
if (!currentUser) return;
try {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const dateFrom = document.getElementById('mh-date-from')?.value || today;
const dateTo   = document.getElementById('mh-date-to')?.value   || today;
const mhGte = typeof mbInstantGte === 'function' ? mbInstantGte(dateFrom) : `${dateFrom}T00:00:00`;
const mhLte = typeof mbInstantLte === 'function' ? mbInstantLte(dateTo) : `${dateTo}T23:59:59`;
const search   = (document.getElementById('mh-search')?.value||'').toLowerCase();
const outcome  = document.getElementById('mh-outcome')?.value||'';
let query = `call_logs?select=*,contacts(first_name,last_name,phone),campaigns(name)&agent_id=eq.${currentUser.id}`;
query += `&started_at=gte.${mhGte}&started_at=lte.${mhLte}`;
if (outcome) query += outcome === 'appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
query += '&order=started_at.desc&limit=200';
const logs = await sb(query) || [];
if (typeof mbWarmCampShown === 'function') await mbWarmCampShown((logs || []).map((l) => l.campaign_id));
const contactNameById = {};
try {
  const missingIds = [...new Set((logs || [])
    .filter((l) => l?.contact_id && !(`${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim()))
    .map((l) => l.contact_id)
  )];
  for (let i = 0; i < missingIds.length; i += 100) {
    const chunk = missingIds.slice(i, i + 100);
    if (!chunk.length) continue;
    const rows = await sb(`contacts?select=id,first_name,last_name&id=in.(${chunk.join(',')})`).catch(() => []);
    (rows || []).forEach((r) => {
      const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      if (nm) contactNameById[r.id] = nm;
    });
  }
} catch (_) {}
const logDurSec = (l) => Math.max(0, Number(l?.duration_sec ?? l?.duration_seconds ?? 0) || 0);
const isFakeRec = (l) => {
  if (typeof _isFakeRecordingRow === 'function') return _isFakeRecordingRow(l);
  const noRec = !String(l?.recording_url || '').trim();
  if (!noRec) return false;
  const notesRaw = String(l?.notes || '');
  const explicitTest =
    l?.is_test === true ||
    l?.is_inbound_test === true ||
    notesRaw.includes('__test_sim__');
  if (explicitTest) return true;
  if (typeof _testMode !== 'undefined' && _testMode) {
    const dur = logDurSec(l);
    const hasTelnyx = String(l?.telnyx_call_id || '').trim();
    if (dur >= 1 && dur <= 900 && !hasTelnyx) return true;
  }
  return false;
};
const recHtmlFor = (l) => {
  if (l.recording_url) {
    const src = statsEsc(l.recording_url);
    const id = statsEsc(l.id);
    const dl = statsEsc(typeof t === 'function' ? t('ch.rec.download') : 'Kaydı indir');
    return `<span style="display:inline-flex;align-items:center;gap:6px;" onclick="event.stopPropagation();"><audio id="mh-aud-${id}" src="${src}" preload="none" style="display:none;"></audio><button type="button" onclick="event.stopPropagation();toggleAudio('mh-aud-${id}')" style="background:var(--bg-3);border:1px solid var(--border);border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;"><i class="ph ph-play"></i></button><a class="ch-rec-dl" href="${src}" download="kayit-${id}.mp3" target="_blank" rel="noopener" title="${dl}" aria-label="${dl}" onclick="event.stopPropagation();"><i class="ph ph-download-simple"></i>${dl}</a></span>`;
  }
  if (isFakeRec(l) && typeof _fakeRecordingMarkup === 'function') return _fakeRecordingMarkup(l, 'myhist');
  return '<span style="color:var(--text-3);font-size:11px;">—</span>';
};
const OM={
  appointment:'<span class="badge badge-green">Randevu</span>',
  appointment_done:'<span class="badge badge-green">Randevu</span>',
  negative:'<span class="badge badge-red">Olumsuz</span>',
  callback:'<span class="badge badge-yellow">Geri Ara</span>',
  voicemail:'<span class="badge badge-gray">Telesekreter</span>',
  no_answer:'<span class="badge badge-gray">Cevap Yok</span>',
  dnc:'<span class="badge badge-red">DNC</span>'
};
let filtered = logs;
if (search) {
  filtered = logs.filter(l => {
    const name = `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.toLowerCase();
    const phone = (l.phone||l.contacts?.phone||'').toLowerCase();
    return name.includes(search) || phone.includes(search);
  });
}
const tbody = document.getElementById('my-tbody');
if (!filtered.length) {
  tbody.innerHTML = typeof mbEmptyRow === 'function' ? mbEmptyRow(8, 'ui.no_records') : `<tr><td colspan="8" class="mb-empty-hint">${t('ui.no_records')}</td></tr>`;
  return;
}
tbody.innerHTML = filtered.map(l=>{
const dt = new Date(l.started_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const name =
  `${l.contacts?.first_name||''} ${l.contacts?.last_name||''}`.trim() ||
  contactNameById[l.contact_id] ||
  (l.phone || l.contacts?.phone || '—');
const phone = l.phone || l.contacts?.phone || '—';
const camp = typeof mbCampShown === 'function' ? mbCampShown(l.campaigns, l.campaign_id) : (l.campaigns?.name || '—');
const sec = logDurSec(l);
const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
const cbInfo = l.callback_at ? `<div style="font-size:10px;color:var(--yellow);margin-top:2px;"><i class="ph ph-calendar" style="vertical-align:-2px;"></i> ${new Date(l.callback_at).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>` : '';
const customOutcome = typeof mbOutcomeShown === 'function' ? mbOutcomeShown(l.outcome, l.campaigns, l.campaign_id) : '';
const outcomeHtml = OM[l.outcome] || `<span class="badge badge-gray">${typeof escapeHtml === 'function' ? escapeHtml(customOutcome || l.outcome || '—') : (customOutcome || l.outcome || '—')}</span>`;
const recHtml = recHtmlFor(l);
const detailBtn = l.contact_id ? `<button class="icon-btn" onclick="openContactDrawer('${l.contact_id}')" title="Kişi Detayı"><i class="ph ph-magnifying-glass"></i></button>` : '';
return `<tr>
<td class="td-mono" style="font-size:11px;">${dt}</td>
<td style="font-weight:600;">${name}</td>
<td class="td-mono" style="font-size:12px;cursor:pointer;" onclick="copyToClipboard('${phone}','Kopyalandı')" title="Kopyala">${phone}</td>
<td style="font-size:11px;">${camp}</td>
<td class="td-mono" style="font-size:11px;">${dur}</td>
<td>${recHtml}</td>
<td>${outcomeHtml}${cbInfo}</td>
<td>${detailBtn}</td>
</tr>`;
}).join('');
} catch(e){
  console.error(e);
  const tbody = document.getElementById('my-tbody');
  if (tbody) tbody.innerHTML = typeof mbErrorRow === 'function' ? mbErrorRow(8, (e?.message || 'Hata')) : `<tr><td colspan="8" class="mb-empty-hint">${e?.message || 'Hata'}</td></tr>`;
}
}

function initStatsFilters() {
const storedRange = typeof mbReadReportRange === 'function' ? mbReadReportRange() : null;
if (storedRange) mbPaintReportRange(storedRange);
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const from = document.getElementById('stats-date-from');
const to   = document.getElementById('stats-date-to');
if (from && !from.value) from.value = today;
if (to && !to.value) to.value = today;
toggleCustomDateRange();
}


function initCallHistoryFilters() {
  const storedRange = typeof mbReadReportRange === 'function' ? mbReadReportRange() : null;
  if (storedRange) mbPaintReportRange(storedRange);
  const sel = document.getElementById('ch-date-f');
  if (sel && !sel.value) sel.value = 'week';
  toggleCallHistoryRange();
  chSyncRange();
  if (typeof updateCallHistoryExportVisibility === 'function') updateCallHistoryExportVisibility();
}

function initMyHistoryFilters() {
const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : new Date().toISOString().split('T')[0];
const from = document.getElementById('mh-date-from');
const to   = document.getElementById('mh-date-to');
if (from && !from.value) from.value = today;
if (to   && !to.value)   to.value   = today;
}

function toggleCustomDateRange() {
var val = document.getElementById("stats-date-f") ? document.getElementById("stats-date-f").value : "";
var wrap = document.getElementById("stats-custom-range");
if (wrap) wrap.style.display = val==="custom" ? "flex" : "none";
}

const _DASH_LIVE_STATUS = {
  on_call:  { tr: 'Aramada', de: 'Im Gespräch' },
  ready:    { tr: 'Hazır', de: 'Bereit' },
  wrapping: { tr: 'Sonuç', de: 'Nacharbeit' },
  break:    { tr: 'Mola', de: 'Pause' },
  offline:  { tr: 'Çevrimdışı', de: 'Offline' },
};
const _DASH_LIVE_ORDER = { on_call: 0, wrapping: 1, ready: 2, break: 3, offline: 4 };

function _dashLiveEsc(v) {
  return typeof escapeHtml === 'function' ? escapeHtml(v ?? '') : String(v ?? '');
}

const LIVE_AGE_HOLD_SEC = 30;
const LIVE_AGE_TAU_SEC = 220;

function liveAgeFromSec(sec) {
  const held = Math.max(0, (Number(sec) || 0) - LIVE_AGE_HOLD_SEC);
  return Math.max(0, Math.min(1, 1 - Math.exp(-held / LIVE_AGE_TAU_SEC)));
}

function liveStateSinceIso(s) {
  if (!s) return '';
  if (typeof s === 'string') return s;
  const st = s.status;
  if (st === 'on_call') return s.call_started_at || s.call_start || s.updated_at || s.last_seen || '';
  if (st === 'break') return s.break_start || s.updated_at || s.last_seen || '';
  return s.updated_at || s.last_seen || '';
}

function liveStateAgeSec(s) {
  const iso = liveStateSinceIso(s);
  if (!iso) return 0;
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

function liveAgeUnit(s) {
  return liveAgeFromSec(liveStateAgeSec(s));
}

function liveClock(iso, de) {
  if (!iso) return '—';
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return de ? `${d} T ${h} Std` : `${d}g ${h}sa`;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function compareLiveAgents(a, b) {
  const ra = _DASH_LIVE_ORDER[a.status] ?? 9;
  const rb = _DASH_LIVE_ORDER[b.status] ?? 9;
  if (ra !== rb) return ra - rb;
  const byAge = liveStateAgeSec(b) - liveStateAgeSec(a);
  if (byAge) return byAge;
  return String(a.agent_name || '').localeCompare(String(b.agent_name || ''), 'tr');
}

function livePaintAge(el) {
  if (!el) return;
  const iso = el.dataset.since || '';
  const age = iso ? liveAgeFromSec(liveStateAgeSec(iso)) : 0;
  el.style.setProperty('--live-age', age.toFixed(3));
  el.classList.toggle('live-tone--deep', age >= 0.55);
  const clock = el.querySelector('[data-clock]');
  if (clock) clock.textContent = liveClock(iso, (typeof currentLang !== 'undefined' && currentLang === 'de'));
}

function _dashLiveTick() {
  document.querySelectorAll('#live-agents [data-since]').forEach(livePaintAge);
}

const _LIVE_DOT = {
  on_call: '#4CAF50',
  ready: '#FFB74D',
  wrapping: '#00BCD4',
  break: '#7E57C2',
  offline: '#9E9E9E',
};

function liveFloorStatuses() {
  return ['on_call', 'ready', 'wrapping', 'break', 'offline'];
}

function liveFloorFilter() {
  if (!window._liveFloorOn) {
    window._liveFloorOn = { on_call: true, ready: true, wrapping: true, break: true, offline: true };
  }
  return window._liveFloorOn;
}

function liveFloorLayout() {
  try {
    const v = localStorage.getItem('mb-live-layout');
    return (v === 'rows' || v === 'strip') ? 'rows' : 'grid';
  } catch (_) {
    return 'grid';
  }
}

function _syncLiveLayoutButtons() {
  const rows = liveFloorLayout() === 'rows';
  document.querySelectorAll('[data-live-layout]').forEach((btn) => {
    const mode = (btn.dataset.liveLayout === 'rows' || btn.dataset.liveLayout === 'strip') ? 'rows' : 'grid';
    btn.classList.toggle('is-on', rows ? mode === 'rows' : mode === 'grid');
  });
}

function _liveFlip(root, render) {
  if (!root) {
    render();
    return;
  }
  const prev = new Map();
  root.querySelectorAll('[data-live-id]').forEach((el) => {
    prev.set(el.dataset.liveId, el.getBoundingClientRect());
  });
  render();
  root.querySelectorAll('[data-live-id]').forEach((el) => {
    const before = prev.get(el.dataset.liveId);
    if (!before) {
      el.classList.add('live-card--enter');
      return;
    }
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      el.style.transition = 'transform .45s cubic-bezier(.33,1,.68,1)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => {
        el.style.transition = '';
        el.style.transform = '';
      }, { once: true });
    });
  });
  _syncLiveLayoutButtons();
}

function setLiveFloorLayout(mode) {
  const next = (mode === 'rows' || mode === 'strip') ? 'rows' : 'grid';
  try { localStorage.setItem('mb-live-layout', next); } catch (_) {}
  if (typeof mbQueueUiPrefSave === 'function') mbQueueUiPrefSave();
  _syncLiveLayoutButtons();
  if (typeof _paintDashLive === 'function') _paintDashLive();
  if (typeof _supRenderCards === 'function') _supRenderCards();
}

function toggleLiveFloorStatus(st) {
  const on = liveFloorFilter();
  if (st === '*') liveFloorStatuses().forEach((k) => { on[k] = true; });
  else if (Object.prototype.hasOwnProperty.call(on, st)) on[st] = !on[st];
  if (typeof _paintDashLive === 'function') _paintDashLive();
  if (typeof _supRenderCards === 'function') _supRenderCards();
  if (typeof _supUpdateSummary === 'function') _supUpdateSummary();
}

let _dashLiveCache = [];
let _dashLiveCamps = {};

async function renderDashLiveAgents() {
  const live = document.getElementById('live-agents');
  if (!live) return;
  const de = currentLang === 'de';
  const ff = (typeof getFirmFilter === 'function' ? getFirmFilter('&') : '') || '';
  const [sessions, camps] = await Promise.all([
    sb(`agent_sessions?select=*&order=agent_name.asc${ff}`).catch(() => []),
    sb(`campaigns?select=id,name${ff}`).catch(() => []),
  ]);
  _dashLiveCamps = {};
  (Array.isArray(camps) ? camps : []).forEach((c) => { if (c?.id) _dashLiveCamps[c.id] = c.name || ''; });
  _dashLiveCache = (Array.isArray(sessions) ? sessions : []).slice().sort(compareLiveAgents);
  _paintDashLive();
}

function _paintDashLive() {
  const live = document.getElementById('live-agents');
  if (!live) return;
  const de = currentLang === 'de';
  const rows = _dashLiveCache;
  const count = (st) => rows.filter((s) => s.status === st).length;
  const sub = document.getElementById('dash-live-sub');
  if (sub) {
    const n = count('on_call');
    sub.textContent = de
      ? (n === 1 ? '1 aktives Gespräch' : `${n} aktive Gespräche`)
      : `${n} kişi görüşmede`;
  }
  if (!rows.length) {
    live.innerHTML = `<div class="mb-empty-hint" style="font-size:13px;">${t('ui.no_active_agents')}</div>`;
    return;
  }
  const filter = liveFloorFilter();
  const allOn = liveFloorStatuses().every((st) => filter[st] !== false);
  const allLabel = de ? 'Alle' : 'Tümü';
  const chips = `<button type="button" class="live-filter live-filter--all${allOn ? ' is-all' : ''}" onclick="toggleLiveFloorStatus('*')">${allLabel}</button>`
    + liveFloorStatuses().map((st) => {
      const info = _DASH_LIVE_STATUS[st];
      const label = de ? info.de : info.tr;
      const off = filter[st] === false ? ' inactive' : '';
      const dot = typeof mbLiveDot === 'function' ? mbLiveDot(st) : _LIVE_DOT[st];
      return `<button type="button" class="live-filter${off}" data-live-status="${st}" style="--dot:${dot}" onclick="toggleLiveFloorStatus('${st}')"><span class="dot"></span><span class="label">${count(st)} ${label}</span></button>`;
    }).join('');
  const visible = rows.filter((s) => filter[s.status] !== false);
  const isAdmin = mbIsFirmAdmin();
  const asRows = liveFloorLayout() === 'rows';
  const people = visible.map((s) => {
    const st = _DASH_LIVE_STATUS[s.status] ? s.status : 'offline';
    const info = _DASH_LIVE_STATUS[st];
    const label = de ? info.de : info.tr;
    const name = _dashLiveEsc(s.agent_name || '—');
    const initial = _dashLiveEsc((s.agent_name || '?').trim().charAt(0).toUpperCase());
    const camp = _dashLiveEsc(_dashLiveCamps[s.campaign_id] || '—');
    const who = _dashLiveEsc(s.current_contact_name || '—');
    const phone = _dashLiveEsc(s.current_contact_phone || '—');
    const since = liveStateSinceIso(s);
    const age = liveAgeUnit(s);
    const deep = age >= 0.55 ? ' live-tone--deep' : '';
    const dur = liveClock(since, de);
    const aid = _dashLiveEsc(s.agent_id || '');
    const sinceAttr = _dashLiveEsc(since);
    const actions = (isAdmin && typeof mbLiveActionsHtml === 'function') ? mbLiveActionsHtml(s) : '';
    if (asRows) {
      return `<div class="live-line live-line--${st}${deep}" data-live-id="${aid}" data-since="${sinceAttr}" style="--live-age:${age.toFixed(3)}">
        <div class="live-line-who"><span class="live-av">${initial}</span><span class="live-name">${name}</span></div>
        <div class="live-status">${label}</div>
        <div class="live-dur" data-clock>${_dashLiveEsc(dur)}</div>
        <div class="live-line-clip">${who}</div>
        <div class="live-line-clip">${phone}</div>
        <div class="live-line-clip">${camp}</div>
        ${actions}
      </div>`;
    }
    const facts = `<div><dt>${de ? 'Kontakt' : 'Müşteri'}</dt><dd>${who}</dd></div>
         <div><dt>${de ? 'Nummer' : 'Numara'}</dt><dd>${phone}</dd></div>
         <div><dt>${de ? 'Kampagne' : 'Kampanya'}</dt><dd>${camp}</dd></div>`;
    return `<article class="live-card live-card--${st}${deep}" data-live-id="${aid}" data-since="${sinceAttr}" style="--live-age:${age.toFixed(3)}">
      <div class="live-card-top">
        <div class="live-av">${initial}</div>
        <div style="min-width:0;flex:1;"><div class="live-name">${name}</div><div class="live-status">${label}</div></div>
        <div class="live-dur" data-clock>${_dashLiveEsc(dur)}</div>
        ${actions}
      </div>
      <dl class="live-facts">${facts}</dl>
    </article>`;
  }).join('');
  const head = asRows ? `<div class="live-rows-head${isAdmin ? ' live-rows-head--act' : ''}">
      <span>${de ? 'Agent' : 'Temsilci'}</span>
      <span>${de ? 'Status' : 'Durum'}</span>
      <span>${de ? 'Dauer' : 'Süre'}</span>
      <span>${de ? 'Kontakt' : 'Müşteri'}</span>
      <span>${de ? 'Nummer' : 'Numara'}</span>
      <span>${de ? 'Kampagne' : 'Kampanya'}</span>
      ${isAdmin ? `<span>${de ? 'Aktion' : 'İşlem'}</span>` : ''}
    </div>` : '';
  const board = visible.length
    ? (asRows
      ? `<div class="live-rows${isAdmin ? ' live-rows--act' : ''}">${head}${people}</div>`
      : `<div class="live-grid">${people}</div>`)
    : `<div class="mb-empty-hint" style="font-size:13px;">${de ? 'Keine Agenten in dieser Auswahl.' : 'Bu seçimde temsilci yok.'}</div>`;
  _liveFlip(live, () => {
    live.innerHTML = `<div class="live-filters">${chips}</div>${board}`;
  });
  if (window._dashLiveTimer) clearInterval(window._dashLiveTimer);
  window._dashLiveTimer = setInterval(() => {
    if (!document.getElementById('page-dashboard')?.classList.contains('active')) return;
    _dashLiveTick();
  }, 1000);
}

async function remoteChangeAgentStatus(agentId, newStatus) {
try {
await sb(`agent_sessions?agent_id=eq.${agentId}`,{
method:'PATCH', prefer:'return=minimal',
body: JSON.stringify({status:newStatus, updated_at:new Date().toISOString()})
});
const _st = _DASH_LIVE_STATUS[newStatus];
const _lbl = _st ? (currentLang === 'de' ? _st.de : _st.tr) : newStatus;
toast(currentLang === 'de' ? `Status: ${_lbl}` : `Durum: ${_lbl}`, 'ok');
loadDashboard();
} catch(e) { toast('Hata: '+e.message,'err'); }
}

try {
  window.setLiveFloorLayout = setLiveFloorLayout;
  window.toggleLiveFloorStatus = toggleLiveFloorStatus;
  window._liveFlip = _liveFlip;
  window.liveFloorLayout = liveFloorLayout;
  window.liveFloorFilter = liveFloorFilter;
  window.compareLiveAgents = compareLiveAgents;
  window.liveStateSinceIso = liveStateSinceIso;
  window.liveStateAgeSec = liveStateAgeSec;
  window.liveAgeUnit = liveAgeUnit;
  window.liveClock = liveClock;
  window.livePaintAge = livePaintAge;
} catch (_) {}
