-- Idempotent core schema repair for Home Made Food.
-- Customer/order data is accessed through the server API, which validates the signed
-- customer session or order number + phone before using the service-role key.
create extension if not exists pgcrypto;

create table if not exists public.store_settings (
  id text primary key, data jsonb not null default '{}'::jsonb,
  is_holiday_mode boolean not null default false, holiday_message text not null default '',
  is_kitchen_closed boolean not null default false, weekly_hours jsonb not null default '{}'::jsonb,
  meal_slots jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
alter table public.store_settings add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.store_settings add column if not exists is_holiday_mode boolean not null default false;
alter table public.store_settings add column if not exists holiday_message text not null default '';
alter table public.store_settings add column if not exists is_kitchen_closed boolean not null default false;
alter table public.store_settings add column if not exists weekly_hours jsonb not null default '{}'::jsonb;
alter table public.store_settings add column if not exists meal_slots jsonb not null default '{}'::jsonb;
alter table public.store_settings add column if not exists updated_at timestamptz not null default now();
insert into public.store_settings (id, data) values ('singleton',
  '{"restaurant":{"name":"Home Made Food","description":"","phone":"","whatsapp":"","email":"","address":"","logoUrl":"","isOpen":true},"delivery":{"baseFee":0,"freeDeliveryThreshold":0,"estimatedDeliveryTime":"30-45 minutes","deliveryRadiusKm":20,"minOrderAmount":0,"deliveryAreas":["Bahawalpur"]},"payments":{"cashOnDelivery":true,"raastQrUrl":"","raastMerchantName":"MUMTAZ ALI","raastRef":"9955","bankName":"","bankAccountTitle":"","bankIban":"","taxPercentage":0,"paymentInstructions":""},"businessHours":{"schedule":{},"mealSlots":[],"holidayMode":false,"holidayMessage":"","slotDurationMinutes":60,"slots":[]},"social":{"facebook":"","instagram":"","whatsappBusiness":"","tiktok":"","supportEmail":""},"account":{"adminEmails":[],"notificationEmails":[],"sessionTimeoutHours":24,"twoFactorEnabled":false,"pinCode":""}}'::jsonb)
on conflict (id) do update set data = excluded.data where public.store_settings.data = '{}'::jsonb;
update public.store_settings set
  is_holiday_mode = case when data #>> '{businessHours,holidayMode}' in ('true','false') then (data #>> '{businessHours,holidayMode}')::boolean else false end,
  holiday_message = coalesce(data #>> '{businessHours,holidayMessage}', ''),
  is_kitchen_closed = case when data #>> '{restaurant,isOpen}' = 'false' then true else false end,
  weekly_hours = coalesce(data #> '{businessHours,schedule}', '{}'::jsonb),
  meal_slots = coalesce(data #> '{businessHours,mealSlots}', '[]'::jsonb)
where id = 'singleton';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, email text unique,
  full_name text not null default 'Customer', phone text not null default '', avatar_url text not null default '',
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.customers (
  id text primary key, auth_user_id uuid references auth.users(id) on delete set null,
  name text not null default 'Customer', email text not null unique, phone text not null default '', avatar_url text not null default '',
  auth_provider text not null default 'email', email_verified boolean not null default false,
  addresses jsonb not null default '[]'::jsonb, notes text not null default '', created_at timestamptz not null default now(),
  last_login_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.customers add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

create table if not exists public.menu_items (
  id bigint primary key, name text not null, description text not null default '', category text not null default 'Dinner',
  categories jsonb not null default '[]'::jsonb, image text not null default '🍲', image_url text not null default '',
  portions jsonb not null default '[]'::jsonb, serving_size text, dietary_tags jsonb not null default '[]'::jsonb,
  rating numeric, rating_count integer, available boolean not null default true, featured boolean not null default false,
  sold_out boolean not null default false, translations jsonb not null default '{}'::jsonb
);
create table if not exists public.categories (
  name text primary key, created_at timestamptz not null default now()
);
create table if not exists public.daily_deals (
  id bigint primary key, title text not null, description text not null default '',
  regular_price numeric not null default 0, discounted_price numeric not null default 0,
  image_url text not null default '', available boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.menu_items add column if not exists categories jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists image_url text not null default '';
alter table public.menu_items add column if not exists portions jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists serving_size text;
alter table public.menu_items add column if not exists dietary_tags jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists rating numeric;
alter table public.menu_items add column if not exists rating_count integer;
alter table public.menu_items add column if not exists available boolean not null default true;
alter table public.menu_items add column if not exists featured boolean not null default false;
alter table public.menu_items add column if not exists sold_out boolean not null default false;
alter table public.menu_items add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.daily_deals add column if not exists title text not null default 'Daily Deal';
alter table public.daily_deals add column if not exists description text not null default '';
alter table public.daily_deals add column if not exists regular_price numeric not null default 0;
alter table public.daily_deals add column if not exists discounted_price numeric not null default 0;
alter table public.daily_deals add column if not exists image_url text not null default '';
alter table public.daily_deals add column if not exists available boolean not null default true;
alter table public.daily_deals add column if not exists updated_at timestamptz not null default now();
create table if not exists public.orders (
  id text primary key, number text not null unique, customer_name text not null, customer_email text,
  customer_phone text not null default '', area text not null default 'Bahawalpur', address text not null default '', notes text,
  payment_method text not null default 'Cash on Delivery', items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0, discount numeric not null default 0, delivery_fee numeric not null default 0, total numeric not null default 0,
  status text not null default 'pending', payment_status text not null default 'pending', payment_slip_url text, payment_slip_name text,
  admin_note text, admin_video_url text, admin_notes text, admin_media_url text, customer_note text, rider_name text, rider_phone text, estimated_delivery text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_name text not null default 'Customer';
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text not null default '';
alter table public.orders add column if not exists area text not null default 'Bahawalpur';
alter table public.orders add column if not exists address text not null default '';
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists payment_method text not null default 'Cash on Delivery';
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists subtotal numeric not null default 0;
alter table public.orders add column if not exists discount numeric not null default 0;
alter table public.orders add column if not exists delivery_fee numeric not null default 0;
alter table public.orders add column if not exists total numeric not null default 0;
alter table public.orders add column if not exists status text not null default 'pending';
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists payment_slip_url text;
alter table public.orders add column if not exists payment_slip_name text;
alter table public.orders add column if not exists admin_notes text;
alter table public.orders add column if not exists admin_media_url text;
alter table public.orders add column if not exists admin_note text;
alter table public.orders add column if not exists admin_video_url text;
alter table public.orders add column if not exists customer_note text;
alter table public.orders add column if not exists rider_name text;
alter table public.orders add column if not exists rider_phone text;
alter table public.orders add column if not exists estimated_delivery text;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists customer_id text references public.customers(id) on delete set null;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(), type text not null, title text not null,
  body text not null default '', order_number text references public.orders(number) on update cascade on delete cascade,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists admin_notifications_unread_created_idx on public.admin_notifications(read, created_at desc);
create table if not exists public.admin_notification_events (
  id text primary key check (id = 'singleton'), updated_at timestamptz not null default now()
);
insert into public.admin_notification_events (id) values ('singleton') on conflict (id) do nothing;
create or replace function public.publish_homefood_notification_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_notification_events (id, updated_at) values ('singleton', now())
  on conflict (id) do update set updated_at = excluded.updated_at;
  return new;
end $$;
drop trigger if exists on_homefood_notification_change on public.admin_notifications;
create trigger on_homefood_notification_change after insert or update on public.admin_notifications
for each row execute function public.publish_homefood_notification_change();
do $$ begin
  if to_regclass('public.notifications') is not null then
    execute 'insert into public.admin_notifications (id,type,title,body,order_number,priority,read,created_at)
      select id,type,title,body,order_number,priority,read,created_at from public.notifications on conflict (id) do nothing';
  end if;
end $$;

create table if not exists public.store_settings_public (
  id text primary key, updated_at timestamptz not null default now()
);
insert into public.store_settings_public (id, updated_at)
select id, updated_at from public.store_settings where id = 'singleton'
on conflict (id) do update set updated_at = excluded.updated_at;
create or replace function public.publish_homefood_settings_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.store_settings_public (id, updated_at) values (new.id, now())
  on conflict (id) do update set updated_at = excluded.updated_at;
  return new;
end $$;
drop trigger if exists on_homefood_store_settings_change on public.store_settings;
create trigger on_homefood_store_settings_change after insert or update on public.store_settings
for each row execute function public.publish_homefood_settings_change();

create or replace function public.sync_homefood_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, metadata)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Customer'),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''), coalesce(new.raw_user_meta_data, '{}'::jsonb))
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name,
    avatar_url = excluded.avatar_url, metadata = excluded.metadata, updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_homefood_profile on auth.users;
create trigger on_auth_user_homefood_profile after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_homefood_profile();

alter table public.store_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.menu_items enable row level security;
alter table public.categories enable row level security;
alter table public.daily_deals enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_events enable row level security;
alter table public.store_settings_public enable row level security;
drop policy if exists "Public can read store settings" on public.store_settings;
revoke all privileges on public.store_settings from anon, authenticated;
grant select on public.store_settings_public to anon, authenticated;
drop policy if exists "Public can read safe settings sync signal" on public.store_settings_public;
create policy "Public can read safe settings sync signal" on public.store_settings_public for select to anon, authenticated using (true);
drop policy if exists "Public can read menu items" on public.menu_items;
create policy "Public can read menu items" on public.menu_items for select to anon, authenticated using (true);
drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories" on public.categories for select to anon, authenticated using (true);
drop policy if exists "Public can read daily deals" on public.daily_deals;
create policy "Public can read daily deals" on public.daily_deals for select to anon, authenticated using (true);
drop policy if exists "Customers create orders through checkout" on public.orders;
create policy "Customers create orders through checkout" on public.orders for insert to anon, authenticated with check (true);
drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders" on public.orders for select to authenticated
  using (lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', '')));
drop policy if exists "Administrators read all orders" on public.orders;
create policy "Administrators read all orders" on public.orders for select to authenticated
  using (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin');
drop policy if exists "Customers read own profile" on public.profiles;
create policy "Customers read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Customers update own profile" on public.profiles;
create policy "Customers update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Customers read own customer record" on public.customers;
create policy "Customers read own customer record" on public.customers for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
drop policy if exists "Customers update own customer record" on public.customers;
create policy "Customers update own customer record" on public.customers for update to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
drop policy if exists "Administrators read notifications" on public.admin_notifications;
create policy "Administrators read notifications" on public.admin_notifications for select to authenticated
  using (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin');

grant select on public.menu_items, public.categories, public.daily_deals to anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant select on public.orders to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.admin_notifications to authenticated;
grant select on public.admin_notification_events to anon, authenticated;
drop policy if exists "Public can read safe notification sync signal" on public.admin_notification_events;
create policy "Public can read safe notification sync signal" on public.admin_notification_events for select to anon, authenticated using (true);
grant all on public.store_settings, public.store_settings_public, public.customers, public.orders,
  public.profiles, public.menu_items, public.categories, public.daily_deals, public.admin_notifications,
  public.admin_notification_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public upload payment slips" on storage.objects;
create policy "Public upload payment slips" on storage.objects for insert to anon, authenticated with check (bucket_id = 'payment-slips');
drop policy if exists "Public view payment slips" on storage.objects;
create policy "Public view payment slips" on storage.objects for select to anon, authenticated using (bucket_id = 'payment-slips');
drop policy if exists "Public upload menu images" on storage.objects;
create policy "Public upload menu images" on storage.objects for insert to anon, authenticated with check (bucket_id = 'menu-images');
drop policy if exists "Public view menu images" on storage.objects;
create policy "Public view menu images" on storage.objects for select to anon, authenticated using (bucket_id = 'menu-images');

do $$ declare t text; begin
  foreach t in array array['orders','store_settings_public','profiles','menu_items','daily_deals','categories','customers','admin_notifications','admin_notification_events'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- Ensure PostgREST refreshes its column/table cache after applying this migration.
notify pgrst, 'reload schema';
