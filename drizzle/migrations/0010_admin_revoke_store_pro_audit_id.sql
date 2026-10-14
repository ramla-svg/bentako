CREATE OR REPLACE FUNCTION public.admin_revoke_store_pro(
  p_store_id uuid,
  p_actor uuid,
  p_actor_email text,
  p_reason text,
  p_expected_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.stores%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  SELECT * INTO s FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF s.plan IS DISTINCT FROM 'pro' THEN
    RETURN jsonb_build_object('status', 'already_free');
  END IF;
  IF s.plan_expires_at IS DISTINCT FROM p_expected_expires_at THEN
    RETURN jsonb_build_object('status', 'stale', 'plan_expires_at', s.plan_expires_at);
  END IF;
  UPDATE public.stores
     SET plan = 'free', plan_period = NULL, plan_expires_at = NULL, plan_source = NULL
   WHERE id = p_store_id;
  INSERT INTO public.audit_logs (id, store_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (gen_random_uuid(), p_store_id, p_actor, 'plan_revoked', 'store', p_store_id, jsonb_build_object(
    'reason', left(btrim(p_reason), 300),
    'actor_email', p_actor_email,
    'prior_plan', s.plan,
    'prior_period', s.plan_period,
    'prior_expires_at', s.plan_expires_at,
    'prior_source', s.plan_source,
    'revoked_at', now()
  ));
  RETURN jsonb_build_object('status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_store_pro(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_store_pro(uuid, uuid, text, text, timestamptz) TO service_role;