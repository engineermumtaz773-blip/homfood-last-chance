ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS ingredients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS preparation TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
