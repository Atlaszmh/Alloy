-- 004: Leaderboard materialized view

CREATE MATERIALIZED VIEW leaderboard AS
  SELECT
    id,
    display_name,
    elo,
    rank_tier,
    matches_played,
    matches_won,
    ROW_NUMBER() OVER (ORDER BY elo DESC) AS position
  FROM profiles
  WHERE matches_played >= 10
  ORDER BY elo DESC
  LIMIT 500;

CREATE UNIQUE INDEX idx_leaderboard_position ON leaderboard(position);

-- Refresh schedule: run via pg_cron every 5 minutes
-- SELECT cron.schedule('refresh-leaderboard', '*/5 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard');
