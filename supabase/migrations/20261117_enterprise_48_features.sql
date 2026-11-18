-- Enterprise feature schema additions for the existing Home Made Food schema.
-- Apply after 20261113_ultimate_master_fix.sql and 20261113_phone_verification.sql.
-- The existing public.orders.number, public.orders.total, public.menu_items.id,
-- and store_settings(id = 'singleton', data) contracts are intentionally retained.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep the existing timestamp/audit conventions compatible.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Existing customers are text-keyed because email and phone sign-ins share this table.
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Customer',
  email TEXT UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  auth_provider TEXT NOT NULL DEFAULT 'email',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Customer',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS favorite_dish_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.customers ALTER COLUMN email DROP NOT NULL;
CREATE INDEX IF NOT EXISTS customers_auth_user_id_idx ON public.customers (auth_user_id);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers (phone);

INSERT INTO public.customers (id, auth_user_id, name, email, phone, avatar_url, auth_provider, email_verified, created_at, updated_at)
SELECT
  profiles.id::TEXT,
  profiles.id,
  COALESCE(NULLIF(profiles.full_name, ''), 'Customer'),
  profiles.email,
  COALESCE(profiles.phone, ''),
  COALESCE(profiles.avatar_url, ''),
  'email',
  FALSE,
  profiles.created_at,
  COALESCE(profiles.updated_at, NOW())
FROM public.profiles AS profiles
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customers AS customers
  WHERE customers.id = profiles.id::TEXT
     OR (profiles.email IS NOT NULL AND LOWER(customers.email) = LOWER(profiles.email))
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_homefood_customer_from_profile()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE customers.email IS NOT NULL
      AND LOWER(customers.email) = LOWER(COALESCE(NEW.email, ''))
      AND customers.id <> NEW.id::TEXT
  ) THEN
    INSERT INTO public.customers (id, auth_user_id, name, email, phone, avatar_url, auth_provider)
    VALUES (
      NEW.id::TEXT,
      NEW.id,
      COALESCE(NULLIF(NEW.full_name, ''), 'Customer'),
      NEW.email,
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.avatar_url, ''),
      'email'
    )
    ON CONFLICT (id) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_homefood_profile_customer_sync ON public.profiles;
CREATE TRIGGER on_homefood_profile_customer_sync
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_homefood_customer_from_profile();

-- Profile extensions support CRM and loyalty without changing existing identity fields.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_dish_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_idx
  ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_phone_idx ON public.profiles (phone);

-- Inventory and nutrition fields extend the existing bigint-keyed menu_items table.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS daily_stock_limit INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_stock INTEGER,
  ADD COLUMN IF NOT EXISTS calories INTEGER,
  ADD COLUMN IF NOT EXISTS protein_g NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g NUMERIC,
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS addons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND conname = 'menu_items_daily_stock_limit_nonnegative'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_daily_stock_limit_nonnegative
      CHECK (daily_stock_limit IS NULL OR daily_stock_limit >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND conname = 'menu_items_remaining_stock_nonnegative'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_remaining_stock_nonnegative
      CHECK (remaining_stock IS NULL OR remaining_stock >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND conname = 'menu_items_calories_nonnegative'
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_calories_nonnegative
      CHECK (calories IS NULL OR calories >= 0);
  END IF;
END;
$$;

-- Delivery zones are intentionally independent of store_settings JSON.
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name TEXT NOT NULL UNIQUE,
  delivery_fee NUMERIC NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  min_order_amount NUMERIC NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  estimated_minutes INTEGER NOT NULL DEFAULT 45 CHECK (estimated_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.delivery_zones (zone_name, delivery_fee, min_order_amount, estimated_minutes)
VALUES
  ('University Chowk', 150, 300, 35),
  ('Satellite Town', 150, 300, 40),
  ('Baghdad-ul-Jadeed Campus', 200, 300, 45),
  ('Model Town', 150, 300, 35),
  ('Dubai Chowk', 175, 300, 40),
  ('One Unit Chowk', 150, 300, 40)
ON CONFLICT (zone_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS delivery_zones_active_idx
  ON public.delivery_zones (is_active, zone_name) WHERE deleted_at IS NULL;

-- Coupon codes are validated and consumed by server routes, never by browser writes.
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code = UPPER(BTRIM(code))),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  min_order_value NUMERIC NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses >= 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coupons_active_expiry_idx
  ON public.coupons (is_active, expires_at) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code TEXT)
RETURNS TABLE (redeemed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.coupons
  SET used_count = used_count + 1,
      updated_at = NOW()
  WHERE code = UPPER(BTRIM(p_code))
    AND is_active = TRUE
    AND deleted_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR used_count < max_uses)
  RETURNING TRUE;
END;
$$;

-- Riders are created before orders so the optional foreign key can be added safely.
CREATE TABLE IF NOT EXISTS public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  vehicle_number TEXT NOT NULL DEFAULT '',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  active_orders_count INTEGER NOT NULL DEFAULT 0 CHECK (active_orders_count >= 0),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS riders_available_idx
  ON public.riders (is_available, active_orders_count) WHERE deleted_at IS NULL;

-- Preserve existing order fields and add operational metadata.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES public.riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.orders
SET number = 'HMF-' || TO_CHAR(COALESCE(created_at, NOW()), 'YYYY') || '-' || LPAD(id, 4, '0')
WHERE NULLIF(BTRIM(number), '') IS NULL;

UPDATE public.orders
SET order_number = number,
    discount_amount = CASE
      WHEN discount_amount = 0 THEN COALESCE(discount, 0)
      ELSE discount_amount
    END
WHERE order_number IS DISTINCT FROM number
   OR (discount_amount = 0 AND COALESCE(discount, 0) <> 0);

ALTER TABLE public.orders ALTER COLUMN number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_number_unique_idx ON public.orders (number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique_idx ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_zone_idx ON public.orders (delivery_zone_id);
CREATE INDEX IF NOT EXISTS orders_rider_idx ON public.orders (rider_id);
CREATE INDEX IF NOT EXISTS orders_scheduled_for_idx ON public.orders (scheduled_for)
  WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_live_idx ON public.orders (status, created_at DESC)
  WHERE deleted_at IS NULL;

UPDATE public.orders
SET stock_decremented = TRUE
WHERE payment_status = 'paid'
   OR status IN ('preparing', 'out_for_delivery', 'delivered');

-- Existing numbers remain unchanged. Inserts without a number get a readable sequence value.
CREATE SEQUENCE IF NOT EXISTS public.order_number_sequence START WITH 1;

DO $$
DECLARE
  sequence_last_value BIGINT;
  sequence_is_called BOOLEAN;
  existing_max BIGINT;
BEGIN
  SELECT last_value, is_called
    INTO sequence_last_value, sequence_is_called
    FROM public.order_number_sequence;

  SELECT MAX(SUBSTRING(number FROM '^HMF-[0-9]{4}-([0-9]+)$')::BIGINT)
    INTO existing_max
    FROM public.orders;

  IF existing_max IS NOT NULL
     AND (NOT sequence_is_called OR existing_max > sequence_last_value) THEN
    PERFORM SETVAL('public.order_number_sequence', existing_max, TRUE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_homefood_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NULLIF(BTRIM(NEW.number), '') IS NULL THEN
    NEW.number := FORMAT(
      'HMF-%s-%s',
      TO_CHAR(CURRENT_DATE, 'YYYY'),
      LPAD(NEXTVAL('public.order_number_sequence')::TEXT, 4, '0')
    );
  END IF;

  NEW.order_number := NEW.number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_homefood_order_number ON public.orders;
CREATE TRIGGER orders_assign_homefood_order_number
  BEFORE INSERT OR UPDATE OF number ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_homefood_order_number();

CREATE OR REPLACE FUNCTION public.decrement_homefood_menu_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stock_item RECORD;
  current_stock INTEGER;
BEGIN
  IF NEW.stock_decremented
     OR NEW.status = 'cancelled'
     OR NOT (
       NEW.payment_status = 'paid'
       OR NEW.status IN ('preparing', 'out_for_delivery', 'delivered')
     ) THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(COALESCE(NEW.items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Order items must be a JSON array before stock can be reserved.';
  END IF;

  FOR stock_item IN
    SELECT
      (item.value ->> 'id')::BIGINT AS menu_item_id,
      SUM(
        CASE
          WHEN item.value ->> 'quantity' ~ '^[0-9]+$'
            THEN GREATEST((item.value ->> 'quantity')::INTEGER, 1)
          ELSE 1
        END
      )::INTEGER AS quantity
    FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item(value)
    WHERE item.value ->> 'id' ~ '^[0-9]+$'
    GROUP BY (item.value ->> 'id')::BIGINT
  LOOP
    UPDATE public.menu_items
       SET remaining_stock = remaining_stock - stock_item.quantity,
           sold_out = remaining_stock - stock_item.quantity <= 0,
           available = CASE
             WHEN remaining_stock - stock_item.quantity <= 0 THEN FALSE
             ELSE available
           END
     WHERE id = stock_item.menu_item_id
       AND remaining_stock IS NOT NULL
       AND remaining_stock >= stock_item.quantity;

    IF NOT FOUND THEN
      SELECT remaining_stock
        INTO current_stock
        FROM public.menu_items
       WHERE id = stock_item.menu_item_id;

      IF FOUND AND current_stock IS NOT NULL THEN
        RAISE EXCEPTION 'Insufficient stock for menu item %.', stock_item.menu_item_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  NEW.stock_decremented := TRUE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_decrement_homefood_stock ON public.orders;
CREATE TRIGGER orders_decrement_homefood_stock
  BEFORE INSERT OR UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.decrement_homefood_menu_stock();

CREATE OR REPLACE FUNCTION public.initialize_homefood_menu_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.daily_stock_limit IS NULL THEN
    NEW.remaining_stock := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.remaining_stock := NEW.daily_stock_limit;
  ELSIF NEW.daily_stock_limit IS DISTINCT FROM OLD.daily_stock_limit
     OR NEW.remaining_stock IS NULL THEN
    NEW.remaining_stock := NEW.daily_stock_limit;
  END IF;

  IF NEW.remaining_stock = 0 THEN
    NEW.sold_out := TRUE;
    NEW.available := FALSE;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.sold_out THEN
      NEW.sold_out := FALSE;
      NEW.available := TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_items_initialize_homefood_stock ON public.menu_items;
CREATE TRIGGER menu_items_initialize_homefood_stock
  BEFORE INSERT OR UPDATE OF daily_stock_limit, remaining_stock ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.initialize_homefood_menu_stock();

-- A review is tied to a real order and menu item; only approved reviews are public.
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, user_id, menu_item_id)
);

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_public_recent_idx
  ON public.reviews (created_at DESC) WHERE is_approved = TRUE;
CREATE INDEX IF NOT EXISTS reviews_user_recent_idx
  ON public.reviews (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_guest_order_unique_idx
  ON public.reviews (order_id, menu_item_id) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.meal_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('weekly', 'monthly')),
  days_of_week TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('lunch', 'dinner')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'cancelled', 'completed')),
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

ALTER TABLE public.meal_subscriptions
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.meal_subscriptions ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS meal_subscriptions_user_status_idx
  ON public.meal_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS meal_subscriptions_customer_status_idx
  ON public.meal_subscriptions (customer_id, status);

CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 30),
  slot_time TIMESTAMPTZ NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservations_slot_status_idx
  ON public.reservations (slot_time, status);
CREATE INDEX IF NOT EXISTS reservations_user_idx ON public.reservations (user_id);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  message TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 2000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_session_created_idx
  ON public.support_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_unread_idx
  ON public.support_messages (is_read, created_at DESC) WHERE is_read = FALSE;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON public.admin_audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx
  ON public.admin_audit_logs (admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx
  ON public.api_rate_limits (window_start);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_logs_provider_created_idx
  ON public.webhook_logs (provider, created_at DESC);

-- Fast monthly revenue aggregation for server-side admin analytics.
CREATE OR REPLACE FUNCTION public.monthly_revenue_summary()
RETURNS TABLE (month_start DATE, revenue NUMERIC, order_count BIGINT)
LANGUAGE SQL
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    DATE_TRUNC('month', orders.created_at)::DATE AS month_start,
    COALESCE(SUM(orders.total), 0)::NUMERIC AS revenue,
    COUNT(*)::BIGINT AS order_count
  FROM public.orders AS orders
  WHERE orders.deleted_at IS NULL
    AND orders.status <> 'cancelled'
  GROUP BY DATE_TRUNC('month', orders.created_at)::DATE
  ORDER BY month_start DESC;
$$;

REVOKE ALL ON FUNCTION public.monthly_revenue_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_revenue_summary() TO service_role;
REVOKE ALL ON SEQUENCE public.order_number_sequence FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_sequence TO service_role;
REVOKE ALL ON FUNCTION public.redeem_coupon(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(TEXT) TO service_role;

-- Timestamp maintenance for tables with an updated_at field.
DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_menu_items ON public.menu_items;
CREATE TRIGGER set_updated_at_menu_items
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_customers ON public.customers;
CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_delivery_zones ON public.delivery_zones;
CREATE TRIGGER set_updated_at_delivery_zones
  BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_coupons ON public.coupons;
CREATE TRIGGER set_updated_at_coupons
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_riders ON public.riders;
CREATE TRIGGER set_updated_at_riders
  BEFORE UPDATE ON public.riders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_meal_subscriptions ON public.meal_subscriptions;
CREATE TRIGGER set_updated_at_meal_subscriptions
  BEFORE UPDATE ON public.meal_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_reservations ON public.reservations;
CREATE TRIGGER set_updated_at_reservations
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Strict server-mediated access. Public clients only receive explicitly public data.
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Ensure these app-compatible flags exist before the policies reference them.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.daily_deals
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Remove policies created by the earlier core schema migration before replacing them.
DROP POLICY IF EXISTS "Public can read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Public read store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "Allow all store_settings" ON public.store_settings;
REVOKE ALL ON public.store_settings FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
DROP POLICY IF EXISTS "Allow all categories" ON public.categories;
CREATE POLICY "Public read active categories" ON public.categories
  FOR SELECT TO anon, authenticated USING (is_active = TRUE);
GRANT SELECT ON public.categories TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Public read menu_items" ON public.menu_items;
DROP POLICY IF EXISTS "Public read menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Allow all menu_items" ON public.menu_items;
CREATE POLICY "Public read menu items" ON public.menu_items
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
GRANT SELECT ON public.menu_items TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read daily deals" ON public.daily_deals;
DROP POLICY IF EXISTS "Public read daily_deals" ON public.daily_deals;
DROP POLICY IF EXISTS "Public read active daily deals" ON public.daily_deals;
DROP POLICY IF EXISTS "Allow all daily_deals" ON public.daily_deals;
CREATE POLICY "Public read active daily deals" ON public.daily_deals
  FOR SELECT TO anon, authenticated
  USING (
    available = TRUE
    AND is_active = TRUE
    AND deleted_at IS NULL
    AND (valid_until IS NULL OR valid_until > NOW())
  );
GRANT SELECT ON public.daily_deals TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.categories, public.menu_items,
  public.daily_deals, public.delivery_zones FROM anon, authenticated;

DROP POLICY IF EXISTS "Customers read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Own profile select" ON public.profiles;
DROP POLICY IF EXISTS "Customers update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;
DROP POLICY IF EXISTS "Allow all profiles" ON public.profiles;
CREATE POLICY "Customers read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() AND deleted_at IS NULL);
GRANT SELECT ON public.profiles TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "Customers read own customer record" ON public.customers;
DROP POLICY IF EXISTS "Customers update own customer record" ON public.customers;
DROP POLICY IF EXISTS "Allow all customers" ON public.customers;
CREATE POLICY "Customers read own customer record" ON public.customers
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR LOWER(COALESCE(email, '')) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );
GRANT SELECT ON public.customers TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customers FROM anon, authenticated;

DROP POLICY IF EXISTS "Customers create orders through checkout" ON public.orders;
DROP POLICY IF EXISTS "Customers read own orders" ON public.orders;
DROP POLICY IF EXISTS "Administrators read all orders" ON public.orders;
DROP POLICY IF EXISTS "Own orders select" ON public.orders;
DROP POLICY IF EXISTS "Allow all orders" ON public.orders;
CREATE POLICY "Customers read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      user_id = auth.uid()
      OR LOWER(COALESCE(customer_email, '')) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );
GRANT SELECT ON public.orders TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM anon, authenticated;

DROP POLICY IF EXISTS "Administrators read notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Allow all admin_notifications" ON public.admin_notifications;
REVOKE ALL ON public.admin_notifications FROM anon, authenticated;

DROP POLICY IF EXISTS "Public read active delivery zones" ON public.delivery_zones;
CREATE POLICY "Public read active delivery zones" ON public.delivery_zones
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND deleted_at IS NULL);
GRANT SELECT ON public.delivery_zones TO anon, authenticated;

DROP POLICY IF EXISTS "Allow all coupons" ON public.coupons;
REVOKE ALL ON public.coupons FROM anon, authenticated;

DROP POLICY IF EXISTS "Public read approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers read own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers create own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers create own delivered-order reviews" ON public.reviews;
CREATE POLICY "Public read approved reviews" ON public.reviews
  FOR SELECT TO anon, authenticated USING (is_approved = TRUE);
CREATE POLICY "Customers read own reviews" ON public.reviews
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Customers create own delivered-order reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = reviews.order_id
        AND orders.user_id = auth.uid()
        AND orders.status = 'delivered'
        AND orders.deleted_at IS NULL
    )
  );
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;

DROP POLICY IF EXISTS "Customers read own meal subscriptions" ON public.meal_subscriptions;
DROP POLICY IF EXISTS "Customers create own meal subscriptions" ON public.meal_subscriptions;
CREATE POLICY "Customers read own meal subscriptions" ON public.meal_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Customers create own meal subscriptions" ON public.meal_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT ON public.meal_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Customers read own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Customers create own reservations" ON public.reservations;
CREATE POLICY "Customers read own reservations" ON public.reservations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Customers create own reservations" ON public.reservations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT ON public.reservations TO authenticated;

DROP POLICY IF EXISTS "Customers read own support messages" ON public.support_messages;
DROP POLICY IF EXISTS "Customers send own support messages" ON public.support_messages;
CREATE POLICY "Customers read own support messages" ON public.support_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Customers send own support messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND sender_role = 'customer');
GRANT SELECT, INSERT ON public.support_messages TO authenticated;

-- Fleet, audit, rate-limit, webhook, and coupon data are server-only.
REVOKE ALL ON public.riders, public.admin_audit_logs, public.api_rate_limits, public.webhook_logs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.meal_subscriptions, public.reservations, public.support_messages, public.reviews
  FROM PUBLIC;
GRANT ALL ON public.customers, public.delivery_zones, public.coupons, public.reviews,
  public.meal_subscriptions, public.reservations, public.riders, public.support_messages,
  public.admin_audit_logs, public.api_rate_limits, public.webhook_logs
  TO service_role;

-- Payment slips are private. Uploads and downloads must pass through validated server routes.
UPDATE storage.buckets SET public = FALSE WHERE id = 'payment-slips';
DROP POLICY IF EXISTS "Public payment slips access" ON storage.objects;
DROP POLICY IF EXISTS "Public view payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Public upload payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload payment slips" ON storage.objects;
DROP POLICY IF EXISTS "Upload payment slips" ON storage.objects;

-- Realtime support chat is row-secured by the policies above.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END;
$$;

NOTIFY pgrst, 'reload schema';
