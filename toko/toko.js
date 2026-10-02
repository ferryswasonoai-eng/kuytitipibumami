/* Web katalog buyer — membaca produk dari Supabase, keranjang, kirim pesanan → WhatsApp */
(() => {
'use strict';
const CFG = window.KT_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtIDR = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const photoUrl = (id) => !id ? '' : /^https?:/.test(id) ? id : `${CFG.supabaseUrl}/storage/v1/object/public/photos/${encodeURIComponent(id)}.jpg`;
const supa = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

let INFO = {}; let PRODUCTS = []; let brand = ''; let query = '';
let cart = {};
try { cart = JSON.parse(localStorage.getItem('kt-cart') || '{}') || {}; } catch (e) { cart = {}; }
let buyer = {};
try { buyer = JSON.parse(localStorage.getItem('kt-buyer') || '{}') || {}; } catch (e) { buyer = {}; }
const saveCart = () => { try { localStorage.setItem('kt-cart', JSON.stringify(cart)); } catch (e) { /* abaikan */ } };
const sheet = $('#sheet');

function waLink(text) {
  const n = String(INFO.wa || '').replace(/\D/g, '');
  return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

async function load() {
  try {
    const { data, error } = await supa.rpc('catalog');
    if (error) throw error;
    INFO = data.info || {};
    PRODUCTS = data.products || [];
  } catch (e) {
    $('#grid').innerHTML = `<div class="empty">Katalog belum bisa dimuat. Coba muat ulang halaman.<br><small>${esc(e.message || e)}</small></div>`;
    return;
  }
  const ids = new Set(PRODUCTS.map((p) => p.id));
  Object.keys(cart).forEach((id) => { if (!ids.has(id)) delete cart[id]; });
  saveCart();
  document.title = `Katalog ${INFO.business || 'Jastip'}`;
  $('#biz').textContent = INFO.business || 'Katalog Jastip';
  if (INFO.wa) { const c = $('#chatBtn'); c.hidden = false; c.href = waLink(`Halo ${INFO.business || 'admin'}, saya mau tanya soal jastip 🙏`); }
  if (INFO.trip) $('#tripLbl').textContent = `Open PO · ${INFO.trip}`;
  $('#po').innerHTML = INFO.poOpen
    ? `<div class="po open"><b>PO dibuka</b>${INFO.trip ? ` untuk ${esc(INFO.trip)}` : ''}${INFO.poDeadline ? ` · sampai <b>${esc(INFO.poDeadline)}</b>` : ''}${INFO.poNote ? `<br>${esc(INFO.poNote)}` : ''}</div>`
    : `<div class="po closed"><b>PO sedang ditutup.</b> Anda tetap bisa melihat katalog dan bertanya lewat WhatsApp.${INFO.poNote ? `<br>${esc(INFO.poNote)}` : ''}</div>`;
  const brands = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))];
  $('#brands').innerHTML = brands.length > 1 ? ['', ...brands].map((b) => `<button class="chip ${b === brand ? 'on' : ''}" data-b="${esc(b)}">${b ? esc(b) : 'Semua'}</button>`).join('') : '';
  render();
}

function render() {
  const q = query.toLowerCase();
  const list = PRODUCTS.filter((p) => (!brand || p.brand === brand) && (!q || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q)));
  $('#grid').innerHTML = list.length ? list.map((p) => {
    const n = cart[p.id] || 0;
    return `<article class="card">
      <div class="ph" data-zoom="${esc(photoUrl(p.photo))}">${p.photo ? `<img src="${esc(photoUrl(p.photo))}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : '📦'}</div>
      <div class="body">
        ${p.brand ? `<div class="br">${esc(p.brand)}</div>` : ''}
        <div class="nm">${esc(p.name)}</div>
        ${p.description ? `<div class="ds">${esc(p.description)}</div>` : ''}
        <div class="pr">${fmtIDR(p.price)}</div>
        ${n ? `<div class="stepper"><button data-dec="${p.id}" aria-label="Kurangi">−</button><span>${n}</span><button data-inc="${p.id}" aria-label="Tambah">+</button></div>`
            : `<button class="add" data-inc="${p.id}" ${INFO.poOpen ? '' : 'disabled'}>+ Keranjang</button>`}
      </div></article>`;
  }).join('') : '<div class="empty">Produk tidak ditemukan.</div>';
  renderBar();
}

function cartLines() {
  return Object.entries(cart).map(([id, qty]) => ({ p: PRODUCTS.find((x) => x.id === id), qty })).filter((l) => l.p && l.qty > 0);
}
function renderBar() {
  const lines = cartLines();
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.qty * Number(l.p.price), 0);
  $('#cartbar').hidden = !count;
  $('#cartTotal').textContent = fmtIDR(total);
  $('#cartCount').textContent = `${count} barang`;
}
function change(id, d) {
  if (!INFO.poOpen && d > 0) return;
  cart[id] = Math.max(0, Math.min(99, (cart[id] || 0) + d));
  if (!cart[id]) delete cart[id];
  saveCart(); render();
  if (sheet.open && sheet.dataset.mode === 'cart') openCart();
}

function openSheet(html, mode) {
  sheet.innerHTML = `<div class="sheet-in">${html}</div>`;
  sheet.dataset.mode = mode;
  if (!sheet.open) sheet.showModal();
}
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

function openCart(errMsg = '') {
  const lines = cartLines();
  if (!lines.length) { if (sheet.open) sheet.close(); return; }
  const total = lines.reduce((a, l) => a + l.qty * Number(l.p.price), 0);
  openSheet(`
    <div class="sheet-head"><h2>Keranjang</h2><button class="x" data-close aria-label="Tutup">✕</button></div>
    ${lines.map((l) => `<div class="line-item">
      ${l.p.photo ? `<img src="${esc(photoUrl(l.p.photo))}" alt="">` : '<div class="noimg">📦</div>'}
      <div style="flex:1;min-width:0"><div class="nm">${esc(l.p.name)}</div><div class="sub">${fmtIDR(l.p.price)} × ${l.qty} = <b>${fmtIDR(l.p.price * l.qty)}</b></div></div>
      <div class="stepper"><button data-dec="${l.p.id}">−</button><span>${l.qty}</span><button data-inc="${l.p.id}">+</button></div>
    </div>`).join('')}
    <div class="sum"><span>Total barang</span><b>${fmtIDR(total)}</b></div>
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
      <p class="note">Pesanan masuk ke admin sebagai <b>menunggu konfirmasi</b>. Admin akan cek ketersediaan, ongkir, dan mengirim tagihan lewat WhatsApp.</p>
    </form>`, 'cart');
  $('#orderForm').onsubmit = submitOrder;
}

async function submitOrder(e) {
  e.preventDefault();
  const name = $('#fName').value.trim(); const phone = $('#fPhone').value.trim();
  const city = $('#fCity').value.trim(); const address = $('#fAddr').value.trim(); const note = $('#fNote').value.trim();
  buyer = { name, phone, city, address };
  try { localStorage.setItem('kt-buyer', JSON.stringify(buyer)); } catch (err) { /* abaikan */ }
  const lines = cartLines();
  const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'Mengirim pesanan…';
  try {
    const { data, error } = await supa.rpc('place_web_order', {
      p_name: name, p_phone: phone, p_items: lines.map((l) => ({ id: l.p.id, qty: l.qty })),
      p_city: city, p_address: address, p_note: note,
    });
    if (error) throw error;
    const track = new URL(`lacak.html?k=${encodeURIComponent(data.code)}&t=${encodeURIComponent(data.token)}`, location.href).href;
    const msg = `Halo ${INFO.business || 'admin'} 👋, saya sudah order lewat katalog.\n\n` +
      `Kode pesanan: *${data.code}*\nNama: ${name}\n\n` +
      lines.map((l, i) => `${i + 1}. ${l.p.name} × ${l.qty} = ${fmtIDR(l.p.price * l.qty)}`).join('\n') +
      `\n\n*Total barang: ${fmtIDR(data.total)}*${note ? `\nCatatan: ${note}` : ''}\n\nMohon dikonfirmasi ya 🙏\nLacak pesanan: ${track}`;
    cart = {}; saveCart(); render();
    openSheet(`<div class="ok-box">
      <div class="big">🎉</div><h2>Pesanan terkirim!</h2>
      <p>Kode pesanan Anda</p><div class="code">${esc(data.code)}</div>
      <p class="note">Langkah terakhir: kirim pesan WhatsApp ke admin supaya pesanan cepat dikonfirmasi.</p></div>
      <div class="btn-col" style="margin-top:14px">
        <a class="btn wa" href="${esc(waLink(msg))}" target="_blank" rel="noopener">Buka WhatsApp</a>
        <a class="btn ghost" href="${esc(track)}">Lihat status pesanan</a>
        <button class="btn ghost" data-close>Kembali ke katalog</button>
      </div>`, 'done');
    if (INFO.wa) { try { window.open(waLink(msg), '_blank', 'noopener'); } catch (err) { /* popup diblokir: tombol tetap ada */ } }
  } catch (err) {
    const m = String(err.message || err);
    openCart(/fetch|network/i.test(m) ? 'Koneksi terputus, coba lagi.' : m);
  }
}

document.addEventListener('click', (e) => {
  const inc = e.target.closest('[data-inc]'); if (inc) return change(inc.dataset.inc, 1);
  const dec = e.target.closest('[data-dec]'); if (dec) return change(dec.dataset.dec, -1);
  const b = e.target.closest('[data-b]'); if (b) { brand = b.dataset.b; document.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('on', x.dataset.b === brand)); return render(); }
  const z = e.target.closest('[data-zoom]');
  if (z && z.dataset.zoom) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${esc(z.dataset.zoom)}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); }
});
let qt;
$('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value; render(); }, 150); });
$('#openCart').onclick = () => openCart();
load();
})();
