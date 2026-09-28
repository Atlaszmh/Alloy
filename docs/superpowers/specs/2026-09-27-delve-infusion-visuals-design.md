# Delve Infusion Visuals Design

**Date:** 2026-09-27
**Status:** Approved in conversation.

**Engine:** `packages/engine/src/`
- `types/arpg.ts`, `types/delve.ts`
- `arpg/basic.ts`, `arpg/abilities/impact.ts`, `arpg/abilities/forms.ts`, `arpg/abilities/cast.ts`
- `delve/hero-stats.ts`

**Client:** `packages/client/src/features/delve/`
- `arena/fx/infusion.ts` (new)
- `arena/fx/mana-fx.ts`, `arena/fx/draw-world.ts`, `arena/ArenaRenderer.ts`
- `arena/pixel/world.ts`, `arena/pixel/arena-effects.ts`
- `training/TrainingPanel.tsx`, `stores/sandboxStore.ts`

**Follow-up:** "Elemental affinity" (project B) is a separate spec. It decides where a basic attack's second element comes from in real play, and what the finisher discharge does mechanically. This spec only draws infusions.

## Goal

When a spell mixes two mana types, you can see the mix:
- a Fire Bolt infused with storm crackles with lightning;
- a Frost Lance infused with nature sprouts creeping plant growth;
- and so on for every pair on every form.

Basic attacks draw their infusion the same way whenever a hit carries one.

## Decisions

| Question | Decision |
|---|---|
| What shows a motif | **The infusion only.** A spell's first element stays its body (today's colour and look). The second element adds its motif. Single-element spells look as they do now, so combined ones stand out. |
| Fusions | **Motifs combine.** Each element has one motif, drawn in three shapes. Any pair works on any form. Named fusions get no bespoke looks. |
| Ground | **Infusions mark the pixel floor.** Where an infused line or blast passes, the floor gets a brief mark of the infusion element. |
| Basic attacks | **Drawn now, mechanic later.** Basic swings, shots and bursts draw their infusion when a hit carries one. In real play no weapon has one until project B. The Training Grounds gets a visual preview picker. |

## Engine (display data only; no rule changes)

- **Ability events.** `beam`, `slash`, `explode`, `dash` and `cast` gain `infusion: ManaType | null`, the ability's second element (`ab.elements[1] ?? null`).
  - `explode` gets it from the ability that landed (`impact`), or from the shot for a basic burst.
  - It is `null` for monster slams.
- **Basic events.** `basic` gains `infusion: ManaType | null`, from the weapon.
- **Projectiles.** `Projectile` gains `infusion: ManaType | null`:
  - ability shots use the ability's second element;
  - basic shots use the weapon's infusion;
  - monster shots and embers use `null`.
- **Zones and the hero's Defensive.** They already carry their ability (`zone.ability`, `h.abilities[1]`), so the client reads `elements[1]` directly.
- **Weapon infusion.**
  - `HeroWeapon` gains `infusion: ManaType | null`. It is `null` in real play for now; project B will fill it.
  - `HeroStatsExtra` gains `basicInfusion?: ManaType` for the Training Grounds preview. It is ignored when it equals the weapon's element.
  - It changes nothing about how basic attacks hit. It only rides on the events and shots.

## The six motifs (`fx/infusion.ts`)

`drawInfusion(layers, element, shape, time, seed, strength)` draws one element's motif for one carrier.

- **Layers:** `layers` is `{ air, ground }`, the existing pixel layers.
- **Shapes:**
  - `orb` `{ x, y, r, vx, vy }`: a moving ball.
  - `path` `{ points, width, progress }`: a beam, a sweep sampled along its arc, or a blink trail. `progress` runs 0–1 as the carrier grows and fades.
  - `ring` `{ x, y, r }`: a blast, a zone rim or an aura.
- **Strength:** 0–1. It fades the motif with its carrier, and a finisher discharge draws at 1.5.

| Element | Orb | Path | Ring |
|---|---|---|---|
| Storm | 2–3 jagged arcs crackling off the ball, re-rolled about 15 times a second | arcs forking off the path every ~1.2 units | arcs zig-zagging around the rim |
| Nature | leaf sprigs and a short curling vine trailing behind | tendrils sprouting sideways from the path and curling as `progress` rises, with leaf pixels | roots and vines creeping outward from the rim, with sprouts |
| Frost | 3 ice shards orbiting, with a rime trail | crystal spikes growing from both edges | ice spikes ringing the rim, with glints |
| Fire | flames licking up from the ball, with embers | flames flickering up along the path | flame tongues around the rim, with rising embers |
| Earth | 3–4 pebbles orbiting | rubble chunks kicked up along the path | rocks thrown outward, and a cracked rim |
| Shadow | dark wisps trailing | smoke tendrils curling off the path | wisps rising while void motes are pulled inward |

- **Style:** every motif is made of pixels on the sprites' 0.1-unit grid, like the rest of the effects. They use the existing `mana-pixels.ts` helpers and the element's palette, lighter and darker.
- **Layers:** motifs draw on the additive air layer, except dark shapes (shadow's smoke and wisps, earth's cracks), which draw on the normal ground layer. Additive drawing can't darken.
- **Shape of the code:** motifs take their randomness from `seed` and `time` through the existing `hash`, so they are stable per carrier and don't shimmer. `Math.random` is not used.
- **Budget:** a frame draws at most 600 motif pixels in total. Past the budget, carriers draw thinned versions (every other element of the motif).

## Carriers (where motifs are drawn)

| Carrier | Shape | Where it happens | How long |
|---|---|---|---|
| Ability projectiles (Bolt, Volley) and infused basic shots | orb | `drawProjectiles` | while in flight |
| Thrown Burst | orb | `drawLobs` | while in flight |
| Lance | path | `ManaFx.beam` | the beam's life, with `progress` following its grow and fade |
| Strike and basic melee swings | path along the swept arc | `ManaFx.swing` | the swing's life |
| Blink trail | path | `dash` event | 0.4 s |
| Blasts (Bolt and Burst impacts, Nova, Barrage, the staff's great orb) | ring | `explode` event | 0.45 s |
| Maelstrom and fusion ground | ring at the zone rim | `drawZones` | while the zone lasts |
| Ward, Armor and Surge on the hero | ring around the hero | `drawGuard` | while the buff lasts |
| Basic finisher with an infusion | ring at the blow's tip, strength 1.5 | `basic` event with `finisher` | 0.45 s |

- **Transient carriers** (beam, swing, dash, blast, finisher): `ManaFx` keeps them with their lifetime in a new `infusions` list, and draws them each frame through `drawInfusion`.
- **Persistent carriers** (projectiles, zones, auras): drawn each frame from the world, seeded by the entity's id.

## Ground marks (pixel floor)

Where an infused path or blast passes, the floor gets a brief mark of the infusion element. It is cosmetic only and never feeds back into play.

| Element | Path mark | Blast mark |
|---|---|---|
| Nature | vines and sprouts along the path (the new growth brush) | the growth brush spreading from the centre |
| Frost | rime along the path | a small frost blast |
| Fire | scorch along the path | a small fire blast |
| Storm | a scorched spark trail (the existing storm-arc brush) | a small storm blast |
| Earth | rubble along the path | a small crater |
| Shadow | a dark stain along the path | a small shadow blast |

- **Growth brush:** `pixel/world.ts` gains a nature growth brush: vine and leaf pixels that grow in over about 0.5 s and fade after about 4 s, drawn in the biome's foliage palette tinted green.
- **Path marks:** a path mark is a line of small brush stamps, one every 4 floor cells.
- **Blast marks:** a blast mark is the matching blast brush at 0.6 × the blast's radius.
- **Replay:** `arena-effects.ts` replays `beam`, `slash` and `dash` (as paths; a slash is sampled along its arc) and `explode` when `infusion` is set.
- **Limit:** at most 12 stamps per event.

## Training Grounds preview

- **Picker:** the Loadout tab gains **Basic infusion**: None, or an element other than the weapon's.
- **Label:** "Preview: in the Delve, basic attacks will gain a second element through elemental affinity."
- **Effect:** it sets `extra.basicInfusion` through the sandbox store (`basicInfusion`, saved), so basic swings and shots draw the motif and finishers discharge it visually.
- **Rules:** unchanged, as in real play.

## Testing

Engine:
- A two-element ability's `beam`, `slash`, `explode`, `dash` and `cast` events carry its second element. A one-element ability's carry `null`.
- A monster slam's `explode` carries `null`.
- Ability projectiles carry the infusion.
- With `extra.basicInfusion`, `basic` events and basic shots carry it (and a staff great orb's `explode` does too). Without it, they carry `null`.
- A `basicInfusion` equal to the weapon's element is ignored.
- Hits are unchanged.

Client:
- `drawInfusion` for each element × shape, into a recording Graphics:
  - it draws pixels;
  - it stays within the shape's bounds plus a margin;
  - it is the same for the same seed and time;
  - it puts shadow's dark shapes on the ground layer;
  - it respects the pixel budget.
- `ManaFx` keeps and expires transient infusions.
- `applyArenaEvent` stamps the right brush for each infusion element on paths and blasts, and nothing for `null`.
- The growth brush grows and fades.
- The Basic infusion picker writes the store and rejects the weapon's element.

Screenshots: a Training Grounds pass (Fire Bolt + storm, Frost Lance + nature, Strike + earth, Ward + shadow, Maelstrom + fire, an infused basic finisher), looked at and tuned.

The dive E2E and Training E2E must pass unchanged.

## Delivery

Shipped as **v0.42.0**. The CLAUDE.md Mana-pixel FX bullet gains a line on infusion motifs.

## Out of scope

- Motifs on single-element spells.
- Bespoke looks for named fusions.
- Where basic attacks' second element comes from, and the finisher discharge's mechanics (project B, "Elemental affinity").
