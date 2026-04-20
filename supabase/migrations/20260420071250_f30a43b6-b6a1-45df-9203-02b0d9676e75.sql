CREATE OR REPLACE FUNCTION public.rollup_cashier_to_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.cashier_sales%ROWTYPE;
  v_delivery_id uuid;
  v_existing_id uuid;
BEGIN
  SELECT * INTO v_sale FROM public.cashier_sales WHERE id = NEW.sale_id;

  -- find or create a "cashier" standalone delivery for that date
  SELECT id INTO v_delivery_id
  FROM public.deliveries
  WHERE delivery_date = v_sale.sale_date
    AND agent_id IS NULL
    AND branch_id IS NULL
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    INSERT INTO public.deliveries (delivery_date, status, created_by)
    VALUES (v_sale.sale_date, 'completed', v_sale.cashier_id)
    RETURNING id INTO v_delivery_id;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.delivery_items
  WHERE delivery_id = v_delivery_id AND category_id = NEW.category_id
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    IF v_sale.shift = 'shift2' THEN
      INSERT INTO public.delivery_items (delivery_id, category_id, quantity, price_at_delivery, sold_shift1, sold_shift2)
      VALUES (v_delivery_id, NEW.category_id, NEW.quantity, NEW.unit_price, 0, NEW.quantity);
    ELSE
      INSERT INTO public.delivery_items (delivery_id, category_id, quantity, price_at_delivery, sold_shift1, sold_shift2)
      VALUES (v_delivery_id, NEW.category_id, NEW.quantity, NEW.unit_price, NEW.quantity, 0);
    END IF;
  ELSE
    IF v_sale.shift = 'shift2' THEN
      UPDATE public.delivery_items
      SET quantity = quantity + NEW.quantity,
          sold_shift2 = sold_shift2 + NEW.quantity
      WHERE id = v_existing_id;
    ELSE
      UPDATE public.delivery_items
      SET quantity = quantity + NEW.quantity,
          sold_shift1 = sold_shift1 + NEW.quantity
      WHERE id = v_existing_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Make sure the trigger exists
DROP TRIGGER IF EXISTS trg_rollup_cashier_to_delivery ON public.cashier_sale_items;
CREATE TRIGGER trg_rollup_cashier_to_delivery
AFTER INSERT ON public.cashier_sale_items
FOR EACH ROW EXECUTE FUNCTION public.rollup_cashier_to_delivery();