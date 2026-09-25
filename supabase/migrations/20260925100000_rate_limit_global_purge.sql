-- Purge every user's long-expired rate-limit windows, not only the caller's.
--
-- Why: consume_rate_limit() cleaned up only the calling user's expired
-- windows for the bucket being counted. Account deletion removes the user's
-- counters, but an edge token issued before the deletion stays valid for up
-- to 15 minutes, and a call made with it re-creates counter rows that no
-- later call would ever clean up. Those rows hold a user id and usage times:
-- personal data kept after erasure.
--
-- Each call now also removes up to 100 windows, of any user, that ended more
-- than a day ago. The function is otherwise unchanged from
-- 20260924100000_rate_limit_counters.sql.

BEGIN;

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_start_idx
  ON public.rate_limit_counters (window_start);

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

  -- Bounded cleanup of any user's windows that ended more than a day ago.
  -- The first condition uses the window_start index; the second keeps a
  -- window longer than a day until it has really ended.
  DELETE FROM public.rate_limit_counters
  WHERE ctid IN (
    SELECT ctid FROM public.rate_limit_counters
    WHERE window_start < v_now - interval '2 days'
      AND window_start + make_interval(secs => window_seconds) < v_now - interval '1 day'
    LIMIT 100
  );

  RETURN v_retry;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(uuid, text, integer[], integer[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(uuid, text, integer[], integer[])
  TO service_role;

COMMIT;
