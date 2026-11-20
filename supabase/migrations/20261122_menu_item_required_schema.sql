CREATE SEQUENCE IF NOT EXISTS public.menu_items_id_seq;

CREATE TABLE IF NOT EXISTS public.menu_items (
  id BIGINT PRIMARY KEY DEFAULT nextval('public.menu_items_id_seq'),
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Dinner',
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  image TEXT NOT NULL DEFAULT '🍲',
  image_url TEXT NOT NULL DEFAULT '',
  portions JSONB NOT NULL DEFAULT '[]'::jsonb,
  serving_size TEXT,
  dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating NUMERIC,
  rating_count INTEGER,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sold_out BOOLEAN NOT NULL DEFAULT FALSE,
  daily_stock_limit INTEGER,
  remaining_stock INTEGER,
  calories INTEGER,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  addons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Dinner';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT '🍲';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS portions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS serving_size TEXT;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS rating NUMERIC;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS rating_count INTEGER;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sold_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS daily_stock_limit INTEGER;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS remaining_stock INTEGER;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS calories INTEGER;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS protein_g NUMERIC;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS carbs_g NUMERIC;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS fat_g NUMERIC;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS addons_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  id_is_identity BOOLEAN;
BEGIN
  SELECT is_identity = 'YES'
    INTO id_is_identity
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'menu_items'
     AND column_name = 'id';

  IF id_is_identity THEN
    UPDATE public.menu_items SET id = DEFAULT WHERE id IS NULL;
  ELSE
    PERFORM setval(
      'public.menu_items_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.menu_items), 0) + 1, 1),
      FALSE
    );
    ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;
    ALTER TABLE public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq');
    UPDATE public.menu_items SET id = nextval('public.menu_items_id_seq') WHERE id IS NULL;
  END IF;
END;
$$;
ALTER TABLE public.menu_items ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.menu_items'::regclass
      AND contype IN ('p', 'u')
      AND pg_get_constraintdef(oid) IN ('PRIMARY KEY (id)', 'UNIQUE (id)')
  ) THEN
    ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_id_key UNIQUE (id);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
