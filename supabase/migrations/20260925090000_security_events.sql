-- Append-only security event log.
--
-- Why: XiYouQuest holds High-risk personal data (HKUST ITSO Risk
-- Classification), and the Minimum Security Standard for SaaS asks that any
-- available application logging that would assist a forensic investigation be
-- enabled. Platform logs do not cover this: Supabase keeps 1 day of logs on the
-- current plan and Vercel keeps 1 hour to 3 days, so sign-ins, erasures,
-- exports and abuse signals are recorded here, in the project's own database.
--
-- Tamper resistance: the application roles hold NO privilege on the table.
-- service_role can only call log_security_event() (insert) and
-- security_events_for_user() (a data subject's own rows, for export). A stolen
-- service key therefore cannot rewrite or erase the record; reading the full
-- log requires the database owner.
--
-- Retention: 180 days, purged in bounded batches on insert. Not applied by the
-- application release; apply with the owner's Management API or SQL editor
-- access before deploying code that calls it (calls fail soft until then).

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN (
    'auth.sign_in',
    'auth.sign_in_denied',
    'account.delete',
    'account.export',
    'rate_limit.exceeded',
    'profile.avatar_upload'
  )),
  user_id uuid,
  ip_address inet,
  user_agent text CHECK (char_length(user_agent) <= 512),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(detail) <= 2048)
);

CREATE INDEX IF NOT EXISTS security_events_occurred_at_idx
  ON public.security_events (occurred_at);
CREATE INDEX IF NOT EXISTS security_events_user_idx
  ON public.security_events (user_id, occurred_at);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.security_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_user_id uuid DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip inet;
BEGIN
  -- A malformed address is dropped rather than failing the event.
  BEGIN
    v_ip := nullif(p_ip_address, '')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  INSERT INTO public.security_events (event_type, user_id, ip_address, user_agent, detail)
  VALUES (p_event_type, p_user_id, v_ip, left(p_user_agent, 512), coalesce(p_detail, '{}'::jsonb));

  DELETE FROM public.security_events
  WHERE id IN (
    SELECT id FROM public.security_events
    WHERE occurred_at < now() - interval '180 days'
    ORDER BY occurred_at
    LIMIT 500
  );
END;
$$;

-- A data subject's own events, for the self-service export (PDPO DPP6).
CREATE OR REPLACE FUNCTION public.security_events_for_user(p_user_id uuid)
RETURNS TABLE (
  occurred_at timestamptz,
  event_type text,
  ip_address inet,
  user_agent text,
  detail jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT occurred_at, event_type, ip_address, user_agent, detail
  FROM public.security_events
  WHERE user_id = p_user_id
  ORDER BY occurred_at;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(text, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.security_events_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_events_for_user(uuid) TO service_role;

COMMIT;
