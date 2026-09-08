-- Manual GCash upgrade requests: the shop owner records what they sent,
-- the BentaKo super admin approves it and the store becomes Pro.
CREATE TABLE public.plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  store_name text,
  requested_by uuid,
  requested_by_email text,
  plan_period text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  reference_code text NOT NULL,
  gcash_reference text NOT NULL,
  proof_path text,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.plan_payments TO authenticated;
GRANT ALL ON public.plan_payments TO service_role;

ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own store payments select" ON public.plan_payments
  FOR SELECT TO authenticated USING (store_id = public.current_store_id());

CREATE POLICY "own store payments insert" ON public.plan_payments
  FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());

CREATE INDEX plan_payments_status_idx ON public.plan_payments (status, created_at DESC);
CREATE INDEX plan_payments_store_idx ON public.plan_payments (store_id, created_at DESC);

CREATE TRIGGER t_plan_payments_upd BEFORE UPDATE ON public.plan_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Small key/value settings owned by BentaKo itself (GCash name, number, QR image URL).
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app settings readable" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER t_app_settings_upd BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
