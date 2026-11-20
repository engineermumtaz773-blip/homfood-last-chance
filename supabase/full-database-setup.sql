-- Idempotent production schema for the Home Made Food admin and storefront APIs.
-- Run this file in Supabase SQL Editor. Server-side APIs require the service-role
-- key; the public anon key is used only by browser-side Realtime subscriptions.

create extension if not exists pgcrypto;

create table if not exists public.store_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  is_holiday_mode boolean not null default false,
  holiday_message text not null default '',
  is_kitchen_closed boolean not null default false,
  weekly_hours jsonb not null default '{}'::jsonb,
  meal_slots jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.store_settings add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.store_settings add column if not exists is_holiday_mode boolean not null default false;
alter table public.store_settings add column if not exists holiday_message text not null default '';
alter table public.store_settings add column if not exists is_kitchen_closed boolean not null default false;
alter table public.store_settings add column if not exists weekly_hours jsonb not null default '{}'::jsonb;
alter table public.store_settings add column if not exists meal_slots jsonb not null default '[]'::jsonb;
alter table public.store_settings add column if not exists updated_at timestamptz not null default now();
create table if not exists public.store_settings_public (
  id text primary key, updated_at timestamptz not null default now()
);
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

insert into public.store_settings (id, data)
values (
  'singleton',
  '{
    "restaurant":{"name":"Home Made Food","description":"","phone":"","whatsapp":"","email":"","address":"","logoUrl":"","isOpen":true},
    "delivery":{"baseFee":0,"freeDeliveryThreshold":0,"estimatedDeliveryTime":"30-45 minutes","deliveryRadiusKm":20,"minOrderAmount":0,"deliveryAreas":["Bahawalpur"]},
    "payments":{"cashOnDelivery":true,"raastQrUrl":"","raastMerchantName":"MUMTAZ ALI","raastRef":"9955","bankName":"","bankAccountTitle":"","bankIban":"","taxPercentage":0,"paymentInstructions":""},
    "businessHours":{"schedule":{},"mealSlots":[],"holidayMode":false,"holidayMessage":"","slotDurationMinutes":60,"slots":[]},
    "social":{"facebook":"","instagram":"","whatsappBusiness":"","tiktok":"","supportEmail":""},
    "account":{"adminEmails":[],"notificationEmails":[],"sessionTimeoutHours":24,"twoFactorEnabled":false,"pinCode":""}
  }'::jsonb
)
on conflict (id) do nothing;

update public.store_settings set
  is_holiday_mode = case when data #>> '{businessHours,holidayMode}' in ('true','false') then (data #>> '{businessHours,holidayMode}')::boolean else false end,
  holiday_message = coalesce(data #>> '{businessHours,holidayMessage}', ''),
  is_kitchen_closed = case when data #>> '{restaurant,isOpen}' = 'false' then true else false end,
  weekly_hours = coalesce(data #> '{businessHours,schedule}', '{}'::jsonb),
  meal_slots = coalesce(data #> '{businessHours,mealSlots}', '[]'::jsonb)
where id = 'singleton';

create table if not exists public.categories (
  name text primary key,
  created_at timestamptz not null default now()
);

create sequence if not exists public.menu_items_id_seq;

create table if not exists public.menu_items (
  id bigint primary key default nextval('public.menu_items_id_seq'),
  name text not null,
  description text not null default '',
  category text not null default 'Dinner',
  categories jsonb not null default '[]'::jsonb,
  image text not null default '🍲',
  image_url text not null default '',
  portions jsonb not null default '[]'::jsonb,
  serving_size text,
  dietary_tags jsonb not null default '[]'::jsonb,
  rating numeric,
  rating_count integer,
  available boolean not null default true,
  featured boolean not null default false,
  sold_out boolean not null default false,
  daily_stock_limit integer,
  remaining_stock integer,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  allergens text[] not null default array[]::text[],
  addons_json jsonb not null default '[]'::jsonb,
  translations jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.menu_items add column if not exists id bigint;
alter table public.menu_items add column if not exists name text not null default '';
alter table public.menu_items add column if not exists description text not null default '';
alter table public.menu_items add column if not exists category text not null default 'Dinner';
alter table public.menu_items add column if not exists categories jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists image text not null default '🍲';
alter table public.menu_items add column if not exists image_url text not null default '';
alter table public.menu_items add column if not exists portions jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists serving_size text;
alter table public.menu_items add column if not exists dietary_tags jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists available boolean not null default true;
alter table public.menu_items add column if not exists featured boolean not null default false;
alter table public.menu_items add column if not exists sold_out boolean not null default false;
alter table public.menu_items add column if not exists daily_stock_limit integer;
alter table public.menu_items add column if not exists remaining_stock integer;
alter table public.menu_items add column if not exists calories integer;
alter table public.menu_items add column if not exists protein_g numeric;
alter table public.menu_items add column if not exists carbs_g numeric;
alter table public.menu_items add column if not exists fat_g numeric;
alter table public.menu_items add column if not exists allergens text[] not null default array[]::text[];
alter table public.menu_items add column if not exists addons_json jsonb not null default '[]'::jsonb;
alter table public.menu_items add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.menu_items add column if not exists deleted_at timestamptz;
alter table public.menu_items add column if not exists updated_at timestamptz not null default now();

do $$
declare
  id_is_identity boolean;
begin
  select is_identity = 'YES'
    into id_is_identity
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'menu_items'
     and column_name = 'id';

  if id_is_identity then
    update public.menu_items set id = default where id is null;
  else
    perform setval('public.menu_items_id_seq', greatest(coalesce((select max(id) from public.menu_items), 0) + 1, 1), false);
    alter sequence public.menu_items_id_seq owned by public.menu_items.id;
    alter table public.menu_items alter column id set default nextval('public.menu_items_id_seq');
    update public.menu_items set id = nextval('public.menu_items_id_seq') where id is null;
  end if;
end;
$$;
alter table public.menu_items alter column id set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.menu_items'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) in ('PRIMARY KEY (id)', 'UNIQUE (id)')
  ) then
    alter table public.menu_items add constraint menu_items_id_key unique (id);
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_menu_items on public.menu_items;
create trigger set_updated_at_menu_items
before update on public.menu_items
for each row execute function public.set_updated_at();

create or replace function public.initialize_homefood_menu_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.daily_stock_limit is null then
    new.remaining_stock := null;
  elsif tg_op = 'INSERT' then
    new.remaining_stock := new.daily_stock_limit;
  elsif new.daily_stock_limit is distinct from old.daily_stock_limit
     or new.remaining_stock is null then
    new.remaining_stock := new.daily_stock_limit;
  end if;

  if new.remaining_stock = 0 then
    new.sold_out := true;
    new.available := false;
  elsif tg_op = 'UPDATE' and old.sold_out then
    new.sold_out := false;
    new.available := true;
  end if;

  return new;
end;
$$;

drop trigger if exists menu_items_initialize_homefood_stock on public.menu_items;
create trigger menu_items_initialize_homefood_stock
before insert or update of daily_stock_limit, remaining_stock on public.menu_items
for each row execute function public.initialize_homefood_menu_stock();

create table if not exists public.daily_deals (
  id bigint primary key,
  title text not null,
  description text not null default '',
  regular_price numeric not null default 0,
  discounted_price numeric not null default 0,
  image_url text not null default '',
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text not null default '',
  avatar_url text not null default '',
  auth_provider text not null default 'email',
  email_verified boolean not null default false,
  addresses jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.customers add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists updated_at timestamptz not null default now();
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique, full_name text not null default 'Customer', phone text not null default '',
  avatar_url text not null default '', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.meal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  customer_id text references public.customers(id) on delete set null,
  plan_type text not null check (plan_type in ('weekly', 'monthly')),
  days_of_week text[] not null default array[]::text[],
  meal_slot text not null check (meal_slot in ('lunch', 'dinner')),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'cancelled', 'completed')),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  customer_id text references public.customers(id) on delete set null,
  guest_name text not null,
  phone text not null,
  party_size integer not null default 1 check (party_size between 1 and 30),
  slot_time timestamptz not null,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reservations_slot_status_idx on public.reservations(slot_time, status);
create index if not exists reservations_customer_idx on public.reservations(customer_id, slot_time desc);
create index if not exists meal_subscriptions_customer_status_idx on public.meal_subscriptions(customer_id, status);
drop trigger if exists set_updated_at_meal_subscriptions on public.meal_subscriptions;
create trigger set_updated_at_meal_subscriptions
before update on public.meal_subscriptions
for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at_reservations on public.reservations;
create trigger set_updated_at_reservations
before update on public.reservations
for each row execute function public.set_updated_at();
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

create table if not exists public.orders (
  id text primary key,
  number text not null unique,
  customer_name text not null,
  customer_email text,
  customer_phone text not null default '',
  area text not null default 'Bahawalpur',
  address text not null default '',
  notes text,
  payment_method text not null default 'Cash on Delivery',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  delivery_fee numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  rider_name text,
  rider_phone text,
  estimated_delivery text,
  payment_status text not null default 'pending',
  payment_slip_url text,
  payment_slip_name text,
  admin_notes text,
  admin_media_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_name text not null default 'Customer';
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text not null default '';
alter table public.orders add column if not exists area text not null default 'Bahawalpur';
alter table public.orders add column if not exists address text not null default '';
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists rider_name text;
alter table public.orders add column if not exists rider_phone text;
alter table public.orders add column if not exists estimated_delivery text;
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists subtotal numeric not null default 0;
alter table public.orders add column if not exists discount numeric not null default 0;
alter table public.orders add column if not exists delivery_fee numeric not null default 0;
alter table public.orders add column if not exists total numeric not null default 0;
alter table public.orders add column if not exists payment_method text not null default 'Cash on Delivery';
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists payment_slip_url text;
alter table public.orders add column if not exists payment_slip_name text;
alter table public.orders add column if not exists admin_notes text;
alter table public.orders add column if not exists admin_media_url text;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists customer_id text references public.customers(id) on delete set null;
alter table public.orders add column if not exists customer_note text;
alter table public.orders add column if not exists admin_note text;
alter table public.orders add column if not exists admin_video_url text;
alter table public.orders add column if not exists cancellation_reason text;
alter table public.orders add column if not exists stock_decremented boolean not null default false;
alter table public.orders add column if not exists deleted_at timestamptz;
alter table public.orders add column if not exists total_amount numeric not null default 0;
alter table public.orders add column if not exists discount_amount numeric not null default 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  dish_id bigint,
  name text not null,
  portion text not null default 'Regular',
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_number text not null references public.orders(number) on update cascade on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists order_messages_order_created_idx on public.order_messages(order_number, created_at);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  status text not null default 'verification_pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(), type text not null, title text not null,
  body text not null default '', order_number text references public.orders(number) on update cascade on delete cascade,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  read boolean not null default false, created_at timestamptz not null default now()
);
create or replace function public.cancel_homefood_order(
  p_order_number text,
  p_phone text,
  p_reason text
)
returns table(result text, order_data jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_order public.orders%rowtype;
  item record;
  normalized_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  reason_text text := left(coalesce(nullif(btrim(p_reason), ''), 'Customer requested cancellation'), 500);
begin
  select * into current_order
    from public.orders
   where upper(btrim(number)) = upper(btrim(p_order_number))
     and deleted_at is null
   for update;

  if not found then
    return query select 'not_found'::text, null::jsonb;
    return;
  end if;

  if length(normalized_phone) < 10
     or right(regexp_replace(coalesce(current_order.customer_phone, ''), '\D', '', 'g'), 10) <> normalized_phone then
    return query select 'not_found'::text, null::jsonb;
    return;
  end if;

  if current_order.status not in ('pending', 'new', 'confirmed') then
    return query select 'locked'::text, to_jsonb(current_order);
    return;
  end if;

  if current_order.created_at <= now() - interval '5 minutes' then
    return query select 'expired'::text, to_jsonb(current_order);
    return;
  end if;

  update public.orders
     set status = 'cancelled',
         cancellation_reason = reason_text,
         notes = concat_ws(E'\n', nullif(notes, ''), 'Cancellation reason: ' || reason_text),
         updated_at = now()
   where id = current_order.id
   returning * into current_order;

  if current_order.stock_decremented then
    for item in
      select
        (entry.value ->> 'id')::bigint as menu_item_id,
        sum(
          case
            when entry.value ->> 'quantity' ~ '^[0-9]+$'
              then greatest((entry.value ->> 'quantity')::integer, 1)
            else 1
          end
        )::integer as quantity
      from jsonb_array_elements(coalesce(current_order.items, '[]'::jsonb)) as entry(value)
      where entry.value ->> 'id' ~ '^[0-9]+$'
      group by (entry.value ->> 'id')::bigint
    loop
      update public.menu_items
         set remaining_stock = case
               when daily_stock_limit is null then remaining_stock + item.quantity
               else least(daily_stock_limit, remaining_stock + item.quantity)
             end,
             sold_out = false,
             available = case when sold_out then true else available end
       where id = item.menu_item_id
         and remaining_stock is not null;
    end loop;

    update public.orders
       set stock_decremented = false,
           updated_at = now()
     where id = current_order.id
     returning * into current_order;
  end if;

  insert into public.admin_notifications (type, title, body, order_number, priority)
  values ('order_cancelled', 'Order ' || current_order.number || ' cancelled', reason_text, current_order.number, 'high');

  return query select 'cancelled'::text, to_jsonb(current_order);
end;
$$;
revoke all on function public.cancel_homefood_order(text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_homefood_order(text, text, text) to service_role;
create index if not exists admin_notifications_unread_created_idx on public.admin_notifications(read, created_at desc);
do $$ begin
  if to_regclass('public.notifications') is not null then
    execute 'insert into public.admin_notifications (id,type,title,body,order_number,priority,read,created_at)
      select id,type,title,body,order_number,priority,read,created_at from public.notifications on conflict (id) do nothing';
  end if;
end $$;
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

create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, data)
select id, data from public.settings
where id = 'singleton'
on conflict (id) do nothing;

-- Public catalog tables are readable through explicit RLS policies.
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.daily_deals enable row level security;
drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories for select to anon, authenticated using (true);
drop policy if exists "Public read menu items" on public.menu_items;
create policy "Public read menu items" on public.menu_items for select to anon, authenticated using (true);
drop policy if exists "Public read daily deals" on public.daily_deals;
create policy "Public read daily deals" on public.daily_deals for select to anon, authenticated using (true);

-- Private records are only accessed through authenticated server APIs using
-- the service-role key. Do not grant direct browser access to these tables.
alter table public.store_settings enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_events enable row level security;
alter table public.store_settings_public enable row level security;
alter table public.meal_subscriptions enable row level security;
alter table public.reservations enable row level security;
alter table public.order_messages enable row level security;
alter table public.support_messages enable row level security;

revoke all privileges on public.store_settings, public.customers, public.orders,
  public.order_items, public.payment_proofs, public.settings from anon, authenticated;
revoke all privileges on public.profiles, public.admin_notifications, public.store_settings_public, public.admin_notification_events from anon, authenticated;
revoke all privileges on public.meal_subscriptions, public.reservations, public.order_messages, public.support_messages from anon, authenticated;
drop policy if exists "Public can read safe store settings signal" on public.store_settings_public;
create policy "Public can read safe store settings signal" on public.store_settings_public for select to anon, authenticated using (true);
drop policy if exists "Customers read own profile" on public.profiles;
create policy "Customers read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Customers update own profile" on public.profiles;
create policy "Customers update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders" on public.orders for select to authenticated using (lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', '')));
drop policy if exists "Administrators read all orders" on public.orders;
create policy "Administrators read all orders" on public.orders for select to authenticated using (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin');
drop policy if exists "Customers create orders through checkout" on public.orders;
create policy "Customers create orders through checkout" on public.orders for insert to anon, authenticated with check (true);
drop policy if exists "Customers read own order messages" on public.order_messages;
create policy "Customers read own order messages" on public.order_messages for select to authenticated using (
  exists (
    select 1 from public.orders
    where orders.number = order_messages.order_number
      and nullif(auth.jwt()->>'email', '') is not null
      and lower(coalesce(orders.customer_email, '')) = lower(auth.jwt()->>'email')
  )
  or coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
);
drop policy if exists "Administrators read notifications" on public.admin_notifications;
create policy "Administrators read notifications" on public.admin_notifications for select to authenticated using (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin');
drop policy if exists "Public can read safe notification sync signal" on public.admin_notification_events;
create policy "Public can read safe notification sync signal" on public.admin_notification_events for select to anon, authenticated using (true);
grant select on public.categories, public.menu_items, public.daily_deals to anon, authenticated;
grant select on public.store_settings_public to anon, authenticated;
grant select on public.admin_notification_events to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant insert on public.orders to anon, authenticated;
grant select on public.orders, public.admin_notifications to authenticated;
grant select on public.order_messages to authenticated;
grant all privileges on public.store_settings, public.categories, public.menu_items,
  public.daily_deals, public.customers, public.orders, public.order_items,
  public.payment_proofs, public.settings, public.profiles, public.admin_notifications,
  public.store_settings_public, public.admin_notification_events, public.meal_subscriptions,
  public.reservations, public.order_messages, public.support_messages to service_role;

do $$ begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.menu_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.daily_deals; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.customers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.payment_proofs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.admin_notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.admin_notification_events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.store_settings_public; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.meal_subscriptions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.reservations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.order_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.support_messages; exception when duplicate_object then null; end $$;

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

notify pgrst, 'reload schema';
