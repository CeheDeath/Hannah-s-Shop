-- =====================================================================
-- MARLOWE SHOP - one-time database setup for Supabase (Postgres)
--
-- HOW TO RUN:  Supabase dashboard -> SQL Editor -> New query ->
--              paste this WHOLE file -> press RUN.  (Safe to run twice.)
--
-- WHAT IT DOES, in plain words:
--   1. Creates the tables (people, products, delivery areas, orders).
--   2. Turns on "Row Level Security": the database itself refuses to show
--      or change anything the signed-in person is not allowed to touch.
--      This is the main security layer, and it works even if someone
--      bypasses the website and talks to the database directly.
--   3. Creates two guarded "functions": placing an order and changing an
--      order's status. Prices, stock and delivery checks happen there,
--      on the server, so they cannot be faked from a browser.
--   4. Creates a locked-down picture folder (only admins can upload).
--   5. Adds sample delivery areas and products you can edit later.
-- =====================================================================

-- ---------- 1. TABLES ------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  phone      text,
  role       text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 2 and 150),
  description text not null default '' check (char_length(description) <= 3000),
  price       numeric(10,2) not null check (price >= 0 and price < 10000000),
  category    text not null default 'General' check (char_length(category) between 2 and 60),
  sizes       text not null default '' check (char_length(sizes) <= 100),   -- "S,M,L"  (empty = one size)
  stock       integer not null default 0 check (stock >= 0),
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id     bigint generated always as identity primary key,
  name   text not null unique check (char_length(name) between 2 and 100),
  fee    numeric(10,2) not null default 0 check (fee >= 0),
  active boolean not null default true
);

create table if not exists public.orders (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id),
  status       text not null default 'pending'
               check (status in ('pending','confirmed','out_for_delivery','delivered','cancelled')),
  subtotal     numeric(10,2) not null,
  delivery_fee numeric(10,2) not null,
  total        numeric(10,2) not null,
  zone_id      bigint references public.delivery_zones(id) on delete set null,
  address      text not null,
  landmark     text,
  phone        text not null,
  notes        text,
  lat          numeric(9,6),
  lng          numeric(9,6),
  created_at   timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_user_idx   on public.orders(user_id);

-- Name and price are COPIED into each order line so old orders never change.
create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders(id) on delete cascade,
  product_id   bigint references public.products(id) on delete set null,
  product_name text not null,
  size         text not null default '',
  unit_price   numeric(10,2) not null,
  quantity     integer not null check (quantity between 1 and 20)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------- 2. AUTO-CREATE A PROFILE WHEN SOMEONE REGISTERS ------------
-- The role is ALWAYS 'customer' here. It is never read from anything the
-- visitor sends, so nobody can register themselves as an admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          left(coalesce(new.raw_user_meta_data->>'full_name',''), 100),
          left(new.raw_user_meta_data->>'phone', 30));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by the security rules below: "is the current person an admin?"
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- 3. ROW LEVEL SECURITY (the rules of who sees what) ---------
alter table public.profiles       enable row level security;
alter table public.products       enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;

-- profiles: you see only yourself (admins see everyone). You may edit ONLY
-- your name and phone - the 'role' column cannot be changed by anyone but
-- the shop owner running SQL.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- products: everyone can see ACTIVE products; only admins can add/change/delete.
drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (active or public.is_admin());
drop policy if exists products_ins on public.products;
create policy products_ins on public.products for insert with check (public.is_admin());
drop policy if exists products_upd on public.products;
create policy products_upd on public.products for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists products_del on public.products;
create policy products_del on public.products for delete using (public.is_admin());

-- delivery zones: everyone sees active ones; admins manage them.
drop policy if exists zones_read on public.delivery_zones;
create policy zones_read on public.delivery_zones for select using (active or public.is_admin());
drop policy if exists zones_ins on public.delivery_zones;
create policy zones_ins on public.delivery_zones for insert with check (public.is_admin());
drop policy if exists zones_upd on public.delivery_zones;
create policy zones_upd on public.delivery_zones for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists zones_del on public.delivery_zones;
create policy zones_del on public.delivery_zones for delete using (public.is_admin());

-- orders: you see only YOUR orders (admins see all). Nobody can insert,
-- edit or delete orders directly - only through the two functions below.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.orders from anon, authenticated;

drop policy if exists items_select on public.order_items;
create policy items_select on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
revoke insert, update, delete on public.order_items from anon, authenticated;

-- ---------- 4. GUARDED FUNCTIONS ---------------------------------------
-- 4a. PLACE AN ORDER. The browser sends only {id, size, qty}. Everything
--     else (price, stock, delivery fee, who you are) is decided HERE.
create or replace function public.place_order(
  p_items jsonb, p_zone_id bigint, p_address text, p_landmark text,
  p_phone text, p_notes text, p_lat numeric, p_lng numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_zone     public.delivery_zones%rowtype;
  v_prod     public.products%rowtype;
  v_item     jsonb;
  v_order_id bigint;
  v_qty      int;
  v_size     text;
  v_subtotal numeric(10,2) := 0;
begin
  if v_uid is null then raise exception 'Please sign in to place an order.'; end if;
  if public.is_admin() then raise exception 'Admin accounts cannot place orders. Use a customer account.'; end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many items in the cart.'; end if;

  p_address := btrim(coalesce(p_address, ''));
  p_phone   := btrim(coalesce(p_phone, ''));
  if char_length(p_address) < 5 or char_length(p_address) > 255 then raise exception 'Enter your street address.'; end if;
  if p_phone !~ '^\+?[0-9 ()-]{7,20}$' then raise exception 'Enter a valid phone number.'; end if;
  if char_length(coalesce(p_landmark, '')) > 150 then raise exception 'Landmark is too long.'; end if;
  if char_length(coalesce(p_notes, '')) > 500 then raise exception 'Note is too long.'; end if;
  if (p_lat is not null and abs(p_lat) > 90) or (p_lng is not null and abs(p_lng) > 180) then
    raise exception 'Location is not valid.'; end if;

  -- stops one account from flooding the shop with fake orders
  if (select count(*) from public.orders where user_id = v_uid and status = 'pending') >= 5 then
    raise exception 'You already have 5 pending orders. Please wait until they are confirmed.'; end if;

  -- CAN WE DELIVER THERE?
  select * into v_zone from public.delivery_zones where id = p_zone_id and active;
  if not found then raise exception 'Sorry, we do not deliver to that area yet.'; end if;

  insert into public.orders (user_id, subtotal, delivery_fee, total, zone_id, address, landmark, phone, notes, lat, lng)
  values (v_uid, 0, v_zone.fee, 0, v_zone.id, p_address, nullif(btrim(coalesce(p_landmark,'')), ''),
          p_phone, nullif(btrim(coalesce(p_notes,'')), ''), p_lat, p_lng)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'id','')  !~ '^\d{1,15}$' then raise exception 'Invalid cart.'; end if;
    if coalesce(v_item->>'qty','') !~ '^\d{1,2}$'  then raise exception 'Invalid quantity.'; end if;
    v_qty  := (v_item->>'qty')::int;
    v_size := btrim(coalesce(v_item->>'size', ''));
    if v_qty < 1 or v_qty > 20 then raise exception 'Invalid quantity.'; end if;

    -- lock the product row so two buyers cannot take the last item together
    select * into v_prod from public.products where id = (v_item->>'id')::bigint and active for update;
    if not found then raise exception 'An item in your cart is no longer available.'; end if;

    if v_prod.sizes <> '' then
      if not (v_size = any (string_to_array(replace(v_prod.sizes, ' ', ''), ','))) then
        raise exception 'Choose a size for %.', v_prod.name; end if;
    else
      v_size := '';
    end if;

    if v_prod.stock < v_qty then
      raise exception 'Only % left of %.', v_prod.stock, v_prod.name; end if;

    update public.products set stock = stock - v_qty where id = v_prod.id;
    insert into public.order_items (order_id, product_id, product_name, size, unit_price, quantity)
    values (v_order_id, v_prod.id, v_prod.name, v_size, v_prod.price, v_qty);
    v_subtotal := v_subtotal + v_prod.price * v_qty;      -- REAL price from the database
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal + v_zone.fee where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'total', v_subtotal + v_zone.fee);
end $$;

-- 4b. CHANGE AN ORDER'S STATUS (admins only). Cancelling returns stock.
create or replace function public.admin_set_order_status(p_order_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_current text;
begin
  if not public.is_admin() then raise exception 'You do not have permission to do that.'; end if;
  if p_status not in ('pending','confirmed','out_for_delivery','delivered','cancelled') then
    raise exception 'Unknown status.'; end if;

  select status into v_current from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if v_current = 'cancelled' then raise exception 'A cancelled order cannot be changed.'; end if;

  if p_status = 'cancelled' then
    update public.products p set stock = p.stock + x.q
    from (select product_id, sum(quantity)::int as q from public.order_items
          where order_id = p_order_id and product_id is not null group by product_id) x
    where p.id = x.product_id;
  end if;
  update public.orders set status = p_status where id = p_order_id;
end $$;

revoke execute on function public.place_order(jsonb, bigint, text, text, text, text, numeric, numeric) from public, anon;
grant  execute on function public.place_order(jsonb, bigint, text, text, text, text, numeric, numeric) to authenticated;
revoke execute on function public.admin_set_order_status(bigint, text) from public, anon;
grant  execute on function public.admin_set_order_status(bigint, text) to authenticated;

-- ---------- 5. PICTURE STORAGE ------------------------------------------
-- Public to VIEW (so shoppers see pictures), admin-only to UPLOAD/CHANGE.
-- The database itself enforces: max 3 MB, JPG/PNG/WEBP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists pi_admin_select on storage.objects;
create policy pi_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists pi_admin_insert on storage.objects;
create policy pi_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists pi_admin_update on storage.objects;
create policy pi_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists pi_admin_delete on storage.objects;
create policy pi_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ---------- 6. SAMPLE DATA (edit/delete later in the admin panel) -------
insert into public.delivery_zones (name, fee) values
  ('City Centre', 3.00), ('North Suburbs', 5.00), ('South Suburbs', 5.00)
on conflict (name) do nothing;

do $$ begin
  if not exists (select 1 from public.products) then
    insert into public.products (name, description, price, category, sizes, stock, image_url) values
    ('Linen Wrap Dress', 'Breathable cobalt linen with a self-tie waist and flutter sleeves. Falls just below the knee.', 64.00, 'Dresses', 'S,M,L', 12, 'img/products/linen-wrap-dress.svg'),
    ('Wide-Leg Trousers', 'High-rise, pressed crease, concealed zip. Drapes well and washes easily.', 52.00, 'Trousers', '28,30,32,34', 20, 'img/products/wide-leg-trousers.svg'),
    ('Boxy Cotton Tee', 'Heavy 220gsm cotton, relaxed boxy fit, pre-washed so it keeps its shape.', 19.99, 'Tops', 'S,M,L,XL', 40, 'img/products/boxy-cotton-tee.svg'),
    ('Camel Wool Coat', 'Single-breasted, notch lapel, two flap pockets. Warm without the bulk.', 139.00, 'Outerwear', 'S,M,L', 8, 'img/products/wool-coat.svg'),
    ('Canvas Market Tote', 'Large natural canvas tote with a cobalt stripe and an inner zip pocket.', 22.00, 'Accessories', '', 25, 'img/products/canvas-tote.svg'),
    ('Court Sneaker', 'Clean leather-look upper, cushioned insole, cobalt stripe.', 74.00, 'Shoes', '38,39,40,41,42', 15, 'img/products/court-sneaker.svg'),
    ('Bucket Hat', 'Cotton twill, soft brim, stitched crown. Packs flat.', 18.50, 'Accessories', '', 30, 'img/products/bucket-hat.svg'),
    ('Rib-Knit Sweater', 'Soft cotton-blend rib knit in sage. Relaxed fit, ribbed cuffs and hem.', 58.00, 'Tops', 'S,M,L,XL', 18, 'img/products/rib-knit-sweater.svg');
  end if;
end $$;

-- =====================================================================
-- MAKING YOURSELF THE ADMIN (do this AFTER registering on your website):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Replace the email with the one you registered with, and run just that line.
-- =====================================================================
