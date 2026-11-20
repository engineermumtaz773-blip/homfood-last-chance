ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT '🍲',
  ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS portions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS serving_size TEXT,
  ADD COLUMN IF NOT EXISTS dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sold_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS daily_stock_limit INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_stock INTEGER,
  ADD COLUMN IF NOT EXISTS calories INTEGER,
  ADD COLUMN IF NOT EXISTS protein_g NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g NUMERIC,
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS addons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE SEQUENCE IF NOT EXISTS public.menu_items_id_seq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'menu_items'
       AND column_name = 'id'
       AND is_identity = 'YES'
  ) THEN
    ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;
    ALTER TABLE public.menu_items
      ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq');
    PERFORM setval(
      'public.menu_items_id_seq',
      COALESCE((SELECT MAX(id) FROM public.menu_items), 0) + 1,
      FALSE
    );
  END IF;
END;
$$;

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

DROP TRIGGER IF EXISTS set_updated_at_menu_items ON public.menu_items;
CREATE TRIGGER set_updated_at_menu_items
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
