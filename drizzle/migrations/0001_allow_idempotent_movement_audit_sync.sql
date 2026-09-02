GRANT UPDATE ON public.inventory_movements TO authenticated;
GRANT UPDATE ON public.audit_logs TO authenticated;

CREATE POLICY "mov update" ON public.inventory_movements
  FOR UPDATE TO authenticated
  USING (store_id = public.current_store_id())
  WITH CHECK (store_id = public.current_store_id());

CREATE POLICY "audit update" ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (store_id = public.current_store_id())
  WITH CHECK (store_id = public.current_store_id());