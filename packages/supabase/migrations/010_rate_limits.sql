-- 010: Database-backed rate limiting table
-- Used by edge functions to enforce per-user request limits.
-- In-memory rate limiting is not viable on Deno Deploy (separate isolates).

CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limits_lookup
  ON rate_limits (key, endpoint, created_at);

-- Cleanup function: prune entries older than 5 minutes
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE created_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Enable RLS (service role bypasses, no direct user access)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Schedule cleanup via pg_cron if available
DO $$
BEGIN
  PERFORM cron.schedule('cleanup_rate_limits', '* * * * *', 'SELECT cleanup_rate_limits()');
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available — skipping rate_limits cleanup scheduling';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule rate_limits cleanup: %', SQLERRM;
END;
$$;
