/* Web katalog buyer — multi-event (Bangkok, Australia, Jepang, ...) → keranjang → pesanan + WhatsApp */
(() => {
'use strict';
const CFG = window.KT_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtIDR = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const photoUrl = (id) => !id ? '' : /^https?:/.test(id) ? id : `${CFG.supabaseUrl}/storage/v1/object/public/photos/${encodeURIComponent(id)}.jpg`;
const supa = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
function fmtRange(a, b) {
  if (!a && !b) return '';
  const d = (s) => { const x = new Date(s + 'T00:00:00'); return { d: String(x.getDate()).padStart(2, '0'), m: MONTHS[x.getMonth()], y: x.getFullYear() }; };
  if (a && b) { const A = d(a), B = d(b); return A.y === B.y ? `${A.d} ${A.m} – ${B.d} ${B.m} ${B.y}` : `${A.d} ${A.m} ${A.y} – ${B.d} ${B.m} ${B.y}`; }
  const X = d(a || b); return `${a ? 'Mulai' : 'Sampai'} ${X.d} ${X.m} ${X.y}`;
}
function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2000); }

let INFO = {}; let EVENTS = []; let PRODUCTS = []; let EV = null;
let cat = ''; let brand = ''; let query = '';
let carts = store.get('kt-carts', {});
let likes = new Set(store.get('kt-likes', []));
let buyer = store.get('kt-buyer', {});
const sheet = $('#sheet');
const waNum = () => String(INFO.wa || '').replace(/\D/g, '');
const waLink = (text) => `https://wa.me/${waNum()}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const cart = () => (carts[EV?.id] ||= {});
const saveCarts = () => store.set('kt-carts', carts);
const evProducts = () => PRODUCTS.filter((p) => !p.events || !p.events.length || p.events.includes(EV?.id));

const DEFAULT_FAQ = [
  ['Apakah perlu daftar akun?', 'Tidak perlu. Cukup isi nama dan nomor WhatsApp saat mengirim pesanan.'],
  ['Apakah barangnya original?', 'Ya. Semua barang dibeli langsung di toko resmi, dan foto struk belanja bisa dilihat di halaman lacak pesanan.'],
  ['Bagaimana cara bayar?', 'Setelah admin mengonfirmasi stok & ongkir, tagihan dikirim lewat WhatsApp. Biasanya DP dulu, pelunasan saat barang tiba.'],
  ['Kapan barang sampai?', 'Estimasi tiba mengikuti jadwal tiap event jastip. Status terbaru bisa dicek di link lacak pesanan.'],
];

async function load() {
  try {
    const { data, error } = await supa.rpc('catalog');
    if (error) throw error;
    INFO = data.info || {}; EVENTS = data.events || []; PRODUCTS = data.products || [];
  } catch (e) {
    $('#hero').innerHTML = `<div class="hero-in"><h2>Katalog belum bisa dimuat</h2><p class="sub">Coba muat ulang halaman.<br><small>${esc(e.message || e)}</small></p></div>`;
    return;
  }
  document.title = `${INFO.business || 'Jastip'} — Katalog Jastip`;
  $('#biz').textContent = INFO.business || 'Katalog Jastip';
  $('#bizFoot').textContent = INFO.business || 'Katalog Jastip';
  if (waNum()) {
    const hello = waLink(`Halo ${INFO.business || 'admin'}, saya mau tanya soal jastip 🙏`);
    ['#chatTop', '#chatFoot'].forEach((s) => { const a = $(s); a.hidden = false; a.href = hello; });
    $('#chatBottom').href = hello;
  }
  const want = new URLSearchParams(location.search).get('e') || store.get('kt-event', '');
  EV = EVENTS.find((e) => e.code.toLowerCase() === String(want).toLowerCase() || e.id === want)
    || EVENTS.find((e) => e.status === 'open') || EVENTS[0] || null;
  // bersihkan keranjang dari produk yang sudah tidak ada
  const ids = new Set(PRODUCTS.map((p) => p.id));
  Object.values(carts).forEach((c) => Object.keys(c).forEach((id) => { if (!ids.has(id)) delete c[id]; }));
  saveCarts();
  renderAll();
}

function setEvent(ev) {
  EV = ev; cat = ''; brand = ''; query = ''; $('#q').value = '';
  store.set('kt-event', ev.id);
  const u = new URL(location.href); u.searchParams.set('e', ev.code.toLowerCase()); history.replaceState(null, '', u);
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderTabs(); renderHero(); renderCats(); renderProducts(); renderBrands(); renderSchedule(); renderFaq(); renderBar();
}

function renderTabs() {
  const t = $('#evTabs');
  t.hidden = EVENTS.length < 2;
  t.innerHTML = EVENTS.map((e) => `<button class="ev-tab ${e.id === EV?.id ? 'on' : ''}" data-ev="${e.id}" style="--ev:${esc(e.color || '#ef3b2d')}">
    <span class="fl">${esc(e.flag || '✈️')}</span><span><b>${esc(e.name)}</b><small>${e.status === 'open' ? 'PO dibuka' : 'PO ditutup'}${e.poEnd ? ' · s/d ' + fmtRange(null, e.poEnd).replace('Sampai ', '') : ''}</small></span></button>`).join('');
}

function renderHero() {
  const h = $('#hero');
  if (!EV) {
    h.innerHTML = `<div class="hero-bg fallback"></div><div class="hero-in"><span class="pill">SEGERA</span><h1>Jastip</h1><p class="tag">Belum ada PO yang dibuka. Pantau terus jadwal berikutnya ya!</p></div>`;
    return;
  }
  document.documentElement.style.setProperty('--ev', EV.color || '#ef3b2d');
  const dates = fmtRange(EV.poStart, EV.poEnd);
  const bg = EV.banner ? `<div class="hero-bg" style="background-image:url('${esc(photoUrl(EV.banner))}')"></div>` : `<div class="hero-bg fallback"></div><div class="hero-flag" aria-hidden="true">${esc(EV.flag || '✈️')}</div>`;
  h.innerHTML = `${bg}<div class="hero-fade"></div>
    <div class="hero-in">
      <span class="pill">${esc(EV.title || 'OPEN JASTIP')}</span>
      <h1${EV.name.length > 12 ? " class=\"long\"" : ""}>${esc(EV.name)}</h1>
      ${dates ? `<div class="dates">${esc(dates)}</div>` : ''}
      <p class="tag">${esc(EV.tagline || INFO.tagline || 'Produk original langsung dari tokonya')}</p>
      ${EV.note ? `<p class="sub">${esc(EV.note)}</p>` : ''}
      <div class="trust"><span><i>🛡️</i>100% Original</span><span><i>🏬</i>Langsung dari Toko</span><span><i>💬</i>Konfirmasi via WhatsApp</span></div>
      ${EV.status !== 'open' ? `<div class="closed-note">PO ${esc(EV.name)} sedang ditutup — katalog tetap bisa dilihat.</div>` : ''}
    </div>
    <div class="hero-side">
      <div><i>✈️</i><span><small>Periode PO</small>${esc(dates || 'Segera diumumkan')}</span></div>
      ${EV.eta ? `<div><i>📦</i><span><small>Estimasi tiba</small>${esc(EV.eta)}</span></div>` : '<div><i>🏷️</i>Produk Original</div>'}
      <div><i>🏬</i>Langsung dari Toko</div>
      <div><i>✅</i>Admin konfirmasi via WhatsApp</div>
    </div>`;
}

function catsFor() {
  const used = new Set(evProducts().map((p) => p.category).filter(Boolean));
  const list = (INFO.categories || []).filter((c) => used.has(c.name));
  used.forEach((n) => { if (!list.find((c) => c.name === n)) list.push({ name: n, icon: '🛍️' }); });
  return list;
}
function renderCats() {
  const list = catsFor();
  const el = $('#cats');
  el.classList.remove('open');
  el.innerHTML = list.length ? [`<button class="cat ${!cat ? 'on' : ''}" data-cat=""><i>🛍️</i>Semua</button>`,
    ...list.map((c, i) => `<button class="cat ${c.name === cat ? 'on' : ''} ${i >= 6 ? 'extra' : ''}" data-cat="${esc(c.name)}"><i>${esc(c.icon || '🛍️')}</i>${esc(c.name)}</button>`),
    list.length > 6 ? '<button class="cat more-cats" data-more="1"><i>⋯</i>Lainnya</button>' : ''].join('') : '';
  const more = $('.more-cats', el); if (more && window.matchMedia('(min-width: 641px)').matches) more.hidden = true;
}

function filtered() {
  const q = query.trim().toLowerCase();
  return evProducts().filter((p) => (!cat || p.category === cat) && (!brand || p.brand === brand)
    && (!q || `${p.name} ${p.brand} ${p.description} ${p.category}`.toLowerCase().includes(q)));
}
function cardHTML(p) {
  const n = cart()[p.id] || 0;
  const open = EV?.status === 'open';
  return `<article class="card">
    <div class="ph" data-zoom="${esc(photoUrl(p.photo))}">${p.photo ? `<img src="${esc(photoUrl(p.photo))}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : '📦'}
      ${p.badge ? `<span class="ribbon">${esc(p.badge)}</span>` : ''}
      <button class="heart" data-like="${p.id}" aria-label="Simpan">${likes.has(p.id) ? '♥' : '♡'}</button></div>
    <div class="body">
      ${p.brand ? `<div class="br">${esc(p.brand)}</div>` : ''}
      <div class="nm">${esc(p.name)}</div>
      ${p.description ? `<div class="ds">${esc(p.description)}</div>` : ''}
      <div class="pr">${fmtIDR(p.price)}</div>
      <div class="buy">
        <div class="step"><button data-dec="${p.id}" aria-label="Kurangi">−</button><span>${n || 1}</span><button data-inc="${p.id}" aria-label="Tambah">+</button></div>
        <button class="add ${n ? 'in' : ''}" data-add="${p.id}" ${open ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg><span class="lbl">${n ? 'Di keranjang' : 'Keranjang'}</span></button>
      </div>
    </div></article>`;
}
const pending = {}; // qty pilihan sebelum masuk keranjang
function renderProducts() {
  const all = filtered();
  const feat = !cat && !brand && !query ? evProducts().filter((p) => p.featured || p.badge).slice(0, 8) : [];
  $('#featuredSec').hidden = !feat.length;
  $('#featured').innerHTML = feat.map(cardHTML).join('');
  $('#prodTitle').textContent = query ? `Hasil "${query}"` : brand ? `Produk ${brand}` : cat || (EV ? `Semua Produk ${EV.name}` : 'Semua Produk');
  $('#prodCount').textContent = `${all.length} produk`;
  $('#grid').innerHTML = all.length ? all.map(cardHTML).join('') : '<div class="empty">Produk tidak ditemukan.</div>';
  $$('.step span').forEach((s) => { const id = s.previousElementSibling.dataset.dec; if (!cart()[id] && pending[id]) s.textContent = pending[id]; });
}
function renderBrands() {
  const bs = [...new Set(evProducts().map((p) => p.brand).filter(Boolean))];
  $('#brandSec').hidden = bs.length < 2;
  $('#brands').innerHTML = bs.map((b) => `<button class="brand ${b === brand ? 'on' : ''}" data-brand="${esc(b)}">${esc(b)}</button>`).join('');
}
function renderSchedule() {
  $('#sched').innerHTML = EVENTS.length ? EVENTS.map((e) => `<button class="sched-card" data-ev="${e.id}">
    <span class="fl">${esc(e.flag || '✈️')}</span><span><b>${esc(e.title || 'OPEN JASTIP')} ${esc(e.name)}</b>
    <small>${esc(fmtRange(e.poStart, e.poEnd) || 'Jadwal segera diumumkan')}${e.eta ? ' · tiba ' + esc(e.eta) : ''}</small><br>
    <span class="st ${e.status}">${e.status === 'open' ? 'PO dibuka' : 'PO ditutup'}</span></span></button>`).join('')
    : '<div class="empty">Jadwal jastip berikutnya segera diumumkan.</div>';
}
function renderFaq() {
  const faq = (INFO.faq && INFO.faq.length ? INFO.faq.map((f) => [f.q, f.a]) : DEFAULT_FAQ);
  $('#faqList').innerHTML = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
}

function lines() { return Object.entries(cart()).map(([id, qty]) => ({ p: PRODUCTS.find((x) => x.id === id), qty })).filter((l) => l.p && l.qty > 0); }
function renderBar() {
  const ls = lines();
  const count = ls.reduce((a, l) => a + l.qty, 0);
  const total = ls.reduce((a, l) => a + l.qty * Number(l.p.price), 0);
  ['#cartCount', '#cartCount2'].forEach((s) => { const c = $(s); c.hidden = !count; c.textContent = count; });
  $('#cartbar').hidden = !count;
  $('#cartTotal').textContent = fmtIDR(total);
  $('#cartInfo').textContent = `${count} barang · ${EV ? EV.name : ''}`;
}
function setQty(id, qty) {
  qty = Math.max(0, Math.min(99, qty));
  if (qty) cart()[id] = qty; else delete cart()[id];
  saveCarts(); renderProducts(); renderBar();
  if (sheet.open && sheet.dataset.mode === 'cart') openCart();
}

function openSheet(html, mode) {
  sheet.innerHTML = `<div class="sheet-in">${html}</div>`;
  sheet.dataset.mode = mode;
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

function openCart(errMsg = '') {
  const ls = lines();
  if (!ls.length) {
    openSheet(`<div class="sheet-head"><h2>Keranjang</h2><button class="x" data-close>✕</button></div>
      <div class="empty">Keranjang ${EV ? esc(EV.name) : ''} masih kosong.</div><button class="btn red" data-close>Lihat produk</button>`, 'cart');
    return;
  }
  const total = ls.reduce((a, l) => a + l.qty * Number(l.p.price), 0);
  openSheet(`
    <div class="sheet-head"><div><h2>Keranjang</h2><span class="ev-badge">${esc(EV.flag || '')} ${esc(EV.title || 'Jastip')} ${esc(EV.name)}</span></div><button class="x" data-close aria-label="Tutup">✕</button></div>
    ${ls.map((l) => `<div class="line-item">
      ${l.p.photo ? `<img src="${esc(photoUrl(l.p.photo))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'📦'}))">` : '<div class="noimg">📦</div>'}
      <div style="flex:1;min-width:0"><div class="nm">${esc(l.p.name)}</div><div class="sub">${fmtIDR(l.p.price)} × ${l.qty} = <b>${fmtIDR(l.p.price * l.qty)}</b></div></div>
      <div class="step"><button data-cdec="${l.p.id}">−</button><span>${l.qty}</span><button data-cinc="${l.p.id}">+</button></div>
    </div>`).join('')}
    <div class="sum"><span>Total barang</span><b>${fmtIDR(total)}</b></div>
    ${EV.status !== 'open' ? `<div class="err">PO ${esc(EV.name)} sedang ditutup. Silakan chat admin untuk info jadwal berikutnya.</div>` : `
    <form id="orderForm">
      ${errMsg ? `<div class="err">${esc(errMsg)}</div>` : ''}
      <div class="field"><label class="req" for="fName">Nama</label><input class="input" id="fName" autocomplete="name" required value="${esc(buyer.name || '')}"></div>
      <div class="field"><label class="req" for="fPhone">No. WhatsApp</label><input class="input" id="fPhone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="08xx" value="${esc(buyer.phone || '')}"></div>
      <div class="two">
        <div class="field"><label for="fCity">Kota</label><input class="input" id="fCity" autocomplete="address-level2" value="${esc(buyer.city || '')}"></div>
        <div class="field"><label for="fNote">Catatan</label><input class="input" id="fNote" placeholder="warna, varian…"></div>
      </div>
      <div class="field"><label for="fAddr">Alamat kirim (opsional)</label><textarea class="input" id="fAddr" autocomplete="street-address">${esc(buyer.address || '')}</textarea></div>
      <button class="btn wa" id="sendBtn" type="submit">Kirim pesanan via WhatsApp</button>
      <p class="note">Tidak perlu daftar akun. Pesanan masuk ke admin sebagai <b>menunggu konfirmasi</b>; admin akan cek stok & ongkir lalu mengirim tagihan lewat WhatsApp.</p>
    </form>`}`, 'cart');
  const f = $('#orderForm'); if (f) f.onsubmit = submitOrder;
}

async function submitOrder(e) {
  e.preventDefault();
  const name = $('#fName').value.trim(); const phone = $('#fPhone').value.trim();
  const city = $('#fCity').value.trim(); const address = $('#fAddr').value.trim(); const note = $('#fNote').value.trim();
  buyer = { name, phone, city, address }; store.set('kt-buyer', buyer);
  const ls = lines();
  const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Mengirim pesanan…';
  try {
    const { data, error } = await supa.rpc('place_web_order', {
      p_name: name, p_phone: phone, p_items: ls.map((l) => ({ id: l.p.id, qty: l.qty })),
      p_city: city, p_address: address, p_note: note, p_event: EV.id,
    });
    if (error) throw error;
    const track = new URL(`lacak.html?k=${encodeURIComponent(data.code)}&t=${encodeURIComponent(data.token)}`, location.href).href;
    const msg = `Halo ${INFO.business || 'admin'} 👋, saya sudah order ${EV.title || 'jastip'} ${EV.name} lewat katalog.\n\n` +
      `Kode pesanan: *${data.code}*\nNama: ${name}\n\n` +
      ls.map((l, i) => `${i + 1}. ${l.p.name} × ${l.qty} = ${fmtIDR(l.p.price * l.qty)}`).join('\n') +
      `\n\n*Total barang: ${fmtIDR(data.total)}*${note ? `\nCatatan: ${note}` : ''}\n\nMohon dikonfirmasi ya 🙏\nLacak pesanan: ${track}`;
    const mine = store.get('kt-orders', []);
    mine.unshift({ code: data.code, token: data.token, total: data.total, ev: EV.name, flag: EV.flag, at: Date.now() });
    store.set('kt-orders', mine.slice(0, 30));
    carts[EV.id] = {}; saveCarts(); renderProducts(); renderBar();
    openSheet(`<div class="ok-box"><div class="big">🎉</div><h2>Pesanan terkirim!</h2>
      <p>Kode pesanan Anda</p><div class="code">${esc(data.code)}</div>
      <p class="note">Langkah terakhir: kirim pesan WhatsApp ke admin supaya pesanan cepat dikonfirmasi.</p></div>
      <div class="btn-col" style="margin-top:14px">
        <a class="btn wa" href="${esc(waLink(msg))}" target="_blank" rel="noopener">Buka WhatsApp</a>
        <a class="btn ghost" href="${esc(track)}">Lihat status pesanan</a>
        <button class="btn ghost" data-close>Kembali ke katalog</button></div>`, 'done');
    if (waNum()) { try { window.open(waLink(msg), '_blank', 'noopener'); } catch (err) { /* popup diblokir: tombol tetap ada */ } }
  } catch (err) {
    const m = String(err.message || err);
    openCart(/fetch|network/i.test(m) ? 'Koneksi terputus, coba lagi.' : m);
  }
}

function openMyOrders() {
  const mine = store.get('kt-orders', []);
  openSheet(`<div class="sheet-head"><h2>Pesanan saya</h2><button class="x" data-close>✕</button></div>
    ${mine.length ? mine.map((o) => `<a class="order-row" href="lacak.html?k=${encodeURIComponent(o.code)}&t=${encodeURIComponent(o.token)}">
      <span class="fl">${esc(o.flag || '🛍️')}</span><span style="flex:1"><b>${esc(o.code)}</b><small>${esc(o.ev || '')} · ${new Date(o.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</small></span>
      <b>${fmtIDR(o.total)}</b></a>`).join('') : '<div class="empty">Belum ada pesanan dari HP ini.</div>'}
    <p class="note">Daftar ini tersimpan di HP/browser ini saja. Link lacak juga ada di nota WhatsApp dari admin.</p>`, 'orders');
}

document.addEventListener('click', (e) => {
  const t = e.target;
  const ev = t.closest('[data-ev]'); if (ev) { const x = EVENTS.find((z) => z.id === ev.dataset.ev); if (x) setEvent(x); return; }
  const like = t.closest('[data-like]'); if (like) { const id = like.dataset.like; likes.has(id) ? likes.delete(id) : likes.add(id); store.set('kt-likes', [...likes]); like.textContent = likes.has(id) ? '♥' : '♡'; return; }
  const inc = t.closest('[data-inc]'); if (inc) { const id = inc.dataset.inc; if (cart()[id]) setQty(id, cart()[id] + 1); else { pending[id] = Math.min(99, (pending[id] || 1) + 1); renderProducts(); } return; }
  const dec = t.closest('[data-dec]'); if (dec) { const id = dec.dataset.dec; if (cart()[id]) setQty(id, cart()[id] - 1); else { pending[id] = Math.max(1, (pending[id] || 1) - 1); renderProducts(); } return; }
  const add = t.closest('[data-add]'); if (add) { const id = add.dataset.add; if (!cart()[id]) { setQty(id, pending[id] || 1); delete pending[id]; toast('Masuk keranjang ✓'); } else openCart(); return; }
  const ci = t.closest('[data-cinc]'); if (ci) return setQty(ci.dataset.cinc, (cart()[ci.dataset.cinc] || 0) + 1);
  const cd = t.closest('[data-cdec]'); if (cd) return setQty(cd.dataset.cdec, (cart()[cd.dataset.cdec] || 0) - 1);
  const c = t.closest('[data-cat]'); if (c) { cat = c.dataset.cat; renderCats(); renderProducts(); document.getElementById('produk').scrollIntoView({ behavior: 'smooth' }); return; }
  if (t.closest('[data-more]')) { $('#cats').classList.toggle('open'); return; }
  const b = t.closest('[data-brand]'); if (b) { brand = brand === b.dataset.brand ? '' : b.dataset.brand; renderBrands(); renderProducts(); document.getElementById('produk').scrollIntoView({ behavior: 'smooth' }); return; }
  const z = t.closest('[data-zoom]');
  if (z && z.dataset.zoom && !t.closest('button')) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(z.dataset.zoom)}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); }
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); query = $('#q').value; renderProducts(); document.getElementById('produk').scrollIntoView({ behavior: 'smooth' }); });
let qt; $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value; renderProducts(); }, 200); });
['#cartBtn', '#cartBtn2', '#openCart'].forEach((s) => { $(s).onclick = () => openCart(); });
['#myOrdersBtn', '#myOrdersBtn2'].forEach((s) => { $(s).onclick = openMyOrders; });
// tandai menu aktif sesuai bagian yang sedang dilihat
const navs = $$('.links a, .bottom a[href^="#"]');
const io = new IntersectionObserver((ents) => ents.forEach((en) => {
  if (!en.isIntersecting) return;
  const h = en.target.id === 'hero' ? '#top' : '#' + en.target.id;
  navs.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === h));
}), { rootMargin: '-40% 0px -55% 0px' });
['hero', 'produk', 'jadwal', 'cara', 'faq'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
load();
})();
