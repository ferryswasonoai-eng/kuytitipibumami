/* KuyTitip — aplikasi jastip internal (offline-first, data tersimpan di HP) */
(() => {
'use strict';

/* ================= Utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const view = $('#view');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const NO_DEC = new Set(['IDR', 'JPY', 'KRW', 'VND']);
const fmtIDR = (n) => 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
const fmtCur = (n, cur) => cur === 'IDR' ? fmtIDR(n)
  : `${cur} ${num(n).toLocaleString('id-ID', { maximumFractionDigits: NO_DEC.has(cur) ? 0 : 2 })}`;
const fmtRate = (r) => num(r).toLocaleString('id-ID', { maximumFractionDigits: r < 10 ? 4 : 2 });
const fmtDate = (t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtAgo = (t) => {
  if (!t) return 'belum pernah';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return fmtDate(t);
};
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const plugin = (name) => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

const CURRENCIES = [
  ['IDR', 'Rupiah'], ['THB', 'Baht Thailand'], ['SGD', 'Dolar Singapura'], ['MYR', 'Ringgit Malaysia'],
  ['JPY', 'Yen Jepang'], ['KRW', 'Won Korea'], ['AUD', 'Dolar Australia'], ['USD', 'Dolar AS'],
  ['EUR', 'Euro'], ['GBP', 'Pound Inggris'], ['CNY', 'Yuan Tiongkok'], ['HKD', 'Dolar Hong Kong'],
  ['TWD', 'Dolar Taiwan'], ['VND', 'Dong Vietnam'], ['PHP', 'Peso Filipina'], ['SAR', 'Riyal Saudi'],
  ['AED', 'Dirham UEA'], ['TRY', 'Lira Turki'], ['NZD', 'Dolar Selandia Baru'], ['CHF', 'Franc Swiss'],
];
const curOptions = (sel, withName = false) => CURRENCIES.map(([c, n]) =>
  `<option value="${c}" ${c === sel ? 'selected' : ''}>${withName ? `${c} — ${n}` : c}</option>`).join('');

const STATUSES = [
  ['baru', 'Baru'], ['dibeli', 'Sudah dibeli'], ['dikirim', 'Dikirim'], ['selesai', 'Selesai'], ['batal', 'Batal'],
];
const statusLabel = (s) => (STATUSES.find((x) => x[0] === s) || STATUSES[0])[1];

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ================= Storage (IndexedDB) ================= */
const STORES = ['kv', 'customers', 'products', 'orders', 'photos'];
let dbp;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kuytitip', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const DB = {
  all: (s) => tx(s, 'readonly', (st) => req(st.getAll())),
  get: (s, id) => tx(s, 'readonly', (st) => req(st.get(id))),
  put: (s, v) => tx(s, 'readwrite', (st) => req(st.put(v))),
  del: (s, id) => tx(s, 'readwrite', (st) => req(st.delete(id))),
  clear: (s) => tx(s, 'readwrite', (st) => req(st.clear())),
};

/* ================= Settings ================= */
const DEFAULT_TEMPLATE =
`Halo Kak {nama} 👋
Berikut rincian titipan *#{kode}*{trip}:

{rincian}

Subtotal barang: {subtotal}
Ongkir: {ongkir}
*Total: {total}*
Sudah dibayar: {dibayar}
*Sisa tagihan: {sisa}*

Terima kasih sudah titip di {usaha} 🙏`;

const DEFAULT_SETTINGS = {
  id: 'settings',
  business: 'KuyTitip',
  ownerWa: '',
  trip: '',
  currency: 'THB',
  fee: { type: 'percent', value: 10 },
  shipPerKg: 0,
  rounding: 1000,
  rates: {},
  template: DEFAULT_TEMPLATE,
};
let S = { ...DEFAULT_SETTINGS };
async function loadSettings() {
  const s = await DB.get('kv', 'settings');
  S = { ...DEFAULT_SETTINGS, ...(s || {}) };
  S.fee = { ...DEFAULT_SETTINGS.fee, ...(S.fee || {}) };
  S.rates = S.rates || {};
}
async function saveSettings() { await DB.put('kv', S); renderChrome(); }

/* ================= Exchange rates ================= */
async function fetchJSON(url, ms = 9000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function fetchRate(cur) {
  if (cur === 'IDR') return 1;
  const sources = [
    ['open.er-api.com', async () => { const j = await fetchJSON(`https://open.er-api.com/v6/latest/${cur}`); if (j.result !== 'success') throw 0; return j.rates.IDR; }],
    ['frankfurter', async () => (await fetchJSON(`https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=IDR`)).rates.IDR],
    ['frankfurter', async () => (await fetchJSON(`https://api.frankfurter.app/latest?from=${cur}&to=IDR`)).rates.IDR],
  ];
  for (const [src, fn] of sources) {
    try {
      const rate = num(await fn());
      if (rate > 0) {
        S.rates[cur] = { rate, at: Date.now(), src, manual: false };
        await saveSettings();
        return rate;
      }
    } catch (e) { /* coba sumber berikutnya */ }
  }
  throw new Error('Kurs gagal diambil — cek koneksi internet');
}
const rateOf = (cur) => cur === 'IDR' ? 1 : num(S.rates[cur] && S.rates[cur].rate);
async function ensureRate(cur, maxAgeH = 6) {
  if (cur === 'IDR') return 1;
  const r = S.rates[cur];
  if (r && (r.manual || Date.now() - r.at < maxAgeH * 3600e3)) return r.rate;
  try { return await fetchRate(cur); } catch (e) { return r ? r.rate : 0; }
}

/* ================= Pricing ================= */
function roundUp(v, step) { step = num(step); return step > 0 ? Math.ceil(v / step) * step : Math.round(v); }
function calcSell({ buy, rate, weightG, fee, shipPerKg, rounding }) {
  const modal = num(buy) * num(rate);
  const feeAmt = fee.type === 'flat' ? num(fee.value) : modal * num(fee.value) / 100;
  const ship = num(weightG) / 1000 * num(shipPerKg);
  const raw = modal + feeAmt + ship;
  return { modal, fee: feeAmt, ship, raw, sell: roundUp(raw, rounding) };
}
const itemRate = (it) => num(it.rate) || rateOf(it.buyCur);
const itemSellIDR = (it) => it.sellCur === 'IDR' ? num(it.sellPrice) : num(it.sellPrice) * rateOf(it.sellCur);
function orderTotals(o) {
  let subtotal = 0, modal = 0, qty = 0;
  (o.items || []).forEach((it) => {
    const q = num(it.qty) || 0;
    qty += q;
    subtotal += itemSellIDR(it) * q;
    modal += num(it.buyPrice) * itemRate(it) * q;
  });
  const shipping = num(o.shipping);
  const discount = num(o.discount);
  const total = Math.max(0, subtotal + shipping - discount);
  const paid = num(o.paid);
  return { qty, subtotal, shipping, discount, total, paid, due: Math.max(0, total - paid), modal, profit: subtotal - discount - modal };
}

/* ================= Photos ================= */
const photoCache = new Map();
async function compressImage(file, max = 1280, q = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}
async function savePhotos(files) {
  const ids = [];
  for (const f of files) {
    const data = await compressImage(f);
    const id = 'ph_' + uid();
    await DB.put('photos', { id, data });
    photoCache.set(id, data);
    ids.push(id);
  }
  return ids;
}
async function copyPhoto(id) {
  const p = id && await DB.get('photos', id);
  if (!p) return null;
  const nid = 'ph_' + uid();
  await DB.put('photos', { id: nid, data: p.data });
  return nid;
}
async function deletePhotos(ids) { for (const id of ids || []) { if (id) { await DB.del('photos', id); photoCache.delete(id); } } }
async function hydratePhotos(root = view) {
  for (const img of $$('img[data-pid]', root)) {
    const id = img.dataset.pid;
    let d = photoCache.get(id);
    if (!d) { const p = await DB.get('photos', id); d = p && p.data; if (d) photoCache.set(id, d); }
    if (d) img.src = d;
  }
}
function openLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${src}" alt="">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}
const photoTiles = (ids, removable) => (ids || []).map((id) =>
  `<div class="photo"><img data-pid="${id}" data-zoom alt="">${removable ? `<button type="button" data-rm-photo="${id}" aria-label="Hapus foto">✕</button>` : ''}</div>`).join('');
const photoAdd = (key, label = 'Foto') =>
  `<label class="photo-add">📷<br>Kamera<input type="file" accept="image/*" capture="environment" data-add-photo="${key}"></label>` +
  `<label class="photo-add">🖼️<br>${label === 'Foto' ? 'Galeri' : label}<input type="file" accept="image/*" multiple data-add-photo="${key}"></label>`;

/* ================= Sheet (bottom dialog) ================= */
const sheet = $('#sheet');
function openSheet(html, onMount) {
  sheet.innerHTML = `<div class="sheet-inner">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };
  onMount && onMount(sheet);
}
function closeSheet() { if (sheet.open) sheet.close(); }
function confirmSheet(msg, okLabel = 'Ya, lanjut', danger = true) {
  return new Promise((res) => {
    openSheet(`<h3>${esc(msg)}</h3><div class="btn-col">
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>
      <button class="btn ghost" data-no>Batal</button></div>`, (s) => {
      $('[data-ok]', s).onclick = () => { closeSheet(); res(true); };
      $('[data-no]', s).onclick = () => { closeSheet(); res(false); };
      s.onclose = () => res(false);
    });
  });
}

/* ================= External / WhatsApp ================= */
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
function openExternal(url) {
  if (isNative()) window.location.href = url;
  else window.open(url, '_blank');
}
function openWA(phone, text) {
  const p = normPhone(phone);
  openExternal(`https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
}
async function shareText(title, text) {
  const Share = plugin('Share');
  try {
    if (Share) return await Share.share({ title, text, dialogTitle: title });
    if (navigator.share) return await navigator.share({ title, text });
  } catch (e) { return; }
  await navigator.clipboard?.writeText(text);
  toast('Teks disalin ke clipboard');
}

/* ================= Chrome (header/tabbar) ================= */
function renderChrome() {
  $('#brandName').textContent = S.business || 'KuyTitip';
  const chip = $('#rateChip');
  const r = S.rates[S.currency];
  if (S.currency !== 'IDR' && r) {
    chip.hidden = false;
    chip.textContent = `1 ${S.currency} = ${fmtIDR(r.rate)}`;
  } else chip.hidden = true;
}
function setTab(tab) { $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab)); }

/* ================= Views: Beranda + Kalkulator ================= */
async function viewHome() {
  setTab('beranda');
  const orders = await DB.all('orders');
  const trips = [...new Set(orders.map((o) => o.trip).filter(Boolean))];
  const tripSel = viewHome.trip ?? '';
  const scope = orders.filter((o) => o.status !== 'batal' && (!tripSel || o.trip === tripSel));
  let omzet = 0, profit = 0, due = 0, aktif = 0;
  scope.forEach((o) => { const t = orderTotals(o); omzet += t.total; profit += t.profit; due += t.due; if (o.status !== 'selesai') aktif++; });

  const c = { cur: S.currency === 'IDR' ? 'THB' : S.currency, fee: { ...S.fee }, ship: S.shipPerKg, round: S.rounding, buy: '', weight: '' };
  const r0 = S.rates[c.cur];

  view.innerHTML = `
    <p class="eyebrow">Ringkasan</p>
    <h1 class="page-title">Halo, ${esc(S.business || 'Jastiper')} 👋</h1>
    ${trips.length ? `<div class="chips">${['', ...trips].map((t) => `<button class="chip ${t === tripSel ? 'on' : ''}" data-trip="${esc(t)}">${t ? esc(t) : 'Semua trip'}</button>`).join('')}</div>` : ''}
    <div class="stats">
      <div class="stat accent"><div class="label">Pesanan aktif</div><div class="value">${aktif}</div></div>
      <div class="stat"><div class="label">Omzet</div><div class="value">${fmtIDR(omzet)}</div></div>
      <div class="stat"><div class="label">Estimasi profit</div><div class="value">${fmtIDR(profit)}</div></div>
      <div class="stat"><div class="label">Belum dibayar</div><div class="value">${fmtIDR(due)}</div></div>
    </div>

    <p class="eyebrow">Alat bantu</p>
    <h1 class="page-title">Kalkulator jastip</h1>
    <p class="page-sub">Hitung kurs dan fee jastip per item, lalu simpan sebagai markup bawaan untuk pesanan.</p>

    <section class="card">
      <h2>Kurs</h2>
      <p class="hint">Kurs terkini diambil otomatis, bisa diganti manual.</p>
      <div class="field"><label>Mata uang belanja</label>
        <select class="input" id="cCur">${curOptions(c.cur, true).replace('<option value="IDR"', '<option disabled value="IDR"')}</select></div>
      <div class="field"><label>Kurs ke IDR</label>
        <div class="row"><input class="input grow" id="cRate" inputmode="decimal" value="${r0 ? r0.rate : ''}" placeholder="mis. 487">
        <button class="btn sm" id="cRefresh" type="button">↻ Perbarui</button></div>
        <div class="help" id="cRateInfo"></div></div>
    </section>

    <section class="card">
      <h2>Fee jastip</h2>
      <p class="hint">Persen dihitung dari harga beli (sudah dalam Rupiah), atau langsung nilai flat per item.</p>
      <div class="field"><label>Jenis fee</label>
        <div class="seg" id="cFeeType"><button type="button" data-v="percent">Persen (%)</button><button type="button" data-v="flat">Flat (Rp)</button></div></div>
      <div class="field"><label id="cFeeLbl">Nilai fee</label><input class="input" id="cFee" inputmode="decimal" value="${c.fee.value}"></div>
      <div class="two">
        <div class="field"><label>Ongkir per kg (Rp)</label><input class="input" id="cShip" inputmode="decimal" value="${c.ship || ''}" placeholder="0"></div>
        <div class="field"><label>Pembulatan ke atas</label>
          <select class="input" id="cRound">${[0, 500, 1000, 5000, 10000].map((v) => `<option value="${v}" ${v === num(c.round) ? 'selected' : ''}>${v ? fmtIDR(v) : 'Tanpa'}</option>`).join('')}</select></div>
      </div>
    </section>

    <section class="card">
      <h2>Coba hitung</h2>
      <p class="hint">Masukkan contoh harga di toko untuk melihat harga jual ke customer.</p>
      <div class="two">
        <div class="field"><label id="cBuyLbl">Harga beli</label><input class="input" id="cBuy" inputmode="decimal" placeholder="0"></div>
        <div class="field"><label>Berat (gram)</label><input class="input" id="cWeight" inputmode="decimal" placeholder="0"></div>
      </div>
      <div class="result" id="cResult"></div>
      <div class="btn-col" style="margin-top:14px">
        <button class="btn primary" id="cSave" type="button">Simpan sebagai markup bawaan</button>
        <button class="btn" id="cCopy" type="button">Bagikan harga ini</button>
      </div>
    </section>`;

  const el = (id) => $('#' + id);
  const setFeeType = (t) => {
    c.fee.type = t;
    $$('#cFeeType button').forEach((b) => b.classList.toggle('on', b.dataset.v === t));
    el('cFeeLbl').textContent = t === 'flat' ? 'Fee per item (Rp)' : 'Fee (%) dari harga beli';
  };
  const info = () => {
    const r = S.rates[c.cur];
    el('cRateInfo').textContent = r ? `${r.manual ? 'Diisi manual' : 'Sumber: ' + r.src} · diperbarui ${fmtAgo(r.at)}` : 'Belum ada kurs — tekan Perbarui (butuh internet) atau isi manual.';
    el('cBuyLbl').textContent = `Harga beli (${c.cur})`;
  };
  const recalc = () => {
    const rate = num(el('cRate').value);
    c.fee.value = num(el('cFee').value); c.ship = num(el('cShip').value); c.round = num(el('cRound').value);
    const r = calcSell({ buy: el('cBuy').value, rate, weightG: el('cWeight').value, fee: c.fee, shipPerKg: c.ship, rounding: c.round });
    c.last = r;
    el('cResult').innerHTML = `
      <div class="line"><span>Modal (${esc(c.cur)} → IDR)</span><b>${fmtIDR(r.modal)}</b></div>
      <div class="line"><span>Fee jastip</span><b>${fmtIDR(r.fee)}</b></div>
      <div class="line"><span>Ongkir (berat)</span><b>${fmtIDR(r.ship)}</b></div>
      <div class="line total"><span>Harga jual</span><b>${fmtIDR(r.sell)}</b></div>`;
  };
  const refresh = async (force) => {
    el('cRateInfo').textContent = 'Mengambil kurs…';
    try {
      const rate = force ? await fetchRate(c.cur) : await ensureRate(c.cur);
      if (rate) el('cRate').value = rate;
      else toast('Kurs belum tersedia — isi manual');
    } catch (e) { toast(e.message); }
    info(); recalc();
  };

  setFeeType(c.fee.type); info(); recalc();
  $$('#cFeeType button').forEach((b) => b.onclick = () => { setFeeType(b.dataset.v); recalc(); });
  ['cFee', 'cShip', 'cBuy', 'cWeight'].forEach((id) => el(id).oninput = recalc);
  el('cRound').onchange = recalc;
  el('cRate').oninput = recalc;
  el('cRate').onchange = async () => {
    const v = num(el('cRate').value);
    if (v > 0) { S.rates[c.cur] = { rate: v, at: Date.now(), src: 'manual', manual: true }; await saveSettings(); info(); }
  };
  el('cCur').onchange = () => { c.cur = el('cCur').value; const r = S.rates[c.cur]; el('cRate').value = r ? r.rate : ''; info(); recalc(); refresh(false); };
  el('cRefresh').onclick = () => refresh(true);
  el('cSave').onclick = async () => {
    const v = num(el('cRate').value);
    if (v > 0) S.rates[c.cur] = { ...(S.rates[c.cur] || {}), rate: v, at: (S.rates[c.cur] || {}).at || Date.now(), src: (S.rates[c.cur] || {}).src || 'manual', manual: !!(S.rates[c.cur] || {}).manual };
    Object.assign(S, { currency: c.cur, fee: { ...c.fee }, shipPerKg: c.ship, rounding: c.round });
    await saveSettings();
    toast('Markup bawaan disimpan ✓');
  };
  el('cCopy').onclick = () => {
    const r = c.last;
    if (!r || !num(el('cBuy').value)) return toast('Isi harga beli dulu');
    shareText('Harga jastip', `Harga ${c.cur} ${el('cBuy').value} → harga jastip ${fmtIDR(r.sell)} (kurs ${fmtRate(num(el('cRate').value))})`);
  };
  $$('[data-trip]').forEach((b) => b.onclick = () => { viewHome.trip = b.dataset.trip; viewHome(); });
  if (!r0 || (!r0.manual && Date.now() - r0.at > 6 * 3600e3)) refresh(false);
}

/* ================= Views: Pesanan ================= */
async function viewOrders() {
  setTab('pesanan');
  const [orders, customers] = await Promise.all([DB.all('orders'), DB.all('customers')]);
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const f = viewOrders.filter || 'aktif';
  const q = (viewOrders.q || '').toLowerCase();
  const list = orders
    .filter((o) => f === 'semua' ? true : f === 'aktif' ? !['selesai', 'batal'].includes(o.status) : f === 'belum' ? orderTotals(o).due > 0 && o.status !== 'batal' : o.status === f)
    .filter((o) => !q || [o.code, o.trip, cmap[o.customerId]?.name, ...(o.items || []).map((i) => i.name)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const filters = [['aktif', 'Aktif'], ['belum', 'Belum lunas'], ...STATUSES, ['semua', 'Semua']];

  view.innerHTML = `
    <p class="eyebrow">Pesanan</p>
    <h1 class="page-title">Daftar titipan</h1>
    <div class="search"><input class="input" id="oq" placeholder="Cari kode, customer, barang…" value="${esc(viewOrders.q || '')}"></div>
    <div class="chips">${filters.map(([k, l]) => `<button class="chip ${k === f ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="olist">${list.length ? list.map((o) => {
      const t = orderTotals(o); const cu = cmap[o.customerId];
      return `<a class="list-item" href="#/pesanan/${o.id}">
        <div class="avatar">${esc((cu?.name || '?').slice(0, 1).toUpperCase())}</div>
        <div class="grow" style="flex:1;min-width:0">
          <div class="title">${esc(cu?.name || 'Tanpa customer')}</div>
          <div class="sub">#${esc(o.code)} · ${t.qty} barang${o.trip ? ' · ' + esc(o.trip) : ''}</div>
          <div style="margin-top:6px"><span class="badge st-${o.status}">${statusLabel(o.status)}</span>
          <span class="badge ${t.due > 0 ? 'pay-belum' : 'pay-lunas'}">${t.due > 0 ? 'Belum lunas' : 'Lunas'}</span></div>
        </div>
        <div class="amount">${fmtIDR(t.total)}</div></a>`;
    }).join('') : `<div class="empty"><div class="big">🛍️</div>Belum ada pesanan di sini.<br>Tekan <b>+</b> untuk mencatat titipan baru.</div>`}</div>
    <button class="fab" aria-label="Pesanan baru" onclick="location.hash='#/pesanan/baru'">+</button>`;
  $$('[data-f]').forEach((b) => b.onclick = () => { viewOrders.filter = b.dataset.f; viewOrders(); });
  const qi = $('#oq');
  qi.oninput = () => { viewOrders.q = qi.value; clearTimeout(viewOrders._t); viewOrders._t = setTimeout(async () => { await viewOrders(); const n = $('#oq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

function blankItem() {
  const cur = S.currency || 'THB';
  return { id: uid(), name: '', qty: 1, weight: '', buyPrice: '', buyCur: cur, sellPrice: '', sellCur: 'IDR', rate: rateOf(cur) || '', photos: [], note: '' };
}

async function nextCode() {
  const d = new Date();
  const p = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const orders = await DB.all('orders');
  const n = orders.filter((o) => String(o.code || '').startsWith(p)).length + 1;
  return `${p}-${String(n).padStart(3, '0')}`;
}

async function viewOrderForm(id) {
  setTab('pesanan');
  const customers = await DB.all('customers');
  let o;
  if (id) {
    o = await DB.get('orders', id);
    if (!o) { location.hash = '#/pesanan'; return; }
    o = JSON.parse(JSON.stringify(o));
  } else {
    o = { id: 'o_' + uid(), code: await nextCode(), customerId: viewOrderForm.presetCustomer || '', trip: S.trip || '', status: 'baru', items: [blankItem()], receipts: [], shipping: '', discount: '', paid: '', note: '', createdAt: Date.now() };
    viewOrderForm.presetCustomer = '';
  }
  const removed = [];
  o.items.forEach((it) => { if (!num(it.rate)) it.rate = rateOf(it.buyCur) || ''; });

  const custName = () => customers.find((c) => c.id === o.customerId)?.name;

  const itemHTML = (it, i) => `
    <div class="item-card" data-i="${i}">
      <div class="item-head"><b>Barang ${i + 1}</b>
        <div class="row">
          <button type="button" class="btn sm" data-act="to-product" title="Simpan ke katalog">＋ Katalog</button>
          ${o.items.length > 1 ? `<button type="button" class="icon-btn" data-act="rm-item" aria-label="Hapus barang">🗑️</button>` : ''}
        </div></div>
      <div class="field"><label class="req">Nama barang</label><input class="input" data-k="name" value="${esc(it.name)}" placeholder="mis. Tofu Precious Moisturizing"></div>
      <div class="two">
        <div class="field"><label class="req">Qty</label><input class="input" data-k="qty" inputmode="numeric" value="${esc(it.qty)}"></div>
        <div class="field"><label>Berat satuan (gram)</label><input class="input" data-k="weight" inputmode="decimal" value="${esc(it.weight)}"></div>
      </div>
      <div class="field">
        <div class="money-row"><label class="req label-row">Harga beli satuan</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" data-k="buyPrice" inputmode="decimal" value="${esc(it.buyPrice)}" placeholder="0">
          <select class="input" data-k="buyCur">${curOptions(it.buyCur)}</select></div>
        <div class="help" data-help="buy"></div>
      </div>
      <div class="field">
        <div class="money-row"><label class="req label-row">Harga jual satuan</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" data-k="sellPrice" inputmode="decimal" value="${esc(it.sellPrice)}" placeholder="0">
          <select class="input" data-k="sellCur">${curOptions(it.sellCur)}</select></div>
        <div class="help">Isi dalam ${esc(it.sellCur)} (harga ke customer)</div>
      </div>
      <button type="button" class="btn" data-act="quick">Hitung harga jual (cepat)</button>
      <details class="calc"><summary>Hitung harga jual</summary><div class="calc-body">
        <div class="two">
          <div class="field"><label>Kurs ${esc(it.buyCur)} → IDR</label><input class="input" data-c="rate" inputmode="decimal" value="${esc(it.rate)}"></div>
          <div class="field"><label>Ongkir/kg (Rp)</label><input class="input" data-c="ship" inputmode="decimal" value="${esc(S.shipPerKg || '')}"></div>
        </div>
        <div class="two">
          <div class="field"><label>Jenis fee</label><select class="input" data-c="feeType"><option value="percent" ${S.fee.type === 'percent' ? 'selected' : ''}>Persen</option><option value="flat" ${S.fee.type === 'flat' ? 'selected' : ''}>Flat (Rp)</option></select></div>
          <div class="field"><label>Nilai fee</label><input class="input" data-c="fee" inputmode="decimal" value="${esc(S.fee.value)}"></div>
        </div>
        <div class="result" data-calc-result></div>
        <button type="button" class="btn primary" data-act="apply" style="margin-top:12px">Pakai harga ini</button>
      </div></details>
      <div class="field" style="margin-top:14px;margin-bottom:0"><label>Foto barang</label>
        <div class="photos">${photoTiles(it.photos, true)}${photoAdd('item:' + i)}</div></div>
    </div>`;

  view.innerHTML = `
    <button class="back" onclick="history.back()">‹ Kembali</button>
    <p class="eyebrow">${id ? 'Ubah pesanan' : 'Pesanan baru'}</p>
    <h1 class="page-title">#${esc(o.code)}</h1>
    <section class="card">
      <div class="field"><label class="req">Customer</label>
        <button type="button" class="btn" id="pickCust" style="justify-content:space-between"><span id="custLbl">${esc(custName() || 'Pilih customer…')}</span><span>›</span></button></div>
      <div class="two">
        <div class="field"><label>Trip / event</label><input class="input" id="oTrip" value="${esc(o.trip)}" placeholder="mis. Bangkok Okt 26"></div>
        <div class="field"><label>Status</label><select class="input" id="oStatus">${STATUSES.map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
    </section>

    <div id="items"></div>
    <div class="btn-col" style="margin-bottom:16px">
      <button type="button" class="btn" id="addItem">Tambah barang</button>
      <button type="button" class="btn ghost" id="addFromProduct">Tambah dari katalog produk</button>
    </div>

    <section class="card">
      <h2>Pembayaran</h2>
      <div class="two">
        <div class="field"><label>Ongkir ke customer (Rp)</label><input class="input" id="oShip" inputmode="decimal" value="${esc(o.shipping)}" placeholder="0"></div>
        <div class="field"><label>Diskon (Rp)</label><input class="input" id="oDisc" inputmode="decimal" value="${esc(o.discount)}" placeholder="0"></div>
      </div>
      <div class="field"><label>Sudah dibayar / DP (Rp)</label>
        <div class="row"><input class="input grow" id="oPaid" inputmode="decimal" value="${esc(o.paid)}" placeholder="0"><button type="button" class="btn sm" id="payFull">Lunas</button></div></div>
      <div class="result" id="oSum"></div>
    </section>

    <section class="card">
      <h2>Foto struk</h2>
      <p class="hint">Simpan bukti belanja untuk rekap modal.</p>
      <div class="photos" id="receipts">${photoTiles(o.receipts, true)}${photoAdd('receipt', 'Struk')}</div>
      <div class="field" style="margin-top:14px;margin-bottom:0"><label>Catatan</label><textarea class="input" id="oNote" placeholder="Varian, warna, request khusus…">${esc(o.note)}</textarea></div>
    </section>

    <div class="btn-col">
      <button type="button" class="btn primary" id="saveOrder">Simpan pesanan</button>
      <button type="button" class="btn wa" id="saveSend">Simpan & kirim nota WhatsApp</button>
    </div>`;

  const itemsEl = $('#items');
  const renderItems = async () => {
    itemsEl.innerHTML = o.items.map(itemHTML).join('');
    o.items.forEach((_, i) => updateItemHelp(i));
    await hydratePhotos(itemsEl);
  };
  const cardOf = (i) => $(`.item-card[data-i="${i}"]`, itemsEl);
  const updateItemHelp = (i) => {
    const it = o.items[i]; const card = cardOf(i); if (!card) return;
    const r = itemRate(it);
    $('[data-help="buy"]', card).textContent = it.buyCur === 'IDR'
      ? 'Isi dalam IDR'
      : `Isi dalam ${it.buyCur}${r ? ` · ≈ ${fmtIDR(num(it.buyPrice) * r)} (kurs ${fmtRate(r)})` : ' · kurs belum ada'}`;
    const calc = calcFor(i);
    const box = $('[data-calc-result]', card);
    if (box) box.innerHTML = `
      <div class="line"><span>Modal</span><b>${fmtIDR(calc.modal)}</b></div>
      <div class="line"><span>Fee</span><b>${fmtIDR(calc.fee)}</b></div>
      <div class="line"><span>Ongkir berat</span><b>${fmtIDR(calc.ship)}</b></div>
      <div class="line total"><span>Harga jual</span><b>${fmtIDR(calc.sell)}</b></div>`;
  };
  const calcFor = (i, quick) => {
    const it = o.items[i]; const card = cardOf(i);
    const g = (k) => card && $(`[data-c="${k}"]`, card);
    const rate = quick ? itemRate(it) : num(g('rate')?.value) || itemRate(it);
    const fee = quick ? S.fee : { type: g('feeType')?.value || S.fee.type, value: num(g('fee')?.value) };
    const ship = quick ? S.shipPerKg : num(g('ship')?.value);
    return calcSell({ buy: it.buyPrice, rate, weightG: it.weight, fee, shipPerKg: ship, rounding: S.rounding });
  };
  const applySell = (i, calc, rate) => {
    const it = o.items[i];
    if (!num(it.buyPrice)) return toast('Isi harga beli dulu');
    if (!rate) return toast('Kurs belum ada — buka Beranda untuk mengambil kurs');
    it.rate = rate; it.sellCur = 'IDR'; it.sellPrice = calc.sell;
    const card = cardOf(i);
    $('[data-k="sellPrice"]', card).value = calc.sell;
    $('[data-k="sellCur"]', card).value = 'IDR';
    updateItemHelp(i); updateSum();
    toast(`Harga jual ${fmtIDR(calc.sell)}`);
  };
  const updateSum = () => {
    o.shipping = $('#oShip').value; o.discount = $('#oDisc').value; o.paid = $('#oPaid').value;
    const t = orderTotals(o);
    $('#oSum').innerHTML = `
      <div class="line"><span>Subtotal (${t.qty} barang)</span><b>${fmtIDR(t.subtotal)}</b></div>
      <div class="line"><span>Ongkir</span><b>${fmtIDR(t.shipping)}</b></div>
      ${t.discount ? `<div class="line"><span>Diskon</span><b>− ${fmtIDR(t.discount)}</b></div>` : ''}
      <div class="line total"><span>Total tagihan</span><b>${fmtIDR(t.total)}</b></div>
      <div class="line"><span>Sisa tagihan</span><b>${fmtIDR(t.due)}</b></div>
      <div class="line"><span>Modal · estimasi profit</span><b>${fmtIDR(t.modal)} · ${fmtIDR(t.profit)}</b></div>`;
  };

  itemsEl.addEventListener('input', (e) => {
    const card = e.target.closest('.item-card'); if (!card) return;
    const i = +card.dataset.i; const k = e.target.dataset.k;
    if (k) o.items[i][k] = e.target.value;
    if (e.target.dataset.c === 'rate') o.items[i].rate = e.target.value;
    updateItemHelp(i); updateSum();
  });
  itemsEl.addEventListener('change', async (e) => {
    const card = e.target.closest('.item-card'); if (!card) return;
    const i = +card.dataset.i; const k = e.target.dataset.k; const it = o.items[i];
    if (k === 'buyCur') {
      it.buyCur = e.target.value;
      it.rate = await ensureRate(it.buyCur) || '';
      const ri = $('[data-c="rate"]', card); if (ri) { ri.value = it.rate; ri.previousElementSibling && (ri.closest('.field').querySelector('label').textContent = `Kurs ${it.buyCur} → IDR`); }
      updateItemHelp(i); updateSum();
    } else if (k === 'sellCur') {
      it.sellCur = e.target.value;
      if (it.sellCur !== 'IDR') await ensureRate(it.sellCur);
      card.querySelectorAll('.help')[1].textContent = `Isi dalam ${it.sellCur} (harga ke customer)`;
      updateSum();
    } else if (e.target.dataset.c) updateItemHelp(i);
    if (e.target.dataset.addPhoto) await addPhoto(e.target);
  });
  itemsEl.addEventListener('click', async (e) => {
    const zoom = e.target.closest('[data-zoom]'); if (zoom && zoom.src) return openLightbox(zoom.src);
    const card = e.target.closest('.item-card'); if (!card) return;
    const i = +card.dataset.i; const it = o.items[i];
    const rm = e.target.closest('[data-rm-photo]');
    if (rm) { it.photos = it.photos.filter((p) => p !== rm.dataset.rmPhoto); removed.push(rm.dataset.rmPhoto); return renderItems(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rm-item') { removed.push(...it.photos); o.items.splice(i, 1); await renderItems(); updateSum(); }
    else if (act === 'quick') applySell(i, calcFor(i, true), itemRate(it));
    else if (act === 'apply') applySell(i, calcFor(i), num($('[data-c="rate"]', card).value) || itemRate(it));
    else if (act === 'to-product') {
      if (!it.name.trim()) return toast('Isi nama barang dulu');
      await DB.put('products', { id: 'p_' + uid(), name: it.name.trim(), brand: '', buyPrice: it.buyPrice, buyCur: it.buyCur, sellPrice: itemSellIDR(it) || '', weight: it.weight, photo: it.photos[0] ? await copyPhoto(it.photos[0]) : null, note: '', createdAt: Date.now() });
      toast('Disimpan ke katalog produk ✓');
    }
  });

  async function addPhoto(input) {
    const files = Array.from(input.files || []); if (!files.length) return;
    toast('Memproses foto…');
    const ids = await savePhotos(files);
    const key = input.dataset.addPhoto;
    if (key === 'receipt') { o.receipts.push(...ids); renderReceipts(); }
    else { const i = +key.split(':')[1]; o.items[i].photos.push(...ids); await renderItems(); }
    toast(`${ids.length} foto ditambahkan`);
  }
  const renderReceipts = async () => {
    $('#receipts').innerHTML = photoTiles(o.receipts, true) + photoAdd('receipt', 'Struk');
    await hydratePhotos($('#receipts'));
  };
  $('#receipts').addEventListener('change', (e) => { if (e.target.dataset.addPhoto) addPhoto(e.target); });
  $('#receipts').addEventListener('click', (e) => {
    const zoom = e.target.closest('[data-zoom]'); if (zoom && zoom.src) return openLightbox(zoom.src);
    const rm = e.target.closest('[data-rm-photo]');
    if (rm) { o.receipts = o.receipts.filter((p) => p !== rm.dataset.rmPhoto); removed.push(rm.dataset.rmPhoto); renderReceipts(); }
  });

  $('#addItem').onclick = async () => { o.items.push(blankItem()); await renderItems(); cardOf(o.items.length - 1).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#addFromProduct').onclick = async () => {
    const products = (await DB.all('products')).sort((a, b) => a.name.localeCompare(b.name));
    if (!products.length) return toast('Katalog produk masih kosong');
    openSheet(`<h3>Pilih produk</h3><input class="input" id="pq" placeholder="Cari produk…"><div class="pick" id="plist"></div>
      <button class="btn ghost" data-close>Tutup</button>`, (s) => {
      const draw = () => {
        const q = $('#pq', s).value.toLowerCase();
        $('#plist', s).innerHTML = products.filter((p) => !q || (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)).map((p) => `
          <button class="list-item" data-pid-pick="${p.id}">${p.photo ? `<img class="thumb" data-pid="${p.photo}" alt="">` : '<div class="thumb">📦</div>'}
          <div style="flex:1;min-width:0"><div class="title">${esc(p.name)}</div><div class="sub">${p.buyPrice ? fmtCur(p.buyPrice, p.buyCur) : ''}${p.brand ? ' · ' + esc(p.brand) : ''}</div></div>
          <div class="amount">${p.sellPrice ? fmtIDR(p.sellPrice) : ''}</div></button>`).join('') || '<div class="empty">Tidak ditemukan</div>';
        hydratePhotos(s);
      };
      draw();
      $('#pq', s).oninput = draw;
      $('[data-close]', s).onclick = closeSheet;
      $('#plist', s).onclick = async (e) => {
        const b = e.target.closest('[data-pid-pick]'); if (!b) return;
        const p = products.find((x) => x.id === b.dataset.pidPick);
        const it = { ...blankItem(), name: p.name, buyPrice: p.buyPrice || '', buyCur: p.buyCur || S.currency, weight: p.weight || '', sellPrice: p.sellPrice || '', sellCur: 'IDR' };
        it.rate = await ensureRate(it.buyCur) || '';
        if (p.photo) { const nid = await copyPhoto(p.photo); if (nid) it.photos.push(nid); }
        const last = o.items[o.items.length - 1];
        if (o.items.length === 1 && !last.name && !num(last.buyPrice)) o.items = [it]; else o.items.push(it);
        closeSheet(); await renderItems(); updateSum(); toast('Produk ditambahkan');
      };
    });
  };

  $('#pickCust').onclick = () => pickCustomer(customers, (c) => { o.customerId = c.id; $('#custLbl').textContent = c.name; });
  ['oShip', 'oDisc', 'oPaid'].forEach((k) => $('#' + k).oninput = updateSum);
  $('#payFull').onclick = () => { $('#oPaid').value = ''; updateSum(); $('#oPaid').value = orderTotals(o).total; updateSum(); };

  const save = async () => {
    o.trip = $('#oTrip').value.trim(); o.status = $('#oStatus').value; o.note = $('#oNote').value;
    o.items = o.items.filter((it) => it.name.trim() || num(it.buyPrice) || num(it.sellPrice));
    if (!o.customerId) { toast('Pilih customer dulu'); return null; }
    if (!o.items.length) { o.items = [blankItem()]; await renderItems(); toast('Tambahkan minimal 1 barang'); return null; }
    const bad = o.items.findIndex((it) => !it.name.trim() || !(num(it.qty) > 0));
    if (bad >= 0) { await renderItems(); toast(`Lengkapi nama & qty barang ${bad + 1}`); cardOf(bad)?.scrollIntoView({ block: 'center' }); return null; }
    o.items.forEach((it) => { it.qty = num(it.qty); it.rate = itemRate(it); });
    o.updatedAt = Date.now();
    await DB.put('orders', o);
    await deletePhotos(removed);
    if (o.trip && o.trip !== S.trip) { S.trip = o.trip; await saveSettings(); }
    return o;
  };
  $('#saveOrder').onclick = async () => { if (await save()) { toast('Pesanan disimpan ✓'); location.replace('#/pesanan/' + o.id); } };
  $('#saveSend').onclick = async () => {
    if (!(await save())) return;
    const cu = await DB.get('customers', o.customerId);
    location.replace('#/pesanan/' + o.id);
    if (cu?.phone) openWA(cu.phone, buildNota(o, cu)); else toast('Nomor WA customer belum diisi');
  };

  await renderItems(); updateSum(); await hydratePhotos($('#receipts'));
  // kurs diambil di latar belakang supaya form langsung tampil walau sinyal lemah
  [...new Set(o.items.map((it) => it.buyCur))].forEach((cur) => ensureRate(cur).then(() => {
    o.items.forEach((it, i) => {
      if (it.buyCur !== cur || num(it.rate)) return;
      it.rate = rateOf(cur) || '';
      const ri = cardOf(i) && $('[data-c="rate"]', cardOf(i)); if (ri) ri.value = it.rate;
      updateItemHelp(i);
    });
    updateSum(); renderChrome();
  }));
}

function pickCustomer(customers, onPick) {
  openSheet(`<h3>Pilih customer</h3>
    <input class="input" id="cq" placeholder="Cari nama / nomor…">
    <div class="pick" id="clist"></div>
    <div class="btn-col"><button class="btn primary" id="newCust">+ Customer baru</button><button class="btn ghost" data-close>Tutup</button></div>`, (s) => {
    const draw = () => {
      const q = $('#cq', s).value.toLowerCase();
      $('#clist', s).innerHTML = customers.filter((c) => !q || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `<button class="list-item" data-cid="${c.id}"><div class="avatar">${esc(c.name.slice(0, 1).toUpperCase())}</div>
          <div><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.phone || '—')}</div></div></button>`).join('')
        || '<div class="empty">Belum ada customer — tambahkan di bawah.</div>';
    };
    draw();
    $('#cq', s).oninput = draw;
    $('[data-close]', s).onclick = closeSheet;
    $('#clist', s).onclick = (e) => { const b = e.target.closest('[data-cid]'); if (!b) return; onPick(customers.find((c) => c.id === b.dataset.cid)); closeSheet(); };
    $('#newCust', s).onclick = () => customerSheet(null, (c) => { customers.push(c); onPick(c); }, $('#cq', s).value);
  });
}

function buildNota(o, cu) {
  const t = orderTotals(o);
  const rincian = o.items.map((it, i) => {
    const unit = itemSellIDR(it);
    return `${i + 1}. ${it.name} × ${num(it.qty)} @ ${fmtIDR(unit)} = ${fmtIDR(unit * num(it.qty))}`;
  }).join('\n');
  const map = {
    nama: cu?.name || '', kode: o.code, trip: o.trip ? ` (${o.trip})` : '', rincian,
    subtotal: fmtIDR(t.subtotal), ongkir: fmtIDR(t.shipping), diskon: fmtIDR(t.discount), total: fmtIDR(t.total),
    dibayar: fmtIDR(t.paid), sisa: fmtIDR(t.due), status: statusLabel(o.status), usaha: S.business || '',
  };
  let txt = (S.template || DEFAULT_TEMPLATE).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  if (t.discount && !/\{diskon\}/.test(S.template || DEFAULT_TEMPLATE)) txt = txt.replace(`*Total:`, `Diskon: − ${fmtIDR(t.discount)}\n*Total:`);
  return txt;
}

async function viewOrderDetail(id) {
  setTab('pesanan');
  const o = await DB.get('orders', id);
  if (!o) { location.hash = '#/pesanan'; return; }
  const cu = await DB.get('customers', o.customerId);
  const t = orderTotals(o);
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/pesanan'">‹ Pesanan</button>
    <p class="eyebrow">#${esc(o.code)}${o.trip ? ' · ' + esc(o.trip) : ''}</p>
    <h1 class="page-title">${esc(cu?.name || 'Tanpa customer')}</h1>
    <p class="page-sub">${fmtDate(o.createdAt)} · <span class="badge st-${o.status}">${statusLabel(o.status)}</span>
      <span class="badge ${t.due > 0 ? 'pay-belum' : 'pay-lunas'}">${t.due > 0 ? 'Belum lunas' : 'Lunas'}</span></p>

    <section class="card">
      <h2>Ubah status</h2>
      <div class="chips" style="flex-wrap:wrap">${STATUSES.map(([k, l]) => `<button class="chip ${k === o.status ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
    </section>

    <section class="card">
      <h2>Barang</h2>
      ${o.items.map((it) => `
        <div class="list-item" style="border:0;padding:10px 0;margin:0;border-bottom:1px solid var(--line);border-radius:0;background:none">
          ${it.photos?.[0] ? `<img class="thumb" data-pid="${it.photos[0]}" data-zoom alt="">` : '<div class="thumb">📦</div>'}
          <div style="flex:1;min-width:0"><div class="title">${esc(it.name)}</div>
            <div class="sub">${num(it.qty)} × ${fmtIDR(itemSellIDR(it))} · beli ${fmtCur(it.buyPrice, it.buyCur)}${it.weight ? ` · ${num(it.weight)} g` : ''}</div></div>
          <div class="amount">${fmtIDR(itemSellIDR(it) * num(it.qty))}</div>
        </div>`).join('')}
      <div class="result" style="margin-top:14px">
        <div class="line"><span>Subtotal</span><b>${fmtIDR(t.subtotal)}</b></div>
        <div class="line"><span>Ongkir</span><b>${fmtIDR(t.shipping)}</b></div>
        ${t.discount ? `<div class="line"><span>Diskon</span><b>− ${fmtIDR(t.discount)}</b></div>` : ''}
        <div class="line total"><span>Total</span><b>${fmtIDR(t.total)}</b></div>
        <div class="line"><span>Sudah dibayar</span><b>${fmtIDR(t.paid)}</b></div>
        <div class="line"><span>Sisa</span><b>${fmtIDR(t.due)}</b></div>
        <div class="line"><span>Modal · profit</span><b>${fmtIDR(t.modal)} · ${fmtIDR(t.profit)}</b></div>
      </div>
      ${t.due > 0 ? `<button class="btn" id="markPaid" style="margin-top:12px">Tandai lunas</button>` : ''}
    </section>

    ${o.receipts?.length ? `<section class="card"><h2>Struk</h2><div class="photos">${photoTiles(o.receipts)}</div></section>` : ''}
    ${o.note ? `<section class="card"><h2>Catatan</h2><p style="white-space:pre-wrap;margin:0">${esc(o.note)}</p></section>` : ''}

    <div class="btn-col">
      <button class="btn wa" id="sendWA">Kirim nota ke WhatsApp</button>
      <button class="btn" id="shareNota">Bagikan / salin nota</button>
      <a class="btn" href="#/pesanan/${o.id}/edit">Ubah pesanan</a>
      <button class="btn danger" id="delOrder">Hapus pesanan</button>
    </div>`;
  await hydratePhotos();
  view.onclick = (e) => { const z = e.target.closest('[data-zoom]'); if (z && z.src) openLightbox(z.src); };
  $$('[data-st]').forEach((b) => b.onclick = async () => { o.status = b.dataset.st; o.updatedAt = Date.now(); await DB.put('orders', o); toast('Status: ' + statusLabel(o.status)); viewOrderDetail(id); });
  const mp = $('#markPaid'); if (mp) mp.onclick = async () => { o.paid = t.total; await DB.put('orders', o); toast('Ditandai lunas ✓'); viewOrderDetail(id); };
  $('#sendWA').onclick = () => cu?.phone ? openWA(cu.phone, buildNota(o, cu)) : toast('Nomor WA customer belum diisi');
  $('#shareNota').onclick = () => shareText('Nota #' + o.code, buildNota(o, cu));
  $('#delOrder').onclick = async () => {
    if (!(await confirmSheet(`Hapus pesanan #${o.code}?`, 'Hapus'))) return;
    await deletePhotos([...(o.receipts || []), ...o.items.flatMap((i) => i.photos || [])]);
    await DB.del('orders', o.id); toast('Pesanan dihapus'); location.hash = '#/pesanan';
  };
}

/* ================= Views: Produk ================= */
async function viewProducts() {
  setTab('produk');
  const q = (viewProducts.q || '').toLowerCase();
  const products = (await DB.all('products')).filter((p) => !q || (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  view.innerHTML = `
    <p class="eyebrow">Katalog</p>
    <h1 class="page-title">Produk</h1>
    <p class="page-sub">Simpan barang yang sering dititip supaya pesanan cukup sekali tap.</p>
    <div class="search"><input class="input" id="pq" placeholder="Cari produk / brand…" value="${esc(viewProducts.q || '')}"></div>
    ${products.length ? products.map((p) => `
      <a class="list-item" href="#/produk/${p.id}">
        ${p.photo ? `<img class="thumb" data-pid="${p.photo}" alt="">` : '<div class="thumb">📦</div>'}
        <div style="flex:1;min-width:0"><div class="title">${esc(p.name)}</div>
          <div class="sub">${p.brand ? esc(p.brand) + ' · ' : ''}${p.buyPrice ? 'beli ' + fmtCur(p.buyPrice, p.buyCur) : ''}${p.weight ? ` · ${num(p.weight)} g` : ''}</div></div>
        <div class="amount">${p.sellPrice ? fmtIDR(p.sellPrice) : ''}</div></a>`).join('')
    : `<div class="empty"><div class="big">📦</div>Belum ada produk.<br>Tekan <b>+</b> untuk menambah.</div>`}
    <button class="fab" aria-label="Produk baru" onclick="location.hash='#/produk/baru'">+</button>`;
  await hydratePhotos();
  const qi = $('#pq');
  qi.oninput = () => { viewProducts.q = qi.value; clearTimeout(viewProducts._t); viewProducts._t = setTimeout(async () => { await viewProducts(); const n = $('#pq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

async function viewProductForm(id) {
  setTab('produk');
  let p = id ? await DB.get('products', id) : null;
  if (id && !p) { location.hash = '#/produk'; return; }
  p = p || { id: 'p_' + uid(), name: '', brand: '', buyPrice: '', buyCur: S.currency, sellPrice: '', weight: '', photo: null, note: '', createdAt: Date.now() };
  const oldPhoto = p.photo;
  ensureRate(p.buyCur).then(() => $('#pHelp') && help());
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/produk'">‹ Produk</button>
    <p class="eyebrow">${id ? 'Ubah produk' : 'Produk baru'}</p>
    <h1 class="page-title">${esc(p.name || 'Produk baru')}</h1>
    <section class="card">
      <div class="field"><label>Foto</label><div class="photos" id="pPhoto"></div></div>
      <div class="field"><label class="req">Nama produk</label><input class="input" id="pName" value="${esc(p.name)}"></div>
      <div class="two">
        <div class="field"><label>Brand / toko</label><input class="input" id="pBrand" value="${esc(p.brand)}"></div>
        <div class="field"><label>Berat (gram)</label><input class="input" id="pWeight" inputmode="decimal" value="${esc(p.weight)}"></div>
      </div>
      <div class="field">
        <div class="money-row"><label class="label-row">Harga beli</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" id="pBuy" inputmode="decimal" value="${esc(p.buyPrice)}"><select class="input" id="pCur">${curOptions(p.buyCur)}</select></div>
      </div>
      <div class="field"><label>Harga jual (Rp)</label>
        <div class="row"><input class="input grow" id="pSell" inputmode="decimal" value="${esc(p.sellPrice)}"><button class="btn sm" id="pCalc" type="button">Hitung</button></div>
        <div class="help" id="pHelp"></div></div>
      <div class="field"><label>Catatan</label><textarea class="input" id="pNote">${esc(p.note)}</textarea></div>
    </section>
    <div class="btn-col">
      <button class="btn primary" id="pSave">Simpan produk</button>
      ${id ? `<button class="btn" id="pOrder">Buat pesanan dengan produk ini</button><button class="btn danger" id="pDel">Hapus produk</button>` : ''}
    </div>`;
  const drawPhoto = async () => {
    $('#pPhoto').innerHTML = (p.photo ? photoTiles([p.photo], true) : '') + (p.photo ? '' : photoAdd('product'));
    await hydratePhotos($('#pPhoto'));
  };
  const help = () => {
    const r = rateOf($('#pCur').value);
    const b = num($('#pBuy').value);
    $('#pHelp').textContent = b && $('#pCur').value !== 'IDR' ? (r ? `Modal ≈ ${fmtIDR(b * r)} (kurs ${fmtRate(r)})` : 'Kurs belum ada') : '';
  };
  await drawPhoto(); help();
  $('#pPhoto').onchange = async (e) => { if (e.target.dataset.addPhoto) { const ids = await savePhotos([e.target.files[0]]); p.photo = ids[0]; drawPhoto(); } };
  $('#pPhoto').onclick = (e) => {
    const rm = e.target.closest('[data-rm-photo]'); if (rm) { e.preventDefault(); p.photo = null; drawPhoto(); return; }
    const z = e.target.closest('[data-zoom]'); if (z && z.src) openLightbox(z.src);
  };
  $('#pBuy').oninput = help;
  $('#pCur').onchange = async () => { await ensureRate($('#pCur').value); help(); };
  $('#pCalc').onclick = () => {
    const cur = $('#pCur').value; const r = rateOf(cur);
    if (!num($('#pBuy').value)) return toast('Isi harga beli dulu');
    if (!r) return toast('Kurs belum ada');
    const c = calcSell({ buy: $('#pBuy').value, rate: r, weightG: $('#pWeight').value, fee: S.fee, shipPerKg: S.shipPerKg, rounding: S.rounding });
    $('#pSell').value = c.sell; toast(`Harga jual ${fmtIDR(c.sell)}`);
  };
  $('#pSave').onclick = async () => {
    const name = $('#pName').value.trim(); if (!name) return toast('Nama produk wajib diisi');
    Object.assign(p, { name, brand: $('#pBrand').value.trim(), weight: $('#pWeight').value, buyPrice: $('#pBuy').value, buyCur: $('#pCur').value, sellPrice: $('#pSell').value, note: $('#pNote').value, updatedAt: Date.now() });
    await DB.put('products', p);
    if (oldPhoto && oldPhoto !== p.photo) await deletePhotos([oldPhoto]);
    toast('Produk disimpan ✓'); location.hash = '#/produk';
  };
  const po = $('#pOrder');
  if (po) po.onclick = () => { location.hash = '#/pesanan/baru'; setTimeout(() => $('#addFromProduct')?.click(), 400); };
  const pd = $('#pDel');
  if (pd) pd.onclick = async () => { if (!(await confirmSheet(`Hapus produk "${p.name}"?`, 'Hapus'))) return; await deletePhotos([oldPhoto, p.photo]); await DB.del('products', p.id); toast('Produk dihapus'); location.hash = '#/produk'; };
}

/* ================= Views: Customer ================= */
async function viewCustomers() {
  setTab('customer');
  const [customers, orders] = await Promise.all([DB.all('customers'), DB.all('orders')]);
  const q = (viewCustomers.q || '').toLowerCase();
  const stat = {};
  orders.filter((o) => o.status !== 'batal').forEach((o) => { const t = orderTotals(o); const s = stat[o.customerId] ||= { n: 0, due: 0 }; s.n++; s.due += t.due; });
  const list = customers.filter((c) => !q || (c.name + ' ' + (c.phone || '') + ' ' + (c.city || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  view.innerHTML = `
    <p class="eyebrow">Pelanggan</p>
    <h1 class="page-title">Customer</h1>
    <div class="search"><input class="input" id="cq" placeholder="Cari nama, nomor, kota…" value="${esc(viewCustomers.q || '')}"></div>
    ${list.length ? list.map((c) => { const s = stat[c.id] || { n: 0, due: 0 }; return `
      <a class="list-item" href="#/customer/${c.id}">
        <div class="avatar">${esc(c.name.slice(0, 1).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><div class="title">${esc(c.name)}</div>
          <div class="sub">${esc(c.phone || '—')}${c.city ? ' · ' + esc(c.city) : ''} · ${s.n} pesanan</div></div>
        ${s.due > 0 ? `<span class="badge pay-belum">${fmtIDR(s.due)}</span>` : ''}</a>`; }).join('')
    : `<div class="empty"><div class="big">👥</div>Belum ada customer.<br>Tekan <b>+</b> untuk menambah.</div>`}
    <button class="fab" aria-label="Customer baru" id="addC">+</button>`;
  $('#addC').onclick = () => customerSheet(null, () => viewCustomers());
  const qi = $('#cq');
  qi.oninput = () => { viewCustomers.q = qi.value; clearTimeout(viewCustomers._t); viewCustomers._t = setTimeout(async () => { await viewCustomers(); const n = $('#cq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

function customerSheet(c, onSaved, prefill = '') {
  const isNew = !c;
  c = c || { id: 'c_' + uid(), name: prefill, phone: '', city: '', address: '', note: '', createdAt: Date.now() };
  openSheet(`<h3>${isNew ? 'Customer baru' : 'Ubah customer'}</h3>
    <div class="field"><label class="req">Nama</label><input class="input" id="sName" value="${esc(c.name)}"></div>
    <div class="field"><label>No. WhatsApp</label><input class="input" id="sPhone" inputmode="tel" value="${esc(c.phone)}" placeholder="08xx / +62xx"></div>
    <div class="field"><label>Kota</label><input class="input" id="sCity" value="${esc(c.city)}"></div>
    <div class="field"><label>Alamat kirim</label><textarea class="input" id="sAddr">${esc(c.address)}</textarea></div>
    <div class="btn-col"><button class="btn primary" id="sSave">Simpan</button><button class="btn ghost" data-close>Batal</button></div>`, (s) => {
    $('[data-close]', s).onclick = closeSheet;
    $('#sSave', s).onclick = async () => {
      const name = $('#sName', s).value.trim(); if (!name) return toast('Nama wajib diisi');
      Object.assign(c, { name, phone: $('#sPhone', s).value.trim(), city: $('#sCity', s).value.trim(), address: $('#sAddr', s).value.trim(), updatedAt: Date.now() });
      await DB.put('customers', c); closeSheet(); toast('Customer disimpan ✓'); onSaved && onSaved(c);
    };
  });
}

async function viewCustomerDetail(id) {
  setTab('customer');
  const c = await DB.get('customers', id);
  if (!c) { location.hash = '#/customer'; return; }
  const orders = (await DB.all('orders')).filter((o) => o.customerId === id).sort((a, b) => b.createdAt - a.createdAt);
  let total = 0, due = 0;
  orders.filter((o) => o.status !== 'batal').forEach((o) => { const t = orderTotals(o); total += t.total; due += t.due; });
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/customer'">‹ Customer</button>
    <p class="eyebrow">Customer</p>
    <h1 class="page-title">${esc(c.name)}</h1>
    <section class="card">
      <div class="kv"><span>WhatsApp</span><span>${esc(c.phone || '—')}</span></div>
      <div class="kv"><span>Kota</span><span>${esc(c.city || '—')}</span></div>
      <div class="kv"><span>Alamat</span><span style="white-space:pre-wrap">${esc(c.address || '—')}</span></div>
      <div class="kv"><span>Total belanja</span><span>${fmtIDR(total)}</span></div>
      <div class="kv"><span>Belum dibayar</span><span>${fmtIDR(due)}</span></div>
    </section>
    <div class="btn-col" style="margin-bottom:18px">
      ${c.phone ? `<button class="btn wa" id="chat">Chat WhatsApp</button>` : ''}
      <button class="btn primary" id="newO">+ Pesanan untuk ${esc(c.name)}</button>
      <div class="two"><button class="btn" id="edit">Ubah</button><button class="btn danger" id="del">Hapus</button></div>
    </div>
    <h2 style="margin-bottom:10px">Riwayat pesanan</h2>
    ${orders.map((o) => { const t = orderTotals(o); return `<a class="list-item" href="#/pesanan/${o.id}">
      <div style="flex:1"><div class="title">#${esc(o.code)}</div><div class="sub">${fmtDate(o.createdAt)} · ${t.qty} barang</div>
      <div style="margin-top:6px"><span class="badge st-${o.status}">${statusLabel(o.status)}</span></div></div>
      <div class="amount">${fmtIDR(t.total)}</div></a>`; }).join('') || '<div class="empty">Belum ada pesanan.</div>'}`;
  const ch = $('#chat'); if (ch) ch.onclick = () => openWA(c.phone, `Halo Kak ${c.name} 👋`);
  $('#newO').onclick = () => { viewOrderForm.presetCustomer = c.id; location.hash = '#/pesanan/baru'; };
  $('#edit').onclick = () => customerSheet(c, () => viewCustomerDetail(id));
  $('#del').onclick = async () => {
    if (orders.length) return toast('Customer masih punya pesanan — hapus pesanannya dulu');
    if (!(await confirmSheet(`Hapus customer ${c.name}?`, 'Hapus'))) return;
    await DB.del('customers', id); toast('Customer dihapus'); location.hash = '#/customer';
  };
}

/* ================= Views: Saya (pengaturan) ================= */
async function viewSettings() {
  setTab('saya');
  view.innerHTML = `
    <p class="eyebrow">Pengaturan</p>
    <h1 class="page-title">Saya</h1>
    <section class="card">
      <h2>Profil usaha</h2>
      <div class="field"><label>Nama usaha</label><input class="input" id="sBiz" value="${esc(S.business)}"></div>
      <div class="field"><label>No. WhatsApp usaha</label><input class="input" id="sWa" inputmode="tel" value="${esc(S.ownerWa)}"></div>
      <div class="two">
        <div class="field"><label>Trip aktif</label><input class="input" id="sTrip" value="${esc(S.trip)}" placeholder="mis. Bangkok Okt 26"></div>
        <div class="field"><label>Mata uang belanja</label><select class="input" id="sCur">${curOptions(S.currency)}</select></div>
      </div>
      <p class="help">Trip & mata uang ini otomatis terisi di pesanan baru. Fee, ongkir/kg & pembulatan diatur dari Kalkulator di Beranda.</p>
    </section>

    <section class="card">
      <h2>Template nota WhatsApp</h2>
      <p class="hint">Kode yang bisa dipakai: {nama} {kode} {trip} {rincian} {subtotal} {ongkir} {diskon} {total} {dibayar} {sisa} {status} {usaha}</p>
      <textarea class="input" id="sTpl" style="min-height:220px">${esc(S.template)}</textarea>
      <button class="btn ghost" id="sTplReset" style="margin-top:8px">Kembalikan ke template bawaan</button>
    </section>
    <button class="btn primary" id="sSave" style="margin-bottom:16px">Simpan pengaturan</button>

    <section class="card">
      <h2>Kurs tersimpan</h2>
      ${Object.keys(S.rates).length ? Object.entries(S.rates).map(([c, r]) => `<div class="kv"><span>1 ${c}</span><span>${fmtIDR(r.rate)} <span class="muted small">· ${r.manual ? 'manual' : fmtAgo(r.at)}</span></span></div>`).join('') : '<p class="muted">Belum ada — buka Kalkulator di Beranda.</p>'}
    </section>

    <section class="card">
      <h2>Backup data</h2>
      <p class="hint">Semua data tersimpan di HP ini saja. Rutin buat backup, terutama sebelum ganti HP atau uninstall aplikasi.</p>
      <div class="btn-col">
        <button class="btn" id="bExport">Ekspor backup (.json)</button>
        <label class="btn">Impor backup<input type="file" accept="application/json,.json" id="bImport" hidden></label>
        <button class="btn" id="bCsv">Ekspor rekap pesanan (.csv)</button>
        <button class="btn danger" id="bReset">Hapus semua data</button>
      </div>
    </section>
    <p class="muted small" style="text-align:center">KuyTitip v1.0 · aplikasi internal · kurs: open.er-api.com / Frankfurter</p>`;

  $('#sTplReset').onclick = () => { $('#sTpl').value = DEFAULT_TEMPLATE; };
  $('#sSave').onclick = async () => {
    Object.assign(S, { business: $('#sBiz').value.trim() || 'KuyTitip', ownerWa: $('#sWa').value.trim(), trip: $('#sTrip').value.trim(), currency: $('#sCur').value, template: $('#sTpl').value || DEFAULT_TEMPLATE });
    await saveSettings(); ensureRate(S.currency).then(renderChrome); toast('Pengaturan disimpan ✓');
  };
  $('#bExport').onclick = exportBackup;
  $('#bCsv').onclick = exportCSV;
  $('#bImport').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'kuytitip') throw new Error('Bukan file backup KuyTitip');
      if (!(await confirmSheet('Impor akan MENGGANTI semua data di HP ini. Lanjut?', 'Ganti data'))) return;
      for (const s of STORES) { await DB.clear(s); for (const row of data[s] || []) await DB.put(s, row); }
      photoCache.clear(); await loadSettings(); renderChrome(); toast('Backup berhasil diimpor ✓'); viewSettings();
    } catch (err) { toast('Gagal impor: ' + err.message, 3500); }
  };
  $('#bReset').onclick = async () => {
    if (!(await confirmSheet('Hapus SEMUA pesanan, produk, customer & foto?', 'Hapus semua'))) return;
    for (const s of STORES) await DB.clear(s);
    photoCache.clear(); await loadSettings(); renderChrome(); toast('Semua data dihapus'); location.hash = '#/beranda';
  };
}

async function saveFile(name, content, mime) {
  const Fs = plugin('Filesystem'); const Share = plugin('Share');
  if (isNative() && Fs) {
    try {
      const r = await Fs.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
      if (Share) await Share.share({ title: name, url: r.uri, dialogTitle: 'Simpan / kirim ' + name });
      else toast('Tersimpan: ' + r.uri, 4000);
      return;
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Gagal menyimpan: ' + (e.message || e), 3500); return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function exportBackup() {
  const data = { app: 'kuytitip', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) data[s] = await DB.all(s);
  const d = new Date().toISOString().slice(0, 10);
  await saveFile(`kuytitip-backup-${d}.json`, JSON.stringify(data), 'application/json');
}
async function exportCSV() {
  const [orders, customers] = await Promise.all([DB.all('orders'), DB.all('customers')]);
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Kode', 'Tanggal', 'Trip', 'Customer', 'No WA', 'Status', 'Barang', 'Qty', 'Harga beli', 'Mata uang', 'Kurs', 'Modal (Rp)', 'Harga jual (Rp)', 'Subtotal (Rp)']];
  orders.sort((a, b) => a.createdAt - b.createdAt).forEach((o) => o.items.forEach((it) => {
    const r = itemRate(it); const sell = itemSellIDR(it);
    rows.push([o.code, new Date(o.createdAt).toISOString().slice(0, 10), o.trip, cmap[o.customerId]?.name, cmap[o.customerId]?.phone, statusLabel(o.status), it.name, num(it.qty), num(it.buyPrice), it.buyCur, r, Math.round(num(it.buyPrice) * r * num(it.qty)), Math.round(sell), Math.round(sell * num(it.qty))]);
  }));
  await saveFile(`kuytitip-rekap-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
}

/* ================= Router ================= */
const ROUTES = [
  [/^#\/beranda$/, viewHome],
  [/^#\/pesanan$/, viewOrders],
  [/^#\/pesanan\/baru$/, () => viewOrderForm(null)],
  [/^#\/pesanan\/([\w-]+)\/edit$/, (m) => viewOrderForm(m[1])],
  [/^#\/pesanan\/([\w-]+)$/, (m) => viewOrderDetail(m[1])],
  [/^#\/produk$/, viewProducts],
  [/^#\/produk\/baru$/, () => viewProductForm(null)],
  [/^#\/produk\/([\w-]+)$/, (m) => viewProductForm(m[1])],
  [/^#\/customer$/, viewCustomers],
  [/^#\/customer\/([\w-]+)$/, (m) => viewCustomerDetail(m[1])],
  [/^#\/saya$/, viewSettings],
];
const TAB_ROOTS = ['#/beranda', '#/pesanan', '#/produk', '#/customer', '#/saya'];
async function route() {
  closeSheet();
  view.onclick = null;
  const h = location.hash || '#/beranda';
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) {
      try { await fn(m); } catch (e) { console.error(e); view.innerHTML = `<div class="empty"><div class="big">⚠️</div>Terjadi kesalahan: ${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.replace('#/beranda');
}

/* ================= Boot ================= */
async function boot() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
  await loadSettings();
  renderChrome();
  window.addEventListener('hashchange', route);
  const App = plugin('App');
  if (App) {
    App.addListener('backButton', () => {
      if ($('.lightbox')) return $('.lightbox').remove();
      if (sheet.open) return closeSheet();
      const h = location.hash || '#/beranda';
      if (h === '#/beranda') return App.exitApp();
      if (TAB_ROOTS.includes(h)) return location.replace('#/beranda');
      history.back();
    });
  }
  document.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type=file]), textarea, select')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea, select')) document.body.classList.remove('typing'); }, 50));
  if (!location.hash) location.replace('#/beranda');
  await route();
  ensureRate(S.currency).then(renderChrome).catch(() => {});
}
boot();
})();
