-- 009: Atomic Elo update function
-- Replaces the read-then-write pattern in forge-submit with a single atomic UPDATE.

CREATE OR REPLACE FUNCTION update_elo(p_player_id UUID, p_elo_delta INT, p_won BOOLEAN) RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET
    elo = GREATEST(0, elo + p_elo_delta),
    matches_played = matches_played + 1,
    matches_won = matches_won + CASE WHEN p_won THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
