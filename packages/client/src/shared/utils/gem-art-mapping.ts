// Placeholder gem art mapping — assigns sprite-sheet icons to affixes by color.
// Each affix is matched to a gem image whose dominant color best fits the
// affix's element theme.  Different visual styles (round, square, faceted,
// teardrop) are used across categories for variety.
//
// This is temporary placeholder art for testing.

import { registerAllGemArt } from './art-registry';

const GEM_ART: Record<string, string> = {
  // ── Elemental damage (use faceted style for offensive elemental) ───────
  fire_damage:      '/assets/gems/faceted/faceted_04_06.png',  // orange-red
  cold_damage:      '/assets/gems/teardrop/teardrop_06_00.png', // ice blue
  lightning_damage:  '/assets/gems/square/square_05_04.png',    // bright yellow
  poison_damage:    '/assets/gems/teardrop/teardrop_03_06.png', // green
  shadow_damage:    '/assets/gems/teardrop/teardrop_05_05.png', // deep purple
  chaos_damage:     '/assets/gems/teardrop/teardrop_00_07.png', // magenta/pink

  // ── Physical / neutral offense ────────────────────────────────────────
  flat_physical:    '/assets/gems/round/round_01_06.png',       // silver/white
  crit_chance:      '/assets/gems/faceted/faceted_01_01.png',   // red (aggressive)
  crit_damage:      '/assets/gems/faceted/faceted_03_05.png',   // dark red
  attack_speed:     '/assets/gems/round/round_02_03.png',       // bright yellow
  armor_penetration:    '/assets/gems/faceted/faceted_06_03.png', // orange
  elemental_penetration: '/assets/gems/faceted/faceted_07_08.png', // warm orange

  // ── Defensive (use square style — sturdy look) ────────────────────────
  flat_hp:          '/assets/gems/square/square_05_00.png',     // green (life)
  armor_rating:     '/assets/gems/round/round_03_05.png',       // pale silver
  block_chance:     '/assets/gems/round/round_02_06.png',       // ice/steel
  dodge_chance:     '/assets/gems/square/square_05_03.png',     // yellow-green
  barrier:          '/assets/gems/teardrop/teardrop_04_05.png', // blue (magic shield)
  hp_regen:         '/assets/gems/faceted/faceted_05_09.png',   // green
  damage_reduction: '/assets/gems/square/square_06_04.png',     // gray/neutral
  fortify:          '/assets/gems/square/square_03_03.png',     // dark green

  // ── Sustain (use round style) ─────────────────────────────────────────
  lifesteal:        '/assets/gems/round/round_00_01.png',       // blood red
  thorns:           '/assets/gems/round/round_02_01.png',       // orange (reactive)
  life_on_kill:     '/assets/gems/round/round_00_00.png',       // dark red

  // ── Utility (use teardrop style) ──────────────────────────────────────
  initiative:       '/assets/gems/teardrop/teardrop_00_02.png', // amber/yellow
  dot_multiplier:   '/assets/gems/round/round_02_02.png',       // deep orange
  stun_chance:      '/assets/gems/round/round_01_05.png',       // golden yellow
  slow_on_hit:      '/assets/gems/teardrop/teardrop_02_05.png', // blue

  // ── Trigger (use faceted style) ───────────────────────────────────────
  chance_on_hit:        '/assets/gems/faceted/faceted_07_09.png', // pink/chaos
  chance_on_taking_damage: '/assets/gems/faceted/faceted_06_07.png', // gray
  chance_on_crit:       '/assets/gems/round/round_05_03.png',    // yellow-green
  chance_on_block:      '/assets/gems/square/square_03_04.png',  // teal green
  chance_on_kill:       '/assets/gems/teardrop/teardrop_01_05.png', // dark pink
  chance_on_low_hp:     '/assets/gems/teardrop/teardrop_00_06.png', // magenta
};

export function initGemArt(): void {
  registerAllGemArt(GEM_ART);
}
