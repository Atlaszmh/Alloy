-- 005: Row Level Security policies

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Profiles: read any, update own
CREATE POLICY profiles_read ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- Matches: read own matches
CREATE POLICY matches_read ON matches FOR SELECT
  USING (player1_id = auth.uid() OR player2_id = auth.uid() OR is_ai_match = true);

-- Match rounds: read own
CREATE POLICY rounds_read ON match_rounds FOR SELECT
  USING (match_id IN (
    SELECT id FROM matches
    WHERE player1_id = auth.uid() OR player2_id = auth.uid()
  ));

-- Mastery/unlocks: own only
CREATE POLICY mastery_read ON player_mastery FOR SELECT USING (player_id = auth.uid());
CREATE POLICY mastery_insert ON player_mastery FOR INSERT WITH CHECK (player_id = auth.uid());
CREATE POLICY unlocks_read ON unlocks FOR SELECT USING (player_id = auth.uid());

-- Queue: insert/delete own
CREATE POLICY queue_insert ON matchmaking_queue FOR INSERT WITH CHECK (player_id = auth.uid());
CREATE POLICY queue_delete ON matchmaking_queue FOR DELETE USING (player_id = auth.uid());
CREATE POLICY queue_read ON matchmaking_queue FOR SELECT USING (player_id = auth.uid());
