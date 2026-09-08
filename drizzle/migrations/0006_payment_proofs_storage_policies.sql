-- Shop owners may upload a GCash screenshot into their own store folder.
-- Reading is done server-side with the service role, so no SELECT policy here.
CREATE POLICY "payment proof upload own store" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = public.current_store_id()::text
  );
