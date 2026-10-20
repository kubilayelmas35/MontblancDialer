// Saha teklifi, müşteri PDF'i ve günün rotası.

let _fieldQuoteTaskId = null;
let _fieldQuoteLines = [];
let _fieldRouteToken = 0;

function fieldMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function fieldPdfBytes(value) {
  const fold = { ğ: 'g', Ğ: 'G', ş: 's', Ş: 'S', ı: 'i', İ: 'I', ç: 'c', Ç: 'C' };
  const text = String(value ?? '').replace(/[ğĞşŞıİçÇ]/g, (ch) => fold[ch] || ch);
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === 0x20ac) bytes.push(0x80);
    else if (code >= 32 && code <= 255) bytes.push(code);
    else bytes.push(63);
  }
  return bytes;
}

function fieldPdfLiteral(value) {
  let out = '';
  fieldPdfBytes(String(value ?? '').replace(/\u20ac/g, ' EUR')).forEach((b) => {
    if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  });
  return `(${out})`;
}

function fieldPdfBlob(objects, image) {
  const chunks = [];
  const pushStr = (text) => chunks.push(new TextEncoder().encode(text));
  pushStr('%PDF-1.4\n');
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(chunks.reduce((n, part) => n + part.length, 0));
    pushStr(`${index + 1} 0 obj\n`);
    if (obj.raw) chunks.push(obj.raw);
    else pushStr(obj);
    pushStr('\nendobj\n');
  });
  const xrefAt = chunks.reduce((n, part) => n + part.length, 0);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  const blobParts = [];
  chunks.forEach((part) => blobParts.push(part));
  if (image) image = null;
  return new Blob(blobParts, { type: 'application/pdf' });
}

function fieldBuildOfferPdf(doc) {
  const pageW = 595;
  const pageH = 842;
  const left = 48;
  const lines = Array.isArray(doc.lines) ? doc.lines.slice(0, 18) : [];
  const commands = [];
  const textAt = (x, y, size, value) => {
    commands.push('BT');
    commands.push(`/F1 ${size} Tf`);
    commands.push(`1 0 0 1 ${x} ${y} Tm`);
    commands.push(`${fieldPdfLiteral(value)} Tj`);
    commands.push('ET');
  };
  const rule = (y) => commands.push(`${left} ${y} m ${pageW - left} ${y} l S`);
  textAt(left, 800, 18, doc.title || 'TEKLIF');
  textAt(left, 780, 10, doc.firm || '');
  textAt(pageW - 220, 800, 10, doc.no || '');
  textAt(pageW - 220, 786, 10, doc.date || '');
  rule(768);
  textAt(left, 748, 11, doc.customerLabel || 'Musteri');
  textAt(left, 732, 12, doc.customer || '');
  textAt(left, 716, 10, doc.address || '');
  textAt(left, 702, 10, doc.phone || '');
  textAt(left, 688, 10, doc.when || '');
  rule(676);
  textAt(left, 658, 10, doc.colItem || 'Urun');
  textAt(330, 658, 10, doc.colQty || 'Adet');
  textAt(390, 658, 10, doc.colPrice || 'Birim');
  textAt(470, 658, 10, doc.colTotal || 'Tutar');
  rule(650);
  let y = 634;
  lines.forEach((line) => {
    textAt(left, y, 10, String(line.name || '').slice(0, 42));
    textAt(330, y, 10, `${line.qty || 0} ${line.unit || ''}`.trim());
    textAt(390, y, 10, line.priceText || '');
    textAt(470, y, 10, line.totalText || '');
    y -= 16;
  });
  rule(y + 6);
  y -= 14;
  textAt(330, y, 10, doc.netLabel || 'Netto');
  textAt(470, y, 10, doc.netText || '');
  y -= 14;
  textAt(330, y, 10, doc.vatLabel || 'KDV');
  textAt(470, y, 10, doc.vatText || '');
  y -= 16;
  textAt(330, y, 12, doc.grossLabel || 'Toplam');
  textAt(470, y, 12, doc.grossText || '');
  y -= 28;
  if (doc.note) {
    textAt(left, y, 10, doc.noteLabel || 'Not');
    y -= 14;
    String(doc.note).split(/\n/).slice(0, 4).forEach((row) => {
      textAt(left, y, 10, row.slice(0, 90));
      y -= 13;
    });
    y -= 8;
  }
  const signY = Math.max(120, y - 20);
  textAt(left, signY + 78, 10, doc.signLabel || 'Musteri imzasi');
  textAt(320, signY + 78, 10, doc.agentLabel || 'Saha elemani');
  commands.push(`${left} ${signY} m ${left + 180} ${signY} l S`);
  commands.push(`${320} ${signY} m ${500} ${signY} l S`);
  textAt(left, signY - 16, 9, doc.customer || '');
  textAt(320, signY - 16, 9, doc.agent || '');
  let imageObj = '';
  if (doc.jpeg && doc.jpeg.length && doc.imgW && doc.imgH) {
    commands.push(`q ${160} 0 0 ${Math.round(160 * doc.imgH / doc.imgW)} ${left} ${signY + 8} cm /Im1 Do Q`);
    imageObj = `<< /Type /XObject /Subtype /Image /Width ${doc.imgW} /Height ${doc.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${doc.jpeg.length} >>\nstream\n`;
  }
  const content = commands.join('\n');
  const contentBytes = new TextEncoder().encode(content);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >>${doc.jpeg ? ' /XObject << /Im1 6 0 R >>' : ''} >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    { raw: concatPdf([new TextEncoder().encode(`<< /Length ${contentBytes.length + 1} >>\nstream\n`), contentBytes, new TextEncoder().encode('\nendstream')]) }
  ];
  if (doc.jpeg && doc.jpeg.length) {
    objects.push({ raw: concatPdf([new TextEncoder().encode(imageObj.replace(`/Length ${doc.jpeg.length}`, `/Length ${doc.jpeg.length + 1}`)), doc.jpeg, new TextEncoder().encode('\nendstream')]) });
  }
  return fieldPdfBlob(objects);
}

function concatPdf(parts) {
  const len = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function fieldQuoteTask() {
  return (_fieldTasks || []).find((row) => row.id === _fieldQuoteTaskId) || null;
}

function fieldQuoteTotals() {
  const net = _fieldQuoteLines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.price) || 0), 0);
  const vatRate = Math.max(0, Number(document.getElementById('field-quote-vat')?.value) || 0);
  const vat = net * vatRate / 100;
  return { net, vatRate, vat, gross: net + vat };
}

function fieldQuotePaint() {
  const host = document.getElementById('field-quote-lines');
  if (!host) return;
  host.innerHTML = _fieldQuoteLines.length
    ? _fieldQuoteLines.map((line, idx) => `<div style="display:grid;grid-template-columns:1.4fr 70px 80px 90px 90px auto;gap:6px;align-items:center;">
<input class="form-input" value="${_fEsc(line.name)}" oninput="fieldQuoteEdit(${idx},'name',this.value)">
<input class="form-input" type="number" min="0" step="1" value="${_fEsc(line.qty)}" oninput="fieldQuoteEdit(${idx},'qty',this.value)">
<input class="form-input" value="${_fEsc(line.unit)}" oninput="fieldQuoteEdit(${idx},'unit',this.value)">
<input class="form-input" type="number" min="0" step="0.01" value="${_fEsc(line.price)}" oninput="fieldQuoteEdit(${idx},'price',this.value)">
<div style="font-size:12px;font-weight:800;text-align:right;">${_fEsc(fieldMoney((Number(line.qty) || 0) * (Number(line.price) || 0)))}</div>
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldQuoteRemove(${idx})">${_fEsc(t('field.set.remove'))}</button>
</div>`).join('')
    : `<div style="font-size:12px;color:var(--text-3);">${_fEsc(t('field.quote.empty'))}</div>`;
  const sums = fieldQuoteTotals();
  const box = document.getElementById('field-quote-sums');
  if (box) {
    box.innerHTML = `<div>${_fEsc(t('field.quote.net'))}: <b>${_fEsc(fieldMoney(sums.net))}</b></div>
<div>${_fEsc(t('field.quote.vat'))} ${sums.vatRate}%: <b>${_fEsc(fieldMoney(sums.vat))}</b></div>
<div style="font-size:16px;">${_fEsc(t('field.quote.gross'))}: <b>${_fEsc(fieldMoney(sums.gross))}</b></div>`;
  }
}

function fieldQuoteEdit(index, key, value) {
  if (!_fieldQuoteLines[index]) return;
  _fieldQuoteLines[index][key] = key === 'name' || key === 'unit' ? value : value;
  if (key !== 'name' && key !== 'unit') fieldQuotePaint();
}

function fieldQuoteRemove(index) {
  _fieldQuoteLines.splice(index, 1);
  fieldQuotePaint();
}

function fieldQuoteAddSelected() {
  const sel = document.getElementById('field-quote-product');
  const qty = Math.max(1, Number(document.getElementById('field-quote-qty')?.value) || 1);
  const raw = sel?.selectedOptions?.[0]?.dataset?.product;
  if (!raw) {
    toast(t('field.quote.pick'), 'warn');
    return;
  }
  const product = JSON.parse(raw);
  _fieldQuoteLines.push({ name: product.name, unit: product.unit || 'adet', qty, price: Number(product.price) || 0 });
  fieldQuotePaint();
}

function fieldQuoteAddBlank() {
  _fieldQuoteLines.push({ name: '', unit: 'adet', qty: 1, price: 0 });
  fieldQuotePaint();
}

function fieldOpenQuote(taskId) {
  const task = (_fieldTasks || []).find((row) => row.id === taskId);
  if (!task) return;
  _fieldQuoteTaskId = taskId;
  const saved = task.result_payload?.quote;
  _fieldQuoteLines = (saved?.lines || []).map((line) => ({ ...line }));
  const ap = window._fieldApptMap?.[task.appointment_id] || {};
  document.getElementById('field-quote-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'field-quote-modal';
  ov.className = 'modal-overlay open';
  ov.innerHTML = `<div class="modal" style="max-width:760px;width:96vw;">
<div class="modal-hdr"><div class="modal-title">${_fEsc(t('field.quote.title'))}</div><button class="modal-close" onclick="document.getElementById('field-quote-modal').remove()">✕</button></div>
<div style="padding:16px 20px;display:flex;flex-direction:column;gap:8px;max-height:78vh;overflow:auto;">
<div style="font-size:14px;font-weight:800;">${_fEsc(ap.nachname || saved?.customer_name || '')}</div>
<div style="font-size:12px;color:var(--text-3);">${_fEsc([ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' '))}</div>
<div id="field-quote-catalog" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"></div>
<div id="field-quote-lines" style="display:flex;flex-direction:column;gap:6px;"></div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
<label style="font-size:12px;">${_fEsc(t('field.quote.vat'))} %</label>
<input class="form-input" id="field-quote-vat" type="number" min="0" step="1" value="${_fEsc(saved?.vat_rate ?? 19)}" style="width:80px;" oninput="fieldQuotePaint()">
</div>
<div id="field-quote-sums" style="padding:10px;border-radius:8px;background:var(--bg-3);display:flex;flex-direction:column;gap:4px;"></div>
<label class="form-label">${_fEsc(t('field.quote.note'))}</label>
<textarea class="form-input" id="field-quote-note" rows="2">${_fEsc(saved?.note || '')}</textarea>
<label class="form-label">${_fEsc(t('field.quote.sign'))}</label>
<canvas id="field-quote-sign" width="640" height="160" style="width:100%;height:110px;background:var(--bg);border:1px solid var(--border);border-radius:8px;touch-action:none;" onpointerdown="fieldSignStart(event)" onpointermove="fieldSignMove(event)" onpointerup="fieldSignEnd(event)" onpointercancel="fieldSignEnd(event)"></canvas>
<div style="font-size:11px;color:var(--text-3);">${_fEsc(t('field.quote.sign_hint'))}</div>
</div>
<div class="modal-footer">
<button class="btn btn-ghost" onclick="document.getElementById('field-quote-modal').remove()">${_fEsc(t('fieldops.close'))}</button>
<button class="btn btn-primary" onclick="fieldQuoteCreate()">${_fEsc(t('field.quote.create'))}</button>
</div>
</div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  fieldQuoteFillCatalog(task);
  fieldQuotePaint();
}

async function fieldQuoteFillCatalog(task) {
  const host = document.getElementById('field-quote-catalog');
  if (!host) return;
  const fs = await getFirmFieldSettings(task.firm_id);
  const products = (fs.products || []).filter((row) => row?.name);
  const options = products.map((row) => `<option data-product="${_fEsc(JSON.stringify({ name: row.name, unit: row.unit || 'adet', price: Number(row.price) || 0 }))}">${_fEsc(row.name)} · ${_fEsc(fieldMoney(row.price))}</option>`).join('');
  host.innerHTML = `${products.length ? `<select class="form-input" id="field-quote-product" style="flex:1;min-width:180px;"><option value="">${_fEsc(t('field.quote.pick'))}</option>${options}</select>
<input class="form-input" id="field-quote-qty" type="number" min="1" value="1" style="width:70px;">
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldQuoteAddSelected()">${_fEsc(t('field.quote.add'))}</button>` : `<span style="font-size:12px;color:var(--text-3);">${_fEsc(t('field.quote.no_catalog'))}</span>`}
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldQuoteAddBlank()">${_fEsc(t('field.quote.custom'))}</button>`;
}

async function fieldQuoteJpeg() {
  const canvas = document.getElementById('field-quote-sign');
  if (!canvas) return null;
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  if (!pixels.some((value) => value !== 0)) return null;
  const sheet = document.createElement('canvas');
  sheet.width = canvas.width;
  sheet.height = canvas.height;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.drawImage(canvas, 0, 0);
  const blob = await new Promise((resolve) => sheet.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: sheet.width, h: sheet.height };
}

async function fieldQuoteCreate() {
  const task = fieldQuoteTask();
  if (!task) return;
  const lines = _fieldQuoteLines.map((line) => ({
    name: String(line.name || '').trim(),
    unit: String(line.unit || 'adet').trim(),
    qty: Number(line.qty) || 0,
    price: Number(line.price) || 0,
    total: (Number(line.qty) || 0) * (Number(line.price) || 0)
  })).filter((line) => line.name && line.qty > 0);
  if (!lines.length) {
    toast(t('field.quote.need_line'), 'warn');
    return;
  }
  const sums = fieldQuoteTotals();
  const ap = window._fieldApptMap?.[task.appointment_id] || {};
  const when = typeof fieldApptWhen === 'function' ? (fieldApptWhen(ap).text || '') : '';
  const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
  const jpeg = await fieldQuoteJpeg();
  const no = `AG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(task.id).slice(0, 6)}`;
  const pdf = fieldBuildOfferPdf({
    title: t('field.quote.pdf_title'),
    firm: currentUser?.firm_name || 'Montblanc',
    no,
    date: typeof mbFormatWall === 'function' ? mbFormatWall(new Date().toISOString(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('de-DE'),
    customerLabel: t('field.quote.customer'),
    customer: ap.nachname || '',
    address: addr,
    phone: ap.telefonnummer || '',
    when: when ? `${t('field.appt')}: ${when}` : '',
    colItem: t('field.quote.item'),
    colQty: t('field.quote.qty'),
    colPrice: t('field.quote.price'),
    colTotal: t('field.quote.line'),
    lines: lines.map((line) => ({ ...line, priceText: fieldMoney(line.price), totalText: fieldMoney(line.total) })),
    netLabel: t('field.quote.net'),
    netText: fieldMoney(sums.net),
    vatLabel: `${t('field.quote.vat')} ${sums.vatRate}%`,
    vatText: fieldMoney(sums.vat),
    grossLabel: t('field.quote.gross'),
    grossText: fieldMoney(sums.gross),
    noteLabel: t('field.quote.note'),
    note: document.getElementById('field-quote-note')?.value || '',
    signLabel: t('field.quote.sign'),
    agentLabel: t('field.agent'),
    agent: currentUser?.name || '',
    jpeg: jpeg?.bytes || null,
    imgW: jpeg?.w || 0,
    imgH: jpeg?.h || 0
  });
  const fileName = `Angebot-${String(ap.nachname || 'kunde').replace(/[^\w.-]+/g, '_')}.pdf`;
  const file = new File([pdf], fileName, { type: 'application/pdf' });
  const storedName = `[teklif] ${fileName}`;
  const path = `${task.firm_id}/${task.id}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  let url = '';
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/field-docs/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    url = `${SB_URL}/storage/v1/object/public/field-docs/${path}`;
    await sb('field_task_files', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        task_id: task.id,
        firm_id: task.firm_id,
        uploaded_by: currentUser.id,
        file_url: url,
        file_name: storedName,
        mime_type: 'application/pdf',
        file_size: file.size
      })
    });
  } catch (e) {
    toast(t('field.quote.pdf_fail'), 'err');
    return;
  }
  const quote = {
    no,
    at: new Date().toISOString(),
    customer_name: ap.nachname || '',
    address: addr,
    lines,
    vat_rate: sums.vatRate,
    net: Math.round(sums.net * 100) / 100,
    vat: Math.round(sums.vat * 100) / 100,
    gross: Math.round(sums.gross * 100) / 100,
    note: document.getElementById('field-quote-note')?.value || '',
    signed: !!jpeg,
    pdf_url: url
  };
  try {
    await sb(`field_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        result_key: task.result_key || 'teklif',
        result_payload: { ...(task.result_payload || {}), quote }
      })
    });
  } catch (e) {
    toast(t('field.save_fail'), 'err');
    return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(pdf);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast(t('field.quote.ready'), 'ok');
  document.getElementById('field-quote-modal')?.remove();
  if (typeof loadFieldPage === 'function') await loadFieldPage();
}

function fieldKeepApptMap(map) {
  window._fieldApptMap = map || {};
}

async function fieldRefreshRoute(tasks, apptMap) {
  fieldKeepApptMap(apptMap);
  const card = document.getElementById('field-route-card');
  const stopsEl = document.getElementById('field-route-stops');
  const open = document.getElementById('field-route-open');
  if (!card || !stopsEl) return;
  const today = typeof fieldBerlinToday === 'function' ? fieldBerlinToday() : '';
  const stops = (tasks || []).map((task) => {
    const ap = apptMap?.[task.appointment_id] || {};
    const slot = typeof fieldSlotOf === 'function' ? fieldSlotOf(ap) : null;
    const day = slot?.tarih || String(ap.termin_tarih || '').slice(0, 10);
    if (!day || day !== today) return null;
    const addr = [ap.strasse, ap.plz, ap.ortschaft].filter(Boolean).join(' ');
    if (!addr) return null;
    return {
      name: ap.nachname || t('field.customer'),
      addr,
      time: String(slot?.baslangic_saat || '').slice(0, 5),
      taskId: task.id
    };
  }).filter(Boolean).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  if (!stops.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const dir = `https://www.google.com/maps/dir/${stops.map((stop) => encodeURIComponent(stop.addr)).join('/')}`;
  if (open) open.href = dir;
  stopsEl.innerHTML = `<div style="color:var(--text-3);">${_fEsc(t('field.route.loading'))}</div>`;
  const token = ++_fieldRouteToken;
  const points = [];
  for (const stop of stops) {
    let pos = null;
    if (typeof geocodeTomTom === 'function') pos = await geocodeTomTom(`${stop.addr}, Germany`);
    if (token !== _fieldRouteToken) return;
    points.push({ ...stop, lat: pos?.lat, lng: pos?.lon });
  }
  const located = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  let line = located;
  let legs = [];
  if (located.length >= 2 && typeof TOMTOM_KEY === 'function' && TOMTOM_KEY()) {
    try {
      const path = located.map((point) => `${point.lat},${point.lng}`).join(':');
      const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json?key=${encodeURIComponent(TOMTOM_KEY())}&travelMode=car`);
      if (token !== _fieldRouteToken) return;
      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        const drawn = [];
        (route?.legs || []).forEach((leg) => {
          legs.push(leg?.summary?.lengthInMeters || 0);
          (leg?.points || []).forEach((point) => drawn.push({ lat: point.latitude, lng: point.longitude }));
        });
        if (drawn.length) line = drawn;
      }
    } catch (e) {}
  }
  if (token !== _fieldRouteToken) return;
  fieldPaintRoute(located, line);
  stopsEl.innerHTML = points.map((stop, index) => {
    const km = index > 0 && legs[index - 1] ? ` · ${(legs[index - 1] / 1000).toFixed(1)} km` : '';
    return `<div><b>${index + 1}. ${ _fEsc(stop.time || '—') }</b> ${_fEsc(stop.name)} · ${_fEsc(stop.addr)}${_fEsc(km)}</div>`;
  }).join('');
}

function fieldPaintRoute(stops, line) {
  const canvas = document.getElementById('field-route-map');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pts = (line && line.length ? line : stops).filter((point) => Number.isFinite(point.lat));
  if (pts.length < 1) {
    ctx.fillStyle = getComputedStyle(document.body).color || '#666';
    ctx.font = '16px sans-serif';
    ctx.fillText(t('field.route.nomap'), 24, 40);
    return;
  }
  const project = (lat, lng, z) => {
    const n = 2 ** z;
    const x = ((lng + 180) / 360) * n;
    const rad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
    return { x, y };
  };
  let z = 13;
  const lats = pts.map((point) => point.lat);
  const lngs = pts.map((point) => point.lng);
  for (let zoom = 15; zoom >= 6; zoom--) {
    const a = project(Math.max(...lats), Math.min(...lngs), zoom);
    const b = project(Math.min(...lats), Math.max(...lngs), zoom);
    if ((b.x - a.x) * 256 < canvas.width - 80 && (b.y - a.y) * 256 < canvas.height - 80) {
      z = zoom;
      break;
    }
  }
  const mid = project(lats.reduce((s, n) => s + n, 0) / lats.length, lngs.reduce((s, n) => s + n, 0) / lngs.length, z);
  const originX = mid.x - canvas.width / 512;
  const originY = mid.y - canvas.height / 512;
  const tileX0 = Math.floor(originX);
  const tileY0 = Math.floor(originY);
  const tileX1 = Math.floor(originX + canvas.width / 256);
  const tileY1 = Math.floor(originY + canvas.height / 256);
  for (let tx = tileX0; tx <= tileX1; tx++) {
    for (let ty = tileY0; ty <= tileY1; ty++) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, (tx - originX) * 256, (ty - originY) * 256, 256, 256);
        fieldDrawRouteInk(ctx, stops, line, project, z, originX, originY);
      };
      img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
    }
  }
  fieldDrawRouteInk(ctx, stops, line, project, z, originX, originY);
}

function fieldDrawRouteInk(ctx, stops, line, project, z, originX, originY) {
  const xy = (point) => {
    const p = project(point.lat, point.lng, z);
    return [(p.x - originX) * 256, (p.y - originY) * 256];
  };
  const path = (line || []).filter((point) => Number.isFinite(point.lat));
  if (path.length >= 2) {
    ctx.beginPath();
    path.forEach((point, index) => {
      const [x, y] = xy(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  (stops || []).forEach((stop, index) => {
    if (!Number.isFinite(stop.lat)) return;
    const [x, y] = xy(stop);
    ctx.beginPath();
    ctx.fillStyle = '#111827';
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(String(index + 1), x - 4, y + 4);
  });
}
