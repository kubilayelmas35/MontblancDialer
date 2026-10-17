// Canlı satır: dinle, fısılda, katıl, çağrıyı göster.
function mbSupervisorHeader(call) {
  const lists = [call?.options?.customHeaders, call?.customHeaders, call?.params?.customHeaders];
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (!Array.isArray(list)) continue;
    const hit = list.find((h) => String(h?.name || '').toLowerCase().replace(/_/g, '-') === 'x-mb-supervisor');
    if (hit) return String(hit.value || '');
  }
  return '';
}

function mbLiveCoachHtml(session) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const aid = String(session?.agent_id || '');
  if (!aid || (currentUser?.id && aid === String(currentUser.id))) return '';
  const live = session.status === 'on_call' || session.status === 'calling';
  if (!live) return '';
  const say = (tr, en) => (de ? en : tr);
  const btn = (role, label, title) =>
    `<button type="button" class="live-act" title="${title}" onclick="mbCoachCall('${aid}','${role}')">${label}</button>`;
  return `${btn('monitor', say('Dinle', 'Hören'), say('Çağrıyı dinle', 'Anruf mithören'))}
    ${btn('whisper', say('Fısılda', 'Flüstern'), say('Yalnız temsilci duyar', 'Nur der Agent hört'))}
    ${btn('barge', say('Katıl', 'Beitreten'), say('Çağrıya katıl', 'Anruf beitreten'))}
    <button type="button" class="live-act" title="${say('Çağrıyı göster', 'Anruf zeigen')}" onclick="mbShowLiveCall('${aid}')">${say('Göster', 'Zeigen')}</button>`;
}

function mbPublishLiveLeg(row) {
  if (!row || typeof updateSessionInDB !== 'function') return;
  const call = row.call;
  if (call && (mbSupervisorHeader(call) || call.__mbSupervisor)) return;
  const contact = row.contact || (typeof currentContact !== 'undefined' ? currentContact : null);
  const ids = call?.telnyxIDs || {};
  const ccid = String(ids.telnyxCallControlId || '');
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || null;
  const extra = {
    current_contact_name: name,
    current_contact_phone: contact?.phone || null,
    call_started_at: new Date().toISOString(),
  };
  if (contact?.id) extra.current_contact_id = contact.id;
  if (ccid && !ccid.startsWith('sim-')) extra.telnyx_call_control_id = ccid;
  updateSessionInDB('on_call', extra);
  if (!extra.telnyx_call_control_id && call && !call.__mbPublishTimer) {
    let tries = 0;
    const tick = () => {
      tries += 1;
      const again = String(call?.telnyxIDs?.telnyxCallControlId || '');
      if (again) {
        call.__mbPublishTimer = null;
        updateSessionInDB('on_call', { telnyx_call_control_id: again });
        return;
      }
      if (tries < 4) call.__mbPublishTimer = setTimeout(tick, 1200);
      else call.__mbPublishTimer = null;
    };
    call.__mbPublishTimer = setTimeout(tick, 1200);
  }
}

async function mbShowLiveCall(agentId) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const rows = await sb(`agent_sessions?agent_id=eq.${agentId}&select=current_contact_id,current_contact_name,current_contact_phone,agent_name&limit=1`).catch(() => []);
  const s = rows?.[0];
  if (!s?.current_contact_id && !s?.current_contact_phone) {
    toast(de ? 'Kein offenes Gespräch' : 'Bu temsilcinin açık görüşmesi yok', 'warn');
    return;
  }
  let contact = null;
  if (s.current_contact_id) {
    const list = await sb(`contacts?id=eq.${s.current_contact_id}&select=*&limit=1`).catch(() => []);
    contact = list?.[0] || null;
  }
  if (!contact) {
    contact = {
      phone: s.current_contact_phone || '',
      first_name: s.current_contact_name || '',
      last_name: '',
    };
  }
  if (typeof navigate === 'function') navigate('dialer');
  if (typeof showCustomerCard === 'function') showCustomerCard(contact);
  toast(de ? `Anruf von ${s.agent_name || 'Agent'} · nur ansehen` : `${s.agent_name || 'Temsilci'} görüşmesi · yalnız izleme`, 'ok', 3200);
}

async function mbCoachCall(agentId, role) {
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  const allowed = role === 'monitor' || role === 'whisper' || role === 'barge';
  if (!allowed || !agentId || String(agentId) === String(currentUser?.id || '')) return;
  const rows = await sb(`agent_sessions?agent_id=eq.${agentId}&select=agent_name,firm_id,campaign_id,status,telnyx_call_control_id&limit=1`).catch(() => []);
  const s = rows?.[0];
  if (!s || (s.status !== 'on_call' && s.status !== 'calling')) {
    toast(de ? 'Kein offenes Gespräch' : 'Açık görüşme yok', 'warn');
    return;
  }
  if (!s.telnyx_call_control_id) {
    toast(de ? 'Die Leitung dieser Anrufs ist noch nicht bereit' : 'Bu çağrının hat kimliği henüz yok', 'warn');
    return;
  }
  const fid = s.firm_id || currentUser?.firm_id;
  const line = typeof mbLoadFirmIntegrations === 'function' ? await mbLoadFirmIntegrations(fid) : null;
  if (!line?.telnyx_api_key || !line?.sip_connection_id || !line?.sip_username) {
    toast(de ? 'Firmenleitung ist unvollständig' : 'Firma hat ayarı eksik', 'warn');
    return;
  }
  let from = '';
  if (s.campaign_id) {
    const camps = await sb(`campaigns?id=eq.${s.campaign_id}&select=telnyx_did&limit=1`).catch(() => []);
    from = String(camps?.[0]?.telnyx_did || '').trim();
  }
  if (!from) {
    toast(de ? 'Kampagne hat keine Leitung' : 'Kampanyanın hattı yok', 'warn');
    return;
  }
  if (window._mbCoachCall) {
    try { window._mbCoachCall.hangup(); } catch (e) {}
    window._mbCoachCall = null;
  }
  window._mbCoachExpect = { role, until: Date.now() + 20000 };
  const label = role === 'monitor' ? (de ? 'Hören' : 'Dinle') : role === 'whisper' ? (de ? 'Flüstern' : 'Fısılda') : (de ? 'Beitreten' : 'Katıl');
  toast(de ? `${label} wird verbunden…` : `${label} bağlanıyor…`, 'ok', 2200);
  let res;
  try {
    res = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${line.telnyx_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: line.sip_connection_id,
        to: `sip:${line.sip_username}@sip.telnyx.com`,
        from,
        supervise_call_control_id: s.telnyx_call_control_id,
        supervisor_role: role,
        custom_headers: [{ name: 'X-MB-Supervisor', value: String(currentUser.id) }],
      }),
    });
  } catch (e) {
    window._mbCoachExpect = null;
    toast(de ? 'Leitung nicht erreichbar' : 'Hat servisine ulaşılamadı', 'err');
    return;
  }
  if (!res.ok) {
    window._mbCoachExpect = null;
    let detail = '';
    try { detail = (await res.json())?.errors?.[0]?.detail || ''; } catch (e) {}
    toast((de ? 'Beitritt fehlgeschlagen' : 'Katılım olmadı') + (detail ? `: ${detail}` : ''), 'err', 4200);
  }
}
