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
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
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

async function _compFetchTerminCounts(dateFrom, dateTo) {
  const fid = _compFirmId();
  if (!fid) return {};
  const ff = `&firm_id=eq.${fid}`;
  const q = `call_logs?select=agent_id${ff}&outcome=in.(appointment,appointment_done)&started_at=gte.${dateFrom}T00:00:00&started_at=lte.${dateTo}T23:59:59&limit=15000`;
  const logs = (await sb(q).catch(() => [])) || [];
  const map = {};
  for (const l of logs) {
    if (!l.agent_id) continue;
    map[l.agent_id] = (map[l.agent_id] || 0) + 1;
  }
  return map;
}

async function _compRowsFromCounts(countMap) {
  const ids = Object.keys(countMap);
  if (!ids.length) return [];
  const users = (await sb(`users?id=in.(${ids.join(',')})&select=id,name,email`).catch(() => [])) || [];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const rows = ids.map((id) => ({
    userId: id,
    name: byId[id]?.name || byId[id]?.email || id.slice(0, 8),
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

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const { start, end } = _compMonthBounds(y, m);

  if (periodEl) {
    periodEl.textContent = new Date(y, m - 1, 1).toLocaleDateString(mbLocale(), {
      month: 'long',
      year: 'numeric',
    });
  }
  if (noteEl) {
    noteEl.style.display = '';
    noteEl.textContent = t('comp.note_auto_count');
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
  document.querySelectorAll('.comp-admin-only').forEach((el) => {
    el.style.display = showCounts ? '' : 'none';
  });
  document.querySelectorAll('.comp-agent-hint').forEach((el) => {
    el.style.display = showCounts ? 'none' : 'inline';
  });

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const { start, end } = _compMonthBounds(y, m);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const pm = _compMonthBounds(prev.y, prev.m);

  const curMap = await _compFetchTerminCounts(start, end);
  const curRows = await _compRowsFromCounts(curMap);
  const prevMap = await _compFetchTerminCounts(pm.start, pm.end);
  const prevRows = await _compRowsFromCounts(prevMap);

  const yStart = `${y}-01-01`;
  const yEnd = end;
  const yearMap = await _compFetchTerminCounts(yStart, yEnd);
  const yearRows = await _compRowsFromCounts(yearMap);

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
          : new Date(prev.y, prev.m - 1, 1).toLocaleDateString(mbLocale(), {
              month: 'long',
            });
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

  const daysInMonth = new Date(y, m, 0).getDate();
  const day = now.getDate();
  const pct = Math.min(100, Math.round((day / daysInMonth) * 100));
  const bar = document.getElementById('comp-month-bar');
  if (bar) bar.style.width = `${pct}%`;
  const ml = document.getElementById('comp-month-label');
  if (ml)
    ml.textContent = tReplace('comp.month_progress', { p: pct, d: daysInMonth - day });

  _compRenderRace(curRows.slice(0, 10), showCounts);
  _compRenderTable('comp-lb-month', curRows, showCounts);
  _compRenderTable('comp-lb-year', yearRows, showCounts);

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
