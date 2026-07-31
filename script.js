// ============================================================
// kuytitipibumami — Jastip Bangkok Catalogue
// Vanilla JS, no build step — static site ready for GitHub/Render
// ============================================================

const WA_NUMBER = '6281373186844'; // +62 813-7318-6844
const PAGE_SIZE = 10;

const STORE_THEME = {
  tofu: {
    accent: '#0EA5A5',
    accent2: '#EC4899',
    bg: '#FFFBF8',
    card: '#ffffff',
    ink: '#1c2a2a',
    sub: '#6b7b7b',
    tint: '#E8FBF7'
  },
  butterfly: {
    accent: '#7C2D8E',
    accent2: '#D4AF37',
    bg: '#FBF6FC',
    card: '#ffffff',
    ink: '#241528',
    sub: '#7a6b82',
    tint: '#F5E9F7'
  },
  gw: {
    accent: '#171717',
    accent2: '#C9A876',
    bg: '#FAFAF9',
    card: '#ffffff',
    ink: '#171717',
    sub: '#78716c',
    tint: '#F0EDE8'
  }
};

let currentStore = 'tofu';
let currentPage = 1;

function waLink(product){
  const msg = `Halo kak, saya mau tanya/pesan produk ini dari katalog kuytitipibumami:\n\n*${product.name}*\n${product.price}\n\nApakah masih tersedia?`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function applyTheme(storeKey){
  const t = STORE_THEME[storeKey];
  const root = document.documentElement.style;
  root.setProperty('--brand-accent', t.accent);
  root.setProperty('--brand-accent2', t.accent2);
  root.setProperty('--brand-bg', t.bg);
  root.setProperty('--brand-card', t.card);
  root.setProperty('--brand-ink', t.ink);
  root.setProperty('--brand-sub', t.sub);
  document.body.style.background = t.bg;
}

function renderTabs(){
  const wrap = document.getElementById('storeTabs');
  wrap.innerHTML = '';
  Object.keys(CATALOG_DATA).forEach(key => {
    const store = CATALOG_DATA[key];
    const theme = STORE_THEME[key];
    const btn = document.createElement('button');
    btn.className = 'store-tab';
    btn.setAttribute('data-active', key === currentStore ? 'true' : 'false');
    btn.style.setProperty('--tab-accent', theme.accent);
    btn.style.setProperty('--tab-tint', theme.tint);
    btn.innerHTML = `
      <span class="tab-dot"></span>
      <span class="tab-brand">${store.name}</span>
      <span class="tab-tagline">${store.tagline}</span>
    `;
    btn.addEventListener('click', () => {
      currentStore = key;
      currentPage = 1;
      applyTheme(key);
      renderTabs();
      renderGrid();
      window.scrollTo({ top: document.getElementById('catalogueSection').offsetTop - 70, behavior:'smooth' });
    });
    wrap.appendChild(btn);
  });
}

function cardTemplate(product, storeKey){
  const img = `images/${storeKey}/${product.id}.jpg`;
  return `
    <div class="card">
      <div class="card-photo">
        <img src="${img}" alt="${product.name}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-name">${product.name}</div>
        <div class="card-desc">${product.desc}</div>
        <div class="card-price">${product.price}</div>
        <a class="card-order" href="${waLink(product)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          Order via WhatsApp
        </a>
      </div>
    </div>
  `;
}

function renderGrid(){
  const store = CATALOG_DATA[currentStore];
  const products = store.products;
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = products.slice(start, start + PAGE_SIZE);

  document.getElementById('storeHeading').textContent = store.name;
  document.getElementById('storeCount').textContent = `${products.length} produk`;

  const grid = document.getElementById('grid');
  grid.innerHTML = pageItems.map(p => cardTemplate(p, currentStore)).join('');

  renderPagination(totalPages);
}

function renderPagination(totalPages){
  const el = document.getElementById('pagination');
  if (totalPages <= 1){ el.innerHTML = ''; return; }

  let html = `<button class="page-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>&#8249;</button>`;
  for (let i = 1; i <= totalPages; i++){
    html += `<button class="page-btn" data-page="${i}" data-active="${i === currentPage}">${i}</button>`;
  }
  html += `<button class="page-btn" id="nextBtn" ${currentPage === totalPages ? 'disabled' : ''}>&#8250;</button>`;
  el.innerHTML = html;

  el.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.getAttribute('data-page'), 10);
      renderGrid();
      window.scrollTo({ top: document.getElementById('catalogueSection').offsetTop - 70, behavior:'smooth' });
    });
  });
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; renderGrid(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; renderGrid(); });
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentStore);
  renderTabs();
  renderGrid();
});
