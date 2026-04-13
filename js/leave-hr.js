// ─────────────────────────────────────────────
// İZİN & GEÇ KALMA — talepler, kurallar, özetler
// ─────────────────────────────────────────────

function _leaveEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLeaveAdmin() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

function _leaveFirmId() {
  return getActiveFirmId() || currentUser?.firm_id || null;
}

function defaultHrSettings() {
  return {
    annual_leave_days_default: 14,
    leave_affects_salary: true,
    leave_percent_per_day: 0,
    late_affects_salary: false,
    late_penalty_per_occurrence: 0,
  };
}

function mergeHr(raw) {
  return { ...defaultHrSettings(), ...(raw || {}) };
}

function leaveKindLabel(k) {
  const m = { annual: 'Yıllık', sick: 'Hastalık', unpaid: 'Ücretsiz', other: 'Diğer' };
  return m[k] || k || '—';
}

function leaveStatusLabel(s) {
  const m = { pending: 'Bekliyor', approved: 'Onaylı', rejected: 'Red' };
  return m[s] || s;
}

function calendarDaysInclusive(fromStr, toStr) {
  const a = new Date(fromStr + 'T12:00:00');
  const b = new Date(toStr + 'T12:00:00');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function currentYear() {
  return new Date().getFullYear();
}

function yearBoundsQuery(y) {
  return { gte: `${y}-01-01`, lte: `${y}-12-31` };
}

async function _userMapByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return {};
  try {
    const rows = await sb(`users?id=in.(${uniq.join(',')})&select=id,name,email`).catch(() => []);
    const m = {};
    for (const u of rows || []) m[u.id] = u;
    return m;
  } catch (e) {
    return {};
  }
}

async function getHrSettings(fid) {
  const rows = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  const hr = rows?.[0]?.settings?.hr;
  return mergeHr(hr);
}

async function loadLeavePage() {
  const fid = _leaveFirmId();
  const noFirmEl = document.getElementById('leave-no-firm');
  const mainEl = document.getElementById('leave-main');
  const sub = document.getElementById('leave-sub');
  renderFirmSelector('leave-firm-selector', loadLeavePage);

  const today = new Date().toISOString().slice(0, 10);
  const lf = document.getElementById('lr-from');
  const lt = document.getElementById('lr-to');
  if (lf && !lf.value) lf.value = today;
  if (lt && !lt.value) lt.value = today;
  onLeaveDatesChange();
  const ld = document.getElementById('late-date');
  if (ld && !ld.value) ld.value = today;

  if (isSuperAdmin() && !fid) {
    if (noFirmEl) noFirmEl.style.display = '';
    if (mainEl) mainEl.style.display = 'none';
    if (sub) sub.textContent = 'Firma seçin';
    return;
  }
  if (noFirmEl) noFirmEl.style.display = 'none';
  if (mainEl) {
    mainEl.style.display = 'flex';
    mainEl.style.flexDirection = 'column';
  }
  if (sub) sub.textContent = isLeaveAdmin() ? 'Kurallar, talepler ve geç kalma' : 'İzin talebi ve özet';

  const adm = document.getElementById('leave-admin-settings');
  const admLate = document.getElementById('leave-admin-late');
  const admEnt = document.getElementById('leave-admin-ent');
  const admPending = document.getElementById('leave-admin-pending');
  const admAll = document.getElementById('leave-admin-all');
  if (adm) adm.style.display = isLeaveAdmin() ? '' : 'none';
  if (admLate) admLate.style.display = isLeaveAdmin() ? '' : 'none';
  if (admEnt) admEnt.style.display = isLeaveAdmin() ? '' : 'none';
  if (admPending) admPending.style.display = isLeaveAdmin() ? '' : 'none';
  if (admAll) admAll.style.display = isLeaveAdmin() ? '' : 'none';

  await fillHrSettingsForm(fid);
  await refreshLeaveStats(fid);
  await loadMyLeaveRequests();
  await loadAdminLeaveTables(fid);
  await loadLateAdminTable(fid);
  await loadEntitlementsTable(fid);
  await fillLateUserSelect(fid);
}

async function fillHrSettingsForm(fid) {
  if (!isLeaveAdmin() || !fid) return;
  const h = await getHrSettings(fid);
  const a = document.getElementById('hr-annual-days');
  const aff = document.getElementById('hr-leave-affects');
  const pct = document.getElementById('hr-leave-pct');
  const laff = document.getElementById('hr-late-affects');
  const lp = document.getElementById('hr-late-penalty');
  if (a) a.value = h.annual_leave_days_default;
  if (aff) aff.checked = !!h.leave_affects_salary;
  if (pct) pct.value = h.leave_percent_per_day;
  if (laff) laff.checked = !!h.late_affects_salary;
  if (lp) lp.value = h.late_penalty_per_occurrence;
}

async function saveHrSettings() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const settings = { ...(firms?.[0]?.settings || {}) };
    settings.hr = {
      annual_leave_days_default: Number(document.getElementById('hr-annual-days')?.value) || 14,
      leave_affects_salary: !!document.getElementById('hr-leave-affects')?.checked,
      leave_percent_per_day: Number(document.getElementById('hr-leave-pct')?.value) || 0,
      late_affects_salary: !!document.getElementById('hr-late-affects')?.checked,
      late_penalty_per_occurrence: Number(document.getElementById('hr-late-penalty')?.value) || 0,
    };
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    toast('İK kuralları kaydedildi', 'ok');
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function refreshLeaveStats(fid) {
  const uid = currentUser?.id;
  const y = currentYear();
  const b = yearBoundsQuery(y);
  if (!fid || !uid) return;

  let usedDays = 0;
  let extraDays = 0;
  let lateCount = 0;
  let lateMins = 0;

  try {
    const reqs = await sb(
      `leave_requests?user_id=eq.${uid}&status=eq.approved&date_from=lte.${b.lte}&date_to=gte.${b.gte}&select=days_used,date_from,date_to`
    ).catch(() => []);
    for (const r of reqs || []) {
      usedDays += Number(r.days_used) || 0;
    }

    const ent = await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}&select=extra_days_granted`).catch(() => []);
    extraDays = Number(ent?.[0]?.extra_days_granted) || 0;

    const lates = await sb(
      `late_arrivals?user_id=eq.${uid}&day_date=gte.${b.gte}&day_date=lte.${b.lte}&select=minutes_late`
    ).catch(() => []);
    for (const L of lates || []) {
      lateCount += 1;
      lateMins += Number(L.minutes_late) || 0;
    }
  } catch (e) {
    console.warn('leave stats', e);
  }

  const hr = await getHrSettings(fid);
  const base = Number(hr.annual_leave_days_default) || 14;
  const remaining = Math.max(0, base + extraDays - usedDays);

  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setTxt('leave-stat-used', String(Math.round(usedDays * 100) / 100));
  setTxt('leave-stat-extra', String(Math.round(extraDays * 100) / 100));
  setTxt('leave-stat-remaining', String(Math.round(remaining * 100) / 100));
  setTxt('leave-stat-late-n', String(lateCount));
  setTxt('leave-stat-late-m', String(lateMins));

  const hint = document.getElementById('leave-salary-hint');
  if (hint) {
    const parts = [];
    if (hr.leave_affects_salary && hr.leave_percent_per_day > 0) {
      parts.push(`İzin: günlük ~%${hr.leave_percent_per_day} maaş etkisi (kurallara göre).`);
    } else if (!hr.leave_affects_salary) {
      parts.push('İzin: maaş kesintisi kapalı.');
    }
    if (hr.late_affects_salary && hr.late_penalty_per_occurrence > 0) {
      parts.push(`Geç kalma: olay başına ${hr.late_penalty_per_occurrence} (kurallara göre).`);
    } else if (!hr.late_affects_salary) {
      parts.push('Geç kalma: maaşa yansımıyor.');
    }
    hint.textContent = parts.length ? parts.join(' ') : 'Maaş etkisi firma kurallarına bağlı.';
  }
}

function onLeaveDatesChange() {
  const from = document.getElementById('lr-from')?.value;
  const to = document.getElementById('lr-to')?.value;
  const daysEl = document.getElementById('lr-days');
  if (!from || !to || !daysEl) return;
  daysEl.value = String(calendarDaysInclusive(from, to));
}

async function submitLeaveRequest() {
  const fid = _leaveFirmId();
  if (!fid) {
    toast('Firma bulunamadı', 'err');
    return;
  }
  const from = document.getElementById('lr-from')?.value;
  const to = document.getElementById('lr-to')?.value;
  const days = Number(document.getElementById('lr-days')?.value);
  const kind = document.getElementById('lr-kind')?.value || 'annual';
  const reason = document.getElementById('lr-reason')?.value?.trim() || '';
  if (!from || !to) {
    toast('Tarih aralığını seçin', 'err');
    return;
  }
  if (!days || days < 0.5) {
    toast('Gün sayısı geçersiz', 'err');
    return;
  }
  try {
    await sb('leave_requests', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: fid,
        user_id: currentUser.id,
        date_from: from,
        date_to: to,
        days_used: days,
        kind,
        reason: reason || null,
        status: 'pending',
      }),
    });
    toast('İzin talebi gönderildi', 'ok');
    document.getElementById('lr-reason').value = '';
    await loadMyLeaveRequests();
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function loadMyLeaveRequests() {
  const box = document.getElementById('leave-my-table');
  if (!box || !currentUser?.id) return;
  try {
    const rows =
      (await sb(
        `leave_requests?user_id=eq.${currentUser.id}&order=created_at.desc&limit=50&select=*`
      ).catch(() => null)) || [];
    if (!rows.length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Henüz talep yok</div>';
      return;
    }
    box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Tür</th><th>Durum</th><th>Not</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(r.date_from)}</td>
<td>${_leaveEsc(r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveKindLabel(r.kind))}</td>
<td>${_leaveEsc(leaveStatusLabel(r.status))}</td>
<td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;">${_leaveEsc(r.admin_comment || '—')}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px;">${ _leaveEsc(e.message) }</div>`;
  }
}

async function loadAdminLeaveTables(fid) {
  if (!isLeaveAdmin() || !fid) return;
  const pend = document.getElementById('leave-pending-table');
  const all = document.getElementById('leave-all-table');
  try {
    const pendingRows =
      (await sb(
        `leave_requests?firm_id=eq.${fid}&status=eq.pending&order=created_at.asc&limit=100&select=*`
      ).catch(() => [])) || [];
    const pendU = await _userMapByIds(pendingRows.map((r) => r.user_id));
    if (pend) {
      if (!pendingRows.length) {
        pend.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bekleyen talep yok</div>';
      } else {
        pend.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Agent</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Tür</th><th>Açıklama</th><th></th>
</tr></thead>
<tbody>
${pendingRows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(pendU[r.user_id]?.name || pendU[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(r.date_from)}</td>
<td>${_leaveEsc(r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveKindLabel(r.kind))}</td>
<td style="max-width:120px;">${_leaveEsc(r.reason || '—')}</td>
<td style="white-space:nowrap;">
<button type="button" class="btn btn-primary btn-sm" onclick="approveLeaveRequest('${r.id}')">Onayla</button>
<button type="button" class="btn btn-ghost btn-sm" onclick="rejectLeaveRequest('${r.id}')">Red</button>
</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }

    const allRows =
      (await sb(`leave_requests?firm_id=eq.${fid}&order=created_at.desc&limit=80&select=*`).catch(() => [])) || [];
    const allU = await _userMapByIds(allRows.map((r) => r.user_id));
    if (all) {
      if (!allRows.length) {
        all.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Kayıt yok</div>';
      } else {
        all.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Agent</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Durum</th><th>Tarih</th>
</tr></thead>
<tbody>
${allRows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(allU[r.user_id]?.name || allU[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(r.date_from)}</td>
<td>${_leaveEsc(r.date_to)}</td>
<td>${_leaveEsc(r.days_used)}</td>
<td>${_leaveEsc(leaveStatusLabel(r.status))}</td>
<td>${_leaveEsc((r.created_at || '').slice(0, 16).replace('T', ' '))}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }
  } catch (e) {
    if (pend) pend.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}

async function approveLeaveRequest(id) {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  try {
    await sb(`leave_requests?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'approved',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        admin_comment: null,
      }),
    });
    toast('Talep onaylandı', 'ok');
    await loadAdminLeaveTables(fid);
    await loadMyLeaveRequests();
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function rejectLeaveRequest(id) {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const c = prompt('Red notu (isteğe bağlı):');
  if (c === null) return;
  try {
    await sb(`leave_requests?id=eq.${id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        status: 'rejected',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        admin_comment: c || null,
      }),
    });
    toast('Talep reddedildi', 'ok');
    await loadAdminLeaveTables(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function fillLateUserSelect(fid) {
  const sel = document.getElementById('late-user');
  const ent = document.getElementById('ent-user');
  if (!isLeaveAdmin() || !fid) return;
  try {
    const users = await sb(`users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&select=id,name,email&order=name.asc`).catch(() => []);
    const opts = (users || []).map((u) => `<option value="${u.id}">${_leaveEsc(u.name || u.email)}</option>`).join('');
    if (sel) sel.innerHTML = `<option value="">Agent seç…</option>` + opts;
    if (ent) ent.innerHTML = `<option value="">Kullanıcı seç…</option>` + opts;
  } catch (e) {
    if (sel) sel.innerHTML = '<option value="">Yüklenemedi</option>';
  }
}

async function submitLateArrival() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const uid = document.getElementById('late-user')?.value;
  const day = document.getElementById('late-date')?.value;
  const mins = Number(document.getElementById('late-mins')?.value);
  const note = document.getElementById('late-note')?.value?.trim() || '';
  if (!uid || !day) {
    toast('Agent ve tarih seçin', 'err');
    return;
  }
  if (mins == null || mins < 0) {
    toast('Dakika geçersiz', 'err');
    return;
  }
  try {
    await sb('late_arrivals', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        firm_id: fid,
        user_id: uid,
        day_date: day,
        minutes_late: mins,
        note: note || null,
        recorded_by: currentUser.id,
      }),
    });
    toast('Geç kalma kaydedildi', 'ok');
    document.getElementById('late-note').value = '';
    await loadLateAdminTable(fid);
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function loadLateAdminTable(fid) {
  const box = document.getElementById('leave-late-table');
  if (!box || !isLeaveAdmin() || !fid) return;
  const y = currentYear();
  const b = yearBoundsQuery(y);
  try {
    const rows =
      (await sb(
        `late_arrivals?firm_id=eq.${fid}&day_date=gte.${b.gte}&day_date=lte.${b.lte}&order=day_date.desc&limit=100&select=*`
      ).catch(() => [])) || [];
    const umap = await _userMapByIds(rows.map((r) => r.user_id));
    if (!rows.length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bu yıl kayıt yok</div>';
      return;
    }
    box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);">
<th>Tarih</th><th>Agent</th><th>Dakika</th><th>Not</th>
</tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
<td>${_leaveEsc(r.day_date)}</td>
<td>${_leaveEsc(umap[r.user_id]?.name || umap[r.user_id]?.email || '—')}</td>
<td>${_leaveEsc(r.minutes_late)}</td>
<td>${_leaveEsc(r.note || '—')}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}

async function saveExtraLeaveDays() {
  const fid = _leaveFirmId();
  if (!fid || !isLeaveAdmin()) return;
  const uid = document.getElementById('ent-user')?.value;
  const y = Number(document.getElementById('ent-year')?.value) || currentYear();
  const extra = Number(document.getElementById('ent-days')?.value);
  if (!uid) {
    toast('Kullanıcı seçin', 'err');
    return;
  }
  if (extra == null || extra < 0) {
    toast('Ek gün geçersiz', 'err');
    return;
  }
  try {
    const existing = await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}&select=user_id`).catch(() => []);
    if (existing?.length) {
      await sb(`user_leave_entitlements?user_id=eq.${uid}&year=eq.${y}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ extra_days_granted: extra }),
      });
    } else {
      await sb('user_leave_entitlements', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({ user_id: uid, year: y, extra_days_granted: extra }),
      });
    }
    toast('Ek izin günü kaydedildi', 'ok');
    await loadEntitlementsTable(fid);
    await refreshLeaveStats(fid);
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function loadEntitlementsTable(fid) {
  const box = document.getElementById('leave-ent-table');
  if (!isLeaveAdmin() || !fid) return;

  try {
    const users = await sb(`users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&select=id,name,email&order=name.asc`).catch(() => []);
    const ey = document.getElementById('ent-year');
    if (ey && !ey.value) ey.value = String(currentYear());

    if (box) {
      const y = currentYear();
      const ids = (users || []).map((u) => u.id);
      let rows = [];
      if (ids.length) {
        rows = (await sb(`user_leave_entitlements?year=eq.${y}&user_id=in.(${ids.join(',')})&select=*`).catch(() => [])) || [];
      }
      const firmUserIds = new Set((users || []).map((u) => u.id));
      const filtered = rows.filter((r) => firmUserIds.has(r.user_id));
      const nameById = Object.fromEntries((users || []).map((u) => [u.id, u.name || u.email]));
      if (!filtered.length) {
        box.innerHTML = '<div style="color:var(--text-3);font-size:12px;">Bu yıl ek gün tanımı yok</div>';
      } else {
        box.innerHTML = `
<table class="data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
<thead><tr style="text-align:left;color:var(--text-3);"><th>Kullanıcı</th><th>Yıl</th><th>Ek gün</th></tr></thead>
<tbody>
${filtered
  .map(
    (r) => `<tr><td>${_leaveEsc(nameById[r.user_id] || r.user_id)}</td><td>${r.year}</td><td>${_leaveEsc(r.extra_days_granted)}</td></tr>`
  )
  .join('')}
</tbody></table>`;
      }
    }
  } catch (e) {
    if (box) box.innerHTML = `<div style="color:var(--red);">${ _leaveEsc(e.message) }</div>`;
  }
}
