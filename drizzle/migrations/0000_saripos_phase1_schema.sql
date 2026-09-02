-- ENUMS ---------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('owner', 'cashier');
CREATE TYPE public.unit_type AS ENUM ('piece','pack','sachet','bottle','can','box','kilo','gram','liter','ml','other');
CREATE TYPE public.sale_status AS ENUM ('completed','voided');
CREATE TYPE public.payment_method AS ENUM ('cash','gcash','maya','bank','other');
CREATE TYPE public.movement_type AS ENUM ('stock_in','sale','adjustment_add','adjustment_remove','damaged','expired','returned','cashout_related','supplier_purchase','void_restore');
CREATE TYPE public.cash_txn_type AS ENUM ('cash_in','cash_out');
CREATE TYPE public.service_provider AS ENUM ('gcash','maya','bank','remittance','other');

-- STORES / PROFILES ---------------------------------------------------
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  owner_name text,
  logo_url text,
  currency text NOT NULL DEFAULT 'PHP',
  receipt_footer text DEFAULT 'Maraming salamat po!',
  allow_negative_stock boolean NOT NULL DEFAULT false,
  default_low_stock_threshold integer NOT NULL DEFAULT 5,
  confirm_void boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  pin_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- HELPERS -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORIES ----------------------------------------------------------
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PRODUCTS ------------------------------------------------------------
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  sku text,
  barcode text,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity numeric(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(12,2) NOT NULL DEFAULT 5,
  unit_type public.unit_type NOT NULL DEFAULT 'piece',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_store_idx ON public.products(store_id);

-- SALES ---------------------------------------------------------------
CREATE TABLE public.sales (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  transaction_number text NOT NULL,
  cashier_id uuid,
  cashier_name text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  cash_received numeric(12,2) NOT NULL DEFAULT 0,
  change_amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.sale_status NOT NULL DEFAULT 'completed',
  customer_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_store_created_idx ON public.sales(store_id, created_at DESC);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid,
  product_name_snapshot text NOT NULL,
  category_name_snapshot text,
  quantity numeric(12,2) NOT NULL,
  cost_price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  selling_price_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);

-- INVENTORY MOVEMENTS -------------------------------------------------
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  movement_type public.movement_type NOT NULL,
  quantity numeric(12,2) NOT NULL,
  previous_stock numeric(12,2) NOT NULL DEFAULT 0,
  new_stock numeric(12,2) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2),
  supplier text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inv_mov_store_idx ON public.inventory_movements(store_id, created_at DESC);

-- EXPENSES ------------------------------------------------------------
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  expense_date date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_store_idx ON public.expenses(store_id, expense_date DESC);

-- AUDIT ---------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FUTURE MODULES (schema only, no UI yet) -----------------------------
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  mobile_number text,
  notes text,
  credit_balance numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_transactions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  transaction_type public.cash_txn_type NOT NULL,
  provider public.service_provider NOT NULL DEFAULT 'other',
  customer_name text,
  customer_mobile_number text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  service_fee numeric(12,2) NOT NULL DEFAULT 0,
  reference_number text,
  wallet_before numeric(12,2),
  wallet_after numeric(12,2),
  cash_before numeric(12,2),
  cash_after numeric(12,2),
  status text NOT NULL DEFAULT 'completed',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- UPDATED_AT TRIGGERS -------------------------------------------------
CREATE TRIGGER t_stores_upd BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_categories_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_sales_upd BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_expenses_upd BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- GRANTS --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sale_items TO authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT SELECT, INSERT ON public.customer_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.stores, public.profiles, public.user_roles, public.categories, public.products,
  public.sales, public.sale_items, public.inventory_movements, public.expenses, public.audit_logs,
  public.customers, public.customer_payments, public.cash_transactions TO service_role;

-- RLS -----------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- profiles: own row only
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles: read own; insert own (first-run owner bootstrap)
CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own roles insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- stores: members read, owner writes, any authed user may create their store
CREATE POLICY "store members select" ON public.stores FOR SELECT TO authenticated
  USING (id = public.current_store_id() OR owner_id = auth.uid());
CREATE POLICY "store create" ON public.stores FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "store owner update" ON public.stores FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- store-scoped tables
CREATE POLICY "cat select" ON public.categories FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "cat insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "cat update" ON public.categories FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "prod select" ON public.products FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "prod insert" ON public.products FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "prod update" ON public.products FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "sale select" ON public.sales FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "sale insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "sale update" ON public.sales FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "sale item select" ON public.sale_items FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "sale item insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "sale item update" ON public.sale_items FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "mov select" ON public.inventory_movements FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "mov insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "exp select" ON public.expenses FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "exp insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "exp update" ON public.expenses FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "audit select" ON public.audit_logs FOR SELECT TO authenticated USING (store_id = public.current_store_id() AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "cust select" ON public.customers FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "cust insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "cust update" ON public.customers FOR UPDATE TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "custpay select" ON public.customer_payments FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "custpay insert" ON public.customer_payments FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "cash select" ON public.cash_transactions FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "cash insert" ON public.cash_transactions FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "cash update" ON public.cash_transactions FOR UPDATE TO authenticated USING (store_id = public.current_store_id());