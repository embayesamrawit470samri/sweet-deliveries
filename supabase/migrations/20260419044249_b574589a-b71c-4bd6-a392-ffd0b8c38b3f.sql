-- Allow order items to reference services instead of (or in addition to) categories
ALTER TABLE public.order_items
  ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_name text;

-- At least one of category_id or service_id must be set
ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_has_ref;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_has_ref CHECK (category_id IS NOT NULL OR service_id IS NOT NULL);