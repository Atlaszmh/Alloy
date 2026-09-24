# Delve — Loot-Crawler Mode Design

**Date:** 2026-09-24
**Status:** Implemented. v0.27.0 shipped a first-person auto-battler; v0.28.0 rebuilt combat as a
real-time top-down ARPG with a mana system; v0.29.0 added the simulated high-fantasy pixel floor.
**Engine modules:** `packages/engine/src/loot/`, `packages/engine/src/delve/`, `packages/engine/src/arpg/`
**Client:** `packages/client/src/pages/DelveCamp.tsx`, `DelveRun.tsx`, `packages/client/src/features/delve/` (arena in `features/delve/arena/`)

---

## Why

Alloy already had the ingredients of a loot game: six rarity tiers, a large affix
catalogue, elements, and a deterministic combat engine. They sat inside a slow
competitive loop, though:

| Friction in the Arena loop | Effect |
|---|---|
| Timed draft of abstract "+4 Fortify" gems before any action | First 60s is homework, not play |
| Drag-and-drop socketing across two items and six sockets | High input cost per decision |
| Long auto-duel (up to 100s) you only watch | Low agency and slow feedback |
| Rewards are stat gems, not *gear* | No "ooh, a legendary helm" moment |
| No persistence between runs | Nothing to come back for |

Delve keeps the part people love (the loot tiers) and puts it in the fastest
possible loop: **kill → loot drops → equip upgrade → go deeper → forge → repeat.**

## The Three Loops

**Seconds: the arena.** Each depth is a top-down arena with packs of monsters. You move
the hero (drag anywhere for a floating joystick, hold-click on desktop, or WASD). Your
weapon attacks whatever is in reach on its own: melee weapons sweep an arc, staves and wands
fire bolts. Up to three **spells** sit on the action bar (tap, or Q/E/R) and spend
**mana**. Monsters telegraph their hits (wind-up rings, charge lanes, boss slam zones), so
walking out of a red circle is how you dodge. Kills burst into loot on the floor with a
rarity-colored beam; walk over it to pick it up. Mana motes, health orbs and scrap drift
toward you, and the whole floor is vacuumed up when the last monster dies.
- Picked-up gear lands in a **pickup feed** on the right edge with ▲/▼ badges. Tap to
  inspect, or "▲ Equip" to put on every upgrade without leaving the fight.
- **Potion**: 3 per dive, heals 40% (F / Space, or the 🧪 button).

**Minutes: the dive.** A dive descends through **depths**. Each depth is one arena floor
(4–8 packs, growing with depth). Every 5th depth is a **boss** floor (guaranteed Rare+,
and your first boss ever drops a Legendary). Your HP carries over between floors, so attrition builds. After each depth
you choose one of three **doors** (modifiers such as *Gilded Halls*: +magic find and tougher
monsters, or *Quiet Shrine*: full heal and less loot) **or extract**.
- The **bounty** (scrap) grows with every depth you clear. It pays out only if you extract.
  If you die, the bounty is lost, but **all gear you found is kept**. That is the push-your-luck layer.
- Boss depths you clear become checkpoints you can start later dives from.

**Hours: the Anvil (meta).** Between dives you return to camp:
- **Paper doll** with 7 slots: weapon, helm, chest, gloves, boots, amulet, ring.
- **Bag** (40 slots): sort, lock, bulk-salvage junk, and "Equip best".
- **Forge** (scrap sink):
  - *Upgrade* +1 to +10 (+10% item stats per level).
  - *Reforge* one affix (the cost escalates per item).
  - *Alloy Fusion*: three items of one rarity become one item of the next rarity.
    Fusing three Epics makes a Legendary.
- **Spells**: attunement bars, the 3-slot spell bar, every spell (locked ones list what
  they need) and the reactions discovered so far.
- **Codex**: 12 legendary powers to collect. This is the long-tail goal.

## Mana

Five mana types: **Fire 🔥, Frost ❄️, Storm ⚡, Earth ⛰️, Shadow 🌑.** Every item rolls a
mana affinity (biased toward the current biome's element), shown as a colored pip on its tile.

- **Attunement** per type = sum over equipped gear of the item's affinity bonus
  (`attuneByRarity`: 1 for Common–Magic, 2 for Rare/Epic, 3 for Legendary), plus
  `+N <Mana> Attunement` affixes, plus the Prism legendary (+N to all).
- Each attuned type has its own **mana pool** (`basePool + poolPerAttune × att`) and
  regen. Basic attacks and mana motes refill it.
- **Thresholds**: 1 unlocks that element's signature spell; **3 in two elements** unlocks
  their combo spell; **10** grants that element's **mastery** passive.
- Attunement also adds `powerPerAttune` spell damage per point.

So a drop is never judged on stats alone: an off-element Rare can be a downgrade on paper
and still unlock *Magma Eruption*. The item sheet lists "Unlocks: …" / "Loses: …" and the
attunement delta for every comparison, and the arena announces **NEW SPELL** when an
equip unlocks one mid-fight.

### Spells (15)

| | Fire | Frost | Storm | Earth | Shadow |
|---|---|---|---|---|---|
| **Fire** | Fireball | Steam Burst | Plasma Orb | Magma Eruption | Hellfire Brand |
| **Frost** | | Frost Nova | Blizzard | Glacial Spikes | Soul Freeze |
| **Storm** | | | Chain Lightning | Magnet Quake | Void Bolt |
| **Earth** | | | | Boulder | Grave Golem |
| **Shadow** | | | | | Shadow Step |

The diagonal holds the signature spells; every pair has a combo. The bar auto-fills
(combos first) when a slot is empty. A spell that becomes locked stays on the bar but is
inactive until it's unlocked again.

### Reactions

Statuses from one element combine with hits from another. Reactions are hidden in the
Spellbook until you trigger them once.

| Reaction | Trigger | Effect |
|---|---|---|
| Melt | Fire on a chilled/frozen foe | ×2 damage |
| Shatter | Earth on a frozen foe | ×2.5 damage |
| Overload | Storm on a burning foe | Explosion around the target |
| Superconduct | Frost on a shocked foe | Freeze |
| Soulfire | Fire on a hexed foe | Heals the hero |

### Masteries (10 attunement)

- **Inferno** (fire): burning foes spread their flames when they die.
- **Permafrost** (frost): freezes last 50% longer; frozen foes take 30% more damage.
- **Tempest** (storm): chains jump to 2 more foes; shock's damage bonus doubles.
- **Mountain's Heart** (earth): +40% armor and +20% max life.
- **Night's Embrace** (shadow): killing a hexed foe heals 4% max life.

### Biomes

Each biome has an element. Its monsters **resist** that element (−40%) and are **weak**
(+35%) to its counter (fire ↔ frost, storm ↔ earth; shadow is weak to storm). The top HUD shows
"Resists 🔥 · weak to ❄️ Frost", which makes a second element worth carrying.

## Rarity

Reuses `GemRarity` / `RARITY_ORDER` from the engine.

| Rarity | Color | Affixes | Base-stat mult | Min roll |
|---|---|---|---|---|
| Common | grey | 0 | 1.00 | 0 |
| Uncommon | green | 1 | 1.10 | 0 |
| Magic | blue | 2 | 1.20 | 0 |
| Rare | yellow | 3 | 1.35 | 0.10 |
| Epic | purple | 4 | 1.55 | 0.25 |
| Legendary | orange | 4 + power | 1.75 | 0.40 |

Rarity is rolled from base weights. Luck (magic find + depth + elite/boss + door)
tilts the weights toward the top tiers. Legendary **pity** grows each drop without one.

## Gear

- **Item level** = depth. Flat stats scale `itemGrowth^(ilvl-1)`.
- **Material names** progress with ilvl (Rusty → Iron → Steel → Mithril → Adamant → Starforged),
  so each new material is a small milestone.
- **Weapon bases** give the build its identity: Dagger (fast, +crit), Sword, Axe (+crit damage),
  and Maul (slow, huge hits) swing in melee arcs; Staff and Wand fire bolts at range.
- **Implicits**: weapon has damage, armor pieces have armor and HP, gloves add attack speed,
  boots add dodge, amulet adds % damage, ring adds crit.
- **Affixes** come from a slot-restricted pool: flat damage, % damage, attack speed, crit
  chance and damage, max HP, % HP, armor, dodge, lifesteal, heal on kill, thorns, magic find,
  scrap find, move speed, cooldown reduction, mana regen, per-element power, and
  per-element attunement.
- Every affix records its **roll quality** (0–1), so a perfect roll is visible and worth chasing.
- Rare and Epic items get generated names; Legendaries are named after their power.

## Legendary Powers (Codex)

Twin Fang, Pyroclasm (Fireball embers), Stormcaller (more chain jumps), Rimeheart (Frost
Nova leaves a freezing field), Bedrock (bigger staggering Boulders), Nightstalker (kills
refresh Shadow Step), Prism (+all attunement), Catalyst (+reaction damage), Glass Cannon,
Phoenix Plume, Lucky Charm, Manaweaver (cheaper spells). Each one has an eligible slot
list and a rolled magnitude. Most modify a spell, so a legendary can pull a build toward an element.

## Combat

`engine/src/arpg/` is a fixed-step (1/30 s) deterministic simulation. `createFloorWorld`
builds a floor from a seed; `stepWorld(registry, world, input, dt)` accumulates real time,
runs whole steps (capped per call), and returns `ArpgEvent`s (hits, casts, reactions,
drops, pickups, deaths…) for the renderer. Input is `{ move, cast?, potion? }`; one-shot
inputs are queued so a tap between steps is never lost. Loot rolls use a separate RNG
stream forked by the save's item counter, so re-entering a floor re-fights the same monsters
but rolls fresh drops.

- Hero hit = weapon damage × %dmg [× crit] × element power, then biome resist/weakness.
- Monster hit is reduced by dodge, then armor (`armor / (armor + K·monsterScale)`, capped).
- Monster AI: melee (wind-up telegraph), ranged (projectiles), chargers (locked lanes),
  bosses (slam zones, projectile novas, summons, enrage timer).
- Monster traits add variety: Armored, Swift, Brute, Regenerating, Vampiric, Spiked.
- The client (`features/delve/arena/`) renders with PixiJS: `useArena` owns the world, steps
  it from Pixi's ticker, banks pickups into the save as they happen (`bankWorld`), and ends
  the floor with `completeFloor` / `failFloor`.

## Pixel Floor (v0.29.0)

The arena floor is a simulated, lit pixel world (`client/src/features/delve/arena/pixel/`),
five cells per arena unit plus a three-unit cliff border. It is purely visual: engine events
are replayed onto it, and nothing flows back into the rules.

- **Terrain**: each floor generates a meandering river from a spring at the top, one or two
  pools, a ruined plaza with a glowing rune circle, meadows and shrubs, and cliffs with
  glowing crystals and leafy overhangs. The layout is seeded by depth and biome.
- **Physics**: fluid runs downhill over a height field; fire spreads through grass and
  shrubs, burns to ash, and regrows; frost freezes water and cools lava to obsidian;
  lightning conducts through connected water; impacts carve craters that fill with water,
  and debris bounces then settles as rubble; heroes and monsters part the grass and
  ripple the water.
- **Lighting**: `albedo × (ambient + light) + emissive`. Water, lava, fungi, crystals,
  runes, flowers, fire, sparks and fireflies both glow and cast light into a blurred
  half-resolution light map. The hero carries a torch; projectiles, rare loot and spell
  zones add lights.
- **Biome looks** (`themes.ts`): Sunken Quarry is lush with a turquoise river, cyan fungi,
  flowers, fireflies and rain. Frostvault has snow, an aqua river and ice crystals. Storm
  Foundry has thunderstorms with lightning flashes. Cinder Mines and Molten Core run lava
  rivers with drifting embers. Bone Crypts has a spirit river, violet fungi, wisps and mist.
- **Gameplay tuning**: fire spreads at 12% of the sandbox rate and burns 3× faster, so
  blasts leave burning patches instead of torching the arena.
- **Performance**: only the visible window is painted, at 2 output pixels per cell. The
  simulation and painting run in a Web Worker (`floor-worker.ts`); pictures come back as
  transferred buffers that ping-pong between threads. If a repaint costs more than 7 ms it
  drops to every other step.

## Pixel Sprites (v0.30.0)

Creatures are pixel sprites drawn at the floor's density: one sprite pixel is 0.1 arena
units (the floor paints 5 cells per unit at 2×). The client loads one sprite sheet,
`client/public/sprites/delve/atlas.{png,json}`, keyed by `hero` and monster `defId`, and
falls back to the monster's emoji when a sprite is missing. Sprites stand on their
ground point, flip to face their heading, and cycle their frames at 3 fps (held while frozen).

The sheet is built by `packages/pixel-forge`, a Node CLI:

- **Style lock** (`art/alloy/style.json`): the ENDESGA 32 palette, a dark `#181425`
  outline, top-left light, a 10-color cap per sprite, and the prompt template.
- **Two sources** (`art/alloy/manifest.json`): `code` sprites are ASCII grids with a
  legend (`art/alloy/sprites/*.ts`), mirrored where symmetric, with an automatic idle bob.
  `ai` sprites are generated by Gemini with the existing sprites as a style reference.
- **Cleanup**: key out the magenta background, drop specks, find the model's pixel grid
  and sample one color per block, lock colors to the palette (OKLab), cap the color
  count, place the sprite bottom-centre on its canvas, and redraw a one-pixel outline.
- **Review**: `generate` writes several candidates and a contact sheet; a person picks
  one (`pick`) and `build` repacks the atlas and the full review sheet.

The first set covers the hero and all of Cinder Mines (mine rat, soot bat, slag beetle,
goblin digger, Foreman Grask). The other 25 monsters are queued as `ai` assets.

## Power & Comparison

`Power = sqrt(DPS × EHP)` against the current depth's reference monster. Every item is
compared by recomputing hero stats with the item swapped in. The UI shows the Power delta
as ▲/▼ %, plus DPS and Toughness deltas in the detail sheet.

## Persistence

`DelveProfile` v2 (Zod-validated JSON in localStorage under `alloy:delve:v2`) holds equipped
gear, bag, scrap, checkpoints, codex, the spell bar, discovered reactions, stats, legendary
pity, and the active dive. Leaving mid-floor keeps everything picked up so far and restarts
that floor. Profile RNG counters make forge actions deterministic too.

## Balance

All tunables live in `balance.json → delve` (hero, growth, monster, dive, loot, forge,
mana, status, reactions, arena). The autopilot (`engine/src/delve/autopilot.ts`) plays
whole dives in the real-time sim with `botInput` (kites, dodges telegraphs, grabs loot,
casts spells, equips upgrades). `delve-pacing.test.ts` guards the curve across 4 seeds × 12 dives:

- The first dive reaches depth 3+ (average between 4 and 12).
- Dive 12 goes more than 5 depths deeper than dive 1, and deeper than dive 6.
- At least one legendary, but fewer than 12, over those dives.
- At least 2 reactions discovered naturally.
- A floor takes 8–60 simulated seconds.

The client exposes two test hooks read from localStorage: `alloy:delve:autopilot = "1"`
lets the bot play the arena (used by the E2E suite), and `alloy:delve:timescale` speeds up
the sim (max 4×).
