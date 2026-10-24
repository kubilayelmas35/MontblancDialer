const TOUR_GUN = { Mon: 'pzt', Tue: 'sal', Wed: 'car', Thu: 'per', Fri: 'cum', Sat: 'cmt', Sun: 'paz' };
const TOUR_DEFAULTS = {
  aktif: false,
  kuyrukMod: 'revert',
  kampanyaDegis: true,
  kuyrukYenile: true,
  hedefManuel: false,
  hedefTarih: '',
  secili: '',
  auto: true,
  autoSwitch: true,
  kampanyaOto: true,
  bekleyen: false,
  bekleyenEsik: 3,
  olay: true,
  onay: true,
  veriEsik: 500,
  radiusKm: 30,
  yakinAdet: 100,
  hazirEsik: 3000,
  terminHedef: true,
  terminGunluk: 20,
  terminOgle: 8,
  terminOgleSaat: '13:00',
  terminIkindi: 15,
  terminIkindiSaat: '15:30',
  yolUyari: true,
  yolDk: 30,
  bosSlotAtla: true,
  minBos: 1,
  gecisBos: 0,
  cumartesi: false,
  ufuk: 14,
  ayniPrefix: true,
  kuyrukYer: 'son',
  geriKim: ['no_answer', 'voicemail'],
  geriKere: 2,
  geoGun: 30,
  selfHeal: true,
  selfHealDeneme: 2,
  zamanlayici: false,
  zamanAktif: '09:55',
  zamanPasif: '18:35',
};

let _tourPlan = null;
let _ariaShown = '';
let _ariaGunluk = null;
let _tourAltaSlot = true;
let _tourBusy = false;
let _tourWatchSig = '';
let _tourWatch = null;
let _tourFirmGeri = null;
let _tourFirmOutcomes = null;
let _tourSettings = { ...TOUR_DEFAULTS };
let _tourTab = 'kampanya';
const TOUR_LOCK_KEYS = ['lastCampId', 'lastDay', 'lastTickAt'];

function tourUserId() {
  return (typeof currentUser !== 'undefined' && currentUser?.id) ? String(currentUser.id) : '';
}

function tourAccountPrefs() {
  const pref = tourPref();
  const out = {};
  Object.keys(TOUR_DEFAULTS).forEach((key) => { if (key !== 'geriKim') out[key] = pref[key]; });
  return out;
}

function tourAdoptPrefs(saved) {
  if (!saved || typeof saved !== 'object') return;
  const knobs = {};
  Object.keys(TOUR_DEFAULTS).forEach((key) => {
    if (key !== 'geriKim' && saved[key] !== undefined) knobs[key] = saved[key];
  });
  _tourSettings = { ...tourPref(), ...knobs };
  tourPaintSettings();
}

function tourSay(key, fb, vars) {
  const raw = typeof t === 'function' ? t(key) : fb;
  let text = !raw || raw === key ? fb : raw;
  if (vars) Object.entries(vars).forEach(([k, v]) => { text = text.split('{' + k + '}').join(String(v)); });
  return text;
}

let _ariaSpoken = '';

function tourStory(plan, extra) {
  if (!plan?.pick?.id) return tourSay('aria.none', 'Aria: boş slotu olan kampanya yok.');
  const row = (plan.rows || []).find((item) => item.id === plan.pick.id);
  if (!row) return tourSay('aria.none', 'Aria: boş slotu olan kampanya yok.');
  const focus = extra?.rowId ? ((plan.rows || []).find((item) => item.id === extra.rowId) || row) : row;
  const whyKey = extra?.hold ? 'aria.why.hold' : plan.pick.kind === 'stay' ? 'aria.why.stay' : plan.pick.kind === 'switch' ? 'aria.why.switch' : 'aria.why.pick';
  const whyFb = extra?.hold
    ? 'Kampanyayı değiştirmedim. {camp} açık kaldı.'
    : plan.pick.kind === 'stay'
    ? '{day} gününde {camp} hâlâ en çok boş slota sahip, {n} boş. Onda kaldım.'
    : plan.pick.kind === 'switch'
      ? '{day} en yakın boş gün. {camp} geride kaldı, {n} boş slotu var. Ona geçtim.'
      : '{day} en yakın boş gün. {camp} kampanyasında {n} boş slot var, onu seçtim.';
  const why = tourSay(whyKey, whyFb, { day: plan.day, camp: focus.name, n: focus.bos });
  if (extra?.kind === 'nearby' && extra.added) {
    return `${tourSay('aria.watch', 'Aria: {why}', { why })} ${ariaRoundBit(extra, focus)}`;
  }
  if (extra?.kind === 'nearby0') {
    return tourSay('aria.near0', 'Aria: {why} {plz} çevresinde eklenecek kişi bulamadım.', { why, plz: focus.anchor || '' });
  }
  if (extra?.kind === 'nearwait') {
    return tourSay('aria.nearwait', 'Aria: {why} Yakından yükleyecektim, sekme kapalı olduğu için beklettim. Sırada {pending} kişi var, eşik {esik}.', {
      why, pending: extra.pending, esik: extra.esik,
    });
  }
  if (extra?.kind === 'revert') {
    return tourSay('aria.revert', 'Aria: {why} Kuyrukta {pending} kişi vardı. {n} kişiyi tekrar aramaya aldım.', { why, pending: focus.pending, n: extra.moved });
  }
  if (extra?.kind === 'told') return `${tourSay('aria.told', 'Aria: {why} Temsilcilere bildirdim.', { why })} ${ariaQueuePlan(focus)}`;
  return `${tourSay('aria.watch', 'Aria: {why}', { why })} ${ariaQueuePlan(focus)}`;
}

function ariaPlzList(plzs, max) {
  const list = [];
  (Array.isArray(plzs) ? plzs : []).forEach((item) => {
    const plz = tourPlz(item);
    if (plz && !list.includes(plz)) list.push(plz);
  });
  const cap = Math.max(1, max || 12);
  const shown = list.slice(0, cap).join('-');
  return list.length > cap ? `${shown}…` : shown;
}

function ariaRoundBit(extra, row) {
  const esik = Math.max(1, Number(extra?.esik) || Number(tourPref().veriEsik) || 500);
  const pending = Number(extra?.pending ?? row?.pending) || 0;
  const added = Number(extra?.added) || 0;
  const now = pending + added;
  const rest = now >= esik
    ? tourSay('aria.round.done', 'Eşiğe geldim.')
    : tourSay('aria.round.rest', 'Kalanı sonraki turda.');
  const q = extra?.created
    ? tourSay('aria.queue.new', 'Yeni kuyruk «{q}» açtım.', { q: extra.queueName })
    : tourSay('aria.queue.add', 'Var olan «{q}» kuyruğuna ekledim.', { q: extra.queueName });
  return tourSay('aria.round', 'Bu tur {n} kişi yükledim. Posta kodları {plzs}. {q} Sırada {pending} kişi vardı, şimdi {now} var, eşik {esik}. {rest}', {
    n: added,
    plzs: ariaPlzList(extra?.plzs, 12) || extra?.anchor || row?.anchor || '',
    q,
    pending,
    now,
    esik,
    rest,
  });
}

function tourOtherWatch() {
  const watch = _tourWatch;
  const me = tourUserId();
  return !!(watch && watch.aktif && watch.userId && me && String(watch.userId) !== me);
}

function ariaWatchLine() {
  if (tourOtherWatch()) return tourSay('aria.other', 'Başka bir yönetici bakıyor. Kampanya değiştirmedim, kimse yüklemedim.');
  if (_tourWatch && _tourWatch.aktif && String(_tourWatch.userId || '') === tourUserId()) return tourSay('aria.mine', 'Bu hesap bakıyor.');
  return '';
}

function ariaQueuePlan(row) {
  const pref = tourPref();
  const esik = Math.max(1, Number(pref.veriEsik) || 500);
  const pending = Number(row?.pending) || 0;
  const args = { pending, esik };
  if (tourEffectivePasif()) return tourSay('aria.queue.pasif', 'Sırada {pending} kişi var. Kapalıyken kimse yüklemem.', args);
  if (pref.kuyrukYenile === false) return tourSay('aria.queue.off', 'Sırada {pending} kişi var. Kuyruk kapalı, kimse yüklemedim.', args);
  if (pending >= esik) return tourSay('aria.queue.full', 'Sırada {pending} kişi var, eşik {esik}. Sıra dolu, kimse yüklemedim.', args);
  if (pref.kuyrukMod === 'yakin') {
    if (!row?.anchor) return tourSay('aria.queue.noanchor', 'Sırada {pending} kişi var. Yakından yüklemek için bu kampanyada posta kodu yok.', args);
    return tourSay('aria.queue.need.near', 'Sırada {pending} kişi var, eşik {esik}. Yakından kişi yüklerim.', args);
  }
  if (!(row?.revertIds || []).length) return tourSay('aria.queue.norevert', 'Sırada {pending} kişi var. Yeniden sıraya alınacak açılmayan kişi yok.', args);
  return tourSay('aria.queue.need.revert', 'Sırada {pending} kişi var, eşik {esik}. Açılmayanları yeniden sıraya alırım.', args);
}

function ariaVoice(text) {
  return String(text || '').replace(/^Aria:\s*/i, '').trim();
}

function ariaContext() {
  const plan = _tourPlan;
  const row = plan?.pick?.id ? (plan.rows || []).find((item) => item.id === plan.pick.id) : null;
  const pasif = tourEffectivePasif();
  const esik = Math.max(1, Number(tourPref().veriEsik) || 500);
  const day = tourShortDay(plan?.day) || '';
  return {
    pasif,
    mode: pasif ? tourSay('aria.mode.off', 'Kapalı') : tourSay('aria.mode.on', 'Açık'),
    day,
    camp: row ? row.name : '',
    slots: row ? tourSay('aria.pop.slots', '{n} boş slot', { n: row.bos }) : '',
    queue: row ? tourSay('aria.pop.queue', 'Kuyruk {pending} / {esik}', { pending: row.pending, esik }) : '',
    pct: row ? Math.max(0, Math.min(100, Math.round((Number(row.pending) || 0) / esik * 100))) : 0,
    line: ariaVoice(_ariaShown || (plan ? tourStory(plan) : '')) || tourSay('aria.idle', 'Bakıyorum.'),
  };
}

function ariaEarlier(current) {
  const today = tourClock().ymd;
  const lines = _ariaGunluk && _ariaGunluk.day === today && Array.isArray(_ariaGunluk.lines) ? _ariaGunluk.lines : [];
  return lines.map((item) => ({ at: item.at || '', text: ariaVoice(tourLogText(item)) })).filter((item) => item.text && item.text !== current);
}

function ariaPaintNow() {
  const now = ariaContext();
  const mode = document.getElementById('aria-status-mode');
  if (mode) {
    mode.textContent = now.mode;
    mode.classList.toggle('is-on', !now.pasif);
    mode.classList.toggle('is-off', now.pasif);
  }
  const box = document.getElementById('aria-now');
  if (!box) return;
  const chips = [now.day, now.camp, now.slots].filter(Boolean);
  if (!chips.length && !now.queue) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `${chips.length ? `<div class="aria-pop-chips">${chips.map((item) => `<span>${tourEsc(item)}</span>`).join('')}</div>` : ''}
${now.queue ? `<div class="aria-pop-meta">${tourEsc(now.queue)}</div><div class="tour-fill"><span style="width:${now.pct}%"></span></div>` : ''}`;
}

function ariaLiveBits() {
  const pref = tourPref();
  const pasif = tourEffectivePasif();
  const looking = !!document.getElementById('aria-live')?.classList.contains('is-looking');
  const camp = pref.kampanyaDegis !== false;
  const queue = pref.kuyrukYenile !== false;
  const badge = pasif
    ? tourSay('aria.now.off', 'Duruyor')
    : (looking ? tourSay('aria.now.look', 'Bakıyor') : tourSay('aria.now.live', 'Şimdi'));
  const hold = tourSay('aria.job.hold', 'Bekliyor');
  const idle = tourSay('aria.job.wait', 'Yapmıyor');
  return {
    pasif,
    looking,
    camp,
    queue,
    badge,
    campWord: pasif ? hold : (camp ? tourSay('aria.job.camp.do', 'Değiştiriyor') : idle),
    queueWord: pasif ? hold : (queue ? tourSay('aria.job.queue.do', 'Dolduruyor') : idle),
  };
}

function ariaSetLooking(on) {
  const mark = document.getElementById('aria-looking');
  const chip = document.getElementById('aria-live');
  const page = document.getElementById('page-tour');
  const pop = document.getElementById('aria-pop');
  if (mark) mark.hidden = !on;
  if (chip) chip.classList.toggle('is-looking', !!on);
  if (page) page.classList.toggle('is-aria-looking', !!on);
  if (pop) {
    pop.classList.toggle('is-looking', !!on);
    const badge = pop.querySelector('.aria-now-kicker b');
    if (badge && !pop.hidden) badge.textContent = ariaLiveBits().badge;
  }
}

function tourShortDay(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}` : '';
}

function tourChipFacts(plan) {
  const row = plan?.pick?.id ? (plan.rows || []).find((item) => item.id === plan.pick.id) : null;
  if (!row) return null;
  const name = String(row.name || '').trim();
  const lead = name.match(/^(\d+)\b/);
  return { camp: lead ? lead[1] : name.slice(0, 14), n: Number(row.bos) || 0, day: tourShortDay(plan.day) };
}

function ariaAdmin() {
  const role = (typeof currentUser !== 'undefined' && currentUser?.role) || '';
  return ['super_admin', 'admin', 'firm_admin'].includes(role);
}

function ariaModeLine() {
  return tourEffectivePasif()
    ? tourSay('aria.chip.pasif', 'Kapalı. Kendi kendine bakmıyorum.')
    : tourSay('aria.chip.on', 'Açık. Kendi kendime bakıyorum.');
}

function ariaIsModeLine(text) {
  const raw = ariaVoice(text);
  if (!raw) return true;
  return [
    ariaModeLine(),
    tourSay('aria.chip.pasif', 'Kapalı. Kendi kendine bakmıyorum.'),
    tourSay('aria.chip.on', 'Açık. Kendi kendime bakıyorum.'),
    tourSay('aria.idle', 'Bakıyorum.'),
    'Pasif. Kendi kendine bakmıyorum.',
    'Passiv. Ich schaue nicht von selbst.',
    'Aktif. Kendi kendime bakıyorum.',
    'Aktiv. Ich schaue von selbst.',
    'Kapalı. Kendi kendine bakmıyorum.',
    'Açık. Kendi kendime bakıyorum.',
    'Aus. Ich schaue nicht von selbst.',
    'An. Ich schaue von selbst.',
    'Bakıyorum.',
    'Ich schaue.',
  ].some((item) => ariaVoice(item) === raw);
}

function tourPaintLive(plan, line, speak) {
  let text = line || '';
  if (!text && !tourEffectivePasif() && plan?.pick?.id) text = tourStory(plan);
  if (!text || ariaIsModeLine(text)) text = ariaModeLine();
  if (text) _ariaShown = text;
  const chip = document.getElementById('aria-live');
  if (chip) {
    const facts = tourChipFacts(plan);
    const day = document.getElementById('aria-live-day');
    const camp = document.getElementById('aria-live-camp');
    const count = document.getElementById('aria-live-n');
    chip.hidden = !ariaAdmin();
    chip.classList.toggle('is-on', !!facts);
    chip.classList.toggle('is-pasif', tourEffectivePasif());
    if (day) day.textContent = facts ? facts.day : '';
    if (camp) camp.textContent = facts ? facts.camp : '';
    if (count) count.textContent = facts ? String(facts.n) : '';
    chip.title = text;
    chip.setAttribute('aria-label', facts ? `Aria ${facts.day} ${facts.camp}` : 'Aria');
  }
  const note = document.getElementById('aria-last');
  if (note) note.textContent = ariaVoice(text);
  if (speak && text && text !== _ariaSpoken) {
    _ariaSpoken = text;
    tourSpeak(text);
  }
  ariaPaintNow();
  const pop = document.getElementById('aria-pop');
  if (pop && !pop.hidden) ariaFillPop();
}

function ariaPlacePop() {
  const pop = document.getElementById('aria-pop');
  const btn = document.getElementById('aria-live');
  if (!pop || !btn) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const width = 340;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  pop.style.top = `${Math.round(rect.bottom + 8)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

function ariaFillPop() {
  const pop = document.getElementById('aria-pop');
  if (!pop) return;
  const now = ariaContext();
  const live = ariaLiveBits();
  const chips = [now.day, now.camp, now.slots].filter(Boolean);
  const earlier = ariaEarlier(now.line).slice(-3);
  pop.classList.toggle('is-off', live.pasif);
  pop.classList.toggle('is-live', !live.pasif);
  pop.classList.toggle('is-looking', live.looking);
  pop.innerHTML = `<div class="aria-pop-head">
  <span class="aria-pop-who"><span class="aria-orb" aria-hidden="true"></span><span>Aria</span></span>
  <div class="tour-switch aria-pop-switch" role="group" aria-label="Aria">
    <button type="button" class="tour-switch-btn is-off-side${now.pasif ? ' is-on' : ''}" onclick="tourSetMode(false)">${tourEsc(tourSay('aria.mode.off', 'Kapalı'))}</button>
    <button type="button" class="tour-switch-btn is-on-side${now.pasif ? '' : ' is-on'}" onclick="tourSetMode(true)">${tourEsc(tourSay('aria.mode.on', 'Açık'))}</button>
  </div>
</div>
<div class="aria-now-card">
  <div class="aria-now-kicker"><span class="aria-ping" aria-hidden="true"></span><b>${tourEsc(live.badge)}</b></div>
  <p class="aria-pop-line">${tourEsc(now.line)}</p>
</div>
<div class="aria-pop-jobs">
  <label class="aria-job${live.camp && !live.pasif ? ' is-doing' : ''}${live.camp ? '' : ' is-wait'}" title="${tourEsc(tourSay('aria.job.camp.tip', 'Açıkken kampanyayı değiştirir. Kapalıyken açık kampanyada kalır.'))}"><input type="checkbox" ${live.camp ? 'checked' : ''} onchange="tourFlag('kampanyaDegis', this)"><span class="aria-job-copy"><b>${tourEsc(tourSay('aria.job.camp', 'Kampanya'))}</b><small>${tourEsc(live.campWord)}</small></span></label>
  <label class="aria-job${live.queue && !live.pasif ? ' is-doing' : ''}${live.queue ? '' : ' is-wait'}" title="${tourEsc(tourSay('aria.job.queue.tip', 'Açıkken kuyruğu doldurur. Kapalıyken kuyruğa kimse yazmaz.'))}"><input type="checkbox" ${live.queue ? 'checked' : ''} onchange="tourFlag('kuyrukYenile', this)"><span class="aria-job-copy"><b>${tourEsc(tourSay('aria.job.queue', 'Kuyruk'))}</b><small>${tourEsc(live.queueWord)}</small></span></label>
</div>
${ariaWatchLine() ? `<p class="aria-pop-job">${tourEsc(ariaWatchLine())}</p>` : ''}
${chips.length ? `<div class="aria-pop-chips">${chips.map((item) => `<span>${tourEsc(item)}</span>`).join('')}</div>` : ''}
${now.queue ? `<div class="aria-pop-meta">${tourEsc(now.queue)}</div><div class="tour-fill"><span style="width:${now.pct}%"></span></div>` : ''}
${earlier.length ? `<div class="aria-pop-earlier"><span>${tourEsc(tourSay('aria.earlier', 'Bugün daha önce'))}</span>${earlier.map((item) => `<p><b>${tourEsc(item.at)}</b> ${tourEsc(item.text)}</p>`).join('')}</div>` : ''}
<button type="button" class="aria-pop-go" onclick="ariaOpenPage()">${tourEsc(tourSay('aria.pop.open', 'Aria sayfası'))}</button>`;
}

function ariaOpenPop() {
  const pop = document.getElementById('aria-pop');
  const btn = document.getElementById('aria-live');
  if (!pop || !btn || btn.hidden) return;
  if (typeof mbCloseTopbarPops === 'function') mbCloseTopbarPops('aria');
  ariaFillPop();
  pop.hidden = false;
  btn.classList.add('is-open');
  btn.setAttribute('aria-expanded', 'true');
  ariaPlacePop();
}

function ariaClosePop() {
  const pop = document.getElementById('aria-pop');
  const btn = document.getElementById('aria-live');
  if (pop) pop.hidden = true;
  if (btn) {
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function ariaTogglePop(ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const pop = document.getElementById('aria-pop');
  if (!pop) return;
  if (!pop.hidden) ariaClosePop();
  else ariaOpenPop();
}

function ariaShowPop() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  clearTimeout(window._ariaPopHide);
  const pop = document.getElementById('aria-pop');
  if (pop && !pop.hidden) return;
  ariaOpenPop();
}

function ariaScheduleHide() {
  clearTimeout(window._ariaPopHide);
  window._ariaPopHide = setTimeout(() => {
    const pop = document.getElementById('aria-pop');
    const btn = document.getElementById('aria-live');
    if (!pop || pop.hidden) return;
    if (btn?.matches(':hover') || pop.matches(':hover')) return;
    ariaClosePop();
  }, 180);
}

function ariaChipBos() {
  const row = _tourPlan?.pick?.id ? (_tourPlan.rows || []).find((item) => item.id === _tourPlan.pick.id) : null;
  return row ? Number(row.bos) || 0 : null;
}

function ariaHm(value) {
  return String(value || '').slice(0, 5);
}

function ariaWatched(ymd, campId) {
  if (!_tourPlan?.day || !_tourPlan?.pick?.id) return false;
  if (ymd && ymd !== _tourPlan.day) return false;
  if (campId && campId !== _tourPlan.pick.id) return false;
  return true;
}

function ariaDelta(kind, detail) {
  const d = detail || {};
  const hit = (ymd, campId) => ariaWatched(ymd, campId);
  if (kind === 'alta-open' || kind === 'add' || kind === 'free') return hit(d.day, d.campId) ? 1 : 0;
  if (kind === 'book') return hit(d.day, d.campId) ? -1 : 0;
  if (kind === 'del') return d.empty && hit(d.day, d.campId) ? -1 : 0;
  if (kind === 'move') {
    let n = 0;
    if (hit(d.toDay, d.campId)) n -= 1;
    if (hit(d.fromDay, d.campId)) n += 1;
    return n;
  }
  return 0;
}

function ariaCountBit(was, now, otherDay) {
  if (now == null) return '';
  if (otherDay) return tourSay('aria.cal.other', 'Baktığım günde boş slot {n}.', { n: now });
  if (was == null || was === now) return tourSay('aria.cal.same', 'Boş slot {n}.', { n: now });
  return tourSay('aria.cal.delta', 'Boş slot {was} iken {n} oldu.', { was, n: now });
}

function ariaCalendarLine(kind, detail, was, now) {
  const d = detail || {};
  const saat = ariaHm(d.saat || d.toSaat);
  const from = ariaHm(d.fromSaat);
  const eventDay = d.day || d.toDay || '';
  const otherDay = !!(_tourPlan?.day && eventDay && eventDay !== _tourPlan.day);
  const bit = ariaCountBit(was, now, otherDay);
  let why = '';
  if (kind === 'alta-open') why = tourSay('aria.cal.alta.open', '{saat} alta alındı. Onun için aynı saate yeni boş slot açtım.', { saat });
  else if (kind === 'alta') why = tourSay('aria.cal.alta', '{saat} alta alındı. Yeni boş slot açmadım.', { saat });
  else if (kind === 'move') why = from
    ? tourSay('aria.cal.move', '{from} saatinden {saat} saatine randevu taşıdım. Eski saat boşaldı, bu saat doldu.', { from, saat })
    : tourSay('aria.cal.move.here', '{saat} saatine bir randevu taşıdım.', { saat });
  else if (kind === 'book') why = tourSay('aria.cal.book', '{saat} doldu, randevu yazıldı.', { saat });
  else if (kind === 'add') why = tourSay('aria.cal.add', '{saat} için bir boş yer daha açtım.', { saat });
  else if (kind === 'del') why = tourSay('aria.cal.del', '{saat} yerini sildim.', { saat });
  else if (kind === 'free') why = tourSay('aria.cal.free', '{saat} yine boş. Randevu kalktı.', { saat });
  else if (kind === 'up') why = tourSay('aria.cal.up', '{saat} randevusunu alttan üste aldım.', { saat });
  else return '';
  return tourSay('aria.cal.wrap', 'Aria: {why} {bit}', { why, bit }).replace(/\s+/g, ' ').trim();
}

let _ariaCalQueue = null;
let _ariaCalRun = false;

async function ariaAfterCalendar(kind, detail, wasKnown) {
  const was = wasKnown == null ? ariaChipBos() : wasKnown;
  if (wasKnown == null) {
    const delta = ariaDelta(kind, detail);
    if (was != null && delta) {
      const count = document.getElementById('aria-live-n');
      if (count) count.textContent = String(Math.max(0, was + delta));
    }
  }
  _ariaCalQueue = { kind, detail: detail || {}, was };
  if (_ariaCalRun) return;
  _ariaCalRun = true;
  try {
    while (_ariaCalQueue) {
      const job = _ariaCalQueue;
      _ariaCalQueue = null;
      let spins = 0;
      while (_tourBusy && spins < 25) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        spins += 1;
      }
      if (_tourBusy) {
        const pending = _ariaCalQueue || job;
        _ariaCalQueue = null;
        setTimeout(() => { void ariaAfterCalendar(pending.kind, pending.detail, pending.was); }, 600);
        break;
      }
      await tourRefresh({ silent: true });
      const now = ariaChipBos();
      const line = ariaCalendarLine(job.kind, job.detail, job.was, now);
      if (!line) continue;
      tourPaintLive(_tourPlan, line, true);
      void tourRemember({ k: 'cal', text: line, day: job.detail.day || job.detail.toDay || _tourPlan?.day || '', camp: job.detail.campId || '', n: now });
    }
  } finally {
    _ariaCalRun = false;
  }
}

function ariaOpenPage() {
  ariaClosePop();
  if (typeof navigate === 'function') navigate('tour');
}

function tourSpeak(text) {
  const gm = document.getElementById('global-mascot');
  const bubble = document.getElementById('cust-empty-bubble');
  if (gm) gm.classList.add('global-mascot--aria');
  if (!bubble || (typeof isMimiBubbleMuted === 'function' && isMimiBubbleMuted())) return;
  const hidden = typeof isMimiHidden === 'function' && isMimiHidden();
  if (!hidden && typeof _showCustEmptyBubbleMsg === 'function') {
    _showCustEmptyBubbleMsg(text);
    return;
  }
  bubble.textContent = typeof formatMascotSpokenLine === 'function' ? formatMascotSpokenLine(text) : text;
  bubble.style.display = 'block';
  bubble.classList.remove('cust-empty-bubble--pop');
  void bubble.offsetWidth;
  bubble.classList.add('cust-empty-bubble--pop');
  if (typeof placeGlobalMascotBubble === 'function') placeGlobalMascotBubble();
  if (typeof _ensureBubblePlacer === 'function') _ensureBubblePlacer();
}

function tourWhy(entry) {
  const kind = entry?.kind || 'pick';
  const key = kind === 'stay' ? 'aria.why.stay' : kind === 'switch' ? 'aria.why.switch' : 'aria.why.pick';
  const fb = kind === 'stay'
    ? '{day} gününde {camp} hâlâ en çok boş slota sahip, {n} boş. Onda kaldım.'
    : kind === 'switch'
      ? '{day} en yakın boş gün. {camp} geride kaldı, {n} boş slotu var. Ona geçtim.'
      : '{day} en yakın boş gün. {camp} kampanyasında {n} boş slot var, onu seçtim.';
  return tourSay(key, fb, { day: entry?.day || '', camp: entry?.camp || '', n: entry?.n || 0 });
}

function tourLogText(item) {
  if (!item) return '';
  if (item.text) return item.text;
  const why = tourWhy(item);
  if (item.k === 'near') {
    const q = item.created
      ? tourSay('aria.queue.new', 'Yeni kuyruk «{q}» açtım.', { q: item.q || '' })
      : tourSay('aria.queue.add', 'Var olan «{q}» kuyruğuna ekledim.', { q: item.q || '' });
    return tourSay('aria.near', 'Aria: {why} Kuyrukta {pending} kişi vardı, eşik {esik}. {plz} çevresinden {km} km içinde {n} kişi, {codes} posta kodu. {q}', {
      why, pending: item.pending, esik: item.esik, plz: item.plz || '', km: item.km, n: item.added, codes: item.codes || 0, q,
    });
  }
  if (item.k === 'near0') return tourSay('aria.near0', 'Aria: {why} {plz} çevresinde eklenecek kişi bulamadım.', { why, plz: item.plz || '' });
  if (item.k === 'revert') return tourSay('aria.revert', 'Aria: {why} Kuyrukta {pending} kişi vardı. {n} kişiyi tekrar aramaya aldım.', { why, pending: item.pending, n: item.moved });
  if (item.k === 'nearwait') return tourSay('aria.nearwait', 'Aria: {why} Yakından yükleyecektim, sekme kapalı olduğu için beklettim. Sırada {pending} kişi var, eşik {esik}.', { why, pending: item.pending, esik: item.esik });
  if (item.k === 'told') return tourSay('aria.told', 'Aria: {why} Temsilcilere bildirdim.', { why });
  return '';
}

function tourPaintLog(gunluk) {
  _ariaGunluk = gunluk && typeof gunluk === 'object' ? gunluk : null;
  const box = document.getElementById('aria-log');
  if (!box) return;
  const today = tourClock().ymd;
  const lines = _ariaGunluk && _ariaGunluk.day === today && Array.isArray(_ariaGunluk.lines) ? _ariaGunluk.lines : [];
  const title = `<p class="aria-log-kicker">${tourEsc(tourSay('aria.log', 'Bugün'))}</p>`;
  box.hidden = false;
  box.innerHTML = lines.length
    ? title + lines.map((item) => `<p class="aria-log-line"><span class="aria-log-at">${tourEsc(item.at || '')}</span><span class="aria-log-text">${tourEsc(ariaVoice(tourLogText(item)))}</span></p>`).join('')
    : title + `<p class="aria-log-empty">${tourEsc(tourSay('aria.log.empty', 'Bugün henüz bir şey söylemedim.'))}</p>`;
  const pop = document.getElementById('aria-pop');
  if (pop && !pop.hidden) ariaFillPop();
}

async function tourRemember(entry) {
  if (!entry || !entry.k) return;
  const firmId = tourFirmId();
  if (!firmId || typeof sb !== 'function') return;
  const clock = tourClock();
  const hm = `${String(Math.floor(clock.mins / 60)).padStart(2, '0')}:${String(clock.mins % 60).padStart(2, '0')}`;
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.tour && typeof existing.tour === 'object' ? existing.tour : {};
  const gunluk = prev.gunluk && prev.gunluk.day === clock.ymd ? prev.gunluk : { day: clock.ymd, lines: [] };
  const lines = Array.isArray(gunluk.lines) ? gunluk.lines.slice() : [];
  const last = lines[lines.length - 1];
  if (last && entry.text && last.text === entry.text) {
    tourPaintLog({ day: clock.ymd, lines });
    return;
  }
  if (last && last.k === entry.k && last.camp === entry.camp && last.day === entry.day && last.added === entry.added && last.moved === entry.moved && !entry.text) {
    tourPaintLog({ day: clock.ymd, lines });
    return;
  }
  lines.push({ at: hm, ...entry });
  const next = { day: clock.ymd, lines: lines.slice(-30) };
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, tour: { ...prev, gunluk: next } } }),
  });
  tourPaintLog(next);
}

function tourEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function tourFirmId() {
  const active = typeof getActiveFirmId === 'function' ? (getActiveFirmId() || '') : '';
  if (active) return active;
  if (typeof _impersonation !== 'undefined' && _impersonation?.firm_id) return _impersonation.firm_id;
  if (typeof currentUser !== 'undefined' && currentUser?.firm_id && currentUser.role !== 'super_admin') return currentUser.firm_id;
  return '';
}

function tourPref() {
  return { ...TOUR_DEFAULTS, ...(_tourSettings || {}) };
}

function tourStatusOk(key) {
  const name = String(key || '').toLowerCase();
  if (!/^[a-z0-9_]{1,40}$/.test(name)) return false;
  return !['pending', 'appointment', 'appointment_done', 'dnc', 'calling', 'new'].includes(name);
}

function tourOutcomeStatus(key, row) {
  const name = String(key || '').trim();
  if (name === 'dnc') return 'dnc';
  if (name === 'appointment' || name === 'appointment_done') return 'appointment';
  const cat = typeof mbOutcomeCategory === 'function'
    ? mbOutcomeCategory({ key: name, category: row?.category })
    : (name === 'negative' || name === 'callback' ? name : 'neutral');
  if (cat === 'appointment') return 'appointment';
  if (cat === 'negative') return 'negative';
  if (cat === 'callback') return 'callback';
  return name.toLowerCase();
}

function tourOutcomeNames(key, row, status) {
  const pack = typeof OUTCOME_I18N !== 'undefined' ? (OUTCOME_I18N[key] || OUTCOME_I18N[status]) : null;
  const raw = String(row?.label || '').trim();
  if (pack && (!raw || raw === key || raw === status || raw === pack.tr || raw === pack.de)) return { tr: pack.tr, de: pack.de };
  const name = raw || (pack ? pack.tr : status);
  return { tr: name, de: name };
}

function tourGeriKim() {
  const allowed = new Set((Array.isArray(_tourFirmOutcomes) ? _tourFirmOutcomes : []).map((row) => row.status));
  const source = Array.isArray(_tourFirmGeri) ? _tourFirmGeri : ['no_answer', 'voicemail'];
  return source.map((key) => String(key || '').toLowerCase()).filter((key) => tourStatusOk(key) && (!allowed.size || allowed.has(key)));
}

function tourGeriKere() {
  return Math.max(1, Math.min(10, Number(tourPref().geriKere) || 2));
}

function tourGeoGun() {
  return Math.max(1, Math.min(100, Number(tourPref().geoGun) || 30));
}

function tourEffectivePasif() {
  const pref = tourPref();
  if (pref.zamanlayici) {
    const clock = tourClock();
    const on = tourHm(pref.zamanAktif);
    const off = tourHm(pref.zamanPasif);
    if (on != null && off != null) {
      if (on < off) return clock.mins < on || clock.mins >= off;
      return clock.mins >= off && clock.mins < on;
    }
  }
  return !pref.aktif;
}

async function tourLoadSettings() {
  _tourSettings = { ...TOUR_DEFAULTS };
  _tourFirmGeri = null;
  _tourFirmOutcomes = null;
  const userId = tourUserId();
  const firmId = tourFirmId();
  if (typeof sb === 'function' && userId) {
    const rows = await sb(`users?id=eq.${userId}&select=ui_prefs`).catch(() => []);
    const saved = rows?.[0]?.ui_prefs?.tour;
    if (saved && typeof saved === 'object') tourAdoptPrefs(saved);
  }
  let gunluk = null;
  if (typeof sb === 'function' && firmId) {
    const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
    const tk = firms?.[0]?.settings?.default_takvim;
    _tourAltaSlot = !tk || tk.altaYeniSlot !== false;
    const firmTour = firms?.[0]?.settings?.tour;
    if (firmTour && typeof firmTour === 'object') {
      TOUR_LOCK_KEYS.forEach((key) => {
        if (firmTour[key] != null && firmTour[key] !== '') _tourSettings[key] = firmTour[key];
      });
      gunluk = firmTour.gunluk;
      _tourWatch = firmTour.watch && typeof firmTour.watch === 'object' ? firmTour.watch : null;
      if (Array.isArray(firmTour.geriKim)) _tourFirmGeri = firmTour.geriKim;
      else if (Array.isArray(_tourWatch?.geriKim)) _tourFirmGeri = _tourWatch.geriKim;
      else _tourFirmGeri = null;
    } else {
      _tourWatch = null;
      _tourFirmGeri = null;
    }
    await tourLoadFirmOutcomes(firmId);
  } else {
    _tourWatch = null;
    _tourFirmGeri = null;
    _tourFirmOutcomes = null;
  }
  tourPaintLog(gunluk);
  tourPaintSettings();
  return _tourSettings;
}

async function tourSave(patch) {
  _tourSettings = { ...tourPref(), ...patch };
  tourPaintSettings();
  const keys = Object.keys(patch || {});
  if (keys.some((key) => !TOUR_LOCK_KEYS.includes(key))) {
    await tourSaveUser();
    await tourSaveWatch();
  }
  if (keys.some((key) => TOUR_LOCK_KEYS.includes(key))) await tourSaveLock();
  return _tourSettings;
}

async function tourSaveUser() {
  const userId = tourUserId();
  if (!userId || typeof sb !== 'function') return;
  const rows = await sb(`users?id=eq.${userId}&select=ui_prefs`).catch(() => []);
  const existing = rows?.[0]?.ui_prefs && typeof rows[0].ui_prefs === 'object' ? rows[0].ui_prefs : {};
  await sb(`users?id=eq.${userId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ ui_prefs: { ...existing, tour: tourAccountPrefs() } }),
  });
}

async function tourSaveWatch() {
  const firmId = tourFirmId();
  const userId = tourUserId();
  if (!firmId || !userId || typeof sb !== 'function') return;
  const pref = tourPref();
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.tour && typeof existing.tour === 'object' ? existing.tour : {};
  const mine = !prev.watch || !prev.watch.userId || prev.watch.userId === userId;
  const other = !!(prev.watch && prev.watch.aktif && prev.watch.userId && prev.watch.userId !== userId);
  let watch = prev.watch || null;
  if (pref.aktif && !other) {
    watch = {
      aktif: true,
      userId,
      kuyrukMod: pref.kuyrukMod === 'yakin' ? 'yakin' : 'revert',
      kuyrukYer: pref.kuyrukYer === 'yeni' ? 'yeni' : 'son',
      kampanyaDegis: pref.kampanyaDegis !== false,
      kuyrukYenile: pref.kuyrukYenile !== false,
      geriKim: tourGeriKim(),
      geriKere: tourGeriKere(),
      geoGun: tourGeoGun(),
      veriEsik: Math.max(50, Math.min(20000, Number(pref.veriEsik) || 500)),
      bosSlotAtla: pref.bosSlotAtla !== false,
      minBos: Math.max(1, Math.min(20, Number(pref.minBos) || 1)),
      gecisBos: Math.max(0, Math.min(20, Number(pref.gecisBos) || 0)),
      cumartesi: !!pref.cumartesi,
      ufuk: [7, 14, 21].includes(Number(pref.ufuk)) ? Number(pref.ufuk) : 14,
      hedefManuel: !!pref.hedefManuel,
      hedefTarih: /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih) ? pref.hedefTarih : '',
      zamanlayici: !!pref.zamanlayici,
      zamanAktif: pref.zamanAktif || '09:55',
      zamanPasif: pref.zamanPasif || '18:35',
    };
  } else if (mine && !pref.aktif) watch = { aktif: false, userId };
  _tourWatch = watch;
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, tour: { ...prev, watch } } }),
  });
}

async function tourSaveLock() {
  const firmId = tourFirmId();
  if (!firmId || typeof sb !== 'function') return;
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.tour && typeof existing.tour === 'object' ? existing.tour : {};
  const lock = {};
  TOUR_LOCK_KEYS.forEach((key) => {
    if (_tourSettings[key] != null && _tourSettings[key] !== '') lock[key] = _tourSettings[key];
  });
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, tour: { ...prev, ...lock } } }),
  });
}

function tourSetChecked(id, on) {
  const el = document.getElementById(id);
  if (el) el.checked = !!on;
}

function tourPaintSettings() {
  const pref = tourPref();
  const pasif = tourEffectivePasif();
  const off = document.getElementById('tour-mode-off');
  const on = document.getElementById('tour-mode-on');
  const page = document.getElementById('page-tour');
  if (off) {
    off.classList.toggle('is-on', pasif);
    off.setAttribute('aria-pressed', pasif ? 'true' : 'false');
  }
  if (on) {
    on.classList.toggle('is-on', !pasif);
    on.setAttribute('aria-pressed', pasif ? 'false' : 'true');
  }
  if (page) page.classList.toggle('is-aria-on', !pasif);
  const sayOn = document.getElementById('tour-say-on');
  const sayOff = document.getElementById('tour-say-off');
  if (sayOn) sayOn.hidden = pasif;
  if (sayOff) sayOff.hidden = !pasif;
  ariaPaintNow();
  const wait = document.getElementById('tour-wait-n');
  if (wait) wait.value = String(pref.bekleyenEsik);
  const esik = document.getElementById('tour-esik');
  if (esik) esik.value = String(pref.veriEsik);
  const minBos = document.getElementById('tour-min-bos');
  if (minBos) minBos.value = String(Math.max(1, Math.min(20, Number(pref.minBos) || 1)));
  const margin = document.getElementById('tour-margin');
  if (margin) margin.value = String(Math.max(0, Math.min(20, Number(pref.gecisBos) || 0)));
  const horizon = document.getElementById('tour-horizon');
  if (horizon) horizon.value = String([7, 14, 21].includes(Number(pref.ufuk)) ? Number(pref.ufuk) : 14);
  const kuyruk = document.getElementById('tour-kuyruk');
  if (kuyruk) kuyruk.value = pref.kuyrukMod === 'yakin' ? 'yakin' : 'revert';
  const near = pref.kuyrukMod === 'yakin';
  document.querySelectorAll('.tour-yakin').forEach((el) => { el.hidden = !near; });
  document.querySelectorAll('.tour-geri').forEach((el) => { el.hidden = near; });
  tourPaintGeri(near);
  const kere = document.getElementById('tour-geri-kere');
  if (kere) kere.value = String(tourGeriKere());
  const geoGun = document.getElementById('tour-geo-gun');
  if (geoGun) geoGun.value = String(tourGeoGun());
  const place = document.getElementById('tour-kuyruk-yer');
  if (place) place.value = pref.kuyrukYer === 'yeni' ? 'yeni' : 'son';
  const radius = document.getElementById('tour-radius');
  if (radius) radius.value = String([10, 20, 30, 50].includes(Number(pref.radiusKm)) ? pref.radiusKm : 30);
  const yakinN = document.getElementById('tour-yakin-n');
  if (yakinN) yakinN.value = String(pref.yakinAdet);
  const onWrap = document.getElementById('tour-on-wrap');
  const offWrap = document.getElementById('tour-off-wrap');
  if (onWrap) onWrap.classList.toggle('is-off', !pref.zamanlayici);
  if (offWrap) offWrap.classList.toggle('is-off', !pref.zamanlayici);
  const hazir = document.getElementById('tour-hazir');
  if (hazir) hazir.value = String(pref.hazirEsik);
  const yol = document.getElementById('tour-yol-dk');
  if (yol) yol.value = String(pref.yolDk);
  const gunluk = document.getElementById('tour-gunluk');
  if (gunluk) gunluk.value = String(pref.terminGunluk);
  const ogle = document.getElementById('tour-ogle');
  if (ogle) ogle.value = String(pref.terminOgle);
  const ogleSaat = document.getElementById('tour-ogle-saat');
  if (ogleSaat) ogleSaat.value = pref.terminOgleSaat;
  const ikindi = document.getElementById('tour-ikindi');
  if (ikindi) ikindi.value = String(pref.terminIkindi);
  const ikindiSaat = document.getElementById('tour-ikindi-saat');
  if (ikindiSaat) ikindiSaat.value = pref.terminIkindiSaat;
  const heal = document.getElementById('tour-heal-n');
  if (heal) heal.value = String(pref.selfHealDeneme);
  const onAt = document.getElementById('tour-on-at');
  if (onAt) onAt.value = pref.zamanAktif;
  const offAt = document.getElementById('tour-off-at');
  if (offAt) offAt.value = pref.zamanPasif;
  tourSetChecked('tour-auto', pref.auto);
  tourSetChecked('tour-switch', pref.autoSwitch);
  tourSetChecked('tour-oto', pref.kampanyaOto);
  tourSetChecked('tour-wait', pref.bekleyen);
  tourSetChecked('tour-event', pref.olay);
  tourSetChecked('tour-approve', pref.onay);
  tourSetChecked('tour-hedef', pref.terminHedef);
  tourSetChecked('tour-yol', pref.yolUyari);
  tourSetChecked('tour-skip', pref.bosSlotAtla);
  tourSetChecked('tour-sat', pref.cumartesi);
  tourSetChecked('tour-camp-auto', pref.kampanyaDegis !== false);
  tourSetChecked('tour-camp-auto-run', pref.kampanyaDegis !== false);
  tourSetChecked('tour-queue-auto', pref.kuyrukYenile !== false);
  tourSetChecked('tour-queue-auto-run', pref.kuyrukYenile !== false);
  const campJob = document.getElementById('tour-camp-auto-run')?.closest('.aria-job');
  const queueJob = document.getElementById('tour-queue-auto-run')?.closest('.aria-job');
  if (campJob) campJob.title = tourSay('aria.job.camp.tip', 'Açıkken kampanyayı değiştirir. Kapalıyken açık kampanyada kalır.');
  if (queueJob) queueJob.title = tourSay('aria.job.queue.tip', 'Açıkken kuyruğu doldurur. Kapalıyken kuyruğa kimse yazmaz.');
  const pop = document.getElementById('aria-pop');
  if (pop && !pop.hidden && typeof ariaFillPop === 'function') ariaFillPop();
  tourSetChecked('tour-alta-slot', _tourAltaSlot);
  tourSetChecked('tour-prefix', pref.ayniPrefix);
  tourSetChecked('tour-heal', pref.selfHeal);
  tourSetChecked('tour-clock', pref.zamanlayici);
  const day = document.getElementById('tour-day-label');
  if (day) day.textContent = (pref.hedefManuel && pref.hedefTarih) || _tourPlan?.day || '—';
}

function tourClock() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    gun: TOUR_GUN[get('weekday')] || 'pzt',
    mins: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function tourAddDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function tourWeekend(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0) return true;
  return dow === 6 && tourPref().cumartesi !== true;
}

function tourNextBusiness(ymd) {
  let day = tourAddDays(ymd, 1);
  while (tourWeekend(day)) day = tourAddDays(day, 1);
  return day;
}

function tourBerlinMins(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function tourHm(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function tourYmd(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function tourPlz(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 5) return '';
  return digits.padStart(5, '0').slice(-5);
}

function tourNo(name) {
  const match = String(name || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 99999;
}

function tourChoose(rows, currentId) {
  const pref = tourPref();
  const minBos = Math.max(1, Math.min(20, Number(pref.minBos) || 1));
  const margin = Math.max(0, Math.min(20, Number(pref.gecisBos) || 0));
  const candidates = (rows || []).filter((row) => row.bos >= minBos).slice().sort((a, b) => b.bos - a.bos || tourNo(a.name) - tourNo(b.name) || String(a.name).localeCompare(String(b.name)));
  const leader = candidates[0] || null;
  const current = candidates.find((row) => row.id === currentId) || null;
  if (!leader) return { kind: 'none', id: '' };
  if (current && current.bos + margin >= leader.bos) return { kind: 'stay', id: current.id };
  if (current && current.id !== leader.id) return { kind: 'switch', id: leader.id };
  return { kind: 'pick', id: leader.id };
}

function tourShift(plan, clock) {
  if (!plan) return { label: 'noplan' };
  const row = plan[clock.gun];
  if (!row || row.off) return { label: 'off' };
  const start = tourHm(row.start);
  const end = tourHm(row.end);
  if (start == null || end == null || clock.mins < start || clock.mins >= end) return { label: 'out' };
  for (const item of row.breaks || []) {
    const a = tourHm(item.start);
    const z = tourHm(item.end);
    if (a == null || z == null || clock.mins < a || clock.mins >= z) continue;
    return { label: z - clock.mins <= 5 ? 'breaksoon' : 'break', breakEnd: item.end };
  }
  return { label: 'in' };
}

function tourAnchor(appts, slots) {
  if (!appts.length) return '';
  const slotMins = slots.map((s) => tourHm(s.time)).filter((n) => n != null);
  if (!slotMins.length) return appts[0].plz;
  let best = appts[0];
  let bestGap = Infinity;
  appts.forEach((appt) => {
    if (appt.mins == null) return;
    const gap = Math.min(...slotMins.map((s) => Math.abs(s - appt.mins)));
    if (gap < bestGap) {
      bestGap = gap;
      best = appt;
    }
  });
  return best.plz;
}

async function tourCount(path) {
  if (typeof mbHeadCount === 'function') return mbHeadCount(path);
  const rows = await sb(`${path}&limit=1`);
  return Array.isArray(rows) ? rows.length : 0;
}

async function tourBuild() {
  const firmId = tourFirmId();
  const clock = tourClock();
  if (!firmId || typeof sb !== 'function') {
    return { firmId: '', clock, shift: { label: 'noplan' }, day: '', rows: [], pick: { kind: 'none' } };
  }
  const pref = tourPref();
  const nextDay = tourNextBusiness(clock.ymd);
  const span = [7, 14, 21].includes(Number(pref.ufuk)) ? Number(pref.ufuk) : 14;
  let start = nextDay;
  let end = tourAddDays(start, span);
  if (pref.hedefManuel && /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih)) {
    if (pref.hedefTarih < start) start = pref.hedefTarih;
    if (pref.hedefTarih > end) end = pref.hedefTarih;
  }
  const fromTop = tourAddDays(clock.ymd, -180);
  const load = () => Promise.all([
    sb(`firms?id=eq.${firmId}&select=settings`),
    sb(`campaigns?firm_id=eq.${firmId}&select=id,name,active_for_agents&order=name.asc&limit=200`),
    sb(`takvim_slots?firm_id=eq.${firmId}&tarih=gte.${start}&tarih=lte.${end}&gun_kapali=eq.false&select=id,campaign_id,tarih,baslangic_saat,durum,appointment_id&limit=4000`),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${start}T00:00:00&termin_tarih=lte.${end}T23:59:59&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz,termin_tarih&limit=4000`),
    sb(`appointments?firm_id=eq.${firmId}&termin_tarih=gte.${fromTop}T00:00:00&durum=not.in.(iptal,basarisiz)&select=campaign_id,plz&limit=4000`),
  ]);
  let firmRows; let camps; let slots; let appts; let history;
  const tries = pref.selfHeal ? Math.max(1, Math.min(5, Number(pref.selfHealDeneme) || 1)) : 1;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      [firmRows, camps, slots, appts, history] = await load();
      break;
    } catch (err) {
      if (attempt + 1 >= tries) throw err;
    }
  }
  const mesai = typeof opsNormalizeMesaiPlan === 'function' ? opsNormalizeMesaiPlan(firmRows?.[0]?.settings?.mesai_plan) : null;
  const shift = tourShift(mesai, clock);
  const slotRows = Array.isArray(slots) ? slots : [];
  const tally = new Map();
  slotRows.forEach((slot) => {
    const ymd = tourYmd(slot.tarih);
    if (!ymd || tourWeekend(ymd) || slot.durum !== 'bos' || slot.appointment_id) return;
    tally.set(ymd, (tally.get(ymd) || 0) + 1);
  });
  let outlook = [...tally.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, 8).map(([ymd, bos]) => ({ ymd, bos }));
  if (pref.hedefManuel && /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih) && !outlook.some((item) => item.ymd === pref.hedefTarih)) {
    outlook = [{ ymd: pref.hedefTarih, bos: tally.get(pref.hedefTarih) || 0 }, ...outlook].slice(0, 8);
  }
  const days = [...tally.keys()].sort();
  let day = pref.bosSlotAtla ? (days[0] || nextDay) : nextDay;
  if (pref.hedefManuel && /^\d{4}-\d{2}-\d{2}$/.test(pref.hedefTarih)) day = pref.hedefTarih;
  const names = new Map((Array.isArray(camps) ? camps : []).map((c) => [c.id, c.name || '']));
  const byCamp = new Map();
  const ensure = (id) => {
    if (!id || !names.has(id)) return null;
    if (!byCamp.has(id)) byCamp.set(id, { id, name: names.get(id), bos: 0, slots: [], appts: [], plzs: new Set(), pending: 0, revertIds: [], anchor: '', top: '' });
    return byCamp.get(id);
  };
  slotRows.forEach((slot) => {
    if (tourYmd(slot.tarih) !== day || slot.durum !== 'bos' || slot.appointment_id) return;
    const row = ensure(slot.campaign_id);
    if (!row) return;
    row.bos += 1;
    row.slots.push({ time: slot.baslangic_saat || '' });
  });
  (Array.isArray(appts) ? appts : []).forEach((appt) => {
    if (tourYmd(appt.termin_tarih) !== day) return;
    const row = ensure(appt.campaign_id);
    if (!row) return;
    const plz = tourPlz(appt.plz);
    const mins = tourBerlinMins(appt.termin_tarih);
    if (plz) row.plzs.add(plz);
    row.appts.push({ plz, mins });
  });
  const topCount = new Map();
  (Array.isArray(history) ? history : []).forEach((appt) => {
    const plz = tourPlz(appt.plz);
    if (!appt.campaign_id || !plz) return;
    const key = `${appt.campaign_id}|${plz}`;
    topCount.set(key, (topCount.get(key) || 0) + 1);
  });
  topCount.forEach((count, key) => {
    const [id, plz] = key.split('|');
    const row = byCamp.get(id);
    if (!row || count <= (row.topCount || 0)) return;
    row.top = plz;
    row.topCount = count;
  });
  const campRows = Array.isArray(camps) ? camps : [];
  const marked = campRows.find((camp) => camp.active_for_agents);
  const currentId = pref.lastCampId || marked?.id || '';
  let rows = [...byCamp.values()].filter((row) => row.bos > 0);
  if (pref.kampanyaDegis === false && currentId && !rows.some((row) => row.id === currentId)) {
    const camp = campRows.find((item) => item.id === currentId);
    const held = byCamp.get(currentId) || (camp ? { id: camp.id, name: camp.name || '', bos: 0, slots: [], appts: [], plzs: new Set(), pending: 0, revertIds: [], anchor: '', top: '' } : null);
    if (held) rows = [held, ...rows];
  }
  await Promise.all(rows.map(async (row) => {
    row.pending = await tourCount(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=eq.pending&select=id`).catch(() => 0);
    row.anchor = tourAnchor(row.appts.filter((a) => a.plz), row.slots) || row.top || '';
    const kim = tourGeriKim();
    const kere = tourGeriKere();
    if (row.pending >= pref.veriEsik || !row.plzs.size || !kim.length) return;
    const got = await sb(`contacts?firm_id=eq.${firmId}&campaign_id=eq.${row.id}&status=in.(${kim.join(',')})&or=(attempt_count.lt.${kere},attempt_count.is.null)&select=id,plz&limit=1000`).catch(() => []);
    row.revertIds = (Array.isArray(got) ? got : []).filter((c) => row.plzs.has(tourPlz(c.plz))).map((c) => c.id).filter(Boolean);
  }));
  const pick = tourChoose(rows, currentId);
  return { firmId, clock, shift, day, rows, pick, activeId: currentId, manual: !!pref.hedefManuel, outlook };
}

function tourLevel(row) {
  const pref = tourPref();
  if (row.pending < pref.veriEsik) return 'critical';
  if (row.pending < pref.hazirEsik) return 'prep';
  return 'enough';
}

function tourRender(plan) {
  const panel = document.getElementById('tour-panel');
  if (!panel) return;
  const locked = plan?.shift?.label === 'break';
  const shiftKey = plan?.shift?.label || 'noplan';
  const head = tourEffectivePasif()
    ? `<p class="tour-note">${tourEsc(tourSay('tour.pasif', 'Kapalı. Karar görünür, bildirim ve kuyruk işlemi gitmez.'))}</p>`
    : `<p class="tour-note">${tourEsc(tourSay('tour.note', 'Açık. En yakın boş güne bir kampanya bildirilir.'))}</p>`;
  if (!plan?.firmId) {
    panel.innerHTML = head + `<p class="tour-note">${tourEsc(tourSay('tour.needfirm', 'Firma seç'))}</p>`;
    return;
  }
  const pickRow = plan.rows.find((row) => row.id === plan.pick.id);
  const pickName = pickRow?.name || '';
  const pickKey = plan.pick.kind === 'stay' ? 'tour.stay' : plan.pick.kind === 'switch' ? 'tour.moved' : 'tour.picknew';
  const pickLine = plan.pick.kind === 'none'
    ? tourSay('tour.none', 'Boş slotu olan kampanya yok')
    : `${tourSay(pickKey, plan.pick.kind)} · ${pickName}`;
  const cards = plan.rows.length ? plan.rows.map((row) => {
    const level = tourLevel(row);
    const tag = tourSay('tour.' + level, level);
    const cls = level === 'critical' ? 'is-bad' : level === 'prep' ? 'is-mid' : 'is-ok';
    const picked = row.id === plan.pick.id ? ' is-pick' : '';
    const revert = row.revertIds.length && !locked
      ? `<button type="button" class="btn btn-ghost btn-sm" onclick="tourRevert('${row.id}')">${tourEsc(tourSay('tour.revert', '{n} kişiyi kuyruğa al', { n: row.revertIds.length }))}</button>`
      : '';
    const pack = row.anchor && row.bos > 0 && level !== 'enough' && !locked
      ? `<button type="button" class="btn btn-primary btn-sm" onclick="tourPackage('${row.id}')">${tourEsc(tourSay('tour.package', 'Paketi aç'))}</button>`
      : '';
    const esik = Math.max(1, Number(tourPref().veriEsik) || 500);
    const pct = Math.max(0, Math.min(100, Math.round((Number(row.pending) || 0) / esik * 100)));
    return `<div class="tour-row${picked}">
      <b>${tourEsc(row.name)}</b><span class="tour-tag ${cls}">${tourEsc(tag)}</span>
      <div class="tour-meta">${row.pending} ${tourEsc(tourSay('tour.pending', 'bekliyor'))} · ${row.bos} ${tourEsc(tourSay('tour.slots', 'boş'))}${row.anchor ? ' · ' + tourEsc(tourSay('tour.anchor', 'referans')) + ' ' + tourEsc(row.anchor) : ''}</div>
      <div class="tour-fill"><span style="width:${pct}%"></span></div>
      <div class="tour-actions">${revert}${pack}</div>
    </div>`;
  }).join('') : '';
  const list = cards
    ? `<div class="tour-list">${cards}</div>`
    : `<p class="tour-note">${tourEsc(tourSay('tour.none', 'Boş slotu olan kampanya yok'))}</p>`;
  const outlook = Array.isArray(plan.outlook) ? plan.outlook : [];
  const daysHtml = `<p class="aria-day-title">${tourEsc(tourSay('aria.daywatch', 'Hangi güne bakıyor'))}</p><div class="aria-days"><button type="button" class="aria-day${plan.manual ? '' : ' is-pick'}" onclick="tourDayAuto()"><b>${tourEsc(tourSay('aria.nearest', 'En yakın'))}</b><span>${tourEsc(plan.manual ? '—' : (tourShortDay(plan.day) || '—'))}</span></button>${outlook.map((item) => `<button type="button" class="aria-day${plan.manual && item.ymd === plan.day ? ' is-pick' : ''}" onclick="tourPinDay('${item.ymd}')"><b>${tourEsc(tourShortDay(item.ymd))}</b><span>${item.bos} ${tourEsc(tourSay('tour.slots', 'boş'))}</span></button>`).join('')}</div>`;
  panel.innerHTML = `${head}
${daysHtml}
<p class="tour-meta">${tourEsc(tourSay('tour.day', 'Hedef gün'))}: <b>${tourEsc(plan.day)}</b> · ${tourEsc(tourSay('tour.' + shiftKey, shiftKey))}${plan.shift.breakEnd ? ' ' + tourEsc(plan.shift.breakEnd) : ''}</p>
<p class="tour-meta">${tourEsc(tourSay('tour.pick', 'Çalışılacak'))}: ${tourEsc(pickLine)}</p>
${locked ? `<p class="tour-note">${tourEsc(tourSay('tour.blocked', 'Molada işlem yok'))}</p>` : ''}
${list}`;
}

async function tourRefresh(opts) {
  if (_tourBusy) return;
  const apply = !!(opts && opts.apply);
  const force = !!(opts && opts.force);
  const panel = document.getElementById('tour-panel');
  if (panel && document.getElementById('page-tour')?.classList.contains('active')) {
    panel.innerHTML = `<p class="tour-note">${tourEsc(tourSay('tour.loading', 'Kayıtlar okunuyor'))}</p>`;
  }
  _tourBusy = true;
  ariaSetLooking(true);
  try {
    await tourLoadSettings();
    _tourPlan = await tourBuild();
    tourRender(_tourPlan);
    tourArm();
    if (apply) await tourApply(_tourPlan, force);
    else if (!(opts && opts.silent)) tourPaintLive(_tourPlan, null, true);
  } catch (e) {
    if (typeof toast === 'function') toast(tourSay('tour.err', 'Aria okunamadı'), 'err');
    if (_tourPlan) tourRender(_tourPlan);
  } finally {
    _tourBusy = false;
    ariaSetLooking(false);
  }
}

async function tourRunNow() {
  if (tourPref().onay) {
    const ok = typeof mbConfirm === 'function'
      ? await mbConfirm(tourSay('tour.askrun', 'Seçilen kampanya bildirilsin. Kuyruk eşiğin altındaysa doldurulsun?'), tourSay('tour.title', 'Aria'))
      : false;
    if (!ok) return;
  }
  await tourRefresh({ apply: true, force: true });
}

function tourArm() {
  clearInterval(window._tourTimer);
  if (tourEffectivePasif()) return;
  const role = (typeof currentUser !== 'undefined' && currentUser?.role) || '';
  if (!['super_admin', 'admin', 'firm_admin'].includes(role)) return;
  const wait = 60000;
  window._tourTimer = setInterval(() => {
    if (!currentUser) return;
    void tourRefresh({ apply: true });
  }, wait);
}

async function tourNotify(plan, row) {
  const firmId = plan.firmId;
  await sb(`campaigns?firm_id=eq.${firmId}&id=neq.${row.id}&active_for_agents=eq.true`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ active_for_agents: false }),
  }).catch(() => {});
  const msg = tourSay('tour.notifmsg', '{day} · {n} boş slot', { day: plan.day, n: row.bos });
  if (typeof setActiveCampaign === 'function') await setActiveCampaign(row.id, msg);
  else {
    await sb(`campaigns?id=eq.${row.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ active_for_agents: true, notif_ts: Date.now(), notif_message: msg }),
    });
  }
  if (typeof logAuditEvent === 'function') {
    void logAuditEvent('radius_tour_notify', 'campaign', row.id, { day: plan.day, bos: row.bos, kind: plan.pick.kind });
  }
}

function tourAskRows(row, limit) {
  const frame = document.getElementById('geocon-frame');
  if (!frame || !row?.anchor) return Promise.resolve([]);
  const requestId = `tour-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve) => {
    let done = false;
    const finish = (rows) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(Array.isArray(rows) ? rows : []);
    };
    const timer = setTimeout(() => finish([]), Math.min(120000, 40000 + Number(limit || 0) * 30));
    function onMsg(event) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'mb-geocon-rows' || data.requestId !== requestId) return;
      finish(data.rows);
    }
    window.addEventListener('message', onMsg);
    const send = () => {
      try {
        frame.contentWindow.postMessage({
          type: 'mb-geocon-rows-ask',
          requestId,
          anchorPlz: row.anchor,
          allowOtherPrefix: tourPref().ayniPrefix === false,
          limit,
          radiusKm: [10, 20, 30, 50].includes(Number(tourPref().radiusKm)) ? Number(tourPref().radiusKm) : 30,
          skipUsedDays: tourGeoGun(),
        }, window.location.origin);
      } catch (_) {
        finish([]);
      }
    };
    if (frame.dataset.loaded === '1' && frame.src && frame.src.indexOf('geocon.html') !== -1) setTimeout(send, 400);
    else {
      frame.addEventListener('load', () => setTimeout(send, 800), { once: true });
      if (typeof loadGeoconPage === 'function') loadGeoconPage();
    }
  });
}

async function tourNearbyInsert(row) {
  const cap = Math.max(20, Math.min(2000, Number(tourPref().yakinAdet) || 100));
  const gap = Math.max(20, Number(tourPref().veriEsik) - Number(row.pending || 0));
  const limit = Math.min(cap, gap);
  const frame = document.getElementById('geocon-frame');
  if (!frame || !frame.contentWindow) return { added: 0, queueName: '', created: false, plzs: [], anchor: row.anchor || '', reason: 'closed' };
  const raw = await tourAskRows(row, limit);
  const norm = (value) => (typeof mbNormalizeDialPhone === 'function' ? mbNormalizeDialPhone(value) : String(value || '').trim());
  const mapped = [];
  const seen = new Set();
  (Array.isArray(raw) ? raw : []).forEach((item) => {
    const phone = norm(item?.telefon || item?.phone || '');
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    mapped.push({
      phone,
      first_name: String(item.vorname || item.first_name || '').slice(0, 80),
      last_name: String(item.name || item.nachname || item.last_name || '').slice(0, 80),
      plz: tourPlz(item.plz) || row.anchor,
      city: String(item.ort || item.city || '').slice(0, 80),
      address: String(item.strasse || item.address || '').slice(0, 160),
      campaign_id: row.id,
      firm_id: tourFirmId(),
      status: 'pending',
    });
  });
  const empty = { added: 0, queueName: '', created: false, plzs: [], anchor: row.anchor || '', reason: frame.dataset.loaded === '1' ? '' : 'closed' };
  if (!mapped.length) return empty;
  let fresh = mapped;
  if (typeof mbFindExistingPhonePlaces === 'function') {
    const places = await mbFindExistingPhonePlaces(mapped.map((item) => item.phone), 'campaign', row.id);
    fresh = mapped.filter((item) => !places.has(item.phone));
  }
  if (!fresh.length) return { ...empty, reason: '' };
  const firmId = tourFirmId();
  const plzName = ariaPlzList(fresh.map((item) => item.plz), 8) || `Yakın ${row.anchor || ''}`.trim();
  const wantNew = tourPref().kuyrukYer === 'yeni';
  const found = wantNew ? [] : await sb(`queues?campaign_id=eq.${row.id}&select=id,name,total_contacts&order=created_at.desc&limit=1`).catch(() => []);
  let queue = Array.isArray(found) ? found[0] : null;
  let createdQueue = false;
  if (!queue?.id) {
    createdQueue = true;
    const created = await sb('queues', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({ campaign_id: row.id, firm_id: firmId, name: plzName, total_contacts: fresh.length }),
    });
    queue = Array.isArray(created) ? created[0] : created;
  }
  if (!queue?.id) return empty;
  const withQ = fresh.map((item) => ({ ...item, queue_id: queue.id }));
  for (let i = 0; i < withQ.length; i += 100) {
    await sb('contacts', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(withQ.slice(i, i + 100)) });
  }
  await sb(`queues?id=eq.${queue.id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ total_contacts: Number(queue.total_contacts || 0) + withQ.length }),
  });
  if (typeof logAuditEvent === 'function') {
    void logAuditEvent('radius_tour_nearby', 'campaign', row.id, { moved: withQ.length, anchor: row.anchor, queue: queue.name || '', created: createdQueue, day: _tourPlan?.day });
  }
  return {
    added: withQ.length,
    queueName: queue.name || plzName,
    created: createdQueue,
    plzs: [...new Set(withQ.map((item) => tourPlz(item.plz)).filter(Boolean))],
    anchor: row.anchor || '',
  };
}

async function tourApply(plan, force) {
  const prefEarly = tourPref();
  const heldEarly = prefEarly.kampanyaDegis === false
    ? (plan?.rows || []).find((item) => item.id === plan?.activeId)
    : null;
  if (!plan?.firmId || (!plan.pick?.id && !heldEarly)) {
    tourPaintLive(plan, null, !!force);
    return;
  }
  if (plan.shift?.label === 'break') {
    tourPaintLive(plan, null, false);
    return;
  }
  const role = (typeof currentUser !== 'undefined' && currentUser?.role) || '';
  if (!['super_admin', 'admin', 'firm_admin'].includes(role)) return;
  if (!force && tourEffectivePasif()) {
    tourPaintLive(plan, null, false);
    return;
  }
  if (!force && tourOtherWatch()) {
    tourPaintLive(plan, tourSay('aria.other', 'Başka bir yönetici bakıyor. Kampanya değiştirmedim, kimse yüklemedim.'), true);
    return;
  }
  const pref = tourPref();
  const now = Date.now();
  if (!force && pref.lastTickAt && now - Number(pref.lastTickAt) < 50000) {
    tourPaintLive(plan, null, false);
    return;
  }
  const row = plan.rows.find((item) => item.id === plan.pick.id) || heldEarly;
  if (!row) {
    tourPaintLive(plan, null, !!force);
    return;
  }
  await tourSave({ lastTickAt: now });
  const changeCamp = pref.kampanyaDegis !== false;
  const fillQueue = pref.kuyrukYenile !== false;
  let work = row;
  if (!changeCamp) {
    work = plan.rows.find((item) => item.id === plan.activeId) || null;
    if (!work) {
      tourPaintLive(plan, tourSay('aria.hold.none', 'Kampanyayı değiştirmedim. Açık kampanya yok, kuyruğa yazmadım.'), true);
      return;
    }
  }
  let told = false;
  if (changeCamp && (work.id !== pref.lastCampId || plan.day !== pref.lastDay)) {
    await tourNotify(plan, work);
    await tourSave({ lastCampId: work.id, lastDay: plan.day, lastTickAt: now });
    told = true;
  }
  let extra = null;
  if (!changeCamp) extra = { hold: true, rowId: work.id };
  if (fillQueue && work.pending < pref.veriEsik && pref.kuyrukMod === 'yakin' && work.anchor) {
    const detail = await tourNearbyInsert(work).catch(() => null);
    const mark = { hold: !changeCamp, rowId: work.id };
    extra = detail && detail.added
      ? { kind: 'nearby', ...detail, pending: work.pending, esik: pref.veriEsik, radius: pref.radiusKm, ...mark }
      : detail && detail.reason === 'closed'
        ? { kind: 'nearwait', pending: work.pending, esik: pref.veriEsik, ...mark }
        : { kind: 'nearby0', ...mark };
  } else if (fillQueue && work.pending < pref.veriEsik && work.revertIds.length) {
    const moved = await tourRevert(work.id, { auto: true });
    if (moved) extra = { ...(extra || {}), kind: 'revert', moved, hold: !changeCamp, rowId: work.id };
  }
  if (!extra && told) extra = { kind: 'told' };
  else if (extra && !extra.kind && told) extra.kind = 'told';
  const view = !changeCamp ? { ...plan, pick: { id: work.id, kind: 'stay', bos: work.bos } } : plan;
  const line = tourStory(view, extra);
  tourPaintLive(plan, line, !!(force || extra?.kind || told));
  if (extra?.kind || told) {
    const entry = { day: plan.day, camp: work.name, n: work.bos, kind: changeCamp ? plan.pick.kind : 'stay' };
    if (extra?.kind === 'nearby') Object.assign(entry, { k: 'near', added: extra.added, pending: extra.pending, esik: extra.esik, plz: extra.anchor, plzs: ariaPlzList(extra.plzs, 12), km: extra.radius, codes: (extra.plzs || []).length, q: extra.queueName, created: !!extra.created, text: line });
    else if (extra?.kind === 'nearby0') Object.assign(entry, { k: 'near0', plz: work.anchor || '' });
    else if (extra?.kind === 'nearwait') Object.assign(entry, { k: 'nearwait', pending: work.pending, esik: pref.veriEsik, text: line });
    else if (extra?.kind === 'revert') Object.assign(entry, { k: 'revert', moved: extra.moved, pending: work.pending });
    else if (told) entry.k = 'told';
    await tourRemember(entry);
  }
  if (extra && typeof toast === 'function') toast(line, extra.kind === 'nearby0' ? 'warn' : 'ok');
}

function tourTab(name) {
  _tourTab = name || 'kampanya';
  document.querySelectorAll('.tour-tab').forEach((btn) => {
    const on = btn.dataset.tab === _tourTab;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tour-pane').forEach((pane) => pane.classList.toggle('is-on', pane.dataset.pane === _tourTab));
}

async function tourSetMode(aktif) {
  _tourSettings = { ...tourPref(), aktif: !!aktif };
  tourPaintLive(_tourPlan, null, false);
  await tourSave({ aktif: !!aktif });
  tourArm();
  if (aktif) await tourRefresh({ apply: true, force: true });
  else await tourRefresh();
}

function tourQueueMode(el) {
  const mode = el && el.value === 'yakin' ? 'yakin' : 'revert';
  void tourSave({ kuyrukMod: mode });
}

function tourQueuePlace(el) {
  void tourSave({ kuyrukYer: el && el.value === 'yeni' ? 'yeni' : 'son' });
}

function tourGeriPick() {
  const picked = [...document.querySelectorAll('#tour-geri-who input[data-status]')]
    .filter((el) => el.checked)
    .map((el) => String(el.dataset.status || '').toLowerCase())
    .filter((key) => tourStatusOk(key));
  _tourFirmGeri = picked;
  void tourSaveFirmGeri(picked);
}

const TOUR_GERI_ORDER = ['no_answer', 'voicemail', 'callback', 'negative'];

async function tourLoadFirmOutcomes(firmId) {
  _tourFirmOutcomes = [];
  if (!firmId || typeof sb !== 'function') return;
  const camps = await sb(`campaigns?firm_id=eq.${firmId}&select=settings&limit=200`).catch(() => []);
  const map = new Map();
  const lists = (Array.isArray(camps) ? camps : []).map((camp) => {
    const settings = typeof getCampSettings === 'function' ? getCampSettings(camp) : (camp?.settings || {});
    const rows = Array.isArray(settings?.outcomes) && settings.outcomes.length ? settings.outcomes : (typeof DEFAULT_OUTCOMES !== 'undefined' ? DEFAULT_OUTCOMES : []);
    return rows;
  });
  lists.forEach((rows) => {
    rows.forEach((row) => {
      const key = String(row?.key || '').trim();
      if (!key || row?.enabled === false) return;
      const status = tourOutcomeStatus(key, row);
      if (!tourStatusOk(status) || map.has(status)) return;
      const names = tourOutcomeNames(key, row, status);
      map.set(status, { status, tr: names.tr, de: names.de });
    });
  });
  _tourFirmOutcomes = [...map.values()].sort((a, b) => {
    const ai = TOUR_GERI_ORDER.indexOf(a.status);
    const bi = TOUR_GERI_ORDER.indexOf(b.status);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return String(a.tr).localeCompare(String(b.tr), 'tr');
  });
}

function tourPaintGeri(near) {
  const host = document.getElementById('tour-geri-who');
  if (!host) return;
  host.hidden = !!near;
  if (near) return;
  if (!tourFirmId()) {
    host.innerHTML = '<p class="tour-note" data-tr="Önce bir firma seç. Sonuçlar o firmanın kampanyalarından gelir." data-de="Zuerst eine Firma wählen. Die Ergebnisse kommen aus den Kampagnen dieser Firma.">Önce bir firma seç. Sonuçlar o firmanın kampanyalarından gelir.</p>';
    return;
  }
  if (!Array.isArray(_tourFirmOutcomes)) return;
  const rows = Array.isArray(_tourFirmOutcomes) ? _tourFirmOutcomes : [];
  if (!rows.length) {
    host.innerHTML = '<p class="tour-note" data-tr="Bu firmada sıraya alınacak sonuç yok. Randevu ve kara liste sıraya dönmez." data-de="Diese Firma hat kein Ergebnis für die Reihe. Termin und Sperrliste kommen nicht zurück.">Bu firmada sıraya alınacak sonuç yok. Randevu ve kara liste sıraya dönmez.</p>';
    return;
  }
  const kim = new Set(tourGeriKim());
  const de = typeof currentLang !== 'undefined' && currentLang === 'de';
  host.innerHTML = rows.map((row) => {
    const name = tourEsc(de ? row.de : row.tr);
    return `<label class="tour-check"><span class="tour-copy"><span class="tour-name" data-tr="${tourEsc(row.tr)}" data-de="${tourEsc(row.de)}">${name}</span>
<small class="tour-help" data-tr="Bu firmanın sonucu. İşaretlersen bu sonucu alan kişiyi yeniden sıraya koyar." data-de="Ergebnis dieser Firma. Angehakt stellt sie Personen mit diesem Ergebnis wieder in die Reihe.">Bu firmanın sonucu. İşaretlersen bu sonucu alan kişiyi yeniden sıraya koyar.</small></span>
<input type="checkbox" data-status="${tourEsc(row.status)}"${kim.has(row.status) ? ' checked' : ''} onchange="tourGeriPick()"></label>`;
  }).join('');
}

async function tourSaveFirmGeri(picked) {
  const firmId = tourFirmId();
  const userId = tourUserId();
  if (!firmId || typeof sb !== 'function') return;
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.tour && typeof existing.tour === 'object' ? existing.tour : {};
  const watch = prev.watch && typeof prev.watch === 'object' ? { ...prev.watch } : null;
  if (watch && (!watch.userId || watch.userId === userId)) watch.geriKim = picked;
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, tour: { ...prev, geriKim: picked, ...(watch ? { watch } : {}) } } }),
  });
  if (watch) _tourWatch = watch;
}

async function tourAltaSlot(el) {
  const firmId = tourFirmId();
  const on = !!(el && el.checked);
  if (!firmId || typeof sb !== 'function') {
    if (el) el.checked = _tourAltaSlot;
    return;
  }
  const firms = await sb(`firms?id=eq.${firmId}&select=settings`).catch(() => []);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.default_takvim && typeof existing.default_takvim === 'object' ? existing.default_takvim : {};
  const next = { ...prev, altaYeniSlot: on };
  await sb(`firms?id=eq.${firmId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, default_takvim: next } }),
  });
  _tourAltaSlot = on;
  window._firmDefaultTakvimByFirm = window._firmDefaultTakvimByFirm || {};
  window._firmDefaultTakvimByFirm[firmId] = { ...(window._firmDefaultTakvimByFirm[firmId] || {}), ...next };
}

async function tourFlag(key, el) {
  await tourSave({ [key]: !!el.checked });
  if (key === 'olay' || key === 'zamanlayici') tourArm();
  else await tourRefresh();
}

async function tourNum(key, el, min, max) {
  let n = Number(el.value);
  if (!Number.isFinite(n)) n = TOUR_DEFAULTS[key];
  n = Math.max(min, Math.min(max, Math.round(n)));
  el.value = String(n);
  await tourSave({ [key]: n });
  await tourRefresh();
}

async function tourTime(key, el) {
  const value = String(el.value || TOUR_DEFAULTS[key] || '');
  await tourSave({ [key]: value });
  if (key === 'zamanAktif' || key === 'zamanPasif') tourArm();
}

function tourPickHorizon(el) {
  const n = Number(el && el.value);
  const span = [7, 14, 21].includes(n) ? n : 14;
  if (el) el.value = String(span);
  void tourSave({ ufuk: span }).then(() => tourRefresh());
}

async function tourPinDay(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return;
  await tourSave({ hedefManuel: true, hedefTarih: ymd });
  await tourRefresh();
}

function tourPickRadius(el) {
  const n = Number(el.value);
  void tourSave({ radiusKm: [10, 20, 30, 50].includes(n) ? n : 30 });
}

function tourPickWait(el) {
  tourSave({ bekleyenEsik: Number(el.value) || 3 }).then(() => tourRefresh());
}

function tourPickYol(el) {
  const n = Number(el.value);
  tourSave({ yolDk: [20, 30, 40, 50, 60].includes(n) ? n : 30 }).then(() => tourRefresh());
}

async function tourNudgeDay(delta) {
  const pref = tourPref();
  const base = (pref.hedefManuel && pref.hedefTarih) || _tourPlan?.day || tourNextBusiness(tourClock().ymd);
  let day = tourAddDays(base, delta < 0 ? -1 : 1);
  while (tourWeekend(day)) day = tourAddDays(day, delta < 0 ? -1 : 1);
  await tourSave({ hedefManuel: true, hedefTarih: day });
  await tourRefresh();
}

async function tourDayAuto() {
  await tourSave({ hedefManuel: false, hedefTarih: '' });
  await tourRefresh();
}

function tourFillSelects() {
  const rows = _tourPlan?.rows || [];
  ['tour-camp-pick', 'tour-camp-data'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = id === 'tour-camp-pick' ? (tourPref().secili || sel.value) : sel.value;
    sel.innerHTML = '<option value="">—</option>' + rows.map((row) => `<option value="${tourEsc(row.id)}">${tourEsc(row.name)}</option>`).join('');
    if (cur && [...sel.options].some((opt) => opt.value === cur)) sel.value = cur;
  });
  const label = document.getElementById('tour-day-label');
  if (label && _tourPlan?.day) label.textContent = _tourPlan.day + (_tourPlan.manual ? '' : '');
}

async function tourKeepCamp() {
  const id = document.getElementById('tour-camp-pick')?.value || '';
  if (!id) return;
  await tourSave({ secili: id, kampanyaOto: false });
  await tourRefresh();
}

function tourAddData() {
  const id = document.getElementById('tour-camp-data')?.value || '';
  if (!id) return;
  tourPackage(id);
}

function tourPrepDay() {
  const n = (_tourPlan?.rows || []).filter((row) => row.pending < tourPref().hazirEsik).length;
  if (typeof toast === 'function') toast(tourSay('tour.prepok', '{n} kampanya güne hazır eşiğinin altında', { n }), n ? 'warn' : 'ok');
  void tourRefresh();
}

async function tourRevert(campaignId, opts) {
  const auto = !!(opts && opts.auto);
  const plan = _tourPlan;
  const row = plan?.rows?.find((item) => item.id === campaignId);
  if (!row || plan.shift?.label === 'break') {
    if (!auto && typeof toast === 'function') toast(tourSay('tour.blocked', 'Molada işlem yok'), 'warn');
    return 0;
  }
  const n = row.revertIds.length;
  if (!n) {
    if (!auto && typeof toast === 'function') toast(tourSay('tour.revert0', 'Uygun kişi kalmadı'), 'warn');
    return 0;
  }
  if (!auto && tourPref().onay) {
    const ok = typeof mbConfirm === 'function' ? await mbConfirm(tourSay('tour.confirm', '{n} kişi tekrar aransın? Yarınki randevu kodları.', { n }), row.name) : false;
    if (!ok) return 0;
  }
  let moved = 0;
  for (let i = 0; i < row.revertIds.length; i += 60) {
    const chunk = row.revertIds.slice(i, i + 60);
    const kim = tourGeriKim();
    if (!kim.length) continue;
    const live = await sb(`contacts?id=in.(${chunk.join(',')})&status=in.(${kim.join(',')})&select=id`).catch(() => []);
    const ids = (Array.isArray(live) ? live : []).map((c) => c.id).filter(Boolean);
    if (!ids.length) continue;
    await sb(`contacts?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'pending', last_called_at: null }),
    });
    moved += ids.length;
  }
  if (typeof logAuditEvent === 'function') {
    void logAuditEvent('radius_tour_revert', 'campaign', campaignId, { moved, day: plan.day, anchor: row.anchor });
  }
  if (!auto && typeof toast === 'function') toast(moved ? tourSay('tour.reverted', '{n} kişi kuyruğa alındı', { n: moved }) : tourSay('tour.revert0', 'Uygun kişi kalmadı'), moved ? 'ok' : 'warn');
  if (!auto) await tourRefresh();
  return moved;
}

function tourPackage(campaignId) {
  const plan = _tourPlan;
  const row = plan?.rows?.find((item) => item.id === campaignId);
  if (!row || plan.shift?.label === 'break') {
    if (typeof toast === 'function') toast(tourSay('tour.blocked', 'Molada işlem yok'), 'warn');
    return;
  }
  if (!row.anchor) {
    if (typeof toast === 'function') toast(tourSay('tour.noanchor', 'Bu kampanyada referans kod yok'), 'warn');
    return;
  }
  if (typeof navigate === 'function') navigate('geocon');
  const frame = document.getElementById('geocon-frame');
  if (!frame) return;
  const send = () => {
    try {
      frame.contentWindow.postMessage({
        type: 'mb-geocon-tour',
        campaignId: row.id,
        campaignName: row.name,
        anchorPlz: row.anchor,
        allowOtherPrefix: !tourPref().ayniPrefix,
        pairMaxMin: tourPref().yolUyari ? tourPref().yolDk : 0,
      }, window.location.origin);
    } catch (_) {}
  };
  const kick = () => setTimeout(send, 500);
  if (frame.dataset.loaded === '1' && frame.src && frame.src.indexOf('geocon.html') !== -1) kick();
  else {
    frame.addEventListener('load', kick, { once: true });
    if (typeof loadGeoconPage === 'function') loadGeoconPage();
  }
  if (typeof toast === 'function') toast(tourSay('tour.sent', 'Paket haritada açıldı. İşaretleyip aktar.'), 'ok');
}

function tourBoot() {
  if (window._tourBooted) return;
  window._tourBooted = true;
  setTimeout(() => {
    if (!ariaAdmin()) return;
    void tourLoadSettings().then(async () => {
      tourArm();
      if (tourFirmId() && !tourEffectivePasif()) {
        await tourRefresh({ apply: true });
        return;
      }
      if (tourFirmId()) _tourPlan = await tourBuild().catch(() => _tourPlan);
      tourPaintLive(_tourPlan, null, false);
    });
  }, 8000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tourBoot);
else tourBoot();

document.addEventListener('click', (ev) => {
  const pop = document.getElementById('aria-pop');
  if (!pop || pop.hidden) return;
  if (ev.target.closest && ev.target.closest('#aria-pop, #aria-live')) return;
  ariaClosePop();
});

