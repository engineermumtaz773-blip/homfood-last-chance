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

  IF current_order.created_at <= NOW() - INTERVAL '5 minutes' THEN
    RETURN QUERY SELECT 'expired'::TEXT, TO_JSONB(current_order);
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

NOTIFY pgrst, 'reload schema';
