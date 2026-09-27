# Delve Training Grounds Design

**Date:** 2026-09-26
**Status:** Approved in conversation.

**Engine:** `packages/engine/src/`
- `arpg/sandbox.ts` (new)
- `arpg/world.ts`, `arpg/step.ts`, `arpg/combat.ts`, `arpg/abilities/cast.ts`
- `delve/hero-stats.ts`
- `types/arpg.ts`, `types/delve.ts`
- `data/balance.json`, `data/schemas.ts`
- `index.ts`

**Client:** `packages/client/src/`
- `pages/DelveTraining.tsx` (new), `features/delve/training/` (new), `stores/sandboxStore.ts` (new)
- `features/delve/arena/useArena.ts`, split into `useArenaCore.ts` plus modes
- `features/delve/arena/input.ts`, `features/delve/arena/ArenaRenderer.ts`
- `features/delve/AbilitiesPanel.tsx`, `pages/DelveCamp.tsx`, `components/AppShell.tsx`, `App.tsx`

**Art:** `packages/pixel-forge` (a training dummy sprite), `features/delve/__tests__/sprite-atlas.test.ts`

## Goal

A place to try any weapon with any ability build, fast. Swap the weapon, legendary powers, attunement and every ability option mid-fight, hit dummies or real monsters, and read what happened. None of it touches the save.

## Decisions

| Question | Decision |
|---|---|
| Save | **A separate loadout.** The Training Grounds has its own weapon and ability setup, and every weapon, element and rarity is available. Nothing done there changes the save, including discoveries: the codex and the reactions seen are not updated. **Load my build** copies the current gear and abilities in as a starting point. |
| Access | **A "Training Grounds" button at the Anvil**, next to Dive, always visible and usable, even with a dive in progress. |
| Targets | **Training dummies with a damage meter, real monsters, or both at once.** |
| Toggles | **Infinite mana**, **no cooldowns**, **invulnerable**, **fill charge** and **slow motion**. |
| Spoilers | It is a testing tool, so everything is shown: all legendary powers with their text, and reactions by name. Hiding undiscovered ones is a later option if it matters for release. |
| Structure | **A shared arena core with its own page.** `useArena` splits into a core and two modes: the dive (unchanged) and the sandbox. |

## Engine

Every sandbox rule lives in the engine, as all rules do. The client only asks for things through exported functions.

### Balance (`balance.json → delve.sandbox`, Zod-validated)

| Key | Value | Meaning |
|---|---|---|
| `dummyLifeMult` | 50 | A dummy's life is the reference monster's life at the depth times this. |
| `heroStart` | `[13, 26]` | Where the hero stands in a sandbox (the arena is 26 × 40). |
| `dummyDistance` | 4 | How far above the hero the first dummy stands. |
| `rowSpacing` | 2 | Gap between dummies in a row. This is under `chainRange` (4), so chains can jump. |
| `clumpRadius` | 1.2 | How far a clump's dummies sit from its centre. |
| `spawnRing` | 6 | How far from the hero spawned monsters appear. |
| `edgeMargin` | 1.5 | Spawns are kept this far inside the arena walls. |

### Sandbox world (`src/arpg/sandbox.ts`)

`createSandboxWorld(registry, { depth, stats, abilities, toggles })` builds an open arena:

- **Floor options:** it calls `createFloorWorld` with a new `empty: true` option. That option skips both the packs and the boss floor's boss, so `bossId` stays null. The other options:
  - `door: null`, `heroHpFrac: 1`, `potions: bal.dive.potions`, `phoenixAvailable: true`, `seed: 1`;
  - `loot`: `{ pity: 0, nextUid: 1, magicFind: 0, legendaryBoost: 1, dropMult: 1, forceLegendary: false }`.
- **Hero:** placed at `heroStart`, facing up.
- **Biome and scaling:** depth picks the biome, as in a dive, and scales monsters.
- **Toggles:** the world gains `sandbox: { infiniteMana, noCooldowns, invulnerable } | null`, which is `null` for a dive.
  - `setSandboxToggles(world, toggles)` changes them; the client never writes the field directly.
- **It never ends:** the tick's clear check skips a sandbox world, so it never clears and never ends.
- **No drops:** killing a real monster in a sandbox drops nothing (no items, motes, orbs or scrap, and no `pending` loot). On-kill effects still happen: heal on kill, Nightstalker, fire-mastery spread and Hellfire Brand.

### Dummies

`MonsterEntity` gains `dummy: { homeX: number; homeY: number; element: ManaType | null } | null`. It is `null` for real monsters.

- **Spawning:** `spawnDummies(registry, world, { layout, element })` places dummies above the hero. Positions are relative to the hero (x, y), and all are clamped to `edgeMargin` inside the walls.

  | Layout | Positions |
  |---|---|
  | `single` | one at (0, −`dummyDistance`) |
  | `row` | five at (0, −(`dummyDistance` + k × `rowSpacing`)), k = 0..4. It runs along the up direction, for lances, and chains can jump along it. |
  | `clump` | five around (0, −(`dummyDistance` + 1)): one at the centre and four at `clumpRadius`, for areas. |

- **Stats:**
  - `kind: 'normal'`, no traits, size 1 (radius `bal.monster.radius`), `defId: 'dummy'`, speed 0, damage 0;
  - life = `referenceMonster(depth).hp × dummyLifeMult`.
- **Element:**
  - **Resist and weakness:** they use the dummy's own setting: **Neutral** (`null`, the default: no resist, no weakness) or any element, for testing resist and weakness. `m.element` stays a real mana value (the world's) for visuals.
  - **Where it is read:** the resist and weakness lookup in `hitMonster` reads `m.dummy ? m.dummy.element : m.element`.
- **Never dies:**
  - In `hitMonster`, before the kill check: if a dummy's life would drop to 0 or below, it resets to full. The hit then carries on as normal (statuses, riposte stagger, knockback).
  - Dummies are exempt from execute (as bosses are), so the meter never sees an execute hit worth a dummy's whole life.
  - A dummy never counts as a kill and never drops anything.
- **Never acts:** `monstersTick` still runs a dummy's statuses (burns, poison, chill and freeze timers, reaction timers), but skips its AI: it never moves, attacks, aggroes or uses a special.
- **Moved only by effects:** knockback and pull still move a dummy. `separate()` treats a dummy as immovable against the hero, so walking into it pushes the hero, not the dummy. Spawned monsters walking through dummies can still shove them; **Reset dummies** puts them back.
- **Reset:** `resetDummies(world)` moves each dummy home and resets its life, statuses, `kbx`/`kby` and `lastHitAt`.

### Spawner

`spawnMonsters(registry, world, { defId, kind, count })` creates `count` (1–8) monsters of a definition from any biome:

- **Kind:** `kind` is `'normal' | 'elite' | 'boss'`. Stats come from `createMonsterEntity` at the world's depth.
- **Element:** each monster uses its home biome's mana (its natural element).
- **Placement:** evenly around a ring of `spawnRing` about the hero, clamped to `edgeMargin` inside the walls.
- **Aggro:** they arrive already aggroed, with `nextSpecialAt = t + 4`, as a normal aggro does.
- **Bosses:** a spawned boss becomes `world.bossId` (the latest one), so the boss bar shows. When the boss that `bossId` points at dies or is removed, it points at the next living boss, or `null` if none are left.
- **Count:** `totalMonsters` is increased.

`clearMonsters(world, which)` removes real monsters, dummies or both (`which: 'monsters' | 'dummies' | 'all'`). If the boss is removed, `bossId` moves to the next living boss, or `null` if none are left.

### Toggles

Each toggle is checked where its rule lives:

- **Infinite mana:** each tick, `heroTick` sets mana to max.
- **No cooldowns:**
  - `pay` sets no cooldown and the charge lockout is skipped, so an ability can fire again as soon as it lands.
  - A charge-paid ability's charge is also refilled when it lands.
  - The channel still plays, so its timing can be tested.
- **Invulnerable:**
  - In `hurtHero`, the life lost becomes 0 and the hero never dies.
  - The `heroHit` event still carries the would-be damage, with a new `blocked: true` flag. The renderer shows it as a grey number with no red flash.
  - Perfect-dodge detection, the riposte, statuses on the hero and everything else still happen.
- **Fill charge:** `fillCharge(world)` sets every charge-paid slot to its `chargeNeed`. It is an action, for when No cooldowns is off.
- **Respawn:** `respawnHero(world)` runs at once when the hero dies with Invulnerable off. It:
  - restores full life and potions, and makes Phoenix available again;
  - clears `heroDead`, the wind-up, the swing, the push, the recovery, the dodge, the Defensive buff and the Ward;
  - grants 1 s of `invulnUntil`, so a crowd can't kill the hero again at once;
  - keeps the hero's position and every monster.

### Mid-fight build swaps

Builds used to change only between dives. Now `refreshWorldHero` can bring new builds mid-fight. For each slot whose build changed:

- a wind-up in progress for that slot is cancelled, as a dodge cancels it: the cooldown is reset, mana stays spent and charge is refunded;
- if the Defensive changed, its active buff and any Ward end at once, without bursting.

Unchanged slots carry on.

### Hit events carry their source

`hit` gains `source` (the existing `HitSource`: `basic`, `skill`, `dot`, `reaction`, `thorns`) and `slot` (the ability slot for skill hits, otherwise absent). They come from `HitOpts`, which already has both, and are display data, not rules.

Fixtures that build `hit` events by hand are updated: `hitstop.test.ts`, `floor-engine.test.ts`, `delve-combat-weight.test.ts` and any other that `tsc` flags.

### Hero stats overrides

`computeHeroStats(equipped, registry, extra?)` takes an optional `extra`:

- **`extra.legendaries`** (id → value): merged with gear legendaries, taking the higher value.
- **Prism:** `computeAttunement` also reads Prism from `extra.legendaries`, taking the higher of the gear and extra values, not adding them.
- **`extra.attunement`** (a partial `ManaMap`): added to the gear attunement.
- **Order:** both are applied before the derived values (life, armor, element power, masteries, mana pool), so every legendary and mastery behaves exactly as it does from gear.

### Sandbox weapon (`sandboxWeapon`)

`sandboxWeapon(registry, { baseId, mana, rarity, ilvl })` builds a clean weapon:

- **Lines:** the base's implicits only, scaled by rarity and item level, with no random affixes and no legendary power (powers come from the toggles).
- **Determinism:** a fixed seed, so the same choice always gives the same item.
- **Attunement:** it still gives its rarity's attunement to its own element, as any weapon does.

## Client

### Sandbox store (`stores/sandboxStore.ts`)

A Zustand store, saved under `alloy:delve:sandbox:v1` and validated with Zod on load. It reuses the engine's `GearItemSchema` for items; bad or missing data falls back to the defaults. It is separate from the Delve save.

| Field | Contents |
|---|---|
| `weapon` | `{ baseId, mana, rarity } \| null`. `null` means unarmed. Default: sword, fire, rare. |
| `loadedWeapon` | The real weapon item copied by **Load my build**, or `null`. While set, it is used as-is (affixes, upgrades, legendary); changing any weapon choice clears it. |
| `gear` | The other equipped slots, empty unless filled by **Load my build**. |
| `legendaries` | id → value; each switched-on power at its max roll. |
| `attunement` | Extra attunement per element, 0–15. |
| `abilities` | The three `AbilityBuild`s. Default: the save's defaults. |
| `depth` | 1–30. Default 5. |
| `dummyElement` | `null` (Neutral) or a mana type, for new dummies. Default `null`. |
| `dummies` | The dummy groups added so far, as `{ layout, element }` entries, so a rebuilt world can replay them. Cleared by clearing dummies. |
| `toggles` | `{ infiniteMana, noCooldowns, invulnerable }`. Default: all on. |
| `slowmo` | Display speed: 0.25, 0.5, 0.75 or 1. Default 1. |

- **Equipped weapon:** `loadedWeapon ?? sandboxWeapon(weapon, ilvl from depth)`, or none if unarmed.
- **Load my build:**
  - copies the save's equipped items (`loadedWeapon` set to the real weapon and `weapon` to its base, element and rarity, or unarmed; the other slots into `gear`) and its three builds;
  - resets `legendaries` and `attunement` to empty, because the real gear's powers and attunement now come from the items.
- **Stats:** the derived stats (`computeHeroStats` with `extra`) are memoised on the loadout, so the arena hot-swaps only when the loadout really changes.

### Shared arena core

`useArena` (561 lines) splits into `useArenaCore(hostRef, mode, opts)` and two modes.

- **Core:** the Pixi app, renderer, ticker, keyboard, mouse and controller input, hit-stop, the HUD snapshot, and the cast, dodge and attack actions.
  - `opts` are today's options: `paused`, `insets`, `manualAttack`, `onUi`.
  - The HUD refresh clock runs on real (unscaled) time, so slow motion doesn't slow the HUD.
  - The core stops stepping a world once the mode's `frame` reports it finished, until a new world is created.
- **Mode object:**

  | Member | Purpose |
  |---|---|
  | `worldKey` | `string \| null`. The core creates a new world when it changes to a new string, and keeps the current world while it is `null`. The dive uses `fighting:${depth}` while fighting and `null` otherwise, so the finished floor stays on screen behind the door choice or the summary. The sandbox uses `depth`. |
  | `createWorld()` | Returns the world for the current (non-null) key. |
  | `loadout` | `{ stats, abilities }`. The core hot-swaps them with `refreshWorldHero` when they change. |
  | `frame(world, dt)` | Runs every frame and returns `true` once the mode is done with the world (the core then stops stepping it). The dive uses it for today's end check: the clear timers and, after a death, the `END_DELAY` beat before `failFloor`. |
  | `onEvents(world, events)` | After each step with events. The dive banks pickups; the sandbox feeds the meter. |
  | `onHeroDead(world)` | Called once, on the frame the hero dies. The dive does nothing here (its `frame` handles the delayed fail). The sandbox respawns at once. |
  | `speed` | Display speed. The core multiplies it with the perfect-dodge slow motion and the `alloy:delve:timescale` test hook. The dive uses 1; the sandbox uses `slowmo`. |

- **`useArena` (the dive):** today's behaviour moved into a dive mode. Its API and behaviour don't change, and the dive E2E suites must pass unchanged.
- **`useTrainingArena` (the sandbox):**
  - creates the world with `createSandboxWorld` from the store;
  - calls `setSandboxToggles` when the toggles change;
  - on a depth change, rebuilds the world: it replays the store's `dummies` groups from `heroStart` and drops spawned monsters;
  - feeds the meter and respawns on death.

### Renderer

- **Removed monsters:** `syncMonsters` removes the view of any monster whose id is no longer in the world. Without that, cleared monsters would leave sprites behind.
- **Dummies:** drawn with the `dummy` sprite (emoji fallback 🎯). Their overhead life bar is hidden, because the meter shows the damage.
- **Blocked hits:** a `heroHit` with `blocked` shows a grey number and no flash.

### Training Grounds page (`/delve/training`, `pages/DelveTraining.tsx`)

The arena with the HUD and the usual controls (keyboard, mouse, touch and controller), plus the Training panel.

- **TabBar:** hidden. `AppShell` hides it for `/delve/training`, as for `/delve/run`.
- **Meter chip:** a small live readout at the top of the HUD (DPS · total · reset), so phones and the E2E can read it without opening the panel.
- **Panel layout:** decided when the panel opens and kept until it closes, so switching between mouse and controller mid-use never flips it.
  - On wide screens (at least 1024 px) with mouse or keyboard as the active input, the panel docks on the right and the fight keeps running. It is open by default on entry. The arena host narrows, so the camera centres in the visible area.
  - On narrower screens, or with the controller as the active input (`inputDeviceStore.device === 'gamepad'`) when it opens, it opens as a sheet and pauses the fight. It is closed by default on entry and uses the existing gamepad menu layer (`data-pad-scope`).
  - Opening the 🎮 Controls editor pauses the fight while it is open, as in a dive.
- **Opening and closing:**
  - A **Panel** button in the top corner (`data-testid="training-panel-toggle"`, carrying `data-pad-menu`, so the controller's Menu button presses it).
  - The keyboard's menu key (Escape by default, bindable). It works from anywhere in the panel, sliders included.
  - The sheet's close button carries `data-pad-back`.
  - The **Back to the Anvil** button carries neither marker.
- **Keys in the panel:**
  - `attachKeyboard`'s ignore list grows from text inputs to text inputs, selects and range inputs (sliders), so typing or using a slider or dropdown never moves or attacks. Buttons are not ignored, so the dive's keyboard play is unchanged.
  - Panel buttons blur themselves after a pointer click, so a click in the panel never leaves focus there and arena keys keep working.
- **Tabs** (`features/delve/training/`):

| Tab | Contents |
|---|---|
| Loadout | Weapon base (7) or unarmed, element (6) and rarity (6: common to legendary), with the weapon's lines shown; legendary powers as toggles with their text; attunement sliders per element showing gear + extra, with the mastery threshold marked on the total; **Load my build**. |
| Abilities | The Anvil's ability editor for all three slots, bound to the sandbox store. |
| Targets | Add dummies (single, row, clump) with the dummy element (Neutral or an element); spawn monsters (biome, monster, kind, count 1–8); clear monsters, dummies or all; reset dummies; depth. |
| Toggles | Infinite mana, No cooldowns and Invulnerable (three switches); **Fill charge**; slow motion (0.25×, 0.5×, 0.75×, 1×); the manual/automatic attack switch; and the 🎮 Controls editor. |
| Meter | The full breakdown (below) and **Reset**. |

### Ability editor refactor (`AbilitiesPanel.tsx`)

The editor and its helpers become prop-driven:

- **Editor:** takes `builds`, `stats` (the full `HeroStats`, which resolving a build needs: legendaries, cooldowns, damage, life; attunement and the mana pool come from it), `reactionsSeen`, `locked` and `onChange(slot, build)`.
- **`AttunementBars`:** takes `stats` as a prop.
- **Anvil wrapper:** reads the save store and passes `reactionsSeen` and `locked = isDiveActive(profile)`, as today.
- **Training wrapper:** reads the sandbox store, passes `locked = false` and `reactionsSeen` = all reactions (the spoiler decision), and writes changes to the sandbox store. The arena hot-swaps them mid-fight (see Mid-fight build swaps).

### Meter (`features/delve/training/meter.ts`)

A pure aggregator: `record(events, t)` and `summary(t)`. Time `t` is the world's sim time (`world.t`), so hit-stop and slow motion don't skew DPS. It only reads events.

- **Buckets:**

  | Bucket | Hits counted |
  |---|---|
  | Basic | `source: 'basic'` |
  | Q, E, R | `source: 'skill'` with `slot` 0, 1 or 2 |
  | Other skill | `source: 'skill'` without a slot, such as Hellfire Brand explosions |
  | Reaction splash | `source: 'reaction'` (Overload, Combust) |
  | Damage over time | `source: 'dot'` |
  | Thorns | `source: 'thorns'` |

  Melt, Shatter and Soulfire multiply the hit that triggered them, so their damage stays in that hit's bucket.
- **Summary:** DPS over the last 5 s of sim time, total damage, biggest hit, and hits and damage per bucket.
- **Reactions:** counted by name from `reaction` events.

### Anvil

A **Training Grounds** button (`data-testid="training-button"`) next to Dive, which navigates to `/delve/training`. It is always enabled, because the sandbox never touches the save.

## Art

A training dummy sprite: a straw dummy on a post with a target on its chest.

- **Source:** code-drawn (`art/alloy/sprites/dummy.ts`), 16 × 16 px (size 1), with 2 frames (a slight sway).
- **Registration:** it is listed in `art/alloy/manifest.json` as `dummy`, with the atlas rebuilt by `pnpm -F @alloy/pixel-forge forge build`.
- **Atlas test:** `sprite-atlas.test.ts` learns about the `dummy` id (size 1) alongside `hero` and the monsters.

## Testing

Engine (TDD, `tests/delve-training.test.ts`):

- **World:**
  - A sandbox world has no packs and no boss (depth 5 included), never clears, and puts the hero at `heroStart`.
  - Killing a real monster drops nothing, but heal on kill still works.
- **Dummies:**
  - Lethal damage resets them to full, and the same hit still applies its status.
  - They are exempt from execute.
  - A Neutral dummy takes no resist or weakness; a fire dummy resists fire.
  - They never move or attack. Knockback and pull move them; the hero walking into one doesn't.
  - `resetDummies` restores position, life, statuses and knockback.
  - Every layout stays inside the arena, and a row's spacing lets a chain jump.
- **Spawner:**
  - It creates the chosen definition and kind at the depth's scaling, with its home element, inside the arena, already aggroed with `nextSpecialAt = t + 4`.
  - A boss sets `bossId`.
  - `clearMonsters` removes the chosen group, and removing the boss clears `bossId`.
- **Toggles:**
  - Infinite mana keeps mana full.
  - No cooldowns lets the same ability fire again right after it lands, and refills charge.
  - Invulnerable takes no life, reports the would-be damage as `blocked`, and still allows a perfect dodge.
  - Fill charge fills charge-paid slots.
  - Respawn restores the hero and clears its action state.
- **Build swaps:**
  - A mid-fight change during that slot's wind-up cancels the wind-up.
  - A Defensive change ends the Ward.
  - Unchanged slots are unaffected.
- **Hit events:** `hit` events carry `source` and `slot`.
- **Stats overrides:**
  - `computeHeroStats` applies `extra` legendaries and attunement (a mastery at 10) as gear would.
  - An extra Prism raises attunement without stacking on gear Prism.
- **Sandbox weapon:** implicits only, deterministic, no legendary.

Client:

- the sandbox store (defaults, Zod fallback, Load my build including the loaded weapon and unarmed);
- the meter (buckets, the sim-time DPS window);
- the ability editor through props;
- `attachKeyboard` ignoring panel keys;
- the renderer removing views of monsters that are gone;
- the Anvil button.

E2E (`e2e/delve-training.spec.ts`):

- enter the Training Grounds;
- add a dummy;
- switch the weapon;
- fire the Primary;
- see the meter chip's total rise.

The dive suites must pass unchanged, which covers the core split.

## Delivery

One plan in two parts, shipped together as **v0.41.0**:

1. **Engine and arena core:** the sandbox engine, stats overrides, hit sources, build swaps, and the `useArenaCore` split. The dive E2E suites guard this part.
2. **Training Grounds:** the page, store, panel, meter, editor refactor, renderer changes and dummy sprite.

The CLAUDE.md Delve section gets a Training Grounds entry.

## Out of scope

- Editing armor and rings beyond **Load my build**.
- Named loadout presets.
- Recording or replaying fights.
- A biome choice separate from depth.
- Hiding undiscovered legendaries or reactions.
