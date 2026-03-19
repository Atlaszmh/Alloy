-- Game config versions
CREATE TABLE game_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  config jsonb NOT NULL,
  parent_id uuid REFERENCES game_configs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_game_configs_parent ON game_configs(parent_id);

-- Simulation runs
CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES game_configs(id),
  match_count int NOT NULL,
  ai_tiers int[] NOT NULL,
  seed_start int NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'cancelled', 'failed')),
  progress float NOT NULL DEFAULT 0.0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_simulation_runs_config ON simulation_runs(config_id, status);

-- Unified match results (simulation + live)
CREATE TABLE match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES simulation_runs(id),
  config_id uuid REFERENCES game_configs(id),
  source text NOT NULL CHECK (source IN ('simulation', 'live')),
  seed int,
  winner int,
  rounds int NOT NULL,
  duration_ms float NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_results_run ON match_results(run_id);
CREATE INDEX idx_match_results_config ON match_results(config_id);
CREATE INDEX idx_match_results_source ON match_results(source);

-- Per-player stats for each match
CREATE TABLE match_player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  player_index int NOT NULL CHECK (player_index IN (0, 1)),
  ai_tier int,
  user_id uuid REFERENCES auth.users(id),
  final_hp float NOT NULL,
  affix_ids text[] NOT NULL DEFAULT '{}',
  combination_ids text[] NOT NULL DEFAULT '{}',
  synergy_ids text[] NOT NULL DEFAULT '{}',
  loadout jsonb NOT NULL
);

CREATE INDEX idx_match_player_stats_match ON match_player_stats(match_id);

-- Per-round details
CREATE TABLE match_round_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  round int NOT NULL,
  winner int NOT NULL CHECK (winner IN (0, 1)),
  duration_ticks int NOT NULL,
  p0_hp_final float NOT NULL,
  p1_hp_final float NOT NULL,
  p0_damage_dealt float NOT NULL,
  p1_damage_dealt float NOT NULL,
  combat_log jsonb
);

CREATE INDEX idx_match_round_details_match ON match_round_details(match_id);

-- Aggregate function for affix win stats
CREATE OR REPLACE FUNCTION affix_win_stats(p_run_id uuid)
RETURNS TABLE(affix_id text, pick_count bigint, win_count bigint) AS $$
  SELECT a.affix_id, COUNT(*) as pick_count,
         COUNT(*) FILTER (WHERE mr.winner = mps.player_index) as win_count
  FROM match_player_stats mps
  CROSS JOIN LATERAL unnest(mps.affix_ids) AS a(affix_id)
  JOIN match_results mr ON mr.id = mps.match_id
  WHERE (p_run_id IS NULL OR mr.run_id = p_run_id)
  GROUP BY a.affix_id
$$ LANGUAGE sql;
