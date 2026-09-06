ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'utang';

CREATE INDEX IF NOT EXISTS customer_payments_customer_created_idx
  ON public.customer_payments (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cash_transactions_store_created_idx
  ON public.cash_transactions (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_store_created_idx
  ON public.sales (store_id, created_at DESC);