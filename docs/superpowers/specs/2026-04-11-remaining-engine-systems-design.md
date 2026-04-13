# Remaining Engine Systems — Design Spec

**Date:** 2026-04-11
**Branch:** `feature/gem-system-refactor`
**Scope:** Engine-only (no client/UI changes)

This spec covers the four engine systems that remain incomplete after the gem system refactor: flux economy, synergy completion, AI forge strategy scaling, and synthetic AI opponent generation.

---

## 1. Flux Economy

### Context

Balance config (`balance.json`) already defines flux earn/spend values. `flux-tracker.ts` exists but is deprecated stubs returning 0. `RunState` has no flux tracking. The flux system gives players a secondary resource earned through skilled play that they can spend during forge phases to influence outcomes.

### Design

Add flux as a field on `RunState` managed by pure functions in a new `flux-state.ts` module.

**Earn events** (applied at duel completion in match controller):
- Win a duel: +1 flux
- Discover a recipe: +2 flux
- Reach a milestone round: +3 flux

Values read from `balance.json` at `gem.flux.rewards.{win, discovery, milestone}` (accessed via `registry.getBalance().gem.flux.rewards`).

**Spend actions** — three new `ForgeAction` variants:

| Action | Cost | Effect |
|--------|------|--------|
| `boost_combine` | 3 | Guarantees +1 rarity on combine output |
| `reroll_pool` | 5 | Sets a `rerollNextDraft` flag on `RunState`; the next draft phase regenerates the pool instead of using the default |
| `guarantee_rarity` | 4 | Forces next drafted gem to minimum Rare rarity |

Costs read from `balance.json` at `gem.flux.costs.{boostCombine, rerollPool, guaranteeRarity}` (accessed via `registry.getBalance().gem.flux.costs`).

**Validation:** `canSpendFlux(runState, cost): boolean` guard. Match controller validates flux before applying spend actions (forge-plan itself stays stateless w.r.t. flux — the match controller checks `canSpendFlux` and calls `spendFlux` on `RunState` before forwarding the action to forge-plan for its game effect).

### File Changes

| File | Change |
|------|--------|
| `src/run/flux-state.ts` | **New.** Pure functions: `earnFlux()`, `spendFlux()`, `canSpendFlux()` |
| `src/run/run-state.ts` | Add `flux: number` field to `RunState`, initialize to 0 in `createRunState()`. Add `rerollNextDraft: boolean` flag (default false) for `reroll_pool` action |
| `src/types/forge-action.ts` | Add 3 variants: `boost_combine`, `reroll_pool`, `guarantee_rarity` |
| `src/forge/forge-plan.ts` | Handle `boost_combine` effect (rarity bump on combine output) via a `boosted: boolean` flag passed through from match-controller. `reroll_pool` and `guarantee_rarity` are handled at match-controller level since they affect draft state, not forge state |
| `src/match/match-controller.ts` | Call `earnFlux()` at duel completion for win/discovery/milestone events. Validate and apply flux spend actions (`reroll_pool` sets flag on RunState, `guarantee_rarity` sets flag on next draft config). All flux deductions happen at `forge_complete` time (not during speculative `applyPlanAction` calls), so planning remains free. `boost_combine` sets a flag that forge-plan reads when applying the next combine |
| `src/forge/flux-tracker.ts` | Delete (deprecated, replaced by flux-state). Also remove its re-exports (`getFluxForRound`, `getActionCost`) from `src/index.ts` |
| `src/index.ts` | Export new flux functions, remove flux-tracker exports |

### Tests

- `flux-state.test.ts` — earn/spend/validation, edge cases (zero balance, exact balance)
- Update `forge-plan.test.ts` — boost_combine, reroll_pool, guarantee_rarity action handling
- Update `match-controller.test.ts` — flux earned on win, discovery, milestone

---

## 2. Synergy Completion

### Context

`SynergyDef` type exists with `requiredAffixes` checked by `isSynergyActive()` in stat-calculator. 13 synergies defined in `synergies.json`. But combined gems carry ancestor affix IDs in their `tags` array, and those tags are ignored during synergy detection. `DiscoveryState` has `recordSynergyDiscovery()` / `isSynergyDiscovered()` but they're never called during gameplay.

### Design

Three changes:

#### 2a. Tag-based synergy detection

Update `collectAffixIds()` in `stat-calculator.ts` to include each gem's `tags` array. Since `tags` already contains the gem's own `affixId` as its first entry (set by `createGem`), we replace the current `affixId` push with a spread of `tags`. Use a `Set<string>` to collect unique affix IDs across all gems, preventing double-counting when the same affix appears on multiple gems or in both `affixId` and `tags`. This matters because `isSynergyActive` uses a count map internally.

No changes to `SynergyDef` — the existing `requiredAffixes` model works once we widen the affix ID source to include tags.

#### 2b. Synergy discovery wiring

In match-controller's duel result handling, after the duel resolves:
1. Compute active synergies for each player's loadout
2. For any synergy that's active and not yet in the player's `DiscoveryState`, call `recordSynergyDiscovery()`
3. Include synergy discovery count when computing `discoveryCount` for life recovery checks

#### 2c. Active synergy reporting

Modify `calculateStats()` to return active synergy information alongside `DerivedStats`:

```typescript
interface StatsResult {
  stats: DerivedStats;
  activeSynergies: ActiveSynergy[];
}
```

Each `ActiveSynergy` (already defined in `types/synergy.ts`) reports `synergyId`, `isActive`, and `missingCount`. This lets match reports and eventually the client show which synergies fired.

#### 2d. DiscoveryState integration

Add a `discoveryState: DiscoveryState` field to `MatchState` (for run-mode matches). The match controller initializes it from serialized data at match creation and updates it on recipe/synergy discoveries. `checkLifeRecovery` receives `discoveryState.totalDiscoveryCount()` as the `discoveryCount` parameter (combined total of recipe + synergy discoveries).

### File Changes

| File | Change |
|------|--------|
| `src/forge/stat-calculator.ts` | Update `collectAffixIds()` to use gem tags (Set-based); return `StatsResult` from `calculateStats()`; remove TODO comment at line 268 |
| `src/match/match-controller.ts` | Wire synergy discovery into duel result handling; pass combined discovery count to `checkLifeRecovery` |
| `src/types/match.ts` | Add optional `discoveryState` field to `MatchState` |
| `src/forge/forge-plan.ts` | Update `getPlannedStats` return type to `StatsResult` |
| `src/match/match-report.ts` | Update callers of `calculateStats` to destructure `StatsResult` |
| `src/combine/discovery-state.ts` | Add `totalDiscoveryCount()` method returning recipe + synergy count |

### Tests

- Update `stat-calculator.test.ts` — tag-based synergy activation, `StatsResult` shape
- Update `forge-plan.test.ts` — destructure `StatsResult` from `getPlannedStats`
- Update `match-controller.test.ts` — synergy discovery on duel completion, discovery count in life recovery
- Update `discovery-state.test.ts` — `totalDiscoveryCount()` method

---

## 3. AI Forge Strategy Scaling

### Context

All 5 tier strategies in `forge-strategy.ts` receive the `round` parameter but ignore it (except round-1 base item/stat selection). AI plays identically on round 1 and round 12. The `AIController` and match controller already pass round numbers correctly — only strategy logic needs to change.

### Design

Add round-aware behavior to Tiers 2-5. Tier 1 stays purely random (that's intentional for the lowest AI level).

**Round phases:**
- **Early (rounds 1-3):** Conservative. Socket what you draft, combine only obvious matches.
- **Mid (rounds 4-7):** Start prioritizing combinations. Higher tiers attempt multi-step chains.
- **Late (rounds 8+):** Aggressive. Unsocket lower-value gems to attempt better combinations.

**Per-tier changes:**

| Tier | Change |
|------|--------|
| Tier 1 | No change — stays random |
| Tier 2 | Skip combines on rounds 1-2. From round 3 onward (`round >= 3`), attempt one combine per forge. |
| Tier 3 | Round multiplier on combination scoring — later rounds weight combine output value higher, preferring combines over raw socketing. |
| Tier 4 | Unlock unsocket-to-recombine at round 6+. Currently never unsockets. |
| Tier 5 | Add loadout quality delta check — only combine if predicted output improves total loadout quality. Round-gated aggressiveness. |

### File Changes

| File | Change |
|------|--------|
| `src/ai/strategies/forge-strategy.ts` | Modify `Tier2ForgeStrategy`, `Tier3ForgeStrategy`, `Tier4ForgeStrategy`, `Tier5ForgeStrategy` plan methods |

### Tests

- Update existing strategy tests or add new cases in `forge-strategy.test.ts` — verify round-dependent behavior changes for each tier
- Verify via simulation runner that higher-round AI produces stronger loadouts

---

## 4. Synthetic AI Opponent Generation

### Context

`payload.ts` has `serializePayload()` and `isMatchable()` for async matchmaking. When no real opponent payload is available (queue timeout), the system needs to generate a plausible AI opponent loadout scaled to the player's current round.

### Design

New function:

```typescript
function generateSyntheticOpponent(
  round: number,
  aiTier: AITier,
  registry: DataRegistry,
  rng: SeededRNG,
): PlayerPayload
```

**Algorithm:** Simulate a mini-run for the AI from round 1 to `round`:
1. For each round 1→N: generate pool using existing pool-scaling, select gems (AI draft strategy), run AI forge strategy to socket/combine.
2. At the target round, serialize the AI's loadout via `serializePayload()`.

This reuses all existing infrastructure: pool generator, AI controller, forge plan.

**AI tier selection by round:**
- Rounds 1-4: Tier 2-3
- Rounds 5-8: Tier 3-4
- Rounds 9+: Tier 4-5

The caller (Supabase `run-match` edge function) can override the tier.

**Flux during generation:** The synthetic AI's forge strategy receives `fluxRemaining: 0` — synthetic opponents don't use the flux economy.

**Determinism constraint:** Must produce identical output given the same `seed + round + tier`, so fallback opponents are reproducible for replay/debugging.

### File Changes

| File | Change |
|------|--------|
| `src/run/synthetic-opponent.ts` | **New.** `generateSyntheticOpponent()`, `defaultTierForRound()` |
| `src/index.ts` | Export new function |

### Tests

- `synthetic-opponent.test.ts` — deterministic output, correct tier selection, loadout quality scales with round, payload shape valid

---

## Dependency Order

The four systems have minimal dependencies:

1. **Flux** and **Synergy Completion** are independent of each other — can be built in parallel.
2. **AI Strategy Scaling** is independent but benefits from flux actions existing (Tier 4-5 could eventually spend flux, but not in this iteration).
3. **Synthetic Opponent** depends on AI strategies existing and working correctly, since it runs AI forge plans internally. Build last.

Recommended build order: Flux + Synergies (parallel) → AI Strategies → Synthetic Opponent.

---

## Out of Scope

- Client UI for any of these systems (separate effort)
- Supabase queue table / matchmaking persistence (server-side)
- `minGemCount` on `SynergyDef` (not needed by existing synergies)
- AI spending flux (future iteration — AI strategies only socket/combine/unsocket for now)
- E2E tests (blocked on client UI wiring)
