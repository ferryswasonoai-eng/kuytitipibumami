require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kuytitipibumami_secret_2024';

const db = createClient({ url: 'file:jastip.db' });

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

async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price_sell REAL NOT NULL, price_cost REAL NOT NULL, image TEXT, category TEXT DEFAULT 'Umum', stock INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime')))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const defaults = {
    store_name: 'Kuytitipibumami', store_tagline: 'Belanja titip terpercaya langsung dari luar negeri',
    country_code: 'JP', wa_number: '6281234567890',
    wa_greeting: 'Halo Kak! Saya ingin memesan produk berikut:',
    theme_primary: '#BC002D', show_stock: '1', currency_display: 'IDR', custom_categories: '',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: [key, value] });
  }

  const ex = await db.execute("SELECT id FROM admins WHERE username='admin'");
  if (ex.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.execute({ sql: "INSERT INTO admins (username, password) VALUES (?, ?)", args: ['admin', hash] });
    console.log('✅ Admin: admin / admin123');
  }

  const pc = await db.execute("SELECT COUNT(*) as cnt FROM products");
  if (pc.rows[0].cnt === 0) {
    const samples = [
      ['Tas Kulit Tote Asakusa', 'Tas kulit asli dari distrik Asakusa Tokyo. Handmade, tahan lama', 890000, 520000, null, 'Fashion'],
      ['Sneakers Nike Air Max JP', 'Edisi Jepang, colorway eksklusif, size 39-44', 1250000, 800000, null, 'Fashion'],
      ['SK-II Facial Treatment Essence', 'Original Jepang, PITERA essence 230ml', 680000, 420000, null, 'Kosmetik'],
      ['Ichiran Ramen Tonkotsu 5pcs', 'Original dari Hakata, isi 5 paket', 185000, 110000, null, 'Makanan & Snack'],
      ['Casio G-Shock DW-5600', 'Original Jepang, water resistant 200m', 950000, 600000, null, 'Aksesori'],
      ['Dragon Ball Z Manga Vol 1-10', 'Original bahasa Jepang dari Kinokuniya', 420000, 250000, null, 'Anime & Manga'],
    ];
    for (const [n, d, ps, pc2, img, cat] of samples) {
      await db.execute({ sql: "INSERT INTO products (name,description,price_sell,price_cost,image,category) VALUES (?,?,?,?,?,?)", args: [n, d, ps, pc2, img, cat] });
    }
    console.log('✅ Sample products seeded');
  }
}

const uploadsDir = path.join(__dirname, '../frontend/public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, `prod_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_, f, cb) => f.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('File harus gambar')) });

app.use(cors()); app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, '../frontend/public')));

function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token tidak valid' }); }
}

async function getSettings() {
  const r = await db.execute("SELECT key, value FROM settings");
  return Object.fromEntries(r.rows.map(row => [row.key, row.value]));
}

// Public
app.get('/api/config', async (_, res) => {
  const s = await getSettings();
  const meta = COUNTRY_DEFAULTS[s.country_code] || COUNTRY_DEFAULTS['OTHER'];
  const customCats = s.custom_categories ? s.custom_categories.split('|').filter(Boolean) : [];
  res.json({ store_name: s.store_name, store_tagline: s.store_tagline, country_code: s.country_code, country_name: meta.name, country_flag: meta.flag, wa_number: s.wa_number, wa_greeting: s.wa_greeting, theme_primary: s.theme_primary, show_stock: s.show_stock === '1', categories: customCats.length ? customCats : meta.categories });
});

app.get('/api/country-presets', (_, res) => {
  res.json(Object.entries(COUNTRY_DEFAULTS).map(([code, d]) => ({ code, name: d.name, flag: d.flag, theme: d.theme, currency: d.currency, categories: d.categories })));
});

app.get('/api/products', async (req, res) => {
  const { search, category } = req.query;
  let sql = "SELECT id,name,description,price_sell,image,category,stock FROM products WHERE active=1";
  const args = [];
  if (search) { sql += " AND (name LIKE ? OR description LIKE ?)"; args.push(`%${search}%`, `%${search}%`); }
  if (category && category !== 'Semua') { sql += " AND category=?"; args.push(category); }
  sql += " ORDER BY created_at DESC";
  const result = await db.execute({ sql, args });
  res.json(result.rows);
});

app.get('/api/categories', async (_, res) => {
  const r = await db.execute("SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category");
  res.json(['Semua', ...r.rows.map(row => row.category)]);
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const r = await db.execute({ sql: "SELECT * FROM admins WHERE username=?", args: [username] });
  const admin = r.rows[0];
  if (!admin || !bcrypt.compareSync(password, admin.password)) return res.status(401).json({ error: 'Username atau password salah' });
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: admin.username });
});

// Admin
app.get('/api/admin/products', auth, async (_, res) => { const r = await db.execute("SELECT * FROM products ORDER BY created_at DESC"); res.json(r.rows); });

app.post('/api/admin/products', auth, upload.single('image'), async (req, res) => {
  const { name, description, price_sell, price_cost, category, stock } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const r = await db.execute({ sql: "INSERT INTO products (name,description,price_sell,price_cost,image,category,stock) VALUES (?,?,?,?,?,?,?)", args: [name, description, parseFloat(price_sell), parseFloat(price_cost), image, category || 'Umum', parseInt(stock) || 0] });
  res.json({ id: Number(r.lastInsertRowid), message: 'Produk berhasil ditambahkan' });
});

app.put('/api/admin/products/:id', auth, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price_sell, price_cost, category, stock, active } = req.body;
  const ex = await db.execute({ sql: "SELECT image FROM products WHERE id=?", args: [id] });
  const image = req.file ? `/uploads/${req.file.filename}` : ex.rows[0]?.image;
  await db.execute({ sql: "UPDATE products SET name=?,description=?,price_sell=?,price_cost=?,image=?,category=?,stock=?,active=? WHERE id=?", args: [name, description, parseFloat(price_sell), parseFloat(price_cost), image, category, parseInt(stock) || 0, active !== undefined ? parseInt(active) : 1, id] });
  res.json({ message: 'Produk berhasil diupdate' });
});

app.delete('/api/admin/products/:id', auth, async (req, res) => { await db.execute({ sql: "DELETE FROM products WHERE id=?", args: [req.params.id] }); res.json({ message: 'Produk berhasil dihapus' }); });

app.get('/api/admin/settings', auth, async (_, res) => { res.json(await getSettings()); });

app.put('/api/admin/settings', auth, async (req, res) => {
  const allowed = ['store_name', 'store_tagline', 'country_code', 'wa_number', 'wa_greeting', 'theme_primary', 'show_stock', 'currency_display', 'custom_categories'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) await db.execute({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", args: [key, String(req.body[key])] });
  }
  res.json({ message: 'Pengaturan berhasil disimpan' });
});

app.put('/api/admin/password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  const r = await db.execute({ sql: "SELECT * FROM admins WHERE id=?", args: [req.admin.id] });
  if (!bcrypt.compareSync(current_password, r.rows[0].password)) return res.status(400).json({ error: 'Password lama salah' });
  const hash = bcrypt.hashSync(new_password, 10);
  await db.execute({ sql: "UPDATE admins SET password=? WHERE id=?", args: [hash, req.admin.id] });
  res.json({ message: 'Password berhasil diubah' });
});

app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/admin.html')));
app.get('/admin/*path', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/admin.html')));
app.get('/*path', (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));

initDB().then(() => app.listen(PORT, () => console.log(`🚀 Kuytitipibumami → http://localhost:${PORT}`))).catch(console.error);
