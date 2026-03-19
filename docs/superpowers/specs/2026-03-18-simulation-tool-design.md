# Alloy Simulation & Balance Tool — Design Spec

**Date:** 2026-03-18
**Status:** Draft
**Approach:** Monolith Dashboard — evolve `packages/tools/` with Node.js backend, worker thread parallelism, Supabase persistence

## Problem

The current `packages/tools/` dashboard runs up to 1,000 AI-vs-AI matches in-browser, with results held only in memory. This is insufficient for:

- **Statistical rigor** — 1k matches is too few for confident balance conclusions
- **Iteration speed** — game data is hardcoded in TypeScript; adding/tweaking an affix requires code changes and rebuilds
- **Persistence** — results vanish on page refresh; no way to compare across config versions
- **Live data integration** — simulated and real player matches exist in separate worlds
- **Team collaboration** — only the person running the tool sees the results

## User Stories

1. **Gameplay manager** — run 10-50k simulated games to produce robust reports, visualizations, and gameplay data for balance adjustment.
2. **QA engineer** — run simulations quickly (under 60 seconds for 10k matches) and adjust game settings without code changes or deploys.
3. **Player** — benefit from better balance and stability due to thorough developer testing.
4. **Business analyst** — generate tests, gather data, and visualize results with graphs, tables, filters, metric breakdowns, and dimensions in a clean web-based interface.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                packages/tools/                   │
│                                                  │
│  ┌──────────────┐     ┌───────────────────────┐ │
│  │  React SPA   │────▶│   Express Backend     │ │
│  │  (Vite)      │ SSE │                       │ │
│  │              │◀────│  ┌─────────────────┐  │ │
│  │ - Config UI  │     │  │  Worker Pool    │  │ │
│  │ - Analytics  │     │  │  (N threads)    │  │ │
│  │ - Inspector  │     │  │                 │  │ │
│  └──────────────┘     │  │  @alloy/engine  │  │ │
│                       │  └────────┬────────┘  │ │
│                       └───────────┼───────────┘ │
└───────────────────────────────────┼─────────────┘
                                    │
                              ┌─────▼─────┐
                              │ Supabase   │
                              │ PostgreSQL │
                              │            │
                              │ configs    │
                              │ runs       │
                              │ results    │
                              └────────────┘
                                    ▲
                              ┌─────┴─────┐
                              │ Live Game  │
                              │ (edge fns) │
                              └────────────┘
```

Single deployable app within the existing monorepo. Node.js backend handles simulation via worker threads. Supabase stores configs, runs, and match results. Live game matches flow into the same tables via edge functions.

## Section 1: Data-Driven Game Registry

### Current State

Game data lives in TypeScript files (`affix-registry.ts`, `combination-registry.ts`, etc.) as hardcoded arrays. Adding a new affix means editing code and rebuilding.

### Proposed: GameConfig Schema

A single unified config object validated by Zod:

```typescript
interface GameConfig {
  version: string;              // semver for tracking changes
  name: string;                 // "baseline", "fire-nerf-v2", etc.

  affixes: AffixDefinition[];   // all 27+ affixes with full tier data
  combinations: CombinationDef[];
  synergies: SynergyDef[];
  baseItems: BaseItemDef[];     // weapons + armors with base stats

  balance: {
    fluxBudgets: Record<number, number>;  // round → flux
    draftPoolSize: Record<number, number>;
    tickRate: number;
    maxTicks: number;
    statCaps: Record<string, { min: number; max: number }>;
    actionCosts: Record<string, number>;
  };
}
```

### How It Works

- Engine registries refactored to accept a `GameConfig` at initialization instead of importing hardcoded data.
- Current hardcoded data becomes the **default config** — exported as a JSON-serializable `defaultConfig()` function.
- Simulation tool loads, edits, and injects alternate configs.
- Configs stored in Supabase as versioned rows for cross-version comparison.
- Live game continues using the default config (or eventually pulls from DB).

### Key Principle

The engine becomes config-agnostic. It receives a validated `GameConfig` and runs with it — no knowledge of where the data came from.

## Section 2: Simulation Engine Backend

### API

```
POST /api/simulations           — start a new simulation run
GET  /api/simulations/:id       — poll status / get results
POST /api/simulations/:id/cancel — cancel in-progress run
GET  /api/configs               — list saved GameConfigs
POST /api/configs               — create/update a GameConfig
GET  /api/reports/:id           — query aggregated match data
```

### Worker Thread Pool

- Pool of Node `worker_threads`, defaulting to `os.cpus().length - 1`
- Main thread distributes match seeds across workers in batches
- Each worker runs `simulation-runner.ts` with a given `GameConfig` + seed range
- Workers stream per-match results back via `postMessage`
- Main thread writes results to Supabase in batches (100 rows per insert) and pushes progress to the frontend via Server-Sent Events (SSE)

### Simulation Run Lifecycle

1. Frontend submits: `{ configId, matchCount, aiTiers, seedStart }`
2. Backend creates a `simulation_runs` row (status: `running`, progress: 0%)
3. Work distributed across worker pool
4. As batches complete: update progress, stream to frontend, batch-insert match results
5. On completion: update run status to `complete`, compute and store aggregates
6. On cancel: signal workers to stop, mark run as `cancelled`

### Performance Target

10k matches in ~30-60 seconds on an 8-core machine. Each match takes ~5-15ms in the engine (draft + forge + duel is mostly math), so 8 workers processing sequentially yields ~800-1600 matches/sec.

### Why Express + SSE

Simpler than WebSockets, no persistent connection management, works through proxies. SSE gives real-time progress without the complexity.

## Section 3: Supabase Data Schema

Unified schema for both simulated and live match data.

### Tables

```sql
game_configs
  id            uuid PK
  name          text           -- "baseline", "fire-nerf-v2"
  version       text           -- semver
  config        jsonb          -- full GameConfig object
  parent_id     uuid FK?       -- what config this was forked from
  created_at    timestamptz
  created_by    uuid FK

simulation_runs
  id            uuid PK
  config_id     uuid FK
  match_count   int
  ai_tiers      int[]          -- [p0_tier, p1_tier]
  seed_start    int
  status        text           -- running | complete | cancelled | failed
  progress      float          -- 0.0 to 1.0
  started_at    timestamptz
  completed_at  timestamptz?
  created_by    uuid FK

match_results
  id            uuid PK
  run_id        uuid FK?       -- null for live matches
  config_id     uuid FK?       -- null for live (uses current default)
  source        text           -- 'simulation' | 'live'
  seed          int?
  winner        int            -- 0 or 1
  rounds        int            -- how many rounds played
  duration_ms   float          -- total duel time across rounds
  created_at    timestamptz

match_player_stats
  id            uuid PK
  match_id      uuid FK
  player_index  int            -- 0 or 1
  ai_tier       int?           -- null for human players
  user_id       uuid?          -- null for AI
  final_hp      float
  affix_ids     text[]
  combination_ids text[]
  synergy_ids   text[]
  loadout       jsonb          -- full final loadout snapshot

match_round_details
  id            uuid PK
  match_id      uuid FK
  round         int
  winner        int
  duration_ticks int
  p0_hp_final   float
  p1_hp_final   float
  p0_damage_dealt float
  p1_damage_dealt float
  combat_log    jsonb?         -- optional, stored only when requested
```

### Key Design Decisions

- **`source` column on `match_results`** — same reporting layer queries simulated and live data. Filters include/exclude either.
- **`config_id` nullable for live matches** — live games use the current default config. When live configs are versioned, this can be backfilled.
- **`combat_log` is optional** — at 50k matches, full tick-by-tick logs would be massive. Stored only for individual inspection or small sample runs.
- **`parent_id` on `game_configs`** — enables "fork config, tweak values, compare results" workflow with full lineage tracking.
- **Aggregates computed at query time** — Postgres views/functions for win rates, affix stats, etc. At 50k rows this is fast enough and avoids stale data.

## Section 4: Config Editor (Hybrid UI)

### Form Mode — Quick Value Tweaks

- Tree navigation on the left: Affixes > Offensive > Sharpness > Tier 1
- Right panel shows editable fields with appropriate controls (dropdowns for stat/op, number inputs for values)
- Slider controls for balance knobs (flux budgets, stat caps, tick rate)
- Toggle switches to enable/disable individual affixes, combinations, or synergies without deleting them
- Inline Zod validation — red highlights on invalid values
- "Diff from baseline" indicator — changed values highlighted

### Raw Mode — Structural Changes

- Full JSON editor (Monaco) with GameConfig schema
- JSON Schema autocomplete and validation
- Copy-paste entire affix blocks, add new entities, restructure combinations
- Side-by-side diff view against the parent config

### Config Management Workflow

1. Start from an existing config (or the default baseline)
2. "Fork" creates a copy with a new name and `parent_id` link
3. Make changes in either mode — they sync bidirectionally
4. "Validate" runs Zod schema check + engine-level sanity checks (e.g., combination references valid affix IDs)
5. "Save" persists to Supabase
6. "Run Simulation" button right in the editor — launches a run with this config

### Key UX Detail

The editor always shows which config your current simulation results are based on. When viewing results, "Edit Config" jumps back to tweak and re-run — tight iteration loop.

## Section 5: Analytics Dashboard & Visualizations

### Dashboard Structure — Tab-Based Layout

**Overview Tab**
- Run selector: pick a simulation run or compare two side-by-side
- Config filter: which GameConfig version(s) to include
- Source filter: simulated / live / both
- Summary cards: total matches, avg duration, P0 vs P1 win rate, most-picked affix, most dominant archetype

**Balance Tab**
- Affix win rate matrix: every affix's win rate when picked, sortable/filterable by tier
- Archetype matchup heatmap: head-to-head grid (physical_burst vs elemental_fire, etc.)
- "Must-pick / never-pick" detector: affixes with >60% pick rate or <5% flagged
- First-player advantage tracker across configs

**Per-Round Tab**
- Round 1 vs 2 vs 3 breakdowns: win rates, avg duel duration, damage dealt
- Draft value analysis: orbs picked early vs late, correlation with winning
- Forge efficiency: flux spent vs stat gains, unused flux rates
- Comeback rate: how often does the round 1 loser win the match

**Distributions Tab**
- Damage histograms (physical vs elemental vs DOT)
- HP-over-time curves (sampled from combat logs)
- Stat distribution box plots across all matches
- Duel duration distribution (quick kills vs timeouts)

**Meta Evolution Tab**
- Config version selector: pick 2+ configs to compare
- Side-by-side charts: how win rates, pick rates, and matchup spreads shifted
- Trend lines across sequential config versions
- Diff summary: "Config B nerfed fire by 15% → fire archetype win rate dropped from 62% to 48%"

**Match Inspector Tab**
- Searchable match list with filters (winner, affixes used, duration, round count)
- Individual match deep-dive: loadout snapshots, round-by-round stats, combat log playback
- Enhanced from existing tools functionality with DB-backed search

### Export

- CSV export for any table/chart data
- PNG export for individual charts (social media / reports)
- PDF report generation with configurable sections

### Global Filter Dimensions

Available across all tabs:
- Source (simulated / live)
- Config version
- AI tier matchup
- Date range
- Affix inclusion/exclusion
- Round count (best-of-1 vs best-of-3)
- Win/loss

## Section 6: Engine Refactoring & Match Data Pipeline

### Engine Changes

Core refactor: registries accept injected data instead of importing hardcoded arrays.

```typescript
// Before: hardcoded imports
import { AFFIX_REGISTRY } from './data/affix-registry';

// After: config-injected
function createEngine(config: GameConfig) {
  const affixRegistry = buildAffixRegistry(config.affixes);
  const comboRegistry = buildComboRegistry(config.combinations);
  // ... returns an engine instance with all registries bound
}
```

- `createMatch()` accepts a `GameConfig` parameter
- All internal functions that currently reach for global registries instead receive them via the engine instance or as parameters
- Existing hardcoded data files become `defaultConfig()` — returns current data as a `GameConfig` object
- No behavior changes — the default config produces identical results

### Match Data Extraction

New `extractMatchReport()` function producing a standardized report from any completed match:

```typescript
interface MatchReport {
  seed?: number;
  source: 'simulation' | 'live';
  winner: number;
  rounds: number;
  durationMs: number;
  players: PlayerReport[];     // affix_ids, combo_ids, synergies, loadout, final stats
  roundDetails: RoundReport[]; // per-round winner, duration, HP, damage
  combatLog?: CombatLog[];     // optional, full tick data
}
```

- **Simulation:** runner calls `extractMatchReport()` after each match → writes to Supabase
- **Live matches:** the `match-complete` edge function gets revived to call the same `extractMatchReport()` and write to the same tables
- Same schema, same tables, same reporting — the only difference is the `source` field

### Safety Net

`defaultConfig()` produces byte-identical output to the current hardcoded registries, so all existing tests remain valid without modification.

## Scope & Non-Goals

### In Scope

- Data-driven GameConfig schema with Zod validation
- Engine refactor to accept injected configs
- Node.js backend with worker thread pool for parallel simulation
- Supabase schema for configs, runs, and unified match results
- Hybrid config editor (form + raw JSON)
- 6-tab analytics dashboard with filtering and export
- Match data pipeline for both simulated and live matches
- `extractMatchReport()` standardized output

### Out of Scope (Future Work)

- Player-facing stats pages or social media integrations (schema supports it, UI is future)
- Distributed simulation across multiple machines
- Real-time live match streaming into the dashboard
- A/B testing framework for deploying different configs to different players
- Automated balance suggestions (AI-driven tuning)
