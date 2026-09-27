# Delve Training Grounds Design

**Date:** 2026-09-26
**Status:** Approved in conversation.
**Engine:** `packages/engine/src/arpg/` (a new `sandbox.ts`, `world.ts`, `step.ts`, `combat.ts`), `src/delve/hero-stats.ts`, `src/types/arpg.ts`
**Client:** `packages/client/src/` (a new `pages/DelveTraining.tsx`, a new `features/delve/training/`, a new `stores/sandboxStore.ts`, `features/delve/arena/useArena.ts` split into a core, `features/delve/AbilitiesPanel.tsx`, `pages/DelveCamp.tsx`, `App.tsx`)
**Art:** `packages/pixel-forge` (a training dummy sprite)

## Goal

A place to try any weapon with any ability build, fast. Swap the weapon, legendary powers, attunement and every ability option mid-fight, hit dummies or real monsters, and read what happened. None of it touches the save.

## Decisions

| Question | Decision |
|---|---|
| Save | **A separate loadout.** The sandbox has its own weapon and ability setup. Every weapon, element and rarity is available, and nothing done there changes the real save. **Load my build** copies the current gear and abilities in as a starting point. |
| Access | **A "Training Grounds" button at the Anvil**, next to Dive. It is always visible. |
| Targets | **Training dummies with a damage meter, real monsters, or both at once.** |
| Toggles | **Infinite mana and no cooldowns**, **invulnerable**, **fill charge**, and **slow motion**. |
| Structure | **A shared arena core with its own page.** `useArena` splits into a core (the Pixi app, input, controller, HUD, actions) and two modes: the dive (unchanged) and the sandbox. |

## Engine

Every sandbox rule lives in the engine, as all rules do. The client only asks for things.

### Sandbox world (`src/arpg/sandbox.ts`)

`createSandboxWorld(registry, { depth, stats, abilities, seed })` builds an open arena:

- **Setup:** it uses `createFloorWorld` with a new `empty: true` option (no packs), full life and potions, and no door. Depth sets the biome (as in a dive) and monster strength.
- **Flags:** `world.sandbox` holds the toggles, `{ infiniteMana, noCooldowns, invulnerable }`. It is `null` for a dive.
- **Never ends:** a sandbox world never clears. The tick's clear check skips it, so it never ends even with no monsters left.

### Dummies

- `MonsterEntity` gains `dummy: boolean` (false for real monsters).
- `spawnDummies(registry, world, layout)` places them in front of the hero. The layouts are `'single'`, `'row'` (5 in a line, for chains and lances) and `'clump'` (5 close together, for areas).
- **Stats:** a dummy uses the reference monster's size and armor for the depth. Its life is high, and it resets to full whenever a hit would drop it to 0, so it never dies, never drops loot and never counts as a kill.
- **Behaviour:**
  - `monstersTick` runs its statuses (burns, poison, freezes, reaction timers) but skips its AI: it never moves or attacks.
  - Knockback still moves it.
  - `resetDummies(world)` puts them back where they were spawned and clears their statuses.

### Spawner

`spawnMonsters(registry, world, { defId, kind, count })` creates `count` monsters of any definition from any biome:

- **Kind:** `kind` is `'normal' | 'elite' | 'boss'`.
- **Stats:** they are scaled by the world's depth, as `createMonsterEntity` does.
- **Placement:** they appear in a ring about 6 units from the hero, already aggroed.
- **Clearing:** `clearMonsters(world, which)` removes real monsters, dummies or both.

### Toggles

Each toggle is checked where the rule lives:

- **Infinite mana:** each tick, `heroTick` refills mana to max.
- **No cooldowns:** a cast doesn't set a cooldown and the charge lockout is skipped. The channel still plays, so its timing can be tested.
- **Invulnerable:** in `hurtHero`, the damage becomes 0 at the point where life is taken. Everything else still happens: `heroHit` events, perfect-dodge detection, the riposte and the flash. The hero never dies.
- **Fill charge:** `fillCharge(world)` sets every charge-paid slot to its `chargeNeed`. It is an action, not a toggle.
- **Respawn:** `respawnHero(world)` sets full life, clears `heroDead`, and keeps the hero's position and every monster. It is used when the hero dies with invulnerable off.

### Hit events carry their source

`hit` gains `source` (the existing `HitSource`: `basic`, `skill`, `dot`, `reaction`, `thorns`) and `slot` (the ability slot, for skill hits). They come from `HitOpts`, which already has both. The meter uses them. They are display data, not rules.

### Hero stats overrides

`computeHeroStats(equipped, registry, extra?)` takes an optional `extra`:

- `extra.legendaries` (id → value): merged with gear legendaries, taking the higher value.
- `extra.attunement` (a partial `ManaMap`): added to the gear attunement.

Both are applied before the derived values (life, armor, element power, masteries, mana pool), so every legendary and mastery behaves exactly as it does from gear.

## Client

### Sandbox store (`stores/sandboxStore.ts`)

A Zustand store, saved under `alloy:delve:sandbox:v1` and validated with Zod on load (bad or missing data falls back to the defaults). It is separate from the Delve save.

| Field | Contents |
|---|---|
| `weapon` | `{ baseId, mana, rarity }`. Default: sword, fire, rare. |
| `gear` | The other equipped slots, empty unless filled by **Load my build**. |
| `legendaries` | id → value; each switched-on power at its max roll. |
| `attunement` | Extra attunement per element, 0–15. |
| `abilities` | The three `AbilityBuild`s. Default: the save's defaults. |
| `depth` | 1–30. Default 5. |
| `toggles` | `{ infiniteMana, noCooldowns, invulnerable }`. Default: all on. |
| `slowmo` | Display speed, 0.25–1. Default 1. |

- **Weapon item:** built with `generateItem` from a fixed seed, so the same choice always gives the same item. Its item level follows `depth`.
- **Load my build:** copies the save's equipped gear (weapon base, element, rarity and the other slots) and its abilities.
- **Every change applies live:** gear, legendaries and attunement go through `refreshWorldHero`, and abilities through the same path the Anvil uses. A change of depth rebuilds the world, keeping the dummy layout.

### Shared arena core

`useArena` (561 lines) is split:

- **`useArenaCore(hostRef, mode)`**: the Pixi app, renderer, ticker, keyboard, mouse and controller input, hit-stop, slow-mo, the HUD snapshot, and the cast, dodge and attack actions.
  - It takes a **mode** object: `createWorld()`, `onEvents(world, events)`, `onHeroDead(world)`, plus the loadout (`stats`, `abilities`) to hot-swap and a display speed.
  - The mode decides what the world is and what happens around it.
- **`useArena` (the dive):** the current behaviour, moved into a dive mode: banking pickups, floor completion and failure, and gear from the save. Its API and behaviour don't change, and the dive E2E suites must pass unchanged.
- **`useTrainingArena` (the sandbox):**
  - builds the world with `createSandboxWorld`;
  - feeds the meter;
  - respawns on death;
  - applies the store's toggles to `world.sandbox`;
  - passes `slowmo` as the display speed.

### Training Grounds page (`/delve/training`, `pages/DelveTraining.tsx`)

The arena, the HUD and the usual controls (keyboard, mouse, touch and controller), plus the Training panel. The TabBar is hidden, as in a dive.

- **Opening the panel:** Tab, the menu key (Escape), or the controller's Menu button.
  - **Desktop:** the panel docks on the right and the fight keeps running. Clicks in the panel never reach the arena.
  - **Narrow screens and controller:** it opens as a sheet and pauses the fight, with controller navigation through the existing gamepad menu layer (`data-pad-scope`).
- **Back** returns to the Anvil.
- **Tabs** (`features/delve/training/`):

| Tab | Contents |
|---|---|
| Loadout | Weapon base (7), element (6), rarity (5); legendary powers as toggles with a short description; attunement sliders per element, with the mastery threshold marked; **Load my build**. |
| Abilities | The Anvil's ability editor for all three slots. `AbilitiesPanel`'s editor is refactored to take `builds`, `stats` and `onChange` props; the Anvil keeps a save-bound wrapper. |
| Targets | Add dummies (single, row, clump); spawn monsters (biome, monster, kind, count 1–8); clear monsters, dummies or all; reset dummies; depth. |
| Toggles | Infinite mana + no cooldowns, invulnerable, **Fill charge** (a button), and a slow-motion slider (0.25×, 0.5×, 0.75×, 1×). |
| Meter | DPS over the last 5 s, total damage, biggest hit, hits and damage split by source (Basic, Q, E, R, reactions, damage over time), reactions triggered by name, and **Reset**. |

### Meter (`features/delve/training/meter.ts`)

A pure aggregator over `hit` events: `record(events, now)` and `summary(now)`. It is display-only: it reads events and never changes the world.

### Anvil

A **Training Grounds** button (`data-testid="training-button"`) next to Dive, which navigates to `/delve/training`. It is disabled during an active dive.

## Art

A training dummy sprite: a straw dummy on a post with a target on its chest.

- **Source:** code-drawn (`art/alloy/sprites/dummy.ts`) at 16 px per unit of its size (size 1 gives a 16 px canvas), with 2 frames (a slight sway).
- **Registration:** it is listed in `art/alloy/manifest.json` as `dummy`, with the atlas rebuilt by `pnpm -F @alloy/pixel-forge forge build`.
- **Drawing:** the renderer draws dummies with it, with the usual emoji fallback (🎯).

## Testing

Engine (TDD, `tests/delve-training.test.ts`):

- **World:** a sandbox world has no packs and never clears.
- **Dummies:**
  - They never die: lethal damage resets them to full.
  - They take statuses and reactions and still tick burns.
  - They never move or attack; knockback still moves them.
  - `resetDummies` restores their positions.
- **Spawner:** it creates the chosen definition and kind at the world's depth scaling.
- **Toggles:**
  - Infinite mana keeps mana full.
  - No cooldowns lets the same ability fire again right after it lands.
  - Invulnerable takes no life but still reports hits and allows a perfect dodge.
  - Fill charge fills charge-paid slots.
  - Respawn restores the hero.
- **Hit events:** `hit` events carry `source` and `slot`.
- **Stats overrides:** `computeHeroStats` applies `extra` legendaries and attunement (including masteries at 10) as gear would.

Client:

- the sandbox store (defaults, Zod fallback, Load my build);
- the meter's aggregation;
- the ability editor working through props;
- the Anvil button.

E2E (`e2e/delve-training.spec.ts`):

- enter the Training Grounds;
- add a dummy;
- switch the weapon;
- fire the Primary;
- see the meter's total rise.

The dive suites must pass unchanged, which covers the core split.

## Out of scope

- Editing armor and rings beyond **Load my build**.
- Named loadout presets.
- Recording or replaying fights.
- A biome choice separate from depth.
