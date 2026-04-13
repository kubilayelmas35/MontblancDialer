// ─────────────────────────────────────────────
// AYIN ELEMANI — özet kartı + admin atama
// ─────────────────────────────────────────────

function _eomEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _eomIsAdmin() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

function _eomFirmId() {
  return getActiveFirmId() || currentUser?.firm_id || null;
}

function _eomMonthLabel(y, m) {
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(currentLang === 'tr' ? 'tr-TR' : 'de-DE', { month: 'long', year: 'numeric' });
}

async function loadDashEmployeeOfMonth() {
  const card = document.getElementById('dash-eom-card');
  const nameEl = document.getElementById('dash-eom-name');
  const periodEl = document.getElementById('dash-eom-period');
  const noteEl = document.getElementById('dash-eom-note');
  const adminEl = document.getElementById('dash-eom-admin');
  if (!card) return;

  const fid = _eomFirmId();
  if (isSuperAdmin() && !fid) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  if (nameEl) nameEl.textContent = '…';
  if (periodEl) periodEl.textContent = _eomMonthLabel(y, m);
  if (noteEl) {
    noteEl.textContent = '';
    noteEl.style.display = 'none';
  }

  try {
    const rows =
      (await sb(`employee_of_month?firm_id=eq.${fid}&year=eq.${y}&month=eq.${m}&select=*&limit=1`).catch(() => [])) || [];
    const row = rows[0];
    if (!row) {
      if (nameEl) {
        nameEl.textContent =
          currentLang === 'tr' ? 'Henüz seçilmedi' : 'Noch nicht gewählt';
      }
      const av = document.getElementById('dash-eom-av');
      if (av) {
        av.textContent = '—';
        av.style.opacity = '0.35';
      }
    } else {
      const users = await sb(`users?id=eq.${row.user_id}&select=name,email`).catch(() => []);
      const u = users?.[0];
      if (nameEl) nameEl.textContent = u?.name || u?.email || row.user_id.slice(0, 8);
      const av = document.getElementById('dash-eom-av');
      if (av) {
        const nm = u?.name || u?.email || '?';
        av.textContent = String(nm).charAt(0).toUpperCase();
        av.style.opacity = '1';
      }
      if (noteEl && row.note) {
        noteEl.style.display = '';
        noteEl.textContent = row.note;
      }
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = '—';
    const av = document.getElementById('dash-eom-av');
    if (av) {
      av.textContent = '?';
      av.style.opacity = '0.35';
    }
    console.warn('eom', e);
  }

  if (adminEl) {
    adminEl.style.display = _eomIsAdmin() ? '' : 'none';
    if (_eomIsAdmin()) await _eomFillAdminForm(fid, y, m);
  }
}

async function _eomFillAdminForm(fid, defaultY, defaultM) {
  const selUser = document.getElementById('eom-user');
  const selY = document.getElementById('eom-year');
  const selM = document.getElementById('eom-month');
  const noteIn = document.getElementById('eom-note');
  if (!selUser || !fid) return;

  if (selY) selY.value = String(defaultY);
  if (selM) selM.value = String(defaultM);

  try {
    const users = await sb(`users?firm_id=eq.${fid}&role=in.(agent,qc,firm_admin)&select=id,name,email&order=name.asc`).catch(() => []);
    const opts = (users || [])
      .map((u) => `<option value="${u.id}">${String(u.name || u.email).replace(/</g, '&lt;')}</option>`)
      .join('');
    selUser.innerHTML = `<option value="">${currentLang === 'tr' ? 'Agent seç…' : 'Agent wählen…'}</option>` + opts;

    const y = Number(selY?.value) || defaultY;
    const m = Number(selM?.value) || defaultM;
    const rows =
      (await sb(`employee_of_month?firm_id=eq.${fid}&year=eq.${y}&month=eq.${m}&select=*`).catch(() => [])) || [];
    const row = rows[0];
    if (row) {
      selUser.value = row.user_id;
      if (noteIn) noteIn.value = row.note || '';
    } else {
      if (noteIn) noteIn.value = '';
    }
  } catch (e) {
    console.warn(e);
  }

  await _eomLoadHistory(fid);
}

async function _eomLoadHistory(fid) {
  const box = document.getElementById('eom-history');
  if (!box || !fid) return;
  try {
    const rows =
      (await sb(`employee_of_month?firm_id=eq.${fid}&select=*&order=created_at.desc&limit=12`).catch(() => [])) || [];
    if (!rows.length) {
      box.innerHTML = `<div style="font-size:11px;color:var(--text-3);">${currentLang === 'tr' ? 'Kayıt yok' : 'Keine Einträge'}</div>`;
      return;
    }
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const users = ids.length ? await sb(`users?id=in.(${ids.join(',')})&select=id,name`).catch(() => []) : [];
    const nm = Object.fromEntries((users || []).map((u) => [u.id, u.name]));
    box.innerHTML = rows
      .map((r) => {
        const label = _eomMonthLabel(r.year, r.month);
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:4px 0;border-bottom:1px solid var(--border);">
<span style="color:var(--text-3);">${_eomEsc(label)}</span>
<span style="font-weight:700;">${_eomEsc(nm[r.user_id] || r.user_id.slice(0, 8))}</span>
</div>`;
      })
      .join('');
  } catch (e) {
    box.innerHTML = '';
  }
}

async function saveDashEmployeeOfMonth() {
  const fid = _eomFirmId();
  if (!fid || !_eomIsAdmin()) return;
  const uid = document.getElementById('eom-user')?.value;
  const y = Number(document.getElementById('eom-year')?.value);
  const m = Number(document.getElementById('eom-month')?.value);
  const note = document.getElementById('eom-note')?.value?.trim() || null;
  if (!uid || !y || !m || m < 1 || m > 12) {
    toast(currentLang === 'tr' ? 'Yıl, ay ve agent seçin' : 'Jahr, Monat und Agent wählen', 'err');
    return;
  }
  try {
    const existing = await sb(`employee_of_month?firm_id=eq.${fid}&year=eq.${y}&month=eq.${m}&select=id`).catch(() => []);
    const payload = {
      user_id: uid,
      note,
      set_by: currentUser.id,
    };
    if (existing?.length) {
      await sb(`employee_of_month?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(payload),
      });
    } else {
      await sb('employee_of_month', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          firm_id: fid,
          year: y,
          month: m,
          ...payload,
        }),
      });
    }
    toast(currentLang === 'tr' ? 'Kaydedildi' : 'Gespeichert', 'ok');
    await loadDashEmployeeOfMonth();
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

function onEomPeriodChange() {
  const fid = _eomFirmId();
  if (!fid || !_eomIsAdmin()) return;
  const y = Number(document.getElementById('eom-year')?.value);
  const m = Number(document.getElementById('eom-month')?.value);
  _eomFillAdminForm(fid, y, m);
}
