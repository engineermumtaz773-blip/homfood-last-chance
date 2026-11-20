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

CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL REFERENCES public.orders(number) ON UPDATE CASCADE ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  body TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  message TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 2000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reservations_slot_status_idx ON public.reservations (slot_time, status);
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON public.reservations (customer_id, slot_time DESC);
CREATE INDEX IF NOT EXISTS meal_subscriptions_customer_status_idx ON public.meal_subscriptions (customer_id, status);
CREATE INDEX IF NOT EXISTS order_messages_order_created_idx ON public.order_messages (order_number, created_at);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_meal_subscriptions ON public.meal_subscriptions;
CREATE TRIGGER set_updated_at_meal_subscriptions
  BEFORE UPDATE ON public.meal_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_reservations ON public.reservations;
CREATE TRIGGER set_updated_at_reservations
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meal_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own order messages" ON public.order_messages;
CREATE POLICY "Customers read own order messages" ON public.order_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.number = order_messages.order_number
        AND NULLIF(auth.jwt() ->> 'email', '') IS NOT NULL
        AND LOWER(COALESCE(orders.customer_email, '')) = LOWER(auth.jwt() ->> 'email')
    )
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

REVOKE ALL ON public.meal_subscriptions, public.reservations, public.order_messages, public.support_messages
  FROM anon, authenticated;
GRANT SELECT ON public.order_messages TO authenticated;
GRANT ALL ON public.meal_subscriptions, public.reservations, public.order_messages, public.support_messages
  TO service_role;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_subscriptions;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
  END;
END;
$$;

NOTIFY pgrst, 'reload schema';
