// ─────────────────────────────────────────────
// SMS Hatırlatma Ayarları — firms.settings.sms_reminder
// ─────────────────────────────────────────────

let _smsSettingsFirmId = null;
let _smsCachedConfig   = null; // { enabled, telnyx_api_key, from_number, template }

// ── Settings Page ─────────────────────────────

async function loadSmsSettingsPage() {
  const card = document.getElementById('sms-settings-card');
  if (!card) return;
  const canView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  const firmRow = document.getElementById('sms-settings-firm-row');
  const firmSel = document.getElementById('sms-settings-firm-select');
  if (firmRow) firmRow.style.display = '';
  if (firmSel && !firmSel.options.length) {
    const firms = await sb('firms?is_active=eq.true&select=id,name&order=name').catch(() => []);
    firmSel.innerHTML = (firms || []).map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
  }
  _smsSettingsFirmId = firmSel?.value || currentUser?.firm_id || null;
  await _renderSmsSettingsForm();
}

async function onSmsSettingsFirmChange() {
  _smsSettingsFirmId = document.getElementById('sms-settings-firm-select')?.value || null;
  _smsCachedConfig = null;
  await _renderSmsSettingsForm();
}

async function _renderSmsSettingsForm() {
  const fid = _smsSettingsFirmId;
  if (!fid) return;
  const firms = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  const cfg = firms?.[0]?.settings?.sms_reminder || {};
  _smsCachedConfig = cfg;

  const chk = document.getElementById('sms-enabled-chk');
  const keyEl = document.getElementById('sms-telnyx-key');
  const fromEl = document.getElementById('sms-from-number');
  const tplEl = document.getElementById('sms-template');

  if (chk) chk.checked = cfg.enabled === true;
  if (keyEl) keyEl.value = cfg.telnyx_api_key || '';
  if (fromEl) fromEl.value = cfg.from_number || '';
  if (tplEl) tplEl.value = cfg.template || 'Sayin {isim}, randevunuz {tarih} tarihinde saat {saat} icin onaylandi. Iyi gunler, Montblanc CS.';
}

async function saveSmsSettings() {
  if (!(typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin())) return;
  const fid = _smsSettingsFirmId || currentUser?.firm_id;
  if (!fid) { toast('Firma bulunamadi', 'err'); return; }

  const enabled = document.getElementById('sms-enabled-chk')?.checked || false;
  const apiKey  = document.getElementById('sms-telnyx-key')?.value.trim() || '';
  const fromNum = document.getElementById('sms-from-number')?.value.trim() || '';
  const template = document.getElementById('sms-template')?.value.trim() || '';

  const firms = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};

  const updated = { ...existing, sms_reminder: { enabled, telnyx_api_key: apiKey, from_number: fromNum, template } };
  await sb(`firms?id=eq.${fid}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ settings: updated }) });

  _smsCachedConfig = updated.sms_reminder;
  toast('SMS ayarlari kaydedildi', 'ok');
}

// ── Get config (cached or fresh) ──────────────

async function _getSmsConfig() {
  if (_smsCachedConfig) return _smsCachedConfig;
  const fid = currentUser?.firm_id;
  if (!fid) return null;
  const firms = await sb(`firms?id=eq.${fid}&select=settings`).catch(() => []);
  _smsCachedConfig = firms?.[0]?.settings?.sms_reminder || {};
  return _smsCachedConfig;
}

// ── QC SMS Prompt ─────────────────────────────

let _pendingQcSms = null; // { to_phone, message, firm_id }

async function _mbPostJson(path, body) {
  const resp = await fetch(`${SB_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await resp.json(); } catch (e) {}
  if (!resp.ok) {
    const detail = data?.details?.errors?.[0]?.detail || data?.details?.errors?.[0]?.title || data?.error || 'gönderilemedi';
    throw new Error(String(detail));
  }
  return data;
}

function mbDownloadApptIcs(pending) {
  const date = String(pending?.date || '').slice(0, 10).replace(/-/g, '');
  const time = String(pending?.time || '').slice(0, 5).replace(':', '');
  const stamp = date && time ? `${date}T${time}00` : '';
  const name = String(pending?.name || 'Randevu').replace(/[\r\n,;]/g, ' ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Montblanc Dialer//TR',
    'BEGIN:VEVENT',
    stamp ? `DTSTART:${stamp}` : '',
    `SUMMARY:${name}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'randevu.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

async function mbDeliverApptNotice(info) {
  const campaignId = info?.campaignId;
  if (!campaignId || typeof getCampSettings !== 'function') return;
  let camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((c) => String(c.id) === String(campaignId));
  if (!camp && typeof sb === 'function') {
    const rows = await sb(`campaigns?id=eq.${campaignId}&select=id,name,settings,firm_id`).catch(() => []);
    camp = rows?.[0];
  }
  if (!camp) return;
  const s = getCampSettings(camp);
  if (String(s.webhook_url || '').trim()) {
    _mbPostJson('camp-notify', {
      action: 'webhook',
      campaign_id: campaignId,
      payload: info.payload || {},
    }).then((data) => {
      if (data?.skipped) return;
      toast(campT('camp.notif.hook.ok', 'Webhook gitti'), 'ok', 1800);
    }).catch((e) => {
      toast('Webhook: ' + e.message, 'err', 4200);
    });
  }
  const channels = [];
  if (s.notif_sms) channels.push('sms');
  if (s.notif_whatsapp) channels.push('whatsapp');
  if (s.notif_email) channels.push('email');
  if (!channels.length) return;
  const cfg = await _getSmsConfig();
  const name = String(info.name || '').trim() || 'Musteri';
  const dateStr = info.date || '—';
  const timeStr = info.time ? String(info.time).slice(0, 5) : '—';
  const template = cfg?.template || 'Sayin {isim}, randevunuz {tarih} tarihinde saat {saat} icin onaylandi.';
  const message = template.replace(/\{isim\}/g, name).replace(/\{tarih\}/g, dateStr).replace(/\{saat\}/g, timeStr);
  const pending = {
    to_phone: info.phone || '',
    message,
    firm_id: info.firmId || currentUser?.firm_id,
    channels,
    name,
    date: dateStr,
    time: timeStr,
  };
  const needsPhone = channels.includes('sms') || channels.includes('whatsapp');
  const smsReady = !!(cfg?.enabled && cfg?.telnyx_api_key && cfg?.from_number);
  if (needsPhone && !pending.to_phone) toast(campT('camp.notif.no_phone', 'Telefon yok, mesaj gitmedi'), 'warn', 3200);
  if (needsPhone && pending.to_phone && !smsReady) toast(campT('camp.notif.sms_off', 'SMS ayarı kapalı. Ayarlar’dan Telnyx SMS açın.'), 'warn', 4200);
  if (needsPhone && (!pending.to_phone || !smsReady)) pending.channels = channels.filter((c) => c === 'email');
  if (!pending.channels.length) return;
  if (s.notif_auto) {
    _pendingQcSms = pending;
    await sendQcSmsConfirm();
    return;
  }
  _pendingQcSms = pending;
  const preview = document.getElementById('qc-sms-preview');
  const toEl = document.getElementById('qc-sms-to');
  if (preview) preview.textContent = message;
  if (toEl) toEl.textContent = [pending.to_phone ? `Alici: ${pending.to_phone}` : '', channels.join(', ')].filter(Boolean).join(' · ');
  if (typeof openModal === 'function') openModal('m-qc-sms');
}

async function showQcSmsPrompt(contactPhone, contactName, apptDate, apptTime, opts) {
  const cfg = await _getSmsConfig();
  if (!cfg?.enabled || !cfg?.template) return;
  if (!contactPhone) return;

  const name = (contactName || '').trim() || 'Musteri';
  const dateStr = apptDate || '—';
  const timeStr = apptTime ? apptTime.slice(0, 5) : '—';

  const message = cfg.template
    .replace(/\{isim\}/g, name)
    .replace(/\{tarih\}/g, dateStr)
    .replace(/\{saat\}/g, timeStr);

  _pendingQcSms = { to_phone: contactPhone, message, firm_id: currentUser?.firm_id, channels: opts?.channels || ['sms'], name, date: dateStr, time: timeStr };

  const preview = document.getElementById('qc-sms-preview');
  const toEl    = document.getElementById('qc-sms-to');
  if (preview) preview.textContent = message;
  if (toEl)    toEl.textContent = `Alici: ${contactPhone}`;

  openModal('m-qc-sms');
}

async function sendQcSmsConfirm() {
  if (!_pendingQcSms) { closeModal('m-qc-sms'); return; }
  const pending = _pendingQcSms;
  const channels = pending.channels || ['sms'];
  const btn = document.querySelector('#m-qc-sms .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Gonderiliyor…'; }
  const errors = [];
  try {
    if (channels.includes('sms') && pending.to_phone) {
      try { await _mbPostJson('send-sms', { to_phone: pending.to_phone, message: pending.message, firm_id: pending.firm_id }); }
      catch (e) { errors.push('SMS: ' + e.message); }
    }
    if (channels.includes('whatsapp') && pending.to_phone) {
      try { await _mbPostJson('camp-notify', { action: 'whatsapp', to_phone: pending.to_phone, message: pending.message, firm_id: pending.firm_id }); }
      catch (e) { errors.push('WhatsApp: ' + e.message); }
    }
    if (channels.includes('email')) mbDownloadApptIcs(pending);
    if (errors.length) toast(errors.join(' · '), 'err', 5200);
    else if (channels.some((c) => c === 'sms' || c === 'whatsapp')) toast(campT('camp.notif.sent', 'Mesaj gönderildi'), 'ok');
  } finally {
    _pendingQcSms = null;
    closeModal('m-qc-sms');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> SMS Gönder'; }
  }
}

try {
  window.loadSmsSettingsPage  = loadSmsSettingsPage;
  window.saveSmsSettings      = saveSmsSettings;
  window.showQcSmsPrompt      = showQcSmsPrompt;
  window.sendQcSmsConfirm     = sendQcSmsConfirm;
  window.mbDeliverApptNotice  = mbDeliverApptNotice;
} catch (_) {}
