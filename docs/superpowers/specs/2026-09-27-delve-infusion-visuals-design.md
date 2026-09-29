# Delve Infusion Visuals Design

**Date:** 2026-09-27
**Status:** Built in v0.42.0; floor-mark and growth fixes in v0.42.1. Basic-attack infusion (`HeroStatsExtra.basicInfusion`, the Training picker rules, the finisher's ring) is superseded by `2026-09-27-delve-elemental-affinity-design.md` (v0.43.0): basics now take the hero's pair.

**Engine:** `packages/engine/src/`
- `types/arpg.ts`, `types/delve.ts`
- `arpg/basic.ts`, `arpg/combat.ts`, `arpg/abilities/impact.ts`, `arpg/abilities/forms.ts`, `arpg/step.ts`
- `delve/hero-stats.ts`

**Client:** `packages/client/src/features/delve/`
- `arena/fx/infusion.ts` (new), `arena/fx/mana-fx.ts`, `arena/fx/draw-world.ts`, `arena/ArenaRenderer.ts`
- `arena/pixel/world.ts`, `arena/pixel/render.ts`, `arena/pixel/arena-effects.ts`, `arena/pixel/floor-engine.ts`
- `training/TrainingPanel.tsx`, `stores/sandboxStore.ts`

**Follow-up:** "Elemental affinity" (project B) is a separate spec. It decides where a basic attack's second element comes from in real play, and what the finisher discharge does mechanically. This spec only draws infusions.

## Goal

When a spell mixes two mana types, you can see the mix:
- a Fire Bolt infused with storm crackles with lightning;
- a Frost Lance infused with nature sprouts creeping plant growth;
- and so on for every pair on every form.

Basic attacks draw their infusion the same way whenever the weapon carries one.

## Decisions

| Question | Decision |
|---|---|
| What shows a motif | **The infusion only.** A spell's first element stays its body (today's colour and look, including the orb core tinted by the second element). The second element adds its motif. Single-element spells look as they do now, so combined ones stand out. |
| Fusions | **Motifs combine.** Each element has one motif, drawn in three shapes. Any pair works on any form. Named fusions get no bespoke looks. |
| Ground | **Infusions mark the pixel floor.** Where an infused line or blast passes, the floor gets a mark of the infusion element. |
| Basic attacks | **Drawn now, mechanic later.** Basic swings and shots draw the weapon's infusion when it has one. In real play no weapon has one until project B. The Training Grounds gets a visual preview picker. |

## Engine (display data only; no rule changes)

- **Ability events.** `beam`, `slash`, `explode` and `dash` gain `infusion: ManaType | null`:
  - **From an ability:** `impact`, Lance, Strike and Blink use `ab.elements[1] ?? null`. A tick impact (zone ticks, Pyroclasm embers) uses `null`, so embers don't draw infused rings: `infusion = o.tick ? null : ab.elements[1] ?? null`.
  - **From a basic burst:** the staff great orb's `burstShot` uses the weapon's infusion.
  - **Always `null`:** monster slams, and the reaction and power explosions (Overload, Combust, Crystallize, Hellfire Brand).
- **Weapon infusion.**
  - `HeroWeapon` gains `infusion: ManaType | null`. It is `null` in real play for now; project B will fill it.
  - `HeroStatsExtra` gains `basicInfusion?: ManaType` for the Training Grounds preview. It is ignored when it equals the weapon's element, or when unarmed.
  - It changes nothing about how basic attacks hit.
- **Nothing new elsewhere.** Projectiles, zones and the hero's Defensive already carry what the client needs:
  - an ability shot's `p.ability.elements[1]`;
  - basic shots (`owner === 'hero' && !p.ability`) use `hero.stats.weapon.infusion`;
  - embers (`form === 'ember'`) have none;
  - `zone.ability.elements[1]`;
  - `hero.abilities[1].elements[1]`.
  - The `basic` event gets its infusion from `hero.stats.weapon.infusion` in the renderer. No new fields are needed there.

## The six motifs (`fx/infusion.ts`)

`drawInfusion(layers, element, shape, time, seed, strength, budget)` draws one element's motif for one carrier.

- **Layers:** `layers` is `{ air, ground? }`, the existing pixel layers. Callers pass `ground` only for carriers that sit on the ground (blasts, zones, blink trails). Its absence is how a motif knows it is on an air carrier (orbs, auras, beams, sweeps).
- **Shapes:**
  - `orb` `{ x, y, r, vx, vy }`: a moving ball.
  - `path` `{ points, width, progress }`: a beam, a sweep sampled along its arc, or a blink trail. `progress` runs 0–1 as the carrier grows and fades.
  - `ring` `{ x, y, r }`: a blast, a zone rim or an aura.
- **Strength:** 0–1.5, with finisher discharges drawing at 1.5. It scales:
  - the motif's element count, `round(base × strength)`;
  - its alpha, `min(1, strength)`;
  - its reach, `× (0.8 + 0.2 × strength)`.
  Carriers pass their fade (0–1) as strength.

| Element | Orb | Path | Ring |
|---|---|---|---|
| Storm | 2–3 jagged arcs crackling off the ball, re-rolled about 15 times a second | arcs forking off the path every ~1.2 units | arcs zig-zagging around the rim |
| Nature | leaf sprigs and a short curling vine trailing behind | tendrils sprouting sideways from just past the path's edge, all in full green, and curling as `progress` rises | roots and vines creeping outward from the rim, with sprouts |
| Frost | 3 ice shards orbiting, with a rime trail | crystal spikes growing from both edges | ice spikes ringing the rim, with glints |
| Fire | flames licking up from the ball, with embers | flames flickering up along the path | flame tongues around the rim, with rising embers |
| Earth | 3–4 pebbles orbiting | rubble chunks kicked up along the path | rocks thrown outward, and a cracked rim |
| Shadow | dark wisps trailing | smoke tendrils curling off the path | wisps rising while void motes are pulled inward |

- **Style:** every motif is made of pixels on the sprites' 0.1-unit grid, using the `mana-pixels.ts` helpers and the element's palette, lighter and darker.
  - Earth's pebbles and rubble use light stone tones so they read on the additive layer.
- **Layers:** the air layer is additive and sits above the sprites; the ground layer is normal-blend and sits under them.
  - Motifs for air carriers (orbs, auras, beams, sweeps) draw on the air layer. Shadow's smoke and wisps there use the shadow palette's purples, not black.
  - Dark shapes (shadow's dark smoke, earth's cracks) draw on the ground layer, and only when `layers.ground` is given, which callers do only for blasts, zones and blink trails.
- **Determinism:** motifs take their randomness from `seed` and `time` through the existing `hash`, so they are stable per carrier and don't shimmer. `Math.random` is not used.
  - Persistent carriers seed from the entity's id; the hero's auras seed from the slot.
  - Transient carriers are seeded when created, from `hash(x, y, t)` of their event.
- **Budget:** `budget` is a per-frame object `{ left: 600 }`, reset each frame in `ArenaRenderer.update`. A motif estimates its element count first:
  - it draws in full if that fits;
  - it draws thinned (its first half: the golden slots' most even half) if half fits;
  - otherwise it skips;
  - and it subtracts what it drew.
  - **Priority** is the order of the infusion pass, which runs after all other drawing. Transient effects come first (finisher discharges, blasts, beams and sweeps, blink trails), then the hero's auras, projectiles, lobs, and zones last.

## Carriers

| Carrier | Shape | Source | How long |
|---|---|---|---|
| Ability projectiles (Bolt, Volley darts) | orb | world, `p.ability.elements[1]` | while in flight |
| Basic shots | orb | world, the weapon's infusion | while in flight |
| Thrown Burst | orb along its arc | world, the burst zone's ability | while in flight |
| Lance | path | the `Beam` entry in `ManaFx` (it gains `infusion` and `seed`) | the beam's life (`progress` = its grow and fade) |
| Strike, and basic melee swings | path along the swept arc | the `Swing` entry in `ManaFx` (it gains `infusion` and `seed`) | the swing's life |
| Blink trail | path, width 0.4 | a transient entry from the `dash` event | 0.4 s |
| Blasts (Bolt, Burst, Volley-dart and Barrage impacts, Nova, the staff's great orb) | ring | a transient entry from the `explode` event | 0.45 s |
| Maelstrom and fusion ground | ring at the zone rim | world, `zone.ability.elements[1]` | while the zone lasts |
| Ward, Armor, Surge and Blink on the hero | ring around the hero (radius 1) | world, the Defensive's second element | while the buff lasts |
| Basic melee finisher with an infusion | ring, strength 1.5 | a transient entry from the `basic` event with `finisher` | 0.45 s |

- **Finisher ring placement:** a melee finisher narrower than 360° rings the tip (`x + dir × reach`). A 360° finisher (the axe spin, the maul slam) rings the hero with `r = reach`. Ranged finishers draw no extra ring: the shot's orb and any burst carry the infusion. (Superseded by the elemental affinity spec: a ranged finisher now flares at the hand, and its orb and burst carry no motif.)
- **`ManaFx` changes:**
  - `ManaFx.draw(layers, dt, time, budget)` takes the layers and the frame's budget instead of one Graphics. It draws the first-priority transient motifs, passing `ground` only for its blast and blink-trail entries.
  - `swing()` and `beam()` accept an optional `infusion`.
  - A new `infusions` list holds the other transient carriers (dash, blast, finisher).
  - `clear()` empties it.

## Ground marks (pixel floor)

Where an infused path or blast passes, the floor gets a mark of the infusion element. Marks are cosmetic and never feed back into play. They keep each brush's own persistence: fire scorch and earth rubble linger as those brushes always do, and frost melts.

- **Which events reach the floor:** `floor-engine.ts` adds `'beam'` and `'slash'` to `FLOOR_EVENTS`, so infused ones reach the worker (`dash` and `explode` already do); an uninfused lance or slash does nothing there, so it isn't posted. Basic swings don't mark the floor, because they are too frequent.
- **Stamps per element** (radius in floor cells):

  | Element | Stamp |
  |---|---|
  | Nature | the new growth brush, r 3 |
  | Frost | `frostBlast(x, y, 2)` |
  | Fire | `fireBlast(x, y, 2)` |
  | Storm | `stormArc` along the stamp points (one call per event) |
  | Earth | `earthImpact(x, y, 2)` |
  | Shadow | `shadowBlast(x, y, 2)` |

- **Paths:** stamps are spaced evenly along the path, one per 5 cells, and at most 8 per event (spread evenly, never cut off; each stamp is a full brush with its own burst, and 12 per lance kept too many floor particles alive). A 360° slam spaces its stamps all the way round, never twice in one place. A slash is sampled along its arc from `x, y, dir, range, arc`. A Lance leaves out the stamp at its start, under the hero's feet (every cast would pile one there); a blink trail keeps its.
- **Blasts:** stamps evenly around the rim at the blast's radius, spaced like a path's (one per 5 cells of rim: 4 on the smallest blast, at most 8), applied after the body's own blast brush, so the body keeps its core and the infusion marks the edge.
- **Soft cap:** every brush but nature's spawns particles, so no stamp is applied while the floor holds more than half its `MAX_PARTICLES` (7,000). Infused Volley and Barrage spam otherwise pinned the floor at its cap, where it drops weather, hit sparks, splashes and death bursts.
- **Growth brush:** `pixel/world.ts` and `pixel/render.ts` gain two per-cell fields, `growth` (what is drawn, 0–1) and `growthTarget` (0–1):
  - A stamp sets `growthTarget = 1.5` within its radius.
  - Each step, `stepFields` moves `growth` toward `min(1, growthTarget)` by 1/15 per step (about 0.5 s at 1/30 s steps) and decays `growthTarget` linearly by 1/88 per step. So a stamped cell grows in, holds full grown while the target is above 1 (about 1 s once grown, 1.5 s from the stamp), and fades as the target falls to 0 (about 3 s).
  - It is drawn as vine and leaf pixels in the theme's `grass` and `bush` colours, pushed greener.
  - It never spreads or burns.

## Training Grounds preview

- **Picker:** the Loadout tab gains **Basic infusion**: None, or an element other than the weapon's.
  - **Weapon's element:** its chip is disabled, and the store setter also ignores it.
  - **Unarmed:** the picker is disabled.
  - **Label:** "Preview: in the Delve, basic attacks will gain a second element through elemental affinity."
- **Store:**
  - `basicInfusion: ManaType | null`, saved, Zod `.catch(null)`, default `null` in `SANDBOX_DEFAULTS`;
  - passed through `StatsInput` to `extra.basicInfusion`;
  - included in the `useSandboxStats` memo dependencies, so the hot-swap fires;
  - `loadMyBuild` clears it.
- **Rules:** unchanged, as in real play. The picker only changes what's drawn.

## Testing

Engine:
- `beam`, `slash`, `explode` and `dash` events from a two-element ability carry its second element. From a one-element ability they carry `null`.
- A tick impact's `explode` (an ember) carries `null`, as do monster slams and Overload, Combust and Hellfire explodes.
- With `extra.basicInfusion`, `stats.weapon.infusion` is set and a staff great orb's `explode` carries it. It is `null` without the extra, when unarmed, or when the extra equals the weapon's element.
- Hits are unchanged.

Client:
- `drawInfusion`, for each element × shape into recording Graphics:
  - it draws pixels;
  - it stays within the shape's bounds plus 1.0 unit;
  - it is the same for the same seed and time;
  - dark shapes appear only on the ground layer, and only for ground carriers;
  - strength scales the element count;
  - the budget thins, then skips.
- `ManaFx` keeps and expires infused swings, beams and transient entries, and `clear()` empties them.
- `applyArenaEvent` stamps the right brush for each infusion element on paths (evenly, at most 8) and blast rims. It stamps nothing for `null`.
- `FLOOR_EVENTS` includes `beam` and `slash`, and only infused ones are posted.
- Past half the particle cap, no stamp but nature's is applied.
- The growth fields: a stamped cell's `growth` rises over about 15 steps, holds at 1 until about step 45, then falls to 0 within about 135 steps; an unstamped cell stays 0.
- The Basic infusion picker writes the store, disables the weapon's element, and is disabled when unarmed.

Screenshots: a Training Grounds pass (Fire Bolt + storm, Frost Lance + nature, Strike + earth, Ward + shadow, Maelstrom + fire, an infused basic melee finisher), looked at and tuned.

The dive and Training E2E must pass unchanged.

## Delivery

Shipped as **v0.42.0**. The CLAUDE.md Mana-pixel FX bullet gains a line on infusion motifs.

## Out of scope

- Motifs on single-element spells.
- Bespoke looks for named fusions.
- Routing nature-bodied blasts to the growth brush.
- Where basic attacks' second element comes from, and the finisher discharge's mechanics (project B, "Elemental affinity").
