-- =====================================================================
-- KuyTitip — skema database Supabase
-- Cara pakai: Supabase → SQL Editor → New query → tempel SELURUH isi file
-- ini → Run. Aman dijalankan ulang (tidak menghapus data).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ADMIN & PERAN
--    owner   : semua akses, kelola admin, pengaturan, hapus data
--    order   : pesanan, customer, produk, pembayaran
--    shopper : lihat pesanan, daftar belanja, status, foto
--    pending : baru daftar, menunggu disetujui owner (tanpa akses)
--    disabled: dinonaktifkan
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  role text not null default 'pending'
    check (role in ('owner','order','shopper','pending','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.admins where id = auth.uid()), 'none')
$$;
create or replace function public.is_staff() returns boolean
language sql stable as $$ select public.my_role() in ('owner','order','shopper') $$;
create or replace function public.can_sell() returns boolean
language sql stable as $$ select public.my_role() in ('owner','order') $$;
create or replace function public.is_owner() returns boolean
language sql stable as $$ select public.my_role() = 'owner' $$;
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.admins where id = auth.uid()),
                  case when auth.uid() is null then 'Web' else '' end)
$$;

-- Pendaftar pertama otomatis menjadi owner; berikutnya "pending".
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admins (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.admins where role = 'owner') then 'pending' else 'owner' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists kuytitip_on_auth_user_created on auth.users;
create trigger kuytitip_on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Jangan sampai tidak ada owner sama sekali.
create or replace function public.guard_admins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if old.role = 'owner' and new.role <> 'owner'
     and (select count(*) from public.admins where role = 'owner') <= 1 then
    raise exception 'Minimal harus ada 1 owner';
  end if;
  return new;
end $$;
drop trigger if exists kuytitip_guard_admins on public.admins;
create trigger kuytitip_guard_admins before update on public.admins
  for each row execute function public.guard_admins();

-- ---------------------------------------------------------------------
-- 2. TABEL DATA
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  brand text not null default '',
  description text not null default '',
  buy_price numeric,
  buy_cur text not null default 'THB',
  sell_price numeric,
  weight numeric,
  photo text,
  note text not null default '',
  published boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  deleted boolean not null default false
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null default '',
  city text not null default '',
  address text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  deleted boolean not null default false
);

create table if not exists public.orders (
  id text primary key,
  code text not null unique,
  customer_id text,
  trip text not null default '',
  status text not null default 'baru'
    check (status in ('menunggu','baru','dibeli','dikirim','selesai','batal')),
  source text not null default 'admin' check (source in ('admin','wa','web')),
  items jsonb not null default '[]'::jsonb,
  receipts jsonb not null default '[]'::jsonb,
  shipping numeric not null default 0,
  discount numeric not null default 0,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  note text not null default '',
  pic uuid,
  pic_name text,
  track_token text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  deleted boolean not null default false
);

-- Pembayaran dicatat per transaksi (tidak bisa ditimpa, hanya owner yang bisa membatalkan)
create table if not exists public.payments (
  id text primary key,
  order_id text not null,
  amount numeric not null,
  method text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  deleted boolean not null default false
);

create table if not exists public.activity_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  admin_name text,
  action text not null,
  ref_table text,
  ref_id text,
  ref_label text,
  detail text not null default ''
);

create index if not exists products_updated_idx  on public.products  (updated_at);
create index if not exists customers_updated_idx on public.customers (updated_at);
create index if not exists customers_phone_idx   on public.customers (phone);
create index if not exists orders_updated_idx    on public.orders    (updated_at);
create index if not exists orders_customer_idx   on public.orders    (customer_id);
create index if not exists payments_updated_idx  on public.payments  (updated_at);
create index if not exists payments_order_idx    on public.payments  (order_id);
create index if not exists activity_log_at_idx   on public.activity_log (at desc);

-- ---------------------------------------------------------------------
-- 3. TRIGGER: cap waktu & pengubah, aturan hapus, aturan shopper, log
-- ---------------------------------------------------------------------
create or replace function public.touch_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta text[] := array['updated_at','updated_by','updated_by_name','created_at'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - meta) = (to_jsonb(old) - meta) then
    return old;  -- tidak ada perubahan: abaikan
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_name := public.my_name();
  if tg_op = 'UPDATE' and tg_table_name <> 'settings' then
    new.created_at := old.created_at;
  end if;
  if tg_table_name in ('products','customers','orders','payments') and tg_op = 'UPDATE' then
    if new.deleted and not old.deleted and auth.uid() is not null and not public.is_owner() then
      raise exception 'Hanya owner yang boleh menghapus data';
    end if;
  end if;
  if tg_table_name = 'orders' and tg_op = 'UPDATE' and public.my_role() = 'shopper' then
    if new.customer_id is distinct from old.customer_id
       or new.shipping is distinct from old.shipping
       or new.discount is distinct from old.discount
       or new.total is distinct from old.total then
      raise exception 'Peran shopper tidak boleh mengubah customer, ongkir, diskon, atau harga';
    end if;
  end if;
  return new;
end $$;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_detail text := '';
  v_label  text;
  v_id     text;
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return null;
  end if;

  if tg_table_name = 'orders' then
    v_id := new.id; v_label := new.code;
    if tg_op = 'INSERT' then
      v_action := case when new.source = 'web' then 'pesanan web masuk' else 'buat pesanan' end;
    elsif new.deleted and not old.deleted then v_action := 'hapus pesanan';
    elsif new.status is distinct from old.status then
      v_action := 'ubah status'; v_detail := old.status || ' → ' || new.status;
    elsif new.pic is distinct from old.pic then
      v_action := 'ambil pesanan'; v_detail := coalesce(new.pic_name, '');
    else v_action := 'ubah pesanan';
    end if;
  elsif tg_table_name = 'products' then
    v_id := new.id; v_label := new.name;
    if tg_op = 'INSERT' then v_action := 'tambah produk';
    elsif new.deleted and not old.deleted then v_action := 'hapus produk';
    else
      v_action := 'ubah produk';
      if new.sell_price is distinct from old.sell_price then
        v_detail := 'harga ' || coalesce(old.sell_price::text, '-') || ' → ' || coalesce(new.sell_price::text, '-');
      end if;
    end if;
  elsif tg_table_name = 'customers' then
    v_id := new.id; v_label := new.name;
    v_action := case when tg_op = 'INSERT' then 'tambah customer'
                     when new.deleted and not old.deleted then 'hapus customer'
                     else 'ubah customer' end;
  elsif tg_table_name = 'payments' then
    v_id := new.order_id;
    v_label := (select code from public.orders where id = new.order_id);
    v_detail := 'Rp ' || new.amount::text || case when new.method <> '' then ' · ' || new.method else '' end;
    v_action := case when tg_op = 'INSERT' then 'catat pembayaran'
                     when new.deleted and not old.deleted then 'batalkan pembayaran'
                     else 'ubah pembayaran' end;
  elsif tg_table_name = 'settings' then
    v_id := new.id; v_label := 'pengaturan'; v_action := 'ubah pengaturan';
  elsif tg_table_name = 'admins' then
    v_id := new.id::text; v_label := new.name;
    if tg_op = 'INSERT' then v_action := 'admin baru daftar'; v_detail := new.role;
    elsif new.role is distinct from old.role then
      v_action := 'ubah peran'; v_detail := old.role || ' → ' || new.role;
    else return null;
    end if;
  end if;

  insert into public.activity_log (admin_id, admin_name, action, ref_table, ref_id, ref_label, detail)
  values (auth.uid(),
          case when auth.uid() is null and tg_table_name = 'admins' then 'Sistem' else public.my_name() end,
          v_action, tg_table_name, v_id, v_label, v_detail);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','products','customers','orders','payments'] loop
    execute format('drop trigger if exists kuytitip_touch on public.%I', t);
    execute format('create trigger kuytitip_touch before insert or update on public.%I
                    for each row execute function public.touch_row()', t);
  end loop;
  foreach t in array array['settings','products','customers','orders','payments','admins'] loop
    execute format('drop trigger if exists kuytitip_log on public.%I', t);
    execute format('create trigger kuytitip_log after insert or update on public.%I
                    for each row execute function public.log_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. KEAMANAN (Row Level Security)
--    Web publik (anon) TIDAK bisa membaca tabel langsung — hanya lewat
--    fungsi catalog(), place_web_order(), track_order() di bawah.
-- ---------------------------------------------------------------------
alter table public.admins       enable row level security;
alter table public.settings     enable row level security;
alter table public.products     enable row level security;
alter table public.customers    enable row level security;
alter table public.orders       enable row level security;
alter table public.payments     enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.admins, public.settings, public.products, public.customers,
              public.orders, public.payments, public.activity_log from anon;
grant select, insert, update on public.settings, public.products, public.customers,
              public.orders, public.payments to authenticated;
grant select, update on public.admins to authenticated;
grant select on public.activity_log to authenticated;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and policyname like 'kt_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy kt_admins_select on public.admins for select to authenticated
  using (public.is_staff() or id = auth.uid());
create policy kt_admins_update on public.admins for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy kt_settings_select on public.settings for select to authenticated using (public.is_staff());
create policy kt_settings_insert on public.settings for insert to authenticated with check (public.is_owner());
create policy kt_settings_update on public.settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy kt_products_select on public.products for select to authenticated using (public.is_staff());
create policy kt_products_insert on public.products for insert to authenticated with check (public.can_sell());
create policy kt_products_update on public.products for update to authenticated
  using (public.can_sell()) with check (public.can_sell());

create policy kt_customers_select on public.customers for select to authenticated using (public.is_staff());
create policy kt_customers_insert on public.customers for insert to authenticated with check (public.can_sell());
create policy kt_customers_update on public.customers for update to authenticated
  using (public.can_sell()) with check (public.can_sell());

create policy kt_orders_select on public.orders for select to authenticated using (public.is_staff());
create policy kt_orders_insert on public.orders for insert to authenticated with check (public.can_sell());
create policy kt_orders_update on public.orders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy kt_payments_select on public.payments for select to authenticated using (public.is_staff());
create policy kt_payments_insert on public.payments for insert to authenticated with check (public.can_sell());
create policy kt_payments_update on public.payments for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy kt_log_select on public.activity_log for select to authenticated using (public.is_owner());

-- ---------------------------------------------------------------------
-- 5. FUNGSI PUBLIK untuk web buyer
-- ---------------------------------------------------------------------
create or replace function public.catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'info', coalesce((select jsonb_build_object(
        'business',   coalesce(nullif(data->>'business',''), 'KuyTitip'),
        'wa',         coalesce(data->>'ownerWa', ''),
        'trip',       coalesce(data->>'trip', ''),
        'poOpen',     coalesce((data->>'poOpen')::boolean, true),
        'poDeadline', coalesce(data->>'poDeadline', ''),
        'poNote',     coalesce(data->>'poNote', ''))
      from public.settings where id = 'main'), '{}'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'brand', brand, 'description', description,
        'price', sell_price, 'photo', photo, 'weight', weight)
        order by brand, sort, name)
      from public.products
      where published and not deleted and coalesce(sell_price, 0) > 0), '[]'::jsonb))
$$;

create or replace function public.place_web_order(
  p_name text, p_phone text, p_items jsonb,
  p_city text default '', p_address text default '', p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_cust  text;
  v_items jsonb := '[]'::jsonb;
  v_item  jsonb;
  v_p     public.products%rowtype;
  v_qty   integer;
  v_code  text;
  v_id    text;
  v_token text;
  v_trip  text := '';
  v_open  boolean := true;
  v_total numeric := 0;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nama wajib diisi'; end if;
  if v_phone like '0%' then v_phone := '62' || substr(v_phone, 2);
  elsif v_phone like '8%' then v_phone := '62' || v_phone; end if;
  if length(v_phone) < 10 or length(v_phone) > 15 then raise exception 'Nomor WhatsApp tidak valid'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Terlalu banyak jenis barang'; end if;

  select coalesce((data->>'poOpen')::boolean, true), coalesce(data->>'trip', '')
    into v_open, v_trip from public.settings where id = 'main';
  if v_open is false then raise exception 'PO sedang tutup'; end if;

  if (select count(*) from public.orders o join public.customers c on c.id = o.customer_id
      where c.phone = v_phone and o.source = 'web' and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Terlalu banyak pesanan dari nomor ini, coba lagi nanti';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((v_item->>'qty')::integer, 1), 1), 99);
    select * into v_p from public.products
      where id = v_item->>'id' and published and not deleted and coalesce(sell_price, 0) > 0;
    if not found then raise exception 'Produk tidak tersedia lagi: %', coalesce(v_item->>'id', '?'); end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'i' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
      'productId', v_p.id, 'name', v_p.name, 'qty', v_qty,
      'weight', coalesce(v_p.weight::text, ''),
      'buyPrice', coalesce(v_p.buy_price::text, ''), 'buyCur', coalesce(v_p.buy_cur, 'THB'),
      'sellPrice', v_p.sell_price, 'sellCur', 'IDR', 'sellIDR', v_p.sell_price,
      'rate', '', 'photos', '[]'::jsonb, 'productPhoto', v_p.photo,
      'note', left(coalesce(v_item->>'note', ''), 200)));
    v_total := v_total + v_p.sell_price * v_qty;
  end loop;

  select id into v_cust from public.customers
    where phone = v_phone and not deleted order by created_at limit 1;
  if v_cust is null then
    v_cust := 'c_w' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    insert into public.customers (id, name, phone, city, address)
    values (v_cust, left(trim(p_name), 80), v_phone, left(coalesce(p_city, ''), 80), left(coalesce(p_address, ''), 300));
  else
    update public.customers set
      city    = case when city = ''    then left(coalesce(p_city, ''), 80)     else city end,
      address = case when address = '' then left(coalesce(p_address, ''), 300) else address end
    where id = v_cust;
  end if;

  loop
    v_code := 'W' || to_char(now() at time zone 'Asia/Jakarta', 'YYMM') || '-'
              || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from public.orders where code = v_code);
  end loop;
  v_id := 'o_w' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);

  insert into public.orders (id, code, customer_id, trip, status, source, items, note, subtotal, total)
  values (v_id, v_code, v_cust, v_trip, 'menunggu', 'web', v_items, left(coalesce(p_note, ''), 500), v_total, v_total)
  returning track_token into v_token;

  return jsonb_build_object('code', v_code, 'token', v_token, 'total', v_total);
end $$;

create or replace function public.track_order(p_code text, p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'trip', o.trip,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'customer', split_part(coalesce(c.name, ''), ' ', 1),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', it->>'name', 'qty', it->'qty',
        'price', coalesce(it->'sellIDR', it->'sellPrice'),
        'photos', coalesce(it->'photos', '[]'::jsonb),
        'productPhoto', it->>'productPhoto',
        'bought', coalesce((it->>'bought')::boolean, false))), '[]'::jsonb)
      from jsonb_array_elements(o.items) it),
    'receipts', o.receipts,
    'subtotal', o.subtotal, 'shipping', o.shipping, 'discount', o.discount, 'total', o.total,
    'paid', (select coalesce(sum(amount), 0) from public.payments p where p.order_id = o.id and not p.deleted),
    'wa', (select data->>'ownerWa' from public.settings where id = 'main'),
    'business', (select data->>'business' from public.settings where id = 'main'))
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.code = upper(trim(p_code)) and o.track_token = trim(p_token) and not o.deleted
$$;

grant execute on function public.catalog() to anon, authenticated;
grant execute on function public.place_web_order(text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. PENYIMPANAN FOTO (bucket publik "photos", hanya admin yang bisa upload)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists kt_photos_insert on storage.objects;
drop policy if exists kt_photos_update on storage.objects;
drop policy if exists kt_photos_delete on storage.objects;
create policy kt_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_staff());
create policy kt_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_staff());
create policy kt_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_staff());

-- ---------------------------------------------------------------------
-- 7. REALTIME (perubahan langsung muncul di HP admin lain)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','products','customers','orders','payments','admins'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. PENGATURAN AWAL
-- ---------------------------------------------------------------------
insert into public.settings (id, data) values ('main', jsonb_build_object(
  'business', 'KuyTitipIbuMami',
  'ownerWa', '6281373186844',
  'trip', '',
  'currency', 'THB',
  'fee', jsonb_build_object('type', 'percent', 'value', 10),
  'shipPerKg', 0,
  'rounding', 1000,
  'lockedRates', '{}'::jsonb,
  'poOpen', true,
  'poDeadline', '',
  'poNote', ''
)) on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 9. DATA AWAL KATALOG (dari data.js lama — 71 produk)
--    Harga beli belum diisi; lengkapi dari aplikasi bila perlu.
-- ---------------------------------------------------------------------
insert into public.products (id, name, brand, description, sell_price, photo, sort, note) values
('p_tofu_01', 'Tofu Precious Moisturizing', 'TOFU', 'Body lotion dengan kandungan niacinamide.', 155000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_01.jpg', 1, 'Rp 155.000'),
('p_tofu_02', 'Tofu Milk Plus Biru', 'TOFU', 'Brightening body lotion, 400gr.', 175000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_02.jpg', 2, 'Rp 175.000'),
('p_tofu_03', 'Tofu MP Peach', 'TOFU', 'Lotion melembapkan dengan SPF, melindungi dari sinar UV.', 190000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_03.jpg', 3, 'Rp 190.000'),
('p_tofu_04', 'Tofu Body Lotion', 'TOFU', 'Triple pelembap, bagus untuk kulit kering.', 245000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_04.jpg', 4, 'Rp 245.000'),
('p_tofu_05', 'Tofu Facial Wash MP (Putih)', 'TOFU', 'Membersihkan wajah tanpa bikin kering atau ketarik. · 100ml', 175000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_05.jpg', 5, 'Rp 175.000 (100ml)'),
('p_tofu_06', 'Tofu Facial Wash MP (Hijau)', 'TOFU', 'Facial wash untuk wajah berjerawat, review bagus.', 180000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_06.jpg', 6, 'Rp 180.000'),
('p_tofu_07', 'Tofu Walnut''s CC', 'TOFU', 'Handbody dengan SPF untuk melindungi dari sinar UV. · 200ml', 185000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_07.jpg', 7, 'Rp 185.000 (200ml)'),
('p_tofu_08', 'Tofu Nano White Dose', 'TOFU', 'Serum 50x whitening, mencerahkan & meratakan warna kulit. · 60ml', 195000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_08.jpg', 8, 'Rp 195.000 (60ml)'),
('p_tofu_09', 'Chupa Chups Soap', 'TOFU', 'Sabun aroma permen Chupa Chups.', 55000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_09.jpg', 9, 'Rp 55.000'),
('p_tofu_10', 'Vaseline Handcream', 'TOFU', 'Bikin tangan halus & lembut.', 75000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_10.jpg', 10, 'Rp 75.000'),
('p_tofu_11', 'Joji Urea Cream', 'TOFU', 'Melembapkan & menghaluskan kulit kaki kering pecah-pecah. · 50gr', 100000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_11.jpg', 11, 'Rp 100.000 (50gr)'),
('p_tofu_12', 'Serum Vit E Baby Face', 'TOFU', 'Mengurangi kerutan, kemerahan & bintik hitam. · 30ml', 115000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_12.jpg', 12, 'Rp 115.000 (30ml)'),
('p_tofu_13', 'Precious Skin Thailand Vit C Lemon', 'TOFU', 'Serum wajah dengan ekstrak lemon, mengembalikan kelembapan. · 50ml', 110000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_13.jpg', 13, 'Rp 110.000 (50ml)'),
('p_tofu_14', 'Tofu Kplus Serum', 'TOFU', 'Hyaluronic acid, melembapkan & mencerahkan kulit. · 20ml', 150000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_14.jpg', 14, 'Rp 150.000 (20ml)'),
('p_tofu_15', 'Tofu Day Cream Kplus', 'TOFU', 'Hyaluronic acid, melembapkan & mencerahkan kulit.', 150000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_15.jpg', 15, 'Rp 150.000'),
('p_tofu_16', 'Tofu Night Cream Kplus', 'TOFU', 'Hyaluronic acid, melembapkan & mencerahkan kulit.', 160000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_16.jpg', 16, 'Rp 160.000'),
('p_tofu_17', 'Poy Sian Roll On', 'TOFU', 'Minyak angin roll on khas Thailand. · Harga: Rp 50.000 (1pcs) / Rp 135.000 (3pcs)', 50000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_17.jpg', 17, 'Rp 50.000 (1pcs) / Rp 135.000 (3pcs)'),
('p_tofu_18', 'Vapex Black Inhaler', 'TOFU', 'Inhaler angin khas Thailand. · 6pcs', 125000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_18.jpg', 18, 'Rp 125.000 (6pcs)'),
('p_tofu_19', 'Tiger Poy Sian Peppermint Inhaler', 'TOFU', 'Inhaler peppermint, isi 6pcs. · 6pcs', 110000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_19.jpg', 19, 'Rp 110.000 (6pcs)'),
('p_tofu_20', 'Golden Cup Inhaler', 'TOFU', 'Inhaler khas Thailand, isi 6pcs. · 6pcs', 110000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_20.jpg', 20, 'Rp 110.000 (6pcs)'),
('p_tofu_21', 'YokoYoko', 'TOFU', 'Meredakan pegal, linu & nyeri otot leher, bahu, punggung.', 165000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_21.jpg', 21, 'Rp 165.000'),
('p_tofu_22', 'Hair Tonik Genive', 'TOFU', 'Mengurangi kerontokan & menjaga akar rambut sehat. · 120ml', 95000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_22.jpg', 22, 'Rp 95.000 (120ml)'),
('p_tofu_23', 'In2it Primer Glow', 'TOFU', 'Base makeup, tidak mudah luntur, SPF 25 PA++++.', 185000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_23.jpg', 23, 'Rp 185.000'),
('p_tofu_24', 'In2it Primer', 'TOFU', 'Cocok untuk kulit berminyak (matte) atau kering (glow).', 180000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_24.jpg', 24, 'Rp 180.000'),
('p_tofu_25', 'Taoyeablok', 'TOFU', 'Deodorant powder kaki, menghilangkan bau, 2 varian. · 30gr', 50000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_25.jpg', 25, 'Rp 50.000 (30gr)'),
('p_tofu_26', 'Roll On Vitamin E', 'TOFU', 'Roll on dengan kandungan vitamin E.', 50000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_26.jpg', 26, 'Rp 50.000'),
('p_tofu_27', 'Top Country Deodorant for Man', 'TOFU', 'Wangi maskulin, menahan keringat berlebih. · Harga: Rp 60.000–100.000', 60000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_27.jpg', 27, 'Rp 60.000–100.000'),
('p_tofu_28', 'Chupa Chups Toothpaste', 'TOFU', 'Odol 1500ppm fluoride, cegah kerusakan gigi.', 80000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_28.jpg', 28, 'Rp 80.000'),
('p_tofu_29', 'Kodomo Toothpaste', 'TOFU', 'Odol anak 1000ppm fluoride.', 65000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_29.jpg', 29, 'Rp 65.000'),
('p_tofu_30', 'Rasyan Herbal Clove Toothpaste', 'TOFU', 'Odol herbal cengkeh, bikin napas segar. · Harga: Rp 45.000–75.000', 45000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_30.jpg', 30, 'Rp 45.000–75.000'),
('p_tofu_31', 'BRW Eyes Brow Shadow', 'TOFU', 'Banyak dipakai MUA, 3 varian warna.', 120000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_31.jpg', 31, 'Rp 120.000'),
('p_tofu_32', 'Gold Princess Food Patch', 'TOFU', 'Patch koyo herbal Thailand.', 80000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_32.jpg', 32, 'Rp 80.000'),
('p_tofu_33', 'TOFU (Joji EDP 45ml)', 'TOFU', 'Eau de parfum 45ml.', 265000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_33.jpg', 33, 'Rp 265.000'),
('p_tofu_34', 'Cathy Doll Cleansing Gel', 'TOFU', 'Orange: cerah & glowing. Hijau: adem & gentle. · Harga: Rp 110.000–125.000', 110000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_34.jpg', 34, 'Rp 110.000–125.000'),
('p_tofu_35', 'TOFU 03', 'TOFU', 'Best seller, bikin wajah cerah.', 150000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_35.jpg', 35, 'Rp 150.000'),
('p_tofu_36', 'Tofu Body Lotion 40x', 'TOFU', 'Cepat habis, cocok untuk kulit kering. · 250gr', 250000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/tofu/tofu_36.jpg', 36, 'Rp 250.000 (250gr)'),
('p_butterfly_01', 'Butterfly Parfum Original (Cherry & Saffron)', 'BUTTERFLY', 'Aroma manis memikat, dipadu almond, cengkeh & melati. · Harga: Rp 295.000 (10ml) / Rp 895.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_01.jpg', 1, 'Rp 295.000 (10ml) / Rp 895.000 (60ml)'),
('p_butterfly_02', 'Butterfly Crystal Deodorant', 'BUTTERFLY', 'Aroma vanilla old money, manis dan hangat. · Harga: Rp 295.000 (10ml) / Rp 900.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_02.jpg', 2, 'Rp 295.000 (10ml) / Rp 900.000 (60ml)'),
('p_butterfly_03', 'Butterfly Parfum Original (Mawar)', 'BUTTERFLY', 'Aroma mawar manis segar, cocok suasana romantis. · Harga: Rp 295.000 (10ml) / Rp 900.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_03.jpg', 3, 'Rp 295.000 (10ml) / Rp 900.000 (60ml)'),
('p_butterfly_04', 'Butterfly Parfum Original (Unisex)', 'BUTTERFLY', 'Bisa dipakai cewek & cowok, aroma hangat memikat. · Harga: Rp 295.000 (10ml) / Rp 900.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_04.jpg', 4, 'Rp 295.000 (10ml) / Rp 900.000 (60ml)'),
('p_butterfly_05', 'Butterfly Parfum Original (Agarwood & Benzoin)', 'BUTTERFLY', 'Perpaduan elegan bunga & kayu, best seller, EDP level. · Harga: Rp 295.000 (10ml) / Rp 900.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_05.jpg', 5, 'Rp 295.000 (10ml) / Rp 900.000 (60ml)'),
('p_butterfly_06', 'Butterfly Parfum Original (Petrichor)', 'BUTTERFLY', 'Lavender, geranium mawar & bergamot, tenang & segar. · Harga: Rp 295.000 (10ml) / Rp 900.000 (60ml)', 295000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_06.jpg', 6, 'Rp 295.000 (10ml) / Rp 900.000 (60ml)'),
('p_butterfly_07', 'Butterfly Hanging Parfum 10ml', 'BUTTERFLY', 'Parfum gantung mobil, aroma tahan lama, banyak varian. · 10ml', 245000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_07.jpg', 7, 'Rp 245.000 (10ml)'),
('p_butterfly_08', 'Butterfly Hang Cream', 'BUTTERFLY', 'Hand cream floral-pear, mangga, atau woody-resin.', 225000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/butterfly/butterfly_08.jpg', 8, 'Rp 225.000'),
('p_gw_01', 'GW Dumpling Bag', 'GENTLEWOMAN', 'Tas dumpling ikonik, bentuk bulat lembut, 8 pilihan warna.', 875000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_01.jpg', 1, 'Rp 875.000'),
('p_gw_02', 'GW Shoulder Bag Ada Magnet', 'GENTLEWOMAN', 'Tas selempang kulit, embossed logo, kancing magnet.', 1135000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_02.jpg', 2, 'Rp 1.135.000'),
('p_gw_03', 'GW Strap Handphone', 'GENTLEWOMAN', 'Gantungan tas manik bintang biru-putih, aksen charm logo.', 325000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_03.jpg', 3, 'Rp 325.000'),
('p_gw_04', 'GW Racket Pouch', 'GENTLEWOMAN', 'Tas raket tenis motif Wiggle Resort, 2 pilihan motif.', 785000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_04.jpg', 4, 'Rp 785.000'),
('p_gw_05', 'GentleWoman Knit Dumpling Bag', 'GENTLEWOMAN', 'Bahan rajut lembut, logo besar kontras, ringan & eye-catching.', 1025000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_05.jpg', 5, 'Rp 1.025.000'),
('p_gw_06', 'GentleWoman x Moomin Denim Dumpling Bag', 'GENTLEWOMAN', 'Kolaborasi Moomin, ada koin pouch karakter, unik & lucu.', 1400000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_06.jpg', 6, 'Rp 1.400.000'),
('p_gw_07', 'Solea Dumpling Bag', 'GENTLEWOMAN', 'Bahan kulit, logo embossed timbul, elegan & minimalis.', 1155000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_07.jpg', 7, 'Rp 1.155.000'),
('p_gw_08', 'Sling Bag Mini Kanvas', 'GENTLEWOMAN', 'Logo hitam-putih klasik, kanvas tebal, kasual.', 650000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_08.jpg', 8, 'Rp 650.000'),
('p_gw_09', 'Totebag Jumbo Kanvas No Klip Magnet', 'GENTLEWOMAN', 'Ukuran besar, muat banyak, cocok harian/kuliah/kerja.', 475000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_09.jpg', 9, 'Rp 475.000'),
('p_gw_10', 'GentleWoman Club Leather Tote Bag w Zipper', 'GENTLEWOMAN', 'Logo embossed, ada resleting, tali panjang, elegan.', 1075000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_10.jpg', 10, 'Rp 1.075.000'),
('p_gw_11', 'GW Club Leather Tote Bag (Small/Mini)', 'GENTLEWOMAN', 'Ukuran ringkas, tersedia warna cokelat & taupe.', 1075000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_11.jpg', 11, 'Rp 1.075.000'),
('p_gw_12', 'Totebag Jumbo Bintang Bahan Kanvas', 'GENTLEWOMAN', 'Warna cream, patch bunga & bintang, edisi dekoratif.', 1125000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_12.jpg', 12, 'Rp 1.125.000'),
('p_gw_13', 'GentleWoman Mini Tote Bag Ribbon Logo Strap', 'GENTLEWOMAN', 'Tali logo berulang, bentuk kotak ringkas, hitam & putih.', 450000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_13.jpg', 13, 'Rp 450.000'),
('p_gw_14', 'Totebag Jumbo Kanvas & Leather', 'GENTLEWOMAN', 'Dalam kanvas, luar leather, warna camel, serbaguna.', 1200000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_14.jpg', 14, 'Rp 1.200.000'),
('p_gw_15', 'Totebag Mat Corduroy', 'GENTLEWOMAN', 'Warna peach, logo bordir merah-hijau kontras, vibrant.', 575000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_15.jpg', 15, 'Rp 575.000'),
('p_gw_16', 'Totebag Two Tone Mat Corduroy', 'GENTLEWOMAN', 'Dua warna krem-hitam, logo bordir besar, kasual & bold.', 575000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_16.jpg', 16, 'Rp 575.000'),
('p_gw_17', 'Totebag Pocket Mat Kanvas', 'GENTLEWOMAN', 'Warna hijau, saku depan pink kontras, eye-catching.', 475000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/gw/gw_17.jpg', 17, 'Rp 475.000'),
('p_erawadee_01', 'Erawadee Herbal Spray No.60', 'ERAWADEE', 'Mampu meredakan sakit dalam waktu 10-15 menit. · Harga: Rp 495.000 (30ml) / Rp 700.000 (85ml)', 495000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_01.jpg', 1, 'Rp 495.000 (30ml) / Rp 700.000 (85ml)'),
('p_erawadee_02', 'Erawadee Crystal Deodorant', 'ERAWADEE', 'Mineral alami tawas, bunuh bakteri penyebab bau badan & kontrol keringat berlebih.', 115000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_02.jpg', 2, 'Rp 115.000'),
('p_erawadee_03', 'Erawadee Black Spray Acne', 'ERAWADEE', 'Terbuat dari akar daun tapak budha, tanpa pewarna & pewangi, efektif sebagai obat semprot jerawat.', 395000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_03.jpg', 3, 'Rp 395.000'),
('p_erawadee_04', 'Erawadee Syn Ake Cream', 'ERAWADEE', 'Cream wajah diformulasikan khusus untuk menghilangkan melasma (flek).', 1250000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_04.jpg', 4, 'Rp 1.250.000'),
('p_erawadee_05', 'Erawadee Roll On', 'ERAWADEE', '10 macam minyak essential & ginseng, untuk sakit kepala, mual, pusing, mabuk laut, hidung mampet. · 8ml', 90000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_05.jpg', 5, 'Rp 90.000 (8ml)'),
('p_erawadee_06', 'Erawadee Gingo Biloba', 'ERAWADEE', 'Untuk pendarahan otak, meningkatkan daya ingat & mikro sirkulasi pembuluh otak. · 100 cap', 470000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_06.jpg', 6, 'Rp 470.000 (100 cap)'),
('p_erawadee_07', 'Erawadee Kariyat', 'ERAWADEE', 'Mengobati pilek, mencegah infeksi, aktivitas anti virus & meningkatkan ketahanan tubuh. · 100 cap', 375000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_07.jpg', 7, 'Rp 375.000 (100 cap)'),
('p_erawadee_08', 'Erawadee Garcinia', 'ERAWADEE', 'Menekan nafsu makan, menunda rasa lapar & memberikan rasa kenyang. · 100 cap', 480000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_08.jpg', 8, 'Rp 480.000 (100 cap)'),
('p_erawadee_09', 'Erawadee Pla Lai Phueak', 'ERAWADEE', 'Mengembalikan kebugaran badan, mencegah ED, memperbaiki kualitas sperma. · 100 cap', 1250000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_09.jpg', 9, 'Rp 1.250.000 (100 cap)'),
('p_erawadee_10', 'Erawadee No.100 Tang Tang Hae Chao', 'ERAWADEE', 'Formula botani untuk dukungan harian energi, stamina & kepercayaan diri. · 10 cap', 850000, 'https://raw.githubusercontent.com/ferryswasonoai-eng/kuytitipibumami/main/images/erawadee/erawadee_10.jpg', 10, 'Rp 850.000 (10 cap)')
on conflict (id) do nothing;
