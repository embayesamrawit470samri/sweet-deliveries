
-- 1. Profiles: branch info + manager ownership
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS branch_phone TEXT,
  ADD COLUMN IF NOT EXISTS shift1_name TEXT,
  ADD COLUMN IF NOT EXISTS shift2_name TEXT,
  ADD COLUMN IF NOT EXISTS manager_id UUID;

-- 2. Deliveries: agent_id + make branch_id nullable
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE public.deliveries ALTER COLUMN branch_id DROP NOT NULL;

-- 3. Delivery items: defective tracking
ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS defective_shift1 INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defective_shift2 INTEGER NOT NULL DEFAULT 0;

-- 4. Categories: optional photo
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 5. Replace opening-stock function (drop first because param name changes)
DROP FUNCTION IF EXISTS public.calculate_opening_stock(uuid, date) CASCADE;
CREATE FUNCTION public.calculate_opening_stock(p_agent_id uuid, p_date date)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    json_object_agg(
      di.category_id,
      GREATEST(di.quantity - di.sold_shift1 - di.sold_shift2 - di.defective_shift1 - di.defective_shift2, 0)
    ),
    '{}'::json
  )
  FROM public.deliveries d
  JOIN public.delivery_items di ON di.delivery_id = d.id
  WHERE d.agent_id = p_agent_id
    AND d.delivery_date = p_date - INTERVAL '1 day'
$$;

-- 6. Services table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  price_etb NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone view active services" ON public.services;
CREATE POLICY "Anyone view active services" ON public.services
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admin/Manager view all services" ON public.services;
CREATE POLICY "Admin/Manager view all services" ON public.services
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admin/Manager manage services" ON public.services;
CREATE POLICY "Admin/Manager manage services" ON public.services
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

DROP TRIGGER IF EXISTS services_updated_at ON public.services;
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('category-photos', 'category-photos', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('service-photos', 'service-photos', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read category photos" ON storage.objects;
CREATE POLICY "Public read category photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'category-photos');

DROP POLICY IF EXISTS "Admin/Manager upload category photos" ON storage.objects;
CREATE POLICY "Admin/Manager upload category photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'category-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

DROP POLICY IF EXISTS "Admin/Manager update category photos" ON storage.objects;
CREATE POLICY "Admin/Manager update category photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'category-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

DROP POLICY IF EXISTS "Admin/Manager delete category photos" ON storage.objects;
CREATE POLICY "Admin/Manager delete category photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'category-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

DROP POLICY IF EXISTS "Public read service photos" ON storage.objects;
CREATE POLICY "Public read service photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'service-photos');

DROP POLICY IF EXISTS "Admin/Manager upload service photos" ON storage.objects;
CREATE POLICY "Admin/Manager upload service photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'service-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

DROP POLICY IF EXISTS "Admin/Manager update service photos" ON storage.objects;
CREATE POLICY "Admin/Manager update service photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'service-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

DROP POLICY IF EXISTS "Admin/Manager delete service photos" ON storage.objects;
CREATE POLICY "Admin/Manager delete service photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'service-photos' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- 8. RLS: managers see profiles of their own agents
DROP POLICY IF EXISTS "Managers view own agents" ON public.profiles;
CREATE POLICY "Managers view own agents" ON public.profiles
  FOR SELECT USING (manager_id = auth.uid() AND has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers update own agents" ON public.profiles;
CREATE POLICY "Managers update own agents" ON public.profiles
  FOR UPDATE USING (manager_id = auth.uid() AND has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers view roles of own agents" ON public.user_roles;
CREATE POLICY "Managers view roles of own agents" ON public.user_roles
  FOR SELECT USING (
    has_role(auth.uid(), 'manager') AND
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.manager_id = auth.uid())
  );
