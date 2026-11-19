-- Apply after the existing Home Made Food core and enterprise migrations.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_decremented BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS daily_stock_limit INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_stock INTEGER,
  ADD COLUMN IF NOT EXISTS sold_out BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.orders
SET total_amount = total
WHERE total_amount = 0 AND total <> 0;

UPDATE public.orders
SET discount_amount = discount
WHERE discount_amount = 0 AND discount <> 0;

DO $$
DECLARE
  status_constraint RECORD;
BEGIN
  FOR status_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mstatus\M'
      AND pg_get_constraintdef(oid) NOT LIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', status_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled',
    'new', 'ready', 'delivering', 'arriving', 'completed'
  ));

CREATE OR REPLACE FUNCTION public.sync_homefood_order_aliases()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.total = 0 AND NEW.total_amount <> 0 THEN
      NEW.total := NEW.total_amount;
    ELSE
      NEW.total_amount := NEW.total;
    END IF;
    IF NEW.discount = 0 AND NEW.discount_amount <> 0 THEN
      NEW.discount := NEW.discount_amount;
    ELSE
      NEW.discount_amount := NEW.discount;
    END IF;
    NEW.admin_notes := COALESCE(NEW.admin_notes, NEW.admin_note);
    NEW.admin_note := COALESCE(NEW.admin_note, NEW.admin_notes);
    NEW.admin_media_url := COALESCE(NEW.admin_media_url, NEW.admin_video_url);
    NEW.admin_video_url := COALESCE(NEW.admin_video_url, NEW.admin_media_url);
  ELSE
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      NEW.total_amount := NEW.total;
    ELSIF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      NEW.total := NEW.total_amount;
    END IF;
    IF NEW.discount IS DISTINCT FROM OLD.discount THEN
      NEW.discount_amount := NEW.discount;
    ELSIF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
      NEW.discount := NEW.discount_amount;
    END IF;
    IF NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
      NEW.admin_notes := NEW.admin_note;
    ELSIF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      NEW.admin_note := NEW.admin_notes;
    END IF;
    IF NEW.admin_video_url IS DISTINCT FROM OLD.admin_video_url THEN
      NEW.admin_media_url := NEW.admin_video_url;
    ELSIF NEW.admin_media_url IS DISTINCT FROM OLD.admin_media_url THEN
      NEW.admin_video_url := NEW.admin_media_url;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_sync_homefood_aliases ON public.orders;
CREATE TRIGGER orders_sync_homefood_aliases
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_homefood_order_aliases();

CREATE OR REPLACE FUNCTION public.cancel_homefood_order(
  p_order_number TEXT,
  p_phone TEXT,
  p_reason TEXT
)
RETURNS TABLE(result TEXT, order_data JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  item RECORD;
  normalized_phone TEXT := RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
  reason_text TEXT := LEFT(COALESCE(NULLIF(BTRIM(p_reason), ''), 'Customer requested cancellation'), 500);
BEGIN
  SELECT *
    INTO current_order
    FROM public.orders
   WHERE UPPER(BTRIM(number)) = UPPER(BTRIM(p_order_number))
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  IF LENGTH(normalized_phone) < 10
     OR RIGHT(REGEXP_REPLACE(COALESCE(current_order.customer_phone, ''), '\D', '', 'g'), 10) <> normalized_phone THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  IF current_order.status NOT IN ('pending', 'new', 'confirmed') THEN
    RETURN QUERY SELECT 'locked'::TEXT, TO_JSONB(current_order);
    RETURN;
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         cancellation_reason = reason_text,
         notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Cancellation reason: ' || reason_text),
         updated_at = NOW()
   WHERE id = current_order.id
   RETURNING * INTO current_order;

  IF current_order.stock_decremented THEN
    FOR item IN
      SELECT
        (entry.value ->> 'id')::BIGINT AS menu_item_id,
        SUM(
          CASE
            WHEN entry.value ->> 'quantity' ~ '^[0-9]+$'
              THEN GREATEST((entry.value ->> 'quantity')::INTEGER, 1)
            ELSE 1
          END
        )::INTEGER AS quantity
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(current_order.items, '[]'::JSONB)) AS entry(value)
      WHERE entry.value ->> 'id' ~ '^[0-9]+$'
      GROUP BY (entry.value ->> 'id')::BIGINT
    LOOP
      UPDATE public.menu_items
         SET remaining_stock = CASE
               WHEN daily_stock_limit IS NULL THEN remaining_stock + item.quantity
               ELSE LEAST(daily_stock_limit, remaining_stock + item.quantity)
             END,
             sold_out = FALSE,
             available = CASE WHEN sold_out THEN TRUE ELSE available END
       WHERE id = item.menu_item_id
         AND remaining_stock IS NOT NULL;
    END LOOP;

    UPDATE public.orders
       SET stock_decremented = FALSE,
           updated_at = NOW()
     WHERE id = current_order.id
     RETURNING * INTO current_order;
  END IF;

  INSERT INTO public.admin_notifications (type, title, body, order_number, priority)
  VALUES ('order_cancelled', 'Order ' || current_order.number || ' cancelled', reason_text, current_order.number, 'high');

  RETURN QUERY SELECT 'cancelled'::TEXT, TO_JSONB(current_order);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_homefood_order(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_homefood_order(TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';
