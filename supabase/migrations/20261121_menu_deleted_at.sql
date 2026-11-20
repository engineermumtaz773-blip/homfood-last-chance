ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS menu_items_active_order_idx
  ON public.menu_items (id)
  WHERE deleted_at IS NULL;
