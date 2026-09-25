# Delve Mana-Pixel Effects Design

**Date:** 2026-09-26
**Status:** Built in v0.38.0.
**Client only:** `packages/client/src/features/delve/arena/fx/` and `ArenaRenderer.ts`.

## Goal

Ability and combat effects look like they are made of mana, and mana is pixels. The edges of shields, zones and blasts are living pixels at the same density as the sprites and the floor (10 per arena unit), not smooth vector circles. Casting and attacking read clearly: swipes, flings of energy, pixels gathering during wind-ups, and a small lunge of the sprite.

## Decisions

| Question | Decision |
|---|---|
| Scope | All combat effects: auras, zones, blasts and rings, projectiles and trails, beams, chains, swings, wind-ups, the aim marker, monster telegraphs and status marks. Damage numbers, the HUD and drop labels stay crisp. |
| Character | Energy effects plus a small body motion. The sprite lunges or recoils by whole pixels; no new art. |
| Monsters | The same pixel language, in hostile red. |

## How

- **`PixelLayer`**: a Pixi `Graphics` in world units, rendered each frame into a `RenderTexture` at 10 px/unit (no antialiasing, nearest scaling).
  - It covers the visible view, with its origin snapped to the 0.1-unit grid so pixels line up with the floor and never shimmer.
  - It is shown as a sprite in world space at scale 0.1.
  - There are two layers:
    - **ground** (under the characters, normal blend): zones, telegraphs, the hero's footing ring, elite and boss rings;
    - **air** (over the characters, additive blend so mana glows): auras, projectiles, swings, bursts, beams, chains, status marks, the aim marker.
- **`mana-pixels.ts`** (the vocabulary). All helpers are in world units, and every pixel is a 0.1 × 0.1 square snapped to the grid.
  - `manaRing`: twinkling pixels around a circle, with optional moving gaps and 1-pixel jitter.
  - `manaDust`: sparse glittering pixels inside a disc, capped per frame.
  - `manaMotes`: pixels orbiting with short fading trails.
  - `manaArc` and `manaLine`: pixels stepped along an arc or a segment.
  - `ringPoints`, `lungeOffset`, `hash`: pure and tested.
- **`ManaFx`** (short-lived effects, moved out of `ArenaRenderer`): pixel particles (bursts, sparks), expanding rings, bolts (chains, dashes), swings, beams, plus:
  - **fling**: a cone of mana pixels from the hero toward the target;
  - **gather**: pixels spiralling inward during a cast wind-up;
  - **lunge**: the sprite steps toward (or back from) the target by whole pixels, easing over about 0.14 s.
- **`draw-world.ts`** (state-driven effects each frame):
  - zones: Maelstrom swirling motes, lingering ground dust with a twinkling edge;
  - Barrage impacts as a filling pixel target;
  - monster telegraphs: red rings filling with dust, a charger lane as pixel dashes, a ranged sightline as a dotted line;
  - auras:
    - Ward: an orbiting pixel shell that thins as it takes damage;
    - Armor: rotating plates of pixels;
    - Surge: fast motes;
  - the wind-up progress arc;
  - projectiles as pixel orbs with pixel trails;
  - status marks on monsters: hex motes, shock crackle, frost dust, stagger stars, brand pixel;
  - elite and boss rings;
  - the aim marker.

## Casting polish

| Event | Effect |
|---|---|
| Melee basic | Pixel swipe arc with sparks at its tip; lunge 2 px toward the target. |
| Ranged basic | A small fling toward the target; recoil 1 px. |
| Cast (aimed forms) | A fling in the element's colour; lunge 1 px. |
| Cast (self forms: Nova, the defensives) | A burst of motes outward. |
| Wind-up | Gathering pixels plus a filling arc. |
| Dodge | A pixel streak. |
| PERFECT | A gold pixel burst. |

## Testing

- **Unit tests** for the pure helpers: snapping, ring points (count and on-circle), the lunge curve (whole pixels, zero at both ends, peak at the middle), hash determinism and range, and the dust cap.
- **Screenshots** of the arena with each defensive and a fight in progress, checked by eye.
- **Existing E2E** must pass.
