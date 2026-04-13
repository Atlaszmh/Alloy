-- 011_run_tables.sql
-- Tables for the single-player "run" mode: runs, per-round results,
-- async matchmaking queue, and discovery tracking.

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id),
  round INTEGER NOT NULL DEFAULT 1,
  lives INTEGER NOT NULL DEFAULT 3,
  starting_lives INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  total_wins INTEGER NOT NULL DEFAULT 0,
  total_losses INTEGER NOT NULL DEFAULT 0,
  consecutive_wins INTEGER NOT NULL DEFAULT 0,
  goal_round INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Run rounds table (per-round results)
CREATE TABLE IF NOT EXISTS run_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  payload_json JSONB NOT NULL,
  opponent_payload_json JSONB,
  duel_result JSONB,
  lives_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, round_number)
);

-- Payload queue for async matchmaking
CREATE TABLE IF NOT EXISTS payload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  payload_json JSONB NOT NULL,
  run_round INTEGER NOT NULL,
  power_bracket INTEGER NOT NULL,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discoveries tracking
CREATE TABLE IF NOT EXISTS discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL,
  round_discovered INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, recipe_id)
);

-- Indexes for matchmaking queries
CREATE INDEX IF NOT EXISTS idx_payload_queue_matching
  ON payload_queue (power_bracket, run_round)
  WHERE matched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_runs_active
  ON runs (player_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_run_rounds_run
  ON run_rounds (run_id, round_number);

-- RLS policies
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payload_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own runs" ON runs FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "Users can insert own runs" ON runs FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Users can update own runs" ON runs FOR UPDATE USING (auth.uid() = player_id);

CREATE POLICY "Users can view own run_rounds" ON run_rounds FOR SELECT
  USING (run_id IN (SELECT id FROM runs WHERE player_id = auth.uid()));
CREATE POLICY "Users can insert own run_rounds" ON run_rounds FOR INSERT
  WITH CHECK (run_id IN (SELECT id FROM runs WHERE player_id = auth.uid()));

CREATE POLICY "Users can manage own payload_queue" ON payload_queue FOR ALL
  USING (player_id = auth.uid());

CREATE POLICY "Users can view own discoveries" ON discoveries FOR SELECT
  USING (run_id IN (SELECT id FROM runs WHERE player_id = auth.uid()));
CREATE POLICY "Users can insert own discoveries" ON discoveries FOR INSERT
  WITH CHECK (run_id IN (SELECT id FROM runs WHERE player_id = auth.uid()));
