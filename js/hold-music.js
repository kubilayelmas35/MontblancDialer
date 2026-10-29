const MB_HOLD_MUSIC_MAX = 8 * 1024 * 1024;

function mbHoldMusicSay(key, fb) {
  const msg = typeof t === 'function' ? t(key) : fb;
  return !msg || msg === key ? fb : msg;
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

async function mbPatchFirmHoldMusic(firmId, url) {
  const rows = await sb(`firms?id=eq.${firmId}&select=settings`);
  const settings = { ...(rows?.[0]?.settings || {}) };
  if (url) settings.hold_music_url = url;
  else delete settings.hold_music_url;
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings }),
  });
  const hit = (typeof _lineRows !== 'undefined' ? _lineRows : []).find((row) => String(row.id) === String(firmId));
  if (hit) hit.settings = settings;
  window._mbHoldMusicFirm = { id: String(firmId), url: url || '', at: Date.now() };
  return settings;
}

async function mbSaveFirmHoldMusic(firmId) {
  if (!mbCanSetHoldMusic(firmId)) return;
  const file = document.getElementById('line-hold-file')?.files?.[0];
  if (!file) {
    toast(mbHoldMusicSay('hold.music.bad', 'mp3 veya wav olmalı, en fazla 8 MB'), 'err');
    return;
  }
  try {
    const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
    const prev = String(rows?.[0]?.settings?.hold_music_url || '');
    const url = await mbUploadHoldMusic(file, firmId);
    if (!url) return;
    await mbPatchFirmHoldMusic(firmId, url);
    if (prev) void mbDeleteHoldMusicFile(prev);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay('hold.music.saved', 'Müzik kaydedildi'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbClearFirmHoldMusic(firmId) {
  if (!mbCanSetHoldMusic(firmId)) return;
  try {
    const rows = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
    const prev = String(rows?.[0]?.settings?.hold_music_url || '');
    await mbPatchFirmHoldMusic(firmId, '');
    if (prev) void mbDeleteHoldMusicFile(prev);
    if (typeof mbPaintLineList === 'function') mbPaintLineList();
    toast(mbHoldMusicSay('hold.music.cleared', 'Müzik kaldırıldı'), 'ok');
  } catch (e) {
    toast(mbHoldMusicSay('hold.music.fail', 'Müzik kaydedilemedi'), 'err');
  }
}

async function mbFirmHoldMusicUrl(firmId) {
  const id = String(firmId || '');
  if (!id || typeof sb !== 'function') return '';
  const cache = window._mbHoldMusicFirm;
  if (cache && cache.id === id && Date.now() - cache.at < 60000) return cache.url || '';
  const rows = await sb(`firms?id=eq.${id}&select=settings`).catch(() => []);
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
