# Alloy — Project Handoff Document

**Date:** 2026-03-16 (updated)
**Status:** Phases 1-3 Substantially Complete, Phase 4+ Remaining

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
│   ├── client/          ← React frontend (PLAYABLE — local vs AI)
│   └── supabase/        ← Backend (STUB — schema done, functions commented)
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

### Client (`packages/client/`) — Playable locally vs AI

Full single-player match flow is playable in browser against AI opponents.

**Dev server:** `pnpm -F @alloy/client dev`

#### Pages and Routing

| Path | Component | Status |
|------|-----------|--------|
| `/` | MainMenu | Working |
| `/queue` | Matchmaking | UI only (server stub) |
| `/match/:id/draft` | Draft | Working vs AI |
| `/match/:id/forge` | Forge | Working vs AI |
| `/match/:id/duel` | Duel | Working (PixiJS + text log) |
| `/match/:id/adapt` | Adapt | Route exists, unreachable |
| `/match/:id/result` | PostMatch | Working |
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
- **authStore** — Player ID, display name (guest login)
- **profileStore** — ELO, wins, losses (local only, not persisted to DB)

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

### Supabase Backend (`packages/supabase/`) — Schema complete, functions stubbed

**Database schema** (5 migrations): profiles with ELO/rank, matches, match_rounds, mastery_tracks, player_mastery, unlocks, matchmaking_queue, leaderboard materialized view, RLS policies.

**Edge functions** (7): matchmaking, match-create, draft-pick, forge-submit, match-complete, match-state, ai-match-create — all have CORS + auth pattern but DB operations are commented out.

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

14. **useDraftSync payload nesting wrong** — accesses `payload.orbUid` instead of `payload.payload.orbUid`
15. **Base items hardcoded** — always sword/chainmail; 14 items in data unused
16. **profileStore not persisted** — local-only despite DB schema being complete

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
- **All React components** — no .test.tsx files exist

---

## What's Next

### Immediate Priorities
1. Fix critical bugs (on_low_hp, reflect_damage, stat_buff, AI adapt)
2. Fix data integrity issues (invalid combination IDs, affix stat key gaps)
3. Add regression tests for damage-calc.ts and trigger system
4. Wire up trigger system (extractTriggers from loadout affixes)

### Phase 4: Backend + Multiplayer
- Replace MockSupabaseClient with real client (env-gated)
- Uncomment and complete edge function DB operations
- Add JWT verification to getUserId
- Wire Realtime for multiplayer draft/forge/duel
- ELO-based matchmaking with expanding window

### Phase 5: Meta + Polish
- Base item selection UI (unlock the 14 items)
- Profile persistence to Supabase
- Mastery tracks, unlock flow, recipe book
- Adapt phase activation
- Sound, transitions, onboarding tutorial

### Phase 6: Launch Prep
- E2E Playwright tests
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
| `@alloy/client` | ~70+ | 6 | Playable (local AI) |
| `@alloy/tools` | 8 | — | Complete |
| `@alloy/supabase` | ~15 | — | Schema done, functions stubbed |
| Data files (JSON) | 5 | — | Complete |
