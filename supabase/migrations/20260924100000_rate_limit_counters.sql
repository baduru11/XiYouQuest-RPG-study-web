-- Per-user fixed-window rate limits for paid providers (iFlytek ISE/ASR/TTS,
-- OpenRouter LLM and image generation) and abuse-prone reads (user search).
--
-- Both runtimes call this one function — the Next routes via
-- src/lib/rate-limit.ts and the edge functions via
-- supabase/functions/_shared/rate-limit.ts — so a limit cannot be bypassed by
-- calling the other runtime's twin of the same endpoint.
--
-- Server-only: service_role executes it after verifying the Better Auth
-- session; anon/authenticated hold no privileges (see
-- 20260924090000_lockdown_client_roles.sql).

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  user_id uuid NOT NULL,
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_seconds, window_start)
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) may touch it.
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_counters TO service_role;

-- Records one hit in every window and reports whether any window is exceeded.
-- Returns 0 when allowed, otherwise the seconds until the tightest exceeded
-- window resets (for a Retry-After header). p_windows and p_limits are
-- parallel arrays, e.g. ARRAY[3600, 86400] / ARRAY[300, 1500].
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_windows integer[],
  p_limits integer[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  i integer;
  w integer;
  v_start timestamptz;
  v_hits integer;
  v_retry integer := 0;
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL OR p_bucket IS NULL
     OR coalesce(array_length(p_windows, 1), 0) = 0
     OR array_length(p_windows, 1) <> array_length(p_limits, 1) THEN
    RAISE EXCEPTION 'consume_rate_limit: invalid arguments';
  END IF;

  FOR i IN 1 .. array_length(p_windows, 1) LOOP
    w := p_windows[i];
    v_start := to_timestamp(floor(extract(epoch FROM v_now) / w) * w);

    INSERT INTO public.rate_limit_counters AS c
      (user_id, bucket, window_seconds, window_start, hits)
    VALUES (p_user_id, p_bucket, w, v_start, 1)
    ON CONFLICT (user_id, bucket, window_seconds, window_start)
      DO UPDATE SET hits = c.hits + 1
    RETURNING c.hits INTO v_hits;

    IF v_hits > p_limits[i] THEN
      v_retry := greatest(
        v_retry,
        ceil(extract(epoch FROM (v_start + make_interval(secs => w)) - v_now))::integer
      );
    END IF;
  END LOOP;

  -- Opportunistic cleanup of this user's expired windows for this bucket.
  DELETE FROM public.rate_limit_counters
  WHERE user_id = p_user_id AND bucket = p_bucket
    AND window_start + make_interval(secs => window_seconds) < v_now - interval '1 day';

  RETURN v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(uuid, text, integer[], integer[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer[], integer[])
  TO service_role;

COMMIT;
