# Alloy — Project Handoff Document

**Date:** 2026-03-17
**Status:** Phases 1-3 In Progress (Engine complete, Client playable)

---

## What Is Alloy?

A competitive mobile-friendly auto-battler where two rival blacksmiths draft crafting orbs from a shared pool, privately forge a weapon and armor, and their gladiators auto-duel. Quick sessions (<2 min casual, 4-6 min ranked), deep skill ceiling, zero pay-to-win.

**Full spec:** `docs/superpowers/specs/2026-03-14-alloy-technical-implementation-design.md`
**Implementation plan:** `.claude/plans/delightful-waddling-teacup.md`

---

## Project Structure

```
alloy/
├── packages/
│   ├── engine/          ← Pure TypeScript game engine (COMPLETE)
│   ├── tools/           ← Balance visualization dashboard (COMPLETE)
│   ├── client/          ← React frontend (ACTIVE - Phase 3)
│   └── supabase/        ← Backend (STUB - Phase 4)
├── docs/
│   └── superpowers/specs/   ← Technical design spec
├── package.json             ← pnpm workspace root
├── tsconfig.base.json       ← Shared strict TS config
└── pnpm-workspace.yaml
```

**Tech Stack:** TypeScript (strict), pnpm workspaces, tsup (engine build), Vite (client/tools), Vitest (tests), Zod (data validation), React 19, Recharts (tools charts)

---

## What's Built (Phases 1-2)

### Game Engine (`packages/engine/`) — 167 tests, all passing

The entire game engine is complete, headless, deterministic, and fully tested. Every game system runs as pure functions with immutable state.

**Run tests:** `pnpm -F @alloy/engine test`
**Build:** `pnpm -F @alloy/engine build` (ESM + CJS + DTS)

#### Engine Modules

| Module | Key Files | What It Does |
|--------|-----------|-------------|
| **Types** | `src/types/` (13 files) | Complete type system: AffixDef, OrbInstance, EquippedSlot, ForgedItem, Loadout, MatchState, DerivedStats, CombatLog, TickEvent, ForgeAction, GameAction, etc. |
| **Data Registry** | `src/data/` (5 JSON + 3 TS) | 33 affixes (4 tiers each), 29 combinations, 14 synergies, 14 base items, balance config. Zod-validated at load, O(1) lookups via DataRegistry class. |
| **Seeded RNG** | `src/rng/seeded-rng.ts` | xoshiro128** with `fork()` for subsystem isolation. All randomness is deterministic from seed. |
| **Pool Generator** | `src/pool/` | Generates draft pools with tier distribution, category weighting, archetype validation (3+ viable archetypes), trigger orb guarantees. |
| **Draft System** | `src/draft/` | State machine: alternating picks, validation, auto-pick on timeout. `createDraftState()` → `makePick()` → complete. |
| **Forge System** | `src/forge/forge-state.ts`, `flux-tracker.ts` | All 6 forge actions (assign, combine, upgrade, swap, remove, set base stats) with flux enforcement, round rules, full validation. |
| **Stat Calculator** | `src/forge/stat-calculator.ts` | 9-step pipeline: base HP → inherent bonuses → base stat scaling → weapon/armor slot effects → synergy detection → flat/percent/override ordering → caps. Handles dot-notation keys, special expansion keys, aliases. |
| **Duel Engine** | `src/duel/` (5 files) | Tick-based combat simulation (30 ticks/sec, max 3000). Dodge → block → damage calc (physical + 6 elements) → crit → barrier → HP → triggers → lifesteal → thorns → DOTs → regen → death check. Produces CombatLog for replay. |
| **Match Controller** | `src/match/` | Full lifecycle orchestration: pool → draft → (forge → duel) × 3 → complete. Phase machine with valid transitions. Supports quick/ranked/unranked modes. |
| **AI System** | `src/ai/` (5 files) | 5 AI tiers with strategy pattern. T1 (random) through T5 (exhaustive search with denial scoring). Draft, forge, and adapt strategies per tier. AIController dispatches to tier-appropriate strategy. |
| **Balance Testing** | `src/balance/` (3 files) | Batch simulation runner, aggregate stats collector (pick rates, win rates, synergy/combo usage), balance report generator with automated outlier detection. |

#### Engine Architecture Highlights

- **Immutable state pattern:** `(State, Action) => NewState` — no mutation, fully replayable
- **Config-driven balance:** All game numbers live in JSON, validated by Zod schemas at load
- **Deterministic:** Same seed + same actions = byte-identical output. RNG forks isolate subsystems.
- **Zero UI dependencies:** Engine is a pure TypeScript library, importable anywhere
- **Dual-purpose orbs:** Each orb has different weapon vs armor effects (defined per tier in affixes.json)
- **Flux system:** 8/4/2 flux across 3 rounds with lock/swap/remove mechanics

### Balance Dashboard (`packages/tools/`) — Builds cleanly

A React + Recharts dev tool for running AI simulations and visualizing balance data.

**Dev server:** `pnpm -F @alloy/tools dev`
**Build:** `pnpm -F @alloy/tools build`

Features:
- **Simulation Runner** — configure match count, AI tiers, seed range, run batch sims in-browser
- **Aggregate Analytics** — affix pick rate charts, synergy win rate bars, combination usage scatter plots
- **Match Inspector** — HP curves, damage breakdown pies, event log, stat comparison tables
- **Balance Report** — automated outlier detection (overpowered synergies, underpicked affixes, unused combos)

### Client (`packages/client/`) — Phase 3 In Progress

Full match loop (menu -> draft -> forge -> duel x3 -> result) is playable against AI in-browser.

**Dev server:** `pnpm -F @alloy/client dev`
**Unit tests:** `pnpm -F @alloy/client test`
**E2E tests:** `pnpm -F @alloy/client test:e2e`

#### Forge UI Architecture

The forge screen (`packages/client/src/pages/Forge.tsx`) lets players assign drafted orbs to weapon and armor item slots across 3 rounds.

**Layout:**
- **Header** — "Forge Phase" title, round number, flux counter, countdown timer, "Done Forging" button
- **Tab bar** — Weapon / Armor toggle to switch between the two item panels
- **ItemPanel** — 6-slot grid per item. Empty slots show `+` buttons; filled slots show `OrbIcon` with the placed affix. Clicking an empty slot with a selected orb dispatches `assign_orb`. Clicking a filled slot in rounds 2+ dispatches `remove_orb`.
- **SynergyTracker** — Shows active and partial synergies based on equipped affixes across both items
- **Combination zone** — Lists available compound affix combinations from stockpile orbs
- **Stockpile** — Scrollable grid of unplaced orbs rendered as `OrbIcon` components. Click to select, click again to deselect.
- **Stats preview bar** — Live HP, DMG, Armor, Crit calculated from current loadout via `calculateStats()`

**State management:**
- `matchStore` (Zustand) — holds the authoritative `MatchState`, dispatches `GameAction`s to the engine
- `forgeStore` (Zustand) — UI-only state: active tab (weapon/armor), selected orb UID, drag source, combination panel visibility

**Engine integration:**
- The engine's `ForgePlan` model validates all forge actions (assign, remove, combine, upgrade, swap, set base stats) with flux cost enforcement
- Flux budget: 8/4/2 across rounds 1/2/3
- Round 1 locks placed orbs (no removal); rounds 2-3 allow removal at flux cost
- AI opponent forges automatically via `AIController.planForge()` when the player clicks "Done Forging"

#### Client Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| Forge page component | 17 vitest tests | Added |
| forgeStore | 6 vitest tests | Passing |
| draftStore | 7 vitest tests | Passing |
| useCountdown hook | 7 vitest tests | Passing |
| useGemSize hook | 5 vitest tests | Passing |
| uiStore | 4 vitest tests | Passing |
| E2E match flow | 1 Playwright test | Passing |
| E2E forge redesign | 8 Playwright tests | Added |

---

## Known Issues & Technical Debt

1. **Trigger system is stubbed:** `src/duel/trigger-system.ts` `extractTriggers()` returns an empty array. The duel engine architecture supports triggers, but the data-driven extraction from loadout affixes isn't wired up yet. Compound affix triggers (e.g., Ignite's burn-on-hit) defined in `combinations.json` under `compound.*` stat keys need to be parsed into `TriggerDef` objects.

2. **Some base stat scaling keys skip:** Keys like `flatDamageEffectiveness`, `dotDamage`, `barrierStrength`, `sustainEffectiveness` in `balance.json`'s `baseStatScaling` are skipped in stat calc (they don't map directly to `DerivedStats` fields). These would need duel engine integration to have gameplay impact.

3. **Synergy conditions not fully parsed:** Some synergies in `synergies.json` have special `condition` strings like `no_defensive_weapon`, `any_3_elemental`, `lifesteal_weapon_thorns_armor`. The current synergy detection in stat-calculator checks required affix IDs but doesn't evaluate these condition strings.

4. **Balance tuning not done:** The 1000+ match simulation pass to verify no synergy >55% win rate and no affix <5% pick rate hasn't been run yet. The infrastructure exists — it just needs to be executed and the data files tuned based on results.

5. **Engine build has strict mode:** tsup DTS generation enforces `noUnusedLocals`, which has caught several issues already. Any new code must be clean.

---

## What's Next (Phases 3-6)

### Phase 3: Frontend Foundation (Next Up)

This is where the game becomes playable in a browser. The engine is complete — Phase 3 layers React UI on top.

#### Step 3.1: Client Project Setup
- Initialize `packages/client/` with Vite + React 19 + TypeScript
- Install Tailwind CSS 4, Zustand, React Router 7
- Create 11 page stubs matching route map:
  - `/` MainMenu, `/queue` Matchmaking, `/match/:id/draft` Draft, `/match/:id/forge` Forge, `/match/:id/duel` Duel, `/match/:id/adapt` Adapt, `/match/:id/result` PostMatch, `/profile` Profile, `/recipes` RecipeBook, `/collection` Collection, `/leaderboard` Leaderboard
- Set up design tokens (dark theme, element colors, tier borders)

#### Step 3.2: Shared Components
- `OrbIcon.tsx` — colorblind-safe orb rendering (element icon + shape + color + tier border)
- `Timer.tsx`, `Modal.tsx`, `Tooltip.tsx`, `HapticButton.tsx`
- `useHaptic.ts`, `useCountdown.ts`, `useOrientation.ts` hooks

#### Step 3.3: Zustand Stores
- 7 stores: auth, match, draft, forge, duel, ui, profile
- These bridge the engine's pure state with React's reactive UI

#### Step 3.4: Draft Screen
- Tappable orb pool grid, two-tap confirm, stockpile panels, turn indicator
- Wire up with AI opponent (engine's AIController) for local play
- **Milestone:** Full draft playable against Tier 1 AI in browser

#### Step 3.5: Forge Screen (COMPLETE)
- Tabbed weapon/armor item panels with 6-slot grids and OrbIcon rendering
- Click-to-select orb placement, combination zone, flux counter, synergy tracker, base stat selector
- Live stats preview bar (HP, DMG, Armor, Crit) from engine's `calculateStats()`
- 17 component tests + 8 E2E tests covering forge interactions
- **Milestone:** Full forging with click placement, combinations, synergies displayed

#### Step 3.6: Duel Screen (Basic)
- HP bars, status effects, round counter, post-duel breakdown
- Basic text/UI duel playback (no PixiJS yet)
- **Milestone:** Full match (draft → forge → duel × 3) playable vs AI

#### Step 3.7: PixiJS Duel Rendering
- Animated 2D sprites with attack/hit/death states
- VFX particles per element (fire, ice, lightning, poison, shadow, chaos)
- Floating damage numbers, CombatLog-driven animation timeline
- **Milestone:** Duels render with full visual effects

### Phase 4: Backend + Multiplayer
- Supabase setup (Postgres, RLS, auth providers)
- Edge functions for matchmaking, draft picks, forge submission, match completion
- Real-time multiplayer via Supabase Broadcast channels
- ELO-based matchmaking with expanding window

### Phase 5: Meta + Polish
- Profile, progression, mastery tracks, unlock flow
- Recipe book, collection, leaderboard
- Match polish (rematch, stats breakdown, onboarding tutorial)
- Visual polish (VFX refinement, transitions, sound)

### Phase 6: Launch Prep
- E2E Playwright tests, mobile performance (60fps), accessibility
- First ranked season, seasonal reset logic
- Analytics integration (PostHog/Mixpanel)

---

## How to Work With the Engine

### Running a full AI match programmatically

```typescript
import { loadAndValidateData } from '@alloy/engine/src/data/loader';
import { DataRegistry } from '@alloy/engine/src/data/registry';
import { createMatch, applyAction, AIController, SeededRNG } from '@alloy/engine';

const data = loadAndValidateData();
const registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);

let state = createMatch('match1', 42, 'ranked', ['player1', 'player2'], 'sword', 'chainmail', registry);

const ai0 = new AIController(3, registry, new SeededRNG(42).fork('ai0'));
const ai1 = new AIController(3, registry, new SeededRNG(42).fork('ai1'));

// Draft all orbs
while (state.phase.kind === 'draft') {
  const player = state.phase.activePlayer;
  const ai = player === 0 ? ai0 : ai1;
  const orbUid = ai.pickOrb(state.pool, state.players[player].stockpile, state.players[1-player].stockpile);
  const result = applyAction(state, { kind: 'draft_pick', player, orbUid }, registry);
  if (result.ok) state = result.state;
}

// Forge + Duel loop
while (state.phase.kind !== 'complete') {
  if (state.phase.kind === 'forge') {
    for (const player of [0, 1] as const) {
      const ai = player === 0 ? ai0 : ai1;
      const actions = ai.planForge(state.players[player].stockpile, state.players[player].loadout, state.forgeFlux?.[player] ?? 0, state.phase.round, state.players[1-player].stockpile);
      for (const action of actions) {
        const r = applyAction(state, { kind: 'forge_action', player, action }, registry);
        if (r.ok) state = r.state;
      }
      const r = applyAction(state, { kind: 'forge_complete', player }, registry);
      if (r.ok) state = r.state;
    }
  }
  if (state.phase.kind === 'duel') {
    const r = applyAction(state, { kind: 'advance_phase' }, registry);
    if (r.ok) state = r.state;
  }
}

console.log('Winner:', state.phase.kind === 'complete' ? state.phase.winner : 'unknown');
```

### Running balance simulations

```typescript
import { runSimulation, generateBalanceReport } from '@alloy/engine';

const result = runSimulation({
  matchCount: 100,
  aiTier1: 3,
  aiTier2: 3,
  seedStart: 1,
  mode: 'ranked',
  baseWeaponId: 'sword',
  baseArmorId: 'chainmail',
}, registry);

const issues = generateBalanceReport(result.aggregateStats);
issues.forEach(i => console.log(`${i.severity}: ${i.type} — ${i.id} (${i.metric}: ${i.value})`));
```

### Adding a new affix

1. Add the definition to `packages/engine/src/data/affixes.json` with 4 tiers, weapon/armor effects
2. Update the expected count in `tests/data.test.ts` (currently 33)
3. Run `pnpm -F @alloy/engine test` to verify schema validation passes
4. Run simulations via the balance dashboard to check impact

### Adding a new combination

1. Add to `packages/engine/src/data/combinations.json` with component IDs, effects, tags
2. Update the expected count in `tests/data.test.ts` (currently 29)
3. The registry's order-independent lookup (`getCombination(a, b)`) handles it automatically

---

## Quick Commands

```bash
# Install all dependencies
pnpm install

# Run engine tests (167 tests, ~1s)
pnpm -F @alloy/engine test

# Build engine (ESM + CJS + DTS)
pnpm -F @alloy/engine build

# Start balance dashboard dev server
pnpm -F @alloy/tools dev

# Build balance dashboard
pnpm -F @alloy/tools build
```

---

## File Inventory Summary

| Package | Source Files | Test Files | LOC (approx) | Status |
|---------|-------------|------------|--------------|--------|
| `@alloy/engine` | 43 | 11 (167 tests) | ~6,300 | Complete |
| `@alloy/tools` | 8 | — | ~1,300 | Complete |
| `@alloy/client` | ~30 | 7 (46+ tests) | ~3,500 | Active |
| `@alloy/supabase` | — | — | — | Stub |
| Data files (JSON) | 5 | — | ~1,700 | Complete |
| **Total** | **56** | **11** | **~9,300** | |
