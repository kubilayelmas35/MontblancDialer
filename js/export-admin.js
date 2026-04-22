// ─────────────────────────────────────────────
// Dışa aktarım — admin (CSV / Excel)
// ─────────────────────────────────────────────

function isExportAdmin() {
  return ['admin', 'firm_admin', 'super_admin'].includes(currentUser?.role || '');
}

function updateCallHistoryExportVisibility() {
  const el = document.getElementById('ch-export-btns');
  const hint = document.getElementById('ch-export-hint');
  const ok = isExportAdmin();
  if (el) el.style.display = ok ? 'flex' : 'none';
  if (hint) hint.style.display = ok ? 'block' : 'none';
}

function _escapeCsvCell(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function _downloadCsvUtf8(filename, lineStrings) {
  const body = lineStrings.join('\r\n');
  const bom = '\ufeff';
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _statsTableToAoA() {
  const table = document.querySelector('#stats-tbody');
  if (!table) return null;
  const header = ['Agent', 'Kampanya', 'Toplam', 'Termin', 'Olumsuz', 'Geri Ara', 'Cevap Yok', 'Ort. Süre', 'Dönüşüm'];
  const aoa = [header];
  table.querySelectorAll('tr').forEach((tr) => {
    const tds = tr.querySelectorAll('td');
    if (!tds.length) return;
    aoa.push(Array.from(tds).map((td) => td.textContent.trim()));
  });
  return aoa;
}

function exportStatsCsv() {
  const aoa = _statsTableToAoA();
  if (!aoa || aoa.length < 2) {
    toast(t('ui.no_rows_export'), 'warn');
    return;
  }
  const lines = aoa.map((row) => row.map(_escapeCsvCell).join(','));
  _downloadCsvUtf8(`istatistik_${new Date().toISOString().slice(0, 10)}.csv`, lines);
  toast(t('ui.csv_downloaded'), 'ok');
}

function exportStatsXlsx() {
  if (typeof XLSX === 'undefined') {
    toast(t('ui.excel_lib_missing'), 'err');
    return;
  }
  const aoa = _statsTableToAoA();
  if (!aoa || aoa.length < 2) {
    toast(t('ui.no_rows_export'), 'warn');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Istatistik');
  XLSX.writeFile(wb, `istatistik_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(t('ui.excel_downloaded'), 'ok');
}

function _chOutcomeLabel(o) {
  const tr = {
    appointment: 'Termin',
    appointment_done: 'Termin',
    negative: 'Olumsuz',
    callback: 'Geri Ara',
    voicemail: 'Telesekreter',
    no_answer: 'Cevap Yok',
    dnc: 'Kara Liste',
  };
  const de = {
    appointment: 'Termin',
    appointment_done: 'Termin',
    negative: 'Negativ',
    callback: 'Rückruf',
    voicemail: 'Mailbox',
    no_answer: 'Keine Antwort',
    dnc: 'DNC',
  };
  const m = currentLang === 'de' ? de : tr;
  return m[o] || o || '';
}

function _buildCallHistoryQueryForExport() {
  const ff = getFirmFilter('&');
  const search = document.getElementById('ch-search')?.value?.toLowerCase() || '';
  const outcome = document.getElementById('ch-outcome')?.value || '';
  const agentFilter = document.getElementById('ch-agent-f')?.value || '';
  const dateFrom = document.getElementById('ch-date-from')?.value || new Date().toISOString().split('T')[0];
  const dateTo = document.getElementById('ch-date-to')?.value || new Date().toISOString().split('T')[0];
  let query = `call_logs?select=*,users(id,name),campaigns(name),contacts(first_name,last_name,phone)${ff}&order=started_at.desc&limit=8000`;
  query += `&started_at=gte.${dateFrom}T00:00:00`;
  query += `&started_at=lte.${dateTo}T23:59:59`;
  if (outcome) query += outcome === 'appointment' ? `&outcome=in.(appointment,appointment_done)` : `&outcome=eq.${outcome}`;
  if (agentFilter) query += `&agent_id=eq.${agentFilter}`;
  return { query, search };
}

async function _fetchCallHistoryExportRows() {
  const { query, search } = _buildCallHistoryQueryForExport();
  let logs = (await sb(query).catch(() => [])) || [];
  if (search) {
    logs = logs.filter((l) => {
      const name = `${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.toLowerCase();
      const phone = l.phone || l.contacts?.phone || '';
      const agent = l.users?.name?.toLowerCase() || '';
      return name.includes(search) || String(phone).includes(search) || agent.includes(search);
    });
  }
  return logs;
}

function _logToExportRow(l) {
  const dt = l.started_at ? new Date(l.started_at).toLocaleString('tr-TR') : '';
  const name = `${l.contacts?.first_name || ''} ${l.contacts?.last_name || ''}`.trim() || '—';
  const phone = l.phone || l.contacts?.phone || '—';
  const agent = l.users?.name || '—';
  const camp = l.campaigns?.name || '—';
  const durSec = l.duration_sec != null ? l.duration_sec : '';
  const durStr =
    l.duration_sec != null ? `${Math.floor(l.duration_sec / 60)}:${String(l.duration_sec % 60).padStart(2, '0')}` : '';
  const oc = _chOutcomeLabel(l.outcome);
  const notes = (l.notes || '').replace(/\r?\n/g, ' ');
  const cb = l.callback_at ? new Date(l.callback_at).toLocaleString('tr-TR') : '';
  const rec = l.recording_url || '';
  return [dt, name, phone, agent, camp, durStr, durSec, oc, notes, cb, rec];
}

async function exportCallHistoryCsv() {
  if (!isExportAdmin()) return;
  try {
    const logs = await _fetchCallHistoryExportRows();
    if (!logs.length) {
      toast(t('ui.no_row_short'), 'warn');
      return;
    }
    const head = [
      'Tarih/Saat',
      'Müşteri',
      'Telefon',
      'Agent',
      'Kampanya',
      'Süre',
      'Süre_sn',
      'Sonuç',
      'Not',
      'Geri arama',
      'Kayıt URL',
    ];
    const lines = [head.map(_escapeCsvCell).join(',')];
    for (const l of logs) {
      lines.push(_logToExportRow(l).map(_escapeCsvCell).join(','));
    }
    const d0 = document.getElementById('ch-date-from')?.value || '';
    const d1 = document.getElementById('ch-date-to')?.value || '';
    _downloadCsvUtf8(`cagri_gecmisi_${d0}_${d1}.csv`, lines);
    toast(t('ui.csv_downloaded'), 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}

async function exportCallHistoryXlsx() {
  if (!isExportAdmin()) return;
  if (typeof XLSX === 'undefined') {
    toast(t('ui.excel_lib_missing'), 'err');
    return;
  }
  try {
    const logs = await _fetchCallHistoryExportRows();
    if (!logs.length) {
      toast(t('ui.no_row_short'), 'warn');
      return;
    }
    const head = [
      'Tarih/Saat',
      'Müşteri',
      'Telefon',
      'Agent',
      'Kampanya',
      'Süre',
      'Süre_sn',
      'Sonuç',
      'Not',
      'Geri arama',
      'Kayıt URL',
    ];
    const aoa = [head];
    for (const l of logs) aoa.push(_logToExportRow(l));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cagrilar');
    const d0 = document.getElementById('ch-date-from')?.value || '';
    const d1 = document.getElementById('ch-date-to')?.value || '';
    XLSX.writeFile(wb, `cagri_gecmisi_${d0}_${d1}.xlsx`);
    toast(t('ui.excel_downloaded'), 'ok');
  } catch (e) {
    toast('Hata: ' + e.message, 'err');
  }
}
