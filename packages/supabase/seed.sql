-- Seed data for development

-- Insert first season
INSERT INTO seasons (name, starts_at, ends_at, is_active)
VALUES ('Season 1: The Forge Awakens', '2026-03-01', '2026-06-01', true);

-- Insert mastery tracks
INSERT INTO mastery_tracks (name, description, max_level) VALUES
  ('Fire Mastery', 'Mastery of fire-element affixes and combinations', 10),
  ('Cold Mastery', 'Mastery of cold-element affixes and combinations', 10),
  ('Lightning Mastery', 'Mastery of lightning-element affixes and combinations', 10),
  ('Poison Mastery', 'Mastery of poison-element affixes and combinations', 10),
  ('Shadow Mastery', 'Mastery of shadow-element affixes and combinations', 10),
  ('Chaos Mastery', 'Mastery of chaos-element affixes and combinations', 10),
  ('Physical Mastery', 'Mastery of physical damage affixes', 10),
  ('Forging Mastery', 'Mastery of combinations and synergies', 10),
  ('Defensive Mastery', 'Mastery of defensive affixes and builds', 10),
  ('Adaptation Mastery', 'Mastery of between-round adaptation', 10);
