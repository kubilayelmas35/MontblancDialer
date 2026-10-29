const MB_HOLD_MUSIC_MAX = 8 * 1024 * 1024;

function mbHoldMusicSay(key, fb) {
  const msg = typeof t === 'function' ? t(key) : fb;
  return !msg || msg === key ? fb : msg;
}

function mbHoldFileNamed(input) {
  const el = document.getElementById(`${input?.id || ''}-name`);
  if (!el) return;
  el.textContent = input?.files?.[0]?.name || mbHoldMusicSay('hold.music.none_file', 'Dosya seçilmedi');
}

function mbHoldFileField(id) {
  const pick = mbHoldMusicSay('hold.music.pick', 'Dosya seç');
  const empty = mbHoldMusicSay('hold.music.none_file', 'Dosya seçilmedi');
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  return `<div class="hold-file">
    <input type="file" id="${esc(id)}" accept=".mp3,.wav,audio/mpeg,audio/wav" onchange="mbHoldFileNamed(this)">
    <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('${esc(id)}').click()"><i class="ph ph-music-notes"></i> ${esc(pick)}</button>
    <span class="hold-file-name" id="${esc(id)}-name">${esc(empty)}</span>
  </div>`;
}

function mbHoldMusicKind(file) {
  if (!file || file.size <= 0 || file.size > MB_HOLD_MUSIC_MAX) return '';
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (name.endsWith('.mp3') || type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3';
  if (name.endsWith('.wav') || type === 'audio/wav' || type === 'audio/x-wav' || type === 'audio/wave') return 'wav';
  return '';
}

function mbCanSetHoldMusic(firmId) {
  const role = String(currentUser?.role || '');
  if (role === 'super_admin') return true;
  if (role !== 'admin' && role !== 'firm_admin') return false;
  return !firmId || String(firmId) === String(currentUser?.firm_id || '');
}

function mbHoldMusicPath(url) {
  const marker = '/object/public/call-recordings/';
  const raw = String(url || '').split('?')[0];
  const at = raw.indexOf(marker);
  if (at < 0) return '';
  const path = decodeURIComponent(raw.slice(at + marker.length));
  if (!path.startsWith('hold-music/') || path.includes('..')) return '';
  return path;
}

async function mbUploadHoldMusic(file, firmId) {
  const kind = mbHoldMusicKind(file);
  if (!kind) {
    toast(mbHoldMusicSay('hold.music.bad', 'mp3 veya wav olmalı, en fazla 8 MB'), 'err');
    return '';
  }
  if (typeof SB_URL !== 'string' || typeof SB_KEY !== 'string') return '';
  const firm = String(firmId || '').replace(/[^\w-]/g, '');
  if (!firm) return '';
  const path = `hold-music/${firm}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${kind}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/call-recordings/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': kind === 'wav' ? 'audio/wav' : 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error('storage');
  return `${SB_URL}/storage/v1/object/public/call-recordings/${path}?v=${Date.now()}`;
}

async function mbDeleteHoldMusicFile(url) {
  const path = mbHoldMusicPath(url);
  if (!path || typeof SB_URL !== 'string' || typeof SB_KEY !== 'string') return;
  await fetch(`${SB_URL}/storage/v1/object/call-recordings/${path}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }).catch(() => {});
}

function mbPaintHoldNote(note, audio, clearBtn, url) {
  const own = /^https:\/\//i.test(String(url || ''));
  if (note) note.textContent = own
    ? mbHoldMusicSay('hold.music.using_own', 'Bu dosya çalıyor')
    : mbHoldMusicSay('hold.music.using_firm', 'Firma müziği çalıyor');
  if (audio) {
    audio.hidden = !own;
    if (own) audio.src = url;
    else audio.removeAttribute('src');
  }
  if (clearBtn) clearBtn.hidden = !own;
}

function mbPaintCampHoldMusic(camp) {
  const url = String((typeof mbCampSettings === 'function' ? mbCampSettings(camp) : camp?.settings)?.hold_music_url || '').trim();
  mbPaintHoldNote(
    document.getElementById('cd-hold-note'),
    document.getElementById('cd-hold-audio'),
    document.getElementById('cd-hold-clear'),
    /^https:\/\//i.test(url) ? url : '',
  );
  const note = document.getElementById('cd-hold-note');
  if (note && !/^https:\/\//i.test(url)) note.textContent = mbHoldMusicSay('hold.music.using_firm', 'Firma müziği çalıyor');
}

async function mbPatchCampHoldMusic(camp, url) {
  const settings = { ...((typeof mbCampSettings === 'function' ? mbCampSettings(camp) : camp?.settings) || {}) };
  if (url) settings.hold_music_url = url;
  else delete settings.hold_music_url;
  await sb(`campaigns?id=eq.${camp.id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings }),
  });
  camp.settings = settings;
}

async function mbSaveCampHoldMusic() {
  const camp = (campaigns || []).find((row) => row.id === currentCampId);
  if (!camp || !mbCanSetHoldMusic(camp.firm_id)) return;
  const file = document.getElementById('cd-hold-file')?.files?.[0];
  if (!file) {
    toast(mbHoldMusicSay('hold.music.bad', 'mp3 veya wav olmalı, en fazla 8 MB'), 'err');
    return;
  }
  try {
    const prev = String((typeof mbCampSettings === 'function' ? mbCampSettings(camp) : {})?.hold_music_url || '');
    const url = await mbUploadHoldMusic(file, camp.firm_id || currentUser?.firm_id);
    if (!url) return;
    await mbPatchCampHoldMusic(camp, url);
    if (prev) void mbDeleteHoldMusicFile(prev);
    const input = document.getElementById('cd-hold-file');
    if (input) input.value = '';
    mbPaintCampHoldMusic(camp);
    toast(mbHoldMusicSay('hold.music.saved', 'Müzik kaydedildi'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbClearCampHoldMusic() {
  const camp = (campaigns || []).find((row) => row.id === currentCampId);
  if (!camp || !mbCanSetHoldMusic(camp.firm_id)) return;
  const prev = String((typeof mbCampSettings === 'function' ? mbCampSettings(camp) : {})?.hold_music_url || '');
  try {
    await mbPatchCampHoldMusic(camp, '');
    if (prev) void mbDeleteHoldMusicFile(prev);
    mbPaintCampHoldMusic(camp);
    toast(mbHoldMusicSay('hold.music.cleared', 'Müzik kaldırıldı'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbPatchFirmHoldMusic(firmId, url, off) {
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`);
  const settings = { ...(rows?.[0]?.settings || {}) };
  const prev = String(settings.hold_music_url || '');
  if (off) {
    settings.hold_music_off = true;
    delete settings.hold_music_url;
  } else {
    settings.hold_music_off = false;
    if (url) settings.hold_music_url = url;
  }
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings }),
  });
  const hit = (typeof _lineRows !== 'undefined' ? _lineRows : []).find((row) => String(row.id) === String(firmId));
  if (hit) hit.settings = settings;
  if (String(window._mbHoldMusicFirm?.id || '') === String(firmId)) window._mbHoldMusicFirm = null;
  return { settings, prev };
}

function mbHoldFirmIds(firmId) {
  const all = !!document.getElementById('line-hold-all')?.checked && typeof mbIsSuperAdmin === 'function' && mbIsSuperAdmin();
  if (!all) return [firmId];
  const ids = (typeof _lineRows !== 'undefined' ? _lineRows : []).map((row) => row.id).filter(Boolean);
  return ids.length ? ids : [firmId];
}

async function mbWriteFirmHold(firmId, url, off) {
  const wrote = await mbPatchFirmHoldMusic(firmId, url, off);
  if (wrote?.prev && wrote.prev !== url) void mbDeleteHoldMusicFile(wrote.prev);
}

async function mbSaveFirmHoldMusic(firmId) {
  if (!mbCanSetHoldMusic(firmId)) return;
  const file = document.getElementById('line-hold-file')?.files?.[0];
  if (!file) {
    toast(mbHoldMusicSay('hold.music.bad', 'mp3 veya wav olmalı, en fazla 8 MB'), 'err');
    return;
  }
  try {
    const url = await mbUploadHoldMusic(file, firmId);
    if (!url) return;
    const ids = mbHoldFirmIds(firmId);
    for (let i = 0; i < ids.length; i += 1) await mbWriteFirmHold(ids[i], url, false);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay(ids.length > 1 ? 'hold.music.all_saved' : 'hold.music.saved', 'Müzik kaydedildi'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbClearFirmHoldMusic(firmId) {
  if (!mbCanSetHoldMusic(firmId)) return;
  try {
    const ids = mbHoldFirmIds(firmId);
    for (let i = 0; i < ids.length; i += 1) await mbWriteFirmHold(ids[i], '', true);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay(ids.length > 1 ? 'hold.music.all_saved' : 'hold.music.cleared', 'Müzik kaldırıldı'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

function mbHoldFirmMode(firmId, mode) {
  const wrap = document.getElementById('line-hold-file-wrap');
  document.querySelectorAll('#line-hold-mode .hold-mode-btn').forEach((btn) => {
    btn.classList.toggle('is-on', btn.dataset.mode === mode);
  });
  if (wrap) wrap.hidden = mode !== 'file';
  if (mode === 'off') void mbClearFirmHoldMusic(firmId);
}

async function mbSaveHoldForAll() {
  if (typeof mbIsSuperAdmin !== 'function' || !mbIsSuperAdmin()) return;
  const file = document.getElementById('global-hold-file')?.files?.[0];
  if (!file) {
    toast(mbHoldMusicSay('hold.music.bad', 'mp3 veya wav olmalı, en fazla 8 MB'), 'err');
    return;
  }
  const ids = (typeof _lineRows !== 'undefined' ? _lineRows : []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return;
  try {
    const url = await mbUploadHoldMusic(file, 'shared');
    if (!url) return;
    for (let i = 0; i < ids.length; i += 1) await mbWriteFirmHold(ids[i], url, false);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay('hold.music.all_saved', 'Tüm firmalara yazıldı'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbClearHoldForAll() {
  if (typeof mbIsSuperAdmin !== 'function' || !mbIsSuperAdmin()) return;
  const ids = (typeof _lineRows !== 'undefined' ? _lineRows : []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return;
  try {
    for (let i = 0; i < ids.length; i += 1) await mbWriteFirmHold(ids[i], '', true);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay('hold.music.all_saved', 'Tüm firmalara yazıldı'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

function mbHoldGlobalBlock() {
  if (typeof mbIsSuperAdmin !== 'function' || !mbIsSuperAdmin()) return '';
  const rows = typeof _lineRows !== 'undefined' ? _lineRows : [];
  const urls = [...new Set(rows.map((row) => String(row.settings?.hold_music_url || '')).filter((url) => /^https:\/\//i.test(url)))];
  const allOff = rows.length > 0 && rows.every((row) => row.settings?.hold_music_off === true);
  const one = !allOff && urls.length === 1 ? urls[0] : '';
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
  const on = mbHoldMusicSay('hold.music.on', 'Varsayılan müzik');
  const off = mbHoldMusicSay('hold.music.off', 'Müziksiz');
  return `<div class="hold-global">
    <div class="form-label">${esc(mbHoldMusicSay('hold.music.all_title', 'Herkes için varsayılan'))}</div>
    <div style="font-size:11px;color:var(--text-3);">${esc(mbHoldMusicSay('hold.music.all_hint', ''))}</div>
    <div class="hold-mode">
      <button type="button" class="hold-mode-btn${one ? ' is-on' : ''}" onclick="document.getElementById('global-hold-file-wrap').hidden=false;this.classList.add('is-on');this.nextElementSibling.classList.remove('is-on')">${esc(on)}</button>
      <button type="button" class="hold-mode-btn${allOff ? ' is-on' : ''}" onclick="mbClearHoldForAll()">${esc(off)}</button>
    </div>
    <div id="global-hold-file-wrap" class="hold-stack" ${one || !allOff ? '' : 'hidden'}>
      ${one ? `<audio controls preload="none" src="${esc(one)}" style="width:100%;max-width:320px;height:32px;"></audio>` : ''}
      ${mbHoldFileField('global-hold-file')}
      <button type="button" class="btn btn-primary btn-sm" style="align-self:flex-start;" onclick="mbSaveHoldForAll()">${esc(mbHoldMusicSay('hold.music.upload', 'Müziği kaydet'))}</button>
    </div>
  </div>`;
}

async function mbFirmHoldMusicUrl(firmId) {
  const id = String(firmId || '');
  if (!id || typeof sb !== 'function') return '';
  const cache = window._mbHoldMusicFirm;
  if (cache && cache.id === id && Date.now() - cache.at < 60000) return cache.url || '';
  const rows = await sb(`firms?id=eq.${id}&select=settings`).catch(() => []);
  if (rows?.[0]?.settings?.hold_music_off === true) {
    window._mbHoldMusicFirm = { id, url: '', at: Date.now() };
    return '';
  }
  const url = String(rows?.[0]?.settings?.hold_music_url || '').trim();
  const clean = /^https:\/\//i.test(url) ? url : '';
  window._mbHoldMusicFirm = { id, url: clean, at: Date.now() };
  return clean;
}

async function mbResolveHoldMusicUrl(contact) {
  const campId = contact?.campaign_id || (typeof selectedCampId !== 'undefined' ? selectedCampId : '');
  const camp = (typeof campaigns !== 'undefined' ? campaigns : []).find((row) => String(row.id) === String(campId));
  const own = String((typeof mbCampSettings === 'function' ? mbCampSettings(camp) : camp?.settings)?.hold_music_url || '').trim();
  if (/^https:\/\//i.test(own)) return own;
  const firmId = camp?.firm_id || contact?.firm_id || currentUser?.firm_id || '';
  return mbFirmHoldMusicUrl(firmId);
}

async function mbHoldControlId(call) {
  const ids = typeof mbTelnyxIds === 'function' ? mbTelnyxIds(call) : {};
  const direct = String(ids.control || call?.options?.telnyxCallControlId || '').trim();
  if (direct) return direct;
  const phone = typeof mbCallDigits === 'function' ? mbCallDigits(call) : '';
  if (!phone || phone.length < 6 || typeof mbTelnyxRecord !== 'function') return '';
  const body = await mbTelnyxRecord('lookup', { phone });
  const control = String(body?.call_control_id || '').trim();
  if (control && call) {
    const opt = call.options || (call.options = {});
    opt.telnyxCallControlId = control;
  }
  return control;
}

async function mbStartHoldMusic(call, contact) {
  if (!call || call.__mbMusicOn || String(call.id || '').startsWith('sim-')) return;
  if (typeof _testMode !== 'undefined' && _testMode) return;
  const gen = (call.__mbMusicGen || 0) + 1;
  call.__mbMusicGen = gen;
  const url = await mbResolveHoldMusicUrl(contact);
  if (!url || call.__mbMusicGen !== gen) return;
  const control = await mbHoldControlId(call);
  if (!control || call.__mbMusicGen !== gen || typeof mbTelnyxRecord !== 'function') return;
  const body = await mbTelnyxRecord('play', { call_control_id: control, audio_url: url });
  if (call.__mbMusicGen !== gen) {
    if (body?.ok) void mbTelnyxRecord('stop', { call_control_id: control });
    return;
  }
  call.__mbMusicOn = !!(body && body.ok);
}

function mbStopHoldMusic(call) {
  if (!call) return;
  call.__mbMusicGen = (call.__mbMusicGen || 0) + 1;
  const was = call.__mbMusicOn;
  call.__mbMusicOn = false;
  if (!was || typeof mbTelnyxRecord !== 'function') return;
  const ids = typeof mbTelnyxIds === 'function' ? mbTelnyxIds(call) : {};
  const control = String(ids.control || call?.options?.telnyxCallControlId || '').trim();
  if (control) void mbTelnyxRecord('stop', { call_control_id: control });
}
