# KuyTitip — Aplikasi Jastip Android (internal)

Aplikasi pencatat jastip untuk dipakai sendiri/tim, **tanpa Play Store**. Dibuat dengan
HTML/JS biasa (folder `www/`) lalu dibungkus menjadi APK Android memakai Capacitor.

## Fitur

| Menu | Isi |
| --- | --- |
| **Beranda** | Ringkasan omzet, estimasi profit, tagihan belum dibayar (bisa difilter per trip) + **Kalkulator jastip**: kurs live ke IDR (bisa manual), fee persen/flat, ongkir per kg, pembulatan, simpan sebagai markup bawaan |
| **Pesanan** | Catat titipan per customer: banyak barang, qty, berat, harga beli (mata uang apa saja), harga jual, tombol *Hitung harga jual (cepat)* & rincian perhitungan, foto barang, foto struk, ongkir, diskon, DP/lunas, status (Baru → Sudah dibeli → Dikirim → Selesai), kirim nota ke WhatsApp |
| **Produk** | Katalog barang yang sering dititip (foto, harga, berat) — tinggal pilih saat membuat pesanan |
| **Customer** | Daftar pelanggan, nomor WA, alamat, riwayat & sisa tagihan, chat WA |
| **Saya** | Nama usaha, trip aktif, template nota WA, backup/restore (.json), ekspor rekap (.csv) |

Kurs diambil dari open.er-api.com (cadangan: Frankfurter/ECB), disimpan di HP sehingga
tetap bisa dipakai saat offline. Semua data tersimpan **di HP** (IndexedDB) — rutin buat backup.

## Dapatkan APK

Setiap push ke folder `mobile/` otomatis membangun APK lewat GitHub Actions
(`.github/workflows/android-apk.yml`).

1. Buka tab **Actions** di GitHub → tunggu workflow *Build APK KuyTitip* selesai (±5 menit).
2. Unduh APK dari halaman **Releases** → `KuyTitip-v1.0.x.apk`
   (link tetap: `https://github.com/ferryswasonoai-eng/kuytitipibumami/releases/latest`).
3. Kirim file APK ke HP (atau buka link Releases langsung dari HP), lalu pasang.
   Android akan meminta izin **Install unknown apps** → izinkan untuk aplikasi yang dipakai membuka file.
4. Kalau muncul peringatan Google Play Protect, pilih **More details → Install anyway**.

**Update:** pasang APK versi baru di atas versi lama. Semua APK ditandatangani dengan
keystore yang sama (`keystore/debug.keystore`), jadi data tidak hilang.
Jangan ganti/hapus file keystore itu.

## Ubah tampilan / fitur

- Semua kode aplikasi ada di `www/` (`index.html`, `app.css`, `app.js`).
- Coba di browser laptop: `cd mobile && npm install && npm run serve`, buka http://localhost:8080
  (gunakan mode HP di DevTools).
- Ganti ikon: ubah file di `assets/`, lalu `npm run icons`.
- Build lokal (butuh Android Studio / Android SDK + JDK 21):
  `npm install && npx cap sync android && cd android && ./gradlew assembleDebug`
