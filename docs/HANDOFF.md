# Alloy — Project Handoff Document

**Date:** 2026-03-17 (updated)
**Status:** Phases 1-4 Substantially Complete, Phase 5+ Remaining

---

## What Is Alloy?

A competitive mobile-friendly auto-battler where two rival blacksmiths draft crafting orbs from a shared pool, privately forge a weapon and armor, and their gladiators auto-duel. Quick sessions (<2 min casual, 4-6 min ranked), deep skill ceiling, zero pay-to-win.

**Full spec:** `docs/superpowers/specs/2026-03-14-alloy-technical-implementation-design.md`

---

## Project Structure

```
alloy/
├── packages/
│   ├── engine/          ← Pure TypeScript game engine (COMPLETE)
│   ├── tools/           ← Balance visualization dashboard (COMPLETE)
│   ├── client/          ← React frontend (PLAYABLE — local AI + online PvP)
│   └── supabase/        ← Backend (IMPLEMENTED — schema + 8 edge functions)
├── docs/
│   └── superpowers/     ← Specs and plans
├── package.json         ← pnpm workspace root
├── tsconfig.base.json   ← Shared strict TS config
└── pnpm-workspace.yaml
```

**Tech Stack:** TypeScript 5.7+ (strict), pnpm 9+ workspaces, tsup (engine build), Vite 6 (client/tools), Vitest 3.x (tests), Zod 3 (data validation), React 19, React Router 7, Zustand 5, TailwindCSS v4, PixiJS 8, Supabase (PostgreSQL + Deno Edge Functions + Realtime)

---

## What's Built

### Game Engine (`packages/engine/`) — All tests passing

The entire game engine is complete, headless, deterministic, and tested. Every game system runs as pure functions with immutable state.

**Run tests:** `pnpm -F @alloy/engine test`
**Build:** `pnpm -F @alloy/engine build` (ESM + CJS + DTS)

| Module | Key Files | What It Does |
|--------|-----------|-------------|
| **Types** | `src/types/` (13 files) | Complete type system: AffixDef, OrbInstance, EquippedSlot, ForgedItem, Loadout, MatchState, DerivedStats, CombatLog, TickEvent, ForgeAction, GameAction |
| **Data Registry** | `src/data/` (5 JSON + 3 TS) | 33 affixes (4 tiers each), 29+ combinations, 14 synergies, 14 base items, balance config. Zod-validated, O(1) lookups via DataRegistry |
| **Seeded RNG** | `src/rng/seeded-rng.ts` | xoshiro128** with `fork()` for subsystem isolation. All randomness is deterministic from seed |
| **Pool Generator** | `src/pool/` | Draft pools with tier distribution, category weighting, archetype validation, trigger guarantees |
| **Draft System** | `src/draft/` | State machine: alternating picks, validation, auto-pick. `createDraftState()` → `makePick()` → complete |
| **Forge System** | `src/forge/forge-state.ts`, `flux-tracker.ts` | 6 forge actions (assign, combine, upgrade, swap, remove, set base stats) with flux enforcement and round rules |
| **Stat Calculator** | `src/forge/stat-calculator.ts` | 9-step pipeline: base HP → inherent bonuses → base stat scaling → slot effects → synergy detection → flat/percent/override → caps |
| **Duel Engine** | `src/duel/` (5 files) | Tick-based combat (30 ticks/sec, max 3000). Dodge → block → damage → crit → barrier → HP → triggers → lifesteal → thorns → DOTs → regen → death check. Returns CombatLog |
| **Match Controller** | `src/match/` | Full lifecycle: pool → draft → (forge → duel) × 3 → complete. Phase machine with valid transitions. Quick/ranked/unranked modes |
| **AI System** | `src/ai/` (5 files) | 5 tiers with strategy pattern. T1 (random) through T5 (exhaustive search with denial scoring). Draft, forge, and adapt strategies per tier |
| **Balance Testing** | `src/balance/` (3 files) | Batch simulation runner, aggregate stats collector, balance report generator with outlier detection |

### Client (`packages/client/`) — Playable locally vs AI and online PvP

Full match flow is playable in browser against AI opponents or other players via Supabase Realtime.

**Dev server:** `pnpm -F @alloy/client dev`

#### MatchGateway Abstraction

The client uses a **MatchGateway** interface to abstract match communication:

- **LocalGateway** — Used for AI matches (code prefixed with `ai-`). Runs game logic entirely in-browser via the engine. No server calls needed.
- **RemoteGateway** — Used for PvP matches. Communicates with Supabase Edge Functions for state mutations and subscribes to Supabase Realtime channels for live updates. Includes automatic reconnection handling.

The `useMatchGateway` hook selects the appropriate gateway based on the match code prefix. All game phase pages (Draft, Forge, Duel, PostMatch) consume the gateway via this hook.

#### Pages and Routing

Routes use `:code` (not `:id`). AI matches use codes prefixed with `ai-`.

| Path | Component | Status |
|------|-----------|--------|
| `/` | MainMenu | Working |
| `/queue` | Matchmaking | Working (AI, PvP casual, PvP ranked) |
| `/match/:code` | MatchEntry | Working (join-via-URL for PvP) |
| `/match/:code/draft` | Draft | Working (AI + PvP) |
| `/match/:code/forge` | Forge | Working (AI + PvP) |
| `/match/:code/duel` | Duel | Working (PixiJS + text log) |
| `/match/:code/adapt` | Adapt | Route exists, unreachable |
| `/match/:code/result` | PostMatch | Working |
| `/profile` | Profile | Local state only |
| `/recipes` | RecipeBook | UI built |
| `/collection` | Collection | UI built |
| `/leaderboard` | Leaderboard | UI built |
| `/settings` | Settings | Working |

#### State Management (Zustand 5)

- **matchStore** — Central store: holds MatchState, dispatches actions, memoized selectors
- **draftStore** — Selected orb + confirm state for two-tap interaction
- **forgeStore** — Active tab, selected orb, drag state, combination toggle
- **uiStore** — Modal, toast, mute, debug overlay
- **authStore** — Player ID, display name (Supabase anonymous auth with offline fallback)
- **profileStore** — ELO, wins, losses (local only, not persisted to DB)

#### Multiplayer UI Components

- **DisconnectOverlay** — Shown when opponent disconnects; uses `useDisconnectTimer` hook with 60-second reconnect window
- **Matchmaking page** — Redesigned with AI quick play, PvP casual (room codes for friend invites), and PvP ranked (Elo-based) flows
- **MatchEntry page** — Join-via-URL flow for PvP matches

#### Duel Rendering

PixiJS 8 scene with:
- GladiatorSprite with attack/hit/death animations
- VFXManager for 7 element effects (fire, ice, lightning, poison, shadow, chaos, crit)
- DamageNumbers (floating particles)
- StatusIcons per player
- RAF-based playback with speed controls and skip

### Balance Dashboard (`packages/tools/`) — Working

**Dev server:** `pnpm -F @alloy/tools dev`

Simulation Runner, Aggregate Analytics, Match Inspector, Balance Report.

### Supabase Backend (`packages/supabase/`) — Implemented

**Database schema** (6 migrations): profiles with ELO/rank, matches, match_rounds, mastery_tracks, player_mastery, unlocks, matchmaking_queue, leaderboard materialized view, RLS policies. Migration `006_multiplayer.sql` adds room codes, multiplayer columns, matchmaker queue improvements, and cleanup triggers.

**Edge functions** (8 implemented, 2 deprecated):
| Function | Status | Purpose |
|----------|--------|---------|
| `match-create` | Implemented | Create new match with room code |
| `match-join` | Implemented | Join existing match by room code |
| `draft-pick` | Implemented | Submit draft pick with validation |
| `forge-submit` | Implemented | Submit forge actions with validation |
| `match-state` | Implemented | Fetch current match state |
| `forfeit` | Implemented | Forfeit a match |
| `matchmaking` | Implemented | Elo-based queue with expanding window |
| `match-complete` | Deprecated | Superseded by in-function completion logic |
| `ai-match-create` | Deprecated | AI matches handled client-side via LocalGateway |

All functions use shared CORS + auth utilities from `_shared/supabase.ts` with proper Supabase client initialization.

---

## Known Issues (Priority Order)

### Critical — Broken Game Logic

1. **`on_low_hp` triggers never applied** — `duel-engine.ts:494-508` evaluates and logs but never calls `applyTriggerEffect`
2. **`reflect_damage` unimplemented** — `duel-engine.ts:476-479` is a no-op
3. **`stat_buff` never affects combat** — pushed to `activeBuffs` but values never consumed by damage calculations
4. **AI adapt strategy identifies wrong player** — `adapt-strategy.ts` uses duel winner to infer player index; wrong when AI wins

### High — Data Integrity

5. **Invalid combination component IDs** — `iron_maiden` references `block`/`armor` (should be `block_chance`/`armor_rating`); `riposte` references `dodge` (should be `dodge_chance`)
6. **~15 affix stat keys silently skipped** — no DerivedStats fields for dotDamage, shadowDamage, chaosDamage, fortify, hpOnHit, barrierOnHit, etc.
7. **Synergy bonusEffects never applied** — `synergy.*` prefixed keys filtered by `shouldSkipKey()`

### Medium — Architecture Gaps

8. **Trigger system stubbed** — `extractTriggers()` returns `[]`. Infrastructure exists but never activates
9. **Adapt phase unreachable** — types, phase machine, AI, and route all exist but `match-controller.ts` never generates it
10. **Lifesteal on pre-barrier damage** — inflates survivability against barrier builds
11. **Pool generator seed mutation** — effective seed after archetype validation retries isn't stored

### Security (Pre-Production)

12. **No JWT verification** — `getUserId()` accepts raw Bearer token as user ID
13. **match-create has no auth** — any unauthenticated request can create matches

### Client

14. **Base items hardcoded** — always sword/chainmail; 14 items in data unused
15. **profileStore not persisted** — local-only despite DB schema being complete

### Dead Code

- `duelStore.ts` — Duel.tsx uses local state instead
- `isSynergyActive()` duplicated in stat-calculator.ts and simulation-runner.ts
- `tools/useSimulation.ts` reimplements engine's `runSimulation()` with divergent logic

---

## Test Coverage

### Well Covered
- RNG (determinism, forks, distribution, bounds)
- Data registry (loading, validation, lookups, Zod schemas)
- Draft (happy path, all 5 error cases, auto-pick, full simulation)
- Forge (all 6 action types with success + failure cases, flux tracking)
- Duel (determinism, all combat mechanics)
- Stat calculator (empty baseline, base items, scaling, synergies, caps, modifier ordering)
- Match controller (phase transitions, early win, full best-of-3, quick mode)
- Pool generator (determinism, sizes, tiers, archetypes, stress test)
- AI (all 5 tiers for draft/forge, balance win-rate tests)

### Critical Gaps (No Tests)
- **damage-calc.ts** — core combat formulas completely untested
- **Trigger system** — all branches of evaluateTrigger/applyTriggerEffect
- **Stun mechanic** — stunTimer logic
- **DOT end-to-end flow** — application, ticking, expiry
- **Simultaneous death** — tiebreaker when both die same tick
- **adapt phase** transitions
- **matchStore actions** — initMatch, applyAction, resetMatch

### Multiplayer Test Coverage
- **Gateway tests:** LocalGateway, RemoteGateway, types, useMatchGateway hook, gateway integration tests
- **Page tests:** Matchmaking, MatchEntry, Forge (updated for gateway), DisconnectOverlay
- **Store tests:** authStore (Supabase anonymous auth + offline fallback)
- **E2E tests:** Playwright tests for multiplayer routing (`:code` patterns, `ai-` prefix)

---

## What's Next

### Immediate Priorities
1. Fix critical bugs (on_low_hp, reflect_damage, stat_buff, AI adapt)
2. Fix data integrity issues (invalid combination IDs, affix stat key gaps)
3. Add regression tests for damage-calc.ts and trigger system
4. Wire up trigger system (extractTriggers from loadout affixes)

### Phase 4: Backend + Multiplayer — COMPLETE
- MatchGateway abstraction (LocalGateway for AI, RemoteGateway for PvP)
- Supabase anonymous auth with offline fallback
- 8 Edge Functions implemented (match-create, match-join, draft-pick, forge-submit, match-state, forfeit, matchmaking, plus deprecated ai-match-create/match-complete)
- Database migration 006_multiplayer.sql (room codes, multiplayer columns, matchmaker improvements)
- RemoteGateway with Supabase Realtime sync
- Matchmaking page with AI/PvP casual/PvP ranked flows
- MatchEntry page for join-via-URL
- DisconnectOverlay with 60-second reconnect window
- Room code system for friend invites
- Elo-based ranked matchmaking with expanding search window

### Phase 5: Meta + Polish
- Base item selection UI (unlock the 14 items)
- Profile persistence to Supabase
- Mastery tracks, unlock flow, recipe book
- Adapt phase activation
- Sound, transitions, onboarding tutorial

### Phase 6: Launch Prep
- Expand E2E Playwright tests (multiplayer routing covered, game flow not yet)
- Mobile performance (60fps target)
- Accessibility pass
- First ranked season
- Analytics integration

---

## Quick Commands

```bash
pnpm install                        # Install all dependencies
pnpm -F @alloy/engine test          # Run engine tests
pnpm -F @alloy/engine build         # Build engine (ESM + CJS + DTS)
pnpm -F @alloy/client dev           # Start client dev server
pnpm -F @alloy/tools dev            # Start balance dashboard
pnpm test                           # Run all tests
```

---

## File Inventory Summary

| Package | Source Files | Test Files | Status |
|---------|-------------|------------|--------|
| `@alloy/engine` | ~43 | 11 | Complete |
| `@alloy/client` | ~80+ | 15+ | Playable (local AI + online PvP) |
| `@alloy/tools` | 8 | — | Complete |
| `@alloy/supabase` | ~20 | — | Implemented (schema + 8 edge functions) |
| Data files (JSON) | 5 | — | Complete |
