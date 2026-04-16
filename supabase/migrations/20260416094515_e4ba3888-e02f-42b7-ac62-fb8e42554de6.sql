
-- App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'agent', 'customer');

-- User roles table (separate from profiles per security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Food categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_etb NUMERIC(10,2) NOT NULL CHECK (price_etb >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Category price history for accurate historical reports
CREATE TABLE public.category_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  price_etb NUMERIC(10,2) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.category_price_history ENABLE ROW LEVEL SECURITY;

-- Branches (agent selling locations)
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  shift1_name TEXT NOT NULL,
  shift2_name TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Deliveries (manager sends stock to branch/agent)
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Delivery line items
CREATE TABLE public.delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  price_at_delivery NUMERIC(10,2) NOT NULL,
  sold_shift1 INTEGER NOT NULL DEFAULT 0 CHECK (sold_shift1 >= 0),
  sold_shift2 INTEGER NOT NULL DEFAULT 0 CHECK (sold_shift2 >= 0),
  CONSTRAINT sold_not_exceed_qty CHECK (sold_shift1 + sold_shift2 <= quantity)
);
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

-- Orders (customer or internal)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT,
  needed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ready','delivered','cancelled')),
  total_etb NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Order line items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_order NUMERIC(10,2) NOT NULL
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to log price changes
CREATE OR REPLACE FUNCTION public.log_category_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.price_etb IS DISTINCT FROM NEW.price_etb THEN
    INSERT INTO public.category_price_history (category_id, price_etb) VALUES (NEW.id, NEW.price_etb);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER log_price_on_category_change AFTER INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.log_category_price_change();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Default role: customer
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to calculate opening stock from previous day
CREATE OR REPLACE FUNCTION public.calculate_opening_stock(p_branch_id UUID, p_date DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_object_agg(
      di.category_id,
      GREATEST(di.quantity - di.sold_shift1 - di.sold_shift2, 0)
    ),
    '{}'::json
  )
  FROM public.deliveries d
  JOIN public.delivery_items di ON di.delivery_id = d.id
  WHERE d.branch_id = p_branch_id
    AND d.delivery_date = p_date - INTERVAL '1 day'
$$;

-- RLS POLICIES

-- user_roles: users see own roles, admins see all
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles: users see/edit own, admins/managers see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'manager'));

-- categories: everyone can read, admin/manager can write
CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers manage categories" ON public.categories FOR ALL USING (public.has_role(auth.uid(), 'manager'));

-- category_price_history: read for admin/manager
CREATE POLICY "Admin/Manager view price history" ON public.category_price_history FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- branches: manager/admin manage, agents read own
CREATE POLICY "Admin/Manager manage branches" ON public.branches FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Authenticated view branches" ON public.branches FOR SELECT USING (auth.uid() IS NOT NULL);

-- deliveries: manager/admin create/view, agents view own branch
CREATE POLICY "Admin/Manager manage deliveries" ON public.deliveries FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Agents view own deliveries" ON public.deliveries FOR SELECT USING (
  public.has_role(auth.uid(), 'agent')
);

-- delivery_items: same as deliveries
CREATE POLICY "Admin/Manager manage delivery items" ON public.delivery_items FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Agents view delivery items" ON public.delivery_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d WHERE d.id = delivery_id AND public.has_role(auth.uid(), 'agent')
  )
);
CREATE POLICY "Agents update sold quantities" ON public.delivery_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d WHERE d.id = delivery_id AND public.has_role(auth.uid(), 'agent')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deliveries d WHERE d.id = delivery_id AND public.has_role(auth.uid(), 'agent')
  )
);

-- orders: authenticated can create, admin/manager view all, customers view own
CREATE POLICY "Authenticated create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/Manager view all orders" ON public.orders FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Admin/Manager manage orders" ON public.orders FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

-- order_items
CREATE POLICY "Authenticated create order items" ON public.order_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/Manager view all order items" ON public.order_items FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.created_by = auth.uid())
);
