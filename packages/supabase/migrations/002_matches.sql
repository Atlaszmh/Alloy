-- 002: Matches and match rounds

CREATE TABLE seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false
);

CREATE TYPE match_phase AS ENUM ('draft', 'forge', 'duel', 'adapt', 'complete');
CREATE TYPE match_result AS ENUM ('player1_win', 'player2_win', 'draw', 'forfeit');

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES profiles(id),
  player2_id UUID REFERENCES profiles(id),        -- NULL for AI matches
  is_ai_match BOOLEAN NOT NULL DEFAULT false,
  ai_difficulty INTEGER CHECK (ai_difficulty BETWEEN 1 AND 5),
  mode TEXT NOT NULL DEFAULT 'quick' CHECK (mode IN ('quick', 'unranked', 'ranked')),
  season_id INTEGER REFERENCES seasons(id),
  phase match_phase NOT NULL DEFAULT 'draft',
  round INTEGER NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 3),
  scores JSONB NOT NULL DEFAULT '[0, 0]',
  pool_seed BIGINT NOT NULL,
  base_weapon_id TEXT NOT NULL,
  base_armor_id TEXT NOT NULL,
  result match_result,
  elo_delta INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE match_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 3),
  draft_picks JSONB,           -- [{player: 0|1, orbUid, order}]
  player1_build JSONB,         -- Forge result (hidden until duel)
  player2_build JSONB,
  duel_event_log JSONB,        -- CombatLog
  duel_winner INTEGER CHECK (duel_winner IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, round)
);

-- Indexes
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_matches_created ON matches(created_at DESC);
CREATE INDEX idx_match_rounds_match ON match_rounds(match_id);
