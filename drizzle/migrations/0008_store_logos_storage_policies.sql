-- Store receipt logos: each shop can only touch files under its own store id folder.
CREATE POLICY "store members can read their store logo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'store-logos'
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);

CREATE POLICY "store members can upload their store logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'store-logos'
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);

CREATE POLICY "store members can replace their store logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'store-logos'
  AND (storage.foldername(name))[1] = public.current_store_id()::text
)
WITH CHECK (
  bucket_id = 'store-logos'
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);

CREATE POLICY "store members can delete their store logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'store-logos'
  AND (storage.foldername(name))[1] = public.current_store_id()::text
);
