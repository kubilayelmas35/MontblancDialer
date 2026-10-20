// Saha operasyon: ürün stoğu, görsel, fiyat ve teklif PDF metni.

let _fieldCatalogFid = null;
let _fieldCatalogProducts = [];
let _fieldCatalogPdf = { title: '', company: '', intro: '', terms: '', footer: '', vat: 19 };
let _fieldCatalogTab = 'stock';

function fieldCatalogRemember() {
  const names = [...document.querySelectorAll('[data-cat-name]')];
  if (names.length || document.getElementById('field-cat-list')) {
    _fieldCatalogProducts = names.map((input) => {
      const idx = input.getAttribute('data-cat-name');
      const stockRaw = document.querySelector(`[data-cat-stock="${idx}"]`)?.value;
      return fieldNormalizeProduct({
        id: document.querySelector(`[data-cat-id="${idx}"]`)?.value,
        name: input.value,
        unit: document.querySelector(`[data-cat-unit="${idx}"]`)?.value,
        price: document.querySelector(`[data-cat-price="${idx}"]`)?.value,
        stock: stockRaw === '' ? null : stockRaw,
        image: document.querySelector(`[data-cat-image="${idx}"]`)?.value
      }, Number(idx));
    });
  }
  const title = document.getElementById('field-cat-title');
  if (title) {
    _fieldCatalogPdf = {
      title: title.value || '',
      company: document.getElementById('field-cat-company')?.value || '',
      intro: document.getElementById('field-cat-intro')?.value || '',
      terms: document.getElementById('field-cat-terms')?.value || '',
      footer: document.getElementById('field-cat-footer')?.value || '',
      vat: Math.max(0, Number(document.getElementById('field-cat-vat')?.value) || 0)
    };
  }
}

function fieldCatalogMarkTab() {
  document.getElementById('field-cat-tab-stock')?.classList.toggle('btn-primary', _fieldCatalogTab === 'stock');
  document.getElementById('field-cat-tab-pdf')?.classList.toggle('btn-primary', _fieldCatalogTab === 'pdf');
}

function fieldCatalogTab(tab) {
  _fieldCatalogTab = tab === 'pdf' ? 'pdf' : 'stock';
  const stock = document.getElementById('field-cat-stock');
  const pdf = document.getElementById('field-cat-pdf');
  if (stock) stock.style.display = _fieldCatalogTab === 'stock' ? '' : 'none';
  if (pdf) pdf.style.display = _fieldCatalogTab === 'pdf' ? '' : 'none';
  fieldCatalogMarkTab();
}

function renderFieldCatalog() {
  const body = document.getElementById('fieldops-catalog-body');
  if (!body) return;
  const pdf = { ...defaultFieldPdf(), ...(_fieldCatalogPdf || {}) };
  const rows = _fieldCatalogProducts.length
    ? _fieldCatalogProducts.map((row, idx) => `<div class="field-cat-row">
<div class="field-cat-photo-wrap">${row.image ? `<img class="field-cat-photo" alt="" src="${_fEsc(row.image)}">` : `<div class="field-cat-photo field-cat-photo-empty"></div>`}</div>
<div style="display:flex;flex-direction:column;gap:6px;min-width:0;">
<input type="hidden" data-cat-id="${idx}" value="${_fEsc(row.id || '')}">
<input type="hidden" data-cat-image="${idx}" value="${_fEsc(row.image || '')}">
<input class="form-input" data-cat-name="${idx}" value="${_fEsc(row.name || '')}" placeholder="${_fEsc(t('field.set.ph_product'))}">
<div style="display:flex;gap:6px;flex-wrap:wrap;">
<input class="form-input" data-cat-unit="${idx}" value="${_fEsc(row.unit || '')}" placeholder="${_fEsc(t('field.set.ph_unit'))}" style="width:100px;">
<input class="form-input" data-cat-price="${idx}" type="number" min="0" step="0.01" value="${row.price === 0 ? '0' : _fEsc(row.price ?? '')}" placeholder="${_fEsc(t('field.set.ph_price'))}" style="width:120px;">
<input class="form-input" data-cat-stock="${idx}" type="number" min="0" step="1" value="${row.stock == null ? '' : _fEsc(row.stock)}" placeholder="${_fEsc(t('field.cat.ph_stock'))}" style="width:100px;">
<label class="btn btn-ghost btn-sm" style="cursor:pointer;">${_fEsc(t('field.cat.image'))}<input type="file" accept="image/*" style="display:none;" onchange="fieldCatalogPickImage(${idx}, this)"></label>
<button type="button" class="btn btn-ghost btn-sm" onclick="fieldCatalogRemove(${idx})">${_fEsc(t('field.set.remove'))}</button>
</div>
</div>
</div>`).join('')
    : `<div style="color:var(--text-3);font-size:12px;">${_fEsc(t('field.set.no_products'))}</div>`;
  body.innerHTML = `<div id="field-cat-stock" style="display:${_fieldCatalogTab === 'stock' ? '' : 'none'};">
<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${_fEsc(t('field.cat.lead'))}</div>
<div id="field-cat-list" style="display:flex;flex-direction:column;gap:8px;">${rows}</div>
<button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="fieldCatalogAdd()">${_fEsc(t('field.cat.add'))}</button>
</div>
<div id="field-cat-pdf" style="display:${_fieldCatalogTab === 'pdf' ? '' : 'none'};">
<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;">${_fEsc(t('field.cat.pdf_lead'))}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div class="form-row"><label class="form-label">${_fEsc(t('field.cat.pdf_title'))}</label><input class="form-input" id="field-cat-title" value="${_fEsc(pdf.title || '')}" placeholder="${_fEsc(t('field.quote.pdf_title'))}"></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.cat.company'))}</label><input class="form-input" id="field-cat-company" value="${_fEsc(pdf.company || '')}"></div>
</div>
<div class="form-row" style="margin-top:8px;"><label class="form-label">${_fEsc(t('field.cat.vat'))}</label><input class="form-input" id="field-cat-vat" type="number" min="0" step="1" value="${_fEsc(pdf.vat ?? 19)}" style="width:90px;"></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.cat.intro'))}</label><textarea class="form-input" id="field-cat-intro" rows="3">${_fEsc(pdf.intro || '')}</textarea></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.cat.terms'))}</label><textarea class="form-input" id="field-cat-terms" rows="3">${_fEsc(pdf.terms || '')}</textarea></div>
<div class="form-row"><label class="form-label">${_fEsc(t('field.cat.footer'))}</label><input class="form-input" id="field-cat-footer" value="${_fEsc(pdf.footer || '')}"></div>
</div>`;
  fieldCatalogMarkTab();
}

async function loadFieldOpsCatalog() {
  const card = document.getElementById('fieldops-catalog');
  if (!card) return;
  const role = currentUser?.role || '';
  if (!(typeof mbIsFirmAdmin === 'function' && mbIsFirmAdmin(role))) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const fid = (typeof getActiveFirmId === 'function' ? getActiveFirmId() : null) || currentUser?.firm_id || null;
  const body = document.getElementById('fieldops-catalog-body');
  if (!fid) {
    _fieldCatalogFid = null;
    if (body) body.innerHTML = `<div style="font-size:12px;color:var(--text-3);">${_fEsc(t('field.cat.empty_firm'))}</div>`;
    return;
  }
  _fieldCatalogFid = fid;
  const fs = await getFirmFieldSettings(fid);
  _fieldCatalogProducts = (fs.products || []).map((row, idx) => fieldNormalizeProduct(row, idx));
  _fieldCatalogPdf = { ...defaultFieldPdf(), ...(fs.pdf || {}) };
  renderFieldCatalog();
}

function fieldCatalogAdd() {
  fieldCatalogRemember();
  _fieldCatalogProducts.push(fieldNormalizeProduct({ id: `p_${Date.now()}`, name: '', unit: 'adet', price: 0, stock: null, image: '' }, _fieldCatalogProducts.length));
  _fieldCatalogProducts[_fieldCatalogProducts.length - 1].name = '';
  renderFieldCatalog();
}

function fieldCatalogRemove(index) {
  fieldCatalogRemember();
  _fieldCatalogProducts.splice(index, 1);
  renderFieldCatalog();
}

function fieldCatalogShrink(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', 0.72);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function fieldCatalogPickImage(index, input) {
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file || !_fieldCatalogFid) return;
  fieldCatalogRemember();
  const row = _fieldCatalogProducts[index];
  if (!row) return;
  const blob = await fieldCatalogShrink(file);
  if (!blob) {
    toast(t('field.upload_fail'), 'err');
    return;
  }
  const path = `${_fieldCatalogFid}/catalog/${row.id || `p_${index}`}.jpg`;
  try {
    const headers = {
      ...(typeof _mbRequestScopeHeaders === 'function' ? _mbRequestScopeHeaders() : {}),
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true'
    };
    const res = await fetch(`${SB_URL}/storage/v1/object/field-docs/${path}`, { method: 'POST', headers, body: blob });
    if (!res.ok) throw new Error(await res.text());
    row.image = `${SB_URL}/storage/v1/object/public/field-docs/${path}?v=${Date.now()}`;
    _fieldCatalogProducts[index] = row;
    renderFieldCatalog();
  } catch (e) {
    toast(t('field.upload_fail'), 'err');
  }
}

async function saveFieldCatalog() {
  fieldCatalogRemember();
  const fid = _fieldCatalogFid;
  if (!fid) {
    toast(t('field.cat.empty_firm'), 'warn');
    return;
  }
  const products = _fieldCatalogProducts.map((row, idx) => fieldNormalizeProduct(row, idx)).filter((row) => row.name);
  const pdf = { ...defaultFieldPdf(), ..._fieldCatalogPdf };
  try {
    const firms = await sb(`firms?id=eq.${fid}&select=settings`);
    const existing = firms?.[0]?.settings || {};
    const prev = existing.fieldService || {};
    const fieldService = {
      ...(typeof defaultFirmFieldSettings === 'function' ? defaultFirmFieldSettings() : {}),
      ...prev,
      products,
      pdf
    };
    await sb(`firms?id=eq.${fid}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ settings: { ...existing, fieldService } })
    });
    if (typeof invalidateFieldSettingsCache === 'function') invalidateFieldSettingsCache(fid);
    _fieldCatalogProducts = products;
    toast(t('field.cat.saved'), 'ok');
  } catch (e) {
    toast(t('field.cat.save_fail'), 'err');
  }
}

function fieldCatalogPreview() {
  fieldCatalogRemember();
  const pdfCfg = { ...defaultFieldPdf(), ..._fieldCatalogPdf };
  const sample = (_fieldCatalogProducts || []).find((row) => row.name) || { name: 'Modul', unit: 'adet', price: 1000, stock: 1 };
  const net = Number(sample.price) || 0;
  const vatRate = Number(pdfCfg.vat) || 0;
  const vat = net * vatRate / 100;
  const blob = fieldBuildOfferPdf({
    title: pdfCfg.title || t('field.quote.pdf_title'),
    firm: pdfCfg.company || currentUser?.firm_name || '',
    no: 'AG-ORNEK',
    date: '',
    customerLabel: t('field.quote.customer'),
    customer: 'Musteri',
    address: '',
    phone: '',
    when: '',
    colItem: t('field.quote.item'),
    colQty: t('field.quote.qty'),
    colPrice: t('field.quote.price'),
    colTotal: t('field.quote.line'),
    lines: [{ name: sample.name, qty: 1, unit: sample.unit || 'adet', priceText: fieldMoney(sample.price), totalText: fieldMoney(net) }],
    netLabel: t('field.quote.net'),
    netText: fieldMoney(net),
    vatLabel: `${t('field.quote.vat')} ${vatRate}%`,
    vatText: fieldMoney(vat),
    grossLabel: t('field.quote.gross'),
    grossText: fieldMoney(net + vat),
    noteLabel: t('field.quote.note'),
    note: [pdfCfg.intro, pdfCfg.terms].filter(Boolean).join('\n'),
    footer: pdfCfg.footer,
    signLabel: t('field.quote.sign'),
    agentLabel: t('field.agent'),
    agent: ''
  });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function fieldCatalogStockDelta(previousLines, nextLines) {
  const delta = {};
  (previousLines || []).forEach((line) => {
    if (!line?.productId) return;
    delta[line.productId] = (delta[line.productId] || 0) + (Number(line.qty) || 0);
  });
  (nextLines || []).forEach((line) => {
    if (!line?.productId) return;
    delta[line.productId] = (delta[line.productId] || 0) - (Number(line.qty) || 0);
  });
  return delta;
}

async function fieldCatalogApplyStock(fid, delta) {
  const ids = Object.keys(delta || {}).filter((id) => delta[id]);
  if (!fid || !ids.length) return true;
  const firms = await sb(`firms?id=eq.${fid}&select=settings`);
  const existing = firms?.[0]?.settings || {};
  const prev = existing.fieldService || {};
  const products = (Array.isArray(prev.products) ? prev.products : []).map((row, idx) => fieldNormalizeProduct(row, idx));
  for (const id of ids) {
    const row = products.find((item) => item.id === id);
    if (!row || row.stock == null) continue;
    const next = row.stock + Number(delta[id] || 0);
    if (next < 0) return false;
    row.stock = next;
  }
  const fieldService = { ...prev, products };
  await sb(`firms?id=eq.${fid}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ settings: { ...existing, fieldService } })
  });
  if (typeof invalidateFieldSettingsCache === 'function') invalidateFieldSettingsCache(fid);
  return true;
}
