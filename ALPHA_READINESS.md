# Alloy — Alpha Readiness Review

**Date:** 2026-04-19
**Branch:** main (v0.2.2)
**Question:** Are the systems in place to start polishing toward an "early alpha" we can show off?

---

## TL;DR

**Yes — but with a handful of real gaps.** The engine and in-match UX are in strong shape: the fun-pass-p0 merge (6028f02) just landed synergies, compound triggers (Ignite), duel juice, discovery toasts, the fat interstitial, and the flux action UI. The core loop is playable, responsive, deterministic, well-tested, and now genuinely feels like a game rather than a prototype.

What's *not* ready to show off yet is everything that surrounds the match: onboarding, progression persistence, weapon/armor choice, and a few dead-code phases that either need wiring or deletion. None of these are hard problems — but a stranger put in front of the game right now will bounce off the opening three minutes, not the combat.

**Recommendation:** ship an "Early Alpha Readiness Sprint" (P0 list below) before a broader showcase. ~1–2 days of focused work.

---

## What Actually Landed Recently (confirmed against current code)

A lot of the April 12 UX review is already stale. Verified against current code:

- **Synergy bonuses wire into damage pipeline** ([duel-engine.ts:193,274](packages/engine/src/duel/duel-engine.ts#L193)) — `synergy.*` keys are no longer filtered out. `SynergyBanner` shows in forge header.
- **Compound triggers work** — Ignite (fire+fire) registers as `compound_dot`, surfaces in combat log and Pixi callout.
- **Discovery system complete** — toasts fire on new recipe, `DiscoveryCounter` in run header, combine preview discovery-gated.
- **Flux action UI wired** — boost/reroll/guarantee buttons all present in [Forge.tsx:838–879](packages/client/src/pages/Forge.tsx#L838).
- **Between-round interstitial** — full version shipped (830c388), previews life change + flux.
- **Duel game feel** — 80ms hit-pause on crits, scaled screen shake on big hits, squash-stretch replaces alpha-flash, 1x/2x/3x speed buttons persisted in uiStore.
- **Old critical combat bugs fixed** — `on_low_hp` now calls `applyTriggerEffect` ([duel-engine.ts:638](packages/engine/src/duel/duel-engine.ts#L638)), `reflect_damage` has a real case ([:574](packages/engine/src/duel/duel-engine.ts#L574)), `stat_buff` reads through `getBuffedStat`.

**Engine test suite:** broad coverage (RNG, draft, forge, duel, stat calculator, match controller, pool generator, AI, ternary combine in flight). `damage-calc.ts` still has historically thin coverage but combat integration tests exercise most paths.

---

## P0 — Blocking Early-Alpha Showcase

These are the "stranger sits down and plays it" blockers. Fix before showing it off.

### 1. No onboarding / first-time experience
**Evidence:** `grep -i "tutorial\|onboard\|firstTime\|newPlayer\|howToPlay"` in `packages/client/src` → zero matches. Main menu → Play → tier select → draft. No explanation of gems, tiers, rarity, combining, synergies, or the run loop. Your single most distinctive mechanic (3-layer discovery-gated combine) is completely hidden from new players.

**Fix options (pick one, cheapest wins):**
- **Smallest:** On first draft load, show a dismissible overlay with 3 tips: "Drag gems to pick", "Two gems + combine = discover recipes", "Your gems affect your gladiator in the duel". Persist dismiss in `uiStore`/localStorage.
- **Better:** A forced 1-round "tutorial run" vs Tier 1 AI with scripted callouts on each phase transition, triggered when no profile exists.
- **Overkill for alpha:** Full guided tutorial scene. Skip.

**Effort:** 2–4 hours for the smallest version.

### 2. No profile persistence
**Evidence:** `profileStore.ts` exists but is local-only per feature-status memory; DB schema for profiles/ELO has been implemented for months. Anyone you show off to can't carry a run result, ELO, or discovery count past a page refresh.

**Fix:** Hydrate `profileStore` from Supabase on auth, write-through on match completion. Gate behind `isOnline()` so offline fallback still works.
**Effort:** 3–4 hours.

### 3. Base item selection UI stubbed
**Evidence:** [HANDOFF.md:175–184](GAME_FLOW_UX_REVIEW.md#L168) and memory — `BaseItemSelector` component exists, `itemSelectionPhase` never triggered, 14 base items unused, everyone plays sword + chainmail. This is a designed progression choice that silently isn't happening.

**Fix:** Trigger the selector modal on round-1 forge, dispatch `select_base_item` action on confirm.
**Effort:** 2–3 hours.

### 4. Adapt phase is dead route
**Evidence:** `Adapt.tsx` page and phase-machine support exist, but `match-controller.ts` never generates an adapt phase. Either wire it (strategic breathing room between rounds) or delete the route so it can't be reached by a stale URL.

**Fix:** Decide — wire or delete. If wired, needs spec. If deleted, ~30 min of cleanup.
**Effort:** 30 min (delete) or multi-session (wire).

### 5. Endless-mode visual entry
**Evidence:** Pool scaling continues past round 10, but per [run-loop-next-steps.md:A5](docs/superpowers/specs/2026-04-14-run-loop-next-steps.md) there's no celebration or header-switch when the player reaches the goal round. The most emotionally-loaded moment in a run has no feedback.

**Fix:** A single one-shot "GOAL REACHED — ENDLESS" overlay on the transition from round = goal → round > goal, and an "∞" badge on `RunRoundCounter` thereafter.
**Effort:** 1–2 hours.

---

## P1 — Polish Pass Before Broader Release

Not blocking, but you'll feel their absence within the first 3 sessions.

### 6. E2E gaps for flux actions and run lifecycle
**Evidence:** [run-flow.spec.ts](packages/client/e2e/run-flow.spec.ts) has `test.skip` for F01–F06 (flux earn + spend flows), R07b–R07d (milestone/discovery life recovery), R09 (endless entry). These are all shippable now that the UI exists — they just need wiring. Regression-test value is high because these flows touch three state machines.
**Effort:** 4–6 hours across all skips.

### 7. No opponent context during a match
**Evidence:** Duel header shows HP bars and nothing else. No "vs AI Tier 3" / "vs Opponent Name" anywhere in draft/forge/duel. Players lose the sense of *who* they beat.
**Effort:** 1 hour.

### 8. Main menu is very spartan
**Evidence:** [MainMenu.tsx](packages/client/src/pages/MainMenu.tsx) is four buttons + a glow. No tagline beyond "Forge. Fight. Prevail.", no art, no "Continue Run", no recent-run summary, no "X recipes discovered" progress teaser. This is the screen people judge the game by in 4 seconds.
**Effort:** 2–4 hours for a non-trivial upgrade.

### 9. `damage-calc.ts` still untested in isolation
**Evidence:** Integration tests cover it but the historically-flagged gap persists. For an alpha this is fine; before any balance pass it'll matter a lot.

### 10. Keyboard nav missing in Draft/Forge
**Evidence:** No Tab/Arrow key support for gem selection or socket placement. Accessibility pass item — not a showcase blocker, but trivial to at least get gem-focus working.

---

## P2 — Nice-To-Have

- Run history / past-run summary
- Gem Blueprint tool link from main UI (currently only at `/tools`)
- Settings content beyond mute
- Sound pass audit (sounds exist but coverage/consistency unverified)
- Collection "my gems" tab (Encyclopedia already absorbed Collection+RecipeBook)

---

## What's Solid and Should Not Be Touched

- **Draft screen** (locked 2026-03-22) — reference quality. Do not modify without explicit approval.
- **Responsive token system** — 6 probes × 13 viewports, 315→1 findings after the April 17 sweep.
- **Engine determinism + test coverage** — the single most reliable foundation to polish on top of.
- **Gateway abstraction** — LocalGateway/RemoteGateway split is clean, gives you AI and PvP without the client knowing which.
- **The combine loop itself** — three-layer system + discovery gating + compound triggers is the game's most distinctive mechanic and it works.

---

## Suggested Order

1. **Day 1:** Items 4 (decide adapt), 5 (endless entry), 7 (opponent context), 1 (minimal onboarding overlay) — half a day total, biggest first-impression lift.
2. **Day 2:** Items 2 (profile persistence), 3 (base item UI) — two hours each, both are "finish-what's-already-there".
3. **Day 3:** Item 6 (un-skip E2E), item 8 (main menu upgrade), version bump to 0.3.0 ("Early Alpha").
4. **Then:** broader showcase.

Nothing on the P0 list is architecturally hard. The systems are in place; the remaining work is wiring + framing the player's first three minutes.
