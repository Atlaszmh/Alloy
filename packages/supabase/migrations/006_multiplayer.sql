-- 006: Multiplayer — room codes, game state, matchmaker, cleanup

-- =============================================================
-- 1. New columns on matches table
-- =============================================================

ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_code TEXT UNIQUE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_state JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'waiting'
  CHECK (status IN ('waiting', 'active', 'completed', 'abandoned', 'forfeited'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_code_expires_at TIMESTAMPTZ;

-- Partial index on room_code (only for rows that have one)
CREATE INDEX IF NOT EXISTS idx_matches_room_code
  ON matches (room_code)
  WHERE room_code IS NOT NULL;

-- Partial index on status='waiting' for fast matchmaking lookups
CREATE INDEX IF NOT EXISTS idx_matches_status_waiting
  ON matches (status)
  WHERE status = 'waiting';

-- =============================================================
-- 2. join_attempts table for rate limiting
-- =============================================================

CREATE TABLE IF NOT EXISTS join_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_join_attempts_ip_time
  ON join_attempts (ip_address, attempted_at);

-- =============================================================
-- 3. generate_room_code() function
-- =============================================================

CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INTEGER;
  attempts INTEGER := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check uniqueness against active (non-expired, non-completed) room codes
    IF NOT EXISTS (
      SELECT 1 FROM matches
      WHERE room_code = code
        AND status IN ('waiting', 'active')
    ) THEN
      RETURN code;
    END IF;

    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'generate_room_code: failed to find unique code after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 4. run_matchmaker() function
-- =============================================================

CREATE OR REPLACE FUNCTION run_matchmaker()
RETURNS void AS $$
DECLARE
  iteration INTEGER;
  tolerance INTEGER;
  p1 RECORD;
  p2 RECORD;
  new_match_id UUID;
  new_room TEXT;
  wait_seconds NUMERIC;
BEGIN
  FOR iteration IN 0..19 LOOP
    -- Find all queued players and try to match them
    FOR p1 IN
      SELECT player_id, elo, queued_at
      FROM matchmaking_queue
      ORDER BY queued_at ASC
    LOOP
      -- Calculate how long this player has been waiting
      wait_seconds := EXTRACT(EPOCH FROM (now() - p1.queued_at));

      -- Expanding tolerance window
      tolerance := CASE
        WHEN wait_seconds < 10  THEN 50
        WHEN wait_seconds < 20  THEN 75
        WHEN wait_seconds < 30  THEN 100
        WHEN wait_seconds < 40  THEN 125
        ELSE 150
      END;

      -- Find closest-Elo opponent within tolerance (excluding self)
      SELECT player_id, elo, queued_at INTO p2
      FROM matchmaking_queue
      WHERE player_id <> p1.player_id
        AND elo BETWEEN (p1.elo - tolerance) AND (p1.elo + tolerance)
      ORDER BY abs(elo - p1.elo) ASC, queued_at ASC
      LIMIT 1;

      IF p2.player_id IS NOT NULL THEN
        -- Remove both from queue
        DELETE FROM matchmaking_queue WHERE player_id IN (p1.player_id, p2.player_id);

        -- Generate a room code
        new_room := generate_room_code();

        -- Create match row
        INSERT INTO matches (
          player1_id, player2_id, is_ai_match, mode,
          pool_seed, base_weapon_id, base_armor_id,
          room_code, status, version
        ) VALUES (
          p1.player_id, p2.player_id, false, 'ranked',
          floor(random() * 2147483647)::bigint, 'sword', 'leather',
          new_room, 'active', 0
        )
        RETURNING id INTO new_match_id;

        -- Notify listeners
        PERFORM pg_notify('matchmaker',
          json_build_object(
            'match_id', new_match_id,
            'player1_id', p1.player_id,
            'player2_id', p2.player_id,
            'room_code', new_room
          )::text
        );
      END IF;
    END LOOP;

    -- Sleep 3 seconds between iterations (except after last)
    IF iteration < 19 THEN
      PERFORM pg_sleep(3);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 5. cleanup_stale_data() function
-- =============================================================

CREATE OR REPLACE FUNCTION cleanup_stale_data()
RETURNS void AS $$
BEGIN
  -- Expire unclaimed room codes past their TTL
  UPDATE matches
  SET status = 'abandoned'
  WHERE status = 'waiting'
    AND room_code_expires_at IS NOT NULL
    AND room_code_expires_at < now();

  -- Clean old join_attempts (older than 5 minutes)
  DELETE FROM join_attempts
  WHERE attempted_at < now() - INTERVAL '5 minutes';

  -- Clean stale matchmaking_queue entries (older than 5 minutes)
  DELETE FROM matchmaking_queue
  WHERE queued_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 6. pg_cron scheduling (safe for environments without pg_cron)
-- =============================================================

DO $$
BEGIN
  -- Schedule run_matchmaker every minute
  PERFORM cron.schedule('run_matchmaker', '* * * * *', 'SELECT run_matchmaker()');

  -- Schedule cleanup_stale_data every minute
  PERFORM cron.schedule('cleanup_stale_data', '* * * * *', 'SELECT cleanup_stale_data()');
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available — skipping cron job scheduling';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron jobs: %', SQLERRM;
END;
$$;
