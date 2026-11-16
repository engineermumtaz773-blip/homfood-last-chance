-- Enterprise 48-feature upgrade for Home Made Food
-- Idempotent Supabase migration for core commerce, operational and support workflows.

create extension if not exists pgcrypto;

create sequence if not exists public.orders_order_number_seq start with 1 increment by 1;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists deleted_at timestamptz;
alter table public.orders add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.menu_items add column if not exists deleted_at timestamptz;
alter table public.menu_items add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.menu_items add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.menu_items add column if not exists daily_stock_limit integer;
alter table public.menu_items add column if not exists remaining_stock integer;
alter table public.menu_items add column if not exists calories integer;
alter table public.menu_items add column if not exists protein_g numeric;
alter table public.menu_items add column if not exists carbs_g numeric;
alter table public.menu_items add column if not exists fat_g numeric;
alter table public.menu_items add column if not exists allergens text[] not null default '{}';
alter table public.menu_items add column if not exists addons_json jsonb not null default '{}'::jsonb;

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists customer_tags text[] not null default '{}';
alter table public.profiles add column if not exists loyalty_points integer not null default 0;
alter table public.profiles add column if not exists referral_code text;

alter table public.coupons add column if not exists deleted_at timestamptz;
alter table public.coupons add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.coupons add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.delivery_zones add column if not exists deleted_at timestamptz;
alter table public.delivery_zones add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.delivery_zones add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.generate_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_number is null or trim(new.order_number) = '' then
    new.order_number := format('HMF-%s-%05s', to_char(current_date, 'YYYY'), nextval('public.orders_order_number_seq'));
  end if;

  if new.number is null or trim(new.number) = '' then
    new.number := new.order_number;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_generate_order_number on public.orders;
create trigger trg_orders_generate_order_number
before insert or update of order_number, number
on public.orders
for each row
execute function public.generate_order_number();

update public.orders
set order_number = coalesce(order_number, format('HMF-%s-%05s', to_char(created_at, 'YYYY'), row_number() over (order by created_at, id)))
where order_number is null
and created_at is not null;

update public.orders
set number = coalesce(number, order_number)
where number is null;

create unique index if not exists idx_orders_order_number_unique on public.orders (order_number) where order_number is not null;

create or replace function public.apply_order_stock_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  dish_id bigint;
  qty integer;
  current_stock integer;
  next_stock integer;
begin
  if tg_op = 'insert' and new.status in ('confirmed', 'paid', 'preparing', 'out_for_delivery', 'delivered')
     or tg_op = 'update' and old.status is distinct from new.status and new.status in ('confirmed', 'paid', 'preparing', 'out_for_delivery', 'delivered') then

    for item in select jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      dish_id := nullif(item->>'dish_id', '')::bigint;
      qty := coalesce((item->>'quantity')::integer, 1);

      if dish_id is not null and qty > 0 then
        select coalesce(remaining_stock, 0)
          into current_stock
          from public.menu_items
          where id = dish_id
          for update;

        if current_stock is not null then
          next_stock := greatest(current_stock - qty, 0);
          update public.menu_items
          set remaining_stock = next_stock,
              sold_out = (next_stock <= 0),
              updated_at = now()
          where id = dish_id;
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_apply_stock_updates on public.orders;
create trigger trg_orders_apply_stock_updates
after insert or update of status
on public.orders
for each row
when (new.status in ('confirmed', 'paid', 'preparing', 'out_for_delivery', 'delivered'))
execute function public.apply_order_stock_updates();

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  zone_name text not null unique,
  delivery_fee numeric not null default 0,
  min_order_amount numeric not null default 0,
  estimated_minutes integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.delivery_zones (zone_name, delivery_fee, min_order_amount, estimated_minutes, is_active)
values
  ('University Chowk', 120, 799, 25, true),
  ('Satellite Town', 150, 999, 35, true),
  ('Baghdad-ul-Jadeed Campus', 180, 1199, 40, true),
  ('Model Town', 170, 1099, 32, true),
  ('Dubai Chowk', 140, 899, 30, true),
  ('One Unit Chowk', 160, 999, 28, true)
on conflict (zone_name) do nothing;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric not null default 0,
  min_order_value numeric not null default 0,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  menu_item_id bigint,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan_type text not null check (plan_type in ('weekly', 'monthly')),
  days_of_week text[] not null default '{}'::text[],
  meal_slot text not null check (meal_slot in ('lunch', 'dinner')),
  status text not null default 'active',
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_name text not null,
  phone text not null,
  party_size integer not null default 1,
  slot_time timestamptz not null,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  vehicle_number text,
  is_available boolean not null default true,
  active_orders_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists rider_id uuid references public.riders(id) on delete set null;
alter table public.orders add column if not exists delivery_zone_id uuid references public.delivery_zones(id) on delete set null;
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric not null default 0;
alter table public.orders add column if not exists points_redeemed integer not null default 0;
alter table public.orders add column if not exists estimated_delivery_at timestamptz;
alter table public.orders add column if not exists scheduled_for timestamptz;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  key text primary key,
  hits integer not null default 1,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.monthly_revenue_summary()
returns table (
  month_key date,
  total_revenue numeric,
  order_count bigint,
  avg_order_value numeric
)
language sql
stable
as $$
  select
    date_trunc('month', created_at)::date as month_key,
    coalesce(round(sum(total), 2), 0) as total_revenue,
    count(*)::bigint as order_count,
    coalesce(round(avg(total), 2), 0) as avg_order_value
  from public.orders
  where deleted_at is null
  group by date_trunc('month', created_at)::date
  order by month_key desc;
$$;

create or replace function public.is_service_role_or_admin()
returns boolean
language sql
stable
as $$
  select
    current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.metadata->>'is_admin', p.metadata->>'admin', 'false') = 'true'
    );
$$;

create or replace function public.is_user_session_owner(user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = user_id;
$$;

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_user_id on public.orders (user_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_order_number on public.orders (order_number);
create index if not exists idx_profiles_phone on public.profiles (phone);
create unique index if not exists idx_profiles_referral_code_unique on public.profiles (referral_code) where referral_code is not null;
create unique index if not exists idx_coupons_code_upper_unique on public.coupons ((upper(code)));
create index if not exists idx_menu_items_remaining_stock on public.menu_items (remaining_stock);
create index if not exists idx_reviews_order_id on public.reviews (order_id);
create index if not exists idx_support_messages_user_id on public.support_messages (user_id, created_at desc);
create index if not exists idx_support_messages_session_id on public.support_messages (session_id, created_at desc);
create index if not exists idx_admin_audit_logs_entity on public.admin_audit_logs (entity_type, entity_id, created_at desc);
create index if not exists idx_webhook_logs_provider on public.webhook_logs (provider, created_at desc);

alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.coupons enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.reviews enable row level security;
alter table public.meal_subscriptions enable row level security;
alter table public.reservations enable row level security;
alter table public.support_messages enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.riders enable row level security;

create policy if not exists "Profiles can view own records"
on public.profiles
for select to authenticated
using (auth.uid() = id or public.is_service_role_or_admin());

create policy if not exists "Profiles can update own records"
on public.profiles
for update to authenticated
using (auth.uid() = id or public.is_service_role_or_admin())
with check (auth.uid() = id or public.is_service_role_or_admin());

create policy if not exists "Profiles can insert own records"
on public.profiles
for insert to authenticated
with check (auth.uid() = id or public.is_service_role_or_admin());

create policy if not exists "Menu items are readable by all authenticated users"
on public.menu_items
for select to authenticated, anon
using (true);

create policy if not exists "Service role/admin manage menu items"
on public.menu_items
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Users view own orders"
on public.orders
for select to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users manage own orders"
on public.orders
for insert to authenticated
with check (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users update own orders"
on public.orders
for update to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin())
with check (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Delivery zones are readable by all authenticated users"
on public.delivery_zones
for select to authenticated, anon
using (is_active = true or public.is_service_role_or_admin());

create policy if not exists "Admin can manage delivery zones"
on public.delivery_zones
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Users view own coupons"
on public.coupons
for select to authenticated
using (true or public.is_service_role_or_admin());

create policy if not exists "Admins manage coupons"
on public.coupons
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Users view own reviews"
on public.reviews
for select to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users can write reviews"
on public.reviews
for insert to authenticated
with check (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users manage own subscriptions"
on public.meal_subscriptions
for all to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin())
with check (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users manage own reservations"
on public.reservations
for all to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin())
with check (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users view own support messages"
on public.support_messages
for select to authenticated
using (auth.uid() = user_id or public.is_service_role_or_admin());

create policy if not exists "Users can insert support messages"
on public.support_messages
for insert to authenticated
with check ((auth.uid() = user_id and sender_role = 'customer') or public.is_service_role_or_admin());

create policy if not exists "Admins update support messages"
on public.support_messages
for update to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Admins view audit logs"
on public.admin_audit_logs
for select to authenticated
using (public.is_service_role_or_admin());

create policy if not exists "Admins write audit logs"
on public.admin_audit_logs
for insert to authenticated
with check (public.is_service_role_or_admin());

create policy if not exists "Only admin can read rate limits"
on public.api_rate_limits
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Admins manage webhook logs"
on public.webhook_logs
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Admins manage riders"
on public.riders
for all to authenticated
using (public.is_service_role_or_admin())
with check (public.is_service_role_or_admin());

create policy if not exists "Users view riders when available"
on public.riders
for select to authenticated, anon
using (is_available = true or public.is_service_role_or_admin());

create or replace trigger set_public_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace trigger set_public_menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

create or replace trigger set_public_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger set_public_coupons_updated_at
before update on public.coupons
for each row execute function public.set_updated_at();

create or replace trigger set_public_delivery_zones_updated_at
before update on public.delivery_zones
for each row execute function public.set_updated_at();

create or replace trigger set_public_meal_subscriptions_updated_at
before update on public.meal_subscriptions
for each row execute function public.set_updated_at();

create or replace trigger set_public_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace trigger set_public_riders_updated_at
before update on public.riders
for each row execute function public.set_updated_at();

create or replace trigger set_public_support_messages_updated_at
before update on public.support_messages
for each row execute function public.set_updated_at();

create or replace trigger set_public_admin_audit_logs_updated_at
before update on public.admin_audit_logs
for each row execute function public.set_updated_at();

create or replace trigger set_public_webhook_logs_updated_at
before update on public.webhook_logs
for each row execute function public.set_updated_at();

create table if not exists public.storefront_announcement (
  id text primary key default 'singleton',
  message text not null default '',
  updated_at timestamptz not null default now()
);

create or replace trigger set_public_storefront_announcement_updated_at
before update on public.storefront_announcement
for each row execute function public.set_updated_at();

create or replace function public.notify_admin_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'update' and old.status is distinct from new.status then
    insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details_json)
    values (
      auth.uid(),
      'order_status_update',
      'orders',
      new.id,
      jsonb_build_object('from_status', old.status, 'to_status', new.status, 'order_number', new.order_number, 'updated_at', now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_order_lifecycle on public.orders;
create trigger trg_notify_admin_order_lifecycle
after update of status
on public.orders
for each row
execute function public.notify_admin_order_lifecycle();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table if not exists public.support_messages;
  end if;
end $$;
