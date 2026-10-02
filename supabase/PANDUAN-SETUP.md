# Panduan setup KuyTitip v2 (Supabase)

Cukup dilakukan **sekali** oleh owner, kira-kira 10 menit.

## 1. Siapkan database (wajib)

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard), lalu pilih proyek `cxresrjjlzruyerkqqqy`.
2. Di menu kiri pilih **SQL Editor**, lalu **New query**.
3. Buka file [`schema.sql`](schema.sql), salin **seluruh isinya**, tempel ke editor, lalu klik **Run**.
   Hasilnya harus "Success. No rows returned". File ini aman dijalankan ulang.
4. Hasilnya: tabel, aturan keamanan, fungsi web, bucket foto, dan **71 produk dari katalog lama**
   (TOFU, Butterfly, GentleWoman, Erawadee) siap dipakai.

## 2. Matikan konfirmasi email (disarankan)

Supaya admin bisa langsung login setelah daftar:
**Authentication → Sign In / Providers → Email → matikan "Confirm email" → Save.**

Ini tetap aman: setiap pendaftar baru berstatus *Menunggu persetujuan* dan tidak bisa melihat data
apa pun sampai owner memberinya peran.

## 3. Daftar sebagai owner (harus Anda duluan)

1. Pasang APK versi terbaru (lihat bagian Releases di GitHub).
2. Buka aplikasi, pilih **Admin baru? Daftar di sini**, lalu isi nama, email, dan password.
3. **Pendaftar pertama otomatis menjadi Owner.**
   Kalau di HP ini ada data dari versi lama, data itu otomatis dikirim ke server.

## 4. Tambah 2 admin lain

1. Admin 2 dan 3 memasang APK yang sama, lalu memilih **Daftar**.
2. Owner membuka **Saya → Kelola admin**, lalu memilih peran untuk masing-masing:
   - **Admin order**: pesanan, customer, produk, pembayaran
   - **Shopper / packing**: daftar belanja, centang barang, status, foto struk (tanpa harga modal dan pembayaran)
3. Admin tersebut menekan **Cek lagi**, lalu langsung masuk.

## 5. Aktifkan web katalog untuk buyer

1. Di GitHub, buka repo → **Settings → Pages**.
2. Pada Source pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
3. Setelah sekitar 1–2 menit, web bisa dibuka di:
   - Katalog + keranjang: `https://ferryswasonoai-eng.github.io/kuytitipibumami/toko/`
   - Lacak pesanan: link otomatis ada di nota WhatsApp
4. Bagikan link katalog di bio IG, WA Channel, atau grup.

> Kalau web di-host di tempat lain (misalnya Render), ganti alamatnya di aplikasi:
> **Saya → Profil usaha & PO → Link web buyer**.

## Cara kerja sehari-hari

| Dari mana pesanan masuk | Yang terjadi |
| --- | --- |
| Buyer order lewat web | Pesanan masuk berstatus **Menunggu konfirmasi**, muncul badge merah di tab Pesanan. Admin cek → **Konfirmasi & ambil**. |
| Buyer chat WA biasa | Admin mencatat di aplikasi (pilih customer berdasarkan nomor, pilih produk dari katalog). |
| Admin langsung | Sama seperti di atas, dengan sumber "Langsung". |

- **Satu nomor WA = satu customer.** Customer dari web otomatis tersambung ke data lama kalau nomornya sama.
- **PIC:** setiap pesanan punya penanggung jawab (tombol *Ambil*). Filter **Pesanan saya** menampilkan milik Anda.
- **Pembayaran** dicatat per transaksi (DP, pelunasan). Hanya owner yang bisa membatalkan.
- **Daftar belanja:** gabungan semua barang yang harus dibeli. Begitu dicentang, status pesanan ikut berubah.
- **Offline:** aplikasi tetap bisa dipakai tanpa sinyal. Perubahan menunggu di HP (lihat label *antre* di kanan atas)
  lalu terkirim otomatis saat online.
- **Bentrok edit:** kalau pesanan yang sedang Anda edit baru saja diubah admin lain, aplikasi akan memberi peringatan sebelum menyimpan.
- **Log aktivitas:** owner bisa melihat siapa melakukan apa di **Saya → Kelola admin → Lihat log aktivitas**.

## Batas paket gratis Supabase

- Database 500 MB, foto 1 GB (sekitar 4.000–6.000 foto terkompres), bandwidth 5 GB per bulan.
- Proyek di-pause setelah 7 hari tanpa aktivitas. Workflow `supabase-keepalive.yml` memanggil server setiap 2 hari supaya proyek tetap aktif.
- Paket gratis tidak punya backup harian otomatis. Rutin gunakan **Saya → Ekspor rekap (.csv)** atau **Ekspor cadangan (.json)**.
