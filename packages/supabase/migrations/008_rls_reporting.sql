-- 008: Enable RLS on unprotected tables

ALTER TABLE game_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_round_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_attempts ENABLE ROW LEVEL SECURITY;

-- Seasons: any authenticated user can read
CREATE POLICY "seasons_read" ON seasons FOR SELECT TO authenticated USING (true);

-- join_attempts: add player_id column for RLS (was IP-only before)
ALTER TABLE join_attempts ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES auth.users(id);

CREATE POLICY "join_attempts_own" ON join_attempts FOR SELECT TO authenticated USING (auth.uid() = player_id);
CREATE POLICY "join_attempts_insert_own" ON join_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);
