# kuytitipibumami — Jastip Bangkok Catalogue

Situs katalog statis (tanpa backend, tanpa database) untuk 3 brand jastip Bangkok:
**TOFU** (skincare), **Butterfly** (parfum), **GentleWoman** (tas & aksesori).

Semua data produk ada di `data.js` — untuk update harga/produk, edit file itu langsung,
tidak perlu database atau admin panel.

## Struktur File

```
├── index.html          # Halaman utama
├── style.css           # Semua styling
├── script.js           # Logic tab switching, pagination, link WA
├── data.js             # Data produk (nama, deskripsi, harga) — EDIT DI SINI untuk update
├── images/
│   ├── tofu/           # 36 foto produk TOFU
│   ├── butterfly/      # 8 foto produk Butterfly
│   └── gw/              # 17 foto produk GentleWoman
└── README.md
```

## Cara Update Produk / Harga

Buka `data.js`, cari produk yang mau diubah, edit field `name`, `desc`, atau `price`:

```js
{ id:"tofu_01", name:"Tofu Precious Moisturizing", desc:"...", price:"Rp 155.000" },
```

`id` harus tetap sama dengan nama file foto di folder `images/` (misal `tofu_01.jpg`).
Kalau mau ganti foto, replace file dengan nama yang sama di folder `images/<brand>/`.

## Cara Deploy ke GitHub

1. Buat repo baru di GitHub (atau pakai yang sudah ada)
2. Upload semua file & folder di sini (`index.html`, `style.css`, `script.js`, `data.js`, folder `images/`) — pertahankan strukturnya persis
3. Commit & push

## Cara Deploy ke Render (Static Site)

1. Buka [dashboard.render.com](https://dashboard.render.com)
2. **New > Static Site**
3. Connect ke repo GitHub yang tadi
4. Isi:
   - **Build Command**: (kosongkan saja, tidak perlu build)
   - **Publish Directory**: `.` (root, kalau semua file di root repo)
5. Klik **Create Static Site**
6. Tunggu deploy selesai (~1 menit) — situs langsung online

## Cara Ganti Nomor WhatsApp

Ada 2 tempat yang perlu diganti kalau nomor WA berubah:
1. `script.js` — baris `const WA_NUMBER = '6281373186844';`
2. `index.html` — link "Chat Admin" di header dan footer

Format nomor: kode negara tanpa `+` atau `0` di depan (`62` untuk Indonesia), contoh: `6281373186844` untuk `+62 813-7318-6844`.

## Menambah Brand/Toko Baru (di Masa Depan)

1. Tambah folder foto baru di `images/<nama-brand>/`
2. Tambah entry baru di `data.js` mengikuti pola yang sudah ada
3. Tambah warna tema brand di `STORE_THEME` dalam `script.js`

Tidak perlu ubah HTML — tab & grid akan otomatis muncul karena di-generate dari `data.js`.
