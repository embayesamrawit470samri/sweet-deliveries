-- 1) Allow public to place orders
DROP POLICY IF EXISTS "Authenticated create orders" ON public.orders;
CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated create order items" ON public.order_items;
CREATE POLICY "Anyone can create order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

-- 2) Company settings (single row)
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Bita Bakery',
  address text,
  phone text,
  footer_note text DEFAULT 'Thank you for your purchase!',
  service_charge_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view settings"
  ON public.company_settings FOR SELECT USING (true);

CREATE POLICY "Admin/Manager manage settings"
  ON public.company_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.company_settings (company_name, address, phone)
VALUES ('Bita Bakery', 'Addis Ababa, Ethiopia', '+251 900 000 000')
ON CONFLICT DO NOTHING;

-- 3) Cashier sales
CREATE TABLE IF NOT EXISTS public.cashier_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL,
  customer_name text,
  customer_phone text,
  shift text NOT NULL DEFAULT 'shift1',
  subtotal numeric NOT NULL DEFAULT 0,
  service_charge numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT true,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cashier_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.cashier_sales(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL
);

ALTER TABLE public.cashier_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Manager manage cashier sales"
  ON public.cashier_sales FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/Manager manage cashier sale items"
  ON public.cashier_sale_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 4) Trigger: roll up cashier sale items into a daily "cashier" delivery
CREATE OR REPLACE FUNCTION public.rollup_cashier_to_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.cashier_sales%ROWTYPE;
  v_delivery_id uuid;
  v_existing_qty integer;
  v_sold_col text;
BEGIN
  SELECT * INTO v_sale FROM public.cashier_sales WHERE id = NEW.sale_id;

  -- find or create a "cashier" standalone delivery for that date (agent_id NULL, branch_id NULL)
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

  -- upsert delivery_item: increment quantity and sold for the right shift
  SELECT id INTO v_existing_qty
  FROM public.delivery_items
  WHERE delivery_id = v_delivery_id AND category_id = NEW.category_id
  LIMIT 1;

  IF v_existing_qty IS NULL THEN
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
      WHERE delivery_id = v_delivery_id AND category_id = NEW.category_id;
    ELSE
      UPDATE public.delivery_items
      SET quantity = quantity + NEW.quantity,
          sold_shift1 = sold_shift1 + NEW.quantity
      WHERE delivery_id = v_delivery_id AND category_id = NEW.category_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rollup_cashier_to_delivery ON public.cashier_sale_items;
CREATE TRIGGER trg_rollup_cashier_to_delivery
AFTER INSERT ON public.cashier_sale_items
FOR EACH ROW EXECUTE FUNCTION public.rollup_cashier_to_delivery();