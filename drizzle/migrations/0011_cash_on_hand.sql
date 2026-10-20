ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_from text;
COMMENT ON COLUMN public.expenses.paid_from IS 'cash = paid from drawer; gcash/maya/bank/other = outside drawer; NULL = legacy unclassified';
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS payment_method text;
COMMENT ON COLUMN public.customer_payments.payment_method IS 'How a repayment was received; NULL = legacy/unknown or a manual charge';
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS drawer_effect numeric;
COMMENT ON COLUMN public.cash_transactions.drawer_effect IS 'Signed physical drawer cash effect confirmed by the user; NULL = legacy, not counted';

CREATE TABLE public.cash_drawer_movements (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  kind text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_drawer_movements_store_idx ON public.cash_drawer_movements(store_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.cash_drawer_movements TO authenticated;
GRANT ALL ON public.cash_drawer_movements TO service_role;
ALTER TABLE public.cash_drawer_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drawer select" ON public.cash_drawer_movements FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "drawer insert" ON public.cash_drawer_movements FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "drawer update" ON public.cash_drawer_movements FOR UPDATE TO authenticated USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());