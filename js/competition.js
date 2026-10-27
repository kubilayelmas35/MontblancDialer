// ─────────────────────────────────────────────
// AYIN ELEMANI YARIŞI — otomatik (başarılı termin sayısı)
// Agent: sadece sıralama + isim; termin adedi görünmez
// Admin: tam sayılar + yarış pisti detayı
// ─────────────────────────────────────────────

const COMP_RUNNER_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#4f46e5',
];

function _compFirmId() {
  return getActiveFirmId() || currentUser?.firm_id || null;
}

function _compShowCounts() {
  return mbIsFirmAdmin();
}

function _compMonthBounds(y, m) {
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function _compEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _compTodayParts() {
  const today = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return {
      y: Number(today.slice(0, 4)),
      m: Number(today.slice(5, 7)),
      d: Number(today.slice(8, 10)),
      key: today.slice(0, 7),
    };
  }
  const n = new Date();
  const m = n.getMonth() + 1;
  return { y: n.getFullYear(), m, d: n.getDate(), key: `${n.getFullYear()}-${String(m).padStart(2, '0')}` };
}

function _compMonthKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function _compMonthName(m) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const names = de
    ? ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return names[m - 1] || '';
}

function _compMonthLabel(y, m) {
  return `${_compMonthName(m)} ${y}`;
}

/** Seçilen ay. Gelecek ay yok; boşsa Berlin'deki bu ay. */
function _compResolveMonth() {
  const today = _compTodayParts();
  const el = document.getElementById('comp-period');
  let key = el?.value || today.key;
  if (!/^\d{4}-\d{2}$/.test(key) || key > today.key) key = today.key;
  if (el && el.value !== key) el.value = key;
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return { y, m, key, isCurrent: key === today.key, today };
}

function compShiftMonth(delta) {
  const cur = _compResolveMonth();
  let y = cur.y;
  let m = cur.m + delta;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  const key = _compMonthKey(y, m);
  if (key > cur.today.key) return;
  const el = document.getElementById('comp-period');
  if (el) el.value = key;
  loadCompetitionPage();
}

function _compFieldViewer() {
  return currentUser?.role === 'field_agent';
}

async function _compFetchFieldCounts(dateFrom, dateTo) {
  const fid = _compFirmId() || currentUser?.firm_id;
  if (!fid || !currentUser?.id) return {};
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/list_field_visit_ranks`, {
      method: 'POST',
      headers: mbAuthHeaders(),
      body: JSON.stringify({
        p_actor_user_id: currentUser.id,
        p_firm_id: fid,
        p_from: dateFrom,
        p_to: dateTo,
      }),
    });
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) || [];
      const map = {};
      window._compFieldNames = {};
      rows.forEach((row) => {
        if (!row?.user_id) return;
        map[row.user_id] = Number(row.completed) || 0;
        if (row.name) window._compFieldNames[row.user_id] = row.name;
      });
      return map;
    }
  } catch (e) {}
  const own = await fetch(`${SB_URL}/rest/v1/rpc/list_field_tasks_for_user`, {
    method: 'POST',
    headers: mbAuthHeaders(),
    body: JSON.stringify({ p_actor_user_id: currentUser.id, p_firm_id: fid }),
  }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const done = (own || []).filter((task) => {
    if (task.status !== 'completed') return false;
    const day = String(task.completed_at || '').slice(0, 10);
    return day && day >= dateFrom && day <= dateTo;
  }).length;
  return done ? { [currentUser.id]: done } : {};
}

async function _compFetchTerminCounts(dateFrom, dateTo) {
  if (_compFieldViewer()) return _compFetchFieldCounts(dateFrom, dateTo);
  const fid = _compFirmId();
  if (!fid) return {};
  const ff = `&firm_id=eq.${fid}`;
  const map = {};
  const rows = await mbFetchAll(`appointments?select=id,agent_id,durum${ff}&durum=eq.basarili&termin_tarih=gte.${dateFrom}T00:00:00&termin_tarih=lte.${dateTo}T23:59:59&order=termin_tarih.asc,id.asc`).catch(() => []);
  (rows || []).forEach((row) => {
    if (!row.agent_id) return;
    const ok = typeof perfApptBucket === 'function'
      ? perfApptBucket(row.durum) === 'ok'
      : String(row.durum || '').trim().toLowerCase() === 'basarili';
    if (!ok) return;
    map[row.agent_id] = (map[row.agent_id] || 0) + 1;
  });
  return map;
}

async function _compRowsFromCounts(countMap) {
  const ids = Object.keys(countMap);
  if (!ids.length) return [];
  const users = (await sb(`users?id=in.(${ids.join(',')})&select=id,name,email`).catch(() => [])) || [];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const rows = ids.map((id) => ({
    userId: id,
    name: byId[id]?.name || byId[id]?.email || window._compFieldNames?.[id] || id.slice(0, 8),
    count: countMap[id],
  }));
  rows.sort((a, b) => b.count - a.count);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

async function loadDashCompetitionCard() {
  const card = document.getElementById('dash-eom-card');
  const nameEl = document.getElementById('dash-eom-name');
  const periodEl = document.getElementById('dash-eom-period');
  const noteEl = document.getElementById('dash-eom-note');
  const selfEl = document.getElementById('dash-comp-self');
  const av = document.getElementById('dash-eom-av');
  if (!card) return;

  const fid = _compFirmId();
  if (isSuperAdmin() && !fid) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const nowParts = typeof mbBusinessToday === 'function' ? mbBusinessToday() : '';
  const y = nowParts ? Number(nowParts.slice(0, 4)) : new Date().getFullYear();
  const m = nowParts ? Number(nowParts.slice(5, 7)) : new Date().getMonth() + 1;
  const { start, end } = _compMonthBounds(y, m);

  if (periodEl) {
    periodEl.textContent = _compMonthLabel(y, m);
  }
  const kicker = document.getElementById('dash-eom-kicker');
  if (kicker && _compFieldViewer()) kicker.textContent = t('comp.field_title');
  if (noteEl) {
    noteEl.style.display = '';
    noteEl.textContent = _compFieldViewer() ? t('comp.field_note') : t('comp.note_auto_count');
  }

  try {
    const map = await _compFetchTerminCounts(start, end);
    const rows = await _compRowsFromCounts(map);
    if (!rows.length) {
      if (nameEl) nameEl.textContent = t('ui.competition_no_data');
      if (av) {
        av.textContent = '—';
        av.style.opacity = '0.4';
      }
      if (selfEl) selfEl.style.display = 'none';
    } else {
      const top = rows[0];
      if (nameEl) {
        if (_compShowCounts()) {
          nameEl.innerHTML = `${_compEsc(top.name)} <span style="font-size:13px;font-weight:600;color:var(--text-3);">(${top.count})</span>`;
        } else {
          nameEl.textContent = top.name;
        }
      }
      if (av) {
        av.textContent = String(top.name).charAt(0).toUpperCase();
        av.style.opacity = '1';
      }
      const me = rows.find((r) => r.userId === currentUser.id);
      if (selfEl) {
        if (me) {
          selfEl.style.display = '';
          if (_compShowCounts()) {
            selfEl.textContent = tReplace('comp.self_line_show', { r: me.rank, c: me.count });
          } else {
            selfEl.textContent = tReplace('comp.self_line_hide', { r: me.rank });
          }
        } else {
          selfEl.style.display = '';
          selfEl.textContent = t('comp.not_in_list');
        }
      }
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = '—';
    console.warn('comp', e);
  }
}

async function loadCompetitionPage() {
  const main = document.getElementById('comp-main');
  const noFirm = document.getElementById('comp-no-firm');
  renderFirmSelector('comp-firm-selector', loadCompetitionPage);

  const fid = _compFirmId();
  if (isSuperAdmin() && !fid) {
    if (noFirm) noFirm.style.display = '';
    if (main) main.style.display = 'none';
    return;
  }
  if (noFirm) noFirm.style.display = 'none';
  if (main) {
    main.style.display = 'flex';
    main.style.flexDirection = 'column';
  }

  const showCounts = _compShowCounts();
  if (_compFieldViewer()) {
    const pageTitle = document.querySelector('#page-competition .page-title span');
    const pageSub = document.getElementById('comp-page-sub');
    const rankNote = document.getElementById('comp-rank-note');
    if (pageTitle) pageTitle.textContent = t('comp.field_title');
    if (pageSub) pageSub.textContent = t('comp.field_note');
    if (rankNote) rankNote.textContent = t('comp.field_note');
    document.querySelectorAll('.comp-agent-hint').forEach((el) => { el.textContent = t('comp.field_hint'); });
    document.querySelectorAll('#page-competition thead th:nth-child(2)').forEach((th) => { th.textContent = t('field.agent'); });
  }
  document.querySelectorAll('.comp-admin-only').forEach((el) => {
    el.style.display = showCounts ? '' : 'none';
  });
  document.querySelectorAll('.comp-agent-hint').forEach((el) => {
    el.style.display = showCounts ? 'none' : 'inline';
  });

  const picked = _compResolveMonth();
  const y = picked.y;
  const m = picked.m;
  const { start, end } = _compMonthBounds(y, m);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const pm = _compMonthBounds(prev.y, prev.m);

  const yStart = `${y}-01-01`;
  const yEnd = end;
  const yearBody = document.getElementById('comp-lb-year');
  if (yearBody) yearBody.innerHTML = `<tr><td colspan="${showCounts ? 3 : 2}" class="mb-empty-hint">${t('ui.loading')}</td></tr>`;
  const yearP = _compFetchTerminCounts(yStart, yEnd);
  const [curMap, prevMap] = await Promise.all([
    _compFetchTerminCounts(start, end),
    _compFetchTerminCounts(pm.start, pm.end),
  ]);
  const curRows = await _compRowsFromCounts(curMap);
  const prevRows = await _compRowsFromCounts(prevMap);

  const champName = document.getElementById('comp-champ-name');
  const champSub = document.getElementById('comp-champ-sub');
  if (champName) {
    if (curRows[0]) {
      champName.textContent = curRows[0].name;
      if (champSub) {
        champSub.textContent = showCounts
          ? `${curRows[0].count} ${t('comp.champ_sub_count')}`
          : t('comp.leader');
      }
    } else {
      champName.textContent = '—';
      if (champSub) champSub.textContent = '';
    }
  }

  const lastName = document.getElementById('comp-last-name');
  const lastSub = document.getElementById('comp-last-sub');
  if (lastName) {
    if (prevRows[0]) {
      lastName.textContent = prevRows[0].name;
      if (lastSub)
        lastSub.textContent = showCounts
          ? `${prevRows[0].count} ${t('comp.termin_count')}`
          : _compMonthName(prev.m);
    } else {
      lastName.textContent = '—';
      if (lastSub) lastSub.textContent = '';
    }
  }

  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`comp-podium-${i + 1}`);
    if (!el) continue;
    const r = curRows[i];
    if (r) {
      el.innerHTML = showCounts
        ? `<strong>${_compEsc(r.name)}</strong><div style="font-size:11px;color:var(--text-3);margin-top:4px;">${tReplace('comp.podium_termin', { n: r.count })}</div>`
        : `<strong>${_compEsc(r.name)}</strong>`;
    } else {
      el.textContent = '—';
    }
  }

  const periodLabel = document.getElementById('comp-period-label');
  if (periodLabel) periodLabel.textContent = _compMonthLabel(y, m);
  const monthTitle = _compMonthLabel(y, m);
  const leaderTitle = document.getElementById('comp-leader-title');
  if (leaderTitle) leaderTitle.textContent = picked.isCurrent ? (currentLang === 'de' ? 'Führend diesen Monat' : 'Bu ay lider') : monthTitle;
  const monthTableTitle = document.getElementById('comp-month-table-title');
  if (monthTableTitle) monthTableTitle.textContent = picked.isCurrent ? (currentLang === 'de' ? 'Rangliste diesen Monat' : 'Bu ay sıralaması') : monthTitle;
  const yearTitle = document.getElementById('comp-year-title');
  if (yearTitle) {
    const fromName = _compMonthName(1);
    const toName = _compMonthName(m);
    yearTitle.textContent = `${y} · ${fromName} — ${toName}`;
  }
  const prevTitle = document.getElementById('comp-prev-title');
  if (prevTitle) prevTitle.textContent = _compMonthLabel(prev.y, prev.m);

  const daysInMonth = new Date(y, m, 0).getDate();
  const day = picked.isCurrent ? picked.today.d : daysInMonth;
  const pct = Math.min(100, Math.round((day / daysInMonth) * 100));
  const bar = document.getElementById('comp-month-bar');
  if (bar) bar.style.width = `${pct}%`;
  const ml = document.getElementById('comp-month-label');
  if (ml) {
    ml.textContent = picked.isCurrent
      ? tReplace('comp.month_progress', { p: pct, d: Math.max(0, daysInMonth - day) })
      : t('comp.month_done');
  }

  _compRenderRace(curRows.slice(0, 10), showCounts);
  _compRenderTable('comp-lb-month', curRows, showCounts);
  const meRow = curRows.find((r) => r.userId === currentUser.id);
  const banner = document.getElementById('comp-you-banner');
  if (banner) {
    if (meRow) {
      banner.style.display = '';
      const base = tReplace('comp.banner_base', { r: meRow.rank });
      const tail = showCounts ? tReplace('comp.banner_count', { c: meRow.count }) : '';
      banner.innerHTML = base + tail;
    } else {
      banner.style.display = 'none';
    }
  }
  const yearRows = await _compRowsFromCounts(await yearP);
  _compRenderTable('comp-lb-year', yearRows, showCounts);
}

function _compRenderRace(rows, showCounts) {
  const box = document.getElementById('comp-race-lanes');
  if (!box) return;
  box.innerHTML = '';
  if (!rows.length) {
    box.innerHTML = `<div class="mb-empty-hint" style="font-size:13px;">${t('ui.no_data')}</div>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  rows.forEach((r, idx) => {
    const pct = (r.count / max) * 100;
    const col = COMP_RUNNER_COLORS[idx % COMP_RUNNER_COLORS.length];
    const lane = document.createElement('div');
    lane.className = 'comp-lane';
    lane.innerHTML = `
<div class="comp-lane-inner">
  <span class="comp-lane-rank">${r.rank}</span>
  <div class="comp-lane-track">
    <div class="comp-lane-fill" style="width:${pct}%;background:${col};"></div>
  </div>
  <div class="comp-lane-meta">
    <span class="comp-lane-name">${_compEsc(r.name)}</span>
    ${showCounts ? `<span class="comp-lane-count">${r.count}</span>` : ''}
  </div>
</div>`;
    box.appendChild(lane);
  });
}

function _compRenderTable(tbodyId, rows, showCounts) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${showCounts ? 3 : 2}" style="text-align:center;color:var(--text-3);padding:20px;">—</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
<tr>
  <td class="td-mono" style="font-weight:800;">${r.rank}</td>
  <td>${_compEsc(r.name)}</td>
  ${showCounts ? `<td class="td-mono">${r.count}</td>` : ''}
</tr>`
    )
    .join('');
}

async function loadDashEmployeeOfMonth() {
  await loadDashCompetitionCard();
}
