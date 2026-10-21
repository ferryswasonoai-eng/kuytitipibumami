-- Katalog awal Jastip Jepang: 20 tas Legato Largo (sudah dijalankan langsung ke Supabase 22 Okt 2026).
-- Harga jual = harga Jepang (¥, sudah termasuk pajak) × kurs Rp 113,35 + margin Rp 250.000, dibulatkan ke atas per Rp 1.000.
-- Aman dijalankan ulang (on conflict → update), tidak membuat produk dobel.
with src(code, name, jpy, descr, badge, ord) as (values
 ('LH-L0001','Tote Bag Kataraku',4950,'Kode: LH-L0001 · 33×27×11 cm · 400 g · nilon anti-air\nMuat A4 & laptop 13 inci, tali empuk tidak sakit di bahu. Terlaris (>900rb terjual di Jepang).','Best Seller',1),
 ('LH-L0002','2WAY Shoulder Bag Kataraku',4950,'Kode: LH-L0002 · 27,5×24×10 cm · 350 g · nilon\nBisa dijinjing atau diselempang (tali 84–129 cm).','',2),
 ('LH-L0003','Ransel Kataraku',7150,'Kode: LH-L0003 · Ransel seri Kataraku (肩楽) — dirancang ringan di bahu.','',3),
 ('LH-V0111','Boston Bag 2WAY 21L Kataraku',7590,'Kode: LH-V0111 · Kapasitas besar 21 L, bisa dijinjing atau diselempang. Cocok untuk travel.','',4),
 ('LH-L0005','Mini Shoulder Bag Kataraku',3850,'Kode: LH-L0005 · Tas selempang mini seri Kataraku, ringan untuk harian.','',5),
 ('LH-L0006','Ransel Model Tote Kataraku',6490,'Kode: LH-L0006 · Ransel bergaya tote, seri Kataraku.','',6),
 ('LH-L0153','Mini Shoulder Vertikal Kataraku',3190,'Kode: LH-L0153 · Tas selempang mini model vertikal, seri Kataraku.','',7),
 ('LH-X0581','Mini Shoulder Bag Kataraku (Edisi Terbatas)',4620,'Kode: LH-X0581 · Edisi jumlah terbatas di Jepang.','Limited',8),
 ('LH-X0591','Double Face Mini Shoulder Kataraku',4620,'Kode: LH-X0591 · Mini shoulder model double face, seri Kataraku.','',9),
 ('LH-X0592','Double Face 2WAY Shoulder Kataraku',6820,'Kode: LH-X0592 · 2WAY shoulder model double face, seri Kataraku.','',10),
 ('LH-W0161','Tote Bag Kulit Sintetis Kataraku',5390,'Kode: LH-W0161 · Tote bag bahan kulit sintetis, seri Kataraku.','',11),
 ('LH-W0162','2WAY Shoulder Kulit Sintetis Kataraku',5390,'Kode: LH-W0162 · 2WAY shoulder bahan kulit sintetis, seri Kataraku.','',12),
 ('LH-W0163','Mini Shoulder Kulit Sintetis Kataraku',4290,'Kode: LH-W0163 · Mini shoulder bahan kulit sintetis, seri Kataraku.','',13),
 ('LG-X0611','2WAY Tote Bag Strap Bag',4950,'Kode: LG-X0611 · Tote 2WAY dengan tali selempang.','',14),
 ('LH-W0233','Ransel 10 Kantong FULL BAG',6490,'Kode: LH-W0233 · Ransel dengan 10 kantong, barang mudah dirapikan.','',15),
 ('LH-W0182','2WAY Tote Bag Karui Kaban Duo',5720,'Kode: LH-W0182 · Seri Karui Kaban (tas ringan), bisa dijinjing atau diselempang.','',16),
 ('LH-X0063','2WAY Tote Bag Fuwari',4950,'Kode: LH-X0063 · Tote 2WAY model fuwari (lembut & ringan).','',17),
 ('LT-F3383','Ransel Tote Anti-Air',5390,'Kode: LT-F3383 · Ransel bergaya tote, bahan anti-air.','',18),
 ('LH-F3454','Boston Shoulder Bag 20L',6490,'Kode: LH-F3454 · Boston bag 20 L, bisa diselempang.','',19),
 ('LH-X0062','Shoulder Bag A5',3850,'Kode: LH-X0062 · Tas selempang ukuran muat A5.','',20)
)
insert into public.products (id, name, brand, description, buy_price, buy_cur, sell_price, category, events, badge, featured, published, sort, note, updated_by_name)
select 'p_lgl_' || lower(replace(code,'-','')), name, 'LEGATO LARGO', replace(descr,'\n',E'\n'), jpy, 'JPY',
       ceil((jpy * 113.35 + 250000) / 1000.0) * 1000, 'Tas & Aksesori', array['ev_jpn'], badge, ord <= 2, true, ord,
       'Import 22 Okt 2026 · kurs ¥1 = Rp 113,35 · margin Rp 250.000', 'Claude (import)'
from src
on conflict (id) do update set name = excluded.name, description = excluded.description, buy_price = excluded.buy_price, buy_cur = excluded.buy_cur,
  sell_price = excluded.sell_price, category = excluded.category, events = excluded.events, badge = excluded.badge, sort = excluded.sort, note = excluded.note, updated_at = now();
