-- 003: Progression — mastery tracks, unlocks

CREATE TABLE mastery_tracks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  max_level INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE player_mastery (
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES mastery_tracks(id),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, track_id)
);

CREATE TABLE unlocks (
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unlock_type TEXT NOT NULL,    -- 'weapon', 'armor', 'cosmetic', etc.
  unlock_key TEXT NOT NULL,     -- specific item/cosmetic ID
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, unlock_type, unlock_key)
);

-- Matchmaking queue
CREATE TABLE matchmaking_queue (
  player_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  elo INTEGER NOT NULL,
  rank_tier TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matchmaking_elo ON matchmaking_queue(elo);
CREATE INDEX idx_matchmaking_queued ON matchmaking_queue(queued_at);
