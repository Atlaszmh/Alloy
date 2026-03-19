# Simulation & Balance Tool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `packages/tools/` into a full simulation and balance analysis platform with data-driven game config, parallel simulation, Supabase persistence, and unified match reporting.

**Architecture:** Node.js backend with Express + worker threads for parallel simulation, React SPA frontend with config editing and analytics, Supabase PostgreSQL for persistence. Engine refactored to accept runtime `GameConfig` overrides. Unified `MatchReport` schema for both simulated and live matches.

**Tech Stack:** TypeScript, Node worker_threads, Express, SSE, React 19, Recharts, Monaco Editor, Supabase (PostgreSQL), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-simulation-tool-design.md`

---

## File Structure

### Engine Changes (`packages/engine/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/game-config.ts` | Create | `GameConfig` interface unifying `LoadedData` + `BalanceConfig` |
| `src/types/match-report.ts` | Create | `MatchReport`, `PlayerReport`, `RoundReport` interfaces |
| `src/types/balance.ts` | Modify | Add `statCaps` field to `BalanceConfig` |
| `src/types/combat.ts` | Modify | Add `p0DamageDealt`, `p1DamageDealt` to `DuelResult` |
| `src/data/loader.ts` | Modify | Add `loadGameConfig()` with optional overrides |
| `src/data/game-config.ts` | Create | `defaultConfig()`, `mergeConfig()`, `GameConfigSchema` Zod validator |
| `src/match/match-report.ts` | Create | `extractMatchReport()` function |
| `src/duel/duel-engine.ts` | Modify | Track cumulative damage dealt per player |
| `src/balance/simulation-runner.ts` | Modify | Accept `GameConfig`, return `MatchReport[]` |
| `src/index.ts` | Modify | Export new types and functions |

### Supabase Schema (`packages/supabase/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `migrations/007_simulation_tables.sql` | Create | All 5 new tables + indexes |

### Tools Backend (`packages/tools/server/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `index.ts` | Create | Express server entry point |
| `routes/simulations.ts` | Create | POST/GET/cancel simulation endpoints |
| `routes/configs.ts` | Create | CRUD for GameConfig |
| `routes/reports.ts` | Create | Aggregated query endpoints |
| `worker.ts` | Create | Worker thread — runs simulation batches |
| `worker-pool.ts` | Create | Manages worker lifecycle, distributes work |
| `supabase.ts` | Create | Supabase client + batch insert helpers |
| `sse.ts` | Create | SSE connection manager for progress streaming |

### Tools Frontend (`packages/tools/src/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `App.tsx` | Modify | New tab layout, routing to new pages |
| `api/client.ts` | Create | API client for backend endpoints |
| `api/sse.ts` | Create | SSE client with reconnection fallback |
| `pages/SimulationPage.tsx` | Create | Run config + progress + results |
| `pages/ConfigEditorPage.tsx` | Create | Hybrid form/raw config editor |
| `pages/BalancePage.tsx` | Create | Balance tab visualizations |
| `pages/RoundAnalysisPage.tsx` | Create | Per-round breakdown tab |
| `pages/DistributionsPage.tsx` | Create | Statistical distribution charts |
| `pages/MetaEvolutionPage.tsx` | Create | Cross-config comparison |
| `pages/MatchInspectorPage.tsx` | Create | Enhanced match inspector |
| `components/ConfigFormEditor.tsx` | Create | Tree nav + form fields for config |
| `components/ConfigRawEditor.tsx` | Create | Monaco JSON editor |
| `components/RunProgress.tsx` | Create | Progress bar + SSE status |
| `components/GlobalFilters.tsx` | Create | Shared filter bar across tabs |
| `components/charts/WinRateMatrix.tsx` | Create | Affix win rate matrix |
| `components/charts/MatchupHeatmap.tsx` | Create | Archetype matchup grid |
| `components/charts/DamageHistogram.tsx` | Create | Damage distribution charts |
| `components/charts/StatBoxPlot.tsx` | Create | Stat distribution box plots |
| `hooks/useSimulation.ts` | Modify | Delegate to backend API instead of in-browser |

---

## Chunk 1: Engine Foundation — GameConfig & Match Reporting

### Task 1: GameConfig Type & Zod Schema

**Files:**
- Create: `packages/engine/src/types/game-config.ts`
- Create: `packages/engine/src/data/game-config.ts`
- Modify: `packages/engine/src/types/balance.ts`
- Test: `packages/engine/tests/game-config.test.ts`

- [ ] **Step 1: Write test for defaultConfig round-trip**

```typescript
// packages/engine/tests/game-config.test.ts
import { describe, it, expect } from 'vitest';
import { defaultConfig, GameConfigSchema } from '../src/data/game-config.js';
import { loadAndValidateData } from '../src/data/loader.js';

describe('GameConfig', () => {
  it('defaultConfig passes Zod validation', () => {
    const config = defaultConfig();
    const result = GameConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('defaultConfig produces identical data to loadAndValidateData', () => {
    const config = defaultConfig();
    const loaded = loadAndValidateData();
    expect(config.affixes).toEqual(loaded.affixes);
    expect(config.combinations).toEqual(loaded.combinations);
    expect(config.synergies).toEqual(loaded.synergies);
    expect(config.baseItems).toEqual(loaded.baseItems);
    expect(config.balance).toEqual(loaded.balance);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/game-config.test.ts`
Expected: FAIL — `game-config.js` module not found

- [ ] **Step 3: Add statCaps to BalanceConfig type**

In `packages/engine/src/types/balance.ts`, add to the `BalanceConfig` interface:

```typescript
statCaps: Record<string, { min: number; max: number }>;
```

- [ ] **Step 4: Add statCaps to balance.json**

In `packages/engine/src/data/balance.json`, add a `statCaps` field with current hardcoded caps from `packages/engine/src/forge/stat-calculator.ts`. **Note:** Wiring stat-calculator.ts to read caps from the config instead of hardcoded values is deferred — it will be a follow-up task. For now, statCaps exists in the config as data but stat-calculator still uses its own constants.

```json
"statCaps": {
  "critChance": { "min": 0, "max": 0.95 },
  "dodgeChance": { "min": 0, "max": 0.75 },
  "blockChance": { "min": 0, "max": 0.75 },
  "fireResistance": { "min": 0, "max": 0.90 },
  "iceResistance": { "min": 0, "max": 0.90 },
  "lightningResistance": { "min": 0, "max": 0.90 },
  "poisonResistance": { "min": 0, "max": 0.90 }
}
```

- [ ] **Step 5: Update BalanceConfigSchema in schemas.ts**

Add `statCaps` to the Zod schema in `packages/engine/src/data/schemas.ts`:

```typescript
statCaps: z.record(z.string(), z.object({
  min: z.number(),
  max: z.number(),
})),
```

- [ ] **Step 6: Create GameConfig type**

```typescript
// packages/engine/src/types/game-config.ts
import type { AffixDef } from './affix.js';
import type { CompoundAffixDef } from './compound.js';
import type { SynergyDef } from './synergy.js';
import type { BaseItemDef } from './base-item.js';
import type { BalanceConfig } from './balance.js';

export interface GameConfig {
  version: string;
  name: string;
  affixes: AffixDef[];
  combinations: CompoundAffixDef[];
  synergies: SynergyDef[];
  baseItems: BaseItemDef[];
  balance: BalanceConfig;
}
```

- [ ] **Step 7: Create game-config.ts with defaultConfig, schema, and mergeConfig**

```typescript
// packages/engine/src/data/game-config.ts
import { z } from 'zod';
import { loadAndValidateData } from './loader.js';
import type { GameConfig } from '../types/game-config.js';
import { AffixesSchema, CombinationsSchema, SynergiesSchema, BaseItemsSchema, BalanceConfigSchema } from './schemas.js';

export const GameConfigSchema = z.object({
  version: z.string(),
  name: z.string(),
  affixes: AffixesSchema,
  combinations: CombinationsSchema,
  synergies: SynergiesSchema,
  baseItems: BaseItemsSchema,
  balance: BalanceConfigSchema,
});

export function defaultConfig(): GameConfig {
  const data = loadAndValidateData();
  return {
    version: '1.0.0',
    name: 'baseline',
    affixes: data.affixes,
    combinations: data.combinations,
    synergies: data.synergies,
    baseItems: data.baseItems,
    balance: data.balance,
  };
}

/**
 * Shallow merge: top-level GameConfig fields are replaced, balance fields
 * are one-level merged. This means passing { balance: { statCaps: {...} } }
 * will preserve other balance fields like fluxPerRound. Deeper nesting
 * (e.g., replacing one tier within an affix) requires passing the full
 * affixes array.
 */
export function mergeConfig(
  base: GameConfig,
  overrides: Partial<GameConfig>,
): GameConfig {
  return {
    ...base,
    ...overrides,
    balance: overrides.balance
      ? { ...base.balance, ...overrides.balance }
      : base.balance,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run tests/game-config.test.ts`
Expected: PASS — both tests green

- [ ] **Step 9: Run full engine test suite to verify no regressions**

Run: `cd packages/engine && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/types/game-config.ts packages/engine/src/data/game-config.ts \
  packages/engine/src/types/balance.ts packages/engine/src/data/balance.json \
  packages/engine/src/data/schemas.ts packages/engine/tests/game-config.test.ts
git commit -m "feat(engine): add GameConfig type, defaultConfig, and mergeConfig"
```

---

### Task 2: Track Damage Dealt in Duel Engine

**Files:**
- Modify: `packages/engine/src/types/combat.ts`
- Modify: `packages/engine/src/duel/duel-engine.ts`
- Test: `packages/engine/tests/duel-damage-tracking.test.ts`

- [ ] **Step 1: Write test for damage tracking**

```typescript
// packages/engine/tests/duel-damage-tracking.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../src/duel/duel-engine.js';
import { DataRegistry, loadAndValidateData } from '../src/data/index.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import { AIController } from '../src/ai/ai-controller.js';

describe('Duel damage tracking', () => {
  // Shared setup: run a quick AI match to get valid loadouts and stats
  function runQuickMatch(seed: number) {
    const data = loadAndValidateData();
    const registry = new DataRegistry(
      data.affixes, data.combinations, data.synergies,
      data.baseItems, data.balance,
    );
    // Use AIController to drive a match through draft+forge to get valid loadouts
    // Then extract the DerivedStats and Loadouts for the duel.
    // Implementation agent: read simulation-runner.ts to see how it drives
    // a match through phases. The key is to get the MatchState after forge
    // completes for both players, then call simulate() directly.
    // Alternatively, drive the full match and check state.duelLogs.
    const ai = new AIController(registry);
    let state = createMatch('test', seed, 'quick', ['ai-0', 'ai-1'], 'sword', 'chainmail', registry);
    // ... drive through draft and forge using ai.pickDraft() and ai.planForge() ...
    // ... then run the duel and return the CombatLog ...
    return { data, registry, state };
  }

  it('DuelResult includes non-negative damage dealt for both players', () => {
    const { state } = runQuickMatch(42);
    // After match completion, check duelLogs
    const duelResult = state.duelLogs[0]; // first round
    expect(duelResult.p0DamageDealt).toBeGreaterThanOrEqual(0);
    expect(duelResult.p1DamageDealt).toBeGreaterThanOrEqual(0);
    expect(duelResult.p0DamageDealt + duelResult.p1DamageDealt).toBeGreaterThan(0);
  });

  it('total damage dealt is positive for both players', () => {
    const { state } = runQuickMatch(99);
    const duelResult = state.duelLogs[0];
    expect(duelResult.p0DamageDealt).toBeGreaterThan(0);
    expect(duelResult.p1DamageDealt).toBeGreaterThan(0);
  });
});
```

Implementation agent: read `simulation-runner.ts` to understand how to drive a match through all phases using `AIController`. The `runQuickMatch` helper above needs to be completed with the actual phase-driving loop (draft picks → forge actions → advance to duel). The key assertions check `DuelResult.p0DamageDealt` and `p1DamageDealt`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/duel-damage-tracking.test.ts`
Expected: FAIL — `p0DamageDealt` property doesn't exist on DuelResult

- [ ] **Step 3: Add damage fields to DuelResult type**

In `packages/engine/src/types/combat.ts`, add to `DuelResult`:

```typescript
p0DamageDealt: number;
p1DamageDealt: number;
```

- [ ] **Step 4: Track damage in duel-engine.ts simulate()**

In `packages/engine/src/duel/duel-engine.ts`:
- Initialize two accumulators at the top of `simulate()`: `let p0Damage = 0; let p1Damage = 0;`
- After each damage application (physical, elemental, DOT, thorns, reflect), add the actual damage dealt to the appropriate accumulator
- Include the accumulators in the returned `DuelResult`: `p0DamageDealt: p0Damage, p1DamageDealt: p1Damage`

Read the `simulate()` function carefully to find all damage application points. Key locations:
- After physical + elemental damage is applied to HP
- After DOT tick damage is applied
- After thorns damage is applied
- After reflect damage is applied

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/duel-damage-tracking.test.ts`
Expected: PASS

- [ ] **Step 6: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: All tests pass (DuelResult type change may require updating existing test assertions that construct DuelResult objects)

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/types/combat.ts packages/engine/src/duel/duel-engine.ts \
  packages/engine/tests/duel-damage-tracking.test.ts
git commit -m "feat(engine): track cumulative damage dealt per player in DuelResult"
```

---

### Task 3: MatchReport Type & extractMatchReport

**Files:**
- Create: `packages/engine/src/types/match-report.ts`
- Create: `packages/engine/src/match/match-report.ts`
- Test: `packages/engine/tests/match-report.test.ts`

- [ ] **Step 1: Write test for extractMatchReport**

```typescript
// packages/engine/tests/match-report.test.ts
import { describe, it, expect } from 'vitest';
import { extractMatchReport } from '../src/match/match-report.js';
import { createMatch, applyAction } from '../src/match/match-controller.js';
import { AIController } from '../src/ai/ai-controller.js';
import { DataRegistry, loadAndValidateData } from '../src/data/index.js';

describe('extractMatchReport', () => {
  it('produces a valid MatchReport from a completed AI match', () => {
    const data = loadAndValidateData();
    const registry = new DataRegistry(
      data.affixes, data.combinations, data.synergies,
      data.baseItems, data.balance,
    );
    // Run a quick AI match to completion using AIController
    // (Implementation agent: use the pattern from simulation-runner.ts)
    let state = createMatch('test-1', 42, 'quick', ['ai-0', 'ai-1'], 'sword', 'chainmail', registry);
    const ai = new AIController(registry);
    // ... drive match to completion ...

    const report = extractMatchReport(state, 'simulation', 42);
    expect(report.source).toBe('simulation');
    expect(report.seed).toBe(42);
    expect([0, 1, null]).toContain(report.winner);
    expect(report.rounds).toBeGreaterThanOrEqual(1);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.players).toHaveLength(2);
    expect(report.players[0].affixIds).toBeInstanceOf(Array);
    expect(report.players[0].loadout).toBeDefined();
    expect(report.roundDetails).toHaveLength(report.rounds);
    expect([0, 1]).toContain(report.roundDetails[0].winner);
    expect(report.roundDetails[0].p0DamageDealt).toBeGreaterThanOrEqual(0);
  });
});
```

Note: Implementation agent should follow the match-driving pattern in `simulation-runner.ts` (lines 42-90) to run the AI match to completion.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/match-report.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create MatchReport types**

```typescript
// packages/engine/src/types/match-report.ts
import type { Loadout } from './item.js';

export interface MatchReport {
  seed?: number;
  source: 'simulation' | 'live';
  winner: 0 | 1 | null;
  rounds: number;
  durationMs: number;
  players: PlayerReport[];
  roundDetails: RoundReport[];
  combatLog?: unknown[];  // optional full tick data
}

export interface PlayerReport {
  playerIndex: 0 | 1;
  aiTier?: number;
  finalHP: number;
  affixIds: string[];
  combinationIds: string[];
  synergyIds: string[];
  loadout: Loadout;
}

export interface RoundReport {
  round: number;
  winner: 0 | 1;
  durationTicks: number;
  p0HpFinal: number;
  p1HpFinal: number;
  p0DamageDealt: number;
  p1DamageDealt: number;
}
```

- [ ] **Step 4: Implement extractMatchReport**

```typescript
// packages/engine/src/match/match-report.ts
import type { MatchState } from '../types/match.js';
import type { MatchReport, PlayerReport, RoundReport } from '../types/match-report.js';

export function extractMatchReport(
  state: MatchState,
  source: 'simulation' | 'live',
  seed?: number,
): MatchReport {
  // Field-to-source mapping:
  //
  // MatchReport.winner       ← state.winner (0 | 1 | 'draw' → map 'draw' to null)
  // MatchReport.rounds       ← state.duelLogs.length
  // MatchReport.durationMs   ← sum of state.duelLogs[].duration * 1000
  //
  // PlayerReport (for each player index 0, 1):
  //   .finalHP      ← state.duelLogs[last].finalHP[playerIndex]
  //   .loadout      ← state.players[playerIndex].loadout
  //   .affixIds     ← iterate loadout.weapon.slots + loadout.armor.slots,
  //                    collect orb.affixId from each occupied slot
  //   .combinationIds ← iterate slots, for compound slots collect the
  //                      compound's affixId (compound slots have a compoundId field)
  //   .synergyIds   ← check which synergies are active by testing if
  //                    required affixIds appear on both weapon AND armor
  //                    (use registry.getAllSynergies() to check)
  //
  // RoundReport (for each duelLog entry):
  //   .round        ← duelLog.round
  //   .winner       ← duelLog.winner
  //   .durationTicks ← duelLog.tickCount (NOT duelLog.duration which is seconds)
  //   .p0HpFinal    ← duelLog.finalHP[0]
  //   .p1HpFinal    ← duelLog.finalHP[1]
  //   .p0DamageDealt ← duelLog.p0DamageDealt (added in Task 2)
  //   .p1DamageDealt ← duelLog.p1DamageDealt (added in Task 2)
  //
  // Implementation agent: read MatchState and DuelResult types to verify
  // exact field names and access patterns.
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/match-report.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/types/match-report.ts packages/engine/src/match/match-report.ts \
  packages/engine/tests/match-report.test.ts
git commit -m "feat(engine): add MatchReport type and extractMatchReport function"
```

---

### Task 4: Update simulation-runner to use GameConfig

**Files:**
- Modify: `packages/engine/src/balance/simulation-runner.ts`
- Test: `packages/engine/tests/simulation-runner.test.ts` (existing, update)

- [ ] **Step 1: Write test for GameConfig-based simulation**

Add to existing simulation runner tests (or create new file):

```typescript
// packages/engine/tests/simulation-config.test.ts
import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/balance/simulation-runner.js';
import { defaultConfig } from '../src/data/game-config.js';
import { DataRegistry } from '../src/data/registry.js';

describe('runSimulation with GameConfig', () => {
  it('accepts a GameConfig and produces MatchReport results', () => {
    const config = defaultConfig();
    const registry = new DataRegistry(
      config.affixes, config.combinations, config.synergies,
      config.baseItems, config.balance,
    );
    const result = runSimulation({
      matchCount: 5,
      aiTier1: 3,
      aiTier2: 3,
      seedStart: 100,
      mode: 'quick',
      baseWeaponId: 'sword',
      baseArmorId: 'chainmail',
    }, registry);

    expect(result.matches).toHaveLength(5);
    // Verify MatchReport fields are present
    expect(result.matches[0].players).toBeDefined();
    expect(result.matches[0].roundDetails).toBeDefined();
    expect(result.matches[0].source).toBe('simulation');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run tests/simulation-config.test.ts`
Expected: FAIL — `matches[0].players` undefined (old MatchSummary format)

- [ ] **Step 3: Update simulation-runner to return MatchReport**

Modify `packages/engine/src/balance/simulation-runner.ts`:
- Import `extractMatchReport` from `match-report.ts`
- After each match completes, call `extractMatchReport(state, 'simulation', seed)`
- Update `SimulationResult.matches` type from `MatchSummary[]` to `MatchReport[]`
- Remove `MatchSummary` type — it is fully replaced by `MatchReport`. Type mapping: `MatchSummary.winner` (`0 | 1 | 'draw'`) → `MatchReport.winner` (`0 | 1 | null`); `MatchSummary.duelResults` → `MatchReport.roundDetails`; `MatchSummary.player0Affixes` → `MatchReport.players[0].affixIds`
- Update `computeAggregateStats()` to accept `MatchReport[]` instead of `MatchSummary[]`
- The existing tools frontend `useSimulation` hook also references `MatchSummary` fields — it will be replaced by the backend API in Task 10, so no need to update it

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run tests/simulation-config.test.ts`
Expected: PASS

- [ ] **Step 5: Run full engine test suite**

Run: `cd packages/engine && npx vitest run`
Expected: All tests pass. If existing tests reference `MatchSummary` fields, update them to use `MatchReport` equivalents.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/balance/simulation-runner.ts \
  packages/engine/tests/simulation-config.test.ts
git commit -m "feat(engine): update simulation-runner to use GameConfig and return MatchReport"
```

---

### Task 5: Export new types and functions from engine

**Files:**
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/types/index.ts`

- [ ] **Step 1: Add exports to types/index.ts**

Add to `packages/engine/src/types/index.ts`:

```typescript
export type { GameConfig } from './game-config.js';
export type { MatchReport, PlayerReport, RoundReport } from './match-report.js';
```

- [ ] **Step 2: Add exports to src/index.ts**

Add to `packages/engine/src/index.ts`:

```typescript
export { defaultConfig, mergeConfig, GameConfigSchema } from './data/game-config.js';
export { extractMatchReport } from './match/match-report.js';
```

- [ ] **Step 3: Verify engine builds**

Run: `cd packages/engine && npx tsup`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/src/types/index.ts
git commit -m "feat(engine): export GameConfig, MatchReport, and related functions"
```

---

## Chunk 2: Supabase Schema & Tools Backend

### Task 6: Supabase Migration — Simulation Tables

**Files:**
- Create: `packages/supabase/migrations/007_simulation_tables.sql`

- [ ] **Step 1: Check next migration number**

Run: `ls packages/supabase/migrations/` and use the next available number (expected: 007, but verify no other branch has claimed it). Adjust filename if needed.

- [ ] **Step 2: Write migration SQL**

```sql
-- packages/supabase/migrations/007_simulation_tables.sql

-- Game config versions
CREATE TABLE game_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  config jsonb NOT NULL,
  parent_id uuid REFERENCES game_configs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_game_configs_parent ON game_configs(parent_id);

-- Simulation runs
CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES game_configs(id),
  match_count int NOT NULL,
  ai_tiers int[] NOT NULL,
  seed_start int NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'cancelled', 'failed')),
  progress float NOT NULL DEFAULT 0.0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_simulation_runs_config ON simulation_runs(config_id, status);

-- Unified match results (simulation + live)
CREATE TABLE match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES simulation_runs(id),
  config_id uuid REFERENCES game_configs(id),
  source text NOT NULL CHECK (source IN ('simulation', 'live')),
  seed int,
  winner int,
  rounds int NOT NULL,
  duration_ms float NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_results_run ON match_results(run_id);
CREATE INDEX idx_match_results_config ON match_results(config_id);
CREATE INDEX idx_match_results_source ON match_results(source);

-- Per-player stats for each match
CREATE TABLE match_player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  player_index int NOT NULL CHECK (player_index IN (0, 1)),
  ai_tier int,
  user_id uuid REFERENCES auth.users(id),
  final_hp float NOT NULL,
  affix_ids text[] NOT NULL DEFAULT '{}',
  combination_ids text[] NOT NULL DEFAULT '{}',
  synergy_ids text[] NOT NULL DEFAULT '{}',
  loadout jsonb NOT NULL
);

CREATE INDEX idx_match_player_stats_match ON match_player_stats(match_id);

-- Per-round details
CREATE TABLE match_round_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  round int NOT NULL,
  winner int NOT NULL CHECK (winner IN (0, 1)),
  duration_ticks int NOT NULL,
  p0_hp_final float NOT NULL,
  p1_hp_final float NOT NULL,
  p0_damage_dealt float NOT NULL,
  p1_damage_dealt float NOT NULL,
  combat_log jsonb
);

CREATE INDEX idx_match_round_details_match ON match_round_details(match_id);
```

- [ ] **Step 3: Verify SQL syntax**

Run: `cd packages/supabase && supabase db reset --dry-run` (or review manually if supabase CLI not available locally)
Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add packages/supabase/migrations/007_simulation_tables.sql
git commit -m "feat(supabase): add simulation tables migration (game_configs, runs, results)"
```

---

### Task 7: Tools Backend — Express Server & Supabase Client

**Files:**
- Create: `packages/tools/server/index.ts`
- Create: `packages/tools/server/supabase.ts`
- Modify: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.server.json`

- [ ] **Step 1: Add backend dependencies**

```bash
cd packages/tools && pnpm add express cors @supabase/supabase-js
cd packages/tools && pnpm add -D @types/express @types/cors tsx
```

- [ ] **Step 2: Create server tsconfig**

```json
// packages/tools/tsconfig.server.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist/server",
    "rootDir": "./server",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["server/**/*.ts"]
}
```

- [ ] **Step 3: Create Supabase client helper**

```typescript
// packages/tools/server/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function batchInsert(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 100,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}
```

- [ ] **Step 4: Create Express server entry point**

```typescript
// packages/tools/server/index.ts
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes will be added in subsequent tasks
// app.use('/api/configs', configRoutes);
// app.use('/api/simulations', simulationRoutes);
// app.use('/api/reports', reportRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Tools server running on port ${PORT}`);
});

export { app };
```

- [ ] **Step 5: Add server start script to package.json**

In `packages/tools/package.json`, add to `"scripts"`:

```json
"server": "tsx server/index.ts",
"server:dev": "tsx watch server/index.ts"
```

- [ ] **Step 6: Verify server starts**

Run: `cd packages/tools && pnpm server`
Expected: "Tools server running on port 3001" — then Ctrl+C

- [ ] **Step 7: Commit**

```bash
git add packages/tools/server/ packages/tools/package.json \
  packages/tools/tsconfig.server.json
git commit -m "feat(tools): add Express backend server with Supabase client"
```

---

### Task 8: Worker Pool & Simulation Worker

**Files:**
- Create: `packages/tools/server/worker.ts`
- Create: `packages/tools/server/worker-pool.ts`
- Test: `packages/tools/server/worker-pool.test.ts`

- [ ] **Step 1: Write test for worker pool**

```typescript
// packages/tools/server/worker-pool.test.ts
import { describe, it, expect } from 'vitest';
import { WorkerPool } from './worker-pool.js';
import { defaultConfig } from '@alloy/engine';
import type { MatchReport } from '@alloy/engine';

describe('WorkerPool', () => {
  it('distributes work across workers and collects results', async () => {
    const pool = new WorkerPool(2); // 2 workers
    const reports: MatchReport[] = [];
    const progressUpdates: number[] = [];

    const { completed, failed } = await pool.runSimulation(
      {
        configJson: JSON.stringify(defaultConfig()),
        matchCount: 10,
        aiTier1: 1,
        aiTier2: 1,
        seedStart: 0,
        mode: 'quick',
        baseWeaponId: 'sword',
        baseArmorId: 'chainmail',
      },
      (report) => reports.push(report),
      (completed, _total) => progressUpdates.push(completed),
    );

    expect(completed).toBe(10);
    expect(failed).toBe(0);
    expect(reports).toHaveLength(10);
    expect(reports[0].source).toBe('simulation');
    pool.terminate();
  }, 30_000);
});
```

Note: This test is slow (runs 10 real matches). Keep match count low.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tools && npx vitest run server/worker-pool.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create simulation worker**

```typescript
// packages/tools/server/worker.ts
import { parentPort, workerData } from 'node:worker_threads';
import { DataRegistry } from '@alloy/engine';
import { createMatch, applyAction } from '@alloy/engine';
import { AIController } from '@alloy/engine';
import { extractMatchReport } from '@alloy/engine';
import type { GameConfig, MatchReport } from '@alloy/engine';

interface WorkerInput {
  configJson: string;
  seedStart: number;
  seedEnd: number;
  aiTier1: number;
  aiTier2: number;
  mode: 'quick' | 'standard';
  baseWeaponId: string;
  baseArmorId: string;
}

const input = workerData as WorkerInput;
const config: GameConfig = JSON.parse(input.configJson);
const registry = new DataRegistry(
  config.affixes, config.combinations, config.synergies,
  config.baseItems, config.balance,
);
const ai = new AIController(registry);

for (let seed = input.seedStart; seed < input.seedEnd; seed++) {
  try {
    let state = createMatch(
      `sim-${seed}`, seed, input.mode,
      ['ai-0', 'ai-1'], input.baseWeaponId, input.baseArmorId, registry,
    );

    // Drive match to completion — same pattern as simulation-runner.ts:
    // 1. Draft phase: alternate AI picks until draft is complete
    while (state.phase.kind === 'draft') {
      const pick = ai.pickDraft(state, state.phase.activePlayer);
      const result = applyAction(state, { type: 'draft_pick', ...pick }, registry);
      if (result.ok) state = result.state;
    }

    // 2. Forge + Duel loop: repeat until match complete
    while (state.phase.kind !== 'complete') {
      if (state.phase.kind === 'forge') {
        // Each player plans and executes forge actions
        for (const playerIndex of [0, 1] as const) {
          const actions = ai.planForge(state, playerIndex);
          for (const action of actions) {
            const result = applyAction(state, { type: 'forge_action', playerIndex, action }, registry);
            if (result.ok) state = result.state;
          }
          const complete = applyAction(state, { type: 'forge_complete', playerIndex }, registry);
          if (complete.ok) state = complete.state;
        }
      } else if (state.phase.kind === 'duel') {
        // Advance through duel phase
        const result = applyAction(state, { type: 'advance_phase' }, registry);
        if (result.ok) state = result.state;
      } else {
        // Draft for subsequent rounds
        while (state.phase.kind === 'draft') {
          const pick = ai.pickDraft(state, state.phase.activePlayer);
          const result = applyAction(state, { type: 'draft_pick', ...pick }, registry);
          if (result.ok) state = result.state;
        }
      }
    }

    const report = extractMatchReport(state, 'simulation', seed);
    parentPort?.postMessage({ type: 'result', report });
  } catch (err) {
    parentPort?.postMessage({ type: 'error', seed, error: String(err) });
  }
}

parentPort?.postMessage({ type: 'done' });
```

- [ ] **Step 4: Create worker pool manager**

```typescript
// packages/tools/server/worker-pool.ts
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { MatchReport } from '@alloy/engine';

interface SimulationRequest {
  configJson: string;
  matchCount: number;
  aiTier1: number;
  aiTier2: number;
  seedStart: number;
  mode: 'quick' | 'standard';
  baseWeaponId: string;
  baseArmorId: string;
}

export class WorkerPool {
  private workerCount: number;
  private workers: Worker[] = [];
  private cancelled = false;

  constructor(workerCount?: number) {
    this.workerCount = workerCount ?? Math.max(1, cpus().length - 1);
  }

  async runSimulation(
    request: SimulationRequest,
    onResult: (report: MatchReport) => void,
    onProgress: (completed: number, total: number) => void,
  ): Promise<{ completed: number; failed: number }> {
    this.cancelled = false;
    const batchSize = Math.ceil(request.matchCount / this.workerCount);
    let completed = 0;
    let failed = 0;

    const workerPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'worker.ts',
    );

    const promises = Array.from({ length: this.workerCount }, (_, i) => {
      const seedStart = request.seedStart + i * batchSize;
      const seedEnd = Math.min(seedStart + batchSize, request.seedStart + request.matchCount);
      if (seedStart >= seedEnd) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: {
            configJson: request.configJson,
            seedStart,
            seedEnd,
            aiTier1: request.aiTier1,
            aiTier2: request.aiTier2,
            mode: request.mode,
            baseWeaponId: request.baseWeaponId,
            baseArmorId: request.baseArmorId,
          },
          execArgv: ['--import', 'tsx'],
        });

        this.workers.push(worker);

        worker.on('message', (msg) => {
          if (this.cancelled) return;
          if (msg.type === 'result') {
            completed++;
            onResult(msg.report);
            onProgress(completed, request.matchCount);
          } else if (msg.type === 'error') {
            failed++;
          } else if (msg.type === 'done') {
            resolve();
          }
        });

        worker.on('error', (err) => {
          console.error('Worker error:', err);
          failed += (seedEnd - seedStart);
          resolve(); // don't reject — continue with other workers
        });
      });
    });

    await Promise.all(promises);
    this.workers = [];
    return { completed, failed };
  }

  cancel(): void {
    this.cancelled = true;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }

  terminate(): void {
    this.cancel();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/tools && npx vitest run server/worker-pool.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tools/server/worker.ts packages/tools/server/worker-pool.ts \
  packages/tools/server/worker-pool.test.ts
git commit -m "feat(tools): add worker pool for parallel match simulation"
```

---

### Task 9: SSE Manager & Simulation Routes

**Files:**
- Create: `packages/tools/server/sse.ts`
- Create: `packages/tools/server/routes/simulations.ts`
- Create: `packages/tools/server/routes/configs.ts`

- [ ] **Step 1: Create SSE connection manager**

```typescript
// packages/tools/server/sse.ts
import type { Response } from 'express';

// Supports multiple clients per runId (multiple browser tabs, reconnections)
const connections = new Map<string, Set<Response>>();

export function addSSEClient(runId: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  if (!connections.has(runId)) connections.set(runId, new Set());
  connections.get(runId)!.add(res);
  res.on('close', () => {
    const clients = connections.get(runId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) connections.delete(runId);
    }
  });
}

export function sendProgress(runId: string, data: {
  progress: number;
  completed: number;
  total: number;
  status: string;
}): void {
  const clients = connections.get(runId);
  if (clients) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(msg);
    }
  }
}

export function closeSSE(runId: string): void {
  const clients = connections.get(runId);
  if (clients) {
    for (const res of clients) res.end();
    connections.delete(runId);
  }
}
```

- [ ] **Step 2: Create config routes**

```typescript
// packages/tools/server/routes/configs.ts
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// List all configs
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('game_configs')
    .select('id, name, version, parent_id, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get single config with full data
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('game_configs')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// Create or update config
router.post('/', async (req, res) => {
  const { name, version, config, parent_id } = req.body;
  const { data, error } = await supabase
    .from('game_configs')
    .insert({ name, version, config, parent_id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
```

- [ ] **Step 3: Create simulation routes**

```typescript
// packages/tools/server/routes/simulations.ts
import { Router } from 'express';
import { supabase, batchInsert } from '../supabase.js';
import { WorkerPool } from '../worker-pool.js';
import { addSSEClient, sendProgress, closeSSE } from '../sse.js';
import type { MatchReport } from '@alloy/engine';

const router = Router();
const activeRuns = new Map<string, WorkerPool>();

// Start a simulation
router.post('/', async (req, res) => {
  const { configId, matchCount, aiTiers, seedStart, mode, baseWeaponId, baseArmorId } = req.body;

  // Fetch the config
  const { data: configRow, error: configErr } = await supabase
    .from('game_configs')
    .select('config')
    .eq('id', configId)
    .single();
  if (configErr) return res.status(400).json({ error: configErr.message });

  // Create run record
  const { data: run, error: runErr } = await supabase
    .from('simulation_runs')
    .insert({
      config_id: configId,
      match_count: matchCount,
      ai_tiers: aiTiers,
      seed_start: seedStart,
      status: 'running',
    })
    .select()
    .single();
  if (runErr) return res.status(500).json({ error: runErr.message });

  res.status(201).json(run);

  // Run simulation in background
  const pool = new WorkerPool();
  activeRuns.set(run.id, pool);

  const resultBuffer: MatchReport[] = [];
  const FLUSH_SIZE = 100;

  const flushResults = async () => {
    if (resultBuffer.length === 0) return;
    const batch = resultBuffer.splice(0, resultBuffer.length);

    // Map MatchReport → 3 table row shapes:
    // 1. match_results: one row per match
    const matchRows = batch.map(r => ({
      run_id: run.id, config_id: configId, source: r.source,
      seed: r.seed, winner: r.winner, rounds: r.rounds,
      duration_ms: r.durationMs,
    }));
    const { data: insertedMatches } = await supabase
      .from('match_results').insert(matchRows).select('id');

    if (insertedMatches) {
      // 2. match_player_stats: two rows per match (one per player)
      const playerRows = insertedMatches.flatMap((m, i) =>
        batch[i].players.map(p => ({
          match_id: m.id, player_index: p.playerIndex,
          ai_tier: p.aiTier ?? null, final_hp: p.finalHP,
          affix_ids: p.affixIds, combination_ids: p.combinationIds,
          synergy_ids: p.synergyIds, loadout: p.loadout,
        }))
      );
      await batchInsert('match_player_stats', playerRows);

      // 3. match_round_details: N rows per match (one per round)
      const roundRows = insertedMatches.flatMap((m, i) =>
        batch[i].roundDetails.map(rd => ({
          match_id: m.id, round: rd.round, winner: rd.winner,
          duration_ticks: rd.durationTicks,
          p0_hp_final: rd.p0HpFinal, p1_hp_final: rd.p1HpFinal,
          p0_damage_dealt: rd.p0DamageDealt, p1_damage_dealt: rd.p1DamageDealt,
        }))
      );
      await batchInsert('match_round_details', roundRows);
    }
  };

  pool.runSimulation(
    {
      configJson: JSON.stringify(configRow.config),
      matchCount,
      aiTier1: aiTiers[0],
      aiTier2: aiTiers[1],
      seedStart,
      mode: mode || 'quick',
      baseWeaponId: baseWeaponId || 'sword',
      baseArmorId: baseArmorId || 'chainmail',
    },
    (report: MatchReport) => {
      resultBuffer.push(report);
      if (resultBuffer.length >= FLUSH_SIZE) flushResults();
    },
    (completed: number, total: number) => {
      const progress = completed / total;
      sendProgress(run.id, { progress, completed, total, status: 'running' });
      // Update progress in DB periodically (every 10%)
      if (completed % Math.ceil(total / 10) === 0) {
        supabase.from('simulation_runs')
          .update({ progress })
          .eq('id', run.id)
          .then(() => {});
      }
    },
  ).then(async ({ completed, failed }) => {
    await flushResults();
    const failRate = failed / matchCount;
    const status = failRate > 0.1 ? 'failed' : 'complete';
    await supabase.from('simulation_runs')
      .update({ status, progress: 1.0, completed_at: new Date().toISOString() })
      .eq('id', run.id);
    sendProgress(run.id, { progress: 1, completed, total: matchCount, status });
    closeSSE(run.id);
    activeRuns.delete(run.id);
  });
});

// Get simulation status
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('simulation_runs')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// SSE progress stream
router.get('/:id/progress', (req, res) => {
  addSSEClient(req.params.id, res);
});

// Cancel simulation
router.post('/:id/cancel', async (req, res) => {
  const pool = activeRuns.get(req.params.id);
  if (pool) {
    pool.cancel();
    activeRuns.delete(req.params.id);
  }
  await supabase.from('simulation_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', req.params.id);
  closeSSE(req.params.id);
  res.json({ status: 'cancelled' });
});

export default router;
```

- [ ] **Step 4: Wire routes into server index.ts**

Update `packages/tools/server/index.ts`:

```typescript
import configRoutes from './routes/configs.js';
import simulationRoutes from './routes/simulations.js';

app.use('/api/configs', configRoutes);
app.use('/api/simulations', simulationRoutes);
```

- [ ] **Step 5: Verify server compiles and starts**

Run: `cd packages/tools && pnpm server`
Expected: Server starts without errors — Ctrl+C after verifying

- [ ] **Step 6: Add route smoke test**

```typescript
// packages/tools/server/routes.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('API routes', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

Add `supertest` as a dev dependency: `pnpm add -D supertest @types/supertest`

Run: `cd packages/tools && npx vitest run server/routes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/tools/server/
git commit -m "feat(tools): add simulation and config API routes with SSE progress"
```

---

## Chunk 3: Frontend — Config Editor & Simulation UI

### Task 10: Frontend API Client & SSE Hook

**Files:**
- Create: `packages/tools/src/api/client.ts`
- Create: `packages/tools/src/api/sse.ts`

- [ ] **Step 1: Create API client**

```typescript
// packages/tools/src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  configs: {
    list: () => request<ConfigSummary[]>('/api/configs'),
    get: (id: string) => request<ConfigRow>(`/api/configs/${id}`),
    create: (body: CreateConfigBody) =>
      request<ConfigRow>('/api/configs', { method: 'POST', body: JSON.stringify(body) }),
  },
  simulations: {
    start: (body: StartSimulationBody) =>
      request<SimulationRun>('/api/simulations', { method: 'POST', body: JSON.stringify(body) }),
    get: (id: string) => request<SimulationRun>(`/api/simulations/${id}`),
    cancel: (id: string) =>
      request<{ status: string }>(`/api/simulations/${id}/cancel`, { method: 'POST' }),
  },
};

// Types — implementation agent should define these based on DB schema
export interface ConfigSummary { id: string; name: string; version: string; parent_id?: string; created_at: string; }
export interface ConfigRow extends ConfigSummary { config: unknown; }
export interface CreateConfigBody { name: string; version: string; config: unknown; parent_id?: string; }
export interface StartSimulationBody { configId: string; matchCount: number; aiTiers: [number, number]; seedStart: number; mode?: string; baseWeaponId?: string; baseArmorId?: string; }
export interface SimulationRun { id: string; config_id: string; match_count: number; status: string; progress: number; started_at: string; completed_at?: string; }
```

- [ ] **Step 2: Create SSE hook with reconnection**

```typescript
// packages/tools/src/api/sse.ts
import { useEffect, useRef, useState } from 'react';
import { api } from './client.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ProgressData {
  progress: number;
  completed: number;
  total: number;
  status: string;
}

export function useSimulationProgress(runId: string | null) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) return;

    const connect = () => {
      const es = new EventSource(`${BASE_URL}/api/simulations/${runId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);
        if (data.status === 'complete' || data.status === 'failed' || data.status === 'cancelled') {
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
        // Fallback to polling — store interval ID in ref for cleanup
        pollRef.current = setInterval(async () => {
          try {
            const run = await api.simulations.get(runId);
            setProgress({
              progress: run.progress,
              completed: Math.round(run.progress * run.match_count),
              total: run.match_count,
              status: run.status,
            });
            if (run.status !== 'running') {
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          } catch {
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        }, 2000);
      };
    };

    connect();
    return () => {
      eventSourceRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runId]);

  return progress;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/tools/src/api/
git commit -m "feat(tools): add API client and SSE progress hook"
```

---

### Task 11: Simulation Page

**Files:**
- Create: `packages/tools/src/pages/SimulationPage.tsx`
- Create: `packages/tools/src/components/RunProgress.tsx`
- Modify: `packages/tools/src/App.tsx`

- [ ] **Step 1: Create RunProgress component**

```typescript
// packages/tools/src/components/RunProgress.tsx
// Shows: progress bar, completed/total count, elapsed time, cancel button
// Props: progress (ProgressData | null), onCancel: () => void
// When status is 'complete': show green checkmark + summary
// When status is 'failed': show red warning + partial results message
```

Implementation agent: build a simple progress bar component using the `ProgressData` type from `api/sse.ts`. Use Tailwind CSS classes for styling (the project uses Tailwind v4).

- [ ] **Step 2: Create SimulationPage**

```typescript
// packages/tools/src/pages/SimulationPage.tsx
// Layout:
//   Top section: Config selector (dropdown of saved configs) + simulation params
//     - matchCount (number input, default 10000)
//     - aiTiers (two dropdowns, 1-5 each)
//     - seedStart (number input, default 0)
//     - "Run Simulation" button
//   Middle section: RunProgress component (shown during/after run)
//   Bottom section: Quick summary cards when complete
//     - Total matches, win rate P0 vs P1, avg duration, time elapsed
```

Implementation agent: use `api.configs.list()` for the config dropdown, `api.simulations.start()` on run, `useSimulationProgress()` for live updates, `api.simulations.cancel()` for cancel button.

- [ ] **Step 3: Update App.tsx with new tab routing**

Modify `packages/tools/src/App.tsx`:
- Add React Router (if not present) or use tab state
- Add all 8 tabs: Overview, Simulation, Config Editor, Balance, Rounds, Distributions, Meta, Inspector
- Route each tab to its page component (use placeholder `() => <div>Coming soon</div>` for pages not yet built)
- Overview is the default tab

- [ ] **Step 4: Verify frontend builds**

Run: `cd packages/tools && pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/pages/SimulationPage.tsx \
  packages/tools/src/components/RunProgress.tsx \
  packages/tools/src/App.tsx
git commit -m "feat(tools): add simulation page with progress tracking"
```

---

### Task 12: Config Editor Page — Form Mode

**Files:**
- Create: `packages/tools/src/pages/ConfigEditorPage.tsx`
- Create: `packages/tools/src/components/ConfigFormEditor.tsx`

- [ ] **Step 1: Create ConfigFormEditor component**

```typescript
// packages/tools/src/components/ConfigFormEditor.tsx
// Layout:
//   Left sidebar: tree navigation
//     - Affixes (grouped by category: offensive, defensive, sustain, utility, trigger)
//       - Each affix expandable to show tiers 1-4
//     - Combinations
//     - Synergies
//     - Base Items
//     - Balance (fluxPerRound, fluxCosts, statCaps, tickRate, etc.)
//   Right panel: editable form fields for selected item
//     - Stat dropdown, op dropdown (flat/percent/override), value number input
//     - Toggle switch for enabling/disabling items
//     - Slider for numeric balance knobs
//     - "Changed from baseline" highlight (compare with parent config)
//
// Props:
//   config: GameConfig
//   baselineConfig?: GameConfig (for diff highlighting)
//   onChange: (updated: GameConfig) => void
```

Implementation agent: the tree structure should mirror the `GameConfig` type. Use `AffixDef.category` for grouping. Read the actual affix data structure to understand what fields to expose.

- [ ] **Step 2: Create ConfigEditorPage**

```typescript
// packages/tools/src/pages/ConfigEditorPage.tsx
// Layout:
//   Top bar: Config name input, version input, "Save" button, "Fork" button,
//            "Validate" button, "Run Simulation" button
//   Toggle: Form Mode / Raw Mode
//   Body: ConfigFormEditor (or ConfigRawEditor based on toggle)
//
// State management:
//   - Load config from API (or defaultConfig for new)
//   - Track unsaved changes
//   - Validate with GameConfigSchema (client-side Zod)
//   - Save creates/updates via API
//   - Fork creates a copy with parent_id set
//   - "Run Simulation" navigates to SimulationPage with this config
```

- [ ] **Step 3: Verify page renders**

Run: `cd packages/tools && pnpm dev` — navigate to Config Editor tab
Expected: Tree navigation renders with affix categories, selecting an item shows form fields

- [ ] **Step 4: Commit**

```bash
git add packages/tools/src/pages/ConfigEditorPage.tsx \
  packages/tools/src/components/ConfigFormEditor.tsx
git commit -m "feat(tools): add config editor page with form mode"
```

---

### Task 13: Config Editor — Raw Mode (Monaco)

**Files:**
- Create: `packages/tools/src/components/ConfigRawEditor.tsx`
- Modify: `packages/tools/package.json`

- [ ] **Step 1: Add Monaco dependency**

```bash
cd packages/tools && pnpm add @monaco-editor/react
```

- [ ] **Step 2: Create ConfigRawEditor component**

```typescript
// packages/tools/src/components/ConfigRawEditor.tsx
import Editor from '@monaco-editor/react';

// Props:
//   configJson: string
//   onChange: (json: string) => void
//   validationErrors: string[]
//
// Features:
//   - Monaco editor with JSON language mode
//   - Dark theme
//   - Show validation errors as editor markers
//   - Auto-format on paste
```

Implementation agent: use `@monaco-editor/react` default export. Set language to `"json"`, theme to `"vs-dark"`. On change, parse JSON and validate with `GameConfigSchema` — show errors as markers via `editor.setModelMarkers()`.

- [ ] **Step 3: Wire raw mode toggle into ConfigEditorPage**

Update `ConfigEditorPage.tsx` to toggle between `ConfigFormEditor` and `ConfigRawEditor`. When switching modes, serialize/deserialize the config to keep them in sync. If the raw JSON is invalid, show a warning but don't crash the form mode.

- [ ] **Step 4: Verify raw editor renders and validates**

Run: `cd packages/tools && pnpm dev` — switch to Raw Mode in config editor
Expected: Monaco editor renders with JSON content, validation errors appear for invalid changes

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/components/ConfigRawEditor.tsx \
  packages/tools/src/pages/ConfigEditorPage.tsx \
  packages/tools/package.json
git commit -m "feat(tools): add Monaco raw JSON editor mode for config editing"
```

---

## Chunk 4: Analytics Dashboard

### Task 14: Global Filters & Report API

**Files:**
- Create: `packages/tools/src/components/GlobalFilters.tsx`
- Create: `packages/tools/server/routes/reports.ts`

- [ ] **Step 1: Create report query routes**

```typescript
// packages/tools/server/routes/reports.ts
import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

// Helper: build a base query with common filters applied
function applyFilters(query: any, params: Record<string, string | undefined>) {
  if (params.runId) query = query.eq('run_id', params.runId);
  if (params.configId) query = query.eq('config_id', params.configId);
  if (params.source && params.source !== 'both') query = query.eq('source', params.source);
  if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
  if (params.dateTo) query = query.lte('created_at', params.dateTo);
  if (params.winner) query = query.eq('winner', parseInt(params.winner));
  return query;
}

// Aggregate stats for a run (or filtered set)
router.get('/overview', async (req, res) => {
  const filters = req.query as Record<string, string>;
  let query = supabase.from('match_results').select('winner, rounds, duration_ms');
  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const total = data.length;
  const p0Wins = data.filter(m => m.winner === 0).length;
  const p1Wins = data.filter(m => m.winner === 1).length;

  // Most-picked affix and most dominant archetype require joining player stats
  // Fetch affix stats to derive these
  const { data: playerStats } = await supabase
    .from('match_player_stats')
    .select('affix_ids, match_id')
    .in('match_id', data.map(m => (m as any).id));

  const affixCounts: Record<string, number> = {};
  for (const ps of playerStats || []) {
    for (const a of ps.affix_ids) {
      affixCounts[a] = (affixCounts[a] || 0) + 1;
    }
  }
  const mostPickedAffix = Object.entries(affixCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  res.json({
    totalMatches: total,
    p0WinRate: total ? p0Wins / total : 0,
    p1WinRate: total ? p1Wins / total : 0,
    avgDurationMs: total ? data.reduce((s, m) => s + m.duration_ms, 0) / total : 0,
    avgRounds: total ? data.reduce((s, m) => s + m.rounds, 0) / total : 0,
    mostPickedAffix,
  });
});

// Affix win rates — requires Postgres function for unnest
// Add this function in the migration (Task 6):
//   CREATE OR REPLACE FUNCTION affix_win_stats(p_run_id uuid)
//   RETURNS TABLE(affix_id text, pick_count bigint, win_count bigint) AS $$
//     SELECT a.affix_id, COUNT(*) as pick_count,
//            COUNT(*) FILTER (WHERE mr.winner = mps.player_index) as win_count
//     FROM match_player_stats mps
//     CROSS JOIN LATERAL unnest(mps.affix_ids) AS a(affix_id)
//     JOIN match_results mr ON mr.id = mps.match_id
//     WHERE ($1 IS NULL OR mr.run_id = $1)
//     GROUP BY a.affix_id
//   $$ LANGUAGE sql;
router.get('/affix-stats', async (req, res) => {
  const { runId } = req.query as Record<string, string>;
  const { data, error } = await supabase.rpc('affix_win_stats', {
    p_run_id: runId || null,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map((r: any) => ({
    affixId: r.affix_id,
    pickCount: Number(r.pick_count),
    winCount: Number(r.win_count),
    winRate: r.pick_count > 0 ? Number(r.win_count) / Number(r.pick_count) : 0,
  })));
});

// Matchup matrix — client-side archetype classification
// Implementation agent: archetypes are derived from the dominant affix
// category in each player's loadout. Read the engine's archetype detection
// logic in ai/strategies/forge-strategy.ts (detectArchetype function).
// For this endpoint, fetch player affix sets and classify server-side,
// then cross-tab win rates.
router.get('/matchups', async (req, res) => {
  // Implementation: join match_results + match_player_stats,
  // classify each player's affix set into an archetype string,
  // then group by (p0_archetype, p1_archetype) and compute win rates.
  // Return as { archetypes: string[], matrix: number[][] }
  res.json({ archetypes: [], matrix: [] }); // placeholder, fill in
});

// Per-round stats
router.get('/round-stats', async (req, res) => {
  const { runId } = req.query as Record<string, string>;
  let query = supabase.from('match_round_details')
    .select('round, winner, duration_ticks, p0_damage_dealt, p1_damage_dealt, match_id');
  if (runId) {
    const { data: matchIds } = await supabase
      .from('match_results').select('id').eq('run_id', runId);
    if (matchIds) query = query.in('match_id', matchIds.map(m => m.id));
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Group by round number
  const byRound = new Map<number, typeof data>();
  for (const r of data) {
    if (!byRound.has(r.round)) byRound.set(r.round, []);
    byRound.get(r.round)!.push(r);
  }

  const stats = Array.from(byRound.entries()).map(([round, rows]) => ({
    round,
    matchCount: rows.length,
    p0WinRate: rows.filter(r => r.winner === 0).length / rows.length,
    avgDurationTicks: rows.reduce((s, r) => s + r.duration_ticks, 0) / rows.length,
    avgDamageDealt: rows.reduce((s, r) => s + r.p0_damage_dealt + r.p1_damage_dealt, 0) / rows.length,
  }));

  res.json(stats);
});

// Distribution stats — damage and stat distributions for histogram/box plots
router.get('/distributions', async (req, res) => {
  const { runId } = req.query as Record<string, string>;
  // Fetch round details for damage distributions
  let query = supabase.from('match_round_details')
    .select('p0_damage_dealt, p1_damage_dealt, duration_ticks, match_id');
  if (runId) {
    const { data: matchIds } = await supabase
      .from('match_results').select('id').eq('run_id', runId);
    if (matchIds) query = query.in('match_id', matchIds.map(m => m.id));
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Return raw arrays — client builds histograms/box plots
  const allDamage = data.flatMap(r => [r.p0_damage_dealt, r.p1_damage_dealt]);
  const allDurations = data.map(r => r.duration_ticks);

  res.json({ damageValues: allDamage, durationValues: allDurations });
});

// Cross-config comparison for Meta Evolution tab
router.get('/config-comparison', async (req, res) => {
  const { configIds } = req.query as Record<string, string>;
  if (!configIds) return res.status(400).json({ error: 'configIds required (comma-separated)' });
  const ids = configIds.split(',');

  // For each config, get aggregate win rates and affix stats
  const results = await Promise.all(ids.map(async (configId) => {
    const { data: matches } = await supabase
      .from('match_results').select('winner').eq('config_id', configId);
    const total = matches?.length || 0;
    const p0Wins = matches?.filter(m => m.winner === 0).length || 0;
    return { configId, totalMatches: total, p0WinRate: total ? p0Wins / total : 0 };
  }));

  res.json(results);
});

export default router;
```

**Note on Postgres function:** The `affix_win_stats` function defined in the comment above should be added to the migration in Task 6. Implementation agent: add it to `007_simulation_tables.sql` after the table definitions.

- [ ] **Step 2: Wire reports route into server**

Add to `packages/tools/server/index.ts`:

```typescript
import reportRoutes from './routes/reports.js';
app.use('/api/reports', reportRoutes);
```

- [ ] **Step 3: Create GlobalFilters component**

```typescript
// packages/tools/src/components/GlobalFilters.tsx
// Shared filter bar rendered at the top of analytics tabs
// Filters:
//   - Run selector (dropdown of simulation runs)
//   - Config version (dropdown)
//   - Source (simulation / live / both)
//   - AI tier matchup (dropdowns)
//   - Date range (from/to date pickers)
//   - Affix inclusion/exclusion (multi-select)
//   - Round count (1 or 3)
//   - Win/loss filter (winner: 0 | 1 | 'any')
//
// Props:
//   filters: FilterState
//   onChange: (filters: FilterState) => void
//
// FilterState interface:
//   runId?: string
//   configId?: string
//   source?: 'simulation' | 'live' | 'both'
//   aiTiers?: [number?, number?]
//   dateFrom?: string
//   dateTo?: string
//   includeAffixes?: string[]
//   excludeAffixes?: string[]
//   roundCount?: 1 | 3
//   winner?: 0 | 1  // filter by winner, omit for all
```

- [ ] **Step 4: Commit**

```bash
git add packages/tools/server/routes/reports.ts packages/tools/server/index.ts \
  packages/tools/src/components/GlobalFilters.tsx
git commit -m "feat(tools): add report API routes and global filters component"
```

---

### Task 15: Overview & Balance Tabs

**Files:**
- Create: `packages/tools/src/pages/OverviewPage.tsx`
- Create: `packages/tools/src/pages/BalancePage.tsx`
- Create: `packages/tools/src/components/charts/WinRateMatrix.tsx`
- Create: `packages/tools/src/components/charts/MatchupHeatmap.tsx`

- [ ] **Step 1: Create OverviewPage**

```typescript
// packages/tools/src/pages/OverviewPage.tsx
// Layout:
//   GlobalFilters at top
//   Summary cards row: Total Matches, P0 Win Rate, P1 Win Rate, Avg Duration,
//     Avg Rounds, Most Picked Affix, Most Dominant Archetype
//   Two comparison panels (if two runs selected)
// Data: fetch from /api/reports/overview with current filters
```

- [ ] **Step 2: Create WinRateMatrix chart**

```typescript
// packages/tools/src/components/charts/WinRateMatrix.tsx
// Table/heatmap of affix win rates
// Rows: affix names, sorted by win rate
// Columns: Pick Count, Win Count, Win Rate, Pick Rate
// Color coding: green for >55% win rate, red for <45%, neutral otherwise
// Data: from /api/reports/affix-stats
```

Use Recharts `BarChart` for the win rate visualization, or a styled HTML table with color-coded cells.

- [ ] **Step 3: Create MatchupHeatmap**

```typescript
// packages/tools/src/components/charts/MatchupHeatmap.tsx
// Grid: archetype x archetype, cells show win rate of row vs column
// Color scale: red (<40%) through white (50%) to green (>60%)
// Data: from /api/reports/matchups
```

Implementation agent: use a `<table>` with inline background-color styles based on win rate. Archetypes are derived from affix categories (physical_burst, elemental_fire, etc.) — check the engine's archetype classification logic.

- [ ] **Step 4: Create BalancePage**

```typescript
// packages/tools/src/pages/BalancePage.tsx
// Layout:
//   GlobalFilters at top
//   WinRateMatrix component
//   MatchupHeatmap component
//   "Must-pick / Never-pick" flagged list (affixes with >60% pick rate or <5%)
//   First-player advantage indicator (P0 win rate with confidence interval)
```

- [ ] **Step 5: Verify pages render with mock/empty data**

Run: `cd packages/tools && pnpm dev`
Expected: Overview and Balance tabs render without errors, show loading/empty states

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/pages/OverviewPage.tsx \
  packages/tools/src/pages/BalancePage.tsx \
  packages/tools/src/components/charts/
git commit -m "feat(tools): add overview and balance analytics tabs"
```

---

### Task 16: Per-Round & Distributions Tabs

**Files:**
- Create: `packages/tools/src/pages/RoundAnalysisPage.tsx`
- Create: `packages/tools/src/pages/DistributionsPage.tsx`
- Create: `packages/tools/src/components/charts/DamageHistogram.tsx`
- Create: `packages/tools/src/components/charts/StatBoxPlot.tsx`

- [ ] **Step 1: Create RoundAnalysisPage**

```typescript
// packages/tools/src/pages/RoundAnalysisPage.tsx
// Layout:
//   GlobalFilters at top
//   Round comparison cards (R1 / R2 / R3):
//     - Win rate per round
//     - Avg duel duration
//     - Avg damage dealt
//   Draft value chart: pick order vs win correlation (Recharts ScatterChart)
//   Forge efficiency: flux spent vs stat gains, unused flux rates
//     (Note: forge efficiency data requires extending MatchReport/PlayerReport
//      to include flux spent — this is a stretch goal. Show placeholder for now.)
//   Comeback rate: % of matches where R1 loser wins the match
// Data: from /api/reports/round-stats
```

- [ ] **Step 2: Create DamageHistogram**

```typescript
// packages/tools/src/components/charts/DamageHistogram.tsx
// Recharts BarChart showing damage distribution
// Props: data (array of { bucket, count }), title
// Three variants: physical, elemental, DOT
```

- [ ] **Step 3: Create StatBoxPlot**

```typescript
// packages/tools/src/components/charts/StatBoxPlot.tsx
// Box plot using Recharts ComposedChart (box = ErrorBar, median = Line)
// Props: data (array of { stat, min, q1, median, q3, max }), title
// Shows distribution of final stats across matches
```

- [ ] **Step 4: Create DistributionsPage**

```typescript
// packages/tools/src/pages/DistributionsPage.tsx
// Layout:
//   GlobalFilters at top
//   DamageHistogram x3 (physical, elemental, DOT)
//   StatBoxPlot for key stats (HP, attack, defense, etc.)
//   Duel duration histogram
//   Note: HP-over-time curves require combat logs.
//   If no combat logs available for the selected run, show message:
//   "HP curves require combat log storage. Run a small sample with logs enabled."
//   and a button to re-run a 100-match sample with includeCombatLog: true.
//
// Note for implementation agent: the `includeCombatLog` parameter needs to be
// added to the simulation request flow:
//   1. Add `includeCombatLog?: boolean` to StartSimulationBody (api/client.ts)
//   2. Pass through to WorkerPool → worker.ts
//   3. In worker.ts, if includeCombatLog is true, include the CombatLog in the
//      MatchReport (it's already optional)
//   4. In simulation routes, if combat_log exists in MatchReport.roundDetails,
//      include it in the match_round_details insert
```

- [ ] **Step 5: Verify pages render**

Run: `cd packages/tools && pnpm dev`
Expected: Round Analysis and Distributions tabs render without errors

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/pages/RoundAnalysisPage.tsx \
  packages/tools/src/pages/DistributionsPage.tsx \
  packages/tools/src/components/charts/DamageHistogram.tsx \
  packages/tools/src/components/charts/StatBoxPlot.tsx
git commit -m "feat(tools): add per-round analysis and distribution tabs"
```

---

### Task 17: Meta Evolution & Match Inspector Tabs

**Files:**
- Create: `packages/tools/src/pages/MetaEvolutionPage.tsx`
- Create: `packages/tools/src/pages/MatchInspectorPage.tsx`

- [ ] **Step 1: Create MetaEvolutionPage**

```typescript
// packages/tools/src/pages/MetaEvolutionPage.tsx
// Layout:
//   Config version multi-selector (pick 2+ configs with run data)
//   Side-by-side comparison charts:
//     - Overall win rates per config (Recharts BarChart)
//     - Affix pick rate changes (grouped bar chart)
//     - Affix win rate changes (grouped bar chart)
//   Config diff viewer: JSON diff of selected configs using structured comparison
//     - Show only changed fields, color-coded (red for removed, green for added)
//     - Implementation: deep-diff the config objects and render as a tree
```

- [ ] **Step 2: Create MatchInspectorPage**

```typescript
// packages/tools/src/pages/MatchInspectorPage.tsx
// Layout:
//   Search/filter bar: seed, winner, affix contains, duration range, round count
//   Paginated match list table (from Supabase query)
//   Click a match → expanded detail view:
//     - Player loadout snapshots (weapon + armor + orbs)
//     - Round-by-round stats cards
//     - Combat log viewer (if stored): tick-by-tick event list
//
// Note: This replaces the existing MatchInspector component.
// The new version queries Supabase instead of holding results in memory.
```

- [ ] **Step 3: Wire all pages into App.tsx routing**

Update `packages/tools/src/App.tsx` to include all 7 tabs:
Overview, Simulation, Config Editor, Balance, Rounds, Distributions, Meta, Inspector

- [ ] **Step 4: Verify all pages render**

Run: `cd packages/tools && pnpm dev`
Expected: All tabs navigate correctly and render without errors

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/pages/MetaEvolutionPage.tsx \
  packages/tools/src/pages/MatchInspectorPage.tsx \
  packages/tools/src/App.tsx
git commit -m "feat(tools): add meta evolution and match inspector tabs"
```

---

## Chunk 5: Export, Integration & Polish

### Task 18: CSV & PNG Export

**Files:**
- Create: `packages/tools/src/utils/export.ts`

- [ ] **Step 1: Create export utilities**

```typescript
// packages/tools/src/utils/export.ts

// CSV export: takes array of objects, converts to CSV string, triggers download
export function exportCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(',')),
  ].join('\n');
  downloadBlob(csv, `${filename}.csv`, 'text/csv');
}

// PNG export: takes a Recharts chart ref, converts SVG to PNG canvas, triggers download
export function exportChartPNG(svgElement: SVGElement, filename: string): void {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width * 2;  // 2x for retina
    canvas.height = img.height * 2;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`, 'image/png');
    });
  };
  img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
}

function downloadBlob(content: string | Blob, filename: string, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add export buttons to analytics tabs**

Add "Export CSV" and "Export PNG" buttons to these specific components:
- `components/charts/WinRateMatrix.tsx` — CSV for affix data table, PNG for chart
- `components/charts/MatchupHeatmap.tsx` — CSV for matrix data, PNG for heatmap
- `components/charts/DamageHistogram.tsx` — PNG export
- `components/charts/StatBoxPlot.tsx` — PNG export
- `pages/OverviewPage.tsx` — CSV for summary data
- `pages/MatchInspectorPage.tsx` — CSV for match list

Each Recharts chart component should wrap its chart in a `<div ref={chartRef}>` and use `chartRef.current.querySelector('svg')` for PNG export.

- [ ] **Step 3: Commit**

```bash
git add packages/tools/src/utils/export.ts
git commit -m "feat(tools): add CSV and PNG export utilities"
```

---

### Task 19: Live Match Data Pipeline

**Files:**
- Modify: `packages/engine/src/index.ts` (already done in Task 5)
- Create or modify: `packages/supabase/functions/match-complete/index.ts`

- [ ] **Step 1: Update match-complete edge function**

The `match-complete` edge function (currently deprecated) should be revived or a new function created to:
1. Receive a completed `MatchState`
2. Call `extractMatchReport(state, 'live')`
3. Insert the `MatchReport` into the same `match_results`, `match_player_stats`, and `match_round_details` tables

```typescript
// packages/supabase/functions/match-complete/index.ts
// Implementation agent:
// 1. Follow the pattern of existing edge functions (e.g., draft-pick/index.ts)
// 2. Use shared CORS + auth from _shared/supabase.ts
// 3. Import engine functions using RELATIVE paths (not npm imports) —
//    Deno edge functions use relative imports to reach the engine package.
//    Check existing edge functions for the exact relative path pattern,
//    e.g.: import { extractMatchReport } from '../../../engine/src/match/match-report.ts';
// 4. Insert into match_results, match_player_stats, and match_round_details
//    using the same mapping as the simulation routes (Task 9, Step 3)
```

- [ ] **Step 2: Verify edge function compiles**

Run: `cd packages/supabase && supabase functions serve match-complete --no-verify-jwt`
Expected: Function serves without import errors

- [ ] **Step 3: Commit**

```bash
git add packages/supabase/functions/match-complete/
git commit -m "feat(supabase): revive match-complete edge function for live match reporting"
```

---

### Task 20: End-to-End Integration Test

**Files:**
- Create: `packages/tools/server/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/tools/server/integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { defaultConfig } from '@alloy/engine';

describe('End-to-end simulation flow', () => {
  const BASE_URL = 'http://localhost:3001';

  // Prerequisites:
  //   1. Supabase running locally: `cd packages/supabase && supabase start`
  //   2. Migration 007 applied: `supabase db reset`
  //   3. Server running: `cd packages/tools && pnpm server` (in another terminal)
  //   4. .env configured with local Supabase URL and service role key

  it('creates a config, runs a small simulation, and queries results', async () => {
    // 1. Create a config
    const config = defaultConfig();
    const configRes = await fetch(`${BASE_URL}/api/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-run', version: '1.0.0', config }),
    });
    expect(configRes.status).toBe(201);
    const { id: configId } = await configRes.json();

    // 2. Start a small simulation (10 matches)
    const simRes = await fetch(`${BASE_URL}/api/simulations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId,
        matchCount: 10,
        aiTiers: [3, 3],
        seedStart: 0,
      }),
    });
    expect(simRes.status).toBe(201);
    const { id: runId } = await simRes.json();

    // 3. Poll until complete (max 60 seconds)
    let status = 'running';
    for (let i = 0; i < 30 && status === 'running'; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`${BASE_URL}/api/simulations/${runId}`);
      const run = await pollRes.json();
      status = run.status;
    }
    expect(status).toBe('complete');

    // 4. Query overview
    const overviewRes = await fetch(`${BASE_URL}/api/reports/overview?runId=${runId}`);
    expect(overviewRes.status).toBe(200);
    const overview = await overviewRes.json();
    expect(overview.totalMatches).toBe(10);
  }, 120_000);
});
```

- [ ] **Step 2: Run integration test**

Run (in separate terminals):
1. `cd packages/tools && pnpm server`
2. `cd packages/tools && npx vitest run server/integration.test.ts`

Expected: PASS — full flow works end-to-end

- [ ] **Step 3: Commit**

```bash
git add packages/tools/server/integration.test.ts
git commit -m "test(tools): add end-to-end integration test for simulation flow"
```

---

### Task 21: Dev Experience — Concurrent Server + Client

**Files:**
- Modify: `packages/tools/package.json`

- [ ] **Step 1: Add concurrent dev script**

```bash
cd packages/tools && pnpm add -D concurrently
```

Add to `packages/tools/package.json` scripts:

```json
"dev:all": "concurrently \"pnpm server:dev\" \"pnpm dev\"",
```

- [ ] **Step 2: Add .env.example**

Create `packages/tools/.env.example`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 3: Verify full dev experience**

Run: `cd packages/tools && pnpm dev:all`
Expected: Both server (port 3001) and Vite dev server (port 5173) start. Frontend can reach backend.

- [ ] **Step 4: Commit**

```bash
git add packages/tools/package.json packages/tools/.env.example
git commit -m "chore(tools): add concurrent dev script and env example"
```
