-- Patch: flyer promo di web buyer (tambah info.promo ke catalog). Jalankan sekali di Supabase SQL Editor.
create or replace function public.catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'info', coalesce((select jsonb_build_object(
        'business',   coalesce(nullif(data->>'business',''), 'KuyTitip'),
        'wa',         coalesce(data->>'ownerWa', ''),
        'tagline',    coalesce(data->>'tagline', ''),
        'categories', coalesce(data->'categories', '[]'::jsonb),
        'faq',        coalesce(data->'faq', '[]'::jsonb),
        'promo',      case when coalesce((data->'promo'->>'active')::boolean, true)
                            and nullif(data->'promo'->>'image', '') is not null
                            and coalesce((data->'promo'->>'end')::timestamptz, now()) >= now()
                       then data->'promo' else null end)
      from public.settings where id = 'main'), '{}'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', name, 'title', title, 'country', country, 'flag', flag,
        'currency', currency, 'poStart', po_start, 'poEnd', po_end, 'eta', eta, 'note', note,
        'tagline', tagline, 'color', color, 'banner', banner, 'status', status)
        order by (status = 'open') desc, sort, po_start nulls last, name)
      from public.events where not deleted and status in ('open','closed')), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'brand', brand, 'description', description, 'category', category,
        'events', events, 'badge', badge, 'featured', featured,
        'price', sell_price, 'photo', photo, 'weight', weight,
        'photos', case when cardinality(photos) > 0 then to_jsonb(photos) when photo is not null then jsonb_build_array(photo) else '[]'::jsonb end)
        order by featured desc, brand, sort, name)
      from public.products
      where published and not deleted and coalesce(sell_price, 0) > 0), '[]'::jsonb))
$$;
