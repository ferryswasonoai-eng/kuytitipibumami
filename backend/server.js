require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kuytitipibumami_secret_2024';

// ================== KONFIGURASI GOOGLE SHEETS ==================
const SHEETS_WEB_APP_URL = process.env.SHEETS_WEB_APP_URL; // wajib diisi di Render env vars
const SHEETS_API_KEY = process.env.SHEETS_API_KEY; // wajib diisi di Render env vars

if (!SHEETS_WEB_APP_URL || !SHEETS_API_KEY) {
  console.error('❌ SHEETS_WEB_APP_URL dan SHEETS_API_KEY wajib diisi di environment variables');
  process.exit(1);
}

// Admin login: username & hash password disimpan di ENV (bukan di Sheets, lebih aman & cepat)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
// Default password 'admin123' -- WAJIB diganti via env var ADMIN_PASSWORD_HASH di production
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);

// ================== SHEETS API CLIENT (server-side, key tersembunyi) ==================
async function sheetsGet(resource, params = {}) {
  const qs = new URLSearchParams({ resource, apiKey: SHEETS_API_KEY, ...params }).toString();
  const res = await fetch(`${SHEETS_WEB_APP_URL}?${qs}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Sheets API error');
  return json.data;
}

async function sheetsPost(action, resource, extra = {}) {
  const res = await fetch(SHEETS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ apiKey: SHEETS_API_KEY, action, resource, ...extra })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Sheets API error');
  return json.data;
}

async function uploadImageToSheets(file) {
  const base64Data = file.buffer.toString('base64');
  const res = await fetch(SHEETS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      apiKey: SHEETS_API_KEY,
      action: 'uploadImage',
      filename: `prod_${Date.now()}${path.extname(file.originalname)}`,
      mimeType: file.mimetype,
      base64Data: base64Data
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Gagal upload gambar');
  return json.data.url;
}

// ================== COUNTRY DEFAULTS (tetap statis, jarang berubah) ==================
const COUNTRY_DEFAULTS = {
  JP: { name: 'Jepang', flag: '🇯🇵', currency: 'JPY', theme: '#BC002D', categories: ['Fashion','Elektronik','Anime & Manga','Makanan & Snack','Kosmetik','Aksesori','Mainan','Lainnya'] },
  KR: { name: 'Korea Selatan', flag: '🇰🇷', currency: 'KRW', theme: '#003478', categories: ['K-Beauty','Fashion','K-Food','Elektronik','K-Pop Merch','Skincare','Aksesori','Lainnya'] },
  US: { name: 'Amerika Serikat', flag: '🇺🇸', currency: 'USD', theme: '#B22234', categories: ['Fashion','Elektronik','Suplemen','Sneakers','Tas & Dompet','Kosmetik','Makanan','Lainnya'] },
  UK: { name: 'Inggris', flag: '🇬🇧', currency: 'GBP', theme: '#012169', categories: ['Fashion','Luxury','Kosmetik','Makanan','Buku','Aksesori','Lainnya'] },
  AU: { name: 'Australia', flag: '🇦🇺', currency: 'AUD', theme: '#00008B', categories: ['Suplemen','Fashion','Kosmetik','Makanan','Barang Bayi','Aksesori','Lainnya'] },
  TR: { name: 'Turki', flag: '🇹🇷', currency: 'TRY', theme: '#E30A17', categories: ['Fashion','Tekstil','Kerajinan','Kosmetik','Makanan','Aksesori','Lainnya'] },
  CN: { name: 'Tiongkok', flag: '🇨🇳', currency: 'CNY', theme: '#DE2910', categories: ['Elektronik','Fashion','Kosmetik','Mainan','Peralatan Rumah','Aksesori','Makanan','Lainnya'] },
  MY: { name: 'Malaysia', flag: '🇲🇾', currency: 'MYR', theme: '#CC0001', categories: ['Fashion','Makanan Halal','Kosmetik','Elektronik','Aksesori','Lainnya'] },
  SG: { name: 'Singapura', flag: '🇸🇬', currency: 'SGD', theme: '#EF3340', categories: ['Fashion','Elektronik','Kosmetik','Makanan','Aksesori','Lainnya'] },
  IT: { name: 'Italia', flag: '🇮🇹', currency: 'EUR', theme: '#009246', categories: ['Luxury Fashion','Sepatu','Tas','Kosmetik','Makanan','Aksesori','Lainnya'] },
  FR: { name: 'Perancis', flag: '🇫🇷', currency: 'EUR', theme: '#002395', categories: ['Luxury','Parfum','Kosmetik','Fashion','Makanan','Aksesori','Lainnya'] },
  DE: { name: 'Jerman', flag: '🇩🇪', currency: 'EUR', theme: '#000000', categories: ['Otomotif','Elektronik','Fashion','Suplemen','Peralatan','Aksesori','Lainnya'] },
  OTHER: { name: 'Negara Lain', flag: '🌍', currency: 'IDR', theme: '#3525cd', categories: ['Fashion','Elektronik','Kosmetik','Makanan','Aksesori','Lainnya'] },
};

// Upload gambar disimpan sementara di memory, lalu dikirim ke Google Drive (bukan disk lokal)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => f.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('File harus gambar'))
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token tidak valid' }); }
}

// ================== PUBLIC ROUTES ==================
app.get('/api/config', async (_, res) => {
  try {
    const s = await sheetsGet('settings');
    const meta = COUNTRY_DEFAULTS[s.country_code] || COUNTRY_DEFAULTS['OTHER'];
    const customCats = s.custom_categories ? s.custom_categories.split('|').filter(Boolean) : [];
    res.json({
      store_name: s.store_name, store_tagline: s.store_tagline,
      country_code: s.country_code, country_name: meta.name, country_flag: meta.flag,
      wa_number: s.wa_number, wa_greeting: s.wa_greeting, theme_primary: s.theme_primary,
      show_stock: s.show_stock === '1',
      categories: customCats.length ? customCats : meta.categories
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/country-presets', (_, res) => {
  res.json(Object.entries(COUNTRY_DEFAULTS).map(([code, d]) => ({ code, name: d.name, flag: d.flag, theme: d.theme, currency: d.currency, categories: d.categories })));
});

app.get('/api/products', async (req, res) => {
  try {
    const { search, category } = req.query;
    const data = await sheetsGet('products', { activeOnly: '1', search: search || '', category: category || '' });
    const shaped = data.map(p => ({ id: p.id, name: p.name, description: p.description, price_sell: Number(p.price_sell), image: p.image, category: p.category, stock: Number(p.stock) }));
    res.json(shaped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/categories', async (_, res) => {
  try {
    const data = await sheetsGet('products', { activeOnly: '1' });
    const cats = [...new Set(data.map(p => p.category))].sort();
    res.json(['Semua', ...cats]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username });
});

// ================== ADMIN ROUTES ==================
app.get('/api/admin/products', auth, async (_, res) => {
  try {
    const data = await sheetsGet('products');
    res.json(data.map(p => ({ ...p, price_sell: Number(p.price_sell), price_cost: Number(p.price_cost), stock: Number(p.stock), active: Number(p.active) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/products', auth, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price_sell, price_cost, category, stock } = req.body;
    const image = req.file ? await uploadImageToSheets(req.file) : null;
    const result = await sheetsPost('create', 'products', {
      data: { name, description, price_sell: parseFloat(price_sell), price_cost: parseFloat(price_cost), image, category: category || 'Umum', stock: parseInt(stock) || 0, active: 1 }
    });
    res.json({ id: result.id, message: 'Produk berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price_sell, price_cost, category, stock, active } = req.body;
    const updateData = { name, description, price_sell: parseFloat(price_sell), price_cost: parseFloat(price_cost), category, stock: parseInt(stock) || 0, active: active !== undefined ? parseInt(active) : 1 };
    if (req.file) updateData.image = await uploadImageToSheets(req.file);
    await sheetsPost('update', 'products', { id, data: updateData });
    res.json({ message: 'Produk berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/products/:id', auth, async (req, res) => {
  try {
    await sheetsPost('delete', 'products', { id: req.params.id });
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', auth, async (_, res) => {
  try { res.json(await sheetsGet('settings')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/settings', auth, async (req, res) => {
  try {
    const allowed = ['store_name', 'store_tagline', 'country_code', 'wa_number', 'wa_greeting', 'theme_primary', 'show_stock', 'currency_display', 'custom_categories'];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = String(req.body[key]);
    await sheetsPost('bulkUpdateSettings', 'settings', { data });
    res.json({ message: 'Pengaturan berhasil disimpan' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Catatan: password admin sekarang dikelola via env var ADMIN_PASSWORD_HASH di Render,
// bukan lewat endpoint ini. Untuk ganti password: generate hash baru (lihat README),
// lalu update env var ADMIN_PASSWORD_HASH di Render dashboard dan redeploy.
app.put('/api/admin/password', auth, (_, res) => {
  res.status(400).json({ error: 'Ganti password lewat environment variable ADMIN_PASSWORD_HASH di Render dashboard, bukan lewat sini.' });
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/admin.html')));
app.get('/admin/*path', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/admin.html')));
app.get('/*path', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));

app.listen(PORT, () => console.log(`🚀 Kuytitipibumami (Sheets backend) → http://localhost:${PORT}`));
