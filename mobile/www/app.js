/* KuyTitip v4 — aplikasi admin jastip (Supabase + cache offline di HP) */
(() => {
'use strict';

/* ================= Utilities ================= */
const CFG = window.KT_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const view = $('#view');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/\s/g, '').replace(/^Rp/i, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');      // 1.250,5 → 1250.5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 1.500.000 → 1500000
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};
/* Input angka biaya: pemisah ribuan otomatis (1.250.000), desimal pakai koma */
const fmtMoneyVal = (v, dec = 0) => (v === '' || v == null || String(v).trim() === '') ? '' : num(v).toLocaleString('id-ID', { maximumFractionDigits: dec });
function formatMoneyLive(el) {
  const dec = +(el.dataset.dec || 0);
  let raw = el.value;
  if (dec && /\.$/.test(raw) && !raw.includes(',')) raw = raw.slice(0, -1) + ',';
  const caret = el.selectionStart ?? raw.length;
  const digitsBefore = raw.slice(0, caret).replace(/[^\d,]/g, '').length;
  let s = raw.replace(/[^\d,]/g, '');
  let [i, ...rest] = s.split(',');
  i = i.replace(/^0+(?=\d)/, '');
  let out = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (dec && s.includes(',')) out += ',' + rest.join('').slice(0, dec);
  if (out === raw) return;
  el.value = out;
  let pos = 0, seen = 0;
  while (pos < out.length && seen < digitsBefore) { if (/[\d,]/.test(out[pos])) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (e) { /* type tidak mendukung */ }
}
function formatMoneyInputs(root = document) {
  $$('input[data-money]', root).forEach((el) => { el.value = fmtMoneyVal(el.value, +(el.dataset.dec || 0)); });
}
// Format ulang angka setiap kali isi layar diganti (termasuk render ulang tanpa pindah halaman)
new MutationObserver((muts) => { if (muts.some((m) => m.addedNodes.length)) formatMoneyInputs(view); }).observe(view, { childList: true });
(() => {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true, enumerable: desc.enumerable, get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, this.dataset && this.dataset.money !== undefined && typeof v === 'number' ? fmtMoneyVal(v, +(this.dataset.dec || 0)) : v); },
  });
})();
const NO_DEC = new Set(['IDR', 'JPY', 'KRW', 'VND']);
const fmtIDR = (n) => 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
const fmtCur = (n, cur) => cur === 'IDR' ? fmtIDR(n)
  : `${cur} ${num(n).toLocaleString('id-ID', { maximumFractionDigits: NO_DEC.has(cur) ? 0 : 2 })}`;
const fmtRate = (r) => num(r).toLocaleString('id-ID', { maximumFractionDigits: r < 10 ? 4 : 2 });
const fmtDate = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateTime = (t) => t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
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
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  const d = new Date();
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${s}`;
}
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
const fmtPhone = (p) => { const d = normPhone(p); return d ? '+' + d : ''; };

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
  ['menunggu', 'Menunggu konfirmasi'], ['baru', 'Baru'], ['dibeli', 'Sudah dibeli'],
  ['dikirim', 'Dikirim'], ['selesai', 'Selesai'], ['batal', 'Batal'],
];
const statusLabel = (s) => (STATUSES.find((x) => x[0] === s) || STATUSES[1])[1];
const SOURCES = { admin: 'Admin', wa: 'WhatsApp', web: 'Web' };
const ROLES = [['owner', 'Owner'], ['order', 'Admin order'], ['shopper', 'Shopper / packing'], ['pending', 'Menunggu persetujuan'], ['disabled', 'Nonaktif']];
const roleLabel = (r) => (ROLES.find((x) => x[0] === r) || [r, r])[1];
const PAY_METHODS = ['Transfer', 'QRIS', 'Tunai', 'Lainnya'];

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ================= Local storage (IndexedDB = cache offline) ================= */
const STORES = ['kv', 'customers', 'products', 'orders', 'payments', 'photos', 'admins', 'events'];
const DATA_TABLES = ['events', 'products', 'customers', 'orders', 'payments'];
let dbp;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kuytitip', 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
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
const DB = {
  all: (s) => tx(s, 'readonly', (st) => req(st.getAll())),
  get: (s, id) => tx(s, 'readonly', (st) => req(st.get(id))),
  put: (s, v) => tx(s, 'readwrite', (st) => req(st.put(v))),
  add: (s, v) => tx(s, 'readwrite', (st) => req(st.add(v))),
  del: (s, id) => tx(s, 'readwrite', (st) => req(st.delete(id))),
  clear: (s) => tx(s, 'readwrite', (st) => req(st.clear())),
  putMany: (s, arr) => tx(s, 'readwrite', (st) => { arr.forEach((v) => st.put(v)); }),
  delMany: (s, ids) => tx(s, 'readwrite', (st) => { ids.forEach((id) => st.delete(id)); }),
};
const kvGet = async (k) => { const r = await DB.get('kv', k); return r ? r.v : undefined; };
const kvPut = (k, v) => DB.put('kv', { id: k, v });

/* ================= Supabase client ================= */
const supa = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kt-auth', detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
let ME = null; // { id, name, role, email }
const isOwner = () => ME?.role === 'owner';
const canSell = () => ['owner', 'order'].includes(ME?.role);
const isShopper = () => ME?.role === 'shopper';

/* ================= Settings (bersama = di server, lokal = di HP) ================= */
const DEFAULT_TEMPLATE =
`Halo Kak {nama} 👋
Berikut rincian titipan *#{kode}*{trip}:

{rincian}

Subtotal barang: {subtotal}
Ongkir: {ongkir}
*Total: {total}*
Sudah dibayar: {dibayar}
*Sisa tagihan: {sisa}*

Cek status pesanan: {lacak}

Terima kasih sudah titip di {usaha} 🙏`;

const DEFAULT_SHARED = {
  business: 'KuyTitip', ownerWa: '', trip: '', currency: 'THB',
  fee: { type: 'percent', value: 10 }, shipPerKg: 0, rounding: 1000, lockedRates: {},
  template: DEFAULT_TEMPLATE, poOpen: true, poDeadline: '', poNote: '', webUrl: CFG.webUrl || '',
};
let S = { ...DEFAULT_SHARED };       // pengaturan bersama (diatur owner)
let L = { rates: {} };               // kurs live yang di-cache HP ini
function applyShared(data) {
  S = { ...DEFAULT_SHARED, ...(data || {}) };
  S.fee = { ...DEFAULT_SHARED.fee, ...(S.fee || {}) };
  S.lockedRates = S.lockedRates || {};
  if (!S.template) S.template = DEFAULT_TEMPLATE;
  if (!S.webUrl) S.webUrl = CFG.webUrl || '';
}
async function loadLocalSettings() {
  applyShared(await kvGet('shared'));
  L = { rates: {}, ...((await kvGet('local')) || {}) };
}
const saveLocal = () => kvPut('local', L);
async function saveShared() {
  const data = { ...S };
  await kvPut('shared', data);
  await Sync.enqueue({ table: 'settings', kind: 'upsert', id: 'main', row: { id: 'main', data } });
  renderChrome();
}

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
      if (rate > 0) { L.rates[cur] = { rate, at: Date.now(), src }; await saveLocal(); renderChrome(); return rate; }
    } catch (e) { /* coba sumber berikutnya */ }
  }
  throw new Error('Kurs gagal diambil — cek koneksi internet');
}
/* ================= Event jastip (Bangkok, Australia, Jepang, ...) ================= */
let EVENTS = [];
let CUR_EV = '';
const EV_STATUS = [['draft', 'Draft (belum tampil)'], ['open', 'PO dibuka'], ['closed', 'PO ditutup'], ['done', 'Selesai (arsip)']];
const evStatusLabel = (st) => (EV_STATUS.find((x) => x[0] === st) || EV_STATUS[0])[1];
async function loadEvents() {
  EVENTS = (await DB.all('events')).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
    || ['open', 'closed', 'draft', 'done'].indexOf(a.status) - ['open', 'closed', 'draft', 'done'].indexOf(b.status)
    || num(a.sort) - num(b.sort) || (a.name || '').localeCompare(b.name || ''));
}
const evById = (id) => EVENTS.find((e) => e.id === id);
const activeEvents = () => EVENTS.filter((e) => e.status !== 'done');
const curEv = () => evById(CUR_EV) || EVENTS.find((e) => e.status === 'open') || activeEvents()[0] || EVENTS[0] || null;
async function setCurEv(id) { CUR_EV = id; await kvPut('curEvent', id); renderChrome(); }
function evCfg(ev) {
  ev = ev === undefined ? curEv() : ev;
  if (!ev) return { currency: S.currency || 'THB', fee: { ...S.fee }, shipPerKg: num(S.shipPerKg), rounding: num(S.rounding) };
  return { currency: ev.currency || 'THB', fee: { type: ev.feeType || 'percent', value: num(ev.feeValue) }, shipPerKg: num(ev.shipPerKg), rounding: num(ev.rounding) };
}
const evLabel = (ev) => ev ? `${ev.flag ? ev.flag + ' ' : ''}${ev.name}` : 'Tanpa event';
const evChips = (sel, attr = 'data-evf', withAll = true) => `<div class="chips">${withAll ? `<button class="chip ${!sel ? 'on' : ''}" ${attr}="">Semua event</button>` : ''}${activeEvents().map((e) =>
  `<button class="chip ${e.id === sel ? 'on' : ''}" ${attr}="${e.id}">${esc(evLabel(e))}</button>`).join('')}</div>`;
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtRangeD(a, b) {
  const d = (x) => { const t = new Date(x + 'T00:00:00'); return `${t.getDate()} ${MONTHS_ID[t.getMonth()]} ${t.getFullYear()}`; };
  if (a && b) return `${d(a)} – ${d(b)}`;
  return a ? `mulai ${d(a)}` : b ? `s/d ${d(b)}` : '';
}
function eventCode(ev) { return (ev && ev.code ? ev.code.toUpperCase() + '-' : '') + newCode(); }
const lockedRate = (cur, ev) => {
  ev = ev || curEv();
  if (ev && ev.currency === cur && num(ev.lockedRate)) return num(ev.lockedRate);
  const other = EVENTS.find((e) => e.currency === cur && num(e.lockedRate) && e.status === 'open');
  return other ? num(other.lockedRate) : num(S.lockedRates && S.lockedRates[cur]);
};
const rateOf = (cur) => cur === 'IDR' ? 1 : (lockedRate(cur) || num(L.rates[cur] && L.rates[cur].rate));
async function ensureRate(cur, maxAgeH = 6) {
  if (cur === 'IDR') return 1;
  if (lockedRate(cur)) return lockedRate(cur);
  const r = L.rates[cur];
  if (r && Date.now() - r.at < maxAgeH * 3600e3) return r.rate;
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
const itemSellIDR = (it) => it.sellCur === 'IDR' || !it.sellCur ? num(it.sellPrice)
  : (num(it.sellIDR) || num(it.sellPrice) * rateOf(it.sellCur));
const liveSellIDR = (it) => it.sellCur === 'IDR' || !it.sellCur ? num(it.sellPrice) : num(it.sellPrice) * rateOf(it.sellCur);
function orderTotals(o, paid = 0) {
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
  paid = num(paid);
  return { qty, subtotal, shipping, discount, total, paid, due: Math.max(0, total - paid), modal, profit: subtotal - discount - modal };
}
async function paidMap() {
  const m = {};
  (await DB.all('payments')).forEach((p) => { if (!p.deleted) m[p.orderId] = (m[p.orderId] || 0) + num(p.amount); });
  return m;
}
async function paidOf(orderId) {
  return (await DB.all('payments')).filter((p) => p.orderId === orderId && !p.deleted).reduce((a, p) => a + num(p.amount), 0);
}

/* ================= Row mapping (HP ⇄ database) ================= */
const MAP = {
  products: [['id', 'id'], ['name', 'name', 'str'], ['brand', 'brand', 'str'], ['description', 'description', 'str'],
    ['buyPrice', 'buy_price', 'num'], ['buyCur', 'buy_cur', 'cur'], ['sellPrice', 'sell_price', 'num'], ['weight', 'weight', 'num'],
    ['photo', 'photo', 'nul'], ['note', 'note', 'str'], ['published', 'published', 'bool'], ['sort', 'sort', 'int'], ['createdAt', 'created_at', 'ts'],
    ['category', 'category', 'str'], ['events', 'events', 'arr'], ['badge', 'badge', 'str'], ['featured', 'featured', 'boolf']],
  customers: [['id', 'id'], ['name', 'name', 'str'], ['phone', 'phone', 'str'], ['city', 'city', 'str'], ['address', 'address', 'str'],
    ['note', 'note', 'str'], ['createdAt', 'created_at', 'ts']],
  orders: [['id', 'id'], ['code', 'code', 'str'], ['customerId', 'customer_id', 'nul'], ['trip', 'trip', 'str'], ['status', 'status', 'str'],
    ['source', 'source', 'src'], ['items', 'items', 'json'], ['receipts', 'receipts', 'json'], ['shipping', 'shipping', 'num0'],
    ['discount', 'discount', 'num0'], ['subtotal', 'subtotal', 'num0'], ['total', 'total', 'num0'], ['note', 'note', 'str'],
    ['pic', 'pic', 'nul'], ['picName', 'pic_name', 'nul'], ['createdAt', 'created_at', 'ts'], ['eventId', 'event_id', 'nul']],
  events: [['id', 'id'], ['code', 'code', 'str'], ['name', 'name', 'str'], ['title', 'title', 'str'], ['country', 'country', 'str'],
    ['flag', 'flag', 'str'], ['currency', 'currency', 'cur'], ['lockedRate', 'locked_rate', 'num'], ['feeType', 'fee_type', 'str'],
    ['feeValue', 'fee_value', 'num0'], ['shipPerKg', 'ship_per_kg', 'num0'], ['rounding', 'rounding', 'num0'], ['poStart', 'po_start', 'date'],
    ['poEnd', 'po_end', 'date'], ['eta', 'eta', 'str'], ['note', 'note', 'str'], ['tagline', 'tagline', 'str'], ['color', 'color', 'str'],
    ['banner', 'banner', 'nul'], ['status', 'status', 'str'], ['sort', 'sort', 'int'], ['createdAt', 'created_at', 'ts']],
  payments: [['id', 'id'], ['orderId', 'order_id', 'str'], ['amount', 'amount', 'num0'], ['method', 'method', 'str'],
    ['note', 'note', 'str'], ['createdAt', 'created_at', 'ts']],
};
function toRow(table, o) {
  const row = {};
  for (const [l, r, t] of MAP[table]) {
    let v = o[l];
    if (t === 'str') v = v == null ? '' : String(v);
    else if (t === 'nul') v = v === '' || v == null ? null : v;
    else if (t === 'num') v = v == null || String(v).trim() === '' ? null : num(v);
    else if (t === 'num0') v = num(v);
    else if (t === 'int') v = Math.round(num(v));
    else if (t === 'bool') v = v !== false;
    else if (t === 'boolf') v = !!v;
    else if (t === 'arr') v = Array.isArray(v) ? v : [];
    else if (t === 'date') v = v ? String(v).slice(0, 10) : null;
    else if (t === 'json') v = Array.isArray(v) ? v : [];
    else if (t === 'ts') v = new Date(v || Date.now()).toISOString();
    else if (t === 'cur') v = v || 'THB';
    else if (t === 'src') v = ['admin', 'wa', 'web'].includes(v) ? v : 'admin';
    row[r] = v;
  }
  row.deleted = !!o.deleted;
  return row;
}
function fromRow(table, r) {
  const o = {};
  for (const [l, k, t] of MAP[table]) {
    let v = r[k];
    if (t === 'ts') v = Date.parse(v) || Date.now();
    else if (t === 'num') v = v == null ? '' : v;
    else if (t === 'json' || t === 'arr') v = Array.isArray(v) ? v : [];
    else if (t === 'nul' || t === 'date') v = v ?? '';
    else if (t === 'boolf') v = !!v;
    o[l] = v;
  }
  o.updatedAt = Date.parse(r.updated_at) || 0;
  o.updatedByName = r.updated_by_name || '';
  o.deleted = !!r.deleted;
  if (table === 'orders') o.trackToken = r.track_token || '';
  return o;
}

/* ================= Sinkronisasi ================= */
const Sync = {
  online: navigator.onLine, flushing: false, pulling: false, lastSync: 0, pending: 0, failed: 0, realtime: 'off',
  async enqueue(op) {
    if (op.kind === 'upsert') {
      const old = (await DB.all('outbox')).filter((x) => x.table === op.table && x.id === op.id && x.kind === 'upsert' && !x.failed);
      if (old.length) await DB.delMany('outbox', old.map((x) => x.seq));
    }
    op.at = Date.now();
    await DB.add('outbox', op);
    this.updateStatus();
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 300);
  },
  isTransient(err) {
    if (!err) return false;
    const m = String(err.message || err.error_description || err.error || err);
    if (!navigator.onLine) return true;
    if (/fetch|network|timeout|load failed|aborted|ECONN|socket/i.test(m)) return true;
    if (/jwt|PGRST30/i.test(m + ' ' + (err.code || ''))) return true;
    const st = num(err.status || err.statusCode);
    return st >= 500 || st === 401 || st === 429;
  },
  async run(op) {
    try {
      let error;
      if (op.table === 'photo') {
        const p = await DB.get('photos', op.id);
        if (!p || !p.data) return 'ok';
        const blob = await (await fetch(p.data)).blob();
        ({ error } = await supa.storage.from('photos').upload(op.id + '.jpg', blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }));
        if (error && (/exist|duplicate/i.test(error.message || '') || String(error.statusCode) === '409')) error = null;
        if (!error) { p.uploaded = true; await DB.put('photos', p); }
      } else if (op.kind === 'upsert') {
        ({ error } = await supa.from(op.table).upsert(op.row, { onConflict: 'id' }));
      } else if (op.kind === 'insert') {
        ({ error } = await supa.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true }));
      } else if (op.kind === 'update') {
        ({ error } = await supa.from(op.table).update(op.patch).eq('id', op.id));
      }
      if (!error) return 'ok';
      if (this.isTransient(error)) return 'retry';
      if (op.table === 'orders' && error.code === '23505' && /code/i.test(error.message || '')) {
        const o = await DB.get('orders', op.id);
        const code = newCode();
        if (o) { o.code = code; await DB.put('orders', o); }
        op.row.code = code;
        return this.run(op);
      }
      return error.message || 'Gagal disimpan';
    } catch (e) {
      return this.isTransient(e) || /fetch/i.test(String(e)) ? 'retry' : String(e.message || e);
    }
  },
  async flush() {
    if (this.flushing || !supa || !ME) return false;
    this.flushing = true;
    let progressed = false;
    try {
      const ops = await DB.all('outbox');
      for (const op of ops) {
        if (op.failed) continue;
        const res = await this.run(op);
        if (res === 'ok') { await DB.del('outbox', op.seq); progressed = true; this.online = true; }
        else if (res === 'retry') { if (!navigator.onLine) this.online = false; break; }
        else { op.failed = true; op.error = res; await DB.put('outbox', op); toast('Gagal sinkron: ' + res, 4000); }
      }
    } finally {
      this.flushing = false;
      this.updateStatus();
    }
    return progressed;
  },
  async applyRemote(table, rows, pendingIds) {
    const puts = [], dels = [];
    for (const r of rows) {
      if (pendingIds && pendingIds.has(table + ':' + r.id)) continue;
      if (r.deleted) dels.push(r.id); else puts.push(fromRow(table, r));
    }
    if (puts.length) await DB.putMany(table, puts);
    if (dels.length) await DB.delMany(table, dels);
    return puts.length + dels.length;
  },
  async pendingIds() {
    return new Set((await DB.all('outbox')).map((o) => o.table + ':' + o.id));
  },
  async pull({ full = false } = {}) {
    if (this.pulling || !supa || !ME) return 0;
    this.pulling = true;
    let changed = 0;
    try {
      const lp = full ? {} : ((await kvGet('lastPull')) || {});
      const pending = await this.pendingIds();
      for (const t of DATA_TABLES) {
        let from = 0; let max = lp[t];
        const page = 500;
        for (;;) {
          let q = supa.from(t).select('*').order('updated_at', { ascending: true }).range(from, from + page - 1);
          if (lp[t]) q = q.gt('updated_at', new Date(Date.parse(lp[t]) - 120000).toISOString());
          const { data, error } = await q;
          if (error) throw error;
          changed += await this.applyRemote(t, data, pending);
          if (data.length) { const last = data[data.length - 1].updated_at; if (!max || Date.parse(last) > Date.parse(max)) max = last; }
          if (data.length < page) break;
          from += page;
        }
        if (max) lp[t] = max;
      }
      const { data: st, error: e2 } = await supa.from('settings').select('*').eq('id', 'main').maybeSingle();
      if (e2) throw e2;
      if (st && !pending.has('settings:main')) { applyShared(st.data); await kvPut('shared', S); }
      const { data: ad, error: e3 } = await supa.from('admins').select('id,name,role,email');
      if (e3) throw e3;
      if (ad) {
        await DB.clear('admins'); await DB.putMany('admins', ad);
        const mine = ad.find((a) => a.id === ME.id);
        if (mine && (mine.role !== ME.role || mine.name !== ME.name)) {
          const roleChanged = mine.role !== ME.role;
          ME = mine; await kvPut('me', ME);
          if (roleChanged) {
            toast('Peran Anda sekarang: ' + roleLabel(ME.role), 4000);
            if (!['owner', 'order', 'shopper'].includes(ME.role)) { viewPending(); return changed; }
            changed++;
          }
        }
      }
      await kvPut('lastPull', lp);
      this.lastSync = Date.now();
      this.online = true;
    } catch (e) {
      if (this.isTransient(e)) this.online = false;
      throw e;
    } finally {
      this.pulling = false;
      this.updateStatus();
    }
    return changed;
  },
  subscribe() {
    if (!supa || this.channel) return;
    this.channel = supa.channel('kt-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => this.onRemote(payload))
      .subscribe((status) => { this.realtime = status === 'SUBSCRIBED' ? 'on' : 'off'; this.updateStatus(); });
  },
  async onRemote(payload) {
    const t = payload.table; const r = payload.new;
    if (!r || !r.id) return;
    const pending = await this.pendingIds();
    if (t === 'settings') { if (pending.has('settings:main')) return; applyShared(r.data); await kvPut('shared', S); }
    else if (t === 'admins') { await DB.put('admins', r); if (r.id === ME?.id && r.role !== ME.role) { this.pull().catch(() => {}); } }
    else if (DATA_TABLES.includes(t)) { if (!(await this.applyRemote(t, [r], pending))) return; }
    else return;
    this.lastSync = Date.now();
    onDataChanged(t);
  },
  async sync() {
    await this.flush();
    try { const c = await this.pull(); if (c) onDataChanged('*'); } catch (e) { /* offline */ }
  },
  start() {
    if (this.started) return;
    this.started = true;
    this.subscribe();
    window.addEventListener('online', () => { this.online = true; this.sync(); });
    window.addEventListener('offline', () => { this.online = false; this.updateStatus(); });
    setInterval(() => this.sync(), 60000);
    const App = plugin('App');
    if (App) App.addListener('appStateChange', (s) => { if (s.isActive) this.sync(); });
  },
  async updateStatus() {
    const ops = await DB.all('outbox');
    this.pending = ops.filter((o) => !o.failed).length;
    this.failed = ops.filter((o) => o.failed).length;
    const b = $('#syncBtn');
    if (!b || !ME) return;
    b.hidden = false;
    const off = !navigator.onLine || !this.online;
    b.className = 'sync-chip ' + (this.failed ? 'err' : off ? 'off' : this.pending ? 'pending' : 'ok');
    $('.txt', b).textContent = this.failed ? `${this.failed} gagal` : off ? 'Offline' : this.pending ? `${this.pending} antre` : 'Sinkron';
  },
};

/* Simpan & hapus data: tulis ke HP dulu, lalu antre untuk dikirim ke server */
async function saveRow(table, obj) {
  await DB.put(table, obj);
  await Sync.enqueue({ table, kind: 'upsert', id: obj.id, row: toRow(table, obj) });
}
async function removeRow(table, obj) {
  obj.deleted = true;
  await Sync.enqueue({ table, kind: 'upsert', id: obj.id, row: toRow(table, obj) });
  await DB.del(table, obj.id);
}
async function addPayment(p) {
  await DB.put('payments', p);
  await Sync.enqueue({ table: 'payments', kind: 'insert', id: p.id, row: toRow('payments', p) });
}
function finalizeOrder(o) {
  (o.items || []).forEach((it) => {
    it.qty = num(it.qty);
    it.rate = itemRate(it) || '';
    it.sellIDR = liveSellIDR(it) || num(it.sellIDR);
  });
  const t = orderTotals(o);
  o.subtotal = t.subtotal; o.total = t.total;
  return o;
}

/* Rerender saat ada perubahan dari admin lain */
let FORM_OPEN = false;
async function onDataChanged() {
  await loadEvents();
  updateBadge();
  renderChrome();
  if (FORM_OPEN) { toast('Ada perubahan dari admin lain'); return; }
  if (sheet.open || !ME || document.body.classList.contains('noauth')) return;
  clearTimeout(onDataChanged._t);
  onDataChanged._t = setTimeout(() => {
    const y = window.scrollY;
    route({ keepScroll: true }).then(() => window.scrollTo(0, y));
  }, 500);
}
async function updateBadge() {
  const n = (await DB.all('orders')).filter((o) => o.status === 'menunggu').length;
  const b = $('#orderBadge');
  b.hidden = !n || isShopper();
  b.textContent = n;
}

/* ================= Photos ================= */
const photoCache = new Map();
const photoUrl = (id) => /^https?:|^data:/.test(id) ? id : `${CFG.supabaseUrl}/storage/v1/object/public/photos/${encodeURIComponent(id)}.jpg`;
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
    await DB.put('photos', { id, data, uploaded: false });
    photoCache.set(id, data);
    await Sync.enqueue({ table: 'photo', kind: 'upload', id });
    ids.push(id);
  }
  return ids;
}
async function hydratePhotos(root = view) {
  for (const img of $$('img[data-pid]', root)) {
    const id = img.dataset.pid;
    if (!id) continue;
    let d = photoCache.get(id);
    if (!d && !/^https?:/.test(id)) { const p = await DB.get('photos', id); d = p && p.data; if (d) photoCache.set(id, d); }
    img.onerror = () => {
      img.onerror = null;
      if (img.classList.contains('thumb')) { const d = document.createElement('div'); d.className = 'thumb'; d.textContent = '📦'; img.replaceWith(d); }
      else { img.removeAttribute('src'); img.style.background = 'var(--bg-2)'; }
    };
    img.src = d || photoUrl(id);
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
  `<div class="photo"><img data-pid="${esc(id)}" data-zoom alt="">${removable ? `<button type="button" data-rm-photo="${esc(id)}" aria-label="Hapus foto">✕</button>` : ''}</div>`).join('');
const photoAdd = (key, label = 'Galeri') =>
  `<label class="photo-add">📷<br>Kamera<input type="file" accept="image/*" capture="environment" data-add-photo="${key}"></label>` +
  `<label class="photo-add">🖼️<br>${label}<input type="file" accept="image/*" multiple data-add-photo="${key}"></label>`;
const thumbOf = (it) => (it.photos && it.photos[0]) || it.productPhoto || '';
const thumbHTML = (pid, zoom) => pid ? `<img class="thumb" data-pid="${esc(pid)}" ${zoom ? 'data-zoom' : ''} alt="">` : '<div class="thumb">📦</div>';

/* ================= Sheet (bottom dialog) ================= */
const sheet = $('#sheet');
function openSheet(html, onMount) {
  sheet.innerHTML = `<div class="sheet-inner">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };
  sheet.onclose = null;
  onMount && onMount(sheet);
  formatMoneyInputs(sheet);
}
function closeSheet() { if (sheet.open) sheet.close(); }
function confirmSheet(msg, okLabel = 'Ya, lanjut', danger = true, sub = '') {
  return new Promise((res) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; res(v); } };
    openSheet(`<h3>${esc(msg)}</h3>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}<div class="btn-col">
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>
      <button class="btn ghost" data-no>Batal</button></div>`, (s) => {
      $('[data-ok]', s).onclick = () => { fin(true); closeSheet(); };
      $('[data-no]', s).onclick = () => { fin(false); closeSheet(); };
      s.onclose = () => fin(false);
    });
  });
}

/* ================= External / WhatsApp ================= */
function openExternal(url) {
  if (isNative()) window.location.href = url;
  else window.open(url, '_blank');
}
function openWA(phone, text) {
  openExternal(`https://wa.me/${normPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
}
async function shareText(title, text) {
  const Share = plugin('Share');
  try {
    if (Share) return await Share.share({ title, text, dialogTitle: title });
    if (navigator.share) return await navigator.share({ title, text });
  } catch (e) { return; }
  try { await navigator.clipboard.writeText(text); toast('Teks disalin ke clipboard'); } catch (e) { toast('Tidak bisa menyalin'); }
}
const webBase = () => { const u = S.webUrl || CFG.webUrl || ''; return u && !u.endsWith('/') ? u + '/' : u; };
const trackLink = (o) => o.trackToken && webBase() ? `${webBase()}lacak.html?k=${encodeURIComponent(o.code)}&t=${encodeURIComponent(o.trackToken)}` : '';

/* ================= Chrome (header/tabbar) ================= */
function renderChrome() {
  $('#brandName').textContent = S.business || 'KuyTitip';
  const chip = $('#rateChip');
  const ev = curEv();
  const cur = evCfg(ev).currency;
  const r = rateOf(cur);
  if (ME && ev) {
    chip.hidden = false;
    chip.textContent = `${ev.flag || '✈️'} ${ev.code || ev.name}${cur !== 'IDR' && r ? ` · ${lockedRate(cur, ev) ? '🔒' : ''}${fmtIDR(r)}` : ''}`;
    chip.title = cur !== 'IDR' && r ? `1 ${cur} = ${fmtIDR(r)} — ketuk untuk ganti event` : 'Ketuk untuk ganti event';
  } else chip.hidden = true;
}
function setTab(tab) { $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab)); }

/* ================= Login / pending ================= */
function viewLogin(mode = 'login', msg = '') {
  document.body.classList.add('noauth');
  FORM_OPEN = false;
  if (!supa) {
    view.innerHTML = `<div class="auth-wrap"><div class="alert err">Konfigurasi Supabase tidak ditemukan (config.js).</div></div>`;
    return;
  }
  const signup = mode === 'signup';
  view.innerHTML = `<div class="auth-wrap">
    <div class="auth-logo"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M10 12a2 2 0 0 0 4 0"/></svg></div>
    <h1 class="page-title center">${esc(S.business || 'KuyTitip')}</h1>
    <p class="page-sub center">${signup ? 'Daftar sebagai admin baru. Owner perlu menyetujui akun Anda.' : 'Masuk sebagai admin'}</p>
    ${msg ? `<div class="alert ${/berhasil/i.test(msg) ? 'ok' : 'err'}">${esc(msg)}</div>` : ''}
    <form class="card" id="authForm">
      ${signup ? `<div class="field"><label class="req">Nama</label><input class="input" id="aName" autocomplete="name" required></div>` : ''}
      <div class="field"><label class="req">Email</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
      <div class="field"><label class="req">Password</label><input class="input" id="aPass" type="password" minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        ${signup ? '<div class="help">Minimal 6 karakter.</div>' : ''}</div>
      <button class="btn primary" id="aSubmit" type="submit">${signup ? 'Daftar' : 'Masuk'}</button>
    </form>
    <button class="btn ghost" id="aToggle">${signup ? 'Sudah punya akun? Masuk' : 'Admin baru? Daftar di sini'}</button>
  </div>`;
  $('#aToggle').onclick = () => viewLogin(signup ? 'login' : 'signup');
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#aEmail').value.trim(); const password = $('#aPass').value;
    const btn = $('#aSubmit'); btn.disabled = true; btn.textContent = 'Memproses…';
    try {
      if (signup) {
        const name = $('#aName').value.trim();
        const { data, error } = await supa.auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw error;
        if (!data.session) return viewLogin('login', 'Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk. (Owner bisa mematikan konfirmasi email di Supabase.)');
      } else {
        const { error } = await supa.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await afterAuth();
    } catch (err) {
      const m = String(err.message || err);
      const nice = /invalid login/i.test(m) ? 'Email atau password salah.'
        : /not confirmed/i.test(m) ? 'Email belum dikonfirmasi. Cek inbox Anda, atau minta owner mematikan konfirmasi email.'
        : /already registered|already exists/i.test(m) ? 'Email ini sudah terdaftar — silakan masuk.'
        : /fetch|network/i.test(m) ? 'Tidak ada koneksi internet. Login pertama butuh internet.'
        : m;
      viewLogin(mode, nice);
      $('#aEmail').value = email;
    }
  };
}
function viewPending(msg = '') {
  document.body.classList.add('noauth');
  const disabled = ME?.role === 'disabled';
  view.innerHTML = `<div class="auth-wrap">
    <h1 class="page-title center">${msg ? 'Belum bisa masuk' : disabled ? 'Akun dinonaktifkan' : 'Menunggu persetujuan'}</h1>
    ${msg ? `<div class="alert err">${esc(msg)}</div>` : `<div class="alert ${disabled ? 'err' : 'info'}">${disabled
      ? 'Akun Anda sudah dinonaktifkan oleh owner.'
      : `Halo ${esc(ME?.name || '')}, akun Anda sudah terdaftar. Minta owner membuka menu <b>Saya → Kelola admin</b> dan memberi Anda peran.`}</div>`}
    <div class="btn-col"><button class="btn primary" id="pRetry">Cek lagi</button><button class="btn ghost" id="pOut">Keluar</button></div></div>`;
  $('#pRetry').onclick = () => afterAuth();
  $('#pOut').onclick = () => logout();
}
async function logout() {
  const ops = (await DB.all('outbox')).length;
  if (ops && !(await confirmSheet(`${ops} perubahan belum terkirim ke server`, 'Tetap keluar', true, 'Perubahan itu akan hilang kalau Anda keluar sekarang.'))) return;
  try { await supa.auth.signOut(); } catch (e) { /* offline */ }
  for (const s of [...STORES, 'outbox']) await DB.clear(s);
  photoCache.clear(); ME = null;
  location.hash = '#/beranda';
  location.reload();
}

async function afterAuth() {
  if (!supa) return viewLogin();
  const { data: { session } } = await supa.auth.getSession();
  if (!session) return viewLogin();
  let me = await kvGet('me');
  if (me && me.id !== session.user.id) {
    for (const s of [...STORES, 'outbox']) if (s !== 'kv') await DB.clear(s);
    await DB.delMany('kv', ['me', 'lastPull']);
    me = null;
  }
  try {
    const { data, error } = await supa.from('admins').select('id,name,role,email').eq('id', session.user.id).maybeSingle();
    if (error) {
      if (/relation|does not exist|schema cache|PGRST20|42P01/i.test(`${error.message} ${error.code}`)) {
        return viewPending('Database Supabase belum disiapkan. Owner perlu menjalankan file supabase/schema.sql di SQL Editor.');
      }
      if (!Sync.isTransient(error)) throw error;
    }
    if (data) { me = data; await kvPut('me', me); }
    else if (!error) return viewPending('Data admin tidak ditemukan. Pastikan schema.sql sudah dijalankan sebelum mendaftar, lalu daftar ulang dengan email lain.');
  } catch (e) {
    if (!me) return viewLogin('login', 'Tidak bisa terhubung ke server: ' + (e.message || e));
  }
  if (!me) return viewLogin('login', 'Butuh internet untuk login pertama kali.');
  ME = me;
  if (!['owner', 'order', 'shopper'].includes(ME.role)) return viewPending();
  document.body.classList.remove('noauth');
  CUR_EV = (await kvGet('curEvent')) || '';
  await loadEvents();
  renderChrome();
  await migrateV1();
  Sync.updateStatus();
  Sync.start();
  if (!(await kvGet('lastPull'))) {
    view.innerHTML = `<div class="empty"><div class="big">⏳</div>Mengunduh data dari server…</div>`;
    await Sync.flush();
    try { await Sync.pull({ full: true }); } catch (e) { toast('Gagal mengambil data: ' + (e.message || e), 4000); }
    await loadEvents(); renderChrome();
  } else {
    Sync.pull().then((c) => { if (c) onDataChanged(); }).catch(() => {});
  }
  Sync.flush();
  updateBadge();
  if (!location.hash || location.hash === '#/') location.replace('#/beranda');
  await route();
  ensureRate(evCfg().currency).then(renderChrome).catch(() => {});
}

/* Data lama (versi 1, hanya di HP) → kirim ke server sekali saja */
async function migrateV1() {
  if (await kvGet('migratedV2')) return;
  const v1 = await DB.get('kv', 'settings');
  if (canSell()) {
    const [customers, products, orders, photos] = await Promise.all([DB.all('customers'), DB.all('products'), DB.all('orders'), DB.all('photos')]);
    for (const ph of photos) if (!ph.uploaded) await Sync.enqueue({ table: 'photo', kind: 'upload', id: ph.id });
    for (const c of customers) { c.phone = normPhone(c.phone); await saveRow('customers', c); }
    for (const p of products) { p.description = p.description || ''; if (p.published === undefined) p.published = true; await saveRow('products', p); }
    for (const o of orders) {
      if (num(o.paid) > 0) await addPayment({ id: 'pay_' + uid(), orderId: o.id, amount: num(o.paid), method: '', note: 'Data lama', createdAt: o.createdAt || Date.now() });
      delete o.paid;
      o.source = o.source || 'admin';
      finalizeOrder(o);
      await saveRow('orders', o);
    }
    if (customers.length + products.length + orders.length) toast(`Mengirim data lama (${orders.length} pesanan) ke server…`, 3500);
  }
  if (v1 && isOwner()) {
    const { id, rates, ...rest } = v1;
    if (rates) { L.rates = { ...rates, ...L.rates }; await saveLocal(); }
    try {
      const { data } = await supa.from('settings').select('data').eq('id', 'main').maybeSingle();
      applyShared({ ...(data ? data.data : S), ...rest });
    } catch (e) { applyShared({ ...S, ...rest }); }
    await saveShared();
  }
  if (v1) await DB.del('kv', 'settings');
  await kvPut('migratedV2', true);
}

/* ================= Mini charts (SVG) ================= */
const DONUT_STATUSES = [['menunggu', 'Menunggu', '#E5484D'], ['baru', 'Baru', '#3E63DD'], ['dibeli', 'Sudah dibeli', '#D97706'], ['dikirim', 'Dikirim', '#2B9A66'], ['selesai', 'Selesai', '#8E4EC6']];
function ringSVG(pct, size = 104) {
  const r = 42, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${v}% terbayar">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--accent-soft)" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>`;
}
function donutSVG(counts, size = 120) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const r = 40, c = 2 * Math.PI * r; let off = 0;
  const gap = counts.filter((x) => x > 0).length > 1 ? 1.6 : 0;
  const segs = counts.map((n, i) => {
    if (!n) return '';
    const len = c * n / total;
    const seg = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${DONUT_STATUSES[i][2]}" stroke-width="16"
      stroke-dasharray="${Math.max(0.1, len - gap).toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"><title>${DONUT_STATUSES[i][1]}: ${n}</title></circle>`;
    off += len; return seg;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Komposisi status pesanan">${segs}
    <text x="50" y="49" text-anchor="middle" font-size="16" font-weight="800" fill="var(--ink)">${counts.reduce((a, b) => a + b, 0)}</text>
    <text x="50" y="62" text-anchor="middle" font-size="7.5" fill="var(--ink-2)">pesanan</text></svg>`;
}
function lineSVG(labels, values) {
  const W = 320, H = 140, pl = 26, pr = 10, pt = 14, pb = 24;
  const max = Math.max(1, ...values); const step = (W - pl - pr) / Math.max(1, values.length - 1);
  const x = (i) => pl + i * step; const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Jumlah pesanan per hari">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(t) + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${t}</text>`).join('')}
    <polygon points="${x(0)},${y(0)} ${pts} ${x(values.length - 1)},${y(0)}" fill="url(#ga)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#fff" stroke="var(--accent)" stroke-width="2"/>`).join('')}
    ${labels.map((l, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--muted)">${l}</text>`).join('')}
    ${values.map((v, i) => `<rect data-tip="${labels[i]}: ${v} pesanan" data-x="${x(i)}" data-y="${y(v)}" x="${x(i) - step / 2}" y="0" width="${step}" height="${H}" fill="transparent"/>`).join('')}
  </svg>`;
}
function bindTip(box) {
  if (!box) return;
  const tip = $('.chart-tip', box); const svg = $('svg', box);
  const show = (t) => {
    const r = svg.getBoundingClientRect(); const k = r.width / 320;
    tip.textContent = t.dataset.tip; tip.style.left = (num(t.dataset.x) * k) + 'px'; tip.style.top = (num(t.dataset.y) * k) + 'px'; tip.style.opacity = 1;
  };
  $$('[data-tip]', box).forEach((t) => { t.addEventListener('mouseenter', () => show(t)); t.addEventListener('touchstart', () => show(t), { passive: true }); });
  box.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

/* ================= Views: Beranda + Kalkulator ================= */
const DEFAULT_CATEGORIES = [['Skincare', '🧴'], ['Vitamin & Suplemen', '💊'], ['Herbal & Wellness', '🌿'], ['Parfum', '🌸'], ['Fashion', '👕'],
  ['Tas & Aksesori', '👜'], ['Sepatu', '👟'], ['Makanan & Snack', '🍫'], ['Tumbler & Lifestyle', '🥤'], ['Anak & Bayi', '🧸']].map(([name, icon]) => ({ name, icon }));
const categories = () => (Array.isArray(S.categories) && S.categories.length ? S.categories : DEFAULT_CATEGORIES);
const catIcon = (n) => (categories().find((c) => c.name === n) || {}).icon || '🛍️';

function pickEventSheet() {
  if (!EVENTS.length) { if (isOwner()) location.hash = '#/event/baru'; else toast('Belum ada event jastip'); return; }
  openSheet(`<h3>Pilih event aktif</h3><p class="muted small" style="margin-top:-6px">Kalkulator, pesanan baru & daftar belanja memakai pengaturan event ini.</p>
    <div class="pick">${activeEvents().map((e) => `<button class="list-item" data-pick-ev="${e.id}">
      <div class="ev-flag">${esc(e.flag || '✈️')}</div><div style="flex:1;min-width:0"><div class="title">${esc(e.name)} <span class="muted small">${esc(e.code)}</span></div>
      <div class="sub">${esc(evStatusLabel(e.status))} · ${esc(e.currency)}${e.poStart || e.poEnd ? ' · ' + esc(fmtRangeD(e.poStart, e.poEnd)) : ''}</div></div>
      ${e.id === curEv()?.id ? '<span class="badge pay-lunas">Aktif</span>' : ''}</button>`).join('')}</div>
    <div class="btn-col">${isOwner() ? '<a class="btn" href="#/event" data-close>Kelola event</a>' : ''}<button class="btn ghost" data-close>Tutup</button></div>`, (sh) => {
    $$('[data-close]', sh).forEach((b) => b.addEventListener('click', closeSheet));
    $$('[data-pick-ev]', sh).forEach((b) => b.onclick = async () => { await setCurEv(b.dataset.pickEv); closeSheet(); toast('Event aktif: ' + evLabel(curEv())); route({ keepScroll: true }); });
  });
}

function eventHero(ev, extra = '') {
  if (!ev) return `<section class="ev-hero"><div class="ev-hero-in"><span class="ev-pill">EVENT</span><h1>Belum ada event</h1>
    <p>${isOwner() ? 'Buat event jastip pertama (mis. Bangkok, Jepang).' : 'Minta owner membuat event jastip.'}</p>${isOwner() ? '<a class="btn primary sm" href="#/event/baru" style="width:auto;margin-top:10px">+ Buat event</a>' : ''}</div></section>`;
  const bg = ev.banner ? `<div class="ev-hero-bg" style="background-image:url('${esc(photoUrl(ev.banner))}')"></div>` : `<div class="ev-hero-bg fb"></div><div class="ev-hero-flag">${esc(ev.flag || '✈️')}</div>`;
  return `<section class="ev-hero" style="--ev:${esc(ev.color || '#ef3b2d')}">${bg}<div class="ev-hero-fade"></div>
    <div class="ev-hero-in"><span class="ev-pill">${esc(ev.title || 'OPEN JASTIP')}</span>
      <h1${(ev.name || "").length > 12 ? " class=\"long\"" : ""}>${esc(ev.name)}</h1>
      <div class="ev-dates">${esc(fmtRangeD(ev.poStart, ev.poEnd) || 'Jadwal belum diisi')}</div>
      <div class="ev-meta"><span class="badge ${ev.status === 'open' ? 'pay-lunas' : ev.status === 'closed' ? 'st-dibeli' : 'st-batal'}">${esc(evStatusLabel(ev.status))}</span>
        <span>${esc(ev.currency)} · fee ${ev.feeType === 'flat' ? fmtIDR(ev.feeValue) : num(ev.feeValue) + '%'}</span></div>
      ${extra}</div></section>`;
}

async function viewHome() {
  setTab('beranda');
  const [allOrders, pm] = await Promise.all([DB.all('orders'), paidMap()]);
  const evSel = viewHome.ev ?? (curEv()?.id || '');
  const ev = evById(evSel);
  const orders = allOrders.filter((o) => !evSel || o.eventId === evSel || (!o.eventId && ev && o.trip === ev.name));
  const scope = orders.filter((o) => !['batal', 'menunggu'].includes(o.status));
  let omzet = 0, profit = 0, due = 0, aktif = 0;
  scope.forEach((o) => { const t = orderTotals(o, pm[o.id]); omzet += t.total; profit += t.profit; due += t.due; if (o.status !== 'selesai') aktif++; });
  const waiting = orders.filter((o) => o.status === 'menunggu').length;
  const toBuy = orders.filter((o) => ['baru', 'dibeli'].includes(o.status)).reduce((a, o) => a + (o.items || []).filter((i) => !i.bought).reduce((b, i) => b + num(i.qty), 0), 0);
  let qtyAll = 0, qtyBought = 0;
  scope.forEach((o) => (o.items || []).forEach((i) => { qtyAll += num(i.qty); if (i.bought || ['dikirim', 'selesai'].includes(o.status)) qtyBought += num(i.qty); }));
  const pct = qtyAll ? Math.round(qtyBought / qtyAll * 100) : 0;
  const paidAll = scope.reduce((a, o) => a + Math.min(num(pm[o.id]), orderTotals(o).total), 0);
  const payPct = omzet ? Math.round(paidAll / omzet * 100) : 0;
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
  const perDay = days.map((d) => orders.filter((o) => o.status !== 'batal' && o.createdAt >= d.getTime() && o.createdAt < d.getTime() + 864e5).length);
  const stCount = DONUT_STATUSES.map(([k]) => orders.filter((o) => o.status === k).length);
  const stTotal = stCount.reduce((a, b) => a + b, 0);
  const recent = orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const cmap = Object.fromEntries((await DB.all('customers')).map((x) => [x.id, x]));
  const cfgEv = ev || curEv();
  const cfg = evCfg(cfgEv);
  const c = { cur: cfg.currency || 'IDR', fee: { ...cfg.fee }, ship: cfg.shipPerKg, round: cfg.rounding };

  view.innerHTML = `
    <p class="eyebrow">Dashboard</p>
    <h1 class="page-title">Halo, ${esc(ME.name || 'Admin')} 👋</h1>
    <p class="page-sub">${esc(roleLabel(ME.role))} · ${activeEvents().filter((e) => e.status === 'open').length} event PO dibuka</p>
    ${waiting && !isShopper() ? `<a class="alert warn" href="#/pesanan?f=masuk">🔔 ${waiting} pesanan web menunggu konfirmasi →</a>` : ''}
    ${EVENTS.length ? evChips(evSel, 'data-evh') : ''}
    ${ev ? eventHero(ev) : !EVENTS.length ? eventHero(null) : ''}

    <section class="hero-red">
      <div class="lbl">Progres belanja${ev ? ' · ' + esc(ev.name) : ' · semua event'}</div>
      <div class="big">${pct}<small>%</small></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="mini">
        <div><b>${aktif}</b><span>Pesanan aktif</span></div>
        <div><b>${waiting}</b><span>Menunggu</span></div>
        <a href="#/belanja" style="color:inherit;text-decoration:none"><div><b>${toBuy}</b><span>Belum dibeli ›</span></div></a>
      </div>
    </section>

    ${isShopper() ? '' : `<div class="dash-grid">
      <section class="card"><div class="card-head"><h2>Omzet</h2></div>
        <div class="stat-value" style="font-size:clamp(1rem,4.6vw,1.25rem);font-weight:800;white-space:nowrap">${fmtIDR(omzet)}</div>
        <div class="muted small" style="margin-top:6px">Profit ≈ <b style="color:var(--ok)">${fmtIDR(profit)}</b></div>
        <div class="muted small" style="margin-top:2px">Belum dibayar <b style="color:var(--accent)">${fmtIDR(due)}</b></div></section>
      <section class="card"><div class="card-head"><h2>Pembayaran</h2></div>
        <div class="ring-wrap">${ringSVG(payPct)}<div class="ring-val">${payPct}%<small>terbayar</small></div></div></section>
    </div>`}

    <section class="card">
      <div class="card-head"><h2>Tren pesanan</h2><span class="muted small">7 hari terakhir</span></div>
      <div class="chart-box" id="trend">${lineSVG(days.map((d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })), perDay)}<div class="chart-tip"></div></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Status pesanan</h2><a href="#/pesanan?f=semua">Lihat semua</a></div>
      ${stTotal ? `<div class="donut-row"><div id="donut">${donutSVG(stCount)}</div>
        <div class="legend">${DONUT_STATUSES.map(([k, l, col], i) => `<div><i style="background:${col}"></i><span>${l}</span><b>${stCount[i]}</b><span class="small" style="flex:0 0 38px;text-align:right">${Math.round(stCount[i] / stTotal * 100)}%</span></div>`).join('')}</div></div>`
      : '<p class="muted">Belum ada pesanan.</p>'}
    </section>

    ${recent.length ? `<section class="card recent">
      <div class="card-head"><h2>Pesanan terbaru</h2><a href="#/pesanan">Lihat semua</a></div>
      ${recent.map((o) => { const cu = cmap[o.customerId]; const oe = evById(o.eventId); return `<a class="list-item" href="#/pesanan/${o.id}">
        <div class="avatar">${esc(oe?.flag || (cu?.name || '?').slice(0, 1).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><div class="title">${esc(cu?.name || 'Tanpa customer')}</div>
          <div class="sub">#${esc(o.code)} · ${statusLabel(o.status)} · ${fmtAgo(o.createdAt)}</div></div>
        ${o.status === 'menunggu' ? '<span class="dot-new" title="Baru masuk"></span>' : ''}
        ${isShopper() ? '' : `<div class="amount small">${fmtIDR(orderTotals(o, pm[o.id]).total)}</div>`}</a>`; }).join('')}
    </section>` : ''}

    <p class="eyebrow">Alat bantu</p>
    <h1 class="page-title">Kalkulator jastip</h1>
    <p class="page-sub">${cfgEv ? `Memakai pengaturan event <b>${esc(evLabel(cfgEv))}</b>.` : 'Hitung kurs dan fee jastip per item.'}${isOwner() && cfgEv ? ' Simpan untuk mengubah markup bawaan event ini.' : ''}</p>

    <section class="card" id="cDomestic" hidden>
      <h2>🇮🇩 Event dalam negeri</h2>
      <p class="hint">Belanja dalam Rupiah — tidak perlu kurs. Isi diskon toko/outlet bila ada, ongkir per kg untuk kurir ke kota buyer.</p>
      <button class="btn sm" type="button" id="cToForeign">Hitung dengan mata uang asing</button>
    </section>
    <section class="card" id="cKurs">
      <h2>Kurs</h2>
      <p class="hint">Kurs terkini diambil otomatis, bisa diganti manual.</p>
      <div class="field"><label>Mata uang belanja</label>
        <select class="input" id="cCur">${curOptions(c.cur, true)}</select></div>
      <div class="field"><label>Kurs ke IDR</label>
        <div class="row"><input class="input grow" id="cRate" data-money data-dec="4" inputmode="decimal" value="${rateOf(c.cur) || ''}" placeholder="mis. 487">
        <button class="btn sm" id="cRefresh" type="button">↻ Perbarui</button></div>
        <div class="help" id="cRateInfo"></div></div>
    </section>

    <section class="card">
      <h2>Fee jastip</h2>
      <p class="hint">Persen dihitung dari harga beli (sudah dalam Rupiah), atau langsung nilai flat per item.</p>
      <div class="field"><label>Jenis fee</label>
        <div class="seg" id="cFeeType"><button type="button" data-v="percent">Persen (%)</button><button type="button" data-v="flat">Flat (Rp)</button></div></div>
      <div class="field"><label id="cFeeLbl">Nilai fee</label><input class="input" id="cFee" data-money data-dec="2" inputmode="decimal" value="${c.fee.value}"></div>
      <div class="two">
        <div class="field"><label>Ongkir per kg (Rp)</label><input class="input" id="cShip" data-money inputmode="decimal" value="${c.ship || ''}" placeholder="0"></div>
        <div class="field"><label>Pembulatan ke atas</label>
          <select class="input" id="cRound">${[0, 500, 1000, 5000, 10000].map((v) => `<option value="${v}" ${v === num(c.round) ? 'selected' : ''}>${v ? fmtIDR(v) : 'Tanpa'}</option>`).join('')}</select></div>
      </div>
    </section>

    <section class="card">
      <h2>Coba hitung</h2>
      <div class="two">
        <div class="field"><label id="cBuyLbl">Harga beli</label><input class="input" id="cBuy" data-money data-dec="2" inputmode="decimal" placeholder="0"></div>
        <div class="field"><label>Berat (gram)</label><input class="input" id="cWeight" data-money inputmode="decimal" placeholder="0"></div>
      </div>
      <div class="field"><label>Diskon toko / outlet (%) <span class="muted">— opsional</span></label><input class="input" id="cDisc" data-money data-dec="2" inputmode="decimal" placeholder="mis. 30"></div>
      <div class="result" id="cResult"></div>
      ${isOwner() && cfgEv ? `<div class="toggle-row" style="margin-top:12px;padding-bottom:4px"><span>Kunci kurs untuk event ${esc(cfgEv.name)}</span>
        <label class="switch"><input type="checkbox" id="cLock" ${num(cfgEv.lockedRate) ? 'checked' : ''}><span></span></label></div>` : ''}
      <div class="btn-col" style="margin-top:14px">
        ${isOwner() && cfgEv ? `<button class="btn primary" id="cSave" type="button">Simpan sebagai markup bawaan ${esc(cfgEv.name)}</button>` : ''}
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
    const r = L.rates[c.cur];
    const lk = lockedRate(c.cur, cfgEv);
    el('cRateInfo').textContent = lk ? `🔒 Dikunci owner: ${fmtIDR(lk)}${r ? ` · kurs pasar ${fmtRate(r.rate)} (${fmtAgo(r.at)})` : ''}`
      : r ? `Sumber: ${r.src} · diperbarui ${fmtAgo(r.at)}` : 'Belum ada kurs — tekan Perbarui (butuh internet) atau isi manual.';
    el('cBuyLbl').textContent = c.cur === 'IDR' ? 'Harga label (Rp)' : `Harga beli (${c.cur})`;
    const dom = c.cur === 'IDR';
    el('cDomestic').hidden = !dom; el('cKurs').hidden = dom;
    if (dom) el('cRate').value = 1;
    if (el('cLock')) el('cLock').closest('.toggle-row').hidden = dom;
  };
  const recalc = () => {
    const rate = num(el('cRate').value);
    c.fee.value = num(el('cFee').value); c.ship = num(el('cShip').value); c.round = num(el('cRound').value);
    const disc = Math.min(100, Math.max(0, num(el('cDisc').value)));
    const buyNet = num(el('cBuy').value) * (1 - disc / 100);
    const r = calcSell({ buy: buyNet, rate, weightG: el('cWeight').value, fee: c.fee, shipPerKg: c.ship, rounding: c.round });
    c.last = r;
    el('cResult').innerHTML = `
      ${disc ? `<div class="line"><span>Setelah diskon ${disc.toLocaleString('id-ID')}%</span><b>${fmtCur(buyNet, c.cur)}</b></div>` : ''}
      <div class="line"><span>${c.cur === 'IDR' ? 'Modal' : `Modal (${esc(c.cur)} → IDR)`}</span><b>${fmtIDR(r.modal)}</b></div>
      <div class="line"><span>Fee jastip</span><b>${fmtIDR(r.fee)}</b></div>
      <div class="line"><span>Ongkir (berat)</span><b>${fmtIDR(r.ship)}</b></div>
      <div class="line total"><span>Harga jual</span><b>${fmtIDR(r.sell)}</b></div>`;
  };
  const refresh = async (force) => {
    if (c.cur === 'IDR') { info(); recalc(); return; }
    el('cRateInfo').textContent = 'Mengambil kurs…';
    try {
      if (force) await fetchRate(c.cur); else await ensureRate(c.cur);
      const v = force && !lockedRate(c.cur, cfgEv) ? L.rates[c.cur]?.rate : rateOf(c.cur);
      if (v) el('cRate').value = v; else toast('Kurs belum tersedia — isi manual');
    } catch (e) { toast(e.message); }
    info(); recalc();
  };
  setFeeType(c.fee.type); info(); recalc();
  $$('#cFeeType button').forEach((b) => b.onclick = () => { setFeeType(b.dataset.v); recalc(); });
  ['cFee', 'cShip', 'cBuy', 'cWeight', 'cRate', 'cDisc'].forEach((id) => el(id).oninput = recalc);
  el('cRound').onchange = recalc;
  el('cRate').onchange = async () => {
    const v = num(el('cRate').value);
    if (v > 0 && !lockedRate(c.cur, cfgEv)) { L.rates[c.cur] = { rate: v, at: Date.now(), src: 'manual' }; await saveLocal(); info(); renderChrome(); }
  };
  el('cCur').onchange = () => { c.cur = el('cCur').value; el('cRate').value = rateOf(c.cur) || ''; info(); recalc(); refresh(false); };
  el('cRefresh').onclick = () => refresh(true);
  el('cToForeign').onclick = () => { el('cCur').value = 'THB'; el('cCur').onchange(); };
  if (el('cSave')) el('cSave').onclick = async () => {
    const e = { ...cfgEv };
    const v = num(el('cRate').value);
    Object.assign(e, { currency: c.cur, feeType: c.fee.type, feeValue: c.fee.value, shipPerKg: c.ship, rounding: c.round, lockedRate: c.cur !== 'IDR' && el('cLock').checked && v > 0 ? v : '' });
    await saveRow('events', e); await loadEvents(); renderChrome(); info();
    toast(`Markup bawaan ${e.name} disimpan ✓`);
  };
  el('cCopy').onclick = () => {
    const r = c.last;
    if (!r || !num(el('cBuy').value)) return toast('Isi harga beli dulu');
    shareText('Harga jastip', `Harga ${c.cur} ${el('cBuy').value} → harga jastip ${fmtIDR(r.sell)} (kurs ${fmtRate(num(el('cRate').value))})`);
  };
  bindTip($('#trend'));
  $$('[data-evh]').forEach((b) => b.onclick = async () => { viewHome.ev = b.dataset.evh; if (b.dataset.evh) await setCurEv(b.dataset.evh); viewHome(); });
  if (!rateOf(c.cur) || (!lockedRate(c.cur, cfgEv) && L.rates[c.cur] && Date.now() - L.rates[c.cur].at > 6 * 3600e3)) refresh(false);
}

/* ================= Views: Event jastip ================= */
async function viewEvents() {
  setTab('saya');
  const [orders] = await Promise.all([DB.all('orders')]);
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/saya'">‹ Saya</button>
    <p class="eyebrow">Event jastip</p>
    <h1 class="page-title">Event</h1>
    <p class="page-sub">Setiap event punya mata uang, kurs, fee, ongkir & periode PO sendiri. Event berstatus <b>PO dibuka</b> atau <b>ditutup</b> tampil di web buyer.</p>
    ${EVENTS.length ? EVENTS.map((e) => { const n = orders.filter((o) => o.eventId === e.id && o.status !== 'batal').length; return `
      <a class="ev-card" href="#/event/${e.id}" style="--ev:${esc(e.color || '#ef3b2d')}">
        ${e.banner ? `<img data-pid="${esc(e.banner)}" alt="">` : `<span class="ev-card-flag">${esc(e.flag || '✈️')}</span>`}
        <div class="ev-card-in"><small>${esc(e.title || 'OPEN JASTIP')} · ${esc(e.code)}</small><b>${esc(e.name)}</b>
          <span>${esc(fmtRangeD(e.poStart, e.poEnd) || 'Jadwal belum diisi')}</span>
          <span class="badge ${e.status === 'open' ? 'pay-lunas' : e.status === 'closed' ? 'st-dibeli' : 'st-batal'}">${esc(evStatusLabel(e.status))}</span> <span class="small">${n} pesanan · ${esc(e.currency)}</span></div></a>`; }).join('')
    : '<div class="empty"><div class="big">✈️</div>Belum ada event.</div>'}
    ${isOwner() ? `<button class="fab" aria-label="Event baru" onclick="location.hash='#/event/baru'">+</button>` : ''}`;
  await hydratePhotos();
}

async function viewEventForm(id) {
  setTab('saya');
  if (!isOwner()) { toast('Hanya owner yang bisa mengubah event'); location.replace('#/event'); return; }
  let e = id ? evById(id) : null;
  if (id && !e) { location.replace('#/event'); return; }
  e = e ? { ...e } : { id: 'ev_' + uid(), code: '', name: '', title: 'OPEN JASTIP', country: '', flag: '', currency: 'THB', lockedRate: '', feeType: 'percent', feeValue: 10,
    shipPerKg: 0, rounding: 1000, poStart: '', poEnd: '', eta: '', note: '', tagline: 'Produk original langsung dari tokonya', color: '#ef3b2d', banner: '', status: 'draft', sort: EVENTS.length + 1, createdAt: Date.now() };
  const COLORS = ['#ef3b2d', '#1d3a8a', '#c8102e', '#0f766e', '#7c3aed', '#d97706', '#be185d', '#111827'];
  const FLAGS = ['🇹🇭', '🇯🇵', '🇰🇷', '🇦🇺', '🇸🇬', '🇲🇾', '🇨🇳', '🇭🇰', '🇹🇼', '🇻🇳', '🇺🇸', '🇬🇧', '🇫🇷', '🇹🇷', '🇸🇦', '🇮🇩'];
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/event'">‹ Event</button>
    <p class="eyebrow">${id ? 'Ubah event' : 'Event baru'}</p>
    <h1 class="page-title">${esc(e.name || 'Event jastip baru')}</h1>
    <div id="evPreview"></div>
    <section class="card">
      <h2>Identitas event</h2>
      <div class="two">
        <div class="field"><label class="req">Nama kota</label><input class="input" id="eName" value="${esc(e.name)}" placeholder="mis. Bangkok"></div>
        <div class="field"><label class="req">Kode singkat</label><input class="input" id="eCode" value="${esc(e.code)}" maxlength="5" placeholder="mis. BKK" style="text-transform:uppercase"></div>
      </div>
      <div class="two">
        <div class="field"><label>Label</label><select class="input" id="eTitle">${['OPEN JASTIP', 'OPEN PO', 'JASTIP', 'PRE-ORDER'].map((t) => `<option ${t === e.title ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>Negara</label><input class="input" id="eCountry" value="${esc(e.country)}" placeholder="mis. Thailand"></div>
      </div>
      <div class="field"><label>Bendera</label><div class="chips" style="flex-wrap:wrap">${FLAGS.map((f) => `<button type="button" class="chip ${f === e.flag ? 'on' : ''}" data-flag="${f}" style="font-size:1.2rem;padding:6px 10px">${f}</button>`).join('')}</div></div>
      <div class="field"><label>Warna tema</label><div class="row" style="flex-wrap:wrap">${COLORS.map((col) => `<button type="button" class="swatch ${col === e.color ? 'on' : ''}" data-color="${col}" style="background:${col}" aria-label="${col}"></button>`).join('')}</div></div>
      <div class="field"><label>Tagline (tampil di web)</label><input class="input" id="eTag" value="${esc(e.tagline)}"></div>
      <div class="field"><label>Foto banner kota (opsional)</label>
        <div class="photos" id="eBanner"></div>
        <div class="help">Pakai foto kota milik sendiri atau yang boleh dipakai. Tanpa foto, web memakai warna tema + bendera.</div></div>
    </section>
    <section class="card">
      <h2>Periode & status PO</h2>
      <div class="two">
        <div class="field"><label>Mulai PO</label><input class="input" type="date" id="eStart" value="${esc(e.poStart)}"></div>
        <div class="field"><label>Tutup PO</label><input class="input" type="date" id="eEnd" value="${esc(e.poEnd)}"></div>
      </div>
      <div class="field"><label>Status</label><select class="input" id="eStatus">${EV_STATUS.map(([k, l]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Estimasi tiba</label><input class="input" id="eEta" value="${esc(e.eta)}" placeholder="mis. akhir November 2026"></div>
      <div class="field"><label>Info PO (tampil di web)</label><textarea class="input" id="eNote" placeholder="mis. DP 50%, pelunasan saat barang tiba.">${esc(e.note)}</textarea></div>
    </section>
    <section class="card">
      <h2>Harga & markup</h2>
      <div class="two">
        <div class="field"><label>Mata uang belanja</label><select class="input" id="eCur">${curOptions(e.currency)}</select></div>
        <div class="field"><label>Kurs dikunci (opsional)</label><input class="input" id="eRate" data-money data-dec="4" inputmode="decimal" value="${esc(e.lockedRate)}" placeholder="kosong = kurs live"></div>
      </div>
      <div class="two">
        <div class="field"><label>Jenis fee</label><select class="input" id="eFeeType"><option value="percent" ${e.feeType === 'percent' ? 'selected' : ''}>Persen (%)</option><option value="flat" ${e.feeType === 'flat' ? 'selected' : ''}>Flat (Rp)</option></select></div>
        <div class="field"><label>Nilai fee</label><input class="input" id="eFee" data-money data-dec="2" inputmode="decimal" value="${esc(e.feeValue)}"></div>
      </div>
      <div class="two">
        <div class="field"><label>Ongkir per kg (Rp)</label><input class="input" id="eShip" data-money inputmode="decimal" value="${esc(e.shipPerKg)}"></div>
        <div class="field"><label>Pembulatan</label><select class="input" id="eRound">${[0, 500, 1000, 5000, 10000].map((v) => `<option value="${v}" ${v === num(e.rounding) ? 'selected' : ''}>${v ? fmtIDR(v) : 'Tanpa'}</option>`).join('')}</select></div>
      </div>
    </section>
    <div class="btn-col">
      <button class="btn primary" id="eSave">Simpan event</button>
      ${id ? `<button class="btn" id="eActive">Jadikan event aktif di HP ini</button>${webBase() ? '<button class="btn" id="eShare">Bagikan link katalog event</button>' : ''}<button class="btn danger" id="eDel">Hapus event</button>` : ''}
    </div>`;
  const preview = () => { $('#evPreview').innerHTML = eventHero({ ...e, name: $('#eName').value || 'Nama event', title: $('#eTitle').value, poStart: $('#eStart').value, poEnd: $('#eEnd').value, status: $('#eStatus').value, currency: $('#eCur').value, feeType: $('#eFeeType').value, feeValue: num($('#eFee').value) }); };
  const drawBanner = async () => { $('#eBanner').innerHTML = e.banner ? photoTiles([e.banner], true) : photoAdd('banner', 'Galeri'); await hydratePhotos($('#eBanner')); preview(); };
  await drawBanner();
  ['eName', 'eTitle', 'eStart', 'eEnd', 'eStatus', 'eCur', 'eFeeType', 'eFee'].forEach((k) => { $('#' + k).addEventListener('input', preview); $('#' + k).addEventListener('change', preview); });
  $$('[data-flag]').forEach((b) => b.onclick = () => { e.flag = b.dataset.flag; $$('[data-flag]').forEach((x) => x.classList.toggle('on', x === b)); preview(); });
  $$('[data-color]').forEach((b) => b.onclick = () => { e.color = b.dataset.color; $$('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); preview(); });
  $('#eBanner').onchange = async (ev2) => { if (ev2.target.dataset.addPhoto) { const ids = await savePhotos([ev2.target.files[0]]); e.banner = ids[0]; drawBanner(); } };
  $('#eBanner').addEventListener('click', (ev2) => { const rm = ev2.target.closest('[data-rm-photo]'); if (rm) { ev2.preventDefault(); e.banner = ''; drawBanner(); } });
  $('#eSave').onclick = async () => {
    const name = $('#eName').value.trim(); const code = $('#eCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name || !code) return toast('Nama & kode event wajib diisi');
    if (EVENTS.some((x) => x.id !== e.id && (x.code || '').toUpperCase() === code)) return toast('Kode ' + code + ' sudah dipakai event lain');
    Object.assign(e, { name, code, title: $('#eTitle').value, country: $('#eCountry').value.trim(), tagline: $('#eTag').value.trim(), poStart: $('#eStart').value, poEnd: $('#eEnd').value,
      status: $('#eStatus').value, eta: $('#eEta').value.trim(), note: $('#eNote').value.trim(), currency: $('#eCur').value, lockedRate: num($('#eRate').value) || '',
      feeType: $('#eFeeType').value, feeValue: num($('#eFee').value), shipPerKg: num($('#eShip').value), rounding: num($('#eRound').value) });
    await saveRow('events', e); await loadEvents();
    if (!CUR_EV) await setCurEv(e.id);
    renderChrome(); toast('Event disimpan ✓'); location.hash = '#/event';
  };
  const on = (sel, fn) => { const x = $(sel); if (x) x.onclick = fn; };
  on('#eActive', async () => { await setCurEv(e.id); toast('Event aktif: ' + evLabel(e)); });
  on('#eShare', () => shareText(`${e.title} ${e.name}`, `${e.title} ${e.name}${e.poStart || e.poEnd ? ' (' + fmtRangeD(e.poStart, e.poEnd) + ')' : ''} — ${S.business}\n${webBase()}?e=${encodeURIComponent((e.code || '').toLowerCase())}`));
  on('#eDel', async () => {
    const n = (await DB.all('orders')).filter((o) => o.eventId === e.id).length;
    if (n) return toast(`Event masih punya ${n} pesanan — ubah status ke "Selesai (arsip)" saja`);
    if (!(await confirmSheet(`Hapus event ${e.name}?`, 'Hapus'))) return;
    await removeRow('events', e); await loadEvents(); renderChrome(); location.hash = '#/event';
  });
}

/* ================= Views: Pesanan ================= */
async function viewOrders(params) {
  setTab('pesanan');
  if (params && params.get('f')) viewOrders.filter = params.get('f');
  const [orders, customers, pm] = await Promise.all([DB.all('orders'), DB.all('customers'), paidMap()]);
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const waiting = orders.filter((o) => o.status === 'menunggu').length;
  const f = viewOrders.filter || (waiting && !isShopper() ? 'masuk' : 'aktif');
  const q = (viewOrders.q || '').toLowerCase();
  const match = (o) => {
    const t = orderTotals(o, pm[o.id]);
    switch (f) {
      case 'masuk': return o.status === 'menunggu';
      case 'saya': return o.pic === ME.id && !['selesai', 'batal'].includes(o.status);
      case 'aktif': return !['selesai', 'batal', 'menunggu'].includes(o.status);
      case 'belum': return t.due > 0 && !['batal', 'menunggu'].includes(o.status);
      case 'semua': return true;
      default: return o.status === f;
    }
  };
  const evf = viewOrders.ev ?? '';
  const list = orders.filter(match).filter((o) => !evf || o.eventId === evf)
    .filter((o) => !q || [o.code, o.trip, cmap[o.customerId]?.name, cmap[o.customerId]?.phone, ...(o.items || []).map((i) => i.name)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const filters = [['masuk', `Masuk${waiting ? ` (${waiting})` : ''}`], ['saya', 'Pesanan saya'], ['aktif', 'Aktif'], ...(isShopper() ? [] : [['belum', 'Belum lunas']]),
    ...STATUSES.filter(([k]) => k !== 'menunggu'), ['semua', 'Semua']];

  view.innerHTML = `
    <p class="eyebrow">Pesanan</p>
    <h1 class="page-title">Daftar titipan</h1>
    <div class="row" style="margin-bottom:12px"><a class="btn sm" href="#/belanja">🛒 Daftar belanja</a></div>
    ${EVENTS.length > 1 ? evChips(evf, 'data-evo') : ''}
    <div class="search"><input class="input" id="oq" placeholder="Cari kode, customer, nomor, barang…" value="${esc(viewOrders.q || '')}"></div>
    <div class="chips">${filters.map(([k, l]) => `<button class="chip ${k === f ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
    <div id="olist">${list.length ? list.map((o) => {
      const t = orderTotals(o, pm[o.id]); const cu = cmap[o.customerId];
      return `<a class="list-item" href="#/pesanan/${o.id}">
        <div class="avatar">${esc(evById(o.eventId)?.flag || (cu?.name || '?').slice(0, 1).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div class="title">${esc(cu?.name || 'Tanpa customer')}</div>
          <div class="sub">#${esc(o.code)} · ${t.qty} barang${o.trip ? ' · ' + esc(o.trip) : ''}${o.picName ? ' · 👤 ' + esc(o.picName) : ''}</div>
          <div style="margin-top:6px"><span class="badge st-${o.status}">${statusLabel(o.status)}</span>
          <span class="badge src-${o.source || 'admin'}">${SOURCES[o.source] || 'Admin'}</span>
          ${o.status === 'menunggu' || isShopper() ? '' : `<span class="badge ${t.due > 0 ? 'pay-belum' : 'pay-lunas'}">${t.due > 0 ? 'Belum lunas' : 'Lunas'}</span>`}</div>
        </div>
        ${isShopper() ? '' : `<div class="amount">${fmtIDR(t.total)}</div>`}</a>`;
    }).join('') : `<div class="empty"><div class="big">🛍️</div>Belum ada pesanan di sini.${canSell() ? '<br>Tekan <b>+</b> untuk mencatat titipan baru.' : ''}</div>`}</div>
    ${canSell() ? `<button class="fab" aria-label="Pesanan baru" onclick="location.hash='#/pesanan/baru'">+</button>` : ''}`;
  $$('[data-evo]').forEach((b) => b.onclick = () => { viewOrders.ev = b.dataset.evo; viewOrders(); });
  $$('[data-f]').forEach((b) => b.onclick = () => { viewOrders.filter = b.dataset.f; if (location.hash.includes('?')) location.replace('#/pesanan'); else viewOrders(); });
  const qi = $('#oq');
  qi.oninput = () => { viewOrders.q = qi.value; clearTimeout(viewOrders._t); viewOrders._t = setTimeout(async () => { await viewOrders(); const n = $('#oq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

function blankItem(ev) {
  const cur = evCfg(ev).currency || 'THB';
  return { id: uid(), name: '', qty: 1, weight: '', buyPrice: '', buyCur: cur, sellPrice: '', sellCur: 'IDR', rate: rateOf(cur) || '', photos: [], note: '' };
}

async function viewOrderForm(id) {
  setTab('pesanan');
  if (!canSell()) { toast('Peran Anda tidak bisa mengubah pesanan'); location.replace(id ? '#/pesanan/' + id : '#/pesanan'); return; }
  const customers = await DB.all('customers');
  let o; const isNew = !id;
  if (id) {
    o = await DB.get('orders', id);
    if (!o) { location.hash = '#/pesanan'; return; }
    o = JSON.parse(JSON.stringify(o));
  } else {
    const ev0 = curEv();
    o = { id: 'o_' + uid(), code: eventCode(ev0), eventId: ev0?.id || '', customerId: viewOrderForm.presetCustomer || '', trip: ev0?.name || '', status: 'baru', source: 'wa', items: [blankItem(ev0)], receipts: [], shipping: '', discount: '', note: '', pic: ME.id, picName: ME.name, createdAt: Date.now() };
    viewOrderForm.presetCustomer = '';
  }
  o.items.forEach((it) => { it.photos = it.photos || []; if (!num(it.rate)) it.rate = rateOf(it.buyCur) || ''; });
  o.receipts = o.receipts || [];
  const baseUpdatedAt = o.updatedAt || 0;
  const oEv = () => evById(o.eventId) || null;
  const oCfg = () => evCfg(oEv());
  const paidSoFar = isNew ? 0 : await paidOf(o.id);
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
        <div class="field"><label>Berat satuan (gram)</label><input class="input" data-k="weight" data-money inputmode="decimal" value="${esc(it.weight)}"></div>
      </div>
      <div class="field">
        <div class="money-row"><label class="req label-row">Harga beli satuan</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" data-k="buyPrice" data-money data-dec="2" inputmode="decimal" value="${esc(it.buyPrice)}" placeholder="0">
          <select class="input" data-k="buyCur">${curOptions(it.buyCur)}</select></div>
        <div class="help" data-help="buy"></div>
      </div>
      <div class="field">
        <div class="money-row"><label class="req label-row">Harga jual satuan</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" data-k="sellPrice" data-money data-dec="2" inputmode="decimal" value="${esc(it.sellPrice)}" placeholder="0">
          <select class="input" data-k="sellCur">${curOptions(it.sellCur || 'IDR')}</select></div>
        <div class="help" data-help="sell">Isi dalam ${esc(it.sellCur || 'IDR')} (harga ke customer)</div>
      </div>
      <div class="field"><label>Catatan barang</label><input class="input" data-k="note" value="${esc(it.note || '')}" placeholder="Varian, warna, ukuran…"></div>
      <button type="button" class="btn" data-act="quick">Hitung harga jual (cepat)</button>
      <details class="calc"><summary>Hitung harga jual</summary><div class="calc-body">
        <div class="two">
          <div class="field"><label data-rate-lbl>Kurs ${esc(it.buyCur)} → IDR</label><input class="input" data-c="rate" data-money data-dec="4" inputmode="decimal" value="${esc(it.rate)}"></div>
          <div class="field"><label>Ongkir/kg (Rp)</label><input class="input" data-c="ship" data-money inputmode="decimal" value="${esc(oCfg().shipPerKg || '')}"></div>
        </div>
        <div class="two">
          <div class="field"><label>Jenis fee</label><select class="input" data-c="feeType"><option value="percent" ${oCfg().fee.type === 'percent' ? 'selected' : ''}>Persen</option><option value="flat" ${oCfg().fee.type === 'flat' ? 'selected' : ''}>Flat (Rp)</option></select></div>
          <div class="field"><label>Nilai fee</label><input class="input" data-c="fee" data-money data-dec="2" inputmode="decimal" value="${esc(oCfg().fee.value)}"></div>
        </div>
        <div class="result" data-calc-result></div>
        <button type="button" class="btn primary" data-act="apply" style="margin-top:12px">Pakai harga ini</button>
      </div></details>
      <div class="field" style="margin-top:14px;margin-bottom:0"><label>Foto barang</label>
        <div class="photos">${it.productPhoto && !it.photos.length ? `<div class="photo"><img data-pid="${esc(it.productPhoto)}" data-zoom alt=""></div>` : ''}${photoTiles(it.photos, true)}${photoAdd('item:' + i)}</div></div>
    </div>`;

  view.innerHTML = `
    <button class="back" onclick="history.back()">‹ Kembali</button>
    <p class="eyebrow">${isNew ? 'Pesanan baru' : 'Ubah pesanan'}${oEv() ? ' · ' + esc(evLabel(oEv())) : ''}</p>
    <h1 class="page-title">#${esc(o.code)}</h1>
    <section class="card">
      <div class="field"><label class="req">Customer</label>
        <button type="button" class="btn" id="pickCust" style="justify-content:space-between"><span id="custLbl">${esc(custName() || 'Pilih customer…')}</span><span>›</span></button></div>
      <div class="two">
        <div class="field"><label>Event</label><select class="input" id="oEvent">${EVENTS.filter((x) => x.status !== 'done' || x.id === o.eventId).map((x) => `<option value="${x.id}" ${x.id === o.eventId ? 'selected' : ''}>${esc(evLabel(x))}</option>`).join('')}${!o.eventId ? `<option value="" selected>${esc(o.trip || 'Tanpa event')}</option>` : ''}</select></div>
        <div class="field"><label>Status</label><select class="input" id="oStatus">${STATUSES.filter(([k]) => k !== 'menunggu' || o.status === 'menunggu').map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      ${o.source === 'web' ? '<p class="help">Sumber: pesanan dari web katalog</p>' : `<div class="field" style="margin-bottom:0"><label>Sumber pesanan</label>
        <div class="seg" id="oSrc"><button type="button" data-v="wa">WhatsApp</button><button type="button" data-v="admin">Langsung / lainnya</button></div></div>`}
    </section>

    <div id="items"></div>
    <div class="btn-col" style="margin-bottom:16px">
      <button type="button" class="btn" id="addItem">Tambah barang</button>
      <button type="button" class="btn ghost" id="addFromProduct">Tambah dari katalog produk</button>
    </div>

    <section class="card">
      <h2>Pembayaran</h2>
      <div class="two">
        <div class="field"><label>Ongkir ke customer (Rp)</label><input class="input" id="oShip" data-money inputmode="decimal" value="${esc(o.shipping)}" placeholder="0"></div>
        <div class="field"><label>Diskon (Rp)</label><input class="input" id="oDisc" data-money inputmode="decimal" value="${esc(o.discount)}" placeholder="0"></div>
      </div>
      ${isNew ? `<div class="field"><label>DP / pembayaran awal (Rp)</label>
        <div class="row"><input class="input grow" id="oPaid" data-money inputmode="decimal" placeholder="0"><button type="button" class="btn sm" id="payFull">Lunas</button></div></div>
        <div class="field"><label>Metode</label><select class="input" id="oPayMethod">${PAY_METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>`
      : `<p class="help" style="margin-top:-4px">Sudah dibayar ${fmtIDR(paidSoFar)}. Tambah pembayaran dari halaman detail pesanan.</p>`}
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
  const cardOf = (i) => $(`.item-card[data-i="${i}"]`, itemsEl);
  const renderItems = async () => {
    itemsEl.innerHTML = o.items.map(itemHTML).join('');
    formatMoneyInputs(itemsEl);
    o.items.forEach((_, i) => updateItemHelp(i));
    await hydratePhotos(itemsEl);
  };
  const calcFor = (i, quick) => {
    const it = o.items[i]; const card = cardOf(i);
    const g = (k) => card && $(`[data-c="${k}"]`, card);
    const rate = quick ? itemRate(it) : num(g('rate')?.value) || itemRate(it);
    const cfg = oCfg();
    const fee = quick ? cfg.fee : { type: g('feeType')?.value || cfg.fee.type, value: num(g('fee')?.value) };
    const ship = quick ? cfg.shipPerKg : num(g('ship')?.value);
    return calcSell({ buy: it.buyPrice, rate, weightG: it.weight, fee, shipPerKg: ship, rounding: cfg.rounding });
  };
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
  const updateSum = () => {
    o.shipping = $('#oShip').value; o.discount = $('#oDisc').value;
    o.items.forEach((it) => { it.sellIDR = liveSellIDR(it) || num(it.sellIDR); });
    const paid = isNew ? num($('#oPaid').value) : paidSoFar;
    const t = orderTotals(o, paid);
    $('#oSum').innerHTML = `
      <div class="line"><span>Subtotal (${t.qty} barang)</span><b>${fmtIDR(t.subtotal)}</b></div>
      <div class="line"><span>Ongkir</span><b>${fmtIDR(t.shipping)}</b></div>
      ${t.discount ? `<div class="line"><span>Diskon</span><b>− ${fmtIDR(t.discount)}</b></div>` : ''}
      <div class="line total"><span>Total tagihan</span><b>${fmtIDR(t.total)}</b></div>
      <div class="line"><span>Sisa tagihan</span><b>${fmtIDR(t.due)}</b></div>
      <div class="line"><span>Modal · estimasi profit</span><b>${fmtIDR(t.modal)} · ${fmtIDR(t.profit)}</b></div>`;
  };
  const applySell = (i, calc, rate) => {
    const it = o.items[i];
    if (!num(it.buyPrice)) return toast('Isi harga beli dulu');
    if (!rate) return toast('Kurs belum ada — buka Beranda untuk mengambil kurs');
    it.rate = rate; it.sellCur = 'IDR'; it.sellPrice = calc.sell; it.sellIDR = calc.sell;
    const card = cardOf(i);
    $('[data-k="sellPrice"]', card).value = calc.sell;
    $('[data-k="sellCur"]', card).value = 'IDR';
    $('[data-help="sell"]', card).textContent = 'Isi dalam IDR (harga ke customer)';
    updateItemHelp(i); updateSum();
    toast(`Harga jual ${fmtIDR(calc.sell)}`);
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
    if (e.target.dataset.addPhoto) return addPhoto(e.target);
    const i = +card.dataset.i; const k = e.target.dataset.k; const it = o.items[i];
    if (k === 'buyCur') {
      it.buyCur = e.target.value;
      it.rate = await ensureRate(it.buyCur) || '';
      const ri = $('[data-c="rate"]', card); if (ri) ri.value = it.rate;
      const rl = $('[data-rate-lbl]', card); if (rl) rl.textContent = `Kurs ${it.buyCur} → IDR`;
      updateItemHelp(i); updateSum();
    } else if (k === 'sellCur') {
      it.sellCur = e.target.value; it.sellIDR = '';
      if (it.sellCur !== 'IDR') await ensureRate(it.sellCur);
      $('[data-help="sell"]', card).textContent = `Isi dalam ${it.sellCur} (harga ke customer)`;
      updateSum();
    } else if (e.target.dataset.c) updateItemHelp(i);
  });
  itemsEl.addEventListener('click', async (e) => {
    const zoom = e.target.closest('[data-zoom]'); if (zoom && zoom.src) return openLightbox(zoom.src);
    const card = e.target.closest('.item-card'); if (!card) return;
    const i = +card.dataset.i; const it = o.items[i];
    const rm = e.target.closest('[data-rm-photo]');
    if (rm) { e.preventDefault(); it.photos = it.photos.filter((p) => p !== rm.dataset.rmPhoto); return renderItems(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rm-item') { o.items.splice(i, 1); await renderItems(); updateSum(); }
    else if (act === 'quick') applySell(i, calcFor(i, true), itemRate(it));
    else if (act === 'apply') applySell(i, calcFor(i), num($('[data-c="rate"]', card).value) || itemRate(it));
    else if (act === 'to-product') {
      if (!it.name.trim()) return toast('Isi nama barang dulu');
      const p = { id: 'p_' + uid(), name: it.name.trim(), brand: '', description: it.note || '', buyPrice: it.buyPrice, buyCur: it.buyCur, sellPrice: liveSellIDR(it) || '', weight: it.weight, photo: it.photos[0] || it.productPhoto || '', note: '', published: true, sort: 0, createdAt: Date.now() };
      await saveRow('products', p);
      it.productId = p.id;
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
    if (rm) { e.preventDefault(); o.receipts = o.receipts.filter((p) => p !== rm.dataset.rmPhoto); renderReceipts(); }
  });
  const srcSeg = $('#oSrc');
  const setSrc = (v) => { o.source = v; if (srcSeg) $$('button', srcSeg).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
  if (srcSeg) { setSrc(o.source === 'admin' ? 'admin' : 'wa'); $$('button', srcSeg).forEach((b) => b.onclick = () => setSrc(b.dataset.v)); }

  $('#oEvent').onchange = async () => {
    const ne = evById($('#oEvent').value); if (!ne) return;
    o.eventId = ne.id;
    o.items.forEach((it) => { if (!num(it.buyPrice) && !it.productId) { it.buyCur = ne.currency; it.rate = rateOf(ne.currency) || ''; } });
    await renderItems(); updateSum();
    toast('Pengaturan harga mengikuti event ' + ne.name);
  };
  $('#addItem').onclick = async () => { o.items.push(blankItem(oEv())); await renderItems(); cardOf(o.items.length - 1).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#addFromProduct').onclick = () => pickProduct(o.eventId, async (p) => {
    const it = { ...blankItem(oEv()), name: p.name, productId: p.id, productPhoto: p.photo || '', buyPrice: p.buyPrice || '', buyCur: p.buyCur || oCfg().currency, weight: p.weight || '', sellPrice: p.sellPrice || '', sellCur: 'IDR' };
    it.rate = await ensureRate(it.buyCur) || '';
    const last = o.items[o.items.length - 1];
    if (o.items.length === 1 && !last.name && !num(last.buyPrice)) o.items = [it]; else o.items.push(it);
    await renderItems(); updateSum(); toast('Produk ditambahkan');
  });

  $('#pickCust').onclick = () => pickCustomer(customers, (c) => { o.customerId = c.id; $('#custLbl').textContent = c.name; });
  ['oShip', 'oDisc', 'oPaid'].forEach((k) => { const el = $('#' + k); if (el) el.oninput = updateSum; });
  const pf = $('#payFull'); if (pf) pf.onclick = () => { $('#oPaid').value = orderTotals(o).total; updateSum(); };

  const save = async () => {
    const evSel = evById($('#oEvent').value);
    if (evSel) { o.eventId = evSel.id; o.trip = evSel.name; if (isNew && !o.code.startsWith(evSel.code.toUpperCase() + '-')) o.code = eventCode(evSel); }
    o.status = $('#oStatus').value; o.note = $('#oNote').value;
    o.items = o.items.filter((it) => it.name.trim() || num(it.buyPrice) || num(it.sellPrice));
    if (!o.customerId) { toast('Pilih customer dulu'); return null; }
    if (!o.items.length) { o.items = [blankItem()]; await renderItems(); toast('Tambahkan minimal 1 barang'); return null; }
    const bad = o.items.findIndex((it) => !it.name.trim() || !(num(it.qty) > 0));
    if (bad >= 0) { await renderItems(); toast(`Lengkapi nama & qty barang ${bad + 1}`); cardOf(bad)?.scrollIntoView({ block: 'center' }); return null; }
    // Cek apakah admin lain baru saja mengubah pesanan ini
    if (!isNew && navigator.onLine) {
      try {
        const { data } = await supa.from('orders').select('updated_at,updated_by,updated_by_name').eq('id', o.id).maybeSingle();
        if (data && Date.parse(data.updated_at) > baseUpdatedAt + 1000 && data.updated_by !== ME.id) {
          const ok = await confirmSheet(`Pesanan ini baru diubah oleh ${data.updated_by_name || 'admin lain'} (${fmtDateTime(Date.parse(data.updated_at))})`,
            'Tetap simpan (timpa)', true, 'Pilih Batal untuk membuka versi terbaru tanpa menyimpan perubahan Anda.');
          if (!ok) { FORM_OPEN = false; await Sync.pull().catch(() => {}); location.replace('#/pesanan/' + o.id); return null; }
        }
      } catch (e) { /* offline: lanjut simpan */ }
    }
    if (o.status !== 'menunggu' && !o.pic) { o.pic = ME.id; o.picName = ME.name; }
    finalizeOrder(o);
    await saveRow('orders', o);
    if (isNew && num($('#oPaid').value) > 0) {
      await addPayment({ id: 'pay_' + uid(), orderId: o.id, amount: num($('#oPaid').value), method: $('#oPayMethod').value, note: 'DP awal', createdAt: Date.now(), updatedByName: ME.name });
    }
    FORM_OPEN = false;
    return o;
  };
  $('#saveOrder').onclick = async () => { if (await save()) { toast('Pesanan disimpan ✓'); location.replace('#/pesanan/' + o.id); } };
  $('#saveSend').onclick = async () => {
    if (!(await save())) return;
    const cu = await DB.get('customers', o.customerId);
    location.replace('#/pesanan/' + o.id);
    if (cu?.phone) openWA(cu.phone, buildNota(o, cu, await paidOf(o.id))); else toast('Nomor WA customer belum diisi');
  };

  await renderItems(); updateSum(); await hydratePhotos($('#receipts'));
  FORM_OPEN = true;
  if (viewOrderForm.openPicker) { viewOrderForm.openPicker = false; $('#addFromProduct').click(); }
  [...new Set(o.items.map((it) => it.buyCur))].forEach((cur) => ensureRate(cur).then(() => {
    if (!$('#items')) return;
    o.items.forEach((it, i) => {
      if (it.buyCur !== cur || num(it.rate)) return;
      it.rate = rateOf(cur) || '';
      const ri = cardOf(i) && $('[data-c="rate"]', cardOf(i)); if (ri) ri.value = it.rate;
      updateItemHelp(i);
    });
    updateSum(); renderChrome();
  }));
}

async function pickProduct(evId, onPick) {
  const products = (await DB.all('products')).filter((p) => !evId || !(p.events || []).length || p.events.includes(evId)).sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || a.name.localeCompare(b.name));
  if (!products.length) return toast('Katalog produk masih kosong');
  openSheet(`<h3>Pilih produk</h3><input class="input" id="pq" placeholder="Cari produk / brand…"><div class="pick" id="plist"></div>
    <button class="btn ghost" data-close>Tutup</button>`, (s) => {
    const draw = () => {
      const q = $('#pq', s).value.toLowerCase();
      $('#plist', s).innerHTML = products.filter((p) => !q || (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)).slice(0, 80).map((p) => `
        <button class="list-item" data-pid-pick="${p.id}">${thumbHTML(p.photo)}
        <div style="flex:1;min-width:0"><div class="title">${esc(p.name)}</div><div class="sub">${p.brand ? esc(p.brand) : ''}${p.buyPrice ? ' · beli ' + fmtCur(p.buyPrice, p.buyCur) : ''}</div></div>
        <div class="amount">${p.sellPrice ? fmtIDR(p.sellPrice) : ''}</div></button>`).join('') || '<div class="empty">Tidak ditemukan</div>';
      hydratePhotos(s);
    };
    draw();
    $('#pq', s).oninput = draw;
    $('[data-close]', s).onclick = closeSheet;
    $('#plist', s).onclick = async (e) => {
      const b = e.target.closest('[data-pid-pick]'); if (!b) return;
      closeSheet();
      await onPick(products.find((x) => x.id === b.dataset.pidPick));
    };
  });
}

function pickCustomer(customers, onPick) {
  openSheet(`<h3>Pilih customer</h3>
    <input class="input" id="cq" placeholder="Cari nama / nomor (mis. 4 digit terakhir)…">
    <div class="pick" id="clist"></div>
    <div class="btn-col"><button class="btn primary" id="newCust">+ Customer baru</button><button class="btn ghost" data-close>Tutup</button></div>`, (s) => {
    const draw = () => {
      const q = $('#cq', s).value.toLowerCase().trim();
      const qd = q.replace(/\D/g, '');
      $('#clist', s).innerHTML = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (qd && (c.phone || '').includes(qd)))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 80)
        .map((c) => `<button class="list-item" data-cid="${c.id}"><div class="avatar">${esc(c.name.slice(0, 1).toUpperCase())}</div>
          <div><div class="title">${esc(c.name)}</div><div class="sub">${esc(fmtPhone(c.phone) || '—')}${c.city ? ' · ' + esc(c.city) : ''}</div></div></button>`).join('')
        || '<div class="empty">Belum ada — tambahkan di bawah.</div>';
    };
    draw();
    $('#cq', s).oninput = draw;
    $('[data-close]', s).onclick = closeSheet;
    $('#clist', s).onclick = (e) => { const b = e.target.closest('[data-cid]'); if (!b) return; onPick(customers.find((c) => c.id === b.dataset.cid)); closeSheet(); };
    $('#newCust', s).onclick = () => {
      const v = $('#cq', s).value.trim();
      customerSheet(null, (c) => { if (!customers.find((x) => x.id === c.id)) customers.push(c); onPick(c); }, /^\+?[\d\s-]{6,}$/.test(v) ? { phone: v } : { name: v });
    };
  });
}

function buildNota(o, cu, paid = 0) {
  const t = orderTotals(o, paid);
  const rincian = o.items.map((it, i) => {
    const unit = itemSellIDR(it);
    return `${i + 1}. ${it.name}${it.note ? ` (${it.note})` : ''} × ${num(it.qty)} @ ${fmtIDR(unit)} = ${fmtIDR(unit * num(it.qty))}`;
  }).join('\n');
  const lacak = trackLink(o);
  const map = {
    nama: cu?.name || '', kode: o.code, trip: o.trip ? ` (${o.trip})` : '', rincian,
    subtotal: fmtIDR(t.subtotal), ongkir: fmtIDR(t.shipping), diskon: fmtIDR(t.discount), total: fmtIDR(t.total),
    dibayar: fmtIDR(t.paid), sisa: fmtIDR(t.due), status: statusLabel(o.status), usaha: S.business || '',
    lacak, katalog: webBase(), event: evById(o.eventId) ? evLabel(evById(o.eventId)) : (o.trip || ''),
  };
  let tpl = S.template || DEFAULT_TEMPLATE;
  if (!lacak) tpl = tpl.split('\n').filter((l) => !l.includes('{lacak}')).join('\n');
  let txt = tpl.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  if (t.discount && !/\{diskon\}/.test(tpl)) txt = txt.replace('*Total:', `Diskon: − ${fmtIDR(t.discount)}\n*Total:`);
  return txt.replace(/\n{3,}/g, '\n\n');
}

async function viewOrderDetail(id) {
  setTab('pesanan');
  const o = await DB.get('orders', id);
  if (!o) { view.innerHTML = `<button class="back" onclick="location.hash='#/pesanan'">‹ Pesanan</button><div class="empty"><div class="big">🔍</div>Pesanan tidak ditemukan (mungkin sudah dihapus).</div>`; return; }
  o.items = o.items || []; o.receipts = o.receipts || [];
  const cu = await DB.get('customers', o.customerId);
  const pays = (await DB.all('payments')).filter((p) => p.orderId === id && !p.deleted).sort((a, b) => a.createdAt - b.createdAt);
  const paid = pays.reduce((a, p) => a + num(p.amount), 0);
  const t = orderTotals(o, paid);
  const link = trackLink(o);
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/pesanan'">‹ Pesanan</button>
    <p class="eyebrow">#${esc(o.code)}${o.trip ? ' · ' + esc(o.trip) : ''}</p>
    <h1 class="page-title">${esc(cu?.name || 'Tanpa customer')}</h1>
    <p class="page-sub">${fmtDate(o.createdAt)} · <span class="badge st-${o.status}">${statusLabel(o.status)}</span>
      <span class="badge src-${o.source || 'admin'}">${SOURCES[o.source] || 'Admin'}</span>
      ${o.status === 'menunggu' || isShopper() ? '' : `<span class="badge ${t.due > 0 ? 'pay-belum' : 'pay-lunas'}">${t.due > 0 ? 'Belum lunas' : 'Lunas'}</span>`}<br>
      <span class="small">${cu?.phone ? esc(fmtPhone(cu.phone)) + ' · ' : ''}${o.picName ? `Ditangani: <b>${esc(o.picName)}</b>` : 'Belum ada PIC'}${o.updatedByName ? ` · diubah ${esc(o.updatedByName)} ${fmtAgo(o.updatedAt)}` : ''}</span></p>

    ${o.status === 'menunggu' && canSell() ? `<div class="alert warn"><b>Pesanan dari web — perlu konfirmasi.</b><br>Cek ketersediaan barang, harga, dan ongkir, lalu konfirmasi. Kalau perlu penyesuaian, pilih Ubah pesanan dulu.</div>
      <div class="btn-col" style="margin-bottom:16px"><button class="btn primary" id="confirmO">Konfirmasi & ambil pesanan ini</button><button class="btn danger" id="rejectO">Tolak / batalkan</button></div>` : ''}
    ${o.status !== 'menunggu' && o.pic !== ME.id && !['selesai', 'batal'].includes(o.status) ? `<button class="btn" id="takeO" style="margin-bottom:16px">👤 ${o.pic ? 'Ambil alih' : 'Ambil'} pesanan ini</button>` : ''}

    ${o.status === 'menunggu' ? '' : `<section class="card">
      <h2>Ubah status</h2>
      <div class="chips" style="flex-wrap:wrap">${STATUSES.filter(([k]) => k !== 'menunggu').map(([k, l]) => `<button class="chip ${k === o.status ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
    </section>`}

    <section class="card">
      <h2>Barang</h2>
      ${o.items.map((it, i) => `
        <div class="list-item ${it.bought ? 'done' : ''}" style="border:0;padding:10px 0;margin:0;border-bottom:1px solid var(--line);border-radius:0;background:none">
          ${thumbHTML(thumbOf(it), true)}
          <div style="flex:1;min-width:0"><div class="title">${esc(it.name)}</div>
            <div class="sub">${num(it.qty)} × ${fmtIDR(itemSellIDR(it))}${isShopper() || !num(it.buyPrice) ? '' : ` · beli ${fmtCur(it.buyPrice, it.buyCur)}`}${it.weight ? ` · ${num(it.weight)} g` : ''}${it.note ? ` · ${esc(it.note)}` : ''}</div></div>
          ${['baru', 'dibeli'].includes(o.status) ? `<button class="check ${it.bought ? 'on' : ''}" data-buy="${i}" aria-label="Tandai sudah dibeli">✓</button>` : `<div class="amount">${fmtIDR(itemSellIDR(it) * num(it.qty))}</div>`}
        </div>`).join('')}
      <div class="result" style="margin-top:14px">
        <div class="line"><span>Subtotal</span><b>${fmtIDR(t.subtotal)}</b></div>
        <div class="line"><span>Ongkir</span><b>${fmtIDR(t.shipping)}</b></div>
        ${t.discount ? `<div class="line"><span>Diskon</span><b>− ${fmtIDR(t.discount)}</b></div>` : ''}
        <div class="line total"><span>Total</span><b>${fmtIDR(t.total)}</b></div>
        ${isShopper() ? '' : `<div class="line"><span>Sudah dibayar</span><b>${fmtIDR(t.paid)}</b></div>
        <div class="line"><span>Sisa</span><b>${fmtIDR(t.due)}</b></div>
        <div class="line"><span>Modal · profit</span><b>${fmtIDR(t.modal)} · ${fmtIDR(t.profit)}</b></div>`}
      </div>
    </section>

    ${isShopper() ? '' : `<section class="card">
      <h2>Pembayaran</h2>
      ${pays.length ? pays.map((p) => `<div class="pay-row"><div><b>${fmtIDR(p.amount)}</b>${p.method ? ` · ${esc(p.method)}` : ''}
          <div class="muted small">${fmtDateTime(p.createdAt)}${p.updatedByName ? ' · ' + esc(p.updatedByName) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
          ${isOwner() ? `<button class="btn sm danger" data-unpay="${p.id}">Batalkan</button>` : ''}</div>`).join('') : '<p class="muted">Belum ada pembayaran.</p>'}
      ${canSell() && o.status !== 'batal' ? `<div class="btn-col" style="margin-top:12px"><button class="btn" id="addPay">+ Catat pembayaran</button></div>` : ''}
    </section>`}

    <section class="card"><h2>Struk & foto belanja</h2>
      <div class="photos" id="dReceipts">${photoTiles(o.receipts)}${photoAdd('receipt', 'Struk')}</div></section>
    ${o.note ? `<section class="card"><h2>Catatan</h2><p style="white-space:pre-wrap;margin:0">${esc(o.note)}</p></section>` : ''}

    <div class="btn-col">
      ${isShopper() ? '' : '<button class="btn wa" id="sendWA">Kirim nota ke WhatsApp</button><button class="btn" id="shareNota">Bagikan / salin nota</button>'}
      ${link ? '<button class="btn" id="copyTrack">Bagikan link lacak pesanan</button>' : ''}
      ${canSell() ? `<a class="btn" href="#/pesanan/${o.id}/edit">Ubah pesanan</a>` : ''}
      ${isOwner() ? '<button class="btn danger" id="delOrder">Hapus pesanan</button>' : ''}
    </div>`;
  await hydratePhotos();
  view.onclick = (e) => { const z = e.target.closest('[data-zoom]'); if (z && z.src) openLightbox(z.src); };
  const reload = () => viewOrderDetail(id);
  const save = async (msg) => { if (!isShopper()) finalizeOrder(o); await saveRow('orders', o); if (msg) toast(msg); reload(); updateBadge(); };
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#confirmO', async () => {
    o.status = 'baru'; o.pic = ME.id; o.picName = ME.name;
    await save('Pesanan dikonfirmasi ✓');
    if (cu?.phone && await confirmSheet('Kirim nota ke customer sekarang?', 'Kirim via WhatsApp', false)) openWA(cu.phone, buildNota(o, cu, paid));
  });
  on('#rejectO', async () => { if (await confirmSheet(`Tolak pesanan #${o.code}?`, 'Tolak')) { o.status = 'batal'; o.pic = ME.id; o.picName = ME.name; await save('Pesanan ditolak'); } });
  on('#takeO', async () => { o.pic = ME.id; o.picName = ME.name; await save('Pesanan sekarang Anda tangani'); });
  $$('[data-st]').forEach((b) => b.onclick = async () => { o.status = b.dataset.st; await save('Status: ' + statusLabel(o.status)); });
  $$('[data-buy]').forEach((b) => b.onclick = async () => {
    const it = o.items[+b.dataset.buy]; it.bought = !it.bought;
    if (o.items.every((x) => x.bought) && o.status === 'baru') o.status = 'dibeli';
    if (!it.bought && o.status === 'dibeli') o.status = 'baru';
    await save();
  });
  $$('[data-unpay]').forEach((b) => b.onclick = async () => {
    const p = pays.find((x) => x.id === b.dataset.unpay);
    if (!(await confirmSheet(`Batalkan pembayaran ${fmtIDR(p.amount)}?`, 'Batalkan pembayaran'))) return;
    await DB.del('payments', p.id);
    await Sync.enqueue({ table: 'payments', kind: 'update', id: p.id, patch: { deleted: true } });
    toast('Pembayaran dibatalkan'); reload();
  });
  on('#addPay', () => paymentSheet(o, t, reload));
  $('#dReceipts').onchange = async (e) => {
    if (!e.target.dataset.addPhoto) return;
    const ids = await savePhotos(Array.from(e.target.files || []));
    o.receipts = [...o.receipts, ...ids]; await save(`${ids.length} foto ditambahkan`);
  };
  on('#sendWA', () => cu?.phone ? openWA(cu.phone, buildNota(o, cu, paid)) : toast('Nomor WA customer belum diisi'));
  on('#shareNota', () => shareText('Nota #' + o.code, buildNota(o, cu, paid)));
  on('#copyTrack', () => shareText('Lacak pesanan #' + o.code, link));
  on('#delOrder', async () => {
    if (!(await confirmSheet(`Hapus pesanan #${o.code}?`, 'Hapus'))) return;
    await removeRow('orders', o); toast('Pesanan dihapus'); location.hash = '#/pesanan';
  });
}

function paymentSheet(o, t, done) {
  openSheet(`<h3>Catat pembayaran</h3>
    <p class="muted">Sisa tagihan ${fmtIDR(t.due)}</p>
    <div class="field"><label class="req">Jumlah (Rp)</label><div class="row"><input class="input grow" id="pyAmt" data-money inputmode="decimal" value="${t.due || ''}"><button class="btn sm" id="pyFull" type="button">Lunasi</button></div></div>
    <div class="field"><label>Metode</label><select class="input" id="pyMethod">${PAY_METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>
    <div class="field"><label>Catatan</label><input class="input" id="pyNote" placeholder="mis. DP 50%, pelunasan"></div>
    <div class="btn-col"><button class="btn primary" id="pySave">Simpan pembayaran</button><button class="btn ghost" data-close>Batal</button></div>`, (s) => {
    $('[data-close]', s).onclick = closeSheet;
    $('#pyFull', s).onclick = () => { $('#pyAmt', s).value = t.due; };
    $('#pySave', s).onclick = async () => {
      const amount = num($('#pyAmt', s).value);
      if (!(amount > 0)) return toast('Isi jumlah pembayaran');
      await addPayment({ id: 'pay_' + uid(), orderId: o.id, amount, method: $('#pyMethod', s).value, note: $('#pyNote', s).value.trim(), createdAt: Date.now(), updatedByName: ME.name });
      closeSheet(); toast('Pembayaran dicatat ✓'); done();
    };
  });
}

/* ================= Views: Daftar belanja (gabungan semua pesanan) ================= */
async function viewShopping() {
  setTab('pesanan');
  const [orders, customers] = await Promise.all([DB.all('orders'), DB.all('customers')]);
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const active = orders.filter((o) => ['baru', 'dibeli'].includes(o.status));
  const evS = viewShopping.ev ?? (curEv()?.id || '');
  const evObj = evById(evS);
  const trip = evObj ? evObj.name : '';
  const showDone = !!viewShopping.showDone;
  const groups = new Map();
  active.filter((o) => !evS || o.eventId === evS || (!o.eventId && o.trip === trip)).forEach((o) => (o.items || []).forEach((it, idx) => {
    const key = it.productId || it.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, name: it.name, photo: thumbOf(it), buy: num(it.buyPrice) ? fmtCur(it.buyPrice, it.buyCur) : '', rows: [] });
    groups.get(key).rows.push({ o, it, idx });
  }));
  const list = [...groups.values()].map((g) => ({ ...g, qty: g.rows.reduce((a, r) => a + num(r.it.qty), 0), left: g.rows.filter((r) => !r.it.bought).reduce((a, r) => a + num(r.it.qty), 0) }))
    .filter((g) => showDone || g.left > 0)
    .sort((a, b) => (a.left === 0) - (b.left === 0) || a.name.localeCompare(b.name));
  const totalLeft = list.reduce((a, g) => a + g.left, 0);

  view.innerHTML = `
    <button class="back" onclick="location.hash='#/pesanan'">‹ Pesanan</button>
    <p class="eyebrow">Untuk shopper</p>
    <h1 class="page-title">Daftar belanja</h1>
    <p class="page-sub">Gabungan semua pesanan yang sudah dikonfirmasi. Centang saat barang sudah dibeli — status pesanan ikut berubah otomatis.</p>
    ${EVENTS.length ? evChips(evS, 'data-evs') : ''}
    <div class="row between" style="margin-bottom:12px"><b>${totalLeft} barang belum dibeli</b>
      <button class="btn sm" id="toggleDone">${showDone ? 'Sembunyikan yang selesai' : 'Tampilkan yang selesai'}</button></div>
    ${list.length ? list.map((g) => `
      <div class="group ${g.left === 0 ? 'done' : ''}">
        <button class="group-head" data-group="${esc(g.key)}">
          ${thumbHTML(g.photo)}
          <div style="flex:1;min-width:0"><div class="title">${esc(g.name)}</div>
            <div class="sub">${g.left === 0 ? 'Semua sudah dibeli' : `Beli <b>${g.left}</b> dari ${g.qty}`}${g.buy ? ' · ' + esc(g.buy) : ''} · ${g.rows.length} pesanan</div></div>
          <span class="check ${g.left === 0 ? 'on' : ''}">✓</span>
        </button>
        <div class="group-rows">${g.rows.map((r) => `
          <button class="group-row ${r.it.bought ? 'done' : ''}" data-o="${r.o.id}" data-i="${r.idx}">
            <span class="check ${r.it.bought ? 'on' : ''}">✓</span>
            <span class="name" style="flex:1">${esc(cmap[r.o.customerId]?.name || '?')} · #${esc(r.o.code)}${r.it.note ? ` · <i>${esc(r.it.note)}</i>` : ''}</span>
            <b>× ${num(r.it.qty)}</b></button>`).join('')}</div>
      </div>`).join('') : `<div class="empty"><div class="big">🎉</div>Tidak ada barang yang perlu dibeli.</div>`}
    ${list.length ? '<button class="btn" id="shareList" style="margin-top:6px">Bagikan daftar belanja</button>' : ''}`;
  await hydratePhotos();

  const setBought = async (pairs, val) => {
    const byOrder = new Map();
    pairs.forEach(({ oid, idx }) => { if (!byOrder.has(oid)) byOrder.set(oid, []); byOrder.get(oid).push(idx); });
    for (const [oid, idxs] of byOrder) {
      const o = await DB.get('orders', oid); if (!o) continue;
      idxs.forEach((i) => { if (o.items[i]) o.items[i].bought = val; });
      if (o.items.every((x) => x.bought) && o.status === 'baru') o.status = 'dibeli';
      if (!o.items.every((x) => x.bought) && o.status === 'dibeli') o.status = 'baru';
      await saveRow('orders', o);
    }
    viewShopping();
  };
  $$('[data-evs]').forEach((b) => b.onclick = () => { viewShopping.ev = b.dataset.evs; viewShopping(); });
  $('#toggleDone').onclick = () => { viewShopping.showDone = !showDone; viewShopping(); };
  $$('.group-row').forEach((b) => b.onclick = () => {
    const o = active.find((x) => x.id === b.dataset.o); const it = o.items[+b.dataset.i];
    setBought([{ oid: o.id, idx: +b.dataset.i }], !it.bought);
  });
  $$('[data-group]').forEach((b) => b.onclick = () => {
    const g = list.find((x) => x.key === b.dataset.group);
    setBought(g.rows.map((r) => ({ oid: r.o.id, idx: r.idx })), g.left > 0);
  });
  const sl = $('#shareList');
  if (sl) sl.onclick = () => shareText('Daftar belanja', `🛒 Daftar belanja${trip ? ' ' + trip : ''}\n\n` +
    list.filter((g) => g.left > 0).map((g) => `☐ ${g.name} × ${g.left}${g.buy ? ` (${g.buy})` : ''}`).join('\n'));
}

/* ================= Views: Produk ================= */
async function viewProducts() {
  setTab('produk');
  const q = (viewProducts.q || '').toLowerCase();
  const all = await DB.all('products');
  const evP = viewProducts.ev ?? '';
  const inEv = all.filter((p) => !evP || !(p.events || []).length || p.events.includes(evP));
  const catsUsed = [...new Set(inEv.map((p) => p.category).filter(Boolean))];
  const catSel = viewProducts.cat || '';
  const brand = viewProducts.brand || '';
  const brands = [...new Set(inEv.map((p) => p.brand).filter(Boolean))].sort();
  const products = inEv.filter((p) => (!catSel || p.category === catSel) && (!brand || p.brand === brand) && (!q || (p.name + ' ' + (p.brand || '') + ' ' + (p.category || '')).toLowerCase().includes(q)))
    .sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || num(a.sort) - num(b.sort) || a.name.localeCompare(b.name));
  view.innerHTML = `
    <p class="eyebrow">Katalog</p>
    <h1 class="page-title">Produk</h1>
    <p class="page-sub">Katalog ini juga tampil di web untuk buyer (produk yang ditandai tampil & punya harga jual).</p>
    ${webBase() ? `<button class="btn sm" id="shareCat" style="margin-bottom:12px">🔗 Bagikan link katalog</button>` : ''}
    <div class="search"><input class="input" id="pq" placeholder="Cari produk / brand…" value="${esc(viewProducts.q || '')}"></div>
    ${EVENTS.length ? evChips(evP, 'data-evp') : ''}
    ${catsUsed.length ? `<div class="chips">${['', ...catsUsed].map((c) => `<button class="chip ${c === catSel ? 'on' : ''}" data-cat="${esc(c)}">${c ? esc(catIcon(c) + ' ' + c) : 'Semua kategori'}</button>`).join('')}</div>` : ''}
    ${brands.length > 1 ? `<div class="chips">${['', ...brands].map((b) => `<button class="chip ${b === brand ? 'on' : ''}" data-brand="${esc(b)}">${b ? esc(b) : 'Semua brand'}</button>`).join('')}</div>` : ''}
    ${products.length ? products.map((p) => `
      <a class="list-item" href="#/produk/${p.id}">
        ${thumbHTML(p.photo)}
        <div style="flex:1;min-width:0"><div class="title">${esc(p.name)}</div>
          <div class="sub">${(p.events || []).map((id) => esc(evById(id)?.flag || '')).join('')} ${p.brand ? esc(p.brand) : ''}${p.category ? ' · ' + esc(p.category) : ''}${num(p.buyPrice) && !isShopper() ? ' · beli ' + fmtCur(p.buyPrice, p.buyCur) : ''}${p.published === false ? ' · <b>tersembunyi</b>' : ''}</div>
          ${p.badge || p.featured ? `<div style="margin-top:4px">${p.badge ? `<span class="badge st-menunggu">${esc(p.badge)}</span> ` : ''}${p.featured ? '<span class="badge pay-lunas">Pilihan</span>' : ''}</div>` : ''}</div>
        <div class="amount">${num(p.sellPrice) ? fmtIDR(p.sellPrice) : ''}</div></a>`).join('')
    : `<div class="empty"><div class="big">📦</div>Belum ada produk.</div>`}
    ${canSell() ? `<button class="fab" aria-label="Produk baru" onclick="location.hash='#/produk/baru'">+</button>` : ''}`;
  await hydratePhotos();
  const qi = $('#pq');
  qi.oninput = () => { viewProducts.q = qi.value; clearTimeout(viewProducts._t); viewProducts._t = setTimeout(async () => { await viewProducts(); const n = $('#pq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $$('[data-brand]').forEach((b) => b.onclick = () => { viewProducts.brand = b.dataset.brand; viewProducts(); });
  $$('[data-cat]').forEach((b) => b.onclick = () => { viewProducts.cat = b.dataset.cat; viewProducts(); });
  $$('[data-evp]').forEach((b) => b.onclick = () => { viewProducts.ev = b.dataset.evp; viewProducts.cat = ''; viewProducts.brand = ''; viewProducts(); });
  const sc = $('#shareCat'); if (sc) sc.onclick = () => { const e = evById(evP) || curEv(); shareText('Katalog ' + S.business, `${e ? `${e.title} ${e.name}${e.poStart || e.poEnd ? ' (' + fmtRangeD(e.poStart, e.poEnd) + ')' : ''}` : 'Katalog jastip'} — ${S.business}\n${webBase()}${e ? '?e=' + encodeURIComponent(e.code.toLowerCase()) : ''}`); };
}

async function viewProductForm(id) {
  setTab('produk');
  let p = id ? await DB.get('products', id) : null;
  if (id && !p) { location.hash = '#/produk'; return; }
  const ro = !canSell();
  const ev0 = viewProducts.ev ? evById(viewProducts.ev) : curEv();
  p = p ? { ...p, events: [...(p.events || [])] } : { id: 'p_' + uid(), name: '', brand: '', description: '', buyPrice: '', buyCur: evCfg(ev0).currency, sellPrice: '', weight: '', photo: '', note: '', published: true, sort: 0, createdAt: Date.now(),
    category: viewProducts.cat || '', events: ev0 ? [ev0.id] : [], badge: '', featured: false };
  const pEv = () => evById(p.events[0]) || curEv();
  const brands = [...new Set((await DB.all('products')).map((x) => x.brand).filter(Boolean))].sort();
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/produk'">‹ Produk</button>
    <p class="eyebrow">${id ? (ro ? 'Produk' : 'Ubah produk') : 'Produk baru'}</p>
    <h1 class="page-title">${esc(p.name || 'Produk baru')}</h1>
    <fieldset ${ro ? 'disabled' : ''} style="border:0;padding:0;margin:0;min-width:0">
    <section class="card">
      <div class="field"><label>Foto</label><div class="photos" id="pPhoto"></div></div>
      <div class="field"><label class="req">Nama produk</label><input class="input" id="pName" value="${esc(p.name)}"></div>
      <div class="two">
        <div class="field"><label>Brand / toko</label><input class="input" id="pBrand" list="brandList" value="${esc(p.brand)}"><datalist id="brandList">${brands.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></div>
        <div class="field"><label>Berat (gram)</label><input class="input" id="pWeight" data-money inputmode="decimal" value="${esc(p.weight)}"></div>
      </div>
      <div class="field"><label>Deskripsi (tampil di web)</label><textarea class="input" id="pDesc">${esc(p.description)}</textarea></div>
      <div class="field"><label>Kategori</label><select class="input" id="pCat"><option value="">— Pilih kategori —</option>${categories().map((c) => `<option value="${esc(c.name)}" ${c.name === p.category ? 'selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`).join('')}${p.category && !categories().some((c) => c.name === p.category) ? `<option selected>${esc(p.category)}</option>` : ''}</select></div>
      <div class="field"><label>Tersedia di event</label>
        <div class="chips" style="flex-wrap:wrap" id="pEvents">${EVENTS.filter((e) => e.status !== 'done' || p.events.includes(e.id)).map((e) => `<button type="button" class="chip ${p.events.includes(e.id) ? 'on' : ''}" data-pev="${e.id}">${esc(evLabel(e))}</button>`).join('') || '<span class="muted small">Belum ada event</span>'}</div>
        <div class="help">Tidak dipilih = tampil di semua event.</div></div>
      <div class="two">
        <div class="field"><label>Label di web</label><select class="input" id="pBadge">${['', 'Best Seller', 'Ready JKT', 'Baru', 'Promo', 'Limited'].map((b) => `<option value="${b}" ${b === p.badge ? 'selected' : ''}>${b || 'Tanpa label'}</option>`).join('')}</select></div>
        <div class="toggle-row" style="padding-top:28px"><span>Produk pilihan</span><label class="switch"><input type="checkbox" id="pFeat" ${p.featured ? 'checked' : ''}><span></span></label></div>
      </div>
      ${isShopper() ? '' : `<div class="field">
        <div class="money-row"><label class="label-row">Harga beli</label><label class="label-row">Mata uang</label></div>
        <div class="money-row"><input class="input" id="pBuy" data-money data-dec="2" inputmode="decimal" value="${esc(p.buyPrice)}"><select class="input" id="pCur">${curOptions(p.buyCur || 'THB')}</select></div>
      </div>`}
      <div class="field"><label>Harga jual (Rp)</label>
        <div class="row"><input class="input grow" id="pSell" data-money inputmode="decimal" value="${esc(p.sellPrice)}">${ro ? '' : '<button class="btn sm" id="pCalc" type="button">Hitung</button>'}</div>
        <div class="help" id="pHelp"></div></div>
      <div class="toggle-row"><span>Tampilkan di web katalog</span><label class="switch"><input type="checkbox" id="pPub" ${p.published !== false ? 'checked' : ''}><span></span></label></div>
      ${isShopper() ? '' : `<div class="field"><label>Catatan internal</label><textarea class="input" id="pNote">${esc(p.note)}</textarea></div>`}
    </section></fieldset>
    <div class="btn-col">
      ${ro ? '' : '<button class="btn primary" id="pSave">Simpan produk</button>'}
      ${id && canSell() ? '<button class="btn" id="pOrder">Buat pesanan dengan produk ini</button>' : ''}
      ${id && isOwner() ? '<button class="btn danger" id="pDel">Hapus produk</button>' : ''}
    </div>`;
  const drawPhoto = async () => {
    $('#pPhoto').innerHTML = p.photo ? photoTiles([p.photo], !ro) : (ro ? '<span class="muted">Belum ada foto</span>' : photoAdd('product'));
    await hydratePhotos($('#pPhoto'));
  };
  const help = () => {
    if (!$('#pBuy')) return;
    const r = rateOf($('#pCur').value);
    const b = num($('#pBuy').value);
    $('#pHelp').textContent = b && $('#pCur').value !== 'IDR' ? (r ? `Modal ≈ ${fmtIDR(b * r)} (kurs ${fmtRate(r)})` : 'Kurs belum ada') : '';
  };
  await drawPhoto(); help();
  ensureRate(p.buyCur || 'THB').then(() => $('#pHelp') && help());
  view.onclick = (e) => { const z = e.target.closest('[data-zoom]'); if (z && z.src && !e.target.closest('[data-rm-photo]')) openLightbox(z.src); };
  if (ro) return;
  $('#pPhoto').onchange = async (e) => { if (e.target.dataset.addPhoto) { const ids = await savePhotos([e.target.files[0]]); p.photo = ids[0]; drawPhoto(); } };
  $('#pPhoto').addEventListener('click', (e) => { const rm = e.target.closest('[data-rm-photo]'); if (rm) { e.preventDefault(); p.photo = ''; drawPhoto(); } });
  $$('[data-pev]').forEach((b) => b.onclick = () => {
    const id = b.dataset.pev; p.events = p.events.includes(id) ? p.events.filter((x) => x !== id) : [...p.events, id];
    b.classList.toggle('on', p.events.includes(id));
  });
  $('#pBuy').oninput = help;
  $('#pCur').onchange = async () => { await ensureRate($('#pCur').value); help(); };
  $('#pCalc').onclick = () => {
    const cur = $('#pCur').value; const r = rateOf(cur);
    if (!num($('#pBuy').value)) return toast('Isi harga beli dulu');
    if (!r) return toast('Kurs belum ada');
    const cfg = evCfg(pEv());
    const c = calcSell({ buy: $('#pBuy').value, rate: r, weightG: $('#pWeight').value, fee: cfg.fee, shipPerKg: cfg.shipPerKg, rounding: cfg.rounding });
    $('#pSell').value = c.sell; toast(`Harga jual ${fmtIDR(c.sell)}`);
  };
  $('#pSave').onclick = async () => {
    const name = $('#pName').value.trim(); if (!name) return toast('Nama produk wajib diisi');
    Object.assign(p, { name, brand: $('#pBrand').value.trim(), weight: $('#pWeight').value, description: $('#pDesc').value.trim(), buyPrice: $('#pBuy').value, buyCur: $('#pCur').value, sellPrice: $('#pSell').value, note: $('#pNote').value, published: $('#pPub').checked,
      category: $('#pCat').value, badge: $('#pBadge').value, featured: $('#pFeat').checked });
    await saveRow('products', p);
    toast('Produk disimpan ✓'); location.hash = '#/produk';
  };
  const po = $('#pOrder');
  if (po) po.onclick = () => { viewOrderForm.openPicker = true; location.hash = '#/pesanan/baru'; };
  const pd = $('#pDel');
  if (pd) pd.onclick = async () => { if (!(await confirmSheet(`Hapus produk "${p.name}"?`, 'Hapus'))) return; await removeRow('products', p); toast('Produk dihapus'); location.hash = '#/produk'; };
}

/* ================= Views: Customer ================= */
async function viewCustomers() {
  setTab('customer');
  const [customers, orders, pm] = await Promise.all([DB.all('customers'), DB.all('orders'), paidMap()]);
  const q = (viewCustomers.q || '').toLowerCase().trim();
  const qd = q.replace(/\D/g, '');
  const stat = {};
  orders.filter((o) => !['batal', 'menunggu'].includes(o.status)).forEach((o) => { const t = orderTotals(o, pm[o.id]); const s = stat[o.customerId] ||= { n: 0, due: 0 }; s.n++; s.due += t.due; });
  const list = customers.filter((c) => !q || (c.name + ' ' + (c.city || '')).toLowerCase().includes(q) || (qd.length >= 3 && (c.phone || '').includes(qd))).sort((a, b) => a.name.localeCompare(b.name));
  view.innerHTML = `
    <p class="eyebrow">Pelanggan</p>
    <h1 class="page-title">Customer</h1>
    <div class="search"><input class="input" id="cq" placeholder="Cari nama, nomor, kota…" value="${esc(viewCustomers.q || '')}"></div>
    ${list.length ? list.map((c) => { const s = stat[c.id] || { n: 0, due: 0 }; return `
      <a class="list-item" href="#/customer/${c.id}">
        <div class="avatar">${esc(c.name.slice(0, 1).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><div class="title">${esc(c.name)}</div>
          <div class="sub">${esc(fmtPhone(c.phone) || '—')}${c.city ? ' · ' + esc(c.city) : ''} · ${s.n} pesanan</div></div>
        ${s.due > 0 && !isShopper() ? `<span class="badge pay-belum">${fmtIDR(s.due)}</span>` : ''}</a>`; }).join('')
    : `<div class="empty"><div class="big">👥</div>Belum ada customer.</div>`}
    ${canSell() ? '<button class="fab" aria-label="Customer baru" id="addC">+</button>' : ''}`;
  const ac = $('#addC'); if (ac) ac.onclick = () => customerSheet(null, () => viewCustomers());
  const qi = $('#cq');
  qi.oninput = () => { viewCustomers.q = qi.value; clearTimeout(viewCustomers._t); viewCustomers._t = setTimeout(async () => { await viewCustomers(); const n = $('#cq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

function customerSheet(c, onSaved, prefill = {}) {
  const isNew = !c;
  c = c ? { ...c } : { id: 'c_' + uid(), name: prefill.name || '', phone: prefill.phone || '', city: '', address: '', note: '', createdAt: Date.now() };
  openSheet(`<h3>${isNew ? 'Customer baru' : 'Ubah customer'}</h3>
    <div class="field"><label class="req">Nama</label><input class="input" id="sName" value="${esc(c.name)}"></div>
    <div class="field"><label>No. WhatsApp</label><input class="input" id="sPhone" inputmode="tel" value="${esc(c.phone ? fmtPhone(c.phone) : '')}" placeholder="08xx / +62xx"></div>
    <div class="field"><label>Kota</label><input class="input" id="sCity" value="${esc(c.city)}"></div>
    <div class="field"><label>Alamat kirim</label><textarea class="input" id="sAddr">${esc(c.address)}</textarea></div>
    <div class="btn-col"><button class="btn primary" id="sSave">Simpan</button><button class="btn ghost" data-close>Batal</button></div>`, (s) => {
    $('[data-close]', s).onclick = closeSheet;
    $('#sSave', s).onclick = async () => {
      const name = $('#sName', s).value.trim(); if (!name) return toast('Nama wajib diisi');
      const phone = normPhone($('#sPhone', s).value);
      const city = $('#sCity', s).value.trim(); const address = $('#sAddr', s).value.trim();
      if (phone) {
        const dup = (await DB.all('customers')).find((x) => x.phone === phone && x.id !== c.id);
        if (dup) {
          if (await confirmSheet(`Nomor ini sudah terdaftar atas nama ${dup.name}`, `Pakai customer ${dup.name}`, false, 'Satu nomor WhatsApp = satu customer, supaya riwayat dan tagihan tidak terpecah.')) { onSaved && onSaved(dup); }
          return;
        }
      }
      Object.assign(c, { name, phone, city, address });
      await saveRow('customers', c); closeSheet(); toast('Customer disimpan ✓'); onSaved && onSaved(c);
    };
  });
}

async function viewCustomerDetail(id) {
  setTab('customer');
  const c = await DB.get('customers', id);
  if (!c) { location.hash = '#/customer'; return; }
  const [all, pm] = await Promise.all([DB.all('orders'), paidMap()]);
  const orders = all.filter((o) => o.customerId === id).sort((a, b) => b.createdAt - a.createdAt);
  let total = 0, due = 0;
  orders.filter((o) => !['batal', 'menunggu'].includes(o.status)).forEach((o) => { const t = orderTotals(o, pm[o.id]); total += t.total; due += t.due; });
  view.innerHTML = `
    <button class="back" onclick="location.hash='#/customer'">‹ Customer</button>
    <p class="eyebrow">Customer</p>
    <h1 class="page-title">${esc(c.name)}</h1>
    <section class="card">
      <div class="kv"><span>WhatsApp</span><span>${esc(fmtPhone(c.phone) || '—')}</span></div>
      <div class="kv"><span>Kota</span><span>${esc(c.city || '—')}</span></div>
      <div class="kv"><span>Alamat</span><span style="white-space:pre-wrap">${esc(c.address || '—')}</span></div>
      ${isShopper() ? '' : `<div class="kv"><span>Total belanja</span><span>${fmtIDR(total)}</span></div>
      <div class="kv"><span>Belum dibayar</span><span>${fmtIDR(due)}</span></div>`}
    </section>
    <div class="btn-col" style="margin-bottom:18px">
      ${c.phone ? `<button class="btn wa" id="chat">Chat WhatsApp</button>` : ''}
      ${canSell() ? `<button class="btn primary" id="newO">+ Pesanan untuk ${esc(c.name)}</button>
      <div class="two"><button class="btn" id="edit">Ubah</button>${isOwner() ? '<button class="btn danger" id="del">Hapus</button>' : ''}</div>` : ''}
    </div>
    <h2 style="margin-bottom:10px">Riwayat pesanan</h2>
    ${orders.map((o) => { const t = orderTotals(o, pm[o.id]); return `<a class="list-item" href="#/pesanan/${o.id}">
      <div style="flex:1"><div class="title">#${esc(o.code)}</div><div class="sub">${fmtDate(o.createdAt)} · ${t.qty} barang</div>
      <div style="margin-top:6px"><span class="badge st-${o.status}">${statusLabel(o.status)}</span> <span class="badge src-${o.source || 'admin'}">${SOURCES[o.source] || 'Admin'}</span></div></div>
      <div class="amount">${fmtIDR(t.total)}</div></a>`; }).join('') || '<div class="empty">Belum ada pesanan.</div>'}`;
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#chat', () => openWA(c.phone, `Halo Kak ${c.name} 👋`));
  on('#newO', () => { viewOrderForm.presetCustomer = c.id; location.hash = '#/pesanan/baru'; });
  on('#edit', () => customerSheet(c, () => viewCustomerDetail(id)));
  on('#del', async () => {
    if (orders.length) return toast('Customer masih punya pesanan — hapus pesanannya dulu');
    if (!(await confirmSheet(`Hapus customer ${c.name}?`, 'Hapus'))) return;
    await removeRow('customers', c); toast('Customer dihapus'); location.hash = '#/customer';
  });
}

/* ================= Views: Saya (akun, sinkron, pengaturan) ================= */
async function viewSettings() {
  setTab('saya');
  const admins = (await DB.all('admins')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const ops = await DB.all('outbox');
  const failed = ops.filter((o) => o.failed);
  const pendingAdmins = admins.filter((a) => a.role === 'pending').length;
  const off = !navigator.onLine || !Sync.online;
  view.innerHTML = `
    <p class="eyebrow">Akun & pengaturan</p>
    <h1 class="page-title">Saya</h1>
    <section class="card">
      <div class="row"><div class="avatar">${esc((ME.name || '?').slice(0, 1).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><div class="title"><b>${esc(ME.name)}</b></div><div class="sub muted small" style="word-break:break-all">${esc(ME.email || '')} · ${esc(roleLabel(ME.role))}</div></div>
        <button class="btn sm" id="logout">Keluar</button></div>
    </section>

    <section class="card">
      <h2>Sinkronisasi</h2>
      <div class="kv"><span>Status</span><span>${off ? 'Offline — perubahan disimpan di HP' : 'Online'}${Sync.realtime === 'on' ? ' · realtime' : ''}</span></div>
      <div class="kv"><span>Terakhir sinkron</span><span>${fmtAgo(Sync.lastSync)}</span></div>
      <div class="kv"><span>Menunggu dikirim</span><span>${ops.length - failed.length}</span></div>
      ${failed.length ? `<div class="alert err" style="margin-top:12px"><b>${failed.length} perubahan gagal dikirim</b>${failed.slice(0, 5).map((f) => `<div class="small">• ${esc(f.table)} ${esc(f.id)}: ${esc(f.error)}</div>`).join('')}</div>
        <div class="two"><button class="btn" id="retryFailed">Coba lagi</button><button class="btn danger" id="dropFailed">Buang</button></div>` : ''}
      <button class="btn" id="syncNow" style="margin-top:12px">↻ Sinkron sekarang</button>
    </section>

    <section class="card"><div class="card-head"><h2>Event jastip</h2><a href="#/event">${isOwner() ? 'Kelola' : 'Lihat'} →</a></div>
      ${EVENTS.length ? EVENTS.filter((e) => e.status !== 'done').map((e) => `<div class="kv"><span>${esc(evLabel(e))}</span><span>${esc(evStatusLabel(e.status))}${e.id === curEv()?.id ? ' · <b style="color:var(--accent)">aktif</b>' : ''}</span></div>`).join('') : '<p class="muted">Belum ada event.</p>'}
      <button class="btn" id="pickEv" style="margin-top:12px">Ganti event aktif</button>
    </section>

    ${webBase() ? `<section class="card"><h2>Web untuk buyer</h2>
      <p class="hint">Katalog + keranjang. Pesanan dari web masuk ke tab Pesanan sebagai <b>Masuk</b>.</p>
      <div class="kv"><span>Link</span><span class="small" style="word-break:break-all">${esc(webBase())}</span></div>
      <button class="btn" id="shareWeb" style="margin-top:12px">Bagikan link katalog</button></section>` : ''}

    ${isOwner() ? `
    <section class="card">
      <h2>Kelola admin ${pendingAdmins ? `<span class="badge st-menunggu">${pendingAdmins} baru</span>` : ''}</h2>
      <p class="hint">Admin baru mendaftar dari aplikasi (tombol "Admin baru? Daftar di sini"), lalu Anda beri peran di sini.</p>
      ${admins.map((a) => `<div class="pay-row"><div style="min-width:0"><b>${esc(a.name)}</b>${a.id === ME.id ? ' (Anda)' : ''}<div class="muted small" style="word-break:break-all">${esc(a.email || '')}</div></div>
        <select class="input" data-role="${a.id}" style="width:auto;min-height:44px;padding:8px 36px 8px 12px" ${a.id === ME.id ? 'disabled' : ''}>${ROLES.map(([k, l]) => `<option value="${k}" ${k === a.role ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}
      <button class="btn ghost" id="viewLog" style="margin-top:12px">📜 Lihat log aktivitas</button>
    </section>

    <section class="card">
      <h2>Profil usaha</h2>
      <div class="field"><label>Nama usaha</label><input class="input" id="sBiz" value="${esc(S.business)}"></div>
      <div class="field"><label>No. WhatsApp usaha (penerima order web)</label><input class="input" id="sWa" inputmode="tel" value="${esc(S.ownerWa ? fmtPhone(S.ownerWa) : '')}"></div>
      <div class="field"><label>Link web buyer</label><input class="input" id="sWeb" value="${esc(S.webUrl)}"></div>
    </section>

    <section class="card">
      <h2>Kategori produk</h2>
      <p class="hint">Satu baris satu kategori: emoji lalu nama. Dipakai di aplikasi & web buyer.</p>
      <textarea class="input" id="sCats" style="min-height:220px">${esc(categories().map((c) => `${c.icon} ${c.name}`).join('\n'))}</textarea>
    </section>

    <section class="card">
      <h2>Template nota WhatsApp</h2>
      <p class="hint">Kode: {nama} {kode} {trip} {event} {rincian} {subtotal} {ongkir} {diskon} {total} {dibayar} {sisa} {status} {lacak} {katalog} {usaha}</p>
      <textarea class="input" id="sTpl" style="min-height:240px">${esc(S.template)}</textarea>
      <button class="btn ghost" id="sTplReset" style="margin-top:8px">Kembalikan ke template bawaan</button>
    </section>
    <button class="btn primary" id="sSave" style="margin-bottom:16px">Simpan pengaturan (untuk semua admin)</button>`
    : `<section class="card"><h2>Pengaturan usaha</h2>
      <div class="kv"><span>Usaha</span><span>${esc(S.business)}</span></div>
      <div class="kv"><span>Event aktif di HP ini</span><span>${esc(evLabel(curEv()))}</span></div>
      <p class="help">Diatur oleh owner.</p></section>`}

    <section class="card">
      <h2>Kurs</h2>
      ${CURRENCIES.filter(([c]) => c !== 'IDR' && (lockedRate(c) || L.rates[c])).map(([c]) => `<div class="kv"><span>1 ${c}</span><span>${fmtIDR(rateOf(c))} <span class="muted small">· ${lockedRate(c) ? '🔒 dikunci owner' : fmtAgo(L.rates[c].at)}</span></span></div>`).join('') || '<p class="muted">Belum ada — buka Kalkulator di Beranda.</p>'}
    </section>

    ${isShopper() ? '' : `<section class="card">
      <h2>Ekspor data</h2>
      <p class="hint">Data utama tersimpan di server (Supabase). Ekspor ini untuk laporan atau cadangan tambahan.</p>
      <div class="btn-col">
        <button class="btn" id="bCsv">Ekspor rekap pesanan (.csv)</button>
        <button class="btn" id="bExport">Ekspor cadangan (.json)</button>
      </div>
    </section>`}
    <p class="muted small center">KuyTitip v4 · Supabase · kurs: open.er-api.com / Frankfurter</p>`;

  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#logout', logout);
  on('#pickEv', pickEventSheet);
  on('#syncNow', async () => { toast('Menyinkronkan…'); await Sync.flush(); try { await Sync.pull(); toast('Sinkron selesai ✓'); } catch (e) { toast('Gagal: ' + (e.message || e)); } viewSettings(); });
  on('#retryFailed', async () => { for (const f of failed) { delete f.failed; delete f.error; await DB.put('outbox', f); } await Sync.flush(); viewSettings(); });
  on('#dropFailed', async () => {
    if (!(await confirmSheet('Buang perubahan yang gagal?', 'Buang', true, 'Data di HP akan diganti dengan versi server.'))) return;
    await DB.delMany('outbox', failed.map((f) => f.seq)); await kvPut('lastPull', {});
    await Sync.pull({ full: true }).catch(() => {}); viewSettings();
  });
  on('#shareWeb', () => shareText('Katalog ' + S.business, `Katalog jastip ${S.business}:\n${webBase()}`));
  on('#bCsv', exportCSV);
  on('#bExport', exportBackup);
  if (!isOwner()) return;
  $$('[data-role]').forEach((sel) => sel.onchange = async () => {
    const a = admins.find((x) => x.id === sel.dataset.role);
    if (sel.value === 'owner' && !(await confirmSheet(`Jadikan ${a.name} owner?`, 'Ya, jadikan owner', false, 'Owner punya akses penuh termasuk menghapus data dan mengelola admin.'))) { sel.value = a.role; return; }
    a.role = sel.value; await DB.put('admins', a);
    await Sync.enqueue({ table: 'admins', kind: 'update', id: a.id, patch: { role: a.role } });
    toast(`${a.name}: ${roleLabel(a.role)}`);
  });
  on('#viewLog', showLog);
  on('#sTplReset', () => { $('#sTpl').value = DEFAULT_TEMPLATE; });
  on('#sSave', async () => {
    Object.assign(S, {
      business: $('#sBiz').value.trim() || 'KuyTitip', ownerWa: normPhone($('#sWa').value),
      webUrl: $('#sWeb').value.trim(), template: $('#sTpl').value || DEFAULT_TEMPLATE,
      categories: $('#sCats').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)\s*(.+)$/u);
        return m ? { icon: m[1], name: m[2].trim() } : { icon: '🛍️', name: l };
      }),
    });
    await saveShared(); toast('Pengaturan disimpan untuk semua admin ✓');
  });
}

async function showLog() {
  openSheet('<h3>Log aktivitas</h3><div class="pick" id="logList"><p class="muted">Memuat…</p></div><button class="btn ghost" data-close>Tutup</button>', async (s) => {
    $('[data-close]', s).onclick = closeSheet;
    try {
      const { data, error } = await supa.from('activity_log').select('*').order('at', { ascending: false }).limit(150);
      if (error) throw error;
      $('#logList', s).innerHTML = data.map((l) => `<div class="log-row"><b>${esc(l.admin_name || '—')}</b> · ${esc(l.action)} <b>${esc(l.ref_label || '')}</b>${l.detail ? ` · ${esc(l.detail)}` : ''}<div class="muted small">${fmtDateTime(Date.parse(l.at))}</div></div>`).join('') || '<p class="muted">Belum ada aktivitas.</p>';
    } catch (e) { $('#logList', s).innerHTML = `<p class="muted">Butuh internet untuk melihat log. (${esc(e.message || e)})</p>`; }
  });
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
  const data = { app: 'kuytitip', version: 2, exportedAt: new Date().toISOString(), settings: S };
  for (const s of DATA_TABLES) data[s] = await DB.all(s);
  await saveFile(`kuytitip-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
}
async function exportCSV() {
  const [orders, customers, pm] = await Promise.all([DB.all('orders'), DB.all('customers'), paidMap()]);
  const cmap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Kode', 'Tanggal', 'Trip', 'Sumber', 'PIC', 'Customer', 'No WA', 'Status', 'Barang', 'Qty', 'Harga beli', 'Mata uang', 'Kurs', 'Modal (Rp)', 'Harga jual (Rp)', 'Subtotal (Rp)', 'Total pesanan (Rp)', 'Dibayar (Rp)']];
  orders.sort((a, b) => a.createdAt - b.createdAt).forEach((o) => {
    const t = orderTotals(o, pm[o.id]);
    (o.items || []).forEach((it, i) => {
      const r = itemRate(it); const sell = itemSellIDR(it);
      rows.push([o.code, new Date(o.createdAt).toISOString().slice(0, 10), o.trip, SOURCES[o.source] || '', o.picName, cmap[o.customerId]?.name, cmap[o.customerId]?.phone, statusLabel(o.status), it.name, num(it.qty), num(it.buyPrice), it.buyCur, r, Math.round(num(it.buyPrice) * r * num(it.qty)), Math.round(sell), Math.round(sell * num(it.qty)), i === 0 ? Math.round(t.total) : '', i === 0 ? Math.round(t.paid) : '']);
    });
  });
  await saveFile(`kuytitip-rekap-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\n'), 'text/csv');
}

/* ================= Router ================= */
const ROUTES = [
  [/^#\/beranda$/, viewHome],
  [/^#\/pesanan$/, (m, p) => viewOrders(p)],
  [/^#\/pesanan\/baru$/, () => viewOrderForm(null)],
  [/^#\/pesanan\/([\w-]+)\/edit$/, (m) => viewOrderForm(m[1])],
  [/^#\/pesanan\/([\w-]+)$/, (m) => viewOrderDetail(m[1])],
  [/^#\/belanja$/, viewShopping],
  [/^#\/produk$/, viewProducts],
  [/^#\/produk\/baru$/, () => viewProductForm(null)],
  [/^#\/produk\/([\w-]+)$/, (m) => viewProductForm(m[1])],
  [/^#\/customer$/, viewCustomers],
  [/^#\/customer\/([\w-]+)$/, (m) => viewCustomerDetail(m[1])],
  [/^#\/saya$/, viewSettings],
  [/^#\/event$/, viewEvents],
  [/^#\/event\/baru$/, () => viewEventForm(null)],
  [/^#\/event\/([\w-]+)$/, (m) => viewEventForm(m[1])],
];
const TAB_ROOTS = ['#/beranda', '#/pesanan', '#/produk', '#/customer', '#/saya'];
async function route(opts = {}) {
  if (!ME || !['owner', 'order', 'shopper'].includes(ME.role)) return;
  if (!opts.keepScroll) closeSheet();
  FORM_OPEN = false;
  view.onclick = null;
  const full = location.hash || '#/beranda';
  const [h, qs] = full.split('?');
  const params = new URLSearchParams(qs || '');
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) {
      try { await fn(m, params); formatMoneyInputs(view); } catch (e) { console.error(e); view.innerHTML = `<div class="empty"><div class="big">⚠️</div>Terjadi kesalahan: ${esc(e.message)}</div>`; }
      if (!opts.keepScroll) window.scrollTo(0, 0);
      return;
    }
  }
  location.replace('#/beranda');
}

/* ================= Boot ================= */
async function boot() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
  await loadLocalSettings();
  renderChrome();
  window.addEventListener('hashchange', () => route());
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('input[data-money]')) formatMoneyLive(e.target); }, true);
  $('#syncBtn').onclick = () => { location.hash = '#/saya'; };
  $('#rateChip').onclick = pickEventSheet;
  document.addEventListener('focusin', (e) => { if (e.target.matches('input:not([type=file]):not([type=checkbox]), textarea, select')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, textarea, select')) document.body.classList.remove('typing'); }, 50));
  const App = plugin('App');
  if (App) {
    App.addListener('backButton', () => {
      if ($('.lightbox')) return $('.lightbox').remove();
      if (sheet.open) return closeSheet();
      const h = (location.hash || '#/beranda').split('?')[0];
      if (h === '#/beranda' || !ME) return App.exitApp();
      if (TAB_ROOTS.includes(h)) return location.replace('#/beranda');
      history.back();
    });
  }
  if (supa) supa.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && ME) { ME = null; viewLogin(); } });
  await afterAuth();
}
boot();
})();
