# Run Gameplay Loop — Next Steps Review

**Date:** 2026-04-14
**Status:** Proposals for review (not a committed spec — pick a direction tomorrow)

---

## Current State Summary

The run gameplay loop engine is **feature-complete and well-tested**. Here's what exists:

### Engine (fully implemented, merged to main)
- **RunState machine**: lives (default 3), rounds (goal 10), status tracking, win streaks
- **Life recovery**: 3 mechanisms — win streak (3 consecutive), milestone rounds ([5, 10]), discovery threshold (5 recipes)
- **Pool scaling**: 5-tier progression table (rounds 1-3 through 15+), pool shrinks and quality rises
- **Flux economy**: earn on wins/milestones/discoveries, spend on boost_combine/reroll_pool/guarantee_rarity
- **Combination engine**: 3-layer system (signature recipes → category combos → generic upgrade), 93 recipes
- **Discovery state**: tracks found recipes, attempted combos, synergy discoveries
- **Phase machine**: `getNextPhaseRun()` handles draft→forge→duel→(check lives/goal)→next round
- **Match controller**: full `duel_continue` handler with RunState updates, flux rewards, synergy tracking
- **Payload serialization**: `serializePayload()`, `computePowerBracket()`, `isMatchable()` for async matching

### Client (partially implemented)
- **PhaseRouter**: run mode header bar with `RunLivesDisplay` + `RunRoundCounter`
- **RunStatusOverlay**: full-screen "Run Over" overlay on death
- **PostMatch**: run-aware with "RUN WON!" / "RUN OVER" messaging, round count
- **CombineWorkbench**: 3-slot combine UI with glow signals (gold for recipe match, white for generic)
- **Matchmaking**: "Start Run" flow with AI tier selection, creates `run_async` match
- **runStore**: mirrors engine RunState (lives, round, goal, status, consecutiveWins)
- **combineStore**: gem selection state for combine UI (max 2 gems)
- **Forge page**: has flux display (`runState.flux`), combine workbench integrated

### What's Missing / Incomplete
1. **Flux spending UI** — engine handles `boost_combine`, `reroll_pool`, `guarantee_rarity` but no buttons/UX to trigger them
2. **Discovery feedback** — no "You discovered X!" toast/reveal when a signature recipe is found
3. **Combine preview** — `combineStore` has `previewResult` but it's never populated; player can't see what they'll get before confirming
4. **Between-round transition** — no interstitial showing round result, life changes, flux earned, streaks
5. **Synergies in combat** — synergy stat keys filtered out of duel engine; synergies tracked for discovery but don't affect gameplay
6. **Endless mode UX** — code continues past goal round but no visual indicator of entering endless, no special treatment
7. **AI combine strategies** — AI doesn't combine gems during forge; only sockets
8. **Run summary stats** — PostMatch shows round list but not: recipes discovered, total flux earned, longest streak, deepest combine chain
9. **Pool scaling mismatch** — engine code defaults differ from balance.json values; engine doesn't read balance.json for pool scaling
10. **match-report.ts TODOs** — compound/recipe ID collection and generic upgrade counting not implemented

---

## Proposal A: "Make the Run Feel Good" (UX Polish Sprint)

**Philosophy:** The engine works. The player can't tell. Focus on making the existing mechanics *visible and satisfying* before adding new ones.

### What to build

**A1. Between-round interstitial screen**
After each duel, before the next draft, show a 2-3 second transition screen:
- Round result: "Round 3 — Victory!" or "Round 3 — Defeat"
- Life change animation (heart fills/drains)
- Flux earned this round (+1 win, +3 milestone, +2 discovery)
- Win streak counter ("3-win streak! +1 life recovered!")
- "Continue" button to proceed to next draft

This is the single highest-impact missing piece. Right now the player goes duel → draft with no breathing room and no feedback on what just happened to their run state.

**A2. Discovery toast system**
When a signature recipe is discovered during combine:
- Gold toast notification: "New Recipe Discovered: Ignite (Fire + Fire)"
- Brief particle effect on the combine result
- Discovery count in the run header bar (e.g., "3 recipes found")

**A3. Combine preview**
Before confirming a combine, show what the result will be:
- Output gem with tier/rarity/affix preview
- "Signature Recipe!" badge if it's a known recipe
- "New Discovery?" indicator if it's an untried combination
- Quality comparison (input EV → output EV)

**A4. Flux spending buttons in Forge**
Three buttons in the forge UI (only in run mode):
- "Boost Combine" (3 flux) — next combine gets +1 tier
- "Reroll Pool" (5 flux) — next draft generates a fresh pool
- "Guarantee Rarity" (4 flux) — next draft guarantees at least one rare+ gem
Each with cost displayed, disabled when insufficient flux.

**A5. Endless mode indicator**
When the player reaches round 10 (goal):
- Brief celebration: "Goal Reached! Entering Endless Mode..."
- Header bar switches from "Round 8 / 10" with progress bar to "Round 11 (Endless)" with infinity symbol
- Pool scaling continues to get harder

### What this does NOT include
- No synergy combat effects (deferred — needs duel engine work)
- No async matchmaking (deferred — needs Supabase work)
- No AI combine strategy (deferred — cosmetic, AI is opponent)
- No run persistence/history (deferred — needs DB)

### Estimated scope
~5 engine changes (pool scaling alignment, combine preview API, flux action wiring) + ~8 client components. Medium sprint, mostly client work.

### Why this first
The run loop *works* but feels flat. The player has no sense of progression, risk, or discovery during a run. These changes make the existing mechanics legible without adding new systems.

---

## Proposal B: "Complete the Combat Layer" (Synergies + Depth)

**Philosophy:** The combination system is rich but the combat system doesn't use it. Gems have tags, recipes have bonus effects, but duels are still just stat checks. Make the combat system reward smart combining.

### What to build

**B1. Wire synergy bonuses into the duel engine**
Currently `activeSynergies` are computed by `calculateStats()` but the stat keys are filtered out. Actually apply them:
- Synergy bonuses as additive stat modifiers (step 7 in stat pipeline)
- Visual indicators during duel playback when a synergy triggers
- Example: 3 fire-tagged gems → "Inferno" synergy → +15% fire damage

**B2. Recipe bonus effects in stat calculation**
Recipes define `outputBonusEffects` (e.g., Ignite gives +10% crit chance). These should feed into `calculateStats()` as an additional step after base gem stats.

**B3. Depth bonus scaling**
Gems with higher `recipeDepth` should get a small bonus (defined in balance.json as `depthBonusPerLevel`). A depth-2 gem is worth more than two depth-0 gems, rewarding chained combining.

**B4. Combat log enrichment**
Show in the duel combat log:
- Which synergies are active and their effects
- When a recipe bonus triggers
- Depth bonus contributions

**B5. AI combine strategies**
Give the AI the ability to combine gems during forge:
- `greedy` — always combine for highest EV output
- `discovery` — try untested combinations
- `tier_focused` — prioritize tier upgrades
- `rarity_focused` — prioritize rarity upgrades
Tie strategy to AI tier (1=random, 3=greedy, 5=discovery+tier_focused)

### What this does NOT include
- No UX polish (combine preview, interstitials, flux UI — assumes Proposal A is done or deferred)
- No async matchmaking
- No run persistence

### Estimated scope
~6-8 engine changes (stat pipeline, duel engine, AI forge strategy) + ~3 client changes (combat log enrichment). Heavier engine work, lighter client work.

### Why this approach
The combination system is the game's most unique mechanic but it currently has no impact on combat outcomes beyond raw stats. Making synergies, recipe bonuses, and depth matter turns combining from "merge for bigger number" into genuine strategic decisions.

---

## Proposal C: "Ship the Minimum Viable Run" (Vertical Slice)

**Philosophy:** Pick the smallest set of changes that makes the run mode feel like a complete, shippable game loop. Cut anything that isn't blocking the core experience.

### What to build (and nothing else)

**C1. Between-round interstitial (simplified)**
Minimal version: 1-second fade showing "Round X — Win/Loss", life change, "Continue" button. No flux display, no streak animation. Just enough to orient the player.

**C2. Flux display + reroll button**
Show current flux in the run header bar. Add ONE flux action: "Reroll Pool" (5 flux). This is the most impactful flux action because it gives the player agency over their draft options. Defer boost_combine and guarantee_rarity.

**C3. Fix pool scaling to use balance.json**
The engine's `DEFAULT_SCALING` and balance.json disagree. Make `getPoolConfigForRound()` read from the registry so balance tuning actually works. This is a correctness fix, not a feature.

**C4. Run summary on PostMatch**
Add to the PostMatch screen:
- Total rounds survived
- Win/loss record
- Total flux earned
- Recipes discovered (count only, no detail)

**C5. Combine preview (minimal)**
Show the output gem's tier + rarity before confirming. No recipe badge, no discovery indicator. Just "Tier 3 Rare" so the player knows what they're getting.

### What this explicitly defers
- Discovery toasts, synergies, AI combining, endless mode indicator, full flux action suite, recipe bonus effects, depth bonuses, async matchmaking, run persistence

### Estimated scope
~3 engine changes + ~4 client components. Small sprint, can be done in a day.

### Why this approach
Ship fast, learn from playtesting. The run mode is playable today but has a few paper cuts that make it confusing (no between-round feedback, can't see combine results, pool scaling is misconfigured). Fix those and start playtesting to learn what actually matters.

---

## My Recommendation

**Start with Proposal C, then layer in Proposal A.**

Rationale:
1. **C is a correctness + playability fix** — the pool scaling mismatch is a bug, the missing interstitial is disorienting, and combine preview is table stakes. These should be fixed regardless of direction.
2. **A builds naturally on C** — once the minimal interstitial exists, enriching it with flux/streak/discovery info is incremental. Once combine preview exists, adding recipe badges is incremental.
3. **B (combat depth) is important but independent** — synergies and recipe bonuses can be layered in at any time without touching the run UX. It's a parallel workstream, not a prerequisite.

Suggested order:
1. **Tomorrow:** Proposal C (half-day sprint)
2. **Next session:** Proposal A items (A1 full interstitial, A2 discovery toasts, A4 flux buttons)
3. **Following session:** Proposal B items (synergies, recipe bonuses, AI combining)

---

## Appendix: Current File Map

| Area | Key Files | Status |
|------|-----------|--------|
| Run state machine | `engine/src/run/run-state.ts` | Complete |
| Flux economy | `engine/src/run/flux-state.ts` | Complete (not wired to UI) |
| Pool scaling | `engine/src/run/pool-scaling.ts` | Complete (mismatch with balance.json) |
| Combination engine | `engine/src/combine/combination-engine.ts` | Complete |
| Discovery tracking | `engine/src/combine/discovery-state.ts` | Complete |
| Phase machine | `engine/src/match/phase-machine.ts` | Complete |
| Match controller | `engine/src/match/match-controller.ts` | Complete |
| Forge state | `engine/src/forge/forge-state.ts` | Complete |
| Balance config | `engine/src/data/balance.json` | Has run config |
| Client PhaseRouter | `client/src/pages/PhaseRouter.tsx` | Run header bar working |
| Run lives display | `client/src/components/RunLivesDisplay.tsx` | Working |
| Run round counter | `client/src/components/RunRoundCounter.tsx` | Working |
| Run status overlay | `client/src/components/RunStatusOverlay.tsx` | Working (death only) |
| Post-match | `client/src/pages/PostMatch.tsx` | Run-aware but minimal |
| Combine workbench | `client/src/components/CombineWorkbench.tsx` | Working (no preview) |
| Forge page | `client/src/pages/Forge.tsx` | Has flux display, combine integrated |
| Matchmaking | `client/src/pages/Matchmaking.tsx` | Run start flow working |
| Run store | `client/src/stores/runStore.ts` | Mirrors engine state |
| Combine store | `client/src/stores/combineStore.ts` | Ready, preview unused |
