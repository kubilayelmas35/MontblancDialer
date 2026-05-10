// ─────────────────────────────────────────────
// SMS Hatırlatma Ayarları — firms.settings.sms_reminder
// ─────────────────────────────────────────────

let _smsSettingsFirmId = null;
let _smsCachedConfig   = null; // { enabled, telnyx_api_key, from_number, template }

// ── Settings Page ─────────────────────────────

async function loadSmsSettingsPage() {
  const card = document.getElementById('sms-settings-card');
  if (!card) return;
  const role = currentUser?.role || '';
  const canView = ['admin', 'firm_admin', 'super_admin'].includes(role);
  card.style.display = canView ? '' : 'none';
  if (!canView) return;

  _smsSettingsFirmId = currentUser.firm_id || null;
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

async function showQcSmsPrompt(contactPhone, contactName, apptDate, apptTime) {
  const cfg = await _getSmsConfig();
  if (!cfg?.enabled || !cfg?.template) return; // SMS not configured or disabled
  if (!contactPhone) return;

  const name = (contactName || '').trim() || 'Musteri';
  const dateStr = apptDate || '—';
  const timeStr = apptTime ? apptTime.slice(0, 5) : '—';

  const message = cfg.template
    .replace(/\{isim\}/g, name)
    .replace(/\{tarih\}/g, dateStr)
    .replace(/\{saat\}/g, timeStr);

  _pendingQcSms = { to_phone: contactPhone, message, firm_id: currentUser?.firm_id };

  const preview = document.getElementById('qc-sms-preview');
  const toEl    = document.getElementById('qc-sms-to');
  if (preview) preview.textContent = message;
  if (toEl)    toEl.textContent = `Alici: ${contactPhone}`;

  openModal('m-qc-sms');
}

async function sendQcSmsConfirm() {
  if (!_pendingQcSms) { closeModal('m-qc-sms'); return; }
  const btn = document.querySelector('#m-qc-sms .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Gonderiliyor…'; }

  try {
    const resp = await fetch(`${SB_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(_pendingQcSms),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'SMS gonderilemedi');
    toast('SMS basariyla gonderildi', 'ok');
  } catch (e) {
    toast('SMS hatasi: ' + e.message, 'err');
  } finally {
    _pendingQcSms = null;
    closeModal('m-qc-sms');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> SMS Gonder'; }
  }
}

try {
  window.loadSmsSettingsPage  = loadSmsSettingsPage;
  window.saveSmsSettings      = saveSmsSettings;
  window.showQcSmsPrompt      = showQcSmsPrompt;
  window.sendQcSmsConfirm     = sendQcSmsConfirm;
} catch (_) {}
