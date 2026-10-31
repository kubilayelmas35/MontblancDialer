// Hat, API anahtarları ve SMS — firma satırı açılınca

let _lineRows = [];
let _lineOpenId = null;
let _lineLoadGen = 0;
let _lineSaving = false;
let _campDidGen = 0;
let _newDidGen = 0;

function mbLineT(key, fallback) {
  const msg = typeof t === 'function' ? t(key) : fallback;
  return !msg || msg === key ? fallback : msg;
}

function mbLineEsc(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
}

function mbNormDid(value) {
  const s = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}

const MB_CALLING_CODES = ['1','7','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86','90','91','92','93','94','95','98','211','212','213','216','218','220','221','222','223','224','225','226','227','228','229','230','231','232','233','234','235','236','237','238','239','240','241','242','243','244','245','246','248','249','250','251','252','253','254','255','256','257','258','260','261','262','263','264','265','266','267','268','269','290','291','297','298','299','350','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','378','380','381','382','383','385','386','387','389','420','421','423','500','501','502','503','504','505','506','507','508','509','590','591','592','593','594','595','596','597','598','599','670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687','688','689','690','691','692','850','852','853','855','856','880','886','960','961','962','963','964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994','995','996','998'];
let _mbCallingCodes = null;

function mbCallingCode(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (!digits) return '';
  if (!_mbCallingCodes) _mbCallingCodes = MB_CALLING_CODES.slice().sort((a, b) => b.length - a.length);
  return _mbCallingCodes.find((code) => digits.startsWith(code)) || '';
}

function mbDestinationCallingCode(callerDid, raw) {
  const callerCc = mbCallingCode(callerDid);
  let dest = String(raw || '').replace(/[^\d+]/g, '');
  if (dest.startsWith('00')) dest = '+' + dest.slice(2);
  if (!dest.startsWith('+')) return callerCc;
  return mbCallingCode(dest);
}

function mbIntlMismatch(callerDid, destination) {
  const callerCc = mbCallingCode(callerDid);
  if (!callerCc) return false;
  const destCc = mbDestinationCallingCode(callerDid, destination);
  return !destCc || destCc !== callerCc;
}

function mbLineLocalNumbers(settings) {
  const raw = Array.isArray(settings?.line_local) ? settings.line_local : [];
  const out = [];
  raw.forEach((item) => {
    const n = mbNormDid(typeof item === 'string' ? item : item?.number);
    if (n && !out.includes(n)) out.push(n);
  });
  return out;
}

const _lineRuleCache = new Map();

async function mbLineRules(firmId) {
  const id = String(firmId || '');
  if (!id) return { local: new Set() };
  if (_lineRuleCache.has(id)) return _lineRuleCache.get(id);
  const rows = typeof sb === 'function' ? await sb(`firms?id=eq.${id}&select=settings`).catch(() => []) : [];
  const pack = { local: new Set(mbLineLocalNumbers(rows?.[0]?.settings)) };
  _lineRuleCache.set(id, pack);
  return pack;
}

async function mbLineCallBlocked(firmId, caller, destination) {
  const did = mbNormDid(caller);
  if (!did || !firmId) return false;
  const rules = await mbLineRules(firmId);
  if (!rules.local.has(did)) return false;
  return mbIntlMismatch(did, destination);
}

function mbLineCallBlockedSync(caller, destination) {
  const did = mbNormDid(caller);
  if (!did) return false;
  let local = false;
  _lineRuleCache.forEach((pack) => { if (pack.local.has(did)) local = true; });
  if (!local) return false;
  return mbIntlMismatch(did, destination);
}

function mbNoteIntlBlocked(contact) {
  const now = Date.now();
  if (!window._mbIntlToastAt || now - window._mbIntlToastAt > 8000) {
    window._mbIntlToastAt = now;
    if (typeof toast === 'function') toast(mbLineT('line.intl_blocked', 'Bu hat yalnızca kendi ülkesini arar'), 'warn');
  }
  if (contact?.id && typeof _hopperSkip !== 'undefined') _hopperSkip.set(String(contact.id), now + 10 * 60 * 1000);
  if (contact?.id && typeof mbReleaseUnanswered === 'function') mbReleaseUnanswered(contact, 'pending');
}

function mbLineNumbersFromSettings(settings) {
  const raw = settings?.line_numbers;
  const source = Array.isArray(raw) ? raw : [settings?.dialer?.outbound_did, settings?.sms_reminder?.from_number];
  const out = [];
  source.forEach((item) => {
    const n = mbNormDid(typeof item === 'string' ? item : item?.number);
    if (!n || out.includes(n)) return;
    out.push(n);
  });
  return out;
}

function mbLineDefaultFromSettings(settings) {
  const numbers = mbLineNumbersFromSettings(settings);
  if (!numbers.length) return '';
  if (numbers.length === 1) return numbers[0];
  const want = mbNormDid(settings?.line_default);
  return numbers.includes(want) ? want : numbers[0];
}

function mbCampaignsNeedingDid(rows, numbers, def) {
  const list = (numbers || []).map(mbNormDid).filter(Boolean);
  const target = mbNormDid(def);
  if (!list.length || !target) return [];
  if (list.length === 1) {
    return (rows || []).filter((row) => mbNormDid(row?.telnyx_did) !== list[0]).map((row) => row.id).filter(Boolean);
  }
  const allowed = new Set(list);
  return (rows || []).filter((row) => !allowed.has(mbNormDid(row?.telnyx_did))).map((row) => row.id).filter(Boolean);
}

function mbLineConnected(settings) {
  const line = typeof mbNormalizeFirmIntegrations === 'function'
    ? mbNormalizeFirmIntegrations(settings?.integrations)
    : (settings?.integrations || {});
  return !!(String(line.sip_username || '').trim() && String(line.sip_password || '').trim());
}

async function mbLoadLineFirms() {
  const box = document.getElementById('line-firms-list');
  if (!box || typeof sb !== 'function') return;
  const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const firmAdmin = typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin();
  if (!superView && !firmAdmin) return;
  const gen = ++_lineLoadGen;
  box.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px;">${mbLineEsc(mbLineT('line.loading', 'Yükleniyor…'))}</div>`;
  let rows = await sb('firms?select=id,name,settings&order=name.asc').catch(() => []) || [];
  if (gen !== _lineLoadGen) return;
  if (!superView) {
    const mine = String(currentUser?.firm_id || '');
    rows = rows.filter((row) => String(row.id) === mine);
  }
  _lineRows = rows;
  if (_lineOpenId && !_lineRows.some((row) => String(row.id) === String(_lineOpenId))) _lineOpenId = null;
  mbPaintLineList();
  if (!superView && _lineRows.length === 1 && !_lineOpenId) mbToggleLineFirm(_lineRows[0].id);
}

function mbPaintLineList() {
  const box = document.getElementById('line-firms-list');
  if (!box) return;
  if (!_lineRows.length) {
    box.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px;">${mbLineEsc(mbLineT('line.empty', 'Firma yok'))}</div>`;
    return;
  }
  const globalHold = typeof mbHoldGlobalBlock === 'function' ? mbHoldGlobalBlock() : '';
  box.innerHTML = globalHold + _lineRows.map((firm) => {
    const open = String(_lineOpenId) === String(firm.id);
    const on = mbLineConnected(firm.settings);
    const count = mbLineNumbersFromSettings(firm.settings).length;
    const state = on ? mbLineT('line.on', 'Bağlı') : mbLineT('line.off', 'Kopuk');
    return `<div class="line-firm${open ? ' is-open' : ''}">
      <button type="button" class="line-firm-head" onclick="mbToggleLineFirm('${String(firm.id)}')">
        <span class="line-dot ${on ? 'is-on' : 'is-off'}"></span>
        <span class="line-firm-name">${mbLineEsc(firm.name || '')}</span>
        <span class="line-firm-meta">${mbLineEsc(state)}${count ? ` · ${count}` : ''}</span>
        <i class="ph ph-caret-${open ? 'up' : 'down'}"></i>
      </button>
      ${open ? `<div class="line-firm-body">${mbLineFirmBody(firm)}</div>` : ''}
    </div>`;
  }).join('');
  if (_lineOpenId && typeof mbFillFxForm === 'function' && typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()) {
    mbFillFxForm(_lineOpenId);
  }
  const noiseBox = document.getElementById('line-noise-agents');
  if (noiseBox && !noiseBox.hidden && _lineOpenId) void mbFillNoiseAgents(_lineOpenId);
}

function mbLineFirmBody(firm) {
  const settings = firm.settings || {};
  const integ = typeof mbNormalizeFirmIntegrations === 'function' ? mbNormalizeFirmIntegrations(settings.integrations) : {};
  const numbers = mbLineNumbersFromSettings(settings);
  const def = mbLineDefaultFromSettings(settings);
  const sms = settings.sms_reminder || {};
  const fxProvider = String(settings.payroll?.fx_api_provider || 'frankfurter');
  const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  const from = numbers.length === 1 ? numbers[0] : (numbers.includes(mbNormDid(sms.from_number)) ? mbNormDid(sms.from_number) : def);
  const smsBlock = `<div class="line-firm-block">
    <div class="form-label">${mbLineEsc(mbLineT('line.sms', 'SMS hatırlatma'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('line.sms_hint', 'Anahtar ve numara hat bağlantısından gelir.'))}</div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
      <input type="checkbox" id="line-sms-on" ${sms.enabled === true ? 'checked' : ''}>
      <span>${mbLineEsc(mbLineT('line.sms_on', 'SMS hatırlatmayı etkinleştir'))}</span>
    </label>
    <div class="form-row">
      <label class="form-label">${mbLineEsc(mbLineT('line.sms_from', 'Gönderen numara'))}</label>
      <div class="line-sms-one" id="line-sms-from-one" ${numbers.length > 1 ? 'hidden' : ''}>${mbLineEsc(numbers[0] || mbLineT('line.no_number', 'Henüz numara yok'))}</div>
      <select class="form-input" id="line-sms-from" ${numbers.length > 1 ? '' : 'hidden'}>
        ${numbers.map((n) => `<option value="${mbLineEsc(n)}"${n === from ? ' selected' : ''}>${mbLineEsc(n)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <label class="form-label">${mbLineEsc(mbLineT('line.sms_tpl', 'Mesaj şablonu'))}</label>
      <textarea class="form-input" id="line-sms-tpl" rows="4">${mbLineEsc(sms.template || 'Sayin {isim}, randevunuz {tarih} tarihinde saat {saat} icin onaylandi.')}</textarea>
      <div style="font-size:11px;color:var(--text-3);margin-top:3px;">${mbLineEsc(mbLineT('line.vars', 'Değişkenler: {isim} {tarih} {saat}'))}</div>
    </div>
  </div>`;
  const secret = superView ? `<div class="line-firm-block">
      <div class="form-label">${mbLineEsc(mbLineT('line.api', 'API anahtarları'))}</div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.telnyx', 'Telnyx API Key'))}</label><input type="password" class="form-input" id="line-telnyx" autocomplete="new-password" value="${mbLineEsc(integ.telnyx_api_key || '')}"></div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.eleven', 'ElevenLabs API Key'))}</label><input type="password" class="form-input" id="line-eleven" autocomplete="new-password" value="${mbLineEsc(integ.elevenlabs_api_key || '')}"></div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.google', 'Google Maps API Key'))}</label><input class="form-input" id="line-google" autocomplete="off" value="${mbLineEsc(integ.google_key || '')}"></div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.tomtom', 'TomTom API Key'))}</label><input class="form-input" id="line-tomtom" autocomplete="off" value="${mbLineEsc(integ.tomtom_key || '')}"></div>
      <div class="form-row">
        <label class="form-label">${mbLineEsc(mbLineT('line.fx', 'Kur kaynağı'))}</label>
        <select class="form-input" id="line-fx-provider" onchange="onFxProviderChange()">
          <option value="frankfurter"${fxProvider === 'frankfurter' ? ' selected' : ''}>Canlı kur</option>
          <option value="exchangerate_host"${fxProvider === 'exchangerate_host' ? ' selected' : ''}>exchangerate.host</option>
          <option value="custom"${fxProvider === 'custom' ? ' selected' : ''}>Özel API</option>
        </select>
      </div>
      <div class="form-row" id="line-fx-url-row" style="display:none;"><label class="form-label">URL</label><input class="form-input" id="line-fx-url" autocomplete="off"></div>
      <div class="form-row" id="line-fx-key-row" style="display:none;"><label class="form-label">Key</label><input type="password" class="form-input" id="line-fx-key" autocomplete="new-password"></div>
    </div>
    <div class="line-firm-block">
      <div class="form-label">${mbLineEsc(mbLineT('line.sip', 'Hat bağlantısı'))}</div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.conn', 'SIP Connection ID'))}</label><input class="form-input" id="line-conn" autocomplete="off" value="${mbLineEsc(integ.sip_connection_id || '')}"></div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.user', 'SIP Username'))}</label><input class="form-input" id="line-sip-user" autocomplete="off" value="${mbLineEsc(integ.sip_username || '')}"></div>
      <div class="form-row"><label class="form-label">${mbLineEsc(mbLineT('line.pass', 'SIP Password'))}</label><input type="password" class="form-input" id="line-sip-pass" autocomplete="new-password" value="${mbLineEsc(integ.sip_password || '')}"></div>
      <div class="form-row">
        <label class="form-label">${mbLineEsc(mbLineT('line.rec', 'Ses kaydı'))}</label>
        <select class="form-input" id="line-rec-source">
          <option value="supabase"${settings.recording_source === 'telnyx' ? '' : ' selected'}>${mbLineEsc(mbLineT('line.rec.supabase', 'Supabase deposu'))}</option>
          <option value="telnyx"${settings.recording_source === 'telnyx' ? ' selected' : ''}>${mbLineEsc(mbLineT('line.rec.telnyx', 'Telnyx'))}</option>
        </select>
        <div style="font-size:11px;color:var(--text-3);margin-top:4px;">${mbLineEsc(mbLineT('line.rec.hint', ''))}</div>
      </div>
    </div>
    <div class="line-firm-block">
      <div class="form-label">${mbLineEsc(mbLineT('line.nums', 'Numaralar'))}</div>
      <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('line.num_hint', ''))}</div>
      <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('line.local_hint', ''))}</div>
      <div id="line-numbers" class="${numbers.length > 1 ? 'line-numbers-multi' : ''}">${mbLineNumberRows(numbers.length ? numbers : [''], def, mbLineLocalNumbers(settings))}</div>
      <button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start;" onclick="mbAddLineNumber()">${mbLineEsc(mbLineT('line.num_add', 'Numara ekle'))}</button>
    </div>
    <div class="line-firm-block">
      <div class="form-label">${mbLineEsc(mbLineT('line.ai.rate', 'AI dakika fiyatı'))}</div>
      <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('line.ai.rate_admin', 'Bunu yalnız süper admin yazar. Firma admini personel ekranından değiştiremez.'))}</div>
      <input class="form-input" id="line-ai-rate" inputmode="decimal" placeholder="0.08" value="${Number(settings.ai?.rate) > 0 ? mbLineEsc(String(settings.ai.rate)) : ''}">
    </div>` : '';
  const musicUrl = /^https:\/\//i.test(String(settings.hold_music_url || '')) ? String(settings.hold_music_url) : '';
  const musicOff = settings.hold_music_off === true;
  const musicStatus = musicOff
    ? mbLineT('hold.music.off', 'Müziksiz')
    : (musicUrl ? mbLineT('hold.music.using_own', 'Bu dosya çalıyor') : mbLineT('hold.music.none', 'Müzik yok. Bekleyen sessiz kalır.'));
  const allBox = superView ? `<label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;"><input type="checkbox" id="line-hold-all"> ${mbLineEsc(mbLineT('hold.music.all_check', 'Tüm firmalara yaz'))}</label>` : '';
  const noiseOn = settings.noise_advanced === true;
  const noiseSwitch = superView
    ? `<label class="mic-switch"><span>${mbLineEsc(mbLineT('line.noise', 'Gelişmiş gürültü engelleme'))}</span><input type="checkbox" id="line-noise-on" ${noiseOn ? 'checked' : ''} onchange="mbNoiseGrantToggle('${String(firm.id)}')"></label>`
    : `<div style="font-size:12px;font-weight:700;">${mbLineEsc(noiseOn ? mbLineT('line.noise', 'Gelişmiş gürültü engelleme') : mbLineT('line.noise.off', 'Süper admin henüz açmadı'))}</div>`;
  const noiseBlock = `<div class="line-firm-block" style="display:flex;flex-direction:column;gap:8px;">
    <div class="form-label">${mbLineEsc(mbLineT('line.noise', 'Gelişmiş gürültü engelleme'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('line.noise.hint', ''))}</div>
    ${noiseSwitch}
    <div id="line-noise-agents" class="mic-ns-dirs" ${noiseOn ? '' : 'hidden'}></div>
    <div id="line-noise-all" style="font-size:11px;color:var(--text-3);" ${noiseOn ? '' : 'hidden'}>${mbLineEsc(mbLineT('line.noise.all', ''))}</div>
    ${(superView || noiseOn) ? `<button type="button" class="btn btn-primary btn-sm" style="align-self:flex-start;" onclick="mbSaveNoiseGrant('${String(firm.id)}')">${mbLineEsc(mbLineT('line.noise.save', 'Yetkiyi kaydet'))}</button>` : ''}
  </div>`;
  const musicBlock = `<div class="line-firm-block" style="display:flex;flex-direction:column;gap:8px;">
    <div class="form-label">${mbLineEsc(mbLineT('hold.music', 'Bekleme müziği'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${mbLineEsc(mbLineT('hold.music.firm_hint', 'Kampanyanın kendi dosyası yoksa bu çalar. mp3 veya wav, en fazla 8 MB.'))}</div>
    <div class="hold-mode" id="line-hold-mode">
      <button type="button" class="hold-mode-btn${musicUrl && !musicOff ? ' is-on' : ''}" data-mode="file" onclick="mbHoldFirmMode('${String(firm.id)}','file')">${mbLineEsc(mbLineT('hold.music.on', 'Varsayılan müzik'))}</button>
      <button type="button" class="hold-mode-btn${musicOff ? ' is-on' : ''}" data-mode="off" onclick="mbHoldFirmMode('${String(firm.id)}','off')">${mbLineEsc(mbLineT('hold.music.off', 'Müziksiz'))}</button>
    </div>
    <div style="font-size:12px;font-weight:700;">${mbLineEsc(musicStatus)}</div>
    ${allBox}
    <div id="line-hold-file-wrap" class="hold-stack" ${musicOff ? 'hidden' : ''}>
      ${musicUrl ? `<audio controls preload="none" src="${mbLineEsc(musicUrl)}" style="width:100%;max-width:320px;height:32px;"></audio>` : ''}
      ${typeof mbHoldFileField === 'function' ? mbHoldFileField('line-hold-file') : ''}
      <button type="button" class="btn btn-primary btn-sm" style="align-self:flex-start;" onclick="mbSaveFirmHoldMusic('${String(firm.id)}')">${mbLineEsc(mbLineT('hold.music.upload', 'Müziği kaydet'))}</button>
    </div>
  </div>`;
  return `${secret}${smsBlock}${noiseBlock}${musicBlock}<button type="button" class="btn btn-primary" style="align-self:flex-start;" onclick="mbSaveLineFirm('${String(firm.id)}')"><i class="ph ph-floppy-disk"></i> ${mbLineEsc(mbLineT('line.save', 'Kaydet'))}</button>`;
}

function mbNoiseGrantToggle(firmId) {
  const on = !!document.getElementById('line-noise-on')?.checked;
  const box = document.getElementById('line-noise-agents');
  const hint = document.getElementById('line-noise-all');
  if (box) {
    box.hidden = !on;
    if (!on) box.innerHTML = '';
  }
  if (hint) hint.hidden = !on;
  if (on) void mbFillNoiseAgents(firmId);
}

async function mbFillNoiseAgents(firmId) {
  const box = document.getElementById('line-noise-agents');
  const sw = document.getElementById('line-noise-on');
  if (!box || box.hidden || (sw && !sw.checked) || !firmId || typeof sb !== 'function') return;
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const list = Array.isArray(rows?.[0]?.settings?.noise_agents) ? rows[0].settings.noise_agents.map(String) : null;
  const users = await sb(`users?firm_id=eq.${firmId}&is_active=eq.true&select=id,name,role&order=name.asc`).catch(() => []);
  if (box.hidden || (document.getElementById('line-noise-on') && !document.getElementById('line-noise-on').checked)) return;
  const people = (users || []).filter((row) => ['agent', 'admin', 'firm_admin'].includes(row.role));
  const esc = typeof mbLineEsc === 'function' ? mbLineEsc : (v) => String(v ?? '');
  box.innerHTML = people.map((row) => {
    const on = list == null || list.includes(String(row.id));
    return `<label class="mic-switch"><span>${esc(row.name || '')}</span><input type="checkbox" data-agent="${esc(row.id)}" ${on ? 'checked' : ''}></label>`;
  }).join('');
}

async function mbSaveNoiseGrant(firmId) {
  if (typeof mbCanSetHoldMusic === 'function' && !mbCanSetHoldMusic(firmId)) return;
  try {
    const rows = await sb(`firms?id=eq.${firmId}&select=settings`);
    const settings = { ...(rows?.[0]?.settings || {}) };
    if (typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin()) {
      settings.noise_advanced = !!document.getElementById('line-noise-on')?.checked;
    }
    if (settings.noise_advanced === true) {
      const boxes = [...document.querySelectorAll('#line-noise-agents input[data-agent]')];
      if (boxes.length) {
        const picked = boxes.filter((box) => box.checked).map((box) => box.getAttribute('data-agent')).filter(Boolean);
        if (picked.length === boxes.length) delete settings.noise_agents;
        else settings.noise_agents = picked;
      }
    }
    await sb(`firms?id=eq.${firmId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings }),
    });
    const hit = _lineRows.find((row) => String(row.id) === String(firmId));
    if (hit) hit.settings = settings;
    if (String(firmId) === String(currentUser?.firm_id || '')) window._mbNoisePolicy = null;
    toast(typeof mbLineT === 'function' ? mbLineT('line.noise.saved', 'Gürültü yetkisi kaydedildi') : 'Gürültü yetkisi kaydedildi', 'ok');
  } catch (e) {
    toast(typeof mbLineT === 'function' ? mbLineT('hold.music.fail', 'Kaydedilemedi') : 'Kaydedilemedi', 'err');
  }
}

function mbLineNumberRows(numbers, def, localList) {
  const local = new Set((localList || []).map((item) => mbNormDid(item)).filter(Boolean));
  return numbers.map((n, i) => {
    const checked = (n && n === def) || (!n && i === 0) ? 'checked' : '';
    const closed = n && local.has(n) ? 'checked' : '';
    return `<div class="line-num-row">
      <label class="line-num-def"><input type="radio" class="line-num-default" name="line-num-default" ${checked}> ${mbLineEsc(mbLineT('line.default', 'Varsayılan'))}</label>
      <input class="form-input line-num-input" value="${mbLineEsc(n)}" placeholder="+49..." inputmode="tel" autocomplete="off" oninput="mbSyncLineSmsChoices()">
      <label class="line-num-local"><input type="checkbox" class="line-num-local-chk" ${closed}> ${mbLineEsc(mbLineT('line.local', 'Yurt dışı kapalı'))}</label>
      <button type="button" class="icon-btn" onclick="mbRemoveLineNumber(this)" aria-label="×">×</button>
    </div>`;
  }).join('');
}

function mbToggleLineFirm(firmId) {
  _lineOpenId = String(_lineOpenId) === String(firmId) ? null : String(firmId);
  mbPaintLineList();
}

function mbReadLineNumberDraft() {
  const rows = [...document.querySelectorAll('#line-numbers .line-num-row')];
  const numbers = [];
  let picked = '';
  const local = [];
  rows.forEach((row) => {
    const n = mbNormDid(row.querySelector('.line-num-input')?.value);
    if (row.querySelector('.line-num-default')?.checked && n) picked = n;
    if (!n || numbers.includes(n)) return;
    numbers.push(n);
    if (row.querySelector('.line-num-local-chk')?.checked) local.push(n);
  });
  const def = numbers.length <= 1 ? (numbers[0] || '') : (numbers.includes(picked) ? picked : numbers[0]);
  return { numbers, def, local };
}

function mbSyncLineNumberMode() {
  const box = document.getElementById('line-numbers');
  if (!box) return;
  box.classList.toggle('line-numbers-multi', box.querySelectorAll('.line-num-row').length > 1);
}

function mbSyncLineSmsChoices() {
  mbSyncLineNumberMode();
  const draft = mbReadLineNumberDraft();
  const one = document.getElementById('line-sms-from-one');
  const sel = document.getElementById('line-sms-from');
  if (one) {
    one.hidden = draft.numbers.length > 1;
    one.textContent = draft.numbers[0] || mbLineT('line.no_number', 'Henüz numara yok');
  }
  if (!sel) return;
  const prev = sel.value;
  sel.hidden = draft.numbers.length <= 1;
  sel.innerHTML = draft.numbers.map((n) => `<option value="${mbLineEsc(n)}">${mbLineEsc(n)}</option>`).join('');
  if (draft.numbers.includes(prev)) sel.value = prev;
  else if (draft.def) sel.value = draft.def;
}

function mbAddLineNumber() {
  const box = document.getElementById('line-numbers');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', mbLineNumberRows([''], ''));
  mbSyncLineSmsChoices();
}

function mbRemoveLineNumber(btn) {
  const row = btn?.closest?.('.line-num-row');
  const box = document.getElementById('line-numbers');
  if (!row || !box) return;
  row.remove();
  if (!box.querySelector('.line-num-row')) box.insertAdjacentHTML('beforeend', mbLineNumberRows([''], ''));
  mbSyncLineSmsChoices();
}

async function mbAssignFirmCampaignDids(firmId, numbers, def) {
  const rows = await sb(`campaigns?firm_id=eq.${firmId}&select=id,telnyx_did`).catch(() => []) || [];
  const ids = mbCampaignsNeedingDid(rows, numbers, def);
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    await sb(`campaigns?id=in.(${chunk.join(',')})`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ telnyx_did: def }),
    });
  }
  if (typeof campaigns !== 'undefined' && Array.isArray(campaigns)) {
    campaigns.forEach((camp) => {
      if (ids.includes(camp.id)) camp.telnyx_did = def;
    });
  }
  return ids.length;
}

async function mbSaveLineFirm(firmId) {
  if (_lineSaving || !firmId || typeof sb !== 'function') return;
  const bad = [...document.querySelectorAll('#line-numbers .line-num-input')].some((el) => String(el.value || '').trim() && !mbNormDid(el.value));
  if (bad) {
    toast(mbLineT('line.num_bad', 'Numara + ile başlamalı, örnek +49301234567'), 'err');
    return;
  }
  _lineSaving = true;
  try {
    const freshRows = await sb(`firms?id=eq.${firmId}&select=settings`);
    const settings = { ...(freshRows?.[0]?.settings || {}) };
    const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
    const read = (id) => document.getElementById(id)?.value.trim() || '';
    if (superView) {
      const rateEl = document.getElementById('line-ai-rate');
      if (rateEl && typeof mbAiRateInput === 'function') {
        const rate = mbAiRateInput(rateEl.value);
        if (rate == null) {
          toast(mbLineT('line.ai.rate_bad', 'Dakika fiyatı sayı olsun, örnek 0.08'), 'err');
          return;
        }
        settings.ai = { ...(settings.ai || {}), rate };
      }
      const prev = typeof mbNormalizeFirmIntegrations === 'function' ? mbNormalizeFirmIntegrations(settings.integrations) : {};
      settings.integrations = mbNormalizeFirmIntegrations({
        ...prev,
        google_key: read('line-google') || prev.google_key,
        tomtom_key: read('line-tomtom') || prev.tomtom_key,
        telnyx_api_key: read('line-telnyx') || prev.telnyx_api_key,
        elevenlabs_api_key: read('line-eleven') || prev.elevenlabs_api_key,
        sip_connection_id: read('line-conn') || prev.sip_connection_id,
        sip_username: read('line-sip-user') || prev.sip_username,
        sip_password: read('line-sip-pass') || prev.sip_password,
      });
      const draft = mbReadLineNumberDraft();
      settings.line_numbers = draft.numbers;
      settings.line_default = draft.def;
      settings.line_local = draft.local;
      settings.dialer = { ...(settings.dialer || {}), outbound_did: draft.def || '' };
      _lineRuleCache.delete(String(firmId));
    }
    const numbers = mbLineNumbersFromSettings(settings);
    const def = mbLineDefaultFromSettings(settings);
    const smsPrev = settings.sms_reminder || {};
    const sel = document.getElementById('line-sms-from');
    let from = numbers.length === 1 ? numbers[0] : '';
    if (!from && sel && !sel.hidden) from = mbNormDid(sel.value);
    if (!from) from = def || mbNormDid(smsPrev.from_number);
    if (numbers.length && from && !numbers.includes(from)) from = def || numbers[0] || '';
    settings.sms_reminder = {
      ...smsPrev,
      enabled: !!document.getElementById('line-sms-on')?.checked,
      template: read('line-sms-tpl') || smsPrev.template || '',
      from_number: from || '',
      telnyx_api_key: String(settings.integrations?.telnyx_api_key || smsPrev.telnyx_api_key || ''),
    };
    if (superView) {
      const prevSource = settings.recording_source === 'telnyx' ? 'telnyx' : 'supabase';
      const wantTelnyx = document.getElementById('line-rec-source')?.value === 'telnyx';
      settings.recording_source = wantTelnyx ? 'telnyx' : 'supabase';
      await sb(`firms?id=eq.${firmId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings }),
      });
      const armed = typeof mbTelnyxRecord === 'function'
        ? await mbTelnyxRecord('mode', {
          source: settings.recording_source,
          connection_id: settings.integrations?.sip_connection_id || '',
          firm_id: firmId,
        })
        : { ok: !wantTelnyx };
      if (wantTelnyx && !armed?.ok) {
        settings.recording_source = prevSource;
        await sb(`firms?id=eq.${firmId}`, {
          method: 'PATCH',
          prefer: 'return=minimal',
          body: JSON.stringify({ settings }),
        });
        toast(mbLineT('line.rec.telnyx_fail', 'Telnyx kaydı açılamadı'), 'err');
      } else if (!wantTelnyx && armed && armed.ok === false && armed.error === 'profile') {
        toast(mbLineT('line.rec.supabase_warn', 'Telnyx kaydı kapatılamadı'), 'warn');
      }
      if (String(firmId) === String(currentUser?.firm_id || '')) window._mbRecordingSource = settings.recording_source;
    } else {
      await sb(`firms?id=eq.${firmId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ settings }),
      });
    }
    if (superView && typeof saveFirmFxApi === 'function') await saveFirmFxApi(firmId);
    const hit = _lineRows.find((row) => String(row.id) === String(firmId));
    if (hit) hit.settings = settings;
    if (superView && String(firmId) === String(currentUser?.firm_id || '') && typeof mbApplyFirmIntegrationsLocal === 'function') {
      mbApplyFirmIntegrationsLocal(settings.integrations, true);
    }
    if (typeof _smsCachedConfig !== 'undefined') _smsCachedConfig = null;
    let assigned = 0;
    if (superView) assigned = await mbAssignFirmCampaignDids(firmId, settings.line_numbers, settings.line_default);
    toast(mbLineT('line.saved', 'Hat ayarları kaydedildi'), 'ok');
    if (assigned) toast(mbLineT('line.assigned', '{n} kampanyaya numara yazıldı').replace('{n}', String(assigned)), 'ok');
    mbPaintLineList();
  } catch (e) {
    toast((typeof t === 'function' ? t('dial.log_err') : 'Kayıt hatası: ') + (e?.message || ''), 'err');
  } finally {
    _lineSaving = false;
  }
}

async function mbFirmLinePack(firmId) {
  if (!firmId || typeof sb !== 'function') return { numbers: [], def: '' };
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const settings = rows?.[0]?.settings || {};
  return { numbers: mbLineNumbersFromSettings(settings), def: mbLineDefaultFromSettings(settings) };
}

function mbApplyDidChoice(pick, input, pack, current) {
  const numbers = pack?.numbers || [];
  const cur = mbNormDid(current);
  const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  if (numbers.length && pick) {
    if (input) input.hidden = true;
    pick.hidden = false;
    pick.disabled = numbers.length === 1;
    pick.innerHTML = numbers.map((n) => `<option value="${mbLineEsc(n)}">${mbLineEsc(n)}</option>`).join('');
    pick.value = numbers.includes(cur) ? cur : (pack.def || numbers[0]);
    return;
  }
  if (pick) pick.hidden = true;
  if (input) {
    input.hidden = !superView;
    if (superView) input.value = String(current || '');
  }
}

async function mbBindCampDid(firmId, current) {
  const gen = ++_campDidGen;
  const row = document.getElementById('cd-did-row');
  const input = document.getElementById('cd-edit-did');
  const pick = document.getElementById('cd-edit-did-pick');
  const can = typeof mbCanEditDid === 'function' && mbCanEditDid();
  if (!can) {
    if (row) row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';
  const pack = await mbFirmLinePack(firmId);
  if (gen !== _campDidGen) return;
  mbApplyDidChoice(pick, input, pack, current);
}

async function mbBindNewCampDid(firmId) {
  const gen = ++_newDidGen;
  const row = document.getElementById('nc-did-row');
  const input = document.getElementById('nc-did');
  const pick = document.getElementById('nc-did-pick');
  if (!row) return;
  if (!(typeof mbCanEditDid === 'function' && mbCanEditDid())) {
    row.style.display = 'none';
    return;
  }
  const pack = await mbFirmLinePack(firmId);
  if (gen !== _newDidGen) return;
  const superView = typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  if (!pack.numbers.length && !superView) {
    row.style.display = 'none';
    if (pick) pick.hidden = true;
    if (input) input.hidden = true;
    return;
  }
  row.style.display = '';
  mbApplyDidChoice(pick, input, pack, pack.def || '');
}
