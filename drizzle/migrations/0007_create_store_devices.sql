CREATE TABLE public.store_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text,
  user_id uuid,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX store_devices_store_device_idx ON public.store_devices (store_id, device_id);
CREATE INDEX store_devices_store_idx ON public.store_devices (store_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_devices TO authenticated;
GRANT ALL ON public.store_devices TO service_role;

ALTER TABLE public.store_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devices select" ON public.store_devices
  FOR SELECT TO authenticated USING (store_id = public.current_store_id());
CREATE POLICY "devices insert" ON public.store_devices
  FOR INSERT TO authenticated WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "devices update" ON public.store_devices
  FOR UPDATE TO authenticated USING (store_id = public.current_store_id()) WITH CHECK (store_id = public.current_store_id());
CREATE POLICY "devices delete" ON public.store_devices
  FOR DELETE TO authenticated USING (store_id = public.current_store_id());